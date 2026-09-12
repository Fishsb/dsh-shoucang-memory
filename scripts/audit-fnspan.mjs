#!/usr/bin/env node
// audit-fnspan.mjs — 函数跨度 / 闭包宽度审计（架构体检的**病灶指标**）
//
// 为什么不是只看「文件行数」：2026-09-12 的教训是 `distill.ts` 的真病根
//   不是「3512 行很大」，而是 **`registerDistill` 是单个 2835 行的函数**，
//   闭包内可见变量 89 个 ⇒ 改动任何一处都要在 89 个名字里穿针引线。
//   文件行数会随拆分发散，但**单函数跨度**不会 —— 它才是「改一处要理解多少上下文」的代理量。
//   ⇒ 只守文件行数，等于把一个 2835 行函数切成三个文件后判「治好了」。
//
// 指标：
//   · span：顶层函数/工厂的起止行数（列 0 的 `function` / `const X = (…) =>` 到配对的列 0 `}`）
//   · vars：该函数体内**闭包可见**的变量数（同文件模块级 const/let/function + 顶层参数）
//   · refRatio：函数体实际引用到的模块级变量 / 可见总数 —— 低比率 = 高耦合潜力但低实际耦合
//      （distill 的 runDeepSleep 实测 22/89 ≈ 25% ⇒ 可拆）
//
// 用法: node scripts/audit-fnspan.mjs [--top N] [--threshold 行]
//   退出码：默认 0（报告态）；`--gate` 时任一函数跨度 > 阈值 ⇒ exit 1
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] ?? d) : d }
const TOP = Number(argOf('--top', '5'))
const THRESHOLD = Number(argOf('--threshold', '400'))
const AS_GATE = args.includes('--gate')
const dirArg = argOf('--dir', null)
const dir = dirArg ? resolve(dirArg) : join(process.cwd(), 'src')

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/[^\n]*/gm, (m) => m.replace(/[^\n]/g, ' '))

const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()
const rows = []
let totalLines = 0
for (const f of files) {
  const src = stripComments(readFileSync(join(dir, f), 'utf8'))
  const lines = src.split(/\n/)
  totalLines += lines.length
  // 模块级变量/函数名（闭包可见面）
  const moduleNames = new Set()
  for (const L of lines) {
    let m
    if ((m = L.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/))) moduleNames.add(m[1])
    else if ((m = L.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/))) moduleNames.add(m[1])
  }
  // 顶层函数起点
  const starts = []
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i]
    const m = L.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)
      || L.match(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/)
      || L.match(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function/)
    if (m) starts.push({ i, name: m[1] })
  }
  const spans = starts.map((s, k) => {
    let end = (k + 1 < starts.length ? starts[k + 1].i : lines.length) - 1
    while (end > s.i && !/^\}/.test(lines[end] || '')) end--
    const body = lines.slice(s.i, end + 1).join('\n')
    // 闭包可见 = 模块级名字中，在函数体（去掉声明行）出现过的
    const refs = [...moduleNames].filter((n) => new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(body))
    return { file: f, name: s.name, from: s.i + 1, to: end + 1, len: end - s.i + 1, visible: moduleNames.size, refs: refs.length }
  }).filter((s) => s.len > 20)
  rows.push(...spans)
}
rows.sort((a, b) => b.len - a.len)

// ── 门禁：双层棘轮 ──────────────────────────────────────────────────────────
// ⚠ 为什么不只设一个「阈值」：当前最大函数 1817 行，若阈值取 1817+余量（如 2000），
//   则**今天没有任何东西能触发它** ⇒ 门禁恒绿 = **假绿**：仪表盘看着有覆盖，其实守了个寂寞
//   （与「永久红灯人人无视」同型，只是方向相反）。
//   ⇒ 双层：
//     ① 硬顶 HARD：单个函数行数上限，防「新增怪物」，今天过（取 2000 = 当前最大 + 10%）。
//     ② 债务计数 DEBT_BASE：>SOFT(400) 行的函数**个数**上限，当前实测 4 ⇒ 基线取 4。
//        新增任何一个 >400 行的函数 ⇒ 5 > 4 ⇒ **立刻红**。
//        拆掉一个 ⇒ 实际 3 < 基线 4 ⇒ 输出提示**要求按棘轮收紧基线**（只许收紧不许放松）。
//   两条一起，才既「不制造红灯」又「真能抓住恶化」。
const SOFT = 400
const HARD = 2000
const DEBT_BASE = 4 // 棘轮：允许改小，不允许改大；实测 < 本值时必须收紧
if (AS_GATE) {
  const hard = rows.filter((r) => r.len > HARD)
  const debt = rows.filter((r) => r.len > SOFT)
  const G = (c, m) => console.log(`  ${c ? '✅' : '❌'} ${m}`)
  console.log(`函数跨度门禁 · ${files.length} 模块 · ${totalLines} 行`)
  console.log(`  ① 硬顶：任一函数 ≤ ${HARD} 行`)
  console.log(`  ② 债务：> ${SOFT} 行的函数 ≤ ${DEBT_BASE} 个（棘轮基线）`)
  for (const r of hard) console.log(`     ❌ 硬顶 ${r.file}:${r.from}-${r.to} ${r.name} = ${r.len} 行`)
  const over = debt.length - DEBT_BASE
  G(hard.length === 0, `硬顶：最大 ${rows[0]?.len ?? 0} 行（${rows[0]?.file} ${rows[0]?.name}）`)
  G(over <= 0, `债务：实测 ${debt.length} 个 / 基线 ${DEBT_BASE}${over > 0 ? ` ⇒ 超 ${over} 个` : ''}`)
  if (over > 0) for (const r of debt.sort((a, b) => b.len - a.len).slice(0, DEBT_BASE)) console.log(`       已知债务 ${r.file}:${r.name} = ${r.len} 行`)
  // 棘轮收紧提示：实际债务少于基线 ⇒ 基线已被放松（或有人拆了没收紧）⇒ 必须收紧
  if (over < 0) console.log(`     ⚠ 实测 ${debt.length} < 基线 ${DEBT_BASE} ⇒ 请按棘轮把 DEBT_BASE 收紧到 ${debt.length}`)
  const bad = hard.length || over > 0
  console.log(bad ? '\nFAIL' : '\nPASS')
  process.exit(bad ? 1 : 0)
}

console.log(`函数跨度审计 · ${files.length} 模块 · ${totalLines} 行 · 阈值 ${THRESHOLD} 行`)
console.log('─'.repeat(88))
console.log('文件                   函数                              起-止        跨度  可见/引用')
for (const r of rows.slice(0, TOP)) {
  const pct = r.visible ? Math.round((r.refs / r.visible) * 100) : 0
  console.log(`${r.file.padEnd(20)} ${r.name.padEnd(30)} ${String(r.from).padStart(5)}-${String(r.to).padEnd(5)} ${String(r.len).padStart(5)}  ${r.refs}/${r.visible} (${pct}%)`)
}
const over = rows.filter((r) => r.len > THRESHOLD)
console.log('─'.repeat(88))
console.log(`超阈值函数: ${over.length}${over.length ? ' → ' + over.map((r) => `${r.file}:${r.name}(${r.len})`).join(', ') : ''}`)
const byFile = new Map()
for (const r of rows) byFile.set(r.file, Math.max(byFile.get(r.file) ?? 0, r.len))
console.log('各文件最大跨度: ' + [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => `${f}=${n}`).join('  '))
