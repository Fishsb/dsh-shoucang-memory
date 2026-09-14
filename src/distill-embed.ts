// distill-embed.ts — 蒸馏「嵌入配置投影（config → EmbedCfg 的单一构造）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（1 项）。
//   对外只暴露 createEmbedApi(d) —— 返回绑定后的句柄，调用方零感知。
import type { EmbedCfg } from './vec.js'
import type { DistillState } from './distill-state.js'

export interface EmbedDeps {
  config: any
}

/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never

export function createEmbedApi(dep: EmbedDeps) {
  return {
    embedCfgOf: (...a: Tail<Parameters<typeof embedCfgOf>>) => embedCfgOf(dep, ...a),
  }
}
export type EmbedApi = ReturnType<typeof createEmbedApi>

// v6 向量政策：embed cfg 单一构造（取自 DistillConfig 可选字段，与 scheduler vec 通道同源；未配置=词法降级）
const embedCfgOf = (dep: EmbedDeps, ): EmbedCfg => ({
  enabled: !!(dep.config.embedEnabled && dep.config.embedBaseUrl && dep.config.embedModel),
  baseUrl: String(dep.config.embedBaseUrl || ''),
  model: String(dep.config.embedModel || ''),
  apiKeyEnv: String(dep.config.embedApiKeyEnv || ''),
  // v7 召回降权系数（UI 可调：recallColdFactorPercent，% → /100；缺省 35% → 0.35）
  coldFactor: (Number(dep.config.recallColdFactorPercent) > 0 ? Number(dep.config.recallColdFactorPercent) : 35) / 100,
  // v2（ADR-122）：融合策略（缺省 RRF；scheduler 配置 recallFusion=weighted 可回滚）
  fusionKind: dep.config.recallFusion === 'weighted' ? 'weighted' : 'rrf',
  // v2.2（ADR-130）：分层打分与影子打分（缺省 legacy + 影子开）
  scoreMode: dep.config.scoreWeights === 'v2' ? 'v2' : 'legacy',
  shadowScore: dep.config.shadowScore !== false,
})
