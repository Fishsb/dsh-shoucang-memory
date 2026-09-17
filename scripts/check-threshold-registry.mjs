#!/usr/bin/env node
// check-threshold-registry.mjs — **阈值登记制**机检（J1 · 2026-09-15）
//
// 依据：docs/judge-layering-plan-2026-09-15.md §4.2（阈值登记制）+ §3（三个病灶）。
// 断言（四向，各自可红）：
//   ① **完整性**：每条登记项必含 id / value / owner / preregistered / samples / conclusion / recheck / probe。
//   ② **登记即校准**：`preregistered: true` ⇒ `preregisteredCriterion` 非空 **且** `samples > 0`。
//      （防"走过场"：只登记不校准 = 没做）
//   ③ **无矛盾**：`samples > 0` ⇒ `preregered` 必须为 true（有样本却说没预注册 = 自相矛盾）。
//   ④ **漂移**：`probe` 必须仍能命中 —— registryPath 解析值须与 value **深相等**；file+contains 须仍含该字面量。
//      （防"改了代码/注册表却忘改登记"——本仓已有 `check-criteria` 的同类纪律）
//
// 退出码：0=pass · 1=fail（本件无 xfail/skip 分支）
// 用法: node scripts/check-threshold-registry.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reg = JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria.json'), 'utf8'))
const entries = (reg.thresholds && reg.thresholds.entries) || []
const issues = []
const ok = (m) => console.log('✅ ' + m)
const bad = (m) => { issues.push(m); console.log('❌ ' + m) }

const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function resolvePath(obj, path) {
  let cur = obj
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) cur = cur.find((x) => x && x.id === seg)
    else cur = cur[seg]
  }
  return cur
}

// ── ① 完整性 ──
// ⚠ **收窄记录（2026-09-15）**：初版把 `value === null` 也判为"缺字段" ⇒
//   `trigger.contentMinChars`（内容水位**关闭态**，合法值就是 `null`）被**误报**。
//   根因：断言把「**null 值**」与「**字段缺失**」混为一谈。已收窄为：
//   · **存在性**用 `in`（字段在不在）；
//   · **非空**只对**必须非空的字符串字段**要求（id/owner/conclusion/recheck/probe），
//     数值/对象/`null` 一律**合法**（阈值本就允许"关闭态 = null"）。
const REQ_PRESENT = ['id', 'value', 'owner', 'preregistered', 'samples', 'conclusion', 'recheck', 'probe']
const REQ_NONEMPTY = ['id', 'owner', 'conclusion', 'recheck', 'probe']
let c1 = 0
for (const e of entries) {
  const absent = REQ_PRESENT.filter((k) => !(k in e))
  const empty = REQ_NONEMPTY.filter((k) => e[k] === undefined || e[k] === null || e[k] === '')
  if (absent.length || empty.length) {
    bad(`① 登记项 \`${e.id || '(无 id)'}\` ${absent.length ? `缺字段：${absent.join(', ')}` : ''}${absent.length && empty.length ? ' · ' : ''}${empty.length ? `必填为空：${empty.join(', ')}` : ''}`)
  } else c1++
}
if (c1 === entries.length && entries.length) ok(`① 完整性：${entries.length}/${entries.length} 项字段齐备（**值可为 null** —— 阈值允许"关闭态"）`)

// ── ② 登记即校准 ──
let c2 = 0, preN = 0
for (const e of entries) {
  if (!e.preregistered) continue
  preN++
  if (!e.preregisteredCriterion) bad(`② \`${e.id}\` 标了 pregered 却无 preregisteredCriterion（走过场）`)
  else if (!(Number(e.samples) > 0)) bad(`② \`${e.id}\` 标了 pregered 但 samples=${e.samples}（未校准）`)
  else c2++
}
ok(`② 登记即校准：预注册项 ${preN} 个，其中合规 ${c2} 个`)

// ── ③ 无矛盾 ──
let c3 = 0
for (const e of entries) {
  if (Number(e.samples) > 0 && !e.preregistered) bad(`③ \`${e.id}\` samples=${e.samples}>0 却 preregistered=false（自相矛盾）`)
  else c3++
}
if (c3 === entries.length) ok(`③ 无矛盾：${entries.length}/${entries.length}`)

// ── ④ 漂移 ──
let c4 = 0
for (const e of entries) {
  const p = e.probe
  if (!p) { bad(`④ \`${e.id}\` 无 probe`); continue }
  if (Array.isArray(p.registryPath)) {
    const got = resolvePath(reg, p.registryPath)
    if (got === undefined) bad(`④ \`${e.id}\` probe.registryPath 解析失败：${p.registryPath.join('.')}`)
    else if (!deepEq(got, e.value)) bad(`④ \`${e.id}\` 漂移：登记 value=${JSON.stringify(e.value)} 而注册表实际=${JSON.stringify(got)}`)
    else c4++
  } else if (p.file && p.contains) {
    const fp = join(root, p.file)
    if (!existsSync(fp)) bad(`④ \`${e.id}\` probe.file 不存在：${p.file}`)
    else if (!readFileSync(fp, 'utf8').includes(p.contains)) bad(`④ \`${e.id}\` 漂移：${p.file} 已不含 ${JSON.stringify(p.contains)}`)
    else c4++
  } else bad(`④ \`${e.id}\` probe 形态非法（须 registryPath 或 file+contains）`)
}
if (c4 === entries.length && entries.length) ok(`④ 漂移检测：${entries.length}/${entries.length} 探针命中`)

// ── ⑤ 非空 ──
if (!entries.length) bad('⑤ 登记表为空 —— 登记制等于没落地')
else ok(`⑤ 登记表非空：${entries.length} 项（未校准 ${entries.filter((e) => !e.preregistered).length} 项，已登记为欠账）`)

if (issues.length) { console.error(`\nFAIL（${issues.length} 条）—— 阈值登记制机检未过`); process.exit(1) }
console.log('\nPASS（阈值登记制：完整性 / 登记即校准 / 无矛盾 / 漂移 / 非空 全过）')
