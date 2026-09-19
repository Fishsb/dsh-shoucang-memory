# 面板接口契约（生成物）

> **生成物 · 禁手写** —— 源 = `src/panel-contract.ts`；生成 = `node scripts/gen-panel-contract.mjs`（已挂在 `build:client` 前置）。
> 新鲜度由 `scripts/check-panel-contract.mjs` 守着：重生成与磁盘不一致即门禁翻红。

前缀：`/api/shoucang-panel` · 路由 **44** 条

| 路径 | 说明 | 必填字段 | 请求体字段（类型 · `?`=可选） |
|---|---|---|---|
| `/roots` | 已登记根目录列表 | — | — |
| `/get_root` | 当前激活根目录 | — | — |
| `/root/bootstrap` | 建单库骨架 | — | `root`?:string · `path`?:string |
| `/set_root` | 切换/登记根目录 | path | `path`:string · `name`?:string |
| `/config` | 读配置原文 | — | — |
| `/save` | 写配置原文 | text | `text`:string |
| `/toggle` | 翻转布尔键 | key | `key`:string |
| `/set` | 设置标量键 | key | `key`:string · `value`:any |
| `/memory/overview` | 索引/容量/候选总览 | — | — |
| `/memory/sections` | 索引小节列表 | — | — |
| `/suite` | suite 装配矩阵 | — | — |
| `/mcl/status` | 认知环状态 | — | — |
| `/reconcile` | 记忆对账 | — | — |
| `/maturation/scan` | 成熟度扫描 | — | — |
| `/selfcheck` | 自检结果 | — | — |
| `/selfcheck/run` | 运行自检 | — | — |
| `/rings` | 五环 KPI 与环事件对账 | — | — |
| `/config/recent` | 近期配置变更 | — | — |
| `/criteria` | 判据注册表 + 台账 | — | — |
| `/sleep/reports` | 睡眠汇报列表（日历式留存：份数 · 段数 · 最近一份） | — | — |
| `/sleep/issues` | 睡眠问题统计（suspect-recall=召回面 / suspect-quality=记忆面） | — | — |
| `/content-types` | 内容类型契约：类型分布 · 可达性 · 通路接线 | — | — |
| `/cognition/report` | 深睡回执/活性/归档 | — | — |
| `/llm/models` | 模型清单 | — | — |
| `/deepsleep` | 深睡状态 | — | — |
| `/deepsleep/trigger` | 手动触发深睡 | — | — |
| `/distill/run` | 手动触发蒸馏 | — | — |
| `/deepsleep/config` | 深睡配置读写（白名单补丁） | — | `enableDeepSleep`?:any · `deepSleepProbe`?:any · `deepSleepIdleMs`?:any · `deepSleepProbeAfterMs`?:any · `deepSleepProbeWindowMs`?:any |
| `/distill/config` | 蒸馏配置读写（白名单补丁） | — | `enableDistill`?:any · `idleWakeMs`?:any · `minTurnChars`?:any · `distillPrescan`?:any · `llmProvider`?:any · `llmModel`?:any · `distillProvider`?:any · `distillModel`?:any · `sleepProvider`?:any · `sleepModel`?:any |
| `/vector/status2` | 向量档状态 | — | — |
| `/embed/config` | 嵌入配置读写（白名单补丁） | — | `embedEnabled`?:any · `embedBaseUrl`?:any · `embedModel`?:any · `embedApiKeyEnv`?:any |
| `/embed/test` | 嵌入连通性测试 | baseUrl | `baseUrl`?:string · `apiKey`?:string |
| `/vector/cache/clear` | 清向量缓存 | rel, section | `rel`:string · `section`:string · `newBody`?:string |
| `/memory/section-edit` | 改写小节正文 | rel, section | `rel`:string · `section`:string · `newBody`?:string |
| `/memory/edit` | 行级编辑 | file, line, newText | `file`:string · `line`:string · `newText`:string |
| `/memory/remove` | 行级删除 | file, line | `file`:string · `line`:string · `pendingFile`?:string |
| `/memory/approve` | 采纳/忽略候选（root 指定双根；action=approve|ignore 语义分离） | pendingFile | `pendingFile`:string · `root`?:string · `action`?:string |
| `/inject/preview` | 热记忆注入预览 | — | — |
| `/inject/stats` | 注入统计 | — | — |
| `/arch/records` | 记录层：store 人口 · md↔store 逐载体对账 · 写时自证 · 跨文件同文 · 行寻址口径 | — | — |
| `/arch/graph` | 断言图：节点/边/各 rel/悬空证据（纯计数，零向量） | — | — |
| `/arch/observability` | 观测面：统一台账实况（按 type 分布/信封完整性）· audit 目录 · legacy 流存否 · 族×域口径 | — | — |
| `/arch/assembly` | 装配面：composition root 就绪度（桥=0）· 契约路由数 · 已装新架构模块盘点 | — | — |
| `/mcl/config` | 认知环旋钮（白名单补丁：阈值/上限/预算/topK/P2b/REM） | — | `mclEnabled`?:any · `mclFamiliarThreshold`?:any · `mclMaxNudges`?:any · `mclBudgetChars`?:any · `mclTopK`?:any · `mclAudit`?:any · `mclMaterialInSystem`?:any · `enableRemPass`?:any |
