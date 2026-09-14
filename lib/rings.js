/**
 * rings.ts — 内容环注册表（G1 · 2026-09-13）
 *
 * 为什么需要它（来自三轮讨论的结论）：**当前用一套判据管所有内容，是最深的错配**。
 *   不同内容的**生命周期根本不同**——事实要时态失效、裁决要等后果回收、联想只出现一次、
 *   价值要半衰期降级。用一把尺子量，必然出现「频率门结构性杀死一次性洞见」这类错配
 *   （既有判据 `consolidate.support.principle` 要求同主题 ≥3 条痕迹、`support.path` 要求 ≥2 次，
 *   而洞察的定义就是只出现一次）。
 *
 * 本件的作用：把**「一类内容属于哪个生命周期」变成可机检的登记**，而不是散在文档里的说法。
 *   · 新增 kind 未登记归属 ⇒ `scripts/check-ring-coverage.mjs` FAIL；
 *   · 登记了环却没有任何 kind（且未显式列入 `RING_PENDING`）⇒ FAIL（防空环）；
 *   · 免频率门的环被删除 ⇒ FAIL（把「一次性也成立」钉成契约，防回归成频率门）。
 *
 * 纪律：环的归属**只在此处一处声明**（与 record-store 的 KINDS 是同源两件，不是两份副本：
 *   KINDS 管「有哪些类型」，本件管「每类属哪个生命周期」，二者由 check-ring-coverage 机检一致）。
 */
import { KINDS } from './record-store.js';
/** 五个内容环 + none（结构/空白/散文——无生命周期语义，不进任何环） */
export const RINGS = ['fact', 'decision', 'relation', 'association', 'value', 'none'];
/** kind → 环（**唯一声明处**） */
export const RING_OF_KIND = {
    // 事实环：分歧点/环境/契约/流程（可失效、有前提）
    fact: 'fact',
    procedure: 'fact',
    episode: 'fact',
    // 决策环：裁决 + 后果（**唯一能产生"认知"的环**：没有后果回收，经历永远只是日志）
    decision: 'decision',
    outcome: 'decision',
    // 价值环：在意什么/禁忌/审美/自我认知（需要半衰期降级，不能只进不出）
    // ⚠ 2026-09-14（E9）：`preference` / `principle` 两个死 kind 已从 KINDS 删除 ⇒ 此处**同步删**
    //   （两表由 `check-ring-coverage` **双向机检**一致：少一个或多一个都红）。理由见 `record-store.ts#KINDS`。
    valence: 'value',
    persona: 'value',
    // 关系环（G2）：谁是谁 / 谁欠谁（**双向**：direction 区分我欠与欠我）
    relation: 'relation',
    commitment: 'relation',
    // 联想环（G3）：碰撞记录（锚点/语境/价态/落地）——**免频率门**，成立判据是跨度门（≥2 个不同 §）
    association: 'association',
    // 非环：无生命周期语义
    prose: 'none',
    structure: 'none',
    blank: 'none',
};
/**
 * 已登记环但**尚无 kind** 的例外（显式申报，非静默放过）。
 * 棘轮用法：落地后必须从本表删除；`stalePendingRings()` 会抓「已落 kind 却仍申报 pending」。
 * 当前为空 —— 五个环全部已落 kind。
 */
export const RING_PENDING = [];
/**
 * 免频率门的环：**只出现一次也成立**。
 * 依据（三轮讨论的核心结论）：以频率为门槛的判据（≥3 条痕迹 / ≥2 次）**结构性**排除一次性洞见，
 * 而洞察的定义就是只出现一次。故这些环的成立判据是「跨度/价态」，不是「重现次数」。
 */
export const FREQUENCY_FREE_RINGS = ['decision', 'association'];
export function ringOfKind(kind) {
    return RING_OF_KIND[kind] ?? 'none';
}
export function kindsOfRing(ring) {
    return KINDS.filter((k) => ringOfKind(k) === ring);
}
/** 未登记环归属的 kind（应为空；非空即机检 FAIL） */
export function uncoveredKinds() {
    return KINDS.filter((k) => !RING_OF_KIND[k]);
}
/** 已登记环却无 kind 且未申报为 pending 的环（应为空；非空即机检 FAIL） */
export function emptyUndeclaredRings() {
    return RINGS.filter((r) => r !== 'none' && !RING_PENDING.includes(r) && kindsOfRing(r).length === 0);
}
/**
 * **陈旧申报**：已落 kind 却仍留在 `RING_PENDING` 的环（棘轮：落地后必须删除申报，否则 FAIL）。
 * 没有这条，"显式申报"会退化成一张永不清空的豁免名单。
 */
export function stalePendingRings() {
    return RING_PENDING.filter((r) => kindsOfRing(r).length > 0);
}
export function isFrequencyFree(ring) {
    return FREQUENCY_FREE_RINGS.includes(ring);
}
/**
 * 环 → 其 **KPI 产出者**（`check-ring-coverage` 会**真去 lib 里 import 并断言函数存在**）。
 *
 * 为什么把它写成注册表：**加了环却不给 KPI ＝ 机制没有仪表盘**。本项目已有实证——快通道曾恒为 0
 * 而无人知晓（`fast=0` 崩过两次才被人肉发现）。故「每个环必须有一个可机检的 KPI 函数」进硬门。
 */
export const RING_KPI = {
    fact: { module: 'fact-ring', fn: 'factCensus', what: '有效/已失效/带前提/坏时间戳（**记忆相对模型的唯一结构性优势就是带时间戳的已发生事实**）' },
    decision: { module: 'decision-ring', fn: 'scorecardOf', what: '已开/已回收/待回收/命中率（**没有后果回收就没有这个数**）' },
    relation: { module: 'relation-ring', fn: 'trustOf', what: '双向兑现率（我欠 vs 欠我，方向不许合成）' },
    association: { module: 'association-ring', fn: 'associationCensus', what: '落地率（分母=已认可者）/待回收' },
    value: { module: 'record-store', fn: 'inventoryOf', what: '生命周期分布（价值环该被半衰期降级）' },
};
/** 环分布统计（KPI：可从记录集直接推导，不需要另立计数器） */
export function ringCensus(records) {
    const out = {};
    for (const r of RINGS)
        out[r] = 0;
    for (const rec of records)
        out[ringOfKind(rec.kind)]++;
    return out;
}
//# sourceMappingURL=rings.js.map