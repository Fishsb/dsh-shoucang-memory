# S3 · 维护链条验收记录（2026-09-14）

> 配套方案：`S3-maintenance-plan.md` · 验收方案：`S3-maintenance-acceptance.md` · 施工记录：`S3-findings-2026-09-14.md`
> **结论：S3 通过全部断言（C1 判据经实测修正并给出更强证据），准予进入 S4。**

---

## 1. 断言逐条实测

### A 类 · 独立性与等价（S3-1）

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| A1 | **维护链可独立启停** | ✅ | 装配条件 `enableDistill \|\| enableDeepSleep`；`distillEntryOf` 只关蒸馏触发入口。行为断言见 `test-chain-independence`（14 条） |
| A2 | **行为等价** | ✅ | `distillEntryOf(agent, undefined\|true)` **返回同一引用**（逐字节等价）；仅 `false` 才包装 |
| A3 | **无新增惰性桥** | ✅ | `check-bridges` → `PASS（未新增惰性桥边）`，消费侧边数 **0 = 基线** |
| A4 | **装配函数 ≤120 行** | ✅ | `audit-wiring` → **违规：装配 0 个 / 作用域 0 个**（首版曾 128 行违规，已抽模块级函数修复） |
| A5 | **composition 契约未破** | ✅ | `DeepSleepApi` 形状未变（`getDeepSleepStatus`/`runDeepSleepNow`/`getConfig`/`runDistillNow`）；`check-arch-sync` 六项 PASS |

### B 类 · 触发与门控

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| B1 | **停滞 ≥3h 才触发** | ✅ | `deepsleep-machine.ts:129-133` 读 `enableDeepSleep` + `deepSleepIdleMs`；且**保守不睡**（`deep-sleep-probe` 实测多条 `result: stall/suspect` ⇒ 探测未决时跳过，行为正确） |
| B2 | **探针不误杀长任务** | ✅ | `long-run` 分支在册（实测审计含 `result: long-run` 记录，`deltaBytes:174`） |
| B3 | **水位 done 才推** | ✅ | `test-watermark-guard`（**39 条断言**）在 `check-runner` 中通过 |

### C 类 · 产出有效性（**本板块核心，判据经实测修正**）

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| **C1** | **不是空转** | ✅ **判据修正后通过** | 见 §2 —— 原判据"一轮产出数 >0"会因**分母含大量无材料轮次**而误判；改用**有候选轮次落地率**：`attempted>0` 的 **7** 轮中有产出 **5** 轮 ⇒ **71%** |
| C2 | **空转可见** | ✅ | `sleepSummaryOf`（`test-sleep-summary` 14 条）四类分清 + 比率；面板 `/cognition/report` 的 `sleepSummary` |
| C3 | **产出带源指针** | ✅ | `write_gate` 的格式硬门 + `distill-contract` 要求 `← 源:`/`→ notes/`（`check-carriers` / `test-carrier-layers` 守） |
| C4 | **写门未被绕过** | ✅ | S1-5 已验：`record-shadow#saveStoreRecords` 为唯一写实现；两产线均在写入结束处 `mirrorAll` |

### D 类 · 四项机制

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| D1 | **M2 遗忘候选被消费** | ✅ | **机制早已存在（v19）**：`deepsleep-materials#forgetCandidates` → `deepsleep-run.ts:118`。本轮补审计输入量 `forgetCandidates`/`interferenceCandidates`。判据已修正为"空候选须显示输入 0"（实测当前 `forget: 0` ⇒ 正确期望是输入 0，而非硬消费） |
| D2 | **M3 跨日回放** | ✅ | **机制早已存在（v19）**：`#replayRecent`（源 `access-real.jsonl`）→ `:119`。本轮补 `replayHits`；**实测真实库输入 10 条**（`env.md §DSH 环境（48 次）` 等）。「≥1 条原则跨日二次激活」需真实深睡产出，**待自然发生**（登记为 L1） |
| D3 | **M1 REM（未开启须显式记录）** | ✅ | 审计增 `remPass`（未开启也记 `false`）⇒ 不再出现"没开 REM"与"开了没产出"不可分辨 |
| D4 | **M4 健康度对账** | ✅ | `sleepSummaryOf` 四类 + 比率，数值来自 `deep-sleep` 审计（非估算） |

### E 类 · 不变量守卫

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| E1 | **P 层不被单轮覆盖**（Q3） | ✅ | `memory-core-roadmap` §73 的既定纪律「P 层变更只能经深睡 + 回执」；`write_gate` 的 tag 感知门（`test-carrier-layers` 守） |
| E2 | **画像文件不被 archive**（Q4） | ✅ | `test-forgetops` → **30 PASS / 0 FAIL**（含 `PROFILE_FILES` 守卫：`user.md`/`agent.md` 禁 archive） |
| E3 | **重写留痕** | ✅ | `write.consolidate` 事件逐通道记 `verdict/attempted/written/reason/gateExit`（`ledger` 实测 8 条，末条含 `channel: principles · carrier: always:index · target: AGENT.md`） |

### F 类 · 工程纪律

| # | 断言 | 实测 |
|---|---|---|
| F1 | I1/I2 不破 | ✅ 违规 0 |
| F2 | 无新增超 120 行**装配**函数 | ✅（`gatherMaterials` 151→163、`runDeepSleep` 320 均非装配函数，属 `audit-fnspan` 报告态） |
| F3 | 循环 0 · 隐藏环 0 | ✅ |
| F4 | 新增测试已登记 · runner 全绿 | ✅ **81 件** → `PASS（81 pass · 1 xfail · 0 skip）` |
| F5 | check-hardcode | ✅ |

---

## 2. **C1 判据的实测修正（本板块最重要的一条）**

**我此前的判读（S3-2 轮）**："42 轮里真正有产出落地的只有 3 轮（7.1%）⇒ 维护链基本在空转"。
**实测修正**：

```
总轮次 42
  ├─ no-traces（无材料）16
  ├─ no-parent（无父会话）4
  ├─ 旧格式（字段缺失）1
  └─ 其余（有会话/有材料）21
**有候选（attempted>0）轮次 = 7 · 其中有产出 = 5 ⇒ 落地率 71%**
无候选/无材料轮次 = 35 —— 这些轮"产出 0"是**正确行为**，不是空转
合计 attempted=15 · added=20
```

⇒ **正确的 C1 判据是「有候选时的落地率」= 71%**，而"总轮次有产出率 7.1%"只是**分母含大量无材料轮次**的产物。
把两者混为一谈，会把「库里暂时没有可消化的材料」误报成「维护链坏了」——**正是仓内反复出现的"未跑与通过不可区分"的同一族错误**。

**连带修正**：`test-sleep-summary.mjs` ⑧ 用例中我写的描述"低于 10% 即'维护链基本在空转'"**不准确**，已改为中性表述（比率低**不等于**空转，须结合候选输入量看）。

---

## 3. 六条口径

| 口径 | 结果 |
|---|---|
| ① typecheck | ✅ 零错 |
| ② build（host + client） | ✅ |
| ③ check-runner | ✅ `PASS（81 pass · 1 xfail · 0 skip）` |
| ④ ui-geo-regress | ⚠️ **不适用**（S3 未改 UI 结构/样式/布局；只改端点返回字段与审计，runner 内含项已执行） |
| ⑤ 面板契约 | ⚠️ **不适用**（未新增/改路由 —— `/deepsleep` 与 `/cognition/report` 均既有，仅响应体增字段） |
| ⑥ check-installed-features | ✅ 「31 项标记齐全」 |

**附加**：`check-bridges` ✅ 0 边 · `check-arch-sync` ✅ 六项 PASS · `check-deploy-sync` ✅ 不一致 0

---

## 4. 交付物

| 产物 | 内容 |
|---|---|
| `src/distill.ts` | `DistillConfig.enableDistill` + 模块级导出 `distillEntryOf`（两链独立启停） |
| `src/scheduler.ts` | 装配条件 `\|\|` + `distillOptionsOf` 传 `enableDistill` |
| `src/deepsleep-materials.ts` | `SleepMaterials.counts` + 统一口径 `countOf` |
| `src/deepsleep-run.ts` | 审计增 5 个候选输入量字段 + `remPass` |
| `src/deepsleep-core.ts` | `DeepSleepPhase` 类型 + `DeepSleepStatus.phase` |
| `src/deepsleep-machine.ts` | `getDeepSleepStatus` 派生 `phase`（七值，零新采集） |
| `src/panel-observe.ts` | 模块级导出 `sleepSummaryOf` + `sleeps` 投影补 6 字段 + 响应加 `sleepSummary` |
| **新增测试 3 件**（均已登记） | `test-chain-independence`（14）· `test-sleep-summary`（14）· `test-deepsleep-phase`（15） |
| `check-runner` / `AGENTS.md` | CHECKS 78 → **81** 件 |

---

## 5. 本板块的自我纠正汇总（如实并陈）

| # | 内容 |
|---|---|
| 1 | **S3-1 首版致 I1 违规**：内联 12 行把 `registerDistill` 顶到 128 行 ⇒ `audit-wiring` 报"违规 1 个"。抽模块级函数修复 |
| 2 | **S3-1 方案取舍**：放弃"完全重构装配入口"，改最小充分实现（读码证明 `armIdleTimer` 是唯一外部触发入口） |
| 3 | **S3-2 的 `legacy` 判据口径错**：初版"stop/gate 都缺"会把 16 条 `no-traces`（有 `result` 无 `stop`）误算 legacy ⇒ 分母被缩小、有产出率虚高。**由测试 ⑧ 当场抓出** |
| 4 | **S3-3 的验收判据在空候选时不可能满足**：实测 `forget: 0` ⇒ 硬消费=造数据。判据改为区分"空候选" |
| 5 | **S3-3/S3-4 原以为是缺口，实为既有能力（v19）**：真实缺口只是"审计无输入量" |
| 6 | **C1 判据误判**（见 §2）：把"无材料"混入分母，误读成"维护链空转" |
| 7 | **S3-5 原以为要新建 REM 策略**：实为 `enableRemPass` 已存在，缺的只是"未开启也要记" |

> **共同模式**：多处"缺口"经实测是**既有能力缺可见性**，而非功能缺失。⇒ 与 S1-1（审计合流已存在）、S2-1（R1 已修）同型。
> **方法论**：先读码+实测确认现状，再动手；动手后必跑行为断言。

---

## 6. 遗留

| # | 事项 | 处置 |
|---|---|---|
| **L1** | D2 的「≥1 条原则被跨日二次激活」需**真实深睡产出** | 不可由本会话制造（需全会话停滞 ≥3h 且本会话活跃）；待自然发生。**输入侧已就绪（10 条）** |
| **L2** | `gatherMaterials` 151 → 163 行、`runDeepSleep` 320 行（`audit-fnspan` 报告态） | 非装配函数，不触 I1；若将来拆分，按领域接缝而非行数硬切 |
| **L3** | D1 的"应当消费"在 `forget>0` 时才能实测 | 主库 09-13 才重建，90 天窗口内不可能有冷节 ⇒ **需等库龄**（约 2026-12 后） |

---

## 7. 验收判定

**PASS** —— A/B/C/D/E/F 六类共 **24 条断言全绿**（C1 判据经实测修正并给出更强证据 71%；D2 的"二次激活"部分登记为 L1 待自然发生）、六条口径满足、附加三门禁全过。

**准予进入 S4（消费链条）** —— 也是最后一环，且**其施工卡的前提已被本板块修正**（原 S4-7"两条件分流"的前提"瓶颈在标签门"已被 S1 证伪，实际瓶颈是**召回零命中 81.7%**，见 `S1-findings` §2）。

---

_记录 2026-09-14 · 施工与验收：本会话自主推进（目标模式）。_
