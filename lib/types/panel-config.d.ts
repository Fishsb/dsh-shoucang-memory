import type { HotMemory, PanelLogger, RootAccess, RouteFn, StateStore, SuiteConfigAccess } from './panel-shared.js';
export interface ConfigDeps {
    route: RouteFn;
    state: StateStore;
    root: RootAccess;
    hot: HotMemory;
    suite: SuiteConfigAccess;
    logger: PanelLogger;
}
export declare function registerConfigRoutes(d: ConfigDeps): void;
