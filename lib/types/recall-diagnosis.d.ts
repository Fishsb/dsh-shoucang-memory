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
 * **为什么必须由数据推导**：原 S4-7「两条件分流」的判据写死了，其前提是"瓶颈在标签门" ——
 *   该前提**已被 S1 实测证伪**（真实瓶颈是召回零命中 **81.7%**，1411 步双源；被标签门挡下的 337 条里
 *   **279 条是"(无/空)"**，即压根没召回命中，与阈值/标签门无关）。
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
/** 从 mcl-step 审计行抽归因样本（**纯函数**：只做映射，不读文件）。
 *  ⚠ **实测限制（如实记）**：`mcl-step` 审计行**不记 query 原文**（只记 `hit`/`topics`/`sim`/`rowsN`）
 *    ⇒ 归因请求里的"查询"只能由 `topics` 近似，必要时为空。要真正带上 query，
 *      须在 `mcl.ts` 的审计行里加字段（与仓内「输入量须可见化」同族）—— 属后续项，**此处不假装有**。 */
export declare function samplesFromMclRows(rows: readonly Record<string, unknown>[], limit?: number): AttributionSample[];
