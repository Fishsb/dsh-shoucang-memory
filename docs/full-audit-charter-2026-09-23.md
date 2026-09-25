# 全量检查章程（2026-09-23 · 圆桌会议产出）

> **性质**：流程/治理文档（决策态）。**不是**待办清单——**`docs/OPEN-ITEMS.md` 仍是唯一待办事实源**，本档只写「按什么顺序查、什么算查到了、哪些不许动」。
> **产出方式**：圆桌会议「全量检查章程」（orchestrated · 6 席 · arch/accept/obs/verify/data/minimal），主持人为 DSH agent。
> **本档所有数字均为 2026-09-23 本轮实测**，附复跑命令。凡未实测者显式标「待定」。

---

## 0. 一句话

**检查顺序必须从「判据能不能说真话」开始，而不是从「代码对不对」开始。**
因为本仓已实证：判据件也会假绿。判据不可信时，**后面每一层的 PASS 都不携带信息**。

---

## 1. 顺序与逻辑（六层 · 每层为什么必须在这一位）

| 序 | 层 | 为什么必须在这一位 | 入口命令 |
|---|---|---|---|
| **0a** | **判据自身的可证伪性** | 唯一「错一层则全局不可观测」的层 | `node scripts/check-runner.mjs` → 再逐件跑 `--selftest` |
| **0b** | **机制自证 ⟷ 独立对账不得同源** | 本轮新增（见 §5 活体事件）：自证全绿与对账红**可同时为真** | 见 §5.3 |
| **0.5** | **治理账本身可证伪** | 治理读数若不可信，等于用坏尺量东西 | `nav_graph mode="health"`；计数闸 3/3 ⇒ `nav_decide`（**禁用补 ADR 清零**，那是制造假绿） |
| **1** | **事实源唯一性** | 双权威 ⇒ 同一事实两个出处，矛盾时无人能判 | `storeMode` 三处一致性 + 读侧是否也看它 |
| **2** | **声明 ⟷ 运行态抵达** | 「设了开关」≠「开关生效」；本仓已实证 `storeMode:'record'` 能被设、不报错、静默无动作 | 消费侧是否有通路（`check-injection-reach` 式正面断言） |
| **3** | **分层与依赖方向** | 结构错会持续制造新缺陷 | `node scripts/audit-architecture.mjs --gate` |
| **4** | **写路径唯一性** | 多写者 ⇒ 竞态不可复现 | `bank-lock` / `section-rewrite` 是否为唯一原语 |
| **5** | **可观测面有消费方** | 留痕字段无消费面 = 假的可观测 | 每个「留痕」字段必须能指出谁读它 |
| **6** | **存储选型（SQL 与否）** | **殿后**：前五层没查清，选型讨论没有依据 | 见 §6 |

**排序口径（用户口径，优先级最高）**：先给「**会掩盖其他问题 / 让失败不可观测**」的缺陷，再按严重度排；**不得按显眼度排**。

---

## 2. 根基清单：三类处置

> 用户原话：「哪些是根基**定下来就不可以动了**，哪些是**可以跟着前面定下的再进行改动**」。
> 判据不是「重要不重要」，而是**「改了要连带改多少」**与**「谁有权改」**。

### 2.1 🔒 判据级锁死（动了全仓判据失真）

| 根基 | 为什么不许动 | 实证 |
|---|---|---|
| `skill/engine/criteria.json` | 判据**唯一事实源**；`criteria.generated.ts` 是它的投影，**禁手写** | 改它须跑 `gen-criteria` + 过机检门 |
| `bank-lock` / `section-rewrite` | **唯一写入原语** + 库级单写者锁 | 零依赖孪生件由 `check-bank-lock-parity` 差分锁守 |
| 三条红线 | 零硬编码本机路径 · 隐私（`_memory/` 不入库）· 跨工作区 | 红线是尺子，不是被量的东西 |
| **五层「绿」的定义** | 定义本身不能边审边改，否则自证 | 见 §4 |

### 2.2 🔒 已拍板裁决（翻案须用户点头）

| 裁决 | 出处 | 现状 |
|---|---|---|
| **不引入 SQLite**，断言图建在 Record + 环事件之上 | `src/assertion-graph.ts:5-11`（记载为用户拍板） | 已执行 |
| pmg 治理整体移出架构 | nav `notDoing` | 已执行 |
| 复审闭环上限 3 PASS | `docs/OPEN-ITEMS.md` | 现行 |

### 2.3 ⚙️ 可改，但改前必须算连锁面

**量化依据（2026-09-23 实测阈值，棘轮「只许收紧」）**：

| 门禁 | 阈值 | 出处 |
|---|---|---|
| 单模块行数 | ≤ **2000** | `audit-architecture.mjs:229` `T.lines` |
| 单模块导出 | ≤ **35** | 同上 `T.exports` |
| 转发导出 | ≤ **30** | 同上 `T.reexports` |
| 扇入 | > **8** 且不稳定度 > **0.3**（联合判据） | 同上（扇入单用会误判稳定核心件） |
| 运行时深度 | ≤ **10** | 同上 `T.depth` |
| 循环依赖 | **0** | 同上 `T.cycles` |
| 装配函数 | ≤ **120** 行 | `audit-wiring.mjs:26` `ASM_MAX` |
| 依赖包字段 | ≤ **12** | 同上 `SCOPE_MAX` |
| 大模块冻结 | ≥ **600** 行只许降不许升 | `check-module-growth.mjs:73` `FREEZE_THRESHOLD` |

**高扇入但稳定 ⇒ 不是耦合风险**：`targets`(扇入 23) / `criteria.generated`(19) / `vec` 扇出低 ⇒ 谁也改不动它们，被依赖是**设计意图**（SDP）。

**派生面（跟着前面走，不必单独锁）**：`panel-*` 全部 · `eval-*` · `sleep-report` · `pointer-deficits` · `recall-*`。

### 2.4 ⚠ 第三类的判据载体（accept 席复核补正）

> **accept 席发现的结构缺陷**：主持人初版把「根基三类」直接映射到 R1–R5，**结果削成了两类**——
> 用户原话第三类「**哪些是可以跟着前面定下的再进行改动**」**缺判据载体**。
> 根因：R2（自主施工准入）讲的是「哪些改动 agent 可自主做」，**不是**「哪些文件可跟着根基改」。**两者语义不同，不可互换。**

**补正——第三类的判据（改动前必跑四件）**：

| # | 判据 | 命令 | 通过阈值（本轮实测） |
|---|---|---|---|
| 1 | 依赖方向未被穿透 | `node scripts/audit-architecture.mjs --gate` | 0 环 · 深度 ≤10 · 无超阈 |
| 2 | 装配宽度未恶化 | `node scripts/audit-wiring.mjs` | I1 ≤120 行 · I2 ≤12 字段 |
| 3 | 大模块未增长 | `node scripts/check-module-growth.mjs` | ≥600 行件只许降 |
| 4 | 改动未跨会话边界 | 人工判 | 不碰其他会话在途文件**及其产物**（`src-client/` · `client.js` · `lib/`） |

⇒ **第三类 = 「跑完这四件即可自主改」**。任一红 ⇒ 升格为第一类（须先算连锁面）或第二类（须拍板）。

---

## 3. 边界层（只读，不改）

- `docs/ARCHITECTURE.md` §1 四条设计约束（**token 消耗是唯一硬约束**；部署复杂度/性能占用**可放宽**）+ §7「明确不做」。
- `AGENTS.md` 规则 1–7（含：**未登记 = 没写**）与「云端同步检查清单」五层。
- **R1–R5 态边界**（本仓既有，**直接映射为本章程的根基分类**，不另造词汇）：
  - 判据级锁死 = R3 ③「越过冻结棘轮」
  - 拍板级 = R1（决策态→施工态须具名授权）+ R3 五类
  - 可动级 = R2 自主施工准入四条件
- ⚠ **R1 硬约束**：**本章程的产出是决策态**。用户问「按什么顺序」≠ 授权施工。

---

## 4. 「绿」的定义（六条全过才算，任一条红即未完成）

1. `npm run typecheck` 零错
2. `npm run build`（host + client）成功
3. `node scripts/check-runner.mjs` 全绿
4. **渲染级**：`node scripts/ui-geo-regress.mjs`
5. **契约与产物**：`check-panel-contract` + `gen-panel-contract --check`
6. **装上去的那份带着本轮能力**：`check-installed-features`

**⚠ 本条为章程的核心纪律**：**「仓内绿」不等于「运行态绿」**。

### 4.1 skip 与 pass **不可同等记账**（本轮新增）

`check-runner` 契约：`0=pass · 3=skip（依赖缺失）· 4=xfail（已知未修，必须可见）· 其他=fail`。

- **skip 不算通过**。本轮实测 `scripts/eval-gate.mjs` 为 `exit=3 skip`——且 obs 席查明它是**结构性 skip**（`eval-gate.mjs:218` `MIN_JUDGE_N=8` vs 缺省只取 3 条/模式）⇒ **不是"等依赖"，是本来就跑不满**。
- 报数时必须**显式写出 skip 数**，不得以「全绿」概括。
- ⚠ **门禁读数本身不确定**（本轮实测）：同一套门禁在不同轮次给出 `212 pass` / `210 pass·2 fail` / `209 pass·4 fail` / `213 件·210 pass·3 fail` 等**互不相同**的读数；其中至少 **2 件门禁是非确定性的**（obs 席实证：`inject-baseline-diff` 全量 FAIL 而单跑 3 次全 pass，首差是未被 normalize 覆盖的活数据行；`eval-gate` 半途退出码与被覆盖）。
  ⇒ **失败退回动作**：任何一次门禁读数**必须连同「当时是否同时有别的写入者/专家在跑」一并记录**；跨会话并发跑门禁**会互相污染**（本轮已实际发生：两席并发跑同一门禁互见对方 scratch 文件）。
- **阈值（本轮实测，多次取值）**：`PASS ≈ 210–212 pass · 0 xfail · 0–1 skip`；出现 fail 时**先判是否为本轮自身引入**（BOM/scratch/并发），再判真缺陷。

---

## 5. 活体事件留档（本轮实测 · 章程 0b 层的由来）

**这是本章程最有价值的一节：它不是推测，是 2026-09-23 会议期间真实发生的。**

### 5.1 现象

同一仓、同一会话、**15 分钟内**，门禁 `check-record-parity` **FAIL → PASS**：

```
05:48:52  影子库 records.jsonl 停住（mtime）
05:56:48  notes/tools.md   写入（晚 7.9 分钟）
05:56:49  notes/lessons.md 写入（晚 7.9 分钟）
06:01:54  MEMORY.md / notes/INDEX.md 写入（晚 13.0 分钟）
06:05:07  影子库追平 → check-record-parity PASS
```

期间该门报 4 项红（`MEMORY.md` 53695B vs 53634B 等），且**连跑两次读数不同**（仍在变）。

### 5.2 根因（verify 席独立复核定位，**已排除 data 席**）

**`(c) 覆盖缺口 —— md 写入有多条路径，只有 distill/deepsleep 带镜像。**

| 面 | 证据 |
|---|---|
| 窗内写入者 | **`skill/scripts/memory-append.mjs`** —— 主持人独立复算：全文 `mirror` / `mirrorAll` / `mirrorFile` **各出现 0 次**（15,635 字节全文） |
| 坐实路径 | 由 `audit/backup-202609222156\|2201` 的命名反查 `memory-append.mjs:54` 的 `ts.slice(0,12)` |
| 自愈来源 | 06:05:07 来自一次 **run-end `mirrorAll`**（兜底，非缺口被修） |
| **排除 data 席** | 它只改**计数器**，且 md 写入时序**晚 8–13 分钟** ⇒ **时间上与它无关** |

**自证与对账互相矛盾，但谁都没撒谎（arch 席定位）**：`record-shadow.ts:62` `bumpShadowStats` 的分母**只含「被镜像的那一刻」**⇒ 对「此后 md 又变了」**结构性失明**。
⇒ 自证「7191/7191/分歧 0」与「md 落后」**同时为真**。**这是判据的时间语义缺项，不是数据不一致。**
⚠ 补证：`check-record-parity.mjs` 全文**无一句 mtime/新鲜度断言**（arch 席 grep 实证）⇒ 它能发现「某刻不一致」，**不能**表达「这是开窗还是闭窗」。

**§0r 状态判定（verify 席）**：**非新形态**（`diverged 0` + 往返 11/11 绿可判），但 `OPEN-ITEMS.md:15` 标「待授权」与 `:127-128` 标「已修」**自相矛盾**——**登记与现实脱节，待用户裁**。

### 5.3 由此确立 0b 层三条判据

- **R1 闭窗采样**：对账须落在**闭窗样本**上（带 epoch 落账）；`skip ≠ FAIL`。
  ⚠ **明确区分**「闭窗采样」（换采样面）与**已撤回的**「复跑容错」（重测到绿为止）——后者等于掩盖真漂移（`check-record-parity.mjs:70-71` 明文写着这条）。
- **R2 不得互相替代**：机制自证与独立对账**不得互为替代**，两者必须**都能独立红**。
- **R3 丢弃 error 必须显式**：`loadStore` 的 `error` 被丢弃处**必须显式记账**。

### 5.4 附带实测（本轮复核，含修正一处专家误报）

**`loadStore` 的 error 处置（逐处实测，`src/` 共 14 个调用点）**：
- **丢弃（5 处）**：`deepsleep-materials.ts:218`、`panel-arch.ts:109`、`panel-arch.ts:141`、**`situation-supply.ts:33`**、**`situation-supply.ts:53`**
  ⚠ 后两处**在注入热路径** ⇒ 库损坏退化为**静默空集**，与「本轮无可供给」**不可分辨**。
- **取了但未消费 error（4 处）**：`panel-observe.ts:130`、`fact-supersede-apply.ts:112`、`proposal-apply.ts:235`、`ring-commit.ts:116`。
- **正常消费（5 处）**：`association-supply.ts:36`、`record-shadow.ts:161/219/241`，及 `record-shadow.ts:104`（定义处）。

**读侧不看 `storeMode`（逐件实测，7 件均为 0 次）**：
`situation-supply.ts` · `deepsleep-materials.ts` · `association-supply.ts` · `panel-observe.ts` · `dynamic-select.ts` · `fact-supersede-apply.ts` · `proposal-apply.ts`
⇒ 写侧看开关（`distill-write.ts:183`），**读侧不看** ⇒「现在读哪一份」**从开关答不出来**。

---

## 6. SQL 问题：裁定「不换事实源 / 只换观测面」

> 用户原话：「审查一下当前的项目**是否有必要更改核心库为 sql**」。
> 本节只给**判据与实测**，**结论须用户拍板**（R1）。

### 6.1 实测体量（2026-09-23 · ⚠ 已按 verify 席复核订正）

> **⚠ 口径订正留档**：本节初版把「库内 md ≈ 0.06 MB」当作记忆库体量，**是错的**——0.06 MiB 是**仓内 `_memory/`（gitignored 的私人审计区）**，不是运行库。三个数各属不同集合，**引用时必须带集合名**（本仓已因口径不标而误事多次，这是又一例）。

| 介质 | 体量 | 集合/地位 |
|---|---|---|
| **运行库 11 载体** `.md`（MEMORY/USER/AGENT + notes 8 件） | **713,358 B = 0.68 MiB** | **权威源**（见 6.2） |
| 运行库全部 `.md`（含 notes 外） | 154 件 / **9.47 MiB** | 含非载体文档 |
| 仓内 `_memory/`（私人审计区，gitignored） | 20 件 / 0.06 MiB | **不是**记忆库 |
| `.records/records.jsonl` | **3.28 MB** / 7098 行 | 影子（`dual` 镜像） |
| `ring-events.jsonl` | 0.57 MB | 环事件，可重放 |
| **观测台账** `ledger.jsonl` + `.1` | **7.94 + 8.17 = 16.3 MB** | 已轮转 |
| **向量缓存** `.vector-cache.jsonl` | **26.83 MB** | 可重建缓存 |

### 6.2 三条判据

1. **权威不在 Record 手里**：`storeMode` schema 只收 `md|dual`，`record` 档注释原文「**尚未实现** ⇒ 防死开关」；`record-address` 因此**已被判定死件并删除**。运行态实测 `storeMode=dual` ⇒ **md 写不进就丢数据，影子库丢了可重建**。
2. **规模不到瓶颈**：库本体 0.06 MB；最重的是**观测面 16.3 MB + 26.8 MB 缓存**，不是记忆本体。
3. **真开销已付过一半**：14 处 `loadStore` **全量反序列化**（自述 25ms / 5700+ 条，data 席实测 49–68ms）。但 `.records/records.jsonl` **本身就是一张 JSONL 表**，缺的只是**索引**。

### 6.3 裁定（供用户拍板）

- **不换**：记忆库本体与 Record 事实源。
- **候选换**：**观测台账层**（16.3 MB 且已因**轮转失明**致盲多次——`epoch-calibrate` 主档 `kind=deep-sleep` **0 行** / 旧卷 **49 行**；`check-deferred-queue`、`check-claim-alignment` 同型）。
- **更便宜的替代**：给 `.records/` 加**派生索引**（`id → 行偏移`，可重建可删），把 14 处全量读降为按需读。

⚠ **规模拐点（data 席实跑测定）**：x5（35,490 行 / 16 MB）⇒ 每轮注入 ≈630ms 越阈；按 md 侧 ≈560 条/天推，**约 50 天**到达。

---

## 7. 须用户拍板项（隔离区 · agent 不得自行推进）

| # | 事项 | 选项 | 出处 |
|---|---|---|---|
| **P1** | **对账闸开窗/闭窗判定** | A 120s 静默阈值 / B 全 skip 只落账 / C 维持现状一律 FAIL | arch 席推荐 A（B 让真漂移永久沉默，C 无法与真漂移分辨） |
| **P2** | **是否给 `check-record-parity` 补 0b 层判据** | A 补 / B 不补 | §5.3 |
| **P3** | **1477 条无 md 投影的环记录归属** | A 反向导出成 md 投影 / B 承认 `file=''` 是设计 | data 席提出 |
| **P4** | **SQL 边界**：是否只做 `.records/` 派生索引，或动观测台账层 | 见 §6.3 | 本轮 |
| **P5** | **`check-l0-conflict-wiring` 自身假绿**（OPEN-ITEMS §0p 已挂） | 用户二选一 | 既有未决 |
| **P6** | **73 件未登记脚本处置**（obs 席已分档：真缺陷 5 件） | A 先补 5 件真缺陷 / B 挂账 | §8.3 |
| **P7** | **`memory-append.mjs` 等旁路写入是否补镜像**（§5.2 真根因） | A 补镜像调用 / B 改为「对账闸承认多路径」 | verify 席提出 |
| **P8** | **是否为门禁运行历史新增持久面**（append-only `runs.jsonl`） | A 加 / B 不加 | obs 席推荐 A：这是唯一「现在完全做不成」的判据，且顺带治「证据被覆盖」 |
| **P9** | **`md` 档读侧语义**：读侧 7 件是否应当看开关 | A 看 / B 不看（现状） | arch 席转派 data 席 |
| **P10** | **`OPEN-ITEMS` §0r 自相矛盾**（`:15` 待授权 vs `:127-128` 已修） | 用户裁定哪份为准 | verify 席发现 |
| **P11** | **账本归属** | A 独立成册 / B 直接在 OPEN-ITEMS 顶部加一节 / **B+**（章程落 docs 单文件 + OPEN-ITEMS 顶部一行指针） | accept 席推荐 **B+**：声明不是机制，本仓已有「三值各说各话」的反例 |
| **P12** | **可证伪覆盖率棘轮**（67/72 门禁无空扫护栏） | A 建棘轮 / C→A 先补空扫护栏再建 / B 不建 | accept 席推荐 **C→A** |
| **P13** | **空扫平凡通过的修法**（§8.2b，门禁语义变更） | 用户拍板后交 arch/obs 席 | accept 席提出（属 R3） |

---

## 8. 本轮实测读数（全部可复跑）

```bash
# 架构分层与棘轮
node scripts/audit-architecture.mjs            # 106 模块 / 27025 行 / 运行时深度 11
node scripts/audit-architecture.mjs --gate     # 超阈才 exit 1

# 门禁全量（≈519s · ⚠ 读数非确定，见 §4）
node scripts/check-runner.mjs
# 本轮多次实测（同一仓、同一会话）：
#   212 pass · 0 xfail · 1 skip
#   210 pass · 0 xfail · 1 skip · 2 fail     ← §5 活体事件（md↔影子库失步）
#   209 pass · 4 fail                        ← verify 席并发时的读数
#   213 件 · 210 pass · 3 fail · 0 skip       ← obs 席并发时的读数
# ⇒ 跨会话并发跑门禁会互相污染；读数须连同上下文记录

# 载体对账
node scripts/check-record-parity.mjs

# 五层同步
node scripts/check-installed-sync.mjs          # 320/320 逐件 sha1 一致
node scripts/check-version-pin.mjs             # 三处一致 @ fcf6f4d3
node scripts/check-installed-features.mjs

# 治理侧
nav_graph mode="health"                        # 334 事件 / 58 ADR / STALE 0
```

### 8.1 治理侧读数

- nav：**334 事件**（seq 连续 ✓）/ **58 ADR** / 5 项目 · 8 模块 · 26 功能 · 39 文档工件 · 5 已退役 / 落点登记 153 · 未登记 3477 / **STALE 0**
- 计数闸压力 9 条，其中 **`feature:可配置评估通道` 8/3**、**`feature:sc-s05` 3/3** 已超阈 ⇒ 须 `nav_decide`
- **在途改动：61 项已跟踪 + 12 项未跟踪**（审查前须知：**审查对象本身在动**）

### 8.2 门禁可信度（0a 层 · ⚠ 数字已按 verify/obs 两席复核订正）

> **⚠ 订正留档**：本节初版写「210 条 / 180 件 / 38 件带 `--selftest`」，**三项全错**——
> ① 210/180 是我用**单行正则**统计的结果，**漏掉跨行条目**；精确解析（顶层括号配对）实为 **213 条 / 183 件**。
> ② 「38」是 `--selftest` 的**文本出现行数**，不是件数；真**件数 25**（`--selftest` 条目 26）。
> ③ 这本身即「**代理指标非判据**」的又一实例：用文本出现次数代理件数。
> 复算命令：`node .roundtable/_cap-count.cjs`（临时探针，顶层括号配对 + 字符串感知）。

- `CHECKS` 共 **213 条条目 / 183 件唯一**
- ⚠ **「38」与「25」都对，但是两个口径**（accept 席实证，勿再混用）：
  - **实现 `--selftest` 的脚本文件 = 38 件**（`scripts/*.mjs` 全仓 grep）
  - **CHECKS 中登记了 `--selftest` 条目 = 26 条 / 25 件唯一**
  - ⇒ 差额 13 件：**实现了 `--selftest` 却未登记该条目**（`check-claim-alignment` / `check-cue-space` / `check-i18n-keys` / `check-i18n-scan` / `check-journal-privacy` / `check-judge-kind` / `check-relevance-live` / `check-section-refs` / `effective-directions` / `inject-baseline-diff` / `migrate-cue-keys` / `test-i18n-render` / `check-runner` 自身）。
    ⇒ 按「未登记 = 没写」，这 13 件的自证能力**写了但从不运行**。
- `scripts/*.mjs` 共 **254 件**，**未登记 73 件**
- ⚠ **2 件登记但磁盘缺失**：`baseline-lab.mjs` / `baseline-lab-verify.mjs`
  —— 按仓规「登记了但文件缺失 ⇒ 判 FAIL 而非静默跳过」（`check-runner.mjs:86`），但本轮门禁**未报此红**，属**待查**。
- ⚠ **空扫护栏缺失严重**（accept 席实测 + 主持人复算）：`check-*` 共 **72 件**，含空扫护栏者仅 **5 件**（粗查口径）
  ⇒ **67 件在「扫描面为空」时会平凡通过**。
- ⚠ **门禁运行历史不落盘**（`check-runner.mjs:1239-1270` 只 console/落 tmp 且被下次覆盖）⇒「**历史上是否从未红过**」这类恒真筛查**当前做不成**（obs 席 C5 判据）。

### 8.2b 🔴 最重的假绿：空目录仍判「全部在阈值内」（accept 席受控证明 · 主持人已复现）

```bash
node scripts/audit-architecture.mjs --gate --dir <空目录>
# 实测输出：
#   静态循环依赖: 0
#   动态边隐藏环: 0
#   扇入最高:
#   规模最大:
#   ✅ 全部在阈值内
# exit=0
```

**这是「扫描面为空 ⇒ 平凡通过」的最纯形态**：0 个模块也算「全部在阈值内」。
⇒ **章程判据**：**凡以「集合内无违规项」为结论的门禁，必须先断言集合非空**（本仓已有正例可照抄：`check-runner.mjs` 对「登记了但文件不存在 ⇒ FAIL」的处理）。
修法属**门禁语义变更（R3）**，须用户拍板后交 arch/obs 席。

### 8.3 「判据存在但等于不存在」族（obs 席实测 · 0a 层核心）

> 这是比「假绿」更隐蔽的一类：**判据写了、跑了、报告了，但结论从不影响任何事**。

| 实例 | 实测 | 危害 |
|---|---|---|
| `essence-review-stability.mjs` | 打印「❌ 未收敛 ⇒ 不得接线自动执行」，却 **exit 全 0**，且**不在 CHECKS** | 判据等于不存在（同族：`deep-sleep-release` 台账 **0 行**） |
| `sleep-selfcheck.mjs` | 自述「退出码恒 0」；实测 448 行 `check.sleep` 中 `verdict=ok` **440**，而**含 `closureOk=false` 的 23 行全是 ok** | 「自检失败」被记成 ok |
| 失败件输出落**固定路径**（无时间戳） | 本轮**已真实丢失**一次 `eval-gate` 退出码证据（obs 席 F4） | 事后无法复盘 |
| **判据类·漏登记 5 件** | `section-ref.mjs`（被 `check-section-ref-parity` 当**事实源**读）· `memory_write_gate.mjs` / `memory-append.mjs`（被 `check-criteria` / `check-threshold-control` 当作「唯一强制点实际取值」读）· `essence-review-stability.mjs` · `scan-secrets.mjs`（**守隐私红线却未登记**） | 按「未登记 = 没写」属真缺陷 |

**附**：obs 席自评该分档口径**有漏报**（严格调用关系给 5 件，人工复核真值 ≥6，漏 `audit-css-usage`）——**口径本身已标出缺陷，未当作定论**。

### 8.4 扫描面污染（本轮活体）

- **现象**：专家 scratch 文件 `.roundtable/_obs-runner.json` **带 UTF-8 BOM** ⇒ `check-suite-config-read` 报「仓内文本件无 BOM」命中 1 件 ⇒ 门禁一度 FAIL。
- **obs 席判定**：属**「读数污染型」**（假绿的**成因**，非假绿本身）；**污染源是 PowerShell 重定向通道**（PS 5.1 `Out-File -Encoding utf8` 必加 BOM），**不是 agent 建文件**。
- **真病灶**：**「扫描面排除集」在仓内有 4 份实现 3 种意见**——`check-hardcode.mjs:58` / `check-public-content.mjs:118` / `check-script-consumers.mjs:70` / `check-suite-config-read.mjs:122`（后者**漏了** `.roundtable/`）。
- ⇒ 章程判据：**同一「排除集」语义只许有一份实现**（本仓既有「单一实现」纪律的又一适用面）。

---

## 9. 数字口径警告（本轮踩过，写进章程防重蹈）

1. **行数一律用 node 读 utf8**：PowerShell `Get-Content | Measure-Object -Line` 在**含中文大文件上误报偏少**
   —— 本轮实测 `docs/OPEN-ITEMS.md`：node **966 行** / PowerShell **621 行**（差 36%）。本仓 `arch-view` 铁律 2 已记此坑，主持人仍复犯了。
2. **台账按大小轮转**（`ledger.jsonl` + `.1`）：只读主档 ⇒ **轮转失明**（本仓已踩 4 次）。读台账须两卷都读。
3. **字段名会撒谎**：`check-record-parity` 的 `mdBytes/storeBytes` 实为**字符数不是字节**（中文 3 字节/字符）——与 `check-module-growth` 把「代码行」写成「物理行」同型。

---

## 10. 附：不存在该做而没做的事

- 本章程**不新建检查工具**；用户未要求造工具，且已有 **213 条** CHECKS。
- 本章程**不复制**任何待办条目到本文——OPEN-ITEMS 仍是唯一事实源。
- 本章程**未改任何代码/配置/真实数据/记忆库**（R1：决策态→施工态须具名授权）。

---

_2026-09-23 立 · 圆桌会议「全量检查章程」产出 · 六席：arch / accept / obs / verify / data / minimal · 主持人综合_
_⚠ **v2（已按 verify / obs 两席独立复核修正）**：修正 3 处数字（门禁条目 210→**213**、selftest 38→**25 件**、md 体量 0.06→**0.68 MiB**）+ 1 处根因（失步真因是 `memory-append.mjs` **旁路写入无镜像**，**已排除 data 席**）。_
_⚠ 本档为 **决策态**：所有结论均待用户拍板后进入施工态；§7 十项为待拍板隔离区。_
_⚠ **口径纪律**（本轮反复踩到，写进章程防重蹈）：凡引用数字**必须带集合名与量法**——见 §9。_
