import type { DistillState } from './distill-state.js';
export interface ParentDeps {
    log(m: string): void;
    config: any;
    ctx: any;
    st: DistillState;
}
export declare function createParentApi(d: ParentDeps): {
    CHILD_ACTIVE_MS: number;
    isValidParent: (p: any) => boolean;
    rememberAgent: (a: any) => void;
    isSubagentAgent: (a: any) => boolean;
    parentSidOf: (a: any) => string | null;
    noteChildActivity: (parentSid: string | null, childSid: string) => void;
    dropChild: (childSid: string) => void;
    hasActiveSubagents: (sid: string) => boolean;
    pickParent: () => any;
    resolveDefaultModel: () => {
        provider: string;
        model: string;
    } | undefined;
    ensureDaemonParent: (signal: AbortSignal, agentOptions?: {
        provider: string;
        model: string;
    } | undefined) => Promise<any>;
};
export type ParentApi = ReturnType<typeof createParentApi>;
