# S2S3 册零 · 施工与验收记录（落盘一致性与单写者）

> **性质**：施工记录（与 `S2S3-three-layer-plan.md` §3.0 册零、`S2S3-three-layer-acceptance.md` G0/G0b 成对）。
> **授权**：用户 2026-09-19 指令「**启用目标模式全部落地，不要让我决策自己检索信息，先后顺序自己思考**」（R1 具名授权：点名"全部落地"）。
> **范围**：册零＝**前置项**（材料链的地基）。**册零未完成前册一不得开工**——本记录同时登记"册零当前完成度"。

---

## 1. 交付物（截至 2026-09-19 · 两批）

| 产物 | 说明 |
|---|---|
| `src/bank-lock.ts` + `skill/scripts/bank-lock.mjs` ≡ `scripts/bank-lock.mjs` | **库级单写者锁**：`<bank>/.write-lock`（`mkdir` 原子取锁）；**进程内重入表 + 跨进程 env 令牌**双重重入；陈旧锁**改名留证**接管（`.write-lock.stale-<ts>`）；**拿不到即拒写**（fail-closed），拒写落 `<bank>/.write-lock.log`（**纯文本行**，刻意不写成 JSON 信封） |
| `src/section-rewrite.ts` | **唯一写入原语**：`atomicWriteFile`（**唯一 tmp 名** `p.tmp-<pid>-<seq>-<rand>` + 原子 rename + **写后回读字节校验**）· `editFileUnderLock`（库锁内"读→变换→写"）· `appendFileUnderLock` · `gatedWriteFile`（tmp→门禁→rename，deepsleep 与面板共用） |
| 收编 | `treeops.atomicWrite`（升格委托，净减 8 行）· `sectionops.applyConvergeOps`（原**直写**无 tmp 无锁）· `deepsleep-apply.applyPointerOps`（原固定 tmp + 锁外跑 20s 门禁）· `panel-inject.writeMemViaGate`（原固定 `.ui-tmp`）· `distill-write.writeProfileLine`/索引元数据表 · `activity.saveRows` · `record-shadow.saveStore` · `deepsleep-tree` 局部原子写 |
| `memory-append.mjs`（双份孪生） | **自取库锁**（父进程持锁时经 env 重入）；新增 **exit 6 = 库锁被占用（拒写）** |
| `distill-write` 孤儿预防 | 索引行写前过 `admitIndexRow`——**指针目标节不存在即拒写该行**（"同写/同不写"） |
| `distill-write` 失败明细 | `distill-run` 审计行新增 `failedItems`（`k/target/section/tag/reason`，上限 20）——L2 复盘需知"**哪些**知识没落地"（原实现只有计数） |
| `distill-infra.manifest()` | **分段清单持久化**：每段一行落 `<kRoot>/audit/distill-manifest/<sid>.jsonl`（原先只在同轮内存、轮结束即消失）；写失败经 `onWriteFail` 留痕且**不抛** |

## 2. 判据与证据（四要素 + 先红）

| 判据 | 检查方式 | 阈值 | 失败退回 | 实测 |
|---|---|---|---|---|
| **并发不丢更新** | `node scripts/test-bank-lock.mjs`（临时库 · 真路径子进程） | **0 丢更新** | 该册不得合入（丢更新=数据丢失，静默型） | **B1 先红**：无锁读改写形状 8 轮并发 ⇒ **丢更新 8/16 条**（夹具命中病灶）；**B2**：真路径 `memory-append` + 库锁 16 轮 × 2 写者 ⇒ **0 丢更新** |
| **锁语义** | 同上 Part A | 6 项全绿 | 同上 | 取锁/盘上 owner 一致 · 进程内重入不重复建锁 · 重入句柄不负责释放 · 外层释放即消失 · 旧句柄不误删新持有者 · 陈旧接管留证 · 拿不到锁 fail-closed · 拒写入日志（**A1–A7 全绿**） |
| **跨面无漂移** | `node scripts/check-bank-lock-parity.mjs` | 孪生逐字节 + 行为差分全等 | 漂移即红 | 孪生 sha256 一致 · **10 项行为语义两侧全等**（取锁/重入/拒写/接管/释放/env 令牌）· 反例自证 3 项成立 |
| **分段清单持久化** | `node scripts/test-distill-manifest.mjs` | 3 段 ⇒ 3 行且逐行一致 | 写失败必须留痕且不抛 | **6 PASS**；**先红**：改造前无 `manifest` 导出 ⇒ 首跑即 FAIL |
| **写入原语收敛（棘轮）** | `node scripts/check-write-primitive.mjs` | **只许减**；已收编件必须 0 | 新增固定 tmp ⇒ 改走原语 | 基线 **10 → 4**（本批收编 6 处：activity/record-shadow/deepsleep-tree×2/distill-write×2）；已收编 **8 件全为 0** |
| **无孤儿指针** | `node scripts/check-section-refs.mjs`（真库棘轮） | 0/0/0/0 | 红 | 保持 0（S1R 基线未被本册破坏） |
| **仓内一致性** | `check-arch-sync` / `check-srcmap` / `check-observability` / `audit-fnspan` / `audit-wiring` / `check-module-growth` | 全 PASS | 红即停 | 全 PASS（模块 83 → **85** / CHECKS **149** 件 / 键控流 +1 已登记） |

## 3. 落地差异与残留（**不谎报**）

1. ~~册零尚未 100% 完成：写入原语残留 4 处固定 tmp~~ → **已收口（2026-09-19 · `56a6365`）**：最后 4 处清完，**src 内固定 tmp 名写法 = 0 处**，棘轮基线钉到 **0**（已收编 **10 件**必须为 0）。
   收口要点：`deepsleep-apply.gateText` 的试算 tmp 不能走 `gatedWriteFile`（那个会**立即改名**，而试算要"多次试门禁、最后才提交"）⇒ 改**唯一名** `principlesTmp` + 显式清理；`treeops.rewriteOneIndex` 的 tmp+gate+rename 三条路径收敛为 `gatedWriteFile`（保持 `gate='fail'` 不写 / `'absent'` 自查后写 的原语义）。
2. **`write.ingest` 条目载荷**：会审裁定的表述是"`write.ingest` +1 载荷字段"；实测失败发生在 `distill-write` 的三个写入循环里，而 `write.ingest`（`distill-agent.ts`）只有"本轮摄取裁决"，**拿不到条目身份**。故载荷落在 **`distill-run` 审计行的 `failedItems`**（失败发生地），并在 `write.ingest` 侧维持原语义。**这是对裁定表述的修正，不是省略**。
3. **`delta.md` 文件退役**：按会审裁定**缓**（属用户取向项；见方案册 §5.2 U2），本册未动。
4. **`inject-baseline-diff` 全量门禁唯一红**：**改动前即红**（基线首块 = 「守藏·热记忆 记忆库指针」，当前注入首块 = 「🧠 最近成长」；活体库漂移）。其输入不含 `docs/`、与本册无关；**抬基线属 R3 越棘轮动作，未动**。

## 4. 五层同步（本册两批）

| 层 | 证据 |
|---|---|
| ① 仓内绿 | 子集门禁 **14/14 pass**；全量唯一红＝上述 `inject-baseline-diff`（改前即红） |
| ② 部署同步 | `deploy-installed` 21 件 → 安装副本 **260/260 sha1 一致**；部署面 **0 不一致**；面 2 必需件 **11 件**（含新件 `bank-lock.mjs`） |
| ③ 热重载 | `dev_reload_package` OK（清 85 模块 · fiber `active`） |
| ④ 特性探针 | `check-installed-features` **49 项标记**（含本册新增 2 项：`bank-lock` / `section-rewrite`） |
| ⑤ 推送 + pin | `ce7cb7b` → `b6343b6` 已推 origin；profile pin = **`b6343b6`** |

## 5. 事故登记（自作自受，两条同根因）

| 事故 | 现象 | 处置 |
|---|---|---|
| **AGENTS.md 被打坏** | 用 pwsh `Get-Content/Set-Content` 重写无 BOM 文件 ⇒ 中文变乱码（仓库早已有此教训：**文本改动用编辑工具**） | 从 `~/.dsh/backup/shoucang-pre-remediation-20260917/AGENTS.md` 恢复干净版，再用编辑工具补增量（模块 85 / CHECKS 149 / 标记 49 / **R1–R5 治理规则整节**）。残留：规则 6 的"子集运行"段落与部分模块枚举明细比原版简略（该件 gitignore、未入库） |
| **profile 依赖串被打坏** | pwsh 内联 `-replace` 里 `$1` 被 PowerShell 当变量吞掉 ⇒ 值一度变成 `github:Fishsb/`（丢仓名与 pin） | 改走**脚本文件**修回 `github:Fishsb/dsh-shoucang-memory#<sha>` 并 `JSON.parse` 复核；此后 pin 更新一律用 `sc-set-pin.mjs` 脚本 |
| **提交静默未发生** | 提交信息里的 `"` 被 PowerShell 当作字符串结束符 ⇒ `git commit` 报 pathspec 错误、**只 staged 未提交**（输出被大量 CRLF 警告淹没，极易漏看） | 改走 `git commit -F <消息文件>`；**核对 `git log --oneline -1`** 才算完成 |

---

_建立 2026-09-19 · 册零两批（`6121d23` / `ce7cb7b` / `b6343b6`）· 下一批：残留 4 处收编 + 册一开工（册一的前置条件"写入通道"已随本册就位）。_
