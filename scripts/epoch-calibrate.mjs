#!/usr/bin/env node
// epoch-calibrate.mjs — **睡眠纪元家族阈值校准器**（S-P1b′ / S-P1c′ · 报告态，不入 CHECKS）
//
// 依据：docs/sleep-granularity-plan-2026-09-15.md §5 + `criteria.json#thresholds` 两条登记项的 `recheck`：
//   · `trigger.contentMinChars`（内容水位，现 `null`=关闭）
//   · `trigger.materialChunkChars`（材料分片上上限，现 `null`=关闭）
//   两者的复检触发都写着「**纪元累计 ≥10 个** ⇒ 取分位」。本器就是那个"一次命令"。
//
// **数据源（唯一）**：`~/.dsh/suite/knowledge/audit/ledger.jsonl` 中 `type === 'audit.deep-sleep'` 的行 ——
//   深睡主审计，带 `sleepEpoch` / `epochSince` / `at`。
//   ⚠ 口径声明（**不得与新口径混用**）：
//     · 本器算的是**纪元区间长度 = at - epochSince**（喂 `contentMinChars` 的"窗口多久"侧参考）；
//     · 而 `contentMinChars` 要的是**待消化材料量**，其口径是 `deepsleep-core#windowMaterialBytes`
//       （pending/+candidates/ 中 mtime > since 的 .md 字节和）—— **两者不是一回事**。
//       ⇒ 本轮纪元样本不足，材料量本身**无法回溯**（历史审计未记该值）；故本器**只报区间分布 + 样本数**，
//         并**显式打印 `insufficient-data`**，绝不用区间长度冒充材料量（那是口径造假）。
//     · 若需材料量：须先让 `runDeepSleep` 把 `windowMaterialBytes` 写进审计（**属下一轮改动**，见 OPEN-ITEMS）。
//
// 用法: node scripts/epoch-calibrate.mjs [--json] [--min 10]
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const AS_JSON = argv.includes('--json')
const MIN_EPOCHS = Number((argv[argv.indexOf('--min') + 1] || '').trim()) || 10
const H = 3600e3

const reg = JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria.json'), 'utf8'))
const tOf = (id) => reg.thresholds.entries.find((e) => e.id === id) || {}

const ledger = join(homedir(), '.dsh', 'suite', 'knowledge', 'audit', 'ledger.jsonl')
if (!existsSync(ledger)) { console.log('缺台账：' + ledger + '（exit 3）'); process.exit(3) }
const rows = []
for (const l of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
  const t = l.trim(); if (!t) continue
  try { const r = JSON.parse(t); if (r.type === 'audit.deep-sleep') rows.push(r) } catch { /* 坏行跳过（报告态） */ }
}
const withEpoch = rows.filter((r) => r.sleepEpoch)
const spans = withEpoch
  .map((r) => ({ epoch: r.sleepEpoch, at: r.at, since: r.epochSince, hours: (Date.parse(r.at) - Number(r.epochSince)) / H, stop: r.stop, landed: r.landed, materialBytes: typeof r.materialBytes === 'number' ? r.materialBytes : null }))
  .filter((x) => Number.isFinite(x.hours) && x.hours >= 0)
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] }
const hours = spans.map((s) => s.hours)

const out = {
  ledger, totalDeepSleepRows: rows.length, epochs: withEpoch.length, minEpochs: MIN_EPOCHS,
  epochsWithoutId: rows.length - withEpoch.length,
  spanHours: { p50: pct(hours, 50), p75: pct(hours, 75), p90: pct(hours, 90), min: hours.length ? Math.min(...hours) : null, max: hours.length ? Math.max(...hours) : null },
  recent: spans.slice(-5),
  thresholds: { contentMinChars: tOf('trigger.contentMinChars').value ?? null, materialChunkChars: tOf('trigger.materialChunkChars').value ?? null },
  verdict: withEpoch.length >= MIN_EPOCHS ? 'calibratable' : 'insufficient-data',
}
if (AS_JSON) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

console.log('睡眠纪元家族阈值校准（报告态 · 只读）')
console.log(`台账 ${ledger}`)
console.log(`深睡审计行 ${rows.length} · **带 sleepEpoch 的纪元 ${withEpoch.length}** · 无纪元 id（改动前历史）${out.epochsWithoutId}`)
console.log('')
if (spans.length) {
  console.log('纪元分布：')
  for (const s of spans) console.log(`  ${s.epoch}  区间 ${s.hours.toFixed(2)}h  stop=${s.stop}  landed=${s.landed}`)
  console.log(`  区间分位：p50=${out.spanHours.p50?.toFixed(2)}h p75=${out.spanHours.p75?.toFixed(2)}h p90=${out.spanHours.p90?.toFixed(2)}h · min=${out.spanHours.min?.toFixed(2)} max=${out.spanHours.max?.toFixed(2)}`)
} else console.log('（尚无带纪元的深睡行）')
console.log('')
console.log(`阈值现况：contentMinChars=${JSON.stringify(out.thresholds.contentMinChars)}（null=关） · materialChunkChars=${JSON.stringify(out.thresholds.materialChunkChars)}（null=关）`)
console.log('')
if (out.verdict === 'insufficient-data') {
  console.log(`⇒ **insufficient-data**：纪元 ${withEpoch.length} < ${MIN_EPOCHS} ⇒ **维持关闭、不拍脑袋**（与两条登记项的 recheck 一致）。`)
} else {
  console.log(`⇒ **calibratable**：纪元 ${withEpoch.length} ≥ ${MIN_EPOCHS} ⇒ 可按分位预注册取值（**仍不得用区间长度代替材料量**）。`)
}
console.log('⚠ 口径红线：本器只报**区间长度**；材料量口径 = `deepsleep-core#windowMaterialBytes`，')
console.log('   而历史审计**未记该值** ⇒ 要按材料量校准，须先在深睡审计里落 `materialBytes`（下一轮改动）。')
