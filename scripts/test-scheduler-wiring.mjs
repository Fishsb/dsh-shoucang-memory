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
const { createComposition } = await import('../lib/composition.js')

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

// ① 装配不抛（G0 composition root：句柄盒由 root 显式传入 —— 取代已退役的 `scheduler-share`）
let bootErr = null
let ctx = makeCtx()
const comp = createComposition()
try { applyScheduler(ctx, baseConfig(), comp) } catch (e) { bootErr = e }
ok(!bootErr, `① applyScheduler 装配成功，不抛异常${bootErr ? `（${String(bootErr?.message ?? bootErr)}）` : ''}`)

// ② 五个工具全部在册，且名字未变（改名 = 调用方全断，属破坏性变更）
const WANT = ['shoucang_suite', 'shoucang_verify', 'shoucang_targets_probe', 'shoucang_recall', 'shoucang_associate', 'assistant_capabilities']
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
applyScheduler(ctx, baseConfig({ verify_enabled: false }), createComposition())
const got2 = names(ctx)
ok(!got2.includes('shoucang_verify'), '④ verify_enabled=false ⇒ shoucang_verify 不注册')
ok(WANT.filter((n) => n !== 'shoucang_verify').every((n) => got2.includes(n)), '④ 其余工具不受影响')

// ⑤ root 装配面：字段齐全 + distillConfig 键不变（panel /distill/config 与 /suite 直接消费）
const api = comp.scheduler.current
ok(!!api, '⑤ comp.scheduler.current 已装入（composition root 句柄盒）')
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
const comp2 = createComposition()
applyScheduler(ctx, baseConfig({ enableDistill: false }), comp2)
ok(!!comp2.scheduler.current && typeof comp2.scheduler.current.suiteScan === 'function',
  '⑥ enableDistill=false 时装配面仍装入 root（/suite 是只读视图，与蒸馏无关）')

// ⑦ llmModels 降级：宿主无 llm ⇒ 返回空数组而不是抛（面板下拉不能因为缺 llm 崩）
let models = null, mErr = null
try { models = await api.llmModels() } catch (e) { mErr = e }
ok(!mErr && Array.isArray(models), `⑦ llmModels 无宿主 llm 时返回数组而非抛（实测 ${JSON.stringify(models)}）`)

// ⑧ `storeMode` 的**死开关守卫**（2026-09-13 修）：注释曾声称"只接受 md|dual"，实现却是 `z.string()`
//    —— 设 `record` 不报错、只静默无动作（`mirrorShadow` 仅 `=== 'dual'` 时动作）⇒ **死开关真实存在过**。
//    现改为枚举：非法值**当场抛**。把"注释里的约束"变成"代码里的约束"，并把它钉成断言。
{
  const { Config } = await import('../lib/scheduler.js')
  const okMd = Config({ storeMode: 'md' }).storeMode === 'md'
  const okDual = Config({ storeMode: 'dual' }).storeMode === 'dual'
  const okDefault = Config({}).storeMode === 'md'
  let threw = ''
  try { Config({ storeMode: 'record' }) } catch (e) { threw = String(e?.message || e) }
  ok(okMd && okDual && okDefault, '⑧ storeMode 接受 md / dual，缺省 md')
  ok(/md/.test(threw) && /dual/.test(threw), `⑧ **未实现的 'record' 当场被拒**（不再静默无动作）：${threw.slice(0, 60) || '（竟然没抛！）'}`)
}

// ⑨ **第二通道守卫**（2026-09-13 修）：`scheduler.json` 原为**无校验裸合并** `(config as any)[k]=v`
//    ⇒ 写 `{"storeMode":"record"}` 就能**绕过 ⑧ 的枚举守卫**（死开关复活），且任意键/类型都能塞进 config。
//    现改为：**键白名单（从 schema 自身派生）+ 逐键过 schema 校验**；非法键/值 ⇒ 忽略并记日志。
{
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const sc = join(process.env.DSH_HOME, 'suite')
  mkdirSync(sc, { recursive: true })
  writeFileSync(join(sc, 'scheduler.json'), JSON.stringify({
    storeMode: 'record',   // 未实现的值：必须被忽略（否则死开关复活）
    bogusKey: 1,           // 未知键：不得注入 config
    deepSleepIdleMs: 'abc', // 类型错：不得注入
    enableDistill: false,  // 合法键：必须仍然生效
  }), 'utf8')
  const cfg = baseConfig()
  const warns = []
  const ctx3 = makeCtx()
  ctx3.logger = { warn: (m) => warns.push(String(m)), info: () => { /* */ } }
  applyScheduler(ctx3, cfg, createComposition())
  ok(cfg.storeMode !== 'record', `⑨ **非法 storeMode 被忽略**（实测 ${JSON.stringify(cfg.storeMode)}，不是 'record'）`)
  ok(!('bogusKey' in cfg), '⑨ 未知键未被注入 config')
  ok(cfg.deepSleepIdleMs !== 'abc', `⑨ 类型错的值被忽略（deepSleepIdleMs=${JSON.stringify(cfg.deepSleepIdleMs)}）`)
  ok(cfg.enableDistill === false, '⑨ **合法键仍然生效**（守卫不是一刀切禁用文件通道）')
  ok(warns.some((m) => /storeMode/.test(m)), `⑨ 非法值有日志留痕（实测 ${warns.length} 条 warn）`)
}

// ⑩ `shoucang_associate` 的**诚实降级**（2026-09-13 · 用户点拨「联想纯代码基本实现不了」）：
//    本工具若拿不到向量，**必须如实说"不可用"**，绝不退回"结构规则"假装生成联想。
//    构造最小影子库让执行走到向量那一步，再关掉 embed ⇒ 断言它说的是"向量不可用"而不是编出候选。
{
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  // ⚠ 夹具根必须**跟随 memoryLibRoot() 的真实解析**（`MEMORY_ROOT` 优先 → 否则 `<DSH_HOME>/suite/memory`）。
  //   2026-09-21 实测教训：本件 L21 设了 `MEMORY_ROOT=<tmp>/memory`，而此处原先**另拼第二份**
  //   `join(DSH_HOME, 'skills', 'managing-memory')`——当时 `memoryLibRoot()` 忽略 env，两者碰巧同址故未暴露；
  //   库根迁移后 memoryLibRoot() 改 env 优先，夹具当即与工具读的目录**分家** ⇒
  //   工具报「影子库不可用（空）」= **夹具错位，不是工具回归**。改为从 lib 取真实解析值，消除第二份推导。
  const { memoryLibRoot } = await import('../lib/targets.js')
  const bankLib = memoryLibRoot()
  mkdirSync(join(bankLib, '.records'), { recursive: true })
  const rows = [
    // ⚠ 必须有**标题行**：`sectionsOf` 按 `#`/`##` 切节，标题之前的内容按设计丢弃
    //    —— 第二版漏了标题，工具报"未切出 notes 小节"（**代码对，夹具不全**）。
    { id: 'a0', kind: 'structure', subject: 'knowledge', scope: 'global', text: '## 甲节', source: '', tag: '', pointer: '', file: 'notes/a.md', order: 0, eol: '\n', maturity: 0, lifecycle: 'active', hits: 0, lastHit: '', createdAt: '', updatedAt: '' },
    { id: 'a1', kind: 'prose', subject: 'knowledge', scope: 'global', text: '甲节内容', source: '', tag: '', pointer: '', file: 'notes/a.md', order: 1, eol: '\n', maturity: 0, lifecycle: 'active', hits: 0, lastHit: '', createdAt: '', updatedAt: '' },
    { id: 'b0', kind: 'structure', subject: 'knowledge', scope: 'global', text: '## 乙节', source: '', tag: '', pointer: '', file: 'notes/b.md', order: 0, eol: '\n', maturity: 0, lifecycle: 'active', hits: 0, lastHit: '', createdAt: '', updatedAt: '' },
    { id: 'b1', kind: 'prose', subject: 'knowledge', scope: 'global', text: '乙节内容', source: '', tag: '', pointer: '', file: 'notes/b.md', order: 1, eol: '\n', maturity: 0, lifecycle: 'active', hits: 0, lastHit: '', createdAt: '', updatedAt: '' },
  ]
  writeFileSync(join(bankLib, '.records', 'records.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  const cfg2 = baseConfig()
  const ctx4 = makeCtx()
  applyScheduler(ctx4, cfg2, createComposition())
  const tool = ctx4.registered.find((t) => t && t.name === 'shoucang_associate')
  ok(!!tool, '⑩ shoucang_associate 在册且可取到')
  const out = await tool.execute({})
  ok(/向量不可用/.test(String(out)), `⑩ **拿不到向量时如实说"不可用"**（不假装生成）：${String(out).slice(0, 70)}`)
  ok(!/候选 \*\*\d/.test(String(out)), '⑩ 未产出任何候选（**降级不得伪造联想**）')

  // ⑪ **组合层单一实现**（2026-09-13）：工具 / 深睡 REM / CLI 三处共用 `association-supply.ts`。
  //    直接调它，验证"切节 + 向量不可用 ⇒ 给出可读 reason 且零候选"——工具只是它的一个薄壳。
  const { supplyAssociations } = await import('../lib/association-supply.js')
  const sup = await supplyAssociations(bankLib, { enabled: false, baseUrl: '', model: '', apiKeyEnv: 'X', coldFactor: 0.35 }, { topN: 5 })
  ok(sup.sections === 2, `⑪ 组合层切出 2 小节（实测 ${sup.sections}——证明确实走到了切节那一步）`)
  ok(sup.proposals.length === 0 && /向量不可用/.test(String(sup.reason)), `⑪ 向量不可用 ⇒ 零候选 + 可读 reason（${String(sup.reason).slice(0, 50)}）`)
  ok(sup.embedded === 0, '⑪ 未嵌入任何小节（embedded=0）')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
