# 按域路由的注入选行 · 方案 v2（圆桌会议修订稿 · 待审）

> v1（`domain-routing-plan.md`）经圆桌会议 `domain-routing-v2` 六节点会审，**被修正 12 处、其中 2 处是地基**。
> 本文为 v2，**全部数字均为本机实测**（口径随文标注）。**尚未执行任何改动**（全部暂缓，待审）。

---

## 一、v1 的地基错误（两处，会议推翻）

### 错误 1 · 「always 域已在恒定面、不参与召回竞争」——**半错**

实测：恒定面**只由 `AGENT.md` + `USER.md` 构成**（`panel-shared.ts:580-600` 的 `agentBlock`/`userBlock` 两块）；
`MEMORY.md` 经 `:541 readIdx('MEMORY.md')` → `:546 selectDynamicLines({allMem,…})` **进的是 dynamic 池**。
⇒ **`MEMORY.md` 里 64 条 `[环境]`（登记为 always）实际在 dynamic 池里争那 600 字符**。

### 错误 2 · 「常驻型搬进 frozen 冻结段」——**弃用**

会议裁决（impl 枢纽判定 + 主持人复核）：

```
守藏注入面可拆分：
  恒定面（readCarrier 产出，实测与 query 无关） → 改走 systemPrompt.section ⇒ 落节点 0 ⇒ 压缩豁免
  动态面（selectDynamicLines 产出，依赖 query） → 留在 systemPrompt.context ⇒ 可压区（本就该可丢）
```

**为什么这是根因解**：压缩豁免的需求**只对恒定面成立**（它要"每步在场且不丢"）；动态面本就按需、可筛、可丢。
⇒ **一处拆分同时满足两个需求**，且 **frozen 不需要承载任何内容**。

**弃用「搬 frozen」的四条理由（实测/读码）**：
| 项 | 改通道（采纳） | frozen 承载（弃） |
|---|---|---|
| 改动面 | `panel-inject.ts:414` 一处拆分 + 出口转义 | 跨包复制 ~80 行解析逻辑 |
| 治理归属 | **留在守藏**（预算/账本/缓存全在） | **脱离治理**（不经 `budgetChars`、`/inject/stats` 看不到） |
| 漂移风险 | 无 | 标签 schema **双处漂移**（须额外机检对齐） |
| 失效语义 | 复用既有四条件 | **新增第二套**（与 `lib-changed` 冲突） |

**支撑证据（主持人实测）**：
```
最近 5 会话，折叠 surface 后定位节点索引：
  守藏热记忆  seq=10  type=user/message  节点索引=3   ⇒ 可压区（确会被压缩）
  frozen 段   seq=1354                    节点索引=0   ⇒ 豁免
  节点0 含守藏 ? false（5/5）
```
⇒ **压缩豁免是真需求**（守藏注入确实会被压缩掉）。

**通道差异的确切语义（impl 读码）**：`section` 与 `context` **差异只在消费端落点**
（`dsh-system-prompt:111-113` 进系统提示词主体 vs `:144-149` 进 runtime context 快照）；
**两条通道的 `text()` 都每步重求值**（`:339` / `:344-347`）——
⇒ frozen 的"会话内恒定"是**它自己的闭包缓存**，不是通道给的。
⇒ 守藏把自家四条件缓存搬进 `section.text` 闭包即可保住"库变即重建"。

**唯一风险（须实测前置）**：`agent-loop:273-283`
```js
274  if (!input.inHistory || input.startsSeries || rendered.length === 0) {
276    if (head.text !== rendered) updates.push(this.replace(head.seq, rendered));   ← 原地替换节点 0
278  }
280  return [{ message: createSystemMessage(rendered, SOURCE), intent: { surfaceOp: "append" } }];  ← 追加（落可压区）
```
⇒ `inHistory=true` 时内容变会**追加新节点**（豁免失效）。**恒定面因会话内恒定，无此问题**；动态面**不可搬**（结构性隐患）。

---

## 二、v1 → v2 修订清单（12 处）

| # | v1 写的 | v2 结论 | 依据 |
|---|---|---|---|
| 1 | 新增 `route` 三值字段 | **删** —— `panel-shared.ts:503`/`targets.ts:303-306` 只读 `inject`，`route` 对运行时**零效果**；且路由可由既有字段推导：`always` / `gated∧mclGate→task` / `gated∧¬mclGate→recall` | arch C1 · fact |
| 2 | 常驻型搬进 frozen | **弃** ⇒ 改走 section（见 §一.错误 2） | impl 裁决 |
| 3 | §四② `原则` 入 TASK | **删** —— `原则`=`inject:always`，归恒定面；`mclGate` 是 **MCL 快通道标记**非路由标记 | edge E5 · impl B1 |
| 4 | `[环境]` 61 条 | **改 64 条**（实测），且**约 8 成**指向 `notes/env.md` | fact |
| 5 | 被 `injectProfileRows` 裁 | **改**：被 **`budgetChars` 稳定面安全带**裁（`injectProfileRows` 只裁画像行） | fact · minimal |
| 6 | frozen 正文 166 字符 | **补口径**：**正文 166 / 文件 799 字节** | accept |
| 7 | 13 个域 | **改 18 条**（注册表实测） | accept · 主持人复核 |
| 8 | dynamic 池行源 | **补**：三路全部锁死 `MEMORY.md`（`dynamic-select.ts:140`/`:169`/`:178`）⇒ `[教训]`(51)/`[路径]`(15) **根本进不来** | impl B2 |
| 9 | 「45% 词法零命中」 | **撤出判据**（临时脚本已删，无可复跑） | fact（C 级） |
| 10 | 「inject 被 6 处消费」 | **改**：运行时**仅 `targets.ts:269` 一处** | fact（实测） |
| 11 | `教训` 50 / `[环境]` 余弦 0.495 | **改**：**51** / **0.512** | fact |
| 12 | 封顶归属未提 | **补硬约束**：**只在 `budgetOf`**（见 §四） | arch 遗漏项 |

---

## 三、数字底座（v2 实测 · 口径随标）

### 3.1 注册表 `carriers.tags` —— **18 条**（v1 写 13，错）

| 域 | inject | layer | 实测行数 |
|---|---|---|---|
| `lesson` | gated | E | **114** |
| `原则` | always | P | 74 |
| `环境` | always | P | **64** ← 漂移项 |
| `教训` | gated | E | **51** |
| `tool` | gated | E | 33 |
| `env` | gated | E | 22 |
| `flow` | gated | E | 20 |
| `路径` | gated | R | 15 |
| `偏好` | always | P | 3 |
| `习惯` | always | P | 2 |
| `身份` | always | P | 1 |
| `经验` | gated | E | 1 |
| `硬件` | always | P | 1 |
| `使命`·`边界`·`性格`·`认知`·`演化` | always | P | 0（未启用） |

**gated 7 域**（真正参与 dynamic 竞争）：`经验`1 · `教训`51 · `路径`15 · `env`22 · `tool`33 · `flow`20 · `lesson`114 = **256 行**。
而 `dynamic` 预算 600 字符 ⇒ **覆盖率约 5%**。

### 3.2 恒定面真实需求 vs 分配（**关键矛盾**）

```
AGENT.md  always 索引行 74 条 / 5893 字符   +  画像行 13 条 / 1021 字符
USER.md   always 索引行  8 条 /  431 字符   +  画像行 28 条 / 2159 字符
                            小计 6324 字符（索引行）

budgetOf(4000)  →  stable = 4000 − 200 − 600 = 3200 字符
```
⇒ **恒定面 6324 vs 分配 3200 = 结构性不足**。这是 `[环境]` 等条目被裁的**真机制**
（v1 误记为 `injectProfileRows=6`，后者只裁画像行）。

### 3.3 域间语义判别力（bge-m3 实测，query = `开发一个运行在 Windows 的程序，需要本地跑模型`）

```
路径 0.556 · env 0.529 · 原则 0.512 · 教训 0.510 · lesson 0.505 · flow 0.504
环境 0.512 · tool 0.489 · 习惯 0.485 · 偏好 0.475 · 经验 0.461 · 硬件 0.394 · 身份 0.386
```
（fact 复测：仅 `[环境]` 为 **0.512**，v1 写 0.495 有误；其余逐位复现）
阈值 `tOn=0.65` / `familiarThreshold=0.55` ⇒ **弱语义域永远垫底**。

### 3.4 frozen 插件现状（口径必须标）

```
D:\lk\FF\dsh-frozen-injection\
  frozen-injection.txt   文件 799 字节 / 剥离 `#` 注释后正文 166 字符  ← 两个口径都对，含义不同
  lib\index.js           只读同目录 txt；按 session.id 缓存；同步 text()
装配：运行时注入（super-injector loader.create）⇒ **不在** package.json/bundles/patch/settings.yaml
实测：最近 8 个会话 **8/8** 的节点 0 含 frozen 正文 ⇒ 装配链是活的
```

---

## 四、硬约束：封顶唯一归属（**不做则方案不成立**）

```
budgetOf（supply-assembly.ts:61-65）  →  stable 吃余额（实测 3200/4000）
process 槽（dynamic-select.ts:145-154）→  自称"额外占位不吃 cap"
各域再给独立配额                       →  总额无界超 budgetChars
```
⇒ **配额只能做除法不能做加法**。**确立**：封顶**只在 `budgetOf`**，各路由配额在其内部做除法。

---

## 五、收敛后的最少必要集（5 项）

| # | 项 | 改动面 | 类型 |
|---|---|---|---|
| ① | **守藏恒定面改走 `section`** | `panel-inject.ts:414` 一处拆分 + 出口转义 | **代码**（根因解） |
| ② | **`[环境]` 注册表归一** | `layer:P→E` + `inject→gated`（两条值 + 重跑 `gen:criteria`） | **数据** |
| ③ | **`process.enabled: true`** | 注册表一值（task 路由 = 打开既有槽，零新代码） | **配置** |
| ④ | **`recall` 域内 top1 保底** | `dynamic-select.ts` 加薄函数 | **代码** |
| ⑤ | **通道健康位** | 防「召回通道死亡被 catch 全吞」的假成功（edge E3+E8） | **代码** |

**已判可删/可缓**：`route` 字段 · `routes` 配置块 · 逐域 UI 开关 · preview `routes` 视图 · 整体搬 frozen · §四② `原则` 入 TASK。
**P3（UI/i18n）整体暂缓**至前四项落地后。

---

## 六、动工前置（三项，均须实测）

1. **`systemPromptUpdate` 在新会话复测** —— 决定 `inHistory` 取值。主持人实测（30 会话/36 条 `request/context`）**100% 缺席** ⇒ 本机 `inHistory=false`；**换 provider 会变**。
2. **出口转义 `{{`** —— `dsh-system-prompt:155-167` 遇未注册变量**硬抛错、会话不可恢复**。frozen 的 `escapeBraces` 有现成实现可借鉴。
3. **`inject-baseline-diff` 字节回归** —— 搬通道后注入文本须**逐字节可比**（本仓已有该测试件）。

---

## 七、验收判据（accept 出，A 组可自动 / B 组须人工）

**A 组（四要素齐）**：A1 恒定面落点 = 节点 0（`foldSurface` 首节点 type）；A2 字节回归（`inject-baseline-diff` 逐字节）；
A3 `[环境]` 归一后 `check-carriers` 三断言仍过；A4 `gen:criteria --check` 新鲜；A5 契约门（`check-panel-contract` + `gen-panel-contract --check`）；
A6 五道 i18n 门；A7 `audit-wiring` I1/I2 不破；A8 `npm test` 全绿。
**B 组（须人工）**：B1 `[环境]` 归一路线；B2 封顶归属；B3 配额形态；B4 落地节奏；B5 常驻体量口径；B6 召回质量抽样。

**等价性口径（accept 修正 v1）**：v1 写"recall 行为不变"与"配额改变行为"**自相矛盾**。
⇒ 改为「**diff 全部可归因**」：任何注入文本变化必须能归因到某条明确的规则改动。

---

## 八、决策卡（五项，待拍板）

| # | 问题 | 选项 | 会议建议 |
|---|---|---|---|
| **D-1** | 压缩豁免怎么拿 | **A** 恒定面改走 `section`（一处拆分）/ **B** 搬 frozen（9443 字符） | **A**（改动面小、治理留在守藏、无 schema 漂移） |
| **D-2** | `[环境]` 归一 | ① 连 `layer` 改 `P→E` ② 只改 `inject`（会与 `P⇒always` 不变量打架）③ 维持双轨 | **①**（须重跑 `gen:criteria`，注意 layer 参与写门/容量/审计） |
| **D-3** | 封顶归属 | ① **只在 `budgetOf`**（各路由在其内做除法）② 允许各槽自留 | **①**（不做则总额无界） |
| **D-4** | `recall` 配额 | ① **域内 top1 保底 + 既有全局序** ② 按行数占比 | **①**（最小改动即消除小域垫底） |
| **D-5** | 落地节奏 | ① **P0 注册表先行**（②③，风险最低）② 一次性全落 | **①** |

---

## 九、会议与证据索引

**会议**：`domain-routing-v2`（orchestrated · 6 节点：arch/impl/minimal/accept/fact/edge · 14 轮 / 200000 tokens · kb=`D:\FF\shoucang\docs`）
**v1**：`docs/domain-routing-plan.md`（**已被本文取代**，保留供比对）

**关键源码锚点（全部主持人或节点实读）**：
```
panel-shared.ts:498-531    readCarrier（恒定面选行，全文无 q）
panel-shared.ts:503        indexRowInLayer(l,'always') —— 恒定面准入
panel-shared.ts:541,546    MEMORY.md → allMem → selectDynamicLines（进 dynamic 池）
panel-shared.ts:580-600    恒定面 = agentBlock + userBlock（仅 AGENT/USER）
targets.ts:303-306         indexRowInLayer —— 只读 inject，不读 route
dynamic-select.ts:140,169,178   三路行源全锁 MEMORY.md
dynamic-select.ts:72-76    process 槽先例（"改权重解决不了，只能分槽"）
dynamic-select.ts:145-154  process 不做除法（额外占位）
supply-assembly.ts:61-65   budgetOf（stable 吃余额）
supply-assembly.ts:213     takeSlot#mustInclude（超预算也进）
agent-loop:273-283         project() 两分支
dsh-system-prompt:111-113 / 144-149 / 339 / 344-347    section vs context
dsh-system-prompt:155-167  interpolate 遇未注册变量硬抛错
compaction-basic:393-398   节点 0 压缩豁免（官方原文）
check-carriers.mjs:27-35   inject∈{always,gated,none} + P⇒always 硬断言
```

**未改任何文件**：本文为方案档；v1 保留原样；源码与注册表**零改动**。
