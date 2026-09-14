import type { RouteContract } from './panel-shared.js';
export interface RouteSpec {
    /** /api/shoucang-panel 前缀下的子路径 */
    path: string;
    /** 一句话说明（生成文档/审计用） */
    summary: string;
    /** 请求体契约；不读 body 的端点缺省 */
    contract?: RouteContract;
}
export declare const DEEPSLEEP_CONFIG_KEYS: readonly ["enableDeepSleep", "deepSleepProbe", "deepSleepIdleMs", "deepSleepProbeAfterMs", "deepSleepProbeWindowMs"];
/** 嵌入配置补丁白名单（与 panel-inject 的 EMBED_CONFIG_KEYS 一致；门禁比对防漂移） */
export declare const EMBED_CONFIG_KEYS: readonly ["embedEnabled", "embedBaseUrl", "embedModel", "embedApiKeyEnv"];
export declare const DISTILL_CONFIG_KEYS: readonly ["enableDistill", "idleWakeMs", "minTurnChars", "distillPrescan", "llmProvider", "llmModel", "distillProvider", "distillModel", "sleepProvider", "sleepModel"];
/** 认知环（MCL）**旋钮白名单**（与 scheduler.Config 的 mcl* 键同源；面板 `/mcl/config` 只认这些）
 *  —— 2026-09-13 架构重构后补：此前 MCL 只有 deepsleep/distill/embed 三家有写入口，MCL 五键在界面上不可调。 */
export declare const MCL_CONFIG_KEYS: readonly ["mclEnabled", "mclFamiliarThreshold", "mclMaxNudges", "mclBudgetChars", "mclTopK", "mclAudit", "mclMaterialInSystem", "enableRemPass"];
export declare const PANEL_ROUTES: readonly RouteSpec[];
/** 取某路由的契约（未声明返回 undefined ⇒ 绑定器行为与旧版一致） */
export declare function contractFor(path: string): RouteContract | undefined;
