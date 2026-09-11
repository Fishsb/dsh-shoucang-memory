#!/usr/bin/env node
// maturation-scan.mjs — 成熟度扫描器（v2.2 M4 · ADR-130）
//
// 目的：把「跨日再现」从**软判据**变成**显式变量 A**（外部依据：MSR 的 engram maturation——新语义条目初生
//   silent，一周 A≈0.5 才可显式检索；阈下仍可 implicit priming）。
// 算法：对库内每个 notes 小节，统计**出现过的不同日数**（来源：audit/access.log 的 {t,f,s} 命中记录 +
//   activity.jsonl 的命中记录；二者皆按本地日聚合），A = A0 + step·(days−1)，上限 1.0（参数见 criteria.maturation）。
// 落盘：`audit/maturation.jsonl`（每次扫描覆盖写；一行一小节）——**只记不算**（enforce 缺省 false）。
// 用法: node scripts/maturation-scan.mjs [--bank <库根>] [--days 90] [--json]
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const stateRoot = argOf('--state', join(homedir(), '.dsh', 'suite', 'knowledge'))
const windowDays = Number(argOf('--days', '90')) || 90
const AS_JSON = argv.includes('--json')
const OUT_JSON = AS_JSON // `--out` 需与 `--json` 同时给出（机读产物）；不带 --json 时只打印人读摘要

const mat = (() => {
  const cands = [join(repo, 'skill', 'engine', 'criteria.json'), join(repo, 'engine', 'criteria.json'), join(bank, 'engine', 'criteria.json')]
  for (const p of cands) { try { return JSON.parse(readFileSync(p, 'utf8')).maturation } catch { /* next */ } }
  return { A0: 0.3, step: 0.2, gate: 0.5, ledger: 'audit/maturation.jsonl' }
})()

const readJsonl = (p) => {
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
const dayOf = (t) => { try { return new Date(t).toISOString().slice(0, 10) } catch { return '' } }
const since = Date.now() - windowDays * 86400000

// 命中记录：**两个源取"跨日天数"的最大值**
//   ① `access.log`（{t,f,s}）：按本地日聚合成 Set → 天数
//   ② `activity.jsonl`：真实字段是 `{f,s,days30,firstSeen,lastHit}`（**不是** `at/file/section`！
//      实测 F13：扫描器原先找 `r.at||r.lastHitAt||r.t` ⇒ 全 undefined ⇒ **整个信号源被静默丢弃**；
//      且它自带的 `days30` 就是"跨日命中天数"，比我按单时点聚合更准 ⇒ 优先用它）
const daySets = new Map() // key → Set<day>（来自 access.log）
const dayCounts = new Map() // key → number（来自 activity.days30 / 首末跨日）
const keyOf = (file, section) => `${String(file).replace(/^notes\//, 'notes/')} §${String(section).trim()}`
const addLog = (file, section, at) => {
  if (!file || !section || !at) return
  const t = Date.parse(at)
  if (!t || t < since) return
  const k = keyOf(file, section)
  if (!daySets.has(k)) daySets.set(k, new Set())
  daySets.get(k).add(dayOf(at))
}
const bump = (file, section, n) => {
  if (!file || !section || !(n > 0)) return
  const k = keyOf(file, section)
  dayCounts.set(k, Math.max(dayCounts.get(k) || 0, n))
}
for (const r of readJsonl(join(bank, 'audit', 'access.log'))) addLog(r.f, r.s, r.t)
for (const r of readJsonl(join(bank, 'audit', 'activity.jsonl'))) {
  const file = r.f || r.file
  const section = r.s || r.section
  if (typeof r.days30 === 'number' && r.days30 > 0) { bump(file, section, r.days30); continue }
  if (r.firstSeen && r.lastHit) {
    const ds = new Set([dayOf(r.firstSeen), dayOf(r.lastHit)].filter(Boolean))
    bump(file, section, ds.size || 1)
    continue
  }
  const at = r.at || r.lastHitAt || r.t || r.lastHit
  if (Array.isArray(r.sections)) for (const s of r.sections) addLog(r.file || `notes/${r.name || ''}`, typeof s === 'string' ? s : s.section, at)
  else addLog(file, section, at)
}

const A0 = Number(mat.A0 ?? 0.3), step = Number(mat.step ?? 0.2), gate = Number(mat.gate ?? 0.5)
// 合并两源：天数 = max(activity.days30, access.log 的日集合大小)
const allKeys = new Set([...daySets.keys(), ...dayCounts.keys()])
const rows = [...allKeys].map((key) => {
  const [file, section] = key.split(' §')
  const dLog = daySets.get(key)?.size || 0
  const dAct = dayCounts.get(key) || 0
  const d = Math.max(dLog, dAct)
  const A = Math.min(1, A0 + step * Math.max(0, d - 1))
  return { at: new Date().toISOString(), file, section, days: d, daysFrom: dAct >= dLog ? 'activity.days30' : 'access.log', A: Number(A.toFixed(2)), mature: A >= gate }
}).sort((a, b) => b.A - a.A)

const ledger = join(bank, mat.ledger || 'audit/maturation.jsonl')
try { writeFileSync(ledger, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8') } catch { /* 静默 */ }
const mature = rows.filter((r) => r.mature).length
const blockRate = rows.length ? 1 - mature / rows.length : null
// ── **翻转就绪度**（让"何时可翻 enforce"成为机检条件，而非人工判断）──
//   条件① 观测窗口 ≥ gate 所需跨度（否则 A 的分母无效，拦阻率不可信）
//   条件② 拦阻率 ≤ 0.5（否则一翻就冻结升格）
const needDays = 1 + Math.ceil((gate - A0) / step)
const observed = new Set([...[...daySets.values()].flatMap((s) => [...s]), ...readJsonl(join(bank, 'audit', 'access.log')).map((r) => dayOf(r.t)).filter(Boolean)])
const observedDays = observed.size
const windowOk = observedDays >= needDays
const blockOk = blockRate !== null && blockRate <= 0.5
const gateReady = windowOk && blockOk
const readiness = {
  gateReady, observedDays, needDays, blockRate,
  reason: !windowOk ? `观测窗口不足（${observedDays} < ${needDays} 天）⇒ A 分母无效，拦阻率不可作判据`
    : !blockOk ? `拦阻率 ${(blockRate * 100).toFixed(1)}% > 50% ⇒ 翻 enforce 会冻结升格`
      : `观测窗口 ${observedDays} 天 ≥ ${needDays} ∧ 拦阻率 ${(blockRate * 100).toFixed(1)}% ≤ 50% ⇒ **可翻 enforce**`,
}
const out = { window: { days: windowDays, bank, ledger }, params: { A0, step, gate }, sections: rows.length, mature, readiness, rows: rows.slice(0, 20) }
const outFile = argOf('--out', '')
if (OUT_JSON && outFile) { try { mkdirSync(dirname(outFile), { recursive: true }); writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8') } catch { /* */ } }
if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`成熟度扫描（窗口 ${windowDays} 天 · 库=${bank}）`)
  console.log(`  参数: A0=${A0} · step=${step} · gate=${gate} · 台账 ${mat.ledger}`)
  console.log(`  小节 ${rows.length} 个 · 已达 gate(≥${gate}) ${mature} 个 · 拦阻率 ${blockRate === null ? 'n/a' : (blockRate * 100).toFixed(1) + '%'}`)
  console.log(`  翻转就绪度：${gateReady ? '✅ 可翻 enforce' : '⛔ 不可翻'} —— ${readiness.reason}`)
  console.log(`  （信号源：activity.days30 ${dayCounts.size} 个键 · access.log ${daySets.size} 个键；观测窗口 ${observedDays} 天）`)
  for (const r of rows.slice(0, 8)) console.log(`    A=${r.A} · ${r.days} 日 · ${r.file} §${r.section}${r.mature ? ' ✅' : ''}`)
}
