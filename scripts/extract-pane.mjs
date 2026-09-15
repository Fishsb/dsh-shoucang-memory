#!/usr/bin/env node
// extract-pane.mjs — 用 **TypeScript AST** 从 `body.js` 抽出顶层符号到 pane 模块（UI1/U2 · 2026-09-15）
//
// **为什么必须用 AST（两次破坏文件的代价换来的结论）**：
//   · **花括号配平**：多符号相邻时**跨块** —— 实测把 `TAG_ORDER`(3 行) 算成 46 行，重复删除致相邻符号被切。
//   · **缩进边界**：函数体内也有缩进 6 的行（`}).catch(` 的闭合、续行）⇒ 同样切错，留下孤立 `}`。
//   ⇒ **只有真解析才能定性边界**。仓内 `audit-fnspan.mjs` 早已用 `ts.createSourceFile` 取精确 span，
//     本件沿用同一依赖（**不从零造轮子** —— 这是 AGENTS 规则 5，也是这两次破坏的根因）。
//
// **安全保证**：
//   ① 每个符号的位置**来自 AST**（`getStart`/`getEnd`），不存在"算错边界"；
//   ② **重叠检测**：任意两个符号的区间不得相交（宁可拒跑，不产出破坏）；
//   ③ **dry-run 缺省**：不加 `--apply` 不写盘；
//   ④ 抽完后**自证**：`node --check` 解析新文件与新 body.js，任一失败即回滚。
//
// 用法: node scripts/extract-pane.mjs <目标模块文件名> <符号1,符号2,…> [--apply]
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BODY = join(root, 'src-client', 'body.js')

/** 取文件里所有**顶层**（`factory` 函数体内第一层）的具名声明：name → {start,end}（0-based 字符偏移） */
export function topLevelDecls(text) {
  const sf = ts.createSourceFile('body.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const out = new Map()
  /** 递归找 `factory: function (require) { … }` 的函数体 */
  let body = null
  const walk = (node) => {
    if (ts.isPropertyAssignment(node) && node.name && node.name.getText(sf) === 'factory') {
      const init = node.initializer
      if (init && ts.isFunctionExpression(init)) body = init.body
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  if (!body) return out
  const record = (name, node) => {
    if (!out.has(name)) out.set(name, { start: node.getStart(sf), end: node.getEnd(), node })
  }
  for (const st of body.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) record(st.name.text, st)
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) record(d.name.text, st) // 整个 statement（含多声明）
      }
    }
  }
  return out
}

if (process.argv[1] && process.argv[1].endsWith('extract-pane.mjs')) {
  const args = process.argv.slice(2).filter((a) => a !== '--apply')
  const [outFile, namesArg] = args
  const APPLY = process.argv.includes('--apply')
  if (!outFile || !namesArg) { console.log('用法: node scripts/extract-pane.mjs <目标模块文件> <符号,符号,…> [--apply]'); process.exit(2) }
  if (!existsSync(BODY)) { console.log('body.js 缺席 ⇒ skip'); process.exit(3) }

  const text = readFileSync(BODY, 'utf8')
  const decls = topLevelDecls(text)
  const names = namesArg.split(',').map((s) => s.trim()).filter(Boolean)
  const picked = []
  for (const n of names) {
    const d = decls.get(n)
    if (!d) { console.log(`  ❌ 未在 \`factory\` 顶层找到「${n}」`); process.exit(1) }
    picked.push({ name: n, start: d.start, end: d.end })
  }
  // ② 重叠检测
  picked.sort((a, b) => a.start - b.start)
  for (let i = 1; i < picked.length; i++) {
    if (picked[i].start < picked[i - 1].end) {
      console.log(`  ❌ 区间重叠（AST 报出，不该发生）：${picked[i - 1].name} 与 ${picked[i].name}`)
      process.exit(1)
    }
  }
  // 行号（供人核对）
  const lineOf = (off) => text.slice(0, off).split('\n').length
  console.log(`  将抽出 ${picked.length} 个符号（**AST 精确区间 + 通过重叠检测**）：`)
  for (const p of picked) console.log(`    ${p.name.padEnd(22)} L${lineOf(p.start)}–L${lineOf(p.end)}（${p.end - p.start} 字符）`)
  if (!APPLY) { console.log('  （dry-run；加 --apply 才写盘）'); process.exit(0) }

  // 抽源码（去掉 factory 内的一层缩进 6 空格）
  // ⚠ **不在段内加 `export`，只在末尾统一具名导出**（2026-09-15 实测教训）：
  //   两者都做 ⇒ esbuild 报 `Multiple exports with the same name`（自证当场拦下）。
  //   且"保留原声明的字面形态 + 末尾 export {}"是本仓既有约定（按 `var X = ` 抽区段的门依赖它）。
  const segs = picked.map((p) => {
    const raw = text.slice(p.start, p.end)
    const code = raw.split('\n').map((l) => l.replace(/^ {6}/, '')).join('\n')
    return { name: p.name, code }
  })
  // 构造新模块
  const mod = [
    '/**',
    ` * ${outFile} — 自 \`body.js\` 抽出的 pane 模块（UI1/U2 · 2026-09-15）`,
    ' *',
    ' * **抽取方式**：`scripts/extract-pane.mjs`，用 **TypeScript AST** 取精确区间',
    ' *   （花括号配平与缩进边界都试过、都会切错 —— 见该脚本头注）。',
    ' *',
    ' * **取依赖**：从 `appState` 取（入口注入），不 import 全局服务模块。',
    ' */',
    "import { UI } from './ui-kit.js'",
    "import { el } from './dom.js'",
    "import { Derive, fmtTime } from './derive.js'",
    "import { appState } from './app-state.js'",
    '',
    ...segs.map((s) => s.code + '\n'),
    `export { ${segs.map((s) => s.name).join(', ')} };`,
    '',
  ].join('\n')

  // ④ 先备份，写盘后自证，失败即回滚
  const bak = BODY + '.extract-bak'
  copyFileSync(BODY, bak)
  const target = join(root, 'src-client', outFile)
  // 从后往前删（字符偏移）
  let next = text
  for (const p of picked.slice().sort((a, b) => b.start - a.start)) next = next.slice(0, p.start) + next.slice(p.end)
  writeFileSync(target, Buffer.from(mod, 'utf8'))
  writeFileSync(BODY, Buffer.from(next, 'utf8'))
  let okAll = true
  for (const f of [target, BODY]) {
    // ⚠ **自证判据（2026-09-15 修）**：`node --check --input-type=module <file>` **非法**
    //   —— 实测报 `ERR_INPUT_TYPE_NOT_ALLOWED`（该旗标只用于 stdin）。
    //   ⇒ `.js` 若含 `import/export` 则**不能用 `node --check` 判**，改用 **esbuild**（本就是本项目构建器）。
    const src = readFileSync(f, 'utf8')
    const isEsm = /^\s*(?:import|export)\s/m.test(src)
    try {
      if (isEsm) {
        const { buildSync } = await import('esbuild')
        buildSync({ entryPoints: [f], bundle: false, write: false, logLevel: 'silent', loader: { '.js': 'js' } })
      } else {
        execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
      }
    } catch (e) {
      okAll = false
      console.log(`  ❌ 自证失败（${isEsm ? 'esbuild' : 'node --check'}）：${f}`)
      console.log('     ' + String((e && (e.message || e.errors?.[0]?.text)) || e).slice(0, 200))
    }
  }
  if (!okAll) {
    copyFileSync(bak, BODY); unlinkSync(bak); unlinkSync(target)
    console.log('  ↩ 已回滚（自证未过，未留下破坏）')
    process.exit(1)
  }
  unlinkSync(bak)
  console.log(`  ✅ 已写 src-client/${outFile}（${mod.split('\n').length} 行）· body.js ${text.split('\n').length} → ${next.split('\n').length} 行`)
  console.log(`  ⚠ body.js 顶层需加：import { ${segs.map((s) => s.name).join(', ')} } from './${outFile}'`)
}
