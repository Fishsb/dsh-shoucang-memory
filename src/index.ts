/**
 * @dsh-external/shoucang — 守藏单插件（2026-09-08 三位一体合并）。
 *
 * 由 shoucang-panel + shoucang-scheduler + dsh-managing-memory（skill/ 内嵌）合并而成：
 *   - panel.ts     宿主半区：/api/shoucang-panel HTTP RPC（root 管理 / 配置编辑 / 记忆展示）
 *   - scheduler.ts suite 路由 + 事件驱动蒸馏器（shoucang_suite / shoucang_targets_probe / 蒸馏工具）
 *   - skill/       managing-memory 技能本体（SKILL.md + 规则 + engine/scripts；私人数据区 _memory/ 在仓根，gitignore）
 *
 * 项目治理插件（project-map-governance）已按 2026-09-08 用户拍板整体移除出架构：
 *   suite members 缺省清空，generic_project 留空=蒸馏 board=project 卡降级 pending。
 *
 * 配置形态：扁平单层（panel + scheduler 字段直接并集）；项目未发布过版本，无旧配置迁移问题。
 */
import type { Context } from 'cordis'
import z from 'schemastery'
import { Config as PanelConfig, applyPanel } from './panel.js'
import { Config as SchedulerConfig, applyScheduler } from './scheduler.js'

export const name = '@dsh-external/shoucang'
export const inject = ['webServer', 'systemPrompt', 'commands', 'tools', 'llm', 'subagents', 'agents']

/**
 * 扁平单层配置（2026-09-08 拍板：项目未正式发布，不做旧版本适配）。
 * 字段 = panel（state_path/projectRoots）+ scheduler（members/蒸馏节等）两组直接并集，无嵌套节。
 */
export const Config = z.intersect([PanelConfig, SchedulerConfig])

export function apply(ctx: Context, config: any): void {
  // panel 传浅拷贝：scheduler 的自持配置通道（~/.dsh/suite/scheduler.json）会就地覆写 config 顶层键，
  // 共享同一对象会让覆写反向污染 panel 配置（2026-09-08 审查关键点 2）
  applyPanel(ctx, { ...config })
  applyScheduler(ctx, config)
}
