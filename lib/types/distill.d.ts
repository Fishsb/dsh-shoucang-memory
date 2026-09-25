import { type DeepSleepStatus } from './deepsleep-core.js';
type AppContext = {
    tools: {
        register(tool: unknown): unknown;
    };
    llm: any;
    subagents: {
        start(name: string, request: any): Promise<any>;
    };
    agents: {
        get(id: string): any;
        list(): any[];
        roots(): any[];
        create(options: any): Promise<any>;
    };
    logger?: {
        info?(msg: string): void;
    };
    on(event: string, handler: (arg: any, arg2?: any) => void): unknown;
    effect(fn: () => any, key?: string): unknown;
};
export interface DistillConfig {
    nodeBin: string;
    idleWakeMs: number;
    minTurnChars: number;
    distillPrescan: boolean;
    prescanMinChars?: number;
    distillPrompt: string;
    llmProvider: string;
    llmModel: string;
    distillProvider: string;
    distillModel: string;
    sleepProvider: string;
    sleepModel: string;
    distillEffort?: string;
    sleepEffort?: string;
    enableDistill?: boolean;
    enableDeepSleep: boolean;
    enableRemPass?: boolean;
    deepSleepIdleMs: number;
    deepSleepProbe: boolean;
    deepSleepProbeAfterMs: number;
    deepSleepProbeWindowMs: number;
    deepSleepProbeSamples: number;
    deepSleepProbeConfirm: number;
    deepSleepDaemonParent: boolean;
    deepSleepProbeRetries: number;
    deepSleepProbeMaxMs: number;
    activationShadow?: boolean;
    activationPrefetch?: boolean;
    activationTOn?: number;
    activationTOff?: number;
    activationCooldownSteps?: number;
    activationTopK?: number;
    capAgent?: number;
    capUser?: number;
    capMemory?: number;
    /** ADR-333 容量门开关（false=不阻断，缺省；true=超限拒写）。⚠ 必须与 `scheduler.ts` 的
     *  schema 及 `distillOptionsOf` 的显式映射**三处同批** —— 本接口此前就因漏声明 eval 域
     *  6 键而出现「映射有 ≠ 类型有」（见下方 :119-121 注解）。 */
    capacityEnforce?: boolean;
    embedEnabled?: boolean;
    embedBaseUrl?: string;
    embedModel?: string;
    embedApiKeyEnv?: string;
    evalEnabled?: boolean;
    evalBaseUrl?: string;
    evalModel?: string;
    evalApiKeyEnv?: string;
    evalTier?: string;
    evalEgressAllow?: boolean;
    recallFusion?: string;
    bankGit?: boolean;
    injectProfileRows?: number;
    scoreWeights?: string;
    shadowScore?: boolean;
    maturationEnforce?: boolean;
    perItemGate?: boolean;
    selfCheck?: boolean;
    selfCheckRepo?: string;
    selfCheckAutoRollback?: boolean;
    selfCheckIntervalHours?: number;
    storeMode?: string;
    activityWarmDays?: number;
    activityColdDays?: number;
    activityArchiveDays?: number;
    activityHotHits?: number;
    recallColdFactorPercent?: number;
}
export declare const DEFAULT_DISTILL_PROMPT: string;
export { CANDIDATE_NOISE, isNoiseIntent } from './distill-candidates.js';
import { createAgentApi } from './distill-agent.js';
/**
 * S3-1（2026-09-14）：**蒸馏触发入口的条件包装**。
 *
 * 为什么在模块级：装配函数受 `audit-wiring` **I1（≤120 行）**约束 —— 此块连注释约 12 行，
 *   内联会把 `registerDistill` 顶到 **128 行**（实测违规），故按仓内既有出路抽成模块级函数。
 *
 * 语义（`enableDistill === false` 时）：只把**触发入口**置 no-op ——
 *   · `armIdleTimer`：蒸馏的**唯一外部触发入口**（装配期不武装；`distill-agent.ts:59` 的内部
 *     重武装只在其自身流程内可达 ⇒ 入口关了便不可达）；
 *   · `runDistillNow`：手动入口（面板 `/distill/run`）。
 * **保留 `distillAgent`** —— 深睡以它为归纳回调（`write: { distillAgent: agent.distillAgent }`），
 *   整体 noop 会让**维护链失去归纳能力**。
 * ⇒ 由此实现「生产链（蒸馏）与维护链（深睡）独立启停」：关蒸馏不再连带关掉深睡。
 */
export declare function distillEntryOf(agent: ReturnType<typeof createAgentApi>, enableDistill: boolean | undefined): ReturnType<typeof createAgentApi>;
export declare function registerDistill(ctx: AppContext, config: DistillConfig): {
    getDeepSleepStatus: () => DeepSleepStatus;
    runDeepSleepNow: () => Promise<{
        ok: boolean;
        error?: string;
        result?: 'done' | 'failed' | 'no-traces';
    }>;
    getConfig: () => {
        enableDeepSleep: boolean;
        deepSleepIdleMs: number;
        deepSleepProbe: boolean;
        deepSleepProbeAfterMs: number;
        deepSleepProbeWindowMs: number;
    };
    runDistillNow: () => Promise<{
        ok: boolean;
        sessions: number;
        note?: string;
    }>;
};
