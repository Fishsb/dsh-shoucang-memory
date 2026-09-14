import type { InfraApi } from './distill-infra.js';
import type { WriteApi } from './distill-write.js';
import type { ParentApi } from './distill-parent.js';
import type { WmApi } from './distill-watermark.js';
import type { AgentApi } from './distill-agent.js';
import type { BankApi } from './distill-bank.js';
import type { ActApi } from './distill-activation.js';
import type { LlmApi } from './distill-llm.js';
import type { DistillState } from './distill-state.js';
export interface HooksDeps {
    io: {
        infra: InfraApi;
        kRoot: string;
        SHORT: string;
    };
    dom: {
        write: WriteApi;
        parent: ParentApi;
        wm: WmApi;
        distill: AgentApi;
        act: ActApi;
        llm: LlmApi;
        bank: BankApi;
    };
    state: DistillState;
    sleep: {
        sessions: Map<string, any>;
        noteEvent(sid: string, isTurnEnd: boolean): void;
        deepSleepCheck(): void;
        DEEP_SLEEP_CHECK_MS: number;
        getDeepSleepStatus(): any;
    };
    env: {
        ctx: any;
        config: any;
    };
}
/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never;
export declare function createHooksApi(dep: HooksDeps): {
    sweepBacklog: () => Promise<void>;
};
export type HooksApi = ReturnType<typeof createHooksApi>;
declare const sweepBacklog: (dep: HooksDeps) => Promise<void>;
export declare function mountDistillEvents(ctx: any, dep: HooksDeps): void;
export {};
