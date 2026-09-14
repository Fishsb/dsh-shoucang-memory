#!/usr/bin/env node
/**
 * check-ring-coverage.mjs — 内容环登记门禁（G1 · 2026-09-13，登记于 scripts/check-runner.mjs）
 *
 * 为什么需要它：三轮讨论的结论是「用一套判据管所有内容，是当前架构最深的错配」。
 *   这条结论若不机械化，就会退化成文档里的一句话（本项目已有"写了从未运行"前例）。
 *   本门把三件事钉成硬约束：
 *     ① **每个 kind 必须登记环归属** —— 新增类型时被迫想清楚「它属哪个生命周期」，不许默默加一类；
 *     ② **已登记环不得为空环**（除非显式列入 `RING_PENDING`）—— 防"登记了却没有内容"的假环；
 *     ③ **免频率门的环必须包含 `association` / `decision`** —— 把「一次性洞见不该被频率门杀死」
 *        钉成契约：谁把 `association` 从免频率表里删掉，本门立刻翻红。
 *
 * 用法：node scripts/check-ring-coverage.mjs [--repo <path>]
 * 退出码：0 = pass · 1 = fail
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = await import(new URL('../lib/record-store.js', import.meta.url).href)
const R = await import(new URL('../lib/rings.js', import.meta.url).href)

let bad = 0
const badOf = (m) => { bad++; console.log(`❌ ${m}`) }
const okOf = (m) => console.log(`✅ ${m}`)

// ① 每个 kind 必须登记环
const uncovered = R.uncoveredKinds()
if (uncovered.length) badOf(`未登记环归属的 kind：${uncovered.join(', ')}（在 src/rings.ts#RING_OF_KIND 补登记）`)
else okOf(`KINDS ${S.KINDS.length} 类全部登记环归属`)

// ①b 反向：不得登记不存在的 kind（防 RING_OF_KIND 与 KINDS 漂移）
const extra = Object.keys(R.RING_OF_KIND).filter((k) => !S.KINDS.includes(k))
if (extra.length) badOf(`RING_OF_KIND 登记了不存在的 kind：${extra.join(', ')}（与 KINDS 漂移）`)
else okOf('RING_OF_KIND 键集与 KINDS 逐项一致（无多余键）')

// ② 空环必须显式申报
const emptyRings = R.emptyUndeclaredRings()
if (emptyRings.length) badOf(`空环未申报：${emptyRings.join(', ')}（落地后从 RING_PENDING 删除，或补 kind）`)
else okOf(`无未申报空环（已申报 pending：${R.RING_PENDING.join(', ') || '无'}）`)

// ②b 棘轮：已落 kind 却仍申报 pending 的环（防"豁免名单永不清空"）
const stale = R.stalePendingRings()
if (stale.length) badOf(`陈旧 pending 申报：${stale.join(', ')}（该环已有 kind —— 从 RING_PENDING 删除）`)
else okOf('RING_PENDING 无陈旧申报（棘轮：落地即须撤销申报）')

// ③ 免频率门契约（讨论结论的机械化）
for (const need of ['association', 'decision']) {
  if (!R.FREQUENCY_FREE_RINGS.includes(need)) badOf(`免频率门环缺 ${need}：一次性洞见会被频率门（≥3 痕迹 / ≥2 次）结构性杀死`)
}
if (R.FREQUENCY_FREE_RINGS.includes('association') && R.FREQUENCY_FREE_RINGS.includes('decision')) {
  okOf(`免频率门环 = ${R.FREQUENCY_FREE_RINGS.join(', ')}（一次性即成立，不受重现次数门约束）`)
}

// ④ 环普查（人读，便于看出内容结构是否失衡）
const census = R.RINGS.map((r) => `${r}:${R.kindsOfRing(r).length}`).join(' · ')
console.log(`· 环 → kind 数：${census}`)

// ⑤ **KPI 机检门**：每个环必须有 KPI 产出者，且该函数**真在 lib 里被导出**
//    （"加了环却不给 KPI ＝ 机制没有仪表盘"；本项目已有实证：快通道恒 0 无人知晓，人肉发现两次）
{
  const nonNone = R.RINGS.filter((r) => r !== 'none')
  const declared = Object.keys(R.RING_KPI).sort().join(',')
  if (declared !== [...nonNone].sort().join(',')) badOf(`RING_KPI 键集与环集合不一致（应为 ${nonNone.join(',')}，实为 ${declared}）`)
  else okOf(`RING_KPI 覆盖全部 ${nonNone.length} 个环（无遗漏、无多余）`)
  const byModule = new Map()
  for (const ring of nonNone) {
    const spec = R.RING_KPI[ring]
    if (!spec) { badOf(`环 ${ring} 未登记 KPI 产出者`); continue }
    if (!byModule.has(spec.module)) byModule.set(spec.module, await import(new URL(`../lib/${spec.module}.js`, import.meta.url).href))
    const mod = byModule.get(spec.module)
    if (typeof mod[spec.fn] !== 'function') badOf(`环 ${ring} 的 KPI『${spec.fn}』未在 lib/${spec.module}.js 导出（登记了却取不到＝死登记）`)
    else okOf(`环 ${ring} → ${spec.module}#${spec.fn}（${spec.what}）`)
  }
}

if (bad) { console.log(`\nFAIL（${bad} 项）`); process.exit(1) }
console.log('\nPASS（内容环登记自洽 · 每环有可机检 KPI）')
