/**
 * contract-global.js — 把接口契约挂到 `window.__SC_CONTRACT__`（UI1/U2 · 2026-09-15）
 *
 * **为什么单独成件**（实测根因）：
 *   `entry.js` 原先写作
 *     ```js
 *     import { PANEL_CONTRACT } from './panel-contract.generated.js'
 *     if (typeof window !== 'undefined') window.__SC_CONTRACT__ = PANEL_CONTRACT
 *     import './body.js'          // ← ESM 的 import 是**静态提升**的
 *     ```
 *   ⇒ `body.js` 的模块代码（其 IIFE 里的 `var CONTRACT = window.__SC_CONTRACT__`）
 *      **在赋值语句之前执行**。此前只是**碰巧** esbuild 的产物排序让赋值先跑；
 *     加入 `panes-config.js` 依赖后拓扑序变化 ⇒ 该巧合破裂 ⇒
 *     **产物里读取(L8095) 早于赋值(L11887)** ⇒ `CONTRACT` 恒为 `null` ⇒ 契约预检全线失效。
 *
 * **本件的保证**：ESM 语义规定「**被 import 的模块先求值**」 ⇒ 只要 `entry.js` 在
 *   `import './body.js'` **之前** import 本件，赋值就**必然**早于 body 的模块代码。
 *   ⇒ 不再依赖打包器的巧合排序。
 */
import { PANEL_CONTRACT } from './panel-contract.generated.js'

if (typeof window !== 'undefined') window.__SC_CONTRACT__ = PANEL_CONTRACT
