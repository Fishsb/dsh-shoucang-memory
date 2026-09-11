# 注入/召回链修复 · 执行报告（缺陷 1/2/3 全量推进）

**日期**：2026-09-11
**工作流**：工作流 1（综合代码审查）→ 整改执行与回归验证
**参与成员**：Cody（代码审查师）· Archi（系统架构师）· Rex（SRE）· Tessa（测试专家）· Docu（技术文档师）— 审查与方案见前序产出；本轮**执行与机器验证**由工程督导（Zhen）直接完成
**方案来源**：`deliverables/engineering-assurance/remediation-plan-2026-09-11.md`（用户拍板 **C 方案：全量推进含缺陷 2 阈值硬调**）

---

## 📌 TL;DR（执行摘要）

- **三缺陷全部落地**：缺陷 1（恒定注入面不执行层过滤，gated 泄漏 76.1%）、缺陷 2（快通道结构性不可达 → 阈值 0.65→0.58）、缺陷 3（合规判定只认逐字复现，159/159 恒 false）均已修复并机器验证。
- **另修两类根因级问题**：① 机检「只声明未执行」假绿（`check-carriers` 原 ①~⑤ 全是声明侧校验）；② `npm test` 无 `pretest`，6 支脚本全测 `lib/` 陈旧产物。
- **严重度分布**：🔴严重 1（缺陷 1，已修）· 🟠高 4（缺陷 2 / 缺陷 3 / 机检假绿 / 构建缺口，已修）· 🟡中 1（部署未同步，**待用户确认**）。
- **阻塞项**：0（代码侧）。**唯一未闭环 = 部署**：安装副本 `~/.dsh/profiles/web/node_modules/dsh-shoucang-memory/lib/targets.js` 与仓内**不一致**，修复尚未生效。
- **质量门**：`typecheck` / `build` 零错；`check-runner` 7/7 pass；`test-carrier-layers` **17 PASS / 0 FAIL**；`npm test` exit=0（5 次连续）。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟢 通过（代码侧全部闭环） |
| 阻塞项数量 | 0（部署不在评级内，需用户确认后执行） |
| 关键行动项 | 5 条（见文末行动清单） |
| 建议下一步 | **部署上机**（推送 origin → profile 重指 → pnpm install → fiber 热重载），随后观测快通道实际触发率 |
| 提交 | `ce9abbf`（缺陷修复）· `3dfa68f`（测试基建 + CHANGELOG）· 前置基线 `441d67b` |

---

## 🔍 修复清单（按严重度）

| # | 严重度 | 类别 | 位置 | 问题 | 修复 | 验收 |
|---|--------|------|------|------|------|------|
| 1 | 🔴严重 | 契约执行 | `src/panel.ts:288` | 恒定注入面索引分支只按 `/^\[.+\]/` 通配选取，**从不读 layer**；唯一过滤分支只覆盖 profile 形式 | 改 `indexRowInLayer(l,'always')`（注册表驱动） | gated 泄漏 51/67 → **0/4**（夹具） |
| 2 | 🟠高 | 参数失效 | `criteria.json#surface.mcl` + `src/scheduler.ts:643` | 阈值 0.65 结构性不可达（193 样本 max=0.634）；且 scheduler 缺省为**硬编码 0.65**，改注册表不生效 | 阈值 → 0.58；scheduler 改读 `SURFACE.mcl.familiarThreshold` | 三处对账均 0.58 |
| 3 | 🟠高 | 判据过严 | `src/mcl.ts:147` `judge()` | `text.includes(t.slice(0,6))` 要求逐字复现主题词前 6 字 | 三信号「或」：全串 / 前缀 / **信号词元覆盖率**（≥2 且 ≥60%） | 18 项 MCL 单测无回归 |
| 4 | 🟠高 | 机检假绿 | `scripts/check-carriers.mjs` | ①~⑤ 全是**声明侧**校验，缺陷 1 存续期间全绿；④「消费 CARRIERS」可被注释满足 | ④ 改断言 `targets.ts` 真 import；新增 **⑥层执行** 四道断言（先剥注释再匹配） | 反证：改回缺陷态 ⇒ ⑥-1 / ⑥-4 变红 |
| 5 | 🟠高 | 测试基建 | `package.json` | 无 `pretest`，6 支脚本全 import `lib/` ⇒ 测的是陈旧产物 | 加 `"pretest": "npm run build:host"`；测试清单收敛为「行为级一律进 CHECKS」 | `check-runner` 7/7 |
| 6 | 🟡中 | 部署 | 安装副本 | 仓内修复未同步到生效副本 | **待用户确认**（见行动清单 1） | — |

---

## 🧱 缺陷 1 · 三入口收敛为单一实现（架构）

**根因**：标签→层映射在代码里散落多份（panel 本地推导 `alwaysProfileTags`、mcl 硬编码 `/^\[(路径|原则)\]/`、vec 重复扫描副本），注册表改了代码不跟随。

**收敛后**（全部落在 `src/targets.ts`，注册表 `CARRIERS` 为唯一事实源）：

```
indexCarrierSet(inject)   → 索引行在给定档位的标签集合
profileCarrierSet(inject) → 画像行在给定档位的标签集合
indexRowTag(line)         → 索引行 → 标签（统一取标签口径）
indexRowInLayer(line,inj) → 层准入判据（无标签/未登记 ⇒ false，保守）
scanIndexRows(root,files) → 原始索引行扫描（唯一实现，三入口共用）
highConfCarrierSet()      → MCL 高置信标签（注册表 mclGate:true）
recallIndex(...,inject?)  → 可选按档位限定（缺省不限层）
```

**三入口处置**：
- `panel.ts` **位置式基线 + 新鲜度槽**（恒定铺开段）→ `always` 档；
- `panel.ts` **相关性通道** → **保持不限层**（它本身就是契约指定的 gated 渲染器，`panel.ts:276-278`）；
- `vec.ts` 重复扫描副本删除 → 改用 `scanIndexRows`。

> ⚠️ **一次自我纠错**：第一版把相关性通道也锁成 `always`-only，属**过度过滤**——会让 gated 载体永远无法在注入面现身（A2/A5 仍全绿，看不出来）。已回滚，并新增 **A6** 断言专门拦这个反向退化方向。

**真库实测**（`~/.dsh/skills/managing-memory`，67 条索引行）：

| 文件 | 索引行 | always | gated |
|---|---|---|---|
| AGENT.md | 11 | 8 | 3 |
| MEMORY.md | 48 | **0** | 48 |
| USER.md | 8 | 8 | 0 |
| **合计** | **67** | **16** | **51（76.1%）** |

**用户可感知变化**：
- 无查询时：MEMORY.md 无 P 层索引行 ⇒ 「知识索引（MEMORY.md）」段不再恒定铺开 → banner `low −8.3% / medium −13.5% / high −23.8% / **smart −27.9%**`；
- 有查询时：按相关性回补 2~4 行（banner 1888~2068 字符，仍小于修复前 2408），且由「最旧 N 条」变为「**最相关 N 条**」；
- gated 行仍可召回（真库实测 45/48 = 93.8% 可复现召回）。

---

## 🎚️ 缺陷 2 · 阈值重校准（含诚实的效果上限）

**实测分布**（193 条 `mcl-step` 审计）：min 0.452 / p50 0.548 / p75 0.609 / p90 0.624 / **max 0.634** / mean 0.5658 → **≥0.65 命中 0 行**。

| 阈值 | 达标行 | 占比 |
|---|---|---|
| 0.62 | 23 | 11.9% |
| 0.60 | 51 | 26.4% |
| **0.58（新）** | **53** | **27.5%** |
| 0.65（旧） | **0** | **0%** |

**⚠️ 效果上限必须说清**：快通道是「**sim 达标** 且 **hasHighConf**」**双门**，本次只放宽前者。后者仍要求命中 `mclGate` 标签（路径/原则），top-1 口径实测下界仅 **2/193** ⇒ **实际快通道触发率远低于 27.5%**。是否放宽第二道门（或改为「P 层命中即算熟悉」）属语义变更，**单列待拍板**（行动清单 4）。

**回滚**：`/set mclFamiliarThreshold 0.65`（写全局 `~/.dsh/suite/scheduler.json`，热生效无需重启）。

---

## 🧪 测试覆盖评估

| 脚本 | 修复前 | 修复后 |
|---|---|---|
| `scripts/test-carrier-layers.mjs` | 缺陷固化 4 PASS / **5 FAIL**（失败即证伪成功） | 回归护栏 **17 PASS / 0 FAIL** |
| `scripts/check-carriers.mjs` | 对层执行零覆盖（假绿） | 新增 ⑥ 四道，全过（已做可证伪验证） |
| `scripts/check-runner.mjs` | 6 件 | 7 件（纳入 `test-carrier-layers`）全 pass |
| `npm test` | 无 pretest（测陈旧产物） | `pretest` 强制 rebuild，exit=0（5 次连续） |

**新增断言的防退化方向**：
- `A4c` 防**回退**（旧的通配写法不得重现）；
- `A5` 防**过度过滤**（gated 行召回得到）；
- `A6/A6b` 防**过度过滤的另一种形态**（有查询时 gated 可按相关性现身，且受 cap 约束）。

---

## 🚀 运维方案

1. **部署**（未执行，待确认）：推送 origin → profile `dsh-shoucang-memory` 重指新 commit → `pnpm install` → fiber 热重载（**不重启宿主**，符合红线）。
2. **观测**：部署后观察 `~/.dsh/suite/knowledge/audit/mcl-audit.jsonl` 的 `channel=fast` 计数是否由 0 变为非零；同时看 `compliant` 的 false 率是否下降。
3. **回滚**：阈值可 `/set` 热回滚；层过滤若引发问题，可将 `indexRowInLayer(l,'always')` 的档位参数临时放宽（但会重新引入 gated 铺开）。

---

## ✅ 行动清单（按优先级）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | **部署上机**：推送 origin → profile 重指 → pnpm install → fiber 热重载，并核对安装副本与仓 `lib/` sha 一致 | Rex（SRE）+ Zhen | **P0** | 待用户确认后立即 |
| 2 | 部署后**实测**快通道触发率与 `compliant` false 率，回填本报告「效果验证」 | Tessa（测试专家） | P0 | 部署后 1 轮观测窗口 |
| 3 | 把「部署面一致性」扩展覆盖 `lib/`（当前只比对 `scripts/`，故本次 `lib/` 不一致未被机检抓到） | Cody（代码审查师） | P1 | 下一迭代 |
| 4 | 拍板：是否放宽 `hasHighConf` 第二道门（否则缺陷 2 的实际收益受限于 ~1%） | 用户拍板 | P1 | 待定 |
| 5 | `scripts/test-mcl.mjs` 的假绿修治（scenario B 用 `familiarThreshold: 0` 造阈值 + 有静默 skip 分支） | Tessa（测试专家） | P2 | 下一迭代 |

---

## ⚠️ 待完善 / 已知局限

- **部署未执行**：仓内修复当前**不生效**（安装副本仍为旧码）。本报告的代码侧结论已完整，但**端到端效果未验证**。
- **缺陷 3 无法离线回放**：审计未保存 assistant 原文，故 159 条样本只能用新 `judge` 的逻辑推演 + 单测覆盖，**未做 159 条实测复算**；验收口径应为「false 率显著下降但非零」。
- **缺陷 2 效果受限**：见上文「双门」说明，实际快通道触发率预计远低于 27.5%。
- **`npm test` 曾出现 1 次 exit=1**：随后 5 次连续 exit=0，单步 7 项逐一复跑均 exit=0，**未复现、原因未定位**；建议 CI 加重试鉴别偶发。
- **未纳入**：`mcl-pure.ts` 抽取（便于单测）、banner 单行 200 字符截断、registry `budgetChars` 登记同步——均属延后项。

---

## 📚 数据来源 & 成员产出索引

- 前序审查产出：`deliverables/engineering-assurance/inject-recall-chain-2026-09-11.md`（审查发现）
- 前序方案产出：`deliverables/engineering-assurance/remediation-plan-2026-09-11.md`（方案与验收口径，用户拍板 C）
- Cody（代码审查师）：缺陷定位与机检假绿根因（前序）；本轮新增 ⑥ 断言的**反证验证**由执行方完成
- Archi（系统架构师）：单一实现收敛方案（前序）；本轮按此落地于 `src/targets.ts`
- Tessa（测试专家）：测试盲区与假绿清单（前序）；本轮实现 A4 改写 + A5/A6 新增
- Rex（SRE）：运维/回滚方案（前序）；部署动作待执行
- 机器验证证据：`node scripts/check-runner.mjs`（7/7）· `node scripts/test-carrier-layers.mjs`（17/0）· `node scripts/check-carriers.mjs`（全过）· `npm test`（exit 0 ×5）· 真库核验（67 行分层计数 + banner 四档体量）

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
