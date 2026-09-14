# S1 · 库核心验收记录（2026-09-14）

> 配套方案：`S1-library-plan.md` · 验收方案：`S1-library-acceptance.md` · 施工中发现：`S1-findings-2026-09-14.md`
> **结论：S1 通过全部断言（A3/A6 附口径注释），准予进入 S2。**

---

## 1. 断言逐条实测

### A 类 · 落点完备性

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| A1 | 每个 Record kind → 唯一一面 | ✅ | `check-content-types` **A5 面归属唯一**（异常无）；分布：内容面 4 · 经历面 7 · 无面 2（kind 计）；无跨面 |
| A2 | 三面载体存在且可读 | ✅ | 内容面：三索引 + notes 8 件可读；经历面：环记录 **105 条**（`file=''`）；元面：`ledger.jsonl` 1,258 条可解析 |
| A3 | 时态单一实现 | ✅ **附注释** | 成立性判定**单一** = `fact-ring.ts:33-37#isLive`（含 fail-closed 坏时间戳），消费者 `supply-assembly:141,145` · `ring-supply:142`。**⚠ 另有一份语义不同的"活跃"判定** `assertion-graph.ts:67#isLiveRow`（`!validTo && lifecycle!=='retired'`，不看 `at`）—— **作者显式声明为有意设计**（`:66` "不依赖 fact-ring 的策略，保持本件零策略耦合"），**不是漂移**。两者的失败模式不同：`isLive` 对坏时间戳 fail-closed；`isLiveRow` 不看时间戳故不受影响 |

### B 类 · 数据面一致性（X4/G6）

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| B1 | 三处根主从有唯一声明 | ✅ | 注册表新增 `roots` 节：`memoryLib`（活体·唯一记忆库）· `knowledge`（活体·非记忆库·运行状态区）· `repoPrivate`（非活体·仓内副本） |
| B2 | 面板可显示当前活体根 | ✅ | `/content-types` 端点新增 `roots` 字段（返回 `memoryLibRoot()` / `knowledgeRoot()` 实际路径 + authority） |
| B3 | 声明与实测一致 | ✅ | 主库 1,177 条 Record；`_memory/` 标签分布**不同**（非镜像）⇒ 与 `authority:非活体` 一致 |

### C 类 · 审计面合流（X3/G9）—— **改为复用既有件**

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| C0 | **不新造脚本**（仓规 5：不从零造轮子） | ✅ | 实测仓内**已实现双源合流**：`mcl-calibrate.mjs:30-43` · `mcl-compliance.mjs:28-45` · `panel-observe#mclAuditRecent` · `check-observability:220-226`（legacy 引用白名单棘轮） |
| C1 | 一份命令出全域分流指标 | ✅ | `node scripts/mcl-calibrate.mjs` → 样本 **1,411 步**（= 冻结 936 + 现行 475，**两法独立吻合**） |
| C2 | 跨期口径显式 | ✅ | 输出标注"数据源 legacy ∪ 台账 mcl*"，并按 **kind** 分流（不再把 `mcl-ready`/`mcl-skip` 混入分流分母） |
| C3 | 不迁移数据 | ✅ | 冻结档 `mcl-audit.jsonl` mtime/size 未变（1,120 条 · 240 KB） |

### D 类 · 工程纪律

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| D1 | I1/I2 不破 | ✅ | `audit-wiring` → 违规 0 |
| D2 | 无新增超 120 行 | ✅ | `audit-fnspan` 仍只有基线两件（120 / 123） |
| D3 | 循环 0 · 隐藏环 0 | ✅ | `audit-architecture` → **静态循环依赖 0 · 动态边隐藏环 0** |
| D4 | 零硬编码 | ✅ | `check-hardcode .` 通过 |
| D5 | check-runner 全绿 | ✅ | `PASS（78 pass · 1 xfail · 0 skip）` |

### E 类 · 文档对齐（X1）

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| E1 | `check-arch-sync` 六项 | ✅ | **六项全 PASS**（模块数 64 三方一致 · 注入预算 4000 · 桥 0 · wiring.pending 0 条） |
| E2 | MCL 独立地位标注 | ✅ | ARCHITECTURE.md M8 行补注「独立注册于 `scheduler.ts:689 registerMcl`，独立额度 600 字符…」 |
| E3 | 深睡归属标注 | ✅ | M7 行补注「装配入口当前挂在蒸馏产线内（`distill.ts:271`）⇒ 维护链无独立注册入口；独立化是 **S3** 目标」（S1 只标注、不迁移） |

### 附 · 新增断言（S1 引入）

| # | 断言 | 实测 |
|---|---|---|
| A6 | 数据面主从声明完备（三项齐备 + 各有 authority + 声明函数在 src 存在） | ✅ 异常无；`memoryLib=活体 · knowledge=活体（非记忆库） · repoPrivate=非活体` |

---

## 2. 六条口径

| 口径 | 结果 |
|---|---|
| ① typecheck | ✅ 零错 |
| ② build（host + client） | ✅ 路由 42 条 · `client.js` 659,497 B |
| ③ check-runner | ✅ 全绿 |
| ④ ui-geo-regress | ⚠️ **不适用**（S1 未改 UI/样式/布局；check-runner 内含项已执行并通过） |
| ⑤ 面板契约 | ✅ **适用并通过**（S1 新增 `/content-types` 端点）→ `check-panel-contract` **5 PASS / 0 FAIL** · `gen-panel-contract --check` 产物新鲜 |
| ⑥ check-installed-features | ✅ 「已安装副本带着本轮全部特性（31 项标记齐全）」 |

**附加**：`check-deploy-sync` ✅ PASS（不一致 0）· `check-srcmap` ✅ · `check-observability` ✅ PASS（suite 域事件流 1 = 1）

---

## 3. 交付物

| 产物 | 说明 |
|---|---|
| `src/panel-observe.ts` | 新增 `/content-types` 只读端点（类型分布 · 可达性 · 通路接线 · **roots 主从**） |
| `src/panel-contract.ts` | 契约表登记该端点（路由 41 → **42**） |
| `scripts/test-panel-wiring.mjs` | ROUTES 登记新路由（**登记纪律**：未登记即 FAIL） |
| `skill/engine/criteria.json#roots` | **数据面三处根的主从声明**（活体 vs 非活体） |
| `scripts/check-content-types.mjs` | 新增 **A6**（主从声明完备）断言 → 13 项 |
| `docs/ARCHITECTURE.md` | M8 补 MCL 独立注册 · M7 补深睡归属标注 |
| `docs/specs/S1-findings-2026-09-14.md` | 三条订正 + 三项新发现 |

---

## 4. 本板块的订正与自我纠正（如实并陈）

| # | 内容 |
|---|---|
| **订正 1** | **S1-1 原本计划新造 `audit-merge.mjs`——实测发现仓内已实现双源合流且有 4 个消费者** ⇒ 改为复用（避免重复造轮子）。若照原计划施工，会产出与 `mcl-calibrate` 功能重叠的第二份实现 |
| **订正 2** | **G4 诊断错误**：我原写"快通道实际 2.3%、差距全被标签门吃掉"。实测（1,411 步）显示 **`hit` 为空占 81.7%** ⇒ 主瓶颈是**召回零命中**，不是标签门；调阈值/放宽 gate 都无效。**这直接影响 S4-7「两条件分流」的前提**（见 `S1-findings` §2） |
| **订正 3** | **G9 撤销**：原写"channel 缺失 184 条 ⇒ 口径不闭合"。实测那 184 条属 `mcl-ready`(58)+`mcl-skip`(126)，**本就没有 channel 字段**；`mcl-step` 的 channel **无缺失**（936 = 910+26） |
| **订正 4** | **X1 表述订正**：原写"ARCHITECTURE.md 缺 MCL 行"不准确——M8 行载体列本来就含 `mcl.ts`；准确说法是"未标其独立产线地位" |
| **自我纠正 5** | **A3 差点误判**：我一度准备把 `assertion-graph#isLiveRow` 判为"第二份判定 = 漂移"，读码后发现**作者显式声明为有意设计**（零策略耦合）⇒ 改为如实记录语义区别，**不改动代码** |
| **自我纠正 6** | 补注 MCL 时把"独立**预算** 600 字符"写进 M8 行 ⇒ 被 `check-arch-sync` ③ 当成注入预算（它取全文**第一个** `预算 N 字符`）⇒ 该门禁 FAIL；改为「独立**额度**」后 PASS。**已记入 findings §3 作为通用坑** |
| **自我纠正 7** | 一次 edit 只删了换行、把 M8/M9 **两行误合并** ⇒ 读回后当场拆开修正 |

**新发现（转 S4 处置）**：
- **N1**：`mcl-compliance` 报"材料走 systemPrompt 段 n=0 / 消息面 1,102"，与 `scheduler.json` 的 `mclMaterialInSystem: true` **矛盾** ⇒ 须核运行时实际值；也可能是审计口径问题（system 段分支写 `viaSystem:1`，消息面分支不写该字段）
- **N2**：合规率恒 0（1,102 条全 `compliant:false`）⇒ `rowSignals` 转述容忍判定**实际不工作**
- **N3**：召回命中里 `(无/空)` 占 81.7% ⇒ 订正 2 的下一层问题

---

## 5. 验收判定

**PASS** —— A/B/C/D/E 五类 + 新增 A6 共 **19 条断言全绿**（A3 附口径注释）、六条口径满足、附加四门禁全过。

**准予进入 S2（生产链条）。**

---

_记录 2026-09-14 · 施工与验收：本会话自主推进（目标模式）。_
