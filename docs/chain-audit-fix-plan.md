# 全模块链条审查 · 收口方案（2026-09-11）

> 触发：对 shoucang 全部模块做「功能链条核查」后落地了 A/B/C 三级修复（清单见 `CHANGELOG.md [Unreleased]`）。
> 本文是**剩余工作的执行方案**：① 工作树收干净（分组提交）② 记忆库容量收口 ③ `_memory/` 漂移处置 ④ 主线衔接。
> 口径：路径一律仓内相对或 `~/.dsh/...`；本档不含私人数据（`_memory/`、`docs/devref/` 已在 .gitignore）。

## 0. 已完成部分（现状锚点）

| 项 | 状态 | 证据 |
|---|---|---|
| A1 水位判据纳入落盘结果（有界重试 + 强制推进审计） | ✅ | `src/distill.ts:1176`（判据）/`:1184`（推水位）/`:1190-1206`（失败分支 + `dispatch-failed-forced`） |
| A2 入口 `flushDeferCards` + 候选池排除 `-project-defer-` | ✅ | `src/distill.ts:1042` / `:1090-1093` |
| A3 claim 锁统一（入口写 / 扫尾只读让位） | ✅ | `src/distill.ts:1053`（写）/`:1234`（释放）/`:2772`（扫尾读判） |
| B1 引导链改单库骨架；旧 vault 资产退役 | ✅ | `src/panel.ts:129-208`；删除 `default-project.json`、`default-vault-template.tar.gz`、`scripts/gen-default-project.mjs` |
| B2 白名单链扶正（库自治名副其实） | ✅ | 新增 `skill/whitelist.json` + 生产库同文件；`shoucang_targets_probe` 报 `来源=file` |
| B3 `shoucang_suite` 空转消除（缺省自检本插件） | ✅ | `src/scheduler.ts` `SELF_MEMBER`/`memberSpecsOf`；实测「1 成员 · status=profile」 |
| B4 `prescanMinChars` 补配置通道 | ✅ | `src/scheduler.ts` interface + zod + `registerDistill` 透传 |
| B5 契约按现码重写 v6；`knowledge-append.mjs` 退役 | ✅ | `skill/engine/distill-contract.md`（v6）、`skill/engine/README.md` |
| B6 `npm test` 聚合入口 | ✅ | `package.json` → 40 + 30 + 18 PASS + check-hardcode |
| B7 评测器固定采样窗口 | ✅ | `skill/scripts/recall-eval.mjs` `--since` / `--sids` + 窗口回显 |
| B8 §抑制单一实现 | ✅ | `src/targets.ts:246-283` `sectionKeyOf`/`dedupeBySection`；`src/vec.ts` 复用 |
| C 级 死代码 / 幽灵端点清单 / 写门异步化 | ✅ | `src/distill.ts`（删 `extractDelta`、`truncatedTail`、未用 import）、`src/panel.ts`（头注释+日志按 28 路由、`gateWrite` 改 `execFile`） |
| 治理：索引外 2 文件补登记 | ✅ | `nav_node target=SC-S03 files=…` → 登记文件 105 → 107 |
| 架构档同步 | ✅ | 三档（overview / SC-S07 / SC-S05）行号重定位 467 处、锚点 265/265 + 105/105、`9/9 新鲜` |

**终检命令**（复核用，全绿）：

```bash
npm run typecheck && npm run build && npm test
node skill/scripts/memory_health_check.mjs ~/.dsh/skills/managing-memory
# 架构档新鲜度（治理根下）
node D:/FF/.internal/arch/render/_tools/arch-check.mjs anchors .internal/arch/_anchors-SC-S07.json
```

## 1. 第一步：工作树收干净（分组提交）— ✅ **已执行（路线 A）**

**结果**：`24f10dd fix(shoucang): 全模块链条审查修复（A/B/C 三级）+ 收口此前 ACT 批次`（49 files，+3045/−880；工作树残留 0）。
提交前/后门禁各跑一遍：`typecheck` exit 0、`npm test` 40+30+18 PASS + `check-hardcode` ✅、架构档 9/9 新鲜。

**问题**：工作树同时承载**两批**未提交改动——(a) 此前 ACT 批次（认知对照/分裂律/ACT-030），(b) 本轮审查修复。
`src/distill.ts`、`src/panel.ts`、`src/activity.ts`、`src/treeops.ts` 等**同一文件内两批混杂**，因此**按文件无法干净切分**。

| 组 | 语义 | 涉及文件（示例） | 建议提交信息 |
|---|---|---|---|
| G1 | 此前 ACT 批次（先行） | `src/activity.ts`、`src/treeops.ts`、`client.js`、`docs/memory-core-model.md`、`skill/memory-whitelist-spec.md`、`skill/scripts/{memory_health_check,memory_write_gate,read_section}.mjs`、`docs/{cognition-mapping-landing-plan,split-law-landing-plan}.md`、`scripts/test-{forgetops,treeops-split}.mjs` | `feat(memory): 认知对照与分裂律落地批次（ACT-025/027/028/030）` |
| G2 | 本轮：蒸馏/召回层 | `src/distill.ts`、`src/targets.ts`、`src/vec.ts`、`src/scheduler.ts` | `fix(distill): 水位判据纳入落盘结果 + claim 统一 + defer 回流 + §抑制单一实现` |
| G3 | 本轮：面板与打包 | `src/panel.ts`、删除 `default-*` 三件、`package.json` | `fix(panel): 引导链改单库骨架（退役旧 vault 模板）+ 写门异步化 + 幽灵端点清理` |
| G4 | 契约与文档 | `skill/engine/{distill-contract.md,README.md}`、`skill/whitelist.json`、`CHANGELOG.md` | `docs(contract):  distill 契约 v6 按现码对齐 + 白名单模板` |
| G5 | 构建产物 | `lib/**`（本仓惯例：lib 随仓） | 随 G2/G3 一并提交 |

**两条执行路线**（G1/G2/G3 文件交叉，只能二选一）：

- **路线 A（推荐）**：一次提交收全部，消息里分段列两批要点。
  ```bash
  cd <repo>
  npm run typecheck && npm test          # 提交前必跑
  git add -A && git commit -m "fix(shoucang): 全模块链条审查修复（A/B/C 三级）并收口此前 ACT 批次"
  ```
  理由：单插件工作仓、未发布版本、`lib/` 随仓 ⇒ 拆 hunk 的收益低于风险。
- **路线 B（历史最干净，成本高）**：用 `git add -p` 逐 hunk 拆两笔提交（先 G1 再 G2/G3），需要人工判每个 hunk 归属；仅当要对外发布历史时值得。

**提交后必做**：`git status --porcelain` 应为空；`npm test` 仍全绿；`nav_graph mode=arch` 应保持 `新鲜 9 / 过期 0`。

## 2. 第二步：记忆库容量收口（`MEMORY.md` 98%）— ✅ **已完成**

**实测结果（2026-09-11）**：`MEMORY.md` **4988 → 2577 字符（非空白，98% → 52%）**、索引 **76 → 42 行**，体检 **exit=2 → exit=0**。
做法：① 同族扇入合并（环境族 20→5、自托管族 14→4、Windows 族 12→2、假绿族 7→2、project-nav 3→1）；② 退役 `[lesson] DSH 开发知识迁移指引`（pmg 已移除）；
③ **顺手修掉 gate 抓出的 6 处历史悬空 § 指针**（体检只查文件级，长期隐形）：`§记忆库结构设计`→`§记忆体系分工`、`release.md §发布链`→`flows.md §进度核查与发布自检`、`§记忆库规范/§指针非限制`→`§指针规范化与并发`、`tools.md §project-nav`→`lessons.md §行号与字节核验`、`§沙箱子进程`→`§沙箱与子进程`；
④ 台账 `notes/INDEX.md` 41 行标 `merged 2026-09-11` + 1 行 `retired` + 补 10 行（体检「元数据表覆盖 ✅」）；
⑤ 备份 `audit/backup-20260911-cap/{MEMORY.md.pre-consolidation, INDEX.md.pre-merge}`——**零物理删除，`notes/` 正文未动**。

<details><summary>原方案（留档）</summary>

现状：`MEMORY.md` **4908 / 5000（98%）**，体检退出码 2（>85% 需审计）；`notes/env.md` 9810 字、`lessons.md` 13129 字均已超 8000 警戒线。

处置（**只改内容，不改代码**，全部走既有写门）：

1. **体检取数**：`node skill/scripts/memory_health_check.mjs ~/.dsh/skills/managing-memory`（拿容量/零召回/重复/指针三张清单）。
2. **四问提纯**（对 `MEMORY.md` 逐行裁）：
   - 零召回 ≥2 次审计且非 env/release → 下沉 `notes/` 或删；
   - 同 `标签+主题` 重复 → 合并且只留信息更全者；
   - 概况 >30 字 / 主题 >12 字 / 带日期戳 → 按 spec §8 收敛；
   - 超 R(1000) 节 → 按 §8.1 分裂律裂 `###`（已有 `memory-append` 的「父/子」路径 + `treeOps.split` 两条出口）。
3. **落盘纪律**：只在⑥⑦闸口写、一律经 `write_gate`（`exit 1=容量 / 2=指针 / 4=格式`）；改完重跑体检。
4. **若选择扩容而非提纯**：面板「参数调节」改 `capMemory` 会让 UI 生效，但 `5000 = 50 行 × 100` 是 §8.1 的**派生值**，改数须同步 `write_gate` 头注释列的四处投影 + 宿主五处（`scheduler.ts` 容量门 / `panel.ts` `CAP_GATES` / `client.js` 输入框 / `distill.ts liveCaps` / `memory-whitelist-spec` 数值表）。

**判据**：体检 `exit=0` 且 `MEMORY.md` ≤ 85%（≤4250 字符）；`npm test` 不回归。

</details>

## 3. 第三步：`_memory/` 开发库 vs 生产库漂移 — ✅ **已执行（选项 1：明确分工）**

**实测结果（2026-09-11）**：新增 `_memory/README.md` 写明「开发夹具区，**非生产库**（生产库 = `~/.dsh/skills/managing-memory`，由 `targets.memoryLibRoot()` 解析；`MEMORY_ROOT` 只影响脚本进程）」；
退役层物理文件归档为 `_memory/audit/PRINCIPLES.md.retired-20260911`（v16 已把独立原则层并入 AGENT.md）；**零数据删除、零内容改动**。
夹具可跑性实证：`MEMORY_ROOT=_memory node skill/scripts/memory_health_check.mjs` → **exit=0**（MEMORY 1083/5000）。

<details><summary>原方案（留档）</summary>

**判因**：插件读写唯一根 = `~/.dsh/skills/managing-memory`（`targets.memoryLibRoot()`）；`_memory/` 是**私人开发区**（gitignore）。
实测两者 `MEMORY.md`/`USER.md`/`AGENT.md` + 6 个 notes **全不一致**，且 `_memory/PRINCIPLES.md` 是 v16 已退役的独立层（原则已并入 AGENT.md）。

**三选项**：

| 选项 | 做法 | 代价 | 适用 |
|---|---|---|---|
| **1（推荐）明确分工** | `_memory/` 只作「脚本夹具/回归样例」：在 `_memory/README.md` 写明「非生产库」，把 `PRINCIPLES.md` 移入 `_memory/audit/` 留档；回归/体检显式用 `MEMORY_ROOT=<_memory>` | 低（不动数据） | 现状：生产库才是真源 |
| 2 对齐 | 以生产库为准整体覆盖 `_memory/`（先备份 `_memory/audit/backup-<ts>/`） | 丢开发区既有内容 | 开发区已无用 |
| 3 合并 | 逐节比对手工并（`notes/INDEX.md` 元数据表按状态裁决） | 高 | 开发区有独有内容 |

**判据**：`MEMORY_ROOT=<_memory> node skill/scripts/memory_health_check.mjs` 能跑通、`npm test` 全绿，且仓内文档不再暗示 `_memory/` 是生产库。

</details>

## 4. 第四步：主线衔接（可选，非本次审查范围）

- **ACT-024（影子采样去污染/退役）**：B7 落地后 `recall-eval` 可用 `--since` 固定窗口，**P3 验收判据④（横幅 uptake 不降）首次可测**；建议先定「固定窗口 + 样板判定口径」，再谈影子去留。
- **ACT-029（MCL 双通道机制化）**：方案在 `.internal/arch/shoucang-SC-S05-MCL-实施方案.md` §3（熟悉度 → 快/慢通道 → `agent/pre-step`），落地时守该档 D1「打分不得新写、调 `targets.recallIndex` / `vec.recallRanked`」与 D7「注入不涨预算（1993 字符硬基线）」。
- 顺序建议：**先 ACT-024 定口径 → 再 ACT-029 落机制**（否则验收无基线）。

## 5. 一键复核（全绿基线）

```bash
# 仓内
npm run typecheck && npm run build && npm test
node scripts/check-hardcode.mjs .
# 记忆库
node skill/scripts/memory_health_check.mjs ~/.dsh/skills/managing-memory
MEMORY_ROOT=<_memory 路径> node skill/scripts/memory_health_check.mjs
# 评测器（固定窗口做法）
node skill/scripts/recall-eval.mjs --since 2026-09-01 --n 50 --json
# 治理（根 D:/FF）
node D:/FF/.internal/arch/render/_tools/arch-check.mjs anchors .internal/arch/_anchors-SC-S07.json
node D:/FF/.internal/arch/render/_tools/arch-check.mjs anchors .internal/arch/_regen/_anchors-SC-S05.json
```

## 6. 本轮做过的 4 个设计权衡（留档，可回退）

1. **A1 有界重试**：连续 3 次落盘失败即强制推进 + 审计，避免单条坏数据永久卡住水位（宁可有记账的丢失）。
2. **B3 保工具改自检**：`shoucang_suite` / `/suite` / `assistant_capabilities` 保留，缺省变为「自检本插件装配」而非删功能。
3. **B1 代码生成骨架**：不依赖任何打包资产，并顺带把 `scripts/` + `engine/` 铺进新库根（否则新库记忆循环空转）。
4. **B2 写生产库 `whitelist.json`**：内容与内建缺省逐字一致 ⇒ 行为零变化，只为让「库自治」链名副其实。

（相关架构档：`.internal/arch/shoucang-overview.md` / `-SC-S07-deepsleep.md` / `-SC-S05-MCL-实施方案.md`，均 `新鲜`。）
