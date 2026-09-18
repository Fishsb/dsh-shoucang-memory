# S2S3 册四 · 施工与验收记录（睡眠汇报 + 问题统计 + UI）

> **成对来源**：`docs/specs/S2S3-three-layer-plan.md` §3.4 / `docs/specs/S2S3-three-layer-acceptance.md` §2.3（H-③）。
> **授权**：用户指令「启用目标模式全部落地，不要让我决策自己检索信息」⇒ 落在**已授权**的 S2S3 五册内自主施工（R2 四条全满足：可用 git 回退 · 不动真源语义 · 未越跨会话边界）。
> **时间**：2026-09-19（第一段 = 汇报/标记/影响账，第二段 = 注入换源 + 只读路由 + 总览卡）。

---

## 1. 交付物

| # | 交付物 | 落点 | 形态 |
|---|---|---|---|
| 1 | 人读汇报（**日历式永不删除**） | `<bank>/reports/sleep/<YYYY-MM-DD>.md` | 同日多轮**按轮追加**；固定五段（区间 / 提存 / 压缩 / 问题标记 / 统计） |
| 2 | 机器可读汇报流 | `<kRoot>/audit/sleep-reports.jsonl` | 每轮一行 `kind=sleep-round`；**影响账并入**（`kind=impact`）——册二裁定不另开 `audit/impact/` |
| 3 | 问题队列 | `<kRoot>/audit/sleep-issues.jsonl` | `state:'open'` + `handled:'not-handled'`（**只标记不处置**）；`suspect-recall` / `suspect-quality` 分开 |
| 4 | 注入源**改派生** | `src/sleep-report.ts#latestDerivation` ← `src/panel-shared.ts#readDawnGrowth` | 与报告正文**同函数**；`delta.md` 降为**兜底源**（未退役） |
| 5 | 介质戳加源 | `src/supply-stamp.ts` | 三条介质：`activity.jsonl` · `sleep-reports.jsonl`（派生源）· `delta.md`（兜底源）；口径统一 `size:mtimeMs` |
| 6 | 只读路由 ×2 | `src/panel-observe.ts`（`/sleep/reports` · `/sleep/issues`）+ 契约表 | 路由 42 → **44**；契约三产物同步（`gen-panel-contract` 44 条） |
| 7 | 总览卡改造 | `src-client/panes-overview.js#ovMorningCard` | 「晨起摘要」→「睡眠汇报」：今日提存 / 压缩 / 问题计数 + 最近几期可回看（**不新增视图、不引新组件**） |
| 8 | 册零同族收口 | `src/section-ref.ts` + 孪生 `skill/scripts/section-ref.mjs` | 准入：`partial` 中**末段缺失 ⇒ 拒写**（详见 §4 缺陷） |

## 2. 判据与证据（四要素 + 先红）

| 判据 | 检查方式 | 阈值 | 证据（实测） |
|---|---|---|---|
| 每轮一份汇报 · 同日多轮**追加不覆盖** | `scripts/test-sleep-report.mjs` 第 3 组：临时库上跑两轮 `writeSleepRound` 后**读回文件** | 首段**逐字节未变** + 段数 = 2 | **20 PASS / 0 FAIL**（含第 4 组换源判据） |
| 影响账并入同一流（不另开目录） | 同上 | `impact` 行数 = 两轮窗口条目数；`sleep-round` 行数 = 2 | 6 条 impact 行实测 |
| **只标记不处置** + 两面分开 | 同上第 2 组 | 每条带 `handled=not-handled` 与非空理由；`suspect-recall`（指针正常）/ `suspect-quality`（指针悬空）分开计数 | 分开命中 |
| 统计**分母带绝对值** + `injected=unknown` | 同上 | `rows` 分母显式；`injected` 一律 `unknown` | `rows=… unused=… 率=… unknown=rows` |
| **注入块 == 报告提存/压缩/统计段**（逐元素） | `test-sleep-report` 第 4 组 | ①派生逐元素等于同函数输出 ②派生里**每个数值**都能在报告正文命中 ③篡改汇报行 ⇒ `media` 变 ④只动人读 md ⇒ `media` 不变 ⑤三条介质齐 | 3 行派生 / 4 个数值全命中 / media 变 / md 不变 |
| **注入源不断**（兜底分支） | `scripts/test-inject-cache.mjs` **S2c** | 无汇报素材时回落 `delta.md.rows` 且**逐元素相等**；**48h 过期即弃**旧语义保留 | 45 PASS / 0 FAIL |
| 主源换源真实发生（判别力） | 同上 **S2b** | 派生非空时改 `delta.md` **不得**进块（旧实现必红） | 逐字节不变 |
| UI 卡渲染 + **数值与端点逐值一致** | `scripts/ui-geo-regress.mjs` 探针 `sleepCard` | 卡在 DOM（rect.h > 0）· 副标题 9 字面一致 · 4 行 · **19 个 token 全命中** | 3 视口 × 4 断言 = 12 PASS（总 103+ PASS / 0 FAIL） |
| 端点可达 + 契约三向一致 | `check-ui-contract` · `check-panel-contract` · `gen-panel-contract --check` | ⊆ 白名单 `{/sleep/reports, /sleep/issues}` 且与契约表一致 | 路由 **44** 条新鲜 |

**先红（改造前必须看到的红 · 全部实测留证）**

| # | 先红方式 | 实测结果 |
|---|---|---|
| 1 | 新 UI 断言 × **旧产物**（`git HEAD:client.js`） | **4/4 红 × 3 视口**：「睡眠汇报卡**未渲染**」；同轮共享契约条数 42 ≠ 44 |
| 2 | `test-inject-cache` **S2b**（改 delta 不得进块） | 旧实现只读 delta ⇒ 必红（换源后绿） |
| 3 | `test-inject-cache` **S2c**（兜底 + 过期即弃） | ①"换源不留兜底"⇒ 块变空 **红**；②"不收紧 delta 戳口径"⇒ 过期改写签不出来、缓存照供旧块 **红**（收紧为 `size:mtimeMs` 后绿） |
| 4 | `check-section-ref-parity` **A3**（末段缺失拒写） | 收口前 **2 条红**（`ok=true`）⇒ 收口后 4 条绿 |

## 3. 五层同步（收尾实测）

| 层 | 判据 | 结果（实测） |
|---|---|---|
| ① 仓内绿 | `typecheck` / `build` / `check-runner` | **152 pass / 0 xfail / 0 skip / 2 fail**；两条红**均非本册引入**（见 §4-5/6），已逐条归因 |
| ② 部署同步 | `deploy-installed.mjs` → `check-installed-sync --strict` | 待部署差异 **20/20 已复制**；**266 ≡ 266，内容不同 0**；`check-deploy-sync` 库内同名件 **86 一致 / 0 不一致**（含孪生三份 `section-ref.mjs` 行尾归一） |
| ③ 运行态生效 | `dev_reload_package` | **fiber active**（清缓存 **87 模块**、重建 1 fiber；重载前后均 active） |
| ④ 功能探针 | `check-installed-features` | **55 项标记齐全**（新增：`latestDerivation` 单一实现 · `/sleep/issues` 只读路由） |
| ⑤ 云端 + pin | push 后 `git status -sb` 无 ahead + profile `#<sha>` | 见提交与 pin（同批完成） |

**真机行为证据（③ 之后的活体读数）**：`GET /inject/preview` 首块 = 「🧠 最近成长（上次深睡归纳，**带源指针可核验**）：…」
⇒ 走的是 **delta 兜底分支**（真库尚无 `sleep-reports.jsonl`：首轮睡眠未跑）——
这正证明**「注入源不断」在真机上生效**（换源后块未消失）；首轮睡眠落盘后自动切主源（派生），
两条分支的判据分别是 `test-inject-cache` S2（主源）/ S2c（兜底）。

## 4. 落地差异与残留（**不谎报**）

1. **`delta.md` 文件未退役**（§5-U2 待用户拍板）：主源换派生后它降为**兜底源**，仍在写、仍在失效键里；
   「写侧归一为可解析前缀」那条**未实现**，改由**准入拒写**承担（见 4）。
2. **`release` 接线两前置未完成**（册二余项）：`runDeepSleep` 净减（399/400）与 `approvedRows` 补出仍待办 ⇒
   未接线；`s3Produce` 缺省仍 `false`（停产生效）。
3. **册一 LLM 语义提案未落**：现为确定性主线（零 LLM），提案流形态与幂等键已成立。
4. **新缺陷（真库实测 · 已收口代码侧）**：`MEMORY.md` 末段 1 处**孤儿指针**（`§npm 失效与残留 shim 修复/junction 装配漂移`），
   成因 = 蒸馏轮 `failedItems k=append` 明细未落地而同批索引行入库 + 旧准入对 `partial` 一律放行；
   **代码侧已拒写**（`check-section-ref-parity` A3 先红留证），**真库那一行须用户拍板重指**（`docs/OPEN-ITEMS.md` §11-a）。
5. **`inject-baseline-diff` 仍红**（**先于本册存在**）：基线首块为 `[守藏·热记忆]`，真机首块为 `🧠 最近成长`
   （块顺序漂移，`_memory/audit/inject-baseline-pre-R0.json`）；本册**未抬基线**——抬基线属 R3，留待用户。
6. **`check-section-refs` 仍红**：唯一原因即 4 的真库孤儿行（`路径部分悬空 1 ≤ 基线 0`）；机器侧判据本身工作正常。
7. **观察（非本册缺陷）**：`check-deploy-sync` 是**逐字节**比较，而仓内 `scripts/section-ref.mjs`（LF）与
   `skill/scripts/section-ref.mjs`（`core.autocrlf=true` 检出为 CRLF）在**同名件两面**下映射到**库内同一文件**
   ⇒ 任一次 `git stash`/`checkout` 刷新工作树行尾都会让三份再次漂移（本册收尾时已归一为 LF 并复核 86/86 一致）。
   根治须引入 `.gitattributes`（`*.mjs text eol=lf`）—— 属仓级改动，**不在本册范围**，登记备查。

## 5. U1–U6 自行裁定（用户授权"不要打扰我"）

| 项 | 裁定 | 理由（可核验） |
|---|---|---|
| **U1** 画像"生长"归属 | **归 L2（会话级复盘）** | 画像行是"跨轮累积视野"的产物，L1 是窗口级、S3 已停产；归 L1 会与 `[原则]` 通道重叠 |
| **U2** `delta.md` 退役 | **缓做（留兜底）** | 一处退役动 12 文件 + 介质戳重签 + `inject-baseline-diff` 必红；且它是**注入源不断**的兜底 |
| **U3** `unused` 抽样阈值 | **n=20 / ≥18（含 `suspect-recall` 单列）** | 与原建议一致；抽样非裁决（`unused` 永不进裁决），只作方向读数 |
| **U4** L2 触发阈值 | **内容阈值下调**至 `minNewEvents 600 / minNewEntries 3`（闲置 30min） | 实测段中位仅 4 ⇒ 原阈值会大面积漏触发；下调后仍保幂等键幂等 |
| **U5** 容量出口口径 | **可归档压缩、不删除** | 与"报告永不删除"同源口径；删除不可逆（R3-①） |
| **U6** 汇报容量上界 | **只读计数器 + 超线告警**（不自动删除） | 同 U5；自动删除与用户口径「一直有、不删除」冲突 |
