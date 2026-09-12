/** 原则与指针写入的全部依赖：配置 + 日志 + 画像头 + 根 + 子进程执行器 + 容量门 + 文本提取。 */
export interface ApplyDeps {
    config: any;
    log(m: string): void;
    PROFILE_HEADER: Record<string, string>;
    kRoot: string;
    runNode(nodeBin: string, scriptPath: string, args: string[], opts?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    }): Promise<{
        status: number | null;
        out: string;
        err: string;
    }>;
    capEnv(): Record<string, string>;
    textOf(r: {
        status: number | null;
        out: string;
        err: string;
    }): string;
}
export declare function applyPrinciples(d: ApplyDeps, memRoot: string, out: any): Promise<{
    attempted: number;
    added: number;
    replaced: number;
    skipped: number;
    gate: string;
    gateExit: number;
    rejectedLines: string[];
}>;
/** applyPointerOps（自 createDeepSleep 迁出；依赖经 DsScope 显式注入） */
export declare function applyPointerOps(d: ApplyDeps, memRoot: string, out: any): Promise<{
    updated: number;
    skipped: number;
    gate: string;
}>;
