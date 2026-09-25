# 守藏架构梳理与逻辑模块扩容方案

> **编制**：圆桌会议主持人（基于本轮 8 席实测 + 主持人独立取证）
> **性质**：**决策态方案**，不含施工。每项施工须具名授权（R1）。
> **证据纪律**：凡数字均附**口径与命令**；未实测标「未验证」。
> **本文件回答两件事**：① **架构怎么梳理**（106 模块的真实结构） ② **逻辑模块怎么扩容**（哪里要扩、怎么扩不撞墙）

---

## 0. 一页结论

### 0.1 架构体检（实跑读数）

```
node scripts/audit-architecture.mjs
  → src/ · 106 模块 · 27396 行 · 运行时深度 11 · 静态深度 11
  → 静态循环依赖 0 · 动态边隐藏环 0
  → 扇入最高: targets(23) · criteria.generated(19) · vec(15)
  → 规模最大: criteria.generated(1371) · deepsleep-run(1013) · mcl(867)
```
⇒ **骨架是健康的**（零环、零隐藏环、深度 11 在阈值内）。**问题不在骨架，在"域边界"与"扩容通道"。**

### 0.2 三条核心判断

| # | 判断 | 依据 |
|---|---|---|
| **A1** | **架构不缺层，缺"域边界的显式化"** | 106 模块能归入 **9 个逻辑域 + 1 个基础设施杂区（32 件 / 6343 行）**；杂区占 **23%**，是唯一的"归属模糊面"。**实测其机械后果**：`deepsleep-run` 的 25 个依赖里 **13 个落在杂区** ⇒ 装配件跨 5 域引 13 件，**域边界不可见** |
| **A2** | **扩容的主障碍不是设计，是"导出棘轮顶格"** | `targets` **35/35** · `deepsleep-core` **35/35** · `panel-shared` **35/35** 三件**顶格**；`record-store` **31/35** 接近。<br>⚠ **顶格三件与最高频被引件完全重合**（`targets` 被引 **29** / `deepsleep-core` **17** / `panel-shared` **15**） |
| **A3** | **扩容的正确通道 = "新建件 + 域前缀"**，而非扩既有件 | 仓内已有 **4 个成功先例**：`probe-plan.ts` / `trigger-plan.ts` / `channel-plan.ts` / `model-config.ts`（均因棘轮约束按领域接缝抽出）。
| **A4** | **最省的扩容点竟是一行上限** | `adaptiveTopN` 的 `min(12, …)`：`ringN=1534` ⇒ `sqrt≈40` ⇒ 被卡在 **12** ⇒ 环记录可达率 **12/1534 = 0.78%**，且 `ringN>144` 后**恒饱和** |

---

## 1. 架构梳理：106 模块的真实结构

### 1.1 九域 + 杂区（实测归组）

| 域 | 件数 | 行数 | 占比 | 依赖位置 | 健康度 |
|---|---|---|---|---|---|
| **panel 面板** | 10 | 4100 | 15% | L6–L8 | ◐ `panel-shared` **846 行 / 35 导出顶格** |
| **distill 蒸馏** | 16 | 3544 | 13% | L3–L8 | ⚠ 件数最多、跨层最广（L3→L8 五层） |
| **deepsleep 深睡** | 10 | 3500 | 13% | L3–L5 | ◐ `deepsleep-core` **35 导出顶格** |
| **其它/基础设施** | 32 | 6343 | **23%** | L0–L9 | ⚠ **最大且无域名前缀**——归属模糊 |
| **ring 内容环** | 11 | 2241 | 8% | L2–L4 | ✅ 语义清晰（六环 + 事件 + 落库 + 供给） |
| **recall/mcl 认知环** | 4 | 1898 | 7% | L3–L6 | ⚠ `mcl` **867 行**（判定出口断裂见另档） |
| **supply 供给** | 9 | 1754 | 6% | L4–L5 | ✅ 分工清晰（恒定/动态/情境三面） |
| **record 记录层** | 6 | 1195 | 4% | L1–L7 | ◐ `record-store` **31/35** 接近顶格 |
| **eval 评估** | 4 | 777 | 3% | L4–L7 | ✅ 新增域，边界清楚 |
| **section 小节寻址** | 3 | 569 | 2% | L1–L4 | ✅ 单一语义（`exists/ambiguous/missing`） |
| **合计** | **105** | **25921** | — | — | （+生成物 `criteria.generated.ts` 1371 行 = 106 件 / 27396 行） |

### 1.2 分层实况（L0–L10，实测）

```
L0  criteria.generated(1371, 生成物) · bank-lock(130)
L1  record-store(376) · section-rewrite(185) · file-stat-cache(118) · proc-async(98) · due-window(39) · event-envelope(27)
L2  treeops(722) · targets(498, 扇入23) · relation-ring(314) · criteria(281) · association-ring(271) · ledger-compact(194) · decision-ring(188) · cue-space(142) · channel-plan(55)
L3  deepsleep-core(631) · vec(377, 扇入15) · section-ref(279) · activity(277) · ring-events(265) · record-shadow(245) · situation-key(161) · association-propose(124) · rings(115) · fact-ring(112) · audit-source(71) · distill-state(50) · distill-proc(45)
L4  supply-assembly(487) · deepsleep-tree(434) · recall-yield(365) · deepsleep-apply(348) · proposal-apply(330) · fact-supersede-apply(306) · recall-diagnosis(293) · essence-release(291) · relevance-supply(284) · deepsleep-materials(267) · ring-supply(250) · pointer-deficits(247) · ring-commit(241) · forgetops(203) · budget-override(180) · …（21 件）
L5  deepsleep-run(1013, 扇出25) · distill-write(831, 扇出11) · sleep-report(392) · eval-channel(294) · dynamic-select(269) · distill-watermark(235) · distill-chunks(174) · crossform-dedup(161) · …（19 件）
L6  mcl(867) · panel-shared(847) · distill-agent(643) · deepsleep-machine(284) · eval-ledger(233) · session-review(219) · …（8 件）
L7  distill-hooks(351) · assertion-graph(288) · panel-contract(156) · eval-ingest-audit(150) · deepsleep(114) · composition(89) · content-types(81) · distill-paths(54) · distill-embed(37)
L8  panel-inject(751) · panel-observe(640) · panel-memory(636) · panel-config(420) · distill(393, 扇出24) · panel-arch(273) · panel-eval(177) · llm-catalog(108) · probe-config(66)
L9  scheduler(802) · panel(98)
L10 index(38)
```

### 1.3 架构问题（**三条，按"会掩盖问题"排序**）

| # | 问题 | 实测依据 | 为何这排序 |
|---|---|---|---|
| **P1** | **基础设施杂区 32 件 / 6343 行（23%）无域归属** | 归组实测：它们不属于 9 个域中任何一个 | **最大结构面**：新模块往哪放没有既定答案 ⇒ 会持续加大该区 |
| **P2** | **三件导出顶格，构成"扩容天花板"** | `targets` 35/35 · `deepsleep-core` 35/35 · `panel-shared` 35/35 · `record-store` 31/35 | **会让后续扩容被迫走歪路**（就地塞 → 撞门 → 有人想 `--rebase` 抬基线，那属 R3） |
| **P3** | **`deepsleep-run` 单件 1013 行 / 扇出 25** | 实测：L5 最大件，扇出全仓第一 | 它是**装配级扇出**（25 个依赖）⇒ 改一处牵动面极大 |

---

## 2. 逻辑模块扩容方案

> **总原则**：**扩容走"新建件 + 域前缀"，不扩既有顶格件**。仓内已有 4 个成功先例可循。

### 2.1 扩容通道（**先定通道，再谈内容**）

| 通道 | 适用 | 约束 | 先例 |
|---|---|---|---|
| **A. 按领域接缝新建件** | 新能力、新逻辑面 | 零抬基线；新件导出自由（阈 35 有余量） | `probe-plan.ts` / `trigger-plan.ts` / `channel-plan.ts` / `model-config.ts` |
| **B. 既有件内** | 仅当该件**非顶格**且语义属它 | 撞 `check-module-growth` / 导出阈 | — |
| **C. 抬棘轮基线** | **不建议** | 属 **R3**（须用户拍板） | 本仓**从未**在本轮抬过 |

**⚠ 硬约束（实测）**：
- `check-module-growth`：冻结名单 **3 件**（`src-client/body.js` 613/615 · `src-client/styles.js` 726/729 · `src/scheduler.ts` 578/585），容差 15 **是波动缓冲不是额度**；
- `audit-architecture` 导出阈 **35**：`targets` / `deepsleep-core` / `panel-shared` 三件**顶格**。

### 2.2 扩容点清单（**按"逻辑上必须要"排序**）

#### 扩容点 1 · **`ring-supply` 的环覆盖面**（逻辑缺口，非新功能）

| 项 | 内容 |
|---|---|
| **现状** | 注册表 `ringOrder = ["relation","decision","association","fact","value"]` · `topN = 3` · `cueDims = ["scope","task"]`；**「承诺」不在环序里**，注入面那 12 行承诺走 `dueSoon` 到期路径 |
| **实测（主持人补充，闭合 U4）** | **情境槽预算 1200 字符，实用 837（12 行），余量 363** —— **预算没用满**！⇒ 说明短缺**不是额度不够** |
| **缺口归因（✅ 已闭合 U1，结论经两轮修正）** | **第一轮判读（错）**：「环序路径零产出」——**不成立**。<br>**第二轮实测**：`ringCandidates(recs, cues, {topN:12})` → 返回 **12 条：`why=cue` × 4 · `why=due` × 8**。<br>**第三轮读码（`ring-supply.ts:194-201`）**：组序是 **`cue(0) → due(1) → fallback(2)`**，**`cue` 优先于 `due`** ⇒「due 挤走 cue」**也不成立**。<br>**✅ 真根因 = `topN` 硬上限**：<br>`adaptiveTopN()`（`ring-supply.ts`）实测公式 = `max(3, min(12, ceil(sqrt(ringN))))`，`ringN = 1534` ⇒ `sqrt ≈ 40` ⇒ **被 `min(12, …)` 卡在 12**。<br>⇒ **1534 条环记录中只有 12 条能进注入面 = 0.78%**；且 `sqrt` 增长在 `ringN > 144` 后**恒被 12 截断**（已饱和） |
| **各环 cues 覆盖（实测，决定各自能否被情境命中）** | `decision` 962/781 带 cues · `relation` 242/230 · `value` 176/173 · `fact` 152/148 · **`association` 2/0**（全无 cues） |
| **扩容方式（修正后最省，且不需授权改真源）** | **只改一处：`adaptiveTopN` 的上限**（`ring-supply.ts`，当前 `Math.min(12, …)`）。<br>⇒ **不是加预算**（情境槽 1200 只用 837）、**不是改环序**（五环齐备且 cues 覆盖良好）、**不是新建通路**（通路已在）——**是把这个 12 的上限提上去**。<br>⚠ 撞 `ring-supply.ts`（L4 / 250 行 / 导出 15 / **阈 35 有余量**）⇒ 改动面小、**不撞棘轮** |
| **提上限后必须同时看的约束（回归面）** | ① 情境槽预算 1200 字符（实测实用 837 ⇒ **提 topN 会先吃满这 363 字符余量**，再超即触发裁切）；② 注入面总预算 4000（`budget-override#injectBudgetChars` 可调，范围 1200–20000）；③ `check-arch-sync` 守 `budgetChars` 一致性 |
| **扩容方式** | **先分清两种成因**：① 环序路径**未命中情境键**（`cueDims` 仅两维）→ 补 cue 产出点；② 环序**本身不含该环** → 改 `ringOrder`。**两者修法不同，不可混淆** |
| **落点** | 若需新件：`ring-supply-*.ts`；若只调配置：`criteria.json#surface.injection.situation`（**撞真源 ⇒ 须授权**） |
| **验收判据** | 注入面按环分组的行数分布（当前 = 承诺 12 / 其余 0） |
| **回归面** | 注入面预算 4000 字符（`check-arch-sync` 守）；不得挤占既有槽位 |

#### 扩容点 2 · **判定器判别力**（逻辑缺口，最高价值）

| 项 | 内容 |
|---|---|
| **现状** | `judged:true` **全三卷 0 行**；`yield.verdict` 6/6 全 `unjudged`；`yieldHelpedTrue` 65 行**全 0** |
| **真死因** | 模型对每轮均判 `helped=null`（判不准）⇒ 出口锁死。**不是接线断**（写侧在跑） |
| **扩容方向** | **不是"修接线"，是"提升判据信息量"**——核 `recall-yield.ts#buildYieldRequest` 给模型的材料是否足以判别"帮上没帮上" |
| **落点** | `recall-yield.ts`（**导出 21/35，有余量**）或新件 `yield-*.ts` |
| **验收判据** | ① `judged:true > 0`；② `yieldUnjudged` 占比下降；③ **送达率**（见扩容点 3） |
| **⚠ 风险** | 仓内 `deepsleep-run.ts:205-207` 注释**自陈**："实测有动作者占 **13.2%**…`idleSteps:0` 的模型只能全判 `null`" ⇒ **该缺口仓内已知道** |

#### 扩容点 3 · **回流送达可观测**（观测缺口，**修它才验证得了别的**）

| 项 | 内容 |
|---|---|
| **B1 写给谁** | 6/6 回流行落在接收窗口外；14 个有 judge 行的 sid **仅 1 个**收到过 verdict，而它**无 judge 行** |
| **B2 读不到** | `readLatestLedgerRow` 签名**只有 `perVolume`，无 `maxBytes`**（`ledger-compact.ts:149-153`）；字节窗仍 256KB（`file-stat-cache.ts:94`）⇒ 抬 `perVolume` 到 20000 仍 `undefined`（空转） |
| **扩容方式** | **B2 优先**（接口缺陷，改动最小）：把 `maxBytes` 提为**显式参数**，与 `perVolume` 并列 |
| **落点** | `ledger-compact.ts`（**导出 7/35，余量充足**） |
| **验收判据** | 送达率 + 接收覆盖率（定义见 `landing-plan.md` §2 册一）；**阈值须先取一轮实测基线**，不得先定标准后补数据 |
| **回归面** | `check-ledger-read`（唯一实现 + 禁递归枚举）必须保持 PASS |

#### 扩容点 4 · **「预测 vs 实际」比较机器**（逻辑缺口，直击参照系）

| 项 | 内容 |
|---|---|
| **现状** | `decision-ring` 存 `predicted`（**782 条全带**）· `outcome` 存 `hit`（**180 条全 join，孤儿 0**）——但**全仓无一处把 `predicted` 与 `observed` 做比较** |
| **缺口** | 参照系 §5.2 的「**比较：预期 vs 实际**」这一**动作**只有字段没有判据 ⇒ 循环无校准 |
| **扩容方式** | 新建 `calibration.ts`（或 `decision-calibration.ts`）——纯函数：输入 `predicted` + `observed`，输出命中/偏差 |
| **落点** | **新建件**（`decision-ring` 已在 L2 且语义是"存储"，比较属"判据"⇒ 按领域接缝分开） |
| **验收判据** | 对现有 180 条 outcome 回算，与模型自报 `hit` 对照（**当前 `hit` 是模型自报，非代码比较**） |
| **回归面** | 只读计算，不改库；`decision-ring` 与 `record-store` 均不动 |

#### 扩容点 5 · ~~六环的注入通路~~ → **`adaptiveTopN` 上限**（✅ 经归因修正，与原判不同）

> ⚠ **本项原判「需新建注入通路」已被实测推翻**。修正后的真相见下。

| 项 | 内容 |
|---|---|
| **背景** | 六环是本仓**唯一被外部认定为原创**之物（`rings.ts:62` 免频率门：决策/联想"只出现一次也成立"） |
| **原判（错）** | 「`file=''` 1534 条中，仅承诺 140 条有到期路径可达 ⇒ 需新建通路」 |
| **修正后真相** | ① 环序**五环齐备**且 cues 覆盖良好（decision 781/962 · relation 230/242 · value 173/176 · fact 148/152）；<br>② `ringCandidates` **实返 12 条（cue 4 + due 8）**，通路**完全正常**；<br>③ **真瓶颈 = `adaptiveTopN()` 的 `Math.min(12, …)` 硬上限** —— `sqrt(1534)≈40` 被截到 **12** ⇒ 可达率 **0.78%**，且 `ringN>144` 后**恒饱和**（记录越多，覆盖率越低） |
| **扩容方式（最省）** | **改一处上限**：`ring-supply.ts#adaptiveTopN` 的 `Math.min(12, Math.ceil(Math.sqrt(ringN)))`。<br>可选项：① 直接抬 12 这个上限；② 改增长函数（如对数或线性带帽）；③ **给 `cue` 与 `due` 分设额度**（当前共用同一 `topN`） |
| **落点** | `ring-supply.ts`（L4 · **250 行** · 导出 **15/35** 有余量）⇒ **改动面小、不撞棘轮** |
| **⚠ 必看的回归面** | ① 情境槽预算 **1200**（实用 837 ⇒ **363 字符余量**，抬 topN 会先吃满它，再超即裁切）；<br>② 注入面总预算 **4000**（可调 `injectBudgetChars` 1200–20000）；<br>③ `check-arch-sync` 守 `budgetChars` 一致性；<br>④ **`ringN>144` 饱和**意味着**上限与记录数脱钩**——是设计选择，改动须显式记账 |
| **验收判据** | 注入面按环分组的行数分布（当前 = 承诺 12 / 其余 0）+ 情境槽字符占用（当前 837/1200） |

#### 扩容点 6 · **基础设施杂区的域归位**（架构梳理的主体）

| 项 | 内容 |
|---|---|
| **现状** | **32 件 / 6343 行（23%）**无域前缀，横跨 L0–L9 |
| **建议归位**（按语义，不新增文件） | ① **装配/配置面**：`composition` · `scheduler` · `index` · `model-config` · `probe-config` · `channel-plan` · `trigger-plan` · `probe-plan` · `budget-override` → 前缀 `cfg-*` 或建 `config/` 子域说明<br>② **判据/契约面**：`criteria` · `content-types` · `injection-playbook` · `llm-catalog` → 前缀 `crit-*`<br>③ **安全/准入面**：`secret-redact` · `inject-guard` · `ingest-admission` · `panel-guard` → 前缀 `guard-*`<br>④ **运维/活动面**：`activity` · `file-stat-cache` · `proc-async` · `bank-lock` · `session-review` · `sleep-report` · `pointer-deficits` → 前缀 `ops-*`<br>⑤ **其余**：`treeops` · `forgetops` · `sectionops` · `essence-release` · `proposal-apply` · `crossform-dedup` · `cue-space` · `due-window` · `ingestion-*` 等按最近域归 |
| **⚠ 代价** | **重命名 = 改 import 面**（106 件的依赖图）⇒ **高风险**，建议**分批 + 每批过 `audit-architecture`** |
| **替代方案** | **不改名，只登记**：在 `ARCHITECTURE.md` §3 补一张"杂区→建议域"映射表（**零代码改动**，成本极低） |

---

## 3. 分期建议（按依赖序 + 风险递增）

> **注**：经归因，原「扩容点 1」（环覆盖面归因）与「扩容点 5」（六环通路）**已合并为同一件事**：
> 都是 **`adaptiveTopN` 上限**问题。故下表中不再分列。

| 册 | 内容 | 为何这个序 | 撞墙风险 |
|---|---|---|---|
| **册一** | **扩容点 3（B2 接口）** | 修它之后，扩容点 2 的"有没有生效"才**可观测** | 低（一处签名 + 一处传参） |
| **册二** | **扩容点 4（比较机器）** | 独立、纯新增、无回归面 | 低（新件） |
| **册三** | **扩容点 5（`adaptiveTopN` 上限）** | 最省的一处改动（一行），**但需先算清"抬到多少"**（有预算与饱和两个约束） | 低-中（撞预算 363 字符余量） |
| **册四** | **扩容点 2（判别力）** | 依赖册一的观测能力 | 中（改判据语义） |
| **册五** | **扩容点 6（域归位）** | **风险最高**（改名 = 改 import 面，而顶格三件恰是最高频被引件）⇒ 放最后，**建议只做"登记版"** | **高** |

---

## 4. 须用户拍板

| # | 问题 | 选项 | 推荐 | 理由 |
|---|---|---|---|---|
| **Q1** | 域归位（扩容点 6）走**改名前缀**还是**只登记映射表**？ | A 改名（彻底但高风险）· B 只登记（零改动）· C 分批改名 | **B** | 实测：**顶格三件恰是最高频被引件**（`targets` 29 / `deepsleep-core` 17 / `panel-shared` 15）⇒ 改名代价与棘轮顶格叠在同一处；且 `deepsleep-run` 跨 5 域引 13 件 ⇒ 改名要动的是**装配面**，风险最高 |
| **Q2** | `adaptiveTopN` 的上限怎么办？ | A 直接抬 12 这个数 · B 改增长函数（如对数/线性带帽）· C 给 `cue` 与 `due` 分设额度 · D 先不动只加观测 | **C 或 B**（须先算） | 实测：`ringN=1534` 时 `sqrt≈40` 被截到 12；**若只抬数字，`ringN` 每次增长都会再次撞顶**（记录越多覆盖率越低）⇒ **改增长函数比抬数字更稳**；而 **C** 解决"两类信号共用一池"的结构问题 |
| **Q3** | 判定器判别力（扩容点 2）做**提升材料**还是**换判据源**？ | A 提升 `buildYieldRequest` 材料 · B 换判据源 · C 先只加观测 | 见 `landing-plan.md` §4 | 真死因 = 模型 100% 判不准（`yield.verdict` 6/6 `unjudged`），非接线问题 |
| **Q4** | 基建杂区是否本轮动？ | A 只登记 · B 分批改名 · C 不动 | **A** | 32 件 / 6343 行（23%），零代码改动即可让边界可见 |

---

## 5. 未验证与边界

| # | 项 |
|---|---|
| U1 | ~~扩容点 1 的两种成因~~ | ✅ **已闭合**（见 §2.2 扩容点 1）：真根因 = `adaptiveTopN` 的 **`min(12, …)` 硬上限**，1534 条环记录仅 12 条可达（**0.78%**） |
| U2 | ~~`deepsleep-run` 扇出 25 的具体耦合面~~ | ✅ **已闭合**：25 个依赖中 **13 个属"基础设施杂区"**（activity · converge-candidates · criteria · essence-release · forgetops · model-config · proposal-apply · recall-diagnosis · recall-yield · sectionops · targets · treeops · vec）⇒ **一个装配件要跨 5 个域引 13 个模块，却全部无域名前缀** ⇒ **域边界不可见**。**这正是 P1（杂区 23%）的机械后果** |
| U3 | ~~域归位的改名代价~~ | ✅ **已量化**：引用数 top5 = `targets` **29** · `vec` **21** · `record-store` **20** · `deepsleep-core` **17** · `panel-shared` **15**。<br>⚠ **关键交叠**：**导出顶格的三件（`targets` / `deepsleep-core` / `panel-shared`）同时是高频被引件**（29 / 17 / 15）⇒ **改名代价与棘轮顶格压在同样三件上** |
| U4 | ~~注入面预算余量~~ | ✅ **已闭合**：总预算 `budgetChars = 4000`；情境槽 **1200，实用 837，余量 363**。可调通道已存在（`budget-override#injectBudgetChars` 范围 1200–20000） |

**边界自检**：本文件为**决策态**，零施工；未改 `src/`、未改配置、未写 ADR、未抬基线。

---

_建立 2026-09-24 · 关联：`landing-plan.md`（总方案）· `captain-verification-log.md`（证据链）_
