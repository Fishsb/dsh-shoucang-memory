#!/usr/bin/env node
// test-probe-outcome.mjs — S-P2b 探测结论决策表单测（2026-09-20）
//
// 判因（真机实测 + 可执行探针）：`probeSession` 把「证据 → 结论」写成 8 个命令式 if 出口，
//   其中 `if (active) { rec.state = 'suspect'; ... return }`（证据冲突）**排在 `stallRound+1` 之前**，
//   且**不推进任何计数** ⇒ 下轮巡检对 suspect 再探、再冲突 ⇒ **活锁**。
//   真机：`28f9f094` **连续 23 次 conflict、跨 11 小时**（09-16T21:36 → 09-17T08:41），
//   该窗口「探测未决」41 行、`deep sleep: 触发` **0 行**（整机不睡）。全库 conflict 仅此 1 会话 23 条。
//
// 本件钉死五件：
//   ① 决策表优先级（未存活 → 增长 → 子代理 → 冲突 → 卡住/复核）**顺序即语义**；
//   ② **conflict 有界**：连续满 `conflictMax` 轮即转 stalled（**治活锁**）；
//   ③ 计数复位语义：新事件/增长/子代理 ⇒ 冲突计数归零（会话复活）；
//   ④ `refreshActivity` **只**在正向进展证据（增长 / 子代理）为真 —— 否则停滞计时永不推进（永睡不着）；
//   ⑤ 布线：`probeSession` 不得再有内联状态判定（全部经决策表）；`conflictRound` 与 `stallRound` 同寿同清。
//
// 反例自证（先红）：把 conflict 分支改回"不推进计数直接 return"（旧行为）⇒ ② 必红（活锁复现）。
//
// 退出码：0=全过 / 1=有失败
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let fail = 0
const ok = (c, m, extra = '') => { P.push(`${c ? '✅' : '❌'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fail++ }

const M = await import(new URL('../lib/probe-plan.js', import.meta.url).href)
const { planProbeOutcome } = M
if (typeof planProbeOutcome !== 'function') {
  console.log('❌ lib/probe-plan.js 未导出 planProbeOutcome（先 npm run build:host）')
  process.exit(1)
}

const CFG = { confirm: 2, conflictMax: 3 }
const ev = (o = {}) => ({ alive: true, active: false, viaChildren: false, grew: false, noTranscript: false, ...o })

console.log('S-P2b 探测结论决策表（conflict 有界）\n')

// ── ① 优先级：顺序即语义 ──
{
  // 未存活 + 增长同时为真 ⇒ 增长优先（正向证据更强）；但更常见形态是先判存活
  const a = planProbeOutcome(ev({ noTranscript: true, grew: true }), { stallRound: 0, conflictRound: 0 }, CFG)
  ok(a.probeResult === 'no-transcript' && a.state === 'ended', '① noTranscript 优先于 grew（探针不可用先行）')
  const b = planProbeOutcome(ev({ grew: true, active: true }), { stallRound: 5, conflictRound: 2 }, CFG)
  ok(b.probeResult === 'long-run' && b.state === 'running', '① grew 优先于 conflict（正向进展证据更强）')
  ok(b.stallRound === 0 && b.conflictRound === 0, '① grew ⇒ 两个计数均归零（会话复活）')
  const c = planProbeOutcome(ev({ viaChildren: true, active: true }), { stallRound: 1, conflictRound: 2 }, CFG)
  ok(c.probeResult === 'long-run', '① viaChildren 优先于 conflict（**既有实测结论，不得回退**）')
  const d = planProbeOutcome(ev({ alive: false, active: true }), { stallRound: 0, conflictRound: 0 }, CFG)
  ok(d.probeResult === 'exit' && d.state === 'ended', '① 未存活 ⇒ exit/ended（异常退出，不阻塞）')
}

// ── ② conflict 有界（**核心：治活锁**）──
{
  // 连续推演：active=true 且无任何进展证据 ⇒ 应在第 conflictMax 轮转 stalled（不再无限 suspect）
  let st = { stallRound: 0, conflictRound: 0 }
  const seq = []
  for (let i = 0; i < 5; i++) {
    const o = planProbeOutcome(ev({ active: true }), st, CFG)
    seq.push(`${o.probeResult}/${o.state}@${o.conflictRound}`)
    st = { stallRound: o.stallRound, conflictRound: o.conflictRound }
    if (o.state === 'stalled') break
  }
  ok(seq.length === 3, '② conflict **有界**：第 3 轮（= conflictMax）即收敛，不再无限循环', seq.join(' → '))
  ok(seq[0].startsWith('conflict/suspect'), '② 第 1 轮：转 suspect 复核（保守，与改前一致）', seq[0])
  ok(seq[2].startsWith('stall/stalled'), '② 第 3 轮：按卡住处理（不阻塞睡眠）⇒ **活锁解除**', seq[2])
  const o = planProbeOutcome(ev({ active: true }), { stallRound: 0, conflictRound: 2 }, CFG)
  ok(o.state === 'stalled' && o.probeResult === 'stall', '② 边界：已有 2 轮冲突 ⇒ 本次即达上限转 stalled')
  const o1 = planProbeOutcome(ev({ active: true }), { stallRound: 0, conflictRound: 0 }, { confirm: 2, conflictMax: 1 })
  ok(o1.state === 'stalled', '② conflictMax=1 ⇒ 首轮即转 stalled（上界可调）')
}

// ── ③ 卡住路径（stall confirm 语义不变）──
{
  const s1 = planProbeOutcome(ev(), { stallRound: 0, conflictRound: 0 }, CFG)
  ok(s1.probeResult === 'suspect' && s1.state === 'suspect' && s1.stallRound === 1, '③ 第 1 次无增长 ⇒ suspect（阻塞睡眠待复核）')
  const s2 = planProbeOutcome(ev(), { stallRound: 1, conflictRound: 0 }, CFG)
  ok(s2.probeResult === 'stall' && s2.state === 'stalled' && s2.stallRound === 2, '③ 连续 2/2 ⇒ 确认卡住（不阻塞）')
  const s0 = planProbeOutcome(ev(), { stallRound: 0, conflictRound: 2 }, CFG)
  ok(s0.conflictRound === 0, '③ 走 stall 路径时冲突计数归零（两条路径不互相污染）')
}

// ── ④ refreshActivity 只在正向进展为真 ──
{
  ok(planProbeOutcome(ev({ grew: true }), { stallRound: 0, conflictRound: 0 }, CFG).refreshActivity === true, '④ grew ⇒ 刷新活动')
  ok(planProbeOutcome(ev({ viaChildren: true }), { stallRound: 0, conflictRound: 0 }, CFG).refreshActivity === true, '④ viaChildren ⇒ 刷新活动')
  ok(planProbeOutcome(ev({ active: true }), { stallRound: 0, conflictRound: 0 }, CFG).refreshActivity === false, '④ conflict ⇒ **不**刷新（否则停滞计时永不推进 ⇒ 永睡不着）')
  ok(planProbeOutcome(ev(), { stallRound: 0, conflictRound: 0 }, CFG).refreshActivity === false, '④ 无增长 ⇒ **不**刷新')
  ok(planProbeOutcome(ev({ noTranscript: true }), { stallRound: 0, conflictRound: 0 }, CFG).refreshActivity === false, '④ 探针不可用 ⇒ 不刷新')
  ok(planProbeOutcome(ev({ alive: false }), { stallRound: 0, conflictRound: 0 }, CFG).refreshActivity === false, '④ 已退出 ⇒ 不刷新')
}

// ── ⑤ 布线 + 计数同寿 ──
{
  const probe = readFileSync(join(root, 'src', 'deepsleep-probe.ts'), 'utf8')
  const uses = (probe.match(/planProbeOutcome\s*\(/g) || []).length
  ok(uses >= 2, '⑤ `probeSession` 的所有出口均经决策表（含 noTranscript 出口）', `引用数=${uses}`)
  ok(!/if \(active\) \{/.test(probe), '⑤ 旧「if (active) 直接 return」形态已消除')
  ok(/outcome\.conflictRound/.test(probe), '⑤ conflictRound 由决策表输出并写回 rec')
  const machine = readFileSync(join(root, 'src', 'deepsleep-machine.ts'), 'utf8')
  ok(/rec\.conflictRound = 0/.test(machine), '⑤ noteEvent 复位 conflictRound（新事件 = 会话复活，与 stallRound 同清）')
  const scheduler = readFileSync(join(root, 'src', 'scheduler.ts'), 'utf8')
  const pcfg = readFileSync(join(root, 'src', 'probe-config.ts'), 'utf8')
  // S-P2b：探测域 8 键按**领域接缝**抽出到 probe-config.ts ⇒ 断言随之落在**新的单一事实源**上：
  //   ① `probeOptionsOf` 必须**显式**映射全部 8 键（防"schema 有 ≠ 运行时 config 有"）
  //   ② scheduler 必须**展开**该 schema 与映射（接线不得留空）
  const KEYS = ['deepSleepProbe', 'deepSleepProbeAfterMs', 'deepSleepProbeWindowMs', 'deepSleepProbeSamples', 'deepSleepProbeConfirm', 'deepSleepProbeConflictMax', 'deepSleepProbeRetries', 'deepSleepProbeMaxMs']
  const missingSchema = KEYS.filter((k) => !new RegExp(`\\b${k}:\\s*z\\.`).test(pcfg))
  ok(missingSchema.length === 0, '⑤ probe-config 声明全部 8 键 schema', `缺=${missingSchema.join(',') || '无'}`)
  const missingMap = KEYS.filter((k) => !new RegExp(`\\b${k}:\\s*config\\.${k}`).test(pcfg))
  ok(missingMap.length === 0, '⑤ probeOptionsOf **显式映射**全部 8 键（防 schema 有 ≠ 运行时 config 有）', `缺=${missingMap.join(',') || '无'}`)
  ok(/conflictMax:\s*Math\.max\(1,\s*Number\(config\.deepSleepProbeConflictMax\)/.test(probe) || /Number\(config\.deepSleepProbeConflictMax\)/.test(probe), '⑤ 决策表消费 config 的 conflictMax（阈值真进链路）')
  ok(/\.\.\.probeConfigSchema/.test(scheduler), '⑤ scheduler **展开**探测域 schema（接线不落空）')
  ok(/\.\.\.probeOptionsOf\(config\)/.test(scheduler), '⑤ scheduler **展开**探测域映射（接线不落空）')
}

console.log(P.join('\n'))
console.log(fail ? `\n❌ test-probe-outcome: ${fail} 条断言未通过` : `\n✅ test-probe-outcome: 全绿（${P.length} 条）`)
process.exit(fail ? 1 : 0)
