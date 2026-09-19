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
/* i18n（2026-09-17）：标签显示层映射。
 * ⚠ 本模块的**不变式**（`check-i18n-keys` 断言 G 用 AST 守）：
 *   `idxHue()` / `TAG_ORDER.indexOf()` / `tagCount` 三处**必须吃原始 tag**——
 *   它们决定色相 / 排序 / 统计，一旦经 tagLabel 回流，zh 态色相会半坏且**不可观测**。
 *   显示名只用于**可见文本**（idxPill 的文本、统计词的词面）。 */
import { tagLabel } from './tag-label.js'
import { lang, tr } from './i18n.js'

function openMemoryNote(pointer, autoSection, returnRender) {
  if (!pointer) { appState.statusFn(tr("该条目无 notes 跳转目标")); return; }
  var rel = String(pointer).split('§')[0].trim();
  if (!/^notes\/[a-z]+\.md$/.test(rel)) { appState.statusFn(tr("指针目标非 notes 白名单：") + pointer); return; }
  appState.memoryViewScroll = appState.refs.view.scrollTop; // 记录进入前滚动位置（返回时恢复）
  appState.noteReturnRender = returnRender || null; // 来源板块上下文（返回时回原板块，默认记忆板块）
  appState.api('/memory/sections?rel=' + encodeURIComponent(rel)).then(function (r) {
    if (!r || !r.present) { appState.statusFn((r && r.error) || tr("小节不可用")); return; }
    Fold.clear('note:'); // 换笔记 ⇒ 清掉上一篇的小节开合态，避免 key 无界增长与旧态串味
    /* 接缝④（2026-09-17 阶段 5）：**破环** —— 本模块原 import 自 `panes-memory-detail.js`，
     *  而后者又 import 本模块的 4 个符号 ⇒ 双向环（`audit-architecture --dir src-client` 报 1 处）。
     *  修法：改用 appState 句柄（本仓对跨模块句柄的**既有机制** —— `opCard` / `applyLogPanel` /
     *  `renderRunExtras` 同法），由 `body.js`（同时 import 两侧）注入 ⇒ 依赖变**单向**：detail → memory。
     *  句柄的声明与注入由 `check-appstate-contract` 四方对账守。 */
    appState.renderNoteSections(appState.refs.view, r);
    if (autoSection) locateSection(appState.refs.view, autoSection, r);
  }).catch(appState.failFn);
}

/**
 * 定位小节（册二 · 决议 D1 终态：**前端零匹配逻辑**）。
 *
 * 判因（实测，根因 C1「同一语义多份实现 + 门禁只守库侧」）：
 *   原实现用 `head.textContent.indexOf(autoSection) !== -1` 做**子串包含**匹配，与库侧权威
 *   三态（归一核心名 + 双向包含 + 多命中 ⇒ ambiguous，`section-ref.ts:170-192`）不同源
 *   ⇒ 实测 623 行索引行中**多命中 209 处（33.8%）**：点一次把**所有**含该词的节点都置位展开，
 *   且全仓 `scrollIntoView` **0 命中** ⇒ 用户看到「点了没反应」。
 *
 * 现语义（**前端不做任何名字判定**）：后端 `/memory/sections` 已为每条 `§指针` 下发
 *   `pointerIndex[spec] = { state, foldKey, title, cands? }`（state ∈ exists|ambiguous|missing|partial，
 *   由库内唯一实现 `section-ref` 解析）。前端**只按 state 分支渲染**：
 *   · `exists`   ⇒ 用后端给的 `foldKey` 精确置位 + 滚动入视口（唯一，无歧义）
 *   · `ambiguous`⇒ **不展开**，列出后端给的候选名（有歧义就不猜）
 *   · `partial`  ⇒ 展开后端回落的父节（读侧可解析到的最深段）
 *   · `missing`/无记录 ⇒ 如实告知，不展开
 *   ⚠ 此处**不得再出现** `indexOf`/归一/逐段收窄等任何匹配代码——那正是被删掉的第二份实现。
 *
 * @param view 渲染容器
 * @param autoSection 指针里的 § 段（后端 `pointerIndex` 的键）
 * @param data 后端响应（含 `pointerIndex`）
 */
function locateSection(view, autoSection, data) {
  var raw = String(autoSection || '').trim();
  if (!raw) return;
  var idx = (data && data.pointerIndex) || {};
  var ent = idx[raw] || null;
  var heads = view.querySelectorAll('[data-fold-key]');
  var setAndScroll = function (foldKey) {
    if (!foldKey) return false;
    Fold.set(foldKey, true);
    var target = null;
    Array.prototype.forEach.call(heads, function (h) { if (h.getAttribute('data-fold-key') === foldKey) target = h; });
    if (!target) return false;
    /* 滚动入视口（原实现缺失 ⇒「展开了但看不见」= 真实失败形态）。
     * 展开由 Fold 单一数据源驱动，DOM 同步可能在本帧之后 ⇒ 下一帧再滚动。 */
    var scroll = function () {
      try { if (target.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* 老环境无 options 支持则忽略 */ }
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(scroll); else scroll();
    return true;
  };
  if (!ent) { appState.statusFn(tr("小节未找到（指针锚：") + raw + tr("）——已显示整篇，未自动展开")); return; }
  if (ent.resolveState === 'exists' || ent.resolveState === 'partial') {
    if (setAndScroll(ent.foldKey)) return;
    appState.statusFn(tr("小节未找到（指针锚：") + raw + tr("）——已显示整篇，未自动展开"));
    return;
  }
  if (ent.resolveState === 'ambiguous') {
    /* 多命中（真实歧义）：**不展开任何一个** —— 展开任何一个都会误导「这就是你要找的」。
     * 用户可据此把库内指针写得更精确（父/子全路径），这正是本册要暴露的信息。 */
    var names = Derive.has(ent.cands) ? ent.cands.slice(0, 4).join(' / ') : '';
    appState.statusFn(tr("该指针命中 ") + Derive.count(ent.cands) + tr(" 个同名/包含小节，无法唯一定位（未展开）：") + names);
    return;
  }
  appState.statusFn(tr("小节未找到（指针锚：") + raw + tr("）——已显示整篇，未自动展开"));
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
  /* 入参**永远是原始 tag**（`check-i18n-keys` 断言 G 用 AST 守）：
   * 色相按库内数据稳定 ⇒ 切语言不换色，保住空间记忆。 */
  var map = { env: 180, tool: 212, flow: 262, lesson: 28, release: 320, 身份: 330, 偏好: 348, 习惯: 12, 硬件: 200, 环境: 190, 演化: 150, 经验: 45 };
  return map[tag] != null ? map[tag] : 254;
}

/**
 * 索引标签胶囊。
 *
 * **显示层映射**（用户裁决：方案 B「全部纳入中英文切换，统一标准化」）：
 *   库内仍是原始键，只在渲染这一刻映射成显示名；中英两态都用显示名。
 *   zh 态 `env` → 「环境」，与原生 `环境` 标签显示同名 —— **同名即同名，不附原始键**（撞名时不加后缀，
 *   理由是用户两次实测反馈「标签重复」）。原始键在 `title`/`aria-label` 里可达。
 *
 * @param tag 原始 tag（**数据侧身份**：色相 / title / aria 都用它）
 *
 * ⚠ **可见文本只有映射名，不附原始键**（用户两次实测：「索引和小节显示的标签重复了」/
 *   「展开全部又是双标签」）。判因：曾按 1:N 撞名给胶囊拼「显示名 · 原始键」后缀
 *   （如 `环境 · env`）—— 折叠态 tag 少、不撞名 ⇒ 正常；**展开全部后 212 行里 `env` 与 `环境`
 *   同时出现** ⇒ 触发撞名 ⇒ 每行都多一截 `· env`，看上去就是「双标签」。
 *   原始键**仍全程保留**在 `title` 与 `aria-label`（悬停 / 读屏可达），不靠可见文本承载。
 */
function idxPill(tag) {
  var h = idxHue(tag);
  var name = tagLabel(tag, lang(), function (miss) {
    // 映射 miss 时开发侧可见（与 renderIndexRows 的数据退化告警同口径：异常可见而不静默）
    try { Log.warn(tr('标签未登记于映射表：') + miss + tr('（已按原样显示；请同步 tag-label.js）')); } catch (e) { /* noop */ }
  });
  // 撞名消解：仅当同列表内两个不同原始 tag 映射到同一显示名时，附原始键
  var text = name;
  var pill = el('span', 'sc-idx-tag hued', text);
  // 只传色相，配色算法在 CSS（.sc-idx-tag.hued）—— 旧实现在 JS 里拼整条颜色，样式散在两处
  pill.style.setProperty('--sc-tag-h', String(h));
  // 诊断位保持**原始 tag**（对得上库内数据）；aria-label 让键盘/读屏也可达（旧实现只有 hover title）
  pill.title = tag || '';
  pill.setAttribute('aria-label', (tag || '') + (name !== tag ? ' (' + name + ')' : ''));
  return pill;
}

/* 索引行排序键（**原始 tag**，不变式：必须吃原始键，见本文件头注）。
 * 册四（2026-09-19）：**补中文原始键别名** —— 库内标签是两套键空间共存
 *   （`env`/`环境`、`lesson`/`教训`，实测 lesson 232 / 教训 91 / env 24 / 环境 91）。
 *   原表只认 7 个英文键 ⇒ **中文键全部落到 `indexOf === -1` 的「末尾组」**，
 *   实测未覆盖 288 条（教训 91 + 环境 91 + 原则 79 + 路径 17 + 偏好 3 + 经验 2 + 习惯 2 + 身份 1 + 硬件 1）。
 *   现按语义归入同族（`教训`→与 `lesson` 同组、`环境`→与 `env` 同组），其余中文键排在英文键之后、
 *   保持稳定书写序（不改它们彼此的相对顺序，避免打乱用户的检索直觉）。 */
var TAG_ORDER = ['env', '环境', 'tool', 'flow', 'lesson', '教训', 'release', 'user', 'agent',
  '原则', '路径', '经验', '身份', '使命', '边界', '性格', '认知', '演化', '偏好', '习惯', '硬件'];

/* 中文**显示名**排序表（供统计串归并后排序用）。
 * 与 TAG_ORDER 同序：env/环境 → tool → flow → lesson/教训 → release → user → agent → 其余中文键。 */
var TAG_ORDER_ZH = ['环境', '工具', '流程', '教训', '发布', '用户', '智能体',
  '原则', '路径', '经验', '身份', '使命', '边界', '性格', '认知', '演化', '偏好', '习惯', '硬件'];

function renderIndexRows(container, lines, returnRender) {
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
    try { Log.warn(tr('renderIndexRows：跳过 ') + bad + tr(' 条格式异常索引行（期望 { tag, subject, pointer }）')); } catch (e) { /* Log 未就绪时不阻断渲染 */ }
    container.appendChild(el('div', 'sc-mem-empty', '⚠ ' + bad + tr(" 条索引行数据格式异常已跳过（期望 { tag, subject, pointer }）")));
  }
  arr.sort(function (a, b) {
    var ia = TAG_ORDER.indexOf(String(a.tag || '').toLowerCase()); if (ia === -1) ia = TAG_ORDER.length;
    var ib = TAG_ORDER.indexOf(String(b.tag || '').toLowerCase()); if (ib === -1) ib = TAG_ORDER.length;
    return ia - ib;
  });
  /* 接缝①（2026-09-17 阶段 2）：**行的形状只有一种** ——
   *   组头 = `[标签胶囊] N 条` · 行 = `主文本 … 指针`。
   *
   * 判因（两处用户实测症状，同根）：
   *   ① 「标签位置前后不一」：原实现按布尔 `withTagCount` 分叉 ——
   *      记忆库页把标签放**右**列、画像页放**左**列，同一类索引行两页相反。
   *   ② 「每行重复 N 条」：`tagCount` 是**整个渲染集合**内该 tag 的总数，
   *      却在**每一行**渲染 ⇒ 展开 212 行后 22 个 env 行每行都写「22 条」。
   *
   * 修法：**删掉布尔**（调用方不再分叉），标签统一在**组头**出现一次，
   *   行内只留主文本与指针 ⇒ 两页同形，且「N 条」不再逐行重复。
   *   `.sc-idx-tag.hued` 的色相保留在组头（空间记忆是硬需求）。 */
  var tagCount = {};
  arr.forEach(function (l) { var t = String(l.tag || '').trim(); if (t) tagCount[t] = (tagCount[t] || 0) + 1; });
  var lastTag = null;
  arr.forEach(function (ln) {
    var t = String(ln.tag || '').trim();
    if (t !== lastTag) {
      lastTag = t;
      var head = el('div', 'sc-idx-group');
      head.appendChild(idxPill(ln.tag));
      head.appendChild(el('span', 'sc-idx-group-n', Derive.num(tagCount[t] || 1) + tr(' 条')));
      container.appendChild(head);
    }
    var row = el('div', 'sc-idx-row');
    row.appendChild(el('span', 'sc-idx-subject', ln.subject || ''));
    if (ln.pointer) row.appendChild(el('span', 'sc-idx-pointer', ln.pointer));
    var ptr = ln.pointer, sec = String(ln.pointer || '').split('§')[1] || '';
    // R3：索引行只读（指针，编辑会与 notes 详情错位）——点击进详情小节，编辑在详情页做
    row.addEventListener('click', function () { openMemoryNote(ptr, sec.trim() || null, returnRender); });
    row.title = (ln.subject || '') + (ln.pointer ? ' → ' + ln.pointer : '') + tr(' · 点击进详情');
    container.appendChild(row);
  });
}

function renderPersona(view, data) {
  view.textContent = '';
  UI.pageHead(tr("画像"), tr("USER.md（用户画像）与 AGENT.md（Agent 画像）的唯一展示位。"), {
    routes: ['/memory/overview'],
    actions: [el('span', 'sc-proto-note', tr("压缩执行位：下方 USER.md 卡"))]
  });
  if (!data || !data.present || !Derive.has(data.indexes)) {
    appState.statusFn((data && data.error) || tr("记忆库画像不可用"));
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
    grid.appendChild(UI.kpi(f.name.replace('.md', '') + tr(" 容量"), {
      val: pct === null ? Derive.num(f.chars || 0) : pct + '%',
      sub: Derive.num(f.chars || 0) + ' / ' + Derive.num(f.cap || '—') + tr(" 字符 · ") + Derive.count(f.lines) + tr(" 条画像"),
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
    /* 册四（2026-09-19）：统计串**必须走 tagLabel**（显示层唯一映射点）。
     * 判因（实测）：库内标签是**两套键空间**共存——`lesson` 232 条 / `教训` 91 条、
     *   `env` 24 条 / `环境` 91 条（`tag-label.js:22-23` 已记 1:N 撞名）。
     *   本处原直接拼**原始键**（`k + ' ' + n`）⇒ 同一张卡上同时出现 `lesson` 与 `教训`，
     *   而胶囊（`idxPill:88`）已映射成中文 ⇒ **同一页两套词面**（根因 C4）。
     * 现：先按**显示名**归并计数（`env`+`环境` 合成一档），再按 TAG_ORDER 排序后输出。
     * ⚠ 归并只发生在**显示层**：色相（idxHue）/排序键/统计键仍吃原始 tag（AV 不变式，见本文件头注）。 */
    var byTag = {};
    (f.lines || []).forEach(function (ln) {
      var t = String((ln && ln.tag) || '').trim();
      if (!t) return;
      var disp = tagLabel(t, lang());
      byTag[disp] = (byTag[disp] || 0) + 1;
    });
    var parts = Object.keys(byTag)
      .sort(function (a, b) {
        var ia = TAG_ORDER_ZH.indexOf(a); if (ia === -1) ia = TAG_ORDER_ZH.length;
        var ib = TAG_ORDER_ZH.indexOf(b); if (ib === -1) ib = TAG_ORDER_ZH.length;
        return ia - ib || a.localeCompare(b);
      })
      .map(function (k) { return k + ' ' + byTag[k]; });
    var pct = f.cap ? Math.round((f.chars || 0) / f.cap * 100) : null;
    var tip = pct !== null && pct >= 80
      ? tr("容量 ") + Derive.num(f.chars) + ' / ' + Derive.num(f.cap) + tr(" —— 超过 80% 时在此显示一行提示；红线由 write_gate 写入时强制。")
      : (f.cap
        ? tr("容量 ") + Derive.num(f.chars) + ' / ' + Derive.num(f.cap) + tr(" —— [原则] / [路径] 行数在「总览 · 本月成长」按月跟踪。")
        : tr("暂无容量门。"));
    var s = el('div', 'sc-mem-stat');
    s.appendChild(el('div', 'sc-mem-stat-label', f.name.replace('.md', '') + tr(" 构成")));
    s.appendChild(el('div', 'sc-mem-stat-value', Derive.count(f.lines) + tr(" 条")));
    s.appendChild(el('div', 'sc-mem-stat-sub', Derive.has(parts) ? parts.join(' · ') : tr("（暂无标签行）")));
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
  var matCard = UI.card(tr("成熟度分布"), {
    sub: tr("v4 新增 · 按 0.2 分档统计库内小节数"),
    right: [el('span', 'sc-src', '/memory/overview')]
  });
  var histWrap = el('div', 'sc-hist-wrap');
  var hist = el('div', 'sc-hist');
  ['0–.2', '.2–.4', '.4–.6', '.6–.8', '.8–1'].forEach(function (b, bi) {
    var n = Number(matBins[bi] || 0);
    var bar = el('i');
    if (n > 0) bar.style.height = Math.round(n / matMax * 100) + '%';
    bar.title = b + '：' + n + tr(" 节");
    bar.appendChild(el('b', null, b));
    hist.appendChild(bar);
  });
  histWrap.appendChild(hist);
  matCard.body.appendChild(histWrap);
  matCard.body.appendChild(el('div', 'sc-mem-stat-rule', matTotal
    ? tr("共 ") + matTotal + tr(" 节：A ≥ ") + matGate + tr("（升格线）才具备升格为 [原则] / [路径] 的稳定条件。")
      + tr("口径：库内 audit/maturation.jsonl 按 A 值 0.2 分档的小节数。")
    : tr("成熟度台账为空：库内 audit/maturation.jsonl 尚无记录（跑一次成熟度扫描即写入）。")));
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
      right.push(UI.button(tr("压缩画像"), function () {
        appState.statusFn(tr("画像压缩（深度睡眠归纳）触发中…"));
        return appState.api('/deepsleep/trigger', { method: 'POST', body: '{}' })
          .then(function (rr) { appState.statusFn(rr && rr.ok ? tr("✓ 已触发深睡归纳（高分重复条目将折叠为索引项）") : tr("⚠ 触发失败：") + ((rr && rr.error) || '')); });
      }, {
        async: true, busyText: tr("压缩中…"), okText: tr("已触发归纳"),
        title: tr("画像压缩：触发一次深度睡眠归纳，由树整理把高分重复条目折叠为索引项（无独立端点）"),
        confirm: tr("「压缩画像」= 触发一次深度睡眠归纳，由深睡树整理折叠高分重复条目。立即执行？")
      }));
    }
    var c = UI.card(title, {
      sub: Derive.count(f.lines) + tr(" 条"),
      right: right
    });
    view.appendChild(c.box);
    if (!Derive.has(f.lines)) { c.body.appendChild(el('div', 'sc-mem-empty', tr("（暂无指针行）"))); return; }
    var list = el('div', 'sc-idx-list');
    renderIndexRows(list, f.lines, renderPersona); // 画像来源：返回时回画像板块；索引行只读，编辑进详情
    c.body.appendChild(list);
  });
  /* v9 画面末尾的**注脚**（.bp-note）：说明口径与依据，此前面板无此块 */
  view.appendChild(el('div', 'sc-note', tr("注：容量百分比与容量条按 write_gate 的实际上限计算；指针行点击可直达 notes/ 对应小节。")));
  appState.statusFn(tr("画像 · ") + totalRows + tr(" 条指针"));
}

export { openMemoryNote, makeMemoryPointerRow, idxHue, idxPill, TAG_ORDER, renderIndexRows, renderPersona };
