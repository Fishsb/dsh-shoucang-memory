/**
 * assertion-graph.ts — **断言图内核**（G0 · 2026-09-13 · 用户拍板「**合并**」路线）
 *
 * ## 决策与路线（用户拍板）
 * 字面目标是「SQLite 断言图内核」。**拍板结论：走「合并」，不「并存」**——
 *   **不新开第二个事实源**（不引入 SQLite 库），断言图**建在既有 Record 事实源 + 环事件流之上**。
 * 理由（架构级）：本仓已有一份事实源（`records.jsonl` + `ring-events.jsonl` 可重放重建）与
 *   一套 md 投影。再加一个 SQLite 库 = **同一事实两份权威**，必然漂移——本仓已在别处反复吃过这个亏
 *   （惰性桥 6 处副本 · 信封写法 6 处副本 · 三处版本记录各说各话）。
 *   ⇒ 断言图的价值在**关系**（谁回答谁 · 谁撞到谁 · 谁指向哪条证据 · 谁替代了谁），
 *     而关系**本来就在记录字段与事件里**，不需要第二个库。
 *
 * ## 图形（节点 = 记录与外部锚；边 = 记录里**已经写着**的关系）
 * | 边 | 来源字段 | 语义 |
 * |---|---|---|
 * | `answers` | `outcome.meta.decisionId` | 后果回收：这条实测**回答**了那个决策 |
 * | `collision` | `association.meta.a/b`（+ `landed`） | 联想环：撞上两个 §，是否已落地 |
 * | `commitment` | `commitment.meta.who/direction/status` | 关系环：欠谁/谁欠、是否已兑现 |
 * | `relation` | `relation.meta.who/level` | 关系环：与某方的关系 |
 * | `points-to` | `pointer` | 证据锚：这条断言指向哪条 notes § |
 * | `provenance` | `source` | 来源：这条断言从哪来（会话/蒸馏/实测） |
 * | `supersede` | `validTo` + 同 subject/kind 的 live 记录 | 事实环：**谁替代了谁**（时态） |
 *
 * 纯函数、零 IO、零依赖（只 type-only 引 record-store）——便于单测与在 panel/CLI 两侧复用。
 * KPI：`graphCensus`（节点/边/各 rel 计数 + 悬空证据 + 竞争断言组），供 `/rings` 与机检门消费。
 */
import type { MemRecord } from './record-store.js';
export type EdgeRel = 'answers' | 'collision' | 'commitment' | 'relation' | 'points-to' | 'provenance' | 'supersede';
export interface GraphNode {
    id: string;
    /** 记录节点 = 其 kind；外部锚节点 = 'anchor' */
    kind: string;
    subject: string;
    text: string;
    live: boolean;
    /** 外部锚（notes § / 来源串 / 关系方）——不是记录，但图里必须有它才能表达"指向" */
    anchor: boolean;
}
export interface GraphEdge {
    from: string;
    to: string;
    rel: EdgeRel;
    /** 边的附属事实（如 landed/direction/status），供查询与展示 */
    note?: string;
}
export interface AssertionGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    stats: {
        nodes: number;
        edges: number;
        anchors: number;
        live: number;
        expired: number;
        byRel: Record<string, number>;
    };
}
export declare function buildGraph(records: readonly MemRecord[]): AssertionGraph;
/** 邻域查询：某节点的出边/入边（"谁引用谁"两个方向都给）。 */
export declare function neighborsOf(g: AssertionGraph, id: string): {
    out: GraphEdge[];
    in: GraphEdge[];
};
/**
 * **近邻候选对**（**候选生成交向量** · 2026-09-13 重做，取代原 `competingOf`）。
 *
 * ## 为什么推翻上一版
 * 上一版按 `pointer` 相等分组，夹具测试全绿；**拿真库 + 真向量一跑就露**：notes 记录的 `pointer`
 * 是**整个文件** ⇒ 分组退化成"同文件所有行两两比"，产出 224 条"相斥"，里面混着
 * `[身份] ≠ [硬件]` 这种废话 —— **人一眼就知道那不是竞争断言**。
 * **精确键（字段相等）回答不了"是不是同一件事"这个模糊问题。**
 *
 * ## 本版：候选生成交向量，代码只做"取近邻 + 去重 + 截断"
 * 语义近 ⇒ 大概率在讲**同一件事**（仍需模型再判：是**重复**、**一致**、还是**相斥**）。
 * ⚠ 与「联想」的分工**恰好相反**：联想要**词面不重叠**（异域同构），竞争/重复要**语义近**（同一件事）
 * ⇒ 本件**不做任何词面过滤**。
 *
 * ⚠ 全对计算 O(n²) ⇒ 有 `maxN` 上限（取数组末尾=较新者），超出者**如实不参与并计数**（宁少勿假）。
 */
export interface NearPair {
    a: MemRecord;
    b: MemRecord;
    sim: number;
    /** 同一 `pointer` 只是**证据之一**，**不再是分组键** */
    samePointer: boolean;
}
export declare function nearPairs(records: readonly MemRecord[], vectors: readonly (readonly number[] | null)[], opts?: {
    topK?: number;
    minSim?: number;
    maxN?: number;
}): {
    pairs: NearPair[];
    considered: number;
    skipped: number;
};
/**
 * **判层**（**判交模型** · 2026-09-13）。
 *
 * ⚠ 为什么必须交模型：**向量能说"这两条很像"，但说不了"一致还是相斥"** ——
 *   两句语义几乎相同的话，可以互相印证，也可以互相矛盾（"必须备份" / "禁止备份"）。
 *   这是**判断**，不是**度量**：向量做不了，代码更做不了。
 *
 * 判据四种（+ `null`=未判）：
 *   `duplicate`（同一断言的不同说法，可归一）· `consistent`（都成立，各说一面）·
 *   `contradictory`（不能同时成立，**需裁决**）· `unrelated`（只是用词像）· `null`（无模型/失败 ⇒ **未判**）。
 */
export type ClaimVerdict = 'duplicate' | 'consistent' | 'contradictory' | 'unrelated';
export interface JudgedPair extends NearPair {
    /** `null` = **未判**（仪表缺失或判层失败）——与"判过但结论模糊"分开记 */
    verdict: ClaimVerdict | null;
}
export declare function adjudicatePairs(pairs: readonly NearPair[], judge: (a: string, b: string) => Promise<ClaimVerdict | null>): Promise<JudgedPair[]>;
/** KPI：供门禁与面板消费的机器可读计数。 */ export declare function graphCensus(g: AssertionGraph): Record<string, number>;
/**
 * **跨文件逐字节同文**（单一实现 · 2026-09-13）：CLI `assertion-graph --dups` 与面板 `/arch/records` 共用，
 * 避免"同一口径两处实现"（仓内反复吃过的亏）。纯函数、零 IO、零依赖。
 *
 * 口径：按 `text` **精确**分组，**只列跨文件**组（同文件内重复多为设计/结构，如索引/详情同名标题）；
 *   空文本与纯分隔线（`---`/`===`/`***`/`###`）不计。
 * ⚠ **只报告不删**：记忆库内容属用户——"可写不等于有处置权"。
 */
export declare function exactCrossFileDups(records: Array<{
    file?: string;
    order?: number;
    text?: string;
}>, limit?: number): Array<{
    count: number;
    text: string;
    files: Array<{
        file: string;
        order: number;
    }>;
}>;
