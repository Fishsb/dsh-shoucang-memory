#!/usr/bin/env node
// test-scheduler-wiring.mjs — scheduler 工具装配的**黑盒契约测试**
//
// 为什么需要它：2026-09-12 把 `applyScheduler`（430 行巨型闭包）拆成 5 个 xxxTool() 工厂
//   + distillOptionsOf / schedulerShareApiOf / assembleMcl。typecheck 全绿只能证明类型对，
//   证明不了「五个工具还在、名字没变、开关语义没变」。深睡那次就是补在重构**之后**（不理想），
//   这次虽然同样补在之后，但至少把它登记进 CHECKS（规则 6）。
//
// 与既有件分工：
//   · test-deepsleep-wiring.mjs —— 深睡层装配后的运行时行为（同型，本件照它的写法）
//   · 本件 —— scheduler 的**装配面**：注册了哪些工具、开关语义、share 装配面字段
//
// 不依赖真实环境：DSH_HOME / MEMORY_ROOT 指向临时目录（applySuiteConfigFile 会读
//   $DSH_HOME/suite/scheduler.json 覆盖 Config —— 不隔离的话测试会被宿主的持久配置污染，
//   verify_enabled 可能被悄悄改掉 ⇒ 断言变得不确定）。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { register } from 'node:module'

// ⚠ 必须 stub `@deepseek-ai/dsh-tools`：它依赖的 `@deepseek-ai/dsh-scope` **不在开发机**，
//   只在 DSH 宿主运行时提供 ⇒ 直接 import lib/scheduler.js 会 ERR_MODULE_NOT_FOUND。
//   用解析钩子把该 specifier 重定向到一个 data: URL 的极简 stub（defineTool = 恒等），
//   这样既不用往 node_modules 塞东西，也不用多建文件。
//   ⚠ 副作用面：只影响本进程的后续解析，且只重定向这一个 specifier。
register('./test-dsh-tools-hook.mjs', import.meta.url)

const tmp = mkdtempSync(join(tmpdir(), 'sc-sched-'))
process.env.DSH_HOME = tmp
process.env.MEMORY_ROOT = join(tmp, 'memory')

const { applyScheduler } = await import('../lib/scheduler.js')
const { schedulerShare } = await import('../lib/scheduler-share.js')

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

const makeCtx = () => {
  const registered = []
  return {
    registered,
    tools: { register: (t) => { registered.push(t); return () => {} }, schemas: () => [] },
    effect: (fn) => { try { fn() } catch (e) { throw e } },
    on: () => () => {},
    logger: { warn: () => {}, info: () => {} },
  }
}
// 只给被读取到的键；不给的走 undefined ⇒ 缺省分支
const baseConfig = (over = {}) => ({
  verify_enabled: true, enableDistill: false, mclEnabled: false, embedEnabled: false,
  capAgent: 8, capUser: 8, capMemory: 40, llmProvider: '', llmModel: '',
  distillProvider: '', distillModel: '', sleepProvider: '', sleepModel: '',
  idleWakeMs: 1000, minTurnChars: 10, distillPrescan: false,
  ...over,
})
const names = (ctx) => ctx.registered.map((t) => t?.name).filter(Boolean)

console.log('── scheduler 装配契约（applyScheduler 黑盒）──')

// ① 装配不抛
let bootErr = null
let ctx = makeCtx()
try { applyScheduler(ctx, baseConfig()) } catch (e) { bootErr = e }
ok(!bootErr, `① applyScheduler 装配成功，不抛异常${bootErr ? `（${String(bootErr?.message ?? bootErr)}）` : ''}`)

// ② 五个工具全部在册，且名字未变（改名 = 调用方全断，属破坏性变更）
const WANT = ['shoucang_suite', 'shoucang_verify', 'shoucang_targets_probe', 'shoucang_recall', 'assistant_capabilities']
const got = names(ctx)
for (const n of WANT) ok(got.includes(n), `② 工具 ${n} 已注册`)
ok(got.length === WANT.length, `② 无多余/重名工具（实测 ${got.length} 个：${got.join(', ')}）`)

// ③ 每个工具的形状完整（缺 execute ⇒ 调不到；缺 parameters ⇒ schema 校验拒收）
for (const t of ctx.registered) {
  const miss = ['name', 'description', 'parameters', 'output', 'execute'].filter((k) => !t || !(k in t))
  ok(miss.length === 0, `③ ${t?.name} 形状完整${miss.length ? `（缺 ${miss.join(',')}）` : ''}`)
}

// ④ 开关语义：verify_enabled=false ⇒ 只有 verify 不注册，其余照旧（原 `if (!config.verify_enabled) return () => {}`）
ctx = makeCtx()
applyScheduler(ctx, baseConfig({ verify_enabled: false }))
const got2 = names(ctx)
ok(!got2.includes('shoucang_verify'), '④ verify_enabled=false ⇒ shoucang_verify 不注册')
ok(WANT.filter((n) => n !== 'shoucang_verify').every((n) => got2.includes(n)), '④ 其余工具不受影响')

// ⑤ share 装配面：字段齐全 + distillConfig 键不变（panel /distill/config 与 /suite 直接消费）
const api = schedulerShare.api
ok(!!api, '⑤ schedulerShare.api 已装配')
const need = ['suiteScan', 'distillConfig', 'llmModels']
const missApi = need.filter((k) => !api || typeof api[k] !== 'function')
ok(missApi.length === 0, `⑤ share 面字段齐全${missApi.length ? `（缺 ${missApi.join(',')}）` : `（${need.length} 项）`}`)
// ⚠ 必须防御式取值：若 share 面压根没装配，`api.distillConfig()` 会直接抛 TypeError，
//   顶层未捕获 ⇒ 进程**崩溃退出 1**。那与「断言失败退出 1」同码，读日志分不清是
//   "被测代码坏了"还是"测试自己写崩了" ⇒ 一律先判空，让它渲染成 ❌ 而不是栈。
let dc = {}
try { dc = api ? api.distillConfig() : {} } catch (e) { dc = {} }
const needDc = ['enableDistill', 'idleWakeMs', 'minTurnChars', 'distillPrescan', 'llmProvider', 'llmModel', 'distillProvider', 'distillModel', 'sleepProvider', 'sleepModel']
const missDc = needDc.filter((k) => !(k in dc))
ok(missDc.length === 0, `⑤ distillConfig 键完整${missDc.length ? `（缺 ${missDc.join(',')}）` : `（${needDc.length} 项）`}`)
ok(dc.idleWakeMs === 1000, '⑤ distillConfig 透传 config 实际值（非缺省/非硬编码）')

// ⑥ 蒸馏器关闭时 share 面**仍要装配** —— 这是本次重构消掉的真实隐患：
//    原实现在 enableDistill 开/关两条分支各写了一份相同的对象，改一处漏一处就会漂移
ctx = makeCtx()
applyScheduler(ctx, baseConfig({ enableDistill: false }))
ok(!!schedulerShare.api && typeof schedulerShare.api.suiteScan === 'function',
  '⑥ enableDistill=false 时 share 面仍装配（/suite 是只读视图，与蒸馏无关）')

// ⑦ llmModels 降级：宿主无 llm ⇒ 返回空数组而不是抛（面板下拉不能因为缺 llm 崩）
let models = null, mErr = null
try { models = await schedulerShare.api.llmModels() } catch (e) { mErr = e }
ok(!mErr && Array.isArray(models), `⑦ llmModels 无宿主 llm 时返回数组而非抛（实测 ${JSON.stringify(models)}）`)

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
