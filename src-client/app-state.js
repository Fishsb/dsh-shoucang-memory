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
}
