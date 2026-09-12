import { type EmbedCfg } from './vec.js';
import { type DeepSleepStatus, type SessRec } from './deepsleep-core.js';
/** 深睡状态机的外部依赖（全部由 distill 注入；本模块不反向依赖 distill）。 */
export interface DeepSleepCtx {
    log(m: string): void;
    audit(o: Record<string, unknown>): void;
    ledger(o: Record<string, unknown>): void;
    kRoot: string;
    auditFile: string;
    pendDir: string;
    candidateDir: string;
    PROFILE_HEADER: Record<string, string>;
    capEnv(): Record<string, string>;
    /** 蒸馏与深睡**共享**的可变状态（引用传递，两侧都写） */
    llmState: {
        providerFailCount: number;
    };
    /**
     * `registerDistill` 的两个入参。
     * ⚠ 类型用 any 是**刻意**的：AppContext / DistillConfig 定义在 distill.ts，
     *   若此处 `import type` 就会形成 deepsleep → distill 的依赖边，与「深睡回调蒸馏」一起构成**循环依赖**。
     *   代价是深睡内对 config/ctx 的字段访问失去编译期检查 —— 本区块是**原样搬移**（非新写），
     *   字段名不会错；待 P1 三期把这两个类型提到独立契约层后可恢复强类型。
     */
    appCtx: any;
    config: any;
    /** 子进程调用（模块级函数，定义在 distill.ts；注入以避免反向依赖） */
    runNode(nodeBin: string, scriptPath: string, args: string[], opts?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    }): Promise<{
        status: number | null;
        out: string;
        err: string;
    }>;
    textOf(r: {
        status: number | null;
        out: string;
        err: string;
    }): string;
    embedCfgOf(): EmbedCfg;
    probeScriptPath: string;
    distillAgent(agent: any): Promise<void>;
    writeDispatch(sid: string, out: any, route: string, workspace: string | null): Promise<{
        added: number;
        rejected: number;
        failed: number;
        targetLib: string;
    }>;
    writeProfileLine(root: string, target: string, section: string, line: string, replaceMatch?: string): {
        st: 'added' | 'dedup' | 'failed';
    } | {
        st: 'rejected';
        why: string;
    };
    validateProvider(): void;
    runSelfCheck(trigger: 'deep-sleep' | 'timer' | 'manual'): Promise<{
        verdict?: string;
        adjustments: string[];
    } | null>;
    resolveLlm(sp: string, sm: string): {
        provider: string;
        model: string;
    } | null;
    resolveDefaultModel(): {
        provider: string;
        model: string;
    } | undefined;
    pickParent(): any | null;
    parseAgentJson(result: any, label: string): any;
    normalizeProfileTarget(raw: string): 'USER.md' | 'AGENT.md' | null;
    locateTranscript(sid: string): Promise<string | null>;
    hasActiveSubagents(sid: string): boolean;
    ensureDaemonParent(signal: AbortSignal, agentOptions?: {
        provider: string;
        model: string;
    }): Promise<any | null>;
    bankSnapshot(label: string): Promise<void>;
}
export declare function createDeepSleep(C: DeepSleepCtx): {
    DEEP_SLEEP_CHECK_MS: number;
    sessions: Map<string, SessRec>;
    noteEvent: (sid: string, isTurnEnd: boolean) => void;
    runDeepSleep: (sinceArg?: number) => Promise<"done" | "failed" | "no-traces">;
    probeSession: (rec: SessRec) => void;
    deepSleepCheck: () => void;
    getDeepSleepStatus: () => DeepSleepStatus;
    runDeepSleepNow: () => Promise<{
        ok: boolean;
        error?: string;
        result?: "done" | "failed" | "no-traces";
    }>;
    getConfig: () => {
        enableDeepSleep: boolean;
        deepSleepIdleMs: number;
        deepSleepProbe: boolean;
        deepSleepProbeAfterMs: number;
        deepSleepProbeWindowMs: number;
    };
};
