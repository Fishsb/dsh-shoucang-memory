#!/usr/bin/env node
// test-panel-wiring.mjs — 面板路由装配的**黑盒契约测试**（拆 applyPanel 前的安全网）
//
// 为什么需要它：`panel.ts:applyPanel` 是**全仓第一大函数**（1817 行，32+ 个 HTTP 路由），
//   且此前**零单元测试**。本次要先建网再动刀（深睡那次把网补在重构**之后**，不理想）。
//   前端 client.js 按硬编码路径 fetch 这些端点 —— **改名/丢失 = 面板某个视图直接空白**，
//   而这类断裂 typecheck 查不出来（路径是字符串）。
//
// 与既有件分工：
//   · check-ui-contract.mjs —— 锁前端 fetch 的路径与后端注册的路径**是否对得上**（跨端一致性）
//   · 本件 —— 锁后端**自己注册了什么**（装配面）：路径集合、无重复、只读端点能响应
//
// 不依赖真实环境：state_path 指向临时目录；不启 HTTP 服务，直接调 handler。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'sc-panel-'))
process.env.DSH_HOME = tmp
process.env.MEMORY_ROOT = join(tmp, 'memory')

const { applyPanel } = await import('../lib/panel.js')

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

/** 面板全部路由（`/api/shoucang-panel` 前缀下的 sub 路径）——**改名即破坏性变更**：
 *  前端 client.js 按这些字符串 fetch，此处是全仓唯一把这些路径当契约锁住的地方。 */
const ROUTES = [
  '/roots', '/get_root', '/root/bootstrap', '/set_root', '/config', '/save', '/toggle', '/set',
  '/memory/overview', '/memory/sections', '/memory/section-edit', '/memory/edit', '/memory/remove', '/memory/approve',
  '/suite', '/mcl/status', '/reconcile', '/maturation/scan', '/selfcheck', '/selfcheck/run', '/config/recent',
  '/rings',
  '/criteria', '/content-types', '/cognition/report', '/llm/models',
  // S2S3 册四（2026-09-19）：睡眠汇报的**两条只读面**（面板「睡眠汇报」卡读它们）
  '/sleep/reports', '/sleep/issues',
  '/deepsleep', '/deepsleep/trigger', '/deepsleep/config', '/distill/run', '/distill/config',
  '/inject/preview', '/inject/stats', '/vector/status2', '/embed/config', '/embed/test', '/vector/cache/clear',
  // 架构观测与调节面（panel-arch · 2026-09-13 重构后新增）
  '/arch/records', '/arch/graph', '/arch/observability', '/arch/assembly', '/mcl/config',
]

const Ctx = (over = {}) => {
  const routes = new Map() // path → handler
  return {
    routes,
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    // cordis：effect/on 都是「注册回调 + 返回/接收 disposer」；本测试只关心**回调有没有跑起来**
    effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
    on: () => () => {},
    webServer: { register: ({ path, handler }) => { routes.set(path, handler); return () => {} } },
    ...over,
  }
}
const makeCtx = () => Ctx()
const PRE = '/api/shoucang-panel'

console.log('── 面板路由装配契约（applyPanel 黑盒）──')

// ① 装配不抛
const ctx = makeCtx()
let bootErr = null
try { applyPanel(ctx, { state_path: join(tmp, 'state.json') }) } catch (e) { bootErr = e }
ok(!bootErr, `① applyPanel 装配成功，不抛异常${bootErr ? `（${String(bootErr?.message ?? bootErr)}）` : ''}`)
if (bootErr) { console.log(`\n结果: ${pass} PASS / ${fail} FAIL`); process.exit(1) }

// ② 契约里的路由一条都不能少/改名
const missing = ROUTES.filter((r) => !ctx.routes.has(PRE + r))
ok(missing.length === 0, `② ${ROUTES.length} 条契约路由全部在册${missing.length ? `（缺 ${missing.join(', ')}）` : ''}`)

// ③ 无越界路径 + 无新增未登记路由（新增路由必须**显式**更新本契约，不能悄悄加）
const all = [...ctx.routes.keys()]
const bad = all.filter((p) => !p.startsWith(PRE + '/'))
ok(bad.length === 0, `③ 全部路径在 /api/shoucang-panel 命名空间下${bad.length ? `（越界 ${bad.join(', ')}）` : ''}`)
const extra = all.filter((p) => !ROUTES.includes(p.slice(PRE.length)))
ok(extra.length === 0, `③ 无未登记的新路由（实测 ${all.length} 条）${extra.length ? ` —— 新增：${extra.join(', ')}（请显式加进 ROUTES）` : ''}`)

// ④ 无重复注册（宿主按路径去重，重复会抛 duplicate route ⇒ 插件树整体加载失败）
ok(all.length === new Set(all).size, `④ 无重复注册路径（${all.length} 条唯一）`)

// ⑤ 只读端点真能响应：直接调 handler，断言走了 sendJson（writeHead + end）
const fakeRes = () => {
  const r = { code: 0, body: '', writeHead(c) { r.code = c }, end(b) { r.body = String(b) } }
  return r
}
/* ⚠ 2026-09-17（D-I4）：`call` 必须 **await** —— 宿主对 handler 是 `await route.handler(req,res)`
 *  （`dsh-host-webserver:245`），本仓已有多条 async handler；本轮 `/vector/status2` 与
 *  `/reconcile` `/maturation/scan` `/selfcheck/run` 由同步改为异步 ⇒ **同步调用拿不到响应**
 *  （实测 code=0）。这里对齐宿主语义，不是放宽断言。 */
/* T3（2026-09-17 圆桌会议）：夹具**须带 Host 头** —— 真实 HTTP/1.1 请求必带 Host，
 *  而 `createRouteBinder` 已在单点挂**来源栅栏**（`panel-guard.ts`，判据与宿主
 *  `isTrustedApiRequest` 逐条对齐：无 Host ⇒ 拒，`dsh-client-connection/lib/index.js:203`）。
 *  裸 `{method:'GET'}` 会被判 403，那是**夹具不真实**而非产品缺陷 ⇒ 此处补 loopback Host。
 *  ⚠ 不要为此放宽生产判据（放宽＝真的削弱防护，且与宿主口径分叉）。 */
const call = async (sub, req = { method: 'GET', headers: { host: '127.0.0.1:3080' } }) => {
  const h = ctx.routes.get(PRE + sub)
  if (!h) return null
  const res = fakeRes()
  try { await h(req, res) } catch (e) { res.body = '__THREW__' + String(e?.message || e) }
  return res
}
for (const sub of ['/roots', '/criteria', '/deepsleep', '/mcl/status', '/vector/status2']) {
  const r = await call(sub)
  const okRes = r && r.code === 200 && !String(r.body).startsWith('__THREW__')
  ok(okRes, `⑤ ${sub} 响应 200 且未抛（code=${r?.code}）`)
}
// /roots 的返回体必须能解析成 JSON（前端直接 JSON.parse）
const rootsRes = await call('/roots')
let parsed = null
try { parsed = JSON.parse(rootsRes.body) } catch { /* 留空 ⇒ 断言失败 */ }
ok(parsed && typeof parsed === 'object', `⑥ /roots 返回合法 JSON（${String(rootsRes.body).slice(0, 60)}）`)
ok(parsed && Array.isArray(parsed.roots), '⑥ /roots 含 roots 数组（前端首屏直接渲染它）')

// ⑦ webServer 缺失时降级：只告警、不抛（宿主未提供该服务 ⇒ 插件不能跟着崩）
const ctx2 = Ctx({ webServer: undefined })
let noWsErr = null
try { applyPanel(ctx2, { state_path: join(tmp, 'state2.json') }) } catch (e) { noWsErr = e }
ok(!noWsErr, `⑦ webServer 不可用时降级不抛${noWsErr ? `（${String(noWsErr?.message ?? noWsErr)}）` : ''}`)

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
