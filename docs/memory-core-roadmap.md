# 记忆核心总纲路线图（v2 → v2.1 → v2.2 整合版）

> **性质**：四份方案（v2 判据 / v2.1 写入 / v2.2 生效 / UI）+ 三个 ADR 的**总纲**：消除重复与冲突、补齐缺口、给出**唯一实施顺序**与出口判据。
> **阅读顺序**：本档 →（细节）`memory-architecture-v2-plan.md`（v2）· `memory-carrier-and-receipt-plan.md`（v2.1）· `memory-layer-model-plan.md`（v2.2）· `ui-optimization-plan.md`（UI）。
> **判因**：三份方案由同一批诊断分三轮写出，存在**字段级重叠**（carrier × layer）、**台账分裂**（judgement-ledger × write-ledger）、**度量口径分散**（recall-eval / reconcile / 台账三套读法）与**缺口**（层间冲突、回滚矩阵、迁移影响、术语漂移）。不整合就开工，必然出现"同一概念两处定义、同一开关两处命名"的漂移。
> **不变量**（全案通用）：单库化 + 多级指针 · 深睡 done 才推水位/失败回滚 · 运行态不入库 · 零硬编码 · **单一实现** · 写门纪律 · 不新增常驻注入点。
> **引用经验**：`[演化] 定位演进`（双主体/成长档案）→ 层模型必须与**产品语义**对齐（P 层=成长档案：我是谁/我怎么想；E 层=任务经验）；`[经验] 记忆脚本参数解析坑`（字段/参数须显式核对）→ 本档专设**术语表**与**迁移清单**，实现期只许引用、不许另起名字。

## 0. 一页总览

| 方案 | ADR | 状态 | 关键产物 | 待拍板点 |
|---|---|---|---|---|
| v2 判据可测 | ACT-122 | ✅ **已实现**（`25ec28f`/`61e8f10`） | `criteria.json` · 生成投影 · `check-criteria` · `criteria.ts` · `judgement-ledger` · RRF · 库 git | — |
| UI 优化 | — | ✅ **已实现**（`ed1ae08`…`9e98a52`） | 首屏 5 组 · 7 徽章 · 排版令牌 · 参数四桶 · 能力对齐 | — |
| **v2.1 写入可测** | ACT-126 | 📋 方案 | 载体契约 · 写入回执 · 账本对账 · 触发数据化 | 是否开工 |
| **v2.2 生效可建模** | ACT-128 | 📋 方案 | P/R/E 三层 · 统一打分 · 成熟度/priming | 是否开工 |
| **本总纲** | ACT-034 | 📋 新增 | 字段合并 · 缺口补齐 · 统一路线 M0–M6 | 顺序确认 |

## 1. 统一术语表（实现期**只许引用**，禁止另起名）

| 术语 | 代码名 | 定义 | 权威源 |
|---|---|---|---|
| 判据 | `criteria.*` | 决定"收不收/放哪里/升不升格"的规则条目 | `criteria.json` |
| **载体** | `carrier` | 一条写入行**以什么形式存在、是否可注入**；**携带 `layer`** | v2.1 + v2.2（本档合并） |
| **层** | `layer ∈ P｜R｜E` | 生效方式：恒常 / 任务门控 / 相关性门控 | v2.2 |
| 可注入性 | `inject ∈ always｜gated｜none` | always=P 层；gated=E/R 层；none=notes/audit | 本档（合并 carrier 与 layer） |
| 回执 | `receipt` | 一次写入尝试的结果记录（含被拒原因与原文） | v2.1 |
| 台账 | `ledger.jsonl` | **decision.* + write.\*** 两类事件的统一流 | 本档（合并 judgement/write ledger） |
| 激活 | `A`（activation） | 条目成熟度 0–1；`A≥0.5` 才可升格 | v2.2 |
| 影子打分 | `shadowScore` | 新公式并行计算但**不改变排序** | v2.2 |
| 账本闭合 | reconciliation | 主档行数 == written 累计 − 合并/退役/归档 | v2.1 |
| 三方对齐 | carrier ↔ layer ↔ 渲染器 | 机检门：每个载体可达、每层有渲染器 | 本档 |

## 2. 字段合并决议（消除重叠）

| 重叠 | 决议 |
|---|---|
| v2.1 `carrier` × v2.2 `layer` | **合并为一个 `carrier` 对象**：`{ layer: "P"\|"R"\|"E", form: "index"\|"profile"\|"notes"\|"audit", inject: "always"\|"gated"\|"none" }`。layer 是载体属性，不再单列字段 |
| v2 `judgement-ledger` × v2.1 `write-ledger` | **统一为 `audit/ledger.jsonl`**，事件 `type ∈ {decision.ingest, decision.consolidate, write.channel}`；旧文件保留（读取端兼容一个版本），新写入只进统一台账 |
| 触发数据化（v2.1 §2.4 与 v2.2 §4 都提到） | **只在 `criteria.consolidate.trigger` 定义一次**；v2.2 只引用 |
| 三层观测（v2.2 §5-G） | 数据由 v2.1 的 `memory-reconcile.mjs` 产出；v2.2 只定义**指标含义** |
| 打分参数 | 归 `criteria.surface.score = { α_rel, α_imp, α_rec }`；成熟度归 `criteria.maturation = { A0, step, gate }` |

**标签 → 层映射（依据库内实测分布：MEMORY `env×17 lesson×14 flow×7 tool×5`；USER `偏好×3 习惯×2 身份×1 环境×1 硬件×1`；AGENT `原则×3 经验×1 演化×1 路径×1`）**：

| 标签 | 层 | 注入 | 理由 |
|---|---|---|---|
| `[身份]` `[使命]` `[边界]` `[性格]`（新增）`[认知]`（新增）`[演化]` | **P** | always | 恒常人格/成长档案（对齐 `[演化] 定位演进` 的产品语义） |
| `[习惯]`（agent 侧） · `[偏好]`(agent 侧) | **P** | always | 稳定行为模式 |
| `[路径]` | **R** | gated（任务型） | 步骤骨架，按任务类型命中 |
| `[经验]` | **E** | gated（相关性） | 情境经验（**D7 修正**：语义属经验层，不再当 always-on） |
| `[原则]` | **P 为主 / E 为辅** | always（仅跨环境稳定者）+ 余者 gated | 跨任务认知=人格；带情境前提的留 E（`A≥0.5` 才升 P） |
| `[env]` `[tool]` `[flow]` `[lesson]` | **E** | gated | 环境事实/工具/流程/教训 |
| `[身份]` `[环境]` `[硬件]` `[偏好]` `[习惯]`（USER 侧） | **P**（用户侧） | always | 用户画像=交互基底 |

> **迁移方式（G3）**：**不移动任何文件与行**（避免破 § 指针与容量门）——只把映射写入注册表，并在库内 `notes/INDEX.md` 元数据表加一列 `层`（可分批回填）。`[经验]` 行的物理位置不变，但 carrier 由 `{layer:P}` 改为 `{layer:E, inject:gated}` ⇒ **行为变化仅在注入面**，可一键回滚。

## 3. 缺口补齐（"完善"的实质）

### G1 层间冲突解决规则（新增）
- **P 优先**：人格/边界**不可被单轮经验覆盖**。E 层与 P 层冲突时：① 保留 P；② 在 E 层条目追加 `- 例外：<情境>`；③ 触发 `conflict` 事件进台账；④ **P 层变更只能经深睡 + 回执**（禁止单轮蒸馏直改人格行）。
- **同层冲突**：走既有 `supersede/replace` + 唯一性硬门。
- **R 与 E 冲突**：任务型优先（`[路径]` 命中时以路径为准，E 层仅补充）。

### G2 回滚矩阵（每项开关 / 默认 / 降级行为）
| 项 | 开关 | 缺省 | 关掉后的行为 | 影响面 |
|---|---|---|---|---|
| 判据注册表 | `criteriaVersion`（只读） | v2.0.0 | 不可关（投影由注册表生成） | — |
| RRF 融合 | `recallFusion=weighted` | rrf | 回到 v1 min-max 加权 | 召回排序 |
| 库 git | `bankGit=false` | true | 停写快照（库仍可用） | 可回溯性 |
| 认知环 | `mclEnabled=false` | true | 关闭快/慢通道 | 注入面 |
| **P 层画像行渲染** | `carriers.profile=0` | 3/档 | 回到"画像行不注入"（今日行为） | 注入面 |
| **写入回执** | `writeLedger=false` | true | 只写事件不写回执 | 可诊断性 |
| **逐条裁决** | `perItemGate=false` | true | 回到"整轮全拒" | 写入成功率 |
| **成熟度门槛** | `maturation.enforce=false` | true | 升格仍按裸计数 | 升格速率 |
| **新打分** | `scoreWeights=legacy` | 新值 | 回到 relevance+activity | 召回排序 |
| **影子打分** | `shadowScore=false` | true(M4 后) | 不产出对照数据 | 度量 |

### G4 统一度量口径（三数字 + 两曲线）
| 类别 | 指标 | 采集 | 目标 |
|---|---|---|---|
| 注入 | **P/R/E 三层占比** | `memory-reconcile` | P 层 ≥ 配额下限（不被经验挤掉） |
| 注入 | 三层增长率（周） | `memory-reconcile` | P 层 >0（防 D1 复发） |
| 写入 | 账本闭合差异 / 被拒率 / 逐条成功率 | 统一台账 | 闭合=0；被拒率可解释 |
| 召回 | 跟读命中率 / 零命中率 / 延迟 / token | `recall-eval --since --sids`（A/B） | 不降 |
| 判据 | 一致率 / 两域冲突率 / 保守度 | `criteria-audit` | 有基线且可比 |
| 成熟度 | A 分布 + 升格数 | `maturation.jsonl` | 升格有据（A≥0.5） |

### G5 责任表（谁强制、谁自觉、谁拍板）
| 类别 | 例子 | 性质 |
|---|---|---|
| **宿主硬门** | 容量/格式/指针存在/唯一性/逐条 gate/账本闭合 | 机检，违反即拒 |
| **模型自觉** | 归属、粒度、importance 初值、A 的推断 | 台账留痕，可回溯 |
| **用户拍板** | P 层标签增删、打分权重切换、触发阈值、删改库内容 | ADR + 面板 |

### G6 风险登记册
| # | 风险 | 触发条件 | 缓解 | 回滚 |
|---|---|---|---|---|
| R-1 | 注入预算被 P 层吃满 | P 层行数增长 | P 配额硬上限（≤3/档）+ reconcile 告警 | `carriers.profile=0` |
| R-2 | importance 与 relevance 冗余 | 影子期相关系数 >0.9 | 删该分量 | `scoreWeights=legacy` |
| R-3 | 逐条裁决放宽后误收 | 被拒率骤降但质量降 | 保留格式/指针硬门 | `perItemGate=false` |
| R-4 | 成熟度门槛导致长期不升格 | 升格数=0 持续 2 周 | 降 gate 或改跨日证据口径 | `maturation.enforce=false` |
| R-5 | 层映射误判（把人格判成经验） | 用户观感：注入变少 | 注册表可改 + 索引行层列可人工覆写 | 改映射表 |
| R-6 | 统一台账迁移丢字段 | 读取端不兼容 | 双写一版 + 字段版本号 | 读旧文件名 |

### G7 阶段-文件-工作量
| 阶段 | 文件 | 工作量 |
|---|---|---|
| M0 | `src/panel.ts`(readIdx/审计) | S |
| M1 | `criteria.json` · `scripts/check-carriers.mjs` · `package.json` | S |
| M2 | `src/distill.ts` · `src/treeops.ts` · 台账写入 | M |
| M3 | `scripts/memory-reconcile.mjs` · `src/panel.ts` · `client.js` | M |
| M4 | `src/vec.ts` · `src/targets.ts` · `src/activity.ts` | M |
| M5 | 同上 + `src/distill.ts`(升格阈值) | M |
| M6 | `spec` · `distill-contract.md` v9 · ADR · 文档 | S |

## 4. 唯一实施顺序（M0–M6，含出口判据）

```
M0 前置（必修·最小行为变更）  readIdx→按 carrier 渲染 + 审计 attempted/written 拆分 + 拒收原文入账
   出口：注入面实测出现画像行（← 源:）；审计能读出被拒原文；U1–U3 门与 npm test 全绿
M1 契约化（零行为）           criteria.json 加 carrier{layer,form,inject} + check-carriers（三方对齐）
   出口：check-carriers 常绿；每个 carrier 有渲染器 / 每个渲染器有 carrier
M2 回执（零行为）             统一 ledger.jsonl（decision.* + write.*）+ 6 通道逐条裁决
   出口：任取一次拒收可从台账读到 原文+理由+exit；单条失败不再丢同轮其他条目
M3 对账（零行为）             memory-reconcile（闭合/健康度/三层占比）+ 面板「记忆产出健康」卡
   出口：闭合差异=0（或显式豁免）；P/R/E 占比可视；连续空转有告警
M4 影子打分（零行为）         scoreWeights 并行计算 + maturation 只记不算（影子期 ≥1 周）
   出口：影子数据支持/否证 importance 分量（R-2 判据）
M5 切换（唯一行为变更）       E 层新公式 · P 层渲染画像行 · 升格改读 A；recall-eval A/B
   出口：跟读率不降、零命中不增、P 层占比达标；无 A 证据不升格
M6 治理收口                   spec §1 层模型+载体契约 · contract v9 · ADR · CHANGELOG
   出口：文档与实现一致（check-criteria/check-carriers 双绿）；架构档 9/9 新鲜
```

**依赖关系**：`M0 → M1 → M2 → M3 → M4 → M5 → M6`（严格串行；**M4 的影子期是 M5 的准入条件**，不可跳）。
**与 UI 方案的关系**：UI 的 U1–U3 已实现；剩余唯一 UI 项（三层观测卡）归 **M3**。

## 5. 整体完成判据（DoD）

1. `check-criteria` + `check-carriers` 双绿；判据/载体/渲染器**三方对齐**。
2. 统一台账下：**decision 与 write 事件同址同版本**；任一次拒收可定位到原文与理由。
3. **账本闭合差异 = 0**（豁免显式列出）。
4. **P 层可见且在增长**：注入面含画像行；周增长率 >0；P 层占比 ≥ 配额下限。
5. **打分有据**：importance 分量经影子期验证（相关性 <0.9）后才启用；recency 权重 ≤0.10。
6. **升格有据**：`[原则]`/`[路径]` 的每次新增都能追到 `A≥0.5` 的成熟度记录。
7. 度量齐备（G4 六项）且 `recall-eval` A/B **不降**；`npm test` 全绿；架构档 9/9；锚点 100%。

_建立 2026-09-11 · 依据：v2/v2.1/v2.2/UI 四份方案 + 库内实测（标签分布 · criteria 扩展点 · 回滚开关面 · 台账文件清单）· 本轮未改任何代码。_
