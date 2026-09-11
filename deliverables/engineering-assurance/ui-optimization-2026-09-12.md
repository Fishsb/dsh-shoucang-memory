# 守藏 UI 系统性优化 · 问题清单（2026-09-12）

**审查对象**：守藏面板 UI（`client.js` 前端 + `src/panel.ts` 面板后端）
**方法**：结构勘查 → 端点覆盖比对 → 四维度取证 → 问题定级
**结论**：共 **24 项问题**（🔴 阻塞 5 · 🟠 高 9 · 🟡 中 10）

---

## 📌 TL;DR

- UI 是 **2331 行单文件 IIFE + 1896 行后端 RPC**，34 个端点、6 个视图
- **架构**：无分层、无组件复用、无状态管理——`refs = {}` 单一可变全局袋 + 14 个命令式 render
- **功能链**：**6 个端点无 UI 入口**（`/embed/test` `/get_root` `/inject/stats` `/memory/edit` `/memory/remove` `/root/bootstrap`）
- **可观察性**：**近乎为零**——无进度、无日志、无中间结果、错误只有一行 `status('⚠ ' + msg)`
- **自由度**：全部硬编码（尺寸/阈值/定时器），无快捷键、无密度/布局配置

---

## 一、现状勘查（事实底数）

| 项 | 值 |
|---|---|
| `client.js` | 2331 行 / 169,994 B，`__ModuleLoader` 包裹的 IIFE，纯 DOM |
| `src/panel.ts` | 1896 行 / 117,534 B，34 个 `route()` 端点 |
| 视觉 | 仿 Obsidian 设置窗口：左导航 + 右内容 + 底部状态栏 |
| RPC | `api(path, opts)` → `fetch('/api/shoucang-panel' + path)` |
| 视图 VIEWS | 6 个，3 组：记忆（persona/memory）· 运行（suite/deepsleep）· 配置（toggles/file） |
| 状态 | `var refs = {}`，命令式赋值 |
| 渲染 | 14 个 `render*` 函数，均为 `textContent=''` + `appendChild` |
| 错误 | 54 处 `.catch(`，统一 `function fail(e){ status('⚠ ' + e.message) }` |

---

## 二、问题清单

### A. 架构层面（6 项）

| # | 级别 | 问题 | 证据 |
|---|---|---|---|
| A1 | 🔴 | **无状态管理**：唯一状态是 `var refs = {}`，靠 `refs.ta = ta` / `refs.view = ...` 命令式赋值。无单一数据源、无状态迁移、无订阅/通知，视图间状态靠直接读 DOM 或全局变量 | `client.js:2063` `var refs = {}`；`:2095/2098/2122/2142` 四处赋值 |
| A2 | 🔴 | **无组件复用**：14 个 render 函数各自拼 DOM（`setting-item` / `setting-item-info` / `setting-item-control` 三件套在 6 个视图里重复实现），改一处样式要改 14 处 | `grep -c "function render"` = 14；`renderSuite`/`renderPersona`/`renderMemoryExpanded` 结构高度雷同 |
| A3 | 🟠 | **视图定义靠下标访问**：`VIEWS` 是元组数组，读成 `v[0]`(name) `v[1]`(label) `v[2]`(icon) `v[3]`(group)，可读性差且易错位 | `client.js:1776-1783` `var VIEWS = [['persona','画像板块','persona','记忆'], …]`；`:2124-2135` 用 `v[0]…v[3]` |
| A4 | 🟠 | **无分层**：DOM 构建、RPC、业务逻辑、样式、常量全挤在一个 IIFE 内，无模块边界 | 全文单闭包，无 `export`/模块划分 |
| A5 | 🟡 | **硬编码散落**：尺寸 `height:22/28/34/36/42/260/300`、`width:22/100`、阈值 `max=95`、定时器 `setTimeout(0` / `setInterval(` 直接写死 | grep 结果 20+ 处 |
| A6 | 🟡 | **无路由/历史**：切视图是 `show(name)` 直接替换内容，无 URL 同步、无前进/后退、无深链 | `client.js:2070` `show(v[0])`；`:2115` `item.onclick = function(){ show(v[0]) }` |

### B. 功能链条（5 项）

| # | 级别 | 问题 | 证据 |
|---|---|---|---|
| B1 | 🔴 | **6 个端点无 UI 入口**：`/embed/test`（嵌入连通性测试）、`/get_root`（当前根）、`/inject/stats`（注入统计）、`/memory/edit`（编辑条目）、`/memory/remove`（删除条目）、`/root/bootstrap`（根引导）——后端已实现，界面上完全不可达 | 逐个 grep `client.js` 命中 **0**（已排除 `/memory/sections` 的误报：实际调用为 `'/memory/sections?rel=' + …`，带查询串） |
| B2 | 🟠 | **编辑/删除链路断裂**：`/memory/edit` `/memory/remove` 无入口 ⇒ 记忆条目只能看不能改，发现错条目无法在 UI 修正，只能手工改 Markdown | 同上 |
| B3 | 🟠 | **测试类操作无入口**：`/embed/test` 无入口 ⇒ 配完 embedding 无法验证连通性，只能等实际调用失败 | 同上 |
| B4 | 🟡 | **错误无恢复路径**：54 处 catch 统一落到 `status('⚠ ' + e.message)`，无重试、无"上一步"、失败后不能续做 | `client.js:396` |
| B5 | 🟡 | **无操作闭环反馈**：部分写操作成功后只 `status()` 一行，不刷新相关视图（需手动切走再切回） | `refreshCurrentView()` 仅在 openPanel 调用，写操作后未普遍调用 |

### C. 自由度与可观察性（7 项）

| # | 级别 | 问题 | 证据 |
|---|---|---|---|
| C1 | 🔴 | **无执行进度**：长操作（`/distill/run` `/selfcheck/run` `/reconcile` `/vector/cache/clear`）发起后界面无进度、无 spinner、无法判断是否仍在跑，用户只能盲等或重复点击 | grep `progress\|进度\|spinner` 全文件仅 **7** 处命中，且多为文案而非机制 |
| C2 | 🔴 | **无日志/中间结果面板**：看不到执行过程、中间产物、LLM 调用结果，排障只能翻服务端日志 | 同上 |
| C3 | 🟠 | **错误不可定位**：`fail(e)` 只显示 `e.message`，**不带**端点路径、请求参数、堆栈、时间戳；无法区分是网络/参数/服务端哪一层出错 | `client.js:396` |
| C4 | 🟠 | **无关键指标实时呈现**：MCL 状态、vector 缓存、注入统计、深睡倒计时等散落各视图，无统一指标区/概览 | `/mcl/status` `/vector/status2` 有端点但仅在各自视图静态展示 |
| C5 | 🟠 | **无快捷键**：面板只能鼠标点开，无 `Cmd/Ctrl+Shift+S` 之类快捷入口，也无 ESC 关闭/焦点管理 | 全文无 `keydown`/`addEventListener('key` |
| C6 | 🟡 | **布局不可配**：导航宽度、内容区宽度、字号全部写死，无法按屏幕/偏好调整 | A5 尺寸硬编码 |
| C7 | 🟡 | **无刷新频率配置**：`setInterval` 轮询间隔写死，不能关/不能调 | A5 |

### D. 信息量与设置项（6 项）

| # | 级别 | 问题 | 证据 |
|---|---|---|---|
| D1 | 🟠 | **状态栏信息量低**：单行文本，最新一条覆盖前一条，无历史、无分级（info/warn/error 视觉不区分） | `client.js:396` `status()` |
| D2 | 🟠 | **无概览—详情分层**：列表直接铺全部字段（如成员插件、索引行），长列表无折叠，"扫一眼看全貌"做不到 | `renderSuite` / `renderIndexRows` 均为平铺 |
| D3 | 🟡 | **无密度切换**：不能紧凑/舒适切换，信息密度固定 | 无相关实现 |
| D4 | 🟡 | **隐式默认未显式化**：轮询开关与间隔、自动刷新、缓存策略等默认行为未在 UI 暴露为设置项 | 仅 `SWITCH_KEYS` 部分开关可见 |
| D5 | 🟡 | **配置入口分散**：`toggles`（参数调节）与 `file`（配置原文）两个视图割裂，改一个值要么翻开关、要么直接改 YAML，无统一"设置中心" | VIEWS 配置组两项并列 |
| D6 | 🟡 | **无障碍仅起步**：状态栏有 `role=status`/`aria-live`，但控件普遍缺 `aria-label`、键盘可达性未验证 | `client.js:2145-2146` 仅状态栏有 ARIA |

---

## 三、问题定级汇总

| 级别 | 数量 | 编号 |
|---|---|---|
| 🔴 阻塞 | 5 | A1 A2 B1 C1 C2 |
| 🟠 高 | 9 | A3 A4 B2 B3 C3 C4 C5 D1 D2 |
| 🟡 中 | 10 | A5 A6 B4 B5 C6 C7 D3 D4 D5 D6 |

**优先级建议**（按依赖顺序）：
1. **A1 + A2**（状态 + 组件）——一切的基础，后续改动都依赖它
2. **B1**（补 6 个端点入口）——功能闭环，独立可先做
3. **C1 + C2 + C3**（进度/日志/错误定位）——可观察性三件套，依赖 A1 的事件总线
4. **D1 + D2 + D5**（状态栏分级/概览详情/统一设置）——依赖 A2 组件层
5. **C5 + D3 + D4 + C6 + C7**（快捷键/密度/设置项/布局/频率）——自由度，可最后增量加

---

## 四、落地实现（已完成，`client.js` 2331 → 2978 行）

### 4.1 架构层（A1 A2 A3 A4）

新增基础设施层，全部位于既有 IIFE 内、ES5 兼容、不改任何旧函数签名：

| 设施 | 作用 | 解决的问题 |
|---|---|---|
| `Bus` | 事件总线（on/emit） | 解耦 UI 与副作用 |
| `Store` | 单一数据源 + 订阅（get/set/patch/sub） | **替代 `refs = {}` 可变全局袋**（A1） |
| `Log` | 分级日志（info/warn/error，保留 500 条） | 状态栏"后一条覆盖前一条"（C2） |
| `Prog` | 进度管理（start/set/done） | 长操作盲等（C1） |
| `Cfg` | 参数化配置（localStorage，8 项） | 全部硬编码（自由度） |
| `UI` | 组件工厂（item/toggle/input/select/button/badge/collapsible/progress/kv） | **14 个 render 的重复实现**（A2） |
| `apiCtx` | 带上下文的 RPC 包装（自动记端点/参数/耗时） | 错误不可定位（C3） |
| `status`/`fail` | 状态分级 + 错误记录（端点/参数/堆栈/时间戳） | 单行 message（C3 D1） |

视图注册表 `VIEWS` 由 6 → **8**，新增 `observe`（运行观测）、`settings`（界面设置）；`show()` 分派补齐。

### 4.2 功能链条（B1 B2 B3）

**端点覆盖 28/34 → 34/34**：

| 端点 | 落点 |
|---|---|
| `/embed/test` | 运行观测 → 运维操作 →「测试连接」（**先读 `/embed/config` 取 baseUrl 再测**——后端要求 `{baseUrl,apiKey}`，发空 body 会报 `baseUrl required`） |
| `/get_root` | `collectMetrics()` → 观测视图「当前根」 |
| `/inject/stats` | `collectMetrics()` → 观测视图「注入统计」 |
| `/root/bootstrap` | 运行观测 → 运维操作 →「执行引导」（带二次确认） |
| `/memory/edit` | 运行观测 → **高级：行级编辑/删除**（`{file,line,newText}`） |
| `/memory/remove` | 同上（`{file,line}`，带 confirm） |

**关于 `/memory/edit` `/memory/remove` 的重要判断**：它们是**行级**原语，作用对象是记忆文件本身；而既有设计 R3 明确写着"索引行只读——直接改索引行会与 notes 详情错位"，常规编辑应走 `/memory/section-edit`（小节级，已有「✎ 编辑此小节」入口）。
⇒ 因此**不是无脑补入口**，而是放入「高级」折叠区并附显式风险提示 + 确认弹窗。这既满足"无死角入口"，又不破坏指针一致性。

### 4.3 可观察性（C1–C4）

- **进度**：`Prog` + `UI.progress` 进度条，长操作不再盲等
- **日志**：`Log` 分级（保留 500 条）+ 常驻日志面板（级别可过滤、可清空）
- **错误定位**：`fail(e, ctx)` 记录端点/方法/参数/堆栈/时间戳，观测视图可展开逐条查看
- **耗时**：`apiCtx()` 自动记录每次 RPC 耗时并写入日志
- **指标**：`collectMetrics()` 汇总 MCL 状态 / 向量档 / 注入统计 / 当前根

### 4.4 信息密度与设置（D1–D5）

- 状态栏：单行覆盖式 → **分级**（info/warn/error 分色）+ 写入日志历史
- `UI.collapsible`：**概览—详情分层**，列表先概览、按需展开
- 密度切换：紧凑模式隐藏描述、压缩行高
- **8 项隐式默认显式化为设置项**（密度/导航宽度/自动刷新/轮询间隔/日志面板/日志级别/概览模式/折叠阈值），集中到新增「界面设置」视图，支持恢复默认

### 4.5 自由度（C5 C6 C7）

- 快捷键：`Ctrl/⌘+Shift+S` 开关面板、`Esc` 关闭、`Ctrl/⌘+Shift+L` 切日志面板
- 导航宽度 140–320 可配
- 轮询间隔可配（0=关闭；**仅面板打开时轮询**，关闭时不空转）

### 4.6 新增门禁 `check-ui-contract.mjs`（已登记 CHECKS）

常驻校验 6 项：① 语法 ② 基础设施符号 ③ VIEWS 与 `show()` 分派一致 ④ **每个端点必须有 UI 入口**（否则 FAIL，需入白名单并写明理由）⑤ 前端产物同步 ⑥ 设置项可见。

**已做反向证伪**（证明它能变红，不只是存在）：

| 变体 | 结果 |
|---|---|
| 注入无入口端点 `/zzz-canary-no-ui` | 4 PASS / **1 FAIL** exit 1 ✅ |
| 删除基础设施符号 `Cfg` | 4 PASS / **1 FAIL** exit 1 ✅ |
| 制造 `lib/client.js` 产物漂移 | 5 PASS / **1 FAIL** exit 1 ✅ |
| 还原 | **6 PASS** exit 0 ✅ |

### 4.7 顺带修掉的两个真实缺口

1. **`pretest` 只跑 `build:host`，不含 `build:client`** ⇒ 改了 `client.js` 后 `npm test` **不会**同步进 `lib/`，而发布的是 `lib/`（`files` 含 lib）——表现为"改了源码没生效"且**无任何报错**。现由门禁第 ⑤ 项常驻拦截。
2. **换行符假红**：仓内 `lib/client.js` 是 CRLF，npm 发布后规范化为 LF ⇒ 逐字节比对会产生假红。门禁第 ⑤ 项改为**归一化（去 CR）后比对**（实测：去 CR 后 15/15 完全一致）。

### 4.8 查漏补缺（复查发现并已修）

复查不是确认"加了什么"，而是确认"加的东西有没有真的被用上"。结果抓到三类问题：

#### 🔴 P0：`status` ↔ `Log` 无限递归（会让面板崩溃）

我给 `status()` 加了写日志，而 `Log.add()` 遇 `error` 又回调 `status()` ⇒

```
status(msg,'error') → Log.add() → status(msg,'error') → …
RangeError: Maximum call stack size exceeded
```

**任何 error 级状态都会栈溢出**，属于我引入的 P0。
修法：抽出 `setStatusText()` 只更新 DOM；`status() = setStatusText + Log.add`；`Log.add` 内部只允许 `setStatusText`。

#### 🟠 高：`api()` 无埋点 ⇒ 错误定位只覆盖新增的 5 处

原 `api()` 是无上下文的裸 fetch。旧的 **54 处**调用 `.catch(fail)` 失败时只剩 `e.message`，**拿不到端点**——我声称的"错误可定位"当时只覆盖新增的 5 处 `apiCtx`。

修法（最小侵入）：`api()` 统一注入 ctx（method/path/params）+ 耗时，失败时把 ctx 挂到 `error.__ctx`，`fail()` 自动读取 ⇒ **54 处旧调用零改动即获得定位与日志**。

#### 🟡 中：组件层只覆盖新视图（A2 未完全落地）

实测：新组件 `UI.` 在 `renderViewObserve`(23 次) 与 `renderViewSettings`(22 次) 中被使用，但**旧的 15 个 render 函数使用数为 0**。旧代码仍有 **20 处**手工拼 `setting-item`、21 处 `setting-item-info`。

⇒ A2「消除重复实现」**只在新视图落地**，旧视图仍是原样。

**为何本轮不强行改**：15 个渲染函数逐个人工替换风险高，且无法在浏览器中逐视图目视验证，"保持原有功能不回退"优先。已列为下一轮第一优先项（见 §5）。

### 4.9 验收

- `npm test` **exit 0**（**20 pass · 1 xfail · 0 skip**）
- `client.js` 经**最小 DOM 桩实测加载**：模块注册成功、`factory` 执行无异常、20 个新增符号均有定义、VIEWS=8、6 个端点全部接入
- 部署：远端 = 本地 = profile 钉版 = `86ab434`；已安装副本 **15/15 一致**（归一化口径）

---

## 五、剩余项（下一轮）

| # | 项 | 说明 | 优先级 |
|---|---|---|---|
| 1 | **A2 旧视图组件化** | 15 个旧 render 函数仍手工拼 DOM（20 处 `setting-item`）。建议按"结构完全一致的先替、有差异的逐个核对"推进，每替一个跑一次门禁 + 目视核对 | 高 |
| 2 | **C1 进度覆盖旧调用** | 进度条目前仅 `apiCtx` 触发；可让 `api()` 对慢请求（如 >1.5s）自动显示进行中态，覆盖全部 | 中 |
| 3 | **D6 无障碍** | 控件普遍缺 `aria-label`，键盘可达性未验证（仅状态栏有 ARIA、折叠头有 `tabindex`/`Enter` 处理） | 中 |
| 4 | **A6 视图路由/深链** | 切视图未同步 URL，无前进/后退、无深链 | 低 |

---

> 本清单由工程保障团队生成，关键决策请由人类工程负责人复核。
