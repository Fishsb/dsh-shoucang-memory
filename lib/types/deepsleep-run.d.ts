import { DeepSleepCtx, SleepState } from './deepsleep-contract.js';
export type RunDeps = DeepSleepCtx & {
    state: SleepState;
};
export declare function runDeepSleep(d: RunDeps, sinceArg?: number): Promise<'done' | 'failed' | 'no-traces'>;
