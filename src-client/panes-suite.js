/**
 * panes-suite.js — 自 `body.js` 抽出的 pane 模块（UI1/U2 · 2026-09-15）
 *
 * **抽取方式**：`scripts/extract-pane.mjs`，用 **TypeScript AST** 取精确区间
 *   （花括号配平与缩进边界都试过、都会切错 —— 见该脚本头注）。
 *
 * **取依赖**：从 `appState` 取（入口注入），不 import 全局服务模块。
 */
import { UI } from './ui-kit.js'
import { el, svg, ICONS } from './dom.js'
import { Derive, fmtTime } from './derive.js'
import { appState } from './app-state.js'
import { ovCRow, ovPill } from './panes-overview.js'
import { renderCognitionReport } from './panes-memory-detail.js'

function renderSuite(view, data) {
  view.textContent = '';
  UI.pageHead('插件集合', 'suite 装配矩阵由 targets.ts 的 suiteAssemblyMatrix() 单一实现；面板与 scheduler 共用。', {
    routes: ['/suite'], routesInline: true,
    actions: [UI.button('重新装配', function () { appState.refreshView(); appState.statusFn('已按注入器 registry + profiles 重新核装配'); }, { title: '重取装配矩阵（/suite）' })]
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
  appState.api('/memory/overview').then(function (r) {
    fill((r && r.indexes) || null);
    /* notes/ 行：v9 表格有这一行（无容量门 ⇒「不限 / N 条 / 便签」）；真实文件数取自 notes 清单 */
    var n = Derive.count(r && r.notes);
    if (n) addRow('notes/', n + ' 条', '便签', true);
  }).catch(function () { });
  /* archive/ 行：已用数取自 /cognition/report 的真实归档清单；端点不可用 ⇒ 不出行（宁缺勿造） */
  appState.api('/cognition/report').then(function (r) {
    var ar = (r && r.archive) || [];
    if (!r || !r.ok || !Derive.has(ar)) return;
    addRow('archive/', ar.length + ' 条', '归档', true);
  }).catch(function () { });
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
  appState.api('/deepsleep').then(function (r) {
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
          appState.statusFn('深度睡眠归纳中…');
          return appState.api('/deepsleep/trigger', { method: 'POST', body: '{}' })
            .then(function (rr) { appState.statusFn(rr.ok ? '✓ 已触发归纳（见日志）' : '⚠ 触发失败：' + (rr.error || '')); });
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
      return appState.api('/selfcheck/run', { method: 'POST', body: '{}' })
        .then(function (rr) { appState.statusFn('✓ 自检完成：' + (rr.verdict || '?')); renderDeepSleep(view); });
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
    appState.api('/selfcheck').then(function (s) {
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

export { renderSuite, renderDeepSleep };
