#!/usr/bin/env node
// test-mcl-race.mjs — **E-05 回归：MCL 幂等闸的原子性**（同一轮只许判一次）
//
// 判因（2026-09-21 真机取证，见 `docs/OPEN-ITEMS.md` §0q）：
//   `decideTurn` 的幂等闸原为 `if (st.channel) return none`，而 `st.channel` 直到**函数尾部**才赋值，
//   中间隔着两个 await（`:497` 融合召回 + `:504` 语义相似度）⇒ 两条入口可**同时越过**闸门：
//     ① `session/event` 的 `user/message` **早判**（`fire-and-forget void`，step 硬编码 1；仅 system 段模式启用）
//     ② `agent/pre-step`（其 `if (!st.channel)` **同样跨 await**）
//   真机实测：1859 组重复判定 / 1655 sid / 3997 次多跑（双注入 0 组，被 SupplyLedger 兜住）。
//
// **判据设计（为什么这样写）**：端到端触发**复现不了竞态** —— 实测在**修复前**也 PASS（embed 关闭时
//   微任务时序让早判先跑完）。故主判据改为 **同步连调两次 `decideTurn`**：第二次调用时第一次**必然**
//   还没越过首个 await ⇒ 闸门若不原子则**必定**放行两次 ⇒ **确定性先红**（修复前 E1 必红）。
// 用法: node scripts/test-mcl-race.mjs
import { registerMcl, decideTurn } from '../lib/mcl.js'
import { createSupplyLedger } from '../lib/supply-ledger.js'

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`✅ ${msg}`) } else { fail++; console.log(`❌ ${msg}`) } }

const TEXT = '指针 分裂 结构 怎么搭树'
const CFG = {
  enabled: true, familiarThreshold: 0.65, maxNudges: 1, budgetChars: 600, topK: 3, audit: true,
  materialInSystem: true,
  embed: { enabled: false, baseUrl: '', model: '', apiKeyEnv: '' },
}
const mkDeps = (sid) => ({
  cfg: { ...CFG, embed: { ...CFG.embed } },
  counters: { steps: 0, fast: 0, slow: 0, injected: 0, dupSkipped: 0, nudged: 0, lastAt: 0, lastChannel: '', lastSim: 0 },
  state: new Map(),
  taskText: new Map([[sid, TEXT]]),
  ledger: createSupplyLedger(),
  hooks: { audit: () => { /* */ }, log: () => { /* */ } },
  tools: {
    material: () => ({ text: '材料占位', topics: ['占位主题'], signals: [] }),
    judge: () => false,
    mkMsg: (text) => ({ id: 'm-race', role: 'user', content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'shoucang-mcl', form: 'recall' } }),
  },
})

// ── E1–E3：**主判据** —— 同步连调两次（确定性：第二次必然在第一次的首个 await 之前进入）──
{
  const sid = 'sess-race-core'
  const deps = mkDeps(sid)
  const [r1, r2] = await Promise.all([decideTurn(deps, sid, 1), decideTurn(deps, sid, 1)])
  const decided = [r1, r2].filter((r) => r.decided).length
  console.log(`   核心：r1.decided=${r1.decided} r2.decided=${r2.decided} · counters.slow=${deps.counters.slow} slow+fast=${deps.counters.slow + deps.counters.fast}`)
  ok(decided === 1, `E1 同刻两次判定 ⇒ **恰好一次真判**（实得 ${decided}，期望 1）← 修复前此处必红（得 2）`)
  ok(r2.decided === false && r2.channel === '', 'E2 被闸门挡住的那次返回幂等语义（decided=false / channel=""）')
  ok(deps.counters.slow + deps.counters.fast === 1, `E3 计数器只加一次（实得 ${deps.counters.slow + deps.counters.fast}，期望 1）`)
  // E4：占位必须在落定后**释放**（否则该会话从此再不判定）
  const r3 = await decideTurn(deps, sid, 2)
  ok(r3.decided === false, 'E4 已判定 ⇒ 后续步仍被拦（channel 幂等生效，非因占位卡死）')
  const st = deps.state.get(sid)
  ok(st && st.deciding === false, `E5 占位已释放（deciding=${st && st.deciding}）—— 否则异常路径会把会话永久锁死`)
}

// ── E6–E9：端到端（真钩子路径；不作先红判据，只防回归）──
{
  const handlers = new Map()
  const ctx = { on: (e, h) => { handlers.set(e, [...(handlers.get(e) || []), h]); return () => { /* */ } }, logger: { info: () => { /* */ } } }
  const audit = []
  const mcl = registerMcl(ctx, { ...CFG, embed: { ...CFG.embed } }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-race-e2e'
  const um = { id: 'u1', role: 'user', content: [{ type: 'text', text: TEXT }], source: { kind: 'user' } }
  for (const h of handlers.get('session/event') || []) h({ id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: TEXT }] } })
  for (const h of handlers.get('agent/pre-step') || []) await h({ agent: { id: sid, session: { header: {} } }, messages: [um], step: 1 }, async () => ({ kind: 'allow', messages: [um] }))
  await new Promise((r) => setTimeout(r, 400))
  const st = mcl.status()
  const decided = Number(st.fast) + Number(st.slow)
  const injRows = audit.filter((r) => r.kind === 'mcl-step' && r.phase === 'inject')
  console.log(`   端到端：fast=${st.fast} slow=${st.slow} injected=${st.injected} · 注入类审计行=${injRows.length}`)
  ok(decided === 1, `E6 端到端一轮只判一次（${decided}，期望 1）`)
  ok(injRows.length === 1, `E7 注入类审计行唯一（${injRows.length}，期望 1）`)
  ok(Number(st.injected) <= 1, `E8 注入计数 ≤1（${st.injected}）`)
  ok(Number(st.steps) >= 1, `E9 钩子仍被调用（steps=${st.steps}，证明改造未打断主链）`)
}

console.log(fail ? `\nFAIL（${fail} 项）` : `\nPASS（${pass} 项）`)
process.exit(fail ? 1 : 0)
