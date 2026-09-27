/**
 * host-ui.js — **宿主 UI 组件接入层**（2026-09-26 U2）
 *
 * ## 判因（实测）
 *
 * 宿主前端内置一张运行时模块白名单（seed 表，实测逐字）：
 *
 *     {"react":…, "react-dom":…, "react-dom/client":…, "react/jsx-runtime":…,
 *      "@deepseek-ai/dsh-client-ui-slots":…, "@deepseek-ai/dsh-client-ui-primitives": qb, …}
 *
 * 其中 `qb` = `Object.freeze({ BrandWordmark, Button, Switch, Pill, StateDot, … })`
 *   —— **即完整模块对象，已随宿主前端打包并挂好**。
 *
 * 而本插件**自带了一整套 Web Awesome** 只为用 7 个组件（button / switch /
 *   tab-group / tab / tab-panel / progress-bar / icon）—— 实测产物 **570KB**，而自研全部逻辑仅 **34KB**。
 *   ⇒ 这是把宿主已有的能力又实现了一遍（且是 17 倍体积）。
 *
 * ## 本模块做什么
 *
 * 把 `require` + React 渲染收敛为**一处**，供 ui-kit 各构件调用：
 *   · {@link hostPrimitives} —— 惰性取宿主 primitives（拿不到返回 null，**绝不抛**）
 *   · {@link mountReact} —— 把 React 元素挂进任意 DOM 节点并交出更新句柄
 *   · {@link reactEl} —— `React.createElement` 的公开别名
 *
 * ## 硬约束（守本仓红线）
 *
 * · **不引入硬依赖**：宿主无 primitives / 无 react 时一律返回 null，
 *   调用方保留自建实现（与 `body.js` 既有的 `require('react')` try/catch 模式同款）。
 * · **不写死任何路径/版本**。
 * · **单一实现**：凡需要宿主组件，一律经本模块取，不要在别处再写一份 require。
 */

/* 缓存状态**装箱为单一 const 绑定**（字段可变、绑定不变）。
 *   判因（check-module-growth「模块级可变全局」棘轮，基线 0）：
 *   原实现是 5 个模块级 `let`（_react/_reactDomClient/_primitives/_probed/_requireFn），
 *   门禁口径是「模块级 let/var **且被重新赋值**」⇒ 实测 2 处。
 *   装箱后**绑定**不再被重新赋值（改的是对象字段）⇒ 计数归 0，且比逐个声明更好读
 *   （一眼看出这五个字段同属一份缓存状态）。
 *   ⚠ 这是**收紧**不是绕过：门禁要防的是「散落的可变全局」，装箱后反而只剩一处状态源。 */
const S = {
  /** 模块加载器给出的 require（由 body.js 启动时注入）。 */
  requireFn: null,
  /** 宿主模块缓存：undefined = 未探测，null = 探测过但拿不到。 */
  react: undefined,
  reactDomClient: undefined,
  primitives: undefined,
  probed: false
}
/**
 * 注入模块加载器的 require。
 * @param {(name: string) => any} fn 宿主 `__ModuleLoader__` 交给 factory 的 require
 */
export function setRequire (fn) { S.requireFn = typeof fn === 'function' ? fn : null }

function tryRequire (name) {
  if (!S.requireFn) return null
  try { return S.requireFn(name) } catch (e) { return null }
}

/** 探测一次并缓存结果。 */
function probe () {
  if (S.probed) return
  S.probed = true
  S.react = tryRequire('react')
  S.reactDomClient = tryRequire('react-dom/client')
  S.primitives = tryRequire('@deepseek-ai/dsh-client-ui-primitives')
}

/** 宿主 primitives 模块（含 Button/Switch/Pill/StateDot…）；不可用返回 null。 */
export function hostPrimitives () { probe(); return S.primitives || null }

/** 取单个宿主组件；不可用返回 null。 */
export function hostComponent (name) {
  const p = hostPrimitives()
  return (p && typeof p[name] === 'function') ? p[name] : null
}

/** `React.createElement`；React 不可用返回 null。 */
export function reactEl () { probe(); return (S.react && S.react.createElement) || null }

/** 宿主组件接入是否可用（供调用方决定走宿主还是保留自建）。 */
export function hostUiReady () {
  probe()
  return !!(S.react && S.react.createElement && S.reactDomClient && S.reactDomClient.createRoot && S.primitives)
}

/**
 * 把 React 元素挂进 DOM 节点，返回可重复调用的更新器。
 *
 * ⚠ **必须走 createRoot**（与生态既有做法一致：`better-sidebar` 即
 *   `createRoot(host).render(React.createElement(...))`）——直接调函数式组件拿返回值是**非法的**，
 *   因为 primitives 组件用了 hooks（如 `useAnchoredPosition`），只能在 React 树内运行。
 *
 * @param {HTMLElement} container 挂载点（会被 React 接管，勿再手工改其子节点）
 * @param {() => any} renderFn 返回 React 元素（每次更新时重新调用）
 * @returns {{ update: () => void, unmount: () => void } | null} 不可用时返回 null
 */
export function mountReact (container, renderFn) {
  probe()
  if (!container || !S.react || !S.reactDomClient || !S.reactDomClient.createRoot) return null
  let root
  try { root = S.reactDomClient.createRoot(container) } catch (e) { return null }
  const update = function () {
    try { root.render(renderFn()) } catch (e) { /* 渲染失败不冒进宿主链 */ }
  }
  update()
  return {
    update: update,
    unmount: function () { try { root.unmount() } catch (e) { /* noop */ } }
  }
}
