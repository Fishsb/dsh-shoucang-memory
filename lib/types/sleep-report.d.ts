export interface ImpactRow {
    file: string;
    section: string;
    realReads: number;
    activityHits: number | null;
    activityStatus: string;
    lastHitMs: number | null;
    injected: 'unknown';
    verdict: 'keep' | 'unused-candidate';
}
export interface SleepRoundInput {
    at: string;
    sinceMs: number;
    untilMs: number;
    produceOff: boolean;
    produced: {
        added: number;
        replaced: number;
        profiles: number;
    };
    maintenance: {
        tree: number;
        pointers: number;
        archived: number;
        kept: number;
    };
    materials: {
        segments: number;
        failures: number;
    };
    impact: ImpactRow[];
}
export declare const sleepReportDirOf: (bankRoot: string) => string;
export declare const sleepReportPathOf: (bankRoot: string, date: string) => string;
export declare const sleepReportsStreamOf: (kRoot: string) => string;
export declare const sleepIssuesStreamOf: (kRoot: string) => string;
/** **影响账**（确定性聚合）：窗口内每个 `(file, section)` 的真实读取与活性。
 *  数据源 = `access-real.jsonl`（真读埋点，字段 `t/f/s`）+ `activity.jsonl`（`hits/lastHit/status`）；
 *  两者都是**既有遥测**，本件不新建遥测。 */
export declare function buildImpactRows(d: {
    kRoot: string;
    untilMs: number;
    sinceMs: number;
}, limit?: number): ImpactRow[];
/** 问题标记：**只用确定性证据**（真读/活性）；`suspect-recall` 与 `suspect-quality` 用**指针可解析性**分开。 */
export declare function issueRowsOf(memRoot: string, impact: ImpactRow[]): Array<{
    tag: string;
    file: string;
    section: string;
    evidence: string;
    handled: 'not-handled';
    why: string;
}>;
/** 统计：**分母带绝对值**（`unused 率` 的分母固定为"本窗条数"），并单列 `injected-unknown` 占比。 */
export declare function statsOf(impact: ImpactRow[], issues: Array<{
    tag: string;
}>): Record<string, number>;
/** 汇报正文（**固定五段**）：区间 / 提存 / 压缩 / 问题标记 / 统计。 */
export declare function buildReportSection(i: SleepRoundInput, stats: Record<string, number>, issues: Array<{
    tag: string;
    file: string;
    section: string;
    evidence: string;
    handled: string;
    why: string;
}>): string;
/** 「最近成长」派生（`delta.md` 退役后的**注入源**）：三行方向级摘要。 */
export declare function derivationOf(i: SleepRoundInput, stats: Record<string, number>): string[];
/** 从**台账末条 `deep-sleep` 行**装配本轮输入（**解耦**：不必把一轮的十几个字段穿过装配层，
 *  也避开 `runDeepSleep` 的函数跨度上限 399/400 —— 这是会审记下的"净减前置"约束下的务实解法）。 */
export declare function roundInputFromLedger(d: {
    kRoot: string;
    untilMs?: number;
}, fallbackDate?: string): SleepRoundInput | null;
/** 一轮睡眠结束后落汇报（**从台账末条装配**；影响账在窗口上聚合）。 */
export declare function writeSleepReportFromLedger(d: {
    kRoot: string;
    bankRoot: string;
    date: string;
}, untilMs?: number): {
    ok: boolean;
    reportFile?: string;
    issues?: number;
    reason?: string;
};
export declare function writeSleepRound(d: {
    kRoot: string;
    bankRoot: string;
    date: string;
}, input: SleepRoundInput): {
    reportFile: string;
    streamRow: boolean;
    issues: number;
    report: string;
    stats: Record<string, number>;
};
