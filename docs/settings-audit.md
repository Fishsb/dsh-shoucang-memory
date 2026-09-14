# 设置调节属性审查报告（2026-09-09）

> 审查范围：① 项目待办项盘点；② 全部参数/状态哪些适合作为设置调节属性；
> 参考项目：dsh-auto-memory（本机同生态）、mem0、Letta(MemGPT)、LangMem/LangGraph。
> 事实源：shoucang.config.example.yaml v3、src/{panel,scheduler,distill,targets}.ts、skill/scripts、docs/ui-todo.md、docs/human-loop-roadmap.md、HANDOVER.md、CHANGELOG。

---

## 一、待办项盘点

| 来源 | 事项 | 核对状态 | 结论 |
|---|---|---|---|
| `docs/ui-todo.md` | T1 会话状态机可视化 + T2 睡眠可视化与可调 | 顶部已标注「均于 2026-09-08 落地」，正文实为实现记录 | ✅ 无未完成项；建议标题改「已归档：实现记录」 |
| `src/distill.ts:89 / :980` | 注释「接线待办见 docs/ui-todo.md」 | 接线（registerDistill 三函数 + panel 三路由）早已完成 | ⚠️ 注释漂移，应清理为「快照接口，面板 /deepsleep 已消费」 |
| `docs/human-loop-roadmap.md` | 批次 0–5 人化执行体系 | 表内全部 ✅ 落地 | ✅ 无待办；B 嵌入模型升级=按触发判据观察（非待办）；「平台层可选项」（SOUL.md 补两条）跨项目，未做 |
| `HANDOVER.md` | 「四、下一步」5 项 | 文档已标历史（2026-09-06），pmg 整体移除后 1/4 已作废，2/3/5 已完成或由现行功能承接 | ✅ 无需行动 |
| `_memory/pending/` | 蒸馏候选积压 | 目录为空 | ✅ 零积压 |
| `panel.ts:908` | py 配额日志 `${MAX_PY_PER_ROUND}` 插值 | 已确认为模板插值（上轮修复落地） | ✅ 已修复 |
| **本次审查新发现** | 蒸馏节流键无持久 UI 通道（见 §四 B-1） | enableDistill / idleWakeMs / minTurnChars / distillPrescan / llmProvider / llmModel 只有 schemastery Config（不持久）+ scheduler.json 手写（无 UI） | ⚠️ 真实缺口，建议立待办 |

---

## 二、参数全景盘点（三通道 + 硬编码）

### 通道 1 · 面板 YAML（shoucang.config.yaml，/toggle + /set 白名单）

| 参数 | 范围/枚举 | 状态 |
|---|---|---|
| boards.persona / memory / wiki | 布尔（wiki deprecated） | 已设置化 |
| injection.hot_memory / level / persona / max_tokens | 布尔；off\|low\|medium\|high\|smart；off\|me\|you\|both；100–8000 | 已设置化 |
| archive.enabled / idle_review_ms / ttl_multiplier | 布尔；1–60min；0.5–10 | 已设置化 |
| lifecycle.enabled / interval_hours / archive.*(apply_confirm / min_confidence / age_days / mode / fixed_time) | 布尔；1–168h；0–100；0.1–30 天；age\|fixed；HH:MM | 已设置化 |
| merge.enabled / fingerprint_threshold / complement_floor | 布尔；0.1–1；0.05–0.9 | 已设置化 |
| idle.sessions_dir | 字符串（留空自动探测） | 已设置化 |
| embedding.* | base_url / model / dimension | 有意禁手改（部署自动写入，2026-08-27 拍板） |

### 通道 2 · scheduler.json 自持持久通道（键名同 Config，启动时覆盖缺省）

| 参数 | 缺省 | 面板入口 |
|---|---|---|
| enableDeepSleep / deepSleepIdleMs / deepSleepProbe / deepSleepProbeAfterMs / deepSleepProbeWindowMs | true / 3h / true / 3h / 60s | ✅ /deepsleep/config（T2 滑块） |
| deepSleepProbeSamples / Confirm / Retries / MaxMs | 3 / 2 / 2 / 10min | ❌ 仅手写 JSON |
| **enableDistill / idleWakeMs / minTurnChars / distillPrescan** | true / 10min / 200 / true | ❌ 仅手写 JSON |
| **llmProvider / llmModel / distillPrompt / verify_enabled** | ''（继承主会话） | ❌ 仅手写 JSON |

### 通道 3 · 硬编码常量（不可调节）

| 常量 | 值 | 位置 | 性质 |
|---|---|---|---|
| level→注入行数映射 | 0/2/4/8/10 | panel.ts | 注入档位实现 |
| injectCache TTL | 30s | panel.ts | 实现细节 |
| **MAX_PY_PER_ROUND** | 24 | panel.ts | 风暴防护配额 |
| **MAX_WRITES_PER_RUN** | 15 | panel.ts | 风暴防护（2026-08-27「101 条垃圾入库」教训产物） |
| DEEP_SLEEP_CHECK_MS | 10min | distill.ts | 巡检间隔（入睡延迟粒度） |
| PROFILE_CAP | 2000 | distill.ts（panel 同值另一处） | 画像容量 |
| CAND_BUDGET / PEND_PER_FILE / NOTES_PER_FILE / notesBudget | 12000 / 2500 / 6000 / 18000 | distill.ts | 蒸馏 LLM 输入预算 |
| PRESCAN_STRONG / PRESCAN_MID 信号词表 | 10 词 + 9 正则 | distill.ts | 蒸馏预筛质量面 |
| 写门 LIMITS | MEMORY 3000 / USER 2000 / AGENT 2000 / PRINCIPLES 1000 | skill/scripts/memory_write_gate.mjs | **spec v14 协议容量** |
| 容量警戒线 / 降级判据 | >85% / 连续 2 次审计零命中 | memory_health_check.mjs + audit-protocol | **spec §7 协议常量** |

---

## 三、参考记忆项目对比

| 维度 | dsh-auto-memory | mem0 | Letta(MemGPT) | LangMem | shoucang 现状 |
|---|---|---|---|---|---|
| 配置哲学 | **「一切皆开关」**：向导+设置页双入口，每个功能独立开关 | 组件化：llm/embedder/vector_store/reranker 各 provider+config | schema 级：memory_blocks（label/limit/description per-block） | 双模式：hot-path 工具 vs background manager | 三通道并存，UI 白名单分散 |
| 注入预算 | injectBudgetChars=2400 ✅ GUI | — | — | — | ✅ max_tokens（对齐） |
| 注入档位 | — | — | — | — | ✅ level 五档（领先） |
| **巩固/写入频率** | autoConsolidateCooldownMinutes=30、DailyMax=8 ✅ GUI | temperature≤0.2 等 LLM 侧 | sleep-time compute（独立 agent 可换大模型） | background manager 模式开关 | ⚠️ idleWakeMs/minTurnChars 有 Config 无 UI |
| **写入量上限** | DailyMax ✅ GUI | — | — | — | ⚠️ MAX_WRITES_PER_RUN=15 硬编码 |
| **模型通道** | 模型无关，即装即得 | llm.provider+model ✅ 一等配置 | LLMConfig ✅ | LLM 字符串 ✅ | ⚠️ llmProvider/llmModel 有 Config 无 UI |
| 容量上限 | 无硬容量（每日预算制） | collection 配置 | **block limit=2000 ✅ per-block 可配** | — | ❌ 写门 LIMITS 全硬编码（spec 契约） |
| 时段类参数 | unattendedAutoHours=["22:00-08:00"] ✅ GUI | — | — | — | ✅ lifecycle.fixed_time（对齐） |
| 内部预算切分 | 不暴露 | embedding_model_dims 暴露（模型耦合必须） | — | store index dims 暴露（同） | 不暴露 ✅（合理，CAND/PER_FILE 系） |

**共性规律**（四项目一致收敛的暴露原则）：
1. **注入/召回面的开关与预算永远暴露**——shoucang ✅ 已做。
2. **巩固频率与写入量永远暴露**（冷却/每日上限/触发阈值）——shoucang 蒸馏节流是最大缺口。
3. **LLM 通道（用哪个模型做记忆任务）是一等配置**——shoucang 有 Config 无 UI。
4. **容量上限可配**（Letta block limit）——shoucang 因 spec 契约硬编码，可保留但应收敛单一实现。
5. **纯内部实现不暴露**（预算切分、融合权重）——shoucang ✅ 已做对。

---

## 四、审查结论：可作为设置调节属性的参数

### A. 建议新增为设置项（按优先级）

| # | 参数 | 建议通道 | 理由（对照证据） |
|---|---|---|---|
| B-1 | **enableDistill** | panel /deepsleep/config 同级或 YAML 节 | 蒸馏器本体总开关——injection/archive/lifecycle/merge 四组都有开关，唯独蒸馏（守藏核心职能）没有 UI 通道；对照 dsh-auto-memory「一切皆开关」。schemastery UI 又不持久，等于用户无法安全关蒸馏。**P1** |
| B-2 | **idleWakeMs + minTurnChars** | 同上（蒸馏节流组） | 直接决定蒸馏触发频率与 token 成本；对照 autoConsolidateCooldownMinutes/DailyMax 均进 GUI。**P1** |
| B-3 | **llmProvider / llmModel** | 深度睡眠/蒸馏共用「模型选择」下拉 | mem0/Letta/LangMem 三方均把记忆 LLM 做一等配置；且深度睡眠 daemonParent 已有「路由取 llmProvider/llmModel」逻辑，UI 空缺形成不对称。**P2** |
| B-4 | **MAX_WRITES_PER_RUN → idleMaxWrites**（命名随 Config 风格） | 空闲巩固组 | 风暴防护参数直接影响单轮入库量；dsh-auto-memory 的同类参数 DailyMax=8 进 GUI。**P2** |
| B-5 | deepSleepProbeSamples / Confirm / Retries / MaxMs | /deepsleep/config 高级区（折叠） | 探测韧性四键已有 Config，与已暴露的 5 键同组，补齐即完整。**P3** |
| B-6 | distillPrescan | 蒸馏高级区 | 预筛开关（省 LLM 调用），低频但属用户可理解行为开关。**P3** |

### B. 建议维持硬编码，但收敛/补注（防漂移）

| 参数 | 处置 | 理由 |
|---|---|---|
| PROFILE_CAP=2000（panel + distill 两处） | **收敛为单一导出**（如 targets.ts 或共享常量模块），再议设置化 | panel/distill/write_gate USER 容量 2000 同值三处分散——与「suiteAssemblyMatrix 单一实现」既有约定同类风险 |
| 写门 LIMITS / 85% 警戒线 / 降级判据「连续 2 次」 | 保持协议常量，代码注释标注 spec 出处 | spec §7 契约；改动须走变更机制，不宜裸露为运行时开关 |
| level→行数映射 | 保持硬编码 | 注入档位是对外抽象，行数是实现细节；max_tokens 已承担预算调节 |
| CAND_BUDGET / PER_FILE / notesBudget | 保持硬编码 | 蒸馏 prompt 预算与 DEEP_SLEEP_PROMPT 契约耦合，单改数值会破坏契约平衡 |
| PRESCAN 词表 | 保持硬编码（可选：distillPrompt 覆盖已能间接调整蒸馏行为） | 预筛词表与蒸馏 prompt 契约同体 |
| DEEP_SLEEP_CHECK_MS | 低优先级：可提为 Config 或至少注释「入睡检测粒度」 | 与 deepSleepIdleMs 可调形成轻微不对称 |
| injectCache TTL / py 配额 | 保持硬编码 | 纯实现细节 |

### C. 明确不设置化

- `embedding.*`（已有拍板：部署自动写入，禁手改）
- `members` / `state_path` / 路径类（结构性配置，非调节属性）

---

## 五、行动清单（建议顺序）

1. **清漂移**：distill.ts:89/:980 两处「接线待办」注释更新；ui-todo.md 标题归档化。（5 分钟）
2. **P1 缺口**：蒸馏节流组（enableDistill/idleWakeMs/minTurnChars）接入持久 UI——推荐复用 /deepsleep/config 的「写 scheduler.json + 重载生效」既有模式，一次把 B-1/B-2/B-3/B-5 同组做完。
3. **P2**：MAX_WRITES_PER_RUN 提为 Config（idleMaxWritesPerRun），缺省 15 不变。
4. **单一实现**：PROFILE_CAP 收敛共享导出，连带校准 write_gate LIMITS 引用。
5. 以上属 src 改动，落地时按 AGENTS.md 规则：typecheck + build + CHANGELOG [Unreleased] 记录。

---

## 附：当前生产配置实况（~/.dsh/suite/scheduler.json）

```json
{ "enableDeepSleep": true, "deepSleepProbe": true }
```
其余全部走缺省值——即用户至今只显式调过 2 个键，缺省策略目前够用；缺口在于「想调时无通道」。
