#!/usr/bin/env node
// check-memory-write-path.mjs — 记忆脚本旁路调用点机检（N2）
//
// 背景：记忆落盘有两条路径。主路径是 src/distill.ts#memAppend，它跑
//   memoryLibRoot()/scripts/memory-append.mjs 并注入 `MEMORY_ROOT: t.root`。
//   若有人绕过 memAppend 直连 memory-append.mjs（直接 join(...) + runNode(...)），
//   就会丢掉 MEMORY_ROOT 注入 ⇒ 写到错误的记忆库。
//
// ⚠ 命名雷：src/targets.ts 的 `export function gateMemoryAppend` 是**白名单门禁**
//   （校验 target 名字合法性，在 distill.ts 被调），与本件 GATE_FN='memAppend'
//   （进程派生门禁）是两个东西、两个关注点。
//   禁止把本件 GATE_FN 改成 gateMemoryAppend —— 那会让本件永远 PASS 且永远没用。
//
// 本件实际护两样（绕过 memAppend 会同时绕过这两样）：
//   ① `MEMORY_ROOT` 注入 ⇒ 写错记忆库；
//   ② `gateMemoryAppend` 白名单校验 ⇒ 写入未收录的 target。
//
// 语义（AST/符号级，禁止裸文本 grep）：
//   - 枚举 src/*.ts 中**所有**引用 'memory-append.mjs' 的字面量
//   - 按**用法**分类：
//       SPAWN  = 字面量处在某个派生调用（runNode/spawn/execFile/fork/…）的参数链上 ⇒ 真写入口
//       DESC   = 仅出现在 join/对象字段/字符串 ⇒ 描述性引用，无害
//   - 断言：所有 SPAWN 引用必须位于 memAppend 定义体内；DESC 仅打印不判失败
//   - 自证：范围内 0 处引用 ⇒ 按 **FAIL** 处理（多半是扫描范围/路径规范出错，绝不静默通过）
//
// 退出码：0=PASS  1=FAIL  3=无法加载 typescript
// 用法: node scripts/check-memory-write-path.mjs [--root <仓根>] [--ts <typescript.js 绝对路径>] [--json]
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const root = resolve(argOf('--root', join(dirname(fileURLToPath(import.meta.url)), '..')))
const srcDir = join(root, 'src')
const AS_JSON = argv.includes('--json')
const TARGET = 'memory-append.mjs'
const GATE_FN = 'memAppend'
// 派生调用的判定：先看符号全名，再回落到被调表达式尾名
const SPAWN_NAMES = new Set(['runNode', 'runNodeBin', 'spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'fork', 'child_process'])

// ── ⓪ 加载 typescript（检测件可能从仓外启动，故允许显式指定）──────────────
const tsPath = argOf('--ts', null) || ['node_modules/typescript/lib/typescript.js', 'node_modules/typescript/lib/typescript.mjs']
  .map((p) => join(root, p)).find(existsSync)
if (!tsPath || !existsSync(tsPath)) {
  console.error(`FATAL: 无法定位 typescript（root=${root}，可用 --ts 显式指定）`)
  process.exit(3)
}
const ts = (await import(pathToFileURL(resolve(tsPath)).href)).default
if (!ts || typeof ts.createProgram !== 'function') {
  console.error(`FATAL: typescript 加载异常（${tsPath}）`)
  process.exit(3)
}

// ── ① 枚举模块（先打印清单：探针注入到范围外会得到假"0 项"，必须先看见范围）──
const files = []
const walk = (d) => {
  let ns = []
  try { ns = readdirSync(d) } catch { return }
  for (const n of ns) {
    const p = join(d, n)
    let st = null
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walk(p)
    else if (n.endsWith('.ts') && !n.endsWith('.d.ts')) files.push(p)
  }
}
walk(srcDir)

const rel = (p) => p.slice(root.length).replace(/^[/\\]/, '')
console.log(`扫描范围: ${srcDir}`)
console.log(`typescript: ${rel(resolve(tsPath))}`)
console.log(`模块清单（${files.length}）:`)
for (const f of files) console.log(`  · ${rel(f)}`)
if (!files.length) { console.log(`\n⏭ 跳过：范围内无 .ts 模块（exit 3）`); process.exit(3) }

// ── ② 建 program + checker ────────────────────────────────────────────────
const program = ts.createProgram(files, {
  noEmit: true, allowJs: false, skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
})
const checker = program.getTypeChecker()

const ownerNameOfFn = (fn) => {
  if (!fn) return ''
  if (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) return fn.name ? fn.name.getText() : ''
  const p = fn.parent
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text
  return ''
}
const nearestOf = (node, pred) => { let n = node; while (n) { if (pred(n)) return n; n = n.parent } return null }
const nearestFn = (node) => nearestOf(node, (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n))
const isSpawnCall = (call) => {
  const e = call.expression
  const tail = ts.isPropertyAccessExpression(e) ? e.name.text : (ts.isIdentifier(e) ? e.text : '')
  if (SPAWN_NAMES.has(tail)) return true
  let sym = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(e) ? e.name : e)
  if (!sym && ts.isIdentifier(e)) sym = checker.getSymbolAtLocation(e)
  if (!sym) return false
  const fq = checker.getFullyQualifiedName(sym) || ''
  return SPAWN_NAMES.has(fq.split('.').pop() || '')
}

// 路径规范化：readdirSync+join 产出反斜杠，ts 的 sf.fileName 是正斜杠。
// 不做归一化 ⇒ 范围过滤静默排除全部文件 ⇒ **假绿 0 处**（本检测件第一版就栽在这里）。
const norm = (p) => resolve(p).replace(/\\/g, '/').toLowerCase()
const inScope = new Set(files.map(norm))

// 先扫一遍：建立「派生调用的实参符号 → 该调用」索引。
// 必要性：memAppend 的形态是 `const script = join(..., 'memory-append.mjs')` 再
//   `runNode(bin, script, ...)` —— 字面量**不在** runNode 的实参链上，只沿祖先走会漏判成 DESC。
//   故需跟一次一跳数据流（变量 → 该变量被送进哪个调用）。
const spawnByArgSym = new Map()
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue
  if (!inScope.has(norm(sf.fileName))) continue
  const v0 = (node) => {
    if (ts.isCallExpression(node) && isSpawnCall(node)) {
      for (const a of node.arguments) {
        if (ts.isIdentifier(a)) {
          const s = checker.getSymbolAtLocation(a)
          if (s) spawnByArgSym.set(s, node)
        }
      }
    }
    ts.forEachChild(node, v0)
  }
  ts.forEachChild(sf, v0)
}

const hits = []
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue
  if (!inScope.has(norm(sf.fileName))) continue
  const visit = (node) => {
    let txt = null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) txt = node.text
    if (txt === null || !String(txt).includes(TARGET)) { ts.forEachChild(node, visit); return }
    // (i) 字面量直接处在派生调用的实参链上
    let spawn = null
    for (let n = node.parent; n; n = n.parent) {
      if (ts.isCallExpression(n) && isSpawnCall(n)) { spawn = n; break }
    }
    // (ii) 字面量被赋给变量，该变量随后被送进派生调用（memAppend 的实际形态）
    if (!spawn) {
      const vd = nearestOf(node, (n) => ts.isVariableDeclaration(n))
      if (vd && ts.isIdentifier(vd.name)) {
        const s = checker.getSymbolAtLocation(vd.name)
        if (s && spawnByArgSym.has(s)) spawn = spawnByArgSym.get(s)
      }
    }
    const ownerFn = nearestFn(spawn || node)
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    hits.push({
      file: rel(sf.fileName),
      line: line + 1,
      literal: String(txt),
      kind: spawn ? 'SPAWN' : 'DESC',
      spawnCallee: spawn ? spawn.expression.getText(sf) : '(非派生调用)',
      ownerFn: ownerNameOfFn(ownerFn) || '(模块级/匿名)',
      verdict: !spawn ? 'DESC-无害' : (ownerNameOfFn(ownerFn) === GATE_FN ? '门禁内' : '旁路'),
    })
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
}

console.log(`\n引用 ${TARGET} 的字面量：${hits.length} 处`)
for (const h of hits) {
  console.log(`  · ${h.file}:${h.line}  [${h.kind}] spawn=${h.spawnCallee}  owner=${h.ownerFn}  → ${h.verdict === '旁路' ? '❌ 旁路' : '✅ ' + h.verdict}`)
}

const bypass = hits.filter((h) => h.verdict === '旁路')
const out = { root, modules: files.length, total: hits.length, bypass: bypass.length, rows: hits }
if (AS_JSON) console.log(JSON.stringify(out, null, 2))

// 自证：门禁内本应至少 1 处 SPAWN。0 处 ⇒ 扫描范围/路径规范/符号名出问题 ⇒ 按失败处理。
if (!hits.some((h) => h.kind === 'SPAWN')) {
  console.error(`\nFAIL（范围内 0 处 SPAWN 引用 ${TARGET}——门禁 ${GATE_FN} 内本应至少 1 处；` +
    `这几乎必然是扫描范围或路径规范出错，按失败处理而非静默通过）`)
  process.exit(1)
}
if (bypass.length) {
  console.error(`\nFAIL（${bypass.length} 处旁路调用 ${TARGET}——必须经 ${GATE_FN}，否则丢失 MEMORY_ROOT 注入与写入目标白名单校验）`)
  process.exit(1)
}
console.log(`\nPASS（无旁路调用点；SPAWN 引用均在 ${GATE_FN} 门禁内）`)
