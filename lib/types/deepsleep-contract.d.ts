/**
 * deepsleep-contract.ts — 深睡的**依赖注入契约**（领域分组 + 组装入口）。
 *
 * 为什么单独成件：领域模块（traces/tree/apply/probe/run/materials）需要这些类型，
 *   而它们**不能** import deepsleep.ts（那会形成环：deepsleep → 领域模块 → deepsleep）。
 *   本件零 import（除 EmbedCfg 类型），是所有深睡模块的**类型汇聚点**，不引入运行时依赖。
 *
 * ⚠ 32 字段的扁平 `DeepSleepCtx` 是本轮要拆掉的团块：改成 **7 个领域分组**，每组内部 ≤8 字段。
 *   判据：任一实现函数的依赖能在一行里读完（trace 3 / tree 3 / apply 7 / probe 5 / materials 0）。
 */
import type { EmbedCfg } from './vec.js';
/** 子进程执行结果（深睡与蒸馏共享的形态） */
export interface RunNodeResult {
    status: number | null;
    out: string;
    err: string;
}
/** ① 输入输出：日志 / 审计 / 台账 / 路径（8 字段） */
export interface SleepIo {
    log(m: string): void;
    audit(o: Record<string, unknown>): void;
    ledger(o: Record<string, unknown>): void;
    kRoot: string;
    auditFile: string;
    pendDir: string;
    candidateDir: string;
    probeScriptPath: string;
}
/** ② 配置：运行期配置 + 画像头 + 容量门 + 共享 LLM 失败计数（4 字段，llmState 是**引用**共享态） */
export interface SleepCfg {
    /**
     * 蒸馏配置。⚠ 类型用 any 是**刻意**的：DistillConfig 定义在 distill.ts，
     *   若此处 import type 就形成 deepsleep → distill 的依赖边，与「深睡回调蒸馏」一起构成**循环依赖**。
     */
    config: any;
    PROFILE_HEADER: Record<string, string>;
    capEnv(): Record<string, string>;
    /** 蒸馏与深睡**共享**的可变状态（引用传递，两侧都写） */
    llmState: {
        providerFailCount: number;
    };
}
/** ③ 模型与子进程（5 字段） */
export interface SleepLlm {
    runNode(nodeBin: string, scriptPath: string, args: string[], opts?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    }): Promise<RunNodeResult>;
    textOf(r: RunNodeResult): string;
    resolveLlm(sp: string, sm: string): {
        provider: string;
        model: string;
    } | null;
    resolveDefaultModel(): {
        provider: string;
        model: string;
    } | undefined;
    validateProvider(): void;
}
/** ④ 会话与子代理（4 字段） */
export interface SleepSession {
    pickParent(): any | null;
    ensureDaemonParent(signal: AbortSignal, agentOptions?: {
        provider: string;
        model: string;
    }): Promise<any | null>;
    locateTranscript(sid: string): Promise<string | null>;
    hasActiveSubagents(sid: string): boolean;
}
/** ⑤ 落盘与解析（5 字段；distillAgent / writeDispatch 是**回调蒸馏**的依赖倒置出口） */
export interface SleepWrite {
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
    parseAgentJson(result: any, label: string): any;
    normalizeProfileTarget(raw: string): 'USER.md' | 'AGENT.md' | null;
}
/** ⑥ 收尾与嵌入（3 字段） */
export interface SleepHousekeep {
    runSelfCheck(trigger: 'deep-sleep' | 'timer' | 'manual'): Promise<{
        verdict?: string;
        adjustments: string[];
    } | null>;
    bankSnapshot(label: string): Promise<void>;
    embedCfgOf(): EmbedCfg;
}
/** ⑦ 状态机自持的可变状态（2 字段；由 createDeepSleep 构造后注入 run 编排器） */
export interface SleepState {
    /** ⚠ 装箱成对象：runDeepSleep 会写它，标量经解构传递是**快照**，写不回闭包 */
    streak: {
        v: number;
    };
    /** 痕迹窗口起点（必须在推进 lastDeepSleepAt **之前**取值，否则窗口恒空） */
    traceSince(): number;
}
/**
 * 组装入口（7 字段）。distill.ts 的 registerDistill 是唯一构造方。
 * ⚠ appCtx 类型用 any：AppContext 定义在 distill.ts，import 即成环（同 cfg.config 的理由）。
 */
export interface DeepSleepCtx {
    io: SleepIo;
    cfg: SleepCfg;
    llm: SleepLlm;
    session: SleepSession;
    write: SleepWrite;
    housekeep: SleepHousekeep;
    appCtx: any;
}
