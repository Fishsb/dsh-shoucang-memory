#!/usr/bin/env node
// test-idle-arm-wiring.mjs — 空闲蒸馏「武装」这一步的**行为级**接线契约（2026-09-14 立）
//
// 为什么需要它（本件的由来就是一次真实故障）：
//   `distill-hooks.ts` 的 turn/end 钩子曾写成 `agent.armIdleTimer(agent)`——把**绑定句柄**当宿主对象方法调。
//   宿主不提供该属性 ⇒ 每次 turn/end 抛 TypeError，被紧随的 `catch { }` 吞掉 ⇒ **空闲蒸馏全链失效两天**
//   （只剩 10min 周期扫尾，且只覆盖 live root）。而 typecheck / 单测 / wiring 门禁**全绿**：
//   它们都不驱动这一行。"导出函数接了线 ≠ 有效"（AGENTS.md 规则 6）。
//   ⇒ 本件用**全 mock 的 ctx** 真发一次 `session/event` turn/end，断言「状态机记 ENDED + 注入面被武装」同轮闭合，
//     并把「宿主 agent 上不存在 armIdleTimer」也写成断言——让旧形态在任何一天复活都当场翻红。
//
// 与既有件的分工：
//   · check-agent-methods.mjs —— 静态形态（绑定句柄不得以宿主对象方法形态调用）
//   · test-deepsleep-wiring.mjs / test-scheduler-wiring.mjs —— 各自领域的装配契约
//   · 本件 —— **turn/end → 武装** 这一步的运行时行为（含异常必须留痕）
//
// 不依赖真实环境：ctx 与依赖全 mock；`ctx.effect` 立即执行并马上 dispose（避免测试进程挂定时器）。
import { mountDistillEvents } from '../lib/distill-hooks.js'

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

/** 造一个 mock ctx：收集事件处理器；effect 立即执行并立刻释放（不留定时器） */
const makeCtx = (agent) => {
  const handlers = new Map()
  return {
    handlers,
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn) },
    effect(fn) { const d = fn(); if (typeof d === 'function') d(); return () => {} },
    agents: { get: (sid) => (agent && agent.id === sid ? agent : undefined), roots: () => (agent ? [agent] : []) },
    logger: { info: () => {} },
    emitTo(name, ...args) { for (const f of handlers.get(name) || []) f(...args) },
  }
}

const makeAgent = (id, origin) => ({ id, session: { header: { origin }, snapshotEvents: () => [] } })

/** 全 mock 依赖：只留本测试走到的面；其余给空实现（漏注入的那一项会在用到时炸出来） */
const makeDep = (over = {}) => {
  const calls = { armed: [], noteEvent: [], logs: [], parentSid: [] }
  const dep = {
    io: { infra: { log: (m) => calls.logs.push(String(m)), audit: () => {}, ledger: () => {}, sidShort: (s) => String(s).slice(0, 8) }, kRoot: '', SHORT: 'test' },
    dom: {
      write: { claimHeld: () => false, hasPendingUndigested: () => false, flushDeferCards: async () => {} },
      parent: {
        parentSidOf: () => { calls.parentSid.push(1); return null },
        noteChildActivity: () => {}, dropChild: () => {}, rememberAgent: () => {},
        hasActiveSubagents: () => false,
      },
      wm: { resolveWatermark: () => null, writeWatermark: () => {} },
      distill: {
        // ★ 被断言的那一项：修复后钩子必须走这里
        armIdleTimer: (agent) => { calls.armed.push(agent) },
        distillAgent: async () => {}, runDistillNow: async () => ({ ok: true }),
      },
      act: { activationStep: async () => {} },
      llm: { validateProvider: () => {}, locateTranscript: async () => null },
      bank: { runSelfCheck: async () => {}, bankSnapshot: () => ({}) },
    },
    state: { idleTimers: new Map(), distilling: new Set(), skipHoldStreak: new Map(), snapshotUnavailableStreak: new Map() },
    sleep: {
      sessions: new Map(),
      noteEvent: (sid, isTurnEnd) => calls.noteEvent.push([sid, isTurnEnd]),
      deepSleepCheck: () => {}, DEEP_SLEEP_CHECK_MS: 600000, getDeepSleepStatus: () => ({}),
    },
    env: { ctx: null, config: { idleWakeMs: 600000, selfCheck: false, enableDeepSleep: false, activationShadow: false, activationPrefetch: false } },
    calls,
  }
  return Object.assign(dep, over)
}

const mount = (agent, dep) => { const ctx = makeCtx(agent); dep.env.ctx = ctx; mountDistillEvents(ctx, dep); return ctx }

// ── ① 主链路：turn/end(completed) + 根会话 ⇒ 状态机记 ENDED 且**注入面被武装** ──
{
  const agent = makeAgent('s1', 'user')
  const dep = makeDep()
  const ctx = mount(agent, dep)
  ctx.emitTo('session/event', { id: 's1' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  ok(dep.calls.noteEvent.some(([s, t]) => s === 's1' && t === true), '状态机收到 turn/end → ENDED（noteEvent(s1,true)）')
  // ★★ 2026-09-14 修（**两个钩子抢同一事件** · 实测致睡眠长期被阻塞）：
  //   本文件与 `distill-hooks.ts:136` 的兜底钩子**同挂 `session/event`**，而兜底钩子把**任意**事件记为 RUNNING。
  //   对 `turn/end` 这个事件：专用钩子先置 `ended`（停滞计时起点），兜底钩子**紧接着覆盖回 `running`**
  //   （注册序在后）⇒ **会话永不到 ended**。后果（真机实测）：任务完成后仍算"活跃" ⇒ 45min 后触发
  //   「输出增长探测」⇒ 而转录是**批量落盘**（实测活跃会话 105 秒文件 size/mtime 零变化，
  //   DSH 持久化 README 原文 "Live-event write batching is not configuration"）⇒ 判 `suspect`
  //   ⇒ **阻塞睡眠**（`write.consolidate` 末条停在 09-13T10:17，>24h 未产出）。
  //   语义要求（用户拍板）：**任务执行完成 ⇒ 停滞 / 等待蒸馏**，不得被兜底钩子复活。
  ok(dep.calls.noteEvent.filter(([s]) => s === 's1').length === 1 && !dep.calls.noteEvent.some(([s, t]) => s === 's1' && t === false), `turn/end 只产生**一次** noteEvent 且 isTurnEnd=true（兜底钩子不得覆盖回 running；实测 ${JSON.stringify(dep.calls.noteEvent)}）`)
  ok(dep.calls.armed.length === 1 && dep.calls.armed[0] === agent, '空闲定时器经**注入面**被武装一次，入参是 agent 本身')
  // 把病灶钉成断言：旧形态 `agent.armIdleTimer(agent)` 之所以必抛，就是因为宿主 agent 没有这个属性
  ok(typeof agent.armIdleTimer === 'undefined', '宿主 agent 上**不存在** armIdleTimer（旧形态必抛 TypeError ⇒ 本断言守住复辟）')
  ok(!dep.calls.logs.some((m) => m.includes('turn/end 钩子异常')), '正常路径不产生异常日志')
}

// ── ② 异常必须**留痕**（旧代码此处是 `catch { }`，把断链静默成"从未武装"）──
{
  const agent = makeAgent('s2', 'user')
  const dep = makeDep()
  dep.sleep.noteEvent = () => { throw new Error('boom-noteEvent') }
  const ctx = mount(agent, dep)
  let threw = false
  try { ctx.emitTo('session/event', { id: 's2' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } }) } catch { threw = true }
  ok(!threw, '钩子异常零外抛（不污染事件循环）')
  ok(dep.calls.logs.some((m) => m.includes('turn/end 钩子异常') && m.includes('boom-noteEvent')), '异常被记入日志（含 sid 与原因）⇒ 断链可观测')
}

// ── ③ 子代理 turn/end **不武装**（父会话仍在干活，武装会抢跑）──
{
  const agent = makeAgent('s3', 'subagent')
  const dep = makeDep()
  const ctx = mount(agent, dep)
  ctx.emitTo('session/event', { id: 's3' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  ok(dep.calls.armed.length === 0, 'origin=subagent 不武装空闲定时器')
  // 注：`session/event` 有**两个**钩子（本钩子管武装，第二个钩子管活性追踪），两者都会走父子链记账
  ok(dep.calls.parentSid.length >= 1, 'origin=subagent 走父子链记账分支')
}

// ── ④ 非 completed 的 turn/end **不武装**（中断/出错不算"空闲起点"）──
{
  const agent = makeAgent('s4', 'user')
  const dep = makeDep()
  const ctx = mount(agent, dep)
  ctx.emitTo('session/event', { id: 's4' }, { type: 'turn/end', data: { reason: { kind: 'aborted' } } })
  ok(dep.calls.armed.length === 0, 'reason.kind=aborted 不武装')
  // 判据锚在**turn/end 的那一条**（isTurnEnd=true）：aborted 不得记 ENDED，
  //   但第二个钩子（活性追踪）仍应记一条普通活动（否则中断后会话会被误判为无活性）。
  ok(!dep.calls.noteEvent.some(([s, t]) => s === 's4' && t === true), 'reason.kind=aborted 不记 ENDED')
  ok(dep.calls.noteEvent.some(([s, t]) => s === 's4' && t === false), 'aborted 仍由活性钩子记一条普通活动（RUNNING）')
}

// ── ⑤ agent 不在册（已卸载）**不武装**，且不抛 ──
{
  const dep = makeDep()
  const ctx = makeCtx(null)
  dep.env.ctx = ctx
  mountDistillEvents(ctx, dep)
  ctx.emitTo('session/event', { id: 'ghost' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  ok(dep.calls.armed.length === 0, 'agent 不在册（已卸载）不武装')
}

console.log(`\n${fail === 0 ? '✅' : '❌'} test-idle-arm-wiring: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
