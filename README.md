# 守藏 · Shoucang — 插件集合中枢（suite）

> ⛔ **2026-09-07 已退役归档**（本仓 ADR-0003）：插件已从 dsh-web 下线（`~/.dsh/plugins/shoucang-panel` 软链删除，本仓本体保留），记忆职责移交 dsh-auto-memory（pmg 权威仓 ADR-0003 同日记录）。suite 数据 `~/.dsh/suite/knowledge/` 零损失保留（只读）。本仓转冻结归档仓，以下文档保留历史原貌。
>
> 守藏（Shoucang）：**插件集合中枢**——UI + 全部集合插件设置界面 + 协调调度中枢。独立项目仓（D:\FF\shoucang，git 已初始化，治理由本仓重建）。
> 前身：独立记忆插件项目（D:\lk\FF\shoucang，2026-08-26 立项 / 08-27 停止开发）；记忆归档职责已由
> `@dsh-external/dsh-managing-memory` 事件驱动蒸馏实现并超越，**2026-09-06 重定义**为集合中枢（旧仓冻结存档）。
>
> **License**: Apache-2.0 · 零硬编码本机路径（沿用原仓红线，CI 惯例保留）

## 定位（v4 · 集合中枢）

```
                    ┌──────────────────────────────────────────┐
                    │   守藏（本目录）· UI + 设置界面 + 协调调度  │
                    │   plugins/shoucang-panel   → UI 面板       │
                    │   plugins/shoucang-scheduler → 调度执行器  │
                    └───────────────┬──────────────────────────┘
                                    │ suite 成员注册
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
  @dsh-external/            @dsh-external/             （未来成员…）
  dsh-managing-memory       project-map-governance
  指挥者：全局记忆思考        执行者两模块：项目地图防漂移
  泛化元记忆/R0 裁决/蒸馏     + 项目知识卡库
```

- **装守藏 = 获得集合入口**：通过守藏检测/安装/管理集合内其他插件；成员也可完全独立安装使用
- **守藏不抢业务**：知识裁决归记忆插件（R0 路由，蒸馏唯一 watcher 在记忆插件）、项目治理归 pmg——守藏只管「装没装、状态如何、迁移派发」+ 给用户一块屏

## 结构

| 路径 | 内容 | 状态 |
|---|---|---|
| `plugins/shoucang-panel/` | UI 面板（client.js，Obsidian 风格；23 API 路由） | **UI 暂冻结**——后续按集合需求适配（新增 suite 视图；旧记忆板块路由标记 deprecated-候选） |
| `plugins/shoucang-scheduler/` | 调度执行器（shoucang_route/shoucang_verify 2 工具） | **重定义**：4-Gate 降级复用为 suite 路由（G0 bypass/G1 读状态/G2 写编排/G3=G30 验证）；原记忆归档路由退役 |
| `shoucang.config.example.yaml` | 配置模板 v2：`suite:` 节新增（成员注册表）；`archive:/boards:/lifecycle:` 节**已删除**（拍板 2026-09-06） | ✅ |
| `scripts/` | 原仓脚本 | 保留 |
| `docs/`（原仓） | 设计稿归档（归档管线/画像/指针表等） | **未迁移**——属历史资产，留在冻结仓 |

## 资产裁决记录（2026-09-06，用户拍板）

| 原方向资产 | 裁决 | 理由 |
|---|---|---|
| idle-review 归档蒸馏（archive: 节） | **废弃** | 与记忆插件方案 E（ADR-0004 事件驱动）完全重合且已过时；蒸馏唯一权归记忆插件 watcher |
| 画像/记忆/wiki 三板块 | **废弃**（职责已由记忆库 notes+三索引 / pmg 卡库承接） | 指针表思想已在 SKILL 索引行落地 |
| panel UI（192KB） | **保留冻结** | 集合 UI 骨架；facts.md 登记的「配置 UI 待办」由本面板后续承接 |
| scheduler 4-Gate 骨架 | **重定义**为 suite 路由 | G30 证据计数保留（对接记忆审计 §8 机械化核验） |
| 向量检索（bge-m3 桥 + panel UI） | **悬置** | UI 已建不动；后端接入记忆检索另行立项 |
| scnote 命令 | **保留** | 守藏独立价值 |

## 后续（在本工作区重建治理后执行）

1. suite-manager 只读模块（装配检测：`shoucang_suite` 工具）
2. panel「插件集合」视图（UI 解冻时）
3. 安装编排（std/dev 双通道）
4. migrationHint 消费：记忆插件调度日志 → 守藏 UI 提示 → 派发 pmg devref-card
5. G30 对接记忆审计 §8
6. 向量检索接入记忆检索（R5 语义路由，可选）

_迁移自 D:\lk\FF\shoucang @ a83cb88（2026-09-06）；旧仓冻结存档不删。_
