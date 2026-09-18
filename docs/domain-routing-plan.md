# 按域路由的注入选行 · 方案（v1 · 待审）

> 目标：把「单一余弦池竞争」改为「**按域路由**」——每个域走**它自己适配的判据**，互不挤占。
> 依据：2026-09-18 圆桌后续实测（本文档所有数字均为实测，标注出处）。

---

## 一、判因（实测三证据）

### 证据 1 · 域间语义判别力差 2 倍以上

query = `开发一个运行在 Windows 的程序，需要本地跑模型`，逐域最强余弦（bge-m3，1024 维）：

```
[路径]  0.556   [env]   0.529   [原则]  0.512   [教训]  0.510
[lesson]0.505   [flow]  0.504   [环境]  0.495   [tool]  0.489
[习惯]  0.485   [偏好]  0.475   [经验]  0.461
[硬件]  0.394 ★  [身份]  0.386 ★
```

⇒ `[硬件]/[身份]` 这类**环境常量**，向量**几乎无感**（0.39/0.39，而阈值 `tOn=0.65` / `familiarThreshold=0.55`）。
但它们的相关性是**逻辑上的**（本地跑模型 ⇒ 看显存）——**向量算不出这个推理，域规则能写出来**。

### 证据 2 · 混池导致系统性偏斜

60 条真实 query：**词法零命中 45%**（平均 3.6 行 / cap 10）。
域分布 `tool 78 · 环境 41 · lesson 27 · 原则 26 · 教训 15 · env 12 · 路径 9 · flow 8 · 偏好 2`。
⇒ 语义可分性强的域系统性胜出，小域/弱语义域永远垫底。

### 证据 3 · 本该常驻的域正被"召回化"处理

`[硬件]/[身份]/[偏好]/[习惯]` 全在 `USER.md`（8 条），而注入侧画像配额 `carriers.profile = 6`
⇒ **2 条被挡**。且 `readCarrier` 的取法是"同标签取最近 1 条 + 余额补最近无标签行"——**弱语义域在配额里争抢**。

### 现成先例（不是新机制）

`dynamic-select.ts:72-76` 已有 `process` 槽，注释写明判因：
> `[路径]` 原经 R 层 gated 相关性召回，与知识索引行争同一 dynamic 预算 ⇒「可复用步骤」被"内容相关性"挤掉。
> 本槽给它**优先进位**（与 `situation`/`serendipity` 同构的理由：**改权重解决不了，只能分槽**）。

⇒ 本方案 = **把「分槽」从 1 个域推广到全部域**，并把判据从代码搬进注册表。

---

## 二、域分类（**只有 7 个域真在竞争**）

⚠ **先纠一个口径**（自查实测）：注册表里 `inject='always'` 的域**已在恒定面**，它们**根本不参与 dynamic 召回竞争**。
余弦高低对它们**无意义**（不被召回管道处理）。真正参与竞争的只有 **7 个 `gated` 域**：

```
实测（criteria.json carriers.tags，inject==='gated'）：
  [经验] layer=E          [教训] layer=E          [路径] layer=R  mclGate=true
  [env]  layer=E          [tool] layer=E          [flow] layer=E   [lesson] layer=E
```

⇒ **问题域收窄为这 7 个**，而它们的实测行数：`lesson 111 · 教训 50 · tool 33 · env 22 · flow 19 · 路径 15 · 经验 1`。

### 修正后的三档路由

| 路由 | 域 | 现状 | 判据 | 依据 |
|---|---|---|---|---|
| **`always`** 常驻（不动） | `身份` `硬件` `偏好` `习惯` `原则` `使命` `边界` `性格` `认知` `演化` | 已在恒定面 | **不判断** | 余弦与它们无关（0.386–0.512，但**不被召回管道处理**） |
| **`task`** 任务门控 | `路径` | `gated` + `mclGate` | **任务类型门控**（已有 `process` 槽实现） | 余弦 0.556 但**被内容相关性挤掉**（`dynamic-select.ts:72-76` 原话） |
| **`recall`** 语义召回 | `lesson` `教训` `tool` `env` `flow` `经验` | `gated` | **向量+词法融合，按域配额** | 余弦 0.46–0.53，向量有效；它们是"遇过什么坑"，与任务语义接近 |

### 真正要解决的是「6 个 recall 域争一个池」

```
recall 域候选合计 = 111 + 50 + 33 + 22 + 19 + 1 = 236 行
dynamic 预算      = 600 字符 ≈ 12 行
覆盖率            = 12 / 236 = 5%
```
⇒ **6 个域抢 12 个位子**。大域（`lesson` 111）在全局余弦排序下系统性占优。

### `[环境]` 与 `[env]` 的登记漂移（**实测确证**，建议 H2 一并处置）

```
实测（node 读 MEMORY.md，按指针目标分组）：
  [环境] 61 条 + [env] 22 条  →  **全部 73 条指向 notes/env.md**   ★同一信息源

注册表待遇却不同：
  [环境]  layer=P  inject=always   ← 计为恒定面
  [env]   layer=E  inject=gated    ← 走召回

而恒定面配额 injectProfileRows = 6 条/档
  ⇒ 61 条 always 条目**远超配额**，实际会被大量裁切（静默丢失，仅留一句"另有 N 条未进入"）
```

⇒ **这不是"设计选择"，是登记漂移**：同一份 `notes/env.md` 的内容被标了两种标签、走了两条管道，
其中一条（always）因配额而**大面积失效**。

**建议**：`[环境]` 归一到 `recall` 路由（`inject` 改 `gated` 或保留 `always` 但加 `route:recall`），
与 `[env]` 合并为同一域待遇。**这是本方案能顺带修掉的一个真缺陷。**

---

## 三、注册表改动（单一事实源）

### 现状字段

```json
"carriers": {
  "tags": {
    "身份": {"layer":"P","form":"index","inject":"always"},
    "路径": {"layer":"R","form":"index","inject":"gated","mclGate":true},
    "lesson": {"layer":"E","form":"index","inject":"gated"}
  }
}
```
字段全集：`layer` `form` `inject` `new` `mclGate` `note`

### 新增字段 `route`（三值）

```json
"身份":  {"layer":"P","form":"index","inject":"always","route":"always"},
"路径":  {"layer":"R","form":"index","inject":"gated","mclGate":true,"route":"task"},
"lesson":{"layer":"E","form":"index","inject":"gated","route":"recall"},
"环境":  {"layer":"P","form":"index","inject":"always","route":"recall"}   ← 见下方例外
```

**为什么新增字段而不是复用 `inject`**：
- `inject` 是**二值**（`always|gated`），语义是"是否进恒定面"，已被 6 处消费
- 改二值语义 = 破坏既有契约；**新增字段是正交演进**

**为什么不是"按 layer 自动推导"**：
- `环境` 是反例 —— P 层却应走 recall（62 条，靠召回取才合理）
- `路径` 是 R 层但走 task
⇒ **必须显式声明，不能推导**（这正是"注册表驱动"的价值）

### 新增 `routeQuota`（可选，按域配额）

```json
"surface": {
  "injection": {
    "budgetChars": 4000,
    "dynamic": 600,
    "routes": {
      "always": {"enabled": true},
      "task":   {"enabled": true, "topN": 3},
      "recall": {"enabled": true}
    }
  }
}
```

---

## 四、选行算法（`dynamic-select.ts` 改造）

### 现状

```js
// 三通道叠加，单一 cap 竞争
picked = warmRecall ∪ recallIndex ∪ freshSlots ∪ 基线补齐
picked.slice(0, cap)   // cap = 10 行
```

### 改造后

```
① always 路由（不判断）
   从 P 层 always 域取行 → 独立配额（现由 stable 面承载，本路由不改它）

② task 路由（任务门控，按域独立）
   for (const tag of TASK_DOMAINS) {          // 路径 / 原则
     rows = 该域的行，按 mclGate / 任务类型筛
     out.push(rows.slice(0, topN))            // 每域独立 topN，不吃 recall 配额
   }

③ recall 路由（语义召回，按域独立）
   for (const tag of RECALL_DOMAINS) {        // lesson/教训/tool/env/flow/经验/环境
     rows = 融合召回结果 ∩ 该域              // ← 关键：在域内排序，不跨域竞争
     quota = clamp(ceil(cap × 该域行数占比), 1, topN_max)
     out.push(rows.slice(0, quota))
   }

④ 余额回收
   某域零命中 ⇒ 配额回流给其余域（保证不浪费）
```

### 关键差别

| | 现状 | 改造后 |
|---|---|---|
| 排序 | **跨域全局余弦** | **域内排序 + 域间配额** |
| 小域 | 被大域挤掉 | 配额兜底，至少有机会 |
| 弱语义域 | 永远垫底 | 走 `always`/`task`，不参与余弦竞争 |

---

## 五、UI / RPC 影响面（**重点**）

### 现有契约（`src/panel-contract.ts`）

```ts
{ path: '/inject/preview', summary: '热记忆注入预览' },   // 返回 { text, q, supplyUsage }
{ path: '/inject/stats',   summary: '注入统计' },         // 返回 { calls, supplyUsage, cache, preStep }
```

### 需要新增/扩展的三处

**① `supplyUsage` 增加按域分解**（`supply-ledger.ts:24 SupplyLedgerStats`）

```ts
interface SupplyLedgerStats {
  // ...现有字段
  /** 新增：按域记账 —— 每域取了几个行/几个字符/被挡几个 */
  byDomain?: Record<string, { kept: number; chars: number; dropped: number; route: string }>
}
```
用途：UI 能显示"这一轮每个域各进了几条"，**这是本方案可观测性的核心**。

**② `/inject/preview` 增加 `routes` 视图**

```json
{
  "text": "...",
  "q": "...",
  "supplyUsage": { /* 含 byDomain */ },
  "routes": {
    "always":  { "domains": ["身份","硬件","偏好","习惯"], "rows": 6, "chars": 430 },
    "task":    { "domains": ["路径","原则"],             "rows": 2, "chars": 180 },
    "recall":  { "domains": ["lesson","tool","env"],     "rows": 4, "chars": 390 }
  }
}
```

**③ UI 面（`src-client/`）需改的**

| 位置 | 改动 | 必要性 |
|---|---|---|
| `panes-overview.js` | KPI 卡增加"按域分布" | 建议 |
| `panes-observe.js` | 注入观测表加一列 `route` | **必需**（否则看不出路由生效） |
| `panes-toggles.js` | 每条域路由的开关 | 建议（回滚粒度） |
| `i18n-dict-*.js` | 新增标签的中英词典条目 | **必需**（`check-i18n-*` 5 道门禁会红） |

⚠ **契约门禁**：`check-panel-contract` + `gen-panel-contract --check` 要求**契约 ⟷ 实际注册双向一致**，
且"**凡读 body 必须有契约**"。⇒ 新增 `routes` 字段**必须先进 `panel-contract.ts`**，不能只改 handler。

---

## 六、分期落地（四阶段，每阶段可独立验证）

| 阶段 | 交付物 | 验收判据 | 阻塞 | 回滚 |
|---|---|---|---|---|
| **P0 注册表** | `carriers.tags` 加 `route` 字段（13 条）· `surface.injection.routes` 加配置 | `check-criteria` PASS · `gen-criteria --check` 新鲜 · **逐条列出 13 条归类供用户审** | 无（纯数据） | 删字段 |
| **P1 选行改造** | `dynamic-select.ts` 按路由分桶 + 域内配额 | **等价性**：对 `recall` 域的既有行为不变（用现有 60 条 query 做前后对比） | 需 P0 | 保留旧函数分支 |
| **P2 记账** | `supply-ledger` 加 `byDomain` · `/inject/preview` 加 `routes` | `test-usage-truth` PASS · 逐字节对照：**新增字段不改 text 输出** | 需 P1 | 字段可选 |
| **P3 UI** | `panes-observe` 加 `route` 列 · i18n 词条 | `check-panel-contract` + `gen-panel-contract --check` + 5 道 i18n 门 · `ui-geo-regress` 出图 | 需 P2 | 隐藏列 |

**硬依赖**：P0 → P1 → P2 → P3（严格串行，每步有独立验收）。
**可并行**：P3 的 i18n 词条可与 P2 并行准备。

---

## 七、未决项（需用户拍板）

| # | 问题 | 选项 | 建议 |
|---|---|---|---|
| **H1** | 13 个域的归类是否认可？ | 见 §二表 | 先出**完整归类表**给你逐条审 |
| **H2** | `环境` 标签歧义（P 层 62 条 + USER 侧 1 条） | ①按 layer 分流 ②统一 recall ③统一 always | 建议 ① |
| **H3** | `recall` 路由的域配额算法 | ①按行数占比 ②均分 ③固定 topN | 建议 ①（自动适应库变化） |
| **H4** | 是否要"逐域开关"（UI 粒度） | 是 / 否 | 建议是（回滚粒度） |
| **H5** | `dynamic` 预算是否同步上调？ | 4000→5000 / 不动 | **不动**（先看按域路由的效果，避免两个变量同时改） |

---

## 八、与既有机制的关系（不重复造轮子）

| 既有机制 | 本方案如何复用 |
|---|---|
| `process` 槽（S4-3） | **推广为 `task` 路由**，逻辑不变，只是从"硬编码 `[路径]`"改为"注册表声明" |
| `situation` 槽（P3） | 不动（情境键匹配是另一维度） |
| `serendipity` 槽（G3） | 不动 |
| `carriers.tags` 注册表 | **扩字段**，不新增数据文件 |
| `supply-ledger` 去重账 | 复用（按域记账是同结构的扩展） |
| `mclGate` 标记 | **task 路由直接复用**（已登记在 `路径`/`原则`） |

---

## 九、证据索引（本文档所有数字的出处）

```
逐域余弦        自跑 bge-m3（Ollama 127.0.0.1:11434）对 MEMORY/AGENT/USER 三索引实测
域行数分布      node 读 utf8 统计三索引 [tag] 行
60 条基线       最近 12 个真实会话的 user/message（source.kind==='user'）
预算公式        src/supply-assembly.ts:61 budgetOf
注册表结构      skill/engine/criteria.json carriers.tags
RPC 契约        src/panel-contract.ts:91-92
账本结构        src/supply-ledger.ts:24
process 槽先例  src/dynamic-select.ts:72-76
```
