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
/** **问题标记行**（G13 双字段的载体；`issueRowsOf` 产、`buildReportSection`/`statsOf`/面板三处消费）。 */
export interface IssueRow {
    tag: string;
    file: string;
    section: string;
    evidence: string;
    /** **只标记不处置**（用户口径）——状态机走**新行**，不重写旧行。 */
    handled: 'not-handled';
    why: string;
    /** 该 (file,section) **第一次**被判 `unused-candidate` 的时刻（跨轮继承）。 */
    unusedAtFirstObservation: string;
    /** 本轮是否仍然未被真读（本函数只产 `true`；字段存在的意义是让后续轮次可写 `false`）。 */
    stillUnused: boolean;
}
/** **归因取样读数**（`deepsleep-run#attributeRecallMisses` 的产出，经台账末条 `deep-sleep` 行回流）。
 *
 *  ⚠ **为什么要它进汇报**（2026-09-22 · 补「写入侧有、消费面零」）：
 *    `deepsleep-run.ts:552` 落审计时写了 `attributionScanned`（= **为收满样本扫了多少行**），
 *    它是「**扫描触顶**（须调 `ATTRIBUTION_MAX_SCAN`）」与「**样本真不足**（须等时间）」的**唯一分辨依据**
 *    —— 两者在 `samples < 门槛` 上**读数同形**，而处置相反。
 *    实测（全树 grep）：该字段**只有写入点、零读取方** ⇒ 这条分辨能力**从未抵达任何人眼前**，
 *    汇报里也就只剩一句「未命中样本 N < 30」（正是那条把人引向"等样本"的旧读数）。
 *    ⇒ 本字段是它的**第一个消费面**：随汇报落账并进人读正文。 */
export interface AttributionReading {
    /** 归因判定（`insufficient` = 未达门槛未判 · 其余为真判结果 · 空 = 本轮无该通道读数） */
    verdict: string | null;
    /** 实际未命中样本数 */
    samples: number;
    /** **为收集样本实际扫描的行数**（输入量可见化：扫了多远才收满/未收满） */
    scanned: number | null;
    /** 是否**扫描触顶**（`scanned >= ATTRIBUTION_MAX_SCAN`）—— true ⇒ 调上限，等多久都不够 */
    hitCap: boolean;
    note: string;
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
    /** 归因取样读数（可选：台账里无该通道的行 ⇒ 不打这段，**不编造 0**） */
    attribution?: AttributionReading;
}
export declare const sleepReportDirOf: (bankRoot: string) => string;
export declare const sleepReportPathOf: (bankRoot: string, date: string) => string;
export declare const sleepReportsStreamOf: (kRoot: string) => string;
export declare const sleepIssuesStreamOf: (kRoot: string) => string;
/** **报告指纹账**（G11「报告永不删除」的判据载体）：每轮一行，整文件 sha256 + 字节/行/段数。 */
export declare const sleepLedgerStreamOf: (kRoot: string) => string;
/** 指纹行（**整文件**口径；理由见 `writeSleepRound` 内注释）。 */
export interface FingerprintRow {
    dateFile: string;
    sha256: string;
    bytes: number;
    lines: number;
    sections: number;
    /** 该日文件**首次**出现的时间（同日多轮不重置 —— 它答的是"这份报告从何时起存在"）。 */
    firstSeenAt: string;
    /** 本次记录时间（= 本轮 `at`）。 */
    at: string;
}
/** 复算某份报告的指纹（**与 `writeSleepRound` 同一实现** ⇒ 账与真身不可能漂移）。 */
export declare function fingerprintOf(file: string, date: string, at: string, firstSeenAt?: string): FingerprintRow;
/** 已记录的**首次出现时间**（同 `dateFile` 取最早的一行；无 ⇒ 空串）。 */
export declare function firstSeenOf(kRoot: string, dateFile: string): string;
/** **影响账**（确定性聚合）：窗口内每个 `(file, section)` 的真实读取与活性。
 *  数据源 = `access-real.jsonl`（真读埋点，字段 `t/f/s`）+ `activity.jsonl`（`hits/lastHit/status`）；
 *  两者都是**既有遥测**，本件不新建遥测。 */
export declare function buildImpactRows(d: {
    bankRoot: string;
    untilMs: number;
    sinceMs: number;
}, limit?: number): ImpactRow[];
/** 问题标记：**只用确定性证据**（真读/活性）；`suspect-recall` 与 `suspect-quality` 用**指针可解析性**分开。
 *
 *  G13 双字段（2026-09-19 补）：
 *   · `unusedAtFirstObservation` —— 该 (file,section) **第一次**被判 `unused-candidate` 的时刻
 *     （跨轮**继承**：先读既有问题流的同键最早一行；无 ⇒ 记本轮 `at`）⇒ 能回答"标记了多久"；
 *   · `stillUnused` —— 本轮**仍然**未被真读（本函数只处理 `unused-candidate`，故恒 `true`；字段存在的意义是
 *     **让后续轮次可写 false**，从而"已恢复"与"从未被标"可分辨 —— 那两个状态今天无法区分）。
 *  ⚠ 两字段**只增不改历史行**：状态迁移由**新行**表达（`state:'open'` → 后续行），不重写旧行。 */
export declare function issueRowsOf(memRoot: string, impact: ImpactRow[], at?: string, kRoot?: string): IssueRow[];
/** 既有问题流里的**首次观测时刻**（同 `file|section` 取最早一行；无 ⇒ 不建键）。 */
export declare function firstObservedMap(kRoot: string): Map<string, string>;
/** 统计：**两个分母各自带口径**（会审计数纪律：禁写死数字、禁混分母）+ 单列 `injected-unknown`。
 *   · `rows` = 本窗影响账条数（**体积分母**：率的分母）
 *   · `producedToday` = 当日**产出条数**（G13 要求的第二个分母：`added`+`replaced` 的当日合计） */
export declare function statsOf(impact: ImpactRow[], issues: Array<Pick<IssueRow, 'tag'>>, produced?: number): Record<string, number>;
/** 汇报正文（**固定五段**）：区间 / 提存 / 压缩 / 问题标记 / 统计。 */
export declare function buildReportSection(i: SleepRoundInput, stats: Record<string, number>, issues: IssueRow[]): string;
/** 「最近成长」派生（`delta.md` 退役后的**注入源**）：三行方向级摘要。 */
export declare function derivationOf(i: SleepRoundInput, stats: Record<string, number>): string[];
/** **注入侧唯一入口**：从末条 `sleep-round` 行**复算**「最近成长」三行。
 *
 *  与报告正文**同函数**（`derivationOf`）⇒ 判据「**注入块 == 报告提存/压缩/统计段**」可**逐元素机检**
 *  （`scripts/test-sleep-report.mjs` 的 D 组；不是"文本非空"那种代理判据）。
 *  ⚠ **不读** `reports/sleep/*.md`：注入失效键跟**派生源**（本流），留存面每轮 append 增长**不代表内容变**。
 *  缺流/坏行/字段残缺 ⇒ `[]`（**失败开放**：报告缺失不得让注入中断或抛错）。 */
export declare function latestDerivation(d: {
    kRoot: string;
}): string[];
/** 从**台账末条 `deep-sleep` 行**装配本轮输入（**解耦**：不必把一轮的十几个字段穿过装配层，
 *  也避开 `runDeepSleep` 的函数跨度上限 399/400 —— 这是会审记下的"净减前置"约束下的务实解法）。
 *
 * ⚠ **跨档读（G13 轮转失明 · 2026-09-20 修）**：原走 `parseRows(…/ledger.jsonl, 4000)` ——
 *   而 `parseRows` 基于 `readTailLines`（**只在主档尾部窗口内**）⇒ 台账轮转后
 *   **"末条 deep-sleep" 可能整个不在主档里** ⇒ 本函数返回 null ⇒ 睡眠汇报静默退化成
 *   「no-deep-sleep-round」（**看着像"没跑过深睡"**）。实测（本轮）：主档 `deep-sleep` 行 **0** /
 *   跨档真值 **49** ⇒ 该退化**当时正处于激活态**。
 *   ⇒ 现改为 `readLedgerVolumes`（跨档、按时间序）+ 从**末尾反向**找最后一条 `kind==='deep-sleep'`；
 *     语义（"取最后一条"）**不变**，只是把可见范围从"主档尾部"扩到"全部档位"。
 *   判据：`scripts/check-ledger-read.mjs` 源码面硬门。 */
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
    ledger: FingerprintRow;
};
