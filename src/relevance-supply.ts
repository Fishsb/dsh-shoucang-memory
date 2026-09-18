/**
 * relevance-supply.ts — 动态面**相关性**领域（IR1 册一 · 2026-09-18）
 *
 * 由来（IR1-injection-recall-plan v3 §2-1 的**实测**病灶）：
 *   · 注入侧相关性**纯词法**：`recallIndex` 对自然语言中文查询实测 **0 行**；
 *   · `"深睡蒸馏"` 实测 8–10 行**全在 `AGENT.md`**，而旧实现按 `file === 'MEMORY.md'` **单点过滤** ⇒
 *     **命中全丢** ⇒ `picked` 恒空 ⇒ 动态面落**位置式基线**；
 *   · 唯一向量桥（`warm-recall.json`）由 `mcl.ts` 在 **MCL 慢通道判定的回合**写 ⇒ 多数回合无桥。
 *   三者叠加的后果：真命中词 vs 乱码词的注入面 **62/62 行逐行相同**（本次复测 63/63）⇒ **按任务供给形同虚设**。
 *
 * 本件做四件事（**不新造机制**）：
 *   ① **分层配额**：相关性通道不再被单文件过滤 —— `memory-index`（MEMORY.md 索引行）／
 *      `agent-principles`（**新增**：AGENT.md 的 `[原则]`/`[路径]` 行，认知层最该按任务浮现）／`profile`；
 *   ② **桥读取 + 记账**：桥缺失/过期/键不匹配 ⇒ **显式原因**（`bridge-missing` 等），不静默退基线；
 *   ③ **零命中可见**：桥与词法**都**取不回 ⇒ `zeroHit` 为真，由调用方在注入面**如实注明**；
 *   ④ **预热**（`preheatWarmRecall`）：复用既有桥文件、既有 `recallRanked`、既有异步扩展点
 *      （`panel-inject` 的 `agent/pre-step`）——**零新机制、零新依赖**。
 *
 * 边界：本件**只选行**（相关性面），不渲染、不裁切、不记账预算（那归 `supply-assembly`）；
 *   纯读（除预热写桥外零写入）；路径由调用方派生（零硬编码）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { highConfCarrierSet, indexRowTag, knowledgeRoot, recallIndex, recallKeyOf, type RecallRow } from './targets.js'
import { recallRanked, type EmbedCfg } from './vec.js'

/** 相关性分层（IR1 §3 ② 的三层配额；`other` 只是归类兜底，不进配额） */
export type RelevanceLayer = 'memory-index' | 'agent-principles' | 'profile' | 'other'

/** 分层配额（条数）。`agentPrinciples` **保底 1**：认知层是"最该按任务浮现"的那批（实测 AGENT 命中占 8/8） */
export interface RelevanceQuota {
  memoryIndex: number
  agentPrinciples: number
  profile: number
}

/** 按动态面 cap 派生分层配额（**单一实现**；cap 归知识索引面，原则面取 1/4 且封顶 3） */
export function quotaOf(cap: number): RelevanceQuota {
  const c = Math.max(0, Number(cap) || 0)
  const agentPrinciples = c <= 0 ? 0 : Math.max(1, Math.min(3, Math.floor(c / 4)))
  return { memoryIndex: Math.max(0, c - agentPrinciples), agentPrinciples, profile: 0 }
}

/**
 * 行 → 层。判据**只认注册表**（`highConfCarrierSet` = 注册表 `mclGate: true` 的标签集，
 *   实测 = `{原则, 路径}`）——不另写标签名单（那是同一事实的第二份副本，会随注册表演进而静默漂移）。
 * `USER.md` 与 `AGENT.md` 的其余行归 `profile`（画像/事实型；本槽缺省配额 0 ⇒ 不占动态面）。
 */
export function layerOf(file: string, line: string): RelevanceLayer {
  const f = String(file || '')
  if (f === 'MEMORY.md') return 'memory-index'
  const tag = indexRowTag(line)
  if (!tag) return 'profile'
  return highConfCarrierSet().has(tag) ? 'agent-principles' : 'profile'
}

/** 桥（`warm-recall.json`）的**单一路径**实现（写侧 `mcl.ts` 与读侧本件必须同源） */
export function warmBridgeFile(): string {
  return join(knowledgeRoot(), 'audit', 'warm-recall.json')
}

/** 桥的可用性（**显式枚举**：每一种"为什么没读到"都要能被记账，不合并成一句"不可用"） */
export type BridgeMiss = '' | 'bridge-missing' | 'bridge-unreadable' | 'bridge-stale' | 'bridge-key-mismatch' | 'bridge-empty'
/** 桥 / 词法都取不回时的原因（A3 · A5 的判据面）。
 *  词表：`''`（未发生降级）· `bridge-missing|bridge-unreadable|bridge-stale|bridge-key-mismatch|bridge-empty`
 *  · `zero-hit`（桥与词法**都**取不回）· **复合形态** `<bridge-reason>|zero-hit`（先降级、再零命中 —— 两步都要留下） */
export type RelFallback = '' | BridgeMiss | 'zero-hit' | string

export interface RelevanceTrace {
  /** 实际生效的通道：`bridge`（向量融合预热）/ `lexical`（词法）/ `positional`（位置式基线） */
  source: 'bridge' | 'lexical' | 'positional'
  /** 桥/词法失败原因（`''` = 未发生；**不得静默**） */
  fallback: RelFallback
  /** 各通道候选数（N=0 显式记 0） */
  hits: { bridge: number; lexical: number }
  /** 桥与词法**都**取不回 ⇒ 本步相关性零命中（调用方须在注入面注明） */
  zeroHit: boolean
  /** 分层配额下实际入选的层分布（可核验"哪层供上了"） */
  byLayer: Record<RelevanceLayer, number>
}

export interface RelevanceDeps {
  /** 记忆库根（三索引所在；只读 `MEMORY.md`/`AGENT.md`/`USER.md`） */
  memRoot: string
  /** 本步任务文本（空 ⇒ 不铺相关性，走位置式基线 —— 与既有语义一致） */
  q: string
  /** 动态面行数上限（= `budgetOf().dynamic` 派生的 cap） */
  cap: number
  /** 桥文件路径（缺省 `warmBridgeFile()`；显式可传以便单测夹具） */
  bridgeFile?: string
  /** 桥有效期（缺省 120s，与 `mcl.ts` 写侧的既有取舍一致） */
  ttlMs?: number
  /** 判定时刻（**显式传入**，不吃隐式 now ⇒ 同输入必同输出、可复现） */
  now?: number
  /** 分层配额覆盖（缺省 `quotaOf(cap)`；单测用） */
  quota?: RelevanceQuota
  /**
   * **恒定面已持有的行**（调用方传：`agentLines ∪ userLines` 的候选集）——相关性面必须**排除**它们。
   * 判因（2026-09-18 真机实测）：相关性通道按契约**不限层**（它本就是 `gated:index` 渲染器），于是
   *   `always` 层的索引行既在恒定面、又被选进动态面 ⇒ **同一行在注入文本里出现两次**
   *   （实测 2 行重复），且被恒定面裁掉的行会"从动态面复活" ⇒ 账（哪一槽丢了什么）不可核。
   * 契约依据：P 层 ⇒ `always`（恒定面**归属**它们），动态面只该补 **gated** 的按需行。
   */
  exclude?: readonly string[]
}

export interface RelevanceResult {
  /** 相关性面入选行（**未裁切**；裁切归调用方/装配器） */
  picked: string[]
  trace: RelevanceTrace
}

/** 桥行（写侧只落这三个字段；读侧统一补 `tag`/`score`） */
interface BridgeRow { line?: unknown; file?: unknown; pointer?: unknown }

/**
 * 读桥：**纯读、零抛出**。返回 `reason` 说明为什么没读到（`''` = 读到且可用）。
 * 判据与写侧同源：`key === recallKeyOf(q)`（同键才可比）+ `now - at < ttl`。
 */
export function readWarmBridge(file: string, q: string, now: number, ttlMs = 120000): { rows: RecallRow[]; miss: BridgeMiss } {
  try {
    if (!existsSync(file)) return { rows: [], miss: 'bridge-missing' }
    const w = JSON.parse(readFileSync(file, 'utf8')) as { at?: number; key?: string; rows?: BridgeRow[] }
    const at = Number(w?.at)
    if (!Number.isFinite(at) || at <= 0) return { rows: [], miss: 'bridge-unreadable' }
    if (String(w?.key || '') !== recallKeyOf(q)) return { rows: [], miss: 'bridge-key-mismatch' }
    if (now - at >= ttlMs || at - now > 60000) return { rows: [], miss: 'bridge-stale' }
    const rows: RecallRow[] = []
    for (const x of Array.isArray(w?.rows) ? w.rows : []) {
      const line = String(x?.line ?? '').trim()
      if (!line) continue
      const f = String(x?.file ?? '')
      rows.push({ file: f, tag: indexRowTag(line) || '', line, score: 0, pointer: String(x?.pointer ?? '') })
    }
    return rows.length ? { rows, miss: '' } : { rows: [], miss: 'bridge-empty' }
  } catch {
    return { rows: [], miss: 'bridge-unreadable' }
  }
}

/** 位置式基线的零值 trace（`source:'positional'` 且无失败原因 —— "还没到相关性那一步"，不是失败） */
export function emptyTrace(): RelevanceTrace {
  return { source: 'positional', fallback: '', hits: { bridge: 0, lexical: 0 }, zeroHit: false, byLayer: { 'memory-index': 0, 'agent-principles': 0, profile: 0, other: 0 } }
}

/** 逐层取行（层内按调用方给的序 = 相关性序，**本件不重排**）；层间序固定为 memory-index → agent-principles → profile
 *  `exclude`（恒定面已持有的行）在**分组之前**剔除 —— 排除必须发生在配额结算**之前**，否则配额会被
 *  注定不入选的行占掉（"先扣名额再排除"＝假配额）。 */
export function pickByLayer(rows: readonly RecallRow[], quota: RelevanceQuota, cap: number, exclude?: readonly string[]): { picked: string[]; byLayer: Record<RelevanceLayer, number> } {
  const drop = new Set((exclude ?? []).map((s) => String(s).trim()).filter(Boolean))
  const groups: Record<RelevanceLayer, string[]> = { 'memory-index': [], 'agent-principles': [], profile: [], other: [] }
  for (const r of rows) {
    if (drop.has(String(r.line).trim())) continue
    const l = layerOf(r.file, r.line)
    if (!groups[l].includes(r.line)) groups[l].push(r.line)
  }
  const byLayer: Record<RelevanceLayer, number> = { 'memory-index': 0, 'agent-principles': 0, profile: 0, other: 0 }
  const picked: string[] = []
  const push = (l: RelevanceLayer, n: number): void => {
    for (const line of groups[l]) {
      if (byLayer[l] >= n || picked.length >= cap) break
      if (picked.includes(line)) continue
      picked.push(line)
      byLayer[l]++
    }
  }
  push('memory-index', quota.memoryIndex)
  push('agent-principles', quota.agentPrinciples)
  push('profile', quota.profile)
  // 层配额未填满 cap 时，用**未入选的异层行**按原序补齐（配额是**保底**，不是墙 —— 不牺牲召回）
  if (picked.length < cap) {
    for (const l of ['agent-principles', 'memory-index', 'profile'] as RelevanceLayer[]) push(l, Infinity)
  }
  return { picked: picked.slice(0, Math.max(0, cap)), byLayer }
}

/**
 * 相关性选行（**同步**：注入回调读它）。
 * 顺序即判据：**桥（向量融合）→ 词法 → 位置式基线**；每一次降级都记入 `trace.fallback`。
 */
export function selectRelevantLines(d: RelevanceDeps): RelevanceResult {
  const q = String(d.q || '').trim()
  const cap = Math.max(0, Number(d.cap) || 0)
  const now = Number(d.now ?? Date.now())
  const trace: RelevanceTrace = { source: 'positional', fallback: '', hits: { bridge: 0, lexical: 0 }, zeroHit: false, byLayer: { 'memory-index': 0, 'agent-principles': 0, profile: 0, other: 0 } }
  if (!q || cap <= 0) return { picked: [], trace } // 空 query = 位置式基线（既有语义，不是失败）
  const quota = d.quota ?? quotaOf(cap)
  const bridge = readWarmBridge(d.bridgeFile ?? warmBridgeFile(), q, now, d.ttlMs)
  let rows = bridge.rows
  trace.hits.bridge = rows.length
  if (rows.length) trace.source = 'bridge'
  if (!rows.length) {
    trace.fallback = bridge.miss || 'bridge-empty'
    rows = recallIndex(d.memRoot, q, Math.max(cap, 8), 'all').rows
    trace.hits.lexical = rows.length
    if (rows.length) trace.source = 'lexical'
  }
  if (!rows.length) {
    trace.source = 'positional'
    trace.zeroHit = true
    trace.fallback = trace.fallback ? `${trace.fallback}|zero-hit` : 'zero-hit'
    return { picked: [], trace }
  }
  const { picked, byLayer } = pickByLayer(rows, quota, cap, d.exclude)
  trace.byLayer = byLayer
  if (!picked.length) {
    trace.source = 'positional'
    trace.zeroHit = true
    trace.fallback = trace.fallback ? `${trace.fallback}|zero-hit` : 'zero-hit'
  }
  return { picked, trace }
}

/** 零命中时注入面的**如实注明**（A5；`''` = 不注明）。口径：只有**非空 query 且真零命中**才注明。 */
export function relevanceNoteOf(trace: RelevanceTrace | undefined, q: string): string {
  if (!trace || !trace.zeroHit || !String(q || '').trim()) return ''
  return '（本步相关性零命中，以下为位置式基线）'
}

export interface PreheatDeps {
  /** 预热用的 query（**必须与注入面取到的 `q` 同源同文本**，否则键不匹配=白预热） */
  q: string
  /** 嵌入配置（`panel-inject#effectiveEmbed` 与 `mcl` 同源语义） */
  embed: EmbedCfg
  /** 记忆库根（缺省 `memoryLibRoot` 语义由调用方给；本件不猜） */
  root: string
  /** 桥文件路径（缺省 `warmBridgeFile()`） */
  bridgeFile?: string
  /** 一次预热带回的行数（缺省 12：分层配额之后仍有余量） */
  topK?: number
  /** 单次预热的上限毫秒（缺省 2500；超时即放弃本步预热 —— 注入面走词法/位置式并**记账**） */
  timeoutMs?: number
  /** 判定时刻（显式传入以便测试；缺省 now） */
  now?: number
}

export interface PreheatResult {
  ok: boolean
  rows: number
  /** 失败/跳过原因（`ok:false` 时非空）：`skip-fresh`（桥已新鲜，免重复嵌入）/ `timeout` / `no-query` / `error` */
  reason: '' | 'skip-fresh' | 'timeout' | 'no-query' | 'error'
  ms: number
}

/**
 * **预热**：把本轮 query 的融合召回结果写进桥 —— 注入回调是**同步**的，读桥是它唯一的向量通路。
 *
 * 复用三件既有物（**零新机制**）：桥文件格式（与 `mcl.ts` 写侧同形）· `recallRanked`（既有融合实现）·
 *   既有异步扩展点 `agent/pre-step`。幂等：桥新鲜且键相同 ⇒ 直接 `skip-fresh`（不重复嵌入）。
 */
export async function preheatWarmRecall(d: PreheatDeps): Promise<PreheatResult> {
  const t0 = Date.now()
  const q = String(d.q || '').trim()
  if (!q) return { ok: false, rows: 0, reason: 'no-query', ms: 0 }
  const file = d.bridgeFile ?? warmBridgeFile()
  const now = Number(d.now ?? Date.now())
  if (readWarmBridge(file, q, now).rows.length) return { ok: false, rows: 0, reason: 'skip-fresh', ms: Date.now() - t0 }
  const run = (async (): Promise<number> => {
    if (!d.embed?.enabled) return 0
    const r = await recallRanked(d.root, q, Math.max(1, Number(d.topK) || 12), 'all', d.embed)
    const rows = r.rows.map((x) => ({ line: x.line, file: x.file, pointer: x.pointer }))
    if (!rows.length) return 0
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ at: Date.now(), key: recallKeyOf(q), rows: rows.slice(0, Math.max(1, Number(d.topK) || 12)) }), 'utf8')
    return rows.length
  })()
  const timeoutMs = Math.max(100, Number(d.timeoutMs) || 2500)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const rows = await Promise.race([
      run,
      new Promise<number>((resolve) => { timer = setTimeout(() => resolve(-1), timeoutMs) }),
    ])
    if (rows < 0) return { ok: false, rows: 0, reason: 'timeout', ms: Date.now() - t0 }
    return rows > 0 ? { ok: true, rows, reason: '', ms: Date.now() - t0 } : { ok: false, rows: 0, reason: 'error', ms: Date.now() - t0 }
  } catch {
    return { ok: false, rows: 0, reason: 'error', ms: Date.now() - t0 }
  } finally {
    if (timer) clearTimeout(timer)
    /* 超时后 `run` 仍在飞（嵌入请求不可取消）—— 它若最终写桥，写的是**同一个键**的内容，
     *   对读侧是"更完整的同一答案"，无副作用；此处不 await，避免把超时保护变成阻塞。 */
  }
}
