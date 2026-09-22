/** 归因标签（`ok` = 有高置信命中且熟悉度达标，即快通道条件成立） */
export type RecallMissReason = 'ok' | 'recall-empty' | 'no-highconf' | 'below-threshold' | 'embed-off';
export interface RecallSignals {
    /** 召回行数（`recallRanked` 返回的 `rows.length`） */
    rowsN: number;
    /** 是否含 `mclGate` 高置信标签行 */
    hasHighConf: boolean;
    /** 熟悉度（绝对余弦；向量关闭时为 0） */
    sim: number;
    /** 熟悉度阈值（`cfg.familiarThreshold`） */
    threshold: number;
    /** 向量是否启用 */
    embedEnabled: boolean;
}
/**
 * 归因（顺序与 `mcl.ts#decideTurn` 的 `fast` 判定一致）：
 *   ① 向量关 ⇒ `embed-off`（此时 `sim` 恒 0，后续判定无意义 —— 先报根因，不报"阈值不足"这种表象）
 *   ② 召回空 ⇒ `recall-empty`
 *   ③ 无高置信 ⇒ `no-highconf`
 *   ④ `sim` 未达阈 ⇒ `below-threshold`
 *   ⑤ 否则 `ok`
 */
export declare function recallMissReasonOf(s: RecallSignals): RecallMissReason;
/** 是否为"真·没命中"（供诊断聚合区分「召回层问题」与「阈值层问题」） */
export declare function isRecallLayerMiss(r: RecallMissReason): boolean;
/** S4R/R3（2026-09-14）**调参建议**：由归因分布推导"该动哪一层"。 */
export type RecallAdvice = 'insufficient-data' | 'enable-embed' | 'fix-recall' | 'lower-threshold';
/**
 * S4R/R3 **D2 判据重定**：从 `missReason` 分布推导调参方向。
 *
 * ⚠ **定位锁定（2026-09-20 实测，先读这段）**：本函数是**对账基线**，**不是**调参依据 ——
 *   它用**计数大小**定方向，而 2154 条样本的**细校准结论是「维持 0.55 不改」**
 *   （降 0.54 会过冲注册意图 11.6pp）。实测**两者方向相反**（一致率 = 0）：
 *   · 2026-09-15 记录：计数法给 `lower-threshold` vs 细校准 `maintain`（见 `OPEN-ITEMS` OPEN-1）
 *   · 2026-09-20 实测：计数法给 `fix-recall`（召回层 43 > 阈值层 16）vs 细校准 `maintain` —— **仍相反**
 *   （⚠ 方向值随样本漂移，故此处**并列实测两次的实际输出**，不写死"它总是 X"——
 *     写死就是本仓已犯过的「注释与实现不符」）。
 *   ⇒ 唯一消费者 = 诊断件 `scripts/recall-diagnose.mjs`（**报告态**，`check-runner` 未登记为门）
 *     + 对账测试件。**没有任何运行链以它的输出决定阈值**（否则就是"用计数替代校准"）。
 *   ⇒ 保留理由：它是「**确定性第一层**」（零成本、可复现），其价值在于**与 LLM 归因对账**
 *     —— 一致率为 0 这个事实本身就是判据（若有人把计数法改成与细校准一致，该断言会红）。
 *   ⚠ 结论已定：**不要以本函数的输出去改 `mclFamiliarThreshold`**；改阈值一律以注册表细校准为准
 *     （`criteria.json#thresholds.mcl.familiarThreshold` 的 note）。
 *
 * **为什么方向必须由数据推导（原设计意图，保留）**：原 S4-7「两条件分流」的判据写死了，其前提是
 *   "瓶颈在标签门" —— 该前提**已被 S1 实测证伪**（真实瓶颈是召回零命中 **81.7%**，1411 步双源；
 *   被标签门挡下的 337 条里 **279 条是"(无/空)"**，即压根没召回命中，与阈值/标签门无关）。
 *   ⇒ 判据若照原方案写死，会把人引向"调阈值"，而**调阈值对召回层无效**。
 *
 * 判据顺序（**与 `recallMissReasonOf` 同纪律：先报根因，不报表象**）：
 *   ① 样本不足 ⇒ `insufficient-data`（**不猜** —— 猜出来的方向会误导调参）
 *   ② `embed-off` 过半 ⇒ `enable-embed`（**配置层根因**，此时其余归因都无意义）
 *   ③ **召回层 > 阈值层** ⇒ `fix-recall`（**调阈值无用**，应查词表/索引/情境）
 *   ④ 否则 ⇒ `lower-threshold`（这才是阈值层该做的事）
 */
export declare function adviseFromMissCounts(counts: Readonly<Partial<Record<RecallMissReason, number>>>, minSamples?: number): {
    advice: RecallAdvice;
    total: number;
    miss: number;
    recallLayer: number;
    thresholdLayer: number;
    why: string;
};
export type AttributionVerdict = 'maintain' | 'lower' | 'raise' | 'fix-recall' | 'enable-embed' | 'insufficient';
/** 确定性计数的方向 → 归因词表（**仅用于对账比较**，不用于替代 LLM 判断）。 */
export declare function directionOfAdvice(a: RecallAdvice): AttributionVerdict;
export interface AttributionSample {
    /** 该步的查询（可为空串，空查询本身是重要线索）。 */
    q: string;
    /** 召回到的候选行（截断后的展示文本）。 */
    rows: readonly string[];
    /** 熟悉度（绝对余弦）。 */
    sim: number;
}
/**
 * 构造归因请求（**纯函数**，只拼文本，不发请求）。
 * ⚠ **必须带上注册表的细校准结论** —— 否则 LLM 无从"对账"，只会另给一个方向，
 *   一致率又会是 0（那正是本项要解决的问题，不是要重复的错误）。
 */
export declare function buildAttributionRequest(counts: Readonly<Partial<Record<RecallMissReason, number>>>, samples: readonly AttributionSample[], calibration: {
    id: string;
    value: number;
    conclusion: string;
}): string;
/**
 * 严格解析归因输出。**格式不符即返回 `null`** —— 不猜、不兜底、不静默通过
 *   （仓内教训：解析失败若兜底成默认值，下游会把"没解析出来"当成"判了 maintain"）。
 */
export declare function parseAttribution(text: string): {
    verdict: AttributionVerdict;
    reason: string;
} | null;
/** 一致率统计（**判据本体**：LLM 归因与细校准结论的一致率）。 */
export declare function agreementRate(items: readonly {
    verdict: AttributionVerdict | null;
    calibration: AttributionVerdict;
}[]): {
    n: number;
    agree: number;
    rate: number | null;
    unknown: number;
};
/**
 * 从**注册表 note** 推细校准结论（**纯函数**：只吃字符串，不读文件 —— 本件保持零 IO）。
 * 调用方用 `criteria.generated#SURFACE.mcl.note` 传入（生成物 ⇒ 零 IO、单一事实源）。
 * ⚠ 判据是**保守的**：认不出就返回 `insufficient`（**不猜** "maintain"）——
 *   猜错会让"一致率"虚高，正好掩盖本项要暴露的问题。
 */
export declare function calibrationVerdictOf(note: string): AttributionVerdict;
/** **归因样本的消费者谓词**（唯一判据）：只有"未命中"的行才支撑得起归因判断。
 *  ⚠ 抽成**单一实现**的理由：此前这段判据在 `samplesFromMclRows` 里内联，而**取样窗口**
 *    （`deepsleep-run` 的倒扫循环）用的是**另一个**判据（"是 mcl-step 就行"）——
 *    两个判据不同源 ⇒ 窗口会被**不满足消费谓词**的行占满（见 `takeAttributionScan` 的判因）。
 *  `missReason` 缺省按 `'ok'`（无该字段 = 那一行没做归因分流，不是"未命中"）。 */
export declare function isAttributionRow(row: Record<string, unknown> | null | undefined): boolean;
/** 从 mcl-step 审计行抽归因样本（**纯函数**：只做映射，不读文件）。
 *  ⚠ **实测限制（如实记）**：`mcl-step` 审计行**不记 query 原文**（只记 `hit`/`topics`/`sim`/`rowsN`）
 *    ⇒ 归因请求里的"查询"只能由 `topics` 近似，必要时为空。要真正带上 query，
 *      须在 `mcl.ts` 的审计行里加字段（与仓内「输入量须可见化」同族）—— 属后续项，**此处不假装有**。 */
export declare function samplesFromMclRows(rows: readonly Record<string, unknown>[], limit?: number): AttributionSample[];
/** 取样窗口的**扫描上限**（行；防坏档/长尾无界扫描。实测收满 30 条只需扫 ≈503 行）。 */
export declare const ATTRIBUTION_MAX_SCAN = 4000;
/**
 * 取归因样本的**扫描窗口**：自 `rawsDescending`（**倒序**，最新在前）逐行**解析**，
 * 收满 `limit` 条满足 `pred` 的行即停；最多扫描 `maxScan` 行。
 *
 * **纯函数**（不读文件、不自己解析 JSON —— 解析由调用方以 `parse` 注入）⇒ 可独立断言
 * 「窗口按消费谓词关闭」，这正是本轮修复的机检落点（`check-attribution-samples` ③）。
 *
 * ⚠ **两个谓词必须分开**（本轮实测教训）：`parse` 只答"这行能不能解析、是什么"，
 *   `pred` 才答"它是不是消费者要的"。首版把 parse 与 pred 合成一个（直接返回裸行），
 *   **导致返回的是原始字符串而下游 `samplesFromMclRows` 要的是对象 ⇒ 样本恒为 0**
 *   ——该缺陷由编译产物端到端跑真台账时当场暴露（不是靠读码发现）。
 *   ⇒ **返回的 `rows` 必须是 `parse` 的产物（对象），不是原始行**。
 *
 * @returns `rows` 命中的**已解析行**（保持输入倒序）· `scanned` 实际扫描行数（**可见化**：扫了多远才收满）
 */
export declare function takeAttributionScan<R, T>(rawsDescending: readonly R[], parse: (raw: R) => T | null, pred: (row: T) => boolean, limit: number, maxScan?: number): {
    rows: T[];
    scanned: number;
};
