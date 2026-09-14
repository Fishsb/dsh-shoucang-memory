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
import type { MemRecord } from './record-store.js'

export interface SupersedeInit {
  /** 失效时刻（ISO） */
  at: string
  /** 因何失效（人读） */
  note?: string
  /** 被谁取代（记录 id 或一句话） */
  by?: string
}

/** 时间戳是否可解析（不可解析一律**按失效处理**：真相上宁可保守，不拿坏标记当好标记） */
function parseable(iso: string | undefined): boolean {
  return !iso || Number.isFinite(Date.parse(iso))
}

/** 该断言在 `at` 时刻是否**成立**（空 validTo = 未失效；坏时间戳 = 失效，fail-closed） */
export function isLive(r: MemRecord, at: string): boolean {
  if (!r.validTo) return true
  if (!parseable(r.validTo)) return false
  return Date.parse(r.validTo) > Date.parse(at)
}

/** 标记失效（**幂等**：已失效者拒绝重复标记——重复会让"何时失效"被后来者覆盖） */
export function supersede(records: readonly MemRecord[], id: string, s: SupersedeInit): { records: MemRecord[]; ok: boolean; reason?: string } {
  const i = records.findIndex((r) => r.id === id)
  if (i < 0) return { records: records.slice(), ok: false, reason: `记录不存在（${id}）` }
  const cur = records[i]
  if (cur.validTo) return { records: records.slice(), ok: false, reason: `已失效（${cur.validTo}），不重复标记` }
  const next = records.slice()
  next[i] = {
    ...cur,
    validTo: s.at,
    meta: { ...(cur.meta ?? {}), ...(s.note ? { staleNote: s.note } : {}), ...(s.by ? { supersededBy: s.by } : {}) },
    updatedAt: s.at,
  }
  return { records: next, ok: true }
}

/** 恢复有效（撤销误标；幂等：本就有效者拒绝） */
export function revive(records: readonly MemRecord[], id: string, at: string): { records: MemRecord[]; ok: boolean; reason?: string } {
  const i = records.findIndex((r) => r.id === id)
  if (i < 0) return { records: records.slice(), ok: false, reason: `记录不存在（${id}）` }
  if (!records[i].validTo) return { records: records.slice(), ok: false, reason: '本就有效，无需恢复' }
  const next = records.slice()
  const { validTo: _drop, ...rest } = next[i]
  next[i] = { ...rest, validTo: undefined, updatedAt: at }
  return { records: next, ok: true }
}

export function liveRecords(records: readonly MemRecord[], at: string): MemRecord[] {
  return records.filter((r) => isLive(r, at))
}

export function expiredRecords(records: readonly MemRecord[], at: string): MemRecord[] {
  return records.filter((r) => !isLive(r, at))
}

export interface FactCensus {
  total: number
  live: number
  expired: number
  /** 带显式前提的条数（仓内判据 `consolidate.promote.premise`：依赖隐含前提者必须写出） */
  withPremise: number
  /** 时间戳不可解析的条数（**坏标记**——按失效处理，但必须可见） */
  unparseable: number
}

/**
 * 事实环 KPI（**只从记录集推导**）。
 * 说明：本件只做**时间维**的失效；「前提是否仍成立」的**求值**需要一门前提语言，
 * 属独立课题（仓内现有 `premise` 判据是**写入时**判定），不在此处冒充。
 */
export function factCensus(records: readonly MemRecord[], at: string): FactCensus {
  let live = 0, expired = 0, withPremise = 0, unparseable = 0
  for (const r of records) {
    if (isLive(r, at)) live++
    else expired++
    if (r.meta?.premise) withPremise++
    if (r.validTo && !parseable(r.validTo)) unparseable++
  }
  return { total: records.length, live, expired, withPremise, unparseable }
}

/** 记录的前提（写出则返回，未写返回空串） */
export function premiseOf(r: MemRecord): string {
  return r.meta?.premise ?? ''
}

/** 已失效清单（人读用：谁因何失效、被谁取代） */
export function staleReport(records: readonly MemRecord[]): Array<{ id: string; text: string; validTo: string; why: string; by: string }> {
  return records
    .filter((r) => !isLive(r, '9999-01-01T00:00:00.000Z'))
    .map((r) => ({ id: r.id, text: r.text, validTo: r.validTo ?? '', why: r.meta?.staleNote ?? '', by: r.meta?.supersededBy ?? '' }))
}
