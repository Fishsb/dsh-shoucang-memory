# 会话方案落地核查（2026-09-22 · 逐项取证）

> **本档回答一个问题**：本会话（`closure-plan-2026-09-21` + 之后 ADR-327 那批）里**每一条方案任务**，
> 现在到底是「已落地」「未落地」还是「落地了但没生效」。
> **口径**：每一条都给**证据位置**（文件:行 / 命令输出）。**给不出的写「未取证」**，不猜。
> 本档**不使用**任何方案档的自述作为证据 —— 全部重跑、重读、重放。

---

## 0. 结论摘要

| 面 | 结果 |
|---|---|
| **五层验收** | ✅ **全绿**（① 仓内 ② 部署 ③ 热重载 ④ 探针 ⑤ 远端+pin） |
| **方案条目**（S1–S9 · D1–D5 · ADR-327 四项） | **15 项已落地并复验** · **1 项半落地** · **1 项待你拍板** |
| **🔴 本次核查新发现** | **1 条回归 + 1 条半截 + 1 条文档与现实脱节**（全部在本档 §3，均**未被任何既有档登记**） |

**最重的一条**：上一轮「清公开树真实记忆原文」（`4fa315a`）把 `eval-gate.mjs` 的样本集迁到运行期构建，
**但漏迁了两个消费者** —— 而它们**正是我欠你的那笔账（TF-IDF+LR 基线）所用的工具**，现**已跑不动**（exit 2 / exit 1）。
它们住在 `_memory/`（gitignore）且**未登记 `CHECKS`** ⇒ **仓内全绿也照不出来**。

---

## 1. 五层验收复跑（本轮实测）

| 层 | 判据 | 实测 | 命令 |
|---|---|---|---|
| ① **仓内绿** | typecheck / build / 门禁 | `typecheck` **0 错** · `build` **OK**（host+client，client 805,660 B）· 构建后 `git status` **无漂移** · `check-runner` **203 pass / 0 xfail / 1 skip（exit 0）** | `npm run typecheck` · `npm run build` · `node scripts/check-runner.mjs` |
| ② **部署同步** | 安装副本 ⟷ 仓内 `lib/` 逐件 sha1 | **317 / 317 一致**，内容不同 0 · 仅仓内 0 · 仅已安装 0 | `node scripts/check-installed-sync.mjs --strict` |
| ③ **运行态生效** | 热重载 | 已装 `dsh-shoucang-memory` entry **[active]**（清 104 模块） | `dev_plugin_status` |
| ④ **功能探针** | 已装那份带着本轮能力 | **118 项标记齐全**（exit 0） | `node scripts/check-installed-features.mjs` |
| ⑤ **云端 + pin** | 远端 = 本地 HEAD，且 pin 指向它 | `local == remote == 9a45100b` · `git status -sb` **无 ahead** · pin **三处一致 @ 9a45100b** | `git rev-parse HEAD` · `git ls-remote origin master` · `node scripts/check-version-pin.mjs` |

**另测（8 条只读路由全 200）**：`/inject/stats` · `/suite` · `/criteria` · `/mcl/status` · `/sleep/reports` · `/arch/assembly` · `/eval/stats` · `/eval/config`

**架构门禁（全 exit 0）**：`audit-architecture --gate`（动态边隐藏环 0 · 全部在阈值内）· `audit-wiring`（违规 0）· `audit-fnspan`（>400 行函数 0）· `check-module-growth` · `check-arch-sync`（模块 104 · CHECKS 204 · 标记 118 三处与实装一致）· `check-hardcode` · `check-public-tree` · `check-public-content` · `check-content-types` · `check-injection-reach` · `check-srcmap` · `check-claim-alignment` · `check-carriers` · `check-observability` · `check-changelog` · `check-deploy-sync` · `check-ui-contract`（12/0）· `check-panel-contract`（6/0）· `check-l0-conflict-wiring`

---

## 2. 逐项对账

### 2.1 `closure-plan-2026-09-21` §4 执行顺序（S1–S9）

| 步 | 项 | 态 | 证据（本轮实测，非抄档） |
|---|---|---|---|
| **S1** | 修归因取样窗口挤占 | ✅ **落地 + 真库复放实证** | 代码：`recall-diagnosis.ts:221 isAttributionRow` / `:256 ATTRIBUTION_MAX_SCAN` / `:273 takeAttributionScan`；`deepsleep-run.ts:103-109` 调用点。**真库逐行复放**（`lib/` 编译产物 + 真台账 17,793 行）：`scanned=4000 · missRows=59 · samples=30`（门槛 30）⇒ **达标**。<br>**反例（证缺陷为真）**：还原旧式「末 60 条 `mcl-step`」⇒ 窗口成分 `judge 53 / inject 7` ⇒ **samples = 0** ✅ |
| **S2** | 修探针假读数（`Number(null)→0` + 切点时区） | ✅ **落地 + 实测输出已改** | `_memory/audit/j3u1-rate.mjs:24 tri()` 三态（true/false/null）· `:36-40` 分母只算已判行。**实跑**：由旧假结论「累计 0/625 = 0.0%」→ 诚实分账「**已判 1 行 / 未判 51 行**（未判不进分母）· **真值 0/30**」。<br>时区：`j3u1-rate` 已不用 `Date.parse` 裸串；`a3-forward.mjs:20-21` / `echo-samples.mjs:10` 改用 **ISO 字符串比较**（同为 UTC 格式，字典序即时间序）⇒ 时区陷阱已消 |
| **S3** | 面板回落改读 `SURFACE.*` | ✅ **落地 + 真机读数已变** | `panel-config.ts:113-146` 全部回落改读 `SURFACE.*`/`SCORE.mode`（L104-107 如实保留注册表未声明的 4 键字面量）。门 `check-panel-fallback` **PASS** + `--selftest` 4 例含 2 反例。**真机** `/config`：`injectProfileRows=6`（原 3）· `scoreWeights=v2`（原 legacy） |
| **S4** | 清公开树真实记忆原文（`scripts/` 面）+ `eval-gate` 迁运行期 | ✅ **落地**（**但留了两个漏迁消费者 → 见 §3.1**） | `check-public-content` **PASS**（真实库文逐字重合 **0 处**；含「塞真库整行 ⇒ 必命中」反例自证）。`eval-gate.mjs` 内嵌 `state:` 样本 **20 → 0**（实测 `^\s*state\s*:` 命中 0）。`check-eval-samples` **19 pass / 0 fail** |
| **S4′** | 续：全域清理 45 处 / 6 件 | ✅ **落地** | `check-public-content` 扫描面 **611 件**（已跟踪 + 未跟踪可入树），命中 **0**。保形：`deliverables/inject-parity-2026-09-14.md` 现 40 行（该档 §1 所载行数口径一致） |
| **S5** | 修 `eval-gate` 平凡通过 | ✅ **落地 + 实跑三态** | `eval-gate.mjs:208-215` 加 `MIN_JUDGE_N` 与「基线非零」双条件。**实跑**：`exit 3 ⏭ skip：G2-a 未取证（typed=3 baseline=3 < 8）`⇒ **判 skip 不判 PASS**（旧式 `0>=0` 会判 PASS） |
| **S6** | 槽位预算接面板（三键） | ⚠️ **半落地 → 见 §3.2** | 服务面 ✅：`POST /set` 三键各 **200** · 越界 `99999` ⇒ **400** · `/config#global` 三键**可读**且带 `source=override / clamped`。**UI 面 ❌**（`src-client/` 对三键**零引用**） |
| **S7** | D2 `coexist` 取得产生路径 | ✅ **落地** | `criteria.ts:128 CONF` / `:159` 显式优先取值 · `distill-agent.ts:461` 真传 `conflict`。注册表 `wiring.unreachableValues` 现 **7 项**（`coexist` 已移除）· `check-l0-conflict-wiring` **PASS**（①各维均有产生式 ④取值域抵达两处 prompt） |
| **S8** | pin 归位 | ✅ **落地** | `check-version-pin` **PASS（三处一致 @ 9a45100b）**；15 项依赖**零领先** |
| **S9** | 源码真凭据清理 + 历史重写 | ✅ **落地** | 新史 **158 提交** · 全史 `sk-[A-Za-z0-9]{20,}` 扫描 **0 命中** · `git fsck --full` **无错**（仅 1 个悬空 tag 对象，见 §3.3）· 树 **928 件** · `refs/original` **已清空**（`for-each-ref refs/original` 无输出）· 远端拉回 **0 命中** |

### 2.2 §3 待拍板（D1–D5）

| # | 现值（实测） | 态 |
|---|---|---|
| **D1** 熟悉度阈值 | `scheduler.json` `mclFamiliarThreshold = 0.58` | ✅ **已是 0.58**（无需改） |
| **D2** `coexist` 等取值 | 见 S7 —— 已收编 | ✅ **已消除** |
| **D3** `inject-baseline-diff` 对拍红 | **实跑 PASS**：3 个 case **逐字节一致**（骨架 `fea54a77f051`） | ⚠️ **文档与现实脱节 → 见 §3.3** |
| **D4** `evalEnabled` 缺省 | `scheduler.json` `evalEnabled = false` | ✅ **保持关**（fail-closed） |
| **D5** `topicEcho` 口径 | `recall-yield.ts:26-27` 自述为**词面代理**；`:61 nextTools` 已采真实动作，`deepsleep-run.ts:174 judgeYieldRounds` 读 `yield-rounds.jsonl`（真库 **5931 行**） | ❌ **未改判据口径** —— 属判据语义变更，**仍待你一句话** |

### 2.3 ADR-327 四项（上一轮那批）

| 项 | 态 | 证据 |
|---|---|---|
| `overBudget` 恒真（改逐槽比自身额度） | ✅ | `supply-assembly.ts:162 isOverBudget`（导出）· `:254` / `:424` 两处调用点 |
| `budgetTotalOf` 单位错误（去掉 `process`） | ✅ | `:140-142` 只求和「参与限额的槽」 |
| `attributionScanned` 零消费面 | ✅ | `sleep-report.ts:59 AttributionReading` · `:250-259` §5 三态渲染 · `:338-344` 落 `sleep-round` 流 |
| `budgetClamped` 零渲染 | ✅ | `panes-overview.js:421` 面板行 + `i18n-dict-pane-run.js` 2 条文案（门 ⑥ 机检） |
| **我自引入的缓存迟滞**（`cacheKey`/`stableKey` 不含额度） | ✅ | `panel-shared.ts:491 cacheKey ... |budget:${resolved.totalBudget}` · `:632 stableKey ... cap:${capStable}` |
| 已装那份带这四项 | ✅ | 安装副本 `lib/supply-assembly.js isOverBudget ×5` · `lib/sleep-report.js attributionScanned ×4` · `lib/panel-shared.js budget: ×4` · `client.js 额度夹取 ×1` |

### 2.4 其余器检复跑

| 探针 | 实测 | 判读 |
|---|---|---|
| `a3-forward` | inject 行 6084 · **切点后重复对 0**（切点前 1833） | ✅ A3 前向判据达成 |
| `m3-live-measure` | 台账 40,147 行 · `mcl-step` 14,155 行 | ✅ 判定频率 = 每步 |
| `mcl-switch`（环内换向出口） | **10 条**，分落 step **2 / 3 / 6 / 10 / 13 / 19 / 73** | ✅ 真在动作，非只在首步 |
| `M3a` 门控（`switchSource`） | 切点后 judge 649 行：`topicsN>0` **152 行 → 114 true = 75.0%**；`topicsN=0` **497 行 → 0 true = 0.0%** | ✅ `hasTopics` 门真起作用（恒真已打破） |
| `b1-tracefiles` | 纪元 **4**（目标 ≥10） | ❌ 未到（等真机样本） |
| `essence-review-stability --from-ledger 6` | 通过率极差 **19.2pp** · 未判率极差 **29.1pp**（阈 10pp） | ❌ 未收敛 ⇒ **不得接线自动执行** |
| `j3u1-rate` | 已判 1 · 未判 51 · 真值 0/30 | ✅ 仪器已诚实（读数本身等样本） |

---

## 3. 🔴 本次核查新发现（**未被任何既有档登记**）

### 3.1 回归：样本迁移**漏迁两个消费者** ⇒ `baseline-lab` 已跑不动

**现象（实测 exit code）**

```
node _memory/audit/baseline-lab.mjs         → exit 2   ❌ 未在 eval-gate.mjs 找到 SAMPLES
node _memory/audit/baseline-lab-verify.mjs  → exit 1   TypeError: Cannot read properties of null (reading '1')
```

**成因**：上一轮（`4fa315a`）把 `eval-gate.mjs` 的样本集从**字面量数组**改为**运行期构建器**：

```
- const SAMPLES = [ …20 条内嵌… ]          （旧形）
+ const SAMPLES = (() => { … buildSamples({bank}) … })()   （新形）
```

而这两个脚本是**按旧字面量形态取数的**：

| 文件 | 行 | 取法 | 结果 |
|---|---|---|---|
| `_memory/audit/baseline-lab.mjs` | `:32` | `src.indexOf('const SAMPLES = [')` → `< 0` ⇒ `process.exit(2)` | **硬失败** |
| `_memory/audit/baseline-lab-verify.mjs` | `:35` | `.match(/const SAMPLES = (\[[\s\S]*?\n\])/)[1]` → `null[1]` | **崩** |

**兄弟件都对，只有这两个漏了** —— 同批 9 个脚本（`embed-classify` · `eval-bench` · `eval-bench-llm` ·
`label-consistency` · `pool-census` · `speed-accuracy` · `spot-t2` · `t1-illposed` · `truth-audit`）
**都已正确改 import `scripts/eval-samples.mjs`**。实测：

```
embed-classify.mjs:26       await import(eval-samples.mjs)   ✅
eval-bench.mjs:30           await import(eval-samples.mjs)   ✅
truth-audit.mjs:14          import { parseIndexRows } from eval-samples.mjs   ✅
```

**为什么全绿也照不出来（两条叠加的盲区）**：

1. 这两个件住在 `_memory/audit/` ⇒ **`_memory/` 已 gitignore**（`.gitignore:29`）⇒ 不在 `git ls-files` 面内；
2. 它们**未登记进 `CHECKS`**（实测：`baseline-lab` / `baseline-lab-verify` / `j3u1-rate` / `a3-forward` /
   `e05-race*` / `b1-tracefiles` / `echo-samples` / `m3-live-measure` / `closure-probe` **全部 not registered**）
   ⇒ 按仓规则 6「**未登记 = 等于没写**」，`npm test` 永远不会碰它们。

**后果有两层，第二层更重**：

- 表面：一个分析工具坏了；
- **实质：它就是「TF-IDF+LR 基线 vs laya 中文 0.630」那笔账的工具**（`closure-plan` §5「我欠你的 #1」）。
  ⇒ **那笔账现在不是「没做」，而是「做不了了」**。最后一次成功出数在 **2026-09-21 09:29**
  （`_memory/audit/baseline-lab-2026-09-21.json` 的 `at`）—— 早于迁移提交 `4fa315a`（**09-22 12:37 +0800**）。

**旧读数（迁移前，仍有效但那批样本带 8 处字面泄漏）**：

| 任务 | B0 字面规则 | B1 TF-IDF+LR | C Laya 类型化 |
|---|---|---|---|
| T1 标签归类 | 8/8 = 1.00 | 4 判 4 未判 · acc 1.00 | 8 · 0.375 |
| T2 概况归属 | 0（结构性不适用） | 8 · **0.00** | 8 · 0.625 |
| T3 小节归属 | 4 · 0.50 | 0 判 4 未判 | 4 · 0.750 |

**修法（一行级，两处）**：把两个脚本的取数改成 `import { buildSamples } from '../../scripts/eval-samples.mjs'`
（与 9 个兄弟件**同源同式**），或直接复用 `eval-gate.mjs` 现成的运行期构建。
⚠ **判据要求**：修完须**至少一个任务**能出数（证明它真跑通），而非只看 exit 0。

### 3.2 半落地：槽位预算「接面板」只接到 HTTP，**没接到 UI**

`closure-plan` 册二的交付物写的是「**把三个槽位额度接上 `/set` + `/config` + 契约表**」。实测逐项：

| 验收条件 | 实测 | 结论 |
|---|---|---|
| ① `POST /set` 三键各返回 200 | 三键 **均 200**（实测 `injectBudgetChars=3000` / `injectSituationBudgetChars=1200` / `injectLevelCaps` JSON） | ✅ |
| ① 负例：越界值 400 | `99999` ⇒ **400** | ✅ |
| ② `/config` 的 `global` 三键可读 | `global` **33 键**已含三键，带 `source=override` / `clamped` | ✅ |
| ③ `check-panel-contract` 三向一致 | 门 **PASS（6/0）**，但**契约表里根本没有这三键的条目** —— 它们落在**通用路由** `/set`（`body: { key: z.string(), value: zAny }`）之下 ⇒ 该断言对它们是**空过**，不是「验过」 | ⚠️ **空绿** |
| **人能调吗**（面板输入框） | **`src-client/` 对三键零引用**（`git grep injectBudgetChars\|injectLevelCaps\|injectSituationBudgetChars -- src-client` ⇒ exit 1） | ❌ **调不到** |

**判因（读码）**：面板的注入页是**逐个硬编码键**建的 —— `panes-toggles.js:34 numSetting(name,desc,val,key,…)`
共 **13 处** call site，`key` 全是字面量（如 `:138 'injectFreshSlots'`、`:575 'mclBudgetChars'`），
**没有任何通用 / 裸键编辑器**（实测无 `Object.keys(g)` 类渲染）。⇒ 三键虽在服务端可用，**在面板上没有入口**。

**⇒ 定性**：这一步的**真缺口**（v1 判据「面板调不到」）**只关了一半**：旋钮从「不存在」变成「存在但只有 curl 能拧」。
`closure-plan` §7 记的 S6 判据（`/set 1800 ⇒ 注入头变》`）是**服务面**证据，**不能推出**「面板可调」。

**修法（可自主 · 纯增量）**：在注入页补 3 个 `numSetting`（`injectBudgetChars` / `injectSituationBudgetChars`）
+ 1 个 JSON 对象输入（`injectLevelCaps`，已有 `Toggles` 的解析先例可抄），并补 `i18n` 文案；
再在 `panel-contract.ts` 里把三键**显式登记**（否则 ③ 永远是空绿）。

### 3.3 文档与现实脱节（3 处，均属「登记与实况不符」）

| # | 档里写的 | 实测 | 影响 |
|---|---|---|---|
| a | `closure-plan` §3-D3：「`inject-baseline-diff` 对拍红 · **已知红**」 | **实跑 PASS**，3 case 逐字节一致 | 后续若按「已知红」去规划（如为它抬基线），**是在解一个已不存在的问题**。根因：基线已于 **2026-09-21 04:23** 用 `--write` 重写（`_memory/audit/inject-baseline-pre-R0.json`），而 v2 档（22:xx）仍抄旧结论 |
| b | `closure-plan` §2 册二：「**余下的缺口是"面板调不到"**」 | 服务面已通，**UI 面仍不通** | 见 §3.2 —— 表述把「服务面通」当成了「缺口关闭」 |
| c | 悬空 tag：`git fsck --full` 报 `dangling tag c6433244…`（`tag v0.3.1`） | 本地 tags **0** · 远端 tags **0** · `gh release list` **空** | **无实际暴露**（对象不可达），但 `fsck` 永久报一行噪声；`git reflog expire --expire=now --all && git gc --prune=now` 可清（**属不可逆操作 ⇒ 须你点头**，不清也无害） |

### 3.4 治理侧信号（仅供知情，非方案条目）

| 项 | 实测 |
|---|---|
| 计数闸压力 | `feature:可配置评估通道` **8/3**（超阈最多）· `feature:sc-s05` **3/3** · 另 7 处 **2/3** |
| 未登记落点 | **3,425** 文件（既有裁决：不追）· STALE **0** |
| 治理登记滞后 | 末次登记后 99 分钟有改动（`client.js`）—— 只读信号，不拒写入 |
| 仓根残留 | `.tmp-outline.txt`（2026-09-17，已 gitignore） |

---

## 4. 「落地了但**还没生效**」的诚实分界（等真机样本，非缺陷）

这三条**不属于未落地** —— 代码在、门在、复放可达，**只差真机样本**。**不得与断链混为一谈**：

| 项 | 缺什么 | 实测现值 |
|---|---|---|
| **S1 归因链真机出数** | 末次深睡在 **2026-09-21T10:04:58Z**（**早于 M3a 切点 20:06Z**），此后**无新深睡轮** | 台账尾 **2026-09-22T10:13Z** · `attributionScanned` 真库 **0 行**（字段只在下一轮才写）· 复放可达 **samples=30** ✅ |
| **睡眠汇报 §5 三态渲染** | `sleep-reports.jsonl` `sleep-round` **31 行**，带 `attribution` 的 **0 行** | 渲染代码在（`:250-259`），**从未在真数据上渲染过一次** |
| **B1 痕迹文件数轴** | 纪元 **4 / 10** | 需 ≥10 个新深睡纪元 |

---

## 5. 复验命令（一条一条可重跑）

```bash
# 五层
npm run typecheck && npm run build && node scripts/check-runner.mjs
node scripts/check-installed-sync.mjs --strict && node scripts/check-installed-features.mjs
node scripts/check-version-pin.mjs && git status -sb && git ls-remote origin master

# S1 真库复放（修后应 samples=30；还原旧式应 samples=0）
node _memory/audit/j3u1-rate.mjs
node scripts/check-attribution-samples.mjs            # 含 --selftest
node scripts/check-attribution-samples.mjs --selftest

# S2 仪器
node _memory/audit/a3-forward.mjs
node _memory/audit/b1-tracefiles.mjs
node scripts/essence-review-stability.mjs --from-ledger 6

# S3 / S4 / S5 门
node scripts/check-panel-fallback.mjs --selftest
node scripts/check-public-content.mjs --selftest
node scripts/check-eval-samples.mjs
node scripts/eval-gate.mjs                            # 预期 exit 3 = skip（诚实）

# S6 三键（服务面；UI 面见 §3.2）
curl -X POST -H 'Content-Type: application/json' -d '{"key":"injectBudgetChars","value":"1800"}' \
  http://127.0.0.1:3080/api/shoucang-panel/set
curl http://127.0.0.1:3080/api/shoucang-panel/config

# §3.1 回归（复现：均应非 0）
node _memory/audit/baseline-lab.mjs          # 现 exit 2
node _memory/audit/baseline-lab-verify.mjs   # 现 exit 1

# D3（实测 PASS，与档相反）
node scripts/inject-baseline-diff.mjs
```

---

## 6. 处置结果（**用户授权「全部处理」后落地 · 同日**）

> **态标签（R5）**：四件全部落在用户**本轮具名授权**（「授权全部处理」＝对 §3 四条的逐条回复）之内；
> 每项**可逆**（git / 备份 `~/.dsh/backups/tag-cleanup-20260922/`）· **未改真源数据**（记忆库与台账未动）。

| # | 事项 | 做了什么 | 判据（实测） |
|---|---|---|---|
| **①** | **修两处漏迁消费者** | 两件改**同源 import** `buildSamples`（与 9 个兄弟件同式）+ **登记 `CHECKS`** | 修前 `baseline-lab` **exit 2** / `baseline-lab-verify` **exit 1**；修后**均 exit 0**。**新门 `check-script-consumers`**：修前 **exit 1**（报出这 2 件 + 自身）、修后 **exit 0**；`--selftest` **12 例 / 6 反例**全过 |
| **①′** | **补防复发机检** | 新件 `scripts/check-script-consumers.mjs`（扫描面含 `_memory/`） | 守两条：① 无安全网的源码文本取数（**带「不在 CHECKS 表内」分界**）② import 面漂移。⚠ **首版漏分界 ⇒ 9 处里 7 处假红**，已修 |
| **②** | **T1 标签双写 + B1 恒判多数类** | 取样前置**归一**（复用 `tagLabelZh`，不另造同义表）；`check-eval-samples` 增 **⑤′ 类数下限** + **⑤″ 选项无异义双写** | 归一 **7 键 → 5 类**；门 **26 pass / 0 fail**。**变异实证**：还原"不归一" ⇒ 门 **exit 1**（报 90 条双写），还原后字节一致。**均衡 225 条实测**：B1 T1 由 **75.0%**（= 多数类基线）→ **33.3%**（真读数） |
| **➂** | **Laya 类定义表落后** | 补齐 `T1_DEFS` + 加**覆盖门** `assertT1DefsCover`（覆盖不足即 exit 2，不产出好看的错数） | Laya T1 **0.0% → 18.7%**（有真定义后）；门打印 `T1 类定义覆盖：5/5 ✓`。**撤回了"从注册表 note 派生"的假修**（note 是溯源台账，非语义） |
| **④** | **三键接 UI + 契约登记** | 注入页 +2 数值控件 +1 对象控件；`panel-contract.ts` 增 `SET_SCALAR_KEYS`(30)；`check-budget-override` 增 ⑦a/⑦b/⑦c | 门 **PASS**（⑦a 缺 0 · ⑦b 缺 0 · **⑦c 契约 30 ⟷ 源码 30 逐键一致**）。已装副本 `client.js` 三键命中 **4/4/6**；面板视图基线刻意更新（**3 项新增**，diff 逐条核对） |
| **⑤** | **D5 收益信号换源** | 新 `recall-yield#foldZeroGain`（三态单一实现）；`mcl.ts` 动作优先/词面兜底/**无证据不动**；审计落 `acted`/`yieldSignal` | `test-recall-yield` **⑥ 组 15 条全过**（含 2 组反例自证）；`nextZeroGain` 旧入口**行为逐字不变**（零迁移）。**实测依据**：词面 `true=0/3119` 恒 false；动作 **84.0% 非空** ⇒ **不做朴素换源**（详见下） |
| **⑥** | **清悬空 tag** | `reflog expire` + `gc --prune=now`（**对象先备份**） | `git fsck --full` **静默**（原报 `dangling tag`）；仓完好：**158 提交 · 928 文件 · 密钥扫描 0 命中** |

**⚠ ⑤ 为何"不做朴素换源"（本轮最重要的判断，含实测）**：用户拍板项是「`topicEcho` 口径改真实动作」。
**先测再改**发现：真实动作 `nextTools` **4985/5931 = 84.0% 非空**（长度分布 `{0:946,1:17,2:21,3:4947}`）
—— **同样不是"材料被用上"，且近恒定**；若按字面直接换源，84% 归零 ⇒ 换向出口**几乎不再触发**（从恒真变恒假）。
**那正是本仓反复剿的「假绿换假绿」**。⇒ 改为**三态**（动作 > 词面 > 无证据不动），并**如实写明两路都不是真判据**；
仓内真收益判据在 `deepsleep-run#judgeYieldRounds`（离线按轮，不适合每步）。**这一条我没有照字面执行，而是照判据执行，并把依据留档。**

**五层验收（本轮 · 全部实测）**：
① 仓内绿 —— `typecheck` **0 错** · `build` **OK** · `check-runner` **207 pass / 0 xfail / 1 skip（exit 0）**；
② 部署同步 —— 副本 **317/317 sha1 一致**（`--strict` PASS）；
③ 热重载 —— fiber **active**（清 104 模块）；
④ 功能探针 —— **118 项标记齐全**；
⑤ 云端 + pin —— 提交推送后核（见 §7）。

---

_建档 2026-09-22 · 本轮**全部读数重新取证**（未采信任何方案档自述）· 治理锚点待登记。_
_§3 的三条**均为本次核查新发现**，此前无任何档登记 —— 其中 §3.1 是**回归**（迁移漏迁），§3.2 是**半截**（服务面通、UI 面不通），§3.3 是**登记与实况脱节**。_
_**§6 为本轮执行结果**（用户授权「全部处理」⇒ 施工态），每条附判据与先红/变异实证。_
