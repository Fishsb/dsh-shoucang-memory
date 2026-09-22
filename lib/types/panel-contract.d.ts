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
/** 评估通道配置补丁白名单（M1 · ACT-283；与 panel-inject 的 EVAL_CONFIG_KEYS 一致；门禁比对防漂移）。
 *  ⚠ 与 embed 同族但**多两键**：`evalTier`（档位，const union 防死开关）· `evalEgressAllow`（**出网许可**，
 *    与 `evalEnabled` **分离**——「允许装外部服务」≠「允许记忆内容出机」）。 */
export declare const EVAL_CONFIG_KEYS: readonly ["evalEnabled", "evalBaseUrl", "evalModel", "evalApiKeyEnv", "evalTier", "evalEgressAllow"];
export declare const DISTILL_CONFIG_KEYS: readonly ["enableDistill", "idleWakeMs", "minTurnChars", "distillPrescan", "llmProvider", "llmModel", "distillProvider", "distillModel", "distillEffort", "sleepProvider", "sleepModel", "sleepEffort"];
/** 认知环（MCL）**旋钮白名单**（与 scheduler.Config 的 mcl* 键同源；面板 `/mcl/config` 只认这些）
 *  —— 2026-09-13 架构重构后补：此前 MCL 只有 deepsleep/distill/embed 三家有写入口，MCL 五键在界面上不可调。 */
export declare const MCL_CONFIG_KEYS: readonly ["mclEnabled", "mclFamiliarThreshold", "mclMaxNudges", "mclBudgetChars", "mclTopK", "mclAudit", "mclMaterialInSystem", "enableRemPass"];
/** `/set` 的**可写标量键白名单**（面板设置页经此通道落 `scheduler.json`）。
 *  实现在 `panel-config.ts` 的 `allowed` 表；本常量是**契约侧投影**（逐键与源码一致）。
 *
 *  ⚠ **为什么必须登记**（2026-09-22 · ADR-328 ②）：槽位预算三键此前**只落在通用 `/set` 路由**
 *  （`body: { key: z.string() }`）之下 ⇒ 契约表里**没有它们的条目** ⇒
 *  `check-panel-contract` 的「三向一致」对它们是**空过**（不是"验过"）。
 *  实测根因：三键服务面早已可用（`POST /set` 200 · 越界 400 · `/config` 可读），
 *  但 `src-client/` **零引用** ⇒ **人调不到**。⇒ 补齐两侧：控件进 UI + 键进本白名单。
 *  ⚠ 本表**由 `check-budget-override` ⑦ 与 `panel-config` 的 `allowed` 逐键比对**（机检）；
 *    手抄必漂 —— 本件初版即漏抄 6 键（`injection.*` 容量门与 `embedding.dimension`），当场被比对纠出。 */
export declare const SET_SCALAR_KEYS: readonly ["injection.hot_memory", "injection.level", "injection.persona", "injection.agent_max_chars", "injection.user_max_chars", "injection.memory_max_chars", "injection.cap_agent", "injection.cap_user", "injection.cap_memory", "embedding.dimension", "activityWarmDays", "activityColdDays", "activityArchiveDays", "activityHotHits", "recallColdFactorPercent", "injectFreshSlots", "recallFusion", "injectProfileRows", "injectBudgetChars", "injectSituationBudgetChars", "injectLevelCaps", "mclFamiliarThreshold", "mclMaxNudges", "mclBudgetChars", "mclTopK", "scoreWeights", "selfCheckRepo", "selfCheckIntervalHours", "deepSleep.failPolicy", "deepSleep.failPolicyMaxRounds"];
export declare const PANEL_ROUTES: readonly RouteSpec[];
/** 取某路由的契约（未声明返回 undefined ⇒ 绑定器行为与旧版一致） */
export declare function contractFor(path: string): RouteContract | undefined;
