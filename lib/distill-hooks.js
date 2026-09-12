// distill-hooks.ts — 蒸馏「待办清扫（含工具注册）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（11 项）。
//   对外只暴露 createHooksApi(d) —— 返回绑定后的句柄，调用方零感知。
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
export function createHooksApi(dep) {
    return {
        sweepBacklog: (...a) => sweepBacklog(dep, ...a),
    };
}
// ═══ 积压扫尾（2026-09-10 用户拍板：稳健性修复——旧 ctx 失败/重启/错过空闲窗的会话自动补蒸馏）═══
// 候选：**当前 ctx 根内（live）**的会话、水位<内存末事件 seq、且已出「10min 宽限期」（避免与 idle 定时器抢跑/打断用户续聊）。
// ⚠ 覆盖边界（2026-09-11 审查修正注释）：root 之外/重启前已结束且**未被重新载入**的会话不在本链覆盖内——
//   旧注释「重启前已结束的一律补」与现码不符；真要补需会话重新载入，或另立持久会话清单（本档未实现）。
const sweepBacklog = async (dep) => {
    try {
        // 先回流 pending defer 卡（workspace 恢复后直写 devref；周期扫尾也覆盖）
        try {
            await dep.write.flushDeferCards();
        }
        catch { /* 回流失败不阻断扫尾 */ }
        const roots = (dep.ctx.agents && typeof dep.ctx.agents.roots === 'function') ? dep.ctx.agents.roots() : [];
        for (const a of roots) {
            try {
                if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function')
                    continue;
                const origin = a.session && a.session.header && a.session.header.origin;
                if (origin === 'subagent')
                    continue;
                const sid = a.id;
                if (dep.parent.hasActiveSubagents(sid))
                    continue; // 子代理在跑：任务未完，扫尾勿抢蒸（2026-09-10）
                if (dep.st.distilling.has(sid))
                    continue;
                const rec = dep.ds.sessions.get(sid);
                if (rec) {
                    if (rec.state === 'running' || rec.state === 'probing' || rec.state === 'suspect')
                        continue;
                    if (rec.lastEndAt && Date.now() - rec.lastEndAt < dep.config.idleWakeMs)
                        continue; // 仍在宽限期，等 idle 定时器
                }
                // v19：水位走同一双证校验（resolveWatermark）——失效时由 discardWatermark 从当前边界续写并落审计，
                // 扫尾与 idle 通路口径一致（单一实现，勿在此另写判定）；快照取一次供增量比对与后续蒸馏复用。
                const base = dep.wm.resolveWatermark(sid, a);
                // 同蒸馏主路径：`lastSeq = 0` 有两种成因——(a) 真·无水位 ⇒ 全量是唯一选择；
                // (b) 语义 B 主动全量（live 边界 maxSeq < prevSeq，序号空间已重排）⇒ **故意全量，不要"修"**。
                const lastSeq = base ? base.lastSeq : 0;
                const sweepEvents = a.session.snapshotEvents();
                let maxSeq = lastSeq;
                for (const e of sweepEvents) {
                    const s = e.seq ?? 0;
                    if (s > lastSeq && s > maxSeq)
                        maxSeq = s;
                }
                if (maxSeq > lastSeq) {
                    // 跨实例 claim 锁（2026-09-10 实锤：重叠 fiber 的 30s 首扫会同时抢同一积压窗口 → 471aca03 被双蒸馏双写）：
                    // 在途 claim（25min 内）→ 跳过；过期 claim → 覆盖重试；无增量时顺手清理陈旧 claim。
                    // A3：claim 判定已统一到 distillAgent 入口（幂等写入 / 结束释放）——扫尾只做**只读**让位判定，
                    //     不再自己写 claim（否则与入口刚写入的 claim 互斥，补蒸馏将永不发生）。
                    if (dep.write.claimHeld(sid)) {
                        continue;
                    } // 在途，其他 fiber 已接管
                    dep.infra.log(`sweep: ${dep.infra.sidShort(sid)} 水位 ${lastSeq}→${maxSeq} 有未消化增量，补蒸馏`);
                    void dep.agent.distillAgent(a).catch(() => { });
                }
                else {
                    try {
                        unlinkSync(join(dep.kRoot, 'audit', 'claims', sid + '.json'));
                    }
                    catch { /* 无 claim 可清 */ }
                }
            }
            catch { /* 单会话扫尾失败静默 */ }
        }
    }
    catch { /* 扫尾零抛出 */ }
};
//# sourceMappingURL=distill-hooks.js.map