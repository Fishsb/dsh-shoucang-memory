# S1 · 库核心方案（事实源 · 三面 · 时态）

> **板块职责**：被三链共享的事实源与落点；保证**每类信息在库里有落点**（可达性由 S0 契约声明，S1 保证"存得下、找得到"）。
> **依赖**：S0（契约）。**被依赖**：S2/S3/S4。
> **证据**：【实测】·【读码】·【审计】。

---

## 1. 现状

### 1.1 载体清单【实测】

| 载体 | 规模 | 性质 |
|---|---|---|
| `MEMORY.md` / `USER.md` / `AGENT.md` | 81 / 8+20 / 17+15 行 | md 投影（内容面） |
| `notes/*.md` | 8 文件 · 99,995 B | 详情层 |
| `.records/records.jsonl` | **1,177 条** · 511 KB | **Record 事实源** |
| `.records/ring-events.jsonl` | 28 行 | 环事件流 |
| `audit/activity.jsonl`（主库） | 9,754 B | 冷热统计 |
| `knowledge/audit/*.jsonl`（知识区） | `ledger` 1,258 · `distill-audit` · `episodes` · **`mcl-audit`（冻结）** | 审计面 |

### 1.2 五处缺口（对应索引 §6 跨块待决）

| # | 缺口 | 证据 | 后果 |
|---|---|---|---|
| **X1** | `ARCHITECTURE.md` 缺 MCL 行 | 【文档】`ARCHITECTURE.md:41-43` 只有 M6/M7/M8；`scheduler.ts:689` 有 `registerMcl` | 产线视图与代码不同构 |
| **X3** | 审计面跨期口径分裂 | 冻结 `mcl-audit.jsonl` 1,120 条 vs 现行 `ledger.jsonl` 1,258 条 | 跨期统计须先合流，否则双计 |
| **X4** | 数据面三份主从未声明 | 主库 / `knowledge/` / `_memory/`（内容不同） | "哪份是活体"靠代码推（`memoryRootOf` vs `knowledgeRoot`） |
| **G6** | 同上（人读不可判） | 【实测】三处索引标签分布不同 | 用户/维护者无法凭文档判断 |
| **G9** | `mcl-audit` 缺 `channel` 184 条（16.4%） | 【实测】 | 历史分流质量无法完整回算（但已非当前源） |

---

## 2. 目标：三面 + 时态显式化

### 2.1 三面模型（与 S0 契约对齐）

| 面 | 成员 | 载体形态 | 由谁写 | 被谁读 |
|---|---|---|---|---|
| **内容面** | `fact` · `procedure` · `persona` · notes 正文 | md 投影（三索引 + notes） | S2/S3 | S4 |
| **经历面** | `episode` · `decision` · `outcome` · `valence` · `relation` · `commitment` · `association` | **环记录（`file=''`）** | S2/S3 | S4 |
| **元面** | `ledger.jsonl` 事件流 · `activity.jsonl` 统计 | jsonl | S2/S3/S4 | 面板/审计（**不进上下文**） |
| **时态**（正交） | 任意记录的 `validFrom/validTo` | —— | S2/S3 | `fact-ring#isLive`（**已单一实现**） |

**关键澄清**：三面**不是新的存储结构**——数据已在（`records.jsonl` 1,177 条 + 环 105 条）。本板块做的是**把面归属显式化并机检**：任一 Record 的 kind 必须能映射到唯一一面（由 S0 契约的 `projection` 字段决定）。

### 2.2 单一实现收口

| 能力 | 现状 | 目标 |
|---|---|---|
| Record 读写 | `record-store.ts`（事实源） | 保持唯一 |
| md↔Record 双写 | `record-shadow.ts` | 保持唯一；**所有写入必须经它**（当前深睡曾绕过，见 `context-supply-plan` §51） |
| 环事件 | `ring-events.ts`（9 op 可重放） | 保持唯一 |
| 时态判定 | `fact-ring#isLive` | 保持唯一 |

---

## 3. 施工卡

| 步 | 动作 | 落点 | 约束 |
|---|---|---|---|
| **S1-1** | **审计面合流（X3/G9）**：冻结档与现行档的跨期统计口径固定；一份命令出全域指标 | 新 `scripts/audit-merge.mjs`（登记） | **不迁移数据**（只读合并口径）；`mcl-audit` 保持冻结不动 |
| **S1-2** | **数据面去歧义（X4/G6）**：三处索引的主从关系写进注册表；面板显示"当前活体根" | `criteria.json` + `targets.ts` 注释 + `panel-config` | **零新依赖**；`_memory/` 与主库的关系须实测确认后再写 ⚠️ |
| **S1-3** | **架构文档对齐（X1）**：补 MCL 行、标深睡归属、复核模块数 | `docs/ARCHITECTURE.md` | 模块数由 `check-arch-sync` 机检（**当前 63 三方一致**）；本节改完须复跑 |
| **S1-4** | **面归属机检**：任一 Record 的 kind → 唯一面 | 并入 S0 的 `check-content-types` | 不新开脚本（避免堆叠） |
| **S1-5** | **写入收口核查**：确认所有写面都经 `record-shadow` | 只读核查 + 机检 | 若发现旁路（如深睡曾绕过），**记入 S3 处理**，不在本板块修 |

**I1/I2 警示**：`applyForgetOps` 120/120 顶格 ⇒ S1 各步的新逻辑进**新函数**。

---

## 4. 边界（S1 不做什么）

| 不做 | 归属 |
|---|---|
| 决定"什么内容该产" | S2 |
| 决定"如何整合/提纯/遗忘" | S3 |
| 决定"何时注入给谁" | S4 |
| 修改水位语义 | S2/S3（S1 只保证落点） |

---

## 5. 验收方案

见 **`S1-library-acceptance.md`**。

---

_建立 2026-09-14 · S1 方案 v1。_
