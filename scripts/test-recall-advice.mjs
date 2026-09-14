#!/usr/bin/env node
// test-recall-advice.mjs — S4R/R3「D2 判据重定」断言（2026-09-14 · S4 收尾）
//
// 守什么（C1/C2）：`adviseFromMissCounts` 的结论**完全由 `missReason` 分布推导**（不写死方向），
//   且**同一总量、不同分布 ⇒ 不同结论**（C2 的反例自证 —— 若两组分布结论相同，判据就没有区分力）。
//
// **为什么要这条判据**：原 S4-7「两条件分流」把方向写死了，前提是"瓶颈在标签门" ——
//   该前提**已被 S1 实测证伪**（真实瓶颈是召回零命中 **81.7%**）。写死的判据会把人引向"调阈值"，
//   而**调阈值对召回层无效**。故判据必须能**从数据自己得出结论**。
//
// 用法: node scripts/test-recall-advice.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/recall-diagnosis.js', import.meta.url).href)
const { adviseFromMissCounts } = mod
if (typeof adviseFromMissCounts !== 'function') {
  console.log('❌ lib/recall-diagnosis.js 未导出 adviseFromMissCounts（先 npm run build:host）')
  process.exit(1)
}

console.log('S4R/R3 D2 判据重定（由数据推导调参方向）')

// ── C1 四条分支各自可达 ──
{
  const short = adviseFromMissCounts({ 'recall-empty': 2, ok: 1 })
  ok(short.advice === 'insufficient-data', `C1 样本不足 ⇒ insufficient-data（实际 ${short.advice}）—— **不猜方向**`)
  ok(short.why.includes('不猜'), 'C1 且 `why` 写明"不猜"（可见化，不静默）')

  const emb = adviseFromMissCounts({ 'embed-off': 40, 'recall-empty': 5, ok: 5 })
  ok(emb.advice === 'enable-embed', `C1 embed-off 过半 ⇒ enable-embed（实际 ${emb.advice}）—— 配置层根因优先`)

  const rec = adviseFromMissCounts({ 'recall-empty': 40, 'no-highconf': 20, 'below-threshold': 5, ok: 35 })
  ok(rec.advice === 'fix-recall', `C1 召回层主导 ⇒ fix-recall（实际 ${rec.advice}）—— **调阈值无用**`)

  const thr = adviseFromMissCounts({ 'recall-empty': 3, 'below-threshold': 40, ok: 57 })
  ok(thr.advice === 'lower-threshold', `C1 阈值层主导 ⇒ lower-threshold（实际 ${thr.advice}）`)
}

// ── C2【反例自证】同一总量/同一未命中数，**分布不同 ⇒ 结论必须不同** ──
{
  const total = 100
  const miss = 60
  const a = adviseFromMissCounts({ 'recall-empty': miss, ok: total - miss })
  const b = adviseFromMissCounts({ 'below-threshold': miss, ok: total - miss })
  ok(a.total === b.total && a.miss === b.miss, 'C2 两组**总量与未命中数完全相同**（排除总量干扰）')
  ok(a.advice !== b.advice, `C2 **同量不同分布 ⇒ 结论不同**（${a.advice} vs ${b.advice}）—— 判据有区分力，非恒真`)
  // embed-off 与召回层的区分同理
  const c = adviseFromMissCounts({ 'embed-off': miss, ok: total - miss })
  ok(c.advice === 'enable-embed' && c.advice !== a.advice, 'C2 embed-off 过半与召回层主导给出**不同**结论')
}

// ── 边界与稳健 ──
{
  const tie = adviseFromMissCounts({ 'recall-empty': 20, 'below-threshold': 20, ok: 60 })
  ok(tie.advice === 'lower-threshold', '边界：召回层 == 阈值层 ⇒ 归阈值层（`>` 才判召回层，口径明确）')
  const zero = adviseFromMissCounts({})
  ok(zero.advice === 'insufficient-data' && zero.total === 0, '零样本 ⇒ insufficient-data（不抛、不猜）')
  const allOk = adviseFromMissCounts({ ok: 100 })
  ok(allOk.advice === 'lower-threshold' && allOk.miss === 0, '全部命中（miss=0）⇒ 不因除零而崩；结论落阈值分支（miss=0 时无可调项）')
  const neg = adviseFromMissCounts({ 'recall-empty': -5, ok: 100 })
  ok(neg.recallLayer === 0, '负数被钳为 0（不因脏数据翻转结论）')
  const atMin = adviseFromMissCounts({ 'recall-empty': 5, ok: 5 }, 10)
  ok(atMin.advice === 'fix-recall', '`minSamples` 为**闭区间**：total(10) == min(10) ⇒ 达标（继续判方向）')
  const belowMin = adviseFromMissCounts({ 'recall-empty': 4, ok: 5 }, 10)
  ok(belowMin.advice === 'insufficient-data', '`minSamples` 之下（9 < 10）⇒ insufficient-data')
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（D2 判据重定断言全过）')
process.exit(fail ? 1 : 0)
