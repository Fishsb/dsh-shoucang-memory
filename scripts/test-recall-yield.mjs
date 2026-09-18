#!/usr/bin/env node
// test-recall-yield.mjs — S4/D1「检索收益与停止准则」断言（2026-09-14 · S4 消费链条）
//
// 守什么：`nextZeroGain` / `shouldSwitchSource` 的**语义与边界** ——
//   ① **回引**（`topicEcho`，旧称 compliant）**必须归零**（来源仍有效），否则长跑会把"曾经失败过"永久累积成"永远该换向"；
//   ② 阈值语义（达阈值即出信号），且缺省阈值与"线索变弱即换向"的人类判据对齐（2 次）；
//   ③ F2（IR1 附册 · 2026-09-18）：旧 `yieldOf` / `compliant` 读数**已删** —— 它读的字段实测恒 false
//      （3119 行 false / true 0），留着等于继续发布一个"看着在测量、实际测不出东西"的指标。
//
// 判因：人类按**边际价值**停止检索（`human-task-loop` §1.3）；而本插件此前**没有任何停止判据** ——
//   材料注入后引用与否只落审计，**不产生行为后果**（再引导 1 次即放行）。
//
// 用法: node scripts/test-recall-yield.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/recall-yield.js', import.meta.url).href)
const { nextZeroGain, shouldSwitchSource, SWITCH_THRESHOLD } = mod
if (typeof nextZeroGain !== 'function') {
  console.log('❌ lib/recall-yield.js 导出不齐（先 npm run build:host）')
  process.exit(1)
}

console.log('S4/D1 检索收益与停止准则')

// ── ① 折收益：回引归零 / 未回引递增 ──
ok(nextZeroGain(undefined, false) === 1, '① 首次未回引 ⇒ 1')
ok(nextZeroGain(1, false) === 2 && nextZeroGain(2, false) === 3, '① 连续未回引 ⇒ 递增')
ok(nextZeroGain(5, true) === 0, '① **回引 ⇒ 归零**（来源仍有效）—— 若只递增，长跑会永久换向')
ok(nextZeroGain(undefined, true) === 0 && nextZeroGain(0, false) === 1, '① 边界：undefined+回引 ⇒ 0；0+未回引 ⇒ 1')

// ── ② 阈值语义 ──
ok(SWITCH_THRESHOLD === 2, `② 缺省阈值 = 2（对齐"线索变弱即换向"；实际 ${SWITCH_THRESHOLD}）`)
ok(shouldSwitchSource(0) === false && shouldSwitchSource(1) === false, '② 未达阈值 ⇒ false')
ok(shouldSwitchSource(2) === true && shouldSwitchSource(3) === true, '② 达/超阈值 ⇒ true')
ok(shouldSwitchSource(undefined) === false, '② undefined ⇒ false（不抛）')
ok(shouldSwitchSource(1, 1) === true, '② 阈值可注入（1 ⇒ 首次未回引即换向）')

// ── ③ 序列模拟：连续 3 次未回引 ⇒ 第 2 次起出信号 ──
{
  let z
  const seq = []
  for (const compliant of [false, false, false]) { z = nextZeroGain(z, compliant); seq.push(shouldSwitchSource(z)) }
  ok(seq.join(',') === 'false,true,true', `③ 连续不合规 ⇒ 信号序列 false,true,true（实际 ${seq.join(',')}）`)
  // 一旦合规，信号立刻消失
  z = nextZeroGain(z, true)
  ok(z === 0 && shouldSwitchSource(z) === false, '③ **一次合规即复位** ⇒ 信号消失（不残留"该换向"状态）')
}

// ── ④ F2 处置（IR1 附册 · 2026-09-18）：旧 `yieldOf` 读数**已删**（它读的 `compliant` 恒 false）──
{
  ok(typeof mod.yieldOf === 'undefined', '④ 旧 `yieldOf` 已删除（恒 false 字段不得继续被发布成"合规率"）')
}

// ── ⑤ 反例自证：把"合规归零"改成"只递增"必须被抓 ──
{
  const wrong = (prev, compliant) => Math.max(0, Number(prev) || 0) + (compliant ? 0 : 1) // 合规不归零
  let a, b
  for (const c of [false, false, true, false]) { a = nextZeroGain(a, c); b = wrong(b, c) }
  ok(a !== b, `⑤ 反例自证：合规不归零 ⇒ 计数不同（本件 ${a} vs 反例 ${b}）—— 断言语义有效，非恒真`)
  ok(shouldSwitchSource(a) === false && shouldSwitchSource(b) === true, '⑤ 且后果可见：反例在第 2 次不合规后**永久**该换向')
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（检索收益与停止准则断言全过）')
process.exit(fail ? 1 : 0)
