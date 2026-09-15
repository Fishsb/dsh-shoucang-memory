#!/usr/bin/env node
// check-pane-sections.mjs —「`factory` 内分区块」规模门（UI1/U2-B · 2026-09-15）
//
// **判因（为什么是"分区块"而不是"拆文件"）**：UI1/U2 原定把 24 个 `render*` 迁到 7 个 pane 模块，
//   但该前提经**三次独立实测证伪**（见 `UI1-panel-architecture-plan.md` §U2-阻滞）：
//     · 首刀 `renderViewSettings` 依赖 **20 个** `body.js` 内部符号；
//     · 应用层仅 72 行却拖 `buildLogPanel`/`pollTimer`/`currentView`/`show`/`refs`；
//     · `panes/ctx.js` 因 `refs` **由 `buildModal`（壳层）写、却被 6 个 render 读** ⇒ 需全闭包上下文。
//   且 `body.js` 是 **DSH 客户端插件入口**（`__ModuleLoader__.load` 在 IIFE 内**同步**执行，
//   `var inject` 属**注册契约**不可外移）—— 实测外移会导致**插件完全不加载**（75 条渲染断言全挂、无页面错误）。
//   ⇒ 改判据：**不拆文件**，改为「`factory` 内**分区块** + 机检守**每区块行数** + 守**覆盖完整性**」。
//
// **为什么"覆盖完整性"是必须的一半**：只守"每节 ≤ 上限"有个显然的绕过 —— **把标记删掉**，
//   那块代码就落进上一节的"尾巴"里，节数看着正常，规模却失控。故必须同时断言：
//   **从 `factory` 体开始到体结束，每一行都归属某个已标记的节**（无主区域 = 堆积温床 = 直接报）。
//
// 断言：
//   A1 分节标记**存在**且**按行号单调**（乱序即报 —— 说明有人插错位置）
//   A2 每节行数 ≤ 上限（**先红**：首跑应报出超限节，证明门真的在量）
//   A3 **覆盖完整性**：`factory` 体无"无主区域"（标记之前/之间的裸代码段）
//   A4 **反例自证**：删一个标记 ⇒ A3 必须报；构造超限节 ⇒ A2 必须报
//   A5 节数 ≥ 基线（**防"合并标记"式绕过**：把 2 个节合成 1 个，规模看着没变）
//
// 退出码：0 = pass · 1 = fail · 3 = skip（src-client 缺席）
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
/* UI1（2026-09-15 用户指正）：节大小用**有效行数**（注释/空行不计）——与 check-module-growth 同口径。
 *  原按物理行 ⇒ 注释灌水也能"达标"，且 U2-B 的"只加注释"会虚增节大小。 */
import { codeLinesOf } from './check-module-growth.mjs'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BODY = join(root, 'src-client', 'body.js')
if (!existsSync(BODY)) { console.log('check-pane-sections: src-client/body.js 缺席 ⇒ skip（exit 3）'); process.exit(3) }

/** 每节行数上限（**先红基线**：实测后按棘轮思路只许降 —— 本值即"当前最坏节"的量级） */
/** 上限（**有效行数口径** · 2026-09-15 改）：原 400 是物理行；改口径后按同量级取 320 */
const SECTION_CAP = Number(process.env.PANE_CAP || 320)
/** 节数下限（防"合并标记"绕过；实测值见下方 BASELINE_SECTIONS） */
const BASELINE_SECTIONS = 15
/**
 * **`factory` 前置声明区白名单**（2026-09-15 修：首版误报 4 行"无主区域"）。
 *
 * 判因：`factory` 体开头有**必需的声明区**，它们**逻辑上不属于任何分节**：
 *   · `var module` / `var exports` —— `__ModuleLoader__` 包装变量（DSH 客户端插件契约）
 *   · `var BASE` —— RPC 前缀常量
 *   · `var inject` —— **插件注册契约**（声明需要哪些宿主插槽；实测外移会导致插件完全不加载）
 * ⇒ 把它们当"无主区域"是**判据过粗**。现改为：**前置区允许出现且仅允许出现这些符号**，
 *   其余代码出现在标记之前 ⇒ 仍报（保留"别处不留无主区"的真实约束）。
 */
const PRELUDE_ALLOW = [/^\s*var module\s*=/, /^\s*var exports\s*=/, /^\s*var BASE\s*=/, /^\s*var inject\s*=/, /^\s*\/\//, /^\s*\/\*/, /^\s*\*/, /^\s*$/]

/** 从源码抽出分节标记。
 *  三种风格：`/* ---- x ---- *​/` · `/* ==== x ==== *​/` · `/* --- x ---` 开头的块注。
 *  ⚠ 本注释**不得写出完整的块注释定界符**（首版写了 ⇒ 提前关闭外层注释 ⇒ `TypeError: 15 is not a function`）。 */
export function sectionsOf(text) {
  const lines = text.split('\n')
  const marks = []
  lines.forEach((l, i) => {
    const m = /^\s*\/\* (?:-{2,}|={3,})\s*(.+?)\s*(?:-{2,}|={3,})?\s*(?:\*\/)?\s*$/.exec(l)
    if (m) marks.push({ ln: i + 1, title: m[1].replace(/[-=*/\s]+$/, '').trim() })
  })
  return marks
}

/** `factory` 体的行区间（`factory: function (require) {` → 与之配平的那个 `}`） */
export function factoryRange(lines) {
  const s = lines.findIndex((l) => /factory:\s*function\s*\(\s*\w*\s*\)\s*\{/.test(l))
  if (s < 0) return null
  let d = 0, seen = false
  for (let i = s; i < lines.length; i++) {
    for (const c of lines[i]) { if (c === '{') { d++; seen = true } else if (c === '}') d-- }
    if (seen && d <= 0) return { s, e: i }
  }
  return null
}

/** 纯函数判定（供 selftest 驱动）：返回 { problems, sizes } */
export function evaluate(text, cap = SECTION_CAP, baseSections = BASELINE_SECTIONS) {
  const problems = []
  const lines = text.split('\n')
  const fr = factoryRange(lines)
  if (!fr) return { problems: ['未能定位 `factory:` 函数体（结构变了？）'], sizes: [] }
  const marks = sectionsOf(text).filter((m) => m.ln - 1 >= fr.s && m.ln - 1 <= fr.e)
  if (!marks.length) return { problems: ['`factory` 体内**没有任何分节标记** ⇒ 无法守规模'], sizes: [] }

  // A1 单调
  for (let i = 1; i < marks.length; i++) {
    if (marks[i].ln <= marks[i - 1].ln) problems.push(`[乱序] 分节标记非单调：L${marks[i - 1].ln} → L${marks[i].ln}`)
  }
  // A3 覆盖完整性：factory 体首行 → 第一个标记之间**只允许前置声明区**（见 PRELUDE_ALLOW）
  const isCode = (l) => l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l)
  const headLines = lines.slice(fr.s + 1, marks[0].ln - 1)
  const headGap = headLines.filter((l) => isCode(l) && !PRELUDE_ALLOW.some((re) => re.test(l)))
  if (headGap.length) {
    problems.push(`[无主区域] \`factory\` 体开头到首个标记之间有 ${headGap.length} 行**非前置声明**代码（未被任何节覆盖）：${headGap.slice(0, 2).map((l) => l.trim().slice(0, 40)).join(' / ')}`)
  }
  // 节大小
  const sizes = marks.map((m, i) => {
    const from = m.ln - 1
    const to = (i + 1 < marks.length ? marks[i + 1].ln - 1 : fr.e) - 1
    // **有效行数**：把该节的源码片断交给 codeLinesOf（注释/空行不计）
    return { title: m.title, ln: m.ln, lines: codeLinesOf(lines.slice(from, to + 1).join('\n')) }
  })
  // A2 超限
  for (const s of sizes) if (s.lines > cap) problems.push(`[超限] 节「${s.title}」(L${s.ln}) 实测 ${s.lines} 行 > 上限 ${cap} ⇒ 该节需要**按领域接缝**再分（不是按行数硬切）`)
  // A5 节数下限
  if (sizes.length < baseSections) problems.push(`[节数] 实测 ${sizes.length} < 基线 ${baseSections} ⇒ 疑似"合并标记"式绕过（把多节并成一节则每节都不超限）`)
  return { problems, sizes }
}

// ── selftest：反例自证（A4）──
if (process.argv.includes('--selftest')) {
  let bad = 0
  const okc = (c, n) => { console.log(`${c ? '✅' : '❌'} ${n}`); if (!c) bad++ }
  const mk = (marks) => 'factory: function (require) {\n' + marks.map((m) => `/* ---- ${m.t} ---- */\n` + Array(m.n).fill('  var x = 1;').join('\n')).join('\n') + '\n}'
  okc(evaluate(mk([{ t: 'a', n: 10 }, { t: 'b', n: 10 }]), 100, 2).problems.length === 0, '正常：两节各 10 行、上限 100 ⇒ 无错')
  okc(evaluate(mk([{ t: 'a', n: 150 }, { t: 'b', n: 10 }]), 100, 2).problems.some((p) => p.includes('超限')), '反例：某节 150 行 > 上限 100 ⇒ 报超限')
  okc(evaluate(mk([{ t: 'a', n: 10 }, { t: 'b', n: 10 }]), 100, 5).problems.some((p) => p.includes('节数')), '反例：把 2 节合成 1 组（节数不足）⇒ 报"合并标记"式绕过')
  const noMark = 'factory: function (require) {\n  var a = 1;\n  var b = 2;\n}'
  okc(evaluate(noMark, 100, 1).problems.some((p) => p.includes('没有任何分节标记')), '反例：删光标记 ⇒ 报"无法守规模"')
  const headGap = 'factory: function (require) {\n  var orphan1 = 1;\n  var orphan2 = 2;\n  var orphan3 = 3;\n/* ---- a ---- */\n  var x = 1;\n}'
  okc(evaluate(headGap, 100, 1).problems.some((p) => p.includes('无主区域')), '反例：标记之前留**非前置声明**的裸代码 ⇒ 报"无主区域"')
  const prelude = 'factory: function (require) {\n  var module = { exports: {} };\n  var exports = module.exports;\n  var BASE = 1;\n  var inject = [];\n/* ---- a ---- */\n  var x = 1;\n}'
  okc(evaluate(prelude, 100, 1).problems.length === 0, '正常：`factory` 前置声明区（module/exports/BASE/inject）**不**算无主区域（修首版误报）')
  console.log(bad ? `\nFAIL（${bad} 条自证未过）` : '\nPASS（selftest：超限/合并绕过/无标记/无主区域四类判定均已自证）')
  process.exit(bad ? 1 : 0)
}

const text = readFileSync(BODY, 'utf8')
const { problems, sizes } = evaluate(text)
console.log(`分区块规模门 · 上限 ${SECTION_CAP} 行/节 · 节数下限 ${BASELINE_SECTIONS}`)
console.log(`  ── 实测 ${sizes.length} 节 ──`)
for (const s of sizes.sort((a, b) => b.lines - a.lines)) console.log(`  ${String(s.lines).padStart(4)} 行  L${String(s.ln).padStart(4)}  ${s.title.slice(0, 66)}`)
if (problems.length) {
  console.log('')
  problems.forEach((p) => console.log('❌ ' + p))
  console.log(`\nFAIL（${problems.length} 项）`)
  process.exit(1)
}
console.log('\nPASS（每节 ≤ 上限 · 覆盖完整 · 节数达标）')
