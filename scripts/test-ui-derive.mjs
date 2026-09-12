/**
 * 派生状态映射（Derive）等价性测试 + 散落判据回归锁
 *
 * 背景：面板里「provider→徽章色 / provider→中文名 / provider→语义召回态 / 水位→等级 /
 *       成员装配→徽章 / 向量区可见性」六组判定，原先以三元链形式散在 5 处 render 里，
 *       同一 provider 的口径还不一致（向量区把 DmlExecutionProvider 视作 running，
 *       记忆板块把 fusion 视作 running）。现收敛进 Derive。
 *
 * 本件锁两条：
 *   A. 等价性：**新映射 vs 原三元链双跑对照**，逐输入逐字段比对（行为不变是硬要求）
 *   B. 反模式：源码里不得再出现被搬走的硬编码三元链 / 魔法阈值 / 原型链裸查
 *
 * ⚠ A 段不是复制一份实现来测，而是**从 client.js 原地抽出 Derive 模块求值执行**
 *   （与 test-fold-state.mjs 抽 Fold 同法）—— 改了源码必然被测到。
 *   Derive 无外部依赖，直接 eval 即可。
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')
const src = readFileSync(CLIENT, 'utf8')

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }
const eq = (m, got, want) => (got === want ? ok(m) : bad(m + ' — got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)))
const section = (m) => console.log('\n── ' + m + ' ──')

console.log('派生状态映射 Derive / 等价性 + 反模式锁（client.js）')

/* ══════════ A. 等价性：抽出真实 Derive 执行，与原三元链双跑对照 ══════════ */
section('A. 等价性（Derive vs 原三元链）')

/** 按大括号配平截取 `var Derive = (function () { ... })();` */
function extractDerive(text) {
  const at = text.indexOf('var Derive = (function ()')
  if (at < 0) return null
  const open = text.indexOf('{', at)
  let d = 0, i = open
  for (; i < text.length; i++) {
    if (text[i] === '{') d++
    else if (text[i] === '}') { d--; if (d === 0) break }
  }
  const endTok = '})();'
  const end = text.indexOf(endTok, i)
  if (end < 0) return null
  return text.slice(at, end + endTok.length)
}

const deriveSrc = extractDerive(src)
if (!deriveSrc) {
  console.error('  ❌ 未能从 client.js 抽出 Derive 模块（锚点 `var Derive = (function ()` 缺失）')
  process.exit(1)
}
// eslint-disable-next-line no-eval
const Derive = eval('(function(){ ' + deriveSrc + '; return Derive; })()')

/* ── 原实现的逐字复刻（改动前的三元链），作为「金标准」 ── */
// 向量区：st = (s2.provider || 'off')
const gProvKindVec = (st) => st === 'DmlExecutionProvider' ? 'running' : st === 'off' || st === 'unreachable' ? 'stalled' : 'ended'
// 记忆板块徽章：vp = data.vector.provider || 'off'
const gProvKindMem = (vp) => vp === 'fusion' ? 'running' : vp === 'off' || vp === 'unreachable' ? 'stalled' : 'ended'
const gProvLabel = (vp) => vp === 'fusion' ? '融合' : vp === 'gpu-ready' ? '本机就绪' : vp === 'lexical' ? '词法' : vp === 'cloud' ? '云端' : vp === 'unreachable' ? '服务未连' : '关'
// §7 语义召回：裸 data.vector.provider（无兜底）
const gRecall = (p) => p === 'fusion' ? '融合中' : p === 'gpu-ready' ? '就绪' : '—'
// §7 兜底提示 & 向量区引导：p === 'off' || p === 'unreachable'
const gDown = (p) => p === 'off' || p === 'unreachable'
const gCap = (p) => p >= 85 ? 'stalled' : p >= 60 ? 'suspect' : 'ended'
const gSuiteText = (s) => s === 'both' ? '✓✓ 双基准' : s === 'injected' ? '✓ 注入器' : s === 'profile' ? '✓ profile' : '✗ 未装配'
const gSuiteKind = (s) => s === 'both' ? 'ok' : s === 'missing' ? 'error' : 'info'
const gVecOn = (data) => !!(data && data.vector && data.vector.enabled !== false)
// 判空 / 取数：原散落的 `x && x.length` 与 `(x || []).length`
const gHas = (v) => !!(v && v.length)
const gCount = (v) => (v && v.length) || 0

/* provider 语料：真实取值 + 边界（空串/缺失）+ 原型链键（防裸查 obj[k] 命中 Function） */
const PROVIDERS = ['off', 'unreachable', 'gpu-ready', 'lexical', 'cloud', 'fusion',
  'DmlExecutionProvider', '', undefined, null, 'constructor', 'toString', '__proto__', 'brand-new-provider']
const CAPS = [0, 1, 42, 59, 60, 61, 84, 85, 86, 100, 137, -1]
const STATUSES = ['both', 'injected', 'profile', 'missing', undefined, null, 'constructor', 'weird']

let diff = 0
PROVIDERS.forEach((p) => {
  /* 调用点原本先做 `p || 'off'` 兜底，金标准按兜底后的值算；Derive 内部兜底，直接吃原值 */
  const norm = (p === undefined || p === null || p === '') ? 'off' : p
  const gotV = Derive.providerKind(p, ['DmlExecutionProvider'])
  if (gotV !== gProvKindVec(norm)) { diff++; bad('providerKind(向量区) p=' + JSON.stringify(p) + ' got=' + gotV + ' want=' + gProvKindVec(norm)) }
  const gotM = Derive.providerKind(p, ['fusion'])
  if (gotM !== gProvKindMem(norm)) { diff++; bad('providerKind(记忆板块) p=' + JSON.stringify(p) + ' got=' + gotM + ' want=' + gProvKindMem(norm)) }
  const gotL = Derive.vecLabel(p)
  if (gotL !== gProvLabel(norm)) { diff++; bad('vecLabel p=' + JSON.stringify(p) + ' got=' + gotL + ' want=' + gProvLabel(norm)) }
  /* 语义召回 / 未就绪判定：调用点传的是裸值，金标准也按裸值算（不许私自兜 'off'） */
  const gotR = Derive.vecRecall(p)
  if (gotR !== gRecall(p)) { diff++; bad('vecRecall p=' + JSON.stringify(p) + ' got=' + gotR + ' want=' + gRecall(p)) }
  const gotD = Derive.providerDown(p)
  if (gotD !== gDown(p)) { diff++; bad('providerDown p=' + JSON.stringify(p) + ' got=' + gotD + ' want=' + gDown(p)) }
})
if (!diff) ok('provider 六组判定 × ' + PROVIDERS.length + ' 取值（含空串/缺失/原型链键）全部与原三元链一致')

diff = 0
CAPS.forEach((c) => { if (Derive.capKind(c) !== gCap(c)) { diff++; bad('capKind ' + c + ' got=' + Derive.capKind(c) + ' want=' + gCap(c)) } })
if (!diff) ok('capKind × ' + CAPS.length + ' 档水位（含 60/85 边界与负数）与原阈值一致')

diff = 0
STATUSES.forEach((s) => {
  const m = Derive.suiteStatus(s)
  if (m.text !== gSuiteText(s)) { diff++; bad('suiteStatus.text ' + JSON.stringify(s) + ' got=' + m.text + ' want=' + gSuiteText(s)) }
  if (m.kind !== gSuiteKind(s)) { diff++; bad('suiteStatus.kind ' + JSON.stringify(s) + ' got=' + m.kind + ' want=' + gSuiteKind(s)) }
})
if (!diff) ok('suiteStatus × ' + STATUSES.length + ' 种状态（含缺失/原型链键）文案与语义类均一致')

/* 判空 / 取数语料：数组 / 字符串 / 缺失 / 数字（无 length）/ 类数组对象 */
const HAS_CASES = [[], [1], [1, 2], '', 'a', 'abc', null, undefined, 0, 5, { length: 0 }, { length: 3 }]
diff = 0
HAS_CASES.forEach((v) => {
  if (Derive.has(v) !== gHas(v)) { diff++; bad('has(' + JSON.stringify(v) + ') got=' + Derive.has(v) + ' want=' + gHas(v)) }
  if (Derive.count(v) !== gCount(v)) { diff++; bad('count(' + JSON.stringify(v) + ') got=' + Derive.count(v) + ' want=' + gCount(v)) }
})
if (!diff) ok('has/count × ' + HAS_CASES.length + ' 种取值（含空串/数字/类数组）与原判空表达式一致')

const VEC_ON_CASES = [
  undefined, null, {}, { vector: null }, { vector: {} },
  { vector: { enabled: true } }, { vector: { enabled: false } }, { vector: { provider: 'fusion' } }
]
diff = 0
VEC_ON_CASES.forEach((d) => { if (Derive.vectorOn(d) !== gVecOn(d)) { diff++; bad('vectorOn ' + JSON.stringify(d)) } })
if (!diff) ok('vectorOn × ' + VEC_ON_CASES.length + ' 种数据形状（含 enabled 三态与 vector 缺失）一致')

/* 原型链防护：这些键绝不能被当成已登记项 */
section('B. 原型链防护')
eq("providerKind('constructor') 落缺省 ended", Derive.providerKind('constructor', []), 'ended')
eq("providerKind('__proto__') 落缺省 ended", Derive.providerKind('__proto__', []), 'ended')
eq("vecLabel('toString') 落缺省 关", Derive.vecLabel('toString'), '关')
eq("suiteStatus('constructor') 落缺省 info", Derive.suiteStatus('constructor').kind, 'info')
eq('providerDown(undefined) 为 false（未上报 ≠ 已关闭）', Derive.providerDown(undefined), false)

/* 阈值/上限以常量形式暴露，供调用方引用而非各写死一份 */
section('C. 常量外露')
eq('CAP_PCT.stalled = 85', Derive.CAP_PCT.stalled, 85)
eq('CAP_PCT.suspect = 60', Derive.CAP_PCT.suspect, 60)
eq('BACKREF_LIMIT = 8', Derive.BACKREF_LIMIT, 8)

/* ══════════ D. 反模式锁：被搬走的判据不得在源码里复活 ══════════ */
section('D. 反模式锁（源码级）')
const lines = src.split(/\r?\n/)
const codeLines = lines.filter((l) => {
  const t = l.trim()
  return t && t.indexOf('//') !== 0 && t.indexOf('*') !== 0 && t.indexOf('/*') !== 0
})
const hit = (re) => codeLines.filter((l) => re.test(l))

const d1 = hit(/=== *'off' *\|\| .*=== *'unreachable'/)
d1.length === 0 ? ok('D1 无残留 `off || unreachable` 硬编码连判（应走 providerDown）')
  : bad('D1 残留 ' + d1.length + ' 处：' + d1[0].trim().slice(0, 80))

const d2 = hit(/>= *85|>= *60/)
d2.length === 0 ? ok('D2 无残留水位魔法阈值 85/60（应走 Derive.CAP_PCT）')
  : bad('D2 残留 ' + d2.length + ' 处：' + d2[0].trim().slice(0, 80))

const d3 = hit(/length *> *8/)
d3.length === 0 ? ok('D3 无残留引用条数魔法值 8（应走 Derive.BACKREF_LIMIT）')
  : bad('D3 残留 ' + d3.length + ' 处：' + d3[0].trim().slice(0, 80))

/* D4：向量可见性连判只在 Derive.vectorOn 的实现里允许出现一次，其余调用点须走 Derive */
const d4 = hit(/data\.vector && data\.vector\.enabled !== false/).filter((l) => l.indexOf('vectorOn: function') < 0)
d4.length === 0 ? ok('D4 除 vectorOn 实现外无残留可见性连判（调用点均走 Derive.vectorOn）')
  : bad('D4 残留 ' + d4.length + ' 处：' + d4[0].trim().slice(0, 80))
const d4b = hit(/vectorOn: function/)
d4b.length === 1 ? ok('D4b 可见性判据有且仅有一处实现（Derive.vectorOn）')
  : bad('D4b vectorOn 实现数=' + d4b.length + '（应为 1，防多处各写一份）')

const d5 = hit(/m\.status === 'both' \?/)
d5.length === 0 ? ok('D5 无残留成员装配状态三元链（应走 Derive.suiteStatus）')
  : bad('D5 残留 ' + d5.length + ' 处：' + d5[0].trim().slice(0, 80))

/* D6：provider 展示名三元链（≥4 段）不得再现 */
const d6 = hit(/'fusion' *\? *'融合'|\? *'云端'/)
d6.length === 0 ? ok('D6 无残留 provider 中文名三元链（应走 Derive.vecLabel）')
  : bad('D6 残留 ' + d6.length + ' 处：' + d6[0].trim().slice(0, 80))

/* D7：映射表必须存在于源码（防止有人删表后又把三元链写回去） */
const d7 = ['VEC_DOWN', 'VEC_LABEL', 'VEC_RECALL', 'CAP_PCT', 'SUITE_STATUS'].filter((k) => src.indexOf('var ' + k) < 0)
d7.length === 0 ? ok('D7 五张映射表齐备（VEC_DOWN/VEC_LABEL/VEC_RECALL/CAP_PCT/SUITE_STATUS）')
  : bad('D7 缺表：' + d7.join(', '))

/* D7b：源码里每个 `Derive.xxx` 调用点都必须命中真实导出的键（防拼写错到运行时才炸） */
const exported = Object.keys(Derive)
const reCall = /Derive\.([A-Za-z_$][\w$]*)/g
let m7, miss = [], used = {}
while ((m7 = reCall.exec(src)) !== null) { used[m7[1]] = true }
Object.keys(used).forEach((k) => { if (exported.indexOf(k) < 0) miss.push(k) })
miss.length === 0 ? ok('D7b 调用点符号齐备（' + Object.keys(used).length + ' 个：' + Object.keys(used).join(',') + '）')
  : bad('D7b 调用了不存在的 Derive 成员：' + miss.join(', '))

/* D7c：导出项不得有死代码 —— 每个导出的映射/常量都应有调用点（表与判定要成对存在） */
const DECIDERS = ['providerKind', 'providerDown', 'vecLabel', 'vecRecall', 'capKind', 'suiteStatus', 'vectorOn', 'has', 'count']
const deadExports = exported.filter((k) => !used[k] && DECIDERS.indexOf(k) >= 0)
deadExports.length === 0 ? ok('D7c ' + DECIDERS.length + ' 个判定函数均有调用点（无死代码）')
  : bad('D7c 无人调用的判定函数：' + deadExports.join(', '))

/* D7d：空态判据不得再散落 —— `|| []).length` 兜底写法与 `!x.length` 裸判空均已收敛 */
const d7d1 = hit(/\|\| *\[\] *\) *\.length/)
d7d1.length === 0 ? ok('D7d 无残留 `(x || []).length` 兜底（应走 Derive.count）')
  : bad('D7d 残留 ' + d7d1.length + ' 处：' + d7d1[0].trim().slice(0, 80))
const d7d2 = hit(/![\w.]+\.length\b/)
d7d2.length === 0 ? ok('D7e 无残留 `!x.length` 裸判空（应走 Derive.has；x 缺失时原写法会直接抛错）')
  : bad('D7e 残留 ' + d7d2.length + ' 处：' + d7d2[0].trim().slice(0, 80))

/* D8：反向证伪 —— 把 VEC_DOWN 表清空后，providerKind 必须失去 stalled 分支 */
// eslint-disable-next-line no-eval
const broken = eval('(function(){ ' + deriveSrc.replace("var VEC_DOWN = { off: 'stalled', unreachable: 'stalled' };", 'var VEC_DOWN = {};') + '; return Derive; })()')
broken.providerKind('off', []) === 'ended'
  ? ok('D8 反向证伪：清空 VEC_DOWN 后 off 不再判 stalled（判据非空转）')
  : bad('D8 反向证伪失败：表空了仍返回 ' + broken.providerKind('off', []))

/* D9：反向证伪 —— 摘掉 pick() 的自有属性守卫，原型链键必须漏出（证明守卫有效） */
// eslint-disable-next-line no-eval
const leak = eval('(function(){ ' + deriveSrc.replace('function pick(o, k, dflt) { return hasOwn2.call(o, k) ? o[k] : dflt; }', 'function pick(o, k, dflt) { return o[k] || dflt; }') + '; return Derive; })()')
leak.vecLabel('constructor') !== '关'
  ? ok('D9 反向证伪：去掉 hasOwn 守卫后 constructor 漏出 ' + JSON.stringify(String(leak.vecLabel('constructor')).slice(0, 20)) + '（守卫确实在起作用）')
  : bad('D9 反向证伪失败：无守卫时也没漏，说明该分支未被真正覆盖')

/* ══════════ E. 组件构造收敛：重复的三行构造必须走工厂 ══════════ */
section('E. 组件构造收敛（UI.dsBadge）')
/* E1：不得再手写 `el('div','sc-ds-badge ' + kind)` + dot + 文本 这三行 */
/* 注意 `'sc-ds-badges'`（复数，容器）不是徽章，正则要带边界；
   工厂自身那一行是**唯一允许的**构造点。 */
const e1 = hit(/el\(\s*'div'\s*,\s*'sc-ds-badge[' ]/).filter((l) => l.indexOf('kind ?') < 0)
e1.length === 0 ? ok('E1 无手写 sc-ds-badge 构造（12 处已收敛到 UI.dsBadge 唯一实现）')
  : bad('E1 残留 ' + e1.length + ' 处手写构造：' + e1[0].trim().slice(0, 80))
/* E2：工厂存在，且导出 setText/setKind/setTitle（异步回填不再靠 querySelectorAll 按位置取节点） */
const hasFactory = /dsBadge: function \(text, kind\)/.test(src)
hasFactory ? ok('E2 UI.dsBadge 工厂存在') : bad('E2 UI.dsBadge 工厂缺失')
;['setText', 'setKind', 'setTitle'].forEach((m) => {
  new RegExp(m + ': function').test(src) ? ok('E3 UI.dsBadge 提供 ' + m + '（异步回填持有节点引用）')
    : bad('E3 UI.dsBadge 缺 ' + m)
})
/* E4：按 DOM 位置取文本节点的脆弱写法（改结构即断）必须消失 */
const e4 = hit(/querySelectorAll\('span'\)\[1\]|bText/)
e4.length === 0 ? ok('E4 无 `querySelectorAll(\'span\')[1]` 按位置取文本（已由句柄持有引用）')
  : bad('E4 残留 ' + e4.length + ' 处：' + e4[0].trim().slice(0, 80))
/* E5：调用点计数——防止有人把工厂留着不用、又回去手写 */
const e5 = (src.match(/UI\.dsBadge\(/g) || []).length
e5 >= 5 ? ok('E5 UI.dsBadge 调用点 ' + e5 + ' 处（工厂确实在用，非摆设）')
  : bad('E5 UI.dsBadge 仅 ' + e5 + ' 处调用，疑似未真正收敛')

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '（' + pass + ' pass · ' + fail + ' fail）')
process.exit(fail === 0 ? 0 : 1)
