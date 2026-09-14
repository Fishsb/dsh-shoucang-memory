#!/usr/bin/env node
// test-budget-single.mjs — S4-1「预算口径单一实现」断言（2026-09-14 · S4 消费链条）
//
// 守什么：`supply-assembly#budgetOf` 与**改前手写的公式逐式等价** ——
//   口径统一（消除"主路径手写 / 装配器 DEFAULT_BUDGET"两套）**不得改变任何数值**，
//   否则注入文本会跟着变（而"文本不变"正是 S4-1 能自主推进、无须产品决策的前提）。
//
// 本件把**旧公式**内联为夹具（照 2026-09-14 改动前的 `panel-shared.ts:637-640` 逐字抄写），
//   对一批总预算逐一比对 ⇒ 这是"逐式等价"的**可执行证据**，不是自述。
//
// 用法: node scripts/test-budget-single.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/supply-assembly.js', import.meta.url).href)
const { budgetOf, DEFAULT_BUDGET } = mod
if (typeof budgetOf !== 'function') {
  console.log('❌ lib/supply-assembly.js 未导出 budgetOf（先 npm run build:host）')
  process.exit(1)
}

/** **改动前的手写公式**（逐字照抄 panel-shared.ts 2026-09-14 前版本）—— 作为等价性夹具 */
const legacy = (raw) => {
  const totalBudget = Math.max(1200, Number(raw) || 4000)
  const capOneshot = Math.max(80, Math.min(200, Math.round(totalBudget * 0.05)))
  const capDynamic = Math.max(120, Math.min(600, Math.round(totalBudget * 0.15)))
  const capStable = Math.max(200, totalBudget - capOneshot - capDynamic)
  return { stable: capStable, dynamic: capDynamic, oneshot: capOneshot }
}

console.log('S4-1 预算口径单一实现（与改前公式逐式等价）')

// ── ① 一批总预算逐一比对（含注册表实际值 4000 与各钳位边界）──
const CASES = [4000, 3000, 1200, 800, 0, undefined, null, NaN, 10000, 2000, 2500, 3333]
let mism = 0
for (const c of CASES) {
  const a = budgetOf(c)
  const b = legacy(c)
  if (a.stable !== b.stable || a.dynamic !== b.dynamic || a.oneshot !== b.oneshot) {
    mism++
    console.log(`   ❌ total=${String(c)} ⇒ new ${JSON.stringify({ s: a.stable, d: a.dynamic, o: a.oneshot })} vs legacy ${JSON.stringify(b)}`)
  }
}
ok(mism === 0, `① ${CASES.length} 组总预算逐一等价（不等价 ${mism} 组）`)

// ── ② 注册表实际值 4000 的具体数值（钉住基数，防"等价但都错"）──
{
  const b = budgetOf(4000)
  ok(b.stable === 3200 && b.dynamic === 600 && b.oneshot === 200, `② total=4000 ⇒ stable 3200 / dynamic 600 / oneshot 200（实际 ${b.stable}/${b.dynamic}/${b.oneshot}）`)
  ok(b.stable + b.dynamic + b.oneshot === 4000, '② 三层加总 = 总预算（恒定面吃余额，无余数）')
}

// ── ③ 钳位边界（下限/上限）──
{
  const small = budgetOf(1200)
  ok(small.oneshot === 80 && small.dynamic === 180, `③ total=1200 ⇒ 下限钳位生效（oneshot 80 / dynamic ${small.dynamic}）`)
  const big = budgetOf(100000)
  ok(big.oneshot === 200 && big.dynamic === 600, '③ 极大总预算 ⇒ 上限钳位生效（oneshot 200 / dynamic 600）')
}

// ── ④ 与 `DEFAULT_BUDGET` 的**边界**：统一的是公式，不是"压成同一组数" ──
{
  ok(DEFAULT_BUDGET.stable === 1000, '④ `DEFAULT_BUDGET.stable` 仍为 1000（离线固定缺省，**不得**被并成运行时的 3200）')
  ok(budgetOf(4000).stable === 3200, '④ `budgetOf(4000).stable` = 3200（运行时吃余额）—— 两者**有意不同**，是本项的口径边界')
}

// ── ⑤ 反例自证：断言不是恒真（改一个钳位上限即被检出）──
{
  const wrong = (raw) => {
    const total = Math.max(1200, Number(raw) || 4000)
    const oneshot = Math.max(80, Math.min(199, Math.round(total * 0.05))) // 故意把 200 写成 199
    const dynamic = Math.max(120, Math.min(600, Math.round(total * 0.15)))
    return { stable: Math.max(200, total - oneshot - dynamic), dynamic, oneshot }
  }
  const a = wrong(4000)
  const b = legacy(4000)
  ok(a.oneshot !== b.oneshot, '⑤ 反例自证：钳位上限改 1 即被检出（本件比对逐式，语义有效）')
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（预算单一实现断言全过）')
process.exit(fail ? 1 : 0)
