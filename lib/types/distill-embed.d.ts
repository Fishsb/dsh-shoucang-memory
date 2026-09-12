import type { EmbedCfg } from './vec.js';
export interface EmbedDeps {
    config: any;
}
/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never;
export declare function createEmbedApi(dep: EmbedDeps): {
    embedCfgOf: () => EmbedCfg;
};
export type EmbedApi = ReturnType<typeof createEmbedApi>;
declare const embedCfgOf: (dep: EmbedDeps) => EmbedCfg;
export {};
