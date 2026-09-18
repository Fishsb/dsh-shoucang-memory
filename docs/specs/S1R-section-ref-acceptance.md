# S1R · 小节寻址收口验收方案

> **性质**：**验收册**（与 `docs/specs/S1R-section-ref-plan.md` 成对）。**先定"完成"再动手**。
> **用法**：每册施工完成 → 按本册对应 G 判据逐条取读数；**任何一条红即未完成**；未通过的册**回退该册**，不影响已交付册（每册留全局回退开关，见方案册 §6）。
> **依据**：`docs/specs/S1-library-recheck-2026-09-19.md`（现状读数与复现命令）。

---

## 0. 验收总则

**反假绿纪律（7 条，本册全适用）**

1. **每条「等价/不变」类断言，首跑必须红**——否则该断言无效（先红后绿）。
2. **计数类断言必须给出分布与口径**，不得只报一个数。
3. **夹具绿 ≠ 真数据绿**：凡判据类特性，除夹具外**必须在真库跑一次**并留读数。
4. **不得用「文件存在 / 命令退出 0」当「本次动作成功」**：产出型步骤先删目标 → 执行 → 按本次产物判。
5. **门禁过滤只显式点名**：禁止"按 git diff 自动选件"；合入前必须跑**不带任何开关的全量**。
6. **每处读数给出可复现命令**（本册 §3 逐条给）。
7. **自己的测量工具先做阳性/阴性对照**（本次检查中我三次被自己的仪器误导，见检查报告 §7）。

**六条口径（仓规 7）**：① `npm run typecheck` 零错 ② `npm run build`（host + client）成功 ③ `node scripts/check-runner.mjs` 全绿 ④ `ui-geo-regress` 渲染级证据 ⑤ 契约与产物（`check-panel-contract` + `gen-panel-contract --check`）⑥ 部署后 `check-installed-features`。

---

## 1. G 终态判据 ↔ 分册映射

| G | 判据（一句话） | 归属 | 机检件 | 现状 |
|---|---|---|---|---|
| **G1** | 两处实现（TS / mjs）在同夹具上**逐例同结论**（含三态与候选集） | P0 | `check-section-ref-parity`（新增） | ❌ 已知 3 例分歧 |
| **G2** | 写门**正确性判据不受容量分支影响**（超容量 + 悬空 ⇒ 必须报正确性问题） | P0 | 夹具 + `test-*`（新增用例） | ❌ 现 exit 0 且不提指针 |
| **G3** | 三条写入路径对同一条悬空索引行**一致拒收** | P1 | 夹具（隔离库）+ 真机三条路径 | ❌ 三条全放行 |
| **G4** | 库存巡检**在册**且能翻红；悬空数 ≤ 棘轮基线 | P0 | `check-section-refs`（新增，入 `CHECKS`） | ❌ 无此件 |
| **G5** | notes 内**同名小节重复 = 0**（归一口径） | P2 | 并入 `check-section-refs` 或独立小件 | ❌ env.md 2 处（对账器另报 1 处） |
| **G6** | 存量 52 组**逐条处置留痕**，复跑三口径 ⇒ 悬空归零或全进显式豁免表 | P2 | 三口径命令 + 处置记录文件 | ❌ 90 段 / 52 组 |
| **G7** | 材料侧剔除**不再静默**（有计数）；歧义候选**保留可见** | P0 | 深睡审计字段 + 真机一轮 | ❌ 静默 `continue` |
| **G8** | 七层全局门全绿（零回归） | 全册 | 见 §3 | — |

---

## 2. 逐卡判据（现状读数 / 目标读数 / **先红方式**）

### G1 · 语义单源（差分锁）

| 项 | 内容 |
|---|---|
| **判据** | 同一夹具集（**≥40 例**：精确/loose/同名歧义/去日期后缀/父子路径/`§A/§B` 并列/大小写/空名/文件不存在/未注册文件）驱动两处实现，`state` 与候选集**逐例一致**；任一例不一致 ⇒ **FAIL** |
| **现状读数** | 已知分歧：`env.md §插件注入` → TS `false`（多命中⇒null）而 gate `true`（集合去重）；`tools.md §角色预设` → TS `false`（两候选）而 gate 通过；`lessons.md §服务与重启约束` → 同上 |
| **目标读数** | 分歧 **0 / ≥40 例**；三态计数与候选集逐例相同 |
| **先红方式** | ① 该件落地时**必跑一次** ⇒ 必须红（此刻两实现必然不一致）② **反例自证**：注入一处故意的实现差异 ⇒ 必须红（否则锁无效） |
| **机检命令** | `node scripts/check-section-ref-parity.mjs` |
| **登记** | 入 `check-runner.mjs#CHECKS`（未登记 = 没写） |

### G2 · 正确性与容量正交

| 项 | 内容 |
|---|---|
| **判据** | 夹具 = 「MEMORY.md 候选内容**超容量**（>150%）**且**含 1 条悬空指针」⇒ 门**必须**报出指针问题且 **exit ≠ 0**（正确性优先）；同时容量**仍不阻断**（仅超容量、无正确性问题 ⇒ exit 0 + 告警，保留用户 2026-09-16 口径） |
| **现状读数** | `SHOUCANG_CAP_MEMORY=5000` ⇒ **exit 0**，输出无指针信息；`=999999` ⇒ exit 2 列出 56 条 |
| **目标读数** | 超容量 + 悬空 ⇒ **exit 2**（且输出含指针条目）；仅超容量 ⇒ exit 0 + 告警 |
| **先红方式** | 改造前跑该夹具 ⇒ **当前实测就是红**（exit 0 不含指针条目）——**先把这条红跑出来并留档**，再动手 |
| **机检命令** | `MEMORY_ROOT=<夹具库> SHOUCANG_CAP_MEMORY=5000 node <夹具库>/scripts/memory_write_gate.mjs MEMORY.md <夹具候选>` |
| **回退** | `SHOUCANG_GATE_LEGACY=1` ⇒ 旧序（容量分支早退） |

### G3 · 三条写入路径一致收口

| 项 | 内容 |
|---|---|
| **判据** | 同一条含悬空指针的索引行，经 ① `memory-append.mjs <target> - --new` ② 深睡 `pointerOps`（`POST /deepsleep/trigger`）③ 面板 `edit`（走 `gateWrite`）**三条路径一致拒收**（exit ≠ 0 / 端点返回拒因） |
| **现状读数** | ① **exit 0 落盘**（隔离库实证）②③ 走写门：容量 >100% 时**同样放行**（MEMORY.md 520% ⇒ exit 0）⇒ **三条全放行** |
| **目标读数** | 三条均拒；审计/日志各留一条拒因（可核） |
| **先红方式** | 改造前三条各跑一次 ⇒ 三条均"放行"（与目标相反）⇒ 断言有效 |
| **机检命令** | 隔离库（**勿对真库**）：`MEMORY_ROOT=<tmp> node scripts/memory-append.mjs MEMORY.md - --new "[env] 探针 → notes/lessons.md §不存在的小节"`；真机路径见 §3 |
| **回退** | `SHOUCANG_APPEND_SECTION_CHECK=0` |

### G4 · 可见面在册（棘轮）

| 项 | 内容 |
|---|---|
| **判据** | ① `check-section-refs` 出现在 `node scripts/check-runner.mjs --list`；② 对**夹具**（1 条悬空）必须翻红；③ 对**真库**输出三态计数且 `missing ≤ 90` 且 `ambiguous ≤ 33`（棘轮：只许降） |
| **现状读数** | 无该件；最近似件 `memory-reconcile.mjs` **不在 CHECKS** 且 **恒 exit 0**（实测有 ❌ 仍 0） |
| **目标读数** | 在册 + 夹具红 + 真库计数下降（P2 后 `0/0` 或全进豁免表） |
| **先红方式** | 件落地但未接真库时 ⇒ 对夹具红；接入后若基线设错（把 90 写成 0）⇒ 立刻红 ⇒ 证明棘轮生效 |
| **机检命令** | `node scripts/check-runner.mjs --only check-section-refs`（子集只做本卡验证；**合入跑全量**） |

### G5 · 同名小节消除

| 项 | 内容 |
|---|---|
| **判据** | 每个 `notes/*.md` 内，(文件, 归一标题) 重复数 **= 0** |
| **现状读数** | `env.md`：**插件注入**（`##`+`###`）· **Windows npm 执行策略**（`##`+`###` 含日期后缀）⇒ 2 处；对账器另报 `lessons.md`「假绿与实证」1 处（其口径未去日期后缀，须一并复核） |
| **目标读数** | 0；且由机检守（新增同名 ⇒ 红） |
| **先红方式** | 现状跑 ⇒ 报 2 ⇒ 红 |
| **风险** | **改结构**（合并小节）会移动正文 ⇒ 必须先备份 + 归档可回滚 + 合并后逐行守恒核验（只允许标题行变化，正文行集合不变） |

### G6 · 存量归零

| 项 | 内容 |
|---|---|
| **判据** | 52 组逐条有处置记录（重锚 / 建节 / 改文件级指针 / 废弃索引行 / 显式豁免+理由）；复跑三口径 ⇒ `missing = 0` 且 `ambiguous = 0`（豁免项单列且**逐条有理由**） |
| **现状读数** | 悬空 90 段 / 去重 52 组；分档 **A 8 / B 14 / C 30**（Dice 0.66 / 0.40 双阈；跨文件候选 20 组） |
| **目标读数** | 0/0（或豁免 ≤ N，N 逐条列明） |
| **先红方式** | 处置前后**同一命令成对留档**（改前 90 → 改后 0），不得只留后值 |
| **机检命令** | `node scripts/check-section-refs.mjs`（真库）· `node scripts/memory-reconcile.mjs`（对账器同源读数）· 逐条 `<lib>/scripts/read_section.mjs <file> "<§名>"` ⇒ 期望 **exit 0** |

### G7 · 材料侧不再静默

| 项 | 内容 |
|---|---|
| **判据** | 深睡一轮后审计行含**剔除计数**（如 `sectionRefDropped: {missing:n, ambiguous:m}`）；`ambiguous` 候选**出现在材料里**（可见）且带标注 |
| **现状读数** | `deepsleep-materials.ts:131` 静默 `continue`；实测冷候选 37 → 剔除 10（27%）**零痕迹** |
| **目标读数** | 审计带计数；歧义候选可见 |
| **先红方式** | 现状跑一轮真机深睡 ⇒ 审计无该字段 ⇒ 断言失败（红） |

### G8 · 七层全局门（零回归）

见 §3 全局门；另加一条**本册特有**：**注入面逐字节不变**（`inject-baseline-diff` 必须通过）——本方案不改注入文本。

---

## 3. 全局门与复现命令

| # | 层 | 命令 | 通过标准 |
|---|---|---|---|
| ① | 仓内绿 | `npm run typecheck && npm run build && node scripts/check-runner.mjs` | 零错；全量（**不带 `--only`/`--fast`**）`0 fail`；件数 = 143 + 本次新增 |
| ② | 注入面不回归 | `node scripts/inject-baseline-diff.mjs` | 逐字节等价（宿主不可达时按该件既定 skip 语义并**显式记录**） |
| ③ | 库往返一致 | `node scripts/check-record-parity.mjs` | 全部「逐字节一致」 |
| ④ | 板块门禁 | `node scripts/check-runner.mjs --only check-content-types,check-ring-coverage,check-cue-space,check-memory-write-path,check-shared-fn` | 全 pass |
| ⑤ | 真机写入路径 | 深睡一轮：`POST /api/shoucang-panel/deepsleep/trigger` → 核 `audit/*` 行 | 有 `sectionRef*` 计数；无意外水位回滚 |
| ⑥ | 部署与运行态 | `node scripts/deploy-installed.mjs` → `node scripts/check-installed-sync.mjs --strict` → 热重载 → `node scripts/check-installed-features.mjs` | 逐件 sha 一致 · 特性探针 exit 0 |
| ⑦ | 云端与 pin | `git push` → `git status -sb`（无 ahead）→ 核 profile pin | 三层一致 |

**渲染级证据（若本册全程不改 UI）**：仍须跑一次 `node scripts/ui-geo-regress.mjs` 证明**零回归**；若新增任何 UI 呈现（Q4 拍板后），则必须带 `--shots <目录>` 出图（12/12 且 mtime 全为本次）。

---

## 4. 登记纪律（本册特有）

1. 新增 2 件机检**必须**登记 `scripts/check-runner.mjs#CHECKS`（未登记 = 没写）。
2. **棘轮基线登记在册**：`missing ≤ 90` · `ambiguous ≤ 33`（当前实测）；P2 完成后**在同一处**下调基线并注明日期。
3. `check-shared-fn.mjs` 的 `SHARED` 表新增 `resolveSection`（home = `section-ref.ts`）；若其扫描面不覆盖 `skill/scripts/*.mjs`，须在件头**显式写明**"跨面同源由差分锁 `check-section-ref-parity` 守"，避免"看起来锁了其实没锁"。
4. 任何**回退开关**（`SHOUCANG_GATE_LEGACY` / `SHOUCANG_APPEND_SECTION_CHECK`）缺省值 = **现状行为**；开关本身要有用例证明"关掉即回旧行为"（否则是假旋钮）。

---

## 5. 交付物清单（预期）

| 产物 | 归属 | 说明 |
|---|---|---|
| `src/section-ref.ts` | P0 | 三态寻址语义（TS 侧，import 既有 `parseSections/coreName`，不复制实现） |
| `skill/scripts/section-ref.mjs` | P0 | 同语义（mjs 侧，零依赖，可 CLI） |
| `skill/scripts/{read_section,memory-append,memory_write_gate}.mjs` · `scripts/memory-reconcile.mjs` | P0/P1 | 四处改为委托（删各自的口径副本） |
| `scripts/check-section-ref-parity.mjs` | P0 | 差分锁（含反例自证） |
| `scripts/check-section-refs.mjs` | P0 | 库存三态巡检 + 棘轮 + 同名检测 |
| `src/forgetops.ts#sectionExists` | P0 | 改薄壳委托（签名不变，`test-forgetops.mjs ⑪` 继续绿） |
| 存量处置记录 | P2 | 52 组逐条（组名 / 分档 / 处置 / 理由 / 证据） |
| 验收记录 | — | 本册逐卡读数 + 先红证据 + 落地差异（如有，**不谎报**） |

---

_建立 2026-09-19 · S1R 验收册 v1 · 与方案册成对；两册冲突时**以本册判据为准**（判据先于方案）。_
