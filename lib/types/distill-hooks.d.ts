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
/**
 * 事件钩子 + 工具注册（自 registerDistill 迁出）。
 * 为什么整块搬：这 3 个 ctx.on + 5 个 ctx.effect 连注释占 ~86 行，是装配函数里**唯一**的体积来源；
 *   它们虽是"注册"语义，但体积上让 registerDistill 无法满足 I1（≤120 行）。
 *   搬出后装配层只剩「构造依赖 → 调 mount → 返回句柄」，判据里的三条都成立。
 * ⚠ ctx 单独传（注册必须挂在宿主上下文上），其余依赖走 HooksDeps。
 */
export declare function mountDistillEvents(ctx: any, dep: HooksDeps): void;
export {};
