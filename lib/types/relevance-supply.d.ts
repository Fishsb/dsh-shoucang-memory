import { type RecallRow } from './targets.js';
import { type EmbedCfg } from './vec.js';
/** 相关性分层（IR1 §3 ② 的三层配额；`other` 只是归类兜底，不进配额） */
export type RelevanceLayer = 'memory-index' | 'agent-principles' | 'profile' | 'other';
/** 分层配额（条数）。`agentPrinciples` **保底 1**：认知层是"最该按任务浮现"的那批（实测 AGENT 命中占 8/8） */
export interface RelevanceQuota {
    memoryIndex: number;
    agentPrinciples: number;
    profile: number;
}
/** 按动态面 cap 派生分层配额（**单一实现**；cap 归知识索引面，原则面取 1/4 且封顶 3） */
export declare function quotaOf(cap: number): RelevanceQuota;
/**
 * 行 → 层。判据**只认注册表**（`highConfCarrierSet` = 注册表 `mclGate: true` 的标签集，
 *   实测 = `{原则, 路径}`）——不另写标签名单（那是同一事实的第二份副本，会随注册表演进而静默漂移）。
 * `USER.md` 与 `AGENT.md` 的其余行归 `profile`（画像/事实型；本槽缺省配额 0 ⇒ 不占动态面）。
 */
export declare function layerOf(file: string, line: string): RelevanceLayer;
/** 桥（`warm-recall.json`）的**单一路径**实现（写侧 `mcl.ts` 与读侧本件必须同源） */
export declare function warmBridgeFile(): string;
/** 桥的可用性（**显式枚举**：每一种"为什么没读到"都要能被记账，不合并成一句"不可用"） */
export type BridgeMiss = '' | 'bridge-missing' | 'bridge-unreadable' | 'bridge-stale' | 'bridge-key-mismatch' | 'bridge-empty';
/** 桥 / 词法都取不回时的原因（A3 · A5 的判据面）。
 *  词表：`''`（未发生降级）· `bridge-missing|bridge-unreadable|bridge-stale|bridge-key-mismatch|bridge-empty`
 *  · `zero-hit`（桥与词法**都**取不回）· **复合形态** `<bridge-reason>|zero-hit`（先降级、再零命中 —— 两步都要留下） */
export type RelFallback = '' | BridgeMiss | 'zero-hit' | string;
export interface RelevanceTrace {
    /** 实际生效的通道：`bridge`（向量融合预热）/ `lexical`（词法）/ `positional`（位置式基线） */
    source: 'bridge' | 'lexical' | 'positional';
    /** 桥/词法失败原因（`''` = 未发生；**不得静默**） */
    fallback: RelFallback;
    /** 各通道候选数（N=0 显式记 0） */
    hits: {
        bridge: number;
        lexical: number;
    };
    /** 桥与词法**都**取不回 ⇒ 本步相关性零命中（调用方须在注入面注明） */
    zeroHit: boolean;
    /** 分层配额下实际入选的层分布（可核验"哪层供上了"） */
    byLayer: Record<RelevanceLayer, number>;
}
export interface RelevanceDeps {
    /** 记忆库根（三索引所在；只读 `MEMORY.md`/`AGENT.md`/`USER.md`） */
    memRoot: string;
    /** 本步任务文本（空 ⇒ 不铺相关性，走位置式基线 —— 与既有语义一致） */
    q: string;
    /** 动态面行数上限（= `budgetOf().dynamic` 派生的 cap） */
    cap: number;
    /** 桥文件路径（缺省 `warmBridgeFile()`；显式可传以便单测夹具） */
    bridgeFile?: string;
    /** 桥有效期（缺省 120s，与 `mcl.ts` 写侧的既有取舍一致） */
    ttlMs?: number;
    /** 判定时刻（**显式传入**，不吃隐式 now ⇒ 同输入必同输出、可复现） */
    now?: number;
    /** 分层配额覆盖（缺省 `quotaOf(cap)`；单测用） */
    quota?: RelevanceQuota;
    /**
     * **恒定面已持有的行**（调用方传：`agentLines ∪ userLines` 的候选集）——相关性面必须**排除**它们。
     * 判因（2026-09-18 真机实测）：相关性通道按契约**不限层**（它本就是 `gated:index` 渲染器），于是
     *   `always` 层的索引行既在恒定面、又被选进动态面 ⇒ **同一行在注入文本里出现两次**
     *   （实测 2 行重复），且被恒定面裁掉的行会"从动态面复活" ⇒ 账（哪一槽丢了什么）不可核。
     * 契约依据：P 层 ⇒ `always`（恒定面**归属**它们），动态面只该补 **gated** 的按需行。
     */
    exclude?: readonly string[];
}
export interface RelevanceResult {
    /** 相关性面入选行（**未裁切**；裁切归调用方/装配器） */
    picked: string[];
    trace: RelevanceTrace;
}
/**
 * 读桥：**纯读、零抛出**。返回 `reason` 说明为什么没读到（`''` = 读到且可用）。
 * 判据与写侧同源：`key === recallKeyOf(q)`（同键才可比）+ `now - at < ttl`。
 */
export declare function readWarmBridge(file: string, q: string, now: number, ttlMs?: number): {
    rows: RecallRow[];
    miss: BridgeMiss;
};
/** 位置式基线的零值 trace（`source:'positional'` 且无失败原因 —— "还没到相关性那一步"，不是失败） */
export declare function emptyTrace(): RelevanceTrace;
/** 逐层取行（层内按调用方给的序 = 相关性序，**本件不重排**）；层间序固定为 memory-index → agent-principles → profile
 *  `exclude`（恒定面已持有的行）在**分组之前**剔除 —— 排除必须发生在配额结算**之前**，否则配额会被
 *  注定不入选的行占掉（"先扣名额再排除"＝假配额）。 */
export declare function pickByLayer(rows: readonly RecallRow[], quota: RelevanceQuota, cap: number, exclude?: readonly string[]): {
    picked: string[];
    byLayer: Record<RelevanceLayer, number>;
};
/**
 * 相关性选行（**同步**：注入回调读它）。
 * 顺序即判据：**桥（向量融合）→ 词法 → 位置式基线**；每一次降级都记入 `trace.fallback`。
 */
export declare function selectRelevantLines(d: RelevanceDeps): RelevanceResult;
/** 零命中时注入面的**如实注明**（A5；`''` = 不注明）。口径：只有**非空 query 且真零命中**才注明。 */
export declare function relevanceNoteOf(trace: RelevanceTrace | undefined, q: string): string;
export interface PreheatDeps {
    /** 预热用的 query（**必须与注入面取到的 `q` 同源同文本**，否则键不匹配=白预热） */
    q: string;
    /** 嵌入配置（`panel-inject#effectiveEmbed` 与 `mcl` 同源语义） */
    embed: EmbedCfg;
    /** 记忆库根（缺省 `memoryLibRoot` 语义由调用方给；本件不猜） */
    root: string;
    /** 桥文件路径（缺省 `warmBridgeFile()`） */
    bridgeFile?: string;
    /** 一次预热带回的行数（缺省 12：分层配额之后仍有余量） */
    topK?: number;
    /** 单次预热的上限毫秒（缺省 2500；超时即放弃本步预热 —— 注入面走词法/位置式并**记账**） */
    timeoutMs?: number;
    /** 判定时刻（显式传入以便测试；缺省 now） */
    now?: number;
}
export interface PreheatResult {
    ok: boolean;
    rows: number;
    /** 失败/跳过原因（`ok:false` 时非空）：`skip-fresh`（桥已新鲜，免重复嵌入）/ `timeout` / `no-query` / `error` */
    reason: '' | 'skip-fresh' | 'timeout' | 'no-query' | 'error';
    ms: number;
}
/**
 * **预热**：把本轮 query 的融合召回结果写进桥 —— 注入回调是**同步**的，读桥是它唯一的向量通路。
 *
 * 复用三件既有物（**零新机制**）：桥文件格式（与 `mcl.ts` 写侧同形）· `recallRanked`（既有融合实现）·
 *   既有异步扩展点 `agent/pre-step`。幂等：桥新鲜且键相同 ⇒ 直接 `skip-fresh`（不重复嵌入）。
 */
export declare function preheatWarmRecall(d: PreheatDeps): Promise<PreheatResult>;
