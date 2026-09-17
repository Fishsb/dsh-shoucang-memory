import { lang, tr } from './i18n.js'
/**
 * state.js — 事件总线 / 状态容器 / 日志 / 进度（自 `body.js` 抽出 · UI1/U1 · 2026-09-15）
 *
 * **为什么可整块搬**：四者**都已是自封装 IIFE**，对外只暴露 `on/emit`（Bus）、`get/set`（Store）等方法 ——
 *   **没有"外部直接修改变量"的路径** ⇒ 搬走后语义不变（U1 方案要求"真状态留入口"，其可满足形式即：
 *   状态**封装在模块内**，入口只持有引用，不再有裸变量被跨模块写）。
 *
 * **依赖闭包（实测）**：Bus ← 无（根）· Store ← Bus · Log ← Bus/Store · Prog ← Bus/Store
 *   ⇒ 四者可一起抽出而不引入环（`Cfg`/`Fold` 亦依赖 Bus，留下一刀）。
 */

var Bus = (function () {
  var m = {};
  return {
    on: function (k, fn) {
      (m[k] = m[k] || []).push(fn);
      return function () { m[k] = (m[k] || []).filter(function (f) { return f !== fn; }); };
    },
    emit: function (k, p) {
      (m[k] || []).slice().forEach(function (f) { try { f(p); } catch (e) { /* 监听者异常不得影响主干 */ } });
    }
  };
})();

/* ---- 2. Store：单一数据源 + 订阅（替代散落的 refs 状态） ---- */
var Store = (function () {
  var s = { view: 'file', logs: [], progress: {}, metrics: {}, errors: [] };
  var subs = [];
  return {
    get: function (k) { return k === undefined ? s : s[k]; },
    set: function (k, v) {
      var old = s[k];
      if (old === v) return v;
      s[k] = v;
      subs.forEach(function (f) { try { f(k, v, old); } catch (e) { } });
      Bus.emit('store:' + k, v);
      return v;
    },
    patch: function (k, o) {
      var base = (typeof s[k] === 'object' && s[k]) ? s[k] : {};
      var next = Object.assign({}, base, o || {});
      return Store.set(k, next);
    },
    sub: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }
  };
})();

/* ---- 3. Log：分级日志（可追溯，替代"后一条覆盖前一条"的状态栏） ---- */
/**
 * **状态栏写入器（注入）** —— `Log.add` 需要更新状态栏文本，但**绝不能**回调 `status()`：
 *   `status() = setStatusText + Log.add` ⇒ 若 `Log.add` 再调 `status()` 即**无限递归**
 *   （实测踩坑：RangeError 栈溢出，任何 error 级状态都会让面板崩溃）。
 * 原实现靠**闭包**直接引用 `setStatusText`；UI1/U1 把它抽成独立模块后，闭包被打破
 * ⇒ 改为**显式注入**（`body.js` 注入 `setStatusText`，**不得**注入 `status`）。
 * 该不变量由 `check-ui-contract` ⑥ 机检。
 */
/**
 * 状态栏写入器**闭包封装**（不用顶层 `let`：模块级可变全局受 `check-module-growth` 棘轮约束，
 *   且闭包对外只暴露 set/get ⇒ 外部无法直接改写，封装更严）。
 */
const statusSinkBox = (function () {
  var fn = null;
  return { set: function (f) { fn = f; }, get: function () { return fn; } };
})();
/** 注入状态栏写入器（只应传 `setStatusText`） */
export const setLogStatusSink = statusSinkBox.set;

var Log = (function () {
  var MAX = 500;
  function add(level, msg, ctx) {
    var e = { t: Date.now(), level: level || 'info', msg: String(msg), ctx: ctx || null };
    var a = (Store.get('logs') || []).concat([e]);
    if (a.length > MAX) a = a.slice(a.length - MAX);
    Store.set('logs', a);
    Bus.emit('log', e);
    // ⚠ 不得回调 status()：status → Log.add → status 会无限递归（实测栈溢出）。
    //   只更新状态栏文本（不写日志），由 status()/fail() 统一负责写日志。
    if (level === 'error') { var _s = statusSinkBox.get(); if (_s) _s(msg, 'error'); }
    return e;
  }
  return {
    add: add,
    info: function (m, c) { return add('info', m, c); },
    warn: function (m, c) { return add('warn', m, c); },
    error: function (m, c) { return add('error', m, c); },
    clear: function () { Store.set('logs', []); Bus.emit('log', null); }
  };
})();

/* ---- 4. Prog：执行进度（C1） ---- */
var Prog = {
  start: function (id, label) {
    Store.patch('progress', Object.assign({}, Store.get('progress'), make(id, { id: id, label: label || '', pct: 0, note: tr("进行中"), on: true })));
    Bus.emit('progress', Store.get('progress'));
  },
  set: function (id, pct, note) {
    var cur = (Store.get('progress') || {})[id]; if (!cur) return;
    Store.patch('progress', Object.assign({}, Store.get('progress'), make(id, Object.assign({}, cur, { pct: Math.max(0, Math.min(100, pct || 0)), note: note || cur.note }))));
    Bus.emit('progress', Store.get('progress'));
  },
  done: function (id, ok, msg) {
    var cur = (Store.get('progress') || {})[id]; if (!cur) return;
    var p = Object.assign({}, Store.get('progress'));
    p[id] = Object.assign({}, cur, { on: false, pct: 100, note: msg || (ok ? tr("完成") : tr("失败")), ok: ok !== false });
    Store.set('progress', p); Bus.emit('progress', p);
    var self = this;
    setTimeout(function () {
      var q = Object.assign({}, Store.get('progress')); delete q[id];
      Store.set('progress', q); Bus.emit('progress', q);
    }, ok === false ? 6000 : 1800);
  }
};

/* ---- 5. Cfg：UI 参数化配置（自由度，localStorage 持久化） ---- */
var Cfg = (function () {
  var KEY = 'shoucang.ui.cfg.v1';
  var DEF = {
    density: 'comfortable',      // comfortable | compact
    navWidth: 216,               // 左导航宽度 px（v9 对齐：方案 --nav-w 216）
    autoRefresh: true,           // 打开面板/写操作后自动刷新
    refreshMs: 60000,            // 轮询间隔（0=关闭）
    showLogs: false,             // 状态栏上方是否显示日志面板（v9 对齐：默认折叠，Ctrl/⌘+Shift+L 唤出）
    logLevel: 'info',            // info | warn | error
    overviewMode: true,          // 概览—详情分层（列表默认折叠详情）
    maxRows: 50,                 // 长列表默认折叠阈值
    startView: 'overview',       // 启动时视图（深链 > 上次视图 > 此项）
    navGroups: true,             // 导航分组显示（v9 设置页该行：按语义显示分组标题）
    footBar: true,               // 页脚健康条（v9 设置页该行：常驻显示记忆库状态与库路径）
    skin: 'v9'                   // 皮肤：v9（方案调色板）| host（跟随宿主主题令牌）
  };
  var cache = null;
  function load() {
    if (cache) return cache;
    cache = Object.assign({}, DEF);
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') cache = Object.assign(cache, o); }
    } catch (e) { }
    return cache;
  }
  return {
    get: function (k, d) { var c = load(); return k === undefined ? c : (c[k] !== undefined ? c[k] : d); },
    set: function (k, v) { var c = load(); c[k] = v; cache = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { } Bus.emit('cfg:' + k, v); return v; },
    reset: function () { cache = Object.assign({}, DEF); try { localStorage.removeItem(KEY); } catch (e) { } Bus.emit('cfg', cache); return cache; },
    defs: function () { return Object.assign({}, DEF); }
  };
})();

/* ---- 5b. Fold：展开/收起的**唯一数据源**（2026-09-12 重构） ----
 * 背景：此前 4 套折叠实现各自存状态——`UI.collapsible` 存 DOM class、`scheduleFold` 存闭包变量、
 *       高级阈值存局部变量、小节树**从 DOM 反推**（`!body.classList.contains('sc-hidden')`）。
 * 后果：① 状态与渲染互相依赖，任何重绘或编程改动即失同步（笔记小节保存后整棵树塌回）；
 *       ② 嵌套项相互影响（父节点 open 由子节点 DOM 参与计算）；
 *       ③ 无法表达「禁用 / 空数据 / 异步中」三种边界。
 * 约定：**DOM 只反映状态，绝不参与状态判定**；key 稳定 ⇒ 可预置、可复位、可按前缀清空防残留。 */
var Fold = (function () {
  var m = {};
  var hasOwn = Object.prototype.hasOwnProperty;
  function norm(k) { return String(k === undefined || k === null ? '' : k); }
  return {
    /* 读：未登记 ⇒ 用调用方给的默认值（默认值不入库，各处可各自定义缺省） */
    get: function (key, dflt) {
      var s = norm(key);
      return hasOwn.call(m, s) ? m[s] : !!dflt;
    },
    /* 写：同值不广播（避免 paint↔set 回环） */
    set: function (key, v) {
      var s = norm(key), next = !!v;
      if (hasOwn.call(m, s) && m[s] === next) return next;
      m[s] = next;
      Bus.emit('fold', { key: s, open: next });
      return next;
    },
    toggle: function (key, dflt) { return Fold.set(key, !Fold.get(key, dflt)); },
    /* 清空：按前缀或全清。切视图 / 换数据源时调用，防止旧 key 的状态残留到新数据上。 */
    clear: function (prefix) {
      var p = (prefix === undefined || prefix === null) ? null : String(prefix);
      var hit = Object.keys(m).filter(function (s) { return p === null || s.indexOf(p) === 0; });
      hit.forEach(function (s) { delete m[s]; });
      if (hit.length) Bus.emit('fold:clear', { prefix: p, keys: hit });
      return hit.length;
    },
    keys: function () { return Object.keys(m); },
    size: function () { return Object.keys(m).length; },
    _raw: function () { return m; }
  };
})();

/* UI1/U1：**保留 `var X = ` 字面形式**再用具名导出 —— 仓内多件门禁/测试按 `var X = ` 抽区段
 *（`var` 改成 `export const` 会让它们全部失配，实测本件因此连挂两次）。 */
export { Bus, Cfg, Fold, Log, Prog, Store }
