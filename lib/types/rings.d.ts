import type { MemRecord, RecordKind } from './record-store.js';
/** 五个内容环 + none（结构/空白/散文——无生命周期语义，不进任何环） */
export declare const RINGS: readonly ["fact", "decision", "relation", "association", "value", "none"];
export type Ring = (typeof RINGS)[number];
/** kind → 环（**唯一声明处**） */
export declare const RING_OF_KIND: Readonly<Record<RecordKind, Ring>>;
/**
 * 已登记环但**尚无 kind** 的例外（显式申报，非静默放过）。
 * 棘轮用法：落地后必须从本表删除；`stalePendingRings()` 会抓「已落 kind 却仍申报 pending」。
 * 当前为空 —— 五个环全部已落 kind。
 */
export declare const RING_PENDING: readonly Ring[];
/**
 * 免频率门的环：**只出现一次也成立**。
 * 依据（三轮讨论的核心结论）：以频率为门槛的判据（≥3 条痕迹 / ≥2 次）**结构性**排除一次性洞见，
 * 而洞察的定义就是只出现一次。故这些环的成立判据是「跨度/价态」，不是「重现次数」。
 */
export declare const FREQUENCY_FREE_RINGS: readonly Ring[];
export declare function ringOfKind(kind: RecordKind): Ring;
export declare function kindsOfRing(ring: Ring): RecordKind[];
/** 未登记环归属的 kind（应为空；非空即机检 FAIL） */
export declare function uncoveredKinds(): RecordKind[];
/** 已登记环却无 kind 且未申报为 pending 的环（应为空；非空即机检 FAIL） */
export declare function emptyUndeclaredRings(): Ring[];
/**
 * **陈旧申报**：已落 kind 却仍留在 `RING_PENDING` 的环（棘轮：落地后必须删除申报，否则 FAIL）。
 * 没有这条，"显式申报"会退化成一张永不清空的豁免名单。
 */
export declare function stalePendingRings(): Ring[];
export declare function isFrequencyFree(ring: Ring): boolean;
/**
 * 环 → 其 **KPI 产出者**（`check-ring-coverage` 会**真去 lib 里 import 并断言函数存在**）。
 *
 * 为什么把它写成注册表：**加了环却不给 KPI ＝ 机制没有仪表盘**。本项目已有实证——快通道曾恒为 0
 * 而无人知晓（`fast=0` 崩过两次才被人肉发现）。故「每个环必须有一个可机检的 KPI 函数」进硬门。
 */
export declare const RING_KPI: Readonly<Record<Exclude<Ring, 'none'>, {
    module: string;
    fn: string;
    what: string;
}>>;
/** 环分布统计（KPI：可从记录集直接推导，不需要另立计数器） */
export declare function ringCensus(records: readonly MemRecord[]): Record<Ring, number>;
