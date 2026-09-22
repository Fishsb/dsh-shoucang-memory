# 全仓收口方案（2026-09-21 · v2 架构分册版 · **已执行**）

> **用途**：回答"还剩什么、卡在哪、下一步做什么、谁授权、怎么回滚"。
> **⚠ 本档 v2 已按用户授权「全部自己决策」进入施工态并落地** —— 执行结果见 **§7**（每条附判据与先红）。
> **v2 与 v1 的差别（本次重整）**：v1 按"谁欠谁"分四册（等触发/仪表盘可疑/等拍板/未成档），
> **那是待办视角**；v2 改为**按架构板块分册**——每册挂到 nav 模型的真实节点上（feature / module / 落点文件），
> 每册出**方案 ⟷ 验收成对**（交付物 · 判据 · 回滚），并在册内标注该板块的**架构归属**。
> **口径**：表中每个「现值」都是**本轮实测**（2026-09-21T22:20–22:53Z，**台账末行 22:52:52Z**，附复验命令）；
> **未取证的显式写"未取证"**。与既有档的关系：`docs/OPEN-ITEMS.md`（逐条登记）·
> `docs/evaluation-channel-plan.md §10–§13`（跨板块推进视图）· `docs/handover-2026-09-21.md`（会话压缩）。本档**不取代**它们。

---

## 0. 本轮复验：**三条 v1 结论被推翻，并新发现一条「下次必红」的结构缺陷**（先读这段）

| # | v1 写的 | v2 实测 | 性质 |
|---|---|---|---|
| **订正 1** | M1 归因一致率 = **0/625 = 0.0%** ⇒ "字段没被正确写" | **625 是全部行的 `samples` 之和**，其中 **595 属 `agrees=null`（未判行）**；真正"已判"的只有 **1 条**（`s=30 a=false`，2026-09-21T05:16Z）⇒ **真值是 0/30，不是 0/625** | v1 把"未判"当"判为不一致"**混进了分母** —— 与仓内 `[原则] 代理指标非判据` 同型 |
| **订正 2** | M2 `switchSource` **恒真 95.7%** ⇒ "无区分力、重定义 or 退役" | **M3a 落地（09-21T20Z）后已打破**：切点前 **95.9%** → 切点后 **34.8%**；其中 `judge\|带 topics` = **46/60 = 76.7%**，`judge\|无 topics` = **0/182 = 0%** ⇒ `hasTopics` 门**真的在起作用** | 「恒真」是 **M3a 之前**的旧读数；v1 抄了旧值而没按切点重算 ⇒ **D6 因此注销**（见 §3） |
| **订正 3** | N1「槽位预算接 UI」三册 **查无对应方案档** ⇒ 只是承诺环里一句待办 | **三册代码面均已落地**（实测：`memClass` 26/26 类型齐 · `producers`/`timing` 已删至 0 · `process.gate='tag'` · `situation.budgetChars=1200` 仓内与库内同值）⇒ **真缺口不是"没方案"，而是"面板调不到"**（见册二） | v1 的判据（"docs 里查无"）**判错了对象**：方案在圆桌记录里，产物在代码里 |
| **🆕 新发现 4** | （v1 未涉及） | **M3a 的 `judge` 行把归因取样窗口挤空了**：`deepsleep-run.ts:88-99` 倒扫末 **60 条 `mcl-step`** 取样，而 `judge` 行**不带 `missReason`** 且已占切点后行的 **77.7%** ⇒ 窗口内可用样本 **0**（门槛 30）⇒ **下次深睡归因必然 `insufficient`**。⚠ 末次深睡（10:04Z）在 M3a 切点（20:06Z）**之前** ⇒ **尚未显形，属"下次必红"预警** | **M3a 本身没错，错在没看它的下游消费面** —— `judge` 与 `inject` 进了同一个 60 条窗口。**同族**：本仓反复剿的「加了机制却不看消费面」 |

> **★ 另一个探针自身缺陷（本轮新发现，已定位）**：`_memory/audit/j3u1-rate.mjs:26-27`
> 用 `Number(r.attributionAgrees)` 聚合 ⇒ `Number(null) === 0` ⇒ **把 51 条"未判"行算成"判为不一致"**，
> 打出「累计 0/625 = 0.0%」这个**看着严重、实为假读数**的结论。订正 1 即由它引出。
> 修法在册三（**探针缺陷与产品缺陷一样要修**，否则下一轮还会被骗一次）。
>
> **★ 时间戳陷阱（本轮我自己踩到，记档防再犯）**：复算 E-05 前向判据时，我用
> `Date.parse('2026-09-21T21:00:00')` 当切点 —— **该串无时区标记 ⇒ JS 按本机时区（UTC+8）解析**，
> 而台账 `at` 全是 `…Z`（UTC）⇒ 切点凭空**前移 8 小时**，"切点后"于是混进 20:0x 的历史重复，
> 我一度得到「切点后仍 91 次重复 ⇒ 修复没生效」的**假红**，与仓内既有探针（`a3-forward`/`e05-race-probe5`）**矛盾**。
> ⇒ **修法：切点写全时区**（`'2026-09-21T21:00:00.000Z'`）或直接做 **ISO 字符串比较**（同为 UTC 格式，字典序即时间序）。
> **同族**：`[原则] 文本改动先定编码` 管字符编码，本条管**时区编码** —— 都是"同一串字节，两种解释"。
>
> **★ 方法教训（可复用）**：本轮三条订正**全部**来自"按切点 / 按 `null` 分流重算"，而 v1 三条全部来自
> **把聚合值直接当结论**。⇒ 判据里凡有 `null` / 部署切点 / 时区，**必须先分流、先归一，再看率**。
> **新发现 4 的方法来源同源**：它来自"**把取样路径逐行复刻一遍**"（而非采信落账值）——
> 复刻在各历史时刻与落账值同量级（21/14/19/21/25/20/12/20 vs 16/19/22/24/21/13/16/18）⇒ **复刻口径正确**，
> 于是当前复刻值 **0** 才可信。**若只读落账值（最近一条是 20），这条缺陷完全看不见。**

---

## 1. 现态快照（实测 · 2026-09-21T22:53Z · 台账末行 22:52:52Z）

| 面 | 值 | 复验 |
|---|---|---|
| 仓库 | `local == remote == c3f6e9c` · **零未提交** | `git status -sb` · `git rev-parse HEAD` |
| **pin** | ⚠ **三处不一致**：声明 `c3f6e9cc` / 锁定 `9e93f770` / 实装 `9e93f770`（lock 与实装同位，声明侧独立） | `node scripts/check-version-pin.mjs` |
| 部署面 | 副本 **314/314 sha1 一致** · **118 项标记齐全** · 热重载 active | `check-installed-sync --strict` · `check-installed-features` |
| 套件 | **201 pass / 0 xfail / 1 skip**（`eval-gate` 由"活模型非确定性红"→ **诚实 skip**，见 §7） | `node scripts/check-runner.mjs` |
| 治理面 | STALE **0** · 已登记 153 文件 · 未登记 **~3392** · 计数闸 **9 处压力**（最高 `feature:可配置评估通道` **8/3**、`feature:sc-s05` **3/3**，余为 2/3） | `nav_graph mode=health` |

**⇒ 工程面已闭环：可交钥匙。** 下面五册全是**判据面 / 面板面 / 环境面**的余账，**无一处阻塞交付**。

---

## 2. 按架构板块分册（五册 · 每册方案 ⟷ 验收成对）

> 每册格式：**架构归属**（nav 节点 + 落点文件）→ **方案**（交付物）→ **验收**（判据，可独立验证）→ **回滚**。

### 册一 · 认知环（快/慢双通道）—— 判据面余账

| 项 | 内容 |
|---|---|
| **架构归属** | `feature:sc-s05 人化执行循环` · 落点 `src/mcl.ts`（491 行）· `src/recall-yield.ts` · `src/recall-diagnosis.ts` · `src/situation-key.ts` |
| **方案（交付物）** | **无新码** —— M3a/M3b（`a8f61ce`）+ E-05（`c026391`）+ 顺序性重复（`d264bc1`）已全部落地。本册只做**真机取证**。 |
| **验收 · 已过** | ✅ 判定频率 = 每步：`judge` 行 **242 条**（`mcl-step` 总 13570）<br>✅ **零嵌入**：242 条 judge **全部不带 `sim`**（字段存在数 = 0）<br>✅ 判定链抵达：`trace` 出现 `pre`（非恒 `pre0`）<br>✅ **A3 前向判据**：切点 `21:00Z` 后 `inject` 重复对 **0**（切点前 1833 对）<br>✅ **E-05 前向判据**：独立复算（`sid+sim+≤2s`）总命中 **3978**，切点 `21:00Z` 后 **0 命中**；最新一次命中 **20:06:47Z**（**切点前**，即 P2 已归因的"顺序性重复"那对）<br>✅ 环内换向出口真在动作：`mcl-switch` **4 条**（分落 step 2 / 3 / 10 —— **非只在首步**） |
| **验收 · 未过（真缺口）** | ⚠ **慢通道回引率极低**：`prevTextSrc='events'` **1963 条中 `topicEcho=true` 仅 72 条 = 3.7%**；另 232 条 `events-empty`（`prevTextLen` 中位 0）恒 false。<br>⇒ **但不可据此判"慢通道无效"**：`recall-yield.ts:24-27` 明写 `topicEcho` 是**词面代理**（"上一步回复是否回引材料主题词"），**不是"材料被用上"**。真实收益信号在 `audit/yield-rounds.jsonl`。**本项判据须先定口径**（见 §3-D5）。 |
| **复验命令** | `node _memory/audit/m3-live-measure.mjs` · `node _memory/audit/echo-samples.mjs` · `node _memory/audit/a3-forward.mjs` · `node _memory/audit/e05-race-probe5.mjs` · `node scripts/test-mcl.mjs` · `test-mcl-race.mjs` |
| **回滚** | 无码改动 ⇒ 无需回滚 |

### 册二 · 注入供给面（槽位预算 / 选行门控）—— ★ **本册是真缺口所在**

| 项 | 内容 |
|---|---|
| **架构归属** | `feature:sc-s06 记忆架构扩展` · 注册表 `skill/engine/criteria.json#surface.injection` · 落点 `src/panel-config.ts` · `src/panel-contract.ts` · `src/supply-assembly.ts` · `src/dynamic-select.ts` · `src/situation-supply.ts` |
| **方案（交付物）** | 三册**代码/真源面已落地**（实测）：<br>· **册A `memClass`**：26/26 类型全带 `memClass`；`producers` **0 处**、`timing` **0 处**（已删净）；`vocab.memClass = [semantic, episodic, procedural, none]`<br>· **册B `gate`**：`surface.injection.process.gate = 'tag'`（结构落、`task` 按裁决未启）<br>· **册C `budgetChars`**：`situation.budgetChars = 1200`（仓内真源与**库内运行态同值**，实测 `~/.dsh/suite/memory/engine/criteria.json`）<br>⇒ **余下的缺口是"面板调不到"**：<br>`/set` 白名单 27 键中 **`injection.budgetChars` / `injection.levelCaps` / `injection.situation.*` **零命中**；`/config` 的 `global` 31 键中 `levelCaps`/`budgetChars` **未暴露**。<br>**⇒ 交付物 = 把三个槽位额度接上 `/set` + `/config` + 契约表**（架构上属"同一事实的第三个消费面"，非新增机制）。 |
| **验收 · 已过** | ✅ 注册表真源可达：`budgetOf(4000)` 派生（`supply-assembly.ts:67`）与 `panel-shared.ts:604` 消费点唯一<br>✅ **活体记账在跑**：`/inject/stats` → `kept {stable 42 · dynamic 5 · oneshot 3 · situation 12 · process 3}` · `chars 3981/4000` · `overBudget false` · `stable dropped 78 行`（**有账、有留痕**）<br>✅ 三册代码面：`node scripts/check-content-types.mjs` PASS · `check-criteria` PASS |
| **验收 · 待做（成对判据）** | ① `/set` 白名单新增键后 `POST /set` 对三键各返回 200 且落 `scheduler.json`（负例：越界值返回 400）<br>② `/config` 的 `global` 三键可读<br>③ `check-panel-contract` 三向一致（表 ⟷ 产物 ⟷ 白名单）<br>④ 改后注入文本**逐字节回归**：`node scripts/inject-baseline-diff.mjs`（**已知红**，见 §3-D3） |
| **复验命令** | `node -e "…"` 读 `skill/engine/criteria.json#surface.injection` · `curl /api/shoucang-panel/inject/stats` · `node scripts/check-panel-contract.mjs` · `node scripts/test-budget-single.mjs` |
| **回滚** | 三键是**白名单增量**（`panel-config.ts` 的 `allowed`/`RANGE` 加行 + 契约键加项）⇒ `git checkout -- src/panel-config.ts src/panel-contract.ts` 即回退，**不涉真源数据** |

> **★ 本册附带发现（真缺陷，非推断）**：`panel-config.ts` 的**回落字面量系统性落后于注册表**——
> 实测 `:105 mclFamiliarThreshold` 回落 **0.65**（注册表 **0.58**）· `:111 injectProfileRows` 回落 **3**（注册表 `carriers.profile` = **6**）·
> `:92-96` 硬编码 `14/44/90/23/35`。
> **后果（已实测，非推断）**：当 `scheduler.json` 无该键时，**面板报 3 / 运行时用 6** ⇒ **面板显示与实际行为不一致**。
> 判据：`node -e` 比对 `panel-config` 回落常量 ⟷ `criteria.json` 同名键；修法 = 回落改读 `SURFACE.*`（同 `scheduler.ts` zod 的做法）。

### 册三 · 深睡 / 蒸馏链（校准与仪表盘）—— 等触发 + 探针修复

| 项 | 内容 |
|---|---|
| **架构归属** | `feature:sc-s07 深度睡眠状态机与探测链` · `feature:sc-s03` · 落点 `src/deepsleep-run.ts`（577 行）· `src/recall-diagnosis.ts` · `src/distill-watermark.ts` |
| **方案（交付物）** | ① **修探针假读数**：`_memory/audit/j3u1-rate.mjs` 的 `Number(null)→0` 分流（未判行单列）<br>② **无产品码改动** —— 归因链（`deepsleep-run.ts:102` 上限 30 ≥ 门槛 30）已修且**有门**（`check-attribution-samples` PASS）<br>③ 等真机样本落账（B1/B2） |
| **验收 · 已过** | ✅ 归因链**可达（常量层）**：`check-attribution-samples` PASS（①上限 30 ≥ 门槛 30 ②门槛之后真有 `subagents.start(`）<br>✅ 归因真值**已产出一行**：`2026-09-21T05:16:42Z s=30 a=false verdict=fix-recall`（**这就是"M1 不是链断"的实证**：判定真的发生过）⚠ **但此后 M3a 把取样窗口挤空 ⇒ 该可达性目前无输入**（见下） |
| **验收 · 未过（成对判据）** | ① 探针修好后，输出须**区分** `null`（未判）与 `false`（判为不一致）——判据：新增断言 + 反例自证<br>② **B1 痕迹文件数轴校准**：现值 **4 个纪元**（目标 **≥10**）⇒ ❌ 未到<br>③ **🔴 B2 归因样本被 M3a 挤空（见下「本册最重发现」）** <br>④ **T2/S-P5c 释放接线**：通过率极差 **19.2pp**（阈 **≤10pp**）、未判率极差 **29.1pp** ⇒ ❌ **未收敛，不得接线自动执行** |
| **复验命令** | `node _memory/audit/j3u1-rate.mjs` · `node _memory/audit/b1-tracefiles.mjs` · `node scripts/essence-review-stability.mjs --from-ledger 6` · `node scripts/check-attribution-samples.mjs` |
| **回滚** | 探针是 `_memory/audit/` 私有区只读件 ⇒ 改了不影响运行态；产品面本轮零改动 |

> **🔴 本册最重发现（本轮新取证 · 已在真机复刻，未被任何既有档登记）**：
> **M3a 新增的 `phase:'judge'` 行把归因取样窗口挤空了** —— 两条链**共用同一个取样通道**，而 M3a 把它的输出**放大了约一个数量级**。
>
> | 面 | 事实（本轮实测） |
> |---|---|
> | **取样怎么取的** | `deepsleep-run.ts:88-99`：从台账**末尾倒扫**，取满 **60 条 `kind==='mcl-step'` 即停**；再由 `samplesFromMclRows` 筛 `missReason !== 'ok'`，**上限 30**、**门槛 30** |
> | **挤占怎么发生的** | `judge` 行**不带 `missReason`**（它只记通道/分支/echo）。M3a 前 `mcl-step` 几乎全是 `inject`/`compliance`（**带 `missReason` 占 44.6%**）；M3a 后 `judge` 占切点后总量的 **77.7%**（258/332）⇒ 窗口里只剩 `judge` 行，**带 `missReason` 者降到 6.3%** |
> | **后果（已复刻）** | 按现台账**逐行复刻**该函数：倒取 60 条 `mcl-step` ⇒ **60 条全是 `judge`** ⇒ `samples` = **0**（门槛 30）⇒ **归因判定必然回到 `insufficient`**，**又一次结构性不可达** |
> | **回测（证明复刻无误）** | 用同一复刻函数在**各次历史深睡时刻**取样，与当时落账值同量级（落账 21/14/19/21/25/20/12/20 vs 复刻 16/19/22/24/21/13/16/18）⇒ **复刻口径正确**，不是我先验假设 |
> | **⚠ 尚未在真机显形** | 末次深睡在 **10:04:58Z**，**M3a 切点在 20:06:47Z** ⇒ 下一次深睡才会落账。**本条是"下一次必红"的预警，不是既成读数** |
> | **为何是 M3a 的"副作用"而非 M3a 的"错"** | M3a 的设计对（判定频率↑ 零开销），但它**没检查新输出的下游消费者**——`judge` 行与 `inject` 行进了**同一个 60 条窗口**。⇒ **同族第 N 例**：本仓反复剿的「加了机制却不看它的消费面」 |
> | **修法（两条，须拍板取一）** | **A（推荐 · 结构）**：取样**按 `phase` 过滤**——窗口只扫 `inject` 行（那是唯一带 `missReason` 的产者），而非按总行数截断。改动小、语义精确，且**与 M3a 的"频率分离"同旨**（分频也要分窗）。<br>**B（保守 · 计数）**：把窗口从 60 提到 ~800（按 `judge:inject` ≈ 10:1 反推）。**不推荐**：治标，且下次再加一条高频行又要重调 |
> | **判据（成对）** | 修后：复刻取样 ≥ 30；**反例自证**——把窗口过滤回"不过滤 `phase`" ⇒ 该断言必红（防"改了个数就宣布修好"） |

### 册四 · 评估通道（Jev / 结构化决策）

| 项 | 内容 |
|---|---|
| **架构归属** | `feature:可配置评估通道`（⚠ **计数闸 8/3**，见册五）· 落点 `src/eval-config.ts` · `eval-channel.ts` · `eval-ledger.ts` · `eval-ingest-audit.ts` · `panel-eval.ts` |
| **方案（交付物）** | ① **`eval-gate.mjs` 的判据材料迁移**至 `scripts/eval-samples.mjs`（ADR-290 已建接收端，前代未迁）<br>② 无产品码改动（M1–M5 全落） |
| **验收 · 已过** | ✅ 真实消费者存在：`eval-ingest-audit.ts` 接蒸馏索引行复核（`check-claim-alignment` 打印真机行）<br>✅ 落账分态：`/eval/stats` 的 `distinctOutcomes` ≥ 2<br>✅ 默认 fail-closed：`evalEnabled = false`（实测 `scheduler.json` 22 键） |
| **验收 · 未过（成对判据 · ⚠ 安全项）** | 🔴 **`scripts/eval-gate.mjs` 内嵌真记忆原文，且在公开树**：实测 20 条 `state` 样本中 **16 条与 `AGENT.md` 逐字重合**（例：`[原则] 代理指标非判据 · 心跳/端口/钉点/文件增长皆机制自证…`）。<br>⇒ `check-public-tree` **PASS 却漏掉它**（该门按路径/模式扫，**不查正文语义**）—— 这是**隐私红线的既成事实**，ADR-290 已登记为"待处理风险"，**本轮仍未清**。<br>**判据**：迁移后 `eval-gate.mjs` 内嵌 `state` 样本数 = **0**（样本一律运行期从真库取材）；反例自证：把任一真库原文塞回脚本 ⇒ 新门必红。 |
| **复验命令** | `node scripts/check-eval-samples.mjs` · `node scripts/check-public-tree.mjs` · `cat scripts/eval-gate.mjs`（看内嵌 `state:` 行数） |
| **回滚** | 文件级：`git checkout -- scripts/eval-gate.mjs`（样本迁移属纯文本改动，不涉真源数据） |

### 册五 · 治理账本与部署面（**环境侧 · agent 不自主推进**）

| 项 | 内容 |
|---|---|
| **架构归属** | `module:shoucang`（计数闸 **2/3**）· 部署三处版本记录 · nav 落点表 |
| **方案（交付物）** | ① **pin 归位**（profile 跑一次 `pnpm install`）<br>② nav 计数闸减压（`nav_decide` 或收口）<br>③ 未登记 3392 文件**不追**（既有裁决，见 §4） |
| **验收 · 已过** | ✅ 部署面：副本 **314/314** · 标记 **118** · `check-arch-sync` PASS（CHECKS 198 · 标记 118）<br>✅ 治理面：STALE **0** · 本轮已登记 `artifact:closure-plan-2026-09-21` |
| **验收 · 未过** | ⚠ `check-version-pin` **三处不一致**（声明领先 lock/实装 1 个提交档位）—— **结构现象**：pin 随提交前进，lock 只在 `pnpm install` 时更新（`AGENTS.md` 已记此规律）<br>⚠ 计数闸 3 处压力：`feature:可配置评估通道` **8/3**（超阈最多）· `feature:sc-s05` **3/3** · `feature:pn-f01` **2/3** |
| **复验命令** | `node scripts/check-version-pin.mjs` · `nav_graph mode=health` · `node scripts/check-installed-sync.mjs --strict` |
| **回滚** | pin 是**纯文本**改动（安全）；`pnpm install` 会**顺带归位所有"声明领先"的依赖**（实测曾把 `project-nav` 0.4→0.6）⇒ **动前备份** `package.json`/`pnpm-lock.yaml`/`.modules.yaml`（`~/.dsh/backups/`） |

---

## 3. 待拍板（**agent 不得自行推进 · R1/R3**）

| # | 事项 | 现值 → 选项 | 我的判断（附实测） | 回滚 |
|---|---|---|---|---|
| **D1** | 熟悉度阈值 `mcl.familiarThreshold` | **0.58** → 保持 / `0.60` | **保持**：稳定性自证实测 **0.58 带宽 30.4pp / 0.60 带宽 30.1pp**，而 0.58→0.60 只值 **6.5pp** ⇒ **结论落在噪声带** | `/set mclFamiliarThreshold 0.58`（热生效） |
| **D2** | `coexist` 等 8 个取值零产生路径 | 补产生路径 / 收窄声明 | 属 **L0 语义变更**；现已**显式登记** `wiring.unreachableValues`（8 项实测），门 PASS **且不再是假绿** | 已登记，可回退为豁免 |
| **D3** | `inject-baseline-diff` 对拍红 | 基线改冻结快照 / 判据改"骨架一致 + 逐条打印" | **既有裁定已否决抬基线**（`docs/specs/S2S3-book0-record.md:39`）⇒ **我不翻既有裁决**；但册二接面板后**必须先解决此红**，否则注入面改动失去 byte 级回归 | 按既有裁定 |
| **D4** | `evalEnabled` 缺省 | `false`（fail-closed）→ 保持 / 打开 | **保持关** | 面板可开 |
| **D5** | **`topicEcho` 口径**（本轮新提） | 沿用词面代理 / 改用 `yield-rounds.jsonl` 真实动作 | **建议改用真实动作**：`topicEcho` 实测 3.7%（72/1963），而它**自述不是"材料被用上"**；拿它判慢通道成败＝拿代理指标当判据 | 改口径属判据语义 ⇒ 须拍板 |
| ~~D6~~ | ~~`J5/U3` 重定义或退役~~ | ✅ **已被 M3a 收编**：`switchSource` 现由 `planStepJudgement` 消费并**在环内出动作**（`mcl-switch` 4 条)，不再是"只落账无人消费" | 本条**已消除**，无需再拍板 | — |

---

## 4. 执行顺序（按「会掩盖其他问题」优先，非按显眼度）

| 步 | 做什么 | 判据（完成即勾） | 授权 | 归属册 |
|---|---|---|---|---|
| **S1** | **修归因取样窗口挤占**（册三·最重）：`deepsleep-run.ts:88-99` 取样按 `phase === 'inject'` 过滤 | 复刻取样 ≥ 30；反例：去掉 `phase` 过滤 ⇒ 断言必红 | ⚠ **改 `src/` 行为** ⇒ 须具名授权（R1） | 册三 |
| **S2** | **修探针假读数**：① `j3u1-rate.mjs` 的 `Number(null)→0` 分流 ② 切点时区归一（写全 `Z`） | 输出区分"未判/判否"；切点用 ISO 比较；反例自证 | ✅ 可自主（私有区只读件） | 册三 |
| **S3** | **槽位预算接面板**：三键进 `/set` + `/config` + 契约表 | `/set` 三键各 200；`check-panel-contract` 三向一致 | ✅ 可自主（纯增量，可回退） | 册二 |
| **S4** | **修面板回落字面量**：`panel-config.ts` 回落改读 `SURFACE.*` | 回落常量 ⟷ 注册表逐键相等（机检） | ✅ 可自主（只改显示口径，改后面板值与运行态一致） | 册二 |
| **S5** | **清理 `eval-gate.mjs` 内嵌真记忆原文**（隐私红线既成事实） | 内嵌样本数 = **0**；反例：塞回即红 | ✅ 可自主（公开树红线，非改语义） | 册四 |
| **S6** | T1/T2/B1 按触发条件复跑 | B1 纪元 ≥10；T2 极差 ≤10pp | ✅ 可自主（只读复跑） | 册三 |
| **S7** | D1–D5 落值 | 各一条 | ❌ **须你一句话** | 全 |
| **S8** | pin 归位（环境侧） | `check-version-pin` 三处一致 | ❌ **动 profile，须择时** | 册五 |

**为什么 S1 排在最先**：它是一条**"下一次深睡必红"**的结构性缺陷（M3a 的副作用），且**它的存在会使 S6 的 T2/B2 读数继续不可信** —— 先修窗口，后面的 `insufficient` 才有解释力。
**为什么 S2 紧随**：T2 报"未收敛"、M1 报"0.0%"，两条读数都出自**待验的仪器** ⇒ 先修仪器再下结论（同 `[原则] 代理指标非判据`）。
**明确不做**（防反复）：不追未登记 3392 文件（多为会话/构建产物）· 不为对拍红而抬基线 · 不在慢通道样本到手前改 `mcl.ts` 判定主体。

---

## 5. 承诺对账

**我欠你的（2 件 · 可自主）**
1. **TF-IDF+LR 基线 vs laya 中文 0.630 对比出数**（长期挂着，未做）。
2. 重启后验证 `shoucang-skill-filesystem` 已挂载、删旧址、复验技能仍在（实况：`dev_plugin_status` 显示该 entry **active**，但"已挂载 + 技能仍在"的**端到端复验**未做）。

**你欠我一句话的（5 件 = §3 的 D1–D5）**：阈值 0.58/0.60 · `coexist` 等 8 值收窄 · 对拍红口径 · `evalEnabled` 缺省 · `topicEcho` 判据口径。
（**S1 授权已不欠** —— 用户本轮已授权「全部自己决策」，S1–S5 已落地，见 §7。）

---

## 7. 本轮执行结果（**用户授权「全部自己决策」后落地**）

> **态标签（R5 可回答性）**：以下 5 项**全部**落在用户**本轮具名授权**（「授权你全部自己决策」＝对 §3/§4 待授权清单的逐条回复）之内；
> 每项**可逆**（git / 备份在 `%TEMP%\sc-bak`）· **未改真源数据**（记忆库文件 / 台账未动）· 除 `lib/` 产物外**未碰跨会话共享件**。

| 步 | 做了什么 | 判据（实测） | 先红 / 反例自证 |
|---|---|---|---|
| **S1** | **修归因取样窗口挤占**（ADR-324）：`isAttributionRow` + `takeAttributionScan` 新入 `recall-diagnosis`；`deepsleep-run` 取样改按**消费谓词收满即停**；审计新增 `attributionScanned`（**输入量可见化**） | 编译器端到端：样本 **0 → 30**（门槛 30 达标）；门 `check-attribution-samples` **③结构 5 条 + ④行为 3 条全绿** | ✅ **两条变异各令 exit 1**（① 退回行数截断 ② 谓词退化只判 kind），还原后**字节级一致** |
| **S2** | **修探针两处假读数**：`j3u1-rate.mjs` 的 `Number(null)→0` 三态分账 + 切点 ISO 比较 | 输出由假结论「累计 0/625 = 0.0%」→ 诚实分账「**已判 1 行 / 未判 51 行**（未判不进分母）· 真值 0/30」 | — 读数类修正，无先红 |
| **S3** | **面板回落与运行态同源**：`panel-config.ts` 回落改读 `SURFACE.*`/`SCORE.*`；新门 `check-panel-fallback` | 真机 `/config`：`injectProfileRows` **3 → 6** · `scoreWeights` **legacy → v2**（与运行态一致） | ✅ 门 `--selftest` **4 例含 2 反例** |
| **S4** | **清公开树真实记忆原文**（首轮 **21 处 / 6 件**，**只在 `scripts/` 面**）+ `eval-gate` 迁运行期取材 + 新门 `check-public-content` | 语义级扫描：`scripts/` 内与库文**逐字重合 0 处**；`check-public-tree` PASS；`eval-gate` 内嵌 `state` 样本 **20 → 0** | ✅ 门内**实跑**反例（塞真库整行 ⇒ 必命中） |
| **S4′** | **续：全域清理 45 处 / 6 件** —— 上一步的门只扫 `scripts/`，而**重灾面是文档面**：`deliverables/inject-parity` **38** · `inject-recall-chain` 2 · `docs/sleep-granularity-plan` 2 · `CHANGELOG` 1 · `tessa-test-plan` 1 | 实跑 **45 → 0**；**保形脱敏**：`inject-parity` 两份 dump 的行数 **48/49** 与 `- ` 前缀 **41/12** ⇒ **与该档 §1 所载完全一致** ⇒ 其判断仍可逐条复核 | ✅ 自查抓到门自身**两个盲区**（① 只扫 `scripts/` ② 只扫 `git ls-files` ⇒ **门漏了自己**），均已修 |
| **S5** | **修 `eval-gate` 的平凡通过**（本轮我自己引入并当场抓到的**新缺陷**）：G2-a 加 `MIN_JUDGE_N=8` 与"基线非零"双条件，未取证 ⇒ **exit 3 skip**（原 `null !== false` 会放行 ⇒ 报 PASS） | 实跑 `0/3 vs 0/3` ⇒ 旧码判 **✅ PASS**（`0≥0`）；新码判 **⏭ skip ⋯ 未取证** | ✅ 实证：同一输入下新旧行为对照（见 `CHANGELOG` 该条） |
| **S6** | **槽位额度接面板（S3）**：新件 `budget-override.ts`（覆盖链唯一实现）+ 面板三键 | 真机端到端：`/set 1800` ⇒ `budgetTotal 4000→1800`、`overBudget true`、**注入头变「预算 1800 省略 96 行」**；回滚复原 | ✅ 门 ④ 行为断言 + `--selftest` 反例 |
| **S7** | **D2：`coexist` 取得产生路径** | `conflict=coexist` ⇒ 出参 `coexist` + basis；旧调用方零迁移（实测 `supersedes` 布尔路径逐字不变） | ✅ 真机产量 0 ⇒ 记为「通路已建·样本未到」 |
| **S8** | **pin 归位**（环境侧） | `check-version-pin` **PASS（三处一致 @ 3c9b8fb）** | 动前备份三件于 `%TEMP%\sc-bak3` |
| **S9** | **🔴 源码真凭据串清理 + 历史重写**（自查发现） | **新史 0 命中 / 156 提交**（提交数守恒）· `fsck --full` 无错 · 树 928 件 · 远端拉回再核仍 0 | ✅ 干跑先用克隆验证（`refs/original` 会留着旧史 ⇒ 必须删+expire+gc）；详见 `PUBLISH-POLICY §6` |

**五层验收终态（本轮）**：
① 仓内绿：`typecheck` 0 错 · `build` OK · `check-runner` **203 pass / 0 xfail / 1 skip（exit 0）**；
② 部署同步：副本 sha1 一致（`--strict` PASS）；③ 热重载：fiber **active**（清 104 模块）；
④ 功能探针：**118 项标记齐全**；⑤ **云端+pin**：`local == remote == 3c9b8fb` · **pin 三处一致**。
另：`check-arch-sync` PASS（CHECKS **204** / 标记 118 / 模块 **104**）· `check-hardcode` PASS ·
`check-public-tree` PASS · `check-public-content` PASS（全域 45 → 0 处）· 面板 5 条路由全 200。

**本轮新增/扩展的判据件（均已登记 `CHECKS`）**：`check-panel-fallback`（新，含 `--selftest`）·
`check-public-content`（新，含 `--selftest`）· `check-budget-override`（新，含 `--selftest`）·
`check-attribution-samples`（**③/④ 扩展**，同一文件内加断言，**未另立件**）· `check-carriers`（**⑤b 扩为四类**，新增"对象"类）。


**⚠ 本轮自己犯并已修的三个错（留档，防再犯）**：
1. **`takeAttributionScan` 首版返回原始行**而非解析后对象 ⇒ 样本恒 0，**而当时四条结构断言全绿**
   ⇒ 补 ④ 行为级断言（**门只看"接线了没"，没看"过出来的东西对不对"**）。
2. **`eval-gate` 缺省收到 1/任务后出现"平凡通过"**（`0/3 ≥ 0/3×0.9` ⇒ `0≥0` ⇒ PASS）⇒ 加样本量下限 + 基线非零双条件。
3. **把 `SURFACE.activity?.x` 写进回落**（一个**不存在**的字段）⇒ 自我否决并撤回，如实保留字面量 —— 那是"为统一而造的假引用"，比字面量更坏。
4. 另：复算 E-05 时**切点未带时区**致**假红**（详见 §0 时间戳陷阱）。
5. **把 `panel-shared` 顶到 868 行（> 冻结 846）**：先按门禁唯一出路抽模块，**抽完仍 858** —— 因为我把判因**大段写在调用点**（该判因本该只在 `budget-override.ts` 抬头一处）。压到 **837** 后才过。
6. **`check-budget-override` ① 首版判据把"接线代码自身"判成残留**（宽正则跨到回落实参）⇒ 改判「赋值右值直接是注册表读数」；**同一门在抽模块后又成假红**（断言写死了旧函数名）⇒ 改为接受**聚合入口**。**两次都是"判据随实现演进必须同步"的证据，不是放宽**。
7. **改 `criteria.json` 时把字符串插入了真实换行**（`\n` 写成字面换行）⇒ JSON 解析炸 + `gen:criteria` 拒跑；**同族于 `[原则] 文本改动先定编码`**：编辑 JSON 内长字符串须用工具而非 sed/手拼。修后 `check-criteria` 三处投影一致。
8. **在错路径查 `yield-rounds.jsonl` 并据此下了"不存在"的错结论**（实际在 `<bank>/audit/` 而非 `knowledge/audit/`）⇒ 已在 D5 记录里订正。**这正是"未查到 ≠ 不存在"**。
9. **历史重写首版 tree-filter 有破坏性缺陷**（`sed` 无入参 ⇒ 会把目标文件清空）——**开工前自查抓到并 kill**，改用「脚本内自带文件名、`sed -i` 就地改」并在**克隆上干跑验证**后才碰真仓。
10. 另：验证 `sed` 时**用 PowerShell 重定向取历史文件** ⇒ 被写成 UTF-16/BOM ⇒ `sed` 匹配不到，**一度误判"脚本不工作"**（实为取证方法有错）⇒ 改 **node 直读**（`execFileSync('git',['show',…])`）。


---

## 6. 回源索引

| 想查 | 去哪 |
|---|---|
| 逐条登记与收口（含撤回的错误结论） | `docs/OPEN-ITEMS.md` §0n–§0t · §12 开口项汇总 |
| 分步状态 / 验收 A·B 组 / 继续推进 P1–P6 | `docs/evaluation-channel-plan.md` §10 · §11 · §12 · §13 |
| 本会话压缩重述 + 五层终态 | `docs/handover-2026-09-21.md` |
| 架构（模块归属 / 分层 / 预算） | `docs/ARCHITECTURE.md` · `node scripts/audit-architecture.mjs` |
| 真机取数探针（只读） | `_memory/audit/`：`m3-live-measure` · `echo-samples` · `a3-forward` · `b1-tracefiles` · `e05-race-probe5` · `j3u1-rate` · `j3u1-probe` · `closure-probe` |
| 判据 | `test-mcl` · `test-mcl-race` · `check-l0-conflict-wiring` · `check-attribution-samples` · `check-claim-alignment` · `mcl-calibrate` · `essence-review-stability --from-ledger` · `verify-open-items` |
| 圆桌会审原始记录（三册裁决出处） | `.roundtable/三记忆落地方案整理/export.md`（册A=Q1+Q2 · 册B=Q4 · 册C=Q3） |

---

_建档 2026-09-21 · **v2 重整（按架构板块分册 + 方案⟷验收成对）** · 治理锚点 `artifact:closure-plan-2026-09-21`（ACT-323）。_
_本档只写实测值；未取证处显式标注。**三条 v1 结论在本轮被自己的探针推翻，已就地订正并留失败记录**（§0）。_
_**§7 为本轮执行结果**（用户授权「全部自己决策」⇒ 施工态），每条附判据与先红；本轮自己犯的 4 个错亦留档于 §7 末。_
