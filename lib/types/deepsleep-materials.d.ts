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
    hotCtx: string;
    interCtx: string;
}
export declare function gatherMaterials(root: string): SleepMaterials;
