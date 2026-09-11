#!/usr/bin/env node
// memory-reconcile.mjs — 账本对账器（v2.1 M3 · ADR-130）
//
// 三件事（对应总纲 §3 G4 统一度量）：
//   ① 行数闭合：主档实际行数 == 台账 written 累计 −（合并/退役/归档）——差异必须为 0 或**显式豁免**
//   ② 产出健康度：上次成功写入 / 连续空转轮数 / 被拒率 / 材料量 / 下次可睡
//   ③ 三层占比：P（always）/ R（任务门控）/ E（相关性门控）的条目数与注入占比
// 用法: node scripts/memory-reconcile.mjs [--bank <库根>] [--json] [--out <文件>]
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const stateRoot = argOf('--state', join(homedir(), '.dsh', 'suite', 'knowledge'))
const AS_JSON = argv.includes('--json')

const readJsonl = (p) => {
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
const auditDir = join(stateRoot, 'audit')
const ledgerPath = [join(auditDir, 'ledger.jsonl'), join(auditDir, 'judgement-ledger.jsonl')].find((p) => existsSync(p)) || join(auditDir, 'ledger.jsonl')
const ledger = readJsonl(ledgerPath)
const distillAudit = readJsonl(join(auditDir, 'distill-audit.jsonl'))
// 载体契约（层映射唯一来源）—— 兼容两种布局：仓内 skill/engine/ · 库内 engine/
const carriers = (() => {
  const cands = [join(repo, 'skill', 'engine', 'criteria.json'), join(repo, 'engine', 'criteria.json'), join(bank, 'engine', 'criteria.json')]
  for (const p of cands) { try { return JSON.parse(readFileSync(p, 'utf8')).carriers } catch { /* 下一个 */ } }
  return { tags: {} }
})()

// ── ① 行数闭合（**自举基线**：台账窗口只覆盖 M2 之后，历史行必须显式豁免，否则永远报差异 ⇒ 报警疲劳）──
//   机制：首次运行记录 `audit/row-baseline.json`（各主档当时的行数 + 时间）；此后
//   期望 = 基线 + **基线之后**的台账写入累计；`未解释差异 = 实际 − 期望`，只有它 ≠ 0 才算真问题。
const writeEvents = ledger.filter((r) => String(r.type || '').startsWith('write.'))
const exemptionEvents = ledger.filter((r) => String(r.type || '').startsWith('write.') && r.verdict && r.verdict !== 'written')
const files = ['MEMORY.md', 'USER.md', 'AGENT.md']
const countRows = (bankDir, f) => {
  try {
    const lines = readFileSync(join(bankDir, f), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    return { idx: lines.filter((l) => /^\[.+\]/.test(l)).length, prof: lines.filter((l) => /^-\s/.test(l) && /←\s*源:/.test(l)).length }
  } catch { return { idx: 0, prof: 0 } }
}
const baselinePath = join(auditDir, 'row-baseline.json')
let baseline = null
try { if (existsSync(baselinePath)) baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) } catch { /* 损坏则重建 */ }
if (!baseline) {
  const snap = { at: new Date().toISOString(), note: '行数闭合的自举基线：此前的历史行无写入回执（M2 之前），显式豁免；此后按「基线 + 台账写入累计」判定', files: {} }
  for (const f of files) { const c = countRows(bank, f); snap.files[f] = c.idx + c.prof }
  try { mkdirSync(dirname(baselinePath), { recursive: true }); writeFileSync(baselinePath, JSON.stringify(snap, null, 2), 'utf8') } catch { /* 静默 */ }
  baseline = snap
}
const baselineMs = Date.parse(baseline.at || '') || 0
const closure = files.map((f) => {
  const c = countRows(bank, f)
  const written = writeEvents.filter((r) => String(r.target || '').includes(f) && Date.parse(r.at || '') >= baselineMs).reduce((n, r) => n + Number(r.written || 0), 0)
  const attempted = writeEvents.filter((r) => String(r.target || '').includes(f) && Date.parse(r.at || '') >= baselineMs).reduce((n, r) => n + Number(r.attempted || 0), 0)
  const base = Number(baseline.files?.[f] ?? 0)
  const expected = base + written
  return { file: f, currentRows: c.idx + c.prof, indexRows: c.idx, profileRows: c.prof, baselineRows: base, writtenSinceBaseline: written, attemptedSinceBaseline: attempted, unexplained: (c.idx + c.prof) - expected }
})
const ledgerSince = ledger.length ? ledger[0].at : null
// ok ⇔ 所有文件的**未解释差异为 0**（历史行已由基线显式豁免）
const closureOk = closure.every((c) => c.unexplained === 0)

// ── ② 产出健康度 ──
const dsRows = distillAudit.filter((r) => r.kind === 'deep-sleep')
// 「有效」= completed ∧ 有落地 ∧ **门禁通过**（老行无 gate 字段时按 added>0 认定；新行必须 gate=pass，
//   否则 added 只是 gate 前的试探数——这正是 09-10 那轮 added=4/gate=行格式违规 实际 0 落地的陷阱）
const productive = (r) => r.stop === 'completed' && (Number(r.added || 0) + Number(r.replaced || 0)) > 0 && (r.gate === undefined || r.gate === 'pass')
const okRows = dsRows.filter(productive)
const lastOk = okRows.length ? okRows[okRows.length - 1].at : null
let idleStreak = 0
for (let i = dsRows.length - 1; i >= 0; i--) {
  if (productive(dsRows[i])) break
  idleStreak++
}
const rejected = writeEvents.filter((r) => r.verdict === 'rejected').length
const attemptedTotal = writeEvents.reduce((n, r) => n + Number(r.attempted || 0), 0)
const writtenTotal = writeEvents.reduce((n, r) => n + Number(r.written || 0), 0)
const rejectRate = attemptedTotal ? rejected / Math.max(1, writeEvents.length) : null
const materialChars = dsRows.slice(-10).map((r) => Number(r.chars || 0)).filter((n) => n > 0)

// ── ③ 三层占比 ──
const layerOf = (tag) => (carriers.tags?.[tag]?.layer) || 'E'
const layers = { P: { index: 0, profile: 0 }, R: { index: 0, profile: 0 }, E: { index: 0, profile: 0 } }
for (const f of files) {
  let lines = []
  try { lines = readFileSync(join(bank, f), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) } catch { /* */ }
  for (const l of lines) {
    const m = l.match(/^\[([^\]]+)\]/)
    if (m) { layers[layerOf(m[1])].index++; continue }
    const pm = l.match(/^-\s*\[([^\]]+)\]/)
    if (/←\s*源:/.test(l)) { layers[pm ? layerOf(pm[1]) : 'E'].profile++ }
  }
}
const injectProfileRows = 3 // P 层画像行每档上限（注册表 surface.injection.carriers.profile）
const pInjected = Math.min(injectProfileRows * 2, layers.P.profile) // AGENT+USER 各 ≤3
const injectShare = {
  P: layers.P.index + pInjected,
  R: 0, // 任务型门控：命中才注入（此处不计常驻）
  E: null, // 相关性门控：按档位 top-k（见注入面统计）
}

// ── ④ 成熟度与影子打分（v2.2 M4）──
// 成熟度台账在**库**内（数据属库：小节成熟度）—— `audit/maturation.jsonl` 相对库根
const matRows = readJsonl(join(bank, 'audit', 'maturation.jsonl'))
const gate = Number((() => { try { return JSON.parse(readFileSync(join(bank, 'engine', 'criteria.json'), 'utf8')).maturation.gate } catch { return 0.5 } })())
const maturation = matRows.length
  ? { sections: matRows.length, mature: matRows.filter((r) => Number(r.A) >= gate).length, gate, top: [...matRows].sort((a, b) => Number(b.A) - Number(a.A)).slice(0, 5) }
  : { sections: 0, mature: 0, gate, top: [], note: '未扫描（跑 node scripts/maturation-scan.mjs）' }
const shadowRows = readJsonl(join(auditDir, 'score-shadow.jsonl'))
const pairs = shadowRows.flatMap((r) => (r.top || []).map((t) => [Number(t.imp), Number(t.old)])).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
const pearson = (xs) => {
  const n = xs.length
  if (n < 8) return null
  const mx = xs.reduce((s, p) => s + p[0], 0) / n, my = xs.reduce((s, p) => s + p[1], 0) / n
  let num = 0, dx = 0, dy = 0
  for (const [x, y] of xs) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2 }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}
const corrImpRel = pearson(pairs)
const shadow = {
  rows: shadowRows.length, samples: pairs.length, corrImpRel,
  verdict: corrImpRel === null ? '样本不足（<8 对）' : Math.abs(corrImpRel) > 0.9 ? '⚠ importance 与 relevance 高度冗余（R-2：应删该分量）' : '✅ 分量不冗余（可进入 M5 切换评估）',
}

// ── ⑥ 笔记结构体检（**只报告建议，不自动改**——守「数据先问」：笔记是私人记忆数据）──
//   实测发现（2026-09-11）：`notes/env.md` 的 `## DSH 环境` 下挂 10 个 `###`，其中 `Windows npm 执行策略`
//   **同时**以独立 `##` 章节存在 ⇒ 主题重复 + 层级语义失真（`### 记忆库与内核概览` 显然不属于"环境"）。
const notesDir = join(bank, 'notes')
const norm = (s) => String(s).replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim()
const notesHealth = { files: 0, chapters: 0, sections: 0, crowded: [], duplicateTopics: [] }
try {
  for (const f of readdirSync(notesDir).filter((x) => x.endsWith('.md'))) {
    const t = readFileSync(join(notesDir, f), 'utf8')
    const heads = t.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^#{2,3} /.test(l))
    if (!heads.length) continue
    notesHealth.files++
    const h2 = heads.filter((l) => l.startsWith('## ')).map((l) => norm(l.slice(3)))
    const h3 = heads.filter((l) => l.startsWith('### ')).map((l) => norm(l.slice(4)))
    notesHealth.chapters += h2.length
    notesHealth.sections += h3.length
    // 章节下 ### 数量（按出现顺序归章）
    let cur = null
    const perChapter = {}
    for (const l of heads) { if (l.startsWith('## ')) { cur = norm(l.slice(3)); perChapter[cur] = 0 } else if (cur) perChapter[cur]++ }
    for (const [k, n] of Object.entries(perChapter)) if (n >= 4) notesHealth.crowded.push({ file: `notes/${f}`, chapter: k, subSections: n })
    // 同名主题既作 ### 又作 ## ⇒ 重复/错位
    for (const s of h3) if (h2.includes(s)) notesHealth.duplicateTopics.push({ file: `notes/${f}`, topic: s })
  }
} catch (e) { notesHealth.scanError = String(e && e.message ? e.message : e).slice(0, 120) } // **不静默**：扫描失败必须可见（实测踩过 ReferenceError 被裸 catch 吞成"0 文件 = 健康"）

// ⑥b **悬空指针体检**（F12 类）：索引/画像行里的 `notes/<f>.md §<名>` 必须能在该文件中解析到标题
//   解析语义**照抄读取器** `read_section.mjs`：## 或 ### 标题，大小写不敏感 + 双向包含 + 去尾部 (2026…) 后缀
const dangling = []
try {
  const headTitles = new Map() // file -> string[]（小写）
  for (const f of readdirSync(notesDir).filter((x) => x.endsWith('.md'))) {
    headTitles.set(f, readFileSync(join(notesDir, f), 'utf8').split(/\r?\n/).map((l) => l.match(/^(#{2,3})\s+(.*)$/)).filter(Boolean).map((m) => m[2].trim().toLowerCase()))
  }
  const coreOf = (s) => String(s).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim().toLowerCase()
  const resolve = (file, name) => {
    const heads = headTitles.get(file)
    if (!heads) return false
    const kw = coreOf(name)
    return heads.some((t) => { const tt = coreOf(t); return tt === kw || tt.includes(kw) || kw.includes(tt) })
  }
  const sources = ['MEMORY.md', 'USER.md', 'AGENT.md', 'notes/INDEX.md']
  for (const src of sources) {
    let text = ''
    try { text = readFileSync(join(bank, src), 'utf8') } catch { continue }
    for (const m of text.matchAll(/notes\/([A-Za-z0-9_-]+)\.md\s*§([^\s/、，,）)]+)/g)) {
      if (!resolve(`${m[1]}.md`, m[2])) dangling.push({ from: src, ref: `notes/${m[1]}.md §${m[2]}` })
    }
  }
  notesHealth.danglingPointers = dangling
} catch (e) { notesHealth.danglingError = String(e && e.message ? e.message : e).slice(0, 120) }

const out = {
  window: { bank, stateRoot, ledgerPath, ledgerSince, ledgerRows: ledger.length },
  closure: { ok: closureOk, note: `自举基线（${baseline.at}）：此前历史行无回执，显式豁免；闭合只判定「基线之后」的未解释差异`, baseline, files: closure },
  health: {
    lastSuccessfulWrite: lastOk,
    deepSleepRounds: dsRows.length,
    idleStreak,
    writeEvents: writeEvents.length,
    rejectedWrites: rejected,
    rejectRate,
    attemptedTotal,
    writtenTotal,
    materialCharsRecent: materialChars,
  },
  layers: { counts: layers, injectShare, profileCap: injectProfileRows },
  maturation,
  shadow,
  notesHealth,
  samples: { ledgerRows: ledger.length, writeEvents: writeEvents.length, distillAuditRows: distillAudit.length, exemptionEvents: exemptionEvents.length },
}
const outFile = argOf('--out', '')
if (AS_JSON) {
  const body = JSON.stringify(out, null, 2)
  if (outFile) { mkdirSync(dirname(outFile), { recursive: true }); writeFileSync(outFile, body, 'utf8'); console.log(`已写出 ${outFile}`) } else console.log(body)
} else {
  const pct = (v) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`)
  console.log(`账本对账（库=${bank}）`)
  console.log(`  台账: ${ledgerPath.split(/[\\/]/).pop()} · ${ledger.length} 行 · 起点 ${ledgerSince || '（空）'}`)
  console.log(`  ① 闭合: ${closureOk ? '✅ 未解释差异 0' : '⚠ 有未解释差异（见下）'}（自举基线 ${String(baseline.at).slice(0, 19)}；历史行显式豁免）`)
  for (const c of out.closure.files) console.log(`     ${c.file}: 实际 ${c.currentRows} 行（索引 ${c.indexRows} + 画像 ${c.profileRows}）· 基线 ${c.baselineRows} + 台账写入 ${c.writtenSinceBaseline}（尝试 ${c.attemptedSinceBaseline}）· **未解释 ${c.unexplained}**`)
  console.log(`  ② 健康: 上次有效深睡 ${lastOk || '（无）'} · 连续空转 ${idleStreak} 轮 · 被拒率 ${pct(rejectRate)}（${rejected}/${writeEvents.length} 次写事件）`)
  console.log(`  ③ 三层: P ${layers.P.index} 索引 + ${layers.P.profile} 画像 · R ${layers.R.index} · E ${layers.E.index} 索引 + ${layers.E.profile} 画像`)
  console.log(`     注入占比（估算）: P ${injectShare.P} 行（含画像 ≤${injectProfileRows}/档）· R 按任务命中 · E 按相关性 top-k`)
  console.log(`  ④ 成熟度: 小节 ${maturation.sections} 个 · 达 gate(≥${maturation.gate}) ${maturation.mature} 个${maturation.note ? '（' + maturation.note + '）' : ''}`)
  console.log(`  ⑤ 影子打分: ${shadow.rows} 行 / ${shadow.samples} 样本 · corr(importance,relevance)=${shadow.corrImpRel === null ? 'n/a' : shadow.corrImpRel.toFixed(3)} → ${shadow.verdict}`)
  console.log(`  ⑥ 笔记结构体检（**建议，不自动改**——私人数据先问）：${notesHealth.files} 文件 / ${notesHealth.chapters} 章节 / ${notesHealth.sections} 子节`)
  // 子节多的章节**只作信息**（同质章节是健康的组织方式；用任意阈值报 ⚠ 会造成报警疲劳）
  for (const c of notesHealth.crowded) console.log(`     ℹ ${c.file} 的「${c.chapter}」含 ${c.subSections} 个子节（若为同质主题则属正常，仅展示）`)
  for (const d of notesHealth.duplicateTopics) console.log(`     ⚠ ${d.file}：「${d.topic}」既作 ### 又作 ##（同名主题重复/错位 ⇒ 应合并）`)
  const dg = notesHealth.danglingPointers || []
  if (dg.length) for (const x of dg) console.log(`     ❌ **悬空指针**：${x.from} → ${x.ref}（该小节在目标文件里不存在；写门视之为 exit=2 硬错）`)
  if (!notesHealth.crowded.length && !notesHealth.duplicateTopics.length && !dg.length) console.log('     ✅ 未发现层级错位 / 主题重复 / 悬空指针')
  if (notesHealth.scanError) console.log(`     ⚠ 结构扫描失败（不静默）：${notesHealth.scanError}`)
}
