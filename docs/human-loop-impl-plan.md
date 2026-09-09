# human-loop-impl-plan.md — 人化执行体系实施方案（逐批次执行规格）

> ⚠️ **历史文档（2026-09-08 批次 0-5 已全部落地）**：本文描述的「四索引 / PRINCIPLES 原则层」等口径已被 spec v16 取代（三索引、`[原则]` 行并入 AGENT.md），仅供回溯当时决策与执行方式，勿当现行规则。现行权威：`skill/memory-whitelist-spec.md`（v16）。

> 配套 `human-loop-roadmap.md` 批次表的落地规格：每批次列出精确文件改动（含锚点）、验证命令、回退方式。
> 执行纪律：每批次独立提交（CHANGELOG 留痕）→ check-hardcode → 批次内测试 → 再进下一批。

---

## 批次 1：文档失真修复（低风险，3 文件）

| # | 文件 | 锚点 | 改动 |
|---|---|---|---|
| 1 | `skill/SKILL.md` | `## 🏛 协作宪章（已退役，ADR-0003 归档）` | 标题改为「沿革留档」并在节首加状态行：**2026-09-08 守藏已重新上线（dsh-shoucang-memory 运行于 dsh-web），纪律骨架现行生效**；下方 ⛔ 退役声明保留为历史注记 |
| 2 | `skill/README.md` | 头部引用块「⛔ 2026-09-07 已退役归档…」 | 改为现行状态：守藏单插件运行中，本仓=规则/引擎公开开发源 |
| 3 | `skill/memory-whitelist-spec.md` | §5.5「≤1,375 字符（当前 ~150 ✅）」 | 改「≤2,000 字符（v10 上调；实测以 health 为准）」 |
| 4 | `skill/human-execution-loop.md` | ⑤ 每步验证 · 判定标准后 | 增一句：**召回即修正**——read_section 发现小节失真/过时 → 即时经 write_gate 修正（Q3 replace），不等审计（人脑再巩固：召回窗口可改写） |

- **验证**：`node scripts/check-hardcode.mjs .`；`grep -rn "1,375" skill/` 零命中；`grep -rn "已退役归档" skill/SKILL.md skill/README.md` 零命中。
- **回退**：`git checkout -- <文件>` 单文件复原。

## 批次 2：A 降级提纯机制（协议 + 脚本）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `skill/audit-protocol.md` §3 | 重组 7 步的「删过时」扩为「**提纯降级**」：零召回/过时条目先提取教程式方向指引（对齐 R1 锚）合并进概况或通用小节 → 细节原文移 `audit/archive/` 归档层（不进注入面、可追溯）→ 索引行收窄；提纯后无通用价值才删，走 §7 人工裁决 |
| 2 | `skill/audit-protocol.md` §5 | 生命周期增**降级判据**：连续 2 次审计 access.log 零命中 且 类别非 env/release → 进提纯降级流程；与提升判据（≥3 次命中 → 提升）构成双向生命周期 |
| 3 | `skill/scripts/memory_health_check.mjs` | 候选统计段旁增**零召回清单**：对照 notes 小节 ↔ access.log（近 5 次审计窗口），输出零命中主题列表（供审计提纯），只报告不处置 |
| 4 | `skill/scripts/test.mjs` | 增零召回清单用例（临时副本：写 access.log 稀疏数据 → 断言清单输出） |

- **验证**：`node skill/scripts/test.mjs` 全绿；`health_check --out` 报告含零召回段；check-hardcode。
- **回退**：脚本改动 `git checkout`；协议段落按 CHANGELOG 对照复原。

## 批次 3：D 四级层级（spec v14 + 脚本 + SKILL）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `skill/memory-whitelist-spec.md` → **v14** | ① §0 文件定位表增 **PRINCIPLES.md = 原则层**（图式/直觉，常驻注入）；② 新增 §5.8 白名单：条目格式 `- <一句泛化原则> ← 源: notes/<file>.md §A/§B`，**只经归纳 pass 产生、不走四问**；容量红线 ≤1,000 字符（硬限，超限=原则间合并，宁少而准）；③ §6 判定流加 L0 分支（仅归纳入口）；④ 变更记录 v14 |
| 2 | `skill/scripts/memory_health_check.mjs` | 主文档列表加 PRINCIPLES（容量 1,000 + 行格式校验：前缀 `- ` 且含 `← 源:`） |
| 3 | `skill/scripts/memory_write_gate.mjs` | 支持 target=PRINCIPLES（容量+格式门） |
| 4 | `skill/SKILL.md` | ① §6「三索引」→「四索引」（MEMORY/USER/AGENT/PRINCIPLES 全文加载）；② L3 检索路由表加：原则层 → read `PRINCIPLES.md`（①③ 步优先）；③ 注明原则不入四问（唯一写入口=审计归纳 pass） |
| 5 | `skill/audit-protocol.md` | 新增「深度睡眠归纳 pass」：**作用域=当天痕迹**（本日 pending + 本日蒸馏 appends 增量 + 本日 access 命中主题）——同主题 ≥3 条或单主题当日反复命中 → 提炼 1 条原则 → write_gate 入 PRINCIPLES；全库扫描仍归周期审计，不做全库重组 |
| 6 | 数据根建档 | `_memory/PRINCIPLES.md`（开发口径，含文件头说明）；生产口径随批次 5 部署后在 `~/.dsh/skills/managing-memory/` 建同文件 |
| 7 | `skill/README.md` 拓扑 + CHANGELOG | 同步登记 |

- **验证**：test.mjs 全绿（增 PRINCIPLES 校验/写门用例）；`health_check` exit 0；手工样例：注入一条测试原则 → gate exit 0 → 超限样例 → gate exit 1。
- **回退**：spec/脚本 git 复原；数据根删 PRINCIPLES.md；SKILL 段落复原。

## 批次 4：project-nav 索引同步（WorkBuddy 直改通道）

约束：原子写（临时文件+rename）、损坏 fail-loud 不静默清空、metadata 全量重算、路径正斜杠归一、改 vector 前先读原值。

| # | 文件 | 改动 |
|---|---|---|
| 1 | `D:\FF\.internal\nav-index.json` | ① SC-S02/S03 文件映射更新为新路径（`shoucang/src/panel.ts`、`shoucang/client.js`、`shoucang/src/scheduler.ts`、`shoucang/src/targets.ts`、`shoucang/src/distill.ts` 等，实施前先 nav 全量读核对 SC-S01…S04 定义）；② 登记本会话新功能：SC-S05 人化执行循环（skill/task-protocols.md、skill/human-execution-loop.md）、SC-S06 记忆架构扩展（spec、audit-protocol、scripts）——具体编号以现网递增为准；③ staleEntries/metadata 重算 |
| 2 | `D:\FF\.internal\vector.json` | notDoing 移除 "shoucang reactivation"（已上线）；doing/next 刷新为当前实际（记忆架构改造批次 2/3）；updatedAt 更新 |
| 3 | `D:\FF\.internal\nav-actions.json` | 追加本改动 plan/begin/done 事务留痕（追加式，不改旧行） |

- **验证**：node 解析三 JSON 无异常；metadata.total* 与实际条目一致；`map-*.html` 可重生成（dsh 侧）。
- **备选通道**：产出可粘贴 dsh 提示词交 agent 走 nav_* 工具（首选通道，直改为兜底）。

## 批次 5：C 部署生效（最后统一执行）

1. 备份：`~/.dsh/backups/managing-memory-<时间戳>/` 存现行部署副本；
2. 同步：`skill/` → `~/.dsh/skills/managing-memory/`（覆盖规则/脚本/协议；**数据区 PRINCIPLES.md 建档**）；
3. 重启：`sc stop dsh-web && sc start dsh-web`；
4. 验证：`dsh-web-out.log` 尾部取 token → 访问 200；新会话确认四索引注入（含 PRINCIPLES）+ 热记忆正常。

## 暂缓项

- **B 嵌入模型升级**：观察触发判据（同义改写漏检 ≥2 次 / 容量长期顶格 / 模糊意图检索需求）。
- **平台层 SOUL.md 补强**（列未知项/气味换路）：跨项目生效，单独拍板。

---
_制定 2026-09-08；来源=全会话决策（人化执行循环研究 → 集成 → 记忆架构审查 → 降级提纯/四级层级/睡眠巩固拍板 → project-nav 核查）；执行时逐批次更新本文件状态行_
