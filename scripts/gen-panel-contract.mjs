/**
 * 生成「面板接口契约」共享产物（S4 · 2026-09-13）
 *
 * 源 = src/panel-contract.ts（经 lib/panel-contract.js 读取，**唯一事实源**）
 * 产物三份（全部是**生成物，禁手写**）：
 *   ① src-client/panel-contract.generated.js  —— 客户端消费（打包进 client bundle）
 *   ② lib/panel-contract.json                 —— 机读产物（外部工具/审计）
 *   ③ deliverables/panel-contract.md          —— 人读文档
 *
 * 字段类型**从 schemastery 内省派生**（`.dict` + `.type` + `meta.required`），不手写第二份；
 *   `scripts/check-panel-contract.mjs` 会重生成并与磁盘比对 ⇒ 产物过期即门禁翻红。
 * 用法：node scripts/gen-panel-contract.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = process.argv.includes('--check')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = join(ROOT, 'lib', 'panel-contract.js')
if (!existsSync(LIB)) { console.error('gen-panel-contract ✗ 缺少 lib/panel-contract.js（先 npm run build:host）'); process.exit(1) }

const mod = await import('file://' + LIB.replace(/\\/g, '/'))

/** 落盘或比对（--check 时不写，只报差异） */
const stale = []
function emit (rel, content) {
  const p = join(ROOT, rel)
  if (CHECK) {
    const cur = existsSync(p) ? readFileSync(p, 'utf8') : null
    if (cur !== content) stale.push(rel)
    return
  }
  writeFileSync(p, content, 'utf8')
}

/** 从一个 schemastery schema 派生字段表 */
function fieldsOf (schema) {
  if (!schema || typeof schema !== 'function') return null
  const dict = schema.dict
  if (!dict || typeof dict !== 'object') return null
  return Object.keys(dict).map((name) => {
    const sub = dict[name]
    return {
      name,
      type: String(sub.type || 'any'),
      optional: sub.meta ? sub.meta.required === false : false
    }
  })
}

const routes = (mod.PANEL_ROUTES || []).map((r) => {
  const c = r.contract || {}
  return {
    path: r.path,
    summary: r.summary,
    required: [...(c.required || [])],
    fields: fieldsOf(c.body)
  }
})

const contract = {
  $comment: '生成物（npm run build:host && node scripts/gen-panel-contract.mjs）—— 勿手改；源 = src/panel-contract.ts',
  plugin: 'dsh-shoucang-memory',
  prefix: '/api/shoucang-panel',
  routeCount: routes.length,
  routes
}

const json = JSON.stringify(contract, null, 2) + '\n'

/* ① 客户端模块 */
const clientMod = `/**
 * 面板接口契约（**生成物 · 禁手写**）。
 * 源：src/panel-contract.ts；生成：node scripts/gen-panel-contract.mjs（已挂在 build:client 前置）。
 * 用途：客户端在**发请求前**预检必填字段，把"喂错数据"拦在本地，而不是等后端 400 一个来回。
 */
export const PANEL_CONTRACT = ${JSON.stringify(contract, null, 2)}

/** 按路径取契约（无契约返回 undefined） */
export function contractOf (path) {
  return PANEL_CONTRACT.routes.find((r) => r.path === path)
}
`
emit('src-client/panel-contract.generated.js', clientMod)

/* ② 机读产物 */
emit('lib/panel-contract.json', json)

/* ③ 人读文档 */
const rows = routes.map((r) => {
  const f = r.fields ? r.fields.map((x) => '`' + x.name + '`' + (x.optional ? '?' : '') + ':' + x.type).join(' · ') : '—'
  const req = r.required.length ? r.required.join(', ') : '—'
  return '| `' + r.path + '` | ' + r.summary + ' | ' + req + ' | ' + f + ' |'
}).join('\n')
mkdirSync(join(ROOT, 'deliverables'), { recursive: true })
emit('deliverables/panel-contract.md', `# 面板接口契约（生成物）

> **生成物 · 禁手写** —— 源 = \`src/panel-contract.ts\`；生成 = \`node scripts/gen-panel-contract.mjs\`（已挂在 \`build:client\` 前置）。
> 新鲜度由 \`scripts/check-panel-contract.mjs\` 守着：重生成与磁盘不一致即门禁翻红。

前缀：\`/api/shoucang-panel\` · 路由 **${routes.length}** 条

| 路径 | 说明 | 必填字段 | 请求体字段（类型 · \`?\`=可选） |
|---|---|---|---|
${rows}
`, 'utf8')

if (CHECK) {
  if (stale.length) {
    console.error('gen-panel-contract ✗ 产物已过期（与契约表不一致）：' + stale.join(' / '))
    console.error('  ⇒ 跑 node scripts/gen-panel-contract.mjs 重新生成（禁手改生成物）')
    process.exit(1)
  }
  console.log('gen-panel-contract ✓ 产物新鲜（路由 ' + routes.length + ' 条 · 3 份产物一致）')
  process.exit(0)
}
console.log('gen-panel-contract ✓ 路由 ' + routes.length + ' 条 → src-client/panel-contract.generated.js · lib/panel-contract.json · deliverables/panel-contract.md')
