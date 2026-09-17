# 验收方案 · 判据分层与模型介入（2026-09-15）

> **配对对象**：`docs/judge-layering-plan-2026-09-15.md`（全项目横切方案册）。**每条 AC 可追溯方案册一节。**
> **两条纪律**（仓内既有）：① 新判据必须**先红后绿**（`AGENT.md §实证纪律`）；② 未登记 `CHECKS` = 等于没写（仓规则 6）。
> **另加本册一条**（引 `[lesson] 审计脚本模型核对`）：**机检自身不得靠兜底通过** —— 每条新机检必须自证"去掉兜底即红"。

---

## 0. 收尾六条口径（仓规则 7，通用）

`npm run typecheck` → `npm run build` → `node scripts/check-runner.mjs` → `node scripts/ui-geo-regress.mjs` →
`check-panel-contract` + `gen-panel-contract --check` → `deploy-installed` + `check-installed-features`。
发布前置另加：`check-public-tree`（必须 PASS）· `check-installed-sync --strict`。

---

## 1. J0 · 登记（**不改行为**，纯声明）

### AC-D.1 `judgeKind` 全量登记
- **判据**：`criteria.json` 中**每一条** criteria 都有 `judgeKind ∈ {deterministic, vector, llm}`；投影由 `gen-criteria` 生成，**禁手写**。
- **复验**：`node scripts/gen-criteria.mjs --check && node scripts/check-criteria.mjs`
- **反例自证**：删掉任意一条的 `judgeKind` ⇒ 生成器或机检必须**红**（证明"每一条"是真全量，不是抽查）。

### AC-D.2 阈值清单**显式列举**（引 `[原则] 模式派生集合先核对`）
- **判据**：给出**完整的、逐条列举的**阈值清单（id / 值 / `文件:行` / 现有校准状态），**不是通配符匹配的计数**。
- **为什么单列一条**：扫描数值阈值本质是"模式派生集合"，仓内已立原则——
  **通配/名字推导的命中集，执行前必须显式列举**（`notes/lessons.md §危险操作与删除判据`）。
- **复验**：`node scripts/threshold-scan.mjs --list`（**新增**，报告态；输出逐条清单供人工核对）
- **反例自证**：先手工列举（本册方案 §2 已知 7 个 + `mclFamiliarThreshold`），再用扫描器跑；
  两者**差集必须为空**。若扫描器多报/漏报 ⇒ 修扫描器口径，**不得**直接采信正则结果。

---

## 2. J1 · 两条机检（三向可红）

### AC-V.1 `judgeKind` 三向机检
- **判据**：① 标 `vector|llm` ⇒ 有**真实调用点**；② 标 `deterministic` ⇒ 不 import `vec.js`、不调 LLM；
  ③ **模糊判断类判据不得只有阈值/规则实现**。
- **复验**：`node scripts/check-judge-kind.mjs`（**新增**，登记 `CHECKS`）
- **反例自证（三向都要先红）**：
  ① 标 `vector` 后删调用 ⇒ 红；② 标 `deterministic` 后加 `semanticSim` ⇒ 红；
  ③ 把"是否值得沉淀"写成固定阈值 ⇒ 红（**最重要**）。
- ⚠ **不得靠兜底通过**：机检须自证"无 junction/白名单兜底即红"。

### AC-T.1 阈值登记制
- **判据**：每个影响判定的数值阈值在 `criteria.json#thresholds` 有登记，登记项**必含**
  `{id, value, owner, 预注册判据, 最近校准样本数, 最近校准结论, 复检触发}`。
- **复验**：`node scripts/check-threshold-registry.mjs`（**新增**，登记 `CHECKS`）
- **反例自证**：① 新增一个未登记阈值 ⇒ 红；② 登记了但**缺"预注册判据"或"样本数"** ⇒ **红**
  （**这一条是关键**：只登记不校准 = 走过场）。
- **对标样板**：`mclFamiliarThreshold`（`criteria.generated.ts:204`）—— 预注册目标 27.5% · 936→2154 样本 ·
  二次重校准 · 结论"维持 0.55" · 回滚命令 · 复检触发 N≥300。**其余阈值照此补齐。**

### AC-T.2 8 个阈值逐个校准（J2）
- **判据**：`0.90`（`deepsleep-tree.ts:142`）· `0.95`（`:271`）· `0.66`/`0.8`（`distill-write.ts:248,263`）·
  `0.42`（`:343,401`）· `0.5–0.66`（`activity.ts:245`）· `0.6`+`hit≥2`（`mcl.ts:368`）——
  每个都有**预注册判据 + 真实样本分布 + 结论（维持/调整）+ 回滚方式**。
- **复验**：`node scripts/mcl-calibrate.mjs`（复用既有件，**不另建新器**——仓规则 5）逐项扩展；结论登记进 `OPEN-ITEMS`
- **反例自证**：**先红** —— 校准前每项必须显示"**样本 0 / 无预注册**"；补齐后转绿。
  若某阈值样本不足 ⇒ 结论必须写 **`insufficient-data`（不猜方向）**，照 `recall-diagnosis.ts:81` 既有口径。
- **⚠ 不得**以"看起来合理"作为维持理由（那是自述，不是判据）。

---

## 3. J3–J5 · 三个升级节点

### AC-U1.1 归因升级后与细校准**对账**
- **判据**：LLM 归因给出的方向，与 `mcl-calibrate` 的细校准结论**一致**；不一致时必须给出可解释的分歧理由。
- **复验**：`node scripts/test-recall-advice.mjs`（**已有件**，`test-recall-advice` 的判据是"D2 判据由数据推导，含反例自证"）
  + 新增对账项：`node scripts/mcl-calibrate.mjs`
- **反例自证**：**先红已具备** —— 现状实测**方向相反**（`recall-diagnose` 给 `lower-threshold`，
  细校准结论"维持 0.55"，降 0.54 过冲 11.6pp，【注册表】`criteria.generated.ts:185`）。
  ⇒ 改造后该对账必须**转绿**；若仍相反 ⇒ 升级无效。
- **不变量**：确定性计数层（零成本筛样本）**保留**，只把**归因与方向**交模型（分层第一层不变）。

### AC-U2.1 假冷率**下降**（活性升级）
- **判据**：被判 `cold` 但**有真实读命中**的条目比例 **低于**改造前基线。
- **基线**：**假冷 26 条 / 49 条冷条目**（`skill/scripts/harvest-access.mjs:6` 登记的历史实测）——
  改造前须用**当前真实数据**重测基线（历史数字会自变，引 `[原则] 档案事实须复验`）。
- **复验**：`node scripts/memory-reconcile.mjs` + `node scripts/activity-*`（`audit/activity.jsonl` × `access-real.jsonl` 对账）
- **反例自证**：注入一条"90 天未用但是安全红线"的节 ⇒ 必须**不被判冷**（**先红**：现状会判冷）。
  再注入一条"90 天未用的废话节" ⇒ **仍应判冷**（证明不是简单放宽，而是真的在判重要性）。

### AC-U2.2 关键性判断必须**留理由**
- **判据**：凡由 LLM 判定的"关键性"，审计里带 `reason`；缺理由 ⇒ 判 FAIL。
- **依据**：仓内已有口径 —— forgetOps 的 `keep` 必须带 `reason`（≤60 字，`criteria.generated.ts` / `DEEP_SLEEP_PROMPT`）。
- **反例自证**：构造一条无 `reason` 的判定 ⇒ 必须被拒。

### AC-U3.1 收益判定可复算
- **判据**：LLM 判定的"该轮检索是否帮上"必须有**可复算的证据链**（读到的行 → 后续动作 → 结论）；
  与确定性计数并列展示，**分歧可见**（不得只留模型结论）。
- **复验**：`node scripts/test-recall-yield.mjs`（**已有件**，判据 `SWITCH_THRESHOLD`）+ 新增对账项
- **反例自证**：**先红** —— 现状 `zeroGain>=2` 无证据链；补齐后须能逐轮复算。

---

## 4. 质量度量（"增强运行质量"必须有判据）

### AC-M.1 五项指标有基线、进登记表
- **判据**：方案册 §6 的五项（归因一致率 / 无校准阈值占比 / 假冷率 / 模型节点有效率 / 回退如实率）
  **各有改造前基线**，并登记进 `docs/OPEN-ITEMS.md`（本仓唯一待办/判据登记入口）。
- **复验**：`node scripts/verify-open-items.mjs`（**已有件**，扩项）
- **反例自证**：登记项必须写清**判据与证据来源**——`OPEN-ITEMS §5` 已因"按扫描片段登记、未逐行核对"
  导致 **16 项里 10 项早已做完**却长期挂表（`docs/OPEN-ITEMS.md:106-114`）。⇒ 本项登记不足即视为噪音。

### AC-M.2 回退**如实率 == 100%**
- **判据**：`EmbedCfg.enabled=false` / HTTP 失败时，产出里**绝不出现**无"未判"留痕的语义结论。
- **复验**：`node scripts/test-embed-degrade.mjs`（**新增**，登记 `CHECKS`）
- **反例自证**：断向量后若出现"看起来由向量生成"的候选 ⇒ FAIL。
- **依据（既有口径，非本册发明）**：`src/vec.ts:173`（"失败/不可用 ⇒ `null`，调用方**如实记'未判'**"）·
  `src/deepsleep-run.ts:98`（"**绝不退回结构规则假装生成联想**"）。

### AC-M.3 模型节点**不许假旋钮**
- **判据**：标 `vector|llm` 的节点必须产生**可观测的非空产出**（真机互核，不是声明）。
- **复验**：`node scripts/check-injection-reach.mjs`（**已有件**，正面断言"输出是否真的进注入文本"）扩项
  + `node scripts/check-content-types.mjs`（`reachable:true ⇒ 消费侧必须有通路实现`）
- **反例自证**：**先红** —— 仓内已有实证失效模式：`alphaVal` 打分项因"索引行没有 valence 信号"
  被判定为**恒 0 的假旋钮**而放弃（`criteria.json:489`）。⇒ 本项必须在接入前先证明"它能非空"。

---

## 5. 反模式清单（本册判 **FAIL**）

| # | 反模式 | 为什么 | 拦它的是 |
|---|---|---|---|
| **F1** | 把确定性判据改成模型判据 | 水位/格式/红线/账目必须可机检、可逐字节回归（§1.1） | AC-V.1 ② |
| **F2** | 模糊判断只写阈值/规则 | **本册核心缺口**，已实证出错两处 | AC-V.1 ③ |
| **F3** | 登记了阈值但不校准 | 只登记不校准 = 走过场 | AC-T.1 / T.2 |
| **F4** | 阈值"看起来合理"就维持 | 自述不是判据 | AC-T.2 |
| **F5** | 样本不足仍给方向 | 应写 `insufficient-data` 不猜方向 | AC-T.2 / U1.1 |
| **F6** | 模型判断无理由留痕 | 不幂等 ⇒ 无法回放、无法回归 | AC-U2.2 / U3.1 |
| **F7** | 回退时静默假装有结论 | 破坏"如实记未判"的既有口径 | AC-M.2 |
| **F8** | 机检靠兜底通过 | 引 `[lesson] 审计脚本模型核对`（拓扑模型偏乐观 / junction 层兜底假 PASS） | 全册（每条须自证去兜底即红） |
| **F9** | 用正则扫描结果直接当阈值全集 | 引 `[原则] 模式派生集合先核对`：命中集执行前须显式列举 | AC-D.2 |
| **F10** | 为"用模型"而用模型（无实证动机） | 每个升级项必须有实证动机 | 方案册 §9 |
| **F11** | 新增测试不登记 `CHECKS` | 仓规则 6：未登记 = 等于没写 | §6 |

---

## 6. 需新登记进 `scripts/check-runner.mjs#CHECKS` 的件

| 件 | 验收项 | 类型 |
|---|---|---|
| `check-judge-kind.mjs` | AC-V.1（三向） | 机检 |
| `check-threshold-registry.mjs` | AC-T.1 | 机检 |
| `threshold-scan.mjs`（报告态，**不入 CHECKS**） | AC-D.2 | 扫描/列举 |
| `test-embed-degrade.mjs` | AC-M.2 | 单测 |
| `check-injection-reach.mjs` **扩项** | AC-M.3 | 机检（已有件扩条） |
| `verify-open-items.mjs` **扩项** | AC-M.1 | 机检（已有件扩条） |
| `test-recall-advice.mjs` / `test-recall-yield.mjs` **扩项** | AC-U1.1 / U3.1 | 单测（已有件扩条） |

---

## 7. 与睡眠板块册的关系（防两份真相）

- **本册是横切册**：`judgeKind` / 阈值登记 / 机制分层规则**只在本文定义一次**。
- **睡眠册（`docs/sleep-granularity-plan-2026-09-15.md` §4.5）引用本册**，不重复定义；
  两者若有冲突，**以本册为准**（本册范围更广）。
- 睡眠册原列的 `AC-V.1–V.4` **已全部归并**：`AC-V.1`（`judgeKind` 三向）→ **本册**（唯一实现）；
  `AC-V.2`（分片按语义边界）→ 睡眠册 `AC-R0.3`；`AC-V.3`（回退如实）→ **本册 `AC-M.2`**；`AC-V.4`（链路验真）→ **本册**。
  ⇒ **无重复定义**（防两份判据漂移，引仓内"单一实现"纪律：如 `suite 装配矩阵`只有一处实现）。
- **AC ID 命名空间**：本册用 `AC-D/V/T/U/M`；睡眠册用 `AC-P0/R0/J/R1/G/S`；**跨册引用必须带册名**（见总纲 §6.6）。
