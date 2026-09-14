# 守藏面板 UI · 实现架构审查（2026-09-13）

> **触发**：用户连续反馈「实际与方案视觉不一样」「是不是前后端的架构逻辑有问题」「是不是前端 UI 这一块的实现架构理论就是有问题的」，并要求按项目铁律**先找可复用的轮子**（AGENTS.md 规则 5：不从零造轮子）。
> **方法**：只读取证 —— ①本机 DSH 自带 `@deepseek-ai/dsh-*` 包清单与导出面；②宿主插槽/主题/设置框架的实际符号；③已装第三方插件的实现范式；④守藏自身 `client.js` 的量化指标。
> **结论（先行）**：**是。UI 实现架构在抽象边界上就跑偏了** —— 不是"实现细节没对齐"，而是把「应用壳 + 设计系统」当成了插件职责。因此补丁式修 CSS 永远追不上方案（本轮实测漂移即为证）。

---

## 一、取证：宿主到底提供了什么

### 1.1 宿主自带完整的 client UI 框架（实测包清单）

`@deepseek-ai/dsh/node_modules/@deepseek-ai/` 下与前端相关的包（存在性已核实）：

| 包 | 作用 |
|---|---|
| `dsh-client-ui-layout` | 布局控制器；**导出 `slots.register / slots.subscribe / slots.entries / slots.provideRoot` 与 `LayoutController`** |
| `dsh-client-ui-settings` | 设置框架（`settings.describe` 等） |
| `dsh-client-ui-settings-plugins` | 插件设置面（`settings.plugin.item / settings.plugins.tab / settings.section`） |
| `dsh-client-ui-theme` | 主题（`THEME_SETTINGS_NAMESPACE` / `THEME_PREFERENCE_FIELD` / 调色板 bootstrap） |
| `dsh-client-ui-sidebar` | 侧栏插槽：**`sidebar.workspaces / sidebar.settings / sidebar.footer.action / sidebar.panellist / sidebar.brand.mark / sidebar.brand.name / panels.label`** |
| `dsh-client-modules` | 浏览器侧模块系统 |
| `dsh-client-connection` | 客户端连接（RPC 通道） |
| `dsh-client-ui-*`（chat / layout / renderer / tool / trajectory / …） | 宿主自用 UI 组件族（约 40 个包） |

**关键**：宿主提供 **slot 注册 API**（`slots.register/subscribe`）+ **主题令牌** + **设置框架** + **面板清单**（`sidebar.panellist` / `panels.label`）。

### 1.2 守藏自己造了哪些"壳"（`client.js` 3856 行）

| 自行实现的层 | 宿主是否已有 | 证据 |
|---|---|---|
| 模态窗 + 左导航 + 视图路由（`VIEWS`/`show()`） | ✅ 宿主 `sidebar.panellist` / 面板承载 | `dsh-client-ui-layout`、`dsh-client-ui-sidebar` |
| 侧栏入口注入 | ✅ `sidebar.footer.action` | 现实现是 `mountSidebarEntry()` 往宿主类 `.hHd-Xa_footerActions` 里塞 DOM（**依赖宿主私有类名**） |
| 界面设置页（密度/轮询/日志/启动视图…） | ✅ `settings.section` / `settings.plugin.item` | 现实现是自建「设置」视图 + 自持久 `localStorage` |
| 设计系统（`--sc-*` 令牌 + 六层 CSS 341 条规则） | ✅ 宿主 `--dsw-alias-*` 主题令牌 + `dsh-client-ui-theme` | 现实现两套并存（宿主变量 + 自有调色板），本轮实测**颜色对不上方案**即源于此 |
| 组件库（UI.item/button/badge/fold/progress/kpi/tabs…） | ⚠️ 宿主组件未导出为公共 API（仅插槽），生态有成熟库可换 | 手写 DOM 工厂 |
| 客户端模块加载（`window.__ModuleLoader__.load`） | ✅ `dsh-client-modules` + `dsh.client` 声明 | `package.json` 已声明 `dsh.client`，却仍手写 loader 调用 |
| 日志/状态栏/进度/折叠态（Bus/Store/Log/Prog/Fold） | ⚠️ 宿主无对应公共 API（这部分**自建合理**） | —— |
| RPC：34 条手写 HTTP 路由 + 手写 `fetch('/api/shoucang-panel'+path)` | ✅ `dsh-client-connection` 等通道 | host 侧 TS 但**无 schema/无类型共享** |

### 1.3 已装第三方插件的范式（横向对照）

| 插件 | js 文件 | 体量 | 用宿主插槽 | 用 React/Preact |
|---|---|---|---|---|
| `@dsh-external/project-nav` | 10 | 115 KB | **0** | **0** |

⇒ 生态现状**普遍也是手搓 DOM**（不求之于宿主插槽）。这解释了"为什么会长成这样"，但**不构成正当性**：按仓规「能从成熟协议/库对接就不自研」，UI 层是守藏唯一没吃到生态红利的地方（后端已用 cordis / schemastery / zod / tsdown）。

---

## 二、理论问题：三层抽象边界错位

### 2.1 边界错位（根因，非细节）

```
宿主（DSH Web）      提供：应用壳 · 插槽 · 主题 · 设置框架 · 连接
   └─ 插件（守藏）    应当负责：内容 + 交互 + 数据
        └─ 现状     却把「应用壳 + 设计系统 + 设置框架」也实现了
```
**后果**：①风格必然漂移（宿主换皮/方案换色都要追两套）；②UI 改动必须重启宿主才能验证 ⇒ 反馈环太长，还原度自然掉；③每加一个视图都要新造一批 `sc-*` 组件，堆叠不可避免（与用户「设计极简抗堆叠」偏好相悖）。

### 2.2 布局范式错误（用户直接观察到的现象）

实测（`client.js` CSS 41,027 字符）：**裸 px 241 处**、`height` 17 处、`width` 16 处、`padding` 32 处写死；弹窗 `min(1040px,100%)×min(720px,100%)`、日志面板 `150px`、网格 `minmax(200px,…)`、字号写死 px。
⇒ 容器一变（宽度/内容行数/字体），不可压缩的元素把可压缩元素**挤出可见区**（KPI 行在 1024 宽直接归零、1280 被切半）。
**理论上应是**：**单一滚动容器 + 完整 `min-height:0` 的 flex 链 + `clamp()/min()/minmax(min(),1fr)` 全流体 + 容器查询**；固定 px 只允许出现在图标、1px 边框这类不参与布局弹性的地方。本轮已改一部分（弹窗 `min(1480px,96vw)×min(900px,92vh)`、`.sc-view{min-height:0}`、字号 `clamp()`、网格 `minmax(min(Npx,100%),1fr)`、日志 `max-height:min(34vh,320px)`）——**但这是补丁，不是范式**。

### 2.3 缺构建层 ⇒ 无法复用生态轮子

`client.js` 是**手写 ES5、无 bundler、无运行时依赖**的单文件。直接后果：用不了任何 npm UI 库（React/Preact/Vue/Web Awesome 都至少要打包或 ESM 引入）。这与"不从零造轮子"铁律正面冲突。

---

## 三、可复用的轮子（已核实存在 / 可选）

| 层 | 首选 | 理由 |
|---|---|---|
| 面板承载 | **宿主 `sidebar.panellist` + `panels.label`** | 宿主原生面板，自动跟随宿主主题/布局 |
| 侧栏入口 | **`sidebar.footer.action` 插槽** | 不再依赖宿主私有类名 `.hHd-Xa_*` |
| 设置页 | **`settings.section` / `settings.plugin.item`** | 设置并入宿主设置中心，删掉自建「设置」视图 |
| 主题 | **`dsh-client-ui-theme` + `--dsw-alias-*`** | 单一真源，删掉自有 `--sc-*` 调色板（保留少量语义令牌做映射） |
| 组件库 | **Web Awesome / Shoelace（web components）** 优先；或 Preact + htm（~3KB） | WC 无框架耦合、CSS 变量可主题化、按需引入；Preact 体量极小 |
| 模块/构建 | **`dsh-client-modules` + esbuild/tsdown 打包** | 仓库其它插件已有 tsdown 先例 |
| 数据/RPC | **`dsh-client-connection`**（或保留 HTTP 但补 schema + 生成类型） | 消除手写路径字符串与无校验 JSON |
| 布局 | **CSS 容器查询 + clamp/min/minmax**（纯标准，不引库） | 流体化不需要依赖 |

---

## 四、目标架构与迁移路径（分阶段，每阶段可回滚）

| 阶段 | 内容 | 风险 | 收益 |
|---|---|---|---|
| **S1** | 布局弹性化收口（已有半成品）+ 主题令牌单一化 + **本地截图回归脚本**（已建） | 低 | 直接消灭「被挤出首屏/写死尺寸」；建立"改一屏看一屏"闭环 |
| **S2** | 侧栏入口/设置页改走宿主插槽，**保留 DOM 兜底**（插槽不可用则回退自有壳） | 中 | 删掉自建设置视图与宿主类名依赖；风格自动跟随宿主 |
| **S3** | 引入构建层 + 组件库，**逐视图**替换手写 DOM（先通用件：KPI/表格/表单/日志） | 中高 | 停止手搓设计系统；与方案对齐成本从"每次手写"降到"改 token" |
| **S4** | RPC 收敛（schema 化 / 走宿主连接），前后端共享类型 | 中 | 消除 34 条手写路由的漂移与错误定位成本 |

**不建议**：继续在现有 `client.js` 上逐条 CSS 对齐方案 —— 那是拿补丁追抽象错位，本轮实测已证明追不上（token 对齐了，结构仍差一屏）。

---

## 五、待用户裁决

本条只做**架构判断与路径**，不动代码。请选择路线：
- **A｜只做 S1**（布局弹性 + 令牌单一 + 截图回归）：最小代价止住"错得离谱"的观感，仍保留自有壳。
- **B｜S1+S2**（+ 插槽化入口与设置）：中等代价，风格自动跟随宿主。
- **C｜S1→S4 全量重排**（含组件库与构建层）：根治，但属于**多轮重构**，期间面板需保持可用。
- **D｜维持现状**，仅按方案继续逐条对齐（不推荐，见 §四末）。

> 审查人：工程保障（agent）· 证据均可复核（包清单/导出面/插件体量/`client.js` 量化指标/多视口截图）。
