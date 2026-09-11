# 蒸馏链路健康检查（第二轮 · 重启后复检）

**日期**：2026-09-11
**工作流**：工作流 1「综合代码审查」+ 工作流 5「技术债评估」的混合形态（健康检查）
**参与成员**：Cody（代码审查师）· Rex（SRE 工程师）· Tessa（测试专家）· Docu（技术文档师）

> **触发**：用户「检查项目的蒸馏链路」。上一轮检查（同日 08:30–13:00）产出了 5 项发现与 2 项 🟠 遗留。
> **本轮定位**：在 **dsh-web 18:56 重启 + 插件升 0.9.2 + 并发会话多次改动**之后做**独立复检**，重点验证遗留项状态与是否引入回归。
> **链路范围**：事件采集 → 预筛 → 判据裁决 → 分层蒸馏 → 深睡结构 FSM。

---

## 📌 TL;DR（执行摘要）

- **整体结论：🟢 链路健康在线，无阻塞项。** 全部质量门通过、全部台账活跃写入、判据投影零漂移。
- **活跃性铁证**：六个审计台账最后写入均为 **10:57–10:59 UTC（= 18:57–18:59 本地）**，即**重启后 1–3 分钟内**，无静默停摆。
- **严重度分布**：🔴 0 项 / 🟠 1 项 / 🟡 3 项 / 🟢 3 项。
- **遗留项变化**：台账分叉 **🟠 → 🟡 部分修复**（数据层+代码层已统一，孑余文档 2 行 + 僵尸文件）；MCL 慢通道 **🟠 仍存在**（但确认为**设计内有界**，非死锁）。
- **本轮新发现**：① `notes/tools.md` 悬空指针 🔴（Docu 发现，我已复核确认）；② `shadowCorr` 全为负值且持续恶化 🟡；③ 退役节点悬空指针（重启时发现，🟡）。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟢 **通过**（链路健康，无阻塞） |
| 阻塞项数量 | 0 |
| 机检门 | ✅ 6/6 全过 |
| 单测 | ✅ **90 PASS / 0 FAIL**（24+30+18+18，与基线一致，**无回归**） |
| 部署同步 | ✅ **15/15** `lib/` ↔ 安装副本 sha1 一致 |
| 判据投影 | ✅ 重生成**字节级零漂移**（`a6775e4e4423` → `a6775e4e4423`） |
| 关键行动项 | 4 条（2 条 P1） |
| 建议下一步 | 先修 `notes/tools.md` 悬空指针（1 行），再收口文档口径 2 行 |

---

## 🔍 审查发现（按严重度排序）

| # | 严重度 | 类别 | 文件:行 | 问题描述 | 建议修复 | 来源 |
|---|--------|------|---------|---------|---------|------|
| 1 | 🔴严重 | 结构完整性 | `MEMORY.md:47` → `notes/tools.md` | **悬空指针**：`[tool] 专家市场安装 … → notes/tools.md §专家市场`，但 `notes/tools.md` **无 `专家市场` 章节**（全文 8 个 `##` 章节，无此项）。索引指向不存在的位置 | 在 `tools.md` 补 `## 专家市场` 章节，或把 `MEMORY.md:47` 的指针改指实际落点 | Docu（我已复核确认） |
| 2 | 🟠高 | 活性/合规 | `src/mcl.ts:244-254` | **MCL 慢通道合规失效仍存在**：`mcl-audit.jsonl` 中 `mcl-step` 共 **121 条**，其中 **`compliant:false` 89 条**（另 32 条无该字段）。最新仍为慢通道未引用主题（`sid=3f75a0ad` step 1 / `sim=0.622`）。阈值 `familiarThreshold=0.65`（`scheduler.ts:643`）未调整 | 复核阈值是否偏高致慢通道泛滥；确认「无升级/退出」是否有意为之 | Rex |
| 3 | 🟡中 | 文档一致性 | `skill/engine/distill-contract.md:115`<br>`memory-whitelist-spec.md:349` | **文档口径孑余**：L10/L21 已声明统一台账为 `audit/ledger.jsonl`，但 **L115 仍写 `judgement-ledger.jsonl`**。⚠️ 注意：`criteria.json:578` 有**显式登记的 `legacyLedger` 别名**（正名 `judgement.ledger="audit/ledger.jsonl"`），故「保留旧名兼容」是**有意设计**——只需改文档 2 行，**registry 别名保留** | 改这 2 行文档即可（方案 a） | Rex + Cody（双方收敛） |
| 4 | 🟡中 | 遗留数据 | `audit/judgement-ledger.jsonl` | **僵尸文件未清理**：6 行、`criteriaVersion:"v2.0.0"`、时间戳**全锁死** `05:49:31.3xxZ`（本地 13:49），此后零追加。是 v2.1 M2 写入端迁移前的**一次性封存批次** | 明确其处置：保留为只读兼容锚点，或归档 | Rex |
| 5 | 🟡中 | 评分质量 | `scripts/shadow-sim.mjs:135` | **`shadowCorr` 全为负且恶化**：今日 20 次自检中 `corrImpRel` 稳定为负（−0.2546 → **−0.2699**），即 importance 与 relevance **反相关**且有加重趋势。当前不阻断（`flipScoreWeights` 门槛是 `\|corr\|≤0.9`，负值也过） | 需人工研判：负相关是否属预期（R-2 设计：分量冗余才删；负相关语义另论） | 主理人（自检趋势分析） |
| 6 | 🟢低 | 治理结构 | `.internal/arch-model.json`（PN-F09） | **退役节点悬空指针**：`feature:pn-f09` 已 retire（seq 134），但仍挂 `project-nav/core/boundary.js`（已删）。`model.stale=[]` 未捕获（退役节点被排除），三处皆不可见 | `nav_node target=PN-F09 files=` 清空落点 | 主理人（重启时发现） |
| 7 | 🟢低 | 文档时效 | `notes/tools.md:40` | **自述与事实不符**：章节标题写「记忆脚本（2026-09-11 补记 · **修悬空指针**）」，但同文件仍缺 `专家市场` 落点（见 #1）——该「修补」未覆盖此指针 | 随 #1 一并修 | Docu |
| 8 | 🟢低 | 设计内行为 | `distill-audit.jsonl` | `workspace 反解失败 → 降级 pending` 与 `below-min-chars` 两类记录：**经核实属设计内行为，非缺陷** | 无需修复；已在文档中标注 | Docu |

---

## 🏗️ 活性与一致性验证（逐项实测）

### 1. 台账写入活性 —— ✅ 全部活跃

| 台账 | 行数 | 最后写入（UTC） | 本地 | 状态 |
|------|------|----------------|------|------|
| `distill-audit.jsonl` | 742 | 10:57:21.965 | 18:57 | ✅ |
| `ledger.jsonl` | 78 | 10:59:19.704 | 18:59 | ✅ |
| `episodes.jsonl` | 185 | 10:57:21.966 | 18:57 | ✅ |
| `score-shadow.jsonl` | 74 | 10:57:18.051 | 18:57 | ✅ |
| `distill-watermark.jsonl` | 393 | 18:57 | 18:57 | ✅ |
| `mcl-audit.jsonl` | 162 | 10:44:45.776 | 18:44 | ✅ |
| `judgement-ledger.jsonl` | 6 | 05:49:31.409 | 13:49 | ⚠️ 僵尸（见 #4） |

> **判定**：dsh-web 于 **18:56** 重启，六个台账在 **18:57–18:59** 即恢复写入 —— **重启后 1–3 分钟内链路已重新运转，无静默停摆。**

### 2. 判据投影一致性 —— ✅ 零漂移

```
before: a6775e4e4423
after : a6775e4e4423   ← 重跑 scripts/gen-criteria 后
✅ NO DRIFT (byte-identical)
```
`scheduler.ts:643` 的 `familiarThreshold=0.65` 与 `criteria.generated.ts:165` 的声明一致，证明投影未被手写篡改。

### 3. 机检门 —— ✅ 6/6 全过

| 门 | 结果 |
|---|---|
| `check-criteria` | ✅ exit 0 |
| `check-hardcode` | ✅ exit 0（零硬编码红线守住） |
| `check-carriers` | ✅ exit 0 |
| `check-field-usage` | ✅ exit 0 |
| `check-runner` | ✅ exit 0 |
| `check-deploy-sync` | ✅ exit 0 |

### 4. 单测 —— ✅ 90 PASS / 0 FAIL（无回归）

| 套件 | PASS | FAIL |
|------|------|------|
| `test-layering` | 24 | 0 |
| `test-forgetops` | 30 | 0 |
| `test-treeops-split` | 18 | 0 |
| `test-mcl` | 18 | 0 |
| **合计** | **90** | **0** |

与上轮基线 **90 PASS / 0 FAIL 完全一致 → 无回归。**

### 5. 部署同步 —— ✅ 15/15

`lib/*.js` ↔ `~/.dsh/profiles/web/node_modules/dsh-shoucang-memory/lib/`：**SAME=15, DIFF=0, MISSING=0**。

### 6. 自检总判定 —— ✅ ok

`selfcheck-latest.json`（10:59:19.704Z）：`verdict: "ok"`，`failed: []`，六项检测全 `pass`（criteria / carriers / layering / maturation / shadow / reconcile）。

---

## 🧪 测试覆盖评估

- **覆盖充分**：四套单测覆盖分层（layering）、遗忘（forgetops）、树操作分片（treeops-split）、认知环（mcl）四个关键面，90 断言全绿。
- **缺口（已知）**：深睡状态机的**破坏性容错**未在真库实测（守「数据先问」红线，未做故障注入）——上轮已标注，本轮维持。
- **`shadowCorr` 负值**（#5）提示**评分质量**层面存在未被测试覆盖的语义问题：单测全绿但指标反相关，说明现有测试**未覆盖评分方向性**。建议补一条「相关方向」断言。

---

## 🚦 遗留项状态对照（上轮 → 本轮）

| 上轮发现 | 上轮定级 | 本轮实测 | 本轮定级 |
|---|---|---|---|
| MCL 慢通道合规失效（159 条 `compliant:false`） | 🟠 | **121 条 `mcl-step` / 89 条 `compliant:false`**；`mcl.ts` 今日无提交；`maxNudges=1` 有界（**非死锁**） | 🟠 **仍存在**（澄清：设计内有界） |
| 台账口径分叉（58 vs 6 行） | 🟠 | 数据层统一（`ledger.jsonl` 78 行 / v2.2.0 活跃）+ 代码层统一（写入端单一、读取端全兼容）；孑余**文档 2 行** + 僵尸文件 | 🟡 **部分修复** |
| 深睡状态机三连证据 | 🟢 | `selfcheck` `verdict:ok`；`maturationReady:false`（拦阻率过高，属**设计内不翻**） | 🟢 正常 |

### 关键澄清（防误读）

- **`mcl-step compliant:false` 不是故障**：`mcl.ts:12` 明示「最多再引导 `maxNudges`（缺省 1），**绝不死锁**」——有界再引导是设计。问题是**合规率长期为 0** 这一现象值得研判（阈值是否偏高），**而非**「机制坏了」。
- **「scheduler 写入 judgement-ledger」一说经双方复核不存在**：`src/` 三处 `judgement-ledger` 引用**全非写入**（`distill.ts:277` 注释 / `panel.ts:1246` 注释 / `panel.ts:1248-1249` 只读 fallback）；`scheduler.ts` **零命中**。唯一台账写入器是 `distill.ts:397-404` 的 `ledger()` → `audit/ledger.jsonl`。**两位专家已独立复现收敛，无分歧。**
- **`legacyLedger` 别名是有意设计**：`criteria.json:578` 显式登记 `"legacyLedger":"audit/judgement-ledger.jsonl"`，与正名 `judgement.ledger="audit/ledger.jsonl"` 并存 ⇒ 「保留旧名做兼容」**非遗漏**，故只需改文档，**不该动 registry**。
- **`maturationReady:false` 属设计内**：拦阻率过高时**不翻**成熟度门（`shadow-sim.mjs:146` 明示「enforce=true 会拦掉绝大多数升格 ⇒ **不翻**（过早）」）——是**护栏生效**，不是故障。
- **`workspace 反解失败 → 降级 pending` / `below-min-chars`**：经核实**属设计内行为，非缺陷**（Docu 已裁定）。

---

## 🔧 修复记录（2026-09-11 同日执行 · 已复核）

用户拍板后，两条 P1 已修复。

### 修复 1：`MEMORY.md:47` 悬空指针

| 项 | 内容 |
|---|---|
| 根因 | 蒸馏 `6ba51f20` **一次产出两行**（`INDEX.md:149 专家市场安装` + `:150 WorkBuddy 专家安装`，同一事实），内容只写进 `env.md` 一份，却**登记了两个指针** ⇒ 一条永久悬空、该主题**检索期不可达** |
| 修法 | 按 INDEX 既有的「索引合并」惯例，L47 指针**改指真实落点** `notes/env.md §WorkBuddy 与多 Agent` |
| 实测 | 全库 47 条指针行：修复前 **1 条不可解析** → 修复后 **全部解析** |
| 校验脚本 | 逐行解析 `notes/<file>.md §小节` 并对 `notes/*.md` 章节头（含 `§A/§B` 复合形）比对 |

> 侧面证据：`notes/INDEX.md:149` 标注该行「蒸馏 6ba51f20 新增」——**是蒸馏流程产出的指针，不是历史遗留**。这解释了为何 `MEMORY.md:47` 与 `:48` 描述同一事实却各自成行。

### 修复 2：台账文档口径 2 行

| 文件:行 | 修改前 | 修改后 |
|---|---|---|
| `skill/engine/distill-contract.md:115` | 正名写作 `judgement-ledger.jsonl` | 改为 `audit/ledger.jsonl` + 标注旧名仅只读兼容 |
| `skill/memory-whitelist-spec.md:349` | 同上 | 同上 |

**有意保留（未动）**：
- `criteria.json:578` 的 `"legacyLedger": "audit/judgement-ledger.jsonl"` —— **登记别名，有意设计**（`judgement.ledger` 正名 + `legacyLedger` 兼容并存）
- `skill/scripts/recall-eval.mjs:106` 的 `'judgement-ledger'` —— 自指词表关键词，本就正确

**仓 ↔ 生产库双份同步**（两份本为镜像）：修后 sha1 仍一致 —— `distill-contract.md` `71bdcb6c70` / `memory-whitelist-spec.md` `3e3b74293e`。

### 修复后验证

| 检查项 | 结果 |
|---|---|
| 指针解析 | ✅ **47/47 全解析**（0 悬空） |
| 仓↔库文档同步 | ✅ 两文件 sha1 一致 |
| registry 别名 | ✅ `legacyLedger` 完整保留 |
| `check-criteria` | ✅ exit 0 |
| `check-carriers` | ✅ exit 0 |
| `check-hardcode` | ✅ exit 0 |
| `check-field-usage` | ✅ exit 0 |
| `check-runner` | ✅ exit 0 |
| `check-deploy-sync` | ✅ exit 0 |
| `check-changelog` | ✅ 结构正常（148 条） |
| CHANGELOG | ✅ 已按项目规则 #4 记入 `[Unreleased] / ### Fixed` |
| **代码改动** | **零**（仅文档 + 索引指针；未动 registry、未动 src） |

---

## ✅ 行动清单（按优先级排序，含执行后状态）

| # | 行动 | 负责角色 | 紧急度 | 状态 |
|---|------|---------|--------|------|
| 1 | 修 `notes/tools.md` 悬空指针 → 改指 `env.md §WorkBuddy 与多 Agent` | 主理人 | P1 | ✅ **已完成** |
| 2 | 收口台账文档 2 行（`distill-contract.md:115` + `memory-whitelist-spec.md:349`），**registry 别名保留** | 主理人 | P1 | ✅ **已完成** |
| 3 | 研判 MCL 合规率长期为 0：复核 `familiarThreshold=0.65` 是否偏高、是否需降阈或补「慢通道退出」观测 | 人 + Rex | P2 | ⬜ 待办 |
| 4 | 处置 `judgement-ledger.jsonl` 僵尸（6 行封存批次）：明确保留为只读兼容锚点 or 归档 | 人 | P2 | ⬜ 待办 |
| 5 | 研判 `shadowCorr` 持续负值（−0.270）是否属预期；若否则补评分方向性测试 | 人 + Tessa | P2 | ⬜ 待办 |
| 6 | 清 `PN-F09` 退役悬空指针（`nav_node target=PN-F09 files=`） | 人拍板 → 主理人 | P2 | ⬜ 待办 |

---

## ⚠️ 待完善 / 已知局限

- **未做破坏性验证**：全程只读核查（跑测试与机检是允许的，但未改源文件、未做故障注入）。守「数据先问」红线。
- **`shadowCorr` 负值的语义裁定未完成**：我确认了数值与趋势（稳定负相关且恶化），但**未判定其是否为设计预期**——`shadow-sim.mjs:135` 的门槛只约束 `|corr|≤0.9`（对负值一视同仁），而 `R-2` 条款针对的是「冗余（高正相关）」。**负相关**的语义需产品侧研判，我未越权下结论。
- **`mcl-step` 的 32 条无 `compliant` 字段记录**：原因未深究（可能是首步注入路径 `mcl.ts:231` 不写该字段，属正常），未计入 `false` 统计。
- **`judgement-ledger.jsonl` 的封存批次时间戳**（`05:49:31.3xxZ`）为 UTC，本地为 13:49，与上轮观察一致。
- **本轮未检查 `panel.ts` HTTP 端点面**（上轮遇 `unauthorized` 的 `/health`、`/targets`），改用 `selfcheck-latest.json` 作为等价健康信号。

---

## 📚 数据来源 & 成员产出索引

- **Cody（代码审查师）· Task #1**：六门机检实测、判据投影重生成比对（`a6775e4e4423` 零漂移）、六台账活性时间戳、`compliant:false` 计数（89/121）、`criteria.json:578` `legacyLedger` 别名发现。
- **Rex（SRE 工程师）· Task #6**：台账双轨逐项复核、`judgement-ledger.jsonl` 僵尸批次实测（6 行 / `v2.0.0` / 时间戳锁死）、`distill-contract.md` L10/L21/L115 确切行内容、`grep` 全仓引用路径（三处全非写入）、与 Cody 的独立复现与分歧收敛。
- **Tessa（测试专家）· Task #7**：四套单测复跑（24+30+18+18 = **90 PASS / 0 FAIL**）、`npm run typecheck` 零错、`lib/`↔安装副本 sha1 全量比对（**15/15**）、无回归判定。
- **Docu（技术文档师）· Task #8**：活库产物新鲜度（`MEMORY.md` 5384B / `USER.md` 2364B / `AGENT.md` 2152B，均 18:36 更新）、`notes/` 结构（8 章节）、`pending/` 积压、`treeops.ts` 不变量实现与测试覆盖、**`notes/tools.md §专家市场` 悬空指针发现**、设计内行为裁定。
- **主理人**：独立复核（判据投影、六门、四单测、部署同步 15/15）、`notes/tools.md` 悬空指针交叉确认、`shadowCorr` 趋势分析（20 次自检）、`PN-F09` 退役悬空指针发现、本报告汇编。

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
