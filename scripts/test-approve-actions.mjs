/**
 * test-approve-actions — 候选处置动作语义（册一回归 · 2026-09-19）
 *
 * **判因（我自己的施工教训，写入判据以防复发）**：册一首版验收直接对**真实候选池**调
 *   `POST /memory/approve`，把 2 条真候选移进 `.processed`/`.ignored`（事后已还原）。
 *   「验收工具改动真源数据」本身违反本仓 R2③（不改真源数据），且 `suite/knowledge` **不是 git 库**
 *   ⇒ 移动无版本记录、不可回滚（只能靠备份）。故本件改为**隔离根**跑。
 *
 * **隔离手法（不复制产品逻辑）**：`knowledgeRoot()` 与 `memoryLibRoot()` 都由
 *   `dshHome()` = `process.env.DSH_HOME || ~/.dsh` 派生（见 `src/targets.ts:16-28`）
 *   ⇒ 设 `DSH_HOME=<tmp>` 即可让**真实 handler** 在临时根上跑。
 *   ⚠ 关键：本件必须调用**真实 handler**（经 `registerMemoryWriteRoutes` 注册的 `/memory/approve`），
 *     而不是复刻它的落点规则——复刻＝自证式假绿（断言恒真、测的是副本不是产品）。
 *
 * 判据（四要素）：
 *   ① 动作分离：`action=ignore` 落 `.ignored`（**不进** `.processed`）；`action=approve` 落 `.processed`
 *   ② 结果达成：目标目录**实际文件数 +1**，且文件**确实出现在该目录**（非仅 HTTP 200）
 *   ③ 根指定：`root` 非法 ⇒ 400；候选不存在 ⇒ 404（**不静默回退**到别的根）
 *   ④ 判别力自证：若两动作映射到同一目录（旧行为），本件的 ①/④ 断言必红
 *
 * 退出码：0 PASS · 1 FAIL · 3 skip（lib/ 未构建）
 * 用法：node scripts/test-approve-actions.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = join(ROOT, 'lib', 'panel-inject.js')
if (!existsSync(LIB)) { console.log('test-approve-actions：lib/panel-inject.js 未构建 —— 跳过（exit 3）'); process.exit(3) }

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.error('  ❌ ' + m) }

/* ── 隔离根：DSH_HOME 指向临时目录 ⇒ 真实 handler 的 knowledgeRoot()/memoryLibRoot() 都落此处 ── */
const HOME = mkdtempSync(join(tmpdir(), 'approve-home-'))
const PEND = join(HOME, 'suite', 'knowledge', 'pending')
mkdirSync(join(PEND, 'flow-candidates'), { recursive: true })
mkdirSync(join(HOME, 'suite', 'memory', 'pending'), { recursive: true })
writeFileSync(join(PEND, 'cand-a.md'), '# a\n', 'utf8')
writeFileSync(join(PEND, 'cand-b.md'), '# b\n', 'utf8')
writeFileSync(join(PEND, 'flow-candidates', 'cand-c.md'), '# c\n', 'utf8')
writeFileSync(join(HOME, 'suite', 'memory', 'pending', 'cand-m.md'), '# m\n', 'utf8')

/* 必须在 import 产品模块**之前**设 DSH_HOME：targets 在模块加载期不固化路径（函数每次算），
 * 但为稳妥起见仍先设，避免将来有人把路径提到模块级常量后静默失效。 */
process.env.DSH_HOME = HOME

const { registerInject } = await import(pathToFileURL(LIB).href).catch(() => ({ registerInject: null }))
if (typeof registerInject !== 'function') {
  rmSync(HOME, { recursive: true, force: true })
  console.log('test-approve-actions：lib 未导出 registerInject（签名变化？）—— 跳过（exit 3）')
  process.exit(3)
}

const routes = []
const mkDeps = () => ({
  route: (p, h) => { routes.push({ path: p, handler: h }) },
  disposers: [],
  root: { read: () => ({}), write: () => {} },
  hot: { invalidate: () => {}, stable: () => '' },
  injectMeta: { read: () => ({}), write: () => {} },
  suite: { read: () => ({}), write: () => {} },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
})
/* mock ctx：只提供装配所需的两个能力。
 * ⚠ `ctx.effect(fn)` 在 Cordis 语义下**立即执行** fn 并登记卸载器，故此处同步执行——
 *   这正是真实装配路径（`registerInject` → `ctx.effect` → `mountInjectEffect` → 注册 /memory/approve），
 *   不做逻辑复刻。 */
const ctx = {
  effect: (fn) => { fn(); return () => {} },
  get: () => undefined,
  on: () => {},
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}
try { registerInject(ctx, mkDeps()) } catch (e) {
  rmSync(HOME, { recursive: true, force: true })
  console.log('test-approve-actions：装配真实路由失败（' + String(e.message).slice(0, 80) + '）—— 跳过（exit 3）')
  process.exit(3)
}

const route = routes.find((r) => r.path === '/memory/approve')
if (!route) { rmSync(HOME, { recursive: true, force: true }); console.log('test-approve-actions：未注册 /memory/approve —— 跳过（exit 3）'); process.exit(3) }

function mkReq (body) {
  const r = Readable.from([Buffer.from(JSON.stringify(body ?? {}), 'utf8')])
  r.method = 'POST'
  r.url = '/api/shoucang-panel/memory/approve'
  r.headers = { host: '127.0.0.1:3080' }   // T3 栅栏要求（真实 HTTP 必带 Host）
  return r
}
async function call (body) {
  const out = { code: 0, body: null }
  const res = { writeHead: (c) => { out.code = c }, end: (s) => { try { out.body = JSON.parse(String(s)) } catch { out.body = String(s) } } }
  route.handler(mkReq(body), res)
  await new Promise((r) => setTimeout(r, 60))
  return out
}
const cnt = (sub) => { try { return readdirSync(join(PEND, sub)).filter((f) => f.endsWith('.md')).length } catch { return 0 } }
const there = (sub, f) => existsSync(join(PEND, sub, f))

console.log(`test-approve-actions · 候选处置动作语义（隔离根 · 真实 handler）`)
console.log(`  DSH_HOME = ${HOME}`)
console.log(`  初始：pending=${cnt('')} · flow-candidates=${cnt('flow-candidates')}`)
if (cnt('') === 2 && cnt('flow-candidates') === 1) ok('夹具就位（pending 2 · flow-candidates 1）')
else bad(`夹具异常（pending=${cnt('')} flow-candidates=${cnt('flow-candidates')}）`)

/* ── ① ignore ⇒ .ignored（不进 .processed） ── */
{
  const before = cnt('.ignored'), beforeP = cnt('.processed')
  const r = await call({ pendingFile: 'cand-a.md', root: 'suite', action: 'ignore' })
  r.code === 200 ? ok('① ignore ⇒ 200（' + JSON.stringify(r.body.moved || '') + '）') : bad('① ignore 返回 ' + r.code + ' ' + JSON.stringify(r.body))
  cnt('.ignored') === before + 1 ? ok(`① 结果达成：.ignored ${before}→${cnt('.ignored')}`) : bad(`① .ignored 未 +1（${before}→${cnt('.ignored')}）`)
  there('.ignored', 'cand-a.md') ? ok('① 文件确实在 .ignored/cand-a.md') : bad('① 文件不在 .ignored')
  cnt('.processed') === beforeP ? ok('① .processed **未变**（两动作可区分）') : bad(`① .processed 被误动（${beforeP}→${cnt('.processed')}）`)
}

/* ── ② approve ⇒ .processed（不进 .ignored） ── */
{
  const before = cnt('.processed'), beforeI = cnt('.ignored')
  const r = await call({ pendingFile: 'cand-b.md', root: 'suite', action: 'approve' })
  r.code === 200 ? ok('② approve ⇒ 200（' + JSON.stringify(r.body.moved || '') + '）') : bad('② approve 返回 ' + r.code + ' ' + JSON.stringify(r.body))
  cnt('.processed') === before + 1 ? ok(`② 结果达成：.processed ${before}→${cnt('.processed')}`) : bad(`② .processed 未 +1`)
  there('.processed', 'cand-b.md') ? ok('② 文件确实在 .processed/cand-b.md') : bad('② 文件不在 .processed')
  cnt('.ignored') === beforeI ? ok('② .ignored **未变**（两动作可区分）') : bad('② .ignored 被误动')
}

/* ── ③ 根指定：非法 root ⇒ 400；不存在 ⇒ 404（不静默回退） ── */
{
  const r1 = await call({ pendingFile: 'cand-c.md', root: 'nope', action: 'approve' })
  r1.code === 400 ? ok('③ 非法 root ⇒ 400（不静默回退）') : bad('③ 非法 root 返回 ' + r1.code)
  const r2 = await call({ pendingFile: 'ghost-not-exist.md', root: 'suite', action: 'approve' })
  r2.code === 404 ? ok('③ 候选不存在 ⇒ 404') : bad('③ 不存在候选返回 ' + r2.code)
  const r3 = await call({ pendingFile: 'cand-c.md', root: 'flow-candidates', action: 'approve' })
  r3.code === 200 ? ok('③ flow-candidates 子区可独立定位 ⇒ 200') : bad('③ flow-candidates 返回 ' + r3.code)
}

/* ── ④ 判别力自证（真做，不写常量）：两动作的落点**必须由 action 参数决定** ──
 * 手法：对**同一批**新夹具文件分别发 ignore / approve，断言两者落进**不同**目录
 *   —— 若产品退化为「一律 .processed」（旧行为），本条必红。
 * ⚠ 首版这里写成 `const sameDir = true; (sameDir ? bad : ok)(...)` ＝ 恒假断言（自证式假绿），
 *   已被自己的审查发现并改为真实验证。 */
{
  writeFileSync(join(PEND, 'cand-x.md'), '# x\n', 'utf8')
  writeFileSync(join(PEND, 'cand-y.md'), '# y\n', 'utf8')
  const rI = await call({ pendingFile: 'cand-x.md', root: 'suite', action: 'ignore' })
  const rA = await call({ pendingFile: 'cand-y.md', root: 'suite', action: 'approve' })
  const goneI = there('.ignored', 'cand-x.md')
  const goneA = there('.processed', 'cand-y.md')
  const crossI = there('.processed', 'cand-x.md')
  const crossA = there('.ignored', 'cand-y.md')
  if (rI.code === 200 && rA.code === 200 && goneI && goneA && !crossI && !crossA) {
    ok('④ 判别力自证：同批两文件按 action 落进**不同**目录（旧行为「一律 .processed」时本条必红）')
  } else {
    bad(`④ 动作落点未按 action 区分（ignore→.ignored=${goneI} · approve→.processed=${goneA} · 交叉=${crossI}/${crossA}）`)
  }
}

rmSync(HOME, { recursive: true, force: true })

if (fail) { console.error(`test-approve-actions: FAIL（${pass} PASS / ${fail} FAIL）`); process.exit(1) }
console.log(`test-approve-actions: PASS（${pass} 项 · 隔离根零副作用）`)
process.exit(0)
