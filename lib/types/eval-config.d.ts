/** 档位枚举（**const union**，防死开关）。可执行依据：`scheduler.ts` 的 `storeMode` 先例—— */
/** 「设 `storeMode:'record'` 不报错、只静默无动作」，故该处改为 const union 并注「防死开关」（risk D3）。 */
export declare const EVAL_TIERS: readonly ["local", "fast", "native", "llm"];
export type EvalTier = (typeof EVAL_TIERS)[number];
/** 评估通道配置键（**运行时直传**；`Config` 经 `extends` 消费）。 */
export interface EvalConfigFields {
    /**
     * 通道开关。**缺省 false（fail-closed）** —— 与用户「可配置而非必须」的要求一致：
     * 默认关闭 ⇒ 关闭态行为与改造前**逐字节一致**（验收 A1）。
     */
    evalEnabled: boolean;
    /** OpenAI 兼容 `/chat/completions` 基址（缺省 = 本机 Ollama，与 embed 同一端基址形态；留空=关） */
    evalBaseUrl: string;
    /** 模型名（缺省 `qwen3:8b`：本机已装、免 key、闸门实测 95% 的那一个） */
    evalModel: string;
    /** API key 所在环境变量名（**不落盘/不入库**；本地免 key） */
    evalApiKeyEnv: string;
    /** 档位（const union：local 本地零成本 / fast 远程小快 / native 原生校准 / llm 现有大模型） */
    evalTier: EvalTier;
    /**
     * **出网许可**（G1 条款第 ② 条）：即便 `evalEnabled=true`，**向非 loopback 端点发送内容**仍须此键显式为 true。
     * 判因（会审 E-01 + assumption A 类）：用户批准的是"允许新增外部服务依赖"，
     * **不等于**"允许记忆内容出机"——这是**两项独立授权**，必须两个开关。
     */
    evalEgressAllow: boolean;
}
/**
 * 评估域 schema（**供 `Config` 展开**：`...evalConfigSchema`）。
 * ⚠ 与 `probeConfigSchema` 同法：**声明与投影同文件**，防两处漂移。
 */
export declare const evalConfigSchema: {
    readonly evalEnabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
    readonly evalBaseUrl: import("@deepseek-ai/schemastery").default<string, string>;
    readonly evalModel: import("@deepseek-ai/schemastery").default<string, string>;
    readonly evalApiKeyEnv: import("@deepseek-ai/schemastery").default<string, string>;
    readonly evalTier: import("@deepseek-ai/schemastery").default<"llm" | "fast" | "local" | "native", "llm" | "fast" | "local" | "native">;
    readonly evalEgressAllow: import("@deepseek-ai/schemastery").default<boolean, boolean>;
};
/** 把评估域的运行时取值从 config 投影出来（**显式映射**，防漏键；与 `probeOptionsOf` 同法）。 */
export declare const evalOptionsOf: (config: EvalConfigFields) => EvalConfigFields;
/**
 * **解析后的 hostname** 判定 loopback（G1 条款）。
 *
 * ⚠ **为什么不用仓内既有的两份 `isLocal` 正则**（会审实测结论，edge + 主持人两轮 13 例 URL 对拍）：
 *   · `src/vec.ts:243`：漏 `127.0.0.2`/`[::1]`/无尾斜杠/大写（`http://LOCALHOST:1/v1` 判 remote）；
 *   · `src/panel-shared.ts:803` `isLocalBase`：**方向不安全** —— `http://127.0.0.1.evil.com/v1`
 *     与 `http://localhost:11434@evil.com/v1` 均被其判为 **LOCAL**（缺尾 `/` 要求、未锚定 host）。
 *   ⇒ 出网判定**一律走解析后的 hostname**（`new URL().hostname`），这是三份实现里唯一无漏无误的。
 */
export declare function isLoopbackUrl(raw: string): boolean;
/**
 * **能否把 `state` 发往该端点**（G1 条款 ①+② 的可执行合取）。
 * 语义（**只用于收紧，不用于放宽**）：loopback ⇒ 允许；非 loopback ⇒ 须 `evalEgressAllow`。
 */
export declare function egressAllowed(cfg: {
    evalBaseUrl: string;
    evalEgressAllow: boolean;
}): {
    ok: boolean;
    why: string;
};
