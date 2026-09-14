#!/usr/bin/env node
// check-ui-components.mjs —「组件库 import ↔ 使用」字面量对账（UI1/U0-b · 2026-09-15）
//
// **判因**：`src-client/vendor.js` 头注早就写着「**按需 import 即注册** … 新增组件须同步本文件」，
//   但**没有任何机检** ⇒ `src-client/` 与后端一度同样处于"纪律只有口头"的状态。
//   本门把那条约定变成可机检，覆盖两个方向：
//     · **方向 1**：`import` 了但代码里**从未用到** ⇒ 死 import（白养依赖）；
//     · **方向 2**：用了 `wa-*` 但**没 import** ⇒ 未注册 ⇒ **运行时不渲染**（这类错只在真机才暴露）。
//
// ⚠ **局限声明（必须明写，不得声称"覆盖全部组件使用"）**：
//   本门只对账**字面量**。`body.js` 里组件大量经 **`UI.*` 封装运行时创建**
//   （`createElement('wa-button')` 等 7 处），**静态扫不到调用点** ⇒ 本门**不能**证明
//   "某个组件真的被渲染了"。渲染级证据由 `ui-geo-regress`（含 `shadowRoot`/`wa-button` 断言）承担。
//
// ⚠ **口径（实测踩过）**：`vendor.js` 的 import 用**组件名**（`button`），而代码里是**标签名**（`wa-button`）
//   ⇒ 必须**归一化**（给 import 侧补 `wa-` 前缀），否则两个方向会"全部不匹配"（假红）。
//
// 退出码：0 = pass · 1 = fail
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/**
 * **非元素白名单（每项都有实测判因，不是为过门而豁免）**：
 *   · `wa-tab-show` —— 是**事件名**（`addEventListener('wa-tab-show', …)`），不是元素；
 *   · `wa-dark` / `wa-light` —— 是 **CSS class**（`.wa-dark` 调暗色调色板 / `classList.toggle('wa-light')`），不是元素。
 */
const NOT_ELEMENTS = new Set(['wa-tab-show', 'wa-dark', 'wa-light'])

/**
 * **import 白名单（有判因）**：
 *   · `wa-icon` —— 代码里**不作为元素**使用（注释记载其渲染尺寸为 0，与 `wa-select` 同族被否决），
 *     但 `vendor.js` 经 `registerIconLibrary` **注册图标库** ⇒ 该 import **必要**，不是死 import。
 */
const IMPORT_ALLOW = new Set(['wa-icon'])

/** 提取 import 的组件标签（归一化为 `wa-<name>`） */
export function importedTags(vendorSrc) {
  return [...new Set([...vendorSrc.matchAll(/webawesome\/dist\/components\/([a-z0-9-]+)\//g)].map((m) => 'wa-' + m[1]))]
}
/** 提取代码里出现的 `wa-*` 字面量（引号包裹才算，避免注释里的普通词） */
export function usedTags(bodySrc) {
  return [...new Set([...bodySrc.matchAll(/['"`](wa-[a-z0-9-]+)['"`]/g)].map((m) => m[1]))]
}

/** 纯函数判定（供 selftest 直接驱动） */
export function evaluate(imports, used, notElements = NOT_ELEMENTS, importAllow = IMPORT_ALLOW) {
  const problems = []
  const impOnly = imports.filter((i) => !used.includes(i) && !importAllow.has(i))
  const useOnly = used.filter((u) => !imports.includes(u) && !notElements.has(u))
  for (const i of impOnly) problems.push(`[死 import] ${i} 已 import 但代码中从未作为字面量出现 ⇒ 删 import 或补使用（若经库注册使用，加入 IMPORT_ALLOW 并写明判因）`)
  for (const u of useOnly) problems.push(`[未注册] ${u} 在代码中出现但未 import ⇒ **运行时不渲染**（若它不是元素而是事件/class，加入 NOT_ELEMENTS 并写明判因）`)
  return problems
}

if (process.argv.includes('--selftest')) {
  const cases = [
    { name: '两侧一致 ⇒ 无错', i: ['wa-button'], u: ['wa-button'], want: 0 },
    { name: '⚠ 口径回归：**未归一化**会全不匹配（此为历史 bug）', i: ['button'], u: ['wa-button'], want: 2, raw: true },
    { name: 'import 了没用 ⇒ 红（死 import）', i: ['wa-button', 'wa-switch'], u: ['wa-button'], want: 1 },
    { name: '用了没 import ⇒ 红（未注册）', i: ['wa-button'], u: ['wa-button', 'wa-switch'], want: 1 },
    { name: '非元素白名单：事件名 `wa-tab-show` 不算未注册', i: ['wa-tab-group'], u: ['wa-tab-group', 'wa-tab-show'], want: 0 },
    { name: '非元素白名单：CSS class `wa-dark`/`wa-light` 不算未注册', i: ['wa-button'], u: ['wa-button', 'wa-dark', 'wa-light'], want: 0 },
    { name: 'import 白名单：`wa-icon`（经 registerIconLibrary）不算死 import', i: ['wa-button', 'wa-icon'], u: ['wa-button'], want: 0 },
    { name: '白名单**不吞**真问题：`wa-switch` 未 import 仍红', i: ['wa-button', 'wa-icon'], u: ['wa-button', 'wa-switch'], want: 1 },
  ]
  let bad = 0
  for (const c of cases) {
    const got = c.raw
      // raw 模式：故意不做归一化，复现历史 bug 以证明"归一化是必需的"
      ? (c.i.filter((x) => !c.u.includes(x)).length + c.u.filter((x) => !c.i.includes(x)).length)
      : evaluate(c.i, c.u).length
    if (got !== c.want) bad++
    console.log(`${got === c.want ? '✅' : '❌'} ${c.name}（期望 ${c.want} · 实得 ${got}）`)
  }
  if (bad) { console.log(`\nFAIL（${bad} 条自证未过）`); process.exit(1) }
  console.log('\nPASS（selftest：双向对账 + 两类白名单 + 口径归一化均已自证）')
  process.exit(0)
}

const vendorPath = join(root, 'src-client', 'vendor.js')
const bodyPath = join(root, 'src-client', 'body.js')
if (!existsSync(vendorPath) || !existsSync(bodyPath)) {
  console.log('check-ui-components: src-client 缺席 ⇒ skip（exit 3）')
  process.exit(3)
}

const imports = importedTags(readFileSync(vendorPath, 'utf8'))
// 扫**全部** src-client（组件可能被拆到 panes/*）
const { readdirSync } = await import('node:fs')
const jsFiles = readdirSync(join(root, 'src-client')).filter((f) => f.endsWith('.js'))
const used = [...new Set(jsFiles.flatMap((f) => usedTags(readFileSync(join(root, 'src-client', f), 'utf8'))))]

console.log(`组件库对账 · import ${imports.length} 个 · 使用 ${used.length} 个 · 扫描 ${jsFiles.length} 个前端文件`)
const problems = evaluate(imports, used)
console.log('  import：' + imports.join(', '))
console.log('  使用  ：' + used.join(', '))
console.log('  ⚠ 局限：只对账**字面量**；组件多经 `UI.*` **运行时创建**（静态扫不到调用点）')
console.log('          ⇒ 本门**不证明**"组件真的被渲染"，渲染级证据见 `ui-geo-regress`')
if (problems.length) {
  console.log('')
  problems.forEach((p) => console.log('❌ ' + p))
  console.log(`\nFAIL（${problems.length} 项）`)
  process.exit(1)
}
console.log('\nPASS（组件库 import 与字面量使用双向一致）')
