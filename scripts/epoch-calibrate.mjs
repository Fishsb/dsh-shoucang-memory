#!/usr/bin/env node
// epoch-calibrate.mjs — **睡眠纪元家族阈值校准器**（S-P1b′ / S-P1c′ · 报告态，不入 CHECKS）
//
// 依据：docs/sleep-granularity-plan-2026-09-15.md §5 + `criteria.json#thresholds` 两条登记项的 `recheck`：
//   · `trigger.contentMinChars`（内容水位，现 `null`=关闭）
//   · `trigger.materialChunkChars`（材料分片上上限，现 `null`=关闭）
//   两者的复检触发都写着「**纪元累计 ≥10 个** ⇒ 取分位」。本器就是那个"一次命令"。
//
// ⚠ **G13「轮转失明」第 4 处漏网（2026-09-20 实测）**：本器原**只读主档** `ledger.jsonl`，
//   而深睡行**全在旧卷** `ledger.jsonl.1`（实测：主档 `kind=deep-sleep` **0** 行 / 旧卷 **49** 行）
//   ⇒ 本器一直报「深睡审计行 **0** · 纪元 **0** ⇒ insufficient-data」，**而真值足够**（49 行 / 38 纪元）。
//   同因先例已修三处（`pointer-deficits` / `deepsleep-run` / `check-claim-alignment`，均走
//   `ledger-compact#readLedgerVolumes`）——**本处是漏网的第 4 处**。
//   ⇒ 修法：**复用同一实现** `lib/ledger-compact.js#readLedgerVolumes`（不再自写单档读法）。
//   ⚠ 教训归属：这属「**已知缺陷类型在消费点未被穷举**」——修了 3 处消费点，**没有一道门问"还有谁在读单档"**。
//
// **数据源（唯一）**：台账**全部档位**（`.3 → .2 → .1 → 主档`）中 `kind === 'deep-sleep'` 的行 ——
//   深睡主审计，带 `sleepEpoch` / `epochSince` / `at` / `materialChars` / `materialBytes`。
//   ⚠ 判别字段口径：运行侧 `infra.audit()` 写的是 **`kind`**（`type` 由信封按 `audit.<kind>` 派生，
//     故 `kind='deep-sleep'` 与 `type='audit.deep-sleep'` 是同一行的两面）。本器**按 `kind` 判**，
//     并对 `type` 兜底 —— 两种写法都认，避免"换了判别字段就漏读"（本仓已登记的同族坑）。
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
/** **跨档读**（G13 第 4 处漏网修复）：复用运行侧同一实现，不自写单档读法。 */
const { readLedgerVolumes } = await import(new URL('../lib/ledger-compact.js', import.meta.url).href)
const rows = []
let linesRead = 0
for (const l of readLedgerVolumes(ledger)) {
  linesRead++
  try {
    const r = JSON.parse(l)
    // 判别字段两种写法都认（运行侧写 kind，信封派生 type）——防"换判别字段即漏读"
    if (r.kind === 'deep-sleep' || r.type === 'audit.deep-sleep') rows.push(r)
  } catch { /* 坏行跳过（报告态；失败行数由 check-observability --parsability 兜） */ }
}
// 去重：同一行可能因轮转边界重复（key = sleepEpoch + at + chunk）
const seen = new Set()
const uniq = []
for (const r of rows) {
  const k = `${r.sleepEpoch || ''}|${r.at || ''}|${r.chunk ?? ''}`
  if (seen.has(k)) continue
  seen.add(k)
  uniq.push(r)
}
const dupDropped = rows.length - uniq.length
const withEpoch = uniq.filter((r) => r.sleepEpoch)
const spans = withEpoch
  .map((r) => ({ epoch: r.sleepEpoch, at: r.at, since: r.epochSince, hours: (Date.parse(r.at) - Number(r.epochSince)) / H, stop: r.stop, landed: r.landed, materialBytes: typeof r.materialBytes === 'number' ? r.materialBytes : null, materialChars: typeof r.materialChars === 'number' ? r.materialChars : null,
    /* **2026-09-20 round 9（S-P1b″ 定案）新增第三口径：窗口内痕迹文件数** ——
     *   它才是「该不该睡」的**同源量**（前两个各有硬反证：`materialBytes` 与真实材料**非同源**，
     *   实测 0 vs 46692；`materialChars` 有**地板效应**，min 已达中位 43%，量的是装配固定开销）。
     *   ⚠ **本字段只对"修复后"的纪元存在**（旧行没有 `traceFiles`）⇒ 必须**显式区分样本量与缺省**，
     *     不得把 `null` 当 0 混入分布（那是"输入量不清晰"的老毛病）。 */
    traceFiles: typeof r.traceFiles === 'number' ? r.traceFiles : null }))
  .filter((x) => Number.isFinite(x.hours) && x.hours >= 0)
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] }
const hours = spans.map((s) => s.hours)
/** **第三口径（S-P1b″ 定案）**：窗口内痕迹文件数 —— 只统计**真的带该字段**的纪元，且**显式报样本量**。 */
const tf = spans.map((s) => s.traceFiles).filter((x) => typeof x === 'number')
/** 只需**主档+旧卷**即可覆盖的判据（G13）：任一档有行而主档无行 ⇒ 正是"轮转失明"的形态 */
const epochsDistinct = new Set(withEpoch.map((r) => r.sleepEpoch)).size

const out = {
  ledger, totalDeepSleepRows: uniq.length, linesRead, dedupDropped: dupDropped, epochs: withEpoch.length, epochsDistinct, minEpochs: MIN_EPOCHS,
  epochsWithoutId: uniq.length - withEpoch.length,
  spanHours: { p50: pct(hours, 50), p75: pct(hours, 75), p90: pct(hours, 90), min: hours.length ? Math.min(...hours) : null, max: hours.length ? Math.max(...hours) : null },
  /* S-P1b″ 定案（2026-09-20 round 9）：**正确轴的分位** —— 痕迹文件数。
   *   ⚠ `n` 与 `missing` 一并报出：缺字段的纪元是**修复前**的（该字段本轮才加），
   *     不能当 0，也不能静静并进分布（否则又犯"输入量不可见"）。 */
  traceFiles: { n: tf.length, missing: spans.length - tf.length, p25: pct(tf, 25), p50: pct(tf, 50), p75: pct(tf, 75), p90: pct(tf, 90), min: tf.length ? Math.min(...tf) : null, max: tf.length ? Math.max(...tf) : null },
  recent: spans.slice(-5),
  thresholds: { contentMinChars: tOf('trigger.contentMinChars').value ?? null, materialChunkChars: tOf('trigger.materialChunkChars').value ?? null },
  verdict: epochsDistinct >= MIN_EPOCHS ? 'calibratable' : 'insufficient-data',
}
if (AS_JSON) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

console.log('睡眠纪元家族阈值校准（报告态 · 只读 · **跨档读**）')
console.log(`台账 ${ledger}`)
console.log(`跨档读行数 ${linesRead} · 深睡审计行 ${uniq.length}（去重丢弃 ${dupDropped}）· **带 sleepEpoch 的纪元 ${withEpoch.length}／去重后不同纪元 ${epochsDistinct}** · 无纪元 id（改动前历史）${out.epochsWithoutId}`)
console.log('')
if (spans.length) {
  console.log('纪元分布：')
  for (const s of spans) console.log(`  ${s.epoch}  区间 ${s.hours.toFixed(2)}h  stop=${s.stop}  landed=${s.landed}`)
  console.log(`  区间分位：p50=${out.spanHours.p50?.toFixed(2)}h p75=${out.spanHours.p75?.toFixed(2)}h p90=${out.spanHours.p90?.toFixed(2)}h · min=${out.spanHours.min?.toFixed(2)} max=${out.spanHours.max?.toFixed(2)}`)
} else console.log('（尚无带纪元的深睡行）')
console.log('')
/* **第三口径报告（S-P1b″ 定案）**：痕迹文件数 —— 这是「该不该睡」的**同源量**。
 *   与上一行「区间分位」并列打印，让"用哪个口径"成为**当场可见的选择**，而不是埋在文档里。 */
if (out.traceFiles.n) {
  const t = out.traceFiles
  console.log(`痕迹文件数分位（**S-P1b″ 定案口径**）：n=${t.n} · 缺字段 ${t.missing}（修复前纪元，不计入） · p25=${t.p25} p50=${t.p50} p75=${t.p75} p90=${t.p90} · min=${t.min} max=${t.max}`)
  console.log('  ⇒ 该轴**与「新增材料」同源**（同一遍枚举）、零额外 IO；`contentMinChars` 若启用，应按本轴预注册取值。')
} else {
  console.log('痕迹文件数分位：**N=0 显式记 0**（`traceFiles` 字段自 2026-09-20 round 9 才落审计 ⇒ 须等新纪元；**旧纪元一律不计入**）')
}
console.log('')
console.log(`阈值现况：contentMinChars=${JSON.stringify(out.thresholds.contentMinChars)}（null=关） · materialChunkChars=${JSON.stringify(out.thresholds.materialChunkChars)}（null=关）`)
console.log('')
if (out.verdict === 'insufficient-data') {
  console.log(`⇒ **insufficient-data**：不同纪元 ${epochsDistinct} < ${MIN_EPOCHS} ⇒ **维持关闭、不拍脑袋**（与两条登记项的 recheck 一致）。`)
} else {
  console.log(`⇒ **calibratable**：不同纪元 ${epochsDistinct} ≥ ${MIN_EPOCHS} ⇒ 可按分位预注册取值（**仍不得用区间长度代替材料量**）。`)
}
console.log('⚠ 口径红线（仍未解除）：本器报**区间长度**与**材料量**两个口径，且两者**已实测同源** ——')
console.log('   Pearson r(窗口分钟, materialChars) = **0.845**（n=45）；极短窗（≤20min）材料量已达 **36.3k 字符**（地板）')
console.log('   ⇒ 材料量主要由**装配预算**决定、与窗口新增量非独立 ⇒ `contentMinChars` **不得按旧口径校准**')
console.log('     （详见 OPEN-ITEMS S-P1b″；本器只报分布，不代替口径定案）。')
