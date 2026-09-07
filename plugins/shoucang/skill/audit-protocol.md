# audit-protocol.md — 审计协议（周期审计与归档人工裁决）

> SKILL §10 触发后的完整 SOP。触发：容量 >85% / 任务收尾 / 新会话补查。维护走 spec §7 变更机制。

## §1 触发条件与频率边界

- **触发**：主文档容量 >85%（health 实测）/ 任务收尾（SKILL §10 收尾判定）/ 新会话补查（上一任务已完成时）。
- **频率边界**：非每 turn 收尾——"一次指令→多轮工具→最终交付"的大循环结束才算；纯咨询例外可轻量（task-protocols §4）。

## §2 审计主流程

`node scripts\memory_health_check.mjs [--out audit\<日期>.md]`（完整报告归档 `audit\`）→ 逐条**实际读取索引与详情原文** → 过「R0 领域路由 + Q0 归属 + 职责门 + Q1」→ 处置（保留/合并/删除/迁移项目卡库）→ 表格报告（`条目|归属|职责门|Q1|处置|理由`）→ CHANGELOG 留痕 → 复检 exit 0。

**route=project 候选迁移（审计处置项；调度权归守藏，协作宪章 v2/ADR-0007）**（⛔ 2026-09-07 随记忆栈退役终止，ADR-0003——守藏调度与蒸馏均下线，本节转历史流程留档）：记忆侧审计**负责发现积压**——检查各项目 `docs/devref/pending/` 积压（≥3 张或 >24h），提示宿主 agent 执行迁移（发现积压后由守藏调度中枢认领，pmg devref-card 执行）：目标项目 `node <pmg-skill>/scripts/devref-card.mjs <项目> --init`（首次）→ 卡内容按 cardType 转入对应卡册（`devref-card.mjs <项目> --title … --card-type … --text … --source "迁移:pending/<原文件>"`）→ 原候选移 `pending\.processed\`。蒸馏宿主（守藏蒸馏器）已在蒸馏时经 workspace 反解直写项目 pending（E3 桥）+ migrationHint 调度提示（协作宪章），此处只处理降级/回退残留与积压清扫。

## §3 重组 7 步（维护 SOP）

读全 → 删重复/过时 → 合并同类 → 拆分过杂（>100 行或 >80% 容量）→ 按日期重排 → 更新索引/INDEX → 汇总变更。

## §4 固化核对清单（五处同步，必核）

候选固化入册时逐项核对：① 索引行已写（`[tag] 主题 · 概况 → …§小节`）② **概况与对应小节要点一致（含内容更新后概况未失真抽查）** ③ `notes/INDEX.md` 条目元数据表已登记（创建/溯源行）④ notes 小节已建/已并入 ⑤ CHANGELOG 留痕——五处缺一即补；health 的「元数据表覆盖」「指针/注册」检查为机器兜底。

## §5 反思闭环与生命周期

- 任务收尾坑点/新事实 → `pending\` → 审计分流固化（环境→lessons，agent 学习→agent.md §学习史；**R2 项目相关→devref 卡库迁移**）。
- **主题提升判据**（机械化）：单子文档 >80% 容量，或近 5 次审计中检索命中（access.log 统计）/审计条目 ≥3 次 → 评估提升为独立 skill → 主索引条目退化为纯指针，正文不再常驻本库。

## §6 完整性自检与恢复

health 覆盖：缺失(4)/重复(3)/指针·格式(5)/超限(2)。异常 → 按重组 7 步修复；局部损坏用 `dist\`/CHANGELOG 复原；无法自愈 → 保留现场如实上报（零容忍）。

## §7 归档人工裁决入口（可选）

`archive-timer --pending-list` 取队列 → `archive-check <sid>` 查看 → 四裁决（ADD/NOOP/MERGE/SUPERSEDE）→ `archive-mark --done` → `--dequeue <sid>` 清队；或直接编辑 pending 候选。
蒸馏链路协议（触发/预筛/契约/安全阀）事实源 → `engine/distill-contract.md`；兜底 CLI（--due/--drain/--status 等）已注册为 DSH 原生工具（`_dsh_external_dsh_managing_memory_*`），语义见工具描述。

## §8 第一性原理闭环核验（审计增问，ADR-0005 配套）

每轮审计必答三问：
1. **本期是否有 ≥2 次同类问题？** 核验方式：`grep -l "同类:" pending\*.md` + candidate_grep 召回对照——同一 `同类: <主题>` 出现 ≥2 次 → 对应根本解（ADR/机制/契约变更）是否已落地？未落地 → 升级为审计处置项（同门禁效力）。
2. **现有规则/门禁是否被绕过 ≥1 次？** 有 → §0 反思规则本身是否缺陷（规则失效≠违规者的错）→ 提出规则修订候选。
3. **route 分流质量抽验**：grep 插件日志 `route=` 统计 memory/project/discard 分布与 projectCards 落点成功率；R1/R2 误判嫌疑（如 memory 路由连出空数组）→ 复核 distill-contract 判定锚。

核验结果写入审计报告（audit\<日期>.md）尾部。
