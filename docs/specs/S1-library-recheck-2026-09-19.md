# 核心库板块（S1 库核心）检查报告 · 2026-09-19

> **性质**：**只读检查**（讨论态材料）。本次**未改库、未改代码、未改配置**；唯一新增产物是本报告文件。
> **检查对象**：S1「库核心」板块（`docs/specs/S1-library-plan.md` §板块职责：*被三链共享的事实源与落点；保证每类信息在库里有落点*）。
> **覆盖边界**：① 库本体（三索引 + notes + `.records` + 环事件 + 审计面）；② 库的**写入面**（生产链落库路径）；③ 库的**读取面**（读侧 / 材料侧判据）；④ 该板块相关的机检与巡检面。
> **不覆盖**：`src/` 全量架构、UI 渲染、S2/S3/S4 板块内部（各自另册）。
> **证据规则**：每条发现给**命令 + 原始读数**；凡推理处标【读码】；凡实测处标【实测】；凡我自己的判断被复核推翻处标【订正】。

---

## 0. 一句话结论

**库本体数据面健康（往返逐字节一致、类型契约全绿、环路自洽），但「找得到」这条链上有真实缺陷：
索引指针存在 90 段悬空（11.6%），且造成它的两处机制都还在生效——生产链的新索引行不校验 §小节、
写门的 §小节判据在文件超容量时被容量分支短路（MEMORY.md 520% / AGENT.md 250% ⇒ 判据恒不执行）。**

---

## 1. 合格面（先给证据，不给形容词）

| 断言 | 命令 | 实测 |
|---|---|---|
| 板块相关门禁全绿 | `node scripts/check-runner.mjs --only …`（12 件） | **12 pass · 0 xfail · 0 skip**（子集，非全量）：`check-content-types` / `check-carriers` / `check-field-usage` / `check-cue-space` / `check-memory-write-path` / `check-record-parity` / `check-ring-coverage` / `audit-architecture` / `audit-wiring` / `audit-fnspan` |
| md ↔ Record 往返 | `node scripts/check-record-parity.mjs` | **11 个文件逐字节一致**（MEMORY 414 记录/29357B、AGENT 131/8379B、notes/lessons.md 1519/77116B …）；写时自证 **4424 次镜像 · 可还原 4424 · 分歧 0** |
| kind → 唯一面 | `node scripts/check-content-types.mjs` | **PASS**：内容面 4 · 经历面 7 · 无面 2；可达缺 0；roots 主从声明完备 |
| 环路登记自洽 | `node scripts/check-ring-coverage.mjs` | **PASS**：13 类 kind 全登记 · 5 环各有 KPI · 无空环/无陈旧申报 |
| 事实源规模可解析 | 直读 `.records/records.jsonl` | 4628 条 · **badJSON 0** · 环记录（`file=''`）966 条；`ring-events.jsonl` 840 行全部可解析 |

---

## 2. 发现清单（按严重度）

### 🔴 L1 · 索引指针悬空 90 段 / 775（11.6%）——「找得到」断在索引→详情层

**判据**（三重独立口径，均非 0）：

| 实现 | 命令 / 口径 | 读数 |
|---|---|---|
| 写门 `memory_write_gate.mjs` | `MEMORY_ROOT=<库> SHOUCANG_CAP_MEMORY=999999 node <库>/scripts/memory_write_gate.mjs MEMORY.md <库>/MEMORY.md` | MEMORY **56** 条 + AGENT **52** 条（其多指针行解析有伪影，偏高） |
| 状态机逐指针复算（本报告） | 复用 `lib/forgetops.js#sectionExists`（口径 = `treeops#matchSection`） | **90 段**：MEMORY 77 · AGENT 13；去重（file+§）**52 组** |
| 对账器 `memory-reconcile.mjs` | `node scripts/memory-reconcile.mjs` | **30 条**（去重后逐条列出，标「写门视之为 exit=2 硬错」） |

**分类（本报告口径，逐条可复现）**：
- **57 段「真缺失」**：目标 notes 文件里既无同名标题、也无包含关系标题。例：`→ notes/lessons.md §路径基准差异` · `§DSH 端到端验收` · `§ZCode 环境` · `§会话开头注入` · `§版本控制与上游协作`。
- **33 段「同名歧义」**：小节**存在但同名两份**（`##` 与 `###` 同名），`matchSection` 依「宁缺毋滥」返回 null ⇒ 判悬空。例：`env.md §插件注入`（19 段）、`lessons.md §服务与重启约束`（9 段）、`env.md §Windows npm 执行策略`（4 段）。

**两处真实后果（均已实测）**：
1. **读取面**：`node <库>/scripts/read_section.mjs notes/lessons.md "路径基准差异"` ⇒ **exit 1**「小节不存在」。而同一命令读有效指针（`§假绿与实证`）正常返回正文 ⇒ 索引行进了上下文、agent 顺着指针去读、**读不到**。
2. **材料面**：`src/deepsleep-materials.ts:131` `if (!sectionExists(root, f, s)) continue`（静默、无计数、`catch{}` 吞掉）⇒ 悬空/歧义小节**进不了深睡材料**。实测冷候选 **37 条 → 10 条被剔（9 真缺失 + 1 歧义）= 27%**。

---

### 🔴 L2 · 写门的 §小节判据在「超容量」分支被短路 —— **自述与实况相反**

**代码位置**：`<库>/scripts/memory_write_gate.mjs`

```
if (chars > limit) {            // ← 容量分支
  … if (pct > 150) { console.log('exit=0 允许写入（**超 150%：强告警，但不阻断**）…'); process.exit(0); }
  console.log('exit=0 允许写入（**超容量仅提醒，不阻断**）…'); process.exit(0);
}
if (issues.length) { … process.exit(2); }      // ← 悬空指针判据在其后，超容量时永不抵达
```

而 `:246` 的注释写的是「⚠ 悬空指针（exit 2）**不动**：那是**正确性**问题，不是容量问题」——**实况相反**：超容量时指针判据根本不执行。

**双跑实证（同一文件、同一门，只差容量门值）**：

| 命令 | 结果 |
|---|---|
| `SHOUCANG_CAP_MEMORY=5000 … gate MEMORY.md <库>/MEMORY.md` | **exit 0**「允许写入（超 150%：强告警，但不阻断）」——**悬空指针一字未提** |
| `SHOUCANG_CAP_MEMORY=999999 … gate MEMORY.md <库>/MEMORY.md` | **exit 2**，逐条列出 56 条悬空小节 |

**当前生效面**（实测容量）：`MEMORY.md 26022/5000 = 520%` · `AGENT.md 7489/3000 = 250%` · `USER.md 2619/3000 = 87%`
⇒ **该判据实际只在 USER.md 上生效**；MEMORY/AGENT 恒走容量分支 ⇒ **指针与格式判据在这两个主档上恒不执行**（面板编辑走同一门 ⇒ 同样不校验）。

---

### 🟠 L3 · 生产链的新索引行不校验 §小节（悬空指针的新增仍在发生）

**调用链【读码】**：`src/distill-write.ts:283` → `memAppend(dep, t, 'new', nl, '-', resolved)` → `memory-append.mjs <target> - --new <索引行>`；
`scripts/memory-append.mjs:96-101` 的 `--new` 分支**只校验行首标签**（`^\[(env|tool|flow|lesson|…)\]`），随后直接追加到文件尾——**对行内 `→ notes/x.md §y` 不做事后校验**。白名单门 `targets.ts#gateMemoryAppend` 只校 target 名字。

**先红实证（隔离库，未触真库）**：
```
MEMORY_ROOT=%TEMP%\sc-lib-probe
node scripts/memory-append.mjs MEMORY.md - --new "[env] 探针悬空指针准入 · → notes/lessons.md §不存在的探针小节XYZ"
→ exit 0，行已落盘（第 415 行）
```
同一条行过写门：`gate MEMORY.md <该文件>` ⇒ exit 2「指针悬空小节: notes/lessons.md §不存在的探针小节xyz 不存在」。
⇒ **同一内容，两条路径两种判据：生产路径放行、门禁路径拒收。**

**新增仍在继续（库 git 取证）**：`git log -S '§ZCode 环境'` ⇒ 首现 **2026-09-18**；`§会话开头注入`/`§版本控制与上游协作` 同样 **2026-09-18**；`§DSH 端到端验收` **2026-09-17**。⇒ 不是历史存量，**是现行产线的持续产出**。

---

### 🟠 L4 · 同名小节重复 ⇒ 读侧/写门/材料侧**三套判据分叉**

**同一指针 `notes/env.md §插件注入`（该节确实存在，且 `##`/`###` 各一份）**：

| 判据 | 实现 | 结论 |
|---|---|---|
| 读侧（权威） | `read_section.mjs notes/env.md "插件注入"` | **exit 0 正常返回正文** |
| 写门 | `memory_write_gate.mjs`（标题集去重后唯一命中） | **通过**（不报悬空） |
| 材料侧 | `forgetops#sectionExists ⟷ treeops#matchSection`（多命中 ⇒ null） | **false = 判为不存在** |

⇒ **材料侧是唯一的少数派**，且它的判定被 `deepsleep-materials.ts:131` 用来**静默剔除候选**（无计数、无审计）。
同名重复实测：`notes/env.md` 的「插件注入」与「Windows npm 执行策略」（去日期后缀后 `##`/`###` 同名）；对账器另报 `notes/lessons.md`「假绿与实证」（其口径未去日期后缀）。

---

### 🟡 L5 · 容量门已成「只报不拦」（治理事实，非缺陷）

- 读数：MEMORY **520%** · AGENT **250%** · USER 87%。
- 门的行为：`>150%` 分支 `exit 0`（`:251-262`，2026-09-16 三次修正时**主动收回硬拒**，理由=硬拒会挡掉深睡全部写入，注释在案）。
- 后果：声明容量（5000/3000）与实况差 **5.2×/2.5×**；注入面不再依赖容量门，而依赖 IR1 的动态面选行（已落地）。**登记为事实，不判定为待修**——除非用户要改容量口径。

---

### 🟡 L6 · 该判据没有可见面（门禁 / UI / 巡检三缺）

- `memory-reconcile.mjs`（唯一逐条列出悬空的件）**不在 `check-runner.mjs#CHECKS`**（实测 grep 0 命中），且**无论发现多少问题都 `exit 0`**（实测：有 ❌ 悬空指针 + ①闭合未解释差异，仍 `exit=0`）。
- 面板「指针健康/悬空行告警」已于 **2026-09-11 按用户要求移除**（`src-client/panes-memory-detail.js:156` 注释在案）。
- `check-memory-write-path.mjs`（在册）是 **AST 级旁路检查**（MEMORY_ROOT 注入 + 白名单），**不校验指针完整性**。
⇒ 「索引指针是否指得中」当前**没有任何机制会自动翻红或显示**——与仓内纪律「已知未修必须进表」相冲突。

---

### 🟡 L7 · 备份件进了版本库（库 git 体积）

- `.records/records.jsonl.bak-cue-20260918T143105`（**2.16 MB，已跟踪**）+ `.bak-noteimport-*` + `.bak-subjectfix-*` → `.records` 备份合计 **2.53 MB 全被 `<库>/.git` 跟踪**（`git ls-files .records` 11 条）。
- `<库>/audit/backup-*` **45 个目录**（最近 30 个 4.36 MB；`memory-append` 的 `SHOUCANG_BACKUP_KEEP` 缺省 30）。
- 规模：库工作区 **25.67 MB** / 库 git **9.86 MB**（packs 2 · 5669 objects · 648 tracked files）。
- 库 `.gitignore` 仅两行（`audit/*.tmp` · `*.ui-tmp`）。用户在意磁盘 ⇒ 登记。

---

## 3. 读数（不判定为缺陷，供决策）

| 项 | 读数 | 出处 |
|---|---|---|
| 环事件分布 | `decision.open 435 / decision.outcome 162`（**待回收 273，回收率 37.2%**）· `commitment.open 38 / commitment.settle 1`（**2.6%**）· `relation.assert 75` · `valence.record 124` · `collision.record 2/accept 2/land 1` | `.records/ring-events.jsonl` |
| 索引规模 | `MEMORY.md` 412 指针行 / 415 行 / 53,808 B · `AGENT.md` 90 指针行 + 13 画像行 / 17,974 B · `USER.md` 8 指针 + 28 画像 | 直读 |
| notes 规模 | 8 主件 + 4 归档件；`lessons.md` **178,168 B / 141 节** · `env.md` 53,761 B / 74 节 · `INDEX.md` 45,495 B · `agent.md` 27,798 B | 直读 |
| 对账器其它读数 | 台账 15,218 行 · 被拒率 1.6%（8/492）· 成熟度小节 68 个/达 gate 38 · 影子打分 corr(importance,relevance)=**-0.187** · 未解释行 **MEMORY 368 / USER 21 / AGENT -2** | `memory-reconcile.mjs` |

> ⚠ **`memory-reconcile` 的「① 闭合」368 行未解释**是**自举基线后**的记账差（基线 2026-09-11T08:52），**不等于数据损坏**——往返一致性（check-record-parity）是通的。此处只登记读数，不作因果断言。

---

## 4. 与既有登记的关系

| 发现 | 既有登记？ | 说明 |
|---|---|---|
| L1 悬空指针 | ❌ 未登记。`OPEN-ITEMS.md` 无此项；`S1-acceptance-record.md` 的 A 类只断言「三面载体可读」，**无指针完整性断言** | 新增 |
| L2 门短路 | ❌ 未登记 | 新增 |
| L3 生产链不校验指针 | ❌ 未登记 | 新增 |
| L4 同名小节 + 三套判据 | 部分：对账器会 ⚠ 报「同名主题既作 ### 又作 ##」，但它不是门禁 | 新增（后果面） |
| L5 容量只报不拦 | ✅ **已在案**（`memory_write_gate.mjs:251-262` 注释 + `OPEN-ITEMS` 相关条目） | 事实重述 |
| L7 备份进库 | 部分：2026-09-17 审计报告 P1-5 提过 `scripts/_tmp` 残留；`audit/backup-*` 未提 | 新增 |

---

## 5. 处置建议（**分档；本报告不自行施工**）

> 边界声明（R1–R5）：本报告处于**讨论态**。「改码 / 改库 / 改门禁基线」需要具名授权；下列任一档开工前，我会先出**方案 + 验收**成对（含先红方式），再动手。

| 档 | 事项 | 判据（可机检） | 风险 |
|---|---|---|---|
| **A · 只读可做** | 把悬空指针做成**在册报告件**（登记进 `CHECKS`，语义=报告态） | 跑一次即逐条列出；**不是** exit 0 的日志 | 近零（新增文件 + 一行登记） |
| **B · 修判据（须授权）** | ① 写门：把 `issues`（指针/格式）判定提到**容量分支之前**，或让容量分支带出指针问题；② 生产链：`--new` 前对行内 `§` 做一次 `sectionExists`（口径复用 `forgetops`，不新造实现） | 先红：构造一条悬空索引行 ⇒ **两条路径都拒**；回归：现有 12 件门禁 + 全量 `npm test` 不回归 | 中（改的是**写门**，会影响深睡/面板写入） |
| **C · 修数据（须拍板）** | 存量 90 段：能对应到既有小节的**重锚**（57 真缺失里多数据此可修），不能对应的**建节或改指针** | 修完复跑三口径 ⇒ **悬空 0**；且 `read_section` 逐条可读 | 高（改的是**真源数据**，须备份 + 可回滚 + 幂等） |
| **D · 结构（须拍板）** | `env.md` 两处同名小节合并（`##`/`###`）；`notes/lessons.md` 178KB/141 节是否拆分 | 同名重复归零 ⇒ 歧义类悬空归零；深睡冷候选剔除率 27% → 0 | 中（动结构，影响指针） |
| **E · 卫生** | `.records/*.bak-*` 与 `audit/backup-*` 出库（或入 `.gitignore`） | `git count-objects` 增量归零；库工作区体积下降 | 低（备份件非事实源） |

**我推荐的顺序**：**A →（授权后）B → D → C → E**。
理由：B+D 后悬空不再新增且歧义清零，再修存量（C）才有稳定的判据可依；否则修完还会长回来。

> **已整理为成对方案册**（2026-09-19）：`S1R-section-ref-plan.md`（方案）+ `S1R-section-ref-acceptance.md`（验收）。
> 方案册把上述 A–E 收敃为 **P0 判据层 / P1 写入收口 / P2 数据层 / P3 卫生** 四册，并给出 5 条架构决策与 4 项待拍板。

---

## 6. 复现命令（逐条可核）

```sh
LIB="$USERPROFILE/.dsh/skills/managing-memory"        # 实测本机库根

# 口径①：写门（抬高容量门以隔离出指针判据）
MEMORY_ROOT="$LIB" SHOUCANG_CAP_MEMORY=999999 node "$LIB/scripts/memory_write_gate.mjs" MEMORY.md "$LIB/MEMORY.md"
# 口径②：对账器（逐条列出悬空）
node scripts/memory-reconcile.mjs
# 口径③：读侧（权威读取器）
node "$LIB/scripts/read_section.mjs" notes/lessons.md "路径基准差异"     # → exit 1 小节不存在
# 生产链先红（隔离库，勿对真库）
MEMORY_ROOT=/tmp/sc-lib-probe node scripts/memory-append.mjs MEMORY.md - --new "[env] 探针 → notes/lessons.md §不存在的小节"
# 库 git 取证
git -C "$LIB" log --format='%ad %h %s' --date=short -S '§ZCode 环境' -- MEMORY.md AGENT.md
# 板块门禁
node scripts/check-runner.mjs --only check-content-types,check-ring-coverage,check-record-parity,check-cue-space,check-memory-write-path,check-carriers,check-field-usage,audit-architecture,audit-wiring,audit-fnspan
```

---

## 7. 本次检查的自我订正（如实并陈）

| # | 我起初的判断 | 复核后的实况 | 根因 |
|---|---|---|---|
| 1 | 「索引指针悬空 268 条」 | 我的首版解析器**把小节名按 `/` 切碎 + 未 trim CRLF** ⇒ 假高 | 自己的仪器没先自检（**先红我自己的工具**） |
| 2 | 「matchSection 判定 + 100% 悬空」 | 我把 `memRoot` 传成了 `<库>/notes`（函数内部还会拼 `notes/`）⇒ 恒 false | 复用现成实现时**没先跑一支阳性对照** |
| 3 | 「面板编辑 MEMORY.md 会被写门 exit 2 挡住」 | 恰恰相反：**容量分支先 return ⇒ 不挡** | 只读了一半代码就下结论 |
| 4 | 「三个口径读数 30 / 90 / 108 至少有一个坏」 | 三者**扫描范围与多指针解析都不同**（写门只取行内最后一个指针；对账器取首个且去重）⇒ 差异是**口径差**，不是谁坏了 | 见 §2-L1 表 |

> **同一条纪律再次成立**（仓内已有指针：`notes/lessons.md §假绿与实证`）：**自己的测量工具必须先做阳性/阴性对照**，否则会把仪器缺陷当成被测对象的缺陷。

---

_检查：2026-09-19 · 只读 · 未改库/未改码；本文件是本次唯一新增产物。_
