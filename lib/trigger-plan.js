/**
 * **会话集合 → 睡眠窗口**（S-P2a · 2026-09-20）——**归约与判定分离**的单一实现。
 *
 * 判因（真机实测 + 可执行探针，2026-09-19）：巡检与面板**各自**在同一循环里算 `hottest`，
 *   两处口径靠人肉同步；且 `stalled` 被 `continue` 跳过 ⇒ **不参与水位** ⇒ 在册会话**全为** `stalled`
 *   时 `hottest` 恒为初值 0 ⇒ `hottest <= lastDeepSleepAt` **恒真** ⇒ **永不触发**
 *   （实测 09-17 起连续 11 小时零触发行，同期 41 行「探测未决」）。
 *   而 `deepsleep-core` 的状态机图明写 STALLED =「已确认卡住，**不阻塞**」——**代码与自述相反**。
 *   面板同源缺陷：`nextEligibleAt = 0 + idleMs` ⇒ 渲染成 `1970-01-01`（假读数）。
 *
 * 为何抽成纯函数：与 `planTriggerDim` 同一理由 —— 判定长在 `deepSleepCheck` 体内时单测**到不了**
 *   （驱动它要求把机器内部水位倒回过去）；抽出后「全 stalled 也必须触发」可由用例直接钉死。
 *
 * 语义（**唯一归约规则**，巡检与面板共用，不得各写一份）：
 *   · `probing` / `suspect` ⇒ **阻塞**（探测未决，保守不睡），不计水位；
 *   · `stalled` / `running` ⇒ 计水位，取 `lastEventAt`；
 *   · `ended`               ⇒ 计水位，取 `lastEndAt`（停滞计时起点）；
 *   · 无在册会话 ⇒ `hottest` 回落 `lastActivityAt`（全局兜底水位）。
 * ⚠ `stalled` **必须**计水位：它是「确认无输出」而非「还在干活」；把它排除会让整台机器停摆。
 * ⚠ 会话存续过滤（`ctx.agents.get` 查无即删）属 **IO**，留在调用方，不进本函数。
 */
export const planSleepWindow = (sessions, opts) => {
    const counts = { running: 0, ended: 0, probing: 0, suspect: 0, stalled: 0 };
    let seen = 0;
    let hottest = 0;
    for (const rec of sessions) {
        seen++;
        const st = rec.state;
        if (st === 'probing' || st === 'suspect') {
            counts[st]++;
            continue;
        } // 阻塞项：不计水位
        counts[st]++;
        // 水位取值规则：**只有 ended 取 lastEndAt**（停滞计时起点），其余（含 stalled）取 lastEventAt。
        const act = st === 'ended' ? Number(rec.lastEndAt) || 0 : Number(rec.lastEventAt) || 0;
        if (act > hottest)
            hottest = act;
    }
    if (!seen)
        hottest = Number(opts.lastActivityAt) || 0;
    const blocking = counts.probing + counts.suspect;
    return { hottest, blocking, counts, due: blocking === 0 && hottest > (Number(opts.lastDeepSleepAt) || 0) };
};
/**
 * **定时自检节拍判据**（S-P4 · 2026-09-20）——「到期」由**持久事实**判定，定时器只当唤醒节拍。
 *
 * 判因（真机实测）：`distill-hooks` 的自检 effect 每次装配都新设「启动后 3 分钟首跑」，
 *   与 `selfCheckIntervalHours`（6h）周期**并联**。而插件热重载是常态（09-18 单日 28 次）
 *   ⇒ 首跑被反复重新武装，**每挂载必跑一次**：实测 09-19 十次挂载 → 十次 `selfcheck(timer)`，
 *   每组间隔**恰好 179s**（`mount→Δ179s` 十组全同）；09-18 43 次挂载对应 40 次自检。
 *   ⇒ 名义「6 小时周期」实际退化为「一次重载一次」。
 *
 * 修法（**复用既有文件，不新增持久面**）：`selfcheck-latest.json` 由自检**自身每次覆盖写**
 *   （`distill-bank#runSelfCheck` 的 `--out`），其 mtime 即「上次自检时刻」的权威持久来源。
 *   首跑与周期**共用同一判据**：距上次不足周期 ⇒ 不跑。
 *
 * 与 `ingest-admission#lastTurnEndMsOf` **同构**（内存态 → 持久事实），是本仓同一教训的第三次落点。
 *
 * @param nowMs        当前时刻
 * @param lastRunMs    上次自检时刻（`selfcheck-latest.json` 的 mtimeMs；`0` = 从未跑过）
 * @param intervalMs   周期（毫秒；`<= 0` 视为关闭）
 */
export const dueSelfCheck = (nowMs, lastRunMs, intervalMs) => {
    const interval = Number(intervalMs) || 0;
    if (interval <= 0)
        return { due: false, sinceMs: null, reason: 'interval-disabled' };
    const last = Number(lastRunMs) || 0;
    if (last <= 0)
        return { due: true, sinceMs: null, reason: 'never-ran' };
    const since = Number(nowMs) - last;
    if (since >= interval)
        return { due: true, sinceMs: since, reason: 'interval-elapsed' };
    return { due: false, sinceMs: since, reason: 'not-due' };
};
//# sourceMappingURL=trigger-plan.js.map