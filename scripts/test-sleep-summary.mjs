#!/usr/bin/env node
// test-sleep-summary.mjs — S3-2「深睡空转可见化」聚合口径断言（2026-09-14 · S3 维护链条）
//
// 守什么：`sleepSummaryOf` 把「有产出 / 空转 / 异常 / 旧格式」四类**分清**，且
//   **旧格式（stop 与 gate 都缺）单列、不混入分母** —— 否则会把"当年没记"误算成"空转"或"有产出"，
//   重演仓内"未跑与通过不可区分"的老问题（`closureOk` 曾 107/107 全 false 即此型）。
//
// 用法: node scripts/test-sleep-summary.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/panel-observe.js', import.meta.url).href)
const { sleepSummaryOf } = mod
if (typeof sleepSummaryOf !== 'function') {
  console.log('❌ lib/panel-observe.js 未导出 sleepSummaryOf（先 npm run build:host）')
  process.exit(1)
}

console.log('S3-2 深睡空转摘要（聚合口径）')

// ── ① 空输入 ──
{
  const s = sleepSummaryOf([])
  ok(s.total === 0 && s.landedRate === null && s.noopRate === null, '① 空输入 ⇒ total=0 且比率为 null（不除零）')
}

// ── ② 全 legacy（旧格式：stop 与 gate 都缺）⇒ 分母为 0，全部记为 legacy ──
{
  const s = sleepSummaryOf([{ at: 'x', added: 1 }, { at: 'y' }])
  ok(s.legacy === 2 && s.landedRate === null, '② 旧格式全部计入 legacy，且**不混入分母**（比率为 null，不误报 0%）')
}

// ── ③ 有产出（landed:true）──
{
  const s = sleepSummaryOf([{ stop: 'completed', gate: 'pass', landed: true, attempted: 3, added: 2 }])
  ok(s.landed === 1 && s.landedRate === 100, '③ landed:true ⇒ 计入有产出，比率 100%')
}

// ── ④ 空转：completed 但未落地（no-op / all-rejected / 无 landed）──
{
  const s = sleepSummaryOf([
    { stop: 'completed', gate: 'no-op', landed: false },
    { stop: 'completed', gate: 'all-rejected', landed: false, attempted: 2 },
  ])
  ok(s.noop === 2 && s.landed === 0, '④ completed 且未落地 ⇒ 计入空转（含 all-rejected）')
  ok(s.byGate['no-op'] === 1 && s.byGate['all-rejected'] === 1, '④ byGate 逐门计数可查（失败不再只剩一个字符串）')
}

// ── ⑤ 异常：stop=error / aborted / result=error ──
{
  const s = sleepSummaryOf([
    { stop: 'error', gate: 'stop=error', result: 'error' },
    { stop: 'aborted', gate: 'stop=aborted' },
  ])
  ok(s.error === 2 && s.noop === 0, '⑤ 异常轮计入 error，**不混入空转**（两者要分开看）')
}

// ── ⑥ no-traces / no-parent 归类 ──
{
  const s = sleepSummaryOf([
    { result: 'no-traces' },
    { result: 'no-parent' },
  ])
  ok(s.total === 2, '⑥ no-traces/no-parent 计入总轮数')
  ok(s.byResult['no-traces'] === 1 && s.byResult['no-parent'] === 1, '⑥ byResult 暴露空转**原因**（S3 验收 C2 要求）')
}

// ── ⑦ 混合：legacy 不进分母（核心口径）──
{
  const s = sleepSummaryOf([
    { at: 'legacy-1' },                                   // 旧格式
    { stop: 'completed', gate: 'pass', landed: true },     // 有产出
    { stop: 'completed', gate: 'no-op', landed: false },   // 空转
    { stop: 'error', result: 'error' },                    // 异常
  ])
  ok(s.total === 4 && s.legacy === 1, '⑦ 混合输入：legacy 单列（total=4 · legacy=1）')
  ok(s.landedRate === 33.3, `⑦ 分母 = 4−1 = 3 ⇒ 有产出率 33.3%（实际 ${s.landedRate}）—— 若把 legacy 算进分母会得 25%`)
  ok(s.landed + s.noop + s.error + s.legacy === s.total, '⑦ 四类互斥且完备（加总 = 总轮数）')
}

// ── ⑧ 真实画像对照（本次实测的 42 轮口径，钉住"看得见空转"这件事）──
{
  const s = sleepSummaryOf([
    ...Array.from({ length: 16 }, () => ({ result: 'no-traces' })),
    ...Array.from({ length: 4 }, () => ({ result: 'no-parent' })),
    ...Array.from({ length: 5 }, () => ({ stop: 'completed', gate: 'no-op', landed: false })),
    ...Array.from({ length: 7 }, () => ({ stop: 'completed', gate: 'pass', landed: false })),
    ...Array.from({ length: 3 }, () => ({ stop: 'completed', gate: 'pass', landed: true })),
    ...Array.from({ length: 4 }, () => ({ stop: 'error', result: 'error' })),
    ...Array.from({ length: 1 }, () => ({ stop: 'aborted' })),
    ...Array.from({ length: 2 }, () => ({ stop: 'completed', gate: 'all-rejected', landed: false })),
  ])
  ok(s.total === 42, `⑧ 42 轮画像：total=42（实际 ${s.total}）`)
  ok(s.landed === 3, `⑧ 有产出仅 **3** 轮（实际 ${s.landed}）—— 这就是"空转可见"要暴露的事`)
  ok(typeof s.landedRate === 'number' && s.landedRate < 10, `⑧ 有产出率 ≈7%（实际 ${s.landedRate}%）—— ⚠ **该比率低不等于空转**：分母含大量"无材料"轮次（no-traces/no-parent）。健康度须结合**候选输入量**看（S3 验收实测：有候选轮次落地率 **71%**）`)
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（空转摘要口径断言全过）')
process.exit(fail ? 1 : 0)
