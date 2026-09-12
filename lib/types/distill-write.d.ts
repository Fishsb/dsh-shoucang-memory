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
