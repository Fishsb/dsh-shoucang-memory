/**
 * panes-memory.js — 自 `body.js` 抽出的 pane 模块（UI1/U2 · 2026-09-15）
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
import { Log, Fold } from './state.js'

function openMemoryNote(pointer, autoSection, returnRender) {
  if (!pointer) { appState.statusFn('该条目无 notes 跳转目标'); return; }
  var rel = String(pointer).split('§')[0].trim();
  if (!/^notes\/[a-z]+\.md$/.test(rel)) { appState.statusFn('指针目标非 notes 白名单：' + pointer); return; }
  appState.memoryViewScroll = appState.refs.view.scrollTop; // 记录进入前滚动位置（返回时恢复）
  appState.noteReturnRender = returnRender || null; // 来源板块上下文（返回时回原板块，默认记忆板块）
  appState.api('/memory/sections?rel=' + encodeURIComponent(rel)).then(function (r) {
    if (!r || !r.present) { appState.statusFn((r && r.error) || '小节不可用'); return; }
    Fold.clear('note:'); // 换笔记 ⇒ 清掉上一篇的小节开合态，避免 key 无界增长与旧态串味
    renderNoteSections(appState.refs.view, r);
    if (autoSection) {
      /* 旧实现用 `h.click()` 模拟点击来展开——依赖 DOM 结构（nextElementSibling 恰是 body）
         且会连带触发一次真实 toggle（若该节点本就展开则反而被收起）。
         现直接对单一数据源置位，由各自的 paint 订阅同步 DOM，幂等且不碰结构。 */
      appState.refs.view.querySelectorAll('[data-fold-key]').forEach(function (h) {
        if ((h.textContent || '').indexOf(autoSection) !== -1) Fold.set(h.getAttribute('data-fold-key'), true);
      });
    }
  }).catch(appState.failFn);
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

function renderPersona(view, data) {
  view.textContent = '';
  UI.pageHead('画像', 'USER.md（用户画像）与 AGENT.md（Agent 画像）的唯一展示位。', {
    routes: ['/memory/overview'],
    actions: [el('span', 'sc-proto-note', '压缩执行位：下方 USER.md 卡')]
  });
  if (!data || !data.present || !Derive.has(data.indexes)) {
    appState.statusFn((data && data.error) || '记忆库画像不可用');
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
        appState.statusFn('画像压缩（深度睡眠归纳）触发中…');
        return appState.api('/deepsleep/trigger', { method: 'POST', body: '{}' })
          .then(function (rr) { appState.statusFn(rr && rr.ok ? '✓ 已触发深睡归纳（高分重复条目将折叠为索引项）' : '⚠ 触发失败：' + ((rr && rr.error) || '')); });
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
  appState.statusFn('画像 · ' + totalRows + ' 条指针');
}

export { openMemoryNote, makeMemoryPointerRow, idxHue, idxPill, TAG_ORDER, renderIndexRows, renderPersona };
