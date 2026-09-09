/**
 * vec.ts — 读侧向量档（路线⑤，可选、默认关）。
 *
 * 原则（2026-09-09 拍板）：
 *  - 向量 = 派生缓存，不是事实源：行文本是权威，向量可随时删除重建（行 hash 失效即重嵌）。
 *  - 写入即增量：按「行 hash」惰性补齐（recall 时只嵌缺失/变更行），不挂写入事件。
 *  - 双模式可配 + 缺省纯词法：未配置 provider / 调用失败 / 超时 → 自动降级 recallIndex 词法，闭环不中断。
 *  - 融合参照 M7 benchmark：dense 0.7 + lexical 0.3（min-max 归一后加权），dense 主、lexical 稳。
 *  - 零硬编码路径；缓存落 <knowledgeRoot>/.vector-cache.jsonl；本地 embedding 全栈不引入（零常驻/轻依赖红线）。
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { knowledgeRoot, recallIndex, type RecallRow } from './targets.js'

export interface EmbedCfg {
  enabled: boolean
  baseUrl: string // OpenAI 兼容 /v1/embeddings
  model: string
  apiKeyEnv: string // 从进程环境变量取 key（不落盘/不入 repo）
}

const CACHE_FILE = (): string => join(knowledgeRoot(), '.vector-cache.jsonl')
/** in-memory 行向量缓存（file+line → hash+vec）；进程内热用，首次读盘 */
const memCache = new Map<string, { file: string; line: string; hash: number; vec: number[] }>()

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
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
        const o = JSON.parse(l) as { file: string; line: string; hash: number; vec: number[] }
        memCache.set(o.file + '\u0000' + o.hash, o)
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 无缓存 */ }
}

function saveLine(file: string, line: string, hash: number, vec: number[]): void {
  try {
    const f = CACHE_FILE()
    mkdirSync(dirname(f), { recursive: true })
    appendFileSync(f, JSON.stringify({ file, line, hash, vec }) + '\n', 'utf8')
    memCache.set(file + '\u0000' + hash, { file, line, hash, vec })
  } catch { /* 写缓存失败=下次重嵌，无害 */ }
}

async function embedTexts(cfg: EmbedCfg, texts: string[]): Promise<number[][] | null> {
  if (!cfg.enabled || !cfg.baseUrl || !cfg.model) return null
  try {
    const key = process.env[cfg.apiKeyEnv] || process.env.EMBED_API_KEY
    if (!key) return null // 无 key = 未配置 → 词法降级
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/embeddings'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
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
 */
export async function recallRanked(
  root: string, query: string, topK: number, scope: 'agent' | 'all', cfg: EmbedCfg,
): Promise<{ rows: RecallRow[]; tokens: string[]; mode: 'lexical' | 'fusion' }> {
  const { rows, tokens } = recallIndex(root, query, Math.max(topK, 8), scope) // 打底多取，供融合裁剪
  if (!rows.length || !cfg.enabled) return { rows: rows.slice(0, topK), tokens, mode: 'lexical' }
  try {
    loadCache()
    const need: RecallRow[] = []
    const vecRows: Array<{ row: RecallRow; vec: number[] }> = []
    for (const r of rows) {
      const h = lineHash(r.line)
      const hit = memCache.get(r.file + '\u0000' + h)
      if (hit) vecRows.push({ row: r, vec: hit.vec })
      else need.push(r)
    }
    if (need.length) {
      const batch = need.slice(0, 24) // 每查最多补齐 24 行（惰性增量；预算可控）
      const vecs = await embedTexts(cfg, batch.map((r) => r.line.slice(0, 512)))
      if (vecs && vecs.length === batch.length) {
        for (let i = 0; i < batch.length; i++) {
          const v = vecs[i]
          if (v && v.length) { saveLine(batch[i].file, batch[i].line, lineHash(batch[i].line), v); vecRows.push({ row: batch[i], vec: v }) }
        }
      }
    }
    if (!vecRows.length) return { rows: rows.slice(0, topK), tokens, mode: 'lexical' } // 向量不可用 → 词法
    const qv = await embedTexts(cfg, [query.slice(0, 512)])
    if (!qv || !qv[0] || !qv[0].length) return { rows: rows.slice(0, topK), tokens, mode: 'lexical' }
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
    return { rows: out, tokens, mode: 'fusion' }
  } catch { return { rows: rows.slice(0, topK), tokens, mode: 'lexical' } }
}
