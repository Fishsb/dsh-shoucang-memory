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

## 5. M 档已落地（2026-09-11 · 提交 `check-runner` 批次）——**F1 的范围被实测修正，比初判更广**

| 项 | 落地 | 实测结果 |
|---|---|---|
| **F1-B 字段角色机检** | 新增 `scripts/check-field-usage.mjs`：注册表 `fieldRoles`（键=导出常量.字段，值=`runtime｜doc`）**双向校验**——声明 runtime 必须被消费、声明 doc 必须未被消费（标记说谎即红灯）。判据=**文件级**（常量被 import ∧ 文件内出现 `.字段` 属性访问形态），容别名（`s.alphaImp`）与 cast（`(CARRIERS as …).tags`），且**排除**常用词误判（`enforce`/`step` 作参数名时不再算消费——这是收紧前后各测一次才定准的） | **PASS（30 项角色与实现一致）**；同时暴露：**`L0` / `GATE` / `HEALTH` / `TRIGGER` 四个导出常量无人 import**、`SURFACE.*` 全块为 doc |
| **F1 范围修正（重要）** | 初判"三处双源"（`SCORE.mode`/`SURFACE.injection`/`TRIGGER.idleMs`）**偏窄**：实测 **五块整体是 doc** —— `L0.*`（`evaluateL0` 用代码字面枚举，不读注册表取值域）、`SURFACE.*`（`recall.topK`/`fusion`/`threshold`/`rerank`/`mcl` 运行时真源在 `vec.ts`/`scheduler.ts`）、`GATE.*`、`HEALTH.*`、`TRIGGER.*`；真正 runtime 的只有 `SCORE.alphaRel/alphaImp/alphaRec`、`MATURATION.A0/step/gate`、`CARRIERS.tags` | ⇒ **B 档（F1-A）工作量较初判更大**：若要"注册表即真源"，需逐个接线（L0 取值域 → `evaluateL0`；SURFACE.recall/fusion → vec/scheduler；GATE/HEALTH → 两个 .mjs；TRIGGER → scheduler） |
| **F8 部署面机检** | 新增 `scripts/check-deploy-sync.mjs`（同名件 sha1 比对；库根缺失 ⇒ **exit 3 诚实跳过**） | **当场抓到一次真实漂移**：`test-layering.mjs` 库内是**旧版**（我改过它却漏同步）⇒ 已同步，现 **一致 7 / 不一致 0** |
| **F6 退出码契约统一** | 新增 `scripts/check-runner.mjs`（**唯一实现**契约 `0=pass · 3=skip(依赖缺失) · 其他=fail`），`npm test` 的检测段改为经它运行；`check:all` 便捷入口 | `npm test` 复跑：**5 pass / 0 skip** + 40+30+18+18 + check-hardcode ✅ |

**这类护栏的价值已被证明**：F8 落地当天就抓出一次"库内跑旧逻辑"的漂移——此前只能靠人记得 `Copy-Item`。

## 6. B 档已落地（2026-09-11）——**F1 闭环：注册表成为真源**

**接线清单（注册表 → 代码真源）**：

| 注册表字段 | 接到哪里 | 实测（端点） |
|---|---|---|
| `trigger.idleMs` / `probeAfterMs` / `probeWindowMs` | `scheduler` zod 缺省 | `/deepsleep` → `idleMs=10800000·probeAfterMs=10800000`；`/deepsleep/config` → `ProbeWindowMs=60000` ✓ |
| `trigger.newTracesMin` | `distill` 深睡痕迹门槛（`traces.length < min` ⇒ no-traces） | 与旧语义等价（缺省 1）✓ |
| `trigger.manual` | `panel` `POST /deepsleep/trigger` 守卫（false ⇒ 403） | 实测 **409 already-running**（未误伤手动触发）✓ |
| `score.mode` | `scheduler.scoreWeights` 缺省 | `/config` → `scoreWeights=v2` ✓ |
| `maturation.enforce` | `scheduler.maturationEnforce` 缺省 | `false` ✓ |
| `surface.injection.carriers.profile` | `scheduler.injectProfileRows` 缺省 | `3` ✓ |
| `surface.injection.levelCaps` | `panel` 档位行数上限（原硬编码 `{low:2,…}`） | `/criteria` → `levelCaps` ✓ |
| `surface.fusion.k` | `vec` RRF `k`（原硬编码 60） | `k=60` ✓ |
| `surface.fusion.kind` / `surface.recall.coldFactorPercent` / `surface.threshold.tOn` / `surface.mcl.*` | `scheduler` 各 zod 缺省 | `/mcl/status` → `阈值=0.65·topK=3·budget=600·nudges=1` ✓ |
| `l0.*.values` | `criteria.ts` 的 L0 字面量（`l0Pick()` 按名取值，**注册表删值即抛错**） | `typecheck`/`test-layering` 全绿 ✓ |
| `GATE.caps/notesWarn` · `HEALTH.R/K/notesWarn` | 写门 / 体检脚本读**投影** `criteria-gate.json` | 体检 R/K 由投影提供 ✓ |

**仍为 doc（有意保留，非缺口）**：`SURFACE.rerank`（声明闸门，尚无代码）· `CARRIERS.renderers`（仅机检门消费——元操作）· `GATE.exit`（退出码在脚本内建）。

**机检自纠两次（防"判据说谎"）**：① 字面 token 检索被别名/cast 骗过 ⇒ 改**文件级**判据；② 消费者集合最初把 `gen-*`/`check-*` 算进去，导致 29 项全判 runtime（**判据自我满足**）⇒ 排除元操作，并明确 `runtime⇒必须被消费`（硬红灯）与 `doc⇒疑似消费仅告警`（因 `process.exit` 会撞 `GATE.exit` 这类假阳性）。现：**PASS（32 项）**。

## 7. 实测轮（2026-09-11）——**测试抓到 3 个真缺陷 + 1 次未遂事故**

> 方法：干跑预测 → 端点/台账/审计取证 → 下钻复现 → 修 → **端到端证明**。对齐 `[原则] 结果验证重实证`。

### 7.1 台账与自检（健康面，实测通过）

| 项 | 实测 |
|---|---|
| 统一台账 | **16 行**，五类事件齐备：`decision.ingest 7 · write.ingest 1 · check.sleep 6 · decision.consolidate 1 · write.consolidate 1` |
| **睡眠自检三触发全部实战发生过** | `check.sleep` 的 `trigger` 分布 = **`timer 3 · manual 2 · deep-sleep 1`** ⇒ 睡眠期自检在**真实深睡**后确实执行 ✓ |
| 深睡审计新字段 | 最近一行 `stop=completed attempted=3 added=0 gate=all-rejected`（M2 逐条裁决生效） |
| 自检裁决 | `/selfcheck` = **ok**（六项全 pass） |
| 部署镜像 | lib/panel·scheduler·distill·criteria + client + criteria.json/gate.json + health 脚本 **8/8 sha 一致** |

### 7.2 缺陷 1（**最重要 · 已修**）：写门 30 字硬上限与 prompt 错位 ⇒ **深睡长期零产出**

**现场证据**：最近一轮深睡 `attempted=3 · added=0 · gate=all-rejected`，被拒原文是三条**高质量原则**，原因全是 `[gate:行格式违规]`；
**复现报错**（把原文喂回写门）：`概况超30字(31)/(38)/(36)` → **exit=4 硬拦截**；边界实测 **30 字过门 / 31 字拒收**。

**根因链条（四环三断）**：

| 环 | 修复前 | 修复后 |
|---|---|---|
| 注册表 | ✓ 有 `ingest.format.index-line.params {summaryMax:30, pathSummaryMax:40, topicMax:12}` | ✓ 加实测根因 note |
| 投影 | ✓ `criteria-gate.json.format` 已携带 | ✓ 不变 |
| 写门 | ✗ **硬编码 `isPath?40:30`，从不读投影** | ✅ 读投影（自足解析，见 7.4） |
| prompt | ✗ **判据段里"30"出现 0 次 ⇒ 模型不知道有上限** | ✅ 生成器把约束**派生**进两个判据段（摄取域 + 巩固域各一次），并指示"压不进就把细节写 notes，索引只留短概况" |

**端到端证明（注册表即真源）**：仅把**投影**改为 `summaryMax=28`（注册表仍 30）→ **29 字被拒、28 字过门** ⇒ 门确实读投影而非硬编码；还原后 30 过 / 31 拒 ✓。

### 7.3 缺陷 2（已修）：审计行漏 `gateExit`
`distill.ts` 深睡审计行带 `gate` 却不带 `gateExit`（写入回执 ledger 行有）⇒ 补 `gateExit: app.gateExit`（实测"带 attempted 的行 1/1 缺 gateExit"）。

### 7.4 未遂事故（已修 · **测试的最大价值**）：`proj` 作用域 ⇒ 门 ReferenceError 被伪装成"容量超限"
写门里我引用上方 `proj`，而它定义在**更窄的块**内 ⇒ 模块加载即 `ReferenceError: proj is not defined`，被调度器读成 **exit=1（容量超限）**。
**若不测，下一次真实深睡写入会全部假失败且报错方向完全误导**。改为自足解析（由 `import.meta.url` 定位投影 + 内建缺省回落）。

### 7.5 假阳性更正 + 护栏扩展
- **假阳性**：`/mcl/status` 未暴露 `topK`，我的测试脚本据此误判"`surface.mcl.topK` 未生效"——实查 `scheduler.ts:646 topK: Number(config.mclTopK)` ⇒ **早已生效**。已给端点补 `topK` 字段（提升可观测性），复跑后 7/7 注册表↔运行时一致。
- **护栏覆盖缺口（已修）**：`check-deploy-sync` 此前只比对 `scripts/` ↔ 库，**漏了 `skill/scripts/`**（技能本体脚本）——本次 `memory_write_gate.mjs` 漏同步正是靠端到端验证才暴露。扩展后立刻抓到 2 件漂移（`skill/scripts/memory_write_gate.mjs` + 自身副本），现 **一致 24 / 未部署 12 / 不一致 0**。

### 7.6 **修复效果实测（决定性）**：真实深睡三轮对比

手动触发真实深睡（`POST /deepsleep/trigger`，每轮均 `HTTP 200 result=done`，耗时约 10s）：

| 轮次 | 改动 | attempted | added | gate / 拒因 |
|---|---|---|---|---|
| 08:32 | **修复前** | 3 | **0** | `all-rejected` · 概况 31/38/36 字（超 30 字硬门） |
| 08:48 | 仅把**字数**约束注入 prompt | 1 | **0** | `all-rejected gateExit=4` · **`[路径]` 步骤内嵌 `→` 与指针箭头歧义**（我漏派生了 `forbidArrowInPath`） |
| **08:50** | **全参数派生**（`forbidArrowInPath`/`requireMiddleDot`/`requirePointer`/`banDate`/字数 全覆盖） | 1 | **1** | **`pass` gateExit=0** ✅ |

**落盘核验（不是"接口成功"）**：① `AGENT.md` 实际含新行 `[路径] 插件运行时注入 · … ①…⑤ → notes/env.md §插件注入`（18 行 / 1053 字符）；② 台账 `write.consolidate` 最新 `verdict=written written=1 reason=pass gateExit=0`；③ **库 git 自动快照** `839b281 memory: deep-sleep @ 2026-09-11T08:50:59`；④ 对账健康度：**"上次有效深睡"由 2026-09-09 更新为 08:50:59**、连续空转 **0** 轮、R 层 +1（新写的 `[路径]` 行）；⑤ **下一轮注入面已可见该行**（闭环：prompt 约束 → 模型合规产出 → 写门通过 → 落盘 → 注入可见）。

### 7.7 又两个发现（其一为测试侧假阳性，其一为真缺陷）

| # | 结论 | 证据 |
|---|---|---|
| 4 | **撤回（测试侧假阳性）**：库 git "dubious ownership 失败" | 我的核验用裸 `git -C`；插件 `bank-git.mjs:22/24` **本就带 `-c safe.directory`** ⇒ 库 git 一直正常，且已有本轮快照 `839b281` |
| **5** | **真缺陷（已修）**：对账"闭合 ⚠ 有差异"**报警疲劳** | 台账窗口覆盖不到 M2 之前的历史行 ⇒ 差异恒在、闭合判定失真。改为**自举基线**（首次运行落 `audit/row-baseline.json`）+ 只判定"基线之后"的**未解释差异** ⇒ 现 **✅ 未解释差异 0**，历史行显式豁免 |

### 7.8 实测修正了自己审查结论的分级
**F3-② 降级 🟡中 → 🟢低**：原按 `sleep-selfcheck` 超时上限 180s 估计"拖长深睡尾路径"，**实测 6 项检测仅 0.9 秒**（79 行库规模）⇒ 影响可忽略，不必为它改时序。

### 7.9 产出物**质量**核验（过门 ≠ 有用）与新增 F11

**质量核验（通过）**：新写入行 `[路径] 插件运行时注入 · … → notes/env.md §插件注入` 的指针**有效性**与**内容充分性**均实测：
`notes/env.md §插件注入` 小节**存在**（7205 字符 / 61 行），内容含完整六步（`status→self_test→scaffold→build→inject→uninject`）与注意项 ⇒ **精简概况没有造成信息损失**（细节确实落在 notes，符合「压不进就写 notes」设计）。

**F11（新发现 · 内容组织债，**不自动改**）**：笔记小节层级失真 + 主题重复——`notes/env.md` 的 `## DSH 环境` 下挂 **10 个 `###`**（其中 `### 记忆库与内核概览`/`### 检索链路与桥` 显然不属于"环境"），且 `### Windows npm 执行策略` **同时**又以独立 `##` 章节存在（L100）；`notes/lessons.md` 的 `DSH 自托管约束` 与 `Windows 系统运维与数据安全` 各挂 8 个 `###`；`notes/flows.md` 的 `全局工程纪律` 挂 7 个。
**处置**：笔记是**私人记忆数据**（守「数据先问」）⇒ **不擅自重排**；改为把该项做成**体检建议**，落进 `memory-reconcile` 新增 **⑥ 笔记结构体检**（章节下 `###` 计数 + 同名主题既 `###` 又 `##` 检出，只报告不修改），并让**扫描失败显式可见**（`notesHealth.scanError`——实测踩过 `readdirSync` 未导入被裸 `catch` 吞成"0 文件 = 健康"，与 7.4 的 `proj` 同族：**静默兜底会伪造健康**）。实测现报 **8 文件 / 37 章节 / 39 子节 · 4 处收纳筐 + 1 处主题重复**。






_建立 2026-09-11 · 依据：精确检索（注册表字段消费计数 / 路由计数 / 水位条件行号 / 退出码判读 / 部署面 sha / ADR 列表）+ 架构档与八份方案档通读。本报告只记录发现与建议，**除 F4 文档修正外未改任何代码**。_
