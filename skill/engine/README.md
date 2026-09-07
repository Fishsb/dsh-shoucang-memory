# engine/ — 知识整理核心（单一事实源）

> ADR-0005（2026-09-06 accepted）：「会话 → 蒸馏 → 裁决 → 分库写入」的通用知识整理引擎。
> 从记忆插件抽出，**记忆插件与项目插件都薄包装指向本目录**——单一事实源，双装零重复。
> 模式对齐 pmg ADR-0002（engine 子目录 + 插件薄包装）。

## 定位

- **本目录承载**：裁决契约（prompt + JSON schema）、预筛信号词、泛化写入（knowledge-append）、目标库注册约定。
- **本目录不承载**：watcher / idle 定时器 / spawn 调用（依赖 DSH 运行时 ctx，留在各插件薄包装内——ADR-0004 已验证的事件链路只搬契约不搬运行时）。
- **隐私红线**：只含规则/脚本/契约，不含用户画像、本机路径、会话数据。

## 文件

| 文件 | 内容 | 消费方 |
|---|---|---|
| `distill-contract.md` | 蒸馏裁决契约：第一层归属路由（route: memory\|project\|discard）+ 四问 + JSON 输出 schema | 各插件 spawn 蒸馏子代理时的 persona 来源 |
| `signals.mjs` | 预筛信号词表 + `hasDistillSignals()`（与 candidate_grep 强/中词表同源） | 插件 distillPrescan import；candidate_grep 口径对齐 |
| `knowledge-append.mjs` | 泛化写入安全阀：目标库白名单参数化（记忆 notes/三索引 / 项目 docs/devref 卡 / pending），保留写前备份/容量门禁/小节锚拒写 | 各插件入册调用（替代直接调 memory-append） |
| `target-registry.json` | 目标库注册表：各库 id / 根目录约定 / 白名单 | knowledge-append 与插件读取 |

## 目标库注册约定（ADR-0005 决策 6）

| 库 id | 根目录 | 白名单 | 承载 |
|---|---|---|---|
| `memory` | `~/.dsh/skills/managing-memory/` | `notes/env|tools|flows|lessons|release|user|agent.md` + `MEMORY/USER/AGENT.md` | 真·泛用元记忆（人脑） |
| `project` | `<项目>/docs/devref/` | 卡片文件 + `INDEX.md` | 项目知识（how-to/reference/decision 卡） |
| `pending` | 各库 `pending/` | 候选文件 | 待固化候选（ADD-only） |

- **单装记忆插件** = 只注册 memory → route=project 内容落 pending（带 `[route:project]` 标记，待项目库就绪迁移）。
- **双装** = 蒸馏一次，route 分流两库；watcher 唯一归记忆插件（或后继核心插件），项目插件不重复订阅。

## 演进

- 阶段 2：记忆插件接本契约（route 分流落地）。
- 阶段 3：pmg 侧项目卡库就绪后，project 路由从 pending 直写卡库。
- 阶段 4：记忆插件瘦身完成，SKILL 同步。

_建立 2026-09-06 · ADR-0005 阶段 1_
