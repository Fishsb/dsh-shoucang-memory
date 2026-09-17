/**
 * test-panel-guard.mjs — T3 面板路由来源栅栏（2026-09-17 圆桌会议产出）
 *
 * ── 为什么必须有它（判因，实弹实证）────────────────────────────────────
 * 守藏以 `kind:'exact'` 注册 `/api/shoucang-panel/*`，而宿主 `dsh-host-webserver` 的
 * `match()` **exact 优先于 prefix**（`lib/index.js:322-331`）⇒ 绕过挂在 `/api` prefix 上的
 * 来源栅栏。会议 security 节点**实发请求**实测（修复前）：
 *   `Host: evil.com` → 200 · `Origin: https://evil.com` → 200 · `sec-fetch-site: cross-site` → 200
 *   对照 `GET /api` + `Host: evil.com` → 403
 * ⇒ 42 条路由全在宿主 fence 之外，含写端点（`/set_root` `/memory/edit` `/memory/remove`
 *   `/save` `/distill/run` `/deepsleep/trigger`）。
 *
 * ── 本件断言（对应 accept 判据 + security 的 A1–A6）────────────────────
 *   ① **先红侧**：伪造来源的三类请求必须 `trusted=false`（修复前实测为 200，故本断言
 *      在接线前必红 ⇒ 先红留痕）
 *   ② **不误杀侧**：面板自身真实请求形态必须 `trusted=true`（同源 fetch / 无 Origin 的非浏览器客户端）
 *   ③ **单点覆盖**：静态断言 `panel-shared.ts` 内**无第二处** `webServer.register` 直调
 *      且栅栏挂在 `contract` 三元**之外**（否则 27 条无 contract 路由漏防 —— 方案丙已判死）
 *   ④ **判据对齐宿主**：loopback 判定口径与宿主 `isLoopbackHostname` 一致（`localhost`/`[::1]`/`127/8`）
 *
 * 退出码：0 全绿 / 1 有断言失败 / 3 产物未构建（skip）
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
const fails = []
const ok = (name, cond, detail = '') => { if (cond) { pass++; return } fails.push(`${name}${detail ? ' :: ' + detail : ''}`) }

const implPath = join(ROOT, 'lib', 'panel-guard.js')
if (!existsSync(implPath)) { console.log('test-panel-guard: lib/panel-guard.js 未构建 ⇒ skip（exit 3）'); process.exit(3) }
const { judgePanelRequest, isLoopbackHostname } = await import(`file://${implPath.replaceAll('\\', '/')}`)
ok('导出 judgePanelRequest', typeof judgePanelRequest === 'function')
ok('导出 isLoopbackHostname', typeof isLoopbackHostname === 'function')

const V = (h) => judgePanelRequest({ headers: h })

/* ── ① 先红侧：伪造来源必须被拒（修复前这些实测全 200）── */
const MUST_REJECT = [
  ['Host 非 loopback（DNS rebinding 形态）', { host: 'evil.com' }],
  ['Origin 跨站', { host: '127.0.0.1:3080', origin: 'https://evil.com' }],
  ['sec-fetch-site: cross-site', { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }],
  ['Host 缺失（不可裁决 ⇒ 拒）', {}],
  ['Host 与 Origin 不同源（端口不同）', { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:9999' }],
  ['Origin 畸形', { host: '127.0.0.1:3080', origin: 'not-a-url' }],
  ['Host 畸形（空串）', { host: '   ' }],
]
for (const [name, headers] of MUST_REJECT) {
  const r = V(headers)
  ok(`拒绝: ${name}`, r.trusted === false, `trusted=${r.trusted}`)
}

/* ── ② 不误杀侧：面板自身与合法客户端必须放行 ── */
const MUST_ALLOW = [
  ['同源 fetch（Origin 与 Host 同源）', { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }],
  ['非浏览器客户端（无 Origin）', { host: '127.0.0.1:3080' }],
  ['localhost 形态', { host: 'localhost:3080', origin: 'http://localhost:3080' }],
  ['IPv6 loopback', { host: '[::1]:3080', origin: 'http://[::1]:3080' }],
  ['127.x 网段', { host: '127.0.0.5:3080' }],
  ['同源 + sec-fetch-site: same-origin', { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }],
]
for (const [name, headers] of MUST_ALLOW) {
  const r = V(headers)
  ok(`放行: ${name}`, r.trusted === true, `trusted=${r.trusted} reason=${r.reason}`)
}

/* ── ②b 头值形态健壮性：数组头取首项；大小写归一 ── */
ok('数组 Host 取首项', V({ host: ['127.0.0.1:3080', 'evil.com'] }).trusted === true)
ok('Host 大写归一（LOCALHOST）', V({ host: 'LOCALHOST:3080' }).trusted === true)

/* ── ④ 判据对齐宿主 isLoopbackHostname ── */
ok('loopback: localhost', isLoopbackHostname('localhost') === true)
ok('loopback: [::1]', isLoopbackHostname('[::1]') === true)
ok('loopback: 127.0.0.1', isLoopbackHostname('127.0.0.1') === true)
ok('loopback: 127.255.255.255', isLoopbackHostname('127.255.255.255') === true)
ok('非 loopback: 128.0.0.1', isLoopbackHostname('128.0.0.1') === false)
ok('非 loopback: 10.0.0.1', isLoopbackHostname('10.0.0.1') === false)
ok('非 loopback: evil.com', isLoopbackHostname('evil.com') === false)
ok('非 loopback: 127.0.0（三段）', isLoopbackHostname('127.0.0') === false)

/* ── ③ 单点覆盖：静态断言（防"只挂在 contract 分支内"导致 27 条漏防）── */
const shared = join(ROOT, 'src', 'panel-shared.ts')
if (existsSync(shared)) {
  const src = readFileSync(shared, 'utf8')
  const registerCalls = (src.match(/webServer\.register\(/g) || []).length
  ok('panel-shared.ts 内仅一处 webServer.register（单点）', registerCalls === 1, `实测 ${registerCalls} 处`)
  ok('栅栏已接线 judgePanelRequest', /judgePanelRequest\s*\(/.test(src))
  // 关键：fenced 必须**在 contract 三元之外**（症状=源码里 `const fenced` 出现在 `const guarded` 之后）
  const iGuarded = src.indexOf('const guarded')
  const iFenced = src.indexOf('const fenced')
  ok('fenced 声明在 guarded 之后（引用合法，无 TDZ）', iGuarded >= 0 && iFenced > iGuarded)
  ok('register 用的是 fenced（不是裸 guarded）', /register\(\{[^}]*handler:\s*fenced/.test(src))
} else {
  ok('panel-shared.ts 存在', false)
}

if (fails.length) {
  console.error(`test-panel-guard: FAIL (${fails.length})`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`test-panel-guard: PASS ${pass} 项（拒 7 · 放行 6 · 健壮 2 · loopback 8 · 单点 4）`)
