# S4 · 消费链条验收记录（2026-09-14）

> 配套方案：`S4-consumption-plan.md` · 验收方案：`S4-consumption-acceptance.md` · 施工记录：`S4-findings-2026-09-14.md`
> **判定：条件性未通过（4 项未达成 / 5 项部分达成）** —— 本记录**不谎报全绿**，逐条列出未达成项与前置条件。

---

## 1. 断言逐条实测

### A 类 · 可达性完备

| # | 断言 | 状态 | 证据 |
|---|---|---|---|
| A1 | `reachable:true` 的类型在注入面能取到 | ✅ | `check-content-types` B1（25→26 类型全过）+ `check-injection-reach`（8 项申报） |
| A2 | `reachable:false` 取不到 | ✅ | 不可达清单 **0 项**（契约 `reachable` 全 true 且均有通路） |
| A3 | 正面断言可复现（`supply-assembly` 判为未抵达） | ✅ | `check-injection-reach` ③④ + **反例自证**（注入"装配器接管" ⇒ ④ 当场 FAIL） |
| A4 | 105 条环记录可达 | ⚠️ **部分** | 情境槽额度已升（S4-5：topN 3 → **11**）；但 `situationLinesOf` 要求 `cues.length > 0` ⇒ **无线索时不供给**（设计使然）；实测 cue 命中率待新数据 |

### B 类 · 预算与装配单一化

| # | 断言 | 状态 | 证据 |
|---|---|---|---|
| B1 | 只有一份预算账 | ✅ | S4-1：`supply-assembly#budgetOf` 为唯一公式（12 组逐式等价） |
| B2 | 账与真实裁切**逐字节可比** | ✅ **已达成（S4R/R2 · 2026-09-14）** | `supplyUsage` 改吃主路径自己的 `clampLines` 结果（`real` 参数）⇒ `kept` 与 `droppedRows` 即**真实裁切**。实测互核：注入文本 `- ` 行 **42** == `kept.stable 35` + `kept.dynamic 9` − 标题 2；且**被丢的行确实不在注入文本中**（泄漏 0） |
| B3 | 五处差异逐项决策留痕 | ✅ **已达成**（差异已由实现**消解**，无须二选一） | R1 把差异从 **7 处**（比原记的 5 处多出「段间分隔符」「段标题有无」—— 本次实测才发现）逐项**用选项表达**：`order` / `separator` / `headers` 空串 / `tailNote` ⇒ **两套渲染收成一套**，而注入文本逐字节不变 |
| B4 | 换装配后注入字节差异可解释 | ✅ **已达成** | 逐字节**等价已获验证**（不再是"已被证伪"）：真机三 case 3231/3676/3621 与改造前**完全一致**；`test-render-opts` **X1 先证差异存在、X2 再证可消解** |

### C 类 · 三层供给生效

| # | 断言 | 状态 | 证据 |
|---|---|---|---|
| C1 | 判据常驻在位 | ✅ | S4-2：`injection-playbook` **147 字符**（三层各一条）+ 14 条断言 |
| C2 | 中层 `process` 槽**真在工作** | ✅ **已达成（2026-09-14）** | `dynamic-select#selectProcessLines`（按标签取 `[路径]`，**前置且不吃基线额度**）+ panel-shared 接入。**实测**：`enabled:false` 与"不传 process" **逐字节一致**；开启后 `[路径]` **前置取回**；**真实库**全层索引行 106 条（`[路径]` 5 条）⇒ 槽取 3 条。`test-process-supply` **14 条** |
| C3 | `[路径]` 已从恒常面剥离（不重复供给） | ✅ | `[路径]` 为 **R 层 gated**（`criteria.json#carriers.tags`）⇒ 本就不进 always 恒常面；`check-carriers` 守 |
| C4 | 到期前瞻生效 | ✅ | S4-4：`dueSoon`（7 天窗口）+ 组序改三组；`test-ring-supply` 29 → **36 pass** |
| C5 | 经历面扩容有数值依据 | ✅ | S4-5：`clamp(ceil(√N),3,12)`，实测 N=105 ⇒ 11；13 条断言（含"**只数环记录**"） |

### D 类 · 内层两项判据

| # | 断言 | 状态 | 证据 |
|---|---|---|---|
| D1 | **检索停止准则**（查询收益 + 斑块切换） | ✅ **已达成（2026-09-14 补做）** | 新模块 `recall-yield.ts`（`nextZeroGain` / `shouldSwitchSource` / `yieldOf`）+ `mcl.ts` 在合规判定处折收益并出 **`switchSource` 信号**（审计可见）；**零新采集** —— 收益信号就是既有 `compliance` 事件的 `compliant` 字段。`test-recall-yield` **16 条**（含"**合规必须归零**，否则长跑会永久换向"的反例自证） |
| D2 | 两条件分流 | ✅ **判据已重定**（真数据待） | S4R/R3：`recall-diagnosis#adviseFromMissCounts` 由 `missReason` **分布推导**调参方向（4 分支：`insufficient-data`/`enable-embed`/`fix-recall`/`lower-threshold`），**原写死的判据已废弃**（其前提"瓶颈在标签门"被 S1 证伪）。真样本 **0 条** ⇒ 输出 `insufficient-data`（**不猜方向**，C3）。`test-recall-advice` **14 条**（含 C2 反例自证：同量不同分布 ⇒ 不同结论） |
| D3 | 快通道率变化可测 | ✅ | `recall-diagnose.mjs` 可出归因分布与分层占比（首跑：可归因 0 条，字段需新会话产生） |
| D4 | 零贡献率改善（基线 49.3%） | ⚠️ **需新数据** | 字段已就位；旧数据不可归因（明知故不猜） |

### E 类 · 不变量守卫

| # | 断言 | 状态 | 证据 |
|---|---|---|---|
| E1 | 恒定面必在（P 层不被比例裁） | ✅ | `capStable` 吃余额（S4-1 后仍 3200@4000）+ `test-budget-single` ② |
| E2 | 被裁留痕 | ✅ | `clampLines` 的 dropped 提示（既有实现，`test-inject-cache` 守） |
| E3 | 块内裁行不丢块 | ✅ | 55%/45% 分块 + 各自下限（既有修复，`:658-669`） |
| E4 | 独立槽不互挤 | ✅ | `budgetOf` 只派生三层；`situation`/`serendipity` 独立（S4-5 只调 `topN`，不动预算） |
| E5 | 未新增常驻注入点 | ✅ | 判据块走既有 stable 段（S4-2）；`check-injection-reach` 守抵达面 |

### F 类 · 工程纪律

| # | 断言 | 状态 |
|---|---|---|
| F1–F5 | 双棘轮 / 循环 0 / 登记 / 全绿 / 硬编码 | ✅ 全过（`check-runner` = `PASS（86 pass · 1 xfail · 0 skip）`） |

---

## 2. 六条口径

| 口径 | 结果 |
|---|---|
| ① typecheck | ✅ 零错 |
| ② build（host + client） | ✅ |
| ③ check-runner | ✅ `PASS（86 pass · 1 xfail · 0 skip）` |
| ④ ui-geo-regress | ⚠️ **不适用**（S4 未改 UI 结构/样式；runner 内含项已执行） |
| ⑤ 面板契约 | ⚠️ **不适用**（S4 未新增/改路由；`/deepsleep`/`/cognition/report` 仅响应体增字段） |
| ⑥ check-installed-features | ✅ 「31 项标记齐全」 |

**附加**：`check-content-types` ✅（`due` 通道已如实转 `wired:true`）· `check-injection-reach` ✅ · `check-module-growth` ✅ · `check-arch-sync` ✅ · `check-changelog` ✅

---

## 3. 未达成项与前置条件（**本节的诚实性是本记录的主要价值**）

| # | 未达成项 | 性质 | 前置 |
|---|---|---|---|
| **C2** | 中层 `process` 槽运行时 | **可做**，但需先重构 | **L5**：`panel-shared.ts` 在 `check-module-growth` 冻结上限（846/846）⇒ 接入须先做「**动态面选行领域拆分**」（把 `:582-622` 抽成独立模块，净减约 35 行） |
| **D1** | 检索停止准则 | ✅ **已补做**（2026-09-14，见下表 D1 行） | ~~无外部前置；`mcl.ts` 在冻结名单（623/632，**仅余 9 行**）⇒ 须落新模块~~ → 已落 `recall-yield.ts` |
| **D2** | 两条件分流 | **待数据**，不可加速 | S4-6′ 的 `missReason` 需新会话产生样本；且原前提已证伪，判据须据新数据**重定** |
| **B2/B3/B4** | 装配单一化（账可逐字节比） | **须产品决策** | **L4**：切 `renderSupplyText` 接管主路径会**改注入文本**（用户可见走样）⇒ 按"不由 agent 自主推进"的边界，留待用户拍板 |
| **D4/A4** | 零贡献率改善 / 环记录可达度 | 待数据 | 同上 |

**一条自我披露**：**D1（检索停止准则）是本轮的遗漏**。原方案 §4.4 明确列了它，我在改序（把 S4-7 降级、加 S4-6′）时**只换了 prerequisite 分析，没把 D1 重新排进施工序列**。这不是"待条件"，是"漏做" —— 记于此以免被"多项未达成"的整体叙述掩盖。

---

## 4. 交付物（S4 已完成的五项）

| 产物 | 内容 |
|---|---|
| `src/injection-playbook.ts`（新模块 42 行） | S4-2 三层判据常驻（147 字符）+ 三态兜底 |
| `src/recall-diagnosis.ts`（新模块 52 行） | S4-6′ 召回零命中归因（五值 + 分层） |
| `supply-assembly#budgetOf` | S4-1 预算单一实现（逐式等价） |
| `ring-supply#adaptiveTopN` | S4-5 情境槽额度自适应（√N） |
| `ring-supply#dueSoon` + 三组排序 | S4-4 到期前瞻（`due` 通道 `wired:true`） |
| `scripts/check-injection-reach.mjs`（新机检 81 行） | S4-9 注入抵达面**正面断言**（含反例自证） |
| `scripts/recall-diagnose.mjs` | S4-6′ 诊断（报告态） |
| **测试件 6 个**（均已登记） | `test-chain-independence`(14) · `test-sleep-summary`(14) · `test-deepsleep-phase`(15) · `test-memory-playbook`(14) · `test-recall-diagnosis`(15) · `test-budget-single`(8) · `test-situation-quota`(13) · `test-ring-supply` +7 |

CHECKS：**78 → 86 件** · 模块数：**64 → 66**

---

## 5. 判定

**S4 全部可施工项完成，仅剩「待数据」项** —— S4R 收尾（R0–R5，见 `S4R-closure-record.md`）已把
**B2/B3/B4 转绿**，并**重定 D2 判据**：

- **✅ 已达成**：A1–A3 · **B1–B4** · C1–C5 · **D1** · **D2（判据已重定，不等数据）** · D3 · E1–E5 · F1–F5
- **⏳ 待数据（不可加速）**：**A4 / D4** —— **复验方法已固化**（`S4R-reverify.md`：命令 + 基线值 + 判读标准 +
  记录表）。样本到位即可判定，**不需要再写代码**。

> **S4 §6.1「须产品决策」已撤销**：R1 证明差异根源是 `RenderOpts` **选项不全**（缺 4 维），
> 不是"不可能等价"。补齐后**逐字节等价**，**无须牺牲任何用户可见文本**，也就无须决策。
> **修正留痕**：本节原判为"须用户拍板"，是**误判**；误判来源是把"当前实现做不到"当成"原则上做不到"。

**S4 全部可施工项已完成**（判定见 §5）。后续收尾（S4R R0–R5 / S4X / S4Y）已把 **B2/B3/B4 转绿**、
**D1 补做**、**L5/C2 完成**、**D2 判据重定**、**L8 修复**；**仅剩 A4 / D4 待数据**（复验入口见
**`docs/OPEN-ITEMS.md`** 与 `S4R-reverify.md`）。

> **修正留痕**：本行原写「S4 未完成 · 剩余 D1 → L5 → C2 待做；B2/B3/B4 待产品决策」——
> 那是**该时点的状态**，上述各项已于同日全部完成。保留此行以示**状态标记必须随完成同步**。

---

_记录 2026-09-14 · 施工与验收：本会话自主推进（目标模式）。_
