# 守藏 UI 架构根治方案（v1 · 2026-09-26）

> **性质**：**决策态 → 施工态**的正式方案档。用户 2026-09-26 具名授权：① UI 面跨会话冻结解冻 + 落成正式方案；② 确认交互模型由「点按钮弹出的模态」改为「覆盖在 App 之上的浮层」。
>
> **判因**：UI 面自 S1–S4 重排（2026-09-13）后经历三轮「只加后端能力、不同步 UI」的累积（MCL / 判据 v2 / 库 git / 容量门），现已长成 **9 视图 / 47 端点 / 833KB 产物 / 1,063 条 i18n 键**。本轮勘察实测到一个**结构性错配**：DSH 宿主提供外壳、主题、组件库、语言与 89 个插槽，而本插件自带一整个 App，只在宿主上开了两个口子。本方案的目标是把这个错配**从路径上删掉**，不是逐点打补丁。
>
> **本档取代** `docs/ui-optimization-plan.md`（该档 §8「明确不做」三条链已被现实全部推翻，见 §7）。

---

## 0. 前置勘察结论（实测，非转述）

### 0.1 产物构成（`client.js` 833,165 B / gzip 207,351 B）

| 区段 | 字节 | 占比 | 判读 |
|---|---|---|---|
| Web Awesome 组件段 | 278,303 | 34.0% | 宿主 primitives 已在运行时白名单 |
| vendor 主题 CSS 段 | 305,699 | 37.4% | 宿主 `dsh-client-ui-theme` 已 `immediately:true` 随壳加载 |
| 自研顶层段（面板 CSS + i18n 词表 + 工具） | 198,272 | 24.3% | 面板 CSS 55KB + i18n 95KB |
| **factory 主体（全部业务逻辑）** | **35,258** | **4.3%** | **9 视图 / 47 端点的真实实现** |

> **判读**：第三方与自建基建占 **95.7%**，真实业务只占 **4.3%**。这不是"依赖偏重"，是**把宿主已有的三层又实现了一遍**。

### 0.2 决定性证据：宿主前端内置运行时模块白名单

从运行中宿主的前端产物直接读出（`dsh-web-frontend/dist/assets/index-*.js`，函数 `WS()`）：

| 白名单键 | 含义 |
|---|---|
| `react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` | React 运行时（**宿主单例**） |
| `@deepseek-ai/cordis` | 服务框架 |
| `@deepseek-ai/dsh-client-store` | 状态容器 |
| `@deepseek-ai/dsh-client-ui-slots` | **插槽注册语义** |
| `@deepseek-ai/dsh-client-ui-primitives` | **43 组件 + 32 CSS module** |
| `@deepseek-ai/dsh-client-ui-dockkit` | **停靠面板引擎** |

> **判读**：这些是 `require()` 的**白名单**，不是要打进产物的依赖。⇒ 「复用宿主」不是省体积的优化，而是**架构正确的形态**。

### 0.3 官方指引（宿主 renderer 类型契约原文）

> For a surface of your own that floats over the whole app, register into **`shell.overlay`** instead (a list slot: additive, and click-through until your entry opts into pointer events).

`shell.overlay` 契约原文：**Frame-wide floating layer, above every column and outside their scroll containers… entries order among themselves… click-through.**

⇒ **这不是"把面板塞进别人的槽"，这就是宿主为自建浮层设计的席位。**

⚠ **同时是一条硬禁令**：`root` 席位是 `single`，二次注册会**遮蔽 AppFrame**，导致整个宿主页面只剩你的组件（官方原文：the page would render your component alone, with every seat the frame declares gone）。本方案**不碰 `root`**。

---

## 1. 目标与不变量

### 1.1 目标（可测）

| # | 目标 | 判据 |
|---|---|---|
| G1 | 渲染级验收恢复可跑 | `ui-geo-regress` exit 0（非 4）；不再是 xfail |
| G2 | 产物消除宿主重复实现 | `client.js` ≤ 250KB；`__SC_VENDOR_CSS__` 段为 0 |
| G3 | 面板浮层化，跟随宿主主题 | 暗/亮主题切换出图比对一致 |
| G4 | 组件层收敛到宿主 primitives | `ui-kit.js` 导出面下降；无 `wa-*` 自注册 |
| G5 | 语言层接入宿主 locale namespace | 中文态**逐字零回归**（差分锁）；`i18n-dict-*` 文件数递减 |

### 1.2 不变量（不许动）

1. **不碰 `root` 席位**（会遮蔽 AppFrame，见 §0.3）
2. **不自动重启宿主**（红线；重载交用户点）
3. **不改 47 个 RPC 端点的契约语义**（`panel-contract.ts` 是唯一事实源，只允许增不允许改义）
4. **中文态逐字零回归**——i18n 迁移是**机制**迁移，不是文案改写
5. **每批独立可回滚**（改前备份，回滚路径写进批次表）

---

## 2. 根治路径：删层，不是改层

依据 `[原则] 修缺陷先审路径 · 可删路径则整类错误消失，胜于逐点补字段`——三层自建全部可**整类删除**：

| 自建层 | 现状 | 根治动作 | 关闭的整类错误 |
|---|---|---|---|
| **组件层** | `ui-kit.js` 535 行 + WA 7 组件自注册 | 改 `require('@deepseek-ai/dsh-client-ui-primitives')` | 「组件渲染尺寸为 0」这类自测盲区（如 `wa-select` 箭头已因此回滚两次） |
| **主题层** | 双皮肤 `sc-skin-v9`/`sc-skin-host` + 令牌桥 | ⚠ **已订正**：改为「换默认皮肤 + 收口 v9 的 44 个硬编码色值」 | ⚠ **原判有误（2026-09-26 U1 探针实测）**：宿主令牌定义在 **`body`** 上、**可正常继承**给面板——探针实测 `hostTokenOnRoot:"#0a0a0a"` ⇒「模态在 DOM 树外取不到宿主令牌」**不成立**，`sc-skin-host` 其实早就在做跟随。真正的问题只是**默认皮肤 `v9` 用硬编码色值**（44 处） |
| **语言层** | 自建 runtime 1,578 行 / 15 词表文件 | 注册宿主 locale namespace | 「词表漏注册静默回落成中文」（本仓实测踩过 3 份 / 700 键） |

### 2.1 为什么不是「推倒重来改 React」

**否决理由（实测支持）**：

1. **纯 DOM 不是缺陷、是资产**。宿主 primitives 与 WA 组件都能在纯 DOM 里使用；`require('react')` 通道**已经开通**（`settings.section` 里已用 React 写组件）。真正的病是**自建的壳与自建组件层**，不是渲染库选型。
2. **模态孤岛 = 主题进不来**，这是席位问题不是框架问题。用 React 重写**不解决**它；换 `shell.overlay` 才解决。
3. **风险面**：重写 9 视图 / 47 端点的前端等于把**全部既有行为**推倒，与「每批独立可回滚」冲突。

### 2.2 双形态共存（用户已确认）

| 形态 | 席位 | 承载 |
|---|---|---|
| **浮层**（覆盖 App，可开关） | `shell.overlay` | 现有 9 视图 / 47 端点的完整体（原模态的全部能力） |
| **常驻席位**（轻量） | `sidebar.panellist` | 状态徽章 + 关键数字，点击拉起浮层 |

⇒ 交互模型变化：**从「点按钮弹出模态」变为「浮层覆盖」**（用户已确认）。视觉层仍保有遮罩与居中感，但 DOM 位置、层叠上下文、滚动容器归属全部随 `shell.overlay` 契约改变。

---

## 3. U0 前置：渲染级验收恢复（阻塞其余全部）

### 3.1 问题实证

| 事实 | 证据 |
|---|---|
| WSL 侧无浏览器 | `ui-geo-regress.mjs` 候选表只有 `/usr/bin/google-chrome`\|`chromium`\|`chromium-browser`；Windows 候选靠 `%PROGRAMFILES%`，WSL 下为空 |
| 门禁 exit=4 | 实测 `REAL_EXIT=4` → runner 报 `⚠ xfail` |
| runner 已登记 xfail | `check-runner.mjs:1065` `{ xfail: true, slow: true }` |
| **后果** | **AGENTS.md 发布前置第 ④ 条「渲染级证据」当前无人执行** |
| 反证实验 | `CHROME_PATH` 指向 Windows Chrome 后门禁**跑了**（逐项断言执行、出图 0/12），失败根因是跨 OS 路径语义（`file:///tmp/...` 与 `--user-data-dir=/tmp/...` 三处不通） |

### 3.2 方案选择（已核实约束）

| 选项 | 可行性 | 否决/采纳理由 |
|---|---|---|
| WSL 装 `chromium` | ❌ **不可行** | Ubuntu 26.04 实测 `chromium` 包 **无候选**（`Candidate: (none)`），仅有 snap 过渡包；snap 在 WSL 未安装任何 snap |
| 走 Windows Chrome + 路径映射 | ❌ 否决 | 需逐处 `wslpath` 改造 = **逐点补字段**，正是被否决的路径；且 `--user-data-dir`/`--screenshot`/`file://` 三处语义各异 |
| **puppeteer 自带 Chromium** | ✅ **采纳（已启动）** | npm 侧 `puppeteer@25.12.0` 可用；落到 WSL 原生路径 `~/.cache/puppeteer/chrome/`；磁盘余量 948G；不需 root/snap。**实测进度**：`npx puppeteer browsers install chrome` 已启动、下载中（`chrome-linux64.zip` 已见） |
| **探测候选表未含 puppeteer 缓存** | ⚠ **须补（U0 内含）** | 门禁候选表（`ui-geo-regress.mjs:30-42`）只查固定系统路径 + PATH，**不查 puppeteer 缓存** ⇒ 装了也找不到。U0 须补一条探测（`~/.cache/puppeteer/chrome/*/chrome-linux64/chrome`），否则本批等于没做 |

### 3.3 U0 判据 —— **✅ 全部达成（2026-09-26）**

| # | 判据 | 实测结果 |
|---|---|---|
| 1 | `node scripts/ui-geo-regress.mjs` → **exit 0** | ✅ **122 PASS / 0 FAIL** |
| 2 | `check-runner --only ui-geo-regress` → **✅ pass** | ✅ `exit=0 pass`（原 `exit=4 xfail`） |
| 3 | 摘掉 `check-runner.mjs:1065` 的 `xfail: true` | ✅ 已摘，并同步改写上方过时注释 |
| 4 | 出图非空 ≥ 5,000 B | ✅ **12/12 张有效**（38–76 KB/张） |

### 3.3.1 **U0 真因（实测取证，非推断）**

> ⚠ 本次修复的价值不在「装了浏览器」，而在**真因与最初假设完全不同**。四个假设依次被证伪，最后落到 Chrome 的**参数组合**上。

**被证伪的假设**（每个都做了对照实验）：

| 假设 | 对照结果 | 判定 |
|---|---|---|
| 装 puppeteer 即可（无 chromium 包） | 装完仍失败，但 exit 4 → 1（探测面生效） | 部分成立，非真因 |
| 缺系统库 libnspr4 / libnss3 / libasound | 装完仍失败 | 已修，非真因 |
| 缺 `--no-sandbox` | 带与不带**均正常输出** | **证伪** |
| 残留 Chrome 进程（27 个）占资源 | 清空后仍卡 | **证伪** |

**真因**：Linux / 无 X / 无 DBus 环境下，**Chrome 154 只要显式给 `--user-data-dir=<任意路径>` 就会卡死 ~45 秒后被杀、输出为空**。门禁把它读作「取不到几何数据（渲染失败）」，而 `catch` 又吞掉非零退出 ⇒ **故障现场看起来像渲染缺陷**。

对照实测（同一 chrome、同一页面、同时段）：

| 调用形态 | 用时 | 输出 |
|---|---|---|
| `--user-data-dir=/tmp/x` | 45,132 ms | **0 B** |
| `--user-data-dir=$HOME/...` | 45,113 ms | **0 B** |
| **不给该参数** | **1,118 ms** | **60 B ✓** |
| 不给 + `env HOME=<临时目录>` | **911 ms** | **60 B ✓** |

**修法**：6 处 Chrome 调用**收敛为单一出口** `runChrome()`——不传 `--user-data-dir`，改用**临时 HOME** 达到同样的 profile 隔离（既不共享用户真实 profile，也不污染它），并统一补上 `--no-sandbox` / `--disable-dev-shm-usage` / `--disable-background-networking` / `--no-first-run`。

> ⚠ **为什么必须收敛成单一出口**：原实现 6 处各自拼参数 ⇒ 修一处不修其余 = 漏；且这正是本仓既有教训「**探针 PASS ≠ 生效**」的又一例——**参数组合本身从未被验证过**，而 `catch` 吞掉非零退出让失败彻底不可观测。
>
> 附带修掉一处**同族静默失效**：门禁的浏览器探测表只查固定系统路径 + PATH，**不查 puppeteer 缓存** ⇒「装了也找不到」。已补 `puppeteerCacheCandidates()`（由 `os.homedir()` + 目录枚举派生，守零硬编码红线）。

> ⚠ **第 3 条为什么必须一起做**：仓内契约（`check-runner.mjs:22-24`）写明「一旦 xfail 意外变成 XPASS，emitter 必须退 1，不是 4」——不摘 xfail 等于把一个能跑的门禁长期正当化成 xfail，属于**把失败不可观测亲手做出来**。

### 3.4 依赖方警示

⚠ `scripts/check-runner.mjs` 在 `docs/inflight-freeze-2026-09-25.json` 中为 **M（跨会话在途）**。U0 第 3 条要改它 ⇒ **施工前必须与在途会话协调**，或在方案中明确「只改:1065 一行、不动其余」。

---

## 3.5 U2 组件映射表（先查后换 · 2026-09-26 实查产出）

> 依据 `[原则] 先查后换非先换 · 清重复/改配置前先核消费点与别名`。**先出表，再动代码。**

### 3.5.1 实查数据

**我们的 `UI.*`（18 个成员，含调用点计数）**：
`item`46 · `card`26 · `button`26 · `kpi`14 · `pageHead`13 · `input`11 · `kv`11 · `toggle`9 · `select`7 · `dsBadge`5 · `tabs`5 · `cardIn`4 · `collapsible`4 · `fold`2 · `progress`1 · `badge`**0**（死代码）· `numSetting`/`enumSetting` **0**（死代码）

**宿主 primitives 组件面（59 项，已滤掉 Icon\* 与纯函数）**：
`Button` `Checkbox` `Input` `Switch` `Pill` `Tag` `StateDot` `SegmentedControl` `SegmentedTabs` `DisclosureRow` `Modal` `Menu` `MenuSurface` `MenuItemButton` `Tooltip` `Toast` `HoverCard` `JsonTree` `JsonBlock` `CodeBlock` `DiffBlock` `TerminalBlock` `ReadBlock` `SearchBlock` `WebBlock` `MarkdownText` `PathLabel` `FileTypeIcon` `ShortcutKeys` `RiskConfirmation` `SettingsForm` `SettingsValueField` `SettingsSecretField` `ConnectionIndicator` …

### 3.5.2 映射结论（**三类，不是全部替换**）

| 类 | 我们的成员 | 宿主对应 | 判定依据（实查契约） |
|---|---|---|---|
| **A 直接换** | `toggle`(9) | `Switch` | 契约同名同义：`checked` + `onChange` + `label` + `disabled`（含"写入在途禁用"语义） |
| | `button`(26) | `Button` | 已在用组件库（`wa-button`）；换 primitives 版即得宿主 a11y 与主题 |
| | `input`(11) | `Input` | 同名同义 |
| | `select`(7) | `SegmentedControl`（≤5 档）｜`Menu`（长列表） | `SegmentedControl` 契约含 `value/label/disabled` + `title`（"为何锁定"）——**正是旧方案 §4-B3 要的语义化档位控件** |
| | `dsBadge`(5) + `badge`(0) | `Pill` / `Tag` / `StateDot` | `Pill`：`active`+可选 `onClick`（静态 span ↔ 可交互 button 双态）；`StateDot`：**五态语义枚举** `done/warning/ongoing/error/idle`——比我们的 `kind` 字符串更严 |
| | `fold`(2) + `collapsible`(4) | `DisclosureRow` | 契约含 `open/expandable/onToggle` + 标题动画；**24px 紧凑行**（与我们折叠体同尺寸档） |
| **B 适配换** | `tabs`(5) | `SegmentedTabs` | 我们现用 `wa-tab-group`；`SegmentedTabs` 是宿主同款，但**需核 slot/事件契约差异**后再动 |
| | `kpi`(14) + `progress`(1) | `StateDot` + 自建进度条 | 宿主**无 KPI 卡与进度条**原语 ⇒ KPI 卡保留自建，仅**数字/状态点**换 `StateDot` |
| | `kv`(11) | `JsonTree`（仅 JSON 面） | `kv` 是通用键值行（11 处多为非 JSON）⇒ **保留** |
| **C 不换（无对应，保留自建）** | `item`(46) | ⚠ **无对应** | 宿主 `SettingsForm` 是**面向"插件设置页"的完整复合件**（`labels` + `state` + `onSave` + `onDiscard` + 只读/不可用态），**语义不同**于我们通用的「标签+描述+控件」三行栅格 ⇒ 强行替换会引入 save/discard 语义冲突 |
| | `card`(26) + `cardIn`(4) | ❌ **已评估否决过** | `vendor.js` 头注载明：`wa-card` 的 slot 结构与 `.sc-card/.sc-card-hd/.sc-card-bd` **不同构**，替换要重写整个卡片层 CSS，"风险高而观感无收益" |
| | `pageHead`(13) | 无对应 | 页面级标题+描述+分隔线，宿主各页自带，**不对外暴露** |

### 3.5.3 批次切分（按「可独立回滚 + 写面不重叠」）

| 序 | 内容 | 涉及调用点 | 为什么这个顺序 |
|---|---|---|---|
| U2-a | `toggle` → `Switch` | 9 | 契约最同构、调用点最少 ⇒ **先验证通路**（require primitives + 渲染） |
| U2-b | `dsBadge`/`badge` → `Pill`/`StateDot` | 5 (+1 死码清理) | 纯展示，无交互风险 |
| U2-c | `fold`/`collapsible` → `DisclosureRow` | 6 | 有开合状态，需核 `Fold` 单一数据源兼容 |
| U2-d | `select` → `SegmentedControl`/`Menu` | 7 | 有交互与键盘语义，**最后做** |
| U2-e | `button`/`input` → `Button`/`Input` | 37 | 调用点最多 ⇒ 单独一批、独立回滚 |

**U2 完成判据**：产物 ≤250KB（当前 ~818KB，主要靠后续 U1b 去 vendor）+ `check-ui-components` 判据同步更新后仍绿 + 每批 121+ PASS / 0 FAIL。

> ⚠ **本表是决策依据，不是施工**。U2 施工须先确认 U1b（壳迁移）是否先行——两者写面都含 `body.js`。

### 3.5.4 通路实证（2026-09-26 实查）

| 项 | 证据 | 结论 |
|---|---|---|
| primitives 是否真能被 `require` | 宿主前端 seed 表 `WS()` 实测**逐字**为：`{"@deepseek-ai/dsh-client-ui-primitives": qb, …}`，而 `qb` = `Object.freeze(Object.defineProperty({__proto__:null, BrandWordmark:z_, Button:i0, CODE_HIGH…}))` —— **即完整模块对象，已打包进宿主前端** | ✅ **能白拿**（这不是"如果能"，是宿主已经挂好了） |
| 插件的 require 通路是否可用 | 生产代码已在用：`client.js:14224` 一带 `require('react')` + try/catch + 降级；日志文案含 `"require('react') 不可用"` 分支 | ✅ **通路已被生产验证** |
| 拿不到时的行为 | 现成模式：`reactEl = null` ⇒ 走 DOM 直插兜底 | ⇒ **U2 沿用同一模式**：`require` 失败 ⇒ 保留自建 `UI.*`，**不引入硬依赖** |

⚠ **通路的"能 require"与"能渲染"是两件事**（本仓既有教训：`wa-select` 箭头"注册了≠能渲染"）。U2-a 的**第一件事**就是出图验证 `Switch` 真渲染（含 shadow 内部结构），再谈其余。

> 📌 未完成项：本轮曾尝试真机 stub 探针验证 require 调用链，**探针自身设计有误**（用 stub 替换 `require` 干扰了被测对象），结果未取得。**不是"已验证"** —— 施工时用上面那个生产模式（try/catch + 降级）直接短路，比另造探针更可靠。

---

## 4. 批次表（严格串行，每批独立可回滚）

| 批 | 内容 | 写面 | 回滚 | 验收判据 |
|---|---|---|---|---|
| **U0** | 几何门禁恢复可跑 | `scripts/ui-geo-regress.mjs`（探测逻辑）、`scripts/check-runner.mjs:1065` | 还原两文件 + 卸载 puppeteer | §3.3 四条 |
| **U1** | ✅ **已完成（层叠修复版）**：面板 `z-index` 9900→**950**，宿主审批弹窗不再被遮挡 | `src-client/styles.js` | `/tmp/u1-bak/` 备份 | ✅ 122 PASS / 0 FAIL · 12/12 图 · 命中测试 `hostModalCovered:false` · 其余 4 项 UI 门禁全 PASS |
| U1b | ⏳ **待做**：真正迁到 `shell.overlay` 席位 + 换默认皮肤（收口 v9 的 44 处硬编码色值） | `src-client/body.js`、`styles.js` | 同上 | 暗/亮出图比对；`__SC_VENDOR_CSS__` 段为 0 |
| **U2** | `ui-kit.js` 逐个换 primitives | `src-client/ui-kit.js`、`src-client/vendor.js`、`panes-*` | 备份还原 | 产物 ≤250KB；`check-ui-components` 判据同步更新后仍绿 |
| **U3** | i18n 接宿主 locale namespace | `src-client/i18n*.js` | 备份还原 | 中文态**逐字零回归**（差分锁）；文件数递减 |
| **U4** | 新增 `sidebar.panellist` 常驻视图 | `src-client/`（新增件） | 删新增件 | 侧栏可见；几何门禁加席位断言 |

### 4.1 为什么严格串行（依赖链）

```
U0 ──→ U1 ──→ U2 ──→ U3
       └────→ U4（U1 后可并行起步，但写面与 U2 有交叠 ⇒ 仍串行）
```

- **U0 → U1**：U1 的全部验收依赖渲染级证据，门禁不修则 U1 无法判断对错
- **U1 → U2**：组件替换在**新壳**下才有意义（旧模态下换组件要重测一遍）
- **U2 → U3**：i18n 词表多处绑定 pane 内的控件标签，组件稳定后再迁
- **写面重叠**：U1 与 U2 都碰 `body.js` ⇒ **不可并行**（auto-task 铁律 3）

按 auto-task DGI 判据：复杂度**复杂**（7+ 步），拆 **5 张**（≈√N，未超窗口上限）。

---

## 5. 每批的验收口径（本仓既有契约，不得放松）

任一阶段收尾必须**同时**满足（AGENTS.md 规则 7）：

1. `npm run typecheck` 零错
2. `npm run build`（host + client）成功
3. `node scripts/check-runner.mjs` 全绿
4. **渲染级证据**：`node scripts/ui-geo-regress.mjs --shots <dir>` 出图人眼过一遍
5. **契约与产物**：`check-panel-contract` + `gen-panel-contract --check` 三向一致
6. **装上去的那份带着本轮能力**：部署后 `check-installed-features`

> ⚠ 第 4 条**不可省**：本仓自己记着判因——`check-ui-contract` 8/8 绿、`audit-css-usage` 绿，而真机首屏 4 张 KPI 在 1024 宽直接归零。CSS/结构门禁对**几何**天然失明。

---

## 6. 不许做什么（边界 · 防拆东墙）

1. **不碰 `root` 席位**——会遮蔽 AppFrame（§0.3）
2. **不改 47 端点契约语义**——只允许增
3. **不自动重启宿主**——红线
4. **不动 `_memory/` 与任何真源数据**
5. **不为了"顺便"改与本批无关的文件**
6. **不在 U0 未完成前启动 U1**（验收无法判断 ⇒ 违反「放行不等于抵达」）
7. **不放松任何既有门禁**以让改动通过——那是把失败不可观测做出来

---

## 7. 对既有档案的处置

`docs/ui-optimization-plan.md` 已与现状**三处直接矛盾**，需处置：

| 该档 §8「明确不做」 | 现状 | 判定 |
|---|---|---|
| 不引入 UI 框架/组件库 | 已引入 Web Awesome（S3） | 已过时 |
| 不做主题/皮肤系统 | 已有双皮肤 + 令牌层（S1） | 已过时 |
| 不做国际化 | 已有 15 文件 / 1,063 键（2026-09-17） | 已过时 |

且其 §9.2 实测数字亦已漂移（裸 px 记 335、实为 495；内联样式记 46、实为 4）。

**处置建议**：该档**保留为历史**（记 S1–S4 重排的设计判因，属资产），但在档首加**过期标注**并指向本档；**不整体覆盖**——覆盖会丢失其 §1/§9.1 的外部知识索引（12 条设置页规则 + 8 条排版规则）与 §5 控件规范，那些仍然有效。

---

## 8. 风险与未知（诚实边界）

| # | 项 | 状态 |
|---|---|---|
| R1 | ~~`shell.overlay` 渲染表现未实测~~ ⇒ **U1 已实测并修复一处真缺陷** | ✅ **U1 完成**：发现面板原 `z-index:9900` **会遮住宿主审批弹窗**（宿主体系：框架 ≤20 · 引导 900 · 弹窗 1000 · 菜单/Toast 1100）。命中测试实证 `{ourZ:"9900", hostZ:"1000", topElAtHostModal:"sc-view", hostModalCovered:true}`。**修法**：面板落至 **950**（低于 Modal、高于宿主内容）⇒ 复核 `{ourZ:"950", topElAtHostModal:"card", hostModalCovered:false}`。⚠ 第一版改 `1000` **失败**——同层时胜负由 DOM 顺序定，而面板是 `body.appendChild` 追加在末尾 ⇒ 必须在**数值上**低于宿主弹窗 |
| R2 | 43 个 primitives 与自建 `UI.*` 的语义**非一一对应**，需逐个核消费点 | **未验证**——U2 施工前先做映射表 |
| R3 | `check-runner.mjs` 跨会话在途，U0 第 3 条有冲突 | **待协调**（§3.4） |
| R4 | `shell.overlay` 是 `list` 席位，与 `better-sidebar` 等已装插件**共存** | 需实测确认无顺序/遮挡冲突 |
| **R7** | **浏览器探测盲区：8 件脚本各写一份候选表**（U1 新发现） | ⚠ **部分已修**：新建 `scripts/chrome-find.mjs`（**唯一实现**：环境变量 → Windows 派生位 → PATH → **puppeteer 缓存**），`ui-geo-regress` 与 `test-panel-view-contract` 已改用。**其余 6 件仍各有本地副本**：`test-idxrow-pills` / `panel-shot-real` / `i18n-parity` / `i18n-probe` / `i18n-smoke` / `test-i18n-render` ⇒ **待办**（同一修法：改 import 共享模块）。\n| **R8** | `test-panel-view-contract` 真跑后**仍 FAIL（2 视图）**——但这是**既有缺陷**，非 U1 引入 | ✅ **A/B 对照已证**：HEAD 原版 = `exit 4 环境缺件跳过`（被 `xfail: true` 承接 ⇒ **无人看见**）；U1 改后 = **真启动浏览器**、2 视图通过、2 视图失败（`toggles`/`memory`）。\n\n**判定：这是进步不是回归**——从「假跳过」变为「真失败」，失败首次**可见**。根因线索：该件探针用**视图中文名**匹配导航（`'参数'`），而 `ui-geo-regress` 用**视图 id**（`'toggles'`）；且探针先 `root.querySelectorAll`（`root` 为 null 时整体抛错 ⇒ 无 `vie-out`）。**未修**：属独立缺陷，不在 U1 交付面 |
| **R6** | **出图不可复现 ⇒ 像素级回归比对不成立** | ⚠ **尝试修复失败，已安全回滚（2026-09-26）** —— 过程留档，供后来人少走弯路。\n\n**问题**：夹具 \`FIX\` 串内 24 处 \`Date.now()\` / \`new Date()\` ⇒ 每次出图时间戳不同。实测同码连跑两次的差异 ≥ 改代码前后的差异（\`shot-sleep\` 18,098 vs **18,584**；\`shot-overview\` 440 vs **16,297**）⇒ 像素比对不可用。\n\n**两次尝试均失败（各被证伪）**：\n① **T0 = 写死常量**（2026-09-15 那一刻）⇒ 断言 122 → **101 PASS / 21 FAIL**。失败形态：恒定面通道行未渲染 + 睡眠汇报卡「尚无汇报」+ 卡内行数 0。\n② **T0 = 当天零点**（想兼顾"可复现"与"贴now"）⇒ **仍 101 PASS / 21 FAIL**。⇒ 「夹具数据过期」这一假设**被证伪**。\n\n**关键对照（决定性）**：回滚版 **121 PASS / 0 FAIL**（exit 0）⇒ 确实是改动所致，非环境漂移。\n\n**已排除**：替换范围正确（24 处全在 \`FIX\` 串内，已用括号配对定位，无越界）；偏移量逐个保持原值；语法通过。**真因未明** —— 待专门排查。可疑方向：\`/inject/stats\` 与 \`/sleep/reports\` 两个端点在两种时钟下取到空数据，但面板侧消费逻辑（\`panes-overview.js:9-28\` 只读 \`days[].date\` 与 \`rep.count\`，均为写死值）看不出与 \`Date.now()\` 的关联 ⇒ 需在页内捕获真实异常（探针的 \`window.__AE\`/\`__LE\` 目前未输出到 \`geo-out\`，是排查阻塞点）。\n\n**教训**：① \`[原则] 模式派生集合先核对\` 我执行前**未列举命中集**，靠 \`grep -c\` 数行（18）而实际行内有多处（24），第一次就估错了范围；② 夹具的时间语义**不是单一来源**——面板内部有大量 \`Date.now()\` 相对计算，只改夹具侧**不足以**建立可复现性，须两侧同改或改用注入时钟。**先探明全部消费点，再动**。 | ⚠ **真缺陷，未修**：门禁夹具大量用 `Date.now()` / `new Date()`（`ui-geo-regress.mjs` 第 132/133/145/154/197-202/212/216 行），其中 `:216` 的 `epochSince: Date.now()-86400000` **直接渲染进纪元行** ⇒ 每次出图时间戳都不同。**实测对照**（三方像素比对）：`shot-sleep` A→B(改动)=18,098 vs **A→C(同代码重跑)=18,584**；`shot-overview` 440 vs **16,297** ⇒ **同码重跑差异 ≥ 改动差异**，故 U1 的图差**不是回归**。但这意味着**无法用像素比对做回归门禁**——建议后续把夹具时间戳固定为常量（U2 起需要，否则每次改组件都要人眼重看 12 张图） |
| R5 | ~~冻结面实测已漂移 28 件~~ ⇒ **已复验：冻结面已由提交解决，该快照过时** | ✅ 证据：会话开始时 \`git status\` **干净**（无 M 行）；\`check-runner.mjs\` 末次改动已由提交 \`c089c0b\` 固化进 HEAD。快照 \`inflight-freeze-2026-09-25.json\` 的 head 为 \`4761b8ed\`，**落后当前 HEAD 3 个提交** ⇒ 它记录的是当时的在途态，现已全部落地。**教训**：\`[原则] 档案事实须复验\` —— 我初判时据该快照报了"UI 面跨会话冻结"，属**过时档案误导**，此处订正 |

---

## 9. 一句话总纲

> **宿主提供了外壳、主题、组件库、语言与 89 个插槽；我们不该再实现一遍。**
> 根治 = 删掉三层重复实现（组件/主题/语言）+ 换到官方指定的自建浮层席位（`shell.overlay`）；
> 前提 = 先让渲染级验收真能跑（U0），否则一切改动都无法判断对错。
