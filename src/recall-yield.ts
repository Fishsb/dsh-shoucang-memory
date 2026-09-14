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
