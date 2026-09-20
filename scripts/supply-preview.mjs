#!/usr/bin/env node
/**
 * supply-preview.mjs — 读侧装配**真库预览**（G4 · 2026-09-13）
 *
 * 为什么先做预览而不是直接接线：把装配接进 `systemPrompt` 这一步（方案档 P2b）依赖宿主的
 *   「`agent/pre-step` → 请求装配」先后关系，**仓内无法在不重启的情况下验证**（§15.2 已记录该前置）；
 *   贸然上等于可能**静默关掉认知环**。故本件先给出**离线、可复现的真实装配账**：
 *   段数/字符/超预算/被挡下行——接线时用它做前后对照基线。
 *
 * 分层判据**复用仓内单一实现** `targets.ts#indexRowInLayer`（不在此另写一份标签名单）。
 *
 * 用法：
 *   node scripts/supply-preview.mjs [--root <dir>] [--stdin-task "<任务文本>"]
 *                                   [--serendipity 300] [--seed 2026-09-13] [--json out.json]
 * 退出码：0 = pass · 3 = skip（影子库未建）· 1 = fail
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = argOf('--root', process.env.MEMORY_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'memory'))
const JSON_OUT = argOf('--json', '')

const H = await import(new URL('../lib/record-shadow.js', import.meta.url).href)
const A = await import(new URL('../lib/association-ring.js', import.meta.url).href)
const SA = await import(new URL('../lib/supply-assembly.js', import.meta.url).href)

const storePath = H.recordStorePath(ROOT)
if (!existsSync(storePath)) {
  console.log(`⏭ 影子库未建（${storePath}）——先跑：node scripts/record-sync.mjs --import`)
  process.exit(3)
}
const { records, error } = H.loadStore(ROOT)
if (error) { console.log(`❌ 影子库损坏：${error}`); process.exit(1) }

// 候选集构建走**读侧单一实现** `buildCandidates`（分层 + **时态失效剔除**都在里面；
// 此前本脚本自己写了一份分层逻辑——已消除，避免与 src 漂移）
const at = new Date().toISOString()
const cand = SA.buildCandidates(records, { at })
const core = cand.core, stable = cand.stable, dynamic = cand.dynamic

const serBudget = Number(argOf('--serendipity', '0'))
const pairs = serBudget > 0 ? A.serendipityPairs(records, { seed: argOf('--seed', '2026-09-13'), k: 3 }) : []
const budget = { ...SA.DEFAULT_BUDGET, serendipity: serBudget }

const res = SA.assembleSupply({ core, stable, dynamic, oneshot: [], serendipity: pairs }, budget)

console.log(`读侧装配预览 · 库=${ROOT}`)
console.log(`候选：core ${core.length} · 恒定面 ${stable.length} · 变动面 ${dynamic.length} · 越界联想 ${pairs.length}`)
console.log(`时态：已失效被剔 ${cand.expired.length} · 非可注入（结构/空白/环记录）${cand.notInjectable}`)
for (const e of cand.expired.slice(0, 3)) console.log(`  · [失效] ${e.why}｜${e.text.slice(0, 48)}`)
console.log(`预算：恒定 ${budget.stable} / 变动 ${budget.dynamic} / 一次性 ${budget.oneshot} / 联想 ${budget.serendipity}（合计 ${res.meta.budgetTotal}）`)
const coreKept = res.blocks.core ? res.blocks.core.split('\n').length : 0
console.log(`结果：core ${coreKept} · 恒定面 ${res.meta.kept.stable} · 变动面 ${res.meta.kept.dynamic} · 一次性 ${res.meta.kept.oneshot} · 联想 ${res.meta.kept.serendipity}（单位=行）`)
console.log(`字符：${res.meta.chars} / ${res.meta.budgetTotal}${res.meta.overBudget ? ' ⚠ 超预算' : ''} · 被预算挡下 ${res.meta.dropped.length} 行`)
for (const d of res.meta.dropped.slice(0, 5)) console.log(`  · [${d.slot}] ${d.why}｜${d.line.slice(0, 48)}`)
if (serBudget > 0 && res.blocks.serendipity) { console.log('越界联想槽（独立预算，不挤相关性面）：'); for (const l of res.blocks.serendipity.split('\n')) console.log(`  · ${l}`) }
console.log(`确定性：同 seed 同输入 ⇒ 逐字可复现（本件即基线）`)

if (JSON_OUT) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(JSON_OUT, JSON.stringify({ root: ROOT, budget, candidates: { core: core.length, stable: stable.length, dynamic: dynamic.length, serendipity: pairs.length }, result: res, text: SA.renderSupplyText(res) }, null, 1), 'utf8')
  console.log(`报告已落：${JSON_OUT}`)
}
