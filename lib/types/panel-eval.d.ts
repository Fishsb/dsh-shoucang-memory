import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js';
export interface EvalPanelDeps {
    route: RouteFn;
    suite: SuiteConfigAccess;
    logger: PanelLogger;
}
/** 装配入口（与 `registerObserveRoutes` / `registerArchRoutes` 同族形态） */
export declare function registerEvalRoutes(d: EvalPanelDeps): void;
