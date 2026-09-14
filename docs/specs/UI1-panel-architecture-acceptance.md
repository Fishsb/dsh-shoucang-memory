# UI1 · 面板架构与组件库对齐 —— 验收方案（2026-09-15）

> 配套：`UI1-panel-architecture-plan.md`
> **口径**：任一断言 FAIL ⇒ 该卡**未完成**，不得进入下一卡（沿用五阶段「**全绿方进**」）。
> **"先红后绿"纪律**（S4R 立）：凡断言"等价 / 不变 / 已对齐"，**首跑必须 FAIL** —— 否则说明该断言
> **测的不是它声称测的东西**。

---

## U0 · 门禁先行（**最高优先：没有门，拆完会长回去**）

| # | 断言 | 首跑预期 | 判据 |
|---|---|---|---|
| **U0-a-1** | `check-module-growth` 的扫描面**含 `src-client/`** | —— | 输出里出现 `body.js` 行数 |
| **U0-a-2** | **先红**：扩面后首跑必须报 `body.js` 超基线 | ❌ FAIL | 若不红 ⇒ 冻结值写错（**该断言无效**） |
| **U0-a-3** | 冻结值 = **实测当前值**（非拍脑袋） | —— | 契约里写明实测来源 |
| **U0-b-1** | `check-ui-components.mjs` 存在且登记进 `CHECKS` | —— | runner 里可见 |
| **U0-b-2** | **双向一致**：`vendor.js` import ↔ 实际使用，**两个方向都报** | —— | *import 了不用* 与 *用了没 import* 均 FAIL |
| **U0-b-3** | **反例自证**：注入「import 了不用」⇒ 检出；注入「用了没 import」⇒ 检出 | —— | 两个方向各一条自证 |

## U1 · 抽 `ui-kit.js`（先独立，拆 pane 才不互相牵）

| # | 断言 | 判据 |
|---|---|---|
| **U1-1** | `UI.*` 封装**只在 `ui-kit.js` 定义** | `body.js` / `panes/*` 里不得再出现 `UI.button = …` 之类定义 |
| **U1-2** | 消费侧**全部 import** | grep 无「本地自建 button」 |
| **U1-3** | **行为不变** | `ui-geo-regress` **100 PASS**（真机几何，非"看起来没变"） |

## U2 · 按领域接缝拆 pane（**不按行数硬切**）

| # | 断言 | 判据 |
|---|---|---|
| **U2-1** | 每块 pane 一个模块，**接缝 = 现有板块** | `panes/{memory,rings,records,observe,assembly,mcl,settings}.js` |
| **U2-2** | **零逻辑改动** | 搬移为纯位移；`ui-geo-regress` 每搬一块**跑一次**且 100 PASS |
| **U2-3** | `body.js` **逐卡下降**（可量化） | 每卡后记录行数；**棘轮随之下调**（只许收紧） |
| **U2-4** | **契约不变** | `check-panel-contract` + `gen-panel-contract --check`（表/产物/白名单三向一致） |
| **U2-5** | 无新增循环 | `audit-architecture` 静态循环 **0**（前端模块也算） |
| **U2-6** | 行数**不搬家式膨胀** | 新模块之和 ≤ 原 `body.js` 行数（**容差 5%**）；超出即说明"搬移夹带了重构" |

## U3 · 组件库最后一公里

| # | 断言 | 判据 |
|---|---|---|
| **U3-1** | `UI.select` 与 `wa-select` 的**差异逐处判因** | 要么改走组件库，要么**写明为何保留原生**（如"只需箭头，引组件反而更重"） |
| **U3-2** | **不为组件库而组件库** | 判因须落在文件注释里（可复核），**禁止**"统一改掉"式无判因替换 |
| **U3-3** | 视觉零回归 | `ui-geo-regress` 100 PASS + 皮肤切换正常（`sc-skin-v9` / `sc-skin-host`） |

## U4 · （可选）新能力上观测面板

| # | 断言 | 判据 |
|---|---|---|
| **U4-1** | **只上"已在跑但看不见"的能力**，不造新数据 | 数据源必为现有 RPC |
| **U4-2** | 若上 `replayRecent` 跨日：字段须含**跨日数**（S4Y 修的口径） | 界面上能看到"跨 N 天" |
| **U4-3** | 容量门不被突破 | 新板块不得把 KPI 挤出首屏（`ui-geo-regress` 首屏断言守） |

---

## 总验收（全部卡完成后）

| # | 断言 |
|---|---|
| **Z1** | `npm run typecheck` + `npm run build`（host **+ client**）零错 |
| **Z2** | `node scripts/check-runner.mjs` 全绿（含新增的 U0-b 门） |
| **Z3** | `ui-geo-regress` **100 PASS** |
| **Z4** | `check-panel-contract` + `gen-panel-contract --check` 三向一致 |
| **Z5** | `check-module-growth`：**`src-client/` 已在扫描面内**且全绿 |
| **Z6** | 部署 + 运行态：`deploy-installed` → `check-installed-sync --strict` → **热重载** → `check-installed-features` |
| **Z7** | `check-public-tree` PASS（推送前） |
| **Z8** | CHANGELOG 记行；`.git` 体积不因新产物爆炸（client.js ~640KB 属正常） |

## 量与账（施工中记录，验收时核对）

| 指标 | 施工前 | 目标 |
|---|---|---|
| `body.js` 行数 | **5117** | **< 800**（与后端最大模块同量级） |
| `src-client/` 模块数 | 4 | ≥ **12**（ui-kit + 7 panes + 入口/vendor/契约） |
| 组件库未对齐处 | `UI.select` 7 vs `wa-select` 3 | 逐处判因，**无未判因者** |
| `src-client/` 门禁数 | **0** | ≥ **2**（行数棘轮 + 组件一致） |

---

_建立 2026-09-15 · 与 `UI1-panel-architecture-plan.md` 成对（**验收先出**）。_
