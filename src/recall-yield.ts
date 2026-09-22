// recall-yield.ts — S4/D1（2026-09-14）：**检索收益与停止准则**（消费链条）
//
// 判因（S4 方案 §4.4；人类依据见 `docs/human-task-loop-vs-embodied-ai-2026-09.md` §1.3）：
//   人类按**边际价值**停止检索 —— 当某来源的边际收益降到低于环境平均，就**离开该斑块**。
//   而本插件此前**没有任何停止判据**：慢通道注入材料后，模型引用与否只落审计，
//   **不产生任何行为后果**（再引导上限 1 次即放行）。
//
// **零新采集**：收益信号**审计里早就有** —— `phase:'compliance'` 事件的 `compliant` 字段
//   就是「材料是否被引用」。本件只做两件事：把它折成**连续零增益计数**，按阈值出**换向信号**。
//
// 边界（照仓内"工具只提案不判"的先例）：本件**只出信号**（`switchSource`），
//   **不决定换向到哪** —— 选行归 `ring-supply` / `recallIndex`。判据在此，决策留给调用方与模型。
//
// 纯函数、零 IO、零依赖、零抛出 —— 可独立断言。
//
// ★接线状态（**F1 修复 · 2026-09-18**）：**一律以调用点为准，本注释不单独宣称**（仓内纪律：自述不得当证据）。
//   实测调用点 = `deepsleep-run.ts#judgeYieldRounds`（读 `audit/yield-rounds.jsonl` → 确定性先筛 → 子代理判
//   → 严格解析 → 语义换向判定 + 与计数法对账），审计字段 `yieldJudged` 有真机行。
//   登记口 = 注册表 `criteria.json#wiring.pending`（为空 ⇒ 无待接项），由 `scripts/check-claim-alignment.mjs`
//   守「注释自称 ↔ 调用图」一致。⚠ 旧注释曾把本件写成"没有行为后果"，而实况**早已接线** —— 正是本册要消灭的漂移。

/** 连续未引用多少次即认为「该来源线索已变弱」（对齐人类"线索变弱即换向"；缺省 2） */
export const SWITCH_THRESHOLD = 2

/** 折一次收益：**回引**（`topicEcho`，旧称 compliant）⇒ 归零；未回引 ⇒ 递增（线索在变弱）。
 *  ⚠ 参数 2026-09-18 更名：该布尔测的是**上一步回复是否回引了材料主题词**（词面代理，实测 true=0/3119），
 *  不是"材料被用上了"。真实收益信号见 `audit/yield-rounds.jsonl`（J5/U3-修信号）。
 *  ⚠ 2026-09-22（D5）：本函数**保留为兼容入口**（旧调用方零迁移）；新路径一律走 `foldZeroGain`
 *   —— 它才带**三态**（action / echo / 无证据）。二者**同一实现**（本函数即其 echo 分支的薄封装）。 */
export function nextZeroGain(prev: number | undefined, topicEcho: boolean): number {
  return topicEcho ? 0 : Math.max(0, Number(prev) || 0) + 1
}

/* ══ D5（2026-09-22）：收益信号**换源 + 三态化** ══════════════════════════════════════════
 * 判因（用户拍板 D5 · 本轮实测两组分布，**两组都不是"材料被用上"**）：
 *   · **词面代理** `topicEcho`（上一步回复是否出现材料主题词）：真机 `true = 0/3119`
 *     ⇒ **恒 false** ⇒ 本链**只递增、永不归零** ⇒ 换向信号**恒真**（真机曾达 94.6%）。
 *     它自述就**不是**"材料被用上"（见 `mcl.ts` 审计注释）⇒ 拿它判慢通道成败＝**代理指标当判据**。
 *   · **真实动作** `nextTools`（注入后模型是否真的调了工具，`audit/yield-rounds.jsonl`）：
 *     实测 **4985/5931 = 84.0% 非空**（长度分布 `{0:946, 1:17, 2:21, 3:4947}`）。
 *     ⚠ **如实记**：它**同样不是"材料被用上"**，且 84% 近恒定 ⇒ 单用它会把换向出口**变哑**
 *       （84% 归零 ⇒ 几乎不再出换向）。**所以本轮不做"朴素换源"** —— 那是用一种弱代理
 *       换掉另一种（仓内反复剿的「假绿换假绿」）。
 *   · **真正的收益判据**在 `deepsleep-run#judgeYieldRounds`（读 yield-rounds → **子代理语义判**
 *     "材料对随后动作有没有实质帮助"...）—— 那是**离线、按轮**的，**不适合每步**。
 *
 * ⇒ 本轮落**三态 + 显式留痕**（判据诚实，而不是把弱信号包装成强判据）：
 *   `acted=true`（有真实动作）⇒ 归零：**线索没变弱**（模型还在推进），不该换向；
 *   `acted=false`（无动作）⇒ 递增：**进展停滞**，才是换向该看的形态；
 *   证据缺失（两路都取不到）⇒ **保持不动**（既不归零也不递增）—— 宁可不动，也不据"无证据"换向
 *     （与 J5/U3 既有保守口径同旨：「未判 ⇒ 不换向」；换向会丢当前来源上下文，代价高于多试一次）。
 *
 * ⚠ **信号优先级**：真实动作（可观测时）> 词面代理 > 无证据。选此序的判因：动作是**行为证据**，
 *   回引是**词面巧合**；但当动作不可观测（快照不可达）时，回退到词面代理**好过装作无信号**。
 * ⚠ 判据（机检）：`yieldSignal` / `acted` 必须落审计 ⇒ 「用了哪个信号」可事后分辨（`输入量须可见化`）。 */

/** 一次收益折减的**信号来源**（三态）——落审计，供事后分辨"这条判定依据是什么"。 */
export type YieldSignalKind = 'action' | 'echo' | 'none'

export interface YieldFolding {
  /** 折减后的连续零增益计数（`0` = 本轮有正向证据）。 */
  zeroGain: number
  /** **哪个信号**驱动了本次折减。 */
  signal: YieldSignalKind
  /** 真实动作（`true` 有动作 / `false` 无动作 / `null` 取不到）。 */
  acted: boolean | null
}

/**
 * **收益折减的单一实现**（纯函数 · 零 IO · 零抛出）。
 * @param prev 上一步的连续零增益计数
 * @param input `acted` = 真实动作（注入后是否调过工具；`null` = 不可观测）；
 *              `echoed` = 词面代理（上一步是否回引主题词；`null` = 不可观测）
 */
export function foldZeroGain(
  prev: number | undefined,
  input: { acted?: boolean | null; echoed?: boolean | null },
): YieldFolding {
  const n = Math.max(0, Number(prev) || 0)
  const acted = input.acted === true || input.acted === false ? input.acted : null
  const echoed = input.echoed === true || input.echoed === false ? input.echoed : null
  if (acted !== null) return { zeroGain: acted ? 0 : n + 1, signal: 'action', acted }
  if (echoed !== null) return { zeroGain: nextZeroGain(prev, echoed), signal: 'echo', acted: null }
  // 无证据 ⇒ **保持不动**（不归零也不递增）——见上方判因
  return { zeroGain: n, signal: 'none', acted: null }
}

/** 是否已达换向阈值（`switchSource` 信号；调用方据此改变检索来源，而非继续灌同一批材料） */
export function shouldSwitchSource(zeroGain: number | undefined, threshold = SWITCH_THRESHOLD): boolean {
  return (Number(zeroGain) || 0) >= Math.max(1, threshold)
}

/* ══ F2 处置（IR1 附册 · 2026-09-18）：旧 `yieldOf(rows)` 读数**已删除** ══════════════════
 * 它把审计里的 `compliant` 折成"合规率"，而该字段实测 **true = 0 / 3119**（恒 false 的假信号）；
 * 留着它等于继续发布一个"看起来在测量、实际测不出任何东西"的指标（验收册 F2：字段**要么真、要么无**）。
 * 现状：审计只发布诚实命名的 `topicEcho`（上一步是否回引材料主题词）；**真实收益读数**在
 * `audit/yield-rounds.jsonl`（注入之后的实际动作），由 `deepsleep-run#judgeYieldRounds` 消费。 */

/* ══ J5 / U3（2026-09-16）**收益判定交 LLM，并与确定性计数分层** ═════════════════════════
 * 判因（方案册 §3.3）：上面 `shouldSwitchSource` 把「**这次检索是否产生实质进展**」——
 *   一个**语义判断**（正是本仓行动级判据「**连续 2 次无实质进展即停下回溯**」的机器化）——
 *   降维成 `zeroGain >= 2` 的**计数**。计数看不见"材料没被引用但那轮靠别的路径解决了"这类情形
 *   ⇒ 会把**实际有进展**的轮次也计入零增益，导致**误换向**。
 * 改法（与 J3 同族的判据分层）：**确定性仍产候选**（`shouldSwitchSource` 保留，用于筛"疑似零收益"回合），
 *   **判定交 LLM**（读该轮检索结果与后续动作，判是否真帮上），再由判定序列出换向信号。
 * 保守口径：**只有明确的 `helped=false` 才累积链**；`true` 或**未判（null）都打断链** ⇒
 *   宁可**不换向**，也不因解析失败而误换（换向会丢掉当前来源的上下文，代价高于多试一次）。 */

/** 一轮待判的检索（**只带判定所需的最小事实**，不塞原文）。 */
export interface YieldRound {
  /** 回合序号（0 起；用于把判定结果对回去）。 */
  i: number
  /** 该轮注入的材料字符数（0 = 没注入任何材料，本身就是强线索）。 */
  injectedChars: number
  /** 材料是否被后续动作引用（**旧信号**；实测恒 false ⇒ 只能作旁证，不能作主判据）。 */
  cited: boolean
  /** **注入之后模型实际调用了哪些工具**（新取证信号；ASCII 工具名，来自 `yield-rounds.jsonl`）。 */
  nextTools: readonly string[]
  /** 该轮之后模型做了什么（**可选**：转录摘要，当前采集层只落工具名 ⇒ 通常为空）。 */
  nextAction?: string
}

/** 构造收益判定请求（**纯函数**：只拼文本）。 */
export function buildYieldRequest(rounds: readonly YieldRound[]): string {
  const lines: string[] = []
  lines.push('你在判定「检索是否真的帮上了」。下面是若干**疑似零收益**的回合（旧信号"材料未被引用"）。')
  lines.push('⚠ 注意：**旧信号"未被引用"实测恒为 false、没有判别力** —— 所以别只看它，**要看注入之后模型实际做了什么**。')
  lines.push('**未被引用 ≠ 没帮上**：模型可能已从材料得到方向、随后用别的方式解决了，或材料证实了它原本的判断。')
  lines.push('请逐轮判断：**这一轮注入的材料，对随后的动作有没有实质帮助**？')
  lines.push('')
  for (const r of rounds.slice(0, 20)) {
    lines.push(`- 回合 ${r.i}：注入 ${r.injectedChars} 字符 · 旧信号(被引用)=${r.cited ? '是' : '否'}`)
    lines.push(`    注入后调用的工具（按序，最多 3 个）：${r.nextTools.length ? r.nextTools.join(' → ') : '**（没有调用任何工具）**'}`)
    if (r.nextAction) lines.push(`    后续动作摘要：${String(r.nextAction).slice(0, 160)}`)
  }
  lines.push('')
  lines.push('只输出一行 JSON 数组（每轮一项，顺序不限，i 必须与上面一致）：')
  lines.push('[{"i":0,"helped":true,"why":"≤40字"},{"i":1,"helped":false,"why":"≤40字"}]')
  lines.push('判不准就把该项的 helped 写成 null（**不要猜**）。')
  return lines.join('\n')
}

export interface YieldJudgement {
  i: number
  /** `true` 帮上了 · `false` 确实没帮上 · `null` 判不准（**未判**） */
  helped: boolean | null
  why: string
}

/**
 * 严格解析（**不猜、不兜底**）：必须是一行 JSON **数组**，每项含数值 `i`；
 * `helped` 只接受 `true|false|null`。任一项不合法 ⇒ **整体 `null`**
 *   （宁可整批判"未判"，也不接受半解析 —— 半批会静默改变换向链的长度）。
 */
export function parseYieldJudgements(text: string): YieldJudgement[] | null {
  const m = /\[[\s\S]*\]/.exec(String(text || ''))
  if (!m) return null
  let arr: unknown
  try { arr = JSON.parse(m[0]) } catch { return null }
  if (!Array.isArray(arr) || !arr.length) return null
  const out: YieldJudgement[] = []
  for (const x of arr) {
    const o = x as { i?: unknown; helped?: unknown; why?: unknown }
    if (typeof o?.i !== 'number' || !Number.isFinite(o.i)) return null
    const h = o.helped
    if (!(h === true || h === false || h === null)) return null
    out.push({ i: o.i, helped: h as boolean | null, why: String(o.why || '').slice(0, 80) })
  }
  return out
}

/**
 * 由**语义判定序列**出换向信号（替代/并列于计数法）。
 * 口径：**只有明确的 `false` 累积**；`true` 或 `null`（未判）都**打断链** ⇒ 保守不换向。
 * @param threshold 连续多少个明确 `false` 才换（与计数法同缺省 2 —— 语义不同，但行动级判据一致）
 */
export function switchFromJudgements(judgements: readonly YieldJudgement[], threshold = SWITCH_THRESHOLD): boolean {
  const need = Math.max(1, threshold)
  let run = 0
  for (const j of judgements) {
    if (j.helped === false) { run++; if (run >= need) return true }
    else run = 0                       // true 或 null（未判）一律打断
  }
  return false
}
