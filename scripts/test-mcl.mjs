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

// ── 场景 F：P2b 材料入 systemPrompt 段（materialInSystem=true）──
{
  const audit = []
  const blocks = []
  const handlers = new Map()
  const ctx = {
    on: (e, h) => { handlers.set(e, [...(handlers.get(e) || []), h]); return () => { /* dispose */ } },
    logger: { info: () => { /* */ } },
    systemPrompt: { context: (o) => { blocks.push(o); return () => { /* dispose */ } } },
    effect: (fn) => { fn(); return () => { /* dispose */ } },
  }
  const emit = (e, ...a) => { for (const h of handlers.get(e) || []) h(...a) }
  const fire = async (e, ...a) => { const hs = handlers.get(e) || []; let out = null; for (const h of hs) out = await h(...a); return out }
  const cfg = { ...baseCfg, materialInSystem: true }
  const mcl = registerMcl(ctx, cfg, { audit: (o) => audit.push(o), log: () => { /* */ } })
  ok(blocks.length === 1 && blocks[0].name === 'shoucang-mcl-material', 'F1 注册了 systemPrompt 块（shoucang-mcl-material）')
  ok(blocks[0].order === 89, 'F2 块序 89（热记忆 88 之后、memory 90 之前）')
  const sid = 'sess-p2b-1'
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '指针 分裂 结构 怎么搭树' }] } })
  const d1 = { kind: 'allow', messages: [userMsg('指针 分裂 结构 怎么搭树')] }
  const out = await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: d1.messages, step: 1 }, async () => d1)
  ok(out?.messages?.length === 1, 'F3 **消息面零插入**（材料不再进转录：1 → 1）')
  const step = audit.find((r) => r.kind === 'mcl-step' && r.channel === 'slow')
  ok(step?.viaSystem === 1, 'F4 审计行标记 viaSystem=1（材料去向可核）')
  ok(typeof step?.injected === 'number' && step.injected > 0, `F5 injected 仍记材料量（${step?.injected} 字符）`)
  const txt = String(blocks[0].text({ agent: { session: { id: sid } } }) || '')
  ok(txt.includes('认知环·慢通道'), 'F6 块按会话返回材料（含薄契约标记）')
  ok(String(blocks[0].text({ agent: { session: { id: 'other-sess' } } }) || '') === '', 'F7 别的会话取不到材料（不串话）')
  ok(String(blocks[0].text({}) || '') === '', 'F8 取不到会话 id ⇒ 空串（不抛）')
  // F9-F11（2026-09-13 补）：**块渲染计数**——把 P2b 的判据从"测不了"（合规率样本结构性稀疏，实测窗口 0/803）
  //   换成"当场可测"：块被渲染几次、其中几次带材料。这是"材料有没有真的进注入面"的直接答案。
  const st = mcl.status()
  ok(st.sysBlockCalls >= 3, `F9 块渲染计数在涨（sysBlockCalls=${st.sysBlockCalls} ≥ 3：F6/F7/F8 各一次）`)
  ok(st.sysBlockNonEmpty >= 1, `F10 其中带材料的次数（sysBlockNonEmpty=${st.sysBlockNonEmpty}：仅 F6 那次有材料）`)
  ok(st.sysBlockLastChars > 0 && st.materialInSystem === true, `F11 末次材料长度 ${st.sysBlockLastChars} 且 materialInSystem=true`)
}

// ── 场景 G：systemPrompt 不可用 ⇒ **回落消息面**（宁走旧路，不可静默失效）──
{
  const audit = []
  const { ctx, emit, fire } = mkCtx() // 无 systemPrompt 能力
  const cfg = { ...baseCfg, materialInSystem: true }
  registerMcl(ctx, cfg, { audit: (o) => audit.push(o), log: () => { /* */ } })
  ok(cfg.materialInSystem === false, 'G1 注册期回落：materialInSystem 被置 false（可见，不静默）')
  const sid = 'sess-p2b-fb'
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '指针 分裂 结构 怎么搭树' }] } })
  const d1 = { kind: 'allow', messages: [userMsg('指针 分裂 结构 怎么搭树')] }
  const out = await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: d1.messages, step: 1 }, async () => d1)
  ok(out?.messages?.length === 2, 'G2 回落后仍走消息面（1 → 2；认知环不因开关而失效）')
  const step = audit.find((r) => r.kind === 'mcl-step' && r.channel === 'slow')
  ok(step?.viaSystem === undefined && step?.injected > 0, 'G3 回落后审计无 viaSystem（如实反映去向）')
}

// ── 场景 H：**回引步也落账**（2026-09-13 补：原实现只在"未回引"分支写行 ⇒ 该率不可测）──
{
  const audit = []
  const { ctx, emit, fire } = mkCtx()
  registerMcl(ctx, { ...baseCfg }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-compliant-1'
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '指针 分裂 结构 怎么搭树' }] } })
  const d1 = { kind: 'allow', messages: [userMsg('指针 分裂 结构 怎么搭树')] }
  const out1 = await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: d1.messages, step: 1 }, async () => d1)
  const inj = audit.find((r) => r.kind === 'mcl-step' && Number(r.injected) > 0)
  if (inj && out1?.messages?.length === 2) {
    const material = String(out1.messages[1]?.content?.[0]?.text || '')
    const d2 = { kind: 'allow', messages: [userMsg('指针 分裂 结构 怎么搭树'), asstMsg(material)] }
    const out2 = await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: d2.messages, step: 2 }, async () => d2)
    ok(out2?.messages?.length === 2, 'H1 引用了材料 ⇒ 不再引导（messages 2 → 2）')
    const comp = audit.filter((r) => r.kind === 'mcl-step' && r.topicEcho === true)
    ok(comp.length === 1, 'H2 **回引步也落账**（topicEcho:true 有行——原实现只有 false 行 ⇒ 该率没有分母）')
    ok(comp[0]?.nudge === 0 && Array.isArray(comp[0]?.topics), 'H3 回引行字段齐（nudge=0 + topics：前后对比所需字段）')
  } else {
    console.log('⚠️  H1-H3 跳过：库内该 query 未召回材料（合规判定需主题词作判据）')
  }
}

// ── 场景 N：**默认审计钩子的落点**（DS4 第五刀 · 2026-09-13）──
//   MCL 审计已并入**统一台账**（type=`mcl.*`）。本场景**不给 audit 钩子**（走默认钩子）⇒ 真写盘到隔离 DSH_HOME，
//   断言：① 台账出现 `mcl.*` 行；② legacy `mcl-audit.jsonl` **不被创建**（这才是"改道"的实质）。
//   为什么必须单测：真机验证依赖**真实用户发言**（MCL 用结构判别 `isRealUserEvent`，自动轮消息被正确忽略）
//   ⇒ 不能靠"等一条真人消息"来证明；落点须由确定性用例守。
{
  const { existsSync, readFileSync, mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  // ⚠ **必须隔离**：本测试文件原先**没有环境隔离**（直接跑在真实 DSH_HOME 上），
  //   而"默认审计钩子会真写盘"⇒ 上一版直接往**真库台账**写了 4 行测试数据（已清 + 已备份）。
  //   纪律：**凡触发真写盘的用例，必须 mkdtemp 隔离 DSH_HOME 并在 finally 恢复**。
  const home = mkdtempSync(join(tmpdir(), 'sc-mcl-audit-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const handlers = new Map()
    const ctx = {
      on: (e, h) => { handlers.set(e, [...(handlers.get(e) || []), h]); return () => { /* dispose */ } },
      logger: { info: () => { /* */ } },
      systemPrompt: { context: () => () => { /* dispose */ } },
      effect: (fn) => { fn(); return () => { /* dispose */ } },
    }
    const emit = (e, ...a) => { for (const h of handlers.get(e) || []) h(...a) }
    const fire = async (e, ...a) => { const hs = handlers.get(e) || []; let out = null; for (const h of hs) out = await h(...a); return out }
    registerMcl(ctx, { ...baseCfg }, { log: () => { /* 无 audit ⇒ 默认钩子 */ } })
    const sid = 'sess-audit-dest'
    emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '指针 分裂 结构 怎么搭树' }] } })
    await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: [userMsg('指针 分裂 结构 怎么搭树')], step: 1 }, async () => ({ kind: 'allow', messages: [userMsg('指针 分裂 结构 怎么搭树')] }))
    const auditDir = join(home, 'suite', 'knowledge', 'audit')
    const ledger = join(auditDir, 'ledger.jsonl')
    const legacy = join(auditDir, 'mcl-audit.jsonl')
    const rows = existsSync(ledger)
      ? readFileSync(ledger, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
      : []
    const mclRows = rows.filter((r) => String(r.type || '').startsWith('mcl'))
    ok(mclRows.length > 0, `N1 **默认钩子写进统一台账**（mcl 行 ${mclRows.length} 条）`)
    ok(mclRows.some((r) => r.kind === 'mcl-step'), `N2 含 mcl-step（实测 kind=${mclRows.map((r) => r.kind).join('/') || '无'}）`)
    ok(mclRows.every((r) => typeof r.at === 'string' && r.at.length > 0), 'N3 每行都有非空 `at`（统一信封保证）')
    ok(!existsSync(legacy), 'N4 legacy `mcl-audit.jsonl` **未被创建**（改道的实质）')
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
    try { rmSync(home, { recursive: true, force: true }) } catch { /* 清理失败无害 */ }
  }
}

// ── 场景 O：**判定门竞态修正**（2026-09-13 §69）──
//   实测真机：子代理会话的 `user/message`（cap）**落在当轮 step 1 的 pre-step 之后**
//   ⇒ 旧门只认 `step === 1` ⇒ **整轮不判定**（slow=0 fast=0，材料永不产生）。
//   修正原理：**判定时机 = 消息到达后的第一个 pre-step**（限前 3 步内）。
{
  const { ctx, emit, fire } = mkCtx()
  const audit = []
  registerMcl(ctx, { ...baseCfg }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-gate-o'
  const pre = (step, msgs) => fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: msgs, step }, async () => ({ kind: 'allow', messages: msgs }))
  // ① 消息还没到 ⇒ 不判定（不瞎猜）
  await pre(1, [])
  ok(!audit.some((r) => r.kind === 'mcl-step'), 'O1 无任务文本 ⇒ 不判定')
  // ② 消息**晚于 step 1** 到达（真机实测形态）
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '指针 分裂 结构 怎么搭树' }] } })
  // ③ step 2：修正后**仍应判定**（修正前此处恒为 0）
  await pre(2, [userMsg('指针 分裂 结构 怎么搭树')])
  const stepped = audit.filter((r) => r.kind === 'mcl-step')
  ok(stepped.length >= 1, `O2 **消息晚到也判定**（修正前恒 0；实测 ${stepped.length} 条，channel=${stepped[0]?.channel || '无'}）`)
  // ④ 已判定过 ⇒ 后续步不得**重复注入**（防每步重注入）
  //   ⚠ 夹具判据曾写错：nudge/合规步**本就会**写 `mcl-step` 行（设计如此）⇒ 不能按"行数不变"断言。
  //   真正的不变量是"**不再注入**"（`injected > 0` 的条数不增）。
  const injCount = () => audit.filter((r) => r.kind === 'mcl-step' && Number(r.injected) > 0).length
  const before = injCount()
  await pre(3, [userMsg('指针 分裂 结构 怎么搭树')])
  ok(injCount() === before, `O3 同一轮内**不重复注入**（injected>0 条数 ${before} → ${injCount()}）`)
  // ⑤ 超出前 3 步 ⇒ 仍按"不打断"处理（老行为保留）
  const { ctx: ctx2, emit: emit2, fire: fire2 } = mkCtx()
  const audit2 = []
  registerMcl(ctx2, { ...baseCfg }, { audit: (o) => audit2.push(o), log: () => { /* */ } })
  const sid2 = 'sess-gate-late'
  emit2('session/event', { id: sid2 }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '指针 分裂 结构 怎么搭树' }] } })
  await fire2('agent/pre-step', { agent: { id: sid2, session: { header: {} } }, messages: [userMsg('指针 分裂 结构 怎么搭树')], step: 5 }, async () => ({ kind: 'allow', messages: [userMsg('指针 分裂 结构 怎么搭树')] }))
  ok(!audit2.some((r) => r.kind === 'mcl-step'), 'O4 第 5 步才来 ⇒ **不判定**（不中途打断，老行为保留）')
}

// ── 场景 P：**层二修复**——消息到达即判定，块在**首次渲染前**就能取到材料（2026-09-13 §70）──
//   真机病灶：块在请求装配时渲染、早于本步 pre-step ⇒ 材料"设了却渲染不到"（`injected>0` 而 `sysBlockNonEmpty=0`）。
//   修法：`session/event` 里**消息到达即判定**（同一 `decideTurn` 单一实现）。本场景的判据是：
//   **完全不跑 pre-step**，块也要能返回材料。
{
  const blocks = []
  const handlers = new Map()
  const ctx = {
    on: (e, h) => { handlers.set(e, [...(handlers.get(e) || []), h]); return () => { /* dispose */ } },
    logger: { info: () => { /* */ } },
    systemPrompt: { context: (o) => { blocks.push(o); return () => { /* dispose */ } } },
    effect: (fn) => { fn(); return () => { /* dispose */ } },
  }
  const emit = (e, ...a) => { for (const h of handlers.get(e) || []) h(...a) }
  const audit = []
  registerMcl(ctx, { ...baseCfg, materialInSystem: true }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-early-p'
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '指针 分裂 结构 怎么搭树' }] } })
  await new Promise((r) => setTimeout(r, 150)) // 等 cap 时的**异步**判定落定
  const step = audit.find((r) => r.kind === 'mcl-step' && r.channel === 'slow')
  ok(!!step && step.viaSystem === 1, `P1 **消息到达即判定**（没跑 pre-step 就有 mcl-step viaSystem=1；实测 ${step ? '有' : '无'}）`)
  const t = String(blocks[0]?.text({ agent: { id: sid, session: { id: sid } } }) || '')
  ok(t.includes('认知环·慢通道'), `P2 **块无需 pre-step 即可返回材料**（层二判据；实测 ${t.length} 字符）`)
}

// ── 场景 Q：**真机顺序**——`cap` 落在 pre-step **之后**，不得抹掉刚写的材料（2026-09-13 §71 根因）──
//   真机 `trace` 实测：`pre`(判定) → `set`(材料) → **`cap`** → 下一步 `ren` 读到 **0**。
//   根因是轮级重置 `state.delete(sid)` 把材料删了；旧夹具里 `cap` 总在 `set` **之前**，**从未覆盖真机顺序**。
{
  const blocks = []
  const handlers = new Map()
  const ctx = {
    on: (e, h) => { handlers.set(e, [...(handlers.get(e) || []), h]); return () => { /* dispose */ } },
    logger: { info: () => { /* */ } },
    systemPrompt: { context: (o) => { blocks.push(o); return () => { /* dispose */ } } },
    effect: (fn) => { fn(); return () => { /* dispose */ } },
  }
  const emit = (e, ...a) => { for (const h of handlers.get(e) || []) h(...a) }
  const fire = async (e, ...a) => { const hs = handlers.get(e) || []; let out = null; for (const h of hs) out = await h(...a); return out }
  const audit = []
  registerMcl(ctx, { ...baseCfg, materialInSystem: true }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-order-q'
  const txt = '指针 分裂 结构 怎么搭树'
  // ① 先 pre-step（消息尚未到达 ⇒ 由 decision.messages 兜底捕获）⇒ 判定并写入材料
  await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: [userMsg(txt)], step: 1 }, async () => ({ kind: 'allow', messages: [userMsg(txt)] }))
  ok(audit.some((r) => r.kind === 'mcl-step' && r.viaSystem === 1), 'Q0 pre-step 先判定（真机顺序的第一步）')
  // ② `user/message` 事件**才**到达 ⇒ 触发轮级重置（旧实现在此处删掉材料）
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: txt }] } })
  await new Promise((r) => setTimeout(r, 40))
  // ③ 下一次渲染：材料**必须还在**
  const t = String(blocks[0]?.text({ agent: { id: sid, session: { id: sid } } }) || '')
  ok(t.includes('认知环·慢通道'), `Q1 **cap 晚到不得抹掉材料**（本机真机根因的回归闸；实测 ${t.length} 字符）`)
}

// ── 场景 M3（2026-09-21 · 频率分离）：**每步判定 / 注入仅首步 / 环内换向出口幂等** ──
//   架构：完整判定（带嵌入、定通道）每轮一次 ⟷ 轻判定（零嵌入、折收益/换向）每步一次。
//   判据对应方案档 §12-A-M3-2（判定每步 · 注入仅首步）与 A-M3-3（换向出口端到端 · 同轮不重复）。
{
  const audit = []
  const { ctx, emit, fire } = mkCtx()
  const mcl = registerMcl(ctx, { ...baseCfg, maxNudges: 3 }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-m3-1'
  const txt = '指针 分裂 结构 怎么搭树'
  const noEcho = '好的，我先看看代码。' // 不回引主题词 ⇒ topicEcho=false ⇒ zeroGain 递增
  emit('session/event', { id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: txt }] } })
  // step1 注入；step2/3/4 每步都判（assistant 均不回引）
  for (const step of [1, 2, 3, 4]) {
    const msgs = step === 1 ? [userMsg(txt)] : [userMsg(txt), asstMsg(noEcho)]
    await fire('agent/pre-step', { agent: { id: sid, session: { header: {} } }, messages: msgs, step }, async () => ({ kind: 'allow', messages: msgs }))
  }
  const judgeRows = audit.filter((r) => r.kind === 'mcl-step' && r.phase === 'judge')
  const injectRows = audit.filter((r) => r.kind === 'mcl-step' && r.phase === 'inject')
  const nudgeRows = audit.filter((r) => r.kind === 'mcl-step' && r.phase === 'compliance' && r.nudge === 1)
  const switchRows = audit.filter((r) => r.kind === 'mcl-switch')
  ok(judgeRows.length >= 4, `M3-1 **每步都有判定行**（judge 行 ${judgeRows.length} ≥ 4 步）`)
  ok(injectRows.length === 1, `M3-2 **注入频率不动**（inject 行 ${injectRows.length} = 1，仅首步）`)
  ok(judgeRows.every((r) => typeof r.note === 'string' && r.note.length > 0), 'M3-3 每条判定行都带原因（不得只报数不报因）')
  ok(switchRows.length === 1, `M3-4 **环内换向出口有且仅一行**（mcl-switch ${switchRows.length}，期望 1）`)
  if (switchRows.length) ok(Number(switchRows[0].zeroGain) >= 2, `M3-5 出口触发于 zeroGain 达阈（实测 ${switchRows[0].zeroGain} ≥ 2）`)
  ok(nudgeRows.length <= 2, `M3-6 出过换向 ⇒ **不再对同源材料再引导**（nudge 行 ${nudgeRows.length} ≤ 2；原上限 3）`)
  ok(mcl.status().steps === 4, `M3-7 主链未被打断（steps=${mcl.status().steps}）`)
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
