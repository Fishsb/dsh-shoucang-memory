/**
 * supply-ledger.ts — 会话级注入台账（P1 · 2026-09-13；v2 改「轮次窗口」去重）
 *
 * 解决的问题（实测）：MCL 慢通道材料的「已注入」信息原本存在 `SessMcl.topics` 里，而 `state.delete(sid)`
 *   在**每收到一条用户消息**时把它清掉（mcl.ts L214-215）⇒ 去重信息被自己的重置删除 ⇒ 同一会话内
 *   同一批指针逐字重复注入（实测 8 次注入 / 2,955 字符中 782 字符 = 26% 是重复）。
 *
 * ⚠ v2 修正（2026-09-13 质量回归评估发现的风险）：v1 是「**整会话永久去重**」——某行注入过一次就再不注入。
 *   风险：① 上下文压缩后材料已不在模型窗口内，台账却仍说"给过" ⇒ **该记忆对整个会话失效**；
 *        ② 模型当轮忽略的历史经验永不再被提示。而实测的浪费形态是**相邻轮重复**（375/375、407/407 逐字相同），
 *        不是"隔很多轮后再给"。
 *   ⇒ 改为**轮次窗口去重**：只压制"最近 WINDOW 轮内给过"的行，窗口外允许重新注入（有界、可持续、仍消掉实测浪费）。
 *
 * 设计（对应方案档 D3/D4）：
 *   - 台账键 = 会话 id，生命周期独立于轮级 state（轮级每条用户消息重置，台账跨轮累积但**按窗口衰减**）；
 *   - 记录单位 = 行指纹（内容哈希）⇒ 内容变更即视为新行；
 *   - 轮次由 `newTask(sid)` 推进（mcl 在收到用户消息时调用）；窗口外条目在推进时清理；
 *   - 零依赖、零抛出：任何异常都不影响主链路（宁可不省，不可打断）。
 */
/** 去重窗口（轮）：只压制"最近 N 轮内给过"的行。3 = 覆盖实测到的相邻轮重复，同时不长期屏蔽 */
export declare const DEDUP_WINDOW_TURNS = 3;
export interface SupplyLedgerStats {
    /** 在册会话数 */
    sessions: number;
    /** 在册行指纹总数（窗口内） */
    rows: number;
    /** 累计登记次数 */
    marked: number;
    /** 累计清理数（过期会话 + 窗口外条目） */
    swept: number;
    /** 在册会话轮次合计 */
    turns: number;
    /** 去重窗口（轮） */
    window: number;
}
export interface SupplyLedger {
    /** 推进本会话轮次（收到一条用户消息时调用）；返回新轮次序号；顺带清掉窗口外条目 */
    newTask(sid: string): number;
    /** 该行在本会话**最近 WINDOW 轮内**是否注入过 */
    seen(sid: string, fp: string): boolean;
    /** 登记若干行（记当前轮次）；返回新登记条数 */
    mark(sid: string, fps: readonly string[]): number;
    /** 显式忘掉一个会话（回滚/调试用） */
    forget(sid: string): boolean;
    /** 惰性清理：返回被清理的会话数 */
    sweep(maxAgeMs?: number): number;
    stats(): SupplyLedgerStats;
}
/**
 * 内容指纹（djb2 变体 → base36）。同一行内容改动一个字即换指纹 ⇒ 视为新内容、允许重新注入。
 */
export declare function fingerprintOf(text: string): string;
/** 召回行 → 指纹（以行文本为准；行内已含标签·主题·指针三段，足以区分） */
export declare function rowFingerprint(row: {
    line?: unknown;
}): string;
export declare function createSupplyLedger(now?: () => number): SupplyLedger;
