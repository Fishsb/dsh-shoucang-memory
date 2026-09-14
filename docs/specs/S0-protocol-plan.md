# S0 · 协议层方案（内容类型契约）

> **板块职责**：定义信息类型 ↔ 生产/载体/消费 的映射。**不实现任何读写**。
> **依赖**：无（最先）。**被依赖**：S1/S2/S3/S4 全部。
> **上游**：`../specs/INDEX.md` §3 不变量 · `../master-architecture-plan-2026-09-14.md` §3.2。
> **证据**：【实测】命令 ·【读码】源码 ·【注册表】`criteria.json`。

---

## 1. 为什么必须先做这一块

**三处定义当前互不引用**【读码】：

| 分散处 | 内容 | 位置 | 管什么 |
|---|---|---|---|
| ① 载体契约 | 15 标签 × `layer(P/R/E)` × `form` × `inject` | 【注册表】`criteria.json#carriers` | 哪些标签能进哪个注入面 |
| ② Record kind | `blank/structure/procedure/persona/fact/prose` | `record-store.ts:147-155` | 数据库里的类别 |
| ③ md 行形态 | `[tag] … → notes/x.md §y` / `- … ← 源:` | `targets.ts:281-306` | 人读文件的语法 |

`kindOfLine` 从 ① 的 `layer` 派生 ②（`:150-153`）；但 **② 中 7 类环 kind 在 ① 里没有对应标签**（`carriers` 中无 `decision`/`episode`/`valence`/`relation`/`commitment`/`association`/`outcome`）⇒ 环记录既不在恒定面、也不在相关性面。

⇒ **"调整内容类型"在现有结构里没有落点**。本板块就是给它落点。

---

## 2. 目标：契约层

### 2.1 落点（方案 A）

| 件 | 内容 |
|---|---|
| `skill/engine/criteria.json#contentTypes` | 契约数据（唯一事实源，守 B4） |
| `src/content-types.ts` | **纯函数、零 IO**：读取契约 + 查询接口（`typeOf(kind)` / `typesFor(layer)` / `reachableTypes()`） |
| `scripts/check-content-types.mjs` | 机检（登记 `check-runner`，守 B7） |

**不选 B/C 的理由**：B（新建 `content-types.json`）引入第二个事实源，与 B4 冲突；C（塞进 `carriers`）语义混装，且 `check-carriers` 的三字段校验会失守（见 `master-architecture-plan` §3.2）。

### 2.2 契约字段（每类信息一行）

```jsonc
"contentTypes": {
  "<typeId>": {
    "recordKind":  ["<Record kind>"],   // ② 的入口；可多对一
    "carrier":     ["<md 标签>"],        // ① 的入口；无投影则为 []
    "form":        "index|profile|ring|notes|none",  // ③ 的形态
    "producers":   ["distill|deepsleep|manual"],     // 谁产它
    "projection":  "md|none",            // 决定可达性
    "consumer": {
      "layer":     "outer|middle|inner|none",  // 三层中的哪层
      "timing":    "session-start|task-start|per-step|on-demand|none",
      "criterion": "always|relevance|situation-key|due|none"
    },
    "budget":      "stable|dynamic|oneshot|mcl|situation|process|none",
    "reachable":   true|false,
    "why":         "不可达时的原因（人读）"
  }
}
```

### 2.3 现有类型枚举（S0 必须覆盖全部）

| typeId | recordKind | carrier | projection | consumer.layer | timing | criterion | budget |
|---|---|---|---|---|---|---|---|
| `principle` | persona | 原则 | md | **outer** | session-start | always | stable |
| `path` | procedure | 路径 | md | **middle** | task-start | relevance | **process（新）** |
| `preference` | persona | 偏好/习惯 | md | outer | session-start | always | stable |
| `boundary` | persona | 边界 | md | outer | session-start | always | stable |
| `evolution` | persona | 演化 | md | outer | session-start | always | stable |
| `fact` | fact | 其余标签 | md | inner | per-step | relevance | dynamic |
| `lesson` | fact | lesson 等 | md | inner | on-demand | relevance | dynamic |
| `episode` | episode | —— | **none** | inner | per-step | situation-key | situation |
| `decision` | decision | —— | none | inner | per-step | situation-key | situation |
| `outcome` | outcome | —— | none | inner | per-step | situation-key | situation |
| `valence` | valence | —— | none | inner | per-step | situation-key | situation |
| `relation` | relation | —— | none | inner | per-step | situation-key | situation |
| `commitment` | commitment | —— | none | **middle** | on-demand | **due** | **process（新）** |
| `association` | association | —— | none | inner | per-step | situation-key | situation |

> `blank` / `structure` / `prose` 为**结构性记录**，不属"信息类型"，契约中标 `consumer.layer = "none"`（不注入）。

---

## 3. 关键设计决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 契约放在 `criteria.json` 内（不新建文件） | 守 B4「判据唯一事实源」；避免第二事实源 |
| D2 | 新增 `process` 预算槽（中层专用） | 依据注册表既有纪律「改权重解决不了，只能分槽」（`situation`/`serendipity` 先例）；中层供给与"像不像任务文本"无关，混入 dynamic 必被挤掉 |
| D3 | `reachable` 是**可机检字段**，不是注释 | 现状"某类能否被消费"靠人读代码推断（G1/G10 皆因此） |
| D4 | `commitment` 归 **middle/on-demand/due**（而非 inner/situation-key） | 到期是**时间线索**不是情境线索；前瞻记忆须线索驱动，而"到期"本身即线索 |
| D5 | **不新增 kind、不新增环**（守 B6） | 契约只做既有 13 类的映射声明 |

---

## 4. 施工卡

| 步 | 动作 | 落点 | 约束 |
|---|---|---|---|
| **S0-1** | 在 `criteria.json` 增 `contentTypes` 节，填写 §2.3 全部类型 | 注册表 | 不删不改既有 `carriers` 节 |
| **S0-2** | 新建 `src/content-types.ts`：纯函数 + 查询接口 | `src/` | **零 IO、零依赖**；实现函数模块级（守 B1）；导出 `createContentTypesApi(d)` |
| **S0-3** | 新建 `check-content-types.mjs` 并**登记** `check-runner.mjs#CHECKS` | `scripts/` | 未登记 = 等于没写（B7） |
| **S0-4** | `check-criteria` 容纳新节形态（若其 schema 校验会拒） | `scripts/` | 不得放宽既有校验（棘轮只收紧） |
| **S0-5** | 契约投影进 `docs/ARCHITECTURE.md`（生成或手写 + 机检守） | `docs/` | 投影禁手写（B4）——若不生成，须在验收中说明 |

**I1/I2 警示**【实测】：`applyForgetOps` = 120/120 顶格、`mountDistillEvents` = 123 行 ⇒ **S0-2 的装配函数必须新建且 ≤120 行**，依赖窄传 ≤12 字段。

---

## 5. 验收方案

见 **`S0-protocol-acceptance.md`**（5 类断言 + 六条口径）。

---

_建立 2026-09-14 · S0 方案 v1。_
