import { type EvalConfigFields } from './eval-config.js';
export interface EvalDeps {
    /** 生效配置（经 `evalOptionsOf` 投影后传入，不由本件去读盘） */
    cfg: EvalConfigFields;
    /** key 取值口（**不落盘**；由调用方从进程环境取，本件不碰 `process.env[name]` 之外的任何来源） */
    env: (name: string) => string | undefined;
    log(m: string): void;
}
export type EvalOutcome = 'ok' | 'off' | 'egress-denied' | 'key-missing' | 'unreachable' | 'bad-body' | 'type-violation';
export interface EvalStateRow {
    tag: string;
    text: string;
    pointer?: string;
}
/** 行级准入：只收已提炼断言形态（空文本/自由长文一律拒） */
export declare function admitStateRow(r: EvalStateRow): {
    ok: boolean;
    why: string;
};
/**
 * 组装 state（**白名单函数**，不是过滤器）：白名单外**拒发并如实报**，不静默丢弃。
 * @returns `text` = 组装好的 state；`rejected` = 被拒行（供落账，**不隐藏**）
 */
export declare function buildEvalState(rows: readonly EvalStateRow[], cap?: number): {
    text: string;
    rejected: number;
    used: number;
};
export interface EvalChoiceQ {
    type: 'choice';
    instructions: string;
    criteria: Record<string, string>;
}
export interface EvalBoolQ {
    type: 'boolean';
    instructions: string;
}
export interface EvalScoreQ {
    type: 'score';
    instructions: string;
    criteria: string[];
}
export type EvalQuestion = EvalChoiceQ | EvalBoolQ | EvalScoreQ;
export declare function parseEvalAnswers(raw: string, qs: Record<string, EvalQuestion>): {
    ok: true;
    answers: Record<string, {
        value: unknown;
        confidence: number | null;
    }>;
} | {
    ok: false;
    why: string;
};
/**
 * 执行一次评估（**fail-closed**：任何不确定都返回 `ok:false` 并给**分态**原因，绝不猜）。
 * 调用方据 `outcome` 决定：`ok` 用值；其余一律**回落**（保持现状），**不得静默采信**。
 *
 * ⚠ **超时值按端点类别分层**（实测归因，非拍脑袋）：`vec.ts:249` 的「云端 8s」直接照抄会误杀本机档——
 *   真机实测本机 `qwen3:8b` 单次 chat **8459ms**（冷启更久），8s 超时 ⇒ `outcome:'unreachable' · why:'timeout'`。
 *   本地推理档含**模型加载 + 生成**，故给 60s；远端（Jev 类快模型）百毫秒级，给 15s。
 */
export declare function evaluate(d: EvalDeps, state: string, questions: Record<string, EvalQuestion>, timeoutMs?: number): Promise<{
    outcome: EvalOutcome;
    why: string;
    answers?: Record<string, {
        value: unknown;
        confidence: number | null;
    }>;
    latencyMs: number;
}>;
/** 连通性测试（供 `/eval/test` 只读出口；**不落库、不写盘**） */
export declare function probeEndpoint(d: EvalDeps, timeoutMs?: number): Promise<{
    ok: boolean;
    outcome: EvalOutcome;
    why: string;
    latencyMs: number;
    answers?: Record<string, {
        value: unknown;
        confidence: number | null;
    }>;
}>;
