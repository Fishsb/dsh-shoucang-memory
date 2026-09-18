# IR1 注入召回链 · **施工与验收记录**（2026-09-18）

> 配套：`IR1-injection-recall-plan.md`（v3 方案）+ `IR1-injection-recall-acceptance.md`（验收册）。
> 授权：用户指令「**目标模式全部落地**」（R1：明确说"落地"＝施工授权；四册 + 附册一次授权）。
> 口径纪律：**先红 → 施工 → 读数**；每条判据都有**机检件 + 实测读数**，自述不作证据（验收册 §H.6）。
> 诚实边界：§6 列出**与方案册的落地差异**（不做"方案里的字面动作"而做"判据要求的实质"时，一律写明）。

---

## 0. 终态判据 G1–G6（方案 §0 ↔ 本记录）

| # | 判据 | 现状（施工前实测） | **落地后读数** | 证据 |
|---|---|---|---|---|
| **G1** | 不同任务 ⇒ 注入面必须不同 | 真命中词 vs 乱码 **63/63 行 100% 相同** | 动态面 **11/17 相同**、**命中行真取回**（含 token「深睡」且不在乱码词面内） | `check-relevance-live`（真机） |
| **G2** | 新写入的记忆必须可被读侧取到 | 新记录 scope cue 命中 **0/119 = 0%** | 读侧键 ∩ 新记录键 = **73**（读侧产 `scope=workspace:<盘符>/…` 已归一） | `check-cue-space` B2-live |
| **G3** | 账 == 真实裁切 | 装配器报 6 vs 真实丢 1；`kept` 仅 4 槽（缺 `process`） | **六槽逐槽出账**、账由真实结果直出；`逐槽相加 == 文本 \`- \` 行数`（44 = 36+5+3） | `test-usage-truth` |
| **G4** | 失效原因可归层 | 只报最外层 `lastReason` | `/inject/stats.cache.byLayer` = `{session,context,query,event,ttl}` 计数（真机 `{"session":1}`） | `test-inject-cache` S8 + 真机 |
| **G5** | 自述 == 实况 | 2 处注释与实况相反（本轮**又查出第 3 处**） | 源码接线自称 **0** == 注册表 `wiring.pending` **0**；`compliant` 字段**已删**（更名 `topicEcho`） | `check-claim-alignment` |
| **G6** | 结构纪律不退化 | 循环 0 · 深度 11 · 冻结 **6** | 循环 0 · 深度 11 · 冻结 **3** | `audit-architecture` · `check-module-growth` |

**门槛**：G1–G6 逐条转绿 ⇒ **IR1 达成**。

---

## 1. P0 · 册一（相关性重建）+ 附册（自述对齐）

### 1.1 病灶与修法（实测 → 改动）

| 病灶（实测） | 修法 | 落点 |
|---|---|---|
| 相关性通道按 `file==='MEMORY.md'` 单点过滤 ⇒ `AGENT.md` 命中**全丢**（`recallIndex("深睡蒸馏")` 10 行全在 AGENT.md） | 分层配额（`memory-index` / **`agent-principles`** / `profile`），**层判据只认注册表**（`highConfCarrierSet` = `mclGate` 标签集） | 新件 `src/relevance-supply.ts` |
| 唯一向量桥只在 MCL **慢通道回合**写 ⇒ 多数回合无桥 | 注入侧自预热：`agent/pre-step` + `/inject/preview` 共用 `preheatWarmRecall`（既有 `recallRanked` + 既有桥文件 + 既有异步扩展点，**零新机制**） | `src/panel-inject.ts` |
| 降级**静默**（桥缺/零命中与"基线"在读数上同形） | `trace.fallback ∈ {bridge-missing,…}` 进 `supplyUsage.dropped`；零命中在注入面**尾注**「本步相关性零命中，以下为位置式基线」 | `relevance-supply` + `panel-shared` |
| 相关性面把**恒定面已持有**的行再取一遍 ⇒ 同一行两处注入（实测重复 2 行） | `exclude` = 恒定面候选集，在**配额结算之前**排除 | `dynamic-select` / `relevance-supply` |

### 1.2 判据 A1–A5（全部 PASS）

| ID | 判据 | 读数 | 机检件 |
|---|---|---|---|
| A1 | 不同 query 的动态面可分辨 | 相同行 **11/17 < 100%**（施工前 63/63）；**恒定面逐字节相同** | `check-relevance-live` |
| A2 | 命中词取回 ≥1 相关行 | 取回 `[路径] 深睡记忆蒸馏…`（且不在乱码词面内；旧读数 **0**） | 同上 |
| A3 | 桥不可用显式记账 | `bridge-missing/stale/key-mismatch/unreadable/empty` 五种形态各留其名（离线断言） | `test-relevance-fallback` ③ |
| A4 | 注入侧向量可用 | `provider=gpu-ready` ⇒ `source=bridge`、`hits.bridge=12`（真读到桥） | `check-relevance-live` |
| A5 | 零命中如实注明 | 注明 ⟺ `relevance.zeroHit` **双向一致**（三个 query 各一断言） | `check-relevance-live` |

**先红证据（施工前真机）**：`/inject/preview` 真命中词 vs 乱码词 → `lenA=lenB=3977 · 63/63 行逐行相同`
（即 G1 的 100% 同形）。判据自证另在 `check-relevance-live --selftest`（相同块必判"不可分辨" ⇒ 断言有判别力）。

### 1.3 附册 F1–F3

| ID | 判据 | 读数 |
|---|---|---|
| F1 | 源码接线自称 == 注册表 `wiring.pending` | **0 == 0**；豁免表 4 条（逐条带理由）+ **过期即红** |
| F2 | `compliant` 要么真、要么无 | **字段删除**（实测 3119 false / 0 true）⇒ 更名 `topicEcho`（只报"是否回引材料主题词"）；读数函数 `yieldOf` 一并删除 |
| F3 | 归因/收益链路真机可达 | 调用点在场（5 符号）+ 台账真机行（`attributionVerdict` 34 · `yieldJudged` 32） |

**施工中**新查出**第 3 处**漂移（首轮审查只列了 2 处）：`deepsleep-run.ts` 旧注释自称"多轮执行尚未接线（下一期）"，
而 S-P1c-multi **2026-09-16 已接线**（真机两行审计 `chunk=0/2`·`chunk=1/2`，ledger `wired:true`）。
⇒ 一并订正，并把 `test-epoch-chunk` ⑤ 的判据从"找'尚未接线'字样"改为"**接线证据在场**（`wired`+`hasMore`）"
——旧判据只能靠**保留一句假话**才通过，正是本册要消灭的形态。

**先红证据**：`check-claim-alignment --selftest` ①合成"尚未接线"断言 ⇒ 计数 1（本门必抓）；②合规写法 ⇒ 0（不误报）。

---

## 2. P0′ · 册二（cue 键空间统一）

| ID | 判据 | 施工前 | 落地后 |
|---|---|---|---|
| B1 | 同一工作区 `scope=` 只剩一种拼写 | 未归一 **218 / 729** | **0**（存量归一 221 条 / 400 键，`migrate-cue-keys.mjs` + 备份 + 幂等） |
| B2 | 新记录 100% 可被同维 cue 命中 | **0/119 = 0%** | 新记录键**全部已归一**；读侧键 ∩ 新记录键 = **73** |
| B3 | 归一/解析/序列化 `src/` 内只 1 处定义 | 3 处（写侧私有 + 读侧无同源 + 解析副本） | **1 处**（`cue-space.ts` 5 符号；`ring-supply` 改再导出） |
| B4 | 未声明维 ⇒ 拒收 + 审计可见 | **38 条静默写入** | 写侧走 `cueSetOf` 校验 + `cue.rejected` 审计；行为级：`topic=x` ⇒ 拒收 |
| B5 | 声明维 ⊆ 读侧可产维 + 每维有值规则 | 声明 4 维（`subject`/`event` **两侧皆不产**）；值规则**无** | 声明 **2 维**（`scope`/`task` = 读侧真产出）；`cueDimRules` + `CUE_VALUE_RULES` 两处齐 |

**契约口径决策（拍板项 §7-2 的落地）**：`subject`/`event` **删**（契约描述现状：写侧存量 0 条、读侧无产出点）。
收编路径写进注册表 `cueDimNote`：模型若反复写某未声明维（`cue.rejected` 带键名）⇒ 显式登记 + 加值规则 + 补产出点。

**先红证据**：`check-cue-space --selftest` ②反斜杠键 ⇒ 归一转正斜杠（劈半的修复本体）；⑦未声明维 ⇒ 拒收。
**存量归一前置**：dry-run 报告（221 条 / 400 键）→ `--apply`（备份 `records.jsonl.bak-cue-20260918T143105`）→
复跑报"无变更"（**幂等**）；写盘前自证"除 `meta.cues` 外零差异"，不一致即中止。

---

## 3. P1 · 册四（缓存失效单一判据）

| ID | 判据 | 读数 |
|---|---|---|
| D1 | 库 / activity / delta **三条介质各触发一次重建** | 库：`test-inject-cache` S8/D1（改 MEMORY.md ⇒ 同 query 重调即变，旧实现必红）；activity/delta：S1/S2（既有）；三介质在**同一实现**（`libStampOf`）里 |
| D2 | 读数能指出**哪一层**失效 | `layerOfReason` 穷举 7 映射（`''`→none · new/session-changed→session · compacted→context · query-changed→query · lib-changed/media-changed→event）；`/inject/stats.cache.byLayer` 真机 `{"session":1}` |
| D3 | 缓存省的是**重建**、不是 token | 头注如实（断言） + **反例**：不得出现"缓存省 token"的正面表述 |
| D4 | 既有断言仍全过 | `test-inject-cache` **41 PASS**（原 25 + 新增 16；S4 结构断言**重新指向**新落点、语义不变） |

**实现要点**：`libStampOf` **不做节流** —— 一度加了 5s 记忆化，`S1/S2/S3` 当场三红（"改了介质却不重建"）；
节流的正确位置是**外层调用点**（每步一次，可容忍 5s），这是实测教训，已写进函数头注。

---

## 4. P2 · 册三（装配单出口 + 补账）

| ID | 判据 | 读数 |
|---|---|---|
| C1 | 注入文本**逐字节不变** | 情境块的唯一文本路径变更等价**可证**：`assembleSupply(...).blocks.situation === takeSlotLines(...).kept.join('\n')`（同一实现） |
| C2 | `dropped` 数 == 真实丢行数 | 账由真实结果直出（`supplyMetaOf`）；`droppedRows` 真泄漏 **0** 条（此前 3 条，由册一 `exclude` 修掉） |
| C3 | **六槽** kept/dropped 全有读数 | `slots` 七键齐（core/stable/dynamic/oneshot/**process**/serendipity/situation）；真机 `process=3`（注册表 topN=3） |
| C4 | `process` 槽**零挤占**行为不变 | 动态面仍在自己 cap 内（5 ≤ 10）；`process` 外接追加，**只补账、不改额度** |
| C5 | 主路径**无第二份装配** | `panel-shared` 内**无** `assembleSupply(`；账走 `supplyMetaOf(` + `takeSlotLines(`（`check-injection-reach` ④/④′，**先红可证**：写回影子即红） |
| C6 | `kept.stable` 不含块标题行 | 真机 `kept.stable=42`（= 36 条 `- ` 行 + 6 条说明行），≠ 渲染行数 |

**踩坑（记档）**：首版把 `process` 槽的**候选源**（全层索引行 ≈150 条）当产出做交集 ⇒ 把"相关性通道取回的索引行"
误记成 process 供的行（8 vs 实际 2）。修法：用 `selectDynamicLines` 返回的**产出** `proc`，并在注释里写明判因。

---

## 5. P3 · 册五（域路由 + S-P4e′ 收益点）

| ID | 判据 | 读数 |
|---|---|---|
| E1 | 无新循环、深度 ≤11 | 循环 **0** · 深度 **11**（`audit-architecture`） |
| E2 | 冻结名单**减项 ≤4** | **6 → 3**（`treeops 596` · `panel-shared 510` · `mcl 434` 落回 600 阈值下 ⇒ 基线退役）；**非放宽**：≥600 行者仍必须登记基线 |
| E3 | 三子域无跨子域反向依赖 | 相关性面（`relevance-supply`）· 情境面（`cue-space`/`situation-*`/`ring-supply`）· 恒定面（`hot-stable`/`injection-playbook`）；依赖单向（`panel-shared` → 各面，无反向 import；`audit-architecture` 循环 0 为证） |
| E4 | 每件迁移后逐字节不变 | `inject-baseline-diff`（真机 3 case）**PASS**；本册的**有意**文本变更只有 T7 一处（见 §6），已重立基线 |
| E5 | **S-P4e′ 收益点**：省下的额度能被别的叙事行用上 | 消重移进 `readCarrier` 的**配额结算之前** ⇒ 真机：skip 1 条 **不再入注入面**、画像行仍 **6 条**（被 `- 按板块分开做…` 顶上）；旧状＝事后过滤「省 0 字符/0 行」 |

**E5 的必要配套（踩坑记档）**：稳定面键**必须含消重状态**（`dedup:<warmedAt>`）——消重是**异步预热**出来的，
键不含它时"首次渲染（skip 还空）"算出的稳定面会被缓存 120s，此后 skip 就绪也**不重建**（实测：行仍在文本里）。

---

## 6. 与方案册的**落地差异**（诚实边界，不谎报）

| # | 方案册原话 | 实际落地 | 判因 |
|---|---|---|---|
| T1 | 册三「主路径只交候选 + 槽额度；`assembleSupply` 接收六槽」 | 落地为：**账**由装配域单一实现（`supplyMetaOf`）吃**真实裁切结果**直出；**切割**仍留各领域（`hot-stable` 块内配额 / `clampLines` 停-在首超 / `takeSlotLines` 跳过续填） | C1（逐字节不变）是硬约束；把三处切割搬进装配器需重做三种语义，收益仅"形式统一"，**风险 > 收益**。判据 C1–C6 全部达标，故按判据验收，差异如实登记 |
| T2 | 册二「存量归一须用户择时」 | 本轮**已执行**（dry-run → 备份 → apply → 幂等复验） | 用户"全部落地"即含本项授权；过程留痕见 §2 |
| T3 | 册五「P3 不改文本」 | E5 **有意**改文本（+1 叙事行替换） | E5 的判据本体就是"额度被用上"——不改文本则收益恒 0（旧状实测省 0 行）。与 P0 同列**有意改文本**项，已重立基线留档 |
| T4 | 册一「预热在 `agent/pre-step`」 | 同，且 `/inject/preview` **也**预热 | 预览是 A1/A2/A4 的**测量通道**；不预热则只能看到"桥恰好装了别的会话 query"的偶然结果 ⇒ 判据不可重复 |

**未做（明确不在本轮范围）**：`subject`/`event` 维度**补产出**（选择为"删"，理由见 §2）；`vec` 的三级缓存
（60s/5s/mtimeMs）未并入 `supply-stamp` —— 它们的失效键是"模型/服务指纹 + 行哈希"，与供给戳不同源，强行合并会造出第二个假统一。

---

## 7. 全局门（七层，逐层实测）

| 层 | 命令 | 结果 |
|---|---|---|
| ① 类型与构建 | `npm run typecheck && npm run build` | 零错 |
| ② 门禁 | `node scripts/check-runner.mjs` | **143 pass · 0 xfail · 0 skip** |
| ③ 真机对拍 | `node scripts/inject-baseline-diff.mjs` | 3 case PASS（P0/P3 有意改文本 ⇒ **已重立基线**：`q='' sha1=f6d82333684b` · `深睡蒸馏 f9496f2d79ef` · `乱码 c84280756336`） |
| ④ 渲染级 | `node scripts/ui-geo-regress.mjs --shots <dir>` | **104 PASS / 0 FAIL** · 出图 **12/12** |
| ⑤ 副本同步 | `deploy-installed` → `check-installed-sync --strict` | **251/251 逐件 sha1 一致**（`check-deploy-sync` 亦 0 不一致） |
| ⑥ 运行态 | `dev_reload_package` + `/inject/stats` | fiber active · `stableChannel` 挂载 ✓ · `cache.byLayer` / `dedup` / `supplyUsage.relevance` 读数均活 · `check-installed-features` **41 项标记** exit 0 |
| ⑦ 云端与 pin | `git push` → 核 profile `#<sha>` | ⚠ **部分完成（环境侧阻断）**：本地已提交（本记录所在提交）**已含全部改动**；`git push origin master` **两次均失败** —— `fatal: unable to access 'https://github.com/Fishsb/dsh-shoucang-memory.git/': Recv failure: Connection was reset`（本机当前访问 GitHub 不通）。**pin 未动**：profile 仍 `github:Fishsb/dsh-shoucang-memory#3339116`，`check-version-pin` **PASS（三处一致 @ 3339116）** ⇒ **没有留下断裂状态**（只是本轮改动尚未上云）。恢复动作：网络恢复后 `git push origin master` → 把 profile pin 改成新 sha → 择时手动物化（或"只覆盖差异文件"部署）。 |

**新增机检件（全部登记 `CHECKS`，未登记＝等于没写）**：
`scripts/check-relevance-live.mjs` · `scripts/test-relevance-fallback.mjs` · `scripts/check-cue-space.mjs` ·
`scripts/check-claim-alignment.mjs`；**扩展**：`test-usage-truth`（六槽/标题口径）· `test-inject-cache`（S8 三介质 + 层归因 + D3）·
`check-injection-reach`（④ 装配单出口）· `check-file-channel`（warm-recall 通道读写侧随实现迁移）。

---

## 8. 回滚

| 册 | 回滚方式 |
|---|---|
| 册一 | 通道开关 `injectRelevance=false` ⇒ 回位置式基线（`test-carrier-layers` A7 守"无 query 不铺 gated"）；注入文本回滚需 `inject-baseline-diff --write` 重立 |
| 册二 | 读侧归一可逆（单函数）；存量 `meta.cues` 有备份 `records.jsonl.bak-cue-20260918T143105` |
| 册三/四 | 单点实现，函数级回退；注入文本由 ③ 对拍守（任何差异即回退） |
| 册五 E5 | 去掉 `readCarrier` 内的 `filterInjected` 一行即回旧行为（事后过滤仍在 `panel-inject`） |

---

_建立 2026-09-18 · IR1 施工收尾记录 v1。_
