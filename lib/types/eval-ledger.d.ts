import type { EvalOutcome } from './eval-channel.js';
/** 判定来源（四问之一「谁做的」）：`eval` 评估通道 · `llm` 回落子代理 · `rule` 确定性判据 */
export type EvalSource = 'eval' | 'llm' | 'rule';
export interface EvalDecisionRecord {
    /** 判定来源 */
    source: EvalSource;
    /** 档位（local/fast/native/llm） */
    tier: string;
    /** 七态之一（**分态是核心**，不允许再塌缩） */
    outcome: EvalOutcome;
    /** 失败/拒绝的细分原因（如 `timeout` / `rate-limited:429` / `egress-not-allowed`） */
    why: string;
    /** 模型标识（⚠ 别名会漂移 ⇒ 官方建议 pin 版本 ID；账里如实记**实际应答**的标识） */
    modelId: string;
    /** 去向（四问之四「去向哪里」）—— 只落 host，不落完整 URL（URL 可能带 query 密钥） */
    destHost: string;
    /** 目标是否 loopback（本机不出机 / 否则出机） */
    destLoopback: boolean;
    /** 本次 state 字符数（形态，非内容） */
    stateChars: number;
    /** state 的 sha8（供"同一材料是否被发过"对账；**不可逆**，不泄内容） */
    stateSha8: string;
    /** 题数与题类型名（如 `['choice','boolean']`） */
    qCount: number;
    qTypes: string[];
    /** 置信度聚合（各题 confidence 的最小值；无 ⇒ null。**只作参考**：B 档不保证校准） */
    confidenceMin: number | null;
    /** 是否发生回落（四问之三）；`eval` 失败而由调用方续走 LLM/规则时为 true */
    fellBack: boolean;
    /** 耗时（毫秒） */
    latencyMs: number;
    /** 会话 id（短） */
    sid: string;
    /** 调用点标识（哪个落点用了它，如 `assoc-verdict` / `placement`） */
    point: string;
}
/** `state` 的 sha8（不可逆；只作对账，不泄内容） */
export declare const stateSha8Of: (state: string) => string;
/** 由 host 字符串判定 loopback（**不含端口/协议**，故与 `isLoopbackUrl` 互补而非重复） */
export declare const isLoopbackHost: (host: string) => boolean;
/** 从端点 URL 取 host（取不到 ⇒ 空串，**不抛**） */
export declare const hostOf: (url: string) => string;
/** 由 state + 题表构造"形态"三件（**只算形态，绝不带内容**） */
export declare function shapeOf(state: string, qTypes: readonly string[]): {
    stateChars: number;
    stateSha8: string;
    qCount: number;
    qTypes: string[];
};
/** 从各题 confidence 取聚合（最小值，保守口径）；全无 ⇒ null */
export declare function confidenceMinOf(answers: Record<string, {
    confidence: number | null;
}> | undefined): number | null;
/**
 * 拼一条落账事件（**纯函数**）。返回的对象可直接交给 `envelopeEvent(o, 'eval.decision')`。
 * 语义纪律：`type` 用 `eval.decision`（与 `mcl.*` / `score.shadow` 同族命名法）。
 */
export declare function decisionEventOf(r: EvalDecisionRecord): Record<string, unknown>;
export interface EvalLedgerStats {
    /** 按 outcome 分布（**分态统计**——"调了但失败"必须可数出来） */
    byOutcome: Record<string, number>;
    /** 按 source 分布 */
    bySource: Record<string, number>;
    /** 出机次数（destLoopback=false 且 outcome=ok ⇒ 真的发出去了） */
    egressOk: number;
    /** 回落次数 */
    fellBack: number;
    total: number;
    /** 最近 N 条**明细**（M4；N=0 时为空数组 ⇒ **不假装有明细**） */
    recent?: EvalDecisionRow[];
}
/** 一条**明细**（M4 册五「四问」本是单条属性 —— 聚合答不了"哪一条回落了、去了哪"） */
export interface EvalDecisionRow {
    at: string;
    source: string;
    tier: string;
    outcome: string;
    why: string;
    modelId: string;
    destHost: string;
    destLoopback: boolean;
    qCount: number;
    confidenceMin: number | null;
    fellBack: boolean;
    latencyMs: number;
    point: string;
}
/** 从台账**行数组**折统计（纯函数；行解析失败即跳过，不抛）。
 *  `recentN > 0` 时附最近 N 条**明细**（M4；明细里同样**不含内容**——本件从不读 state 原文）。 */
export declare function statsOfLines(lines: readonly string[], recentN?: number): EvalLedgerStats & {
    recent: EvalDecisionRow[];
};
export declare const EVAL_THRESHOLDS: {
    /** native 档（TypeSafe）：可用校准概率 ⇒ 阈值可按本库样本校准 */
    readonly native: {
        readonly high: 0.9;
        readonly low: 0.5;
    };
    /** adapter/本地档：**无真概率** ⇒ 阈值只能保守（宁可回落，不可误采信） */
    readonly weak: {
        readonly high: 0.95;
        readonly low: 0.7;
    };
};
/** 该档是否提供**原生校准概率**（决定用哪套阈值） */
export declare const isCalibratedTier: (tier: string) => boolean;
export type EvalGate = 'accept' | 'review' | 'reject';
/**
 * 按**档位能力**给判定分档（M2 册四核心）：
 *   · `native`（有校准概率）→ 用 `native` 阈值；
 *   · 其余（无概率）→ 用 `weak` 阈值；**且 confidence 缺失一律 `review`**（绝不"无置信即放行"）。
 * ⚠ fail-closed：非 `ok` 的 outcome **一律 `reject`**（调用方据此回落，**不得静默采信**）。
 */
export declare function evaluateGateOf(o: {
    outcome: string;
    tier: string;
    confidence: number | null;
}): {
    gate: EvalGate;
    why: string;
};
