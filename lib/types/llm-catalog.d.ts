import type { Context } from '@deepseek-ai/cordis';
/** 一个可选路由：provider + 模型 id + 名称 + 该路由**真实可用**的档位。 */
export interface LlmModelEntry {
    provider: string;
    id: string;
    name: string;
    /** adapter 声明的可选档位 id（顺序即 adapter 偏好序）；空 = 该路由无档位概念 */
    efforts: string[];
    /** adapter 声明的默认档位；缺省 ⇒ 请求里不带 effort，沿用模型自身默认 */
    defaultEffort?: string;
    /** provider 声明的上下文上限（token）；取不到省略 */
    contextWindow?: number;
}
/**
 * 建一个**模型目录读取器**（调用方持有，按需调用；本件不缓存、不订阅）。
 *
 * 失败语义：**逐层降级、绝不抛** —— 宿主无 llm ⇒ 空数组；单 provider 枚举失败 ⇒ 跳过该 provider；
 *   单模型档位解析失败 ⇒ 该模型 `efforts:[]`（UI 显示「沿用模型默认」）。这与仓内既有
 *   `llmModelsOf` 的「枚举失败静默」同口径，但**多一层富化**。
 */
export declare function createLlmCatalog(ctx: unknown): () => Promise<LlmModelEntry[]>;
export type LlmCatalogFn = ReturnType<typeof createLlmCatalog>;
/** 供装配层做**编译期形状对账**：目录项是旧 `{provider,id,name}` 的**超集**（旧消费方零迁移）。 */
export type LlmCatalogEntry = LlmModelEntry;
/** 保留一个 `Context` 的显式引用点，避免 `import type` 被判成未使用（本仓 tsconfig 无 noUnusedLocals 但有 lint 口径）。 */
export type LlmCatalogCtx = Context;
