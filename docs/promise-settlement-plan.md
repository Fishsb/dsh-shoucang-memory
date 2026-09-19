# 承诺结算链方案（承诺只进不出 → 三源可结）

> **态标签（R5）**：本档 = **决策态**（仅方案 + 验收成对，**不动任何代码/记录**）。
> 授权来源：用户在「A 只出方案+验收成对」中具名选择 A。
> 复跑口径：本文所有读数均为 2026-09-19 本机实测，**不用自述**；命令见 §9。

## 1 问题定位（一句话根本决策）

**现状**：关系的「承诺」是一条**只写不结的账**——`commitment.open` 事件 **75** 条，`commitment.settle` **1** 条（且那 1 条不是活路径结算，见 §2.2），75 条记录 `lifecycle` **全为 active**。

**根本决策（本方案主张的全局选择）**：把承诺状态从"写入即终态"改为 **"三源可结、结必有证"**：

| 证据源 | 谁产出 | 结算谁执行 |
|---|---|---|
| **① 事实证据**（会话里已发生的交付/复验） | 蒸馏 / 深睡**只能提案**（append-only） | 执行面（S3 通道）按唯一命中落库 |
| **② 时间证据**（`due` 逾期且无证据） | 确定性规则（`dueSoon` 已有口径） | **不自动结**（只进"待裁决"队列，见 §6-册三） |
| **③ 用户一句话** | 用户 | 用户 |

**红线（本方案的不做）**：**结算权不进蒸馏模型手里**。模型只能"提案"，且提案必须携带**证据串**；否则就是"自己给自己发合格证"，兑现率必然虚高（这正是本仓 `test-relation-ring` 已锁的反例：*"重复结清被拒（兑现率不许虚高）"*）。

## 2 现状契约（已核事实 / 缺口）——描述现状，不写目标态

### 2.1 已核事实（本机实测，非推断）

| 项 | 读数 | 来源 |
|---|---|---|
| 环事件总数 | **1022** | `~/.dsh/skills/managing-memory/.records/ring-events.jsonl` |
| op 分布 | `decision.open` 549 · `decision.outcome` 165 · `valence.record` 145 · `relation.assert` 82 · **`commitment.open` 75** · `collision.record` 2 · `collision.accept` 2 · **`commitment.settle` 1** · `collision.land` 1 | 同上 |
| 记录总数 | **5511**，其中 `commitment` **75** | `.records/records.jsonl` |
| 承诺 lifecycle | **75/75 active**（无一条归档/关闭） | 同上 |
| 承诺 status | **pending 74 · kept 1**（broken 0） | 同上 |
| 方向 | `owed-by-me` **42** · `owed-to-me` **33** | 同上 |
| 按日 | 09-13 **3** · 09-14 **3** · 09-15 **5** · 09-16 **6** · 09-17 **10** · **09-18 40** · 09-19 **8** | 同上 |
| 带 `due` | **14** 条（其中 1 条为文本"长期"）；可解析日期且**已逾期 7** 条 | 同上 |
| 注入口径 | `surface.injection.situation`：`topN 3` · `ringOrder` 5 环 · `budgetChars 300` | `skill/engine/criteria.json` |
| 逾期优先级 | **已实现**：`dueSoon()`（7 天窗，唯一实现）+ 三组排序「情境命中 → 已到期/临近 → 兜底」 | `src/ring-supply.ts:77-108,191-210` |
| 机制单测 | 已有：`test-relation-ring`（结算幂等 / 出队 / 按人过滤）、`test-ring-events`（重放） | `scripts/check-runner.mjs` L575/L586 |
| 上游 PR（跨仓实证） | **已提且 open**：「bind role presets to the agent side (R-A)」+「filter the node tool wish list against the live registry」 | GitHub API `repos/9931666/dsh-plugin-roundtable/pulls?state=all`（2026-09-19 取） |
| 跨仓 PR 已了结 | 另一 DSH 插件仓的 PR **state=closed**（`closed_at 2026-09-18T22:30:34Z`，`merged:false`，1 条评论） | GitHub API `repos/Fishsb/dsh-prompt-enhancer/pulls/7`（2026-09-19 取） |

**机制侧并不缺**（这点必须先讲清，否则会去重造轮子）：

- `settleCommitment(records, id, {status, note?, at})` **已存在**，且**幂等**：已结清的拒绝重复结清（`src/relation-ring.ts:108-120`）；
- `openCommitments(records, who?)` **已存在**（待兑现队列）；
- 结算**会被确定性地投影成事件**：`ring-events` 走"记录差分 → 事件"，`pending → kept/broken` 迁移即生成**恰好一条** `commitment.settle`（`src/ring-events.ts:204-206`）⇒ 台账与记录**永不各说各话**；
- 人工入口**已存在**：`scripts/record-ring.mjs --settle <id> --kept|--broken`（含 `--open` 待兑现队列视图）。

### 2.2 缺口（本方案的对象）

**G1 · 结算触发权无人认领（根本缺口）**
`settleCommitment` 的调用面只有两处：① `ring-events` 的**重放折叠**（不是决策）；② `scripts/record-ring.mjs` 的**人工 CLI**。**自动链（蒸馏 / 深睡 / 自检）零调用** ⇒ 「谁在证据出现时回写结算」这个问题，代码里**没有答案**。

**G2 · 那唯一 1 条 settle 不是活路径结算**
其 `at` 与对应 `commitment.open` **同在 2026-09-13T11:28**（间隔 7 秒），性质是**回填补发的状态迁移事件**——源码注释写明了这一情形（`src/ring-events.ts:184-194`「终态重建」：真库首次回填时记录已带终态，只发创建事件会让重放停在初始态）。⇒ **活路径从未结算过一次**。

**G3 · 结算不要求证据（不可追溯）**
`SettlementInit = { status, note?, at }`（`src/relation-ring.ts:57-61`）——**没有 `evidence` 字段**，也**不记录 `settledBy`**（是模型判的、规则判的、还是用户说的？无从分辨）。`kept/broken` 一旦落库即不可复核。

**G4 · KPI 在"无结算"时读数不可辨（判别力缺口）**
`trustOf.rate = kept / (kept + broken)`（`src/relation-ring.ts:176-184`）——**pending 不进分母**。
⇒ 现状读数恒为 **0**。而这个 `0` 同时可能是「全未兑现」也可能是「**从未结算过任何一条**」；两义混一，**指标失去判别力**。注：这不是"分母膨胀"（那是我上一轮的错判，见 §2.3）。

**G5 · 消费者只有展示，没有动作**
`trustOf` 的唯一消费方是 `panel-observe.ts:138`（`/rings` 视图）；`openCommitments` 的唯一消费方是未部署的 CLI ⇒ **注入面/面板看得到待办，但没有一条链会推动它**。

**G6 · 结算入口未抵达运行态**
`scripts/record-ring.mjs` **不在记忆库内**（库内 `scripts/record-ring.mjs` 不存在），也非 `check-runner` 登记件 ⇒ 用户手上**没有一条可用的结算入口**（即便想手动结，也得回到开发仓）。

**G7 · owed-to-me（33 条）结构性积压**
"欠我"只能由**对方动作**达成，而链路里既无"向用户回问"的通道，也无"用户一句话即结"的入口 ⇒ 这 33 条按机制**必然永远 pending**。

**G8 · 常驻条款没有终止语义（分类时暴露）**
75 条里有相当一批是**行为承诺**（"此后自行拍板、不再逐项抛决策"、"不再删不确定的文件"、"不碰风险项"）——它们**没有一次性终态**，既不会 kept 也不会 broken，却被当作 pending 承诺长期占位（并进入待办队列与 KPI 视野）。
⇒ 这类条款的**正确归属不是承诺**（应为 `relation` 关系事实，或带 `standing` 标记且**不进** pending 队列/KPI）。这不是"再结一次账"能解决的，必须在**开条侧**分流。

**G9 · 跨仓承诺混入本仓台账（分类时暴露）**
若干承诺的交付物落在**别的仓/别的会话**（如另一 DSH 插件仓的发布批次、PR 回帖）。它们以 `subject=user / scope=global` 落进同一份台账 ⇒ **本仓无权结、也无证据结**，只能长期挂着。
⇒ 需要一条**归属规则**：开条时记 `repo`/`session` 归属；非本仓的**不进本仓待办队列**（否则本仓永远替别仓背账）。

**G10 · 环事件重放不能重建当前状态（结算落库时实测暴露，**既有缺陷、非本次引入**）**
`record-ring.mjs --reconcile` 现状：store 环记录 **1018** · 事件重放 **1018** · **内容不一致 181**（样例 `decision:1buikz2` / `decision:v8h2mw` / `valence:rc8yr3`，**无 commitment**）。
**证明其先于本次结算**：用落库前的备份快照（`~/.dsh/backups/sc-settle-20260919-173020`）跑同一对账 ⇒ **同样是 181**，数量与首三个 id 完全一致。
⇒ 含义：**「事件流是不可变真源」这一条在 decision/valence 面上当前不成立**（181/1018 无法从事件重建）。对本案的**直接影响**：§4 册一的 V1.2 原本写"重放后对账**零漂移**"，在全库红的情况下**无法被判绿** ⇒ V1.2 口径必须收敛为**承诺面切片**（`commitment:*` 零漂移），全库 181 另立项修复（不在本方案授权范围）。

### 2.3 我上一轮的错判（如实纠正，防据此施工）

| 我曾说 | 实测 | 结论 |
|---|---|---|
| 「分母无限膨胀 ⇒ 兑现率随时间必然趋零」 | 分母只含 `kept+broken`，pending 不计 | **错**：真缺口是 G4（0 不可辨），不是膨胀 |
| 「同一承诺被重复开条目（近重复）」 | `what` 字面完全相同 **0** 组；互为子串 **0** 对（id 指纹 `fingerprint(who\|what\|direction)` 已兜住字面重复） | **错**：语义近重复人眼可辨，但**无确定性判据**；本方案**不做机械去重**（词面代理在本仓已被两次证伪：`check-pointer-content` 首版 73.5% 误报） |
| 「`commitment.settle` 零调用」 | 自动链零调用；**人工 CLI 存在**（未部署） | **修正**：不是"没做"，是"没接"（G1 + G6） |

## 3 册零 · 核心类型与消费面（先定，后续各册不许自造字段）

**方案**
1. `SettlementInit` **只增不改**：加 `evidence: string`（**必填**）、`settledBy: 'user' | 'rule' | 'agent-proposal' | 'cli'`、可选 `proposalId`（关联提案，供幂等与追溯）。
2. 状态机**不扩枚举**：仍是 `pending → kept | broken`。**不新增** `expired`/`superseded` 状态——逾期不是终态（"其实做了只是没回写"与"确实没做"必须由证据区分，不能由时间替判）。
3. 消费面**显式登记**（现状：散落）：
   | 消费者 | 现状 | 目标 |
   |---|---|---|
   | `/rings` 视图（`panel-observe`） | 只展示 `trustOf` | 展示三态（兑现 / 未兑现 / **未结算**） |
   | 注入面（`ring-supply`） | 按 `dueSoon` 优先供给 pending | 不变（**判据不动**） |
   | 待裁决队列 | 无 | `openCommitments` + 逾期过滤，供册三/册五消费 |
   | 结算执行 | 仅未部署 CLI | 册二提案 → 册零执行通道 |

**验收（成对）**
| # | 判据 | 先红证据 |
|---|---|---|
| V0.1 | `SettlementInit.evidence` 为**必填**（tsc 层）：构造缺 `evidence` 的结算调用 ⇒ `npm run typecheck` **必须报错** | 先红：现状 `new (…)` 无该字段，改后原有测试件会红（**预期红**，说明约束真生效） |
| V0.2 | `settleCommitment` 对空 `evidence`（`''`/空白）**拒绝结算**，返回 `{ok:false, reason}` ⇒ 新增断言 `settleRejectsNoEvidence` | 先红：现状空证据**照结**（夹具 1 例即可自证） |
| V0.3 | **不扩枚举**：`CommitmentStatus` 联合类型仍为 3 值（文本断言 + tsc） | 反例自证：故意加 `'expired'` ⇒ 断言红 |
| V0.4 | 消费面登记表与实现一致：脚本扫描 `trustOf`/`openCommitments` 的**全部引用点**，与上表逐条对照（多一处/少一处即红） | 先红：现状 `record-ring.mjs` 未登记（G6） |

## 4 册一 · 证据化结算（结算必带证据 + 可追溯）

**方案**：`settleCommitment` 只接受**带证据**的结算；证据写入 `meta.evidence` 与 `meta.settledBy`（**只增字段**，不动既有 `note`）。
接线点唯一：`settleCommitment` 内部校验（**单一实现**，禁止在调用处各写一遍"证据检查"）。

**为什么必须在这里堵**：结算是**状态迁移**（`pending → kept/broken`），而 `kept/broken` 是 `trustOf` 的**唯一分子/分母来源**。校验放在唯一迁移点上，才等于"兑现率不可虚高"这条既有纪律的**可机检化**。

**验收（成对）**
| # | 判据 | 覆盖 |
|---|---|---|
| V1.1 | `test-relation-ring` 扩面：① 无证据 ⇒ 拒 ② 有证据 ⇒ 落 `meta.evidence`/`settledBy` ③ **幂等不变**（重复结清仍拒） | 机制层 |
| V1.2 | `test-ring-events` 扩面：带证据结算 ⇒ 重放后 `commitment.settle` 事件**恰好 1 条**，且 `data.evidence` 与记录一致（**对账零漂移**） | 事件层（记录↔台账同源）<br>⚠ **口径收敛（2026-09-19 实测，见 §2.2 G10）**：全库 `--reconcile` 现为 **181/1018 红**（**既有**，与结算无关）⇒ 本判据只断言 **`commitment:*` 切片零漂移**，不把全库红算作本册失败；全库 181 另立项 |
| V1.3 | 反例自证：把证据校验**摘掉**再跑 V1.1 ⇒ 必须红（证明判据有判别力，非恒真） | 判据自证 |
| V1.4 | 真机：对存量任取 1 条 pending 走**只读试算**（不落库）打印将写入的 `evidence`/`settledBy`，人工核对 | 真机读数 |

## 5 册二 · 提案流：模型只能提案，执行权在 S3 通道（复用既有机制）

**方案**：蒸馏 / 深睡产出 `commitment-settle` **提案**（append-only，落 `pending/` 或既有提案流），**不直接改记录**；执行走**本仓已有的执行面**（`proposal-apply` 同族：默认关闭 + **逐字唯一命中** + **先留档再改** + 幂等账）。

**复用清单（不从零造轮子）**：`src/proposal-apply.ts`（L2 提案唯一消费者，默认 `SHOUCANG_PROPOSAL_APPLY=1` 才启用）· `bank-lock`（库级单写者）· `section-rewrite`（唯一写入原语）· `ring-events` 差分投影。

**关键约束**：提案的 `before` 必须**逐字命中**目标承诺的当前 `text`（命中 0 ⇒ 陈旧；多次 ⇒ 歧义 ⇒ 拒），与册二既有语义**逐字一致**——不为承诺另立一套匹配规则。

**验收（成对）**
| # | 判据 | 覆盖 |
|---|---|---|
| V2.1 | 默认**关闭**：未设开关时提案**零落库**（记录与台账双查，diff = 0） | fail-closed |
| V2.2 | 开关打开 + 唯一命中 ⇒ 结算生效，且**先留档**（`rollback/<opHash>.json` 含被改前原文） | 可回退 |
| V2.3 | 陈旧（`before` 不命中）/ 歧义（命中多次）⇒ **拒**且留理由，绝不静默跳过 | 判据 |
| V2.4 | **幂等**：同 `(sid, opHash)` 复跑 ⇒ no-op（`applied.jsonl` 命中即跳过） | 幂等 |
| V2.5 | 越界拒绝：提案试图**新增/删除**承诺（非结算）⇒ 拒（本册只结不建） | 边界 |
| V2.6 | 反例自证："模型自批"路径：构造一条**无证据**的模型提案 ⇒ 必须被册一的校验拦下（两层判据不重复也不漏） | 交叉自证 |

## 6 册三 · 时间证据：逾期进"待裁决"，不自动结

**方案**：`due` 逾期（复用 `dueSoon` 的 **7 天窗**，口径唯一，不在别处另写数字）且仍 `pending` 的承诺 ⇒ 进**待裁决队列**（只读出口 + 面板可见）。
**明确不做**：**不自动判 `broken`**。理由：逾期只证明"时间到了"，不证明"没做"——自动 broken 会把"其实已交付、只是没回写"的条目判成不兑现，**直接污染 `trustOf`**（与册一"结必有证"冲突）。

**验收（成对）**
| # | 判据 | 覆盖 |
|---|---|---|
| V3.1 | 逾期集合 = `pending ∧ dueSoon(¬)´`：夹具 4 例（已逾期 / 7 天内 / 无 due / 坏时间戳不抛）逐例断言 | 判据 |
| V3.2 | **零副作用**：跑一次待裁决扫描后，记录集与台账**逐字节不变**（不是"看着没变"，是 diff 为空） | 只读 |
| V3.3 | 真机读数：存量 `due` 14 条中逾期 **7** 条（本档 §2.1 基线），扫描输出与基线一致 | 存量对齐 |
| V3.4 | 口径唯一：`grep` 全仓 `7 * 86400000` / `dueSoon` 定义 ⇒ 仅 1 处实现（多一处即红） | 防漂移 |

## 7 册四 · KPI 判别力：三态可辨（不改分母口径）

**方案**：`TrustScore` **只增字段**：`minePending` / `theirsPending` / `mineOverdue` / `theirsOverdue` / `evidenceMissing`（有多少结算是历史遗留、无证据可溯）。
**分母口径写死并显式标注**：兑现率仍 = `kept/(kept+broken)`，但展示面必须同屏给出 **「未结算 N 条（不计入分母）」**——让 `0` 的两种含义**当场可辨**。
**不做**：不把 pending 塞进分母（那会把"未结算"伪装成"未兑现"）；不合成两方向（既有纪律：方向不许合成）。

**验收（成对）**
| # | 判据 | 覆盖 |
|---|---|---|
| V4.1 | 三态可辨：夹具「0 结算」与「全 broken」两种输入 ⇒ **输出文本不同**（前者含"未结算 2 条"，后者不含） | 判别力（核心） |
| V4.2 | 分母口径不漂移：`kept/(kept+broken)` 与既有断言**逐字一致**（册四只加字段，不算术改动） | 兼容 |
| V4.3 | 方向不合成的**反例**：我欠 kept / 欠我 broken 的夹具 ⇒ 两个 rate 各为 1 / 0，不得输出单一 0.5 | 反例自证 |
| V4.4 | 真机读数：现状 `trustOf(用户)` ⇒ `kept 1 / broken 0 / pending 74`，展示面须出现"未结算 74 条" | 真机 |

## 8 册五 · 存量对齐（75 条一次性分类，**须你过目**）

**方案**：对 75 条**逐条**给"建议处置 + 证据来源"，**只出清单、不落库**（落库另行授权）。分类口径：

| 类 | 判据 | 期望（本轮已验的样例） |
|---|---|---|
| **A 已履行**（有会话/审计/文档证据） | 证据可指到文件或命令读数 | 例：「会议收口后复验红线基线并交付四册汇总」→ 本轮已复验（porcelain 干净 / `check-hardcode` 573 件零命中 / `check-public-tree` PASS / 四册汇总在 `docs/distill-admission-plan.md` §13） |
| **B 已失效**（被后续指令取代或前提消失） | 后续指令文本可指 | 例：「点名是否开工指针供给册二」「就 pointer-supply-plan.md 给撤/留一句话」→ 册二/册三已落地（`docs/pointer-supply-plan.md` §11/§12） |
| **C 仍有效**（确实还欠） | 指不出证据 | 例：**上游 PR**（`9931666/dsh-plugin-roundtable` 的 preset 通道修复）——仓外动作，未做 |
| **D 无法判** | 证据不足 | 单独列出，**保持 pending**，不猜 |

**边界（R3）**：册五涉及**既有用户裁决面**（哪些算"已履行"由你认，不由我认）⇒ **清单交你过目后**才谈落库；且落库走册一/册二同一条证据化通道，不另开旁路。

**验收（成对）**
| # | 判据 | 覆盖 |
|---|---|---|
| V5.1 | 计数守恒：`A + B + C + D = 75`，且清单每条含 `id` / `what` / 建议类 / 证据指针（空证据必须显式写"无法判"） | 输入量可见化（N=0 也显式） |
| V5.2 | 清单**零副作用**：生成前后记录集 diff 为空 | 只读 |
| V5.3 | 抽验 3 条（A/B/C 各 1）：证据指针**能被打开**（文件存在 / 命令可复跑） | 证据非自述 |
| V5.4 | 用户过目门：清单末尾留「确认 / 修改 / 驳回」栏，**未确认不得落库**（执行侧 fail-closed） | R3 |

## 9 证据索引（复跑命令 + 本次读数）

```bash
# ① 台账现状（事件层）
node -e "const fs=require('fs');const p=process.env.USERPROFILE+'/.dsh/skills/managing-memory/.records/ring-events.jsonl';const c={};for(const l of fs.readFileSync(p,'utf8').split('\n')){if(!l.trim())continue;let o;try{o=JSON.parse(l)}catch{continue};c[o.op]=(c[o.op]||0)+1};console.log(c)"
#   → {decision.open:549, decision.outcome:165, valence.record:145, relation.assert:82,
#      commitment.open:75, collision.record:2, collision.accept:2, commitment.settle:1, collision.land:1}  合计 1022

# ② 记录现状（记录层）
node -e "const fs=require('fs');const p=process.env.USERPROFILE+'/.dsh/skills/managing-memory/.records/records.jsonl';let n=0,st={},dir={},life={};for(const l of fs.readFileSync(p,'utf8').split('\n')){if(!l.trim())continue;let o;try{o=JSON.parse(l)}catch{continue};if(o.kind!=='commitment')continue;n++;st[o.meta?.status]=(st[o.meta?.status]||0)+1;dir[o.meta?.direction]=(dir[o.meta?.direction]||0)+1;life[o.lifecycle]=(life[o.lifecycle]||0)+1};console.log({n,st,dir,life})"
#   → {n:75, st:{pending:74,kept:1}, dir:{'owed-by-me':42,'owed-to-me':33}, life:{active:75}}

# ③ 注入口径（注册表）
node -e "const j=require('./skill/engine/criteria.json');console.log(j.surface.injection.situation.topN, j.surface.injection.situation.ringOrder)"
#   → 3 [ 'relation', 'decision', 'association', 'fact', 'value' ]

# ④ 机制判据（既有单测）
node scripts/test-relation-ring.mjs && node scripts/test-ring-events.mjs
#   → PASS（35 pass · 0 fail）/ PASS（28 pass · 0 fail）

# ⑤ 跨仓证据（只读取证，2026-09-19 实测）
#   上游 preset 修复 PR 是否真提了（本次取证：2 条 PR，均 open，作者 Fishsb）
#   GET https://api.github.com/repos/9931666/dsh-plugin-roundtable/pulls?state=all
#   另一仓 PR 是否了结（本次取证：state=closed · closed_at 2026-09-18T22:30:34Z · merged=false）
#   GET https://api.github.com/repos/Fishsb/dsh-prompt-enhancer/pulls/7
```

**读数基线（本档引用的全部数字，均可由 ①②③ 复现）**：事件 1022 · 承诺 open 75 / settle 1 · 记录 75（active 75 · pending 74 · kept 1 · broken 0）· 方向 42/33 · 带 due 14 · 逾期 7 · 注入 topN 3。

## 10 风险、回退与不做

| 项 | 内容 |
|---|---|
| **最大风险** | **结算权错放** ⇒ 兑现率虚高（自批合格证）。对冲：册一（结必有证）+ 册二（模型只提案、执行在 S3、默认关闭）+ 幂等与"重复结清被拒"既有判据。 |
| **次风险** | 把"逾期"当"未兑现" ⇒ 误伤真实履行（只是没回写）。对冲：册三**明确不自动 broken**。 |
| **回退** | 全部改动可逆：类型/校验（git）· 提案执行（`rollback/<opHash>.json` 先留档 + `applied.jsonl` 幂等）· 存量落库（库仓 git 回退点）。 |
| **不做** | ① 不做机械去重（词面代理已两次证伪）；② 不把 pending 计入兑现率分母；③ 不合成两方向；④ 不自动 broken；⑤ **不让蒸馏模型执行结算**；⑥ 不在读侧改写历史事件（append-only）。 |

## 11 施工清单（授权后按此顺序，逐步可停）

1. **册零** → 2. **册一**（判据先红 → 后绿）→ 3. **册四**（纯读侧，零风险，可先于册二）→ 4. **册三**（只读出口）→ 5. **册二**（执行面，默认关闭）→ 6. **册五**（清单交你过目 → 你认后落库）。
每册收尾须过**五层验收**（`typecheck`+`build` / 全量 `check-runner` / `deploy-installed` + `check-installed-sync --strict` / 热重载 + `check-installed-features` / push + pin 归位）。

## 12 授权清单（R1）

| 册 | 需授权的具体动作 | 现状 |
|---|---|---|
| 册零 | 改 `SettlementInit`（加字段）+ 消费面登记表 | **未授权**（本档仅方案） |
| 册一 | 改 `settleCommitment` 校验 + 扩既有单测 | **未授权** |
| 册二 | 接提案→结算执行链（默认关闭） | **未授权** |
| 册三 | 新增待裁决只读出口 | **未授权** |
| 册四 | `TrustScore` 加字段 + 面板三态 | **未授权** |
| 册五 | 存量分类**清单**（只读，可立即做）；落库须另授权 | **清单已产出**（2026-09-19 · 全表在私有区 `docs/devref/promise-classification.md`；聚合与判据见 §14）· 落库**未授权** |

## 13 施工记录（授权后回填）

### 13.1 册五落库（2026-09-19 · 用户指令「落」= 具名授权）

**态标签（R5）**：施工态。授权 = 用户「落」（对册五 14 条可结清项的落库授权）。

| 项 | 读数 |
|---|---|
| 执行通道 | **唯一写入通道** `scripts/record-ring.mjs --settle <id> --kept --note "…"`（内部 = `settleCommitment` → `commit()`：**先记事件、再存状态**） |
| 备份回退点 | 文件备份 `~/.dsh/backups/sc-settle-20260919-173020`（records + ring-events）；库仓 git `d640b7cc`（落库前）→ **`361461df`**（落库后） |
| 落库条数 | **10 条**（册五 A 类 11 条中排除 1 条**已结清**者 `11bujjv`） |
| 前后状态 | `pending 74 → 64` · `kept 1 → 11` · `broken 0`（75 条总数不变） |
| 事件侧 | `commitment.settle 1 → 11`（**恰 +10**，差分投影自洽） |
| 幂等 | 重复结清被拒：`❌ 结清失败：该承诺已结清（kept，不重复结清）` |
| KPI | `trustOf('用户') = {mineKept:9, mineBroken:0, mineRate:1}` —— **脱离"0 不可辨"**；分母非空、分子全部有据；64 条无据者留在 pending **不进分母** |
| 文档↔记录 | `check-record-parity` **PASS**（分歧 0） |

**未落的 3 条（B 类：`129p1jg`/`a1yq9g`/`6vf4sm`）——为什么不落**：
它们的语义是**"承诺作废"**（前提被实测否证 / 被后续指令取代），而当前状态枚举**没有"作废"位**。
强行记 `kept` ⇒ **兑现率虚高**；记 `broken` ⇒ 把"没做错事"记成"失信"。
两条路都**污染 KPI**，与 §10 红线（"兑现率不许虚高"）直接冲突 ⇒ **停在 pending 等册零给出作废出口**（G8 同源问题）。

**证据落点说明**：册一（`SettlementInit.evidence` 必填）**尚未施工**，故本轮证据写在**既有 `note` 字段**（真实存在的字段），不假装用了不存在的字段。

---

## 14 附录 · 册五存量分类结论（**已产出** · 2026-09-19 · 只读）

> **落点分离（隐私边界）**：**全表 75 条**（含跨仓明细与安全类条目）落在**私有区** `docs/devref/promise-classification.md`（该目录已 gitignore，见 `.gitignore:32`）；**公开档只放聚合与判据**——与 `docs/PUBLISH-POLICY.md` 的"必传/禁传"分档同源。
> **零副作用**：分类**未修改任何记录**（records.jsonl 与 ring-events 前后逐字节不变，见 V5.2）。

### 14.1 分类判据（7 条，可复用）

| 规则 | 判据 | 归入 |
|---|---|---|
| **R-A** 前提被否证 | 承诺的前提经实测不成立（如"补 deploy 覆盖"实为不必要） | **B 已失效** |
| **R-B** 时过境迁 | 一次性核验承诺，其针对的构建已被后续构建取代 | **B** |
| **R-C** 后续指令取代 | 交付物/问题已由后续指令或动作消解 | **B** |
| **R-D** 交付物已存在 | 交付物实测存在（授权记录可缺） | **B** |
| **R-E** 跨仓/跨会话 | 交付物落在别仓/别会话 ⇒ **本仓无权结** | **D 无法判**（注明归属） |
| **R-F** 常驻条款 | 行为承诺无一次性终态 ⇒ 见 G8 | **C 仍有效**（待归属重定） |
| **R-G** 前置条件式 | 以"某前提成立后"为条件，前提未发生 | **C** |

### 14.2 聚合（守恒校验）

| 类 | 合计 | 我欠 | 欠我 |
|---|---|---|---|
| **A 已履行** | **11** | 11 | 0 |
| **B 已失效** | **16** | 3 | 13 |
| **C 仍有效** | **34** | 15 | 19 |
| **D 无法判** | **14** | 13 | 1 |
| **合计** | **75** | **42** | **33** |

- **守恒**：11 + 16 + 34 + 14 = **75** ✓ · 我欠 42 / 欠我 33 ✓（逐条核对，无重复无遗漏）。
- **有证据可结清 = 14 条"我欠"**（A 11 + B 3）⇒ 这 14 条可直接走册一/册二通道。
- **结构性悬置**：C 中 **19 条"欠我"**（等你一句话）+ **15 条"我欠"**（多为 R-F 常驻条款与 R-G 前置条件）；D 中 **13 条跨仓**。
- **安全类单列**：涉及密钥轮换/遮蔽的条目**不并入自动结算**，一律人工确认。
- **典型证据样例（脱敏）**：① 跨仓 PR **已提且 open**（GitHub API 实证）⇒ A；② 另一仓 PR **state=closed**（09-18 22:30，未合并）⇒ B；③ `--only` **已实现**于 `check-runner.mjs:37/47/53` ⇒ B；④ "补 deploy 覆盖" 的前提被 `deploy-installed.mjs:78-82` **实测否证** ⇒ B（R-A）。

### 14.3 本次分类对方案的**增量**（不是清单副产品，是判据）

- 新增缺口 **G8**（常驻条款无终止语义）与 **G9**（跨仓承诺混入本仓台账）——见 §2.2。
  ⇒ **册零** 的消费面登记表因此扩一项：**开条侧分流**（行为条款 → `relation` 或 `standing` 标记；跨仓条目带归属，不进本仓待办队列）。**仍不扩状态枚举**（`pending/kept/broken` 不变）。
- **R-F/R-G 的处置只能靠册零的开条侧改造**，靠"再结一次账"永远结不掉——这正是 34 条 C 里 15 条"我欠"的成因。

### 14.4 落库门（R3）

清单**本身**已完成；**落库**（把 14 条可结清项真正 `settleCommitment`）**未授权、未执行**。
须你过目后点名（可与册一/册二同批）：每条的**证据指针**都在私有表内可点开复核（V5.3）。

> **更新（2026-09-19）**：用户已下令「落」⇒ **册五落库已执行**（10 条，详见 §13.1）。
> 余 3 条 B 类因**缺"作废"语义**未落（理由见 §13.1，含 KPI 污染论证）。
