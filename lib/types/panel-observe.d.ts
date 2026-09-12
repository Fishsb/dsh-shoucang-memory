import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js';
export interface ObserveDeps {
    route: RouteFn;
    suite: SuiteConfigAccess;
    logger: PanelLogger;
}
export declare function registerObserveRoutes(d: ObserveDeps): void;
