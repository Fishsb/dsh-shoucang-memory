# 高并发遍历审计报告（2026-09-25）

> 触发：用户指令「启用高并发模式优化当前项目，遍历检查」
> 方法：**22 个并行子代理**（第一批 6 席取证 + 6 席独立复验；第二批 4 席取证 + 4 席复验 + 1 席补复验），
> 分区互不重叠，每条结论由**未参与取证的另一席**逐行重看 + 尝试推翻（`confirmed` / `refuted` / `unverifiable`）。
> 判据：location > prose；给不出位置即标「未验证」；找不到就写「未发现」。
> 结果：**40 条结论 → 39 confirmed / 1 refuted**（推翻项：L6-05，其「无等价性检查」被 `check-deploy-sync` 推翻）。

---

## §0 摘要

| 项 | 数值 |
|---|---|
| 遍历分区 | 6 个（假绿门禁 / 并发竞态 / 阻塞热点 / 仓务熵 / 未消费导出 / 测试有效性） |
| 结论总数 | 40（high 18 · medium 14 · low 8） |
| 独立复验 | 39 confirmed · 1 refuted · 0 unverifiable |
| **本轮已修** | **3 件**（均为「机检件自身不可靠」，全部在**未在途**文件上，逐件带反例 + 负对照） |
| 因边界挡下 | 5 件（目标文件正被别的会话占用） |
| 需用户拍板 | 4 组 |

**一句话**：本次遍历最重的一类问题不是「功能坏了」，而是**门禁与账本自己会说假话**——
空集判绿、未比对报「一致」、恒真断言、xfail 只锁一半、注释与实现相反。这类缺陷会让**后续所有修复失去判据**，故优先处理。

---

## §1 本轮已落地修复（3 件 · 均带改前/改后对照）

### 1.1 `scripts/check-installed-sync.mjs` — 「未比对」被显示成「一致」

- **形态**：副本无 `lib/` 时只 push 一条 `error` 就 `continue`（`:113`），而 drift 表用 `!r.error` 把 error 行**排除出判定**
  （`:135`）⇒ 一个**从未被比对过**的目标会一路走到末尾 else，打印「✅ 全部已安装副本与仓内 lib/ 逐文件 sha1 一致」，
  且 `--strict` 这道硬门不复位（`process.exit(0)` 在 `:168` 无条件执行）。
- **改前实测**：`--installed <存在但无 lib/ 的目录> --strict` ⇒ 同屏先 `⚠ 无法比对` 后 `✅ 全部一致`，**EXIT=0**。
- **修复**：新增 `unverifiable = reports.filter(r => r.error)`，与真漂移**走同一 `--strict` 硬门**（同规格退 1）。
- **改后实测**：反例 ⇒ `⚠ 1 个目标未能比对` + `❌ --strict` **EXIT=1**；负对照（真实副本）仍报漂移 1 个 **EXIT=1**，逐字不变。
- **为何要紧**：与本件件头立项判因「仓内绿 ≠ 运行态绿」正好反向——把「没比对」显示成「一致」。

### 1.2 `scripts/check-yield-reflow.mjs` — xfail 只锁了一半（缺 XPASS 出口）

- **形态**：件头 `:23-28` 与 `check-runner.mjs:23` 的契约原文均为
  「xfail 一旦意外转绿 ⇒ emitter **必须退 1**（XPASS = 施工完成信号，不是回归失败）」，
  但实现只做了 `fail ⇒ 4` 一半：三判据全绿时 `fail=0` ⇒ 走 `:203 process.exit(0)` ⇒ 运行器渲染 ✅ pass，
  **「缺陷已修好、须重新裁定 xfail 声明」这个信号被静默吞掉**。
- **修复**：补显式 XPASS 出口——`r1.ok && r2.ok && r3.ok === true` 才触发退 1；
  `r3.ok === null`（数据不足）**不算转绿**，与 `:187`「未取得数据，不假装通过」同口径。
- **改后实测**：今日仍 `⚠ xfail` **EXIT=4**（行为不变）；`--selftest` 仍 PASS exit 0。
- **同仓对照组**：`scripts/test-treeops-rm.mjs:318/325` 早已实现双向锁（`fails ? 1 : xfailN ? 4 : 0`）。

### 1.3 `scripts/check-journal-privacy.mjs` — 不认 `DSH_HOME`，隔离会话穿透到生产库

- **形态**：库根解析为 `MEMORY_ROOT || join(homedir(), '.dsh', 'suite', 'memory')`，**无 `DSH_HOME` 分支**；
  而同族三件都认（`check-public-content.mjs:29` / `check-observability.mjs:303` / `check-yield-reflow.mjs:157`）。
- **改前实测**：`DSH_HOME=<空目录>` 下仍读**真库**全量并报 `PASS` **EXIT=0**——隔离环境的读者会把
  「真库干净」读成「隔离环境干净」（**拿错事实源却显示正常**）。
- **修复**：补同口径分支。
- **改后实测**：隔离态 ⇒ `纪元日志缺席…按 skip 处理` **EXIT=3**（诚实 skip，非假绿）；
  不设 `DSH_HOME` 时逐字不变（`PASS` **EXIT=0**）；`--selftest` 仍 `7/7 PASS` exit 0。

> **范围克制**：本次只动 `scripts/` 下三件 **git clean（未在途）** 的机检件；`src/` 与 `lib/` 一律未动，
> 未跑全量 `npm run build`（会把在途 src 改动一并固化进产物）。

---

## §2 阻断项：目标文件正被别的会话占用（按 R3 未代为推进）

以下 5 条**证据充分但未修**，因为它们的文件当前是 `M`（未提交在途）：

| 结论 | 目标 | 冲突面 |
|---|---|---|
| L1-01 空集判绿 | `scripts/check-observability.mjs:310-355` | 在途 |
| L1-05 恒真断言 | `scripts/lib-scan-scope.mjs:203-205` | 在途（且被 ≥4 件消费） |
| L1-06 注释与实现相反 | `scripts/check-field-usage.mjs:100 vs :149` | 在途 |
| L1-03 虚假自证登记 | `scripts/check-runner.mjs:594`（+ `:581-583` 注记） | 在途（+ 改它要同步 AGENTS.md 的 236 计数） |
| L1-07 硬判据休眠 | `scripts/check-runner.mjs:480`（缺 `--strict`） | 在途 |

另：**全部 L2（并发竞态）与 L3（阻塞热点）结论的修复面都在 `src/`** ⇒ 须 `npm run build` ⇒ 必写 `lib/`（构建产物，
在途 32 件）⇒ 同样越界。**这 14 条属"证据已备、待边界放开"**。

---

## §3 高价值待办（按「先掩盖性问题、后严重度」排序）

### 3.1 门禁自身假绿（最高优先：它们让后续修复失去判据）

| # | 位置 | 形态 | 最小修法 |
|---|---|---|---|
| L1-01 | `check-observability.mjs:310-355` | 两库根扫到 **0 个** jsonl 仍判 `✅ PASS` + exit 0（空集上「全部可解析」恒真）；同件的 `src/` 面有 `guardScanScope`，**本分支没有** | 在 `:345` 前插空扫守卫 ⇒ `exit 3`（与 `check-public-content:93` 同口径） |
| L1-02 ✅ | `check-installed-sync.mjs` | 未比对却报「全部一致」 | **本轮已修** |
| L1-03 | `check-runner.mjs:594` | `inject-baseline-diff --selftest` 是**空登记**：脚本根本没有该分支，flag 被静默忽略、跑的是真机对拍本体；而 `:581-583` 注记声称「本行登记的是它的自证」——与代码事实相反 | 删该行 + 订正注记（真自证在 `test-inject-baseline-normalize.mjs`，已登记 `:225`）；同步 AGENTS.md 的 236 计数 |
| L1-04 ✅ | `check-yield-reflow.mjs` | 缺 XPASS 半锁 | **本轮已修** |
| L1-05 | `lib-scan-scope.mjs:203-205` | 反空扫 helper **自己含一条恒真断言**（`ok(true, …)`）；而它的存在理由正是「不许用代理替代不可观测事实」 | 改为可证伪断言（「缺席态与另两态至少一态可分」）；确实做不到的件显式传 `required:false` |
| L1-06 | `check-field-usage.mjs:100 vs :149` | 注释自称「硬红灯」，实现只打印 ⚠、从不计入 `fail` | 二者取一（真判红 或 改注释） |
| L1-07 | `check-runner.mjs:480` | `check-pointer-content` 无参登记 ⇒ `BASELINE_EMPTY=0` 的硬判据在 `npm test` 里**从不生效**；而豁免理由（§2.3 待决项）已消失 | 登记补 `--strict` + 订正 stale 注记 |

### 3.2 并发竞态（L2 · 8 条 · 全 confirmed，含一轮订正）

- **L2-1**（high）跨进程重入令牌 `SHOUCANG_BANK_LOCK_OWNER` **全仓零设置者** ⇒ 设计承诺与实现相反。
  复验补注：当前**无调用点在持锁下 spawn memory-append**（持锁者只 spawn 门脚本）⇒ 潜伏半截机制，非已爆事故。
- **L2-2**（high）`releaseBankLock` 返回值**三处调用全裸调用**；失败时 `HELD` 不清 ⇒ 同进程后续写者**免锁直写**（复验订正：原表述只写了跨进程拒写）。
- **L2-3**（high）`ring-commit.ts:227` 对**不可变事件流**用**裸 `writeFileSync` 整份覆盖**（同文件 `:231` 却走 `atomicWriteFile`）⇒ 进程中途被打断即留半截历史，而 `parseEvents` 对坏行**静默跳过**。
- **L2-4**（high）`notes/agent.md` 两写者形态不对等（一个无 CAS 整片覆盖 / 一个 CAS 退让），且**先落正文后落记录** ⇒ 正文被覆盖抹掉后 episode 记录照样成立、水位推进。
- **L2-5**（medium）台账 **4 处旁路写者**（`mcl.ts:417` / `vec.ts:368` / `pointer-deficits.ts:242` / **`panel-eval.ts:112`**）直写 led.jsonl 且都不触发轮转（复验补出第 4 处）。
- **L2-6**（medium）面板三个写端点**读在锁外**（`panel-inject.ts:288→304` 等）⇒ 用户确认的版本与提交的版本可能不是同一份；`gatedWriteFile` 回读是**事后自检**不是 CAS（复验加固）。
- **L2-7**（medium）写入原语棘轮只抓字面量 `.tmp`，两处 `${file}.tmp-${ts}`（毫秒时间戳当唯一性）逃出射程；复验收窄：真实撞名需「同毫秒+同文件+两写者」，**真问题是棘轮对该形态结构性失明**。
- **L2-8**（medium）深睡同轮内 CAS 不对称 + pointerOps 锁**逐 target 释放**（复验收窄为「批次非原子」，注释本身成立）。

### 3.3 阻塞热点（L3 · 6 条 · 全 confirmed，均含真库实测数字）

- **L3-01**（high）深睡每轮扇出 **26 个并发子代理**（实测 `planRelease` 135 扫描/124 候选 ⇒ 13 批 ×2），而文档写「8 个」；`semaphore|maxConcurrent|pLimit` 全仓零命中。
- **L3-02**（high）面板路由同步全量解析 **23MB / 6 万行**台账，被 **60s UI 轮询**驱动 ⇒ 唯一事件循环周期性堵死（复验订正行号归属：`/criteria` 与 `/cognition/report` 是两条路径，现象均成立）。
- **L3-03**（high）深睡树 O(n²) 两两串行 embed，预算耗尽即**静默降级**为无语义去重（与「确实无重复」读数同形）。
- **L3-04**（high）蒸馏写入对同标签**每一条**既有行串行发一次嵌入 HTTP，真库同标签最大 **498 行**（且此处连 `embedBudget` 都没有）。
- **L3-05**（medium）向量缓存首次召回同步读 **31.3MB / 2405 行**（距 32MB 上限仅 0.7MB）。
- **L3-06**（medium）库锁同步自旋等待（`Atomics.wait`）最长 5s 冻结事件循环；面板写路径**持锁跨 30s 门禁子进程**。

### 3.4 仓务熵（L4 · 6 条）

- **L4-01**（high）**459+ 份配置备份逐字节相同**（相邻差分 0，与当前文件同 sha256）⇒ 备份机制制造「有 N 个还原点」的假象，**可还原历史实为 0**；而该 yaml 被 `.gitignore` 排除，备份是唯一历史通道。
  写入者 = `src/panel-shared.ts:718-721 backupThenWrite`（调用 `panel-config.ts:184,227`），**无保留策略**。
- **L4-02**（medium）`lib/mcl.js` 与 `.map` 脱钩：产物**未经 tsc 即被就地改写**（铁证：`.bak-v4kind` 字节数恰等于 `HEAD` 版），而 `check-srcmap` 自述「`.js.map` 不单列」⇒ 结构性看不见。同类还有 `lib/panel-memory.js`。
- **L4-03**（medium）未提交漂移 **92→95 条**（复验时仍在增长）：`lib` 面 32 > `src` 面 13 ⇒「源改了」与「产物重生成」在 git 层不可区分。
- **L4-04/05/06**（low）docs 过时面很小（3 件且均带横幅）；仓根信噪比 4.4%（461/481 是备份）；src/scripts 各 1 件源码备份（合计 135,628B，无读取方）。
  复验补正：`.bak` 体积大头**不是**配置备份（按字节仅 66.1%）。

### 3.5 未消费导出面（L5 · 6 条 · 全 confirmed，已排除三类误判）

`readStats`（验收判据只有自报计数器，零读取方，**圆桌要求的替代判据从未落地**）·
`readSupersedeArchive`（注释写明是「回滚入口」，而写入侧已接线、读函数零调用）·
`supply-stamp` 三导出（注释指向 `/inject/stats` 的 `warmBridge` 位，该字段在载荷中**不存在**）·
`structuralKinds`（注释称「供机检使用」，门禁实际直读生成物）·
`setKey`（第二条 YAML 写路径，零消费；实际写盘走 scheduler.json）·
src-client 四个零消费导出（已确认不在产物内）。

复验降级两条：L5-02「库变更不可回看」过头（另有落账与 assertion-graph 边）；L5-05 属有先例的预留原语。

### 3.6 测试有效性（L6 · 6 条 · 5 confirmed / 1 refuted）

- **L6-01**（high→复验降 medium）`test-eval-channel.mjs:151` 用**单参 ok()** 把条件写进消息串 ⇒ 恒真、永不判红；同型 **40 处 / 16 件**。复验补：`eval-ledger.ts:101-121` 是显式白名单构造、无透传 ⇒ **判据零判，非线上隐私缺口**。
- **L6-02**（high）标签拼接回归判据的 400 字符窗口**打在了文件头注释上**（真函数在字符偏移 6030，相距 5380）⇒ 真函数从未被检查；且兜底分支无条件判绿。
- **L6-03**（high）真机响应字段断言被静默跳过，末行仍按硬编码「+ 响应字段 3 项」计入 PASS。
- **L6-04**（medium）`essence-review-stability --from-ledger` 登记为「释放接线前置门」，但**全文无 exit 1** ⇒ 终端打 ❌、退出码恒 0，该门不拦任何东西。
- **L6-06**（medium）4 处子进程用裸 `node` 而非 `process.execPath`（全仓已有 23 处用后者）⇒ **spawn 失败被误报成「投影过期」**，修复方向被带偏。
- **L6-05** ~~refuted~~：裁定「与已登记副本无任何等价性检查」不成立——`check-deploy-sync` 每轮逐件比对且实跑 PASS。

---

## §4 现状红榜（本次审计的基线，**多为在途改动造成，非本轮引入**）

`node scripts/check-runner.mjs`（node 须在 PATH，否则 236/236 全 `exit=-1`）：

```
FAIL 5：check-installed-sync --strict · check-relevance-live(A4 向量不可达) ·
        test-panel-view-contract(缺 [cap] capacityEnforce) · test-split-equivalence(锚点缺失) ·
        check-i18n-keys(缺 5 条 EN 词条)
skip 1：eval-gate   xfail 1：check-yield-reflow（声明制正常）
```

归因：**4 件与「未提交的在途改动」直接相关**（`panes-toggles.js` / `panes-capacity.js` / i18n 词表），
1 件为环境侧（本机 Ollama 未起）。⇒ 这批不是本轮产生的，也不应由本轮代为处置（在途面）。

---

## §5 诚实边界（未验证项与已知副作用）

1. **本轮我造成的三处副作用（如实留痕）**：
   - 跑 `npm test` 触发 `pretest: build:host`，**重编译了 `lib/`**（内容层面同轮 `check-installed-sync` 实测「内容不同 **0**」⇒ 无内容漂移）；
   - 登记件产生 `_memory/audit/baseline-lab-2026-09-25.json`（gitignored，非公开树）；
   - 为实跑探针在系统 `%TEMP%` 建过瞬时目录/脚本（仓外）。
2. **L2/L3 全部结论均为静态核对 + 只读取证**，未做并发复现（会写临时库/起子进程）⇒ severity 按「形态成立 + 影响链可推」定级，**不是「已实测丢数据」**。
3. **复验席订正 9 处取数与口径**（行号归属 1 处、计数过时 5 处、影响面收窄 3 处、推翻 1 条）——
   已全部并入上文；原始取证席的表述不单独保留。
4. **本报告 §5 自身的订正（2026-09-25 二次遍历时自查发现）**：§5 原文写「本报告只覆盖 6 个分区；
   **未覆盖**：`skill/` 技能本体、`docs/` 内容质量、宿主 DSH 侧、CI 配置」——其中两处是**我自己的数字错**：
   · §1/§5 提到的「docs/ 77 个 md」：实测 **docs/ 顶层 78 件**（另一席位报的「77 件 1,707,997B」是当时快照）；
     递归则 **211 件**（含 `docs/roundtable-kb/` 等未跟踪目录）。⇒ 两个数都对，但**必须标口径**，我原文没标。
   · 「scripts 261 件」：实测 **scripts/*.mjs = 259 件**（261 是更早快照）。AGENTS.md 自述的 236 是 **CHECKS 条目数**，
     与文件数**不是同一个量**——把三者混读正是本仓反复记账的「数字无口径即不可用」。

5. **本报告 §3.6 的 L6-01 严重度与规模，经实修时重测已订正**（详见 CHANGELOG 同批条目）：
   原文引取证席「同型恒真 `ok()` **40 处 / 16 件**」——**该数不实**。按「先判件约定、再判调用点」重做
   （本仓三套并存约定：`ok/1` 49 件 · `ok/2` 98 件 · `ok/3` 23 件）+ ok/bad 平衡交叉验证，
   **真值 = 1 处 / 1 件**（`test-eval-channel.mjs:151`）。我自己前两次扫描给出的 298 处/28 件、
   116 处/58 件同样是错口径。教训：跨件形态审计必须先按件判约定，否则「发现」本身也是假的。


---

## §6 决策已定（2026-09-25 · 用户「自己决策」）与执行边界

> ⚠ 依据仓规 **R1**：「用户说『你自己决策』＝**只到决策态**，不等于授权施工」。故下列 4 组**由我判定**，
> 并逐条标注「已执行 / 待解冻后一行 / 按 R3 须具名授权」。

### 6.1 已执行（落在 R2 四条件内：可逆 · 不碰冻结面 · 不改真源 · 不越跨会话边界）

**Q1 在途面 → 判「冻结登记」**（既不提交也不回退）——提交会把未完整评审的改动固化进公开仓库，
回退不可逆且会毁掉他人工作；冻结是唯一既安全又不改变现状的选项。
- 产出机检化冻结清单 [inflight-freeze-2026-09-25.json](inflight-freeze-2026-09-25.json)：**92 件**（跨会话在途）
  + 5 件（本会话），逐件含 `sha256`/`state`/源-产物分类，**自带核对命令**（实测 **0 件漂移**）。
- 为什么必须机检化：口头冻结会静默失效——冻结面里 3 件脚本正是我随后修复的目标，**没有清单就会改穿边界**。

**Q2 配置备份 → 判「清存量（现在）+ 加保留策略（随提交批次）」**
- 删除前自证零信息损失（判据：若要丢历史，distinct 必须 >1）：实测 **460 份内容 distinct = 1**
  （与当前 config 同 `sha256`）、**零读取方**（7 处 `bak-` 命中全是"排除备份"的过滤器），
  写入者 = `src/panel-shared.ts:272/720 backupThenWrite`（无保留策略）。
- 执行：保留最新 1 份、删 **459 件 / 846,396 字节** ⇒ 仓根 **481 → 22 件**（信噪比 4.4% → ~50%）。
- ⚠ **刻意不碰**同形项：`src/mcl.ts.bak-v4kind-*` 与 `scripts/ui-geo-regress.mjs.bak-i18n-*` 外观同类，
  实为**别的会话在途改动的回滚点**（在冻结面内）——删它才是拆东墙补西墙。

**Q3 `essence-review-stability` 判据口径 → 判「它该红」，且退出码用 4 而非 1**
- 不是退化成报告器（原方案 B 会被读作"我们放弃了这条禁令"），而是**就地给真退出码**：
  三条判据路径统一 **exit 4**（契约本义 = 已知未修 / 必须可见 / 不判失败），与同族 `check-yield-reflow` 同规格。
- 实测：`--from-ledger` 极差 18.5pp/25pp ⇒ exit 4；`--jaccard` 最小 **0.056** < 0.8 ⇒ exit 4；`--live` 不变。
- 顺带坐实一条既有结论：释放集合**极不稳定**（Jaccard 0.056 ≈ 无关），"不接线自动执行"是正确判断。
- 订正件头 `:2` 的自述（原写"报告态，**不入 CHECKS**"，与 ACT-349 的登记事实矛盾）。

**Q4 L6-06 裸 `node` 修复 → 判「一并收口」，但按边界切成两批**
- 已改（CLEAN 文件 3 件）：`check-criteria.mjs:33` · `check-carriers.mjs:74` · `check-placement-convergence.mjs:34`。
- 未改：`check-runner.mjs:1340`（**冻结面**）。整族实测 **8 文件 ~40 处**（取证席只点了 4 处关键的），
  其余在 `scripts/test.mjs`（30 处）等，属**孤立 spawn 到冻结资产**、且 `test.mjs` 与 `skill/scripts/test.mjs`
  由 `check-deploy-sync` 逐字节绑死 ⇒ 二者必须同批改，属另一轮范围。

### 6.2 待解冻后「一行修复」（已在件头留下指引，不碰冻结面）

`scripts/check-runner.mjs:270` 补 `{ xfail: true }` —— 按运行器 `:1348`
（`(code === 4 && opts.xfail) ? 'xfail' : 'fail'`），**未声明却退 4 判 `fail`**。
同时可一并处理该文件里已确认的三处：`:594`（虚假自证登记）· `:480`（缺 `--strict`，硬判据休眠）· `:1340`（裸 node）。

### 6.3 按 R3 须具名授权（我判了做法，但不代你拍板）

| 题 | 我的判定 | 为什么不能自主执行 |
|---|---|---|
| **提交/推送** | 冻结面 92 件先冻结；本会话 10 件可独立成批 | 推送需跑 `check-public-tree` 且会公开在途改动 ⇒ 越跨会话边界 |
| **459 份配置备份的保留策略** | 在 `panel-shared.ts` 的 `backupThenWrite` 加 keep=N（仓内已有 `ledger-compact#rotateBySize` 范式可复用） | 改 `src/` ⇒ 须 `build` ⇒ 必写 `lib/`（在途 32 件）⇒ 越界 |
| **L2/L3 全部 14 条修复** | 见 §3.2/§3.3，按严重度分批 | 修复面全在 `src/` ⇒ 同上 |
| **`scripts/` 5 件门禁缺陷** | 见 §3.1，同一判据收口 | 目标文件 `M`（在途），改了撞车 |

---

## §8 二次遍历（2026-09-25 · 覆盖上轮未及面）

上轮 §5 自述未覆盖的四个面（`skill/` 本体 · `src-client/` 面板 · `docs/` 数字真值 · 构建发布面）
**本轮已补**，另加一项「**92 件在途改动本身的评审**」。共 **10 席并行**（6 取证 + 4 复验补跑）：
**34 条结论 → 30 confirmed / 3 refuted**（+ 我自己在实修中复现 1 条、并发现自己 1 处新违规）。

### 8.1 本轮已落地（全部带反例/负对照实测）

| # | 面 | 修复 | 实证 |
|---|---|---|---|
| E1 | **发布面（隐私）** | `package.json#files` 收整目录，而 `.gitignore` 对 **npm pack 零效力** ⇒ **24 件私件随包外发**（`skill/docs/devref/` 20 件自述「本机，不入库」+ `*.bak-*` 2 件 + `.internal` 备份 1 件）。加四条排除模式 | pack **663→639 件 · 泄漏 24→0**；负对照 10 件运行期必需件**全在包内** |
| D-03 | 文档（**用户数据**） | README 两份称默认库根 `~/.dsh/skills/managing-memory`（**不存在**），而下一行正教用户「备份库目录」⇒ 备份到空目录且不报错 | 旧址 `Test-Path=False`；真根 `suite/memory` 存在·328 文件（`src/targets.ts:41`） |
| D-01 | 文档（隐私承诺） | README 称隐私门「**每次提交扫描**」——实测 0 个提交期钩子（`hooks` 全 `*.sample`、无 `core.hooksPath`、无 `.husky/.github`、无 `prepare`） | 逐项实测；现改为「推送前**手动**执行且必须 PASS」 |
| D-04 | 文档（数字） | README `143 件`→**236 件**；`--fast 跳过 4 件`→在册 `{slow:true}` 实为 **5 处** | `--list` 首行 236；`L130/232/248/345/1045` |
| B-02 | 部署面（门缺口） | `check-deploy-sync` 的 `skill/engine` 面 `exts` 只有 `['.json','.md']`，而 `signals.mjs` 是**运行期 import 的活件** ⇒ 漂移结构性不可见。补 `.mjs` | 「一致 86→87」；**单字节反例 ⇒ 报该件不一致 exit 1**，还原回 PASS |
| 自查 | **我自己的违规** | 给 `check-placement-convergence.mjs` 加注释时写入本机路径（违仓规规则 1），被本轮 E 席 `check-public-tree` **实测抓出**（FAIL 1 件） | 已改；复跑回 **PASS** |

### 8.2 本轮新发现（高价值，因边界未落地）

- **F 席（在途改动评审）三条全 high/medium，共同形态 =「写入侧齐备、消费侧缺位，而门禁用『源码里出现过这串字』冒充『有消费方』」**：
  `capacity-over` 已在真库落 **34 行**却零语义消费者（面板统计里「超限照写」与「正常写入」不可分辨）；
  `zeroLanded` 写进深睡审计行但前端与投影都不读，注释指定的消费方门禁件**根本不存在**；
  `budget-override.ts:53` 引用的 `check-capacity-chars.mjs` **全仓无此文件**（跨面同源差分锁是幻影）。
- **C 席（面板前端）**：`panes-toggles.js:489` 的 **30s 轮询无面板守卫**（对照 `panes-settings.js:207` 有 `mask.open` 守卫）⇒ 进过一次「参数调节」后**永久存活**，每次触发 `probeLocalEmbed` → `runProcAsync('node', …)` **真起一个 node 子进程**；同函数 `:360` 每轮 `appendChild` 一个 `<datalist>` 且从不移除（重复 id + 无界增长）。
- **A 席（skill 契约）**：渲染器登记坐标**符号从不被校验**（`check-carriers.mjs:48` 只 `existsSync` 文件，丢弃 `#符号`）⇒ 契约把坐标写到任意存在的 `.ts` 都全绿；实测 `criteria.json` 指向 `panel.ts#readCarrier` 而真身在 `panel-shared.ts:525`。
- **B 席**：`archive-lib.upsertMark` 是「读全表→过滤→整表重写」却**零加锁**，而同型读改写的 `memory-append` 已取库锁 ⇒ 并发丢 mark；`recall-eval` 把无法解析的 `--since` **静默降级为不设窗**却照原样打印该值。

### 8.3 因边界未落地（须授权）

- **全部 `src-client/*.js` 修复**（C 席定时器泄漏等）须 `npm run build:client` ⇒ **必写 `client.js`，而它在冻结清单内**。
- **`docs/ARCHITECTURE.md` 的注入预算矛盾**（同文件两处 `4000` vs `3000`，且机检正则只取首个匹配 ⇒ 第二处结构性不可见）：文件冻结。
- **F 席三条消费链修复**：修复面在 `src/`（`panel-memory.ts` 等）⇒ 需 build ⇒ 越界。
- **A 席符号校验增强**：须先修 `criteria.json` 真源并重跑生成器 ⇒ 触 `src/criteria.generated.ts`。



```bash
# node 不在本会话 PATH 时须显式加（真身见 notes/env.md）
node scripts/check-runner.mjs                     # 全量基线（本报告 §4）
node scripts/check-runner.mjs --list              # 236 项登记清单

# §1 三件修复的反例 / 负对照
node scripts/check-installed-sync.mjs --installed <存在但无 lib/ 的目录> --strict   # 反例 ⇒ 退 1
node scripts/check-installed-sync.mjs --strict                                      # 负对照
node scripts/check-yield-reflow.mjs            # 今日仍 exit 4（xfail 声明制）
node scripts/check-yield-reflow.mjs --selftest # PASS/0

# §1.3 DSH_HOME 隔离
set DSH_HOME=<空目录> && node scripts/check-journal-privacy.mjs   # 改后 ⇒ skip exit 3
node scripts/check-journal-privacy.mjs --selftest                 # 7/7 PASS

# §3.1 逐条复核（示例）
node scripts/test-eval-channel.mjs        # L6-01：单参 ok() 恒真
node scripts/essence-review-stability.mjs --from-ledger   # L6-04：打 ❌ 却 exit 0
```

---

*本报告由 22 个并行子代理分区取证 + 独立复验产出；结论以**位置证据**为准，复验席订正项已并入。*
