import { type ContentType } from './criteria.generated.js';
/**
 * 消费通路登记（`criterion` → 运行时实现）。`reachable` 判定以此为准；
 * **新增契约判据必须在此登记**，否则机检当场 FAIL（防"声明了但没通路"）。
 *
 * `wired` 的语义是**输出是否真的抵达注入面**，不是"模块被 import 过"——
 *   仓内教训：`supply-assembly` 曾被记「已接线」，实则其输出只进 `/inject/stats` 诊断面
 *   （`check-arch-sync.mjs` 的"接线"口径只要求被调用）。本字段防的正是这类假绿。
 */
export interface ConsumerChannel {
    /** 判据标识（与契约 `consumer.criterion` 对齐） */
    criterion: string;
    /** 实现所在（供人读与机检核对） */
    impl: string;
    /** 该通路当前是否真的接进**运行时注入面**（false = 代码在但输出不到） */
    wired: boolean;
}
export declare const CONSUMER_CHANNELS: readonly ConsumerChannel[];
export interface ContentTypesApi {
    /** 全部信息类型（不含结构性记录） */
    all(): Array<{
        id: string;
        type: ContentType;
    }>;
    /** 按 Record kind 反查类型（可多对一） */
    byKind(kind: string): ContentType[];
    /** 按消费层筛选（outer 任务级 / middle 行动级 / inner 认知级） */
    byLayer(layer: string): Array<{
        id: string;
        type: ContentType;
    }>;
    /** 某判据对应的通路（未登记 ⇒ undefined） */
    channelOf(criterion: string): ConsumerChannel | undefined;
    /** 契约标 `reachable:false` 的类型及原因 */
    unreachable(): Array<{
        id: string;
        why: string;
    }>;
    /**
     * **假绿检测**：契约声明 `reachable:true`，但其判据对应的通路**未接线**或**未登记**。
     * 机检与面板共用此出口 —— 输出非空即说明契约与运行时不符。
     */
    unwired(): Array<{
        id: string;
        criterion: string;
        impl: string;
    }>;
}
export declare function createContentTypesApi(): ContentTypesApi;
/** 结构性记录 kind（不注入）—— 供机检的枚举完备性断言使用 */
export declare function structuralKinds(): string[];
