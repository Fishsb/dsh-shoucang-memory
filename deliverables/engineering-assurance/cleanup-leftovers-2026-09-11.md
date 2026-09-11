# 遗留物清理报告（D:\FF 工作区）

**日期**：2026-09-11
**执行依据**：用户拍板「废弃遗留的可以清理了」+ 清理范围与方式确认
**执行方式**：工作区内隔离区（`.internal/.trash-20260911/`），可恢复
**状态**：✅ 完成，当前生效版本零影响

---

## 📌 TL;DR

- **已清理 30 个废弃遗留文件**，全部为**非业务代码**（会话备份 / `.bak` / 旧版本 tgz / 已退役的配对脚本）。
- **当前生效的 0.9.1 版本完全未受影响**：profile 声明解析通过、安装副本未动、无静默回退风险。
- **执行前已建整体安全网**（`pre-cleanup-20260911/leftovers-20260911.tar.gz`，188 KB），隔离区可随时恢复。
- **⚠️ 重要发现**：清理过程中发现**另有并发会话正在改 `project-nav`**（正在退役「工作区边界」功能）。当前 `npm test` 失败是**对方在途工作**所致，与本次清理无关——已用证据排除，并已让路。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体状态 | 🟢 **完成**（生效版本零影响） |
| 清理文件数 | **30** 个（非业务代码） |
| 不可逆风险 | **无**（隔离区保留，未真删） |
| 需注意 | 并发会话正在改 `project-nav`，动该仓前需确认 |

---

## 一、清理清单

### 类别 1：会话备份（4 个目录）

`.internal/backups/` 下的一次性会话中间备份：

| 目录 | 内容 |
|---|---|
| `boundary-fix-20260911` | boundary 修复过程中的 host-index / tgz / test 备份（5 文件） |
| `project-nav-install-20260911` | 安装期 `render.js` 备份（1 文件） |
| `project-nav-tgz-20260911` | 安装期 tgz 备份（1 文件） |
| `render.js-20260911` | `render.js.bak`（1 文件） |

### 类别 2：旧账本备份（7 份 `.bak`）

`.internal/` 下旧 `nav-index.json` 迁移过程中的临时快照（6 份）+ `vector.json` 快照（1 份）。旧账本本身已归档至 `.internal/legacy/`，这些是迁移中间态，无保留价值。

### 类别 3：superseded tgz（5 个）

`dsh-external-project-nav-{0.4.0, 0.6.0, 0.7.0, 0.7.1, 0.7.2}.tgz.superseded-*` —— 已被后续版本取代，profile 未引用。

### 类别 4：旧版本 tgz + 配对脚本（10 tgz + 2 脚本）

`0.7.3` – `0.9.0` 共 10 个版本的 tgz，连同 `install-0.9.0.ps1` / `verify-0.9.0-install.ps1`。

> **耦合处理**：`install-0.9.0.ps1` 第 29 行**硬引用 `dsh-external-project-nav-0.9.0.tgz`**。若只删 tgz 会留下断链脚本，故**成对处理**（一起隔离）。
> 事后因并发会话原因，这两个脚本已**恢复原位**（见「三、并发会话发现」）。

---

## 二、保留项与安全验证

### 保留（当前生效版本）

| 文件 | 保留理由 |
|---|---|
| `dsh-external-project-nav-0.9.1.tgz` | profile 声明直接引用 |
| `install-0.9.1.ps1` / `verify-0.9.1-install.ps1` | 当前版本的安装/验证脚本，自足（不引用 0.9.0） |

### 验证结果

| 验证项 | 结果 |
|---|---|
| profile 声明解析 | ✅ `file:D:/FF/project-nav/dsh-external-project-nav-0.9.1.tgz` → **文件存在**（无静默回退风险） |
| 安装副本版本 | ✅ `0.9.1`，`core/` 文件未受影响 |
| 隔离区是否含业务代码 | ✅ **0 个** `.js` 业务文件（仅 `.bak` / `.tgz` / `.ps1`） |
| 安全网 | ✅ `pre-cleanup-20260911/leftovers-20260911.tar.gz`（188 KB，30 文件） |

---

## 三、⚠️ 并发会话发现（本次清理的重要副产物）

清理过程中发现 `project-nav` 仓存在**另一会话的在途工作**：

```
 M ARCHITECTURE.md
 M core/format.js          ← 18:46:56 被对方修改
 M host/index.js
 M test/core.test.mjs / test/host-harness.mjs / test/host.test.mjs
 D core/boundary.js        ← 对方删除（退役「工作区边界」功能）
?? .boundary-retire.journal.mjs   ← 对方的一次性退役脚本
```

**对方正在做**：退役「工作区边界」节点（PN-F06），删 `core/boundary.js`、改渲染与测试，并写了一次性脚本往事件流追加 retire 事件。

### 对本次清理的影响（已排除）

`npm test` 目前**失败**：

```
ERR_MODULE_NOT_FOUND: file:///D:/FF/project-nav/core/boundary.js
```

**这是对方在途工作所致，与本次清理无关**，证据如下：

1. 我隔离的 30 个文件**不含任何 `.js` 业务代码**；`find` 确认隔离区**无 `boundary.js`**
2. `boundary.js` 是**被 git 追踪的文件**（`git log` 有其提交历史 `fc9a38f`），属对方删除
3. 我的清理**只触碰** `.internal/*` 与 `project-nav/*.tgz` / `*.ps1`，未触碰 `core/`

### 处置：让路

为不与对方 git 工作区交错（避免其提交时混入我造成的额外 `D` 项），已**把 `install-0.9.0.ps1` / `verify-0.9.0-install.ps1` 恢复原位**。恢复后 `git status` **不再出现任何由我造成的条目**。

> **后续注意**：动 `project-nav` 前先确认该并发会话是否已收工；其完成后应重跑 `npm test` 恢复 22 PASS。

---

## 四、恢复方式（如需）

```bash
cd D:/FF
# 全部恢复
cp -r .internal/.trash-20260911/* .internal/backups/     # 类别 1
# 或从安全网整体解包
tar -xzf .internal/backups/pre-cleanup-20260911/leftovers-20260911.tar.gz -C .internal/
# 永久清除（确认无误后）
rm -rf .internal/.trash-20260911
```

---

## ⚠️ 已知局限

- **未真正送入回收站**：本机无 `gio` / `trash-put` / `recycle`，且 PowerShell 的 `Add-Type` 与 COM 实例化均被安全策略拦截 ⇒ 无法调用 Windows 回收站 API。已改用**工作区内隔离区**（等效可恢复，但不在系统回收站里）。
- **未清理**：`.internal/backups/pre-cleanup-20260911/`（安全网）与 `.internal/legacy/`（历史归档，属有意保留）。
- **未触碰业务代码**：本次严格限于遗留物，未修改任何 `.js` / `.md`（除本报告）。

---

> 本报告基于 2026-09-11 实况。隔离区尚未永久删除，可随时恢复。
