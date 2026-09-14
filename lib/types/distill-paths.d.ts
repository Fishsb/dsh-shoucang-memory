export interface DistillPaths {
    SHORT: string;
    logFile: string;
    kRoot: string;
    watermarkFile: string;
    auditFile: string;
    ledgerFile: string;
    pendDir: string;
    episodeFile: string;
    candidateDir: string;
    EPISODE_CAP: number;
    stubDir: string;
}
export declare function createDistillPaths(): DistillPaths;
