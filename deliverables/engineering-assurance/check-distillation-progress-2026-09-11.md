# 守藏（dsh-shoucang-memory）项目进度 & 蒸馏链路体检报告

**日期**：2026-09-11（核查时刻 18:16 +08:00）
**工作流**：状态核查（非五类工程保障工作流；故未组队，由主理人直接以工具实证完成，理由见 §待完善）
**参与成员**：Zhen（工程督导，独任 · 只读诊断）

---

## 📌 TL;DR（执行摘要）

- **整体结论**：蒸馏**在运行**且核心水位语义**正确**（段级失败保留水位已实测生效），但发现 **1 个 🔴 断链**——DSH 会话转录自 2026-09-10 13:49 起改用 `session.v3.jsonl.zstd` 命名，而定位白名单只认 `session.jsonl[.zstd]` ⇒ **workspace 反解对新会话 100% 失效**，项目路由知识**永久滞留 pending-defer 且每轮空转**。
- **严重度分布**：🔴严重 1 项 / 🟠高 3 项 / 🟡中 2 项 / 🟢低 2 项
- **阻塞 / 非阻塞**：🔴 F-1 阻塞"项目路由入库"与"会话归档"两条链（知识未丢，但**进不了库**）；其余为非阻塞。
- 进度侧：**29 提交未推 origin**、9 文件未提交；但均已构建 + 已同步安装副本 + 已热重载生效（25 个 lib 文件 SHA256 全 MATCH）。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🔴 **不通过**（蒸馏项目通道断路） |
| 阻塞项数量 | 1（F-1 转录命名 v3 漂移） |
| 关键行动项 | 7 条（P0×2 / P1×4 / P2×1） |
| 建议下一步 | 先修 `archive-lib.mjs` + `distill.ts` 双处文件名判据 → 重跑探针证 `exit=0` → 手动触发一轮 defer 回流，验证 4 张卡落盘且 pending 清零 |

---

## 🔍 核查发现（按严重度排序）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议修复 | 证据 |
|---|--------|------|------|---------|---------|------|
| F-1 | 🔴严重 | 蒸馏/归档断链 | `skill/scripts/archive-lib.mjs:50,190`；`src/distill.ts:670`；`skill/scripts/candidate_grep.mjs:47,58` | 转录文件名白名单写死 `['session.jsonl.zstd','session.jsonl']`，DSH 新会话实际写 `session.v3.jsonl.zstd`（不含子串 `session.jsonl`）⇒ 定位恒 null；`distill.ts:670` 又用 `includes('session.jsonl')` **二次筛**（双闸） | 三处改为同一正则 `/^session(\.v\d+)?\.jsonl(\.zstd)?$/`（或 readdir 取首个 `session*.jsonl*`）；`test.mjs` 补 v3 命名 fixture | ①磁盘 346 转录 = 175 老名 + **171 新名**；②格式切换点 **09-10 13:49**，**今日 136/136 全为新名**；③实跑 `locate-transcript-probe` → **exit=1「转录未找到」**，而文件确实在（7.25 MB）；④日志 `ws 反解: 转录定位失败 attempt=1..3` |
| F-2 | 🟠高 | 空转 | `src/distill.ts:679-682`（`resolveWorkspace` 重试环） | 永久不可解的 defer 卡**无退避、无上限、无告警**：每轮扫尾 4 卡 × 3 attempt（≈18 s），每 10 分钟一轮，日志已 352 条 defer 行 | 连续 N 轮不可解 → 落 `kept-permanent` 审计并移入 `.unresolved/`，退出重试环 | 日志 18:03 / 18:13 两轮 `defer 回流汇总: 写入 0 / 保留 4` |
| F-3 | 🟠高 | 蒸馏落盘 | `src/distill.ts`（段级 dispatch） | 最近一轮 17:58 chunk3 = `added:1 / failed:1 / fclass:dispatch-failed` ⇒ **1 条本应入库的条目未落地** | 观察下轮续传是否成功；`dispatchFailStreak` 为**内存态**（重启清零），建议持久化以获真实退避 | `ledger.jsonl` chunk3 `attempted=2 written=1 failed=1`；水位停在 chunk2 `seq=262` |
| F-4 | 🟠高 | 发布链 | `~/.dsh/profiles/web/package.json` | 依赖钉 `github:…#a70f134`（09-10），而 HEAD=`32ce930`（**领先 origin 29 提交**）⇒ **重装 profile 会回退 29 提交 + 未提交改动** | commit + push 后重钉声明；重跑 `pnpm install` 并逐文件 SHA256 复核 | 安装副本 lib/ 与仓工作树 **25 文件 SHA256 全 MATCH**（mtime 17:49 > 仓 17:47） |
| F-5 | 🟡中 | 候选证据污染 | `suite/knowledge/pending/flow-candidates/2026-09-10-2xlf5v.md` | 类型线索 = 宿主样板 `[user] Current runtime context. This snapshot supersedes…`，却被计「成功 4 次 / 跨会话 4」⇒ **转正判据 eligible**；同型合并可能被样板放大 | 该样板补入 `CANDIDATE_NOISE`（ACT-024 补了 3 条漏判，**漏了 runtime-context 块**）；污染候选不参与 eligible 计算 | 卡内「转正判据：eligible」与线索原文同时可见 |
| F-6 | 🟡中 | 门拒分布未知 | `audit/ledger.jsonl` / `reconcile` | 窗口内 `writeEvents=4 · rejectedWrites=2 · rejectRate=0.5`；pending-defer 累计 **34 段 / rejected 123 条** | 修 F-1 后重测真实拒收分布（当前混入"不可解滞留"，口径不可比） | `.reconcile-tmp.json` health 段 |
| F-7 | 🟢低 | 进度账 | 仓工作树 | 9 文件未提交（A 方案：移除 `boards` 死开关+假依赖文案 / 文档模板对齐 / `check-carriers` ROOT_ONLY 清空）+ 29 提交未推 | commit → push → 重钉声明 | `git status` / `rev-list --count origin/master..HEAD = 29` |
| F-8 | 🟢低 | 观望 | 自检面 | 六项全 pass、`verdict=ok`、`adjustments=[]`（`selfCheckAutoRollback` 关，符合策略）；`maturation gateReady ⛔`（拦阻率 67.9% > 50%）⇒ 维持 `enforce=false` | 无需动作；maturation 待分布右移后一条配置翻转 | `selfcheck-latest.json`；`.reconcile-tmp.json` |

---

## 🧪 蒸馏链路实况（正面实证，勿误伤）

| 检查项 | 实测 | 判定 |
|--------|------|------|
| 蒸馏是否在跑 | 最近一轮 17:58（`6ba51f20`）：chunk1-2 `discard`、chunk3 `memory added=1` | ✅ 在跑 |
| 水位语义 | 失败段（263-425）**未推进**，水位停在 `seq=262` ⇒ 下轮续传 | ✅ 「水位前移吞条目」修复**已生效**（与 A1 修复声明一致） |
| 落盘真实性 | 库 git `9e75baf memory: distill @ 09:58:39`；`notes/INDEX.md` 15 963 B / `MEMORY.md` 5 165 B 均 17:58 写入 | ✅ 非接口假绿 |
| 行数闭合 | `unexplained=0`（自举基线后四条同口径核算） | ✅ |
| 有效深睡 | `lastSuccessfulWrite=16:50:59`、`idleStreak=0`、`deepSleepRounds=37` | ✅ |
| 部署面一致 | 仓 `scripts/` ↔ 库 `scripts/`：**一致 24 · 不一致 0**（14 件未部署=非错误） | ✅ PASS |
| 插件装配 | `cordis.yml:547` 条目 + dependencies 双在；注入器 registry 为空（**非**运行时注入） | ✅ 声明装配正常 |

### 已核查并**排除**的误报（防误伤，两条均为核验侧伪影）

1. **JSON 中文乱码**：`selfcheck-latest.json` / `delta.md` 先用 PowerShell 读出现 `浠呯櫧鍚嶅崟`，经 UTF-8 读取器复核**内容完好** ⇒ 真因是解码口径，**文件无损坏**。
2. **库 git `dubious ownership`**：我用裸 `git -C` 触发；插件侧 `bank-git.mjs` 本已带 `-c safe.directory` ⇒ **一直正常**（与 CHANGELOG 09-11 已记载的同族误报一致）。改用 `-c safe.directory='*'` 复跑即得库提交链 `9e75baf ← 32a9012 ← 11045de …`。
3. **`suite/knowledge/whitelist.json.orphan-20260911`**：已登记的退役孤儿（CHANGELOG A 档 ⑥），**非缺陷**。
4. **`dsh.bundles=[]`**：实况装配走 `cordis.yml` 条目，非 bundles ⇒ **非缺陷**（但 AGENTS.md 口径需校正，见行动 7）。

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | 修 `archive-lib.mjs:50,190` + `distill.ts:670` 文件名判据为 v3 兼容正则；同修 `candidate_grep.mjs:47,58` | 开发 | **P0** | 即刻（3 处一处不漏） |
| 2 | `test.mjs` 补 `session.v3.jsonl.zstd` fixture（当前 8 处 fixture 全造老名，测试**结构性看不见**此缺陷） | 开发 | **P0** | 与 1 同步 |
| 3 | 修复后：重跑 `locate-transcript-probe <sid>` 证 `exit=0` → 手动触发一轮 defer 回流 → 验证 4 卡落 `docs/devref/shoucang/` 且 pending 清零 | 验证 | **P0** | 修复后 30 min |
| 4 | defer 永久失败加**退避 + 上限 + 审计**（≥N 轮不可解 → 移 `.unresolved/`），消除空转 | 开发 | P1 | 本日 |
| 5 | 观察下轮深睡 chunk3 是否续传成功（`dispatch-failed` 1 条）；考虑 `dispatchFailStreak` 持久化 | 验证 | P1 | 下轮深睡后 |
| 6 | `CANDIDATE_NOISE` 补宿主 `runtime-context` 样板；污染候选排除 eligible | 开发 | P1 | 本日 |
| 7 | commit + push 29 提交 → 重钉 profile 声明到新 HEAD → `pnpm install` + SHA256 复核；AGENTS.md 装配口径由「bundles」校正为「cordis.yml 条目 + dependencies」 | 发布 | P1/P2 | 本日 |

---

## ⚠️ 待完善 / 已知局限

- **本次为独任只读诊断，未组队**：本任务属"状态核查/体检"，不属五类工程保障工作流（代码审查/系统设计/事故响应/Go-No-Go/技术债）；且用户恒定约束为「只动当前工作区、范围外先问」。组 5 人队做只读体检的编排开销大于收益。**如需**把 F-1 的修复做成含架构影响评估（architect）、回归测试计划（testing-expert）与 Runbook（tech-writer）的正式工程交付，请下指令，我按工作流 1/4 组队重跑。
- **F-1 的影响面尚有一处未穷尽**：`archive-timer.mjs` 同源调用 `locateTranscript`（3 处），推测归档链同受影响，但本次**未实测归档行为**，故只标"同源风险"未标实测结论。
- **F-3 的 1 条失败条目内容未知**：`distill-audit` 不记被拒条目原文（`rejectedLines` 仅深睡面有），故无法判定丢失者价值。
- **F-6 的 123 条 rejected 未做归因拆解**（gate-reject 与 workspace-不可解两条路径**都**汇入 `pending-defer`，当前口径不可分），须修 F-1 后重测。
- **本报告文件为未跟踪产物**：`deliverables/` 不在 `.gitignore` 中 ⇒ 会出现在 `git status`（即上述"进度核查面"）。**请勿误提交**；建议加入 `.gitignore` 或阅后删除。

---

## 📚 数据来源 & 成员产出索引

| 来源 | 实证内容 |
|------|---------|
| `git`（D:\FF\shoucang） | HEAD `32ce930`@09-11 17:09 · origin/master `71b60a7` · ahead **29** · 未提交 9 文件 |
| `~/.dsh/suite/knowledge/audit/` | `distill-audit.jsonl` 717 行（12 类） · `distill-watermark.jsonl` 375 行 · `ledger.jsonl` 41 行 · `selfcheck-latest.json` · `.reconcile-tmp.json` · `.selfcheck-shadow-sim.mjs.json` |
| `~/.dsh/skills/managing-memory`（**真库**） | `git log`：`9e75baf memory: distill @ 09:58:39` · `32a9012`（notes 层级重排）· 工作树干净 |
| `~/.dsh/super-injector/shoucang-scheduler.log` | 2 941 行；`defer 保留 …: workspace 不可解` × 4 卡/轮 · `ws 反解: 转录定位失败 attempt=1..3` |
| `~/.dsh/sessions/**` | 转录 346 个 = 175 `session.jsonl.zstd` + 171 `session.v3.jsonl.zstd`；今日 136/136 新名 |
| 源码 | `src/distill.ts:665-704, 975-1044` · `skill/scripts/archive-lib.mjs:37-56,190` · `locate-transcript-probe.mjs` · `candidate_grep.mjs:47,58` |
| 命令实证 | `node skill/scripts/locate-transcript-probe.mjs session-7f37b807-…` → **exit=1** · `node scripts/check-deploy-sync.mjs` → PASS(exit=0) · `dev_plugin_status` → shoucang active · `shoucang_suite` → 1/1 present |
| 成员的独立专业产出 | **无**（本次独任诊断；五类工作流未触发，故未向 Cody/Archi/Rex/Tessa/Docu 派发） |

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
