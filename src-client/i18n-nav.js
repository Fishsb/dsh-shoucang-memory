/**
 * i18n-nav.js — 导航文案层（自 `body.js` 抽出 · 2026-09-17）
 *
 * **为什么抽出来（两条判因，都是实测）**：
 *
 * ① **冻结棘轮**：`check-module-growth` 报 `body.js` 实测 708 > 基线 626 + 容差 15（+82）——
 *    i18n 接线（导航文案表 + 取值函数 + 语言切换补丁）把 body.js 顶穿。按项目纪律，
 *    出路是**按领域接缝拆出一块**（不是按行数硬切）。「导航文案」正是内聚的真接缝：
 *    视图表、标签映射、补丁三件事只有这一个归属，拆出后 body.js 只留消费点。
 *
 * ② **单一实现（更关键）**：`panes-settings.js` 的「启动时视图」下拉曾直读
 *    `appState.views` 元组索引 1 当显示标签。`body.js` 把该位从**中文文案**改为**词表键**
 *    （为支持语言切换）后，该消费者便开始吐出裸键 —— 因为 zh 态 `tr()` **不查表**
 *    （这正是「zh 零回归」的结构性保证），键名被原样上屏 ⇒ **zh 态红线被违反**。
 *    本模块把 `navLabelById` 定为**唯一出口**，body.js 与 panes-settings.js 共用
 *    ⇒ 从结构上杜绝「再造一条取值路径」。
 *
 * ⚠ **两个取值函数刻意写成显式 `tr('中文')` 分派**，不用 `tr(NAV_TEXT[id].key)` 动态取键：
 *   `check-i18n-keys` 断言 A 要静态比对「调用点 key 集 == EN 词表 key 集」，
 *   键若经变量中转则 AST 看不到调用点 ⇒ 词表侧全被判**死键**而误红。
 *   **新增视图时必须同步**：本文件（`VIEWS` + `navLabelById`）与 `i18n-dict-nav.js`，
 *   漏一处即断言 A 红。
 */
import { tr } from './i18n.js'

/**
 * 视图表：`[视图 id, 词表键, 图标, 分组词表键]`。
 *
 * `v[0]`（视图 id）是**稳定锚点** —— `data-view` 属性、状态机、深链（`#sc=<id>`）
 * 全程用它，与语言无关。`v[1]`/`v[3]` 是**词表键，不是显示文案**；显示名一律经
 * `navLabelById()` / `navGroupByKey()` 取，**不要再直读元组当文本**（踩过一次）。
 */
export var VIEWS = [
  ['overview', 'nav.overview', 'overview', 'nav.group.overview'],
  ['memory', 'nav.memory', 'memory', 'nav.group.memory'],
  ['persona', 'nav.persona', 'persona', 'nav.group.memory'],
  ['suite', 'nav.suite', 'suite', 'nav.group.run'],
  ['deepsleep', 'nav.deepsleep', 'sleep', 'nav.group.run'],
  ['observe', 'nav.observe', 'observe', 'nav.group.run'],
  ['arch', 'nav.arch', 'arch', 'nav.group.run'],
  ['toggles', 'nav.toggles', 'toggles', 'nav.group.config'],
  ['settings', 'nav.settings', 'settings', 'nav.group.config'],
];

/** 按**视图 id** 取显示名。未知 id 原样返回（不抛，便于扩展视图时不炸面板）。 */
export function navLabelById (id) {
  if (id === 'overview') return tr('运行总览')
  if (id === 'memory') return tr('记忆库')
  if (id === 'persona') return tr('画像')
  if (id === 'suite') return tr('插件集合')
  if (id === 'deepsleep') return tr('深度睡眠')
  if (id === 'observe') return tr('运行观测')
  if (id === 'arch') return tr('架构')
  if (id === 'toggles') return tr('参数')
  if (id === 'settings') return tr('设置')
  return id
}

/** 按**分组键**取显示名（同上：显式调用，未知键原样返回）。 */
export function navGroupByKey (key) {
  if (key === 'nav.group.overview') return tr('总览')
  if (key === 'nav.group.memory') return tr('记忆')
  if (key === 'nav.group.run') return tr('运行')
  if (key === 'nav.group.config') return tr('配置')
  return key
}

/**
 * 定向补丁：语言切换后，刷新那些**整页重渲染刷不到**的节点。
 *
 * 判因（v2.1 §六 易漏面）：左导航（9 项 + 4 分组标题）与导航标题在 `buildModal()` 里
 *   **一次性构建**，`refreshCurrentView()` 只重绘 `refs.view` 内部 ⇒ 语言切换后
 *   导航仍是旧语言。DOM 直插的侧栏兜底入口同理（`mountSidebarEntry` 首行有
 *   `if (document.getElementById('scpanl-btn')) return true` ⇒ 不会重建）。
 *
 * **只改文本/属性，不动结构**（零风险：改不到就是没改，不会破坏布局）。
 * `rootSel` 默认 `#scpanl-root`（面板自有壳）；插槽路径下入口不在壳内，故单独处理。
 */
export function relabelChrome (rootSel) {
  var root = rootSel || '#scpanl-root'
  try {
    // ① 导航项：按 data-view 精确定位（P0 加的稳定锚点），逐项换文本 + aria
    var items = document.querySelectorAll(root + ' .sc-nav-item[data-view]')
    for (var i = 0; i < items.length; i++) {
      var id = items[i].getAttribute('data-view')
      var lbl = navLabelById(id)
      var span = items[i].querySelector('span')
      if (span) span.textContent = lbl
      items[i].setAttribute('aria-label', lbl)
    }
    // ② 分组标题：按当前语言重排（分组文案与顺序都由 VIEWS 决定）
    var groups = document.querySelectorAll(root + ' .sc-nav-group')
    var seen = []
    VIEWS.forEach(function (v) { if (v[3] && seen.indexOf(v[3]) === -1) seen.push(v[3]) })
    for (var k = 0; k < groups.length && k < seen.length; k++) groups[k].textContent = navGroupByKey(seen[k])
    // ③ 导航标题
    var title = document.querySelector(root + ' .sc-nav-title')
    if (title) title.textContent = tr('守藏 SHOUCANG')
    // ④ 模态 aria-label（读屏用）
    var modal = document.getElementById('scpanl-modal')
    if (modal) modal.setAttribute('aria-label', tr('守藏记忆面板'))
    // ⑤ DOM 直插的兜底入口（该路径下插槽不可用；入口不会重建，须就地改）
    var lblBtn = document.getElementById('scpanl-btn')
    if (lblBtn) {
      lblBtn.title = tr('守藏面板')
      var lab = lblBtn.querySelector('span, [data-slot] span')
      if (lab) lab.textContent = tr('守藏')
    }
  } catch (e) { /* 补丁失败不影响主链路 */ }
}
