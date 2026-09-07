# 守藏 · Shoucang — 单插件仓（panel + scheduler + 记忆技能）

> **2026-09-08 重构**：dsh-managing-memory 项目迁入本仓，shoucang（panel + scheduler）与 managing-memory **合并为单一插件** `plugins/shoucang/`（@dsh-external/shoucang）；项目治理插件（project-map-governance）按拍板**整体移除出架构**。
>
> 前状态：2026-09-07 两插件曾退役归档（dsh-web 下线，软链删除）；本次合并为未来重启做准备，**尚未重新上线**。记忆现网职责在 dsh-auto-memory，不因本合并自动变更。
>
> **License**: Apache-2.0 · 零硬编码本机路径（红线保留）

## 架构（合并后）

```
plugins/shoucang/  ← 唯一插件 @dsh-external/shoucang
├── src/index.ts       入口：name/inject/Config/apply（组合 panel + scheduler）
├── src/panel.ts       UI 宿主半区：/api/shoucang-panel HTTP RPC（root 管理/配置编辑/记忆展示）
├── src/scheduler.ts   suite 路由 + 装配检测（shoucang_suite 工具；外部成员表已清空）
├── src/targets.ts     R0 目标路由 + 白名单门禁
├── src/distill.ts     事件驱动蒸馏器（空闲唤醒 → LLM 子代理裁决 → 分发写入）
├── client.js          UI client 半区（纯 DOM，Obsidian 风格）
└── skill/             managing-memory 技能本体（原独立仓公开树）
    ├── SKILL.md / memory-whitelist-spec.md / audit-protocol.md / task-protocols.md
    ├── engine/  scripts/          蒸馏契约与记忆维护工具（Node 原生零依赖）
    └── docs/history/              记忆仓历史 ADR-0001…0007 + facts（只读）
_memory/              私人记忆数据区（MEMORY/USER/AGENT + notes/pending/audit；gitignore，不入库）
docs/history/         本仓历史 ADR + facts（只读；pmg 治理体系已移除，仅存档）
```

## 迁移与合并记录（2026-09-08）

| 事项 | 裁决 |
|---|---|
| dsh-managing-memory 迁入 | 公开树 → `plugins/shoucang/skill/`；私人数据 `_memory/` → 仓根（gitignore）；源仓 `D:\FF\dsh-managing-memory` 保留冻结不动 |
| 双插件合并 | panel + scheduler + skill 三位一体 → `@dsh-external/shoucang` v0.3.0；**扁平单层 config**（panel + scheduler 字段直接并集，`z.intersect` 组合），项目未发布过版本、不做旧版适配 |
| pmg 移除 | docs/map、pre-commit 地图检查、suite 成员表、知识卡库体系全部移出架构；历史 ADR/facts 移 `docs/history/` 存档 |
| 隐私红线 | `_memory/` 与 `skill/docs/devref/` gitignore 结构性排除——推送即公开树 |
| 部署 | 插件尚未重新上线（dsh-web 侧无软链）；重启上线时软链指向 `plugins/shoucang`，技能部署 `skill/` 至 `~/.dsh/skills/managing-memory/`（**权威根，蒸馏 memory 路由探测此处的 MEMORY.md**）；仓内手工跑 skill 脚本须设 `MEMORY_ROOT=<仓根>/_memory/` |

## 构建（plugins/shoucang/ 下）

```bash
npm install --legacy-peer-deps
npm run typecheck
npm run build
```

> 踩实前提（沿自 2026-09-06 build-local 落地）：编译依赖须落 devDependencies；`--legacy-peer-deps` 防 npm 10 arborist 崩；tsconfig.local.json 用 bundler 解析 + cordis paths 映射。

_迁移自 D:\FF\dsh-managing-memory（冻结源仓保留）· 2026-09-08_
