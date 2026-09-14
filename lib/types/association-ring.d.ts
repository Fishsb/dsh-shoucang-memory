import type { MemRecord } from './record-store.js';
/** 锚点的 § 小节（无 § 时取整串）——跨度门与去重的口径 */
export declare function sectionOf(anchor: string): string;
/**
 * 锚点是否**有地址**（带 `§` 小节）。
 * ⚠ 为什么必须要求：无 § 的锚点（画像行/裸正文）其 `sectionOf` 会退化成整串正文 ⇒
 *   任意两行都能判"不同 §"，**跨度门形同虚设**（2026-09-13 真库跑越界召回时实测暴露：
 *   候选里混进画像行，span 恒等于满分 2.999）。故：无地址的两行**不算碰撞、也不进候选池**。
 */
export declare function hasSection(anchor: string): boolean;
/**
 * 记录的**规范锚点**：优先取指针（`notes/x.md §节`），无指针退回正文。
 * ⚠ 这是碰撞去重的口径来源 —— `recordCollision` 存下的 `pairKey` 与 `serendipityPairs` 的排除集
 *   必须用**同一把尺子**，否则"已撞过的对"会被反复推荐（本模块初版就踩过这个错位）。
 */
export declare function anchorOfRecord(r: MemRecord): string;
export interface CollisionInit {
    /** 锚点 A（如 `notes/lessons.md §假绿与实证`） */
    a: string;
    /** 锚点 B */
    b: string;
    /** 在什么任务语境下撞出来的 */
    context: string;
    /** 撞出来的东西（可选：**本体不入库为独立条目**，只随碰撞记录留一句，便于人读复核） */
    insight?: string;
    /** 当时被认可了吗（true=认可 / false=否定 / 省略=未表态） */
    accepted?: boolean;
    evidence?: string;
    at: string;
    /** 显式 id（事件重放以事件为身份权威：载荷缺字段也不改身份） */
    id?: string;
    /** 显式正文覆盖（legacy 记录的最后手段：老版本正文有、meta 无 payload 时用） */
    text?: string;
}
/**
 * 记一条碰撞。**跨度门（硬门）**：两锚点都必须非空、且 **§ 小节不同** —— 同一主题内的归纳
 * 是"压缩"不是"碰撞"（后者已由巩固域的 principles 通道覆盖）。
 */
export declare function recordCollision(records: readonly MemRecord[], c: CollisionInit): {
    records: MemRecord[];
    ok: boolean;
    id?: string;
    reason?: string;
};
/**
 * 按**记录 id** 记一次碰撞（推荐入口）：锚点由 `anchorOfRecord` 推导，
 * 保证与 `serendipityPairs` 的排除集同尺子（否则已撞过的对会被反复推荐）。
 */
export declare function collideRecords(records: readonly MemRecord[], aId: string, bId: string, opts: {
    context: string;
    insight?: string;
    accepted?: boolean;
    evidence?: string;
    at: string;
}): {
    records: MemRecord[];
    ok: boolean;
    id?: string;
    reason?: string;
};
/** 记/改认可状态（价态） */ export declare function markAccepted(records: readonly MemRecord[], id: string, accepted: boolean, at: string): {
    records: MemRecord[];
    ok: boolean;
    reason?: string;
};
export interface LandInit {
    landed: boolean;
    note?: string;
    at: string;
}
/**
 * **落地回收**（本环的后果账）：那次碰撞后来真的用上了吗。
 * 幂等：已登记落地的**拒绝重复登记**（与决策环 `collectOutcome`、关系环 `settleCommitment` 同规格）。
 */
export declare function landCollision(records: readonly MemRecord[], id: string, l: LandInit): {
    records: MemRecord[];
    ok: boolean;
    reason?: string;
};
/** 待回收队列：尚未登记落地结论的碰撞（「想不起来回看」的防线） */
export declare function openCollisions(records: readonly MemRecord[]): MemRecord[];
export interface AssociationCensus {
    collisions: number;
    accepted: number;
    denied: number;
    unstated: number;
    landed: number;
    landedRate: number;
    pending: number;
    /** 已复用的碰撞对数（hits>0 ⇒ 同一对撞过多次） */
    reused: number;
}
export declare function associationCensus(records: readonly MemRecord[]): AssociationCensus;
export interface AnchorRef {
    id: string;
    text: string;
    section: string;
    file: string;
    /** 冷度：距最后命中的天数（从未命中给一个大数，表示"久未被想起"） */
    cold: number;
}
export interface SerendipityPair {
    a: AnchorRef;
    b: AnchorRef;
    /** 跨度：不同文件额外计分（越界程度的人读刻度） */
    span: number;
    why: string;
}
/**
 * **越界召回**（读侧独立通道）：不按相关性排序，按「§ 跨度 + 冷度」挑**候选碰撞对**。
 *
 * 为什么必须独立：注入打分是 `α_rel·relevance + …`，α_rel 越强越不可能发生越界碰撞——
 *   精度与惊喜在数学上是对立的，改 α 解决不了，只能另开一条通道（本函数据此不读任何 relevance 分）。
 * 确定性：给定 `seed` 结果稳定（可用于回归测试），不依赖随机数。
 */
export declare function serendipityPairs(records: readonly MemRecord[], opts?: {
    seed?: string;
    k?: number;
    maxPerSection?: number;
    now?: string;
}): SerendipityPair[];
