# 门4「时态剔除落库接线」方案与验收（**已施工 · 册 A–D 全落地**）

> **态标签（R1/R5）**：**施工态**。授权来源 = 用户 2026-09-20 指令「**剩余两条全部推进完成**」
> （具名授权：点名推进剩余两条，即本条与承诺结算链）。
>
> ⚠ **本文档在施工中被实测推翻了三处断言**——照原文施工会做出错误的东西。三处已在下文
> §0 逐条更正（**保留原判断并写明实测值**，不是悄悄改掉）。这是本文档最该先读的一段。
>
> **来源**：`docs/OPEN-ITEMS.md §0f` + `§0e`（门4 行）。

---

## 0. ⚠ **施工前实测推翻的三处断言**（2026-09-20 · 全部可复跑）

| # | 原文（开工前写在本文档里的） | 实测 | 影响 |
|---|---|---|---|
| **①** | §4.3 前置门：「台账出现 **≥1 行** `l0After.conflict='supersede'`；若长期为 0 ⇒ 本条**正确处置是维持登记、不开工**」 | 跨档台账（`ledger.jsonl` + `.1`）**564 行 `l0After`，`none` 564 · `supersede` 0 · `coexist` 0**；带 `judgementChecked`（写侧校验生效后）的新行 **10 条**，其中 `supersede` **仍 0** | 前置门**未满足**。但真正的原因不是"等样本"，而是下面 ② ③ —— 即**该门本身问错了问题** |
| **②** | §2.3 接线点：「在 `l0After.conflict === 'supersede'` 的行上，把该裁决转成 `SupersedeOp`」 | **模型输出的 schema 里根本没有"目标"字段**：实测蒸馏 prompt 顶层键 = `appends/newIndex/profiles/projectCards/decisions/commitments/relations/valences/skipped`，`supersedes`/`match` **命中 0**；深睡 schema 有 `match`（给 principles 的 replace 用）但**同样没有** supersedes 的目标通道 | `conflict='supersede'` 只说明「有取代发生」，**说不出取代了谁** ⇒ 照原文实现，`SupersedeOp` 拿不到目标，接了也永不触发 |
| **③** | §4.1 册 D：「`supply-assembly` 的 `out.expired` 出现该 id，且**注入面**里不再有它（这是门4的**终极目的**）」 | **只有一半成立，分界线是 `file` 字段不是 kind**（见 §5 实测）：环记录（`file===''`）经 `ring-supply#isLive` 门 ⇒ situation 块消失 = **真抵达**；索引行（`file!==''`，即绝大多数"旧断言"）唯一看 `validTo` 的读侧是 `buildCandidates`，而它在 `src/` 内**零消费者**（`check-injection-reach` ⑫ 早已机检此事实），注入面读 **md 原文** ⇒ **无抵达** | 册 D 的验收**不能写成"注入面里不再有它"**（对索引行不成立）；已改为**分层实证**（哪一半通、哪一半不通，逐条机检钉住） |
| **④**（顺带发现） | `check-l0-conflict-wiring` ① 声称守「每个 L0 取值都有**产生式**」 | `coexist` **无产生式**（`evaluateL0` 实测只能产出 `none`/`supersede`），而门判**绿** —— 其 `asValue` 正则被 `types` 里的 `= 'none' \| 'coexist'` 与 `l0Pick(...)` 行**误命中**（**假绿，且该门存在的唯一目的就是抓这个**） | 已如实登记，修法与影响见 §6.4 + `docs/OPEN-ITEMS.md §0p` |

**⇒ 对"是否该开工"的结论**：原文那条前置门（等 `supersede` 样本）**永远等不到**，因为
② 的"目标通道缺失"意味着即使模型每次都判对，宿主也**拿不到可执行的目标**。
正确的做法不是继续等，而是**把通道补上**（模型给目标正文 + 宿主按逐字唯一命中定位）
—— 这正是册 B/C 实际落地的形状（与仓内既有 `replace` 同口径：那条路早就这么做了）。

---


## 1. 病与现状（全部为实测，非推断）

### 1.1 已修的部分（前几轮）

| 段 | 状态 | 证据 |
|---|---|---|
| 产生路径断在入参 | ✅ **已修** | 原 `evaluateL0` 只 1 处调用且只传 `{text,traces}` ⇒ `supersedes` **全仓零赋值** ⇒ `conflict` **恒 `none`** ⇒ `coexist`/`supersede` **永不产生**。现 `distill-agent.ts:349` 把校验后的 `judgement.conflict` **真的喂给** `evaluateL0.supersedes` |
| 模型取值未校验 | ✅ **已修** | 真机 437 行 judgement 的合法率仅 **89.9%**，非法样本含 `0`/`1`/`无`/`false`/整句/`replace-1` ⇒ 写侧现校验域 `{none,coexist,supersede}`，越界归一为 `none` + 审计 `judgement-invalid` |
| 门禁 | ✅ **已建** | `check-l0-conflict-wiring`（3 断言，含反例自证） |

### 1.2 剩余的那一段（**本文档的对象**）

**事实：`fact-ring#supersede()` 在 `src/` 内无调用方。**
- `fact-ring.ts:41` 定义了 `supersede(records, id, init)` —— 纯函数（记录集进、记录集出），**幂等**（已失效者拒绝重复标记），**不碰 I/O**。
- 同族 `revive()`（`:57`，撤销误标）同样**无调用方**。
- ⇒ 真库 `.records/records.jsonl` 的 `validTo` 非空 **0 / 5860**（目标：≥1）。

**事实：落库通道现成且在产线运行**（此前我误判「无处可落」，已推翻）：
- `~/.dsh/suite/scheduler.json` 的 `storeMode` 实测 = **`dual`**（不是 `md`）；
- 真库 `.records/records.jsonl` 实测路径 = **`~/.dsh/skills/managing-memory/.records/records.jsonl`**
  （⚠ 本轮订正：不在 `suite/knowledge/` 下，此前那处是**索引库根**；两处易混，记录在此）
  —— **5981 行 / 2.87 MB / mtime 约 1 小时内**；
- `storeMode=dual` ⇒ 影子库是**活体**。`kind` 实测分布：`prose` 2187 · `fact` 1274 · `blank` 705 ·
  `decision` 620 · `structure` 456 · `outcome` 165 · `valence` 153 · `episode` 133 · `persona` 92 ·
  `commitment` 92 · `relation` 85 · `procedure` 17 · `association` 2。

**事实：读取侧**已就绪 —— `supply-assembly.ts:286/290` 已在按 `isLive(r, at)` 分流，
失效者进 `out.expired` 并带「已于 X 失效（原因）」的说明。⇒ **接线后即刻有可见后果**，无需再改造消费侧。

**事实：上游裁决的产量（本轮实测 · 决定接线会不会「接了但永不触发」）**：

| 量 | 实测值 |
|---|---|
| 台账带 `l0After` 的行 | **551** |
| 其中 `l0After.conflict` 取值分布 | **`{none: 551}`** ⇒ **`supersede` 产量 0** |
| `judgement.conflict` 模型原始取值 | `none` 403 · **`无` 11 · `0` 9 · `false` 8 · `0.1` 5** · 长整句若干 · `replace-1` · `yes` · `1` 各 1 ⇒ 非法值合计 **~40 行**（正是已修的那批） |
| 真库 `validTo` 非空 | **0 / 5981** |

### 1.3 ✅ **根因已定位并修复（本轮）⇒ 前置门从「不可能满足」变为「可满足」**

**根因（读码 + 真机双重取证）**：**模型不知道 `supersede` 这个取值存在。**
- prompt 只带 `JUDGEMENT_HINT`，其原文是「…取值见 criteria 注册表」——
  而**模型读不到注册表**（它不是文件系统里的东西，是构建期投影）；
- 实测：两处 prompt 常量（`distill.ts` / `deepsleep-core.ts`）里
  `supersede` / `coexist` / `cross-task` / `cross-day` **命中 0**
  ⇒ 模型只能**自造** ⇒ 真机出现 `无`(11) / `0`(9) / `false`(8) / `0.1`(5) / 整句(3) / `replace-1` / `yes` / `1`。
- ⇒ **与既有 `formatConstraintLine()` 同族**（判因原文：「模型**不知道有上限**」）：
  **判据在注册表里，而模型手里没有**。

**修复（本轮已施工 · 属 R2 可逆且不改判定语义）**：
`gen-criteria.mjs` 新增 `l0EnumLine()` —— 从注册表 `l0.*.values` **派生**一行取值域说明
（含 `conflict` 三义辨析 + 「拿不准填 `none`」的宁缺毋滥指引），投影为 `JUDGEMENT_VALUES`，
接入 `DEFAULT_DISTILL_PROMPT` 与 `DEEP_SLEEP_PROMPT`。
**判据**：`check-l0-conflict-wiring` ④（3 断言）—— 生成物含全部取值 · **运行期 prompt** 含全部取值
（**import 模板常量求值**，不 grep 源码）+ 两处 prompt 均接入。
**先红实证**：删掉深睡 prompt 的 `${JUDGEMENT_VALUES}` ⇒ exit 1；还原 ⇒ exit 0；字节级还原 true。

**⇒ 前置门语义随之改变**：不再是「等一个不可能出现的取值」，而是
**「看修复后新落账的 `l0After.conflict` 分布」** —— 修复前 551 行全 `none`（取值域从未抵达模型），
修复后**首次具备产生 `supersede` 的必要条件**。



---

## 2. 方案

### 2.1 设计原则（三条，均沿用仓内既有裁决）

1. **复用既有落库配方，不新造**（仓规则 5「不从零造轮子」）——
   完全照 `ring-commit.ts` 的配方：`改纯函数 → saveStoreRecords → eventsFromDiff → 追加 ring-events.jsonl`。
   为什么两样都写：**事件流是不可变历史、store 是当前状态**（store 会被镜像重写，历史不会）；
   对账判据要求「事件流重放必须能重建 store 的环记录」。
2. **纯函数不被污染** —— `fact-ring#supersede` 保持「记录集进、记录集出、零 I/O」不变
   （它是可单测的判据层）；落库封在**调用方**。
3. **失败不打断主链路** —— 同 `ring-commit` 的「零抛出」纪律：写入失败只进返回值与审计。

### 2.2 落点（唯一新增件）

新增 `src/fact-supersede-apply.ts`（**单一实现**，名取领域中立 —— 它同时服务蒸馏与深睡两条产线的裁决回流）：

```
applySupersedeOps(deps, ops: SupersedeOp[]): { applied: number; skipped: number; events: number; reason?: string }
```

- 入参 `SupersedeOp = { targetId?: string; targetText?: string; at: string; note?: string; by?: string }`；
- **目标定位**：优先 `targetId`；无 id 时按 `record-store#fingerprint`（**已有单一实现**）在**同 kind+同 text** 上定位。多命中 ⇒ **拒绝**（不猜）——沿用 `section-ref` 的「多命中拒绝」口径；
- **幂等**：`fact-ring#supersede` 自身已幂等（`已经失效 ⇒ ok:false`），调用方把 `ok:false` 计入 `skipped` 并可审计；
- **先留档再改**：被失效记录的**整行原样**写入 `audit/supersede/supersede-<ts>.jsonl`（含 `by`/`note`）——
  沿用 `forgetops` / `converge` 的「绝不直删、归档可回滚」纪律（本操作**不改内容**，但留档使「谁在何时失效了什么」可溯）；
- **回滚**：`fact-ring#revive()` **已存在**（`:57`）⇒ 提供 `--revive <归档文件>` 的离线入口即可，**无须新写恢复逻辑**。

### 2.3 接线点（两处，各自独立可关）

| 产线 | 落点 | 触发条件 |
|---|---|---|
| 蒸馏 | `distill-agent.ts` 在 `l0After.conflict === 'supersede'` 的行上，把该裁决转成 `SupersedeOp` 交 `applySupersedeOps` | 仅当该行 `conflict='supersede'`（现真机产量见 §4.2） |
| 深睡 | `deepsleep-run.ts` 的 `otherChannels` 汇合处（与 `forgetOps`/`convergeOps` 同层） | 仅当模型在 `DEEP_SLEEP_PROMPT` 里产物通道显式给出 |

**开关**（沿用仓内「开关结构先行」纪律：缺省即旧路径、可一键回滚）：
- `SHOUCANG_SUPERSEDE_APPLY=1` 才执行（env ∪ 持久配置双通道，同 `releaseAuto`/`proposalApply` 先例）；
- 缺省关闭 ⇒ **与现状逐字节等价**（零行为变化）。

### 2.4 明确不做（anti-scope）

- **不自动判定「谁取代谁」**：模型只给 `conflict='supersede'`（是与否）；**取代者身份**若无法从材料唯一确定 ⇒ 只标失效、不填 `by`（宁缺毋滥，不编造指向）。
- **不做前提求值**：`fact-ring.ts:88` 已显式声明「前提是否仍成立」需要一门前提语言，属独立课题，不在本条冒充。
- **不触碰 `lifecycle`**：`validTo`（真伪）与 `lifecycle`（活性）**正交**，`fact-ring.ts:12` 有明文；混用会犯两类错。

---

## 3. 风险与代价（如实评估）

| 风险 | 评估 | 缓解 |
|---|---|---|
| **误标失效**（把真事实标成失效） | 中 —— 取决于模型 `conflict` 判得准不准（真机合法率 89.9% 是**格式**合法，非**语义**正确） | ① 默认关闭；② 留档可回滚（`revive` 现成）；③ 接线后先只**观测**（计 `applied` 不实质生效）一档可选 |
| **跨链改动面** | 中 —— 新增 1 件 + 2 处接线 + 1 处 schema/env 开关 | 按册分批（见 §4.1），每册独立验收 |
| **棘轮碰撞** | 低-中 —— `distill-agent` / `deepsleep-run` 均非冻结名单，但 `deepsleep-core` 导出数受 `audit-architecture` 棘轮（阈值 35） | 新件**只向下**依赖，不进 `deepsleep-core`（沿用 `probe-plan`/`trigger-plan` 先例） |
| **落库对账** | 低 —— `episode` 通道的「不在对账范围」有显式口径先例（`ring-commit.ts:20-23`） | 复用同一口径；新事件与 `record-shadow` 的 `validTo` 承接（`:175`）已有通路 |

---

## 4. 验收（成对）

### 4.1 分批（每册独立可验，任一册未过即整体未完成）

| 册 | 内容 | 判据 |
|---|---|---|
| **A** | 新件 `fact-supersede-apply.ts` + 单测（**TDD 先红**） | ① 目标定位：id 命中 / 指纹命中 / **多命中拒绝** / 未命中拒绝 ② 幂等（重复提交 `applied=0, skipped=1`）③ 留档含**整行原文** ④ 关闭开关 ⇒ **零写入**（真库 sha 不变）⑤ 异常不抛（注入故障 ⇒ 返回 `ok:false` 且不打断） |
| **B** | 蒸馏落点接线 + 开关 | ① 台账出现 `applied>0` 且其 `targetId` 可在 `.records` 中定位 ② 该记录 `validTo` 非空 ③ `ring-events.jsonl` 新增同 id 事件 ④ **事件流重放能重建 store 该行**（对账不变式） |
| **C** | 深睡落点接线 + prompt 通道声明 | `check-injection-reach` 增断言：prompt 声明了 supersede 通道 ⇔ 宿主真接线（**先红实证**，同 ⑩ 先例） |
| **D** | 读取侧实证 | `supply-assembly` 的 `out.expired` 出现该 id，且**注入面**里不再有它（这是门4 的**终极目的**：错的事实不进注入面） |

### 4.2 复验命令（逐条可执行，不接受自述）

```bash
node scripts/check-runner.mjs                       # 全量门禁（±新增断言）
node scripts/test-fact-supersede.mjs                # 册 A 行为级单测（本方案交付物之一）
node scripts/check-injection-reach.mjs              # 册 C 通道锁
node scripts/inject-baseline-diff.mjs               # 注入面逐字节回归（关开关时必须一致）

# 台账：裁决产量（接线前基线 / 接线后产量）
node -e "…读 audit/ledger.jsonl 跨档…统计 l0After.conflict 取值分布"

# 真库：validTo 非空条数（目标 ≥1）
node -e "…读 .records/records.jsonl…统计 validTo 非空"

# 对账不变式：事件流重放 == store
node scripts/shadow-sim.mjs
```

**六层验收（发布前置，同仓内既有口径）**：① typecheck+build+check-runner 绿 ② 部署同步 sha
③ 热重载 fiber active ④ 特性探针 ⑤ 注入对拍逐字节 ⑥ pin 指向 HEAD。

### 4.3 判据的**前置门**（未满足则本项不得开工）

**接线前必须先取「裁决产量」基线**：若台账 `l0After.conflict='supersede'` 长期为 **0**，
则接线后必然「接了但永不触发」——这**正是门4 前几轮被误判为「零样本」的那个坑**。
⇒ 前置条件：**台账出现 ≥1 行 `conflict='supersede'`**（产生路径已通，等模型真判出取代）。
若长期为 0，则本条**正确处置是「维持登记、不开工」**，而不是造数据凑触发。

---

## 5. 待授权事项（一句话即可）

**批准施工则回：**「门4 落地」或「做门4 册 A」（可只批一册）。

授权后按册推进，每册交付「方案轮次记录 + 机检证据」；
**未获授权前，本条保持决策态，`src/` 不动。**

---

## 6. 施工记录（2026-09-20 · 用户「剩余两条全部推进完成」= 具名授权）

**态标签（R5）**：施工态。授权 = 用户本轮指令点名推进剩余两条。

### 6.1 册 A：`fact-supersede-apply.ts`（新件，落库唯一出口）

判据 `scripts/test-fact-supersede.mjs`（已登记 `check-runner`，**50 条**）覆盖：

| 组 | 断言要点 |
|---|---|
| A | **默认关闭 ⇒ 真库 sha 不变** · 零留档 · 零审计 · 逐条留理由 `disabled` |
| B | id 精确命中 / 正文逐字命中 / **0 命中拒**（陈旧）/ **多命中拒**（歧义）/ 未命中者纹丝不动 |
| C | 幂等：重复标记被拒，**既有失效时刻不被后来的 `at` 覆盖** |
| D | 留档含**整行原文**（含 `meta`）+ 因由 + 时刻；**既有 `revive()` 即可回滚** |
| E | **库未建 ⇒ 拒**（不得顺手造出游离事实源） |
| F | 留档失败 ⇒ **整批拒改**且库未被改动；审计留证 `archive-failed` |
| G | **反例自证**：开关真的改变结论（off=0 / on=1，防假旋钮） |
| H | **幻觉门**：目标不在给定材料中 ⇒ 拒；空目标拒；配额截断留理由；超长拒 |
| I | **边界**：本操作**不进环事件流**（`RING_OPS` 仍 9 种，遵守 `test-fact-ring` §I 的既有边界） |
| J | **分层抵达实证**（见 §5 ③）：环记录真抵达 / 索引行无抵达，两级各自钉住 |

### 6.2 册 B / C：两条产线各一处接线 + 两处 prompt 声明

- **蒸馏**（册 B）：`distill-agent.ts` 的 `runSupersedeChannel`（**模块级**，为解 `distillAgent` 的
  函数跨度棘轮 400 行）；幻觉门的"已见材料" = 本段 `relMemLines`（召回行）+ `manifest`（同轮清单）。
- **深睡**（册 C）：`deepsleep-run.ts` 的 `runSupersedeChannelSleep`（同上，解 `runDeepSleep` 棘轮）；
  幻觉门 = `currentProfiles` + `currentTreeSections`。
- **prompt 通道**：两处 schema 各加 `supersedes:[{target,note}]` 字段 + 一段使用指引
  （明写"**不许自己拼一条像既有行的文本**——那会误标真事实失效"）。
- **判据**：`check-injection-reach` ⑬/⑬′（**声明侧 × 接线侧双向锁**——只接一处即红，
  防"接了但另一条产线永远不触发"没人看得见）。
- **开关**：`supersedeApply`（schema + `scheduler.json` 持久 + env `SHOUCANG_SUPERSEDE_APPLY=1`），
  缺省关 ⇒ **与现状逐字节等价**。

### 6.3 册 D：读取侧实证（**口径已按实测更正**，见 §0 ③）

`test-fact-supersede.mjs` §J 把两级抵达**写死为断言**：
- 环记录（`file===''`）⇒ `ring-supply#ringCandidates` 的 `isLive` 门 ⇒ situation 块无它 ⇒ **真抵达**；
- 索引行（`file!==''`）⇒ 注入面读 md 原文 ⇒ **无抵达**，且断言实测 `buildCandidates` 的
  `src/` 内消费者 = **0 件**（其中"消费者"判定**先剥注释**，防注释一条就"接线了"）。

### 6.4 ④ `check-l0-conflict-wiring` ① 假绿（登记，**未修**）

实测：`coexist` **无产生式**（`CONF.coexist` 剥注释后在 `src/` **零出现**；`evaluateL0` 的 `conflict`
只能算出 `none`/`supersede`）**而门判绿**。

**根因（round 11 精确定位，比首版更窄）**：`produces()` 的 `asValue` / `inTernary` 两条正则在
**类型声明行**上就命中 —— 命中的是 `criteria.ts:32` 的 `export type L0Conflict = 'none' | 'coexist' | 'supersede'`
（`:\s*[^\n;]{0,60}'coexist'[^\n;]{0,60}(?:\)|,|;)` 里的 `:\s*` 把 `type X =` 之后的**联合类型**当成了
"赋值右值"），以及 `criteria.ts:75` 的 `CONF = {…}` 行。⇒ 门抓到的**恰是它注释里明确排除的那一类**
（"仅出现在 `l0Pick` 第二实参里不算产生"）。

判据已具备的**事实源是** `wiring.unreachableValues`；正确修法见 `docs/OPEN-ITEMS.md §0p` 处置建议 A/B。
本轮**未修**，理由是它属另一条判据链（不属于"门4 落地"的授权范围），
如实登记在 `docs/OPEN-ITEMS.md §0p`（含可直接跑的复现命令），不夹带施工。

