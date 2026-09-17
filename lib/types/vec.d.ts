import { type RecallRow } from './targets.js';
export interface EmbedCfg {
    enabled: boolean;
    baseUrl: string;
    model: string;
    apiKeyEnv: string;
    coldFactor?: number;
    /** v2（ADR-122）：融合策略——'rrf'（缺省，排名融合 k=60）| 'weighted'（旧 min-max 加权，回滚用） */
    fusionKind?: 'rrf' | 'weighted';
    /** v2.2（ADR-130）：打分公式 'legacy'（缺省）| 'v2'（α_rel/α_imp/α_rec 分层打分） */
    scoreMode?: string;
    /** v2.2：影子打分（并行算 v2 并写 audit/score-shadow.jsonl，不改排序） */
    shadowScore?: boolean;
}
export declare const vecStats: {
    queries: number;
    lastMode: "lexical" | "fusion";
    lastMs: number;
    lastAt: number;
    lastQuery: string;
    lastHit: string;
};
/** 余弦相似度（**只读入参** ⇒ 签名用 `readonly`：调用方无需为传参复制数组）。 */
export declare function cosine(a: readonly number[], b: readonly number[]): number;
/** 清向量缓存（2026-09-10 P0）：删磁盘缓存 + 清内存——换 embedding 模型后调用，旧模型向量全部失效 */
export declare function clearVecCache(): {
    cleared: boolean;
    removed: number;
    reason?: string;
};
/**
 * 缓存**压缩决策**（纯函数 · 可单测 · 与 `ledger-compact#planCompaction` 同范式）。
 *
 * **为什么"保留每个键的最后一次写入"是等价、而不是权衡取舍**：
 *   `loadCache` 按**行序** `Map.set` ⇒ 同键后写覆盖先写 ⇒ 内存态本来就只认最后一次。
 *   故压缩后重新 `loadCache` 得到的映射**逐键相同**（`scripts/test-vec-cache-compact.mjs` 直接断言；
 *   反例是"保留第一次"—— 那会让内容不同的键变值，测试即红）。
 *
 * 超限处理：按**行号**（= 写入先后）保留最新的，从最旧的开始丢，直到装进 `capBytes`。
 * 返回保持**原文件行序**（`loadCache` 是 last-wins，序不影响等价性；保持序便于人读与对拍）。
 */
export declare function planVecCompaction(lines: string[], capBytes: number): string[];
/**
 * 对缓存文件执行压缩（**原子替换** + `.bak-compact-<ts>` 备份，与 `ledger-compact` 同纪律；**零抛出**）。
 * @returns `'compacted'` | `'noop'`（未超限）| `'missing'`
 */
export declare function compactVecCache(capBytes?: number): 'compacted' | 'noop' | 'missing';
/**
 * 通用语义相似（v6 向量政策第二批 2026-09-10）：任意两段文本的向量余弦（dense 决策信号）。
 * 未启用/失败 → null（调用方自行词法/阈值兜底，闭环不中断）。嵌入不落缓存（单次使用）。
 */
export declare function semanticSim(a: string, b: string, cfg: EmbedCfg): Promise<number | null>;
/**
 * **批量取嵌入**（2026-09-13 导出 · 供「联想生成」这类需要在**向量空间**里找关系的调用方复用）。
 * 为什么必须批量：逐对调 `semanticSim` 会退化成 O(n²) 次 HTTP + 缓存 IO；而**联想需要全对相似度**
 * ——它恰恰要在**词面不重叠**的地方找"异域同构"（见 `association-propose.ts`）。
 * 语义与 `semanticSim` 完全一致（同一 `embedTexts` 实现），失败/不可用 ⇒ `null`（调用方如实记"未判"）。
 */
export declare function embedMany(cfg: EmbedCfg, texts: readonly string[]): Promise<number[][] | null>;
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
