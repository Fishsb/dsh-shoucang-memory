#!/usr/bin/env node
// test-deepsleep-wiring.mjs — 深睡层**迁出后**的接线与行为契约测试
//
// 为什么需要它：2026-09-12 把 1796 行深睡代码从 `distill.ts` 的巨型闭包搬到
//   `deepsleep-core.ts`（判据层）+ `deepsleep.ts`（状态机层）。搬移靠 typecheck 与既有门禁验证，
//   但**typecheck 只能证明类型对，不能证明「东西还在、还能用」**——
//   漏返回一个句柄、ctx 少注入一个字段、状态机初始化时炸掉，类型上都过得去。
//   ⇒ 本件用**全 mock 的 ctx** 直接驱动 `createDeepSleep`，验证：
//     ① 对外句柄齐全；② 状态机真的能跑（noteEvent → 状态迁移 → 快照可读）。
//
// 与既有件的分工：
//   · test-deepsleep-verdict.mjs —— 测**判据纯函数**（deepSleepLanded / planDeepSleepVerdict …）
//   · test-wiring-gate{,-ast}.mjs —— 锁**源码文本/AST 形状**（接线是否被改坏）
//   · 本件 —— 测**装配后的运行时行为**（句柄在不在、状态机动不动）
//
// 不依赖真实环境：全部 IO 依赖经 ctx 注入为 mock；auditFile 指向不存在路径（初始化读它有 try 兜底）。
import { createDeepSleep } from '../lib/deepsleep.js'

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

// ── 全 mock 的 DeepSleepCtx：任何一项漏注入，被用到的那一刻就会暴露 ──
const makeCtx = (over = {}) => ({
  log: () => {}, audit: () => {}, ledger: () => {},
  kRoot: '', auditFile: '', pendDir: '', candidateDir: '',
  PROFILE_HEADER: {}, capEnv: () => ({}),
  llmState: { providerFailCount: 0 },
  appCtx: {}, config: { deepSleepEnabled: true, deepSleepIdleMs: 1800000, deepSleepProbeAfterMs: 600000 },
  runNode: async () => ({ status: 0, out: '', err: '' }),
  textOf: () => '', embedCfgOf: () => ({}), probeScriptPath: '',
  distillAgent: async () => {},
  writeDispatch: async () => ({ added: 0, rejected: 0, failed: 0, targetLib: '' }),
  writeProfileLine: () => ({ st: 'added' }),
  validateProvider: () => {}, runSelfCheck: async () => null,
  resolveLlm: () => null, resolveDefaultModel: () => undefined, pickParent: () => null,
  parseAgentJson: () => ({}), normalizeProfileTarget: () => null,
  locateTranscript: async () => null, hasActiveSubagents: () => false,
  ensureDaemonParent: async () => null, bankSnapshot: async () => {},
  ...over,
})

console.log('── 深睡层装配契约（createDeepSleep 运行时行为）──')

// ① 装配本身不得抛（初始化若碰 IO/缺依赖，此处即红）
let ds = null
let bootErr = null
try { ds = createDeepSleep(makeCtx()) } catch (e) { bootErr = e }
ok(!bootErr, `① createDeepSleep 装配成功，不抛异常${bootErr ? `（${String(bootErr?.message ?? bootErr)}）` : ''}`)
if (!ds) { console.log(`\n结果: ${pass} PASS / ${fail} FAIL`); process.exit(1) }

// ② 对外句柄齐全 —— 少一个，distill 的装配点或面板的 share 就会静默断链
const HANDLES = ['DEEP_SLEEP_CHECK_MS', 'sessions', 'noteEvent', 'runDeepSleep', 'probeSession', 'deepSleepCheck', 'getDeepSleepStatus', 'runDeepSleepNow', 'getConfig']
for (const h of HANDLES) {
  const isFn = typeof ds[h] === 'function'
  ok(h === 'DEEP_SLEEP_CHECK_MS' ? ds[h] === 600000 : h === 'sessions' ? ds[h] instanceof Map : isFn,
    `② 句柄 ${h} ${h === 'DEEP_SLEEP_CHECK_MS' ? '= 600000（巡检间隔未被改动）' : h === 'sessions' ? '是 Map（disposed 钩子要清表）' : '可调用'}`)
}

// ③ 状态机**真的能跑**（不是只验形状）：noteEvent → 状态迁移 → 快照可读
// ⚠ 快照里的 sid 是**给 UI 显示的截断短串**（session- 开头取 slice(8,16)，否则 slice(0,8)）——
//   这是设计而非 bug，故查找用「原串包含短串」而非全等；用全等会永远匹配不上。
const sid = 'session-abcdefghijkl'
ds.noteEvent(sid, false)
let st = ds.getDeepSleepStatus()
let rec = (st?.sessions || []).find((s) => s.sid && sid.includes(s.sid))
ok(!!rec, '③ noteEvent(sid,false) 后在册（快照可见该会话）')
ok(rec?.state === 'running', `③ 任意事件 ⇒ RUNNING（实测 ${rec?.state}）`)

ds.noteEvent(sid, true)
st = ds.getDeepSleepStatus()
rec = (st?.sessions || []).find((s) => s.sid && sid.includes(s.sid))
ok(rec?.state === 'ended', `③ turn/end ⇒ ENDED，开始停滞计时（实测 ${rec?.state}）`)
ok(Number(rec?.lastEventAt) > 0, '③ lastEventAt 已写入（停滞计时的时间基准）')

// ④ 同一 sid 复用同一条记录（不泄漏、不重复入表）
const before = ds.sessions.size
for (let i = 0; i < 5; i++) ds.noteEvent(sid, false)
ok(ds.sessions.size === before, `④ 重复事件不新增会话记录（${before} → ${ds.sessions.size}）`)

// ⑤ 快照结构完整（面板 /deepsleep 视图直接消费这些字段，缺一个就是 UI 空白）
const need = ['enabled', 'idleMs', 'probeAfterMs', 'lastActivityAt', 'lastDeepSleepAt', 'running', 'ended', 'probing', 'suspect', 'stalled', 'nextEligibleAt', 'sessions']
const missing = need.filter((k) => !(k in st))
ok(missing.length === 0, `⑤ DeepSleepStatus 字段完整${missing.length ? `（缺 ${missing.join(',')}）` : `（${need.length} 项）`}`)
ok(Array.isArray(st.sessions), '⑤ sessions 是数组（面板按数组渲染）')

// ⑥ 多实例隔离：两个独立装配互不影响（证明状态没有被提到模块级共享）
const ds2 = createDeepSleep(makeCtx())
ds2.noteEvent('sid-other', false)
ok(ds2.sessions.size === 1 && !ds.sessions.has('sid-other'),
  '⑥ 两个实例状态隔离（未被提升为模块级共享可变状态）')

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
