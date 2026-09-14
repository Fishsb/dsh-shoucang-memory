# UI1 · 面板架构与组件库对齐方案（2026-09-15）

> **定位**：后端历经 S0–S4 + S4R/S4X/S4Y/S4Z（协议层→库核心→生产→维护→消费→环/记录/读侧/观测），
> 而 **UI 侧自 S1–S4 重排后未再做架构级整理**。本方案一次性给出对齐决策。
>
> **配套验收**：`UI1-panel-architecture-acceptance.md`（**先出验收，再施工**）。

---

## 1. 盘点（实测，非印象）

### 1.1 UI 现状

| 维度 | 实测 |
|---|---|
| **板块** | **6 个**：记忆板块（索引/候选/笔记/归档/统计）· 内容环 · 记录与图 · 观测（日志/错误/运维/指标）· 装配 · 认知环旋钮 + 设置（注入画像/记忆容量/模型向量/后台调度） |
| **组件库覆盖** | `wa-tab-group` 8 · `wa-tab` 7 · `wa-button` 7 · `wa-progress-bar` 5 · `wa-switch` 5 · `wa-select` 3 · `wa-icon` 1 |
| **封装层** | `UI.button` 23 · `UI.select` 7 · `UI.tabs` 6（**已是单一入口**） |
| **原生残留** | `createElement('select')` 1 · `createElement('input')` 2（极少） |
| **规模** | **`body.js` = 5117 行**（单体）；`vendor.js` / `entry.js` 小 |

### 1.2 后端现状（供对齐）

38 条 RPC 路由 · 19 个领域模块（环 8 · 记录 2 · 读侧 3 · 观测 3 · 断言 2）。

### 1.3 **矛盾点（本方案的由来）**

| 侧 | 纪律 | 状态 |
|---|---|---|
| **后端 `src/`** | `check-module-growth`（**冻结棘轮**）· `audit-fnspan` · `audit-wiring` I1/I2 | ✅ 完备 —— 本轮实测多次被它拦下并逼出**领域接缝拆分** |
| **前端 `src-client/`** | **无** | ❌ **一条都没有** ⇒ `body.js` 涨到 **5117 行**无人知 |

⇒ **不是"要不要加板块"，而是工程纪律不对等**。加板块只会让单体更长。

---

## 2. 决策（架构级，非增量补丁）

### D1 · **UI 与后端同纪律**：给 `src-client/` 补机检（**最高优先**）

**为什么先做这个**：没有门，任何拆分都会**再长回去**（后端就是因为有棘轮，才被迫按接缝拆）。

- **U0-a** `check-module-growth` 的扫描面**扩到 `src-client/`**（同一份冻结棘轮机制，**先冻结当前值**，
  拆完再按棘轮下调 —— 与后端 `panel-shared` 847→765 同一套流程）。
- **U0-b** 新增 **`check-ui-components.mjs`**：断言「组件库使用」与「`vendor.js` 的 import」**双向一致** ——
  *import 了不用* 与 *用了没 import* 都要红（`vendor.js` 头注已声明该约定，但**无机检**）。

### D2 · **按领域接缝拆 `body.js`**（不是按行数硬切）

**接缝已在（等于现有板块）**，故拆法是**逐一搬移、零逻辑改动**：

| 新模块 | 内容 | 对应后端域 |
|---|---|---|
| `panes/memory.js` | 索引/候选/笔记/归档/统计（5 子 tab） | 记忆库 |
| `panes/rings.js` | 内容环 | `rings` / 各 `*-ring` |
| `panes/records.js` | 记录与图 | `record-store` / `assertion-graph` |
| `panes/observe.js` | 观测 4 子 tab | `event-envelope` / `audit-source` |
| `panes/assembly.js` | 装配 | `suiteAssemblyMatrix` |
| `panes/mcl.js` | 认知环旋钮 | `mcl` |
| `panes/settings.js` | 设置 4 tab | `panel-config` |
| `ui-kit.js` | `UI.*` 封装（button/select/tabs/switch/progress/field） | —— |

**约束**：搬移**不改行为** ⇒ 靠 `ui-geo-regress`（真机几何 **100 PASS**）作回归证据，
**而非靠"看起来没变"**。

### D3 · **组件库最后一公里**（不新增板块，只补覆盖）

- `UI.select` 有 **7** 处而 `wa-select` 仅 **3** 处 ⇒ 查差异，能走组件库的一律走。
- S3 曾因 **`wa-select` 依赖 `wa-icon`** 而回滚；**现已 import `wa-icon`** ⇒ **该约束已解除**，可推进。
- 但**不做**"为组件库而组件库"：`wa-icon` 仅 1 处 ⇒ 若某处只需箭头，**保留原生反而更简**（记录判因）。

### D4 · **新后端能力上观测面板**（可选，视需要）

S4Y/S4Z 新增了若干**已在跑但无 UI 呈现**的能力，按价值排序：

| 能力 | 现状 | 建议 |
|---|---|---|
| **`replayRecent` 跨日口径**（S4Y 修） | 只在深睡材料里 | ⭐ **值得上观测**：跨日回放是「拟人化」关键信号，人应看得见 |
| `check-public-tree` / `check-shared-fn` 等新门 | 开发侧 | ❌ 不需要 UI（属 CI） |
| 供给账 `supply-ledger` / 情境 `situation-key` | 部分在 `/arch/observability` | 视呈现完整度决定 |
| **UI 侧门禁状态** | 无 | ⭐ 可并入观测（**让"纪律"本身可见**） |

---

## 3. 施工顺序（**依赖决定，不可乱序**）

```
U0 门禁（否则拆完会长回去）
  └─ 冻结当前值 ⇒ 后续一切以"棘轮只许收紧"推进
       ↓
U1 抽 ui-kit.js（UI.* 先独立，拆 pane 才不会互相牵）
       ↓
U2 逐 pane 搬移（memory → rings → records → observe → assembly → mcl → settings）
       ↓ 每搬一块：跑 ui-geo-regress；棘轮随之下调
U3 组件库最后一公里（select 对齐；import ↔ 使用双向一致由 U0-b 守）
       ↓
U4（可选）新能力上观测面板
```

## 4. 非目标（明确不做）

- **不新增功能板块** —— 本轮是**架构对齐**，不是加功能。
- **不改视觉设计** —— 皮肤/令牌/布局**维持现状**（S1 已定，且有 `check-layout-px` 守）。
- **不引新组件库** —— 沿用 Web Awesome（`AGENTS.md` 规则 5：**不从零造轮子**）。

---

_建立 2026-09-15 · 配套 `UI1-panel-architecture-acceptance.md`（先出验收）。_
