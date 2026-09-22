/** 连续未引用多少次即认为「该来源线索已变弱」（对齐人类"线索变弱即换向"；缺省 2） */
export declare const SWITCH_THRESHOLD = 2;
/** 折一次收益：**回引**（`topicEcho`，旧称 compliant）⇒ 归零；未回引 ⇒ 递增（线索在变弱）。
 *  ⚠ 参数 2026-09-18 更名：该布尔测的是**上一步回复是否回引了材料主题词**（词面代理，实测 true=0/3119），
 *  不是"材料被用上了"。真实收益信号见 `audit/yield-rounds.jsonl`（J5/U3-修信号）。
 *  ⚠ 2026-09-22（D5）：本函数**保留为兼容入口**（旧调用方零迁移）；新路径一律走 `foldZeroGain`
 *   —— 它才带**三态**（action / echo / 无证据）。二者**同一实现**（本函数即其 echo 分支的薄封装）。 */
export declare function nextZeroGain(prev: number | undefined, topicEcho: boolean): number;
/** 一次收益折减的**信号来源**（三态）——落审计，供事后分辨"这条判定依据是什么"。 */
export type YieldSignalKind = 'action' | 'echo' | 'none';
export interface YieldFolding {
    /** 折减后的连续零增益计数（`0` = 本轮有正向证据）。 */
    zeroGain: number;
    /** **哪个信号**驱动了本次折减。 */
    signal: YieldSignalKind;
    /** 真实动作（`true` 有动作 / `false` 无动作 / `null` 取不到）。 */
    acted: boolean | null;
}
/**
 * **收益折减的单一实现**（纯函数 · 零 IO · 零抛出）。
 * @param prev 上一步的连续零增益计数
 * @param input `acted` = 真实动作（注入后是否调过工具；`null` = 不可观测）；
 *              `echoed` = 词面代理（上一步是否回引主题词；`null` = 不可观测）
 */
export declare function foldZeroGain(prev: number | undefined, input: {
    acted?: boolean | null;
    echoed?: boolean | null;
}): YieldFolding;
/** 是否已达换向阈值（`switchSource` 信号；调用方据此改变检索来源，而非继续灌同一批材料） */
export declare function shouldSwitchSource(zeroGain: number | undefined, threshold?: number): boolean;
/** 一轮待判的检索（**只带判定所需的最小事实**，不塞原文）。 */
export interface YieldRound {
    /** 回合序号（0 起；用于把判定结果对回去）。 */
    i: number;
    /** 该轮注入的材料字符数（0 = 没注入任何材料，本身就是强线索）。 */
    injectedChars: number;
    /** 材料是否被后续动作引用（**旧信号**；实测恒 false ⇒ 只能作旁证，不能作主判据）。 */
    cited: boolean;
    /** **注入之后模型实际调用了哪些工具**（新取证信号；ASCII 工具名，来自 `yield-rounds.jsonl`）。 */
    nextTools: readonly string[];
    /** 该轮之后模型做了什么（**可选**：转录摘要，当前采集层只落工具名 ⇒ 通常为空）。 */
    nextAction?: string;
}
/** 构造收益判定请求（**纯函数**：只拼文本）。 */
export declare function buildYieldRequest(rounds: readonly YieldRound[]): string;
export interface YieldJudgement {
    i: number;
    /** `true` 帮上了 · `false` 确实没帮上 · `null` 判不准（**未判**） */
    helped: boolean | null;
    why: string;
}
/**
 * 严格解析（**不猜、不兜底**）：必须是一行 JSON **数组**，每项含数值 `i`；
 * `helped` 只接受 `true|false|null`。任一项不合法 ⇒ **整体 `null`**
 *   （宁可整批判"未判"，也不接受半解析 —— 半批会静默改变换向链的长度）。
 */
export declare function parseYieldJudgements(text: string): YieldJudgement[] | null;
/**
 * 由**语义判定序列**出换向信号（替代/并列于计数法）。
 * 口径：**只有明确的 `false` 累积**；`true` 或 `null`（未判）都**打断链** ⇒ 保守不换向。
 * @param threshold 连续多少个明确 `false` 才换（与计数法同缺省 2 —— 语义不同，但行动级判据一致）
 */
export declare function switchFromJudgements(judgements: readonly YieldJudgement[], threshold?: number): boolean;
