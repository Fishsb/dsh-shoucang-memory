# 修复验收判据与回归测试计划（Tessa · 测试专家 · 任务 #19）

> 独立核实：`test-carrier-layers.mjs` 实跑 = **4 PASS / 5 FAIL，EXIT=1**（证伪态）。
> 活库核实：MEMORY.md 索引 48 行 **P层=0 / gated=48**(env19/flow8/tool7/lesson14)；AGENT.md 索引 11 行(P8/gated3)；USER.md 索引 8 行(P8/gated0)。

---

## 1. 三项缺陷的验收判据（可机检，正例+反例）

### 缺陷1 · 载体层契约未执行（`src/panel.ts:288` readCarrier / `src/targets.ts:279-304` recallIndex）
| 判据 | 正例（必须成立） | 反例（必须不成立） | 修复前→后 |
|---|---|---|---|
| C1-P | fixture 库中 P/always 标签行**必现**于注入面（索引段） | — | PASS→PASS（守卫，防误伤） |
| C1-G | — | gated 标签（`路径/经验/tool/flow/lesson`）行**不得**出现在 banner 索引段 | FAIL→PASS |
| C1-A | 注入 index 行 **⊆** P 层行集合 | `allMemReturned==true`（不问 layer 全量返回） | FAIL→PASS |
| C1-L | `readCarrier`/`recallIndex` 读注册表 `inject` 字段（静态证据：`inject==='always'` 出现在层过滤处） | 关键词 `^\[.+\]` 通配选取（`targets.ts` 零处 `layer`) | 静态 FAIL→PASS |

**双通道一致性**：`recallIndex`（targets.ts）与注入面同源，均须 layer 过滤 —— 否则 gated 行从 banner 退出却经 `recallIndex` 回流，等于没修。

### 缺陷2 · 快通道结构性不可达（`src/mcl.ts:212-213`）
| 判据 | 正例 | 反例 | 前→后 |
|---|---|---|---|
| C2-F | 构造 `sim≥阈值 ∧ top-1∈{[路径],[原则]}` → `channel='fast'`，`injected=0` | 只满足 sim（top-1 非路径/原则）→ **slow** | fast=0→可达 |
| C2-S | 只满足 hasHighConf（sim<阈值）→ **slow** | 双门全不满足 → slow | slow 不变 |

> ⚠️ **独立发现（已由 team-lead 核实确认）**：`test-mcl.mjs:64` 场景 B 以 `registerMcl(ctx, { ...baseCfg, familiarThreshold: 0 }, ...)`（注释自陈"阈值 0"）构造快通道 → **只验了"低阈值可达"，未验"默认 0.65 可达"**。这是既有测试套件里的一处**真·假绿**。新判据必须**在默认 0.65 下**用 fixture（构造高 sim）命中，否则缺陷2 修完仍可能是假绿。
> ⚠️ **第二处假绿（静默跳过）**：场景 B 的 `else { console.log('⚠️ B1/B2 跳过：…') }` —— 条件不成立时**不报 fail 而跳过**。跳过 ≠ 证伪，属"沉默即通过"的假绿模式。验收脚本中凡"条件不成立"分支必须改为**显式 fail 或 exit=3 skip（走 ADR-132 契约）**，禁止 console 静默跳过。
> 需先确认 0.65 是否结构性过高（实测 sim max 0.634 < 0.65）；若确为过高，修复应是"阈值校准 / 双门改单门"，判据须断言**缺省配置下的可达率>0**。

### 缺陷3 · judge 谓词过苛（`src/mcl.ts:147-150`）
| 判据 | 正例 | 反例 | 前→后 |
|---|---|---|---|
| C3-Y | 真实 agent 输出文本**逐字含主题前6字** → `compliant=true` | 空文本/无主题 → false | 保留 |
| C3-E | **语义等价改写**（主题"分裂结构"→输出"拆分树节点"）→ `compliant=true` | 完全无关文本 → false | 全 false→有效 |

> judge 当前 `text.includes(t.slice(0,6))` 要求逐字复现。正例须含**改写等价**用例，否则修复后仍是脆弱谓词。实测 compliant 159 条全 false、5 次再引导 0 生效 —— 判据应断言"再引导后 compliant 转真率>0"。

---

## 2. `test-carrier-layers.mjs` 接入条件（红线：不得污染 CI 基线）

**当前不可接入 `check-runner.mjs` CHECKS 或 `npm test` 链**，危害：
- `check-runner` 契约（ADR-132）`exit=1 ⇒ fail`，会把 5 个**证伪断言**误读为"产品缺陷"并让整链 `&&` 中断；
- 更致命：它常驻 fail 会**拉高"已知失败"基线**，后续任何真实回归被淹没，无法归因（假绿的反面：假红淹没真红）。

**接入前必须满足的断言清单**（全部为"应然"且当前实现下应 PASS）：
1. A1 P/always 必现 ✅（已 PASS，保留）
2. A2 四个 gated 标签**全部不泄漏**（当前 4 FAIL → 须转 PASS）
3. A3 `allMemReturned===false`（当前 FAIL → 须转 PASS）
4. A4/A4b 静态佐证改写为**正向**：源码出现 `inject==='always'` 过滤（当前是"证无过滤"→ 须改为"证有过滤"）
5. **新增 A5**：`recallIndex` 层过滤同步生效（双通道一致）
6. 退出码语义改写：`process.exit(fail?1:0)` 不变，但**文件头"证伪"注释必须改为"应然验收"**，避免维护者误读
7. **零硬编码合规**：✅ 已合规 —— 该文件用 `tmpdir()`/`fileURLToPath`，无盘符；`check-hardcode.mjs` 覆盖 `scripts/*.mjs`（`CODE_EXT` 含 `.mjs`，scripts 不在 `SKIP_DIRS`），实跑无违规。**注意**：不得在此文件写 `~/.dsh` 字面量，须 `join(os.homedir(),'.dsh',...)`；活库取证类断言建议**不并入常驻链**（环境依赖，应走 exit=3 skip 契约）。

> 接入顺序：缺陷修复 → 脚本转全 PASS → 改注释+改 A4 为正向 → 再进 CHECKS。

---

## 3. 新增测试类清单

### ① 层过滤（扩 `test-carrier-layers.mjs`）
- **fixture**：伪库 MEMORY/AGENT/USER.md，混合 P/R/E 标签 + `notes/INDEX.md` 声明 layer。
- **断言**：P 必现 / gated 不泄露 / 集合包含关系 / **两张量**（banner 索引段 vs `recallIndex` 返回集，须一致）。

### ② 快通道可达性（新 `test-mcl-fastpath.mjs`）
- **fixture**：临时库含 `[路径]`/`[原则]` 高置信行；**注入 fake embed**（或 stub `semanticSim`）使 sim 可控。
  - 正例：`sim=0.70 ∧ top-1=[路径]` → fast
  - 反例A：`sim=0.70 ∧ top-1=[经验]` → slow
  - 反例B：`sim=0.50 ∧ top-1=[原则]` → slow
- **断言**：`status().fast≥1`、审计 `channel`、`injected===0`。

### ③ judge 正路径（依赖可测性改造，见 §4）
- **fixture**：① 逐字含主题前6字 ② 语义等价改写 ③ 无关文本 ④ 空。
- **断言**：①②→true，③④→false；再引导→compliant 转真。

---

## 4. 可测性改造方案（最小改动）

`topicOf`/`material`/`judge` 现为 `mcl.ts` 模块私有 const，**无法单测**。建议：

**方案：抽为 `src/mcl-pure.ts` 纯函数模块并 `export`，`mcl.ts` import 复用（不复制）。**
```ts
// src/mcl-pure.ts（新增，唯一实现）
export const topicOf = (line: string): string => { /* 原 L95-98 逻辑 */ }
export const judge = (text: string, topics: string[]): boolean => { /* 原 L147-150 */ }
export const materialText = (rows: RecallRow[], budget: number, contract: string) => { /* 原 L131-145 */ }
```
- **不违反单一实现约定**：AGENTS.md §"架构单一实现约定"禁止的是**副本**；抽取后 `mcl.ts` 只有 `import` 无本地副本，符合"收敛到一份实现"（同 `sectionKeyOf` 抽至 targets 的先例）。
- 替代：仅 `export` 三函数（改动更小），但不便纯函数测试且 `mcl.ts` 仍混 IO 依赖。**推荐 `mcl-pure.ts`**。
- 测试脚本 `import '../lib/mcl-pure.js'`，与 `test-*.mjs` 普遍驱动 `lib/*.js` 的惯例一致（须先 `build:host`）。

---

## 5. 回归风险矩阵（重点：缺陷1 修复后 MEMORY 知识索引块**整块归零**）

**结论（已校正，以 team-lead 复算为准）**：这不是"轻微减少"，而是 **`知识索引（MEMORY.md，热取前 N 条）：` 整块从常驻面完全消失**，MEMORY 48 行 gated 全部转为按需 recall。根因：`MEMORY.md` 的 always 层索引行 = **0 行**（48 行全 gated），故 `src/panel.ts:373-376` 的 `if (memLines.length)` 分支恒假。

| 档位 | 修复前(全量索引) | 修复后(仅 always) | 变化 |
|---|---|---|---|
| low | 1007 | 882 | −12.4% |
| medium | 1406 | 1166 | −17.1% |
| high | 2199 | 1705 | −22.5% |
| smart | 2495 | 1705 | **−31.7%** |

> 独立复算（近似，含 header+`- `前缀，未含 profile/dawn-delta）得 Δ = −9.8% / −15.6% / −27.1% / **−31.6%**，与上表**轨迹一致**；绝对值差异来自 profile/前缀近似。**smart 档跌最狠**（cap=10 取满 10 行 gated 全落空），两方一致。修复后余 AGENT(8 always idx + 6 profile) 与 USER(8 always idx + 8 profile)。

**风险定性**：这是**结构性变化**，不是微调。因此"信息未丢失"验收是**必做项而非可选项**。

### 信息未丢失验收（对比实验 · 已实跑）
**实验**（`test-gated-recall-survival.mjs`）：
1. 取活库 MEMORY.md 的 48 条 gated 行；
2. **严谨 query 构造**：`主题词（tag 后首段，去 · →）+ §小节名`，去重、过滤 <2 字 token；
3. 逐条走**真实 `recallIndex(memRoot, q, 10, 'all')`**，以 `pointer` 或整行精确匹配回原行。

**实跑结果**：**47/48 = 97.9% 捞回**（team-lead 简化版 93.8% 的 3 处 miss 经严谨 query 修正后收敛为 1 处，证实其 miss 多为 query 构造粗糙）。

**通过标准**：词法通道（recallIndex）**≥95%**（实跑 97.9% ✅）；向量通道（recallRanked+embed）**≥95%**；union **≥98%**。

**唯一未命中行的区分判据（团队要求）**：未命中行 = `[tool] MCP · bilibili/禁/hermes → notes/tools.md §MCP`，query 仅 `"MCP"`（单 token 缩写，top3 为空）。区分规则：
- **判为"query 构造问题"**（非丢失）：若该行可用**其完整主题短语或指向子串**捞回（如 `bilibili 工具`、`hermes`），则属探测词过短。
- **判为"该行本就无检索价值"**（可接受丢失）：若该行**任何 ≥2 字 token 组合**都零命中，且其主题为纯缩写/生僻词（无自然语言线索）——此类行即使留在常驻面，agent 也难主动想起，转按需 recall 不构成损失。
- **判为"真丢失"**（须修复）：若某行有自然语言主题却召回不到 → 说明 `recallIndex` 信号不足，**缺陷1 不可单独上线，须与召回质量修复捆绑**。

**降级判据**：union<95% 判为信息丢失 → 保留 gated **新鲜度兜底槽**（复用现有 freshSlots，末尾 N 条 gated 兜底）或对零命中走 `recallApprox` 主题地图；recallIndex<95% 则判"缺陷1 修复须与召回质量捆绑发布"。

---

## 6. 待确认（若与"刻意设计"冲突）
- 缺陷2 的"双门不可达"若经确认是刻意保守（宁慢不快），则不算缺陷，但**须有判据证明慢通道覆盖率足够**；否则应记为"快通道空转=白留状态机复杂度"。
- 缺陷1 的 `readCarrier` 无 layer 过滤，**我认为不是刻意设计**：注册表 `renderers.gated:index` 明写指向 `recallIndex/recallRanked`，而两者均 layer-blind（`targets.ts` 零处 `layer`）—— 声明与执行脱节，属实现缺陷，非设计取舍。
