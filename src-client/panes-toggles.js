/**
 * panes-toggles.js — 自 `body.js` 抽出的 pane 模块（UI1/U2 · 2026-09-15）
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
  appState.flushFolds();
}

function numSetting(name, desc, val, key, unit, step) {
  var isFloat = typeof step === 'number' && step < 1; // U3：小数键（如 MCL 熟悉度阈值）支持
  var wrap = el('div', 'sc-num-wrap'); // U2.5：内联样式 → 类（令牌化，可统一/可回滚）
  var inp = el('input'); inp.type = 'number'; inp.className = 'sc-input'; inp.min = '0'; inp.step = String(step || 100); inp.value = String(val);
  var unitEl = el('span', 'sc-range-label', unit || '');
  inp.onchange = function () {
    var v = String(isFloat ? (Math.max(0, parseFloat(inp.value) || 0)) : Math.max(0, parseInt(inp.value, 10) || 0));
    appState.api('/set', { method: 'POST', body: JSON.stringify({ key: key, value: v }) })
      .then(function () { appState.statusFn('✓ ' + key + ' = ' + v); })
      .catch(appState.failFn);
  };
  wrap.appendChild(inp); wrap.appendChild(unitEl);
  // A2：改用 UI.item（DOM 等价）——children 保持「info + 作用域徽标 + 控件」的原有顺序与结构
  return UI.item(name, desc, null, { children: [appState.metaBadges(key), wrap] });
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
      appState.api('/set', { method: 'POST', body: JSON.stringify({ key: 'injection.persona', value: tier[0] }) })
        .then(function () {
          appState.statusFn('✓ persona 档位 = ' + tier[1]);
          slider.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
          cell.classList.add('active'); cell.setAttribute('aria-checked', 'true');
        })
        .catch(appState.failFn);
    };
    slider.appendChild(cell);
  });
  // A2：改用 UI.item（DOM 等价）——保持 info → 作用域徽标 → 滑块 的原有顺序，均不包装
  host.appendChild(UI.item('画像 persona 注入档位 injection.persona', 'v17 已生效：关闭=不注入画像；仅注入我=只注入 agent 画像 AGENT.md（含 [原则] 习得原则与 [路径] 任务路径）；仅注入你=只注入用户画像 USER.md；全注入=双画像（默认）', null, { children: [appState.metaBadges('injection.persona'), slider] }));
  appState.switchKeys.forEach(function (it) {
    // P1-2：hot_memory 显示全局 scheduler.json 值（root YAML flags 已非真源）
    var cur = it[0] === 'injection.hot_memory' ? gVal('hot_memory', true) : parsed.flags[it[0]];
    if (typeof cur !== 'boolean') return;
    host.appendChild(appState.makeToggle(it[0], it[1], it[2], cur, function (key, sw) {
      appState.api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
        .then(function () { appState.statusFn('✓ 已切换 ' + key); })
        .catch(function (e) { appState.failFn(e); sw.checked = !sw.checked; });
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
      appState.api('/set', { method: 'POST', body: JSON.stringify({ key: 'injection.level', value: tier[0] }) })
        .then(function () {
          appState.statusFn('✓ injection.level = ' + tier[0]);
          lSlider.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
          cell.classList.add('active'); cell.setAttribute('aria-checked', 'true');
        })
        .catch(appState.failFn);
    };
    lSlider.appendChild(cell);
  });
  // A2：改用 UI.item（DOM 等价）——保持 info → 作用域徽标 → 滑块 的原有顺序，均不包装
  host.appendChild(UI.item('热记忆注入强度 injection.level', 'off=不注入 / low(2 条) / medium(4 条) / high(8 条) / smart=智能上限(10 条)；当前：' + levelMode + '；改动即时生效（缓存作废）', null, { children: [appState.metaBadges('injection.level'), lSlider] }));
  // U3（B5 能力对齐）：注入选行两键 —— panel 早已读取 injectRelevance/injectFreshSlots，此前无控件（UI 调不了）
  host.appendChild(appState.makeToggle('injectRelevance', '注入相关性重排 injectRelevance', '开=按相关性选行（缺省）；关=回落「基线 + 新鲜度」选行。即时生效（下次注入即用）', gVal('injectRelevance', true) !== false, function (key, sw) {
    appState.api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
      .then(function () { appState.statusFn('✓ 已切换 ' + key + '（即时）'); })
      .catch(function (e) { appState.failFn(e); sw.checked = !sw.checked; });
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
    appState.api('/set', { method: 'POST', body: JSON.stringify({ key: 'recallColdFactorPercent', value: String(v) }) })
      .then(function () { appState.statusFn('✓ recallColdFactorPercent = ' + v + '%'); })
      .catch(appState.failFn);
  };
  pctWrap.appendChild(pctInp); pctWrap.appendChild(pctUnit);
  pctItem.appendChild(pctInfo); pctItem.appendChild(pctWrap);
  host.appendChild(pctItem);
  // 当前实际注入统计（调用 /inject/preview 算 token：中文 ~2 字符/token）
  var injectInfo = el('div', 'sc-desc');
  injectInfo.classList.add('sc-inline-note');
  host.appendChild(injectInfo);
  appState.api('/inject/preview').then(function (r) {
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
      appState.api('/set', { method: 'POST', body: JSON.stringify({ key: 'deepSleep.failPolicy', value: v }) })
        .then(function () { appState.statusFn('✓ 深睡未消化策略 = ' + v); })
        .catch(appState.failFn);
    }, 'deepSleep.failPolicy')
  ));
  // 连败上限：仅在 graded 下生效（retry 永不放弃，此项不参与判定）
  var roundsInput = UI.input(String(gVal('deepSleepFailMaxRounds', 3)), function (raw) {
    var n = parseInt(raw, 10);
    if (isNaN(n)) n = 3;
    n = Math.max(1, Math.min(100, n));
    roundsInput.value = String(n); // 非法/越界就地回落，显示值=实际写入值
    appState.api('/set', { method: 'POST', body: JSON.stringify({ key: 'deepSleep.failPolicyMaxRounds', value: String(n) }) })
      .then(function () { appState.statusFn('✓ 分级策略连败上限 = ' + n + ' 轮'); })
      .catch(appState.failFn);
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
    appState.api('/vector/status2').then(function (s2) {
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
        appState.api('/embed/config', { method: 'POST', body: JSON.stringify({ embedEnabled: sw.checked }) })
          .then(function () { appState.statusFn('✓ 向量 ' + (sw.checked ? '开' : '关') + '（重载后生效）'); })
          .catch(function (e) { appState.failFn(e); sw.checked = !sw.checked; });
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
        appState.api('/embed/config', { method: 'POST', body: JSON.stringify({ embedBaseUrl: uInp.value.trim(), embedModel: mSel.value || curModel, embedApiKeyEnv: kInp.value.trim() || 'EMBED_API_KEY' }) })
          .then(function () { appState.statusFn('✓ 已保存（重载后生效——若换了服务/模型请点「清缓存重建」）'); saveBtn.disabled = false; saveBtn.textContent = '保存配置'; })
          .catch(function (e) { saveBtn.disabled = false; saveBtn.textContent = '保存配置'; appState.failFn(e); });
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
        return appState.api('/vector/cache/clear', { method: 'POST', body: '{}' })
          .then(function (r) { appState.statusFn('✓ 向量缓存已清' + (r && r.removed ? '（删除 ' + r.removed + '）' : '') + '——下次召回按当前模型自动重嵌'); });
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
      appState.api('/distill/config', { method: 'POST', body: JSON.stringify(patch) })
        .then(function () { appState.statusFn('✓ ' + label + ' 已设' + (v ? '：' + v : '（跟随主模型）') + '——重载后生效'); })
        .catch(appState.failFn);
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
  appState.api('/llm/models').then(function (r) {
    hostModels = (r && r.models) || [];
    llmCard.textContent = '';
    // 读当前持久值
    return appState.api('/distill/config').then(function (d) {
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
  /* ⚠ **本节（标题 + 容器）必须在这里一次性建立**（2026-09-15 修正）：
   *   原来标题在函数开头、而容器 `dDesc`/`dZone` 在**函数末尾**才创建 ⇒ 中间隔着
   *   「召回与库版本」「认知环」两整段 ⇒ **标题下空白、控件落到页尾且无小节标题**。
   *   实证后果：`docs/OPEN-ITEMS.md` 把「6 个蒸馏节流键**无持久 UI 通道**」登记为待办（H-5/H-16），
   *   而通道**早已存在**（路由 `/distill/config` + 控件 + 视图契约基线均覆盖）——
   *   **登记人看到的就是"标题下面没东西"**。
   *   现把三者一起前置；`dDesc`/`dZone` 由闭包在后面（异步回填时）使用 ——
   *   内层 `function` 声明有提升，`distillToggle`/`distillInput` 在后面定义也照样可调。 */
  host.appendChild(el('div', 'sc-h3', '蒸馏节流（运行时通道）'));
  var dDesc = el('div', 'sc-desc', '写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。当前值读取中…');
  host.appendChild(dDesc);
  var dZone = el('div');
  dZone.appendChild(el('div', 'sc-desc', '读取中…'));
  host.appendChild(dZone);
  /* U2：桶④ 默认折叠（B6 高级后置）——哨兵 + 自调度，后续节点自动收进折叠体 */
  // U3（B5 能力对齐）：召回融合策略（v2 回滚开关）+ 库版本化 + 认知环 6 键 —— 均在桶④折叠体内
  host.appendChild(el('div', 'sc-h3', '召回与库版本'));
  var fusRow = el('div', 'setting-item');
  var fusInfo = el('div', 'setting-item-info');
  fusInfo.appendChild(el('div', 'setting-item-name', '召回融合策略 recallFusion'));
  fusInfo.appendChild(el('div', 'setting-item-desc', 'rrf=排名融合（缺省，对离群分稳健）；weighted=旧 min-max 加权（回滚用）。阈值口径与融合解耦——始终用绝对余弦（ACT-024）'));
  fusInfo.appendChild(appState.metaBadges('recallFusion'));
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
      appState.api('/set', { method: 'POST', body: JSON.stringify({ key: 'recallFusion', value: tier[0] }) })
        .then(function () {
          appState.statusFn('✓ recallFusion = ' + tier[0] + '（需重载插件生效）');
          fusRowCtrl.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
          cell.classList.add('active'); cell.setAttribute('aria-checked', 'true');
        })
        .catch(appState.failFn);
    };
    fusRowCtrl.appendChild(cell);
  });
  fusRow.appendChild(fusInfo); fusRow.appendChild(fusRowCtrl);
  host.appendChild(fusRow);
  host.appendChild(appState.makeToggle('bankGit', '记忆库 git 版本化 bankGit', '每次成功写入后提交库快照（可 diff/revert；库在 ~/.dsh 下，不入公开树）。缺省开', gVal('bankGit', true) !== false, function (key, sw) {
    appState.api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
      .then(function () { appState.statusFn('✓ 已切换 ' + key + '（需重载生效）'); })
      .catch(function (e) { appState.failFn(e); sw.checked = !sw.checked; });
  }));
  host.appendChild(el('div', 'sc-h3', '认知环（MCL · 熟悉度分流 + 有界再引导）'));
  host.appendChild(appState.makeToggle('mclEnabled', '启用认知环 mclEnabled', '慢通道首步注入「薄契约 + top-k 指针」并按需再引导一次；快通道零额外往返。缺省开（false = 一键回滚）', gVal('mclEnabled', true) !== false, function (key, sw) {
    appState.api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
      .then(function () { appState.statusFn('✓ 已切换 ' + key + '（需重载生效）'); })
      .catch(function (e) { appState.failFn(e); sw.checked = !sw.checked; });
  }));
  host.appendChild(numSetting('熟悉度阈值 mclFamiliarThreshold', '「用户文本 ↔ 命中索引行」的绝对余弦阈值（0–1，缺省 0.65；ACT-024 校准：0.65 → 触发率 ~2% 且阈上全为真命中）', gVal('mclFamiliarThreshold', 0.65), 'mclFamiliarThreshold', '', 0.01));
  host.appendChild(numSetting('再引导上限 mclMaxNudges', '慢通道最多再引导次数（0–3，缺省 1；绝不死锁）', gVal('mclMaxNudges', 1), 'mclMaxNudges', '次', 1));
  host.appendChild(numSetting('材料预算 mclBudgetChars', '慢通道材料硬预算（120–4000 字符，缺省 600；只作用于慢通道首步）', gVal('mclBudgetChars', 600), 'mclBudgetChars', '字符', 50));
  host.appendChild(numSetting('指针条数 mclTopK', '慢通道注入的指针条数（1–5，缺省 3）', gVal('mclTopK', 3), 'mclTopK', '条', 1));
  host.appendChild(appState.makeToggle('mclAudit', '认知环审计流 mclAudit', '每步一行写 suite/knowledge/audit/mcl-audit.jsonl（通道/熟悉度/注入/再引导/合规）', gVal('mclAudit', true) !== false, function (key, sw) {
    appState.api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
      .then(function () { appState.statusFn('✓ 已切换 ' + key + '（需重载生效）'); })
      .catch(function (e) { appState.failFn(e); sw.checked = !sw.checked; });
  }));
  // 说明文本与容器**已在函数开头建立**（2026-09-15 修正：原先在此处才创建 ⇒ 标题与控件被两段隔开、
  //   标题下空白 ⇒ 被误登记为"无 UI 通道"）。此处只保留辅助函数与异步回填。
  function distillSave(patch, onFail) {
    return appState.api('/distill/config', { method: 'POST', body: JSON.stringify(patch) })
      .then(function () { appState.statusFn('✓ 已写入 ' + Object.keys(patch).join(',') + '（重载后生效）'); })
      .catch(function (e) { appState.failFn(e); if (onFail) onFail(); });
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
  appState.api('/distill/config').then(function (d) {
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
      appState.api('/distill/run', { method: 'POST', body: '{}' })
        .then(function (rr) {
          pendBtn.disabled = false; pendBtn.textContent = '立即蒸馏一次';
          if (rr && rr.ok) appState.statusFn('✓ ' + (rr.note || '蒸馏完成'));
          else appState.statusFn('⚠ ' + ((rr && rr.note) || '蒸馏未触发') + '——根会话活跃中会跳过，等闲置自动跑');
        })
        .catch(function (e) { pendBtn.disabled = false; pendBtn.textContent = '立即蒸馏一次'; appState.failFn(e); });
    });
    var pendCtl = el('div', 'setting-item-control'); pendCtl.appendChild(pendBtn);
    pendRow.appendChild(pendCtl);
    dZone.appendChild(pendRow);
    if (d && d.active === false) {
      dZone.appendChild(el('div', 'sc-desc', '⚠ 调度器未就绪：显示值为持久文件值，运行时值需插件激活后读取'));
    }
  }).catch(function (e) { dZone.textContent = ''; dZone.appendChild(el('div', 'sc-desc', '⚠ 读取失败：' + e.message)); });
}

export { renderViewToggles, numSetting, renderTogglesInject, renderTogglesCap, renderTogglesModel, renderTogglesModelVec, renderTogglesModelLlm, renderTogglesSched };
