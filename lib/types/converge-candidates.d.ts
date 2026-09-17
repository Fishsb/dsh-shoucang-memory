/** 一条候选对（两条均为**逐字原文**，供模型直接引用与宿主校验）。 */
export interface ConvergeCandidate {
    file: string;
    coarse: string;
    fine: string;
    sim: number;
}
export interface ConvergeCandidateDeps {
    /** 向量配置（取自 `housekeep.embedCfgOf()`，与召回/联想同源）。 */
    embedCfg: unknown;
    /** 相似度下限（低于此不入候选；缺省 **0.75** —— S-P4c″ 实测上调：
     *   原 0.6 会把大量「同主题非同一知识」对混进候选（实测 36 对），干扰模型判定；
     *   0.75 以上才值得让模型花判断力。 ⚠ 与度量侧 `effective-directions` 的"中间带下沿 0.6"**有意不同**：
     *   那边是**报告口径**（要看见全貌），这边是**下发口径**（要控制噪声）—— 两者用途不同，故不强行统一。 */
    minSim?: number;
    /** 候选上限（控材料体积；缺省 8 —— 与收敛配额 3 留出判定余量）。 */
    topN?: number;
}
/**
 * 生成跨粒度收敛候选（**纯读 + 向量**；不写任何文件）。向量不可用时返回空数组**并给出原因**
 * （调用方如实记"未判" —— 仓内口径：失败/不可用 ⇒ null/空，绝不假装已判）。
 */
export declare function convergeCandidates(memRoot: string, deps: ConvergeCandidateDeps): Promise<{
    candidates: ConvergeCandidate[];
    reason: string;
}>;
