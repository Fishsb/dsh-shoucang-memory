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
    /** S3-3/S3-4（2026-09-14）材料段**条数**：审计可见化用 —— 让"本轮给了几条候选"可查
     *  （此前审计只有消费结果 `forgetArchived`/`forgetKept`，没有输入量）。 */
    counts: {
        split: number;
        forget: number;
        replay: number;
        hot: number;
        inter: number;
        pending: number;
    };
}
export declare function gatherMaterials(root: string): SleepMaterials;
