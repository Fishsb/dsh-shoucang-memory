/** 痕迹采集的全部依赖：两个候选目录 + 一条审计流。 */
export interface TraceDeps {
    candidateDir: string;
    pendDir: string;
    auditFile: string;
}
export declare function gatherDeepSleepTraces(d: TraceDeps, memRoot: string, since: number): string;
