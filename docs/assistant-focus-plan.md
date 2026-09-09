# assistant-focus-plan.md — 助理目标 · 务实落地方案（v1）

> 状态：2026-09-09 用户拍板开工。目标=「跑在个人电脑上的全能助理」；边界=伙伴向不做。
> 性质：方案文档（非协议），是 S1-S6 阶段施工的参照；维护走 spec §7 变更机制。
> 权威文档：`memory-core-model.md`（方向唯一参考）· `sleep-v17-plan.md`（深睡契约 v17）· `skill/memory-whitelist-spec.md`（spec v16）· `skill/task-protocols.md` + `human-execution-loop.md`（执行纪律）。

## 0. 目标与边界

- **定位**：跑在个人电脑上的全能助理——能执行（文件/命令/代码）、能联网（检索/抓取/验证）、能记忆与自我认知、越用越强。**伙伴向不做**。
- **施工原则**：不另起炉灶。地基 = DSH 官方内核 + 已装插件资产；一切新开发按「先改方案/架构文档 → 再动模块」走，禁止补丁式加码。
- **主线**：把 shoucang 记忆/自我层**已经写完但未实证闭环**的部分，推到可观测、可验证的完成态——对齐 nav 主线退出条件。

## 1. 现状资产 → 助理能力地图（全部已有，不重做）

| 助理所需能力 | 承担者（已有） | 状态 |
|---|---|---|
| 执行/文件/沙箱/权限 | DSH 官方（bash/pwsh/fs/sandbox/jobs） | ✅ 完整 |
| 会话/上下文/压缩/事件溯源 | DSH 官方 | ✅ 完整 |
| 计划/goal/长任务/多代理 | DSH 官方（plan/goal/subagent/workflow） | ✅ 完整 |
| 思考层（persona/工具面） | router-standard / standard preset | ✅ 已装 |
| 搜索/抓取/视觉感知 | free-search + modsearch + vision/sidecar | ✅ 够用 |
| 语音输入 | prompt-enhancer ASR | ✅ 够用 |
| **记忆/画像/蒸馏/深睡/召回** | **shoucang** | 🟡 代码已部署，实证闭环未达成 |
| 治理/装配 | project-nav / super-injector（开发期工具） | ✅ 已清理至实况 |

## 2. 差距清单（只列助理目标相关）

1. **[主线 exit 未达成]** AGENT.md 只有 `[原则]` 行、还没有 `[路径]` 行；USER/AGENT 双画像真实会话产出未验证可观测。
2. **路线②③④⑤ 代码在但未实证**：晨起摘要 delta、月度成长页、打扰度影子、向量档。
3. **episodes.jsonl 几乎空**（1 行）：转正/同类判定数据源没启用。
4. **召回零命中无动作**：词法 miss 后没有下一步。
5. **无能力自省**：助理不知道自己「现在会什么/不会什么」。
6. 深睡产线可靠性（JSON 失败/水位）已修（第一批 e5c284c），待自然运行确认。

## 3. 落地方案（每阶段有验收，全部在现有代码上走）

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **S1 深睡实证闭环**（主线 exit） | 手动触发深睡（POST /deepsleep/trigger），消费 flow-candidate（1vem5v/o0cboi）→ 产出首条带源指针 `[路径]` 行；同轮产出 USER/AGENT 画像更新 | ✅ 2026-09-09 达成：`grep '^\[路径\]' AGENT.md` 非空（首条 [路径] 深睡记忆蒸馏）；audit deep-sleep stop=completed gate=pass；晨起摘要 delta 生成 + 注入实证；配套 write_gate §小节存在性校验补缺（35 PASS/0 FAIL） |
| **S2 晨起摘要 delta 注入** | 验证深睡后 delta.md 生成 + 下会话热记忆顶部出现「最近成长」 | ✅ 2026-09-09 实证：新会话注入文本顶部出现「🧠 最近成长」含 [路径] 行（panel.ts readDawnDelta → buildHotMemoryText 接线复核通过） |
| **S3 能力自省工具** | 新增只读工具 `assistant_capabilities`（当前工具面/权限/可写范围清单），挂 router 第①步自查 | ✅ 2026-09-09：工具注册（scheduler.ts，`ctx.tools.schemas(exec.agent)` 按族聚合 + AGENT.md [边界]/[原则] + suite 装配）；typecheck/build 全绿，lib 同步热重载 |
| **S4 episodes/转正启用** | 每成功任务写 episode；flow-candidate 满门槛自动转正（成功≥2 跨会话≥2） | ✅ 2026-09-09：episode 触发放宽（蒸馏裁决完成即记含 route/outcome，不只入册时）；flow-candidate `intentTokens` 指纹同型聚合 + 成功次数/跨会话计数（指纹验证：异型交集1不误并/同型交集5聚合）；深睡材料转正候选置顶 + prompt 判据补门槛句；存量 2 候选迁移新格式（commit c05f77a） |
| **S5 召回零命中动作** | 零命中返回「近似主题 + 建议检索词 + pending 提醒」，不再静默 | ✅ 2026-09-09：`recallApprox` 零命中降级（建议词=库内出现过的高判别 token；库内主题地图=notes 小节清单 ≤12）；设计验证修正（词法零命中逐行匹配必空 → 主题地图为真价值）；shoucang_recall 零命中分支改「建议词+主题地图+沉淀提醒」（commit ccc2123） |
| **S6 观测与收尾** | 自然跑 2-3 天：蒸馏/深睡正常、无 JSON 失败复现；架构文档按指纹重生成；vector 更新 | 待做：无 P0 复现；nav/vector/文档三者一致 |

> 向量档（路线⑤）与打扰度影子**不主动开**，按 roadmap 判据（漏检实锤/召回率下降/影子样本校准）再启用。

## 4. 施工纪律

1. 每阶段开工前：本方案 → nav_plan 登记 → 方案确认 → 才动代码；
2. 所有产出必须有**实证记录**（audit/grep/面板），不许只报「代码写完」；
3. 超出范围的新需求 → 先回本方案加阶段，不顺手改。

---
_建立 2026-09-09（ACT-013）；来源：用户拍板「不重 0、专注助理目标」+ memory-core-model v5.2 落地序 + 前期架构审计_
