/**
 * panes-settings.js — 自 `body.js` 抽出的 pane 模块（UI1/U2 · 2026-09-15）
 *
 * **抽取方式**：`scripts/extract-pane.mjs`，用 **TypeScript AST** 取精确区间
 *   （花括号配平与缩进边界都试过、都会切错 —— 见该脚本头注）。
 *
 * **取依赖**：从 `appState` 取（入口注入），不 import 全局服务模块。
 */
import { UI } from './ui-kit.js'
import { el } from './dom.js'
import { Derive, fmtTime } from './derive.js'
import { appState } from './app-state.js'
import { ovCRow, ovPill } from './panes-overview.js'
import { renderConfigRaw } from './panes-config.js'
import { Bus, Store, Log, Cfg } from './state.js'
import { buildLogPanel } from './panes-observe.js'
import { lang, tr } from './i18n.js'
import { navLabelById } from './i18n-nav.js'

function makeToggle(key, name, desc, initial, onToggle) {
  var sw = el('input', 'checkbox-container'); sw.type = 'checkbox'; sw.checked = !!initial;
  sw.onchange = function () { onToggle(key, sw); };
  /* 接缝①（2026-09-17 阶段 2c）：挂载路径归一 —— 原先用 `extra`（挂进 `.setting-item-info`**内**）
   *  + `wrapControl:false`，而参数页用 `children`（挂 row 平级）⇒ 同一「作用域徽标」在两页
   *  落在**不同位置**（实测徽标左边界：设置页 898 / 参数页 286）。现统一为 `children`：
   *  行形状 = `[info] [徽标组] [控件]`，两页**同形**。`extra` / `wrapControl` 两开关随之删除。 */
  return UI.item(name, desc, null, { children: [appState.metaBadges(key), sw] });
}

function renderViewSettings(view) {
  view.textContent = '';
  UI.pageHead(tr("设置"), tr("界面偏好与高级操作。配置原文（YAML）与行级编辑收在此处，配风险提示。"), {
    routes: ['/config', '/save', '/roots', '/memory/edit'],
    actions: [UI.button(tr("导出快照"), function () {
      /* 真实动作：把「后端配置原文 + 浏览器侧界面偏好」导出为一份 JSON 快照（排障/迁移用）。 */
      return appState.api('/config').then(function (c) {
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
        appState.statusFn(tr("✓ 配置快照已导出"));
      });
    }, { async: true, busyText: tr("导出中…"), okText: tr("配置快照已导出"), title: tr("导出配置原文 + 界面偏好（JSON）") })]
  });
  var pLook = el('div'); var pAdv = el('div'); var _tb = UI.tabs("settings", [{ id: 'pref', label: tr("界面偏好"), pane: pLook }, { id: 'advanced', label: tr("高级"), pane: pAdv }]);
  view.appendChild(_tb.box);
  var host = _tb.pane('pref');

  /* ── v9 结构（DOM 实测 §8）：界面偏好 pane = **一张 card 平铺全部行** + 「快捷键」card + 「恢复默认」行 ──
   * 此前是 6 个折叠组（外观 / 行为 / 可观察性 / 启动 / 外观皮肤 / 快捷键）——折叠组是面板自造的一层，
   * 原型的层级只有「页头 → 卡(.card：卡头 + 卡体) → 行」。原型该 pane 内 12 行同质平铺、**无小标题**，
   * 故这里也不再分小节（项少，平铺可读）。 */
  var pref = UI.card(null);
  host.appendChild(pref.box);
  var box = pref.body;
  box.appendChild(UI.item(tr("显示密度"), tr("紧凑模式隐藏描述文字、压缩行高，提升信息密度。"),
    UI.select([{ value: 'comfortable', label: tr("舒适") }, { value: 'compact', label: tr("紧凑") }], Cfg.get('density', 'comfortable'),
      function (v) { Cfg.set('density', v); applyDensity(); }), {}));
  box.appendChild(UI.item(tr("导航宽度"), tr("左侧导航像素宽度（140–320）；窄屏（≤900px）由响应式断点接管。"),
    UI.input(Cfg.get('navWidth', 216), function (v) {
      var n = parseInt(v, 10); if (isNaN(n)) return;
      Cfg.set('navWidth', Math.max(140, Math.min(320, n))); applyNavWidth();
    }, { type: 'number', width: '120px', ariaLabel: tr("导航宽度") }), {}));
  box.appendChild(UI.item(tr("打开时自动刷新"), tr("打开面板即重新拉取当前视图数据。"),
    UI.toggle(Cfg.get('autoRefresh', true), function (v) { Cfg.set('autoRefresh', v); }), {}));
  box.appendChild(UI.item(tr("轮询间隔（毫秒）"), tr("0 = 关闭轮询。影响运行态数据刷新频率。"),
    UI.input(Cfg.get('refreshMs', 60000), function (v) {
      var n = parseInt(v, 10); if (isNaN(n)) return;
      Cfg.set('refreshMs', Math.max(0, n)); restartPolling();
    }, { type: 'number', width: '140px', ariaLabel: tr("轮询间隔") }), {}));
  box.appendChild(UI.item(tr("概览—详情分层"), tr("列表默认折叠详情，先给概览再按需展开。"),
    UI.toggle(Cfg.get('overviewMode', true), function (v) { Cfg.set('overviewMode', v); }), {}));
  box.appendChild(UI.item(tr("长列表折叠阈值"), tr("超过该行数的列表默认折叠。"),
    UI.input(Cfg.get('maxRows', 50), function (v) {
      var n = parseInt(v, 10); if (isNaN(n)) return;
      Cfg.set('maxRows', Math.max(5, Math.min(500, n)));
    }, { type: 'number', width: '120px', ariaLabel: tr("折叠阈值") }), {}));
  box.appendChild(UI.item(tr("显示日志面板"), tr("在状态栏上方常驻显示调用日志。"),
    UI.toggle(Cfg.get('showLogs', true), function (v) { Cfg.set('showLogs', v); applyLogPanel(); }), {}));
  box.appendChild(UI.item(tr("日志级别"), tr("过滤日志面板显示的最低级别（全部 / 警告+ / 仅错误）。"),
    UI.select([{ value: 'info', label: tr("全部") }, { value: 'warn', label: tr("警告+") }, { value: 'error', label: tr("仅错误") }],
      Cfg.get('logLevel', 'info'), function (v) { Cfg.set('logLevel', v); Bus.emit('log', null); }), {}));
  box.appendChild(UI.item(tr("启动时视图"), tr("打开面板后默认落地的页面。优先级：#sc=<视图名> 深链 > 上次视图记忆 > 此项。"),
    UI.select(appState.views.map(function (v) { return { value: v[0], label: navLabelById(v[0]) }; }), Cfg.get('startView', 'overview'),
      function (v) { Cfg.set('startView', v); }), {}));
  box.appendChild(UI.item(tr("界面皮肤"), tr("v9 = 方案调色板（默认）；宿主 = 跟随 DSH 主题令牌（与宿主同色）。"),
    UI.select([{ value: 'v9', label: tr("v9 方案皮肤") }, { value: 'host', label: tr("宿主原生皮肤") }], Cfg.get('skin', 'v9'),
      function (v) { Cfg.set('skin', v); syncTheme(); appState.refreshView(); }), {}));
  /* v9 设置页的最后两行（此前面板未暴露——功能本就在：导航分组标题与页脚健康条都会渲染） */
  box.appendChild(UI.item(tr("导航分组显示"), tr("按语义显示分组标题（守藏 / 总览 / 记忆 / 运行 / 配置）。"),
    UI.toggle(Cfg.get('navGroups', true), function (v) { Cfg.set('navGroups', v); applyNavGroups(); }), {}));
  box.appendChild(UI.item(tr("页脚健康条"), tr("常驻显示记忆库状态与库路径。"),
    UI.toggle(Cfg.get('footBar', true), function (v) { Cfg.set('footBar', v); applyFootBar(); }), {}));

  /* 快捷键卡（原型：card 卡头「快捷键」+ 3 × .row：左 动作 / 作用域 + 右 键位 pill）
   * pill 走**中性色**（原型键位胶囊是灰底描边，非语义色）。 */
  var keys = UI.card(tr("快捷键"), { sub: tr("面板内可用") });
  keys.body.appendChild(ovCRow(tr("打开 / 关闭面板"), tr("全局"), [ovPill('Ctrl/⌘ + Shift + S', '', true)]));
  keys.body.appendChild(ovCRow(tr("切换日志面板"), tr("面板内"), [ovPill('Ctrl/⌘ + Shift + L', '', true)]));
  keys.body.appendChild(ovCRow(tr("关闭面板"), tr("面板内"), [ovPill('Esc', '', true)]));
  host.appendChild(keys.box);

  // 高级：配置原文（YAML）与根目录管理 —— 原「配置原文」一级视图下沉至此（P1-4）
  var adv = el('div');
  adv.appendChild(el('div', 'sc-desc', tr("配置原文（shoucang.config.yaml）保存后自动备份 .bak-*；根目录切换与新增在此。")));
  renderConfigRaw(adv);
  host = _tb.pane('advanced');
  host.appendChild(UI.collapsible(tr("高级 · 配置原文与根目录"), adv, { open: false }));

  /* 深度睡眠阈值（原深睡页「阈值」小节迁入）：与「配置原文」同性质 —— 都写 ~/.dsh/suite/scheduler.json、
   * 都需重载插件生效。v9 深睡页只保留**执行位**（状态分布卡头的按钮），配置出口收敛到本页一处。 */
  var dsAdv = el('div');
  dsAdv.appendChild(el('div', 'sc-desc', tr("写入 ~/.dsh/suite/scheduler.json；改后需重载插件生效。")));
  host.appendChild(UI.collapsible(tr("深度睡眠阈值"), dsAdv, { open: false, key: 'settings:dsadv' }));
  appState.api('/deepsleep/config').then(function (cfg) {
    var run = cfg.running || {};
    dsAdv.appendChild(makeToggle('enableDeepSleep', tr("启用深度睡眠自动归纳 enableDeepSleep"), tr("全部会话停滞 ≥ 阈值后自动提炼原则层（关闭 = 暂停，等于原「暂停到明天」）。"), !!run.enableDeepSleep, function (key, sw) {
      appState.api('/deepsleep/config', { method: 'POST', body: JSON.stringify({ enableDeepSleep: sw.checked }) })
        .then(function () { appState.statusFn(tr("✓ 已保存（重载生效）")); })
        .catch(function (e) { appState.failFn(e); sw.checked = !sw.checked; });
    }));
    dsAdv.appendChild(appState.dsNumber(tr("停滞阈值 deepSleepIdleMs"), tr("全部会话无活动持续满此毫秒数才触发（默认 3 小时）。"), Math.round((run.deepSleepIdleMs || 10800000) / 60000), 10, 720, tr("分钟"), function (m) { return m * 60000; }, 'deepSleepIdleMs'));
    dsAdv.appendChild(appState.dsNumber(tr("探测发起延迟 deepSleepProbeAfterMs"), tr("running 无事件持续此毫秒后发起输出增长探测（默认 3 小时）。"), Math.round((run.deepSleepProbeAfterMs || 10800000) / 60000), 10, 720, tr("分钟"), function (m) { return m * 60000; }, 'deepSleepProbeAfterMs'));
    dsAdv.appendChild(appState.dsNumber(tr("探测采样间隔 deepSleepProbeWindowMs"), tr("两轮采样之间的间隔（默认 60 秒）。"), Math.round((run.deepSleepProbeWindowMs || 60000) / 1000), 5, 600, tr("秒"), function (s) { return s * 1000; }, 'deepSleepProbeWindowMs'));
  }).catch(function (e) {
    dsAdv.appendChild(el('div', 'sc-mem-empty', tr("阈值加载失败：") + (e && e.message ? e.message : e)));
  });

  /* 恢复默认：原型该 pane 底部是 .acts（按钮 + 右侧说明文字），非裸按钮 */
  var acts = el('div', 'sc-acts');
  acts.appendChild(UI.button(tr("恢复默认设置"), function () {
    Cfg.reset(); applyDensity(); applyNavWidth(); applyNavGroups(); applyFootBar(); applyLogPanel(); restartPolling(); appState.refreshView();
    Log.info(tr('界面设置已恢复默认'));
  }, { confirm: tr("确认恢复全部界面设置为默认值？") }));
  acts.appendChild(el('span', 'sc-acts-note', tr("重置 10 项界面偏好并立即重绘（密度 / 导航宽度 / 日志面板 / 轮询全部重新应用）")));
  host.appendChild(acts);
}

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
    appState.api('/deepsleep/config', { method: 'POST', body: JSON.stringify(o) })
      .then(function () { appState.statusFn('✓ ' + name + ' = ' + range.value + ' ' + unit + tr("（重载生效）")); })
      .catch(appState.failFn);
  });
  wrap.appendChild(lab); wrap.appendChild(range);
  item.appendChild(info); item.appendChild(wrap);
  return item;
}

function applyDensity() {
  var m = document.getElementById('scpanl-modal');
  if (!m) return;
  m.classList.toggle('sc-density-compact', Cfg.get('density', 'comfortable') === 'compact');
}

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

function applyNavGroups() {
  var m = document.getElementById('scpanl-modal');
  if (m) m.classList.toggle('sc-nogroups', !Cfg.get('navGroups', true));
}

function applyFootBar() {
  var m = document.getElementById('scpanl-modal');
  if (m) m.classList.toggle('sc-nofoot', !Cfg.get('footBar', true));
}

function restartPolling() {
  if (appState.pollTimer) { clearInterval(appState.pollTimer); appState.pollTimer = null; }
  var ms = parseInt(Cfg.get('refreshMs', 60000), 10) || 0;
  if (ms <= 0) return;
  appState.pollTimer = setInterval(function () {
    // 仅在面板打开时轮询，关闭时不空转
    var mask = document.getElementById('scpanl-mask');
    if (!mask || !mask.classList.contains('open')) return;
    if (Cfg.get('autoRefresh', true)) appState.refreshView();
  }, ms);
}

function collectMetrics() {
  var m = {};
  function put(k, v) { m[k] = v; Store.patch('metrics', m); }
  appState.api('/mcl/status').then(function (r) {
    put(tr("MCL 状态"), (r && (r.mode || r.state)) || '—');
    if (r && r.familiarity != null) put(tr("熟悉度"), String(r.familiarity));
  }).catch(function () { put(tr("MCL 状态"), tr("获取失败")); });
  appState.api('/vector/status2').then(function (r) {
    put(tr("向量档"), r && r.present ? (String(r.rows || 0) + tr(" 行")) : tr("未启用"));
  }).catch(function () { put(tr("向量档"), tr("获取失败")); });
  appState.api('/inject/stats').then(function (r) {
    put(tr("注入统计"), r && typeof r === 'object' ? JSON.stringify(r).slice(0, 160) : String(r));
  }).catch(function () { put(tr("注入统计"), tr("获取失败")); });
  appState.api('/get_root').then(function (r) {
    put(tr("当前根"), (r && (r.root || r.path || r.active)) || '—');
  }).catch(function () { put(tr("当前根"), tr("获取失败")); });
}

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

export { makeToggle, renderViewSettings, dsNumber, applyDensity, applyNavWidth, applyLogPanel, applyNavGroups, applyFootBar, restartPolling, collectMetrics, syncTheme };
