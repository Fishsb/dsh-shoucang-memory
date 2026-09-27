/**
 * host-slots.js — 宿主插槽注册（**领域接缝**抽出 · 2026-09-26）
 *
 * ## 为什么单独成件
 *
 * 本段原在 `body.js`（实测使其 +27 行，越 `check-module-growth` 的冻结棘轮）。
 * 门禁给的出路是「新功能落新模块，或按**领域接缝**拆出一块（不是按行数硬切）」——
 * 这三个插槽注册恰好是一个**真接缝**：
 *
 * · 领域不同：它们是**宿主装配面**（往宿主 UI 挂入口），与面板本体（视图/端点/DOM 壳）无关；
 * · 依赖不同：本文件只依赖 `ctx.slots` + `react` + 三个外来句柄（openPanel / SC_ICON / tr）；
 * · 变更节奏不同：插槽契约随**宿主**升级而变，面板本体随**业务**变。
 *
 * ## 三个席位（契约均实测自 ui-sidebar/contract/slots.d.ts）
 *
 * | 席位 | kind | owner props | 语义 |
 * |---|---|---|---|
 * | `sidebar.footer.action` | list | — | 设置旁的**页脚动作**（按钮） |
 * | `settings.section` | single | — | 宿主设置中心的一个分区 |
 * | `sidebar.panellist` | list | `{ size, active }` | **全局面板图标行**（与宿主 `main` 的 keyed 面板配对） |
 *
 * ⚠ **为何 panellist 只接入口、不接管 `main` 面板**：宿主 `main` 要求 React 组件 + store + locale
 *   契约（范例见 ui-plugin-manager 的 `inject("main", function* () { yield register({ name:"main", … }) })`），
 *   而本面板是**纯 DOM 自建壳**（9 视图 / 47 端点 / REST 轮询）——接管 main 等于整套重写为 React，
 *   是本轮方案 §2.1 **明确否决**的路径（风险面覆盖全部既有行为）。故本席位职责仅限**入口**。
 *
 * ⚠ **panellist 与 footer.action 不是重复**：前者是「全局面板行图标」（带 `active` 选中态、与主列面板配对），
 *   后者是「设置旁的页脚动作」。宿主自己的 plugin-manager / schedule 同样走 panellist。
 *
 * ⚠ **互斥纪律**（沿用 S2）：插槽可用时**不再**挂 DOM 直插入口 —— 否则侧栏出现两个入口（0.1.2 老问题）。
 *   本模块只负责「注册插槽」，返回是否成功；DOM 兜底的决定留给调用方。
 *
 * @module dsh-shoucang-memory/client/host-slots
 */

/**
 * 注册三个宿主插槽。
 *
 * @param {object} p
 * @param {object} p.ctx         宿主 ctx（需 `ctx.effect` + `ctx.slots.inject/register`）
 * @param {Function} p.reactEl   `require('react')` 的结果；不可用传 null
 * @param {Function} p.openPanel 打开自有面板
 * @param {string}  p.iconSrc    面板图标（data URI）
 * @param {Function} p.Tr        i18n 翻译函数（`tr`）
 * @param {Function} p.SettingsSection 设置分区组件（`ShoucangSettingsSection`）
 * @returns {boolean} 插槽是否可用并已注册（false ⇒ 调用方应走 DOM 直插兜底）
 */
export function registerHostSlots (p) {
  var ctx = p.ctx
  var reactEl = p.reactEl
  var openPanel = p.openPanel
  var SC_ICON = p.iconSrc
  var tr = p.Tr
  var ShoucangSettingsSection = p.SettingsSection

  /* 契约门槛：任一条件不满足 ⇒ 走既有 DOM 直插（行为与旧版一致，零回归）。
   * ⚠ 本判定**原样搬移**（含判因），未改语义。 */
  var SLOT_OK = !!(reactEl && typeof reactEl.createElement === 'function' &&
    ctx && typeof ctx.effect === 'function' && ctx.slots && typeof ctx.slots.inject === 'function' &&
    typeof ctx.slots.register === 'function')
  if (!SLOT_OK) return false

  ctx.effect(function () {
    return ctx.slots.inject('sidebar.footer.action', function () {
      // 0.1.2 契约：组件作为 register 的第二个参数（options.component 已不再被读取）
      var open = openPanel
      var ShoucangToggle = function () {
        // 纯 DOM 插件无 react 运行时 → 渲染 null（React 组件返回 null 合法，空槽不崩）
        if (!reactEl || typeof reactEl.createElement !== 'function') return null
        return reactEl.createElement(
          'button',
          { type: 'button', title: tr('守藏面板'), className: 'sc-trigger', onClick: function () { open() } },
          reactEl.createElement('img', { src: SC_ICON, alt: tr('守'), style: { width: 22, height: 22, display: 'block' } }),
          reactEl.createElement('span', { className: 'sc-trigger-label' }, tr('守藏'))
        )
      }
      return ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'shoucang-panel-toggle',
        label: function () { return tr('守藏面板') }
      }, ShoucangToggle)
    })
  }, 'shoucang-panel: footer action')

  /* S2：界面偏好进宿主设置中心（settings.section）；面板内「设置」视图保留作兜底与高级项 */
  ctx.effect(function () {
    return ctx.slots.inject('settings.section', function () {
      return ctx.slots.register({
        name: 'settings.section',
        id: 'shoucang',
        order: 60,
        label: function () { return tr('守藏') }
      }, ShoucangSettingsSection)
    })
  }, 'shoucang-panel: settings section')

  /* ── sidebar.panellist 已移除（2026-09-26 · 用户实测反馈 + 源码取证）──────────
   * 【现象】侧栏出现**两个**守藏入口，上面那个点不开面板。用户要求保留上面、取消下面。
   * 【取证】读宿主实现（dsh-client-ui-sidebar/lib/client.js）：
   *     button (宿主自己建) { onClick: () => { selectPanel(id) }
   *       children: renderSlot('sidebar.panellist', { size, active }, { only: id }) }
   *   三条硬事实：
   *     ① 宿主**自带 button 并独占 onClick** —— 我们 render 的组件在其 children 里，
   *        自身的 onClick **永远不会被调用**（所以"点不开"是必然，不是 bug）。
   *     ② 点击行为是 `selectPanel(id)` —— 切的是**主列面板**（main 席位的 keyed 面板）。
   *        而我们**刻意没有注册 main**（那要求 React+store+locale 全套，接管等于重写面板）。
   *        ⇒ 没有对应 main 面板 ⇒ 点了无任何反应。
   *     ③ 行标题 label 取自宿主的**面板列表元数据**，不是我们 register 时给的 label。
   * 【结论】该席位与「纯 DOM 自建壳 + 浮层」的架构**不兼容**——
   *   它设计给「有 main 面板的插件」（宿主 plugin-manager / schedule 都如此）。
   *   我当初据契约文本推断"只接入口即可"，**未验证宿主消费方式** —— 那是错的。
   * ⚠ 因此**不能**按用户最初设想「保留上面、取消下面」：上面那个**功能上不可能可用**，
   *   保留下面的 footer.action 才是唯一可用入口（也回到 U4 之前的稳定状态）。
   * 若将来真要这个席位，前提是**先有 main 面板** —— 那是整套 React 重写，须单独评估。 */

  return true
}
