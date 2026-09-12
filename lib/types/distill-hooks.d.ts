import type { InfraApi } from './distill-infra.js';
import type { WriteApi } from './distill-write.js';
import type { ParentApi } from './distill-parent.js';
import type { WmApi } from './distill-watermark.js';
import type { AgentApi } from './distill-agent.js';
import type { DistillState } from './distill-state.js';
export interface HooksDeps {
    infra: InfraApi;
    write: WriteApi;
    parent: ParentApi;
    wm: WmApi;
    agent: AgentApi;
    st: DistillState;
    ds: {
        sessions: Map<string, any>;
        getDeepSleepStatus(): any;
    };
    ctx: any;
    config: any;
    kRoot: string;
}
/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never;
export declare function createHooksApi(dep: HooksDeps): {
    sweepBacklog: () => Promise<void>;
};
export type HooksApi = ReturnType<typeof createHooksApi>;
declare const sweepBacklog: (dep: HooksDeps) => Promise<void>;
export {};
