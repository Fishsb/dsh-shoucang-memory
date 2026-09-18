// ingest-admission.ts — 册二（2026-09-19）：**蒸馏准入判定单一实现**（触发宽 · 准入严）
//
// 判因（真机实测）：「该不该现在蒸」原先散在**三处**、口径各不相同：
//   · `distill-hooks.ts#sweepBacklog`：查内存 `sleep.sessions`（state + 10min 宽限期）+ claim
//   · `distill-agent.ts#distillAgent`：查 `distilling`（在途）+ `agent.status` + 活跃子代理
//   · `distill-agent.ts#runDistillNow`：只查 `distilling`（无宽限、无子代理判定）
//   后果实测（2026-09-18/19）：插件热重载 **220 次**（09-18 单日 28 次），而 `sleep.sessions` 是
//   **每实例新建的 Map**（`deepsleep.ts:27`）⇒ 重载后 `rec` 为空 ⇒ 扫尾的宽限期整段跳过
//   ⇒ **每次重载后 30 秒必蒸一次**（实测 5/5 配对：21:14:08→21:14:36 · 21:22:01→21:22:28 …）。
//
// 本件把「准入」收成**一个纯函数**（可脱离宿主单测）+ 一个**静默判据**（证据收集，依赖注入）：
//   · 触发面可以宽（任何事件都武装定时器，幂等且便宜）；
//   · 准入面必须窄且**唯一**（三处调用点共用本件，`test-ingest-admission.mjs` 用符号级断言锁住）。
//
// 为什么单独成件（不并进 `deepsleep-core.ts`）：后者是**判据内核**（零依赖、纯常量/纯函数），
//   而静默判据要拿 `ctx`/父会话句柄（依赖注入形态）；且本仓有"受冻结棘轮约束时单独成件"的先例
//   （`injection-playbook.ts` / `recall-diagnosis.ts` / `dynamic-select.ts`）。判据本体仍是纯函数。
/**
 * 会话是否**静默**（= 无在途工作）——「空闲」的正确定义。
 *
 * 为什么不用「最后一次 turn/end 之后 N 分钟」当"空闲"：自主轮次（子代理交活唤醒宿主、goal 轮、
 *   auto-continue 续跑）**同样产生 `turn/end(completed)`**（真机实测：`308db868` 18 轮里 17 轮
 *   prompt 为空、`69471309` 80/122、`6be5ac2e` 71/100），故"事件计数"不等于"用户停手"。
 * 本判据的三态里 **`unknown` 不是 busy**：取不到证据**不阻断**（按时间兜底），但调用方**必须落审计**
 *   （仓内纪律：静默失效最可怕；`unknown` 要与 `quiet` 可分辨）。
 */
export const quiescenceOf = (d, agent) => {
    try {
        const sid = agent && agent.id;
        if (!sid)
            return { state: 'unknown', why: 'no-sid' };
        if (d.hasActiveSubagents(sid))
            return { state: 'busy', why: 'active-subagent' };
        const live = (() => { try {
            return d.ctx && d.ctx.agents && typeof d.ctx.agents.get === 'function' ? d.ctx.agents.get(sid) : null;
        }
        catch {
            return null;
        } })();
        const status = (live && live.status) || (agent && agent.status);
        if (!status)
            return { state: 'unknown', why: 'status-unavailable' };
        if (status !== 'idle')
            return { state: 'busy', why: `status=${status}` };
        // inbox 排队（best-effort；取不到即不阻断，也不冒充已验）
        const queued = (() => {
            try {
                const q = live && (live.inbox || live.pending || live.pendingMessages);
                if (Array.isArray(q))
                    return q.length;
                if (q && typeof q.size === 'number')
                    return q.size;
                return null;
            }
            catch {
                return null;
            }
        })();
        if (typeof queued === 'number' && queued > 0)
            return { state: 'busy', why: `inbox=${queued}` };
        return { state: 'quiet', why: 'idle' };
    }
    catch {
        return { state: 'unknown', why: 'probe-failed' };
    }
};
/** 会话**最后一次 `turn/end` 的毫秒时间戳**（0 = 取不到）——宽限期的**持久来源**。
 *  为什么不用内存 `sleep.sessions.lastEndAt`：它是每实例新建的 Map，热重载即清零
 *  （这正是「重载后 30s 必蒸」的机制）。会话日志本身是持久事实源，永远可推导。 */
export const lastTurnEndMsOf = (agent) => {
    try {
        const evs = agent && agent.session && typeof agent.session.snapshotEvents === 'function' ? agent.session.snapshotEvents() : null;
        if (!Array.isArray(evs))
            return 0;
        for (let i = evs.length - 1; i >= 0; i--) {
            const e = evs[i];
            if (e && e.type === 'turn/end') {
                const t = Number(e.time);
                if (t > 0)
                    return t;
            }
        }
        return 0;
    }
    catch {
        return 0;
    }
};
/**
 * 准入决策表（单一实现）。**顺序即优先级**：便宜的判定在前，且"无增量"永远先短路。
 * 判据语义：
 *   · `no-increment`：`maxSeq <= lastSeq` ⇒ 没有可蒸的东西（最便宜，先判）
 *   · `snapshot-unavailable-circuit-break`：G-20 熔断（连续 N 轮拿不到快照 ⇒ 不再整窗重蒸烧 LLM）
 *   · `claim-held`：其他实例接管中（跨实例防双蒸）
 *   · `not-quiet`：会话**不静默**（在途：子代理/非 idle/inbox 排队）⇒ 让位，等下轮
 *   · `grace-period`：静默但距上次轮次结束不足 `idleWakeMs`（**仅手动触发可豁免**）
 *   · `ok` / `manual` / `unknown-quiescence-fallback`（三态里的 unknown：按时间兜底，**落审计**不静默）
 */
export const planIngestAdmission = (i) => {
    const lastSeq = Number(i.lastSeq) || 0;
    const maxSeq = Number(i.maxSeq) || 0;
    const quiet = i.quiet === 'busy' || i.quiet === 'quiet' ? i.quiet : 'unknown';
    const since = i.sinceLastEndMs === null || i.sinceLastEndMs === undefined ? null : Number(i.sinceLastEndMs);
    const idle = Math.max(1, Number(i.idleWakeMs) || 1);
    const evidence = `quiet=${quiet} sinceLastEndMs=${since === null ? 'unknown' : since} idleWakeMs=${idle}`;
    if (maxSeq <= lastSeq)
        return { run: false, reason: 'no-increment', evidence };
    if (Number(i.snapshotStreak) >= Number(i.circuitBreakN))
        return { run: false, reason: 'snapshot-unavailable-circuit-break', evidence };
    if (i.claimHeld)
        return { run: false, reason: 'claim-held', evidence };
    if (quiet === 'busy')
        return { run: false, reason: 'not-quiet', evidence };
    if (!i.manual && since !== null && since < idle)
        return { run: false, reason: 'grace-period', evidence };
    if (i.manual)
        return { run: true, reason: 'manual', evidence };
    if (quiet === 'unknown')
        return { run: true, reason: 'unknown-quiescence-fallback', evidence };
    return { run: true, reason: 'ok', evidence };
};
//# sourceMappingURL=ingest-admission.js.map