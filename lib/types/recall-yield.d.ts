/** 连续未引用多少次即认为「该来源线索已变弱」（对齐人类"线索变弱即换向"；缺省 2） */
export declare const SWITCH_THRESHOLD = 2;
/** 折一次收益：合规 ⇒ **归零**（来源仍有效）；不合规 ⇒ 递增（线索在变弱） */
export declare function nextZeroGain(prev: number | undefined, compliant: boolean): number;
/** 是否已达换向阈值（`switchSource` 信号；调用方据此改变检索来源，而非继续灌同一批材料） */
export declare function shouldSwitchSource(zeroGain: number | undefined, threshold?: number): boolean;
/** 收益读数（供诊断聚合；纯函数、含分母口径——合规率**必须有分母**，仓内曾因只在失败分支落账而无分母） */
export declare function yieldOf(rows: ReadonlyArray<{
    compliant?: boolean;
}>): {
    total: number;
    compliant: number;
    rate: number | null;
};
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
