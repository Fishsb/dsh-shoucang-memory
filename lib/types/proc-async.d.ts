export type ProcResult = {
    ok: boolean;
    /** 退出码（信号终止或超时为 null） */
    code: number | null;
    out: string;
    err: string;
    timedOut: boolean;
    /** 输出超过 maxBuffer（execFile 会以 ERR_CHILD_PROCESS_STDIO_MAXBUFFER 报错） */
    truncated: boolean;
};
/**
 * 异步跑一个子进程，**绝不抛**（失败以 `ok:false` 返回，由调用方决定降级语义）。
 *
 * ⚠ 与已被修掉的 M4 的对照：`maxBuffer` 在这里是**有效**的 —— 它属 `execFile`，而**不属** async `spawn`
 *   （那正是 M4 的病根）。此处不写 `as any`，让类型检查真的能校验选项合法性。
 */
export declare function runProcAsync(bin: string, args: string[], opts?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
}): Promise<ProcResult>;
