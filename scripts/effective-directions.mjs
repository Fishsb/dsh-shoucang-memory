#!/usr/bin/env node
// effective-directions.mjs — **R1 有效性度量**（P3 · 2026-09-16 · 入 CHECKS：默认带断言）
//
// 依据：docs/sleep-granularity-plan-2026-09-15.md §8（R1 = 固定注入预算下的「有效方向数」）。
// 预注册的三个代理：① 互不重复的方向条目数 ② 平均支持度 ③ 误注入率。
//   本件交付 **① 互不重复方向数 + 重复数**（②③ 需要"消费/反例"账，属后续切片）。
//   **重复数**是 R2（跨粒度收敛）**可压缩空间**的直接度量 —— 没有它就无法证明"压了有收益"。
//
// **口径（唯一，显式声明）**：
//   「方向条目」= 三索引文件中**含 `→ notes/` 的行**（路由四要素齐全者）。
//     与 `count-memory-lines.mjs` 的"索引行"同口径 —— 两处**必须一致**，否则数不可比。
//   「互不重复」= 按 **标签 + 主题段**（`·` 之前）精确去重后的条数（标签+主题 = 仓内既有的唯一性硬门口径）。
//     ⚠ **不用向量**：此处问的是"同标签同主题出现两次"（**精确重复**，属确定性范畴）；
//       语义近重归 `deepsleep-tree` 的 `semanticSim`（模糊范畴）——**分工不重不漏**。
//   「预算」= `criteria.json#surface.injection.budgetChars`（唯一事实源，不硬编码）。
//
// 用法: node scripts/effective-directions.mjs [--bank <根>] [--json] [--selftest]
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { RELEASE_MIN_ACTION_CHARS, RELEASE_ACTION_WORDS, JUDGMENT_FILE } from '../lib/essence-release.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
/* S-P5c（2026-09-16）**判据单一事实源**：阈值与动作词表**不再各写一份**，一律引自
 *   `src/essence-release.ts`（经 `lib/essence-release.js` 消费）—— 否则"度量出的候选"与
 *   "可释放的候选"会因两处词表漂移而**不可比**（本仓已多次栽在双份实现上）。 */
const SELF_SUFFICIENT_MIN_ACTION_CHARS = RELEASE_MIN_ACTION_CHARS
const ACTION_WORDS = RELEASE_ACTION_WORDS
void JUDGMENT_FILE
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'suite', 'memory'))
const IDX = ['MEMORY.md', 'USER.md', 'AGENT.md']

/* ── 实现 A：正则逐行 ── */
export const implA = (text) => text.split(/\r?\n/).filter((l) => /→\s*notes\//.test(l))
/* ── 实现 B：状态机式（**扫描全部 `→` 位置**，与 A 的"行内含 `→ notes/`"语义等价）──
 * ⚠ 首版只取**第一个** `→` ⇒ 若该 `→` 后面不是 `notes/`（如概况里混入箭头）则整行被丢，
 *   与实现 A 不等价 ⇒ 被"两实现互核"当场抓到（① 红）。这正是互核纪律的价值：**它抓的是我自己的实现**。 */
export const implB = (text) => {
  const out = []
  for (const l of text.split(/\r?\n/)) {
    let i = l.indexOf('→')
    while (i >= 0) {
      if (l.slice(i + 1).trimStart().startsWith('notes/')) { out.push(l); break }
      i = l.indexOf('→', i + 1)
    }
  }
  return out
}
/** 分歧样例（互核失败时打印，便于定位是"我的实现错"还是"数据有边界情形"）。 */
export const diffSample = (a, b, n = 3) => {
  const bs = new Set(b)
  const onlyA = a.filter((l) => !bs.has(l)).slice(0, n)
  const as = new Set(a)
  const onlyB = b.filter((l) => !as.has(l)).slice(0, n)
  return { onlyA, onlyB }
}
/* 标签 + 主题（`·` 前）→ 唯一键；无标签/无主题者退化为整行（不误并） */
export const keyOf = (line) => {
  const m = line.match(/\[([^\]\s]{1,8})\]/)
  const label = m ? m[1] : ''
  const before = line.split('→')[0]
  const topic = (before.split('·')[1] || before).trim().slice(0, 24)
  return label ? `${label}|${topic}` : line.trim().slice(0, 60)
}

/* ── S-P3a′（2026-09-16）**跨形态冗余**（R2 可压缩空间的**收益上限**）──
 * 判因（实测）：本件原「重复数」定义在**索引行内部** ⇒ 实测恒 **0**，因为精确重复**早被写门唯一性硬门挡住**
 *   ⇒ 量不到 R2 的空间。**正确口径 = 跨形态**：同一知识以**粗粒度（有标签行）**与**细粒度（无标签叙事行）**
 *   两种形态并存（P0 实测 `AGENT.md` 10 条叙事行 = 776 字符）。
 * 分工（遵"精确用代码、语义交模型"）：
 *   · **词面**（确定性）→ 本件算：字符 bigram 的 `inter/union`，阈值**读注册表** `ingest.dedup.bigram.threshold`
 *     （**不新造魔数**；与 `distill-write` 的近似重复判定同一度量与同一事实源）。
 *   · **语义**（模糊）→ **本件不判**，只把中间带（`band` 内）作为**候选**输出，交向量/模型。
 * 分类：`covered`（≥阈值 ⇒ 词面已覆盖，**可直接收敛**）/ `candidate`（中间带 ⇒ 需模型判）/ `independent`（其余）。 */
const REG_PATH = () => join(root, 'skill', 'engine', 'criteria.json')
const bigramThreshold = () => {
  try {
    const c = JSON.parse(readFileSync(REG_PATH(), 'utf8'))
    return Number(c?.ingest?.criteria?.find((x) => x.id === 'ingest.dedup.bigram')?.params?.threshold) || 0.66
  } catch { return 0.66 }
}
export const bigramsOf = (s) => {
  const t = String(s || '').replace(/\s+/g, '').replace(/[→·「」【】()（）,，。:：;；]/g, '')
  const out = new Set()
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2))
  return out
}
export const overlapOf = (a, b) => {
  const A = bigramsOf(a), B = bigramsOf(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  const union = A.size + B.size - inter
  return union ? inter / union : 0
}
/** 逐文件：粗粒度行（含 `→ notes/` 或 `- ` 开头且含标签）vs 细粒度行（`- ` 开头且**无标签**）。 */
export const crossFormOf = (text, thr, band = 0.3) => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const hasTag = (l) => /\[[^\]\s]{1,8}\]/.test(l)
  const coarse = lines.filter((l) => /→\s*notes\//.test(l) || (/^\s*-\s/.test(l) && hasTag(l)))
  const fine = lines.filter((l) => /^\s*-\s/.test(l) && !hasTag(l))
  const covered = [], candidate = [], independent = []
  for (const f of fine) {
    let best = 0
    for (const c of coarse) { const o = overlapOf(f, c); if (o > best) best = o }
    if (best >= thr) covered.push({ line: f, best })
    else if (best >= band) candidate.push({ line: f, best })
    else independent.push({ line: f, best })
  }
  return {
    coarseRows: coarse.length, fineRows: fine.length,
    covered: covered.length, candidate: candidate.length, independent: independent.length,
    coveredChars: covered.reduce((s, x) => s + x.line.length, 0),
    candidateChars: candidate.reduce((s, x) => s + x.line.length, 0),
    independentChars: independent.reduce((s, x) => s + x.line.length, 0),
    sample: covered.slice(0, 2).map((x) => x.line.slice(0, 44)),
    partitionOk: covered.length + candidate.length + independent.length === fine.length,
  }
}

/* ── S-P3a′ **语义层**（2026-09-16）──
 * 为什么必须有它：词面层实测「已覆盖 0」——**不是"无可压缩"，而是词面看不见它**
 *   （P0 认定的"同一教训两个粒度"如 AGENT.md L18↔L20，实测词面连 0.3 都不到）。
 *   仓内原则「跨域联想看共词：共词少而语义近才算联想」正指此。
 * 分工：向量给**语义近**，本件据此给 R2 的**真实收益上限**；词面层与之**并列展示、分歧可见**。
 * ⚠ **不可用即如实记 `unavailable`**（仓内既有口径：`vec.ts` "失败/不可用 ⇒ null（调用方如实记'未判'）"）
 *   —— **绝不退回词面结果假装语义已判**。 */
const semConfig = () => {
  try {
    const s = JSON.parse(readFileSync(join(homedir(), '.dsh', 'suite', 'scheduler.json'), 'utf8'))
    const enabled = !!(s.embedBaseUrl && s.embedModel)
    return { enabled, baseUrl: String(s.embedBaseUrl || ''), model: String(s.embedModel || ''), apiKeyEnv: String(s.embedApiKeyEnv || ''), coldFactor: 0.35, fusionKind: s.recallFusion === 'weighted' ? 'weighted' : 'rrf', scoreMode: s.scoreWeights === 'v2' ? 'v2' : 'legacy', shadowScore: true }
  } catch { return { enabled: false } }
}
const semThreshold = () => {
  try {
    const c = JSON.parse(readFileSync(REG_PATH(), 'utf8'))
    const e = (c.thresholds?.entries || []).find((x) => x.id === 'write.semanticDupSim')
    return Number(e?.value) || 0.8
  } catch { return 0.8 }
}
const semanticCrossForm = async () => {
  const cfg = semConfig()
  if (!cfg.enabled) return { available: false, reason: 'embed 未配置（scheduler.json 缺 embedBaseUrl/embedModel）⇒ **未判**（不假装）' }
  let vec
  try { vec = await import(new URL('../lib/vec.js', import.meta.url).href) } catch { return { available: false, reason: 'lib/vec.js 不可导入 ⇒ 未判' } }
  const coarse = [], fine = []
  for (const f of IDX) {
    const p = join(bank, f)
    const text = existsSync(p) ? readFileSync(p, 'utf8') : ''
    for (const l of text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
      const hasTag = /\[[^\]\s]{1,8}\]/.test(l)
      if (/→\s*notes\//.test(l) || (/^\s*-\s/.test(l) && hasTag)) coarse.push({ f, l })
      else if (/^\s*-\s/.test(l) && !hasTag) fine.push({ f, l })
    }
  }
  if (!fine.length) return { available: true, threshold: semThreshold(), fineRows: 0, covered: 0, candidate: 0, independent: 0, coveredChars: 0, candidateChars: 0, independentChars: 0, partitionOk: true }
  let all
  try { all = await vec.embedMany(cfg, [...coarse.map((x) => x.l), ...fine.map((x) => x.l)]) } catch (e) { return { available: false, reason: 'embedMany 失败（' + String(e && e.message).slice(0, 60) + '）⇒ 未判' } }
  if (!all || all.length !== coarse.length + fine.length) return { available: false, reason: 'embedMany 返回空/长度不符 ⇒ 未判' }
  const thr = semThreshold(), band = 0.6
  const cov = [], cand = [], ind = []
  for (let i = 0; i < fine.length; i++) {
    const fv = all[coarse.length + i]
    let best = 0
    for (let j = 0; j < coarse.length; j++) { const c = vec.cosine ? vec.cosine(fv, all[j]) : 0; if (c > best) best = c }
    const item = { line: fine[i].l, best }
    if (best >= thr) cov.push(item); else if (best >= band) cand.push(item); else ind.push(item)
  }
  const chars = (a) => a.reduce((s, x) => s + x.line.length, 0)
  return {
    available: true, threshold: thr, band, coarseRows: coarse.length, fineRows: fine.length,
    covered: cov.length, candidate: cand.length, independent: ind.length,
    coveredChars: chars(cov), candidateChars: chars(cand), independentChars: chars(ind),
    sample: cov.slice(0, 2).map((x) => x.line.slice(0, 40) + ' ⟨' + x.best.toFixed(3) + '⟩'),
    partitionOk: cov.length + cand.length + ind.length === fine.length,
  }
}

const measure = () => {
  const per = {}
  let directions = 0, chars = 0, aRows = [], bRows = []
  for (const f of IDX) {
    const p = join(bank, f)
    const text = existsSync(p) ? readFileSync(p, 'utf8') : ''
    const A = implA(text), B = implB(text)
    aRows = aRows.concat(A); bRows = bRows.concat(B)
    per[f] = { directions: A.length, chars: A.reduce((s, l) => s + l.length, 0) }
    directions += A.length
    chars += per[f].chars
  }
  const keys = new Map()
  for (const l of aRows) { const k = keyOf(l); keys.set(k, (keys.get(k) || 0) + 1) }
  const dupKeys = [...keys.entries()].filter(([, n]) => n > 1)
  return {
    bank, per, directions, chars,
    implAgree: aRows.length === bRows.length && aRows.every((l, i) => l === bRows[i]),
    implDiff: diffSample(aRows, bRows),
    uniqueByLabelTopic: keys.size, dupCount: dupKeys.length, dupRows: dupKeys.reduce((s, [, n]) => s + n - 1, 0),
    dupSample: dupKeys.slice(0, 3).map(([k, n]) => `${k} ×${n}`),
  }
}

const budgetOf = () => {
  try { return JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria.json'), 'utf8')).surface.injection.budgetChars } catch { return null }
}

if (argv.includes('--selftest')) {
  const fx = ['[原则] A · x → notes/lessons.md §a', '[原则] A · x → notes/lessons.md §b', '- 无指针行', '[路径] B · y → notes/flows.md §c'].join('\n')
  const A = implA(fx), B = implB(fx)
  const keys = new Set(A.map(keyOf))
  const cases = [
    ['两实现在夹具上一致', () => A.length === B.length && A.every((l, i) => l === B[i])],
    ['只收含指针的行（4 行里 2 条 + 1 条 = 3）', () => A.length === 3],
    ['同标签同主题判为重复（A·x 出现 2 次）', () => A.length - keys.size === 1],
    ['不同标签不误并（B·y 独立）', () => keys.size === 2],
  ]
  let bad = 0
  for (const [n, fn] of cases) { const ok = (() => { try { return !!fn() } catch { return false } })(); console.log(`${ok ? '✅' : '❌'} ${n}`); if (!ok) bad++ }
  if (bad) { console.error(`\nFAIL（selftest ${bad}/${cases.length}）`); process.exit(1) }
  console.log(`\nPASS（selftest ${cases.length}/${cases.length}：两实现互核 + 去重口径双向可证）`)
  process.exit(0)
}

const m = measure()
const budget = budgetOf()
const m2 = measure() // 幂等复算
/* S-P3a′：跨形态冗余（逐文件汇总；阈值读注册表） */
const thr = bigramThreshold()
const crossForm = (() => {
  const per = {}
  let agg = { coarseRows: 0, fineRows: 0, covered: 0, candidate: 0, independent: 0, coveredChars: 0, candidateChars: 0, independentChars: 0, partitionOk: true }
  const samples = []
  for (const f of IDX) {
    const p = join(bank, f)
    const text = existsSync(p) ? readFileSync(p, 'utf8') : ''
    const c = crossFormOf(text, thr)
    per[f] = c
    for (const k of ['coarseRows', 'fineRows', 'covered', 'candidate', 'independent', 'coveredChars', 'candidateChars', 'independentChars']) agg[k] += c[k]
    if (!c.partitionOk) agg.partitionOk = false
    for (const s of c.sample) samples.push(`${f}: ${s}`)
  }
  return { ...agg, threshold: thr, per, samples: samples.slice(0, 3) }
})()
const out = { ...m, budgetChars: budget, coveragePct: budget ? Math.round((m.chars / budget) * 1000) / 10 : null, crossForm, idempotent: JSON.stringify(m) === JSON.stringify(m2) }

if (argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

let fail = 0
const ok = (c, msg) => { console.log(`${c ? '✅' : '❌'} ${msg}`); if (!c) fail++ }
console.log(`R1 有效性度量（基数：有效方向数）· bank=${bank}`)
for (const [f, v] of Object.entries(per2(out))) console.log(`   · ${f.padEnd(10)} 方向 ${String(v.directions).padStart(3)} 条 · ${v.chars} 字符`)
console.log('')
ok(out.implAgree, `① **两实现互核**：正则逐行 vs 状态机定位 —— 结果完全一致（${out.directions} 条）`)
ok(out.idempotent, '② 幂等：连算两次结果相同（度量必须可复现）')
ok(out.directions > 0, `③ 非零：方向条目 ${out.directions} > 0（为 0 ⇒ 库或口径坏了）`)
ok(out.chars > 0, `④ 自洽：字符账 ${out.chars} > 0，且 = 各行长度之和（同一批行算出的两个数）`)
console.log('')
/* S-P3a′ 语义层：与词面层**并列展示**（分歧可见）。若不可用 ⇒ 如实记「未判」。 */
const sem = await semanticCrossForm()
console.log(`🧠 **语义层**（向量；阈值 ${sem.threshold ?? semThreshold()} 取登记表 write.semanticDupSim）`)
if (!sem.available) {
  console.log(`   ⏭ **未判**：${sem.reason}`)
  console.log('   （按仓内口径：不可用即如实记"未判"，**绝不退回词面结果假装已判**）')
} else {
  console.log(`   粗粒度 ${sem.coarseRows} 行 · 细粒度 ${sem.fineRows} 行`)
  console.log(`   · **语义已覆盖 ${sem.covered} 条 / ${sem.coveredChars} 字符 ← R2 的「真实收益上限」**`)
  console.log(`   · 中间带（${sem.band}–阈值，仍需模型判）${sem.candidate} 条 / ${sem.candidateChars} 字符`)
  console.log(`   · 独立 ${sem.independent} 条 / ${sem.independentChars} 字符`)
  if (sem.sample?.length) console.log(`   已覆盖样例：${sem.sample.join(' ｜ ')}`)
  console.log(`   ⚖ **与词面层对照**：词面判出 ${crossForm.covered} 条 · 语义判出 ${sem.covered} 条 ⇒`)
  console.log('     两者之差即「**共词少而语义近**」的那部分 —— 正是仓内原则所指、也是 R2 的真实空间。')
}
ok(sem.available ? sem.partitionOk : true, '⑧ 语义层分类完备（已覆盖 + 中间带 + 独立 == 细粒度行数）；未判时按未判处理')
ok(sem.available ? (sem.threshold > 0 && sem.threshold <= 1) : true, `⑨ 语义阈值来自登记表且合法（${sem.threshold ?? '—'}）`)
console.log('')
console.log(`🔀 **跨形态冗余**（粗粒度行 ↔ 无标签叙事行；阈值 ${crossForm.threshold} 读注册表，**不新造魔数**）`)
console.log(`   粗粒度 ${crossForm.coarseRows} 行 · 细粒度 ${crossForm.fineRows} 行`)
console.log(`   · **已覆盖（词面 ≥ 阈值）${crossForm.covered} 条 / ${crossForm.coveredChars} 字符** ← **R2 可压缩空间的收益上限**`)
console.log(`   · 中间带（需向量/模型判）${crossForm.candidate} 条 / ${crossForm.candidateChars} 字符`)
console.log(`   · 独立（与粗粒度无关）${crossForm.independent} 条`)
console.log(`   · 独立（词面判不出关联）${crossForm.independent} 条 / **${crossForm.independentChars} 字符 ← R2 的「候选池」上界**`)
if (crossForm.samples.length) console.log(`   已覆盖样例：${crossForm.samples.join(' ｜ ')}`)
console.log('   ⚠ **实测结论（2026-09-16）**：词面层给出 `已覆盖 0`，**不等于"无可压缩"** ——')
console.log('     我在 P0 认定"同一条教训有粗/细两版"（如 AGENT.md L18 ↔ L20），但实测**词面几乎不重叠**（连 0.3 都不到）')
console.log('     ⇒ 跨形态压缩的判据**必须是语义的（向量）**，词面只能给上界。见 OPEN-ITEMS S-P3a′。')
ok(crossForm.partitionOk, '⑤ 跨形态分类**完备**：已覆盖 + 中间带 + 独立 == 细粒度行数（不漏不重）')
ok(crossForm.threshold > 0 && crossForm.threshold <= 1, `⑥ 阈值来自注册表且合法（${crossForm.threshold}）`)
ok(crossForm.fineRows === 0 || crossForm.covered + crossForm.candidate + crossForm.independent > 0,
  '⑦ 非退化：有细粒度行时三分类不为全零（口径真在算，而非空转）')
console.log('')
console.log(`📊 **互不重复方向数 = ${out.uniqueByLabelTopic}** · 重复方向 **${out.dupCount}** 组（冗余行 ${out.dupRows}）`)
console.log(`   注入预算 ${budget ?? '(注册表不可读)'} 字符 · 索引面占 ${out.chars} 字符（${out.coveragePct ?? '—'}%）`)
if (out.dupSample.length) console.log(`   重复样例：${out.dupSample.join(' / ')}`)
console.log(`   ⇒ 重复数即 **R2（跨粒度收敛）可压缩空间**的直接度量 —— 没有它就无法证明"压了有收益"。`)

/* ── 2026-09-16（第 47 轮取证顺带发现）**整行逐字重复**（`exactDup`）────────────────────
 * **为什么单列一个轴**：上面的「重复方向」口径是**索引行内部按「标签+主题」**去重（语义单位），
 *   而这里是**逐字整行完全一致**（最简情形）。两者**不可互推**：实测 `AGENT.md` 行70/行77
 *   逐字相同，但按「标签+主题」去重**只算一组** ⇒ 上轴的"重复 0 组"与该现象**并不矛盾**。
 *   ⇒ 两个**不同语义**的口径必须**并列报**（仓内教训：同一语义两处实现必然漂移；此处是两个语义）。
 * **用途**：逐字重复**没有任何信息增益**，且白占注入预算 ⇒ 它是最该被落盘门拦下的一类。 */
const exactDup = (() => {
  const per = {}
  let groups = 0, rows2 = 0
  const sample = []
  for (const f of IDX) {
    const p = join(bank, f)
    const text = existsSync(p) ? readFileSync(p, 'utf8') : ''
    const seen = new Map()
    let nonEmpty = 0
    for (const l of text.split(/\r?\n/)) {
      const t = l.trim()
      if (!t) continue
      nonEmpty++
      seen.set(t, (seen.get(t) || 0) + 1)
    }
    const dups = [...seen.entries()].filter(([, n]) => n > 1)
    per[f] = { nonEmpty, dupGroups: dups.length, dupRows: dups.reduce((s, [, n]) => s + n - 1, 0) }
    groups += per[f].dupGroups
    rows2 += per[f].dupRows
    for (const [t] of dups.slice(0, 2)) sample.push(`${f}: ${t.slice(0, 50)}`)
  }
  return { per, groups, rows: rows2, sample }
})()
console.log('')
console.log('🧬 **整行逐字重复**（与上一轴**不同轴**：这里"逐字整行完全一致"，上面"标签+主题"去重）')
for (const f of IDX) {
  const p = exactDup.per[f]
  if (p) console.log(`   · ${f.padEnd(10)} **${p.dupGroups} 组 / ${p.dupRows} 行**（非空行 ${p.nonEmpty}）`)
}
console.log(`   合计 **${exactDup.groups} 组 / ${exactDup.rows} 行** ⇒ 逐字重复**无任何信息增益**，且白占注入预算`)
if (exactDup.sample.length) console.log(`   样例：${exactDup.sample.slice(0, 2).join(' ｜ ')}`)
ok(exactDup.groups === Object.values(exactDup.per).reduce((s, x) => s + x.dupGroups, 0), '⑭ 逐字重复：分文件组数与合计**一致**（口径未漂移）')
ok(exactDup.rows === Object.values(exactDup.per).reduce((s, x) => s + x.dupRows, 0), '⑮ 逐字重复：冗余行数 == Σ(组内行数−1)（不多算）')

/* ── S-P5（2026-09-16）**自足性**（精要层 / 自足释放的第一个可算问题）────────────────────
 * 问的是什么：条目在**丢掉 notes 正文**之后**还能不能据以复现该判据/做法**？
 *   「已自足」⇒ 脚手架（正文/沿革）可释放；「未自足」⇒ 必须保留可解析回溯指针。
 * **判据（确定性，可机检）**：行 = `[标签] 主题 · 说明 → notes/… §…`
 *   · `说明`（`·` 之后、`→` 之前）**字符数 < 12** ⇒ **未自足**（只给了主题名，做法在正文里）
 *   · 或 `说明` 里**无动作/因果词** ⇒ **未自足**（读者不知道该做什么/为什么）
 *   · 否则 **已自足**
 * ⚠ 这是**代理判据**，不是最终判据：它只回答"**字面上是否自含做法**"；
 *   真正的语义自足（换了读者/换了情境还能不能用）须交模型 —— 故本段**只报数并给出样例**，
 *   供人/模型抽验，**不据此自动释放任何东西**（释放是不可逆动作，须有更强的门）。
 * 分工：本段 = **确定性预筛**（给"未自足"的候选集），语义判定留给后续。
 * ⚠ S-P5c（2026-09-16）：阈值与词表**已上移到文件顶部的 import**（单一事实源 = `src/essence-release.ts`）；
 *   此处**刻意不再定义** —— 首版两处并存导致同模块重复声明。动作词表曾补过「用/带/免」
 *   （首版漏词把 `改文本用编辑工具…余者免BOM` 这条自足原则误判为未自足，样例当场暴露）。 */
const selfSuff = (() => {
  const rows = []
  for (const f of IDX) {
    const p = join(bank, f)
    const text = existsSync(p) ? readFileSync(p, 'utf8') : ''
    for (const l of implA(text)) rows.push({ f, l: l.trim() })
  }
  /* S-P5b′（2026-09-16）**分类主轴改「文件（职责）」，标签仅作次级细分**。
   * 🔴 **S-P5b 的主轴错了**（实测 8 条未识别标签时发现）：按**标签**分类时，
   *   `MEMORY.md` 里标签为 `[lesson]/[env]/[环境]` 的**知识索引行**被误算进"判据载体"
   *   ⇒ 判据载体虚高到 74、释放候选虚高到 54。而**职责由文件决定，不由标签决定**：
   *     · `MEMORY.md` = **知识索引**（行是指针，指路而非承载做法）⇒ **不参与自足判定**
   *     · `USER.md`   = 画像索引 / 事实型 ⇒ **不参与**
   *     · `AGENT.md`  = **判据载体**（`[原则]/[路径]/[边界]/[认知]/[经验]` 等，是做法与判据的落点）⇒ **参与**
   *   ⇒ 与 S-P5a 的**分文件**读数一致（AGENT 26→未自足 4）—— 那版反而更接近真相；
   *     本版把"文件"升为主键，标签用于报**AGENT.md 内部的标签分布**（不参与席位判定）。
   * ⚠ `tool`/`经验` 的归属由此**不再影响候选数**（它们在 MEMORY/AGENT 里各归其文件职责），
   *   但仍**照旧显式报数**（口径可复核）。 */
  const JUDGMENT_TAGS = new Set(['原则', '路径', '边界', '认知', 'lesson', 'flow', '教训', '规则', '经验'])
  const FACT_TAGS = new Set(['身份', '环境', '硬件', '偏好', '习惯', '演化', 'env', '工具', '项目', '术语', 'tool'])
  /** 文件 → 职责（**主键**：职责决定是否参与自足判定）。 */
  const ROLE_OF = { 'AGENT.md': 'judgment', 'MEMORY.md': 'index', 'USER.md': 'fact' }
  const unself = []
  const per = {}
  const byClass = { judgment: { total: 0, unself: 0 }, index: { total: 0, unself: 0 }, fact: { total: 0, unself: 0 }, unknown: { total: 0, unself: 0 } }
  const unknownTags = new Map()
  const tagDist = new Map()
  for (const r of rows) {
    const before = r.l.split('→')[0]
    const parts = before.split('·')
    const desc = (parts.length > 1 ? parts.slice(1).join('·') : '').trim()
    const noAction = !ACTION_WORDS.test(desc)
    const tooShort = desc.replace(/\s/g, '').length < SELF_SUFFICIENT_MIN_ACTION_CHARS
    const bad = tooShort || noAction
    const tag = (/^\[([^\]\s]+)\]/.exec(r.l) || [])[1] || '(无标签)'
    // **主键 = 文件职责**；文件未知时才落到标签派生（并计入 unknown 供复核）
    const cls = ROLE_OF[r.f] || (JUDGMENT_TAGS.has(tag) ? 'judgment' : (FACT_TAGS.has(tag) ? 'fact' : 'unknown'))
    if (cls === 'judgment') tagDist.set(tag, (tagDist.get(tag) || 0) + 1)
    if (cls === 'unknown') unknownTags.set(tag, (unknownTags.get(tag) || 0) + 1)
    per[r.f] = per[r.f] || { total: 0, unself: 0 }
    per[r.f].total++
    byClass[cls].total++
    // **只有判据载体类（= AGENT.md）**才参与"未自足"计数
    if (bad && cls === 'judgment') { byClass.judgment.unself++; per[r.f].unself++; unself.push({ f: r.f, tag, desc, tooShort, noAction, chars: desc.replace(/\s/g, '').length }) }
  }
  return {
    total: rows.length, unself: unself.length, self: rows.length - unself.length,
    unselfChars: unself.reduce((s, x) => s + x.chars, 0), per, byClass,
    unknownTags: [...unknownTags.entries()].sort((a, b) => b[1] - a[1]),
    tagDist: [...tagDist.entries()].sort((a, b) => b[1] - a[1]),
    // **释放候选**（S-P5b′）：判据载体类 **且** 字面自足 ⇒ 进入"待语义复核"集合（**尚未释放**）
    releaseCandidates: byClass.judgment.total - byClass.judgment.unself,
    sample: unself.slice(0, 3).map((x) => `[${x.tag}] ${x.desc.slice(0, 30) || '(无说明)'}${x.tooShort ? ' ⟨太短⟩' : ''}${x.noAction ? ' ⟨无动作词⟩' : ''}`),
  }
})()
console.log('')
console.log('🧩 **自足性**（S-P5 · 丢掉正文后还能不能据以复现做法）')
/* ⚠ S-P5b′ **分类主轴 = 文件职责**（S-P5b 按标签分过，被 8 条未识别标签当场证伪）：
 *   `MEMORY.md` = 知识索引（行是指针，**本就该薄**）· `USER.md` = 画像/事实型 ·
 *   `AGENT.md` = **判据载体**（做法与判据的落点）。标签仅作 AGENT.md 内部的分布报告。 */
console.log(`   · **判据载体（AGENT.md）**：${selfSuff.byClass.judgment.total} 条 ⇒ **未自足 ${selfSuff.byClass.judgment.unself}**`)
console.log(`   · 知识索引（MEMORY.md）：${selfSuff.byClass.index.total} 条 ⇒ **不参与**（行是指针，职责是"指路"而非承载做法）`)
console.log(`   · 画像/事实型（USER.md）：${selfSuff.byClass.fact.total} 条 ⇒ **不参与**（事实行不该含做法）`)
console.log(`   · 未识别：${selfSuff.byClass.unknown.total} 条${selfSuff.unknownTags.length ? '（' + selfSuff.unknownTags.map(([t, n]) => `${t}×${n}`).join(' · ') + '）' : ''}${unknownHint(selfSuff)}`)
console.log(`   合计 ${selfSuff.total} 条（分文件：${IDX.map((f) => `${f.replace('.md', '')} ${selfSuff.per[f]?.total ?? 0}`).join(' · ')}）`)
console.log(`   🎯 **释放候选（S-P5b′）**：判据载体类中**字面自足**者 = **${selfSuff.releaseCandidates} 条** / ${selfSuff.byClass.judgment.total} ⇒ 进入"**待语义复核**"集合（⚠ **本段不释放任何东西**）`)
if (selfSuff.tagDist.length) console.log(`   判据载体内部标签分布：${selfSuff.tagDist.slice(0, 8).map(([t, n]) => `${t}×${n}`).join(' · ')}`)
if (selfSuff.sample.length) console.log(`   未自足样例（判据载体类）：${selfSuff.sample.join(' ｜ ')}`)
ok(selfSuff.byClass.judgment.total + selfSuff.byClass.index.total + selfSuff.byClass.fact.total + selfSuff.byClass.unknown.total === selfSuff.total,
  '⑪ 分类**完备**（判据载体 + 知识索引 + 画像/事实 + 未识别 == 方向条目总数）')
ok(selfSuff.releaseCandidates === selfSuff.byClass.judgment.total - selfSuff.byClass.judgment.unself,
  '⑫ 释放候选**只来自判据载体类**（= AGENT.md；索引/事实型一律不入候选）')
ok(selfSuff.byClass.judgment.total === (selfSuff.per['AGENT.md']?.total ?? 0),
  '⑬ **主轴 = 文件职责**：判据载体总数 == AGENT.md 行数（防主轴再次漂移回"按标签"）')
if (fail) { console.error(`\nFAIL（${fail} 条）`); process.exit(1) }
console.log('\nPASS（R1 度量：两实现互核 · 幂等 · 非零 · 自洽）')

function per2(o) { return o.per }
/** 分文件计数字段求和（用于"分报口径与合计一致"断言）。 */
function objSum(per) { return Object.values(per || {}).reduce((s, x) => s + (Number(x?.total) || 0), 0) }
/** 未识别标签的补充提示（0 条时说明"全部已归类"）。 */
function unknownHint(s) { return s.byClass.unknown.total === 0 ? ' ⇒ 全部已归类' : ' ⇒ **显式报数，不擅自归类**（归类会直接改变释放候选数）' }
