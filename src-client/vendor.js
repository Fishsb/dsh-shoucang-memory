/**
 * vendor.js — 第三方组件库接入（U2 重写 · 2026-09-26）
 *
 * ## 判因：这里从「自带整套 Web Awesome」改为「一个组件都不带」
 *
 * 原实现 import 了 7 个 WA 组件（button / progress-bar / tab-group / tab / tab-panel /
 * switch / icon）+ 其**主题令牌层**（展平后 302KB）。实测产物构成：
 *
 *     WA 组件代码段 272KB + vendor 主题 CSS 302KB = **574KB**
 *     而自研全部业务逻辑仅 34KB        （总产物 805KB）
 *
 * 即：**为了 7 个组件背着 574KB**，而这些组件宿主 primitives 全都提供
 * （宿主前端 seed 表白名单实测：`"@deepseek-ai/dsh-client-ui-primitives": qb`，
 *   `qb` = `Object.freeze({Button, Switch, Pill, StateDot, DisclosureRow, SegmentedTabs, …})`）。
 *
 * ## 现在各构件怎么取组件（见 ui-kit.js / host-ui.js）
 *
 *   toggle   → 宿主 `Switch`｜降级 自绘 `input.checkbox-container`（本面板既有实现）
 *   button   → 宿主 `Button`｜降级 自绘 `.sc-btn`（本面板既有实现）
 *   tabs     → 宿主 `SegmentedTabs`｜降级 自绘 `.sc-tabnav/.sc-tabbtn`
 *   progress → 自绘 `.sc-prog-track/.sc-prog-fill`（宿主**无**进度条原语）
 *
 * ⇒ 降级路径**全部回到本面板自有的 CSS 基座**，不再依赖任何第三方组件库。
 *   `wa-*` 使用点已全仓清零。
 *
 * ## 为什么可以安全删除
 *
 * 组件库**不是运行时必需**：宿主 primitives 由宿主的模块系统提供（seed 表白名单），
 * 降级路径由本面板自己的 CSS 承担。二者都**不经过本文件**。
 */

/** 组件库接入面（U2 后为空 —— 这是「零第三方组件依赖」的可机检事实）。 */
export const VENDOR = {
  name: 'none',
  /* 空数组：门禁据此断言「产物里不应再出现 wa-* 组件」。
   * ⚠ 若将来确需引入某组件，**先在此登记**再 import——登记与使用必须同源（check-ui-components 守）。 */
  elements: []
}
