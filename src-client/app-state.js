/**
 * app-state.js — 面板**共享句柄容器**（UI1/C′ · 2026-09-15）
 *
 * **它解决什么**：`body.js`（~3800 行单体）里散着 **9 个模块级可变绑定**，它们是 render/壳层/
 *   轮询/侧栏挂载**共同读写**的句柄。它们住在同一个闭包里，任何"把某块搬出去"的尝试都会撞上
 *   "闭包共享状态"这堵墙 —— 实测三次（依赖 20 符号 / 应用层拖 5 符号 / `refs` 跨壳层与视图层）。
 *
 * **它不是什么**：**不是"大 ctx 依赖注入"**。U1 判因已否决"一次性改 69 个函数签名"式的大 ctx。
 *   本件只做一件事：给这 9 个**句柄**一个**显式、可查、单一**的存放处。
 *
 * **为什么不改用 `const`/局部变量**：实测这 9 个**都是"单写点 + 少量读点"的句柄/缓存**
 *   （写 1-3 次、读 0-3 次），语义上就是"可被替换的引用"，用对象字段最贴合原意。
 *
 * **与 `state.js` 的分工**：`state.js` 放**业务状态**（Bus/Store/Log/Cfg/Fold，有 API 封装）；
 *   本件放**渲染/挂载层的句柄**（DOM、定时器、观察者、视图名）。两者不混。
 */

/** 共享句柄容器（字段语义见各自注释；**只放句柄，不放业务数据**） */
export const appState = {
  /** RPC 句柄（`api()`）——由入口在启动时注入。**pane 模块经它取**，而不是各自 import `api.js`
   *  （那会让"谁都能 import 全局服务"，且 pane 与入口的依赖方向变乱）。 */
  api: null,
  /** 状态栏写入器（`status()`）——pane 模块经它报状态，而非 import 全局。 */
  statusFn: null,
  /** 错误定位器（`fail()`）。 */
  failFn: null,
  /** 当前视图重绘器（`refreshCurrentView()`）——pane 改配置后触发刷新。 */
  refreshView: null,
  /** DOM 句柄表（`refs`）——**可变**,UI1/C′ 原则：可变句柄统一在本容器。 */
  refs: null,
  /** 视图注册表（`VIEWS`）——设置页需按视图名跳转/遍历。**只读**语义。 */
  views: null,
  /** 数值格式化（`dsNumber`）。 */
  dsNumber: null,
  /** 深睡/运行附加块渲染器（`renderRunExtras`）——运行观测视图调用。 */
  renderRunExtras: null,
  /** 日志面板应用器（`applyLogPanel`）。 */
  applyLogPanel: null,
  /** 带上下文标签的 RPC 包装（`apiCtx`）——总览卡片用它报错定位。 */
  apiCtx: null,
  /** 操作卡构造器（`opCard`）——总览/观测视图的进度卡。 */
  opCard: null,
  /** 当前视图名（`show()` 维护；`refreshCurrentView` 读） */
  currentView: null,
  /** 轮询定时器句柄（`restartPolling` 写；`0`/`null` 表示未启动） */
  pollTimer: null,
  /** 契约按路径索引（`contractOf` 惰性构建的缓存；未构建为 `null`） */
  contractByPath: null,
  /** 折叠哨兵队列（`deferFold` 入队 / `flushFolds` 取出清空） */
  foldQueue: [],
  /** 记忆视图滚动位置（`renderMemoryExpanded` 与 note 之间传递） */
  memoryViewScroll: 0,
  /** 从 note 返回时的重绘函数（`openMemoryNote` 写 / 返回时读） */
  noteReturnRender: null,
  /** 侧栏挂载用的 DOM 观察者 */
  sidebarObserver: null,
  /** 侧栏挂载重试计数 */
  sidebarTries: 0,
  /** 插槽注册返回的 React 句柄 */
  slotReact: null,

  /* ── 接缝②（2026-09-17 阶段 3）：以下 7 个字段原为「**注入但无声明行**」──
   *  它们是 `body.js` 注入、被 pane 消费的跨模块句柄，却不在本容器声明。
   *  实测（施工期）：app-state 声明 20 / body.js 注入 24 ⇒ **7 个无声明行**。
   *  后果：契约面**不完整** —— 读者按本文件无法知道存在这些句柄，且拼错字段名
   *  （消费 `appState.xxx` 而无人注入）**静默为 undefined**，无任何门禁判它错。
   *  现补齐声明；并新增 `scripts/check-appstate-contract.mjs` 做**四方对账**
   *  （声明 / body 注入 / pane 写 / 全仓消费）—— 任一方出现契约外字段即红。 */
  /** 视图切换器（`show()`）——pane 需按视图名跳转。 */
  show: null,
  /** 开关变更处理器集合（`switchKeys`）——设置/参数页写配置后按 key 派发。 */
  switchKeys: null,
  /** 配置行折叠器（`makeToggle`）——设置页与参数页共用的开关行构造。 */
  makeToggle: null,
  /** 控件元数据徽标构造器（`metaBadges`）——设置行「作用域/生效态」徽标。 */
  metaBadges: null,
  /** 视图行过滤器（`filterViewRows`）——页首搜索框消费。 */
  filterViewRows: null,
  /** 折叠延迟入队（`deferFold`）——渲染期延后折叠，避免强制重排。 */
  deferFold: null,
  /** 折叠队列冲刷（`flushFolds`）——与 `deferFold`/`foldQueue` 配套。 */
  flushFolds: null,

  /** 小节正文渲染器（`renderNoteSections`）—— **为破环而注入**（2026-09-17 阶段 5）：
   *  `panes-memory.js` 原直接 import 它，与 `panes-memory-detail.js` 构成双向环；
   *  改由 `body.js` 注入 ⇒ 依赖单向（detail → memory）。 */
  renderNoteSections: null,
}
