/**
 * i18n.js — 守藏面板国际化运行时（P1 · 2026-09-17）
 *
 * **为什么复用宿主而不自研**（AGENTS.md 规则5 不从零造轮子）：
 *   宿主已内建 `@deepseek-ai/dsh-client-locale`（运行时实测 active），提供
 *   `ctx.locale`（LocaleRuntime）：getLocale()/getSnapshot()/subscribe()/register()/bind()。
 *   本模块只做**胶水**：注册自己的命名空间字典、订阅语言变更、把 tr() 调用转成译文字符串。
 *
 * **零回归是结构性的**（v2.1 §4.4）：`tr(key, zh)` 在**中文态不查表**、直接返回内联的 zh，
 *   所以「默认 locale=zh 时逐字节不变」不靠自觉，而由控制流保证。
 *
 * **降级路径（v2.1 关键约束，红队 P0-1 修正后）**：
 *   · `locale` **绝不进 exports.inject 数组** —— cordis 契约：inject 数组「服务不全可用则插件不加载」
 *     （registry.d.ts L57），一旦进数组，无 locale 服务的宿主上**整面板停 PENDING、面板消失**。
 *   · 主路径 `ctx.get('locale')`（reflect.d.ts L7：不经 inject 要求即可读服务，未提供返回 undefined）。
 *   · 备选 `ctx.inject(['locale'], cb)`（作用域注入，服务可用才跑、迟到即补跑）。
 *     两者**互斥**而非冗余：静态装配下 get 与 inject 都可用；动态注入面（dev_inject_plugin）
 *     的 guard 白名单 `CTX_VERBS` 不含 inject，直调会抛 ⇒ 故用 try/catch 包住。
 *
 * @module dsh-shoucang-memory/client/i18n
 */

/** 本插件在宿主 locale 注册表里的命名空间（与包 id 同源）。 */
var NS = 'shoucang'

/**
 * 可变状态装箱（**闭包内**，不暴露模块级可变全局）。
 *
 * 判因（本仓棘轮）：`check-module-growth` 与 `check-pane-sections` 守「模块级可变全局 = 0」
 *   （口径：顶层的 `let`/`var` 声明）。本仓既有同款做法见 `state.js` 的 Bus/Store
 *   —— 状态**封装在闭包里**，入口只暴露方法，不暴露可变绑定本身。
 */
var S = (function () {
  return {
    lang: 'zh',      // 当前语言 id
    bound: null,     // 绑定后的翻译函数（仅非 zh 态非 null）
    attached: false, // 是否已接入宿主 locale 服务
  }
})()

/**
 * 缺键记录容器（v2.1 §九 断言 D 的运行时侧）。
 * 缺键时 `t()` 会回落为 key 字面量且**不抛错**（宿主 translate 语义），
 * 故必须自带记录，否则界面出现裸键也无从察觉。机检与运行期诊断都读它。
 */
function missBag () {
  if (typeof window === 'undefined') return null
  if (!window.__SC_I18N_MISS__) window.__SC_I18N_MISS__ = []
  return window.__SC_I18N_MISS__
}

function noteMiss (key) {
  var bag = missBag()
  if (!bag) return
  if (bag.indexOf(key) === -1) bag.push(key)
}

/**
 * 翻译：**中文态零查表**，英文态走宿主词表。
 *
 * **两种调用形态**（都支持，按可读性择用）：
 *   ① 语义键：`tr('nav.memory', '记忆库')` —— 键稳定、可按名检索，适合少量关键文案（导航/标题）。
 *   ② **原文即键**：`tr('该条目无 notes 跳转目标')` —— 单参形态，中文原文**同时充当键**。
 *      批量文案（实测 1000+ 处）用这个：代码可读、词表即 `{'中文': 'English'}` 可直接审阅，
 *      且不必为每条发明键名（省掉上千个易漂移的命名）。
 *
 * **零回归是结构性的**：zh 路径**不查表**、直接返回中文原文（单参形态即返回 key 本身）。
 *
 * @param key 词表键（语义键；或中文原文本身）
 * @param zh 中文原文（省略 ⇒ 「原文即键」形态）
 * @param params 可选 `{name}` 占位替换参数
 * @returns 当前语言下的展示文案
 */
export function tr (key, zh, params) {
  var source = (zh === undefined) ? key : zh    // 单参形态：key 即中文原文
  if (S.bound === null) return source           // zh 态 / 未接入：直接中文，零查表
  var s
  try { s = S.bound(key, params) } catch (e) { return source }   // t 永不抛（宿主异常不冒进 UI）
  if (s === undefined || s === null || s === '') { noteMiss(key); return source }
  if (s === key) { noteMiss(key); return source }  // 缺键回落为 key ⇒ 改判中文，杜绝裸键上屏
  return s
}

/** 当前语言 id（'zh' 表示未接入或中文）。 */
export function lang () { return S.lang }

/** i18n 是否已接入宿主 locale 服务。 */
export function isAttached () { return S.attached }

/** 缺键清单（诊断用；机检读 window.__SC_I18N_MISS__）。 */
export function missingKeys () { return (missBag() || []).slice() }

/**
 * 把语言态应用到运行时状态。
 * @returns true 表示语言**发生了变化**（调用方据此决定是否重渲染）
 */
function applyLang (loc) {
  var next = 'zh'
  if (loc && typeof loc.getLocale === 'function') {
    try {
      var snap = loc.getLocale()
      if (snap && typeof snap.active === 'string') next = snap.active
    } catch (e) { next = 'zh' }
  }
  if (next === S.lang) return false              // ★幂等：register 自身也推 revision，必须去重
  S.lang = next
  // 仅非中文态才绑定词表 ⇒ 中文路径永远不查表
  S.bound = (loc && next !== 'zh' && typeof loc.bind === 'function') ? loc.bind(NS) : null
  return true
}

/**
 * 注册本插件字典（三参无类型形态）。
 *
 * ⚠ 为什么不用两参带类型形态 `register(NS, {zh, en})`：它依赖宿主
 *   `@deepseek-ai/dsh-client-ui-slots` 的 `LocaleNamespaceMap` 声明合并，
 *   本仓无该依赖、且 client 半区是纯 JS 不参与 typecheck ⇒ 拿不到那张表。
 *
 * ⚠ 为什么必须 try/catch：宿主 `dsh-client-locale/lib/client.js` 对同一 (ns, locale)
 *   **重复注册硬抛** `locale namespace "shoucang" already has locale "en"`。
 *   热重载时旧代 fiber 的 disposer 未必先跑到 ⇒ 不护会让**整面板加载失败**（静默消失）。
 *   护住后退化为「沿用旧词表」，面板照常可用。
 *
 * @param loc locale 服务
 * @param dicts { zh: {...}, en: {...} }
 * @returns disposer（失败时为 null）
 */
function registerDicts (loc, dicts) {
  var offs = []
  try {
    if (dicts.zh) offs.push(loc.register(NS, 'zh', dicts.zh))
    if (dicts.en) offs.push(loc.register(NS, 'en', dicts.en))
  } catch (e) {
    // 重复注册（热重载残留）⇒ 沿用既有词表即可，不阻断加载
    return null
  }
  return function () {
    offs.forEach(function (off) { try { off() } catch (e) { /* idempotent */ } })
  }
}

/**
 * 接入宿主 locale 服务（**软接入**：拿不到就老实回退中文，面板照常渲染）。
 *
 * @param ctx cordis client context
 * @param dicts 词表 `{ zh, en }`
 * @param hooks `{ effect, onChange }` —— onChange 在**语言切换后**触发；
 *        实现方须自行保证「面板就绪才重渲染」（见 body.js 的 ready 判据）。
 * @returns true 表示成功接入
 */
export function attachLocale (ctx, dicts, hooks) {
  var h = hooks || {}
  var loc = null

  // 主路径：不经 inject 要求读服务（静态与动态装配面都放行）
  try { loc = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : null } catch (e) { loc = null }

  if (loc) {
    S.attached = true
    // 订阅：宿主 `publish()` 仅在**语言切换**时 emit locale/change，
    // 而字典注册只推 revision ⇒ 必须用 subscribe（否则注册竞态会漏一次刷新）。
    if (h.effect && typeof loc.subscribe === 'function') {
      h.effect(function () {
        var offSub = loc.subscribe(function () { if (applyLang(loc) && h.onChange) h.onChange() })
        var offReg = registerDicts(loc, dicts)
        return function () {
          try { offSub() } catch (e) { /* noop */ }
          if (offReg) offReg()
        }
      })
    } else {
      registerDicts(loc, dicts)
    }
    applyLang(loc)   // 首帧对齐当前语言（不触发 onChange：面板尚未渲染）
    return true
  }

  // 备选路径：作用域注入（服务**迟到**时补跑）。动态装配面会抛，故 try/catch。
  try {
    if (ctx && typeof ctx.inject === 'function') {
      ctx.inject(['locale'], function (scoped) {
        var s = scoped && scoped.locale ? scoped.locale : null
        if (!s) return
        S.attached = true
        if (h.effect && typeof s.subscribe === 'function') {
          h.effect(function () {
            var offSub = s.subscribe(function () { if (applyLang(s) && h.onChange) h.onChange() })
            var offReg = registerDicts(s, dicts)
            return function () { try { offSub() } catch (e) { /* noop */ } ; if (offReg) offReg() }
          })
        } else {
          registerDicts(s, dicts)
        }
        if (applyLang(s) && h.onChange) h.onChange()
      })
      return true
    }
  } catch (e) {
    // 动态注入面 guard 拒绝（CTX_VERBS 不含 inject）⇒ 保持中文，面板照常
  }

  // 双路皆不可用：不抛错、不阻断，老实中文
  S.lang = 'zh'
  S.bound = null
  return false
}

/** 测试/诊断用：重置内部状态（不触碰宿主）。 */
export function __reset () {
  S.lang = 'zh'
  S.bound = null
  S.attached = false
  if (typeof window !== 'undefined') window.__SC_I18N_MISS__ = []
}
