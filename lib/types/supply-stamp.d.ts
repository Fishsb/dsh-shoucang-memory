export interface SupplyStamp {
    /** **库戳**：三索引（AGENT/USER/MEMORY）的 `size:mtimeMs` —— 睡眠/蒸馏落盘即变 */
    lib: string;
    /** **介质戳**：`audit/activity.jsonl` + `audit/sleep-reports.jsonl`（派生源）+ `delta.md`（兜底源）—— 上游产物，变更罕见且不绑定查询 */
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
 * ⚠ **介质戳加源（S2S3 册四 · 2026-09-19）**：注入侧「最近成长」的主源已换成**睡眠汇报派生**
 *   （`panel-shared#readDawnGrowth` ← `sleep-report#latestDerivation`）⇒ 第三条介质
 *   `audit/sleep-reports.jsonl`（`size:mtimeMs`）必须**同轮进键**，否则**派生在变而缓存不失效**。
 *   旧介质 `delta.md` **保留在键内**：它**未退役**（§5-U2 待拍板）且是**兜底源**（派生为空时读它）——
 *   留着它不违背"抽掉一条失效介质"那条判据，反而是那条判据要求的（退役时才同轮移除）。
 *   ⚠ `delta.md` 的键口径一并**收紧为 `size:mtimeMs`**（原为纯 size，与另两条不一致）：实测
 *   `test-inject-cache` S2c——**过期的 delta.md 同尺寸改内容**时旧口径签不出来 ⇒ 缓存继续供旧块
 *   （"过期即弃"这条旧语义被静默绕过）；收紧后同尺寸改写也会失效。
 *   **为什么不签留存面 `reports/sleep/*.md`**：它是 append-only 的**人读面**，每轮增长**不代表派生内容变**
 *   —— 签它会让注入缓存"每轮必失效"（会审 §3.4 介质戳条款给的另一条出路：**声明不参与 + 记录理由**）。
 *   等价性：一轮深睡 ⇒ 派生行变 + 该流 append ⇒ 戳变（与旧 delta.md 被覆盖写同频）；无新轮 ⇒ 戳不变。
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
