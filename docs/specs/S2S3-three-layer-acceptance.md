# S2S3 · 三层记忆供给链协调验收方案

> **性质**：**验收册**（与 `S2S3-three-layer-plan.md` **v2** 成对）。**先定"完成"再动手**；任一条红即未完成；未通过的册**回退该册**。
> **版本**：**v2（2026-09-19 圆桌会审后修订）**——会审推翻了 v1 的 **10 条空判据**、3 条硬判据的写法、以及全部计数锚。
> **口径**：每条给 **判据 / 检查方式 / 阈值 / 失败退回**四要素；计数类**必须带口径描述串**（§0.2）。

---

## 0. 验收总则（本册全适用）

### 0.1 反假绿 8 条
1. **"等价/不变"类断言首跑必须红**；2. 计数类断言**必须给口径与分布**；3. **夹具绿 ≠ 真数据绿**；4. 不得用"文件存在/exit 0"当"本次成功"；
5. 门禁过滤**只显式点名**，合入跑**全量**；6. 每条读数给**可复现命令**；7. **自己的仪器先做阳性/阴性对照**；
8. **成对断言**：凡"某量为 0"的判据，必须同时断言"该机制**运行过**"（否则"没跑"与"没产出"不可分——本项目实测：`treeOps 0` 是**字段缺席被读成 0**）。

### 0.2 计数纪律（会审决议，**本册最强的一条防线**）
计数类判据**禁写死数字**，必须带**口径描述串**：
`{数据源, kind, 过滤条件, 去重键, 档位, 采集时点}` —— 数字只作**锚**。
- 蒸馏 run 的合法档位只有两个：**档 L**（`stop` 存在，不去重 → 锚 352 行 / added 1105 / failed 882）· **档 S**（同源同过滤 + 键 `sid+chunk+chunkStart+chunkEnd` 首见去重 → 锚 173 键 / 574 / 360）。采集时点 `2026-09-19`。
- **身份键只许 `sid+chunk+chunkStart+chunkEnd`**；**禁止把 `rejected`/`route`/`added`/`failed` 等结果字段计入身份键**（实测：`+rejected+route` 得 217 键 ⇒ "重复 135"，而 42 个同键组里 34 组 `rejected` 不同、36 组 `added` 不同 ⇒ 会把**真重蒸判成不同段**）。
- **禁用 205 / 693 / 407**（= 全 688 行去重，混入 **32 个无 `stop` 的写侧摘要退化键** `sid|||`）；**禁用 688 作分母**。
- **同一条判据内两侧必须同档；跨条允许不同档，但必须各自声明**；混档 ⇒ FAIL。
- 口径描述串缺失/不符 ⇒ 该条及**所有依赖它的计数类判据**一并 FAIL（不许降级通过）。

---

## 1. G 判据 ↔ 册映射（v2 重写）

| G | 判据（一句话） | 册 | 检查方式 | 先红 / 现状 |
|---|---|---|---|---|
| **G0** | L1 **失败明细随行**：失败条目带**条目身份**（非仅计数）且进入 L2 材料 | 册零 | `write.ingest` **+1 载荷字段** + L2 材料段计数；分母用**档 L**（锚 352） | ❌ 现字段只有 `attempted/written/rejected/failed`（**无条目标识**） |
| **G0b** | **落盘一致性**（册零主判据）：并发夹具下**不得出现"索引行在而 notes 节不在"**；且**索引行与节要么同写、要么同不写** | 册零 | 并发夹具（蒸馏写 × 面板改写）**必须先红出该缺陷** | ❌ 现状：`sectionops.applyConvergeOps:92` 直写无 gate/锁（第 91 行自陈） |
| **G1** | L1 落盘**不再产生孤儿**：append 失败 ⇒ 该主题**无新索引行** | 册零 | 真库 `check-section-refs`（须保持 0/0/0/0）+ 审计对账 | ✅ 现为 0（S1R 收口），须**保持** |
| **G2** | L2 **存在且看全**：满足双维判据的会话**恰好 1 次**复盘（成功路径恰好一次 + 失败重试有上界），材料覆盖整个会话 | 册一 | `kind=session-review` 的 `reviewedSeq` + `formatVersion`/`fp` 双证 + 材料段计数；**三态**（`not-triggered`/`skipped-by-threshold`/`reviewed`） | ❌ 审计行 **0**；**先红成立** |
| **G3** | L2 **提案可执行且可回滚**：提案经 S3 执行后留档、可还原；复跑幂等 no-op | 册一 | 提案流 `proposals-<sid>.jsonl`（append-only）+ 归档文件含原行原文 + 幂等复跑 | ✅ 已落地（2026-09-19）：提案流 `proposals-<sid>.jsonl` + **唯一消费者** `src/proposal-apply.ts`（逐字行级校正 + **先留档再改**（`rollback/<opHash>.json`）+ 幂等账 `applied.jsonl` + 三拒（路径穿越/陈旧/歧义））；判据 `test-proposal-apply`（静态 3 + 行为 6，**先红 A1–A3**）；**默认关闭**（`SHOUCANG_PROPOSAL_APPLY=1` 才执行） |
| **G4** | L2 **不越界**：只对本会话产出的条目提提案；跨会话提案数 = 0 | 册一 | **v1 写法作废**（`outOfScopeTouched` 全仓 **0 命中** ⇒ 恒真）。**v2**：以"**逐字命中 L2 材料**"成对取证（先例 `sectionops.ts:73-75`）+ 构造跨会话条目必须被拒 | ❌ 字段不存在（**从零写起**） |
| **G5** | S3 **影响账完整**：当日每条产出条目**都有裁决**，**两侧同口径只判差集为空** | 册二 | 载体 = **`added`**（`appends+newIndex+profiles`），轮次用 `sleepEpoch`；缺省**档 S**；账并入 `sleep-reports.jsonl` | ❌ 无影响账 |
| **G6** | S3 **不产出**：**三通道**同时为 0 —— `added==0`（principles）**且** `replaced==0` **且** `profiles==0` | 册二 | `kind=deep-sleep`；**双断言成对**：① 运行性（本轮该行存在且 `at ≥ T0`）② 通道级零产出 | ❌ 现状 `added` **65**（49 轮） |
| **G7** | S3 **真的压缩**：`archive/compress > 0` 且**方向节点保留**（每条仍有可读方向 + 可解析指针） | 册二 | 归档条数（交叉核 `kind=treeops` 的 `applied`/`archived`）+ `check-section-refs` 保持 0 | ❌ 现 `forgetArchived 4`（候选 391）；压缩近零 |
| **G8** | **层间交接机检**（在册件） | 册三 | **v1 写法作废**（"145→147"会因无关新增错位）。**v2**：`node scripts/check-runner.mjs --list` **含 `check-layer-handoff`** 且全量 **fail==0** | ❌ 无此件 |
| **G9** | **输入量可见**且**注入面不变** | 册三/册四 | **v1 写法作废**（"注入面逐字节不变"默认态恒真、方向反了）。**v2**：端点值 **== 审计复算值**（逐值相等）+ **介质戳敏感性**（改库/改报告 ⇒ `libStampOf().media` 必须变化） | ❌ 无投影 |
| **G10** | **每轮睡眠必有汇报**（五段齐）且**日历式留存** | 册四 | `reports/sleep/<date>.md` + `sleep-reports.jsonl`；同日多轮**追加不覆盖** | ✅ 已落地：`reports/sleep/<date>.md`（追加不覆盖）+ `sleep-reports.jsonl`；`test-sleep-report` 第 3 组 |
| **G11** | **报告永不删除** | 册四 | **v1 写法作废**（"不做功能自然不触发"）。**v2 指纹账**：追加式 `audit/sleep-report-ledger.jsonl`（`{dateFile,sha256,bytes,lines,firstSeenAt}`）+ **三断言**：① 行数单调不减且增量 == 本轮轮数 ② 账内**每条**当前 sha256 相等（覆盖 100%） ③ 报告计数 == `sleep-reports.jsonl` 同轮值（逐值相等） | ✅ 已落地：`sleep-report-ledger.jsonl`（整文件 sha256/bytes/lines/sections/firstSeenAt）+ **三断言**（`test-sleep-report` 第 5 组；② 口径 = **前缀哈希**，实测修正） |
| **G12** | **只标记不处置**：`unused/counter` 不触发 archive/delete；标记与裁决**相互独立** | 册四 | `sleep-issues.jsonl` 状态行 + 反例夹具（构造 `unused` ⇒ 条目**仍在原位**） | ✅ 已落地：`sleep-issues.jsonl`（`state:open` + `handled:not-handled`）+ `test-sleep-report` G12 反例夹具（写标记前后 notes **逐字节不变**） |
| **G13** | **问题统计**分得清"记忆问题 vs 召回问题" | 册四 | `/sleep/issues` 统计（`suspect-recall` 与 `suspect-quality` 分开计数）；**分母固定当日产出条数** + 双字段 `unusedAtFirstObservation`/`stillUnused` | ✅ 已落地：`/sleep/issues` 输出 `byTag` + **两个分母**（`impactRows` / `producedToday`）+ **双字段** `unusedAtFirstObservation`/`stillUnused` |
| **G14** | **UI 可见（占用运行总览晨起摘要卡位）**，**不新增独立视图** | 册四 | **v1 引用错**（`panel-arch.ts:45` 是 `ARCH_MODULES` 字符串数组，无视图）。**v2 落点 = `src-client/panes-overview.js#ovMorningCard`**（`body.js:266-279` 是行号已失效的历史注释，**不再改**）；判据 = 契约表新增路由 **⊆ `{/sleep/reports, /sleep/issues}`** 且**条数 == 实际登记数（≥1）**；+ **晨起摘要卡元素消失断言**（`/memory/overview · delta / weekDiff` 文本退役后不得再出现）；+ `ui-geo-regress --shots` 图证 + DOM 几何 + 与端点**逐值一致**。⚠「零新端点」注释真身在 `src-client/body.js:264/279`，**同提交更新/删除**（否则与册四自相矛盾） | ❌ 现为晨起摘要卡 |
| **G15** | **晨起摘要退役 ≠ 注入源断裂** | 册四 | **v2 精确等价**：抓改前 `delta.md.rows`，断言改后报告派生 rows **逐元素相等**（源逻辑 `deepsleep-run.ts:643-678` 的 `pushDiff` + `slice(0,3)`）；+ **介质戳**：`src/supply-stamp.ts:59` 签 `delta.md` size ⇒ 报告**纳入戳**（判据：篡改报告 ⇒ `media` 变化）或**显式声明不参与并记理由**。<br>⚠ **2026-09-19 施工后按实况改判**（原措辞假设"派生 == delta 行"，而实测两者**行语义不同**）：<br>· **主源** = 报告派生（与报告正文**同函数**）⇒ 判据 = **注入块 == 报告提存/压缩/统计段** 逐元素（`test-sleep-report` 第 4 组）；<br>· **兜底** = `delta.md.rows`（主源为空时）⇒ 判据 = **逐元素相等** + 48h 过期即弃（`test-inject-cache` **S2c**）；<br>· **不跨源比等价**（行语义不同：方向级摘要 vs 带源指针画像行）；<br>· **介质戳** = 三条介质只许多签不许少签（activity · `sleep-reports.jsonl`〔派生源〕· `delta.md`〔兜底源〕，口径统一 `size:mtimeMs`），篡改汇报行 ⇒ `media` 变、只动人读 md ⇒ 不变 | ✅ 主源/兜底/戳三判据已落地（含先红：S2b/S2c 在旧实现下必红） |
| **G16** | **阈值可调且接线三处齐全** | 册四 | **v1 写法作废**（"进表"≠"有值"：`check-threshold-registry` 16 项里 12 项 `preregistered:false/samples:0`）。**v2**：断言 **schema 解引用 == 3 处** **且** 真机改值后**读回 == 3** | ❌ 无此键 |

### 1.1 空判据清单（v1 的 10 条 → v2 替换）

| v1 | 为何空（无法失败） | v2 替换 |
|---|---|---|
| G0 | 无阈值、依赖尚未落地的册一 | 拆 **G0（字段级，可先红：字段不存在）** + **G0b（并发夹具，必须先红出跨文件不一致）** |
| G2 | "恰好一次"与"失败重试"自相矛盾（悖论式） | 拆"**成功路径恰好一次**" + "**失败重试上界**"；补三态审计 |
| G4 | 断言字段 `outOfScopeTouched` **全仓 0 命中** ⇒ 恒真 | 改"逐字命中材料"成对取证 + 构造跨会话条目被拒 |
| G5 | "当日产出"口径未定，不可复算 | 写死载体 `added` + 同档 + **差集为空** |
| G8 | 硬编码件数（145→147）会因无关新增错位 | 断言 `--list` 含该件 + 全量 `fail==0` |
| G9 | "注入面逐字节不变"默认态恒真且方向反 | 断言端点值 == 审计复算值 + 介质戳敏感性 |
| G11 | "不做功能自然不触发" | 指纹账三断言（§1 G11） |
| G13 → G14 | 引用 `panel-arch.ts:45` 与视图无关 | 落点改 `panes-overview.js#ovMorningCard` + 路由白名单 + 元素消失断言 |
| G15 | 只断言"进表"，不要求有值 | 断言 schema 解引用 == 3 + 真机改值读回 == 3 |
| G7（部分） | 只断言"压缩数>0"，不判"方向可辨" | 补 H-1 人工抽样（**待拍板**：建议 n=20、≥18/20） |

**非空（可保留）**：G1 · G3 · G6（改通道级后）· G10 · G12 · G15（补等价 + 戳后）。

---

## 2. 三条硬判据（**成对断言，缺一判 FAIL**）

### 2.1 H-① S3「不产出」
- **写法**：`运行性` —— 本轮存在 `kind=deep-sleep` 行且 `at ≥ T0`；**且** `零产出` —— **通道级** `principles.added == 0` **且** `replaced == 0` **且** `profiles == 0`。
- **为什么必须成对**：缺"运行性"⇒"没跑"被当成"没产出"（本项目实测过"探针 PASS ≠ 生效"）；缺"通道级"⇒ 用轮级 `added` 会**误红**（轮级 `added` 只来自 `applyPrinciples`，画像/converge 通道不进该数）。

### 2.2 H-② 报告「永不删除」
- **写法**：指纹账 + 三断言（§1 G11）。
- **为什么不能用"文件存在"**：追加式产物的"存在"永远为真；只有 **sha256 + 行数单调 + 逐值相等** 才拦得住"被覆盖/被截断"。

### 2.3 H-③ 注入源「不断」
- **写法**（2026-09-19 施工后**回写为实际形态** —— 原 v2 措辞假设"派生 == delta 行"，实测两者**行语义不同**）：
  主源 = **报告派生**（`sleep-report#latestDerivation`，与报告正文同函数）⇒ 断言「**注入块 == 报告提存/压缩/统计段**」
  **逐元素**（`scripts/test-sleep-report.mjs` 第 4 组：3 行派生逐个对函数 + 其中每个**数值逐个在报告正文命中**）；
  **兜底** = `delta.md.rows`（**主源为空时**回落 —— 首轮睡眠未跑 / 本轮无可陈述变化）⇒ 断言 **逐元素相等** 且
  **48h 过期即弃**的旧语义保留（`scripts/test-inject-cache.mjs` **S2c**）。
  两者**各自与自己的上游同源**，**不做跨源等价**（派生 = 方向级摘要；兜底 = 带源指针的画像行）。
- **介质戳敏感性**：介质**只许多签不许少签** —— activity.jsonl · `sleep-reports.jsonl`（派生源）· `delta.md`（兜底源）；
  篡改汇报行 ⇒ `media` 必变；只动**人读留存面** `reports/sleep/*.md` ⇒ **不变**（会审 §3.4 的"声明不参与 + 记录理由"）。
- **为什么不能用"文本非空/源指针一致"**：两行可同时变空仍通过（v1 的 G15 正是如此）；且"空块"在
  **首轮睡眠未跑**时是**合法态** ⇒ 判据必须分**两分支**（主源非空 ⇒ 逐元素相等；主源为空 ⇒ 兜底非空），
  而不是"块非空"。

---

## 3. 反例自证（**故意构造的假绿**，断言必须拦住）

| # | 反例 | 断言能否拦住 | 前提 |
|---|---|---|---|
| 1 | **`injected==0` 三义**：`src/mcl.ts:511` fast 通道**硬写 0**（phase=inject 中 `injected===0` 有 3072 行）；slow 的 `injected` 是**材料字符数**（`mcl.ts:533`，246–482）；compliance 段 **3498 行无该字段** ⇒ 走 fast 的条目会被**全量误标 `unused`** | **只有写死 `phase==='inject' && typeof injected==='number' && injected>0` 才拦得住** | 口径句必须落进代码 |
| 2 | **采集水位假 0**：`access-real.jsonl` 由 `harvest-access.mjs` 按 seq **水位增量派生**（采集器没跑时"真读 0"与"未采集"不可分） | 需**先断言采集新鲜度**（水位 ≥ T-24h 且本轮显式记 N） | 判据须含"采集器在跑" |
| 3 | **分母混淆式假绿**：用 **688** 或 **205** 当分母 ⇒ 336 条写侧摘要行**稀释**分母、32 个退化键**虚增**键数 | **自带口径描述串才拦得住**；只写数字拦不住 | §0.2 |
| 4 | **`converge`/维护量恒 0 单边断言**：账内已有反例（`converge-summary {tried 3, applied 3, archived 3}`，**实测确落在深睡轮窗口内**——按逐轮 `[epochSince, at]` 命中 `epoch-1789532694902`；`kind=treeops` applied 17/archived 17）。<br>⚠ `epochSince` 是**轮起点**，**不可当区间下界**（轮与轮接力：第 N+1 轮 `epochSince` = 第 N 轮 `at`） | **v2 成对措辞**：「**深睡行内不得出现落地计数；落地事实须由 `kind=converge-summary` 独立台账陈述，且两者不得矛盾**」——第二半在真实数据上**会被台账行触红**，这正是它该拦的：拦的是"**用深睡行内字段缺席冒充落地为 0**"；字段名写错（`treeOpsTried` 类）**判 FAIL，不许降级为 0** | §0.1-8 |

---

## 4. 先红清单（改造前必须看到的红）

| # | 册 | 先红方式 | 判据意义 |
|---|---|---|---|
| 1 | 册零 | **并发夹具**（蒸馏写 × 面板改写）**必须先复现"索引行在而 notes 节不在"** | **若红不出来 ⇒ 夹具没打到病灶 ⇒ 册零不得开工** |
| 2 | 册零 | `appendRejected` 字段**当前不存在** / manifest 目录**不存在** / `write.ingest` **无条目标识** | 三处断言必然失败 |
| 3 | 册一 | `kind=session-review` 审计行 **0**；`proposals-*` 目录不存在 | 落地即应出现 |
| 4 | 册二 | `reports/sleep/` 与 `audit/impact/` 均不存在；压缩近零（`forgetArchived 4 / 391`） | 已实测 |
| 5 | 册四 | 先删 `delta.md` 不接派生 ⇒ `inject-baseline-diff` **必红**（证明 G15 断言有效）；`ui-geo-regress` 该 UI 断言未落地时不存在 ⇒ 先加断言必红 | 证明断言非空 |
| 5b | 册四 | **实测到的三条先红**（2026-09-19，比原计划更硬 —— 用**旧产物**跑**新判据**）：<br>① `ui-geo-regress` 新 DOM 断言（睡眠汇报卡 + 逐值一致）在 `git HEAD:client.js` 下 **4/4 红**（"卡未渲染"），且共享契约条数 42≠44；<br>② `test-inject-cache` **S2b**（改 delta 不得进块）在旧实现下必红（旧实现只读 delta）；<br>③ `test-inject-cache` **S2c**（兜底逐元素 + 48h 过期即弃）在"换源但不留兜底 / 不收紧 delta 戳口径"两种半成品下均红（后者实测：旧 size 口径下过期改写签不出来，缓存照供旧块）。 | 断言有判别力（不是"加了就算"） |

---

## 5. 不得施工项（硬门）

| 项 | 条件 |
|---|---|
| **册一不得开工** | **册零未完成前**（校正写入通道 / 提案执行通道未落地 ⇒ G3 必假绿） |
| **册二 `release` 接线** | 须在 `runDeepSleep` **净减**（现 332–730 行 = **399/400**）与 `approvedRows` 补出之后 |
| **`delta.md` 文件退役** | 须用户拍板（§5-U2）；且必须在"报告派生 + 逐元素等价对拍"通过之后（一处退役实测动 **12 个文件**） |
| **容量类处置（archive/delete）** | 须用户拍板出口口径（§5-U5）；`unused` 标记**永不进裁决** |

---

## 6. 全局门（七层，收尾必跑）

| 层 | 命令 | 通过标准 |
|---|---|---|
| ① 仓内绿 | `npm run typecheck && npm run build && node scripts/check-runner.mjs` | 零错；全量 **0 fail**（件数随新增上升，**不写死件数**） |
| ② 注入面 | `node scripts/inject-baseline-diff.mjs` | 编排不变；「最近成长」改派生后须**逐元素等价**；变化逐条核对后**重立基线** |
| ③ 库一致性 | `node scripts/check-record-parity.mjs` · `node scripts/check-section-refs.mjs` | 逐字节一致 · 棘轮 **0/0/0/0** |
| ④ 部署 | `node scripts/deploy-installed.mjs` → `check-installed-sync --strict` → `dev_reload_package` → `node scripts/check-installed-features.mjs` | 逐件 sha 一致 · active · 标记齐全（新增 L2/S3 标记须登记） |
| ⑤ 真机证据 | 真机跑：L2 触发一次 + S3 一轮 | 三处审计齐全（`session-review` / 影响账 / `deep-sleep`）且**未裁决 0** |
| ⑥ 契约与 UI | `check-panel-contract` + `gen-panel-contract --check` + `ui-geo-regress` | 三者全过 |
| ⑦ 推送 + pin | `check-public-tree` → `git push`（本机代理）→ `git status -sb` → 改 profile pin | 无 ahead · pin 指向本轮终态提交 |

---

## 7. 复现命令（只读；**带口径**）

```sh
AUD="$USERPROFILE/.dsh/suite/knowledge/audit"; L="$AUD/ledger.jsonl"

# ① 蒸馏口径（档 L / 档 S；禁用 205/688）
node -e "const fs=require('fs');const R=fs.readFileSync(process.env.L,'utf8').split(/\n/).filter(Boolean).map(JSON.parse);
const H=(r,k)=>r[k]!==undefined&&r[k]!==null&&r[k]!=='';
const dr=R.filter(r=>r.kind==='distill-run'), st=dr.filter(r=>H(r,'stop'));
const key=r=>[r.sid,r.chunk,r.chunkStart,r.chunkEnd].map(v=>v==null?'':v).join('|');
const m=new Map();for(const r of st)if(!m.has(key(r)))m.set(key(r),r);
const S=(a,f)=>a.reduce((s,r)=>s+(Number(r[f])||0),0);
console.log('档L',st.length,S(st,'added'),S(st,'failed'),'| 档S',m.size,S([...m.values()],'added'),S([...m.values()],'failed'),
'| 全量去重(禁用)',new Set(dr.map(key)).size)"

# ② S3 三通道与维护量（字段名写错即 FAIL）
node -e "const fs=require('fs');const R=fs.readFileSync(process.env.L,'utf8').split(/\n/).filter(Boolean).map(JSON.parse);
const d=R.filter(r=>r.kind==='deep-sleep');const S=k=>d.reduce((a,r)=>a+(Number(r[k])||0),0);
console.log('轮',d.length,'added',S('added'),'replaced',S('replaced'),'forgetArchived',S('forgetArchived'),'tree',S('tree'),'pointers',S('pointers'));
const t=R.filter(r=>r.kind==='treeops');console.log('treeops 台账 applied',t.reduce((a,r)=>a+(r.applied||0),0),'archived',t.reduce((a,r)=>a+(r.archived||0),0));
console.log('不存在的字段 treeOpsTried/pointerOpsTried:',d.filter(r=>r.treeOpsTried!==undefined||r.pointerOpsTried!==undefined).length,'(须 0)')"

# ③ 注入口径（反例 1）
node -e "const fs=require('fs');const R=fs.readFileSync(process.env.L,'utf8').split(/\n/).filter(Boolean).map(JSON.parse);
const m=R.filter(r=>r.kind==='mcl-step');const inj=m.filter(r=>r.phase==='inject');
console.log('mcl-step',m.length,'| phase=inject',inj.length,'| inject且injected===0',inj.filter(r=>r.injected===0).length,'| inject且injected>0',inj.filter(r=>typeof r.injected==='number'&&r.injected>0).length)"

# ④ 库一致性棘轮（真库）
node scripts/check-section-refs.mjs

# ⑤ 容量（写门口径 vs 面板口径）
node -e "const fs=require('fs');const p=process.env.USERPROFILE+'/.dsh/skills/managing-memory/';
for(const [f,cap] of [['AGENT.md',3000],['USER.md',3000],['MEMORY.md',5000]]){const t=fs.readFileSync(p+f,'utf8');
console.log(f,'raw',[...t].length,'stripWs',[...t.replace(/\s/g,'')].length,'cap',cap,'写门%',([...t].length/cap*100).toFixed(1),'面板%',([...t.replace(/\s/g,'')].length/cap*100).toFixed(1))}"
```

---

## 8. 交付物清单（v2，含会审裁剪）

| 产物 | 册 | 说明 |
|---|---|---|
| `src/section-rewrite.ts`（**新件**） | 册零 | 唯一写入原语（`atomicWrite` 升级 + gate + 锁）；**必须新件**（`treeops` 596/600 硬线，`fnspan` DEBT_BASE=0） |
| `src/bank-lock.ts`（**新件**） | 册零 | **库级**单写者锁 `<bank>/.write-lock`（mkdir/open wx，子进程经 env 参与，零新依赖） |
| `sectionops.applyConvergeOps` 收编 | 册零 | **既存缺陷**（`:92` 直写无 gate/锁） |
| `write.ingest` **+1 载荷字段** | 册零 | 失败 target/section/seq（**替代** v1 的"新审计 kind + 新机检件"） |
| `<kRoot>/audit/distill-manifest/<sid>.jsonl`（**新流**） | 册零 | 产出登记流 / L2 材料输入 |
| `src/session-review.ts`（新件） | 册一 | L2 触发/材料/**提案流**（append-only，**不直接改库**）+ import 白名单 |
| `src/impact-review.ts`（新件） | 册二 | 影响账**唯一聚合实现**（确定性证据）+ 压缩裁决；**与册三/册四共用解析出口** |
| `src/deepsleep-*.ts` 收窄 | 册二 | 三通道关闭（`added/replaced/profiles`）+ `release` 接线两前置 |
| `src/sleep-report.ts`（新件） | 册四 | 报告段 + 问题标记 + 「最近成长」派生（纯函数，零 IO） |
| `scripts/check-layer-handoff.mjs`（新件） | 册三 | 层间交接机检（入 `CHECKS`） |
| **删（会审裁剪）** | — | v1 的"册零新审计 kind + 独立机检件" · v1 的独立 `audit/impact/<day>.jsonl` |
| 验收记录 | — | 逐卡读数 + **先红证据** + 落地差异（**不谎报**） |

---

_建立 2026-09-19 · v1 → **v2（圆桌会审修订）** · 与方案册 v2 成对；两册冲突**以本册判据为准**。_
_依据：会审裁定（五册结构 / 库级锁 / 两新件并入册零 / 分母钉死）+ 主持人直读账本的终裁 + accept 的锚修订 + verify 的核验。_
