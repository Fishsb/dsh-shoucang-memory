#!/usr/bin/env node
// activation-calib.mjs — 打扰度（路线④）阈值校准器（ACT-024，2026-09-11）
//
// 为什么需要它：影子日志 `activation-shadow.jsonl` 旧口径把**宿主注入块当作真实用户输入**
// （实测 909 样本中 49.3% 是 Current runtime context / Background job|subagent / Agent <uuid> sent a message /
// <system-reminder>），sim 分布因此失真（全样本 p50=0.218，去污染后 p50≈0.045）⇒ 阈值不可校准。
//
// 本器：用**同一结构判别**（`data.source.kind === 'user'`）+ 共用内容噪声闸（`lib/distill.js` 的 isNoiseIntent）
// 从会话转录重取样，复算 sim，给出干净分布的分位与阈值建议（T_on / T_off + 预期触发率）。
// 打分 = **编译产物** `lib/{targets,vec}.js`（与运行时同一份代码，不另立实现）。
//
// 口径固定（可比）：`--n`（最新 N 会话）/ `--since`（绝对日期或 12h/3d/2w）/ `--sids`（会话白名单）；
// 不固定窗口的结论**不可跨次对比**（与 recall-eval 同一纪律）。
//
// 用法: node scripts/activation-calib.mjs [--n 300] [--since 2026-09-01] [--sids a,b]
//        [--bank <记忆库根>] [--sessions <转录根>] [--no-embed] [--topk 3] [--json]
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import * as lib from '../skill/scripts/archive-lib.mjs'
import { isNoiseIntent } from '../lib/distill.js'
import { recallRanked, semanticSim } from '../lib/vec.js'

const argv = process.argv.slice(2)
const argOf = (k, d) => {
  const i = argv.indexOf(k)
  return i > -1 && argv[i + 1] ? argv[i + 1] : d
}
const N = Number(argOf('--n', '300'))
const SIDS = new Set(argOf('--sids', '').split(',').map((s) => s.trim()).filter(Boolean))
const SINCE = argOf('--since', '').trim()
const USE_EMBED = !argv.includes('--no-embed')
const TOPK = Math.min(5, Math.max(1, Number(argOf('--topk', '3')) || 3))
const AS_JSON = argv.includes('--json')
const sessionsRoot = argOf('--sessions', lib.pathConfig().sessionsRoot)
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
if (!existsSync(join(bank, 'MEMORY.md'))) {
  console.error(`未找到记忆库（bank=${bank}）；用 --bank 或设 MEMORY_ROOT。`)
  process.exit(2)
}
const sinceMs = (() => {
  if (!SINCE) return 0
  const rel = /^(\d+)([hdw])$/.exec(SINCE)
  if (rel) {
    const n = Number(rel[1])
    const u = rel[2] === 'h' ? 3600e3 : rel[2] === 'd' ? 86400e3 : 7 * 86400e3
    return Date.now() - n * u
  }
  const t = Date.parse(SINCE)
  return Number.isFinite(t) ? t : 0
})()

const walk = async (dir, acc = []) => {
  let ents = []
  try { ents = await readdir(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, acc)
    else if (e.name.endsWith('.zstd') || e.name.endsWith('.jsonl')) acc.push(p)
  }
  return acc
}

const cfg = {
  enabled: USE_EMBED,
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'bge-m3',
  apiKeyEnv: 'EMBED_API_KEY',
  coldFactor: 0.35,
}

const files = await walk(sessionsRoot)
const withStat = []
for (const p of files) withStat.push({ p, mtime: (await stat(p)).mtimeMs })
withStat.sort((a, b) => b.mtime - a.mtime)

const rows = []
let scanned = 0, users = 0, droppedSrc = 0, droppedNoise = 0, droppedWindow = 0
for (const { p, mtime } of withStat) {
  if (rows.length >= N) break
  if (sinceMs && mtime < sinceMs) continue
  const sid = lib.normalizeSid(p.split(/[\\/]/).filter((x) => x.startsWith('session-')).pop()?.replace(/^session-/, '') || '')
  if (SIDS.size && !SIDS.has(sid) && !SIDS.has(sid.slice(0, 8))) continue
  let txt = ''
  try { txt = await lib.decodeTranscript(p) } catch { continue }
  if (await lib.isSubagentSession(p)) continue // 子代理会话的"user 消息"是宿主生成的子代理提示词，非用户输入
  scanned++
  for (const line of txt.split('\n')) {
    if (!line.includes('"')) continue
    let o
    try { o = JSON.parse(line) } catch { continue }
    if (o.type !== 'user/message') continue
    const d = o.data || {}
    const c = Array.isArray(d.content) ? d.content : []
    const text = c.filter((x) => x && x.type === 'text').map((x) => x.text || '').join('').trim()
    if (!text) continue
    users++
    const kind = String((d.source && d.source.kind) || '')
    if (kind && kind !== 'user') { droppedSrc++; continue }           // 结构判别（首选）
    if (!kind && isNoiseIntent(text)) { droppedNoise++; continue }     // 旧格式/夹具：内容闸兜底
    if (!text.length) { droppedWindow++; continue }
    const r = await recallRanked(bank, text, TOPK, 'all', cfg)
    // ① 现行口径：融合召回**池内 min-max 归一化**后的分数（相对分，跨查询不可比）
    const sim = !r.rows.length ? 0 : r.mode === 'fusion' ? Math.min(1, (r.rows[0].score || 0) / 100) : Math.min(1, r.rows[0].score / (r.tokens.length || 1))
    // ② 绝对口径：用户文本 ↔ 命中索引行的**原始余弦**（ACT-024 建议改用的阈值量）
    let simAbs = 0
    if (USE_EMBED && r.rows.length) {
      try { simAbs = Number((await semanticSim(text, r.rows[0].line, cfg)) ?? 0) } catch { simAbs = 0 }
    }
    rows.push({ sid: sid.slice(0, 8), at: new Date(mtime).toISOString().slice(0, 16), mode: r.mode, sim: Number(sim.toFixed(4)), simAbs: Number(simAbs.toFixed(4)), hit: r.rows.length ? r.rows[0].line.slice(0, 100) : '', text: text.slice(0, 50) })
  }
}

const sims = rows.map((r) => r.sim).sort((a, b) => a - b)
const abss = rows.map((r) => r.simAbs).sort((a, b) => a - b)
const q = (p) => (sims.length ? sims[Math.min(sims.length - 1, Math.floor(p * (sims.length - 1)))] : NaN)
const qa = (p) => (abss.length ? abss[Math.min(abss.length - 1, Math.floor(p * (abss.length - 1)))] : NaN)
const rate = (t) => (sims.length ? sims.filter((x) => x >= t).length / sims.length : 0)
const rateA = (t) => (abss.length ? abss.filter((x) => x >= t).length / abss.length : 0)
const summary = {
  window: { n: N, since: SINCE || null, sids: [...SIDS], topk: TOPK, embed: USE_EMBED, bank },
  counts: { sessions: scanned, userMessages: users, dropped: { nonUserSource: droppedSrc, noiseByText: droppedNoise, empty: droppedWindow }, samples: sims.length },
  relScore: { note: '现行 sim＝池内 min-max 归一化融合分（相对分）', p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), p99: q(0.99) },
  absCosine: { note: '绝对口径＝用户文本↔命中行原始余弦', p50: qa(0.5), p75: qa(0.75), p90: qa(0.9), p95: qa(0.95), p99: qa(0.99), max: qa(1) },
  suggestions: {
    '现状 0.62（相对分）': { metric: 'rel', tOn: 0.62, triggerRate: rate(0.62) },
    '绝对分 p90/p75': { metric: 'abs', tOff: qa(0.75), tOn: qa(0.9), triggerRate: rateA(qa(0.9)) },
    '绝对分 p95/p90': { metric: 'abs', tOff: qa(0.9), tOn: qa(0.95), triggerRate: rateA(qa(0.95)) },
  },
}
if (AS_JSON) {
  const out = argOf('--out', '')
  const body = JSON.stringify({ ...summary, rows }, null, 2)
  if (out) { const { writeFileSync } = await import('node:fs'); writeFileSync(out, body, 'utf8'); console.log(`已写出 ${out}（${rows.length} 行样本）`) } else console.log(body)
} else {
  console.log(`记忆库: ${bank}\n转录根: ${sessionsRoot}\n窗口: 最新 ${N} 会话${SINCE ? ` · since=${SINCE}` : ''}${SIDS.size ? ` · sids=${[...SIDS].join(',')}` : ''} · topK=${TOPK} · embed=${USE_EMBED ? 'on(bge-m3)' : 'off(词法)'}`)
  console.log(`会话 ${scanned} · user/message ${users} · 丢弃(源非user) ${droppedSrc} · 丢弃(内容闸) ${droppedNoise} ⇒ **干净样本 ${sims.length}**`)
  console.log(`① 现行相对分（池内归一化，跨查询不可比）: p50=${q(0.5).toFixed(3)} p75=${q(0.75).toFixed(3)} p90=${q(0.9).toFixed(3)} p99=${q(0.99).toFixed(3)}`)
  console.log(`② 绝对余弦（建议用作阈值量）: p50=${qa(0.5).toFixed(3)} p75=${qa(0.75).toFixed(3)} p90=${qa(0.9).toFixed(3)} p95=${qa(0.95).toFixed(3)} p99=${qa(0.99).toFixed(3)} max=${qa(1).toFixed(3)}`)
  for (const [k, v] of Object.entries(summary.suggestions)) console.log(`  ${k}: T_off=${Number(v.tOff ?? v.tOn).toFixed(3)} T_on=${Number(v.tOn).toFixed(3)} → 触发率 ${(v.triggerRate * 100).toFixed(2)}%`)
  console.log('\n口径: 只采 `data.source.kind === "user"` 的真实用户输入（结构判别），旧格式事件再用 lib/distill.js#isNoiseIntent 内容闸兜底；')
  console.log('      打分走 lib/vec.js#recallRanked（与运行时同一实现）——结论只在固定窗口内可比。')
}
