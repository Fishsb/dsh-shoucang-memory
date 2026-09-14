import type { MemRecord } from './record-store.js';
/** 事件日志文件名（落 `<库根>/.records/` 下） */
export declare const RING_EVENT_FILE = "ring-events.jsonl";
export declare const RING_OPS: readonly ["decision.open", "decision.outcome", "valence.record", "relation.assert", "commitment.open", "commitment.settle", "collision.record", "collision.accept", "collision.land"];
export type RingOp = (typeof RING_OPS)[number];
export interface RingEvent {
    /** 单调序号（重放顺序的唯一依据） */
    seq: number;
    at: string;
    op: RingOp;
    /** 受影响记录 id */
    id: string;
    /** op 专属载荷（**只放重放所需的最小集**，不放冗余正文） */
    data: Record<string, string>;
}
export declare function makeEvent(seq: number, op: RingOp, id: string, data: Record<string, string>, at: string): RingEvent;
/** 事件流 → JSONL（append-only 的落盘形态） */
export declare function serializeEvents(events: readonly RingEvent[]): string;
export declare function parseEvents(text: string): RingEvent[];
export interface ReplayResult {
    records: MemRecord[];
    /** 无法重放的事件（未知 op / 载荷缺失）——**显式记账，不静默丢** */
    errors: string[];
    applied: number;
}
/**
 * **重放**：事件流 → 环记录集。用与写入侧**同一批纯函数**（不另写一套重建逻辑，
 * 否则"重放一致"只证明两套实现写了同样的 bug）。
 * 按 `seq` 升序；单条失败记进 `errors` 并继续（坏事件不该让整条历史不可用）。
 */
export declare function replayEvents(events: readonly RingEvent[]): ReplayResult;
/**
 * **变更推导**：`prev → next` 的 store 差分 → 事件行（**CDC**，写时推导）。
 *
 * 诚实说明：这是"变更日志"而非"事件优先"（events-first）。之所以够用，是因为
 *   `reconcileRing` 会验证「重放这条日志必须能重建当前状态」——**推导错了对账就红**。
 *   载荷一律从记录的 `meta` 逐字取（环记录自带重放所需的全部字段），**不做正文解析**
 *   （按正文反解"承诺内容"这类做法会在文本格式变动时静默走偏）。
 * 未来若要改成 events-first，**日志格式不变**，只把写入路径换成"先写事件、状态由重放派生"。
 */
export declare function eventsFromDiff(prev: readonly MemRecord[], next: readonly MemRecord[], at: string, startSeq?: number, atOf?: (r: MemRecord) => string): RingEvent[];
/** 环记录（`file=''` 且 kind 属环）——对账只比这一子集：索引行由 mirror 管，不归事件流 */
export declare function ringRecordsOf(records: readonly MemRecord[]): MemRecord[];
export interface ReconcileResult {
    ok: boolean;
    storeCount: number;
    replayCount: number;
    missingInReplay: string[];
    extraInReplay: string[];
    differing: string[];
    errors: string[];
}
/**
 * **对账**：store 里的环记录 ⟷ 事件流重放结果。
 * 判据：**事件流重放必须能重建当前状态**（多一条/少一条/内容不同都算不一致）。
 */
export declare function reconcileRing(records: readonly MemRecord[], events: readonly RingEvent[]): ReconcileResult;
