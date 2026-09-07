# dsh-managing-memory

> ⛔ **2026-09-07 已退役归档**（pmg 权威仓 ADR-0003）：插件本体已从 dsh-web 下线（移入 `~/.dsh/backups/memory-stack-retire-20260907-001554/`），记忆职责移交 dsh-auto-memory。本仓冻结为归档仓，README/规则/引擎保留历史原貌，生产数据仍在 `~/.dsh/skills/managing-memory/`（活库副本，未删）。

DSH（DeepSeek Harness）文件式长期记忆技能的开发仓库：**规则与引擎公开，私人记忆数据不随仓库发布**。

## 这是什么

「文件式长期记忆 + 工作纪律」DSH 技能的**规则层与引擎**：

- `SKILL.md` — 技能权威定义（L1-L4 纪律骨架：第一性原理/方案确认门/任务分流/审计）
- `memory-whitelist-spec.md` — 记忆白名单规格（R0 路由/四问/容量/门禁）
- `audit-protocol.md` / `task-protocols.md` — 审计与任务协议
- `engine/` — 知识整理核心（ADR-0005）：蒸馏裁决契约 / 预筛信号词 / 泛化写入安全阀 / 目标库注册
- `scripts/` — 归档检测 + 记忆工具引擎（archive-lib/check/mark/timer、health/write_gate/read_section 等，Node 原生零依赖）
- `docs/` — 治理地图与架构决策（ADR-0001…0006）

## 结构分离（ADR-0006）

本仓库**不含任何用户私人记忆**。个人记忆数据（`MEMORY.md`/`USER.md`/`AGENT.md` 索引、`notes/` 详情、`pending/` 候选、`audit/` 运行产物）在本机开发时集中于 `_memory/`，由 `.gitignore` 结构性排除——**推送即公开树，无需逐文件审查**。

- 公开树：规则/引擎/文档（git 跟踪）
- `_memory/`：私人数据（本机，gitignore）
- `docs/devref/`、`.internal/`：本机开发参考（gitignore）

脚本经 `MEMORY_ROOT` 环境变量定位数据根（缺省 = 脚本目录上一级，兼容生产技能副本根下布局）。

> **2026-09-08 迁入守藏后的两种口径**：
> - **生产部署**（权威）：`skill/` 内容部署到 `~/.dsh/skills/managing-memory/`，私人数据区在技能根下——缺省解析即正确，无需设 `MEMORY_ROOT`；
> - **仓内开发**：`skill/` 是公开树、不含私人数据，手工跑 `scripts/` 体检/写门前**必须**显式设 `MEMORY_ROOT` 指向仓根 `_memory/`（蒸馏链路不受影响——守藏调度器写入分发时已显式传 `MEMORY_ROOT=<resolved.root>`）。

## 使用

技能本体部署于 DSH 技能目录（`~/.dsh/skills/managing-memory/`，含私人数据区与规则副本）；本仓库为规则/引擎的公开开发源。

## 许可与致谢

开源技能仓；规则与引擎供复用，隐私红线：不含用户画像/本机路径/会话数据。
