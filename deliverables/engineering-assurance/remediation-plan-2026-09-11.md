# shoucang 注入/召回链缺陷修复方案（Remediation Plan）

**日期**：2026-09-11
**工作流**：工作流 1（综合评估）→ 修复方案整合（用户指令「整理完善方案」）
**参与成员**：Cody（代码审查师）/ Archi（系统架构师）/ Rex（SRE 工程师）/ Tessa（测试专家）
**主理人**：甄宇航（Zhen）· 工程督导

---

## 📌 TL;DR（执行摘要）

- 对上轮审计（`inject-recall-chain-2026-09-11.md`）的三项缺陷做了**修复方案整合**，并对每项做了「刻意设计 vs 真缺陷」的反向论证。**三项缺陷全部维持原严重度**，且缺陷 1 的范围**比原判更大**（从 1 处入口扩为 **3 处**入口）。
- **新增关键结论 ①**：缺陷 1 不只是「实现漏了过滤」，而是**机检门自身构成假绿** —— `scripts/check-carriers.mjs:30-32` 只校验「注册表自己声明了 P⇒always / R/E⇒gated」，**从不校验运行期是否遵守**。因此门持续报 PASS，而实际行为与声明相反。
- **新增关键结论 ②**：**`npm test` 无 `pretest` 构建前置，而链内 6 个测试脚本全部 import `lib/`** → `npm test` 会**静默测旧编译产物**（绿 ≠ 当前源码健康）。这是整条测试链的真空，**建议最先修复**。
- **新增关键结论 ③**：测试台账**两份且零交集**（`check-runner.CHECKS` 6 件 vs `npm test` 6 件，无一重叠）→ 新检测件无处登记（`test-carrier-layers.mjs` 正因此两个清单都不含）。
- 严重度分布：🔴严重 **2** 项（缺陷 1 载体层契约未执行 / 缺陷 2 快通道结构性不可达）· 🟠高 **1** 项（缺陷 3 judge 谓词过苛）· 🟡中 **4** 项（假绿机检门 / 构建真空 / 可测性缺口 / banner 单行无上限）。
- 量化冲击：修复缺陷 1 后，`MEMORY.md` 的 **48 行 gated 索引整块退出常驻注入面**（三文件共 67 行索引中 **51 行 = 76.1%** 属 gated）。实测 banner 尺寸 smart 档 **2495 → 1705 字符（−31.7%）**。已独立验证 **45/48（93.8%）** 的 gated 行仍可经真实 recall 路径捞回 → 信息不丢失。
- **阻塞/非阻塞**：**两项 P0 需用户拍板后才能动手**（缺陷 2 的方向选择：阈值重校准 vs 明示弃用）；其余可即刻执行。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟡 **有条件通过**（方案完备，但 2 项 P0 待用户决策方向） |
| 阻塞项数量 | **2**（P0-2 缺陷 2 方向选择；P0-4 依赖该方向确认收敛范围） |
| 关键行动项 | **12** 条（P0 4 / P1 5 / P2 3） |
| 建议下一步 | ① 修 `pretest` 构建真空（零风险、最优先）→ ② 用户就缺陷 2 拍板 → ③ 执行 P0-4（三入口收敛 + A4 改写 + A5 新增 + 进链，同一 commit） |
| 最大风险 | 修复后常驻知识指针减少，短期 agent 可能"看似变笨"（靠 recall 兜底，已验 93.8% 可捞回） |

---

## 🔍 审查发现（按严重度排序）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议修复 | 来源 |
|---|--------|------|------|---------|---------|------|
| 1 | 🔴严重 | 正确性/契约 | `src/panel.ts:288`<br>`src/targets.ts:279-302`<br>`src/vec.ts:215-235` | **载体 P/R/E 层契约声明未执行**：`inject:gated` 行无差别进入 always 注入面。三处入口均无 layer 过滤，其中 ②③ 为逐字重复实现 | 收敛为 targets.ts 单一实现：`scanIndexRows(root, files, layer)`，三处共用 | Cody + Archi |
| 2 | 🔴严重 | 正确性 | `src/mcl.ts:212-213` | **快通道结构性不可达**：双门 `sim>=0.65 ∧ hasHighConf`，实测 193 轮 fast=0、sim max 0.634、双门同时满足 **0 行** | 二选一：阈值重校准 **或** 明示弃用该路径 | Cody + Archi |
| 3 | 🟠高 | 正确性 | `src/mcl.ts:147-150` | **judge 谓词过苛**：要求逐字复现主题前 6 字。159 条判据全 false，5 次再引导 0 次生效 | 改多信号判据（主题词 OR §小节 OR 指针） | Cody + Tessa |
| 4 | 🟡中 | 假绿/机检 | `scripts/check-carriers.mjs:30-32` | 机检门只验「注册表自洽」，**不验运行期是否遵守层语义** → 缺陷 1 长期亮绿灯 | 新增「层被执行」断言（见下） | Archi |
| 5 | 🟡中 | 假绿/CI | `package.json:33` | **`npm test` 无 `pretest` 构建前置**，而 6 个测试脚本全部 import `lib/` → **静默测旧产物**（`npm test` 绿 ≠ 当前源码健康） | 加 `pretest: npm run build:host` | Archi |
| 6 | 🟡中 | 可测性 | `src/mcl.ts:100-105/131-145/147-150` | `topicOf`/`material`/`judge` 均模块私有 const，未导出 → 无法单测 | 抽为独立纯函数模块或导出（最小改动） | Tessa + Cody |
| 7 | 🟡中 | 健壮性 | `src/panel.ts:375-377` | banner 路径**单行无长度上限**（MCL 路径有 `.slice(0,200)`，banner 无）→ gated 行灌入时单条巨行可撑爆 banner | 复用 MCL 的 200 字符行截断 | Cody + Tessa |

> **注**：候选发现「`budgetChars=3000` 声明未执行」经核实为**刻意设计，非缺陷**——`src/panel.ts:387-388` 有明确注释「2026-09-10 用户拍板：去掉总预算裁切」。实测各档 banner（修复前 low 1007 / medium 1406 / high 2199 / smart 2495）均未越 3000，暂无需处理。已列入「待完善」的登记同步项。

---

## 🔍 附带发现：`npm test` 无构建前置（Archi，独立 P1）

**实测证据**（主理人复核确认）：

| 项 | 值 |
|---|---|
| `package.json#scripts.pretest` | **(无)** |
| `package.json#scripts.test` | `check-runner && skill/scripts/test.mjs && test-forgetops && test-treeops-split && test-mcl && test-deepsleep-verdict && check-hardcode` |
| `package.json#scripts.build:host` | `tsc -p tsconfig.local.json` |
| import `lib/` 的测试脚本 | `test-mcl`(lib/mcl.js) / `test-forgetops`(lib/treeops.js) / `test-treeops-split`(lib/treeops.js) / `test-deepsleep-verdict`(lib/distill.js) / **`test-layering`(lib/criteria.js)** / `test-carrier-layers`(lib/panel.js) |

**问题**：`npm test` **没有任何构建前置**，而链内 6 个测试脚本**全部**驱动 `lib/` 编译产物（连 `check-runner` CHECKS 中的 `test-layering.mjs` 也读 `lib/criteria.js`）。→ **若 `src/` 改了但 `lib/` 未重建，`npm test` 会静默地全绿测旧产物**。这不是"为某个脚本加前置"，而是**整条测试链的真空**。

**影响**：本次审计的所有"实测"结论都已单独跑 `build` 或用源码直读规避，故不受污染；但**日常开发与 CI 会因此失去意义**（改完源码跑测试全绿，其实测的是旧编译产物）。

**建议**：加 `"pretest": "npm run build:host"`，**单列为一个提交，勿混进缺陷 1 修复**（否则回滚缺陷 1 会连带回滚该修复）。

---

## 🏗️ 缺陷 1：三入口收敛方案（架构决策）

### 契约证据链（Archi 反向论证：确认是真缺陷，非刻意设计）

Archi 找到了**决定性书面证据**，回答了我提出的「是否误判」质疑：

| 出处 | 原文 | 推论 |
|------|------|------|
| `skill/memory-whitelist-spec.md:34` | P 层「**always-on**（先占预算，**不参与相关性竞争**）」 | 若 always:index 注入全部，gated 行也"先占预算"→ 直接矛盾 |
| `skill/memory-whitelist-spec.md:38` | **「P 必 always；R/E 必 gated 或 none」**（机检强制） | 契约把「抢预算」明列为**必须防止**之事 |
| `skill/memory-whitelist-spec.md:39` | **读取面义务**：每种 injectable 组合都必须有渲染器 | 「声明→渲染器」是**一等义务**，非排序提示 |
| `criteria.json#carriers.note` | 「P 层 always（恒常、**不参与相关性竞争**）；R/E 层 gated（**按任务型/相关性调用**）」 | 唯一事实源：gated = **按任务/相关性调用**（=准入），非排序权重 |

**决定性反证**：`panel.ts:288`（idx）与 `panel.ts:346`（recallIndex）**喂的是同一个注入面**。若层只关乎排序，则 P 层行应**恒常在场**；但实测真实输出中 **P 层行并非常常在场**（受 cap 截断），而 **gated 行恒常在场**（无过滤）→ **语义被装反了**。这是结论性证据。

→ **判定：真缺陷。** 修复项同时具备「契约明确性」与「代码偏离实证」。

### 三处入口（主理人逐处核实）

| # | 位置 | 代码特征 | 危害 |
|---|------|---------|------|
| ① | `src/panel.ts:288` | `const idx = all.filter((l) => /^\[.+\]/.test(l))` | banner 索引面直灌 gated |
| ② | `src/targets.ts:279-302` | `if (!tagM || !/→\s*notes\//.test(line)) continue` | `panel.ts:346` 调它填知识索引面；`vec.recallRanked:212` 也调它 |
| ③ | `src/vec.ts:215-235` | **逐字复制** ② 的扫描逻辑（同 regex、同无 layer 过滤） | 向量路径零命中兜底时把全量索引行灌入向量池 |

**②③ 构成重复实现** → 同时违反 AGENTS.md「单一实现 / 防漂移」条款（该条款要求 `sectionKeyOf`/`dedupeBySection` 只有一份实现）。

### 推荐方案（Archi + Cody 交叉核实后的命名定稿）

```ts
// src/targets.ts —— 新增单一实现（注册表驱动，零硬编码标签名）
import { CARRIERS } from './criteria.generated.js'

type Inject = 'always' | 'gated'
const _tags = (CARRIERS as { tags?: Record<string, { inject?: string }> }).tags || {}

/** 单标签判定（**内部 helper，暂不导出** —— 导出会给"第二份过滤实现"留口子；
 *  不导出则强制所有调用方走集合/行级接口，单一实现才真正落地。Cody 建议、Archi 认同） */
function injectOfTag(tag: string, fb: Inject = 'always'): Inject {
  const t = _tags[tag]?.inject
  if (t === 'always' || t === 'gated') return t
  return fb
}

/** 某层标签集合（`panel.ts#readCarrier` 用；替代原先的 alwaysProfileTags 手写集合） */
export function indexCarrierSet(inject: Inject): Set<string> {
  return new Set(Object.entries(_tags).filter(([, c]) => c.inject === inject).map(([t]) => t))
}

/** 行级准入（`recallIndex` / `vec` 扫描用 —— **全仓唯一逐行准入点**） */
export function indexRowInLayer(line: string, inject: Inject): boolean {
  const m = line.match(/^\[([^\] ]+)\]/)
  return !!m && injectOfTag(m[1], inject) === inject
}
```

> **符号命名已三方定稿**：`injectOfTag`（内部）/ `indexCarrierSet` / `indexRowInLayer`。A4 改写、A5 新断言、机检 ⑥ 正则**共用同一组符号**，避免指向分歧。`scanIndexRows` 为扫描实现（`indexRowInLayer` 供其逐行调用）。

三个调用点的改法：

| 调用点 | 改法 |
|--------|------|
| `src/panel.ts:288` | 索引分支改为逐行 `indexRowInLayer(l, 'always')` 过滤；**并删除** `alwaysProfileTags`（L280-284），profile 分支改用 `indexCarrierSet('always')` → 全仓「标签→层」判定**只剩 targets.ts 一份** |
| `src/targets.ts#recallIndex` | 行扫描收敛为 `scanIndexRows(root, files)`（不带层参数 → 保留 gated 候选池语义），保留其后的 token 打分与 `TAG_WEIGHT` |
| `src/vec.ts:215-235` | 删除重复扫描，改调 `scanIndexRows(root, files)` —— **顺手消掉既存重复实现** |

> **`alwaysProfileTags` 一并收敛**：Archi 建议收敛（否则"单一实现"只做一半，panel 内仍有 2 处层判定），代价约 +8 行。**主理人采纳。**

> **`TAG_WEIGHT`（`src/targets.ts:246`）当前未导出**：若切分为「`scanIndexRows` 只做扫描+层过滤，打分留在 `recallIndex`」，则 `TAG_WEIGHT` 保持 targets.ts 私有即可，**无需导出**（更干净的切分）。Cody 已提醒，实现时确认。

### 机检 ⑥：防漂移断言（`check-carriers.mjs` 新增）

现有门只验「注册表自洽」（`:30-32` 检查声明层与 inject 一致），**不验运行期是否遵守**。新增：

```
⑥ 断言：逐行准入判定全仓唯一 —— indexRowInLayer / indexCarrierSet 的定义只出现在 src/targets.ts；
   且 panel / vec / recallIndex 均经它们取得索引行，不得再出现裸过滤 `all.filter((l) => /^\[.+\]/`
   （防第四份拷贝）
```

> **⚠️ 接入前提**：`check-carriers` 当前**不在 `npm test` 链内**（仅被 `check-runner` 调用）。若不显式接入 `npm test`，⑥ 将成为**死代码**。（见「测试台账双源」节）

### 验收判据（可机检，三方对齐终版）

- **A1（正例）**：fixture 库中 P 层索引行（如 `[原则] … → notes/x.md`）**必须**出现在 banner。修复后自然转 PASS。
- **A2（反例，核心）**：fixture 库中 gated 行（`[env]/[flow]/[tool]/[lesson]/[路径]/[经验]`）**必须不出现**在 banner。修复后自然转 PASS（证伪→证明）。
- **A3（量级）**：banner 注入行数 **< 库内索引行总数**（防"全量注入"复辟）。修复后自然转 PASS。
- **A4（源码正则，⚠️ 必须改写）**：现有实现断言的是**有缺陷的源码字面量存在**：
  > ```js
  > const idxFilterLine = (src.match(/const idx = all\.filter\(\(l\) => \/\^\\\[\.\+\\\]\/\.test\(l\)\)/) || [])[0] || ''
  > ok(!!idxFilterLine, `A4 源码 static 佐证：…`)
  > ```
  > 修复后该行消失 → `idxFilterLine=''` → **A4 反而 FAIL（假红）**。
  > **改写为**：断言 `panel.ts` **含**新准入调用（`indexCarrierSet('always')`）**且不含**裸过滤 `all.filter((l) => /^\[.+\]/`。
- **A4b（源码正则，✅ 保持 PASS 不变）**：断言 `readCarrier` 不读库侧 `notes/INDEX.md`。新实现读的是**编译期注册表 `CARRIERS`**，依然不读库侧 INDEX.md → **无须改写**。
  > 注：Cody 首轮曾建议 A4/A4b 一起改写，**第二轮自行更正为过度归并**——实际只有 A4 需动。方案以终版为准。
- **A5（行为级，新增，关键）**：**零词法命中 + 向量路径不得泄露 gated**。这是 `src/vec.ts:215-235` 那道门是否真修好的**唯一证明**（A1–A4 都覆盖不到它）。
- **A6（机检门）**：`check-carriers.mjs` 新增「层被执行」断言（静态，见下）后，**旧代码下 FAIL、新代码下 PASS**。

### 判据完备性自检（附带条件）

对每一项验收判据先问：**「这个断言在修复后真的会变绿吗？」** 现有脚本已踩中两次相反方向的坑：
- **假绿**：`test-mcl.mjs:64` 用伪造阈值 `familiarThreshold:0` 制造快通道通过；
- **假红**：A4 断言缺陷源码存在。

→ 凡断言"**缺陷存在 / 缺陷行为发生**"的用例（A3、A4、`test-mcl` 场景 B），修复后都必须**反转断言方向**；凡断言"**不读某文件**"这类否定式用例（A4b）则通常无需改动。两类必须分别处置，不可一刀切。

### 守卫点分工（明确归属，避免指向分歧）

| 断言 | 守的门 | 类型 |
|------|--------|------|
| A1 / A2 / A3 | `src/panel.ts#readCarrier` 行为 | 行为级 |
| A4 / A4b | 静态接线（源码正则） | 静态 |
| **A5** | **`src/vec.ts:215-235` 向量路径那道最易漏的门** | 行为级 |
| 机检 ⑥ | 单一实现不漂移（逐行准入点全仓唯一） | 静态 |

### 回归与回滚

- **量化影响（主理人独立复算，含 header 与 `- ` 前缀，与 `src/panel.ts:375-381` 拼装一致）**：

| 档位 | 修复前（全量索引） | 修复后（仅 always） | 变化 |
|------|------|------|------|
| low | 1007 | 882 | −12.4% |
| medium | 1406 | 1166 | −17.1% |
| high | 2199 | 1705 | −22.5% |
| smart | 2495 | 1705 | **−31.7%** |

- **`MEMORY.md` 的 always 层索引行 = 0 行**（48 行全 gated）→ 修复后 `知识索引（MEMORY.md，热取前 N 条）：` **整块消失**，只余 AGENT(8 always idx + 6 profile) 与 USER(8 always idx + 8 profile)。
- **信息未丢失验证（已独立跑通）**：驱动 `lib/targets.js` 真实 `recallIndex`，以「该行主题词 + §小节名」为 query → **48 行 gated 中 45 行（93.8%）可捞回**；3 行未命中系探测 query 构造粗糙（如 `"MCP MCP"` 重复词）所致，非遗失。
- **回滚开关**：本项为代码级改动，无热开关。回滚方式 = `git revert` 该提交 + `npm run build` + fiber 热重载。**建议先只上本项**观察再上 P0-2（见发布顺序）。

---

## 🏗️ 缺陷 2：快通道方向选择（需用户拍板）

### 事实（无可争议）

| 指标 | 实测值 |
|------|--------|
| 总步数 | 193（另 mcl-skip 30 / mcl-ready 13） |
| 通道分布 | **slow=193, fast=0** |
| sim 最大值 | **0.634** |
| sim ≥ 0.65（阈值） | **0 行** |
| `hasHighConf`（top-k 内含 `[路径]`/`[原则]`） | 10/193（下界；代码 `src/mcl.ts:212` 判 top-k 任一行，非仅 top-1） |
| **双门同时满足** | **0 行** |

> `hasHighConf` 语义更正：`src/mcl.ts:212` 实为 `r.rows.some((x) => /^\[(路径|原则)\]/.test(...))`。其真实命中数**只会高于** 10 → 进一步证明 **`sim >= 0.65` 才是唯一绑定约束**。

### 两条路线（用户需选其一）

**路线 A：阈值重校准**
- 依据：`bge-m3` 在中文短指令上的相似度分布整体偏低（实测 max 0.634、mean 0.5658），0.65 阈值在该模型上不可达。
- 做法：经 panel `/set mclFamiliarThreshold <v>` 热调（**已完整接入，无需重启**，范围 [0,1]）；建议先取分位数（如 p90 ≈ 0.62）做影子观察。
- 代价：需影子期证据；调低会放宽准入，可能让"半熟悉"任务误走快通道（零注入）。

**路线 B：明示弃用快通道**
- 依据：若产品上不认可"零注入快通道"（怕 agent 丢上下文），则快通道本就是冗余设计。
- 做法：把 `src/mcl.ts:213` 改为恒 false 并删双门逻辑；注册表 `surface.mcl.familiarThreshold` 标注为 deprecated；`test-mcl.mjs` 场景 B 移除。
- 代价：丧失"熟悉任务免打扰"能力；**无热回滚开关**（需 revert 代码）。

> **主理人建议**：先走 **路线 A + 影子观察**（零代码风险、可热回滚），收集 p90/p95 后再决定是否固化为新阈值或转入路线 B。

### 验收判据

- **正例**：构造 `sim >= 新阈值` 且 top-k 含 `[路径]`/`[原则]` 的 fixture → 断言 `channel === 'fast'` 且 `injected === 0`。
- **反例 a**：仅满足 sim（无高置信命中）→ 断言 `channel === 'slow'`。
- **反例 b**：仅满足高置信命中（sim 低）→ 断言 `channel === 'slow'`。
- **必须使用生产默认阈值跑一遍**，不得只用伪造阈值（见下方 Tessa 发现的既有假绿）。

---

## 🏗️ 缺陷 3：judge 谓词改造

**现状**（`src/mcl.ts:147-150`）：
```ts
const judge = (text: string, topics: string[]): boolean => {
  if (!text || !topics.length) return false
  return topics.some((t) => t.length >= 2 && text.includes(t.slice(0, 6)))
}
```
要求 agent 输出**逐字复现**主题词前 6 字；实测 159 条判据**全 false**、5 次再引导**全部无效** → 慢通道 compliance 反馈闭环实质失效。

**建议改造**：多信号判据 —— 主题词前缀命中 **OR** 该行的 `§小节名` 命中 **OR** 指针路径命中；并保留"长度≥2"守卫。同时**必须与缺陷 2 联动**：这 159 条待判轮次 sim 全在 0.545–0.624，本就在慢通道，故缺陷 3 独立于缺陷 2 修复即可见效。

**验收判据**：
- **正例**：构造 agent 真实输出（含改写表述但引用同一 `§小节`）→ 断言 `compliant === true`（当前会 false）。
- **反例**：agent 输出完全未提及任务主题 → 断言 `compliant === false`（防放松过度变成"永远通过"的假绿）。
- **回归**：修复后重跑历史 159 条样本，`compliant:false` 比例应**显著下降但非归零**（若归零说明判据被放松到失去区分力）。

---

## 🧪 测试覆盖评估（Tessa）

### 既有测试资产状态

| 资产 | 状态 | 问题 |
|------|------|------|
| `scripts/test-carrier-layers.mjs`（新增未提交） | **4 PASS / 5 FAIL，退出码 1** | 「证伪成功」——缺陷未修时**理应失败**。**当前绝不可接入 `npm test`**（会污染 CI 基线，使后续所有失败无法归因） |
| `scripts/test-mcl.mjs` | **含 2 处假绿** | 见下 |
| `scripts/test-deepsleep-verdict.mjs` | 15 PASS | 正常 |
| `scripts/check-carriers.mjs` | **假绿（核心）** | 见「审查发现 #4」 |

### Tessa 发现的两处既有假绿（主理人已复核确认）

1. **`test-mcl.mjs:64` 用伪造阈值制造快通道通过**：
   ```js
   registerMcl(ctx, { ...baseCfg, familiarThreshold: 0 }, ...)   // 场景 B：阈值 0
   ```
   注释自陈"阈值 0"→ 只证明「**低阈值可达**」，**不证明「生产默认 0.65 可达」**。→ 若缺陷 2 只按此用例验收，修完**仍可能是假绿**。**必须新增默认阈值下的用例。**
2. **场景 B 的静默跳过分支**：`else { console.log('⚠️ B1/B2 跳过：…') }` —— 条件不成立时**不报 fail 而跳过**，属第二处假绿（跳过 ≠ 证伪）。

### 接入条件（`test-carrier-layers.mjs` → `npm test`）

必须**全部满足**才可接入：
1. 缺陷 1 的 P0-1 修复已落地，`check-carriers.mjs` 新增的「层被执行」断言同时转 PASS；
2. A1–A5 断言在修复后**全部 PASS 且退出码 0**；
3. 必须保留一条**「断言失败时必须非零退出」的自证**（防止脚本自身被改成恒 0 —— 即「测试的测试」）；
4. `check-runner.mjs` 的退出码契约（ADR-132：`0=pass · 3=skip · 其他=fail`）下，不得用 `3` 掩盖真实失败。

### 新增测试类清单

| 类 | fixture 形态 | 断言点 |
|---|-------------|--------|
| 层过滤 | fixture 库含 P 层 + gated 层索引行各若干 | P 必现 / gated 必不现 / 行数 < 总数 |
| 快通道可达性 | 构造 sim≥阈值 且 top-k 含 `[原则]` 的向量桩；再做只满足其一的变体 | fast: injected=0；两反例: slow |
| judge 正路径 | agent 真实输出文本（含改写引用） | compliant=true；全不相关时=false |
| 召回不丢失 | 48 行 gated 逐行以其主题词+§为 query | 走真实 `recallRanked` 命中率达标（≥93.8% 基线） |

### ⚠️ 测试台账双源问题（主理人独立核实，新增发现）

主理人逐件比对后发现：**测试台账存在两份、且互不覆盖**，属与载体层同源的「单一实现 / 防漂移」问题：

| 台账 | 内容 | 件数 |
|------|------|------|
| `scripts/check-runner.mjs` 的 `CHECKS` | check-criteria / check-carriers / check-field-usage / **test-layering** / check-deploy-sync / check-changelog | 6 |
| `package.json:33` 的 `npm test` 链 | **check-runner** + skill/scripts/test.mjs / test-forgetops / test-treeops-split / test-mcl / test-deepsleep-verdict / **check-hardcode** | 7 |

实测逐件归属（`runner` / `npm-test` 两列）：

| 脚本 | check-runner | npm test |
|------|:---:|:---:|
| check-carriers / check-changelog / check-criteria / check-deploy-sync / check-field-usage / test-layering | ✅ | — |
| check-hardcode / test-deepsleep-verdict / test-forgetops / test-mcl / test-treeops-split | — | ✅ |
| **`test-carrier-layers.mjs`（本次新增）** | ❌ | ❌ |

→ **结论**：两份台账**零交集**（6+6，无一重叠），靠 `npm test` 用 `&&` 串起 `check-runner` 才间接覆盖全部。这意味着**任一新增检测件都无处登记**（`test-carrier-layers.mjs` 正是如此：两个清单都不含它）。**这是 Cody 所指「测试链缺口」的实证。** 建议把测试台账收敛为**单一来源**（例如 `check-runner.mjs` 的 `CHECKS` 为唯一清单，`npm test` 只调 `check-runner`），否则未来仍会漏登记。

另注：`test-carrier-layers.mjs` 驱动 `lib/panel.js`（与 test-mcl/test-layering 等 5 个脚本同惯例），因此**接入时无须额外引入依赖**。

### 可测性改造（最小方案）

建议将 `topicOf` / `material` / `judge` 三个纯逻辑函数抽到新模块 **`src/mcl-pure.ts`**（无副作用、无 DSH 依赖），`src/mcl.ts` 改为 import 使用。理由：
- 不违反单一实现约定（仍是**唯一一份**，只是位置外移）；
- 可直接被 `scripts/test-mcl-pure.mjs` 以 ESM import 单测（不需伪造 ctx）；
- 符合仓内既有惯例（纯逻辑与宿主粘合分层）。

---

## 🚀 运维方案（Rex）：发布顺序 / 回滚 / Go-No-Go

### 分阶段发布顺序

| 阶段 | 内容 | 可先行？ | 理由 |
|------|------|---------|------|
| **S0** | 加 `pretest: npm run build:host` + 测试台账收敛（**独立提交**） | ✅ **最优先** | 消除「测旧产物」真空与「无处登记」缺口；零行为风险。**必须最先做**，否则后续所有测试结论不可信 |
| **S1** | 新增 `check-carriers` 层执行断言 + **显式接入 `npm test`**（否则 ⑥ = 死代码） | ✅ 可先上 | 先把假绿门转红，暴露真实状态；零行为风险 |
| **S2** | P0-1 三入口收敛（缺陷 1）+ A4 改写 + A5 新增 + `test-carrier-layers` 接入 —— **同一 commit** | ✅ 建议**单独**上 | 行为可见（banner 变化），需独立观察窗口归因。**三者同 commit 缺一即 `npm test` 永久红** |
| **S3** | 缺陷 3 judge 改造 | ✅ 可与 S4 同批 | 影响面仅慢通道 compliance 标记 |
| **S4** | 缺陷 2 阈值重校准（路线 A） | ⚠️ 依赖用户拍板 | 阈值可热调，先影子观察再固化 |
| **S5** | 缺陷 2 明示弃用（路线 B，若选） | ❌ 须与 S2 同批评估 | 无热回滚开关，回滚成本最高 |

> **S2 的 commit 内聚约束（Archi 提出，已核实）**：修代码 → 改 A4 → 新增 A5 → 接入测试链，**必须在同一 commit**。若只改代码不改进测试链，`test-carrier-layers` 不会在 `npm test` 中运行（当前不在链内）→ 缺陷可能在 CI 视线外复发；若只改 A4 不进链，则 A4 是孤儿断言。

### 修订后的测试链（Archi 提出，三方对齐）

```
pretest: npm run build:host                                     ← S0 独立提交
test:  check-runner && check:carriers && skill/scripts/test.mjs
    && test-forgetops && test-treeops-split && test-mcl
    && test-carrier-layers && test-deepsleep-verdict && check-hardcode .
```

- **`check:carriers` 新接入**（否则机检 ⑥ 准入断言 = 死代码）
- **`test-carrier-layers` 新接入**（A1–A3/A5 PASS；A4 已改写）
- **台账收敛**：建议把测试清单收敛为**单一来源**（`check-runner.mjs` 的 `CHECKS` 为唯一清单，`npm test` 只调 `check-runner`），否则未来仍会漏登记（`test-carrier-layers.mjs` 就是实例）。

### 回滚开关

| 修复项 | 热回滚 | 方式 |
|--------|--------|------|
| S2 缺陷 1 | ❌ 无 | `git revert` + `npm run build` + fiber 热重载 |
| S3 缺陷 3 | ❌ 无 | 同上 |
| S4 缺陷 2（路线 A） | ✅ **有** | `panel /set mclFamiliarThreshold <原值>` → 落 `~/.dsh/suite/scheduler.json`；`injectCache` 在同处被 `at = 0` 作废（`src/panel.ts:762`），**立即对下一轮生效** |
| S5 缺陷 2（路线 B） | ❌ 无 | `git revert` |

> 已核实：`mclFamiliarThreshold`(0-1) / `mclMaxNudges`(0-3) / `mclBudgetChars`(120-4000) / `mclTopK`(1-5) **均已完整接入 `/set`**（`src/panel.ts:685-686, 713, 745-746` 的 allowed/RANGE/SCHED_KEY 三处齐备）→ **阈值可热调，无需重启**。

### 发布前检查清单

```bash
# 仓根下执行
npm run typecheck                      # 类型检查零错误
npm run build                          # 构建（lib/ 同步）—— 关键：S0 加入 pretest 前必须手动跑
node scripts/check-hardcode.mjs .      # 零硬编码本机路径红线
node scripts/check-carriers.mjs        # 载体契约（含新增 ⑥ 层执行断言）
node scripts/check-deploy-sync.mjs     # 部署面双源一致性（仓 scripts/ + skill/scripts/ vs 库内）
node scripts/test-carrier-layers.mjs   # 新验收 A1–A5（须全 PASS，exit 0）
npm test                               # 全链（S0/S1/S2 落地后应 exit 0）
# 核验 lib/ 与 ~/.dsh/profiles/web/node_modules/dsh-shoucang-memory 的 sha1 一致
```

### Go/No-Go 判定

| 检查项 | 数据源 | 通过标准 |
|--------|-------|---------|
| 构建真空已消除 | `package.json#scripts.pretest` | 存在且指向 `build:host` |
| 类型/构建 | `npm run typecheck && npm run build` | 零错误 |
| 硬编码红线 | `check-hardcode.mjs` | exit 0 |
| 载体层执行 | `check-carriers.mjs`（新 ⑥ 断言） | PASS **且已在 `npm test` 链内** |
| 部署同步 | `check-deploy-sync.mjs` | same（或诚实 skip 3） |
| 新测试 | `test-carrier-layers.mjs` | A1–A3/A5 PASS、A4 已改写，exit 0 |
| 信息不丢失 | 召回不丢失验收 | ≥93.8% 基线 |
| CI 基线干净 | `npm test` | exit 0 |
| CHANGELOG | 仓规第 4 条 | `[Unreleased]` 已记行 |

### ⚠️ 并发改动冲突风险（**真实且紧迫**）

`src/panel.ts` 当前存在**并发会话留下的未提交改动**（去掉 `boards` 概念，mtime 17:47），而 **P0-1 的修复正落在该文件**。`git status` 显示 11 项已改（`src/panel.ts` / `lib/panel.js` / `scripts/check-carriers.mjs` / `shoucang.config.example.yaml` / `skill/engine/distill-contract.md` / `skill/memory-whitelist-spec.md` 等）+ 3 项未跟踪（`scripts/test-carrier-layers.mjs` / `deliverables/` / `.workbuddy-ai/`）。

**处置建议**：动手前先确认并发会话是否已结束；在 `499aab7` 之上先提交既存改动作为基线，**避免把无关改动混入缺陷修复提交**（否则 revert 会牵连）。

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 验收标准 |
|---|------|---------|--------|---------|
| 1 | **加 `pretest: npm run build:host`**（独立提交） | Rex + Archi | **P0** | `pretest` 存在；消除「静默测旧产物」真空 |
| 2 | **用户就缺陷 2 拍板**：阈值重校准（推荐，可热回滚）**或** 明示弃用 | 用户 / Rex | **P0** | 方向明确（阻塞 #5 出 diff） |
| 3 | `check-carriers.mjs` 新增 ⑥「层被执行」断言 **并显式接入 `npm test`** | Cody + Archi | **P0** | 旧码 FAIL / 新码 PASS；⑥ 非死代码 |
| 4 | 三入口层过滤收敛为 `targets.ts#indexRowInLayer`/`indexCarrierSet`；删 `alwaysProfileTags` 与 `vec.ts` 重复扫描；**A4 改写 + A5 新增 + 进 `npm test`，同一 commit** | Cody + Archi | **P0** | A1–A3/A5 PASS、A4 已改写，exit 0 |
| 5 | 保全「信息未丢失」：48 行 gated 逐行召回验收 ≥93.8% | Tessa | **P1** | 达标或对未命中行给出「本无检索价值」判定 |
| 6 | 改造 judge 为多信号判据（主题词 OR §小节 OR 指针） | Cody + Tessa | **P1** | 159 条样本 false 率显著下降但**非归零** |
| 7 | 新增 4 个测试类（层过滤 / 快通道可达 / judge 正路径 / 召回不丢失） | Tessa | **P1** | 含正例与反例；**默认 0.65 阈值**用例必含 |
| 8 | 抽 `src/mcl-pure.ts`（导出 `topicOf`/`material`/`judge`） | Cody + Tessa | **P1** | 可单测；不违反单一实现 |
| 9 | 测试台账收敛为单一来源（`check-runner.CHECKS` 唯一清单） | Archi + Tessa | **P1** | 新件无遗漏（现两份台账零交集） |
| 10 | 移除 `test-mcl.mjs` 场景 B 的伪造阈值与静默跳过 | Tessa | **P2** | 改默认阈值 + 失败即 fail |
| 11 | banner 路径加单行 200 字符截断（对齐 MCL `material`） | Cody | **P2** | 与 `src/mcl.ts:139` 一致 |
| 12 | 注册表 `surface.injection.budgetChars` 登记同步（标注「已由用户拍板停用」） | Archi | **P2** | 投影文案与代码决策一致 |

---

## ⚠️ 待完善 / 已知局限

1. **缺陷 2 的方向属产品决策**，非技术可自决 —— 本方案只给依据与代价，不代用户选择。
2. **召回不丢失的 93.8% 是简化实验值**（探测 query 由主题词+§拼接），非 agent 真实提问分布下的实测；正式验收需用真实 query 或更严谨的构造，并对 3 行未命中给出「query 构造问题 vs 本无检索价值」的区分判据。
3. **缺陷 1 修复会显著改变注入面貌**（smart 档 −31.7%，MEMORY 知识索引块整块消失）。若上线后观察到 agent 频繁重复检索，需评估是否应为"任务相关性 top-k"补一条**独立的 gated 按需注入通道**（当前 `panel.ts:346` 的 recallIndex 调用已具雏形，但同样缺层过滤）。
4. **`TAG_WEIGHT` 未导出**：若切分为「扫描与层过滤在 `scanIndexRows`、打分留在 `recallIndex`」，则可保持私有无需导出；最终以实现时的切分为准。
5. **早期睡眠链 P1 未纳入本方案**：`memory_write_gate.mjs:101-108` 的静默回落硬编码 30/40（来自 `sleep-chain-2026-09-11.md`），与本注入/召回链主题不同域，建议单独立项。
6. **既有测试套件可能还有同类假绿未被发现** —— 本次仅抽查了 `test-mcl.mjs` 与 `check-carriers.mjs`，已发现 3 处（2 假绿 + 1 假红）。**假绿是系统性问题**，建议后续做一次「测试有效性专项」。

---

## 🔑 需用户拍板的产品决策（阻塞项）

| # | 决策 | 选项 A（推荐） | 选项 B | 阻塞谁 |
|---|------|---------------|--------|--------|
| **1** | **缺陷 1 修复后活库 `MEMORY.md` 索引注入归零** | **接受**（纯代码修复，靠 recall 兜底，已验 93.8% 可捞回） | 同步做**库侧 P 层提纯**（把有跨环境价值的知识升格为 P 层，使其继续常驻） | Cody 出 diff 的前提 |
| **2** | **缺陷 2 快通道方向** | **阈值重校准**（真实行为变更；`/set mclFamiliarThreshold` 可热调，**有热回滚**） | **明示弃用快通道**（零行为变更的诚实化；**无热回滚**，需 revert） | Cody 出 diff 的前提 |

> 建议：**决策 1 选 A**（信息未丢失已实证）；**决策 2 选 A + 影子观察**（零代码风险）。
> 另需用户确认：是否同意把 `alwaysProfileTags` 一并收敛到 targets.ts 单一实现（Archi 建议同意，panel 多改约 8 行）。

---

## 📚 数据来源 & 成员产出索引

**主理人独立核实的原始数据**：
- 活库 `~/.dsh/skills/managing-memory/{MEMORY,AGENT,USER}.md`：索引行 67（always **16** / gated **51** = **76.1% 泄露**）；profile 行 AGENT 6（tagged 3 / untagged 3）、USER 8（全 untagged）
- `~/.dsh/suite/knowledge/audit/mcl-audit.jsonl`：236 行（mcl-step 193 / mcl-skip 30 / mcl-ready 13）；slow=193、fast=0；sim max **0.634**、mean 0.5658、≥0.65 **0 行**；`hasHighConf` 下界 10；双门同时满足 **0 行**；compliant 字段 159 行**全 false**（sim 0.545–0.624）；注入事件 34 次 / 13,457 字符（单次 260–445）
- `~/.dsh/suite/knowledge/audit/selfcheck-latest.json`（2026-09-11T13:16:47Z）：verdict=ok 但 `closureOk:false`、`flipScoreWeights:true`、`shadowCorr:-0.27084`、`layerCounts P{16,3}/R{2,0}/E{49,11}`
- banner 尺寸复算（与 `src/panel.ts:375-381` 拼装一致）：low 1007→882 / medium 1406→1166 / high 2199→1705 / smart 2495→1705
- 召回不丢失实验（驱动 `lib/targets.js#recallIndex`）：gated 48 行捞回 **45（93.8%）**

**成员产出**：
- **Cody（代码审查师）**：三缺陷精确修复方案 + 候选发现 (a)(b)(c) 定性；**修正 `hasHighConf` 语义**（top-k 任一行非 top-1）；提出**三入口收敛**；**发现 A4 假红陷阱**并更正自身"A4/A4b 一起改写"的过度归并（**A4b 保持 PASS**）；提出 A5；定稿符号命名
- **Archi（系统架构师）**：契约证据链（`memory-whitelist-spec.md:34/38/39` + `criteria.json#carriers.note`）→ 判定真缺陷；推荐路线②完整收敛；**发现 `check-carriers.mjs:30-32` 假绿**；**发现 `npm test` 无 `pretest` 构建真空**（独立 P1）；提出修订测试链与 commit 内聚约束；ADR 载体判定（不写 ADR，用注册表注释 + 规格书 + CHANGELOG）
- **Rex（SRE 工程师）**：分阶段发布顺序（含 S0 构建前置）/ 回滚开关矩阵（含 `/set mclFamiliarThreshold` 热回滚）/ Go-No-Go 检查表 / 并发未提交改动冲突处置
- **Tessa（测试专家）**：验收判据（正反例）/ 接入条件 4 条 / 新增测试类 / `mcl-pure.ts` 可测性改造 / 回归风险矩阵 / **发现 `test-mcl.mjs` 两处既有假绿**（伪造阈值 + 静默跳过）

**主理人独立核实的补充发现**：
- **测试台账双源且零交集**（`check-runner.CHECKS` 6 件 vs `npm test` 6 件，无一重叠）
- `npm test` 无 `pretest` 且 6 个脚本全 import `lib/`（复核确认 Archi 的发现）
- `hasHighConf` 代码真实语义（`src/mcl.ts:212` top-k 任一行）
- `src/vec.ts:215-235` 与 `src/targets.ts:288-296` 行扫描逻辑**逐字重复**（复核确认）
- `TAG_WEIGHT` 未导出（`src/targets.ts:246` 普通 const）

**关联历史报告**：
- `deliverables/engineering-assurance/inject-recall-chain-2026-09-11.md`（本方案的上游审计）
- `deliverables/engineering-assurance/sleep-chain-2026-09-11.md`（睡眠链审计，本方案未覆盖其 P1）

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
