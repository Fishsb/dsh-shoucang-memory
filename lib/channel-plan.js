// channel-plan.ts — 深睡「通道观测」纯函数区（ADR-333 册三 · 2026-09-22）
//
// ## 为什么单独成件（硬理由，与 `probe-plan.ts` / `trigger-plan.ts` 同一判据）
// `deepsleep-core.ts` 的**导出数受 `audit-architecture` 棘轮约束**（阈 35 · 只许收紧）。
// 本轮为落实 ADR-333 册三（「跨通道聚合掩盖」）需要新增通道明细类型与归约函数，
// 就地添加使该件导出达 **37 > 35**，门禁当场红；放松棘轮属 **R3**（须用户拍板）。
// ⇒ 走本仓既有出路：**按领域接缝单独成件**（先例：`probe-plan.ts` / `trigger-plan.ts`
//   正是为解 `deepsleep-core` 导出棘轮而抽出，见 AGENTS.md 结构表）。
//
// ## 本件管什么（**纯函数、零 IO、零依赖**）
// 深睡一轮有七个写入通道（principles 之外的六个走 `otherChannels`）。判据 `deepSleepLanded`
// 只消费**汇总**（`tried`/`done`），因而回答不了"**哪个**通道零落地"——实测后果：
// 画像通道有提案零落地的轮次被整体判 `landed=true`（obs 席实证 **29 轮**），
// 而告警 `deep-sleep-release` 台账 **0 行（从未响过）**。
//
// ⚠ 本件**只做数据形状与归约**，不碰判据决策（`deepSleepLanded` 仍在 `deepsleep-core`，
//   保持"判据单一实现"）。上游 `deepsleep-run` 构造明细，下游审计行消费 `zeroLandedChannels`。
/**
 * 有提案但**一件都没落地**的通道名（ADR-333 册三核心）。
 *
 * 判因：原形状只有两个汇总数字 ⇒ 判 `landed=false` 时**说不出是哪里堵了**，
 *   运维只能靠"画像不增长"这类外部观察反推（实测花了 167 次拒绝才被发现）。
 *   本函数把"哪里堵"变成**判据可直接消费的数据**，而非注释里的约定。
 *
 * ⚠ `byChannel` 缺失（旧构造面）⇒ 返回空数组（**不猜**）：空数组表示"无明细可用"，
 *   与"有明细且无人堵"在下游须可分辨——故调用方**不得**把空数组渲染成"全部正常"。
 */
export const zeroLandedChannels = (other) => (other.byChannel || []).filter((c) => c.tried > 0 && c.done === 0).map((c) => c.name);
/** 是否存在**任何**通道有提案却零落地（等价于"这一轮有东西被堵住了"）。 */
export const anyZeroLanded = (other) => zeroLandedChannels(other).length > 0;
//# sourceMappingURL=channel-plan.js.map