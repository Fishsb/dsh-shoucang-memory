/** 一轮深睡需要的全部「现行材料」文本（供 userInput 拼装；全部只读派生）。 */
export interface SleepMaterials {
    currentPrinciples: string;
    currentList: string;
    currentProfiles: string;
    currentMemIndex: string;
    currentTreeSections: string;
    splitCandidates: string;
    forgetCandidates: string;
    replayRecent: string;
    /** 待回收的裁决（P5 outcomes 通道的材料；见实现处注释） */
    pendingDecisions: string;
    hotCtx: string;
    interCtx: string;
    /** S-P2c（2026-09-16）**本纪元工具使用**（第 12 段材料，来自 `audit/tool-usage.jsonl`）。
     *  与"经历"其余各段互补：这里回答的是「当天用了**哪些工具**、各用了几次」——
     *  人类睡眠重构的原料是「经历 × 用到的工具知识」的结合，此段即"工具"那一维的入口。
     *  ⚠ 只含 工具名/次数/会话短码/日期，**不含参数原文**（隐私红线由 `check-journal-privacy` 守）。 */
    toolUsage: string;
    /** S3-3/S3-4（2026-09-14）材料段**条数**：审计可见化用 —— 让"本轮给了几条候选"可查
     *  （此前审计只有消费结果 `forgetArchived`/`forgetKept`，没有输入量）。 */
    counts: {
        split: number;
        forget: number;
        replay: number;
        hot: number;
        inter: number;
        pending: number;
        tools: number;
    };
    /** S1R（2026-09-19 · G7）**小节寻址输入量可见化**：剔除不再静默。
     *  此前 `if (!sectionExists(...)) continue` 静默剔除（实测冷候选 37 → 剔 10 条，零痕迹），
     *  且 `sectionExists` 把「同名歧义」也算作"不存在"（`matchSection` 多命中⇒null）⇒ 真实可读的小节被丢弃。 */
    sectionRef: {
        droppedMissing: number;
        ambiguousKept: number;
        ambiguous: string[];
        missing: string[];
    };
}
export declare function gatherMaterials(root: string, sinceMs?: number): SleepMaterials;
