// model-config.ts — 「子代理路由」配置域（**单一事实源** · 2026-09-21 · ACT-295）
//
// ## 为什么单独成件（判据同 `probe-config.ts` / `eval-config.ts`，不是偏好）
// ① `src/scheduler.ts` 是 `check-module-growth` 的**冻结件**（基线 606 / 实测 613，容差仅剩 7 行）
//    ⇒ 往里再加键必然越线，而抬基线属 R3（须用户拍板）；本仓既有出路面就是**按领域接缝抽出**。
// ② `audit-wiring` 的 I1（装配 ≤120 行）/ I2（依赖包 ≤12 字段）同为棘轮。
// ③ 本域 8 键**内聚**：都是「子代理派单路由」（provider / model / **档位**），只被蒸馏与深睡消费。
//
// ## ★ 本轮为什么必须加「档位」两键（否则就是**假旋钮**）
// 用户口径要三级选择（服务 → 模型 → 档位）。实测宿主 `AgentOptions.reasoningEffort` 是**真字段**
//   （`@deepseek-ai/dsh-agent` 类型 + `@dsh-external/dsh-plugin-roundtable` 的 `spawnNode` 都在用它），
//   而蒸馏 / 深睡正是经 `ctx.subagents.start('spawn', { agentOptions })` 派单 ⇒ 档位**有真消费者**。
// 反例（**刻意不做**）：评估通道走裸 `node:http` 发 OpenAI 兼容 / Ollama 原生 `/api/chat`，
//   请求体里**没有** effort 字段 ⇒ 那里不设「档位」键，其档位是 `evalTier`（成本结构档，见 `eval-config.ts`）。
//   （本仓明令：登记了但没人消费的旋钮 = 假旋钮。）
//
// 语义与既有实现**逐字一致**（本轮只搬家 + 加两键，不改回落规则）：
//   具体键有值则用之 → 否则回落共用键 `llmProvider/llmModel` → 仍空 = 继承主会话。
import z from 'schemastery'

/** 子代理路由配置键（`Config` 经 `extends` 消费；运行时直传）。 */
export interface ModelConfigFields {
  /** 共用回落键：distill/sleep 未单独指定时用这对 */
  llmProvider: string
  llmModel: string
  /** 蒸馏子代理路由（空 = 回落 llmProvider/llmModel → 继承主会话） */
  distillProvider: string
  distillModel: string
  /** 蒸馏子代理档位（adapter 自有词表；空 = 沿用模型默认） */
  distillEffort: string
  /** 深睡归纳子代理路由 */
  sleepProvider: string
  sleepModel: string
  /** 深睡归纳子代理档位（空 = 沿用模型默认） */
  sleepEffort: string
}

/**
 * 路由域 schema（供 `Config` 展开：`...modelConfigSchema`）。
 * ⚠ 与 `probeConfigSchema` / `evalConfigSchema` 同法：**声明与投影同文件**，防两处漂移。
 * ⚠ 档位**刻意用 `z.string()` 而非 enum**：档位词表属 **adapter**（官方原文：the exact vocabulary
 *   belongs to the model capability, not to this plugin）⇒ 插件侧写死枚举即等于**发明词表**，
 *   会在 adapter 增档时静默拒收（本例：本机 arbiter 的 `noul` 之类）。空串 = 沿用模型默认。
 */
export const modelConfigSchema = {
  llmProvider: z.string().default('').description('子代理 provider 缺省（空=继承主会话模型）——distill/sleep 未单独指定时回落此键'),
  llmModel: z.string().default('').description('子代理 model 缺省（空=继承主会话模型）——distill/sleep 未单独指定时回落此键'),
  distillProvider: z.string().default('').description('蒸馏子代理 provider（空=回落 llmProvider → 继承主会话）'),
  distillModel: z.string().default('').description('蒸馏子代理 model（空=回落 llmModel → 继承主会话）'),
  distillEffort: z.string().default('').description('蒸馏子代理档位（reasoning effort，adapter 自有词表；空=沿用模型默认）'),
  sleepProvider: z.string().default('').description('深睡归纳子代理 provider（空=回落 llmProvider → 继承主会话）'),
  sleepModel: z.string().default('').description('深睡归纳子代理 model（空=回落 llmModel → 继承主会话）'),
  sleepEffort: z.string().default('').description('深睡归纳子代理档位（reasoning effort，adapter 自有词表；空=沿用模型默认）'),
} as const

/** 把路由域运行时取值从 config 投影出来（**显式映射**，防漏键；与 `probeOptionsOf` 同法）。 */
export const modelOptionsOf = (config: ModelConfigFields): ModelConfigFields => ({
  llmProvider: config.llmProvider,
  llmModel: config.llmModel,
  distillProvider: config.distillProvider,
  distillModel: config.distillModel,
  distillEffort: config.distillEffort,
  sleepProvider: config.sleepProvider,
  sleepModel: config.sleepModel,
  sleepEffort: config.sleepEffort,
})

/**
 * 子代理派单路由的**唯一解析实现**（抽出的第二个硬理由：两处各写一份回落规则 ⇒ 改一漏一）。
 *
 * @param cfg 路由域取值
 * @param kind 'distill' | 'sleep' —— 决定用哪一组具体键
 * @returns `{ provider, model, effort }`；provider/model 任一为空 ⇒ **null**（= 继承主会话，不派单路由）
 *          `effort` 可为空串（空 = 不传 `reasoningEffort`，沿用模型自身默认——**与宿主语义一致**）
 */
export function resolveRoute (
  cfg: ModelConfigFields, kind: 'distill' | 'sleep',
): { provider: string; model: string; effort: string } | null {
  const sp = kind === 'distill' ? cfg.distillProvider : cfg.sleepProvider
  const sm = kind === 'distill' ? cfg.distillModel : cfg.sleepModel
  const se = kind === 'distill' ? cfg.distillEffort : cfg.sleepEffort
  // 具体键整对齐全则用之（**沿用既有"成对"规则**：只给 provider 不给 model 视为未指定）
  if (sp && sm) return { provider: sp, model: sm, effort: se || '' }
  if (cfg.llmProvider && cfg.llmModel) return { provider: cfg.llmProvider, model: cfg.llmModel, effort: '' }
  return null
}

/**
 * 把**档位**并进 `agentOptions`（**唯一实现** —— 蒸馏 / 深睡两处原先各写一份同样的条件展开）。
 *
 * 语义（与宿主一致，**这是关键而非风格**）：`effort` 为空 ⇒ **返回原对象、不带该字段**。
 *   宿主原文：absence preserves the provider's own default。**不塞空串** ——
 *   `''` 会被 adapter 当成一个**非法档位 id** 而拒调用（那会把"不指定"变成"调不通"）。
 */
export function withEffort<T extends Record<string, unknown>> (
  opts: T, effort: unknown,
): T & { reasoningEffort?: string } {
  const e = String(effort || '').trim()
  return e ? { ...opts, reasoningEffort: e } : opts
}
