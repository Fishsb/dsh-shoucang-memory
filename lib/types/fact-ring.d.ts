/**
 * fact-ring.ts — 事实环：**时态失效**（双时间戳 · 2026-09-13）
 *
 * 为什么需要它（三轮讨论里最硬的一条缺口）：
 *   · 权重里的知识**没有时间**。模型推得出逻辑，推不出「现在是什么时候、那之后什么变了」。
 *     记忆相对模型的唯一结构性优势，正是**带时间戳的已发生事实**。
 *   · 况且「库内污染」是「记多了会变笨」的第二病：旧断言不失效、与新断言并存 ⇒
 *     模型在两份矛盾记忆间随机选。原判据只有 `conflict: supersede`（**写的时候判一次**），
 *     之后无人再管 —— 这条缺口就是本件要补的。
 *
 * 与 `lifecycle` 的**正交性**（关键，不许混用）：
 *   `lifecycle`（active/cold/retired）= 值不值得注入（活性）；`validTo` = 还成不成立（真伪）。
 *   混用会犯两类错：把"过时"当"不重要"（继续注入错的事实），或把"不重要"当"不成立"（删掉真的事实）。
 *
 * 形态：纯函数（记录集进、记录集出）；不碰 I/O，可直接单测。
 */
import type { MemRecord } from './record-store.js';
export interface SupersedeInit {
    /** 失效时刻（ISO） */
    at: string;
    /** 因何失效（人读） */
    note?: string;
    /** 被谁取代（记录 id 或一句话） */
    by?: string;
}
/** 该断言在 `at` 时刻是否**成立**（空 validTo = 未失效；坏时间戳 = 失效，fail-closed） */
export declare function isLive(r: MemRecord, at: string): boolean;
/** 标记失效（**幂等**：已失效者拒绝重复标记——重复会让"何时失效"被后来者覆盖） */
export declare function supersede(records: readonly MemRecord[], id: string, s: SupersedeInit): {
    records: MemRecord[];
    ok: boolean;
    reason?: string;
};
/** 恢复有效（撤销误标；幂等：本就有效者拒绝） */
export declare function revive(records: readonly MemRecord[], id: string, at: string): {
    records: MemRecord[];
    ok: boolean;
    reason?: string;
};
export declare function liveRecords(records: readonly MemRecord[], at: string): MemRecord[];
export declare function expiredRecords(records: readonly MemRecord[], at: string): MemRecord[];
export interface FactCensus {
    total: number;
    live: number;
    expired: number;
    /** 带显式前提的条数（仓内判据 `consolidate.promote.premise`：依赖隐含前提者必须写出） */
    withPremise: number;
    /** 时间戳不可解析的条数（**坏标记**——按失效处理，但必须可见） */
    unparseable: number;
}
/**
 * 事实环 KPI（**只从记录集推导**）。
 * 说明：本件只做**时间维**的失效；「前提是否仍成立」的**求值**需要一门前提语言，
 * 属独立课题（仓内现有 `premise` 判据是**写入时**判定），不在此处冒充。
 */
export declare function factCensus(records: readonly MemRecord[], at: string): FactCensus;
/** 记录的前提（写出则返回，未写返回空串） */
export declare function premiseOf(r: MemRecord): string;
/** 已失效清单（人读用：谁因何失效、被谁取代） */
export declare function staleReport(records: readonly MemRecord[]): Array<{
    id: string;
    text: string;
    validTo: string;
    why: string;
    by: string;
}>;
