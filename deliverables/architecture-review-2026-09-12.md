# shoucang 架构体检报告（2026-09-12）

> 起因：用户问「成熟项目的架构应该是什么样的，当前项目需不需要调整优化」。
> 方法：**实测依赖图**，不靠印象。新建 `scripts/audit-architecture.mjs` 做静态分析（依赖边 / 环 /
> 拓扑分层 / 扇入扇出 / 接口宽度 / 顶层可变全局），并用 `git log` 统计变更热点交叉验证。
> 所有数字均为本次实测，工具可复跑自查。

---

## 一、结论（先说）

**整体健康度：中上，不需要推倒重来，但有三处应当处理。**

| 判定 | 内容 |
|---|---|
| ✅ 骨架是对的 | 零循环依赖、无跨模块共享可变状态、分层清晰、事实源单一 |
| ✅ **P1 一期已完成** | `distill.ts` 3512 → **3149 行**，自身导出 **30 → 8**；深睡判据层抽为 `deepsleep-core.ts`（405 行，L2 层）。全链门禁绿 |
| ✅ **P1 二期已完成** | 剩余深睡状态机迁为 `deepsleep.ts`（1519 行）。`distill` 累计 **3512 → 1750 行（−50%）**，零环保持，全链门禁绿 |
| ✅ P2 已完成 | 架构门禁 `audit-architecture.mjs --gate` 已入 CHECKS，棘轮阈值（详见第五节） |
| 🟠 P3 该补 | 变更热点模块 `panel` / `scheduler` 无直接单测；`targets` / `vec` 同样 |
| 🟡 P4 观察 | `skill/scripts/archive-lib.mjs` 是名实不符的工具袋（25 导出 / 扇入 9） |

**最重要的判断**：这个项目的问题**不是分层画错了**，而是「一个模块里装了两个变化原因」。
按稳定依赖原则检验，骨架是合格的；按「改一个需求动几个模块」检验，深睡相关需求每次都要在
3500 行文件里穿针引线 —— 这才是要修的地方。

---

## 二、实测数据

### 2.1 src/ 依赖分层（15 模块 · 9229 行 · 深度 7）

> 下表为 **P1 一期落地后**的复测值；P1 前的基线见 §4。

```
层级  模块                              行数   扇入 扇出  导出  转发  可变全局
L0    criteria.generated                  568     7    0    14     0       0
L1    targets                             438     5    1    33     0       1
L1    criteria                            196     2    1    19     0       0
L2    treeops                             873     1    0     7     0       1
L2    deepsleep-core                      405     1    2    24     0       0  ← P1 新增
L2    vec                                 302     4    3     6     0       0
L2    activity                            260     1    0     3     0       0
L3    distill                            3149     1    8     8    24       1
L3    mcl                                 335     1    2     4     0       1
L4    scheduler-share                      40     2    0     3     0       0
L4    deepsleep-share                      36     2    0     2     0       0
L4    mcl-share                            19     2    0     2     0       0
L5    panel                              1904     0    5     4     0       0
L5    scheduler                           670     1    7     5     0       0
L6    index                                34     0    1     4     0       0

静态循环依赖: 0        动态边隐藏环: 0
扇入最高: criteria.generated(7), targets(5), vec(4)
规模最大: distill(3149), panel(1904), treeops(873)
```

（L0 = 最底层 = 无人依赖的叶；`index` 在 L6 顶层。复跑：`node scripts/audit-architecture.mjs`）

**「转发」列** = re-export 出去的符号数（`export *` / `export {…} from`）。
`distill` 自身只剩 **8** 个导出，但为保持 API 兼容仍**转发** deepsleep-core 的 24 个符号。
转发同样是**对外承诺**，故计入接口宽度——只数自身导出会让这个指标从 30 假降到 8。
它属**过渡态**，应在 P1 二期逐步消除（见 §4）。

### 2.2 变更热点（`git log --name-only -300`，近 300 次提交）

```
81  src/distill.ts          ← 既是最大模块，又是最高频变更（第二名 1.65 倍）
49  src/panel.ts
36  src/scheduler.ts
14  src/vec.ts
10  src/targets.ts
 6  src/activity.ts
```

**规模最大与变更最频是同一个文件**，这是架构热点的教科书定义 —— 它的每一次改动都发生在
全项目影响半径最大的地方。

### 2.3 测试覆盖映射（测试件直接 import 的模块）

| 有直接测试 | 无直接测试 |
|---|---|
| `distill`（2 件）· `treeops`（3 件）· `criteria`（1 件）· `mcl`（1 件） | `panel`(1904 行 / 49 次变更) · `scheduler`(670 / 36) · `vec`(302 / 14) · `targets`(438 / 10) · `activity`(260 / 6) |

⚠ 口径说明：只统计**直接 import 该模块**的测试件。panel / scheduler 属 IO 密集适配层，
部分行为由 `check-ui-contract` 等间接覆盖，故不能断言"零测试"，只能说**无直接单测**。

### 2.4 skill/scripts/（17 模块 · 2639 行 · 深度 2）

扁平、零环、健康。但 `archive-lib.mjs`（253 行 / **25 导出 / 扇入 9**）被 9 个脚本依赖，
其中 `candidate_grep` / `harvest-access` / `recall-eval` / `test` / 两个 probe **都不是归档功能**。

---

## 三、做得好的（不要动）

1. **零循环依赖**（静态 + 动态边都没有）。这比多数同龄项目好，是最值钱的性质。
2. **无跨模块共享可变状态**。全仓仅 4 处顶层可变/集合，经逐一核对全部良性：
   - `distill.ts` `hasDistillSignalsImpl`、`mcl.ts` `msgFactory` —— 惰性注入钩子（解环用）
   - `treeops.ts` `PROFILE_FILES`、`targets.ts` `RECALL_STOP` —— `const` 常量 Set，内容不变
3. **单一事实源纪律执行到位**：`criteria.generated.ts` 由 `skill/engine/criteria.json` 生成、禁手写；
   `suiteAssemblyMatrix` 只有一份实现。这两条正是防漂移的关键。
4. **纯函数已大量抽出**：`distill.ts` 前 676 行是常量/契约/已导出的纯函数（`planDeepSleepVerdict`
   / `planDiscardWrite` / `deepSleepLanded` …），且都被单测直接驱动 —— 这是很好的基础，
   **接下来的拆分成本因此低很多**。

---

## 四、需要优化的

### 🔴 P1 · `distill.ts`：一个模块装了两个变化原因

证据（P1 前的基线）：

- 3512 行 = 全仓 38.2%，30 个导出，7 个出向依赖。
- 深睡相关标识符 **172 处，行号 163–3510** —— **贯穿整个文件**，不是"前段蒸馏、后段深睡"的两段式，
  而是**交织**。这解释了它 81 次的变更频率：任何深睡改动都要在 3500 行里穿针引线。
- 真正的病根不在"文件大"：**`registerDistill` 是单个 2835 行的函数**（677–3512 行），
  五个工具、深睡状态机、水位逻辑、父子会话追踪全部塞在这个闭包里，靠闭包共享可变状态。

后果：改深睡 = 动全项目最大文件；两个独立的业务变化原因被迫同批发布、同批回归。

#### ✅ 一期（已完成，2026-09-12）

把**已是纯函数 / 决策表 / 契约常量**的部分整块抽为 `src/deepsleep-core.ts`（405 行，L2 层）：

| 迁出区块（原行号） | 内容 |
|---|---|
| 219–269 | 会话活跃状态机 FSM 文档 + `SessState` / `DeepSleepStatus` / `SessRec` |
| 290–318 | `DEEP_SLEEP_PROMPT`（深睡归纳契约） |
| 337–633 | `COMMIT_FAILED_GATE` `deepSleepLanded` `planDeepSleepVerdict` `liveFailPolicy` `deepSleepReplayable` `commitPrinciples` `planDiscardWrite` `planDegradedBaseline` `planSkipWatermark` `runDiscardWatermark` `resolveWatermarkBaseline` 及配套类型 |

**刻意不迁** 320–335 的 `CANDIDATE_NOISE` / `isNoiseIntent` —— 它属**蒸馏侧**（候选区噪声判别），
误迁会让深睡层反过来依赖蒸馏概念，制造新的错向依赖。

实测成果：

| 指标 | P1 前 | P1 后 |
|---|---|---|
| `distill.ts` 行数 | 3512 | **3149**（−363） |
| `distill.ts` 自身导出 | 30 | **8**（−73%） |
| 深睡判据是否有独立家 | 否（挤在 3512 行里） | 是（`deepsleep-core.ts`，只向下依赖 `criteria.generated` + `targets`） |
| 静态 / 动态循环依赖 | 0 / 0 | **0 / 0**（未引入） |
| `npm test` | 24 pass · 1 xfail | **24 pass · 1 xfail**（未回退） |

⚠ **一处必须同步改的连带项**（本仓已栽过同型）：两个接线闸
`test-wiring-gate.mjs` / `test-wiring-gate-ast.mjs` 硬编码只扫 `src/distill.ts`，
而 W1 守的「producer 与 consumer 共享同一常量」中，**常量定义与 consumer 已迁走** ⇒ 命中 0 ⇒ 误报「已脱钩」。
修法不是放宽判据，而是**把扫描范围扩到两个文件**（二者经 import 仍共享同一常量，语义未变）。
修改后两闸均恢复：文本版 32 PASS / 0 FAIL，AST 版 18 项 PASS、13 个破坏变体**全部翻红**。

#### ✅ 二期（已完成，2026-09-12 15:20）

**迁出**：块A 原 1344–2141（状态/traces/三通道/consolidateTree）+ 块B 原 2259–2879
（runDeepSleep/探测/对外 API），共 **1419 行** → `src/deepsleep.ts`（1519 行含头）。

**关键设计 —— 依赖倒置打破潜在环**：深睡**会回调蒸馏**（`distillAgent` / `writeDispatch`）。
若让 deepsleep 直接 import distill，就形成 `distill ↔ deepsleep` 循环依赖，
会毁掉本项目最值钱的「零环」性质。⇒ 24 项外部依赖全部经 `DeepSleepCtx` **注入**，
`deepsleep.ts` **零 import distill**。实测依赖链保持单向：

```
index(L7) → scheduler(L6) → distill(L4) → deepsleep(L3) → deepsleep-core(L2) → criteria.generated(L0)
```

**零逻辑改动迁出**：`createDeepSleep(ctx)` 工厂闭包，解构时 `appCtx: ctx` 把参数重命名回原名
⇒ 1419 行代码**缩进不变、裸名不变**整体迁移，把变更风险压到最低。工厂闭包是**刻意的第一步**：
先让结构对，再让形态漂亮（逐函数提到模块级属 P1 三期）。

**共享可变状态改引用传递**：`providerFailCount` 由蒸馏与深睡**双方读写**（11 处）⇒ 改为
`llmState` 对象引用传入；传值快照会让两侧计数脱钩（这类 bug 静默且极难查）。
`probeScriptPath` 两侧共用 ⇒ 留在 distill 注入深睡（放深睡侧会让蒸馏反向依赖）。

| 指标 | P1 前 | 一期后 | **二期后** |
|---|---|---|---|
| `distill.ts` 行数 | 3512 | 3149 | **1750**（−50%） |
| `registerDistill` 闭包 | 2835 行 | 2470 行 | **约 1400 行** |
| 深睡是否有独立模块 | 否 | 判据层 405 行 | 判据层 405 + 状态机 1519 |
| 静态 / 动态循环依赖 | 0 / 0 | 0 / 0 | **0 / 0** |
| `npm test` | 24·1 | 24·1 | **24·1**（无回退） |

**踩到的两个坑**：① 接线闸**第三次**因锚点随迁而误报（扫描范围须扩到三文件）；
② 审计工具自身误报——`deepsleep.ts` 头注释写了「不要 import './distill.js'」，
未剥注释时被当成真 import，**凭空报出循环依赖**。已加 `stripComments`，
并在 tmp 副本注入真环验证仍能检出 3 处 ⇒ 不是靠"不检测"绕过。

#### 🔴 三期（P1 收尾）：把工厂闭包拆成模块级函数

`deepsleep.ts` 内部目前仍是 `createDeepSleep` 工厂闭包。下一步把内部函数逐个提到模块级，
显式传 ctx，彻底消灭最后一个大闭包。**不紧急**——结构收益已拿到，形态优化可择机进行。

---

附：二期前的规格测绘（供理解 ctx 为何是 24 项）

对 `runDeepSleep`（415 行）做闭包引用分析：闭包内可见变量 **89 个**，它**实际只引用 22 个**：

```
25 log            13 audit           5 deepSleepFailStreak   4 providerFailCount
 2 ledger          2 applyPrinciples  1 writeProfileLine      1 validateProvider
 1 traceSince      1 runSelfCheck     1 resolveLlm            1 resolveDefaultModel
 1 pickParent      1 parseAgentJson   1 normalizeProfileTarget 1 gatherDeepSleepTraces
 1 ensureDaemonParent  1 consolidateTree  1 capEnv  1 bankSnapshot  1 applyPointerOps
```

**关键结论：22 项里只有 2 项是可变状态**（`deepSleepFailStreak`、`providerFailCount`），
其余 20 项是函数或只读值 ⇒ ctx 设计非常轻：

```ts
export interface DeepSleepCtx {
  // ── 可变状态（需回写，用 state 对象持有）──
  state: { deepSleepFailStreak: number; providerFailCount: number }
  // ── 基础设施（只读/副作用出口）──
  log(m: string): void; audit(o: Record<string, unknown>): void
  kRoot: string; ledger: …; capEnv: …; bankSnapshot: …
  // ── 依赖注入的函数（20 项）──
  applyPrinciples / applyPointerOps / consolidateTree / writeProfileLine /
  validateProvider / traceSince / runSelfCheck / resolveLlm / resolveDefaultModel /
  pickParent / parseAgentJson / normalizeProfileTarget / gatherDeepSleepTraces / ensureDaemonParent
}
```

目标形态：

```
src/deepsleep-core.ts   判据层（纯函数）        ← 一期已完成，405 行
src/deepsleep.ts        状态机（显式 ctx）      ← 二期：runDeepSleep 等约 1545 行
src/distill.ts          蒸馏器主体 + 装配        ← 二期后约 1600 行
```

⚠ **执行前置条件（重要）**：二期属大重构，而 `distill.ts` 上还压着 G-16 / G-19 / G-20 等一批修复，
且部署链路（push → 重钉 → pnpm install → 热重载）仍不通畅。**建议部署链路恢复、且近批修复完成
一轮回归之后再启动。** 一期已把最安全、收益最直接的部分拿走，二期可以等。

### 🟠 P2 · 架构约束此前无门禁（已补）

体检发现一个反差点：项目对"代码写对没有"有 25 道门禁，对"**结构有没有烂掉**"**一道都没有**。
今天零环不代表明天零环 —— 任何人加一个 `import` 就能引入环，且不会有任何东西报错。

已落地：新增 `scripts/audit-architecture.mjs`（双态：默认报告 / `--gate` 门禁），已登记进
`check-runner.mjs` 的 `CHECKS`。详见下节。

### 🟠 P3 · 变更热点无直接单测

`panel`（49 次变更）与 `scheduler`（36 次变更）都没有直接 import 它们的测试件。

性价比排序建议：
1. **`targets`** —— 33 个导出全是纯函数、扇入 4、438 行，**最容易测、收益面最广**，应优先。
2. **`vec`** —— 302 行、扇入 4，纯函数为主。
3. `panel` / `scheduler` —— IO 密集，建议做**契约测试**（端点存在性、参数白名单）而非单测。

### 🟡 P4 · `archive-lib.mjs` 名实不符

253 行导出 25 个符号，横跨至少 6 类职责：路径配置 / 文件状态 / 转录解析 / 会话识别 /
归档标记 / pending 队列。被 9 个脚本依赖，其中 6 个与归档无关。

这是典型的「共享库变工具袋」：`candidate_grep` 只想解析转录，却必须连带拉进 pending 队列与
归档标记。**命名（archive）已经不能描述它的实际职责，本身就是维护陷阱。**

建议：至少把 `pendingFileFor` / `writePending` / `listPending` / `readPending` / `removePending`
这一组内聚的队列操作拆成 `pending-queue.mjs`；其余按职责逐步拆。不紧急，但下次动这块时顺手做。

---

## 五、今天已落地的一件事：架构门禁

**新增** `scripts/audit-architecture.mjs`，已登记进 `check-runner.mjs` 的 `CHECKS`（第 26 项）。

守什么：

| 项 | 阈值 | 当前值 |
|---|---|---|
| 静态循环依赖 | **0**（严格） | 0 ✅ |
| 动态边隐藏环 | **0**（严格） | 0 ✅ |
| 单模块行数 | **3200**（P1 落地后按棘轮收紧，原 3600） | distill 3149 |
| 单模块导出数 | 35 | targets 33 |
| 单模块转发数 | 30（P1 后新增） | distill 24 —— 过渡 re-export，应逐步消除 |
| 最大扇入 | 8 | criteria.generated 7 |
| 分层深度 | 10 | 7 |

### ⚠ 阈值是棘轮（ratchet）：只许收紧，不许放松

阈值取「当前实测值 + 少量余量」，**目的不是评判好坏，而是锁住现状防恶化**。
因此**当前全部通过、不制造红灯** —— 这一点是刻意的：永久红灯的代价是所有人都学会无视它，
等于把假绿换成假红（本仓 G-22 已经栽过一次）。

想真正变好 ⇒ 重构后**下调**阈值；想放宽 ⇒ 必须显式说明原因并给出对应重构计划。

### 反向证伪（三组，全部通过）

| 变异 | 期望 | 实测 |
|---|---|---|
| 干净副本基线 | exit 0 | exit 0 ✅ |
| 注入 `zz-a ↔ zz-b` 循环依赖 | exit 1 | exit 1，报 `静态循环依赖 1 处: zz-a→zz-b→zz-a` ✅ |
| `distill.ts` 撑到 3712 行 | exit 1 | exit 1，报 `distill 行数 3712 > 3600` ✅ |

变异在 `os.tmpdir()` 的副本上做（脚本 `--dir` 支持绝对路径），**不把 src 临时改成缺陷态**。

### 门禁影响

```
npm test → PASS（24 pass · 1 xfail · 0 skip）   xfail 仍是既有的 test-treeops-rm.mjs
```

### 复用

```
node scripts/audit-architecture.mjs              # 报告态（人读）
node scripts/audit-architecture.mjs --gate       # 门禁态（CI）
node scripts/audit-architecture.mjs --json       # 机器读
node scripts/audit-architecture.mjs --dir skill/scripts   # 换目录（支持绝对路径）
```

---

## 六、明确不建议做的事

1. **不要为了减少层数而重构。** 深度 7 对 14 个模块偏"链状"，但层数多本身不是问题 ——
   问题只在于「**同一层里是否混了多个变化原因**」。本项目同一层内职责是清晰的，为降层数
   动结构属于净亏损。
2. **不要急着拆 `panel.ts`（1904 行）。** 它是 fan-in=0 的**叶子入口**，改它不影响任何模块，
   影响半径天然为 0。规模大但危害小，优先级应低于 `distill`。
3. **不要为了"模块更小"而切碎 `targets.ts`。** 它 438 行 33 导出的接口确实偏宽，但**全是纯函数、
   无状态**，拆分收益有限。真要动，先补测试，再按职责切。
4. **不要现在启动 P1 阶段 2。** 部署链路不通畅时做大重构，会让"已修未部署"这种老问题
   再叠加一层"重构了一半"，难以回滚。

---

## 七、一句话总结

骨架是对的（零环、无共享可变状态、事实源单一），**要治的不是分层，而是 `distill.ts` 里装了
两个变化原因** —— 具体病灶是 `registerDistill` 这个 2835 行的巨型闭包。

本次已完成的根治动作，按「先固化、再动刀」的顺序：

1. **先装门禁**（棘轮阈值，锁住现状防恶化）—— 否则边拆边烂，拆完不知道有没有变好；
2. **再拆最安全、收益最直接的一层** —— 深睡判据层抽为 `deepsleep-core.ts`，
   `distill` 从 3512 → 3149 行、自身导出 30 → 8，且零环未破、全链门禁未回退；
3. **把二期的规格测绘出来** —— `runDeepSleep` 89 个可见闭包变量中只引用 22 个，
   其中仅 2 个可变状态 ⇒ 「拆巨型闭包」从模糊的勇气问题变成了 22 行字段清单的工程问题。

剩下的一步（搬 1545 行状态机主体）规格已就绪，**等部署链路恢复再动** —— 在推送不通、修复未回归的
状态下连续做大手术，会把"已修未部署"叠上"重构了一半"，那才是真正威胁后续开发的做法。

---

## 八、P1 一/二期落地后复测与下一目标（2026-09-12 16:20）

> 本节是对上文的一次**结论更新**：一/二期已完成（`distill.ts` 3512 → 1750 行），复测后发现
> **最优目标变了**，并据此新增第二道架构门禁。

### 8.1 复测：换了个口径，病人也换了

| 模块 | 行数 | 最大函数（跨度） | 近 90 天变更 |
|---|---:|---|---:|
| `panel.ts` | 1903 | **`applyPanel` 1817 行**（87–1903） | 49 |
| `distill.ts` | 1749 | `registerDistill` 1435 行（315–1749） | **82** |
| `deepsleep.ts` | 1518 | `createDeepSleep` 1434 行（85–1518） | 1（新建） |
| `scheduler.ts` | 669 | `applyScheduler` 430 行（240–669） | 36 |

结构性质维持健康：**静态环 0 / 动态隐藏环 0 / 深度 8 / 16 模块 9349 行**。

**关键认知修正**：上文用「文件行数」当病灶指标是**不准确的**。真指标是
**单函数跨度** —— 文件行数会随拆分发散（distill 3512→1750 就"治好了"），
但 `applyPanel` 1817 行这种单体函数不会因为多了两个文件而变小。
全仓 >400 行的函数共 **4 个**，全部是 `applyXxx(ctx)` **工厂闭包**：

```
panel.ts:applyPanel         1817 行   ← 全仓第一
distill.ts:registerDistill  1435 行
deepsleep.ts:createDeepSleep 1434 行  ← 刚迁出来的，形态未变
scheduler.ts:applyScheduler  430 行
```

**⇒ 根病是同一个模板**：`applyXxx(ctx)` 工厂闭包把整个模块塞进一个函数，
靠闭包共享 60+ 个内部定义（panel 61 个 / distill 60+ 个）。
这不是四个独立问题，是**一个模式被复用了四次**。

### 8.2 新增第二道门禁 `scripts/audit-fnspan.mjs`（棘轮双层）

只设一个"阈值"会造**假绿** —— 当前最大 1817 行，阈值取 2000 的话今天谁也碰不到，
仪表盘看着有覆盖，实际守了个寂寞（与"永久红灯人人无视"同型，方向相反）。故双层：

1. **硬顶**：任一函数 ≤ 2000 行（防新增怪物，今天过）；
2. **债务计数**：>400 行的函数 ≤ **4 个**（棘轮基线）。新增任何一个 ⇒ 5 > 4 ⇒ **立刻红**；
   拆掉一个 ⇒ 实测 < 基线 ⇒ 输出提示**要求收紧基线**（只许收紧不许放松）。

反向证伪四组全过：干净副本 PASS(`exit 0`)；注入 460 行函数 ⇒ 债务 5>4 **FAIL(`exit 1`)**；
注入 2202 行 ⇒ 破硬顶 **FAIL(`exit 1`)**，且准确定位 `panel.ts:2369-4570`；
把基线改松到 7 ⇒ 触发「请收紧到 4」提示。变异在临时副本做，真实 `src/` 未改动（git 无 diff）。

### 8.3 目标优先级修正（推翻上文六.2）

上文六.2 写「**不要急着拆 `panel.ts`，它是 fan-in=0 的叶子入口，规模大但危害小**」。
复测后**这条要改**：

- 「影响半径 0」只说明**改它不会连累别人**，不说明**改它自己不难**。
  1817 行的单体函数里改任何一处，都要在 61 个闭包内定义中穿针引线 —— 这是**内部维护成本**，
  与扇出无关。扇入 0 是"不会炸别人"，不是"自己好改"。
- `panel` 变更 49 次，`distill` 82 次。按「变更频次 × 单函数跨度」粗排维护成本：
  `distill` ≈ 11.8 万 > `panel` ≈ 8.9 万 > `scheduler` ≈ 1.5 万。
  ⇒ **两者都值得做**，但 `distill` 的剩余部分（4 个工具 + 水位 + 父子会话追踪）仍居首。

**建议顺序**（每次做完都收紧一次 `DEBT_BASE`）：

1. `deepsleep.ts` 工厂闭包 → 模块级函数（P1 三期，规格已就绪，风险最低）；
2. `panel.ts` 按**路由域**切分 —— 接缝已在源码里现成：32 个 `route()` 注册点天然分 6 组
   （配置 500–1014 / 记忆 1015–1168+1804–1903 / 认知判据 1169–1361 / 深睡蒸馏 1462–1535 /
   向量嵌入 1536–1803 / LLM 1383–1461），其中 `/set` 单端点占 350 行是最大一块；
3. `distill.ts` 剩余部分（4 工具 + 水位 + 父子会话）；
4. `scheduler.ts`（430 行，最小的一块）。

**⚠ 前置条件（已完成）**：`panel` 曾**零单元测试**。2026-09-12 17:35 已补
`scripts/test-panel-wiring.mjs`（13 条，登记 CHECKS 第 12 项），锁：34 条路由在册且未改名 /
无未登记新路由 / 无重复注册（宿主会抛 duplicate route ⇒ 插件树整体加载失败）/ 只读端点真能响应
200 / webServer 缺失时降级不抛。反向证伪两组（改名 `/roots`、改名 `/criteria`）均 3 红 exit 1。
**这次是先把网建好再动刀**——深睡那次补在后面，不理想。

### 8.4 `panel.ts` 拆分施工图（已测绘，未动刀）

**⚠ 一个必须先知道的结构事实**：1628 之后的路由**不在 `applyPanel` 顶层**，而是包在
**1588–1902 的 `ctx.effect(() => {...})` 回调里**（315 行，含 systemPrompt 注入块）。
拆块时必须整块搬，不能只切 `route()` 调用行——否则会把 effect 的 `return disposer` 切飞。

`applyPanel` 直接子定义（AST 精确）分块：

| 块 | 行区间 | 行数 | 内容 |
|---|---:|---:|---|
| 保持 | 87–456 | 370 | 守卫 + 状态读写 + `route()` + 引导/boot + `buildHotMemoryText`(240–393) + `parseView` |
| B1 | 500–781 | 282 | 配置域：`/roots` `/get_root` `/root/bootstrap` `/set_root` `/config` `/save` `/toggle` `/set` |
| B2 | 793–1161 | 369 | 记忆域 helper（`memoryHomeOf`…`memOverviewOf`）+ `/memory/overview` `/memory/sections` |
| B3 | 1169–1533 | 365 | 观测/判据/睡眠域：`/suite` `/mcl/status` `/reconcile` `/selfcheck`×2 `/config/recent` `/criteria` `/cognition/report` `/llm/models` + 睡眠配置 helper + `/deepsleep`×3 `/distill`×2 |
| B4 | 1536–1901 | 366 | `/inject/preview` `/inject/stats` + commands 注册 + **1588 起的 `ctx.effect` 回调**（`/vector/status2` `/embed/config` `/embed/test` `/vector/cache/clear` `/memory/section-edit|edit|remove|approve` + systemPrompt 注入 + disposer） |

搬出 B1–B4 后 `applyPanel` ≈ 370 行；再把 `buildHotMemoryText`(154) 也提到模块级 ⇒ **≈ 215 行**。

**作用域怎么传（保类型、不手写 interface 的做法）**：把共享装配提到模块级工厂，
用 **`type PanelScope = NonNullable<ReturnType<typeof makePanelScope>>`** 自动推断，
路由函数签名写 `(P: PanelScope)`。这样 1400 行搬过去**类型不失真**——
若手写 interface 或图省事写 `Record<string, any>`，搬过去的代码全变 `any`，
等于把 1400 行的类型保护一次性交出去（这个代价不能省）。

**为什么本次没直接动**：1817 行 × 4 块的搬迁需要在**一次会话内做完并跑完全链验证**，
留半截状态风险高于收益。安全网已就位，施工图已测绘，下一轮可直接执行。
