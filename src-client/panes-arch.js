/**
 * panes-arch.js — 自 `body.js` 抽出的 pane 模块（UI1/U2 · 2026-09-15）
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
import { lang, tr } from './i18n.js'

function renderFacts(host, obj, depth) {
  var d = depth || 0;
  if (obj === null || obj === undefined) { host.appendChild(el('div', 'sc-desc', '—')); return; }
  if (typeof obj !== 'object') { host.appendChild(el('div', 'sc-desc', String(obj))); return; }
  if (Array.isArray(obj)) {
    if (obj.length === 0) { host.appendChild(el('div', 'sc-desc', tr("（空）"))); return; }
    var rows = obj.slice(0, 12);
    rows.forEach(function (it) {
      if (it && typeof it === 'object') {
        var sub = el('div', 'sc-facts-row');
        var line = Object.keys(it).slice(0, 6).map(function (k) { return k + '=' + String(it[k]).slice(0, 40); }).join(' · ');
        sub.appendChild(el('div', 'sc-desc', line));
        host.appendChild(sub);
      } else host.appendChild(el('div', 'sc-desc', '· ' + String(it)));
    });
    if (obj.length > rows.length) host.appendChild(el('div', 'sc-desc', tr("… 另有 ") + (obj.length - rows.length) + tr(" 条")));
    return;
  }
  var pairs = [];
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    if (v === null || v === undefined) pairs.push([k, '—']);
    else if (typeof v === 'object') {
      if (Array.isArray(v)) pairs.push([k, '[' + v.length + tr(" 条]")]);
      else pairs.push([k, '{' + Object.keys(v).length + tr(" 键}")]);
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
        host.appendChild(el('div', 'sc-sub', k + '（' + v.length + tr(" 条）")));
        renderFacts(host, v, d + 1);
      }
    });
  }
}

function rawDetails(host, obj) {
  var det = document.createElement('details');
  det.appendChild(el('summary', 'sc-desc', tr("原始 JSON")));
  var pre = el('pre', 'sc-code', JSON.stringify(obj, null, 2));
  det.appendChild(pre);
  host.appendChild(det);
}

function renderViewArch(view) {
  view.textContent = '';
  /* 取数失败兜底：**绝不把宿主炸掉**（无服务端的渲染测试里 `api` 会拒绝，且错误对象可能为空）
   * ——实测：直接 `.catch(fail)` 曾在渲染测试里抛 `Cannot read properties of undefined (reading 'split')`，
   *   整块视图连带渲染失败。此处一律走本兜底。 */
  var safeFail = function (e) {
    var msg = (e && (e.message || e.error)) ? String(e.message || e.error) : tr("取数失败（端点不可达或返回非 JSON）");
    try { host.appendChild(el('div', 'sc-desc', '⚠ ' + msg)); } catch (_) { /* 连兜底都失败就静默 */ }
  };
  /* **确定性失败文案**（2026-09-13）：渲染快照基线要求 DOM 稳定——
   *   实测直接写 `e.message` 时，无服务端环境下各端点抛错文案/时序不一 ⇒ 基线每次都不一样。
   *   故按**端点路径**给固定文案（同一端点每次相同），既保留可诊断性又让快照可比。 */
  var guard = function (path) {
    return function () {
      try { host.appendChild(el('div', 'sc-desc', '⚠ ' + path + tr(" 取数失败（端点不可达）"))); } catch (_) { /* 静默 */ }
    };
  };
  var host = view;
  try {
    renderArchBody(view, safeFail);
  } catch (e) {
    view.appendChild(el('div', 'sc-desc', tr("⚠ 架构视图渲染失败：") + String((e && e.message) || e)));
  }
}

function renderArchBody(view, safeFail) {
  var fail = safeFail;
  /* **确定性失败文案**：本视图有 5 个异步端点，而渲染快照基线要求 DOM **逐次一致**。
   *   实测：透传 `e.message` 时各端点抛错文案/时序不一 ⇒ 基线每次不同（视图契约门红）。
   *   故此处**不打印错误详情**，只给固定一行；诊断细节在「运行观测」视图的日志里查。 */
  var fail = function () {
    /* **静默**：占位符在**同步阶段**已渲染，异步失败**不改 DOM**——
     *   否则 5 个并发端点的失败回调会以不定时序追加到视图末尾 ⇒ 渲染快照逐次不同（视图契约门红）。 */
  };
  UI.pageHead(tr("架构"), tr("重构后的事实面与旋钮：内容环 KPI · 记录层对账与自证 · 统一台账与 legacy 流 · 装配根就绪度 · 断言图 · 认知环参数。数据全部来自只读端点，唯一写入口是认知环旋钮（白名单补丁）。"), {
    routes: ['/rings', '/arch/records', '/arch/graph', '/arch/observability', '/arch/assembly', '/mcl/config'], refresh: true
  });

  /* ── 房内版式：页头 → **操作卡 ×3** → **KPI ×4** → 页签内容 ──
   * 依据：同族页面（运行总览等）的版式就是「KPI 行 + 操作卡」；新页对齐它才有可读性与一致性。
   * ⚠ 严格断言只覆盖运行总览（实测澄清），故本页的对齐属**主动对齐**，非"绕过断言"。 */
  var ops = el('div', 'sc-opgrid');
  ops.appendChild(appState.opCard(tr("内容环与台账"), tr("五环 KPI 与环事件对账 + 统一台账按 type 分布（缺 `at` 行数 = 信封完整性）。"), 'GET /rings · /arch/observability', tr("看观测"), function () {
    tb.select('obs'); return Promise.resolve();
  }, { icon: 'M3 12h4l2.5-6 4 13L16 12h5', okText: tr("已切到「观测」") }));
  ops.appendChild(appState.opCard(tr("认知环旋钮"), tr("熟悉度阈值 / 再引导上限 / 材料预算 / topK / 材料去向（P2b）/ REM —— 白名单补丁写 scheduler.json。"), 'GET|POST /mcl/config', tr("去调参"), function () {
    tb.select('mcl'); return Promise.resolve();
  }, { icon: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M2 14h4|M10 8h4|M18 16h4', okText: tr("已切到「认知环旋钮」") }));
  ops.appendChild(appState.opCard(tr("重取架构快照"), tr("重新拉取记录层 / 断言图 / 观测 / 装配四个只读端点（各页签同时刷新）。"), 'GET /arch/*', tr("刷新"), function () {
    renderArchBody(view, safeFail); return Promise.resolve();
  }, { icon: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1', busyText: tr("取数中…"), okText: tr("已刷新") }));
  view.appendChild(ops);

  /* §2 四张 KPI（先建后回填：建在同步路径上，几何门禁才量得到；数值取到即 set） */
  var kpis = el('div', 'sc-kpis');
  var kRec = UI.kpi(tr("记忆记录"), { val: '—', sub: 'store census', pct: 0, kind: 'ended' });
  var kPar = UI.kpi(tr("载体对账"), { val: '—', sub: tr("md ↔ store 逐件"), pct: 0, kind: 'ended' });
  var kSelf = UI.kpi(tr("写时自证"), { val: '—', sub: tr("可还原 / 分歧"), pct: 0, kind: 'ended' });
  var kAsm = UI.kpi(tr("装配面"), { val: '—', sub: tr("惰性桥 / 新架构模块"), pct: 0, kind: 'ended' });
  [kRec, kPar, kSelf, kAsm].forEach(function (c) { kpis.appendChild(c.box); });
  view.appendChild(kpis);

  /** 页签面板：**同步**先放占位符（DOM 与异步时序解耦 ⇒ 渲染快照稳定）；取到数后整块替换 */
  var pane = function (text) { var p = el('div'); p.appendChild(el('div', 'sc-desc', text)); return p; };
  var pRings = pane(tr("读取中…若长期如此说明 /rings 端点不可达"));
  var pRec = pane(tr("读取中…若长期如此说明 /arch/records · /arch/graph 端点不可达"));
  var pObs = pane(tr("读取中…若长期如此说明 /arch/observability 端点不可达"));
  var pAsm = pane(tr("读取中…若长期如此说明 /arch/assembly 端点不可达"));
  var pMcl = pane(tr("读取中…若长期如此说明 /mcl/config 端点不可达"));
  var tb = UI.tabs('arch', [
    { id: 'rings', label: tr("内容环"), pane: pRings },
    { id: 'rec', label: tr("记录与图"), pane: pRec },
    { id: 'obs', label: tr("观测"), pane: pObs },
    { id: 'asm', label: tr("装配"), pane: pAsm },
    { id: 'mcl', label: tr("认知环旋钮"), pane: pMcl }
  ]);
  view.appendChild(tb.box);

  /* ① 内容环（后端已有端点但此前**无 UI 入口**） */
  appState.api('/rings').then(function (r) {
    pRings.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
    var c = UI.card(tr("五环 KPI 与环事件对账"));
    pRings.appendChild(c.box);
    renderFacts(c.body, r, 0);
    rawDetails(c.body, r);
  }).catch(appState.failFn);

  /* ② 记录层 + 断言图 */
  appState.api('/arch/records').then(function (r) {
    pRec.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
    var c1 = UI.card(tr("记录层（Record 事实源）"));
    pRec.appendChild(c1.box);
    var st = r.store || {};
    /* KPI 回填（房内版式要求 4 张 KPI 都要有值与条） */
    kRec.set(String(st.records || 0), tr("无标签 ") + String(st.untagged || 0) + tr(" 条"));
    c1.body.appendChild(UI.kv([
      [tr("记录数"), String(st.records || 0)],
      [tr("无标签待归类"), String(st.untagged || 0)],
      [tr("md↔store 对账"), String(r.carriersOk || 0) + ' / ' + String(r.carriersTotal || 0) + tr(" 载体一致")]
    ]));
    var sh = r.shadow || {};
    kPar.set(String(r.carriersOk || 0) + ' / ' + String(r.carriersTotal || 0), tr("md ↔ store 逐件一致"));
    if (r.carriersTotal) kPar.fill(Math.round((r.carriersOk || 0) / r.carriersTotal * 100), r.carriersOk === r.carriersTotal ? 'ended' : 'suspect');
    kSelf.set(String(sh.verified || 0) + ' / ' + String(sh.diverged || 0), tr("写 ") + String(sh.writes || 0) + tr(" 次 · 可还原 / 分歧"));
    kSelf.fill(sh.diverged ? 0 : 100, sh.diverged ? 'stalled' : 'ended');
    c1.body.appendChild(UI.kv([
      [tr("写时自证"), tr("写 ") + String(sh.writes || 0) + tr(" · 可还原 ") + String(sh.verified || 0) + tr(" · **分歧 ") + String(sh.diverged || 0) + '**'],
      [tr("末次"), String(sh.lastAt || '—') + '（' + String(sh.lastFile || '—') + '）']
    ]));
    c1.body.appendChild(el('div', 'sc-sub', tr("载体逐件对账")));
    renderFacts(c1.body, (r.carriers || []).map(function (x) { return { 文件: x.file, md: x.mdBytes, store: x.storeBytes, 一致: x.ok ? tr("是") : tr("否"), 原因: x.reason || '' }; }), 1);
    c1.body.appendChild(el('div', 'sc-sub', tr("跨文件逐字节同文（只报告不删——内容属用户）")));
    var dups = r.dups || [];
    if (dups.length === 0) c1.body.appendChild(el('div', 'sc-desc', tr("无（除索引/详情同名标题这类结构性重名）")));
    dups.slice(0, 8).forEach(function (dd) {
      var box = el('div', 'sc-facts-row');
      box.appendChild(el('div', 'sc-desc', '×' + dd.count + ' ' + JSON.stringify(String(dd.text || '').slice(0, 60))));
      box.appendChild(el('div', 'sc-desc', (dd.files || []).map(function (f) { return f.file + '#' + f.order; }).join('  |  ')));
      c1.body.appendChild(box);
    });
    c1.body.appendChild(el('div', 'sc-desc', (r.address && r.address.note) || ''));

    appState.api('/arch/graph').then(function (g) {
    pObs.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
      var c2 = UI.card(tr("断言图（关系即事实）"));
      pRec.appendChild(c2.box);
      c2.body.appendChild(UI.kv([
        [tr("节点"), String(g.nodes || 0) + tr("（记录 ") + String(g.recordNodes || 0) + tr(" + 锚 ") + String(g.anchors || 0) + '）'],
        [tr("边"), String(g.edges || 0)],
        [tr("悬空证据"), String(g.danglingEvidence || 0)],
        [tr("活跃 / 失效"), String(g.live || 0) + ' / ' + String(g.expired || 0)]
      ]));
      c2.body.appendChild(UI.kv([
        ['answers', String(g.answers || 0)], ['collision', String(g.collision || 0)],
        ['commitment', String(g.commitment || 0)], ['relation', String(g.relation || 0)],
        ['pointsTo', String(g.pointsTo || 0)], ['provenance', String(g.provenance || 0)],
        ['supersede', String(g.supersede || 0)]
      ]));
    }).catch(appState.failFn);
  }).catch(appState.failFn);

  /* ③ 观测面 */
  appState.api('/arch/observability').then(function (r) {
    pObs.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
    var c = UI.card(tr("统一台账与观测面"));
    pObs.appendChild(c.box);
    var lg = r.ledger || {};
    c.body.appendChild(UI.kv([
      [tr("台账行数"), String(lg.lines || 0)],
      [tr("缺 at 行（信封完整性）"), String(lg.missingAt || 0) + (r.envelope && r.envelope.ok ? ' ✓' : ' ⚠')],
      [tr("台账路径"), String(lg.path || '')]
    ]));
    c.body.appendChild(el('div', 'sc-sub', tr("按 type 分布")));
    renderFacts(c.body, lg.byType || [], 1);
    c.body.appendChild(el('div', 'sc-sub', tr("audit 目录实况")));
    renderFacts(c.body, r.files || [], 1);
    c.body.appendChild(el('div', 'sc-sub', tr("legacy 流（已并入台账，仅存历史）")));
    renderFacts(c.body, (r.legacy || []).map(function (x) { return { 流: x.name, 仍在: x.present ? tr("是") : tr("否") }; }), 1);
    var reg = r.registry || {};
    c.body.appendChild(el('div', 'sc-sub', tr("口径（族 × 域）")));
    c.body.appendChild(el('div', 'sc-desc', tr("族：") + (reg.families || []).join(' · ')));
    c.body.appendChild(el('div', 'sc-desc', tr("域：") + (reg.domains || []).join(' · ')));
    c.body.appendChild(el('div', 'sc-desc', tr("权威：") + String(reg.authority || '') + tr("（suite 域事件流目标 = ") + String((reg.baseline || {}).suiteEventStreams) + '）'));
  }).catch(appState.failFn);

  /* ④ 装配面 */
  appState.api('/arch/assembly').then(function (r) {
    pAsm.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
    var c = UI.card(tr("装配根（composition root）与已装能力"));
    pAsm.appendChild(c.box);
    var cp = r.composition || {};
    c.body.appendChild(UI.kv([
      [tr("惰性桥边数"), String(cp.bridges) + (cp.bridges === 0 ? tr(" ✓（三条桥已退役）") : ' ⚠')],
      [tr("契约路由数"), String((r.routes || {}).declared || 0)]
    ]));
    /* 存储模式（2026-09-14）：记录层开关——**新增架构的可调节面**，放首屏内（图检要求）。
     * 只给 md|dual：`record` 未实现，枚举校验会明确拒绝（避免"看能切、切了就坏"的假可控）。 */
    var st2 = r.store || {};
    c.body.appendChild(UI.item(tr("存储模式 storeMode"), tr("md = 只写 md 投影；dual = md ↔ Record 双写（写时自证：可还原 / 分歧）。") + (st2.note ? '⚠ ' + st2.note : ''),
      UI.select([{ value: 'md', label: tr("md（只用 md 投影）") }, { value: 'dual', label: tr("dual（md ↔ Record 双写）") }],
        st2.mode === 'dual' ? 'dual' : 'md',
        function (v) {
          appState.api('/set', { method: 'POST', body: JSON.stringify({ key: 'storeMode', value: v }) })
            .then(function (res) { appState.statusFn(res && res.ok ? '✓ storeMode = ' + v + tr("（已写 scheduler.json）") : tr("⚠ 未生效")); renderArchBody(view, safeFail); })
            .catch(function () { appState.statusFn(tr("⚠ storeMode 写入失败（枚举或白名单拒绝）"), 'error'); });
        }, tr("存储模式")),
      {}));
    renderFacts(c.body, cp.handles || [], 1);
    var pl = r.plugin || {};
    var mods = pl.modules || [];
    var modsOk = mods.filter(function (m) { return m.present; }).length;
    kAsm.set(String(cp.bridges) + tr(" 桥"), modsOk + ' / ' + mods.length + tr(" 新架构模块在"));
    kAsm.fill(cp.bridges === 0 && modsOk === mods.length ? 100 : 0, cp.bridges === 0 && modsOk === mods.length ? 'ended' : 'suspect');
    c.body.appendChild(UI.kv([[tr("插件版本"), String(pl.version || '')], [tr("lib 文件数"), String(pl.libFiles || 0)]]));
    c.body.appendChild(el('div', 'sc-sub', tr("重构后新增模块（装上去的那份是否带着）")));
    renderFacts(c.body, (pl.modules || []).map(function (m) { return { 模块: m.name, 在: m.present ? '✓' : '✗' }; }), 1);
    c.body.appendChild(el('div', 'sc-desc', (cp.note || '')));
    /* ⚠ 移出：storeMode 控件改放卡片**首屏内**（图检发现放在末尾会被句柄/模块清单挤到首屏之外 ⇒ 看不见＝没验证） */
  }).catch(appState.failFn);

  /* ⑤ 认知环旋钮（唯一写入口：白名单补丁；改后重载生效） */
  function renderMclKnobs() {
    pMcl.textContent = '';
    appState.api('/mcl/config').then(function (r) {
    pMcl.textContent = ''; /* 图检发现：占位符必须清掉，否则与真实数据并存 */
      var cur = r.persisted || {};
      var run = r.running || {};
      var c = UI.card(tr("认知环（MCL）旋钮"), { desc: tr("白名单补丁写 `scheduler.json`；**重载后生效**。当前运行态：") + (r.active ? tr("已装配") : tr("未装配")) });
      pMcl.appendChild(c.box);
      c.body.appendChild(UI.kv([
        [tr("运行态通道计数"), 'steps=' + String(run.steps || 0) + ' · slow=' + String(run.slow || 0) + ' · injected=' + String(run.injected || 0)],
        [tr("材料去向"), (cur.mclMaterialInSystem ? tr("systemPrompt 段（P2b 开）") : tr("消息面")) + tr("（按持久配置）")],
        [tr("材料送达计数"), 'sysBlockNonEmpty=' + String(run.sysBlockNonEmpty || 0) + tr(" · 末次 ") + String(run.sysBlockLastChars || 0) + tr(" 字符")]
      ]));
      var save = function (key, val) {
        var patch = {}; patch[key] = val;
        appState.api('/mcl/config', { method: 'POST', body: JSON.stringify(patch) })
          .then(function () { appState.statusFn('✓ ' + key + ' = ' + val + tr("（已写入 scheduler.json，重载后生效）")); renderMclKnobs(); })
          .catch(appState.failFn);
      };
      var lim = r.limits || {};
      var defs = lim.defaults || {};
      c.body.appendChild(UI.item(tr("熟悉度阈值 mclFamiliarThreshold"), tr("绝对余弦口径；≥ 阈值且命中高置信标签才走快通道（缺省 ") + String(defs.familiarThreshold) + tr("）。数据提示：本库 936 步实测 86% 的步**无召回命中**——先查召回，再调此值。"),
        UI.input(cur.mclFamiliarThreshold != null ? cur.mclFamiliarThreshold : defs.familiarThreshold, function (v) { var n = parseFloat(v); if (!isNaN(n)) save('mclFamiliarThreshold', n); }, { type: 'number', width: '120px', ariaLabel: tr("熟悉度阈值") }), {}));
      c.body.appendChild(UI.item(tr("再引导上限 mclMaxNudges"), tr("慢通道未引用材料时的再引导次数（0 = 只注入不引导；缺省 ") + String(defs.maxNudges) + '）',
        UI.input(cur.mclMaxNudges != null ? cur.mclMaxNudges : defs.maxNudges, function (v) { var n = parseInt(v, 10); if (!isNaN(n)) save('mclMaxNudges', n); }, { type: 'number', width: '120px', ariaLabel: tr("再引导上限") }), {}));
      c.body.appendChild(UI.item(tr("材料预算 mclBudgetChars"), tr("慢通道材料硬预算（字符；缺省 ") + String(defs.budgetChars) + '）',
        UI.input(cur.mclBudgetChars != null ? cur.mclBudgetChars : defs.budgetChars, function (v) { var n = parseInt(v, 10); if (!isNaN(n)) save('mclBudgetChars', n); }, { type: 'number', width: '140px', ariaLabel: tr("材料预算") }), {}));
      c.body.appendChild(UI.item(tr("指针条数 mclTopK"), tr("慢通道注入的指针条数（缺省 ") + String(defs.topK) + '）',
        UI.input(cur.mclTopK != null ? cur.mclTopK : defs.topK, function (v) { var n = parseInt(v, 10); if (!isNaN(n)) save('mclTopK', n); }, { type: 'number', width: '120px', ariaLabel: tr("指针条数") }), {}));
      c.body.appendChild(UI.item(tr("材料入 systemPrompt 段（P2b）"), tr("开 = 材料挂注入面、不进转录（实测 `sysBlockNonEmpty` 会涨）；关 = 走消息面（送达有据）"),
        UI.toggle(cur.mclMaterialInSystem === true, function (v) { save('mclMaterialInSystem', v); }), {}));
      c.body.appendChild(UI.item(tr("认知环开关 mclEnabled"), tr("一键回滚开关"),
        UI.toggle(cur.mclEnabled !== false, function (v) { save('mclEnabled', v); }), {}));
      c.body.appendChild(UI.item(tr("审计流 mclAudit"), tr("写统一台账（type=mcl*）"),
        UI.toggle(cur.mclAudit !== false, function (v) { save('mclAudit', v); }), {}));
      c.body.appendChild(UI.item(tr("REM 相 enableRemPass"), tr("深睡同 pass 内做跨主题联想（缺省关；产物会并入画像，噪声代价高）"),
        UI.toggle(cur.enableRemPass === true, function (v) { save('enableRemPass', v); }), {}));
      c.body.appendChild(el('div', 'sc-desc', tr("探针（定位 P2b 用）：宿主传入 context 键 = ") + String(run.sysBlockCtxKeys || '—') + tr(" · 解析出的会话 = ") + String(run.sysBlockLastSid || '—')));
      if (run.trace && run.trace.length) {
        c.body.appendChild(el('div', 'sc-sub', tr("时序轨迹（cap 捕获 · set 写材料 · ren 渲染）")));
        renderFacts(c.body, run.trace, 1);
      }
      rawDetails(c.body, r);
    }).catch(appState.failFn);
  }
  renderMclKnobs();
}

export { renderFacts, rawDetails, renderViewArch, renderArchBody };
