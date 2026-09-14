import type { DeepSleepCtx, SleepState } from './deepsleep-contract.js';
/** 编排器的全部依赖：深睡注入契约的八个领域分组（每组内部 ≤8 字段）。 */
export type RunDeps = DeepSleepCtx & {
    state: SleepState;
};
export declare function runDeepSleep(d: RunDeps, sinceArg?: number): Promise<'done' | 'failed' | 'no-traces'>;
