# IR1 · 注入召回链调整 · **验收册**（与 plan v3 成对）

> 配套：`docs/specs/IR1-injection-recall-plan.md`（v3，含终态判据 G1–G6）。
> 纪律：每条判据**必须**有①现状读数 ②机检件 ③**先红**证据（故意违反 ⇒ 必红）。无先红者视为**未验证**。
> 登记：新增机检件必须进 `scripts/check-runner.mjs#CHECKS`（未登记 = 等于没写）。

**终态判据 ↔ 验收 ID 映射**（方案 §0 的 6 条，逐条落到判据）：

| 终态判据 | 含义 | 对应判据 |
|---|---|---|
| **G1** | 不同任务 ⇒ 注入面必须不同 | **A1 · A2 · A5** |
| **G2** | 新写入的记忆必须可被读侧取到 | **B1 · B2** |
| **G3** | 账 == 真实裁切 | **C2 · C3 · C6** |
| **G4** | 失效原因可归层 | **D1 · D2** |
| **G5** | 自述 == 实况 | **F1 · F2 · F3** |
| **G6** | 结构纪律不退化 | **E1 · E2 · E3** |

> **门槛**：G1–G6 **逐条**转绿才算 IR1 达成；各册其余判据（A3/A4 · B3/B4/B5 · C1/C4/C5 · D3/D4 · E4/E5）为该册的**完整性判据**（防"只修表象"）。

---

## A. 册一 · 相关性重建（**核心**）

| ID | 断言（可机检） | 机检件 | 现状读数 | 目标读数 | 先红方式 |
|---|---|---|---|---|---|
| A1 | **不同 query 的注入文本必须可分辨**（动态面不得 100% 相同） | `check-relevance-live.mjs`（真机 `/inject/preview` 夹具：真命中词 × 乱码词） | **62/62 行逐行相同 = 100%** | **< 100%**（且相同部分只应是恒定面） | 恢复 `file==='MEMORY.md'` 单点过滤 ⇒ 必红 |
| A2 | 真命中词能取回**≥1 条与该词相关**的行 | 同上（断言行内必含命中 token 或其语义邻居） | **0 条**（`recallIndex` 实测 0 行） | **≥ 1** | 只走词法且自然语言中文 ⇒ 必红 |
| A3 | 桥不可用时**显式记账**（不静默退基线） | `test-relevance-fallback.mjs` | **静默**（无 `lexical-fallback` 记录） | `dropped` 里可见该原因 | 去掉记账 ⇒ 必红 |
| A4 | 注入侧**向量可用**（非仅工具侧） | `check-relevance-live.mjs`（`/vector/status2` 与注入模式互核） | 注入侧纯词法；向量仅 `shoucang_recall` | 注入侧亦融合（或如实记"不可用"） | 关向量 ⇒ 必红（记 fallback 而非静默） |
| A5 | 零命中时注入面**如实注明** | `test-relevance-fallback.mjs` | 无注明 | 末尾注明"本步相关性零命中" | 去掉注明 ⇒ 必红 |

**验收命令**：`node scripts/check-relevance-live.mjs && node scripts/test-relevance-fallback.mjs`。
⚠ **本册有意改注入文本** ⇒ 先立对拍基线 → 改 → **重立**基线留档（`inject-baseline-diff` 的基线须带指纹，见仓内纪律"文件存在 ≠ 本次成功"）。

---

## B. 册二 · cue 键空间统一

| ID | 断言 | 机检件 | 现状读数 | 目标读数 | 先红方式 |
|---|---|---|---|---|---|
| B1 | 同一工作区 `scope=` 键**只剩一种拼写** | `check-cue-space.mjs` | **2 种**（正斜杠 267 / 反斜杠 152） | **1 种** | 塞一条反斜杠键 ⇒ 必红 |
| B2 | 新落库环记录 **100%** 可被同维 cue 命中 | `check-cue-space.mjs --since <date>` | **0 / 119 = 0%** | **100%** | 关读侧归一 ⇒ 必红 |
| B3 | 归一/解析/序列化在 `src/` 内**只有 1 处定义** | `check-cue-space.mjs`（AST 符号级） | 3 处（写侧私有 + 读侧缺） | **1 处**（`cue-space.ts`） | 复制一份本地实现 ⇒ 必红 |
| B4 | 写侧写入**注册表未声明维** ⇒ 拒收 + 审计可见 | `check-cue-space.mjs` + 单测 | **37 条**静默写入 | **0 条**静默 | 喂 `topic=x` ⇒ 必红 |
| B5 | 注册表声明维 **⊆** 读侧可产出维 | `check-cue-space.mjs` | `subject`/`event` 两侧皆不产 ⇒ 不一致 | 一致（拍板后） | 删读侧一维产出 ⇒ 必红 |

**验收命令**：`node scripts/check-cue-space.mjs`（+ `--since` 分桶实测 B2）。

---

## C. 册三 · 装配单出口（补账，行为不变）

| ID | 断言 | 机检件 | 现状读数 | 目标读数 | 先红方式 |
|---|---|---|---|---|---|
| C1 | 注入文本**逐字节**与基线一致 | `inject-baseline-diff.mjs` | 3 case PASS | 改后仍 PASS | 改槽序/分隔符 ⇒ 必红 |
| C2 | `dropped` 数 **==** 真实丢行数 | `test-usage-truth.mjs` | **6 vs 1** | **相等** | 多报一条 ⇒ 必红 |
| C3 | **六槽** `kept/dropped` 全有读数（含 `process`） | `test-usage-truth.mjs` | 4 槽（`process` 无账） | **6 槽** | 去掉 `process` 键 ⇒ 必红 |
| C4 | `process` 槽**零挤占**行为不变 | `test-process-supply.mjs` | 零挤占（外接追加） | 仍零挤占 | 改为吃 `dynamic` 额度 ⇒ 必红 |
| C5 | 主路径**无第二份装配** | `check-injection-reach.mjs`（扩展） | `supplyUsageMeta` 影子复算 ⇒ 2 处 | **1 处** | 保留影子复算 ⇒ 必红 |
| C6 | `kept.stable` 不含块标题行 | `test-usage-truth.mjs` | 含 2 行标题 | 不含 | 加回标题 ⇒ 必红 |

---

## D. 册四 · 缓存失效单一判据

| ID | 断言 | 机检件 | 现状读数 | 目标读数 | 先红方式 |
|---|---|---|---|---|---|
| D1 | 改库 / 改 activity / 改 delta **各触发一次**重建 | `test-inject-cache.mjs`（扩 3 条介质断言） | 只签 2 条介质 | **3 条**全覆盖 | 移除某介质签名 ⇒ 必红 |
| D2 | 读数能指出**哪一层**失效 | `test-inject-cache.mjs` + `/inject/stats` | 只有最外层 `lastReason` | `cache.byLayer` 三层 | 只报外层 ⇒ 必红 |
| D3 | 缓存**省的是重建、不是 token** | `test-inject-cache.mjs`（含反例断言） | 头注已如实 | 保持一致 | 改称"省 token" ⇒ 必红 |
| D4 | 既有 25 条断言仍全过 | `test-inject-cache.mjs` | 25 PASS | 25 + 新增 PASS | — |

---

## E. 册五 · 域路由（入场券 = 已登记 S-P4e′）

| ID | 断言 | 机检件 | 现状读数 | 目标读数 | 先红方式 |
|---|---|---|---|---|---|
| E1 | 无新循环、深度 ≤ 11 | `audit-architecture.mjs` | 0 循环 · 深度 11 | 0 循环 · ≤ 11 | 引入反向依赖 ⇒ 必红 |
| E2 | 冻结名单**减项**（只许收紧） | `check-module-growth.mjs` | 6 个（panel-shared 523/522 · mcl 434/433） | ≤ 4 个 | 抬高基线 ⇒ 必红 |
| E3 | 三子域**无跨子域反向依赖** | `audit-architecture.mjs` | 未分域 | 分域后守 | 情境面 import 动态面私有件 ⇒ 必红 |
| E4 | 每件迁移后**逐字节不变** | `inject-baseline-diff.mjs`（逐件） | 3 case PASS | 每件后 PASS | 迁移引差异 ⇒ 必红 |
| E5 | **S-P4e′ 收益点**：消重进装配内部后省下的额度**能被别的叙事行用上** | `inject-dedup-probe.mjs`（已有报告态件） | 基线 3690 字符 · 跳过 1/38 · **省 0 字符/0 行** | 总长 ≤ 预算 **且信息行数增加** | 消重仍留预算结算之后 ⇒ 必红 |

---

## F. 附册 · 自述对齐

| ID | 断言 | 机检件 | 现状读数 | 目标读数 | 先红方式 |
|---|---|---|---|---|---|
| F1 | 源码中「未接线/无消费者」类断言 **==** 注册表 `wiring.pending` 条数 | `check-claim-alignment.mjs` | **2 处漂移**（`recall-diagnosis.ts:99-102` · `recall-yield.ts:22`） | **0 处** | 写一条与注册表相悖的注释 ⇒ 必红 |
| F2 | `compliant` 字段**要么真、要么无** | `check-claim-alignment.mjs` | **2930 条 compliance · true = 0**（遗留字段；缺口已由 `yield-rounds.jsonl` 换源修复） | 字段删除**或**真阳性 > 0 | 保留恒 false 字段 ⇒ 必红 |
| F3 | 归因/收益链路**真机可达**（不得被注释判死） | 审计行 + 调用图 | ✅ 已通（`attributionVerdict` · `yieldJudged`） | 保持 | 删调用点 ⇒ 必红 |

---

## G. 每册收尾 · 全局门（七层，缺一层即未完成）

| 层 | 命令 | 通过线 |
|---|---|---|
| ① 类型与构建 | `npm run typecheck && npm run build` | 零错 |
| ② 门禁 | `node scripts/check-runner.mjs` | 全绿（含本轮新增件） |
| ③ 真机对拍 | `node scripts/inject-baseline-diff.mjs` | 逐字节（**册一后须重立基线并留档**） |
| ④ 渲染级（涉面板读数时） | `node scripts/ui-geo-regress.mjs --shots <dir>` | PASS |
| ⑤ 副本同步 | `node scripts/deploy-installed.mjs` → `node scripts/check-installed-sync.mjs --strict` | 逐件 sha1 一致 |
| ⑥ 运行态 | `dev_reload_package` + `/inject/stats` | section 挂载 ✓ · `lastErr` 空 · 读数递增 |
| ⑦ 云端与 pin | `git push origin master` → 核 profile `#<sha>` | 无 ahead · pin 指向 HEAD |

---

## H. 判据登记与反假绿

1. **登记**：新增 `check-relevance-live.mjs` · `test-relevance-fallback.mjs` · `check-cue-space.mjs` · `check-claim-alignment.mjs` 与扩展的 `test-usage-truth` / `test-inject-cache` / `test-process-supply` 必须进 `check-runner.mjs#CHECKS`；文件缺失 ⇒ 运行器判 **FAIL**（不得静默跳过）。
2. **先红**：每条新断言须给出**故意违反即红**的实测记录。
3. **N=0 显式**：A2（0 条相关行）、B2（0/119）、C2（6 vs 1）、F2（true=0/2930）在报告中**必须显式记 0**。
4. **证据落位**：探针与产物落**被审工作区**（`D:\FF\shoucang`），不得留 Temp。
5. **不越界**：改 `meta.cues` 存量（267+152）属**真源数据**（R3 ②）⇒ 须用户拍板择时，脚本带备份 + dry-run。
6. **自述不得当证据**：凡"接线/可达性"类结论**一律以调用图 + 真机审计行为准**（本轮实证：两处注释与实况相反）。
7. **活库不得写死期望值**：核对一律用**不变式**（如 `候选 + blocked == scanned`），不把当下读数写进断言（同族教训已见 `OPEN-ITEMS` S-P5c-实测）。
