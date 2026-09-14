# 记忆条目活性模型（v7 · 方案定稿 2026-09-10）

> 目标：让记忆/画像架构真正"像人一样循环迭代"——反复使用反复加深、久不使用自然衰退、
> 重复与冗余周期归并（consolidation）、矛盾即失效。**原则：不从零造轮子**——每条机制标注成熟来源
> （Mem0 / ACT-R / FSRS / Zep-Graphiti / Letta），结合守藏树状分裂架构做适配；本地只写薄胶水。
> 本文档为方向与方案；实施顺序 A→B→C（见 §7），与 consolidation（distill.ts 深睡巡检内）同轮协作。

---

## 1. 需求对齐（用户拍板口径）

- 各记忆/画像在**反复使用中加深**，不用的**自然衰退**；同事实/同印象**只保留一份高质量**，执行时零重复噪音。
- 合并/调整（consolidation）时树感知：**树干合并必须交代树枝去向**，禁止悬空指针/孤儿。
- 高置信自动执行 + 归档可回滚 + 人工确认门（删除类）；全程审计。
- 质量第一；向量/嵌入与评分均可引入；效率问题遇到再解。

## 2. 成熟机制 → 本项目适配映射

| # | 子需求 | 成熟来源（仓库/论文/许可） | 本项目适配（不重造，只对齐+参数化） |
|---|---|---|---|
| M1 | 写入即评分、检索含新近度 | Mem0 `add/search` scoreAndRank（Apache-2.0）；Mem0 Memory Decay 博客 | 蒸馏 ADD-only 已是（newIndex 唯一门）。**召回融合加 recency 维**：`recallRanked` fused = dense·w1 + lex·w2 + recency·w3（w3 初值 0.1，可配）——沿用其"新近+相关"排序思路 |
| M2 | 时间衰减曲线 | Mem0 decay；ACT-R declarative base-level activation `B=ln(Σ(t−t_j)^−d)`（认知架构，d≈0.5） | 条目活性分衰减用 ACT-R 幂律形状；半衰期参数按本项目频率标定（初值：warm 14 天无命中→cold；cold 再 30 天→archive 候选）。纯本地计算，无依赖 |
| M3 | 反复使用加深 | FSRS review-强化语义（open-spaced-repetition，MIT） | 一次"命中/写入/被展开"=一次 review 事件 → 提升活性并进入跨周期加深判定（§5）。不做抽卡式调度 UI，只借"复习次数→熟练度"语义 |
| M4 | 矛盾即失效（负信号） | Zep/Graphiti temporal KG：边衰减 + 被事实矛盾时 invalidate（arXiv:2501.13956，MIT） | 现有 correction/supersede/gate-reject/空命中 = invalidate 信号 → 记负分并降级候选（§4/§6），与"提纯降级不删除"兼容 |
| M5 | 分层记忆+睡眠期整合 | Letta/MemGPT sleep-time compute（AGPL——只借架构不借码） | 注入=核心层（常驻指针+原则）、notes=archival、深睡=sleep-time consolidation（本架构已同构）；冷条目降级=核心层 eviction 减压 |
| M6 | 反思提炼参照系 | 本仓 `docs/agent-reflection-research.md`（Reflexion/GA/ExpeL/AWM/Letta 考古） | 沿用其已落地结论，不重复调研 |

## 3. 数据模型（存储零新增，落 `notes/INDEX.md` 条目元数据表）

> spec §8 v11 分离原则：元数据**不进索引行/画像行**，只放 INDEX.md 元数据表；会话注入面只读行本体。

每条索引行/画像行/关键小节在元数据表一行：

```
主题(§锚) | 文件 | 标签 | 创建 | 最后命中 | 命中次数 | 写入次数 | correction | 状态(active/warm/cold/archive候选) | 活性分(派生)
```

- 命中事件源：`audit/access.log`（read_section 自动追加 `{t,f,s}`，30d/近5审计裁剪）——聚合进表即"提取信号"。
- 写入/引用源：distill-audit（added）、episodes（成功）、深睡（principles/pointerOps 引用）。
- **活性分 = Σ(信号加权) × ACT-R 式时间衰减**（派生值，不手改；衰减在聚合时重算）。

## 4. 生命周期与遗忘四级（Mem0 decay × Letta eviction 语义，适配树形）

```
active ──14 天无命中──► warm ──30 天无命中──► cold(stale：注入/召回降权) ──► archive 候选
   ▲                                                                    │
   └──────── 再次命中/写入（回升，遗忘可逆；FSRS review 语义）────────────┘
```

- **active→warm→cold**：自动标记（聚合轮内写状态，召回排序对 cold 降权而非删除）。
- **cold→archive 候选**：不自动删；产清单给审计/人工确认（对齐现有 audit-protocol §3 提纯降级：细节移 archive、索引行退化为提示或不存）。
- **树规则**：只降级/归档**叶子**及其指向（consolidation 已保证树干合并交代树枝）；归档含原文 → `audit/consolidate|archive/` 可回滚。
- **加深（M3）**：跨 30 天命中 ≥N 且 correction 率低 → 自动进提升链：知识小节 → 独立小节/原则（现有生命周期判据"近5审计命中≥3"扩展为跨期频率）+ pointerOps 概况扩容。

## 5. 负反馈（M4 invalidate 适配）

- correction：蒸馏 gate-reject/深睡 replace 冲突/用户纠正 → +1，>阈值 → 降级候选（对齐 flow 转正判据 correction≤30% 的反面）。
- 空命中：召回命中但本轮无后续写入/展开即弃 → 计一次空命中（可配开关，先记后策）。
- supersede：新事实覆盖旧画像行/原则 → 旧行状态=superseded（现有语义，接入表状态枚举）。

## 6. 载体与集成点（适配当前代码）

- **执行时机**：并入深睡巡检（`runDeepSleep` 内、consolidation 之后）——顺序：consolidateTree（去重/归并/归档）→ activityAggregate（access.log 聚合→INDEX.md 元数据表→活性重算→状态迁移→加深/遗忘候选清单）→ 原归纳流程。
- **聚合实现位**：distill.ts 新 `activityAggregate(memRoot)`（consolidation 同风格，纯本地、零 LLM、try/catch 不抛）。
- **召回新近度**：vec.ts `recallRanked` 融合分数加 recency 项（读 INDEX.md 最后命中或文件 mtime 派生），参数可配。
- **审计**：`audit({kind:'activity', …状态迁移计数})` + 候选清单写 `audit/activity-candidates-<date>.md` 供审计/面板展示；月度成长页展示活性分布（可见闭环）。
- **健康联动**：memory_health_check 增读元数据表一致性（悬空条目 exit 提示）；状态 cold 不影响小节存在性校验。

## 7. 实施顺序（每步过 typecheck/build/CHANGELOG）

- **A 活性聚合 + 遗忘候选**：INDEX.md 表写入 + access.log 聚合 + ACT-R 衰减重算 + active/warm/cold 迁移 + archive 候选清单（无自动删除）。验证：真实库跑一轮，审计与候选清单样例。
- **B 加深自动提升**：跨期频率判定 → 提升链 + pointerOps 概况扩容触发。
- **C 负反馈**：correction/空命中入分与降级。

## 8. 开放参数（初值，影子/审计数据校准）

| 参数 | 初值 | 说明 |
|---|---|---|
| recency 权重 w3 | 0.10 | 融合排序新近度占比（与 dense 0.7/lex 0.3 同做 min-max 归一） |
| warm 阈值 | 14 天无命中 | active→warm |
| cold 阈值 | 30 天无命中 | warm→cold |
| archive 候选 | cold 且 correction 高/容量压力 | 人工确认执行 |
| 加深 N（30 天） | 5 次命中 | 达阈且 correction<30% → 提升候选 |

## 9. 来源

- Mem0 — https://github.com/mem0ai/mem0（Apache-2.0）｜docs/how-it-works｜博客 *Introducing Memory Decay in Mem0*
- ACT-R base-level activation（Anderson & Lebiere 认知架构）——公式借形
- FSRS — https://github.com/open-spaced-repetition/fsrs-rs（MIT）——review-强化语义
- Zep — arXiv:2501.13956；Graphiti — https://github.com/getzep/graphiti（MIT）——invalidate/decay
- Letta — https://www.letta.com/blog/sleep-time-compute（AGPL，仅借架构）
- 本仓既有：docs/agent-reflection-research.md、docs/memory-core-model.md（v6 指针生命周期 §2.6）、skill/memory-whitelist-spec.md（§8 元数据表/生命周期）、audit-protocol.md（§3 提纯降级）
