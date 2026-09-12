import type { InfraApi } from './distill-infra.js';
import type { EmbedCfg } from './vec.js';
import type { DistillState } from './distill-state.js';
export interface ActDeps {
    actShadowFile: string;
    embedCfgOf(): EmbedCfg;
    actConf: {
        on: number;
        off: number;
        cooldown: number;
        topK: number;
    };
    actState: Map<string, {
        state: 'idle' | 'prefetch';
        cooldown: number;
        prevScore: number;
    }>;
    infra: InfraApi;
    st: DistillState;
    config: any;
}
/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never;
export declare function createActApi(dep: ActDeps): {
    activationStep: (sid: string, event: any) => Promise<void>;
};
export type ActApi = ReturnType<typeof createActApi>;
declare const activationStep: (dep: ActDeps, sid: string, event: any) => Promise<void>;
export {};
