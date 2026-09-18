/** 一条 L2 提案（形状与 `session-review#appendProposals` 写出的行一致）。 */
export interface L2Proposal {
    at?: string;
    sid: string;
    reviewedSeq?: number;
    opHash: string;
    op: string;
    /** **相对库根的路径**（如 `notes/env.md`）；绝对路径 / 越出库根 ⇒ 拒执行。 */
    target?: string;
    section?: string;
    before?: string;
    after?: string;
    why?: string;
}
export declare const proposalDirOf: (bankRoot: string) => string;
/** 已执行账（幂等键来源；只增不改）。 */
export declare const appliedLedgerOf: (bankRoot: string) => string;
/** 回滚留档目录（每 op 一份 JSON，含被改行原文）。 */
export declare const rollbackDirOf: (bankRoot: string) => string;
/** 已执行的 `opHash` 集合（幂等判据的**唯一**来源）。 */
export declare function appliedHashes(bankRoot: string): Set<string>;
/** 待执行提案（全部 `proposals-<sid>.jsonl` 减已执行）。 */
export declare function readPendingProposals(bankRoot: string): L2Proposal[];
/** 目标路径必须在库根内（**路径穿越防线**：`../` 与绝对路径一律拒）。 */
export declare function insideBank(bankRoot: string, rel: string): string | null;
export interface ApplyResult {
    ran: boolean;
    applied: number;
    skipped: number;
    reasons: string[];
    /** 逐条裁决（**可核验**：审计与测试都读它，不靠日志猜）。 */
    verdicts: Array<{
        opHash: string;
        op: string;
        verdict: 'applied' | 'skipped';
        reason: string;
    }>;
}
/**
 * 执行一批 L2 提案。**fail-closed**：`enabled !== true` ⇒ 零写入、零留档、零账行。
 * `maxPerRun`（缺省 3）与 release 同口径：单轮上限，超出留待下轮。
 */
export declare function applySessionProposals(d: {
    bankRoot: string;
    log: (m: string) => void;
    audit: (o: Record<string, unknown>) => void;
    enabled?: boolean;
    maxPerRun?: number;
}, proposals?: L2Proposal[]): ApplyResult;
