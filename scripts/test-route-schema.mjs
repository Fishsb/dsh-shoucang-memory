/**
 * 路由契约行为测试（S4-1 · 2026-09-13）
 *
 * 守护三件事：
 *   ① 契约生效：缺必填 / 类型不符 ⇒ **400 且不进入 handler**（不是"空参数 + 200 假成功"）
 *   ② 契约不误伤：合法请求照常进入 handler，且 handler 仍能读到**完整 body**
 *      （关键回归：校验先读了一次流，若不缓存，handler 二次读会拿到空对象 ⇒ 参数全丢）
 *   ③ 无契约路由行为不变；重复路径守卫仍在（宿主 duplicate route 会让插件树整体加载失败）
 */
import { createRouteBinder } from '../lib/panel-shared.js'
import { Readable } from 'node:stream'
import z from 'schemastery'

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

function harness () {
  const routes = []
  const warns = []
  const webServer = { register: (r) => { routes.push(r); return () => {} } }
  const binder = createRouteBinder(webServer, { info: () => {}, warn: (s) => warns.push(s) })
  return { routes, warns, binder }
}
function req (body) {
  /* 必须是 Buffer 分片：readBody 用 Buffer.concat，喂字符串会抛并被兜底成 {}（夹具踩坑，非产品问题） */
  const r = Readable.from([Buffer.from(JSON.stringify(body ?? {}), 'utf8')])
  r.method = 'POST'
  r.url = '/api/shoucang-panel/x'
  return r
}
async function call (route, body) {
  const out = { code: 0, body: null }
  const res = {
    writeHead: (code) => { out.code = code },
    end: (s) => { try { out.body = JSON.parse(String(s)) } catch { out.body = String(s) } }
  }
  route.handler(req(body), res)
  await new Promise((r) => setTimeout(r, 30)) // 等异步校验链跑完
  return out
}

console.log('路由契约行为测试（S4）')

/* ① 缺必填 ⇒ 400 且 handler 不被调用 */
{
  const h = harness()
  let called = false
  h.binder.route('/need', () => { called = true }, { required: ['path'] })
  const r = await call(h.routes[0], {})
  r.code === 400 ? ok('① 缺必填 ⇒ 400') : bad('① 未返回 400（' + r.code + '）')
  !called ? ok('① 且**未进入** handler') : bad('① handler 仍被调用（校验形同虚设）')
  h.warns.length ? ok('① 并留下告警日志（可观测）') : bad('① 无告警日志')
}

/* ② 类型不符 ⇒ 400 */
{
  const h = harness()
  let called = false
  h.binder.route('/typed', () => { called = true }, { body: z.object({ key: z.string() }) })
  const r = await call(h.routes[0], { key: 123 })
  r.code === 400 ? ok('② 类型不符 ⇒ 400（' + String(r.body?.detail).slice(0, 40) + '）') : bad('② 未返回 400（' + r.code + '）')
  !called ? ok('② 且未进入 handler') : bad('② handler 仍被调用')
}

/* ③ 合法请求：进入 handler 且 body 完整可读（校验后缓存） */
{
  const h = harness()
  let seen = null
  h.binder.route('/ok', async (rq) => { const b = await (await import('../lib/panel-shared.js')).readBody(rq); seen = b }, { required: ['path'], body: z.object({ path: z.string() }) })
  const r = await call(h.routes[0], { path: '/tmp/vault' })
  r.code === 0 ? ok('③ 合法请求未被拦截（未写 400）') : bad('③ 合法请求被误拒（' + r.code + '）')
  seen && seen.path === '/tmp/vault' ? ok('③ handler 读到完整 body（缓存生效：path=' + seen.path + '）')
    : bad('③ handler 读到空/错 body：' + JSON.stringify(seen) + '（校验消费了流且未缓存）')
}

/* ④ 无契约路由：行为不变 */
{
  const h = harness()
  let called = false
  h.binder.route('/plain', () => { called = true })
  await call(h.routes[0], {})
  called ? ok('④ 无契约路由照常进入 handler（零行为变更）') : bad('④ 无契约路由被拦（不该）')
}

/* ⑤ 重复路径守卫仍在 */
{
  const h = harness()
  h.binder.route('/dup', () => {})
  h.binder.route('/dup', () => {})
  h.routes.length === 1 ? ok('⑤ 重复路径只注册一次（守卫生效）') : bad('⑤ 重复注册 ' + h.routes.length + ' 次')
  h.warns.some((w) => /重复注册/.test(w)) ? ok('⑤ 并告警') : bad('⑤ 未告警')
}

/* ⑥ 未闭合契约不影响只读端点：GET 无 body 也不报错 */
{
  const h = harness()
  let called = false
  h.binder.route('/get', () => { called = true })
  const r = await call(h.routes[0], undefined)
  called && r.code === 0 ? ok('⑥ 无 body 的只读请求正常') : bad('⑥ 只读请求异常')
}

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
process.exit(fail === 0 ? 0 : 1)
