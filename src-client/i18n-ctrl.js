/**
 * i18n-ctrl.js — 控件元数据域（作用域 / 生效态 / 面板开关表）（自 `body.js` 抽出 · 2026-09-17）
 *
 * **抽出的两条判因**：
 *
 * ① **冻结棘轮**：i18n 接线把 `body.js` 顶到 651（基线 626 + 容差 15）。按项目纪律，
 *    出路是**按领域接缝拆**而非按行数硬切。「控件元数据」（哪些控件、写哪、何时生效）
 *    是内聚的真接缝：数据表 + 两个「键 → 文案」分派 + 面板开关清单，只有这一个归属。
 *
 * ② **装载期 `tr()` 陷阱（本类缺陷已复发 3 次，R4 机检专守）**：
 *    `tr()` 在**装配期**取不到词表（locale 尚未接入）⇒ 值会被**冻死为中文**，切英文后仍是中文。
 *    故本模块**表里只存语义键**（`'global'` / `'reload'` …），文案一律在**读取期**分派。
 *    ⚠ 新增控件时必须同步本文件的表与分派函数，否则徽章显示语义键本身。
 *
 * ⚠ 「键 → 文案」一律写成**显式 `tr('中文')` 分派**，不用 `tr(MAP[key])` 动态取键：
 *   `check-i18n-keys` 断言 A 要静态比对「调用点 key 集 == EN 词表 key 集」，
 *   键经变量中转则 AST 看不到调用点 ⇒ 词表侧全被判**死键**而误红。
 */
import { tr } from './i18n.js'

/**
 * 面板「开关」清单：`[配置键, 标题, 描述]`。
 *
 * **改为函数（惰性）**：表在装配期构造时 `tr()` 取不到词表 ⇒ 冻死为中文。
 * 每次调用重建（渲染期求值）⇒ 语言切换即时生效；不缓存，故无冻死。
 * 消费点唯一：`panes-toggles.js` 的 `appState.switchKeys()`。
 */
export function switchKeys () {
  return [
    ['injection.hot_memory', tr("注入热记忆总闸 hot_memory"), tr("关=不注入 agent/用户画像与知识索引任何指针行")],
    // 2026-09-10 审查收敛：archive/lifecycle/merge/scheduler 组开关是 v15 单库化前旧 Python 链路的
    // 遗留控件，其消费端（_meta/*.py）已不随包分发——保留只会误导用户"改了有效"。已移除。
    // 2026-09-11 同类遗漏：boards.memory 是「只写不读」死开关（parseView 解析进 out.boards 后全仓零读取点，
    // 注入总闸只读 level/hot_memory/persona），且旧文案宣称其「注入总闸的父开关」= 假依赖。同批移除。
  ]
}

/**
 * 控件元数据：写哪（作用域）+ 何时生效（生效态）。缺省 = 全局注入 / 即时。
 *
 * **只存语义键**：`scope` 取 `global|writeGate|recallFusion|scheduling|injectionRows|bankGit|cognitionLoop`；
 * `effect` 取 `live|reload`。
 *
 * ⚠ P0（i18n 前置）：`effect` 曾**存中文文案**，而消费侧拿它做逻辑判断（`m.effect === '需重载'`）——
 *   文案一翻译该比较恒 false ⇒ warn 徽章永不出现，**静默 UI 缺陷且不报错**。故一律改枚举键。
 */
export var CTRL_META = {
  'injection.hot_memory': { scope: 'global', effect: 'live' },
  'injection.level': { scope: 'global', effect: 'live' },
  'injection.persona': { scope: 'global', effect: 'live' },
  'injection.cap_agent': { scope: 'writeGate', effect: 'live' },
  'injection.cap_user': { scope: 'writeGate', effect: 'live' },
  'injection.cap_memory': { scope: 'writeGate', effect: 'live' },
  recallColdFactorPercent: { scope: 'recallFusion', effect: 'live' },
  enableDeepSleep: { scope: 'scheduling', effect: 'reload' },
  // U3（B5 能力对齐）：新增控件的作用域与生效态
  injectRelevance: { scope: 'injectionRows', effect: 'live' },
  injectFreshSlots: { scope: 'injectionRows', effect: 'live' },
  recallFusion: { scope: 'recallFusion', effect: 'reload' },
  bankGit: { scope: 'bankGit', effect: 'reload' },
  mclEnabled: { scope: 'cognitionLoop', effect: 'reload' },
  mclFamiliarThreshold: { scope: 'cognitionLoop', effect: 'reload' },
  mclMaxNudges: { scope: 'cognitionLoop', effect: 'reload' },
  mclBudgetChars: { scope: 'cognitionLoop', effect: 'reload' },
  mclTopK: { scope: 'cognitionLoop', effect: 'reload' },
  mclAudit: { scope: 'cognitionLoop', effect: 'reload' },
};

/** 生效态枚举键 → 展示文案（唯一映射点；缺省 live）。 */
export function ctrlEffectText (effect) {
  if (effect === 'reload') return tr('需重载');
  return tr('即时');
}

/** 作用域语义键 → 展示文案（唯一映射点；未知键原样返回，便于扩展控件时不炸面板）。 */
export function ctrlScopeText (scope) {
  if (scope === 'global') return tr('全局注入');
  if (scope === 'writeGate') return tr('写门容量');
  if (scope === 'recallFusion') return tr('召回融合');
  if (scope === 'scheduling') return tr('调度');
  if (scope === 'injectionRows') return tr('注入选行');
  if (scope === 'bankGit') return tr('库版本化');
  if (scope === 'cognitionLoop') return tr('认知环');
  return scope;
}
