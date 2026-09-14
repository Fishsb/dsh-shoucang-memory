# 守藏：库内容 × 消费链条 全局重梳理方案（2026-09-14）

> **性质**：架构级重梳理方案（**非增量补丁**）。回答两个问题：① 库里各类信息**在任务执行时该怎么检索、怎么判断、怎么注入**；② 库内容与消费链条**该怎么重新组织**。
> **上游依据**：`docs/human-task-loop-vs-embodied-ai-2026-09.md`（人类流程 + 具身智能对照）· `docs/anthropomorphic-plan-2026-09-14.md`（现状 40 项登记 + 扩展四条线）· `docs/context-supply-plan.md`（G0–G4）。
> **证据标注**：【实测】= 本次脚本/命令所得 ·【读码】= 源码所得（带 `文件:行号`）·【注册表】= `criteria.json` ·【审计工具】= `scripts/audit-architecture.mjs` 运行输出 ·【文献】= 研究依据。
> **修订**：v1（初稿）→ **v2**（纠正 1 处自身误判：审计面已迁移，见 §3-G9；补入架构审计的扇入/分层实测）。

---

## 0. 结论摘要（一页）

| # | 结论 | 依据 |
|---|---|---|
| 1 | **库内容已经不是问题，消费链条才是**。真实库 1,177 条记录里，**环记录（episode 81 / decision 14 / valence 3 / commitment 3 / association 2 / outcome 1 / relation 1）合计 105 条（8.9%）**，全部 `file=''` **无 md 投影** —— 而恒常面与内容相似度召回**都只读 md** | §1.1 §1.2 |
| 2 | **消费链条是五条并行通路，不是一条链**。恒常面 / 动态面 / 一次性 / MCL 慢通道 / 情境槽各自独立选行、独立预算、独立去向 | §2 |
| 3 | **同一件事存在三套预算实现 + 两套装配实现**，而装配器的核心输出（`kept`/`dropped`）**不进注入面**（扇入实测 = 1，唯一消费者在诊断面） | §2.6 §2.7 |
| 4 | **两个消费维度已天然分好，但第二个维度只开了一条缝**：md 投影行 → 内容相关性；无投影环记录 → 情境匹配。后者靠 `situation` 槽，预算 **300 字符 / topN 3 / 环序 5 环**，105 条环记录抢 3 个位置 | §2.5 ·【注册表】 |
| 5 | **能力齐了、开关也开了，缺的是「停止准则」与「分流判据」**。快通道名义 25.4% / 实际 **2.3%**（差 11 倍）；step1 中 **49.3% 的 turn 记忆零贡献** | §2.4 §3-G3/G4 |
| 6 | **审计面已统一收口到 `ledger.jsonl`**（`mcl-audit.jsonl` 是迁移遗留的冻结文件）。今日 `mcl-step` **206 条** ⇒ 分流链**在跑** | §3-G9 |
| 7 | **重梳理的轴心 = 把「一个 Record 事实源」按消费维度切成两个面**：**内容面**（有 md 投影）与**经历面**（无投影环记录），各自**一份选行器、一份预算、一份账** | §4 |
| 8 | **不改骨架即可落地**：`ring-supply`（L3 扇入 2）/ `supply-assembly`（L5 扇入 1）/ `situation-key`（L2 扇入 2）/ `ring-commit`（L4）**均已存在且已接线**；缺的是**接线升级 + 阈值校准 + 停止准则** | §2.5 §2.7 ·【审计工具】 |

---

## 1. 现状实测

### 1.1 库内容（真实数据）

**主库**：`<HOME>\.dsh\skills\managing-memory\`【实测】

| 载体 | 规模 | 说明 |
|---|---|---|
| `MEMORY.md` | 9798 B · 81 条指针行 | 标签：lesson 33 / env 21 / flow 12 / tool 7 / 教训 5 / 环境 3 |
| `USER.md` | 4590 B · 8 指针 + 20 画像行 | 标签：偏好 3 / 习惯 2 / 硬件 1 / 身份 1 / 环境 1 |
| `AGENT.md` | 5559 B · 17 指针 + 15 画像行 | 标签：原则 10 / 路径 5 / 演化 1 / 经验 1 |
| `notes/` | 8 文件 · 99,995 B | 详情层 |
| `.records/records.jsonl` | **1,177 条** · 511 KB · mtime 09-14 15:46 | Record 事实源 |
| `.records/ring-events.jsonl` | 28 行 · mtime 09-14 15:46 | 环事件流 |
| `audit/activity.jsonl` | 9,754 B · mtime 09-13 18:17 | 冷热/命中计数 |

**Record kind 分布**【实测 · 1,177 条】：

| kind | 条数 | 有无 md 投影 |
|---|---|---|
| prose | 474 | 有（笔记正文） |
| fact | 266 | 有（索引行） |
| blank / structure | 153 / 146 | —（空行/标题/引用） |
| **episode** | **81** | ❌ **无** |
| persona | 28 | 有（画像行） |
| **decision** | **14** | ❌ 无 |
| procedure | 5 | 有（`[路径]`） |
| **valence / commitment / association / outcome / relation** | **3 / 3 / 2 / 1 / 1** | ❌ 无 |
| **环记录合计** | **105（8.9%）** | **0 条有投影** |

> **与上游方案档的差异**：`anthropomorphic-plan`（2026-09-14 早）实测 episode/principle/preference = **0**、环记录 9 条；**本次为 episode 81、环记录 105**。⇒ 该档 §0 结论 1「类型不必再加，缺的是活体」方向正确，但**缺口的量级已变化**：数据在长，消费面没长。

**知识区**：`<HOME>\.dsh\suite\knowledge\`【实测】——运行期工作面（`delta.md` 282 B + 小索引），**审计面统一在此**：

| 文件 | 规模 | mtime | 最后事件 |
|---|---|---|---|
| `audit/ledger.jsonl` | **1,258 条 · 453 KB** | **09-14 20:14** | 09-14T12:14 |
| `audit/mcl-audit.jsonl` | 1,120 条 · 240 KB | 09-13 22:52 | 09-13T14:52（**冻结·遗留**） |
| `audit/distill-audit.jsonl` | 207 KB | 09-13 22:21 | — |
| `audit/episodes.jsonl` | 99 KB | 09-13 20:14 | — |
| `audit/judgement-ledger.jsonl` · `warm-recall.json` | 1,236 B · 719 B | 09-11 / **09-14 20:14** | — |

**`ledger.jsonl` 的 type 分布（top）**【实测 · 1,258 条】：`mcl-step 426` · `score.shadow 231` · `decision.ingest 168` · `check.sleep 126` · `write.ingest 118` · `activation.shadow 59` · `audit.distill-skip 25` · `audit.distill-run 24` · `mcl-ready 19` · `decision.consolidate 16` · `stub 12` · `audit.deep-sleep-probe 10`。

**仓库内**：`D:\FF\shoucang\_memory\`（1,935 B MEMORY + 776 B USER + 337 B AGENT + notes 8 文件）——与主库**内容不同**（标签分布不同、无 `← 源:` 画像行）⇒ 属仓内私有副本，非活体主库。

### 1.2 结构性事实：md 投影决定可达性【读码】

**kind 只能这样派生**（`src/record-store.ts:147-155`）：

```
blank / structure / procedure(R 层) / persona(P 层) / fact(其余有标签) / prose(无标签 `- `)
```

⇒ **`episode/decision/outcome/valence/relation/commitment/association` 七类永不可能由 md 行产生**，只能由环 API `makeRecord({kind})` 造出。

**环记录的 `file` 必然是空串**——硬编码证据：

| 文件:行 | 代码 |
|---|---|
| `src/decision-ring.ts:71,111,134` | `file: ''` |
| `src/relation-ring.ts:69,90` | `file: ''` |
| `src/association-ring.ts:86` | `file: ''` |
| `src/ring-commit.ts:192` | `file: ''` |
| `src/ring-supply.ts:23` | `export const RING_RECORD_FILE = ''` |

**而活注入面读的是 md 文件**（`src/panel-shared.ts:487-489` `readCarrier` = `readFileSync(join(memRoot, name))`）。

⇒ **105 条环记录在恒常面与内容相关性面上结构性不可达**（比"被过滤器挡掉"更强）。唯一可达路径是情境槽（`ring-supply`），而它**只收 `file===''`**（`src/ring-supply.ts:136`）——两半是精确对接的。

---

## 2. 消费链条：五条并行通路（现状全图）

```
写侧                                        读侧（每步模型调用前）
┌──────────────────────┐
│ distill 蒸馏（会话→库）│───┐
│ deepsleep 深睡（库→库）│───┤   ┌── (1) 恒常面 stable ── P 层 always 全量 ──────┐
│ ring-commit 环记录     │───┤   │      （md 直读，不参与相关性竞争）          │
└──────────────────────┘   │   ├── (2) 动态面 dynamic ─ recallIndex/warm-recall ┤
                           ├──▶│      （MEMORY.md 选行，cap 靠档位/预算）      ├─▶ systemPrompt
   md 投影（3 索引+notes）─┘   ├── (3) 一次性 oneshot ─ 成长 delta（TTL）      │   .context
   Record 事实源              │   ├── (4) MCL 慢通道 ── top-k 指针 + 薄契约    ┤   （或消息面）
   环记录（无投影）─────┐     │      （首步；独立 600 字符预算）             │
                        └────▶└── (5) 情境槽 situation ── 环记录按情境键选出 ─┘
                                   （独立 300 字符预算；topN 3）
```

### 2.1 通路 (1) 恒常面 stable【读码】

- **读什么**：`readCarrier('USER.md'|'AGENT.md')`（`panel-shared.ts:487`）。
- **准入判据**：索引行必须 `indexRowInLayer(l,'always')`（`targets.ts:303`，注册表 `carriers` 的 `inject=always` 标签集）；**无标签/未登记标签 → false**（保守缺省）。
- **画像行**：`/^-\s/` + `← 源:`（`panel-shared.ts:494-500`）；带标签者**每标签留最近 1 条**，余额用最近无标签行补齐（`:505-514`）；被挡者**追一行可见化提示**（`:516-517`）。
- **预算**：`capStable = totalBudget − capOneshot − capDynamic`（`:639`），再按块切 55%/45%，**块内裁行不丢块**（`:662-669`）。
- **缓存**：`stableKey` = `memRoot|personaMode|profileCap|AGENT/USER 尺寸签名`，TTL 120s（`:642-645`）。
- **注册表语义**【注册表】：`budgetChars = 4000` 是**恒定面安全带**（不是分档），实测每步真实占用 **2391–2977 字符**（其中 P 层 1756，`[原则]`+`[路径]` 占 1532 = 87%）；note 明确记载「P8 恒定面框架化**经实测否决**」——可压面仅指针尾巴 302 字符（≈10%）。

### 2.2 通路 (2) 动态面 dynamic【读码】

- **候选池**：`allMemFill` = MEMORY.md **全层** `^[` 行（`:577-581`）——2026-09-13 的质量修正（此前 `allMem` 只剩 P 层 ⇒ 新鲜槽与基线恒空）。
- **选行三叠加**（`:582-622`）：① **预热融合召回**（`knowledge/audit/warm-recall.json`，键 `recallKeyOf(q)`、TTL 120s，由 MCL 的 `decideTurn` 写入 `mcl.ts:481-486`）；② `recallIndex(memRoot,q,cap,'all')` 词法召回；③ **新鲜度槽** `injectFreshSlots`（缺省 2）。
- **补位**：位置式基线，`cold` 行后置、`hits30` 高者先占槽（`:613-620`）。
- **预算**：`capDynamic = clamp(round(total*0.15),120,600)`（`:638`）。
- **口径风险**：档位 `levelCaps.smart=10` 与预算 600 字符是**两套约束**（cap 先行、预算再裁）。

### 2.3 通路 (3) 一次性 oneshot

`readDawnDelta(personaMode)`（`:677`）→ `capOneshot = clamp(round(total*0.05),80,200)`。

### 2.4 通路 (4) MCL 双通道（认知环）【读码】

- **触发时刻**：`agent/pre-step`；判定时机 = **消息到达后的第一个 pre-step 且 `step ≤ 3`**（`mcl.ts:561-568`）。
- **熟悉度**：`recallRanked` 融合召回 → 取**高置信行**（`mclGate` 标签）算 `semanticSim`（绝对余弦，`:471-479`）。
- **分流**：`fast = sim ≥ familiarThreshold && hasHighConf`（`:488`）。
  - **快通道**：零材料、零往返（`:583`）——RPD「识别即行动」。
  - **慢通道**：**按会话去重**（`SupplyLedger`，`:499-502`）→ `material(freshRows, budgetChars)` 渲染 top-k 指针 + **薄契约**（`THIN_CONTRACT`，`:165-169`）→ 注入。
- **去向**：`materialInSystem=true` ⇒ 挂 systemPrompt 段（块序 89，`:254-283`）；否则插消息面（`:576-580`）。
- **再引导**：慢通道后续步做**合规机检**（模型是否引用材料主题词元，`rowSignals` 转述容忍，`:145-162`），未引用则 `nudge` 一次（`maxNudges`）。
- **审计**：**已统一收口** —— `mcl.ts:315-323` 的默认 hook 写 `knowledge/audit/ledger.jsonl`（经 `envelope` 统一信封），**不再单开 `mcl-audit.jsonl`**（后者为迁移遗留冻结文件）。开关 `cfg.audit`。
- **参数**（活体 `scheduler.json` + 注册表）【实测】：`mclTopK=3` · `mclFamiliarThreshold=0.55` · `budgetChars=600` · `maxNudges=1` · `materialInSystem=true`。
- **审计实测**：
  - 【实测·`ledger.jsonl`（当前源）】`mcl-step` **426 条**，其中 **09-14 当日 206 条**，`lastMclAt=2026-09-14T12:14:20.612Z` ⇒ **分流链在跑**。
  - 【实测·`mcl-audit.jsonl`（冻结·历史）】总 **1,120** 条 · `channel` = **slow 910 / fast 26 / 缺失 184** · `step1` 213 条中 `injected>0` **105 条（49.3%）** · `sim` 分位（n=936）min .362 / p25 .496 / **p50 .513** / p75 .561 / p90 .575 / max .662 · `≥0.55` **25.4%** / `≥0.58` **9.3%** · 时间跨度 **09-11T05:18 → 09-13T14:52**。
- **两个关键结论**：① 快通道**名义 25.4% / 实际 2.3%**（差 11 倍，见 §3-G4）；② step1 中**约一半 turn（49.3%）记忆零贡献**——与人类「检索停止点更准」的差距（`human-task-loop` §1.3）在此量化。

### 2.5 通路 (5) 情境槽（环记录的唯一可达路径）【读码 + 注册表】

- **入口**：`panel-shared.ts:354-363` `situationLinesOf` → `createRingSupplyApi(...).lines(records, cues, at)`。
- **候选**：`ring-supply.ts:122-186` —— 只收 `file===''` + `ringOfKind(kind)!=='none'` + `isLive(r,at)`（时态）+ 文本非空。
- **排序**：情境命中组（按命中数降序）→ 兜底组 → **环优先级（注册表 `ringOrder`）** → `due` 紧迫度 → 新鲜度（`:159-175`）。
- **情境键**：`situation-key.ts` 四维 `scope/task/subject/event`（`cueDims`，注册表**唯一维度声明处**）。
- **预算**：`situation.budgetChars` = **300**，`topN` = **3**，`ringOrder` = `relation, decision, association, fact, value`【注册表】。
- **活体状态**：`enabled: true`（**已开**）——而 `supply-assembly` 的 `DEFAULT_BUDGET.situation = 0`（代码默认关）⇒ **注册表开、代码默认关**的分离。
- **注册表 note 自述的两条设计纪律**（可直接沿用）：① `value` 环曾因"走图式层"被排除，实测 **valence 两条路都不可达**，已补进 `ringOrder` 末位；② **放弃 `alphaVal` 打分项**——索引行没有 valence 信号，加它只能是"恒 0 的假旋钮"⇒ valence 的正确定位是**情境召回**，不是相关性权重。

### 2.6 三套预算实现（不一致风险）【读码】

| 实现 | 位置 | 语义 |
|---|---|---|
| A 手写三层 | `panel-shared.ts:636-639` | stable = 余额；dynamic ≤600；oneshot ≤200；**总量 4000** |
| B `SupplyBudget` | `supply-assembly.ts:23-45` | stable 1000 / dynamic 600 / oneshot 200 / serendipity 0 / situation 0 |
| C MCL | `mcl.ts` cfg | `budgetChars=600`（独立，不入 total） |
| D 情境槽 | 注册表 | `budgetChars=300`（独立） |

⇒ **A 与 B 对同一批候选给出不同账**；且 B 是"影子账"，其 `kept`/`dropped` **不进注入面**（`panel-shared.ts:375-381` 头注自认：*"影子账是近似值，不是主路径的真实裁切结果"*），只有 `blocks.situation` 被并入（`:712`）。

### 2.7 装配器的实际地位【读码 + 审计工具】

`supply-assembly` 的完整能力（五槽、`core` 必进、溢出记账）**只用于 `usage` 诊断**；主路径的文本仍由 `buildHotMemoryText` 手写拼接。⇒ **"把检索 top-k 升为预算内最小充分集"这一设计目标，目前只落在诊断面，未落在注入面。**

**扇入实测**：
- 【读码·grep】`supply-assembly` 在 `src/` 内**唯一消费者** = `panel-shared.ts:21`（调用点 `:389`）；其余引用只在 `scripts/`（`supply-preview.mjs`、`test-supply-assembly.mjs`）。
- 【审计工具】`audit-architecture.mjs` 输出：`supply-assembly` **L5 · 扇入 1 · 扇出 3**；`supply-ledger` **L5 · 扇入 1**；`ring-supply` **L3 · 扇入 2**；`situation-key` **L2 · 扇入 2**；`ring-commit` **L4 · 扇入 3 · 扇出 6**。**两法独立吻合**。

> ⚠ **第三种口径失真**：`scripts/check-arch-sync.mjs:257` 把 `supply-assembly` 记为「**已接线**（P0a）」，`scripts/audit-architecture.mjs:254-257` 同述。但**"接线"当前的定义只要求"被 import 且被调用过"**，不要求"输出真的进注入面"——于是「影子账接线」被记成「装配能力上线」。
> ⇒ 机检须补一条正面断言：**模块的关键输出是否有路径抵达最终注入文本**（而不仅是"被调用"）。这正是 `anthropomorphic-plan` §3.2「所有架构门都是负面约束」所指空缺的消费侧版本。

**写侧→读侧依赖的定性**【审计工具】：`ring-commit.ts:31` 从 `ring-supply.ts` 导入 `serializeCues`。分层实测 `ring-commit` **L4** 依赖 `ring-supply` **L3** ⇒ **L4→L3 属下行依赖，不违反分层**（`audit-architecture` 报循环 0、隐藏环 0）。⇒ 定性为**语义耦合**（写侧复用读侧的 cue 序列化），非违规；但 cue 的**单一实现**因此横跨两个语义层，注册表化时应留意。

---

## 3. 结构性诊断（缺口 → 后果）

| # | 缺口 | 代码/数据证据 | 后果 |
|---|---|---|---|
| G1 | **环记录无内容召回入口** | 105 条 `file=''`（§1.2）+ `readCarrier` 只读 md | 经历型信息（决策/后果/承诺/关系）**在第一步不可见**，只能靠 3 条情境槽 |
| G2 | **情境槽额度与库规模脱钩** | 105 条环记录 vs `topN=3` / 300 字符 | **命中率天花板 ≈3%**；episode 81 条几乎不可能被选中 |
| G3 | **无检索停止准则** | 全链路无收益记账；`recallIndex`/`recallRanked` 只返回 top-k；【实测】step1 中 **49.3%** 的 turn 记忆零贡献 | 无法回答"线索变弱了没有"；与人类边际价值停止机制（`human-task-loop` §1.3）背离 |
| G4 | **分流判据单维，且第二道门吃掉 11 倍流量** | 【实测】`sim≥0.55` 通过 **238/936 = 25.4%**，而实际 `channel=fast` 仅 **26/1120 = 2.3%** —— 差距全在 `hasHighConf`（`mcl.ts:488`，要求 `mclGate` 标签） | 快通道名义 25.4% / 实际 2.3%；且只有"熟不熟"一个判据，无"环境是否有规律 / 有无反馈"两条件（Kahneman & Klein）⇒ 快判**不可核验** |
| G5 | **三套预算 + 两套装配** | §2.6 §2.7 | 预算口径漂移；装配器核心输出空转；`levelCaps` 与字符预算互相遮蔽 |
| G6 | **数据面口径不一** | 主库 md 与知识区 md 内容不同；`_memory/` 又有第三份 | "哪份是活体"须靠代码推导（`memoryRootOf` vs `knowledgeRoot`），人读不可判 |
| G7 | **假可控旋钮风险** | 注册表 note 已自认 `alphaVal` 为"恒 0 的假旋钮"并放弃 | 若再把"情境命中"做成打分权重而非**独立槽**，会重蹈覆辙 |
| G8 | **承诺/到期无消费** | `commitment` 3 条 + `dueRank` 仅用于槽内排序 | 前瞻记忆（"欠谁什么、何时到期"）**不产生主动提醒** |
| G9 | ~~审计口径不闭合 + 写入停滞~~ **→ v2 订正：审计面已迁移，未断流** | 【实测】`mcl-audit.jsonl`（冻结遗留，1,120 条）缺 `channel` 184 条（16.4%）；**当前源 `ledger.jsonl`** 含 `mcl-step` **426 条**、**当日 206 条**、`lastMclAt=09-14T12:14` | **分流链在跑**。真实缺口有二：① **历史审计的分母口径分裂在两个文件**（冻结 1,120 条 + 现行 426 条），跨期统计须先合流；② `mcl-audit.jsonl` 的 184 条无 `channel` 仍未闭合，但它**已不是当前源**，优先级下调 |
| G10 | **「接线」判据只认 import 不认抵达** | `check-arch-sync.mjs:257` 记 `supply-assembly` 已接线；实测其核心输出只进诊断面（§2.7） | 架构门报"已接线"，消费面实际未变 ⇒ **假绿**（与仓内 `test-inject-cache` 型假绿同族） |

> **G9 的教训（保留在案）**：本方案 v1 据 `mcl-audit.jsonl` mtime 停在 09-13、而 `warm-recall.json` 已更新到 09-14，推断"审计 write 静默失败"。**v2 经读码（`mcl.ts:315-323`）+ 实测（`ledger.jsonl` 当日 206 条）推翻**：不是失败，是**审计源迁移**。⇒ 与 AGENTS.md 所载"环境侧事实会自己变化，文档里的'已知问题'必须复验"同一条教训：**判断前先确认自己读的是不是当前事实源**。

---

## 4. 目标结构：按「消费维度」重切，而不是按「存储载体」

### 4.1 轴心决策【判读】

现状把信息按**存储载体**分（md 索引 / md 画像 / Record / 环记录），于是消费侧被迫为每种载体写一条通路。**重梳理的轴心 = 改按「消费维度」分类**：

| 消费面 | 定义 | 成员 | 选行判据 | 预算 |
|---|---|---|---|---|
| **内容面（Content）** | **有 md 投影**、可与任务文本比对的稳态知识 | 索引行（fact/procedure）+ 画像行（persona）+ 笔记正文 | 分层准入 → 相关性/新鲜度 | 一条预算 |
| **经历面（Episode）** | **无 md 投影**、只在特定情境下才有意义的经历 | episode / decision / outcome / valence / relation / commitment / association | **情境键命中 + 承诺到期** | **独立预算** |
| **时态面（Temporal）** | 与生命周期正交的失效 | fact 的 `validFrom/validTo` | `isLive` 判定（已单一实现） | 无（过滤） |

> 这不是发明新架构——**`supply-assembly` 的槽位设计已经隐含了这个轴**（`stable/dynamic/oneshot` = 内容面；`situation` = 经历面）。本方案要做的是**把这个轴变成唯一的口径**，而不是让五条通路各说各话。

### 4.2 内容面：一次准入、一份预算

1. **准入单一实现**：保留 `indexRowInLayer/isProfileRow`（`targets.ts:294-306`）为唯一判据，**通路 (1)(2) 合并为一个 `assembleContent` 调用**：把 P 层 always 归 `core/stable`、其余按相关性归 `dynamic`。
2. **预算单一实现**：采用 `SupplyBudget`（B）作为唯一预算类型，`panel-shared` **不再手写三层切分**（A 退役），避免两账不一。
3. **装配单一实现**：主路径文本改由 `renderSupplyText` 产出（**受控变更**：先解决头部/块标题/`- ` 前缀/段序/省略文案五处差异，`panel-shared.ts:375-381` 已登记该前置条件）。
4. **保留既有不变量**：恒定面「必在 + 安全带」、被裁**留痕可见化**、`core` 超预算也进。

### 4.3 经历面：从「一条缝」升为「一等面」

1. **预算与库规模挂钩**：`situation.budgetChars` / `topN` 不再硬编码小数，改为按**该库活体环记录数**取档（`topN = clamp(ceil(√N),3,12)` 量级），并**留回滚值**。
2. **选行扩展为两路**：
   - **情境路**（已有）：四维 cue 命中。
   - **前瞻路**（新增判据，零新采集）：`commitment` 的 `due` 到/临近 ⇒ **主动提**（前瞻记忆的多进程框架要求线索驱动，但"到期"本身即线索）。
3. **呈现为叙事而非行**：已有 `deepsleep` 的 `narratives` 通道（把 decision→outcome 串成带时间的因果短叙）⇒ 经历面优先给**叙事**，行级只作兜底。
4. **可核验**：每条入选必须带 `why`（`cue` / `fallback` / `due`，`ring-supply.ts:108-113` 已有字段）+ 命中键 ⇒ 面板可复核「凭什么进」。

### 4.4 检索侧：把「停止准则」变成可校准参数

依据 `human-task-loop` §1.3（边际价值定理 + 停止阈值可在线校准）：

1. **收益记账（零新采集）**：复用 `audit/ledger.jsonl`（已是当前审计源，含 `mcl-step` 426 条）+ `warm-recall.json`，为每次召回记 `{query, 命中数, 是否被采纳, 后续是否重查}`。
2. **斑块切换判据**：同一来源（文件/环）连续 N 次零增益 ⇒ 换向（对应"离开斑块"）。
3. **阈值在线校准**：`familiarThreshold` 已两次人工重校准（0.65 → 0.58 → 0.55，【注册表】有分位数依据）⇒ 下一步把它做成**由收益反馈驱动**的量，人工只设边界。

### 4.5 分流侧：两条件判据（替代单维 sim）

依据 §3-G4（Kahneman & Klein 2009）：

```
fast  ⇐  sim ≥ 阈值  AND  hasHighConf           （现状：只这两条，实际仅 2.3%）
       AND  条件① 环境有规律：该任务类型历史成功率 ≥ 阈值（可由 decision-ring 派生）
       AND  条件② 有反馈机会：该情境下曾收到过结果回收（曾有 outcome 写回）
```

⇒ 缺任一条件即**强制走慢通道**，且**判据可观测**（面板可显示"为什么这次不快判"）。

---

## 5. 施工卡（分批，每批可独立验收）

> 纪律：① I1 棘轮已顶格（`applyForgetOps` = 120/120）⇒ **新逻辑必须进新函数**；② 新机检/测试必须登记 `scripts/check-runner.mjs#CHECKS`；③ 每批收尾走 AGENTS.md 规则 7 六条口径。

| 批 | 内容 | 主要改动面 | 验收 |
|---|---|---|---|
| **A1** | **口径统一**：`panel-shared` 三层切分改调 `SupplyBudget`（A→B 退役） | `panel-shared.ts` · `supply-assembly.ts` | 预算账与注入文本**逐字节**可比；单测钉死 |
| **A2** | **装配接管（受控）**：主路径文本改由 `renderSupplyText` 产出，先解决五处差异 | `panel-shared.ts` · `supply-assembly.ts` | 差异清单逐项决策留痕；前后文本 diff 审计 |
| **A3** | **补正面断言**：机检新增「模块关键输出是否抵达注入文本」（回应 G10） | `check-arch-sync.mjs` 或新机检 | 用 `supply-assembly` 当前状态做**反例**（应报"输出未抵达"） |
| **B1** | **经历面升格**：`situation` 预算/`topN` 与环记录数挂钩 + 前瞻路（due 主动提） | `criteria.json` · `ring-supply.ts` · `panel-shared.ts` | 情境槽入选率实测；每条带 `why` |
| **B2** | **叙事优先**：经历面优先出 `deepsleep` 叙事，行级兜底 | `deepsleep-*` · `ring-supply.ts` | 面板可见因果短叙；无叙事时行为不变 |
| **C1** | **收益记账**：召回收益落 `ledger`，产出「零增益次数」 | `mcl.ts` · `vec.ts` · `supply-ledger.ts` | 新审计字段；历史数据可回算 |
| **C2** | **停止准则**：斑块切换判据 + 阈值校准脚本 | `mcl.ts` · 新 `scripts/calib-*.mjs` | 校准前后快/慢比与零贡献率对比 |
| **D1** | **两条件分流**：`fast` 增加条件①②（由环数据派生） | `mcl.ts` · `decision-ring.ts` | 面板可解释"为何不快判"；回滚开关 |
| **E1** | **数据面去歧义**：三处索引文件的主从关系写进注册表 + 面板显示"当前活体根" | `targets.ts` · `panel-config.ts` · 注册表 | 面板一处可见；文档与代码一致 |
| **E2** | **审计面合流**：冻结的 `mcl-audit.jsonl` 与现行 `ledger.jsonl` 的跨期统计口径固定（回应 G9） | 新 `scripts/` 统计件 + 文档 | 一份命令出全域分流指标；两源不重复计数 |

**回滚总则**：每批各留一个**全局热开关**（照 `mclMaterialInSystem` / `situation.enabled` 先例），缺省值须保证**行为零变化**。

---

## 6. 与上游方案档的关系（不重复造）

| 上游资产 | 本方案如何对待 |
|---|---|
| `anthropomorphic-plan` §4.3 线 A（`ring-supply` 新模块） | **已落地**（代码已接线，审计工具实测 L3 扇入 2）⇒ 本方案**不再新建**，只升级其预算与选行 |
| 同档 线 B（写侧 6 通道） | 不涉及（本方案只动读侧） |
| 同档 线 C（`situation-key`） | **已落地**（L2 扇入 2）⇒ 复用为情境面唯一键实现 |
| 同档 线 D（D1 快通道 / D2 慢通道 / D3 阈值 / D4 价态） | D3 已执行（0.55）；**D1 未落实**（`hasHighConf` 未放宽）⇒ 本方案 §4.5 用"两条件"替代"放宽" |
| 同档 40 项缺陷登记 | 本方案 §3 的 G1–G10 是**其中的消费链条子集**，编号不冲突 |
| `context-supply-plan`（G0–G4） | G4 读侧装配已落地但未接管主路径（§2.7）⇒ 本方案 A1/A2 即其收尾 |

---

## 7. 待补与未确认

- ✅ **已回填（本次独立实测）**：`audit/mcl-audit.jsonl`（冻结）1,120 条 · channel = slow 910 / fast 26 / 缺失 184 · sim n=936（p50 .513 / ≥0.55 = 25.4% / ≥0.58 = 9.3%）· step1 `injected>0` = 105/213（49.3%）。
- ✅ **已订正（v2）**：审计**未断流** —— 当前源为 `ledger.jsonl`（`mcl-step` 426 条、当日 206 条）。v1 的"静默失败"推断**错误**，理由见 §3-G9 教训框。
- ✅ **已回填**：`supply-assembly` 扇入 = **1**（`panel-shared.ts:21`）；审计工具独立复核 L5/扇入 1。`ring-commit → ring-supply` 为 **L4→L3 下行，非分层违规**。
- ⚠️ **待确认**：`criteria.json` 中 `value` 环已补进 `ringOrder`，但 `ringOfKind` 对 `valence` 的归属与 `dueRank` 的到期语义是否覆盖"承诺到期"**未逐行核对**（B1 开工前须先读 `ring-supply` 全文 + `relation-ring` 的 `due` 字段）。
- ⚠️ 施工卡 A2 的"五处差异"逐项内容需在开工前先出清单（`panel-shared.ts:375-381` 只给了条目名）。
- ⚠️ B1 的 `topN` 档位公式为**本文判读**，须先用历史审计数据回算命中率后再定。

---

_建立 2026-09-14 · v2 订正版 · 作者：本会话（架构级重梳理）。上游三份研究/方案档见文首。本文为**方案**，施工前须按 AGENTS.md 规则 7 走方案确认门。_
