# 守藏面板 UI 落实方案

> 编制日期：2026-09-13 · 基于 S1–S4 重排后的**当前实现**实测
> 依据：`src-client/`（前端源码）+ `src/panel-contract.ts`（契约）+ `scripts/`（门禁）逐项读取
> 门禁基线：`node scripts/check-runner.mjs` → **PASS（39 pass · 1 xfail · 0 skip）**，xfail 为已知的 `test-treeops-rm.mjs`
> **本文为方案文档，未改动任何项目代码。**

---

## 0. 结论摘要

S1–S4 重排已完成架构层改造（组件库 / 契约层 / 主题双皮肤 / 槽位 / 响应式）。当前的核心矛盾已经**不是"架构不对"，而是"改造只做了一半"**：

| 维度 | 已落地 | 半途 |
|---|---|---|
| 组件库 | Tabs / 按钮 / 开关已换 Web Awesome | **import 13 个组件，实际只用 6 个**，卡片/徽章/进度条/加载态/提示气泡/下拉项仍是手写 |
| 门禁 | 39 项全绿 | **`src-client/` 不在架构门禁与函数跨度门禁扫描范围内**，4523 行前端源码无人守 |
| 函数跨度 | 后端 `src/*.ts` 已消灭 >400 行函数 | 前端 `renderViewToggles` **615 行**、 `renderMemoryExpanded` **321 行**，无门禁拦截 |
| 图标 | 已 `registerIconLibrary` 注册 | **注册 ≠ 可渲染**（实测尺寸 0），`wa-select` 因此回滚为原生 select |

四项待办按「价值 × 风险」排序为 **P0 门禁补盲 → P0 组件库收尾 → P1 深层函数拆分 → P2 图标取证**。

> **P0-2 的设计已在本轮完成可行性验证**（只读，未改项目代码）：用 TS AST 试扫 `src-client`，
> 0 解析诊断；确定包装函数排除规则并通过 **7/7 反向证伪**；实测债务基线 = **1**。
> 方案中的数字均为 AST 精确值，非估算。详见 §2 P0-2。

---

## 1. 现状盘点（实测数据）

### 1.1 前端源码结构

| 文件 | 行数 | 说明 |
|---|---|---|
| `src-client/entry.js` | 18 | 入口：vendor → contract 挂全局 → body |
| `src-client/vendor.js` | 59 | 按需 import Web Awesome 13 个组件 + 图标库注册 |
| `src-client/body.js` | 4523 | 面板本体（由原 `client.js` 平移） |
| `src-client/panel-contract.generated.js` | 471 | 契约生成物（**禁手改**） |
| `client.js` / `lib/client.js` | 15450 | esbuild IIFE 产物，**禁手改**，`npm run build:client` 生成 |

`body.js` 内部分布：

| 区段 | 行范围 | 跨度 |
|---|---|---|
| CSS 数组（`var CSS = [...]`） | 154–977 | **824 行**，含 331 条 `#scpanl-root .sc-*` 手写组件样式 |
| 基础设施层（Bus/Store/Log/Cfg/Fold/Derive） | 979–1215 | 236 行 |
| `UI` 手写组件对象（15 个组件） | 1215–1652 | 437 行 |
| 8 个视图渲染函数 | 1789–3971 | 2182 行 |
| 装配与槽位（buildModal/mount/apply） | 4136–4523 | 387 行 |

前端函数跨度（**TS AST 精确值**，非行号差估算；本方案的核心靶子）：

| 函数 | 位置 | 跨度 | 嵌套深度 |
|---|---|---|---|
| `renderViewToggles`（参数页） | body.js:1964 | **615** | 3 |
| `renderMemoryExpanded`（记忆库） | body.js:2882 | 321 | 3 |
| `refreshVecZone`（参数页内嵌） | body.js:2174 | 181 | 4 |
| `renderViewOverview`（运行总览） | body.js:1789 | 174 | 3 |
| `renderDeepSleep`（深度睡眠） | body.js:3823 | 127 | 3 |
| `renderViewObserve`（运行观测） | body.js:3340 | 112 | 3 |
| `renderSuite`（插件集合） | body.js:3599 | 101 | 3 |
| `buildModal` | body.js:4136 | 93 | 3 |

> ⚠ 首版方案用「grep 行号差」估算的跨度**普遍偏大**（`renderSuite` 估 165 实测 101、`buildModal` 估 125 实测 93），
> 因为函数之间的注释与空行被计入。**必须用 AST 取精确 span**——这一点与后端 `audit-fnspan.mjs` 的结论一致。

**包装层**（`body.js` 整体是一个 `__ModuleLoader__` 自注册 IIFE）：

| 层 | 跨度 | 深度 |
|---|---|---|
| `(anon)` 外层 IIFE | 4509 | 1 |
| `factory` 函数 | 4502 | 2 |

真实业务代码从**深度 3** 起。这层壳是把 `src-client` 纳入跨度门禁时必须先处理的问题（见 P0-2）。

### 1.2 已落地的架构能力

- **8 视图 4 分组**（`VIEWS`，body.js:3328）：总览 / 记忆（记忆库·画像）/ 运行（插件集合·深度睡眠·运行观测）/ 配置（参数·设置）
- **响应式 7 断点**：≥1440 · ≤1180 · ≤900 · ≤720（导航转顶部横向 tab + 全屏 + 出现关闭按钮）· ≤480 · `hover:none` · `prefers-reduced-motion`
- **危险操作**：`confirm` 17 处、`danger` 15 处
- **双皮肤**：`sc-skin-v9`（默认，方案调色板）/ `sc-skin-host`（取自宿主 `--dsw-alias-*`）
- **契约层**：`src/panel-contract.ts` 88 行，`PANEL_ROUTES` 定义路由与请求体校验；客户端发请求前预检，宿主侧不通过即 400 且不进入 handler
- **槽位**：`sidebar.footer.action`（body.js:4472）+ `settings.section`（body.js:4494），不可用时回退自有壳
- **系统反馈层**：状态栏 + 日志面板（`buildLogPanel` / `applyLogPanel`）

### 1.3 组件库采用实况

`vendor.js` import 13 个组件，`body.js` 实际出现次数：

| 组件 | 出现次数 | 状态 |
|---|---|---|
| `wa-tab-group` / `wa-tab` / `wa-tab-panel` | 8 / 6 / 2 | ✅ 已采用 |
| `wa-button` | 7 | ✅ 已采用 |
| `wa-switch` | 5 | ✅ 已采用 |
| `wa-select` | 3 | ⚠ 部分（图标问题，已回滚为原生 select） |
| `wa-icon` | 1 | ⚠ 仅注册，未证实可渲染 |
| `wa-card` | **0** | ❌ import 未用 |
| `wa-badge` | **0** | ❌ import 未用 |
| `wa-progress-bar` | **0** | ❌ import 未用 |
| `wa-spinner` | **0** | ❌ import 未用 |
| `wa-tooltip` | **0** | ❌ import 未用 |
| `wa-option` | **0** | ❌ import 未用 |

对应的手写组件仍在 `UI` 对象里：`card`(22 行) · `badge`(8 行) · `dsBadge` · `progress`(20 行) · `kpi` · `kv` · `item` · `input` · `fold` · `collapsible`。

### 1.4 门禁覆盖盲区（本方案新发现）

| 门禁 | 是否覆盖 `src-client/` |
|---|---|
| `audit-fnspan.mjs`（函数跨度） | ❌ **只扫 `src/*.ts`** |
| `audit-architecture.mjs`（循环/分层/扇入） | ❌ 未覆盖 |
| `check-layout-px.mjs`（容器级禁裸 px + 花括号配平） | ✅ 扫产物 `client.js` |
| `check-ui-contract.mjs` / `test-css-usage-gate.mjs` / `audit-css-usage.mjs` | ✅ 扫产物 `client.js` |
| `ui-geo-regress.mjs`（真机几何） | ✅ 扫产物 `client.js` |

**后果**：后端已通过棘轮门禁把 >400 行函数清零（`audit-fnspan` 报告"0 个"），而前端 615 行的 `renderViewToggles` 从未被度量过。同一条质量标准，在前端是失效的。

> 补充实证：把 `src-client` 纳入扫描后共 **527 个函数**，其中 >400 行的**真债务只有 1 个**（`renderViewToggles` 615 行）。
> 但这个"1"不是随手可得的——直接套用后端规则会得到 3 个（多出的 2 个是 IIFE 包装层），见 P0-2。

---

## 2. 落实项

### P0-1　组件库收尾：补齐 6 个未用组件

**现状**：`vendor.js` import 13 个，`body.js` 用 6 个；卡片/徽章/进度条/加载态/提示气泡/下拉项仍是手写 DOM，对应约 50 行 JS + 一批 `.sc-*` CSS。

**目标**：把 `UI.card` / `UI.badge` / `UI.progress` / 加载态换成 `wa-card` / `wa-badge` / `wa-progress-bar` / `wa-spinner`，**保持 `UI.*` 门面不变**（内部换实现，调用点零改动）。

**步骤**：

1. 按组件逐个替换，一次只换一个（便于定位回归）：
   - 顺序建议 `progress` → `badge` → `card` → `spinner`（前三个不依赖图标，`spinner` 最后因其动效需视觉确认）
   - 每次替换后跑 `npm run build:client` + `node scripts/ui-geo-regress.mjs --shots <目录>` 出图比对
2. 替换模式沿用 `UI.tabs` 已验证的写法（body.js:1542）：**外壳 `div` 保留 + wa 组件内嵌 + 自定义子节点挂 slot**，不追求"纯 wa"
3. 替换后删除对应手写 CSS（`#scpanl-root .sc-card` 等），用 `test-css-usage-gate` 确认无孤立样式
4. `wa-tooltip` / `wa-option` **本轮不换**：依赖 `<wa-icon>` 实际渲染，见 P2

**验收**：
- `UI.*` 调用点数量不变（门面契约未破坏）
- `ui-geo-regress` 3 档视口全过，`--shots` 出图与基线逐张比对无视觉退化
- `test-css-usage-gate` 无新增孤立样式
- 替换后 CSS 数组行数下降（预期 824 → 700 量级，**以实测为准**）

**回滚**：单个组件回滚 = 恢复 `UI.x` 内部实现 + 恢复对应 CSS；`vendor.js` 的 import 可保留（未用即 tree-shake）。

---

### P0-2　门禁补盲：把 `src-client/` 纳入架构门禁

**现状**：`audit-fnspan.mjs` 只扫 `src/*.ts`，前端 4523 行无人守。

**目标**：前端源码纳入函数跨度门禁，**棘轮只许收紧**，且不得让当前状态直接判红到无法工作。

**⚠ 关键难点：不能直接套用后端规则。**

`body.js` 整体是一个 `__ModuleLoader__` 自注册 IIFE（见 1.1），直接扫描会得到 3 个 >400 行"债务"：
`(anon)` 4509 行、`factory` 4502 行、`renderViewToggles` 615 行。前两个是**模块封装层**，不是真债务，
且拆不掉（拆了就破坏宿主 cordis client 契约）。必须先定义"什么是包装函数"。

**包装函数判定规则（已通过 7/7 反向证伪）**：

```
isWrapper = ① 非声明形态           —— 排除 function f(){} / export function f(){}
         && ② 嵌套深度 ≤ 2         —— 模块封装层：IIFE(1) + cordis factory(2)
         && ③ 跨度 / 文件行数 > 0.8 —— 包装的跨度≈文件全长
```

应用后：排除 `(anon)`(深度1) 与 `factory`(深度2)，剩余 527 个函数中 **>400 行的真债务 = 1 个**。

**为什么这条规则不是"脆弱收口"**（项目已栽过一次：按名字后缀 `Scope|Deps` 收口 ⇒ 改名即可绕过）：

- 三个判据都是**语义/结构特征**，不是名字。想绕过就得把业务代码挪进第 2 层，
  但那样 `__ModuleLoader__.load` 契约就坏了 ⇒ **绕过会让功能失效，不存在"悄悄绕过"**。
- 这与"按名字收口"的本质区别在于：后者改名不影响功能，可以静默绕过。

**规则演进过程中踩到的三个坑**（反向证伪抓出来的，值得记录）：

| 版本 | 规则 | 失败用例 | 根因 |
|---|---|---|---|
| 一 | 跨度/文件行数 > 0.9 | ①②③ 债务漏报为 0 | 文件本身就由一个大函数构成时，该函数占比 99% 被误当包装排除 |
| 二 | 占比 > 0.8 && 内含函数数 ≥ 2 | ①② 多报 `factory` | 嵌套包装链要逐层剥离，内层 `factory` 只含 1 个函数，不满足 ≥2 |
| 三 | 占比 > 0.8 && 深度 ≤ 2 | ⑥ 漏报 | 纯 ESM 里 `export function` 深度也是 1，被误排除 |
| **终** | **三合取（形态 + 深度 + 占比）** | **7/7 通过** | — |

**阈值设计**（避免"恒绿"与"永久红灯"两种失败模式）：

- 硬顶：单函数 ≤ **800 行**。当前最大 615，取后端同款 2000 会**恒绿 = 假绿**；取 800 则新增巨型函数立刻红
- 债务计数：> 400 行的函数 ≤ **1**（当前实测值）
- `renderViewToggles` 拆分后 → 债务归 0 → **立即把基线收紧到 0**（只许收紧不许放松）

**步骤**：

1. 给 `audit-fnspan.mjs` 增加扫描根 `src-client/`（仅 `.js`，排除 `*.generated.js`），`ScriptKind` 切 `JS`
   - 实测 `ts.createSourceFile(..., ts.ScriptKind.JS)` 解析 `body.js` **0 条诊断**，可直接复用现有 TS AST 逻辑
2. 实现上述包装函数判定（三合取）
3. 登记进 `scripts/check-runner.mjs` 的 `CHECKS`（**未登记 = 等于没写**，项目规则 6）
4. 反向证伪用例固化：把 7 个用例（含"3 个 500 行函数塞进大闭包"的反向激励测试）写进 `scripts/test-fnspan-wrapper.mjs`
   - 尤其用例⑤验证：**把大函数塞进闭包不能让指标变好看**

**验收**：
- 对当前代码库输出"1 个 >400 行（renderViewToggles 615）"，不判失败
- `test-fnspan-wrapper.mjs` 7/7 通过

**风险**：跨度统计必须**数所有缩进层级**——只数列 0 顶层会把嵌套大函数藏起来，并形成"塞进大闭包指标反而好看"的反向激励（后端已栽过，前端同理）。

---

### P1-1　拆分 `renderViewToggles`（615 行 → 4 个 ≤200 行）

**现状**：参数页单函数 **615 行**（body.js:1964，AST 精确值），是所有视图里最深的，也是当前前端**唯一的** >400 行债务。

**目标**：按配置域拆为 4 个子渲染函数，父函数只做 Tab 装配。

**步骤**：

1. **先建路由契约测试**（前置条件，不可跳过）：参数页目前零单测，直接拆无法保证行为等价。先固化"各配置键 → 渲染出的控件类型"的对照，作为拆分后的回归基线
2. 按现有 `CTRL_META` / `SWITCH_KEYS`（body.js:1697 / 1697 附近）的分组切分，建议 4 组：蒸馏与睡眠 / 向量与嵌入 / 判据与阈值 / 界面与注入
3. 切片手法：**一次性脚本按已核准行号切片 + 按首行缩进自动 dedent**，不手工重打（项目已验证的做法），由 typecheck 兜底
4. 依赖改写必须**同时**作用于 helper 定义处与路由函数体，只改前者会得到 `Expected 2 arguments, but got 1`

**验收**：
- 父函数 ≤ 120 行，4 个子函数各 ≤ 200 行
- 契约测试全过（拆分前后渲染产物 DOM 结构等价）
- `npm run typecheck` + `npm run build` 零错
- `ui-geo-regress` 3 档视口无几何退化

**注意**：本项目 `check-ui-contract` 第④项要求"每个 route 必须有 UI 入口"，拆 Tab 时不得让任何配置键失去入口，否则门禁判红。

---

### P1-2　拆分 `renderMemoryExpanded`（321 行 → 4 Tab）

**现状**：记忆库板块 **321 行**（body.js:2882，AST 精确值）。

**定位说明**：它**未超过 400 行**，所以不是 P0-2 门禁的债务项——但它是第二大函数，且 4 类内容（索引行 / 候选区 / 笔记 / 统计）混在一个函数里，是参数页之外最值得拆的一个。拆它不带来门禁收益，但带来可维护性收益。

**目标**：按内容类型拆为 4 个 Tab（索引行 / 候选区 / 笔记 / 统计）。

**步骤**：同 P1-1，先建契约测试再拆。该视图已存在 `renderIndexRows`（2716）/ `renderNoteSections`（3213）两个可复用的子函数，拆分时可下沉为 Tab 渲染器。

**验收**：单函数 ≤ 200 行；`test-fold-state` / `test-ui-derive` 全过（这两件直接扫前端折叠与派生逻辑）。

---

### P2　图标可渲染性取证（解锁 `wa-tooltip` / `wa-option` / `wa-select` 回滚）

**现状**：`vendor.js:45-53` 用 `registerIconLibrary` 注册了内联 SVG 图标库，但**实测 `<wa-icon>` 渲染尺寸为 0、画面上无箭头**（vendor.js:32-37 已注明）。`wa-select` 因此回滚为原生 select。

**目标**：不是"修好图标"，而是**先证明它能不能用**——用渲染尺寸断言取代肉眼判断。

**步骤**：

1. 在 `ui-geo-regress.mjs` 里加一条断言：mount 一个 `<wa-icon name="chevron-down">`，量其 `getBoundingClientRect()`，宽高均 > 0 才算过
2. 若断言失败（预期），定位根因：`--wa-font-size-*` 未定义？shadow DOM 未附着？`registerIconLibrary` 的 resolver 返回格式不符？
3. 根因修好后，再谈 `wa-select` / `wa-option` / `wa-tooltip` 的采用

**验收**：`<wa-icon>` 渲染尺寸 > 0 的断言进入 `ui-geo-regress` 常驻断言集。

**注意**：这条是**前置门禁**而非优化项——在它被证明前，任何依赖图标的组件都不得替换，否则会重演 `wa-select` 的回滚。

---

## 3. 执行顺序与检查点

```
起点：门禁 39 pass · 1 xfail（已确认）

├─ 第 1 步  P0-2 门禁补盲（设计已验证，可直接落地）
│           检查点：audit-fnspan 覆盖 src-client，输出"1 个 >400 行（renderViewToggles 615）"不判红；
│                   包装函数排除规则生效（anon 4509 / factory 4502 不计入）；
│                   test-fnspan-wrapper 7/7 反向证伪通过
│
├─ 第 2 步  P1-1 / P1-2 深层函数拆分（先建契约测试）
│           检查点：父函数 ≤120 行、子函数 ≤200 行；契约测试全过
│           ⚠ 顺序不能反：先有门禁（第 1 步）才能度量第 2 步的改善，
│             也才能防止拆分过程中新增大函数
│           ⚠ P1-1 完成后债务归 0，须**立即把棘轮基线从 1 收紧到 0**
│
├─ 第 3 步  P0-1 组件库收尾（progress → badge → card → spinner 逐个）
│           检查点：每次替换后 ui-geo-regress --shots 出图比对
│
└─ 第 4 步  P2 图标取证
            检查点：<wa-icon> 尺寸断言进入常驻门禁
```

**为什么这个顺序**：

1. **门禁先行**：没有度量就没有改善的判据。先补盲，第 2 步的拆分成果才是可验证的，而不是"看着变小了"。
2. **结构先于外观**：先拆函数（改变代码结构但不改变画面），再换组件（改变画面）。若顺序颠倒，换组件时的视觉回归与拆函数的结构变更会交织，出问题无法二分定位。
3. **图标最后**：它是解锁项而非阻塞项——前 3 步都不依赖它。

---

## 4. 每一步的验收口径（项目规则 7）

任一阶段收尾必须**同时**满足以下六条，任一条红即未完成：

1. `npm run typecheck` 零错
2. `npm run build`（host + client）成功
3. `node scripts/check-runner.mjs` 全绿（基线 39 pass · 1 xfail）
4. **渲染级证据**：`node scripts/ui-geo-regress.mjs --shots <目录>` —— CSS/结构门禁对"内容被挤出首屏""组件没渲染"天然失明，只有真机量几何才看得见
5. **契约与产物**：`check-panel-contract` + `gen-panel-contract --check`（表 / 产物 / 白名单三向一致）
6. **装上去的那份带着本轮能力**：部署后跑 `check-installed-features` —— 文件级 sha 一致 ≠ 特性齐全

**部署提醒**：
- 前端改动需 **重启 DSH**（热重载只换 host 侧 `lib/*.js`，不换前端 bundle）
- 部署用「只覆盖差异文件」，**不要跑 `pnpm install`**（会触发宿主批量删除保护）
- 个人目录覆盖前先备份

---

## 5. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 组件替换后视觉退化 | 面板观感变差 | 逐个替换 + `--shots` 出图逐张比对，一次只换一个 |
| 拆分改变 DOM 结构 | `check-ui-contract` / `test-fold-state` 判红 | 先建契约测试固化当前 DOM，拆分后比对 |
| 门禁阈值取松 = 假绿 | 门禁形同虚设 | 硬顶取 800 而非 2000；债务计数让新增大函数立刻红 |
| 包装函数排除规则误伤真债务 | **漏报**（比误报危险） | 三合取（形态 + 深度 ≤2 + 占比 >0.8）；7 个证伪用例固化为常驻测试，其中⑤专门验证"塞进闭包不能让指标变好看" |
| 嵌套函数被顶层统计漏掉 | 指标失真且形成反向激励 | AST 数所有缩进层级，不用正则 |
| 图标未证实就替换依赖它的组件 | 重演 `wa-select` 回滚 | P2 作为前置门禁，未过不替换 |
| 改 `client.js` 而非 `src-client/` | 下次构建被覆盖，改动丢失 | `client.js` 是产物，禁手改（项目规则 3） |

---

## 6. 与既有 UI 方案（v1–v4）的关系

2026-09-12 的 v1–v4 方案（`deliverables/ui-redesign-v4-2026-09-12.html`）提出的结构，**大部分已在 S1–S4 重排中落地**：

| v4 方案主张 | 落地情况 |
|---|---|
| 8 视图 4 分组导航 | ✅ `VIEWS`（body.js:3328）完全一致 |
| 参数页 4 Tab / 记忆库 4 Tab | ❌ 未落地 → 本方案 P1 |
| 状态栏 + 日志面板 | ✅ `applyLogPanel` / `buildLogPanel` |
| 响应式 7 断点 | ✅ 完全一致 |
| 危险操作二次确认 | ✅ confirm 17 / danger 15 |
| 异步忙碌态 | ✅ `busyText` |
| 界面设置 8 项 | ✅ `Cfg.DEF` |
| 深链 `#sc=<视图名>` | ✅ |
| 虚构配置项改真实键 | ✅ 契约层 `PANEL_ROUTES` 已是唯一事实源 |

**v4 中未落地且本方案未纳入的**：容量条与 78% 的画像页呈现（表⑦b 待裁决项，你此前选 A 方案保留）。该项属内容层细节，与本次结构性落实不冲突，可单独立项。

---

## 7. 立即可执行的下一步

**P0-2 门禁补盲**，它的设计已在本轮验证完毕（只读验证，未改项目代码）：

| 已验证项 | 结果 |
|---|---|
| TS AST 能否解析 `src-client/*.js` | ✅ 0 条解析诊断，可直接复用现有 `audit-fnspan.mjs` 逻辑 |
| 包装函数排除规则 | ✅ 排除 `(anon)` 4509 / `factory` 4502 |
| 反向证伪 | ✅ 7/7 通过（含改名绕过、反向激励、纯 ESM 三个针对性用例） |
| 权威债务基线 | ✅ **1 个**：`renderViewToggles` 615 行 |
| 硬顶取值 | ✅ 最大跨度 615，取 800 非恒绿 |

落地动作只需三处改动：`audit-fnspan.mjs`（加扫描根 + 包装规则 + `ScriptKind.JS`）、
新增 `scripts/test-fnspan-wrapper.mjs`（固化 7 个证伪用例）、`check-runner.mjs`（登记）。

这是唯一一个"不改任何渲染行为、只增加度量"的改动，风险最低，且是后续所有工作的判据基础。

需要我执行 P0-2 落地，还是先做 P1-1 的前置契约测试？
