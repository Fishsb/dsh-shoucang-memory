/**
 * @dsh-external/shoucang-panel — 宿主半区。
 *
 * 职责：为 client 面板（client.js，纯 DOM）提供 /api/shoucang-panel HTTP RPC（按功能组；**共 28 条 exact 路由**）：
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
import type { Context } from 'cordis';
export declare const name = "@dsh-external/shoucang-panel";
export declare const inject: readonly ["webServer", "systemPrompt", "commands"];
export interface Config {
    state_path: string;
}
export declare const Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
    state_path: import("@deepseek-ai/schemastery").default<string, string>;
}>, Schemastery.ObjectT<{
    state_path: import("@deepseek-ai/schemastery").default<string, string>;
}>>;
export declare function applyPanel(ctx: Context, config: Config): void;
