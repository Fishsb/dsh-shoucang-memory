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
