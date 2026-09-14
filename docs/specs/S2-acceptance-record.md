# S2 · 生产链条验收记录（2026-09-14）

> 配套方案：`S2-production-plan.md` · 验收方案：`S2-production-acceptance.md`
> **结论：S2 通过全部断言（E1 附口径说明、一条遗留登记），准予进入 S3。**

---

## 1. 断言逐条实测

### A 类 · 触发与成本

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| A1 | 无信号不唤醒 LLM | ✅ | `audit.distill-skip` **25 条**在 `ledger` 中（对照 `audit.distill-run` 24 条）⇒ 跳过路径确实在跑且留痕 |
| A2 | 触发阈值生效 | ✅ | 注册表 `trigger` 节：`idleMs` + `newTracesMin`；`scheduler.Config` 的 `enableDistill`/`idleWakeMs`/`minTurnChars`/`distillPrescan` 可调 |
| A3 | 预算有界且留痕 | ✅ | 注册表 `trigger`/`consolidate` 段（增量 ≤24,000 · 候选 ≤12,000）；被挡项在 `dispatch` 记账 |

### B 类 · 契约合规（本板块核心）

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| B1 | **每路输出都有 typeId** | ✅ **本轮补齐** | `writeDispatch` 四路输出逐一映射：① 环 6 通道（`RING_CHANNELS` = decisions/commitments/relations/valences/**outcomes**/**episodes**）→ `decision`/`commitment`/`relation`/`valence`/`outcome`/`episode`；② `appends`（notes 正文）→ **`noteBody`（本轮新增，`form:'notes'`）**；③ `newIndex`（索引行）→ `index` 形态的 14 个 typeId（按标签）；④ 拒收 → 不写库。**此前 ②无 typeId 承载** |
| B2 | 拒写留痕 | ✅ | `audit.gate-reject` 事件（`ledger` 实测 1 条）；`writeDispatch` 每处拒收都 `dep.infra.audit({kind:'gate-reject'...})` |
| B3 | 产出形态合规 | ✅ | `write_gate` 三闸口 + 索引行格式硬门（exit=4 语义）；`test-carrier-layers` 守层过滤 |
| B4 | 经 `record-shadow` 双写 | ✅ | S1-5 已验：`distill-write.ts:297` + `deepsleep-run.ts:281` 均调 `mirrorAll`；`saveStoreRecords` 为唯一写实现 |

### C 类 · 水位与可靠性

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| C1 | **done 才推水位** | ✅ | `scripts/test-watermark-guard.mjs`（**39 条断言**，含 `unverifiable-legacy` 降级基线分支）在 `check-runner` 中通过 |
| C2 | 失败不留半成品 | ✅ | `scripts/test-atomic-write.mjs`（D3 原子性，配 `atomic-fault-injector`）通过 |
| C3 | 重启可恢复 | ✅ | `audit-source.ts` **双源读**（legacy ∪ 台账）⇒ 水位可从审计回放重建；`check-observability` 明载"单读台账会丢水位历史"故必须双源 |

### D 类 · R1 复核（Tier-1）

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| D1 | **助手侧内容可被读到** | ✅ | `distill-chunks.ts:42-46` 读 **`assistant/message`**（本机 v3 转录该类型出现 **578** 次）并加 `[assistant]` 前缀；原读 `assistant/chunk`（v3 中 **0 次**）⇒ 此即 §15.6 的修复 |
| D2 | **回归断言在位** | ✅ | `scripts/test-distill-source-filter.mjs:35-37`：① v3 `assistant/message` 的 text 片被收录；② **只收 text 片、不收 reasoning**（思维链不进蒸馏材料）；③ 无 `message` 字段 ⇒ 空且不抛 |

### E 类 · 解耦与审计

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| E1 | 关蒸馏不影响消费（DS6 三域解耦） | ⚠️ **读码论证**（无专门门） | 消费链读的是**库内既有内容**（`readCarrier` 读 md、`loadStore` 读记录、`ring-supply` 读环），且 `panel-shared` 的每个读取点都有 `try → catch → 返回空` 兜底（记忆是增强非主路径）⇒ 蒸馏不运行不阻断供给。**但仓内无 `test-domain-isolation` 门**（方案引用的 I4 **未落地**）⇒ 登记为遗留 L2 |
| E2 | 类型分布可数出 | ✅ | 两条独立口径：① 环侧 —— `ring-commit.ts:220` 的 audit 事件记 `decisions/commitments/relations/valences/outcomes/episodes/events` 逐项计数（`ledger` 中 `audit.ring-commit` 6 条）；② 内容侧 —— 面板 `/arch/records` 返回 `byKind`（`panel-arch.ts:116`），记录层另有 `tag` 字段可出 tag 级分布 |
| E3 | **X6 有决断** | ✅ | **决断：`episodes.jsonl` 正式退役为 legacy 留档**。依据：新生产者**已存在** —— `ring-commit.ts` 的 `RING_CHANNELS` 含 **`episodes`**（`:181-203`，写 `episode` kind，属 fact 环，蒸馏/深睡两产线共用），`ledger` 中 `type=episode` **7 条**为增量实证；`episodes.jsonl`（257 条）已在 `check-observability` 的 legacy 白名单内（"仅存历史批次"） |

### F 类 · 工程纪律

| # | 断言 | 实测 |
|---|---|---|
| F1 | audit-wiring I1/I2 不破 | ✅ 违规 0 |
| F2 | audit-fnspan 无新增超限 | ✅ 仅基线两件（120 / 123） |
| F3 | audit-architecture 循环 0 · 隐藏环 0 | ✅ |
| F4 | 新增机检已登记 · runner 全绿 | ✅ `PASS（78 pass · 1 xfail · 0 skip）` |
| F5 | check-hardcode | ✅ |

---

## 2. 六条口径

| 口径 | 结果 |
|---|---|
| ① typecheck | ✅ 零错 |
| ② build | ✅ host 成功（本板块未改 client 面） |
| ③ check-runner | ✅ 全绿 |
| ④ ui-geo-regress | ⚠️ **不适用**（S2 未改 UI/样式；runner 内含项已执行） |
| ⑤ 面板契约 | ⚠️ **不适用**（未新增/改端点） |
| ⑥ check-installed-features | ✅ 「31 项标记齐全」（部署后复核） |

**附加**：`check-arch-sync` ✅ 六项 PASS · `check-deploy-sync` ✅ 不一致 0

---

## 3. 交付物

| 产物 | 说明 |
|---|---|
| `criteria.json#contentTypes.types.noteBody` | **新增 typeId**（`form:'notes'`，承载 `writeDispatch` 的 `appends` 输出）⇒ types 25 → **26** |
| `scripts/check-content-types.mjs` | 新增 **B5**（每个输出形态都有 typeId 承载）⇒ 断言 13 → **14** |
| `docs/specs/S2-acceptance-record.md` | 本文件 |

---

## 4. 本板块的设计修正（如实并陈）

| # | 内容 |
|---|---|
| **修正 1（重要）** | **S2-2 原设计"无 typeId 的输出直接拒写"是错的**。读码发现 `writeDispatch` 的 `appends` 路径（notes 正文）是**合法的既有写入**，只是契约里缺 `form:'notes'` 的 typeId。若按原设计拒写，会**破坏现有 notes 沉淀功能**。⇒ 改为：**在开发期用机检（B5）守住契约完备**，而不在运行期拒用户数据。判据理由：契约不完备是**开发期缺陷**，应在 CI 拦住；运行期拒写会把缺陷转嫁成数据丢失 |
| **修正 2** | 方案 E1 引用的 **DS6/I4「域隔离门」并不存在**（`scripts/` 无 `*isolation*`）⇒ 解耦改用读码论证（每个读取点有 catch 兜底），并把"补域隔离门"登记为遗留 L2 |
| **发现** | `writeDispatch` 的**环记录落库在路由分支之前**（`:186-195`）—— 设计理由（注释 `:182-184`）："在某项目会话里答应用户的事，仍然是答应过的事"⇒ 环记录**不受 route（memory/project/discard）影响**。这是**正确的语义**（经历不因路由失效），记于此以免后人误改 |

---

## 5. 遗留

| # | 事项 | 处置 |
|---|---|---|
| **L1** | `episodes.jsonl` 退役后，其 257 条历史**无迁移**（保留留档） | 已在 `check-observability` legacy 白名单；如需分析历史成败信号，须显式读 legacy 并注明口径 |
| **L2** | DS6/I4「域隔离门」未落地 | 登记：若要机器守住"关蒸馏不影响消费"，须新增 `test-domain-isolation`（方案 §E1 原设想）并登记 `check-runner` |
| **L3** | 蒸馏产出的 **tag 级**分布无直接审计字段（仅有环侧逐通道计数 + 记录层 byKind） | 属 S4 的"消费侧可观测"范畴，不阻塞 S2 |

---

## 6. 验收判定

**PASS** —— A/B/C/D/E/F 六类共 **19 条断言全绿**（E1 附读码论证口径 + 遗留 L2 登记）、六条口径满足、附加两门禁全过。

**准予进入 S3（维护链条）。**

---

_记录 2026-09-14 · 施工与验收：本会话自主推进（目标模式）。_
