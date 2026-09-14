/**
 * 路由契约表（S4 · 2026-09-13）—— **唯一事实源**。
 *
 * 判因：34 条路由此前"收什么参数"只存在于各模块注释里；喂错数据不显式失败，
 *   而是在 handler 深处退化成「参数为空但返回 200」的假成功。此处把收什么写成可执行约束。
 *
 * 纪律：
 *   · 字段名一律取自各 handler 的**实际读取**（`String(body.x)`），不凭想象添加（否则会误拒正常请求）；
 *   · 实测 schemastery 语义：**类型错会抛、缺字段不抛** ⇒ 「类型」用 z 声明，「必填」另用 required 声明；
 *   · 只声明**读请求体**的路由；不读 body 的端点无需契约（是否读 body 由
 *     `scripts/check-panel-contract.mjs` 从源码推导核对，本表与源码漂移即门禁翻红）。
 */
import z from 'schemastery'
import type { RouteContract } from './panel-shared.js'

export interface RouteSpec {
  /** /api/shoucang-panel 前缀下的子路径 */
  path: string
  /** 一句话说明（生成文档/审计用） */
  summary: string
  /** 请求体契约；不读 body 的端点缺省 */
  contract?: RouteContract
}

/* ── 配置补丁白名单（与 panel-observe 的校验一致；由门禁比对源码，防漂移） ── */
export const DEEPSLEEP_CONFIG_KEYS = ['enableDeepSleep', 'deepSleepProbe', 'deepSleepIdleMs', 'deepSleepProbeAfterMs', 'deepSleepProbeWindowMs'] as const
/** 嵌入配置补丁白名单（与 panel-inject 的 EMBED_CONFIG_KEYS 一致；门禁比对防漂移） */
export const EMBED_CONFIG_KEYS = ['embedEnabled', 'embedBaseUrl', 'embedModel', 'embedApiKeyEnv'] as const

export const DISTILL_CONFIG_KEYS = ['enableDistill', 'idleWakeMs', 'minTurnChars', 'distillPrescan', 'llmProvider', 'llmModel', 'distillProvider', 'distillModel', 'sleepProvider', 'sleepModel'] as const

/** 认知环（MCL）**旋钮白名单**（与 scheduler.Config 的 mcl* 键同源；面板 `/mcl/config` 只认这些）
 *  —— 2026-09-13 架构重构后补：此前 MCL 只有 deepsleep/distill/embed 三家有写入口，MCL 五键在界面上不可调。 */
export const MCL_CONFIG_KEYS = ['mclEnabled', 'mclFamiliarThreshold', 'mclMaxNudges', 'mclBudgetChars', 'mclTopK', 'mclAudit', 'mclMaterialInSystem', 'enableRemPass'] as const

const zAny = z.any()

export const PANEL_ROUTES: readonly RouteSpec[] = [
  /* ── 根目录与配置（panel-config） ── */
  { path: '/roots', summary: '已登记根目录列表' },
  { path: '/get_root', summary: '当前激活根目录' },
  { path: '/root/bootstrap', summary: '建单库骨架', contract: { body: z.object({ root: z.string().required(false), path: z.string().required(false) }) } },
  { path: '/set_root', summary: '切换/登记根目录', contract: { body: z.object({ path: z.string(), name: z.string().required(false) }), required: ['path'] } },
  { path: '/config', summary: '读配置原文' },
  { path: '/save', summary: '写配置原文', contract: { body: z.object({ text: z.string() }), required: ['text'] } },
  { path: '/toggle', summary: '翻转布尔键', contract: { body: z.object({ key: z.string() }), required: ['key'] } },
  { path: '/set', summary: '设置标量键', contract: { body: z.object({ key: z.string(), value: zAny }), required: ['key'] } },

  /* ── 记忆库只读（panel-memory） ── */
  { path: '/memory/overview', summary: '索引/容量/候选总览' },
  { path: '/memory/sections', summary: '索引小节列表' },

  /* ── 观测 / 判据 / 深睡-蒸馏配置（panel-observe） ── */
  { path: '/suite', summary: 'suite 装配矩阵' },
  { path: '/mcl/status', summary: '认知环状态' },
  { path: '/reconcile', summary: '记忆对账' },
  /* v9 总览对齐（2026-09-13）：与 /reconcile 同构的运维脚本端点 —— v9 原型总览页「快捷操作」卡
   * 有「成熟度扫描」按钮，而插件运行时无该能力（是 scripts/maturation-scan.mjs）⇒ 端点化。 */
  { path: '/maturation/scan', summary: '成熟度扫描' },
  { path: '/selfcheck', summary: '自检结果' },
  { path: '/selfcheck/run', summary: '运行自检' },
  /* 五环 KPI + 环事件对账（2026-09-13）：环内容此前**只有 CLI 面** ⇒ 面板无仪表盘。
   * 只读、零 LLM；把「哪条环僵了」与「事件流能否重建状态」一次暴露。 */
  { path: '/rings', summary: '五环 KPI 与环事件对账' },
  { path: '/config/recent', summary: '近期配置变更' },
  { path: '/criteria', summary: '判据注册表 + 台账' },
  /* S0（2026-09-14）内容类型契约：类型分布 · 可达性 · 通路接线（假绿检测）。只读、零 LLM、不读 body。 */
  { path: '/content-types', summary: '内容类型契约：类型分布 · 可达性 · 通路接线' },
  { path: '/cognition/report', summary: '深睡回执/活性/归档' },
  { path: '/llm/models', summary: '模型清单' },
  { path: '/deepsleep', summary: '深睡状态' },
  { path: '/deepsleep/trigger', summary: '手动触发深睡', contract: { required: [] } },
  { path: '/distill/run', summary: '手动触发蒸馏', contract: { required: [] } },
  { path: '/deepsleep/config', summary: '深睡配置读写（白名单补丁）', contract: {
    body: z.object(Object.fromEntries(DEEPSLEEP_CONFIG_KEYS.map((k) => [k, zAny.required(false)]))) } },
  { path: '/distill/config', summary: '蒸馏配置读写（白名单补丁）', contract: {
    body: z.object(Object.fromEntries(DISTILL_CONFIG_KEYS.map((k) => [k, zAny.required(false)]))) } },

  /* ── 注入 / 向量 / 记忆写回（panel-inject） ── */
  { path: '/vector/status2', summary: '向量档状态' },
  /* /embed/config 是**白名单补丁**（同 deepsleep/distill）：整表 required 会误拒"只改 apiKey"的合法补丁
   *   —— 上一版曾写成 required:['baseUrl']，属我方契约写错（handler 语义才是准绳）。 */
  { path: '/embed/config', summary: '嵌入配置读写（白名单补丁）', contract: {
    body: z.object(Object.fromEntries(EMBED_CONFIG_KEYS.map((k) => [k, zAny.required(false)]))) } },
  { path: '/embed/test', summary: '嵌入连通性测试', contract: { body: z.object({ baseUrl: z.string().required(false), apiKey: z.string().required(false) }), required: ['baseUrl'] } },
  { path: '/vector/cache/clear', summary: '清向量缓存', contract: { body: z.object({ rel: z.string(), section: z.string(), newBody: z.string().required(false) }), required: ['rel', 'section'] } },
  { path: '/memory/section-edit', summary: '改写小节正文', contract: { body: z.object({ rel: z.string(), section: z.string(), newBody: z.string().required(false) }), required: ['rel', 'section'] } },
  { path: '/memory/edit', summary: '行级编辑', contract: { body: z.object({ file: z.string(), line: z.string(), newText: z.string() }), required: ['file', 'line', 'newText'] } },
  { path: '/memory/remove', summary: '行级删除', contract: { body: z.object({ file: z.string(), line: z.string(), pendingFile: z.string().required(false) }), required: ['file', 'line'] } },
  { path: '/memory/approve', summary: '采纳候选', contract: { body: z.object({ pendingFile: z.string() }), required: ['pendingFile'] } },
  { path: '/inject/preview', summary: '热记忆注入预览' },
  { path: '/inject/stats', summary: '注入统计' },

  /* ── 架构观测与调节（panel-arch · 2026-09-13 架构重构后新增）──
   * 动机：G0–G4 重构后，记录层/内容环/统一台账/装配根/断言图在界面上**不可见、不可调**
   *   （实测客户端 0 处引用 record/assertion/observability/composition）。以下把两面开出来。 */
  { path: '/arch/records', summary: '记录层：store 人口 · md↔store 逐载体对账 · 写时自证 · 跨文件同文 · 行寻址口径' },
  { path: '/arch/graph', summary: '断言图：节点/边/各 rel/悬空证据（纯计数，零向量）' },
  { path: '/arch/observability', summary: '观测面：统一台账实况（按 type 分布/信封完整性）· audit 目录 · legacy 流存否 · 族×域口径' },
  { path: '/arch/assembly', summary: '装配面：composition root 就绪度（桥=0）· 契约路由数 · 已装新架构模块盘点' },
  { path: '/mcl/config', summary: '认知环旋钮（白名单补丁：阈值/上限/预算/topK/P2b/REM）', contract: {
    body: z.object(Object.fromEntries(MCL_CONFIG_KEYS.map((k) => [k, zAny.required(false)]))) } }
]

const BY_PATH = new Map(PANEL_ROUTES.map((r) => [r.path, r]))

/** 取某路由的契约（未声明返回 undefined ⇒ 绑定器行为与旧版一致） */
export function contractFor (path: string): RouteContract | undefined {
  return BY_PATH.get(path)?.contract
}
