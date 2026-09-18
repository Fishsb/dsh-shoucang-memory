# S2S3 · 三层记忆供给链协调验收方案

> **性质**：**验收册**（与 `S2S3-three-layer-plan.md` 成对）。**先定"完成"再动手**；任一条红即未完成；未通过的册**回退该册**。
> **口径**：G 判据逐条给 **现状读数 / 目标读数 / 先红方式 / 机检命令**；七层全局门复用 `AGENTS.md` 规则 7。

---

## 0. 验收总则（反假绿 7 条，本册全适用）
1. **"等价/不变"类断言首跑必须红**；2. 计数类断言**必须给分布与口径**；3. **夹具绿 ≠ 真数据绿**（判据类特性须在真库跑一次）；
4. 不得用"文件存在/exit 0"当"本次成功"；5. 门禁过滤**只显式点名**，合入跑**全量**；6. 每条读数给**可复现命令**；
7. **自己的仪器先做阳性/阴性对照**（本轮已在 S1R 上验证过此纪律的必要性）。

---

## 1. G 判据 ↔ 册映射

| G | 判据（一句话） | 册 | 机检/证据 | 现状 |
|---|---|---|---|---|
| **G0** | L1 **失败清单随行**：`dispatch-failed` 的主题必然出现在 L2 材料里 | 册零 | 审计 `appendRejected` + L2 材料段计数 | ❌ 现状 failed **1679**、清单**无出口** |
| **G1** | L1 落盘**不再产生孤儿**：append 失败 ⇒ 该主题**无新索引行** | 册零 | 真库 `check-section-refs`（须保持 0）+ 审计对账 | ❌ 同主题有行无节 |
| **G2** | L2 **存在且看全**：每会话（满足双维判据）**恰好一次**复盘，材料覆盖**整个会话** | 册一 | 审计 `kind=session-review` 的 `reviewedSeq` / 材料段计数 | ❌ 审计行 **0**（先红） |
| **G3** | L2 **能校正 L1**：revise/merge/demote 生效且**留档可回滚** | 册一 | 校正数 > 0 + 归档文件含原行原文 + 幂等复跑 no-op | ❌ 无此能力 |
| **G4** | L2 **不越界**：只动**本会话**产出的条目；跨会话改动数 = 0 | 册一 | 审计 `outOfScopeTouched == 0` | — |
| **G5** | S3 **影响账**：当日每条产出条目**都有裁决**（`keep-direction/compress/archive`），未裁决数 = 0 | 册二 | `audit/impact/<day>.jsonl` 条数 == 当日产出条数 | ❌ 无影响账 |
| **G6** | S3 **不产出**：`principles.added == 0` 且 `profileOps` 仅 replace/merge | 册二 | 审计 `kind=deep-sleep` 的 `added/replaced` | ❌ 现状 added **65**（49 轮） |
| **G7** | S3 **真的压缩**：`archive/compress` 数 > 0，且**方向节点保留**（压缩后每条仍有可读方向 + 指针） | 册二 | 归档条数 + `check-section-refs` 保持 0（指针仍可解析） | ❌ 现状 `forgetArchived=4`（候选 391） |
| **G8** | **层间交接完整性**（在册机检）：L2 必消费 L1 清单；S3 必对当日产出裁决；**失败清单不得丢失** | 册三 | 新增机检件（入 `CHECKS`）+ 夹具先红 | ❌ 无此件 |
| **G9** | **输入量可见**：三层当日 产出/校正/压缩/未裁决 数在只读投影里可查（不改注入面） | 册三 | 端点或报告件 + `inject-baseline-diff` 逐字节不变 | ❌ 无 |
| **G10** | **每轮睡眠必有汇报**（提存/压缩/标记/统计五段齐）且**日历式留存、永不删除** | 册四 | `reports/sleep/<date>.md` + `sleep-reports.jsonl` | ❌ 现只有会被覆盖的 `delta.md` |
| **G11** | **只标记不处置**：`unused/counter` **不触发** archive/delete；标记与压缩裁决**相互独立** | 册四 | `sleep-issues.jsonl` 状态行 + 反例夹具 | ❌ 无标记面 |
| **G12** | **问题统计**可查且**分得清"记忆问题 vs 召回问题"**：`suspect-recall` 与 `suspect-quality` 分开计数 | 册四 | `/sleep/issues` 统计 + 抽样核对 | ❌ 无 |
| **G13** | **UI 可见（占用运行总览晨起摘要卡位）**：改造成"睡眠汇报/日报"卡（今日提存·压缩·问题计数 + 最近几期可回看），**不新增视图**；**DOM 几何 + 图证 + 数值与端点逐值一致** | 册四 | `ui-geo-regress --shots` + 契约门禁 | ❌ 现为晨起摘要卡 |
| **G14** | **晨起摘要退役 ≠ 注入源断裂**：`delta.md` 退役后，注入面「🧠 最近成长」改由**报告派生**，且**与报告提存段逐字一致** | 册四 | `inject-baseline-diff` 对拍 + 新增一致性机检（同函数派生） | ❌ 现由 `delta.md` 派生 |
| **G15** | **阈值可调且接线三处齐全**：`sleepUnusedDays`（缺省 **3**，1–30）在 **zod schema / `Config` 接口 / 返回值映射**三处齐备，且进阈值登记表 | 册四 | `check-threshold-registry` + 真机改值生效探针 | ❌ 无此键 |

---

## 2. 逐卡判据（现状 / 目标 / 先红方式）

### G0-G1 · 册零（L1 落盘修复）
| 项 | 内容 |
|---|---|
| **现状读数** | `distill-run` 累计：added 2130 · **failed 1679**；`fclass` = `dispatch-failed` **265 轮** / forced 16 / gate-reject 20 / json-parse 10（`ok` 仅 36） |
| **目标读数** | ① `appendRejected > 0` 的轮次里，**同主题的新索引行数 = 0**；② 失败清单在 L2 材料可核 |
| **先红方式** | 改造前跑一次真机蒸馏 ⇒ 审计里**没有** `appendRejected` 字段（断言失败） |
| **机检命令** | `node scripts/check-section-refs.mjs`（真库，须 0）· 审计聚合脚本（§4） |

### G2-G4 · 册一（L2 会话级复盘）
| 项 | 内容 |
|---|---|
| **现状读数** | `kind=session-review` 审计行 **0**；跨轮连续性只有同轮一行式清单（`distill-agent.ts:184-197`，超 cap 丢最早行） |
| **目标读数** | 满足双维判据的会话**恰好 1 行** `session-review`（复跑幂等 no-op）；材料段含 ①L1 全清单（含失败）②会话骨架 ≤80 轮 ③锚点 ≤12 段 ④召回 ≤20 行；校正数 ≥1（有可校正项时） |
| **先红方式** | ① 落地前该审计行必然为 0；② **幂等反例**：人为重放同一 `turn/end` ⇒ 不得产生第二行（若产生 ⇒ 红）；③ **越界反例**：构造"跨会话条目"注入 L2 ⇒ 必须被拒且 `outOfScopeTouched == 0` |
| **回退** | 开关 `enableSessionReview=false`（缺省 **关**，施工后手动开） |

### G5-G7 · 册二（S3 审查 + 压缩）
| 项 | 内容 |
|---|---|
| **现状读数** | 49 轮深睡：`principles` added **65** / replaced 8；`forgetCandidates 391 → forgetArchived 4`；`treeOps 0` / `pointerOps 0` / `converge 落地 0`；`release` 候选 **2254 未消费**；AGENT.md **263%** |
| **目标读数** | ① 影响账条数 **== 当日产出条数**（未裁决 0）；② `principles.added == 0`；③ `archive+compress > 0`；④ 压缩后**方向可读**（每条留"方向 + 指针"）且 `check-section-refs` 仍为 0；⑤ 归档**只归档不直删**（原文可回滚） |
| **先红方式** | ① 改造前 `audit/impact/` 目录**不存在**（断言失败）；② 压缩率为 0 的现状本身就是红（`forgetArchived 4 / 391`）；③ **回滚实证**：任取一条归档项 ⇒ 用归档文件还原 ⇒ 与压缩前逐字节一致 |
| **判据边界（Q3 答复）** | **只用确定性证据裁定**（注入/真读/回收/冷热）；"帮上忙"类**代理指标只作排序**，不得单独触发 archive |

### G8-G9 · 册三（协调机检 + 可见面）
| 项 | 内容 |
|---|---|
| **现状读数** | 无层间交接机检；无三层只读投影 |
| **目标读数** | 机检件入 `CHECKS`（145 → 147），含**反例自证 3 组**：① L2 材料缺 L1 失败清单 ⇒ 红 ② S3 有未裁决产出 ⇒ 红 ③ 交接物字段缺失 ⇒ 红；投影只读、注入面逐字节不变 |
| **先红方式** | 件落地后**先跑夹具**（构造缺清单/漏裁决）⇒ 必须红，再跑真库 ⇒ 绿 |

---

### G10-G13 · 册四（睡眠汇报 + 问题统计 + UI）
| 项 | 内容 |
|---|---|
| **现状读数** | 只有 `suite/knowledge/delta.md`（**最新一轮投影，会被覆盖**）；`unused/counter` 类问题**零落点**；面板无汇报视图 |
| **目标读数** | ① 每轮睡眠产出**一份**报告（同日多轮 ⇒ 同日文件内追加，**不覆盖**）；② `sleep-reports.jsonl` 每轮一行；③ 报告五段齐（区间/提存/压缩/**问题标记**/统计），问题段**写明"未处理"与原因**；④ `/sleep/reports` 与 `/sleep/issues` 端点 200 且入契约表；⑤ 面板视图渲染（日历左列 + 汇报右列 + 统计卡） |
| **先红方式** | ① 落地前 `reports/sleep/` **不存在**（断言失败）；② **"不删除"反例**：连续两轮 ⇒ 第一轮报告**逐字节不变**（若被覆盖 ⇒ 红）；③ **"只标记不处置"反例**：构造一条 `unused` 条目 ⇒ 断言其**仍在原位**（未被 archive）、且 `sleep-issues.jsonl` 有 open 行（若被归档 ⇒ 红）；④ **UI 先红**：视图未落地时 `ui-geo-regress` 的该断言不存在 ⇒ 先加断言必红，再加实现 |
| **UI 判据（双轨）** | **图证**（`--shots`：运行总览卡内可见今日计数与最近期次）+ **DOM 几何**（卡高 >0、在首屏内、计数与 `/sleep/issues` 返回**逐值一致**）——引用仓内既有纪律：**纯像素判断对折叠线以下系统性失明**（S-P1d 定案） |
| **退役专项（G14）** | `delta.md` 退役前后各跑一次 `inject-baseline-diff`：**「🧠 最近成长」两行的源指针必须一致**（若变空/变短 ⇒ 红）。**先红方式**：先删 `delta.md` 不接派生 ⇒ 对拍必红 ⇒ 证明该断言有效 |
| **不得越界** | 报告的生成**不得**成为睡眠的新增失败点：落盘失败 ⇒ 记 log、不阻断、下一轮报告里补记（**"批处理水位即真相"** 同款纪律：产物没落盘就不许当成功） |

---

## 3. 全局门（七层，收尾必跑）

| 层 | 命令 | 通过标准 |
|---|---|---|
| ① 仓内绿 | `npm run typecheck && npm run build && node scripts/check-runner.mjs` | 零错；全量 **0 fail**（件数随新增上升） |
| ② 注入面 | `node scripts/inject-baseline-diff.mjs` | 三层**不改注入编排** ⇒ 仅因库内容变化而变；变化须逐条核对后**重立基线** |
| ③ 库一致性 | `node scripts/check-record-parity.mjs` · `node scripts/check-section-refs.mjs` | 逐字节一致 · 棘轮 **0/0/0/0** |
| ④ 部署 | `node scripts/deploy-installed.mjs` → `check-installed-sync --strict` → `dev_reload_package` → `check-installed-features` | 逐件 sha 一致 · active · 标记齐全（新增 L2/S3 标记须登记） |
| ⑤ 真机证据 | 真机跑：L2 触发一次 + S3 一轮 | 审计三处齐全（`session-review` / `impact` / `deep-sleep`），且**未裁决 0** |
| ⑥ 契约与 UI | `check-panel-contract` + `gen-panel-contract --check` + `ui-geo-regress` | 若落 UI 须三者全过；不落 UI 则仅作零回归证明 |
| ⑦ 推送 + pin | `check-public-tree` → `git push`（本机代理）→ `git status -sb` → 改 profile pin | 无 ahead · pin 指向本轮终态提交 |

---

## 4. 复现命令（审计聚合，只读）

```sh
AUD="$USERPROFILE/.dsh/suite/knowledge/audit"
# L1：失败率与失败构成
node -e "const fs=require('fs');const r=fs.readFileSync(process.env.AUD+'/ledger.jsonl','utf8').split(/\n/).filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean).filter(x=>x.kind==='distill-run');const f={};for(const x of r)f[x.fclass||'(无)']=(f[x.fclass||'(无)']||0)+1;console.log('轮次',r.length,'fclass',f,'added',r.reduce((s,x)=>s+(x.added||0),0),'failed',r.reduce((s,x)=>s+(x.failed||0),0))"
# S3：通道构成（新增 vs 维护）
node -e "const fs=require('fs');const r=fs.readFileSync(process.env.AUD+'/ledger.jsonl','utf8').split(/\n/).filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean).filter(x=>x.kind==='deep-sleep');const s={};for(const k of ['added','replaced','forgetArchived','forgetKept','treeOpsTried','pointerOpsTried','releaseCandidates'])s[k]=r.reduce((a,x)=>a+(x[k]||0),0);console.log('轮次',r.length,s)"
# L2：复盘审计（落地后应有且幂等）
node -e "const fs=require('fs');const r=fs.readFileSync(process.env.AUD+'/ledger.jsonl','utf8').split(/\n/).filter(l=>l.includes('session-review'));console.log('session-review 行数',r.length)"
# 影响账（落地后）
ls "$AUD/impact" 2>/dev/null | tail -3
```

---

## 5. 交付物清单（预期）

| 产物 | 册 | 说明 |
|---|---|---|
| `src/distill-write.ts` / `src/distill-agent.ts` 增量 | 册零 | append/index 联动 + 失败清单入材料；审计 `appendRejected` |
| `src/session-review.ts`（新件） | 册一 | L2 触发/材料/产出/校正；**新模块**（不塞 `distill-agent`，守行数棘轮） |
| `src/impact-review.ts`（新件） | 册二 | 影响账（确定性证据聚合）+ 压缩裁决 |
| `src/deepsleep-*.ts` 收窄 | 册二 | `principles` 新增关闭；`profileOps` 仅 replace/merge |
| `scripts/check-layer-handoff.mjs`（新件） | 册三 | 层间交接机检（入 `CHECKS`） |
| 验收记录 | — | 本册逐卡读数 + 先红证据 + 落地差异（**不谎报**） |

---

_建立 2026-09-19 · S2S3 验收册 v1 · 与方案册成对；两册冲突**以本册判据为准**。_
