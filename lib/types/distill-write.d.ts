import type { RouteTarget } from './targets.js';
import type { RunResult } from './distill-proc.js';
import type { EmbedCfg } from './vec.js';
import type { InfraApi } from './distill-infra.js';
import type { CandApi } from './distill-candidates.js';
import type { LlmApi } from './distill-llm.js';
import type { DistillState } from './distill-state.js';
export interface WriteDeps {
    kRoot: string;
    pendDir: string;
    embedCfgOf(): EmbedCfg;
    infra: InfraApi;
    cand: CandApi;
    llm: LlmApi;
    st: DistillState;
    config: any;
    /**
     * ACT-293 · 评估通道消费面（**可选**）：
     *   `undefined` ⇒ 不接（缺省；评估关闭时装配层不传）⇒ 行为与改造前逐字节一致。
     *   接线点 = 索引行**落盘成功后**（只读复核，**不阻断写入**）。
     *   能力依据见 `_memory/audit/consumer-compare.mjs`（三模型对照：假阳性 15–50%）。
     */
    auditIndexLine?(line: string, at: {
        sid: string;
        target: string;
    }): Promise<void>;
}
export declare function createWriteApi(dep: WriteDeps): {
    liveCaps: () => {
        agent: number;
        user: number;
        memory: number;
    };
    capEnv: () => Record<string, string>;
    memAppend: (target: string, kind: "append" | "new", payload: string, section: string, t: RouteTarget) => Promise<RunResult>;
    normalizeProfileTarget: (raw: string) => "USER.md" | "AGENT.md" | null;
    profileCapOf: (canon: "USER.md" | "AGENT.md") => number;
    PROFILE_HEADER: Record<string, string>;
    writeProfileLine: (root: string, target: string, section: string, line: string, replaceMatch?: string | undefined) => {
        st: "added" | "dedup" | "failed";
    } | {
        st: "rejected";
        why: string;
    };
    registerIndexMeta: (root: string, targetFile: string, indexLine: string, sid: string) => void;
    writeDispatch: (sid: string, out: any, route: string, workspace: string | null) => Promise<{
        added: number;
        rejected: number;
        failed: number;
        undigested: number;
        needsAnchor: number;
        pairedSkipped: number;
        items: Array<Record<string, string>>;
        targetLib: string;
    }>;
    flushDeferCards: () => Promise<{
        written: number;
        kept: number;
    }>;
    MAX_DISPATCH_RETRY: number;
    hasPendingUndigested: (sid: string) => boolean;
    CLAIM_TTL_MS: number;
    claimDirOf: () => string;
    claimFileOf: (sid: string) => string;
    tryClaim: (sid: string, lastSeq: number, maxSeq: number) => boolean;
    claimHeld: (sid: string) => boolean;
    releaseClaim: (sid: string) => void;
};
export type WriteApi = ReturnType<typeof createWriteApi>;
export declare const classifyMemFailure: (text: string) => {
    kind: "needsAnchor" | "rejected" | "undigested";
    marker: string;
};
declare const pairKeyOf: (target: string, section: unknown) => string;
export { pairKeyOf };
/**
 * 册二：给定索引行 → 其**未成对**（明细未落地）的指针描述（空数组 = 该行可落）。
 * 抽成**导出纯函数**是为了可机检：直接驱动 `writeDispatch` 会经 `resolveTarget()`/子进程写**真库**（红线禁止），
 * 故判据只驱动本函数（`scripts/check-pointer-pairing.mjs`），并把"新判定 vs 旧规则"的**判别力**一并断言。
 */
export declare const unpairedPointersOf: (line: string, failedPairs: ReadonlySet<string>, failedFilesWide: ReadonlySet<string>) => string[];
/** 册二：回退队列文件路径（**单一实现已下沉 `pointer-deficits#knowledgeDeferFileOf`**，此处只转发） */
export { knowledgeDeferFileOf } from './pointer-deficits.js';
