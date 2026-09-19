#!/usr/bin/env node
// check-test-self-restore.mjs — **"自改源码"型测试件必须能自愈**（2026-09-20 · 事故驱动 · 登记制）
//
// ── 判因（真机事故：一次污染拖红 4 道门）────────────────────────────────────
// `test-split-equivalence.mjs` 是**先红自证**型测试：**临时改写真实源文件**做反例注入
// （`src-client/panes-toggles.js` / `styles.js`），约定"finally 里逐字节还原"。
// 实测反例**留在了工作树**，4 道门同时红：`test-split-equivalence`（找不到锚点）·
// `test-panel-view-contract`（缺 sched tab）· `ui-geo-regress`（几何破坏）· `test-css-usage-gate`。
//
// **根因（两个叠在一起）**：① **`process.exit()` 不执行 `finally`** ⇒ 锚点缺失分支直接退出、跳过还原；
// ② 而"锚点缺失"**恰恰就是"上次未还原"的信号** ⇒ 形成**不可自愈死循环**（一旦污染，永不自恢复）。
//
// ── 判据设计：**显式登记制**（不是推断制 · 三版教训记档）────────────────────
// v1「写 + 路径含 src」⇒ 误报 **31 件**（生成器/门禁全进来）；
// v2「+ 反例/还原语汇」⇒ 仍误报 **9 件**（写临时目录者因注释提到"反例"被判进来）；
// v3「跟踪路径绑定」⇒ 仍误报 **7 件**（生成器写 `src-client` 字面量属**正常产出**）。
// ⇒ **三版都错在同一个方向**：想用静态分析**推断**"谁在改真实源码"。
//   而本仓纪律明写「**禁止为 ≤2 个使用点提前抽象**」—— 全仓**真正**会改真实源码的件，实测**只有 1 个**。
// ⇒ v4（本版）改**登记制**：`SELF_MODIFYING` 显式列出这类件（新增须写明理由），
//   判据只检查**已登记的那些**是否满足自愈要求；另加一条**报告态**的"未登记候选"提示（交人眼）。
//   —— 与仓内 `check-ledger-read` 的 `EXEMPT_SCRIPTS`、`check-observability` 的 `EXEMPT` **同构**。
//
// ── 三条硬判据（只对已登记件）──────────────────────────────────────────────
//   ① `try` 块内**不得** `process.exit`（会跳过 finally ⇒ 污染不可自愈）；退出码用 `process.exitCode`。
//   ② 必须有**还原兜底**：`finally` 里存在"内存还原"（写回 `orig`）或 `git checkout --`。
//   ③ **锚点缺失分支不得裸退出**，且必须给出还原路径（否则重复本事故）。
//   ④ **反例自证**（`--selftest`）：样例取自**真机事故原文**，无此则本件是恒真断言。
//
// 用法: node scripts/check-test-self-restore.mjs [--selftest]
// 退出码：0=PASS  1=FAIL
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** **登记制**：会"临时改真实源文件、约定事后还原"的件（新增须写明理由与还原方式）。
 *  ⚠ 登记不是许可，是让它**可见**；未登记但实际自改源的件会在下方「未登记候选」里被提示（报告态）。 */
const SELF_MODIFYING = new Map([
  ['scripts/test-split-equivalence.mjs', '先红自证：注入「不渲染 sched tab」+「导航宽 4px」两处反例（改 `src-client/`），finally 逐字节还原 + 锚点缺失时 `git checkout --` 兜底'],
])

/** 剥注释（仓内既有先例：`check-carriers` / `check-observability` 的「先剥注释再匹配」）
 *  ⚠ 只剥**注释**，**不动字符串字面量** —— 实测教训：本件一度把字符串也剥成空引号，
 *     于是 `execFileSync('git', ['checkout','--',f])` 变成 `('', ['','',f])` ⇒
 *     **还原兜底的判据认不出来** ⇒ 自证正例假红。
 *     而"注释里提到 process.exit"这个需求，靠**先剥注释**已足够（注释在字符串之外）。 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** 取**主 `try { … } finally`** 之间的体。
 *  ⚠ **必须取"带 finally 的那个 try"**，不能取第一个 `try {`：实测 `test-split-equivalence` 里有
 *     一个**函数内的局部 try/catch**（`build()` 里的构建失败处理，且它**故意** `process.exit(1)` ——
 *     那是"构建失败即门失败"的既有加固，与本判据无关）。取第一个 try ⇒ **假红**（本轮实测）。 */
const tryBody = (src) => {
  // 找所有 `} finally`，回退到最近的 `try {`
  const fi = src.indexOf('} finally')
  if (fi < 0) return ''
  const ti = src.lastIndexOf('try {', fi)
  return ti >= 0 ? src.slice(ti, fi) : ''
}
/** 取 `} finally` 之后的体（到文件末或下一个顶层 `}`）—— 还原动作**必须在 finally 里**才算数。
 *  ⚠ 判据关键（第三版才判准）：**看还原动作的位置，不看变量名** ——
 *    首版认 `orig|raw|backup` 等**名字** ⇒ 自证正例假红；
 *    次版放宽到"值是个标识符" ⇒ **反例"只写不还原"漏判**（`broken` 也是标识符）。
 *    ⇒ 正解：还原 = 在 **finally 体内**出现"把某个标识符写回某个路径"（或 `git checkout --`）。 */
const finallyBody = (src) => {
  const i = src.indexOf('} finally')
  return i < 0 ? '' : src.slice(i)
}
const hasRestore = (s) => {
  const fb = finallyBody(s)
  if (!fb) return false
  if (/git['"]?\s*,\s*\[?\s*['"]checkout/.test(fb) || /['"]checkout['"]\s*,\s*['"]--['"]/.test(fb)) return true
  // finally 体内：把标识符写回路径（还原语义）
  return /writeFileSync\s*\([^,]+,\s*[A-Za-z_$][\w$]*\s*[,)]/.test(fb)
}

/* ── `--selftest`：反例自证（样例取自**真机事故原文**）────────────────────── */
if (argv.includes('--selftest')) {
  const cases = [
    ['正例·修后形态（`exit` 改 `exitCode` + finally 有 git 兜底）',
      `let restored = false\nlet exitedEarly = 0\ntry {\n  if (!text.includes(MARK)) { exitedEarly = 1 } else {\n    writeFileSync(TARGET, broken)\n    restored = true\n  }\n} finally {\n  if (!restored) { execFileSync('git', ['checkout','--',f], {cwd:root}) }\n}\nprocess.exitCode = (bad || exitedEarly) ? 1 : 0`, 'green'],
    ['**反例**·真机事故原文（try 内 `process.exit(1)` ⇒ 跳过 finally）',
      `const orig = readFileSync(TARGET)\nlet restored = false\ntry {\n  if (!text.includes(MARK)) {\n    console.log('找不到注入点标记')\n    process.exit(1)\n  }\n  writeFileSync(TARGET, broken)\n} finally { if (!restored) writeFileSync(TARGET, orig) }`, 'exit-in-try'],
    ['**反例**·只写不还原（finally 无还原动作）',
      `try {\n  writeFileSync(TARGET, broken)\n  build()\n} finally { console.log('done') }`, 'no-restore'],    ['**反例**·锚点分支裸退出（会形成不可自愈死循环）',
      `try {\n  if (!t.includes(MARK)) { console.log('找不到锚点'); process.exit(1) }\n  writeFileSync(T, broken)\n} finally { }`, 'exit-in-try'],
  ]
  let bad = 0
  for (const [label, src, want] of cases) {
    const s = strip(src)
    let got = 'green'
    if (/process\.exit\(/.test(tryBody(s))) got = 'exit-in-try'
    else if (!hasRestore(s)) got = 'no-restore'
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判「${got}」（期望「${want}」）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (!negs.length) { bad++; console.log('❌ 自证不含反例 —— 恒真断言不得进验收') }
  console.log(bad ? `\nFAIL（${bad} 例）` : `\nPASS（自愈判据自证可用：${cases.length} 例，含 ${negs.length} 条反例，样例取自真机事故原文）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑：只检查**已登记**的件 ──────────────────────────────────────────── */
console.log('「自改源码」型测试件的自愈性（登记制 · 只查已登记件）')
console.log(`  登记 ${SELF_MODIFYING.size} 件：`)
for (const [p, why] of SELF_MODIFYING) console.log(`   · ${p} —— ${why}`)

const exitInTry = []
const noRestore = []
const bareAnchorExit = []
const missing = []
for (const [p] of SELF_MODIFYING) {
  const abs = join(root, p)
  if (!existsSync(abs)) { missing.push(p); continue }
  const s = strip(readFileSync(abs, 'utf8'))
  if (/process\.exit\(/.test(tryBody(s))) exitInTry.push(p)
  if (!hasRestore(s)) noRestore.push(p)
  /* 锚点缺失分支：出现"找不到…标记/锚点"语汇，且其后 300 字符内直接 `process.exit` */
  for (const m of s.matchAll(/(找不到|锚点过期|结构变了)/g)) {
    const win = s.slice(m.index, m.index + 300)
    if (/process\.exit\(/.test(win)) { bareAnchorExit.push(p); break }
  }
}
ok(missing.length === 0, `① 登记件都存在${missing.length ? ` —— 缺：${missing.join(', ')}` : ''}`)
ok(exitInTry.length === 0,
  `② \`try\` 块内**不得** \`process.exit\`（会跳过 finally ⇒ 污染不可自愈）${exitInTry.length ? ` —— 违规：${exitInTry.join(', ')}` : ''}`)
ok(noRestore.length === 0,
  `③ 必须有**还原兜底**（内存还原回 \`orig\` 或 \`git checkout --\`）${noRestore.length ? ` —— 缺：${noRestore.join(', ')}` : ''}`)
ok(bareAnchorExit.length === 0,
  `④ 锚点缺失分支不得裸退出（那正是"上次未还原"的信号 ⇒ 会形成不可自愈死循环）${bareAnchorExit.length ? ` —— 违规：${bareAnchorExit.join(', ')}` : ''}`)

/* ── 未登记候选（**报告态**）：用一句弱判据撒网，交人眼核 ────────────────────
 * 只认"写 `src-client/` 字面量 **且** 含 `readFileSync(...)` + 写回原值的形态"——
 * 生成器（`gen-*` / `build-client`）只写不读回 ⇒ 天然不入选。**列出即可，不判红**。 */
const S = join(root, 'scripts')
const suspects = []
for (const f of (existsSync(S) ? readdirSync(S).filter((x) => x.endsWith('.mjs')) : [])) {
  const p = `scripts/${f}`
  if (SELF_MODIFYING.has(p)) continue
  let s = ''
  try { s = strip(readFileSync(join(S, f), 'utf8')) } catch { continue }
  if (/writeFileSync\s*\(/.test(s) && /src-client[\\/]/.test(s) && /readFileSync\s*\(/.test(s) && /restored/.test(s)) suspects.push(p)
}
console.log(`   · 未登记候选（**报告态**，交人眼核；不含"只写不读回"的生成器）：${suspects.join(', ') || '无'}`)

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（已登记的自改源码件均可自愈：无 exit-in-try · 有还原兜底 · 锚点分支不裸退）')
