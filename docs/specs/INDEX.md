# 守藏四板块分册索引（2026-09-14）

> **本索引取代**：`docs/master-architecture-plan-2026-09-14.md`（一体化定稿）的**施工地位**——该文保留作**总设计论证档**（四链条总图、库核心三面、协议层选型论证、P0–P4 风险表）；**施工与验收一律以本索引列出的分册为准**。两者若冲突，**以分册为准**。
> **上游四份分析档**（证据与论证，不施工）：`human-task-loop-vs-embodied-ai-2026-09.md` · `library-supply-chain-rework-2026-09-14.md` · `four-chains-adjustment-order-2026-09-14.md` · `three-layer-supply-plan-2026-09-14.md`。
>
> **交付校验**（2026-09-14）：本目录共 **11 份**（索引 1 + 板块 5 × 方案/验收 10），配对完整（S0–S4 各自 plan + acceptance 均存在），依赖链已在各方案文件头声明。

---

## 1. 分册清单（每板块一份方案 + 一份验收）

| # | 板块 | 方案 | 验收方案 | 依赖 |
|---|---|---|---|---|
| **S0** | 协议层（内容类型契约） | `specs/S0-protocol-plan.md` | `specs/S0-protocol-acceptance.md` | ——（**最先**） |
| **S1** | 库核心 | `specs/S1-library-plan.md` | `specs/S1-library-acceptance.md` | S0 |
| **S2** | 生产链条 | `specs/S2-production-plan.md` | `specs/S2-production-acceptance.md` | S0 · S1 |
| **S3** | 维护链条 | `specs/S3-maintenance-plan.md` | `specs/S3-maintenance-acceptance.md` | S0 · S1 · **S2** |
| **S4** | 消费链条 | `specs/S4-consumption-plan.md` | `specs/S4-consumption-acceptance.md` | S0–S3（**最后**） |

> **顺序不可颠倒**，依据 `four-chains-adjustment-order` §3：① 内容类型边界须由消费判据倒推，但**必须先冻结**才能改两端；② 维护链**唯一能重写历史**，须先对存量对齐；③ 生产链改增量；④ 消费链最后收口（否则新数据无人能读）。

---

## 2. 板块边界（各自只对自己那格负责）

| 板块 | 输入 → 输出 | 一句话职责 | 不碰什么 |
|---|---|---|---|
| **S0 协议** | ——（定义） | 声明「哪类信息由谁产、存成什么、被哪层消费、什么判据、什么预算、是否可达」 | 不实现任何读写 |
| **S1 库** | 被三方共享 | 事实源与三面（内容/经历/元）+ 时态；**保证每类信息有落点** | 不做生产/维护/消费决策 |
| **S2 生产** | **会话 → 库** | 按协议产出基础数据；**只增不改历史** | 不改写已有内容、不做整合 |
| **S3 维护** | **库 → 库** | **唯一能重写历史**：整合、提纯、纠错、遗忘、跨主题 | 不读会话原文（只吃库内材料） |
| **S4 消费** | **库 → 上下文** | 按人类三层（任务/行动/认知）分时机供给 | 不写库（除审计流） |

**板块间接口**（唯一跨界物，其余各自内部）：

| 接口 | 生产者 | 消费者 | 形态 |
|---|---|---|---|
| **内容类型契约** | S0 | S1/S2/S3/S4 | `criteria.json#contentTypes` + `src/content-types.ts` |
| **Record 事实源** | S1 | S3/S4 | `.records/records.jsonl`（kind 由契约定义） |
| **md 投影** | S2/S3 | S4 | 三索引 + notes（形态由契约定义） |
| **环记录** | S2/S3 | S4 | `.records/ring-events.jsonl`（`file=''`） |
| **审计流** | S2/S3/S4 | 面板/审计脚本 | `knowledge/audit/ledger.jsonl`（**当前唯一审计源**） |

---

## 3. 全板块共守的不变量

任一分册的实现都不得违反（违反即在验收中直接判 FAIL）：

| # | 不变量 | 守护件 |
|---|---|---|
| B1 | 依赖窄传：`Deps/Scope/Ctx` ≤12 字段，分组后每组 ≤8 | `audit-wiring`（I2 棘轮） |
| B2 | 装配函数 ≤120 行（I1，只判 export 的装配入口）；**函数跨度 ≤120 行**（`audit-fnspan` 独立棘轮，判所有函数） | 双机检 |
| B3 | composition root 唯一；**禁止新增惰性桥**（目标 0 边） | `check-bridges` |
| B4 | 判据唯一事实源 = `criteria.json`；投影禁手写 | `gen-criteria` / `check-criteria` |
| B5 | 可注入载体必须有渲染器；**P 层必须 always**（P+gated 非法） | `check-carriers` |
| B6 | 环归属只在 `RING_OF_KIND` 一处；每环必须有 KPI；**不新增环/kind** | `check-ring-coverage` |
| B7 | 行为级测试/机检必须登记 `check-runner.mjs#CHECKS`（**78 → 88 项**，2026-09-14 五阶段施工后） | 仓规则 6 |
| B8 | 零硬编码本机路径 | `check-hardcode` |
| B9 | 单库化 + 多级指针；深睡 **done 才推水位 / failed 回滚** | 运行纪律 |
| B10 | 不从零造轮子 / 零新增依赖 | 仓核心原则 |
| B11 | 每板块收尾走六条口径 | `AGENTS.md` 规则 7 |

**关键实测锚点**【实测】：`applyForgetOps` = **120/120 顶格**（I1 判它）· `mountDistillEvents` = **123 行**（I1 不判，`audit-fnspan` 判）⇒ 四个板块的**任何新逻辑都必须进新函数**，且两条线都不能涨。

---

## 4. 全板块共享的实测基线（各分册直接引用，不重复测）

| 项 | 值 | 来源 |
|---|---|---|
| 主库 Record | **1,177 条**（`prose 474`/`fact 266`/`blank 153`/`structure 146`/**`episode 81`**/`persona 28`/**`decision 14`**/`procedure 5`/**`valence 3`·`commitment 3`·`association 2`·`outcome 1`·`relation 1`**） | 【实测】 |
| 环记录 | **105 条（8.9%），全部 `file=''` 无 md 投影** | 【实测】 |
| 三索引 | MEMORY 81 指针 · USER 8 指针+20 画像 · AGENT 17 指针+15 画像 | 【实测】 |
| 审计流 | `ledger.jsonl` **1,258 条**（`mcl-step 428` · `check.sleep 126` · `write.consolidate 8` · `episode 7`） | 【实测】 |
| 冻结审计档 | `mcl-audit.jsonl` 1,120 条（`fast 26` / `slow 910` / `缺 channel 184`；`sim` ≥0.55 = 25.4%，但**实际 fast = 2.3%**） | 【实测】 |
| 结构 | **68 模块**（施工前 64）· 深度 11 · **循环 0** · `supply-assembly` 扇入 1 · `ring-supply` 扇入 2 | 【审计】 |
| 时间戳 | 1,177 条中 **83% 落在两个毫秒**（`09-13T14:26:17.892Z` 793 条 · `09-13T11:18:52.095Z` 184 条）⇒ **`createdAt` 不可作产生时间** | 【实测】 |

---

## 5. 使用方式

1. **按顺序施工**：S0 → S1 → S2 → S3 → S4。前一块未过验收，不启下一块。
2. **每块两步走**：先读该块 `-plan.md` 定方案 → 施工 → 用同块 `-acceptance.md` 验收。
3. **验收不通过即回退该块**，不影响已交付块（每块留全局热开关，缺省值 = 现状行为）。
4. **跨块问题**记入本索引 §6，不在块内私自扩范围。

---

## 6. 跨块待决登记

| # | 事项 | 影响块 | 状态（**2026-09-14 总验收复核**） |
|---|---|---|---|
| X1 | `ARCHITECTURE.md` 缺 MCL 行（`scheduler.ts:689` 有 `registerMcl`） | S1 · S4 | ✅ **已处理**（S1：补 MCL 独立注册 `scheduler.ts:689` + 独立额度 600 字符；并补深睡归属标注 `distill.ts:271`） |
| X2 | 深睡挂 `distill.ts:271` 内 ⇒ 维护链无独立入口 | S2 · S3 | ✅ **已处理**（S3-1：`enableDistill` 独立启停 + `distillEntryOf` **只断触发入口**；装配条件改 `enableDistill \|\| enableDeepSleep`） |
| X3 | 审计面跨期口径分裂（冻结档 + 现行档） | S1 · S4 | ✅ **已处理**（S1-1：`audit-source` 双源读单一实现，各消费者统一口径） |
| X4 | 数据面三份（主库/知识区/`_memory`）主从未声明 | S1 | ✅ **已处理**（S0：注册表 `roots` 三档显式声明 —— `memoryLib` 活体 / `knowledge` 活体(非记忆库) / `repoPrivate` 非活体；由 `check-content-types` 机检） |
| X5 | `supply-assembly` 被记「已接线」实则只进诊断面 | S4 | ✅ **已处理**（S4-9：新增**正面断言** `check-injection-reach` —— 抵达申报表 + 专项锁 + 反例自证；全仓首条正面门禁） |
| X6 | `episodes.jsonl` 257 条孤儿（生产者已移除，`ledger` 中 `type=episode` 仅 7） | S2 · S4 | ✅ **已决断**（S2：不补生产者；新增**一次性迁移器** `migrate-episodes.mjs` 把孤儿迁成 `episode` 记录，只读不写 legacy 流，迁完即失效） |

---

_建立 2026-09-14 · 分册索引 v1。共 9 份文档（本索引 + 4 板块 × 方案/验收）。_

---

## 7. 施工与验收记录（**2026-09-14 完成**）

| 文档 | 内容 |
|---|---|
| `S0-acceptance-record.md` | S0 协议层验收（**20 条断言全绿**） |
| `S1-acceptance-record.md` | S1 库核心验收（**19 条全绿**）+ `S1-findings`（三条订正 + N1/N2/N3） |
| `S2-acceptance-record.md` | S2 生产链条验收（**19 条全绿**；R1 通过；X6 决断） |
| `S3-acceptance-record.md` | S3 维护链条验收（**24 条全绿**）+ `S3-findings` |
| `S4-acceptance-record.md` | S4 消费链条验收（**17 ✅ / 3 ⚠️ / 3 ❌** —— 余项须产品决策或数据）+ `S4-findings` |
| **`MASTER-acceptance-record.md`** | **五阶段总验收与收尾**（六条口径全跑 + 运行态复核 + 交付台账 + 遗留 L1–L7 + 方法论收获） |

### 7.1 S4R 收尾（**先验收后施工**，2026-09-14 用户指示）

| 文档 | 内容 |
|---|---|
| `S4R-closure-plan.md` | S4 收尾方案：**渲染等价化接管**（消除两套渲染 ⇒ B2/B3/B4 转绿）+ 判据重定 + 复验方法。含 **R0 可对拍前置** |
| `S4R-closure-acceptance.md` | 对应验收方案：R0–R5 逐卡断言；**强制"先红后绿"**（凡"等价/不变"类断言首跑必须 FAIL，否则判断言无效） |

### 7.2 S4X 遗留收尾（**遗留项的唯一权威**，2026-09-14）

| 文档 | 内容 |
|---|---|
| `S4X-residual-plan.md` | 遗留盘点（L1–L8 + repo）+ 四张施工卡（X1 修 L8 / X2 L2 决策 / X3 复验入口 / X4 文档同步） |
| `S4X-residual-acceptance.md` | 对应验收方案（**先出**）；含"**差异只许出现在末尾提示行**"这条区分"有意变更 vs 回归"的限定 |
| `S4X-residual-record.md` | 施工与验收记录（X1 实证少算 20 行 · X2 决策两个都不拆 · X3/X4） |

> **遗留项以此三份为权威**：`MASTER-acceptance-record.md` §7 保留为**总验收时点的快照**（已对平并注明）。

### 7.3 待办入口（**唯一**）

| 文档 | 内容 |
|---|---|
| **`../OPEN-ITEMS.md`** | **本仓待办唯一入口**：现存 3 项待条件（D2/D4 · L1 因果 · L3）+ 已决策"不做"的结论 + 登记纪律。**任何未完成事项必须在此登记** |

### 7.4 S4Y 真机复核（2026-09-14）

| 文档 | 内容 |
|---|---|
| `S4Y-live-verification.md` | 手动触发深睡 1 轮（真实产出 3 条原则）· 审计字段真机验证（S3-3/3-4/3-5）· **`replayRecent` 口径修正**（高频 ≠ 跨日）· D1 真机验证 · 两条基线有意更新 |

**总验收结论**：五阶段施工完成；S0–S3 全绿，S4 可施工项全部完成（余项非 agent 可推进）。
六条口径全过（含 ui-geo-regress **100 PASS**、installed-sync **209 文件逐件 sha1 一致**）。
