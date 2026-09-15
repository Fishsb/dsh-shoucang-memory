/**
 * derive.js — 判据/格式化派生（自 `body.js` 抽出 · UI1/U1 · 2026-09-15）
 *
 * **为什么它最好抽**：整块是**零外部依赖的纯函数集**（不碰 Store/Bus/document/refs/localStorage），
 *   故不存在 `UI`/`Log` 那种"藏在别处的闭包状态"问题。
 *
 * ⚠ **保留 `var Derive = ` 字面形式 + 末尾具名导出**（不写 `export const`）：仓内多件门禁/测试按
 *   `var X = ` 抽区段，改成 `export const` 会让它们全部失配（UI1/U1 实测连挂两次）。
 */

/* ---- 5b. Derive：派生状态映射（显式逻辑的单一事实源） ----
 * 病根：此前「provider→徽章色 / provider→中文名 / provider→语义召回态 / 水位→等级 /
 * 成员装配→徽章」五组判定，以三元链形式散在 5 处，同一 provider 的口径还不一致
 * （向量区把 DmlExecutionProvider 视作 running，记忆板块把 fusion 视作 running）。
 * 收敛原则：**只搬不走** —— 表内每一项都与原三元链逐值对齐，行为不变；
 * 口径差异不抹平，改由调用方显式传入「本处视作 running 的 provider 列表」。 */
var Derive = (function () {
  /* provider 故障态：这两档在任何视图都是 stalled（未开/未连，与调用方口径无关） */
  var VEC_DOWN = { off: 'stalled', unreachable: 'stalled' };
  /* provider → 展示名（记忆板块徽章；缺省 '关'） */
  var VEC_LABEL = {
    fusion: '融合', 'gpu-ready': '本机就绪', lexical: '词法',
    cloud: '云端', unreachable: '服务未连', off: '关'
  };
  /* provider → 语义召回态（记忆板块 §7；仅这两档有正向文案，其余 '—'） */
  /* 水位阈值（百分比）：≥stalled 红 / ≥suspect 黄 / 其余绿 */
  var CAP_PCT = { stalled: 85, suspect: 60 };
  /* 被引用列表超出该条数时折叠为「… 共 N 处」 */
  var BACKREF_LIMIT = 8;
  /* 成员装配状态 → 徽章文案 + 语义类 */
  /* v9 严格对齐：原型 .pmeta 右 span 是「已装配」纯文字，不暴露内部基准口径（injected/profile）。
   *   本处文案改回原型，口径差异移入 title（悬浮可见，信息不丢）。 */
  var SUITE_STATUS = {
    both: { text: '已装配', kind: 'ok', tip: '注入器 + profile 双基准' },
    injected: { text: '已装配', kind: 'ok', tip: '注入器装配' },
    profile: { text: '已装配', kind: 'ok', tip: 'profile 装配' },
    missing: { text: '未装配', kind: 'error', tip: '两基准均未装配（member 独立可装）' }
  };
  var SUITE_FALLBACK = { text: '未装配', kind: 'info', tip: '状态未知' };
  /* 归一化：null/undefined/空串都算「缺省」。调用点原本用 `p || 'off'` 兜底，
   * 这里把兜底收进来，保证两种写法（外层兜 / 不兜）结果一致。 */
  function s(v, dflt) { return String(v === undefined || v === null || v === '' ? dflt : v); }
  var hasOwn2 = Object.prototype.hasOwnProperty;
  /* 只查自有属性：直接 obj[k] 会沿原型链命中 constructor/toString 等，
   * 把「未登记的 provider」误判成已登记（返回 Function 是 truthy）。 */
  function pick(o, k, dflt) { return hasOwn2.call(o, k) ? o[k] : dflt; }
  return {
    CAP_PCT: CAP_PCT, BACKREF_LIMIT: BACKREF_LIMIT,
    VEC_LABEL: VEC_LABEL,   VEC_DOWN: VEC_DOWN,
    SUITE_STATUS: SUITE_STATUS,
    /* provider → 徽章 kind。running 档由调用方显式给出（各视图口径不同，见上注）。 */
    providerKind: function (p, runningList) {
      var k = s(p, 'off');
      if (runningList && runningList.indexOf(k) >= 0) return 'running';
      return pick(VEC_DOWN, k, 'ended');
    },
    /* provider 是否未就绪（off / unreachable）——决定是否出兜底/引导提示。
   * 注意不做 'off' 兜底：原判据 `p === 'off' || p === 'unreachable'` 在 p 缺失时为 false
   * （记忆板块 §7 传的是裸 `data.vector.provider`），兜底会把「未上报」误判成「已关闭」。 */
    providerDown: function (p) { return hasOwn2.call(VEC_DOWN, String(p)); },
    vecLabel: function (p) { return pick(VEC_LABEL, s(p, 'off'), '关'); },
    capKind: function (pct) {
      var n = Number(pct) || 0;
      return n >= CAP_PCT.stalled ? 'stalled' : n >= CAP_PCT.suspect ? 'suspect' : 'ended';
    },
    suiteStatus: function (st) { return pick(SUITE_STATUS, String(st), SUITE_FALLBACK); },
    /* 判空：替代散落的 `x && x.length`（20+ 处）。注意与 `!x.length` 的差异——
       后者在 x 为 null/undefined 时直接抛错，has() 返回 false（把崩溃变成空态）。 */
    has: function (v) { return !!(v && v.length); },
    /* 取数：替代 `(x || []).length`（取值场景用，缺省 0） */
    count: function (v) { return (v && v.length) || 0; },
    /* 千分位（v9 对齐：`3,204` / `3,100 / 5,000 字符`；此前裸数字） */
    num: function (v) {
      if (v === null || v === undefined || v === '') return '—';
      var s = String(v);
      return /^-?\d+$/.test(s) ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : s;
    },
    /* 向量区可见性：原判据 `data.vector && data.vector.enabled !== false` */
    vectorOn: function (data) { return !!(data && data.vector && data.vector.enabled !== false); }
  };
})();

/* UI1/U2（2026-09-15）：`fmtTime` 自 `body.js` 迁入（**共享格式化工具**）。
 *  它原有 **7 个调用点、跨 5 个视图** ⇒ 若随某个 pane 走，其余调用点要反向 import（造环）；
 *  故此归"格式化"域（本件），而非某个 pane。 */
export function fmtTime(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  } catch (e) { return String(iso).slice(0, 16); }
}

export { Derive };
