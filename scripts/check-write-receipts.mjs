#!/usr/bin/env node
// check-write-receipts.mjs — **写入回执的完备性与语义单一性**（2026-09-20 · `memory-reconcile` 闭合判据的护栏）
//
// ── 判因（真机实测，两处口径缺陷同源）──────────────────────────────────────
// 「行数闭合」判据（`memory-reconcile` ①）要成立，前提是**每条写入路径都发回执、且回执带文件维**。
// 实测两处缺失（本轮抓到并已补）：
//   · **缺项**：`write.consolidate` 是**深睡专属**且硬编码 `target: 'AGENT.md'`
//     （`deepsleep-run.ts`），而**唯一能写 `USER.md` 的 `profiles` 通道完全不发回执**
//     ⇒ 台账里该 type 的 target 分布恒为 `{AGENT.md: 65}`，USER.md 的写入量**无据可查**。
//   · **同字段两语义**：`write.ingest` 的 `target` = **目标库标识**（`targetLib`：`shoucang`/`none`/…），
//     而 `write.consolidate` 的 `target` = **文件名**（`AGENT.md`）⇒ 同名不同义，
//     按文件名匹配 `write.ingest` **永远落空**（MEMORY.md 未解释 499 行的直接成因）。
//
// ── 本件护什么（三条断言）────────────────────────────────────────────────
//   ① **每个写通道必须发回执**：源码里出现的每种"写载体"（`writeProfileLine` / `memAppend` /
//      `applyPrinciples` 等）都必须在同一文件内有对应的 `ledger({ type: 'write.*' })` 调用
//      —— 否则该通道的写入**不进账**（闭合判据的分母缺一块）。
//   ② **回执 type 语义单一**：同一个 `type` 的 `target` **不得**既当文件名又当库标识。
//      判据：把源码里所有 `type: 'write.X'` 与它们所在调用里 `target:` 的**字面量形态**收集起来，
//      同一 type 下**同时**出现「含 `.md` 的字面量」与「库标识字面量（`memory`/`none`/`workspace`/
//      `pending-defer`/`shoucang`）」⇒ 红。
//   ③ **回执字段齐备**：每条 `write.*` 回执必须带 `attempted` 与 `written` 两个计数
//      —— 缺了就没法做闭合（实测历史行曾只有计数、无条目标识）。
//
// ── 反例自证（`--selftest`）────────────────────────────────────────────────
//   注入一段「写画像但不发回执」的源码 ⇒ ① 必红；注入一段「同 type 混文件名与库标识」⇒ ② 必红。
//   **反例样例取自真机原文形态**（本仓纪律：写判据前先 dump 原文样例核形态）。
//
// 用法: node scripts/check-write-receipts.mjs [--selftest] [--json]
// 退出码：0=PASS  1=FAIL
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const AS_JSON = argv.includes('--json')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 剥注释（仓内既有先例：`check-carriers` / `check-observability` 的「先剥注释再匹配」） */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** **写载体**：真正把内容落到记忆库的函数（新增写通道须登记于此，否则①看不到它）。 */
const WRITE_CARRIERS = [
  { fn: 'writeProfileLine', label: '画像行写入（USER.md / AGENT.md）' },
  { fn: 'memAppend', label: 'notes 追加 / 索引写入（经 memory-append.mjs）' },
  { fn: 'applyPrinciples', label: '原则写入（深睡·AGENT.md）' },
]

/** 库标识字面量（`write.ingest.target` 的取值域；出现于 `target:` 位置时判为"非文件名"） */
const LIB_TOKENS = new Set(['memory', 'none', 'workspace', 'pending-defer', 'shoucang', 'project'])

/** 从一段源码里抽 `write.X` 回执：返回 `[{ type, targetLiterals, targetKind, hasAttempted, hasWritten, index }]`
 *  ⚠ **`targetKind` 是显式声明字段**（`'library'` | `'file'`）—— 由本件⑨ 强制要求。
 *  为什么必须显式声明（**本轮实测教训**）：`target` 取值多为**变量**，靠正则猜语义**必然漏判** ——
 *  实测把"文件维回执"塞进 `write.ingest`（真混语义）后，②（字面量）、②′（同文件形态）、
 *  ②″（运行期，样本未产生）**三条全不红**。⇒ 语义必须由**声明**给出，判据才能可靠。 */
function receiptsOf(src) {
  const out = []
  for (const m of src.matchAll(/type:\s*'(write\.[A-Za-z._-]+)'/g)) {
    const win = src.slice(Math.max(0, m.index - 400), m.index + 600)
    const targetLiterals = [...win.matchAll(/\btarget:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g)].map((x) => x[1] ?? x[2] ?? x[3])
    const kindMatch = /\btargetKind:\s*'([^']+)'/.exec(win)
    out.push({
      type: m[1],
      targetLiterals,
      targetKind: kindMatch ? kindMatch[1] : null,
      hasAttempted: /\battempted\s*:/.test(win),
      hasWritten: /\bwritten\s*:/.test(win),
      index: m.index,
    })
  }
  return out
}

/* ── `--selftest`：反例自证（样例取自真机原文形态）───────────────────────── */
if (argv.includes('--selftest')) {
  const cases = [
    // ── ① 写载体必须发回执 ──
    ['正例·写画像且**发**回执（真机形态，已修后）', {
      carrierPresent: true, receiptPresent: true,
    }, true],
    ['**反例**·写画像但**不发**回执（真机修前形态：profiles 循环无 ledger 调用）', {
      carrierPresent: true, receiptPresent: false,
    }, false],
    ['正例·不涉写载体（判据不适用）', {
      carrierPresent: false, receiptPresent: false,
    }, true],
    // ── ② 同 type 语义单一 ──
    ['正例·write.profile 的 target 全是文件名（真机形态）', {
      typeTargets: { 'write.profile': ["'USER.md'", "'AGENT.md'"] },
    }, true],
    ['**反例**·write.ingest 混文件名与库标识（真机修前矛盾形态）', {
      typeTargets: { 'write.ingest': ["'shoucang'", "'AGENT.md'"] },
    }, false],
    ['正例·write.consolidate 只写文件名（真机形态）', {
      typeTargets: { 'write.consolidate': ["'AGENT.md'"] },
    }, true],
  ]
  let bad = 0
  for (const [label, input, want] of cases) {
    let got
    if ('typeTargets' in input) {
      // ② 的判据：同一 type 下同时出现"文件名"与"库标识"⇒ 红
      got = Object.entries(input.typeTargets).every(([, ts]) => {
        const files = ts.filter((t) => /\.md$/.test(t.replace(/['"]/g, '')))
        const libs = ts.filter((t) => LIB_TOKENS.has(t.replace(/['"]/g, '')))
        return !(files.length && libs.length)
      })
    } else {
      // ① 的判据：有写载体 ⇒ 必须有回执
      got = !input.carrierPresent || input.receiptPresent
    }
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判${got ? '绿' : '红'}（期望${want ? '绿' : '红'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (!negs.length) { bad++; console.log('❌ 自证必须含反例') }
  console.log(bad ? `\nFAIL（${bad} 例）` : `\nPASS（写入回执判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑：扫 src/*.ts ─────────────────────────────────────────────────── */
const SRC = join(root, 'src')
if (!existsSync(SRC)) { console.log('❌ 找不到 src/（扫描范围错误必须判红，不得静默）'); process.exit(1) }
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'))
const srcOf = new Map()
for (const f of files) {
  try { srcOf.set(f, strip(readFileSync(join(SRC, f), 'utf8'))) } catch { fail++; console.log(`  ❌ 读不到 src/${f}`) }
}

/* ① 每个写通道必须发回执（**同文件内**出现写载体调用 ⇒ 同文件内须有 write.* 回执）
 * ⚠ **首版在此误报**（先红自证抓到）：把 `deepsleep-contract.ts:62` 的**接口声明**
 *   `writeProfileLine(root: string, …): { … }` 当成了调用点 ⇒ 报"该文件缺回执"。
 *   ⇒ 判据须排除**类型/接口声明形态**（行内含 `):` 或行首为标识符+参数列表后跟返回类型）。
 *   这正是本仓纪律「写判据前先 dump 原文样例核形态」要防的事 —— 首版没做，故误报。 */
const isTypeDecl = (line) => /\)\s*:\s*[\w{|<'"]/.test(line) || /^\s*(readonly\s+)?\w+(?:<[^>]*>)?\s*:\s*\(/.test(line)
const carrierFiles = []
for (const { fn, label } of WRITE_CARRIERS) {
  const used = []
  for (const [f, s] of srcOf) {
    const lines = s.split('\n')
    const hit = lines.some((l) => new RegExp(`\\b${fn}\\s*\\(`).test(l)
      && !isTypeDecl(l)
      && !new RegExp(`(function|const)\\s+${fn}\\b`).test(l))
    if (hit) used.push([f])
  }
  if (!used.length) { console.log(`   · （未使用）${fn} —— ${label}`); continue }
  for (const [f] of used) carrierFiles.push({ f, fn, label })
}
/* ① 每个写通道必须发回执（**同文件内**出现写载体调用 ⇒ 同文件内须有 write.* 回执） */
console.log('写入回执的完备性与语义单一性（`memory-reconcile` 闭合判据的护栏）')
const missingReceipt = []
for (const { f, fn } of carrierFiles) {
  const s = srcOf.get(f) || ''
  const hasReceipt = receiptsOf(s).length > 0
  if (!hasReceipt) missingReceipt.push(`src/${f}#${fn}`)
}
ok(missingReceipt.length === 0,
  `① 每个写载体所在文件都有 \`write.*\` 回执（生产 ${carrierFiles.length} 处；缺：${missingReceipt.join(', ') || '无'}）`)

/* ② 同一 type 下 target 语义单一（不得既当文件名又当库标识）
 * ⚠ **判据的真实局限（先红自证实测 · 如实登记，不假装覆盖）**：
 *   实测把 `write.profile` 改成 `write.ingest`（**制造真矛盾**）后，本断言**不翻红** ——
 *   因为两处的 `target` 都是**表达式**（`target: k` / `target: disp.targetLib`），
 *   **静态看不到运行期取值** ⇒ 本断言只能抓「**字面量**混用」形态（如 `target: 'shoucang'`
 *   与 `target: 'AGENT.md'` 写在同一 type 下），**抓不到"两个变量各持一种语义"**。
 *   ⇒ 故另有一条**互补判据**：`check-write-receipts` 的 ①（每个写载体都要发回执）+
 *     `scripts/check-field-usage.mjs` 的字段角色表 —— 后者登记 `target` 的**角色**，
 *     新增回执时须显式声明其 `target` 是"文件名"还是"库标识"（**语义入册**，靠人审 + 字段表）。
 *   ⚠ **真正的根治是运行期断言**：对台账实跑采样，看同一 type 下 target 的**取值形态分布**
 *     （是否出现 `.md` 尾与库标识尾并存）。本件**不做**（需真库样本 + 属观测面，另立）。 */
const byType = new Map()
for (const [f, s] of srcOf) {
  for (const r of receiptsOf(s)) {
    const slot = byType.get(r.type) || { files: new Set(), targets: [] }
    slot.files.add(`src/${f}`)
    slot.targets.push(...r.targetLiterals)
    byType.set(r.type, slot)
  }
}
const semanticClash = []
for (const [type, slot] of byType) {
  const files = slot.targets.filter((t) => /\.md$/.test(String(t).replace(/['"]/g, '')))
  const libs = slot.targets.filter((t) => LIB_TOKENS.has(String(t).replace(/['"]/g, '')))
  if (files.length && libs.length) semanticClash.push(`${type}（文件名 ${[...new Set(files)].join('/')} + 库标识 ${[...new Set(libs)].join('/')}）`)
}
ok(semanticClash.length === 0,
  `② 同一回执 type 的 \`target\` 语义单一（不得既文件名又库标识）${semanticClash.length ? ` —— 违规：${semanticClash.join(' · ')}` : ` · 扫描 ${byType.size} 种 write.*`}`)

/* ②″ **运行期判据**（补静态判据的盲区 · 本轮实测后新增）：
 *   静态判据抓不到"两个变量各持一种语义"（先红自证已证）。⇒ 加一条**扫真库台账**的断言：
 *   把跨档全部 `write.*` 行按 type 分组，看同一个 type 下 `target` 的**取值形态**是否混用
 *   （`*.md` 尾 vs 库标识尾）—— **这才是能抓到真矛盾的判据**（运行期已落库的取值是事实）。
 *   ⚠ 报告态到**有真行**才算数：新 type（如 `write.profile`）在补丁前**零行** ⇒ 如实标"无样本"，
 *     不假装通过（仓内纪律：N=0 显式记 0）。 */
const { existsSync: ex2 } = await import('node:fs')
const kRootGuess = join(process.env.DSH_HOME || join(process.env.USERPROFILE || '', '.dsh'), 'suite', 'knowledge', 'audit', 'ledger.jsonl')
{
  const { readLedgerVolumes } = await import(new URL('../lib/ledger-compact.js', import.meta.url).href)
  const { homedir } = await import('node:os')
  /* `--kroot <dir>`：**测试用**覆盖（否则本判据无法先红自证 —— 实测 `DSH_HOME` 对本件不生效，
   *   因本件走 `homedir()`；无覆盖口就没有判别力自证，属仓内"夹具绿非真数据绿"的对偶问题）。 */
  const krootArg = (() => { const i = argv.indexOf('--kroot'); return i > -1 && argv[i + 1] ? argv[i + 1] : null })()
  const led = krootArg
    ? join(krootArg, 'audit', 'ledger.jsonl')
    : join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'knowledge', 'audit', 'ledger.jsonl')
  if (!ex2(led)) {
    console.log('   · ②″ 运行期判据：台账缺席 ⇒ **无样本**（不假装通过）')
  } else {
    const libToks = new Set(['memory', 'none', 'workspace', 'pending-defer', 'shoucang', 'project', ''])
    const byTypeLive = new Map()
    for (const line of readLedgerVolumes(led)) {
      let o
      try { o = JSON.parse(line) } catch { continue }
      const t = String(o.type || '')
      if (!t.startsWith('write.')) continue
      const slot = byTypeLive.get(t) || { n: 0, fileLike: 0, libLike: 0, other: 0, samples: new Set() }
      slot.n++
      const v = String(o.target ?? '')
      if (/\.md$/.test(v)) slot.fileLike++
      else if (libToks.has(v)) slot.libLike++
      else slot.other++
      if (slot.samples.size < 4) slot.samples.add(v || '(空)')
      byTypeLive.set(t, slot)
    }
    const clashLive = []
    for (const [t, s] of byTypeLive) if (s.fileLike > 0 && s.libLike > 0) clashLive.push(`${t}（文件名 ${s.fileLike} 行 + 库标识 ${s.libLike} 行）`)
    ok(clashLive.length === 0,
      `②″ **运行期** target 形态单一（真库台账跨档实测）${clashLive.length ? ` —— 违规：${clashLive.join(' · ')}` : ''}`)
    console.log('      运行期样本（**N=0 显式记 0**，不假装通过）：')
    for (const [t, s] of [...byTypeLive.entries()].sort()) {
      console.log(`        ${t.padEnd(20)} 行 ${String(s.n).padStart(5)} · 文件名 ${String(s.fileLike).padStart(5)} / 库标识 ${String(s.libLike).padStart(5)} / 其他 ${String(s.other).padStart(5)} · 样本 ${[...s.samples].map((x) => JSON.stringify(x)).join(' ')}`)
    }
  }
}

/* ②′ **显式语义声明齐一**（`targetKind`）—— 【本件的主判据】
 *   判因（**本轮亲身踩到，值得完整记档**）：给 `write.ingest` 加"文件维回执"时，第一版把 `target`
 *   写成**文件名**，而同一 type 既有回执的 `target` 是**库标识** ⇒ **同 type 混语义**。
 *   而当时三条判据**全都不红**：② 只看字面量（两处都是变量）· ②′（旧版）靠正则**猜**形态（猜不出）
 *   · ②″ 只看真库样本（**新回执尚未产生，行数 0**）⇒ **真跑起来才会暴露**。
 *   ⇒ 改为**显式声明**：每条回执必须带 `targetKind`（`'file'` | `'library'`），判据只做"同 type 齐一"
 *     的比较 —— **不依赖取值形态、不依赖样本是否已产生**（这是本条相对 ②/②″ 的根本改进）。
 *   ⚠ 缺声明即红（不许省略）：省略了就退回"靠猜"，而靠猜已证不可靠。 */
{
  const kindsByType = new Map()
  const missingKind = []
  for (const [f, s] of srcOf) {
    for (const r of receiptsOf(s)) {
      if (!r.targetKind) { missingKind.push(`src/${f} ${r.type}`); continue }
      const set = kindsByType.get(r.type) || new Set()
      set.add(r.targetKind)
      kindsByType.set(r.type, set)
    }
  }
  ok(missingKind.length === 0,
    `②′ 每条 write.* 回执必须显式声明 \`targetKind\`（'file' | 'library'）${missingKind.length ? ` —— 缺：${missingKind.join(' · ')}` : ` · 已声明 ${[...kindsByType.values()].reduce((n, s) => n + s.size, 0)} 处`}`)
  const mixedKind = []
  for (const [type, set] of kindsByType) if (set.size > 1) mixedKind.push(`${type}（${[...set].join(' + ')}）`)
  ok(mixedKind.length === 0,
    `②′ 同一 type 下 \`targetKind\` 齐一（**不靠猜取值形态**）${mixedKind.length ? ` —— 违规：${mixedKind.join(' · ')}` : ` · ${[...kindsByType.entries()].map(([t, s]) => `${t}=${[...s].join('/')}`).join(' · ')}`}`)
}

/* ③ 回执字段齐备（attempted + written 两个计数） */
const incomplete = []
for (const [f, s] of srcOf) for (const r of receiptsOf(s)) {
  if (!r.hasAttempted || !r.hasWritten) incomplete.push(`src/${f} ${r.type}（attempted=${r.hasAttempted} written=${r.hasWritten}）`)
}
ok(incomplete.length === 0,
  `③ 每条 write.* 回执都带 \`attempted\` + \`written\`（缺 ⇒ 无法做行数闭合）${incomplete.length ? ` —— 缺：${incomplete.join(' · ')}` : ''}`)

console.log('')
console.log('📋 回执 type 清单（**不静默**：逐条列出 target 字面量）：')
for (const [type, slot] of [...byType.entries()].sort()) {
  console.log(`   · ${type.padEnd(20)} ${[...slot.targets].map((t) => JSON.stringify(t)).join(' / ') || '（target 为变量 ⇒ 语义由运行期决定）'}  ← ${[...slot.files].join(', ')}`)
}
if (AS_JSON) console.log(JSON.stringify({ carriers: carrierFiles.length, types: [...byType.keys()], missingReceipt, semanticClash, incomplete }, null, 2))

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（写入回执完备 · type 语义单一 · 字段齐备）')
