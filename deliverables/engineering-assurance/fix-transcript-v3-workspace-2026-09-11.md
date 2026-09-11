# 修复记录：转录命名版本漂移致 workspace 反解全量断链（F-1）

**日期**：2026-09-11（修复 + 验证完成 18:30 +08:00）
**类型**：缺陷修复（承接同日体检报告 F-1 🔴 阻塞项）
**参与成员**：Zhen（工程督导，独任 · 改动落在单一架构节点，见 §架构反思）

---

## 📌 TL;DR（执行摘要）

- **结论**：F-1 已修复并**端到端验证通过** —— 定位白名单由「枚举旧文件名」改为**版本无关识别**（列目录 + 正则），未来 v4/v5 命名无需再改。
- **修复范围**：1 个架构节点（转录定位的**单一权威实现**）共 4 处同族缺陷 + 1 处文档 + 1 处测试盲区封堵。
- **实测证据（非接口成功）**：真库探针 `exit=1 → exit=0`；**A/B 对照同一批卡 22 分钟内两种结果**——修复前 18:23 扫尾 `写入 0 / 保留 4`，修复后 18:25 `写入 4 / 保留 0`，4 卡实际落盘 + 移入 `.processed`；**空转归零**（18:25:40 后 33 行日志中反解失败/保留 = 0）。
- **验收**：`typecheck`/`build` 零错 · `npm test` **exit=0**（含新用例 41 PASS/0 FAIL）· `check-deploy-sync` 不一致 **0** · `lib/distill.js` 仓↔安装副本 SHA256 **MATCH** · 库 git 快照 `512f2e6` · 仓提交 `6c89863`。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 修复评级 | 🟢 **通过**（阻塞项清零，证据齐备） |
| 阻塞项数量 | 0（原 🔴 F-1 已消除） |
| 改动文件 | 7 件（源码 1 · 构建产物 2 · 脚本 3 · 文档 1）+ CHANGELOG 1 行 |
| 建议下一步 | 需要你拍板的三件：① 推送 origin（现落后 30 提交）② F-2 退避护栏 ③ F-5 候选样板降噪 |

---

## 🏗️ 架构反思（动手前）

**锚点**：转录定位 = `archive-lib.locateTranscript`，宣称「唯一权威定位」，被 3 个消费方复用（`locate-transcript-probe` → 插件 `resolveWorkspace`；`archive-timer`；`archive-check`）。

**判断**：架构**站得住**（单点定位+多消费方是对的），缺陷不在架构而在**该点内部的实现假设**——把"转录文件名"当成两个固定字面量。因此正确的修法不是在各消费方加兜底，而是**在唯一实现内把判据升级为版本无关**，并**收敛同族重复实现**（`distill.ts` 自立的 `includes` 二次筛、`candidate_grep.mjs` 自立的硬编码路径）。这正是 `[原则] 命令行工具排障 · 勿只修一处` 在本例的落点：同族判据共 3 处，漏修任一处则"修好了但仍不生效"。

---

## 🔧 改动清单

| # | 文件 | 改动 | 为何 |
|---|------|------|------|
| 1 | `skill/scripts/archive-lib.mjs` | 新增 `TRANSCRIPT_NAME_RE = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/` + `pickTranscriptIn(dir)`（列目录 + 版本无关正则，`.zstd` 优先 → 版本高者优先）；`locateTranscript` 与 `enumerateSessions` **两处**枚举旧名的循环改调它 | 根因所在：旧白名单 `['session.jsonl.zstd','session.jsonl']` 对 `session.v3.jsonl.zstd` 恒不命中 |
| 2 | `src/distill.ts` | 第二闸 `find(l => l.includes('session.jsonl'))` → 同正则判据 | **双闸**：探针已定位成功仍被此处二次判 null（漏修则整体仍不生效） |
| 3 | `skill/scripts/candidate_grep.mjs` | `join(wsDir,sid,'session.jsonl.zstd')` → `lib.pickTranscriptIn(...)`；两处注释同步 | 第三处同族硬编码（候选召回对 v3 会话静默漏扫） |
| 4 | `skill/scripts/test.mjs` | 新增用例「转录命名版本兼容」：旧名 + 新版名各一例，断言**定位与枚举两条路径**均命中 | 测试盲区封堵：此前 8 处夹具全造旧名 ⇒ **测试结构性看不见此漂移**（与"改后可构建"同族的机械化护栏思路） |
| 5 | `skill/docs/archive-detection-design.md` | 基准行改为 `session[.vN].jsonl.zstd` + 记明版本无关识别与本次断链 | 文档漂移同步（避免下一轮照旧名写代码） |
| 6 | `CHANGELOG.md` | `[Unreleased] → Fixed` 记一行（含证据与残留项） | 仓规 4（用户可感知改动须记账） |

> **拒绝的做法**：在各消费方加 `|| try other name` 兜底（会把"唯一实现"变成 N 份实现，照旧留漂移面）；改包名/建软链（治症不治因）。按用户核心原则「设计极简抗堆叠 · 根部解决」，只改**判据**这一处根。

---

## ✅ 验证矩阵（全部为工具实证，非接口返回）

| # | 验证项 | 命令/证据源 | 修复前 | 修复后 | 判定 |
|---|--------|------------|--------|--------|------|
| V1 | 真库探针定位卡源会话 | `node <bank>/scripts/locate-transcript-probe.mjs session-7f37b807-…` | **exit=1**「转录未找到」 | **exit=0**，输出 `…\session.v3.jsonl.zstd` | ✅ |
| V2 | defer 卡实际回流（A/B 对照） | 调度器日志 + 文件系统 | 18:23 扫尾 `写入 0 / 保留 4` | 18:25 `写入 4 / 保留 0` | ✅ |
| V3 | 落盘实证 | `docs/devref/shoucang/` 新文件 ×4（569–805 B，`# [项目事实] reference · …`，工作区 `D:\FF\shoucang`） | 无（自 09-10 起 0 张） | 4 张 | ✅ |
| V4 | pending 消化 | `suite/knowledge/pending/` | 4 卡滞留 | 仅剩 `README.md`；4 卡入 `.processed` | ✅ |
| V5 | 审计留痕 | `distill-audit.jsonl` 的 `defer-flush` | 7 行 | **11 行**（+4，含 target/workspace/cardType） | ✅ |
| V6 | 空转归零 | 调度器日志 18:25:40 之后 | 每轮 4 卡 × 3 attempt × 每 10 min（累计 352 行） | 33 行日志中反解失败/保留 = **0** | ✅ |
| V7 | 蒸馏未受扰动 | 日志 `6ba51f20` 段 2/3、3/3 | 段 3 曾 `dispatch-failed` 停在 seq 262 | 续传推进 **425→524→676** | ✅ |
| V8 | 回归门禁 | `npm test` | — | **exit=0**（新用例 41 PASS / 0 FAIL；mcl 18 PASS；treeops 18 PASS；hardcode ✅） | ✅ |
| V9 | 部署面一致 | `node scripts/check-deploy-sync.mjs` | 3 件 DIFF（改而未部署） | 一致 24 / **不一致 0** → PASS | ✅ |
| V10 | 安装副本同步 | SHA256 比对 | — | 仓 `lib/distill.js` == 安装副本（`80E490…F063`）；插件热重载「清缓存 14 模块 / 1 fiber / active」 | ✅ |
| V11 | 库快照 | 库 git | — | `512f2e6 fix(archive): 转录命名版本无关定位…`（工作树干净）；覆盖前 3 件已备份 `audit/backup-deploy-20260911-182442/` | ✅ |

---

## ⚠️ 残留（未在本次实施，需你拍板）

| # | 项 | 为何没顺手做 | 建议 |
|---|----|-------------|------|
| F-2 | 永久不可解 defer 卡的**退避/上限/审计** | 其**具体触发源已随 F-1 消除**（4 卡已回流、空转归零）；改动落在插件运行时（`flushDeferCards`），**无法用 `test.mjs` 单元覆盖** ⇒ 与"改动须有测试/闸门"的纪律冲突，故未擅自实施 | 建议做**最小安全版**：卡内记「回流尝试 N」+ 达阈值停止重试并落审计 `defer-stuck`（**不移动文件**，零丢失风险），并补插件侧赋值桩测试 |
| F-5 | 候选区宿主 `runtime-context` 样板未入 `CANDIDATE_NOISE` | 属**另一节点**（候选区/转正判据），本次锚定"转录定位"节点内收敛 | 补 1 条正则即可；"污染候选不参与 eligible 计算"是更大改动，建议单独一轮 |
| F-4 | profile 声明重钉（现钉 `#a70f134`）+ **推送 origin**（现落后 **30** 提交） | 推送是不可逆公开动作，且工作树尚有 **A 方案 WIP（8 件）**未提交 ⇒ 需你决定提交/推送范围 | 建议：A 方案与 CHANGELOG 一并提交后再推送；推送后重钉声明 + `pnpm install` + SHA256 复核 |
| — | 本轮**提交范围** | 只暂存本任务 7 件（`git add` 指定文件，**不 add -A**），避免与 A 方案 WIP 混带 | 仓提交 `6c89863`；`CHANGELOG.md`（含 A 方案行 + 本次行）与 A 方案 8 件留给同一批次提交 |

---

## 📚 数据来源 & 成员产出索引

| 来源 | 内容 |
|------|------|
| 源码 | `skill/scripts/archive-lib.mjs`（`TRANSCRIPT_NAME_RE`/`pickTranscriptIn`/`locateTranscript`/`enumerateSessions`）· `src/distill.ts:665-672` · `skill/scripts/candidate_grep.mjs:47,58` · `skill/scripts/test.mjs`（新用例） |
| 实跑证据 | 探针 exit 码与输出路径 · 调度器日志 `shoucang-scheduler.log` · `distill-audit.jsonl` `defer-flush` · `docs/devref/shoucang/` 新 4 卡 · `pending/.processed/` |
| 回滚位 | 库备份 `audit/backup-deploy-20260911-182442/`（3 件）· 库 git `512f2e6^` · 仓 git `6c89863^` |
| 成员的独立专业产出 | **无**（缺陷修复非五类工程保障工作流；如需架构影响评估/回归测试计划/发布 Runbook，请下指令组队重跑） |

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
