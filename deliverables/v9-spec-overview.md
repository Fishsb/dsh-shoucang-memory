# v9 原型 · 运行总览页 规格说明

> 来源：`deliverables/ui-redesign-v9-2026-09-13.html` 的 `<div id="newFrame">` → `section[data-page="overview"]`。
> 本文只描述**原型**（设计意图与精确样式），不对现状面板做改动建议；文末附「现状对照」简表供逐项对齐用。
> 所有数值取自原型 CSS 原文，可直接当实现验收判据。原型数据为示意值。

---

## 0 · 页面容器（外壳，非本页专有）

| 元素 | 样式 |
|---|---|
| `.frame` | `max-width:1180px`；`height:min(720px,100%)`；圆角 `--r-l`(14px)；阴影 `--sh-3`；`display:flex` |
| `.nav` 左导航 | 宽 `--nav-w`(216px)；`background:--panel2`；右 1px `--border`；`padding:14px 10px 10px`；`flex-direction:column` |
| `.nav-title` 分组标题 | 10.5px / 700 / 字距 .9px / `uppercase` / 色 `--faint`；`padding:10px 10px 6px` |
| `.nav-item` 导航项 | `padding:8px 10px`；圆角 `--r-s`(6px)；13px；色 `--muted`；图标 16px `opacity:.85` |
| `.nav-item.on` | 背景 `--brand-soft`；色 `--brand`；字重 600 |
| `.nav-foot` | `margin-top:auto`；上边框 1px；含健康行（7px 圆点 `.live` 呼吸动画 + 「记忆库 **正常**」）+ 小字「vault · 已激活」11px `--faint` |
| `.main` 内容区 | `flex:1`；column |
| `.pagehead` 页头 | `flex:none`；`padding:18px 24px 14px`；**下边框 1px `--border2`**；`display:flex`；`gap:14px`；`align-items:flex-start` |
| `.pagehead h1` | 17px / 650 / 字距 .2px |
| `.pagehead p` | `margin-top:3px`；12.5px；色 `--muted`；`max-width:640px`；行高 1.55 |
| `span.src` 端点 chip | `inline-block`；`margin-left:8px`；`padding:0 6px`；圆角 4px；10.5px / 行高 16px；等宽字体；色 `--faint`；背景 `--panel2`；边框 1px `--border2` |
| `.pagehead .acts` | `margin-left:auto`；`display:flex`；`gap:8px`；`flex:none` |
| `.view` 内容滚动区 | `flex:1`；`overflow:auto`；`padding:18px 24px 26px` |

---

## 1 · 页头（本页内容）

- **标题**：`运行总览`
- **描述**：「一屏回答「现在怎么样」。徽章行 = 原记忆板块 §0 的 7 枚状态徽章，整体提升为独立首屏。」
  + 端点 chip `/memory/overview · /cognition/report · /mcl/status`
- **右侧 `.acts`**（**只有两件东西**）：
  1. `.btn.ghost` 刷新按钮：图标（循环箭头 14px）+ 文字「刷新」
     - `.btn.ghost` = 边框透明 + 背景透明 + 色 `--muted`；hover 背景 `--hover` 色 `--text`
  2. `.proto-note` 虚线注记：「蒸馏执行位：下方操作卡（本页仅一处）」
     - 样式：`border:1px dashed --border`；背景透明；色 `--faint`；11.5px；圆角 8px；`padding:3px 8px`
- **设计意图**：`.proto-note` 是**原型批注专用样式**——与真实产品控件（`.btn` 实色胶囊）在视觉上明确区分，避免读者把"设计说明"当成界面元素。全站每页至多一枚，用来标注「本页唯一的执行位在哪」。

---

## 2 · `.badges` 徽章行（7 枚）

**容器**：`display:flex`；`flex-wrap:wrap`；`gap:6px`；`margin-bottom:12px`

**`.badge`**：`inline-flex`；`align-items:center`；`gap:6px`；`padding:4px 10px`；`border-radius:999px`；12px；
背景 `--panel2`；边框 1px `--border2`；色 `--muted`
- `.badge b`（**变化的那段值**）：色 `--text`；`tabular-nums`
- 语义变体：`.ok` → 色 `--ok` / 背景 `--ok-soft` / `border-color:transparent`；`.warn` / `.info` 同理

**7 枚内容与语义**（顺序即重要性）

| # | 类 | 内容 | 语义 |
|---|---|---|---|
| 1 | ok | 蒸馏 · 2 分钟前 | 最近一次蒸馏距今时间 |
| 2 | info | 向量 **fusion** | 向量召回当前模式（lexical / fusion / gpu-ready） |
| 3 | warn | 候选 **9** | pending 候选条数（>0 即 warn 色） |
| 4 | ok | 记忆库 · 正常 | 容量健康 |
| 5 | ok | 认知环 快 **23**/慢 **7** | MCL 双通道计数 |
| 6 | ok | 判据台账 · 已就绪 | 判据台账可读 |
| 7 | ok | 库版本 · 已启用 | 记忆库 git 版本可用 |

**功能**：这一行是 v9 的第一个设计主张——把原先埋在「记忆板块 §0」里的 7 枚状态徽章**整体提升为总览首屏第一行**，做到"一屏回答现在怎么样"。
**数据**：`/memory/overview`(distill/pending) · `/vector/status2` · `/mcl/status` · `/criteria`——**零新增端点**。

---

## 3 · `.alert.warn` 异常置顶告警条

**样式**：`display:flex`；`gap:9px`；`align-items:flex-start`；`padding:10px 13px`；圆角 `--r-s`(6px)；
12px / 行高 1.55；`margin-bottom:14px`
- `.alert.warn`：背景 `--warn-soft`；色 `--warn`；`border:1px solid color-mix(in srgb, --warn 22%, transparent)`
- 图标 `svg`：15px；`flex:none`；`margin-top:1px`（三角警告）
- 变体：`.alert.ok`（ok 色）/ `.alert.info`（info 色）同理；另有 `.alert.err`（错误态场景用）

**内容**：`<b>2 项待处理</b> —— 候选区 1 条成熟度已达升格线；嵌入服务 30 分钟内超时 2 次。` + 链接「前往处理」（色 `var(--brand)`）

**功能**：**异常置顶**原则——页面第一条就是"待处理项"，出现即抢占视线，无异常时整块不渲染。
**数据**：`pending.count` + 嵌入服务超时计数（本地 Store）。

---

## 4 · `.acts-grid` 操作卡组（3 张 `.act`）

**容器**：`display:grid`；`grid-template-columns:repeat(auto-fit, minmax(238px,1fr))`；`gap:12px`；`margin-bottom:16px`

**`.act`**：`border:1px solid --border`；圆角 `--r-m`(10px)；`padding:12px 14px`；背景 `--panel`
（注：原型里 `.act` 与 `.stat-box` **共用一条规则**——两者是同一视觉体）

| 子元素 | 样式 |
|---|---|
| `.t` 标题行 | `flex`；`gap:8px`；600；色 `--text`；13px |
| `.ic` 图标砖 | 26×26；圆角 8px；`background:--brand-soft`；色 `--brand`；居中；内 svg 15px |
| `.d` 描述 | `margin-top:6px`；12px；色 `--muted`；行高 1.6 |
| `.f` 底部行 | `margin-top:9px`；`flex`；`gap:8px`；`.sp` 为 `flex:1` 把内容推向两端 |
| 底部左 | `span.src` 端点 chip |
| 底部右 | `.btn.sm.primary`（`padding:4px 10px`；12px；primary = 背景 `--brand` + 白字 + 600） |

**三张卡**

| # | 图标 | 标题 | 描述 | 端点 | 按钮 |
|---|---|---|---|---|---|
| 1 | 星芒 | 立即蒸馏 | 遍历根会话蒸馏，携带 pending 候选回流。等价于等 10 分钟空闲自动触发。 | `POST /distill/run` | 蒸馏 |
| 2 | 月牙 | 立即进入深睡 | 离线回想，提炼「[原则]/[路径]」并做结构整理与归档（禁直删）。+ 橙字「预计 1–3 分钟。」 | `POST /deepsleep/trigger` | 深睡 |
| 3 | 勾 | 运行自检 | 校验判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账六项。+ 橙字「超时上限 180s，执行期间请勿关闭。」 | `POST /selfcheck/run` | 自检 |

**设计意图**：用「图标 + 标题 + 说明 + 端点出处 + 执行按钮」的**完整卡片**替代旧的纯按钮排；
按钮文案按动作命名（蒸馏 / 深睡 / 自检），**不再统一叫「执行」**（旧版 8 个按钮都叫"执行"，无法分辨）。

---

## 5 · `.kpis` 状态 KPI 条（4 张 `.kpi`）

**容器**：`display:grid`；`grid-template-columns:repeat(4,1fr)`；`gap:12px`；`margin-bottom:16px`
（≤900px 降为 2 列）

**`.kpi`**：背景 `--panel`；`border:1px solid --border`；圆角 `--r-m`；`padding:13px 14px`
- hover：边框 `--brand-line`；阴影 `--sh-2`；`transform:translateY(-1px)`

| 子元素 | 样式 |
|---|---|
| `.k-top` | `flex`；`gap:7px`；11.5px；色 `--muted`（前置 7px 语义 `.dot`；也可放 13px svg，`opacity:.7`） |
| `.k-val` | **22px / 680**；字距 `-.3px`；`margin:5px 0 1px`；`tabular-nums`；行高 1.15 |
| `.k-val.txt` | **17px / 600**；字距 0 —— **文字型主值**（如「浅睡」） |
| `.k-sub` | 11px；色 `--faint` |
| `.k-bar` | 高 **5px**；圆角 3px；背景 `--border2`；`overflow:hidden`；`margin-top:9px`；`i` 高 100% |
| `.k-bar i` | 背景 `--brand`；`.kpi.ok` → `--ok`；`.kpi.warn` → `--warn`；`.kpi.err` → `--err`；`.info` 类 → `--info` |

**四张卡**

| # | 状态类 | dot | 标题 | 主值 | 副标 | 条宽 / 色 |
|---|---|---|---|---|---|---|
| 1 | `.warn` | warn | 记忆库容量 | `62%` | 3,100 / 5,000 字符 | 62% / warn |
| 2 | `.ok` | ok | 蒸馏水位 | `36` | 本轮蒸馏事件 · 上次 2 分钟前 | 96% / ok |
| 3 | —（无） | info | 深度睡眠 | **浅睡**（`.txt`） | 距深睡整理还有 4 小时 | 45% / info |
| 4 | `.ok` | ok | 向量档 | `3,204` | 行 · 已启用 · RRF k=60 | 100% / ok |

**设计意图（本版主题「容量组件统一 + KPI 条共线」）**
- 四张卡的**进度条顶边必须共线**。数字型主值（22px）与文字型主值（「浅睡」）若同字号，中文会显得比数字还重 ——
  故引入 `.k-val.txt`（17px/600）**压缩文字型主值高度**，使 `k-val + k-sub` 总高一致 ⇒ 四根条自然对齐。
- 语义色统一走 `dot` + `k-bar i` 两处，避免"同一条卡两种语义色"。

---

## 6 · 主体两栏

**容器**（原型为**内联样式**，无类名）：
`display:grid; grid-template-columns:1.35fr 1fr; gap:14px;`

### 左栏

#### 6.1 card「本月成长」
**`.card`**：背景 `--panel`；`border:1px solid --border`；圆角 `--r-m`；`overflow:hidden`；`margin-bottom:14px`
- `.hd`：`padding:11px 14px`；下边框 1px `--border2`；`flex`；`gap:8px`；12.5px / **620**
  - `.sub`（此处「2026-09」）：400 字重；色 `--faint`；11.5px
  - `.right`：`margin-left:auto`；`flex`；`gap:8px`；400 字重（此处放 src chip `/memory/overview · growth`）
- `.bd`：`padding:13px 14px`

**内容**：内嵌一个 `.kpis`（仍是 4 列栅格）放 **3 张无条的 `.kpi`**

| dot | 标题 | 主值 | 副标 |
|---|---|---|---|
| brand | 深睡归纳 | 18 次 | 习得 42 · 替换 7 · 画像 11 |
| info | 蒸馏 | 128 次 | 成功 121 · 异常 4 · 预筛跳过 31 |
| ok | AGENT 画像 | 63 行 | 原则 41 · 路径 22 · 2,880 字符 |

> 细节：3 张卡放进 4 列栅格 ⇒ **右侧留 1 列空位**（原型即如此，不是渲染缺陷）。

#### 6.2 card「晨起摘要」
- `.hd`：标题 + `.sub`「delta · 剩余 6h 有效」 + right src `/memory/overview · delta / weekDiff`
- `.bd`：3 × `.row`

**`.row`**：`display:flex`；`gap:11px`；`padding:10px 14px`；下边框 1px `--border2`（最后一行无）
- hover：背景 `--panel2`
- `.title`：13px / 520
- `.desc`：11.5px；色 `--faint`；`margin-top:1px`
- `.right`：`margin-left:auto`；`flex`；`gap:9px`；11.5px；色 `--muted`

**`.pill`**：`inline-flex`；`gap:5px`；11px；`padding:2px 8px`；`border-radius:20px`；背景 `--hover`；色 `--muted`；500 字重；`nowrap`
- 变体 `.ok / .warn / .info / .brand` → 对应 `--*-soft` 底 + 主色
- `.pill.mono` → 等宽字体

| 标题 | 描述 | 右侧 |
|---|---|---|
| 部署链路最后一跳是用户热重载 | 来源：notes/lessons.md §部署 | `.pill.mono` injections 14 |
| G-20 读方根因 = resolveWatermark 返回 null | 来源：notes/flows.md §蒸馏 | `.pill.info` 路径 |
| 近 7 天深睡新习得 12 条 | weekDiff.deepAdded | `.pill.ok` +12 |

#### 6.3 card「最近动态」
- `.hd`：标题 + `.sub`「最近 24 小时」 + right **2 枚 `.pill`**（蒸馏 12 次 / 整理 3 次）
- `.bd`：`.tl` 时间线
  - `.tl`：`position:relative`；`padding-left:20px`；`::before` 竖线 `left:5px; top:6px; bottom:6px; width:1px`；色 `--border`
  - `.tl-item`：`position:relative`；`padding:0 0 15px`（最后一条 0）
  - `.tl-item::before`：9×9 圆点；`left:-18px; top:5px`；背景 `--panel`；边框 **2px** `--brand`；`.ok` → `--ok`；`.warn` → `--warn`
  - `.tl-t`：12.5px / 520；`.tl-d`：11.5px `--faint` `margin-top:2px`；`.tl-time`：11px `--faint` `tabular-nums`

| 状态 | 标题 | 说明 | 时间 |
|---|---|---|---|
| ok | 蒸馏完成 · 12 条事件入库 | 写入 MEMORY.md 2 条、notes/ 3 条；悬空指针 0 | 2 分钟前 |
| ok | 画像升格 · USER.md +1 条 | 「偏好：先给结论」由 pending 升格为正式画像 | 26 分钟前 |
| warn | 容量预警 · USER.md 达 78% | 建议在下一次深睡中执行画像压缩 | 1 小时前 |
| — | 深度睡眠整理 · 合并 2 个重复小节 | 结构操作：merge ×2，无删除（禁直删策略） | 6 小时前 |

### 右栏

#### 6.4 card「系统状态」
- `.hd`：标题 + right src `/mcl/status · /inject/stats`
- `.bd`：4 × `.row`

| 标题 | 描述 | 右侧 pill |
|---|---|---|
| 当前根目录 | vault · 已激活 | `.pill.ok` 已激活 |
| MCL 认知环 | 熟悉度 0.52 · 慢通道 | `.pill.brand` 慢通道 |
| 注入统计 | 本次会话 14 次 · 最近 14:02 · root=./shoucang | `.pill` 14 |
| 嵌入服务 | provider=ollama · bge-m3 · 可达 | `.pill.ok` 可达 |

> 注：原型这里给了 4 行；v9 说明文档里另有「系统状态卡**只有一行**（当前根目录）」的说法 —— 两处不一致，
> 以实现为准（DOM 是 4 行）。

#### 6.5 card「判据与重排门」
- `.hd`：标题 + `.sub`「现状已有（L2912）· 仅改归属」 + right src `GET /criteria`
- `.bd`：`.mini` + `.bp-note`
- **`.mini`**：`display:grid`；`grid-template-columns:auto 1fr auto`；`gap:4px 12px`；12.5px
  - `.k` 色 `--muted`；`.v` 色 `--text` `tabular-nums`；**第三列是空 `<div>`**（栅格占位）

| k | v |
|---|---|
| 判据版本 | v2.2.0 |
| 台账行数 | 1,284 |
| notes 告警阈值 | 8,000 |
| 重排门 | 1,204 / 200 · 行数门已达 · 连败门 0/2 · enabled=false |
| 库版本 | 417 提交 |

- `.bp-note`（12.5px `--faint`）：「健康度 health.R / K 与 caps 需读取 criteria-gate.json 后填充，留白待接。」

#### 6.6 card「快捷操作」
- `.hd`：**仅标题**（无 sub / 无 right）
- `.bd`：内联 `display:flex; flex-wrap:wrap; gap:8px;` + 4 个默认 `.btn`（非 primary）
  - 测试嵌入连通 · 根目录引导 · 成熟度扫描 · 账本对账

---

## 7 · 页面级设计主张（v9 相对前版的改动点）

1. **KPI 条共线** —— 靠 `.k-val.txt`（17px/600）让文字型主值与数字型主值等高（见 §5）。
2. **异常置顶** —— `.alert` 是 `.badges` 之后的第一块，且无异常时不渲染（见 §3）。
3. **每页唯一执行位** —— 页头 `.proto-note` 明确标注"执行位在哪"，避免同一动作在全站多处重复出现（见 §1 / §4）。
4. **按钮按动作命名**（蒸馏 / 深睡 / 自检），废弃笼统的「执行」。
5. **端点出处可见** —— 每块卡片的 `.hd .right` 或 `.act .f` 都带 `.src` chip 标注数据来源端点，
   让"这块数据从哪来"在界面上可追溯（这是本原型的核心工程性主张）。
6. **批注与产品控件分离** —— 设计说明一律 `.proto-note`（虚线），不与 `.btn`（实色）混淆。

---

## 8 · 响应式

- `@media (max-width:900px)`：`.kpis { grid-template-columns:repeat(2,1fr) }`；`.frame { height:auto; min-height:640px }`
- 原型只画了这一个断点（现状 `client.js` 另有 7 个断点，见施工图纸 ⑬）。

---

## 9 · 现状面板对照（供逐项对齐，不含结论）

| 区块 | 原型 | 现状面板 | 差异性质 |
|---|---|---|---|
| 页头 acts | 刷新（ghost）+ `.proto-note` | 刷新 + 端点 chip 等 | 待核 |
| `.badges` | 7 枚，无边框语义底色 | 有 `.sc-ds-badges` 行 | 数量/形态待核 |
| `.alert` 异常置顶 | 有 | 待核 | — |
| `.acts-grid` | 3 张 `.act`（图标 + 描述 + 端点 + 按钮） | `.sc-opgrid` 3 卡 | 形态接近，细节待核 |
| `.kpis` 4 张 | 4 列固定，条 5px 共线 | `.sc-kpis` 4 列 | 条高/共线待核 |
| 两栏 1.35:1 | 左 3 卡 / 右 3 卡 | `.sc-cols2` | 列比与卡数待核 |
| 「本月成长」3 KPI | card 内嵌 `.kpis` | 待核 | — |
| 「判据与重排门」 | `.mini` 5 组 k/v | 现状该卡在深睡页 | 归属不同 |

> 逐项对齐时以 §2–§6 的**精确数值**为验收判据；出图（`ui-geo-regress --shots`）做形态复核。
