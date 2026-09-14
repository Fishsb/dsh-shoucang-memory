# 深睡归纳契约 v17 执行方案（`[路径]` 通用任务路径 + 成败信号）——逐文件执行规格

> 制定：2026-09-09 晚（lk：积分将尽，下会话照此直接执行）。
> 依据：`docs/agent-reflection-research.md`（AWM/ExpeL/GA/Letta 对标，P1/P2 建议）。
> 执行纪律：每批次独立提交（CHANGELOG 留痕）→ typecheck/build/check-hardcode → test.mjs 28 PASS → 再进下一批。
> 部署口径：`cp -rf lib/. ~/.dsh/profiles/web/node_modules/dsh-shoucang-memory/lib/`（**勿用 pnpm up，会撞 safe-delete 守卫**）+ skill 变更文件同步 `~/.dsh/skills/managing-memory/` + `sc stop dsh-web && sc start dsh-web`。
> 测试命令：`MEMORY_ROOT=D:/FF/shoucang/_memory node skill/scripts/test.mjs`（基线 28 PASS / 0 FAIL）。

## 背景（30 秒版）

- v16 已上线：PRINCIPLES.md 退役，习得原则以 `[原则]` 行并入 AGENT.md（唯一写入口=深度睡眠归纳 pass）。
- 外部研究结论（AWM, ICML 2025）：**参数化的「任务路径」比一句原则对完成率提升大一个量级**（+51.1%）；ExpeL：**成败对比**是定位真因的最强归纳信号。
- 本方案 = P1（`[路径]` 行）+ P2（成败信号入材料），合并为一个契约版本 **v17**，一次变更走完。

## 批次 A：成败信号入归纳材料（P2，先做，改动最小）

**A1. `src/distill.ts` — `gatherDeepSleepTraces()`（约 581-648 行，现 3 段材料后加第 4 段）**

新增「窗口内蒸馏运行统计」段（数据源现成：`kRoot/audit/distill-audit.jsonl`，逐行 `JSON.parse`，过滤 `kind==='distill-run'` 且 `at >= since`）：
```
### 窗口内任务运行统计（成败对比材料；ExpeL 式信号）
- 蒸馏运行 N 次：成功（stop=completed）X 次 / 异常（error/timeout/aborted）Y 次
- 写入分布：memory a 条 / project b 条 / 拒收 c 条（gate-reject）
- ⚠️ 红线：**只给统计与 stop/route 字段，不携带 target 文件名与 reason 全文**（可能含项目专名，跨工作区红线）
```
实现要点：复用 `readFileSync(auditFile)`（auditFile 变量已存在，约 208 行）；预算上限 800 字符，超限只保留统计行。

**A2. `src/distill.ts` — `DEEP_SLEEP_PROMPT`（137 行起）**

在双通道句后加一句（放「跨工作区红线」段之前）：
```
- 材料若含「窗口内任务运行统计」：先做成败对比（ExpeL 式）——异常集中出现的环节才是真因所在；对比结论仍受跨工作区红线约束，不得把单项目细节写成原则/路径。
```

**A3. 验证**：机检三件套 + test.mjs 28 PASS + 部署后手动 `POST /api/shoucang-panel/deepsleep/trigger` 看日志「窗口内痕迹 N 字符」较此前变大（多了统计段）。
**回退**：单提交 revert。

## 批次 B：契约 v17 —— `[路径]` 通用任务路径行（P1 主体）

**设计定稿**：复用 `principles` 数组管线（写入/门禁/审计全复用，零新解析分支），仅行标签扩展为 `[原则]` | `[路径]` 二选一：
- `[原则] <主题 · 一句泛化> → notes/…`（不变，方向指引）
- `[路径] <任务类型> · <步骤概要> → notes/flows.md §小节`（新增，可执行路径）

**B1. `src/distill.ts` — `DEEP_SLEEP_PROMPT`（137 行起，四处）**
1. 开头任务句：「反思必须双通道」改为「三通道：认识自己（原则）+ 认识用户（USER.md）+ 沉淀通用任务路径（[路径] 行）」。
2. 提炼判据（140 行区）加：
```
- 路径提炼判据：同一任务类型在窗口内出现 ≥2 次（痕迹/运行统计可见重复模式）→ 归纳 1 条路径；只归纳成功走通的任务，失败任务只进原则教训。
- 路径行格式：`[路径] <任务类型 ≤10 字> · <步骤概要 ≤40 字，用 ①②③ 或 → 串联> → notes/flows.md §小节`；**具体值必须变量化**（如 <项目名>/<端口>/<文件名>，AWM 教训：不抽象=过拟合单例）。
```
3. JSON 输出示例（148 行区）的 principles 数组加一条：`{"action":"add","text":"[路径] DSH 插件升级 · ①提交推送 ②cp 覆盖 lib ③sc restart ④四端点 200 → notes/flows.md §升级"}`。
4. 「同主题 ≥3 条痕迹」句补「（原则）」限定，与路径判据区分。

**B2. `src/distill.ts` — 三处正则放宽（`^\[原则\]` → `^\[(原则|路径)\]`）**
- `runDeepSleep` 内现行清单 `currentList`（约 747 行 `filter((l) => /^\[原则\]/.test(l))`）
- `applyPrinciples`（约 651 行起）内行格式校验与去重处
- profileOps 无关不动。

**B3. `skill/scripts/memory_write_gate.mjs`**
- `[tag]` 索引行格式校验的标签集（36-46 行区，AGENT.md 段）加 `路径`；头注释补 v17 一句。

**B4. `skill/scripts/memory_health_check.mjs`**
- `INDEX_FILES` AGENT.md tags（34 行）加 `'路径'`；头注释补 v17。

**B5. `skill/memory-whitelist-spec.md`（版本 v16→v17）**
- 头部版本行改 v17（加「v17：新增 [路径] 通用任务路径行，对标 AWM；成败信号入归纳材料」）。
- §5.5 标签表（145-146 行区）`[原则]` 行后加一行：
  `| [路径] | 通用任务路径（v17）：可复用的任务类型级步骤序列，具体值变量化；唯一写入口=深度睡眠归纳 pass，只从成功任务归纳 | [路径] DSH 插件升级 · 提交→覆盖→重启→验证 → notes/flows.md §升级 | 单次任务的具体步骤（归 notes）；失败任务（只进原则教训）；未变量化的细节 |`
- §5.8 标题「agent 画像 · 习得原则」→「agent 画像 · 习得原则与任务路径」，表格加 [路径] 行格式。
- 变更记录加 v17 行（2026-09-09 用户拍板「agent 像人一样归纳通用认知与任务通用路径」）。

**B6. `skill/engine/target-registry.json`**
- memory.comment 追加「；v17 新增 [路径] 行（任务路径，同门禁同写入口）」。

**B7. 无需改动（验证点，不是漏项）**：
- `panel.ts buildHotMemoryText`：AGENT.md 注入=全索引行读取，`[路径]` 行自动随画像注入，无标签过滤。
- `client.js`：无硬编码标签。
- `targets.ts`：BUILTIN 白名单只管文件级（AGENT.md 整文件），不管行标签。

## 批次 C：文档同步 + 部署 + 实证

**C1. 文档**：`README.md` 深睡句加「与 `[路径]` 任务路径」；`docs/agent-reflection-research.md` §3 P1 标「✅ 已落地（v17）」；`skill/audit-protocol.md` §5 归纳输出句同步；`D:\FF\modules\shoucang.md` S06 行加 v17；nav-docs DOC-004 标题升 v17。
**C2. CHANGELOG [Unreleased] Added 记一条（契约 v17 全景）。**
**C3. 机检**：typecheck + build + check-hardcode + test.mjs（28 PASS；若 test 有原则门用例需加 [路径] 用例——`skill/scripts/test.mjs` 内搜「原则门」，仿现有用例加一条 [路径] 正常 + 一条格式违规）。
**C4. 部署**：lib 覆盖 + skill 变更文件（spec/write_gate/health_check/registry/audit-protocol）同步生产库 + sc restart。
**C5. 实证闭环**：`suite/knowledge/pending/` 已有 2 个真实候选（深睡窗口 bug 教训、safe-delete 绕法——都是可变量化的任务路径素材）→ 手动 trigger → 预期产出第一条 `[路径]` 行（write_gate 放行）+ 可能的 `[原则]` 行 → `grep '^\[路径\]' ~/.dsh/skills/managing-memory/AGENT.md` 非零 = v17 闭环完成。
**C6. 收尾**：nav-actions 登记 ACT-008（done）；`.workbuddy/memory/` 当日日志追加。

## 提交切分（Conventional Commits）

1. `feat(deep-sleep): 归纳材料带任务运行成败统计（ExpeL 式对比信号）` —— 批次 A
2. `feat(spec v17): 深睡归纳新增 [路径] 通用任务路径行（对标 AWM，变量化抽象）` —— 批次 B + C1/C2
3. `chore(deploy): v17 上线验证` —— C4/C5（如生产验证有修正）

## 明确不做（已拍板/已论证）

- insight 投票制（ExpeL UPVOTE/DOWNVOTE）——replace+审计已够，复杂度不划算。
- 事件型反思触发（GA 重要性阈值）——与「全部停滞才归纳」拍板冲突，暂缓。
- 失败任务归纳为路径——只进原则教训（AWM 只从成功学）。
