# 借鉴设计方案：MemSearch × dsh-git-memory → dsh-managing-memory（C 路线）

> 2026-09-06 调研产出。背景：GitHub 同类插件盘点结论——成熟产品已有（MemSearch 最成熟、dsh-git-memory 次之），但「蒸馏裁决 + memory/project 双库路由 + 治理协作」目标架构无撞车。C 路线 = 继续自研，定向借鉴两仓库已验证的设计。
> 状态：草案（用户拍板后可升格 ADR-0006）。

## 0. 调研结论速览

| 来源 | 已验证机制 | 对本插件的对应物 |
|---|---|---|
| zilliztech/memsearch（456 commits，2026-09 活跃） | `session/event` completed turn 捕获 + 序列化 + 幂等锚点；session 关闭触发后台维护（最小间隔 + 新内容门槛）；记忆→技能候选（绝不自动安装）；pre-step 按需检索注入（无相关结果不改上下文） | ADR-0004 watcher 已覆盖捕获；维护任务/候选/注入决策是缺口 |
| seriousz158/dsh-git-memory（v0.9.2） | dry-run/preview/apply 三段事务；host-owned apply；操作锁 + 健康检查 + 有界批次 + 重试退避；metadata-only journal（`.sync/` 只记元数据）；恢复点/回滚/备份导出；untrusted summary.md 12KiB 注入 | knowledge-append 安全阀已有备份/容量门禁；--dry-run 本次已落地（v3）；其余是缺口 |

## 1. 借鉴点一：MemSearch 的维护任务与候选机制

对标现状：ADR-0004 的事件驱动 watcher（turn/end completed + idle 10min + spawn 蒸馏）≈ MemSearch 的 capture 链路，架构等价且已实证。**缺口是"蒸馏之后"的沉淀层**。

### 1a. 后台维护任务（挂 session 关闭，非轮询）
- MemSearch 做法：session closes 触发 + 周期性兜底 timer；每个任务仅当「有新日志内容 且 达到最小间隔」才跑。
- 映射到本插件：`session/disposed`（ADR-0004 决策 2 已监听，现在只清 timer）追加维护钩子：
  - **USER.md/AGENT.md 对齐任务**：从 notes/ 蒸馏产物检查主文档与分册漂移（当前靠人工/看板）；
  - **pending 巡检任务**：`pending/` 中超龄（如 >7 天）的 [route:project] 卡提醒迁移（pmg 卡库已就绪，ADR-0005 阶段 3 条件已满足）。
- 关键约束照抄：**绝不自动安装/自动迁移，只产候选 + 提醒**（与 F-001 蒸馏唯一权、pending ADD-only 语义一致）。

### 1b. 幂等锚点强化（低成本高收益）
- MemSearch 用 session+turn 锚点防 DSH 事件重播重复写。
- 本插件现状：`audit/distill-watermark.jsonl` 记 {sessionId,lastSeq,at}（ADR-0004 决策 6）。
- 动作：水位行补 `turnSeq` 字段（session event seq 已在手里），重播场景从「可能重复蒸馏」变「seq ≤ 水位直接跳过」。改动约一行判断，建议随下次插件改动顺带做。

## 2. 借鉴点二：dsh-git-memory 的事务流与安全阀

对标现状：knowledge-append.mjs 已有（v3 起）：写前备份、容量硬限、小节锚拒写、白名单、**--dry-run 预览**。

### 2a. 已落地（本次 v3）
- `--dry-run`：两主路径（白名单 append / project-card）均支持，输出结构化预览（落点/插入行/前后字符数/容量余量），零写入零备份；校验失败仍按原退出码拦截（exit 1/2/3/4 语义不变）。
- 用途：蒸馏裁决子代理产出 → 人工/看板复核预览 → 确认后去掉 --dry-run 落库；也是 dev-scenarios 8 场景回归的只读探针。

### 2b. 待借鉴（按优先级）
- **P1 · metadata-only journal**：写库成功后向 `<库根>/audit/journal.jsonl` 追加一行 `{at, lib, file, section, charsBefore, charsAfter, runId}`——只记元数据，绝不记条目正文（隐私红线与 ADR-0006 记忆仓私人区原则一致）。收益：审计可回放，不看内容即可发现异常写入频率。
- **P2 · 操作锁**：蒸馏 spawn 进行中（Promise.race 窗口内）拒绝对同库并发写（简单互斥标志即可，对标 host-owned apply 的防并发写）。当前单进程事件串行，风险低——列为防御性增强。
- **P2 · 库级恢复点**：现在备份是单文件 copy；借鉴「干净复用 HEAD / 脏路径打 checkpoint」思路，在批量迁移 pending → cards 前（ADR-0005 阶段 3）对目标卡库目录做一次性 zip 快照，替代逐文件备份。
- **P3 · 注入面字符预算对齐**：dsh-git-memory 的 untrusted 12KiB 与本库 capacity MEMORY.md 3000 字符语义同源；无需改代码，仅在 SKILL 文档标注「主文档即注入面，容量门禁即 token 预算」的对应关系，避免后续调大容量时忘了注入成本。

## 3. 非目标（明确不抄）

| 不抄 | 理由 |
|---|---|
| Milvus + ONNX embedding 检索栈 | 8GB 显存/本地优先场景过重；markdown 锚语义检索够用 |
| Git 仓库做存储 | 记忆库已有「公开树 + _memory 私人区」布局（ADR-0006 记忆仓版），换 Git 存储破坏现有治理 |
| 跨 agent 平台共享 | 单 DSH 宿主场景无需求；真要共享时 markdown 树天然可搬 |

## 4. 落地清单

| # | 项 | 优先级 | 状态 |
|---|---|---|---|
| 1 | knowledge-append `--dry-run` | P0 | ✅ 已落地（v3，2026-09-06，冒烟 3 链路通过） |
| 2 | 水位行补 turnSeq 防重播 | P1 | 待做（~1 行判断） |
| 3 | journal.jsonl metadata-only | P1 | 待做 |
| 4 | session/disposed 维护任务（pending 巡检 + 主文档对齐提醒） | P2 | 待 ADR-0006 拍板 |
| 5 | 蒸馏期操作互斥 | P2 | 待做 |
| 6 | pending→cards 迁移前库级快照 | P2 | 随阶段 3 |

## 5. 风险与开放问题

- 维护任务跑在 session/disposed 时机，宿主退出瞬间可能来不及跑——需兜底 timer（MemSearch 同款「周期性 fallback」），间隔建议复用 idleWakeMs 或独立可配。
- journal.jsonl 增长无界——追加轮转规则（如 >1MB 截断保留尾部）。
- 本草案涉及插件行为改动：落地前过三道门（5a 查契约 / 5b dev-scenarios / 5c tsc+reload，见工作区记忆）。
