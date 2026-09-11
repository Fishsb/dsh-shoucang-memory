# 治理方案审查报告（D:\FF 工作区治理体系）

**日期**：2026-09-11
**审查对象**：`D:\FF` 工作区治理方案 —— 含治理纪律文本（`AGENTS.md` / `PROJECT.md`）、治理底座 `project-nav`（v0.9.1，新架构）、历史遗留 `pmg` 移除落法
**审查方式**：实跑测试 + 事件流取证 + 配置核对 + 磁盘实况比对
**审查人**：默认角色（前任 Expert 角色已取消，本报告以独立视角复核）
**修复状态**：✅ 发现 1 与发现 2 已修复并复核（见「六、修复记录」）

---

## 📌 TL;DR

- **整体结论**：治理方案**架构设计扎实、可机检程度高**。审查中发现的两项高风险（纪律文本工具名过时、覆盖面未声明）**已于本次修复**。
- 新架构（事件流 + 三不变式）经 `npm test` **22 PASS / 0 FAIL** 实测（修复后复跑仍 22/22），I1/I2/I3 三条不变式**均有可机检用例**，F1–F9 九条事故事实**可逐条追溯到测试**——这是同类治理方案里罕见的高标准。
- `pmg` 移除落法**已完整执行**：磁盘无残留、索引无残留、退役语义生效。
- 核心风险不是「治理做不到」，而是「**治理的边界没有说清**」——文本层面看起来全局覆盖，实际只覆盖 `project-nav` 一个项目。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟢 **通过**（两项高风险已修复，架构优秀） |
| 阻塞项数量 | **0** |
| 关键问题 | 2 项已修复 · 1 项待确认（备份留存策略） |
| 建议下一步 | 后续再动治理文档时，按新的六工具口径维护；考虑把 `project-nav/AGENTS.md` 的表达范式上行 |

---

## 一、治理体系现状（实况，非文档转述）

治理栈在 2026-09-10/11 发生了**架构换代**，理解现状必须分开看两代：

| 代际 | 形态 | 现状 |
|------|------|------|
| 旧 | `nav_*` 工具 + `nav-index.json` / `nav-actions.json` / `nav-arch.json` | **已迁移归档**至 `.internal/legacy/`（只读快照，无读路径） |
| 新 | `@dsh-external/project-nav` v0.9.1 · 事件流 + 折叠模型 + 六闸 + 三投影 | **现行**，`.internal/events.jsonl` 133 行、`.internal/runtime/arch-model.json` 465 KB |

**事件流实测**（`.internal/events.jsonl`）：

```
规模     133 行（seq 1–133，严格连续）
时间跨度 2026-09-11T01:44 → 08:13
事件分布 node 65 · commit 43 · decide 24 · file 6 · arch-doc 2 · set 1 · feature 1
```

**已登记项目**（4 个，均为 `layer=project` / `status=active`）：

| id / name | path |
|---|---|
| prompt-enhancer | deepseek/prompt-enhancer-release |
| shoucang | shoucang |
| dsh-dev-docs | deepseek/dsh-dev-docs |
| **PN-P01** | **project-nav** |

---

## 二、核心发现

### 🟠 高 · 发现 1：治理纪律文本仍在描述已被替换的旧工具链

`D:\FF\AGENTS.md` 的「治理先行」节完整保留了旧 `nav_*` 工序：

```
1. nav_plan 登记：task + plan + scope + anchor
2. nav_plan 返回的「Reference docs」...
3. 动手前用一句话回答 arch=
4. nav_mark begin 标记开工
6. nav_mark done 标记完结
9. nav_update target=<标识> retire=true
```

但实测新架构的工具面**恰好 6 个**，且旧工具名**不再注册**：

```
ok - A6 工具面 = 6 个工具，且一个不少
ok - A6 旧工具名不再出现在工具注册里（描述里提及历史是允许的，注册不行）
```

现行工具为 `nav_node` / `nav_commit` / `nav_decide` / `nav_set` / `nav_graph` / `nav_render`。

**问题**：`AGENTS.md` 是 agent 的**开工必读**文件，按它写的 `nav_plan` / `nav_mark` / `nav_update` **已不存在**。新入场的 agent 会先撞一排「工具不存在」，再自行摸索正确工序——而这正是治理方案最想避免的「靠猜」。

**建议**：把「治理先行」工序链改写为现行六工具的正确序列。对照测试用例可反推出正确流程：`nav_commit`（登记意图，含锚点/scope/arch=）→ 改 → 自动收口（`A1 收口不依赖会话`）→ `nav_render`（投影）。`nav_plan` 的「计划」语义已并入 `nav_commit`；`nav_mark begin/done` 的「开工/完结」已由「自动收口」取代。

### 🟠 高 · 发现 2：治理覆盖面未声明，文本读起来像全局强制

`D:\FF\AGENTS.md` 开头写「**任何改动必走**」治理节拍，末尾「治理边界」表列出 5 个项目，但**没有说明当前实际只治理 1 个**。

实测边界配置（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
autoBindWorkspace: true
boundaryWorkspaces: 'project-nav'    # 白名单只有一项
```

配套注释已明确设计意图：

> boundaryWorkspaces 是被治理工作区的 opt-in 白名单：空 = 不治理任何工作区（安全默认）。
> 本机只开 project-nav（自包含：改的是本仓代码）；**shoucang 等仍不绑，主线记忆工作不受影响**。

**实测佐证**（`.internal/boundary-diag.json`，19 条会话记录）：`D:\FF\shoucang` 与 `D:\lk\FF` 的决策**全部为 `not-governed`**。

**判定**：这**是设计内行为，不是缺陷**（边界逻辑与测试均正确，`governedWorkspaceOf` 经 3 类写法验证）。真正的问题是**认知风险**：
- `AGENTS.md` 通篇的强制语气 + 「治理边界」表列了 5 个项目 ⇒ 读者（含 agent）会默认「5 个项目都被治理」；
- 实际只有 `project-nav` 一个被沙箱绑定，其余 4 个的改动**不会被闸门拦截**；
- 而 `shoucang/AGENTS.md`（仓级自约束）才是它的真实约束来源——两套纪律并存但**没有交叉说明**。

**建议**：在 `D:\FF\AGENTS.md` 的「治理边界」表增加**「当前是否沙箱绑定」列**，明确标注 `project-nav` = ✅ 已绑定（六闸强制）、其余 = ⬜ 未绑定（仅文本约定）。这样「为什么没被拦」就不会被误读为「治理失效」。

### 🟡 中 · 发现 3：`pmg` 移除落法已完整执行（确认无残留）

三份 devref 事实卡记录了 pmg 移除的落法争议（「nav 无删除能力」「索引误记路径」「假 STALE」）。实测复核结论——**全部已落地**：

| 核验项 | 实测结果 |
|---|---|
| 磁盘物理文件 `*pmg*` | **无**（`find` 零命中） |
| legacy 索引中 `pmg` 残留 | **0 处**（`grep -c` = 0） |
| 退役语义 | 生效——测试 `ok 10 - 退役让假 STALE 归零（F3/F8：索引能删才不会永远报漂移）` |
| 备份留存 | 4 份 `nav-index.json.bak-*-pmg-*` + `nav-index.json.bak-partial-pmg-20260910` 保留可查 |

**判定**：F3/F8（假警报腐蚀信号、索引能增不能删）在新架构里已有机制级解法 + 测试固化。历史遗留的「永久假 STALE」风险已闭环。

### 🟡 中 · 发现 4：治理文本中的路径引用失效

`D:\FF\AGENTS.md` 引用的若干路径在当前文件系统中不存在：

- `nav-index.json`（文档称在工作区根）——**实测根目录无此文件**，实际已迁至 `.internal/legacy/nav-index.json`（只读归档）
- `modules/pmg.md`（事实卡提及）——**已删除**
- `D:\FF/AGENTS.md` L39/40 过期（事实卡自述）——**待复核，见「待确认」**

**建议**：把路径引用统一改为现行位置，或改为「由 `nav_graph` 查询」而不写死路径。

### 🟢 低 · 发现 5：`project-nav` 仓自有纪律是本次审查中最规范的一份

`project-nav/AGENTS.md` 质量显著高于工作区级：

- **三条不变式列为硬约束**并给出「违规的样子」反面样本（这是可教学的写法）
- **已知边界表**含 9 条实测踩坑（PS 5.1 GBK 误读、profile 不能跑 npm、`spawn EPERM` 应对等），全部标注「别重复踩」
- **版本规则**写明「唯一例外：架构换代」，并指明已发生的例外 `0.8.6 → 0.9.0`
- **发布链**点破「装与重启是两条时间线」这一静默回退事故源

**建议**：把这份的写法（不变式 + 违规样本 + 实测边界表）**上行**到 `D:\FF\AGENTS.md`，作为工作区级纪律的表达范式。

---

## 三、治理方案的机制质量评估（实测）

| 维度 | 证据 | 评级 |
|---|---|---|
| **三不变式可机检** | I1（复算==缓存 / 事件流唯一事实源 / seq 完整性）、I2（标记区重渲染 / 手改覆盖 / 找不到标记拒绝 / 投影可生成）、I3（删 runtime 零损失 / 在途文件可丢）**均有独立用例** | ⭐⭐⭐⭐⭐ |
| **F1–F9 可追溯** | F1 并发追加、F2 破锁 token、F3/F8 退役、F4 scope 三来源、F9 写回校验——**逐条有对应测试** | ⭐⭐⭐⭐⭐ |
| **六闸为纯查询** | `gates.js` 六闸全部是对模型的纯函数查询，不持有状态 ⇒ 「会话只能驱动自己的动作」报错消失 | ⭐⭐⭐⭐⭐ |
| **单源/平面契约** | 「长期资产只有一个事件流文件（数据面 7 → 3）」「迁移后不存在第二真相」有测试 | ⭐⭐⭐⭐⭐ |
| **失败显式化** | 「坏行不被静默丢弃」「写回校验失败必抛错」「scope 解析失败显式化」——**系统性消除静默兜底** | ⭐⭐⭐⭐⭐ |
| **测试规模** | `npm test` 22 项（含 concurrency/architecture/host 三组）+ 大量子断言，**22 PASS / 0 FAIL** | ⭐⭐⭐⭐⭐ |
| **文本与实现对齐** | 工作区级 `AGENTS.md` 工序链仍是旧工具名（发现 1）；覆盖范围未声明（发现 2） | ⭐⭐ |

---

## ✅ 行动清单

| # | 行动 | 紧急度 | 理由 |
|---|------|--------|------|
| 1 | 把 `D:\FF\AGENTS.md`「治理先行」工序链改写为现行六工具序列（`nav_commit` 登记 → 改 → 自动收口 → `nav_render`） | P0 | 开工必读文件写着不存在的工具，直接损毁治理可用性 |
| 2 | 在「治理边界」表增加「沙箱绑定」列，标注 `project-nav` ✅ / 其余 ⬜ | P0 | 防止把 `not-governed` 误读为治理失效 |
| 3 | 修正 `AGENTS.md` 中的失效路径（`nav-index.json` → `nav_graph` 查询或 `.internal/legacy/`） | P1 | 减少无效检索 |
| 4 | 把 `project-nav/AGENTS.md` 的「不变式 + 违规样本 + 实测边界表」范式上行到工作区级 | P2 | 提升工作区纪律可教学性 |
| 5 | 复核事实卡自述的「`D:\FF/AGENTS.md` L39/40 过期」是否仍成立 | P2 | 见「待确认」 |

---

## ⚠️ 待完善 / 已知局限

- **未做破坏性验证**：未实际触发六闸拦截、未构造并发写入、未删 `runtime/` 实测 I3——这些由 `npm test` 22 项覆盖，属间接验证。
- **未核验沙箱后端实时状态**：`boundary-diag.json` 显示探针 PASS（`attempt 1, trigger=boot, exitCode=0`）。经查 `host/index.js:98 probeBoundary()`，该探针是**沙箱后端能力探针**（验证能否创建受限令牌 runner），非工作区路径判定 —— 故探针 `cwd` 记作 `D:\lk\FF` 属 harness 细节，**不影响边界判定正确性**（该项已澄清，非风险）。
- **待确认项（2 条，未下结论）**：
  1. （已澄清）~~探针 `cwd: D:\lk\FF` 是否影响边界判定~~ → 属能力探针，非路径判定
  2. 事实卡提及的「`D:\FF/AGENTS.md` L39/40 过期」——本次读取的 AGENTS.md 未见明显 L39/40 问题，**可能已修**，需对照历史版本
  3. `.internal/backups/` 与 4 份 pmg 备份的留存策略未明确（是否设 TTL）
  2. 事实卡提及的「`D:\FF/AGENTS.md` L39/40 过期」——本次读取的 AGENTS.md 未见明显 L39/40 问题，**可能已修**，需对照历史版本
  3. `.internal/backups/` 与 4 份 pmg 备份的留存策略未明确（是否设 TTL）
- **审查范围**：本报告只审「治理方案」本身（纪律文本 + 底座机制 + pmg 落法），**不含** `shoucang` 记忆链的技术审查（已另出报告）。

---

## 六、修复记录（2026-09-11）

### ✅ 发现 1 已修：`AGENTS.md` 工序链改写为现行六工具

**文件**：`D:\FF\AGENTS.md`（65 行，原文 59 行）

| 旧（已失效） | 新（现行） |
|---|---|
| `nav_plan`（登记 task+plan+scope+anchor） | **`nav_commit`**（task + anchor + features/modules/files） |
| `nav_query` + `nav_status` | **`nav_graph mode=health`** + **`nav_graph <目标>`**（mode=task） |
| `nav_docs` | **`nav_graph mode=docs target="<任务描述>"`** |
| `nav_adr` | **`nav_decide`** |
| `nav_mark begin` / `nav_mark done` | **已移除** —— 收口改为「证据一变，下次任意调用自动收口」 |
| `nav_update ... retire=true` | **`nav_node target=<标识> retire=true`** |
| `nav_sync_docs` | **`nav_render`** |
| `nav_set_vector` | **`nav_set`** |

同时按实测补入此前未记录的机制细节：
- 六闸名称与顺序（锚点闸 → 范围闸 → 主线闸 → 计数闸 → 决策闸 → 完结闸）
- 计数闸阈值 **3** 为「拒」、`threshold-1` 为「告警」（源码 `REPEAT_PATCH_THRESHOLD = 3`）
- `arch=` 缺失**只告警不阻断**（源码 `decisionGate`）
- 退役级联的确切语义（feature 摘映射 / module 摘成员 / project 摘模块，**均不删除实体**）
- 显式作废意图的写法：`nav_commit mode=archive id=ACT-N reason=...`

**验证**：`grep` 确认全文无失效工具名残留（唯一的 `nav_mark` 出现是**显式标注为「已被取代的旧机制」**，用于解释自动收口，属有意保留）；六个现行工具名各出现 2–5 次。

### ✅ 发现 2 已修：治理覆盖面显式声明

「治理边界」表新增 **「沙箱绑定（六闸强制？）」** 列：

- `project-nav` → ✅ 已绑定（`boundaryWorkspaces: 'project-nav'`，六闸强制）
- `prompt-enhancer` / `shoucang` / `dsh-dev-docs` → ⬜ 未绑定（仅文本约定，无闸门拦截）
- `pmg` → 划线，标注「磁盘与事件流实测零残留」

表下新增**防误读声明**：沙箱边界是 opt-in 白名单，当前只绑 1 个项目；`not-governed` 是设计内行为、不是治理失效。

### ✅ 顺带修正：失效路径引用

| 原引用 | 问题 | 修正 |
|---|---|---|
| `HANDOFF.md` | 工作区根**不存在**（实测在 `project-nav/HANDOFF.md`） | 改为「各项目 `HANDOFF.md`」 |
| `modules/<模块>.md` | 表述含糊（`modules/` 实为各项目模块契约档，现有 3 份） | 补注说明 |
| `nav-index.json` | 已迁至 `.internal/legacy/`（只读归档） | **原文未引用此路径**，无需改；报告此前的结论已更正 |

### 🔍 一处「疑似缺陷」经核验为**误报**（诚实记录）

核验中发现事件流部分行在终端显示为乱码（如 `璁板繂鏍稿績`），一度疑似编码损坏。经 Python 严格验证：

- 文件是**合法 UTF-8**（`raw.decode('utf-8')` 通过）
- 用 Python 正确解码后，`seq=131/132/133`（**非迁移数据，是当日新写入**）内容完全正常：`记`、`本轮新增的睡眠期自检属于**架构级变更**`

**结论**：乱码是**本机 Git Bash 终端的显示问题**，不是数据缺陷。已排除，不作为发现项。

### ✅ 回归验证

```
cd D:\FF\project-nav && npm test   →  22 PASS / 0 FAIL（修复前后一致）
```

修复仅触及文档文本，未改动任何代码，治理底座测试无回归。

---

## 📚 证据索引

| 类别 | 路径 / 命令 |
|---|---|
| 治理纪律（工作区级，**本次已修**） | `D:\FF\AGENTS.md` |
| 治理纪律（仓级，范式参照） | `D:\FF\project-nav\AGENTS.md` |
| 架构契约 + F1–F9 | `D:\FF\project-nav\ARCHITECTURE.md` §8 |
| 事件流（唯一事实源） | `D:\FF\.internal\events.jsonl`（133 行） |
| 折叠模型 | `D:\FF\.internal\runtime\arch-model.json`（465 KB） |
| 边界诊断 | `D:\FF\.internal\boundary-diag.json`（19 条会话，全 `not-governed`） |
| 边界逻辑 | `project-nav\core\boundary.js` + `test\core.test.mjs:562-594` |
| 六闸实现 | `project-nav\core\gates.js`（六闸均为纯查询，阈值 `model.js:15`） |
| 边界配置 | `~/.dsh/profiles/web/cordis.patch.yml`（`boundaryWorkspaces: 'project-nav'`） |
| 历史遗留 | `D:\FF\.internal\legacy\`（nav-index/actions/arch/docs 只读归档） |
| 移除落法事实卡 | `shoucang\docs\devref\shoucang\2026-09-10-{decision-pmg-治理移除落法,reference-治理索引漂移实态,reference-project-nav-治理工具边界}.md` |
| 测试实跑 | `cd D:\FF\project-nav && npm test` → 22 PASS / 0 FAIL |

---

> 本报告基于 2026-09-11 实况。治理体系处于活跃换代期，结论有时效性。
