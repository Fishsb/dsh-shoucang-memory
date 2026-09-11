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

// 命中记录：access.log（{t,f,s}）+ activity.jsonl（{at,file,section,hits?} 形态兼容）
const days = new Map() // `file §section` → Set<day>
const add = (file, section, at) => {
  if (!file || !section || !at) return
  const t = Date.parse(at)
  if (!t || t < since) return
  const key = `${String(file).replace(/^notes\//, 'notes/')} §${String(section).trim()}`
  if (!days.has(key)) days.set(key, new Set())
  days.get(key).add(dayOf(at))
}
for (const r of readJsonl(join(bank, 'audit', 'access.log'))) add(r.f, r.s, r.t)
for (const r of readJsonl(join(bank, 'audit', 'activity.jsonl'))) {
  const at = r.at || r.lastHitAt || r.t
  if (Array.isArray(r.sections)) for (const s of r.sections) add(r.file || `notes/${r.name || ''}`, typeof s === 'string' ? s : s.section, at)
  else add(r.file, r.section || r.s, at)
}

const A0 = Number(mat.A0 ?? 0.3), step = Number(mat.step ?? 0.2), gate = Number(mat.gate ?? 0.5)
const rows = [...days.entries()].map(([key, set]) => {
  const [file, section] = key.split(' §')
  const d = set.size
  const A = Math.min(1, A0 + step * Math.max(0, d - 1))
  return { at: new Date().toISOString(), file, section, days: d, A: Number(A.toFixed(2)), mature: A >= gate }
}).sort((a, b) => b.A - a.A)

const ledger = join(bank, mat.ledger || 'audit/maturation.jsonl')
try { writeFileSync(ledger, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8') } catch { /* 静默 */ }
const mature = rows.filter((r) => r.mature).length
const out = { window: { days: windowDays, bank, ledger }, params: { A0, step, gate }, sections: rows.length, mature, rows: rows.slice(0, 20) }
const outFile = argOf('--out', '')
if (OUT_JSON && outFile) { try { mkdirSync(dirname(outFile), { recursive: true }); writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8') } catch { /* */ } }
if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`成熟度扫描（窗口 ${windowDays} 天 · 库=${bank}）`)
  console.log(`  参数: A0=${A0} · step=${step} · gate=${gate} · 台账 ${mat.ledger}`)
  console.log(`  小节 ${rows.length} 个 · 已达 gate(≥${gate}) ${mature} 个`)
  for (const r of rows.slice(0, 8)) console.log(`    A=${r.A} · ${r.days} 日 · ${r.file} §${r.section}${r.mature ? ' ✅' : ''}`)
}
