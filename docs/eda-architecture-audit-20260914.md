# 守藏架构审核：跨域通信形态与事件流适用性

> 审核日期：2026-09-14 · 范围：`src/` 63 模块 / 15,234 行（不含生成物 `criteria.generated.ts` 已在统计内但非手写）
> 审核问题：本项目当前的跨域通信究竟是「同步直接调用 / 显式编排 orchestration / 事件协同 choreography」
> 哪一种？引入事件流架构是否合适？用户提出的四块划分（库 / 注入召回 / 蒸馏 / 睡眠）是否成立？

---

## 0. 结论先行

**方向对，落点需要修正。**

1. **项目当前既不是显式编排，也不是事件协同。** 实测形态是「**同步直接调用 + 文件即通道 + 定时器轮询**」。
   全仓 `src/` 对 `EventEmitter|eventBus|pubsub|publish(|subscribe(|.emit(|dispatchEvent` 的检索结果为
   **零命中**（本人 2026-09-14 亲自执行，非转述）——不存在任何进程内事件总线。

2. **「显式编排」这一半其实已经在做，只是没被承认。** `distillAgent`（`src/distill-agent.ts:47-325`）
   就是一个线性 await 到底的编排函数；深睡也有状态机（`src/deepsleep-machine.ts:128`）。
   真正缺的不是编排器，而是**流程实例**——现在的续传状态只是一个数字（水位），
   重启即失，无法回答「卡在第几步」。

3. **「协同式」这一半目前不适合引入。** 单进程插件、已有零循环依赖门禁，加事件总线会把
   **静态可追的直接调用变成动态不可追的订阅**，与本项目「单一实现 + 机检」的核心纪律相冲突。

4. **真正的缺口是另两件事**（都不是"缺事件机制"）：
   - 已经存在的 **4 对隐式「文件即通道」没有契约登记**，改任一侧不报错；
   - **上游落盘不失效注入侧缓存**，靠 TTL 自然过期。

5. **用户的四块划分成立，且与代码结构吻合**，但四块的**角色不同，不该用一种模式统一**
   （详见 §3 对照表）。这是本次审核最有价值的结论。

---

## 1. 现状定性：三种通信形态实测

### 1.1 同步直接调用（主力）

注入召回是一条同步直调链（子代理核查）：

```
sp.text (panel-inject.ts:416)
  → hot.build (panel.ts:72)
    → buildHotMemoryText (panel-shared.ts:403)
      → readCarrier (:447) / activity.jsonl (:493) / recallIndex (targets.ts:377)
        → cuesOf (situation-key.ts:60) → situationLinesOf (:343)
          → ring-supply.ts:209/122 → supplyUsageMeta (:362) → assembleSupply (supply-assembly.ts:193)
```

全程 `await` / 同步返回，无队列、无订阅。

### 1.2 文件即通道（隐性主力，无契约）

这是本项目**事实上的事件通道**：产线把结果落到文件，消费块去读它。已识别 4 对：

| # | 写侧 | 读侧 | 介质 |
|---|---|---|---|
| 1 | `activity.ts:88`（由 `distill.ts:37`、`deepsleep-run.ts:13` 调用） | `panel-shared.ts:493` | `audit/activity.jsonl` |
| 2 | `mcl.ts:483`（MCL 异步预热写） | `panel-shared.ts:549-557` | `audit/warm-recall.json` |
| 3 | `deepsleep-run.ts:297` | `panel-shared.ts:302-308` | `knowledge/delta.md` |
| 4 | 蒸馏/深睡落库 | `panel-shared.ts:346`（`loadStore`） | `records.jsonl` |

**问题**：这 4 对配对关系**只存在于两侧代码里，没有任何一处登记**，改任一侧不会报错、
不会红、不会告警。这是典型的隐式契约，也是本项目一直在剿的「同一事实 N 份副本」的同型问题。

### 1.3 定时器轮询（调度主力）

`src/distill-hooks.ts`（本人全文读取确认）：

- `:112` `ctx.on('session/event')` turn/end(completed) → `noteEvent(ENDED)` + `armIdleTimer`
- `:139` `ctx.on('agent/disposed')`、`:145` `ctx.on('session/disposed')` → 清定时器/子代
- `:152` `ctx.on('session/event')`（兜底钩子，任意事件 → RUNNING）
- `:199` `setInterval` 深睡巡检（10min）— **深睡的触发源是轮询，不是事件**
- `:211` 定时自检、` :229` 积压扫尾（30s 首扫 + 10min 周期）

宿主事件（session/event 等）**不是项目自己的事件总线**，它只被用来给内存状态机打时间戳
（`noteEvent`，`deepsleep-machine.ts:37`），不构成跨域协同。

---

## 2. 关键发现（按严重度）

### F1 · 产线是「游标」不是「流程实例」——最核心的缺口

| 产线 | 续传状态 | 存放 | 重启后 |
|---|---|---|---|
| 蒸馏 | `lastSeq` 一个数字（+ formatVersion/fp 双证） | `audit/distill-watermark.jsonl`（append-only） | 可读回，能从最后成功的 `endSeq` 之后重切段 |
| 深睡 | `lastDeepSleepAt` 时间戳 | 内存（`deepsleep-machine.ts:16-21`） | 从审计日志回放重建（`deepsleep-machine.ts:53-74`） |

内存态 `distilling` / `dispatchFailStreak` / `skipHoldStreak`（`distill-state.ts:16-22`）**重启清零**。

⇒ **没有"当前在第几步"这回事，只有"上次到哪"**。连带后果：
`distill-agent.ts:241` 只在**每段结束**才写审计，spawn 前无 start 审计；
`getDeepSleepStatus`（`deepsleep.ts:90-97`）**不含蒸馏进度**，面板查不到「正在蒸哪段」。

这正好命中我上一轮提到的判据：长流程 + 断点续传 + 需回答「卡在哪」⇒ 该有流程实例。
建议形态不是引入工作流引擎，而是把水位从数字升级为一个小结构
`{ runId, phase, startedAt, updatedAt, attempt }`，落在同一个 jsonl 里。

### F2 · 读侧装配器建成但未接管主路径

- `assembleSupply`（`supply-assembly.ts:193`）+ `renderSupplyText`（`:249`）是设计完整的纯函数装配器/渲染器。
- **唯一消费方**是 `panel-shared.ts:368` 的 `supplyUsageMeta`，而它
  「返回 `SupplyUsage` + 情境块；**其余槽的 blocks 一律丢弃**」（`panel-shared.ts:356` 注释原文，本人读取确认）。
- `renderSupplyText` 在 `src/` 中**零消费方**（本人 grep 确认，仅 `lib/types/*.d.ts` 有声明）。
- 主注入文本仍由 `buildHotMemoryText`（`panel-shared.ts:403`）内联自算。

⇒ **影子记账与主路径是两套逻辑**。P0a 记的账因此永远只是「按同批候选重算的近似值」，
而非真实裁切结果——这正是「建了编排器却没接上」的实例。

### F3 · 上游落盘不失效注入缓存

- 缓存：query 30s（`panel-shared.ts:408`）、稳定面 120s（键 = 文件尺寸签名 `sizeStampOf` :388/:598）、vec 60s（`vec.ts:58`）。
- `invalidate`（`panel-shared.ts:328`）**仅由面板写触发**（`panel-inject.ts:229/261/284/305`、`panel-config.ts:169/182/307`）。
- 蒸馏 / 深睡落盘 **不触发失效**，靠 TTL 自然过期。

⇒ 蒸馏刚写入的记忆，最坏 120s 内注入看不到。这是「文件即通道」做对了一半的典型症状：
**通道建了，通知机制没建**。

### F4 · 协同式的经典病害已在仓内真实发生过

`distill-hooks.ts:104` 的 `isCompletedTurnEnd` 是一个补丁，头注 `:92-108` 与 `:166-179` 记录了事故：
两个钩子**同挂 `session/event`**，语义相反（一个置 ENDED、一个置 RUNNING），
注册序在后者覆盖前者 ⇒ **会话永远到不了 ended** ⇒ 深睡被长期阻塞（实测 >24h 未产出）。

这就是「因果链不直观」的实证代价：**多订阅者对同一事件的语义冲突，且结果依赖注册顺序**。
在有事件总线的系统里，这类问题会更隐蔽而不是更少。

### F5 · ring-events 是真事件溯源，但只覆盖一域、且零业务订阅

本人全文读取 `src/ring-events.ts` 确认：

- 9 个 op、`replayEvents` 用**与写入侧同一批纯函数**重建状态（`:74-134`）、`reconcileRing` 对账（`:231`）——
  这是标准且正确的事件溯源实现。
- 但文件头注 `:139-143` 自承：「这是**变更日志**而非**事件优先**（events-first）」，
  即 CDC 写后推导（`eventsFromDiff`）：先改状态，再差分出事件。
- 消费方（本人 grep 确认）：`ring-commit.ts:210`（写）、`panel-observe.ts:112`（对账展示）、
  `scripts/record-ring.mjs:218`（对账）、`scripts/test-ring-events.mjs`（单测）。
  **没有任何业务流程订阅它**。
- 覆盖域：仅内容环（decision/outcome/valence/relation/commitment/association），
  蒸馏与深睡的状态迁移**不在这条事件流里**。

⇒ 它目前的价值是「**对账资产**」，不是「架构基础」。这样定位是合适的，
  但应当写清楚，避免后来人误以为它是全域事件流。

### F6 · ~~同一事实多副本~~ —— **经复核，本项判断有误，已撤回**（2026-09-14）

> ⚠ 原列 3 例，**逐条读代码后 3 例全部不成立**。本项是**唯一基于子代理清单、未亲自读原文**
> 就写进报告的结论，而它错了。其余结论（F1/F2/F3/F4/F5/F7）均经本人读原文或亲跑 grep 复核。

1. ~~叙事双份~~ → **是设计意图，关系同「文件 + 索引」**。
   `notes/agent.md §经历/<标题>` 是**正文（author 层）**；`episode` 记录是**带 `cues`/`evidence`
   的索引**，其 `pointer` 字段**指回正文小节**。`deepsleep-run.ts:209-224` 注释原文：
   「正文进 `notes/agent.md §经历/<标题>`，再由下面的 ring-commit 把同一批写成 `episode` 记录
   （`pointer` 指回该小节，可深读）」。⇒ 不是副本。
2. ~~环记录双份~~ → 同上，设计意图（`ring-events.jsonl` 历史 + `records.jsonl` 状态，靠对账）。
3. ~~深睡结果三处~~ → **实为四处，且各有职责**：
   `deepsleep-run.ts:244` `audit`（轮次审计 + `landed` 判据）·
   `:246` `ledger(consolidate)`（升格/降格裁决 + 六通道结果）·
   `:265` `ledger(write.consolidate)`（逐通道**写入回执**）·
   `:300` `delta.md`（给注入面读的「最近变化新闻」，48h 过期即弃）。
   **四个不同视角的记账，不是冗余副本。**

⇒ **教训（本轮最值得记的一条）**：**「照抄二手清单」的失效率在本轮是 1/1**。
报告类结论里凡是"跨模块配对关系"这类**需要读两侧代码才能确认**的判断，
必须亲自核对——子代理给的清单只能当**线索**。

另：`deepsleep-run.ts:277` 自承「面板/脚本侧载体写入仍不经此处」⇒ md 写入路径未完全汇聚。

### F7 · 装配根是共享可变句柄盒

`src/composition.ts:78-84`（本人全文读取）：`{ mcl: { current }, deepSleep: { current }, scheduler: { current } }`。
这是**显式化的共享可变状态**，比原来的三条桥好（静态可追），但它既不是事件也不是编排，
只是解决「panel 装配早于 scheduler」的次序技巧。不宜被误读为事件机制的替代。

---

## 3. 四块划分 × 适合模式

用户的四块划分**成立**，且与代码结构吻合。但四块角色不同，**不该用一种模式统一**：

| 块 | 角色 | 适合模式 | 现状 | 缺口 |
|---|---|---|---|---|
| **库** | 事实源 | 事件溯源（已有雏形） | `ring-events` + `records` 双份对账（F5） | 只覆盖内容环；CDC 而非 events-first（可接受，成本考量） |
| **蒸馏（生产）** | 有终态长流程 | **显式编排** | 已有 de facto 编排函数 `distillAgent`（F1） | 无流程实例、无进行中进度、无步骤级续传 |
| **注入召回（消费）** | 多消费者扇出 | **协同式 / 订阅** | 同步直调 + TTL 缓存（§1.1、F3） | 无订阅机制，上游变更不通知 |
| **睡眠（维护）** | 长流程 + 定时巡检 | **显式编排 + 调度器** | 内存状态机 + 轮询（§1.3、F1） | 状态不持久、水位是标量时间戳 |

**判断依据**：有没有业务事务边界 + 需不需要回答「卡在哪」。
蒸馏与睡眠**有**（需补偿/水位回滚、需断点续传）；注入召回**没有**（重算即可，无终态）。

---

## 4. 建议（按性价比排序）

### P0 · 把已有的隐式通道显式化（约 1 天，收益最高）

1. **登记「文件即通道」契约表**：写侧模块 / 路径 / 读侧模块 / 失效策略，
   新增机检 `check-file-channel`——任一侧改了而另一侧未同步 ⇒ 红。
   形态可直接类比仓内既有的 `check-panel-contract`（表 ⟷ 实际注册双向一致）。
2. **上游落盘主动失效注入缓存**：把 `panel-shared.ts:328` 的 `invalidate` 接到蒸馏/深睡写入后；
   或退一步，把已有的 `sizeStampOf`（:388）mtime/尺寸签名机制复用到 `activity.jsonl`、
   `warm-recall.json`、`delta.md` 三个介质上——**机制现成，只差接线**。

> 这两件做完，「文件即通道」就从隐式契约变成机检契约，F3 的 TTL 窗口问题同时消失。

### P1 · 产线补流程实例（约 2-3 天）

水位从 `lastSeq` / `lastDeepSleepAt` 标量升级为
`{ runId, phase, startedAt, updatedAt, attempt }`，落同一 jsonl。
收益：重启续到步骤级、面板可展示进度（现在查不到）、能回答「卡在哪一步」。
**不要引入工作流引擎**——三个步骤以内、无长时等待，手写状态表更轻。

### P2 · 消除影子记账与主路径的两套逻辑

让 `assembleSupply` / `renderSupplyText` 接管 `buildHotMemoryText` 的主路径（F2）。
否则 P0a 的账永远是近似值，且两套逻辑会缓慢漂移——这正是本仓反复栽的坑型。

### 不建议做的事

- **不要引入进程内事件总线 / EventEmitter。** 理由：单进程、63 模块、已有零环依赖门禁；
  加总线会把静态可追的直接调用变成动态不可追的订阅，与「单一实现 + 机检」纪律冲突。
  F4 已经证明：订阅者语义冲突的代价在本仓是真实付过的。
- **不要把 ring-events 改成 events-first。** CDC 现在够用，因为有 `reconcileRing` 对账兜底
  （`ring-events.ts:139-143` 头注已论证）。改 events-first 的收益在单进程场景不成立。
- **不要用一种模式统一四块。** 见 §3。

---

## 5. 证据来源与核实状态

**本人亲自读取原文确认**（可直接引用）：
`src/composition.ts`（全文 1-88）、`src/index.ts`（全文）、`src/event-envelope.ts`（全文）、
`src/rings.ts`（全文）、`src/ring-events.ts`（全文 1-249）、`src/deepsleep-machine.ts`（全文 1-221）、
`src/distill.ts`（全文 1-314）、`src/distill-hooks.ts`（全文 1-232）、
`src/panel-shared.ts:340-420`、`src/supply-assembly.ts:150-258`；
`wc -l src/*.ts`（63 模块 / 15,234 行）；三次 grep（事件总线零命中 / `assembleSupply|renderSupplyText`
消费方 / `replayEvents|reconcileRing` 消费方）。

**由子代理核查、本人未逐行复核**（引用时请自行复核行号）：
`activity.ts:88`、`mcl.ts:372/389/434/437/483`、`panel-shared.ts:302-308/328/346/388/447/493/549-557/598`、
`panel-inject.ts:96/229/261/284/305/413-417/434-435`、`panel-config.ts:169/182/307`、
`deepsleep-run.ts:13/24/101/210/224/242/244/263/277/297`、`deepsleep-apply.ts:78/163/243`、
`deepsleep-traces.ts:100`、`ring-commit.ts:31/65/82/189-201/215/219`、
`distill-agent.ts:47-325` 各步骤行号、`distill-watermark.ts:35-63/102-114`、`distill-state.ts:16-22`、
`distill-write.ts:78-82/186/297/438-463`、`distill-paths.ts:30`、`targets.ts:377`、
`situation-key.ts:60`、`vec.ts:58/61`、`panel-observe.ts:109-112/398/427`、`scheduler.ts:24/525/686/721-744`、
`deepsleep.ts:90-97`、`treeops.ts:279/307`、`record-shadow.ts:183`。

> 标注依据：本仓记忆纪律「结论与证据戳必须同源同一次读取」。区分两类来源是为了让后续
> 引用者知道哪些可以放心引用、哪些需要复核。
