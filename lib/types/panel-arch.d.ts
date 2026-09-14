import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js';
import type { DeepSleepApi, MclHandle, SchedulerApi } from './composition.js';
export interface ArchDeps {
    route: RouteFn;
    suite: SuiteConfigAccess;
    logger: PanelLogger;
    mcl: {
        current: MclHandle | null;
    };
    deepSleep: {
        current: DeepSleepApi | null;
    };
    scheduler: {
        current: SchedulerApi | null;
    };
}
export declare function registerArchRoutes(d: ArchDeps): void;
