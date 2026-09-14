# S0 · 协议层验收方案

> 配套：`S0-protocol-plan.md`。**任一项 FAIL 即 S0 未完成，不得启 S1。**

---

## 1. 验收断言（5 类）

### A 类 · 枚举完备性（机检 `check-content-types`）

| # | 断言 | 判据 | 反例（必须被抓住） |
|---|---|---|---|
| A1 | **② 的每个 Record kind 都在契约中出现** | 遍历 `record-store.ts` 的 kind 全集（含环 7 类），逐一能在 `contentTypes` 中命中 | 故意删掉 `valence` 条目 ⇒ 必红 |
| A2 | **契约中每个 `carrier` 标签都在 ① `carriers` 里登记** | 交叉比对 | 写一个不存在的标签 ⇒ 必红 |
| A3 | **每个 `recordKind` 至少被一个 type 声明**（无孤儿 kind） | 反向遍历 | 新增 kind 不登记 ⇒ 必红 |
| A4 | **无环引用**：`contentTypes` 内字段不得反向依赖消费侧模块 | 静态扫描（`src/` 内 `content-types.ts` 的 import 面） | —— |

### B 类 · 可达性一致性（**本板块的核心价值**）

| # | 断言 | 判据 |
|---|---|---|
| B1 | **`reachable:true` ⇒ 消费侧必须存在对应通路** | 按 `consumer.layer/timing/criterion` 反查代码：`always`→`indexRowInLayer`；`relevance`→`recallIndex/recallRanked`；`situation-key`→`ring-supply`；`due`→`dueRank`。**任一 `reachable:true` 的 type 找不到实现 ⇒ FAIL** |
| B2 | **`reachable:false` ⇒ 必须写 `why`** | 字段非空且能被人读懂 |
| B3 | **当前 105 条环记录的声明正确** | 契约中 7 类环 type 的 `projection` 必须为 `none`、`consumer.criterion` 为 `situation-key`（`commitment` 除外，见 D4）；与实际数据（`file=''`）一致 |
| B4 | **正面断言的反例测试** | 临时把 `supply-assembly` 类情形（"被 import 但输出不达注入面"）写入契约并标 `reachable:true` ⇒ **机检必须 FAIL**（这是 B1 的自证） |

### C 类 · 契约形态（`check-criteria`）

| # | 断言 |
|---|---|
| C1 | `contentTypes` 通过 schema 校验（字段名/类型/枚举值合法） |
| C2 | **既有节未被改动**：`carriers` / `surface.injection` / `surface.mcl` 的 diff 为空 |
| C3 | 投影一致性：若 `criteria.md` 等投影含类型表，须由生成器产出（`gen-criteria --check` 通过） |

### D 类 · 工程纪律（双棘轮）

| # | 断言 |
|---|---|
| D1 | `node scripts/audit-wiring.mjs` **I1 ≤120 / I2 ≤12 不破**（棘轮只许收紧） |
| D2 | `node scripts/audit-fnspan.mjs` 无**新增**超 120 行的函数（基线已含 `applyForgetOps 120`、`mountDistillEvents 123`） |
| D3 | `node scripts/audit-architecture.mjs`：循环 0、动态隐藏环 0、深度 ≤11 |
| D4 | `node scripts/check-bridges.mjs`：惰性桥仍 **0 边** |
| D5 | `node scripts/check-hardcode.mjs .`：零硬编码本机路径 |

### E 类 · 登记与可用性

| # | 断言 |
|---|---|
| E1 | `check-content-types.mjs` **已登记** `check-runner.mjs#CHECKS`（未登记 = 等于没写） |
| E2 | `node scripts/check-runner.mjs` 全绿（基线 77 项 + 新增） |
| E3 | 一条命令能回答「哪些类型不可达、为什么」——**这是 S0 的对外交付物** |

---

## 2. 六条口径（`AGENTS.md` 规则 7）

S0 为**纯新增 + 机检**，无 UI、无面板契约 ⇒ 六条中 ④⑤ 适用性如下：

| 口径 | 适用 | 说明 |
|---|---|---|
| ① `npm run typecheck` 零错 | ✅ | 新增 `src/content-types.ts` |
| ② `npm run build` 成功 | ✅ | host 侧 |
| ③ `check-runner` 全绿 | ✅ | 含新增机检 |
| ④ `ui-geo-regress` | ❌ **不适用** | S0 不动 UI ⇒ 在验收记录中**写明理由**（非跳过） |
| ⑤ 面板契约 | ❌ **不适用** | 同上 |
| ⑥ `check-installed-features` | ✅ | 若 S0 产物进包则须验 |

---

## 3. 关键真值表（防假绿）

| 场景 | 期望 | 为什么单列 |
|---|---|---|
| 契约齐全但**无人读它** | **FAIL** | 正是 `supply-assembly`「已接线」型假绿的同族——契约被 `src/` import 且在运行时被调用，才算接线 |
| A1–A3 全绿但 B1 未测 | **FAIL** | 枚举完备 ≠ 可达（G1 正是"枚举有、通路无"） |
| `reachable:true` 但只有测试脚本消费 | **FAIL** | 测试不算消费方（照 `supply-assembly` 教训） |

---

## 4. 回退

| 项 | 方式 |
|---|---|
| 契约节有误 | 注册表可整体回退到上一版（`criteria.json` 有生成/校验链） |
| `content-types.ts` 有误 | 新模块未被消费前删除即可（S0 阶段无消费方） |
| 机检误报 | 修判据，**不得**为通过而放宽断言（棘轮纪律） |

---

## 5. 交付物清单

| 产物 | 状态 |
|---|---|
| `skill/engine/criteria.json#contentTypes` | 待建 |
| `src/content-types.ts` | 待建 |
| `scripts/check-content-types.mjs`（已登记） | 待建 |
| 「不可达类型清单」查询输出 | 待出 |

---

_建立 2026-09-14 · S0 验收 v1。_
