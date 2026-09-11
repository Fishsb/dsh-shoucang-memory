#!/usr/bin/env node
// check-srcmap.mjs — src↔lib 导出符号漂移机检（审查 G-16 类护栏）
//
// 背景：`check-deploy-sync.mjs` 比对的是**仓内脚本/判据面**与库内同名件，FACES 覆盖
//   `scripts/` 与 `skill/{scripts,engine,docs}/`——**不覆盖 src↔lib**。而 `npm run build:host`
//   （tsc）是唯一把 src 变成运行时产物 lib 的动作，全靠人记得跑。
//   实测事故（G-16）：`commitPrinciples` 加在 src、lib 未重编 ⇒ 断言测的是旧产物，
//   门全绿但修复根本没进运行时。本门把"src 有、lib 无"变成红灯。
//
// 判定口径（**动词精确性**：不照抄日志/注释文案，只看编译产物实际导出了什么）：
//   · 值导出（const/function/class/enum）：src 有 ⇒ lib/<同名>.js 必须有，否则 FAIL。
//   · 类型导出（type/interface）：编译期擦除，lib/*.js 里**本来就没有**；
//     只要求出现在 lib/types/<同名>.d.ts，否则 FAIL。
//   · lib 有、src 无：陈旧产物，判 INFO（不 FAIL）——可能是生成器产物或已删符号的残留。
//
// 用法: node scripts/check-srcmap.mjs [--json] [--root <仓根>]
// 退出码: 0=PASS  1=FAIL（存在 src 有 lib 无）  3=跳过（lib/ 不存在——诚实跳过）
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDefault = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const root = argOf('--root', rootDefault)
const AS_JSON = argv.includes('--json')

const SRC = join(root, 'src')
const LIB = join(root, 'lib')
const DTS = join(LIB, 'types')

if (!existsSync(LIB)) { console.log(`⏭ 跳过：lib/ 不存在（root=${root}）——诚实跳过（exit 3）`); process.exit(3) }
if (!existsSync(SRC)) { console.log(`⏭ 跳过：src/ 不存在（root=${root}）——诚实跳过（exit 3）`); process.exit(3) }

const VAL = /(?:const|let|var|function|function\*|class|enum)/
/** 值导出：`export const X` / `export async function X` / `export declare const X` */
const RE_VAL = new RegExp(`export\\s+(?:declare\\s+)?(?:async\\s+)?${VAL.source}\\s+([A-Za-z_$][\\w$]*)`, 'g')
/** 类型导出：`export type X` / `export interface X` */
const RE_TYPE = /export\s+(?:declare\s+)?(?:type|interface)\s+([A-Za-z_$][\w$]*)/g
/** 具名导出块：`export { A, B as C }`（可跨行；含 `from` 的再导出也算模块导出面） */
const RE_BLOCK = /export\s*\{([^}]*)\}/g
const RE_DEFAULT = /export\s+default\b/
const RE_STAR = /export\s*\*\s*from/

const collect = (txt, re) => {
  const out = new Set()
  for (const m of txt.matchAll(re)) if (m[1]) out.add(m[1])
  return out
}
/** 解析 `export { A, B as C, default as D }` → 取对外名（as 之后） */
const blockNames = (txt) => {
  const out = new Set()
  for (const m of txt.matchAll(RE_BLOCK)) {
    for (const raw of m[1].split(',')) {
      const p = raw.trim().split(/\s+as\s+/)
      const name = (p[1] || p[0] || '').trim()
      if (name && name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name)) out.add(name)
    }
  }
  return out
}

const scanSrc = (p) => {
  const t = readFileSync(p, 'utf8')
  return {
    values: new Set([...collect(t, RE_VAL), ...blockNames(t)]),
    types: collect(t, RE_TYPE),
    hasDefault: RE_DEFAULT.test(t),
    hasStar: RE_STAR.test(t),
  }
}
const scanJs = (p) => {
  const t = readFileSync(p, 'utf8')
  return { values: new Set([...collect(t, RE_VAL), ...blockNames(t)]), hasDefault: RE_DEFAULT.test(t), hasStar: RE_STAR.test(t) }
}
const scanDts = (p) => {
  const t = readFileSync(p, 'utf8')
  return new Set([...collect(t, RE_VAL), ...collect(t, RE_TYPE), ...blockNames(t)])
}

const srcFiles = readdirSync(SRC).filter((f) => f.endsWith('.ts')).sort()
const rows = []
for (const f of srcFiles) {
  const base = f.replace(/\.ts$/, '')
  const jsP = join(LIB, base + '.js')
  const dtsP = join(DTS, base + '.d.ts')
  const s = scanSrc(join(SRC, f))
  const row = { module: base, srcValues: [...s.values].sort(), srcTypes: [...s.types].sort(), hasStar: s.hasStar, missingJs: [], missingDts: [], staleJs: [], notes: [] }
  if (!existsSync(jsP)) { row.notes.push('lib 产物缺失（未构建）'); }
  else {
    const j = scanJs(jsP)
    row.missingJs = [...s.values].filter((n) => !j.values.has(n)).sort()
    row.staleJs = [...j.values].filter((n) => !s.values.has(n)).sort()
    if (s.hasDefault && !j.hasDefault) row.notes.push('default 导出未出现在 lib')
  }
  if (!existsSync(dtsP)) row.notes.push('lib/types/*.d.ts 缺失')
  else {
    const d = scanDts(dtsP)
    row.missingDts = [...s.values, ...s.types].filter((n) => !d.has(n)).sort()
  }
  rows.push(row)
}

const failRows = rows.filter((r) => r.missingJs.length || r.missingDts.length)
const staleRows = rows.filter((r) => r.staleJs.length)
const out = { root, modules: rows.length, failing: failRows.map((r) => r.module), rows }

if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`src↔lib 导出符号漂移（src/*.ts → lib/*.js + lib/types/*.d.ts）：检查 ${rows.length} 个模块`)
  for (const r of rows) {
    const bad = r.missingJs.length || r.missingDts.length
    console.log(`\n  ${bad ? '❌' : '✅'} ${r.module}.ts  值导出 ${r.srcValues.length} · 类型导出 ${r.srcTypes.length}`)
    if (r.missingJs.length) console.log(`     ❌ src 有、lib/*.js 无（**修复未进运行时**）：${r.missingJs.join(', ')}`)
    if (r.missingDts.length) console.log(`     ❌ src 有、lib/types/*.d.ts 无：${r.missingDts.join(', ')}`)
    if (r.staleJs.length) console.log(`     ⚠ lib 有、src 无（陈旧产物，INFO）：${r.staleJs.join(', ')}`)
    for (const n of r.notes) console.log(`     ⚠ ${n}`)
    if (r.hasStar) console.log(`     ⚠ 含 export *（通配再导出，本门不展开解析）`)
  }
  console.log(`\n  汇总：❌ 漂移 ${failRows.length} 个模块 · ⚠ 陈旧产物 ${staleRows.length} 个 · ✅ ${rows.length - failRows.length} 个一致`)
}
if (failRows.length) {
  console.error(`\nFAIL（${failRows.length} 个模块存在 src 有 lib 无 ⇒ 需 npm run build:host 重编；修复只落 src 不重编 = 未部署）`)
  process.exit(1)
}
console.log('\nPASS（src↔lib 导出符号一致）')
