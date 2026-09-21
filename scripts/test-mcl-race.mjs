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
import { registerMcl, decideTurn, shouldResetTurn } from '../lib/mcl.js'
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

// ── E10（2026-09-21 · P2 真机归因）：**「先判后 cap」不得让同一轮判两次** ──
//   真机时序（**本机宿主固有顺序**，`mcl.ts:236` 已记载）：`pre-step(step1)` 先跑并判定 ⇒ **随后** `user/message` 才到达。
//   此时 `captureTaskText` 的轮级重置把 `channel` 清空 ⇒ **早判入口再判一次** ⇒ 同一轮两条 `inject` 行。
//   真机实证：`20:06:47.403 / .537`（同 sid·step·sim=0.589，134ms 差）与 `19:37:38.246 / .367` 同形；
//   两对**都落在 step 1**、`mcl-ready` 只一条 ⇒ **不是并发竞态**，而是**顺序性重复**。
//   ⚠ 因此 **E-05 的 `deciding` 闸对它无效**（两次调用不重叠）—— 这正是 E-05 修复后仍见重复的原因。
{
  const handlers = new Map()
  const ctx = { on: (e, h) => { handlers.set(e, [...(handlers.get(e) || []), h]); return () => { /* */ } }, logger: { info: () => { /* */ } } }
  const audit = []
  const mcl = registerMcl(ctx, { ...CFG, embed: { ...CFG.embed } }, { audit: (o) => audit.push(o), log: () => { /* */ } })
  const sid = 'sess-cap-late'
  const txt = '指针 分裂 结构 怎么搭树'
  const um = { id: 'u1', role: 'user', content: [{ type: 'text', text: txt }], source: { kind: 'user' } }
  // ① **先** pre-step（消息尚未到达 ⇒ 由 `decision.messages` 兜底捕获并判定）
  for (const h of handlers.get('agent/pre-step') || []) await h({ agent: { id: sid, session: { header: {} } }, messages: [um], step: 1 }, async () => ({ kind: 'allow', messages: [um] }))
  // ② **随后** `user/message` 才到达（真机顺序）⇒ 触发轮级重置 + 早判入口
  for (const h of handlers.get('session/event') || []) h({ id: sid }, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: txt }] } })
  await new Promise((r) => setTimeout(r, 400))
  const inj = audit.filter((r) => r.kind === 'mcl-step' && r.phase === 'inject')
  const ready = audit.filter((r) => r.kind === 'mcl-ready')
  console.log(`   先判后 cap：inject 行 ${inj.length} · mcl-ready ${ready.length} · audit kinds=${audit.map((r) => r.kind).join(',')}`)
  console.log(`   trace=${(mcl.status().trace || []).map((t) => String(t).split('|')[1]).join(' ')}`)
  /* ⚠ **诚实标注**：本件**在修复前也通过**（夹具里早判入口的 `void decideTurn` 被其 `.catch` 静默吞掉，
   *   复现不出真机时序）⇒ **本件不作"先红"证据**，只守不变量。真机证据见 `docs/OPEN-ITEMS.md §0s`
   *   与 §13-P2：`20:06:47.403/.537`、`19:37:38.246/.367` 两对同 sim 的 inject 行（都在 step 1）。 */
  ok(inj.length === 1, `E10 **先判后 cap 仍只判一次**（inject 行 ${inj.length}，期望 1；本件守不变量、非先红）`)
}

// ── E11（2026-09-21 · P2）：**轮级重置判据**（纯函数 · 可机检）──
{
  ok(shouldResetTurn('同一任务文本', '同一任务文本') === false, 'E11a **同文本 ⇒ 不重置**（真机"先判后 cap"即此形）')
  ok(shouldResetTurn('旧任务文本', '新任务文本') === true, 'E11b 换文本 ⇒ 重置（新任务语义不得破）')
  ok(shouldResetTurn(undefined, '首个任务') === true, 'E11c 首次捕获 ⇒ 重置（真值表含空）')
}

console.log(fail ? `\nFAIL（${fail} 项）` : `\nPASS（${pass} 项）`)
process.exit(fail ? 1 : 0)
