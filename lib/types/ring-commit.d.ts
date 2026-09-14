/** 产出通道名（**唯一声明处**；判据段与统计都从这里派生，不另立名单） */
export declare const RING_CHANNELS: readonly ["decisions", "commitments", "relations", "valences", "outcomes", "episodes"];
export type RingChannel = (typeof RING_CHANNELS)[number];
export interface RingCommitDeps {
    log(m: string): void;
    audit(o: Record<string, unknown>): void;
}
export interface RingCommitResult {
    decisions: number;
    commitments: number;
    relations: number;
    valences: number;
    /** 后果回收条数（**本环的核心**：没有回收，经历永远只是日志） */
    outcomes: number;
    /** 叙事/情景条数（author 层：把经历整合成带时间的因果短叙事） */
    episodes: number;
    /** 写入的环事件条数（>0 才表示 store 真被改过） */
    events: number;
    ok: boolean;
    reason?: string;
}
/** 通道计数（供 `enqueued` 统计与审计；**不落库**，纯读） */
export declare function countRingChannels(out: unknown): Record<RingChannel, number>;
/**
 * 把模型输出的通道落成环记录（**幂等性由各环模块自身守**：同文本同 id、重复结清被拒）。
 * `root` = 记忆库根（`memoryLibRoot()`）；`at` = 判定时刻（必填，不吃隐式 now）；
 * `source` = 产线标签（`distill` / `deep-sleep`），只进审计，不参与语义。
 */
export declare function commitRingChannels(d: RingCommitDeps, root: string, out: unknown, at: string, source?: string): RingCommitResult;
