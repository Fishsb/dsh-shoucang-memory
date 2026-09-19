/** 注入缓存的**失效判定**（纯函数 · 2026-09-16 用户指令「新会话注入一次 + 每次上下文压缩后一次」）。
 *  返回 `''` = **命中缓存（逐字复用）**；否则返回重建原因，供审计与 `/inject/stats` 读数。
 *
 *  **为什么需要它**：实测旧实现**每轮重建**（`/inject/stats calls=535`，而主会话仅 34 步）。
 *  四条失效条件（全部可观测，无猜测）：
 *    ① `prev` 缺失 ⇒ `new`（新会话，或插件热重载后首次）；
 *    ② `sid` 变化 ⇒ `session-changed`；
 *    ③ **事件条数回落**，或**首 seq 前跳** ⇒ `compacted`（历史被压缩重写；宿主 `SessionStartSource` 含 `'compact'`）；
 *    ④ **记忆库戳变化** ⇒ `lib-changed`（睡眠/蒸馏刚写了库 ⇒ 必须让新内容可见）。
 *  ⚠ **顺序有意义**：压缩判定**先于**库戳判定 —— 压缩是"上下文丢了"（必须重建），库变是"内容变了"（可稍后）。
 *  ⚠ **技术边界（勿误传）**：命中缓存**不代表省 token** —— system prompt 每步仍会发给模型；
 *    它省的是「每轮重建（读盘+选行+消重）」并保证文本**逐字稳定**（⇒ 提供商 prompt 缓存可命中）。 */
export declare function injectCacheReason(prev: {
    sid: string;
    evLen: number;
    firstSeq: number;
    lib: string;
    media?: string;
    q: string;
} | undefined, now: {
    sid: string;
    evLen: number;
    firstSeq: number;
    lib: string;
    media?: string;
    q: string;
}): '' | 'new' | 'session-changed' | 'compacted' | 'lib-changed' | 'media-changed' | 'query-changed';
import { type RelevanceTrace } from './relevance-supply.js';
export interface DynamicSelectDeps {
    /** 基线池（panel 侧已做分层过滤的 P/always 行） */
    allMem: readonly string[];
    /** 动态面行数上限（= `budgetOf().dynamic` 派生的 cap，随档位） */
    cap: number;
    /** 本轮查询（空 ⇒ 只走基线，不铺 gated 行） */
    q: string;
    /** 记忆库根（读 `MEMORY.md`） */
    memRoot: string;
    /** `activity.jsonl` 全路径（冷热/命中次来源；由调用方派生） */
    activityFile: string;
    /** suite 配置读取（注入而非直连，保持本件可独立测试） */
    readSuite: () => Record<string, unknown>;
    /** S4-3（2026-09-14）**中层 `process` 槽**配置（`enabled:false` ⇒ 零行为变化）；字段名与注册表一致以便整对象传入
     *  ★Q4（2026-09-20）新增 `gate`（`'tag'` 缺省=旧行为 / `'task'`=任务键门控，当前未启用）。 */
    process?: {
        enabled?: boolean;
        carrierTag?: readonly string[];
        topN?: number;
        gate?: string;
    };
    /**
     * Q4：`gate==='task'` 时用的**离散任务键**（读侧 `situation-key#taskCueOf` 的产出）。
     * ⚠ 只在 `gate==='task'` 时被消费；缺省（tag）下**不进任何判据** ⇒ 零行为变化。
     * ⚠ 传空数组 ⇒ 不筛（回落 tag 行为），防「开了开关却空槽」。
     */
    taskKeys?: readonly string[];
    /**
     * S4-3：`process` 槽的**候选源** —— **全层索引行**（三索引的 `[tag] … → notes/` 薄行）。
     * ⚠ **不能复用** `allMem`（只含 P 层 always）或 `allMemFill`（只读 MEMORY.md）：
     *   **`[路径]` 属 R 层 gated**，在 `AGENT.md` 里（实测 5 条），上述两源**都取不到** ⇒ 槽会**恒空**
     *   （本项首版即踩此坑，由"开启后仍无 `[路径]`"的实测当场暴露）。
     */
    processRows?: readonly string[];
    /** IR1 册一：**恒定面已持有的行**（`agentLines ∪ userLines`）——相关性面不得重复取它们（见 `relevance-supply#RelevanceDeps.exclude`） */
    exclude?: readonly string[];
}
/**
 * S4-3（2026-09-14）**中层 `process` 槽选行**：按**标签**取 `[路径]` 行（**不走内容相关性竞争**）。
 *
 * 判因：人类三层里**中层是唯一没有专用通路的层** —— `[路径]` 原经 R 层 gated 相关性召回，
 *   与知识索引行争同一 `dynamic` 预算 ⇒ 「**可复用步骤**」这种过程指引会被"内容相关性"挤掉。
 *   本槽给它**优先进位**（与 `situation`/`serendipity` 同构的理由：改权重解决不了，只能分槽）。
 *
 * 边界：**只选行**（不渲染、不裁切、不记账）；`enabled !== true` ⇒ 返回空（**缺省零行为变化**）。
 *
 * ★Q4（2026-09-20）**`gate` 开关**：原实现**完全不读 query** ⇒ 真机实测三个语义无关 query
 *   （「三种长期记忆梳理」／「深睡蒸馏怎么触发」／「发布插件到 github release」）得到**同一组 3 条**
 *   `[路径]`（恒取文件序最前 3 条）——而注册表 note 自称「任务型门控」，实为**位置门控**（声明的意图
 *   与运行态不符，用户已判为缺陷）。新增 `gate`：
 *     · `'tag'`（**缺省**）⇒ 旧行为逐字保留（按标签取前 topN）⇒ **零行为变化**（可机检对拍）；
 *     · `'task'` ⇒ 标签过滤后**追加任务键判据**（见 `processRowMatchesTask`）。
 *   ⚠ **当前只落结构、不启用 task**：`[路径]` 是 md 索引行、**不带 cues**（cues 只在环记录 meta），
 *     任务键与行的**对齐口径**属结构选择、尚未裁定（见 `criteria.json#surface.injection.process.note`）。
 *   ⚠ **硬约束**：本槽**不得**复用 `surface.mcl` 的**熟悉度阈值**——那是 **dense 相似度**量纲，
 *     与任务键的**有/无离散命中**不是同一件事，复用即量纲误用（该阈值服务于向量分流，见 `mcl.ts`）。
 *     （判据 `test-process-supply` ⑦ 会 grep 本文件：门控路径**不得出现**该阈值标识符或其字面量。）
 */
export declare function selectProcessLines(allIndexRows: readonly string[], opts?: {
    enabled?: boolean;
    carrierTag?: readonly string[];
    topN?: number;
    gate?: string;
    taskKeys?: readonly string[];
}): string[];
/**
 * 动态面选行（**IR1 册一后**：相关性面已交 `relevance-supply`，本件只留"补齐与合并"）。
 *
 * 通道序是**判据而非巧合**：相关性 → 新鲜度 → 基线补齐；
 *   `picked` 为空时**保持基线**（`return memBase`），与抽取前的 `if (picked.length)` 等价。
 *
 * ★2026-09-18（IR1 册一）：原「桥读取 + `recallIndex` + `file==='MEMORY.md'` 过滤 + 域内 top1」整段
 *   已迁至 `relevance-supply#selectRelevantLines`（**按域路由/领域接缝拆**，非按行数硬切）。
 *   迁因是**缺陷**而非整洁：单文件过滤把 `AGENT.md` 的命中**全丢** ⇒ 真命中词与乱码词注入面 63/63 行相同。
 *   本件保留：`process` 槽合并 · 冷热降权 · 新鲜度槽 · 存量补位 —— 它们与"相关性打分"无关。
 *   返回值加 `trace`（相关性通道来源 + 失败原因 + 零命中标志），供注入面**如实记账/注明**。
 */
export declare function selectDynamicLines(dep: DynamicSelectDeps): {
    lines: string[];
    trace: RelevanceTrace;
    proc: string[];
};
