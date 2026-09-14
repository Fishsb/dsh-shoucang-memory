/**
 * 第三方组件库（S3）：**按需 import 即注册**，不做整包引入。
 *
 * 选型（2026-09-13 用户拍板 S3 全量重排）：Web Awesome（原 Shoelace，web components）。
 *   理由：① web components 无框架耦合，天然适配本插件"纯 DOM + 无 React 运行时"的现状；
 *        ② 每个组件自带样式（`*.styles.js` / constructable stylesheet）⇒ 不需要整包主题 CSS；
 *        ③ 官方按钮/卡片/标签页/进度条/徽章可**逐个替换**我们手写的那批（渐进，不推倒重来）。
 *
 * 约定：只 import **实际要用**的组件（tree-shaking + 便于审计"用了什么"）；新增组件须同步本文件。
 *
 * ── P0-1 收尾（2026-09-13）：清掉「import 了却零使用」的 6 个组件 ──
 *   实测口径 = 产物里是否存在 `document.createElement('wa-*')`。真正在用的只有
 *   button / switch / tab-group / tab / tab-panel / **progress-bar（本轮新接入）** + icon（图标库注册的前提）。
 *   下列 6 个**逐项评估后确定不用**，故删 import——要用时重新 import 即可，比养着死依赖干净：
 *     · card    —— `UI.card` 确有 8 个调用点，但 `.sc-card/.sc-card-hd/.sc-card-bd` 与 wa-card 的
 *                  slot 结构**不同构**（无 header/body slot 语义）、视觉层会**叠加**两层卡片
 *                  ⇒ 替换要重写整个卡片层 CSS，风险高而观感无收益；
 *     · badge   —— `UI.badge` **零调用点**（死代码，全仓仅剩定义），替换一个没人用的东西没有意义；
 *     · spinner —— 面板无加载态占位需求（忙碌态走 `busyText` 文案 + 状态栏）；
 *     · tooltip —— 现有提示走原生 `title` 属性（十数处），替换收益仅样式；
 *     · select / option —— **二度回滚**（判因存档见下方 `UI.select` 注释）。图标虽已证实可渲染
 *                  （P2 门禁 `--icon-check` 实测 rendered=true 20x16），但填充/宽度还需再接管
 *                  4–5 个 `--wa-form-control-*` 变量，且验证手段只有出图目视（门禁断言改了就成自证）
 *                  ⇒ 风险/收益比不佳，维持原生 select。
 */
import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/progress-bar/progress-bar.js'
import '@awesome.me/webawesome/dist/components/tab-group/tab-group.js'
import '@awesome.me/webawesome/dist/components/tab/tab.js'
import '@awesome.me/webawesome/dist/components/tab-panel/tab-panel.js'
import '@awesome.me/webawesome/dist/components/switch/switch.js'
import '@awesome.me/webawesome/dist/components/icon/icon.js'
import { registerIconLibrary } from '@awesome.me/webawesome/dist/components/icon/library.js'

import { VENDOR_CSS } from './.vendor-css.generated.js'

/* 主题令牌层（构建期展平）：由面板以独立 <style> 注入。
 * 不走我们的 CSS 数组 —— 那是方案设计系统 + 各门禁的抽取锚点，不该混入第三方样式。 */
if (typeof window !== 'undefined') window.__SC_VENDOR_CSS__ = VENDOR_CSS

/* 自备默认图标库（S3 前置）：本安装的 `dist/assets/icons` **不存在**，WA 默认库取不到任何图标
 *   ⇒ 组件里的图标（如 <wa-select> 的展开箭头）渲染不出来（上一轮因此回滚 wa-select）。
 *   这里用 registerIconLibrary('default', …) 把 resolver 指到**内联 SVG 的 data URL**，无需任何资源文件。
 *   ⚠ 实测（2026-09-13 视觉复核 + 像素穷举）：注册后 <wa-select> 的 shadow DOM **确实出现 <wa-icon> 元素**，
 *     但**渲染尺寸为 0、画面上没有箭头** ⇒ 「注册了」≠「图标能渲染」。下方注册保留（无副作用、且是任何 WA 图标的前提），
 *     但**图标可用性尚未证实**；要用它撑起组件（如 select 的展开箭头），必须先用**渲染尺寸断言**证明，再谈采用。 */
const ICONS = {
  'chevron-down': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M4.2 6.2 8 10l3.8-3.8 1 1L8 12 3.2 7.2z"/></svg>',
  'chevron-up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M8 4l4.8 4.8-1 1L8 6l-3.8 3.8-1-1z"/></svg>',
  x: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M4.5 3.4 8 6.9l3.5-3.5 1.1 1.1L9.1 8l3.5 3.5-1.1 1.1L8 9.1l-3.5 3.5-1.1-1.1L6.9 8 3.4 4.5z"/></svg>',
  check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M6.2 11.4 3 8.2l1.1-1.1 2.1 2.1 5-5L12.3 5z"/></svg>',
  search: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M6.5 2a4.5 4.5 0 1 0 2.8 8l3.3 3.3 1.1-1.1-3.3-3.3A4.5 4.5 0 0 0 6.5 2m0 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6"/></svg>'
}
try {
  registerIconLibrary('default', {
    resolver: (name) => 'data:image/svg+xml,' + encodeURIComponent(ICONS[name] || ICONS['chevron-down']),
    mutator: (svg) => { try { svg.setAttribute('fill', 'currentColor') } catch (e) { /* noop */ } }
  })
} catch (e) {
  /* 注册失败不致命：组件只是没图标（与上一轮同状），但要留痕以便诊断 */
  if (typeof console !== 'undefined') console.warn('[shoucang] 图标库注册失败：' + (e && e.message))
}

export const VENDOR = {
  name: 'webawesome',
  /* 组件名清单一处维护：既可被运行时审计（mount 时校验 customElements 是否齐），也便于后续替换核对。
   * **必须与上方 import 一一对应**（P0-1 收尾时同步收敛：13 → 7）。 */
  elements: ['wa-button', 'wa-progress-bar', 'wa-tab-group', 'wa-tab', 'wa-tab-panel', 'wa-switch', 'wa-icon']
}
