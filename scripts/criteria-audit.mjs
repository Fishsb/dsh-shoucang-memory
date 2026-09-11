#!/usr/bin/env node
// criteria-audit.mjs — 判据对账器（ADR-122 v2 · P3）
//
// 读统一台账 `audit/ledger.jsonl`（v2.1 M2：type=decision.* / write.*；旧 judgement-ledger.jsonl 兼容）
//   + `audit/access-real.jsonl`/`activity.jsonl`，
// 输出四项判据健康指标（**判据本身可被验证**）：
//   ① 判据-结果一致率：判"跨任务/跨项目"的条目，其指针在 N 天内是否被真实读命中（access-real）
//   ② 两域冲突率：同一主题被摄取域判 notes、又被巩固域判 [原则]/[路径] 的占比（口径：主题词交集）
//   ③ 保守度：摄取域 rejected+skipped 占比（越高越保守）
//   ④ 召回-判据相关性：判据 basis 命中数与 24h 内 recall 命中的关系（给出样本量，不下因果结论）
// 用法: node scripts/criteria-audit.mjs [--bank <库根>] [--days 7] [--json]
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const stateRoot = argOf('--state', join(homedir(), '.dsh', 'suite', 'knowledge'))
const days = Number(argOf('--days', '7')) || 7
const AS_JSON = argv.includes('--json')
const since = Date.now() - days * 86400000

const readJsonl = (p) => {
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
// v2.1 M2：统一台账 audit/ledger.jsonl（type=decision.*）优先；旧 judgement-ledger.jsonl 兼容一版
const ledgerPath = [join(stateRoot, 'audit', 'ledger.jsonl'), join(stateRoot, 'audit', 'judgement-ledger.jsonl')].find((p) => existsSync(p)) || join(stateRoot, 'audit', 'ledger.jsonl')
const ledger = readJsonl(ledgerPath).filter((r) => Date.parse(r.at || '') >= since && (!r.type || String(r.type).startsWith('decision')))
const accessReal = readJsonl(join(bank, 'audit', 'access-real.jsonl')).filter((r) => Date.parse(r.t || '') >= since)
const activity = readJsonl(join(bank, 'audit', 'activity.jsonl'))

// ① 判据-结果一致率：ledger 里 reuse=cross-task/cross-project 的条目 → 其 enqueued 主题词是否出现在访问日志
const accessText = accessReal.map((r) => `${r.f || ''} §${r.s || ''}`).join('\n')
const crossRows = ledger.filter((r) => ['cross-task', 'cross-project'].includes(String(r?.l0After?.reuse || '')))
let consistent = 0
for (const r of crossRows) {
  const topics = [].concat(r?.judgement?.topics || [], r?.enqueued ? [] : [])
  const probe = String(r?.judgement?.topic || r?.decision?.route || '')
  if (probe && accessText.includes(probe)) consistent++
}
const consistency = crossRows.length ? consistent / crossRows.length : null

// ② 两域冲突率：同一主题词在摄取域（notes 落点）与巩固域（principle/path）都出现
const ingestTopics = new Set()
for (const r of ledger.filter((x) => x.domain === 'ingest')) {
  const t = String(r?.judgement?.topic || '').trim()
  if (t) ingestTopics.add(t.slice(0, 6))
}
const consTopics = new Set()
for (const r of ledger.filter((x) => x.domain === 'consolidate')) {
  for (const p of (r?.enqueued?.principles ? [String(r?.judgement?.topic || '')] : [])) if (p.trim()) consTopics.add(p.trim().slice(0, 6))
}
const overlap = [...ingestTopics].filter((t) => t && consTopics.has(t))
const conflictRate = (ingestTopics.size && consTopics.size) ? overlap.length / Math.min(ingestTopics.size, consTopics.size) : null

// ③ 保守度：摄取域「跳过 + 拒收」占全部摄取决策比（跳过 = below-min / prescan-no-signal / claim-held / busy-subagent）
const ingestRows = ledger.filter((r) => r.domain === 'ingest')
const rejected = ingestRows.reduce((n, r) => n + Number(r?.result?.rejected || 0), 0)
const added = ingestRows.reduce((n, r) => n + Number(r?.result?.added || 0), 0)
const skippedRows = ingestRows.filter((r) => String(r?.decision?.route || '') === 'skip' || !!r?.decision?.reason)
const conservatism = ingestRows.length ? (skippedRows.length + rejected) / ingestRows.length : null

// ④ 召回-判据相关性（样本量口径：ledger 有 judgement 的行 vs 今日 active 条目）
const withJudgement = ledger.filter((r) => r.judgement && Object.keys(r.judgement).length).length
const activeNow = activity.filter((r) => r.status === 'active').length

const out = {
  window: { days, since: new Date(since).toISOString(), bank, stateRoot },
  samples: { ledgerRows: ledger.length, ingestRows: ingestRows.length, consolidateRows: ledger.filter((r) => r.domain === 'consolidate').length, accessRealRows: accessReal.length, activityRows: activity.length },
  metrics: {
    judgementResultConsistency: consistency,
    domainConflictRate: conflictRate,
    conservatism,
    recallCriteriaCorrelation: { ledgerWithJudgement: withJudgement, activeEntries: activeNow },
  },
  note: '一致率/冲突率需要 judgement.topic 或主题词（模型可选输出）；缺字段时该指标为 null（样本不足，不编造）。',
}
if (AS_JSON) {
  const outFile = argOf('--out', '')
  const body = JSON.stringify(out, null, 2)
  if (outFile) { writeFileSync(outFile, body, 'utf8'); console.log(`已写出 ${outFile}`) } else console.log(body)
} else {
  const pct = (v) => (v === null ? 'n/a（样本不足）' : `${(v * 100).toFixed(1)}%`)
  console.log(`判据对账（窗口 ${days} 天）  库=${bank}`)
  console.log(`  样本: 台账 ${ledger.length} 行（摄取 ${ingestRows.length} / 巩固 ${out.samples.consolidateRows}）· access-real ${accessReal.length} · activity ${activity.length}`)
  console.log(`  ① 判据-结果一致率: ${pct(consistency)}（判"跨任务/跨项目"的条目被真实读命中占比）`)
  console.log(`  ② 两域冲突率: ${pct(conflictRate)}（同主题既进 notes 又升 principle/path）`)
  console.log(`  ③ 保守度: ${pct(conservatism)}（摄取域 拒收/(拒收+入册)）`)
  console.log(`  ④ 召回-判据相关性: 带 judgement 的台账行 ${withJudgement} · 当前 active 条目 ${activeNow}`)
  console.log('  口径: judgement.topic 为模型可选输出；缺字段的指标返回 n/a（不编造）。')
}
