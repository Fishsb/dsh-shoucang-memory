import z from 'schemastery';
import { createHotMemory, createInjectMeta, createRootAccess, createRouteBinder, createStateStore, createSuiteConfig, expandHome, } from './panel-shared.js';
import { registerConfigRoutes } from './panel-config.js';
import { registerMemoryRoutes } from './panel-memory.js';
import { registerObserveRoutes } from './panel-observe.js';
import { registerInject } from './panel-inject.js';
export const name = '@dsh-external/shoucang-panel';
export const inject = ['webServer', 'systemPrompt', 'commands'];
export const Config = z.object({
    state_path: z.string().default('~/.dsh/storages/shoucang-panel.json'),
}).description('面板设置');
export function applyPanel(ctx, config) {
    const webServer = ctx.webServer;
    if (!webServer) {
        ctx.logger?.warn?.('[shoucang] webServer 服务不可用，面板 RPC 未挂载');
        return;
    }
    // 日志窄接口：领域模块只拿到「能打日志」，拿不到整个 host ctx（依赖按领域窄传，不按模块打包）
    const logger = { info: (s) => ctx.logger?.info?.(s), warn: (s) => ctx.logger?.warn?.(s) };
    const state = createStateStore(expandHome(config.state_path));
    const bind = createRouteBinder(webServer, logger);
    const root = createRootAccess(state);
    const suite = createSuiteConfig();
    const injectMeta = createInjectMeta();
    const hot = createHotMemory({ suite, root });
    registerConfigRoutes({ route: bind.route, state, root, hot, suite, logger });
    registerMemoryRoutes({ route: bind.route, suite, logger });
    registerObserveRoutes({ route: bind.route, suite, logger });
    // inject 需挂 ctx.effect（systemPrompt 注入挂点的生命周期归宿主），故额外传 ctx
    registerInject(ctx, { route: bind.route, disposers: bind.disposers, root, hot, injectMeta, suite, logger });
}
//# sourceMappingURL=panel.js.map