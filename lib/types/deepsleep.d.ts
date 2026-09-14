import type { SessRec, DeepSleepStatus } from './deepsleep-core.js';
import type { DeepSleepCtx } from './deepsleep-contract.js';
export type { DeepSleepCtx };
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
