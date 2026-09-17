/**
 * **写侧已有的全部 `task=` 键**（2026-09-17）。
 *
 * 用途：读侧 `sitCtx` 补 `task` 键时的**受控候选词表** —— 只允许从写侧真实存在的键里挑，
 *   禁从 query 硬抽（中文恒空、英文过匹配，均有实测；见 `situation-key#taskCueOf`）。
 *
 * 为什么按需现算而不落注册表：键集合**随库增长**（现 46 个），写死即静态快照 ⇒ 新任务型永远匹配不上。
 * 开销：只在 `sitBudget > 0` 时读盘一次（与 `situationLinesOf` 同源、同在装配路径上，不新增 IO 次数）。
 * 零抛出：拿不到就当空表（`taskCueOf` 返回 `''` ⇒ 该维承认缺席，不硬造）。
 */
export declare function knownTaskCuesOf(memRoot: string): string[];
/**
 * **情境槽候选**（P3 · 2026-09-14 原实现迁自 `panel-shared#situationLinesOf`，逐字等价）。
 * 只在预算 > 0 且 cues 非空时才读盘（缺省 `budgetChars=0` ⇒ **零开销、零行为变化**）。
 */
export declare function situationLinesOf(memRoot: string, cues: readonly string[], at: string, budget: number): string[];
