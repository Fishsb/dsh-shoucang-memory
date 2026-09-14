#!/usr/bin/env node
// check-content-types.mjs — S0 内容类型契约机检（2026-09-14）
//
// 守什么：契约（criteria.json#contentTypes）与**代码事实**一致。核心断言是 B1 ——
//   `reachable:true` 的类型必须在 `src/` 里存在对应消费通路的**实现符号**。
//   反例自证：若把某类型标 reachable=true 而通路未登记/符号不存在 ⇒ 本件当场 FAIL。
//
// 为什么需要它：此前「某类信息能否被消费」只能靠人读代码推断（环记录 105 条不可达即因此
//   长期无人发现）。本件把它变成一条可执行的断言。
//
// 用法: node scripts/check-content-types.mjs   （退出码 0=全过 / 1=有失败）
// 基准：路径一律相对仓根（本件自持 root，不从 cwd 解析）——见 [lesson] 操作路径基准。
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const warn = (m) => console.log(`⚠ ${m}`)
const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }

console.log('内容类型契约（S0）')

const reg = JSON.parse(read('skill/engine/criteria.json'))
const ct = reg.contentTypes
if (!ct || !ct.types) { console.log('❌ 注册表缺 contentTypes 节'); process.exit(1) }
const types = Object.entries(ct.types)
const structural = Object.entries(ct.structural || {})

// ── A1 枚举完备：record-store 的 KINDS 全集都必须在契约中（types 或 structural）──
const kindSrc = read('src/record-store.ts')
const km = kindSrc.match(/export const KINDS = \[([^\]]+)\]/)
const allKinds = km ? [...km[1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]) : []
ok(allKinds.length > 0, `A1 提取 RecordKind 全集（${allKinds.length} 个：${allKinds.join('/')}）`)
const declared = new Set()
for (const [, t] of types) for (const k of t.recordKind) declared.add(k)
for (const [id] of structural) declared.add(id)
const missing = allKinds.filter((k) => !declared.has(k))
ok(missing.length === 0, `A1 每个 RecordKind 都在契约中（缺失：${missing.join('/') || '无'}）`)

// ── A2 carrier 标签必须已在 carriers.tags 登记 ──
const knownTags = new Set(Object.keys(reg.carriers.tags))
const badTags = []
for (const [id, t] of types) for (const tag of t.carrier || []) if (!knownTags.has(tag)) badTags.push(`${id}:${tag}`)
ok(badTags.length === 0, `A2 carrier 标签均已登记（未登记：${badTags.join(', ') || '无'}）`)

// ── A3 反向：契约声明的 kind 必须真实存在（无虚构）──
const phantom = [...declared].filter((k) => !allKinds.includes(k))
ok(phantom.length === 0, `A3 契约中无虚构 kind（虚构：${phantom.join('/') || '无'}）`)

// ── A4 依赖面收敛：content-types 只许依赖生成物 ──
const ctSrc = read('src/content-types.ts')
const imports = [...ctSrc.matchAll(/from '\.\/([a-zA-Z.-]+)\.js'/g)].map((m) => m[1])
const badImports = imports.filter((i) => i !== 'criteria.generated')
ok(ctSrc.length > 0 && badImports.length === 0, `A4 content-types 依赖面收敛（越界：${badImports.join(', ') || '无'}）`)

// ── B1（核心）reachable=true ⇒ 消费侧通路实现存在 ──
const srcFiles = readdirSync(join(root, 'src')).filter((f) => f.endsWith('.ts'))
const srcText = srcFiles.map((f) => read(join('src', f))).join('\n')
// 判据 → 实现符号（与 src/content-types.ts#CONSUMER_CHANNELS 对应）
const CHANNEL_SYMBOLS = {
  always: 'indexRowInLayer',
  relevance: 'recallIndex',
  'situation-key': 'ringCandidates',
  due: 'dueRank',
  none: '',
}
const noChannel = []
for (const [id, t] of types) {
  if (!t.reachable) continue
  const crit = t.consumer && t.consumer.criterion
  if (!(crit in CHANNEL_SYMBOLS)) { noChannel.push(`${id}(判据未登记:${crit})`); continue }
  const sym = CHANNEL_SYMBOLS[crit]
  if (sym && !srcText.includes(sym)) noChannel.push(`${id}(缺实现:${sym})`)
}
ok(noChannel.length === 0, `B1 reachable=true 的类型都有对应消费通路（缺：${noChannel.join(', ') || '无'}）`)
// 通路登记表必须与实现符号表同口径（防两处漂移）
const chDeclared = [...ctSrc.matchAll(/criterion: '([a-z-]+)'/g)].map((m) => m[1])
const chDrift = chDeclared.filter((c) => !(c in CHANNEL_SYMBOLS))
ok(chDrift.length === 0, `B1b 通路登记与本件符号表同口径（漂移：${chDrift.join(', ') || '无'}）`)

// ── B2 reachable=false ⇒ 必须写 why ──
const noWhy = [...types, ...structural].filter(([, t]) => !t.reachable && !t.why).map(([id]) => id)
ok(noWhy.length === 0, `B2 不可达项均写明原因（缺：${noWhy.join(', ') || '无'}）`)

// ── B3 环记录声明正确（projection=none + carrier 空）──
const RING_KINDS = ['episode', 'decision', 'outcome', 'valence', 'relation', 'commitment', 'association']
const ringBad = []
for (const [id, t] of types) {
  if (!(t.recordKind || []).some((k) => RING_KINDS.includes(k))) continue
  if (t.projection !== 'none') ringBad.push(`${id}:projection≠none`)
  if ((t.carrier || []).length !== 0) ringBad.push(`${id}:carrier 非空`)
}
ok(ringBad.length === 0, `B3 环记录声明与实测一致（file='' 无投影）（异常：${ringBad.join(', ') || '无'}）`)

// ── A5 面归属（S1-4）：每个 kind 恰属一面（内容面 / 经历面 / 无面），无跨面、无归属不明 ──
const faceOfKind = new Map()
const faceBad = []
const faceOf = (id, t) => (t.projection === 'md' ? '内容面' : (t.recordKind || []).some((k) => RING_KINDS.includes(k)) ? '经历面' : '无面')
for (const [id, t] of types) {
  const face = faceOf(id, t)
  if (face === '无面' && t.projection !== 'none') faceBad.push(`${id}:标注存疑`)
  for (const k of t.recordKind || []) {
    if (faceOfKind.has(k) && faceOfKind.get(k) !== face) faceBad.push(`${k}:跨面(${faceOfKind.get(k)}/${face})`)
    faceOfKind.set(k, face)
  }
}
for (const [id, t] of structural) {
  const face = t.projection === 'md' ? '内容面' : '无面'
  if (faceOfKind.has(id) && faceOfKind.get(id) !== face) faceBad.push(`${id}:跨面`)
  faceOfKind.set(id, face)
}
ok(faceBad.length === 0, `A5 面归属唯一（异常：${faceBad.join(', ') || '无'}）`)
const fc = {}
for (const [, f] of faceOfKind) fc[f] = (fc[f] || 0) + 1
console.log(`   · 面归属：内容面 ${fc['内容面'] || 0} · 经历面 ${fc['经历面'] || 0} · 无面 ${fc['无面'] || 0}（kind 计）`)

// ── A6 数据面主从声明（S1-2）：roots 三项齐备 · 各项有 authority · 声明的路径函数在 src 存在 ──
const rootItems = (reg.roots && reg.roots.items) || null
const rootBad = []
if (!rootItems) rootBad.push('缺 roots 节')
else {
  for (const k of ['memoryLib', 'knowledge', 'repoPrivate']) if (!rootItems[k]) rootBad.push(`缺 ${k}`)
  for (const [k, r] of Object.entries(rootItems)) {
    if (!r.authority) rootBad.push(`${k}:缺 authority`)
    const fn = String(r.fn || '').match(/^([a-zA-Z]+)\(\)$/)
    if (fn && !srcText.includes(`function ${fn[1]}`)) rootBad.push(`${k}:函数 ${fn[1]} 不在 src`)
  }
}
ok(rootBad.length === 0, `A6 数据面主从声明完备（异常：${rootBad.join(', ') || '无'}）`)
if (rootItems) console.log('   · 根主从：' + Object.entries(rootItems).map(([k, r]) => `${k}=${r.authority}`).join(' · '))

// ── B5 输出形态完备（S2-2）：每个 form 值都必须有 typeId 承载 ──
//   动机：`writeDispatch` 有多路输出（环记录 / notes 正文 appends / 索引行 newIndex / 拒收），
//   若某一路的形态无 typeId，就是"产出了但契约里没有它" —— 与"产出但无人能读"同型。
//   **在开发期机检拦住**，而不是在运行期拒写（拒写会破坏合法的既有写入）。
const ALL_FORMS = ['index', 'profile', 'ring', 'notes']
const declaredForms = new Set(types.map(([, t]) => t.form))
const missingForms = ALL_FORMS.filter((f) => !declaredForms.has(f))
ok(missingForms.length === 0, `B5 每个输出形态都有 typeId 承载（缺：${missingForms.join(', ') || '无'}）`)
console.log('   · 形态覆盖：' + ALL_FORMS.map((f) => `${f}=${types.filter(([, t]) => t.form === f).length}`).join(' · '))

// ── C 形态合法 ──
const LAYERS = new Set(['outer', 'middle', 'inner', 'none'])
const TIMINGS = new Set(['session-start', 'task-start', 'per-step', 'on-demand', 'none'])
const CRITERIA = new Set(['always', 'relevance', 'situation-key', 'due', 'none'])
const BUDGETS = new Set(['stable', 'dynamic', 'oneshot', 'mcl', 'situation', 'process', 'none'])
const formBad = []
for (const [id, t] of types) {
  const c = t.consumer || {}
  if (!LAYERS.has(c.layer)) formBad.push(`${id}:layer=${c.layer}`)
  if (!TIMINGS.has(c.timing)) formBad.push(`${id}:timing=${c.timing}`)
  if (!CRITERIA.has(c.criterion)) formBad.push(`${id}:criterion=${c.criterion}`)
  if (!BUDGETS.has(t.budget)) formBad.push(`${id}:budget=${t.budget}`)
  if (!Array.isArray(t.recordKind) || !t.recordKind.length) formBad.push(`${id}:recordKind 空`)
  if (typeof t.reachable !== 'boolean') formBad.push(`${id}:reachable 非布尔`)
}
ok(formBad.length === 0, `C 契约字段形态合法（异常：${formBad.join(', ') || '无'}）`)

// ── B4 假绿可见：登记为 wired:false 的判据必须显式列出（不静默）──
const falseWired = [...ctSrc.matchAll(/criterion: '([a-z-]+)'[\s\S]{0,120}?wired: false/g)].map((m) => m[1])
if (falseWired.length) warn(`B4 通路登记 wired=false：${falseWired.join(', ')}（**目标槽**，落地前不得声明为可达）`)

// ── E3 交付物：不可达类型清单 ──
const un = types.filter(([, t]) => !t.reachable).map(([id, t]) => `${id}（${t.why || '未写原因'}）`)
console.log('')
console.log(`📋 不可达类型清单（${un.length} 项）：`)
if (un.length) for (const u of un) console.log(`   · ${u}`)
else console.log('   （无 —— 全部类型声明可达）')

const byLayer = {}
for (const [, t] of types) byLayer[t.consumer.layer] = (byLayer[t.consumer.layer] || 0) + 1
console.log('')
console.log(`📊 类型分布：共 ${types.length} 类（+结构性 ${structural.length}）· outer ${byLayer.outer || 0} / middle ${byLayer.middle || 0} / inner ${byLayer.inner || 0}`)

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（内容类型契约全过）')
process.exit(fail ? 1 : 0)
