# 守藏拟人化：诊断 · 架构审查 · 扩展方案（2026-09-14 · 合并定稿）

> **本文件合并并取代以下三份**（原件已删除，内容全部并入本文）：
> `docs/anthropomorphic-memory-gap-2026-09-14.md`（缺口分析）· `docs/anthropomorphic-extension-plan-2026-09-14.md`（扩展方案 v4）· `docs/architecture-review-2026-09-14.md`（架构审查）
>
> **本文正文只写最终结论**；我在过程中犯过的错（含 2 处方向性错误）如实归入 §13 修订记录，不藏在正文里。
>
> **证据标注**：【实测】= 本次运行脚本/命令所得 ·【读码】= 读源码所得 ·【文献】= 权威出版物 ·【判读】= 我的判断。
> 关联：`docs/ARCHITECTURE.md`（现行架构叙述）· `docs/context-supply-plan.md`（G0–G4 落地档）· `docs/agent-reflection-research.md`（2026-09-09 睡眠↔业界）· `docs/cognition-mapping-landing-plan.md`（13 项机制对照）。

---

## 0. 结论摘要（一页话）

| # | 结论 | 依据 |
|---|---|---|
| 1 | **信息类型不必再加，缺的是类型的「活体」**。类型表（5 环 18 kind + 15 标签 × 3 层）比多数商用记忆系统完备；但 980 条记录中**带环语义的仅 9 条，且 9/9 无 md 投影 ⇒ 活注入面结构上不可达**。真正活着的只有 `fact`(240) + `persona`(25) = **静态知识与静态自述** | §2.1 |
| 2 | **「记忆 + 双画像」不足以承担拟人**。它等于一个人的**静态自述**，缺**经历及其回流**（决定过什么/后果如何/在意什么/欠谁什么/何种情境下如何判断）。形态上更接近"博学、自我描述清晰、但没有经历" | §2.3 §2.4 |
| 3 | **你的直觉被文献逐条支持**：「基础认知恒定」≈ 图式/CLS 皮层慢系统；「按事件与状况才调用」≈ 编码特异性与情境依赖提取；「睡眠总结规律」≈ 睡眠抽取 hidden regularities。**当前只实现了第一条的静态清单版** | §2.2 |
| 4 | **最根本的缺口：召回靠内容相似度，不靠情境匹配**。而 `audit-architecture` 实测**所有架构门都是「负面约束」**（不许有环/桥/超长），**没有一道门问「这个模块有没有人用」** | §2.4 §3.2 |
| 5 | **架构设计本身不需要调整**（骨架一行未动）；需要同步的是架构的**「账」**（三处失真）与**判定方向**（补正面断言） | §3 §8 |
| 6 | **最高杠杆的一条改动**：给 `audit-architecture.mjs` 加一道「扇入 0 必须申报」的判定——**零新脚本**，立刻抓到 2 个实缺陷 | §7 §3.2 |

---

## 1. 硬边界：本方案必须守的不变量

| # | 不变量 | 机检件 | 本方案如何满足 |
|---|---|---|---|
| B1 | 依赖窄传：Deps ≤12 字段，分组后每组 ≤8 | `audit-wiring`（I2 棘轮） | 新模块 Deps ≤6 |
| B2 | 模块只暴露 `createXxxApi(d)`；实现函数模块级 | 仓内约定 | 同形 |
| B3 | composition root 唯一；**禁止新增惰性桥** | `check-bridges`（目标边数 0，**当前已达成**） | 句柄显式传递 |
| B4 | 判据唯一事实源 = `criteria.json`；投影禁手写 | `gen-criteria` / `check-criteria` | 新参数全进注册表 |
| B5 | 可注入载体必须有渲染器；**P 层必须 always**（P+gated 非法） | `check-carriers` ①② | 新增一律 E+gated，不碰 P |
| B6 | 环归属只在 `RING_OF_KIND` 一处；每环必须有 KPI | `check-ring-coverage` | 不新增环/kind |
| B7 | 行为级测试/机检必须登记 `check-runner.mjs#CHECKS` | 仓规则 6 | 全部登记 |
| B8 | 零硬编码本机路径 | `check-hardcode` | 情境键从 Record 字段派生 |
| B9 | **I1 棘轮已顶格**：`applyForgetOps` = 120/120 | `audit-wiring` I1 | 新代码**必须进新函数**，不得塞进已有装配函数 |
| B10 | 不从零造轮子 / 零新增依赖 | 仓核心原则 | 全部复用仓内既有纯函数与 DSH 原生扩展点 |

---

## 2. 诊断

### 2.1 实测事实（先看数据）

**① Record 事实源真实分布**（`~/.dsh/skills/managing-memory/.records/records.jsonl`，980 条）【实测】

| kind | 条数 | 可注入 | 说明 |
|---|---|---|---|
| prose / blank / structure | 425 / 139 / 137 | 否 | 结构与非内容 |
| **fact** | **240** | ✅ | 索引行——注入面主力 |
| **persona** | **25** | ✅ | 画像行 |
| procedure | 5 | ✅ | `[路径]` |
| commitment / association / decision / outcome / valence / relation | 3 / 2 / 1 / 1 / 1 / 1 | ❌ | **全部 `file=''`** |
| **episode / principle / preference** | **0 / 0 / 0** | — | 登记了，无数据 |

**环语义记录合计 9 条（0.9%），9/9 无 md 投影。**

**② `file=''` 的真实语义 = 「无 md 投影」，不是「不可注入」**【读码】

`record-store.ts#kindOfLine` 只从 md 行派生 kind（`P→persona` / `R→procedure` / 其余带标签→`fact` / 无标签 `- `→`prose`），
故 **decision/outcome/valence/relation/commitment/association/episode 七类永不可能由 md 行产生**，只能由环 API `makeRecord({kind})` 造出，**必然 `file=''`**。这是「Record ⊃ md」的必然结构，见 `record-store.ts:21-23` 的设计自述。

**③ 活注入路径读的是 md 文件，不是 Record**【读码】

`panel-shared.ts:365-370#readCarrier` = `readFileSync(join(memRoot, name))` 直接读 3 个 md 文件。
⇒ **环记录无 md 投影 ⇒ 活注入面结构上不可达。**（比"被某个过滤器挡掉"更强）

**④ 活路径的判据 vs 离线工具的判据是两套**【读码 + 实测】

- 活路径：`panel-shared#readCarrier` + 自有 `rowCaps` / `totalBudget`
- `supply-assembly`（G4 读侧装配）：**`src/` 内扇入 0**，唯一消费者 `scripts/supply-preview.mjs`（离线 CLI）
- `record-address`（M2 寻址）：**`src/` 内扇入 0**，唯一消费者 `scripts/test-record-store.mjs`（单测）
- 环记录生产者：唯一 `scripts/record-ring.mjs`（CLI）

⇒ **同一模式：能力在 CLI 里活着，在运行时里缺席。** 见 §3.2。

**⑤ MCL 认知环真实分流**（`audit/mcl-audit.jsonl`，1120 条）【实测】

| 指标 | 实测 |
|---|---|
| step 分布 | step1 **213** · step>1 907 |
| **step1 中实际注入材料（injected>0）** | **105 = 49.3%** ⇒ **约一半 turn 首步，记忆零贡献** |
| **快通道** | step1 有 channel 者 158 中 `fast=26` ⇒ **16.5%**（注册表预期 27.5%；自承 `hasHighConf` 未放宽） |
| sim 分布 | min .362 / p50 **.513** / p75 .561 / p90 **.575** / max .662 |
| ≥0.58（现行阈值）占比 | **9.3%** |
| `channel` 缺失 | **184 条** ⇒ 通道统计口径不闭合 |

**⑥ 睡眠链旁证**【实测】

- `check.sleep` 107 次；`layerCounts` 从 P{12,2}/R{1,0}/E{45,7} 成长为 P{19,6}/R{5,0}/E{67,24} —— **巩固链在动**。
- 但 `closureOk` **107/107 全为 false**；timer 型大量 `"skipped":["criteria","carriers","layering","shadow"]` —— 审计**无法区分「未跑」与「通过」**。
- `shadowCorr` 稳定 **−0.33**（importance 与 relevance 负相关）。
- `decision.ingest` 中 137 条 `below-min-chars`，**多数字符数为 0** —— ingest 被无内容事件反复触发。

**⑦ 数据面闲置**【实测】

- `audit/episodes.jsonl` 257 条，字段 `at,sid,intent,route,fclass,llm,outcome,added,rejected,failed,lib` —— **现成的会话级情景 + 成败信号**；`src/` 内**无任何代码写它**（生产者已移除），ledger 中 `type=episode` 事件 **0** ⇒ **孤儿数据**。
- `pending/` 6 件积压 · `whitelist.json.orphan-20260911` 残留 · `notes/release.md` 0 节 · `notes/INDEX.md` 17.2KB/172 条。

### 2.2 文献对照：构成「人」的信息类型

**【文献 · 记忆系统分类】** [Squire 1996 PNAS](https://www.pnas.org/doi/10.1073/pnas.93.24.13515) · [Squire 1992 JOCN](https://doi.org/10.1162/jocn.1992.4.3.232)

- **陈述性**：情景（带时空与人称）＋ 语义（去情境事实）
- **非陈述性**：程序性技能、启动效应（priming）、条件化、习惯化

**【文献 · 互补学习系统 CLS 与图式】** [McClelland et al. 1995](https://cseweb.ucsd.edu/~gary/258/jay.pdf) · [Kumaran/Hassabis/McClelland 2016（修订版）](http://stanford.edu/~jlmcc/papers/KumaranHassabisMcClelland16FinalMS.pdf) · [Nat Neurosci 2023](https://www.nature.com/articles/s41593-023-01382-9) · [Schema 依赖连接 PNAS 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC2867741/) · [TiCS 2012](https://www.sciencedirect.com/science/article/abs/pii/S0166223612000197)

- 海马＝快/稀疏/模式分离（记具体）↔ 新皮层＝慢/重叠/抽统计结构（记语义）；睡眠重放完成迁移。
- **2016 修订版明确纳入「情境依赖提取（context-dependent retrieval）」**——本文的直接理论支点。
- 与图式一致的信息经 mPFC **快速整合** ⇒ **图式的用途是加速编码，不是被无穷枚举**。

**【文献 · 编码特异性（最关键）】** [Roediger/Tekin/Uner 2017 综述](http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Roediger_Tekin_Uner_2017.pdf) · [Fisher & Craik 1977](https://www.rotman-baycrest.on.ca/files/publicationmodule/@random45f5724eba2f8/JExptlPsycholHLM77_3_701.pdf)

> **提取成功取决于「编码情境」与「提取线索」的匹配，而非内容相似度。**

⇒ 要记的不只是内容，还有**「在什么情境下该想起它」**；召回入口应以**情境特征**（在哪、在做什么、涉及谁、什么情绪）为线索。

**【文献 · 前瞻记忆（人类最易被忽略的一类）】** [Nature Rev Psych 2022](https://preview-www.nature.com/articles/s44159-022-00121-4) · [Frontiers 2015 多过程框架](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2015.00392/full)

- 前瞻记忆＝对**将来意图**的记忆（"见到 X 就做 Y"）；区分**线索驱动的自动提取**与**战略监控**。
- **纯战略监控在高负荷下系统性失败** ⇒ 意图必须**形成时**落库，并由线索自动提醒。

**【文献 · 睡眠抽的是「规律」】** [Wagner 2004 Nature](https://www.nature.com/articles/nature02223) · [Hidden regularities 系统综述](https://pmc.ncbi.nlm.nih.gov/articles/PMC6779511/) · [PLoS One 2013 语法规则](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0065046) · [Staresina 2024 TiCS](https://www.sciencedirect.com/science/article/pii/S1364661324000299) · [Frontiers 2025 SWS](https://www.frontiersin.org/journals/behavioral-neuroscience/articles/10.3389/fnbeh.2025.1620544/full) · [eLife SO–spindle meta](https://elifesciences.org/reviewed-preprints/101992) · [Comm Biol 2025 SWS vs REM](https://www.nature.com/articles/s42003-025-08812-3)

- 睡眠使人**获得显式规则**（mental restructuring）并抽取**隐藏规律/语法结构**——是**关系与规则结构**，不是一句格言。
- 机制＝慢振荡–纺锤–涟漪**时序耦合**驱动重放；**SWS 偏表征转化、REM 偏规则抽象**。

**【文献 · 元认知（"感觉快想起来了"是检索的控制信号）】** [Koriat 1993 Psych Review](https://psycnet.apa.org/doiLanding?doi=10.1037/0033-295X.100.4.609) · [Koriat & Levy-Sadot 2001](https://newiipdm.haifa.ac.il/wp-content/uploads/2015/05/2001-KorLevySadot-JEPLMC.pdf)

- 知道感（FOK）由**线索熟悉度 + 已可及信息量**决定，作用是**决定是否继续检索**（双向）。

**【文献 · 事件粒度与叙事身份】** [Zacks & Tversky EST](https://pmc.ncbi.nlm.nih.gov/articles/PMC2852534/) · [Radvansky & Zacks 2017](https://bpb-us-e2.wpmucdn.com/sites.wustl.edu/dist/e/952/files/2017/09/Radvansky_Zacks_2017_Event-boundaries-in-memory-and-cognition-wn268l.pdf) · [McAdams 2001](https://journals.sagepub.com/doi/10.1037/1089-2680.5.2.100) · [McAdams 2013](https://journals.sagepub.com/doi/10.1177/1745691612464657)

- 人按**事件边界**切分与编码经验（边界处记忆最强）。
- **人格自我三层**：actor（特质/习惯）· agent（目标/动机/意图）· author（把经历整合成**连贯叙事**）。

**【文献 · LLM Agent 记忆横向参照】** [From Human Memory to AI Memory](https://arxiv.org/html/2504.15965v1) · [Rethinking Memory in LLM-based Agents](https://arxiv.org/html/2505.00675v3) · [A-MEM](https://medium.com/advancedai/a-mem-pros-and-cons-of-a-new-memory-system-for-llm-agents-9546bb5773b9)

- 主流系统与守藏同构（append-only + 向量检索 + 反思归纳）；**没有一家在"情境线索驱动提取"上做得比人类认知模型更完整**——这是行业空白，非守藏独有欠债。
- 与 `docs/agent-reflection-research.md` 一致：Markdown 文件库的载体选择站得住（Letta「Is a Filesystem All You Need?」LoCoMo 74.0% > Mem0 68.5%）。

### 2.3 「信息类型是否足够」——逐类裁决

| 人类信息类型 | 守藏载体 | 类型表 | 数据面 | 注入面 | 裁决 |
|---|---|---|---|---|---|
| 语义事实 | MEMORY 索引 + notes | ✅ | 240 | ✅ | **足** |
| 程序性技能 | `[路径]` R 层 | ✅ | 5 | ✅（门控） | 薄但通路在 |
| 自我/用户图式（**actor** 层：特质/习惯/偏好/边界） | AGENT/USER 索引 + 画像行 | ✅ | 25 | ✅ | **足** |
| **目标/动机/意图（agent 层）** | commitment + 部分 `[路径]` | ✅ | 3 | ❌ | **缺生产者 + 缺通道** |
| 时态事实（会失效） | `validFrom/validTo` + `isLive` | ✅ | — | ✅ | **足**（少见的好设计） |
| 元认知熟悉度 | MCL 阈值分流 | ✅ | 审计可见 | ✅ | 有，但单向 |
| 内隐启动 | maturation `A<gate` 参与打分不注入 | ✅ | — | ✅ | **足**（设计正确） |
| 联想/直觉 | association 环 + 向量候选 | ✅ | 2 | ⚠️ 需显式工具 | 有雏形 |
| **情景记忆** | episode | ✅ | **0** | ❌ | **缺生产者 + 缺通道** |
| **前瞻记忆（意图）** | commitment | ✅ | 3 | ❌ | **缺生产者 + 缺通道** |
| **关系/社会记忆** | relation | ✅ | 1 | ❌ | 同上 |
| **决策-后果闭环** | decision/outcome | ✅ | 1/1 | ❌ | 同上 |
| **价态/显著性情调** | valence | ✅ | 1 | ❌ + 打分无 valence 项 | 同上 |
| **叙事身份（author）** | — | ❌ | — | — | **唯一真正缺的类型** |

**⇒ 作为知识库足够；作为「人」，六类关键内容"有登记、无活体"。再往类型表加条目只会让表更漂亮、数据更空。**

> **用 McAdams 三层收束（§2.2）——这是对「双画像是否够」的直接回答**：
> **双画像只覆盖 `actor` 层**（特质/习惯/偏好/边界，25 条 persona 全是这一层）；
> **`agent` 层**（目标/动机/意图）名义上有 `commitment` 承载但**只有 3 条且零注入**；
> **`author` 层**（把经历整合成连贯叙事）**完全没有**。
> ⇒ **「记忆 + 双画像」= 一个人的静态自述；缺的是经历（agent 层的意图闭环 + author 层的叙事整合）。**

### 2.4 召回注入节点清单，以及与人差在哪

| # | 节点 | 挂点 | 时机 | 内容 |
|---|---|---|---|---|
| 1 | 热记忆 | `systemPrompt.context` **order 88** | 每次请求装配 | 双画像索引行 + 画像行 ≤6/档 + 知识索引（相关 top-k ≤600）+ 成长 delta ≤200 |
| 2 | MCL 慢通道材料 | `systemPrompt.context` **order 89** | 慢通道首步 | ≤600 字符「薄契约 + top-k 指针」 |
| 3 | MCL 分流 | `agent/pre-step` 钩子 | turn 首步 | 熟悉度 ≥.58 且 `mclGate` 标签 → 快（零材料）/ 慢（注材料 + 最多 1 次再引导） |
| 4 | 主动召回 | 工具 `shoucang_recall` / `shoucang_associate` | 模型自愿 | 词法 top-k 薄行 / 向量"异域同构"候选 |
| 5 | 编码期 | `session/event` → `turn/end` → 蒸馏子代理 | 会话停滞 | 写库（非召回） |
| 6 | 离线重放 | 深睡归纳 pass | 全会话停滞 ≥3h | 归纳 `[原则]`/`[路径]`/画像/遗忘（非召回） |
| — | 宿主级 | `~/.dsh/AGENTS.md` | 每轮 | 插件外 |

**像人的部分**：③ 熟悉度分流 ≈ Koriat 线索熟悉度启发式（全局最拟人处）· ④ 有意检索 · ⑥ 离线重放 · 内隐启动（maturation 有意识地"不注入"）——这个设计判断相当准确 · 时态双时间戳（**比人类更强**，人类压制旧记忆靠干扰而非结构）。

**不像人的部分（结构性）**：

| # | 差距 | 实测/读码依据 |
|---|---|---|
| 1 | **恒定灌注 vs 图式可及**：节点 1 每轮渲染全量清单；人类是"长期可及但只有一小部分被激活" | 见 §8 预算口径 |
| 2 | **内容相似 ≠ 情境匹配**：门控与打分都是 `query(任务文本) ↔ 索引行` 的余弦 | 编码特异性【文献】 |
| 3 | **快通道偏弱**：16.5%（预期 27.5%），被 `hasHighConf` 压 | 【实测】 |
| 4 | **约一半 turn 首步零材料**：49.3% 才有注入 | 【实测】 |
| 5 | **无"没找到"信号**：低于阈值即静默放行、不回报置信度 | vs FOK 双向【文献】 |
| 6 | **无价态调制**：打分只有 relevance/importance/recency | valence 记录恰不可注入 |
| 7 | **事件粒度错位**：编码按会话窗/idle 3h，非事件边界 | EST【文献】 |
| 8 | **意图不自动提醒**：全靠模型主动调工具 = 纯战略监控 | 前瞻记忆多过程框架【文献】 |

---

## 3. 项目架构审查（实测量）

### 3.1 硬指标：全绿

| 机检件 | 结果 | 读数 |
|---|---|---|
| `audit-architecture.mjs` | ✅ | **61 模块 · 14,422 行 · 深度 10 · 静态循环依赖 0 · 动态边隐藏环 0** |
| `check-bridges.mjs` | ✅ PASS | 发布侧 **0** · 消费侧 **0** · 桥模块 **0**（composition root 迁移完成） |
| `audit-wiring.mjs` | ✅ 全绿 | I1：14 个装配函数全 ≤120；I2：29 个作用域对象全 ≤12 字段 |
| `audit-fnspan.mjs` | ✅ | **>400 行函数 0 个**；最大 `deepsleep-tree#consolidateTree` 350 |
| `check-srcmap.mjs` | ✅ | 61 模块 `src↔lib` 导出零漂移 |
| `check-runner.mjs` | ✅ PASS | **65 pass · 1 xfail · 0 skip**（xfail = `test-treeops-rm.mjs`，显式可见） |
| `check-deploy-sync.mjs` | ✅ PASS | 161 件：一致 82 · 库内缺失 79（未部署，非错误）· **不一致 0** |

**⇒ 架构纪律层健康，且真的由机器守。应先承认这一点。**
`composition.ts`（88 行）尤其干净：把原 3 条隐式模块级桥变成显式句柄盒，注释写清了"为什么必须包一层 `{current}`"。

### 3.2 核心缺口：门只朝一个方向开

7 件架构机检问的全是**负面问题**：有没有环？有没有桥？行数有没有超？依赖有没有超宽？符号有没有漂移？
**没有一道门问：「这个模块有没有人在用？」**——而 `audit-architecture.mjs` **已经算出了扇入**（它自己打印 `扇入最高: targets(18), criteria.generated(14), vec(12)`），**只是不判定扇入 0**。

**扇入 0 的模块（实测 5 个）**：

| 模块 | 值导出 | 唯一消费者 | 判读 |
|---|---|---|---|
| `index` | 4 | 宿主加载 | ✅ 插件入口，正常 |
| `panel` | 4 | 由 `index` 装配注册 | ✅ 装配入口，正常 |
| `deepsleep-contract` | **0** / 类型 9 | — | ⚠️ **审计口径局限**：纯类型经 `import type` 引，扇入分析不计 ⇒ 直接判"扇入 0 即 FAIL"会误报它 |
| **`supply-assembly`** | 15 | `scripts/supply-preview.mjs`（离线 CLI） | ❌ **运行时缺席** |
| **`record-address`** | 5 | `scripts/test-record-store.mjs`（**单测**） | ❌ **运行时缺席** |

**`record-address` 与 `supply-assembly` 完全同构**：
- `record-address` 自述「**`storeMode=record` 切源的第 2 步**」【读码】，而 `panel-arch.ts:183-187` 明写 `record` **未实现、故不提供**；实测 `scheduler.ts` 配置 `storeMode = "dual"`【实测】
- ⇒ **为一个"已明说暂不提供"的未来模式预先造好了零件**；两者同出 2026-09-13 同一批（G4/M2）

**成因是结构性的，不是疏忽**：

```
造零件（写模块 + 单测 + 加架构清单 + 机检全绿）
   → 无「谁在用」判定（audit-architecture 只打印扇入）
   → 结构完全合法（循环 0 / 桥 0 / 行数达标）
   → 运行时缺席（唯一消费者是 CLI 或单测）
   → 架构视图报「在位」（panel-arch 用 existsSync(lib/x.js)，只断言文件存在）
   → 无人察觉
```

### 3.3 高耦合中心与规模热点

**`targets.ts`：扇入 18（全仓最高）· 484 行 · 35 导出 ⇒ 约 30% 模块依赖它**【实测】

| 它承载的关注点【读码】 | 判读 |
|---|---|
| 路径与家目录（`dshHome`/`knowledgeRoot`/`memoryLibRoot`） | ⚠ **`check-hardcode` 依赖的路径唯一来源，不可拆** |
| **suite 装配矩阵**（`suiteAssemblyMatrix`） | ✅ 单一实现**是刻意架构决策**（AGENTS.md 明载） |
| **载体分层判据**（`carrierTags`/`indexRowInLayer`/…） | ✅ 同上，由 `check-carriers` ⑥ 守 |
| 召回（`recallIndex`/`recallKeyOf`） | ⚠ 可外移 |
| 事件分类判据（`isRealUserEvent`/`taskTextOf`） | ⚠ 可外移 |

**⇒ 这是「内聚（cohesion）失衡」，不是「耦合（coupling）失控」。** 拆分收益清晰，但**要动 18 个扇入，是本仓变更半径最大的一次重构** ⇒ **单独立项，不与拟人化混做**。

**规模热点**【实测 + 读码】：

| 模块 | 行数 | 问题 |
|---|---|---|
| **`treeops.ts`** | **880**（最大） | **两个关注点**：结构整形（`applyTreeOps` 68 行）+ 遗忘归档（`applyForgetOps` **120 行，正好顶 I1 天花板**） |
| **`scheduler.ts`** | **746** | **入口件塞了五个工具定义**（`applyScheduler` 自身仅 29 行） |
| **`panel-shared.ts`** | **704** | **两个关注点**：HTTP 管道 + **热记忆装配**（`buildHotMemoryText` **251 行**） |
| `deepsleep-tree.ts` | 435 | `consolidateTree` **350 行单函数**（全仓最大） |
| `deepsleep-run.ts` | 322 | `runDeepSleep` **293 行单函数** |
| `distill-write.ts` | 448 | `writeDispatch` **172 行单函数** |

**I1 棘轮已顶格（零余量）**：`applyForgetOps` = **120/120**；`registerMcl` 117、`registerDistill` 116。
**⇒ I1 不是「安全网」，是「当前天花板」。** 对本方案的硬约束见 B9。

### 3.4 口径失真（三处）

| 项 | `AGENTS.md` | `docs/ARCHITECTURE.md` | 实测 | 判定 |
|---|---|---|---|---|
| `src/` 模块数 | **60** | **55**（其分项 6+5+15+9+6+3+9 = **53**） | 文件数 **61** · `audit-architecture` **61** · `audit-fnspan` **60** | **AGENTS.md 的 60 不是漂移**（= fnspan 口径，排除 `.generated.`；差 1 = `criteria.generated.ts` 569 行）。**只有 `ARCHITECTURE.md` 55 vs 分项 53 不自洽** |
| 会话注入预算 | — | **3,000 字符** | 注册表 `surface.injection.budgetChars` = **4000**；活路径 `panel-shared.ts:514` = `max(1200, 4000)` | 不一致 |
| 3 条 `-share` 惰性桥 | 已全部退役（`check-bridges` 边数 0） | 「唯一 composition root **亦未做**」 | `src/*-share.ts` = **0 个文件** | **陈旧陈述，与实测相反** |

**根因**：`ARCHITECTURE.md` 开头**自己声明放弃机器兜底**——「不再有『指针过期自动重新生成』……**文档与代码不一致已无机器兜底，属人工纪律**」。而项目其余部分全是门。

**连带**：两个审计脚本应在**输出头标注各自口径**（是否含生成物），否则每次引用都会打架。

### 3.5 架构视观测面的结构性失真

`panel-arch.ts#ARCH_MODULES`（`:42-48`）用 **`existsSync(LIB_DIR + name + '.js')`** 判定模块在位【读码】——**只断言文件存在，不断言被调用** ⇒ **必然**把 `supply-assembly` / `record-address` 报成在位。
`check-installed-features.mjs` 的 31 项同理（文件级标记，末尾输出的是**人工核对清单**）。AGENTS.md 规则 7⑥ 「文件级 sha 一致 ≠ 特性齐全」已承认此点，但**没有门去补这一层**。

---

## 4. 方案：整理 + 扩展

### 4.1 整理第一刀：读侧三段式（语义重划，非结构重写）

当前是两段式，语义上把两种不同的记忆混在一根轴上。整理为：

| 段 | 语义 | 激活方式 | 人类对应物 | 承载 kind |
|---|---|---|---|---|
| ① **图式层** | 我是谁 / 用户是谁 / 边界在哪 | **恒定**（不参与相关竞争） | 自我图式、身份 | persona、principle、`[路径]` |
| ② **知识层** | 跨项目可复用条文 | **内容相关性**（既有 `gated:index`） | 语义记忆（新皮层） | fact |
| ③ **情境层**（新增） | 当前这件事上，我经历过/承诺过/在乎过什么 | **情境键匹配**（cue-driven） | 情景+前瞻记忆+价态（海马） | decision、outcome、relation、commitment、episode、association、valence |

**依据**：编码特异性（提取取决于「编码情境↔提取线索」匹配，非内容相似度）；CLS-2016 纳入 context-dependent retrieval；前瞻记忆多过程框架（纯战略监控系统性失败）⇒ **第③段不应走相似度打分**。

### 4.2 读侧事实源的边界（关键澄清）

`storeMode = "dual"` 已在跑【实测】，且 md 投影是 **Record 的逐字节可重现渲染**（`renderFile` + `check-record-parity` 对账门禁）。

> **⇒ 在 md↔Record 逐字节一致的前提下，「读 md 投影」≈「读 Record 的一个视图」，两者等价。**
> 而环记录 `file=''` 本就是「Record 独有、md 不可承载」的设计产物。

**因此方案不迁移数据源、不重写 `readCarrier`**：

> **读侧事实源 = md 投影（已等价，不动）+ 环记录走独立通道（新增）。**

### 4.3 扩展四条线（全部落在已有点上）

**线 A｜读侧解耦**

- **A1 新模块 `src/ring-supply.ts`**（纯函数、零 IO，与 `association-propose.ts` 同规格）
  `ringCandidates(records, cues, opts)` + `renderRingLine(r)` + `createRingSupplyApi(d)`
  **边界纪律**（照抄 `supply-assembly.ts` 头注先例）：只做**选择 + 渲染**，不做装配、不做重排、**绝不新写打分函数**。
- **A2 `supply-assembly` 加 `situation` 槽**（照抄 `serendipity` 的「独立槽 + 独立预算」先例，**缺省 0**）。
- **A3 `buildCandidates` 判据订正**：`file===''` 且 kind 属环 → 交 `ring-supply`；`file===''` 且无内容 → 仍不可注入。
- **A4 兜底**（防「漏填 cues ⇒ 承诺永不出现」）：`meta.cues` 空者按 **环优先级（commitment/relation > decision > episode > association > valence）→ due 紧迫度 → 新鲜度**排序，有界取数。**排序只此一处**。

**线 B｜写侧接线**（**复用已有 9 op，零新增 op/事件类型**）

> **本方案最强的「不破坏架构」证据**：`ring-events.ts` 的 9 个 op 已完整覆盖需求——
> `decision.open` · `decision.collect` · `valence.record` · `relation.assert` · `commitment.open` · `commitment.settle` · `collision.record` · `collision.accept` · `collision.land`。
> **只需把 `scripts/record-ring.mjs`（CLI）的调用点搬进两条自动产线。**

- **B1 蒸馏（会话→库）+4 通道**

| 通道 | op | 字段 |
|---|---|---|
| `decisions` | `openDecision` | text / **predicted**（后果回收的锚）/ rationale / alternatives |
| `commitments` | `openCommitment` | who / what / direction / due |
| `relations` | `assertRelation` | who / note / level |
| `valences` | `recordValence` | **trigger（情境）** / valence |

每条**必带 `cues`** → 落 `meta.cues`。
改动：`distill.ts:157`（输出契约 + 判据段）、`distill-write.ts#writeDispatch`（分支 → 落 `ring-events.jsonl`）。
⚠ **不纳入 `distill-chunks.ts` 的 segment 指纹**（`:88-110` 用 appends/newIndex 生成 topic）——指纹一变，既有去重语义与水位口径随之漂移。

- **B2 深睡（库→库）+2 通道**

| 通道 | op | 作用 |
|---|---|---|
| `outcomes` | `collectOutcome` | **后果回收**：拿后来的事实回填 `hit`（`decision-ring` 自述「没有后果回收，经历永远只是日志」） |
| `narratives` | 写 `notes/agent.md §经历/<事件名>` 正文 + 造 `episode` 记录（`pointer` 指向该 §） | **author 层**：把窗内 decision→outcome 串成带时间的因果短叙事 |

改动：`deepsleep-core.ts`（提示词）、`deepsleep-run.ts`（enqueue 统计 + apply）、`deepsleep-contract.ts#SleepWrite` 加 `writeRingOps()`（5→6 字段，≤8 ✓）。
⚠ **必须纳入 `attempted` 计算**：`deepsleep-run.ts:126-127 / :290` 已有教训——「纯 profileOps/指针/树/遗忘 轮且全数失败」曾因不进判据被误判 `landed:true`、材料静默丢弃。

- **B3 前提结构化（不新增通道）**：`criteria.json#consolidate.promote.premise` 现为 soft，**升级为可机检**（检查 `[原则]`/`[路径]` 指针目标 § 正文含 `前提：` 行）。
  **这就是文献里睡眠抽的 hidden regularities（if-then 结构），且无需任何新 type。**
- **B4 `episode` 生产者**（真缺口）：由 B2 的 narratives 供给；`episode → fact 环`（既有登记），同时进③情境层。
  ⚠ **不做 kind 归位**（见 §13 修订记录 R3）。

**线 C｜情境指纹（新查询源，`不是`新打分器）**

四维**全部取自已有字段**，零新采集通道：

| 维度 | 来源（已有） |
|---|---|
| 工作区 | `MemRecord.scope`（`workspace:<path>` / `project:<name>` / `global`） |
| 任务型 | `scheduler.ts:563` 已有分类正则（`build/reload/plugin/inject/…`）→ **上移注册表供两处共用** |
| 主体 | `MemRecord.subject`（`user`/`agent`/`knowledge`/`companion:<id>`） |
| 近期事件型 | `ledger.jsonl` 既有 `type` 字段 |

键形如 `scope=workspace:D:/FF/shoucang` · `task=build` · `subject=user` · `event=decision.consolidate`；**匹配 = 交集非空**（确定性、可单测、无向量依赖）。
新模块 `src/situation-key.ts`（纯函数）；调用方 `panel-inject.ts` 与 `mcl.ts` **共用同一实现**（守 `targets.ts:440` 既有纪律）。

**线 D｜元认知与打分**

| 项 | 做法 | 依据 |
|---|---|---|
| D1 快通道独立化 | 高置信 `[路径]`/`[原则]` 命中走**独立触发**，放宽 `hasHighConf`（注册表已标为遗留项） | RPD 识别即行动（仓内自述） |
| D2 慢通道二次检索 + 置信度回报 | 低于阈值时再检索一次（放宽到③层 + 画像小节）并**回报置信度**，而非静默零材料 | Koriat FOK【文献】 |
| D3 阈值重校准 | 按 936 样本分位重定 `familiarThreshold`（现 .58 只覆盖 9.3%），写入注册表并留可回滚值 | 【实测】 |
| D4 价态进打分 | **唯一打分点** `criteria.ts:185#layeredScore` 加 `+ (s.alphaVal ?? 0) * input.valence`；注册表 `surface.score.alphaVal`。**`vec.ts:16` 是该函数唯一消费者（活的）**【实测】 | 情绪显著性是编码/提取强调制项 |
| D5 修 fallback 漂移 | `criteria.ts:185` 的 `?? 0.35` 与注册表 `0.25` 不一致 ⇒ fallback 一律改为**从注册表取**（或删 fallback 强制显式）+ 加机检 | 【实测】 |

### 4.4 明确「不新增」清单（不破坏架构的证明）

- ❌ 不新增 `kind`、不新增环、不新增 ring op、不新增事件流文件
- ❌ 不新增载体标签（叙事走 `notes` 正文 + 既有 `episode` kind）
- ❌ 不新增打分函数 / 召回排序实现
- ❌ 不新增依赖、惰性桥、composition 之外的单例
- ❌ **不迁移读侧数据源、不重写 `readCarrier`**（§4.2）
- ❌ 不改 `distill-chunks` 的 segment 指纹
- ❌ **不做 kind 归位**（存量记录不动）

---

## 5. 缺陷总登记（40 项 · 六类）

> ⚠ **本表是「缺陷定义」，不是「状态表」**：各行的**末列是计划归属阶段**，**实际裁决一律见 §14**（**唯一状态源**）。
> 为什么这么切：本表原先被当成状态表读，而状态随施工在 §14 更新 ⇒ **两处状态源必然分叉**（实测：A1/A2/A4/A6
> 早已在 P0a 修好、C1–C6 在 P7 关闭、D1–D5 在 P5/P7 落地，而本表仍写着原计划阶段）。
> **同一教训在本文件出现三次**（§9.1 逐卡状态、`ARCHITECTURE.md` 的手写分项明细、本列）——
> 结论：**手写状态必然漂移；消除漂移面优于反复校正**（与 E1 的处置同法）。

### A 类 · 架构级（7 项）

| ID | 缺陷 | 证据 | 影响 | 归属 |
|---|---|---|---|---|
| **A1** | 读侧装配**无运行时消费者**（双实现，G4 那支只在离线 CLI 活） | 【实测】`src/` 扇入 0；唯一消费者 `scripts/supply-preview.mjs`；活路径为 `panel-shared#readCarrier` | `DEFAULT_BUDGET` 安全带与 `serendipity` 槽**在运行时**从未生效 | P0a |
| **A2** | **`record-address` 同样运行时缺席** | 【实测】`src/` 扇入 0；唯一消费者 `scripts/test-record-store.mjs`（单测）；为 `storeMode=record`（**明说未实现**）预造 | 同 A1 模式 | P0a（一并申报） |
| **A3** | 环记录无读侧供给 | 【读码】活路径 `readFileSync` 读 md 文件；环记录无 md 投影 ⇒ 结构上不可达 | 五类环记录零注入 | **P6** |
| **A4** | 环无自动生产者 | 【实测】9 op 仅被 `scripts/record-ring.mjs` 调用 | 环记录靠手敲 CLI 才有 → 9 条 | P4/P5 |
| **A5** | **机检只做负面约束，缺正面断言** | 【实测】7 件架构门全是"不许…"；`audit-architecture` 已算扇入却**只打印不判定** | A1/A2 一类缺陷的成因 | **P0a（补门）** |
| **A6** | `panel-arch#ARCH_MODULES` 用 `existsSync` 判定在位 | 【读码】只断言文件存在 | **架构观测面结构性说谎** | P0a |
| **A7** | `check-carriers` ⑤/toggle 弱覆盖 | 【实测】脚本自述「既有弱点，非本次引入」：只核对硬编码 6 键 | 新增键漏配映射抓不住（与本方案新增配置项**直接冲突**） | P1 |

### B 类 · 读侧质量（7 项）

| ID | 缺陷 | 证据 | 影响 | 归属 |
|---|---|---|---|---|
| ~~**B1**~~ | 🔴 **撤回（P7 实测）：「约一半 turn 首步零材料」是度量错误** | 【实测·逐条核对审计行】step1 带 `channel` 的 **158** 条中：fast **26**（识别即行动，**设计性**零材料）+ slow **132**；slow 里**注入 130**（98.5%）、真零注入 **2**（均为全量去重，属正确行为）⇒ **记忆实际参与率 = 130/158 = 82.3%**。原「49.3%」错因两层：① 分母混入无 `channel` 行 ② **合规阶段 3 个审计站点不带任何体量字段，`Number(undefined) > 0` 被静默当成 0** ⇒ 25 条「材料在场、本步在审合规」的行被误读成「零注入」 | ~~半数决策点记忆缺席~~ **不成立** | P7（已闭合） |
| **B1′**（替代 B1 的真问题） | 审计行的**阶段语义缺失**导致下游误读 | 同上 25 条误读的直接成因 | 任何「是否注入」的分析都可能重犯 | **已治**：`mcl-step` 全部 7 个站点带 `phase: inject\|compliance`；`check-observability` 加断言（**已反例证伪**：临时去掉一处 ⇒ 立刻红 ⇒ 还原 ⇒ 绿） |
| **B2** | 快通道 **16.5%**（低于预期，非"近关闭"） | 【实测】step1 有 channel 158 中 fast=26；注册表预期 27.5% | 双通道分流偏保守；`hasHighConf` 未放宽 | P7 |
| **B3** | 阈值与分布错配 | 【实测】sim p50 .513 / p90 **.575** / max .662，阈值 .58 仅覆盖 **9.3%** | 快/慢通道都受压 | P7 |
| **B4** | `meta.cues` 记录数 **0** | 【实测】980 条中带 cues 者 0 | 情境键字段无数据、无 schema、无生产者 | P2/P4 |
| **B5** | 恒定面无「框架化」约束 | 【判读】注册表自述 ≈2,800 字符/步（**该自述算术自身不自洽，须实测复核**）；活路径按 4000 装 | 长期记忆被当工作记忆灌；context rot | **P8（刻意后置）** |
| **B6** | `serendipity` 缺省 0 ⇒ 联想槽永久关闭 | 【读码】`DEFAULT_BUDGET.serendipity = 0` | association 环 2 条记录几乎不可能被注入 | P0a/P3 |
| **B7** | `materialInSystem` **三方不一致** | 【实测】代码默认 `false` · **持久配置 `true`**（`scheduler.json`）· 文档「已回滚」 | 先查 `true` 是否真生效（`systemPrompt` 能力不可用会静默回落） | P7 |

### C 类 · 审计与对账（6 项）

| ID | 缺陷 | 证据 | 影响 | 归属 |
|---|---|---|---|---|
| **C1** | `closureOk` **107/107 全 false** | 【实测】 | 巩固链闭环判据从未真正通过 | P7 |
| **C2** | timer 型 `check.sleep` 大面积 `skipped` | 【实测】 | 审计**无法区分「未跑」与「通过」** | P7 |
| **C3** | `shadowCorr = −0.33` 稳定复现 | 【实测】 | 与 `alphaImp=0.25` 的「分量不冗余」前提**方向相反** | P7 |
| **C4** | **`alphaImp` fallback 漂移** | 【实测】`criteria.ts:185` `?? 0.35` vs 注册表 `0.25` | 缺字段时静默用旧值，**绕过「注册表=唯一事实源」** | P1 |
| **C5** | mcl-audit 184 条 `channel` 缺失 | 【实测】 | 通道统计口径不闭合 | P7 |
| **C6** | `decision.ingest` 大量 `chars:0` 空转 | 【实测】137 条 `below-min-chars`，多数为 0 | ingest 被无内容事件反复触发 | P7 |

### D 类 · 数据面（5 项）

| ID | 缺陷 | 证据 | 影响 | 归属 |
|---|---|---|---|---|
| **D1** | **`episodes.jsonl` 257 条孤儿数据** | 【实测】`src/` 内**无代码写它**（生产者已移除）；ledger `type=episode` = **0** | 现成的会话级情景 + **成败信号**未接入任何环/注入面 | P5 |
| **D2** | `pending/` 6 件积压 | 【实测】ADD-only 非权威、无处置时限 | 候选悬空 | P7 |
| **D3** | `whitelist.json.orphan-20260911` 残留 | 【实测】 | 白名单曾漂移未清理 | P7 |
| **D4** | `notes/release.md` 0 节 / `notes/INDEX.md` 17.2KB/172 条 | 【实测】 | 白名单含近空文件；元数据表膨胀 | P7 |
| **D5** | `episode` kind 恒 0（情景记忆缺失） | 【实测】 | **拟人化核心缺口** | P5（线 B2） |

### E 类 · 契约一致性与口径（8 项）

| ID | 事项 | 证据 | 处置 |
|---|---|---|---|
| **E1** | ✅ **已修**：`ARCHITECTURE.md` 模块数 55（分项相加仅 **53** ⇒ 文档自身都不自洽） | 【实测】真值 **63**（排除生成物） | 处置：① 数字改 63 ② **删掉手写分项明细**（手写明细必然漂移——这是它漂移两次的根因），改为指向现查命令 ③ 立 `check-arch-sync` 机检 |
| **E2** | ✅ **已修**：会话注入预算 3000 vs 注册表 **4000** | 【实测】`surface.injection.budgetChars = 4000`；活路径 `max(1200,4000)` | 处置：文档改 4000 并注明由 `check-arch-sync` 守（注册表为唯一事实源） |
| **E3** | ✅ **已修**：`ARCHITECTURE.md` 曾称存在 3 条 `-share` 惰性桥 | 【实测】`src/*-share.ts` = **0 个文件**，`check-bridges` 边 0 | 处置：陈旧陈述随 E1 的分项明细一并删除；并立**哨兵断言**（若 `-share.ts`=0 则文档不得提及） |
| **E4** | ✅ **已修**：两审计脚本模块数口径未标注（61 vs 60 之争的真实成因） | 【实测】`audit-architecture` **含**生成物 / `audit-fnspan` **排除**（`!f.includes('.generated.')`） | 处置：两件**输出头均标注口径**并互指差异原因；立断言（未标注即 FAIL） |
| **E5** | ✅ **关闭为非缺陷（Q3 结清）**：`layerCounts.E.profile` 口径 | 【实测】独立计数 E 层画像行 = **25**，与 reconcile 报的 **25 完全一致** —— 全是**无标签**画像行（代码 `pm ? layerOf(pm[1]) : 'E'` **回落 E**） | 结论：**计数口径约定，非渲染器缺失**；我原先的「疑为口径」假设**成立** |
| **E6** | `maturation.enforce=false` | 【读码】 | A<gate「不注入但参与打分」只记录不强制 → P7 |
| **E7** | `check-installed-features`/`check-installed-sync` 为**报告态**（不阻断） | 【实测】末尾输出人工核对清单 | 装副本漂移不进 CI 红灯 → P7 |
| **E8** | `unknown` 主体 / `rerank` 未达触发门 | 【实测】`unknown` = **0**（已修）· 索引行 86 < 200（不引入 rerank 是**正确**取舍） | **闭账**，非缺陷 |
| **E9** | **`principle`/`preference` 是死词汇**〔原 D-04b，合并时曾漏登记，已补〕 | 【读码】`kindOfLine` 把 P 层标签一律派生为 `persona` ⇒ 这两个 kind **永不产出**；`promoteVerdict('principle')` 的 `'principle'` 是**升格域字面量、非 RecordKind**；RecordKind `principle` **零消费者** ⇒ 仅存在于 `KINDS` 与 `RING_OF_KIND` 两张表里 | 与 `persona` **同属 value 环**，区分语义惰性 ⇒ 危害仅限「环普查人读计数」。**处置=清理**（合并进 `persona` 或从 `KINDS` 删条目），**禁止 kind 归位**（见 §13 R3）· 必须走迁移+对账（归 P7） |

### F 类 · 结构债（6 项 · 来自 §3.3 架构审查）

> ⚠ **本节为合并时补齐**：以下 6 项原只在 §3.3 与 §9 出现，**未进"总登记"** ⇒ 本次补登。
> 它们**不与拟人化方案混做**（见 §9「单独立项」），但它们**是真实的架构债**，必须可追溯。

| ID | 缺陷 | 证据 | 影响 | 归属 |
|---|---|---|---|---|
| **F1** | **`targets.ts` 内聚失衡** | 【实测】扇入 **18**（全仓最高，约 30% 模块依赖）· 484 行 · **35 导出**；承载 5 个关注点（路径 / 装配矩阵 / 载体分层 / 召回 / 事件分类）【读码】 | 改它之前得先读懂五个领域 ⇒ 变更半径全仓最大 | **单独立项**（动 18 扇入，风险与收益不对称；`check-hardcode` 依赖的路径内核**不可拆**） |
| **F2** | **`treeops.ts` 含两个关注点** | 【实测】**880 行（最大）**；结构整形（`applyTreeOps` 68 行）+ 遗忘归档（`applyForgetOps` **120 行 = 顶 I1 天花板**） | 双关注点 + I1 零余量 | 单独立项（**拆它同时缓解 I1 顶格**） |
| **F3** | **`panel-shared.ts` 含两个关注点** | 【实测】**704 行**；HTTP 管道 + **热记忆装配**（`buildHotMemoryText` **251 行**） | 管道与记忆装配混居；且是本方案 P0a 的落点 | 单独立项 |
| **F4** | **`scheduler.ts` 入口件塞了五个工具定义** | 【实测】**746 行**，而 `applyScheduler` 自身仅 **29 行** | 入口可读性差 | 单独立项 |
| **F5** | `deepsleep-tree#consolidateTree` **350 行单函数** | 【实测】全仓最大函数（软阈值 400，未破但逼近） | 可测性差 | 单独立项（可与 F2 同批） |
| **F6** | **I1 棘轮已顶格（零余量）** | 【实测】`applyForgetOps` = **120/120**；`registerMcl` 117 · `registerDistill` 116 | **I1 不是安全网，是当前天花板** ⇒ 任何新增撞红 | **不是待修项，是硬约束**（见 §1 B9）→ 新代码必须进新函数 |

**分级小结**：**A 7 · B 7 · C 6 · D 5 · E 9 · F 6 = 40 项**（其中 E8 含 2 项非缺陷已闭账；F6 是硬约束而非待修项）。
**A 类 7 项全部落在「架构门只做负面约束」的盲区里**——这是本次审查最核心的发现。
**F 类 6 项为合并时补齐**（原只在 §3.3/§9 出现，未进总登记）。

---

## 6. 契约与注册表变更清单

| 文件 | 变更 | 守的门 |
|---|---|---|
| `skill/engine/criteria.json` | `surface.injection.situation`{enabled,budgetChars,cues,ringOrder} · `surface.score.alphaVal` · `consolidate.promote.premise` soft→hard · `carriers.renderers` 加 `gated:ring` · `fieldRoles` 补 runtime · **taskClass 正则上移** | B4 |
| `src/criteria.generated.ts` | **生成物**，`npm run gen-criteria` 产出，禁手写 | B4 |
| `src/supply-assembly.ts` | 加 `situation` 槽 · `buildCandidates` 判据订正 | B1 |
| `src/panel-shared.ts` | 装配收敛（**只接预算与溢出记账，候选与排序不动**）；`readCarrier` 不重写（§4.2） | B1 B9 |
| `src/rings.ts` | 加「环 → 读侧槽」映射（**与 `RING_OF_KIND` 同处，不另立名单**） | B6 |
| `src/ring-supply.ts` / `src/situation-key.ts` | **新增**（纯函数，Deps ≤6） | B1 B2 |
| `src/composition.ts` | 显式传 `ringSupply` / `situationKey` 句柄 | B3 |
| `src/distill.ts` / `distill-write.ts` | +4 通道 | — |
| `src/deepsleep-core.ts` / `-run.ts` / `-contract.ts` | +2 通道；`SleepWrite` 5→6；纳入 `attempted` | B1 B2 |
| `src/criteria.ts` | `alphaVal` 项 + **fallback 归注册表** | — |
| `src/mcl.ts` | 快通道独立触发 + 二次检索 + 置信度回报 | — |
| `src/panel-inject.ts` / `panel-observe.ts` | 传 cues；`/inject/preview` 展示 situation 槽；`/rings` 补供需缺口 | 易用性 |
| `src/panel-arch.ts` | `ARCH_MODULES` 判定升为「存在 ∧ 扇入>0」 | A6 |
| `src/scheduler.ts` | 新 zod 缺省（**读注册表**，不写死） | B4 |
| `scripts/audit-architecture.mjs` | **加扇入 0 判定**（见 §7） | A5 |
| `scripts/check-runner.mjs` | 登记新增机检/单测 | B7 |

---

## 7. 机检与测试补位（**并入已有审计，零堆叠**）

> ⚠ `check-ring-coverage.mjs` **已含 5 道**，其 ⑤ 明确检查「**KPI 函数真在 lib 里导出——登记了却取不到＝死登记**」
> ⇒ 它**已引入「执行侧」概念**，只是范围止于 KPI 函数存在性。新增平行脚本违反「单一实现 / 不堆叠」（`USER.md` 明载偏好「设计极简抗堆叠」）。

| 件 | 治哪个缺陷 | 抓什么 |
|---|---|---|
| **`audit-architecture.mjs` 加判定**（**唯一新增门·零新脚本**） | **A1 / A2 / A5** | **扇入 0 的模块必须显式申报**（`WIRING_PENDING` + 棘轮，照抄 `RING_PENDING`：「显式申报，非静默放过」+ 抓陈旧申报）。**判定只认 `src/` 内运行时消费者**——`scripts/`（离线工具）与单测**不算**，否则 `supply-assembly` 因 `supply-preview` 假 PASS。豁免：`index`/`panel`（入口）· 纯类型模块（**需同时修审计口径**，否则 `deepsleep-contract` 误报）。每项必填**到期条件** |
| **`check-ring-coverage` 加第 ⑥ 道**（不新建脚本·与 ⑤ 同族） | A3 / A4 / D5 | ① 每个 `kind` 必须有**可达生产者**（否则 FAIL 或显式申报 `KIND_PENDING`）② 每个有 kind 的环在 `ring-supply` 必须有分支与渲染器 |
| **并入 `check-field-usage`**（不新建脚本·同类：runtime 字段必须被消费） | B4 / B6 | 环记录 `meta.cues` 缺失率（报告态）+ 情境键无硬编码 + `situation` 槽预算在注册表**且被 runtime 消费** |
| `check-fallback-parity`（并入 `check-field-usage` 或注册表门） | C4 | 源码 fallback 常量 ⟷ 注册表值一致 |
| `check-set-keys-dynamic`（补 `check-carriers` ⑤ 盲区） | A7 | `/set` 白名单**动态**对账 |
| `check-audit-completeness` | C2 / C5 | 审计行必填字段齐全（`channel` 等），且**区分「未跑」与「通过」** |
| `test-ring-supply.mjs` / `test-situation-key.mjs` | — | 匹配/兜底/边界（空 cues、due 过期、跨工作区红线）；确定性（同输入同输出） |

**棘轮**：`audit-wiring` 的 I1/I2 本方案后**只许收紧**（新模块 Deps ≤6）。

---

## 8. 架构同步清单

**架构设计本身不需要调整**——骨架一行未动（§4.4）。需要同步的是三类账：

| 类型 | 内容 | 动作 | 归入 |
|---|---|---|---|
| **数字/口径** | `ARCHITECTURE.md` 55/53 自洽化 · 注入预算三处对齐 · 两审计脚本输出头标注口径 | `check-arch-sync`（程序化 diff，**不靠人眼**）+ 发布前置口径 **6 条 → 7 条** | P1 |
| **语义失真** | `panel-arch#ARCH_MODULES` 用 `existsSync` ⇒ 观测面结构性说谎 | 判定升为「存在 ∧ 扇入>0」（复用 §7 同一判定） | **P0a** |
| **挂起无到期** | `ARCHITECTURE.md §3.1` **已明写** G4 未接线（散文脚注），但无门、无到期条件 ⇒ 从 09-13 挂到今日 | `WIRING_PENDING` 棘轮 | P1 |
| **陈旧陈述** | `ARCHITECTURE.md` 称 3 条 `-share` 桥「亦未做」，实测已全退役 | 同步订正 | P1 |
| **数据面** | `episodes.jsonl` 被标为「**已并入** ledger 的 legacy 只读流」；实为**生产者已移除（orphan）** | 标注订正 + 归 P5 迁移（257 条历史可用） | P5 |

> ⚠ **顺序硬约束**：`check-arch-sync` 必须在**任何模块增减之前**先立（P1）。
> 否则 P2 加 2 个模块、P4/P5 改契约后，多份清单会各自漂移，**改完仍然对不上**。

---

## 9. 落地方案（逐阶段施工卡）

### 9.0 施工前置：先测三条存疑（**不写代码**）

> 三条都是「我判断过但证据不足」或「注册表自述可疑」，**必须在动手前用实测钉死**，否则会带着存疑往下走（R4/R5/R10 的教训）。

| # | 待测 | 为什么必须测 | 测法 | 通过判据 |
|---|---|---|---|---|
| Q1 | **恒定面每步真实字符数** | 注册表自述「AGENT 1,138 + USER 430 + 画像行 ≈630 + 标题 ≈1,990 ⇒ ≈2,800」**算术自身不自洽**（前三项 2,198，加第四项 4,188）；B5 与 P8 的基线依赖它 | `GET /inject/preview` 取全文按段计数；或直接量 `buildHotMemoryText` 返回串 | 得到**分段实测值**，写入注册表 `surface.injection` 注记；B5 的"≈2,800"被实测值取代 |
| Q2 | **`mclMaterialInSystem=true` 是否真生效** | 代码默认 `false` / 持久配置 `true` / 文档「已回滚」三方矛盾（B7）；若 `systemPrompt` 能力不可用会**静默回落 false** | 读 `/mcl/config` 的 `running.materialInSystem`（**解析后的值**）与 `sysBlockCalls` / `sysBlockNonEmpty` | 若 `sysBlockNonEmpty>0` ⇒ 通道真在工作，B7 降级为纯文档订正；若 `=0` ⇒ 真回落，B7 升级 |
| Q3 | **`layerCounts.E.profile=24` 的口径** | E5 存疑：实测标签组合**无 E 层 profile 形态** ⇒ 疑为 layering 脚本计数口径而非渲染器缺失 | 读 `check-carriers.mjs` / layering 脚本的计数分支，用真实库跑一次 | 给出结论：口径问题（改计数）**或**真缺渲染器（补声明） |

**产出**：三条结论写回 §5（B5/B7/E5 定级）与 §8。**未完成 Q1–Q3 不得进入 P0a。**

### 9.1 阶段总览

| 阶段 | 内容 | 绑定缺陷 | 关键验收 |
|---|---|---|---|
| **P0a** | **给 `audit-architecture` 加扇入 0 判定** + `WIRING_PENDING`（排除 `scripts/`）+ 架构视图判定升级 + 活路径接「预算与溢出记账」（**候选与排序完全不动**） | **A1 A2 A5 A6 B6** | `audit-architecture` **先红**（抓 `supply-assembly` + `record-address`）**后绿**；**注入文本逐字节等价** ✓；28 单测仍绿 |
| **P1** | 注册表扩展 + 生成 + 机检补位（**先立门，后接线**）+ 治 C4/A7/E1–E5 | A5 A7 C4 E1–E5 | `gen-criteria --check` 新鲜；新门登记且**先红后绿**；fallback 一致；两审计口径标注 |
| **P2** | `situation-key.ts` + `ring-supply.ts` + 单测（**纯函数零接线**） | B4 | 单测全绿；`audit-wiring` I1/I2 未破（新 Deps ≤6） |
| **P3** | `situation` 槽（**缺省 0**）+ `/inject/preview` 展示 | A3 B6 | **缺省下注入文本逐字节不变**；`check-ring-coverage` ⑥ 绿 |
| **P4** | 蒸馏 +4 通道（含 cues） | A4 B4 | 真机一轮：`records.jsonl` 出现 4 类环记录；`reconcileRing` ok |
| **P5** | 深睡 +2 通道 + **`episodes.jsonl` 迁移**（纳入 `attempted`） | A4 **D1 D5** | 一轮深睡：出现 `outcome` 回收 + `episode` 叙事；非零 `attempted` 可见；257 条迁移有账 |
| **P6** | **环记录独立通道**（不迁移数据源）+ 开情境槽（300 字符起步）+ 供需缺口观测 | A3 | `/rings` 供需缺口非零且**环记录实际注入次数 > 0**；md 投影候选逐字节等价 + 环差异清单 |
| **P7** | 线 D + 审计债务 + 数据面清理 | B1 B2 B3 B7 C1–C3 C5 C6 D2–D4 E6 E7 | 快通道脱离 16.5%；零材料比例下降；`shadowCorr` 有预注册结论；`closureOk` 有结论；审计区分「未跑/通过」 |
| **P8** | 恒定面框架化（**刻意后置**） | B5 | ≈2,800 字符/步降为框架+指针，且不损人格一致性 |
| **单独立项** | **结构债 F1–F5**（见 §5 F 类）：`targets.ts` 内聚拆分（动 18 扇入）· `treeops`/`panel-shared`/`scheduler` 拆关注点 · `consolidateTree` 350 行拆函数 | §3.3 **§5 F 类** | **不与本方案混做**（F2 可顺带缓解 I1 顶格 F6） |

**P8 后置的理由**：P0–P7 已完成两个变量（情境层 + 写侧通道）；恒定面同时动会**无法归因**。

### 9.2 逐阶段施工卡

> 卡式字段固定：**目标 / 前置 / 触碰 / 改动点 / 新增门 / 验收 / 回退 / 风险**。
> 所有阶段共同守 §1 B1–B10，尤其 **B9（I1 顶格 ⇒ 新代码必须进新函数）**。

---

#### 卡 P0a · 让「扇入 0」变成红灯 + 接预算记账

- **目标**：把最高杠杆的一类缺陷（A1/A2/A5/A6）变成机检红灯；同时把 `supply-assembly` 的**预算与溢出记账**接进活路径（B6 的 `serendipity` 槽随之具备生效条件）。
- **前置**：Q1–Q3 完成。
- **触碰**：`scripts/audit-architecture.mjs` · **新增** `src/wiring-pending.ts` · `src/panel-arch.ts` · `src/panel-shared.ts` · `scripts/check-runner.mjs`
- **改动点**
  1. `audit-architecture.mjs`：**它已算出扇入**，只需把结果喂给判定——`fanIn === 0 && !WIRING_PENDING.includes(name)` ⇒ **FAIL**。
     豁免：`index` / `panel`（入口）· **值导出 0 的纯类型模块**（否则 `deepsleep-contract` 误报，见 A5 的审计口径局限）。
     **判定只认 `src/` 内运行时消费者**——`scripts/`（离线工具）与 `test-*.mjs`（单测）**不算**。
  2. `src/wiring-pending.ts`：`export const WIRING_PENDING = [{ name, until }]`，初值
     `supply-assembly → 'P6 环通道接进活路径后'`、`record-address → 'storeMode=record 立项，或删除'`；
     配 `stalePending()` 棘轮（**已接线却仍申报 ⇒ FAIL**，照抄 `RING_PENDING`）。
  3. `panel-shared.ts`：**新增一个函数**（不得塞进 `buildHotMemoryText`，I1 顶格）把已排好序的候选交给
     `assembleSupply(candidates, DEFAULT_BUDGET)`，并消费 `meta.dropped` 落台账。
     ⚠ **本阶段只做记账，不改实际输出**——这是"逐字节等价"能成立的唯一前提。
  4. `panel-arch.ts`：`ARCH_MODULES` 判定从 `existsSync(lib/x.js)` → **`existsSync && fanIn > 0`**（复用同一判定）。
- **新增门**：`audit-architecture` 内加判定（**零新脚本**）；`check-runner` 登记。
- **验收**
  ① 改前后 `GET /inject/preview`（含 query）全文 **逐字节等价**（先存快照再比对，脚本化）；
  ② `audit-architecture` **先红**（必须抓到 `supply-assembly` + `record-address` 两个）**后绿**；
  ③ `node scripts/check-runner.mjs` 全绿；④ `/arch/assembly` 不再把两个死件报成在位。
- **回退**：逐文件回退；`WIRING_PENDING` 置空即恢复旧行为（判定随之失效——**这是已知的自我失效口，故它必须与判定同批提交**）。
- **风险**：I1 已顶格（`applyForgetOps` 120/120）⇒ 任何"顺手改"都会撞红；`assembleSupply` 的预算口径 ≠ 面板现有 `totalBudget` ⇒ **严格限定本阶段不改变输出**。

---

#### 卡 P1 · 注册表扩展 + 门补位（**先立门，后接线**）

- **目标**：把新参数变成注册表驱动的可机检项；补齐机检盲区（A7）与一致性（C4/E1–E5）。
- **前置**：P0a 绿。
- **触碰**：`skill/engine/criteria.json` · `src/criteria.generated.ts`（生成）· `scripts/check-carriers.mjs` · `scripts/check-ring-coverage.mjs` · `scripts/check-field-usage.mjs` · **新增** `scripts/check-arch-sync.mjs` · `scripts/check-runner.mjs`
- **改动点（注册表逐键）**
  | 键 | 值 | 消费方 |
  |---|---|---|
  | `surface.injection.situation` | `{enabled:false, budgetChars:0, cues:[...4 维], ringOrder:[...5 环]}` | scheduler zod 缺省 + `supply-assembly` |
  | `surface.score.alphaVal` | `0`（先 0，P7 再调） | `criteria.ts:185` |
  | `consolidate.promote.premise` | `soft → hard` | 写门 |
  | `carriers.renderers` | 加 `gated:ring` | `check-carriers` ② |
  | `fieldRoles` | 补 `SURFACE.injection.situation` / `SCORE.alphaVal` = `runtime` | `check-field-usage` |
  | taskClass 正则 | 从 `scheduler.ts:563` **上移**为注册表块 | 两处共用 |
- **新增门**：`check-ring-coverage` **加第 ⑥ 道**（kind 有可达生产者 + 环有 `ring-supply` 分支）· `check-field-usage` **扩项**（cues 覆盖率 / situation 预算被消费 / fallback ⟷ 注册表一致）· `check-carriers` ⑤ **动态化**（补 toggle 只核硬编码 6 键的盲区）· `check-arch-sync`（模块数三方 diff + 预算数字 ⟷ 注册表）
- **验收**：`gen-criteria --check` 新鲜；**每道新门先红后绿**（先制造一个反例验证它真会红）；C4 fallback 与注册表一致；两审计脚本**输出头标注口径**（E4）；`ARCHITECTURE.md` 55/53 自洽化（E1）。
- **回退**：删注册表块 + 重跑 `gen:criteria`；门可单独禁用。
- **风险**：注册表一改，投影必须同批重生成，否则 `check-criteria` 红。

---

#### 卡 P2 · 两个纯函数模块（**零接线**）

- **目标**：把选择与情境键做成可单测的纯函数，**不接触任何运行时路径**。
- **前置**：P1 绿。
- **触碰**：**新增** `src/ring-supply.ts` · **新增** `src/situation-key.ts` · `src/composition.ts` · **新增** `scripts/test-ring-supply.mjs` · **新增** `scripts/test-situation-key.mjs` · `scripts/check-runner.mjs`
- **改动点**
  - `situation-key.ts`：`cuesOf(ctx): string[]`（四维拼接，**零硬编码**，维度取自注册表）；确定性（同输入同输出）。
  - `ring-supply.ts`：`ringCandidates(records, cues, opts)` + `renderRingLine(r)` + `createRingSupplyApi(d)`。
    **边界纪律**（照抄 `supply-assembly.ts` 头注）：只做**选择 + 渲染**，不做装配、**不重排、绝不新写打分函数**。
    含 A4 兜底排序（cues 空 → 环优先级 → due 紧迫度 → 新鲜度，只此一处）。
  - 两者 **Deps ≤6 字段**（守 B1/I2 棘轮）。
- **新增门**：两个单测登记 `CHECKS`。
- **验收**：单测全绿；`audit-wiring` I1/I2 未破；**`audit-architecture` 仍报这两模块扇入 0**（本阶段它们本就未接线——**此时必须先把它们加进 `WIRING_PENDING`**，否则 P0a 的门会红）。
- **回退**：删两模块。
- **风险**：新模块一落地就成为"扇入 0"⇒ **与 P0a 的申报机制形成正反馈验收**（门必须先允许申报再放行）。

---

#### 卡 P3 · `situation` 槽（缺省关）

- **目标**：装配层具备第三槽能力，但**缺省不生效**。
- **前置**：P2 绿。
- **触碰**：`src/supply-assembly.ts` · `src/panel-inject.ts` · `src/panel-shared.ts` · `scripts/test-supply-assembly.mjs`
- **改动点**：`SupplyBudget`/`SupplyInputs`/`SupplyResult` 加 `situation`；`buildCandidates` 判据订正为「`file===''` 且 kind 属环 ⇒ 交 `ring-supply`；`file===''` 且无内容 ⇒ 仍不可注入」；`/inject/preview` 展示该槽（**可见但为空**）。
- **验收**：**缺省下注入文本逐字节不变**（同 P0a 的快照法）；`check-ring-coverage` ⑥ 绿；preview 能看到槽存在。
- **回退**：预算保持 0（等价于关）。
- **风险**：`buildCandidates` 语义订正会改 `Candidates` 结构 ⇒ 单测需同步（40 条）。

---

#### 卡 P4 · 蒸馏 +4 通道

- **目标**：会话→库方向开始产出环记录（治 A4）。
- **前置**：P3 绿。
- **触碰**：`src/distill.ts`（`:157` 输出契约 + 判据段）· `src/distill-write.ts#writeDispatch` · `src/distill-agent.ts`（统计）· `scripts/test-*.mjs`
- **改动点**：契约加 `decisions`（含 **`predicted`** = 后果回收锚）/ `commitments`（direction+due）/ `relations` / `valences`（含 **`trigger`** 情境）；每条**必带 `cues`** → 落 `meta.cues`；
  `writeDispatch` 加分支 → 调 `ring-events` 已有 op → 落 `.records/ring-events.jsonl`。
  ⚠ **不纳入 `distill-chunks.ts` 的 segment 指纹**（`:88-110`）——指纹一变，去重语义与水位对账基准随之漂移。
- **验收**：真机跑一轮蒸馏 ⇒ `records.jsonl` 出现 **4 类**环记录；`reconcileRing` 对账 ok；`enqueued` 计数可见；**水位口径无变化**（对账证明）。
- **回退**：契约字段留空（产线回到只写 appends/newIndex）。
- **风险**：模型可能漏填 `cues` ⇒ 由 A4 兜底 + `check-field-usage` 的报告态监控。

---

#### 卡 P5 · 深睡 +2 通道 + `episodes.jsonl` 迁移

- **目标**：库→库方向产出**后果回收**与**叙事**（治 A4/D1/D5，拟人化核心）。
- **前置**：P4 绿。
- **触碰**：`src/deepsleep-core.ts`（`DEEP_SLEEP_PROMPT`）· `src/deepsleep-run.ts`（enqueue + apply + **`attempted`**）· `src/deepsleep-contract.ts#SleepWrite`（加 `writeRingOps()`，5→6 字段，≤8 ✓）· 迁移脚本 · `scripts/check-runner.mjs`
- **改动点**
  - 契约加 `outcomes`（`collectOutcome` = 后果回收）/ `narratives`（写 `notes/agent.md §经历/<事件名>` 正文 + 造 `episode` 记录，`pointer` 指向该 §）。
  - ⚠ **必须纳入 `attempted` 计算**——`deepsleep-run.ts:126-127/290` 已有教训：「纯 profileOps/指针/树/遗忘 轮全数失败」曾因不进判据被误判 `landed:true`、材料静默丢弃。
  - 257 条 `episodes.jsonl` 迁移：**先备份 → 映射为 `episode` 记录（带 `pointer`）→ `reconcileRing` 对账 → 才标记完成**；原文件保留为归档。
- **验收**：一轮深睡 ⇒ 出现 `outcome` 回收 + `episode` 叙事；**非零 `attempted` 可见**；257 条迁移**有账**（逐条可查）；`check-ring-coverage` ⑥ 绿（`episode` 从"恒 0"变为有生产者）。
- **回退**：契约字段留空；迁移是 ADD 型，可整体丢弃新增记录。
- **风险**：叙事小节会撑大 `notes/agent.md` ⇒ 受既有容量门约束，须走 `write_gate`。

---

#### 卡 P6 · 环记录独立通道 + 开情境槽

- **目标**：环记录真正进入上下文（治 A3），并**小预算**起步观测。
- **前置**：P5 绿。
- **触碰**：`src/supply-assembly.ts` · `src/panel-shared.ts` · `src/panel-inject.ts` · `src/panel-observe.ts` · `src/scheduler.ts`
- **改动点**：环记录走**独立通道**（**不迁移数据源、不重写 `readCarrier`**，见 §4.2）；`situation` 槽开至 **300 字符**起步；`/rings` 补「**供需缺口**」= 环已有记录数 ⟷ 实际注入次数。
- **验收**
  ① `/rings` 供需缺口非零且**环记录实际注入次数 > 0**（这是"环活了没"的唯一硬指标）；
  ② **md 投影候选逐字节等价** + 环新增行**单列差异清单**（不做全量等价）；
  ③ `mcl` 零材料比例与 turn 首步注入率（基线 49.3%）有对照记录。
- **回退**：预算改回 0（通道即关）。
- **风险**：**误注入代价 > 漏注入**（L2 代价权重）⇒ 预算小、独立槽不挤占相关性面、超预算**留痕可见**。

---

#### 卡 P7 · 线 D（元认知/打分）+ 审计债务 + 数据面清理

- **目标**：把读侧质量与审计可信度拉回来。
- **前置**：P6 绿（情境层已在跑，才有"分流效果"可测）。
- **触碰**：`src/mcl.ts` · `src/criteria.ts` · `skill/engine/criteria.json` · `scripts/audit-*` · 数据面清理
- **改动点（分项）**
  | 项 | 缺陷 | 动作 |
  |---|---|---|
  | D1 快通道独立化 | B2 | 高置信 `[路径]`/`[原则]` 命中走**独立触发**；放宽 `hasHighConf`（注册表已标遗留项） |
  | D2 二次检索 + 置信度回报 | B1 | 低于阈值时再检索一次（放宽到③层 + 画像小节）并**回报置信度**，不再静默零材料 |
  | D3 阈值重校准 | B3 | 按 936 样本分位重定 `familiarThreshold`（现 .58 仅覆盖 9.3%），可回滚值入注册表 |
  | D4 `alphaVal` 进打分 | B-价态 | `criteria.ts:185` 加项，`vec.ts:16` 是唯一消费者（已实测） |
  | D5 fallback 归注册表 | C4 | 删硬编码 fallback 或改从注册表取（P1 已立门） |
  | D6 `shadowCorr` 复扫 | C3 | 用既有 `shadow-sim` **预注册判据**（Jaccard≥0.6）重定或翻转 `mode` |
  | D7 `closureOk` 定性 | C1 | 查闭环判据为何 107/107 全 false ⇒ 给结论（绿 或 改判据） |
  | D8 审计区分「未跑/通过」 | C2 | `check.sleep` 的 `skipped` 须与 `pass` 分列 |
  | D9 `channel` 必填 | C5 | mcl-audit 行补必填字段 |
  | D10 ingest 空转 | C6 | `chars:0` 不再触发 ingest |
  | D11 数据面清理 | D2–D4/E6/E7 | pending 处置 · orphan 清理 · `release.md`/`INDEX.md` 归位 · `maturation.enforce` 决策 · 装副本检查升阻断 |
- **验收**：快通道脱离 16.5%；turn 首步零材料比例下降（基线 49.3%）；`shadowCorr` 有**预注册结论**；`closureOk` 有结论；审计能区分「未跑/通过」。
- **回退**：逐项开关（阈值/`alphaVal` 均可回滚）。
- **风险**：D6/D7 可能得出"当前设置其实是对的"——**那也是合格结论**，不可为了"改动"而改动。

---

#### 卡 P8 · 恒定面框架化（刻意后置）

- **目标**：把"长期记忆当工作记忆灌"改掉（治 B5）。
- **前置**：**P0–P7 全部绿**（两个变量已落地，归因清晰）。
- **触碰**：`src/panel-shared.ts`（`buildHotMemoryText`，实测 **251 行**）· `skill/engine/criteria.json`（预算口径）
- **改动点**：图式层从"全量索引行清单"改为「**框架 + 可展开指针**」；以 Q1 的**实测基线**为对照。
- **验收**：每步字符数显著下降，且**注入面不损人格一致性**（P 层 `[原则]`/`[路径]` 不被裁，注册表已明载该口径）；对照 Q1 基线出前后数据。
- **回退**：恢复原渲染分支。
- **风险**：**这是唯一会实质改变注入内容的阶段** ⇒ 必须单独一次、单独观测，不与任何其他改动同批。

---

### 9.3 每阶段收尾口径（缺一即未完成）

| # | 口径 | 命令 |
|---|---|---|
| ① | 类型检查零错 | `npm run typecheck` |
| ② | 构建成功（host + client） | `npm run build` |
| ③ | 机检全绿 | `node scripts/check-runner.mjs` |
| ④ | 渲染级证据（**涉及 UI/注入面时**） | `node scripts/ui-geo-regress.mjs` / `GET /inject/preview` 快照对比 |
| ⑤ | 契约与产物 | `check-panel-contract` + `gen-panel-contract --check` + `gen-criteria --check` |
| ⑥ | **装上去的那份带着本轮能力** | 部署后 `check-installed-features` + `/arch/assembly` |
| ⑦ | **本阶段特有的实测判据**（见各卡「验收」） | 各卡所列 |

### 9.4 登记与纪律

- **登记**：任何新增测试/机检件**必须**进 `scripts/check-runner.mjs#CHECKS`（仓规则 6）；**未登记 = 等于没写**。
- **不堆叠**：新门优先**并入既有门**（P0a 的判定并入 `audit-architecture`；ring/kind/cues 三项并入 `check-ring-coverage` 与 `check-field-usage`）。
- **门必须先证伪再放行**：每道新门要求**先制造一个反例证明它会红**（防"写了从未运行"与"永远绿"）。
- **零硬编码**：`node scripts/check-hardcode.mjs .`。
- **用户可感知改动**：`CHANGELOG.md [Unreleased]` 记一行。
- **部署**：沿用「只覆盖差异文件」（`pnpm install` 会触发宿主批量删除保护，**本环境是 pnpm v11，`--legacy-peer-deps` 是 npm 旗标**）。

### 9.5 回退总表

| 阶段 | 回退动作 | 是否遗留 |
|---|---|---|
| P0a | 逐文件回退 / `WIRING_PENDING` 置空 | 无 |
| P1 | 删注册表块 + 重跑 `gen:criteria` | 无 |
| P2 | 删两模块（`WIRING_PENDING` 项一并删） | 无 |
| P3 | `situation` 预算保持 0 | 无 |
| P4 | 契约字段留空 | 无（已产出的环记录保留，无害） |
| P5 | 契约字段留空；迁移为 ADD 型可整体丢弃 | 无 |
| P6 | 预算改回 0 | 无 |
| P7 | 逐项开关回滚（阈值 / `alphaVal` / D1 独立触发） | 无 |
| P8 | 恢复原渲染分支 | 无 |

---

## 10. 可维护性设计（写进契约，不写进纪律）

1. **单一实现三处守住**：装配只有 `supply-assembly`（P0a 后接进活路径）· 打分只有 `criteria.ts:185`（实测 `vec.ts:16` 为唯一消费者）· 环归属只有 `rings.ts#RING_OF_KIND`。
2. **注册表驱动**：槽预算、情境键维度、环→槽映射、渲染器、`alphaVal`、任务型正则全在 `criteria.json`；改名/增环只动一处。
3. **零新增 kind / 环 / ring op** ⇒ 对账基准全部不动。
4. **默认零行为变化**：`situation` 缺省预算 0。
5. **假绿防线从 2 类补到 5 类**：原只有「声明侧」（契约自洽）+「执行侧」（`check-carriers` ⑥ 层准入）；补 **①接线侧**（扇入 0 判定）**②生产者侧**（kind 可达生产者）**③消费侧**（runtime 字段被消费）。**A1–A6 全部落在「没有这三类检查」的盲区里。**
6. **教训前移**：三处已知反复发作的缺陷（建了没接线 / 空壳合法 / 不进 `attempted`）各写成**一条机检 + 一条阶段验收**。
7. **B9 硬约束**：新代码必须进**新函数**（I1 已顶格）。

## 11. 易用性设计

1. **看得见**：`/inject/preview` 增列 situation 槽命中（新槽不开面板就是黑盒）。
2. **有仪表盘**：`/rings` 补「**供需缺口**」= 各类环**已有记录数** vs **实际注入次数**——现 KPI 只有库存数、没有流量，这正是环"死了没人知道"的成因。
3. **可调**：槽开关/预算/`alphaVal` 全走既有 `scheduler.json` + `/config`；面板配置项继承既有 `CONFIG_KEYS` 声明机制（**同时补 A7 的动态对账**）。
4. **可深读**：叙事记录带 `pointer` → 可经既有 `read_section` 下钻 `notes/agent.md §经历`。
5. **只读优先**：`/rings`、`/inject/preview` 均只读；写入口仍只有蒸馏/深睡两条产线。

## 12. 风险、回退与验证口径

| 风险 | 应对 |
|---|---|
| P0a 接预算可能改变既有注入结果 | 验收 = **逐字节等价**；不等价即回退（**不等价本身就是要查的隐藏行为差**） |
| 情境层误注入代价 > 漏注入（L2 代价权重） | 预算小起步（300）、独立槽不挤占相关性面、超预算**留痕可见** |
| cues 由模型产出 ⇒ 过拟合/漏填 | 兜底排序（A4）+ `check-cues-coverage` 报告态 |
| 新通道撑大契约 | 每通道独立开关；`enqueue` 计数可见；失败即 `attempted` 归零可见 |
| 混淆「未跑」与「通过」 | C2 的机检要求审计显式区分两者 |

**验证口径（贯穿全案）**

- **对账一律 node 工具**：PowerShell `ConvertFrom-Json` 对长行报假错（实测：报 410 条假错，node 复核 **0** 错）。仓内已有 `check-record-parity`。
- **「仓内绿」≠「运行态绿」**：发布前置口径全过，且部署后跑 `check-installed-features`。
- **每条缺陷闭合必须有工具证据**：不接受「接口成功」「单测通过」作为结案依据（`[原则] 结果验证重实证`）。
- **数字先对齐口径再下判断**（本文修订记录 R2/R5 的血的教训）。

---

## 13. 修订记录（v1 → v5 合并定稿）

> 我在本议题过程中**犯过的错**如实记录，因为**错因本身是本议题最有价值的部分**——
> 三条错误里有两条同源：**取数口径不严**。

| # | 版本 | 我原来说的 | 实测/真相 | 性质 |
|---|---|---|---|---|
| **R1** | v1 | 「`supply-assembly` 零消费者 = 死代码」 | 唯一消费者是 `scripts/supply-preview.mjs`（**离线 CLI**）⇒ **不是死代码，是运行时缺席**。**错因：grep 限定 `include:*.ts`，漏掉 `.mjs`** | 🔴 **方向性错误**（会让 P0 建错门：不排除 `scripts/` 则门白立） |
| **R2** | v1 | 根决策「**读侧事实源从 md 迁到 Record**」 | md 投影是 Record 的**逐字节可重现渲染**，两者等价；环记录本就是「Record 独有」⇒ **不迁移，只补环的独立通道** | 🔴 **方向性错误**（把"补一条通道"写成"换事实源"，风险被夸大、范围被写重） |
| **R3** | v1 | B4「让 `[原则]`/`[偏好]` 的 kind **归位**」 | `promoteVerdict('principle')` 的 `'principle'` 是**升格域字面量、非 RecordKind**；RecordKind `principle` 零消费者；与 `persona` **同属 value 环** ⇒ 归位收益近乎零、却要动存量记录 | 🔴 **方向性错误（有害）**，已撤回 |
| **R4** | v1 | 「**90%** 的步零材料」 | 分母含 907 条非首步（只有首步可能注入）⇒ **step1 中 49.3%**。**错因：分母口径错** | 🔴 事实性错误（严重度夸大 ~5 倍） |
| **R5** | v1 | 「快通道 **2.8%**，名存实亡」 | 同样分母错 ⇒ **16.5%**（12–16%）。**错因同上** | 🔴 事实性错误 |
| **R6** | v1 | 「`materialInSystem` 默认 false 且 P2b **已回滚**」 | 实测 `scheduler.json` = **`true`** ⇒ 代码默认 false / 持久配置 true / 文档说已回滚 = **三方不一致**，真实待办变成"先查是否真生效" | 🔴 事实性错误（说反） |
| **R7** | v1 | D-02 论据：环记录「被 `buildCandidates` 的 `file=''` 过滤丢弃」 | 那是**离线工具**的判据；活路径 `readCarrier` 是 `readFileSync` 读 md 文件 ⇒ **无 md 投影则结构上不可达**（论据更强，结论不变） | 🟡 论据错 |
| **R8** | v1 | P0 验收「**逐字节等价**」 | 活路径读 md + 自有预算 vs supply-assembly 读 Record + `DEFAULT_BUDGET` ⇒ **不可能等价**。已拆为 P0a（只接预算 ⇒ 等价可成立）/ P0b（环独立通道 ⇒ 候选等价 + 环差异清单）。**P0b 后并入 P6**（避免阶段碎片化） | 🟡 流程性自相矛盾 |
| **R9** | v1 | 「新增 4 个机检脚本」 | `check-ring-coverage` **已含 5 道**（⑤ 已查「KPI 函数在 lib 导出＝死登记」）⇒ 改为**只加 1 道判定、其余并入既有门**（`USER.md` 明载「设计极简抗堆叠」） | 🟡 违反既有偏好 |
| **R10** | v3 | 「`AGENTS.md` 的『60 模块』是**漂移**」 | `audit-fnspan.mjs:57` 明确排除 `.generated.` ⇒ **60 与 fnspan 口径一致**（差 1 = `criteria.generated.ts` 569 行）。真正不自洽的只有 `ARCHITECTURE.md`（55 vs 分项 53）。**错因：数字口径未先对齐就下判断** | 🟡 判断错 |
| **R11** | v4 | 「`episodes.jsonl` **停写**（按 8 小时 mtime 差推断）」 | 改为**更强**的证据：`src/` 内**无任何代码写它**（生产者已移除），ledger `type=episode` = 0 ⇒ 是 **orphan** 而非"最近没跑" | 🟢 由弱证据升级为强证据 |
| **R12** | v4 | 「架构深 10 是问题」 | 层深部分是被**扇入 0 的汇点**推深的（按最长路径计算，孤立汇点被推到最深）⇒ **层深不是问题，扇入 0 才是信号** | 🟢 判读修正 |

**元结论**：R1/R4/R5/R10 **同源**——**取数口径与判断面未先对齐**（grep 后缀、分母范围、生成物口径）。
这正是本方案要新建「接线侧 / 生产者侧 / 消费侧」三类门的原因：**它们抓的第一批对象，应该是我这种"看一眼就下结论"的判定方式。**

---

## 14. 施工进度回填（目标模式实跑记录）

> 本节记录 §9 施工卡的**实际执行结果**（含实测值与**对本文自身的修正**）。口径：只写已获工具证据者。

### 14.1 §9.0 三条存疑实测

| # | 结论 | 证据 |
|---|---|---|
| **Q1** | **已解决**：每步真实注入 **2391–2977 字符**（空 query 2391 / 带 query 2977）；`budgetTotal` 4000–4300；**`overBudget=false`** | `/inject/preview` 影子记账实测，并已并入 `/inject/stats` 长期可观测 |
| **Q2** | **已解决**：`materialInSystem` **确实生效**（代码默认 false / 持久配置 true / 文档说已回滚 的**三方矛盾**里，真值是 true 在工作） | `/mcl/config` 与 `scheduler.json` 双读；`sysBlockNonEmpty` 通道在工作 |
| **Q3** | **待补**（`layerCounts.E.profile` 口径） | 未做——不影响已施工阶段 |

> **Q1 的连带修正（对本文自身的订正）**：§5 的 **B5** 曾写「恒定面按 4000 装、无框架化约束」并**暗示安全带失效**。
> **实测否定该暗示**：2977 < 4300，**从未超**。⇒ B5 降级为「**无框架化**（结构性）」而非「超预算（事实性）」。
> 注册表那个争议的「≈2,800」（其算式内部不自洽）**大方向是对的**，真实区间 2391–2977。

### 14.2 已完成阶段

| 阶段 | 状态 | 关键证据（工具实证） |
|---|---|---|
| **P0a** | ✅ **完成** | ① 接线门 **先红**（精确抓到 `supply-assembly`，exit=1）→ **后绿**（exit=0）② `supply-assembly` 扇入 **0 → 1**，层级 L9 → L4 ③ 注入文本**逐字节等价 4/4**（sha256 全等）④ `/arch/assembly` 判定升为「存在 ∧ 未申报」⑤ 全量机检 65 → **67 pass / 0 fail** |
| **P2** | ✅ **完成** | `situation-key` **20 pass** · `ring-supply` **29 pass**；两件均登记 `check-runner`；架构门全绿 |
| **P3** | ✅ **完成** | `situation` 槽 + 注册表参数**同批落地**（避免"声明未执行"）；缺省下**逐字节等价 4/4**；`enabled` 与额度**都 honored**（拒"假可控"） |
| **P6** | ✅ **完成** | **环记录首次进入上下文**：每查询实测注入 **3 条环行**（Δ153 字符）· `budgetTotal` 4000 → **4300** · `overBudget=false` · cues 正确生成。注入内容正是「我欠用户」的三条承诺 ⇒ **前瞻记忆首次工作** |
| **P4** | ✅ **完成**（单元级） | 新模块 `src/distill-ring.ts`：四通道落库（route 无关）· 配方与 CLI 逐字一致。单测 **24 pass**（临时库根）· 接线探针 **5/5** · 提示词投影含四通道 · 全量机检 **68 pass / 0 fail**。**对账门抓出 2 个真缺陷**：① 库未建时凭空造游离事实源（改为拒绝）② **重提交整体替换 meta ⇒ 静默丢 `cues`**（改为旧键保留/新键覆盖），并把 `cues` 升为一等字段（进环 init + 事件载荷 + 重放） |
| **P4 E2E** | ⚠ **不可判定** | 手工触发蒸馏跑通 4 个根会话，但**无新内容可蒸**（ingest 全 `below-min-chars / chars:0` ⇒ 未产生 LLM 调用 ⇒ `writeDispatch` 未进入）⇒ 真机行为证据需等新的未蒸馏会话（本会话闲置后即为其一）。**不宣称已获证据** |
| **P5** | ✅ **完成**（单元/数据级） | ① 落库实现收敛为一份：`distill-ring.ts` → **`ring-commit.ts`**（6 通道，两产线共用）② 深睡 +2 通道：**`outcomes` 后果回收** + **`narratives` 经历叙事**（`applyNarratives` 写 `notes/agent.md §经历/<标题>`，幂等）③ 新通道**计入 `otherChannels`**（防"不进 attempted ⇒ 误判 landed"）④ 判据段进注册表 + 提示词增两字段与形状 ⑤ `test-ring-commit` **39 pass** |
| **P5 迁移** | ✅ **完成**（数据实证） | 新脚本 `migrate-episodes.mjs`（**默认 dry-run**）：257 行 → 过滤宿主样板与空正文 → **89 可迁 → 81 条唯一 `episode` 记录**；**幂等实测**（再跑仍 81）。**关闭 D-04a/D1**（`episode` kind 恒 0 → 81 条）。原文件只读不删 |
| **P5 顺带修** | ✅ | `CANDIDATE_NOISE`/`isNoiseIntent` 在 `distill.ts` 与 `distill-candidates.ts` **逐字重复**（两处都写"单一实现"）且前者**无消费方** ⇒ 死+重复，改转发归零 |
| **P5 E2E** | ⚠ **不可判定** | 深睡两通道的真机行为证据需等一轮**真实深睡**产出 `outcomes`/`narratives`；单元级+接线级已验证，**不宣称真机证据** |
| **P7（部分）** | ✅ **D3/D5/D4′/D10 完成 · C5 关闭为非缺陷** | ① **D3**：936 样本按预注册判据（目标 27.5%）取 **0.55**（实测 25.4%，旧 0.58 仅 9.3%）；⚠ **顺带实证「改注册表默认值不足以改变运行态」**——持久配置优先，须同时走 `/mcl/config`；三方一致已验 ② **D5**：`layeredScore` 的 `?? 0.35` 漂移改为构建期取注册表值 ③ **D4′**：实测 **`alphaVal` 在架构上不成立**（打分对象是索引行、无 valence 信号 ⇒ 假旋钮），改为把 `value` 环补进 `ringOrder` 使 **valence 可达**（同时修掉上轮引入的「valence 两条路都不可达」缺口）④ **D10**：`chars:0` 是「无增量」不是「裁决」，不再写 `decision.ingest`（实测它曾占台账 **21%** 且为**单一最大 type**）⑤ **C5 关闭**：`mcl-audit` 的 184 条无 `channel` 是 `mcl-ready`/`mcl-skip`（**通道无关**）⇒ **我的度量口径错，非缺陷** |
| **P7 三批** | ✅ **D8 完成 · D6/D7 关闭为非缺陷 · D11 一批完成** | ① **D8**：`sleep-selfcheck` 裁决引入 **`partial`** + `coverage`（原判决**完全忽略 `skipped`** ⇒ 「跑了 2 项都过」与「六项全绿」都报 `ok`；该缺陷**早在 2026-09-11 被记录、三周未修**）。防回归断言**并入 `check-observability`** + **反例证伪** ② **D7 关闭**：`closureOk=false` **不是检查失败**（reconcile exit 0、自检记 `pass`），是 informational 发现（42 行未解释差异 = 基线后旁路写入）——我原判断属**过度解读** ③ **D6 关闭**：现测 `corr=0.003`（527 行/2320 样本），**不是 −0.33**；判据 `\|corr\|>0.9 才冗余` **从未被违反**——同样是我**过度解读** ④ **D11 一批（本轮最大发现）**：**仓根 `engine/` 是 `skill/engine/` 的 7 件整目录重复**（git 追踪、**不被 package.json 打包**、`gen-criteria` 不重生成 ⇒ **必然静默漂移**；实测已漂移：`familiarThreshold` 停 0.58 / 缺 value 环 / 缺 wiring 块），且写门的自足定位 `../engine` **从仓内跑正命中它** ⇒ 一旦 format 分歧写门会用旧上限。处置：自足定位改**候选链**（优先单一真源）+ **删除仓根 `engine/`**（git 可取回；另备份）；**三处位置端到端验证**（均读到上限 30 字、31 字 exit=4）。顺带发现 `skill/scripts/` 是 `scripts/` 的 **17 件重名子集（0 件独有）**，**无门直接比对两份** ⇒ 我改一份漏一份即门红；已对齐 17/17 |
| **P7 剩余** | ✅ **已闭环** | ~~D1~~（**已关闭：计划方向有误**，见下「P7 四批」）· D11 余项（**三处判为良性**，理由见下同格） |
| **P8** | ✅ **收口（实测否决，不再重议）** | 原计划「恒定面**框架化**」（清单 → 框架+可展开指针）。**实测**：每步真实 **2391–2977 字符**，其中 P 层 **1756**，而 **`[原则]`+`[路径]` = 1532 字符（87%）且 18 条互不重复**（画像行与索引行**同名重复 = 0**）；**可压面只剩指针尾巴 302 字符（≈总 10%）**，压缩会把 `notes/lessons.md §X` 变缩写 ⇒ **引入新的指针解析失败模式**（与「模型须能按指针取详情」及 L2「误注入代价 > 漏注入」冲突）。⇒ **无既定的可收益压缩面**：恒定面之所以大，是因为它**几乎全是承载人格的习得原则**，不是「灌」。决策与测量已钉进注册表 `surface.injection.budgetNote`（免日后反复重议） |
| **P4 E2E** | ✅ **已取得（2026-09-14T05:28）** | **在 §15.5 的 Tier-1 修复之后自动发生**：同一会话此前恒判 `增量 129 字符 < 门槛 ⇒ skip`，修复后 **6588 字符（51×）⇒ 强制蒸馏 ⇒ 一次跑完**。`audit.ring-commit = {source:'distill', decisions:2, valences:1, events:3}`（**此前全会话恒 0**）· `records.jsonl` **1069 → 1080**（decision 1→3 · valence 1→2）· `episode.intent` 含 `[assistant]` · `stop=completed` · `route=memory` · `added=4 / rejected=0` · 水位 3440→3706。**完整证据见 §15.2** |
| **P5 E2E（唯一真开放项）** | ⏳ **待一轮真实深睡** | `outcomes`/`narratives` 两通道需**全会话停滞 ≥3h**；本会话活跃时日志显示 `deep sleep: 1 个会话探测未完成，本轮跳过（保守不睡）`——**该保守行为正确**。`write.consolidate` 末条仍为 2026-09-13T10:17。⇒ **不可由我触发，需会话停止活动**（自然发生） |
| **P7 四批** | ✅ **D1 关闭 · D11 完成** | ① **D1 关闭为「计划方向有误」**：`fast = sim≥阈值 && hasHighConf`，**`hasHighConf`（命中 `[原则]`/`[路径]`）才是实质条件**，`sim` 只是熟悉度代理 ⇒ 放宽 `hasHighConf` = **去掉实质条件只留代理**；注册表把它标成「未放宽的遗留门」是**误标**，已订正 ② **D3 副作用量化（补上轮欠的验算）**：0.58→0.55 会让 **26 条**（`sim∈[0.55,0.58)`）可能翻快通道 ⇒ **慢通道注入约 -11%（132→~117）**；记为**下轮验证目标** ③ **D11 主项**：`check-installed-sync` 加 **`--strict`** 并**首次登记进 runner**（此前**根本不在 `npm test`**）；一开即抓到 **19 件真漂移（全是 `.js.map`，功能面零漂移）** ⇒ 根因是部署一直**手工 ad-hoc**；补 **`deploy-installed.mjs`**（一条命令、**全扩展名**、两面语义显式区分）→ 部署后 `--strict` **绿** ④ **D11 余项三处良性**：`release.md`（0 引用＝合法空落点）· `whitelist.orphan`（0 引用死残留，**不擅动私人数据**）· `INDEX.md`（子文档注册表，体量即用途） ⑤ `maturation.enforce=false` 决策入注册表（拦阻率 57.4%>50% ⇒ 不可翻） ⑥ **全量机检 69 → 70 pass · 0 skip** |
| **P1（架构的账）** | ✅ **完成 · E1–E5 全结** | ① **Q3 结清**：独立计数 E 层画像行 = **25**，与 reconcile 报的 **25 完全一致**（全是**无标签**画像行，代码回落 E）⇒ **口径约定，非缺陷** ② **新门 `check-arch-sync.mjs`**：5 条断言（AGENTS 模块数 / ARCHITECTURE 模块数 / 注入预算 ⟷ 注册表 / `-share` 陈旧陈述哨兵 / 两审计脚本输出头标口径），**先红抓到全部 5 项 → 修 → 全绿**，并**反例证伪**（注入 99 → ② 立刻红）③ 文档订正：模块数 55→**63**、**删掉手写分项明细**（它漂移两次的根因）、预算 3000→**4000**、两审计脚本头部标口径 ④ 登记 `check-runner`（**68 → 69 pass**） |
| **P7 续（D2 改判）** | ✅ **完成** | **D2「慢通道二次检索」的问题基础不成立**（慢通道 130/132 有材料，不存在"大面积零材料"）⇒ 改判为「**修审计字段**」：`mcl-step` 全部 7 个站点显式带 `phase: inject\|compliance`（另给合规行补 `materialChars`/`materialStep`）；`check-observability` 并入断言 + **反例证伪**（临时去掉一处 phase ⇒ 立刻红 ⇒ 还原 ⇒ 绿） |

**A3 语义订正的连带**：`buildCandidates` 把 `file === ''`（无投影）与「无内容」拆开后，
`test-supply-assembly` 的旧断言（「环记录计入 notInjectable」）**断的是被修正的旧语义** ⇒ 已升级为新语义
并补 `ring` 桶断言（该测试 39 → **41 pass**）。

**棘轮三次抓到我自己的错**（这是它存在的意义）：
① `situation-key` 实际已被 `ring-supply` 消费却仍申报 pending ⇒ 撤销申报；
② `panel-shared` 导出 37 > 35 ⇒ 两个 helper 改模块私有；
③ `check-hardcode` 抓到我文档示例里写了盘符 `D:/proj`（**开源红线**，虚构示例也不许）⇒ 改为 `/repo`；
④ `check-changelog` 抓到我造了重复的 `### Added` 小节（本仓 Unreleased 是 Added/Changed/Fixed **各一份**的整段）。

### 14.3 未完成阶段

| 阶段 | 状态 | 说明 |
|---|---|---|
| **P1 剩余** | ✅ | 见 §14（**本表不再维护逐卡状态**） |
| **P4** | ✅ | 见 §14 |
| **P5** | ✅ | 见 §14 |
| **P7** | ✅ | 见 §14 |
| **P8** | ✅ | 见 §14（收口：实测否决） |

> ⚠ **本表原先逐卡手写「⏳/✅」状态，到 §14 出现后就成了第二份状态副本 ⇒ 实测已陈旧**（P4/P5/P7/P8 早已落地而此处仍写 ⏳）。
> **状态只保留一处 = §14 施工进度回填**；本表只列卡与验收口径。**教训同 E1**：手写明细必然漂移，消除漂移面优于反复校正。

```
施工进度（**唯一状态源 = §14 本表**）：P0a ✅ · P1 ✅ · P2 ✅ · P3 ✅ · P4 ✅ · **P4 E2E ✅（§15.2）** ·
P5 ✅（单元/数据级）· P6 ✅ · P7 ✅ · P8 ✅（实测否决）· **唯一开放：P5 E2E（深睡两通道，待 ≥3h 全会话停滞）**
全量机检：**PASS（70 pass · 1 xfail · 0 skip）**
架构门：  ✅ 全部在阈值内（0 环 · 0 桥 · I1 ≤120 · I2 ≤12 · 新模块 Deps ≤6）
运行态：  环记录 3 条在注入面内（前瞻记忆首次工作）；3 个只读端点 200
```

---

## 15. 重启后复核（2026-09-14）与下一步方案

### 15.1 复核结论（全部实测）

| 项 | 实测 | 判定 |
|---|---|---|
| **运行态是否回退** | 装副本 **194 / 194 逐件 sha1 一致**（`check-installed-sync --strict` **绿**） | ✅ **未回退**——上轮警告的「未提交 + 宿主重新物化 ⇒ 退回已提交版本」本轮未发生 |
| 门禁 | `PASS（70 pass · 1 xfail · 0 skip）` · 架构门 ✅ · 部署面 PASS · 硬编码 ✅ · 投影新鲜 PASS · 架构文档⟷实测 PASS | ✅ 重启后仍全绿 |
| 情境层是否在工作 | 本会话注入面含**三条 `[环·承诺]`**；`scheduler.json` 的 `mclFamiliarThreshold = 0.55`，`/mcl/config` 三方一致（registry / persisted / **running**） | ✅ P2/P3/P6 + D3 在运行态生效 |
| **我方工作是否已提交** | **未提交**：`src/` 19 M + 10 ?? · `scripts/` 8 M + 6 ?? · `docs/` 1 M + 1 ?? · `skill/` 4 M · `lib/` 49 · `engine/` 7 **D** · `CHANGELOG.md` · `package.json` = **105 件** | ⚠ **待提交** |
| 是否被用户提交夹带 | 我方关键文件最近提交仍为 `f38d73e`（新增件为空） | ✅ **未夹带**，改动干净留在工作区 |
| **外部重大变化** | 用户提交 `db00020 fix(distill): 空闲定时器误挂宿主对象 ⇒ **全链静默失效两天** + 绑定句柄形态门禁`（04:13）+ `a5e42d7` 补回归（04:15） | 🔴 **这解释并解除**了 P4/P5 E2E 不可得的根因——此前 `deep-sleep = 0` / `ring-commit = 0` 部分源于**链处于静默失效态** |
| `storeMode` | 用户 `2ed82e3` 使其**真正可调**；现值 `dual`（非 `record`） | ⚠ 见 §15.2 P2：`record-address` 申报到期条件需据此复核 |
| E2E 证据面 | 〔**本节是当日快照**，记录复核那一刻的状态〕台账 `ring-commit = 0` · `deep-sleep = 0` · 库内环记录数**未变**（decision/outcome/valence/relation 各 1 · commitment 3 · association 2）· `episode = 81`（我迁移那批） | ⚠ 当时 P4/P5 真机证据仍未取得（阻塞根因已由用户修复）→ **后续结果见下**：**P4 E2E 已于同日 05:28 取得（§15.2）**；**P5 仍待深睡** |
| ⚠ 非我方产物 | `deliverables/arch-overview-2026-09-14.{json,html,png×4,visual-check.html}` = **7 件 `??`** | 🔴 **提交时必须排除**，否则误带他方产物 |

### 15.2 下一步方案（按优先级）

**P-1 · 提交我方未提交工作（最优先）**
理由：**未提交 + 宿主任何一次重新物化 ⇒ 运行态退回已提交版本**（`AGENTS.md` 已记该风险，本轮侥幸未发生）。命令（**排除清单内建**）：
```bash
git add src scripts docs skill lib engine CHANGELOG.md package.json   # 逐路径，**不用 -A**
git status --short                      # 复核：deliverables/ 不得出现在暂存区
git commit -m "feat(memory): 拟人化情境层（situation 第三槽 / 环记录落库）+ 接线门与架构文档门"
```
建议拆两个提交：① **能力**（`src/ring-*` · `situation-key` · `supply-assembly` · `ring-commit` · `panel-*` · `mcl` · `deepsleep-*` · `distill-*` + 注册表 + 3 个单测）② **基建**（`check-arch-sync` · `deploy-installed` · `check-installed-sync --strict` · 审计 `phase` · `engine/` 删除 · 文档口径订正）。

**P0 · 取 P4/P5 真机证据（触发链已查清并武装，等会话闲置即自动发生）**
已实测查清**为何拿不到**（不是没执行，是**设计上跳过**）——调度器日志原文：
```
04:26:03  distill: b7a95e42 已恢复活跃（status=running），跳过     ← 本会话被跳过的真实原因
04:15:25  distill: b7a95e42 空闲定时器已武装（10min 后到点）        ← 用户 db00020 的修复在工作 ✓
22:07:45  distill: b7a95e42 增量 179 字符 < 门槛，水位推进 2276→2676（skip-normal）
```
⇒ 机制：**蒸馏只处理已停下的会话**（`status=running` 一律跳过，这是对的——不蒸馏进行中的轮次）；
而本会话的空闲定时器**已武装**，积累的增量远高于门槛 ⇒ **本会话停止活动 ≥10min 后会自动蒸馏全部累积内容**。
**这不是"未完成的工作"，而是"必须等会话闲置"的环境前置**（我在本回合内无法观测自己）。

**验证命令（闲置后跑一次，一次给结论）**：
```bash
node -e "const R=require('fs').readFileSync(process.env.USERPROFILE+'/.dsh/suite/knowledge/audit/ledger.jsonl','utf8').split(/\n/).filter(Boolean).map(l=>JSON.parse(l));
console.log('ring-commit 行 =',R.filter(r=>r.type==='audit.ring-commit').length);
const k={};require('fs').readFileSync(process.env.USERPROFILE+'/.dsh/skills/managing-memory/.records/records.jsonl','utf8').split(/\n/).filter(Boolean).map(l=>JSON.parse(l)).forEach(r=>k[r.kind]=(k[r.kind]||0)+1);
console.log('环类记录 =',JSON.stringify(k))"
```
**判据**：`ring-commit > 0`，且环类 kind 增长（**2026-09-14 基线**：decision=1 · outcome=1 · valence=1 · relation=1 · commitment=3 · association=2 · episode=81 · 总 1069）。

### ✅ **P4 E2E 已取得（2026-09-14T05:28，同日闭环）**

**触发链（调度器日志原文）**：
```
05:18:17  distill: b7a95e42 空闲定时器已武装（10min 后到点）
05:28:17  distill: b7a95e42 预筛通过（信号词=true，大段 6588≥4000 强制蒸馏）→ 进入分段蒸馏
05:28:52  distill 环记录落库：决策 2 · 承诺 0 · 关系 0 · 价态 1（事件 3）
05:28:53  distill: b7a95e42 段 1/1（seq 3445→3706）stop=completed route=memory → shoucang 入库 4 / 拒收 0
```

**这是 §15.5 那个 Tier-1 修复的直接兑现**：同一会话此前恒判 `增量 129 字符 < 门槛 ⇒ skip`，
修复后 **6588 字符（51×）≥ 4000 ⇒ 强制蒸馏 ⇒ 一次跑完**。

| 判据 | 实测 |
|---|---|
| `audit.ring-commit` | **`{source:'distill', decisions:2, valences:1, events:3}`** —— 全会话此前恒 0 |
| `records.jsonl` | 总 **1069 → 1080**；`decision` 1→**3** · `valence` 1→**2**（与 ring-commit 计数精确吻合） |
| `episode.intent` | 含 **`[assistant]`**（修复前不可能出现）⇒ 助手侧文本确实进入了材料 |
| 蒸馏判定 | `stop=completed` · `fclass=ok` · `route=memory` · `added=4` · `rejected=0` · `failed=0` |
| 水位 | `3440 → 3706`（整窗完成，水位=maxSeq） |

**产出的环记录（语义正确，非噪声）**：
- `[decision] 蒸馏助手侧文本改读 v3 assistant/message，删 v0 assistant/chunk 分支`
- `[decision] 版本钉点判据化：只差 docs 属良性，差到 lib/ 必须重钉`
- `[valence] [价态] 测试按想象的形状写断言而长期全绿 · 否定`

**同时产出的知识索引行**（同一次 run，`added:4`）——**系统真的从本次会话学到了东西**：
`[教训] 断言照记忆形状 · 真实样本未覆盖/长期假绿/漂移盖章` ·
`[环境] 分帧 zstd 解压 · 内置解压只解首帧/须按魔数逐帧` ·
`[flow] 架构档机检与落点` · `[flow] 本地插件发布链`（皆带 `→ notes/… §…` 指针）

### ⏳ P5（深睡）E2E —— 仍未取得，原因已两次实测

`write.consolidate` 末条仍为 **2026-09-13T10:17**；带 `outcomes/episodes` 的 `ring-commit` = **0**。
深睡需**全会话停滞 ≥45min 探针 + ≥3h 触发**，而本会话始终活跃（日志可见
`deep sleep: 1 个会话探测未完成，本轮跳过（保守不睡）` —— 该保守行为**正确**）。
⇒ **P5 的 `outcomes`/`narratives` 两通道待一轮真实深睡**（本会话停止活动后自然发生）。

若仍为 0：查调度器日志 `~/.dsh/super-injector/shoucang-scheduler.log` 是否出现 `distill-run`（有 run 无 ring-commit ⇒ LLM 未产出四通道，属**正常可能**，非代码故障）。
深睡那条同理：需**全会话停滞 ≥3h**（日志已见 `deep sleep: 1 个会话探测未完成，本轮跳过（保守不睡）` —— 该保守行为正确）。

**P1 · D3 副作用实测（欠账）**
阈值 0.58→0.55 的**推算**：26 条 `sim∈[0.55,0.58)` 可能翻快通道 ⇒ 慢通道注入约 **132 → ~117（-11%）**。待新会话积累后从 `mcl-audit` 复核；**若观察到该位移，属预期内、非回归**。

**P2 · 与用户新工作的交叠面（已自行判因处置完毕）**
1. ✅ **已决并已办**：`record-address` 的到期条件（「`storeMode=record` 立项，或删除该件」）**已按"删除"结清**。
   判因（实测，非感觉）：`record` 档被 schema **明确拒收**（`z.union([z.const('md'), z.const('dual')])`），
   且**两条配置通道都挡住它**（Config 当场抛；`applySuiteConfigFile` 用从 schema 派生的白名单 + 逐键过 `Config()`，非法值 warn+忽略）；
   观测面亦自述 `store.allowed=["md","dual"]`·note「record 未实现，故不提供」⇒ 该件**永无接线可能**，保留即纯堆叠。
   处置：删除源码 + 3 个构建产物 + 其 J 块单测（10 条）+ `ARCH_MODULES` 条目 ⇒ 注册表 `wiring.pending` **归零**，
   **接线门收到最紧（零豁免）**，并**反例证伪**（临时零扇入模块 ⇒ 立刻红）。
2. **存储内核：维持"不引入 SQLite/第二内核"——这是已有实测支撑的判断，不是待议项。**
   依据：① 读侧事实源（md 投影）**已与 Record 逐字节等价**（`storeMode=dual` 的写时自证 + `check-record-parity` 对账）；
   ② 环记录走**独立通道**（`records.jsonl` 的 `file=''` 环记录 + 现场生成，**不投影**）；
   ③ 「断言图内核」**已有落点**：`src/assertion-graph.ts` + `association-propose`/`association-supply` 就建在
   **既有 Record 事实源 + 事件流**之上（`ring-events` 可重放）——**这正是"不新开第二个库"的实现**。
   ⇒ **不需要** SQLite，也**不应**重写 `readCarrier`；若将来确要引入第二内核，须先证伪上面三条（那才构成立项理由）。

**P3 · 可选清理（低风险）**
`principle`/`preference` 死词汇（E9，走迁移+对账）· `whitelist.json.orphan-20260911`（知识区 495 B / 0 引用，**处置权在你**）。

### 15.3 声明位同步**已执行**（2026-09-14 · 照 `context-supply-plan.md` §75 的先例）

**发现的隐患**：`git status -sb` 显示 **`ahead 5`**（我的 3 笔 + 用户的 `db00020`/`a5e42d7` 全未推送），
而 profile 声明位钉的是 **`#4ea0d60`**（用户 02:56 的提交，**早于**定时器修复）⇒
**宿主任何一次重新物化都会把运行态退回 `4ea0d60`：不只丢掉本轮全部能力，还会把「空闲定时器误挂宿主对象」那个 bug 装回来（静默失效两天重演）**。

**执行（照 §75.2 配方，逐条核实）**：

| 步骤 | 结果 |
|---|---|
| 推送 | `4ea0d60..077a8f3  master -> master`（**exit 0**；含用户 2 笔 + 我 3 笔） |
| 备份 | `package.json.bak-ref-20260914-123644` + `pnpm-lock.yaml.bak-ref-20260914-123644` |
| 改声明位 | `#4ea0d607…` → **`#077a8f3c784f860b21cc4ac7c03f67b35e55690e`** |
| install | **`pnpm install`**（pnpm v11.7.0；**不加** `--legacy-peer-deps`——那是 npm 旗标）⇒ `Packages: +1 · Done in 33s` · **未触发批量删除保护**（与 §75.2 实测一致） |
| **版本钉点** | **三处一致 @ `59acb511`**（声明 / 锁定 / 实装）✅ |
| 装副本 | **191 / 191 逐件 sha1 一致** · 部署面 **PASS** · 特性 **31 项齐** ✅ |
| 装上去是新码吗 | `lib/ring-commit.js` · `ring-supply.js` · `situation-key.js` **全在** · `lib/record-address.js` **已消失** ✅ |
| 热重载 + 活体 | **6/6 端点 200** · MCL 三方一致 `0.55` · `plugin.pendingWiring=[]` · `store.allowed=["md","dual"]` · 注入面含 **3 条 `[环·承诺]`** ✅ |

⇒ **隐患消除**：今后任何一次重新物化都会拉到 `59acb51`（含定时器修复 + 本轮全部能力），不再退回。
**且本次已二次重钉到 `59acb51`**（首钉 `077a8f3` 后又有 2 笔文档 + 1 笔测试提交）⇒
**声明位 == 本地 HEAD == 远端 `origin/master` == `59acb51`（零偏移）**。第二次 `pnpm install` 实测
`Packages: +1 · exit 0`（耗时 **7m47s**——网络慢，与同期一次 `git push` 的 `Connection was reset` 同源；
**不是卡住**，重试即通）。

> 📌 **偏移政策（可复用判据，取代"逐笔追平"）**：
> **声明位落后 HEAD 是否要紧，只看落后的提交有没有动 `lib/`（或 `skill/`/`scripts/`）**——
> · **只差 `docs/`/`CHANGELOG`** ⇒ **良性**：重新物化得到**同一运行态**（`lib/` 不变），**不必重钉**；
> · **差到 `lib/`（含 `src/`）** ⇒ **必须重钉**，否则重新物化会退回旧码。
> `check-version-pin` 的判据是「声明 / 锁定 / 实装」**三处互相一致**，**不含**与 HEAD 比较 ⇒ 良性偏移下仍 PASS。
> （这条政策本身就是本轮教训的固化：先前我把它写成"落后 1 笔"的一次性描述，随即就不准了——**写判据，别写快照**。）

### 15.4 收尾清理：E9 死词汇 + orphan 白名单旧副本（2026-09-14）

#### ① E9：`RecordKind` 死词汇 `preference` / `principle` —— 已删

**判因（非印象）**：`kindOfLine` 把 P 层标签**一律**派生为 `persona` ⇒ 这两个 kind **永不产出**；
实测库内 **`principle = 0` · `preference = 0`**（`persona = 26`）⇒ **无需迁移、无需对账**，纯词表收敛。

**⚠ 关键区分（我最初误判过，差点误删）**——同名不同域，**只能删其中一份**：

| 出现处 | 性质 | 处置 |
|---|---|---|
| `record-store.ts#KINDS` · `rings.ts#RING_OF_KIND` | **RecordKind 词表** | ✅ **删**（两表由 `check-ring-coverage` 双向机检一致，必须同步） |
| `criteria.ts#promoteVerdict('principle'\|'path')` · `deepsleep-run.ts` 调用 | **升格域字面量**（判据域） | ❌ **不能动** |
| `scripts/*` 的 `principles` 通道名 · `panel` 契约的 `principleRows` | **通道名 / UI 显示名** | ❌ 不能动 |

**实证**：`typecheck` 零错 · `build` 成功 · **环覆盖门 PASS**（双向：KINDS ⟷ RING_OF_KIND 逐项一致）·
`test-association-ring` **52 pass** · `test-decision-ring` **49 pass**。

#### ② orphan 白名单旧副本 —— 已删（含逐字备份）

**文件**：`~/.dsh/suite/knowledge/whitelist.json.orphan-20260911`（495 B · 2026-09-06）

**判因**：它是**白名单还在知识区时**的副本；2026-09-09 白名单重构后**迁到库根自持**
（`targets.loadWhitelist(root)` 读 `<root>/whitelist.json`，缺则回落 `targets.ts#BUILTIN`）。
活副本 = `~/.dsh/skills/managing-memory/whitelist.json`（431 B · 09-11），字段与它**同构**（`routes`/`indexTargets`/`notes` 全同）。
全仓 **0 处引用**；且它**零私人数据**（只有标准 notes 文件名，不是私人路径）。

**备份（三重，故可删）**：活文件在库根 · 结构缺省在 git 追踪的 `targets.ts#BUILTIN` · **原文逐字留存于下**：

```json
{
  "version": 1,
  "library": "shoucang-local",
  "description": "守藏本地知识区白名单（ADR-0002 阶段1 定稿）——记忆库同构降级兜底库，只收 memory 路由；project 路由仅作 pending 积压兜底（不入正式库，白名单不拦积压但记审计）",
  "routes": ["memory"],
  "indexTargets": ["MEMORY.md", "USER.md", "AGENT.md"],
  "notes": ["env", "tools", "flows", "lessons", "release", "user", "agent"],
  "cardTypes": [],
  "updatedAt": "2026-09-06"
}
```

**删除纪律**：**只按确切文件名删，不按通配符扫删**（用户全局原则）；删除前已确认无引用、无私人数据、等价内容已留存。




### 15.5 明确不做

- **不重议 P8**（恒定面框架化）：实测已否决并钉进注册表 `surface.injection.budgetNote`（P 层 87% 是 18 条互不重复的 `[原则]`/`[路径]`，而验收要求不得裁）。
- 不改 `maturation.enforce`（拦阻率 57.4% > 50%，翻转会冻结升格；依据已入注册表）。

### 15.6 🔴 Tier-1 缺陷：蒸馏/深睡一直看不到「助手侧」内容（2026-09-14 修）

**由用户一问引出**：「14 分钟了为什么没有蒸馏」。查日志发现蒸馏**准时跑了**（04:52 武装 → 05:02 到点），
却判 `增量 129 字符 < 门槛 200 ⇒ skip-normal`——而该会话当时已有 **3500 事件 / 全流 161k 字符**。

**归因链（全实测）**：逐帧解压真实转录（带校验和的 zstd 分帧，须按魔数逐帧解）⇒
**`assistant/chunk` = 0 · `assistant/message` = 578** ⇒ 而 `textPartsOfEvent` 的助手分支读的是 **v0 的 `assistant/chunk`**
⇒ **助手文本一字符都进不去**（129 字符 = 16 条真实用户消息，与日志精确吻合）。

**性质**：与 **2026-09-13 修的 `user/message`**（按事件类型取文本、形状隔代变了）**同一类**——当时只修了用户侧。
**影响面**：全仓**仅此一处**读 assistant 事件；深睡痕迹来自 `readDistillAudit` 而非原始事件 ⇒ **无第二副本**。
**修复效果（用已部署 lib 跑真数据）**：同窗口 **129 → 16,917 字符**；未消化增量 **3,185 字符** ⇒ **越过门槛**；
段文本首次出现 `[assistant]`。
**回归门**：扩展既有 `test-distill-source-filter.mjs`（不新建）——并指出**原断言把缺陷钉成了"预期行为"**
（它断言 `assistant/chunk` 被收录 ⇒ 永远绿，真实形状从未被覆盖）。**这是一条独立教训**：
**断言写给"我记得的形状"，等于给漂移盖了章。**

---

_建立 2026-09-14 · 合并三份前序文档（缺口分析 / 扩展方案 v4 / 架构审查）· 维护走仓内文档惯例_
