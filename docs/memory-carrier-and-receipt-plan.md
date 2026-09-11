# 记忆核心 v2.1 目标架构：载体契约 + 写入回执 + 账本对账

> **性质**：架构级根因方案（先文档后代码，守 arch-view「架构先行协议」）。
> **判因**：本轮诊断（深睡产出停滞）暴露的不是"某个函数写错"，而是**写面与读面没有共享同一个"可注入性"定义**、**门禁失败无回执**、**产出健康度与账本闭合无人对账**——所以症状会以"改了 A 又冒出 B"的形式反复出现。
> **不变量**：单库化 + 多级指针 · 深睡 **done 才推水位 / failed 回滚** · 运行态不入库 · 零硬编码 · **单一实现** · 写门纪律 · 不新增常驻注入点（UI/审计走按需端点）。
> **与 v2 的关系**：v2 解决了「**判据**可测」（注册表 → 生成 → 机检 → 台账）；v2.1 解决「**写入**可测」，两者同构 —— 判据能对账，写入也必须能对账。

## 1. 根因（四缺口，逐条有行号/实测）

### R1｜写面 ⊇ 读面：**载体没有契约**
- 写入通道 **6 个**：`appends`/`newIndex`（`writeDispatch` → `memory-append.mjs`）· `profileOps`（`writeProfileLine`）· `principles`（`applyPrinciples` 1491）· `pointerOps`（`applyPointerOps` 1525）· `treeOps`/`forgetOps`（`treeops.ts`）。
- 读取面（决定"可见"）只认一种形态：`panel.ts:277`
  ```ts
  const readIdx = (name) => …filter((l) => /^\[.+\]/.test(l))   // 只收「以 [tag] 开头」的行
  ```
  ⇒ **画像行（`- … ← 源: …`）在写侧被承认、在注入侧被丢弃**；而 `panel.ts:143-144` 的载体模板与 spec §3.1 明写「**画像行全量注入**」——**声明与实现矛盾**。
- 实测（本轮）：AGENT.md 注入可见 **6** / 画像行 **4（不可见）**；USER.md 可见 **8** / 画像行 **5（不可见）**；MEMORY.md 43 / 0。
- 后果：深睡/蒸馏写进去的成长**永久不可见**；用户/agent 都只能靠"感觉"判断有没有成长 —— 这正是"感觉没变化"的结构来源。

### R2｜门禁**整轮全拒** + 失败**无回执**
- `applyPrinciples`（`distill.ts:1481-1515`）：N 条合并成**一次** gate 调用；`gate ≠ 0` → **整轮 0 落地**（且 `added` 记的是 **gate 之前的试探数**）。
- 审计实测：`09-09T22:51 added=1 gate=指针悬空/未注册(exit2)`、`09-10T13:29 **added=4** gate=行格式违规(exit4)` —— 两轮**实际落地 0 条**，但账本看上去"加了 5 条"（典型**字段语义误导**，与 `[经验] 记忆脚本参数解析坑` 同型）。
- 拒收的**被拒行原文**只进 `log()`，**不进审计** ⇒ 事后无法定位是"指针悬空"还是"行格式"。

### R3｜产出健康度**不可见**（触发与判据是硬阈值）
- 触发：**全部根会话停滞 ≥3h**（实测 `lastDeepSleepAt=09-11 10:38`、`lastActivityAt=14:54`、`nextEligibleAt=17:54`）⇒ 正常使用期几乎不触发；判据：原则需**同主题 ≥3 条痕迹**。
- 34 次深睡：`no-traces 16` / `error 5` / `no-parent 4` / `aborted 1` / `no-op 5` / **成功 2**（09-09 两次，共 +4 条）。**没有任何面板字段**能回答"深睡最近有效产出是什么时候 / 连续空转几轮 / 被拒率多少"。

### R4｜账本**不闭合**
- 681 行事件流，但从未做「**主档实际行数 == 各通道成功写入累计 − 合并/退役/归档**」的对账 ⇒ 写入丢没丢、重没重，只能人工推。v2 建立了"判据对账"，**没有建立"写入对账"**。

## 2. 目标架构（v2 四层 → v2.1 六件）

```
① 判据注册表 criteria.json（v2 已建）
        │ 生成投影 + 机检（v2 已建）
        ▼
② 载体契约 Carrier Contract（新）      ← 消灭 R1
   每个写入目标声明 carrier ∈ {injectable-index | injectable-profile | notes-detail | audit-only}
   读取面必须实现每种 injectable carrier 的渲染器；机检门校验「carrier ↔ 渲染器」全覆盖
        ▼
③ 写入回执 Write Receipt（新）         ← 消灭 R2
   每次 attempt → audit/write-ledger.jsonl 一行：
   {at, channel, carrier, target, verdict: written|rejected|skipped, reason, gateExit, line(原文), hash}
   · 逐条裁决（一条不合格不再整轮丢弃）
   · judgement-ledger 与 write-ledger 同址同版本字段（判据 + 写入 = 完整决策链）
        ▼
④ 账本对账 Reconciler（新）            ← 消灭 R3/R4
   scripts/memory-reconcile.mjs：
   (a) 行数闭合：主档实际行数 = write-ledger written 累计 − 合并/退役/归档
   (b) 产出健康度：上次成功写入 / 连续空转轮数 / 被拒率 / 材料量分布 / 下次可睡
   (c) 载体可见性：每个 carrier 的行数 vs 注入可见性（不可见 > 0 即告警）
        ▼
⑤ 呈现：运行面「记忆产出健康」卡片 + 阈值告警（连续 N 轮空转 / 被拒率 > X% / 载体不可见）
⑥ 触发与判据数据化：criteria.json 增 consolidate.trigger.*（idleMs / newTracesMin / 手动触发）
```

**为什么这样能"根本"解决**：
- R1 → 载体**必须声明**且**必须有渲染器**（机检强制），"写了看不见"结构上不可能再出现；
- R2 → 每条写入都有**回执**（含原文与理由），"被拒却不知道"不可能；
- R3/R4 → **写入可对账**，与 v2 的判据对账拼成完整闭环（判据 → 决策 → 写入 → 账本）。

## 3. 迁移路径（零行为 → 加观测 → 才改行为）

| 步 | 内容 | 行为变化 | 回滚 |
|---|---|---|---|
| **M1 契约化** | `criteria.json` 增 carrier 声明 + 生成投影 + **`scripts/check-carriers.mjs`**（机检"每个 carrier 有渲染器 / 每个渲染器都有 carrier"） | **零**（只登记，不改注入） | 删注册表字段即回滚 |
| **M2 回执 + 对账** | 6 通道写入处补回执（含原文/理由/gateExit）· `memory-reconcile.mjs` · 面板健康卡片 | 零（只多写审计 + 只读视图） | 关 `writeLedger=false` |
| **M3 可见性 + 数据化（唯一行为变更）** | **读取面渲染画像行**（按档位 ≤3 条/档，取最近更新；预算实测 +360 字符 ≈ 12%）· 触发/判据改读注册表 | 注入面新增画像行；触发阈值可调 | 注册表 `surface.injection.carriers.profile=0` 即回到今日行为 |

**本轮已给出的 A+B（readIdx 双收 + 审计字段拆分）正是 M1/M2 的即时子集** —— 可作为 v2.1 的第一批落地，不必等全案。

## 4. 风险与明确不做

**风险**：① 注入预算 +12%（实测 9 行 ≈360 字符；超预算则按"最近更新 + 命中次数"裁到 ≤2 条）；② 回执写入频率上升（每通道每次写入 1 行，量级与现有 audit 同阶）；③ 逐条裁决会**改变"整轮原子性"**（原来一轮全成或全败）——需保留"单条 gate 失败不影响同轮其他条目"的语义，并在回执里可见。

**不做**：不另起第二套记忆库/不改存储形态（Markdown 单库是资产）· 不引向量库/图库 · 不动深睡水位语义 · 不自动重启宿主 · 不在注入面新增常驻块（健康卡片走按需端点）。

## 5. 验收（可测，非"看着好"）

1. `check-carriers` 常绿：**每个 carrier 都有渲染器**，且**每个渲染器都有 carrier 声明**（与 `check-criteria` 同级纳入 `npm test`）。
2. **账本闭合差异 = 0**：`主档行数 == write-ledger.written 累计 −（合并+退役+归档）`（允许显式豁免表，豁免项必须列出）。
3. **画像行实测可见**：注入文本含 `← 源:` 行（用 `/inject/preview` 或注入缓存实测断言）。
4. **被拒可定位**：任取一次 gate 拒收，能从 `write-ledger` 直接读到**被拒行原文 + 理由 + exit**。
5. **空转告警**：连续 ≥N 轮 no-op/no-traces 时，运行面卡片与审计同时给出提示。
6. 现有门全绿：`npm test`（判据门 + 40/30/18/18 + check-hardcode）· 架构档 9/9 新鲜 · 锚点 100%。

## 6. 交付阶段（文件级）

| 阶段 | 交付 | 落点 |
|---|---|---|
| V1 | carrier 契约 + 机检门 | `skill/engine/criteria.json`（carriers 字段）· `scripts/check-carriers.mjs`(新) · `package.json` test 链 |
| V2 | 回执 + 对账 | `src/distill.ts`（6 通道回执）· `src/treeops.ts`（treeOps/forgetOps 回执）· `scripts/memory-reconcile.mjs`(新) · `src/panel.ts` `/reconcile` + 运行面卡片 |
| V3 | 可见性 + 触发数据化 | `src/panel.ts`（`readIdx` → carrier 渲染，画像行 ≤3/档）· `src/distill.ts`（触发/判据读注册表）· `client.js`（健康卡片渲染） |
| V4 | 文档与治理 | `skill/memory-whitelist-spec.md`（§1 增载体契约）· `engine/distill-contract.md` v8 · 本档 + ADR |

_建立 2026-09-11 · 依据：本轮深睡诊断硬证据（`panel.ts:277` · `distill.ts:1481-1515` · `/deepsleep` 状态机 · 681 行审计账本）+ 写入通道枚举 · 本轮未改任何代码。_
