#!/usr/bin/env node
/**
 * check-appstate-contract — `appState` **契约四方对账**（接缝② · 2026-09-17 阶段 3）
 *
 * ## 为什么必须有这一件（圆桌会议 `arch` 成因 B）
 *
 * 实测：`app-state.js` 声明 **20** 字段，而 `body.js` 注入 **24** ⇒ **7 个字段无声明行**
 *   （`show` / `switchKeys` / `makeToggle` / `metaBadges` / `filterViewRows` / `deferFold` / `flushFolds`）。
 *   后果有两层：
 *     ① 契约面**不完整** —— 按声明文件读不出这些句柄存在；
 *     ② 拼错字段名（消费 `appState.xxx` 而无人注入）**静默为 undefined**，
 *        既无类型检查（client 半区是纯 JS）也无门禁 ⇒ 与「假绿」同类。
 *   另有**反向穿透**：`pollTimer` 等字段声明在容器，唯一写点却在 pane（`panes-settings.js`）。
 *
 * ## 判据（四方对账，主机检）
 *
 *   declared  = `app-state.js` 顶层字段
 *   injected  = `body.js` 里的 `appState.X = …`
 *   paneWrote = **其他**模块里的 `appState.X = …`
 *   consumed  = 任意模块里的 `appState.X` 读取
 *
 *   FAIL ①（契约不完整）：(injected ∪ paneWrote ∪ consumed) 有字段不在 declared
 *   FAIL ②（死声明）：declared 中有字段既未被注入写、也未被任何模块消费
 *
 * ## 退出码
 * 0 = 四方一致 · 1 = 存在契约外字段或死声明 · 3 = 前置缺失跳过
 *
 * 用法：node scripts/check-appstate-contract.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const DECL = join(SRC, 'app-state.js')
if (!existsSync(DECL)) { console.log('check-appstate-contract：无 app-state.js —— 跳过'); process.exit(3) }

const files = readdirSync(SRC).filter((f) => f.endsWith('.js') && !/\.generated\./.test(f))

/* declared：app-state.js 里 `export const appState = { … }` 的顶层字段 */
const declSrc = readFileSync(DECL, 'utf8')
const declared = new Set()
for (const m of declSrc.matchAll(/^ {2}([A-Za-z_$][\w$]*):/gm)) declared.add(m[1])

const injected = new Set(), paneWrote = new Set(), consumed = new Set()
const writeRe = /appState\.([A-Za-z_$][\w$]*)\s*=[^=]/g
const readRe = /appState\.([A-Za-z_$][\w$]*)/g
for (const f of files) {
  const self = f === "app-state.js"
  const t = readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of t.matchAll(writeRe)) {
    if (self) continue
    if (f === 'body.js') injected.add(m[1]); else paneWrote.add(m[1])
  }
  for (const m of t.matchAll(readRe)) { if (!self) consumed.add(m[1]) }
}

const known = new Set([...injected, ...paneWrote, ...consumed])
const outside = [...known].filter((k) => !declared.has(k)).sort()
const dead = [...declared].filter((k) => !known.has(k)).sort()

console.log('check-appstate-contract · 四方对账')
console.log('  声明 ' + declared.size + ' · body 注入 ' + injected.size + ' · pane 写 ' + paneWrote.size + ' · 消费 ' + consumed.size)

if (outside.length) {
  console.error('  ❌ 契约外字段 ' + outside.length + ' 个（被写/读但未在 app-state.js 声明）：')
  for (const k of outside) console.error('     · ' + k)
  console.error('  修法：在 src-client/app-state.js 的 appState 对象里补该字段声明（带语义注释）。')
}
if (dead.length) {
  console.error('  ❌ 死声明 ' + dead.length + ' 个（已声明但既无注入也无消费）：')
  for (const k of dead) console.error('     · ' + k)
}
if (!outside.length && !dead.length) {
  console.log('  ✅ 四方一致：无契约外字段、无死声明')
  process.exit(0)
}
process.exit(1)
