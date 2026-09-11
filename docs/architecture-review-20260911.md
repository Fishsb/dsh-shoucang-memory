# 架构逻辑审查报告（2026-09-11）

> **审查对象**：守藏记忆核心 v2 → v2.1 → v2.2（含本轮「睡眠期自检」）的整体架构逻辑。
> **方法**（对齐 `[flow] 全局工程纪律`：分层 / ADR / 提交纪律三查；对齐 `[习惯] 记忆质量审查`：用**可机检判据**而非印象）：
> ① 读架构档（L1 `shoucang-overview.md` + L2 `SC-S05/SC-S07`）+ 规范（`spec` / `distill-contract`）+ 八份 docs 方案；
> ② 用**精确检索**核对"声明 vs 实现"（注册表字段是否被消费、路由数、水位条件、检测入口口径、部署面 sha、ADR 覆盖）；
> ③ 只报**有证据**的项，并区分「真缺口 / 语义未声明 / 文档陈旧 / 已核对无问题」。
> **结论**：主链正确、机检门有效；发现 **10 项**，其中 **1 项高**（双源漂移）、**5 项中**、**4 项低**。无"结构错位"级问题。

## 1. 结论速览

| # | 发现 | 级别 | 一句话 |
|---|---|---|---|
| **F1** | **注册表运行参数零消费 ⇒ 三处双源漂移** | 🔴 高 | `surface.score.mode` / `surface.injection.carriers.profile` / `trigger.idleMs` 在 `src/` 中**消费 0 次**；运行时真源是 scheduler 的 `scoreWeights` / `injectProfileRows` / `deepSleepIdleMs` |
| F2 | 深睡「done」不含门禁成败（gate 全拒仍算 done） | 🟡 中 | `return (stop==='completed'&&out)?'done':'failed'`（`distill.ts:2601`）——与 `深睡水位护栏` 不冲突，但**文档未写明** |
| F3 | 自检覆盖"所有非 no-traces 结束"（含 error/aborted），语义未声明 | 🟡 中 | `distill.ts:2565` 无条件 `await runSelfCheck('deep-sleep')`，早退仅 `2295`(no-traces)/`2474`(no-parent) |
| F6 | 检测入口**口径不一**：exit 3 在 selfcheck=跳过、在 `npm test`=中断 | 🟡 中 | 同一检测件两种判读 |
| F7 | **睡眠自检缺 ADR**（架构新增未落决策） | 🟡 中 | `nav_graph adrs` 仅 130/128/126/122/93/92 |
| F10 | **新增写面未登记**：自检可写 `scheduler.json` | 🟡 中 | 写面从「面板 / 手改」变为 3 个，`spec` 未列 |
| F4 | 架构档事实漂移：L1 写「面板 30 路由」 | 🟢 低 | 实测 **34** |
| F5 | 4 份方案档无状态横幅 · 1 份内容重复 | 🟢 低 | 陈旧文档风险（可照旧档重做已实现的事） |
| F8 | 部署面双源：repo `scripts/` ↔ bank `scripts/` | 🟢 低 | 实测 7 件**当前一致**，但**无自动校验** |
| F9 | 台账分域（maturation 在库 / ledger+shadow 在状态区） | ✅ 已核对 | `spec`/`contract`/`roadmap` 均已写明，**无缺口** |

## 2. 发现明细（证据 + 影响 + 建议）

### F1 🔴 注册表运行参数零消费（三处同源问题的第一处，也是**根因**）
**证据**（精确检索 `src/*.ts`）：
```
SCORE.mode            → 0 处
SURFACE.injection     → 0 处
TRIGGER.idleMs        → 0 处
（对照已消费的：MATURATION. → 8 处 · CARRIERS. → 2 处）
```
**实际真源**：`scheduler.ts` 的 `scoreWeights`（缺省 legacy）· `injectProfileRows`（缺省 3）· `deepSleepIdleMs`（缺省 3h）；`panel.ts#readCarrier` 读 `sched.injectProfileRows ?? 3`。
**为什么是问题**：v2/v2.1 立的核心原则是「**单一事实源 + 生成投影 + 机检一致**」。这三个字段进了注册表、也进了生成投影与 `criteria.md`，**却没有任何代码消费**⇒ 改注册表**不生效**（改运行时开关才生效），而文档读起来像"改注册表即可"。这是**同一语义两处定义且无机检**——与我此前修掉的三次实测缺陷（`recallFusion='rrf'→0`、白名单缺映射、`selfCheckRepo→0`）**同族**，只是那次在写通道、这次在参数源。
**建议（二选一，都须加机检）**：
- A. **代码消费注册表**：`scheduler` 的 zod 缺省值改为从 `criteria.generated.ts` 读（`SCORE.mode` → `scoreWeights` 缺省；`SURFACE.injection.carriers.profile` → `injectProfileRows` 缺省；`TRIGGER.idleMs` → `deepSleepIdleMs` 缺省）。**推荐**（真单一源）。
- B. **声明为 documentation-only**：给这三个字段加 `"role": "doc"`，并在 `check-criteria` 增断言「非 doc 字段必须在 `src/` 至少被消费一次」——防止未来再有"写了不生效"的字段。

### F2 🟡 深睡「done」不含门禁成败
**证据**：`distill.ts:2601` `return (stop === 'completed' && out) ? 'done' : 'failed'`；`applyPrinciples`（gate 全拒）返回 `added:0` 但**不改变 `stop`** ⇒ 水位照推。
**判定**：与 `[flow] 深睡水位护栏`（"completed≠成功/解析失败按 failed 回滚"）**不冲突**——护栏针对**材料消化失败**；gate 拒收属"消化完成、落盘被拒"，且**已由 M0/M2 的写入回执留痕**（`write.consolidate` + `rejectedLines`），不重跑是正确的（重跑只会再被拒一次，且会重复消耗 LLM）。
**建议**：在 `spec §8` 与 `contract v9 §0` **显式写明这条语义**（"done 的门槛=消化完成；落盘成败走 write 回执，不回滚水位"），并在 `memory-reconcile` 的健康度里区分 **done 总数 / written>0 的 done 数 / 被拒率**（现已部分实现）。

### F3 🟡 自检触发覆盖面未声明
**证据**：`distill.ts:2565`（在 `2563` bankSnapshot 之后、`2575` delta 之前）无条件执行；早退点只有 `2295`（no-traces）与 `2474`（no-parent）⇒ **stop=error/aborted 也会自检**。
**判定**：行为上不算错（自检是观测，失败时更该看），但两点需明确：① **语义未声明**；② `await`（timeout 180s）挂在深睡尾 ⇒ 深睡路径变长。
**建议**：① 文档写明"自检在**任何非 no-traces/no-parent 的深睡结束**后执行"；② 自检改为**不阻塞水位**（先推水位再自检，或自检放到 `setTimeout(0)`/microtask 后），避免观测拖慢主链。

### F6 🟡 检测入口口径不一（exit 码语义）
**证据**：`sleep-selfcheck.mjs#run()` 把 **exit 3 判为 skipped（依赖缺失）**；而 `npm test` 用 `&&` 链 ⇒ exit≠0 即**中断**。同一检测件（如 `shadow-sim` 在库内无 `lib/`）在两种入口下判读不同。
**建议**：把退出码语义**写成契约**（`0=pass · 3=skip(依赖缺失) · 其他=fail`），并让 `npm test` 侧也用同一判读（例如 test 链改为调用 `check-runner.mjs` 统一处理），或至少在 `spec` 声明"仅 `check-*`/`test-*` 参与 test 链；依赖缺失件不进链"。

### F7 🟡 睡眠自检缺 ADR
**证据**：`nav_graph adrs anchor=shoucang` 仅 6 条（130/128/126/122/93/92），本轮"宿主义务 + 三触发 + 白名单写面"未落 ADR。
**建议**：补 **ADR**（本次审查一并登记），内容=宿主义务边界、三触发（深睡后/定时/手动）、白名单调整仅 `rollback-scoreWeights` 且需显式开关。

### F10 🟡 新增写面未登记
**证据**：此前 `scheduler.json` 的写面=面板 `/set|/toggle` + 手工编辑；现新增**自检**（`adjust.rollback`）。`spec` 与 `contract` 未列该写面。
**建议**：在 `spec §1.0` 增「写面清单」：① 面板（用户显式）② 自检白名单窄动作（需显式开关 + 回执 + 备份）③ 手工；并声明**权限递减**与**全部留痕**。

### F4 🟢 架构档事实漂移（面板路由 30 → 34）
**证据**：L1 mermaid 标签「面板 30 路由 + …」vs 实测 `route(` 计数 **34**。
**建议**：本轮修正（已做）。

### F5 🟢 方案档状态未标 · 内容重复
**证据**：`memory-architecture-v2-plan.md` / `memory-carrier-and-receipt-plan.md` / `memory-layer-model-plan.md` / `memory-system-optimization-plan.md` **均无"已实现/已取代"横幅**；其中 `memory-system-optimization-plan.md` §6 的 U1/U2/U3 与 `ui-optimization-plan.md` 主体**重叠**。
**建议**：给四档加**状态横幅**（已实现/已取代 + 指向 roadmap 与提交号）；`memory-system-optimization-plan.md` 标注"UI 部分已并入 ui-optimization-plan，本文档仅存档"。

### F8 🟢 部署面双源（当前一致，无校验）
**证据**：repo `scripts/` ↔ bank `scripts/` 的 7 个同名检测件 **sha 全部一致**；但一致性靠**人工 `Copy-Item`** 维持，无机检。
**建议**：`check-carriers` 或新 `check-deploy-sync.mjs` 增加"同名件 sha 一致"断言（库根可由 env 取，缺库根时跳过）。

### F9 ✅ 已核对无问题（避免只列问题）
| 维度 | 核对结果 |
|---|---|
| 分层（L1 边表/度数） | 14 源文件 / **30 边** 与磁盘实扫一致；出度并列 7；入度 `targets` 5 ✓ |
| 架构档新鲜度 | **9/9 新鲜**；L2 锚点 **265/265 + 105/105** ✓ |
| 判据/载体机检 | `check-criteria` + `check-carriers`（含 ⑤ 写通道 / ⑤b 键类型 / ③ 标签全覆盖）全绿 ✓ |
| 单一实现 | `importanceOf`/`layeredScore`/`activationOf`/`maturationVerdict` 只在 `criteria.ts`；`recallIndex`/`dedupeBySection` 只在 `targets.ts` ✓ |
| 单库化 + 指针 | 库根唯一；`notes` 为详情层；P 层画像行 ≤3/档 ✓ |
| 容量红线 | MEMORY 53%（2644/5000）· AGENT 26% · USER 28% ✓ |
| 台账分域 | 库内 `maturation.jsonl`；状态区 `ledger.jsonl` / `score-shadow.jsonl` —— 三处文档均已写明 ✓ |
| 提交纪律 | 本轮 6 个提交，每个含 CHANGELOG 段落与验收实测；工作树残留 0 ✓ |

## 3. 修复分档（按风险/收益）

| 档 | 内容 | 风险 |
|---|---|---|
| **D 文档级（可立即做）** | F4 修路由数（本轮已做）· F5 加状态横幅 · F2/F3/F10 语义写入 spec/contract · F7 补 ADR | 极低（纯文档） |
| **M 机检级（低风险）** | **F1-B**（非 doc 字段必须被消费的断言；若选 A 则改代码消费注册表）· **F8** 部署面 sha 断言 · **F6** 统一退出码契约 | 低（不改运行行为，除 F1-A） |
| **B 行为级（需拍板）** | **F1-A**（注册表成为真源：zod 缺省改读注册表）· **F3-②**（自检不阻塞水位） | 中（改默认值来源/时序，需回归） |

## 4. 建议的下一步（最小集）

1. **先做 D**（本轮顺带完成）：文档语义与状态横幅、补 ADR —— 零风险且立刻消除"读文档被误导"。
2. **再做 M**：F1-B 断言（把"写了不生效"变成机检红灯）+ F8 sha 断言 + F6 契约 —— 这三条都是**防止同类缺陷复发**的护栏，与我前几轮修掉的三次实测缺陷同族。
3. **最后 B**（拍板后）：F1-A 让注册表成为唯一真源；F3-② 把自检移出水位路径。

_建立 2026-09-11 · 依据：精确检索（注册表字段消费计数 / 路由计数 / 水位条件行号 / 退出码判读 / 部署面 sha / ADR 列表）+ 架构档与八份方案档通读。本报告只记录发现与建议，**除 F4 文档修正外未改任何代码**。_
