import { type DeepSleepStatus } from './deepsleep-core.js';
export * from './deepsleep-core.js';
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
    embedEnabled?: boolean;
    embedBaseUrl?: string;
    embedModel?: string;
    embedApiKeyEnv?: string;
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
    activityWarmDays?: number;
    activityColdDays?: number;
    activityArchiveDays?: number;
    activityHotHits?: number;
    recallColdFactorPercent?: number;
}
export declare const DEFAULT_DISTILL_PROMPT: string;
export declare const CANDIDATE_NOISE: RegExp[];
/** 文本是否宿主注入样板（见上：候选区与采样共用的单一实现） */
export declare const isNoiseIntent: (s: string) => boolean;
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
