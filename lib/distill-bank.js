// distill-bank.ts — 蒸馏「库快照与睡眠期自检（bank-git / sleep-selfcheck 子进程）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（3 项）。
//   对外只暴露 createBankApi(d) —— 返回绑定后的句柄，调用方零感知。
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryLibRoot, dshHome } from './targets.js';
import { runNode } from './distill-proc.js';
import { writeSleepReportFromLedger } from './sleep-report.js';
// 待认领队列（单一实现）：周期巡检把新缺陷幂等登记成卡（与写侧回退队列同源）
import { registerDeficits } from './pointer-deficits.js';
export function createBankApi(dep) {
    return {
        bankGitScript,
        runSelfCheck: (...a) => runSelfCheck(dep, ...a),
        bankSnapshot: (...a) => bankSnapshot(dep, ...a),
    };
}
const bankGitScript = join(memoryLibRoot(), 'scripts', 'bank-git.mjs');
/** v2.2 睡眠期/定时自检（**单一实现**）：6 项检测 + 白名单窄动作。由两条路径调用——
 *  ① 深睡完成之后（宿主义务：子代理只归纳）② 计时器周期性（深睡触发严苛，靠它保证"想不起来也会做"）。 */
const runSelfCheck = async (dep, trigger) => {
    try {
        const scScript = join(memoryLibRoot(), 'scripts', 'sleep-selfcheck.mjs');
        if (!existsSync(scScript))
            return null;
        const scOut = join(dep.kRoot, 'audit', 'selfcheck-latest.json');
        const scArgs = ['--out', scOut, '--trigger', trigger, ...(dep.config.selfCheckRepo ? ['--repo', String(dep.config.selfCheckRepo)] : [])];
        await runNode(dep.config.nodeBin, scScript, scArgs, { env: { MEMORY_ROOT: memoryLibRoot() }, timeout: 180000 });
        const sc = JSON.parse(readFileSync(scOut, 'utf8'));
        const adjIds = (sc.adjustments || []).map((a) => a.id);
        // 台账 check.sleep **由脚本自己写**（三条触发路径同一处留痕）；此处只负责白名单动作与日志
        dep.infra.log(`selfcheck(${trigger}): 裁决 ${sc.verdict}${adjIds.length ? ' · 建议调整 ' + adjIds.join(',') : ''}`);
        // S2S3 册四（2026-09-19）：**睡眠汇报**（提存/压缩/标记/统计四段 + 影响账）。
        //   装配方式 = 读台账**末条 deep-sleep 行**（解耦：不把一轮的十几个字段穿过装配层，也不撑破
        //   `runDeepSleep` 的函数跨度上限）；同日多轮 ⇒ 追加不覆盖（"日历式永不删除"）。
        //   失败**不阻断自检**（汇报是增量产物，不是判据）。
        try {
            const rep = writeSleepReportFromLedger({ kRoot: dep.kRoot, bankRoot: memoryLibRoot(), date: new Date().toISOString().slice(0, 10) });
            if (rep.ok)
                dep.infra.log(`sleep-report: 汇报落盘 ${rep.reportFile}（问题标记 ${rep.issues} 条）`);
            else
                dep.infra.log(`sleep-report: 暂无睡眠轮可汇报（${rep.reason}）`);
        }
        catch (e) {
            dep.infra.log(`sleep-report: 汇报失败（不阻断自检）: ${String(e?.message || e).slice(0, 100)}`);
        }
        // 指针缺陷**周期登记闭环**（2026-09-19 · 指针供给 §4-3/§12）：把「地址有效、正文为空」的新缺陷
        //   （空壳落点 / 全库空壳标题）幂等登记成待认领卡 ⇒ 与写侧 `-knowledge-defer-` 同一队列、同一命名实现。
        //   边界：**不自动建锚、不自动回填**（方案 §3「不做」）——登记只保证"漏掉的可见、可捞"。
        //   挂在这里的理由：本函数已是**维护链**（定时 6h + 深睡后）的唯一自检入口，且自带 kRoot/bankRoot 两参数，
        //   无需新增定时器、无需改动装配面（I1/I2 零压力）。
        try {
            const reg = registerDeficits({ kRoot: dep.kRoot, bankRoot: memoryLibRoot() });
            dep.infra.log(`pointer-deficits: 巡检 ${reg.scanned} 条缺陷 · 新登记 ${reg.written} · 已存在 ${reg.skipped}`);
        }
        catch (e) {
            dep.infra.log(`pointer-deficits: 登记失败（不阻断自检）: ${String(e?.message || e).slice(0, 100)}`);
        }
        if (dep.config.selfCheckAutoRollback === true) {
            const adj = (sc.adjustments || []).find((a) => a.id === 'rollback-scoreWeights' && a.action);
            if (adj?.action) {
                const cfgPath = join(dshHome(), 'suite', 'scheduler.json');
                try {
                    copyFileSync(cfgPath, cfgPath + '.bak-selfcheck');
                }
                catch { /* 首次可能不存在 */ }
                let cur = {};
                try {
                    cur = JSON.parse(readFileSync(cfgPath, 'utf8'));
                }
                catch { /* */ }
                writeFileSync(cfgPath, JSON.stringify({ ...cur, [adj.action.key]: adj.action.value }, null, 2), 'utf8');
                dep.infra.ledger({ type: 'adjust.rollback', domain: 'consolidate', trigger, key: adj.action.key, value: adj.action.value, why: 'selfcheck R-3（shadow-sim.flipReady=false）', needsReload: true });
                dep.infra.log(`selfcheck(${trigger}): 白名单回滚 ${adj.action.key}=${adj.action.value}（已备份 .bak-selfcheck；需重载生效）`);
            }
        }
        return { verdict: sc.verdict, adjustments: adjIds };
    }
    catch (e) {
        dep.infra.log(`selfcheck(${trigger}) 失败（不影响主流程）：${String(e.message).slice(0, 80)}`);
        return null;
    }
};
/** v2 库 git 版本化快照（写后触发；失败静默——版本化是增强不是主流程依赖） */
const bankSnapshot = async (dep, label) => {
    if (dep.config.bankGit === false)
        return;
    try {
        if (!existsSync(bankGitScript))
            return;
        await runNode(dep.config.nodeBin, bankGitScript, ['--message', `memory: ${label} @ ${new Date().toISOString().slice(0, 19)}`], { env: { MEMORY_ROOT: memoryLibRoot() }, timeout: 20000 });
    }
    catch { /* 静默 */ }
};
//# sourceMappingURL=distill-bank.js.map