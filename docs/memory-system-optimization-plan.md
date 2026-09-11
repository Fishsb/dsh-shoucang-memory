# 记忆系统整体优化方案 v1（2026-09-11）

> **状态：🔁 已并入/取代**。① **§9 排版与 §6 的 U1–U3 批次**已由 `ui-optimization-plan.md` 承接并全部实现（U1 `ed1ae08` · U2.5 `3dd4992` · U2 `db5ac98` · U3 `af50265` · U2.5b `9e98a52`）；② 其余「判据/写入/生效」条目已由 v2 → v2.1 → v2.2 方案承接（见 `memory-core-roadmap.md` 总纲）。**本档仅作早期判因留档**，勿据此重做。

> **性质**：架构级方案档（先文档、后代码；守 arch-view「架构先行协议」——判据骨架与检索融合属架构面，不先拍板不打补丁）。
> **依据**：① 外部对标（Letta / Mem0 / RRF / sleep-time compute / LongMemEval-V2 / Anatomy of Agentic Memory，见 §1 与 §9 链接）
> ② 判据域审计（四缺口，见 §2.1）③ 现磁盘行号（每条改动都给落点）。
> **不变量（改动一律不得破，来源=记忆库自身 `[flow]` 行）**：
> - **I1 单库化 + 多级指针**（`记忆体系分工`）：唯一库根 `~/.dsh/skills/managing-memory`；`notes/` 只是详情层，禁止另起库/另起索引体系。
> - **I2 深睡水位语义**（`深睡水位护栏`）：**done 才推水位**，failed/异常回滚；任何深睡改动不得改变出口语义。
> - **I3 运行态不入库**（`职责边界`）：动态状态（端口/PID/进度/会话交接）只留 `~/.dsh/suite/knowledge`，不入记忆库。
> - **I4** 零硬编码本机路径（`scripts/check-hardcode.mjs` 必过）· **I5** 单一实现（召回/装配矩阵不得出现第二份）· **I6** 写门纪律（只在⑥⑦闸口写、必过 `memory_write_gate`）。

## 0. 一页总览

| 阶段 | 项 | 成本 | 收益 | 风险 |
|---|---|---|---|---|
| **P0 拍板** | D1 spec §1 判据三层重构方案（文档）· D2 本方案档过审 | 低 | 判据从"散文"变"可机检" | 无（只写文档） |
| **P1 低风险高收益** | R1 **RRF 融合** · O1 **体检 token 账/放置审计** · O2 **记忆库 git 版本化** · O3 审计字段规范化 | 低-中 | 检索稳定性 + 可运维性 + 可回溯 | 低（都有开关/可回归） |
| **P2 判据落地** | C1 两 prompt 瘦身 + `judgement` 字段 · C2 升格链状态机 + spec §8 对齐 · C3 判据-结果对账 | 中 | 判据可度量、两域可对账 | 中（改 prompt 骨架，需 A/B） |
| **P3 试验** | S1 深睡**预计算**档（sleep-time 形态） | 中 | 首步工具调用↓、探索成本↓ | 中（仅对高可预测任务开） |
| **不做** | 实体图/图库 · 无条件 reranker · 深睡二次 LLM 复核 · 记忆库对外 MCP · 多租户 · 动态状态入库 | — | 避免堆叠 | — |

## 1. 外部对标 → 落点映射（采纳 / 改良 / 不做）

| 来源 | 外部机制 | 守藏现状 | 结论 |
|---|---|---|---|
| [Letta · Memory & dreaming](https://docs.letta.com/configuration/memory/) | MemFS（**git-backed** 记忆文件系统）· `/doctor`（placement/duplication/**system-prompt token 用量**）· dreaming（后台巩固）· 重组前先备份 | 文件库无版本控制；体检有容量/重复/指针但**无注入 token 账**；深睡=dinging 等价物；备份靠 `audit/backup-*` | **采纳** O2 git 版本化 + O1 token 账/放置审计；dreaming 已对齐（我们触发更保守：停滞 ≥3h） |
| [Letta · sleep-time compute (arXiv 2504.13171)](https://arxiv.org/abs/2504.13171) | 离线 anticipate 查询并**预计算**：同精度测试时算力 ↓~5×；扩算力精度 ↑13%(GSM-Sym)/↑18%(AIME)；多查询摊薄 ↓2.5×；**收益与查询可预测性强相关** | 深睡只产「原则/路径」+`delta.md` 3 行晨报，**无预计算** | **试验采纳** S1（仅高可预测任务；开关 + 命中率验收） |
| [Mem0 · How it works](https://docs.mem0.ai/core-concepts/how-it-works) | 抽取链 = 单遍 **ADD-only** → 去重+嵌入 → 实体链接；v2→v3 把「extract+merge 两遍 LLM」压成单遍 | 我们：新增走唯一性硬门（精确 + bigram≥0.66 拒重，`distill.ts:860`）、结构只允许 update、删除归审计 | **已对齐**（且更早）；**实体图不做**（见 §5.2） |
| [Mem0 · Memory Types](https://docs.mem0.ai/core-concepts/memory-types) | 只有 `procedural` 真实现；semantic/episodic 未接线 | `[路径]`=procedural ✅；`[flow]/[lesson]/[env]/[tool]`=semantic ✅ | **保持**（实现面更宽，无需跟） |
| [RRF（MongoDB / glaforge / Dify #34643）](https://www.mongodb.com/resources/basics/reciprocal-rank-fusion) | 排名融合解决 dense/sparse 分数尺度不可比、对离群分稳健；链路=混合召回→**RRF**→rerank | `vec.ts:254-255` 用 **min-max 归一化加权**（0.7/0.3）；ACT-024 已证归一化分**不能做阈值** | **采纳** R1（融合换 RRF；阈值保持绝对余弦，两件事解耦）；reranker 暂不引入 |
| [LongMemEval-V2 (arXiv 2605.12493)](https://arxiv.org/abs/2605.12493) | 五能力：static state / **dynamic state** / **workflow** / **gotchas** / **premise awareness**；文件+编码代理 72.5% > RAG 48.5% 但**延迟高** | workflow=`[路径]`、gotchas=`[lesson]`；state 留在状态区（I3）；缺 **premise awareness** 判据 | **部分采纳**：补 premise 判据（C1）；**不做**"全量文件+代理找"（违背 I1 的薄注入/渐进加载，且延迟高） |
| [Anatomy of Agentic Memory (arXiv 2602.19320)](https://arxiv.org/abs/2602.19320) | 系统级批判：benchmark 欠规模/饱和、**metric 与语义效用错位**、judge 敏感、**维护延迟/吞吐常被忽略** | `recall-eval` 曾不可复现（已修 `--since/--sids`）；维护成本未入账 | **采纳** R2（评测补延迟/token 账 + 弃答口径）+ C3（判据-结果对账） |

## 2. 判据层重构（P0 文档 → P2 代码）

### 2.1 四缺口（现码事实，先纠正再重构）

| # | 缺口 | 证据 |
|---|---|---|
| ① | 四问里有**死支**：`规则/纪律/程序 → SOUL.md`，但 SKILL/SOUL **不在任何白名单**、宿主无写入通道 | `skill/memory-whitelist-spec.md:42-43` vs `src/targets.ts:178-182`（indexTargets 仅三主档）+ `skill/scripts/memory-append.mjs:23-24` |
| ② | **两套判据并行重叠、无主从**：R2「跨项目细粒度→notes/tools|lessons」与四问 Q2b「环境/流程→MEMORY」各判一次；深睡又借 R1 词表当粒度锚 | `src/distill.ts:266` · `:271-272` · `:284`（「对齐 R1 粒度锚」） |
| ③ | **判据不可机检、不可度量**：R/四问全是 prompt 散文（模型自觉）；宿主只硬校验 route 值域/白名单/格式/容量+唯一性（`distill.ts:784` writeDispatch + `memory_write_gate.mjs:140-152` + `distill.ts:860`），判据本身**不入审计** | 同上 |
| ④ | **升格链无条目级判据、两域不对账**：spec §8 生命周期是**库级**（>80% 容量 或 近 5 次命中 ≥3），深睡用**条目级频次**（≥3 痕迹 / ≥2 同型） | `spec:311-313` · `distill.ts:283-285` |

### 2.2 三层 × 两域（重构目标）

**L0 共用内核（两域同口径；枚举，不打分）**：可复用性（跨任务/跨项目/仅本会话）· 泛化度（方向指引/契约事实/细节条文）· 稳定性（单次/当日重现/跨日或多会话重现）· 冲突性（无/并存/取代既有）。

**L1 域判据（互不借词）**
- **蒸馏域（摄取：会话 → 库）**：归属（memory/project/discard）→ 落点（notes 哪类+哪节）→ 粒度（并入 vs 裂 `###`，§8.1 R/K 律）→ 去重（精确/bigram 门）→ 格式（§8 四要素）。**四问降级为「归属」下一支子判据**，删除 SOUL.md 死支（规则改指 `skill/` 只读文档）。
- **深睡域（巩固：库 → 库）**：支撑度（L0 稳定性 + 证据条数）→ 升格（notes→`[原则]/[路径]`）→ 整形（treeOps，§8.1 律）→ 降格/遗忘（cold + ≥90d + 三守卫）→ 跨主题（≥2 §）→ 双画像反思。

**L2 代价权重（共用）**：误注入代价 > 漏写代价 ⇒ 默认保守；拒绝必给理由（`skipped.reason` 已有）；archive 需三守卫且 keep 优先。

### 2.3 升格链（显式状态机，替代现在一句"生命周期"）

```
会话正文 ──蒸馏(L1·摄取)──▶ pending 候选 / notes 详情
notes 详情 ──深睡(L1·巩固: L0 稳定性≥跨日 ∧ 支撑≥N)──▶ [原则]/[路径]（AGENT.md）
任一状态 ──活性 cold ∧ ≥90d ∧ 三守卫──▶ notes/archive（原位 stub，指针有效，可回滚）
[原则]/[路径] ──新经验修正──▶ replace（原地迭代，不新增层）
```

### 2.4 判据字段化与对账（把"深度"变成数字）

- 蒸馏输出加 `judgement:{reuse,generality,stability,conflict,dup}`；深睡输出加 `judgement:{evidence,stability,conflict,cost}`。
- 宿主把该字段写入审计（与 `distill-audit.jsonl`（`distill.ts:386`）/`mcl-audit.jsonl` 同址）。
- 对账三指标：**判据-结果一致率**（判"跨任务"的条目 N 天内是否被跟读）· **两域冲突率**（同主题蒸馏判 notes / 深睡判原则 的分歧）· **保守度**（rejected+skipped 占比）。

## 3. 检索层（P1）

- **R1 RRF 融合**：落点 `src/vec.ts:254-255`（把 `0.7*(sim-min)/span + 0.3*score/lexMax` 换成 `RRF = Σ 1/(k+rank_i)`，k=60）；**阈值仍用绝对余弦**（`src/mcl.ts:210` 的 `semanticSim` 口径不变）。配置加 `fusion: 'rrf'|'weighted'` 便于回滚与 A/B。验收：`recall-eval --since … --sids …` 固定窗口下跟读命中率不降、零命中兜底不增。
- **R2 评测补两列**：`recall-eval.mjs` 输出增 **① 延迟**（`vecStats.lastMs` 已有）**② token 账**（注入体量估算）**③ 弃答口径**（不该召回却召回的轮次）。
- **R3 reranker 触发门（现在不做）**：当**索引行 > 200** 或 **跟读命中率连续两次 A/B 下降**时再评估本地 bge-reranker；此前不引入（违背 I5 的极简取向且收益 < 延迟成本）。

## 4. 观测与运维层（P1）

- **O1 体检 `/doctor` 化**：`skill/scripts/memory_health_check.mjs`（判据面 `:35-42`）增三项——① **注入 token 账**（三主档字符 → token 估算 vs systemPrompt 预算）② **放置审计**（画像行误入 MEMORY/USER、`env` 类误入 AGENT）③ 现有容量/重复/指针/§悬空/元数据覆盖保持。**只提示不拦截**（与 §8.1 同策略）。
- **O2 记忆库 git 版本化**：库根 `git init` + 每次 `write_gate` 通过后自动 commit（脚本层钩子）→ 得到每条记忆**可 diff / 可 revert**；保留 `audit/backup-*`。库仍在 `~/.dsh`（不入公开树，守 I4）。
- **O3 审计字段规范化**：`mcl-audit` 的 `sid` 修为 `replace(/^session-/,'').slice(0,8)`；统一 `judgement` 字段位置（§2.4）。

## 5. 巩固层（P3 试验 + 明确不做）

### 5.1 S1 深睡预计算档（sleep-time compute 的守藏形态）
- **只在**"可预测性高"的任务上做：候选区满足 `成功≥2 ∧ 跨会话≥2`（`distill.ts:478` 的跨会话计数）→ 深睡为该任务类型生成「**最可能被问的 3–5 问 + 要点**」。
- **落点**：`notes/` 新小节（+ 索引行可选）与 `delta.md` 扩展（晨报 + 预计算指针）。
- **守 I2**：仍走既有五路落盘与 `write_gate`，**水位语义不变**（done 才推）。
- **验收**：预计算命中率（下轮首步是否引用）、首步工具调用数下降；开关 `mcl/sleep.precompute`。

### 5.2 明确不做（理由）
| 不做 | 理由 |
|---|---|
| 实体图 / 图数据库（Mem0 entity store、Zep/Graphiti） | 单用户单机、索引仅 43 行；改用 **INDEX 元数据表加「关联主题」列**（弱关联，零成本） |
| 深睡二次 LLM 复核档 | Letta 自述"更费 token、不找批准"；我们已有确定性写门（I6） |
| 无条件 reranker | 见 R3 触发门 |
| 记忆库对外 MCP 暴露 | 破 I1 唯一承载 + 隐私红线 |
| dynamic state / 进度 / 交接入库 | 破 I3（状态区职责） |

## 6. 度量体系（DoD）

| 指标 | 现状基线 | 目标 | 采集 |
|---|---|---|---|
| 回归套件 | 40+30+18+18 PASS | 不回归（新增项各自带用例） | `npm test` |
| 库体检 | exit 0 · MEMORY 53% | exit 0 · 注入 token 账 ≤ 预算 | `memory_health_check.mjs` |
| 召回质量 | 跟读/零命中（`recall-eval`） | 固定窗口 A/B 不降 | `recall-eval --since --sids` |
| 判据可度量 | **无** | 三指标有基线（一致率/冲突率/保守度） | §2.4 审计 + 对账脚本 |
| 认知环 | slow=1 / injected=1（首批实测） | 慢通道合规率 ≥80%、快通道零回归 | `/mcl/status` + `mcl-audit.jsonl` |
| 可回溯 | `audit/backup-*` 目录 | 每条记忆可 diff/revert（git） | O2 |

## 7. 风险与回滚开关

| 项 | 开关 | 回滚动作 |
|---|---|---|
| R1 RRF | `fusion: 'rrf'|'weighted'` | 配置切回 `weighted`（无需改码） |
| C1 judgement 字段 | 契约版本号（v6→v7） | 契约回 v6 + 宿主忽略该字段（**向后兼容**：字段可选） |
| O2 git 版本化 | 写门钩子开关 | 停用钩子，`.git` 保留不影响读写 |
| S1 预计算 | `sleep.precompute=false` | 关闭产出，深睡其余通道不变 |
| MCL（已上线） | `mclEnabled=false` | 回到纯注入面（已可用） |

## 8. 交付顺序与验收命令（每阶段收口）

1. **P0**（本档 + spec §1 重构草案）→ 你过审；`nav_graph mode=docs target="判据重构"` 可路由到本档。
2. **P1**：R1 + O1 + O2 + O3 → `npm run typecheck && npm test`；`recall-eval --since 2026-09-01 --n 100 --json` 前后对比；`memory_health_check` exit 0。
3. **P2**：C1（两 prompt 骨架改）+ C2 + C3 → 契约 v7 + 回归（含 `test-mcl` 扩展断言）+ 三指标首次出数。
4. **P3**：S1 → 只在开关打开时跑，出「预计算命中率」再决定是否扩大。

## 9. 外部来源清单（可复核）

- Letta：<https://docs.letta.com/configuration/memory/> · <https://docs.letta.com/v1-sdk/memory/memory-blocks/>
- sleep-time compute：<https://arxiv.org/abs/2504.13171>（代码 <https://github.com/letta-ai/sleep-time-compute>）
- Mem0：<https://docs.mem0.ai/core-concepts/how-it-works> · <https://docs.mem0.ai/core-concepts/memory-types>
- RRF：<https://www.mongodb.com/resources/basics/reciprocal-rank-fusion> · <https://glaforge.dev/posts/2026/02/10/advanced-rag-understanding-reciprocal-rank-fusion-in-hybrid-search> · <https://github.com/langgenius/dify/discussions/34643>
- 基准/综述：<https://arxiv.org/abs/2605.12493>（LongMemEval-V2）· <https://arxiv.org/abs/2602.19320>（Anatomy of Agentic Memory）· <https://github.com/HUST-AI-HYZ/MemoryAgentBench> · <https://github.com/FeishuLuo/Evolving-LLM-Agent-Memory-Survey>

_建立 2026-09-11 · 依据：外部对标（§1）+ 判据域审计（§2.1）+ 现码行号；未动任何代码。_
