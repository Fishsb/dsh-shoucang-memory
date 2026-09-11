#!/usr/bin/env node
// test-mcl.mjs — 认知环（MCL，ACT-029）确定性回归：假 ctx + 合成事件驱动 **编译产物** lib/mcl.js。
// 覆盖：① session/event 任务文本捕获 ② 首步慢通道注入（薄契约 + 指针，受预算约束）
//        ③ 合规机检 + 有界再引导（=maxNudges 后放行）④ 快通道零注入（阈值 0 + 高置信命中）
//        ⑤ 中途步不插材料（late-step skip）⑥ 子代理会话不引导 ⑦ 审计行形状 ⑧ 零抛出（异常不打断）
// 用法: node scripts/test-mcl.mjs
import { registerMcl } from '../lib/mcl.js'

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`✅ ${msg}`) } else { fail++; console.log(`❌ ${msg}`) } }

const mkCtx = () => {
  const handlers = new Map()
  return {
    ctx: { on: (e, h) => { handlers.set(e, [...(handlers.get(e) || []), h]); return () => { /* dispose */ } }, logger: { info: () => { /* */ } } },
    emit: (e, ...args) => { for (const h of handlers.get(e) || []) h(...args) },
    fire: async (e, ...args) => { const hs = handlers.get(e) || []; let out = null; for (const h of hs) out = await h(...args); return out },
  }
}
const userMsg = (text) => ({ id: 'u1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
const asstMsg = (text) => ({ id: 'a1', role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model' } })
const baseCfg = { enabled: true, familiarThreshold: 0.65, maxNudges: 1, budgetChars: 600, topK: 3, audit: true, embed: { enabled: false, baseUrl: '', model: '', apiKeyEnv: '' } }

// ── 场景 A：慢通道（阈值 0.65 + 无嵌入 ⇒ sim=0 < 阈值 ⇒ 必然慢通道）──
{
  const audit = []
  const { ctx, emit, fire } = mkCtx()
  const mcl = registerMcl(ctx, { ...baseCfg }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-slow-1'
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '指针 分裂 结构 怎么搭树' }] } })
  const d1 = { kind: 'allow', messages: [userMsg('指针 分裂 结构 怎么搭树')] }
  const out1 = await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: d1.messages, step: 1 }, async () => d1)
  ok(out1?.messages?.length === 2, 'A1 慢通道首步注入了 1 条材料消息（messages 1 → 2）')
  const inj = String(out1?.messages?.[1]?.content?.[0]?.text || '')
  ok(inj.includes('认知环·慢通道'), 'A2 注入内容含薄契约标记「认知环·慢通道」')
  ok(inj.length <= 900, `A3 注入体量有界（${inj.length} 字符 ≤ 900，预算 ${baseCfg.budgetChars}+契约）`)
  ok(out1?.messages?.[1]?.source?.form === 'recall', 'A4 消息源 = {kind:plugin, form:recall}（DSH 官方语义位）')
  const injRow = audit.find((r) => r.kind === 'mcl-step' && Number(r.injected) > 0)
  const topics = Array.isArray(injRow?.topics) ? injRow.topics : []

  if (topics.length) {
    // 再引导：step2 的 assistant 未引用材料主题词 → 注入 nudge（第 1 次 = maxNudges）
    const d2 = { kind: 'allow', messages: [userMsg('指针 分裂 结构 怎么搭树'), asstMsg('好的，我先看看代码。')] }
    const out2 = await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: d2.messages, step: 2 }, async () => d2)
    ok(out2?.messages?.length === 3, `A5 未引用材料（主题=${topics.slice(0, 2).join('/')}）→ 触发再引导（messages 2 → 3）`)
    ok(String(out2?.messages?.[2]?.content?.[0]?.text || '').includes('再引导 1/1'), 'A6 再引导文案标注 1/1（有界）')
    // 上限：step3 仍不合规 → 放行（不再引导）
    const d3 = { kind: 'allow', messages: [userMsg('指针 分裂 结构 怎么搭树'), asstMsg('继续看代码。')] }
    const out3 = await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: d3.messages, step: 3 }, async () => d3)
    ok(out3?.messages?.length === 2, 'A7 超过 maxNudges → 放行（不再注入，绝不死锁）')
    const stt = mcl.status()
    ok(stt.slow === 1 && stt.injected === 1 && stt.nudged === 1, `A8 计数正确（slow=${stt.slow} injected=${stt.injected} nudged=${stt.nudged}）`)
  } else {
    console.log('⚠️  A5-A8 跳过：库内该 query 未召回带主题的索引行（再引导需主题词作合规判据）')
  }
  ok(audit.some((r) => r.kind === 'mcl-ready') && audit.some((r) => r.kind === 'mcl-step' && r.channel === 'slow' && r.injected > 0), 'A9 审计行含 mcl-ready + 慢通道注入行')
  ok(mcl.status().steps >= 1, `A10 steps 随钩子调用递增（steps=${mcl.status().steps}）`)
}

// ── 场景 B：快通道（阈值 0 + 命中 [路径]/[原则] ⇒ 零注入）──
{
  const audit = []
  const { ctx, emit, fire } = mkCtx()
  registerMcl(ctx, { ...baseCfg, familiarThreshold: 0 }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-fast-1'
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '记忆 指针 树 怎么搭' }] } })
  const d = { kind: 'allow', messages: [userMsg('记忆 指针 树 怎么搭')] }
  const out = await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: d.messages, step: 1 }, async () => d)
  const stepRow = audit.find((r) => r.kind === 'mcl-step')
  if (stepRow && stepRow.channel === 'fast') {
    ok(out?.messages?.length === 1, 'B1 快通道零注入（messages 不变）')
    ok(stepRow.injected === 0, 'B2 快通道审计 injected=0')
  } else {
    console.log('⚠️  B1/B2 跳过：库内未召回 [路径]/[原则] 高置信行（快通道条件不成立）')
  }
}

// ── 场景 C：中途步（未定通道）不插材料 ──
{
  const audit = []
  const { ctx, emit, fire } = mkCtx()
  registerMcl(ctx, { ...baseCfg }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-late-1'
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '把插件打包发布到 github' }] } })
  const d = { kind: 'allow', messages: [userMsg('把插件打包发布到 github')] }
  const out = await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: d.messages, step: 4 }, async () => d)
  ok(out?.messages?.length === 1, 'C1 中途步（step=4）不插材料')
  ok(audit.some((r) => r.kind === 'mcl-skip' && r.reason === 'late-step'), 'C2 记一次 late-step skip（可观测）')
}

// ── 场景 D：子代理会话不引导 + 宿主注入块不算任务文本 ──
{
  const audit = []
  const { ctx, emit, fire } = mkCtx()
  registerMcl(ctx, { ...baseCfg }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-sub-1'
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'agent-instructions' }, content: [{ type: 'text', text: 'Current runtime context. This snapshot supersedes…' }] } })
  const d = { kind: 'allow', messages: [userMsg('你是架构档重生成子代理（工具：read / write）')] }
  const out = await fire('agent/pre-step', { agent: { id: sid, session: { header: { origin: 'subagent' } } }, messages: d.messages, step: 1 }, async () => d)
  ok(out?.messages?.length === 1, 'D1 子代理会话不引导')
  ok(!audit.some((r) => r.kind === 'mcl-step'), 'D2 宿主注入块（kind=agent-instructions）不计入任务文本 → 无 mcl-step')
}

// ── 场景 E：零抛出（next() 抛错 / 决策 reject 均不打断）──
{
  const { ctx, fire } = mkCtx()
  registerMcl(ctx, { ...baseCfg }, { audit: () => { /* */ }, log: () => { /* */ } })
  const out1 = await fire('agent/pre-step', { agent: { id: 'x' }, messages: [], step: 1 }, async () => { throw new Error('boom') })
  ok(out1 === null, 'E1 next() 抛错 → 返回 null（不抛给宿主）')
  const dec = { kind: 'reject', messages: [] }
  const out2 = await fire('agent/pre-step', { agent: { id: 'x', session: { header: {} } }, messages: [], step: 1 }, async () => dec)
  ok(out2 === dec, 'E2 决策为 reject → 原样透传（不干涉拒绝路径）')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
