#!/usr/bin/env node
/**
 * assertion-graph.mjs — 断言图 CLI（**代码粗筛 + 向量候选 + 判交模型** · 2026-09-13）
 *
 * 分工（本项目用模型纪律）：
 *   · **代码**：建图 / 计数 / 取近邻 / 去重 / 截断（`nearPairs`，精确、可测）；
 *   · **向量**：算语义近邻（`--near`，本地 Ollama `bge-m3`；不可用则**如实报不可用**）；
 *   · **模型**：判"重复 / 一致 / 相斥"——**向量说不了这件事**（两句几乎同义的话可以互相印证，也可以互相矛盾）。
 *     本器**不替模型判**，只给候选与证据。
 *
 * 用法：node scripts/assertion-graph.mjs [--near] [--bank <库根>] [--no-embed] [--json]
 *   --near       取**近邻候选对**（同一件事的候选；maxN=400，超出者如实不参与）
 *   --no-embed   不调向量（此时 --near 会如实报"向量不可用"）
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const AS_JSON = argv.includes('--json')
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'suite', 'memory'))
if (!existsSync(join(bank, '.records', 'records.jsonl'))) { console.log(`⏭ 影子库缺席（${bank}/.records）—— 诚实跳过（exit 3）`); process.exit(3) }

const lib = (rel) => pathToFileURL(join(repoRoot, 'lib', rel)).href
const { loadStore } = await import(lib('record-shadow.js'))
const { buildGraph, nearPairs, graphCensus } = await import(lib('assertion-graph.js'))
const { embedMany } = await import(lib('vec.js'))

const { records } = loadStore(bank)
const g = buildGraph(records)
const census = graphCensus(g)

let near = null
let nearError = ''
let dups = null
if (argv.includes('--dups')) {
  // **跨文件同文（逐字节相同）清单**（2026-09-13）：用于把"同一内容进了多个文件"变成**可复现的提案**。
  //   口径：按 `text` 分组，**只列跨文件**组（同文件内重复多为设计/结构）；空文本与纯分隔线不计。
  //   ⚠ 本器**只报告不删**——记忆库内容属用户，"可写不等于有处置权"。
  const byText = new Map()
  for (const r of records) {
    const t = String(r.text || '')
    if (!t.trim() || /^[-=_*#\s]+$/.test(t)) continue
    const arr = byText.get(t) || []
    arr.push({ file: r.file, order: r.order, kind: r.kind })
    byText.set(t, arr)
  }
  dups = [...byText.entries()]
    .filter(([, v]) => v.length > 1 && new Set(v.map((x) => x.file)).size > 1)
    .map(([text, v]) => ({ text, count: v.length, files: v }))
    .sort((a, b) => b.count - a.count || b.text.length - a.text.length)
}
if (argv.includes('--near')) {
  const cfg = { enabled: !argv.includes('--no-embed'), baseUrl: 'http://127.0.0.1:11434/v1', model: 'bge-m3', apiKeyEnv: 'EMBED_API_KEY' }
  const vecs = records.map(() => null)
  const idxs = records.map((r, i) => ({ i, t: String(r.text || '').trim() })).filter((x) => x.t)
  for (let k = 0; k < idxs.length; k += 32) {
    const chunk = idxs.slice(k, k + 32)
    const vs = await embedMany(cfg, chunk.map((x) => x.t))
    if (!vs) { nearError = `**向量不可用**（${cfg.enabled ? 'embed 调用失败/超时' : '--no-embed'}）——没有向量就没有候选；这正说明**结构规则替代不了这一步**`; break }
    vs.forEach((v, n) => { vecs[chunk[n].i] = v && v.length ? v : null })
  }
  if (!nearError) near = nearPairs(records, vecs, { topK: 5, minSim: 0.8, maxN: 400 })
}

if (AS_JSON) console.log(JSON.stringify({ bank, records: records.length, census, near, nearError, dups }, null, 2))
else {
  console.log(`断言图 · 库 ${bank} · 记录 ${records.length}`)
  console.log(`  节点 ${census.recordNodes} 记录 + ${census.anchors} 锚 · 边 ${census.edges}`)
  console.log(`  rel：answers ${census.answers} · collision ${census.collision} · commitment ${census.commitment} · relation ${census.relation} · pointsTo ${census.pointsTo} · provenance ${census.provenance} · supersede ${census.supersede}`)
  console.log(`  活跃 ${census.live} · 失效 ${census.expired} · 悬空证据 ${census.danglingEvidence}`)
  if (dups) {
    console.log(`\n跨文件同文（逐字节相同 · **只报告不删**——内容属用户，"可写不等于有处置权"）：${dups.length} 组`)
    for (const d of dups.slice(0, 12)) {
      console.log(`  ×${d.count} :: ${JSON.stringify(d.text.slice(0, 60))}`)
      console.log(`      ${d.files.map((f) => `${f.file}#${f.order}`).join('  |  ')}`)
    }
    if (dups.length) console.log('  处置建议：由**你**决定保留哪一处；本器与 `--near` 都只给证据。')
  }
  if (nearError) console.log(`\n近邻候选：${nearError}`)
  else if (near) {
    console.log(`\n近邻候选对（**同一件事的候选** · 相似 ≥0.8 · topK 5 · 参与 ${near.considered}${near.skipped ? ` · **超 maxN 未参与 ${near.skipped}**` : ''}）：${near.pairs.length} 对`)
    for (const p of near.pairs.slice(0, 10)) {
      console.log(`  ● 相似 ${p.sim.toFixed(3)}${p.samePointer ? ' · 同 pointer' : ''}`)
      console.log(`      A ${p.a.file || '(环)'}#${p.a.order} ${JSON.stringify(p.a.text.slice(0, 60))}`)
      console.log(`      B ${p.b.file || '(环)'}#${p.b.order} ${JSON.stringify(p.b.text.slice(0, 60))}`)
    }
    console.log('  ⚠ 判「重复 / 一致 / 相斥」**须交模型**——向量只能说"很像"，说不了"能不能同时成立"。本器不替模型判。')
  }
}
