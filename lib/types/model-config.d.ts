/** 子代理路由配置键（`Config` 经 `extends` 消费；运行时直传）。 */
export interface ModelConfigFields {
    /** 共用回落键：distill/sleep 未单独指定时用这对 */
    llmProvider: string;
    llmModel: string;
    /** 蒸馏子代理路由（空 = 回落 llmProvider/llmModel → 继承主会话） */
    distillProvider: string;
    distillModel: string;
    /** 蒸馏子代理档位（adapter 自有词表；空 = 沿用模型默认） */
    distillEffort: string;
    /** 深睡归纳子代理路由 */
    sleepProvider: string;
    sleepModel: string;
    /** 深睡归纳子代理档位（空 = 沿用模型默认） */
    sleepEffort: string;
}
/**
 * 路由域 schema（供 `Config` 展开：`...modelConfigSchema`）。
 * ⚠ 与 `probeConfigSchema` / `evalConfigSchema` 同法：**声明与投影同文件**，防两处漂移。
 * ⚠ 档位**刻意用 `z.string()` 而非 enum**：档位词表属 **adapter**（官方原文：the exact vocabulary
 *   belongs to the model capability, not to this plugin）⇒ 插件侧写死枚举即等于**发明词表**，
 *   会在 adapter 增档时静默拒收（本例：本机 arbiter 的 `noul` 之类）。空串 = 沿用模型默认。
 */
export declare const modelConfigSchema: {
    readonly llmProvider: import("@deepseek-ai/schemastery").default<string, string>;
    readonly llmModel: import("@deepseek-ai/schemastery").default<string, string>;
    readonly distillProvider: import("@deepseek-ai/schemastery").default<string, string>;
    readonly distillModel: import("@deepseek-ai/schemastery").default<string, string>;
    readonly distillEffort: import("@deepseek-ai/schemastery").default<string, string>;
    readonly sleepProvider: import("@deepseek-ai/schemastery").default<string, string>;
    readonly sleepModel: import("@deepseek-ai/schemastery").default<string, string>;
    readonly sleepEffort: import("@deepseek-ai/schemastery").default<string, string>;
};
/** 把路由域运行时取值从 config 投影出来（**显式映射**，防漏键；与 `probeOptionsOf` 同法）。 */
export declare const modelOptionsOf: (config: ModelConfigFields) => ModelConfigFields;
/**
 * 子代理派单路由的**唯一解析实现**（抽出的第二个硬理由：两处各写一份回落规则 ⇒ 改一漏一）。
 *
 * @param cfg 路由域取值
 * @param kind 'distill' | 'sleep' —— 决定用哪一组具体键
 * @returns `{ provider, model, effort }`；provider/model 任一为空 ⇒ **null**（= 继承主会话，不派单路由）
 *          `effort` 可为空串（空 = 不传 `reasoningEffort`，沿用模型自身默认——**与宿主语义一致**）
 */
export declare function resolveRoute(cfg: ModelConfigFields, kind: 'distill' | 'sleep'): {
    provider: string;
    model: string;
    effort: string;
} | null;
/**
 * 把**档位**并进 `agentOptions`（**唯一实现** —— 蒸馏 / 深睡两处原先各写一份同样的条件展开）。
 *
 * 语义（与宿主一致，**这是关键而非风格**）：`effort` 为空 ⇒ **返回原对象、不带该字段**。
 *   宿主原文：absence preserves the provider's own default。**不塞空串** ——
 *   `''` 会被 adapter 当成一个**非法档位 id** 而拒调用（那会把"不指定"变成"调不通"）。
 */
export declare function withEffort<T extends Record<string, unknown>>(opts: T, effort: unknown): T & {
    reasoningEffort?: string;
};
