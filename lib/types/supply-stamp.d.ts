export interface SupplyStamp {
    /** **库戳**：三索引（AGENT/USER/MEMORY）的 `size:mtimeMs` —— 睡眠/蒸馏落盘即变 */
    lib: string;
    /** **介质戳**：`audit/activity.jsonl` + `delta.md` 的 size（上游产物；变更罕见且不绑定查询） */
    media: string;
    /** **观测字段**（`warm-recall.json` 的 `size:mtimeMs`）—— **不参与失效**，理由见头注 */
    warm: string;
    /** 取戳时刻（`Date.now()`） */
    at: number;
}
/**
 * **取戳（单一实现）**：库戳 ∪ 介质戳 ∪（观测用的）warm 戳。`memRoot` 缺省 = `memoryLibRoot()`；
 * `kRoot` 缺省 = `knowledgeRoot()`。零抛出（不可读一律回落占位）。
 *
 * ⚠ **此处不做节流**（实测教训 · 2026-09-18）：本函数被**内层**（`buildHotMemoryText` 的 30s 键）
 *   与**外层**（`panel-inject` 的事件判据）共用，而内层判据的要求是「**落盘即失效**」——
 *   一度在此加 5s 记忆化 ⇒ `test-inject-cache` 的 S1/S2/S3 当场三红（"改了介质却不重建"）。
 *   节流的正确位置是**外层调用点**（每步一次、可容忍 5s 延迟），不是本函数。
 *   代价：每次取戳 6 次 `statSync`（微秒级，与既有实现同量级）。
 */
export declare function libStampOf(memRoot?: string, kRoot?: string, now?: number): SupplyStamp;
/** **失效键**：只由 `lib` + `media` 组成（**不含 `warm`**，理由见头注；也不含会话/查询 —— 那些走事件戳） */
export declare function stampKeyOf(s: SupplyStamp): string;
/** 便于诊断的短摘要（只读；不出现在失效键里） */
export declare function stampSummaryOf(s: SupplyStamp): {
    lib: number;
    media: number;
    warm: number;
    at: number;
};
/** `warm-recall.json` 是否存在（观测用；`/inject/stats` 的 `warmBridge` 位） */
export declare function warmBridgeExists(kRoot?: string): boolean;
/** `warm-recall.json` 的**键**（观测：注入侧能否读到本步 query 的桥；不参与失效） */
export declare function warmBridgeKeyOf(kRoot?: string): string;
export type CacheLayer = 'none' | 'session' | 'context' | 'query' | 'event' | 'ttl';
/** `injectCacheReason` 的返回值 → 层（**映射单点**；新 reason 必须先在此登记，否则机检会红） */
export declare function layerOfReason(reason: string): CacheLayer;
