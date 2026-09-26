// distill-chunks.ts — 分段蒸馏的**纯工具层**（切段 / 段清单续上下文）
//
// 为什么单独成件：distill-agent.ts 需要 buildEventChunks / manifest* 这一族，
//   它们原本定义在 distill.ts ⇒ 直接 import 会形成 distill → distill-agent → distill 的**环**
//   （本项目零环是硬性质）。本件只依赖 node 内置与 targets，处在依赖图更底层。
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// ═══ v18 分段蒸馏常量（2026-09-10 拍板「分段蒸馏 + 每段成功即推水位（可续传）+ 段间紧凑清单续上下文」）═══
// 开放可校准：CHUNK_CHARS=单段字符预算（切段只在事件边界、不劈事件），MAX_CHUNKS_PER_RUN=单轮触发至多处理段数
// （超出的段留待下一触发续传——水位停在已处理段的 endSeq）；UI 登记/参数化列为后续档。
export const CHUNK_CHARS = 10000
export const MAX_CHUNKS_PER_RUN = 3

// 蒸馏文本化规则单一实现（buildEventChunks 唯一入口，防口径漂移）：user/message 的每个 text 内容片
// ≤2000 前缀、assistant/message 的每个 text 内容片 ≤3000 前缀；事件无文本片 → 空数组。
// ★2026-09-13 深层归因修复（**来源过滤，第二副本**）：`user/message` 里混有**宿主注入块**
//   （`Current runtime context` 运行态快照 / MCL 慢通道材料 / `<system-reminder>` 等，kind=plugin|agent-instructions|skill-catalog），
//   原实现只按事件类型取文本 ⇒ 注入块被当作 `[user]` 文本进入**蒸馏材料**，并进一步成为
//   `episode.intent` ⇒ 实测 **255 条 episode 里 190 条（75%）intent 是宿主样板** ⇒ 转正/同型判定的数据源被污染。
//   判别口径**已收敛为单一实现**（2026-09-13 深层归因）：`targets.isRealUserEvent` —— 本件只 re-export，
//   与 `distill-activation.ts`、`mcl.ts#captureFromEvent`、`panel-inject.ts#taskTextOf` **同一函数**。
// ★★2026-09-14 修（**助手侧完全进不了蒸馏** · 实测高影响）：本函数原读 `assistant/chunk` 的
//   `data.chunk.block-end` —— 那是 **v0 已发布事件类型**（`RELEASED_V0_EVENT_DISPOSITIONS`：
//   `assistant/chunk` required=[turn,step,**chunk**] ／ `assistant/message` required=[turn,step,**message**]）；
//   而本机现行转录是 **v3**（`session.v3.jsonl.zstd`），**`assistant/chunk` 出现 0 次、`assistant/message` 578 次**
//   （逐帧解压实测）⇒ **助手侧文本一个字符都进不去**。后果（实测同一窗口 `(2676,3440]`）：
//   增量只算用户消息 = **129 字符 < 门槛 200** ⇒ **蒸馏恒判 `no-increment` 跳过**（本会话当天 3500 事件、
//   全流 161k 字符材料全部不可见）。这与 2026-09-13 修的 `user/message` 是**同一类**（按事件形状取文本，
//   而形状隔代变了），当时只修了用户侧、助手侧留在 v0。现改读 **v3 形状 `data.message.content[]`**。
//   实测修复后同一窗口 ≈ **37.5k 字符**（助手侧贡献 16.8k）⇒ 越过门槛、蒸馏真正开跑。
import { isRealUserEvent } from './targets.js'
export { isRealUserEvent }

/**
 * 材料事件白名单（册一 · 2026-09-19）——**输入面收敛的单一实现**。
 *
 * 判因（真机实测）：`buildEventChunks` 原让**无文本事件也推进段 `endSeq`**（下方 `:75` 旧码），
 *   而宿主在父会话上落的管理事件（`subagent/catalog` —— 每次 spawn 一条，见 `dsh-subagent/lib/index.js`
 *   的 `parent.append("subagent/catalog", …)`）**正是蒸馏自己造出来的** ⇒ 每轮重试把窗口右端 +1
 *   ⇒ 重试键 `sid#endSeq` 每轮都变 ⇒ `MAX_DISPATCH_RETRY=3` 结构性失效（真机：全会话唯一 `turn/end`
 *   在 seq 100，其后 101–106 六条全是 catalog；全日志「第 3/3 次」0 次）。
 *
 * 与宿主的关系（**不**在运行时 import）：宿主 `@deepseek-ai/dsh-session` 导出
 *   `isSurfaceEligibleType`（`SURFACE_EVENT_TYPES` = system/message · user/message · assistant/message · tool/result）。
 *   ⚠ 实测 profile 内该包**不可解析**（`~/.dsh/profiles/web/node_modules/@deepseek-ai/` 只有
 *   cordis / cosmokit / dsh-client-※ / dsh-llm / dsh-tools / schemastery）⇒ 运行时 import 会把插件整个加载链炸掉。
 *   故白名单在本仓定义、由 `scripts/check-distill-input-surface.mjs` ⑥ **锁 parity**（逐条 ⊆ 宿主 surface 集；
 *   宿主不可达则显式 UNVERIFIED）。**本集合只是宿主 surface 集的子集**（我们只取有正文的两类）。
 */
export const MATERIAL_EVENT_TYPES: ReadonlySet<string> = new Set(['user/message', 'assistant/message'])

/** 该事件是否属于**材料面**（只有材料事件能进段文本、能推段边界） */
export const isMaterialEvent = (e: any): boolean => MATERIAL_EVENT_TYPES.has(String(e && e.type))

export const textPartsOfEvent = (e: any): string[] => {
  const parts: string[] = []
  if (!isMaterialEvent(e)) return parts // ★ 册一：非材料事件（管理事件）零字进入材料
  if (e.type === 'user/message') {
    if (!isRealUserEvent(e)) return parts      // ★ 宿主注入块不进蒸馏材料 / episode.intent
    const d = (e as any).data || {}
    const arr = Array.isArray(d.content) ? d.content : []
    for (const c of arr) if (c && c.type === 'text' && typeof c.text === 'string') parts.push('[user] ' + c.text.slice(0, 2000))
  } else if (e.type === 'assistant/message') {
    // v3（现行）形状：data.message.content[] —— 只取 text 片，**不取 reasoning**（思维链不进蒸馏材料）
    const m = (e as any).data && (e as any).data.message
    const arr = m && Array.isArray(m.content) ? m.content : []
    for (const c of arr) if (c && c.type === 'text' && typeof c.text === 'string') parts.push('[assistant] ' + c.text.slice(0, 3000))
  }
  return parts
}

// ── v18 纯函数分段器契约 ──
// 册一（2026-09-19）**纯增量扩展**：`segKey`（段身份）+ `events`（本段材料事件数）。
//   `endSeq` 语义**收紧为「材料边界」**（最后一个产生正文的事件 seq）；扫过的**全部**事件边界仍由
//   `DistillChunks.maxSeq` 承载（= 扫描边界，不丢事件）。两者分工见 `buildEventChunks` 头注。
export interface DistillChunk { startSeq: number; endSeq: number; text: string; segKey: string; events: number }
export interface DistillChunks { chunks: DistillChunk[]; maxSeq: number }

/** 事件元信息（段身份构造用；与水位双证 `type|time|dataLen` 同思路，但不做 JSON 序列化以免大正文开销） */
const metaOfEvent = (e: any): string => `${(e as any).seq ?? 0}|${(e as any).type || '?'}|${Number((e as any).time ?? -1)}`

/** 段身份 = 首末材料事件元信息 + 段文本长度（内容变了必变；引用同一内容重试必稳） */
const segKeyOf = (head: string, tail: string, textLen: number): string =>
  createHash('sha1').update(`${head}|${tail}|${textLen}`).digest('hex').slice(0, 12)

/**
 * buildEventChunks — v18 分段器（2026-09-10）：把 seq>lastSeq 的事件增量按「累计字符超 chunkChars 即切段」切成若干段。
 * - 文本化规则 = 模块级 `textPartsOfEvent` 单一实现（user text 片 ≤2000、assistant text 片 ≤3000）；
 * - 切段只在事件边界，绝不劈事件；单个事件文本超 chunkChars 时允许单事件成段；
 * - ★ **册一（2026-09-19）：边界二分** ——
 *     `maxSeq` = **扫描边界**（覆盖窗口内**一切**事件，含管理事件 ⇒ 不丢事件，跳过分支据此推水位）；
 *     段 `endSeq` = **材料边界**（只由产生正文的事件推进）⇒ 宿主管理事件（`subagent/catalog` 等）
 *     **不再推段边界**，故同一段在重试之间身份稳定（旧行为下蒸馏自己 spawn 的子代理记录每轮把边界 +1）。
 *     ⚠ 旧注释「无文本事件并入当前开放段（只推进其 endSeq）」**已不成立**，此句即为现状描述。
 * - 段身份 `segKey` = 首末材料事件元信息 + 段文本长度（`segKeyOf`）——重试计数的键（见 `distill-agent.ts`）；
 * - 窗口内完全没有 seq>lastSeq 的事件 → chunks=[]、maxSeq=lastSeq；maxSeq=窗口最末事件 seq；
 * - 「还有后续段未处理」由调用方按 chunks.length 与本轮段数上限（MAX_CHUNKS_PER_RUN）判定
 *   （水位停在已处理段的 endSeq，下一触发续传）。
 */
export function buildEventChunks(agent: any, lastSeq: number, chunkChars: number = CHUNK_CHARS, eventsOf?: any[]): DistillChunks {
  const events = eventsOf || agent.session.snapshotEvents()
  let maxSeq = lastSeq
  const chunks: DistillChunk[] = []
  let cur: { startSeq: number; endSeq: number; parts: string[]; len: number; events: number; head: string; tail: string } | null = null
  const flush = (): void => {
    if (!cur) return
    const text = cur.parts.join('\n')
    chunks.push({ startSeq: cur.startSeq, endSeq: cur.endSeq, text, segKey: segKeyOf(cur.head, cur.tail, text.length), events: cur.events })
    cur = null
  }
  for (const e of events) {
    const seq = (e as any).seq ?? 0
    if (seq <= lastSeq) continue
    if (seq > maxSeq) maxSeq = seq // 扫描边界：一切事件（含管理事件）都推进它 ⇒ 不丢事件
    const parts = textPartsOfEvent(e)
    // ★ 册一：非材料事件到此为止 —— 只推扫描边界，**不推段边界**（旧码在此 `cur.endSeq = seq`）
    if (!parts.length) continue
    const partLen = parts.reduce((n, p) => n + p.length, 0)
    // 追加成本 = 各文本片长度 + join('\n') 分隔符数（cur 已有内容时每个新片前多一个 \n；开新段时片间分隔 n-1 个）
    const addCost = partLen + (cur ? parts.length : parts.length - 1)
    if (cur && cur.len + addCost > chunkChars) flush()
    if (!cur) cur = { startSeq: seq, endSeq: seq, parts: [], len: 0, events: 0, head: metaOfEvent(e), tail: metaOfEvent(e) }
    for (const p of parts) {
      cur.len += p.length + (cur.parts.length > 0 ? 1 : 0)
      cur.parts.push(p)
    }
    cur.endSeq = seq
    cur.tail = metaOfEvent(e)
    cur.events++
  }
  flush()
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
