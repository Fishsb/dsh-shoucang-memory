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
// 🔴🔴 **J5/U3 前置实测（2026-09-16 · 常备探针 `scripts/yield-signal-probe.mjs`）—— 三条事实，
//   读本件前必看**（否则会在**死信号**上继续叠加升级）：
//   ① **信号源已死**：`phase:'compliance'` 行 **1061** 条，`compliant=true` **0** 条 ⇒ 合规率 **0.0%**
//      ⇒ `nextZeroGain` 永远只走"递增"分支、**不可能归零**（`zeroGain` 实测冲到 **246**）。
//   ② **判据恒真**：`switchSource=true` **878/1061 = 82.8%** ⇒ "换向信号"是**恒真噪声**
//      （恒真 = 没有判别力，正是仓内最忌的「假旋钮」）。
//   ③ **无人消费**：`switchSource`/`zeroGain` **只写进审计，`src/` 内没有消费者** ⇒ **没有行为后果**
//      （与本件抬头"不产生任何行为后果"的自述一致 —— 至今仍如此）。
//   ⇒ **正确顺序 = 先修信号源，再谈判定机制**：在死信号上把判定交 LLM（本册 §3.3 的写法）
//     **毫无意义** —— 喂进去的仍是"未引用"这一条恒真事实。修信号源须取证
//     「**注入材料之后模型实际做了什么**」（可从转录顺带采集，同 S-P2 工具维的做法）。

/** 连续未引用多少次即认为「该来源线索已变弱」（对齐人类"线索变弱即换向"；缺省 2） */
export const SWITCH_THRESHOLD = 2

/** 折一次收益：合规 ⇒ **归零**（来源仍有效）；不合规 ⇒ 递增（线索在变弱） */
export function nextZeroGain(prev: number | undefined, compliant: boolean): number {
  return compliant ? 0 : Math.max(0, Number(prev) || 0) + 1
}

/** 是否已达换向阈值（`switchSource` 信号；调用方据此改变检索来源，而非继续灌同一批材料） */
export function shouldSwitchSource(zeroGain: number | undefined, threshold = SWITCH_THRESHOLD): boolean {
  return (Number(zeroGain) || 0) >= Math.max(1, threshold)
}

/** 收益读数（供诊断聚合；纯函数、含分母口径——合规率**必须有分母**，仓内曾因只在失败分支落账而无分母） */
export function yieldOf(rows: ReadonlyArray<{ compliant?: boolean }>): { total: number; compliant: number; rate: number | null } {
  const total = rows.length
  const compliant = rows.filter((r) => r.compliant === true).length
  return { total, compliant, rate: total ? Math.round((compliant / total) * 1000) / 10 : null }
}

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
