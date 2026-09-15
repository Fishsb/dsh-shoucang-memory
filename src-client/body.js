import { UI } from './ui-kit.js'
import { appState } from './app-state.js'
import { Derive, fmtTime } from './derive.js'
import { renderPersona, renderIndexRows, openMemoryNote, makeMemoryPointerRow } from './panes-memory.js'
import { renderCognitionReport, renderMemoryExpanded, renderNoteSections } from './panes-memory-detail.js'
import { renderViewRoots, renderViewYaml, renderConfigRaw } from './panes-config.js'
import { ovCRow, ovPill, ovCriteriaCard, renderViewOverview } from './panes-overview.js'
import { renderFacts, renderViewArch } from './panes-arch.js'
import { renderViewObserve, buildLogPanel, renderRunExtras } from './panes-observe.js'
import { renderViewToggles } from './panes-toggles.js'
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
import { Bus, Cfg, Fold, Log, Prog, Store, setLogStatusSink } from './state.js'
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
      /* UI1/U2（2026-09-15）**修潜伏的顺序耦合**：原为模块加载期一次性读取
       *   `var CONTRACT = window.__SC_CONTRACT__ || null` —— 而该全局由 `entry.js` 在**模块顶层**赋值，
       *   本 IIFE 在 **factory 内**执行 ⇒ 二者在产物的**拓扑序**由 esbuild 决定。
       *   实测（加入 `panes-config.js` 依赖后）：产物里**读取(L8095) 早于赋值(L11884)** ⇒ `CONTRACT` 恒为 null
       *   ⇒ 契约预检全线失效（真机 9 项断言红）。**不是新 bug，是一直靠"碰巧顺序对"活着。**
       *   ⇒ 改为**惰性取用**：`contract()` 每次从 window 现取 ⇒ **与模块执行顺序解耦**。 */
      function contract() {
        return (typeof window !== 'undefined' && window.__SC_CONTRACT__) || null;
      }
      function contractOf(path) {
        if (!contract()) return null;
        if (!appState.contractByPath) {
          appState.contractByPath = {};
          (contract()?.routes || []).forEach(function (r) { appState.contractByPath[r.path] = r; });
        }
        return appState.contractByPath[path] || null;
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
      function deferFold(host, mark, label, openDefault, key) {
        appState.foldQueue.push({ host: host, mark: mark, label: label, open: !!openDefault, key: key });
      }
      function flushFolds() {
        var q = appState.foldQueue;
        appState.foldQueue = [];
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
      
      /** 胶囊（原型 `.pill`；kind: ok/warn/info/brand；mono 走等宽）。 */
      
      /** 相对时间（无时间戳时返回空串 —— 由调用方给口径词，绝不编造时间）。 */
      

      /** 总览 · 晨起摘要（原型左栏第 2 张）：delta（剩余有效期 / 注入次数）+ weekDiff（近 7 天深睡新习得）。
       * 原型 3 行；面板按可用字段渲染（delta.rows 最多 2 行 + weekDiff 1 行），**零新端点**。 */
      

      /** 总览 · 最近动态（原型左栏第 3 张）：`.tl` 时间线，最多 4 条。
       * **口径自决**：原型未标端点 ⇒ 用现有端点聚合**真实**动态（蒸馏 / 深睡 / 容量预警 / 候选积压），
       * 时间戳取自各端点；无时间戳的条目显示口径词（"本月"/"待处理"），不编造时间。 */
      

      /** 总览 · 判据与重排门（原型右栏第 2 张）：`.mini` 双列 5 组 + 口径注脚。数据 `GET /criteria`。
       * 上轮误判「原型无此块」而挂在深睡页；本轮**迁到总览**（原型总览有、深睡页无）。 */
      

      /** 总览 · 快捷操作（原型右栏第 3 张）：4 个运维动作。
       * 其中「成熟度扫描」在插件运行时**无对应能力**（实现是库内 scripts/maturation-scan.mjs），
       * 本轮按 reconcile 的既有模式端点化（POST /maturation/scan），不留假按钮。 */
      

      

      /* ────────── 参数页（P1-1 拆分后）：父函数只做页头 + 页签装配 ──────────
       * 拆分背景：本函数原为 615 行单函数（全前端唯一 >400 行债务）。现按配置域切成 4 个
       *   pane 子渲染函数（inject / cap / model / sched），行为等价由
       *   `scripts/test-panel-view-contract.mjs`（34 项控件契约）守 —— 拆分前先固化基线，
       *   拆分后逐项比对，**清单不变 = 行为等价**。
       * 注意：子函数是**模块级**函数（不是嵌套在父函数里）——否则父函数仍是 600+ 行，
       *   拆分只换取了个位置、跨度门禁照样红（棘轮只认跨度）。 */
      
      /* 数值输入项（参数页 cap / sched 两 pane 共用 → 拆分为模块级，避免各 pane 各写一份） */
      
      
      
      /* 模型与向量 pane（P1-1 收尾二次拆分）：父函数只分派两个板块——
       *   向量链路（vec.ts + bge-m3 运行态/开关/轮询）与 LLM 模型选择（蒸馏/深睡各自选宿主模型）。
       *   两块之间**无共享状态**（只靠 host 串联），故可直接切开；行为等价由
       *   `scripts/test-panel-view-contract.mjs` 的 6 项 model 契约守。 */
      
      
      
      

      


      


      /** 记忆库指针行：点击打开 notes 小节（只读 /memory/sections）；pointer=null 时不跳转。 */
      
      

      /** 标签 → 色相（tag pill 着色；未知回落品牌紫）。 */
      
      
      /** 索引指针行（tag pill + subject + notes 指针），点击直达 notes 小节。 */
      /** 知识索引行渲染：按 tag 语义分组排序（环境→工具→流程→教训→发布→画像→其他），组内保持书写序（稳定排序）。 */
      
      
      /** ISO → 本地 'MM-DD HH:MM'（蒸馏水位展示用）。 */
      

      /* UI1/U2（2026-09-15）：此处原有死注释 `/** 迷你趋势图（sparkline，Tufte）… *​/`
       *   （描述的函数经核查是死代码，已删；见 `panes-memory-detail.js` 顶部说明）。 */

      /** 认知可视化（v9）：睡眠/记忆两视图共用 —— 单端点 /cognition/report。
       *  mode='sleep'：本轮产出回执 + 下轮材料预估 + 历次趋势；mode='memory'：仅归档区（冷热分布/超 R 节/指针健康 已按用户要求移除）。
       *  端点不可用=静默（不阻塞主视图）。 */
      
      /** 画像板块（F-003）：USER.md/AGENT.md 画像专属视图——容量与指针行**只在此板块**展示（记忆板块不重复统计画像）。
       * v9 严格对齐（2026-09-13 第五轮 · 形态层）：
       *   · 页头右侧加「压缩执行位」占位 chip（与 v9 原型 .proto-note 同形态）
       *   · USER/AGENT 构成从 kpi 卡改为 sc-mem-stat（v9 原型 stat-box 形态 + 超阈提示行）
       *   · 新增「成熟度分布」sc-card 占位（v4 原型 hist 柱状图 5 根柱）—— /memory/overview 当前不带每行 score 字段，
       *     形态已就位，数据接入即生效（属"展示形态已就位 / 数据未上报"型占位）
       *   · USER.md 卡右加「压缩画像」按钮（与 v9 原型 .right 位置一致）
       * 未对齐（如实记录）：成熟度柱状图未接真实数据，待数据字段新增即激活。 */
      

      /** 记忆板块（阶段4 UI 重排 2026-09-06）：分区展示——蒸馏运行 / 记忆库状态 / 知识索引 / pending / notes / 守藏知识区。
       * 去重原则：USER/AGENT 画像只在画像板块；MEMORY 容量百分比只在进度条；蒸馏水位读 suite 活水位。 */
      
      /* 统计小卡（记忆库页 4 个段共用 → 提为模块级，纯函数只依赖 el） */
      
      
      
      
      
      /** v9 记忆库页新增 Tab「归档区」：主动遗忘的产物（库内 `notes/archive/`）。
       * 数据 = `/cognition/report` 的 `archive:[{file,chars}]`（与运行观测页同源，不新增端点）。
       * **只读**：插件没有「复制回 notes/」的端点 ⇒ **不放该按钮**（原型画了），改为在 alert 里写明恢复方式
       * ——「看得见点不动」的假控件比没有更糟。 */
      
      
      

      /* notes 小节的稳定折叠键：rel + 层级路径 + 标题。
       * 带路径是必要的——同一笔记里不同层级的兄弟小节可能同名，只按标题取键会互相串状态。 */
      

      /** notes 小节正文浏览（只读；/memory/sections）。返回时恢复来源板块与滚动位置（记忆/画像/守藏区均可进入）。
       *  UI1/C′：`memoryViewScroll`/`noteReturnRender` 已收进 `appState`（初值在 `app-state.js`）。 */
      
      /** R3：notes 小节正文编辑（走 /memory/section-edit 门禁；索引指针不动，只改详情正文） */
      

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
      

      /** 原始 JSON 折叠（兜底：事实渲染看不全时，原文永远能看） */
      

      /** 架构视图：五个页签 = 内容环 / 记录与图 / 观测 / 装配 / 认知环旋钮 */
      

      /** 架构视图主体（异常由 `renderViewArch` 统一兜底；快照确定性见下方各注释） */
      

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
      

      /* 日志面板（状态栏上方 + 观测视图共用） */
      

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
      /** UI1/C′：`currentView` 已收进 `appState`；启动视图由 `Cfg` 决定，在 `app-state.js` 外赋值处见 `mount`。 */
      appState.currentView = Cfg.get('startView', 'overview');
      function refreshCurrentView() { show(appState.currentView); }
      function show(name) {
        /* 折叠态的生命周期边界：**换视图**才清空（避免上一个视图的 key 残留到新数据上）；
           同一视图内的重绘（自动轮询 / 保存后重取 / 手动刷新）**保留**开合态 ——
           这正是旧实现最难受的一点：60s 一轮询，用户展开的区块就被强制收起。 */
        if (appState.currentView !== name) Fold.clear();
        appState.currentView = name;
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
        UI.bumpHeadEpoch();       /* 新渲染轮次：本轮允许写入一次页头（实现见 ui-kit.js） */
        appState.foldQueue.length = 0;   // 丢弃上一次渲染未收口的登记（异常路径残留），防止串到本次
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
      

      /* ---------- 界面设置的运行时应用（自由度） ---------- */
      /* ---------- 界面设置的运行时应用 —— ① 设置生效 ---------- */
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
      function restartPolling() {
        if (appState.pollTimer) { clearInterval(appState.pollTimer); appState.pollTimer = null; }
        var ms = parseInt(Cfg.get('refreshMs', 60000), 10) || 0;
        if (ms <= 0) return;
        appState.pollTimer = setInterval(function () {
          // 仅在面板打开时轮询，关闭时不空转
          var mask = document.getElementById('scpanl-mask');
          if (!mask || !mask.classList.contains('open')) return;
          if (Cfg.get('autoRefresh', true)) refreshCurrentView();
        }, ms);
      }

      /* 关键指标采集（C4）——同时为 /inject/stats 提供 UI 入口（B1） */
      /* ---------- 界面设置的运行时应用 —— ② 轮询与指标 ---------- */
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
      /* ---------- 界面设置的运行时应用 —— ③ 面板壳与宿主挂载 ---------- */
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
      /* ---------- 界面设置的运行时应用 —— ③a 壳·模态 ---------- */
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
      /* ---------- 界面设置的运行时应用 —— ③b 壳·入口挂载 ---------- */
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
      /* UI1/C′：`sidebarObserver`/`sidebarTries` 已收进 `appState`（初值在 `app-state.js`）。 */
      function mountSidebarEntry() {
        if (document.getElementById('scpanl-btn')) return true;
        var foot = null;
        var mneme = document.querySelector('.mneme-trigger');
        if (mneme) foot = mneme.closest('[class*="footArea"]') || mneme.closest('[class*="foot-area"]');
        if (!foot) foot = document.querySelector('[class*="footArea"]') || document.querySelector('[class*="foot-area"]');
        if (!foot) {
          if (appState.sidebarTries++ < 40) { setTimeout(mountSidebarEntry, 500); return false; }
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
            appState.sidebarTries = 0;
            mountSidebarEntry();
            return;
          }
          if (isClone) return; // 克隆宿主按钮：样式随宿主，不干预 className（折叠由宿主侧栏整体处理）
          var collapsed = root && (root.classList.contains('hHd-Xa_collapsed') || root.clientWidth < 200);
          btn.className = collapsed ? 'sc-trigger sc-rail' : 'sc-trigger';
        };
        sync();
        if (root && typeof MutationObserver !== 'undefined') {
          appState.sidebarObserver = new MutationObserver(sync);
          appState.sidebarObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
          appState.sidebarObserver.observe(foot, { childList: true });
        }
        return true;
      }

      // cordis client plugin 激活：注入 slots（满足契约）+ DOM 入口始终挂载（React 不可用时真实入口）
      /* S2：宿主设置中心的「守藏」分区（React 组件）。
       * 判因：界面偏好此前只存在于自建面板的设置视图里 —— 用户找设置会去宿主设置中心，两处分离即"设置 rot"。
       * 组件复用宿主运行时（require('react')），类名用宿主既有 setting-item 体系 ⇒ 自动跟随宿主主题；
       * 面板内「设置」视图保留（自有壳兜底 + 配置原文/根目录等高风险项仍在面板内）。 */
      /* UI1/C′：`slotReact` 已收进 `appState`（初值在 `app-state.js`）。 */
      /* ---------- 界面设置的运行时应用 —— ③c 插件入口与副作用 ---------- */
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
        var h = appState.slotReact.createElement;
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
        appState.slotReact = reactEl
      /* UI1/C′ 补齐：视图刷新器与 DOM 句柄表也进容器（pane 经它取）。
       *  ⚠ **必须在 factory 内** —— 实测曾误插到 IIFE 之外，模块作用域看不到 `refreshCurrentView`
       *     ⇒ 产物里该行是**裸名**（esbuild 未改名）+ 真机 `ReferenceError`（由 test-panel-view-contract 抓出）。 */
      /* UI1/U2：设置页 pane 所需的基础件（构造器/键表/收口器/视图切换）。 */
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
          if (appState.sidebarObserver) { try { appState.sidebarObserver.disconnect(); } catch (e) { /* noop */ } }
          var n = document.getElementById('scpanl-root'); if (n) n.remove();
          var b = document.getElementById('scpanl-btn'); if (b) b.remove();
        };
      }

      exports.inject = inject;
      exports.apply = apply;

      /* UI1/U2（2026-09-15）**共享句柄注入的正确位置 = 这里（factory 体末尾、return 之前）**。
       *  实测踩过两次：
       *   ① 放原处（L2839 附近）⇒ `renderViewToggles` 的 4 个子渲染在 `apply`/`mount` → `show()`
       *      时就会被调用 ⇒ **调用早于注入** ⇒ `appState.api is not a function` ⇒ 参数页 3 个 tab 静默空掉。
       *   ② 前移到 `factory` 顶部 ⇒ **`var` 声明（refs / SWITCH_KEYS）没有提升值**
       *      ⇒ 注入时仍是 `undefined` ⇒ `appState.switchKeys.forEach` 崩。
       *  ⇒ 唯一同时满足「晚于所有声明」与「早于任何调用」的位置就是这里。 */
      appState.api = api;
      appState.statusFn = status;
      appState.failFn = fail;
      appState.refreshView = refreshCurrentView;
      appState.refs = refs;
      appState.flushFolds = flushFolds;
      appState.switchKeys = SWITCH_KEYS;
      appState.metaBadges = metaBadges;
      appState.makeToggle = makeToggle;
      appState.show = show;
      appState.apiCtx = apiCtx;
      appState.opCard = opCard;
      appState.renderRunExtras = renderRunExtras;
      appState.applyLogPanel = applyLogPanel;
      appState.deferFold = deferFold;
      appState.filterViewRows = filterViewRows;

      return module.exports;
    }
  });
})();
