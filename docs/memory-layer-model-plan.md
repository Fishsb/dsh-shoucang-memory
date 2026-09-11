# 记忆核心 v2.2：三层生效模型（Persona / Procedural / Episodic）+ 统一打分 + 成熟度

> **状态：✅ 已实现**（M4–M6：`2c85b88`；`scoreWeights=v2` 于 `00422f1` 依据模拟证据翻转，`maturationEnforce` 仍 false 并有据不翻；ADR-128/130）。本档保留为外部研究依据与判因记录；实施进度与决策数字见 `memory-core-roadmap.md` 与 `memory-m5-decision.md`。

> **性质**：概念模型重构方案（先文档后代码）。回答的问题：**"经验"与"画像"不只是内容不同，它们的生效方式与权重不同** —— 这一直觉需要被建模成架构，而不是靠标签约定。
> **判因**：现状把三类语义不同的东西塞进同一套"标签 + 同一 cap"里：① **恒常人格**（身份/边界/习惯）② **情境经验**（教训/环境/工具）③ **任务型步骤**（路径）。它们**生效条件不同、权重不同、预算来源不同**，但代码里只有"索引行 / 画像行"两种载体 + 一个 `level` 档位。结果就是：**写侧把新成长写成画像行 → 注入侧不收画像行 → 恒常层停止生长**（v2.1 R1 已证），而情境经验与恒常人格**争同一份预算**。
> **不变量**：单库化 + 多级指针 · 深睡 done 才推水位 · 运行态不入库 · 零硬编码 · 单一实现 · 写门纪律 · 不新增常驻注入点。
> **关系**：v2 = 判据可测；v2.1 = 写入可测（载体契约/回执/对账）；**v2.2 = 生效可建模**（层 / 权重 / 成熟度）。三者递进，不互相替代。

## 1. 外部总结（可执行的 9 条 · 带出处）

来源：[Generative Agents (UIST'23)](https://ar5iv.labs.arxiv.org/html/2304.03442) · [Human-Inspired Memory Architecture for LLM Agents（Microsoft, arXiv 2605.08538）](https://arxiv.org/html/2605.08538) · [ACT-R 整合理论](http://act-r.psy.cmu.edu/wordpress/wp-content/themes/ACT-R/workshops/2004/IntegratedTheory.pdf) · [AI Agent 记忆类型综述](https://atlan.com/know/types-of-ai-agent-memory)

| # | 结论（外部） | 对我们的含义 |
|---|---|---|
| E1 | **检索是加权组合**：`score = α_rec·recency + α_imp·importance + α_rel·relevance`，GA 取 α=1 并对三项 min-max 归一；recency 用 0.995/小时衰减，importance 由 LLM 打 1–10，relevance 用余弦 | 我们的召回只有 relevance（dense+lex）+ activity 降权，**缺 importance 分量** |
| E2 | **高层推断（reflection）也是记忆**：GA 的 reflection 存回同一条 memory stream，**与观察一起参与检索** | 我们的 `[原则]` 相反：**永久全量注入**、不参与相关性竞争 ⇒ 占预算且与情境无关 |
| E3 | **三层时间尺度**：短期 hot cache（分–时）/ 中期 episodic（天–周）/ 长期 semantic（永久，图） | 守藏只有"索引（常驻）+ notes（按需）"两层，**缺中间层** |
| E4 | **importance 五因子**：Recency .25 / Frequency .25 / Bayesian Surprise .20 / Entity Salience .15 / Outcome .15 | 可作我们 importance 的骨架（先用可得信号：频次/出现位置/长度） |
| E5 | ⚠ **recency 判别力极低**：MSR 校准后 content length .363、turn position .325、**recency 仅 .019** | 支持我们"索引行禁日期戳、靠 activity 而非新鲜度排序"的既有选择，**别提高 recency 权重** |
| E6 | **成熟度（maturation）**：新语义条目初生 **silent（A≈0.03）**，sigmoid 成熟：**一周 A=0.5、两周 A>0.9**；**低于阈值仍可 implicit priming**（影响其他记忆的相关性打分） | 我们把"跨日再现"当软判据；应升级为**显式 activation 变量**，并让未成熟条目参与打分但不注入 |
| E7 | **遗忘 = 指数衰减 + 干扰**：`I(t)=I₀·e^(−λt)`，λ=0.001（半衰期 ≈29 天）；干扰式（retroactive .6 / proactive .4）；渐进降级 L0 全文 → L5 tombstone | 我们的 `activity.jsonl` + `forgetOps/archive` 已是同构实现，**只缺 half-life 语义与分级降级** |
| E8 | **检索是 hybrid 且分层优先**：hot cache > 温存 episodic > 语义图；结果合并去重 + recency boost | 我们已有 RRF 融合 + 同 § 抑制 + 冷降权 ⇒ **方向一致**，缺"层优先"这一维 |
| E9 | **两条硬经验**：① **激进合并有害**（48.4% vs 78.4%）→ "consolidation should **deduplicate, not summarize**"；② **提示里带日期戳 +10pp** | ① 我们的深睡只做去重/提纯、不做摘要合并 ✅ 与最佳实践一致；② 与"索引行禁日期"不矛盾（**注入面**可带时间上下文，**库行**保持无日期） |

## 2. 你的直觉 vs 外部模型（对齐结果）

| 你的表述 | 学术对应 | 判定 |
|---|---|---|
| "记忆是一些经验" | episodic + semantic（E3） | ✅ 对齐 |
| "画像 = 行为模式、认知、性格、习惯" | persona / identity + **高成熟度语义**（E2/E6） | ✅ 对齐（研究里人格是语义层的高激活部分） |
| "画像所有环境实时生效" | always-on core（MemGPT/Letta core blocks；GA 的 persona 描述常驻） | ✅ 对齐 |
| "记忆遇到相关性任务/环境才调用" | relevance-gated retrieval（E1） | ✅ 对齐 |
| "他们生效的权重不一样" | **分层优先 + 不同打分函数**（E8 + always-on 不参与竞争） | ✅ **准确，且是当前架构最缺的一维** |
| "（隐含）时间越近越重要" | ❌ E5：recency 判别力 ≈.019 | ⚠️ 建议**降低** recency 权重 |

## 3. 守藏现状与目标模型的偏差（逐项实测）

| # | 偏差 | 证据 | 后果 |
|---|---|---|---|
| D1 | **恒常层停止生长**：写侧的新成长都落画像行，注入侧只收 `^[tag]` | `panel.ts:277`；AGENT 画像行 4 条 / USER 5 条**全不可见** | 你观察到的"画像不动" |
| D2 | **高层认知被放进 always-on**：`[原则]`（认知/思维模式）与 `[经验]`（情境经验）**同档同权**，且原则永久全量注入 | AGENT.md 现状：`[原则]×3` 全量注入、`[经验]×1` 也在；而 GA 的 reflection 是**参与相关性检索**的（E2） | 预算被与情境无关的原则占掉；经验层反而没有检索权重 |
| D3 | **缺 importance 分量** | 召回只有 relevance（`vec.ts` dense+lex）+ activity 降权 | 关键结论与琐碎条目同权 |
| D4 | **缺成熟度变量** | 判断"是否升格"靠 `≥3 条痕迹` 的计数（`distill.ts:283`），没有 activation 0→1 的显式曲线（E6） | 新原则"一提炼就永久生效"，无观察期 |
| D5 | **缺层优先**：索引/notes 是"常驻 vs 按需"两态 | `readIdx` + `notes` 指针 | 无"hot / warm / semantic"三级优先（E3/E8） |
| D6 | **缺 priming** | 冷条目只降权（`activity.jsonl` → coldFactor），不参与同主题排序（E6） | 未成熟/冷条目的隐性关联被浪费 |
| D7 | **`[经验]` 语义归属混乱** | 标签表里 `[经验]` 挂在 AGENT（"学习史"），语义却是情境经验（E1/E3） | 该进检索层的项被当成 always-on 项 |

## 4. 目标模型：三层生效（P / R / E）

| 层 | 语义 | 生效方式 | 预算来源 | 判据（入册门槛） | 载体 |
|---|---|---|---|---|---|
| **P · Persona/Identity** | 身份 · 使命 · 边界 · **性格** · **认知模式** · 稳定习惯 | **always-on（不参与相关性竞争）** | 独立配额（`surface.injection.carriers.profile`），先占预算、不可被经验挤掉 | **跨环境稳定**：≥2 环境 或 ≥3 次复现；且**非任务专属** | `AGENT.md`/`USER.md` 的 `[..]` 索引行 + `- … ← 源:` 画像行（v2.1 修复后同时注入） |
| **R · Procedural** | 可复用**任务路径**（`[路径]`，AWM 语义） | **任务型门控**（按任务类型匹配；复用 ACT-029 MCL 快通道的熟悉度分流） | 按需（命中该任务类型才注入） | 同型 ≥2 次 ∧ 跨会话 ≥2 ∧ **只从成功任务**归纳 | `AGENT.md` 的 `[路径]` 行（carrier=`procedural`） |
| **E · Episodic/Semantic** | 教训 · 流程 · 环境事实 · 工具 · **经验/学习史** · 知识索引 | **相关性门控**（top-k 竞争） | 剩余预算（P/R 之后） | 四问 + 唯一性硬门（v2 已建） | `MEMORY.md` + `notes/*` |

**统一打分（E 层；参数入 `criteria.json`，可 A/B）**：
```
score = α_rel · relevance(cosine+lexical, RRF 融合)      # 现行
      + α_imp · importance(1..10 或代理：长度/位置/访问频次)  # 新增（E1/E4）
      + α_rec · recency(activity 命中衰减)                  # 权重压低（E5）
默认：α_rel = 1.00 · α_imp = 0.35 · α_rec = 0.10
```
**成熟度（激活）**：`A(0)=0.3`；每次**跨日再现** +0.2（上限 1.0）；**A ≥ 0.5 才允许升格**为 `[原则]`/`[路径]`；A < 0.5 的条目 **不注入但参与打分（priming）**。⇒ 把"跨日再现"从软判据升级为显式变量（E6），并把 v2.1 的 `consolidate.support.*` 门槛挂到 A 上。

## 5. 逐项调整清单（对应 D1–D7）

| 项 | 动作 | 落点 |
|---|---|---|
| **A（前置·必修）** | 修 `readIdx`：按 **carrier 渲染**（v2.1 M3）——画像行进注入面 | `panel.ts:275-282`；配额 `carriers.profile ≤3/档` |
| **B** | 标签→层映射表（`layer = persona｜procedural｜episodic`）写入注册表并生成投影；`[经验]` 归 **episodic** | `criteria.json` + `criteria.generated.ts` + spec §1 |
| **C** | AGENT.md 增 **`[性格]`/`[认知]`** 两类（P 层）；`[原则]` 语义收窄为"跨任务方向指引"，与 `[认知]`（思维模式）分离 | `spec §5.5` + 深睡 prompt（生成段） |
| **D** | 打分加 importance 分量（先取可得代理：**内容长度 + 出现位置 + 访问频次**，按 E4 的骨架）；recency 权重压到 0.10 | `src/vec.ts` + `src/targets.ts#recallIndex`（单一实现） |
| **E** | 成熟度 activation 显式化：`audit/maturation.jsonl`（`{target, A, lastSeen, hits}`）；升格门槛改读 A | `src/distill.ts`（深睡归纳）+ `src/activity.ts` |
| **F** | priming：A<0.5 条目参与同主题排序但不注入指针 | `recallIndex`/`recallRanked` 的候选择序 |
| **G** | 三层可观测：注入占比（P/R/E）、各层增长率、成熟度分布 → 并入 v2.1 的 `/reconcile` 与运行面卡片 | `scripts/memory-reconcile.mjs` + `panel.ts` + `client.js` |

## 6. 迁移（零行为 → 影子观测 → 切换）

| 步 | 内容 | 行为变化 | 回滚 |
|---|---|---|---|
| **W1** | 注册表加 `layer` + `scoreWeights` + `maturation` 参数；生成投影；机检（carrier↔layer↔渲染器 三方一致） | **零** | 删字段 |
| **W2** | 影子打分：新公式与现行公式**并行计算**并写入审计（不改变实际排序）；maturation 只记不算 | 零 | 关 `shadowScore=false` |
| **W3** | 切换：E 层用新公式排序 · P 层渲染画像行 · 升格门槛改 A；用 `recall-eval --since/--sids` 做 A/B | **行为变更（唯一）** | `scoreWeights` 回默认 / `carriers.profile=0` / `maturation.enforce=false` |

## 7. 验收（可测）

1. **层归属**：任一索引行都能回答"layer=?"（注册表可查），且 **P 层行不进相关性竞争**（实测：清空 query 时 P 层仍在注入）。
2. **P 层生长可见**：写一条画像行 → 注入面出现（`/inject/preview` 实测含 `← 源:`）。
3. **打分分量**：影子日志显示 importance 与 relevance 的相关系数（若 >0.9 说明该分量冗余，应删）。
4. **成熟度**：新条目 A 从 0.3 起，跨日再现后 ≥0.5 才可升格（用一条测试条目跑两轮日历验证）。
5. **三层配额**：P+R+E 的注入占比在 `/reconcile` 可视，且 **P 层占比 ≥ 其配额下限**（不被经验挤掉）。
6. 既有门全绿：判据门 + 40/30/18/18 + check-hardcode；架构档 9/9；账本闭合（v2.1）。

## 8. 明确不做

- 不引入图数据库（entities 关联用 INDEX「关联主题」列，v2 已落地）
- 不改 Markdown 单库形态 · 不做摘要式合并（E9 硬经验：去重优于摘要）
- 不提高 recency 权重（E5）· 不让 P 层参与相关性竞争
- 不在注入面新增常驻块（三层观测走 `/reconcile` 按需端点）

_建立 2026-09-11 · 依据：外部 9 条（GA 检索公式/reflection · MSR 三层+importance+maturation+遗忘+hybrid+两条硬经验 · ACT-R 声明/程序记忆）+ 守藏现状偏差 D1–D7（含 `panel.ts:277`、`distill.ts:283` 实测）· 本轮未改任何代码。_
