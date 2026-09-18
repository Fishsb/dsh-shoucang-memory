# IR1 · 注入召回链架构调整方案（完善版 · v3）

> 定性：**架构级重排，不是修补**。当前停在**决策态**（R1）；施工须用户点名册/条。
> 配套验收：`docs/specs/IR1-injection-recall-acceptance.md`（判据 A–F 与机检件一一对应）。
> 取证：2026-09-18 审查（18 项门禁 + 真机对拍 + 运行态探针）+ **本轮 5 项决定性实测**（§1）。

---

## 0. 目标与终态判据（先定"完成"，再看病灶）

**总目标**：让「按任务/情境供给记忆」在**运行时可判别、可核验**——而不是"接口通了、门禁绿了、文本注入了"。

| # | 终态判据（可机检） | 现状 | 目标 |
|---|---|---|---|
| G1 | **不同任务 ⇒ 注入面必须不同**（动态面不得与 query 无关） | 真命中词 vs 乱码词 **62/62 行 100% 相同** | 相同部分**只应是恒定面** |
| G2 | **新写入的记忆必须可被读侧取到** | `createdAt ≥ 09-18` 的 119 条环记录 scope cue 命中 **0** | **100%** |
| G3 | **账 == 真实裁切** | 装配器报 6 vs 真实丢 1 | **相等**，且六槽全出账 |
| G4 | **失效原因可归层** | 只报最外层 `lastReason` | `cache.byLayer` 三层 |
| G5 | **自述 == 实况** | 2 处注释与实况相反（本轮实证） | **0 处漂移** |
| G6 | 结构纪律不退化 | 循环 0 · 深度 11 · 冻结 6 项 | 循环 0 · 深度 ≤11 · 冻结 **≤4** |

---

## 1. 现状基线（实测，非自述）

| 项 | 读数 | 来源 |
|---|---|---|
| 模块/行数/深度/循环 | 80 模块 · 19702 行 · 深度 11 · 静态循环 **0** · 动态隐藏环 **0** | `audit-architecture` |
| 扇入/规模最大 | targets(19)·criteria.generated(16)·vec(14) ／ criteria.generated(1360)·panel-shared(784 总/523 有效)·scheduler(769/617) | 同上 |
| 冻结名单 | 6：panel-shared 523/522 · mcl 434/433 · scheduler 617/611 · treeops 596/588 · styles 729/726 · body 615/613 | `check-module-growth` |
| 函数跨度 | 上限 400 · 实测最大 287；注入域 buildHotMemoryText 178 · mountHotMemoryInjection 214 | `audit-fnspan` |
| 装配契约 | 违规 0（I1 ≤120 行 / I2 ≤12 字段） | `audit-wiring` |
| 门禁 | 注入/召回相关 **18/18 PASS** · 副本 **242/242** sha1 · 真机对拍 **3 case 逐字节** | 本轮实跑 |
| 运行态 | section 挂载 ✓（30 次求值 · lastLen 2907 · 零错）· rebuilt 12 / reused 18 · 情境槽 12/12 cue · 向量 fusion 37ms | `/inject/stats` |
| **①动态面与 query 无关** | `/inject/preview` 真命中 vs 乱码：**62/62 行相同**（3977 字符）；空 query 才差 6 行 | 本轮实测 |
| **②注入侧纯词法** | `recallIndex("插件打包发布到 github")` ⇒ **0 行**；`"深睡蒸馏"` ⇒ 8 行**全 AGENT.md**、MEMORY **0** | 本轮实测 |
| **③桥结构上不可用** | `warm-recall.json` 由 `mcl.ts:495` 写，**只在 MCL 慢通道判定的回合**；`/inject/preview` 路径永无桥 | 本轮实测 |
| **④cue 键新写入 0% 可达** | 环记录 940：正斜杠 267（09-18 仍增）／反斜杠 152（停 09-16）；新 119 条命中 **0** | 直读 `.records/records.jsonl` |
| **⑤自述与实况相反** | `recall-diagnosis.ts:99-102`/`recall-yield.ts:22` 称"未接线/无消费者"，实况**都已接线且真机在跑** | 调用图 + 审计行 |

**一句话**：纪律层无违规；**问题全在"半通通道 + 多份口径"**，且都表现为「不报错、门禁绿、运行态看着活」。

---

## 2. 六处病灶（按影响排序）

| # | 病灶 | 实测证据 | 根因（架构） |
|---|---|---|---|
| 1 🔴 | **动态面与任务无关 ⇒ 召回对注入零贡献** | G1：62/62 相同；`recallIndex` 自然语言中文 **0 行** | 相关性通道**只收 `file==='MEMORY.md'`**（`dynamic-select.ts:188`）⇒ AGENT.md 命中全丢 ⇒ `picked` 恒空 ⇒ 落**位置式基线**；注入侧走**同步纯词法**，唯一向量桥只在 MCL 慢通道回合存在 |
| 2 🔴 | **cue 键空间劈半（正在漏）** | 新 119 条命中 **0%**；正斜杠 267 仍在增 | 归一化只有**写侧私有实现**，读侧无同源；匹配是**字符串全等**；注册表只声明维名、不声明**值规则**；无双向机检 |
| 3 | 装配两套 + 影子复算 | 账 6 vs 真实 1；`kept.stable` 含 2 行标题 | `supply-assembly` 被借用的只有**渲染器**；影子账是过渡取证装置，取证已完成却仍在跑 |
| 4 | 槽化不完整 + **记账缺口** | `kept` 4 槽（缺 `process`）；通道贡献不可分辨 | 单一 `cap` 内按**代码顺序**叠加四通道；`process` 走 `cap+proc.length` **外接追加**（**零挤占是设计、不改**），但**未入账** |
| 5 | 缓存失效**四套口径** | `/inject/stats` 只报最外层 reason | 30s TTL · size 签名 · 四条件事件戳 · 60s/5s/mtimeMs 各自为政 |
| 6 | **自述与实况漂移** | 2 处注释与实况相反（**本轮审查自己被骗**） | 缺"自述 ↔ 调用图"对齐机制；`compliant` 遗留字段恒 false（2930/0，缺口已换源修复） |

---

## 3. 目标态架构（分层详设）

```
①取材  candidates(记录集，含时态失效剔除)
        ↓
②相关性  分层配额：memory-index | agent-principles(新增) | profile
        通道：向量融合(注入侧可用) ∪ 词法；**失败/零命中必须可见**      ← 册一
        ↓
③契约   cue key space：normalize + validate + 维声明 + 值规则
        读侧写侧**同一实现**                                        ← 册二
        ↓
④槽     stable | dynamic | oneshot | process | situation | serendipity
        每槽：独立额度 + 独立 kept/dropped 出账                       ← 册三
        ↓
⑤装配   assembleSupply(唯一) → renderSupplyText(唯一)；账由装配器直出   ← 册三
        ↓
⑥出口   section(恒定面·节点0 压缩豁免) / context(动态面·可压区)
        统一 guardContextText（已有先例）                           ← 不立册（现状已达标）
        ↑
⑦维护   libStampOf：库戳 ∪ 介质戳 ∪ 会话戳；TTL 仅兜底                ← 册四
        ↑
⑧准入   自述 == 实况（机检守）                                      ← 附册
```

**模块地图（目标态）**

| 层 | 现有模块 | 目标态改动 |
|---|---|---|
| ①取材 | `supply-assembly#buildCandidates` · `fact-ring#isLive` · `targets#indexRowInLayer` | 不动 |
| ②相关性 | `dynamic-select#selectDynamicLines`（四通道叠加） | **拆为** `relevance-supply.ts`（分层配额选行 + 桥读取 + 记账）+ `dynamic-select` 退化为薄调用 ← **新件** |
| ③契约 | `ring-commit#normalizeCue`（写侧私有）· `situation-key#cuesOf` · `ring-supply#parse/serializeCues` | **收敛为** `cue-space.ts` ← **新件** |
| ④槽 | `supply-assembly#assembleSupply`（具名槽） | 扩为六槽具名 + 每槽 why |
| ⑤装配 | `panel-shared#buildHotMemoryText`（自做槽内渲染 + 影子账） | 只交候选 + 额度；删 `supplyUsageMeta`/`clampLines` 影子路径 |
| ⑥出口 | `panel-inject#mountHotMemoryInjection` · `inject-guard` | 不动（已达标） |
| ⑦维护 | `panel-shared#upstreamStampOf` · `panel-inject#injectCacheReason` · `vec` 三缓存 | **收敛为** `supply-stamp.ts#libStampOf` ← **新件** |
| ⑧准入 | — | `check-claim-alignment.mjs` + 注册表 `wiring.pending` 为唯一声明 ← **新件（机检）** |

**净结构效果**：新增 3 件小模块（`relevance-supply` / `cue-space` / `supply-stamp`），删除 3 处重复实现（影子装配、写侧私有归一、四套戳）；`panel-shared` 因搬出三段而**解冻** ⇒ 册五才有真实接缝。

---

## 4. 分册方案

### 册一 🔴 · 相关性重建（核心）

- **病灶**：§2-1。
- **目标态设计**（关键决策：**不新造机制，只改配额与预热时机**）：
  1. **分层配额**：相关性通道不再被 `file === 'MEMORY.md'` 单点过滤——`memory-index`（任务型知识）／`agent-principles`（**新增**：`[原则]/[路径]` 命中，认知层最该按任务浮现）／`profile` 各给独立配额。依据：AGENT.md 命中实测占 8/8，正是被丢掉的那批。
  2. **预热时点解耦**：`warm-recall.json` 现由 `mcl.ts:495` 在 **MCL 慢通道判定的回合**写 ⇒ 多数回合无桥。改为在**注入侧自己的 `agent/pre-step`**（`panel-inject` 已挂只读探针，同一扩展点）异步预热：`recallRanked(root, q, topK, 'all', embedCfg)` → 写桥（含 **AGENT.md 命中**）。**复用既有桥、既有 `recallRanked`、既有 async 扩展点 ⇒ 零新机制**。
  3. **同步注入读桥**：注入回调保持同步，读桥（指纹 + TTL）；**首步竞态 / 桥缺** ⇒ 显式记 `relevance-fallback`，**不静默**。
  4. **零命中可见**：`picked` 为空时注入面末尾如实注明"本步相关性零命中，以下为位置式基线"（与既有"另有 N 条未进入本步注入面"同规格）。
- **改动面**：新增 `src/relevance-supply.ts`；`dynamic-select.ts` 收敛为薄调用；`panel-inject.ts` 挂预热；`panel-shared.ts` 传参。
- **施工步骤**：① 立对拍基线（带指纹）→ ② 新件 + 收敛 → ③ 预热挂点 → ④ 尾注 + 记账 → ⑤ 两件机检登记 `CHECKS` → ⑥ 真机验收 A1–A5 → ⑦ **重立基线**并留档 → ⑧ 部署五层复查。
- **验收**：A1（不同 query 不得 100% 相同）· A2（真命中词取回 ≥1 相关行）· A3（fallback 记账）· A4（注入侧向量可用，或如实记不可用）· A5（零命中注明）。
- **回滚**：通道开关；关闭即**逐字节**回现状（位置式基线）。
- **风险**：① 预热竞态 ⇒ 首步必走 fallback（**如实记**，非缺陷）；② **有意改注入文本** ⇒ 提供商 prompt 缓存前缀变化（**需用户确认**）。

### 册二 · cue 键空间统一（契约层）

- **病灶**：§2-2。
- **目标态设计**：新建 `src/cue-space.ts` 为 cue 键**唯一**实现——
  `normalizeCueKey()`（**分维值规则**：`scope` 分隔符 `/` + 去尾斜杠 + 折叠重复斜杠；`task` kebab 小写；`subject` 枚举；`event` kebab）· `validateCueKey()`（维名不在注册表声明内 ⇒ **写侧拒收 + 审计 `cue.rejected`**）· `parseCues/serializeCues`。
  读侧 `sitCtx` 产键后**同过归一**（修复本体）；`ring-commit#normalizeCue` 与 `situation-key#cuesOf` 改为调用它；注册表 `cueDims` 每维补**值规则声明**。
- **存量**：`scripts/migrate-cue-keys.mjs`（只改 `meta.cues`、**不碰正文**；dry-run + 备份 + 幂等）。
- **施工步骤**：① 新件 + 注册表值规则 → ② 三处改为调用（**先读侧，立即止漏**）→ ③ 存量脚本 dry-run 出报告 → ④ **用户拍板后**执行 → ⑤ 机检 + 登记。
- **验收**：B1（1 种拼写）· B2（新记录 100% 命中）· B3（归一实现只 1 处）· B4（外维拒收）· B5（声明维 ⊆ 读侧可产维）。
- **回滚**：读侧归一可逆；存量脚本有备份。
- **风险**：存量改写触真源数据（R3②）⇒ **须用户择时**；历史正斜杠键与 task 维并存 ⇒ 归一后不冲突（不同维）。

### 册三 · 装配单出口（补账，行为不变）

- **病灶**：§2-3 / §2-4。
- **目标态设计**：主路径只交**候选 + 槽额度**；`assembleSupply` 接收**六槽具名**（含 `process`），每槽返回 `{ kept, chars, dropped[{line, why}] }`，`why` 带**通道来源**；删除 `supplyUsageMeta` 影子复算与就地 `clampLines`；`usage` 直取装配器 meta；`kept.stable` 不再含标题行。
- **⚠ 边界**：`process` 的**外接追加额度行为不变**（零挤占是设计）——**只补账**。
- **施工步骤**：① 立基线（册一已改则用册一新基线）→ ② 扩装配器具名声明的槽 → ③ 主路径改交候选 → ④ 删影子复算/就地裁切 → ⑤ 扩 `test-usage-truth` 为六槽 → ⑥ 逐字节对拍 PASS。
- **验收**：C1（逐字节）· C2（账==真实裁切）· C3（六槽出账）· C4（`process` 零挤占不变）· C5（单点装配）· C6（标题口径）。
- **回滚**：`renderSupplyText` 已有 opts，可回退手拼。
- **风险**：等价性是硬约束 ⇒ **任何文本差异即回退**。

### 册四 · 缓存失效单一判据（维护层）

- **病灶**：§2-5。
- **目标态设计**：`src/supply-stamp.ts#libStampOf(root, sid, q)` ⇒ 结构化戳 `{ lib, media, session, warm }`；`injectCacheReason` 改为吃结构化戳并返回 `{ reason, layer }`；失效收敛为**事件戳 / 上游戳 / TTL 兜底**三层，读数经 `/inject/stats.cache.byLayer` 暴露。
- **施工步骤**：① 新件（含 5s 节流，沿用现有取舍）→ ② 三处改调用 → ③ `/inject/stats` 扩字段 → ④ 扩 `test-inject-cache`（3 条介质断言 + 层归因）。
- **验收**：D1（三介质各触发重建）· D2（层归因）· D3（省重建 ≠ 省 token）· D4（25 条旧断言）。
- **回滚**：单函数内保留旧拼接。
- **风险**：失效过频 ⇒ 每步重建（性能）；用**节流 + 只签"变更罕见且不绑定查询"的介质**规避。

### 册五 · 域路由（**入场券 = 已登记 S-P4e′**）

- **病灶**：注入域多件抽出动因**全是棘轮逼迫**；`panel-shared` 523/522、`mcl` 434/433 **仍顶格** ⇒ 还会"为解冻而抽"。
- **不新造目标**：`OPEN-ITEMS` **S-P4e′** 已定案——跨形态消重真机**收益 0 字符/0 行**，根因是消重接在**预算结算之后**；落点在 `panel-shared` 画像行装配**内部** ⇒ 原文结论"**需专用一轮做重构**（宜按接缝拆模块）"。**本册即那一轮**。
- **目标态**：注入域显式三子域——恒定面（`hot-stable` + `injection-playbook`）／动态面（`dynamic-select` + `relevance-supply` + `supply-stamp`）／情境面（`cue-space` + `situation-*` + `ring-supply` 读侧）；`panel-shared` 只留挂点装配与路径/配置基元；`mcl` 注入出口并入出口层。
- **施工步骤**：逐件迁移，**每件迁完立刻跑真机逐字节对拍**（单件回滚成本最低）。
- **验收**：E1（无新循环/深度 ≤11）· E2（冻结名单减项 ≤4）· E3（无跨子域反向依赖）· E4（逐件逐字节）· **E5（S-P4e′ 收益点：省下的额度能被别的叙事行用上）**。
- **回滚**：逐件回退。
- **风险**：迁移引入行为差异 ⇒ 对拍守住。

### 附册 · 自述对齐（薄，可与任一册并行）

- **病灶**：§2-6。
- **目标态**：接线状态**单一事实源 = 注册表 `wiring.pending`**；源码注释不得单独宣称；新机检 `check-claim-alignment.mjs` 守「源码中"未接线/无消费者"类断言 == 注册表条数」；`compliant` 遗留字段**要么真、要么删**。
- **施工步骤**：① 机检件（**先红**）→ ② 改 2 处注释指向注册表 → ③ 处置 `compliant` 字段 → ④ 登记。
- **验收**：F1（漂移 2 → 0）· F2（`compliant` 真或删）· F3（链路真机可达保持）。
- **回滚**：注释与声明回退。

---

## 5. 依赖序与分期

| 期 | 内容 | 前置 | 交付物 | 出口条件 | 文本影响 |
|---|---|---|---|---|---|
| **P0** | **册一**（相关性重建）+ **附册**（自述对齐） | — | `relevance-supply.ts` · 预热挂点 · 2 件机检 · `check-claim-alignment.mjs` | A1–A5 + F1–F3 全绿；**重立对拍基线** | ⚠ **有意改文本**（唯一一期） |
| **P0′** | **册二**（键空间 + 存量归一） | — | `cue-space.ts` · 迁移脚本 · `check-cue-space.mjs` | B1–B5 全绿 | 不改（仅环记录 `meta.cues`） |
| **P1** | 册四（缓存戳） | P0 | `supply-stamp.ts` · `byLayer` 读数 | D1–D4 全绿 | 逐字节不变 |
| **P2** | 册三（装配单出口 + 补账） | P0 · P1 | 装配器具名槽 · 影子路径删除 | C1–C6 全绿 | 逐字节不变 |
| **P3** | 册五（域路由 + S-P4e′） | P2 收敛 | 三子域 · 冻结减项 | E1–E5 全绿 | 逐字节不变 |

> **P0 与 P0′ 可并行**（不碰同一批模块：`dynamic-select`/`vec`/`panel-inject` vs `ring-commit`/`situation-key`/`ring-supply`）。
> **分期铁律**：除 P0 外，**任何一期的注入文本必须逐字节不变**——这是"改动对用户可见面零影响"的判据，也是「等价先于基线」的落地。

### 5.1 规模与工作量（方向级，用于排期与控范围）

| 册 | 新增件 | 改动件 | 删除/收敛 | 新增机检件 | 规模 |
|---|---|---|---|---|---|
| 册一 | `relevance-supply.ts`（1） | `dynamic-select`（退化为薄调用）· `panel-inject`（预热挂点）· `panel-shared`（传参） | 单点过滤逻辑 | `check-relevance-live` · `test-relevance-fallback`（2） | **中**（跨 4 件，含唯一"改文本"） |
| 册二 | `cue-space.ts`（1）· `migrate-cue-keys.mjs`（1） | `ring-commit` · `situation-key` · `ring-supply` · `panel-shared#sitCtx` | 写侧私有 `normalizeCue` | `check-cue-space`（1） | **小**（单点契约 + 一处脚本） |
| 册三 | — | `supply-assembly`（具名槽）· `panel-shared`（删影子路径） | `supplyUsageMeta` · 就地 `clampLines` | 扩 `test-usage-truth` · `test-process-supply` | **中**（等价约束严） |
| 册四 | `supply-stamp.ts`（1） | `panel-shared` · `panel-inject` · `vec`（读戳） | 四套戳收敛为一 | 扩 `test-inject-cache` | **小** |
| 册五 | — | 逐件迁移（按接缝） | — | 扩 `inject-dedup-probe` | **中**（件数多、单件小） |
| 附册 | `check-claim-alignment.mjs`（1） | 2 处注释 · `compliant` 字段处置 | — | 该件本身 | **极小** |

**总净效果**：新增 4 件源码/脚本 + 4 件机检；收敛 3 处重复实现；冻结名单 **6 → ≤4**。
**排期建议**：P0 与 P0′ 并行（互不碰面）⇒ 一轮可完成两册；P1 → P2 串行（P2 依赖 P1 的稳定戳）；P3 最后（依赖 P2 让出接缝）。

---

## 6. 风险总表

| 风险 | 影响 | 缓解 | 回退 |
|---|---|---|---|
| 册一改注入文本 ⇒ 提供商缓存前缀变化 / 用户可见面变化 | 中 | 事前**用户确认**；事后重立基线留档 | 通道开关（逐字节回现状） |
| 预热竞态（首步无桥） | 低 | **如实记 `relevance-fallback`**（非缺陷） | — |
| 册二存量改写触真源 | 高 | **须用户拍板择时** + dry-run + 备份 + 幂等 | 备份还原 |
| 册三等价性破坏 | 高 | **逐字节对拍**为准入闸 | 回退手拼 |
| 册四失效过频 ⇒ 每步重建 | 中 | 节流 + 只签"变更罕见且不绑定查询"的介质 | 保留旧拼接 |
| 册五迁移引入回归 | 中 | **逐件**迁移 + 每件对拍 | 逐件回退 |
| 新增机检件未登记 ⇒ 静默不跑 | 中 | 运行器对缺失文件判 **FAIL**（仓规则 6） | — |

---

## 7. 待拍板（不代为决定）

1. **册一有意改注入文本**（现状动态面是常量）——是否接受？**决定 P0 能否开工**。
2. **`subject`/`event` 两维**：**删**（契约描述现状）还是**补产出**？
3. **存量 cue 归一**（267 + 152 条 `meta.cues`）属**真源数据**（R3 ②）⇒ 何时做（脚本带备份 + dry-run）。
4. **施工授权**：按 R1 请**点名册/条**（如"做册一"）；「你自己决策」≠ 授权施工。

---

## 8. 全局验收（每册收尾共用）

① `npm run typecheck` 零错 ② `npm run build` ③ `check-runner` 全绿（含新增机检）④ `inject-baseline-diff`（**P0 后重立基线**）⑤ `check-installed-sync --strict` ⑥ `dev_reload_package` + `/inject/stats` 健康位 ⑦ 核 profile pin。
