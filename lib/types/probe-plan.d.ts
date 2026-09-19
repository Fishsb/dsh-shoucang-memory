import type { SessState, SessRec } from './deepsleep-core.js';
/** 探测**证据**（采样与存活判定的原始读数；判定所需的一切都在这里）。 */
export interface ProbeEvidence {
    /** 会话存活（`ctx.agents.get` 有值，二次确认后） */
    alive: boolean;
    /** agent 状态非 idle */
    active: boolean;
    /** 本会话仍有**活跃子代理**（父转录不增长的正向进展证据） */
    viaChildren: boolean;
    /** 采样期内转录是否增长 */
    grew: boolean;
    /** 探针不可用（转录定位失败） */
    noTranscript: boolean;
}
/** 探测**结论**（决策表输出：状态迁移 + 计数推进，全部显式）。 */
export interface ProbeOutcome {
    state: SessState;
    probeResult: NonNullable<SessRec['probeResult']>;
    /** 新的 `stallRound`（**只有真"无增长且无任何进展证据"时**才推进） */
    stallRound: number;
    /** 新的 `conflictRound`（证据冲突连续轮次；有进展证据即归零） */
    conflictRound: number;
    /**
     * 是否刷新 `lastEventAt`（= 采纳为"仍在推进"）。
     * 只有**正向进展证据**（转录增长 / 子代理在跑）才刷——否则停滞计时被无限推迟，永远睡不着。
     */
    refreshActivity: boolean;
    /** 结论的人读说明（日志/审计用；不参与判定） */
    note: string;
}
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
export declare const planProbeOutcome: (ev: ProbeEvidence, rounds: {
    stallRound: number;
    conflictRound: number;
}, cfg: {
    confirm: number;
    conflictMax: number;
}) => ProbeOutcome;
