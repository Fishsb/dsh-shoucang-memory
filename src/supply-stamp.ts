/**
 * supply-stamp.ts — **供给戳**领域（IR1 册四 · 2026-09-18）
 *
 * 由来（IR1-injection-recall-plan v3 §2-5 的**实测**病灶：**四套失效口径**）：
 *   · 30s TTL（`panel-shared#buildHotMemoryText` 内层）；
 *   · `upstreamStampOf` 的 **size 签名**（只签 `activity.jsonl` + `delta.md` **两条介质**）；
 *   · `panel-inject#injectCacheReason` 的**四条件事件戳**（sid/evLen/firstSeq/lib）；
 *   · `vec` 的 60s / 5s / `fileStatCache` 三级缓存。
 *   ⇒ 后果：**改 `MEMORY.md` 在内层缓存里不可见**（库戳只活在外层判据里），且 `/inject/stats`
 *     只报**最外层**一个 reason ⇒ "哪一层失效"说不出来（G4）。
 *
 * 本件把**库戳 ∪ 介质戳**收敛成**一份实现**（`libStampOf`），并给出**层归因**（`injectCacheVerdict`）：
 *   失效只可能来自四层之一 —— `session`（换会话/新会话）· `context`（历史被压缩重写）·
 *   `query`（本步任务文本变）· `event`（库/介质落盘）· `ttl`（内层 30s 兜底）。
 *
 * ⚠ **`warm` 字段只作观测**：`warm-recall.json` 一次只装**一个 query** 的行，
 *   签它等于「为 query B 的写入失效 query A 的缓存」而 A 的输出**根本没变** ⇒ **不进失效键**
 *   （既有判据 `test-inject-cache` S4 钉死这一点）。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { knowledgeRoot, memoryLibRoot } from './targets.js'

export interface SupplyStamp {
  /** **库戳**：三索引（AGENT/USER/MEMORY）的 `size:mtimeMs` —— 睡眠/蒸馏落盘即变 */
  lib: string
  /** **介质戳**：`audit/activity.jsonl` + `delta.md` 的 size（上游产物；变更罕见且不绑定查询） */
  media: string
  /** **观测字段**（`warm-recall.json` 的 `size:mtimeMs`）—— **不参与失效**，理由见头注 */
  warm: string
  /** 取戳时刻（`Date.now()`） */
  at: number
}

/** 逐文件打戳；缺文件/不可读 ⇒ `f:-`（**失败开放**：签名失败不得影响注入） */
const stampOf = (root: string, files: readonly string[]): string =>
  files.map((f) => { try { return `${f}:${statSync(join(root, f)).size}` } catch { return `${f}:-` } }).join(',')

const libStampOfFiles = (root: string, files: readonly string[]): string =>
  files.map((f) => {
    try { const st = statSync(join(root, f)); return `${f}:${st.size}:${Math.round(st.mtimeMs)}` } catch { return `${f}:-` }
  }).join(',')

/**
 * **取戳（单一实现）**：库戳 ∪ 介质戳 ∪（观测用的）warm 戳。`memRoot` 缺省 = `memoryLibRoot()`；
 * `kRoot` 缺省 = `knowledgeRoot()`。零抛出（不可读一律回落占位）。
 *
 * ⚠ **此处不做节流**（实测教训 · 2026-09-18）：本函数被**内层**（`buildHotMemoryText` 的 30s 键）
 *   与**外层**（`panel-inject` 的事件判据）共用，而内层判据的要求是「**落盘即失效**」——
 *   一度在此加 5s 记忆化 ⇒ `test-inject-cache` 的 S1/S2/S3 当场三红（"改了介质却不重建"）。
 *   节流的正确位置是**外层调用点**（每步一次、可容忍 5s 延迟），不是本函数。
 *   代价：每次取戳 6 次 `statSync`（微秒级，与既有实现同量级）。
 */
export function libStampOf(memRoot?: string, kRoot?: string, now = Date.now()): SupplyStamp {
  const mem = memRoot || (() => { try { return memoryLibRoot() } catch { return '' } })()
  const kn = kRoot || (() => { try { return knowledgeRoot() } catch { return '' } })()
  return {
    lib: mem ? libStampOfFiles(mem, ['AGENT.md', 'USER.md', 'MEMORY.md']) : '',
    media: mem ? stampOf(mem, ['audit/activity.jsonl']) + (kn ? '|' + stampOf(kn, ['delta.md']) : '') : '',
    warm: kn ? libStampOfFiles(kn, ['audit/warm-recall.json']) : '',
    at: now,
  }
}

/** **失效键**：只由 `lib` + `media` 组成（**不含 `warm`**，理由见头注；也不含会话/查询 —— 那些走事件戳） */
export function stampKeyOf(s: SupplyStamp): string {
  return `${s.lib}|${s.media}`
}

/** 便于诊断的短摘要（只读；不出现在失效键里） */
export function stampSummaryOf(s: SupplyStamp): { lib: number; media: number; warm: number; at: number } {
  const len = (x: string): number => x.split(',').filter(Boolean).length
  return { lib: len(s.lib), media: len(s.media), warm: len(s.warm), at: s.at }
}

/** `warm-recall.json` 是否存在（观测用；`/inject/stats` 的 `warmBridge` 位） */
export function warmBridgeExists(kRoot?: string): boolean {
  try { return existsSync(join(kRoot || knowledgeRoot(), 'audit', 'warm-recall.json')) } catch { return false }
}

/** `warm-recall.json` 的**键**（观测：注入侧能否读到本步 query 的桥；不参与失效） */
export function warmBridgeKeyOf(kRoot?: string): string {
  try { return String((JSON.parse(readFileSync(join(kRoot || knowledgeRoot(), 'audit', 'warm-recall.json'), 'utf8')) as { key?: string })?.key ?? '') } catch { return '' }
}

/* ── 层归因（G4）：`reason` → 失效层 ────────────────────────────────────────────
 * 四层单调：`session`（换会话）→ `context`（压缩重写）→ `query`（本步任务）→ `event`（上游落盘）→ `ttl`（兜底）。
 * 归因的意义：**"库在长 ⇒ 每步重建"与"压缩后重建"是完全不同的两件事**，读数上必须可分辨。 */
export type CacheLayer = 'none' | 'session' | 'context' | 'query' | 'event' | 'ttl'

/** `injectCacheReason` 的返回值 → 层（**映射单点**；新 reason 必须先在此登记，否则机检会红） */
export function layerOfReason(reason: string): CacheLayer {
  if (!reason) return 'none'
  if (reason === 'new' || reason === 'session-changed') return 'session'
  if (reason === 'compacted') return 'context'
  if (reason === 'query-changed') return 'query'
  if (reason === 'lib-changed' || reason === 'media-changed') return 'event'
  return 'ttl' // 未知 reason 归兜底层（**不静默**：未知值由 test-inject-cache 的穷举断言拦下）
}
