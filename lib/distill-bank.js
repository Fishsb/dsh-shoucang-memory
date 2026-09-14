// distill-bank.ts — 蒸馏「库快照与睡眠期自检（bank-git / sleep-selfcheck 子进程）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（3 项）。
//   对外只暴露 createBankApi(d) —— 返回绑定后的句柄，调用方零感知。
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryLibRoot, dshHome } from './targets.js';
import { runNode } from './distill-proc.js';
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