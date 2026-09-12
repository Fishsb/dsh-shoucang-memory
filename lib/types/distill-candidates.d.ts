import type { EmbedCfg } from './vec.js';
export interface CandDeps {
    candidateDir: string;
    embedCfgOf(): EmbedCfg;
    ledger(o: Record<string, unknown>): void;
}
/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never;
export declare function createCandApi(d: CandDeps): {
    intentOf: (deltaText: string) => string;
    intentTokens: (text: string) => string[];
    cardTokens: (text: string) => string[];
    cardSimilar: (a: string, b: string) => number;
    ensureFlowCandidate: (sid: string, intent: string) => Promise<void>;
};
export type CandApi = ReturnType<typeof createCandApi>;
export declare const CANDIDATE_NOISE: RegExp[];
/** 文本是否宿主注入样板（见上：候选区与采样共用的单一实现） */
export declare const isNoiseIntent: (s: string) => boolean;
declare const intentOf: (d: CandDeps, deltaText: string) => string;
declare const intentTokens: (d: CandDeps, text: string) => string[];
declare const cardTokens: (d: CandDeps, text: string) => string[];
declare const cardSimilar: (d: CandDeps, a: string, b: string) => number;
declare const ensureFlowCandidate: (d: CandDeps, sid: string, intent: string) => Promise<void>;
export {};
