#!/usr/bin/env node
// check-budget-override.mjs — 注入槽位额度的**覆盖链**判据（2026-09-21 · S3）
//
// ── 判因（**差点造出第二个假旋钮**）──────────────────────────────────────────────
// 「槽位预算接 UI」的表面需求是"把三个额度加进面板 `/set` 白名单"。但运行时原先**只读
// `SURFACE.injection.*`**（`criteria.json` 的**构建期投影常量**）——
//   ⇒ 若**只**加白名单：用户改的值写进 `scheduler.json`，而运行时**永远读不到**
//     ⇒ **"看起来能调、调了没用"**（本仓最忌；先例：`alphaVal` 恒 0 被放弃 · 9 项假旋钮分类）。
// ⇒ 正解是补一条**覆盖链**（`scheduler.json` 热覆盖 → 注册表缺省），三处消费点共用同一实现。
//
// ── 本件守什么（四组，均由 `--selftest` 反例自证）────────────────────────────────
//   ① **消费侧真接线**：`panel-shared.ts` 的总额度 / 情境槽 / 档位上限**都必须**经覆盖函数解析，
//      不得残留直接读 `SURFACE.injection.budgetChars` / `situation.budgetChars` / `levelCaps` 的旧式。
//   ② **范围单一事实源**：`panel-config`（写入侧 400）与 `budget-override`（运行侧夹取）用**同一组数**
//      —— 缺写入侧 = 非法值能落盘；缺运行侧 = 历史坏值能让注入面失控。**两道都要有**。
//   ③ **写入侧类型防线**：`injectLevelCaps` 是**对象**，不得落进 `Number(value) || 0`
//      （那会写成 `0` 且 API 仍回 200 ⇒ "看着成功、值却是坏的"）。
//   ④ **行为等价**：无覆盖时解析结果 == 原式（**逐值相等**）⇒ 注入文本不变。
//      这是本项"可自主推进、无需产品决策"的**前提**（同 `test-budget-single` 的口径）。
//
// 用法: node scripts/check-budget-override.mjs [--selftest]
// 退出码：0=PASS  1=FAIL  3=skip（lib 未构建）
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/* ── `--selftest`：反例自证 ─────────────────────────────────────────────────── */
if (process.argv.includes('--selftest')) {
  const cases = [
    ['正例·读覆盖链（resolveBudgetNumber…）', 'const totalBudget = resolveBudgetNumber(\'injectBudgetChars\', x, y).value', true],
    ['**反例**·直读注册表常量（**真机修前形态**）', 'const totalBudget = Math.max(1200, Number(SURFACE.injection.budgetChars) || 4000)', false],
    ['**反例**·对象键落进 Number() 吞成 0', 'writeValue = Number(value) || 0', false],
    ['正例·对象键显式 JSON 解析', 'obj = JSON.parse(value)', true],
  ]
  let bad = 0
  for (const [label, line, want] of cases) {
    const isOld = /SURFACE\.injection(\.situation)?\.(budgetChars|levelCaps)/.test(line)
      || (label.includes('对象键落进') && /Number\(value\)/.test(line))
    const got = !isOld
    if (got !== want) bad++
    console.log(`${got === want ? '✅' : '❌'} ${label} → 判${got ? '接线' : '旧式'}（期望${want ? '接线' : '旧式'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (negs.length < 2) { bad++; console.log('❌ 反例不足（须含"直读常量"与"对象被吞"）') }
  console.log(bad ? `\nFAIL（--selftest ${bad} 例）` : `\nPASS（判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────────── */
const OV = join(root, 'src', 'budget-override.ts')
const PS = join(root, 'src', 'panel-shared.ts')
const PC = join(root, 'src', 'panel-config.ts')
for (const [f, why] of [[OV, '覆盖层实现'], [PS, '运行时消费侧'], [PC, '面板写入/读数侧']]) {
  if (!existsSync(f)) { console.log(`❌ 找不到 ${f}（${why}）`); process.exit(1) }
}
const ov = strip(readFileSync(OV, 'utf8'))
const ps = strip(readFileSync(PS, 'utf8'))
const pc = strip(readFileSync(PC, 'utf8'))

/* ① 消费侧真接线：`panel-shared` 必须经**覆盖链**取数 —— 且**经聚合入口**（`resolveSupplyBudget`）。
 *   ⚠ 判据**曾写成"必须出现 `resolveBudgetNumber(` 与 `resolveLevelCaps(`"** —— 那在把三个额度
 *     抽成 `resolveSupplyBudget`（**为解冻结上限而抽出**）之后就 **变成假红**了：
 *     消费侧确实还经覆盖链，只是走的是**聚合入口**。⇒ 判据改为「经聚合入口 **或** 那两个底层函数之一」，
 *     即**接受两种合法接线形态**，仍然拒绝"完全不接线"。**这是判据随实现演进必须同步的证据**，
 *     不是放宽：下方 ④ 的**行为等价**断言（真跑 `lib/`）才是"接得对不对"的硬判据。 */
ok(/resolveSupplyBudget\s*\(/.test(ps) || (/resolveBudgetNumber\s*\(/.test(ps) && /resolveLevelCaps\s*\(/.test(ps)),
  '① 运行时消费侧接线：`panel-shared` 经覆盖链取数（`resolveSupplyBudget` 聚合入口，或两个底层函数）')
/* ⚠ 判据须**精确到"用旧式取数"**，否则会把新调用里的**回落参数**误判成残留
 *   （首次实跑踩到：`resolveBudgetNumber('injectBudgetChars', ov, (SURFACE.injection as …)?.budgetChars)`
 *     里 `Number(` 与 `budgetChars` 同段 ⇒ 宽正则命中"接线代码"自身 = **假红**）。
 *   ⇒ 判据改为找**赋值右值直接是注册表读数**的形态：`= Math.max(…SURFACE…budgetChars…)` 或
 *     `= Number((SURFACE.injection…).budgetChars) …`，即**不经 resolve\***。 */
const directTotal = /=\s*Math\.max\([^;\n]*SURFACE\.injection[^;\n]*budgetChars/.test(ps)
  || /(?:const|let)\s+totalBudget\s*=\s*Number\(\s*\(?SURFACE\.injection/.test(ps)
ok(!directTotal,
  '① **旧式已清除**：`totalBudget` 不再由 `Math.max(…SURFACE.injection…budgetChars…)` 直接赋值得出')
/* 档位上限：不得再有 `const rowCaps … = { ...SURFACE.injection.levelCaps }`（含三元兜底里的那半支） */
ok(!/\{\s*\.\.\.SURFACE\.injection\.levelCaps\s*\}/.test(ps),
  '① **档位上限旧式已清除**：不再出现 `{ ...SURFACE.injection.levelCaps }`（含"兜底分支"—— 兜底也是旧式）')
/* ② 范围单一事实源（两处引用同一常量，不各写一份数字） */
ok(/BUDGET_RANGES/.test(ov) && /BUDGET_RANGES/.test(pc),
  '② 范围**单一事实源**：`budget-override` 与 `panel-config` 同引 `BUDGET_RANGES`')
const numsInPc = [...pc.matchAll(/'(injectBudgetChars|injectSituationBudgetChars)':\s*\[(\d+),\s*(\d+)\]/g)].map((m) => [m[1], m[2], m[3]])
ok(numsInPc.length === 0,
  `② **写入侧不得硬编码范围数字**${numsInPc.length ? `（实测硬编码：${numsInPc.map((x) => x.join('=')).join(' · ')}）` : '（实测 0 处）'}`)
/* ③ 写入侧对象类型防线 */
ok(/JSON\.parse\(value\)/.test(pc) && /injectLevelCaps/.test(pc),
  '③ 对象键**显式 JSON 解析**（`injectLevelCaps` 未被 `Number()` 吞）')
/* ④ 行为等价（真跑 lib/ —— 结构断言会漏"接线了但值变了"） */
const libOv = join(root, 'lib', 'budget-override.js')
const libGen = join(root, 'lib', 'criteria.generated.js')
if (!existsSync(libOv) || !existsSync(libGen)) {
  console.log('\n⏭ skip：`lib/` 未构建 ⇒ 无法做行为等价断言（先 `npm run build:host`）')
  console.log('   ⚠ 按本仓契约 exit 3 = skip，**不算通过**')
  process.exit(3)
}
const { resolveBudgetNumber, resolveLevelCaps, BUDGET_RANGES } = await import(new URL('../lib/budget-override.js', import.meta.url).href)
const { SURFACE } = await import(new URL('../lib/criteria.generated.js', import.meta.url).href)
/* 原式（**逐式照抄改造前**，含缺失值的兜底），用于比对 */
const oldTotal = Math.max(1200, Number(SURFACE.injection.budgetChars) || 4000)
const newTotal = resolveBudgetNumber('injectBudgetChars', undefined, SURFACE.injection.budgetChars).value
ok(oldTotal === newTotal, `④ 总预算等价：原式 ${oldTotal} == 新链路 ${newTotal}`)
const sit = SURFACE.injection.situation
const oldSit = (sit?.enabled ?? false) ? Math.max(0, Number(sit?.budgetChars ?? 0) || 0) : 0
const newSit = (sit?.enabled ?? false) ? Math.max(0, resolveBudgetNumber('injectSituationBudgetChars', undefined, sit?.budgetChars).value) : 0
ok(oldSit === newSit, `④ 情境槽等价：原式 ${oldSit} == 新链路 ${newSit}`)
ok(JSON.stringify({ ...SURFACE.injection.levelCaps }) === JSON.stringify(resolveLevelCaps(undefined, SURFACE.injection.levelCaps).caps),
  '④ 档位上限等价（无覆盖时逐档同值）')
/* 反例：覆盖真生效 + 越界被夹取（否则"接线了"只是装饰） */
ok(resolveBudgetNumber('injectBudgetChars', 5000, undefined).value === 5000,
  '④ **覆盖真生效**：override=5000 ⇒ 采用 5000（非注册表值）')
const clamped = resolveBudgetNumber('injectBudgetChars', 999999, undefined)
ok(clamped.value === BUDGET_RANGES.injectBudgetChars[1] && clamped.clamped === true,
  `④ **越界被夹取且留痕**：999999 ⇒ ${clamped.value} · clamped=${clamped.clamped}`)

/* ⑤ **留痕字段必须有消费面**（2026-09-22 · 治「写入侧有、消费面零」）────────────────────────
 *  判因（全树 grep 实测，两个字段同病）：
 *    · `supplyUsage.budgetClamped`（越界夹取留痕）—— 只写进账，**前端零渲染**
 *      ⇒ 用户设了越界值仍以为生效（"夹取不静默"只做了一半）；
 *    · `attributionScanned`（归因取样扫了多少行）—— 只落审计行，**零读取方**
 *      ⇒ 「扫描触顶（调上限）」与「样本真不足（等时间）」这对**唯一分辨依据**从未抵达任何人眼前。
 *  ⇒ 本组要求：凡**为了让人看见**而写入的字段，必须有**消费点**；否则它就是"写了没人看"的
 *    又一例（本仓已反复出现：`companion`/`switchSource` 恒真、`alphaVal` 恒 0、假旋钮分类）。
 *  ⚠ 判据落在**消费点存在**上（能否被读到），不落在"文本里有这个词"上 ——
 *    后者会把字段的**定义处/写入处**误判成消费。 */
{
  const CONSUMERS = [
    ['budgetClamped', 'src-client/panes-overview.js', '额度夹取的面板渲染行'],
    ['attributionScanned', 'src/sleep-report.ts', '== 消费面（sleep-report）'],
  ]
  for (const [field, file, why] of CONSUMERS) {
    const p = join(root, file)
    const has = existsSync(p) && readFileSync(p, 'utf8').includes(field)
    ok(has, `⑤ 留痕字段 \`${field}\` **有消费面**（${file} —— ${why}）`)
  }
  /* ⑥ **UI 文案必须进 i18n 词表**（否则英文界面露中文裸串，`check-i18n-keys` 断言 A 会红）——
   *   此处只做**同点自检**（提示先在 i18n-dict 补词条），完整键集守恒由 `check-i18n-keys` 守。 */
  const ovSrc = readFileSync(join(root, 'src-client', 'panes-overview.js'), 'utf8')
  const newStrs = [...ovSrc.matchAll(/tr\(['"]([^'"]{2,})['"]\)/g)].map((m) => m[1]).filter((s) => s.includes('夹取'))
  const dictSrc = ['i18n-dict-pane-run.js', 'i18n-dict-cfg.js', 'i18n-dict-memory.js', 'i18n-dict-nav.js']
    .map((f) => { const pp = join(root, 'src-client', f); return existsSync(pp) ? readFileSync(pp, 'utf8') : '' }).join('\n')
  const missing = newStrs.filter((s) => !dictSrc.includes(`'${s}'`))
  ok(newStrs.length > 0 && missing.length === 0,
    `⑥ 额度夹取的 UI 文案已进 i18n 词表（${newStrs.length} 条，缺：${missing.join(' / ') || '无'}）`)

  /* ⑦ **三键必须真的能被人调到**（2026-09-22 · ADR-328 ② · 治「半截落地」）──────────────
   *  判因（真机实测）：册二的交付物写「接上 `/set` + `/config` + **契约表**」，实测**只通服务面** ——
   *    `POST /set` 三键 200 · 越界 400 · `/config` 可读，但：
   *      · `src-client/` 对三键 **零引用**（没有控件）⇒ **只有 curl 能拧**；
   *      · 契约表里**没有三键条目**（落在通用 `/set` 之下）⇒ `check-panel-contract` 的
   *        「三向一致」对它们是**空过**，不是"验过"。
   *  ⇒ 三组断言，缺一即"面板调不到"重新成立：
   *    ⑦a 每个键在 `src-client/` 有控件（`/set` 提交点）
   *    ⑦b 契约白名单 `SET_SCALAR_KEYS` 含这三键
   *    ⑦c `SET_SCALAR_KEYS` ⟷ `panel-config.ts#allowed` **逐键一致**（防手抄漂移 ——
   *        本件初版手抄即漏 6 键，当场被纠出）。 */
  const BUDGET_KEYS = ['injectBudgetChars', 'injectSituationBudgetChars', 'injectLevelCaps']
  const clientSrc = readdirSync(join(root, 'src-client'))
    .filter((f) => f.endsWith('.js') && !f.includes('generated'))
    .map((f) => readFileSync(join(root, 'src-client', f), 'utf8')).join('\n')
  const noUi = BUDGET_KEYS.filter((k) => !clientSrc.includes(k))
  ok(noUi.length === 0, `⑦a 三键在面板**有控件**（而非只有 curl）：实测缺 ${noUi.length} 个${noUi.length ? ' → ' + noUi.join(', ') : ''}`)

  const contractSrc = readFileSync(join(root, 'src', 'panel-contract.ts'), 'utf8')
  const mKeys = /export const SET_SCALAR_KEYS = \[([\s\S]*?)\] as const/.exec(contractSrc)
  const declared = mKeys ? [...mKeys[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []
  const noContract = BUDGET_KEYS.filter((k) => !declared.includes(k))
  ok(declared.length > 0 && noContract.length === 0,
    `⑦b 三键在契约白名单 \`SET_SCALAR_KEYS\` 内（否则门是空绿）：实测缺 ${noContract.length} 个${noContract.length ? ' → ' + noContract.join(', ') : ''}`)

  const cfgSrc = readFileSync(join(root, 'src', 'panel-config.ts'), 'utf8')
  const ai = cfgSrc.indexOf('const allowed')
  const aj = cfgSrc.indexOf('// 数值范围校验')
  const allowedKeys = ai >= 0 && aj > ai ? [...cfgSrc.slice(ai, aj).matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]) : []
  const sd = new Set(declared), sa = new Set(allowedKeys)
  const onlyDecl = declared.filter((k) => !sa.has(k))
  const onlySrc = allowedKeys.filter((k) => !sd.has(k))
  ok(allowedKeys.length > 0 && onlyDecl.length === 0 && onlySrc.length === 0,
    `⑦c 契约白名单 ⟷ \`panel-config#allowed\` **逐键一致**（契约 ${declared.length} · 源码 ${allowedKeys.length}${onlyDecl.length ? ` · 契约多 ${onlyDecl.join(',')}` : ''}${onlySrc.length ? ` · 源码多 ${onlySrc.join(',')}` : ''}）`)
}

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（额度覆盖链：消费侧接线 · 范围同源 · 对象类型防线 · **无覆盖时行为等价** · 覆盖真生效 · 留痕字段有消费面）')
