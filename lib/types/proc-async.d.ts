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
 * **输出封顶累加器**（纯逻辑 · 零 IO · 可单测）。
 *
 * 为什么抽出来：M4 的判据是"**输出被真正截断**"，而它此前**无法在运行时验证** ——
 *   本会话实测：pwsh 沙箱下 node 的**异步**管道 stdout 不回传（`spawn`/`execFile` 的 `'data'` 事件拿不到数据，
 *   而 `execFileSync`/`spawnSync` 走另一条路所以能通）⇒ 任何"真去 spawn 一个 20MB 子进程"的测试都测不了。
 *   抽成纯函数后，可以用**真 20MB 字符串**直接喂它，判据落在行为上（`length ≤ cap` + 超限回调 + 之后的 chunk 全丢）。
 *
 * ⚠ 三个使用点（`proc-async` 自身 / `distill-proc` / `treeops`）**共用这一份实现** ——
 *   此前是同型逻辑抄了三份（M4 的成因之一就是"抄的时候把无效选项一起抄过去了"）。
 */
export declare function makeCappedSink(cap: number, onOverflow: () => void): {
    push: (buf: string, chunk: unknown) => string;
    overflowed: () => boolean;
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
