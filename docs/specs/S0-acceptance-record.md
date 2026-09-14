# S0 · 协议层验收记录（2026-09-14）

> 配套方案：`S0-protocol-plan.md` · 验收方案：`S0-protocol-acceptance.md`
> **结论：S0 通过全部断言，准予进入 S1。**

---

## 1. 断言逐条实测

### A 类 · 枚举完备性 `check-content-types.mjs`

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| A1 | 每个 RecordKind 都在契约中 | ✅ | 提取 `KINDS` 13 个（`fact/procedure/persona/episode/decision/outcome/valence/relation/commitment/association/prose/structure/blank`），缺失 **无** |
| A2 | carrier 标签均已登记 | ✅ | 未登记 **无** |
| A3 | 无虚构 kind | ✅ | 虚构 **无** |
| A4 | 依赖面收敛 | ✅ | `content-types.ts` 仅 1 个 import（`criteria.generated`），越界 **无** |

### B 类 · 可达性一致性（本板块核心）

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| B1 | `reachable:true` ⇒ 消费侧有通路实现 | ✅ | 缺 **无**（25 类型全过） |
| **B1 反例自证** | 构造无通路者必须 FAIL | ✅ | 临时把 `episode.criterion` 改为 `no-such-channel` ⇒ 机检报 `❌ B1 … 缺：episode(判据未登记)` + `FAIL（2 项）`；恢复后 `PASS` |
| B1b | 通路登记 ⟷ 符号表同口径 | ✅ | 漂移 **无** |
| B2 | `reachable:false` ⇒ 必须写 why | ✅ | 缺 **无**（当前 0 项不可达） |
| B3 | 环记录声明正确（`projection=none` + carrier 空） | ✅ | 异常 **无**（7 类环记录） |
| B4 | 假绿可见 | ✅ | `wired=false` 仅 `due` 一项，机检**显式警告**（目标槽，落地前不得声明可达） |

### C 类 · 契约形态

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| C1 | schema 校验 | ✅ | `check-criteria` → `PASS（判据机检门全过）` |
| C2 | **既有节未被改动** | ✅ | 与 `git show HEAD` **逐字段深度比较**：既有节相同 ✅ · `wiring` 除 `pending` 外相同 ✅ |
| C3 | 投影新鲜度 | ✅ | `gen-criteria --check` → `PASS：五处投影与注册表一致` |

### D 类 · 工程纪律（双棘轮）

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| D1 | I1 ≤120 / I2 ≤12 不破 | ✅ | `audit-wiring` → **违规：装配 0 个 / 作用域 0 个** |
| D2 | 无新增超 120 行函数 | ✅ | `audit-fnspan` 仍只有基线两件（`applyForgetOps` 120 · `mountDistillEvents` 123）；新模块 `content-types.ts` **81 行** |
| D3 | 循环 0 / 隐藏环 0 / 深度 ≤11 | ✅ | `audit-architecture` → **静态循环依赖 0 · 动态边隐藏环 0 · 深度 11**（65 模块） |
| D4 | 惰性桥 0 边 | ✅ | `check-bridges` → `消费侧边数 0（= 基线）` |
| D5 | 零硬编码 | ✅ | `check-hardcode .` → `硬编码路径检查通过` |

### E 类 · 登记与可用性

| # | 断言 | 实测 | 证据 |
|---|---|---|---|
| E1 | 机检已登记 | ✅ | `check-runner.mjs#CHECKS` 实测 **78 条**（原 77 + 新增 1） |
| E2 | `check-runner` 全绿 | ✅ | `PASS（78 pass · 1 xfail · 0 skip）`（唯一 xfail = 既有 `test-treeops-rm`，非本次引入） |
| E3 | 可输出「不可达类型清单」 | ✅ | 机检末段输出 `📋 不可达类型清单（0 项）` |

---

## 2. 六条口径（`AGENTS.md` 规则 7）

| 口径 | 结果 |
|---|---|
| ① `npm run typecheck` | ✅ 零错 |
| ② `npm run build`（host + client） | ✅ 成功（`client.js` 659,256 B） |
| ③ `node scripts/check-runner.mjs` | ✅ 全绿 |
| ④ `ui-geo-regress` | ⚠️ **本板块不适用**（S0 未动 UI/样式）；已由 check-runner 内含项执行并通过 |
| ⑤ 面板契约 | ⚠️ **不适用**（S0 未新增/改端点） |
| ⑥ `check-installed-features` | ✅ **「已安装副本带着本轮全部特性（31 项标记齐全）」** |

**附加门禁**：`check-srcmap` → `65 个一致 · 漂移 0` ✅ · `check-deploy-sync` → `不一致 0` ✅ · `check-arch-sync` → **六项全 PASS** ✅

---

## 3. 交付物

| 产物 | 规模/状态 |
|---|---|
| `skill/engine/criteria.json#contentTypes` | **25 类型 + 3 结构性**（含 note）；既有节逐字段未动 |
| `src/content-types.ts` | **81 行** · L10 · 零依赖零 IO · 导出 5 个符号 |
| `scripts/check-content-types.mjs` | 11 项断言（A1–A4 / B1 / B1b / B2 / B3 / B4 / C / E3）· **已登记 78 件** |
| `scripts/gen-criteria.mjs` | 新增 TS 投影（含 `ContentType`/`ContentTypeStructural` 接口 + `CONTENT_TYPES`）与 md 表 |
| 投影产物 | `src/criteria.generated.ts` 1,170 行 / 40 KB · `criteria.md` 含内容类型表 |
| 文档对齐 | `AGENTS.md` / `ARCHITECTURE.md` 模块数 **63 → 64**；CHECKS 数 63 → 78 |
| 部署 | 库内副本同步 **8 件**（`check-deploy-sync` 不一致 0） |

---

## 4. 遗留与本板块的自我修正

| # | 事项 | 处置 |
|---|---|---|
| L1 | `content-types` 在 `src/` 内**扇入 0**（尚无人消费） | 按门禁在 `criteria.json#wiring.pending` **显式申报**（`until: S1`，理由与到期后果已写明）——S1 库核心接线，届时移除申报 |
| L2 | `due` 通路登记为 `wired:false` | 契约**描述现状**：`commitment` 当前经情境槽可达；"到期主动提"是 **S4-4** 目标，落地后再改判据 |
| ✅ | **自我修正 1**：初版契约曾把 `path`/`commitment` 按 S4 的**目标**槽（`process`/`due`）填写 | 会使 B1 断言**假通过**（声明与现状不符）⇒ 已改为如实声明现状，目标写在 `why` |
| ✅ | **自我修正 2**：`structural.note` 会破坏 `Record<string, ContentTypeStructural>` 类型 | 已并入 `contentTypes.note`，`structural` 只留 3 个结构性记录 |
| ✅ | **自我修正 3**：`edit` 一次被"文件未读"挡住 | 重读插入点后完成，无残留 |

---

## 5. 验收判定

**PASS** —— 20 条断言全绿（含 1 条反例自证）、六条口径满足（④⑤ 按方案声明不适用并有理由）、附加三门禁全过。

**准予进入 S1（库核心）。**

---

_记录 2026-09-14 · 施工与验收：本会话自主推进（目标模式）。_
