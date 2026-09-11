#!/usr/bin/env node
// shadow-sim.mjs — M5 影子期**模拟测试**（v2.2 · ADR-130）
//
// 目的：不等一周真实影子数据，用「**真实库行** + 合成检索样本」把 M4 的影子期判据（R-2）跑出数字，
//   据数字决定是否翻 `scoreWeights=v2`（判据：期望翻转 ⇔ 样本≥30 ∧ |corr(importance,relevance)| ≤ 0.9 ∧ 排序不过度扰动）。
// **诚实边界（重要）**：relevance 用**词法重叠**代理（不依赖 embedding 服务），行与 importance 用**真实产品实现**
//   （lib/criteria.js#importanceOf）；因此本模拟验证的是「importance 分量与 relevance 是否冗余」这一**结构问题**，
//   不是端到端召回质量的最终裁决（后者仍需真实 A/B：recall-eval --since/--sids）。
// 用法: node scripts/shadow-sim.mjs [--bank <库根>] [--queries 60] [--json] [--out <文件>]
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
// 产品实现（importanceOf）动态解析：仓内(../lib) → $SHOUCANG_LIB → 库内/lib → profile lib。
// **依赖缺失 = 诚实跳过（exit 3）**，而不是判失败——库内布局本就没有 lib/（实测踩过：库内跑必 ERR_MODULE_NOT_FOUND）。
const importanceOf = await (async () => {
  const cands = [join(repo, 'lib', 'criteria.js'), process.env.SHOUCANG_LIB ? join(process.env.SHOUCANG_LIB, 'criteria.js') : '', join(bank, 'lib', 'criteria.js')].filter(Boolean)
  for (const p of cands) {
    if (!existsSync(p)) continue
    try { const m = await import(pathToFileURL(p).href); if (typeof m.importanceOf === 'function') return m.importanceOf } catch { /* 下一个 */ }
  }
  return null
})()
if (!importanceOf) {
  console.error('shadow-sim: 缺少产品实现 lib/criteria.js（库内布局无 lib/）→ 跳过本次影子模拟（exit 3）')
  process.exit(3)
}
const NQ = Number(argOf('--queries', '60')) || 60
const AS_JSON = argv.includes('--json')
// α 缺省**取注册表**（surface.score；单一事实源），CLI 覆盖仅用于调参扫描
const regScore = (() => {
  const cands = [join(repo, 'skill', 'engine', 'criteria.json'), join(repo, 'engine', 'criteria.json'), join(bank, 'engine', 'criteria.json')]
  for (const p of cands) { try { return JSON.parse(readFileSync(p, 'utf8')).surface?.score } catch { /* next */ } }
  return null
})()
const A_REL = Number(argOf('--alpha-rel', String(regScore?.alphaRel ?? 1.0)))
const A_IMP = Number(argOf('--alpha-imp', String(regScore?.alphaImp ?? 0.35)))
const A_REC = Number(argOf('--alpha-rec', String(regScore?.alphaRec ?? 0.1)))

// ── 真实行（索引行 + 画像行，与注入面同源）──
const FILES = ['MEMORY.md', 'USER.md', 'AGENT.md']
const rows = []
for (const f of FILES) {
  try {
    const raw = readFileSync(join(bank, f), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    for (const l of raw) {
      const tag = (l.match(/^\[([^\]]+)\]/) || l.match(/^-\s*\[([^\]]+)\]/) || [])[1] || '-'
      rows.push({ file: f, tag, line: l, kind: /^-\s/.test(l) ? 'profile' : 'index' })
    }
  } catch { /* 缺文件 */ }
}
// ── 活性（cold 行 recency 代理降低）──
const cold = new Set()
try {
  for (const l of readFileSync(join(bank, 'audit', 'activity.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean)) {
    try { const o = JSON.parse(l); if (o.status === 'cold' || o.status === 'retired') cold.add(`${o.file} §${o.section}`) } catch { /* */ }
  }
} catch { /* 无 activity */ }

// ── 合成 query：取真实行的实词片段（检索模拟的常规做法），每行最多产 1 条 ──
const STOP = new Set(['的', '了', '与', '和', '·', '/', '→', '§', 'notes', 'md', '（', '）'])
const tokensOf = (s) => String(s).replace(/[\[\]（）()·/→§]/g, ' ').split(/\s+/).map((x) => x.trim()).filter((x) => x.length >= 2 && !STOP.has(x))
const queries = []
for (const r of rows) {
  if (queries.length >= NQ) break
  const ts = tokensOf(r.line)
  if (ts.length < 2) continue
  queries.push({ q: ts.slice(1, 4).join(' '), src: r })
}
const relOf = (q, row) => {
  const qs = new Set(tokensOf(q))
  const rs = tokensOf(row.line)
  if (!qs.size || !rs.length) return 0
  let hit = 0
  for (const t of rs) if (qs.has(t)) hit++
  return hit / Math.sqrt(qs.size * rs.length) // 简化 TF 归一（词法代理）
}
const recOf = (row) => {
  const m = row.line.match(/→\s*notes\/([A-Za-z0-9_-]+)\.md\s*§([^/\s]+)/)
  if (!m) return 1
  return cold.has(`notes/${m[1]}.md §${m[2]}`) ? 0.35 : 1
}

// ── 采集 (rel, imp) 对 + 排序对比 ──
const pairs = []
let jacSum = 0, jacN = 0, impTop = { legacy: 0, v2: 0 }
const diffs = []
for (const { q } of queries) {
  const scored = rows.map((r) => {
    const rel = relOf(q, r)
    const imp = importanceOf(r.line)
    const rec = recOf(r)
    return { r, rel, imp, rec, scoreLegacy: rel, scoreV2: A_REL * rel + A_IMP * imp + A_REC * rec }
  }).filter((s) => s.rel > 0)
  if (scored.length < 3) continue
  for (const s of scored) pairs.push([s.imp, s.rel])
  const topSet = (key) => scored.slice().sort((a, b) => b[key] - a[key]).slice(0, 3)
  const A = topSet('scoreLegacy'), B = topSet('scoreV2')
  const aLines = new Set(A.map((s) => s.r.line.slice(0, 24))), bLines = new Set(B.map((s) => s.r.line.slice(0, 24)))
  const inter = [...aLines].filter((x) => bLines.has(x)).length
  const uni = new Set([...aLines, ...bLines]).size
  jacSum += uni ? inter / uni : 1
  jacN++
  // 扰动性质：v2 独有的条目 vs legacy 独有的条目，比较各自 mean(importance) 与 mean(rel)
  const onlyB = B.filter((s) => !aLines.has(s.r.line.slice(0, 24)))
  const onlyA = A.filter((s) => !bLines.has(s.r.line.slice(0, 24)))
  if (onlyB.length || onlyA.length) diffs.push({ q, v2Only: onlyB.map((s) => ({ imp: +s.imp.toFixed(3), rel: +s.rel.toFixed(3), line: s.r.line.slice(0, 48) })), legacyOnly: onlyA.map((s) => ({ imp: +s.imp.toFixed(3), rel: +s.rel.toFixed(3), line: s.r.line.slice(0, 48) })) })
}
const pearson = (xs) => {
  const n = xs.length
  if (n < 8) return null
  const mx = xs.reduce((s, p) => s + p[0], 0) / n, my = xs.reduce((s, p) => s + p[1], 0) / n
  let num = 0, dx = 0, dy = 0
  for (const [x, y] of xs) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2 }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}
const corr = pearson(pairs)
const topJaccard = jacN ? jacSum / jacN : null
// 扰动性质汇总：v2 独有条目 vs legacy 独有条目的重要性对比（>1 表示 v2 换进来的是更重要条目）
const meanOf = (arr, k) => (arr.length ? arr.reduce((s, x) => s + x[k], 0) / arr.length : null)
const v2OnlyAll = diffs.flatMap((d) => d.v2Only), legacyOnlyAll = diffs.flatMap((d) => d.legacyOnly)
const v2MeanImp = meanOf(v2OnlyAll, 'imp'), lMeanImp = meanOf(legacyOnlyAll, 'imp')
const v2MeanRel = meanOf(v2OnlyAll, 'rel'), lMeanRel = meanOf(legacyOnlyAll, 'rel')
// ── 成熟度门就绪度：若 enforce=true，会拦掉多少升格候选（拦阻率过高 ⇒ 明显过早） ──
const matRows = (() => { try { return readFileSync(join(bank, 'audit', 'maturation.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } })()
const gate = Number((() => { try { return JSON.parse(readFileSync(join(bank, 'engine', 'criteria.json'), 'utf8')).maturation.gate } catch { return 0.5 } })())
const matureN = matRows.filter((r) => Number(r.A) >= gate).length
const blockRate = matRows.length ? 1 - matureN / matRows.length : null
const maturationReady = matRows.length > 0 && blockRate !== null && blockRate <= 0.5 // 拦阻率 ≤50% 才认为门不过早
const flipReady = pairs.length >= 30 && corr !== null && Math.abs(corr) <= 0.9 && (topJaccard === null || topJaccard >= 0.6)
const out = {
  at: new Date().toISOString(),
  bank,
  samples: { rows: rows.length, queries: queries.length, pairs: pairs.length, topJaccard, diffCases: diffs.length },
  alpha: { rel: A_REL, imp: A_IMP, rec: A_REC },
  metrics: { corrImpRel: corr, v2OnlyMeanImp: v2MeanImp, legacyOnlyMeanImp: lMeanImp, v2OnlyMeanRel: v2MeanRel, legacyOnlyMeanRel: lMeanRel },
  perturbation: {
    nature: v2MeanImp !== null && lMeanImp !== null ? (v2MeanImp > lMeanImp ? 'v2 换进来的是**更重要**条目（预期行为）' : 'v2 换进来的是**更不重要**条目（需警惕）') : '无差异',
    top5: diffs.slice(0, 5),
  },
  maturationReadiness: { sections: matRows.length, mature: matureN, gate, blockRate, ready: maturationReady, note: maturationReady ? '拦阻率 ≤50%：门不过早' : `拦阻率 ${blockRate === null ? 'n/a' : (blockRate * 100).toFixed(1)}% —— enforce=true 会拦掉绝大多数升格 ⇒ **不翻**（过早）` },
  verdict: {
    flipScoreWeights: flipReady,
    flipMaturation: maturationReady,
    criteria: '打分：样本≥30 ∧ |corr|≤0.9 ∧ top-3 Jaccard≥0.6 ｜ 成熟度：拦阻率 ≤50%',
    reason: pairs.length < 30 ? '样本不足' : corr === null ? 'corr 不可算' : Math.abs(corr) > 0.9 ? `⚠ importance 与 relevance 冗余（corr=${corr.toFixed(3)}）→ R-2：删该分量而非翻转` : topJaccard !== null && topJaccard < 0.6 ? `⚠ 排序扰动过大（Jaccard=${topJaccard.toFixed(2)}）→ **不凭模拟翻转**，需真实 A/B（recall-eval --since/--sids）` : '✅ 分量不冗余且排序稳定 → 可翻 scoreWeights=v2',
  },
  note: 'relevance 为词法代理（不依赖 embedding）；importance/打分参数用产品实现（lib/criteria.js）。端到端质量仍以 recall-eval 真实 A/B 为准。',
}
if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`影子期模拟（库=${bank}）`)
  console.log(`  样本: 真实行 ${rows.length} · 合成 query ${queries.length} · (imp,rel) 对 ${pairs.length} · top-3 Jaccard ${topJaccard === null ? 'n/a' : topJaccard.toFixed(2)}`)
  console.log(`  corr(importance, relevance) = ${corr === null ? 'n/a' : corr.toFixed(3)} · 扰动性质: ${out.perturbation.nature}`)
  console.log(`  成熟度门就绪度: 小节 ${matRows.length} · 达 gate(≥${gate}) ${matureN} · 拦阻率 ${blockRate === null ? 'n/a' : (blockRate * 100).toFixed(1) + '%'} → ${maturationReady ? '可翻' : '不翻（过早）'}`)
  console.log(`  判据: ${out.verdict.criteria}`)
  console.log(`  结论: scoreWeights flipReady=${flipReady} · maturationEnforce flipReady=${maturationReady}`)
  console.log(`  说明: ${out.verdict.reason}`)
}
const outFile = argOf('--out', '')
if (outFile) { try { mkdirSync(dirname(outFile), { recursive: true }); writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8'); console.log(`已写出 ${outFile}`) } catch { /* */ } }
