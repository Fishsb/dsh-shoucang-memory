import { type RecallRow } from './targets.js';
export interface EmbedCfg {
    enabled: boolean;
    baseUrl: string;
    model: string;
    apiKeyEnv: string;
}
export declare function cosine(a: number[], b: number[]): number;
/**
 * 读侧召回（向量档就绪时）：词法 topK 打底 → 行向量惰性补齐 → dense topK 候选 → 0.7dense ⊕ 0.3lex 融合重排。
 * 返回行附带 fused/dense；向量不可用（未配置/失败/缓存空且无 key）时 = 纯词法结果（dense=undefined）。
 */
export declare function recallRanked(root: string, query: string, topK: number, scope: 'agent' | 'all', cfg: EmbedCfg): Promise<{
    rows: RecallRow[];
    tokens: string[];
    mode: 'lexical' | 'fusion';
}>;
