#!/usr/bin/env node
// test-deepsleep-phase.mjs — S3-6「深睡当前阶段」派生断言（2026-09-14 · S3 维护链条）
//
// 守什么：`getDeepSleepStatus().phase` 的**七个取值互斥且全部可达**，且**全部由既有字段派生**
//   （零新采集、零跨源依赖）。
//
// 历史动机：此前 UI 只有一堆计数（`running`/`ended`/`probing`/`suspect`/`stalled`）与 `lastDeepSleepAt`，
//   **无法一眼判断**「没开 / 正在跑 / 在探测 / 会话还活着 / 可睡 / 只是还没到点 / 根本没会话」——
//   排障要靠人拼字段（`eda-architecture-audit` F1 的"深睡被阻塞 >24h"正是这样被漏掉的）。
//
// 用法: node scripts/test-deepsleep-phase.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/deepsleep-machine.js', import.meta.url).href)
const { getDeepSleepStatus } = mod
if (typeof getDeepSleepStatus !== 'function') {
  console.log('❌ lib/deepsleep-machine.js 未导出 getDeepSleepStatus（先 npm run build:host）')
  process.exit(1)
}

/** 造最小机器快照（只喂 `getDeepSleepStatus` 实际读到的字段 —— 零多余依赖） */
const mk = (opts = {}) => {
  const dep = {
    config: { enableDeepSleep: opts.enabled !== false, deepSleepIdleMs: 1000, deepSleepProbeAfterMs: 1000 },
    ctx: { agents: { get: () => ({}) } },
  }
  const m = { sessions: new Map(), lastActivityAt: 0, lastDeepSleepAt: 0, deepSleepRunning: !!opts.running }
  for (const [sid, state] of Object.entries(opts.sessions || {})) {
    m.sessions.set(sid, { sid, state, lastEventAt: 0, lastEndAt: 0 })
  }
  return { dep, m }
}
const phaseOf = (opts) => { const { dep, m } = mk(opts); return getDeepSleepStatus(dep, m).phase }

console.log('S3-6 深睡当前阶段（派生）')

// ── ①-⑦ 七个取值逐个可达 ──
ok(phaseOf({ enabled: false }) === 'disabled', '① 开关关 ⇒ disabled（最优先：其余状态此时都无意义）')
ok(phaseOf({ running: true, sessions: { a: 'stalled' } }) === 'running', '② 正在跑 ⇒ running（压过其余）')
ok(phaseOf({ sessions: { a: 'probing' } }) === 'probing', '③ 有 probing ⇒ probing（在探测）')
ok(phaseOf({ sessions: { a: 'suspect' } }) === 'probing', '③ 有 suspect（待复核）⇒ 同归 probing（对观察者都是"在确认"）')
ok(phaseOf({ sessions: { a: 'running' } }) === 'active', '④ 会话活跃 ⇒ active（长线任务在跑，不该睡）')
ok(phaseOf({ sessions: { a: 'stalled' } }) === 'eligible', '⑤ 有 stalled ⇒ eligible（本轮可睡）')
ok(phaseOf({ sessions: { a: 'ended' } }) === 'waiting', '⑥ 有 ended 未达阈值 ⇒ waiting（等停滞计时）')
ok(phaseOf({}) === 'idle', '⑦ 无在册会话 ⇒ idle')

// ── ⑧ 优先级 ──
ok(phaseOf({ sessions: { a: 'probing', b: 'running' } }) === 'probing', '⑧ 优先级：probing > active')
ok(phaseOf({ sessions: { a: 'stalled', b: 'ended' } }) === 'eligible', '⑧ 优先级：eligible > waiting')
ok(phaseOf({ enabled: false, running: true }) === 'disabled', '⑧ 优先级：disabled 压过一切')
ok(phaseOf({ running: true, sessions: { a: 'probing' } }) === 'running', '⑧ 优先级：running > probing')

// ── ⑨ 互斥与完整性 ──
const ALL = ['disabled', 'running', 'probing', 'active', 'eligible', 'waiting', 'idle']
const seen = new Set([
  phaseOf({ enabled: false }), phaseOf({ running: true }), phaseOf({ sessions: { a: 'probing' } }),
  phaseOf({ sessions: { a: 'running' } }), phaseOf({ sessions: { a: 'stalled' } }),
  phaseOf({ sessions: { a: 'ended' } }), phaseOf({}),
])
ok(seen.size === ALL.length, `⑨ 七个取值全部可达（实测 ${seen.size} 个，无死分支）`)
ok(ALL.every((p) => seen.has(p)), '⑨ 取值集合与类型定义一致（无未声明值）')
const inEnum = [...seen].every((p) => ALL.includes(p))
ok(inEnum, '⑨ 派生值全部落在类型枚举内（不产生"野生"阶段值）')

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（深睡阶段派生断言全过）')
process.exit(fail ? 1 : 0)
