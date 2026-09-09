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
 * 2026-09-09（向量默认启用）：词法打底为空时**不再直接返回**——若向量开，对全部索引行做向量检索
 * （语义相似但措辞不同是融合召回的真正价值场景，如「任务怎么不踩坑」vs 索引行「结果验证重实证」）；
 * 词法候选与全量行集合并后统一向量化（缓存命中免重复嵌入）。索引行数受容量红线约束（数十行级），
 * 一次全量补齐预算可控，非「全部 notes 正文」——仍是薄行。
 */
export declare function recallRanked(root: string, query: string, topK: number, scope: 'agent' | 'all', cfg: EmbedCfg): Promise<{
    rows: RecallRow[];
    tokens: string[];
    mode: 'lexical' | 'fusion';
}>;
