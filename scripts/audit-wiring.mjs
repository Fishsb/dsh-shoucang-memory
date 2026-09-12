#!/usr/bin/env node
// audit-wiring.mjs — 装配层不变量审计（**根治方案的两条硬约束**）
//
// 背景与根因：本项目四个模块都长成 `applyXxx(ctx)` **巨型工厂闭包**（panel 1817 / distill 1435 /
//   deepsleep(原) 1434 / scheduler(原) 430）。把函数提到模块级只是**搬家**，如果依赖靠一个
//   大对象整体传下去，就只是把"隐式闭包"换成了"显式团块"（DsScope 33 字段）——**显式了，没变少**。
//
// 根治的两条不变量：
//   I1 **装配层要薄**：`apply*/register*/create*` 这类装配函数只许做「构造依赖 → 注册 → 返回句柄」，
//      实现必须住在按领域切开的独立模块里。装配函数一旦变大，就说明实现又寄生回入口了。
//   I2 **禁止作用域团块**：传给实现函数的 `XxxScope` 对象字段数必须小。
//      字段一多 ⇒ 说明这个"领域"其实混了多个领域，应当再切，而不是把依赖堆进一个对象。
//
// 两条都是**棘轮**：基线取当前实测值，只许收紧不许放松；新增一个违规立刻红。
//
// 用法: node scripts/audit-wiring.mjs [--gate] [--asm 120] [--scope 12] [--dir 路径]
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d }
const AS_GATE = args.includes('--gate')
const dirArg = opt2('--dir')
function opt2(k, d) { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] ?? d) : d }
const ASM_MAX = opt('--asm', 120)
const SCOPE_MAX = opt('--scope', 12)
const dir = dirArg ? resolve(dirArg) : join(process.cwd(), 'src')

const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()
const asm = []   // I1 违规的装配函数
const scope = [] // I2 违规的作用域对象

for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8')
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const lineOf = (p) => sf.getLineAndCharacterOfPosition(p).line + 1
  const walk = (node) => {
    // I1：模块级（函数声明，或 `const NAME = (…) =>`）且名字是装配语义
    let name = null, n = null, exported = false
    if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.text; n = node
      exported = !!(node.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      name = node.name.text; n = node.initializer
      const vs = node.parent?.parent
      exported = !!(vs && ts.isVariableStatement(vs) && (vs.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
    }
    // ⚠ 必须是**导出的模块入口**才算装配函数：deepsleep.ts 里 `applyPrinciples`(121 行) /
    //   `applyPointerOps` 只是名字撞了 `apply*` 前缀的**实现函数**，不导出的不算（首版误计 6 个 ⇒ 实际 5 个）。
    if (name && exported && /^(apply|register|create)[A-Z]/.test(name)) {
      const from = lineOf(n.getStart(sf)), to = lineOf(n.getEnd()), len = to - from + 1
      if (len >= 20) asm.push({ file: f, name, from, to, len })
    }
    // I2-a：`const X: SomeScope = { … }` 的字面量键数
    if (ts.isVariableDeclaration(node) && node.type && ts.isTypeReferenceNode(node.type)
      && /Scope$/.test(node.type.typeName.getText(sf)) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      scope.push({ file: f, name: node.name.getText(sf), type: node.type.typeName.getText(sf), keys: node.initializer.properties.length })
    }
    // I2-b：**接口声明本身**的字段数（2026-09-12 阶段 A 加严）。
    //   为什么必须加：只认 `*Scope` 名字的话，把团块改叫 `XxxDeps` 就能绕过门禁 ——
    //   「改个名就让门禁变绿」与「永久红灯」同型，都是门禁失效。故按**语义后缀**收口。
    //   ⚠ `Ctx` 后缀暂未纳入：`DeepSleepCtx`（20+ 字段）是阶段 B 的待拆项，
    //      纳入即 I2=2 > 基线 1 ⇒ 只能放基线（=放松棘轮）。阶段 B 拆完再一起收。
    if (ts.isInterfaceDeclaration(node) && /(Scope|Deps)$/.test(node.name.text)) {
      scope.push({ file: f, name: node.name.text, type: node.name.text + '（接口声明）', keys: node.members.length })
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
}
asm.sort((a, b) => b.len - a.len)
scope.sort((a, b) => b.keys - a.keys)

const badAsm = asm.filter((a) => a.len > ASM_MAX)
const badScope = scope.filter((s) => s.keys > SCOPE_MAX)

if (AS_GATE) {
  // ⚠ 默认值必须传**数字**：`opt('--x','0')` 返回字符串 '0'，而 '0' 在 JS 里是 **truthy** ⇒
  //   `'0' || 5` 得到 '0' ⇒ 基线变成 0 ⇒ 今天恒红（首版实测：I1 5/基线 0、I2 1/基线 0 直接 FAIL）。
  //   永久红灯 = 人人学会无视，与假绿同型，必须避免。
  // 棘轮：允许改小，不允许改大。2026-09-12 阶段 A：applyPanel（1817 行）已拆 ⇒ 5 → 4
  const A_BASE = opt('--asmbase', 4)
  const S_BASE = opt('--scopebase', 1) // 棘轮：当前实测 1（DsScope 32 字段）
  const G = (c, m) => console.log(`  ${c ? '✅' : '❌'} ${m}`)
  console.log(`装配层不变量门禁 · ${files.length} 模块`)
  console.log(`  I1 装配函数 ≤ ${ASM_MAX} 行；> ${ASM_MAX} 行的个数 ≤ ${A_BASE}`)
  console.log(`  I2 作用域对象字段 ≤ ${SCOPE_MAX}；> ${SCOPE_MAX} 字段的个数 ≤ ${S_BASE}`)
  for (const a of badAsm) console.log(`     · 装配过厚 ${a.file}:${a.from}-${a.to} ${a.name} = ${a.len} 行`)
  for (const s of badScope) console.log(`     · 作用域团块 ${s.file} ${s.name}: ${s.type} = ${s.keys} 字段`)
  G(badAsm.length <= A_BASE, `I1 实测 ${badAsm.length} / 基线 ${A_BASE}`)
  G(badScope.length <= S_BASE, `I2 实测 ${badScope.length} / 基线 ${S_BASE}`)
  if (badAsm.length < A_BASE) console.log(`     ⚠ I1 实测 ${badAsm.length} < 基线 ${A_BASE} ⇒ 请收紧 --asmbase 到 ${badAsm.length}`)
  if (badScope.length < S_BASE) console.log(`     ⚠ I2 实测 ${badScope.length} < 基线 ${S_BASE} ⇒ 请收紧 --scopebase 到 ${badScope.length}`)
  const bad = badAsm.length > A_BASE || badScope.length > S_BASE
  console.log(bad ? '\nFAIL' : '\nPASS')
  process.exit(bad ? 1 : 0)
}

console.log(`装配层不变量审计 · 阈值 装配 ${ASM_MAX} 行 / 作用域 ${SCOPE_MAX} 字段`)
console.log('── I1 装配函数 ──')
for (const a of asm) console.log(`  ${a.len > ASM_MAX ? '❌' : '✅'} ${String(a.len).padStart(4)} 行  ${a.file.padEnd(18)} ${a.name} (${a.from}-${a.to})`)
console.log('── I2 作用域对象 ──')
for (const s of scope) console.log(`  ${s.keys > SCOPE_MAX ? '❌' : '✅'} ${String(s.keys).padStart(3)} 字段 ${s.file.padEnd(18)} ${s.name}: ${s.type}`)
console.log('─'.repeat(60))
console.log(`违规：装配 ${badAsm.length} 个 / 作用域 ${badScope.length} 个`)
