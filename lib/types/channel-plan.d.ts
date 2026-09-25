/** 除 principles 外的写入通道名（与 `deepsleep-run` 的 `otherChannels.byChannel` 一一对应）。 */
export type DeepSleepChannelName = 'profiles' | 'pointers' | 'tree' | 'forget' | 'outcomes' | 'episodes' | 'converge';
/** 单通道一轮的计数：`tried` = 有提案且未落地数 · `done` = 成功落地数。 */
export interface DeepSleepChannelStat {
    name: DeepSleepChannelName;
    tried: number;
    done: number;
}
/**
 * 除 principles 外各通道的轮次结果（G-19 原形 + ADR-333 明细）。
 *
 * ⚠ **向后兼容是硬要求**：`tried`/`done` 两字段**逐字保留**（既有断言、审计消费方、
 *   单测 `test-deepsleep-verdict` 均按此形状），`byChannel` 为**可选**——
 *   缺省省略即与改造前行为完全一致（零迁移，可随时回退）。
 */
export type DeepSleepOtherChannels = {
    tried: number;
    done: number;
    byChannel?: DeepSleepChannelStat[];
};
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
export declare const zeroLandedChannels: (other: DeepSleepOtherChannels) => DeepSleepChannelName[];
/** 是否存在**任何**通道有提案却零落地（等价于"这一轮有东西被堵住了"）。 */
export declare const anyZeroLanded: (other: DeepSleepOtherChannels) => boolean;
