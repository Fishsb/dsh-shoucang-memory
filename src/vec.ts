/**
 * vec.ts — 读侧向量档（2026-09-09 缺省启用：本地 bge-m3 零 token）。
 *
 * 原则（2026-09-09 拍板）：
 *  - 向量 = 派生缓存，不是事实源：行文本是权威，向量可随时删除重建（行 hash 失效即重嵌）。
 *  - 写入即增量：按「行 hash」惰性补齐（recall 时只嵌缺失/变更行），不挂写入事件。
 *  - 双模式可配 + 本地缺省：embedBaseUrl 缺省本地 bge-m3 桥（免 key）；换云端设 baseUrl/model/apiKeyEnv。
 *  - 词法打底空时仍走向量（全量索引薄行池）——语义相似但措辞不同是融合召回的真正价值场景。
 *  - 融合参照 M7 benchmark：dense 0.7 + lexical 0.3（min-max 归一后加权），dense 主、lexical 稳。
 *  - 零硬编码路径；缓存落 <knowledgeRoot>/.vector-cache.jsonl；provider 不可用自动降级词法，闭环不中断。
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { knowledgeRoot, recallIndex, type RecallRow } from './targets.js'

export interface EmbedCfg {
  enabled: boolean
  baseUrl: string // OpenAI 兼容 /v1/embeddings
  model: string
  apiKeyEnv: string // 从进程环境变量取 key（不落盘/不入 repo）
}

const CACHE_FILE = (): string => join(knowledgeRoot(), '.vector-cache.jsonl')
/** in-memory 行向量缓存（file+line+model+baseUrl → hash+vec）；进程内热用，首次读盘 */
const memCache = new Map<string, { file: string; line: string; hash: number; vec: number[]; model: string; baseUrl: string }>()
/** 缓存指纹（2026-09-10 P0 model + 审查 D3 加 baseUrl）：换 embedding 模型/服务后旧向量必须失效重嵌，
 *  否则新旧向量混用语义失真（同名 model 但不同服务 = 不同向量空间） */
const cacheKey = (file: string, hash: number, model: string, baseUrl: string): string => file + '\u0000' + hash + '\u0000' + model + '\u0000' + baseUrl

// U1（2026-09-09）：召回运行态统计（轻量内存，供 /vector/status2 与 overview.vector 展示；不入库非事实源）
export const vecStats = {
  queries: 0,
  lastMode: 'lexical' as 'lexical' | 'fusion',
  lastMs: 0,
  lastAt: 0,
  lastQuery: '',
  lastHit: '',
}
const noteQuery = (mode: 'lexical' | 'fusion', ms: number, query: string, hit: string): void => {
  vecStats.queries++
  vecStats.lastMode = mode
  vecStats.lastMs = ms
  vecStats.lastAt = Date.now()
  vecStats.lastQuery = String(query || '').slice(0, 80)
  vecStats.lastHit = String(hit || '').slice(0, 100)
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** 清向量缓存（2026-09-10 P0）：删磁盘缓存 + 清内存——换 embedding 模型后调用，旧模型向量全部失效 */
export function clearVecCache(): { cleared: boolean; removed: number; reason?: string } {
  let removed = 0
  try {
    const f = CACHE_FILE()
    if (existsSync(f)) { unlinkSync(f); removed++ }
  } catch (e) { return { cleared: false, removed, reason: 'cache unlink fail: ' + String((e as Error).message).slice(0, 80) } }
  memCache.clear()
  return { cleared: true, removed }
}

const lineHash = (s: string): number => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

function loadCache(): void {
  if (memCache.size) return
  try {
    const f = CACHE_FILE()
    if (!existsSync(f)) return
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      if (!l.trim()) continue
      try {
        const o = JSON.parse(l) as { file: string; line: string; hash: number; vec: number[]; model?: string; baseUrl?: string }
        // 旧缓存（缺 model 或缺 baseUrl 指纹）不载入——无法确证向量空间一致，宁缺毋滥待重嵌
        if (!o.model || !o.baseUrl) continue
        memCache.set(cacheKey(o.file, o.hash, o.model, o.baseUrl), { file: o.file, line: o.line, hash: o.hash, vec: o.vec, model: o.model, baseUrl: o.baseUrl })
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 无缓存 */ }
}

function saveLine(file: string, line: string, hash: number, vec: number[], model: string, baseUrl: string): void {
  try {
    const f = CACHE_FILE()
    mkdirSync(dirname(f), { recursive: true })
    appendFileSync(f, JSON.stringify({ file, line, hash, vec, model, baseUrl }) + '\n', 'utf8')
    memCache.set(cacheKey(file, hash, model, baseUrl), { file, line, hash, vec, model, baseUrl })
  } catch { /* 写缓存失败=下次重嵌，无害 */ }
}

/**
 * 通用语义相似（v6 向量政策第二批 2026-09-10）：任意两段文本的向量余弦（dense 决策信号）。
 * 未启用/失败 → null（调用方自行词法/阈值兜底，闭环不中断）。嵌入不落缓存（单次使用）。
 */
export async function semanticSim(a: string, b: string, cfg: EmbedCfg): Promise<number | null> {
  if (!cfg.enabled || !cfg.baseUrl || !cfg.model || !a.trim() || !b.trim()) return null
  const vs = await embedTexts(cfg, [a.slice(0, 512), b.slice(0, 512)])
  if (!vs || vs.length < 2 || !vs[0] || !vs[0].length || !vs[1] || !vs[1].length) return null
  return cosine(vs[0], vs[1])
}

async function embedTexts(cfg: EmbedCfg, texts: string[]): Promise<number[][] | null> {
  if (!cfg.enabled || !cfg.baseUrl || !cfg.model) return null
  try {
    const key = process.env[cfg.apiKeyEnv] || process.env.EMBED_API_KEY
    const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(cfg.baseUrl)
    // 本地无鉴权端点（默认 bge-m3 桥）免 key；云端须有 key——无 key 且非本地 → 词法降级
    if (!key && !isLocal) return null
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/embeddings'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model: cfg.model, input: texts }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    if (!Array.isArray(j.data) || !j.data.length) return null
    return j.data.map((d) => d.embedding || [])
  } catch { return null } // 网络/超时/格式 → 词法降级，闭环不中断
}

/**
 * 读侧召回（向量档就绪时）：词法 topK 打底 → 行向量惰性补齐 → dense topK 候选 → 0.7dense ⊕ 0.3lex 融合重排。
 * 返回行附带 fused/dense；向量不可用（未配置/失败/缓存空且无 key）时 = 纯词法结果（dense=undefined）。
 * 2026-09-09（向量默认启用）：词法打底为空时**不再直接返回**——若向量开，对全部索引行做向量检索
 * （语义相似但措辞不同是融合召回的真正价值场景，如「任务怎么不踩坑」vs 索引行「结果验证重实证」）；
 * 词法候选与全量行集合并后统一向量化（缓存命中免重复嵌入）。索引行数受容量红线约束（数十行级），
 * 一次全量补齐预算可控，非「全部 notes 正文」——仍是薄行。
 */
export async function recallRanked(
  root: string, query: string, topK: number, scope: 'agent' | 'all', cfg: EmbedCfg,
): Promise<{ rows: RecallRow[]; tokens: string[]; mode: 'lexical' | 'fusion' }> {
  const t0 = Date.now()
  const hitOf = (rows: RecallRow[]): string => (rows[0] && rows[0].line) || ''
  const finish = (rows: RecallRow[], tokens: string[], mode: 'lexical' | 'fusion') => {
    noteQuery(mode, Date.now() - t0, query, hitOf(rows))
    return { rows, tokens, mode }
  }
  const { rows, tokens } = recallIndex(root, query, Math.max(topK, 8), scope) // 打底多取，供融合裁剪
  if (!cfg.enabled) return finish(rows.slice(0, topK), tokens, 'lexical')
  try {
    loadCache()
    // 词法打底空 → 全量索引行（薄行，数十行级）作为向量检索池；词法非空 → 用词法候选池
    let pool: RecallRow[] = rows
    if (!pool.length) {
      const files = scope === 'all' ? ['AGENT.md', 'MEMORY.md', 'USER.md'] : ['AGENT.md']
      for (const file of files) {
        let raw = ''
        try { raw = readFileSync(join(root, file), 'utf8') } catch { continue }
        for (const l of raw.split(/\r?\n/)) {
          const line = l.trim()
          const tagM = line.match(/^\[([^\] ]+)\]/)
          if (!tagM || !/→\s*notes\//.test(line)) continue
          const ptrM = line.match(/→\s*(notes\/[A-Za-z0-9_-]+\.md)/)
          pool.push({ file, tag: tagM[1], line, score: 0, pointer: ptrM ? ptrM[1] : '' })
        }
      }
    }
    const need: RecallRow[] = []
    const vecRows: Array<{ row: RecallRow; vec: number[] }> = []
    const mdl = String(cfg.model || 'bge-m3') // 缓存模型指纹
    const bUrl = String(cfg.baseUrl || '').replace(/\/+$/, '') // 缓存服务指纹（D3：同名 model 不同服务=不同向量空间）
    for (const r of pool) {
      const h = lineHash(r.line)
      const hit = memCache.get(cacheKey(r.file, h, mdl, bUrl))
      if (hit) vecRows.push({ row: r, vec: hit.vec })
      else need.push(r)
    }
    if (need.length) {
      const batch = need.slice(0, 48) // 全量池兜底时一次最多补齐 48 行（薄行预算可控；缓存后免重复）
      const vecs = await embedTexts(cfg, batch.map((r) => r.line.slice(0, 512)))
      if (vecs && vecs.length === batch.length) {
        for (let i = 0; i < batch.length; i++) {
          const v = vecs[i]
          if (v && v.length) { saveLine(batch[i].file, batch[i].line, lineHash(batch[i].line), v, mdl, bUrl); vecRows.push({ row: batch[i], vec: v }) }
        }
      }
    }
    if (!vecRows.length) return finish(rows.slice(0, topK), tokens, 'lexical') // 向量不可用 → 词法
    const qv = await embedTexts(cfg, [query.slice(0, 512)])
    if (!qv || !qv[0] || !qv[0].length) return finish(rows.slice(0, topK), tokens, 'lexical')
    const dense = vecRows.map((x) => ({ row: x.row, sim: cosine(qv[0], x.vec) })).sort((a, b) => b.sim - a.sim).slice(0, topK)
    const lexMax = Math.max(1, ...dense.map((d) => d.row.score))
    const denseMin = Math.min(...dense.map((d) => d.sim))
    const denseMax = Math.max(...dense.map((d) => d.sim))
    const span = Math.max(1e-9, denseMax - denseMin)
    const fused = dense
      .map((d) => ({ ...d, fused: 0.7 * (d.sim - denseMin) / span + 0.3 * (d.row.score / lexMax) }))
      .sort((a, b) => b.fused - a.fused)
      .slice(0, topK)
    const out = fused.map((f) => ({ ...f.row, score: Math.round(f.fused * 100) }))
    return finish(out, tokens, 'fusion')
  } catch { return finish(rows.slice(0, topK), tokens, 'lexical') }
}
