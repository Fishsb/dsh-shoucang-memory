# 睡眠链路专项检索报告

**日期**：2026-09-11
**工作流**：工作流 1 变体（综合代码审查 / 链路健康检索）
**参与成员**：Rex（SRE 工程师）· Cody（代码审查师）· Tessa（测试专家）· 甄宇航（主理人汇编）

---

## 📌 TL;DR（执行摘要，3-5 行）

- 深睡（deep-sleep）链路**本身功能健全**：状态机、水位、并发守卫、子代理感知护栏全部按设计工作，37 轮审计无异常崩溃。
- 但审计暴露一个**真实缺陷**：`gate=all-rejected` 的轮次被判定为 `done` → **水位照推 → 被拒材料永久丢弃（静默丢料）**。窗口内实证 2 轮、共 4 条候选行丢失。
- 触发该缺陷的**根因已修复**（提交 `5062301`，16:44）：生成端 prompt 未携带格式约束 → 产出普遍超限 → 逐条被格式门拦下。
- ✅ **水位语义缺陷本身已于同日修复并验证**（`64fa33a` + `c9d67f5` + `e9da67b`）：判据抽为纯函数 `deepSleepLanded` + 15 项定点单测 + 接入 `npm test`；90 PASS 无回归，5 道机检门全过。
- 🔴 0 项（P0 已闭环）/ 🟠 1 项（投影静默回退，P1）/ 🟡 2 项 / 🟢 2 项。**无阻塞项**。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟢 **通过**（P0 缺陷已修并验证） |
| 阻塞项数量 | 0 |
| 关键行动项 | 3 条（余 P1/P2） |
| 建议下一步 | ① 为投影缺失加告警（P1）；② 观测 `all-rejected` 频次（重试放大属有意取舍）；③ 合并 `deep-sleep-probe` 样本后再评探针 |

---

## 🔍 链路全景（触发 → 蒸馏 → 落地 → 水位）

深睡链路的关键控制点与实证位置：

| 环节 | 实现位置 | 语义 | 状态 |
|------|---------|------|------|
| 触发巡检 | `src/distill.ts:2755-2760` | `now - hottest ≥ idleMs` 且 `hottest > lastDeepSleepAt` | ✅ 正常 |
| 子代理感知 | `src/distill.ts:2758` | 探测未决 > 0 → 保守跳过 | ✅ 正常 |
| 窗口取点 | `src/distill.ts:2762-2765` | 水位**推进前**取 `since`（2026-09-09 实修） | ✅ 正常 |
| 材料阈值 | `src/distill.ts:2301` | `traces.length < minTraces` → `no-traces` | ✅ 正常 |
| 落地门 | `src/distill.ts:1590-1634` | 逐条门 + 并集终门 | ✅ 门正确 |
| 水位裁决 | `src/distill.ts:2768-2777` | `failed` 回滚，其余推进 | 🔴 **见缺陷 1** |

---

## 🔍 审查发现（按严重度排序）

| # | 严重度 | 类别 | 文件:行 | 问题描述 | 建议修复 | 来源 |
|---|--------|------|---------|---------|---------|------|
| 1 | 🔴 严重 → ✅ **已修** | 正确性 | `distill.ts:2607` + `:2768-2773` | **`all-rejected` 被判 `done` → 水位推进 → 静默丢料**。`runDeepSleep` 返回值仅由 `stop==='completed' && out` 决定，与门是否落地**完全解耦**。审计实证：`08:32:23.997Z`（att=3 add=0）与 `08:48:10.129Z`（att=1 add=0）均 `stop=completed` → 返回 `done` → 水位前移 → 4 条候选永久划出窗口 | ~~判据加 `landed`：全拒收归 `failed`~~ **已实施**：抽为纯函数 `deepSleepLanded`（`64fa33a`/`e9da67b`），15 项单测锁定 | Cody + 主理人复核 |
| 2 | 🟠 高 → ✅ **已修** | 可靠性 | `distill.ts:2607` | **水位与落地解耦的一般化风险**：不止 `all-rejected`，任何 gate 失败（exit=1/2/4）只要 `stop=completed` 就推水位丢料。`maturation-rejected` 与尾部总门失败同属此列 | **已实施**：谓词不枚举 gate 文案，天然覆盖 `:1612`/`:1621`/`:1633`/`:1641` 全部零落地出口（`+` 追加 `write_gate 未就位` 排他，`c9d67f5`） | Tessa + Cody |
| 3 | 🟠 高 | 可维护性 | `skill/scripts/memory_write_gate.mjs:101-108` | **投影缺失时静默回退内建 30/40**（catch 吞异常，无告警）→ 双源漂移风险；若 `criteria-gate.json` 生成物缺失/损坏，门会悄悄用旧硬编码值，重现 `5062301` 之前的故障 | catch 分支加 `log`/审计告警，投影缺失应显式失败而非静默降级 | Tessa |
| 4 | 🟡 中 | 可观测性 | `distill.ts:1594` / 审计字段 | `gateExit=None`（`08:32:23.997Z`）：early-return 路径未回填 `lastExit` → 审计区分度下降，同是 `all-rejected` 无法区分 exit 码 | early-return 前回填 `gateExit` | Tessa |
| 5 | 🟡 中 | 数据完整性 | 审计文件 | **21/37 轮为老格式 `{at, kind}`，无计数字段** → 趋势不可全量回算，`attempted vs added` 比例分母仅 3 轮（诚实口径） | 审计 schema 版本化；历史轮次标注「无计数」 | 主理人 |
| 6 | 🟢 低 | 样本量 | `distill-audit.jsonl` | `deep-sleep-probe` 仅 1 行 → 探针路径样本不足，无法评估其有效性 | 积累样本后再评 | Tessa |
| 7 | 🟢 低 | 文档 | `distill.ts:277` | 注释仍提旧名 `judgement-ledger`（只读兼容，非缺陷，本日已对齐台账正名文档） | 顺手清理注释 | 主理人 |

---

## 📊 量化证据（权威口径）

**37 轮 deep-sleep 全量分桶**（数据源：`~/.dsh/suite/knowledge/audit/distill-audit.jsonl`）

| 指标 | 数值 | 说明 |
|------|------|------|
| 总轮次 | 37 | 含 21 轮老格式（无计数） |
| 有计数字段轮次 | **3** | `attempted` 字段为近期新增 |
| `attempted` 合计 | 5 | — |
| `added` 合计 | 1 | — |
| `attempted>0 && added==0` | **2 轮** | `08:32:23.997Z`、`08:48:10.129Z` |
| `stop` 分布 | `completed` 11 / `error` 4 / `aborted` 1 / `None` 21 | — |
| `gate` 分布（有计数 3 轮） | `all-rejected` 2 / `pass` 1 | — |

**被拒行直方图**（全部 deep-sleep 行 `rejectedLines`）

| 前缀 | 计数 | 判定 |
|------|------|------|
| `[gate:行格式违规]` | **4（100%）** | 3 条 `[原则]` + 1 条 `[路径]` |

**被拒内容逐条核验** —— 全部为**真实超限**，非门误判：

| 被拒行 | 字数 | 上限 | 结论 |
|--------|------|------|------|
| `[原则] 沙箱子进程约束 · spawn 管道 EPERM…` | 未标注概况，概况超 30 | 30 | ✅ 正确拒绝 |
| `[原则] 写入链实证 · 写后读回实质内容…` | 38 | 30 | ✅ 正确拒绝 |
| `[原则] 状态推进须确认 · 下游推进只认完成信号…` | 36 | 30 | ✅ 正确拒绝 |
| `[路径] 本地插件注入 · ①状态自检…` | 概况超 40 | 40 | ✅ 正确拒绝 |

> **门是好的、阈值是对的**；缺陷在**生成端未带约束 + 水位与落地解耦**。

---

## 🧠 根因分析（5 Why，缺陷 1）

1. **为什么材料丢了？** → `all-rejected` 轮水位照推，候选永久划出窗口。
2. **为什么水位会推？** → `runDeepSleep` 返回 `done`（`distill.ts:2607` 仅看 `stop==='completed' && out`）。
3. **为什么会 `all-rejected`？** → 生成端产出的原则/路径行概况普遍 31/36/38 字，超 30 字上限。
4. **为什么产出超限？** → prompt 未携带格式约束，模型不知上限（`memory_write_gate.mjs:98-99` 自陈）。
5. **为什么会漏（水位解耦）？** → `done` 判据锚在**代理完成**，而非**落地成功**；`all-rejected` 与 `pass` 在裁决处不可区分。

**根因层**：③④ 已修（`5062301`，约束派生进判据段 + prompt 携带）；②⑤ **未修**（水位语义）。

---

## 🧪 测试覆盖评估

| 项 | 结果 |
|----|------|
| 四套单测 | 90 PASS / 0 FAIL（`test-layering` 24 / `test-forgetops` 30 / `test-treeops-split` 18 / `test-mcl` 18） |
| 机检门 | 6/6 PASS（`check-criteria` / `check-hardcode` / `check-carriers` / `check-field-usage` / `check-runner` / `check-deploy-sync`） |
| 深睡专属测试 | ⚠️ **无**——四套单测中无 deep-sleep 水位语义的定点用例（这正是缺陷 1 长期存在的空隙） |

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 状态 |
|---|------|---------|--------|------|
| 1 | 修 `runDeepSleep` 裁决：全拒收归 `failed`，禁止推水位 | Cody | **P0** | ✅ **已完成**（`64fa33a`） |
| 2 | 补深睡水位语义单测（`all-rejected → failed`、`attempted===0 → done`） | Tessa | **P0** | ✅ **已完成**（`e9da67b`，15 PASS） |
| 3 | 排除 `write_gate 未就位` 误判 done（基础设施失败） | 主理人复核追加 | **P0** | ✅ **已完成**（`c9d67f5`） |
| 4 | `memory_write_gate.mjs` 投影缺失分支加告警，禁静默回退硬编码 | Cody | P1 | ⏳ 待办 |
| 5 | early-return 路径回填 `gateExit`，恢复审计区分度 | Cody | P2 | ⏳ 待办 |
| 6 | 审计 schema 版本化 + 历史轮次标注「无计数」 | Rex | P2 | ⏳ 待办 |

---

## 🔧 修复实施记录（P0 三项，2026-09-11 当日闭环）

**修复内容**：判据从「只看代理完成」改为「兼认落地」。

```ts
// src/distill.ts（模块级导出纯函数 · 单一实现）
export const deepSleepLanded = (stop, out, app) => {
  if (stop !== 'completed' || !out) return false              // 未完成/无产出 ⇒ failed
  if (app.gate === 'write_gate 未就位') return false           // 基础设施失败 ⇒ failed（追加）
  return app.added > 0 || app.attempted === 0                  // 有落地 或 本就无提案 ⇒ done
}
```

判定口径（四态）：
- `stop !== 'completed' || !out` → **failed**（回滚重试）
- `gate === 'write_gate 未就位'` → **failed**（门禁缺席，基础设施失败，不得计为已消化）
- `added > 0` → **done**
- `attempted === 0` → **done**（纯 `profileOps`/`pointerOps`/`treeOps`/`forgetOps` 轮或空轮；**回滚会致无限重处理**）
- `attempted > 0 && added === 0` → **failed**（100% 拒收 = 材料损失）

**关键设计取舍**：谓词**不枚举 gate 文案**，故天然覆盖 `:1612`（maturation）/ `:1621`（all-rejected）/ `:1633` / `:1641`（尾部总门）**全部零落地出口**——更小更稳，不会漏掉未来新增的 gate 分支。

**独立验证（主理人亲验，非采信成员自述）**：

| 验证项 | 结果 |
|--------|------|
| `npm run typecheck` | exit 0，零错误 |
| `npm run build` | exit 0 |
| **构建可复现性** | 重跑 build 后 `lib/distill.js` sha1 **不变** ⇒ 提交产物与源码一致 |
| 四套既有单测 | **90 PASS / 0 FAIL**（24 + 30 + 18 + 18，无回归） |
| 新增判据单测 | **15 PASS / 0 FAIL**（驱动编译产物 `lib/distill.js`） |
| `npm test` 总入口 | **exit 0** |
| 5 道机检门 | `check-criteria` / `check-carriers` / `check-hardcode` / `check-changelog` / `check-deploy-sync` **全过** |
| `check-deploy-sync` | 一致 24 · ❌ 不一致 **0** |

**提交**：`64fa33a`（核心修复）→ `c9d67f5`（`write_gate 未就位` 排他）→ `e9da67b`（纯函数抽取 + 单测）→ `499aab7`（CHANGELOG 补记）。

**新增回归防护**：`scripts/test-deepsleep-verdict.mjs` 已接入 `npm test` 链 —— 这正是此前缺失的结构性空隙（四套单测无一覆盖深睡判据分支，缺陷因此长期存在）。

---

## ⚠️ 待完善 / 已知局限

- **重试放大（有意取舍）**：全拒收时水位不再推进 ⇒ 若某痕迹被门禁**持续** 100% 拒收（如指针悬空 `gateExit=2`），会每轮重处理同批痕迹。**这是刻意的「宁可重试不可静默丢」**，拒因已进审计；建议后续观测 `all-rejected` 频次，若长期全拒收再考虑退避上限。
- **分母薄弱**：`attempted vs added` 比例仅基于 3 轮有计数样本，统计置信度低；21 轮老格式无法回算。
- **探针样本不足**：`deep-sleep-probe` 仅 1 行，无法评估。
- **投影静默回退未修**（P1）：`memory_write_gate.mjs:101-108` 投影缺失时静默用内建 30/40，双源漂移风险。
- **两成员机制表述经主理人修正**：Cody 与 Tessa 的**结论**（静默丢料）一致且正确，但过程表述混入了**普通蒸馏**的 `writeWatermark` 逻辑；主理人复核定位深睡水位在 `distill.ts:2768-2777` 独立裁决 —— 机制以本报告为准。

---

## 📚 数据来源 & 成员产出索引

- **Rex（SRE 工程师）**：触发/水位/周期裁定 —— 37 轮全量分桶、`stop` 分布、水位推进实证。
- **Cody（代码审查师）**：落地验证 —— `runDeepSleep` 返回路径追踪、`distill.ts:2607` 裁决点定位。
- **Tessa（测试专家）**：材料阈值/门禁有效性 —— 拒收直方图、`memory_write_gate.mjs` 实现、根因提交 `5062301` 定位。
- **主理人复核**：`distill.ts:2768-2777`（水位裁决）、`:2515-2552`（落地调用链）、审计全量重算。
- **审计数据**：`~/.dsh/suite/knowledge/audit/distill-audit.jsonl`（746 行，含 37 轮 deep-sleep）。
- **代码**：`src/distill.ts`（219KB）、`skill/scripts/memory_write_gate.mjs`、`skill/engine/criteria.json`。

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
