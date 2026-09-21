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
/**
 * 段结果**归类**（纯函数 · ACT-295 自 `distillAgent` 抽出为模块级）。
 *
 * 抽出的硬理由：`distillAgent` 受 `audit-fnspan` 的「**>400 行的函数 ≤ 0 个**」棘轮约束，
 *   本链内联后实测 **406 行** ⇒ 就地即破。抽出后 ① 回到棘轮内；② 同一判据可单测（纯输入→枚举）。
 *
 * 语义与抽出前**逐字一致**（顺序敏感，不可重排）：
 *   无输出 ⇒ json-parse；未完成 ⇒ provider-fail/agent-stop；discard ⇒ discard；
 *   未消化 ⇒ dispatch-failed；缺锚 ⇒ needs-anchor；被拒 ⇒ gate-reject；否则 ok。
 * `failReason` 落**最小可诊断集**（计数/目标库/stop）—— 起因：实测 113 条失败审计行**零成因字段**，
 *   45% 失败率却不可诊断（判据 `test-fail-taxonomy` 系）。
 */
export declare function classifySegment(i: {
    hasOut: boolean;
    stop: string;
    useProvider: boolean;
    route: string;
    undigested: number;
    added: number;
    rejected: number;
    needsAnchor: number;
    targetLib: string;
    llmLabel: string;
}): {
    fclass: string;
    failReason: string;
};
/** 蒸馏子代理（段循环 + 派单 + 写回 + 审计）。 */
declare const distillAgent: (dep: AgentDeps, agent: any) => Promise<void>;
declare const armIdleTimer: (dep: AgentDeps, agent: any) => void;
declare const parseAgentJson: (dep: AgentDeps, result: any, label: string) => any;
declare const runDistillNow: (dep: AgentDeps) => Promise<{
    ok: boolean;
    sessions: number;
    note?: string;
}>;
export {};
