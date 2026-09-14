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
    /** S4-3（2026-09-14）**中层 `process` 槽**配置（`enabled:false` ⇒ 零行为变化）；字段名与注册表一致以便整对象传入 */
    process?: {
        enabled?: boolean;
        carrierTag?: readonly string[];
        topN?: number;
    };
    /**
     * S4-3：`process` 槽的**候选源** —— **全层索引行**（三索引的 `[tag] … → notes/` 薄行）。
     * ⚠ **不能复用** `allMem`（只含 P 层 always）或 `allMemFill`（只读 MEMORY.md）：
     *   **`[路径]` 属 R 层 gated**，在 `AGENT.md` 里（实测 5 条），上述两源**都取不到** ⇒ 槽会**恒空**
     *   （本项首版即踩此坑，由"开启后仍无 `[路径]`"的实测当场暴露）。
     */
    processRows?: readonly string[];
}
/**
 * S4-3（2026-09-14）**中层 `process` 槽选行**：按**标签**取 `[路径]` 行（**不走内容相关性竞争**）。
 *
 * 判因：人类三层里**中层是唯一没有专用通路的层** —— `[路径]` 原经 R 层 gated 相关性召回，
 *   与知识索引行争同一 `dynamic` 预算 ⇒ 「**可复用步骤**」这种过程指引会被"内容相关性"挤掉。
 *   本槽给它**优先进位**（与 `situation`/`serendipity` 同构的理由：改权重解决不了，只能分槽）。
 *
 * 边界：**只选行**（不渲染、不裁切、不记账）；`enabled !== true` ⇒ 返回空（**缺省零行为变化**）。
 */
export declare function selectProcessLines(allIndexRows: readonly string[], opts?: {
    enabled?: boolean;
    carrierTag?: readonly string[];
    topN?: number;
}): string[];
/**
 * 动态面选行（**逐行为与抽取前等价** —— 只搬位置，未改判据、未改顺序）。
 *
 * 三通道叠加的顺序是**判据而非巧合**：相关性 → 新鲜度 → 基线补齐；
 *   `picked` 为空时**保持基线**（`return memBase`），与抽取前的 `if (picked.length)` 等价。
 */
export declare function selectDynamicLines(dep: DynamicSelectDeps): string[];
