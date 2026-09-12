import type { EmbedCfg } from './vec.js';
import type { InfraApi } from './distill-infra.js';
import type { CandApi } from './distill-candidates.js';
import type { WmApi } from './distill-watermark.js';
import type { LlmApi } from './distill-llm.js';
import type { WriteApi } from './distill-write.js';
import type { ParentApi } from './distill-parent.js';
import type { DistillState } from './distill-state.js';
export interface AgentDeps {
    io: {
        infra: InfraApi;
        pendDir: string;
    };
    wm: {
        wm: WmApi;
        st: DistillState;
    };
    write: {
        write: WriteApi;
        bankSnapshot(label: string): Promise<void>;
    };
    llm: {
        llm: LlmApi;
        llmState: {
            providerFailCount: number;
        };
        embedCfgOf(): EmbedCfg;
    };
    cand: {
        cand: CandApi;
    };
    parent: {
        parent: ParentApi;
    };
    env: {
        config: any;
        ctx: any;
        hasDistillSignals(...a: any[]): boolean;
        DEFAULT_DISTILL_PROMPT: string;
    };
}
/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never;
export declare function createAgentApi(dep: AgentDeps): {
    distillAgent: (agent: any) => Promise<void>;
    armIdleTimer: (agent: any) => void;
    parseAgentJson: (result: any, label: string) => any;
    runDistillNow: () => Promise<{
        ok: boolean;
        sessions: number;
        note?: string;
    }>;
};
export type AgentApi = ReturnType<typeof createAgentApi>;
declare const distillAgent: (dep: AgentDeps, agent: any) => Promise<void>;
declare const armIdleTimer: (dep: AgentDeps, agent: any) => void;
declare const parseAgentJson: (dep: AgentDeps, result: any, label: string) => any;
declare const runDistillNow: (dep: AgentDeps) => Promise<{
    ok: boolean;
    sessions: number;
    note?: string;
}>;
export {};
