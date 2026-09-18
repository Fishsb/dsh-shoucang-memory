/** 停产挡位的 gate 名（**判据用**：`gate` 字段出现它 = 本轮"跑了但按口径不产出"，而不是"没跑"）。
 *  S2S3 册二（2026-09-19）：用户口径「S3 睡眠不产出」的落点。 */
export declare const PRODUCE_OFF_GATE = "produce-off";
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
/**
 * **叙事落地**（P5 · 2026-09-14）：把深睡归纳出的「经历叙事」写进 `notes/agent.md §经历/<标题>`。
 *
 * 为什么需要它（拟人化的 author 层）：McAdams 的自我三层里，双画像只覆盖 `actor`（特质/习惯），
 *   `agent`（目标/意图）与 `author`（**把经历整合成连贯叙事**）都缺。前面的环节只到「事实/承诺/决策」，
 *   没有人把「决定过什么 → 后来怎样」串成一段带因果与时间的叙述——那正是 `author` 层。
 *
 * 落点与形态：正文进 `notes/agent.md`（**详情层**），索引/记录由 `ring-commit` 的 `episodes` 通道写
 *   `episode` kind 记录（`pointer` 指回本小节，可深读）。**不新建文件**（`noteWarn` 由体检脚本管）。
 *
 * 幂等：同标题小节已存在 ⇒ **原地替换正文**（不重复追加；重跑深睡不会把同一个故事写两遍）。
 * 零抛出：写失败只回计数与日志，不打断深睡主链路。
 */
export declare function applyNarratives(d: ApplyDeps, memRoot: string, out: any): Promise<{
    written: number;
    skipped: number;
    titles: string[];
}>;
