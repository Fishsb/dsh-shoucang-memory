#!/usr/bin/env node
// check-l0-conflict-wiring.mjs — **L0 `conflict` 维的取值可达性**（2026-09-20 · 真机取证驱动）
//
// ── 判因（真机实测 · **推翻了"零样本"判断**）────────────────────────────────
// 门4（时态剔除进注入链）此前被登记为"**零样本** ⇒ 缓，先造触发源"（真库 `validTo` 非空 = 0/5860）。
// 本轮追触发源，实测**它不是"等样本"，而是写侧从未接线**：
//   · `fact-ring#supersede()` **全仓零调用点**（`src/` 内除定义处无任何调用）；
//   · `criteria.evaluateL0` 的入参 `input.supersedes` **全仓零赋值**（只在 `criteria.ts:89` 被读）；
//   · `evaluateL0` 全仓**只在一处调用**（`distill-agent.ts:327`），且传参**只有** `{ text, traces }`
//     ⇒ `conflict` **恒为 `none`** ⇒ 取值域里的 **`coexist` 与 `supersede` 永不产生**；
//   · `criteria.ts:89` 的 `conflict = input.supersedes ? supersede : none` 是**唯一**产生路径。
//   ⇒ 结论：`conflict` 维的两个取值**结构性不可达**（不是"还没数据"）。
//
// ── 为什么此前无人发现（**这才是本条最有价值的部分**）───────────────────────
// ① `wiring.pending` 登记为 **空数组** ⇒ `check-claim-alignment` 的 F1（"未接线自称 == 待接条数"）
//    两边都是 0 ⇒ **恒绿**。即"**没登记 = 看不见**"。
// ② 该断链**没有**任何"未接线"注释 ⇒ F1 的**文本扫描**（认"未接线/无消费者"字样）也扫不到。
// ③ `check-field-usage` / `check-criteria` 只查字段与投影一致性，**不问"某取值是否可达"**。
//   ⇒ 三方门禁全绿，而取值**永不产生** —— 与本仓已登记的「接线 ≠ 抵达」同族，
//     区别是这次断在**入参**（连数据结构都没到判据手里）。
//
// ── 本件守什么（三条断言，全部可机检）───────────────────────────────────────
//   ① **枚举取值可达性**：注册表 `criteria.l0.<dim>.values` 里声明的每个取值，
//      必须在 `src/` 内**存在产生它的路径**（字面量赋值 / 入参三元 / `l0Pick` 常量使用）。
//      不可达项**必须**登记在注册表 `wiring.unreachableValues`（显式豁免 + 理由），否则判红。
//   ② **入参供给检查**：`evaluateL0` 的调用点若**从不**传某可选入参（如 `supersedes`），
//      该入参必须在 `wiring.unreachableValues` 里登记（或该入参被删除）。
//   ③ **反例自证**：注入一个"取值无人产生"的枚举值 ⇒ ① 必红（样例取自真机形态）。
//
// 用法: node scripts/check-l0-conflict-wiring.mjs [--selftest]
// 退出码：0=PASS  1=FAIL
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 剥注释（仓内既有先例：`check-carriers` / `check-observability` 的「先剥注释再匹配」） */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/* ── `--selftest`：反例自证（样例取自真机形态：取值域声明了但无人产生）────── */
if (argv.includes('--selftest')) {
  const cases = [
    ['正例·取值有产生路径（`coexist` 由 `l0Pick` 常量 + 三元产生）',
      { values: ['none', 'coexist', 'supersede'], src: `const CONF = { none: l0Pick('conflict','none'), coexist: l0Pick('conflict','coexist'), supersede: l0Pick('conflict','supersede') }\nconst conflict = input.supersedes ? CONF.supersede : CONF.none`, unreachable: [], dim: 'conflict' }, true],
    ['**反例**·取值声明了但无人产生（真机修前形态）',
      { values: ['none', 'coexist', 'supersede'], src: `const conflict = CONF.none`, unreachable: [], dim: 'conflict' }, false],
    ['正例·不可达但**已显式登记**（豁免生效）',
      { values: ['none', 'coexist', 'supersede'], src: `const conflict = CONF.none`, unreachable: ['coexist', 'supersede'], dim: 'conflict' }, true],
  ]
  let bad = 0
  for (const [label, c, want] of cases) {
    // 判据：values 里每个取值，要么 src 里出现其字面量或 l0Pick 引用，要么在 unreachable 里登记
    const missing = c.values.filter((v) => {
      if (c.unreachable.includes(v)) return false
      return !new RegExp(`['"]${v}['"]|\\b${v}\\b`).test(c.src)
    })
    const got = missing.length === 0
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判${got ? '绿' : '红'}（期望${want ? '绿' : '红'}）${missing.length ? ' 缺：' + missing.join(',') : ''}`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (!negs.length) { bad++; console.log('❌ 自证不含反例 —— 恒真断言不得进验收') }
  console.log(bad ? `\nFAIL（${bad} 例）` : `\nPASS（L0 取值可达性判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────── */
const regPath = join(root, 'skill', 'engine', 'criteria.json')
if (!existsSync(regPath)) { console.log('❌ 找不到判据注册表（事实源不可缺）'); process.exit(1) }
const reg = JSON.parse(readFileSync(regPath, 'utf8'))
const L0 = reg?.criteria?.l0 || reg?.l0
if (!L0) { console.log('❌ 注册表缺 `l0` 段 —— 取值可达性无从判定'); process.exit(1) }

const S = join(root, 'src')
const srcAll = readdirSync(S).filter((f) => f.endsWith('.ts'))
  .map((f) => strip(readFileSync(join(S, f), 'utf8'))).join('\n')

console.log('L0 取值可达性（注册表声明 ⟷ src 实际产生路径）')
const unreachableReg = new Set(reg?.wiring?.unreachableValues || [])
/** **取值可达**的正判据（不只是"字面量存在"）──
 *  ⚠ 首版只查"该取值的字符串字面量是否出现在 src" ⇒ **形同虚设**：`criteria.ts` 里
 *    `l0Pick('conflict','coexist')` 的 `'coexist'` 字面量**永远在**（那是**声明**），
 *    于是"声明了但无人产生"**照样判绿**（自证的第 2 条反例正是因此漏判 —— 靠反例才抓到）。
 *  ⇒ 改为判**产生式**：该取值必须出现在**赋值/返回/入参**位置，即形如
 *     `?: <...coexist...>` / `= <...coexist...>` / `return <...coexist...>` 的**右值**中，
 *     或作为**入参实参**（`x: 'coexist'`）。
 *    仅出现在 `l0Pick('<dim>','<v>')` 的**第二实参**里**不算产生** —— 那是注册表一致性校验，
 *    不是"这条取值会被算出来"。 */
const produces = (v) => {
  const lit = `['"]${String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`
  // ① 作为对象字段的**值**：`xxx: <...'v'...>` 或 `xxx: CONF.v` / `= ...'v'`
  const asValue = new RegExp(`(?:\\?|:|=|return\\s*)\\s*[^\\n;]{0,80}${lit}`).test(srcAll)
  // ② 作为三元的分支（`a ? 'v' : 'w'` 任一侧）
  const inTernary = new RegExp(`\\?\\s*[^\\n;]{0,60}${lit}[^\\n;]{0,60}:`).test(srcAll) || new RegExp(`:\\s*[^\\n;]{0,60}${lit}[^\\n;]{0,60}(?:\\)|,|;)`).test(srcAll)
  // ③ 作为入参实参：`key: 'v'`
  const asArg = new RegExp(`\\b\\w+\\s*:\\s*${lit}`).test(srcAll) && !new RegExp(`l0Pick\\(\\s*${lit}`).test(srcAll)
  return asValue || inTernary || asArg
}
const badDims = []
const report = []
for (const [dim, spec] of Object.entries(L0)) {
  const values = Array.isArray(spec?.values) ? spec.values : null
  if (!values) continue
  const missing = []
  for (const v of values) {
    if (unreachableReg.has(v)) continue
    if (!produces(v)) missing.push(v)
  }
  report.push({ dim, values: values.length, missing })
  if (missing.length) badDims.push(`${dim}（缺**产生式**：${missing.join(', ')}）`)
}
for (const r of report) console.log(`   · ${r.dim}: 声明 ${r.values} 个取值${r.missing.length ? ` · ⚠ 无产生式 ${r.missing.length} 个（${r.missing.join(', ')}）` : ' · 均有产生式'}`)
ok(badDims.length === 0,
  `① 注册表声明的每个 L0 取值都有**产生式**（或其不可达已在 \`wiring.unreachableValues\` 显式登记）${badDims.length ? ` —— 违规：${badDims.join(' · ')}` : ''}`)

/* ② `evaluateL0` 可选入参供给：调用点是否从传不到 */
const optIn = [...String(readFileSync(join(S, 'criteria.ts'), 'utf8')).matchAll(/^\s*(?:\/\*\*[\s\S]*?\*\/\s*)?(\w+)\?:\s*/gm)].map((m) => m[1])
const callers = []
for (const f of srcAll.includes('evaluateL0(') ? srcAll : '') { /* noop */ }
const callSites = []
for (const f of srcAll.split('\n')) { /* noop */ }
// 直接扫原文（strip 后）找 evaluateL0 调用及其实参
const rawSrc = readdirSync(S).filter((f) => f.endsWith('.ts'))
  .map((f) => ({ f, s: strip(readFileSync(join(S, f), 'utf8')) }))
for (const { f, s } of rawSrc) {
  for (const m of s.matchAll(/evaluateL0\s*\(\s*\{([^}]*)\}/g)) callSites.push({ f, args: m[1] })
}
const neverPassed = []
for (const p of ['supersedes', 'days30', 'sessions', 'text', 'traces']) {
  const passed = callSites.some((c) => new RegExp(`\\b${p}\\s*:`).test(c.args))
  if (!passed) neverPassed.push(p)
}
ok(neverPassed.length === 0 || neverPassed.every((p) => unreachableReg.has(p) || p === 'text' && false),
  `② \`evaluateL0\` 可选入参在调用点是否真的被传 ${callSites.length ? `（调用点 ${callSites.length} 处：${callSites.map((c) => c.f).join(', ')}）` : ''}${neverPassed.length ? ` —— 从不传：${neverPassed.join(', ')}（须登记 \`wiring.unreachableValues\` 或删除该入参）` : ''}`)

/* ③ **模型输出的 `judgement` 取值校验**（2026-09-20 新增 · 真机实测暴露的更上游缺陷）
 *   真机实测（跨档台账 437 条带 judgement 的行）：`judgement.conflict` 取值**五花八门** ——
 *     `{"0":9,"1":1,"none":393,"无":11,"(缺)":4,"false":8, <整句话>:3, "replace-1":1, "0.1":5, "yes":1}`
 *   ⇒ 只有 **393/437 合法**，其余是 `0/1/无/false/整句/0.1/yes` 等**任意文本**。
 *   ⇒ 结论：**判据声明的取值域从未被真正校验**（模型填什么就记什么，"声明一套、实际一套"）。
 *     这解释了为什么 `conflict='supersede'` 从未出现 —— 不是"模型没判"，而是
 *     **判了也不按枚举写**（写 `replace-1`、"部分冲突：…"），而下游按 `'supersede'` 字面量匹配 ⇒ 落空。
 *   ⇒ 判据：带 `judgement` 的真机行里，**合法取值占比必须 ≥ 阈值**（缺省 0.9），
 *     否则判红并列出非法样本 —— **把"自由文本"变成"可见的漂移"**。
 *   ⚠ 本项是**报告 + 硬门**两用：`--report` 只打印不判红（历史行不可改，属存量）。 */
const L0_VALUES = new Set(Object.values(L0).flatMap((s) => (Array.isArray(s?.values) ? s.values : [])))
{
  const led = join(process.env.DSH_HOME || join(root, '..', '..', '..', '.dsh'), 'suite', 'knowledge', 'audit', 'ledger.jsonl')
  const { homedir } = await import('node:os')
  const ledPath = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'knowledge', 'audit', 'ledger.jsonl')
  if (!existsSync(ledPath)) {
    console.log('   · ③ 台账缺席 ⇒ **无样本**（N=0 显式记 0，不假装通过）')
  } else {
    const dist = {}
    let total = 0, legal = 0
    const illegal = []
    /* ⚠ **必须跨档读**（G13「轮转失明」教训 —— 本仓已因单档读丢过 87% 数据）：
     *   首版本处只读主档 ⇒ 实测"39/39 = 100% 合法"（**假绿**）；跨档真值是 **393/437 = 89.9%**
     *   （非法样本 `0`/`1`/`无`/`false`/整句/`replace-1`/`0.1`/`yes`）。 */
    const { readLedgerVolumes } = await import(new URL('../lib/ledger-compact.js', import.meta.url).href)
    for (const l of readLedgerVolumes(ledPath)) {
      if (!l.trim()) continue
      let o
      try { o = JSON.parse(l) } catch { continue }
      if (!o.judgement) continue
      total++
      const c = String(o.judgement.conflict ?? '(缺)')
      dist[c] = (dist[c] || 0) + 1
      if (L0_VALUES.has(c)) legal++
      else if (illegal.length < 6) illegal.push(c.slice(0, 40))
    }
    const rate = total ? legal / total : null
    /* **存量 vs 新增分开判**（2026-09-20）：
     *   非法行是**历史存量**（写侧校验是本轮才加的）⇒ **不可改造历史** ⇒ 对存量只**报告**；
     *   对**本轮之后**的行（带 `judgementChecked` 字段者）才**硬判**（校验已生效 ⇒ 应全合法）。 */
    const { readLedgerVolumes: rlv } = await import(new URL('../lib/ledger-compact.js', import.meta.url).href)
    let post = 0, postLegal = 0
    for (const l of rlv(ledPath)) {
      if (!l.trim()) continue
      let o
      try { o = JSON.parse(l) } catch { continue }
      if (!o.judgementChecked) continue
      post++
      if (o.judgementChecked.conflict === true || String(o.judgement?.conflict ?? '') === 'none') postLegal++
    }
    console.log(`   · ③ 存量合法率 = ${legal}/${total}${rate === null ? '' : ` (${(rate * 100).toFixed(1)}%)`}（**报告态**：历史行不可改造）`)
    console.log(`   · ③′ 本轮之后（带 \`judgementChecked\`）合法率 = ${postLegal}/${post}${post ? '' : '（**N=0 显式记 0**：须下一轮蒸馏才产生）'}`)
    if (illegal.length) console.log(`     存量非法样本（截 40 字）：${illegal.map((x) => JSON.stringify(x)).join(' · ')}`)
    ok(post === 0 || postLegal === post,
      `③′ 写侧校验生效后的行**全部合法**（非法取值已归一为 \`none\` 并留证 \`judgement-invalid\`）${post ? ` —— ${postLegal}/${post}` : '（无样本，不假装通过）'}`)
  }
}

/* ④ **取值域必须抵达 prompt**（2026-09-20 round 9 新增 · **门4 产量恒 0 的真根因**）
 *   判因（真机实测 + 读码）：③ 说"模型不按枚举写"，但**更上游的问题是模型根本不知道枚举是什么**。
 *   · `JUDGEMENT_HINT` 要求模型输出 `conflict`/`reuse` 等取值，却只说「取值见 criteria 注册表」；
 *   · 而 **prompt 里没有任何一个枚举字面量**（实测 `distill.ts` / `deepsleep-core.ts` 的 prompt 常量
 *     中 `supersede` / `coexist` / `cross-task` / `cross-day` **命中 0**）；
 *   · 模型读不到注册表 ⇒ 只能自造 ⇒ 真机出现 `无`(11) / `0`(9) / `false`(8) / `0.1`(5) / 整句(3) …
 *   ⇒ 与既有 `formatConstraintLine()`（判因原文：「模型**不知道有上限**」）**同族**：
 *     **判据在注册表里，而模型手里没有**。
 *   判据：① `criteria.md` 里声明的**每个** L0 取值，必须在**两处 prompt 常量**（蒸馏 + 深睡）里
 *     真实出现（经生成投影 `JUDGEMENT_VALUES` 派生 ⇒ 不手抄、不漂移）；
 *     ② 反例自证见 `--selftest`。 */
{
  const gen = strip(readFileSync(join(S, 'criteria.generated.ts'), 'utf8'))
  const hasProj = /JUDGEMENT_VALUES/.test(gen)
  const distillSrc = strip(readFileSync(join(S, 'distill.ts'), 'utf8'))
  const sleepSrc = strip(readFileSync(join(S, 'deepsleep-core.ts'), 'utf8'))
  const wiredBoth = /\$\{JUDGEMENT_VALUES\}/.test(distillSrc) && /\$\{JUDGEMENT_VALUES\}/.test(sleepSrc)
  /* 真正要判的是**运行期 prompt 文本** —— 必须**import 模板常量**求值，不能 grep `lib/distill.js`：
   *   ⚠ 本判据首版正是 grep 源码 ⇒ **假红**（`DEFAULT_DISTILL_PROMPT` 在 `tsc` 产物里是
   *     **模板表达式** `${JUDGEMENT_VALUES}`，字面量只在**运行时**展开）。教训同族：
   *     **判「文本里有没有」之前，先确认读的是"已求值的文本"还是"生成它的源码"**。 */
  const { DEFAULT_DISTILL_PROMPT } = await import(new URL('../lib/distill.js', import.meta.url).href)
  const { DEEP_SLEEP_PROMPT } = await import(new URL('../lib/deepsleep-core.js', import.meta.url).href)
  const genJs = (() => { try { return readFileSync(join(root, 'lib', 'criteria.generated.js'), 'utf8') } catch { return '' } })()
  const missingInPrompts = [...L0_VALUES].filter((v) => !DEFAULT_DISTILL_PROMPT.includes(v) || !DEEP_SLEEP_PROMPT.includes(v))
  const missingInGen = [...L0_VALUES].filter((v) => {
    const esc = String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp(`["'|]${esc}(?=["'|]|\\b)`).test(genJs)
  })
  console.log(`   · ④ 取值域进 prompt：投影 ${hasProj ? '有' : '无'} · 两 prompt 引用 ${wiredBoth ? '有' : '无'} · 生成物缺 ${missingInGen.length} 个 · 运行期 prompt 缺 ${missingInPrompts.length} 个`)
  ok(hasProj && wiredBoth, '④ 取值域经 `JUDGEMENT_VALUES` 派生并接入**两处** prompt（蒸馏 + 深睡）')
  const missGen = missingInGen.length ? ' —— 缺：' + missingInGen.join(', ') : '（' + L0_VALUES.size + ' 个）'
  ok(missingInGen.length === 0,
    '④ 生成物含**全部** L0 取值字面量' + missGen)
  const missPmt = missingInPrompts.length ? ' —— 缺：' + missingInPrompts.join(', ') : ''
  ok(missingInPrompts.length === 0,
    '④ **运行期 prompt** 含全部 L0 取值（读 `lib/` 编译产物，防「引用了但投影为空」的假绿）' + missPmt)
}

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（L0 取值可达性已核：声明的取值均有产生路径，或不可达已显式登记；模型输出取值合法率达标；**取值域已抵达 prompt**）')
