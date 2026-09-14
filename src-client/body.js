/**
 *dsh-shoucang-memory — client 半区（纯 DOM，样式照搬 Obsidian 设置窗口）。守藏单插件 2026-09-08 合并。
 *
 * 视觉规范（Obsidian 默认主题还原）：
 *   - 居中模态：左导航（--background-secondary）+ 右内容（--background-primary），
 *     圆角 12px、大投影、Inter 系字体栈；
 *   - 控件：Obsidian 开关（checkbox-container 胶囊）、setting-item 行（标题+描述+
 *     右侧控件）、边框一律 --background-modifier-border；
 *   - 强调色：Obsidian 紫 hsl(254deg 80% 68%)；深浅色随系统 prefers-color-scheme。
 *
 * 存储格式即 Obsidian：守藏根目录本身是「纯 Markdown + YAML frontmatter +
 * [[双链]]」的目录树，可被 Obsidian 直接作为 vault 打开，本面板不引入任何
 * 非 Obsidian 存储面。
 */
import { CSS } from './styles.js'
import { Bus, Log, Prog, Store, setLogStatusSink } from './state.js'
import { ICONS, el, svg } from './dom.js'

(function () {
  'use strict';

  window.__ModuleLoader__.load({
    id: 'dsh-shoucang-memory',
    factory: function (require) {
      var module = { exports: {} };
      var exports = module.exports;

      var BASE = '/api/shoucang-panel';
      // 入口位：注册进侧栏 footer.action 插槽（现行 cordis client slot 契约）；
      // 直插 footArea 的旧 DOM 方案仅作无 slot 环境的兜底（不再默认启用）
      var inject = ['slots'];

      /* ---------- RPC ---------- */

      /* RPC 统一埋点（2026-09-12 查漏补缺）：
       * 原实现是无上下文的裸 fetch —— 54 处旧调用失败时只剩一句 e.message，无从定位。
       * 现统一注入 ctx（method/path/params）与耗时，并把 ctx 挂在 error 上（e.__ctx）；
       * fail() 会自动读取 e.__ctx ⇒ **所有旧调用点零改动即获得错误定位与调用日志**。 */
      /* S4：接口契约（后端契约表生成的共享产物）——用于**发请求前**预检必填字段。
       *   判因：必填缺失以前要等后端 400 一个来回才暴露；现在本地即拦，错误信息同源（字段名一致）。 */
      var CONTRACT = (typeof window !== 'undefined' && window.__SC_CONTRACT__) || null;
      var CONTRACT_BY_PATH = null;
      function contractOf(path) {
        if (!CONTRACT) return null;
        if (!CONTRACT_BY_PATH) {
          CONTRACT_BY_PATH = {};
          (CONTRACT.routes || []).forEach(function (r) { CONTRACT_BY_PATH[r.path] = r; });
        }
        return CONTRACT_BY_PATH[path] || null;
      }
      function preflight(path, body) {
        var c = contractOf(path);
        /* 用 Derive.has 而非 `!x.length` 裸判空（仓内反模式锁 D7e：x 缺失时裸判空会直接抛错） */
        if (!c || !Derive.has(c.required)) return null;
        if (!body || typeof body !== 'object') return { error: 'preflight_missing_body', detail: path + ' 需要请求体（必填：' + c.required.join(', ') + '）' };
        var miss = c.required.filter(function (k) {
          var v = body[k];
          return v === undefined || v === null || v === '';
        });
        return miss.length ? { error: 'preflight_missing_field', detail: '缺少必填字段：' + miss.join(', ') } : null;
      }
      function api(path, opts) {
        var o = opts || {};
        var t0 = Date.now();
        var ctx = { method: (o.method || 'GET'), path: path, params: o.body || null };
        var pre = preflight(path, o.body);
        if (pre) {
          var pe = new Error(pre.detail);
          pe.__ctx = ctx; pe.preflight = pre.error;
          Log.warn('契约预检未通过：' + pre.detail + '（本地拦截，未发出请求）', ctx);
          return Promise.reject(pe);
        }
        /* C1：慢请求自动反馈——超过 1.5s 未返回则在状态栏显示「执行中…」，
           覆盖全部旧调用点（旧代码看不到进度，"点了没反应"）。
           用 setStatusText 而非 status：不写日志，且结束时清空，避免与业务 status() 互相覆盖。 */
        var busyShown = false;
        var busyTimer = setTimeout(function () { busyShown = true; setStatusText('执行中… ' + path, 'info'); }, 1500);
        function endBusy() { clearTimeout(busyTimer); if (busyShown) { busyShown = false; setStatusText('', 'info'); } }
        return fetch(BASE + path, Object.assign({ headers: { 'content-type': 'application/json' } }, o))
          .then(function (r) {
            return r.json().then(function (j) {
              if (!r.ok) {
                /* S4：契约校验失败会带 detail（如"缺少必填字段：path"）——优先展示它，
                 *   否则状态栏只剩一个干巴巴的 "invalid_request"，用户无从下手。 */
                var err = new Error((j && (j.detail || j.error)) || ('HTTP ' + r.status));
                err.__ctx = ctx;
                err.httpStatus = r.status;
                if (j && j.detail) err.detail = j.detail;
                throw err;
              }
              endBusy();
              /* 结构化的耗时与状态码写进 ctx：v9 观测页的日志行是「✓ GET /path 42ms 200」形态，
               * 靠自由文本 message 反解既脆又假 —— 这里由 api() 直接给出真实值（fetch 的 status + 实测耗时）。 */
              ctx.ms = Date.now() - t0; ctx.status = r.status;
              Log.info(ctx.method + ' ' + path + ' ✓ ' + ctx.ms + 'ms', ctx);
              return j;
            });
          })
          .catch(function (e) {
            if (!e.__ctx) e.__ctx = ctx;
            endBusy();
            Log.error(ctx.method + ' ' + path + ' ✗ ' + (e && e.message ? e.message : String(e)), ctx);
            throw e;
          });
      }

      var SC_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAD90lEQVR4Aeybv65NQRTGL52CB6CRkNAIlUKpoPEIGkoFL6D1ACRaCs+gIFErFBQSJBQKHoBE666v2Mnsndmz98yeNd+cc76bWXfP/7XW9ztz/mafPNIfVQEBoMp/dCQAAkBWgOxeJ0AAyAqQ3esECABZAbJ7nQABICtAdn+YJ4AseuheAEI1CHUBIIgeuhSAUA1CXQAIoocuBSBUg1DvEcB/0yE0a2aVcC3qWYtbT+4RQGsNqP4EgCq/fpAhyy8AhwSAnmuXAeg1gIxFAA4QwDvLGe/P58yGR2Vu3lz/aLE15uah/6uNU0urE3DWskTCsJtW76VcskAQE+ya1ZuXFgBeWVa/zHovHy3A5ifCGwAeWXctsV0pOBHfWwbrCWDp0XTHEj1BMvg219FywXr/mTUpngDwaJom8c06BtFfW51V4HuI43ckiFPWh9ctu/gWLwB46plGft86Lpv1Vs5ZQI/NpqXJ65YXgGkyaL/Ev07ticWFU2GXumVpNw8AsUc/jvtSLOzx2OvCH++gPAB4x9xy/9PezloA2IVH/6DzjaHS6toCQKtcavh5X2OTnD0EIEcth7kC4CBqzpYCkKOWw9zaAPAx3iHM/d2yBADe589ZjS+y5vYu7d9Kb8nvpv1LAGxyqMVjBfYTwDjHrlsCQMZTAgCfbOfstkM+2HPOX6y/dggxH2HfJn8lAFIO36YGC8c89iwMpf6y2gDqR7jnOwoAGbAACABZAbJ7nQABICtAdq8TsD8AyJnsqHudADK42gAeOOTzMGPPnfs9ogRA6vvx5xlirZ361CamfIZjNX6PMHejEu4fq48m5zZKAOT60PyEAgKQEKfFkAC0UDnhowRA+F14rJ5wt2ootueWvlVOE5OWfCeWLg+VAFjeVTNWKyAAq6XymSgAG3XdulwAtiq4cb0AjAW8NW76t1oAwKdH/0zqeHhTZ5v1u7QAsD6a/mb+9Q7JAwDeN0/jdr/XauqwoP0isuZMpK9qlweAWIC41+pqbKCTPtw+e48RixeA2Cn4ZAn2+HqAmL5YbNNyftrh0fYCgFhjd6CjHwnDUGcaYoDFYkDsP2MDtfs8AeAO9FS8SJ5pqdiWYk+tzRrzBIBA8FT0AZUdsc8WJ2K2S5viDQBZXLd/dZOyDR0KYrzisG9yyxYAhgCQIGxo93JFTDBKPC0BDAki2ZQN84brI6uk5odjF23utCzdXzCd37TNAJCb4LOMBT8ic7u+v2AXAEQ03Z8uASCzFAABICtAdq8TIABkBcjuezwB4ft61HMlwprQctc3nZ8BoGlcB+NMAMioBUAAyAqQ3esECABZAbJ7nQABICtAdq8TIABkBcjudQIWAHgPHwMAAP//8UoJFgAAAAZJREFUAwBhOrPBP4+UEwAAAABJRU5ErkJggg==';



      /* ================= 基础设施层（2026-09-12 UI 重构） =================
       * 目的：A1 状态管理 / A2 组件复用 / C2 日志 / C3 错误定位 / 自由度参数化。
       * 约定：ES5（与全文一致），不引入框架，不改动既有函数调用签名。
       */

      function make(k, v) { var o = {}; o[k] = v; return o; }

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

      /* ---- 6. UI：组件工厂（A2，消除 14 个 render 里的重复实现） ---- */
      var UI = {
        /* 标准设置行：标题 + 描述 + 右侧控件（对齐 Obsidian setting-item） */
        /* 标准设置行：标题 + 描述 + 右侧控件（对齐 Obsidian setting-item）。
         * opts:
         *   cls          —— 附加类名
         *   extra        —— 数组，追加进 setting-item-info（如作用域徽标）；用于覆盖"info 内还有额外子节点"的既有写法
         *   wrapControl  —— true(默认) 包进 .setting-item-control；false = 直接挂 row（兼容既有未包装写法）
         *   children     —— 数组，追加为 row 的平级子节点（如 info + badge + slider 三子节点形态）
         * ⚠ 这三个开关是为**等价替换旧写法**而设：既有 DOM 结构千差万别（实测三处三种形态），
         *   组件层必须能无损表达它们，否则替换就会改变 DOM —— 与"结构不变"要求冲突。 */
        item: function (name, desc, control, opts) {
          var o = opts || {};
          var row = el('div', 'setting-item' + (o.cls ? ' ' + o.cls : ''));
          var info = el('div', 'setting-item-info');
          if (name) info.appendChild(el('div', 'setting-item-name', name));
          if (desc) info.appendChild(el('div', 'setting-item-desc', desc));
          (o.extra || []).forEach(function (n) { if (n) info.appendChild(n); });
          row.appendChild(info);
          if (control) {
            if (o.wrapControl === false) row.appendChild(control);
            else { var c = el('div', 'setting-item-control'); c.appendChild(control); row.appendChild(c); }
          }
          (o.children || []).forEach(function (n) { if (n) row.appendChild(n); });
          return row;
        },
        /* 开关：单一实现 = input.checkbox-container（与 makeToggle / 蒸馏 / 向量三处直建写法同源）。
         * 旧实现返回 label 包裹 input —— 内侧原生 checkbox 未被隐藏，胶囊上叠了一个系统勾选框，
         * 与其它三处的开关形态不一致（U4 统一控件规范修复）。 */
        /* 开关（S3：手写 checkbox → 组件库 <wa-switch>）。
         * 契约读自 switch.d.ts：`checked` 属性 + `change` 事件；parts switch/control/thumb/label。
         * 旧实现挂的 .checkbox-container 类随之退役（对应 CSS 规则已删，避免死规则）。 */
        toggle: function (checked, onChange, label) {
          var sw = document.createElement('wa-switch');
          sw.checked = !!checked;
          if (label) sw.setAttribute('aria-label', label);
          sw.addEventListener('change', function () { onChange(!!sw.checked); });
          return sw;
        },
        /* ── 卡片原语（v9 对齐 · 补上缺失的「卡片层」）──
         * v9 的层级是 页头 → **卡片(.card：卡头 + 卡体)** → 卡内小节 → 行；
         * 面板此前是「分节标题 + 平铺卡片」，整页少一层容器 ⇒ 多板块读起来是散块而非分组。
         * opts: { sub } 卡头副文本；{ right } 卡头右侧节点（数组或单节点，v9 放路由 chip / pill）。
         * 返回 { box, head, body }：**后续内容 append 到 body**（= v9 的 .card > .bd）。 */
        card: function (title, opts) {
          var o = opts || {};
          var box = el('div', 'sc-card');
          var head = null;
          if (title) {
            head = el('div', 'sc-card-hd');
            head.appendChild(el('span', null, title));
            if (o.sub) head.appendChild(el('span', 'sub', o.sub));
            if (o.right) {
              var r = el('div', 'right');
              (Array.isArray(o.right) ? o.right : [o.right]).forEach(function (n) { if (n) r.appendChild(n); });
              head.appendChild(r);
            }
            box.appendChild(head);
          }
          var body = el('div', 'sc-card-bd');
          box.appendChild(body);
          return { box: box, head: head, body: body };
        },
        /* 卡进 Tab 面板（v9 §7）：原型的每个 Tab 内是**一张卡**（div.card.plain，卡体直接含设置行），
         * 面板此前是裸行平铺 ⇒ 少一层容器。返回卡体，调用方直接 appendChild 设置行。 */
        cardIn: function (pane, opts) {
          var c = UI.card(null, opts);
          if (pane) pane.appendChild(c.box);
          return c.body;
        },
        /* 页头：统一「标题 + 描述 + 分隔线」节奏（替代各处裸拼 sc-h1 / sc-desc）。
         * v9 对齐：页头挂在固定槽 #scpanl-headslot（**不随内容滚动**），渲染时自清上一次的页头；
         * 槽不可用时（老结构/单测夹具）回退为返回游离节点，调用方 appendChild 仍可用。 */
        pageHead: function (title, desc, opts) {
          var o = opts || {};
          var box = el('div', 'sc-pagehead');
          var main = el('div', 'sc-ph-main');
          main.appendChild(el('h2', 'sc-h1', title));
          var descEl = null;
          if (desc) { descEl = el('div', 'sc-desc', desc); main.appendChild(descEl); }
          /* v9 对齐：路由 chip 两种排布随页而定 ——
           *   · routesInline：**接在 desc 句子末尾**（v9 插件集合页 `<p>…共用。<span class="src">/suite</span></p>`）；
           *   · 默认：desc 下方独立一行（v9 记忆库页三枚 chip）。 */
          if (o.routes && o.routes.length) {
            if (o.routesInline && descEl) {
              o.routes.forEach(function (r) { descEl.appendChild(el('span', 'sc-src', r)); });
            } else {
              var row = el('div', 'sc-routes');
              o.routes.forEach(function (r) { row.appendChild(el('span', 'sc-src', r)); });
              main.appendChild(row);
            }
          }
          box.appendChild(main);
          /* v9 对齐：页头右侧**搜索框 + 刷新按钮**（方案每页头都有；此前无页级检索入口） */
          var acts = el('div', 'sc-ph-acts');
          if (o.search) {
            var srch = el('label', 'sc-srch');
            srch.appendChild(svg(ICONS.search));
            var inp = document.createElement('input');
            inp.type = 'search';
            inp.placeholder = o.search.placeholder || '过滤…';
            inp.setAttribute('aria-label', o.search.placeholder || '过滤');
            inp.oninput = function () { if (o.search.onInput) o.search.onInput(String(inp.value || '').trim()); };
            srch.appendChild(inp);
            acts.appendChild(srch);
          }
          if (o.refresh) {
            acts.appendChild(UI.button('刷新', function () { refreshCurrentView(); status('已重新取数'); }, { title: '重新取数并重绘本页' }));
          }
          /* 页头自定义动作（v9 页头右侧可放主操作，如插件集合页的「重新装配」） */
          (o.actions || []).forEach(function (n) { if (n) acts.appendChild(n); });
          if (acts.children.length) box.appendChild(acts);
          var slot = document.getElementById('scpanl-headslot');
          if (slot) {
            if (headUsed === headEpoch) return box;      /* 本轮已有页头：嵌套调用不抢槽 */
            slot.textContent = ''; slot.appendChild(box); headUsed = headEpoch;
          }
          return box;
        },
        /* 文本/数字输入 */
        input: function (value, onChange, opts) {
          var o = opts || {};
          var i = document.createElement('input');
          i.type = o.type || 'text';
          i.value = value === undefined || value === null ? '' : String(value);
          if (o.placeholder) i.placeholder = o.placeholder;
          if (o.ariaLabel) i.setAttribute('aria-label', o.ariaLabel);
          // 宽度改走 CSS 变量（--sc-in-w），样式判定收进 CSS；缺省时不设 ⇒ 不额外限宽
          if (o.width) i.style.setProperty('--sc-in-w', o.width);
          if (o.onEnter) i.onkeydown = function (e) { if (e.key === 'Enter') o.onEnter(i.value); };
          else if (onChange) i.onchange = function () { onChange(i.value); };
          return i;
        },
        /* 下拉 */
        /* 下拉：**原生 <select>**（S3 二度回滚 · 2026-09-13）。
         * 两次尝试 <wa-select> 均判退化，判因（第二次是**视觉复核+像素穷举**给出的，不是自评）：
         *   ① **箭头没画出来**——shadow DOM 里确实有 <wa-icon> 元素，但**渲染尺寸为 0**（像素扫描：文字右侧全空）。
         *      注意教训：我当时的断言只验「元素存在」，于是**假绿**；必须验**渲染尺寸**（bbox > 0）。
         *   ② ::part(combobox) 填充未生效（实测填充 = 卡片底色，与同排数字输入"一亮一暗"）。
         *   ③ 宽度失控：控件 173px vs 原 ~66px，左缘与同排输入不再对齐。
         * 结论：WA select 的采用**前置未真正满足**（图标 registry 注册了但图标没渲染出来）。原生 select 三项都对，
         * 故回滚；要再采用，先把「图标真能渲染」用**渲染尺寸断言**证明，再谈替换。 */
        select: function (options, value, onChange, ariaLabel) {
          var s = document.createElement('select');
          if (ariaLabel) s.setAttribute('aria-label', ariaLabel);
          (options || []).forEach(function (op) {
            var o = document.createElement('option');
            o.value = String(op.value); o.textContent = op.label;
            if (String(op.value) === String(value)) o.selected = true;
            s.appendChild(o);
          });
          s.onchange = function () { onChange(s.value); };
          return s;
        },
        /* 按钮 */
        /* 按钮（S3：组件库 <wa-button>，2026-09-13 前置条件达成后**重做**）。
         * 上一轮曾因观感退化回滚，根因是**没有接管 WA 的尺寸层**（其字号由 --wa-font-size-scale 派生，
         *   默认 1rem=16px ⇒ 按钮 35–43px、品牌蓝）。本轮先做了尺寸层接管（font-size-scale .78 / space-scale .375 /
         *   radius-scale 1）并**实测**：xs 27px / **s 30px** / m 34px / l 43px（字号 10/11/12.48/16px）
         *   ⇒ 选 size="s" 与手写实现（30px）等高，观感一致。
         * 契约读自 webawesome button.d.ts：variant neutral|brand|danger、appearance filled|outlined、size、loading、pill。
         * API 与行为完全保留（text/onClick/{primary,danger,title,confirm,async,busyText,okText}）⇒ 13 个调用点零改动。 */
        button: function (text, onClick, opts) {
          var o = opts || {};
          var b = document.createElement('wa-button');
          b.setAttribute('size', o.size || 's');
          b.setAttribute('variant', o.danger ? 'danger' : (o.primary ? 'brand' : 'neutral'));
          b.setAttribute('appearance', (o.primary || o.danger) ? 'filled' : 'outlined');
          if (o.pill) b.setAttribute('pill', '');
          if (o.title) b.title = o.title;
          b.textContent = text;
          b.onclick = function () {
            if (o.confirm && !confirm(o.confirm)) return;
            if (!o.async) { try { onClick(); } catch (e) { fail(e); } return; }
            b.disabled = true; b.setAttribute('loading', '');
            var old = b.textContent; if (o.busyText) b.textContent = o.busyText;
            Promise.resolve().then(onClick).then(function (r) { Log.info(o.okText || (text + ' 完成')); return r; })
              .catch(fail).then(function () {
                b.disabled = false; b.removeAttribute('loading'); b.textContent = old;
              });
          };
          return b;
        },
        /* 徽标 */
        badge: function (text, kind) {
          var b = el('span', 'sc-badge' + (kind ? ' sc-badge-' + kind : ''), text);
          return b;
        },
        /* 状态徽标（sc-ds-badge：圆点 + 文本）—— 后台进程状态行的**唯一构造入口**。
         * 此前 10 处各写三行「建 div → 塞 dot → 塞文本」，其中 3 枚还要异步回填，
         * 靠 `querySelectorAll('span')[1]` 按 DOM 位置取文本节点（改结构即断）。
         * 现返回句柄：setText/setKind 直接持有节点引用，不再依赖位置。 */
        dsBadge: function (text, kind) {
          var box = el('div', 'sc-ds-badge' + (kind ? ' ' + kind : ''));
          box.appendChild(el('span', 'dot'));
          var t = el('span', null, '');
          box.appendChild(t);
          /* v9 对齐：徽章里**变化的那一段加粗**（方案为 `标签 <b>值</b>`：向量 <b>fusion</b> / 候选 <b>9</b> /
           * 认知环 快<b>23</b>/慢<b>7</b>）。判据：文本尾部的第一段「含数字」的连续片段加粗，其余保常重。 */
          function render(s) {
            t.textContent = '';
            var str = String(s === undefined || s === null ? '' : s);
            var m = /^(.*?)([^\s]*\d[^\s]*)\s*$/.exec(str);
            if (m && m[1]) {
              t.appendChild(document.createTextNode(m[1]));
              t.appendChild(el('b', null, m[2]));
            } else { t.textContent = str; }
          }
          var h = {
            box: box,
            setText: function (s) { render(s); return h; },
            setKind: function (k) { box.className = 'sc-ds-badge' + (k ? ' ' + k : ''); return h; },
            setTitle: function (s) { box.title = s; return h; }
          };
          render(text);
          return h;
        },
        /* ── 折叠原语：展开/收起的**唯一实现**（collapsible / more / 小节树全部经它） ──
         * 关键差异（对比旧实现）：状态存在 Fold 里而不是 DOM class 或闭包变量，
         *   ⇒ ① 重绘 / 编程改动不会失同步 ② 嵌套项各用各的 key，互不影响
         *     ③ 初始态「先画后插」，无「先展开再收起」的抖动 ④ 支持 disabled / 空数据 / 异步中。
         * opts:
         *   key       必填（缺省用 'fold:'+title）。稳定键；换数据源时用 Fold.clear(前缀) 清残
         *   variant   'card'（默认 .sc-fold 卡片） | 'more'（.sc-more-btn 行式，两个平级节点）
         *   title/summary  card 变体；label = more 变体收起态文案（展开态统一「收起 ▴」）
         *   open      默认展开（仅未登记时生效，之后以 Fold 中登记值为准）
         *   disabled  禁用：不响应点击 + aria-disabled（CSS 的 [aria-disabled] 已负责降透明度）
         *   emptyText seal() 时 body 为空则补此占位；传 false 关闭该行为
         * 返回控件：{ box, head, body, nodes, open(), setOpen(v), sync(), busy(v), seal(), appendTo(host) } */
        fold: function (opts) {
          var o = opts || {};
          var isMore = o.variant === 'more';
          var dflt = !!o.open;
          var label = o.label || '展开';
          var nodes = [];

          var box = isMore ? null : el('div', 'sc-fold');
          var head = isMore ? el('button', 'sc-more-btn') : el('div', 'sc-fold-head');
          if (isMore) head.type = 'button';
          var arrow = isMore ? null : el('span', 'sc-fold-arrow');
          var body = isMore ? el('div', 'sc-more-body') : el('div', 'sc-fold-body');

          if (isMore) {
            nodes.push(head, body);
          } else {
            head.appendChild(arrow);
            head.appendChild(el('span', null, o.title || ''));
            if (o.summary) head.appendChild(el('span', 'sc-fold-summary', o.summary));
            box.appendChild(head); box.appendChild(body);
            nodes.push(box);
          }

          var ctl = { box: box, head: head, body: body, nodes: nodes, key: String(o.key) };
          function current() { return Fold.get(o.key, dflt); }
          /* 把状态一次性画进 DOM —— 调用方插入前就已是正确的开合态 */
          function paint(open) {
            if (isMore) {
              body.classList.toggle('sc-hidden', !open);
              head.textContent = open ? '收起 ▴' : label + ' ▾';
            } else {
              box.classList.toggle('open', open);
              arrow.textContent = open ? '▾' : '▸';
            }
            head.setAttribute('aria-expanded', open ? 'true' : 'false');
          }
          ctl.isOpen = current;
          ctl.setOpen = function (v) { paint(Fold.set(o.key, v)); return ctl; };
          ctl.sync = function () { paint(current()); return ctl; };
          ctl.busy = function (v) { body.classList.toggle('sc-loading', !!v); return ctl; };
          ctl.empty = function () { return body.childNodes.length === 0; };
          ctl.seal = function () {
            if (ctl.empty() && o.emptyText !== false) {
              body.appendChild(el('div', 'sc-mem-empty', o.emptyText || '（无内容）'));
            }
            return ctl;
          };
          ctl.appendTo = function (host) { nodes.forEach(function (n) { host.appendChild(n); }); return ctl; };

          function act() { if (o.disabled) return; paint(Fold.toggle(o.key, dflt)); }
          head.onclick = act;
          if (!isMore) {
            head.setAttribute('role', 'button');
            head.setAttribute('tabindex', '0');
            head.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } };
          }
          if (o.disabled) head.setAttribute('aria-disabled', 'true');

          paint(current());

          /* 单一数据源同步：任何地方改了同一 key（含 Fold.clear 后的复位），DOM 跟着走。
             节点已从文档移除 ⇒ 自动退订，避免监听器随每次重绘无限堆积。 */
          var everMounted = false;
          function alive() {
            var any = nodes.some(function (n) { return n.isConnected === true; });
            if (any) { everMounted = true; return true; }
            return !everMounted; // 还没 appendTo ⇒ 仍视为存活
          }
          function unsubscribe() { off1(); off2(); }
          var off1 = Bus.on('fold', function (p) {
            if (!alive()) { unsubscribe(); return; }
            if (p && p.key === ctl.key) ctl.sync();
          });
          var off2 = Bus.on('fold:clear', function () {
            if (!alive()) { unsubscribe(); return; }
            ctl.sync();
          });
          return ctl;
        },

        /* 分段 Tab（P2）：一次只面对一组。选中态存 Cfg（重绘后保持）；**绝不触碰 Fold** ——
         * 折叠态的生命周期边界只有「换视图」（L3096），Tab 切换只切 .sc-hidden。 */
        /* 分段 Tab（S3：改用组件库 <wa-tab-group>，不再手写 tab 逻辑与样式）。
         * 契约（读自 webawesome tab-group.d.ts）：<wa-tab slot="nav" panel=ID> + <wa-tab-panel name=ID>；
         *   active 属性设初始态；wa-tab-show 事件回写 Cfg ⇒ 选中态持久化与旧实现等价；parts: nav/tabs/body。
         * 返回句柄与旧实现**完全一致**（{ box, select(id), pane(id) }），故调用点零改动、可随时回滚。 */
        collapsible: function (title, bodyNode, opts) {
          var o = opts || {};
          var f = UI.fold({
            key: o.key || ('fold:' + title),
            variant: 'card',
            title: title,
            summary: o.summary,
            open: o.open,
            disabled: o.disabled,
            emptyText: o.emptyText
          });
          if (bodyNode) f.body.appendChild(bodyNode);
          return f.box;
        },

        /* 容量/指标 KPI 卡（P3）：**画像 / 记忆库 / 运行总览三处共用的唯一实现**。
         * v9 裁决：容量类信息统一为「大数值 + 百分比 + 进度条」；无容量门的载体给 .na 虚线空槽保持槽位一致。
         * opts: { val, txt(文字型主值), sub, pct(null=无门), kind('' | ok | suspect | stalled) }
         * 返回 { box, set(val, sub, isTxt), fill(pct, kind) } */

        tabs: function (key, defs) {
          var box = el('div', 'sc-tabbox');
          var group = document.createElement('wa-tab-group');
          var cur = Cfg.get('tab:' + key, (defs[0] || {}).id);
          var valid = false;
          defs.forEach(function (d) { if (d.id === cur) valid = true; });
          if (!valid) cur = (defs[0] || {}).id;
          defs.forEach(function (d) {
            var tab = document.createElement('wa-tab');
            tab.setAttribute('slot', 'nav');
            tab.setAttribute('panel', d.id);
            tab.textContent = d.label;
            group.appendChild(tab);
            var panel = document.createElement('wa-tab-panel');
            panel.setAttribute('name', d.id);
            d.pane.classList.add('sc-tabpane');
            panel.appendChild(d.pane);
            group.appendChild(panel);
          });
          group.setAttribute('active', cur);
          group.addEventListener('wa-tab-show', function (ev) {
            var n = ev && ev.detail && ev.detail.name;
            if (n) Cfg.set('tab:' + key, n);
          });
          box.appendChild(group);
          return {
            box: box,
            select: function (id) { group.setAttribute('active', id); },
            pane: function (id) {
              for (var i = 0; i < defs.length; i++) if (defs[i].id === id) return defs[i].pane;
              return null;
            }
          };
        },
        kpi: function (top, opts) {
          var o = opts || {};
          var c = el('div', 'sc-kpi');
          /* v9 对齐：顶行 = 状态色点 + 标签（点随 kind 走；未给 kind 时不画点，保持旧调用点不变） */
          var topEl = el('div', 'sc-kpi-top');
          /* 状态词表（ds-badge 语义）→ 色点四态：ended/running=ok · probing=info · suspect=warn · stalled=err */
          var DOTK = { ended: 'ok', running: 'ok', probing: 'info', suspect: 'warn', stalled: 'err' };
          var dotCls = function (k) { return 'sc-dot ' + (DOTK[k] || k || 'ok'); };
          var dot = null;
          if (o.kind) { dot = el('span', dotCls(o.kind)); topEl.appendChild(dot); }
          topEl.appendChild(el('span', null, top));
          c.appendChild(topEl);
          var v = el('div', 'sc-kpi-val' + (o.txt ? ' txt' : ''), o.val === undefined || o.val === null ? '—' : String(o.val));
          c.appendChild(v);
          var sub = el('div', 'sc-kpi-sub', o.sub || '');
          c.appendChild(sub);
          /* v9 观测页的 KPI **无状态点、无进度条**（DOM 实测 kpi:4 内零 dot/bar，卡高 104）；
           * 容量类 KPI（记忆库 / 画像 / 总览）才带条与点 ⇒ 由 opts.plain 区分，
           * 不用「改一处对齐、别处跟着走样」的做法。 */
          var bar = null;
          if (!o.plain) {
            bar = el('div', 'sc-kpi-bar' + (o.pct === null || o.pct === undefined ? ' na' : ''));
            var fill = el('i', o.kind || '');
            if (o.pct !== null && o.pct !== undefined) fill.style.setProperty('--sc-pct', o.pct + '%');
            bar.appendChild(fill);
            c.appendChild(bar);
          }
          var h = {
            box: c,
            set: function (val, subText, isTxt) {
              v.textContent = val === undefined || val === null ? '—' : String(val);
              v.className = 'sc-kpi-val' + (isTxt ? ' txt' : '');
              if (subText !== undefined) sub.textContent = subText || '';
              return h;
            },
            fill: function (pct, kind) {
              /* 状态点与进度条同步（点只在创建时给了 kind 才存在）：ended→ok 是既有语义映射 */
              if (dot && kind !== undefined) dot.className = dotCls(kind);
              if (!bar) return h; // plain：无条可填
              if (pct === null || pct === undefined) { bar.classList.add('na'); return h; }
              bar.classList.remove('na');
              bar.firstChild.style.setProperty('--sc-pct', pct + '%');
              if (kind !== undefined) bar.firstChild.className = (kind === 'ended' ? 'ok' : kind);
              return h;
            }
          };
          return h;
        },
        /* 进度条（C1）。P0-1（2026-09-13）：条体改由组件库承载 ——
         *   外壳 `div.sc-prog` 保留（承载行间距与下方文字），`<wa-progress-bar>` 负责条本身。
         *   尺寸/配色由 CSS 侧接管组件变量（见上方 .sc-prog-bar 规则），此处只驱动 `value`。 */
        progress: function (id) {
          var box = el('div', 'sc-prog');
          var bar = document.createElement('wa-progress-bar');
          bar.className = 'sc-prog-bar';
          bar.setAttribute('max', '100');
          bar.setAttribute('value', '0');
          var txt = el('div', 'sc-prog-txt', '');
          box.appendChild(bar); box.appendChild(txt);
          function render(p) {
            var s = (p || {})[id];
            // 显隐用 .sc-hidden（与全站一致）；进度值改走组件的 value 属性（旧实现自绘 fill 的宽度）
            if (!s || !s.on) { box.classList.add('sc-hidden'); return; }
            box.classList.remove('sc-hidden');
            bar.setAttribute('value', String(s.pct || 0));
            txt.textContent = (s.label ? s.label + ' · ' : '') + (s.pct || 0) + '% · ' + (s.note || '');
          }
          render(Store.get('progress'));
          Bus.on('progress', render);
          return box;
        },
        /* 键值对（信息密度） */
        kv: function (pairs) {
          var w = el('div', 'sc-kv');
          (pairs || []).forEach(function (p) {
            var r = el('div', 'sc-kv-row');
            r.appendChild(el('span', 'sc-kv-k', p[0]));
            r.appendChild(el('span', 'sc-kv-v', p[1]));
            w.appendChild(r);
          });
          return w;
        }
      };

      /* ---- 7. 状态栏：分级 + 历史（D1），保持 status(msg) 旧签名可用 ---- */
      /* 只更新状态栏 DOM，不写日志（切断 status ↔ Log 递归的关键） */
      function setStatusText(msg, level) {
        var n = document.getElementById('sc-statusbar');
        if (!n) return;
        n.textContent = (msg || '') + '';
        n.className = 'sc-statusbar sc-status-' + (level || 'info');
      }
  // UI1/U1：`Log` 已抽到 state.js，闭包被打破 ⇒ **显式注入**状态栏写入器。
  //   ⚠ 注入 `setStatusText` 而**非** `status` —— 后者会造成 status↔Log 无限递归（见 state.js 判因）。
  setLogStatusSink(setStatusText);
      function status(msg, level) {
        var lv = level || 'info';
        setStatusText(msg, lv);
        if (msg) Log.add(lv, msg);
      }
      /* 错误定位（C3）：带端点/参数/堆栈，不再只有一行 message */
      function fail(e, ctx) {
        var err = e instanceof Error ? e : new Error(String(e && e.message ? e.message : e));
        // 关键：优先用显式 ctx，其次从 api() 注入的 e.__ctx 取 —— 旧调用点 `.catch(fail)`
        // 不传 ctx 也能定位到端点（api() 已把 ctx 挂在 error 上）。
        var c = ctx || (e && e.__ctx) || null;
        var where = c ? (' [' + (c.method || '') + ' ' + (c.path || '') + (c.params ? ' ' + JSON.stringify(c.params) : '') + ']') : '';
        var msg = '⚠ ' + err.message + where;
        status(msg, 'error');
        var rec = { t: Date.now(), message: err.message, ctx: c, stack: (err.stack || '').split('\n').slice(0, 4).join(' | ') };
        var a = (Store.get('errors') || []).concat([rec]);
        Store.set('errors', a.slice(-100));
        // api() 已按 path 记过一次 ✗，此处只补堆栈维度，避免日志重复刷屏
        if (!c) Log.error(err.message, { where: null, stack: rec.stack });
        return rec;
      }
      /* 带上下文的 RPC 包装：自动记录耗时/端点/参数，失败可定位 */
      function apiCtx(path, opts, label) {
        var o = opts || {};
        var t0 = Date.now();
        var ctx = { method: (o.method || 'GET'), path: path, params: o.body || null };
        if (label) Prog.start(path, label);
        return api(path, o).then(function (r) {
          if (label) Prog.done(path, true, '完成 ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
          Log.info((o.method || 'GET') + ' ' + path + ' ✓ ' + (Date.now() - t0) + 'ms', ctx);
          return r;
        }).catch(function (e) {
          if (label) Prog.done(path, false, '失败');
          throw Object.assign(new Error(e && e.message ? e.message : String(e)), { __ctx: ctx });
        });
      }

      /* ---------- 页面：开关 ---------- */

      var SWITCH_KEYS = [
        ['injection.hot_memory', '注入热记忆总闸 hot_memory', '关=不注入 agent/用户画像与知识索引任何指针行'],
        // 2026-09-10 审查收敛：archive/lifecycle/merge/scheduler 组开关是 v15 单库化前旧 Python 链路的
        // 遗留控件，其消费端（_meta/*.py）已不随包分发——保留只会误导用户"改了有效"。已移除。
        // 2026-09-11 同类遗漏：boards.memory 是「只写不读」死开关（parseView 解析进 out.boards 后全仓零读取点，
        // 注入总闸只读 level/hot_memory/persona），且旧文案宣称其「注入总闸的父开关」= 假依赖。同批移除。
      ];

      /* ── U1（ADR-122 UI 优化）：作用域/生效态徽章 + 折叠 —— 全部为**增量**补节点/补类，
       *    不改既有 sc-* 语义；回滚=还原 client.js（备份 client.js.pre-u1）。 ── */
      // 控件元数据：写哪（作用域）+ 何时生效（生效态）。缺省 = 全局注入 / 即时。
      var CTRL_META = {
        'injection.hot_memory': { scope: '全局注入', effect: '即时' },
        'injection.level': { scope: '全局注入', effect: '即时' },
        'injection.persona': { scope: '全局注入', effect: '即时' },
        'injection.cap_agent': { scope: '写门容量', effect: '即时' },
        'injection.cap_user': { scope: '写门容量', effect: '即时' },
        'injection.cap_memory': { scope: '写门容量', effect: '即时' },
        recallColdFactorPercent: { scope: '召回融合', effect: '即时' },
        enableDeepSleep: { scope: '调度', effect: '需重载' },
        // U3（B5 能力对齐）：新增控件的作用域与生效态
        injectRelevance: { scope: '注入选行', effect: '即时' },
        injectFreshSlots: { scope: '注入选行', effect: '即时' },
        recallFusion: { scope: '召回融合', effect: '需重载' },
        bankGit: { scope: '库版本化', effect: '需重载' },
        mclEnabled: { scope: '认知环', effect: '需重载' },
        mclFamiliarThreshold: { scope: '认知环', effect: '需重载' },
        mclMaxNudges: { scope: '认知环', effect: '需重载' },
        mclBudgetChars: { scope: '认知环', effect: '需重载' },
        mclTopK: { scope: '认知环', effect: '需重载' },
        mclAudit: { scope: '认知环', effect: '需重载' },
      };
      function metaBadges(key) {
        var m = CTRL_META[key] || { scope: '全局注入', effect: '即时' };
        var box = el('div', 'sc-ctrl-meta');
        box.appendChild(el('span', 'sc-chip', m.scope));
        box.appendChild(el('span', 'sc-chip' + (m.effect === '需重载' ? ' warn' : ''), m.effect));
        return box;
      }
      /** 折叠：把哨兵 mark 之后的所有兄弟节点收进可折叠体（零逐组改动 ⇒ 易回滚）
       *  状态改由 Fold 统一持有（旧实现是闭包里一个局部 open，重绘即丢、多处各写各的）。
       *  @param label 展开按钮文案；@param openDefault 是否默认展开；@param key 稳定键（防残留） */
      function scheduleFold(host, mark, label, openDefault, key) {
        var nodes = [];
        var n = mark.nextSibling;
        while (n) { nodes.push(n); n = n.nextSibling; }
        if (!Derive.has(nodes)) { if (mark.parentNode) mark.parentNode.removeChild(mark); return null; }
        var f = UI.fold({ key: key || ('more:' + label), variant: 'more', label: label, open: !!openDefault });
        nodes.forEach(function (x) { f.body.appendChild(x); });
        // 就地替换哨兵（旧实现先 removeChild 再 append 到末尾，节点已被搬空时二者等价）
        f.appendTo(host);
        if (mark.parentNode) mark.parentNode.removeChild(mark);
        return f;
      }

      /* ── 折叠哨兵的**同步**收口（替代 setTimeout(0)） ──
       * 旧实现：`setTimeout(function(){ scheduleFold(...) }, 0)` —— 要等"后续节点都追加完"。
       * 问题：① 中间隔了一个任务边界，慢渲染时用户能看到内容先铺开再被收起（**抖动闪烁**）；
       *      ② 那一帧 DOM 处于"未收拢"的中间态，任何中途查询都读到不一致结构；
       *      ③ 渲染函数抛异常时哨兵 div 会永久留在 DOM 里。
       * 现在：渲染期只做 deferFold 登记，由 flushFolds() 在**同一个同步流程末尾**统一收口 ——
       * 时序与旧实现等价（仍在所有同步 append 之后、任何网络回调之前），但不再跨任务边界。 */
      var _foldQueue = [];
      function deferFold(host, mark, label, openDefault, key) {
        _foldQueue.push({ host: host, mark: mark, label: label, open: !!openDefault, key: key });
      }
      function flushFolds() {
        var q = _foldQueue;
        _foldQueue = [];
        q.forEach(function (t) {
          try {
            scheduleFold(t.host, t.mark, t.label, t.open, t.key);
          } catch (e) {
            // 收口失败也必须把哨兵摘掉，避免空 div 残留
            if (t.mark && t.mark.parentNode) t.mark.parentNode.removeChild(t.mark);
            Log.warn('折叠收口失败：' + (e && e.message ? e.message : e));
          }
        });
        return q.length;
      }
      function makeToggle(key, name, desc, initial, onToggle) {
        // A2：改用 UI.item（DOM 等价）—— extra 承载作用域徽标；wrapControl:false 保持
        // 既有「开关直接挂 item、无 .setting-item-control 包装」的结构，避免替换改变 DOM。
        var sw = el('input', 'checkbox-container'); sw.type = 'checkbox'; sw.checked = !!initial;
        sw.onchange = function () { onToggle(key, sw); };
        return UI.item(name, desc, sw, { extra: [metaBadges(key)], wrapControl: false });
      }

      /* ---------- 运行总览（P1-1）：一屏回答「现在怎么样」 ----------
       * 设计来源：deliverables/ui-redesign-v9-2026-09-13.html
       * 约定：① 数据全部来自现有端点（零新增端点）② 徽章行只承载「状态」，数值集中在卡片（同页不重复）
       *      ③ 动作入口同页唯一（蒸馏/深睡/自检各一枚）④ 四张 KPI 数值行等高、条钉卡底 ⇒ 条共线 */
      /* ── v9 总览对齐（2026-09-13）：原型两栏共 **6 张卡**，面板此前只有 2 张（本月成长 / 系统状态）。
       *   缺的 4 张（晨起摘要 / 最近动态 / 判据与重排门 / 快捷操作）在此实现。
       *   一律**模块级函数 + 自取数自回填** —— 父函数跨度已接近 200 行棘轮，且子函数拿不到父局部变量。
       *   数据全部来自现有端点（+ 本轮新增的 /maturation/scan），**不编造事件流/不造假数据**。 ── */

      /** 卡内行（原型 `.card > .bd .row`）：左 title（13px/520）+ desc（11.5px faint）· 右 pill/值组（右靠）。 */
      function ovCRow(title, desc, right) {
        var r = el('div', 'sc-crow');
        var l = el('div');
        l.appendChild(el('div', 'sc-ct', title));
        if (desc) l.appendChild(el('div', 'sc-cd', desc));
        r.appendChild(l);
        var rr = el('div', 'sc-right');
        (right || []).forEach(function (n) { if (n) rr.appendChild(n); });
        r.appendChild(rr);
        return r;
      }
      /** 胶囊（原型 `.pill`；kind: ok/warn/info/brand；mono 走等宽）。 */
      function ovPill(text, kind, mono) {
        return el('span', 'sc-pill' + (kind ? ' ' + kind : '') + (mono ? ' mono' : ''), text);
      }
      /** 相对时间（无时间戳时返回空串 —— 由调用方给口径词，绝不编造时间）。 */
      function ovAgo(ts) {
        var t = typeof ts === 'number' ? ts : (ts ? Date.parse(String(ts)) : 0);
        if (!t || isNaN(t)) return '';
        var m = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (m < 1) return '刚刚';
        if (m < 60) return m + ' 分钟前';
        if (m < 1440) return Math.round(m / 60) + ' 小时前';
        return Math.round(m / 1440) + ' 天前';
      }

      /** 总览 · 晨起摘要（原型左栏第 2 张）：delta（剩余有效期 / 注入次数）+ weekDiff（近 7 天深睡新习得）。
       * 原型 3 行；面板按可用字段渲染（delta.rows 最多 2 行 + weekDiff 1 行），**零新端点**。 */
      function ovMorningCard() {
        var card = UI.card('晨起摘要', { right: [el('span', 'sc-src', '/memory/overview · delta / weekDiff')] });
        var box = el('div');
        box.appendChild(el('div', 'sc-desc', '读取中…'));
        card.body.appendChild(box);
        api('/memory/overview').then(function (d) {
          var dl = (d || {}).delta || {}, wd = (d || {}).weekDiff || {};
          var sub = card.head && card.head.querySelector('.sub');
          if (sub) {
            if (dl.present && dl.staleAt) {
              var h = Math.round((Date.parse(dl.staleAt) - Date.now()) / 3600000);
              sub.textContent = 'delta · 剩余 ' + (h > 0 ? h + 'h' : '已过期') + ' 有效';
            } else sub.textContent = 'delta · weekDiff';
          }
          box.textContent = '';
          var rows = (dl.rows || []).slice(0, 2);
          if (!Derive.has(rows)) box.appendChild(el('div', 'sc-desc', '本次无晨起摘要（delta.md 未生成或已过期）。'));
          rows.forEach(function (t, i) {
            box.appendChild(ovCRow(String(t), '来源：delta.md', [
              i === 0 ? ovPill('injections ' + Derive.num(dl.injections || 0), null, true) : ovPill('delta', 'info')
            ]));
          });
          var n = Number(wd.deepAdded || 0);
          box.appendChild(ovCRow('近 7 天深睡新习得 ' + Derive.num(n) + ' 条', 'weekDiff.deepAdded', [ovPill('+' + Derive.num(n), 'ok')]));
        }).catch(function () { box.textContent = ''; box.appendChild(el('div', 'sc-desc', '晨起摘要读取失败（/memory/overview）。')); });
        return card.box;
      }

      /** 总览 · 最近动态（原型左栏第 3 张）：`.tl` 时间线，最多 4 条。
       * **口径自决**：原型未标端点 ⇒ 用现有端点聚合**真实**动态（蒸馏 / 深睡 / 容量预警 / 候选积压），
       * 时间戳取自各端点；无时间戳的条目显示口径词（"本月"/"待处理"），不编造时间。 */
      function ovTimelineCard() {
        var card = UI.card('最近动态', { right: [ovPill('最近 24 小时')] });
        var tl = el('div', 'sc-tl');
        tl.appendChild(el('div', 'sc-desc', '读取中…'));
        card.body.appendChild(tl);
        Promise.all([
          api('/memory/overview').catch(function () { return {}; }),
          api('/deepsleep').catch(function () { return {}; })
        ]).then(function (rs) {
          var d = rs[0] || {}, sl = rs[1] || {};
          var ds = d.distillStats || {}, g = d.growth || {}, pend = d.pending || {};
          var it = [];
          if (ds.last && ds.last.at) {
            it.push({ t: Date.parse(ds.last.at) || 0, k: 'ok',
              title: '蒸馏完成 · 本月 ' + Derive.num(ds.runs || 0) + ' 次',
              desc: '累计入库 ' + Derive.num(ds.added || 0) + ' 条 · 异常 ' + Derive.num(ds.failed || 0) + ' 条',
              time: ovAgo(ds.last.at) });
          }
          if (g.sleep && g.sleep.passes) {
            it.push({ t: Number(sl.lastDeepSleepAt) || 0, k: 'ok',
              title: '深度睡眠整理 · 本月 ' + Derive.num(g.sleep.passes) + ' 次',
              desc: '习得原则 ' + Derive.num(g.sleep.principleAdded || 0) + ' · 替换 ' + Derive.num(g.sleep.replaced || 0) + ' · 画像 ' + Derive.num(g.sleep.profilesAdded || 0),
              time: sl.lastDeepSleepAt ? ovAgo(sl.lastDeepSleepAt) : '本月' });
          }
          (d.indexes || []).forEach(function (f) {
            if (!f || !f.cap) return;
            var pct = Math.round((f.chars || 0) / f.cap * 100);
            if (pct < 80) return;
            it.push({ t: 0, k: 'warn', title: '容量预警 · ' + String(f.name || '') + ' 达 ' + pct + '%',
              desc: '红线由 write_gate 写入时强制；建议在下一次深睡中执行画像压缩', time: '阈值 80%' });
          });
          if (pend.count) {
            it.push({ t: 0, k: (pend.count > 5 ? 'warn' : ''), title: '候选待裁决 · ' + Derive.num(pend.count) + ' 条',
              desc: '24h 内新增 ' + Derive.num(pend.last24h || 0) + ' 条', time: '待处理' });
          }
          tl.textContent = '';
          if (!Derive.has(it)) { tl.appendChild(el('div', 'sc-desc', '暂无动态。')); return; }
          it.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
          it.slice(0, 4).forEach(function (x) {
            var box = el('div', 'sc-tl-item' + (x.k ? ' ' + x.k : ''));
            box.appendChild(el('div', 'sc-tl-t', x.title));
            box.appendChild(el('div', 'sc-tl-d', x.desc));
            box.appendChild(el('div', 'sc-tl-time', x.time));
            tl.appendChild(box);
          });
        });
        return card.box;
      }

      /** 总览 · 判据与重排门（原型右栏第 2 张）：`.mini` 双列 5 组 + 口径注脚。数据 `GET /criteria`。
       * 上轮误判「原型无此块」而挂在深睡页；本轮**迁到总览**（原型总览有、深睡页无）。 */
      function ovCriteriaCard() {
        var card = UI.card('判据与重排门', {
          sub: '现状已有 · 仅改归属',
          right: [el('span', 'sc-src', 'GET /criteria')]
        });
        var mini = el('div', 'sc-mini');
        var note = el('div', 'sc-mem-stat-rule', '读取中…');
        card.body.appendChild(mini); card.body.appendChild(note);
        api('/criteria').then(function (c) {
          var o = c || {};
          var gate = o.rerankGate || {}, h = o.health || {}, bg = o.bankGit || {}, led = o.ledger || {};
          mini.textContent = '';
          var put = function (k, v) { mini.appendChild(el('div', 'k', k)); mini.appendChild(el('div', 'v', v)); };
          put('判据版本', String(o.version || '—'));
          put('台账行数', Derive.num(led.rows || 0));
          put('notes 告警阈值', h.notesWarn == null ? '—' : Derive.num(h.notesWarn));
          put('重排门', Derive.num(gate.indexRows || 0) + ' / ' + Derive.num(gate.threshold || 0) + ' · 行数门' + (gate.ready ? '已达' : '未达'));
          put('库版本', Derive.num(bg.commits || 0) + ' 提交');
          note.textContent = '健康度 health.R / K 与 caps 由 criteria-gate.json 提供；本卡只读。';
        }).catch(function () { note.textContent = '判据台账读取失败（GET /criteria）。'; });
        return card.box;
      }

      /** 总览 · 快捷操作（原型右栏第 3 张）：4 个运维动作。
       * 其中「成熟度扫描」在插件运行时**无对应能力**（实现是库内 scripts/maturation-scan.mjs），
       * 本轮按 reconcile 的既有模式端点化（POST /maturation/scan），不留假按钮。 */
      function ovQuickCard() {
        var card = UI.card('快捷操作');
        var row = el('div', 'sc-toolbar');
        row.style.flexWrap = 'wrap';
        var res = el('div', 'sc-desc', '');
        row.appendChild(UI.button('测试嵌入连通', function () {
          res.textContent = '读取配置…';
          return api('/embed/config').then(function (c) {
            /* ⚠ 字段口径（2026-09-14 实测两处错）：① 原读 `c.global`（端点返回 `persisted`/`effective`，**无 global**）
             *   ② 有效载荷用的是**运行态形状** `baseUrl`（与 `/vector/status2` 的 running 同源），不是 `embedBaseUrl`
             *   ⇒ 两次都取到空值 ⇒ 恒报"未配置"。现读 `effective.baseUrl` 并如实标注来源。 */
            var g = (c && c.effective) || (c && c.persisted) || {};
            var baseUrl = String(g.baseUrl || g.embedBaseUrl || '').trim();
            if (!baseUrl) { res.textContent = '✗ 未配置 embedBaseUrl（且缺省不可用）'; return; }
            var dflt = (c && c.isDefault) || {};
            var src = dflt.embedBaseUrl ? '（缺省在用）' : '（已落盘）';
            res.textContent = '测试中… ' + baseUrl + src;
            return apiCtx('/embed/test', {
              method: 'POST', body: JSON.stringify({ baseUrl: baseUrl, apiKey: String(g.apiKey || g.embedApiKey || '').trim() })
            }, '嵌入连通性').then(function (r) {
              res.textContent = (r && r.error) ? ('✗ ' + r.error + ' · ' + baseUrl + src) : ('✓ 可达 · ' + Derive.count(r && r.models) + ' 个模型 · ' + baseUrl + src);
            });
          }).catch(function (e) { res.textContent = '✗ ' + e.message; });
        }, { async: true, busyText: '测试中…', okText: '嵌入连通性测试完成', title: 'POST /embed/test —— 验证当前 embedding 配置是否可用' }));
        row.appendChild(UI.button('根目录引导', function () {
          res.textContent = '执行中…';
          return apiCtx('/root/bootstrap', { method: 'POST', body: JSON.stringify({}) }, '根目录引导')
            .then(function (r) { res.textContent = '✓ ' + JSON.stringify(r).slice(0, 200); })
            .catch(function (e) { res.textContent = '✗ ' + e.message; });
        }, { async: true, busyText: '执行中…', okText: '根目录引导完成', confirm: '执行根目录引导会尝试创建缺失的目录结构，确认继续？' }));
        row.appendChild(UI.button('成熟度扫描', function () {
          res.textContent = '扫描中…';
          return apiCtx('/maturation/scan', { method: 'POST', body: JSON.stringify({}) }, '成熟度扫描')
            .then(function (r) {
              res.textContent = (r && r.active) ? '✓ 扫描完成（分档已写入 audit/maturation.jsonl）' : ('⚠ ' + ((r && r.error) || '未生成'));
            })
            .catch(function (e) { res.textContent = '✗ ' + e.message; });
        }, { async: true, busyText: '扫描中…', okText: '成熟度扫描完成', title: 'POST /maturation/scan —— 重算库内小节成熟度并覆盖台账（只写台账，不改记忆内容）' }));
        row.appendChild(UI.button('账本对账', function () {
          res.textContent = '对账中…';
          return apiCtx('/reconcile', { method: 'POST', body: JSON.stringify({}) }, '账本对账')
            .then(function (r) { res.textContent = (r && r.active) ? '✓ 对账完成' : ('⚠ ' + ((r && r.error) || '失败')); })
            .catch(function (e) { res.textContent = '✗ ' + e.message; });
        }, { async: true, busyText: '对账中…', okText: '账本对账完成', title: 'POST /reconcile —— 记忆库对账（只读汇总）' }));
        card.body.appendChild(row);
        card.body.appendChild(res);
        return card.box;
      }

      function renderViewOverview(view) {
        view.textContent = '';
        /* v9 标准（原型 .pagehead）：描述文案 + 右侧「刷新」+ 一枚 .proto-note 标注**本页唯一执行位**。 */
        UI.pageHead('运行总览', '一屏回答「现在怎么样」。徽章行 = 原记忆板块 §0 的 7 枚状态徽章，整体提升为独立首屏。', {
          routes: ['/memory/overview', '/cognition/report', '/mcl/status'], refresh: true,
          actions: [el('span', 'sc-proto-note', '蒸馏执行位：下方操作卡（本页仅一处）')]
        });

        var badges = el('div', 'sc-ds-badges');
        function bd(t, k) { var h = UI.dsBadge(t, k); badges.appendChild(h.box); return h; }
        var bDistill = bd('蒸馏 …');
        var bVec = bd('向量 …');
        var bPend = bd('候选 …');
        var bMem = bd('记忆库 …');
        var bMcl = bd('认知环 …');
        var bCrit = bd('判据台账 …');
        var bGit = bd('库版本 …');
        view.appendChild(badges);

        var alertBox = el('div', 'sc-ds-alert warn sc-hidden');
        alertBox.setAttribute('role', 'status');
        view.appendChild(alertBox);
        /* v9 标准（原型 .alert）：三角图标 + 「**N 项待处理** —— 描述」+ 可点击直达。 */
        function setAlert(head, detail, linkText, linkGo) {
          if (!head) { alertBox.classList.add('sc-hidden'); return; }
          alertBox.textContent = '';
          var body = el('div');
          body.appendChild(el('b', null, head));
          if (detail) body.appendChild(el('span', null, ' —— ' + detail));
          if (linkText) {
            var a = el('a', null, linkText);
            a.setAttribute('role', 'button');
            a.onclick = function () { if (typeof linkGo === 'function') linkGo(); };
            body.appendChild(a);
          }
          alertBox.appendChild(body);
          alertBox.classList.remove('sc-hidden');
        }

        /* §1 三张操作卡：同页唯一动作入口，按钮同规格（全部 primary） */
        /* opCard 已提到**闭包级**（2026-09-14）：架构视图也用同一实现——**单一实现，勿在此复制** */
        var ops = el('div', 'sc-opgrid');
        ops.appendChild(opCard('立即蒸馏', '遍历根会话蒸馏，携带 pending 候选回流；等价于等会话空闲自动触发。', 'POST /distill/run', '蒸馏', function () {
          return apiCtx('/distill/run', { method: 'POST', body: JSON.stringify({}) }, '蒸馏').then(function (r) {
            status(r && r.ok ? '✓ ' + (r.note || '蒸馏完成') : '⚠ ' + ((r && r.note) || '未触发：根会话活跃中会跳过，等闲置自动跑'));
            refreshCurrentView();
          });
        }, { icon: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1', busyText: '蒸馏中…', okText: '蒸馏完成' }));
        ops.appendChild(opCard('立即进入深睡', '离线回想，提炼「[原则]/[路径]」并做结构整理与归档（禁直删）。预计 1–3 分钟。', 'POST /deepsleep/trigger', '深睡', function () {
          return apiCtx('/deepsleep/trigger', { method: 'POST', body: JSON.stringify({}) }, '深睡').then(function () {
            status('✓ 已触发深睡归纳（后台执行，回执见「深度睡眠」）');
          });
        }, { icon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', confirm: '立即触发一次深度睡眠归纳？将调用归纳子代理回顾当天记忆痕迹。' }));
        ops.appendChild(opCard('运行自检', '校验判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账六项；超时上限 180s。', 'POST /selfcheck/run', '自检', function () {
          return apiCtx('/selfcheck/run', { method: 'POST', body: JSON.stringify({}) }, '自检').then(function () {
            status('✓ 自检已执行，结果见「运行观测」');
          });
        }, { icon: 'M20 6L9 17l-5-5', busyText: '自检中…', confirm: '立即跑一次运行自检？执行期间请勿关闭面板。' }));
        view.appendChild(ops);

        /* §2 四张 KPI（v9 修正点：数值行等高 + 条钉卡底 ⇒ 四卡进度条共线） */
        var kpis = el('div', 'sc-kpis');
        var kMem = UI.kpi('记忆库容量', { val: '—', sub: 'MEMORY.md', pct: 0, kind: 'ended' });
        var kLevel = UI.kpi('蒸馏水位', { val: '—', sub: '本轮蒸馏事件', pct: 0, kind: 'ended' });
        var kSleep = UI.kpi('深度睡眠', { val: '—', txt: true, sub: '—', pct: null, kind: 'probing' });
        var kVec = UI.kpi('向量档', { val: '未启用', sub: '词法召回兜底', pct: null, kind: 'ended' });
        [kMem, kLevel, kSleep, kVec].forEach(function (c) { kpis.appendChild(c.box); });
        view.appendChild(kpis);

        /* §3 本月成长 / §4 系统状态 —— v9 对齐：**两栏卡片**（方案此两块是并排 card：左 成长 / 右 系统状态，
         * 卡头带路由 chip），此前是全宽分节标题 + 通栏行。窄屏（≤900px）堆叠。 */
        var cols2 = el('div', 'sc-cols2');
        var gCard = UI.card('本月成长', { right: [el('span', 'sc-src', '/memory/overview · growth')] });
        var sCard = UI.card('系统状态', { right: [el('span', 'sc-src', '/mcl/status · /inject/stats')] });
        /* v9 标准（原型 DOM）：两栏各是一个**列容器**，各自纵向堆 3 张卡 ——
         * 不能把 6 张卡平铺进 2 列 grid（那样会 1/2、3/4、5/6 交叉排，视觉顺序全错）。
         * 左栏：本月成长 / 晨起摘要 / 最近动态 · 右栏：系统状态 / 判据与重排门 / 快捷操作。 */
        var colL = el('div'), colR = el('div');
        colL.appendChild(gCard.box);
        colL.appendChild(ovMorningCard());
        colL.appendChild(ovTimelineCard());
        colR.appendChild(sCard.box);
        colR.appendChild(ovCriteriaCard());
        colR.appendChild(ovQuickCard());
        cols2.appendChild(colL); cols2.appendChild(colR);
        view.appendChild(cols2);
        var growthBox = gCard.body;
        var sysBox = sCard.body;
        function ovStat(label, value, sub) {
          var c = el('div', 'sc-mem-stat');
          c.appendChild(el('div', 'sc-mem-stat-label', label));
          c.appendChild(el('div', 'sc-mem-stat-value', value));
          if (sub) c.appendChild(el('div', 'sc-mem-stat-sub', sub));
          return c;
        }

        /* ---- 取数（全部现有端点） ---- */
        api('/memory/overview').then(function (r) {
          var d = r || {};
          var ds = d.distillStats || {};
          bDistill.setText('蒸馏 · ' + (ds.last && ds.last.at ? ovAgo(ds.last.at) : '待命中')).setKind((ds.runs || 0) ? 'ended' : 'running');
          if (Derive.vectorOn(d)) {
            var vp = d.vector.provider || 'off';
            /* v9 标准：原型是「向量 **fusion**」—— provider 是**标识符**，不做中文化（旧实现译成"融合"）。 */
            bVec.setText('向量 ' + String(vp)).setKind(Derive.providerKind(vp, ['fusion']));
          } else { bVec.setText('向量 未启用').setKind('stalled'); }
          var pend = d.pending || {};
          bPend.setText('候选 ' + String(pend.count || 0)).setKind((pend.count || 0) ? 'suspect' : 'ended');

          var mf = null;
          (d.indexes || []).forEach(function (f) { if (f.name === 'MEMORY.md') mf = f; });
          if (mf) {
            var pct = mf.cap ? Math.round((mf.chars || 0) / mf.cap * 100) : null;
            bMem.setText('记忆库 · ' + (pct === null ? '正常' : (Derive.capKind(pct) !== 'ended' ? '水位偏高' : '正常')))
              .setKind(pct === null ? 'ended' : Derive.capKind(pct));
            kMem.set((pct === null ? Derive.num(mf.chars || 0) : pct + '%'), Derive.num(mf.chars || 0) + ' / ' + Derive.num(mf.cap || '—') + ' 字符' + (Derive.count(mf.lines) ? ' · ' + Derive.count(mf.lines) + ' 行' : ''));
            kMem.fill(pct, pct === null ? '' : Derive.capKind(pct));
            /* 导航脚状态块同步（同一份数据，不额外取数） */
            if (refs.navHealth) refs.navHealth(pct === null ? '正常' : (Derive.capKind(pct) !== 'ended' ? '水位偏高' : '正常'), pct === null ? 'ended' : Derive.capKind(pct));
          }
          var dLast = d.distill && d.distill.last;
          if (dLast && dLast.lastSeq != null) {
            kLevel.set(String(dLast.lastSeq), '本轮蒸馏事件 · ' + fmtTime(dLast.at));
            kLevel.fill(100, 'ok');
          } else { kLevel.set('—', '尚无蒸馏事件'); }
          if (Derive.vectorOn(d)) {
            kVec.set(Derive.num(d.vector.cacheLines || 0), '行 · ' + (d.vector.provider || '—') + (d.vector.enabled === false ? ' · 已关闭' : ' · 已启用'));
            kVec.fill(null);
          }
          var g = d.growth;
          if (g) {
            /* 卡头承担标题（v9 的 card > .hd），卡体只放三张数值块 —— 同页信息不重复 */
            if (gCard.head) {
              var subEl = gCard.head.querySelector('.sub');
              if (subEl) subEl.textContent = '· ' + g.month;
            }
            var g3 = el('div', 'sc-mem-grid');
            var s3 = g.sleep || {}, d3 = g.distill || {}, n3 = g.now || {};
            g3.appendChild(ovStat('深睡归纳', Derive.num(s3.passes || 0) + ' 次', '习得 ' + Derive.num(s3.principleAdded || 0) + ' · 替换 ' + Derive.num(s3.replaced || 0) + ' · 画像 ' + Derive.num(s3.profilesAdded || 0)));
            g3.appendChild(ovStat('蒸馏', Derive.num(d3.runs || 0) + ' 次', '成功 ' + Derive.num(d3.ok || 0) + ' · 异常 ' + Derive.num(d3.bad || 0) + ' · 预筛跳过 ' + Derive.num(d3.skips || 0)));
            g3.appendChild(ovStat('AGENT 画像', Derive.num(n3.tagRows != null ? n3.tagRows : '—') + ' 行', '原则 ' + Derive.num(n3.principleRows || 0) + ' · 路径 ' + Derive.num(n3.pathRows || 0) + ' · ' + Derive.num(n3.agentChars || 0) + ' 字符'));
            growthBox.appendChild(g3);
          }
          var warn = [];
          if (pend.count) warn.push('候选区 ' + pend.count + ' 条待裁决');
          if ((d.queue || {}).undone) warn.push('待归档会话 ' + d.queue.undone + ' 个');
          if (Derive.vectorOn(d) && Derive.providerDown(d.vector.provider)) warn.push('嵌入服务不可达，向量召回已降级为词法');
          if (Derive.has(warn)) setAlert(warn.length + ' 项待处理', warn.join('；'), '前往处理', function () { show('memory'); });
          else setAlert('');
        }).catch(fail);

        api('/mcl/status').then(function (m) {
          bMcl.setText('认知环 ' + ((m && m.active) ? ('快' + (m.fast || 0) + '/慢' + (m.slow || 0)) : '未装配')).setKind((m && m.active) ? 'ended' : 'stalled');
        }).catch(function () { bMcl.setText('认知环 读取失败').setKind('stalled'); });

        api('/criteria').then(function (c) {
          /* v9 标准：原型徽章是「标签 · 状态词」（数值已在 KPI 卡里给，徽章不重复堆数字）。 */
          bCrit.setText('判据台账 · ' + ((c && c.active) ? '已就绪' : '不可读')).setKind((c && c.active) ? 'ended' : 'stalled');
          var bg = (c || {}).bankGit || {};
          bGit.setText('库版本 · ' + ((bg.commits || 0) ? '已启用' : '未初始化')).setKind((bg.commits || 0) ? 'ended' : 'stalled');
        }).catch(function () { bGit.setText('库版本 读取失败'); });

        api('/deepsleep').then(function (d) {
          var st = d || {};
          var mode = st.running ? '深睡整理中' : (st.ended || st.ended === 0 ? '浅睡' : '—');
          kSleep.set(mode, (st.idleMs ? '空闲 ' + Math.round(st.idleMs / 60000) + ' 分钟 · ' : '') + (st.nextEligibleAt ? '下次可睡 ' + fmtTime(st.nextEligibleAt) : '按水位触发'), true);
        }).catch(function () { kSleep.set('—', '读取失败', true); });

        /* v9 标准（原型 DOM 实测）：系统状态卡是 **4 行**（当前根目录 / MCL 认知环 / 注入统计 / 嵌入服务），
         *   每行 title + desc + 右侧 `.pill`。上一轮曾据**方案文档正文**「该卡只有一行」删掉 3 行 ——
         *   文档说法与 DOM 不符，本轮恢复。四路取数用 Promise.all 一次性渲染，避免异步先后决定行序。 */
        Promise.all([
          api('/get_root').catch(function () { return {}; }),
          api('/mcl/status').catch(function () { return {}; }),
          api('/inject/stats').catch(function () { return {}; }),
          api('/vector/status2').catch(function () { return {}; })
        ]).then(function (rs) {
          var r0 = rs[0] || {}, m = rs[1] || {}, s = rs[2] || {}, v = rs[3] || {};
          sysBox.textContent = '';
          var root = (r0.root || r0.path || r0.active) || '—';
          sysBox.appendChild(ovCRow('当前根目录', String(root), [
            ovPill(r0.active ? '已激活' : '未激活', r0.active ? 'ok' : 'warn')
          ]));
          var ch = m.active ? (String(m.mode) === 'slow' ? '慢通道' : '快通道') : '未装配';
          sysBox.appendChild(ovCRow('MCL 认知环',
            '熟悉度 ' + (m.familiarity != null ? m.familiarity : '—') + ' · ' + ch,
            [ovPill(ch, m.active ? 'brand' : 'warn')]));
          sysBox.appendChild(ovCRow('注入统计',
            '本次会话 ' + Derive.num(s.calls || 0) + ' 次' + (s.lastAt ? ' · 最近 ' + ovAgo(s.lastAt) : '') + (s.root ? ' · root=' + s.root : ''),
            [ovPill(Derive.num(s.calls || 0))]));
          sysBox.appendChild(ovCRow('嵌入服务',
            'provider=' + String(v.provider || 'off') + ' · ' + Derive.num(v.rows || 0) + ' 行',
            [ovPill(v.present ? '可达' : '未启用', v.present ? 'ok' : 'warn')]));
        });
      }

      /* ────────── 参数页（P1-1 拆分后）：父函数只做页头 + 页签装配 ──────────
       * 拆分背景：本函数原为 615 行单函数（全前端唯一 >400 行债务）。现按配置域切成 4 个
       *   pane 子渲染函数（inject / cap / model / sched），行为等价由
       *   `scripts/test-panel-view-contract.mjs`（34 项控件契约）守 —— 拆分前先固化基线，
       *   拆分后逐项比对，**清单不变 = 行为等价**。
       * 注意：子函数是**模块级**函数（不是嵌套在父函数里）——否则父函数仍是 600+ 行，
       *   拆分只换取了个位置、跨度门禁照样红（棘轮只认跨度）。 */
      function renderViewToggles(view, parsed, global) {
        view.textContent = '';
        UI.pageHead('参数调节', '注入参数（全局，写 ~/.dsh/suite/scheduler.json）与运行时通道。改动即时写回（scheduler.json 备份先行）。注入配置已迁全局，不再随 root 切换变化（root YAML 仅剩「配置原文」页可直接编辑）。', { routes: ['/config', '/save', '/toggle'] });
        var pT1 = el('div'); var pT2 = el('div'); var pT3 = el('div'); var pT4 = el('div'); var _tb = UI.tabs("toggles", [{ id: 'inject', label: '① 注入与画像', pane: pT1 }, { id: 'cap', label: '② 记忆与容量', pane: pT2 }, { id: 'model', label: '③ 模型与向量', pane: pT3 }, { id: 'sched', label: '④ 后台与调度', pane: pT4 }]);
        view.appendChild(_tb.box);
        // 注入配置全局值（P1-2：global 优先；parsed 回落兼容旧 root YAML）
        var g = global || {};
        // R1：global 是最终生效值（scheduler ?? 默认），不回 root YAML——显示=实际注入值
        /* v9 结构（DOM 实测 §7）：**每个 pane 的内容包一张卡**（原型 div.card.plain：卡体直接含 setrow）。
         * 面板此前是裸行平铺（18 个按钮散落）⇒ 整页少一层容器，多板块读起来是散块而非分组。 */
        renderTogglesInject(UI.cardIn(_tb.pane('inject')), view, parsed, g);
        renderTogglesCap(UI.cardIn(_tb.pane('cap')), g);
        renderTogglesModel(UI.cardIn(_tb.pane('model')));
        renderTogglesSched(UI.cardIn(_tb.pane('sched')), g);
        flushFolds();
      }
      /* 数值输入项（参数页 cap / sched 两 pane 共用 → 拆分为模块级，避免各 pane 各写一份） */
      function numSetting(name, desc, val, key, unit, step) {
        var isFloat = typeof step === 'number' && step < 1; // U3：小数键（如 MCL 熟悉度阈值）支持
        var wrap = el('div', 'sc-num-wrap'); // U2.5：内联样式 → 类（令牌化，可统一/可回滚）
        var inp = el('input'); inp.type = 'number'; inp.className = 'sc-input'; inp.min = '0'; inp.step = String(step || 100); inp.value = String(val);
        var unitEl = el('span', 'sc-range-label', unit || '');
        inp.onchange = function () {
          var v = String(isFloat ? (Math.max(0, parseFloat(inp.value) || 0)) : Math.max(0, parseInt(inp.value, 10) || 0));
          api('/set', { method: 'POST', body: JSON.stringify({ key: key, value: v }) })
            .then(function () { status('✓ ' + key + ' = ' + v); })
            .catch(fail);
        };
        wrap.appendChild(inp); wrap.appendChild(unitEl);
        // A2：改用 UI.item（DOM 等价）——children 保持「info + 作用域徽标 + 控件」的原有顺序与结构
        return UI.item(name, desc, null, { children: [metaBadges(key), wrap] });
      }
      function renderTogglesInject(host, view, parsed, g) {
        function gVal(key, fallback) { return (g[key] !== undefined && g[key] !== null) ? g[key] : fallback; }

        /* U1：参数检索（前端过滤，零新端点）——匹配 name/desc/键名，隐藏不匹配行并报数 */
        (function () {
          var bar = el('div', 'sc-search-bar');
          var q = el('input', 'sc-input'); q.type = 'search'; q.placeholder = '检索参数（名称 / 键名 / 说明）…';
          var cnt = el('span', 'sc-search-count', '');
          bar.appendChild(q); bar.appendChild(cnt);
          q.oninput = function () {
            var kw = String(q.value || '').trim().toLowerCase();
            var items = view.querySelectorAll('.setting-item');
            var hit = 0;
            items.forEach(function (it) {
              var t = (it.textContent || '').toLowerCase();
              var show = !kw || t.indexOf(kw) > -1;
              it.classList.toggle('sc-filtered', !show); // 检索过滤 ≠ 折叠态，不再复用 .sc-hidden
              if (show) hit++;
            });
            cnt.textContent = kw ? ('匹配 ' + hit + ' / ' + items.length + ' 项') : '';
          };
          host.appendChild(bar);
        })();
        /* ── U2（IA 重排）：参数分 4 桶（B6）——按用户心智而非后端模型分桶；桶内子节降级为 sc-h3 ── */
        host.appendChild(el('div', 'sc-desc', '即时生效：改动直接写 ~/.dsh/suite/scheduler.json（写前备份）。'));
        // 画像 persona 四档滑块：关闭 / 仅注入我 / 仅注入你 / 全注入
        var personaMode = String(gVal('persona', 'both'));
        var PERSONA_TIERS = [['off', '关闭'], ['me', '仅注入我'], ['you', '仅注入你'], ['both', '全注入']];
        var slider = el('div', 'sc-persona-slider');
        PERSONA_TIERS.forEach(function (tier, i) {
          var cell = el('button', 'sc-persona-cell' + (tier[0] === personaMode ? ' active' : ''));
          cell.type = 'button';
          cell.setAttribute('role', 'radio');
          cell.setAttribute('aria-checked', tier[0] === personaMode ? 'true' : 'false');
          cell.textContent = tier[1];
          cell.onclick = function () {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'injection.persona', value: tier[0] }) })
              .then(function () {
                status('✓ persona 档位 = ' + tier[1]);
                slider.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
                cell.classList.add('active'); cell.setAttribute('aria-checked', 'true');
              })
              .catch(fail);
          };
          slider.appendChild(cell);
        });
        // A2：改用 UI.item（DOM 等价）——保持 info → 作用域徽标 → 滑块 的原有顺序，均不包装
        host.appendChild(UI.item('画像 persona 注入档位 injection.persona', 'v17 已生效：关闭=不注入画像；仅注入我=只注入 agent 画像 AGENT.md（含 [原则] 习得原则与 [路径] 任务路径）；仅注入你=只注入用户画像 USER.md；全注入=双画像（默认）', null, { children: [metaBadges('injection.persona'), slider] }));
        SWITCH_KEYS.forEach(function (it) {
          // P1-2：hot_memory 显示全局 scheduler.json 值（root YAML flags 已非真源）
          var cur = it[0] === 'injection.hot_memory' ? gVal('hot_memory', true) : parsed.flags[it[0]];
          if (typeof cur !== 'boolean') return;
          host.appendChild(makeToggle(it[0], it[1], it[2], cur, function (key, sw) {
            api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
              .then(function () { status('✓ 已切换 ' + key); })
              .catch(function (e) { fail(e); sw.checked = !sw.checked; });
          }));
        });
        // 热记忆注入强度（五格滑块：off/low/medium/high/smart）
        var levelMode = String(gVal('level', 'smart'));
        var LEVEL_TIERS = [['off', 'off'], ['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['smart', 'smart']];
        var lSlider = el('div', 'sc-persona-slider');
        LEVEL_TIERS.forEach(function (tier, i) {
          var cell = el('button', 'sc-persona-cell' + (tier[0] === levelMode ? ' active' : ''));
          cell.type = 'button';
          cell.setAttribute('role', 'radio');
          cell.setAttribute('aria-checked', tier[0] === levelMode ? 'true' : 'false');
          cell.textContent = tier[1];
          cell.title = 'injection.level = ' + tier[0];
          cell.onclick = function () {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'injection.level', value: tier[0] }) })
              .then(function () {
                status('✓ injection.level = ' + tier[0]);
                lSlider.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
                cell.classList.add('active'); cell.setAttribute('aria-checked', 'true');
              })
              .catch(fail);
          };
          lSlider.appendChild(cell);
        });
        // A2：改用 UI.item（DOM 等价）——保持 info → 作用域徽标 → 滑块 的原有顺序，均不包装
        host.appendChild(UI.item('热记忆注入强度 injection.level', 'off=不注入 / low(2 条) / medium(4 条) / high(8 条) / smart=智能上限(10 条)；当前：' + levelMode + '；改动即时生效（缓存作废）', null, { children: [metaBadges('injection.level'), lSlider] }));
        // U3（B5 能力对齐）：注入选行两键 —— panel 早已读取 injectRelevance/injectFreshSlots，此前无控件（UI 调不了）
        host.appendChild(makeToggle('injectRelevance', '注入相关性重排 injectRelevance', '开=按相关性选行（缺省）；关=回落「基线 + 新鲜度」选行。即时生效（下次注入即用）', gVal('injectRelevance', true) !== false, function (key, sw) {
          api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
            .then(function () { status('✓ 已切换 ' + key + '（即时）'); })
            .catch(function (e) { fail(e); sw.checked = !sw.checked; });
        }));
        host.appendChild(numSetting('新鲜度保底槽 injectFreshSlots', '注入时优先保留「最近新增条目」的槽位数（0–6，缺省 2）', gVal('injectFreshSlots', 2), 'injectFreshSlots', '条', 1));

      }
      function renderTogglesCap(host, g) {
        function gVal(key, fallback) { return (g[key] !== undefined && g[key] !== null) ? g[key] : fallback; }

        host.appendChild(el('div', 'sc-desc', '容量门 = 记忆库能长多大（写入超限被 write_gate 拒写）；活性/遗忘为天级阈值。'));
        // 2026-09-10 用户拍板：三上限=记忆库「容量门」（蒸馏/扩增超限拒写），不裁注入——
        // 任务执行时 agent 总看到完整双画像+记忆指针（裁切会漏记忆影响执行）；容量门控制记忆库能长多大
        var actualChars = (g && g.actual) || { agent: 0, user: 0, memory: 0 };
        host.appendChild(numSetting('AGENT.md 容量门 cap_agent', 'agent 画像记忆库容量（字符）：蒸馏/深睡写入超限会被 write_gate 拒（AGENT.md 当前实际 ' + (actualChars.agent || 0) + ' 字符）。**不影响任务执行注入**——注入总看完整画像', gVal('cap_agent', 3000), 'injection.cap_agent', '字符'));
        host.appendChild(numSetting('USER.md 容量门 cap_user', '用户画像记忆库容量（字符）：写入超限被拒（当前实际 ' + (actualChars.user || 0) + ' 字符）。不影响任务执行注入', gVal('cap_user', 3000), 'injection.cap_user', '字符'));
        host.appendChild(numSetting('MEMORY.md 容量门 cap_memory', '知识索引记忆库容量（字符）：写入超限被拒（当前实际 ' + (actualChars.memory || 0) + ' 字符）。注入按档位行数不受此限', gVal('cap_memory', 5000), 'injection.cap_memory', '字符'));
        // ── v7 活性/遗忘 · 校准阈值（2026-09-10）：条目活性状态机判定天数 + 融合召回降权系数；
        //    经 /set 写入 scheduler.json，深睡巡检/召回运行时生效（缺省 14/44/90/5/35 与 scheduler zod 默认一致）
        host.appendChild(el('div', 'sc-h3', '活性 / 遗忘阈值（v7）'));
        host.appendChild(el('div', 'sc-desc', '记忆条目活性状态机（active→warm→cold）与遗忘/加深候选的判定阈值，以及融合召回对 cold/retired 条目的降权系数。改动经 /set 即时写回 scheduler.json（与注入/蒸馏配置同通道，重载后按新阈值运行）。'));
        host.appendChild(numSetting('活性降级 warm 阈值 activityWarmDays', 'active→warm 无命中天数（缺省 14）', gVal('activityWarmDays', 14), 'activityWarmDays', '天')); // 与 scheduler zod 默认一致
        host.appendChild(numSetting('遗忘冷降 cold 阈值 activityColdDays', 'warm→cold 无命中天数（缺省 44 = warm+30）', gVal('activityColdDays', 44), 'activityColdDays', '天')); // 与 scheduler zod 默认一致
        host.appendChild(numSetting('遗忘候选 archive 阈值 activityArchiveDays', 'cold 后超此天数未命中 → 遗忘候选清单（缺省 90，只建议不删除）', gVal('activityArchiveDays', 90), 'activityArchiveDays', '天')); // 与 scheduler zod 默认一致
        host.appendChild(numSetting('加深候选命中数 activityHotHits', '近 30 天命中 ≥ 此值 → 加深候选 B（缺省 5，喂深睡归纳）', gVal('activityHotHits', 5), 'activityHotHits', '次')); // 与 scheduler zod 默认一致
        // 百分比项：numSetting 的 step=100 不适用百分比（会出问题），自建输入块（step=5, min=5, max=95，parseInt 后 clamp [5,95]）
        var pctItem = el('div', 'setting-item');
        var pctInfo = el('div', 'setting-item-info');
        pctInfo.appendChild(el('div', 'setting-item-name', '召回冷条目降权 recallColdFactorPercent'));
        pctInfo.appendChild(el('div', 'setting-item-desc', 'cold/retired 小节在融合召回中的降权系数（百分比 → /100；缺省 35%，后端范围校验 [5,95] 兜底）'));
        var pctWrap = el('div', 'sc-num-wrap'); // U2.5：内联 → 类
        var pctInp = el('input'); pctInp.type = 'number'; pctInp.className = 'sc-input'; pctInp.min = '5'; pctInp.max = '95'; pctInp.step = '5'; pctInp.value = String(gVal('recallColdFactorPercent', 35)); // 与 scheduler zod 默认一致
        var pctUnit = el('span', 'sc-range-label', '%');
        pctInp.onchange = function () {
          var raw = parseInt(pctInp.value, 10);
          if (isNaN(raw)) raw = 35;
          var v = Math.max(5, Math.min(95, raw));
          pctInp.value = String(v);
          api('/set', { method: 'POST', body: JSON.stringify({ key: 'recallColdFactorPercent', value: String(v) }) })
            .then(function () { status('✓ recallColdFactorPercent = ' + v + '%'); })
            .catch(fail);
        };
        pctWrap.appendChild(pctInp); pctWrap.appendChild(pctUnit);
        pctItem.appendChild(pctInfo); pctItem.appendChild(pctWrap);
        host.appendChild(pctItem);
        // 当前实际注入统计（调用 /inject/preview 算 token：中文 ~2 字符/token）
        var injectInfo = el('div', 'sc-desc');
        injectInfo.classList.add('sc-inline-note');
        host.appendChild(injectInfo);
        api('/inject/preview').then(function (r) {
          var txt = (r && r.text) || '';
          if (!txt) { injectInfo.textContent = '当前注入：空（hot_memory 关或画像/记忆为空）'; return; }
          var chars = txt.replace(/\s+/g, '').length;
          var tokens = Math.ceil(chars / 2); // 中文粗估 ~2 字符/token
          var lineCount = txt.split('\n').filter(function (l) { return l.trim().indexOf('- [') === 0; }).length;
          injectInfo.textContent = '当前直接注入 ≈ ' + tokens + ' token（' + chars + ' 字符 · 双画像+记忆指针 ' + lineCount + ' 条）——每轮随提示词注入';
        }).catch(function () { injectInfo.textContent = ''; });

        // ── G-19（2026-09-12）：深睡未消化策略（B 全重捞 / C 分级）──
        //    此前两种取向写死在代码里，用户无法选；现经 /set 写 scheduler.json
        //    （distill.ts 的 liveFailPolicy 实时读这两个键），改动即时生效，无需重载。
        host.appendChild(el('div', 'sc-h3', '深睡未消化策略'));
        host.appendChild(el('div', 'sc-desc', '深睡每轮用 deepSleepLanded 判定本轮是否「已消化」。未消化时的两种取向在此切换——全重捞保证不丢料但可能无限重试；分级在连败达上限后放行并告警，避免无限重试烧 LLM。'));
        host.appendChild(UI.item(
          '深睡未消化策略 deepSleep.failPolicy',
          '全重捞（retry）= 永不放弃，未消化就一直重捞本批（保证不丢料；材料永久失败时每轮都会重试）；分级（graded）= 连续失败达 N 轮后放行水位并记审计告警（避免无限重试烧 LLM）。缺省 graded。',
          UI.select([
            { value: 'retry', label: '全重捞（不丢料，永不放弃）' },
            { value: 'graded', label: '分级（连败 N 轮后放行并告警）' }
          ], String(gVal('deepSleepFailPolicy', 'graded')), function (v) {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'deepSleep.failPolicy', value: v }) })
              .then(function () { status('✓ 深睡未消化策略 = ' + v); })
              .catch(fail);
          }, 'deepSleep.failPolicy')
        ));
        // 连败上限：仅在 graded 下生效（retry 永不放弃，此项不参与判定）
        var roundsInput = UI.input(String(gVal('deepSleepFailMaxRounds', 3)), function (raw) {
          var n = parseInt(raw, 10);
          if (isNaN(n)) n = 3;
          n = Math.max(1, Math.min(100, n));
          roundsInput.value = String(n); // 非法/越界就地回落，显示值=实际写入值
          api('/set', { method: 'POST', body: JSON.stringify({ key: 'deepSleep.failPolicyMaxRounds', value: String(n) }) })
            .then(function () { status('✓ 分级策略连败上限 = ' + n + ' 轮'); })
            .catch(fail);
        }, { type: 'number', width: '120px', ariaLabel: 'deepSleep.failPolicyMaxRounds' });
        roundsInput.min = '1'; roundsInput.max = '100'; roundsInput.step = '1';
        host.appendChild(UI.item(
          '分级策略连败上限 deepSleep.failPolicyMaxRounds',
          '仅在「分级」策略下生效（1–100，缺省 3）：连续失败达此轮数后放行深睡水位并记一条审计告警；全重捞策略下此项不参与判定。',
          roundsInput
        ));

        // 2026-09-10 审查收敛：以下旧控件已移除——
        //  archive/lifecycle/merge 组（蒸馏空闲 idle_review_ms/归档模式/成熟时长/指纹阈值等）消费端为 v15 单库化前
        //  旧 Python 链路（_meta/*.py 已不随包分发），改了无效。真蒸馏节流/深睡阈值在下方「蒸馏节流」与
        //  「深度睡眠」页（scheduler.json 通道）。
      }
      /* 模型与向量 pane（P1-1 收尾二次拆分）：父函数只分派两个板块——
       *   向量链路（vec.ts + bge-m3 运行态/开关/轮询）与 LLM 模型选择（蒸馏/深睡各自选宿主模型）。
       *   两块之间**无共享状态**（只靠 host 串联），故可直接切开；行为等价由
       *   `scripts/test-panel-view-contract.mjs` 的 6 项 model 契约守。 */
      function renderTogglesModel(host) {
        // 2026-09-10 审查收敛：旧「向量检索（召回面）」区（模型下载/部署/重建）已移除——
        // 其驱动链路 vector_search.py/model_manager.py 为 v15 单库化前遗留，不随包分发（改了无效）。
        // 真向量（vec.ts + bge-m3 GPU）的状态/开关/清缓存见下方「向量与模型 · 当前链路」。
        // ── U6「向量与模型 · 当前链路」（2026-09-09）：真实 vec.ts+GPU 服务的状态与开关——
        // 旧「向量检索」区驱动已退役 vector_search.py 链路；本节展示/控制新链路（本地 bge-m3 GPU / 云端可配）。
        // 数据源：GET /vector/status2（运行态+provider+缓存）+ GET/POST /embed/config（scheduler.json，重载生效）。
        renderTogglesModelVec(host);
        renderTogglesModelLlm(host);
      }
      function renderTogglesModelVec(host) {
        host.appendChild(el('div', 'sc-desc', '链路与模型选择；本组改动写入自持配置，需重载插件后生效。'));
        host.appendChild(el('div', 'sc-h3', '向量与模型 · 当前链路'));
        host.appendChild(el('div', 'sc-desc', '语义召回（vec.ts + bge-m3）运行态与开关。改动写 ~/.dsh/suite/scheduler.json，**需重载插件后生效**。本地 GPU 零 token；换云端在下方填 baseUrl/model。'));
        var vzone = el('div');
        function refreshVecZone() {
          api('/vector/status2').then(function (s2) {
            vzone.textContent = '';
            // 状态行（pill 风格，复用 sc-ds-badges）
            var vb = el('div', 'sc-ds-badges');
            var st = (s2.provider || 'off');
            vb.appendChild(UI.dsBadge('provider ' + st, Derive.providerKind(st, ['DmlExecutionProvider'])).box);
            /* 中文模式名（`Derive.vecLabel`）：徽章行按 v9 标准显示**英文标识**，中文解释放这里 ——
             * 两处各司其职（标识用于对齐生态术语，中文名用于让人一眼看懂当前走哪条召回链路）。 */
            vb.appendChild(UI.dsBadge('召回模式 ' + Derive.vecLabel(st), 'ended')
              .setTitle('provider → 中文模式名：fusion=融合 / lexical=词法 / gpu-ready=就绪 / off=关').box);
            vb.appendChild(UI.dsBadge('缓存 ' + String((s2.cache && s2.cache.lines) || 0) + ' 行', 'ended').box);
            if (s2.stats && s2.stats.queries) {
              vb.appendChild(UI.dsBadge(
                '召回 ' + String(s2.stats.queries) + ' 次 · ' + String(s2.stats.lastMode || '') + ' · ' + String(s2.stats.lastMs || 0) + 'ms',
                'ended'
              ).setTitle('最近查询: ' + String(s2.stats.lastQuery || '')).box);
            }
            vzone.appendChild(vb);
            // 开关（embedEnabled）
            var sw = el('input'); sw.type = 'checkbox'; sw.className = 'checkbox-container';
            sw.checked = !!(s2.running && s2.running.enabled);
            sw.addEventListener('change', function () {
              api('/embed/config', { method: 'POST', body: JSON.stringify({ embedEnabled: sw.checked }) })
                .then(function () { status('✓ 向量 ' + (sw.checked ? '开' : '关') + '（重载后生效）'); })
                .catch(function (e) { fail(e); sw.checked = !sw.checked; });
            });
            // A2：改用 UI.item（DOM 等价：info + 包进 setting-item-control 的开关）
            vzone.appendChild(UI.item('语义召回开关 embedEnabled', '开=融合召回（dense0.7+lexical0.3）；关=纯词法。写 scheduler.json', sw));
            // M2（2026-09-10 方案1·浏览器直连）：Provider 预设卡 + URL(datalist) + 模型下拉三态。
            // 探测由浏览器 fetch 目标服务（绕 DSH 宿主 panel 网络限制；Ollama/9915 CORS 均放行）。
            // 照抄 AnythingLLM EmbeddingSelection + Open WebUI 三态模式（考古蓝图 docs/model-config-impl-blueprint.md）。
            var curUrl = (s2.running && s2.running.baseUrl) || 'http://127.0.0.1:11434/v1';
            var curModel = (s2.running && s2.running.model) || 'bge-m3';
            var curKeyEnv = (s2.running && s2.running.apiKeyEnv) || 'EMBED_API_KEY';
            var EMBED_PROVIDERS = [
              { id: 'ollama', name: 'Ollama（本机缺省）', base: 'http://127.0.0.1:11434/v1' },
              { id: 'bge', name: '自建 bge-m3 桥（可选）', base: 'http://127.0.0.1:9915/v1', noEnum: true },
              { id: 'lmstudio', name: 'LM Studio', base: 'http://127.0.0.1:1234/v1' },
              { id: 'custom', name: '自定义 OpenAI 兼容（云端）', base: '' }
            ];
            var provWrap = el('div', 'sc-prov-btns'); // 样式优化：等宽胶囊按钮组
            EMBED_PROVIDERS.forEach(function (p) {
              var card = el('button', 'sc-btn' + (curUrl.indexOf(p.base) === 0 && p.base ? ' on' : ''), p.name);
              card.type = 'button';
              card.addEventListener('click', function () {
                uInp.value = p.base;
                var all = provWrap.querySelectorAll('button');
                all.forEach(function (b) { b.classList.remove('on'); });
                card.classList.add('on');
                if (p.id === 'custom') { uInp.value = ''; uInp.focus(); }
                enumModels(); // 立即探测
              });
              provWrap.appendChild(card);
            });
            // A2：改用 UI.item（DOM 等价）——provWrap 原本直接挂 item，故用 children 而非包装控件
            vzone.appendChild(UI.item('语义检索来源', '选服务 → 自动填地址 → 下方自动探测并列出可用模型（浏览器直连）。换服务/模型后请点「清缓存重建」。', null, { children: [provWrap] }));
            // URL + datalist 预设 + key env
            var urlWrap = el('div', 'sc-col-end');
            var uInp = el('input', 'sc-input sc-w-xl'); uInp.value = curUrl; uInp.placeholder = 'http://127.0.0.1:11434/v1';
            var dlist = el('datalist'); dlist.id = 'sc-embed-endpoints';
            ['http://127.0.0.1:11434/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:9915/v1', 'http://127.0.0.1:1234/v1', 'https://api.openai.com/v1', 'https://api.deepseek.com/v1'].forEach(function (ep) {
              var o = el('option'); o.value = ep; dlist.appendChild(o);
            });
            document.body.appendChild(dlist);
            uInp.setAttribute('list', 'sc-embed-endpoints');
            var mSel = el('select', 'sc-input sc-w-xl'); mSel.title = 'embedModel';
            var kInp = el('input', 'sc-input sc-w-md'); kInp.value = curKeyEnv; kInp.title = 'embedApiKeyEnv'; kInp.placeholder = 'key 环境变量名（本地免填）';
            var probeHint = el('div', 'sc-mem-sub muted'); probeHint.classList.add('sc-max-xl');
            urlWrap.appendChild(uInp); urlWrap.appendChild(mSel); urlWrap.appendChild(kInp); urlWrap.appendChild(probeHint);
            // A2：改用 UI.item（DOM 等价）——urlWrap 原本直接挂 item，故用 children 而非包装控件
            vzone.appendChild(UI.item('服务地址（OpenAI 兼容 /v1 根）', '如 http://127.0.0.1:11434/v1（Ollama）或 http://127.0.0.1:9915/v1（自建桥）；改完回车自动探测。', null, { children: [urlWrap] }));
            // 保存 + 状态行
            var saveWrap = el('div', 'sc-vec-actions'); // 样式优化：统一按钮高对齐
            var probeBtn = el('button', 'sc-btn subtle', '重新探测');
            probeBtn.type = 'button'; probeBtn.classList.add('sc-btn-xs');
            probeBtn.addEventListener('click', enumModels);
            var saveBtn = el('button', 'sc-btn', '保存配置');
            saveBtn.type = 'button'; saveBtn.classList.add('sc-btn-xs');
            saveBtn.addEventListener('click', function () {
              saveBtn.disabled = true; saveBtn.textContent = '保存中…';
              api('/embed/config', { method: 'POST', body: JSON.stringify({ embedBaseUrl: uInp.value.trim(), embedModel: mSel.value || curModel, embedApiKeyEnv: kInp.value.trim() || 'EMBED_API_KEY' }) })
                .then(function () { status('✓ 已保存（重载后生效——若换了服务/模型请点「清缓存重建」）'); saveBtn.disabled = false; saveBtn.textContent = '保存配置'; })
                .catch(function (e) { saveBtn.disabled = false; saveBtn.textContent = '保存配置'; fail(e); });
            });
            saveWrap.appendChild(probeBtn); saveWrap.appendChild(saveBtn);
            vzone.appendChild(saveWrap);
            // 浏览器直连枚举（三态：加载/空/失败/成功）——方案1 绕宿主 panel 网络限制
            var probing = false;
            var probeDone = false; // ①+② 全程只结算一次（fetch 链 + health 降级共享）
            function setSelectState(disabled, placeholder) {
              mSel.disabled = disabled;
              mSel.textContent = '';
              var opt = el('option'); opt.value = ''; opt.textContent = placeholder || '选择模型…';
              mSel.appendChild(opt);
            }
            function enumModels() {
              var b = uInp.value.trim().replace(/\/+$/, '');
              var root = b.replace(/\/v1$/, ''); // 统一服务根（uInp 可能带 /v1 或不带）
              probeDone = false;
              if (!root) { setSelectState(true, '先填写服务地址'); probeHint.textContent = ''; return; }
              // 校验 URL
              try { var u = new URL(root); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('x'); } catch (e) { setSelectState(true, 'URL 无效'); probeHint.textContent = '需 http(s):// 开头'; return; }
              if (probing) return;
              probing = true; setSelectState(true, '加载可用模型中…'); probeHint.textContent = '';
              var finish = function (models, mode, note) {
                if (probeDone) return; probeDone = true; probing = false;
                if (Derive.has(models)) {
                  mSel.disabled = false; mSel.textContent = '';
                  models.forEach(function (md) {
                    var o = el('option'); o.value = md.id;
                    o.textContent = md.id + (isEmbedLike(md.id) ? '（嵌入）' : '');
                    if (md.id === curModel) o.selected = true;
                    mSel.appendChild(o);
                  });
                  probeHint.textContent = '✓ ' + models.length + ' 个模型 · ' + (mode || '') + (note ? ' · ' + note : '');
                } else {
                  setSelectState(true, '（无可枚举模型）');
                  probeHint.textContent = note || '未探测到模型';
                }
              };
              // ① OpenAI 兼容 GET {root}/v1/models（浏览器直连；CORS 由服务端控制）
              fetch(root + '/v1/models', { signal: AbortSignal.timeout(6000) })
                .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(function (j) {
                  var models = ((j && j.data) || []).map(function (m) { return { id: m.id }; });
                  if (Derive.has(models)) { finish(models, 'openai-compatible'); return; }
                  probeHealth(root, finish); // 空 data → 尝试 bge 降级
                })
                .catch(function () { probeHealth(root, finish); });
            }
            function isEmbedLike(id) { return /embed|bge|m3|nomic|e5|text-embed/i.test(String(id)); }
            function probeHealth(root, finish) {
              fetch(root + '/health', { signal: AbortSignal.timeout(5000) })
                .then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); })
                .then(function (j) {
                  var fixed = (j && j.model) || 'bge-m3';
                  finish([{ id: fixed }], 'health-fixed', '服务在但无 /models——用固定 ' + fixed + (j && j.dims ? '（' + j.dims + 'd）' : ''));
                })
                .catch(function () {
                  if (!probeDone) { probeDone = true; probing = false; }
                  setSelectState(true, '（连接失败）');
                  probeHint.textContent = '无法连接该服务（/v1/models 与 /health 均无响应）——检查地址/服务是否在跑/CORS';
                });
            }
            // URL 变化 → 自动重探（onBlur 提交，非击键）
            uInp.addEventListener('change', function () { enumModels(); });
            probeHint.textContent = curModel ? '当前：' + curModel + ' @ ' + curUrl : '';
            enumModels(); // 初始自动探测
            // P0（2026-09-10）：清缓存重建——换 embedding 模型后旧向量失效，须清后按新模型重嵌
            var clearRow = el('div', 'setting-item');
            var clearInfo = el('div', 'setting-item-info');
            clearInfo.appendChild(el('div', 'setting-item-name', '向量缓存'));
            clearInfo.appendChild(el('div', 'setting-item-desc', '缓存按 模型+行文本+地址 指纹命中；换模型/改云端后点「清缓存重建」，下次召回按新模型自动重嵌（当前 ' + String((s2.cache && s2.cache.lines) || 0) + ' 行薄行，~秒级）'));
            clearRow.appendChild(clearInfo);
            /* 危险态统一（P3-2）：破坏性动作一律走 UI.button({ danger, confirm, async })，
             * 不再各自手写 disabled/busyText/confirm —— 视觉与行为同源。 */
            var clearBtn = UI.button('清缓存重建', function () {
              return api('/vector/cache/clear', { method: 'POST', body: '{}' })
                .then(function (r) { status('✓ 向量缓存已清' + (r && r.removed ? '（删除 ' + r.removed + '）' : '') + '——下次召回按当前模型自动重嵌'); });
            }, { danger: true, async: true, busyText: '清理中…', okText: '向量缓存已清', confirm: '清空向量缓存并重建？换模型后必须执行（否则旧向量混用导致语义失真）。' });
            var clearCtl = el('div', 'setting-item-control'); clearCtl.appendChild(clearBtn);
            clearRow.appendChild(clearCtl);
            vzone.appendChild(clearRow);
            // R2（2026-09-10）：服务未就绪引导——新装用户默认无 bge 服务（词法兜底运行，语义未启用）
            if (Derive.providerDown(st)) {
              var guide = el('div');
              guide.appendChild(el('div', 'sc-mem-group-title', '如何启用语义检索'));
              var g1 = el('div', 'setting-item');
              var g1i = el('div', 'setting-item-info');
              g1i.appendChild(el('div', 'setting-item-name', '方案 A · 本地 GPU 服务（推荐，零 token 成本）'));
              g1i.appendChild(el('div', 'setting-item-desc', '需自备嵌入服务（OpenAI 兼容 /v1/embeddings）：Ollama（ollama pull bge-m3，:11434）或自建 bge-m3 桥（:9915）。当前检测不可达。'));
              g1.appendChild(g1i);
              guide.appendChild(g1);
              var g2 = el('div', 'setting-item');
              var g2i = el('div', 'setting-item-info');
              g2i.appendChild(el('div', 'setting-item-name', '方案 B · 云端 API'));
              g2i.appendChild(el('div', 'setting-item-desc', '手写 ~/.dsh/suite/scheduler.json：embedBaseUrl=云端端点 + embedModel=模型名 + embedApiKeyEnv=key 环境变量名；改后重载并「清缓存重建」。'));
              g2.appendChild(g2i);
              guide.appendChild(g2);
              guide.appendChild(el('div', 'sc-desc', '未配置时自动词法召回（可用但无语义）；配置后本页 provider 变就绪。'));
              vzone.appendChild(guide);
            }
          }).catch(function (e) { vzone.textContent = ''; vzone.appendChild(el('div', 'sc-desc', '向量状态不可用: ' + e.message)); });
        }
        host.appendChild(vzone);
        refreshVecZone();
        // 视图级轮询：先清旧再建（renderViewToggles 重渲染时防定时器叠加泄漏）
        if (window._scVecTimer) { clearInterval(window._scVecTimer); window._scVecTimer = null; }
        window._scVecTimer = setInterval(function () { try { refreshVecZone(); } catch (e) { /* 轮询异常静默 */ } }, 30000);
      }
      function renderTogglesModelLlm(host) {
        // ── LLM 模型配置（2026-09-10 用户拍板：蒸馏/深睡模型直接用 Harness 宿主模型体系，各自独立可选）──
        // 数据源 GET /llm/models（宿主 listProviders→listModels）；「继承主会话」= 空键。
        // 仿 AnythingLLM LLMProviderModelPicker：provider→model 两级联动 + 空=继承。
        host.appendChild(el('div', 'sc-h3', '蒸馏 / 深睡模型'));
        host.appendChild(el('div', 'sc-desc', '蒸馏与深度睡眠各自可选宿主模型（直接用 DeepSeek Harness 模型——先在 Harness 配置好模型，这里下拉选即可）。「继承主会话」= 不指定，跟随当前会话模型。改动写 scheduler.json，需重载生效。'));
        var llmCard = el('div');
        var hostModels = null; // GET /llm/models 缓存 [{provider,id,name}]
        var llmVal = {}; // 当前持久值 {distillProvider,distillModel,sleepProvider,sleepModel}
        // LLM 模型单下拉（2026-09-10 用户拍板：仿 Harness 对话模型选择——一个下拉框，'跟随主模型'作为默认选项）
        function renderLlmSelect(container, keyP, keyM, label, desc) {
          var item = el('div', 'setting-item');
          var info = el('div', 'setting-item-info');
          info.appendChild(el('div', 'setting-item-name', label));
          info.appendChild(el('div', 'setting-item-desc', desc));
          item.appendChild(info);
          var wrap = el('div', 'sc-row');
          var sel = el('select', 'sc-input sc-w-lg'); sel.title = keyP + '/' + keyM;
          var inherit = (llmVal[keyP] || '') === '';
          function rebuild() {
            sel.textContent = '';
            var optMain = el('option'); optMain.value = ''; optMain.textContent = '跟随主模型（默认）';
            optMain.selected = inherit; sel.appendChild(optMain);
            var seen = {};
            (hostModels || []).forEach(function (m) {
              var combo = m.provider + '/' + m.id;
              if (!seen[combo]) { seen[combo] = 1; var o = el('option'); o.value = combo; o.textContent = combo; if (!inherit && m.provider === llmVal[keyP] && m.id === llmVal[keyM]) o.selected = true; sel.appendChild(o); }
            });
            if (!sel.value) sel.value = ''; // 无匹配时落跟随主模型
          }
          sel.addEventListener('change', function () {
            var v = sel.value;
            var patch = {};
            if (!v) { patch[keyP] = ''; patch[keyM] = ''; llmVal[keyP] = ''; llmVal[keyM] = ''; }
            else {
              var sp = v.indexOf('/');
              var prov = v.slice(0, sp), model = v.slice(sp + 1);
              patch[keyP] = prov; patch[keyM] = model; llmVal[keyP] = prov; llmVal[keyM] = model;
            }
            api('/distill/config', { method: 'POST', body: JSON.stringify(patch) })
              .then(function () { status('✓ ' + label + ' 已设' + (v ? '：' + v : '（跟随主模型）') + '——重载后生效'); })
              .catch(fail);
          });
          rebuild();
          wrap.appendChild(sel);
          item.appendChild(wrap);
          container.appendChild(item);
        }

        function renderLlmCard() {
          llmCard.textContent = '';
          // 两用途：蒸馏 / 深睡（独立键，空=回落 llmProvider/llmModel→继承）
          renderLlmSelect(llmCard, 'distillProvider', 'distillModel', '蒸馏模型', '事件蒸馏（会话闲置提炼可复用知识）用的模型。继承=跟随主会话。');
          renderLlmSelect(llmCard, 'sleepProvider', 'sleepModel', '深睡归纳模型', '深度睡眠（离线回想提炼 [原则]/[路径] 画像成长）用的模型。继承=跟随主会话。');
          var note = el('div', 'sc-mem-sub muted'); note.textContent = hostModels ? '宿主可用 ' + hostModels.length + ' 个模型' : '读取宿主模型…';
          llmCard.appendChild(note);
        }
        api('/llm/models').then(function (r) {
          hostModels = (r && r.models) || [];
          llmCard.textContent = '';
          // 读当前持久值
          return api('/distill/config').then(function (d) {
            var run = (d && d.running) || {}, p = (d && d.persisted) || {};
            llmVal.distillProvider = run.distillProvider != null ? run.distillProvider : (p.distillProvider || '');
            llmVal.distillModel = run.distillModel != null ? run.distillModel : (p.distillModel || '');
            llmVal.sleepProvider = run.sleepProvider != null ? run.sleepProvider : (p.sleepProvider || '');
            llmVal.sleepModel = run.sleepModel != null ? run.sleepModel : (p.sleepModel || '');
            renderLlmCard();
          });
        }).catch(function () { llmCard.appendChild(el('div', 'sc-desc', '⚠ 宿主模型不可用')); });
        host.appendChild(llmCard);
      }
      function renderTogglesSched(host, g) {
        function gVal(key, fallback) { return (g[key] !== undefined && g[key] !== null) ? g[key] : fallback; }

        // ── 蒸馏节流（运行时通道 · 2026-09-09 新增）──
        // 背景：enableDistill/idleWakeMs/minTurnChars/distillPrescan/llmProvider/llmModel 六个键有插件 Config
        // 但不持久（注入插件不进 loader 配置持久化），此前只能手写 ~/.dsh/suite/scheduler.json；
        // 现经 /distill/config 读写同一文件（与深度睡眠同通道），**改动需重载插件后生效**。
        host.appendChild(el('div', 'sc-desc', '高级项：蒸馏节流 / 召回与库版本 / 认知环；改后需重载生效。'));
        host.appendChild(el('div', 'sc-h3', '蒸馏节流（运行时通道）'));
        /* U2：桶④ 默认折叠（B6 高级后置）——哨兵 + 自调度，后续节点自动收进折叠体 */
        // U3（B5 能力对齐）：召回融合策略（v2 回滚开关）+ 库版本化 + 认知环 6 键 —— 均在桶④折叠体内
        host.appendChild(el('div', 'sc-h3', '召回与库版本'));
        var fusRow = el('div', 'setting-item');
        var fusInfo = el('div', 'setting-item-info');
        fusInfo.appendChild(el('div', 'setting-item-name', '召回融合策略 recallFusion'));
        fusInfo.appendChild(el('div', 'setting-item-desc', 'rrf=排名融合（缺省，对离群分稳健）；weighted=旧 min-max 加权（回滚用）。阈值口径与融合解耦——始终用绝对余弦（ACT-024）'));
        fusInfo.appendChild(metaBadges('recallFusion'));
        var fusRowCtrl = el('div', 'sc-persona-slider');
        var FUS_TIERS = [['rrf', 'RRF'], ['weighted', '加权']];
        var fusMode = String(gVal('recallFusion', 'rrf'));
        FUS_TIERS.forEach(function (tier) {
          var cell = el('button', 'sc-persona-cell' + (tier[0] === fusMode ? ' active' : ''));
          cell.type = 'button';
          cell.setAttribute('role', 'radio');
          cell.setAttribute('aria-checked', tier[0] === fusMode ? 'true' : 'false');
          cell.textContent = tier[1];
          cell.title = 'recallFusion = ' + tier[0] + '（需重载生效）';
          cell.onclick = function () {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'recallFusion', value: tier[0] }) })
              .then(function () {
                status('✓ recallFusion = ' + tier[0] + '（需重载插件生效）');
                fusRowCtrl.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
                cell.classList.add('active'); cell.setAttribute('aria-checked', 'true');
              })
              .catch(fail);
          };
          fusRowCtrl.appendChild(cell);
        });
        fusRow.appendChild(fusInfo); fusRow.appendChild(fusRowCtrl);
        host.appendChild(fusRow);
        host.appendChild(makeToggle('bankGit', '记忆库 git 版本化 bankGit', '每次成功写入后提交库快照（可 diff/revert；库在 ~/.dsh 下，不入公开树）。缺省开', gVal('bankGit', true) !== false, function (key, sw) {
          api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
            .then(function () { status('✓ 已切换 ' + key + '（需重载生效）'); })
            .catch(function (e) { fail(e); sw.checked = !sw.checked; });
        }));
        host.appendChild(el('div', 'sc-h3', '认知环（MCL · 熟悉度分流 + 有界再引导）'));
        host.appendChild(makeToggle('mclEnabled', '启用认知环 mclEnabled', '慢通道首步注入「薄契约 + top-k 指针」并按需再引导一次；快通道零额外往返。缺省开（false = 一键回滚）', gVal('mclEnabled', true) !== false, function (key, sw) {
          api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
            .then(function () { status('✓ 已切换 ' + key + '（需重载生效）'); })
            .catch(function (e) { fail(e); sw.checked = !sw.checked; });
        }));
        host.appendChild(numSetting('熟悉度阈值 mclFamiliarThreshold', '「用户文本 ↔ 命中索引行」的绝对余弦阈值（0–1，缺省 0.65；ACT-024 校准：0.65 → 触发率 ~2% 且阈上全为真命中）', gVal('mclFamiliarThreshold', 0.65), 'mclFamiliarThreshold', '', 0.01));
        host.appendChild(numSetting('再引导上限 mclMaxNudges', '慢通道最多再引导次数（0–3，缺省 1；绝不死锁）', gVal('mclMaxNudges', 1), 'mclMaxNudges', '次', 1));
        host.appendChild(numSetting('材料预算 mclBudgetChars', '慢通道材料硬预算（120–4000 字符，缺省 600；只作用于慢通道首步）', gVal('mclBudgetChars', 600), 'mclBudgetChars', '字符', 50));
        host.appendChild(numSetting('指针条数 mclTopK', '慢通道注入的指针条数（1–5，缺省 3）', gVal('mclTopK', 3), 'mclTopK', '条', 1));
        host.appendChild(makeToggle('mclAudit', '认知环审计流 mclAudit', '每步一行写 suite/knowledge/audit/mcl-audit.jsonl（通道/熟悉度/注入/再引导/合规）', gVal('mclAudit', true) !== false, function (key, sw) {
          api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
            .then(function () { status('✓ 已切换 ' + key + '（需重载生效）'); })
            .catch(function (e) { fail(e); sw.checked = !sw.checked; });
        }));
        // 说明文本动态化（2026-09-10）：不写死缺省值，拿到 /distill/config 后回填**当前生效值**
        var dDesc = el('div', 'sc-desc', '写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。当前值读取中…');
        host.appendChild(dDesc);
        var dZone = el('div');
        dZone.appendChild(el('div', 'sc-desc', '读取中…'));
        host.appendChild(dZone);
        function distillSave(patch, onFail) {
          return api('/distill/config', { method: 'POST', body: JSON.stringify(patch) })
            .then(function () { status('✓ 已写入 ' + Object.keys(patch).join(',') + '（重载后生效）'); })
            .catch(function (e) { fail(e); if (onFail) onFail(); });
        }
        function distillToggle(key, name, desc, initial) {
          var item = el('div', 'setting-item');
          var info = el('div', 'setting-item-info');
          info.appendChild(el('div', 'setting-item-name', name));
          info.appendChild(el('div', 'setting-item-desc', desc));
          var sw = el('input', 'checkbox-container'); sw.type = 'checkbox'; sw.checked = !!initial;
          sw.onchange = function () {
            var patch = {}; patch[key] = sw.checked;
            distillSave(patch, function () { sw.checked = !sw.checked; });
          };
          item.appendChild(info); item.appendChild(sw);
          return item;
        }
        function distillInput(key, name, desc, initial, kind, min) {
          var item = el('div', 'setting-item');
          var info = el('div', 'setting-item-info');
          info.appendChild(el('div', 'setting-item-name', name));
          info.appendChild(el('div', 'setting-item-desc', desc));
          var wrap = el('div', 'sc-num-wrap');
          var inp = el('input', 'sc-input'); inp.value = String(initial);
          if (kind === 'minutes') { inp.type = 'number'; inp.min = String(min || 1); inp.step = '1'; }
          else if (kind === 'chars') { inp.type = 'number'; inp.min = '0'; inp.step = '50'; }
          else { inp.type = 'text'; inp.placeholder = '留空=继承主会话模型'; inp.className = 'sc-input sc-w-sm'; }
          var unitEl = el('span', 'sc-range-label', kind === 'minutes' ? '分钟' : (kind === 'chars' ? '字符' : ''));
          inp.onchange = function () {
            var v;
            if (kind === 'text') v = inp.value.trim();
            else v = Math.max(kind === 'minutes' ? (min || 1) : 0, parseInt(inp.value, 10) || 0);
            var patch = {}; patch[key] = kind === 'minutes' ? v * 60000 : v;
            distillSave(patch, function () { inp.value = String(initial); });
          };
          wrap.appendChild(inp); wrap.appendChild(unitEl);
          item.appendChild(info); item.appendChild(wrap);
          return item;
        }
        api('/distill/config').then(function (d) {
          var r = (d && d.running) || {};
          var p = (d && d.persisted) || {};
          function val(k, dflt) { return r[k] != null ? r[k] : (p[k] != null ? p[k] : dflt); }
          // 动态回填当前生效值（不写死缺省）：蒸馏开关 / 空闲唤醒 / 最少字符 / 预筛 / 模型
          var curModelTxt = (function () {
            var dp = val('distillProvider', ''), dm = val('distillModel', '');
            return (dp && dm) ? (dp + '/' + dm) : '继承主会话';
          })();
          dDesc.textContent = '写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。当前：蒸馏 ' + (val('enableDistill', true) ? '开' : '关') + ' / 空闲 ' + Math.round(val('idleWakeMs', 600000) / 60000) + ' 分钟 / 本轮最少 ' + val('minTurnChars', 200) + ' 字符 / 预筛 ' + (val('distillPrescan', true) ? '开' : '关') + ' / 蒸馏模型 ' + curModelTxt + '。';
          dZone.textContent = '';
          dZone.appendChild(distillToggle('enableDistill', '守藏蒸馏器 enableDistill', '关=不注册蒸馏器（/suite 等只读视图仍可用）；改动需重载生效', val('enableDistill', true)));
          dZone.appendChild(distillToggle('distillPrescan', '零成本预筛 distillPrescan', 'spawn 前先扫增量信号词 + pending 候选，皆无则跳过（不唤醒 LLM，省成本）', val('distillPrescan', true)));
          dZone.appendChild(distillInput('idleWakeMs', '空闲唤醒 idleWakeMs', 'turn 结束后空闲满此时长才蒸馏（≥1 分钟，默认 10 分钟）', Math.round(val('idleWakeMs', 600000) / 60000), 'minutes', 1));
          dZone.appendChild(distillInput('minTurnChars', '本轮最少字符 minTurnChars', '本轮新增正文少于此值跳过蒸馏（水位仍推进；0=不设限，默认 200）', val('minTurnChars', 200), 'chars'));
          // 模型配置已移至上方「蒸馏/深睡模型」卡（2026-09-10）——此处不再重复 provider/model 文本输入
          // 2026-09-10：立即处理 pending（project-defer 回流等）——手动触发一轮蒸馏
          var pendRow = el('div', 'setting-item');
          var pendInfo = el('div', 'setting-item-info');
          pendInfo.appendChild(el('div', 'setting-item-name', '立即处理 pending 候选'));
          pendInfo.appendChild(el('div', 'setting-item-desc', '手动触发一轮蒸馏——携带 pending/ 候选（如 project-defer 降级卡）重裁决入册。workspace 反解修复后 project 卡直写工作区 devref。'));
          pendRow.appendChild(pendInfo);
          var pendBtn = el('button', 'sc-btn subtle', '立即蒸馏一次');
          pendBtn.type = 'button';
          pendBtn.classList.add('sc-btn-xs');
          pendBtn.addEventListener('click', function () {
            pendBtn.disabled = true; pendBtn.textContent = '蒸馏中…（约 1-2 分钟）';
            api('/distill/run', { method: 'POST', body: '{}' })
              .then(function (rr) {
                pendBtn.disabled = false; pendBtn.textContent = '立即蒸馏一次';
                if (rr && rr.ok) status('✓ ' + (rr.note || '蒸馏完成'));
                else status('⚠ ' + ((rr && rr.note) || '蒸馏未触发') + '——根会话活跃中会跳过，等闲置自动跑');
              })
              .catch(function (e) { pendBtn.disabled = false; pendBtn.textContent = '立即蒸馏一次'; fail(e); });
          });
          var pendCtl = el('div', 'setting-item-control'); pendCtl.appendChild(pendBtn);
          pendRow.appendChild(pendCtl);
          dZone.appendChild(pendRow);
          if (d && d.active === false) {
            dZone.appendChild(el('div', 'sc-desc', '⚠ 调度器未就绪：显示值为持久文件值，运行时值需插件激活后读取'));
          }
        }).catch(function (e) { dZone.textContent = ''; dZone.appendChild(el('div', 'sc-desc', '⚠ 读取失败：' + e.message)); });
      }

      function renderViewRoots(view, rootListWrap) {
        view.textContent = '';
        UI.pageHead('守藏根目录', '指向含 shoucang.config.yaml 的工作区目录。该目录本身即为 Obsidian 兼容 vault（Markdown + frontmatter + [[双链]]），可用 Obsidian 直接打开。', { routes: ['/roots', '/get_root', '/root/bootstrap'] });

        var listWrap = el('div'); rootListWrap(listWrap);
        view.appendChild(listWrap);
        var addItem = el('div', 'setting-item');
        var info = el('div', 'setting-item-info');
        info.appendChild(el('div', 'setting-item-name', '添加根目录'));
        info.appendChild(el('div', 'setting-item-desc', '绝对路径，须包含 shoucang.config.yaml'));
        var input = el('input', 'sc-input'); input.placeholder = '请输入 vault 的绝对路径';
        var btn = el('button', 'sc-btn', '添加并启用');
        btn.onclick = function () {
          var p = input.value.trim(); if (!p) return;
          api('/set_root', { method: 'POST', body: JSON.stringify({ path: p }) })
            .then(function () { input.value = ''; status('✓ 根目录已启用'); refreshCurrentView(); })
            .catch(fail);
        };
        addItem.appendChild(info); addItem.appendChild(input); addItem.appendChild(btn);
        view.appendChild(addItem);

        function draw(r) {
          listWrap.textContent = '';
          if (!Derive.has(r.roots)) {
            var empty = el('div', 'setting-item');
            empty.appendChild(el('div', 'setting-item-desc', '尚未登记任何根目录——在上方输入路径添加。'));
            listWrap.appendChild(empty);
            return; // 空态必须收口：原实现缺 return，紧接着 r.roots.forEach 在 /roots 未返回对象时必抛
          }
          r.roots.forEach(function (root) {
            var item = el('div', 'setting-item sc-rootitem' + (root.id === r.active ? ' active' : ''));
            var dot = el('span', 'sc-dot' + (root.id === r.active ? ' on' : '')); void dot;
            item.appendChild(dot.cloneNode ? dot : dot);
            item.appendChild(el('span', 'sc-rootname', root.name));
            item.appendChild(el('span', 'sc-rootpath', root.path)).title = root.path;
            var useBtn = el('button', 'sc-btn subtle', root.id === r.active ? '当前' : '启用');
            if (root.id === r.active) useBtn.disabled = true;
            else useBtn.onclick = function () {
              api('/set_root', { method: 'POST', body: JSON.stringify({ path: root.path }) })
                .then(function () { status('✓ 已启用 ' + root.name); refreshCurrentView(); })
                .catch(fail);
            };
            item.appendChild(useBtn);
            listWrap.appendChild(item);
          });
        }
        renderViewRoots._draw = draw;
      }

      /* ---------- 页面：配置原文 ---------- */

      function renderViewYaml(view, ta, saveRow) {
        view.textContent = '';
        UI.pageHead('配置原文', '直接编辑 shoucang.config.yaml 全文。保存时原文件自动备份为 .bak-时间戳。', { routes: ['/config', '/save'] });
        ta.id = 'sc-yaml'; ta.spellcheck = false;
        view.appendChild(ta);
        saveRow.className = 'setting-item';
        var spacer = el('div', 'setting-item-info');
        saveRow.appendChild(spacer);
        saveRow.appendChild(saveRow._btn = el('button', 'sc-btn', '保存'));
        view.appendChild(saveRow);
        /* U2（B9）：最近改动 5 条 —— 读库 git reflog + 配置 mtime（按需端点，零新增常驻注入） */
        view.appendChild(el('div', 'sc-mem-group-title', '最近改动（5 条）'));
        var recentBox = el('div', 'sc-recent');
        recentBox.appendChild(el('div', 'sc-recent-row', '读取中…'));
        view.appendChild(recentBox);
        api('/config/recent').then(function (r) {
          recentBox.textContent = '';
          var cfg = r && r.configMtime ? ('配置文件改动：' + fmtTime(r.configMtime)) : '配置文件尚无记录';
          recentBox.appendChild(el('div', 'sc-recent-row', cfg));
          var items = (r && r.recent) || [];
          if (!Derive.has(items)) { recentBox.appendChild(el('div', 'sc-recent-row', '记忆库尚无 git 快照（写入一次即出现）')); return; }
          items.forEach(function (it) {
            var row = el('div', 'sc-recent-row');
            row.appendChild(el('span', 'sc-recent-at', it.at ? fmtTime(it.at) : '-'));
            row.appendChild(el('span', 'sc-recent-msg', it.msg || ''));
            row.title = it.msg || '';
            recentBox.appendChild(row);
          });
        }).catch(function () { recentBox.textContent = ''; recentBox.appendChild(el('div', 'sc-recent-row', '读取失败（/config/recent）')); });
      }

      /* ---------- 页面：画像 / 记忆板块 ---------- */

      /** 记忆库指针行：点击打开 notes 小节（只读 /memory/sections）；pointer=null 时不跳转。 */
      function openMemoryNote(pointer, autoSection, returnRender) {
        if (!pointer) { status('该条目无 notes 跳转目标'); return; }
        var rel = String(pointer).split('§')[0].trim();
        if (!/^notes\/[a-z]+\.md$/.test(rel)) { status('指针目标非 notes 白名单：' + pointer); return; }
        memoryViewScroll = refs.view.scrollTop; // 记录进入前滚动位置（返回时恢复）
        noteReturnRender = returnRender || null; // 来源板块上下文（返回时回原板块，默认记忆板块）
        api('/memory/sections?rel=' + encodeURIComponent(rel)).then(function (r) {
          if (!r || !r.present) { status((r && r.error) || '小节不可用'); return; }
          Fold.clear('note:'); // 换笔记 ⇒ 清掉上一篇的小节开合态，避免 key 无界增长与旧态串味
          renderNoteSections(refs.view, r);
          if (autoSection) {
            /* 旧实现用 `h.click()` 模拟点击来展开——依赖 DOM 结构（nextElementSibling 恰是 body）
               且会连带触发一次真实 toggle（若该节点本就展开则反而被收起）。
               现直接对单一数据源置位，由各自的 paint 订阅同步 DOM，幂等且不碰结构。 */
            refs.view.querySelectorAll('[data-fold-key]').forEach(function (h) {
              if ((h.textContent || '').indexOf(autoSection) !== -1) Fold.set(h.getAttribute('data-fold-key'), true);
            });
          }
        }).catch(fail);
      }
      function makeMemoryPointerRow(title, pointer, meta, summary) {
        var row = el('div', 'sc-pointer');
        var main = el('div', 'sc-pointer-main');
        var head = el('div', 'sc-pointer-head');
        head.appendChild(el('span', 'sc-pointer-title', title));
        if (meta) head.appendChild(el('span', 'sc-pointer-meta', meta));
        main.appendChild(head);
        if (summary) main.appendChild(el('div', 'sc-pointer-summary', summary));
        row.appendChild(main);
        if (pointer) row.appendChild(el('span', 'sc-pointer-go', '↗'));
        var p = pointer, sec = String(pointer || '').split('§')[1] || '';
        row.addEventListener('click', function () { openMemoryNote(p, sec.trim() || null); });
        return row;
      }

      /** 标签 → 色相（tag pill 着色；未知回落品牌紫）。 */
      function idxHue(tag) {
        var map = { env: 180, tool: 212, flow: 262, lesson: 28, release: 320, 身份: 330, 偏好: 348, 习惯: 12, 硬件: 200, 环境: 190, 演化: 150, 经验: 45 };
        return map[tag] != null ? map[tag] : 254;
      }
      function idxPill(tag) {
        var h = idxHue(tag);
        var pill = el('span', 'sc-idx-tag hued', String(tag || '?'));
        // 只传色相，配色算法在 CSS（.sc-idx-tag.hued）—— 旧实现在 JS 里拼整条颜色，样式散在两处
        pill.style.setProperty('--sc-tag-h', String(h));
        pill.title = tag || '';
        return pill;
      }
      /** 索引指针行（tag pill + subject + notes 指针），点击直达 notes 小节。 */
      /** 知识索引行渲染：按 tag 语义分组排序（环境→工具→流程→教训→发布→画像→其他），组内保持书写序（稳定排序）。 */
      var TAG_ORDER = ['env', 'tool', 'flow', 'lesson', 'release', 'user', 'agent'];
      function renderIndexRows(container, lines, returnRender, withTagCount) {
        var arr = (lines || []).slice();
        /* 防御（2026-09-13 P0-3）：lines 元素可能退化为非对象（纯字符串占位等）。
           实测（真机截图 + 代码核对）：USER.md 容量卡声称 24 条但只渲染 17 行、AGENT.md 19 条整卡失踪
           —— 退化元素被当成对象解构（tag/subject/pointer 全 undefined），渲染出**空 pill + 空文本**的行，
             静默丢数据且看不出来。这里**跳过退化元素并把跳过数回显**，让异常可见而不是静默。 */
        var bad = 0;
        arr = arr.filter(function (ln) {
          var ok = !!ln && typeof ln === 'object';
          if (!ok) bad++;
          return ok;
        });
        if (bad) {
          try { Log.warn('renderIndexRows：跳过 ' + bad + ' 条格式异常索引行（期望 { tag, subject, pointer }）'); } catch (e) { /* Log 未就绪时不阻断渲染 */ }
          container.appendChild(el('div', 'sc-mem-empty', '⚠ ' + bad + ' 条索引行数据格式异常已跳过（期望 { tag, subject, pointer }）'));
        }
        arr.sort(function (a, b) {
          var ia = TAG_ORDER.indexOf(String(a.tag || '').toLowerCase()); if (ia === -1) ia = TAG_ORDER.length;
          var ib = TAG_ORDER.indexOf(String(b.tag || '').toLowerCase()); if (ib === -1) ib = TAG_ORDER.length;
          return ia - ib;
        });
        /* v9：行右列的「N 条」= 本次渲染集合内该 tag 的条数（就地统计，不额外取数）。 */
        var tagCount = {};
        arr.forEach(function (l) { var t = String(l.tag || '').trim(); if (t) tagCount[t] = (tagCount[t] || 0) + 1; });
        arr.forEach(function (ln) {
          var row = el('div', 'sc-idx-row');
          row.appendChild(idxPill(ln.tag));
          row.appendChild(el('span', 'sc-idx-subject', ln.subject || ''));
          if (ln.pointer) row.appendChild(el('span', 'sc-idx-pointer', ln.pointer));
          /* v9（原型 `.row > .right`）：记忆库页的索引行右列 = 该 tag 的胶囊 + 「N 条」。
           * 只在 `withTagCount` 时渲染（画像页右列在原型里是成熟度数值，语义不同，另行处理）。 */
          if (withTagCount) {
            var t = String(ln.tag || '').trim();
            var right = el('div', 'sc-right');
            right.appendChild(idxPill(ln.tag).cloneNode(true));
            right.appendChild(el('span', null, Derive.num(tagCount[t] || 1) + ' 条'));
            row.appendChild(right);
          }
          var ptr = ln.pointer, sec = String(ln.pointer || '').split('§')[1] || '';
          // R3：索引行只读（指针，编辑会与 notes 详情错位）——点击进详情小节，编辑在详情页做
          row.addEventListener('click', function () { openMemoryNote(ptr, sec.trim() || null, returnRender); });
          row.title = (ln.subject || '') + (ln.pointer ? ' → ' + ln.pointer : '') + ' · 点击进详情';
          container.appendChild(row);
        });
      }
      /** ISO → 本地 'MM-DD HH:MM'（蒸馏水位展示用）。 */
      function fmtTime(iso) {
        if (!iso) return '—';
        try {
          var d = new Date(iso);
          var p = function (n) { return (n < 10 ? '0' : '') + n; };
          return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        } catch (e) { return String(iso).slice(0, 16); }
      }

      /** 迷你趋势图（sparkline，Tufte）：纯 SVG 无依赖；values 全为同一值时不画（无趋势信息）。 */
      function sparkline(values, w, h) {
        if (!values || values.length < 2) return null;
        var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
        if (min === max) return null; // 无变化 → 无趋势可表达（data-ink：不画装饰性平线）
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', 'sc-spark');
        svg.setAttribute('width', w || 120); svg.setAttribute('height', h || 26);
        svg.setAttribute('viewBox', '0 0 ' + (w || 120) + ' ' + (h || 26));
        var W = (w || 120) - 4, H = (h || 26) - 6, x0 = 2, y0 = 3;
        var pts = values.map(function (v, i) {
          var x = x0 + (values.length === 1 ? 0 : i * W / (values.length - 1));
          var y = y0 + (H - (v - min) * H / (max - min));
          return [x, y];
        });
        var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
        var lastPt = pts[pts.length - 1];
        var dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', lastPt[0].toFixed(1)); dot.setAttribute('cy', lastPt[1].toFixed(1)); dot.setAttribute('r', 2);
        svg.appendChild(dot);
        return svg;
      }

      /** 认知可视化（v9）：睡眠/记忆两视图共用 —— 单端点 /cognition/report。
       *  mode='sleep'：本轮产出回执 + 下轮材料预估 + 历次趋势；mode='memory'：仅归档区（冷热分布/超 R 节/指针健康 已按用户要求移除）。
       *  端点不可用=静默（不阻塞主视图）。 */
      function renderCognitionReport(view, mode) {
        api('/cognition/report').then(function (r) {
          if (!r || !r.ok) return;
          /* 分区标题的**层级随页面而定**（v9 块级实测）：
         *   · sleep 页：原型是**多张独立卡**（本轮产出回执 / 下轮材料预估 / 最近会话 …）⇒ 这里出卡片；
         *   · memory 页：原型只有一张「容量占用」卡，卡内分区是**小节标题** ⇒ 这里出标题（卡中不再套卡）。 */
        /* ⚠ 两个游标必须分开：**卡挂到容器、内容挂到卡体**。
         *   此前 group() 只用一个变量，第二次调用就把新卡挂进了上一张卡的卡体
         *   （实测出图：「下轮材料预估」嵌在「本轮产出回执」卡里）；只改成 cur 同样错——
         *   因为 cur 在 group 内被推成卡体。 */
        var host = view;   // 卡 / 小节标题的挂载点（容器）
        var box = view;    // 行内容的挂载点（当前卡的卡体）
        var group = function (t) {
          if (mode === 'sleep') {
            var c = UI.card(t);
            host.appendChild(c.box);
            box = c.body;
          } else {
            box.appendChild(el('div', 'sc-mem-group-title', t));
          }
        };
          var sleeps = r.sleeps || [], last = Derive.has(sleeps) ? sleeps[sleeps.length - 1] : null;
          if (mode === 'sleep') {
            /* v9 形态（DOM 实测）：本轮产出回执 = **7 张 KPI**（上一行 3 张 + 下一行 4 张，4 列网格；
             *   值 = 条数，副行 = 后端字段名 added/replaced/…）。面板此前是 7 行 .sc-comp-row 键值行 ⇒ 形态不对。 */
            group('本轮产出回执' + (last && last.at ? ' · ' + fmtTime(last.at) : ''));
            if (!last) { box.appendChild(el('div', 'sc-mem-empty', '（尚无深睡记录）')); }
            else {
              var kpiRow = function (defs) {
                var g = el('div', 'sc-kpis');
                defs.forEach(function (d) { g.appendChild(UI.kpi(d[0], { val: String(d[1] == null ? 0 : d[1]), sub: d[2], plain: true }).box); });
                return g;
              };
              box.appendChild(kpiRow([['新增原则', last.added, 'added'], ['替换原则', last.replaced, 'replaced'], ['画像更新', last.profiles, 'profiles']]));
              box.appendChild(kpiRow([['指针更新', last.pointers, 'pointers'], ['树操作', last.tree, 'tree'],
                ['归档', last.forgetArchived, 'forgetArchived'], ['保留', last.forgetKept, 'forgetKept']]));
              if (last.stop && last.stop !== 'completed') {
                box.appendChild(el('div', 'sc-ds-alert', '⚠ 上次未完成（stop=' + last.stop + '）——按「深睡水位护栏」水位已回滚，同批痕迹下轮重试'));
              }
            }
            /* 下轮材料预估（原型：3 × .row = 标题 / 触发条件 / 右侧条数） */
            var m = r.materials || {};
            group('下轮材料预估' + (r.day ? ' · ' + r.day : ''));
            [['遗忘候选', 'cold 且 ≥90 天零命中', m.forget], ['加深候选', 'hits30 ≥ 5', m.hot],
             ['互抑候选', '§ 名重叠 0.5–0.66', m.interference]].forEach(function (kv) {
              box.appendChild(ovCRow(kv[0], kv[1], [el('b', null, String(kv[2] == null ? 0 : kv[2]) + ' 条')]));
            });
            /* v9：原型深睡页无「历次产出趋势」块 ⇒ 移除（该趋势在总览「本月成长」已表达，不是丢信息） */
          } else {
            var ar = r.archive || [];
            if (Derive.has(ar)) {
              group('归档区 notes/archive/ · ' + ar.length + ' 个文件（forgetOps 产物，复制回 notes/ 即恢复）');
              box.appendChild(el('div', 'sc-mem-sub', ar.map(function (x) { return x.file + '（' + x.chars + ' 字）'; }).join(' · ')));
            }
          }
        }).catch(function () { /* 端点不可用：静默 */ });
      }
      /** 画像板块（F-003）：USER.md/AGENT.md 画像专属视图——容量与指针行**只在此板块**展示（记忆板块不重复统计画像）。
       * v9 严格对齐（2026-09-13 第五轮 · 形态层）：
       *   · 页头右侧加「压缩执行位」占位 chip（与 v9 原型 .proto-note 同形态）
       *   · USER/AGENT 构成从 kpi 卡改为 sc-mem-stat（v9 原型 stat-box 形态 + 超阈提示行）
       *   · 新增「成熟度分布」sc-card 占位（v4 原型 hist 柱状图 5 根柱）—— /memory/overview 当前不带每行 score 字段，
       *     形态已就位，数据接入即生效（属"展示形态已就位 / 数据未上报"型占位）
       *   · USER.md 卡右加「压缩画像」按钮（与 v9 原型 .right 位置一致）
       * 未对齐（如实记录）：成熟度柱状图未接真实数据，待数据字段新增即激活。 */
      function renderPersona(view, data) {
        view.textContent = '';
        UI.pageHead('画像', 'USER.md（用户画像）与 AGENT.md（Agent 画像）的唯一展示位。', {
          routes: ['/memory/overview'],
          actions: [el('span', 'sc-proto-note', '压缩执行位：下方 USER.md 卡')]
        });
        if (!data || !data.present || !Derive.has(data.indexes)) {
          status((data && data.error) || '记忆库画像不可用');
          return;
        }
        var pair = data.indexes.filter(function (f) { return f.name === 'USER.md' || f.name === 'AGENT.md' });
        var totalRows = 0;
        /* 画像容量卡（2026-09-13 用户裁决：**恢复百分比 + 容量条**，与记忆库/总览同一套 UI.kpi 组件）。
         * 历史：2026-09-11 曾按「框要留、不含百分比」实现，本轮据用户确认恢复百分比与条；
         *      容量红线仍由 write_gate 在写入时强制（展示层只读）。 */
        /* v9 严格对齐：原型画像页是 **2×2 卡片网格**（容量×2 + 构成×2）⇒ 本页专用两列网格 */
        var grid = el('div', 'sc-kpis sc-kpis-2');
        pair.forEach(function (f) {
          var pct = f.cap ? Math.round((f.chars || 0) / f.cap * 100) : null;
          grid.appendChild(UI.kpi(f.name.replace('.md', '') + ' 容量', {
            val: pct === null ? Derive.num(f.chars || 0) : pct + '%',
            sub: Derive.num(f.chars || 0) + ' / ' + Derive.num(f.cap || '—') + ' 字符 · ' + Derive.count(f.lines) + ' 条画像',
            pct: pct,
            kind: pct === null ? '' : Derive.capKind(pct)
          }).box);
        });
        view.appendChild(grid);
        /* v9 严格对齐（第五轮 · 形态）：USER/AGENT 构成从 kpi 卡改为 **stat-box 形态**
         * （`.sc-mem-stat`：标签 + 大数字 + tag 分布 + 容量提示行），与 v9 原型 `<div class="stat-box">` 同形态；
         * 提示行在 ≥80% 时显式列出"超过 80% 时在此显示一行提示"文案（v9 原型 USER 78% / AGENT 48% 的真实口径），
         * 其余显示容量入口与红线说明，不假装有数据。 */
        var statGrid = el('div', 'sc-mem-grid');
        statGrid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        pair.forEach(function (f) {
          var byTag = {};
          (f.lines || []).forEach(function (ln) {
            var t = String((ln && ln.tag) || '').trim();
            if (t) byTag[t] = (byTag[t] || 0) + 1;
          });
          var parts = Object.keys(byTag).map(function (k) { return k + ' ' + byTag[k]; });
          var pct = f.cap ? Math.round((f.chars || 0) / f.cap * 100) : null;
          var tip = pct !== null && pct >= 80
            ? '容量 ' + Derive.num(f.chars) + ' / ' + Derive.num(f.cap) + ' —— 超过 80% 时在此显示一行提示；红线由 write_gate 写入时强制。'
            : (f.cap
              ? '容量 ' + Derive.num(f.chars) + ' / ' + Derive.num(f.cap) + ' —— [原则] / [路径] 行数在「总览 · 本月成长」按月跟踪。'
              : '暂无容量门。');
          var s = el('div', 'sc-mem-stat');
          s.appendChild(el('div', 'sc-mem-stat-label', f.name.replace('.md', '') + ' 构成'));
          s.appendChild(el('div', 'sc-mem-stat-value', Derive.count(f.lines) + ' 条'));
          s.appendChild(el('div', 'sc-mem-stat-sub', Derive.has(parts) ? parts.join(' · ') : '（暂无标签行）'));
          s.appendChild(el('div', 'sc-mem-stat-rule', tip));
          statGrid.appendChild(s);
        });
        view.appendChild(statGrid);
        /* v9 严格对齐（第五轮 · 形态）：「成熟度分布」sc-card —— v9 原型 hist 柱状图 5 根柱
         * （0–.2 / .2–.4 / .4–.6 / .6–.8 / .8–1）。
         * 数据（本轮接通）：/memory/overview 的 maturity 字段 = 库内 audit/maturation.jsonl
         * 按 A 值 0.2 分档的**小节数**（此前后端未上报 ⇒ 5 根柱恒 0，视觉上等于坏图）。
         * 柱高按最大值归一化；台账为空时如实显示"未生成"，不假装有数据。 */
        var mat = data.maturity || {};
        var matBins = Array.isArray(mat.bins) ? mat.bins : [];
        var matTotal = Number(mat.total || 0);
        var matGate = Number(mat.gate || 0.5);
        var matMax = Math.max.apply(null, [1].concat(matBins.map(function (n) { return Number(n) || 0; })));
        var matCard = UI.card('成熟度分布', {
          sub: 'v4 新增 · 按 0.2 分档统计库内小节数',
          right: [el('span', 'sc-src', '/memory/overview')]
        });
        var histWrap = el('div', 'sc-hist-wrap');
        var hist = el('div', 'sc-hist');
        ['0–.2', '.2–.4', '.4–.6', '.6–.8', '.8–1'].forEach(function (b, bi) {
          var n = Number(matBins[bi] || 0);
          var bar = el('i');
          if (n > 0) bar.style.height = Math.round(n / matMax * 100) + '%';
          bar.title = b + '：' + n + ' 节';
          bar.appendChild(el('b', null, b));
          hist.appendChild(bar);
        });
        histWrap.appendChild(hist);
        matCard.body.appendChild(histWrap);
        matCard.body.appendChild(el('div', 'sc-mem-stat-rule', matTotal
          ? '共 ' + matTotal + ' 节：A ≥ ' + matGate + '（升格线）才具备升格为 [原则] / [路径] 的稳定条件。'
            + '口径：库内 audit/maturation.jsonl 按 A 值 0.2 分档的小节数。'
          : '成熟度台账为空：库内 audit/maturation.jsonl 尚无记录（跑一次成熟度扫描即写入）。'));
        view.appendChild(matCard.box);

        // 指针行（tag pill + subject + pointer，点击跳 notes 小节）
        /* v9 布局对齐（块级）：原型画像页把 USER.md / AGENT.md 各做成**一张卡**
         * （`.card` → 卡头「USER.md · 用户画像 24 条」+ 卡体指针行），面板此前是「分节标题 + 裸列表」。
         * 卡头右侧带路由 chip + USER.md 上「压缩画像」按钮（v9 第五轮新增，与 v9 原型 .right > button 同形态）。 */
        pair.forEach(function (f, idx) {
          totalRows += Derive.count(f.lines);
          // 数据字段防御：indexes[] 只保证有 name，label 可能缺 ⇒ 原实现会渲染出字面量 "undefined · 24"
          /* v9 卡头文案（DOM 实测）：「USER.md · 用户画像」——文件名 + 中文名，此前只用了其中一个 */
          var title = (f.name && f.label) ? (String(f.name) + ' · ' + String(f.label))
            : (f.label || String(f.name || '').replace(/\.md$/, ''));
          var right = [el('span', 'sc-src', '/memory/overview · ' + String(f.name || ''))];
          if (idx === 0) {
            /* v9 第五轮新增按钮：原型 .right > button「压缩画像」。
             * 本轮补真实动作——画像压缩在插件内**没有独立端点**，唯一实现路径是深睡归纳
             * （deepsleep 的树整理负责把高分重复条目折叠为索引项），故按钮只做「触发一次深睡归纳」，
             * 文案与 confirm 都写明这层依赖，不做无 onclick 的假按钮。 */
            right.push(UI.button('压缩画像', function () {
              status('画像压缩（深度睡眠归纳）触发中…');
              return api('/deepsleep/trigger', { method: 'POST', body: '{}' })
                .then(function (rr) { status(rr && rr.ok ? '✓ 已触发深睡归纳（高分重复条目将折叠为索引项）' : '⚠ 触发失败：' + ((rr && rr.error) || '')); });
            }, {
              async: true, busyText: '压缩中…', okText: '已触发归纳',
              title: '画像压缩：触发一次深度睡眠归纳，由树整理把高分重复条目折叠为索引项（无独立端点）',
              confirm: '「压缩画像」= 触发一次深度睡眠归纳，由深睡树整理折叠高分重复条目。立即执行？'
            }));
          }
          var c = UI.card(title, {
            sub: Derive.count(f.lines) + ' 条',
            right: right
          });
          view.appendChild(c.box);
          if (!Derive.has(f.lines)) { c.body.appendChild(el('div', 'sc-mem-empty', '（暂无指针行）')); return; }
          var list = el('div', 'sc-idx-list');
          renderIndexRows(list, f.lines, renderPersona); // 画像来源：返回时回画像板块；索引行只读，编辑进详情
          c.body.appendChild(list);
        });
        /* v9 画面末尾的**注脚**（.bp-note）：说明口径与依据，此前面板无此块 */
        view.appendChild(el('div', 'sc-note', '注：容量百分比与容量条按 write_gate 的实际上限计算；指针行点击可直达 notes/ 对应小节。'));
        status('画像 · ' + totalRows + ' 条指针');
      }

      /** 记忆板块（阶段4 UI 重排 2026-09-06）：分区展示——蒸馏运行 / 记忆库状态 / 知识索引 / pending / notes / 守藏知识区。
       * 去重原则：USER/AGENT 画像只在画像板块；MEMORY 容量百分比只在进度条；蒸馏水位读 suite 活水位。 */
      function renderMemoryExpanded(view, data) {
        view.textContent = '';
        /* v9 布局对齐（第三轮·块级）：v9 的记忆库页 `.view` **只有一张卡「容量占用」**，
         * 三列容量 + 说明段 + **tabs 都在卡体里**；面板此前是**页级 `.sc-tabbox`** ⇒ 层级反了。
         * 现按原型重排：页头 → 卡「容量占用」{ 三列容量 · 说明 · tabs · 卡内小节 }。 */
        UI.pageHead('记忆库', 'MEMORY.md 索引、候选、笔记与归档区，按「库 → 待消化 → 详情 → 已归档」的生命周期排序。', { routes: ['/memory/overview', '/memory/sections', '/memory/approve'], search: { placeholder: '过滤索引 / 候选 / 笔记…', onInput: filterViewRows }, refresh: true });
        var cap = UI.card('容量占用', { sub: '写入由 write_gate 强制红线' });
        view.appendChild(cap.box);
        var capGrid = el('div', 'sc-cap3');
        cap.body.appendChild(capGrid);
        /* v9 的容量口径说明段（卡内、灰字）：解释"哪些载体给百分比、哪些只报绝对量" */
        cap.body.appendChild(el('div', 'sc-cap-note', '只有存在真实容量门的载体才给百分比与进度条：MEMORY.md（cap_memory）与画像（cap_user / cap_agent）；notes / pending 无容量门 ⇒ 只报绝对量。超限由 write_gate 拒写。'));
        if (!data || !data.present) {
          status((data && data.error) || '记忆库不可用');
          return;
        }
        var memoryFile = null;
        (data.indexes || []).forEach(function (f) { if (f.name === 'MEMORY.md') memoryFile = f; });
        /* v9 严格对齐（2026-09-13 用户拍板「从视觉统一对齐，组件样式和展示效果」）：
         *   原型记忆库页**没有**「运行态」Tab —— 其「蒸馏运行 / 记忆库状态」在原型里属**运行总览**页；
         *   tab 文案**带计数**、形态为**胶囊分段**。本轮按原型收敛为 4 项并加计数，默认落「知识索引」。
         *   ⚠ 原型第 4 项「归档区」面板无独立数据源，未造（如实记录，不假装对齐）。 */
        var pM1 = el('div'); var pM2 = el('div'); var pM3 = el('div'); var pM4 = el('div'); var pM5 = el('div');
        var _tb = UI.tabs("memory", [
          { id: 'index', label: '知识索引 ' + String(Derive.count(memoryFile && memoryFile.lines)), pane: pM1 },
          { id: 'pending', label: '候选区 ' + String((data.pending || {}).count || 0), pane: pM2 },
          { id: 'notes', label: '笔记 ' + String(Derive.count(data.notes)) + ' 类', pane: pM3 },
          /* v9（原型第 4 枚 Tab）：归档区。面板此前无此 Tab（上轮"无独立数据源"未造）——
           * 数据其实来自 `/cognition/report` 的 `archive:[{file,chars}]`，本轮补齐。 */
          { id: 'archive', label: '归档区', pane: pM5 },
          { id: 'growth', label: '统计', pane: pM4 }
        ]);
        cap.body.appendChild(_tb.box);
        var ds = data.distillStats; // 段1 与尾部 status 共用（原在段1 内定义，跨段引用 ⇒ 提到父级）
        /* v9 的三列容量块（.cap-item：标签 + 值 + 明细，百分比项带条）。无容量门的两列给"无容量门"空槽语义。 */
        var mkCapItem = function (label, value, sub, pct, kind) {
          var it = el('div', 'sc-cap-item');
          it.appendChild(el('div', 'sc-cap-top', label));
          it.appendChild(el('div', 'sc-cap-val', value));
          it.appendChild(el('div', 'sc-cap-sub', sub || ''));
          var track = el('div', 'sc-cap-track' + (pct === null || pct === undefined ? ' na' : ''));
          var bar = el('i', kind || '');
          if (pct !== null && pct !== undefined) bar.style.setProperty('--sc-pct', pct + '%');
          track.appendChild(bar);
          it.appendChild(track);
          return it;
        };
        var pMeta0 = data.pending || {};
        capGrid.textContent = '';
        (function fillCap() {
          var mf = memoryFile;
          var pct = mf && mf.cap ? Math.round((mf.chars || 0) / mf.cap * 100) : null;
          capGrid.appendChild(mkCapItem('MEMORY.md 容量', pct === null ? Derive.num(mf ? mf.chars : '—') : pct + '%',
            (mf ? Derive.num(mf.chars) + ' / ' + Derive.num(mf.cap) + ' 字符 · ' + Derive.count(mf.lines) + ' 条' : '—'),
            pct, pct === null ? '' : Derive.capKind(pct)));
          /* v9：notes 列副标给**真实**绝对值（文件数 + 小节数），不抄原型示意的「148 个文件 · 6.2 MB」
             —— 本机 notes 是 7 类固定文件，抄示意值等于造假数据。 */
          var secCount = 0;
          (data.notes || []).forEach(function (nf) { secCount += Derive.count(nf.sections); });
          capGrid.appendChild(mkCapItem('notes · 笔记', Derive.num(Derive.count(data.notes)),
            '个文件 · ' + Derive.num(secCount) + ' 个小节 · 无容量门', null));
          capGrid.appendChild(mkCapItem('pending 候选', Derive.num(pMeta0.count || 0),
            '条待裁决 · 无容量门（ADD-only 暂存）', null));
        })();
        /* 导航脚状态块（原在「记忆库状态」KPI 段内；该段按 v9 删除后，本处接管同一份数据的同步，不丢功能） */
        if (refs.navHealth) {
          var navPct = (memoryFile && memoryFile.cap) ? Math.round((memoryFile.chars || 0) / memoryFile.cap * 100) : null;
          refs.navHealth(navPct === null ? '正常' : (Derive.capKind(navPct) !== 'ended' ? '水位偏高' : '正常'), navPct === null ? 'ended' : Derive.capKind(navPct));
        }
        /* v9 层级：卡体内的分区是**小节标题**（.sc-mem-group-title），不是第二层卡片
         * （原型 memory 页只有一张「容量占用」卡，卡内是标题 + 列表行）。 */
        // v9：认知可视化——仅归档区（冷热分布 / 超 R 节 / 指针健康 已按 2026-09-11 用户要求移除）
        renderCognitionReport(_tb.pane('growth'), 'memory');

        /* U1（ADR-122 UI）：判据注册表卡已**移出记忆板块** → 落在「运行」视图（renderRunExtras），
         * 判因：记忆板块此前 11 组、判据卡又在最前，首屏过载（方案 §3 A5 自我修正）。 */

        var ctx = { _tb: _tb, data: data, view: view, memoryFile: memoryFile, cap: cap };
        /* v9 严格对齐：原 mmRunMain（徽章行 + 蒸馏运行）与 mmRunStatus（记忆库状态 KPI 行）已删 ——
         *   这两块在原型里属**运行总览**页，记忆库页只有「容量占用」一张卡 + 4 个 Tab。
         *   导航脚状态同步（refs.navHealth）随之迁到本函数 fillCap 之后，不丢功能。 */
        mmGrowthMonth(ctx);
        mmIndexRows(ctx);
        mmPendingRows(ctx);
        mmNotesChips(ctx);
        mmArchiveZone(ctx);
        mmSuiteZone(ctx);
        mmGrowthDelta(ctx);
        status('记忆 · MEMORY ' + (memoryFile ? Derive.num(memoryFile.chars) + '/' + Derive.num(memoryFile.cap) + ' · ' + Derive.count(memoryFile.lines) + ' 行' : '不可用') + ' · 蒸馏 ' + (ds ? Derive.num(ds.runs || 0) + ' 次' : '—'));
        flushFolds(); // 同步收口（见 deferFold 注释：消除 setTimeout 造成的"先铺开再收起"抖动）
      }
      /* 统计小卡（记忆库页 4 个段共用 → 提为模块级，纯函数只依赖 el） */
      var mkStat = function (label, value, sub) {
        var card = el('div', 'sc-mem-stat');
        card.appendChild(el('div', 'sc-mem-stat-label', label));
        card.appendChild(el('div', 'sc-mem-stat-value', value));
        if (sub) card.appendChild(el('div', 'sc-mem-stat-sub', sub));
        return card;
      };
      function mmGrowthMonth(ctx) {
        var host = ctx._tb.pane('growth');
        var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
        var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
        /* ── 路线③ 本月成长（审计聚合 + AGENT 画像快照；零定时器，纯读） ── */
        var gGrowth = data.growth;
        if (gGrowth) {
        group('本月成长 · ' + gGrowth.month);
          var g3 = el('div', 'sc-mem-grid');
          var s3 = gGrowth.sleep || {}, d3 = gGrowth.distill || {}, n3 = gGrowth.now || {};
          g3.appendChild(mkStat('深睡归纳', String(s3.passes || 0) + ' 次', '习得 ' + String(s3.principleAdded || 0) + ' · 替换 ' + String(s3.replaced || 0) + ' · 画像 ' + String(s3.profilesAdded || 0)));
          g3.appendChild(mkStat('蒸馏', String(d3.runs || 0) + ' 次', '成功 ' + String(d3.ok || 0) + ' · 异常 ' + String(d3.bad || 0) + ' · 预筛跳过 ' + String(d3.skips || 0)));
          g3.appendChild(mkStat('AGENT 画像', String(n3.tagRows != null ? n3.tagRows : '—') + ' 行', '原则 ' + String(n3.principleRows || 0) + ' · 路径 ' + String(n3.pathRows || 0) + ' · ' + String(n3.agentChars || 0) + ' 字符'));
          host.appendChild(g3);
          var rds = gGrowth.recentDeep || [];
          if (Derive.has(rds)) {
        host.appendChild(el('div', 'sc-mem-group-title', '本月有效深睡产出'));
            var dl3 = el('div', 'sc-idx-list');
            rds.forEach(function (r) {
              dl3.appendChild(el('div', 'sc-mem-sub', String(r.at || '').slice(0, 10) + '  原则 +' + String(r.added || 0) + '/替换 ' + String(r.replaced || 0) + ' · 画像 +' + String(r.profiles || 0) + ' · gate=' + String(r.gate || '')));
            });
            host.appendChild(dl3);
          } else if ((s3.passes || 0) > 0) {
            host.appendChild(el('div', 'sc-mem-empty', '本月深睡有运行但无产出（内容判据合规保守：材料不足宁缺毋滥）'));
          }
        }
      }
      function mmIndexRows(ctx) {
        var host = ctx._tb.pane('index');
        var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
        var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
        /* ── §3 知识索引 MEMORY.md（progressive disclosure：默认 8 条 + 展开全部） ── */
        if (Derive.has(memoryFile && memoryFile.lines)) {
        group('知识索引 MEMORY.md · ' + memoryFile.lines.length + ' 条');
          host.appendChild(el('div', 'sc-desc', '点击行直达 notes 详情小节（只读）。'));
          var idxWrap = el('div');
          idxWrap.classList.add('sc-box');
          var IDX_PREVIEW = 8;
          var allLines = memoryFile.lines || [];
          renderIndexRows(idxWrap, allLines.slice(0, IDX_PREVIEW), renderMemoryExpanded, true);
          if (allLines.length > IDX_PREVIEW) {
            var moreBtn = el('button', 'sc-idx-more', '展开全部 ' + allLines.length + ' 条');
            moreBtn.type = 'button';
            moreBtn.addEventListener('click', function () {
              idxWrap.textContent = '';
              renderIndexRows(idxWrap, allLines, renderMemoryExpanded, true);
            });
            idxWrap.appendChild(moreBtn);
          }
          host.appendChild(idxWrap);
        }
      }
      function mmPendingRows(ctx) {
        var host = ctx._tb.pane('pending');
        var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
        var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
        /* ── §4 pending 候选队列（U5：行尾加批准/忽略——Cursor/Mem0 审核态借鉴；写走 /memory/approve 门禁） ── */
        if (data.pending && data.pending.count) {
        group('pending 候选队列 · ' + data.pending.count + ' 条');
          var plist = el('div', 'sc-pointer-list');
          (data.pending.recent || []).forEach(function (p2) {
            var row = makeMemoryPointerRow(String(p2.name || '').replace(/\.md$/, ''), null, (p2.mtime || '').slice(0, 10));
            // 批准=确认有价值（移 .processed 跳过后续蒸馏裁决）；忽略=同语义手动处置；均只读安全
            var act = el('div', 'sc-row-gap');
            var fname = String(p2.name || '');
            var okBtn = el('button', 'sc-btn subtle', '批准');
            okBtn.type = 'button';
            okBtn.classList.add('sc-btn-xs', 'sc-btn-ok');
            okBtn.addEventListener('click', function () {
              api('/memory/approve', { method: 'POST', body: JSON.stringify({ pendingFile: fname }) })
                .then(function () { status('✓ 已批准 ' + fname + '（移 .processed，内容由蒸馏正常入册）'); })
                .catch(fail);
            });
            var rmBtn = UI.button('忽略', function () {
              return api('/memory/approve', { method: 'POST', body: JSON.stringify({ pendingFile: fname }) })
                .then(function () { status('已忽略 ' + fname); });
            }, { danger: true, async: true, busyText: '忽略中…', okText: '已忽略', confirm: '忽略并移出候选队列：' + fname + '？' });
            act.appendChild(okBtn); act.appendChild(rmBtn);
            row.appendChild(act);
            plist.appendChild(row);
          });
          host.appendChild(plist);
          host.appendChild(el('div', 'sc-desc', '共 ' + data.pending.count + ' 条（仅显示最近 ' + Derive.count(data.pending.recent) + ' 条）· 批准=确认有价值入册，忽略=移出队列'));
          /* v9（原型候选区 `.alert.info`）：升格/降格的口径与边界说明。 */
          var pTip = el('div', 'sc-ds-alert info');
          pTip.appendChild(el('div', null, '升格 / 降格走 /memory/approve，由 L0 判据裁决。索引行只读，正文编辑走 /memory/section-edit。'));
          host.appendChild(pTip);
        }
      }
      function mmNotesChips(ctx) {
        var host = ctx._tb.pane('notes');
        var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
        var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
        /* U1：折叠哨兵 —— 之后的所有组（notes 详情 / 本地知识区 / 向量召回 / delta / 周增量）收进「展开更多」。
         * 用 setTimeout(0) 自调度：本函数同步渲染完毕后才折叠，故无需改动任何后续分组代码（易回滚）。 */
        /* ── §5 notes 详情小节 ── */
        group('notes 详情小节');
        var nw = el('div', 'sc-notes-list');
        (data.notes || []).forEach(function (nf) {
          var chip = el('div', 'sc-note-chip');
          chip.appendChild(el('span', null, nf.name));
          chip.appendChild(el('span', 'sc-tag', String(nf.sections.length)));
          chip.title = nf.rel + ' · ' + nf.sections.map(function (s) { return s.title }).join(' / ');
          chip.addEventListener('click', function () {
            memoryViewScroll = view.scrollTop; // 记录进入前滚动位置（返回时恢复）
            noteReturnRender = null; // 来源=记忆板块
            api('/memory/sections?rel=' + encodeURIComponent(nf.rel)).then(function (r) {
              renderNoteSections(view, r);
            }).catch(fail);
          });
          nw.appendChild(chip);
        });
        host.appendChild(nw);
      }
      /** v9 记忆库页新增 Tab「归档区」：主动遗忘的产物（库内 `notes/archive/`）。
       * 数据 = `/cognition/report` 的 `archive:[{file,chars}]`（与运行观测页同源，不新增端点）。
       * **只读**：插件没有「复制回 notes/」的端点 ⇒ **不放该按钮**（原型画了），改为在 alert 里写明恢复方式
       * ——「看得见点不动」的假控件比没有更糟。 */
      function mmArchiveZone(ctx) {
        var host = ctx._tb.pane('archive');
        host.appendChild(el('div', 'sc-mem-group-title', '归档区 notes/archive/'));
        var list = el('div');
        host.appendChild(list);
        list.appendChild(el('div', 'sc-desc', '读取中…'));
        api('/cognition/report').then(function (r) {
          var ar = (r && r.archive) || [];
          /* v9 的 Tab 文案**带计数**（原型「归档区 4」）：归档区是唯一异步取数的分区，计数只能等本端返回后回填
           * —— 为此加一个同步端点不值，故直接回写该 Tab 元素。 */
          var tabsEls = ctx._tb.box.querySelectorAll('wa-tab');
          if (tabsEls[3]) tabsEls[3].textContent = '归档区 ' + ar.length;
          list.textContent = '';
          if (!Derive.has(ar)) list.appendChild(el('div', 'sc-desc', '暂无归档条目。'));
          else ar.forEach(function (a) {
            list.appendChild(ovCRow(String(a.file || '—'), 'notes/archive/ · 仅归档不删除',
              [ovPill(Derive.num(a.chars || 0) + ' 字符')]));
          });
          var tip = el('div', 'sc-ds-alert ok');
          tip.appendChild(el('div', null, '主动遗忘只归档、不删除 —— applyForgetOps 禁直删，热节与画像节有守卫。'
            + '如需恢复，把 notes/archive/ 下的文件移回 notes/ 即可（面板不提供写入口）。'));
          host.appendChild(tip);
        }).catch(function () {
          list.textContent = '';
          list.appendChild(el('div', 'sc-desc', '归档区读取失败（/cognition/report）。'));
        });
      }
      function mmSuiteZone(ctx) {
        var host = ctx._tb.pane('index');
        var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
        var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
        /* ── §6 守藏本地知识区（单行摘要，不再重复三索引卡；画像/索引详情在画像与记忆分区） ── */
        var suite = data.suite;
        if (suite && suite.present) {
        group('守藏本地知识区 · suite/knowledge');
          var sMemory = null;
          (suite.indexes || []).forEach(function (f) { if (f.name === 'MEMORY.md') sMemory = f; });
          host.appendChild(el('div', 'sc-desc', '守藏蒸馏器事实源（ADR-0002）：MEMORY ' + (sMemory ? Derive.num(sMemory.chars) + '/' + Derive.num(sMemory.cap) + ' · ' + Derive.count(sMemory.lines) + ' 行' : '—') + ' · pending ' + String(suite.pending ? suite.pending.count : 0) + ' 条。'));
          if (Derive.has(suite.notes)) {
            var snw = el('div', 'sc-notes-list');
            suite.notes.forEach(function (nf) {
              var chip = el('div', 'sc-note-chip');
              chip.appendChild(el('span', null, nf.name));
              chip.appendChild(el('span', 'sc-tag', String(nf.sections.length)));
              chip.title = 'suite · ' + nf.rel + ' · ' + nf.sections.map(function (s) { return s.title }).join(' / ');
              chip.addEventListener('click', function () {
                memoryViewScroll = view.scrollTop; // 记录进入前滚动位置（返回时恢复）
                noteReturnRender = null; // 来源=记忆板块（suite 区板块本身在记忆视图内）
                api('/memory/sections?rel=' + encodeURIComponent(nf.rel) + '&root=suite').then(function (r) {
                  renderNoteSections(view, r);
                }).catch(fail);
              });
              snw.appendChild(chip);
            });
            host.appendChild(snw);
          }
        } else {
          host.appendChild(el('div', 'sc-mem-empty', '守藏本地知识区未启用（suite/knowledge 不存在）'));
        }
      }
      function mmGrowthDelta(ctx) {
        var host = ctx._tb.pane('growth');
        var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
        var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
        /* ── §8 晨起摘要 delta（U4：深睡产出可见物；只读，存在才渲染） ── */
        if (data.delta && data.delta.present && Derive.has(data.delta.rows)) {
        group('最近成长 delta · 深睡产出');
          var dl8 = el('div', 'sc-idx-list');
          data.delta.rows.forEach(function (row) {
            var r8 = el('div', 'sc-idx-row');
            r8.appendChild(el('span', 'sc-idx-subject', String(row).replace(/^\[/, '[')));
            dl8.appendChild(r8);
          });
          host.appendChild(dl8);
          var staleNote = '';
          if (data.delta.staleAt) {
            try { var remain = Math.max(0, new Date(data.delta.staleAt) - Date.now()); staleNote = ' · 剩余 ' + Math.ceil(remain / 3600e3) + 'h 有效'; } catch (e) { /* */ }
          }
          host.appendChild(el('div', 'sc-mem-sub muted', '本次深睡归纳产出（48h 有效' + staleNote + '）· 已在会话注入可见'));
        }

        /* ── §9 本周成长 diff（U4：增量可见物——Basic Memory 借鉴：总量已有成长卡，此处补增量） ── */
        if (data.weekDiff && ((data.weekDiff.deepAdded || 0) > 0)) {
        group('本周成长 · 增量');
          var g9 = el('div', 'sc-mem-grid');
          g9.appendChild(mkStat('深睡新习得', String(data.weekDiff.deepAdded || 0) + ' 条', '近 7 天 [原则]/[路径] 归纳'));
          host.appendChild(g9);
        }
      }

      /* notes 小节的稳定折叠键：rel + 层级路径 + 标题。
       * 带路径是必要的——同一笔记里不同层级的兄弟小节可能同名，只按标题取键会互相串状态。 */
      function secFoldKey(rel, path, title) {
        return 'note:' + (rel || '') + ':' + (path || '') + '§' + (title || '');
      }

      /** notes 小节正文浏览（只读；/memory/sections）。返回时恢复来源板块与滚动位置（记忆/画像/守藏区均可进入）。 */
      var memoryViewScroll = 0; // 进二级视图前的 .sc-view 滚动位置
      var noteReturnRender = null; // 来源板块渲染器（null=记忆板块 renderMemoryExpanded）
      function renderNoteSections(view, data) {
        if (!data || !data.present || !data.sections) { status((data && data.error) || '无小节'); return; }
        view.textContent = '';
        UI.pageHead(data.name, (data.root === 'suite' ? 'suite 知识区 · ' : '') + data.rel + ' · ' + data.sections.length + ' 个小节（白名单只读）');
        var back = el('button', 'sc-btn subtle', '← 返回' + (noteReturnRender === renderPersona ? '画像板块' : data.root === 'suite' ? '守藏知识区' : '记忆库'));
        back.type = 'button';
        back.addEventListener('click', function () {
          var backRender = noteReturnRender || renderMemoryExpanded;
          api('/memory/overview').then(function (r) {
            backRender(view, r);
            requestAnimationFrame(function () { view.scrollTop = memoryViewScroll; }); // 恢复滚动位置，不跳顶
          }).catch(fail);
        });
        view.appendChild(back);
        view.scrollTop = 0; // 二级视图自身从顶部开始读
        // U5：反链聚合（Logseq/思源借鉴）——引用此文件小节的来源清单
        if (Derive.has(data.backrefs)) {
          var bl = el('div');
          bl.appendChild(el('div', 'sc-mem-group-title', '被引用 · ' + data.backrefs.length));
          var bList = el('div', 'sc-idx-list');
          data.backrefs.slice(0, 8).forEach(function (br) {
            var row = el('div', 'sc-idx-row');
            row.appendChild(el('span', 'sc-idx-tag', String(br.from || '').split('/').pop()));
            row.appendChild(el('span', 'sc-idx-subject', String(br.line || '').slice(0, 90)));
            row.title = br.line || '';
            bList.appendChild(row);
          });
          bl.appendChild(bList);
          if (data.backrefs.length > Derive.BACKREF_LIMIT) bl.appendChild(el('div', 'sc-mem-sub muted', '… 共 ' + data.backrefs.length + ' 处引用'));
          view.appendChild(bl);
        }
        // v5.4 树状：递归渲染小节树（## 顶层 → children ###/#### 子树逐层展开）
        /* 状态改造（原实现最脆的一处）：旧代码**从 DOM 反推开合**
         *   `var open = !body.classList.contains('sc-hidden') || !kidsWrap.classList.contains('sc-hidden')`
         * ⇒ ① 状态与渲染互为因果，任何重绘/编程改动即失同步（保存小节后整棵树塌回）；
         *    ② 父节点 open 依赖子容器 class，嵌套项相互影响；③ 无法预置、无法禁用。
         * 现改为：开合只由 Fold 中该节点 key 的值决定，DOM 仅负责把状态画出来。 */
        function renderSecNode(sec, depth, container, path) {
          var pad = Math.min(depth, 4) * 14; // 子树缩进（最多 4 层视觉缩进）
          var hasKids = !!(sec.children && sec.children.length);
          var key = secFoldKey(data.rel, path, sec.title);
          var head = el('div', 'sc-mem-group-title' + (depth > 0 ? ' sub' : ''));
          var arrow = el('span', 'sc-sec-arrow');
          head.appendChild(arrow);
          head.appendChild(document.createTextNode(sec.title));
          head.title = '点击展开/收起' + (depth > 0 ? '（子树）' : '');
          head.classList.add('sc-card-head'); // U2.5b：cursor/布局入 CSS；动态缩进走 --sc-indent
          head.setAttribute('data-fold-key', key); // 供 openMemoryNote 精确置位（替代模拟 click）
          if (pad) head.style.setProperty('--sc-indent', pad + 'px');
          var body = el('div', 'sc-card-body');
          body.textContent = sec.body || (hasKids ? '' : '（空小节）');
          var editSec = el('button', 'sc-btn subtle sc-edit-sec', '✎ 编辑此小节');
          editSec.type = 'button';
          if (pad) editSec.style.setProperty('--sc-indent', pad + 'px');
          editSec.addEventListener('click', function () { editNoteSection(data, sec, view); });
          var kidsWrap = el('div');

          function paint(open) {
            body.classList.toggle('sc-hidden', !open);
            editSec.classList.toggle('sc-hidden', !open);
            kidsWrap.classList.toggle('sc-hidden', !open || !hasKids); // 无子节点 ⇒ 容器恒空
            arrow.textContent = open ? '▾' : '▸';
            head.classList.toggle('sc-on', open);
          }
          paint(Fold.get(key, false)); // 先画后插：插入即正确开合态，无闪动
          head.addEventListener('click', function () { paint(Fold.toggle(key, false)); });
          var off = Bus.on('fold', function (p) {
            if (!head.isConnected && !body.isConnected) { off(); return; }
            if (p && p.key === key) paint(Fold.get(key, false));
          });

          container.appendChild(head);
          container.appendChild(body);
          container.appendChild(editSec);
          if (hasKids) {
            var kidPath = (path ? path + '/' : '') + sec.title;
            (sec.children || []).forEach(function (c) { renderSecNode(c, depth + 1, kidsWrap, kidPath); });
            container.appendChild(kidsWrap);
          }
        }
        (data.sections || []).forEach(function (sec) { renderSecNode(sec, 0, view, ''); });
        status(data.rel + ' · ' + Derive.count(data.sections) + ' 顶层小节（树状，点击逐层展开；编辑在节点细节）');
      }
      /** R3：notes 小节正文编辑（走 /memory/section-edit 门禁；索引指针不动，只改详情正文） */
      function editNoteSection(data, sec, view) {
        if (!data || !data.rel || !sec) return;
        var bodyTxt = sec.body || '';
        var ta = el('textarea', 'sc-input sc-ta');
        ta.value = bodyTxt;
        var wrap = el('div');
        wrap.appendChild(el('div', 'sc-desc', '编辑 §' + sec.title + ' 正文（' + data.rel + '）——保留开头摘要行最佳；保存走写门（备份+容量红线），索引指针不变。'));
        wrap.appendChild(ta);
        var bar = el('div', 'sc-toolbar');
        var saveBtn = el('button', 'sc-btn', '保存正文');
        saveBtn.type = 'button';
        saveBtn.addEventListener('click', function () {
          var next = ta.value.trim();
          if (!next) { status('正文不能为空——如需清空请用删除'); return; }
          saveBtn.disabled = true; saveBtn.textContent = '保存中…';
          api('/memory/section-edit', { method: 'POST', body: JSON.stringify({ rel: data.rel, section: sec.title, newBody: next }) })
            .then(function () { status('✓ §' + sec.title + ' 正文已保存（write_gate 通过）'); api('/memory/sections?rel=' + encodeURIComponent(data.rel) + (data.root === 'suite' ? '&root=suite' : '')).then(function (r) { renderNoteSections(view, r); }).catch(fail); })
            .catch(function (e) { saveBtn.disabled = false; saveBtn.textContent = '保存正文'; fail(e); });
        });
        var cancelBtn = el('button', 'sc-btn subtle', '取消');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', function () { view.removeChild(wrap); });
        bar.appendChild(saveBtn); bar.appendChild(cancelBtn);
        wrap.appendChild(bar);
        view.appendChild(wrap);
      }

      /** 记忆板块：Obsidian 仓库文件夹（文件树 + 笔记预览 + 属性块 + 双链跳转）。 */
      /* ---------- 组装 ---------- */

      /* ---------- 架构视图（2026-09-13 架构重构后新增）----------
       * 动机：G0–G4 重构后，**记录层 / 内容环 / 统一台账 / 装配根 / 断言图**在界面上不可见、MCL 旋钮不可调
       *   （实测客户端对这些名字 0 处引用）。此视图把「可观测」与「可调节」两面接上。
       * 设计：**通用事实渲染**（`renderFacts`）——不臆造后端字段，键值/嵌套/数组一律如实摊开，
       *   并给出原始 JSON 折叠兜底；这样后端加字段时前端不用跟着改（也不是每加一字段就漂移）。 */

      /**
       * 操作卡（**闭包级单一实现** · 2026-09-14 从 `renderViewOverview` 提出）：
       * 总览与架构两页共用同一版式（卡头带图标 → 描述 → 底部「路由 chip + 组件库按钮」）。
       * ⚠ 事实澄清（2026-09-14 实测）：几何门禁的**严格**断言（4 KPI/3 操作卡/组件按钮）**只覆盖「运行总览」**，
       *   其余视图走冒烟（渲染非空）——我最初写成"每页都断言"是**误读**，已改正。
       *   提取动机仍然成立：同族页面的版式是「KPI 行 + 操作卡 ×3」，各页各写一份＝漂移源；
       *   提出来两页共用，新页才有"对齐"可言（不是靠复制）。
       */
      function opCard(title, desc, ep, btn, run, opts) {
        var o = opts || {};
        var c = el('div', 'sc-opcard');
        var head = el('div', 'sc-opcard-head');
        if (o.icon) { var ic = el('span', 'sc-opcard-ic'); ic.appendChild(svg(o.icon)); head.appendChild(ic); }
        head.appendChild(el('span', 'sc-opcard-t', title));
        c.appendChild(head);
        c.appendChild(el('div', 'sc-opcard-d', desc));
        var f = el('div', 'sc-opcard-f');
        f.appendChild(el('span', 'sc-src', ep));
        f.appendChild(el('span', 'sc-spacer'));
        f.appendChild(UI.button(btn, run, {
          primary: true, async: true, busyText: o.busyText || '执行中…',
          confirm: o.confirm, okText: o.okText || (title + ' 已发起')
        }));
        c.appendChild(f);
        return c;
      }

      /** 把任意后端事实渲染成可读的键值表（深度 2；数组给条目数与前几条；对象再摊一层） */
      function renderFacts(host, obj, depth) {
        var d = depth || 0;
        if (obj === null || obj === undefined) { host.appendChild(el('div', 'sc-desc', '—')); return; }
        if (typeof obj !== 'object') { host.appendChild(el('div', 'sc-desc', String(obj))); return; }
        if (Array.isArray(obj)) {
          if (obj.length === 0) { host.appendChild(el('div', 'sc-desc', '（空）')); return; }
          var rows = obj.slice(0, 12);
          rows.forEach(function (it) {
            if (it && typeof it === 'object') {
              var sub = el('div', 'sc-facts-row');
              var line = Object.keys(it).slice(0, 6).map(function (k) { return k + '=' + String(it[k]).slice(0, 40); }).join(' · ');
              sub.appendChild(el('div', 'sc-desc', line));
              host.appendChild(sub);
            } else host.appendChild(el('div', 'sc-desc', '· ' + String(it)));
          });
          if (obj.length > rows.length) host.appendChild(el('div', 'sc-desc', '… 另有 ' + (obj.length - rows.length) + ' 条'));
          return;
        }
        var pairs = [];
        Object.keys(obj).forEach(function (k) {
          var v = obj[k];
          if (v === null || v === undefined) pairs.push([k, '—']);
          else if (typeof v === 'object') {
            if (Array.isArray(v)) pairs.push([k, '[' + v.length + ' 条]']);
            else pairs.push([k, '{' + Object.keys(v).length + ' 键}']);
          } else pairs.push([k, String(v)]);
        });
        try { host.appendChild(UI.kv(pairs)); } catch (e) { host.appendChild(el('div', 'sc-desc', JSON.stringify(obj).slice(0, 400))); }
        if (d < 1) {
          Object.keys(obj).forEach(function (k) {
            var v = obj[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              host.appendChild(el('div', 'sc-sub', k));
              renderFacts(host, v, d + 1);
            } else if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
              host.appendChild(el('div', 'sc-sub', k + '（' + v.length + ' 条）'));
              renderFacts(host, v, d + 1);
            }
          });
        }
      }

      /** 原始 JSON 折叠（兜底：事实渲染看不全时，原文永远能看） */
      function rawDetails(host, obj) {
        var det = document.createElement('details');
        det.appendChild(el('summary', 'sc-desc', '原始 JSON'));
        var pre = el('pre', 'sc-code', JSON.stringify(obj, null, 2));
        det.appendChild(pre);
        host.appendChild(det);
      }

      /** 架构视图：五个页签 = 内容环 / 记录与图 / 观测 / 装配 / 认知环旋钮 */
      function renderViewArch(view) {
        view.textContent = '';
        /* 取数失败兜底：**绝不把宿主炸掉**（无服务端的渲染测试里 `api` 会拒绝，且错误对象可能为空）
         * ——实测：直接 `.catch(fail)` 曾在渲染测试里抛 `Cannot read properties of undefined (reading 'split')`，
         *   整块视图连带渲染失败。此处一律走本兜底。 */
        var safeFail = function (e) {
          var msg = (e && (e.message || e.error)) ? String(e.message || e.error) : '取数失败（端点不可达或返回非 JSON）';
          try { host.appendChild(el('div', 'sc-desc', '⚠ ' + msg)); } catch (_) { /* 连兜底都失败就静默 */ }
        };
        /* **确定性失败文案**（2026-09-13）：渲染快照基线要求 DOM 稳定——
         *   实测直接写 `e.message` 时，无服务端环境下各端点抛错文案/时序不一 ⇒ 基线每次都不一样。
         *   故按**端点路径**给固定文案（同一端点每次相同），既保留可诊断性又让快照可比。 */
        var guard = function (path) {
          return function () {
            try { host.appendChild(el('div', 'sc-desc', '⚠ ' + path + ' 取数失败（端点不可达）')); } catch (_) { /* 静默 */ }
          };
        };
        var host = view;
        try {
          renderArchBody(view, safeFail);
        } catch (e) {
          view.appendChild(el('div', 'sc-desc', '⚠ 架构视图渲染失败：' + String((e && e.message) || e)));
        }
      }

      /** 架构视图主体（异常由 `renderViewArch` 统一兜底；快照确定性见下方各注释） */
      function renderArchBody(view, safeFail) {
        var fail = safeFail;
        /* **确定性失败文案**：本视图有 5 个异步端点，而渲染快照基线要求 DOM **逐次一致**。
         *   实测：透传 `e.message` 时各端点抛错文案/时序不一 ⇒ 基线每次不同（视图契约门红）。
         *   故此处**不打印错误详情**，只给固定一行；诊断细节在「运行观测」视图的日志里查。 */
        var fail = function () {
          /* **静默**：占位符在**同步阶段**已渲染，异步失败**不改 DOM**——
           *   否则 5 个并发端点的失败回调会以不定时序追加到视图末尾 ⇒ 渲染快照逐次不同（视图契约门红）。 */
        };
        UI.pageHead('架构', '重构后的事实面与旋钮：内容环 KPI · 记录层对账与自证 · 统一台账与 legacy 流 · 装配根就绪度 · 断言图 · 认知环参数。数据全部来自只读端点，唯一写入口是认知环旋钮（白名单补丁）。', {
          routes: ['/rings', '/arch/records', '/arch/graph', '/arch/observability', '/arch/assembly', '/mcl/config'], refresh: true
        });

        /* ── 房内版式：页头 → **操作卡 ×3** → **KPI ×4** → 页签内容 ──
         * 依据：同族页面（运行总览等）的版式就是「KPI 行 + 操作卡」；新页对齐它才有可读性与一致性。
         * ⚠ 严格断言只覆盖运行总览（实测澄清），故本页的对齐属**主动对齐**，非"绕过断言"。 */
        var ops = el('div', 'sc-opgrid');
        ops.appendChild(opCard('内容环与台账', '五环 KPI 与环事件对账 + 统一台账按 type 分布（缺 `at` 行数 = 信封完整性）。', 'GET /rings · /arch/observability', '看观测', function () {
          tb.select('obs'); return Promise.resolve();
        }, { icon: 'M3 12h4l2.5-6 4 13L16 12h5', okText: '已切到「观测」' }));
        ops.appendChild(opCard('认知环旋钮', '熟悉度阈值 / 再引导上限 / 材料预算 / topK / 材料去向（P2b）/ REM —— 白名单补丁写 scheduler.json。', 'GET|POST /mcl/config', '去调参', function () {
          tb.select('mcl'); return Promise.resolve();
        }, { icon: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M2 14h4|M10 8h4|M18 16h4', okText: '已切到「认知环旋钮」' }));
        ops.appendChild(opCard('重取架构快照', '重新拉取记录层 / 断言图 / 观测 / 装配四个只读端点（各页签同时刷新）。', 'GET /arch/*', '刷新', function () {
          renderArchBody(view, safeFail); return Promise.resolve();
        }, { icon: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1', busyText: '取数中…', okText: '已刷新' }));
        view.appendChild(ops);

        /* §2 四张 KPI（先建后回填：建在同步路径上，几何门禁才量得到；数值取到即 set） */
        var kpis = el('div', 'sc-kpis');
        var kRec = UI.kpi('记忆记录', { val: '—', sub: 'store census', pct: 0, kind: 'ended' });
        var kPar = UI.kpi('载体对账', { val: '—', sub: 'md ↔ store 逐件', pct: 0, kind: 'ended' });
        var kSelf = UI.kpi('写时自证', { val: '—', sub: '可还原 / 分歧', pct: 0, kind: 'ended' });
        var kAsm = UI.kpi('装配面', { val: '—', sub: '惰性桥 / 新架构模块', pct: 0, kind: 'ended' });
        [kRec, kPar, kSelf, kAsm].forEach(function (c) { kpis.appendChild(c.box); });
        view.appendChild(kpis);

        /** 页签面板：**同步**先放占位符（DOM 与异步时序解耦 ⇒ 渲染快照稳定）；取到数后整块替换 */
        var pane = function (text) { var p = el('div'); p.appendChild(el('div', 'sc-desc', text)); return p; };
        var pRings = pane('读取中…若长期如此说明 /rings 端点不可达');
        var pRec = pane('读取中…若长期如此说明 /arch/records · /arch/graph 端点不可达');
        var pObs = pane('读取中…若长期如此说明 /arch/observability 端点不可达');
        var pAsm = pane('读取中…若长期如此说明 /arch/assembly 端点不可达');
        var pMcl = pane('读取中…若长期如此说明 /mcl/config 端点不可达');
        var tb = UI.tabs('arch', [
          { id: 'rings', label: '内容环', pane: pRings },
          { id: 'rec', label: '记录与图', pane: pRec },
          { id: 'obs', label: '观测', pane: pObs },
          { id: 'asm', label: '装配', pane: pAsm },
          { id: 'mcl', label: '认知环旋钮', pane: pMcl }
        ]);
        view.appendChild(tb.box);

        /* ① 内容环（后端已有端点但此前**无 UI 入口**） */
        api('/rings').then(function (r) {
          pRings.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
          var c = UI.card('五环 KPI 与环事件对账');
          pRings.appendChild(c.box);
          renderFacts(c.body, r, 0);
          rawDetails(c.body, r);
        }).catch(fail);

        /* ② 记录层 + 断言图 */
        api('/arch/records').then(function (r) {
          pRec.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
          var c1 = UI.card('记录层（Record 事实源）');
          pRec.appendChild(c1.box);
          var st = r.store || {};
          /* KPI 回填（房内版式要求 4 张 KPI 都要有值与条） */
          kRec.set(String(st.records || 0), '无标签 ' + String(st.untagged || 0) + ' 条');
          c1.body.appendChild(UI.kv([
            ['记录数', String(st.records || 0)],
            ['无标签待归类', String(st.untagged || 0)],
            ['md↔store 对账', String(r.carriersOk || 0) + ' / ' + String(r.carriersTotal || 0) + ' 载体一致']
          ]));
          var sh = r.shadow || {};
          kPar.set(String(r.carriersOk || 0) + ' / ' + String(r.carriersTotal || 0), 'md ↔ store 逐件一致');
          if (r.carriersTotal) kPar.fill(Math.round((r.carriersOk || 0) / r.carriersTotal * 100), r.carriersOk === r.carriersTotal ? 'ended' : 'suspect');
          kSelf.set(String(sh.verified || 0) + ' / ' + String(sh.diverged || 0), '写 ' + String(sh.writes || 0) + ' 次 · 可还原 / 分歧');
          kSelf.fill(sh.diverged ? 0 : 100, sh.diverged ? 'stalled' : 'ended');
          c1.body.appendChild(UI.kv([
            ['写时自证', '写 ' + String(sh.writes || 0) + ' · 可还原 ' + String(sh.verified || 0) + ' · **分歧 ' + String(sh.diverged || 0) + '**'],
            ['末次', String(sh.lastAt || '—') + '（' + String(sh.lastFile || '—') + '）']
          ]));
          c1.body.appendChild(el('div', 'sc-sub', '载体逐件对账'));
          renderFacts(c1.body, (r.carriers || []).map(function (x) { return { 文件: x.file, md: x.mdBytes, store: x.storeBytes, 一致: x.ok ? '是' : '否', 原因: x.reason || '' }; }), 1);
          c1.body.appendChild(el('div', 'sc-sub', '跨文件逐字节同文（只报告不删——内容属用户）'));
          var dups = r.dups || [];
          if (dups.length === 0) c1.body.appendChild(el('div', 'sc-desc', '无（除索引/详情同名标题这类结构性重名）'));
          dups.slice(0, 8).forEach(function (dd) {
            var box = el('div', 'sc-facts-row');
            box.appendChild(el('div', 'sc-desc', '×' + dd.count + ' ' + JSON.stringify(String(dd.text || '').slice(0, 60))));
            box.appendChild(el('div', 'sc-desc', (dd.files || []).map(function (f) { return f.file + '#' + f.order; }).join('  |  ')));
            c1.body.appendChild(box);
          });
          c1.body.appendChild(el('div', 'sc-desc', (r.address && r.address.note) || ''));

          api('/arch/graph').then(function (g) {
          pObs.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
            var c2 = UI.card('断言图（关系即事实）');
            pRec.appendChild(c2.box);
            c2.body.appendChild(UI.kv([
              ['节点', String(g.nodes || 0) + '（记录 ' + String(g.recordNodes || 0) + ' + 锚 ' + String(g.anchors || 0) + '）'],
              ['边', String(g.edges || 0)],
              ['悬空证据', String(g.danglingEvidence || 0)],
              ['活跃 / 失效', String(g.live || 0) + ' / ' + String(g.expired || 0)]
            ]));
            c2.body.appendChild(UI.kv([
              ['answers', String(g.answers || 0)], ['collision', String(g.collision || 0)],
              ['commitment', String(g.commitment || 0)], ['relation', String(g.relation || 0)],
              ['pointsTo', String(g.pointsTo || 0)], ['provenance', String(g.provenance || 0)],
              ['supersede', String(g.supersede || 0)]
            ]));
          }).catch(fail);
        }).catch(fail);

        /* ③ 观测面 */
        api('/arch/observability').then(function (r) {
          pObs.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
          var c = UI.card('统一台账与观测面');
          pObs.appendChild(c.box);
          var lg = r.ledger || {};
          c.body.appendChild(UI.kv([
            ['台账行数', String(lg.lines || 0)],
            ['缺 at 行（信封完整性）', String(lg.missingAt || 0) + (r.envelope && r.envelope.ok ? ' ✓' : ' ⚠')],
            ['台账路径', String(lg.path || '')]
          ]));
          c.body.appendChild(el('div', 'sc-sub', '按 type 分布'));
          renderFacts(c.body, lg.byType || [], 1);
          c.body.appendChild(el('div', 'sc-sub', 'audit 目录实况'));
          renderFacts(c.body, r.files || [], 1);
          c.body.appendChild(el('div', 'sc-sub', 'legacy 流（已并入台账，仅存历史）'));
          renderFacts(c.body, (r.legacy || []).map(function (x) { return { 流: x.name, 仍在: x.present ? '是' : '否' }; }), 1);
          var reg = r.registry || {};
          c.body.appendChild(el('div', 'sc-sub', '口径（族 × 域）'));
          c.body.appendChild(el('div', 'sc-desc', '族：' + (reg.families || []).join(' · ')));
          c.body.appendChild(el('div', 'sc-desc', '域：' + (reg.domains || []).join(' · ')));
          c.body.appendChild(el('div', 'sc-desc', '权威：' + String(reg.authority || '') + '（suite 域事件流目标 = ' + String((reg.baseline || {}).suiteEventStreams) + '）'));
        }).catch(fail);

        /* ④ 装配面 */
        api('/arch/assembly').then(function (r) {
          pAsm.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
          var c = UI.card('装配根（composition root）与已装能力');
          pAsm.appendChild(c.box);
          var cp = r.composition || {};
          c.body.appendChild(UI.kv([
            ['惰性桥边数', String(cp.bridges) + (cp.bridges === 0 ? ' ✓（三条桥已退役）' : ' ⚠')],
            ['契约路由数', String((r.routes || {}).declared || 0)]
          ]));
          /* 存储模式（2026-09-14）：记录层开关——**新增架构的可调节面**，放首屏内（图检要求）。
           * 只给 md|dual：`record` 未实现，枚举校验会明确拒绝（避免"看能切、切了就坏"的假可控）。 */
          var st2 = r.store || {};
          c.body.appendChild(UI.item('存储模式 storeMode', 'md = 只写 md 投影；dual = md ↔ Record 双写（写时自证：可还原 / 分歧）。' + (st2.note ? '⚠ ' + st2.note : ''),
            UI.select([{ value: 'md', label: 'md（只用 md 投影）' }, { value: 'dual', label: 'dual（md ↔ Record 双写）' }],
              st2.mode === 'dual' ? 'dual' : 'md',
              function (v) {
                api('/set', { method: 'POST', body: JSON.stringify({ key: 'storeMode', value: v }) })
                  .then(function (res) { status(res && res.ok ? '✓ storeMode = ' + v + '（已写 scheduler.json）' : '⚠ 未生效'); renderArchBody(view, safeFail); })
                  .catch(function () { status('⚠ storeMode 写入失败（枚举或白名单拒绝）', 'error'); });
              }, '存储模式'),
            {}));
          renderFacts(c.body, cp.handles || [], 1);
          var pl = r.plugin || {};
          var mods = pl.modules || [];
          var modsOk = mods.filter(function (m) { return m.present; }).length;
          kAsm.set(String(cp.bridges) + ' 桥', modsOk + ' / ' + mods.length + ' 新架构模块在');
          kAsm.fill(cp.bridges === 0 && modsOk === mods.length ? 100 : 0, cp.bridges === 0 && modsOk === mods.length ? 'ended' : 'suspect');
          c.body.appendChild(UI.kv([['插件版本', String(pl.version || '')], ['lib 文件数', String(pl.libFiles || 0)]]));
          c.body.appendChild(el('div', 'sc-sub', '重构后新增模块（装上去的那份是否带着）'));
          renderFacts(c.body, (pl.modules || []).map(function (m) { return { 模块: m.name, 在: m.present ? '✓' : '✗' }; }), 1);
          c.body.appendChild(el('div', 'sc-desc', (cp.note || '')));
          /* ⚠ 移出：storeMode 控件改放卡片**首屏内**（图检发现放在末尾会被句柄/模块清单挤到首屏之外 ⇒ 看不见＝没验证） */
        }).catch(fail);

        /* ⑤ 认知环旋钮（唯一写入口：白名单补丁；改后重载生效） */
        function renderMclKnobs() {
          pMcl.textContent = '';
          api('/mcl/config').then(function (r) {
          pMcl.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
            var cur = r.persisted || {};
            var run = r.running || {};
            var c = UI.card('认知环（MCL）旋钮', { desc: '白名单补丁写 `scheduler.json`；**重载后生效**。当前运行态：' + (r.active ? '已装配' : '未装配') });
            pMcl.appendChild(c.box);
            c.body.appendChild(UI.kv([
              ['运行态通道计数', 'steps=' + String(run.steps || 0) + ' · slow=' + String(run.slow || 0) + ' · injected=' + String(run.injected || 0)],
              ['材料去向', (cur.mclMaterialInSystem ? 'systemPrompt 段（P2b 开）' : '消息面') + '（按持久配置）'],
              ['材料送达计数', 'sysBlockNonEmpty=' + String(run.sysBlockNonEmpty || 0) + ' · 末次 ' + String(run.sysBlockLastChars || 0) + ' 字符']
            ]));
            var save = function (key, val) {
              var patch = {}; patch[key] = val;
              api('/mcl/config', { method: 'POST', body: JSON.stringify(patch) })
                .then(function () { status('✓ ' + key + ' = ' + val + '（已写入 scheduler.json，重载后生效）'); renderMclKnobs(); })
                .catch(fail);
            };
            var lim = r.limits || {};
            var defs = lim.defaults || {};
            c.body.appendChild(UI.item('熟悉度阈值 mclFamiliarThreshold', '绝对余弦口径；≥ 阈值且命中高置信标签才走快通道（缺省 ' + String(defs.familiarThreshold) + '）。数据提示：本库 936 步实测 86% 的步**无召回命中**——先查召回，再调此值。',
              UI.input(cur.mclFamiliarThreshold != null ? cur.mclFamiliarThreshold : defs.familiarThreshold, function (v) { var n = parseFloat(v); if (!isNaN(n)) save('mclFamiliarThreshold', n); }, { type: 'number', width: '120px', ariaLabel: '熟悉度阈值' }), {}));
            c.body.appendChild(UI.item('再引导上限 mclMaxNudges', '慢通道未引用材料时的再引导次数（0 = 只注入不引导；缺省 ' + String(defs.maxNudges) + '）',
              UI.input(cur.mclMaxNudges != null ? cur.mclMaxNudges : defs.maxNudges, function (v) { var n = parseInt(v, 10); if (!isNaN(n)) save('mclMaxNudges', n); }, { type: 'number', width: '120px', ariaLabel: '再引导上限' }), {}));
            c.body.appendChild(UI.item('材料预算 mclBudgetChars', '慢通道材料硬预算（字符；缺省 ' + String(defs.budgetChars) + '）',
              UI.input(cur.mclBudgetChars != null ? cur.mclBudgetChars : defs.budgetChars, function (v) { var n = parseInt(v, 10); if (!isNaN(n)) save('mclBudgetChars', n); }, { type: 'number', width: '140px', ariaLabel: '材料预算' }), {}));
            c.body.appendChild(UI.item('指针条数 mclTopK', '慢通道注入的指针条数（缺省 ' + String(defs.topK) + '）',
              UI.input(cur.mclTopK != null ? cur.mclTopK : defs.topK, function (v) { var n = parseInt(v, 10); if (!isNaN(n)) save('mclTopK', n); }, { type: 'number', width: '120px', ariaLabel: '指针条数' }), {}));
            c.body.appendChild(UI.item('材料入 systemPrompt 段（P2b）', '开 = 材料挂注入面、不进转录（实测 `sysBlockNonEmpty` 会涨）；关 = 走消息面（送达有据）',
              UI.toggle(cur.mclMaterialInSystem === true, function (v) { save('mclMaterialInSystem', v); }), {}));
            c.body.appendChild(UI.item('认知环开关 mclEnabled', '一键回滚开关',
              UI.toggle(cur.mclEnabled !== false, function (v) { save('mclEnabled', v); }), {}));
            c.body.appendChild(UI.item('审计流 mclAudit', '写统一台账（type=mcl*）',
              UI.toggle(cur.mclAudit !== false, function (v) { save('mclAudit', v); }), {}));
            c.body.appendChild(UI.item('REM 相 enableRemPass', '深睡同 pass 内做跨主题联想（缺省关；产物会并入画像，噪声代价高）',
              UI.toggle(cur.enableRemPass === true, function (v) { save('enableRemPass', v); }), {}));
            c.body.appendChild(el('div', 'sc-desc', '探针（定位 P2b 用）：宿主传入 context 键 = ' + String(run.sysBlockCtxKeys || '—') + ' · 解析出的会话 = ' + String(run.sysBlockLastSid || '—')));
            if (run.trace && run.trace.length) {
              c.body.appendChild(el('div', 'sc-sub', '时序轨迹（cap 捕获 · set 写材料 · ren 渲染）'));
              renderFacts(c.body, run.trace, 1);
            }
            rawDetails(c.body, r);
          }).catch(fail);
        }
        renderMclKnobs();
      }

      /* 8 视图按语义 4 组（P1）：总览 / 记忆 / 运行 / 配置；「配置原文」下沉到 设置 · 高级，不再占一级入口 */
      var VIEWS = [
        ['overview', '运行总览', 'overview', '总览'],
        ['memory', '记忆库', 'memory', '记忆'],
        ['persona', '画像', 'persona', '记忆'],
        ['suite', '插件集合', 'suite', '运行'],
        ['deepsleep', '深度睡眠', 'sleep', '运行'],
        ['observe', '运行观测', 'observe', '运行'],
        ['arch', '架构', 'arch', '运行'],
        ['toggles', '参数', 'toggles', '配置'],
        ['settings', '设置', 'settings', '配置']
      ];

      /* ---------- 运行观测视图（C1 进度 / C2 日志 / C3 错误定位 / C4 指标） ---------- */
      function renderViewObserve(view) {
        view.textContent = '';
        /* v9 严格对齐：页头右侧 = 「导出」+「清空日志」(danger)；路由 chip 对齐原型 4 个端点 */
        var logsAll = Store.get('logs') || [];
        UI.pageHead('运行观测', '执行进度、调用日志、错误定位与关键指标。日志保留最近 500 条，错误带端点/参数/堆栈，便于定位而非只剩一行提示。', {
          routes: ['/cognition/report', '/selfcheck', '/reconcile', '/embed/test'], refresh: true,
          actions: [
            UI.button('导出', function () {
              var blob = new Blob([JSON.stringify({ logs: logsAll, errors: Store.get('errors') || [], metrics: Store.get('metrics') || {} }, null, 2)], { type: 'application/json' });
              var a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'shoucang-observe-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.json';
              a.click(); URL.revokeObjectURL(a.href);
              status('✓ 观测数据已导出（' + logsAll.length + ' 条日志）');
            }, { title: '下载当前日志/错误/指标（JSON）' }),
            UI.button('清空日志', function () { Store.set('logs', []); Store.set('errors', []); refreshCurrentView(); status('已清空日志与错误记录'); }, { danger: true, confirm: '确认清空全部日志与错误记录？' })
          ]
        });
        /* v9 严格对齐：4 张观测 KPI（请求总数 / 成功率 / 平均耗时 / 错误）——
         *   数据全部从本地 Store 统计（logs 的 "N ms" 字样 + errors），**零新端点**。 */
        (function () {
          var msList = [];
          var failCount = 0;
          logsAll.forEach(function (l) {
            var msg = String((l && l.message) || '');
            var mt = /(\d+(?:\.\d+)?)\s*ms/.exec(msg);
            if (mt) msList.push(parseFloat(mt[1]));
            if (/✗|error|失败/.test(msg)) failCount++;
          });
          var errCount = Derive.count(Store.get('errors')); // 判空纪律（D7d）：统一走 Derive.count，不散落兜底写法
          var total = logsAll.length;
          var okCount = Math.max(0, total - failCount);
          var avgMs = msList.length ? Math.round(msList.reduce(function (a, b) { return a + b; }, 0) / msList.length) : 0;
          var okPct = total ? Math.round(okCount / total * 100) : null;
          var grid2 = el('div', 'sc-kpis');
          /* v9 §6-1：观测页 KPI **无状态点、无进度条**（原型 DOM 实测 kpi:4 内零 dot/bar，卡高 104）——
           * 面板此前复用容量类 KPI（dot:4 bar:4 / 110 高）⇒ 形态不对齐。 */
          grid2.appendChild(UI.kpi('请求总数', { val: Derive.num(total), sub: '本地保留（上限 500 条）', plain: true }).box);
          grid2.appendChild(UI.kpi('成功率', { val: total ? (Math.round(okCount / total * 1000) / 10) + '%' : '—', sub: '非失败请求占比', plain: true }).box);
          grid2.appendChild(UI.kpi('平均耗时', { val: avgMs + 'ms', sub: msList.length ? '按 ' + msList.length + ' 条带耗时记录均算' : '暂无带耗时的记录', plain: true }).box);
          grid2.appendChild(UI.kpi('错误', { val: Derive.num(errCount), sub: errCount ? '见下方「错误定位」' : '无记录', plain: true }).box);
          view.appendChild(grid2);
        })();

        // 1) 进度 —— v9 §6-2：原型是**卡**（.card：卡头「执行进度」+ 路由 chip / 卡体内 .cap 进度条），
        //    面板此前是折叠块（.sc-fold.open）⇒ 形态不同。有真实进度时才渲染条，无进度给卡内空态。
        var pc = UI.card('执行进度', { sub: '本次会话的深睡 / 蒸馏进度', right: [el('span', 'sc-src', '/cognition/report')] });
        var p = Store.get('progress') || {};
        var ids = Object.keys(p);
        if (!Derive.has(ids)) pc.body.appendChild(el('div', 'sc-desc', '当前无进行中的任务。'));
        else ids.forEach(function (id) { pc.body.appendChild(UI.progress(id)); });
        view.appendChild(pc.box);

        /* v9 严格对齐（第五轮 · 观测页形态）：原型是「4 KPI + 执行进度卡 + **3 组 Tab**」，
         * 面板此前把 6 块内容做成**叠放折叠块**（同页纵向堆叠、互相挤占首屏）。
         * 现改为 Tab 容器：调用日志 / 错误定位 / 运维操作（原型 3 组），
         * 「关键指标」为真实功能但原型无此组 ⇒ 独立成一枚（不删功能）；
         * 「高级：行级编辑 / 删除」并入运维操作（同属危险运维语义）。
         * Tab 态经 Cfg('tab:observe') 持久化，与参数页 / 记忆库页同一 UI.tabs 实现。 */
        var obLogs = el('div'); var obErrs = el('div'); var obOps = el('div'); var obMetrics = el('div');
        var _ob = UI.tabs('observe', [
          { id: 'logs', label: '调用日志 ' + Derive.count(Store.get('logs')), pane: obLogs },
          { id: 'errors', label: '错误定位 ' + Derive.count(Store.get('errors')), pane: obErrs },
          { id: 'ops', label: '运维操作', pane: obOps },
          { id: 'metrics', label: '关键指标', pane: obMetrics }
        ]);
        view.appendChild(_ob.box);

        // 2) 错误（C3 可定位）
        var errs = Store.get('errors') || [];
        var ebox = el('div');
        if (!Derive.has(errs)) ebox.appendChild(el('div', 'sc-desc', '暂无错误。'));
        else {
          var list = el('div');
          errs.slice().reverse().slice(0, 30).forEach(function (r) {
            var ctx = r.ctx;
            var where = ctx ? ((ctx.method || '') + ' ' + (ctx.path || '') + (ctx.params ? ' ' + JSON.stringify(ctx.params) : '')) : '—';
            list.appendChild(UI.collapsible(
              new Date(r.t).toLocaleTimeString() + '  ' + r.message,
              UI.kv([['端点', where], ['堆栈', r.stack || '—']]),
              {}
            ));
          });
          ebox.appendChild(list);
          ebox.appendChild(UI.button('清空错误', function () { Store.set('errors', []); refreshCurrentView(); }, { danger: true, confirm: '确认清空错误记录？' }));
        }
        obErrs.appendChild(ebox);

        // 3) 关键指标（C4）
        var mbox = el('div');
        var m = Store.get('metrics') || {};
        var mk = Object.keys(m);
        if (!Derive.has(mk)) mbox.appendChild(el('div', 'sc-desc', '暂无指标（切换各视图会自动采集）。'));
        else mbox.appendChild(UI.kv(mk.map(function (k) { return [k, String(m[k])]; })));
        obMetrics.appendChild(mbox);
        /* 账本对账与产出健康（原在深睡页；v9 深睡页无此卡 ⇒ 迁到本 Tab，与该 Tab 的运维/健康语义相符） */
        renderRunExtras(obMetrics);

        // 4) 日志（C2）
        obLogs.appendChild(buildLogPanel(400));

        /* 运维操作（B1）：为后端已实现但界面无入口的端点补齐入口 —— /embed/test、/root/bootstrap */
        var ops = el('div');
        var embedRes = el('div', 'sc-desc', '未测试');
        ops.appendChild(UI.item('嵌入服务连通性', 'POST /embed/test —— 验证当前 embedding 配置是否可用（配完即可验证，不必等实际调用失败）。',
          UI.button('测试连接', function () {
            embedRes.textContent = '读取配置…';
            // /embed/test 需要 { baseUrl, apiKey }——先从 /embed/config 取当前配置再测（不可发空 body）
            return api('/embed/config').then(function (c) {
              var g = (c && c.global) || {};
              var baseUrl = String(g.embedBaseUrl || '').trim();
              if (!baseUrl) { embedRes.textContent = '✗ 未配置 embedBaseUrl，请先到「参数调节」填写。'; return; }
              embedRes.textContent = '测试中… ' + baseUrl;
              return apiCtx('/embed/test', {
                method: 'POST',
                body: JSON.stringify({ baseUrl: baseUrl, apiKey: String(g.embedApiKey || '').trim() })
              }, '嵌入连通性').then(function (r) {
                var n = Derive.count(r && r.models);
                embedRes.textContent = (r && r.error) ? ('✗ ' + r.error) : ('✓ 可达 · ' + n + ' 个模型');
                Log.info('嵌入服务连通性测试' + ((r && r.error) ? '失败：' + r.error : '通过'));
              });
            }).catch(function (e) { embedRes.textContent = '✗ ' + e.message; });
          }, { async: true, busyText: '测试中…', okText: '嵌入连通性测试完成' }), {}));
        ops.appendChild(embedRes);

        var bootRes = el('div', 'sc-desc', '未执行');
        ops.appendChild(UI.item('根目录引导', 'POST /root/bootstrap —— 初始化/修复记忆根目录结构。',
          UI.button('执行引导', function () {
            bootRes.textContent = '执行中…';
            return apiCtx('/root/bootstrap', { method: 'POST', body: JSON.stringify({}) }, '根目录引导')
              .then(function (r) { bootRes.textContent = '✓ ' + JSON.stringify(r).slice(0, 240); })
              .catch(function (e) { bootRes.textContent = '✗ ' + e.message; });
          }, { async: true, busyText: '执行中…', confirm: '执行根目录引导会尝试创建缺失的目录结构，确认继续？' }), {}));
        ops.appendChild(bootRes);

        obOps.appendChild(ops);

        /* 高级（B1 收口）：/memory/edit · /memory/remove 为**行级**原语，作用对象是记忆文件本身。
         * 注意：既有设计 R3 明确「索引行只读——直接改索引行会与 notes 详情错位」，常规编辑请走小节编辑
         * （/memory/section-edit）。此处仅为「无死角入口」要求暴露，并附显式风险提示，默认折叠。 */
        var adv = el('div');
        adv.appendChild(el('div', 'sc-desc', '⚠ 行级直接改写记忆文件。改索引行可能导致指针与 notes 正文不一致（详见 R3），常规编辑请用「记忆板块 → 小节编辑」。'));
        var fInp = UI.input('MEMORY.md', null, { placeholder: '文件，如 MEMORY.md / notes/lessons.md', width: '260px', ariaLabel: '记忆文件' });
        var lInp = UI.input('', null, { placeholder: '待匹配的原始行文本', width: '320px', ariaLabel: '原始行' });
        var nInp = UI.input('', null, { placeholder: '新行文本（仅编辑需要）', width: '320px', ariaLabel: '新行' });
        adv.appendChild(UI.item('目标文件', 'isWritable 白名单内的记忆文件。', fInp, {}));
        adv.appendChild(UI.item('原始行', '必须与原文件中的一行完全一致（后端按行匹配）。', lInp, {}));
        adv.appendChild(UI.item('新行文本', '编辑时必填；删除时忽略。', nInp, {}));
        var advRes = el('div', 'sc-desc', '未执行');
        var row = el('div', 'sc-toolbar'); // 与全站「操作按钮行」同一原语（旧实现三行内联样式各写各的间距）
        row.appendChild(UI.button('按行编辑', function () {
          var file = fInp.value.trim(), line = lInp.value.trim(), nt = nInp.value.trim();
          if (!file || !line || !nt) { advRes.textContent = '✗ 文件 / 原始行 / 新行 三项均必填'; return; }
          return apiCtx('/memory/edit', { method: 'POST', body: JSON.stringify({ file: file, line: line, newText: nt }) }, '行级编辑')
            .then(function () { advRes.textContent = '✓ 已改写该行'; Log.warn('行级编辑已执行（可能需同步索引）：' + file); })
            .catch(function (e) { advRes.textContent = '✗ ' + e.message; });
        }, { async: true, busyText: '提交中…' }));
        row.appendChild(UI.button('按行删除', function () {
          var file = fInp.value.trim(), line = lInp.value.trim();
          if (!file || !line) { advRes.textContent = '✗ 文件与原始行必填'; return; }
          // 确认文案需带「目标行内容」⇒ 用动态 confirm；此处不再走 opts.confirm（原实现两者并存 ⇒ 弹两次）
          if (!confirm('确认删除该行？此操作不可撤销（会由写门备份）。\n\n' + line)) return;
          return apiCtx('/memory/remove', { method: 'POST', body: JSON.stringify({ file: file, line: line }) }, '行级删除')
            .then(function () { advRes.textContent = '✓ 已删除该行'; Log.warn('行级删除已执行（可能需同步索引）：' + file); })
            .catch(function (e) { advRes.textContent = '✗ ' + e.message; });
        }, { async: true, busyText: '提交中…', danger: true, confirm: '确认执行行级删除？' }));
        adv.appendChild(row);
        adv.appendChild(advRes);
        obOps.appendChild(UI.collapsible('高级：行级编辑 / 删除（谨慎）', adv, { open: false }));
      }

      /* 日志面板（状态栏上方 + 观测视图共用） */
      function buildLogPanel(maxH, opts) {
        var o = opts || {};
        var wrap = el('div', 'sc-logwrap');
        if (maxH) wrap.style.setProperty('--sc-log-h', maxH + 'px'); // 高度走变量（CSS 兜底 150px）
        if (o.collapsed) wrap.classList.add('sc-log-collapsed');
        var head = el('div', 'sc-log-head');
        var arrow = el('span', 'sc-sec-arrow', o.collapsed ? '▸' : '▾');
        if (o.collapsible) {
          /* v9 对齐：日志折叠为一行可点开的条带（此前是"要么常驻面板、要么整个移除"两态） */
          head.classList.add('sc-log-toggle');
          head.setAttribute('role', 'button');
          head.setAttribute('tabindex', '0');
          head.setAttribute('aria-expanded', o.collapsed ? 'false' : 'true');
          head.onclick = function (ev) {
            if (ev && ev.target && ev.target.tagName === 'SELECT') return; // 级别下拉不触发折叠
            Cfg.set('showLogs', !!Cfg.get('showLogs', true) ? false : true);
            applyLogPanel();
          };
          head.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); head.onclick(ev) } };
        }
        head.appendChild(arrow);
        head.appendChild(el('span', null, '日志'));
        var lvSel = UI.select(
          [{ value: 'info', label: '全部' }, { value: 'warn', label: '警告+' }, { value: 'error', label: '仅错误' }],
          Cfg.get('logLevel', 'info'),
          function (v) { Cfg.set('logLevel', v); render(); }
        );
        lvSel.setAttribute('aria-label', '日志级别');
        head.appendChild(lvSel);
        var cnt = el('span', null, '');
        head.appendChild(cnt);
        head.appendChild(el('span', 'sc-spacer')); // 推右侧（原为内联 marginLeft:auto）
        head.appendChild(UI.button('清空', function () { Log.clear(); render(); }));
        wrap.appendChild(head);
        var body = el('div');
        wrap.appendChild(body);
        var ORDER = { info: 0, warn: 1, error: 2 };
        function render() {
          var min = ORDER[Cfg.get('logLevel', 'info')] || 0;
          var all = (Store.get('logs') || []).filter(function (l) { return (ORDER[l.level] || 0) >= min; });
          cnt.textContent = all.length + ' 条';
          body.textContent = '';
          if (!Derive.has(all)) { body.appendChild(el('div', 'sc-log-row', '（无）')); return; }
          /* v9 §6-4 行形态：级别图标 + 方法 + 端点 + 耗时 + 状态码（后两者取自 api() 写入 ctx 的真实值）。
           * 无 ctx 的纯文本日志（业务提示）回落「图标 + 文本」，不伪造端点与状态码。 */
          var LVICON = { info: '·', warn: '!', error: '✗' };
          all.slice(-200).reverse().forEach(function (l) {
            var row = el('div', 'sc-log-row sc-log-' + l.level);
            var c = l.ctx || {};
            row.appendChild(el('span', 'sc-log-lv', LVICON[l.level] || '·'));
            if (c.path) {
              row.appendChild(el('span', 'sc-log-m', c.method || 'GET'));
              row.appendChild(el('span', 'sc-log-p', String(c.path)));
              if (c.ms !== undefined) row.appendChild(el('span', 'sc-log-ms', c.ms + 'ms'));
              if (c.status !== undefined) row.appendChild(el('span', 'sc-log-st', String(c.status)));
            } else {
              row.appendChild(el('span', 'sc-log-msg', l.msg));
            }
            row.appendChild(el('span', 'sc-spacer'));
            row.appendChild(el('span', 'sc-log-t', new Date(l.t).toLocaleTimeString()));
            body.appendChild(row);
          });
        }
        render();
        Bus.on('log', render);
        return wrap;
      }

      /* ---------- 界面设置视图（自由度：密度/布局/刷新/日志；统一配置入口 D5） ---------- */
      function renderViewSettings(view) {
        view.textContent = '';
        UI.pageHead('设置', '界面偏好与高级操作。配置原文（YAML）与行级编辑收在此处，配风险提示。', {
          routes: ['/config', '/save', '/roots', '/memory/edit'],
          actions: [UI.button('导出快照', function () {
            /* 真实动作：把「后端配置原文 + 浏览器侧界面偏好」导出为一份 JSON 快照（排障/迁移用）。 */
            return api('/config').then(function (c) {
              var snap = {
                at: new Date().toISOString(),
                config: { file: (c && c.file) || '', text: (c && c.text) || '' },
                ui: Cfg.get()
              };
              var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
              var a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'shoucang-config-snapshot-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.json';
              a.click(); URL.revokeObjectURL(a.href);
              status('✓ 配置快照已导出');
            });
          }, { async: true, busyText: '导出中…', okText: '配置快照已导出', title: '导出配置原文 + 界面偏好（JSON）' })]
        });
        var pLook = el('div'); var pAdv = el('div'); var _tb = UI.tabs("settings", [{ id: 'pref', label: '界面偏好', pane: pLook }, { id: 'advanced', label: '高级', pane: pAdv }]);
        view.appendChild(_tb.box);
        var host = _tb.pane('pref');

        /* ── v9 结构（DOM 实测 §8）：界面偏好 pane = **一张 card 平铺全部行** + 「快捷键」card + 「恢复默认」行 ──
         * 此前是 6 个折叠组（外观 / 行为 / 可观察性 / 启动 / 外观皮肤 / 快捷键）——折叠组是面板自造的一层，
         * 原型的层级只有「页头 → 卡(.card：卡头 + 卡体) → 行」。原型该 pane 内 12 行同质平铺、**无小标题**，
         * 故这里也不再分小节（项少，平铺可读）。 */
        var pref = UI.card(null);
        host.appendChild(pref.box);
        var box = pref.body;
        box.appendChild(UI.item('显示密度', '紧凑模式隐藏描述文字、压缩行高，提升信息密度。',
          UI.select([{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }], Cfg.get('density', 'comfortable'),
            function (v) { Cfg.set('density', v); applyDensity(); }), {}));
        box.appendChild(UI.item('导航宽度', '左侧导航像素宽度（140–320）；窄屏（≤900px）由响应式断点接管。',
          UI.input(Cfg.get('navWidth', 216), function (v) {
            var n = parseInt(v, 10); if (isNaN(n)) return;
            Cfg.set('navWidth', Math.max(140, Math.min(320, n))); applyNavWidth();
          }, { type: 'number', width: '120px', ariaLabel: '导航宽度' }), {}));
        box.appendChild(UI.item('打开时自动刷新', '打开面板即重新拉取当前视图数据。',
          UI.toggle(Cfg.get('autoRefresh', true), function (v) { Cfg.set('autoRefresh', v); }), {}));
        box.appendChild(UI.item('轮询间隔（毫秒）', '0 = 关闭轮询。影响运行态数据刷新频率。',
          UI.input(Cfg.get('refreshMs', 60000), function (v) {
            var n = parseInt(v, 10); if (isNaN(n)) return;
            Cfg.set('refreshMs', Math.max(0, n)); restartPolling();
          }, { type: 'number', width: '140px', ariaLabel: '轮询间隔' }), {}));
        box.appendChild(UI.item('概览—详情分层', '列表默认折叠详情，先给概览再按需展开。',
          UI.toggle(Cfg.get('overviewMode', true), function (v) { Cfg.set('overviewMode', v); }), {}));
        box.appendChild(UI.item('长列表折叠阈值', '超过该行数的列表默认折叠。',
          UI.input(Cfg.get('maxRows', 50), function (v) {
            var n = parseInt(v, 10); if (isNaN(n)) return;
            Cfg.set('maxRows', Math.max(5, Math.min(500, n)));
          }, { type: 'number', width: '120px', ariaLabel: '折叠阈值' }), {}));
        box.appendChild(UI.item('显示日志面板', '在状态栏上方常驻显示调用日志。',
          UI.toggle(Cfg.get('showLogs', true), function (v) { Cfg.set('showLogs', v); applyLogPanel(); }), {}));
        box.appendChild(UI.item('日志级别', '过滤日志面板显示的最低级别（全部 / 警告+ / 仅错误）。',
          UI.select([{ value: 'info', label: '全部' }, { value: 'warn', label: '警告+' }, { value: 'error', label: '仅错误' }],
            Cfg.get('logLevel', 'info'), function (v) { Cfg.set('logLevel', v); Bus.emit('log', null); }), {}));
        box.appendChild(UI.item('启动时视图', '打开面板后默认落地的页面。优先级：#sc=<视图名> 深链 > 上次视图记忆 > 此项。',
          UI.select(VIEWS.map(function (v) { return { value: v[0], label: v[1] }; }), Cfg.get('startView', 'overview'),
            function (v) { Cfg.set('startView', v); }), {}));
        box.appendChild(UI.item('界面皮肤', 'v9 = 方案调色板（默认）；宿主 = 跟随 DSH 主题令牌（与宿主同色）。',
          UI.select([{ value: 'v9', label: 'v9 方案皮肤' }, { value: 'host', label: '宿主原生皮肤' }], Cfg.get('skin', 'v9'),
            function (v) { Cfg.set('skin', v); syncTheme(); refreshCurrentView(); }), {}));
        /* v9 设置页的最后两行（此前面板未暴露——功能本就在：导航分组标题与页脚健康条都会渲染） */
        box.appendChild(UI.item('导航分组显示', '按语义显示分组标题（守藏 / 总览 / 记忆 / 运行 / 配置）。',
          UI.toggle(Cfg.get('navGroups', true), function (v) { Cfg.set('navGroups', v); applyNavGroups(); }), {}));
        box.appendChild(UI.item('页脚健康条', '常驻显示记忆库状态与库路径。',
          UI.toggle(Cfg.get('footBar', true), function (v) { Cfg.set('footBar', v); applyFootBar(); }), {}));

        /* 快捷键卡（原型：card 卡头「快捷键」+ 3 × .row：左 动作 / 作用域 + 右 键位 pill）
         * pill 走**中性色**（原型键位胶囊是灰底描边，非语义色）。 */
        var keys = UI.card('快捷键', { sub: '面板内可用' });
        keys.body.appendChild(ovCRow('打开 / 关闭面板', '全局', [ovPill('Ctrl/⌘ + Shift + S', '', true)]));
        keys.body.appendChild(ovCRow('切换日志面板', '面板内', [ovPill('Ctrl/⌘ + Shift + L', '', true)]));
        keys.body.appendChild(ovCRow('关闭面板', '面板内', [ovPill('Esc', '', true)]));
        host.appendChild(keys.box);

        // 高级：配置原文（YAML）与根目录管理 —— 原「配置原文」一级视图下沉至此（P1-4）
        var adv = el('div');
        adv.appendChild(el('div', 'sc-desc', '配置原文（shoucang.config.yaml）保存后自动备份 .bak-*；根目录切换与新增在此。'));
        renderConfigRaw(adv);
        host = _tb.pane('advanced');
        host.appendChild(UI.collapsible('高级 · 配置原文与根目录', adv, { open: false }));

        /* 深度睡眠阈值（原深睡页「阈值」小节迁入）：与「配置原文」同性质 —— 都写 ~/.dsh/suite/scheduler.json、
         * 都需重载插件生效。v9 深睡页只保留**执行位**（状态分布卡头的按钮），配置出口收敛到本页一处。 */
        var dsAdv = el('div');
        dsAdv.appendChild(el('div', 'sc-desc', '写入 ~/.dsh/suite/scheduler.json；改后需重载插件生效。'));
        host.appendChild(UI.collapsible('深度睡眠阈值', dsAdv, { open: false, key: 'settings:dsadv' }));
        api('/deepsleep/config').then(function (cfg) {
          var run = cfg.running || {};
          dsAdv.appendChild(makeToggle('enableDeepSleep', '启用深度睡眠自动归纳 enableDeepSleep', '全部会话停滞 ≥ 阈值后自动提炼原则层（关闭 = 暂停，等于原「暂停到明天」）。', !!run.enableDeepSleep, function (key, sw) {
            api('/deepsleep/config', { method: 'POST', body: JSON.stringify({ enableDeepSleep: sw.checked }) })
              .then(function () { status('✓ 已保存（重载生效）'); })
              .catch(function (e) { fail(e); sw.checked = !sw.checked; });
          }));
          dsAdv.appendChild(dsNumber('停滞阈值 deepSleepIdleMs', '全部会话无活动持续满此毫秒数才触发（默认 3 小时）。', Math.round((run.deepSleepIdleMs || 10800000) / 60000), 10, 720, '分钟', function (m) { return m * 60000; }, 'deepSleepIdleMs'));
          dsAdv.appendChild(dsNumber('探测发起延迟 deepSleepProbeAfterMs', 'running 无事件持续此毫秒后发起输出增长探测（默认 3 小时）。', Math.round((run.deepSleepProbeAfterMs || 10800000) / 60000), 10, 720, '分钟', function (m) { return m * 60000; }, 'deepSleepProbeAfterMs'));
          dsAdv.appendChild(dsNumber('探测采样间隔 deepSleepProbeWindowMs', '两轮采样之间的间隔（默认 60 秒）。', Math.round((run.deepSleepProbeWindowMs || 60000) / 1000), 5, 600, '秒', function (s) { return s * 1000; }, 'deepSleepProbeWindowMs'));
        }).catch(function (e) {
          dsAdv.appendChild(el('div', 'sc-mem-empty', '阈值加载失败：' + (e && e.message ? e.message : e)));
        });

        /* 恢复默认：原型该 pane 底部是 .acts（按钮 + 右侧说明文字），非裸按钮 */
        var acts = el('div', 'sc-acts');
        acts.appendChild(UI.button('恢复默认设置', function () {
          Cfg.reset(); applyDensity(); applyNavWidth(); applyNavGroups(); applyFootBar(); applyLogPanel(); restartPolling(); refreshCurrentView();
          Log.info('界面设置已恢复默认');
        }, { confirm: '确认恢复全部界面设置为默认值？' }));
        acts.appendChild(el('span', 'sc-acts-note', '重置 10 项界面偏好并立即重绘（密度 / 导航宽度 / 日志面板 / 轮询全部重新应用）'));
        host.appendChild(acts);
      }

      /* ---------- 插件集合视图（#3 · v9 卡片级对齐 2026-09-13） ----------
       * v9 该页块序列（DOM 实测）：页头（右「重新装配」）→ **卡片网格**（每成员一张 .pcard：
       * 图标 + 名称 + 描述 + meta）+ **虚线「添加目标库」卡** → **「suite 装配矩阵」卡**（卡头 + `GET /suite` chip
       * + 表格：目标库 / 容量 / 已用 / 装配内容 / 状态 pill）。
       * 面板此前是 `UI.item` 行式列表 + 一行 summary ⇒ 组成完全不同，本轮按原型重排。 */
      function renderSuite(view, data) {
        view.textContent = '';
        UI.pageHead('插件集合', 'suite 装配矩阵由 targets.ts 的 suiteAssemblyMatrix() 单一实现；面板与 scheduler 共用。', {
          routes: ['/suite'], routesInline: true,
          actions: [UI.button('重新装配', function () { refreshCurrentView(); status('已按注入器 registry + profiles 重新核装配'); }, { title: '重取装配矩阵（/suite）' })]
        });
        var members = (data && data.members) || [];
        var grid = el('div', 'sc-pgrid');
        /* 成员图标：按角色取语义图标（v9 每卡一个图标；缺省回落 suite 图标） */
        var iconOf = function (m) {
          var k = String((m && (m.id || m.package)) || '').toLowerCase();
          if (k.indexOf('memory') >= 0 || k.indexOf('skill') >= 0) return 'vault';
          if (k.indexOf('core') >= 0) return 'persona';
          if (k.indexOf('sched') >= 0) return 'sleep';
          if (k.indexOf('panel') >= 0) return 'overview';
          return 'suite';
        };
        members.forEach(function (m) {
          var st = Derive.suiteStatus(m.status);           // 装配状态 → 文案 + 语义类（单一映射）
          /* v9 卡片结构（markup 1:1）：.ph(图标 + <b>名称</b>) → 行内小灰字描述 → .pmeta 两个灰 span。
           * v9 的 meta 左 span 是"工具数"（原型示意值），面板 /suite 无该字段 ⇒ 用真实 package 顶替，
           * 右 span 仍是状态文案（**纯文本，不是胶囊** —— 上一版错用了 badge 胶囊）。 */
          var c = el('div', 'sc-pcard');
          var ph = el('div', 'ph');
          var ic = el('span', 'ic'); ic.appendChild(svg(ICONS[iconOf(m)] || ICONS.suite)); ph.appendChild(ic);
          ph.appendChild(el('b', null, String(m.id || m.name || m.package || '?')));
          c.appendChild(ph);
          c.appendChild(el('div', 'pd', String(m.role || m.desc || m.description || m.detail || '—')));
          var meta = el('div', 'pmeta');
          meta.appendChild(el('span', null, String(m.repo || m.package || '')));
          var stSpan = el('span', null, st.text);
          if (st.tip) stSpan.title = st.tip;   // 口径差异移入 title（原型只有「已装配」两字）
          meta.appendChild(stSpan);
          c.appendChild(meta);
          grid.appendChild(c);
        });
        /* 「添加目标库」虚线卡（v9 同款；非动作卡：登记走后端白名单，不在 UI 里造写入路径） */
        var add = el('div', 'sc-pcard is-add');
        var aph = el('div', 'ph');
        var aic = el('span', 'ic'); aic.appendChild(svg(ICONS.suite)); aph.appendChild(aic);
        aph.appendChild(el('b', null, '添加目标库'));
        add.appendChild(aph);
        add.appendChild(el('div', 'pd', '需在白名单内登记（target-registry / members 配置）'));
        grid.appendChild(add);
        view.appendChild(grid);

        /* 装配矩阵卡：行 = 目标库容量注册表（数据取自 /memory/overview 的 indexes，真实字段；不造数） */
        var mtx = UI.card('suite 装配矩阵', { sub: '单一实现：targets.ts · suiteAssemblyMatrix()', right: [el('span', 'sc-src', 'GET /suite')] });
        view.appendChild(mtx.box);
        var tbl = el('table', 'sc-table');
        var thead = el('thead'); var htr = el('tr');
        ['目标库', '容量', '已用', '装配内容', '状态'].forEach(function (h) { htr.appendChild(el('th', null, h)); });
        thead.appendChild(htr); tbl.appendChild(thead);
        var tbody = el('tbody'); tbl.appendChild(tbody);
        mtx.body.appendChild(tbl);
        var CONTENT = { 'MEMORY.md': '原则 + 路径', 'USER.md': '画像 + 偏好', 'AGENT.md': '经验 + 反例' };
        var pill = function (ok, text) { return el('span', 'pill' + (ok ? ' ok' : ' warn'), text); };
        /* 追加一行（v9 的 notes/ · archive/：**无容量门** ⇒ 容量列写"不限"，已用列带"条"） */
        var addRow = function (name, used, content, ok) {
          var tr = el('tr');
          tr.appendChild(el('td', 'tgt', name));
          tr.appendChild(el('td', 'num', '不限'));
          tr.appendChild(el('td', 'num', used));
          tr.appendChild(el('td', null, content));
          var td = el('td'); td.appendChild(pill(ok !== false, ok === false ? '水位偏高' : '正常'));
          tr.appendChild(td);
          tbody.appendChild(tr);
        };
        var fill = function (idx) {
          tbody.textContent = '';
          if (!Derive.has(idx)) { tbody.appendChild(el('tr', null, '（无容量注册表数据）')); return; }
          idx.forEach(function (f) {
            var pct = f.cap ? Math.round((f.chars || 0) / f.cap * 100) : null;
            var kind = pct === null ? 'ended' : Derive.capKind(pct);
            var tr = el('tr');
            /* v9 的"目标库"列是**去 .md 后缀**的名字（MEMORY / USER / AGENT） */
            tr.appendChild(el('td', 'tgt', String(f.name || '').replace(/\.md$/i, '')));
            tr.appendChild(el('td', 'num', f.cap ? Derive.num(f.cap) : '不限'));
            tr.appendChild(el('td', 'num', Derive.num(f.chars || 0)));
            tr.appendChild(el('td', null, CONTENT[f.name] || '—'));
            var td = el('td');
            td.appendChild(pill(kind === 'ended', kind === 'ended' ? '正常' : (kind === 'stalled' ? '超阈' : '水位偏高')));
            tr.appendChild(td);
            tbody.appendChild(tr);
          });
        };
        fill((data && data.indexes) || null);
        if (data && data.summary) mtx.body.appendChild(el('div', 'sc-note', String(data.summary)));
        /* 面板的 /suite 只给成员行（不含容量列）⇒ 另取一次 /memory/overview 补目标库容量，
         * 失败则保留成员摘要，不伪造容量数字。 */
        api('/memory/overview').then(function (r) {
          fill((r && r.indexes) || null);
          /* notes/ 行：v9 表格有这一行（无容量门 ⇒「不限 / N 条 / 便签」）；真实文件数取自 notes 清单 */
          var n = Derive.count(r && r.notes);
          if (n) addRow('notes/', n + ' 条', '便签', true);
        }).catch(function () { });
        /* archive/ 行：已用数取自 /cognition/report 的真实归档清单；端点不可用 ⇒ 不出行（宁缺勿造） */
        api('/cognition/report').then(function (r) {
          var ar = (r && r.archive) || [];
          if (!r || !r.ok || !Derive.has(ar)) return;
          addRow('archive/', ar.length + ' 条', '归档', true);
        }).catch(function () { });
      }

      /* ---------- 深度睡眠视图（T1 状态机 + T2 计时/控制；docs/ui-todo.md） ---------- */

      function dsFmtAgo(ts) {
        if (!ts) return '—';
        var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (s < 60) return s + ' 秒';
        var m = Math.floor(s / 60); if (m < 60) return m + ' 分钟';
        var h = Math.floor(m / 60); if (h < 24) return h + ' 小时 ' + (m % 60) + ' 分';
        return Math.floor(h / 24) + ' 天 ' + (h % 24) + ' 小时';
      }
      function dsFmtTime(ts) {
        if (!ts) return '从未';
        try { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); } catch (e) { return String(ts); }
      }
      /* 2026-09-14（用户拍板）：标签表达**蒸馏生命周期**，且**只按会话状态映射、不依赖任何其他信息**——
       *   `stalled`（探针连续确认无输出）⇒ **停滞**；其余（running/ended/probing/suspect）⇒ **待蒸馏**
       *   （会话还活着/未决 ⇒ 内容迟早要被蒸馏；`ended` 即「任务完成、等待蒸馏」）。
       *   旧标签是状态机内部术语（活跃/已结束/探测中/待复核/疑似卡住），**对使用者不可读**，
       *   且把「阻塞睡眠」这类内部机制暴露到界面上——用户实测被它误导（以为「没睡」）。 */
      var DS_STATE_TEXT = { running: '待蒸馏', ended: '待蒸馏', probing: '待蒸馏', suspect: '待蒸馏', stalled: '停滞' };
      /* 探针细节（次要信息，附在时间后面）：去掉「阻塞睡眠」等内部机制措辞，只留人话。 */
      var DS_PROBE_TEXT = {
        'long-run': '长任务进行中',
        'suspect': '待下轮复核',
        'conflict': '状态活跃但无输出增长',
        'stall': '已确认无输出',
        'exit': '会话已退出',
        'no-transcript': '探针不可用',
        'error': '探测异常'
      };
      /* 死代码已删（2026-09-13 v9 深睡页重排）：dsBadge（会话徽章行改由「睡眠状态分布」卡图例承担）、
       * dsStat（计时条改由状态机卡水位条 + 分布卡 sub 承担）。UI.dsBadge 本体仍在用（向量状态行）。 */
      function dsNumber(name, desc, initial, min, max, unit, encode, key) {
        var item = el('div', 'setting-item');
        var info = el('div', 'setting-item-info');
        info.appendChild(el('div', 'setting-item-name', name));
        info.appendChild(el('div', 'setting-item-desc', desc));
        var wrap = el('div'); wrap.className = 'sc-range-wrap';
        var lab = el('span', 'sc-range-label'); lab.textContent = initial + ' ' + unit;
        var range = el('input'); range.type = 'range'; range.min = String(min); range.max = String(max); range.step = '1'; range.value = String(initial);
        range.addEventListener('input', function () { lab.textContent = range.value + ' ' + unit; });
        range.addEventListener('change', function () {
          var o = {}; o[key] = encode(range.value);
          api('/deepsleep/config', { method: 'POST', body: JSON.stringify(o) })
            .then(function () { status('✓ ' + name + ' = ' + range.value + ' ' + unit + '（重载生效）'); })
            .catch(fail);
        });
        wrap.appendChild(lab); wrap.appendChild(range);
        item.appendChild(info); item.appendChild(wrap);
        return item;
      }
      /** U1（ADR-122 UI）：运行面扩展 —— 判据与对账 + 认知环（MCL）。
       *  判因：这两块此前在记忆板块（判据卡在最前）→ 首屏过载；改落既有「运行」视图，数据走按需端点，零新增常驻注入。 */
      function renderRunExtras(view) {
        /* v9 对齐：分节标题 → 卡片（与记忆板块同层级）；group2 返回卡体，后续内容 append 进卡体 */
        var gHost = view;
        var gRoot = view;   /* 卡片的挂载根固定为视图（否则第二张卡会挂进第一张卡体 ⇒ 嵌套） */
        var group2 = function (t) { var c = UI.card(t); gRoot.appendChild(c.box); gHost = c.body; return c.body; };
        var mk = function (label, value, sub) {
          var card = el('div', 'sc-mem-stat');
          card.appendChild(el('div', 'sc-mem-stat-label', label));
          card.appendChild(el('div', 'sc-mem-stat-value', value));
          if (sub) card.appendChild(el('div', 'sc-mem-stat-sub', sub));
          return card;
        };
        /* v9 深睡页（DOM 实测）**没有**这三张卡：判据与对账 → 总览页已有「判据与重排门」卡
         * （ovCriteriaCard，同一 /criteria 数据）；认知环 → 总览页徽章 + 系统状态卡已表达。
         * 本函数因此只留「账本对账与产出健康」一项真实功能（原型无对应卡，但其数据无处可去 ⇒
         * 迁到运行观测页的「关键指标」Tab，语义相符且不丢功能）。 */
        group2('账本对账与产出健康（v2.1 M3）');
        var rw = el('div', 'sc-mem-stats');
        rw.appendChild(mk('对账', '…', '读取中'));
        gHost.appendChild(rw);
        api('/reconcile').then(function (r) {
          rw.textContent = '';
          if (!r || !r.active) { rw.appendChild(mk('对账', '未就绪', (r && r.error) || 'memory-reconcile.mjs 未部署')); return; }
          var cl = r.closure || {};
          var h = r.health || {};
          var ly = (r.layers || {}).counts || {};
          var P = ly.P || { index: 0, profile: 0 }, R = ly.R || { index: 0, profile: 0 }, E = ly.E || { index: 0, profile: 0 };
          rw.appendChild(mk('账本闭合', cl.ok === null ? '样本不足' : cl.ok ? '✅ 差异 0' : '⚠ 有差异', '台账 ' + ((r.window || {}).ledgerRows || 0) + ' 行 · 写事件 ' + (h.writeEvents || 0) + ' 次'));
          rw.appendChild(mk('上次有效深睡', h.lastSuccessfulWrite ? fmtTime(h.lastSuccessfulWrite) : '（无）', '连续空转 ' + (h.idleStreak || 0) + ' 轮 · 深睡轮次 ' + (h.deepSleepRounds || 0)));
          rw.appendChild(mk('写入被拒率', h.rejectRate === null || h.rejectRate === undefined ? 'n/a' : (h.rejectRate * 100).toFixed(0) + '%', '拒 ' + (h.rejectedWrites || 0) + ' / 写事件 ' + (h.writeEvents || 0) + ' · 尝试 ' + (h.attemptedTotal || 0) + ' 条'));
          rw.appendChild(mk('三层占比', 'P ' + (P.index + P.profile) + ' · R ' + R.index + ' · E ' + (E.index + E.profile), 'P=恒常（索引+P 层画像行 ≤' + ((r.layers || {}).profileCap || 3) + '/档）· R=任务门控 · E=相关性门控'));
        }).catch(function () { rw.textContent = ''; rw.appendChild(mk('对账', '读取失败', '/reconcile')); });
      }

      function renderDeepSleep(view) {
        view.textContent = '';
        UI.pageHead('深度睡眠 · 会话状态机', '全部根会话停滞 ≥ 阈值后自动回想当天记忆、提炼原则层 PRINCIPLES.md。状态机区分「正常长任务 / 卡住 / 异常退出」：仅长任务正在推进才拦睡，其余正常睡。', { routes: ['/deepsleep', '/deepsleep/trigger', '/deepsleep/config'] });
        var smSlot = el('div'); view.appendChild(smSlot); // v9 顺序（原型第 1 张卡）：状态机占位（异步回填）
        var distSlot = el('div'); view.appendChild(distSlot); // v9 顺序：分布卡占位（异步回填，见 /deepsleep 回调）
        /* v9 顺序：回执（原型第 3 块）与下轮材料预估（第 4 块右）由 /cognition/report 异步回填 ——
         *   占位必须在此**同步**插入，并且两者装进同一个 stack（否则后到的异步卡会落到页尾）。 */
        var cogSlot = el('div', 'sc-stack'); view.appendChild(cogSlot);
        /* v9：原 renderRunExtras（判据与对账 + 账本对账 + 认知环三卡）**不再挂本页** ——
         * 原型深睡页 DOM 实测只有 6 块，无这三张卡；判据/认知环在总览页已有，
         * 账本对账迁到运行观测页「关键指标」Tab（唯一未被原型覆盖的真实功能，不丢）。 */
        api('/deepsleep').then(function (r) {
          if (!r.active) {
            view.appendChild(el('div', 'sc-desc', '深度睡眠归纳器当前未激活（蒸馏器 enableDistill 未启用或尚未就绪）。'));
            return;
          }
          /* v9：会话徽章行**移除** —— 原型深睡页无此块，五态计数已由下方「睡眠状态分布」卡的图例
           * （running/ended/probing/suspect/stalled + 计数）完整表达，不是删信息而是去重复。 */
          /* v9 严格对齐（第五轮 · 深睡页）：状态机卡（原型深睡页的**第 1 张卡**，此前整块缺失）
           *   三节点 = 插件真实存在的**三段停滞时间轴**，不是自造状态：
           *     ① 清醒    —— 会话仍有活动（停滞 < 判定线）
           *     ② 判定中  —— 停滞 ≥ probeAfterMs（进入卡住/长任务判定）
           *     ③ 可入睡  —— 停滞 ≥ idleMs（满足自动归纳条件）
           *   当前阶段由 now 与两个阈值比较直接得出；水位条 = 停滞时长 / 阈值
           *   （对应原型「睡眠水位 1,240 / 3,000」的位置）。零新端点、零猜测。 */
          (function () {
            var now = Date.now();
            var idleMs = Number(r.idleMs) || 0;
            var probeMs = Number(r.probeAfterMs) || idleMs;
            var act = Number(r.lastActivityAt) || 0;
            var stalled = act ? Math.max(0, now - act) : 0;
            var stage = (idleMs > 0 && stalled >= idleMs) ? 3 : ((probeMs > 0 && stalled >= probeMs) ? 2 : 1);
            var mMin = function (ms) { return Math.round(Number(ms) / 60000); };
            var smCard = UI.card('状态机', {
              sub: '停滞 ≥ ' + mMin(idleMs) + ' 分钟触发一次结构整理（判定线 ' + mMin(probeMs) + ' 分钟）'
                + (r.lastDeepSleepAt ? ' · 上次入睡 ' + dsFmtTime(r.lastDeepSleepAt) : ''),
              right: [el('span', 'sc-src', '/deepsleep')]
            });
            smSlot.appendChild(smCard.box);
            var sm = el('div', 'sc-sm');
            [
              ['清醒', 'M20 6L9 17l-5-5', '会话有活动，不触发整理'],
              ['判定中', 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', '已停滞 ≥ ' + mMin(probeMs) + ' 分钟，等待判定是长任务还是卡住'],
              ['可入睡', 'M12 3v12|M6 9l6 6 6-6|M5 21h14', '停滞 ≥ ' + mMin(idleMs) + ' 分钟，满足自动归纳条件']
            ].forEach(function (n, i) {
              var idx = i + 1;
              var node = el('div', 'sc-sm-node' + (idx < stage ? ' done' : (idx === stage ? ' on' : '')));
              node.title = n[2];
              var cir = el('div', 'sc-sm-circle');
              cir.appendChild(svg(n[1]));
              node.appendChild(cir);
              node.appendChild(el('div', 'sc-sm-label', idx === stage ? n[0] + ' · 当前' : n[0]));
              sm.appendChild(node);
              if (i < 2) sm.appendChild(el('div', 'sc-sm-seg' + (idx < stage ? ' done' : '')));
            });
            smCard.body.appendChild(sm);
            var water = el('div', 'sc-prog');
            var wbar = document.createElement('wa-progress-bar');
            wbar.className = 'sc-prog-bar';
            wbar.setAttribute('max', '100');
            wbar.setAttribute('value', String(idleMs ? Math.min(100, Math.round(stalled / idleMs * 100)) : 0));
            water.appendChild(wbar);
            water.appendChild(el('div', 'sc-prog-txt',
              '睡眠水位 · 已停滞 ' + mMin(stalled) + ' / ' + mMin(idleMs) + ' 分钟'
              + (idleMs ? '（' + Math.min(100, Math.round(stalled / idleMs * 100)) + '%）' : '')));
            smCard.body.appendChild(water);
          })();
          /* v9 严格对齐：睡眠状态分布（分段条 + 图例）—— 原型深睡页的第 2 张卡。
           *   数据就是同一份五态计数，只是**形态**从徽章改成比例条 + 图例（看得见"分布"）。 */
          (function () {
            var segs = [['running', r.running], ['ended', r.ended], ['probing', r.probing], ['suspect', r.suspect], ['stalled', r.stalled]];
            var sum = segs.reduce(function (a, s) { return a + (Number(s[1]) || 0); }, 0);
            if (!sum) return;
            var idleMin = Math.round((r.idleMs || 0) / 60000);
            /* v9：执行位就在本卡卡头右侧（原型 `div.right` = 路由 chip + `button.btn.sm.primary`
             * 「立即进入深睡」）⇒ 原页尾「控制」小节的两枚按钮并入此处：触发按钮即「立即进入深睡」；
             * 「暂停到明天」不另设按钮（同一开关 enableDeepSleep 已在设置页「深度睡眠阈值」里）。 */
            var distCard = UI.card('睡眠状态分布', {
              sub: 'idle ' + idleMin + ' 分钟 · 下次可睡 ' + (r.nextEligibleAt ? dsFmtTime(r.nextEligibleAt) : '—'),
              right: [el('span', 'sc-src', 'GET /deepsleep'), UI.button('立即进入深睡', function () {
                status('深度睡眠归纳中…');
                return api('/deepsleep/trigger', { method: 'POST', body: '{}' })
                  .then(function (rr) { status(rr.ok ? '✓ 已触发归纳（见日志）' : '⚠ 触发失败：' + (rr.error || '')); });
              }, { primary: true, async: true, busyText: '归纳中…', okText: '已触发归纳', confirm: '立即触发一次深度睡眠归纳？将调用归纳子代理回顾当天记忆痕迹。' })]
            });
            distSlot.appendChild(distCard.box);
            /* 2026-09-14（用户拍板）：分布按**用户可见状态**聚合（待蒸馏 / 停滞），
             * 与「最近会话」卡的 pill **同源同词**（`DS_STATE_TEXT`）——不再把状态机内部五态术语摆到界面上。
             * 内部五态的细节仍在会话行的 sub（探针结论）里可查；CSS 复用既有类（不加新样式）。 */
            var byLabel = {};
            segs.forEach(function (s) { var k = DS_STATE_TEXT[s[0]] || s[0]; byLabel[k] = (byLabel[k] || 0) + Number(s[1] || 0); });
            var merged = Object.keys(byLabel).map(function (k) { return [k, byLabel[k]]; });
            var bar = el('div', 'sc-dseg');
            merged.forEach(function (s) { if (Number(s[1]) > 0) { var i = el('i', s[0] === '停滞' ? 'stalled' : 'running'); i.style.flex = String(s[1]); bar.appendChild(i); } });
            distCard.body.appendChild(bar);
            var legend = el('div', 'sc-dlegend');
            merged.forEach(function (s) {
              var it = el('span', 'sc-dlegend-i');
              it.appendChild(el('i', 'sc-segdot ' + (s[0] === '停滞' ? 'stalled' : 'running')));
              it.appendChild(el('span', null, s[0] + ' ' + String(s[1] || 0)));
              legend.appendChild(it);
            });
            distCard.body.appendChild(legend);
          })();
          /* v9：「已停滞 / 下次预计入睡 / 上次入睡」三格独立条**移除**（原型无此块）——
           * 前两项已分别由状态机卡的「睡眠水位」条与分布卡 sub 表达；「上次入睡」并入状态机卡 sub，
           * 信息不丢（见上方 smCard）。 */
          // v9：认知可视化——本轮产出回执 / 下轮材料预估 / 历次趋势（此前"睡完做了什么"完全不可见）
          renderCognitionReport(cogSlot, 'sleep');
          /* ── v2.2 睡眠期自检裁决（宿主义务：子代理只归纳，检测在其完成后由宿主执行） ──
           * v9 形态：执行位在**卡头右侧**（路由 chip + 按钮「运行自检」），面板此前把按钮放在卡尾。 */
          var scRun = UI.button('运行自检', function () {
            return api('/selfcheck/run', { method: 'POST', body: '{}' })
              .then(function (rr) { status('✓ 自检完成：' + (rr.verdict || '?')); renderDeepSleep(view); });
          }, { async: true, busyText: '自检中…', okText: '自检完成' });
          var scWrap = UI.card('睡眠期自检（判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账）', {
            sub: '上次结果读 selfcheck-latest.json（GET）；执行走 POST',
            right: [el('span', 'sc-src', 'GET /selfcheck · POST /selfcheck/run'), scRun]
          });
          view.appendChild(scWrap.box);
          var scBox = el('div', 'sc-mem-stats');
          var scCard = function (label, value, sub) {
            var c = el('div', 'sc-mem-stat');
            c.appendChild(el('div', 'sc-mem-stat-label', label));
            c.appendChild(el('div', 'sc-mem-stat-value', value));
            if (sub) c.appendChild(el('div', 'sc-mem-stat-sub', sub));
            return c;
          };
          scBox.appendChild(scCard('自检', '…', '读取中'));
          scWrap.body.appendChild(scBox);
          api('/selfcheck').then(function (s) {
            scBox.textContent = '';
            if (!s || !s.active) {
              scBox.appendChild(scCard('自检', '尚未跑过', (s && s.error) || '定时器/深睡后会自动执行'));
            } else {
              var v = String(s.verdict || '?');
              var sm = s.summary || {};
              var ck = sm.checks || {};
              scBox.appendChild(scCard('裁决', v === 'ok' ? '✅ ok' : v === 'adjust' ? '🔧 adjust' : '⚠ warn', '于 ' + fmtTime(s.at)));
              scBox.appendChild(scCard('六项检测', Object.keys(ck).map(function (k) { return (ck[k] === 'pass' ? '✅' : ck[k] === 'skipped' ? '⏭' : '❌') + k; }).join(' '), '影子 flipReady=' + sm.flipScoreWeights + ' · 成熟度就绪=' + sm.maturationReady + ' · 闭合=' + (sm.closureOk === null ? 'n/a' : sm.closureOk)));
              scBox.appendChild(scCard('白名单调整', (Derive.has(s.adjustments) ? s.adjustments.map(function (a) { return a.id; }).join(' · ') : '无'), '仅窄动作且可回滚；改 α/gate/判据 一律只建议'));
            }
          }).catch(function () { scBox.textContent = ''; scBox.appendChild(scCard('自检', '读取失败', '/selfcheck')); });
          /* v9：会话明细 → **「最近会话」卡**（原型该块是 card：hd 标题 + sub，bd 内若干 `.row`：
           * 左状态 pill + 描述）。原型的行尾有「查看」按钮 —— 面板**没有**会话详情视图 ⇒ 不放该按钮
           * （与归档区同一处置：不做「看得见点不动」的控件）。 */
          if (Derive.has(r.sessions)) {
            var sessCard = UI.card('最近会话', { sub: r.sessions.length + ' 条在册' });
            view.appendChild(sessCard.box);
            r.sessions.forEach(function (s) {
              /* 状态进 **pill**（彩色，最显眼）；时间与探针细节进 **sub**。 */
              var sub = dsFmtAgo(s.state === 'ended' ? s.lastEndAt : s.lastEventAt);
              if (s.probeResult) sub += ' · ' + (DS_PROBE_TEXT[s.probeResult] || s.probeResult);
              var pk = (s.state === 'stalled' || s.state === 'suspect') ? 'warn' : (s.state === 'probing' ? 'info' : 'ok');
              /* 2026-09-14（用户拍板）：行名改**三块** = `工作区 · 会话栏标题缩写 · 会话编码`。
               *   标题与工作区由 host 富化（`session/title` 事件与 `session.header.cwd`，**与宿主会话栏同源**）；
               *   host 取不到时自动只显示编码（退化为旧行为，不出现空块）。 */
              var ttl = String(s.title || '');
              if (ttl.length > 14) ttl = ttl.slice(0, 14) + '…';
              var nm = [s.workspace, ttl, s.sid].filter(function (x) { return !!x; }).join(' · ');
              sessCard.body.appendChild(ovCRow(nm, sub, [ovPill(DS_STATE_TEXT[s.state] || s.state, pk)]));
            });
          }
          // 卡住告警（T2）
          var hasStall = r.stalled > 0 || (r.sessions || []).some(function (s) { return s.probeResult === 'stall'; });
          if (hasStall) {
            view.appendChild(el('div', 'sc-ds-alert', '⚠ 检测到疑似卡住的会话（无输出增长但会话仍在）：已正常计入停滞并安排睡眠，但建议你确认该任务是否真的卡住——必要时手动重启该会话。'));
          }
          /* v9：原「控制」小节（立即归纳一次 / 暂停到明天）与「阈值」小节**移除** ——
           *   触发按钮已并入「睡眠状态分布」卡头右侧（原型把执行位放在该卡）；
           *   4 项阈值（enableDeepSleep / 停滞阈值 / 探测延迟 / 采样间隔）迁到**设置页 › 高级**
           *   （与「配置原文」同处：都是"改后需重载插件"的后端配置），深睡页不再有第二处配置入口。 */
        }).catch(function (e) {
          view.appendChild(el('div', 'sc-desc', '加载失败：' + (e && e.message ? e.message : e)));
        });
      }
      var refs = {};
      var state = { parsed: null };
      /* 页头槽的**渲染轮次**：页头改挂固定槽后，同一次渲染里若有第二个 UI.pageHead（嵌套视图，
       * 如设置页内嵌配置编辑器），后一个会把标题覆盖成别人的（实测：设置页页头显示成「配置原文」）。
       * 记轮次 ⇒ 每轮只认**首个**页头，嵌套调用返回游离节点不再抢槽。 */
      var headEpoch = 0, headUsed = -1;
      /* 页级检索（v9 的页头搜索框）：按文本过滤当前视图里的**列表行**。
       * 复用既有的 .sc-filtered 语义（检索过滤），与 .sc-hidden（折叠态）分开——旧实现两者共用一个状态位会互相覆盖。 */
      function filterViewRows(q) {
        var host = refs.view; if (!host) return 0;
        var rows = host.querySelectorAll('.sc-idx-row,.sc-row,.sc-recent-row');
        var n = 0;
        for (var i = 0; i < rows.length; i++) {
          var hit = !q || String(rows[i].textContent || '').toLowerCase().indexOf(q.toLowerCase()) >= 0;
          rows[i].classList.toggle('sc-filtered', !hit);
          if (hit) n++;
        }
        return q ? n : rows.length;
      }
      var currentView = Cfg.get('startView', 'overview');
      function refreshCurrentView() { show(currentView); }
      function show(name) {
        /* 折叠态的生命周期边界：**换视图**才清空（避免上一个视图的 key 残留到新数据上）；
           同一视图内的重绘（自动轮询 / 保存后重取 / 手动刷新）**保留**开合态 ——
           这正是旧实现最难受的一点：60s 一轮询，用户展开的区块就被强制收起。 */
        if (currentView !== name) Fold.clear();
        currentView = name;
        // A6：记住最后视图（面板重开即回到上次位置）
        try { Cfg.set('lastView', name); } catch (e) { }
        // D6：视图区变化时给读屏一个可识别的名字
        if (refs.view) {
          var vv = null;
          for (var i = 0; i < VIEWS.length; i++) { if (VIEWS[i][0] === name) { vv = VIEWS[i]; break; } }
          refs.view.setAttribute('role', 'region');
          if (vv) refs.view.setAttribute('aria-label', vv[1] + '（' + vv[3] + '）');
        }
        refs.navItems.forEach(function (it) { it.el.classList.toggle('active', it.name === name); });
        refs.view.textContent = '';
        /* 页头槽随之清空：视图未调 UI.pageHead（或异步渲染尚未回填）时不残留上一视图的标题 */
        var _hs = document.getElementById('scpanl-headslot'); if (_hs) _hs.textContent = '';
        headEpoch++;              /* 新渲染轮次：本轮允许写入一次页头 */
        _foldQueue.length = 0;   // 丢弃上一次渲染未收口的登记（异常路径残留），防止串到本次
        refs.view.scrollTop = 0; // 切视图回到顶部（此前长视图切页后停在上一页滚动位置）
        if (name === 'overview') {
          renderViewOverview(refs.view);
        } else if (name === 'persona') {
          api('/memory/overview').then(function (r) { renderPersona(refs.view, r); }).catch(fail);
        } else if (name === 'memory') {
          api('/memory/overview').then(function (r) { renderMemoryExpanded(refs.view, r); }).catch(fail);
        } else if (name === 'suite') {
          api('/suite').then(function (r) {
            renderSuite(refs.view, r);
          }).catch(fail);
        } else if (name === 'toggles') {
          api('/config').then(function (r) {
            // P2：注入配置全局可用（无 root 也能调——global 来自 scheduler.json）
            if (!r.global) { status(r.error === 'no-active-root' ? '未激活根目录——请到「配置原文」页根目录区添加。' : (r.error || '')); return; }
            if (!r.parsed) status('注入参数已全局可用（scheduler.json）；root 未登记——「记忆板块显示」开关待登记后可用。');
            else status('已加载 ' + (r.file || ''));
            renderViewToggles(refs.view, r.parsed || {}, r.global);
          }).catch(fail);
        } else if (name === 'deepsleep') {
          renderDeepSleep(refs.view);
        } else if (name === 'observe') {
          renderViewObserve(refs.view);
          collectMetrics();
        } else if (name === 'arch') {
          renderViewArch(refs.view);
        } else if (name === 'settings') {
          renderViewSettings(refs.view);
        }
      }

      /* 配置原文 + 根目录管理（原「配置原文」一级视图 → 下沉到 设置 · 高级，P1-4） */
      function renderConfigRaw(host) {
        var rootSection = el('div');
        var yamlSection = el('div');
        var ta = document.createElement('textarea'); refs.ta = ta;
        var saveRow = el('div');
        renderViewRoots(rootSection, function (w) { refs.rootListWrap = w; });
        renderViewYaml(yamlSection, ta, saveRow);
        host.appendChild(rootSection);
        host.appendChild(yamlSection);
        api('/roots').then(function (r) { if (renderViewRoots._draw) renderViewRoots._draw(r); }).catch(fail);
        if (saveRow._btn) {
          saveRow._btn.onclick = function () {
            api('/save', { method: 'POST', body: JSON.stringify({ text: ta.value }) })
              .then(function () { status('✓ 已保存，原文件已备份为 .bak-*'); })
              .catch(fail);
          };
        }
        api('/config').then(function (r) {
          ta.value = r.text || '';
          if (!r.text) status(r.error === 'no-active-root' ? '未激活根目录——请在「高级 · 根目录」区添加。' : (r.error || ''));
        }).catch(fail);
      }

      /* ---------- 界面设置的运行时应用（自由度） ---------- */
      function applyDensity() {
        var m = document.getElementById('scpanl-modal');
        if (!m) return;
        m.classList.toggle('sc-density-compact', Cfg.get('density', 'comfortable') === 'compact');
      }
      /* 导航宽度：写 CSS 变量而非内联 width —— 内联样式会压过媒体查询（除 !important），
         导致用户在宽屏设的宽度被带到移动端。改变量后，响应式断点可正常接管。 */
      function applyNavWidth() {
        var m = document.getElementById('scpanl-modal');
        if (!m) return;
        var n = parseInt(Cfg.get('navWidth', 216), 10);
        if (!n) n = 216;
        m.style.setProperty('--sc-nav-w', Math.max(140, Math.min(320, n)) + 'px');
      }
      function applyLogPanel() {
        var main = document.querySelector('.sc-main');
        if (!main) return;
        var old = main.querySelector('.sc-logwrap');
        if (old) old.remove();
        var collapsed = !Cfg.get('showLogs', true);
        var bar = document.getElementById('sc-statusbar');
        var lp = buildLogPanel(collapsed ? 33 : 150, { collapsible: true, collapsed: collapsed });
        if (bar && bar.parentNode === main) main.insertBefore(lp, bar); else main.appendChild(lp);
      }
      /* 导航分组标题 / 页脚健康条（v9 设置页同名的两行）——真实开关：直接切对应节点的显示。
       * 与密度/导航宽度同构（改 modal 类），故不必重绘整页。 */
      function applyNavGroups() {
        var m = document.getElementById('scpanl-modal');
        if (m) m.classList.toggle('sc-nogroups', !Cfg.get('navGroups', true));
      }
      function applyFootBar() {
        var m = document.getElementById('scpanl-modal');
        if (m) m.classList.toggle('sc-nofoot', !Cfg.get('footBar', true));
      }

      /* 轮询：间隔可配（0=关闭），替代写死的 setInterval */
      var pollTimer = null;
      function restartPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        var ms = parseInt(Cfg.get('refreshMs', 60000), 10) || 0;
        if (ms <= 0) return;
        pollTimer = setInterval(function () {
          // 仅在面板打开时轮询，关闭时不空转
          var mask = document.getElementById('scpanl-mask');
          if (!mask || !mask.classList.contains('open')) return;
          if (Cfg.get('autoRefresh', true)) refreshCurrentView();
        }, ms);
      }

      /* 关键指标采集（C4）——同时为 /inject/stats 提供 UI 入口（B1） */
      function collectMetrics() {
        var m = {};
        function put(k, v) { m[k] = v; Store.patch('metrics', m); }
        api('/mcl/status').then(function (r) {
          put('MCL 状态', (r && (r.mode || r.state)) || '—');
          if (r && r.familiarity != null) put('熟悉度', String(r.familiarity));
        }).catch(function () { put('MCL 状态', '获取失败'); });
        api('/vector/status2').then(function (r) {
          put('向量档', r && r.present ? (String(r.rows || 0) + ' 行') : '未启用');
        }).catch(function () { put('向量档', '获取失败'); });
        api('/inject/stats').then(function (r) {
          put('注入统计', r && typeof r === 'object' ? JSON.stringify(r).slice(0, 160) : String(r));
        }).catch(function () { put('注入统计', '获取失败'); });
        api('/get_root').then(function (r) {
          put('当前根', (r && (r.root || r.path || r.active)) || '—');
        }).catch(function () { put('当前根', '获取失败'); });
      }

      /* 快捷键（C5）：Ctrl/⌘+Shift+S 开关面板；Esc 关闭；Ctrl/⌘+Shift+L 切日志面板 */
      function installShortcuts() {
        if (installShortcuts._done) return;
        installShortcuts._done = true;
        document.addEventListener('keydown', function (e) {
          var mod = e.ctrlKey || e.metaKey;
          if (mod && e.shiftKey && (e.key === 'S' || e.key === 's')) {
            e.preventDefault(); togglePanel(); return;
          }
          if (mod && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
            e.preventDefault();
            Cfg.set('showLogs', !Cfg.get('showLogs', true));
            applyLogPanel();
            status('日志面板已' + (Cfg.get('showLogs') ? '显示' : '隐藏'), 'info');
            return;
          }
          if (e.key === 'Escape') {
            var mask = document.getElementById('scpanl-mask');
            if (mask && mask.classList.contains('open')) { e.preventDefault(); closePanel(); }
          }
        });
      }
      function togglePanel() {
        var mask = document.getElementById('scpanl-mask');
        if (!mask) return;
        if (mask.classList.contains('open')) closePanel(); else openPanel();
      }
      function closePanel() {
        var mask = document.getElementById('scpanl-mask');
        if (mask) mask.classList.remove('open');
      }

      function buildModal(mask) {
        var modal = el('div'); modal.id = 'scpanl-modal';
        // D6：语义化——对话框角色 + 无障碍标签（读屏可识别，原缺失）
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', '守藏记忆面板');

        // 左导航（Obsidian settings 侧栏；分组=记忆/运行/配置，2026-09-09 布局重排对齐宿主排版）
        var nav = el('div', 'sc-nav');
        nav.appendChild(el('div', 'sc-nav-title', '守藏 SHOUCANG'));
        refs.navItems = [];
        var lastGroup = null;
        VIEWS.forEach(function (v) {
          if (v[3] && v[3] !== lastGroup) {
            nav.appendChild(el('div', 'sc-nav-group', v[3]));
            lastGroup = v[3];
          }
          var item = el('div', 'sc-nav-item');
          item.appendChild(svg(ICONS[v[2]]));
          item.appendChild(el('span', null, v[1]));
          // D6：导航项可聚焦、可被读屏识别
          item.setAttribute('role', 'button');
          item.setAttribute('tabindex', '0');
          item.setAttribute('aria-label', v[1]);
          item.onclick = function () { show(v[0]); };
          item.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(v[0]); } };
          refs.navItems.push({ name: v[0], el: item });
          nav.appendChild(item);
        });
        nav.appendChild(el('div', 'sc-nav-spacer'));
        /* v9 对齐：导航脚 = **状态块**（方案 `.nav-foot`：分隔线 + 状态点 + 名称 + 副行），
         * 此前只有一行 `storage = obsidian vault` 文本，既无状态点也无层级。 */
        var foot = el('div', 'sc-nav-foot');
        var health = el('div', 'sc-nav-health');
        var fdot = el('span', 'sc-dot ok');
        health.appendChild(fdot);
        health.appendChild(el('b', null, '记忆库'));
        var fstate = el('span', null, '—');
        health.appendChild(fstate);
        foot.appendChild(health);
        var fsub = el('div', 'sc-nav-foot-sub', 'storage = obsidian vault');
        foot.appendChild(fsub);
        nav.appendChild(foot);
        /* 状态块句柄：供各视图按真实数据回填（不引入额外取数） */
        refs.navHealth = function (stateText, kind, subText) {
          if (stateText !== undefined && stateText !== null) fstate.textContent = stateText;
          if (kind) fdot.className = 'sc-dot ' + (kind === 'ended' ? 'ok' : (kind === 'stalled' ? 'err' : kind === 'suspect' ? 'warn' : kind));
          if (subText) fsub.textContent = subText;
        };
        /* 移动端关闭按钮（≤720px 才显示）：此前移动端模态为全屏 100vw/100vh，
           遮罩被完全盖住 ⇒ 点遮罩关闭失效，只剩 Esc 键——移动端无键盘即无法关闭面板。
           sticky right:0 + margin-left:auto ⇒ 横向 tab 滚动时始终吸在右侧。 */
        var navClose = el('button', 'sc-nav-close', '✕');
        navClose.type = 'button';
        navClose.title = '关闭面板';
        navClose.setAttribute('aria-label', '关闭面板');
        navClose.onclick = function () { closePanel(); };
        nav.appendChild(navClose);
        modal.appendChild(nav);

        // 右内容
        var main = el('div', 'sc-main');
        /* 页头槽（v9 对齐）：页头是**固定的**（不随内容滚动），与 v9 `.main > .pagehead{flex:none}` 同构。
         * 视图渲染统一调 UI.pageHead(...)，由它把自己挂进本槽；槽在 .sc-view 之前 ⇒ 滚动只作用于内容。 */
        var headSlot = el('div', 'sc-headslot'); headSlot.id = 'scpanl-headslot';
        main.appendChild(headSlot);
        refs.view = el('div', 'sc-view');
        main.appendChild(refs.view);
        var bar = el('div', 'sc-statusbar'); bar.id = 'sc-statusbar'; // 类挂样式 + id 供 status() 定位（此前只挂 id，.sc-statusbar 类样式永不命中）
        bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite'); // U3（A10）：状态变化被读屏播报
        main.appendChild(bar);
        modal.appendChild(main);

        mask.appendChild(modal);
        // 应用界面设置（密度 / 导航宽度 / 导航分组 / 页脚 / 日志面板 / 快捷键 / 轮询）
        applyDensity();
        applyNavWidth();
        applyNavGroups();
        applyFootBar();
        applyLogPanel();
        installShortcuts();
        restartPolling();
        /* A6 深链 + 记忆：优先读 #sc=<视图名>（只读取，不写 URL —— 写 hash 可能干扰宿主路由，
           故默认不做写入式深链）；其次用上次记住的视图；都没有则回落到 file。 */
        var startView = 'file';
        try {
          var hm = String(location.hash || '').match(/[#&]sc=([a-z0-9_-]+)/i);
          if (hm && VIEWS.some(function (v) { return v[0] === hm[1]; })) startView = hm[1];
          else if (Cfg.get('lastView')) {
            var lv = String(Cfg.get('lastView'));
            if (VIEWS.some(function (v) { return v[0] === lv; })) startView = lv;
          }
        } catch (e) { }
        show(startView);
      }

      function openPanel() {
        var mask = document.getElementById('scpanl-mask');
        if (!mask) return;
        // 幂等打开：模态框只构建一次，重复开关只切换显隐，避免叠加出多个面板
        if (!mask.querySelector('#scpanl-modal')) buildModal(mask);
        mask.classList.add('open');
        syncTheme();
        // 打开即刷新 UI 状态：重置知识库索引缓存并重渲染当前视图（画像/记忆/wiki/配置原文数据重新拉取，免手动刷新）
        refreshCurrentView();
      }

      /* v9 对齐：探测宿主实际主题并打标记（面板此前完全依赖宿主变量，无法保证与方案同色） */
      function syncTheme() {
        var root = document.getElementById('scpanl-root');
        if (!root) return;
        var probe = document.querySelector('.hHd-Xa_settingsArea, .hHd-Xa_footerActions, [class*="sidebar"], body');
        var bg = probe ? getComputedStyle(probe).backgroundColor : '';
        var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(bg || '');
        var dark = true;
        if (m) { var lum = (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000; dark = lum < 140; }
        var skin = String(Cfg.get('skin', 'v9')) === 'host' ? 'host' : 'v9';
        root.classList.toggle('sc-dark', dark);
        root.classList.toggle('sc-light', !dark);
        /* 组件库暗色（S3）：WA 默认主题是**浅色**，与深色面板冲突；其 .wa-dark 提供暗色调色板，
         *   已由构建期限定在 #scpanl-root 作用域内 ⇒ 只影响面板，不动宿主页。 */
        root.classList.toggle('wa-dark', dark);
        root.classList.toggle('wa-light', !dark);
        root.classList.toggle('sc-skin-v9', skin === 'v9');
        root.classList.toggle('sc-skin-host', skin === 'host');
        try { Cfg.set('theme', dark ? 'dark' : 'light'); } catch (e) { }
      }
      function mount() {
        if (document.getElementById('scpanl-mask')) { syncTheme(); return true; }
        var rootEl = el('div'); rootEl.id = 'scpanl-root';
        document.body.appendChild(rootEl);
        syncTheme(); // 挂载即探测一次（此后每次 mount/打开都会刷新）
        /* S3：组件库主题令牌层单独一个 <style>（缺它组件就"没有盒子"，见 CHANGELOG 判因） */
        try {
          if (window.__SC_VENDOR_CSS__ && !document.getElementById('scpanl-vendor-css')) {
            var vstyle = el('style'); vstyle.id = 'scpanl-vendor-css'; vstyle.textContent = window.__SC_VENDOR_CSS__;
            rootEl.appendChild(vstyle);
          }
        } catch (e) { Log.warn('组件库主题注入失败：' + (e && e.message)); }
        var styleHost = el('style'); styleHost.textContent = CSS; rootEl.appendChild(styleHost);
        var mask = el('div'); mask.id = 'scpanl-mask';
        mask.onclick = function (ev) { if (ev.target === mask) mask.classList.remove('open'); };
        rootEl.appendChild(mask);
        return false;
      }

      // 兜底：找不到侧栏 footArea 时，左下角固定入口
      function mountFallbackEntry() {
        if (document.getElementById('scpanl-btn')) return;
        var btn = el('button'); btn.id = 'scpanl-btn'; btn.title = '守藏面板';
        var ic = el('img', 'sc-ic-lg'); ic.src = SC_ICON; ic.alt = '守';
        btn.appendChild(ic);
        btn.dataset.fallback = '1';
        btn.classList.add('sc-fab'); // U2.5b：内联 → 类（令牌化；样式只在 CSS）
        btn.onclick = openPanel;
        document.body.appendChild(btn);
      }

      // 上移入口：直插侧栏 footArea 首行（记忆插件(footerActions 单行)上方、设置上方），不占 Cordis 插槽
      var sidebarObserver = null;
      var sidebarTries = 0;
      function mountSidebarEntry() {
        if (document.getElementById('scpanl-btn')) return true;
        var foot = null;
        var mneme = document.querySelector('.mneme-trigger');
        if (mneme) foot = mneme.closest('[class*="footArea"]') || mneme.closest('[class*="foot-area"]');
        if (!foot) foot = document.querySelector('[class*="footArea"]') || document.querySelector('[class*="foot-area"]');
        if (!foot) {
          if (sidebarTries++ < 40) { setTimeout(mountSidebarEntry, 500); return false; }
          mountFallbackEntry();
          return false;
        }
        // 2026-09-10 审查：入口与 DSH 设置样式完全一致——克隆宿主设置按钮（同款类/结构，随宿主主题自动适配）
        var btn = null;
        var settingsBtn = null;
        try { settingsBtn = document.querySelector('[class*="triggerRow"] button') || [...document.querySelectorAll('button')].find(function (b) { return (b.textContent || '').trim() === '设置'; }); } catch (e) { settingsBtn = null; }
        if (settingsBtn && settingsBtn.cloneNode) {
          try {
            btn = settingsBtn.cloneNode(true); // 克隆按钮（保留宿主类 VOzbGW_trigger + 内部 slot 结构）
            btn.id = 'scpanl-btn';
            btn.removeAttribute('aria-haspopup'); btn.removeAttribute('aria-expanded');
            btn.title = '守藏面板';
            // 换内部 label 文本（span.UQsH_q_triggerLabel 或 data-slot 容器）
            var lab = btn.querySelector('span, [data-slot] span');
            if (lab) lab.textContent = '守藏';
            // 图标（2026-09-10 审查三）：保留宿主克隆 svg 原样（与设置图标 100% 同质、清晰随主题）。
            // 说明：曾尝试 PNG/自绘 path 替代——PNG 96px 缩小有锯齿、手写 path 不可靠易变形；
            // 为保证"与设置完全一致且清晰"，暂用宿主同款图标（视觉协调优先，后续可换验证过的同规格矢量）。
            btn.onclick = openPanel;
          } catch (e) { btn = null; }
        }
        if (!btn) {
          // 回退：无设置按钮可克隆时用 sc-trigger（保持可用）
          btn = el('button'); btn.id = 'scpanl-btn'; btn.type = 'button'; btn.title = '守藏面板';
          btn.className = 'sc-trigger';
          var icF = el('img', 'sc-ic-sm'); icF.src = SC_ICON; icF.alt = '守';
          btn.appendChild(icF);
          btn.appendChild(el('span', 'sc-trigger-label', '守藏'));
          btn.onclick = openPanel;
        }
        // 2026-09-10 审查二：守藏与设置**上下两行**——克隆按钮包进独立 triggerRow（同款宿主类），
        // 插到设置所在 triggerRow 前（同 settingsArea），两行上下排列、各自与设置同款样式。
        var settingsRow = settingsBtn ? settingsBtn.closest('[class*="triggerRow"]') : null;
        if (settingsBtn && settingsRow && btn.getAttribute('class') && String(btn.className).indexOf('sc-trigger') < 0) {
          var ownRow = el('div');
          ownRow.className = settingsRow.className; // 复用宿主 triggerRow 类（样式同设置行；宿主类自带 flex，不再内联覆盖）
          ownRow.appendChild(btn);
          settingsRow.parentElement.insertBefore(ownRow, settingsRow); // 设置在下方一行
          // 记录 btn 真实父（重挂判断用）
        } else if (settingsBtn && settingsBtn.parentElement) {
          // 回退：同容器并排（无法建独立行时保可用）
          settingsBtn.parentElement.insertBefore(btn, settingsBtn);
        } else {
          foot.insertBefore(btn, foot.firstChild); // 回退：foot 首行
        }
        var root = foot.parentElement;
        var isClone = !!settingsBtn && !!btn.dataset && btn.getAttribute('class') !== null && String(btn.className).indexOf('sc-trigger') < 0;
        var sync = function () {
          if (!btn.isConnected) {
            var wr = btn.parentElement;
            btn.remove();
            if (wr && wr !== foot && wr.children.length === 0) wr.remove(); // 清空独立行容器
            sidebarTries = 0;
            mountSidebarEntry();
            return;
          }
          if (isClone) return; // 克隆宿主按钮：样式随宿主，不干预 className（折叠由宿主侧栏整体处理）
          var collapsed = root && (root.classList.contains('hHd-Xa_collapsed') || root.clientWidth < 200);
          btn.className = collapsed ? 'sc-trigger sc-rail' : 'sc-trigger';
        };
        sync();
        if (root && typeof MutationObserver !== 'undefined') {
          sidebarObserver = new MutationObserver(sync);
          sidebarObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
          sidebarObserver.observe(foot, { childList: true });
        }
        return true;
      }

      // cordis client plugin 激活：注入 slots（满足契约）+ DOM 入口始终挂载（React 不可用时真实入口）
      /* S2：宿主设置中心的「守藏」分区（React 组件）。
       * 判因：界面偏好此前只存在于自建面板的设置视图里 —— 用户找设置会去宿主设置中心，两处分离即"设置 rot"。
       * 组件复用宿主运行时（require('react')），类名用宿主既有 setting-item 体系 ⇒ 自动跟随宿主主题；
       * 面板内「设置」视图保留（自有壳兜底 + 配置原文/根目录等高风险项仍在面板内）。 */
      var slotReact = null;
      function applyCfgSideEffect(key) {
        try {
          if (key === 'density') applyDensity();
          else if (key === 'navWidth') applyNavWidth();
          else if (key === 'navGroups') applyNavGroups();
          else if (key === 'footBar') applyFootBar();
          else if (key === 'showLogs') applyLogPanel();
          else if (key === 'refreshMs') restartPolling();
          else if (key === 'skin') { syncTheme(); refreshCurrentView(); }
          else if (key === 'startView' || key === 'logLevel' || key === 'overviewMode' || key === 'maxRows') { /* 下次渲染生效 */ }
        } catch (e) { Log.warn('设置生效失败（' + key + '）：' + (e && e.message)); }
      }
      function ShoucangSettingsSection() {
        var h = slotReact.createElement;
        function row(key, title, desc, control) {
          return h('div', { className: 'setting-item', key: key },
            h('div', { className: 'setting-item-info' },
              h('div', { className: 'setting-item-name' }, title),
              h('div', { className: 'setting-item-desc' }, desc)),
            h('div', { className: 'setting-item-control' }, control));
        }
        function sel(key, opts, fallback) {
          return h('select', {
            value: String(Cfg.get(key, fallback)),
            onChange: function (ev) { Cfg.set(key, ev.target.value); applyCfgSideEffect(key); }
          }, (opts || []).map(function (o) { return h('option', { value: String(o.value), key: String(o.value) }, o.label) }));
        }
        function num(key, fallback, min, max, step) {
          return h('input', {
            type: 'number', value: String(Cfg.get(key, fallback)), step: step || 1,
            onChange: function (ev) {
              var n = parseInt(ev.target.value, 10);
              if (isNaN(n)) return;
              Cfg.set(key, Math.max(min, Math.min(max, n))); applyCfgSideEffect(key);
            }
          });
        }
        function tgl(key, fallback) {
          return h('input', {
            type: 'checkbox', checked: !!Cfg.get(key, fallback),
            onChange: function (ev) { Cfg.set(key, ev.target.checked); applyCfgSideEffect(key); }
          });
        }
        return h('div', { className: 'sc-host-settings' },
          h('div', { className: 'setting-item-desc' }, '守藏面板的界面偏好（与面板内「设置」页同源，改后立即生效；保存在浏览器 localStorage）。'),
          row('density', '显示密度', '紧凑模式隐藏描述、压缩行高',
            sel('density', [{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }], 'comfortable')),
          row('navWidth', '导航宽度', '面板左导航像素宽度（140–320）', num('navWidth', 216, 140, 320)),
          row('refreshMs', '轮询间隔', '毫秒；0 = 关闭轮询', num('refreshMs', 60000, 0, 3600000, 1000)),
          row('showLogs', '显示日志面板', '状态栏上方常驻日志（关闭即折叠成一行）', tgl('showLogs', false)),
          row('skin', '界面皮肤', 'v9 = 方案调色板（默认）；宿生 = 跟随 DSH 主题令牌',
            sel('skin', [{ value: 'v9', label: 'v9 方案皮肤' }, { value: 'host', label: '宿主原生皮肤' }], 'v9')),
          row('startView', '启动时视图', '打开面板默认落地页（深链 > 上次视图 > 此项）',
            sel('startView', VIEWS.map(function (v) { return { value: v[0], label: v[1] } }), 'overview')),
          row('openPanel', '打开面板', '宿主设置里也能直接唤起守藏面板',
            h('button', { type: 'button', className: 'sc-btn sc-btn-primary', onClick: function () { openPanel(); } }, '打开守藏面板'))
        );
      }

      function apply(ctx) {
        mount(); // root + mask + CSS（幂等）
        // 2026-09-10：窗口重新聚焦时刷新当前视图——面板停留期间后台数据（蒸馏/深睡/记忆写入）变化，
        // 切回窗口即取最新；仅面板打开时生效 + 1.5s 防抖（轻量替代全局轮询）。
        if (!window.__scFocusBound) {
          window.__scFocusBound = true;
          var lastFocusRefresh = 0;
          var focusRefresh = function () {
            try {
              var mk = document.getElementById('scpanl-mask');
              if (!mk || !mk.classList.contains('open')) return; // 面板未打开=不刷
              if (document.hidden) return; // 页面隐藏中不刷（visibilitychange 返回时再刷）
              var now = Date.now();
              if (now - lastFocusRefresh < 1500) return; // 防抖
              lastFocusRefresh = now;
              refreshCurrentView();
            } catch (e) { /* 聚焦刷新零抛出 */ }
          };
          window.addEventListener('focus', focusRefresh);
          document.addEventListener('visibilitychange', function () { if (!document.hidden) focusRefresh(); });
        }
        // 0.1.2 起 React slot 按钮与 DOM 直插按钮（mountSidebarEntry）会同时显示为两个入口，
        // 暂禁用 slot 按钮、只保留 DOM 直插真实入口；如需恢复 React slot 改回 true。
        /* S2（2026-09-13）侧栏入口插槽化：**宿主插槽优先，DOM 直插兜底，二者互斥**。
         * 判因：0.1.2 曾把两条路都开 ⇒ 侧栏出现两个入口（见旧注释），于是插槽被整体禁用；
         *   正解不是禁用，而是**只在插槽真能渲染时才跳 DOM 兜底**：
         *     · 能 require('react') 且宿主提供 slots 服务 ⇒ 注册 sidebar.footer.action，不再挂 DOM 入口
         *     · 任一条件不满足 ⇒ 走既有 DOM 直插（行为与旧版一致，零回归） */
        var reactEl = null;
        try { reactEl = require('react'); } catch (e) { reactEl = null; }
        slotReact = reactEl;
        var SLOT_OK = !!(reactEl && typeof reactEl.createElement === 'function' &&
          ctx && typeof ctx.effect === 'function' && ctx.slots && typeof ctx.slots.inject === 'function' &&
          typeof ctx.slots.register === 'function');
        if (SLOT_OK) {
          ctx.effect(function () {
            return ctx.slots.inject('sidebar.footer.action', function () {
              // 0.1.2 契约：组件作为 register 的第二个参数（options.component 已不再被读取）
              var open = openPanel;
              var ShoucangToggle = function () {
                // 纯 DOM 插件无 react 运行时 → 渲染 null（React 组件返回 null 合法，空槽不崩）；DOM 入口由 mountSidebarEntry 提供
                if (!reactEl || typeof reactEl.createElement !== 'function') return null;
                return reactEl.createElement(
                  'button',
                  { type: 'button', title: '守藏面板', className: 'sc-trigger', onClick: function () { open(); } },
                  reactEl.createElement('img', { src: SC_ICON, alt: '守', style: { width: 22, height: 22, display: 'block', pointerEvents: 'none' } }),
                  reactEl.createElement('span', { className: 'sc-trigger-label' }, '守藏')
                );
              };
              return ctx.slots.register({
                name: 'sidebar.footer.action',
                id: 'shoucang-panel-toggle',
                label: function () { return '守藏面板'; }
              }, ShoucangToggle);
            });
          }, 'shoucang-panel: footer action');
          /* S2：界面偏好进宿主设置中心（settings.section）；面板内「设置」视图保留作兜底与高级项 */
          ctx.effect(function () {
            return ctx.slots.inject('settings.section', function () {
              return ctx.slots.register({
                name: 'settings.section',
                id: 'shoucang',
                order: 60,
                label: function () { return '守藏'; }
              }, ShoucangSettingsSection);
            });
          }, 'shoucang-panel: settings section');
        }
        // S2：互斥——插槽可用时**不再**挂 DOM 直插入口（否则侧栏出现两个入口，0.1.2 的老问题）
        if (SLOT_OK) {
          Log.info('侧栏入口：已注册宿主插槽 sidebar.footer.action（不挂 DOM 直插入口）');
        } else {
          Log.info('侧栏入口：宿主插槽不可用（' + (reactEl ? 'slots 服务缺失' : "require('react') 不可用") + '），回退 DOM 直插');
          if (!document.getElementById('scpanl-btn')) mountSidebarEntry();
        }
        return function () {
          if (sidebarObserver) { try { sidebarObserver.disconnect(); } catch (e) { /* noop */ } }
          var n = document.getElementById('scpanl-root'); if (n) n.remove();
          var b = document.getElementById('scpanl-btn'); if (b) b.remove();
        };
      }

      exports.inject = inject;
      exports.apply = apply;
      return module.exports;
    }
  });
})();
