export type RunResult = {
    status: number | null;
    out: string;
    err: string;
};
export declare function runNode(nodeBin: string, scriptPath: string, args: string[], opts?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
}): Promise<RunResult>;
export declare const textOf: (r: RunResult) => string;
