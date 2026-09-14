# 守藏面板 · v9 视觉对齐审查（2026-09-13）

> 对照对象：`deliverables/ui-redesign-v9-2026-09-13.html`（v9 原型 · 「优化后」帧）
> 审查对象：**当前面板**（`src-client/body.js` → `client.js`，真机无头渲染）
> 结论：**13 项走样已修 + 3 项结构差异待拍板**；`typecheck`/`build`/`check-runner`(37 pass·1 xfail)/`ui-geo-regress`(93 PASS/0 FAIL) 全绿。

## 一、方法（为什么不是"读代码判断"）

本次**不能直接看图**（当前模型无图像输入），所以视觉结论一律走**渲染级实证**，两件临时工具（`.internal/`，已 gitignore）：

| 件 | 做法 |
|---|---|
| `.internal/vdiff.mjs` | 同一个无头 Chrome 分别渲染**原型页面**与**真实 `client.js`**，对语义等价元素取 `getComputedStyle` + `getBoundingClientRect`，输出并排对照（几何 / 背景 / 前景 / 圆角 / 内距 / 字号 / 字重 / 网格）+ 结构骨架 |
| `.internal/tmp-png-sample.mjs` | 自写 PNG 解码（zlib + 反滤波），**直接采样渲染像素** —— 颜色结论以像素为准，不以 CSS 声明为准 |

### 两条先立的计量纪律（否则会得出反向结论）

1. **无头虚拟时间下 CSS transition 不推进**：实测选中态导航项 `act.getAnimations()` 恒为
   `CSSTransition/running/currentTime=0` ⇒ 所有"点选后才变化的属性"被冻在**起始值**。
   首轮读数把「导航选中态」判成 `oklab(0 0 0 / 0)`（像素亦为 `#171719`）——**是测量假象，不是 UI bug**。
   ⇒ 两侧统一注入 `transition:none !important` 后复测，才拿到真值（这 4 条曾被误判为"选中态丢失"）。
2. **夹具语法错 → 依赖数据的视图整片空白**：`FIX` 少一个 `}` 导致 `fetch` 脚本 SyntaxError，
   记忆/画像等视图渲染为空 —— 若不复核 `window.onerror`，会被误读成「面板缺块」。

## 二、逐项对照（原型值 ← 改前 → 改后）

| # | 项 | v9 原型 | 改前 | 改后 | 判据 |
|---|---|---|---|---|---|
| 1 | 导航宽 | 216px | **200px** | **216px** | 几何 ✅ |
| 2 | 导航内距 | 14/10/10 | 12/8 | **14/10/10** | 几何 ✅ |
| 3 | 导航标题 | 10.5px/700/0-10-6 | 10.5px/**400**/4-12-12 | **10.5/700/0-10-6** | 几何 ✅ |
| 4 | 导航项 | 195×**37**，8/10，gap10 | 183×**34**，8/12，gap8 | **195×37，8/10，gap10** | 几何 ✅ |
| 5 | 选中态底 | 实色 `#251f3a` | 派生色合成 ≈`#2e293d`（偏亮偏蓝） | **`#251f3a`** | **像素**：原型 `#251f3a` / 改前 `#171719`(假象) / 改后 `#251f3a` ✅ |
| 6 | 页头 | `flex:none` 固定 + 18/24/14 + 全宽底分隔 | **在滚动区内**（滚动即消失），内距 0 0 12 | **固定**（`.sc-headslot`）+ 18/24/14 + `--sc-border2` | 几何：滚动 156px 后页头 y 恒 33 ✅ |
| 7 | 页头字号 | h1 17px / desc 12.5px | 15 / 12 | **17.04 / 12.37** | 几何 ✅ |
| 8 | 内容区内距 | 18 / 24 / 26 | 18.9 / 25.2 / 31.6 | **18.3 / 24.0 / 25.2** | 几何 ✅（clamp 保弹性） |
| 9 | KPI 卡 | **220×110**，内距 13/14 | 231×**103**，内距 12/14 | **227×110，内距 13/14** | 几何 ✅ |
| 10 | KPI 数字层 | `k-val` 26px / lh1.15 / margin 5-0-1；`k-top` 11.5；`k-sub` 11 | 20.19px（clamp 太小）/ 12 / 12 | **25.87px / 11.5 / 11** | 几何 ✅ |
| 11 | KPI 进度条 | 高 **6px** · 轨 **#33333a** · 圆角 3 | 高 4px · 轨 #232327 · 圆角 999 | **6px · #33333a · 3px** | 几何 ✅ |
| 12 | 凸卡体系 | 卡面 `#2a2a2f`（比页面亮一档） | `.sc-fold`/`.sc-mem-stat` 被**后置 `--sc-bg1` 覆盖** ⇒ 与页面同色（发平） | **`#2a2a2f`** | **像素** ✅ |
| 13 | 徽标 / 状态栏 / 日志 | 徽标 29px(4/10,12px) · 状态栏 7/16,11.5px · 折叠条单行 | 徽标 31px · 状态栏 8/24,12px · 折叠条 **47px**（超门禁 44） | **29px · 7/16,11.5px · ≤44px** | 几何 + `ui-geo-regress` ✅ |

补充：根字号 16 → **13px**（对齐 v9 `body 13px/1.6`，此前继承宿主 16px 使未显式定字号的文本大一档）；
新增令牌 `--sc-border2`（v9 的 `--border2`，深色 `#33333a`）与 `--sc-accent-soft`（选中态实色）。

## 三、本轮**未动**的结构差异（须拍板，不计入"已完成"）

> ⚠ **更正（第二轮，2026-09-13）**：下面第 2 条此前写的「面板概览缺 6 张内容卡」是**误判**——当时出图夹具的 `FIX`
> 少一个 `}`，`fetch` 脚本语法错 ⇒ 依赖数据的视图整片空白，我把「空视图」读成了「缺块」。实测面板概览含
> 「本月成长 + 系统状态」，只是组织方式与 v9 不同（v9 为两栏卡片 + 卡头路由 chip）。

1. **分段控件仍是组件库**：面板走 `<wa-tab-group>`（实测 tab 高 **43px**、下划线式），方案是 `.tabs` 胶囊分段（高 **28px**、激活底 `--panel3`）。
   —— S3 的组件库决策，改需同步改 `ui-geo-regress` 里 4 条 `wa-tab-*` 断言与 `check-css-usage` 白名单。
2. **概览页信息组织不同**：方案概览把「成长 / delta 指针 / 24h 时间线 / 运行态 / 判据 / 快捷操作」做成**两栏卡片**；
   面板是「本月成长 + 系统状态」两个全宽分节（内容在，容器层级不同）。

   这是**信息架构**差异（不是样式走样），要不要把 6 张卡并回概览页需产品拍板。
3. **页头 `acts` 缺失**：方案页头右侧有「路由 chip（`/memory/overview ·`）+ 指南 ghost 按钮」，面板页头只有标题+描述（路由信息以 badge 形式落在内容区）。

次要未对齐（记录，不阻塞）：`.sc-badge`（1/8 内距、18px 行高）与方案 `.badge`（4/10、29px）非同构；
状态徽标字重 500（方案 `.badge` 400 / `.pill` 500，面板两处共用同一类）；面板模态宽 `min(1480px,96vw)` vs 方案 frame `max-width:1180`。

## 四、证据与复现

```bash
# 渲染级对照（默认 1280×900；可换视图/视口）
node .internal/vdiff.mjs overview 1280 900            # 令牌 + 元素并排
node .internal/vdiff.mjs memory  1280 900 --skel      # 追加结构骨架
node .internal/vdiff.mjs overview 1280 900 --shotdir .dsh-vision-toolkit/artifacts/v9cmp
# 像素采样（颜色结论）
node .internal/tmp-png-sample.mjs .dsh-vision-toolkit/artifacts/v9cmp/m-proto.png 149,167
node .internal/tmp-png-sample.mjs .dsh-vision-toolkit/artifacts/v9cmp/m-panel.png 133,121
# 出图（8 视图真机）
node .internal/panel-shots.mjs .dsh-vision-toolkit/artifacts/v9cmp
```

出图目录 `.dsh-vision-toolkit/artifacts/v9cmp/`：
- 原型：`v9-<page>.png`（8 页）
- 面板**改后**：`panel-<view>.png`（8 视图）
- 面板**改前**：`shot-overview.png` / `shot-params.png` / `shot-settings.png`（本会话开始时由 `ui-geo-regress --shots` 产出）
- 同夹具对照：`m-proto.png` / `m-panel.png`

## 五、验收记录（2026-09-13）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | 0 错 |
| `npm run build`（host + client） | 成功（client 726541 B） |
| `node scripts/check-runner.mjs` | **37 pass · 1 xfail · 0 fail** |
| `node scripts/ui-geo-regress.mjs` | **93 PASS / 0 FAIL**（含 1024/1280/1600 三档视口 × 5 视图） |
| `check-panel-contract` + `gen-panel-contract --check` | ✅ 三向一致 |
| 已安装副本 | `client.js` sha256 与仓内**逐字节一致**（改前已备份 `.bak-<时间戳>`）；`check-installed-sync` 0 件内容不同 |
| CHANGELOG | `[Unreleased] § Changed` 已记一行（`check-changelog` ✅） |

> 生效提示：宿主需**用户侧热重载/刷新**才会加载新 `client.js`（部署只覆盖了差异文件，未重启宿主）。

## 六、第二轮（2026-09-13）：先打通视觉通道，再做结构/层级对齐

### 6.1 「看不见」这件事的真因（比 UI 本身更关键）

| 步骤 | 结论 |
|---|---|
| 症状 | `read_image` 恒报 `model "deepseek-flash" does not declare image input` |
| 我此前的判断 | 「当前模型无图像输入 ⇒ 只能靠程序化像素/几何做实证」——**错** |
| 冒烟实验 | 合成 640×400 探针图（数字 `7391` + 红/绿/蓝方块 + 底行英文），直发 `opencode-go-custom` 端点：**当前模型 `deepseek-flash` 全部读对** |
| 真因 | `~/.dsh/settings.yaml` 的 `opencode-go-custom.models[deepseek-flash]` **缺 `input: [text, image]`**；provider 的 `/models` 不返回模态元数据 ⇒ DSH 默认按纯文本处理（GOAT 条目 `deepseek-v4.1-flash` 的注释早已记录同因同解） |
| 处置 | 增量补声明 + 备份 `settings.yaml.bak-visioninput-<时间戳>`；**无需重启**，`read_image` 立即恢复 |
| 副产物 | 夹具缺陷：`client.js` 含 `<!--`，内联进 `<script>` 会触发 script-data-escaped，把脚本漏成页面文本 ⇒ 夹具改外部文件 `src` 引用 |

### 6.2 多板块 / 多层级对齐（v9 层级 = 页头 → 卡片 → 卡内小节 → 行）

| 项 | v9 | 改前 | 改后 |
|---|---|---|---|
| 卡片层 | `.card > .hd/.bd`（卡头 11/14 · 12.5px/620 · 底分隔 `--border2`；卡体 13/14） | **无该层**（分节标题 + 平铺卡片） | 新增 `UI.card()` 原语；记忆板块三块升级为卡片 |
| 卡内嵌套 | 卡体是**纯列** | 卡里再套 `.sc-mem-stat` 卡 | `.sc-card-bd .sc-mem-stat` 去边框/底色/内距 |
| 卡内边距 | 末元素无边距 | 网格自带下边距 24px ⇒ 卡底 24px 暗带（实测卡体 221px） | 首末边距归零 → **189px** |
| 页头 | 路由 chip 行（`.pagehead .src`） | 无 | `UI.pageHead(t,d,{routes})`，10 视图接真实端点 |
| KPI 顶行 | 状态色点 + 标签 | 只有标签 | 7px 色点（四态，`fill()` 同步） |
| 徽章 | `标签 <b>值</b>` + 语义底 | 值不加粗、`ended` 灰 | 值加粗；`ended` 转绿语义底 |
| 告警 | `.alert.warn` 琥珀 | 一律红 | 「待处理」琥珀，红只留真错误 |
| 数字 | `3,204` / `3,100 / 5,000` | 裸数字 | `Derive.num()` 千分位（KPI + 状态栏 + 说明） |

### 6.3 仍待拍板（不在「已完成」内）

1. 分段控件：组件库 `wa-tab-group`（43px 下划线）↔ v9 `.tabs`（28px 胶囊）——改需同步改门禁断言；
2. 页头右侧 **搜索框 + 刷新按钮**（v9 有，面板无）；
3. 概览「本月成长 / 系统状态」做成 v9 的**两栏卡片**（现为全宽分节）。

> **✅ 第三轮（目标模式 · 一次做完）三项已全部落地**：
> ① 分段控件**保持组件库**，按**实测部件名**（`wa-tab-group::part(nav/tabs)` + `wa-tab::part(base)`）改造成
> v9 胶囊分段（tab 45 → **30px**，关掉下划线指示器），`wa-tab-*` 门禁断言**零改动**；
> ② 页头右侧**搜索框 + 刷新按钮**已接（总览/记忆库/运行观测 + 10 视图刷新），搜索复用 `.sc-filtered` 只过滤列表行；
> ③ 概览「本月成长 / 系统状态」= **两栏卡片**（`minmax(0,1.3fr) minmax(0,1fr)`，≤900px 堆叠）。
> 另收口：深睡/运行观测分节升级为卡片、导航脚 = v9 `.nav-foot` 状态块（状态点 + 状态词 + 副行）。
>
> 过程中抓到并修掉**两个自己引入的真 bug**：**页头被嵌套调用覆盖**（设置页显示成「配置原文」⇒ 加渲染轮次，
> 每轮只认首个页头）；**卡片挂错根**（挂 `host` ⇒ 卡中卡；挂固定 pane ⇒ 各 pane 的卡全串进 run pane；
> 改为向上找 `.sc-tabpane`）。卡片探针实证：`depth=1`、非活动 pane 的卡 `0x0`（隐藏正确）。

### 6.5 第四轮：**块级**对照（前三轮只对了原子，这是"还是完全不一样"的根因）

新增 `.internal/blocks.mjs`：把**原型 `.view` 直接子块**与**面板 `.sc-view`/固定页头槽直接子块**并排拉出
（类名 + 实测尺寸 + 首段文字），逐页定差异。结论表：

| 页 | v9 原型 `.view` 块序列 | 面板（改前） | 处置 |
|---|---|---|---|
| **记忆库** | **1 张卡「容量占用」**（三列容量 + 口径说明 + **卡内 tabs** + 卡内小节 + 行） | 页级 `.sc-tabbox` 包 7 张卡 ⇒ **层级反了** | ✅ 重排为 卡「容量占用」{ 三列容量 · 说明 · tabs · 卡内小节 }；卡内不再套卡；徽章行移到卡前 |
| **画像** | kpis → stat2 → card 成熟度分布 → **card USER.md** → **card AGENT.md** → bp-note | kpis → 分节标题 + 裸列表 | ✅ USER/AGENT 各成一张卡（卡头 + 路由 chip + 卡体指针行）+ 末尾注脚；stat2/成熟度分布**无数据源未造** |
| **深睡** | 6 张卡（状态机 / 状态分布 / 产出回执 / 材料预估 / 最近会话 / 睡眠期自检） | 3 张卡 + 标题式分区 | ⚠ 实体分区已按页面出卡（`renderCognitionReport` 随 mode 出卡/标题）；**状态机 / 状态分布 / 最近会话三块面板无对应数据源** |
| **参数 / 设置** | `.tabs → .pane.on`（行式平铺） | `.sc-tabbox → pane` | ✅ 同构（未动） |
| **运行总览** | badges → alert → 3 操作卡 → 4 KPI → 两栏卡片 | 同 | ✅ 同构 |
| **运行观测** | 4 KPI → 执行进度卡 → `.tabs`（调用日志/错误定位/运维操作） | 6 个折叠条 | ⚠ 组成仍不同（下一步） |
| **插件集合** | 卡片网格 `.grid2 > .pcard` | 卡网格（夹具无成员 ⇒ 显示"无成员数据"） | ⚠ 需有真实成员数据才能逐块比对 |

**层级决策（已写进源码注释）**：`group()` 出**卡片**还是**标题**随页面定 —— 原型用 `.card` 表达**同级区块**、
用 `.min` 小节标题表达**卡内分区**；"一律卡片化"会把卡内分区也变成卡（卡中卡），是错的方向。

**可审阅产物**：`deliverables/v9-compare/index.html` —— 8 视图**并排图**（左 v9 / 右面板）+ 上述块级差异表，
双击即可看图核对（含图，整体可拷走）。


### 6.6 验收（累计到第四轮）

`typecheck` 0 错 · `build` 成功 · `check-runner` **39 pass · 1 xfail** · `ui-geo-regress` 绿 ·
已安装副本 sha256 一致 · **逐图复核**（`panel-*.png` ⟷ `v9-*.png`，8 视图同视口）。
