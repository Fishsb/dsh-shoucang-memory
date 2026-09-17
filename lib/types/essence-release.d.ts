/** 判据阈值（**与 `scripts/effective-directions.mjs` 同源**：那边 import 本常量，不各写一份）。 */
export declare const RELEASE_MIN_ACTION_CHARS = 12;
/** 动作/因果词（**唯一实现**；`effective-directions.mjs` 同源引用）。 */
export declare const RELEASE_ACTION_WORDS: RegExp;
/** 判据载体文件（**主键 = 文件职责**，不是标签）。 */
export declare const JUDGMENT_FILE = "AGENT.md";
/** 单轮释放上限（与 `forgetops#MAX_ARCHIVE_PER_RUN` 同值同纪律：防一次动太多）。 */
export declare const RELEASE_MAX_PER_RUN = 3;
/** 一条释放候选（**只是计划**，不代表会被释放）。 */
export interface ReleaseCandidate {
    /** 逐字行（含指针）。 */
    row: string;
    /** 标签（仅作展示与分布统计）。 */
    tag: string;
    /** `说明` 段字符数（判据输入，可复核）。 */
    descChars: number;
}
export interface ReleasePlan {
    /** 候选（字面自足者）。 */
    candidates: ReleaseCandidate[];
    /** **未自足者**：必须保留可解析指针，**永不入候选**（判据③）。 */
    blocked: number;
    /** 判定面规模（观测用）。 */
    stat: {
        scanned: number;
    };
    /** 未判原因（不可用时如实记；**绝不假装已判**）。 */
    note: string;
}
/**
 * 扫描释放候选（**纯读、零写入**：不归档、不删行、不改任何文件）。
 * 判据与度量器同源（阈值/词表/文件主键均 import 自本件），故"度量出的候选"与"可释放的候选"**同口径**。
 */
export declare function planRelease(memRoot: string): ReleasePlan;
/** 从指针解析归档目标：`→ notes/<file> §<section>` ⇒ `{ file, section }`（解析不出 ⇒ null）。 */
export declare function parsePointerOf(row: string): {
    file: string;
    section: string;
} | null;
/** 释放提案（**forgetOps 同形**；`why` 仅供审计，不传给 applyForgetOps）。 */
export interface ReleaseOp {
    op: 'archive';
    file: string;
    section: string;
    action: 'archive';
    why: string;
}
/**
 * 把释放计划转成 **forgetOps 同形 op 列表**（**只提案，不执行**）。两道门在本件内：
 *   · **无指针/解析不出 ⇒ 不产 op**（指针是释放的唯一入口）；② **未自足 ⇒ 不产 op**（判据③再断言一次）。
 */
export declare function releaseOpsFromPlan(plan: ReleasePlan): {
    ops: ReleaseOp[];
    skipped: number;
    note: string;
};
/**
 * 应用释放提案（**唯一写入口**）。**双重 fail-closed**：
 *   ① **必须显式传 `semanticApproved`**（语义复核通过的行文本清单）—— 该门**尚未自动产出**，
 *      故**不传 = 零释放**（绝不把"字面自足"当成"可以释放"）；
 *   ② 逐条**以当下库状态重新复核**（`planRelease` 再跑一次）—— **不接受调用方自报自足**（防越权/防陈旧计划）。
 * ⚠ 本函数**不自己归档**：通过的 op 交给调用方注入的 `applyOps`（既有 `applyForgetOps`）。
 */
export declare function applyRelease(memRoot: string, proposed: readonly ReleaseOp[], semanticApproved: readonly string[], applyOps: (ops: ReadonlyArray<{
    op: string;
    file: string;
    section: string;
    action: string;
}>) => Promise<{
    archived: number;
    kept: number;
    skipped: number;
}>, opts?: {
    maxPerRun?: number;
}): Promise<{
    released: number;
    skipped: number;
    reasons: string[];
}>;
/** 构造语义复核请求（**纯函数**：只拼文本）。**只给行本身**，不附正文 —— 这正是在模拟"丢掉正文"。
 *  @param offset/limit 分批：一次问太多条会让每条分到的注意力变少（实测 49 条一次问 ⇒ **59% 判不准**）。
 *         `i` 一律用**全局序号**（= 候选下标），故分批后仍可直接合并。 */
export declare function buildSemanticReviewRequest(plan: ReleasePlan, opts?: {
    offset?: number;
    limit?: number;
}): string;
/** 分批请求（**纯函数**）：把候选按 `size` 切批，每批一个请求；`i` 为全局下标，合并时直接可用。 */
export declare function buildSemanticReviewBatches(plan: ReleasePlan, size?: number): string[];
export interface SemanticReview {
    i: number;
    usable: boolean | null;
    why: string;
    quote: string;
}
/** 严格解析（**整批原子**：结构不合法 ⇒ 整体 null —— 半批会静默改变"通过清单"）。
 *  ⚠ `quote` **缺失/过短不算结构错** ⇒ 记空串，交由 `semanticApprovedRows` **按项判未判**
 *    （**接地失败是逐条事实，不是整批结构错**；整批作废会白烧整批判定）。 */
export declare function parseSemanticReview(text: string): SemanticReview[] | null;
/**
 * 双判据合并 ⇒ **语义复核通过的行清单**（可直接喂 `applyRelease` 的 `semanticApproved`）。
 * ⚠ **以更严者为准**：只有 `usable === true` **且 引文接地成功**才算通过。
 * ⚠ **引文接地机检**（2026-09-16 降波动）：`quote`（≥4 字）必须**是该行的逐字子串**；
 *   不符/缺失 ⇒ **按未判处理**（不通过）。依据是真机 6 轮分解：**模型波动占加权 91%** ⇒
 *   必须把"凭印象判"压成"必须在行内找到依据"。
 */
export declare function semanticApprovedRows(plan: ReleasePlan, review: readonly SemanticReview[]): {
    approved: string[];
    rejected: number;
    unjudged: number;
    ungrounded: number;
};
/** 两次独立判定的**通过集交集**（保序、去重）—— **降波动手段**（2026-09-16）。
 *  判因（实测分解）：当代 6 纪元的波动**加权 93% 来自模型判定**（候选变化仅 7%）；而文献
 *   （arXiv:2510.27106）已证伪两条常见路 ——「调温度」**降低**与人类判断的一致性、
 *   「多跑取**多数**」对自可靠性**无显著改善**。⇒ 取**交集**（**两次都判 `true` 才通过**）而非多数：
 *   它**必然收缩通过集** ⇒ **单调更保守**（少释放、不误释放）；代价是通过率下降 ⇒
 *   **效率换稳定**，方向安全（未判/否一律不通过，与 `semanticApprovedRows` 同口径）。 */
export declare function intersectApprovals(a: readonly string[], b: readonly string[]): string[];
/** 集合指纹：把一批行文本折成**排序后的短哈希**（`sha1(trim(行))` 前 8 hex）—— **判据用，零隐私暴露**。
 *  判因（2026-09-16 实测）：用「通过率极差」当稳定性判据是**代理指标** —— 它被**未判率污染**
 *   （未判 ⇒ 缩小交集 ⇒ 通过率下降），实测未判率 `0→25.3%` 直接变成通过率摆动（仓内 [原则] 代理指标非判据）。
 *   ⇒ **更本质的判据**是「**两轮释放集合有多像**」（Jaccard）⇒ 需要每轮的**集合指纹**。
 *  ⚠ 为什么用哈希而非行文本：**审计体积**与**隐私面** —— 短哈希**不可逆**、且候选全集本就在 `AGENT.md`（库内），
 *   故**不增加暴露面**（能读库的人本就能读行）；而记全文会让审计膨胀数倍。
 *  ⚠ **排序**是刻意的：集合比较与顺序无关，排序后才能与 `intersectApprovals` 的保序结果对齐比较。 */
export declare function stableSetHashes(rows: readonly string[]): string[];
/** 两个集合指纹的 **Jaccard 相似度**（|交| / |并|；两者皆空 ⇒ 1.0「一致地没有」）。 */
export declare function jaccardOfHashes(a: readonly string[], b: readonly string[]): number;
