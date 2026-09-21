import z from 'schemastery';
import { createHotMemory, createInjectMeta, createRootAccess, createRouteBinder, createStateStore, createSuiteConfig, expandHome, } from './panel-shared.js';
import { registerConfigRoutes } from './panel-config.js';
import { registerMemoryRoutes } from './panel-memory.js';
import { registerObserveRoutes } from './panel-observe.js';
import { registerArchRoutes } from './panel-arch.js';
// M1（ACT-283）评估通道面板面：按**领域接缝**抽出（门禁指路——初版加在 panel-inject 使其 624 行 ≥600，
//   `check-module-growth` 原文「新功能应落新模块，而不是堆大旧模块」；抬基线属 R3，故走切分）。
import { registerEvalRoutes } from './panel-eval.js';
import { registerInject } from './panel-inject.js';
export const name = '@dsh-external/shoucang-panel';
export const inject = ['webServer', 'systemPrompt', 'commands'];
export const Config = z.object({
    state_path: z.string().default('~/.dsh/storages/shoucang-panel.json'),
}).description('面板设置');
export function applyPanel(ctx, config, comp) {
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
    const suite = createSuiteConfig((m) => ctx.logger?.warn?.(m));
    const injectMeta = createInjectMeta();
    const hot = createHotMemory({ suite, root });
    registerConfigRoutes({ route: bind.route, state, root, hot, suite, logger });
    registerMemoryRoutes({ route: bind.route, suite, logger });
    // 架构观测/调节面（2026-09-13 重构后新增）：记录层 · 断言图 · 观测 · 装配 + MCL 旋钮
    registerArchRoutes({
        route: bind.route, suite, logger,
        mcl: comp?.mcl ?? { current: null },
        deepSleep: comp?.deepSleep ?? { current: null },
        scheduler: comp?.scheduler ?? { current: null },
    });
    // comp 缺省时给空盒：`/mcl/status` 与 `/deepsleep` 会如实报 not-ready（= 与"调度器未装配"同一语义，不造假态）
    registerObserveRoutes({
        route: bind.route, suite, logger,
        mcl: comp?.mcl ?? { current: null },
        deepSleep: comp?.deepSleep ?? { current: null },
        scheduler: comp?.scheduler ?? { current: null },
    });
    // inject 需挂 ctx.effect（systemPrompt 注入挂点的生命周期归宿主），故额外传 ctx
    registerInject(ctx, { route: bind.route, disposers: bind.disposers, root, hot, injectMeta, suite, logger });
    // M1（ACT-283）评估通道：配置读写 + 连通性测试（**只读**；判定写账属 M2）
    registerEvalRoutes({ route: bind.route, suite, logger });
}
//# sourceMappingURL=panel.js.map