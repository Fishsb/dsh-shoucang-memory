/**
 * **探测结论决策表**（S-P2b · 2026-09-20）——判据自 `probeSession` 的 8 个命令式 if 出口外移。
 *
 * 判因（真机实测 + 可执行探针，2026-09-19）：`conflict`（状态称活跃但连续零输出）分支
 *   **排在 `stallRound+1` 之前且直接 return** ⇒ `stallRound` **永不推进** ⇒ 状态回写成 `suspect`、
 *   下轮巡检对 `suspect` 再探、再 conflict ⇒ **活锁**。实测 `28f9f094` **连续 23 次 conflict、
 *   跨 11 小时**，该窗口「探测未决」41 行、`deep sleep: 触发` **0 行**（整机不睡）。
 *
 * 判据口径（**顺序即优先级**；与既有取向一致：探针不可用/异常一律"按停滞处理 ⇒ 正常睡"）：
 *   ① 探针不可用 ⇒ `no-transcript / ended`
 *   ② 转录增长 ⇒ `long-run / running`（**唯一刷新活动**的进展证据之一）
 *   ③ 子代理在跑 ⇒ `long-run / running`（父等待子代理，正向进展；**必须排在 conflict 之前**）
 *   ④ 未存活 ⇒ `exit / ended`（异常退出，不阻塞）
 *   ⑤ 状态活跃无增长 ⇒ `conflict`：**计数有界** —— 连续满 `conflictMax` 轮即转 `stalled`（不阻塞）
 *   ⑥ 否则 ⇒ `stall` 需连续 `confirm` 轮确认，未满则 `suspect / suspect`
 * ⚠ ③ 排在 ⑤ 之前是**既有实测结论**（"父等子代理"被误判 conflict 噪声），不得回退。
 */
export const planProbeOutcome = (ev, rounds, cfg) => {
    const sr = Math.max(0, Math.floor(Number(rounds.stallRound) || 0));
    const cr = Math.max(0, Math.floor(Number(rounds.conflictRound) || 0));
    const confirm = Math.max(1, Math.floor(Number(cfg.confirm) || 1));
    const conflictMax = Math.max(1, Math.floor(Number(cfg.conflictMax) || 1));
    if (ev.noTranscript) {
        return { state: 'ended', probeResult: 'no-transcript', stallRound: 0, conflictRound: 0, refreshActivity: false, note: '探针不可用 ⇒ 无法确认为长任务，按停滞处理（正常睡）' };
    }
    if (ev.grew) {
        return { state: 'running', probeResult: 'long-run', stallRound: 0, conflictRound: 0, refreshActivity: true, note: '检出输出增长 ⇒ 正常长任务' };
    }
    if (ev.viaChildren) {
        return { state: 'running', probeResult: 'long-run', stallRound: 0, conflictRound: 0, refreshActivity: true, note: '父转录无增长但子代理仍在跑 ⇒ 正常长任务' };
    }
    if (!ev.alive) {
        return { state: 'ended', probeResult: 'exit', stallRound: 0, conflictRound: 0, refreshActivity: false, note: '会话已退出（二次确认）' };
    }
    if (ev.active) {
        /* ★ S-P2b 核心：**conflict 有界**。原实现 `rec.state='suspect'; return` 不推进任何计数 ⇒ 活锁。
         *   依据与"探针不可用/异常一律按停滞处理"同一取向：反复拿不到**输出证据**的争议，
         *   不该无限期独占巡检（真机 11 小时零触发即代价）。 */
        const c = cr + 1;
        if (c >= conflictMax) {
            return { state: 'stalled', probeResult: 'stall', stallRound: sr + 1, conflictRound: c, refreshActivity: false, note: `证据冲突连续 ${c}/${conflictMax} 轮 ⇒ 按卡住处理（不阻塞睡眠，请人工确认）` };
        }
        return { state: 'suspect', probeResult: 'conflict', stallRound: sr, conflictRound: c, refreshActivity: false, note: `证据冲突第 ${c}/${conflictMax} 轮 ⇒ 转 suspect 复核` };
    }
    const srNext = sr + 1;
    if (srNext >= confirm) {
        return { state: 'stalled', probeResult: 'stall', stallRound: srNext, conflictRound: 0, refreshActivity: false, note: `连续 ${srNext}/${confirm} 轮无输出增长 ⇒ 确认卡住（不阻塞睡眠）` };
    }
    return { state: 'suspect', probeResult: 'suspect', stallRound: srNext, conflictRound: 0, refreshActivity: false, note: `第 ${srNext}/${confirm} 次无增长 ⇒ suspect，下轮复核` };
};
//# sourceMappingURL=probe-plan.js.map