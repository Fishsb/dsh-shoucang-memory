import z from 'schemastery';
import { Config as PanelConfig, applyPanel } from './panel.js';
import { Config as SchedulerConfig, applyScheduler } from './scheduler.js';
export const name = '@dsh-external/shoucang';
export const inject = ['webServer', 'systemPrompt', 'commands', 'tools', 'llm', 'subagents', 'agents'];
/**
 * 扁平单层配置（2026-09-08 拍板：项目未正式发布，不做旧版本适配）。
 * 字段 = panel（state_path/projectRoots）+ scheduler（members/蒸馏节等）两组直接并集，无嵌套节。
 */
export const Config = z.intersect([PanelConfig, SchedulerConfig]);
export function apply(ctx, config) {
    // panel 传浅拷贝：scheduler 的自持配置通道（~/.dsh/suite/scheduler.json）会就地覆写 config 顶层键，
    // 共享同一对象会让覆写反向污染 panel 配置（2026-09-08 审查关键点 2）
    applyPanel(ctx, { ...config });
    applyScheduler(ctx, config);
}
//# sourceMappingURL=index.js.map