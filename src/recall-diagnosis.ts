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

/** 归因标签（`ok` = 有高置信命中且熟悉度达标，即快通道条件成立） */
export type RecallMissReason =
  | 'ok'
  | 'recall-empty' // 召回 0 行（词法 + 向量都没命中）
  | 'no-highconf' // 召回到行，但无 mclGate 高置信标签（[路径]/[原则]）
  | 'below-threshold' // 有高置信行，但相似度低于熟悉度阈值
  | 'embed-off' // 向量未启用 ⇒ sim 恒 0，阈值判定无从谈起

export interface RecallSignals {
  /** 召回行数（`recallRanked` 返回的 `rows.length`） */
  rowsN: number
  /** 是否含 `mclGate` 高置信标签行 */
  hasHighConf: boolean
  /** 熟悉度（绝对余弦；向量关闭时为 0） */
  sim: number
  /** 熟悉度阈值（`cfg.familiarThreshold`） */
  threshold: number
  /** 向量是否启用 */
  embedEnabled: boolean
}

/**
 * 归因（顺序与 `mcl.ts#decideTurn` 的 `fast` 判定一致）：
 *   ① 向量关 ⇒ `embed-off`（此时 `sim` 恒 0，后续判定无意义 —— 先报根因，不报"阈值不足"这种表象）
 *   ② 召回空 ⇒ `recall-empty`
 *   ③ 无高置信 ⇒ `no-highconf`
 *   ④ `sim` 未达阈 ⇒ `below-threshold`
 *   ⑤ 否则 `ok`
 */
export function recallMissReasonOf(s: RecallSignals): RecallMissReason {
  if (!s.embedEnabled) return 'embed-off'
  if (s.rowsN <= 0) return 'recall-empty'
  if (!s.hasHighConf) return 'no-highconf'
  if (s.sim < s.threshold) return 'below-threshold'
  return 'ok'
}

/** 是否为"真·没命中"（供诊断聚合区分「召回层问题」与「阈值层问题」） */
export function isRecallLayerMiss(r: RecallMissReason): boolean {
  return r === 'recall-empty' || r === 'no-highconf'
}

/** S4R/R3（2026-09-14）**调参建议**：由归因分布推导"该动哪一层"。 */
export type RecallAdvice = 'insufficient-data' | 'enable-embed' | 'fix-recall' | 'lower-threshold'

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
export function adviseFromMissCounts(
  counts: Readonly<Partial<Record<RecallMissReason, number>>>,
  minSamples = 30,
): { advice: RecallAdvice; total: number; miss: number; recallLayer: number; thresholdLayer: number; why: string } {
  const n = (k: RecallMissReason): number => Math.max(0, Number(counts[k]) || 0)
  const total = n('ok') + n('recall-empty') + n('no-highconf') + n('below-threshold') + n('embed-off')
  const miss = total - n('ok')
  const recallLayer = n('recall-empty') + n('no-highconf')
  const thresholdLayer = n('below-threshold')
  if (total < Math.max(1, minSamples)) {
    return { advice: 'insufficient-data', total, miss, recallLayer, thresholdLayer, why: `样本 ${total} < 下限 ${minSamples} ⇒ **不猜方向**（猜出来的调参会误导）` }
  }
  if (miss > 0 && n('embed-off') / miss > 0.5) {
    return { advice: 'enable-embed', total, miss, recallLayer, thresholdLayer, why: `embed-off 占未命中 ${Math.round((n('embed-off') / miss) * 100)}% ⇒ **配置层根因**，先启用向量再谈其他` }
  }
  if (recallLayer > thresholdLayer) {
    return { advice: 'fix-recall', total, miss, recallLayer, thresholdLayer, why: `召回层 ${recallLayer} > 阈值层 ${thresholdLayer} ⇒ **调阈值无用**，应查词表/索引/情境` }
  }
  return { advice: 'lower-threshold', total, miss, recallLayer, thresholdLayer, why: `阈值层 ${thresholdLayer} ≥ 召回层 ${recallLayer} ⇒ 瓶颈在熟悉度门限，可调 \`mclFamiliarThreshold\`` }
}

/* ══ J3 / U1（2026-09-16）**归因与方向交 LLM，并与细校准对账** ══════════════════════
 * 判因（方案册 §3.1 实证）：上面的 `adviseFromMissCounts` 用**计数大小**定方向，它给出
 *   `lower-threshold`，而 2154 条样本的**细校准结论是「维持 0.55 不改」**（降 0.54 会过冲 11.6pp）
 *   ⇒ **两者方向相反，一致率实测 = 0**。根因不是阈值，而是"**方向由计数决定、不看语义**"。
 * 改法（遵"候选生成交确定性/向量，模糊判断交模型"）：**保留上面的确定性计数**（第一层筛选，零成本），
 *   把**归因与方向**交 LLM —— 输入含 计数分布 + 未命中样本（查询 + 候选行 + sim）+ **注册表的细校准结论**，
 *   要求 LLM **与之对账**后给方向与理由；判据 = **一致率**。
 * ★接线状态（**F1 修复 · 2026-09-18**）：**一律以调用点为准，本注释不单独宣称**（仓内纪律：自述不得当证据）。
 *   实测调用点 = `deepsleep-run.ts`（`buildAttributionRequest` / `parseAttribution` / `samplesFromMclRows` /
 *   `calibrationVerdictOf`，审计 `attribution*` 字段有真机行）；`agreementRate` 是**对账/测试用**纯函数，
 *   **不在运行链上**（不得把它算作"已接线"）。
 *   本件因此**不给任何 criteria 打"由模型判定"的机制标记** —— 那不是"没接"，而是**登记纪律**：
 *   机制标记需要真实调用点**与判据同时在场**（避免 §4.1 的"假旋钮"）。
 *   登记口 = 注册表 `criteria.json#wiring.pending`（为空 ⇒ 无待接项），由 `scripts/check-claim-alignment.mjs`
 *   守「注释自称 ↔ 调用图」一致。⚠ 旧注释曾把调用点写成"下一轮的活"，而实况**早已接线** —— 正是本册要消灭的漂移。
 *   ⚠ 注：此处**刻意不抄那两个字面标记** —— 上一版在注释里写了它，导致测试件里"不得出现该标记"的断言
 *     **命中了注释自身**而误报红（同族教训：注释与判据同形文本 ⇒ 断言从注释里误匹配）。 */
export type AttributionVerdict = 'maintain' | 'lower' | 'raise' | 'fix-recall' | 'enable-embed' | 'insufficient'

/** 确定性计数的方向 → 归因词表（**仅用于对账比较**，不用于替代 LLM 判断）。 */
export function directionOfAdvice(a: RecallAdvice): AttributionVerdict {
  if (a === 'lower-threshold') return 'lower'
  if (a === 'fix-recall') return 'fix-recall'
  if (a === 'enable-embed') return 'enable-embed'
  return 'insufficient'
}

export interface AttributionSample {
  /** 该步的查询（可为空串，空查询本身是重要线索）。 */
  q: string
  /** 召回到的候选行（截断后的展示文本）。 */
  rows: readonly string[]
  /** 熟悉度（绝对余弦）。 */
  sim: number
}

/**
 * 构造归因请求（**纯函数**，只拼文本，不发请求）。
 * ⚠ **必须带上注册表的细校准结论** —— 否则 LLM 无从"对账"，只会另给一个方向，
 *   一致率又会是 0（那正是本项要解决的问题，不是要重复的错误）。
 */
export function buildAttributionRequest(
  counts: Readonly<Partial<Record<RecallMissReason, number>>>,
  samples: readonly AttributionSample[],
  calibration: { id: string; value: number; conclusion: string },
): string {
  const c = (k: RecallMissReason): number => Math.max(0, Number(counts[k]) || 0)
  const total = c('ok') + c('recall-empty') + c('no-highconf') + c('below-threshold') + c('embed-off')
  const miss = total - c('ok')
  const lines: string[] = []
  lines.push('你是召回质量归因器。下面是**确定性计数**（只作线索，不作结论）与若干未命中样本。')
  lines.push(`计数：总 ${total} · 未命中 ${miss} · recall-empty ${c('recall-empty')} · no-highconf ${c('no-highconf')} · below-threshold ${c('below-threshold')} · embed-off ${c('embed-off')}`)
  lines.push('')
  lines.push('样本（查询 / 命中行 / 熟悉度）：')
  for (const s of samples.slice(0, 20)) {
    lines.push(`- q=「${(s.q || '(空查询)').slice(0, 80)}」 sim=${s.sim.toFixed(3)} rows=${s.rows.length}`)
    for (const r of s.rows.slice(0, 3)) lines.push(`    · ${r.slice(0, 100)}`)
  }
  lines.push('')
  lines.push('**已有的细校准结论（必须与之对账，不要另起炉灶）**：')
  lines.push(`- ${calibration.id} = ${calibration.value}；结论：${calibration.conclusion}`)
  lines.push('')
  lines.push('请判断：这批未命中的**主因**是什么？在该校准结论之下，**该不该改阈值**？')
  lines.push('只输出一行 JSON：{"verdict":"maintain|lower|raise|fix-recall|enable-embed|insufficient","reason":"≤60字"}')
  lines.push('其中 maintain = 维持现阈值（问题不在阈值）；lower/raise = 建议调低/调高；其余 = 根因不在阈值层。')
  return lines.join('\n')
}

const VERDICTS: readonly AttributionVerdict[] = ['maintain', 'lower', 'raise', 'fix-recall', 'enable-embed', 'insufficient']

/**
 * 严格解析归因输出。**格式不符即返回 `null`** —— 不猜、不兜底、不静默通过
 *   （仓内教训：解析失败若兜底成默认值，下游会把"没解析出来"当成"判了 maintain"）。
 */
export function parseAttribution(text: string): { verdict: AttributionVerdict; reason: string } | null {
  const m = /\{[\s\S]*?\}/.exec(String(text || ''))
  if (!m) return null
  let o: { verdict?: unknown; reason?: unknown }
  try { o = JSON.parse(m[0]) } catch { return null }
  const v = String(o?.verdict || '')
  if (!(VERDICTS as readonly string[]).includes(v)) return null
  return { verdict: v as AttributionVerdict, reason: String(o?.reason || '').slice(0, 120) }
}

/** 一致率统计（**判据本体**：LLM 归因与细校准结论的一致率）。 */
export function agreementRate(items: readonly { verdict: AttributionVerdict | null; calibration: AttributionVerdict }[]): { n: number; agree: number; rate: number | null; unknown: number } {
  const n = items.length
  if (!n) return { n: 0, agree: 0, rate: null, unknown: 0 }
  const unknown = items.filter((x) => x.verdict === null).length
  const judged = items.filter((x) => x.verdict !== null)
  const agree = judged.filter((x) => x.verdict === x.calibration).length
  // **未判不计入分母**（否则"没解析出来"会稀释一致率，把失败伪装成"部分一致"）
  return { n, agree, rate: judged.length ? agree / judged.length : null, unknown }
}

/**
 * 从**注册表 note** 推细校准结论（**纯函数**：只吃字符串，不读文件 —— 本件保持零 IO）。
 * 调用方用 `criteria.generated#SURFACE.mcl.note` 传入（生成物 ⇒ 零 IO、单一事实源）。
 * ⚠ 判据是**保守的**：认不出就返回 `insufficient`（**不猜** "maintain"）——
 *   猜错会让"一致率"虚高，正好掩盖本项要暴露的问题。
 */
export function calibrationVerdictOf(note: string): AttributionVerdict {
  const t = String(note || '')
  if (!t) return 'insufficient'
  if (/维持不改|维持\s*\d/.test(t)) return 'maintain'
  if (/建议?降|调低|下调/.test(t)) return 'lower'
  if (/建议?升|调高|上调/.test(t)) return 'raise'
  return 'insufficient'
}

/** 从 mcl-step 审计行抽归因样本（**纯函数**：只做映射，不读文件）。
 *  ⚠ **实测限制（如实记）**：`mcl-step` 审计行**不记 query 原文**（只记 `hit`/`topics`/`sim`/`rowsN`）
 *    ⇒ 归因请求里的"查询"只能由 `topics` 近似，必要时为空。要真正带上 query，
 *      须在 `mcl.ts` 的审计行里加字段（与仓内「输入量须可见化」同族）—— 属后续项，**此处不假装有**。 */
export function samplesFromMclRows(rows: readonly Record<string, unknown>[], limit = 20): AttributionSample[] {
  const out: AttributionSample[] = []
  for (const r of rows) {
    if (String(r?.missReason || 'ok') === 'ok') continue
    const topics = Array.isArray(r?.topics) ? (r.topics as unknown[]).map(String) : []
    const hit = String(r?.hit || '')
    out.push({ q: topics.join(' / '), rows: hit ? [hit] : [], sim: Number(r?.sim) || 0 })
    if (out.length >= limit) break
  }
  return out
}
