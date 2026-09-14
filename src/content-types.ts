// content-types.ts — 内容类型契约（S0 · 2026-09-14）
//
// 由来：内容类型的定义此前**裂成三处且互不引用** —— `criteria.json#carriers.tags` 管注入面、
//   `record-store#kindOfLine` 管 Record kind、`targets` 管 md 行形态。于是「调整内容类型」这件事
//   在架构里**没有落点**（说不出该改哪个文件、改完谁受影响）。本模块把三者的关系收口为
//   **唯一可机检的契约**：数据源 = `criteria.json#contentTypes`，经 `gen-criteria` 投影到
//   `criteria.generated.ts` 的 `CONTENT_TYPES`。
//
// 边界（照 `supply-assembly.ts` 头注先例）：本件**只做查询** —— 不选择、不打分、不装配、不写库；
//   那些归消费侧模块。本件只回答一个问题：
//     **某类信息由谁产、存成什么、被哪一层在什么时机按什么判据消费、是否真的可达。**
//
// 零依赖：只读生成物（同层 L0），无 IO、无副作用、无新依赖。
import { CONTENT_TYPES, type ContentType } from './criteria.generated.js'

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
  criterion: string
  /** 实现所在（供人读与机检核对） */
  impl: string
  /** 该通路当前是否真的接进**运行时注入面**（false = 代码在但输出不到） */
  wired: boolean
}

export const CONSUMER_CHANNELS: readonly ConsumerChannel[] = [
  { criterion: 'always', impl: 'src/targets.ts#indexRowInLayer（经 panel-shared#readCarrier → systemPrompt 常驻）', wired: true },
  { criterion: 'relevance', impl: 'src/targets.ts#recallIndex + src/vec.ts#recallRanked（经 panel-shared 动态面 / mcl 慢通道）', wired: true },
  { criterion: 'situation-key', impl: 'src/ring-supply.ts#ringCandidates（经 panel-shared#situationLinesOf → 情境槽）', wired: true },
  { criterion: 'due', impl: 'src/ring-supply.ts#dueSoon（**已到期/临近者单列一组**，组序仅次于情境命中 —— S4-4 主动提）', wired: true },
  { criterion: 'none', impl: '（无消费）', wired: true },
]

export interface ContentTypesApi {
  /** 全部信息类型（不含结构性记录） */
  all(): Array<{ id: string; type: ContentType }>
  /** 按 Record kind 反查类型（可多对一） */
  byKind(kind: string): ContentType[]
  /** 按消费层筛选（outer 任务级 / middle 行动级 / inner 认知级） */
  byLayer(layer: string): Array<{ id: string; type: ContentType }>
  /** 某判据对应的通路（未登记 ⇒ undefined） */
  channelOf(criterion: string): ConsumerChannel | undefined
  /** 契约标 `reachable:false` 的类型及原因 */
  unreachable(): Array<{ id: string; why: string }>
  /**
   * **假绿检测**：契约声明 `reachable:true`，但其判据对应的通路**未接线**或**未登记**。
   * 机检与面板共用此出口 —— 输出非空即说明契约与运行时不符。
   */
  unwired(): Array<{ id: string; criterion: string; impl: string }>
}

export function createContentTypesApi(): ContentTypesApi {
  const entries = Object.entries(CONTENT_TYPES.types)
  const channelSet = new Map(CONSUMER_CHANNELS.map((c) => [c.criterion, c]))
  return {
    all: () => entries.map(([id, type]) => ({ id, type })),
    byKind: (kind) => entries.filter(([, t]) => t.recordKind.includes(kind)).map(([, t]) => t),
    byLayer: (layer) => entries.filter(([, t]) => t.consumer.layer === layer).map(([id, type]) => ({ id, type })),
    channelOf: (criterion) => channelSet.get(criterion),
    unreachable: () => entries.filter(([, t]) => !t.reachable).map(([id, t]) => ({ id, why: t.why || '(未写原因)' })),
    unwired: () =>
      entries
        .filter(([, t]) => t.reachable)
        .map(([id, t]) => ({ id, criterion: t.consumer.criterion, ch: channelSet.get(t.consumer.criterion) }))
        .filter((x) => !x.ch || !x.ch.wired)
        .map((x) => ({ id: x.id, criterion: x.criterion, impl: x.ch?.impl || '(未登记通路)' })),
  }
}

/** 结构性记录 kind（不注入）—— 供机检的枚举完备性断言使用 */
export function structuralKinds(): string[] {
  return Object.keys(CONTENT_TYPES.structural)
}
