# 从项目架构看落地细节

> 日期：2026-09-13 · 配套文档：`ui-implementation-plan-2026-09-13.md`（做什么）+ `ui-audit-report-2026-09-13.md`（现状如何）
> 本文回答：**每一项具体怎么改，改哪个文件，受什么架构约束，怎么验证，怎么回滚**
> 项目代码：**未做任何修改**

---

## 0. 先理解架构，再谈改动

### 0.1 构建链（改动必须走的路）

```
npm run build:host          tsc -p tsconfig.local.json
    │                       src/*.ts (46) → lib/*.js
    ▼
gen-panel-contract.mjs      读 lib/panel-contract.js
    │                       → src-client/panel-contract.generated.js（**禁手改**）
    ▼
展平 WA 主题令牌层           node_modules/@awesome.me/webawesome/dist/styles/themes/default.css
    │                       :root|html|body → #scpanl-root（**作用域收口，防污染宿主**）
    │                       → src-client/.vendor-css.generated.js（**禁手改**）
    ▼
esbuild                     entry.js = vendor.js + body.js
    │                       format:iife · target:es2019 · **minify:false** · **ignoreAnnotations:true**
    ▼
产物锚点校验（5 项，缺一即 process.exit(1)）
    │
    ▼
client.js ──复制──▶ lib/client.js
```

### 0.2 五个产物锚点（硬约束，直接决定改造边界）

`build-client.mjs:98` 的 `REQUIRED` 数组，产物必须包含：

| 锚点 | 为什么 | 对改造的约束 |
|---|---|---|
| `__ModuleLoader__` | cordis client 自注册契约 | ⚠ **不能把 body.js 改成纯 ESM** —— 改了产物就缺锚点，构建直接失败 |
| `window.__SC_CSS__` | 门禁抽取 CSS 数组的入口 | 必须保留该全局变量赋值 |
| `window.__SC_CSS__ = [` | CSS 数组起点 | 同上 |
| `].join(` | CSS 数组终点 | 同上 |
| `customElements` | 组件库随产物送达 | 不能 tree-shake 掉 vendor.js |

**这条约束推翻了我早期的一个想法**：方案里曾考虑「把 `body.js` 的 IIFE 拆掉改 ESM，好让函数跨度统计变干净」。现在明确——**不可行**。IIFE 必须保留（或至少保留 `__ModuleLoader__.load` 调用形态）。函数跨度统计只能靠门禁侧的包装函数排除规则解决（已验证可行），不能靠改源码形态。

### 0.3 两个"禁手改"

| 文件 | 性质 | 改了会怎样 |
|---|---|---|
| `client.js` / `lib/client.js` | esbuild 产物 | 下次 `build:client` 被覆盖，改动丢失 |
| `src-client/*.generated.js` | 生成物 | 被 `gen-panel-contract` / 主题展平覆盖 |

**所有前端改动必须落在 `src-client/body.js` / `vendor.js` / `entry.js`**，然后重新构建。

### 0.4 门禁矩阵（40 项，改动按图索骥）

| 门禁 | 扫什么 | 约束哪类改动 |
|---|---|---|
| `check-ui-contract` | 每个 route 必须有 UI 入口 | ⚠ **拆 Tab 时不能丢入口**，否则判红 |
| `check-panel-contract` + `gen-panel-contract --check` | 契约表 ⟷ 产物 ⟷ 白名单三向一致 | 动契约必须同时更新三处 |
| `check-layout-px` | **容器级禁裸 px** + CSS 花括号配平 | ⚠ 改 CSS 不能写死 px |
| `test-css-usage-gate` | 孤立样式 | 删手写组件样式后必跑 |
| `audit-fnspan` | 函数跨度（**当前只扫 src/*.ts**） | P0-2 要改它本身 |
| `ui-geo-regress` | 真机几何（3 档视口） | 视觉回归唯一可信判据 |
| `check-hardcode` | 零硬编码本机路径 | 写脚本不能出现盘符/用户目录 |
| `check-deploy-sync` | 记忆库脚本同步 | 部署前必跑 |
| `check-changelog` | CHANGELOG [Unreleased] | ⚠ **用户可感知改动必须记一行**（项目规则 4）|
| `test-fold-state` / `test-ui-derive` | 折叠与派生逻辑 | 拆记忆库/参数页必跑 |

### 0.5 部署链（改完怎么上线）

```
src-client/body.js 改动
  → npm run build:client        （重新打包 → client.js + lib/client.js）
  → 只覆盖差异文件到 ~/.dsh/profiles/web/node_modules/dsh-shoucang-memory/
  → ⚠ 重启 DSH               （**热重载只换 host 侧 lib/*.js，不换前端 bundle**）
  → node scripts/check-installed-features.mjs   （验特性，不只是 sha）
```

⚠ **不要跑 `pnpm install`**——会触发宿主批量删除保护。

---

## 1. 改动分层模型（判断影响面）

```
第 1 层  契约    src/panel-contract.ts（唯一事实源）
                     │ 影响：panel-contract.generated.js / 客户端预检 / 宿主 400 拦截
                     ▼
第 2 层  源码    src-client/body.js（4523 行）/ vendor.js / entry.js
                     │ 影响：需重新 build:client
                     ▼
第 3 层  产物    client.js → lib/client.js
                     │ 影响：门禁抽取锚点、部署
                     ▼
第 4 层  门禁    scripts/*.mjs（40 项）
                     │ 影响：CI 判定
                     ▼
第 5 层  部署    ~/.dsh/profiles/web/node_modules/...
```

**改动越靠上层，影响面越大**。本次所有 P0/P1 项都在**第 2 层（源码）+ 第 4 层（门禁）**，不涉及契约层，因此不触发第 1 层的三向一致校验——这是好消息，风险可控。

---

## 2. 逐项落地细节

### P0-2　门禁补盲：`src-client` 纳入 `audit-fnspan`

**涉及层**：第 4 层（门禁）

**前置**：无

**改动清单**：

| # | 文件 | 改动 |
|---|---|---|
| 1 | `scripts/audit-fnspan.mjs` | ① 扫描根从 `src` 扩展到 `[src, src-client]`；② 文件过滤 `.ts` → `.ts` + `.js`（排除 `*.generated.js`）；③ `ts.ScriptKind.TS` → 按扩展名切 `TS`/`JS`；④ 加包装函数排除（三合取规则） |
| 2 | `scripts/test-fnspan-wrapper.mjs` | **新建**，固化 7 个反向证伪用例 |
| 3 | `scripts/check-runner.mjs` | `CHECKS` 数组追加两项（**未登记 = 等于没写**，项目规则 6） |

**包装函数排除规则**（已验证 7/7）：

```js
const isWrapper = (f, fileLines) =>
  !f.decl                                   // ① 非声明形态（排除 function f(){} / export function f(){}）
  && f.depth <= 2                           // ② 嵌套深度 ≤2（IIFE + cordis factory）
  && (f.span / fileLines) > 0.8             // ③ 跨度占比 >0.8
```

**阈值**：`--soft 400` · `--hard 800` · `--debt 1`

**验证**：

```bash
node scripts/audit-fnspan.mjs                 # 应输出 >400 行 = 1（renderViewToggles 615）
node scripts/test-fnspan-wrapper.mjs          # 7/7
node scripts/check-runner.mjs                 # 40 项全绿
```

**回滚**：删除 `check-runner.mjs` 里新增的两行 + `git checkout scripts/audit-fnspan.mjs` + 删 `test-fnspan-wrapper.mjs`。**不动任何业务代码，风险最低**。

**注意**：`check-hardcode` 会扫新脚本——不能出现 `D:\` / `<HOME>` 等本机路径。

---

### P0-3　`renderIndexRows` 健壮性（审查发现的真问题）

**涉及层**：第 2 层（源码）→ 需 `build:client`

**现状**：`src-client/body.js:2716`，对 lines 元素直接解构，缺字段时渲染空行：

| 库 | 容量卡声称 | 实际渲染 | 漏报 |
|---|---|---|---|
| USER.md | 24 条 | 17 行 | 7 条（29%）|
| AGENT.md | 19 条 | 整卡失踪 | 19 条 |

**改动**：在 `renderIndexRows` 的 `arr.forEach` 开头加防御 + 日志：

```js
arr.forEach(function (ln) {
  /* 防御：lines 元素可能退化（缺 tag/subject/pointer）——实测 mock 数据下 USER 24→17、AGENT 整卡失踪。
     跳过并留痕，而不是渲染空 pill + 空文本的行（那会静默丢数据且看不出来）。 */
  if (!ln || typeof ln !== 'object') { Log.warn('索引行数据退化，已跳过：' + String(ln).slice(0, 40)); return; }
  ...
});
```

同时在 `renderPersona` 的 `pair.forEach` 里，`Derive.has(f.lines)` 为假时**显式标注**（当前只写"（暂无指针行）"到卡体，但若 `f.lines` 存在却全是退化元素则不会触发）。

**验证**：

```bash
npm run build:client
node scripts/ui-geo-regress.mjs --shots <目录>    # 画像页 AGENT 卡应出现
# 目视核对：USER 24 条 ⇒ 渲染 24 行（或明确标注跳过了 N 条）
```

**回滚**：`git checkout src-client/body.js && npm run build:client`

**CHANGELOG**：属用户可感知改动（画像页指针行变多）→ 规则 4 要求记一行。

---

### P0-1　组件库收尾：补齐 6 个未用组件

**涉及层**：第 2 层（源码）→ 需 `build:client`

**前置**：无（前 4 个不依赖图标）

**改动顺序**（一次一个，便于二分定位回归）：

| 序 | 手写组件 | → wa 组件 | 位置 | 依赖图标？ |
|---|---|---|---|---|
| 1 | `UI.progress` | `wa-progress-bar` | body.js:1618 | 否 |
| 2 | `UI.badge` | `wa-badge` | body.js:1391 | 否 |
| 3 | `UI.card` | `wa-card` | body.js:1258 | 否 |
| 4 | 加载态 | `wa-spinner` | — | 否（动效需目视） |
| 5 | — | `wa-tooltip` | — | **是** ⛔ |
| 6 | — | `wa-option` | — | **是** ⛔ |

**5/6 必须等 P2 图标取证通过**，否则重演 `wa-select` 回滚。

**替换模式**（沿用 `UI.tabs` 已验证写法，body.js:1542）：

```
外壳 div 保留  +  wa 组件内嵌  +  自定义子节点挂 slot
```

**保持 `UI.*` 门面不变**——内部换实现，调用点零改动。

**改后必须**：

```bash
npm run build:client
node scripts/test-css-usage-gate.mjs          # 删掉的手写样式不能留下孤立规则
node scripts/check-layout-px.mjs              # 新增 CSS 不能写死 px
node scripts/ui-geo-regress.mjs --shots <目录> # 逐张目视比对
```

**回滚**：单个组件回滚 = 恢复 `UI.x` 内部实现 + 恢复对应 CSS。`vendor.js` 的 import 可保留（未用即 tree-shake）。

---

### P1-1　拆 `renderViewToggles`（615 行 → 4 个 ≤200 行）

**涉及层**：第 2 层（源码）→ 需 `build:client`

**⚠ 前置条件（不可跳过）**：参数页**当前零单测**。必须先建契约测试，固化"各配置键 → 渲染出的控件类型"对照，作为拆分后的回归基线。否则无法证明等价。

**改动**：

1. 按 `CTRL_META` / `SWITCH_KEYS`（body.js:1697 / 1697 附近）的既有分组切成 4 组：
   蒸馏与睡眠 / 向量与嵌入 / 判据与阈值 / 界面与注入
2. 切片手法：**一次性脚本按已核准行号切片 + 按首行缩进自动 dedent**，不手工重打，由 typecheck 兜底
3. 依赖改写必须**同时**作用于 helper 定义处与路由函数体（只改前者会得到 `Expected 2 arguments, but got 1`）

**⚠ 架构约束**：`check-ui-contract` 要求**每个 route 必须有 UI 入口**。拆 Tab 时任何配置键都不能失去入口，否则判红。

**验证**：

```bash
npm run typecheck && npm run build
node scripts/check-ui-contract.mjs     # 34 个 route 入口齐全
node scripts/ui-geo-regress.mjs        # 参数页 4 Tab 几何无退化
node scripts/check-runner.mjs
```

**回滚**：`git checkout src-client/body.js && npm run build:client`

---

### P1-2　拆 `renderMemoryExpanded`（321 行 → **5** Tab）

**涉及层**：第 2 层（源码）→ 需 `build:client`

**⚠ 修正**：按审查结果，记忆库是 **5 Tab** 不是 4 Tab（body.js:2894）：
`运行态(run)` / `索引(index)` / `候选(pending)` / `笔记(notes)` / `统计·归档(growth)`

**可复用资产**：`renderIndexRows`（2716）、`renderNoteSections`（3213）已存在，可直接下沉为 Tab 渲染器。

**必跑门禁**：`test-fold-state` + `test-ui-derive`（这两件直接扫前端折叠与派生逻辑，拆 Tab 最容易破坏折叠状态持久化）。

**收益**：拆成 5 个独立函数后，可对各 Tab 加**独立的契约测试**——这正是修复 P0-3 类问题的长期手段（当前 321 行单函数无法针对单个 Tab 测试）。

---

### P2　图标可渲染性取证

**涉及层**：第 4 层（门禁）+ 第 2 层（源码，若修复）

**现状**：`vendor.js:45-53` 注册了内联 SVG 图标库，但实测 `<wa-icon>` **渲染尺寸为 0**。`wa-select` 因此回滚为原生 select。

**改动**（先证明，再谈采用）：

1. `scripts/ui-geo-regress.mjs` 加常驻断言：
   mount 一个 `<wa-icon name="chevron-down">`，量 `getBoundingClientRect()`，宽高均 > 0 才算过
2. 若失败（预期），定位根因：`--wa-font-size-*` 未定义？shadow DOM 未附着？resolver 返回格式不符？
3. 修好后才允许采用 `wa-select` / `wa-option` / `wa-tooltip`

**⚠ 这是前置门禁，不是优化项**——在它被证明前，P0-1 的第 5、6 项（tooltip / option）**不得开始**。

---

## 3. 落地顺序与依赖

```
P0-2 门禁补盲 ────────────┬──▶ P1-1 拆参数页 ──▶ 债务归 0，收紧基线到 0
  (无前置，风险最低)        │
                          └──▶ P1-2 拆记忆库（5 Tab）
                                    │
P0-3 renderIndexRows 防御 ──────────┼──▶ (独立，可随时做，10 行改动)
  (无前置，10 行)                    │
                                    ▼
P0-1 组件库收尾 1→2→3→4 ────▶ P2 图标取证 ──▶ P0-1 第 5、6 项
  (前 4 个不依赖图标)          (解锁 tooltip/option)
```

**为什么这个顺序**：

1. **P0-2 先**：唯一不改渲染行为、只增加度量的改动；且是后续所有改善的判据
2. **P0-3 可插队**：10 行改动、独立、修复的是已确认的真问题，性价比最高
3. **P0-1 前 4 项**：不依赖图标，可与 P1 并行
4. **P2 最后但阻塞 P0-1 后 2 项**：图标未证实就替换依赖它的组件 = 重演回滚

---

## 4. 每项改动的通用验收清单（项目规则 7）

任一改动收尾必须**同时**满足：

1. `npm run typecheck` 零错
2. `npm run build`（host + client）成功
3. `node scripts/check-runner.mjs` 全绿（基线 40 项，1 xfail）
4. **渲染级证据**：`node scripts/ui-geo-regress.mjs --shots <目录>` —— 出图目视比对
5. **契约与产物**：`check-panel-contract` + `gen-panel-contract --check`
6. **部署后**：`check-installed-features`（文件 sha 一致 ≠ 特性齐全）+ **重启 DSH**
7. **CHANGELOG**：用户可感知改动记一行 `[Unreleased]`（规则 4）

---

## 5. 架构约束速查（改前必读）

| 约束 | 出处 | 违反后果 |
|---|---|---|
| 产物必须含 5 个锚点 | `build-client.mjs:98` | 构建 `process.exit(1)` |
| `client.js` 禁手改 | 项目规则 3 | 改动被下次构建覆盖 |
| `*.generated.js` 禁手改 | build 链 | 被生成覆盖 |
| 容器级禁裸 px | `check-layout-px` | 门禁判红 |
| 每个 route 必须有 UI 入口 | `check-ui-contract` | 门禁判红 |
| 测试件必须登记 CHECKS | 项目规则 6 | 等于没写 |
| 零硬编码本机路径 | `check-hardcode` | 门禁判红（开源红线）|
| 用户可感知改动记 CHANGELOG | 项目规则 4 | `check-changelog` 判红 |
| 部署不跑 `pnpm install` | 项目经验 | 触发宿主批量删除保护 |
| 前端改动需重启 DSH | 实测 | 热重载不换前端 bundle |

---

## 6. 立即可执行（按性价比排序）

| 项 | 代码量 | 风险 | 前置 | 建议 |
|---|---|---|---|---|
| **P0-3** | ~10 行 | 极低 | 无 | **立刻做**：已确认的真问题，修复画像页 29% 指针漏渲染 |
| **P0-2** | 3 文件 | 低 | 无 | **立刻做**：设计已验证（7/7 证伪），只增加度量不改行为 |
| P1-1 | 中 | 中 | 契约测试 | 建完测试再做 |
| P0-1 (1–4) | 中 | 中 | 无 | 可与 P1 并行 |
| P2 | 小 | 低 | 无 | 阻塞 P0-1 后 2 项 |
| P1-2 | 中 | 中 | 契约测试 | 建完测试再做 |

**建议起点**：P0-3 + P0-2 一起做——前者修已确认缺陷，后者为后续所有工作提供度量。两者都不改变任何渲染行为（P0-3 只增加被跳过行的可见性），风险最低。
