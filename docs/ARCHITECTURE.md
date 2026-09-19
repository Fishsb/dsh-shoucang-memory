# ARCHITECTURE.md — shoucang 记忆子系统架构（对齐 2026-09-12 · 根治 A–D 后）

> 状态：2026-09-09 用户拍板「对齐 + 向量默认启用 + 控制实际使用效率与 token 消耗」后定稿；
> **2026-09-12 架构根治 A–D 完成后修订载体归属**。
> 性质：架构文档（开发主地图）——本文档是「当前架构长什么样」的唯一权威叙述。
> ⚠ **不再有「指纹过期自动重生成」**：该机制随治理插件（project-nav）0.10 换代被**移除**
> （实测 `verify-install.ps1` 输出「架构档指纹机制已移除」）。现口径 = **代码变更后人工重生成本文**，
> 并由治理模型登记落点做偏移检测。
> ✅ **2026-09-14 P1 起有「部分机检」兜底**（订正：此处此前写「文档与代码不一致已无机器兜底，属人工纪律」）：
> `scripts/check-arch-sync.mjs` 把**可程序化提取的**声明逐条对实测——① `AGENTS.md` 模块数 · ② 本文模块数 ·
> ③ 注入预算 ⟷ 注册表 `surface.injection.budgetChars` · ④ 已退役 `-share` 哨兵（含泛称）· ⑤ 审计脚本输出口径 ·
> ⑥ **接线声明 ⟷ 注册表 `wiring.pending`**。**语义漂移（如「某链路怎么走」）仍无兜底，那部分仍是人工纪律**。
> 上层参照：DSH 内核（L0）不在此文档范围——本文只描述 **shoucang 在 DSH 地基上的记忆/自我子系统**。

## 1. 设计约束（用户拍板，优先级从高到低）

1. **实际使用效率 + token 消耗是唯一硬约束**：一切设计取舍的目标是「在尽量不降低实际使用效果的前提下省 token」。
2. **部署难度、插件复杂度、电脑性能占用可放宽**：不因复杂/重而拒绝方案（本地模型/服务/多模块均可接受）。
3. **质量为先**：模型/机制选择在性能允许内取质量档（如嵌入用 bge-m3 1024d 而非小模型）。
4. **零硬编码本机路径**（开源红线）· **隐私红线**（_memory 不入库）· **跨工作区红线**（项目事实不落全局库）。

## 2. 分层（在 DSH L0 地基之上）

```
L0 DSH 内核（不动）：agent-loop / session 事件溯源 / 压缩 / 沙箱 / goal / subagent —— 见 DSH 官方文档
L1 shoucang 记忆/自我层（本文档主体）
L2 认知执行（preset + task-protocols 人化循环）
L3 能力层（工具注册 / MCP / skills）
L4 交互（DSH Web GUI）
```

## 3. L72 模块划分（当前实现）

| 模块 | 载体 | 职责 | 效率设计 |
|---|---|---|---|
| **M1 画像** | `AGENT.md`(自)/`USER.md`(人) | 自我认知+用户认知，会话注入 | 薄行指针（非正文）；容量画像 3000/3000 · 记忆 5000 |
| **M2 情景** | `audit/episodes.jsonl` | 任务发生+结果（同类判定数据源） | 轻行 {sid,intent,route,outcome}；上限 256 淘汰 |
| **M3 经验** | `notes/*.md` 索引行 | 泛化知识，按需懒展开 | 索引=指针；详情 read_section 按需 |
| **M4 召回** | `shoucang_recall` + `recallApprox` | 任务前查经验 | 词法地板（0 依赖）；零命中给主题地图 |
| **M5 转正** | `pending/flow-candidates/` | 候选→[路径] 数据源 | intentTokens 指纹同型聚合 + 跨会话计数 |
| **M6 蒸馏** | `distill.ts`（装配 114 行）+ `distill-*` 15 件分域模块 | 会话结束沉淀 | idle≥10min + minTurnChars 200 + 预筛信号词（零 LLM 成本跳过） |
| **M7 深睡** | `deepsleep-machine.ts`（会话状态机 FSM，阶段 D 自装配层迁出）+ 其余 `deepsleep-*` 9 件 | 停滞≥3h 归纳 [原则]/[路径] | 窗口痕迹预算 12000+18000；done 才推水位。⚠ **装配入口当前挂在蒸馏产线内**（`distill.ts:271` `createDeepSleep`，且 `deepsleep-core.ts:13` 明言"不放需要访问 registerDistill 闭包状态的代码"）⇒ 维护链**无独立注册入口**；独立化是 **S3** 的目标（S1 只做标注，不迁移） |
| **M8 注入** | `panel-shared.ts` 的 `buildHotMemoryText` + `mcl.ts`（慢通道线索化召回；**独立注册于 `scheduler.ts:689` `registerMcl`**，独立额度 600 字符、快/慢双通道 + 会话级去重台账——2026-09-14 S1 补注：此前只在与 M8 同列，未标其独立产线地位） | 会话开头热记忆 / 任务首步线索注入 | 预算 **4000** 字符（注册表 `surface.injection.budgetChars`，由 `check-arch-sync` 守；含情境槽 300）；delta 预留字节 |
| **M9 向量** | vec.ts `recallRanked` | 语义召回（融合） | 见 §5 |
| **M10 自省** | `assistant_capabilities` | 能力面查询 | 只读，无 token |

> **载体归属口径（2026-09-12 根治 A–D 后；2026-09-14 P1 订正）**：
> `src/` 共 **94 模块**（**排除生成物 `criteria.generated.ts`**，与 `audit-fnspan` 同口径；
> **2026-09-20 新增 `probe-config.ts` / `probe-plan.ts` / `trigger-plan.ts`** ⇒ 91 → 94：深睡/蒸馏**触发链**
> 四册（S-P2a..P4）。`probe-config.ts` = 探测域（8 键）配置**单一事实源**（schema 与显式映射同处一文件，
> 防「schema 有 ≠ 运行时 config 有」），按**领域接缝**自 `scheduler.ts` 抽出（解其冻结棘轮）；
> `probe-plan.ts` / `trigger-plan.ts` = 本轮新增判据的纯函数区（`planProbeOutcome` · `planSleepWindow` ·
> `dueSelfCheck`）——抽出的**硬理由**是 `deepsleep-core.ts` 导出数受 `audit-architecture` 棘轮约束
> （阈值 35 · 只许收紧，抽出前实测 34 ⇒ 就地新增即破），而放松棘轮属须用户拍板之事（R3）；
> 两者**只向下**依赖 `deepsleep-core`（取类型）⇒ 零环。
> **2026-09-19 新增 `section-supply.ts`** ⇒ 89 → 90：**指针供给三册**册一「小节地址供给」
> （复用 `section-ref#sectionTitles` 作**唯一解析器**、不新写；预算逐级降级 + `buildDistillUserInput` 纯装配
> ⇒ 「接线 ≠ 抵达」可机检）——判因：蒸馏 prompt 要求「section = **既有** ## 小节名」而材料里**从未注入清单**
> ⇒ 模型编名（抽查 5 个悬空名在真库 334 个两级小节中 **0 命中**）；判据 `check-section-supply`。
> 同日另落（同批，均不在 `src/` 计数内）：`section-ref` 的 `resolveLevelInParent`/`planPlacement`（写侧放置语义）、
> `memory-append` 删本地 `matches`/`findChild`、`distill-write` 段级成对裁决 + 画像行 § 准入。
> **2026-09-19 新增 `ingest-admission.ts`** ⇒ 88 → 89：蒸馏**准入判定单一实现**
> （`planIngestAdmission` 决策表「无增量 → 熔断 → claim → 不在途 → 宽限 → 放行」+ `quiescenceOf` 静默三态
> 「子代理 / status / inbox」+ `lastTurnEndMsOf` 把宽限期来源从**内存态**换成**持久事实**）——
> 判因：三处触发（扫尾 / idle 入口 / 手动入口）原先各一套口径，且宽限期只看内存 `sleep.sessions`
> （热重载实测 **220 次** ⇒ 重载后 30 秒必蒸，5/5 配对）；本模块被三处共用，判据 `test-ingest-admission`。
> **2026-09-19 新增 `sleep-report.ts`** ⇒ 86 → 87：S2S3 册四/册二第二段「睡眠汇报 + 问题标记 + 影响账」——
> 同日多轮**追加不覆盖**（日历式永不删除）· `audit/sleep-reports.jsonl` 每轮一行且**影响账并入该流**
> （会审裁定不另开 `audit/impact/`）· 标记**只标不处置**且 `suspect-recall`（召回面）与 `suspect-quality`（记忆面）
> 分开计数 · `injected` 显式记 `unknown`（步级遥测无法按条目归属，**不拿代理指标冒充判据**）。
> **2026-09-19 新增 `session-review.ts`** ⇒ 85 → 86：S2S3 册一「L2 会话级复盘」——
> **append-only 校正提案流**（`<bank>/audit/session-review/proposals-<sid>.jsonl`，**执行权留 S3**：
> L2 若直接改库就撞 S2 的「只增不改历史」硬不变量）· **三态审计**（`not-triggered`/`skipped-by-threshold`/`reviewed`）
> · 幂等键 `(sid, reviewedSeq, opHash)` · 依赖白名单（禁 `treeops`/`forgetops`/`sectionops`/`deepsleep-*`/`panel-*`，
> 且不得持有写入原语）由 `check-session-review-scope` 机检、行为判据由 `test-session-review` 守。
> **2026-09-19 新增 `bank-lock.ts` / `section-rewrite.ts`** ⇒ 83 → 85：S2S3 册零「落盘一致性与单写者」——
> **库级单写者锁**（`<bank>/.write-lock`，mkdir 原子取锁 / 进程内与跨进程（env）双重重入 / 陈旧接管留证 /
> **拿不到即拒写** fail-closed）与**唯一写入原语**（唯一 tmp 名 + 原子 rename + 写后回读校验 + 带门禁写）；
> 跨面零依赖孪生 `scripts/bank-lock.mjs` ≡ `skill/scripts/bank-lock.mjs` 由 `check-bank-lock-parity` 差分锁守，
> 不变量与先红见 `scripts/test-bank-lock.mjs`（无锁形状丢更新 8/16 · 真路径 0 丢更新）。
> **2026-09-19 新增 `section-ref.ts`** ⇒ 82 → 83：S1R「小节寻址单一语义」——三态
> `exists/ambiguous/missing`（**歧义 ≠ 不存在**）+ 一行多指针提取 + 索引行准入；
> 跨面同源（库工具链 `skill/scripts/section-ref.mjs`）由 `check-section-ref-parity` 差分锁守。
> **2026-09-18 新增 `supply-stamp.ts`** ⇒ 81 → 82：IR1 册四「缓存失效单一判据」——库戳 ∪ 介质戳 ∪
> 观测用 warm 戳 + 层归因（`session/context/query/event/ttl`）；旧状是**四套口径各自为政**，
> 且两层介质（activity/delta）只在内层键里 ⇒ 运行时"改了介质却不重建"。
> **2026-09-18 新增 `cue-space.ts`** ⇒ 80 → 81：IR1 册二「cue 键空间统一」——归一 / 校验 / 解析 / 序列化
> 的**唯一实现**（旧状：写侧私有归一 + 读侧无同源 ⇒ 同一工作区劈成正反斜杠两种拼写，实测新记录命中
> **0/119**；收敛后读侧键 ∩ 新记录键 = **73**）。
> **2026-09-18 新增 `relevance-supply.ts`** ⇒ 79 → 80：IR1 册一「动态面相关性重建」——分层配额选行
> （memory-index / agent-principles / profile）+ 桥读取 + **降级记账** + 注入侧预热；
> 抽出动因是**缺陷**而非整洁（旧实现按 `file==='MEMORY.md'` 单点过滤 ⇒ AGENT.md 命中全丢 ⇒
> 实测真命中词 vs 乱码词注入面 63/63 行相同），抽出后 `dynamic-select.ts` 只留补齐与合并。
> **2026-09-18 新增 `hot-stable.ts`** ⇒ 78 → 79：按域路由 P1「恒定面单独出口」，**按领域接缝**自
> `panel-shared.ts` 抽出恒定面构造（双画像块 + 块内配额 + 留痕 + 缓存判定）——抽出动因是该模块受
> `check-module-growth` 大模块冻结棘轮约束（基线 537 + 容差 15），`buildStable()` 内联即撞顶（实测 553 FAIL）；
> **2026-09-17 新增 `secret-redact.ts`** ⇒ 77 → 78：内容级凭据过滤的**单一实现**（纯函数
> `findSecrets` / `hasSecret` / `secretWarnings`，零 IO）。判因（**已发生事实**）：库内
> `pending/flow-candidates/*.md` 实测含**明文 API 密钥**（用户原话"这是我的秘钥"），
> 而该目录是**待蒸馏吸收通道** ⇒ 会话原文 → 蒸馏 → 库 链路上无任何内容级过滤。
> 定层（arch 裁决）：凭据的危险是「**内容本不该存在**」⇒ **写入侧**处置 —— 与 `inject-guard`
> 的出口处置（`{{` 的危险是消费面属性）是**同一成因的两个投影，不可互替**。
> 与 `skill/scripts/memory_write_gate.mjs` 内联的同源规则表**须同批同改**（该件是子进程活件、
> 零依赖，不得 import `src/`）。
> **2026-09-17 新增 `panel-guard.ts`** ⇒ 76 → 77：面板路由**来源栅栏**的单一实现（纯函数
> `judgePanelRequest` / `isLoopbackHostname`，零 IO）。判因（**实弹实证**）：守藏以
> `kind:'exact'` 注册 `/api/shoucang-panel/*`，宿主 `dsh-host-webserver` 的 `match()`
> **exact 优先于 prefix** ⇒ 绕过挂在 `/api` prefix 上的来源栅栏；实测伪造 `Host: evil.com` /
> 跨站 `Origin` / `sec-fetch-site: cross-site` **均返回 200**（对照宿主 `/api` → 403）。
> 本体落新件是因 `panel-shared.ts` 受大模块冻结棘轮约束（顶格），并避免就地写顶穿该门。
> **2026-09-17 新增 `inject-guard.ts`** ⇒ 75 → 76：注入边界 `{{` 防护的**单一实现**（纯函数
> `guardContextText` / `wouldThrowHostInterpolation`，零 IO）。判因：宿主 `dsh-system-prompt`
> 的 `interpolate()` 以 `text.indexOf("{{")` 为唯一扫描锚点，完整 `{{...}}` 组会触发三处 throw
> （`lib/index.js` L158/L164/L167）并冒泡到 `assemble` ⇒ **该轮请求整体失败、记忆永久在库
> ⇒ 会话永久不可用**。主持人与两处注入出口（`panel-inject.ts` order 88 / `mcl.ts` order 89）共用此实现。
> **2026-09-17 新增 `proc-async.ts`** ⇒ 74 → 75：D-I4 把「异步子进程调用」抽成**单一实现** —— 原先四处
> `execFileSync` 在**同步 HTTP handler** 里独占宿主唯一事件循环（上限 180s / 30s / 30s / 12s）。
> **2026-09-17 新增 `file-stat-cache.ts`** ⇒ 73 → 74：D-I5 按 `(mtimeMs,size)` 失效的文件读取缓存 +
> 真字节级尾读。**缓存键＝生产者标识 + 路径**（不能只用路径：`statSize` 与 `nonEmptyLineCount`
> 同路径不同物，首版因此把**字节数当行数**返回 —— 本轮实测抓到的真 bug，已修并留证）。
> **2026-09-17 新增 `situation-supply.ts`** ⇒ 72 → 73：情境槽读侧供给（`situationLinesOf` 自
> `panel-shared` 抽出 + 受控词表 `knownTaskCuesOf`）。抽出动因同 `injection-playbook`：
> `panel-shared.ts` 受大模块冻结棘轮约束（当时基线 547 / **顶格零余量**），而情境轴补第二个键
> （`task`）需在该文件加行 ⇒ 先抽后改。抽出后实测 537 < 547 ⇒ 基线同步收紧至 537。
> 2026-09-14 阶段 4 自 `treeops` 拆出 `forgetops.ts` ⇒ 62 → 63，依赖严格单向 forgetops → treeops；
> **同日 S0 新增 `content-types.ts`** ⇒ 63 → 64：内容类型契约查询层，只读生成物 `CONTENT_TYPES`、
> 零依赖零 IO，回答「某类信息由谁产/存成什么/被哪层按什么判据消费/是否可达」，由
> `scripts/check-content-types.mjs` 机检（`reachable:true` ⇒ 消费侧必须存在对应通路实现）；
> **同日 S4-2 新增 `injection-playbook.ts`** ⇒ 64 → 65：三层判据常驻块（判据文本，147 字符）。
> 它**单独成件的原因本身就是一条架构约束**：`panel-shared.ts` 受 `check-module-growth` 的
> **大模块冻结棘轮**约束（基线 831 / 容差 15），内联该块会当场 FAIL —— 门禁的出路即"新功能落新模块"）。
> **同日 S4-6′ 新增 `recall-diagnosis.ts`** ⇒ 65 → 66：召回零命中归因（纯函数，判定序与 `mcl#decideTurn`
> 的 `fast` 判定同序）。同样因 `mcl.ts` 在冻结名单内（基线 617）而落新模块；审计新增 `rowsN`/`missReason`
> —— 此前 81.7% 的步 `hit` 为空却**说不出为什么**（"没得召回"与"召回了但不熟悉"在审计上都是 `hit:''`）。
> ⚠ **本数字由 `scripts/check-arch-sync.mjs` 机检**（改模块即红）；**明细不再手写**——
> 手写明细必然漂移（实测：本处曾写「72 模块」而其分项相加只有 **53**，**文档自身都不自洽**；
> 并曾把已全部退役的 3 个 `-share` 惰性桥列为现存件）。要明细请**按领域现查**：
> `node scripts/audit-architecture.mjs`（分层 / 扇入扇出 / 可变全局）·
> `node scripts/audit-fnspan.mjs`（函数跨度）· `node scripts/check-bridges.mjs`（惰性桥，目标 0）。
> 上表「载体」列给**真实归属模块**，不再指向已收敛为纯装配的入口件；依赖一律按领域窄传
> （实现函数在模块级、依赖作首参 `d: XxxDeps`）。

### 3.1 本会话新增模块（P4 存储解耦 + G0–G4 内容环 / 读侧 · 2026-09-13）

| 归属 | 模块 | 职责 | 守它的件 |
|---|---|---|---|
| **P4 存储解耦（G0）** | `record-store` | Record 事实源模型：id 内容指纹派生 · **主体是字段**（`companion:<id>` 可扩展）· **双时间戳** · 环专属 `meta` 槽 · 生命周期迁移 | 导出 ≤35（架构棘轮）· `check-record-parity` |
| | `record-shadow` | 影子写与对账：**只镜像不回写 md**；镜像**承接状态位**（命中/活性/成熟度/双时间戳/meta） | `test-record-store`（67 条） |
| **内容环（G1–G3）** | `rings` | 环注册表：`kind→环` **唯一声明处** · 免频率门契约（`decision`/`association`）· **`RING_KPI`** | `check-ring-coverage`（含 **KPI 机检门**） |
| | `decision-ring` | 裁决 → **后果回收** → 价态（**没有回收就没有认知**） | `test-decision-ring`（48 条） |
| | `relation-ring` | 关系 + 承诺状态机 + **双向兑现率**（我欠 / 欠我 分开统计） | `test-relation-ring`（35 条） |
| | `association-ring` | 碰撞记录（**跨度门**：两锚点须带 `§` 且小节不同）+ **越界召回**（不读任何相关性分） | `test-association-ring`（52 条） |
| | `fact-ring` | **时态失效**（`validFrom/validTo`；坏时间戳 **fail-closed**）——与 `lifecycle` **正交** | `test-fact-ring`（40 条） |
| **事件流（G0）** | `ring-events` | 9 种 op · 差分推导（载荷逐字取自 `meta`）· **重放** · **对账**（重放必须能重建状态） | `test-ring-events`（28 条） |
| **读侧（G4）** | `supply-assembly` | 候选集（分层 + **时态剔除**）+ 预算装配（三层 + **联想独立槽**）+ **溢出全量记账** | `test-supply-assembly`（40 条） |

> **环内容只活在 Record 里、不进 md**（决策/后果/价态/关系/承诺/碰撞 `file=''`）：它们不属于三索引，
> 塞进去只会挤占注入预算。人读与操作走 `scripts/record-ring.mjs`
> （`--score` / `--facts` / `--open` / `--commitments` / `--serendipity` / `--events` / `--reconcile`）。
>
> ✅ **接线实态（2026-09-14 P0a 订正；本块此前写「未接线」，已作废）**：
> **`supply-assembly` 已接线**——`panel-shared.ts:21` 导入 · `:362` `supplyUsageMeta()` 内 `:368` 调 `assembleSupply` ·
> 在 `buildHotMemoryText` 的 `:661` 处以**影子记账**消费（其余槽 blocks 一律丢弃 ⇒ 除情境槽外注入文本逐字节不变）；
> 结果经 `:330` `supplyUsage()` 只读出去，`panel-inject.ts:375/379` 的 `GET /inject/preview`·`/inject/stats` 回带
> ⇒ 读侧硬预算与溢出记账**首次在运行时生效且可观测**。
> **唯一 composition root 已落地**：`src/composition.ts`（消费方 5 处：`index.ts:18` · `panel.ts:45` ·
> `scheduler.ts:28` · `panel-arch.ts:27` · `panel-observe.ts:16`）。三条 `-share` 惰性桥已全部退役
> （`check-bridges` 实测**发布侧 0 边 · 消费侧 0 边**），跨域句柄一律经 composition root 显式传递。
> **防复发（2026-09-14）**：接线类断言 ⇒ `check-arch-sync` ⑥ 单向绑定到注册表 `wiring.pending`（实测 **0 条豁免**）：
> 文档宣告某模块缺席运行时接线、而注册表未申报，即 **FAIL**；扇入判定仍归 `audit-architecture`（本门不重算，守单一实现）。

## 4. token/效率预算（可观测基线）

| 环节 | 预算 | 设计意图 |
|---|---|---|
| 会话注入 | ≤3000 字符（三索引薄行+画像） | 常驻有界，不随库增长膨胀 |
| 蒸馏触发 | idle≥10min + 增量≥200 字符 + 预筛信号词 | 零 LLM 成本跳过（无信号=不唤醒子代理） |
| 蒸馏材料 | 增量 ≤24000 + 候选 ≤12000 字符 | 子代理单次裁决有界 |
| 深睡材料 | pending ≤2500/文件、notes ≤6000/文件、notes 总 ≤18000、候选 ≤2400 | 多工作区公平 + 预算有界 |
| 深睡频率 | 停滞 ≥3h 才触发 | 离线低频巩固，不进交互热路径 |
| 召回 | topK≤3 薄行；详情按指针懒展开 | 检索结果不落全文进上下文 |
| **读侧装配（G4，2026-09-13 新增）** | 恒定 1,000 / 变动 600 / 一次性 200 / **联想 0（缺省关）** | 三层硬顶 **每槽独立、互不挤占**；**溢出逐行记账**（`meta.dropped`）——实测真库被挡 **97 行** |

**注入恒有界**：三索引行数受容量红线（字符数）约束 → 注入字节稳定 → 前缀缓存热。此即「画像指针 + 多层设计」省 token 的核心机理。

## 5. 向量召回（M9，2026-09-09 默认启用 · 本地免 token）

- **Provider（2026-09-11 更替）**：缺省 = **Ollama `http://127.0.0.1:11434/v1` + `bge-m3`**（官方库 1.2GB，多语言 1024d，OpenAI 兼容 `/v1/embeddings`，本机免 key）——Ollama 自身随登录自启，**不再需要 nssm 或任何服务管理器**。原路线为自建桥（Xenova q8 + onnxruntime-directml 的 `bge-m3-openai-server-gpu.py`，nssm AUTO_START :9915；服务已随 nssm 卸载停止，**但模型资产仍在 `D:\AI\models\bge-m3`（`onnx/model_quantized.onnx` 543MB）——2026-09-11 检查期以 9916 端口实测 2 秒可起、`/health` 返回 `{ok,model:bge-m3,dims:1024}`，随时可恢复**）——插件侧的「本机端点」判定已泛化为**任意 127.0.0.1/localhost 基址**（探测 `/health` → `/v1/models` → `/api/tags`），故自建桥 / LM Studio（:1234）/ 云端 OpenAI 兼容端点只需改 `embedBaseUrl`/`embedModel`/`embedApiKeyEnv`。零 token、离线；Ollama 常驻显存约 1GB（`OLLAMA_KEEP_ALIVE` 控制）。
- **融合**：词法 top≥8 打底 → 行向量惰性补齐 → dense topK → **dense 0.7 ⊕ lexical 0.3**（min-max 归一）；**词法打底空 → 全量索引薄行池 dense 检索**（语义相似措辞不同的价值场景，不因词法空而漏召）。
- **token/效率账**：每查询嵌入 ≤48 候选行 + 1 查询（本地零 token）；行向量缓存 `.vector-cache.jsonl`（行 hash 惰性增量）→ 冷启（含模型加载）实测 **3.5s**、模型已载时 **~120ms/查询**。
- **降级闭环**：provider 不可用/超时/失败 → 自动降级纯词法，闭环不中断（本机端点超时上限 30s、云端 8s——本地冷启动含模型加载，8s 会误判）。
- **模型选择说明**：现行 = Ollama 官方库 `bge-m3`（1.2GB，自带量化）；原自建桥用 q8（= 原 cjs 服务 dtype 配置）。嵌入模型 int8 检索损失 <5%（[HF 量化](https://huggingface.co/blog/embedding-quantization) 实证 94-100%），质量/资源/速度平衡良好。
- **缓存非事实源**：行文本是权威，`.vector-cache.jsonl` 可随时删除重建（行 hash 失效即重嵌）。

### 5.1 面板能力面（2026-09-10 U1-U6 后）

展示端点（只读、零 token）：`/vector/status2`（provider 探测+缓存+vecStats，替代退役 vector_search.py）· overview 增 `delta/vector/weekDiff` · sections 增 `backrefs`（反链聚合）。
写端点（用户显式触发、全走门禁）：`/embed/config`（GET+POST 合并，写 scheduler.json，重载生效）· `/memory/edit|remove`（临时文件→write_gate→rename 失败回滚）· `/memory/approve`（候选→.processed，双区 flow-candidates/pending）。
前端：记忆板块 §0 状态徽章（蒸馏/向量/pending）+ §7 向量 + §8 delta + §9 周 diff；画像行编辑；pending 批准/忽略；notes 反链；参数「向量与模型·当前链路」节。约束：画像/记忆板块结构零改动（追加式），sc-* 样式语言保留。

## 6. 质量门（写侧防线）

- `write_gate`：容量红线 + §小节存在性（read_section 双向包含口径）+ 格式（索引行标签/日期/指针）。
- `health_check`：容量水位 / 指针完整 / 零召回清单。
- 蒸馏/深睡产物全部经宿主 write_gate → 原子写；子代理不直接写库。
- G30 证据门（claims ≤ evidence_reads）在任务层。
- **读侧/存储侧新门（2026-09-13，均已登记 `check-runner`）**：
  `check-record-parity`（往来闸恒跑 + 影子库对账 + `storeMode=dual` 而影子库缺席即 **FAIL**）·
  `check-ring-coverage`（**每个 kind 必须登记环归属** · 空环须显式申报 · **每个环必须有可机检 KPI**——
  "加了机制却不给仪表盘"与"快通道恒 0 无人知晓"是同一个病）·
  `check-version-pin`（部署三处版本记录 `package.json`/`pnpm-lock.yaml`/`.modules.yaml`，
  **报告态**：不一致仍 exit 0——部署含环境侧步骤，红灯＝假红灯；`--strict` 可作 CI 硬门）。
- **环事件对账**：`.records/ring-events.jsonl` 重放必须能**重建** store 的环记录
  （`node scripts/record-ring.mjs --reconcile`）；四类偏差（缺失/多出/内容不一致/坏事件）都要抓得住。

## 7. 明确不做（防漂移）

- 跨会话主动唤醒/提醒（记忆底座只管记忆，主动行为归上层 agent）
- GUI 操作 / 语音输出（API/CLI 优先）
- 多租户 / RBAC / 实时 SLO（单机单用户）
- 云端 token 型记忆（本地优先；云端仅作 embed provider 可配置项）

## 8. 变更纪律

1. 代码改动先过本文档模块归属（新功能=先改架构→改模块→才写码）；
2. token/效率相关改动必须注明预算影响（进 §4 表或显式论证）；
3. 每模块单目录、明确接口，禁止跨模块顺手改；
4. 架构文档**由人工重生成**——原「按指纹过期重生成（指纹 = src/** + 本文）」机制已随治理插件 0.10 移除；
   **「判过期」仍无机检，但「声明是否与实测一致」自 2026-09-14 起有部分机检**（`check-arch-sync` 六项，见页首）。
   动了模块归属就同步改本文，并由 nav 治理模型登记落点做偏移检测。
   （2026-09-13 本会话把 44 → **72 模块**的归属一次性补齐，2026-09-14 复核再校正为 **62**——见 §3；
   **教训：连续 8 轮改码不重生本文，文档即失真**。机检只覆盖可程序化提取的声明，语义漂移仍须人工补。）
5. **新增机检门一律登记 `scripts/check-runner.mjs`**（未登记＝没写）；本次新增 3 件并各配反向证伪
   （`check-version-pin --selftest` · `check-ring-coverage` 的 stale 申报断言 · `check-record-parity` 的往返闸）。

---
_建立 2026-09-09（用户拍板：对齐 + 向量默认 + 效率/token 硬约束）；来源：源码审计 + token 预算量化 + DSH 官方包核对_
_2026-09-13 重生：模块 44 → **55**（新增 9 件归属见 §3.1）· 读侧装配预算进 §4 · 新机检门与环事件对账进 §6 · 变更纪律补第 5 条_
_2026-09-14 订正：模块 **55 → 62**（口径见 §3，由 `check-arch-sync` ② 机检）· §3.1 末块「未接线」→ 接线实态 · 页首与 §8-4 改口径（部分机检兜底 + 接线声明绑定 `wiring.pending`）_
