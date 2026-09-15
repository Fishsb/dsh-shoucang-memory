# 待办总表（OPEN ITEMS）

> **用途**：本仓**唯一的待办入口** —— 任何"还没做完的事"都必须在此登记一行，否则视为未登记。
> **当前状态（2026-09-15 机检）**：五阶段（S0–S4）+ S4R + S4X + S4Y + **UI1 面板架构整理** 的**可施工项全部完成**；
> 下表 3 项**判据全部满足**（`node scripts/verify-open-items.mjs` ⇒ **3/3**），**当前无阻塞项**。

**最后更新**：2026-09-15

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

_建立 2026-09-14 · 本表为待办唯一入口。_
