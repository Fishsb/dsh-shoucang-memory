#!/usr/bin/env node
// recall-diagnose.mjs — S4-6′「召回零命中归因」聚合诊断（2026-09-14 · 消费链条）
//
// 回答一个问题：**MCL 步里那些"没有命中"的，到底是哪一层的问题？**
//
// 判因（S1 实测）：双源 1411 步中 `hit` 为空 **1153（81.7%）**，而 `mcl-calibrate` 的读数提示明说
//   「真正的瓶颈若在'无命中'，调阈值不会改善快通道率，该查召回（词表/索引）」。
//   ⇒ 原计划 S4-7「两条件分流」的前提（"瓶颈在标签门"）**已被证伪**：被标签门挡下的 337 条里
//     279 条是"(无/空)"，即根本没召回命中 —— 与阈值、标签门都无关。
//
// ⚠ **历史数据不可可靠归因**：加 `missReason` 之前，`hit:''` 混合了两种情形 ——
//   ① `fast` 分支里"真·零召回"（该分支写了 `hit` 字段，故空即真空）；
//   ② `slow` 分支旧实现**根本没写 `hit` 字段**（不是空，是缺）。
//   本件对旧数据**只报"不可归因"**，不猜 —— 猜出来的分布会误导后续决策。
//
// 用法: node scripts/recall-diagnose.mjs          （只读）
//       node scripts/recall-diagnose.mjs --json
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const AUD = join(HOME, 'suite', 'knowledge', 'audit')
const BANK = process.env.MEMORY_ROOT || join(HOME, 'skills', 'managing-memory')
const AS_JSON = process.argv.includes('--json')

const rd = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean) : [])
const parseAll = (p) => rd(p).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

// 双源合并（与 mcl-calibrate / mcl-compliance 同口径：legacy ∪ 台账 type=mcl-step）
const legacy = parseAll(join(AUD, 'mcl-audit.jsonl')).filter((o) => (o.kind || o.type) === 'mcl-step')
const live = parseAll(join(AUD, 'ledger.jsonl')).filter((o) => o.type === 'mcl-step')
const all = [...legacy, ...live]

// 库内可召回的索引行（分母参考：三索引里"有标签 + 有 notes 指针"的薄行）
const indexRows = (() => {
  let n = 0
  for (const f of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
    try {
      n += readFileSync(join(BANK, f), 'utf8').split(/\r?\n/).filter((l) => /^\s*\[[^\]\s]+\]/.test(l) && /→\s*notes\//.test(l)).length
    } catch { /* 缺件跳过 */ }
  }
  return n
})()

const withReason = all.filter((o) => typeof o.missReason === 'string' && o.missReason)
const legacyNoReason = all.filter((o) => !(typeof o.missReason === 'string' && o.missReason))

const byReason = {}
for (const o of withReason) byReason[o.missReason] = (byReason[o.missReason] || 0) + 1

const recallLayer = (byReason['recall-empty'] || 0) + (byReason['no-highconf'] || 0)
const thresholdLayer = byReason['below-threshold'] || 0
const okN = byReason['ok'] || 0
const embedOff = byReason['embed-off'] || 0
const attributable = withReason.length

const out = {
  total: all.length,
  attributable,
  notAttributable: legacyNoReason.length,
  byReason,
  recallLayer,
  thresholdLayer,
  ok: okN,
  embedOff,
  indexRows,
}
if (AS_JSON) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

console.log('召回可诊断（S4-6′ · 零命中归因）')
console.log(`  总 mcl-step = ${all.length}（冻结档 ${legacy.length} + 现行档 ${live.length}）`)
console.log(`  库内可召回索引行（分母参考）= ${indexRows} 行`)
console.log('')
console.log(`  ├ 可归因（带 missReason，2026-09-14 起）= ${attributable}`)
if (attributable > 0) {
  const pct = (n) => (attributable ? Math.round((n / attributable) * 1000) / 10 : 0)
  for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`  │    · ${k.padEnd(16)} ${String(v).padStart(5)}  (${pct(v)}%)`)
  console.log('  │')
  console.log(`  │    **召回层**（recall-empty + no-highconf）= ${recallLayer}（${pct(recallLayer)}%）`)
  console.log(`  │    **阈值层**（below-threshold）           = ${thresholdLayer}（${pct(thresholdLayer)}%）`)
  console.log(`  │    快通道就绪（ok）                        = ${okN}（${pct(okN)}%）`)
  console.log(`  │    向量未启用（embed-off）                 = ${embedOff}（${pct(embedOff)}%）`)
  console.log('  │')
  console.log(`  │    读法：**召回层占比高 ⇒ 调阈值无用**，应查词表/索引/情境（这正是 S4-7 被降级的原因）`)
} else {
  console.log('  │    （尚无带该字段的步 —— 字段于 2026-09-14 加入，需新会话触发 MCL 才会产生）')
}
console.log(`  └ 不可归因（旧数据，无该字段）= ${legacyNoReason.length}`)
console.log("       ⚠ 旧数据**不做推断**：hit 为空混合了「fast 分支真·零召回」与「slow 分支旧实现根本没写该字段」")
console.log('         两种情形 ⇒ 任何"猜出来的分布"都会误导后续决策（这正是补该字段的理由）。')
console.log('')
// S4R/R3（2026-09-14）：**由分布推导调参方向** —— 判据来自 `recall-diagnosis#adviseFromMissCounts`
//   （**不是写死的方向**：原 S4-7 写死"两条件分流"，其前提"瓶颈在标签门"已被 S1 证伪）
const { adviseFromMissCounts } = await import(new URL('../lib/recall-diagnosis.js', import.meta.url).href)
const adv = adviseFromMissCounts(byReason)
console.log('')
console.log(`🧭 调参建议（**由数据推导**，非写死）：**${adv.advice}**`)
console.log(`   ${adv.why}`)
console.log('')
console.log(attributable === 0 ? '⏳ 待数据：字段已就位，等新会话产生样本后重跑本件。' : '✅ 已可归因。')
