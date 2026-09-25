/**
 * panes-capacity.js — 「记忆与容量」pane（自 `panes-toggles.js` 抽出 · ADR-333 · 2026-09-22）
 *
 * **为什么单独成件**（`check-module-growth` 门禁原文给的出路，不是偏好）：
 *   本轮为落实 ADR-333 在 `panes-toggles.js` 的 `renderTogglesCap` 处新增了
 *   「容量门是否阻断」枚举控件与随开关态变化的文案，使该件由 613 行涨到 **616 行 ≥ 600**，
 *   门禁当场红并给出原文：
 *     「[未登记] src-client/panes-toggles.js 实测 616 行 ≥ 600 ⇒ 必须登记进 FREEZE 基线
 *      （**新功能应落新模块，而不是堆大旧模块**）」
 *   ⇒ 抬基线属 R3（须用户拍板），本仓既有出路面就是**按领域接缝抽出**（同 `panes-eval.js` /
 *     `panes-settings.js` / `panes-overview.js` 等先例）。
 *
 * **领域内聚性**：本 pane 的控件虽跨"容量门"与"活性/遗忘/深睡策略"三组，但**同属
 *   「② 记忆与容量」这一页**、且都由 `scheduler.json` 同一持久通道读写、消费点都在写门/巡检侧
 *   ⇒ 按**页级接缝**抽出，与 `panes-toggles.js` 的分页结构一一对应（① 注入 ③ 模型 ④ 调度仍在原处）。
 *
 * **取依赖**：`UI` / `el` / `appState` / `tr` / `numSetting` / `enumSetting` 全显式 import。
 *   ⚠ 两个控件从 **`ui-kit.js`（中立层）** 取，**不是**从 `panes-toggles.js` ——
 *     后者会形成 `panes-toggles → panes-capacity → panes-toggles` **静态循环**，
 *     被 `audit-architecture --dir src-client --gate` 判红（实测）。
 */
import { UI, numSetting, enumSetting } from './ui-kit.js'
import { el } from './dom.js'
import { appState } from './app-state.js'
import { tr } from './i18n.js'
/* ⚠ 为什么必须显式 import（而不是靠 deps 注入）：`check-client-syntax` 的 A5 监视**所有 pane 的
 *   导出名**，凡在代码中出现即必须 import —— 该判据的判因是「构建绿但运行时 `ReferenceError`
 *   ⇒ **面板整体不渲染**」（实测踩过两次：`Cfg` 未 import、`buildLogPanel` 未 import）。
 *   ⚠ 且**不得用 `as` 别名**：A5 的 `imported` 集合按 `import { A, B }` 字面切分，
 *     `import { numSetting as x }` 会被切出 `'numSetting as x'` ⇒ 该符号**不在集合里** ⇒ 误判缺失。
 *     （本件初版即踩此坑，实测确认。） */

/**
 * @param host 目标容器（已是卡体）
 * @param g     全局配置值（`/config` 的 global 段）
 * @param deps  `{ numSetting }` —— 由 `panes-toggles.js` 注入的共用控件工厂
 */
export function renderTogglesCap(host, g, deps) {
  // numSetting 来自上方 import（`panes-toggles.js` 的模块级工厂，本件与其 ① 页共用**同一份实现**）。
  // ⚠ 刻意**不留 deps 覆盖口**：两个来源会让"同一控件两种行为"，而本仓已两次记录该形态的害处。
  function gVal(key, fallback) { return (g[key] !== undefined && g[key] !== null) ? g[key] : fallback; }

  /* ADR-333（2026-09-22）**文案口径修正** —— 这是本轮"让失败可观测"的一部分：
   *   原文案：三框都写「写入超限**被拒**」。**实测只有一半是真的**：
   *     · `cap_memory`（记忆）与 principles 通道**早已是不阻断**（MEMORY.md 913.9% 仍照写）；
   *     · 只有画像的 profiles 通道是真硬拒（167 次全拒 / 0 成功，USER.md 停在 9/16）。
   *   ⇒ 用户设一个值得到**两种结果**，而文案宣称的是一种。下方文案改为**随开关态**如实描述，
   *     并在开关关闭时显式说明"不再阻断"（不让系统继续说假话）。 */
  var enforce = gVal('capacityEnforce', false) === true;
  var overDesc = enforce
    ? tr("写入超限会被拒（当前：阻断已开启）")
    : tr("写入超限不再阻断（当前：阻断已关闭，超限照写并留一条 capacity-over 审计痕）");
  host.appendChild(el('div', 'sc-desc', tr("容量门 = 记忆库能长多大（超限是否阻断由下方开关决定）；活性/遗忘为天级阈值。")));
  // 2026-09-10 用户拍板：三上限=记忆库「容量门」；2026-09-22 ADR-333 改为**可关闭**（缺省关）
  // 任务执行时 agent 总看到完整双画像+记忆指针（裁切会漏记忆影响执行）；容量门控制记忆库能长多大
  host.appendChild(enumSetting(
    tr("容量门是否阻断写入 capacityEnforce"),
    tr("缺省「关闭」= 超限照写（并落一条 capacity-over 留痕）。开=超限拒写（改造前画像行为）。只影响容量这一支：源指针悬空 / 行格式 / 疑似凭据三道门始终硬拒，不受此开关影响。改后即时生效（写门每轮重读）。"),
    enforce ? 'on' : 'off', 'injection.capacity_enforce',
    [{ v: 'off', label: tr("关闭（缺省·超限照写并留痕）") }, { v: 'on', label: tr("开启（超限拒写）") }]));
  var actualChars = (g && g.actual) || { agent: 0, user: 0, memory: 0 };
  host.appendChild(numSetting(tr("AGENT.md 容量门 cap_agent"), tr("agent 画像记忆库容量（字符）：") + overDesc + tr("（AGENT.md 当前实际 ") + (actualChars.agent || 0) + tr(" 字符）。不影响任务执行注入——注入总看完整画像"), gVal('cap_agent', 3000), 'injection.cap_agent', tr("字符")));
  host.appendChild(numSetting(tr("USER.md 容量门 cap_user"), tr("用户画像记忆库容量（字符）：") + overDesc + tr("（当前实际 ") + (actualChars.user || 0) + tr(" 字符）。不影响任务执行注入"), gVal('cap_user', 3000), 'injection.cap_user', tr("字符")));
  host.appendChild(numSetting(tr("MEMORY.md 容量门 cap_memory"), tr("知识索引记忆库容量（字符）：") + overDesc + tr("（当前实际 ") + (actualChars.memory || 0) + tr(" 字符）。注入按档位行数不受此限"), gVal('cap_memory', 5000), 'injection.cap_memory', tr("字符")));
  // ── v7 活性/遗忘 · 校准阈值（2026-09-10）：条目活性状态机判定天数 + 融合召回降权系数；
  //    经 /set 写入 scheduler.json，深睡巡检/召回运行时生效（缺省 14/44/90/5/35 与 scheduler zod 默认一致）
  host.appendChild(el('div', 'sc-h3', tr("活性 / 遗忘阈值（v7）")));
  host.appendChild(el('div', 'sc-desc', tr("记忆条目活性状态机（active→warm→cold）与遗忘/加深候选的判定阈值，以及融合召回对 cold/retired 条目的降权系数。改动经 /set 即时写回 scheduler.json（与注入/蒸馏配置同通道，重载后按新阈值运行）。")));
  host.appendChild(numSetting(tr("活性降级 warm 阈值 activityWarmDays"), tr("active→warm 无命中天数（缺省 14）"), gVal('activityWarmDays', 14), 'activityWarmDays', tr("天"))); // 与 scheduler zod 默认一致
  host.appendChild(numSetting(tr("遗忘冷降 cold 阈值 activityColdDays"), tr("warm→cold 无命中天数（缺省 44 = warm+30）"), gVal('activityColdDays', 44), 'activityColdDays', tr("天"))); // 与 scheduler zod 默认一致
  host.appendChild(numSetting(tr("遗忘候选 archive 阈值 activityArchiveDays"), tr("cold 后超此天数未命中 → 遗忘候选清单（缺省 90，只建议不删除）"), gVal('activityArchiveDays', 90), 'activityArchiveDays', tr("天"))); // 与 scheduler zod 默认一致
  host.appendChild(numSetting(tr("加深候选命中数 activityHotHits"), tr("近 30 天命中 ≥ 此值 → 加深候选 B（缺省 5，喂深睡归纳）"), gVal('activityHotHits', 5), 'activityHotHits', tr("次"))); // 与 scheduler zod 默认一致
  // 百分比项：numSetting 的 step=100 不适用百分比（会出问题），自建输入块（step=5, min=5, max=95，parseInt 后 clamp [5,95]）
  var pctItem = el('div', 'setting-item');
  var pctInfo = el('div', 'setting-item-info');
  pctInfo.appendChild(el('div', 'setting-item-name', tr("召回冷条目降权 recallColdFactorPercent")));
  pctInfo.appendChild(el('div', 'setting-item-desc', tr("cold/retired 小节在融合召回中的降权系数（百分比 → /100；缺省 35%，后端范围校验 [5,95] 兜底）")));
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
    if (!txt) { injectInfo.textContent = tr("当前注入：空（hot_memory 关或画像/记忆为空）"); return; }
    var chars = txt.replace(/\s+/g, '').length;
    var tokens = Math.ceil(chars / 2); // 中文粗估 ~2 字符/token
    var lineCount = txt.split('\n').filter(function (l) { return l.trim().indexOf('- [') === 0; }).length;
    injectInfo.textContent = tr("当前直接注入 ≈ ") + tokens + ' token（' + chars + tr(" 字符 · 双画像+记忆指针 ") + lineCount + tr(" 条）——每轮随提示词注入");
  }).catch(function () { injectInfo.textContent = ''; });

  // ── G-19（2026-09-12）：深睡未消化策略（B 全重捞 / C 分级）──
  //    此前两种取向写死在代码里，用户无法选；现经 /set 写 scheduler.json
  //    （distill.ts 的 liveFailPolicy 实时读这两个键），改动即时生效，无需重载。
  host.appendChild(el('div', 'sc-h3', tr("深睡未消化策略")));
  host.appendChild(el('div', 'sc-desc', tr("深睡每轮用 deepSleepLanded 判定本轮是否「已消化」。未消化时的两种取向在此切换——全重捞保证不丢料但可能无限重试；分级在连败达上限后放行并告警，避免无限重试烧 LLM。")));
  host.appendChild(UI.item(
    tr("深睡未消化策略 deepSleep.failPolicy"),
    tr("全重捞（retry）= 永不放弃，未消化就一直重捞本批（保证不丢料；材料永久失败时每轮都会重试）；分级（graded）= 连续失败达 N 轮后放行水位并记审计告警（避免无限重试烧 LLM）。缺省 graded。"),
    UI.select([
      { value: 'retry', label: tr("全重捞（不丢料，永不放弃）") },
      { value: 'graded', label: tr("分级（连败 N 轮后放行并告警）") }
    ], String(gVal('deepSleepFailPolicy', 'graded')), function (v) {
      appState.api('/set', { method: 'POST', body: JSON.stringify({ key: 'deepSleep.failPolicy', value: v }) })
        .then(function () { appState.statusFn(tr("✓ 深睡未消化策略 = ") + v); })
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
      .then(function () { appState.statusFn(tr("✓ 分级策略连败上限 = ") + n + tr(" 轮")); })
      .catch(appState.failFn);
  }, { type: 'number', width: '120px', ariaLabel: 'deepSleep.failPolicyMaxRounds' });
  roundsInput.min = '1'; roundsInput.max = '100'; roundsInput.step = '1';
  host.appendChild(UI.item(
    tr("分级策略连败上限 deepSleep.failPolicyMaxRounds"),
    tr("仅在「分级」策略下生效（1–100，缺省 3）：连续失败达此轮数后放行深睡水位并记一条审计告警；全重捞策略下此项不参与判定。"),
    roundsInput
  ));

  // 2026-09-10 审查收敛：以下旧控件已移除——
  //  archive/lifecycle/merge 组（蒸馏空闲 idle_review_ms/归档模式/成熟时长/指纹阈值等）消费端为 v15 单库化前
  //  旧 Python 链路（_meta/*.py 已不随包分发），改了无效。真蒸馏节流/深睡阈值在下方「蒸馏节流」与
  //  「深度睡眠」页（scheduler.json 通道）。
}
// ⚠ `enumSetting` 已于 ADR-333 归位到 `ui-kit.js`（与 `numSetting` 同域，见该件说明）——
//   本件从那里 import，不在此复制一份（复制会产生"同一控件两种行为"）。
