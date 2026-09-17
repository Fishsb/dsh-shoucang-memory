#!/usr/bin/env node
// activity-calibrate.mjs — **活性/冷热阈值族**校准器（J2 · 2026-09-15 · 报告态，不入 CHECKS）
//
// 为什么需要它（依据 docs/judge-layering-plan-2026-09-15.md §3.2 U2）：
//   `activity.ts` 的 `active/warm/cold` **完全由"距上次命中天数"决定**（阈值 14/44/90），
//   而该族阈值的登记项 `activity.statusDays` 是 **`samples=0`（从未校准）**；
//   更早的一次实测记下 **假冷 26/49**（`skill/scripts/harvest-access.mjs:6`）——
//   但那是 `access-real` 采集**接线之前**的数字，接线后是否仍失真**无人复测**。
//   ⇒ 本器用**原始事件**（`access.log` + `access-real.jsonl`）复算真实命中，
//     与 `activity.jsonl` 的**记录值**对账 —— 这同时是 `activity.ts` 聚合的**第二实现**（互核纪律）。
//
// 产出（供预注册用，**只报告不判决**）：
//   ① 记录错漏：真实事件数 > 记录 hits 的条目数（`harvest` 断链的直接度量）
//   ② **假冷率**：记录 `status=cold`（或 daysSinceHit ≥ coldDays）但原始事件显示 coldDays 内仍有命中的条目
//   ③ 天距分布：真实 daysSinceHit 的 p50/p75/p90/p95 —— **阈值应从分布取，不拍脑袋**
//   ④ hotHits 分布：真实 hits30 的分位 —— 供 `activity.hotHits` 预注册
//
// 用法: node scripts/activity-calibrate.mjs [--bank <记忆库根>] [--json]
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const AS_JSON = argv.includes('--json')
const DAY = 86400e3
const NOW = Date.now()

// 阈值（读注册表，不硬编码 —— "改注册表即生效"）
const reg = JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria.json'), 'utf8'))
const tReg = (id) => (reg.thresholds.entries.find((e) => e.id === id) || {}).value || {}
const act = tReg('activity.statusDays')          // {warm, cold, archive}
const hotHits = Number(tReg('activity.hotHits')) || 5

const jl = (p) => {
  if (!existsSync(p)) return []
  const o = []
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t) continue; try { o.push(JSON.parse(t)) } catch { /* 坏行跳过（报告态，不阻断） */ } }
  return o
}
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1)))); return s[i] }

const activity = jl(join(bank, 'audit', 'activity.jsonl'))
const events = [...jl(join(bank, 'audit', 'access.log')), ...jl(join(bank, 'audit', 'access-real.jsonl'))]

// 原始事件 → key(f|s) → 时间戳集
const byKey = new Map()
for (const e of events) {
  if (!e || !e.t) continue
  const k = `${e.f || '?'}|${e.s || '?'}`
  const t = Date.parse(e.t)
  if (!Number.isFinite(t)) continue
  if (!byKey.has(k)) byKey.set(k, [])
  byKey.get(k).push(t)
}

const rows = []
for (const a of activity) {
  const k = a.key || `${a.f || '?'}|${a.s || '?'}`
  const ts = (byKey.get(k) || []).sort((x, y) => x - y)
  const realHits = ts.length
  const realLast = ts.length ? ts[ts.length - 1] : null
  const realDays = realLast === null ? null : (NOW - realLast) / DAY
  const realHits30 = ts.filter((t) => NOW - t <= 30 * DAY).length
  // 记录的 daysSinceHit
  const recDays = a.lastHit ? (NOW - a.lastHit) / DAY : null
  rows.push({
    key: k, status: a.status || '(none)', recHits: Number(a.hits) || 0, realHits,
    recDays: recDays === null ? null : Math.round(recDays * 10) / 10,
    realDays: realDays === null ? null : Math.round(realDays * 10) / 10,
    realHits30, days30: a.days30 || 0, salience: a.salience || 0,
    missHits: realHits > (Number(a.hits) || 0),
    // 假冷：记录为 cold（或按注册表阈值已过 cold）但真实事件显示 coldDays 内仍有命中
    falseCold: (a.status === 'cold' || (recDays !== null && recDays >= act.cold)) && realDays !== null && realDays < act.cold,
  })
}

const withEvents = rows.filter((r) => r.realHits > 0)
const missRows = rows.filter((r) => r.missHits)
const coldRows = rows.filter((r) => r.status === 'cold' || (r.recDays !== null && r.recDays >= act.cold))
const falseCold = rows.filter((r) => r.falseCold)
const realDayGaps = withEvents.map((r) => r.realDays).filter((x) => x !== null)
const realHits30s = withEvents.map((r) => r.realHits30)

const out = {
  bank, now: new Date(NOW).toISOString(),
  thresholds: { activityStatusDays: act, hotHits },
  counts: { activityRows: rows.length, eventRows: events.length, keysWithEvents: byKey.size, withEvents: withEvents.length },
  miss: { rows: missRows.length, rate: rows.length ? missRows.length / rows.length : null, samples: missRows.slice(0, 5).map((r) => `${r.key} rec=${r.recHits} real=${r.realHits}`) },
  falseCold: { rows: falseCold.length, coldRows: coldRows.length, rate: coldRows.length ? falseCold.length / coldRows.length : null },
  daysGapPercentiles: { p50: pct(realDayGaps, 50), p75: pct(realDayGaps, 75), p90: pct(realDayGaps, 90), p95: pct(realDayGaps, 95), max: realDayGaps.length ? Math.max(...realDayGaps) : null },
  hits30Percentiles: { p50: pct(realHits30s, 50), p75: pct(realHits30s, 75), p90: pct(realHits30s, 90), max: realHits30s.length ? Math.max(...realHits30s) : null },
}

if (AS_JSON) { console.log(JSON.stringify({ ...out, rows }, null, 2)); process.exit(0) }
console.log(`bank = ${bank}`)
console.log(`阈值（读注册表）：statusDays warm=${act.warm} cold=${act.cold} archive=${act.archive} · hotHits=${hotHits}`)
console.log(`样本：activity 条目 ${rows.length} · 原始事件 ${events.length} · 有事件的 key ${byKey.size} · 其中在册 ${withEvents.length}`)
console.log('')
console.log(`① 记录错漏（真实事件数 > 记录 hits）：**${missRows.length}/${rows.length}**${out.miss.rate !== null ? `（${(out.miss.rate * 100).toFixed(1)}%）` : ''}`)
for (const s of out.miss.samples) console.log(`     · ${s}`)
console.log(`② **假冷率**：判 cold 的条目 ${coldRows.length} 条，其中真实 coldDays(${act.cold}) 内仍有命中者 **${falseCold.length}**${out.falseCold.rate !== null ? `（${(out.falseCold.rate * 100).toFixed(1)}%）` : ''}`)
console.log(`     ↳ 历史登记值 = 26/49（harvest 接线前）⇒ 本数字是**接线后的复测**`)
console.log(`③ 真实天距分位（有事件条目）：p50=${out.daysGapPercentiles.p50?.toFixed(1)} p75=${out.daysGapPercentiles.p75?.toFixed(1)} p90=${out.daysGapPercentiles.p90?.toFixed(1)} p95=${out.daysGapPercentiles.p95?.toFixed(1)} max=${out.daysGapPercentiles.max?.toFixed(1)}`)
console.log(`④ 真实 hits30 分位：p50=${out.hits30Percentiles.p50} p75=${out.hits30Percentiles.p75} p90=${out.hits30Percentiles.p90} max=${out.hits30Percentiles.max}`)
console.log('')
console.log('⇒ 预注册用（判据从分布取，不拍脑袋）：')
const p = out.daysGapPercentiles
console.log(`   · warm 阈值候选 = p50 ≈ ${p.p50?.toFixed(1)} 天（"近半条目在此天数内被读过"）`)
console.log(`   · cold 阈值候选 = p75 ≈ ${p.p75?.toFixed(1)} 天；archive 候选 = p90 ≈ ${p.p90?.toFixed(1)} 天`)
console.log(`   · hotHits 候选 = p75 ≈ ${out.hits30Percentiles.p75}（现 ${hotHits}）`)
