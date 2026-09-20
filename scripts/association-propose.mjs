#!/usr/bin/env node
/**
 * association-propose.mjs — **联想提议**（向量空间里的"异域同构" · 2026-09-13）
 *
 * 用法：node scripts/association-propose.mjs [--bank <库根>] [--min-sim 0.72] [--max-shared 2] [--top 20] [--no-embed] [--json]
 *
 * 口径见 `src/association-propose.ts`：**跨载体 + 语义相近 + 词面不重叠**。
 * 本器**只提议、不落环**（落环由人或模型复核后走既有 association-ring 记账）。
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'suite', 'memory'))
const minSim = Number(argOf('--min-sim', '0.72'))
const maxShared = Number(argOf('--max-shared', '2'))
const topN = Number(argOf('--top', '20'))
const AS_JSON = argv.includes('--json')
if (!existsSync(join(bank, '.records', 'records.jsonl'))) { console.log(`⏭ 影子库缺席（${bank}/.records）—— 诚实跳过（exit 3）`); process.exit(3) }

const lib = (rel) => pathToFileURL(join(repoRoot, 'lib', rel)).href
const { loadStore } = await import(lib('record-shadow.js'))
const { sectionsOf, proposeAssociations } = await import(lib('association-propose.js'))
const { embedMany } = await import(lib('vec.js'))

const { records } = loadStore(bank)
const sections = sectionsOf(records)
if (!sections.length) { console.log('⏭ 未切出任何 notes 小节 —— 诚实跳过（exit 3）'); process.exit(3) }

const cfg = { enabled: !argv.includes('--no-embed'), baseUrl: 'http://127.0.0.1:11434/v1', model: 'bge-m3', apiKeyEnv: 'EMBED_API_KEY' }
// 分批嵌入（本地单次批量过大不划算；512 字符/节已是上限）
const BATCH = 32
const vecs = []
let embedded = 0
for (let i = 0; i < sections.length; i += BATCH) {
  const chunk = sections.slice(i, i + BATCH)
  const vs = await embedMany(cfg, chunk.map((s) => s.text))
  if (!vs) { vecs.length = 0; vecs.push(...sections.map(() => null)); break }
  for (const v of vs) { vecs.push(v); if (v && v.length) embedded++ }
}
const proposals = proposeAssociations(sections, vecs, { minSim, maxShared, topN })

if (AS_JSON) console.log(JSON.stringify({ bank, sections: sections.length, embedded, proposals }, null, 2))
else {
  console.log(`联想提议 · 库 ${bank}`)
  console.log(`  小节 ${sections.length} · 已嵌入 ${embedded}${embedded === 0 ? '（**向量不可用 ⇒ 无法生成联想**——这正说明纯结构规则做不了这件事）' : ''}`)
  console.log(`  判据：跨载体 + 相似 ≥${minSim} + 共词 ≤${maxShared}（**共词多 = 只是用词像，属检索不属联想**）`)
  if (!proposals.length) console.log('\n  （本次无提议——要么语义都离得远，要么近的都只是用词像）')
  for (const p of proposals) {
    console.log(`\n  ● 相似 ${p.sim.toFixed(3)} · 共词 ${p.sharedTokens}${p.shared.length ? `（${p.shared.slice(0, 4).join('/')}）` : '（**零共词**）'}`)
    console.log(`      A ${p.a.key}`)
    console.log(`        ${JSON.stringify(p.a.text.slice(0, 90))}`)
    console.log(`      B ${p.b.key}`)
    console.log(`        ${JSON.stringify(p.b.text.slice(0, 90))}`)
  }
  console.log(`\n  合计 ${proposals.length} 条提议（**只提议不落环**：落环由人或模型复核后走 association-ring 记账）`)
}
