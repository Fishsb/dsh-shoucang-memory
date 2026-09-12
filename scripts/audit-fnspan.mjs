#!/usr/bin/env node
// audit-fnspan.mjs — 函数跨度审计（架构体检的**病灶指标**）
//
// 为什么不是只看「文件行数」：2026-09-12 的教训是 `distill.ts` 的真病根
//   不是「3512 行很大」，而是 **`registerDistill` 是单个 2835 行的函数**，
//   闭包内可见变量 89 个 ⇒ 改动任何一处都要在 89 个名字里穿针引线。
//   文件行数会随拆分发散，但**单函数跨度**不会 —— 它才是「改一处要理解多少上下文」的代理量。
//   ⇒ 只守文件行数，等于把一个 2835 行函数切成三个文件后判「治好了」。
//
// ⚠ 为什么**必须数所有缩进层级**：首版只数列 0 的顶层函数，结果 `createDeepSleep`(1435)
//   内部嵌套的 `consolidateTree`(418) / `runDeepSleep`(415) 完全不可见 —— 债务被父函数藏起来了。
//   更糟的是这形成**反向激励**：把所有东西塞进一个大闭包指标反而更好看，一旦提取成模块级函数
//   指标立刻变差 ⇒ 等于**用门禁惩罚正确的重构**。
//
// ⚠ 为什么**必须用 TS 编译器 API 而不是正则**（2026-09-12，两版正则都失败后才改）：
//   ① 靠「下一个缩进 ≤ 自己的定义」定终点 ⇒ `scheduler.ts:llmModels` 真实 19 行被报成
//      **428 行**（之后没有同缩进定义了，终点退化到文件尾），差 22 倍；
//   ② 靠花括号配对定终点 ⇒ 模板串/字符串里的花括号让计数失准，`registerDistill`(1436 行)
//      **整个消失**（假阴性比假阳性危险得多：门禁会少报债务）；
//   ③ 靠 `=>` 认函数 ⇒ `const llm = (ctx as {...}).llm as { f?: () => unknown }` 里的
//      **类型注解 `=>`** 被当成箭头函数，误报 425 行。
//   ⇒ 项目本来就有 typescript 依赖，直接用 `ts.createSourceFile` 遍历 AST 取精确 span。
//     （项目规则 5：不从零造轮子。）
//
// 指标：
//   · span：函数起止行（AST 精确位置，含所有嵌套层级）
//   · 债务：跨度 > SOFT 的函数个数（棘轮基线，见 --gate）
//
// 用法: node scripts/audit-fnspan.mjs [--top N] [--soft 400] [--hard 2000] [--debt N] [--dir 路径] [--gate]
//   退出码：默认 0（报告态）；`--gate` 时破硬顶或债务数超基线 ⇒ exit 1
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] ?? d) : d }
const TOP = Number(argOf('--top', '12'))
const SOFT = Number(argOf('--soft', '400'))
const HARD = Number(argOf('--hard', '2000'))
const AS_GATE = args.includes('--gate')
const dirArg = argOf('--dir', null)
const dir = dirArg ? resolve(dirArg) : join(process.cwd(), 'src')

const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()
const rows = []
let totalLines = 0
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8')
  totalLines += text.split(/\n/).length
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1
  // 名字：具名声明直接用；箭头/函数表达式则回看父节点的变量名或属性名
  const nameOf = (node) => {
    if (node.name && ts.isIdentifier(node.name)) return node.name.text
    const p = node.parent
    if (p) {
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text
      if (ts.isPropertyAssignment(p) && p.name) return String(p.name.getText(sf)).replace(/['"]/g, '')
      if (ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) return p.name?.getText(sf) || '(method)'
    }
    return '(anonymous)'
  }
  const walk = (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
      || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
      const from = lineOf(node.getStart(sf))
      const to = lineOf(node.getEnd())
      const len = to - from + 1
      if (len >= 20) rows.push({ file: f, name: nameOf(node), from, to, len })
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
}
rows.sort((a, b) => b.len - a.len)

// ── 门禁：双层棘轮 ──────────────────────────────────────────────────────────
// ⚠ 为什么不只设一个「阈值」：当前最大函数 1818 行，若阈值取 1818+余量（如 2000），
//   则**今天没有任何东西能触发它** ⇒ 门禁恒绿 = **假绿**：仪表盘看着有覆盖，其实守了个寂寞
//   （与「永久红灯人人无视」同型，只是方向相反）。
//   ⇒ 双层：
//     ① 硬顶 HARD：单个函数行数上限，防「新增怪物」，今天过（取 2000 = 当前最大 + 10%）。
//     ② 债务计数 DEBT_BASE：>SOFT(400) 行的函数**个数**上限，基线取**当前实测值**。
//        新增任何一个 >400 行的函数 ⇒ **立刻红**。
//        拆掉一个 ⇒ 实际 < 基线 ⇒ 输出提示**要求按棘轮收紧基线**（只许收紧不许放松）。
//   两条一起，才既「不制造红灯」又「真能抓住恶化」。
// 基线 **4** = 2026-09-12 17:25 实测（AST 精确口径）：
//   panel:applyPanel 1817 / distill:registerDistill 1435
//   deepsleep:consolidateTree 411 / deepsleep:runDeepSleep 406
// 棘轮轨迹：6（16:50 定基线）→ 5（17:10 scheduler 拆分）→ **4**（17:25 deepsleep 拆分，
//   createDeepSleep 1434 → 239）
const DEBT_BASE = Number(argOf('--debt', '0')) || 4 // 棘轮：允许改小，不允许改大
if (AS_GATE) {
  const hard = rows.filter((r) => r.len > HARD)
  const debt = rows.filter((r) => r.len > SOFT)
  const G = (c, m) => console.log(`  ${c ? '✅' : '❌'} ${m}`)
  console.log(`函数跨度门禁 · ${files.length} 模块 · ${totalLines} 行（AST 精确，含所有嵌套层级）`)
  console.log(`  ① 硬顶：任一函数 ≤ ${HARD} 行`)
  console.log(`  ② 债务：> ${SOFT} 行的函数 ≤ ${DEBT_BASE} 个（棘轮基线）`)
  for (const r of hard) console.log(`     ❌ 硬顶 ${r.file}:${r.from}-${r.to} ${r.name} = ${r.len} 行`)
  const over = debt.length - DEBT_BASE
  G(hard.length === 0, `硬顶：最大 ${rows[0]?.len ?? 0} 行（${rows[0]?.file} ${rows[0]?.name}）`)
  G(over <= 0, `债务：实测 ${debt.length} 个 / 基线 ${DEBT_BASE}${over > 0 ? ` ⇒ 超 ${over} 个` : ''}`)
  if (over > 0) for (const r of debt.slice(0, DEBT_BASE + over)) console.log(`       债务 ${r.file}:${r.name} = ${r.len} 行 (${r.from}-${r.to})`)
  if (over < 0) console.log(`     ⚠ 实测 ${debt.length} < 基线 ${DEBT_BASE} ⇒ 请按棘轮把 DEBT_BASE 收紧到 ${debt.length}`)
  const bad = hard.length || over > 0
  console.log(bad ? '\nFAIL' : '\nPASS')
  process.exit(bad ? 1 : 0)
}

console.log(`函数跨度审计 · ${files.length} 模块 · ${totalLines} 行 · 软阈值 ${SOFT} 行（AST 精确，含所有嵌套层级）`)
console.log('─'.repeat(78))
console.log('文件                函数                            起-止        跨度')
for (const r of rows.slice(0, TOP)) {
  console.log(`${r.file.padEnd(18)} ${r.name.padEnd(28)} ${String(r.from).padStart(4)}-${String(r.to).padEnd(5)} ${String(r.len).padStart(5)}`)
}
const over = rows.filter((r) => r.len > SOFT)
console.log('─'.repeat(78))
console.log(`> ${SOFT} 行的函数: ${over.length}${over.length ? ' → ' + over.map((r) => `${r.file}:${r.name}(${r.len})`).join(', ') : ''}`)
