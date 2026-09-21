/**
 * panes-observe.js — 自 `body.js` 抽出的 pane 模块（UI1/U2 · 2026-09-15）
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
import { Bus, Store, Log, Cfg } from './state.js'
import { lang, tr } from './i18n.js'

function renderViewObserve(view) {
  view.textContent = '';
  /* v9 严格对齐：页头右侧 = 「导出」+「清空日志」(danger)；路由 chip 对齐原型 4 个端点 */
  var logsAll = Store.get('logs') || [];
  UI.pageHead(tr("运行观测"), tr("执行进度、调用日志、错误定位与关键指标。日志保留最近 500 条，错误带端点/参数/堆栈，便于定位而非只剩一行提示。"), {
    routes: ['/cognition/report', '/selfcheck', '/reconcile', '/embed/test'], refresh: true,
    actions: [
      UI.button(tr("导出"), function () {
        var blob = new Blob([JSON.stringify({ logs: logsAll, errors: Store.get('errors') || [], metrics: Store.get('metrics') || {} }, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'shoucang-observe-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.json';
        a.click(); URL.revokeObjectURL(a.href);
        appState.statusFn(tr("✓ 观测数据已导出（") + logsAll.length + tr(" 条日志）"));
      }, { title: tr("下载当前日志/错误/指标（JSON）") }),
      UI.button(tr("清空日志"), function () { Store.set('logs', []); Store.set('errors', []); appState.refreshView(); appState.statusFn(tr("已清空日志与错误记录")); }, { danger: true, confirm: tr("确认清空全部日志与错误记录？") })
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
    grid2.appendChild(UI.kpi(tr('请求总数'), { val: Derive.num(total), sub: tr('本地保留（上限 500 条）'), plain: true }).box);
    grid2.appendChild(UI.kpi(tr('成功率'), { val: total ? (Math.round(okCount / total * 1000) / 10) + '%' : '—', sub: tr('非失败请求占比'), plain: true }).box);
    grid2.appendChild(UI.kpi(tr('平均耗时'), { val: avgMs + 'ms', sub: msList.length ? tr('按 ') + msList.length + tr(' 条带耗时记录均算') : tr('暂无带耗时的记录'), plain: true }).box);
    grid2.appendChild(UI.kpi(tr('错误'), { val: Derive.num(errCount), sub: errCount ? tr('见下方「错误定位」') : tr('无记录'), plain: true }).box);
    view.appendChild(grid2);
  })();

  // 1) 进度 —— v9 §6-2：原型是**卡**（.card：卡头「执行进度」+ 路由 chip / 卡体内 .cap 进度条），
  //    面板此前是折叠块（.sc-fold.open）⇒ 形态不同。有真实进度时才渲染条，无进度给卡内空态。
  var pc = UI.card(tr("执行进度"), { sub: tr("本次会话的深睡 / 蒸馏进度"), right: [el('span', 'sc-src', '/cognition/report')] });
  var p = Store.get('progress') || {};
  var ids = Object.keys(p);
  if (!Derive.has(ids)) pc.body.appendChild(el('div', 'sc-desc', tr("当前无进行中的任务。")));
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
    { id: 'logs', label: tr("调用日志 ") + Derive.count(Store.get('logs')), pane: obLogs },
    { id: 'errors', label: tr("错误定位 ") + Derive.count(Store.get('errors')), pane: obErrs },
    { id: 'ops', label: tr("运维操作"), pane: obOps },
    { id: 'metrics', label: tr("关键指标"), pane: obMetrics }
  ]);
  view.appendChild(_ob.box);

  // 2) 错误（C3 可定位）
  var errs = Store.get('errors') || [];
  var ebox = el('div');
  if (!Derive.has(errs)) ebox.appendChild(el('div', 'sc-desc', tr("暂无错误。")));
  else {
    var list = el('div');
    errs.slice().reverse().slice(0, 30).forEach(function (r) {
      var ctx = r.ctx;
      var where = ctx ? ((ctx.method || '') + ' ' + (ctx.path || '') + (ctx.params ? ' ' + JSON.stringify(ctx.params) : '')) : '—';
      list.appendChild(UI.collapsible(
        new Date(r.t).toLocaleTimeString() + '  ' + r.message,
        UI.kv([[tr("端点"), where], [tr("堆栈"), r.stack || '—']]),
        {}
      ));
    });
    ebox.appendChild(list);
    ebox.appendChild(UI.button(tr("清空错误"), function () { Store.set('errors', []); appState.refreshView(); }, { danger: true, confirm: tr("确认清空错误记录？") }));
  }
  obErrs.appendChild(ebox);

  // 3) 关键指标（C4）
  var mbox = el('div');
  var m = Store.get('metrics') || {};
  var mk = Object.keys(m);
  if (!Derive.has(mk)) mbox.appendChild(el('div', 'sc-desc', tr("暂无指标（切换各视图会自动采集）。")));
  else mbox.appendChild(UI.kv(mk.map(function (k) { return [k, String(m[k])]; })));
  obMetrics.appendChild(mbox);
  /* 账本对账与产出健康（原在深睡页；v9 深睡页无此卡 ⇒ 迁到本 Tab，与该 Tab 的运维/健康语义相符） */
  appState.renderRunExtras(obMetrics);

  // 4) 日志（C2）
  obLogs.appendChild(buildLogPanel(400));

  /* 运维操作（B1）：为后端已实现但界面无入口的端点补齐入口 —— /embed/test、/root/bootstrap */
  var ops = el('div');
  var embedRes = el('div', 'sc-desc', tr("未测试"));
  ops.appendChild(UI.item(tr("嵌入服务连通性"), tr("POST /embed/test —— 验证当前 embedding 配置是否可用（配完即可验证，不必等实际调用失败）。"),
    UI.button(tr("测试连接"), function () {
      embedRes.textContent = tr("读取配置…");
      // /embed/test 需要 { baseUrl, apiKey }——先从 /embed/config 取当前配置再测（不可发空 body）
      return appState.api('/embed/config').then(function (c) {
        var g = (c && c.global) || {};
        var baseUrl = String(g.embedBaseUrl || '').trim();
        if (!baseUrl) { embedRes.textContent = tr("✗ 未配置 embedBaseUrl，请先到「参数调节」填写。"); return; }
        embedRes.textContent = tr("测试中… ") + baseUrl;
        return appState.apiCtx('/embed/test', {
          method: 'POST',
          body: JSON.stringify({ baseUrl: baseUrl, apiKey: String(g.embedApiKey || '').trim() })
        }, tr("嵌入连通性")).then(function (r) {
          var n = Derive.count(r && r.models);
          embedRes.textContent = (r && r.error) ? ('✗ ' + r.error) : (tr("✓ 可达 · ") + n + tr(" 个模型"));
          Log.info(tr('嵌入服务连通性测试') + ((r && r.error) ? tr("失败：") + r.error : tr('通过')));
        });
      }).catch(function (e) { embedRes.textContent = '✗ ' + e.message; });
    }, { async: true, busyText: tr("测试中…"), okText: tr("嵌入连通性测试完成") }), {}));
  ops.appendChild(embedRes);

  /* M1（ACT-283）评估通道：配置读取 + 连通性测试 + **出网状态明示**。
   * 为什么必须明示出网：`evalEgressAllow` 与 `evalEnabled` 是**两项独立授权**
   *   （「允许装外部服务」≠「允许记忆内容出机」）——界面必须让人看得见当前是否允许出网。 */
  var evalRes = el('div', 'sc-desc', tr("未测试"));
  ops.appendChild(UI.item(tr("评估通道连通性"), tr("POST /eval/test —— 验证评估通道是否可用（默认关闭；本机端点免 key，远端端点须另开出网许可）。"),
    UI.button(tr("测试连接"), function () {
      evalRes.textContent = tr("读取配置…");
      return appState.api('/eval/config').then(function (c) {
        var e = (c && c.effective) || {};
        var enabled = e.evalEnabled === true;
        var allow = e.evalEgressAllow === true;
        if (!enabled) { evalRes.textContent = tr("通道已关闭（缺省）。到「参数调节」开启 evalEnabled 后再测。"); return; }
        evalRes.textContent = tr("测试中… ") + String(e.evalBaseUrl || '') + (allow ? tr("（已允许出网）") : '');
        return appState.apiCtx('/eval/test', { method: 'POST', body: '{}' }, tr("评估通道")).then(function (r) {
          // 分态回报（七态）——不把"失败"笼统写成"不可用"，否则与本仓既有的"归因塌缩"同病
          var o = String((r && r.outcome) || '');
          var why = String((r && r.why) || '');
          evalRes.textContent = (r && r.ok)
            ? (tr("✓ 可达 · ") + String(r.model || '') + ' · ' + String(r.latencyMs || 0) + 'ms · ' + o)
            : ('✗ ' + o + (why ? (' · ' + why) : ''));
          Log.info(tr('评估通道连通性测试') + ((r && r.ok) ? tr('通过') : (tr("失败：") + o + ' ' + why)));
        });
      }).catch(function (e) { evalRes.textContent = '✗ ' + e.message; });
    }, { async: true, busyText: tr("测试中…"), okText: tr("评估通道连通性测试完成") }), {}));
  ops.appendChild(evalRes);

  /* M2（ACT-283）评估通道**判定统计**：把账折成分布——四问必须看得见（谁做的/有无回落/去向哪里/分态可辨）。 */
  var evalStats = el('div', 'sc-desc', tr("未统计"));
  ops.appendChild(UI.item(tr("评估通道统计"), tr("GET /eval/stats —— 折统一台账 type=eval.decision：分态分布 / 来源 / 真出机次数 / 回落次数。"),
    UI.button(tr("刷新统计"), function () {
      return appState.api('/eval/stats').then(function (s) {
        var oc = (s && s.byOutcome) || {};
        var keys = Object.keys(oc);
        /* ⚠ 文案**不拼语序**（中文语序无法靠片段翻译；本件初版试过拼 `共/N 条/分态` 片段，
         *   被 `check-i18n-keys` 的「词表内重复键」当场抓出）⇒ 改成**数字在前、标签自包含**。 */
        evalStats.textContent = (s && s.total)
          ? ('total ' + s.total + ' · outcomes ' + keys.length + ' (' + keys.map(function (k) { return k + ':' + oc[k]; }).join(' ') + ') · egress ' + (s.egressOk || 0) + ' · fallback ' + (s.fellBack || 0))
          : tr("尚无判定记录（通道未开启或未跑过）");
        /* M4：把**最近明细**也摊开（四问是单条属性 —— 聚合答不了"哪一条回落了、去了哪"）。
         * 只显示形态字段；**不显示 state 内容**（账里本就没有）。 */
        var rec = (s && s.recent) || [];
        if (rec.length) {
          evalStats.textContent += ' ｜ ' + rec.slice(-3).map(function (r) {
            return r.outcome + '@' + (r.destLoopback ? 'local' : r.destHost) + (r.fellBack ? '↩' : '') + ' ' + r.latencyMs + 'ms';
          }).join(' · ');
        }
        Log.info(tr('评估通道统计') + ' ' + evalStats.textContent);
      }).catch(function (e) { evalStats.textContent = '✗ ' + e.message; });
    }, { async: true, busyText: tr("统计中…"), okText: tr("统计完成") }), {}));
  ops.appendChild(evalStats);

  var bootRes = el('div', 'sc-desc', tr("未执行"));
  ops.appendChild(UI.item(tr("根目录引导"), tr("POST /root/bootstrap —— 初始化/修复记忆根目录结构。"),
    UI.button(tr("执行引导"), function () {
      bootRes.textContent = tr("执行中…");
      return appState.apiCtx('/root/bootstrap', { method: 'POST', body: JSON.stringify({}) }, tr("根目录引导"))
        .then(function (r) { bootRes.textContent = '✓ ' + JSON.stringify(r).slice(0, 240); })
        .catch(function (e) { bootRes.textContent = '✗ ' + e.message; });
    }, { async: true, busyText: tr("执行中…"), confirm: tr("执行根目录引导会尝试创建缺失的目录结构，确认继续？") }), {}));
  ops.appendChild(bootRes);

  obOps.appendChild(ops);

  /* 高级（B1 收口）：/memory/edit · /memory/remove 为**行级**原语，作用对象是记忆文件本身。
   * 注意：既有设计 R3 明确「索引行只读——直接改索引行会与 notes 详情错位」，常规编辑请走小节编辑
   * （/memory/section-edit）。此处仅为「无死角入口」要求暴露，并附显式风险提示，默认折叠。 */
  var adv = el('div');
  adv.appendChild(el('div', 'sc-desc', tr("⚠ 行级直接改写记忆文件。改索引行可能导致指针与 notes 正文不一致（详见 R3），常规编辑请用「记忆板块 → 小节编辑」。")));
  var fInp = UI.input('MEMORY.md', null, { placeholder: tr("文件，如 MEMORY.md / notes/lessons.md"), width: '260px', ariaLabel: tr("记忆文件") });
  var lInp = UI.input('', null, { placeholder: tr("待匹配的原始行文本"), width: '320px', ariaLabel: tr("原始行") });
  var nInp = UI.input('', null, { placeholder: tr("新行文本（仅编辑需要）"), width: '320px', ariaLabel: tr("新行") });
  adv.appendChild(UI.item(tr("目标文件"), tr("isWritable 白名单内的记忆文件。"), fInp, {}));
  adv.appendChild(UI.item(tr("原始行"), tr("必须与原文件中的一行完全一致（后端按行匹配）。"), lInp, {}));
  adv.appendChild(UI.item(tr("新行文本"), tr("编辑时必填；删除时忽略。"), nInp, {}));
  var advRes = el('div', 'sc-desc', tr("未执行"));
  var row = el('div', 'sc-toolbar'); // 与全站「操作按钮行」同一原语（旧实现三行内联样式各写各的间距）
  row.appendChild(UI.button(tr("按行编辑"), function () {
    var file = fInp.value.trim(), line = lInp.value.trim(), nt = nInp.value.trim();
    if (!file || !line || !nt) { advRes.textContent = tr("✗ 文件 / 原始行 / 新行 三项均必填"); return; }
    return appState.apiCtx('/memory/edit', { method: 'POST', body: JSON.stringify({ file: file, line: line, newText: nt }) }, tr("行级编辑"))
      .then(function () { advRes.textContent = tr("✓ 已改写该行"); Log.warn(tr('行级编辑已执行（可能需同步索引）：') + file); })
      .catch(function (e) { advRes.textContent = '✗ ' + e.message; });
  }, { async: true, busyText: tr("提交中…") }));
  row.appendChild(UI.button(tr("按行删除"), function () {
    var file = fInp.value.trim(), line = lInp.value.trim();
    if (!file || !line) { advRes.textContent = tr("✗ 文件与原始行必填"); return; }
    // 确认文案需带「目标行内容」⇒ 用动态 confirm；此处不再走 opts.confirm（原实现两者并存 ⇒ 弹两次）
    if (!confirm('确认删除该行？此操作不可撤销（会由写门备份）。\n\n' + line)) return;
    return appState.apiCtx('/memory/remove', { method: 'POST', body: JSON.stringify({ file: file, line: line }) }, tr("行级删除"))
      .then(function () { advRes.textContent = tr("✓ 已删除该行"); Log.warn(tr('行级删除已执行（可能需同步索引）：') + file); })
      .catch(function (e) { advRes.textContent = '✗ ' + e.message; });
  }, { async: true, busyText: tr("提交中…"), danger: true, confirm: tr("确认执行行级删除？") }));
  adv.appendChild(row);
  adv.appendChild(advRes);
  obOps.appendChild(UI.collapsible(tr("高级：行级编辑 / 删除（谨慎）"), adv, { open: false }));
}

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
      appState.applyLogPanel();
    };
    head.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); head.onclick(ev) } };
  }
  head.appendChild(arrow);
  head.appendChild(el('span', null, tr("日志")));
  var lvSel = UI.select(
    [{ value: 'info', label: tr("全部") }, { value: 'warn', label: tr("警告+") }, { value: 'error', label: tr("仅错误") }],
    Cfg.get('logLevel', 'info'),
    function (v) { Cfg.set('logLevel', v); render(); }
  );
  lvSel.setAttribute('aria-label', tr("日志级别"));
  head.appendChild(lvSel);
  var cnt = el('span', null, '');
  head.appendChild(cnt);
  head.appendChild(el('span', 'sc-spacer')); // 推右侧（原为内联 marginLeft:auto）
  head.appendChild(UI.button(tr("清空"), function () { Log.clear(); render(); }));
  wrap.appendChild(head);
  var body = el('div');
  wrap.appendChild(body);
  var ORDER = { info: 0, warn: 1, error: 2 };
  function render() {
    var min = ORDER[Cfg.get('logLevel', 'info')] || 0;
    var all = (Store.get('logs') || []).filter(function (l) { return (ORDER[l.level] || 0) >= min; });
    cnt.textContent = all.length + tr(" 条");
    body.textContent = '';
    if (!Derive.has(all)) { body.appendChild(el('div', 'sc-log-row', tr("（无）"))); return; }
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
  group2(tr("账本对账与产出健康（v2.1 M3）"));
  var rw = el('div', 'sc-mem-stats');
  rw.appendChild(mk(tr("对账"), '…', tr("读取中")));
  gHost.appendChild(rw);
  appState.api('/reconcile').then(function (r) {
    rw.textContent = '';
    if (!r || !r.active) { rw.appendChild(mk(tr("对账"), tr("未就绪"), (r && r.error) || tr("memory-reconcile.mjs 未部署"))); return; }
    var cl = r.closure || {};
    var h = r.health || {};
    var ly = (r.layers || {}).counts || {};
    var P = ly.P || { index: 0, profile: 0 }, R = ly.R || { index: 0, profile: 0 }, E = ly.E || { index: 0, profile: 0 };
    rw.appendChild(mk(tr("账本闭合"), cl.ok === null ? tr("样本不足") : cl.ok ? tr("✅ 差异 0") : tr("⚠ 有差异"), tr("台账 ") + ((r.window || {}).ledgerRows || 0) + tr(" 行 · 写事件 ") + (h.writeEvents || 0) + tr(" 次")));
    rw.appendChild(mk(tr("上次有效深睡"), h.lastSuccessfulWrite ? fmtTime(h.lastSuccessfulWrite) : tr("（无）"), tr("连续空转 ") + (h.idleStreak || 0) + tr(" 轮 · 深睡轮次 ") + (h.deepSleepRounds || 0)));
    rw.appendChild(mk(tr("写入被拒率"), h.rejectRate === null || h.rejectRate === undefined ? 'n/a' : (h.rejectRate * 100).toFixed(0) + '%', tr("拒 ") + (h.rejectedWrites || 0) + tr(" / 写事件 ") + (h.writeEvents || 0) + tr(" · 尝试 ") + (h.attemptedTotal || 0) + tr(" 条")));
    rw.appendChild(mk(tr("三层占比"), 'P ' + (P.index + P.profile) + ' · R ' + R.index + ' · E ' + (E.index + E.profile), tr("P=恒常（索引+P 层画像行 ≤") + ((r.layers || {}).profileCap || 3) + tr("/档）· R=任务门控 · E=相关性门控")));
  }).catch(function () { rw.textContent = ''; rw.appendChild(mk(tr("对账"), tr("读取失败"), '/reconcile')); });
}

export { renderViewObserve, buildLogPanel, renderRunExtras };
