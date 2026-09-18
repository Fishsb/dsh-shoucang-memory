/** 触发阈值（会审 U4 裁定：静默维保留 30min；**内容维下调**——实测段中位仅 4 ⇒ 原 ≥8 条/≥1200 事件会大面积漏触发）。 */
export declare const REVIEW_DEFAULTS: {
    readonly idleMs: number;
    readonly minNewEntries: 3;
    readonly minNewEvents: 600;
};
export interface ReviewDeps {
    kRoot: string;
    bankRoot: string;
    now: () => number;
    log: (m: string) => void;
    audit: (o: Record<string, unknown>) => void;
    /** **可调阈值**（G16 · 2026-09-19）：由配置注入（scheduler schema 的 `review*` 三键，
     *  注册表缺省见 `criteria.json#trigger.review*`）。省略 ⇒ 用 `REVIEW_DEFAULTS`。 */
    thresholds?: {
        idleMs?: number;
        minNewEntries?: number;
        minNewEvents?: number;
    };
}
/** 一条校正提案（**只提案不执行**）。 */
export interface ReviewProposal {
    op: 'revise' | 'merge' | 'demote' | 'mainline';
    target?: string;
    section?: string;
    before?: string;
    after?: string;
    why?: string;
}
export interface ReviewInput {
    sid: string;
    lastActivityMs: number;
    newEntries: number;
    newEvents: number;
    disposed: boolean;
    reviewedSeq: number;
    formatVersion?: string;
    fp?: string;
    skeleton?: string[];
    proposals: ReviewProposal[];
}
export interface ReviewRunResult {
    state: 'not-triggered' | 'skipped-by-threshold' | 'reviewed';
    reason: string;
    appended: number;
    skipped: number;
    counts: {
        manifest: number;
        failures: number;
        skeleton: number;
        proposals: number;
    };
    reviewedSeq: number;
}
export declare const sidShortOf: (sid: string) => string;
export declare const proposalPathOf: (bankRoot: string, sid: string) => string;
export declare const statePathOf: (kRoot: string) => string;
export declare const manifestPathOf: (kRoot: string, sid: string) => string;
/** 提案指纹：`op|target|section|before|after` 的稳定指纹（复用 `supply-ledger.fingerprintOf`，不另造哈希）。 */
export declare function opHashOf(p: ReviewProposal): string;
/** 读本会话的复盘状态（**末行生效**：本流按 sid 追加，读数取该 sid 最后一条）。 */
export declare function readReviewState(d: ReviewDeps, sid: string): {
    reviewedSeq: number;
    formatVersion?: string;
    fp?: string;
} | null;
/** 触发判定（三态可分辨）。
 *  ⚠ **阈值可调**（G16 · 2026-09-19）：运行期优先取 `d.thresholds`（由配置/schema 传入，
 *  注册表缺省见 `criteria.json#trigger.review*`）；`REVIEW_DEFAULTS` 只作**注册表缺席时**的兜底
 *  （保持"另有一份默认"≠"两份事实源"：本函数不做第二套解释，只是取不到就用常数）。 */
export declare function decideReview(d: ReviewDeps, i: {
    sid: string;
    lastActivityMs: number;
    newEntries: number;
    newEvents: number;
    disposed: boolean;
}): {
    state: 'not-triggered' | 'skipped-by-threshold' | 'ready';
    reason: string;
};
/** 材料装配：**只读**（清单流 + 失败明细 + 骨架由调用方经 S2 侧提供，本件不读会话原文）。 */
export declare function buildMaterials(d: ReviewDeps, sid: string, skeleton?: string[]): {
    manifest: string[];
    failures: string[];
    skeleton: string[];
    counts: {
        manifest: number;
        failures: number;
        skeleton: number;
    };
};
/** 已存在的提案指纹（幂等判定用；只读末尾若干行）。 */
export declare function existingOpHashes(d: ReviewDeps, sid: string): Set<string>;
/** 追加提案（**append-only**，幂等：同 `(sid, reviewedSeq, opHash)` 第二次即跳过）。 */
export declare function appendProposals(d: ReviewDeps, sid: string, reviewedSeq: number, proposals: ReviewProposal[], extra?: {
    formatVersion?: string;
    fp?: string;
}): {
    appended: number;
    skipped: number;
};
/** 推进状态（**只在真正产出后**调用；与水位同纪律）。 */
export declare function writeReviewState(d: ReviewDeps, sid: string, reviewedSeq: number, extra?: {
    formatVersion?: string;
    fp?: string;
}): void;
/**
 * 跑一次会话级复盘：判定 → 材料 → 提案落盘 → 状态推进 → 审计一行（**三态之一**）。
 * 「复盘」这一步（LLM）由调用方注入 `review`（材料进、提案出）——本件因此**可单测**，且不自己读会话原文。
 */
export declare function runSessionReview(d: ReviewDeps, input: {
    sid: string;
    lastActivityMs: number;
    newEntries: number;
    newEvents: number;
    disposed: boolean;
    skeleton?: string[];
    reviewedSeq?: number;
    fp?: string;
}, review: (m: {
    manifest: string[];
    failures: string[];
    skeleton: string[];
}) => Promise<ReviewProposal[]>): Promise<ReviewRunResult>;
