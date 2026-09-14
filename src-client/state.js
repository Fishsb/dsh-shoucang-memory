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

export const Bus = (function () {
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
export const Store = (function () {
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

export const Log = (function () {
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
export const Prog = {
  start: function (id, label) {
    Store.patch('progress', Object.assign({}, Store.get('progress'), make(id, { id: id, label: label || '', pct: 0, note: '进行中', on: true })));
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
    p[id] = Object.assign({}, cur, { on: false, pct: 100, note: msg || (ok ? '完成' : '失败'), ok: ok !== false });
    Store.set('progress', p); Bus.emit('progress', p);
    var self = this;
    setTimeout(function () {
      var q = Object.assign({}, Store.get('progress')); delete q[id];
      Store.set('progress', q); Bus.emit('progress', q);
    }, ok === false ? 6000 : 1800);
  }
};
