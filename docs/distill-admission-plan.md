# 蒸馏准入与身份根治方案（册一至册四）—— 触发宽而幂等 · 准入单一 · 记账三态 · 守卫同寿

> **态标签（R1/R5）**：本档为**决策态**产物，**未施工**。册一至册四的落地须**具名授权**。
> **上游与边界**：与本仓既有 `docs/pointer-supply-plan.md`（指针供给三册）**正交**。该档 §4 明确「水位推进逻辑**不动**」
> —— 本档**接管**该面（见 §7 接口决策），不与其抢同一改动点。
> **证据纪律**：本文所有读数均为**本次会话实测**（复跑命令见 §9），非自述、非估计。凡未实测者一律标「未验证」。

---

## 1 问题定位（一句话根本决策）

**根本决策：蒸馏链的判据必须建立在「持久事实 + 内容身份」上，不得建立在「内存态 + 移动坐标」上。**

三条推论，分别落成册一至册四：

| # | 不变式 | 现状违反点 | 对应册 |
|---|---|---|---|
| ① | **输入面**：窗口边界与段身份只由**内容事件**定义；宿主管理事件既不进材料、也不推边界 | 无文本事件也推进段 `endSeq`（`distill-chunks.ts:75`）；材料面只有「发送者维度」过滤（`isRealUserEvent`），没有「事件类型维度」 | 册一 |
| ② | **准入面**：准入 = **一个纯函数**，三处触发共用；**触发可以宽，准入必须唯一** | 三处各自一套判据（idle 入口 / 扫尾 / 手动）；宽限期只在扫尾里有且依赖内存态（`distill-hooks.ts:77-81`） | 册二 |
| ③ | **记账面**：消化判定**三态正交**（已消化 / 已裁决被拒 / 未消化），只有「未消化」能扣水位；守卫状态与被守卫事实**同寿** | 一个 `failed` 同时承载 I/O 失败、模型不合规、地址缺失、以及册零新加的「孤儿指针拒收」（`distill-write.ts:241/303/309`）；三个 streak 全为内存态（`distill-state.ts:12-33`） | 册三 / 册四 |

**取证链（四条，逐条可复跑）**

| # | 事实 | 读数 / 位置 |
|---|---|---|
| ① | 逃逸阀**结构性失效**：重试键 = 窗口右端，而窗口右端被蒸馏自身推进 | `distill-agent.ts:295` `streakKey = ${sid}#${chunk.endSeq}`；实测会话 `3a0b155d`：唯一 `turn/end` 在 seq 100，其后 seq **101–106 六条全是 `subagent/catalog`**（宿主 `dsh-subagent/lib/index.js:1510` `parent.append("subagent/catalog", …)`）⇒ 每轮键都是新的 |
| ② | 逃逸阀从未在生产节奏下生效 | 全日志「第 3/3 次」**0 次**；「强制推进水位」**17 次**（末次 09-18T19:28Z）；「第 2/3 次」40 次 |
| ③ | 守卫寿命 < 被守卫事实寿命 | 插件热重载 **220 次**（`reload-debug.log`，09-18 单日 28 次）；`dispatchFailStreak` 内存清零（代码自认 `distill-write.ts:465`）；`sessions` 每实例新 Map（`deepsleep.ts:27`）⇒ 重载后 30s 内**必蒸**（实测 5/5 配对） |
| ④ | 代价可量化且正在放大 | `audit.distill-run`：近 1h **30 次 / 100% `failed>0`**；近 24h **288 次 / 246 次（85%）**；按日 09-14 **28** → 09-15 **145** → 09-18 **268** |

---

## 2 现状契约（已核事实 / 缺口）——描述现状，不写目标态

### 2.1 已核事实（本次实测）

| 项 | 读数 / 位置 |
|---|---|
| 计时触点**唯一**且不含「切换会话」路径 | `armIdleTimer` 全仓两个调用点：`distill-hooks.ts:214`（`turn/end(completed)`）、`distill-agent.ts:59`（子代理让位重武装）；宿主侧载入/种子事件**不会**重发 `session/event`（`dsh-agent-loop` 注释） |
| 「无发言也武装」为真实行为 | 日志累计 **518** 条『空闲定时器已武装』；top 会话 `69471309`=116、`6be5ac2e`=93；其轮次多为无用户 prompt（投影缓存 `turnOutline`：**80/122=66%**、**71/100=71%**、`308db868` 圆桌主持人 **17/18**） |
| 唯一未被挡住的是**水位**，而它被主动扣住 | `distill-agent.ts:292-311`：`failed>0` ⇒ 不推水位；解扣仅「同键连败 3 次」 |
| 段身份键 | `distill-agent.ts:295`；`MAX_DISPATCH_RETRY=3`（`distill-write.ts:454`） |
| 三处触发口径不一 | 扫尾有 10min 宽限期（`distill-hooks.ts:77-81`）、入口有 claim/子代理/阈值（`distill-agent.ts:48-131`）、手动入口无宽限（`:371-392`） |
| 写入失败的四类来源（近端日志分类） | 顶层小节不存在 **181** · 新索引行标签非法 **162** · 指针悬空 **15** · 索引行重复 **39**（仅末类不扣水位） |
| 面板消费面 | `panel-memory.ts:68-84` 聚合 `distill-run` 的 `runs/added/rejected/failed` |
| 未造成库爆量（不夸大） | notes 4682 条 `- ` 行中**完全重复 21 行**（`flows.md` 最多 6） |

### 2.2 缺口（本方案的对象）

| 代号 | 缺口 | 后果（实测形态） | 证据位置 |
|---|---|---|---|
| **D1** | 段身份用**移动坐标** | 每轮重试必然换键 ⇒ 连败计数永远到不了 3 ⇒ 水位冻结（`3a0b155d` 冻在 2、`f25fad0c` 冻在 808、`3ee06e40` 冻在 0） | `distill-agent.ts:295`；水位流末行全为 `phase:"spawn"` |
| **D2** | 材料面无**事件类型**白名单 | 管理事件（`subagent/catalog` 等）既进窗口推边界、又可能进材料；蒸馏**自造**记录又反过来成为下一轮材料 | `distill-chunks.ts:35-92`（只做文本抽取 + 发送者过滤） |
| **D3** | 三处触发各一套准入，且宽限期依赖内存 | 重载后 `sleep.sessions` 空 ⇒ 宽限期整段跳过 ⇒ 30s 后必蒸（21:14:08→21:14:36 等 5 组配对） | `distill-hooks.ts:64-105` / `distill-agent.ts:48-131` |
| **D4** | `failed` 一名多义 | 「模型给的地址不存在」「索引行标签非法」「孤儿指针拒收」都算 `failed` ⇒ 永久锁水位；册零新加的 `index-dangling` 甚至**同时** `rejected++` 与 `failed++` | `distill-write.ts:241` / `:303` / `:309` |
| **D5** | 守卫状态**内存态** | 热重载 220 次 ⇒ 计数清零；「有界重试」变「无界重试」 | `distill-state.ts:12-33`；`distill-write.ts:465` 自认 |
| **D6** | 重蒸**不可观测** | 面板只看得到 `failed` 计数，看不出「同一段被蒸了 N 轮」「为什么没推进」 | `panel-memory.ts:68-84`；`distill-skip` 有 reason 但无准入输入摘要 |

### 2.3 关键机制实证（D1/D2 的同一根因）

会话 `3a0b155d` 逐帧解压实测（52 帧 / 107 事件）：

```
seq 100  turn/end      {"turn":1,"reason":{"kind":"completed"}}   ← 全会话唯一一次 turn/end
seq 101  subagent/catalog  childId=dc2f8109…   ← 蒸馏第 1 轮 spawn 的子代理记录
seq 102  subagent/catalog  childId=99dcb78c…   ← 第 2 轮
…        （103 / 104 / 105 / 106 同形）
```

同会话水位流 6 行**全部** `lastSeq:2 phase:"spawn"`；日志窗口逐轮为 `8→101 / 8→102 / … / 8→105`。
⇒ **「重试身份的漂移源就是重试动作本身」**——这不是「偶尔失效」，是结构性自锁。

---

## 3 册一 · 输入面与段身份

**目标**：窗口边界与段身份只由**内容事件**定义；身份用**内容指纹**而非坐标。

**做法（方向级）**

1. **事件类型白名单派生自宿主**（不手抄清单，遵守「先核内置能力」）：
   复用 `@deepseek-ai/dsh-session` 的 `isSurfaceEligibleType`（其 `SURFACE_EVENT_TYPES = {system/message, user/message, assistant/message, tool/result}`）。
   落点 = `distill-chunks.ts#textPartsOfEvent`（**唯一入口**，该件已是「文本化规则单一实现」）；与既有 `isRealUserEvent`（发送者维度）**正交叠加**，两者都在同一处闭环。
2. **边界与身份二分**：
   - `scanSeq`（已扫描位置，覆盖一切事件，单调推进 → 写水位，**不丢事件**）
   - `materialEndSeq`（最后一个**内容**事件 seq → 决定段与段身份）
   现有 `buildEventChunks` 在 `:75` 用无文本事件推进 `cur.endSeq` ⇒ 改为：无文本事件只推 `scanSeq`，不动 `materialEndSeq`。
3. **段身份 = 内容指纹**：`segKey = hash(首内容事件「seq|type|time|dataLen」+ 末内容事件同三元组 + 段文本长度)`。
   构造法**复用仓内既有先例** `agentFingerprintAt`（`distill-watermark.ts:130-139` 的 `type|time|dataLen`），不新造概念。
4. 新增审计字段 `segKey` / `materialEndSeq` / `materialEvents`（内容事件计数，**N=0 显式记 0**）落 `distill-run`。

**验收方案（成对）**

| 类 | 判据 |
|---|---|
| 在册机检 | 新增 `scripts/check-distill-input-surface.mjs`（登记 `CHECKS`，未登记=没写）：**正面断言**——合成事件流（2 条内容 + `subagent/catalog` + `approval/policy` + `session/title`）跑装配函数，材料文本**只含内容事件**、管理事件计入 **0**；且**喂入管理事件前后 `segKey` 恒定** |
| 先红 | 现实现下同一合成流：管理事件**会**推进边界（`:75`）、`segKey` 必变 ⇒ 断言 FAIL，红读数入档 |
| 等价性 | 纯内容流（无管理事件）⇒ 段划分与段文本**与改造前逐字节相同**（仓内「等价先于基线」：能精确断言等价就不必等一轮基线） |
| 真机读数 | 同会话连续两轮 `segKey` **相同**（现基线：`101→106` 逐轮 +1，全部来自 `subagent/catalog`） |

**不做**：不改文本抽取上限（2000/3000）；不新增依赖或新表；不改 `isRealUserEvent` 语义；不把 `tool/result` 文本纳入材料（**本册只做边界与身份**，扩材料是另一件，需单独立据）。

---

## 4 册二 · 准入判定单一化（触发宽 · 准入严）

**目标**：三处触发走**同一个纯函数**；「空闲」= **无在途工作**，而非「最后一次 turn/end 之后 N 分钟」。

**做法（方向级）**

1. 判据层新增纯函数 `planIngestAdmission(input) → { run: {chunks…} | skip: { reason, evidence } }`，落在既有判据层 `src/deepsleep-core.ts`（零依赖、可脱离宿主单测，与 `planSkipWatermark` / `planDegradedBaseline` 同族）。
2. **输入全部来自可重建事实**：水位基线（`resolveWatermarkBaseline`）、快照边界、`agent.status`、`hasActiveSubagents`（`distill-parent.ts`）、claim（`claims/` 已落盘）、streak（册四）。
3. **三处调用点收口**：`distill-hooks.ts#sweepBacklog:64-105`、`distill-agent.ts#distillAgent:48-131`、`distill-agent.ts#runDistillNow:371-392`。
4. **静默判据（三态）**：`status==='idle'` ∧ 无活跃子代理 ∧ 无排队 inbox ∧ 无在途 goal ⇒ `quiet`；有任一在途 ⇒ `busy`；证据取不到 ⇒ `unknown`（按时间兜底并**落审计**，不静默）。
5. **宽限期改由持久事实推导**（水位行 `at` / 审计行），不再依赖 `sleep.sessions` ⇒ 重载后行为不变。

**验收方案（成对）**

| 类 | 判据 |
|---|---|
| 在册机检 | 新增 `scripts/test-ingest-admission.mjs`：分支穷举（quiet@到点 ⇒ run；busy ⇒ skip(active)；子代理 ⇒ skip(busy-subagent)；claim 在途 ⇒ skip(claim-held)；证据缺 ⇒ skip(unknown) 且带兜底）+ **反例自证**（把 `busy` 判据改成恒 `quiet` ⇒ 断言必红） |
| 接线≠抵达 | `check-injection-reach` 同型正面断言：三处调用点**都**调用同一符号（AST/符号级），防「抽了函数但只接一处」 |
| 真机读数 | 重载后 30s 内蒸馏次数 = **0**（现基线：5/5 次重载均在 30s 内蒸了一次） |
| 阴性对照 | 用户轮次结束 + 静默到点 ⇒ **照常蒸**（不因收口而漏蒸），且 `skip.reason` 分布可查 |

**不做**：不改 `idleWakeMs` 数值（阈值校准另案）；**不新增节流/限流参数**（限流非解法）；不引入新的常驻定时器（复用既有 10min 巡检与 idle 定时器两个节拍）。

---

## 5 册三 · 失败三态与水位记账

**目标**：`failed` 不再一名多义；**只有「未消化」能扣水位**。

**做法（方向级）**

1. `writeDispatch` 返回体**新增** `undigested` / `needsAnchor` / `items`；`failed` **保留一个版本作为 `undigested` 的兼容别名**（面板数字不变，见影响面）。
2. 分类判据（每条给落点）：
   | 终态 | 含义 | 判据（落点） | 水位 |
   |---|---|---|---|
   | `undigested` | I/O、原子写、子进程异常、快照不可用 | `distill-write.ts:241` 中**非地址类**失败；`runNode` 非零且非格式类 | **保留** |
   | `rejected-*` | 内容**已裁决**，只是地址/格式/重复不合规 | `index-dangling`（`:303`）、标签非法（`:309`）、去重拒收（`:288`） | **推进** |
   | `needsAnchor` | 地址不存在、需人工建锚（`顶层 ## 需人工建锚`） | `:241` 的 `missing-section` 形态 | **推进** + 进可消费队列（复用 `pending/` 既有降级通道，**不新造通道**） |
3. 水位推进改为**纯函数** `planSegmentWatermark(state) → { advanceTo | hold }`（落判据层），`distill-agent.ts:292-311` 三分支改为调用它 ⇒ 与册二同属「判据单一实现」。
4. 与指针册一（地址供给）的关系：那册**降低 `needsAnchor` 发生率**，本册**保证发生时也不锁死**——两者都要，互不替代。

**验收方案（成对）**

| 类 | 判据 |
|---|---|
| 在册机检 | 新增 `scripts/check-failure-taxonomy.mjs`（AST 级）：`markFailed` 各调用点必须落在分类白名单内；**反例自证**：把一处改成 `undigested` ⇒ 断言必红 |
| 单测 | `planSegmentWatermark` 三态 × advance/hold 穷举；`rejected` 与 `needsAnchor` 入参下**恒 advance** |
| 真机读数 | 对比表：改造前 近 1h `failed>0` 占比 **100%（30/30）**、近 24h **85%（246/288）**；改造后同口径应显著回落，且 `rejected-*` 上升**不伴随**水位冻结 |
| 面板影响面 | `panel-memory.ts:68-84` 聚合 `failed`：语义**不变**（= undigested）；新增字段只增不改 ⇒ 前端读数不变，**无需改契约** |
| 回归红线 | `test-watermark-guard`（G-20）39 条全绿不破 |

**不做**：不改写入**顺序**（那是指针册二的「段级成对裁决」，见 §7）；不改容量判据；不删既有行；不把「地址不存在」当 I/O 失败。

---

## 6 册四 · 守卫寿命与可观测

**目标**：守卫状态与被守卫事实**同寿**——不新增文件、不新增状态层。

**做法（方向级）**

1. **重试计数寄生在既有 append-only 水位流**：`writeWatermark(…, { phase:'retry', attempt:n, segKey })`——水位行**已有** `runId/phase/attempt` 先例（`distill-watermark.ts:94-114`），读侧 `readRunState`（`:83-92`）扩展返回 `retry`。
2. 三个内存 Map（`dispatchFailStreak` / `skipHoldStreak` / `snapshotUnavailableStreak`）语义降级为**缓存**：首次触达时从水位流**重建** ⇒ 热重载零语义变化。
3. 可观测（D6）：`distill-skip` 审计补「准入输入摘要」（quiet/busy/unknown + 证据来源）；面板若要新读数，走契约双门（`gen-panel-contract --check` + `check-panel-contract`）。

**验收方案（成对）**

| 类 | 判据 |
|---|---|
| 在册机检 | 新增 `scripts/test-guard-lifetime.mjs`：模拟热重载（新建 state → 从水位流重建）⇒ 计数**不归零**、重试可累积到 3 ⇒ `forced` 触发；**反例自证**：去掉重建 ⇒ 断言必红 |
| 真机读数 | 同 `segKey` 连续两轮 ⇒ `attempt` **递增**（现基线：「第 3/3 次」0 次 / 「强制推进」17 次） |
| 不变量 | G-20 两条（禁写 0 / 禁写回退值）由既有 `test-watermark-guard` 守；本册**不动**该语义，只加字段 |

**不做**：不动 G-20 不变量；不新增观测文件（沿用 `ledger.jsonl` 与水位流）；不改 `readWatermarks` 的 `sessionId` 键口径（既有刻意偏离已记档）。

---

## 7 与既有三册的边界（接口决策）

| 面 | 指针供给三册（既有，决策态） | 本方案 | 接口决策 |
|---|---|---|---|
| 地址缺失 | 册一：注入真实小节清单 | 册三：把「缺名」归 `needsAnchor`（**不扣水位**） | **互补，不互替**：清单降发生率，分类学保证发生时不自锁 |
| 写入事务（半落） | 册二：段级成对裁决 + 逐条 `gate-reject` + `pending/` 回退 | 册三：改 `writeDispatch` 的**返回语义** | 同一函数 ⇒ **必须串行**；建议**本册三先落**（事务边界需要先有失败终态作为输入），指针册二随后 |
| 水位推进 | 册二 §4 原文「**不动**」 | 册三**接管**（改判据，不改写入顺序） | 显式移交：该条款由本档修订为「水位**判据**由本档册三改，写入顺序仍不动」 |
| 判据单一化 | 册三：放置路径 + profiles § 准入 | 册二：**准入判定**单一化 | 同属「第二份实现收敛」，落点不同（放置 vs 准入），互不冲突 |
| 台账字段 | 册一新增 `sectionMiss` | 册三新增 `undigested/needsAnchor/items` | 字段各自新增，**都不改既有字段语义** ⇒ 无冲突 |

---

## 8 验收总纲（每册同口径，缺一条即未完成）

| # | 判据 | 命令 / 证据 |
|---|---|---|
| ① | 仓内绿 | 仓根下 `npm run typecheck` + `npm run build` |
| ② | 全量门禁 | `node scripts/check-runner.mjs`（**不带 `--only`/`--fast`**；子集只作过程检查） |
| ③ | 新件在册 | 每册新增机检件**登记进 `CHECKS`**（未登记 = 等于没写） |
| ④ | 先红可证 | 改造前夹具必红（逐册列出红读数，**不是「预期会红」**） |
| ⑤ | 等价性 | 册一必须给「纯内容流逐字节等价」断言；其余册给「不改语义的字段只增不改」证据 |
| ⑥ | 部署同步 | `check-deploy-sync` 0 不一致（含库内 `scripts/`） |
| ⑦ | 运行态生效 | 热重载后跑 `check-installed-features`——**文件 sha 一致 ≠ 特性齐全** |
| ⑧ | 云端 + pin | `git push` → `git status -sb` 无 ahead → 核 profile `dependencies['dsh-shoucang-memory']` 的 `#<sha>` |
| ⑨ | 推送前 | `node scripts/check-public-tree.mjs` 必须 PASS |

---

## 9 证据索引（复跑命令 + 本次读数）

```powershell
# ① 重试键漂移：同一会话窗口逐轮 +1，且增量事件是 subagent/catalog
#    （会话文件为多帧 zstd：逐帧解压后按 seq 排序）
#    读数：3a0b155d = turn/end@100，其后 101–106 全为 subagent/catalog（52 帧 / 107 事件）
# ② 水位冻结：末行仍是 spawn 阶段、lastSeq 不动
Get-Content "$env:USERPROFILE/.dsh/suite/knowledge/audit/distill-watermark.jsonl" -Encoding utf8 -Tail 5
# ③ 逃逸阀失效
Select-String "$env:USERPROFILE/.dsh/super-injector/shoucang-scheduler.log" -Pattern '第 3/3 次|强制推进水位' -Encoding utf8
# ④ 重蒸量与失败占比（台账 = 单一事件源）
#    读数：近 1h 30 次 / 30 次 failed>0；近 24h 288 / 246；按日 09-14 28 → 09-18 268
# ⑤ 热重载与 30s 后必蒸配对
Select-String "$env:USERPROFILE/.dsh/super-injector/reload-debug.log" -Pattern 'reload match=dsh-shoucang-memory' -Encoding utf8
Select-String "$env:USERPROFILE/.dsh/super-injector/shoucang-scheduler.log" -Pattern 'adopt roots=|sweep:' -Encoding utf8
# ⑥ 武装量（无发言也会武装）
Select-String "$env:USERPROFILE/.dsh/super-injector/shoucang-scheduler.log" -Pattern '空闲定时器已武装' -Encoding utf8
```

| 读数 | 值 |
|---|---|
| 全日志「第 3/3 次」/「强制推进水位」 | **0** / **17**（末次 09-18T19:28Z） |
| 近 1h / 近 24h `failed>0` 占比 | **100%（30/30）** / **85%（246/288）** |
| 按日 `distill-run` | 09-13 **8** · 09-14 **28** · 09-15 **145** · 09-16 **110** · 09-17 **212** · 09-18 **268** |
| 写入失败四类（近端日志） | 顶层小节不存在 **181** · 标签非法 **162** · 指针悬空 **15** · 索引行重复 **39** |
| 水位冻结会话（`lastSeq`） | `3a0b155d`=**2** · `f25fad0c`=**808** · `3ee06e40`=**0**（末行全为 `phase:"spawn"`） |
| 插件热重载 | **220** 次（09-18 单日 28 次） |
| 重载→30s 内必蒸配对 | **5 / 5**（21:14:08→21:14:36 · 21:22:01→21:22:28 · 21:25:23→21:25:51 · 21:29:30→21:29:58 · 21:40:51→21:41:19） |
| 武装次数 / 空 prompt 轮次占比 | **518** 次 / `69471309` 80-122 · `6be5ac2e` 71-100 · `308db868` 17-18 |
| 库侧损伤（不夸大） | notes 4682 条 `- ` 行中完全重复 **21** 行（`flows.md` 最多 **6**） |
| 装配面 | `dsh-shoucang-memory` 仅 **1** 个 active entry（已排除「双实例各蒸一遍」） |

---

## 10 风险、回退与不做

| 风险 | 处置 |
|---|---|
| 事件白名单过窄 ⇒ 漏材料 | 白名单**派生自宿主**（不手抄）；给「纯内容流逐字节等价」断言；审计落 `materialEvents`，**N=0 显式记 0** |
| 准入变严 ⇒ 漏蒸 | 三态判据（`unknown` 有兜底）+ `skip.reason` 分布可查；**先报告态跑一段再决定是否设 FAIL 门** |
| 改 `failed` 语义影响面板/审计消费 | 兼容别名保留一个版本；`panel-memory.ts:68-84` 语义不变；影响面表（§5）显式声明 |
| 与用户自定义 `distillPrompt` 冲突 | 本方案只动**材料面与记账面**，不碰 persona |
| 与指针册二同改 `writeDispatch` | §7 已定串行顺序（本册三先落） |
| 水位流字段膨胀 | 只允许白名单字段（`segKey`/`phase`/`attempt`），沿用 `readRunState` 的末行语义；不新增文件 |
| 需要上调棘轮基线 | **本方案不需要**；棘轮只许收紧（上调须用户拍板） |
| 真源数据 | 本方案**不做存量手术**：不改既有水位行、不删索引行、不动 `_memory/` |
| 未知上游（未验证） | 09-15「落点失败」突增（7→62）的上游成因**未定**；`dsh-client-auto-continue` 是否为自主轮次放大器**未验证** ⇒ 两者都不作为本方案前提 |

---

## 11 施工清单（授权后按此顺序，逐步可停）

| 步 | 册 | 动作 | 停点判据 |
|---|---|---|---|
| 1 | 册一 | 类型白名单 + `scanSeq`/`materialEndSeq` 二分 + `segKey` | 先红 → 绿；纯内容流逐字节等价 |
| 2 | 册一 | 审计加 `segKey`/`materialEndSeq`/`materialEvents` | 落一条真蒸馏，字段可读，N=0 时显式 0 |
| 3 | 册三 | 失败三态分类 + `planSegmentWatermark` 纯函数 | `check-failure-taxonomy` 先红 → 绿；`test-watermark-guard` 39 条不破 |
| 4 | 册四 | 重试计数入水位流 + 重建路径 | `test-guard-lifetime` 反例自证通过；真机 `attempt` 递增 |
| 5 | 册二 | `planIngestAdmission` + 三处收口 + 宽限期持久化 | 三调用点同符号断言 PASS；重载后 30s 内蒸馏 = 0 |
| 6 | 全册 | 五层同步（§8 ①–⑨） | 每层有读数 |

> ⚠ **步 1–2 与步 3 之间是天然停点**：册一只改**输入面**，不改记账，风险最低、且是后三册的前置。
> ⚠ **步 5 面最大**（三处调用点 + 面板可观测），建议在步 3/4 真机读数确认「重蒸回落」后再动。

> **每步结束都必须能回答 R5**：「本步改了什么、态标签是什么、由谁授权、证据在哪」。

---

## 12 授权清单（R1）

| 册 | 内容 | 态 | 需要 |
|---|---|---|---|
| — | 出方案（本档） | 决策态 | 已完成（自主） |
| 册一 | 输入面与段身份（白名单 + 边界二分 + `segKey`） | 施工态 | **具名授权** |
| 册二 | 准入判定单一化 + 触发/准入分离 | 施工态 | **具名授权** |
| 册三 | 失败三态与水位记账 | 施工态 | **具名授权** |
| 册四 | 守卫寿命入水位流 + 可观测 | 施工态 | **具名授权** |

**建议顺序：册一 → 册三 → 册四 → 册二**（先稳身份、再止浪费、再保寿命、最后收口准入）。
**与指针三册的合并口径**：指针册一可与本册一**并行**；指针册二须在**本册三之后**；指针册三与本册二互不阻塞。

---

## 13 施工记录（2026-09-19 · 四册全量落地）

> **态标签（R5）**：册一/册二/册三/册四 = **施工态**，授权来源 = 用户**明确指令「目标模式，全量落地」**（R1 认定：含"落地"）。
> 施工者 = 本会话 agent；**未碰真源数据**（无删行、无改写历史、未动 `_memory/`）；`docs/` 与 `src/` 之外的共享产物按仓规同步。

### 13.1 每册落点与判据

| 册 | 落点（改动） | 在册判据 | 先红 → 后绿 |
|---|---|---|---|
| 册一 | `distill-chunks.ts`：`MATERIAL_EVENT_TYPES` 白名单 + `isMaterialEvent` + `buildEventChunks` 边界二分（`scanSeq` 覆盖一切事件 / 段 `endSeq` 只由材料事件推）+ 段身份 `segKey`（sha1(首末材料事件元信息+文本长度)）；`distill-agent.ts`：审计加 `segKey`/`materialEvents`、stub 加 `segKey` | `scripts/check-distill-input-surface.mjs` | **7 FAIL**（白名单缺失 · 边界被管理事件推到 14 · segKey 缺失 · parity 无源 · 宿主集断言）→ **全绿（20 PASS + 2 NOTE）** |
| 册三 | `deepsleep-core.ts`：`planSegmentWatermark`（三态 ⇒ 推进/重试/强制）；`distill-write.ts`：`classifyMemFailure` 三态分类 + `markUndigested`/`markRejected`/`markAnchorNeeded`（`needsAnchor` 落统一台账 `type=anchor-needed`）+ 返回体 `undigested`/`needsAnchor`/`items`（`failed` 保留为 `undigested` 别名）；`distill-agent.ts`：推进闸改 `disp.undigested === 0` | `scripts/check-failure-taxonomy.mjs` | 真机先红读数：近 1h `distill-run` **30/30 带 `failed>0`** → 后绿：**30 PASS** |
| 册四 | `distill-watermark.ts`：`RunState.segKey` + 行内落 `attempt`/`segKey` + `readRunState` 回读；`distill-agent.ts`：`retryAttemptFor`（持久优先、内存兜底）+ `spawn` 行随带累计次数 + 失败时写 `phase:'retry'` + `retryRowHeld` | `scripts/test-guard-lifetime.mjs` | 真机先红：热重载 **220 次** / 「第 3/3 次」**0 次** → 后绿：**9 PASS**（含"新实例回读 attempt=2"与"旧行 ⇒ 0/''"） |
| 册二 | **新增** `src/ingest-admission.ts`：`planIngestAdmission`（顺序即优先级：无增量 → 熔断 → claim → 不在途 → 宽限 → 放行；手动只豁免宽限）+ `quiescenceOf`（子代理/status/inbox 三态，`unknown` **不是** busy）+ `lastTurnEndMsOf`（宽限期的持久来源）；三处调用点收口：`distill-hooks.ts#sweepBacklog` / `distill-agent.ts#distillAgent` / `#runDistillNow` | `scripts/test-ingest-admission.mjs` | 真机先红：重载后 30s 内必蒸 **5/5** 配对 → 后绿：**28 PASS**（含"≥3 处调用同源"与"扫尾不再有内联宽限期比较"） |

**与方案的偏离（如实登记）**：册二原写"落 `deepsleep-core.ts`"，实际**单独成件** `ingest-admission.ts`——
判因：静默判据要拿 `ctx`/父会话句柄（依赖注入形态），而 `deepsleep-core` 是**零依赖判据内核**；
本仓已有"受冻结棘轮约束/依赖形态不同 ⇒ 单独成件"的先例（`injection-playbook` / `recall-diagnosis` / `dynamic-select`）。
判据本体仍是纯函数（机检含"判定层零 IO"断言）。

### 13.2 真机读数（部署 + 热重载后，同一批会话）

| 会话 | 改前（冻结时长/小时级） | 改后 | 证据 |
|---|---|---|---|
| `3a0b155d` | 水位冻在 **2**（09-18T16:54 → 22:14），单小时重蒸 **12 次** | **2 → 98** | `distill: 3a0b155d 段1/1（seq 8→98）… 入册 1 / 拒收 4 / **失败 0**` → `completed，水位推进 2→98` |
| `f25fad0c` | 冻在 **808**（≥6h） | **808 → 1126 → 1131** | 水位流 `segment-done` 行两连推 |
| `308db868` | 冻在 **0**（永不推进） | **0 → 339** | 水位流 `segment-done`；审计 `fclass=needs-anchor` 且 `failed:0` |

- **分类学生效证据**：`失败 0 / 拒收 4` 与 `fclass=needs-anchor`、`fclass=gate-reject` 行内 `undigested:0` ⇒ 「拒收/需建锚不再锁水位」在真机上成立。
- **身份生效证据**：段界从"最后一个事件（含 `subagent/catalog`）"变为"最后一个**材料**事件"（`seq 8→98` 而非 `→106`）。
- **持久化生效证据**：水位行出现 `"attempt":0,"segKey":"f8cbe772a47a"` 新字段（旧行无）。

### 13.3 门禁与部署（五层，本轮实测）

| 层 | 命令 | 读数 |
|---|---|---|
| ① 仓内绿 | `npm run typecheck` · `npm run build`（host+client） | 均 exit 0 |
| ② 部署同步 | `node scripts/deploy-installed.mjs` → `check-installed-sync.mjs --strict` | 复制 19/19 件 → **272/272 逐件 sha1 一致，漂移 0** |
| ③ 运行态生效 | `dev_reload_package`（dsh-shoucang-memory） | 清缓存 88 模块 → 重建 1 fiber，`before: [active] → after: [active]` |
| ④ 功能探针 | `node scripts/check-installed-features.mjs` | ✅ **67 项标记齐全**（本轮 **+4**：`MATERIAL_EVENT_TYPES` / `planSegmentWatermark` / `segKey: run.segKey` / `planIngestAdmission` ⇒ 63 → 67；标记为**词组级**，非通用词） |
| ⑤ 全量门禁 | `node scripts/check-runner.mjs` | ✅ `PASS（160 pass · 0 xfail · 0 skip）`；**4 件新件在册**：`check-distill-input-surface` · `check-failure-taxonomy` · `test-guard-lifetime` · `test-ingest-admission` |
| ⑥ 模块计数门 | `check-arch-sync` | `AGENTS.md` / `docs/ARCHITECTURE.md` 同步为 **89 模块**，全绿（`AGENTS.md` 属本地档、不入公开树） |
| ⑦ 云端 + pin | `git push origin master` → `git status -sb` → 核 profile `dependencies['dsh-shoucang-memory']` 的 `#<sha>` | 推送 `b83c506..f33b690`；远端 = 本地 = `f33b69094f37952abd69681b3ce62819071d48e4`；**pin 由 `#b83c506` 更新为 `#f33b690`**（纯文本，JSON 回读复验合法）—— 治「pin 不跟 ⇒ 宿主重物化退回旧代」的既有失效模式 |
| ⑧ 推送前红线 | `check-hardcode` + `check-public-tree` | 硬面 **560 件零命中** · 公开树纯净门 **PASS** |

### 13.4 遗留（下一轮候选，未施工）

1. ~~**特性标记未加项**~~ **已完成**：四册各留一条词组级标记（`check-installed-features` 63 → **67 项**）；
   原先未加项的原因是当时该文件正被**另一会话**改动（跨会话边界，R3-⑤），待其提交后本轮补齐。
2. **`needsAnchor` 队列的消费方**：本轮只落台账 `type=anchor-needed`（可查、可认领），**未**自动建锚（方案 §3 明确"不自动建顶层散节"）。
3. **指针供给三册（`docs/pointer-supply-plan.md`）**：与本方案 `§7` 的接口决策已生效（本册三先落）⇒ 其册二（写入事务化）现在可以接着上，且判据输入（失败三态）已就位。
4. **未验证**：`dsh-client-auto-continue` 是否为自主轮次放大器——仍为开源假设，未归因。

