#!/usr/bin/env node
// check-judge-kind.mjs — **判据裁决机制**机检（J1 · 2026-09-15）
//
// 依据：docs/judge-layering-plan-2026-09-15.md §4.1（judgeKind 三向机检）。
// 断言（四向，各自可红）：
//   ① **完整性**：每条 criteria 都有 `judgeKind ∈ {deterministic, vector, llm}`。
//   ② **投影透传**：judgeKind 必须出现在 `src/criteria.generated.ts#CRITERIA_ROWS` 与
//      `skill/engine/criteria.md` 的判据表 —— 防"声明被投影丢弃"。
//      ⚠ 这不是假想：本字段首次落地时，`gen-criteria.mjs` 的 CRITERIA_ROWS **显式只映射
//        {id,domain,kind,text,params}**，judgeKind 被静默丢弃；若没有本断言，注册表里写了、
//        投影里没有，而**没有任何地方会报错**（正是仓内"静默失效"型缺陷）。
//   ③ **非退化**：三类**都必须非空** —— 全填一个值 = 敷衍登记。
//   ④ **不变量**：`deterministic` 类判据**不得**引用**语义相似**类参数键，否则是
//      "把模糊判断写成阈值"的自我矛盾（本册核心缺口）。
//
// ⚠ ④ 的**收窄记录**（2026-09-15 实测）：首版把 `threshold|ratio|overlap` 也算语义键 ⇒
//   对 `ingest.dedup.bigram`（**词法** bigram 重叠阈值，本就是确定性的）**误报**。
//   依仓内纪律「**断言拦下过宽修法则收窄**」收窄为**真语义**键名：
//   `sim | similarity | semantic | embed | vector | cosine`。
//
// 用法: node scripts/check-judge-kind.mjs [--selftest]
//   退出码 0=pass · 1=fail。`--selftest` 用**合成违规输入**证明四条断言**都会红**（防恒真）。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const VALID = new Set(['deterministic', 'vector', 'llm'])
const SEM_KEYS = /^(sim|similarity|semantic|embed|vector|cosine)/i

// ── 纯谓词（供 --selftest 用同一实现驱动，避免"两套判据"漂移）──
export const missKind = (rows) => rows.filter((c) => !VALID.has(c.judgeKind))
export const semanticKeyHits = (rows) =>
  rows.filter((c) => c.judgeKind === 'deterministic')
    .map((c) => ({ id: c.id, keys: Object.keys(c.params || {}).filter((k) => SEM_KEYS.test(k)) }))
    .filter((x) => x.keys.length)
export const emptyClasses = (rows) => {
  const d = {}
  for (const c of rows) d[c.judgeKind] = (d[c.judgeKind] || 0) + 1
  return { dist: d, empty: [...VALID].filter((k) => !d[k]) }
}

if (process.argv.includes('--selftest')) {
  const okRow = { id: 'x.ok', judgeKind: 'llm', params: {} }
  const cases = [
    ['① 缺 judgeKind', () => missKind([{ id: 'a', params: {} }]).length === 1],
    ['① 非法 judgeKind', () => missKind([{ id: 'a', judgeKind: 'magic', params: {} }]).length === 1],
    ['③ 分布退化', () => emptyClasses([okRow, { ...okRow, id: 'y' }]).empty.length === 2],
    ['③ 满分布不触发', () => emptyClasses([okRow, { id: 'b', judgeKind: 'vector' }, { id: 'c', judgeKind: 'deterministic' }]).empty.length === 0],
    ['④ deterministic 引 sim', () => semanticKeyHits([{ id: 'a', judgeKind: 'deterministic', params: { sim: 0.5 } }]).length === 1],
    ['④ deterministic 引 embedMaxSim', () => semanticKeyHits([{ id: 'a', judgeKind: 'deterministic', params: { embedMaxSim: 1 } }]).length === 1],
    ['④ 词法 threshold 不触发（收窄后）', () => semanticKeyHits([{ id: 'a', judgeKind: 'deterministic', params: { threshold: 0.66 } }]).length === 0],
    ['④ 非 deterministic 不触发', () => semanticKeyHits([{ id: 'a', judgeKind: 'vector', params: { sim: 0.5 } }]).length === 0],
  ]
  let bad = 0
  for (const [name, fn] of cases) {
    const pass = (() => { try { return !!fn() } catch { return false } })()
    console.log(`${pass ? '✅' : '❌'} ${name}`)
    if (!pass) bad++
  }
  if (bad) { console.error(`\nFAIL（selftest ${bad}/${cases.length} 未过）—— 断言的判读力不足`); process.exit(1) }
  console.log(`\nPASS（selftest ${cases.length}/${cases.length}：四条断言都能红，且收窄后不误报）`)
  process.exit(0)
}

const reg = JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria.json'), 'utf8'))
const rows = [...reg.ingest.criteria, ...reg.consolidate.criteria]
const issues = []
const ok = (m) => console.log('✅ ' + m)
const bad = (m) => { issues.push(m); console.log('❌ ' + m) }

// ── ① 完整性 ──
const b1 = missKind(rows)
if (b1.length) bad(`① 缺/非法 judgeKind：${b1.map((c) => `${c.id}=${c.judgeKind}`).join(', ')}`)
else ok(`① 完整性：${rows.length}/${rows.length} 条 criteria 均有合法 judgeKind`)

// ── ② 投影透传 ──
const ts = readFileSync(join(root, 'src', 'criteria.generated.ts'), 'utf8')
const md = readFileSync(join(root, 'skill', 'engine', 'criteria.md'), 'utf8')
const nInTs = (ts.match(/"judgeKind":/g) || []).length
if (!/CRITERIA_ROWS = \[[\s\S]*?"judgeKind"/.test(ts) || nInTs < rows.length) bad(`② TS 投影未透传 judgeKind（命中 ${nInTs} 处 < ${rows.length}）`)
else ok(`② TS 投影透传：CRITERIA_ROWS 命中 ${nInTs} 处`)
if (!md.includes('裁决机制')) bad('② md 判据表缺「裁决机制」列')
else ok('② md 判据表含「裁决机制」列')

// ── ③ 非退化 ──
const { dist, empty } = emptyClasses(rows)
if (empty.length) bad(`③ 分布退化：${empty.join(', ')} 类为空 —— 全填一类 = 敷衍登记`)
else ok(`③ 分布非退化：deterministic=${dist.deterministic} vector=${dist.vector} llm=${dist.llm}`)

// ── ④ 不变量 ──
const b4 = semanticKeyHits(rows)
if (b4.length) bad(`④ deterministic 引用语义相似键（自相矛盾）：${b4.map((x) => `${x.id}(${x.keys.join('/')})`).join(', ')}`)
else ok('④ 不变量：deterministic 判据未引用语义相似类参数键')

if (issues.length) { console.error(`\nFAIL（${issues.length} 条）—— judgeKind 机检未过`); process.exit(1) }
console.log('\nPASS（judgeKind：完整性 / 投影透传 / 非退化 / 不变量 全过）')
