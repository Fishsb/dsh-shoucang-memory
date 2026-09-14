/**
 * client 半区构建入口（S3 · 2026-09-13）
 *
 * 结构：`entry.js` = ① 第三方组件库（vendor.js，按需 import 即注册 web components）
 *                   ② 面板本体（body.js = 由原 `client.js` 平移而来，沿用 `__ModuleLoader__.load` 自注册契约）
 *
 * 产物：esbuild 打成**单个** `client.js`（IIFE、不压缩）——保持"单产物、即开即用"（用户偏好）。
 *   不引入额外请求：组件库随产物一起送达，宿主仍只加载 `lib/client.js` 一个文件。
 *
 * 为什么保留 IIFE/不压缩：仓内门禁（`check-layout-px` / `audit-css-usage` / `gen-ui-preview`）
 *   都从产物里原地抽取 `var CSS = [ ... ].join('')`；压缩会破坏该锚点与可读性。
 */
import './vendor.js'
import { PANEL_CONTRACT } from './panel-contract.generated.js'

/* S4：接口契约挂全局供面板本体消费（body.js 保持"无 import 的脚本体"，沿用 __SC_VENDOR_CSS__ 同款做法） */
if (typeof window !== 'undefined') window.__SC_CONTRACT__ = PANEL_CONTRACT
import './body.js'
