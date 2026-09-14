# 注入链与召回链专项审查报告

**日期**：2026-09-11
**工作流**：工作流 1 变体（综合代码审查 · 双链路健康检索）
**参与成员**：Cody（代码审查师 · 注入链）· Archi（系统架构师 · 召回链）· Tessa（测试专家 · MCL 合规闭环）· Rex（SRE 工程师 · 端到端量化）· 甄宇航（主理人汇编 + 独立复核）

---

## 📌 TL;DR（执行摘要）

- **双链路存在 3 个真实缺陷，均已独立复核确认**（非成员单方结论）：
  1. **🔴 载体 layer 契约只声明未执行（违规率 100%）** —— `readCarrier` 的 index 分支用 `/^\[.+\]/` 无差别选行，**从不读 `CARRIERS.tags[..].layer`**。实测 **`MEMORY.md` 全部 48 行索引行都是 `gated` 标签、`always` 标签 0 行** ⇒ 注册表声明的 `P=always / R,E=gated` 对 index 载体形同虚设，整个知识索引（含 `env/flow/tool/教训/经验/路径`）被当作 always 每轮全量注入。
  2. **🔴 快通道 0/175 从未触发** —— 双门（`sim≥0.65` + top1 须为 `[原则]/[路径]`）**实测双双关闭**：175 轮最大 sim=**0.634**（零行达阈），`hasHighConf` 仅 **10/175** 命中。慢通道因此成为唯一路径。
  3. **🟠 MCL 合规判据不可靠** —— `judge` 要求模型**逐字复现** topic（`text.includes(t.slice(0,6))`），实测 **0/141** 合规、**5 次再引导 0 效果**；`Zhihu 检索` → `slice(0,6)` = `"Zhihu "`（**带尾空格**）⇒ 模型写 `Zhihu检索` 即失败。
- **量化总账**：注入有用率 **0.0000**（34 次注入 vs 141 次合规检查，**集合互斥**）；横幅实测 **~2340 字符**，其中 **~79% 与档位无关**（画像行全量注入）；MCL 预算利用率均值 **66%**（从未用满）。
- 严重度分布：🔴 **2** / 🟠 **3** / 🟡 **4** / 🟢 **2**。**阻塞项 0**（链路可用，但门控与反馈机制实质失效）。
- **机器门诚实性**：6 道机检门全过、`selfcheck` verdict=`ok`，**却与上述缺陷并存** —— 说明现有门禁**不覆盖** layer 执行、快通道可达性、合规闭环三类问题（见「测试盲区」）。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟠 **有条件通过**（可用但门控失效） |
| 阻塞项数量 | 0 |
| 关键行动项 | 6 条（2 条 P0） |
| 建议下一步 | ① 给 index 载体接回 layer 过滤（P0）；② 快通道双门重新校准或明示弃用（P0）；③ 修 `judge` 判据 + 补三类单测（P1） |

---

## 🗺️ 双链路全景（注入 ↓ / 召回 ↑）

| 环节 | 实现位置 | 契约声明 | 实际执行 | 状态 |
|------|---------|---------|---------|------|
| 载体契约（P/R/E 分层） | `criteria.json#carriers.tags`（18 标签） | P=always、R/E=gated | index 分支无过滤；profile 分支有过滤 | 🔴 **半执行** |
| 横幅组装 | `src/panel.ts:364-383` | 档位控量（levelCaps 2/4/8/10） | 仅控 MEMORY.md 切片；画像行全量 | 🔴 **档位失效** |
| 冷降权三通道 | `src/panel.ts:310-338` | 贯穿三通道 | ✅ 回退分支也生效（R6 已修） | ✅ 正常 |
| 晨起摘要注入 | `src/panel.ts:220-231` | 直接前置 | 无预算记账（≤3 行，风险低） | 🟡 |
| MCL 快通道 | `src/mcl.ts:213` | `sim≥0.65 ∧ hasHighConf` | 实测 0/175 | 🔴 **不可达** |
| MCL 慢通道注入 | `src/mcl.ts:225-233` | 首步注入 ≤600 字符 | 34 次/13457 字符，均值 396 | ✅ 正常 |
| MCL 合规判定 | `src/mcl.ts:147-150` | `includes(topic.slice6)` | 0/141 合规 | 🟠 **判据不可靠** |
| 召回融合 | `src/vec.ts#recallRanked` | RRF k=60（可回滚 weighted） | ✅ 命中真实小节，无悬空 | ✅ 正常 |
| 召回工具 | `src/scheduler.ts:427-460` | scope/topK/近似建议 | ✅ 可用 | ✅ 正常 |

---

## 🔍 审查发现（按严重度排序）

| # | 严重度 | 类别 | 文件:行 | 问题描述 | 证据 | 来源 |
|---|--------|------|---------|---------|------|------|
| 1 | 🔴 严重 | 正确性 | `src/panel.ts:288`（经 `:307`/`:300`） | **载体 layer 契约只声明未执行，且违规率 100%**：`readCarrier` 的 index 分支 `all.filter((l) => /^\[.+\]/.test(l))` **无 layer/inject 过滤**，从不读 `INDEX.md`、不查 `CARRIERS.tags[..].layer`。**实测 `MEMORY.md` 48 行索引行 100% 是 `gated` 标签、`always` 标签 0 行** ⇒ 整个知识索引被当作 always 每轮全量注入 | ① 全 `src/` 仅 `panel.ts:282` 一处用 `.inject`，且只服务 `always:profile`；② 注册表 18 标签中 7 个 `gated`（`env/flow/lesson/tool/教训/经验/路径`）；③ **live bank 直测**：`MEMORY.md` idx=48 / gated=**48** / always=**0**；`AGENT.md` idx=11 / gated=3（含 **[路径]** ）/ always=8；④ 审计 `hit` 字段实测出现 `env`×6 / `flow`×8 / `tool`×3 —— 正是 gated 标签 | Cody（主理人 grep + 直测独立复核） |
| 2 | 🔴 严重 | 提示词效率 | `src/mcl.ts:213` | **快通道 0/175 不可达**：双门 `sim>=0.65` ∧ `hasHighConf`（top1 须 `[原则]/[路径]`）实测双双关闭 → 慢通道成为唯一路径，「熟悉任务零注入」设计意图**完全落空** | 175 轮 sim ∈ [0.452, **0.634**]，`>=0.65` 计 **0** 行（最近差 0.016）；`hasHighConf` 满足 **10/175**（5.7%） | Archi（主理人独立复核） |
| 3 | 🟠 高 | 正确性 | `src/mcl.ts:149` | **合规判据要求逐字复现 topic**：`text.includes(t.slice(0,6))`。对 5 字中文 token（如 `复刻类项目`）须逐字命中；`Zhihu 检索` 的 `slice(0,6)` = `"Zhihu "`（**带尾空格**）⇒ 模型写 `Zhihu检索` 判负 | 实测 141/141 `compliant:false`；5 次再引导 **0** 次换来合规；反例验证：`slice(0,6)` 含尾空格 | Tessa（主理人 node 实证） |
| 4 | 🟠 高 | 架构 | `src/panel.ts:302,306,339` vs `:303-304` | **档位空转**：横幅实测 ~**2340** 字符，`low→smart` 仅 1850→2340（**+26%**）。因画像行（AGENT 11+6 / USER 8+8）**不受档位约束全量注入**（~1600 字符固定），档位只控 MEMORY.md 切片（2→10 行，~500 字符）⇒ **档位仅治理 ~21% 注入量** | 直接按 live bank 计算四档：1850/1956/2217/2340 | 主理人 |
| 5 | 🟠 高 | 可观测性 | `src/mcl.ts:231` vs `:250,254` | **注入与合规日志字段互斥** ⇒ 闭环无法核验：`injected` 仅出现在**首步**行，`compliant` 仅出现在**后续步**行，两集合**互斥**（34 vs 141，交集 0）⇒「注入 → 是否被用」在审计里**无法直接关联** | Rex 实测：34 注入行与 141 合规行无交集 | Rex |
| 6 | 🟡 中 | 可维护性 | `criteria.generated.ts` vs `panel.ts:340-343` | **配置双源**：投影的 `surface.injection.{budgetChars,order,relevance,freshSlots}` **无消费方**；运行时改读 `readSuiteConfig().injectRelevance/injectFreshSlots` ⇒ 改一处不生效 | 投影字段无 grep 命中消费点 | Cody |
| 7 | 🟡 中 | 容错 | `src/panel.ts:298` | **载体文件缺失静默返回 `[]`**：`catch { return [] }` 与「无记忆」不可区分，无审计信号 ⇒ 库损坏/路径错时表现为「记忆为空」而非报错 | 裸 catch，无 log/audit | Cody |
| 8 | 🟡 中 | 数据 | `src/mcl.ts:167` | **重复注入**：每条新 user 消息 `state.delete(sid)` 重置通道 ⇒ 同一任务多轮重复注入同一材料（实测 8 次冗余 ≈ **3160** 字符浪费） | 26 种签名 / 34 次注入 ⇒ 8 次冗余 | Tessa / 主理人 |
| 9 | 🟡 中 | 可观测性 | `selfcheck-latest.json` | **`verdict:"ok"` 与缺陷并存**：`shadowCorr` **−0.2699**（持续恶化）、`maturationReady:false`、`closureOk:false`，但总判 `ok` ⇒ 该 verdict 未反映链路健康 | 最新 selfcheck 实测 | Rex |
| 10 | 🟢 低 | 观测 | `selfcheck-*.json` | MCL 统计无对外端点视图（`mcl.ts:264-274` 有 status 但无 `/mcl/audit` 汇总） | — | Rex |
| 11 | 🟢 低 | 文档 | `src/panel.ts:289,294` | 历史行回落 `if (!m) return true`/`alwaysProfileTags.size===0 → true` 无 layer 校验（宽进） | — | Cody |

---

## 📊 量化证据（权威口径 · 可复现）

**载体 layer 违规实测（live bank · 决定性证据）**

| 文件 | 索引行 | `gated` 标签 | `always` 标签 | 违规率 |
|------|--------|-------------|--------------|--------|
| **`MEMORY.md`** | 48 | **48** | **0** | 🔴 **100%** |
| `AGENT.md` | 11 | 3（含 **[路径]** ） | 8 | 🟠 27% |
| `USER.md` | 8 | 0 | 8 | ✅ 0% |

> 注册表声明 `gated` 的 7 个标签：`env` `flow` `lesson` `tool` `教训` `经验` `路径`。
> `readCarrier` 用 `/^\[.+\]/` 无差别选取 ⇒ **`MEMORY.md` 全部 48 行 gated 内容按 always 每轮注入**。
> 被违规注入的实例（节选）：
> - `[env] DSH 环境 · 数据目录/3080/模型/组装链/权限模式/转录落盘 → notes/env.md §DSH 环境`
> - `[flow] 全局工程纪律 · Commits/ADR/分层/仓库可用性审查 → notes/flows.md §全局工程纪律`
> - `[tool] Zhihu 检索 · cli0.2.0/本地 → notes/tools.md §Zhihu 检索`
> - `[路径] 深睡记忆蒸馏 · ①区间起点先取值显式传参 ②按判据三通道提炼 ③done 才推进水位 → notes/flows.md §深睡蒸馏`

**载体实际注入量（live bank 直测）**

| 载体 | 来源 | 行数 | 字符数 | 受档位约束？ |
|------|------|------|--------|-------------|
| `always:index`（MEMORY.md） | `MEMORY.md` | 48 索引行 | — | ✅ 切片 2/4/8/10 |
| `always:index`（AGENT.md） | `AGENT.md` | 11 索引行 | — | ❌ **全量** |
| `always:index`（USER.md） | `USER.md` | 8 索引行 | — | ❌ **全量** |
| `always:profile` | AGENT 6 / USER 8 行 | 14 行 | — | ✅ `profileCap=3`/档 |
| **横幅合计** | | | **1850 → 2340**（low→smart） | 档位只控 ~21% |

> 注：索引行模式 `^\[.+\]`，画像行模式 `^-\s.*←\s*源:`（取自 `panel.ts:288,291`）。Rex 报 `always:index=56 行`（仅 MEMORY.md 口径差异），主理人按三分文件实测 67 行——**以本表为准**。

**MCL 注入实况（`mcl-audit.jsonl`）**

| 指标 | 数值 |
|------|------|
| `mcl-step` 总行 | 175（`mcl-ready` 13 / `mcl-skip` 30） |
| 注入事件（`injected>0`） | **34** |
| 注入总字符 | **13,457** |
| 单次注入 min/mean/max | 260 / **396** / 445 |
| 预算利用率（/600） | mean **66.0%** · min 43.3% · max **74.2%**（**从未用满**） |
| 通道分布 | slow **175** · fast **0** |
| 合规检查行 | 141（**全 false**） |
| **注入→合规闭环** | **34 ∩ 141 = ∅**（字段互斥） |
| **有用注入率** | **0.0000** |

**快通道双门实测**

| 门 | 阈值 | 实测 |
|----|------|------|
| `sim >= familiarThreshold` | 0.65 | sim ∈ [0.452, **0.634**]，达标 **0/175** |
| `hasHighConf`（top1 ∈ `[原则]/[路径]`） | — | 命中 **10/175**（5.7%） |

**召回质量抽查**：`topics` 全部命中**真实存在**的小节（深睡水位护栏 ×66、文档重锚定 ×23），**零悬空**；但 54/175 步返回**同一 topic 集**（召回冻结 —— 由 `state.delete` 重置解释）。

**环境事实（决定 sim 是否真实）**：Ollama 在线，已载 `bge-m3:latest`；`embedEnabled` 默认 `true`、`baseUrl=http://127.0.0.1:11434/v1`（`scheduler.ts:180-181`）⇒ **sim 是真实余弦，非退化 0**。故快通道不可达是**阈值/门槛标定问题，不是嵌入失效**。

---

## 🧠 根因分析（缺陷 1：layer 契约未执行）

1. **为什么 gated 行被全量注入？** → `readCarrier` index 分支只按 `^\[.+\]` 选行。
2. **为什么不按 layer 过滤？** → 该函数**只接收 `{profile, maxProfile}`**，签名的形参里就没有 layer 概念（`panel.ts:285`）。
3. **为什么签名缺 layer？** → `always:profile` 走的是「注册表驱动标签白名单」（`:280-284` 构造 `alwaysProfileTags`），而 index 分支**没有对称实现** —— 一个标签一个模式，**半途而废**。
4. **为什么机检没抓到？** → `check-carriers` 只验「每个 injectable 组合**有**渲染器」（`scripts/check-carriers.mjs`，实测输出「需覆盖组合 3 / 缺 0」），**不验渲染器是否真正执行 layer 语义** ⇒ 声明齐备即放行（**假绿**）。

**根因层**：③④ 是缺陷本体与门禁盲区；契约侧（`criteria.json`）**声明正确**，坏的是**执行侧**。

---

## 🔬 缺陷 1 的机械化证伪（Tessa · `scripts/test-carrier-layers.mjs`）

主理人要求的「加固证明」已完成并经**主理人亲自运行复核**。脚本采用**行为级**口径（驱动真实编译产物），比静态断言更强：

```
— 夹具已注册标签 = 原则, 环境, 路径, 经验, tool, flow
— P/always 标签  = 原则, 环境
— R,E/gated 标签 = 路径, 经验, tool, flow
— 取证：注入文本中出现的 index 行数 = 6

✅ A1 P/always 标签 [原则] 已进入注入面（应然）
✅ A1 P/always 标签 [环境] 已进入注入面（应然）
❌ A2 gated 标签 [路径]（layer=R）不应无差别注入 —— 当前泄漏=true
❌ A2 gated 标签 [经验]（layer=E）不应无差别注入 —— 当前泄漏=true
❌ A2 gated 标签 [tool]（layer=E）不应无差别注入 —— 当前泄漏=true
❌ A2 gated 标签 [flow]（layer=E）不应无差别注入 —— 当前泄漏=true
❌ A3 不应「全部 ^\[.+\] 行不论 layer 一律返回」—— 当前 allMemReturned=true
✅ A4 源码静态佐证：index 分支仅按 /^\[.+\]/ 选取（无 layer 参与）
✅ A4b readCarrier 从不读 notes/INDEX.md —— 实测 readsIndexMd=false

结果: 4 PASS / 5 FAIL · **真实退出码 = 1**（预期：缺陷未修前的正确信号）
```

**判读口径（重要）**：本脚本的 FAIL **不是脚本坏了**，而是**证伪成功** —— 它把「gated 层未被执行」这一缺陷固化成可复现信号。因此：

- ⚠️ **不可直接接入 `npm test`**：会因缺陷未修而恒失败，污染 CI 基线。
- ✅ **正确的接线方式**：待 P0 修复完成后接入（届时 A2/A3 应转 PASS）；或先以 `check-runner` 的 `skip` 语义登记，待修复后转 `pass`。
- 📌 **建议**：修复时用它作验收标准 —— **A2/A3 全绿 + 退出码 0** 即修复完成。

> 该脚本与主理人 live bank 直测（`MEMORY.md` 48/48 行均 gated）互为独立证据链，结论一致。

---

## 🚨 测试盲区（为何这些缺陷能长期存在）

| 盲区 | 说明 | 现状 |
|------|------|------|
| 载体 layer 无单测 | `check-carriers` 验「有渲染器」不验「按 layer 过滤」⇒ 契约执行零覆盖 | ✅ **已补** `scripts/test-carrier-layers.mjs`（待修复后接入 `npm test`） |
| 快通道可达性无单测 | 无用例断言 `sim≥阈值` 时快通道**能**触发；`test-mcl.mjs` 只测「阈值 0 + 高置信 ⇒ 快通道」的人造路径 | ⏳ 待补 |
| `judge` 正向无单测 | `test-mcl.mjs` **跳过** `compliant:true` 路径，从未断言其**可达** ⇒ 死判据长期隐形 | ⏳ 待补 |
| `topicOf`/`material`/`judge` 未导出 | 三者均为模块私有 `const`，只能经编译产物 + 假 ctx 驱动，**测试成本高 ⇒ 无人测** | ⏳ 建议导出或抽纯函数 |
| 注入量无断言 | 无用例校验横幅字符数或档位单调性 ⇒ 档位空转无人察 | ⏳ 待补 |

---

## ✅ 行动清单（按优先级）

| # | 行动 | 负责角色 | 紧急度 | 预期 |
|---|------|---------|--------|------|
| 1 | `readCarrier` index 分支接回 **layer 过滤**：读 `CARRIERS.tags[tag].inject`，`gated` 标签不得进 always 面（或走 `recallIndex` 相关性门控）——与 `alwaysProfileTags` 对称实现。**验收标准：`scripts/test-carrier-layers.mjs` A2/A3 转 PASS 且退出码 0** | Cody | **P0** | 下一提交 |
| 2 | 快通道双门**重新校准或明示弃用**：要么下调阈值/放宽 top1 门槛（用实测 sim 分布定标，如 ≥0.60），要么在文档与 UI 明示「快通道在当前嵌入模型下不可达」并去掉该分支的维护负担 | Archi | **P0** | 需产品拍板 |
| 3 | 修 `judge` 判据：改**多信号**（如关键词命中 ∪ 指针小节被 read ∪ 主题词模糊匹配），勿依赖逐字复现 | Tessa | P1 | 本周 |
| 4 | 补三类单测：① layer 过滤（**已有 `test-carrier-layers.mjs`，修复后接入 `npm test`**）② 快通道可达性 ③ `judge` 正向路径 | Tessa | P1 | 与 #1/#3 同批 |
| 5 | 审计字段**关联化**：把 `sim`/`topics` 一并写入合规行，使「注入 → 使用」可闭环核验 | Rex | P2 | 本周 |
| 6 | 消除配置双源（投影 vs suite config）；载体缺失改显式告警；`check-carriers` 增 layer 执行校验 | Cody | P2 | 本周 |

---

## ⚠️ 待完善 / 已知局限

- **本次为只读审查，未改任何产品代码**（用户要求「审查」）。P0 两项**尚未修复**。
- **仅 5 个会话样本**（175 步来自 5 个 sid）⇒ 快通道结论在统计上稳健（0/175 且最大仅差 0.016），但 MCL 合规率可能受样本偏差影响。
- **`sim` 分布依赖当前嵌入模型**（bge-m3）：换模型后阈值需重新标定。
- **一处成员结论经主理人修正**：Tessa 称 `judge` 为「死判据」，主理人实证**不完全准确** —— 模型逐字复述时**可**通过（`复刻类项目` 案例判 true）。准确表述是「**不可靠代理**」：自然转述必失败，仅逐字回声能过。报告按修正后口径。
- **一处人数差异**：Rex 计 `always:index=56 行`，主理人按三分文件实测 67 行（口径差）；已取主理人实测值。
- **`shadowCorr=−0.2699`** 语义未在本报告裁断（属打分模型问题，非本链路），沿用前次报告待拍板项。

---

## 📚 数据来源 & 成员产出索引

- **Cody**（Task #12 · 注入链）：载体清单、layer 绕过 🔴、配置双源 🟠、R6 冷降权 ✅。
- **Archi**（Task #13 · 召回链）：快通道双门 0/175 🔴、融合正确性 ✅、环境事实（Ollama/bge-m3）。
- **Tessa**（Task #14 · MCL 合规 / Task #16 · 机械化证伪）：判据不可靠 🟠、nudge 0/5 有效、`state.delete` 重复注入 🟡、测试盲区；**`scripts/test-carrier-layers.mjs`**（行为级证伪缺陷 1，4 PASS / 5 FAIL，退出码 1）。
- **Rex**（Task #15 · 端到端量化）：注入量 13457 字符、利用率 66%、**闭环集合互斥**、召回零悬空。
- **主理人独立复核**：`readCarrier` 全文精读、`.inject` 全仓 grep（唯一命中 `panel.ts:282`）、注册表 18 标签 dump、`judge` node 实证、四档横幅字符直算、`mcl-audit` 全量重算。
- **数据**：`~/.dsh/suite/knowledge/audit/{mcl-audit,activation-shadow,selfcheck-latest}.jsonl|json`；live bank `~/.dsh/skills/managing-memory/`。
- **代码**：`src/panel.ts`、`src/mcl.ts`、`src/vec.ts`、`src/scheduler.ts`、`skill/engine/criteria.json`、`scripts/check-carriers.mjs`。

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
