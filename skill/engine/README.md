# engine/ — 知识整理核心（单一事实源）

> ADR-0005（2026-09-06）建立时是「双库（记忆库 + pmg 项目卡库）」的共享引擎；**2026-09-08 单库化 + pmg 移除**后，
> 本目录只剩三件真消费物。2026-09-11 审查（v6）按现码重写本文，清掉 pmg 时代残留描述。
>
> **权威实现**：蒸馏/深睡的 persona 与全部落盘逻辑都在插件侧 `src/distill.ts`（`DEFAULT_DISTILL_PROMPT` /
> `DEEP_SLEEP_PROMPT` / `writeDispatch`）；本目录的契约文档是**给人读的说明书**，与代码冲突以代码为准。

## 定位

- **承载**：裁决契约说明书（蒸馏 + 深睡）、预筛信号词（运行时真消费）、目标库/容量注册表（旧源兼容）。
- **不承载**：watcher / idle 定时器 / spawn 调用（依赖 DSH 运行时 ctx，留在插件内——ADR-0004 只搬契约不搬运行时）。
- **隐私红线**：只含规则/脚本/契约，不含用户画像、本机路径、会话数据。

## 文件（现码消费关系）

| 文件 | 内容 | 消费方（现码） |
|---|---|---|
| `distill-contract.md` | 裁决契约说明书 v6：R1/R2=memory · R3=project · R4=discard + 四问 + JSON schema + 深睡通道表 | **人读**（蒸馏 persona 权威在 `src/distill.ts`；本档 2026-09-11 按现码对齐） |
| `signals.mjs` | 预筛信号词表 + `hasDistillSignals()` | **`src/distill.ts:loadEngineSignals()` 动态 import**（缺文件则用同源内嵌副本）；`candidate_grep.mjs` 口径对齐 |
| `target-registry.json` | 目标库 id / 容量静态表 | `src/panel.ts:memoryCaps()` 的**旧源兼容**（② 优先级，被容量门配置 ① 覆盖） |

**已退役（2026-09-11）**：`knowledge-append.mjs`（pmg 时代的泛化写入安全阀）——单库化后**运行时零调用**
（全仓实测只剩文档引用），写入统一走 `scripts/memory-append.mjs`（memory 路由）与宿主 `writeProfileLine`（画像路由）；
文件删除，历史实现见 git 历史与 `docs/history/ADR-0005`。

## 单库化后的写入链路（现码）

```
蒸馏子代理（persona=DEFAULT_DISTILL_PROMPT）
   └─ 宿主 writeDispatch(route)
        ├─ memory   → targets.resolveTarget + loadWhitelist + gateMemoryAppend（进程内白名单门）
        │              → scripts/memory-append.mjs（自持白名单 + 容量门 + 写前备份 + tmp+rename）
        │              → newIndex 唯一性硬门
        ├─ profiles → 宿主 writeProfileLine 直写 USER.md / AGENT.md（不过子进程）
        ├─ project  → <workspace>/docs/devref/shoucang/ 直写；workspace 不可解 → pending/*-project-defer-*（由入口 flushDeferCards 回流）
        └─ discard  → 空跑（仅审计）
```

- 库根 = `~/.dsh/skills/managing-memory`（`targets.memoryLibRoot()`，数据与脚本同根；白名单 `whitelist.json` 库自治）。
- `~/.dsh/suite/knowledge` 只承载**运行状态**（audit/水位/pending 队列/向量缓存），**不是库**。

_建立 2026-09-06 · ADR-0005 阶段 1 · 2026-09-11 v6 按单库化现码重写_
