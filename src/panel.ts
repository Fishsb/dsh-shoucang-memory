/**
 * @dsh-external/shoucang-panel — 宿主半区**装配层**。
 *
 * ⚠ 本文件只做「构造依赖 → 装配领域模块 → 交给宿主」；**实现一律不在本文件**。
 *   2026-09-12 架构根治前，这里是 1817 行的 `applyPanel` 巨型工厂闭包：模块的全部实现
 *   寄生在入口函数的闭包里，依赖按「模块闭包」打包 ⇒ 无法单独测试、无法单独替换。
 *   现按领域切分为（各自持有自己的依赖，窄传 3–7 个）：
 *     panel-shared.ts  公共基元（状态库/路由绑定/全局配置/热记忆/YAML 解析/骨架引导）
 *     panel-config.ts  根目录 + 配置读写（8 端点）
 *     panel-memory.ts  记忆库只读展示（2 端点）
 *     panel-observe.ts 观测/判据/深睡-蒸馏配置（14 端点）
 *     panel-inject.ts  注入挂点 + 向量 + 记忆写回 + /scnote（10 端点）
 *   拆分依据与验收见 deliverables/architecture-ultimate-plan.md 阶段 A。
 *
 * 路由清单（/api/shoucang-panel 前缀下 **共 34 条 exact 路由**，由 scripts/test-panel-wiring.mjs 锁死）：
 *   根目录：GET /roots · GET /get_root · POST /set_root · POST /root/bootstrap（建**单库骨架**）
 *   配置：  GET /config · POST /save · POST /toggle · POST /set（白名单键）
 *   记忆：  GET /memory/overview · GET /memory/sections · POST /memory/section-edit · POST /memory/edit · POST /memory/remove · POST /memory/approve
 *   展示：  GET /suite · GET /cognition/report（深睡回执/活性/归档）· GET /mcl/status（认知环）· GET /criteria（判据注册表+台账）
 *   深睡：  GET /deepsleep · POST /deepsleep/trigger · GET+POST /deepsleep/config（单 handler 按 method 分发）
 *   蒸馏：  POST /distill/run · GET+POST /distill/config（节流组持久通道，同深睡：单 handler 按 method 分发）
 *   向量/模型：GET /vector/status2 · POST /vector/cache/clear · GET+POST /embed/config · POST /embed/test · GET /llm/models
 *   注入：  GET /inject/preview · GET /inject/stats（R1 热记忆注入 systemPrompt.context）
 *   命令：  /scnote（commands.register，笔记化任务）
 *
 * ⚠ 清单纪律（2026-09-11 审查修正）：`/idle/status`、`/idle/consolidate`（60s 空闲巩固轮，2026-09-10 已移除）与
 *   `/vector/status`、`/vector/build`、`/model/*` **均不存在**——本清单与启动日志必须与实际注册一致，勿挂幽灵端点。
 *
 * 开源红线：零硬编码路径。root 登记表存 state_path（默认 ~/.dsh/storages/
 * shoucang-panel.json，支持 ~ 展开），初始为空——root 由用户在面板里添加。
 * 写操作全部「备份先行」，注释与原格式按原文保留（toggle 只做行级替换）。
 */
import type { Context } from 'cordis'
import z from 'schemastery'
import {
  createHotMemory, createInjectMeta, createRootAccess, createRouteBinder,
  createStateStore, createSuiteConfig, expandHome,
} from './panel-shared.js'
import type { PanelLogger, RouteRegistry } from './panel-shared.js'
import { registerConfigRoutes } from './panel-config.js'
import { registerMemoryRoutes } from './panel-memory.js'
import { registerObserveRoutes } from './panel-observe.js'
import { registerInject } from './panel-inject.js'

export const name = '@dsh-external/shoucang-panel'
export const inject = ['webServer', 'systemPrompt', 'commands'] as const

export interface Config {
  state_path: string
}

export const Config = z.object({
  state_path: z.string().default('~/.dsh/storages/shoucang-panel.json'),
}).description('面板设置')

export function applyPanel(ctx: Context, config: Config): void {
  const webServer = (ctx as unknown as { webServer?: RouteRegistry }).webServer
  if (!webServer) {
    ctx.logger?.warn?.('[shoucang] webServer 服务不可用，面板 RPC 未挂载')
    return
  }
  // 日志窄接口：领域模块只拿到「能打日志」，拿不到整个 host ctx（依赖按领域窄传，不按模块打包）
  const logger: PanelLogger = { info: (s) => ctx.logger?.info?.(s), warn: (s) => ctx.logger?.warn?.(s) }
  const state = createStateStore(expandHome(config.state_path))
  const bind = createRouteBinder(webServer, logger)
  const root = createRootAccess(state)
  const suite = createSuiteConfig()
  const injectMeta = createInjectMeta()
  const hot = createHotMemory({ suite, root })

  registerConfigRoutes({ route: bind.route, state, root, hot, suite, logger })
  registerMemoryRoutes({ route: bind.route, suite, logger })
  registerObserveRoutes({ route: bind.route, suite, logger })
  // inject 需挂 ctx.effect（systemPrompt 注入挂点的生命周期归宿主），故额外传 ctx
  registerInject(ctx, { route: bind.route, disposers: bind.disposers, root, hot, injectMeta, suite, logger })
}
