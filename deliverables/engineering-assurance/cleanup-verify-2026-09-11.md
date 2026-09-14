# 遗留清理 · 复核验证与部署漂移发现

**日期**：2026-09-11
**工作流**：清理复核（承接工作流 4「部署前检查」的收口验证）
**参与成员**：Rex（SRE 工程师，部署一致性复核）· Cody（代码审查师，制品链核查）

> 本报告为清理动作后的**独立复核**，非清理当时的执行记录（执行记录见 `cleanup-leftovers-2026-09-11.md`）。
> 复核结论：**清理本身完好无损，但在复核过程中发现一处清理之前不存在的新问题——`project-nav` 部署漂移。**

---

## 📌 TL;DR（执行摘要）

- **清理状态：✅ 完好。** 30 个文件在隔离区，188,393 字节安全档可解压（19 条目），`events.jsonl` 133 行未受影响。
- **`legacy/` 定性：❌ 不是「废弃遗留」，**且实测证为 0.9.2 的**活读路径**，删除会导致 `nav_graph mode=legacy` 断裂（9 条迁移警告由它实时供数）。**硬约束：不可删。**
- **🔴 新发现·部署漂移：** 线上安装副本仍是 **0.9.1**，其 `host/index.js` **仍 import `core/boundary.js`**；而仓 `HEAD` 之后工作区已把 `boundary.js` **删除**并升到 **0.9.2**。仓与线上**双向不一致**。
- **风险定级：🟠 高（非紧急）。** 线上**当前可运行**（import 实测 OK），但处于「半更新」状态：一旦按当前工作区重打包安装，就会踩 `ERR_MODULE_NOT_FOUND`。**禁用当前工作区打包装机**，直到并发会话把 0.9.2 收口提交。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟡 有条件通过（清理通过；新增部署漂移需先收口） |
| 阻塞项数量 | 0（线上此刻可运行） |
| 高风险待办 | 1（部署漂移 · 仓 0.9.2 未落 / 线上 0.9.1 引用已删模块） |
| 关键行动项 | 3 条 |
| 建议下一步 | **不要**在当前工作区执行 `npm pack` / 安装；等并发会话提交 0.9.2 后，跑 `verify-0.9.1-install.ps1` 同口径校验 |

---

## 🔍 复核发现（按严重度排序）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源 |
|---|--------|------|------|---------|------|------|
| 1 | 🟠高 | 部署一致性 | `project-nav/package.json` vs 安装副本 | 仓工作区 `version=0.9.2`（未提交），线上安装副本 `version=0.9.1`；`HEAD` 仍为 0.9.1。三处版本口径不一致 | 等并发会话提交后重新打包安装并校验 | Rex |
| 2 | 🟠高 | 构建完整性 | `repo/core/boundary.js` 已删 / `installed/host/index.js:33` 仍 import | 安装副本 `host/index.js` sha1 `9f240652…` ≠ 仓 `1056708b…`；仓已把 boundary 摘除，线上仍依赖它 | 禁止用当前工作区打包安装（会抛 `ERR_MODULE_NOT_FOUND`） | Cody |
| 3 | 🟡中 | 制品链 | `repo/core/format.js` | `repo=f226a585` vs `inst=f…905a223e`，**DIFF**（属 0.9.2 在途改动，随 #1 一并收口，非独立缺陷） | 同上，随版本收口 | Cody |
| 4 | 🟢低 | 文档一致性 | `installed/host/index.js` 注释 | 线上仍描述 `boundaryWorkspaces` 配置与 `governedWorkspaceOf` 探测（0.9.2 已退役该特性） | 随 0.9.2 发布更新 | Rex |

**关键澄清：** 发现 #1/#2 与本次清理**无因果关系**。隔离区 30 个文件**零业务代码**、**不含 `boundary.js`**；`boundary.js` 的删除来自**另一个并发会话正在推进的 0.9.2 工作**（`git status` 显示其修改时间晚于本次清理，且新增 `.boundary-retire.journal.mjs` 日志文件）。

---

## 🏗️ 清理复核明细（逐项）

### 1. 隔离区完整性

| 检查项 | 结果 |
|--------|------|
| 文件数 | ✅ 30 / 30 |
| 总体积 | 1.3 MB |
| 含业务代码 | ✅ 零（全部为 `.bak` / `.superseded` / 旧 tgz / 索引备份） |
| 含 `boundary.js` | ✅ 不含 |
| `project-nav` 现存 tgz | ✅ 仅 `0.9.1.tgz`（活跃版本） |

隔离区四组分类与用户拍板一致：`会话备份` `nav-index 备份` `superseded tgz` `旧版本 tgz + 脚本`。

### 2. 安全档可用性

```
.internal/backups/pre-cleanup-20260911/leftovers-20260911.tar.gz
  size      = 188,393 bytes
  entries   = 19（tar -tzf 实测可列）
  verdict   = ✅ 可恢复
```
> 说明：沙箱禁用回收站 API（`Add-Type` / COM / PowerShell-from-Bash 均不可达，且无 `gio`/`trash-put`），故用户所选「移至回收站」降级为**隔离区 + 安全档**双保险。降级已如实上报，可随时执行永久清除。

### 3. 数据面未受影响

| 制品 | 状态 |
|------|------|
| `.internal/events.jsonl` | ✅ 133 行 / 190,946 字节 / 16:13 时间戳（清理前后未变） |
| `.internal/legacy/` | ✅ 250 KB 只读快照，完整 |
| 活跃安装副本 | ✅ 可正常 import（6 个导出齐全） |

---

## 🗂️ `.internal/legacy/` 定性裁定：**必须保留**（实测证为「活读路径」，非废弃遗留）

> **更新（同日 18:5x 追加实测）**：初版判定基于文档证据，结论为「刻意归档，建议保留」。
> 追加**运行期实测**后，结论**升级为硬结论**：`legacy/` 是**当前 0.9.2 的活读路径**，删除即造成功能断裂。

### 实测证据（决定性）

直接调用生产代码 `inspectLegacy('D:\\FF')`（`core/legacy.js`，即 `nav_graph mode=legacy` 的后端）：

```
alreadyMigrated: true
marker.at:       2026-09-11T01:44:00.836Z
warnings count:  9          ← 由 legacy/ 实时读取并返回
```

且 `host/index.js:123-125` **在 0.9.2 中仍是活分支**（`if (mode === 'legacy')`），文档串也仍宣告该模式可查。

**关键机制**：`nav_graph mode=legacy` 读的不是 `.internal/` 原位的旧账本（那些已迁走，探针返回全 `null`），而是 **`legacy/migrated.json` 里的 `warnings[]`** —— 9 条迁移期警告**至今仍由该文件实时供数**。

### 三重文档证据（初版，仍然成立）

| # | 证据来源 | 原文 | 含义 |
|---|---------|------|------|
| 1 | `project-nav/ARCHITECTURE.md:86` | 「迁移后旧账本**归档为只读快照**（`.internal/legacy/`），不再被任何代码读写。」 | 架构文档声明其为**设计产物** |
| 2 | `project-nav/AGENTS.md:67` / `README.md:136` | 「迁移**只跑一次**（落下 `.internal/legacy/migrated.json` 标记）」 | 行为契约写明归档路径 |
| 3 | `.internal/legacy/.gitignore` | `# 只读快照，永不写入` | 档案**自带**不可写声明 |
| 4 | `.internal/legacy/migrated.json` | `events:100, seqRange:[1,100]` + 5 项 `archived` 映射 | 迁移已完成落痕 |

### 裁定：**保留（硬约束）**

- **不是**「废弃遗留」：废弃遗留 = 无人依赖、留着只是噪音；`legacy/` = **被 `nav_graph mode=legacy` 实时读取的活数据**。
- **删除后果**：`nav_graph mode=legacy` 立即断裂（9 条迁移警告不可再查），且 0.9.0 事件流化前的唯一历史账本永久消失。
- **若确需清理**：这属于**功能变更**（等于退役 `mode=legacy`），须走 `nav_node retire` 级联 + 代码改造 + 测试，**不是文件清理动作**。**本次不动，且明确不建议作为「清理」处理。**

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | **暂停**用当前 `project-nav` 工作区执行 `npm pack` / 安装（0.9.2 在途，打包必炸） | 人 | P0 | 立即 |
| 2 | 等并发会话把 0.9.2 收口提交，再重新打包安装；用 `verify-0.9.1-install.ps1` 同口径做 sha1 全量校验（不可只比 `core/model.js`） | Rex | P1 | 0.9.2 提交后 |
| 3 | **保留 `.internal/legacy/`（硬约束）**：实测 `nav_graph mode=legacy` 仍实时读取其中 `migrated.json` 的 9 条警告；删除 = 功能断裂，非清理 | 人 | P0 | 已定，禁止删 |
| 4 | 决定隔离区去留：确认无误后永久清除 `.trash-20260911/` + 安全档（释放 1.5 MB） | 人 | P2 | 观察 1–2 天 |
| 5 | 恢复 `npm test` 复核（当前被并发会话阻塞，`core/boundary.js` 处于 `D` 态） | Cody | P1 | 并发会话结束后 |

---

## ⚠️ 待完善 / 已知局限

- **`npm test` 未能重跑**：`project-nav` 有并发会话在途（`core/boundary.js` 处于删除态、`README.md`/`bootstrap.mjs` 18:49 仍在改），此时跑测试必报 `ERR_MODULE_NOT_FOUND`，**该失败与本次清理无关**（0.9.0 换代提交 `fc9a38f` 后，`boundary.js` 是 0.9.2 才摘的，属在途状态）。
- **版本三口径不一致是「正常在途」还是「异常」无法单方判定**：0.9.2 是并发会话的未提交工作，我无权替其收口；仅能标记并建议冻结打包。
- **隔离区未真正进回收站**：沙箱能力所限，已如实降级，非静默处理。
- 本报告**未改动任何 `project-nav` 文件**——所有发现均为只读核查所得。

---

## 📚 数据来源 & 成员产出索引

- **Rex（SRE）**：部署一致性复核 —— 三处版本口径比对（repo `0.9.2` / `HEAD` `0.9.1` / installed `0.9.1`）、安装副本 import 实测（`IMPORT OK`，exports 6 项）、`boundary-diag.json` 探测记录（`verdict:true`，cwd 含 `D:\lk\FF` 等非治理区）。
- **Cody（代码审查师）**：制品链 sha1 比对 —— `core/*.js` 10 文件逐一对照，`format.js` DIFF、其余 9 文件 SAME；`host/index.js` sha1 不一致；确认仓 `core/boundary.js` 缺失而安装副本 `host/index.js:33` 仍 import。
- 复核者（主理人）：`legacy/` 定性四重证据链、隔离区完整性清点、安全档可解压验证。
- 清理执行原始记录：`deliverables/engineering-assurance/cleanup-leftovers-2026-09-11.md`
- 治理审查基线与修复记录：`deliverables/engineering-assurance/governance-review-2026-09-11.md`
- 蒸馏链检查：`deliverables/engineering-assurance/distill-chain-check-2026-09-11.md`

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
