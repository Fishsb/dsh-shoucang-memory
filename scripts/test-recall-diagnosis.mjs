#!/usr/bin/env node
// test-recall-diagnosis.mjs — S4-6′「召回零命中归因」口径断言（2026-09-14 · S4 消费链条）
//
// 守什么：`recallMissReasonOf` 的**判定顺序与边界**与 `mcl.ts#decideTurn` 的 `fast` 判定**同序同界**。
//   为什么这是独立断言而非"看着对"：诊断与行为若两套口径，就会出现「诊断说阈值层、行为按召回层走」
//   的情形 —— 而 S4-7（两条件分流）**正是要拿这份诊断去定分流判据**，口径错了整条线都错。
//
// 关键边界：`mcl.ts` 用 `sim >= familiarThreshold` 判熟悉 ⇒ 归因必须在 `sim === threshold` 时给 `ok`
//   （若写成 `sim <= threshold → below-threshold`，就会与行为差一个等号，制造"诊断比行为严格"的假象）。
//
// 用法: node scripts/test-recall-diagnosis.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/recall-diagnosis.js', import.meta.url).href)
const { recallMissReasonOf, isRecallLayerMiss } = mod
if (typeof recallMissReasonOf !== 'function') {
  console.log('❌ lib/recall-diagnosis.js 未导出 recallMissReasonOf（先 npm run build:host）')
  process.exit(1)
}

const T = 0.55
const base = { rowsN: 3, hasHighConf: true, sim: 0.6, threshold: T, embedEnabled: true }
const of = (over) => recallMissReasonOf({ ...base, ...over })

console.log('S4-6′ 召回零命中归因（口径）')

// ── ① 各分支可达 ──
ok(of({ sim: 0.6 }) === 'ok', '① 有高置信行 + 熟悉度达标 ⇒ ok')
ok(of({ rowsN: 0, hasHighConf: false, sim: 0 }) === 'recall-empty', '① 召回 0 行 ⇒ recall-empty')
ok(of({ hasHighConf: false }) === 'no-highconf', '① 召回有行但无高置信标签 ⇒ no-highconf')
ok(of({ sim: 0.4 }) === 'below-threshold', '① 有高置信但熟悉度不足 ⇒ below-threshold')
ok(of({ embedEnabled: false, sim: 0 }) === 'embed-off', '① 向量未启用 ⇒ embed-off')

// ── ② 顺序（**先报根因，不报表象**）──
ok(of({ embedEnabled: false, rowsN: 0, hasHighConf: false, sim: 0 }) === 'embed-off', '② 顺序：embed-off **优先于** recall-empty（sim 恒 0 时后续判定无意义）')
ok(of({ rowsN: 0, hasHighConf: false, sim: 0 }) === 'recall-empty', '② 顺序：recall-empty **优先于** no-highconf（0 行时"无高置信"是必然，不是独立原因）')
ok(of({ hasHighConf: false, sim: 0.1 }) === 'no-highconf', '② 顺序：no-highconf **优先于** below-threshold（没有高置信行时谈不上"熟悉"）')

// ── ③ 边界：与 `mcl.ts` 的 `sim >= threshold` 同界 ──
ok(of({ sim: T }) === 'ok', `③ 边界：sim === threshold ⇒ ok（与行为侧的 \`>=\` 同界；写成 \`>\` 会差一个等号）`)
ok(of({ sim: T - 0.001 }) === 'below-threshold', '③ 边界：sim 略低于阈值 ⇒ below-threshold')

// ── ④ 分层归类（诊断读法的依据）──
ok(isRecallLayerMiss('recall-empty') === true, '④ recall-empty 归**召回层**')
ok(isRecallLayerMiss('no-highconf') === true, '④ no-highconf 归**召回层**（有行但无高置信标签，仍是召回/标签面问题）')
ok(isRecallLayerMiss('below-threshold') === false, '④ below-threshold **不**归召回层（这才是阈值层）')
ok(isRecallLayerMiss('ok') === false && isRecallLayerMiss('embed-off') === false, '④ ok / embed-off 均不归召回层（embed-off 是配置问题）')

// ── ⑤ 反例自证：把顺序倒过来必须被抓 ──
{
  const wrongOrder = (s) => {
    if (s.rowsN <= 0) return 'recall-empty' // 故意把"召回空"提到"向量关"之前
    if (!s.embedEnabled) return 'embed-off'
    if (!s.hasHighConf) return 'no-highconf'
    return s.sim < s.threshold ? 'below-threshold' : 'ok'
  }
  const input = { rowsN: 0, hasHighConf: false, sim: 0, threshold: T, embedEnabled: false }
  ok(wrongOrder(input) === 'recall-empty' && recallMissReasonOf(input) === 'embed-off', '⑤ 反例自证：顺序错则结果不同（本断言语义有效，非恒真）')
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（召回归因口径断言全过）')
process.exit(fail ? 1 : 0)
