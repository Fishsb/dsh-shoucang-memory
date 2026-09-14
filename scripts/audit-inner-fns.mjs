#!/usr/bin/env node
// audit-inner-fns.mjs — 闭包内部函数跨度测量（拆分前的**选刀**工具）
//
// 用途：面对 `applyXxx(ctx)` 这类千行工厂闭包，先回答「内部哪些函数最大、边界在哪」，
//   再决定拆成哪几个模块级函数。不设门禁、不做判定，纯测量（报告态）。
//
// 终点判定：一个定义的范围 = 从它开始，到**下一个缩进 ≤ 它的定义**之前。
//   这比"下一个同缩进定义"更准（能正确处理嵌套定义不会截断外层）。
//
// 用法: node scripts/audit-inner-fns.mjs <文件> [--min 25] [--top 8]
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d }
const file = resolve(argv.find((a) => !a.startsWith('--')) || 'src/deepsleep.ts')
const MIN = opt('--min', 25)
const TOP = opt('--top', 8)

const lines = readFileSync(file, 'utf8').split(/\r?\n/)
const re = /^(\s*)(?:const|let|function|async function)\s+([A-Za-z_$][\w$]*)\s*[=(]/
const defs = []
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(re)
  if (m) defs.push({ i, ind: m[1].length, name: m[2] })
}
const out = defs.map((d, k) => {
  let end = lines.length - 1
  for (let j = k + 1; j < defs.length; j++) if (defs[j].ind <= d.ind) { end = defs[j].i - 1; break }
  return { name: d.name, ind: d.ind, from: d.i + 1, to: end + 1, len: end - d.i + 1 }
}).filter((d) => d.len >= MIN)

const byInd = new Map()
for (const d of out) {
  if (!byInd.has(d.ind)) byInd.set(d.ind, [])
  byInd.get(d.ind).push(d)
}
console.log(`闭包内部函数跨度 · ${file.split(/[\\/]/).pop()} · ${lines.length} 行 · 显示 ≥${MIN} 行`)
for (const ind of [...byInd.keys()].sort((a, b) => a - b)) {
  const arr = byInd.get(ind)
  console.log('── 缩进 ' + ind + ' 空格（' + arr.length + ' 个 ≥' + MIN + ' 行）──')
  for (const d of arr.sort((a, b) => b.len - a.len).slice(0, TOP)) {
    console.log('   ' + String(d.len).padStart(4) + ' 行  ' + String(d.from).padStart(4) + '-' + String(d.to).padEnd(5) + ' ' + d.name)
  }
}
