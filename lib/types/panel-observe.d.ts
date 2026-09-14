import type { DeepSleepApi, MclHandle, SchedulerApi } from './composition.js';
import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js';
export interface ObserveDeps {
    route: RouteFn;
    suite: SuiteConfigAccess;
    logger: PanelLogger;
    /** G0 composition root（2026-09-13）：MCL 句柄由 root 显式传入，取代原 `mcl-share` 全局 holder */
    mcl: {
        current: MclHandle | null;
    };
    /** 同上：深睡/蒸馏句柄，取代原 `deepsleep-share` 全局 holder */
    deepSleep: {
        current: DeepSleepApi | null;
    };
    /** 同上：scheduler 装配面句柄，取代原 `scheduler-share` 全局 holder（三桥至此全消） */
    scheduler: {
        current: SchedulerApi | null;
    };
}
/**
 * S3-2（2026-09-14）**深睡空转摘要**（模块级 —— 路由函数受行数约束，且此聚合可独立验证）。
 *
 * 为什么需要它：`deep-sleep` 的审计字段**早已齐全**（`landed`/`attempted`/`result`/`gate`/`failStreak`…），
 *   但**缺聚合视图** ⇒ 「最近这些轮里到底有几轮真在干活」无人能一眼回答。实测（双源 42 轮）：
 *   `landed:true` 仅 **3** 轮 · 空转（`no-traces`+`no-op`）**21** 轮 · 异常（error/aborted）**5** 轮 ·
 *   另有 **21** 轮为**旧格式字段缺失**（09-08~09-12 的记录尚无这些字段）。
 *
 * 口径要点：**旧格式（stop 与 gate 都缺）单列 `legacy`，不混入分母** ——
 *   否则会把"当年没记"误算成"空转"或"有产出"，重演仓内"未跑与通过不可区分"的老问题。
 */
export declare function sleepSummaryOf(sleeps: Array<Record<string, unknown>>): {
    total: number;
    landed: number;
    noop: number;
    error: number;
    legacy: number;
    landedRate: number | null;
    noopRate: number | null;
    byResult: Record<string, number>;
    byGate: Record<string, number>;
};
export declare function registerObserveRoutes(d: ObserveDeps): void;
