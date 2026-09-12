import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js';
export interface MemoryDeps {
    route: RouteFn;
    suite: SuiteConfigAccess;
    logger: PanelLogger;
}
export declare function registerMemoryRoutes(d: MemoryDeps): void;
