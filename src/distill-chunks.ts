// distill-chunks.ts — 分段蒸馏的**纯工具层**（切段 / 段清单续上下文）
//
// 为什么单独成件：distill-agent.ts 需要 buildEventChunks / manifest* 这一族，
//   它们原本定义在 distill.ts ⇒ 直接 import 会形成 distill → distill-agent → distill 的**环**
//   （本项目零环是硬性质）。本件只依赖 node 内置与 targets，处在依赖图更底层。
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

// ═══ v18 分段蒸馏常量（2026-09-10 拍板「分段蒸馏 + 每段成功即推水位（可续传）+ 段间紧凑清单续上下文」）═══
// 开放可校准：CHUNK_CHARS=单段字符预算（切段只在事件边界、不劈事件），MAX_CHUNKS_PER_RUN=单轮触发至多处理段数
// （超出的段留待下一触发续传——水位停在已处理段的 endSeq）；UI 登记/参数化列为后续档。
export const CHUNK_CHARS = 10000
export const MAX_CHUNKS_PER_RUN = 3

// 蒸馏文本化规则单一实现（buildEventChunks 唯一入口，防口径漂移）：user/message 的每个 text 内容片
// ≤2000 前缀、assistant/chunk block-end 的 text ≤3000 前缀；事件无文本片 → 空数组。
export const textPartsOfEvent = (e: any): string[] => {
  const parts: string[] = []
  if (e.type === 'user/message') {
    const d = (e as any).data || {}
    const arr = Array.isArray(d.content) ? d.content : []
    for (const c of arr) if (c && c.type === 'text' && typeof c.text === 'string') parts.push('[user] ' + c.text.slice(0, 2000))
  } else if (e.type === 'assistant/chunk') {
    const c = (e as any).data && (e as any).data.chunk
    if (c && c.type === 'block-end' && c.block && c.block.type === 'text' && typeof c.block.text === 'string') parts.push('[assistant] ' + c.block.text.slice(0, 3000))
  }
  return parts
}

// ── v18 纯函数分段器契约 ──
export interface DistillChunk { startSeq: number; endSeq: number; text: string }
export interface DistillChunks { chunks: DistillChunk[]; maxSeq: number }

/**
 * buildEventChunks — v18 分段器（2026-09-10）：把 seq>lastSeq 的事件增量按「累计字符超 chunkChars 即切段」切成若干段。
 * - 文本化规则 = 模块级 textPartsOfEvent 单一实现（user text 片 ≤2000、assistant block-end text ≤3000）；
 * - 切段只在事件边界，绝不劈事件；单个事件文本超 chunkChars 时允许单事件成段；
 * - 无文本事件并入当前开放段（只推进其 endSeq，不增字符）；窗口开头、首个文本事件之前的无文本事件不占段，
 *   但恒被水位推进覆盖（蒸馏成功推至首段 endSeq / 跳过推至 maxSeq），不丢事件；
 * - 窗口内完全没有 seq>lastSeq 的事件 → chunks=[]、maxSeq=lastSeq；maxSeq=窗口最末事件 seq；
 * - 不再返回 truncatedTail（2026-09-11 清理：该字段恒 false 且无消费方）；「还有后续段未处理」由调用方按
 *   chunks.length 与本轮段数上限（MAX_CHUNKS_PER_RUN）判定（水位停在已处理段的 endSeq，下一触发续传）。
 */
export function buildEventChunks(agent: any, lastSeq: number, chunkChars: number = CHUNK_CHARS, eventsOf?: any[]): DistillChunks {
  const events = eventsOf || agent.session.snapshotEvents()
  let maxSeq = lastSeq
  const chunks: DistillChunk[] = []
  let cur: { startSeq: number; endSeq: number; parts: string[]; len: number } | null = null
  for (const e of events) {
    const seq = (e as any).seq ?? 0
    if (seq <= lastSeq) continue
    if (seq > maxSeq) maxSeq = seq
    const parts = textPartsOfEvent(e)
    if (!parts.length) { if (cur) cur.endSeq = seq; continue }
    const partLen = parts.reduce((n, p) => n + p.length, 0)
    // 追加成本 = 各文本片长度 + join('\n') 分隔符数（cur 已有内容时每个新片前多一个 \n；开新段时片间分隔 n-1 个）
    const addCost = partLen + (cur ? parts.length : parts.length - 1)
    if (cur && cur.len + addCost > chunkChars) {
      chunks.push({ startSeq: cur.startSeq, endSeq: cur.endSeq, text: cur.parts.join('\n') })
      cur = null
    }
    if (!cur) cur = { startSeq: seq, endSeq: seq, parts: [], len: 0 }
    for (const p of parts) {
      cur.len += p.length + (cur.parts.length > 0 ? 1 : 0)
      cur.parts.push(p)
    }
    cur.endSeq = seq
  }
  if (cur) chunks.push({ startSeq: cur.startSeq, endSeq: cur.endSeq, text: cur.parts.join('\n') })
  return { chunks, maxSeq }
}

// 段间紧凑清单（v18）：manifest 行构造 / 推入（字符上限超出丢最早行）。行=每段成功后追加，
// 只服务「同轮后段查重/合并」；跨轮查重由「相关既有记忆（recallRanked）」承担。
export const manifestLineFor = (endSeq: number, route: string, out: any): string => {
  const seen = new Set<string>()
  const topics: string[] = []
  // appends 目标小节（归一化后）前 12 字去重，最多 3 个
  for (const a of (out && Array.isArray(out.appends)) ? out.appends : []) {
    if (!a || topics.length >= 3) continue
    // v21（§8.1 分裂律）：section 可为树状路径「父/子」——逐段各截 12 字，不整体截断（否则同父下不同子撞键）
    const sec = String(a.section || '').trim().replace(/^[§#]+\s*/, '').replace(/(\/)?\s*[§#]+\s*/g, '$1')
      .split('/').map((s) => s.trim().slice(0, 12)).filter(Boolean).join('/')
    if (!sec || seen.has(sec)) continue
    seen.add(sec)
    topics.push(sec)
  }
  // newIndex 行主题最多 2 个（`[tag] 主题 · …` 取主题前 12 字）
  let niCount = 0
  for (const ni of (out && Array.isArray(out.newIndex)) ? out.newIndex : []) {
    if (!ni || niCount >= 2) continue
    const m = String(ni.line || '').match(/^\[[^\]\s]+\]\s*([^·]+?)\s*·/)
    const theme = m ? m[1].trim().slice(0, 12) : ''
    if (!theme || seen.has(theme)) continue
    seen.add(theme)
    topics.push(theme)
    niCount++
  }
  const n = (out && Array.isArray(out.appends)) ? out.appends.length : 0
  return `[segment ${endSeq}] route=${route} appends=${n} topics=${topics.length ? topics.join(',') : '-'}`
}
export const manifestPush = (manifest: string, line: string, cap: number): string => {
  const next = manifest ? manifest + '\n' + line : line
  if (next.length <= cap) return next
  const ls = next.split('\n')
  let drop = 0
  while (ls.length - drop > 1 && ls.slice(drop).join('\n').length > cap) drop++
  return ls.slice(drop).join('\n')
}

