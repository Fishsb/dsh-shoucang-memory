import type { Context } from 'cordis';
import type { HotMemory, InjectMeta, PanelLogger, RootAccess, RouteFn, SuiteConfigAccess } from './panel-shared.js';
export interface InjectDeps {
    route: RouteFn;
    disposers: Array<() => void>;
    root: RootAccess;
    hot: HotMemory;
    injectMeta: InjectMeta;
    suite: SuiteConfigAccess;
    logger: PanelLogger;
}
export declare function registerInject(ctx: Context, d: InjectDeps): void;
