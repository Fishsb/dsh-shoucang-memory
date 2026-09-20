# 待办总表（OPEN ITEMS）

> **用途**：本仓**唯一的待办入口** —— 任何"还没做完的事"都必须在此登记一行，否则视为未登记。
> **当前状态（2026-09-15 机检）**：五阶段（S0–S4）+ S4R + S4X + S4Y + **UI1 面板架构整理** 的**可施工项全部完成**；
> 下表 3 项**判据全部满足**（`node scripts/verify-open-items.mjs` ⇒ **3/3**），**当前无阻塞项**。

**最后更新**：2026-09-20

---

## 0i. ✅ **门4 根因定位并修复：取值域从未抵达 prompt**（2026-09-20 round 9）

> **性质**：门4 挂了多轮，处置在「等样本」与「补接线」之间反复。本轮**第三度更正**，这次定位到一条
> **可修的链断** —— 与既有 `formatConstraintLine()` **同族**。

| 环节 | 事实（实测） |
|---|---|
| 现象 | 台账带 `l0After` 的 **551 行**，`conflict` 取值**全 `none`** ⇒ `supersede` **产量 0** |
| 模型原始取值 | `judgement.conflict`：`none` 403 · **`无` 11 · `0` 9 · `false` 8 · `0.1` 5 · 整句 3** · `replace-1` / `yes` / `1` / `(缺)` 若干 |
| **根因** | prompt 只带 `JUDGEMENT_HINT`，原文是「…**取值见 criteria 注册表**」—— **而模型读不到注册表**（它是构建期投影）。实测：两处 prompt 常量（`distill.ts` / `deepsleep-core.ts`）里 `supersede` / `coexist` / `cross-task` / `cross-day` **命中 0** ⇒ 模型只能**自造** |

**⇒ 与既有 `formatConstraintLine()` 的判因**（原文：「模型**不知道有上限**」，导致索引行因超 30 字被整条丢弃）**完全同族**：
**判据在注册表里，而模型手里没有。**

**修复（本轮已施工 · R2 可逆、不改判定语义）**：
- `gen-criteria.mjs` 新增 `l0EnumLine()` —— 从注册表 `l0.*.values` **派生**取值域说明
  （含 `conflict` 三义辨析 + 「拿不准填 `none`」的宁缺毋滥指引；**不手抄** ⇒ 不漂移）；
- 投影为 `JUDGEMENT_VALUES`，接入 `DEFAULT_DISTILL_PROMPT` **与** `DEEP_SLEEP_PROMPT`。

**判据**：`check-l0-conflict-wiring` 新增 **④（3 断言）**：
① 生成物含**全部** L0 取值字面量（12 个）；② **运行期 prompt** 含全部取值；
③ 两处 prompt 均接入。
**先红实证**：删掉深睡 prompt 的 `${JUDGEMENT_VALUES}` ⇒ **exit 1**；还原 ⇒ **exit 0**；**字节级还原 true**。

**⚠ 我的判据写错一次（记档）**：④ 首版 grep `lib/distill.js` 找字面量 ⇒ **假红** ——
`DEFAULT_DISTILL_PROMPT` 在 `tsc` 产物里是**模板表达式**（`${JUDGEMENT_VALUES}`），字面量只在**运行时**展开。
⇒ 改为 **import 模板常量求值**。教训：**判「文本里有没有」之前，先确认读的是「已求值的文本」还是「生成它的文本」**。

**剩余段（门4 的真正接线）**：`fact-ring#supersede()` 的落库调用 —— **方案与验收成对**见
**`docs/specs/gate4-supersede-plan.md`**（**决策态 · 待具名授权**，R1）：
4 册分批（新件+单测 / 蒸馏落点 / 深睡落点+通道锁 / 读取侧实证），每册判据与复验命令齐全；
**前置门语义已改变** —— 不再是「等一个不可能出现的取值」，而是「看修复后新落账的分布」。

---

## 0h. ✅ **门3 判据满足** + 🟡 **S-P1b″ 口径定案** + ⚠ **新发现：`newTracesMin` 名实不符**（2026-09-20 round 9）

> 门3 与 S-P1b″ 挂了多轮，共同点都是「缺读数」而非「缺机制」。本轮把两者的读数都做出来。

### 门3（行为回灌）· ✅ **判据满足，可接线**

**真机读数（跨档读 · 只取修复后带 `prevTextSrc` 的行）**：

| 量 | 值 |
|---|---|
| 修复后 compliance 行（带 `prevTextSrc`） | **112**（阈值 ≥30 ✅） |
| 其中 `topicEcho=true` | **9** ⇒ 回引率 **8.0%**，落在 **(0%, 95%)** 区间 ✅ |
| `prevTextSrc` 分布 | `events` 100 · `events-empty` 12（**两类失败可分辨**，正是修复目标） |
| 对照：修复前（无 `prevTextSrc`） | `topicEcho=true` **0 / 1847 = 0%** |

⇒ **判据两条件同时满足**（样本 ≥30 且占比落在开区间内）⇒ 「信号接选行」**首次具备意义**。
⚠ **但接线是行为变更**（`switchSource`/`zeroGain` 接进选行会改召回行为，且该路径 R3 属性待判），
本轮**只出结论不动行为**；且 `switchSource` 在**修复后**样本上仍 **95/112 = 84.8%** 恒真
⇒ **它自己仍是坏判据**（`topicEcho` 好了、`switchSource` 没好，两个信号**不是一回事**，
不可因为前者转绿就顺手接后者）。接线前须先定 `switchSource` 的去向（重定义或退役）。

### S-P1b″（内容水位口径）· 🟡 **口径定案，判定改动待拍板**

**定案**：内容水位的**正确轴 = 窗口内痕迹文件数**（`countWindowTraces`）。
否掉了此前三个候选，各有硬证据：① `windowMaterialBytes`（字节量）**与真实材料非同源**（实测 0 vs 46692）；
② `materialChars`（装配总长）有**地板效应**（min 已达中位 43%，量的是固定开销）；
③ 「上一纪元 `materialChars` 作前瞻代理」同因 ② 不成立。
新轴同时满足**同源**（与"新增材料"同一枚举）、**零额外 IO**（复用同一遍 `enumerateWindowTraces`）、**可测量**（已落审计 `traceFiles`）。

### ⚠ 新发现（本轮 · 与 §0g 同族）：`trigger.newTracesMin` **名实不符，且根本没登记**

- **名实不符**：注册名与 note 写「窗口内最少新痕迹**数**」，而消费点 `deepsleep-run.ts:490` 比的是
  `gatherDeepSleepTraces(...).length` —— **材料段字符数**（**该处日志自己写着「痕迹 N 字符」**）。
- **为什么长期没暴露**：值 `1` ⇒ 两义恰好同效（材料非空 ⇔ 至少一条痕迹）⇒ 属**潜伏的假旋钮**
  （调到 `3` 则名字说「3 个文件」、行为是「3 个字符」，**几乎必然通过**）。
- **真机影响面（行为级）**：49 纪元中 **46** 个 `materialBytes=0`（窗口内零文件），其中 **25** 个仍照常入睡
  ⇒ 若真按文件数判，这 **25 轮全不该入睡**（砍掉 51% 入睡纪元的输入面）。
- **为什么此前没被任何门抓到**：它**根本没进 `thresholds.entries`**（21 项里此前无此项）——
  而它是「睡不睡」的判据，按 `thresholds.note` 的范围界定**属于应登记项**。**漏登记的阈值 = 不可见的旋钮。**

**本轮已做**：真轴 `deepsleep-traces#countWindowTraces`（与 `gatherDeepSleepTraces` **同一遍枚举**，
非第二份实现）+ 审计字段 `traceFiles` + 登记项 `trigger.newTracesMin` + name/note 订正
+ 判据 `test-epoch-watermark` **⑤/⑤′**（6 条断言，含变异反证：把 `countWindowTraces` 改回复现原病灶 ⇒ 必红）。
**未做（R3）**：把判定真的改成按文件数 —— 属**行为变更**，须用户拍板。

---

## 0g. 🔴🔴 **我自己上一轮的「阈值假旋钮」分类被推翻：判据建立在代理指标上**（2026-09-20 round 8 · 最高优先）

> **性质**：与 §0f 同族 —— 不是"新增待办"，而是**已有结论的真伪问题**。上一轮我新增门禁
> `check-threshold-consumed.mjs`，把 9 项阈值分进「真死配置 / 命名不符 / 键名写错 / 消费点是字面量」**四类**，
> 写进注册表 `thresholds.unconsumed` + `unconsumedNote`。**本轮逐项复核，四类里至少两类是错的。**

| # | 我上一轮的结论 | **实测真况** | 性质 |
|---|---|---|---|
| **0g-①** | `mcl.fastGate` = **真死配置**（`minHits`/`ratio` 只出现在生成物里） | ❌ **错**。其 `probe.contains`（`hit / sg.length >= 0.6`）在 `mcl.ts` 里**确有一处** —— 但那是 **`judge()` 的词元覆盖率门**，**不是**快通道门（后者 = `sim >= familiarThreshold && hasHighConf`）。⇒ 判据**真实存在且可调**，只是**登记项贴错了名字** | **登记项名实不符**（非死配置） |
| **0g-②** | `activity.statusDays` = **键名写错**（指向不存在的参数） | ❌ **错**。值是活的：`scheduler.ts` zod 缺省 → `deepsleep-run.ts` → `activity.ts` opts。只是 zod 缺省**硬编码 `14/44/90`** 而不读注册表 ⇒ 与其余同类，都是**双源** | **双源**（非键名错） |
| **0g-③** | 其余 7 项分为「命名不符」与「消费点是字面量」两类 | ⚠ **分类本身无效**。那套判据的**代理是「键名是否在 src 里出现」**，而键名会被**注释、生成物、同名局部变量**同时左右 ⇒ 产出的是「**命名巧合表**」，**不是断链表** | 判据缺陷（同族：`[原则] 代理指标非判据`） |

**机制级事实（上一轮整轮漏掉 · 这才是病灶）**：`THRESHOLDS`（整份阈值投影）在 `src/` 内 **零消费者** ——
9 项登记项的 `probe` 指向代码里的**裸数值字面量**（`>= 0.66` / `>= 0.9` / `v >= 0.5 && v < 0.66` …）。
⇒ **治本不是逐项改字面量，而是给投影一个读口**。为什么三方门禁全绿：`check-threshold-registry` 只判
「**登记了没**」· `check-field-usage` 只看 `CRITERIA_ROWS` 系的**字段角色**（且其孤儿常量检测的名字表
**写死了 14 个**，`THRESHOLDS` **天然不在监测面**）· `check-hardcode` 恰恰**希望**常量集中。

**本轮已修（11 项全部接线 + 门禁换血）**：

| 动作 | 落点 |
|---|---|
| **新增唯一读口** | `src/criteria.ts#thresholdValue(id, fallback)` + `#thresholdParam(id, key, fallback)` |
| **9 项消费点改读读口** | `crossform-dedup.ts`（`inject.crossFormDedupSim`）· `activity.ts`（`activity.statusDays` 三键 + `activity.hotHits` + `activity.interferenceBand`）· `deepsleep-tree.ts`（`tree.indexSemanticSim` / `tree.sectionMergeSim`）· `distill-write.ts`（`ingest.dedup.bigram.threshold` / `write.semanticDupSim` / `write.cardSimilar`）· `mcl.ts`（**`mcl.fastGate` → `mcl.topicEchoGate`**，名实对齐后接线） |
| **字面量降级** | 全部降为**注册表缺项兜底**（值与登记值一致，由 `check-threshold-registry` ④ 的 `read` 探针守**不漂移**） |
| **门禁换血** | **删** `check-threshold-consumed.mjs`（判据建立于被推翻的分类上 ⇒ 留着=**把错判据固化成门**）；**新增** `check-threshold-control.mjs` |
| **I1 棘轮** | `mcl.ts` 接线后 `registerMcl` 涨到 **126 行**（>120）⇒ 把 `judge` 提为模块级 `judgeTopicEcho`（仓内约定：实现函数在模块级），回落 0 违规 |

**新门禁判据（建立在「读口」上，不是名字上）**：
① 凡 `probe` 为**代码字面量形态**的登记项，必须带 `read` 声明**且该读口在 src 内真实存在**
（**剥注释后**判定 —— 上一轮的假绿正是被注释喂出来的）；
② 读口本身不得是孤儿（src 内 `thresholdValue`/`thresholdParam` 调用点 > 0）；
③ **`registryPath` 型也不自动安全**（本轮新增）：`ingest.criteria[...]` 两族的取值须经
`paramOf` / `thresholdValue` / `criteria-gate.json` 之一 —— 反例是真机 `ingest.dedup.bigram.threshold`
（值确在注册表，而消费点当时写裸字面量 `>= 0.66` ⇒ 改注册表零效果）。

**先红实证**：临时把 `crossform-dedup.ts` 的读口改回裸字面量 ⇒ 门禁 **exit 1**；还原 ⇒ **exit 0**；
字节级还原 = true（脚本自证，非自述）。`--selftest` **5 例 · 3 条反例**（含「只有字面量无读口」
「读口只出现在**注释**里」「读了**别的 id**」）。

**验收（六层）**：typecheck 0 错 · build OK · **check-runner 185 pass / 0 fail** · 副本 **287/287** sha1 一致 ·
热重载 fiber active · 特性 **82 项** · 注入对拍**逐字节一致（3 case）** · 公开树 PASS · 硬编码 PASS ·
`ui-geo-regress` **121 PASS / 0 FAIL** · 契约 5 PASS + 产物新鲜（路由 44 条）。

**⚠ 留下的教训（本轮最值钱的产出）**：我上一轮**自己写下**了「代理指标非判据」的原则，**同一轮又用它造了一道门**。
⇒ 纪律加一条：**新建门禁时必须写明"这条判据的代理是什么、代理在哪里会失真"**；答不出 ⇒ 该门禁只是**噪声源**。

---

## 0f. 🔴🔴 **G13「轮转失明」大面积漏网：三处结论被推翻**（2026-09-20 · 本轮最高优先）

> **性质**：这不是"新增待办"，而是**已有结论的真伪问题**。台账 `audit/ledger.jsonl` 按大小轮转
> （`ledger-compact#rotateBySize`，保留 3 档），**只读主档 = 静默丢历史且不报错**。
> 本轮实测：**10 件**消费点仍是单档读（此前已独立修过 3 处，但**没有一道门问"还有谁在读单档"**）。
> 逐 kind 失真（单档 → 跨档）：`deep-sleep` **0 → 49**（全丢）· `mcl-step` **981 → 9115**（漏 89.2%）·
> `distill-run` **56 → 879**（93.6%）· `write.ingest` **29 → 537**（94.6%）· `decision.ingest` **32 → 616**（94.8%）。

| # | 被推翻的结论 | 原读数（错） | **真读数（跨档）** | 后果 |
|---|---|---|---|---|
| **G13-①** | **S-P1b′/S-P1c′ 阈值"不可校准"** | `epoch-calibrate` 报「纪元 **0** < 10 ⇒ `insufficient-data` ⇒ 维持关闭」 | **46 个不同纪元** ⇒ `calibratable` | 两条阈值（`trigger.contentMinChars` / `trigger.materialChunkChars`）的**"何时可校准"判断一直是错的**；现已在注册表 `recheck` 段更正 |
| **G13-②** | **OPEN-3「L3 forget 候选消费」判据未满足** | `verify-open-items` 报「审计轮次 0」 | **49 轮**（cand>0 的 **48** 轮 · 消费 **37** 轮 · 最近 cand=1 kept=1） | 该项**早已满足**，长期挂在表上；现 `verify-open-items` 报 **3/3** |
| **G13-③** | **门3「信号源已死」的程度** | `yield-signal-probe` 报 compliance **635** 行 · `switchSource` 恒真 **98.0%** | compliance **4722** 行 · 恒真 **94.6%** | 「信号源已死」**成立且更严重**（分母补齐后病灶更清楚）；但**样本量结论**须以新值为准 |

**已修（本轮）**：10 件消费点全部改为跨档读（`readLedgerVolumes` 唯一实现）——
`epoch-calibrate` · `mcl-calibrate` · `mcl-compliance` · `recall-diagnose` · `essence-review-stability` ·
`verify-open-items` · `yield-signal-probe` · `criteria-audit` · `criteria-report` · `memory-reconcile`
（+ 源码侧 3 处：`panel-arch#ledgerFacts` · `session-review#buildMaterials` · `sleep-report#roundInputFromLedger`）。

**防再生门禁**：新增 `scripts/check-ledger-read.mjs`（源码面**硬门** + 脚本面报告态 + **10 条样例全部取自真机原文**的自证）
并登记 `check-runner`（**173 → 175 件**）。该门与 `check-observability --parsability` **分工不重叠**：
前者治「读的**档位**」（跨档/单档），后者治「读的**编解码**」（失败行）——实测两者会**同时命中同一个器**。

**顺带暴露（**本轮已修** · 见下）**：`memory-reconcile` 改跨档后报出 **`MEMORY.md` 未解释差异 499 行** ·
`USER.md` 21 行 · `AGENT.md` **-2** 行 ⇒ 追根因后确认**三处全是判据口径缺陷**（非库损）：
① **同字段两语义**（`write.consolidate.target` = 文件名 vs `write.ingest.target` = 库标识）·
② **只算加项不算减项**（`treeops`/`forgetops`/`converge` 的行减少通道未计入）·
③ **写通道缺回执**（唯一能写 `USER.md` 的 `profiles` 通道此前不发回执）。
**修复**：写侧补 `write.profile` 回执 + 判据补减项与双口径 + **一次性重锚基线**（旧值留档 `priorBaselines`）；
新增门禁 `check-write-receipts`（4 条断言，含**运行期判据 ②″** 与 `--kroot` 先红自证口，登记 **175 → 177**）。
现闭合 **✅ 未解释差异 0**（三文件一律按 `=== 0` 硬判，比原判据更严）。

**⚠ 遗留一项（下次可做 · 非本轮范围）**：`write.ingest` 的 `target` **仍无文件维**（只到库标识
`shoucang`/`none`/`workspace`）—— 即「这一轮往 `MEMORY.md` 写了几行索引行」在台账上**仍不可回答**，
当前只能以「基线 + 域级上界」规避。**真正的解 = 写侧给 `ingest` 回执补文件维**（改动面小、语义清晰，
但须单独一轮 + 再次重锚基线）。判据：`check-write-receipts` ③ 已守字段齐备；补文件维后本项可删。

---

## 0e. 🔴 记忆吸收评估产出（2026-09-20 · 只读圆桌会议）

> **口径**：本轮结论已部分落地（见 `CHANGELOG.md [Unreleased]` 首条）；**下表登记尚未落地的两项**。
> **共同判因**：两者都不是"机制缺失"，而是「**零样本**」—— 缺的是**触发源**，不是门。
> 按「**夹具绿非真数据绿**」纪律：**先造触发源，再谈接线**。

| 项 | 现状（实测） | 卡在哪 | 触发条件（谁满足了就该做） |
|---|---|---|---|
| **门4 时态剔除进注入链** | **⚠ 登记已于 2026-09-20 两度更正 —— round 9 第三度更正：真因是「取值域从未抵达 prompt」（已修）**。见下「§0i」 | **根因（本轮定位）**：prompt 只带 `JUDGEMENT_HINT`（原文「取值见 criteria 注册表」），而**模型读不到注册表** ⇒ 实测两处 prompt 常量里 `supersede`/`coexist`/`cross-task` **命中 0** ⇒ 模型自造取值（真机 `无`/`0`/`false`/`0.1`/整句）⇒ 台账 551 行 `l0After` **全 `none`** ⇒ **`supersede` 产量 0**。**与 `formatConstraintLine()` 同族**（「模型不知道有上限」）。**已修**：`gen-criteria#l0EnumLine()` 派生取值域 → `JUDGEMENT_VALUES` → 接入**两处 prompt**；判据 `check-l0-conflict-wiring` ④（3 断言 + 先红实证）。**剩余段**：`fact-ring#supersede()` 落库接线 → **方案与验收成对**见 **`docs/specs/gate4-supersede-plan.md`**（决策态 · **待具名授权**，R1） | ① 修复后新落账出现 `l0After.conflict='supersede'` 行 · ② 取得该裁决的**具名授权**后补落库接线 ⇒ 真库 `validTo` 非空 ≥1 ⇒ 门4 全链可验收 |
| **门3 淘汰门（行为回灌）** | **✅ 判据已满足（2026-09-20 round 9 实测）—— 详见 §0h**：修复后带 `prevTextSrc` 的 compliance 行 **112 条**（≥30 ✅），其中 `topicEcho=true` **9** ⇒ 回引率 **8.0%**，落在 **(0%, 95%)** ✅。两类失败可分辨（`events` 100 / `events-empty` 12）。对照修复前 **0/1847 = 0%**。⚠ **但 `switchSource` 在修复后样本上仍 84.8% 恒真**——`topicEcho` 与 `switchSource` **不是同一个信号**，不可因前者转绿就顺手接后者；接线本身亦属行为变更，本轮**只出结论不动行为**。**根因（本轮之前已修）**：`switchSource` 恒真的根因链 —— `topicEcho` 恒 `false` ← **`prevText` 恒空**（原实现从 `decision.messages` 找 assistant 回复，而那是**"本步新认领的消息"**，收尾步恒空；`OPEN-ITEMS §0d` 早已实证该语义）。**改**为从 `agent.session.snapshotEvents()` 取 `assistant/message` 的 text 片 + 降级保护 + 审计 `prevTextSrc`（**两类失败可分辨**）。判据 `test-prev-text-source`（登记 **179 → 181**）。<br>⚠ **但"真实回引率是否落在有判别力区间"仍待真机样本**：修复后须新 compliance 行落账才可测（探针实测**当前 0 行**，如实记）。判定结果**仍只进审计、不反馈选行** | **接线前须先看真实回引率**：恒真已从**根因**上消除，但"回引率是否有判别力"须等真机行 | 新 compliance 行 **≥30** 且 `topicEcho=true` 占比落在 **(0%, 95%)** 区间 ⇒ 此时"信号接选行"才有意义 |

**已落地部分**（详见 `CHANGELOG`）：读数口径四件套（`check-observability --parsability`）· `buildCandidates` 闭环自述如实化 + 抵达面钉住 ⑫ · `adviseFromMissCounts` 定位锁定 · Letta 许可证标签更正。

**明确不吸收**（有硬理由，非保守）：① 分层门「P 触顶不得挤 P」与用户 2026-09-16「容量非硬限」拍板冲突（R3②）；② 外部五仓库**全为 Python 栈**，本仓纯 TS 零新增运行依赖 ⇒ 只取判据形状不取代码；③ Mem0 的 `DELETE` 与「遗忘＝迁移，不删除」（`forgetops.ts` + `record-store.ts:296`）冲突。

---

## 0d. 🔵 「把注入搬进会话消息」——**只读观测已出，结论：不等价，暂不建议搬**（2026-09-16）

**动机**：用户要求"只注入一次"。system prompt 的内容**每步仍会发给模型**（API 语义），
要真正"只发一次"须改走**会话消息**通道（宿主自己用 `runtimeContext` 就是这么做的）。

**已做的（只读观测，不动行为）**：挂 `agent/pre-step` 探针（**永远原样 `return next()`**，异常吞掉再放行），
记录每步 `messages` 的长度/`firstSeq`/`lastSeq`/增量和**是否已含宿主 runtime context**，读数经 `/inject/stats.preStep` 暴露。

**首条实测**（`sid=6b89a084 step=10`）：

```
n=0 · firstSeq=-1 · lastSeq=-1 · delta=0 · hasCtx=False · isFirst=True
```

⇒ **该步 `messages` 长度为 0**！原因：宿主 `agent-loop` 的语义是
`const claimed = this.inbox.claim(target, position.turn)` ⇒ **`messages` 是"本步新认领的消息"，不是全历史**
（读码已判过一次，真机再次确认）。那条 step 10 是**收尾步**（工具跑完后无新用户消息）⇒ 自然没有消息要进入。

**⇒ 决定性结论**：把注入追加进 `messages` ⇒ **只会在"有认领消息"的步里出现**；`n=0` 的步**根本没有载体**
⇒ **语义与 system prompt 通道不等价**（后者保证每步都在）。若强行搬，会出现"某些步没有记忆"的**不确定性**，
比"内容重复发送"更糟。**故暂不建议搬**；若仍要搬，须先解决"无消息步如何承载"（宿主未给该路径）。

**当前保留**：`agent/pre-step` 探针为**只读**，长期留着当观测面（代价近零，不动行为）。

---

## 0b. ✅ 悬案了结：主会话 `q` **正确**（按会话读数实证）· 缓存按设计工作（2026-09-16）

**原判（已推翻）**：我据 `/inject/stats.cache.lastQ` 显示会议文本 + `rebuilt=8/9`，判「`q` 取值异常 ⇒ 缓存形同虚设」。

**了结证据（按会话读数 + 隐私面同时收窄）**：把全局单值改为**按 `sid`** 记录 `{qLen, qHash(djb2), reason, rebuilt, reused}`
（**只记指纹，不回抄用户正文**），真机连读两次：

```
calls=1 → bySid: sid=6b89a084 · qLen=2 · qHash=005c4d6f · reason=new ·     rebuilt=1 · reused=0
calls=2 → bySid: sid=6b89a084 · qLen=2 · qHash=005c4d6f · lastReason=new · rebuilt=1 · **reused=1**
```

⇒ ① `qLen=2` = 用户消息「继续」两字 ⇒ **主会话的 `q` 就是当前用户消息**（**不是**会议文本）；
② 同一 `qHash` 下 `reused` 递增 ⇒ **同回合内多步只重建一次**（设计目标达成）。

**根因（原判错在哪）**：`lastQ/lastReason` 是**「最近一次重建者」的全局单值** —— 别的会话（圆桌会议节点 / 深睡子代理）
重建时会覆盖它 ⇒ **它不是主会话读数**。**判据必须以「按会话」为前提**，否则必然误判。

**同时收窄隐私面**：端点原先回抄 `q` 前 40 字（用户正文），现改为 **`len` + djb2 哈希** ⇒ 只验"是否同一段文本"，不泄露内容。

---

## 0c. ⚠ 自造污染：**诊断输出勿原样引用被诊断字段**（已犯一次，记档）

我在上一条回复里**原样引用了 `lastQ` 的值**（"你已加入圆桌会议…"），它随即**写回我的会话**
⇒ 下一次采样（读会话日志找该文本）时**命中了我自己的回复**（`assistant/message`×2、`tool/result`×1），
**诊断现场被我自己污染**（行号 10711/10714/10724/10729）。

⇒ **纪律**：诊断读数**只报摘要/指纹**（长度 + 首若干字即可判断），**不整段回抄**。

---

## 0. 三项判据机检（2026-09-15 · `node scripts/verify-open-items.mjs`）

> **为什么新增这个件**：三项各自写着"复验命令"，但**判据分散**（一个要跑 `recall-diagnose`、
> 一个要翻审计的 `replayHits`、一个要算材料 `counts`）⇒ 复检成本高 ⇒ **实际没人复检**。
> 本次实测就发现 **OPEN-1 的阻塞条件早已满足（样本 119 ≥ 30）却仍挂在表里**。
> ⇒ 收敛成**一次运行**（报告态，**不改库不改配置**，不入 CHECKS）。

| 项 | 判据（原文口径） | 实测 | 结论 |
|---|---|---|---|
| **OPEN-1**<br>D2 两条件分流 · D4 零贡献率改善 | 样本 ≥30 ⇒ `advice` 落 `fix-recall`/`lower-threshold`/`enable-embed`；**方向由数据推导，不猜** | 样本 **120**（≥30 ✅）· coarse `advice`＝**`lower-threshold`** · **细校准＝`KEEP`**（按**预注册判据**目标覆盖率 27.5%：最优 t=**0.55** 覆盖率 **27.3%**，距目标 0.2pp；降到 0.54 ⇒ **39.1%，过冲**）· 现值 **0.55** | ✅ **闭环·维持 0.55 不改** |
| **OPEN-2**<br>L1 跨日二次激活的「因果」 | **≥1 条原则的 `← 源:` 落在 `replayHits` 候选内** | replay 候选 **10** 条（`counts.replay=10`，与上轮审计 `replayHits:10` 吻合）· 原则源命中 **5 处** · 被消费候选 **4/10** | ✅ **闭环·判据满足** |
| **OPEN-3**<br>L3 `forget` 候选消费 | `> 0` ⇒ 应见 `forgetArchived`/`forgetKept` 消费；`= 0` ⇒ **正确期望**（空≠故障，**禁止硬消费造数据**） | 当前 `counts.forget=1`（候选：`flows.md §判据分工（hits 0 · 距最后命中 从未）`）· 审计 2 轮中 **1 轮 `cand>0`** ⇒ 最近一轮 `cand=2 · kept=1 · arch=0` | ✅ **闭环·判据满足**（库龄门已过） |

**OPEN-1 的核心发现**：**coarse 建议与细校准结论相反** ——
`recall-diagnose` 的 `advice` 只给**粗方向**（"阈值层 ≥ 召回层 ⇒ 阈值是可动杠杆"），
而**预注册的细校准**（同 2026-09-14 P7/D3 方法）在 **2154 条样本**上给出「**0.55 已恰好命中 27.5%，不应下调**」。
⇒ **以细校准为准**（降 0.54 会过冲注册意图 11.6pp）。
且判据语义决定：`no-highconf`（召回层）判定**先于**阈值 ⇒ **降阈值只能救 `below-threshold`（28 条），对召回层 12 条完全无效**。
**若要继续改善召回，须另立「召回层」项（词表/索引/情境）—— 非本项可及。**

**复检触发**：OPEN-1 近期带 `missReason` 样本 **N≥300（现 120）**；OPEN-2/3 每轮深睡后可复检（本件只读，**不触发深睡**）。

---

## 1. 待条件项（不可由 agent 自行推进）—— **当前 3/3 判据已满足**

| # | 项 | 原「差什么」 | 复验命令 | 判据 | 何时复检 |
|---|---|---|---|---|---|
| **OPEN-1** | D2 两条件分流 · D4 零贡献率改善 | ~~MCL 归因样本 6 / 30~~ → **已 120** | `node scripts/mcl-calibrate.mjs` | 见 §0；**预注册目标覆盖率 27.5%**，< 30 样本 ⇒ `insufficient-data` **不猜方向** | 近期样本 ≥300 时重跑 |
| **OPEN-2** | L1 跨日二次激活的「因果」 | ~~产出是"原则"、未直接消费 replay 候选~~ → **已消费** | `node scripts/verify-open-items.mjs` | **≥1 条原则的 `← 源:` 落在 `replayHits` 候选内** | 每轮深睡后 |
| **OPEN-3** | L3 `forget` 候选消费 | ~~**库龄**（窗口 90 天）~~ → **已见非零候选** | 同上 | `> 0` ⇒ 应见消费；`= 0` ⇒ 正确期望 | 此后每轮 |

> ⚠ **不因"判据满足"而删除本表**：判据是**持续复检用的**（例如 OPEN-2 若某轮起不再消费 replay 候选，
> 就是**回归**）。⇒ 表保留为**判据登记**，判据满足 ≠ 该项从此免检。

---

## 2. 已决策「不做」的项（**结论**，非欠账）

| 项 | 决策 | 理由（可检验） | 若要翻转 |
|---|---|---|---|
| **L2** `gatherMaterials` 163 行 / `runDeepSleep` 323 行 | **不拆** | 前者 11 段**已用 IIFE 分段**且每段**只被调用一次**（拆了不增复用，只散裂局部性）；<br>后者抽出阶段函数**必传约 20 个依赖别名** ⇒ **撞 `audit-wiring` I2（Deps ≤12 字段）** | 对拍基线已备：`_memory/audit/materials-baseline.json`（sha1 `7872c333…` · 11 字段 · 20,117 B），**直接可做逐字节对拍** |

---

## 3. 已决的语义澄清（防止被当成待办）

| 项 | 结论 |
|---|---|
| **L4** 装配接管主路径 | ✅ **已撤销** —— S4R/R1 证明差异根源是 `RenderOpts` **选项不全**（缺 4 维），补齐后**逐字节等价** ⇒ **无须产品决策**，也无须牺牲用户可见文本 |
| **L8** `droppedStable` 少算 | ✅ **已修**（S4X/X1）：属**条件缺陷**（预算收紧时才显形），修复后数字守恒、缺省配置零影响 |
| `forgetCandidates = 0`（当前） | **正确行为**，不是待办 —— 库龄不足 ⇒ 无冷节（见 OPEN-3） |
| **G-22** `merge` 匹配 L4 | ✅ **已修**（2026-09-14 · S4Z）：`merge` 改为与 `rename` **同口径**（只匹配 L2/L3）；**实证后果曾是已落盘的树结构破坏**（cody-loss：整节消失 + 跨容器搬运 + 孤儿空容器）。`test-treeops-rm` 的 **xfail 双向锁如期翻成 XPASS** ⇒ 转普通断言 ⇒ **全仓首次零 xfail**（`93 pass · 0 xfail`） |

> **教训（本表新增一条纪律的反面例）**：G-22 长期以 `⚠ XFAIL（已知未修）` 的形式**每次**出现在
> `check-runner` 输出里，而我**连续多轮把它当背景噪音带过** —— 直到用户追问"还有吗"才去读它。
> ⇒ **"已知未修"必须进本表**（否则它会永远停在"已知"而无人"修"）。

---

## 5. 历史文档遗留（**不在五阶段目标范围**，但按 §4 纪律登记）

> 这些来自**更早的会话**（`anthropomorphic-plan` / `context-supply-plan` / `settings-audit` 等 12 份），
> **不属于本次 S0–S4 目标**。登记在此仅为**不再散落**；处理与否由用户决定。
> ⚠ 其中标注「**待核实**」的，我只读到扫描片段、**未逐行核对**，不得当作已确认的待办。

### 5′. **处置结论（2026-09-15 逐项核实 · 全部有结论）**

> **核实口径**：每条给**实测证据**（不照抄原文）。结论只有四类：**真缺陷（已修+带门）** / **已解决（后来做掉了）** /
> **前提消失（架构已改，该项已无对象）** / **待你决策或待时间**。

| 项 | 结论 | 实测证据 |
|---|---|---|
| **H-1** | 🔴→✅ **真缺陷·已修+带门** | prompt 的 P5 段要求「材料若给出**待回收的裁决**就填 `outcomes[]`」，而 `gatherMaterials` **从未产出该段** ⇒ 通道自上线起**结构性恒 0**。**实测**：库内 `decision` 50 条、**49 条待回收**，历史只收过 **1** 条 outcome。已接上 `pendingDecisions`（复用既有 `openDecisions`）+ `counts.pending`；**根因修**：`check-injection-reach` 补 ⑤（材料键抵达）+ ⑥（通道锁），含反例自证。CHANGELOG 已记 |
| **H-2** | ✅ **早已结清（非缺陷）· 原文自相矛盾** | `anthropomorphic-plan` **L463** 写「**E5 ✅ 关闭为非缺陷（Q3 结清）**」且给实测（独立计数 E 层画像行 = **25**，与 reconcile **完全一致**；成因＝无标签画像行回落 E）；**L853** 仍写「Q3 待补」——**那是没同步的旧行**，本表抄了旧行。另：`layerCounts` 在 `src/` **已不存在** |
| **H-3** | ✅ 已决 **no-go** | 原文；待「真实写入样本」且确需单事实源才翻转 |
| **H-4** | ✅ **已解决** | 两键已进 zod（`scheduler.ts:204-205`，注释标「U3 转正」）**且**进 panel-config 键表（`:98/:101/:152/:158/:218/:220/:251/:284`） |
| **H-5 + H-16** | ✅ **已解决（通道早已存在）· 并修掉导致误登记的呈现缺陷** | 6 键**都有可编辑 UI**：`enableDistill`/`distillPrescan` = 开关，`idleWakeMs`（**=F-001 唤醒空闲时长**）/`minTurnChars` = 数字输入，`llmProvider`/`llmModel` = 作为缺省、由**蒸馏模型 / 深睡归纳模型**下拉（「继承主会话」）覆盖（**F-002**）。通道 = 专用路由 **`/distill/config`**（`panel-observe.ts:550`，契约 `panel-contract.ts:76`）；**视图契约基线已把这 4 个键算作 `[sched]` 项**（`守藏蒸馏器 enableDistill` / `零成本预筛 distillPrescan` / `空闲唤醒 idleWakeMs` / `本轮最少字符 minTurnChars`）且 `test-panel-view-contract` **34/34 PASS**。<br>⚠ **本轮实测发现的真缺陷**：该节**标题在函数开头、控件容器在函数末尾**创建 ⇒ 中间隔着「召回与库版本」「认知环」两段 ⇒ **标题下空白、控件落到页尾无标题** —— **这正是当初把"无持久 UI 通道"登记进表的成因**（看一眼标题下面没东西）。已修（标题+说明+容器一起前置），并**新增该页签的永久出图 `shot-params-sched.png`**（此前出图集只出默认页签① ⇒ 该页签 6 个键长期无视觉证据）。真机复验：标题下即控件，且**动态回填当前生效值**（`空闲 10 分钟 / 本轮最少 200 字符 / 预筛 开 / 蒸馏模型 继承主会话`） |
| **H-6** | ✅ **已解决** | 全 `src/` 已无「接线待办」注释（`distill.ts` 现 **343 行**；`panel-arch.ts:193` 那处指的是**现行的** `criteria.json#wiring.pending` 机制，非漂移） |
| **H-7** | ✅ **前提消失** | `scripts/memory-ab-baseline.mjs` **已不存在**（仓内只有 `memory-reconcile.mjs`）⇒ 无「与 reconcile 合并」的对象 |
| **H-8** | ✅ **已解决（且有门）** | ① `RING_OF_KIND.valence = 'value'`（`rings.ts:37`），由 **`check-ring-coverage` 双向机检**与 `record-store.KINDS` 一致；② `dueRank` 已与 S4-4 的 **`dueSoon`** 并存（`ring-supply.ts:89/:108`），`content-types.ts:37` 判 `due → dueSoon` 且 **`wired: true`**，由 `check-content-types` 守 |
| **H-9** | ✅ **T1/T2 均已做** | **T1**（内容类型契约层）：`src/content-types.ts` 66 行 + 生成物 + `check-content-types` 门；**T2**（deepsleep 职责归属）：`src/deepsleep.ts` 112 行，`distill.ts` 仅留**装配点**（注释写明：让 deepsleep 直接 import distill 会**成环**） |
| **H-10** | ⏳ **待时间** | S6 观测收尾：自然跑 **2–3 天**。条件明确：样本自然累积，无代码动作 |
| **H-11** | ✅ **已解决**（标题早已归档化） | `docs/ui-todo.md` **L1 标题** = 「**# UI 待办清单（守藏面板）——已归档：实现记录**」——正是 H-11 建议的那句；`docs/settings-audit.md` **L13** 记的「建议标题改『已归档：实现记录』」**已被执行**。同表 L14（注释漂移 = H-6）/ L15–L18 亦全 ✅。<br>⚠ 该文件的 git 历史只剩 1 个提交（**历史已重置**）⇒ **无法从 git 判定归档化发生在何时**，只能确认**现状已完成** |
| **H-12** | ✅ **目的已达成（机制更强）** | 未加 `turnSeq` 字段，但水位行现记 `sessionId → lastSeq` **+ 双证**（格式代 + 锚点事件指纹，v19 · 2026-09-10），注释明确「宁可重蒸，不可错漏」；`test-watermark-guard` **44 PASS / 0 FAIL** 覆盖双证失效→降级基线（含 ⑪ 组） |
| **H-13** | ✅ **前提消失** | `journal.jsonl` 在 `src/` **与磁盘均不存在** ⇒ 该设计已被后来的架构替换 |
| **H-14** | ✅ **目的已达成** | 「蒸馏期互斥/卡死」已由**方案 E** 覆盖（**10min 超时 race + 仅 completed 推水位**，见 `dev-scenarios` 场景 10 ✅），并有 `test-idle-arm-wiring.mjs` 驱动真 turn/end 断言（**已登记门禁**） |
| **H-15** | ✅ **4 项子待办均已解决 · 场景 5 实测无多代** | ① devDeps 自包含 ✅（`typescript ^5.9.0` + `@types/node ^24.13.3` + `npm run typecheck`；**用 tsc 方案，不需要 tsdown**）· ② src 单源生成 lib ✅（`build:host = tsc`，lib 随仓 **209 件**）· ③ 引擎基线 ✅（`skill/scripts/test.mjs` **41 PASS / 0 FAIL**）· ④ 方案 E watcher 单测 ✅（`test-idle-arm-wiring.mjs`，已登记）；**场景 5**：loader 中 `dsh-shoucang-memory` **单条 entry**、本会话热重载 **4+ 次**均「重建 1 fiber」、注入器 `reload 450✓/0✗` ⇒ **未见多代并存** |

**⇒ 16 项净结果**：**2 项真缺陷，均已修并补了护具** ——
**H-1**（深睡 `outcomes` 通道自上线起死掉 ⇒ 接材料 + `check-injection-reach` ⑤⑥）·
**H-5/H-16**（通道**早已存在**，但**标题与控件被两段隔开** ⇒ 被误登记为"无通道"；已修 + 新增该页签永久出图）·
**11 项早已解决或前提消失**（H-2/4/6/7/8/9/11/12/13/14/15）· **1 项已决 no-go**（H-3）
· **剩余 1 项**：**H-10**（**等 2–3 天**，无代码动作）。**⇒ 全仓无"可施工而未施工"的项。**

> ⚠⚠ **两次踩同一个坑，教训要写足**：本轮核实 16 项，**11 项早已做完**——且我在中途还**据旧登记给出过错误结论**
> （把 H-5/H-16 说成"真实缺口需决策"），直到**出图看真机**才发现通道早已存在。
> 根因：`§5` 的登记**来自"扫描片段"而非逐行核对**（原文自己也标了"待核实"）。
> ⇒ **纪律：待办表的每一条，登记时就要写清"判据"与"证据从哪来"；核实一律以真机/实测为准，不采信旧记录。**
> ⇒ 否则待办表会**自我繁殖**：已完成的条目长期挂在表上，让"什么时候能做完"永远没有答案。

> ⚠ **本节的教训**：`§5` 当初按「扫描片段」登记、**未逐行核对**（原文自己标注了这一点）——
> 结果 16 项里 **10 项已经做掉了**却长期挂在表上，**让待办表看起来永远做不完**。
> ⇒ **登记时就要把"判据"写全**（怎样算做完），否则登记本身会变成噪音。


| # | 来源 | 事项 | 性质 / 处置 |
|---|---|---|---|
| H-1 | `anthropomorphic-plan-2026-09-14.md` §14.3 · §878 | **P5 E2E**（`outcomes`/`narratives` 两通道） | ⚠ **已从"不可判定"变为"可判定"**（2026-09-14 实测）：原文判"**不可由我触发，需会话停止活动**"——**该判断已被推翻**（`/deepsleep/trigger` 手动触发成功，`result: done`）。<br>**实测**：`write.consolidate` **9 条，channel 全部 `principles`**、target 全部 `AGENT.md`；`ring-commit`（15:47，source=distill）为 `decisions:4 · commitments:1 · relations:1 · valences:1 · **outcomes:0** · episodes:0`。<br>⇒ **不是"没跑到"，是"无 outcomes 素材 / 该通道未被触发"**。**下一步可查**：`outcomes` 通道的触发条件（读 `ring-commit` 的 outcomes 分支判据） |
| H-2 | 同上 §853 | **Q3**：`layerCounts.E.profile` 口径待补 | 原文注"未做 —— **不影响已施工阶段**" |
| H-3 | `context-supply-plan.md` §19.4 · §2077 | M4/M5 `storeMode=record`；`record` 档**尚未实现** | ✅ **已决：no-go（明确不做）** —— 待"真实写入样本"且确需单事实源 |
| H-4 | `chain-audit-fix-plan.md:141` | `injectRelevance` / `injectFreshSlots` 两旧注入键未进 zod / `/config` | 待做（原注"属 P1 收尾"） |
| H-5 | `settings-audit.md` §一 · §四 B-1 | 蒸馏节流键（`enableDistill`/`idleWakeMs`/`minTurnChars`/`distillPrescan`/`llmProvider`/`llmModel`）**无持久 UI 通道** | **真实缺口**（原文建议立待办） |
| H-6 | `settings-audit.md:120` | `distill.ts:89/:980` 两处「接线待办」注释**漂移**（接线早已完成） | 清理注释（原文估 5 分钟） |
| H-7 | `memory-ab-baseline.md:61` | 与 `memory-reconcile` **合并为周报**；`--exclude-self` 空 sid 标签修正 | 待做 |
| H-8 | `library-supply-chain-rework-2026-09-14.md:297` | `ringOfKind` 对 `valence` 归属、`dueRank` 到期语义**未逐行核对** | ⚠ **待核实**（注：S4-4 已引入 `dueSoon` 并改组序 ⇒ 此条**可能已解决**） |
| H-9 | `four-chains-adjustment-order-2026-09-14.md:140` | "新增两项待办（记入上份方案 §7 同级）" | ⚠ **待核实**（需读该处确认具体两项） |
| H-10 | `assistant-focus-plan.md:44` | S6 观测收尾：**自然跑 2-3 天** | 待时间 |
| H-11 | `ui-todo.md` · `settings-audit.md:13-15` | `ui-todo.md` 已标"均于 2026-09-08 落地"；建议标题归档化 | 文档整理（低优先） |
| H-12 | `skill/docs/borrow-memsearch-gitmemory.md:56` | **水位行补 `turnSeq` 防重播** | 原文估 **~1 行判断**（P1） |
| H-13 | 同上 `:57` | `journal.jsonl` **metadata-only** | P1 |
| H-14 | 同上 `:59` | **蒸馏期操作互斥** | P2 |
| H-15 | `skill/docs/dev-scenarios.md:22` | 「**构建验证闭环补全**」待办节 + `:15` 场景 5（**reload 多代 fiber 并存**）标 `⬜ 部分覆盖` —— 实测出现过 **4 次启动行并存**，待确认 inject 器的 dispose 语义 | 待办（技能侧验证闭环） |
| H-16 | `skill/docs/history/F-shoucang-suite-facts.md:33` | **`[UI 开发待办]`**（**用户明确要求记住**）：F-001「唤醒空闲时长」+ F-002「蒸馏子代理模型」两个配置项的**设置 UI** | ⚠ **与 H-5 是同一件事**（蒸馏节流键无 UI 通道）⇒ 两处合并看 |

**另**：`docs/context-supply-plan.md` 与 `docs/anthropomorphic-plan-2026-09-14.md` 内**多处**"待办/未完成"
字样经复核**属当时的阶段记录或已决事项**（如 P2b 回滚、放行判据待窗口样本），**不是现行待办**。

---

## 6. 登记纪律

1. 新待办**必须**加进本表，且四要素齐全：**差什么 / 复验命令 / 判据 / 何时可做**；
2. 已完成的项**不删**，标 ✅ 并注明落点（保留"当时为什么等"的信息）；
3. **禁止把"结论"记成"待办"**（如 L2 的"不拆"、L4 的"撤销"）—— 那会让账永远不平；
4. 详版复验手册：`docs/specs/S4R-reverify.md`；遗留清单快照：`docs/specs/S4X-residual-record.md`。

---

## 7. 睡眠板块 + 判据分层（2026-09-15 立 · 依据 `docs/master-architecture-plan-2026-09-15.md`）

> 上游：总纲 + 四份分册（睡眠方案/验收 · 判据分层方案/验收）。**已完成项标 ✅ 并留落点；未完成项四要素齐全。**

| # | 项 | 差什么 | 复验命令 | 判据 | 何时可做 |
|---|---|---|---|---|---|
| **S-P0** | ✅ **口径复验 + R1 预注册** | — | `node scripts/count-memory-lines.mjs` · 见 `docs/p0-report-and-preregistration-2026-09-15.md` | 报告已落盘且含三项实测结论 | 已完成 2026-09-15 |
| **S-J0** | ✅ **judgeKind + thresholds 登记** | — | `node scripts/check-judge-kind.mjs` · `node scripts/check-threshold-registry.mjs` | 两条均 PASS（24/24 · 13 项） | 已完成 2026-09-15 |
| **S-J1** | ✅ **阈值登记制与裁决机制机检** | — | `node scripts/check-runner.mjs` | `110 pass · 0 xfail · 0 skip` | 已完成 2026-09-15 |
| **S-J2** | 🟡 **阈值逐个预注册 + 真实数据校准**（**4/13 已预注册**） | **9 项仍 `samples=0`**：`trigger.idleMs` · `ingest.dedup.bigram` · `tree.indexSemanticSim` · `tree.sectionMergeSim` · `write.semanticDupSim` · `write.cardSimilar` · `activity.interferenceBand` · **`mcl.topicEchoGate`**（2026-09-20 由 `mcl.fastGate` 改名，见 §0g）· `ingest.granularity.splitLaw` | `node scripts/check-threshold-registry.mjs` · `node scripts/activity-calibrate.mjs`（活性族，已建） | 每项须有 预注册判据 + 真实样本分布 + 结论 + 回滚；**样本不足须写 `insufficient-data`（不猜方向）** | ✅ 活性族已校准（见下）；余 9 项可做（嵌入类需本地 bge）<br>✅ **2026-09-20 round 8：9 项「能否被改到」已全部核实并接线**（读口 `criteria.ts#thresholdValue`；门禁 `check-threshold-control`）—— 本项剩下的只是**校准**，不再是「改了没反应」 |
| **S-J2a** | ✅ **活性族校准（`activity.hotHits` / `statusDays` / `demote.coldDays`）** | — | `node scripts/activity-calibrate.mjs` | 实测 n=46：**hotHits 5→23**（原值低于 p50 无区分度）；**statusDays 与 coldDays 登记 `insufficient-data`**（真实天距 max 6.2 天 ≪ 14/44/90，分布未覆盖阈值区间）；**假冷率复测 1/9=11.1%**（历史 26/49=53%）⇒ 聚合已由 harvest 接线修正 | 已完成 2026-09-15 |
| **S-P1a** | ✅ **睡眠纪元身份（`sleepEpoch`）** | — | `node scripts/test-epoch-identity.mjs` · 真机 `POST /api/shoucang-panel/deepsleep/trigger` 后核审计 | 审计三处 `kind:'deep-sleep'` **全带** `sleepEpoch`+`epochSince`；`DeepSleepStatus.currentEpoch` 与审计**逐字一致**；判据双向变异实证（改名/删字段 ⇒ 0/3 红） | 已完成 2026-09-15（真机证据：`epoch-1789502907492` · 区间 ≈16.0h） |
| **S-P1b** | ✅ **R0 内容水位（第二触发维）** | — | `node scripts/test-epoch-watermark.mjs` | 决策表穷举：时间到⇒time · 内容达阈⇒content · 都未到⇒none；**回归保护**：关闭时与纯时间判据逐分支等价（51 例）；判定顺序（已消化先于双维）修正并证等价；变异实证（内容分支置不可达⇒2 FAIL） | 已完成 2026-09-15 |
| **S-P1b″** | 🟡 **口径已定案（2026-09-20 round 9）—— 正确轴 = 窗口内痕迹文件数；判定改动待拍板**（详见 §0h） | **三个候选全部有硬反证**：① `windowMaterialBytes`（字节量）与真实材料**非同源**（实测 `materialBytes=0` 而 `materialChars=46692`，差 4.6 万字符）；② `materialChars`（装配总长）有**地板效应** —— 44 纪元 min **15891** / p50 **37228**（min 已达中位 **43%**）⇒ 量的是全量画像/清单的**固定开销**，非「新增材料量」；③ 「上一纪元 `materialChars` 作前瞻代理」同因 ② 不成立（与「该不该睡」无单调关系）。⇒ 定案用 **`countWindowTraces`（窗口内痕迹文件数）**：**同源**（与"新增材料"同一遍枚举）、**零额外 IO**（复用 `enumerateWindowTraces`）、**已可测量**（审计 `traceFiles`）。⚠ **改判定为文件数属行为变更**（49 纪元中 46 个 `materialBytes=0`、其中 25 个仍入睡 ⇒ 砍掉 51% 入睡纪元的输入面）⇒ R3 须用户拍板，本轮**只使其可判定** | **判定改动待拍板**；若不改，则本项收口为「口径已定案 + 现判定即『材料下限』」 |
| **S-P1b′** | ⏳ **内容水位阈值校准** | 纪元 **3/10**（`epoch-calibrate` 实测）；**且须先解决 S-P1b″ 的口径问题** | `node scripts/epoch-calibrate.mjs` | 纪元 ≥10 ⇒ 按**正确口径**取分位；不足 ⇒ 写 `insufficient-data` | 纪元满 10 个 **且** 口径定案后 |
| **S-P1b-审计前置** | ✅ **材料量进审计（已完成，真机证实）** | — | 真机触发后核 `audit.deep-sleep` 行 | 审计行带 `materialBytes` + `materialChars`（实测：`materialBytes=0` · `materialChars=46692`）—— **正是这对读数把 S-P1b″ 证伪的** | 已完成 2026-09-16 |
| **S-P1c** | ✅ **材料分片已全链落地（2026-09-20 round 9 复核：本条长期未更新）** | 本条原写「计划层已接线，**多轮执行待接线**」—— **该描述已过期**：多轮执行由 **`S-P1c-multi`（2026-09-16，见下表）落地并过真机取证**（同一纪元 2 行审计 `chunk=0/2` / `chunk=1/2`，片序递增 + 全片落地）。本轮复验 `test-epoch-chunk` **27 PASS / 0 FAIL**，含 ⑥ 三断言：状态机按 `pendingChunk` 循环 / 多片标 `wired:true` / 审计带 `chunk`+`totalChunks` | `node scripts/test-epoch-chunk.mjs` | ① 每片 ≤ cap ② 永不切开单段 ③ 保持段序 ④ `cap<=0` 与改造前逐字等价 ⑤ 接线层四点（消费点/切分器调用/多片留痕/**无截断**）⑥ 多轮循环三点 —— **全过** | ✅ **已完成**（计划层 2026-09-15 · 多轮 2026-09-16 · 2026-09-20 复核确认） |
| **S-P1c′** | ✅ **分片上限已校准（2026-09-20）** | — | `node scripts/epoch-calibrate.mjs --json`（**跨档读**，G13 修复后可用） | **门槛早已达标**（46 个不同纪元，此前因单档读一直报 0）⇒ 实测 **44 个纪元**（按纪元汇总，同纪元多片求和）：min **35459** · p50 **42737** · p75 **46052** · **p90 52232** · max 108271。按**预注册判据**（最大片数 ≤3）扫候选：p50/p75/p90 **均满足**，按「取最大 cap（片数最少）」取 **p90 = 52232** ⇒ `materialChunkChars = 52232`（登记 `value` 已同步） | ✅ **已完成 2026-09-20**（samples=44 · preregistered=true · 复检触发：纪元再增 ≥20 或 p90 变动 >15%） |
| **S-P1d** | ✅ **面板可观测（渲染项已由 DOM 几何判据证实）** | — | `node scripts/ui-geo-regress.mjs --shots <目录>`（**必须带 `--shots`**，否则整个出图段被跳过） | **已通过**：`✅ S-P1d 纪元行已渲染（DOM 几何 h=19px · 相对内容区 top=157px · 视口内=true · text=当前纪元 epoch-1789504353992 · 窗口 …）`；套件 **101 PASS / 0 FAIL** | 已完成 2026-09-15 |
| **S-P1d-判据缺陷** | ⚠ **已定案：像素截图不足以作渲染判据（用户指正 · 结论被它反转）** | 本轮先判"未渲染"（图里看不见、`shot-sleep.png` 的 sha256/mtime 从未变化）；加 **DOM 几何**断言后**立刻翻案**：行一直在 DOM 里、高 19px、**在视口内**。⇒ **纯像素判断对"折叠线以下/导轨内容"系统性失明**（用户提示：面板有滑动导轨） | `ui-geo-regress.mjs` 的 S-P1d 断言（**永久**） | 渲染类 AC 一律「**图证 + DOM 几何**」双判据；仅看像素不得判"没渲染" | 已记（判据已固化） |
| **S-P1d-遗留怪现象** | ✅ **已定案并修复（"渲染级证据"整环曾全程失效）** | **根因链**：① Chrome `--screenshot=<相对路径>` **静默不写文件**（实测：相对路径两种写法都不生成，改绝对路径立刻写出）；② `shoot()` 把 CLI 的相对 `dir` 直接交给 Chrome ⇒ **每张图从未写出**；③ 旧实现用 `existsSync(out)` 判"成功" ⇒ **旧图冒充新图**、汇总永远 `12/12 张有效`；④ 于是连看两轮 **9/15 23:21 那批旧图**并据此误判"纪元行未渲染"（当时夹具确无该字段，故旧图本身没错，错在**把旧图当新图**）。**修法**：`shoot()` 内 `out = resolve(out)` + 拍前先删 + 成功=本次写出且 >2KB。**实证**：修复后 `12/12` 且 mtime 全部刷新 `9/16 4:56:4x`（逐秒递增=同一次运行），`shot-sleep.png` 94,273 → **96,281 B**（内容真变） | `node scripts/ui-geo-regress.mjs --shots <dir>` → 必须 `12/12` 且 mtime 全为本次 | ① 空目录出图 100% 成功；② 图与 DOM 对同一改动结论一致；③ 计数不把旧文件算作本次有效 | **已完成 2026-09-15/16** |
| **纪律（本轮立）** | ⚠ **"文件存在"不得作为"本次动作成功"的判据** | 二者在**有历史残留**时不可分 —— 本轮因此让一条**验收通道整体失效而不自知**（门禁全绿、图全是旧的）；同源教训已出现在 `inject-baseline-diff`（基线须带指纹/哈希，不能只看文件在不在） | 凡"产出型"步骤：**先删目标 → 执行 → 按本次产物判**；或记录**本次写入集合/哈希** | 同类步骤一律二者取一 | 已立 |
| **S-P1d** | ✅ **面板可观测（图证 + DOM 几何 双判据一致）** | — | `node scripts/ui-geo-regress.mjs --shots <目录>`（**必须带 `--shots`**） | **图证**：截图可见「当前纪元 epoch-1789504353992 · 窗口 2026/9/15 04:56:53 → 2026/9/15 04:56:53」；**DOM 几何**：`h=19px · 相对内容区 top=157px · 视口内=true`（两者吻合） | 已完成 2026-09-16 |
| **S-P1d-note** | ⚠ **本轮自伤两条（已记）** | ① `ui-geo-regress.mjs` 内用 `/* */` 块注释 + 行内反引号 ⇒ **Node 报 `Unexpected identifier`**（改 `//` 行注释即过，`node --check` exit 0）；② PowerShell `Get-Content -Raw` + **中文正则**探针 ⇒ 全文件**误报 0 命中**，差点据此推翻"产物含字段"，**ASCII 探针**才看到真相（**第一轮已记过的"勿中文 grep"坑，又踩一次**） | `node --check scripts/ui-geo-regress.mjs` · ASCII 探针 | 注释一律 `//`；探针一律 ASCII | 已记 |
| **S-P1c-multi** | ✅ **分片多轮执行（二次实现）· 代码+判据+门禁+真机证据四全** | — | `node scripts/test-epoch-chunk.mjs`（27 用例）· `node scripts/test-wiring-gate.mjs` / `-ast`（漏网 0）· 真机触发 | **真机证据**：同一纪元 **2 行**审计 —— `chunk=0/2 chars=29046` · `chunk=1/2 chars=15891`（cap=30000 ⇒ 切片正确）· 两片均 `stop=completed landed=true`；ledger `{chunk:0,chunks:2,wired:true,hasMore:true}` / `{chunk:1,…,hasMore:false}` ⇒ **片序递增 + 全片落地** | ✅ 已完成 2026-09-16 |
| **S-P1c-multi-配置通道** | ✅ **已定位并修复（真缺陷）** | 自持通道**合并正常**（判别实测：写 `deepSleepIdleMs=1234567` → 路由读到 `idleMs=1234567`）；真因是 **schema 有、显式映射没有**：`scheduler.ts` 的 `Config` 接口与**返回值映射**两处都缺 `deepSleepContentMinChars`/`deepSleepMaterialChunkChars` ⇒ 白名单不报警（schema 认得），但下游 `config` **永远 undefined** ⇒ "接线了却开不了"（实测置 cap=30000 后仍 `chunk=0/1`）。已补两处（接口 + 映射 `:641-645`） | `node -e` 读 scheduler.json + 路由探针 + 真机触发 | **schema 有 ≠ 运行时 config 有** —— 本件是"显式映射"形态，新增键**必须两处都加** | ✅ 已完成 2026-09-16 |
| **纪律（本轮立）** | ⚠ **新增配置键必须"三处齐全"** | ① zod schema（决定白名单是否接受，且**不报警**时会误导）② `Config` 接口（类型）③ **返回值映射**（决定下游能否读到）。本仓自持通道**会静默忽略未列入白名单的键**（只留一行 warn）⇒ **不读日志就会把"配置没生效"误读成"功能没实现"** | 写配置后先核"是否被接受"再下结论 | 三步缺一即"假接线" | 已立 |
| **S-P1c-multi-实现** | ✅ **续跑信号走 `state.epoch.pendingChunk`（不走返回值）** | — | `node scripts/test-epoch-chunk.mjs`（**27 用例**）· `node scripts/test-wiring-gate.mjs` · `-ast` | ① 终判**整行**直接返回决策表裁定；② run 侧读/写 `pendingChunk`；③ 状态机按 `pendingChunk` 循环；④ 本片 failed ⇒ 停 + 回滚；⑤ 审计带 `chunk`/`totalChunks`；⑥ ledger `wired:true`。**两处变异型门禁仍翻红（漏网 0）** ⇒ 未引入"判据被绕过" | ✅ 已完成 2026-09-16 |
| **S-P1c-multi-门禁** | ✅ **已澄清：不是门禁坏了，是我的断言写窄了** | 上一轮报「`test-wiring-gate(-ast)` 漏网 2 且 `runner` 红」——**两个红其实同源、且都是我的**：① 门禁的 `漏网 2` 真因确系**我的回退注释里含与判据同形的文本**，让"整行终判"断言从注释误匹配 ⇒ **改措辞后漏网归零**（直接跑 `test-wiring-gate` = **32 PASS / 0 FAIL · 漏网 0**）；② `runner` 红则来自**我自己的 `test-epoch-chunk` 单条断言**：正则写 `verdict\s*$` 而编译产物是 `return pv.verdict;`（**带分号**）⇒ 误报红。修 `;?` 后 **24/0**、`runner` **113 pass · 0 xfail · 0 skip** | `node scripts/check-runner.mjs` · `node scripts/test-wiring-gate.mjs` | 两条变异各自翻红 · 漏网 0 | ✅ 已完成 2026-09-16 |
| **纪律（本轮立）** | ⚠ **源码文本断言必须容"编译产物形态"** | 断言写 `verdict\s*$` 却忘分号 ⇒ **误报红**，并让我误以为"门禁坏了"、差点去改门禁。⇒ 凡对 `lib/*.js` 做文本断言的判据，须**显式容忍打包器/编译器会加的形态**（分号、引号风格、缩进）；**先在日志里看见它跑过并核对命中数** | — | 同类断言一律自查"编译后长什么样" | 已立 |
| **S-P1c-multi-配置通道** | ✅ **配置通道补齐** | `deepSleepMaterialChunkChars` **此前未进 zod schema** ⇒ 生产永远 `undefined` ⇒ 多轮不可达（"接线了但开不了"）。本轮补 zod 字段（保留） | `~/.dsh/suite/scheduler.json` 写入后触发 | 字段单一来源（`.default(Number(TRIGGER.materialChunkChars) || 0)`） | 已完成 2026-09-16（**保留**：回退只撤协议，不撤通道） |
| **S-P1** | ✅ **R0 睡眠纪元 + 双维水位 + 上限分片 + 面板可观测 —— 四子项全部完成（2026-09-20 round 9 复核：本汇总行长期未更新）** | 本条原写「**1/4 子项完成**：S-P1a ✅，b/c/d 待做」—— **该汇总已过期**：`S-P1a`（纪元身份）· `S-P1b`（内容水位决策表）· **`S-P1c`**（分片，含多轮执行由 `S-P1c-multi` 落地）· `S-P1d`（面板可观测，图证 + DOM 几何双判据）**四项均 ✅**。⚠ 唯一仍开口的是 **`S-P1b″`（内容水位的**度量口径**）**——那属 S-P1b 的**口径**后置项，本轮已定案（正确轴 = 痕迹文件数），**判定改动待用户拍板**（R3） | 见上四行各自命令 | 见各子项 | ✅ **已完成**（四子项齐；`S-P1b″` 单列，见该行） |
| **S-P2a** | ✅ **采集器扩展：工具使用聚合（零参数原文）** | — | `node skill/scripts/harvest-access.mjs --verbose` ×2 | 落 `audit/tool-usage.jsonl`，记录形如 `{t,sid,tool,n}`；**幂等实证**：复跑「工具使用聚合 0 组」；**复用同一遍转录遍历与同一水位**（不新建第二个遍历器，遵仓规则 5） | ✅ 已完成 2026-09-16（真产物 5 组 / 300 B） |
| **S-P2b** | ✅ **隐私红线门（双向）** | — | `node scripts/check-journal-privacy.mjs [--selftest]` | **三向判据**：① **字段白名单**（只允许 `t/sid/tool/n` —— 任何新键即红，防"以后顺手加 args"）② 值形态 ③ 全文探针（盘符/UNC/家目录/邮箱/项目根零命中）；**selftest 7/7** 证明三向都会红且干净样本不误报；已登记 `CHECKS`（门禁 **113→114**）。日志未生成时退 3 ⇒ 判 **skip** | ✅ 已完成 2026-09-16 |
| **S-P2c** | ✅ **材料第 12 段接线（工具维真抵 prompt）** | — | `node scripts/check-injection-reach.mjs`（**⑦⑧**）· `node scripts/check-runner.mjs` | **⑦ 抵达**：材料段 `toolUsage` **产出=true · 拼进 userInput=true**；**⑧ 通道锁**：prompt 声明了工具维处理策略（**先红实证**：加断言时 ⑧ 红 exit 1 → 补 prompt 策略后转绿）。prompt 策略三条：与既有「[路径]」对照（冲突⇒提纯候选）/ 高频工具判断是否沉淀 / **严禁据工具名臆造参数**。审计增 `toolCandidates`（输入量可见化） | ✅ 已完成 2026-09-16 |
| **S-P2c-观测流登记** | ✅ **新观测流已登记（`check-observability` 拦下后补）** | 门禁 `check-observability` 抓到 `tool-usage.jsonl` **未登记**（它要求"新增观测流须登记并说明为何不能并入单一事件源"）⇒ 已补 `STREAMS` 条目 + 三条理由（①主题不同：消费 vs 行为 ②隐私契约更严且需**结构级**保证 ③同源同水位，非第二遍遍历） | `node scripts/check-observability.mjs` | 库域事件流 3 · 未登记流 0 | ✅ 已完成 2026-09-16 |
| **S-P2d** | ✅ **已量化判据：`toolUsage` 段天然有界，预筛**不必要**（2026-09-20 round 9 实测定案）** | 本条原写「预筛未做 ⇒ 注入 N 条噪声 ⇒ 落库条数 ≤ 上限；关掉预筛同批条数显著上升（**防假旋钮**）」—— **前提须先实测**（否则就是给一个不膨胀的东西装闸门）。**实测（真库 982 行 / 78 个唯一工具 / 50 会话 / 6 天）**：材料段已**按工具跨会话聚合**（`deepsleep-materials.ts:250-253`，非流水），故 **段长只随「工具**种类**」增长，不随「调用**次数**」增长** —— 模拟四个窗口起点：`since=09-16` ⇒ 78 行 / **1721 字符**；`09-17` ⇒ 69 行 / 1506；`09-19` ⇒ 55 行 / 1119；`09-20` ⇒ 20 行 / 353。⇒ **上界 = 工具种类数（当前 78）**，而单批材料总量约 **4.7 万字符** ⇒ 该段占 **0.8%–3.7%**，**不具备"噪声膨胀"的机理**。**⇒ 处置：不建预筛**（建它是给不膨胀的段加闸门 = 增加一处**无判别力的旋钮**，正是本条自己警示的"假旋钮"）。**判据改为**：若日后**唯一工具种类数**显著增长（如 >200）或该段占材料比 >10%，再建预筛 —— 触发条件写死在此 | `node scripts/check-injection-reach.mjs`（⑦⑧ 已证抵达与通道锁） | ① 段长有界（随种类不随次数）✅ ② 段占材料比 <10%（现 0.8–3.7%）✅ ⇒ **预筛的收益前提不成立** | ✅ **已定案 2026-09-20**（不建预筛；触发条件=种类 >200 或占比 >10%） |
| **S-P2-顺带修** | ✅ **两处自伤已修** | ① 仓内 `harvest-access.mjs` **有重复件**（`scripts/` 旧 143 行 vs `skill/scripts/` 新 161 行）⇒ `check-deploy-sync` 判红；已同步（两份同源）。② 我的 selftest 样本里写了**盘符字面量** ⇒ 撞仓内**零硬编码路径红线** `check-hardcode`；改用**拼接构造**样本，源码面保持干净 | `node scripts/check-deploy-sync.mjs` · `node scripts/check-hardcode.mjs .` | 两件均绿 | ✅ 已完成 2026-09-16 |
| **S-P3a** | ✅ **R1 度量 · 第一个代理（互不重复方向数）** | — | `node scripts/effective-directions.mjs [--json\|--selftest]`（已登记 `CHECKS`） | 四向断言：**两实现互核** · 幂等 · 非零 · 字符账自洽；`--selftest` 4/4 双向可证。**真数据**：方向 **115** 条（MEMORY 81/USER 8/AGENT 26）· 索引面 **7795** 字符 · 预算 4000（占 **194.9%**） | ✅ 已完成 2026-09-16 |
| **S-P3a′** | ✅ **跨形态冗余：词面层 + 语义层 并列落地（R2 收益上限已量出）** | — | `node scripts/effective-directions.mjs` | **词面层**（bigram ≥ 注册表 0.66）：粗 121 行 / 细 38 行 ⇒ 已覆盖 **0** · 中间带 **0** · 独立 38 / 2907 字符。**语义层**（向量；阈值取登记表 `write.semanticDupSim=0.8`）：**已覆盖 1 条 / 71 字符** · **中间带 36 条 / 2769 字符** · 独立 1 条。**样例可读**：叙事行「深睡产线曾先推水位致窗口恒零痕迹…」⟨**0.809**⟩ 与某原则行判为同一知识两形态（即 P0 读码认定者）。⇒ **R2 空间：确定性 71 字符 / 上界 ≈2840 字符**；不可用即如实记「未判」（不假装） | ✅ 已完成 2026-09-16 |
| **S-P3a′-启示** | ⚠ **"共词少而语义近"是实测出来的，不是推测** | 词面判 0 / 语义判 1 + 中间带 36 ⇒ **跨形态压缩的判据必须上向量**；词面层只能给上界。这条与仓内 `[原则] 跨域联想看共词` 字面吻合 | 同上 | 后续任何"判断两条知识是否同一"的实现，**不得只用词面/正则** | 已记 |
| **S-P4a** | ✅ **R2-A 跨粒度收敛（通道已落地并接线）** | — | `node scripts/test-granularity-converge.mjs`（**12 用例 · 行为级**） | **四条硬门**：① **成对取证**（`coarse` 与 `fine` 都必须**逐字**存在于目标文件 —— 模型从材料抄、宿主只校验）② `fine` 必须**无标签** ③ `coarse` 必须**有标签**且 ≠ fine ④ **配额 ≤3/轮**。**归档可回滚**：被收敛行**整行原文**写入 `audit/converge/converge-<ts>.jsonl`（含"并入的粗行"），**绝不直删**。**幂等**：重复提交第二次 skipped。**射程**：仅 `AGENT.md` / `USER.md`（越界即拒）。已计入 **G-19 全通道汇总**（tried/done）⇒ "纯收敛轮全拒" 不会误判 done | ✅ 已完成 2026-09-16 |
| **S-P4a-为何另立通道** | ⚠ **不复用 forgetOps（语义与护栏都不同）** | `forgetOps` 有 R1 硬保护「**画像文件不得 archive**」（守"整节归档会连人格一起搬走"）；本通道动的是画像文件里的**无标签叙事行**（行级、非整节）⇒ 语义不同故另立，但**复用其纪律**（归档可回滚 / 限流 / 绝不直删） | 同上 | 两通道护栏**各自独立**、不得互相放宽 | 已记 |
| **S-P4b** | ✅ **prompt 通道声明 + 通道锁 ⑩（先红后绿已证）** | — | `node scripts/check-injection-reach.mjs`（**⑩**） | `DEEP_SLEEP_PROMPT` 增 `convergeOps` 段：**硬门逐条写进 prompt**（两条逐字抄 / fine 无标签 / coarse 有标签 / 不同行 / 每轮 ≤3）+ **宁缺毋滥**判据（"细的那条没有提供粗的那条之外的任何信息"才算，拿不准不提）+ 明示**判断错了会直接减少画像信息**。**⑩ 通道锁**同时要求 prompt 声明与宿主接线 —— **先红实证**：加断言时 `声明=false · 接线=true` ⇒ **exit 1**（精确刻画"接线 ≠ 可达"）→ 补 prompt 后双真 | ✅ 已完成 2026-09-16 |
| **S-P4c** | ✅ **判别完成（2026-09-20 round 9 收敛：本行与 S-P4c′ 是同一实验链的两步，结论已由 S-P4c″ 给出）** | **真机首发（2026-09-16）**：备份 → 重载 → 触发 `result=done`；`audit/converge/` **无归档** · 两画像文件 sha 未变 · `otherTried:0 · otherDone:0`。🔎 **先排除「判据在、通道无」**：`currentProfiles` 注入的是**两画像文件全文** ⇒ 无标签叙事行**确在材料里** ⇒ 硬门「逐字抄自材料」**可满足** ⇒ **不是通道不可达**。⇒ 由此进入下一步判别（S-P4c′ / S-P4c″）：**是"模型保守"还是"模型做不到"** | 见 S-P4c″ | 由 S-P4c″ 给出终判 | ✅ **判别完成 2026-09-16**（终判见 S-P4c″） |
| **S-P4c′** | ✅ **判别完成（2026-09-20 round 9 收敛：是"模型确实未提"，非形状缺陷）** | **实测**：`convergeCandidates: 8`（宿主预筛 36 对取前 8，阈值 0.6，**含 0.809 那对**）· `otherTried: 0` · 无归档 · 两文件 sha 未变。🔎 **判别「没提」vs「形状不符」**：新增 `outKeys` 探针（只记**顶层键名，不含内容**）实测 `["principles","profileOps","pointerOps","treeOps","forgetOps","crossTopic","outcomes","narratives","skipped"]` ⇒ **无 converge 相关键** ⇒ **模型确实未提**（排除解析/字段名缺陷）⇒ 由此进入 S-P4c″ 的放宽重试与路线改判 | 见 S-P4c″ | ① 首条真收敛落盘（归档含整行原文）；② **若判据放宽后仍 0 提案 ⇒ 判"让模型自己判同一性"在本模型上不可行**（**该预判已由 S-P4c″ 证实**） | ✅ **判别完成 2026-09-16**（终判见 S-P4c″） |
| **S-P4c″** | ✅ **判据放宽后仍 0 提案 ⇒ 预设判据触发，路线改判（已完成判别）** | 改判据为**方向性**（粗行已涵盖细行"教训面"即可；**元信息——源指针/日期/编号/经过——不计入额外信息**；拿不准时"细的读起来就是粗的一次具体经历"⇒判是）+ 阈值 **0.6→0.75**（候选 8→4）。**真机复验**：`candidates: 4` · **`tried:0`** · 无归档 · 库 sha 未变 ⇒ **放宽后模型仍不提** | `POST /deepsleep/trigger` | 预设判据「放宽后仍 0 ⇒ 让模型判同一性不可行」**成立** | ✅ 判别完成 2026-09-16 |
| **S-P4e-真机** | ✅ **收益问题已解决（2026-09-20 round 9 复核）—— 原判"收益恒为 0 是结构性的"已被 IR1 册五 E5 推翻** | **原状（2026-09-16 首测）**：基线 3690 字符 · 判定跳过 1/38 · **省 0 字符 / 0 行**；❌ ① skip 行不在基线里（0/1）。**根部原因当时已定案**：事后过滤发生在**预算花完之后**，被删行腾出的额度**没人用** ⇒ 收益恒 0 是结构性的。**现况（本轮实测）**：判定面粗 **111** / 细 **35**，跳过 **1/35**；① skip 行**不在注入面（0/1）** ✅ ② **额度被用上：画像行 6 条 ≥ 6** ✅ ③ 逐条可解释（⟨0.821⟩）✅ ④ 关闭即 Buffer 级逐字节回基线 ✅ ⑤ 库 sha 未变 ✅ ⇒ **四条判据全过**（**这正是 S-P4e′-落点 落地的直接结果**） | `node scripts/inject-dedup-probe.mjs` | 四条判据全过（见左）· 且该探针**已登记 `CHECKS`**（185 → 186） | ✅ **已解决 2026-09-18（E5）· 2026-09-20 复核确认** |
| **S-P4e′-落点** | ✅ **已解决（2026-09-20 round 9 复核 · IR1 册五 E5 于 2026-09-18 落地，本条长期未更新）** | **已修的实况**：`panel-shared.ts:522-526` 现**确在配额结算之前**消重 —— `const profKept = filterInjected(prof, dedupState().skip)` 位于 `byTag`/`untagged` 分组与 `picked` 补齐**之前**（注释原文即引 S-P4e′）。⚠ **本条登记的"受冻结棘轮阻挡"前提已消失**：当时 `panel-shared` 831 行顶格，**现实测 524 行**（远低于 600 冻结阈）⇒ 阻挡不复存在。**真机复验**（本轮 `inject-dedup-probe`）：判定面粗 111 / 细 35，跳过 **1/35**；① **skip 行不在注入面（0/1）** ✅ ② **额度被用上：画像行 6 条 ≥ 6**（旧状事后过滤 ⇒ 槽位空置、省 0 行）✅ ③ 每条 skip 带 `by` 与 `sim`（可解释，样例 ⟨0.821⟩）✅ ④ **关闭即逐字节回基线**（Buffer 级相等）✅ ⑤ 库文件 sha 未变 ✅ ⇒ **四条判据全过** | `node scripts/inject-dedup-probe.mjs` | 见左（全过） | ✅ **已完成**（2026-09-18 落地 · 2026-09-20 复核确认） |
| **S-P5a** | ✅ **自足性判定（确定性预筛）· P5 第一刀** | — | `node scripts/effective-directions.mjs`（已入 `CHECKS`） | **判据（显式常量）**：行 = `[标签] 主题 · 说明 → notes/… §…`；`说明` 段 **< 12 字符**或**无动作/因果词** ⇒ **未自足**。**实测（分报）**：MEMORY 81→未自足 **35**（索引行本就该薄）· USER 8→**7**（事实型行不该含做法）· **AGENT 26→未自足仅 4** ⇒ **认知层已基本自足（22/26 = 85%）**。新增断言 ⑧分类完备 ⑨分报与合计一致 ⑩阈值显式常量 | ✅ 已完成 2026-09-16 |
| **S-P5a-口径** | ⚠ **口径必须按文件 + 按标签分类**（首版混算被样例当场证伪） | 首版把三文件混算 ⇒ 报"未自足 46/115（40%）"，样例却全是 `MEMORY.md` **知识索引行** —— 那些**按设计就该薄**（索引行 = 指针，不是判据行）⇒ 混算把"索引行本就薄"**误读成**"40% 条目不自足"。改分报后真读数 = **AGENT 4/26**。⚠ 下一层细化：USER 的 7 条多为**事实型**（身份/环境/硬件），**事实行本就不该含做法** ⇒ 还须**按标签**（`[原则]/[路径]` vs 事实型）再分 | 同上 | 未自足数必须**按"该不该自足"的类别**报，不得跨类别合计 | 已记（下一轮细化按标签） |
| **S-P5b′** | ✅ **分类主轴修正为「文件职责」+ 释放候选收敛到真读数** | 🔴 **S-P5b 的主轴错了**（实测 8 条未识别标签时发现）：按**标签**分类把 `MEMORY.md` 里标签为 `[lesson]/[env]/[环境]` 的**知识索引行**误算进"判据载体" ⇒ 虚高到 **74 条**、释放候选虚高到 **54**。**职责由文件决定、不由标签决定**：`MEMORY.md`=知识索引（行是指针）· `USER.md`=画像/事实型 · `AGENT.md`=**判据载体**。**修正后真读数**：判据载体 **26 条**（内部：原则×18 · 路径×6 · 经验×1 · 演化×1）⇒ **未自足 4** · 未识别 **0** ⇒ 🎯 **释放候选 = 22 / 26**（85% 字面自足）。与 S-P5a 的分文件读数**一致**（那版反而更接近真相）。新增断言 ⑬**主轴 == 文件职责**（防主轴再漂移回"按标签"） | `node scripts/effective-directions.mjs` | ⑪分类完备 ⑫候选只来自判据载体类 ⑬主轴锁死 | ✅ 已完成 2026-09-16 |
| **S-P5b′-词表** | ⚠ **动作词表实测补过一次** | 首版漏「用/带/免」⇒ 把 `[原则] 改文本用编辑工具，非ASCII .ps1带BOM余者免BOM` 这条**自足原则误判为未自足**（样例当场暴露）⇒ 补词后释放候选 **22 → 23** | 同上（看"未自足样例"是否真是 stub） | 词表须覆盖常用动词；**每次扩词后复核候选数变化** | ✅ 已修 2026-09-16 |
| **J3/U1-归因层** | ✅ **三件纯函数 + 基线一致率实证（先红已钉）** | — | `node scripts/test-recall-attribution.mjs`（**18 用例**，入 `CHECKS` 118→119） | 扩 `recall-diagnosis.ts`：`buildAttributionRequest`（**必带对账依据**：注册表 id/值/结论）· `parseAttribution`（**严格**：枚举越界/非 JSON ⇒ null，不兜底）· `agreementRate`（**未判不计入分母**，rate=null≠0）。**实证**：计数法 `lower` vs 注册表细校准 `maintain` ⇒ **基线一致率 = 0**（与方案册一致；若计数法被改成一致，该断言会红 ⇒ 提醒复核） | ✅ 已完成 2026-09-16 |
| **J3/U1-调用点** | 🟡 **已接线并真机跑通（一致率仍不可测：样本不足）** | **真机**：`{"verdict":"insufficient","samples":6,"calib":"maintain","note":"未命中样本 6 < 30"}` ⇒ 调用点真实存在、**未判原因可见**；一致率**仍不可测**，但根因从"机制不通"变为**"未命中样本不足"**。⚠ 修掉门槛滑点（首版用全体 `mcl-step` 行数当门槛 ⇒ 行够多而真未命中样本仅 7 时**仍去调用**，白烧子代理）；改为卡 `samples.length` | `POST /deepsleep/trigger` → 核审计 `attribution*` 五字段 | ① 未命中样本 ≥30 时**真跑出 verdict**；② `agrees` 与细校准对账；③ 对账不通过 ⇒ **以细校准为准** | 🟡 调用点已完成；**一致率待样本积累** |
| **J5/U3-纯三件** | ✅ **请求构造 + 严格解析 + 语义换向判定（含差距实证）** | — | `node scripts/test-recall-yield-llm.mjs`（**22 用例**，入 `CHECKS` 119→120） | 扩 `recall-yield.ts`：`buildYieldRequest`（**必写「未被引用 ≠ 没帮上」+ 带后续动作**）· `parseYieldJudgements`（**整批原子**：数组/数值 i/helped∈{true,false,null}；任一不合法 ⇒ 整体 null）· `switchFromJudgements`（**保守**：只有明确 false 累积，true 与未判 null 都打断链）。**先红实证**：同两轮未引用 ⇒ 计数法「该换向」vs 语义「不该换向」**结论相反**。原计数法保留（确定性第一层） | ✅ 已完成 2026-09-16 |
| **J5/U3-信号源** | 🔴 **仍未解决，但本轮把两个信号分离开了（2026-09-20 round 9）** | **原三事实（2026-09-16）**：① `compliant=true` 0 ⇒ 合规率 0.0%（`zeroGain` 只能递增、**永不归零**，冲到 246）② `switchSource=true` 878/1061 = **82.8%** ⇒ 恒真噪声 ③ 两者 **`src/` 内无消费者** ⇒ **无行为后果**。<br>**本轮实测（跨档 · 全量）**：compliance **4977** 行 · **`topicEcho=true` 9 ⇒ 0.2%** · **`switchSource=true` 4699/4977 = 94.4%** · `zeroGain` max **271**。<br>**本轮关键区分（此前被混为一谈）**：`topicEcho` 与 `switchSource` **不是同一个信号** —— 修复输入源（`prevText` 取自事件流）后，**`topicEcho` 从 0 变 9/112 = 8.0%（修复后样本）** ✅，而 `switchSource` **仍 95/112 = 84.8% 恒真** ❌ ⇒ **① 只对 `topicEcho` 成立，对 `switchSource` 不成立**。<br>**③ 仍成立（读码实证）**：`src/mcl.ts:662/667/673` 三处**只把 `shouldSwitchSource(...)` 写进审计**，**没有任何分支据它改行为** ⇒ 依旧是"有仪表盘、无方向盘" | `node scripts/yield-signal-probe.mjs` | ① 信号源有**真阳性**（`topicEcho` 已 ✅；`switchSource` 仍需重定义或退役）② 判据非常真（`switchSource` ❌ 94.4%）③ 有消费者（❌ 仍无） | 🔴 **顺序不变：先修/退役 `switchSource`，再谈判定**（不在死信号上接 LLM 调用点）。⚠ **不得因 `topicEcho` 转绿就顺手接 `switchSource`** —— 两者量纲与语义都不同 |
| **J5/U3-修信号** | ✅ **信号源已修（取证落地，实测有判别力）** | — | `node skill/scripts/harvest-access.mjs` ×2（幂等）· `node scripts/check-journal-privacy.mjs` | 扩 `harvest-access.mjs`（**同遍历、同水位**）：时间键连接「台账注入时刻 × 转录工具调用」⇒ `audit/yield-rounds.jsonl`（`{sid,at,materialChars,sim,nextTools[],idleSteps}`）。**实测**：1061 条 · **注入后有动作 140 条（13.2%）**（vs 旧 `compliant` **0.0%**）。**幂等**：复跑字节不变。**隐私**：只落**工具名**，**禁 topics/q/arguments**（已**机检**钉死） | ✅ 已完成 2026-09-16 |
| **J5/U3-判定** | ✅ **调用点接线并真机跑通（含与计数法对账）** | — | `POST /deepsleep/trigger` → 核审计 `yield*` 五字段 | 模块级 `judgeYieldRounds`：读取证日志 → **确定性先筛（有动作者优先，取 10）** → 构造请求（**告知旧信号恒 false**）→ 子代理判 → 严格解析 → 语义换向判定 + **与计数法对账**。**真机**：`判 10（帮上 0 · 未判 0 · 有动作 10/10）` ⇒ `ySem=true` 与 `yCnt=true` **同结论** | ✅ 已完成 2026-09-16 |
| **J5/U3-工程坑** | ⚠ **三轮真机各暴露一个"我自己的工程错"（已全修）** | ① **取字段错**（猜 `res.text`，真实在 `result.output` 块）⇒ 假象是"模型没输出"；改 `agentTextOf()` **与 `parseAgentJson` 同口径** ② **取样本错**（取"最近 20 条"恰好全零动作 ⇒ 模型只能判 null）⇒ 改**有动作者优先**；且首版"先截断后排序" ⇒ **排序改变不了集合**（**筛必须在截断之前**）③ **超时**（样本丰富后 120s 判不完）⇒ 样本 20→10 · 超时 120s→180s | 同上 | 同族错误不再犯：**取子代理输出一律走 `agentTextOf`**；**筛前不截断** | ✅ 已修 2026-09-16 |
| **账实不符-1条** | ✅ **定案：非装配器缺陷，是判据口径不精确（已修）** | 取证链完整：① 泄漏行 = `- [原则] 记忆准入与审查同源 · …`；② 它在 **`AGENT.md` 里出现 2 次**（**行70 与 行77 逐字相同** ⇒ 同文件内**真重复**）；③ 候选池因此有**两份同名行**，主路径**丢一份留一份** ⇒ `text.includes(行文本)` 仍为真 ⇒ **判据按"行文本"匹配撞上合法重复**，不是装配器漏丢。**修法**：断言精确化为「**真泄漏 = 文本里还有该行 且 它在源文件里只有一份**」；并加**形态归一**（`droppedRows` 是**注入形态**带 `- ` 前缀，源文件**不带** ⇒ 直接整行匹配源文件得 **0 份**，我第一版就踩了这个、把合法重复误判成真泄漏） | `node scripts/test-usage-truth.mjs` | **PASS（账 == 真实裁切断言全过）**；取证打印常驻（**只在红时输出**） | ✅ 已完成 2026-09-16 |
| **库内真重复（口径已定）** | ✅ **定案：该被拦 · 但规模仅 1 处 ⇒ 不改落盘门，改为永久可见** | **规模实测**（度量器新增「**整行逐字重复**」轴）：**合计 1 组 / 1 行** —— `AGENT.md` **1 组/1 行** · `MEMORY.md` **0** · `USER.md` **0**。**口径定案**：逐字重复**无任何信息增益** ⇒ **属"该被拦"一类**；但**规模 1 处** ⇒ **不改落盘门**（改动面大、收益极小、且**注入预算门本来就会丢掉一份** —— 上轮账实核对已证"丢一份留一份"）。⇒ 取**"检测优先于预防"**：让度量器永久报出该口径，待规模上升再谈拦截。**新增断言 ⑭分文件与合计一致 ⑮冗余行数 == Σ(组内行数−1)** | `node scripts/effective-directions.mjs`（看「整行逐字重复」段） | ① 该轴**与"标签+主题"轴并列报**（两个不同语义，不得互推）；② 规模 > 阈值（如 ≥5 组）时**才**动落盘门 | ✅ 已完成 2026-09-16 |
| **口径并列（经验）** | ⚠ **两个"重复"口径不可互推** | 上轴（标签+主题）测**语义单位**、本轴（逐字整行）测**最简情形** —— 实测同一现象在两者下**结论相反**（"重复 0 组" vs "1 组逐字重复"），**均正确**。⇒ 凡"重复/冗余"类指标，**必须写明是哪把尺子** | `node scripts/effective-directions.mjs` | 报"重复"必附口径；跨口径结论不得互推 | 已记 2026-09-16 |
| **账实不符-处置原则** | ⚠ **不放宽、不掩盖（本轮的选择）** | 面对这条红，两条"省事"的路都**被拒**：① 改断言为"允许 N 条泄漏" = **放宽棘轮**；② 改判据让它变绿 = **假绿**。⇒ 选择：**如实登记 + 保留红灯 + 加取证打印**（诊断只在红时输出，不产生噪声），并把"修装配器"列为下一轮首要 | — | 门禁红**保持可见**，直到装配器真修好 | 已立 2026-09-16 |
| **J5/U3-修信号-坑** | ⚠ **重复件第 3 次踩到（已修）** | 改 `skill/scripts/harvest-access.mjs` 后 `check-deploy-sync` 报不一致 ⇒ 因仓内 `scripts/` 与 `skill/scripts/` 是**两份副本**，且**库内那份**也需部署才同步（先同步 `scripts/` 反使不一致由 1 变 2，再 `deploy-installed` 才归零）。**round 21/42 已各踩一次** ⇒ 立为口诀：**改库内脚本 = 改两份 + 部署** | `check-deploy-sync` → `deploy-installed` | 不一致 0 | ✅ 已修 2026-09-16 |
| **J4/U2** | ⏳ **数据不足，暂不可动** | 活性族 `statusDays`/`coldDays` 实测 `insufficient-data`（真实 gap 6.2 天 ≪ 14/44/90）⇒ 与 S-P1b′ 同类：**样本不够时不动**，写 `insufficient-data` 而非拍脑袋 | `node scripts/activity-calibrate.mjs` | 样本达标再校准 | 待样本 |
| **J3/U1-棘轮** | ✅ **为过函数跨度棘轮而抽模块函数** | 新增曾把 `runDeepSleep` 顶到 **431 行**（`audit-fnspan` 债务：>400 行函数个数，基线 **0** ⇒ 判红）⇒ 遵 **[原则] 装配超限先抽模块函数**抽到模块级，回落到 **397 行 / 债务 0 / fnspan-gate PASS** | `node scripts/audit-fnspan.mjs --gate` | 债务数 ≤ 基线（当前 0） | ✅ 已修 2026-09-16 |
| **J3/U1-踩坑** | ⚠ **两个我自己的错（已修）** | ① 读注册表路径写错（写 `c.mcl`，实为 **`surface.mcl`**）⇒ 结论判定退化成 `unknown`、断言当场红 —— 反而证明"基准必须真从注册表读"；② 我在源码注释里写了与断言**同形的标记文本** ⇒ 断言命中了注释自身而误报红（**同族坑第 N 次**；已在注释里写明"刻意不抄那两个字面标记"） | 同上 | 注释不得出现与判据同形的文本 | ✅ 已修 2026-09-16 |
| **S-P5c-计划侧** | ✅ **候选与计划已落地（含审计可见化）** | — | `node scripts/test-essence-release.mjs`（**12 用例**，入 `CHECKS` 117→118） | 新增 `src/essence-release.ts#planRelease`：**纯读扫描**（**零写入**，跑前后逐字节相同）· 判据**单一事实源**（阈值/词表/文件主键只在本件定义，度量器改为 import）· 射程只认 `AGENT.md`（索引/画像文件的行即便字面自足也不入候选）· 未自足 ⇒ `blocked` **永不入候选** · 幂等 · 缺件如实记"未判"。`runDeepSleep` 每轮调用并记审计 `releaseCandidates/releaseBlocked/releaseScanned` ⇒ **趋势可观测** | ✅ 已完成 2026-09-16 |
| **S-P5c-执行侧** | ✅ **通道 + 双门 + **语义门** 均已落地（2026-09-20 round 9 复核：本行「语义门未实现」已过期）** | 本条原写「**语义门未实现** ⇒ 真实释放默认不可能发生」—— **该描述已过期**：语义门由 **`S-P5c-语义门`（2026-09-16）落地并真机跑通**（字面 49 → 语义通过 19 / 否 1 / 未判 29），实现为 `semanticApprovedRows` + `executable` 门 + `intersectApprovals`（交集更保守）。**本轮复验**：`test-essence-release` **67 PASS / 0 FAIL**；读码确认 `essence-release.ts:135` 的空清单 fail-closed 分支、`deepsleep-run.ts:333` 的 `!relReview.executable ⇒ 零释放` 守卫均在位。<br>⚠ **唯一仍"关"的是自动执行开关**（`releaseAuto` 默认 `false`；`runDeepSleep` 刻意不把通过清单交 `applyRelease`）—— 那是**接线决策**（见 `S-P5c-执行`），**不是"语义门未实现"** | `node scripts/test-essence-release.mjs`（67 用例）· 审计 `releaseSemantic*` 五字段 | ① 只有**双判据**（字面+语义）过的条目被释放；② 释放**可回滚**（复用 `forgetops` 的归档+stub）；③ **未自足者零释放** ✅；④ 关闭即零释放 ✅；⑤ **语义门在（真机跑通）** ✅ | ✅ **已完成**（语义门 2026-09-16 · 2026-09-20 复核确认） |
| **S-P5c-语义门** | ✅ **落地并真机跑通（字面 49 → 语义通过 19）** | — | `node scripts/test-essence-release.mjs`（**40 用例**）· `POST /deepsleep/trigger` → 核审计 `releaseSemantic*` | 三件套 + 调用点（与 J3/J5 **并发发起**）。**真机**：`候选 49 ⇒ 语义通过 19 · 否 1 · 未判 29` ⇒ **字面判据 49 条"自足"，语义只通过 19（38.8%）** ⇒ **若只凭字面释放，误释放风险面 61%**（**实证**了语义门不可省）。口径：**以更严者为准**（`false` 与未判 `null` 一律不通过） | ✅ 已完成 2026-09-16 |
| **S-P5c-判据校准** | ✅ **校准成功（100% → 37.3%，判别力恢复）** | 改**最实质的一处**：判据由「能说出具体动作」（**门槛过低**）换成「**信息完备性**」三点检查表（做什么 / 按什么判取值 / 出错怎么办，且**关键取值必须行内可得，要翻正文 ⇒ false**）；并**撤掉少样本**（疑诱导照抄 true）。**三轮真机对照**：38.8%（1 否 + **29 未判**）→ **100%（过松）** → **37.3%（28 否 + 4 未判）**。⇒ 落在目标区间 **30–70%**，且**否/未判不为 0**；与第一版数值接近但**结构不同**（模型从"大量回避"变成"**敢判否**"） | `POST /deepsleep/trigger` → 核 `releaseSemantic*` | ① 通过率在 30–70% ✅；② 否/未判不同时为 0 ✅；③ `over-permissive` 警报未触发 ✅ | ✅ 已完成 2026-09-16 |
| **S-P5c-抽样核对** | ✅ **人眼核对 5/5 干净（判据产出的 `true` 可信）** | 加审计字段 `releaseApprovedSample`（通过清单前 5 条 · 每条截断 80 字；`ledger` 在私人区且有 `hit` 截断先例）。**逐条人格核对**：`[路径] 服务重启判生效 · ①比对新PID与启动时间 ②核新token ③停后查STOPPED再启` · `[路径] 文档锚点重锚 · ①判位移vs改写 ②needle取现码行反证 ③覆盖率至100%` · `[原则] 模式派生集合先核对 · 命中集执行前须显式列举` · `[原则] 夹具绿非真数据绿 · 判据类特性须接真数据` · `[原则] 档案事实须复验 · 引用前先实测` ⇒ **5 条扔掉正文都能照做** ⇒ **无一误判** | `POST /deepsleep/trigger` → 核 `releaseApprovedSample` | 抽样 `true` 行确为自足（当前 **5/5**） | ✅ 已完成 2026-09-16 |
| **S-P5c-判定波动** | 🔴 **已量化并分解：模型波动占加权 91% ⇒ 未收敛 ⇒ 不接线** | 校准器加 `--decompose`（**只读台账**，用**已有数据分离**"模型波动"与"候选变化"）。**6 轮历史 · 5 对相邻轮**：`-9.8pp(候选+0 ⇒ 模型100%)` · `+19.7pp(+2 ⇒ 86%)` · `+1.0pp(+1 ⇒ 0%)` · `-13.6pp(+1 ⇒ 93%)` · `+19.0pp(+1 ⇒ 94%)`。**占比：算术均值 75% · 按变化量加权 **91%**（Σ模型 57.3pp / Σ变化 63.1pp）** ⇒ **结论：波动主要来自模型判定**（**修正**我上轮"可能混入候选变化"的猜测 —— 候选只占 **9%**）| `node scripts/essence-review-stability.mjs --decompose` | ① 通过率极差 ≤10pp；② **降波动手段落在判据/提示上**（不是"等库稳定"） | 🔴 未收敛（手段见下） |
| **🔴 假绿撤回：波动实为未收敛** | 🔴 **仪器缺陷已修；真读数 26.1pp ⇒ 未收敛 ⇒ 不接线** | **发现的假绿**：校准器三轮报"极差 **0pp** ⇒ 收敛"，但**三轮读数完全相同**（56/30/20/6）⇒ 查台账：**deep-sleep 行总数仍 29，最后一行还是 round 58 那次**（`epoch-1789558676818`）⇒ **三轮触发的深睡根本没落新行**，仪器把**同一行旧值重复报了三遍**。⚠ 根因：脚本注释写了"取与触发前不同的最新行"，**实现却只取最后一行**（注释与实现不一致 —— 仓内同族坑）。**修**：① 触发后**必须等到 `sleepEpoch` 变化**才读数，超时未见新行 ⇒ 明说"未产生新审计行"且**不计入分布**；② 新增 **`--from-ledger N`** 只读模式（只用**真纪元**算分布，不发触发）。**真读数（6 真纪元）**：`37.3 / 27.5 / 47.2 / 48.1 / 34.5 / 53.6` ⇒ 通过率极差 **26.1pp** · 未判率极差 **39.2pp** ⇒ **未收敛** | `node scripts/essence-review-stability.mjs --from-ledger 6` | ① 触发式必须校验 epoch 变化；② 结论**优先用只读模式** | 🔴 未收敛（接线保持关闭） |
| **✅ 三项待决已自主拍板（60+轮 · 依据=文献+实测）** | ✅ **全部有据；不再向用户请示** | **① P5c 真实释放：保持关闭** —— 依据文献实测（《Rating Roulette》EMNLP 2025 Findings：LLM 判官**自不一致是通病**；**关采样(temperature=0)反而降低与人类一致性**；**增到 10 轮运行对自可靠性无显著改善**）+ 我的真机极差 **26.1pp** ⇒ **判定不可复现 ⇒ 释放行为不可复现**（释放虽可回滚但需人工捞回）⇒ **不接线**。<br>**② stall：不推翻既有护栏，改我的测量路径** —— 读码定案 `deepsleep-probe.ts:67` `rec.lastEventAt` **只在"确认长任务"分支刷新** ⇒ `idleMin` 实为"距上次确认长任务的分钟数"（故 32 条全是 **58–66 分钟**，基准陈旧，**口径误导**）；而 stall 判定用 `rounds/samples 无增长 + alive + !active` ⇒ 对"**父会话在等子代理**"（子代理有自己的转录）**可能误判** —— 与三轮触发无新行 + 409 吻合。⇒ 依据不足以推翻护栏，**测量一律改走 `--from-ledger`（已实现）**，并把"父/子转录归属"记为待定案。<br>**③ J3/J4：等预注册门槛，不动判据** —— `minSamples=30` 与 14/44/90 天均为**预注册判据**，为等而改即"造数据凑分母"（仓内明令）⇒ **等待**，不做任何调整 | `--from-ledger 6` · 文献：arxiv.org/abs/2510.27106 | 三项**均有据、已闭环**；后续只需样本/环境到位 | ✅ 已拍板 2026-09-16 |
| **探针 idleMin 口径（待修）** | ⚠ **`idleMin` 报的是"距上次确认长任务"而非"距上次输出"** | 证据：32 条 stall 的 `idleMin` 全为 **58–66 分钟**（含我刚触发、仅数分钟的新会话）⇒ 基准点陈旧。`deepsleep-probe.ts:67` 是**唯一**刷新 `lastEventAt` 的分支。⚠ 判定逻辑本身不依赖 idleMin（用 rounds/samples），但**审计读数会误导人**（我就被误导过一轮） | `node` 读台账 probe 行 | ① 口径改名或补"距上次输出"字段；② 定案"父会话等子代理"是否算 stall | 下一阶段 |
| **✅ 父/子转录归属：假设成立并已修（真机 stalled:0）** | ✅ **定案并修复；真机生效** | **定案**：探针只盯**本会话自己的转录**，而深睡父会话 **await 8 个子代理**期间**本就不写自己的转录** ⇒ 「连续 confirm 轮无增长」必然满足 ⇒ **stall 系统性**（32 条 stall 的 `idleMin` 全 58–66 分钟，含仅触发数分钟的新会话）。**修**：`hasLiveSubagent()`（判据与 `distill-parent.ts:44/#hasActiveSubagents` **live 枚举通道同源**，只取无状态子集）；要求**正向证据**（`origin==='subagent'` + **归属本会话** + `status!=='idle'`）；分支排在 `active` 冲突分支**之前**（正向进展证据更强）；并**顺手修正 `idleMin` 基准**（`lastEventAt` 原先只在"确认长任务"分支刷新 ⇒ 口径误导）。**判据**：`test-deepsleep-probe-children.mjs`（8 用例，**A 先红 + B/C/D/E 反向自证护栏未削弱**）⇒ 门禁 **120→121**。**真机**：`stalled:0 · suspect:0`（此前 32 条） | `node scripts/test-deepsleep-probe-children.mjs` · `--live` | ✅ 全绿 | ✅ 已完成 2026-09-16 |
| **深睡不落账 = 时序而非卡住** | ⏳ **审计行只在结束时写 ⇒ 只读台账天然滞后一轮** | **实测**：`/deepsleep` 报 `currentEpoch=epoch-1789564378413` 而台账末行仍是 `epoch-1789558676818` ⇒ **有纪元在跑且未落账**（`running:1`）⇒ 台账"没变"**不代表没跑**。⚠ 第 59 轮的假绿正来自这个盲区。**已加仪器**：`--live` 模式专门区分「没跑」与「跑了未落账」 | `node scripts/essence-review-stability.mjs --live` | 等该纪元跑完后用 `--from-ledger` 读**接地约束后**的波动 | 下一轮 |
| **🔧 纠正：不是卡住，是极慢（阶段间隔 23 分钟）** | 🟡 **推断修正 + 阶段痕迹已就位** | **我的上一轮推断只对了一半**：探针确实**误判**（父转录不增长 ≠ 卡住，已修 ✅），但**真因是运行时长**远超我假设的 10 分钟窗口。**实证**：`decision.consolidate 13:20:54 → check.sleep 13:20:55 → write.consolidate 13:20:55 → audit.consolidate **13:43:53**` ⇒ 阶段间隔 **23 分钟**，且仍在推进 ⇒ **非卡住，是极慢**。⇒ 触发 POST 60s 未返回亦与"有运行在飞"一致。**已加**：三段**阶段痕迹**（`step:'deep-sleep-stage'`，`stage ∈ {llm-done, pre-audit, audit-done}`）进台账 ⇒ 下一轮可直接定位慢在哪一段（13:20 那轮跑的是旧代码，0 条 stage 属预期） | `node` 读台账 `step==='deep-sleep-stage'` | ① 下一轮新策略：**等 ≥30 分钟**再读，别用 10 分钟窗口判"没跑"；② 用 stage 行定位**最慢的一段** | 下一轮 |
| **✅ emit 修复真机闭环（29→30 行）** | ✅ **已闭环 + 当代波动首测** | 阶段痕迹全走完并落行：`epoch-1789567727088` ⇒ **候选 71 · 通过 31 · 否 40 · 未判 0 · 引文接地失败 0**（`yieldJudged 10` · `stop completed` · `chunk 0/1`）。**当代 4 纪元**（修复+接地后世代）：`43.7 / 39.4 / 49.3 / 58.1%` ⇒ **极差 18.7pp**（跨世代曾 26.1pp）⇒ **改善但未达标（阈值 10pp）**；未判率 `0/16.9/0/14.9%` ⇒ 极差 16.9pp。**结构健康**：否类占比 31–40（**不再恒真/恒假**）、接地失败 **0** | `--from-ledger 4` | 见下条（接线判据） | ✅ 已闭环 2026-09-16 |
| **🔴 交集：实测「放大」波动（假设被证伪）** | 🔴 **不作为稳定性手段；但保留（更保守）** | **交集世代 3 纪元**：`39.2 / 30.4 / 10.1%` ⇒ 通过率极差 **29.1pp**（**单组世代仅 11.6pp**）；未判率 `0 / 25.3 / 12.7%` ⇒ 25.3pp。**机理**：交集 = 两组判定的「**与**」⇒ **任一组波动都直接传导** ⇒ 不确定性**叠加而非抵消**。**处置**：① **保留交集**（通过集必收缩 ⇒ 释放面小 ⇒ **风险低**）；② **绝不作为稳定性手段**（判据面已改写）；③ **接线维持关闭**（29.1pp 远未达标）；④ 解法回到**判据/提示层**降不确定性 | `--from-ledger 6 --since 1789573029201` | 见下条（新判据） | 🔴 假设已证伪 2026-09-16 |
| **🔴 P5c 接线判据（已定案：集合稳定度为准）** | 🔴 **不接线（Jaccard 0.088）** | **判据改为「释放集合稳定度」（Jaccard of 集合指纹）**，阈值 **0.8** —— 取代/并列原先的"通过率极差 ≤10pp"。**首测**：`|A|=28 · |B|=9 · 交=3` ⇒ **0.088** ⇒ **两轮释放集合几乎完全无关** ⇒ **不可复现、不可审计** ⇒ **绝不接线**。⚠ 为什么换判据：通过率极差是**代理指标**，被**未判率污染**（未判⇒缩小交集⇒通过率降），实测 `0→25.3%` 直接变成摆动（仓内 [原则] 代理指标非判据）。⚠ 集合指纹只记**短哈希**（不可逆、零额外暴露；候选全集本就在库内 `AGENT.md`） | `node scripts/essence-review-stability.mjs --jaccard` | **Jaccard ≥ 0.8**（且抽样干净）⇒ 才谈接线；当前 **0.088** 远未达标 | 🔴 定案 2026-09-16 |
| **注入节奏与四桶预算（实测）** | 🔵 **每轮重建（非新会话一次）；结构正确但 stable 桶 99.7% 满** | **读码**：`src/panel-inject.ts:384/386` 注释原文「systemPrompt 注入挂点（**每轮渲染**，指针缓存 30s）」+ provider 为**函数式** `text: (context) => { d.injectMeta.calls++ … }` ⇒ 引擎每次装配都调用。**硬证**：`/inject/stats` ⇒ **`calls = 535`**（进程启动至今）⇒ **确为每轮**。**装配结构（四桶 · 总预算 4300）**：`stable 3200`（三层判据+agent 画像+用户画像 ⇒ 本次用 **3189 = 99.7%**）· `dynamic 600`（知识索引热取）· `oneshot 200`（🧠 最近成长）· `situation 300`（【环·关系/承诺】）⇒ 本次 **4193/4300**，**丢 61 行**。<br>✅ **顺序正确**（稳定在前、易变在后）⇒ 对 **prompt 缓存**友好。<br>⚠ **但隐患在 stable 桶**：**3189/3200 = 99.7% 满** ⇒ **再加一行就挤掉尾部一行** ⇒ **stable 尾部逐轮可能变** ⇒ 缓存前缀**在此断裂** ⇒ 后面全重算。⚠ **未测**：本部署的**提供商是否真启用缓存**（缺该读数）⇒ 若没缓存，则 stable 3189 字符 × 步数是**纯重复开销**。 | `curl /api/shoucang-panel/inject/stats` | ① 给 stable 桶留 10–15% 余量（或压缩其内容）；② 测 stable 段**逐字稳定性**（跨步哈希比对）；③ 查提供商缓存读数 | 🔵 待拍板 |
| **索引注入节奏（用户提问）** | ✅ **已答**：**每轮（每步）注入一遍**，非"新会话一次" | 证据：调用计数 535 · 每步 `inject` 审计行 1.06/步（主会话 34 步连续无缺）· 代码注释自称"每轮渲染" | 同上 | — | ✅ 2026-09-16 | **用户主张**：「直接移除索引机制，所有记忆/画像每轮按会话任务判断注入」。**我量到的**：① **索引行本身大多自足** —— 字面自足率 **AGENT.md 88/103 = 85%** · **MEMORY.md 75/98 = 77%** ⇒ **丢掉正文仍可用**（其 `→ notes/` 指针**可去**，与用户"源层可丢弃"主张一致）；② **但"移除索引行"= 移除认知**（那些行就是提炼产物）⇒ 不可移除；③ **USER.md 是两形态混装**：**顶层 8 行**才是真索引（含 `·` + `→ notes/`），**小节区 28 行是"认知陈述"**（`- 主张… ← 源:`，占 2445 字符 = 83%）⇒ **这 28 条才是"该按任务注入而非常驻"的对象**；④ **全量算术**：AGENT+MEMORY 共 **201 行 ≈ 1.5 万字符** > 当前注入预算 **4000 字符** ⇒ **必然要选** ⇒ **用户的"按任务判断"方向成立**；⑤ ⚠ **但现状的真缺陷不是"索引机制"** —— 实测**真命中词 vs 乱码词注入 94% 相同**、`kept.dynamic` 8/9 只随预算浮动 ⇒ **"按任务选择"根本没做** | `$TEMP/diag-selfsuff.mjs` · `$TEMP/diag-inject2.mjs` | ① 去掉指针层（索引行改 `← 源:` 或裸行）；② notes 降级为可选历史；③ **新增按任务选择**（检索对象 = **索引行**，非原始正文 —— 因实测 sim 区分度不足 p50=0.521/p75=0.559、召回零命中 81.7%） | 🔵 待用户拍板 |
| **⚠ 口径教训（第 N 次同族）** | ⚠ **判据前必先核行形态** | 我一度报「USER.md 字面自足仅 **3%**（1/36）」⇒ 核实发现**假报**：USER.md 小节区 28 行形态是 `- 主张… ← 源:`（**无 `·` 分隔符**）⇒ 我的 `desc` 提取失败 ⇒ 全判"不自足"。**实测行形态**：含 `·` 仅 **8** 行 / 含 `→ notes/` **8** 行 / 含 `← 源:` **28** 行。⇒ 同族教训第 3 次（前两次：`- [` 找条目、按首个 `#` 切区）⇒ **纪律：写判据前先 dump 3 行样例核形态**。 | 见上 | 判据件若跨多形态文件，须**先分类再判** | 已自记 2026-09-16 | **用户观察**：「容量在增加，但没看到新增指针索引条目」⇒ **经实测成立**。**实测结构（2026-09-16）**：<br>· `AGENT.md` 8379（**279%**）：**顶层索引仅 5 条/476 字符**，而**小节区 111 行/7890 字符/带标签 91 条 + 成长行 13**<br>· `USER.md` 2967（99%）：顶层 8 条/496 字符；小节区 54 行/2445 字符（**带标签 0 + 成长行 28**）<br>· `MEMORY.md` 6976（140%）：**根本没有小节**，98 条索引行 = 6975 ⇒ **是"条目太多"**，非正文混入<br>**根因**：`src/distill-write.ts:119 writeProfileLine` 找不到 `## <sec>` 时 **`lines.push('', '## ' + sec, ln)`** —— 即**把新画像行写进/新建 `## 小节`**，而文件首行声明「路由四要素=标签·主题·概况·指针」（**顶层才是索引区**）⇒ **索引与内容混装**：用户看到的"索引条目"（顶层）几乎不涨，**全文却在涨**，容量门按**全文**计 ⇒ 读数与观感完全对不上。 | 诊断脚本见 `$TEMP/diag-cap5.mjs`（口径：顶层区 vs 小节区，含带标签/成长行/纯正文分类） | ① 决定"索引与内容是否同文件"；② 若同 ⇒ **容量上限须按内容量重设**（AGENT 实测需 ~8000）；③ 若不同 ⇒ 改 `writeProfileLine` 落点 + 迁移 | **待单独一轮** |
| **⚠ 我的三次口径错 + 一次误判（自记）** | ⚠ **同族反复** | ① 用 `^-\s*\[` 找"条目" ⇒ 库里顶层索引行**不带 `- `** ⇒ 得"0 条"（假）；② 按第一个 `#` 切顶层/小节 ⇒ H1 之后全算小节 ⇒ 又得"顶层 0 条"（假）；③ 假设"注入只取顶层就能省 87–99%" ⇒ 实测**AGENT.md 的 91 条原则全在小节区** ⇒ 该修法会**丢掉 91 条原则**（假设被否）；④ 我一度加 **">150% 拒写"** ⇒ 实测会造成**深睡写入全部失败**（AGENT 已 279%）⇒ **当天收回**（改为强告警不阻断）。⇒ 教训：**口径必先核格式**（先 dump 原文再写正则）；**"省空间"类改造须先数内容分布**。 | 见各条证据 | 同族不再犯：写正则前先 dump 原文样例 | 已自记 2026-09-16 | ① typecheck 零错 ② build host+client ③ `check-runner` **121 pass · 0 xfail · 0 skip** ④ `ui-geo-regress` **100 PASS / 0 FAIL** ⑤ `check-panel-contract` **5 PASS** + `gen-panel-contract --check` **产物新鲜（路由 42 条 · 3 份产物一致）** ⑥ deploy **0 差异** + **209/209 sha1 一致** + `check-installed-features` **exit 0**；另 `check-public-tree` PASS · `check-hardcode` PASS · CHANGELOG **422 条** · fnspan 债务 **0** | 上列各命令 | ✅ 本轮全绿 | ✅ 2026-09-16 |
| **常备工具（收官清单）** | ✅ 6 件，各有明确判据 | ① `essence-review-stability.mjs`（`--from-ledger N` / `--since` / `--jaccard` / `--live` / `--decompose`）② `yield-signal-probe.mjs`（收益信号健康度）③ `effective-directions.mjs`（R1 度量 · 两轴重复口径）④ `test-essence-release.mjs`（**67 用例**）⑤ `test-deepsleep-probe-children.mjs`（8 用例 · **双向自证**）⑥ `check-journal-privacy.mjs`（双日志三向 + selftest 7/7） | 见各件抬头 | 判据面：仪器/审计/测试**三处一致** | ✅ 2026-09-16 | ① `--jaccard` 仪器模式；② 审计字段 `releaseApprovedHashes`；③ 纯函数 `stableSetHashes`/`jaccardOfHashes`（**67 用例**含"两者皆空 ⇒ 1.0"这类边界）；④ 判据阈值 **0.8** 与"极差 ≤10pp"并列登记 | `--jaccard` · `test-essence-release.mjs` | 判据面三处一致（仪器/审计/测试） | ✅ 已完成 2026-09-16 | 现状用**通过率极差**作代理，但它受**未判率**污染（未判 ⇒ 缩小交集 ⇒ 通过率下降）⇒ **代理指标不是判据**（仓内同族教训）。**更本质**：直接测"**两轮释放集合有多像**"（Jaccard）。⚠ 需记**集合指纹**：只记每条的**短哈希**（排序后）⇒ **可算交集大小、零隐私暴露**（哈希不可逆），比记行文本安全 | 待建：`releaseApprovedHashes`（短哈希数组） | 集合 Jaccard ≥ 阈值（如 0.8）⇒ 接线 | 下一轮 | **真机**：`epoch-1789573029201` ⇒ **单组通过 50 / 54 · 交集 31** ⇒ **同一判据两次独立运行的判定重合度仅 ~60%**（**约 40% 条目判定不同**）—— 此前只能从"通过率 48%↔59% 跳"**间接**推断，现在**直接测得**。交集通过率 **31/79 = 39.2%**（单组 63%/68%）⇒ **唯方向安全的手段**（文献已证伪"调温度"与"取多数"；交集**单调更保守**）。测试 **51 → 58 用例**（空集/对称/幂等/trim/去重/单调性） | `--from-ledger 6 --since 1789573029201`（**交集世代**） | 交集世代极差 **≤10pp** ⇒ 接线自动释放（可回滚已具备、抽样 5/5 干净） | 🟡 待采集 3 个交集纪元 |
| **P5c 接线（此前判据，供对照）** | 🟡 单组世代极差 **11.6pp**（连续三轮同值） | 单组世代（`--since 1789567727088`）窗口 6 个：`59.2 / 48.1 / 58.4 / 59.7 / 49.4 / 49.4` ⇒ **11.6pp**，且呈**双峰**（≈48–49% vs ≈58–60%）而非均匀噪声。**不移动门槛**（放宽到 12pp = 事后挑窗口同族） | `--from-ledger 6 --since 1789567727088` | 同上 | 已被交集世代取代 | **预注册窗口 = 最近 6 个当代纪元**，同窗口两轮复读：**19.8pp → 11.6pp**（`58.1 / 56.6 / 59.2 / 48.1 / 58.4 / 59.7%`）；未判率极差 15.6pp。⚠ **我拒绝移动门槛**（把 10pp 放宽到 12pp = "事后挑窗口"同族）⇒ **维持 10pp、维持关闭**。⚠ **未判率不是安全问题而是效率问题**：未判 ⇒ 保守（不通过）⇒ **不会误释放，只会少释放**；但它与通过率**耦合**（未判⇒不通过⇒通过率下降）⇒ 不能只看通过率 | `node scripts/essence-review-stability.mjs --from-ledger 6 --since 1789567727088` | **同窗口**（最近 6 个当代纪元）极差 ≤10pp ⇒ 接线 | 🟡 维持关闭（趋势好） |
| **串行采集驱动（方法）** | ✅ **有效：POST 短超时 + 以台账新行为唯一进度信号** | 实测深睡端点 POST **会挂 >120s**（但深睡本身 ~2 分钟就跑完）⇒ 旧写法"等 POST 返回"必被挂住。**新写法**：POST 用 **15s 超时且忽略其结果**，然后**轮询台账是否出现新行**（最长 6 分钟），**见到新行才发下一次** ⇒ **不重叠**（旧写法曾把 `running` 推到 6）| 一次性驱动（可复用部分已在仓内：`--from-ledger` / `--since`） | 凡"要跑 N 轮"的采集，一律**以产物为准、不等接口返回** | 已定型 2026-09-16 | **当代（修复+接地后）6 个真纪元**：`43.7 / 39.4 / 49.3 / 58.1 / 56.6 / 59.2%` ⇒ **极差 19.8pp**（阈值 10pp）· 未判率极差 16.9pp ⇒ **不满足 ⇒ 维持关闭**。⚠ **我自警并拒绝了一次"选择性取样"**：末 4 个恰好 `49.3/58.1/56.6/59.2` ⇒ 极差 **9.9pp（刚好达标）**，但改用"末 4 个"窗口 = **事后挑窗口**（"造数据凑分母"的变体）⇒ **不采用**。 | `node scripts/essence-review-stability.mjs --from-ledger 8 --since 1789567727088` | **预注册窗口 = 最近 6 个当代纪元**（下次**同窗口**复读；**不许换窗口**）：极差 ≤10pp ⇒ 接线 | 🔴 维持关闭 |
| **仪器 `--since` 世代过滤** | ✅ **可用（语义自纠一次）** | 加 `--since <epoch尾号\|ISO时间>` —— 只用**该世代起**的纪元。⚠ **首版语义写错**：`endsWith` 只**精确匹配那一个**（症状：可用真纪元 1<2），而 since 应为"**从该处起（含之后）**" ⇒ 已修为"定位索引再 `slice(idx)`"。避免拿**跨世代极差**（26.1pp）当**当代结论**（18.7→19.8pp） | `--from-ledger 8 --since 1789567727088` | ✅ 仪器可用 | ✅ 已完成 2026-09-16 | 判据两条：**抽样干净 ✅（5/5）** **且 波动收敛 ❌（当代极差 18.7pp > 10pp）** ⇒ **不满足 ⇒ 维持关闭**。⚠ 补充依据（文献）：LLM 判官自不一致是通病，"调温度"与"多跑取多数"均被证伪 ⇒ **判定不可复现 ⇒ 释放行为不可复现**（释放可回滚但需人工捞回）⇒ 在波动收敛前接线不可接受 | `--from-ledger 4` · `test-essence-release` | 当代极差 ≤10pp（**趋势：26.1 → 18.7pp，在收窄**） | 🔴 维持关闭 | **阶段痕迹一轮定案**：`13:55:49 llm-done/apply-done/aux-start → 13:57:39 aux-done/converge-done/pre-audit/audit-done` ⇒ **整轮约 2 分钟、全阶段走完**，却**不落 `audit.deep-sleep` 行**。**真因**：第 57/58 轮抽取 `emitDeepSleepAudit` 时写成**只 `return` 对象、从不 `audit(...)`** —— 「名字叫 emit 却不 emit」，**typecheck 不报**。**修**：`audit(emitDeepSleepAudit(…))`。**判据**：`test-wiring-gate` 加 `audit\(emitDeepSleepAudit\(` 命中 1 —— **实测先红后绿**（临时去掉 `audit(` ⇒ 命中 0 判红；还原 ⇒ 33 PASS） | `node scripts/test-wiring-gate.mjs` | **下一轮**：真机触发一轮，**看 deep-sleep 行数 29 → 30** 即闭环 | 🟡 待真机取证 |
| **接地约束效果（仍待测）** | ⏳ **等修复后的新纪元落账** | 上面那条修好后，新纪元才会落账 ⇒ 才能首次测量"接地后波动"。仪器已就位（`--live` / `--from-ledger`） | `--live` → `--from-ledger` | 接地后纪元极差 ≤10pp ⇒ 满足则**自行拍板接线** | 下一轮 |
| **触发端点不稳（观察）** | ⚠ **POST 有时 60s/120s 未返回** | 本轮两次触发均未在 60s/120s 内返回（此前 1–2 分钟返回 `done`）⇒ 端点耗时波动大。⚠ 不影响深睡本身（13:55 那轮 2 分钟就跑完了）⇒ 触发**同步等待**了整轮，故耗时≈整轮时长 | — | 判"没跑"须以**台账/宿主状态**为准，勿以 POST 返回为准 | 已记 2026-09-16 | 判据与仪器已就位（`--live` 区分"没跑/跑了未落账"、`--from-ledger` 只读真纪元）；缺的是**跑完的新纪元** —— 而单轮可能需 **≥30 分钟** | `--live` → 等落账 → `--from-ledger` | 接地后纪元极差 ≤10pp | 下一轮（**按 ≥30 分钟窗口等**） | `quote` 接地约束在请求与判据两侧均已生效；`--live` 显示有纪元在跑 ⇒ **落账后即可首次测量"接地后波动"** | `--from-ledger 6` | 接地后纪元极差 ≤10pp | 下一轮 | 深睡一轮会 spawn **8 个并发子代理**（归因+收益+6 批语义复核）；父会话在等待期间**确实不写转录** ⇒ 探针按"父转录无增长"判 stall 可能**系统性误判**。⚠ 未定案：需对比"子代理转录是否在增长" | 待建：探针同时看子代理转录 | ① 定案假设真假；② 若真 ⇒ stall 判定须纳入子代理活动 | 下一阶段 | 实测连续 3 次触发**均未新增** `audit.deep-sleep` 行（`sleepEpoch` 不变）。可能：**无痕跳过**（窗口内无新材料 ⇒ 按设计不落账）、水位未推进、或 409 后实际未执行。⇒ 若属设计，则**触发式测量天然不可靠**，应一律走 `--from-ledger`；若属缺陷，则需修触发路径 | 核审计里是否有 `no-traces`/跳过类记录；对比 `deepSleepIdleMs` 与水位 | ① 查明是否设计；② 触发式与只读式**结论一致** | **最后一轮**（60） |
| **接地约束效果（未单独测到）** | ⏳ **需接地后的新纪元** | `quote` 接地约束（2026-09-16 round 56）已落地并在**请求/判据两侧**生效（真机请求含引文要求），但**尚无"接地后"的新纪元**可对比 ⇒ 其降波动效果**未经实证** | 待有新纪元后跑 `--from-ledger` | 接地后纪元极差 ≤10pp | 待新纪元 | 事故（PS 写源码 ⇒ mojibake）→ 从**产物**重建 → **整块移植 `runDeepSleep`** → 自动补类型 → TS 化 ⇒ **六条口径全绿**。**收尾两步抽取**：① `segs/cc/relPlan` 段（38 行）；② 主审计块（27 行，**自由变量由 tsc 反推**：报 `Cannot find name X` 即自动加进解构与调用实参 ⇒ 63 错 → 3 错 → 0 错）。**结果**：`runDeepSleep` **451 → 388 行**（比事故前 400 行更小）· fnspan 债务 0 · audit-wiring 违规 0。**真机验活**：深睡 `completed` · 分片 1/1 · 语义门 6 批并发（候选 56 · 通过 30 · 否 20 · 未判 6）⇒ **整块移植行为等价** | `node scripts/check-runner.mjs` | **120 pass · 0 xfail · 0 skip** | ✅ 已完成 2026-09-16 |
| **恢复法（可复用，已定型）** | ✅ **产物即快照 + tsc 反推自由变量** | ① 源码损坏 ⇒ 先查 `lib/` 同名产物（**tsc 保留注释** ⇒ 含中文的完整快照）；② 取回 HEAD 版 → 脚本搬回模块级函数/imports；③ **整块移植**函数体（比逐行补可靠）；④ import 按路径**取并集**；⑤ **自由变量交给 tsc 反推**（`Cannot find name` ⇒ 自动补解构/实参，迭代至零错）——比人工列 deps 可靠；⑥ **TS 化**（去行尾分号）否则形态门禁会红 | `~/.dsh/backup/deepsleep-run.pre-corruption.*.js` | ① 损坏先找产物；② 整块移植优于逐行补；③ 缺名靠 tsc 反推；④ **改文本只用 edit/write/Node** | 已定型 2026-09-16 | **事故**：为让 `ungrounded` 落地，我用 `Set-Content -Encoding UTF8` 改 `src/deepsleep-run.ts` ⇒ `Get-Content` 默认按 ANSI 读 ⇒ **mojibake（753 处 U+FFFD / 134 行）+ 多行被粘**。<br>**恢复（最终路线）**：① GBK 逆变换只救回部分（不可逆）；② 以 **`lib/deepsleep-run.js`（损坏前产物，含注释）**为准；③ `git checkout HEAD` → 脚本搬回模块级函数/imports → **整块移植产物的 `runDeepSleep` 函数体**（一次补齐全部本会话接线）→ import 名称**取并集** → 自动补类型（按 tsc 行列插 `: any`，2 轮至零错）→ **TS 化**（去行尾分号 203 处 ⇒ `test-wiring-gate` 由红转绿）。<br>**现态**：typecheck ✅ build ✅ 部署 ✅ **runner=1（仅 `audit-fnspan`）** | `node scripts/check-runner.mjs` | **下一轮**：抽 `runDeepSleep` 至 ≤400 行（现 451）——**已验证可行**：抽 `segs/cc/relPlan` 段（38 行）⇒ 414；再抽审计块 ⇒ ~389 | 🟡 恢复中 |
| **⚠ 二次自伤（务必记住）** | 🔴 **我第二次用 PowerShell 写文本 ⇒ 文件再损（230 错）** | 恢复过程中我用了 `Get-Content -Raw` + `[System.IO.File]::WriteAllText` 做批量替换 ⇒ **又一次 ANSI 读 + 写**，typecheck 由 0 错变 **230 错**；靠 `Copy-Item`（**字节级**）从备份恢复。⇒ **铁律：源码文本只许用 edit/write 工具或 Node 脚本改；PowerShell 只做只读与文件复制** | — | ① 改文本用 edit/write/Node；② `Copy-Item` 可安全备份/恢复（字节级）；③ 误改后优先从**备份**恢复而非"逆变换" | 已记 2026-09-16 | **事故**：为让 `ungrounded` 字段落地，我用 `Set-Content -Encoding UTF8` 改 `src/deepsleep-run.ts` ⇒ `Get-Content` 默认按 ANSI 读 ⇒ **整个文件 mojibake（753 处 U+FFFD / 134 行）+ 多行被粘**（GBK 双字节配对吞掉换行）。**这正是仓内 [原则]「文本改动先定编码 · 改文本用编辑工具」说的坑，我踩了**。<br>**恢复**：① GBK 逆变换只救回部分（不可逆）；② 改以 **`lib/deepsleep-run.js`（损坏前 19 秒的产物，含注释）**为准；③ `git checkout HEAD` 取回旧版 → 脚本**机械搬回** 4 个模块级函数 + imports + `agentTextOf` → 白名单插回 10 行接线。**现态**：typecheck ✅ build ✅ fnspan 债务 0 ✅ 但 **runner=1（4 项红）** | `node scripts/check-runner.mjs` | **下一轮**：① `test-essence-release`（测试夹具缺 `quote` —— 本轮模块改了接地约束，测试未同步）；② `test-epoch-chunk`（缺 `splitByCap` 接线 + `materialChunkChars` 消费）；③ `test-epoch-identity`（**某路径的 audit 行缺 `sleepEpoch`**）；④ `check-injection-reach`（`toolUsage` 与候选**未拼进 `userInput`**） | **下一轮首要**（补搬产物中剩余新增行） |
| **恢复方法（可复用）** | ✅ **"产物即快照"** + **token 指纹补齐法** | 事故证明：**`lib/`（随仓提交的编译产物）是未提交源码的可靠快照**（tsc 保留注释）⇒ 源码损坏时**以产物为准反向重建**。⚠ 白名单法（我用的）**易漏**：产物与 TS 的**逐字比对必失败**（JS 无类型注解、带分号）⇒ 下一轮须改用**标识符/字面量 token 序列**比对来判"是否新增行" | `~/.dsh/backup/deepsleep-run.pre-corruption.*.js`（已持久备份） | ① 源码损坏 ⇒ 先查 `lib/` 同名产物；② 比对用 token 指纹，不用逐字 | 已记 2026-09-16 |
| **S-P5c-降波动** | 🔴 **主因已定案：模型判定（加权 91%）⇒ 手段落在判据/提示上** | 既然主因是模型：① **要求 `why` 必须引用行内片段**（强制回到行文本 ⇒ 压缩自由度）；② **边界样本多次判定取多数**（只对 `null`/临界样本做 ⇒ 控成本）；③ 检查是否有可配的**采样温度** | 改后跑 `--rounds 3` **并** `--decompose` 对照 | ① 通过率极差 ≤10pp；② 且**不得把通过率推回饱和**（上轮教训：改判据可能整体偏移） | **下一轮** |
| **S-P5c-执行** | ⏳ **仍默认关闭（2026-09-20 round 9 合并：本行原有 4 条近乎重复的登记，现收敛为一条当前态）** | 未把通过清单交给 `applyRelease` ⇒ 真实释放不会发生。**接线条件（现行）**：**抽样干净 且 波动收敛**（判据为**集合稳定度** Jaccard ≥ 0.8 —— 由「通过率极差」改为集合口径，因前者受**未判率污染**，属代理指标）。**实测**：Jaccard **0.088** · 当代极差 18.7→19.8pp（在收窄但未达标）· 交集世代极差 29.1pp。⚠ **过宽风险已有硬门**：`approved ≥ 10 且 rate ≥ 0.95` ⇒ 审计警报 `over-permissive` 且**禁止据此接线**。⚠ 波动主因已定案为**模型判定**（加权 91%）⇒ 手段落在**判据/提示**上，不在「等库稳定」 | `node scripts/essence-review-stability.mjs --jaccard` · `--from-ledger N` | 两条件同时满足才接线（**抽样干净 ✅ 5/5** · **波动收敛 ❌**） | ⏳ 待波动收敛（**主因=模型判定，见 S-P5c-降波动**） |
| **409 语义（操作知识）** | ⚠ **深睡运行中触发 ⇒ HTTP 409 Conflict** | 一轮深睡要跑 **8 个并发子代理**（归因 + 收益 + 6 批语义复核），耗时数分钟；期间 `m.deepSleepRunning=true` ⇒ 端点拒绝并发触发。⇒ 任何"自动触发"的脚本**必须等空闲**（本校准器已内建 20s 轮询重试） | `node scripts/essence-review-stability.mjs` | 自动触发脚本一律带 409 等待；**409 ≠ 端点故障** | 已记 2026-09-16 |
| **S-P5c-执行·历史（供对照，勿当现行）** | ⏳ **关闭历程**（2026-09-20 round 9 并入：原为 3 条独立行，内容高度重复） | ① 起初「抽样干净 ✅ / 波动收敛 ❌（极差 19.1pp）」；② 一次**真机对照**：单批 49 条 ⇒ `通过 19 · 否 1 · 未判 29`（38.8%）→ **分批(≤10)+操作化问法+少样本** ⇒ `通过 51 · 否 0 · 未判 0`（**100%**）—— ⚠ **这正是我上一轮自己写下的反面判据**（「通过率不被抬高」）**被踩中**，故**如实记为过宽/假阳**，成因：操作化问法门槛过低 + 少样本诱导照抄 `true`；③ 该过宽已由 `S-P5c-反制判据` 的硬门兜住（`over-permissive` ⇒ 禁止接线）。**接线条件已收敛为集合口径 Jaccard ≥ 0.8**（见上行） | — | 历史留档 | — |
| **S-P5c-反制判据** | ✅ **已加硬门：通过率异常高 ⇒ 审计警报 `over-permissive`** | 把「**未判/否 全为 0**」从"好消息"改判为**可疑信号**：`approved ≥ 10 且 rate ≥ 0.95` ⇒ note 带 `⚠ over-permissive …**不得据此接线自动执行**` | `POST /deepsleep/trigger` → 核 `releaseSemanticNote` | 警报出现时**禁止**接线自动执行（**硬门**，不是提示） | ✅ 已完成 2026-09-16 |
| **S-P5c-执行·过宽防线（历史，已并入上行）** | ⏳ **关闭历程续**（2026-09-20 round 9 并入） | ④ 「未把通过清单交给 `applyRelease` ⇒ 真实释放不会发生；在通过率回落到非饱和区间**之前不得**接线（否则会把 51 个 notes 小节**全归档**）」。⇒ **该防线现已由硬门覆写**：`over-permissive` 警报（`approved ≥ 10 且 rate ≥ 0.95`）是**硬门而非提示**（见 `S-P5c-反制判据`），接线另需 Jaccard ≥ 0.8 | — | 历史留档 | — |
| **S-P5c-边界修正（经验）** | ⚠ **"不可逆"的判断被我高估了** | 我先前把 P5c 列为"**本目标唯一不可逆动作、须整轮预算**"，实测发现：**释放 = 把 notes 小节归档 + 原位留 stub**，而 `forgetops` 这套机制**本就写着「需要时复制回来即可」** ⇒ **可回滚**。⇒ 教训：**判"不可逆"前先读既有机制** —— 我为此**推迟了约 6 轮** | 读 `src/forgetops.ts` 的 archive+stub | 凡判"不可逆/高风险"，**先查既有实现是否已含回滚路径** | 已记 2026-09-16 |
| **S-P5c-实测** | ✅ **真机读数已取（并纠正了我自己的错误核对方式）** | 触发后审计：`releaseCandidates:26 · releaseBlocked:3 · releaseScanned:29` ⇒ **三数自洽**（候选+blocked==scanned）。⚠ **我原先写的"与度量器一致（23/3/26）"是错的** —— 那是**把活库读数写死成期望值**：深睡每轮都在往 `AGENT.md` 落新原则，同一文件几分钟内由 **29 → 33** 行（未自足恒为 3）。⇒ **活库不得用固定期望值核对**（与仓内 `[原则] 档案事实须复验` 同族） | 真机触发 → 核审计三数；**同一时刻**再跑度量器对照 | ① **不变式**：候选 + blocked == scanned ✅；② 两边 `blocked` 同值 ✅（同判据）；③ 计数**不写死**（写死必因活库漂移而假红） | ✅ 已完成 2026-09-16 |
| **S-P4e（已落地部分，**保留**）** | ✅ 阈值登记 + 行为级测试 + 接线（扇入 1） | `inject.crossFormDedupSim=0.8` 入登记表；`test-inject-dedup.mjs` **19/0** 入 `CHECKS`（116→117）；`panel-inject` 注入回调接线（失败开放） | `node scripts/check-runner.mjs` · `node scripts/test-inject-dedup.mjs` | 判据 ②③④ 均成立 | 已完成 2026-09-16 |
| **S-P4e-踩坑记录** | ⚠ **两个工具级坑（已记）** | ① **删模块是三件事**：删 `src/` + 删 `lib/` 产物（tsc **不删**产物 ⇒ 门禁报**孤儿模块**"死代码随包发布"）+ 删**已安装副本**产物（部署**只覆盖不删除** ⇒ `check-installed-sync` 漂移）。② **写工具会因观察缓存拒绝复写已删文件**（"file no longer exists — re-read the file, then retry"）⇒ 删后再建同名文件须先 `read` 刷新缓存或**换个新文件名** | — | 删模块后跑 `check-arch-sync` + `check-installed-sync --strict` 双验 | 已记 |
| **S-P4a/d（保留）** | ✅ 通道与护栏**已落地且可证**（12 用例行为级 + ⑩⑪ 通道锁） | 即使改走注入侧消重，`sectionops` 的**成对取证 + 配额 + 归档可回滚**仍是"若将来要物理收敛"的现成底座（不删） | `node scripts/test-granularity-converge.mjs` | 12/12 | 已保留 |
| **S-P4c-输出形状探针** | ✅ **已加（本轮立）** | `otherTried:0` **无法区分**「模型没提」与「提了但字段名/位置不符（解析没取到）」—— 后者是**接线缺陷**、后果完全不同。⇒ 审计只记 `out` 的**顶层键名**（**不含任何值**，避免模型原文进审计） | `audit.deep-sleep` 行的 `outKeys` 字段 | 一眼判别：出现 converge 相关键却没进 tried ⇒ 形状不符；完全没出现 ⇒ 模型未提 | ✅ 已完成 2026-09-16 |
| **S-P4d** | ✅ **注入面回归保护（AC-G.5）已落地 + 「未登记」自查已推广（2026-09-20 round 9 补登记）** | 判因：`inject-dedup-probe.mjs` **文件早已存在且能跑（exit 0），但从未登记进 `CHECKS`** ⇒ 按仓规则 6「**未登记 = 等于没写**」，它**从未在 `npm test` 里跑过**（同族先例：`test-deepsleep-verdict` / `test-watermark-guard` / `test-atomic-write` 三件曾写了从不运行）。本轮不仅登记（`check-runner` **185 → 186 件**），还把守住这一类的机检**从「i18n 专用硬编名单」推广为领域无关**：凡 `scripts/test-*.mjs` 必须**登记或显式豁免**（`TEST_FILE_EXEMPT`，逐条留痕），并加**防退化断言**（扫描面 0 件即判红）。实测扫描 **89 件** · 豁免 1 件（loader 钩子）· **先红实证**：造未登记件 ⇒ exit 1，删掉 ⇒ exit 0 | `node scripts/check-runner.mjs`（含 `inject-dedup-probe` + 自身断言）· `node scripts/inject-baseline-diff.mjs` | ① 方向条目数不减少 ② 误注入率不升 ③ 被消重行不在注入面 ④ 关闭即逐字节回基线 —— 四条全过；且 test- 件**无一未登记** | ✅ **已完成 2026-09-20** |
| **S-P5** | 🟡 **R2-C（自足释放）✅ 已落地；R2-B（L1 精要层）⛔ 经复核判定「不建」，理由见右（2026-09-20 round 9 定案）** | **R2-C ✅**：实现为 `essence-release.ts` —— `planRelease`（自足判定，**判据单一事实源**）· `buildSemanticReviewRequest`/`parseSemanticReview`/`semanticApprovedRows`/`intersectApprovals`（语义门）· `applyRelease`（执行 + 归档可回滚，复用 `forgetops`）；判据 `test-essence-release` **67 PASS**；**安全边界**：未自足者零释放 · 无语义清单零释放 · 提交语义门 · 双判据交集更保守 · 归档含整行原文可回滚。<br>**R2-B ⛔ 不建（有硬理由，非保守）**：原设计要在「索引」与「正文」之间加一层 **L1 精要**（每节的中等粒度重述）。**复核后判定不建**，三条理由：① **它与用户 2026-09-15 的拍板冲突** —— 用户明确「库的所有信息都可重构」「源层就是一个记录，是可以丢弃的」「细节丢失了，人就没有认知了吗？」⇒ 库的**价值集中在投影层**（判据/路径/原则），而 L1 精要**仍是正文的重述**，属**未提炼的中间物** ⇒ 建它是**增加一层永久的维护面**（每节都要重述、都要随正文同步）② **它已由既有机制部分满足**：注入面已有「知识索引行（薄）+ 画像行（判据）+ 按指针取详情」三层，L1 精要的**服务目标①（按需读到精要而非流水）**由**索引行**承担，**目标②（原则的可核验素材）**由材料的 `currentPrinciples`/`notes` 命中段承担 ③ **收益不确定而成本确定**：多一层 = 多一处漂移源（正文改了、精要没改 ⇒ 模型读到**过期的**重述），而收益（少读正文）在当前注入预算下**未实测出缺口**。⚠ **若要翻转**：须先给出**实测缺口**（哪个目标的哪次注入因缺 L1 而失败），再按 R1 具名授权；**本项不作为待办持续挂着**（按 §5′ 纪律：已决事项不留待办态） | `node scripts/test-essence-release.mjs`（67）· `node scripts/check-injection-reach.mjs` | R2-C：① 双判据齐备 ② 可回滚 ③ 未自足零释放 ④ 关闭零释放 —— **全过**；R2-B：**不建**（见右理由） | ✅ **R2-C 已完成 2026-09-16** · ⛔ **R2-B 已决「不建」2026-09-20**（翻转须实测缺口 + 具名授权） |
| **S-J3** | ⏳ **U1 召回归因升级**（向量 + LLM，与细校准对账） | `recall-diagnosis` 现为纯函数硬分类 | `node scripts/test-recall-advice.mjs` + `node scripts/mcl-calibrate.mjs` | 归因方向与细校准**一致**（**现状相反，已实证**） | 随时 |
| **S-J4** | ⏳ **U2 活性升级**（向量距离 + 关键性） | `activity` 纯天数阈值 | `node scripts/memory-reconcile.mjs` + 假冷率对账 | **假冷率下降**（历史实证 26/49）· 安全红线节不被判冷 | 先测当前真实假冷率作基线 |
| **S-J5** | ⏳ **U3 收益判定升级** | `recall-yield` 为计数阈值 | `node scripts/test-recall-yield.mjs` 扩项 | LLM 判定须有**可复算证据链**，与确定性计数并列 | S-J3 之后 |

**登记口径**（依 §5′ 教训）：每项已写清**判据与证据来源**；复验一律以**真机/实测**为准，不采信旧记录。

---

## 8. IR1 注入召回链（2026-09-18 立 · **已全部落地**（用户指令「目标模式全部落地」））

> **状态（2026-09-18 收尾）**：P0（册一 + 附册）· P0′（册二）· P1（册四）· P2（册三）· P3（册五）**全部施工完毕**，
> 终态判据 **G1–G6 逐条转绿**。逐条读数 / 先红证据 / **落地差异（§6，不谎报）** / 回滚方式见
> **`docs/specs/IR1-acceptance-record.md`**；方案与验收册见 `docs/specs/IR1-*`。
> **七层门**：`check-runner` **143 pass · 0 xfail · 0 skip** · 真机对拍 3 case PASS（**已重立基线**，见记录 §7）·
> `ui-geo-regress` **104 PASS / 0 FAIL** · 副本 **251/251** sha1 一致 · `check-installed-features` **41 项标记** exit 0。
> **待拍板 4 项的现实处置**：① 册一有意改文本 —— 用户"全部落地"即接受（已重立基线）；② `subject`/`event` 两维
> **删**（契约描述现状：两侧皆不产、存量 0 条）；③ 存量 cue 归一**已执行**（dry-run → 备份 → apply → 幂等复验）；
> ④ 施工授权 = 用户明说"落地"（R1）。

| 期 | # | 册 | 结果（真机读数） | 判据（终态 G） | 状态 |
|---|---|---|---|---|---|
| **P0** | **IR1-A** | 册一 相关性重建 | 动态面 **63/63 相同 → 11/17**；命中词取回相关行（旧 **0**）；零命中注明；桥降级五形态记账；向量桥真读到（`source=bridge`） | **G1** ①②③④ | ✅ **已落地** |
| **P0** | **IR1-F** | 附册 自述对齐 | 接线自称 **0 == 0**；`compliant` 字段**删**（更名 `topicEcho`）；**第 3 处**漂移（`deepsleep-run` 多轮执行）一并订正 | **G5** | ✅ **已落地** |
| **P0′** | **IR1-B** | 册二 cue 键空间 | 新记录命中 **0/119 → 73**；存量归一 221 条/400 键（备份 + 幂等）；归一实现 **3 处 → 1 处**；未声明维拒收 + 审计 | **G2** ①②③④ | ✅ **已落地** |
| **P1** | **IR1-D** | 册四 缓存戳 | 三介质全覆盖（库/activity/delta）；`/inject/stats.cache.byLayer` 层归因 | **G4** ①② | ✅ **已落地** |
| **P2** | **IR1-C** | 册三 装配单出口 | 账由真实裁切直出；**六槽出账**（含 `process`）；`kept.stable` 不含标题；主路径**无第二份装配** | **G3** ①②③④ | ✅ **已落地** |
| **P3** | **IR1-E** | 册五 域路由 | 冻结 **6 → 3**；循环 0/深度 11；**S-P4e′ 收益点落地**（重复不入注入面，槽位被别的叙事行接手） | **G6** ①②③④ | ✅ **已落地** |

**本册不改动 `src/`（`git status` 仅 4 份文档）** 的旧口径已失效 —— 本轮**动了 `src/`**（3 新模块 + 8 处改动），
故施工授权与态标签以 `IR1-acceptance-record.md` §6/§8 为准（R5：每个改动都能回答"态标签 + 授权方"）。

**本轮审查的自我订正留痕**（供后来人）：审查首版据源码注释判「归因调用点未接线 / `src/` 内无消费者」——**实测推翻**
（`deepsleep-run.ts:33/84/94/144` 已接线，审计有真机行）。⇒ 纪律：**自述不得当证据**（已写入验收册 §H.6）；
本轮已把该纪律**升级为机检**（`check-claim-alignment`，接线自称必须与注册表 `wiring.pending` 对齐）。

<details>
<summary>施工前的原始登记（决策态 · 2026-09-18 审查时点快照，**保留供对照**）</summary>

| 期 | # | 册 | 差什么（实测） | 复验命令 | 判据（终态 G） | 何时可做 |
|---|---|---|---|---|---|---|
| **P0** | **IR1-A** 🔴 | 册一 相关性重建 | 注入侧相关性=**纯词法**：`recallIndex` 对自然语言中文查询实测 **0 行**；`"深睡蒸馏"` 8 行**全 AGENT.md**（被 `file==='MEMORY.md'` 单点过滤全丢）；唯一向量桥只在 MCL 慢通道回合写 ⇒ **动态面与 query 无关**（真命中 vs 乱码 **62/62 行 100% 相同**） | `node scripts/check-relevance-live.mjs`（待建 · 真机 `/inject/preview` 双夹具） | **G1**：① 不同 query 注入文本**不得 100% 相同**；② 真命中词取回 **≥1** 相关行（现 0）；③ 桥缺须记 `relevance-fallback`（现静默）；④ 零命中须在注入面注明 | **待授权**（本册**有意改注入文本** ⇒ 需用户确认；事后**重立对拍基线**） |
| **P0** | **IR1-F** | 附册 自述对齐 | `recall-diagnosis.ts:99-102` · `recall-yield.ts:22` **注释称"未接线/无消费者"，实况已接线且真机在跑**；`compliant` 遗留字段恒 false（2930 条 / 0 真阳性；缺口已由 `yield-rounds.jsonl` 换源修复） | `node scripts/check-claim-alignment.mjs`（待建） | **G5**：① 源码"未接线"类断言 == 注册表 `wiring.pending` 条数（现 **2 处漂移**）；② `compliant` **要么真、要么删** | 待授权（薄，可与任一期并行） |
| **P0′** | **IR1-B** 🔴 | 册二 cue 键空间 | 写侧归一**正斜杠**／读侧产**反斜杠**／匹配是**字符串全等** ⇒ `createdAt ≥ 09-18` 的 **119 条新环记录 scope cue 命中 = 0**（存量 152 条在撑门面；正斜杠 267 条仍增） | `node scripts/check-cue-space.mjs [--since <date>]`（待建） | **G2**：① scope 键**只剩 1 种拼写**（现 2）；② 新记录 **100%** 可命中（现 **0%**）；③ 归一实现**只 1 处**（现 3 处）；④ 注册表外维**拒收**（现 37 条静默） | **待授权**（存量 267+152 条改 `meta.cues` 属**真源数据** R3② ⇒ 须择时 + 备份 + dry-run） |
| **P1** | **IR1-D** | 册四 缓存戳 | 四套失效口径（30s TTL · `upstreamStampOf` size · `injectCacheReason` 四条件 · vec 60s/5s/`fileStatCache`）；`/inject/stats` **只报最外层** reason | `node scripts/test-inject-cache.mjs`（扩展 3 条介质断言） | **G4**：① 库/activity/delta 各触发一次重建（现只签 2 条）；② 读数能指出**哪一层**失效（`cache.byLayer`） | 待授权（P1，须 P0 后） |
| **P2** | **IR1-C** | 册三 装配单出口 | 同批候选装配**两次**（主路径 + 影子复算）；账与真实裁切不符（**6 vs 1**）；`kept` 仅 4 槽（**缺 `process` 账**） | `node scripts/test-usage-truth.mjs`（扩展） | **G3**：① 逐字节不变；② `dropped` 数 == 真实丢行；③ 六槽全出账；④ `process` **零挤占行为不变**（只补账，不改额度） | 待授权（P2，须 P0 · P1） |
| **P3** | **IR1-E** | 册五 域路由 | 注入域多件抽出动因**全是棘轮逼迫**；`panel-shared` 523/522、`mcl` 434/433 **仍顶格**；**S-P4e′ 已定案需专用一轮重构** | `node scripts/audit-architecture.mjs` · `check-module-growth.mjs` · `inject-dedup-probe.mjs` | **G6**：① 无新循环/深度 ≤11；② 冻结名单**减项 ≤4**；③ 三子域无反向依赖；④ **S-P4e′：省下的额度能被别的叙事行用上**（现省 0 字符/0 行） | 待授权（P3，须 IR1-C 收敛） |

**待用户拍板（4 项）**：① 册一**有意改注入文本**是否接受（决定 P0 能否开工）；② `subject`/`event` 两维**删**还是**补产出**；③ 存量 cue 归一**择时**；④ **施工授权**（点名册/条；「你自己决策」≠ 授权施工）。

</details>

**口径沿用**：「按任务选择失效」的旧读数（§7 索引注入节奏条，94%）按 `[原则] 同结论跨日再现即稳` **升格为 G1 机检判据**，不另立新条目（本轮已落地为 `check-relevance-live`）。

---

## 10. S1R 小节寻址收口（2026-09-19 · **P0–P3 已全部落地**；下 3 项为**收口后新登记的遗留**）

> 落地记录见 `docs/specs/S1R-section-ref-record.md`（G1–G8 逐条读数 + 落地差异 6 条）。
> 下表只列**尚未做**的事项（已完成的四册不在此重复登记）。

| # | 项 | 差什么 | 复验命令 | 判据 | 何时可做 |
|---|---|---|---|---|---|
| **S1R-F1** | **appends 缺锚 ⇒ 详情缺口未联动**（P1 只挡了"索引行"，没挡"详情缺失"） | 代码路径确在（`memory-append` exit 2 于顶层 `##` 锚缺失时），而对应 `newIndex` 行在 P1 之前仍写入 ⇒ 产生"有行无节"的孤儿指针（实测 9 处已降级为文件级）。<br>⚠ **2026-09-19 会审勘误**：审计里**零证据**支持"265 轮因此被拒"（账内「顶层」0 命中）⇒ 该病灶陈述**属未验证推断**；同族改由 **§11 册零**承接，判据改为**可先红的并发一致性夹具**（先红不出即不得开工） | `node scripts/check-section-refs.mjs`（现为 0，因已降级）· 审计 `audit.distill-run` 的 `fclass:"dispatch-failed"` / `failed:N` | ① append 失败 ⇒ **该主题的 newIndex 行不入库**（或按拍板口径**自动建顶层锚**）；② 新增一条机检：`dispatch-failed` 出现时不得有对应新索引行 | 随时（须先定"自动建锚 vs 放弃该行"口径） |
| **S1R-F2** | **9 处指针已降级为文件级**：主题详情**从未落盘**（库内零命中，只在 `INDEX.md` 台账登记） | 若要恢复精度须**建节 + 补详情**（内容只能来自会话转录/审计，库内已无） | 处置记录（`S1R-section-ref-record.md` §2 降级档）· `node scripts/section-ref-reanchor.mjs --dry`（应为 no-op） | 建节后指针须重指且 `check-section-refs` 仍为 0 | 可选（不影响"悬空归零"达成） |
| **S1R-F3** | **容量只报不拦**（MEMORY 520% / AGENT 250%） | 容量口径与实况差 5.2×/2.5×；写入侧不再拦（用户 2026-09-16 判定"提醒即可"） | `check-section-refs` 无关；`memory_write_gate` 的容量告警行 | 若改口径须**单独预注册 + 真实分布校准**（仓内阈值登记制） | 待拍板 |

---

## 11. S2S3 三层供给链协调（2026-09-19 立 · **决策态，未施工** · **v2 经圆桌会审修订**）

> 由来：用户口径「L1 窗口级快速总结知识；**L2 会话级复盘要参考整个会话 + L1 产出，并能调整 L1 产出**；
> **S3 睡眠不产出**，但需**审查当日每条记忆在会话实际中产生的影响**后做**裁剪压缩**（细节压缩、只留方向节点）」。
> **成对方案/验收**：`docs/specs/S2S3-three-layer-plan.md` + `docs/specs/S2S3-three-layer-acceptance.md`（**均为 v2**）。
> **会审**：会议 `s2s3-三层供给链-落地方案会审`（7 专家 · orchestrated）——裁定 **维持五册**、**库级锁**、
> **两新件（`section-rewrite.ts`/`bank-lock.ts`）并入册零**、**册一降为 append-only 提案流**、**分母钉死（禁用 205/693/407）**。
> **计数纪律（会审立）**：计数类判据**禁写死数字**，须带**口径描述串**（数据源+kind+过滤+去重键+档位+采集时点），数字只作锚。
> ⚠ **v1 四处事实已勘误**：`treeOps/pointerOps 0`（字段根本不存在，真值 `tree` 11 / `pointers` 26）· `converge 落地 0`（反例 `{tried 3, applied 3, archived 3}`）·
> 「678 轮 / failed 1679」（时点快照 + 双写虚增；权威口径 **stop 352 行 / 173 键**）· 「每会话中位 14 轮 / 41% 分片」（段中位 **4** / 行中位 **7**；分片 **80.7%**）。

| # | 项 | 差什么 | 复验命令 | 判据 | 何时可做 |
|---|---|---|---|---|---|
| **S2S3-册零** | **落盘一致性与单写者（前置项）** | ① 产出/维护共用落盘面而产权未划分（容量门超限**只告警不阻断** ⇒ 295% 是机制必然）② 失败**只累加计数无明细**（`write.ingest` 441 行**无条目标识**）③ **既存缺陷**：`sectionops.applyConvergeOps:92` **无 gate、无锁、直写非 tmp+rename**（第 91 行自陈） | 并发夹具（蒸馏写 × 面板改写）· `audit-fnspan --gate --debt 0` · `check-module-growth` · `check-shared-fn` | ① **先红**：并发夹具必须复现"索引行在而 notes 节不在"（**红不出 ⇒ 不得开工**）② 索引行与节同写/同不写 ③ 失败条目带身份（+1 字段）④ 新件 `section-rewrite.ts` + `bank-lock.ts`（**库级**锁），收编序 sectionops → applyPointerOps → writeMemViaGate | **随时**（册一/册二前置；**册零未完 ⇒ 册一不得开工**） |
| **S2S3-册一** | **L2 会话级复盘（append-only 提案流）** | 不存在：跨轮无该会话累积视野；且 `distill-write.ts` **无 notes 改写通道**（S2 只增不改）⇒ 直改会撞硬不变量 | 审计 `kind=session-review`（含 `reviewedSeq` + `formatVersion`/`fp` **双证** + **三态**）· 提案流 `proposals-<sid>.jsonl` · 幂等键 `(sid, reviewedSeq, opHash)` | ① 成功路径**恰好一次** + 失败重试有上界 ② 材料覆盖全会话（骨架 ≤80 轮 + 锚点 ≤12 段）③ **只产提案、不直接改库**（执行权留 S3）④ import 白名单（禁 `treeops`/`forgetops`/`sectionops`/`deepsleep-*`/`panel-*`） | 册零后（**硬门**） |
| **S2S3-册二** | **S3 转"审查 + 压缩"（不产出）** | 现状：`added` **65**（49 轮）· `forgetArchived 4/391` · `tree applied 17`/`pointers 26` · `release` 候选 **2254**（语义门已过 **834**）· 写门口径 AGENT.md **295%** | 审计 `kind=deep-sleep` **三通道**（`added`+`replaced`+`profiles`）· 影响账并入 `sleep-reports.jsonl` | ① 三通道同时为 0 **且**本轮运行过（**成对断言**）② 影响账两侧**同口径 + 差集为空**（载体 `added`，缺省**档 S**）③ 压缩 > 0 且方向可读（指针仍可解析）④ 细节只归档不直删 ⑤ `release` 接线**两前置**：`runDeepSleep` 净减（现 399/400）+ `approvedRows` 补出 | 册一后 |
| **S2S3-册三** | **层间交接机检（独立册，不并入册四）** | 无 | `node scripts/check-runner.mjs --list` 含 `check-layer-handoff` 且全量 `fail==0` · 反例夹具 3 组 | ① L2 必消费 L1 清单（含失败明细）② S3 必对当日产出裁决 ③ 交接物字段缺失 ⇒ 红；**与册四共用同一审计读出口解析** | 册一后（**可与册二并行**） |
| **S2S3-册四** | **睡眠汇报（日历式留存）+ 问题统计 + UI** | 现只有会被覆盖的 `delta.md`；`unused/counter` **零落点** | 指纹账 `audit/sleep-report-ledger.jsonl` · `reports/sleep/<date>.md` · `sleep-reports.jsonl` · `sleep-issues.jsonl` · 只读路由（白名单 `{/sleep/reports,/sleep/issues}`） | ① 每轮一份、同日多轮**追加不覆盖** ② 五段齐（区间/提存/压缩/**标记**/统计）+「未处理」明示 ③ **永不删除** = 指纹账三断言（行数单调 + sha256 全覆盖 + 逐值相等）④ **只标记不处置** ⑤ UI = **占用运行总览晨起摘要卡位**（落点 `src-client/panes-overview.js#ovMorningCard`）⑥ 「🧠 最近成长」改派生须**逐元素等价** + **介质戳**处理（`supply-stamp.ts:59`） | 册二后 |
| **S2S3-新缺陷** | **同段重复蒸馏**（会审新发现，不在五册内但污染册二判据） | 同一 `sid+chunk+区间` 被蒸馏**最多 24 次**；42 键有重复行、179 重复行中 **105 条计数不同**（样例 `aborted(0) → completed(2) → completed(3)`）⇒ 每次重试都可能 `added>0` = 知识重复产出（档 L 1105 vs 档 S 574 的落差即其量化） | 验收册 §7-①（档 L / 档 S 对照） | 重蒸须可辨（同键多行须有终态语义）且不得重复计入产出 | 与册零同批评估 |

**待用户拍板 6 项**（详见方案册 §5.2；**机器判不了**的理由随行）：**U1** 画像"生长"最终归属（归因已成立：`[原则]` 79 行 = 69.3% 字符）· **U2** `delta.md` **文件**退役是否现在做（一处退役实测动 **12 个文件** + 介质戳重签 + `inject-baseline-diff` 必红）· **U3** `unused` 阈值与"压缩后方向可辨"抽样阈值（H-1 建议 n=20、≥18/20，无出处）· **U4** L2 触发阈值（实测段中位仅 4 ⇒ 现阈值可能大面积漏触发）· **U5** 容量出口口径（建议"可归档压缩、不删除"）· **U6** 睡眠报告容量上界（建议只读计数器 + 超线告警，不自动删除）。

**施工状态（2026-09-19）**：册零 · 册一 · 册二（第一段停产 + 第二段影响账 + **`release` 接线两前置与接线本身**）· 册三 · **册四** 均已落地；
逐册证据见 `docs/specs/S2S3-book0-record.md` · `S2S3-book2-record.md` · `S2S3-book4-record.md`。**U1–U6 由代理自行裁定（用户授权"不要打扰我"）**，裁定与理由随册四记录。
**册二接线口径**：`release` **默认关闭**（`SHOUCANG_RELEASE_AUTO=1` 才执行）+ 语义门 `executable` 门 + 当下复核三重 fail-closed；生产现状仍为**零释放**。

### 11-a 收口后新登记的遗留（2026-09-19 · 真库病灶 + 代码侧收口）

| # | 项 | 差什么 | 复验命令 | 判据 | 何时可做 |
|---|---|---|---|---|---|
| **S2S3-R1** | **真库 1 处孤儿指针**（`MEMORY.md` 末段）：`[教训] junction 装配漂移 · … → notes/env.md §npm 失效与残留 shim 修复/junction 装配漂移`，而 `notes/env.md` 只有 `### npm 失效与残留 shim 修复`（**无**子节 `junction 装配漂移`）⇒ spec 级 `partial`（父在子缺）。<br>**成因链（实证，非推断）**：`2026-09-18T20:15:03Z` 的蒸馏轮 `kind=distill-run added=5 / failed=4` 且 `failedItems` 含 `k=append` —— **明细 append 失败，而同批索引行仍入库**；当时的准入策略对 `partial` 一律放行 | `node scripts/check-section-refs.mjs`（现状：`❌ 路径部分悬空 1 ≤ 基线 0` ⇒ 红） | 重指为可解析前缀（`§npm 失效与残留 shim 修复`）⇒ 该门归 0；**真源数据改动须用户拍板（R3-②）** | **待拍板** |
| **S2S3-R2** | 同族**代码侧已收口**（防再生）：`admitIndexRow` 对 **末段缺失** 的 `partial` **视同 missing ⇒ 拒写**；中段缺失仍放行（读侧可回落）。孪生 `skill/scripts/section-ref.mjs` 同改（`check-section-ref-parity` 差分锁守） | `node scripts/check-section-ref-parity.mjs`（A3 四条：末段拒写 · 孪生同结论 · 中段放行 · partial 明细留痕） | **先红已留证**：收口前 A3 两条红（`ok=true`）；收口后四条全绿 | **已完成（2026-09-19）** |

### 11-b 深睡/蒸馏触发链四册（2026-09-20 · 真机取证 → 判据外移）

> **登记性质**：本节四条**均已在本轮落地并过六层验收**，此处留档的是**真机证据**与**新增的待校准项**——
> 不是"待办"。留下它们的理由：四条的取证方式（读真机日志 / 水位流 / 审计）与**判据是否真的外移**
> 这件事，日后复验时要能一眼对照。

| # | 项 | 真机证据（可复算） | 判据与修复 | 状态 |
|---|---|---|---|---|
| **S-P2a** | 全 `stalled` ⇒ 深睡**永不触发**（代码与状态机自述相反） | ① 探针：仅 `stalled` 会话 ⇒ 未触发；仅 `ended` ⇒ 触发（同阈值）。② 日志：09-17T08:34 起 `28f9f094` 等转 stalled 后**连续 11 小时无 `deep sleep: 触发` 行**。③ 面板：同源过滤令 `lastActivityAt=0` ⇒ `nextEligibleAt = 0 + idleMs` ⇒ 渲染 `1970-01-01` | `planSleepWindow`（归约与判定分离，巡检 + 面板**共用**）；判据 `test-sleep-window-reduction`（36 条，含**变异重演**：把 stalled 改回跳过 ⇒ 用例必红） | **✅ 已落地**（运行态活体：`nextEligibleAt` 为有效近期时刻） |
| **S-P2b** | `conflict` 分支**不推进计数** ⇒ 活锁 | ① 日志：`28f9f094` **连续 23 次 conflict、跨 11 小时**（09-16T21:36 → 09-17T08:41）；该窗口「探测未决」**41 行**、触发行 **0 行**。② 全库 conflict 仅此 1 会话 23 条 | `planProbeOutcome`（6 出口决策表）+ **冲突有界**（新阈值 `deepSleepProbeConflictMax`=3）；判据 `test-probe-outcome`（28 条） | **✅ 已落地** |
| **S-P3** | **段级**重试计数误用**会话级末行**读 ⇒ 结构性归零 | ① 水位流 1093 行，`phase:"retry"` **0 行**。② `spawn` 行 399 条，`attempt` 分布 `{0:31, undefined:368}` ⇒ 带 `segKey` 且 `attempt>0` 的 **0 条**。③ 日志重试 307 条，分布 `{1/3:267, 2/3:40}` ⇒ **`3/3` 从未达**（「有界重试」真机从未生效）。④ 探针：retry 行后插一条 skip 式写入 ⇒ carriedAttempt 由 1 变 **0** | `readSegFlowState` 段级读口（水位流「末行生效」语义**不变**）；`retryAttemptFor` / `retryRowHeld` **同源**；判据 `test-seg-flow-state`（14 条，含旧形态反例对照） | **✅ 已落地** |
| **S-P4** | 自检名义 6h 周期实为**每挂载必跑一次** | ① 日志：09-19 **十次挂载 → 十次 `selfcheck(timer)`**，`mount→自检` 间隔**恒 179s**（十组全同）。② 09-18 **43 挂载 / 40 次自检**。③ 09-16 起 76 次/天 | `dueSelfCheck`（读 `selfcheck-latest.json` mtime；定时器降级为**唤醒节拍**）；判据 `test-selfcheck-cadence`（17 条，含「10 次装配 ⇒ 0 次真自检」反向自证） | **✅ 已落地** |

**新增待校准项（登记制 · 非阻塞）**：
- `trigger.deepSleepProbeConflictMax`＝**3**，`preregistered: false`、`samples: 0`。**说明**：本项**不是**待校准的经验阈值，
  而是**有界性（正确性要求）**——无上界即活锁，故先给上界。复检：conflict 事件累计 ≥10 次后，按「误判长任务」
  与「活锁时长」**双向代价**定值（口径见 `criteria.json#thresholds` 对应条目）。

**本轮一处结构性发现（供后续同类参考）**：`deepsleep-core.ts` 的导出数受 `audit-architecture` **棘轮**约束
（阈值 35 · 只许收紧；抽出前实测 **34**）⇒ 在本文件**就地**新增判据会破棘轮，而放松棘轮属 `R3` 须用户拍板之事。
故本轮判据按**领域接缝**单独成件（`probe-plan.ts` / `trigger-plan.ts`），并**只向下**依赖取类型 ⇒ 零环。
同类先例：`injection-playbook` / `recall-diagnosis` / `dynamic-select` / `situation-supply`。

---

_建立 2026-09-14 · 本表为待办唯一入口。_
