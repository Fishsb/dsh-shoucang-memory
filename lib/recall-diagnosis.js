// recall-diagnosis.ts — S4-6′（2026-09-14）：**召回零命中归因**（消费链条可诊断性）
//
// 判因（S1 实测 · `mcl-calibrate` 双源 1411 步）：`hit` 为空 **1153（81.7%）** —— 绝大多数步
//   **根本没有召回命中**。而原计划 S4-7「两条件分流」的前提是"瓶颈在标签门"，**已被证伪**：
//   被标签门挡下的 337 条里 **279 条是"(无/空)"**，即那些步压根没召回命中，与阈值/标签门无关。
//   ⇒ 必须先让「为何没命中」**可归因**，否则任何关于分流/阈值的改动都是在猜。
//
// 本件只做**分类**（纯函数、零依赖、零 IO）：把一次召回的若干可观测量映射成一个原因标签。
//   ⚠ 分类的**判定顺序必须与 `mcl.ts#decideTurn` 一致**，否则诊断与行为会变成两套口径
//     （仓内教训：同一语义两处判据必然漂移）。
/**
 * 归因（顺序与 `mcl.ts#decideTurn` 的 `fast` 判定一致）：
 *   ① 向量关 ⇒ `embed-off`（此时 `sim` 恒 0，后续判定无意义 —— 先报根因，不报"阈值不足"这种表象）
 *   ② 召回空 ⇒ `recall-empty`
 *   ③ 无高置信 ⇒ `no-highconf`
 *   ④ `sim` 未达阈 ⇒ `below-threshold`
 *   ⑤ 否则 `ok`
 */
export function recallMissReasonOf(s) {
    if (!s.embedEnabled)
        return 'embed-off';
    if (s.rowsN <= 0)
        return 'recall-empty';
    if (!s.hasHighConf)
        return 'no-highconf';
    if (s.sim < s.threshold)
        return 'below-threshold';
    return 'ok';
}
/** 是否为"真·没命中"（供诊断聚合区分「召回层问题」与「阈值层问题」） */
export function isRecallLayerMiss(r) {
    return r === 'recall-empty' || r === 'no-highconf';
}
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
export function adviseFromMissCounts(counts, minSamples = 30) {
    const n = (k) => Math.max(0, Number(counts[k]) || 0);
    const total = n('ok') + n('recall-empty') + n('no-highconf') + n('below-threshold') + n('embed-off');
    const miss = total - n('ok');
    const recallLayer = n('recall-empty') + n('no-highconf');
    const thresholdLayer = n('below-threshold');
    if (total < Math.max(1, minSamples)) {
        return { advice: 'insufficient-data', total, miss, recallLayer, thresholdLayer, why: `样本 ${total} < 下限 ${minSamples} ⇒ **不猜方向**（猜出来的调参会误导）` };
    }
    if (miss > 0 && n('embed-off') / miss > 0.5) {
        return { advice: 'enable-embed', total, miss, recallLayer, thresholdLayer, why: `embed-off 占未命中 ${Math.round((n('embed-off') / miss) * 100)}% ⇒ **配置层根因**，先启用向量再谈其他` };
    }
    if (recallLayer > thresholdLayer) {
        return { advice: 'fix-recall', total, miss, recallLayer, thresholdLayer, why: `召回层 ${recallLayer} > 阈值层 ${thresholdLayer} ⇒ **调阈值无用**，应查词表/索引/情境` };
    }
    return { advice: 'lower-threshold', total, miss, recallLayer, thresholdLayer, why: `阈值层 ${thresholdLayer} ≥ 召回层 ${recallLayer} ⇒ 瓶颈在熟悉度门限，可调 \`mclFamiliarThreshold\`` };
}
//# sourceMappingURL=recall-diagnosis.js.map