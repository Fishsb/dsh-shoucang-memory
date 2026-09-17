#!/usr/bin/env node
// yield-signal-probe.mjs — **检索收益信号健康度探针**（J5/U3 前置 · 2026-09-16 · 报告态，不入 CHECKS）
//
// 判因（实测三轮叠加，见 OPEN-ITEMS「J5/U3-信号源」）：
//   ① **信号源已死**：`phase:'compliance'` 行 1061 条，`compliant=true` **0 条** ⇒ 合规率 **0.0%**
//      ⇒ `nextZeroGain` 永远只有"递增"分支，**不可能归零**（`zeroGain` 实测冲到 246）。
//   ② **判据恒真**：`switchSource=true` 878/1061 = **82.8%** ⇒ "换向信号"是**恒真噪声**
//      （恒真 = 没有判别力，正是仓内最忌的"假旋钮"）。
//   ③ **无人消费**：`switchSource`/`zeroGain` 只写进审计，**`src/` 内没有消费者** ⇒ 无行为后果
//      （与 `recall-yield.ts` 抬头自述"不产生任何行为后果"一致 —— 至今仍如此）。
// ⇒ 结论：**J5 的正确顺序是"先修信号源，再谈判定机制"**；在死信号上接 LLM 调用点毫无意义
//   （喂进去的仍是"未引用"这一条恒真事实）。本探针把三条事实**常态化可见**，防后来者继续往上叠。
//
// 用法: node scripts/yield-signal-probe.mjs [--ledger <路径>] [--json]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const ledger = argOf('--ledger', join(homedir(), '.dsh', 'suite', 'knowledge', 'audit', 'ledger.jsonl'))
if (!existsSync(ledger)) { console.log(`台账缺席：${ledger}（exit 3）`); process.exit(3) }

const rows = []
for (const l of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
  const t = l.trim(); if (!t) continue
  try { const o = JSON.parse(t); if (o?.phase === 'compliance') rows.push(o) } catch { /* 坏行跳过（报告态） */ }
}
const total = rows.length
const yes = rows.filter((r) => r.compliant === true).length
const switchTrue = rows.filter((r) => r.switchSource === true).length
const zgs = rows.map((r) => Number(r.zeroGain) || 0)
const maxZg = zgs.length ? Math.max(...zgs) : 0
const withMat = rows.filter((r) => Number(r.materialChars) > 0).length
const out = {
  ledger, complianceRows: total, compliantTrue: yes,
  complianceRate: total ? Math.round((yes / total) * 1000) / 10 : null,
  switchTrue, switchRate: total ? Math.round((switchTrue / total) * 1000) / 10 : null,
  maxZeroGain: maxZg, withMaterial: withMat,
  verdict: total === 0 ? 'no-data'
    : (yes === 0 ? 'signal-dead' : (switchTrue / total > 0.8 ? 'switch-always-true' : 'ok')),
}
if (argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

console.log('检索收益信号健康度（报告态 · 只读）')
console.log(`台账 ${ledger}`)
console.log(`compliance 行 **${total}** · compliant=true **${yes}** ⇒ 合规率 **${out.complianceRate}%** · 带材料 ${withMat}`)
console.log(`switchSource=true **${switchTrue}** / ${total} ⇒ **${out.switchRate}%** · zeroGain 最大 **${maxZg}**`)
console.log('')
if (out.verdict === 'signal-dead') {
  console.log('🔴 **信号源已死**：`compliant` 恒 false ⇒ `nextZeroGain` 永远走递增分支、**不可能归零**')
  console.log('   ⇒ 在此信号上做任何"判定机制升级"（计数法或 LLM）**输入都是退化的**。')
  console.log('   ⇒ 正确顺序：**先修信号源**（取证"注入后模型的下一步动作"），再谈判定。')
} else if (out.verdict === 'switch-always-true') {
  console.log('⚠ **判据恒真**：`switchSource` 占比 > 80% ⇒ 它没有判别力（恒真 = 假旋钮）。')
} else if (out.verdict === 'no-data') {
  console.log('（无 compliance 样本 ⇒ 未判；**不是"健康"**）')
} else {
  console.log('✅ 信号分布正常（有真阳性且换向信号非恒真）')
}
console.log('')
console.log('⚠ 另一条（本探针不查、但在 OPEN-ITEMS 记着）：`switchSource`/`zeroGain` **在 src/ 内无消费者**')
console.log('   ⇒ 即便判据正确，当前也**没有行为后果**（与 recall-yield.ts 抬头自述一致）。')
