# 守藏注入面改造 · 全案落地方案（2026-09-18）

> ## ✅ 落地终态（2026-09-18 收口 · 代码提交 `307da99` · 终态提交/pin `8d4851b`）
>
> **本方案已全部落地并五层同步完成。** 下列为实测收口证据（非自述）：
>
> | 项 | 状态 | 证据 |
> |---|---|---|
> | **P0-a** `[环境]` 归一 `P/always → E/gated` | ✅ | `check:carriers` + `check:criteria` PASS · 投影已重生成 |
> | **P0-b** `process.enabled: false → true` | ✅ | 注册表实测 `enabled:true` · 注入面已见 `[路径]` 行经 process 槽进面 |
> | **P1** 恒定面改走 `systemPrompt.section` | ✅ | **端到端取证**：会话 `87161bb5` 节点 0 `seq=3125 op=replace 1354..1354 len=21865`，**含恒定面锚点、不含知识索引**；健康位 `mounted:true · calls>0 · lastLen=2907` |
> | **P1 字节回归** | ✅ | `inject-baseline-diff` 3 case **逐字节一致** |
> | **P2** 通道健康位 | ✅ | `/inject/stats.stableChannel` = `{mounted,hasSection,mountErr,calls,lastLen,lastErr,at}` |
> | **P2-b** recall 域内 top1 保底 | ✅ | 实测域覆盖由单域扎堆 → **2–5 个域/条**（`[教训]`/`[环境]` 等小域已现身） |
> | **P3** UI 健康位行 + i18n | ✅ | `panes-overview` 「恒定面通道」行 · i18n 5 门 PASS |
> | **五层同步** | ✅ | ① 门禁 **139 pass / 0 fail** · ② 副本 **242/242 sha1 一致** · ③ 热重载过 · ④ `check-installed-features` PASS · ⑤ push `e6bc81b..307da99` + **pin PASS（三处一致 @ 307da995）** |
> | **渲染级** | ✅ | `ui-geo-regress` **100 PASS / 0 FAIL** |
>
> **实施中修正的两处原方案问题**（详见 `CHANGELOG.md [Unreleased]`）：
> 1. **`section` 必须以接收者形式调用**（`sp.section(...)`）—— 解构后调用丢 `this` ⇒ `Cannot read properties of undefined (reading 'layers')`；
> 2. **P0-a 的连带副作用**：`memBase` 原用 `allMem`（只含 always 行），归一后 MEMORY.md 的 always 池**恒空** ⇒ 空 query 丢位置式兜底。
>    修法是**修正测试夹具**（旧夹具假设 `[环境]=always`）+ **承认 process 槽启用后 `[路径]` 合法进面**，
>    而**不动** `allMem` 池（那是层过滤不变量，`test-carrier-layers` A7-1/A8 守）。
>
> **遗留（非本方案范围）**：召回质量的人工抽样（B5）需真实任务轮次累积后再评。

> **本档性质**：整合本次会话全过程（两轮圆桌会议、六节点会审）的**落地方案**——方案与验收成对、按板块分册。
> **全部数字为本机实测**，口径随标。

---

## 零 · 一页总览

| 板块 | 状态 | 产出 |
|---|---|---|
| **A · 会话冻结注入** | ✅ **已落地并机检接通** | `D:\lk\FF\dsh-frozen-injection\`（节点 0 豁免压缩） |
| **B · 按域路由的注入选行** | 📋 **方案已收敛，待拍板** | `docs/domain-routing-plan-v2.md` |

**会话贯穿的一条主轴**：
```
「记忆注入要抗压缩」 → 发现注入有两条通道（section 落节点 0 / context 落可压区）
                    → 发现域的语义判别力差 2 倍 → 发现恒定面额度结构性不足
                    → 发现「注入面该拆成恒定面 + 动态面」
```

---

## 一 · 目标与红线

| 项 | 内容 |
|---|---|
| **目标 1** | 会话开头必须常驻的内容**不被压缩淘汰** |
| **目标 2** | 记忆注入**按域路由**：每域走它适配的判据，不被大域挤没 |
| **红线 1** | **不改官方包**（`node_modules` 只读；升级即失的方案一律不采纳） |
| **红线 2** | **单一事实源**：同一事实不得有两处合法来源 |
| **红线 3** | **零硬编码本机路径**（仓内门 `check-hardcode` 守） |
| **红线 4** | 改动须可逆（无 git 的目录先备份） |

---

## 二 · 问题诊断（讨论过程的核心发现）

### 诊断 1 · 两条注入通道，落点不同（**根因**）

```
systemPrompt.section(...)  →  系统提示词主体  →  surface 节点 0  →  ★压缩豁免
systemPrompt.context(...)  →  runtime context  →  user/message（节点索引 3）→  ✗ 可压
```
**实测（5 会话折叠 surface 后定位节点索引）**：
```
守藏热记忆  seq=10  type=user/message  节点索引=3   ← 会被压缩吞掉
frozen 段   seq=1354                    节点索引=0   ← 豁免
节点 0 含守藏 ? false（5/5）
```
⇒ **守藏原有注入确实会被压缩淘汰** ⇒ 目标 1 是真需求，不是预防性需求。

### 诊断 2 · 域间语义判别力差 2 倍（目标 2 的依据）

query = `开发一个运行在 Windows 的程序，需要本地跑模型`，逐域最强余弦（bge-m3，1024 维）：
```
路径 0.556 · env 0.529 · 原则 0.512 · 环境 0.512 · 教训 0.510 · lesson 0.505
flow 0.504 · tool 0.489 · 习惯 0.485 · 偏好 0.475 · 经验 0.461
硬件 0.394 · 身份 0.386          ← 阈值 tOn=0.65 / familiarThreshold=0.55
```
⇒ **环境常量型内容（硬件/身份）语义上永远垫底**，但它们与任务**逻辑强相关**（本地跑模型 ⇒ 看显存）。
⇒ **域规则能表达这种关联，向量不能。**

### 诊断 3 · 恒定面额度结构性不足

```
AGENT.md always 索引行 74 条 / 5893 字符 + 画像行 13 条 / 1021 字符
USER.md  always 索引行  8 条 /  431 字符 + 画像行 28 条 / 2159 字符
                       小计 6324 字符（索引行）

budgetOf(4000) → stable = 4000 − 200 − 600 = 3200 字符
⇒ 需求 6324 vs 分配 3200 ⇒ 约一半被裁（留痕但不进注入面）
```

### 诊断 4 · 登记漂移（实测确证）

```
[环境] 64 条（layer:P / inject:always）+ [env] 22 条（layer:E / inject:gated）
其中约 8 成指向同一个 notes/env.md   ← 同一信息源，两种待遇
```

### 诊断 5 · dynamic 池行源锁死单一文件

```
dynamic-select.ts:140  基线池  readFileSync(...'MEMORY.md')
dynamic-select.ts:169  warm-recall 只收 file==='MEMORY.md'
dynamic-select.ts:178  recallIndex 只收 file==='MEMORY.md'
⇒ [教训](AGENT 侧 51 条)、[路径](AGENT 侧 15 条) 根本进不了 dynamic 池
```

### 诊断 6 · 配额只能做除法不能做加法（**硬约束**）

```
budgetOf            → stable 吃余额（3200/4000）
process 槽          → 自称"额外占位不吃 cap"（dynamic-select.ts:145-154）
各域再给独立配额     → 总额无界超 budgetChars
```

---

## 三 · 板块 A：会话冻结注入（✅ 已落地）

### A.1 交付物

```
D:\lk\FF\dsh-frozen-injection\
  lib\index.js            手写 ESM（零外部依赖，无需 tsc）
  frozen-injection.txt    文本源：行首 # 为注释（不进注入面）
  package.json            inject=['systemPrompt']
装配：运行时注入（super-injector loader.create）⇒ 不在 package.json/bundles/patch/settings.yaml
```

### A.2 机制

```
compaction-basic:393-398   节点 0 是 system/message ⇒ firstIdx 从 1 起 ⇒ 节点 0 物理豁免
agent-loop:273-283         inHistory=false ⇒ :276 原地替换节点 0（非 append）
dsh-system-prompt:339      section.text 同步直调（异步会崩）
dsh-system-prompt:155-167  成对 {{name}} 未注册即抛错 ⇒ 出口须转义
```

### A.3 验收（已机检通过）

| 判据 | 结果 | 证据 |
|---|---|---|
| **J6 接通** | ✅ PASS | 最近 **8/8** 会话节点 0 含 frozen 正文 |
| J2 未被 shadow | ✅ PASS | 节点 0 均 `system/message`、被 shadow 次数 0 |
| J8 结构性豁免 | ✅ PASS | 10 个已闭合压缩会话，节点 0 从未被 shadow |
| J1/J7 同会话存活 | ⚠ TBD | 需一次「同会话既含 frozen 又压缩」的样本；外部不可程序化触发（realm 隔离），须会话内 `/compact` |

**验收脚本**：`D:\lk\FF\_tmp_judge.mjs`（J1/J2/J3/J5/J6/J7/J8，已修 4 处假绿）

### A.4 回退

```
dev_uninject_plugin { match: "dsh-frozen-injection" }
# 或清空 frozen-injection.txt 正文（返回空串 ⇒ 不注入、不占预算）
```

---

## 四 · 板块 B：按域路由的注入选行（📋 待落地）

### B.1 形态定案：注入面拆分（**根因解**）

```
守藏注入面 = 恒定面（readCarrier 产出，实测与 query 无关） ⊕ 动态面（selectDynamicLines，依赖 q）
                        ↓                                          ↓
           改走 systemPrompt.section                    留在 systemPrompt.context
                ⇒ 节点 0 ⇒ 豁免                              ⇒ 可压区（本就该可丢）
```

**为什么是根因解**：压缩豁免的需求**只对恒定面成立**（要"每步在场且不丢"）；动态面本就按需、可筛、可丢。
**一处拆分同时满足两个需求**，且 **frozen 不需要承载任何内容**。

**支撑证据**：`readCarrier` 全文（`panel-shared.ts:498-531`）**无 q 参数、无 query 引用**。

**唯一风险与前提**：
```
agent-loop:274  if (!input.inHistory || input.startsSeries || rendered.length===0) → :276 原地替换
                else                                                            → :280 append（落可压区）
```
⇒ 恒定面因**会话内恒定**，无此问题；**动态面不可搬**。
⇒ **前提须实测**：宿主 `systemPromptUpdate` 取值分布（决定 `inHistory`）。本机实测 30 会话/36 条 `request/context` **100% 缺席**；**换 provider 会变，须复测**。

### B.2 被否方案（记录，避免重走）

| 方案 | 否决理由 |
|---|---|
| 常驻型 9443 字符**搬进 frozen** | 跨包复制 ~80 行解析 · 标签 schema **双处漂移** · **脱离守藏治理**（不经 `budgetChars`、`/inject/stats` 看不到） · **新增第二套失效语义**（与 `lib-changed` 冲突） |
| 新增 `route` 三值字段 | `panel-shared.ts:503` / `targets.ts:303-306` **只读 `inject`** ⇒ `route` 对运行时**零效果**（假旋钮）；且路由可由既有字段推导 |
| 扩 `inject` 取值 | `check-carriers.mjs:27-35` 硬断言 `inject∈{always,gated,none}` + `P⇒always` ⇒ 破断言与渲染器表 |
| `原则` 入 TASK 路由 | `原则`=`inject:always` ⇒ 属恒定面；`mclGate` 是 **MCL 快通道标记**，非路由标记 |
| 逐域 UI 开关 / preview `routes` 视图 / `routes` 配置块 | 回退粒度已由注册表单字段 + 全局开关提供；`supplyUsage` 的 `kept/dropped[].slot+why` 已够定位 |
| 改 `thresholdRatio` 造压缩 | `compaction-basic:113` `retainTokens >= thresholdTokens` 即抛错；本机 `retainRatio=0.2` ⇒ 改 0.02 **当场崩** |

### B.3 最少必要集（5 项，3 项是数据/配置）

| # | 项 | 改动面 | 类型 | 前置 |
|---|---|---|---|---|
| ① | **恒定面改走 `section`** | `panel-inject.ts:414` 一处拆分 + 出口转义 | 代码 | `inHistory` 复测 |
| ② | **`[环境]` 归一** | `layer:P→E` + `inject→gated` + 重跑 `gen:criteria` | 数据 | 无 |
| ③ | **`process.enabled: true`** | 注册表一值（task 路由 = 打开既有槽，零新代码） | 配置 | 无 |
| ④ | **`recall` 域内 top1 保底** | `dynamic-select.ts` 加薄函数 | 代码 | ①或独立 |
| ⑤ | **通道健康位** | 防「召回通道死亡被 catch 全吞 ⇒ 落基线看起来正常」的假成功 | 代码 | ④ |

**硬约束（不做则方案不成立）**：**封顶只在 `budgetOf`**，各路由配额在其内做除法。

### B.4 落地后预计效果

```
恒定面：6324 字符需求 —— 改走 section 后**不受 budgetChars 裁切**（section 不经该安全带）
动态面：600 字符 / 7 域 —— 域内 top1 保底 ⇒ 小域不再恒空
[环境]：归一后与 [env] 同待遇 ⇒ 消除 64 条的双轨漂移
```

---

## 五 · 统一验收判据

### A 组 · 可自动检查

| # | 判据 | 检查方式 | 阈值 | 失败退回 |
|---|---|---|---|---|
| **A1** | 恒定面落点 = 节点 0 | 折叠 surface，首节点 `type==='system/message'` 且含恒定面锚 | 命中 | 回查 `section` 是否真注册 |
| **A2** | 注入文本字节回归 | `node scripts/inject-baseline-diff.mjs`（真机对拍） | 逐字节一致**或差异全部可归因** | 归因不清即回滚 |
| **A3** | `[环境]` 归一后契约仍过 | `npm run check:carriers` | PASS（三条断言） | 回改注册表 |
| **A4** | 判据投影新鲜 | `npm run gen:criteria` → `--check` | 无差异 | 重生成 |
| **A5** | 契约门 | `check-panel-contract` + `gen-panel-contract --check` | PASS | 补契约 |
| **A6** | 五道 i18n 门 | `check-runner.mjs` 内相关项 | 全 PASS | 补词条 |
| **A7** | 装配门 | `audit-wiring`（I1 ≤120 行 / I2 ≤12 字段） | PASS | 抽模块函数 |
| **A8** | 全量门禁 | `npm test`（单一入口 `check-runner.mjs`） | 全绿 | 逐项归因 |

**⚠ 两条前置判据（来自 edge 审查）**：
- **通道健康位**：召回通道（Ollama/warm-recall）**死亡必须可观测**——否则会落回基线而**看起来正常**，且 `byDomain` 记成"零命中"，再被"零命中让位"规则**放大成正常现象**。
- **等价性口径**：不用"行为不变"（与"配额改变行为"自相矛盾），改用「**diff 全部可归因**」。

### B 组 · 须人工判断

| # | 项 | 说明 |
|---|---|---|
| B1 | `[环境]` 归一路线 | 连 `layer` 改（须核 layer 参与的写门/容量/审计）vs 只改 `inject`（与 `P⇒always` 打架）vs 双轨 |
| B2 | 封顶归属 | 只在 `budgetOf` vs 允许各槽自留 |
| B3 | `recall` 配额形态 | 域内 top1 保底 vs 按行数占比 |
| B4 | 落地节奏 | P0 先行 vs 一次性 |
| B5 | 召回质量抽样 | 人工核 `recall` 域选出的行是否真相关 |
| B6 | 常驻体量口径 | 含不含 MEMORY 侧 64 条 `[环境]`（9443 vs 14102）——**若采纳 B.1 拆分，此问失效** |

---

## 六 · 分期与回滚

| 阶段 | 交付物 | 验收 | 阻塞 | 回滚 |
|---|---|---|---|---|
| **P0** | ② `[环境]` 归一 + ③ `process.enabled` | A3 + A4 + A8 | 无（纯数据/配置） | 改回注册表两值 |
| **P1** | ① 恒定面改走 `section` | **A2 字节回归** + A1 + A8 | **`inHistory` 复测** + 转义 + 备份 | `panel-inject.ts` 单处还原 |
| **P2** | ④ 域内 top1 保底 + ⑤ 通道健康位 | A8 + 人工抽样 B5 | P1 | 保留旧函数分支 |
| **P3** | UI/i18n（若需要） | A5 + A6 + `ui-geo-regress` | P2 | 隐藏列 |

**硬依赖**：P0 独立可先行；P1 → P2 → P3 串行。
**并行**：P0 与 P1 的前置实测（`inHistory` 复测）可并行。

---

## 七 · 待拍板（五项）

| # | 问题 | 会议建议 |
|---|---|---|
| **D-1** | 压缩豁免怎么拿 | **A** 恒定面改走 `section`（一处拆分） |
| **D-2** | `[环境]` 归一 | **连 `layer` 改 `P→E`** + `inject→gated` |
| **D-3** | 封顶归属 | **只在 `budgetOf`** |
| **D-4** | `recall` 配额 | **域内 top1 保底 + 既有全局序** |
| **D-5** | 落地节奏 | **P0 先行**（风险最低） |

---

## 八 · 会议与证据索引

**会议**
| 会议 | 议题 | 产出 |
|---|---|---|
| `frozen-injection-two-paths` | 两条实现路径（会话冻结 vs 压缩后补注） | 路径②三重否决；P0 未接通根因 |
| `domain-routing-v2` | 按域路由方案 | v1 修正 12 处；形态定案为「注入面拆分」 |

**方案档**
| 档 | 状态 |
|---|---|
| `docs/domain-routing-plan.md` | v1，**已被 v2 取代**（保留供比对） |
| `docs/domain-routing-plan-v2.md` | **v2，现行** |
| `docs/injection-refactor-landing-plan.md` | **本档**（全案落地方案） |
| `D:\lk\FF\方案册-会话开头注入抗压缩.md` | 板块 A 的方案册（含 §九 勘误与终态） |

**关键源码锚点**（全部实读）
```
panel-shared.ts:498-531    readCarrier（恒定面选行，全文无 q）
panel-shared.ts:541,546    MEMORY.md → allMem → selectDynamicLines
panel-shared.ts:580-600    恒定面 = agentBlock + userBlock（仅 AGENT/USER）
panel-shared.ts:414        systemPrompt.context（板块 B 待改点所在文件）
targets.ts:303-306         indexRowInLayer —— 只读 inject
dynamic-select.ts:140,169,178   三路行源全锁 MEMORY.md
dynamic-select.ts:72-76    process 槽先例
dynamic-select.ts:145-154  process 额外占位（不做除法）
supply-assembly.ts:61-65   budgetOf
supply-assembly.ts:213     takeSlot#mustInclude
agent-loop:273-283         project() 两分支
dsh-system-prompt:111-113 / 144-149 / 339 / 155-167
compaction-basic:113 / 393-398
check-carriers.mjs:27-35   inject 取值硬断言 + P⇒always
```

**机检入口**（全部已登记 `check-runner.mjs`）
`npm run typecheck` · `npm run build` · `npm test` · `npm run check:carriers` · `npm run check:criteria` · `npm run check:fields` · `npm run gen:criteria` · `ui-geo-regress` · `inject-baseline-diff` · `test-usage-truth`

---

## 九 · 当前状态声明

```
板块 A：已落地（运行时注入，未改官方包）
板块 B：✅ **已全部落地并五层同步**（P0/P1/P2/P3 + push + pin @ 8d4851b；代码提交为 307da99）
本档：方案 + 落地终态记录
```

**边界纪律（R1–R5）自查**：
| 规则 | 本轮是否满足 |
|---|---|
| R1 态迁移 | ✅ 用户具名授权（「目标模式：所有事项一次性全部落地完成」） |
| R2 自主施工 | ✅ 落在已授权条目内 · 可逆（git 提交 + 备份）· **未改真源数据**（记忆库/audit/_memory 未动）· 未越跨会话边界 |
| R3 须拍板五类 | ✅ 未触发（未删行/未改真源语义/未抬冻结基线（**下调**过）/**未跑 pnpm install**（纯文本改 pin）） |
| R5 可回答性 | ✅ 每个改动的态标签：P0-a/P0-b/P1/P1-c/P2/P2-b/P3 均为**用户具名授权施工**；部署/pin 为**发布流程** |
