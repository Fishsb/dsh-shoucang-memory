/**
 * panes-memory-detail.js — 自 `body.js` 抽出的 pane 模块（UI1/U2 · 2026-09-15）
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
import { Bus, Fold } from './state.js'
/* UI1/U2：本模块用到**同领域**的 pane 导出（记忆索引行 / 指针行构造）。
 *  依赖方向单向：memory-detail → memory（无环）。 */
import { renderIndexRows, makeMemoryPointerRow, openMemoryNote, renderPersona } from './panes-memory.js'
import { ovCRow, ovPill } from './panes-overview.js'
import { lang, tr } from './i18n.js'

/* UI1/U2（2026-09-15）：此处原有 `sparkline()`（迷你趋势图，25 行）—— 经核查是**死代码**：
 *   迁移前的 `body.js` 里它**只有定义、从无调用**（全仓 grep 零调用点）。
 *   此前未被发现，是因为 `audit-css-usage` 用**子串包含**判"是否被使用"，
 *   而产物里恰好存在 `sparkline` 这个**函数名** ⇒ 它的类名 `.sc-spark` 被误判为"在用"。
 *   迁到本模块后无人 import ⇒ esbuild **tree-shaking 掉函数名** ⇒ 真死规则暴露（门报 `.sc-spark`）。
 *   ⇒ 处置是**删掉函数 + 删掉 4 条 `.sc-spark` 规则**（而非加白名单掩盖）。 */

function renderCognitionReport(view, mode) {
  appState.api('/cognition/report').then(function (r) {
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
      group(tr("本轮产出回执") + (last && last.at ? ' · ' + fmtTime(last.at) : ''));
      if (!last) { box.appendChild(el('div', 'sc-mem-empty', tr("（尚无深睡记录）"))); }
      else {
        var kpiRow = function (defs) {
          var g = el('div', 'sc-kpis');
          defs.forEach(function (d) { g.appendChild(UI.kpi(d[0], { val: String(d[1] == null ? 0 : d[1]), sub: d[2], plain: true }).box); });
          return g;
        };
        box.appendChild(kpiRow([[tr("新增原则"), last.added, 'added'], [tr("替换原则"), last.replaced, 'replaced'], [tr("画像更新"), last.profiles, 'profiles']]));
        box.appendChild(kpiRow([[tr("指针更新"), last.pointers, 'pointers'], [tr("树操作"), last.tree, 'tree'],
          [tr("归档"), last.forgetArchived, 'forgetArchived'], [tr("保留"), last.forgetKept, 'forgetKept']]));
        if (last.stop && last.stop !== 'completed') {
          box.appendChild(el('div', 'sc-ds-alert', tr("⚠ 上次未完成（stop=") + last.stop + tr("）——按「深睡水位护栏」水位已回滚，同批痕迹下轮重试")));
        }
      }
      /* 下轮材料预估（原型：3 × .row = 标题 / 触发条件 / 右侧条数） */
      var m = r.materials || {};
      group(tr("下轮材料预估") + (r.day ? ' · ' + r.day : ''));
      [[tr("遗忘候选"), tr("cold 且 ≥90 天零命中"), m.forget], [tr("加深候选"), 'hits30 ≥ 5', m.hot],
       [tr("互抑候选"), tr("§ 名重叠 0.5–0.66"), m.interference]].forEach(function (kv) {
        box.appendChild(ovCRow(kv[0], kv[1], [el('b', null, String(kv[2] == null ? 0 : kv[2]) + tr(" 条"))]));
      });
      /* v9：原型深睡页无「历次产出趋势」块 ⇒ 移除（该趋势在总览「本月成长」已表达，不是丢信息） */
    } else {
      var ar = r.archive || [];
      if (Derive.has(ar)) {
        group(tr("归档区 notes/archive/ · ") + ar.length + tr(" 个文件（forgetOps 产物，复制回 notes/ 即恢复）"));
        box.appendChild(el('div', 'sc-mem-sub', ar.map(function (x) { return x.file + '（' + x.chars + tr(" 字）"); }).join(' · ')));
      }
    }
  }).catch(function () { /* 端点不可用：静默 */ });
}

function renderMemoryExpanded(view, data) {
  view.textContent = '';
  /* v9 布局对齐（第三轮·块级）：v9 的记忆库页 `.view` **只有一张卡「容量占用」**，
   * 三列容量 + 说明段 + **tabs 都在卡体里**；面板此前是**页级 `.sc-tabbox`** ⇒ 层级反了。
   * 现按原型重排：页头 → 卡「容量占用」{ 三列容量 · 说明 · tabs · 卡内小节 }。 */
  UI.pageHead(tr("记忆库"), tr("MEMORY.md 索引、候选、笔记与归档区，按「库 → 待消化 → 详情 → 已归档」的生命周期排序。"), { routes: ['/memory/overview', '/memory/sections', '/memory/approve'], search: { placeholder: tr("过滤索引 / 候选 / 笔记…"), onInput: appState.filterViewRows }, refresh: true });
  var cap = UI.card(tr("容量占用"), { sub: tr("写入由 write_gate 强制红线") });
  view.appendChild(cap.box);
  var capGrid = el('div', 'sc-cap3');
  cap.body.appendChild(capGrid);
  /* v9 的容量口径说明段（卡内、灰字）：解释"哪些载体给百分比、哪些只报绝对量" */
  cap.body.appendChild(el('div', 'sc-cap-note', tr("只有存在真实容量门的载体才给百分比与进度条：MEMORY.md（cap_memory）与画像（cap_user / cap_agent）；notes / pending 无容量门 ⇒ 只报绝对量。是否因超限**阻断**写入由「参数调节 → 记忆与容量」的容量门开关决定（缺省关闭 = 照写并留一条 capacity-over 留痕）。")));
  if (!data || !data.present) {
    appState.statusFn((data && data.error) || tr("记忆库不可用"));
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
    { id: 'index', label: tr("知识索引 ") + String(Derive.count(memoryFile && memoryFile.lines)), pane: pM1 },
    { id: 'pending', label: tr("候选区 ") + String((data.pending || {}).count || 0), pane: pM2 },
    { id: 'notes', label: tr("笔记 ") + String(Derive.count(data.notes)) + tr(" 类"), pane: pM3 },
    /* v9（原型第 4 枚 Tab）：归档区。面板此前无此 Tab（上轮"无独立数据源"未造）——
     * 数据其实来自 `/cognition/report` 的 `archive:[{file,chars}]`，本轮补齐。 */
    { id: 'archive', label: tr("归档区"), pane: pM5 },
    { id: 'growth', label: tr("统计"), pane: pM4 }
  ]);
  cap.body.appendChild(_tb.box);
  var ds = data.distillStats; // 段1 与尾部 appState.statusFn 共用（原在段1 内定义，跨段引用 ⇒ 提到父级）
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
  if (appState.refs.navHealth) {
    var navPct = (memoryFile && memoryFile.cap) ? Math.round((memoryFile.chars || 0) / memoryFile.cap * 100) : null;
    appState.refs.navHealth(navPct === null ? tr("正常") : (Derive.capKind(navPct) !== 'ended' ? tr("水位偏高") : tr("正常")), navPct === null ? 'ended' : Derive.capKind(navPct));
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
  appState.statusFn(tr("记忆 · MEMORY ") + (memoryFile ? Derive.num(memoryFile.chars) + '/' + Derive.num(memoryFile.cap) + ' · ' + Derive.count(memoryFile.lines) + tr(" 行") : tr("不可用")) + tr(" · 蒸馏 ") + (ds ? Derive.num(ds.runs || 0) + tr(" 次") : '—'));
  appState.flushFolds(); // 同步收口（见 appState.deferFold 注释：消除 setTimeout 造成的"先铺开再收起"抖动）
}

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
  group(tr("本月成长 · ") + gGrowth.month);
    var g3 = el('div', 'sc-mem-grid');
    var s3 = gGrowth.sleep || {}, d3 = gGrowth.distill || {}, n3 = gGrowth.now || {};
    g3.appendChild(mkStat(tr("深睡归纳"), String(s3.passes || 0) + tr(" 次"), tr("习得 ") + String(s3.principleAdded || 0) + tr(" · 替换 ") + String(s3.replaced || 0) + tr(" · 画像 ") + String(s3.profilesAdded || 0)));
    g3.appendChild(mkStat(tr("蒸馏"), String(d3.runs || 0) + tr(" 次"), tr("成功 ") + String(d3.ok || 0) + tr(" · 异常 ") + String(d3.bad || 0) + tr(" · 预筛跳过 ") + String(d3.skips || 0)));
    g3.appendChild(mkStat(tr("AGENT 画像"), String(n3.tagRows != null ? n3.tagRows : '—') + tr(" 行"), tr("原则 ") + String(n3.principleRows || 0) + tr(" · 路径 ") + String(n3.pathRows || 0) + ' · ' + String(n3.agentChars || 0) + tr(" 字符")));
    host.appendChild(g3);
    var rds = gGrowth.recentDeep || [];
    if (Derive.has(rds)) {
  host.appendChild(el('div', 'sc-mem-group-title', tr("本月有效深睡产出")));
      var dl3 = el('div', 'sc-idx-list');
      rds.forEach(function (r) {
        dl3.appendChild(el('div', 'sc-mem-sub', String(r.at || '').slice(0, 10) + tr("  原则 +") + String(r.added || 0) + tr("/替换 ") + String(r.replaced || 0) + tr(" · 画像 +") + String(r.profiles || 0) + ' · gate=' + String(r.gate || '')));
      });
      host.appendChild(dl3);
    } else if ((s3.passes || 0) > 0) {
      host.appendChild(el('div', 'sc-mem-empty', tr("本月深睡有运行但无产出（内容判据合规保守：材料不足宁缺毋滥）")));
    }
  }
}

/** 字节数格式化（本文件局部用：库内结构体量）。>1KB 显示一位小数。 */
function fmtBytesOf(n) {
  var v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  return (v / 1048576).toFixed(1) + ' MB';
}

function mmIndexRows(ctx) {
  var host = ctx._tb.pane('index');
  var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
  var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
  /* ── 册五：库内结构（三档枚举 · 只读 ──
   * 用户裁决（本会话设置卡）：「三档枚举 —— 内容档进分区、工具态与产物档只报只读计数」。
   * 判因：库根 27 条目里 engine/scripts/audit/.records/reports/维护文档族**六个板块此前无任何入口**；
   *   本会话起点正是「库内到底有哪些板块」无法从面板回答。
   * ⚠ 枚举**由后端派生**（`libraryStructureOf`，readdirSync + 白名单分档），前端**不硬编码目录名**——
   *   写死清单会让库内结构随目录漂移而失真（零硬编码红线的同类风险）。 */
  var st5 = data.structure;
  if (st5 && Derive.has(st5.entries)) {
    var s5 = st5.summary || {};
    group(tr("库内结构 · ") + Derive.count(st5.entries) + tr(" 个顶层条目（内容 ") + String(s5.content || 0)
      + tr(" · 工具态 ") + String(s5.tooling || 0) + tr(" · 产物 ") + String(s5.artifact || 0) + '）');
    /* ⚠ R4 红线：`tr()` **不得出现在装载期表**（数组/对象字面量的初始化式里），
     *   否则 locale 未接入时值被冻死为中文、切语言不生效——本行原写成
     *   `var KINDLABEL = { content: tr("内容"), … }` 即触发该红线（门禁实测抓到）。
     *   现改为**渲染期按需取值**（函数体内调用，每次渲染重新求值）。 */
    var kindLabelOf = function (k) {
      if (k === 'content') return tr("内容");
      if (k === 'tooling') return tr("工具态");
      return tr("产物");
    };
    /* 内容档展开（承载知识的板块逐条列出）；工具态/产物档**只报计数**（用户裁决：不把可重建产物当内容） */
    ['content', 'artifact', 'tooling'].forEach(function (kind) {
      var list = (st5.entries || []).filter(function (e) { return e.kind === kind; });
      if (!Derive.has(list)) return;
      if (kind !== 'content') {
        host.appendChild(el('div', 'sc-mem-sub', kindLabelOf(kind) + tr("（只报计数，不展开）：")
          + list.map(function (e) { return e.name + ' ' + Derive.count(e.files) + tr(" 件"); }).join(' · ')));
        return;
      }
      host.appendChild(el('div', 'sc-mem-sub', tr("内容档（承载知识的板块）")));
      var box = el('div', 'sc-idx-list');
      list.forEach(function (e) {
        var row = el('div', 'sc-idx-row');
        row.appendChild(el('span', 'sc-idx-tag', e.doc ? tr("文档") : tr("板块")));
        row.appendChild(el('span', 'sc-idx-subject', e.name));
        /* 工具态档不给字节（后端记 0）⇒ 置 0 时只显示件数，不显示「0 B」（避免假读数） */
        var sizeTxt = Number(e.bytes) > 0 ? (Derive.count(e.files) + tr(" 件 · ") + fmtBytesOf(e.bytes)) : (Derive.count(e.files) + tr(" 件"));
        row.appendChild(el('span', 'sc-idx-pointer', sizeTxt));
        box.appendChild(row);
      });
      host.appendChild(box);
      host.appendChild(el('div', 'sc-desc', tr("口径：目录为递归文件数；工具态档（.git/.obsidian/scripts 等）**只报文件数不报体量**（.git 递归可达数十 MB，会把「库有多大」这个读数污染）。枚举由后端 readdirSync 派生，未登记的新条目默认落内容档（宁可多报不静默丢）。")));
    });
  }
  /* ── §3 知识索引 MEMORY.md（progressive disclosure：默认 8 条 + 展开全部） ── */
  if (Derive.has(memoryFile && memoryFile.lines)) {
  group(tr("知识索引 MEMORY.md · ") + memoryFile.lines.length + tr(" 条"));
    host.appendChild(el('div', 'sc-desc', tr("点击行直达 notes 详情小节（只读）。")));
    var idxWrap = el('div');
    idxWrap.classList.add('sc-box');
    var IDX_PREVIEW = 8;
    var allLines = memoryFile.lines || [];
    renderIndexRows(idxWrap, allLines.slice(0, IDX_PREVIEW), renderMemoryExpanded);
    if (allLines.length > IDX_PREVIEW) {
      var moreBtn = el('button', 'sc-idx-more', tr("展开全部 ") + allLines.length + tr(" 条"));
      moreBtn.type = 'button';
      moreBtn.addEventListener('click', function () {
        idxWrap.textContent = '';
        renderIndexRows(idxWrap, allLines, renderMemoryExpanded);
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
  /* ── §4 候选区（U5 审核态 + 册一 双根合并）──
   * 册一（2026-09-19）：**双根并列**。判因（实测）：本段原只渲染 `data.pending`（= memory 库根），
   *   而真候选 9 条在 suite 根（`data.suite.pending`）⇒ 面板显示「候选 0 条」却点不到那 9 条；
   *   写侧 /memory/approve 同时也只读 suite 根 ⇒ 「读的根 ≠ 批的根」（根因 C2）。
   * 现：三处来源（memory / suite 根 / suite·flow-candidates）各自成组，逐条标注来源根，
   *   并显式传 `root` + `action` ⇒ 批准与忽略**物理分离**（.processed / .ignored）。
   *   ⚠ 判因（原实现缺陷）：批准与忽略原调**同一端点同一参数**，一律 rename 进 `.processed/`
   *   ⇒ 两个语义相反的按钮效果完全相同，只有文案不同（「看得见的操作是假的」）。 */
  /* ⚠ R4 红线：数组/对象字面量的**初始化式**里不得调 tr()（装载期求值 ⇒ locale 未接入时冻死为中文）。
   *   故此处只存 **root 键**（稳定、语言无关），标签在渲染期经 labelOfRoot() 取。 */
  var groups = [
    { root: 'suite', src: (data.suite && data.suite.pending) || null },
    { root: 'flow-candidates', src: (data.suite && data.suite.flowCandidates) || null },
    { root: 'memory', src: data.pending || null }
  ];
  var labelOfRoot = function (r) {
    if (r === 'suite') return tr("suite · knowledge/pending");
    if (r === 'flow-candidates') return tr("suite · flow-candidates");
    return tr("记忆库 · pending");
  };
  /* ⚠ 判因（实测真缺陷，由 test-panel-view-contract 抓到）：`Derive.count()` 只处理**数组**
   *   （返回 `v.length`），而 `pending.count` 是**数字** ⇒ `Derive.count(9) === 0`
   *   ⇒ total 恒 0 ⇒ **候选区整块不渲染**（真机探针实测 `[pending] 0 个组标题`）。
   *   此处数字直接用；`recent` 这种数组才走 Derive.count/Has。 */
  var numOf = function (v) { return typeof v === 'number' && v > 0 ? v : 0; };
  var total = 0;
  groups.forEach(function (g) { if (g.src) total += numOf(g.src.count); });
  if (total > 0) {
    group(tr("候选区 · ") + total + tr(" 条（双根合并）"));
    groups.forEach(function (g) {
      var n = g.src ? numOf(g.src.count) : 0;
      if (!n) return;
      host.appendChild(el('div', 'sc-mem-sub', labelOfRoot(g.root) + ' · ' + n + tr(" 条")));
      var plist = el('div', 'sc-pointer-list');
      /* 先渲染本地已列的 recent；该本源 count > recent 时如实标注剩余（不假装全列） */
      (g.src.recent || []).forEach(function (p2) {
        var fname = String(p2.name || '');
        var row = makeMemoryPointerRow(fname.replace(/\.md$/, ''), null, (p2.mtime || '').slice(0, 10));
        var act = el('div', 'sc-row-gap');
        /* 批准 ⇒ .processed（内容由蒸馏正常入册）；忽略 ⇒ .ignored（明确丢弃，不入册）。
         * 两者**不同子目录** ⇒ 效果可区分且事后可审计（原先混在同一 .processed/ 无法分辨）。 */
        var okBtn = el('button', 'sc-btn subtle', tr("批准"));
        okBtn.type = 'button';
        okBtn.classList.add('sc-btn-xs', 'sc-btn-ok');
        okBtn.addEventListener('click', function () {
          appState.api('/memory/approve', { method: 'POST', body: JSON.stringify({ pendingFile: fname, root: g.root, action: 'approve' }) })
            .then(function (r) { appState.statusFn(tr("✓ 已批准 ") + fname + tr("（移 ") + ((r && r.moved) || '.processed') + tr("，内容由蒸馏正常入册）")); })
            .catch(appState.failFn);
        });
        var rmBtn = UI.button(tr("忽略"), function () {
          return appState.api('/memory/approve', { method: 'POST', body: JSON.stringify({ pendingFile: fname, root: g.root, action: 'ignore' }) })
            .then(function (r) { appState.statusFn(tr("已忽略 ") + fname + tr("（移 ") + ((r && r.moved) || '.ignored') + tr("，不入册）")); });
        }, { danger: true, async: true, busyText: tr("忽略中…"), okText: tr("已忽略"), confirm: tr("忽略并移出候选队列（移入 .ignored，不入册）：") + fname + '？' });
        act.appendChild(okBtn); act.appendChild(rmBtn);
        row.appendChild(act);
        plist.appendChild(row);
      });
      host.appendChild(plist);
      var shown = Derive.count(g.src.recent);
      if (n > shown) host.appendChild(el('div', 'sc-desc', tr("（本根仅显示最近 ") + shown + tr(" 条，共 ") + n + tr(" 条）")));
    });
    host.appendChild(el('div', 'sc-desc', tr("共 ") + total + tr(" 条 · 批准=确认有价值入册（移 .processed），忽略=移出队列（移 .ignored，不入册）")));
    /* v9（原型候选区 `.alert.info`）：升格/降格的口径与边界说明。 */
    var pTip = el('div', 'sc-ds-alert info');
    pTip.appendChild(el('div', null, tr("升格 / 降格走 /memory/approve，由 L0 判据裁决。索引行只读，正文编辑走 /memory/section-edit。")));
    host.appendChild(pTip);
  } else {
    host.appendChild(el('div', 'sc-mem-empty', tr("暂无候选（已查 记忆库 / suite / flow-candidates 三处）")));
  }
}

function mmNotesChips(ctx) {
  var host = ctx._tb.pane('notes');
  var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
  var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
  /* U1：折叠哨兵 —— 之后的所有组（notes 详情 / 本地知识区 / 向量召回 / delta / 周增量）收进「展开更多」。
   * 用 setTimeout(0) 自调度：本函数同步渲染完毕后才折叠，故无需改动任何后续分组代码（易回滚）。 */
  /* ── §5 notes 详情小节 ── */
  group(tr("notes 详情小节"));
  var nw = el('div', 'sc-notes-list');
  (data.notes || []).forEach(function (nf) {
    var chip = el('div', 'sc-note-chip');
    chip.appendChild(el('span', null, nf.name));
    chip.appendChild(el('span', 'sc-tag', String(nf.sections.length)));
    chip.title = nf.rel + ' · ' + nf.sections.map(function (s) { return s.title }).join(' / ');
    chip.addEventListener('click', function () {
      appState.memoryViewScroll = view.scrollTop; // 记录进入前滚动位置（返回时恢复）
      appState.noteReturnRender = null; // 来源=记忆板块
      appState.api('/memory/sections?rel=' + encodeURIComponent(nf.rel)).then(function (r) {
        renderNoteSections(view, r);
      }).catch(appState.failFn);
    });
    nw.appendChild(chip);
  });
  host.appendChild(nw);
}

function mmArchiveZone(ctx) {
  var host = ctx._tb.pane('archive');
  host.appendChild(el('div', 'sc-mem-group-title', tr("归档区 notes/archive/")));
  var list = el('div');
  host.appendChild(list);
  list.appendChild(el('div', 'sc-desc', tr("读取中…")));
  appState.api('/cognition/report').then(function (r) {
    var ar = (r && r.archive) || [];
    /* v9 的 Tab 文案**带计数**（原型「归档区 4」）：归档区是唯一异步取数的分区，计数只能等本端返回后回填
     * —— 为此加一个同步端点不值，故直接回写该 Tab 元素。 */
    var tabsEls = ctx._tb.box.querySelectorAll('wa-tab');
    if (tabsEls[3]) tabsEls[3].textContent = tr("归档区 ") + ar.length;
    list.textContent = '';
    if (!Derive.has(ar)) list.appendChild(el('div', 'sc-desc', tr("暂无归档条目。")));
    else ar.forEach(function (a) {
      list.appendChild(ovCRow(String(a.file || '—'), tr("notes/archive/ · 仅归档不删除"),
        [ovPill(Derive.num(a.chars || 0) + tr(" 字符"))]));
    });
    var tip = el('div', 'sc-ds-alert ok');
    tip.appendChild(el('div', null, tr("主动遗忘只归档、不删除 —— applyForgetOps 禁直删，热节与画像节有守卫。")
      + tr("如需恢复，把 notes/archive/ 下的文件移回 notes/ 即可（面板不提供写入口）。")));
    host.appendChild(tip);
  }).catch(function () {
    list.textContent = '';
    list.appendChild(el('div', 'sc-desc', tr("归档区读取失败（/cognition/report）。")));
  });
}

function mmSuiteZone(ctx) {
  var host = ctx._tb.pane('index');
  var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
  var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
  /* ── §6 守藏本地知识区（单行摘要，不再重复三索引卡；画像/索引详情在画像与记忆分区） ── */
  var suite = data.suite;
  if (suite && suite.present) {
  group(tr("守藏本地知识区 · suite/knowledge"));
    var sMemory = null;
    (suite.indexes || []).forEach(function (f) { if (f.name === 'MEMORY.md') sMemory = f; });
    host.appendChild(el('div', 'sc-desc', tr("守藏蒸馏器事实源（ADR-0002）：MEMORY ") + (sMemory ? Derive.num(sMemory.chars) + '/' + Derive.num(sMemory.cap) + ' · ' + Derive.count(sMemory.lines) + tr(" 行") : '—') + ' · pending ' + String(suite.pending ? suite.pending.count : 0) + tr(" 条。")));
    if (Derive.has(suite.notes)) {
      var snw = el('div', 'sc-notes-list');
      suite.notes.forEach(function (nf) {
        var chip = el('div', 'sc-note-chip');
        chip.appendChild(el('span', null, nf.name));
        chip.appendChild(el('span', 'sc-tag', String(nf.sections.length)));
        chip.title = 'suite · ' + nf.rel + ' · ' + nf.sections.map(function (s) { return s.title }).join(' / ');
        chip.addEventListener('click', function () {
          appState.memoryViewScroll = view.scrollTop; // 记录进入前滚动位置（返回时恢复）
          appState.noteReturnRender = null; // 来源=记忆板块（suite 区板块本身在记忆视图内）
          appState.api('/memory/sections?rel=' + encodeURIComponent(nf.rel) + '&root=suite').then(function (r) {
            renderNoteSections(view, r);
          }).catch(appState.failFn);
        });
        snw.appendChild(chip);
      });
      host.appendChild(snw);
    }
  } else {
    host.appendChild(el('div', 'sc-mem-empty', tr("守藏本地知识区未启用（suite/knowledge 不存在）")));
  }
}

function mmGrowthDelta(ctx) {
  var host = ctx._tb.pane('growth');
  var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
  var group = function (t) { host.appendChild(el('div', 'sc-mem-group-title', t)); };
  /* ── §8 晨起摘要 delta（U4：深睡产出可见物；只读，存在才渲染） ── */
  if (data.delta && data.delta.present && Derive.has(data.delta.rows)) {
  group(tr("最近成长 delta · 深睡产出"));
    var dl8 = el('div', 'sc-idx-list');
    data.delta.rows.forEach(function (row) {
      var r8 = el('div', 'sc-idx-row');
      r8.appendChild(el('span', 'sc-idx-subject', String(row).replace(/^\[/, '[')));
      dl8.appendChild(r8);
    });
    host.appendChild(dl8);
    var staleNote = '';
    if (data.delta.staleAt) {
      try { var remain = Math.max(0, new Date(data.delta.staleAt) - Date.now()); staleNote = tr(" · 剩余 ") + Math.ceil(remain / 3600e3) + tr("h 有效"); } catch (e) { /* */ }
    }
    host.appendChild(el('div', 'sc-mem-sub muted', tr("本次深睡归纳产出（48h 有效") + staleNote + tr("）· 已在会话注入可见")));
  }

  /* ── §9 本周成长 diff（U4：增量可见物——Basic Memory 借鉴：总量已有成长卡，此处补增量） ── */
  if (data.weekDiff && ((data.weekDiff.deepAdded || 0) > 0)) {
  group(tr("本周成长 · 增量"));
    var g9 = el('div', 'sc-mem-grid');
    g9.appendChild(mkStat(tr("深睡新习得"), String(data.weekDiff.deepAdded || 0) + tr(" 条"), tr("近 7 天 [原则]/[路径] 归纳")));
    host.appendChild(g9);
  }
}

function secFoldKey(rel, path, title) {
  return 'note:' + (rel || '') + ':' + (path || '') + '§' + (title || '');
}

function renderNoteSections(view, data) {
  if (!data || !data.present || !data.sections) { appState.statusFn((data && data.error) || tr("无小节")); return; }
  view.textContent = '';
  UI.pageHead(data.name, (data.root === 'suite' ? tr("suite 知识区 · ") : '') + data.rel + ' · ' + data.sections.length + tr(" 个小节（白名单只读）"));
  var back = el('button', 'sc-btn subtle', tr("← 返回") + (appState.noteReturnRender === renderPersona ? tr("画像板块") : data.root === 'suite' ? tr("守藏知识区") : tr("记忆库")));
  back.type = 'button';
  back.addEventListener('click', function () {
    var backRender = appState.noteReturnRender || renderMemoryExpanded;
    appState.api('/memory/overview').then(function (r) {
      backRender(view, r);
      requestAnimationFrame(function () { view.scrollTop = appState.memoryViewScroll; }); // 恢复滚动位置，不跳顶
    }).catch(appState.failFn);
  });
  view.appendChild(back);
  view.scrollTop = 0; // 二级视图自身从顶部开始读
  // U5：反链聚合（Logseq/思源借鉴）——引用此文件小节的来源清单
  if (Derive.has(data.backrefs)) {
    var bl = el('div');
    bl.appendChild(el('div', 'sc-mem-group-title', tr("被引用 · ") + data.backrefs.length));
    var bList = el('div', 'sc-idx-list');
    data.backrefs.slice(0, 8).forEach(function (br) {
      var row = el('div', 'sc-idx-row');
      row.appendChild(el('span', 'sc-idx-tag', String(br.from || '').split('/').pop()));
      row.appendChild(el('span', 'sc-idx-subject', String(br.line || '').slice(0, 90)));
      row.title = br.line || '';
      bList.appendChild(row);
    });
    bl.appendChild(bList);
    if (data.backrefs.length > Derive.BACKREF_LIMIT) bl.appendChild(el('div', 'sc-mem-sub muted', tr("… 共 ") + data.backrefs.length + tr(" 处引用")));
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
    head.title = tr("点击展开/收起") + (depth > 0 ? tr("（子树）") : '');
    head.classList.add('sc-card-head'); // U2.5b：cursor/布局入 CSS；动态缩进走 --sc-indent
    head.setAttribute('data-fold-key', key); // 供 openMemoryNote 精确置位（替代模拟 click）
    if (pad) head.style.setProperty('--sc-indent', pad + 'px');
    var body = el('div', 'sc-card-body');
    body.textContent = sec.body || (hasKids ? '' : tr("（空小节）"));
    var editSec = el('button', 'sc-btn subtle sc-edit-sec', tr("✎ 编辑此小节"));
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
  appState.statusFn(data.rel + ' · ' + Derive.count(data.sections) + tr(" 顶层小节（树状，点击逐层展开；编辑在节点细节）"));
}

function editNoteSection(data, sec, view) {
  if (!data || !data.rel || !sec) return;
  var bodyTxt = sec.body || '';
  var ta = el('textarea', 'sc-input sc-ta');
  ta.value = bodyTxt;
  var wrap = el('div');
  wrap.appendChild(el('div', 'sc-desc', tr("编辑 §") + sec.title + tr(" 正文（") + data.rel + tr("）——保留开头摘要行最佳；保存走写门（备份+容量红线），索引指针不变。")));
  wrap.appendChild(ta);
  var bar = el('div', 'sc-toolbar');
  var saveBtn = el('button', 'sc-btn', tr("保存正文"));
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', function () {
    var next = ta.value.trim();
    if (!next) { appState.statusFn(tr("正文不能为空——如需清空请用删除")); return; }
    saveBtn.disabled = true; saveBtn.textContent = tr("保存中…");
    appState.api('/memory/section-edit', { method: 'POST', body: JSON.stringify({ rel: data.rel, section: sec.title, newBody: next }) })
      .then(function () { appState.statusFn('✓ §' + sec.title + tr(" 正文已保存（write_gate 通过）")); appState.api('/memory/sections?rel=' + encodeURIComponent(data.rel) + (data.root === 'suite' ? '&root=suite' : '')).then(function (r) { renderNoteSections(view, r); }).catch(appState.failFn); })
      .catch(function (e) { saveBtn.disabled = false; saveBtn.textContent = tr("保存正文"); appState.failFn(e); });
  });
  var cancelBtn = el('button', 'sc-btn subtle', tr("取消"));
  cancelBtn.type = 'button';
  cancelBtn.addEventListener('click', function () { view.removeChild(wrap); });
  bar.appendChild(saveBtn); bar.appendChild(cancelBtn);
  wrap.appendChild(bar);
  view.appendChild(wrap);
}

export { renderCognitionReport, renderMemoryExpanded, mkStat, mmGrowthMonth, mmIndexRows, mmPendingRows, mmNotesChips, mmArchiveZone, mmSuiteZone, mmGrowthDelta, secFoldKey, renderNoteSections, editNoteSection };
