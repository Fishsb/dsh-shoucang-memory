#!/usr/bin/env node
// audit-architecture.mjs — 源码架构审计（依赖方向 / 循环依赖 / 接口宽度 / 扇入扇出 / 可变全局）
//
// 与既有件的分工（**不要重复造轮子**）：
//   · test-layering.mjs 测的是「记忆成熟度分层」，与代码架构无关；
//   · check-srcmap.mjs 查 src↔lib 的**导出符号漂移**，查的是构建产物一致性，不是依赖方向；
//   · 本件是唯一做**模块依赖图结构分析**的工具：环、分层深度、扇入扇出、接口宽度、可变全局。
//
// 判据来源：稳定依赖原则（SDP，依赖应指向更稳定的方向）+ 稳定抽象原则（SAP）。
//   本件只报**客观可测的结构事实**，不下"好坏"的价值判断——阈值在 --gate 下才生效，且阈值可调。
//
// 用法: node scripts/audit-architecture.mjs [--json] [--gate] [--dir <相对仓根目录，默认 src>]
//   --gate 退出码：0 = 未超阈值；1 = 超阈值（CI 用）。默认（无 --gate）= 报告态，恒 exit 0。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')
const AS_GATE = process.argv.includes('--gate')
const dirArg = process.argv.indexOf('--dir')
const REL = dirArg >= 0 ? process.argv[dirArg + 1] : 'src'
// 支持绝对 --dir：反向证伪时对 tmp 里的**变异副本**跑，避免把 src 临时改成缺陷态（本仓已栽过）。
const DIR = /^[A-Za-z]:[\\/]|^[\\/]/.test(REL) ? REL : join(root, REL)

function listFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listFiles(p))
    else if (['.ts', '.mjs', '.js'].includes(extname(e.name)) && !e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

const files = listFiles(DIR)
const mods = new Map() // name -> { file, src, lines, bytes }

// ⚠ 解析前**必须先剥注释**（本仓第三次踩到「注释被正则护栏当成代码」：
//   check-ui-contract 递归防护、AST 闸骨架化都栽过）。
//   实测误报：deepsleep.ts 的头注释里写了「不要 import './distill.js'」，
//   未剥注释时这句**注释**被当成真 import ⇒ 凭空报出 distill↔deepsleep 循环依赖。
//   只剥「行首注释」与块注释，用等长空格替换以保留偏移；**不动**行内的 `//`（避免误伤 URL、正则字面量）。
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/[^\n]*/gm, (m) => m.replace(/[^\n]/g, ' '))

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const name = f.slice(DIR.length + 1).replace(/\.(ts|mjs|js)$/, '').replace(/\\/g, '/')
  mods.set(name, { file: f, src, code: stripComments(src), lines: src.split('\n').length, bytes: Buffer.byteLength(src) })
}

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null
  const base = from.slice(0, from.lastIndexOf('/') + 1) + spec
  const seg = []
  for (const part of base.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') seg.pop()
    else seg.push(part)
  }
  return seg.join('/')
}

const edges = [] // { from, to, kind }  kind: value | type | dynamic

for (const [name, m] of mods) {
  const re = /import\s+(type\s+)?(?:[\s\S]*?\sfrom\s+)?['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g
  let mt
  while ((mt = re.exec(m.code))) {
    const spec = mt[2] || mt[3]
    if (!spec) continue
    const to = resolveImport(name, spec.replace(/\.(ts|mjs|js)$/, ''))
    if (!to || !mods.has(to) || to === name) continue
    const isDyn = !!mt[3]
    const isType = !!mt[1] || /\bimport\s+type\b/.test(mt[0])
    edges.push({ from: name, to, kind: isDyn ? 'dynamic' : (isType ? 'type' : 'value') })
  }
}

// ── 环检测（简单环DFS；区分「静态环」与「含动态边的环」）──
const adj = new Map([...mods.keys()].map(k => [k, []]))
for (const e of edges) adj.get(e.from).push(e)

function findCycles(edgeKinds) {
  const cycles = []
  const seen = new Set()
  const stack = []
  const onStack = new Set()
  const dfs = (n) => {
    stack.push(n); onStack.add(n)
    for (const e of adj.get(n)) {
      if (!edgeKinds.includes(e.kind)) continue
      if (onStack.has(e.to)) {
        const idx = stack.indexOf(e.to)
        const cyc = stack.slice(idx)
        const key = [...cyc].sort().join('>')
        if (!seen.has(key)) { seen.add(key); cycles.push(cyc.concat(e.to)) }
      } else if (!seen.has(n + '>' + e.to)) dfs(e.to)
    }
    stack.pop(); onStack.delete(n)
  }
  for (const k of mods.keys()) dfs(k)
  return cycles
}

const staticCycles = findCycles(['value', 'type'])
const allCycles = findCycles(['value', 'type', 'dynamic'])
const dynOnlyCycles = allCycles.filter(c => !staticCycles.some(s => s.join('>') === c.join('>')))

// ── 拓扑分层（只看 value+type 静态边）──
const indeg = new Map([...mods.keys()].map(k => [k, 0]))
for (const e of edges) if (e.kind !== 'dynamic') indeg.set(e.to, indeg.get(e.to) + 1)
const level = new Map()
const q = [...mods.keys()].filter(k => indeg.get(k) === 0)
for (const k of q) level.set(k, 0)
const order = []
while (q.length) {
  const n = q.shift(); order.push(n)
  for (const e of adj.get(n)) {
    if (e.kind === 'dynamic') continue
    level.set(e.to, Math.max(level.get(e.to) ?? 0, (level.get(n) ?? 0) + 1))
    indeg.set(e.to, indeg.get(e.to) - 1)
    if (indeg.get(e.to) === 0) q.push(e.to)
  }
}
const topoOk = order.length === mods.size

// ── 扇入扇出 / 接口宽度 / 可变全局 ──
const fanIn = new Map(), fanOut = new Map()
for (const k of mods.keys()) { fanIn.set(k, 0); fanOut.set(k, 0) }
for (const e of edges) {
  if (e.kind === 'type') continue // type-only 不产生运行时耦合，扇入扇出按值边计
  fanOut.set(e.from, fanOut.get(e.from) + 1)
  fanIn.set(e.to, fanIn.get(e.to) + 1)
}

const exportsOf = (m) => {
  const src = m.code
  const names = new Set()
  const re = /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gm
  let mt; while ((mt = re.exec(src))) names.add(mt[1])
  const reBrace = /^export\s*\{([^}]*)\}/gm
  while ((mt = reBrace.exec(src))) for (const p of mt[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n) }
  if (/^export\s+default\b/m.test(src)) names.add('default')
  return [...names]
}

// 「转发」= re-export（`export * from` / `export { A, B } from`）。
// 为什么要单独计：2026-09-12 深睡判据层迁出后，distill.ts 用 `export * from './deepsleep-core.js'`
//   保持 API 兼容 —— 它自身只剩 8 个导出，却对外**转发**了 24 个。只数自身导出会让「接口宽度」
//   这个指标失真（看起来从 30 降到 8，实际对外面还是 32）。
//   ⇒ 转发也是对外承诺，必须计入，且应逐步消除（每消一个转发，就是少一个跨模块的隐式耦合）。
const reexportOf = (m, name) => {
  let n = 0
  const reStar = /^export\s+\*\s*from\s*['"](\.[^'"]+)['"]/gm
  let mt
  while ((mt = reStar.exec(m.code))) {
    const to = resolveImport(name, mt[1].replace(/\.(ts|mjs|js)$/, ''))
    const t = mods.get(to)
    n += t ? exportsOf(t).length : 0
  }
  const reBrace = /^export\s*\{([^}]*)\}\s*from/gm
  while ((mt = reBrace.exec(m.code))) n += mt[1].split(',').filter((x) => x.trim()).length
  return n
}

const mutableOf = (m) => {
  const out = []
  const re = /^(?:export\s+)?let\s+([A-Za-z0-9_$]+)/gm
  let mt; while ((mt = re.exec(m.code))) out.push({ name: mt[1], kind: 'let' })
  const re2 = /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*new\s+(Map|Set)\s*\(/gm
  while ((mt = re2.exec(m.code))) out.push({ name: mt[1], kind: mt[2] })
  return out
}

// 拓扑层级是「入度=0 者为 0」，即 index 在最上层；**倒过来**显示才符合直觉：L0 = 最底层（无人依赖的叶）。
const rawMax = topoOk ? Math.max(0, ...level.values()) : -1

const rows = [...mods.entries()].map(([name, m]) => ({
  name, lines: m.lines, bytes: m.bytes,
  level: topoOk ? rawMax - (level.get(name) ?? 0) : null,
  fanIn: fanIn.get(name), fanOut: fanOut.get(name),
  exports: exportsOf(m).length,
  reexports: reexportOf(m, name),
  mutable: mutableOf(m).length,
})).sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || b.lines - a.lines)

const totalLines = rows.reduce((s, r) => s + r.lines, 0)
const maxLevel = rawMax

// ── 阈值（--gate 用）──  ⚠ 棘轮（ratchet）：**只许收紧，不许放松**
// 取值依据=当前实测值 + 少量余量，目的不是「评判好坏」而是**锁住现状防恶化**：
// 今天 distill 3512 行 / targets 33 导出 / 最高扇入 6 / 零环 / 深度 7，全部在阈值内 ⇒ 不制造永久红灯。
// 永久红灯的代价所有人都懂：人人学会无视它，等于把假绿换成假红（本仓 G-22 的教训）。
// 想真正变好 ⇒ 重构后**下调**阈值；想放宽 ⇒ 必须显式说明为什么，且要能指出对应重构计划。
// 棘轮回退记录（只进不退）：3600 →（P1 一期：distill 3512→3149）→ 3200
//                          →（P1 二期：distill 3149→1750，深睡主体迁为 deepsleep.ts 1519）→ 2000
const T = { lines: 2000, exports: 35, reexports: 30, fanIn: 8, cycles: 0, depth: 10 }
const breaches = []
for (const r of rows) {
  if (r.lines > T.lines) breaches.push(`${r.name} 行数 ${r.lines} > ${T.lines}`)
  if (r.exports > T.exports) breaches.push(`${r.name} 导出 ${r.exports} 个 > ${T.exports}`)
  if (r.reexports > T.reexports) breaches.push(`${r.name} 转发 ${r.reexports} 个 > ${T.reexports}（过渡 re-export 应逐步消除）`)
  // ⚠ 扇入门禁**不适用**于 fan-out=0 的纯事实源（criteria.generated / targets 一类）：
  //   SDP 说的正是「依赖要指向稳定件」，扇出 0 = 谁也改不动它 = 最稳定 ⇒ 被很多模块依赖是**设计意图**，
  //   不是耦合风险。真正的风险是**高层模块**（扇出 > 0 且自己会变）被过多模块直接依赖。
  //   （2026-09-12 阶段 B 实测：深睡拆成 6 个领域模块后 criteria.generated 扇入 8→9 触发本条，
  //    而它恰恰是全仓唯一的 L0 稳定件 —— 这是门禁的**假阳**，按 SDP 收窄口径而不是放阈值。）
  if (r.fanOut > 0 && r.fanIn > T.fanIn) breaches.push(`${r.name} 扇入 ${r.fanIn} > ${T.fanIn}（被太多模块直接依赖）`)
}
if (staticCycles.length) breaches.push(`静态循环依赖 ${staticCycles.length} 处: ` + staticCycles.map(c => c.join('→')).join(' | '))
if (dynOnlyCycles.length) breaches.push(`动态边隐藏环 ${dynOnlyCycles.length} 处（编译期不可见）: ` + dynOnlyCycles.map(c => c.join('→')).join(' | '))
if (topoOk && maxLevel > T.depth) breaches.push(`分层深度 ${maxLevel + 1} > ${T.depth}`)

const report = {
  dir: REL, files: mods.size, totalLines,
  topoOk, depth: topoOk ? maxLevel + 1 : null,
  staticCycles, dynOnlyCycles,
  rows, thresholds: T, breaches,
}

if (AS_JSON) { console.log(JSON.stringify(report, null, 2)) }
else {
  console.log(`架构审计 · ${REL}/ · ${mods.size} 模块 · ${totalLines} 行 · 分层深度 ${topoOk ? maxLevel + 1 : 'N/A(有环)'}`)
  console.log('─'.repeat(78))
  console.log('层级  模块                              行数   扇入 扇出  导出  转发  可变全局')
  for (const r of rows) {
    const lv = topoOk ? `L${r.level}` : ' ??'
    console.log(`${lv.padEnd(5)} ${r.name.padEnd(32)} ${String(r.lines).padStart(6)} ${String(r.fanIn).padStart(5)} ${String(r.fanOut).padStart(4)} ${String(r.exports).padStart(5)} ${String(r.reexports).padStart(5)} ${String(r.mutable).padStart(7)}`)
  }
  console.log('─'.repeat(78))
  console.log(`静态循环依赖: ${staticCycles.length}` + (staticCycles.length ? ' :: ' + staticCycles.map(c => c.join('→')).join(' | ') : ''))
  console.log(`动态边隐藏环: ${dynOnlyCycles.length}` + (dynOnlyCycles.length ? ' :: ' + dynOnlyCycles.map(c => c.join('→')).join(' | ') : ''))
  console.log(`扇入最高: ${rows.slice().sort((a, b) => b.fanIn - a.fanIn).slice(0, 3).map(r => `${r.name}(${r.fanIn})`).join(', ')}`)
  console.log(`规模最大: ${rows.slice().sort((a, b) => b.lines - a.lines).slice(0, 3).map(r => `${r.name}(${r.lines})`).join(', ')}`)
  if (AS_GATE) {
    if (breaches.length) { console.log(`\n❌ 超阈值 ${breaches.length} 项：`); for (const b of breaches) console.log('   · ' + b) }
    else console.log('\n✅ 全部在阈值内')
  } else if (breaches.length) {
    console.log(`\n⚠ gate 模式下会报 ${breaches.length} 项：`); for (const b of breaches) console.log('   · ' + b)
  }
}

if (AS_GATE) process.exit(breaches.length ? 1 : 0)
process.exit(0)
