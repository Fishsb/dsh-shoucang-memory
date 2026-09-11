/**
 * criteria.ts — 判据内核（ADR-122 记忆核心 v2）：**L0 共用评估器 + 升格/降格裁决**，单一实现。
 *
 * 判据取值与参数唯一事实源 = `skill/engine/criteria.json` → 生成投影 `src/criteria.generated.ts`（禁手写）。
 * 本模块只做**确定性判定**（无 LLM）：把"可复用性/泛化度/稳定性/冲突性"与"升格/降格门槛"从各域 prompt 散文里
 * 抽成可调用、可审计的函数——两域（摄取 Ingestor / 巩固 Consolidator）**同调一份实现**，杜绝判据漂移。
 *
 * 用法：
 *   evaluateL0(input)                      → L0 四维枚举 + basis（依据的 criteria id，入台账）
 *   promoteVerdict('principle'|'path', s)  → 升格裁决（含 premise 硬门）
 *   demoteVerdict(s)                       → 降格/遗忘裁决（三守卫 + 画像节保护 + 单轮上限）
 */
import { CRITERIA_VERSION } from './criteria.generated.js';
export { CRITERIA_VERSION };
export type L0Reuse = 'cross-task' | 'cross-project' | 'session-only';
export type L0Generality = 'direction' | 'contract-fact' | 'detail';
export type L0Stability = 'once' | 'same-day-repeat' | 'cross-day';
export type L0Conflict = 'none' | 'coexist' | 'supersede';
export interface L0Verdict {
    reuse: L0Reuse;
    generality: L0Generality;
    stability: L0Stability;
    conflict: L0Conflict;
    /** 用了哪些判据 id（写台账，供"判据-结果一致率"对账） */
    basis: string[];
}
/** 判据参数查表（唯一事实源=注册表 → 生成投影的 CRITERIA_ROWS） */
export declare function paramOf<T = unknown>(criteriaId: string, key: string, fallback: T): T;
export interface L0Input {
    /** 待判文本（候选/条目正文；可为空=只按统计判） */
    text?: string;
    /** 同主题痕迹条数（窗口内） */
    traces?: number;
    /** 近 30 天命中日数（跨日重现信号） */
    days30?: number;
    /** 涉及会话数（跨会话信号） */
    sessions?: number;
    /** 与既有条目冲突（将被取代） */
    supersedes?: boolean;
}
/** L0 共用内核：四维枚举（两域同口径；**不打分**，避免魔法数） */
export declare function evaluateL0(input: L0Input): L0Verdict;
export interface PromoteStats {
    traces?: number;
    occurrences?: number;
    sessions?: number;
    success?: boolean;
    /** 该结论是否依赖未写出的隐含前提（premise awareness，v2 新增） */
    dependsOnPremise?: boolean;
    /** 前提是否已写进概况/正文 */
    premiseWritten?: boolean;
}
export interface Verdict {
    ok: boolean;
    reason: string;
    basis: string[];
}
/** 升格裁决：notes/候选 → [原则] / [路径]（巩固域唯一入口的确定性前置） */
export declare function promoteVerdict(kind: 'principle' | 'path', stats: PromoteStats): Verdict;
export interface DemoteStats {
    leaf?: boolean;
    status?: string;
    isStub?: boolean;
    file?: string;
    daysSinceHit?: number;
    archivedThisRun?: number;
}
/** 降格/遗忘裁决：三守卫 + 画像节保护 + 单轮上限（禁直删） */
export declare function demoteVerdict(s: DemoteStats): Verdict;
/** 检索面参数（供 vec/mcl 读取，避免各处硬编码阈值） */
export declare const SURFACE_PARAMS: {
    readonly injection: {
        readonly budgetChars: 3000;
        readonly order: 88;
        readonly relevance: true;
        readonly freshSlots: 2;
        readonly levelCaps: {
            readonly low: 2;
            readonly medium: 4;
            readonly high: 8;
            readonly smart: 10;
        };
        readonly carriers: {
            readonly profile: 3;
            readonly note: "P 层画像行每档注入上限（0=关闭 → 回滚到「画像行不注入」的旧行为）";
        };
    };
    readonly score: {
        readonly mode: "v2";
        readonly alphaRel: 1;
        readonly alphaImp: 0.25;
        readonly alphaRec: 0.1;
        readonly note: "v2.2 统一打分：score = α_rel·relevance(RRF) + α_imp·importance + α_rec·recency。**α_imp=0.25 由模拟证据选定**（scripts/shadow-sim.mjs 扫描：α=0.35→top-3 Jaccard 0.56 扰动过大；α=0.25→0.68 满足预注册判据 Jaccard≥0.6，且 corr(imp,rel)=−0.293 证明分量不冗余、扰动方向为『换进更重要条目』）。**mode=v2 已于 2026-09-11 翻转**（运行时开关 scheduler.scoreWeights=v2 同步）；回滚 = 两处同时回 legacy";
    };
    readonly recall: {
        readonly topK: 3;
        readonly topKMax: 5;
        readonly scope: "all";
        readonly coldFactorPercent: 35;
    };
    readonly fusion: {
        readonly kind: "rrf";
        readonly k: 60;
        readonly fallback: "weighted";
        readonly weights: {
            readonly dense: 0.7;
            readonly lexical: 0.3;
        };
        readonly dedupBySection: true;
    };
    readonly threshold: {
        readonly metric: "abs-cosine";
        readonly tOn: 0.65;
        readonly tOff: 0.6;
        readonly note: "ACT-024 校准：绝对余弦；归一化融合分只能排序不可做阈值";
    };
    readonly rerank: {
        readonly enabled: false;
        readonly gate: {
            readonly indexRows: 200;
            readonly followRateDropRuns: 2;
        };
        readonly note: "触发门未达前不引入 reranker（避免堆叠）";
    };
    readonly mcl: {
        readonly familiarThreshold: 0.65;
        readonly maxNudges: 1;
        readonly budgetChars: 600;
        readonly topK: 3;
    };
};
/** 成熟度（v2.2 E6）：A(0)=A0；每次**跨日再现** +step（上限 1.0）。distinctDays = 出现过的不同日数（−1 次首现）。 */
export declare function activationOf(distinctDays: number, params?: {
    readonly A0: 0.3;
    readonly step: 0.2;
    readonly gate: 0.5;
    readonly enforce: false;
    readonly note: "成熟度（v2.2 E6）：A(0)=A0；每次跨日再现 +step（上限 1.0）；只有 A≥gate 才允许升格为 [原则]/[路径]；A<gate 不注入但参与打分（implicit priming）。enforce=false 时只记录不强制（M4 影子期）。";
    readonly ledger: "audit/maturation.jsonl";
}): number;
/** 升格成熟度门（v2.2）：enforce=false（缺省，M4 影子期）时恒放行，只回带 A 供台账记录 */
export declare function maturationVerdict(A: number, enforce: boolean, params?: {
    readonly A0: 0.3;
    readonly step: 0.2;
    readonly gate: 0.5;
    readonly enforce: false;
    readonly note: "成熟度（v2.2 E6）：A(0)=A0；每次跨日再现 +step（上限 1.0）；只有 A≥gate 才允许升格为 [原则]/[路径]；A<gate 不注入但参与打分（implicit priming）。enforce=false 时只记录不强制（M4 影子期）。";
    readonly ledger: "audit/maturation.jsonl";
}): Verdict;
/** v2.2 统一打分（E 层）：score = α_rel·relevance + α_imp·importance + α_rec·recency（口径见 criteria.surface.score） */
export declare function layeredScore(input: {
    relevance: number;
    importance: number;
    recency: number;
}): number;
export declare function importanceOf(line: string): number;
