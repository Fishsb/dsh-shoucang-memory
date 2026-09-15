/**
 * panes-overview.js — 自 `body.js` 抽出的 pane 模块（UI1/U2 · 2026-09-15）
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

function ovPill(text, kind, mono) {
  return el('span', 'sc-pill' + (kind ? ' ' + kind : '') + (mono ? ' mono' : ''), text);
}

function ovAgo(ts) {
  var t = typeof ts === 'number' ? ts : (ts ? Date.parse(String(ts)) : 0);
  if (!t || isNaN(t)) return '';
  var m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  if (m < 1440) return Math.round(m / 60) + ' 小时前';
  return Math.round(m / 1440) + ' 天前';
}

function ovMorningCard() {
  var card = UI.card('晨起摘要', { right: [el('span', 'sc-src', '/memory/overview · delta / weekDiff')] });
  var box = el('div');
  box.appendChild(el('div', 'sc-desc', '读取中…'));
  card.body.appendChild(box);
  appState.api('/memory/overview').then(function (d) {
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

function ovTimelineCard() {
  var card = UI.card('最近动态', { right: [ovPill('最近 24 小时')] });
  var tl = el('div', 'sc-tl');
  tl.appendChild(el('div', 'sc-desc', '读取中…'));
  card.body.appendChild(tl);
  Promise.all([
    appState.api('/memory/overview').catch(function () { return {}; }),
    appState.api('/deepsleep').catch(function () { return {}; })
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

function ovCriteriaCard() {
  var card = UI.card('判据与重排门', {
    sub: '现状已有 · 仅改归属',
    right: [el('span', 'sc-src', 'GET /criteria')]
  });
  var mini = el('div', 'sc-mini');
  var note = el('div', 'sc-mem-stat-rule', '读取中…');
  card.body.appendChild(mini); card.body.appendChild(note);
  appState.api('/criteria').then(function (c) {
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

function ovQuickCard() {
  var card = UI.card('快捷操作');
  var row = el('div', 'sc-toolbar');
  row.style.flexWrap = 'wrap';
  var res = el('div', 'sc-desc', '');
  row.appendChild(UI.button('测试嵌入连通', function () {
    res.textContent = '读取配置…';
    return appState.api('/embed/config').then(function (c) {
      /* ⚠ 字段口径（2026-09-14 实测两处错）：① 原读 `c.global`（端点返回 `persisted`/`effective`，**无 global**）
       *   ② 有效载荷用的是**运行态形状** `baseUrl`（与 `/vector/status2` 的 running 同源），不是 `embedBaseUrl`
       *   ⇒ 两次都取到空值 ⇒ 恒报"未配置"。现读 `effective.baseUrl` 并如实标注来源。 */
      var g = (c && c.effective) || (c && c.persisted) || {};
      var baseUrl = String(g.baseUrl || g.embedBaseUrl || '').trim();
      if (!baseUrl) { res.textContent = '✗ 未配置 embedBaseUrl（且缺省不可用）'; return; }
      var dflt = (c && c.isDefault) || {};
      var src = dflt.embedBaseUrl ? '（缺省在用）' : '（已落盘）';
      res.textContent = '测试中… ' + baseUrl + src;
      return appState.apiCtx('/embed/test', {
        method: 'POST', body: JSON.stringify({ baseUrl: baseUrl, apiKey: String(g.apiKey || g.embedApiKey || '').trim() })
      }, '嵌入连通性').then(function (r) {
        res.textContent = (r && r.error) ? ('✗ ' + r.error + ' · ' + baseUrl + src) : ('✓ 可达 · ' + Derive.count(r && r.models) + ' 个模型 · ' + baseUrl + src);
      });
    }).catch(function (e) { res.textContent = '✗ ' + e.message; });
  }, { async: true, busyText: '测试中…', okText: '嵌入连通性测试完成', title: 'POST /embed/test —— 验证当前 embedding 配置是否可用' }));
  row.appendChild(UI.button('根目录引导', function () {
    res.textContent = '执行中…';
    return appState.apiCtx('/root/bootstrap', { method: 'POST', body: JSON.stringify({}) }, '根目录引导')
      .then(function (r) { res.textContent = '✓ ' + JSON.stringify(r).slice(0, 200); })
      .catch(function (e) { res.textContent = '✗ ' + e.message; });
  }, { async: true, busyText: '执行中…', okText: '根目录引导完成', confirm: '执行根目录引导会尝试创建缺失的目录结构，确认继续？' }));
  row.appendChild(UI.button('成熟度扫描', function () {
    res.textContent = '扫描中…';
    return appState.apiCtx('/maturation/scan', { method: 'POST', body: JSON.stringify({}) }, '成熟度扫描')
      .then(function (r) {
        res.textContent = (r && r.active) ? '✓ 扫描完成（分档已写入 audit/maturation.jsonl）' : ('⚠ ' + ((r && r.error) || '未生成'));
      })
      .catch(function (e) { res.textContent = '✗ ' + e.message; });
  }, { async: true, busyText: '扫描中…', okText: '成熟度扫描完成', title: 'POST /maturation/scan —— 重算库内小节成熟度并覆盖台账（只写台账，不改记忆内容）' }));
  row.appendChild(UI.button('账本对账', function () {
    res.textContent = '对账中…';
    return appState.apiCtx('/reconcile', { method: 'POST', body: JSON.stringify({}) }, '账本对账')
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
  ops.appendChild(appState.opCard('立即蒸馏', '遍历根会话蒸馏，携带 pending 候选回流；等价于等会话空闲自动触发。', 'POST /distill/run', '蒸馏', function () {
    return appState.apiCtx('/distill/run', { method: 'POST', body: JSON.stringify({}) }, '蒸馏').then(function (r) {
      appState.statusFn(r && r.ok ? '✓ ' + (r.note || '蒸馏完成') : '⚠ ' + ((r && r.note) || '未触发：根会话活跃中会跳过，等闲置自动跑'));
      appState.refreshView();
    });
  }, { icon: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1', busyText: '蒸馏中…', okText: '蒸馏完成' }));
  ops.appendChild(appState.opCard('立即进入深睡', '离线回想，提炼「[原则]/[路径]」并做结构整理与归档（禁直删）。预计 1–3 分钟。', 'POST /deepsleep/trigger', '深睡', function () {
    return appState.apiCtx('/deepsleep/trigger', { method: 'POST', body: JSON.stringify({}) }, '深睡').then(function () {
      appState.statusFn('✓ 已触发深睡归纳（后台执行，回执见「深度睡眠」）');
    });
  }, { icon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', confirm: '立即触发一次深度睡眠归纳？将调用归纳子代理回顾当天记忆痕迹。' }));
  ops.appendChild(appState.opCard('运行自检', '校验判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账六项；超时上限 180s。', 'POST /selfcheck/run', '自检', function () {
    return appState.apiCtx('/selfcheck/run', { method: 'POST', body: JSON.stringify({}) }, '自检').then(function () {
      appState.statusFn('✓ 自检已执行，结果见「运行观测」');
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

  appState.api('/memory/overview').then(function (r) {
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
      if (appState.refs.navHealth) appState.refs.navHealth(pct === null ? '正常' : (Derive.capKind(pct) !== 'ended' ? '水位偏高' : '正常'), pct === null ? 'ended' : Derive.capKind(pct));
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
    if (Derive.has(warn)) setAlert(warn.length + ' 项待处理', warn.join('；'), '前往处理', function () { appState.show('memory'); });
    else setAlert('');
  }).catch(appState.failFn);

  appState.api('/mcl/status').then(function (m) {
    bMcl.setText('认知环 ' + ((m && m.active) ? ('快' + (m.fast || 0) + '/慢' + (m.slow || 0)) : '未装配')).setKind((m && m.active) ? 'ended' : 'stalled');
  }).catch(function () { bMcl.setText('认知环 读取失败').setKind('stalled'); });

  appState.api('/criteria').then(function (c) {
    /* v9 标准：原型徽章是「标签 · 状态词」（数值已在 KPI 卡里给，徽章不重复堆数字）。 */
    bCrit.setText('判据台账 · ' + ((c && c.active) ? '已就绪' : '不可读')).setKind((c && c.active) ? 'ended' : 'stalled');
    var bg = (c || {}).bankGit || {};
    bGit.setText('库版本 · ' + ((bg.commits || 0) ? '已启用' : '未初始化')).setKind((bg.commits || 0) ? 'ended' : 'stalled');
  }).catch(function () { bGit.setText('库版本 读取失败'); });

  appState.api('/deepsleep').then(function (d) {
    var st = d || {};
    var mode = st.running ? '深睡整理中' : (st.ended || st.ended === 0 ? '浅睡' : '—');
    kSleep.set(mode, (st.idleMs ? '空闲 ' + Math.round(st.idleMs / 60000) + ' 分钟 · ' : '') + (st.nextEligibleAt ? '下次可睡 ' + fmtTime(st.nextEligibleAt) : '按水位触发'), true);
  }).catch(function () { kSleep.set('—', '读取失败', true); });

  /* v9 标准（原型 DOM 实测）：系统状态卡是 **4 行**（当前根目录 / MCL 认知环 / 注入统计 / 嵌入服务），
   *   每行 title + desc + 右侧 `.pill`。上一轮曾据**方案文档正文**「该卡只有一行」删掉 3 行 ——
   *   文档说法与 DOM 不符，本轮恢复。四路取数用 Promise.all 一次性渲染，避免异步先后决定行序。 */
  Promise.all([
    appState.api('/get_root').catch(function () { return {}; }),
    appState.api('/mcl/status').catch(function () { return {}; }),
    appState.api('/inject/stats').catch(function () { return {}; }),
    appState.api('/vector/status2').catch(function () { return {}; })
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

export { ovCRow, ovPill, ovAgo, ovMorningCard, ovTimelineCard, ovCriteriaCard, ovQuickCard, renderViewOverview };
