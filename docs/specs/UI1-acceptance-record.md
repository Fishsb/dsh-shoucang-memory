# UI1 · 面板架构整理 —— 验收记录（2026-09-15）

> 配套：`UI1-panel-architecture-plan.md`（方案）· `UI1-panel-architecture-acceptance.md`（验收方案）
> · `UI1-adversarial-review.md`（两轮对抗判因）
>
> **口径**：**全绿方进** · **先红后绿** · **统计一律 node 解析**（PowerShell 对本文件给过 5117 的偏差值）。

---

## 1. 五卡逐条验收

### U0 · 让纪律可见 — ✅ 完成

| # | 断言 | 实测 |
|---|---|---|
| U0-a-1 | `check-module-growth` 支持**多根 + `.js`** | ✅ `src-client/body.js` 出现在输出中 |
| U0-a-2 | **先红**：改门后首跑必须报 | ✅ 报 **`[硬顶] 5476 > 1000`** —— ⚠ 与预想**形式不同**：**硬顶先判** ⇒ 由此发现"登记基线也过不去" ⇒ 引入**临时硬顶豁免**（`HARD_CAP_EXEMPT`，拆完须清空） |
| U0-a-3 | 冻结基线 = node 解析值 | ✅ **5476**（口径 `lineCountOf` 去末尾空行；`split('\n').length` 得 **5477** —— 差 1，已写入源码注释） |
| U0-b-1/2/3/4 | `check-ui-components` 双向对账 + 局限声明 + 反例自证 | ✅ import 7 / 使用 10 双向一致；**上线第一次运行即抓到 `wa-select` 未注册**；**归一化口径**（import 用组件名 `button`、代码用标签 `wa-button`）须补前缀，否则两向全不匹配 |
| U0-c-1 | `src-client` 解析可读性 | ✅ 5 文件 CJS/ESM 双试（`entry`/`vendor` 是 ESM，`body` 是 IIFE+CJS）· 含 **A4「IIFE 后禁 import」**（**实测踩过两次**：错位 import ⇒ esbuild 报 `Unexpected "{"`） |

### U1 · 抽服务 — ✅ 完成（**六刀**）

| 刀 | 服务 | 行数 | 落到 | `ui-geo-regress` |
|---|---|---|---|---|
| 1 | `CSS` | 933 | `styles.js` | 100 PASS |
| 2 | `el`/`svg`/`ICONS` | 38 | `dom.js` | 100 PASS |
| 3 | `Bus`/`Store`/`Log`/`Prog` | 82 | `state.js` | 100 PASS |
| 4 | `Cfg`/`Fold` | 74 | `state.js` | 100 PASS |
| 5 | `UI`（fan-in 34） | 451 | `ui-kit.js` | 100 PASS |
| 6 | `Derive` | 65 | `derive.js` | 100 PASS |

**`body.js` 5476 → 3815（−30%）· `src-client` 4 → 10 模块。**

| 验收项 | 结果 |
|---|---|
| 真状态留入口 | ✅ `refs`/`inject`/`memoryViewScroll` **未搬出**；`Bus`/`Store` 是自封装 IIFE（状态在内、无裸变量跨模块写） |
| 不引全局 | ✅ 无 `window.xxx =` |
| 不做大 ctx | ✅ **逐个服务**；总改动仅 **2 处必要注入**（`setLogStatusSink`、`bumpHeadEpoch`） |
| 顺序修正 | ⚠ 原定"按 fan-in 降序"⇒ 实测改**依赖拓扑**（先抽 `UI` 会让它反向 import `body.js` ⇒ **造环**） |

### U2 → **U2-B** · 分区块守规模 — ✅ 完成（**原判据证伪**）

**原判据经三次独立实测证伪**（详见方案 §U2-阻滞）：
1. 首刀 `renderViewSettings` 依赖 **20 个** `body.js` 内部符号；
2. 改选应用层：仅 **72 行**，却拖 `buildLogPanel`/`pollTimer`/`currentView`/`show`/`refs`；
3. `panes/ctx.js`：`refs` **由 `buildModal`（壳层）写 3 处、被 6 个 render 读** ⇒ ctx 必为**全闭包上下文**。
4. 硬约束：`body.js` 是**插件入口**（`__ModuleLoader__.load` 在 IIFE 内同步执行，`var inject` 属**注册契约**）
   ⇒ 实测外移致**插件完全不加载**（75 条渲染断言全挂、**无页面错误**）。

**改判据后**：

| 项 | 施工前 | 施工后 |
|---|---|---|
| 超限节（> 400） | **3**（805/761/490） | **0** |
| 单节最大 | **805** | **359** |
| 节数 | 15 | **27** |
| **代码改动** | —— | **0 行**（新增 15 行全为注释；`git diff` 删除 **0**） |
| `ui-geo-regress` | 100 PASS | **100 PASS** |

**两条防绕过断言**（各配反例自证）：**节数下限**（防"合并标记"）· **覆盖完整性**（防"删标记"）。
**前置声明区白名单**：修首版误报（把 `module`/`exports`/`BASE`/`inject` 当"无主区域"）。

**⚠ 代价与处置**：注释也是行 ⇒ 容差被吃到 **+15/15 顶格** ⇒ 会**把门自己锁死**。
处置：**压注释**（5 行 → 1 行，判因移进文档）⇒ **3827**（+11，留 4 行）；并立约定
「**源码注释只留一行指针，长判因一律归 `docs/specs/`**」。

### U3 · 核对判因 — ✅ 完成

判因归档六项（决策/依据/实验次数/判据升级/守它的门/重估前提）+ `check-ui-contract` **③b 双向锁定**。

**⚠ 实测修正一处过度自信表述**：原写"推进 `wa-select` 会直接把门打红" —— 反例自证证明：

| 门 | 层级 | 注入源码级 `wa-select` |
|---|---|---|
| `ui-geo-regress` | 渲染层 | ❌ **未报红**（只抓 DOM 里已渲染的实例） |
| `check-ui-components` | 源码层 | ✅ **报红**（`[未注册]`） |

⇒ **须两门联合**。已写进方案。

### U5 · 行为证据 — ✅ a 完成 / b·c **前提消失**

| # | 结果 |
|---|---|
| **U5-a** | ✅ `test-save-roundtrip.mjs`：**零副作用设计**（读原文 → 写回**同样内容** → 再读**逐字节比对**）+ 反例（缺必填 ⇒ 400 且数据未坏）。5 条全过 |
| **U5-b** | ⏸ **前提消失** —— U2 不做物理拆分 ⇒ 无"拆分前后"可比。（原计划需先重构 `ui-geo-regress` 的 757 行量取层：实测其 `shoot()` **只截图、不返回结构化数据**） |
| **U5-c** | ⏸ 同上；其等价意图已由 U5-a 的 400 反例覆盖 |

---

## 2. 总验收 Z1–Z8（**全部实跑**）

| # | 断言 | 实测 |
|---|---|---|
| **Z1** | typecheck + build | ✅ 零错 · `build:client ✓ 649,658 bytes` |
| **Z2** | `check-runner` 全绿 | ✅ **106 pass · 0 xfail · 0 skip** |
| **Z3** | `ui-geo-regress` | ✅ **100 PASS / 0 FAIL** |
| **Z4** | 契约三向一致 | ✅ `check-panel-contract` 5 PASS · `gen-panel-contract --check` **产物新鲜（42 路由 · 3 份一致）** |
| **Z5** | `src-client/` 在扫描面内 | ✅ `body.js **648**/基线 648`（**达成 `<800`**） |
| **Z6** | 运行态 | ✅ 副本逐件 sha1 一致 · 特征探针通过 |
| **Z7** | 公开树纯净 | ✅ PASS |
| **Z8** | CHANGELOG + 体积 | ✅ 结构正常 · `client.js ~618 KB`（**较拆分前更小** —— 死代码清除 + tree-shaking） |

---

## 2′. **U2 终态与 U5-b**（2026-09-15 补 · 全部实跑）

### U2 终态：`body.js` **5476 → 648 有效行**（**-88%**，达成 `<800`）

| pane 模块 | 行 | 域 |
|---|---|---|
| `panes-toggles.js` | 661 | 参数（开关渲染组） |
| `panes-memory-detail.js` | 509 | 记忆·展开（`mm*` 组 + notes 小节） |
| `panes-overview.js` | 380 | 运行总览（`ov*` 卡片组） |
| `panes-arch.js` | 309 | 架构 |
| `panes-suite.js` | 293 | 插件集合 + 深度睡眠 |
| `panes-observe.js` | 284 | 运行观测 |
| `panes-settings.js` | 242 | 设置 + **应用层**（`apply*`/`syncTheme`/轮询） |
| `panes-memory.js` | 237 | 记忆·索引与画像 |
| `panes-config.js` | 117 | 配置原文 / YAML / 根目录 |
| **`body.js`** | **648** | 壳层 / 挂载 / `apply` 插件入口 / `VIEWS`·`show` 枢纽（**注册契约面，不可外移**） |

**手段**：`scripts/extract-pane.mjs`（**TypeScript AST 精确区间** + 重叠检测 + 写盘自证 + 失败回滚）。
⚠ 前两次尝试用**花括号配平**与**缩进边界**界定函数块，**都切错了**（配平在相邻符号时跨块；缩进在 `}).catch(` 处误判）——
**只有 AST 可靠**（`TAG_ORDER` 是单行，前两法分别算出 46 行 / 3 行）。

### U5-b：**拆分等价性证据**（`test-split-equivalence.mjs`，已登记 → 门禁 105→106）

**判据怎么落地**：U2 之后**无法再取"拆分前"的 DOM**（旧版本不在工作树）⇒ 改为
**证明两个渲染门确实能抓到拆分破坏**（**先红后绿**的可信度证据，而非"我说没坏"）：

| 断言 | 实测 |
|---|---|
| **A1** 反例：故意不渲染「参数」页 sched tab ⇒ `test-panel-view-contract` 必须报"缺失" | ✅ **34 → 21 项** |
| **A2** 反例：故意把 `--sc-nav-w` 压到 4px ⇒ `ui-geo-regress` 必须 FAIL | ✅ FAIL |
| **A3a/b** 两源文件**逐字节还原** | ✅ |
| **A3c/d** 还原后两门**回绿** | ✅ PASS / 100 PASS |

⚠ **本门自身踩过的坑**：首版把反例打在**门没覆盖的视图**（运行总览 `ov*Card`）上 ⇒ 门"没抓到"，
**差点被误判为"门的缺陷"**。教训：**反例必须打在门覆盖的面上**，否则反例自身无效（已写入本件头注）。

---

## 4′. **终态五层部署核**（2026-09-15 收尾实跑 · 依 `AGENTS.md` §云端同步检查清单）

> 起因：`AGENTS.md` 记「**推送了 ≠ 同步了**」。UI1 收尾逐层核，**五层全过**：

| 层 | 判据 | 实测（命令输出） |
|---|---|---|
| ① **仓内绿** | typecheck / build / 门禁 | ✅ `tsc --noEmit` 零错 · `build:client ✓ 632842 bytes` · **108 pass · 0 xfail · 0 skip** |
| ② **部署同步** | 副本与仓内 `lib/` 逐件 sha1 | ✅ `deploy-installed` 报"无需同步" · `check-installed-sync --strict` **逐文件 sha1 一致** |
| ③ **运行态生效** | **热重载过**（只 build+deploy **不算生效**） | ✅ `dev_reload_package` **清缓存 68 模块 · 重建 1 fiber** · `before [active] → after [active]` |
| ④ **功能探针** | 装上去的那份带着本轮能力 | ✅ `check-installed-features` **5 项全通过**（含组件库按钮 30px 紫胶囊 / 日志默认折叠 / 宿主设置中心分区） |
| ⑤ **云端 + pin** | 远端 = HEAD = **pin**（改 pin 后**同步 lock/.modules.yaml**，否则又三处不一致） | ✅ **三方同为 `9fac3e1ea5cf`** · `check-version-pin --strict` **PASS（三处一致 @ 9fac3e1e）** · 未提交 0 |
| ⑥ **公开树** | 推送前必须 PASS | ✅ `check-public-tree` PASS（**出图集已 gitignore** —— 见 §3″：`check-public-tree` 跳过 `.png`，入库风险高于收益） |

**终态事实**（node 解析，非模式推导）：

| 项 | 值 |
|---|---|
| `src-client/body.js` | **648 有效行**（棘轮 648 · 原 5476） |
| `src-client/styles.js` | 726（棘轮 726） |
| pane 模块 | **9 个**：toggles 661 · memory-detail 509 · overview 380 · arch 309 · suite 293 · observe 284 · settings 242 · memory 237 · config 117 |
| `client.js` | **632.8 KB**（拆分前 ~640 KB ⇒ **反而更小**：死代码清除 + tree-shaking） |
| 门禁件数 | **108**（U2 收尾 106 + 本轮 `audit-pane-deps` 主件与 selftest） |
| 门禁件数 | **106** |

---

## 3. **未达成项**（如实记录，不掩饰）

> ⚠ **本节曾记录「`<800` 未达成」——那已过期**。当时的方案是 **U2-B**（改判据：守"每节规模"而非文件总行数），
> 并注明"要真正达到 `<800` 必须先做 C′（共享状态外置）"。**后来 C′ 做了、U2 也真正拆完了**：

| 项 | 终态 |
|---|---|
| **`body.js < 800`**（objective 明写） | ✅ **已达成** —— **648 有效行**（原 5476，**-88%**），棘轮 648 |
| 达成路径 | **C′ 共享句柄容器化**（`app-state.js`，16 个句柄 → 注入 `factory` 末尾）⇒ 再 **AST 抽取 24 个 render 到 9 个 pane** |
| 判据修订说明 | U2-B 是**中途的稳妥退路**（"不假装拆文件"）；**C′ 完成后就不再需要它** —— 但 **U2-B 的门（`check-pane-sections`）保留**，它守的是"每节 ≤320 行"，与文件总行数是**两级**约束 |

**当前确无未达成项** —— U0/U1/U2/U3/U5（含 a/b/c）**全部达成且有实跑证据**（见 §2、§2′、§4′）。

| 项 | 状态 |
|---|---|
| ~~`body.js < 800`~~ | ✅ **已达成（648）** —— 见上表 |
| U5-c（反例自证） | ✅ 由 `test-split-equivalence` 的 **A1/A2 两条反例**覆盖（原独立卡的意图已实现） |

---

## 3′. **遗留项 —— 均已闭环（2026-09-15 收尾第二轮）**

| 项 | 状态与证据 |
|---|---|
| **`check-version-pin` 三处不一致** | ✅ **已闭环**。判因：`19dc8a4d…` 是**历史重置前的 commit（现已不可达）**——`git cat-file -t` 报 `Not a valid object name` ⇒ 漂移是**元数据记录**，**内容早已同步**（已装 `lib/client.js` sha1 `020BCD2DBD83A91E` **与仓内逐字节一致**，且含 UI1 全部符号）。⇒ **未跑 `pnpm install`**（那会按旧 lock 退回旧代 + 触发宿主批量删除保护），改为**只把 lock 与 `.modules.yaml` 里的旧 hash 换成当前 pin**：5 处 + 1 处，**改前备份**至 `~/.dsh/backup/versionpin-20260915-213929/`。<br>先红：`--strict` **exit=1**（`a7db85f8 / 19dc8a4d / 19dc8a4d`）→ 转绿：**PASS（三处一致 @ a7db85f8）exit=0**。改后复验：内容 sha1 未变 · 两文件 YAML 结构完好 · 特性探针 exit=0 · **热重载 fiber active**。 |
| **人工视觉复核** | ✅ **已闭环** —— 见 §3″。**并因此抓出一个四门全绿却真实存在的缺陷。** |

---

## 3″. **人工视觉复核（逐图 · 2026-09-15）**

**方法**：`node scripts/ui-geo-regress.mjs --shots deliverables/ui1-shots` ⇒ 11 张图，**逐张人眼核对**。

### 前置工具修复（本身就是一处假绿）

出图**首次全失败**（12 张全 `✗`）而门仍报 **100 PASS** —— 根因：`--shots` **不创建输出目录**，
Chrome `--screenshot=<不存在的目录>` **静默失败**。⇒ 已修：① `mkdirSync(dir, { recursive: true })`；
② **末尾汇总 + 缺图即红**（`< 5000 B` 视为无效），把"出图失败被吞掉"堵死。
⚠ 与"日志面板静默空掉"是**同一类假绿**：**失败路径没人看**。

### 逐图结论（9 个主页面 + 2 个架构页签）

| 图 | 核对点 | 结论 |
|---|---|---|
| `shot-overview` | 7 枚徽章**一行不换行** · 3 操作卡等宽 · **4 KPI 在首屏** · 「日志 13 条」**折叠成一行** | ✅ |
| `shot-params` | **4 个 tab 全在**（注入/容量/模型/调度）· 分段选择器/开关/档位段选三类控件齐 | ✅（**这正是当时"3 个 tab 静默空掉"的现场，已修复**） |
| `shot-memory` | 容量卡三列不换行 · 5 个带计数 Tab · **索引行（色标+标题+指针+tag+条数）** | ✅ |
| `shot-persona` | USER 78% / AGENT 48% 进度条 · 构成计数 · **成熟度分布柱图** | ✅ |
| `shot-suite` | 3 插件卡 + **suite 装配矩阵表**（MEMORY/USER/AGENT/notes/archive 五行，水位徽章） | ✅ |
| `shot-sleep` | 状态机 stepper · 睡眠水位 67% · 状态分布条 · 本轮产出回执 | ✅ **（首轮此处报「加载失败」，见下）** |
| `shot-observe` | 4 KPI · 4 Tab · **日志表 6 行**（含端点/耗时/状态码/时间） | ✅ |
| `shot-arch` | 3 操作卡 · 4 KPI（记忆记录 967 / 载体对账 11/11 / 写时自证 33/0 / 装配面 0 桥）· 5 Tab · **五环 KPI 表** | ✅ |
| `shot-arch-asm` / `shot-arch-mcl` | 架构页两个页签出图 | ✅（几何门另有页签断言） |

### 🔴 **本轮抓到的真实缺陷**（自动化门全绿，只有人眼看见）

```
深度睡眠 · 会话状态机
    加载失败: dsFmtTime is not defined
```

| 门 | 为何漏 |
|---|---|
| 构建（esbuild） | **不做未定义变量检查** |
| `ui-geo-regress` | 断言面不含深睡页 |
| `test-panel-view-contract` | 只测「参数」「记忆库」 |
| `check-client-syntax` A5 | 只监视「服务模块 + pane 间导出」；`dsFmtTime`/`DS_STATE_TEXT` 是 **`body.js` 本地符号**，不在面内 |

**根因（两处）**：
1. `dsFmtTime`/`dsFmtAgo` 定义在 `body.js`，而迁走的 `panes-suite.js` 直接用它们、**未 import**；
2. **我自己上一轮手工迁移时按字符区间删除，却按"升序"逐个删 —— 偏移串味，把 `DS_STATE_TEXT` 连注释一起误删**
   （**正确做法：降序删除**，本轮的修复脚本已按降序并带断言重做）。

**修复**：两个表（`DS_STATE_TEXT`/`DS_PROBE_TEXT`）与两个格式化函数**整体迁进 `panes-suite.js`**（**深睡域**，谁用谁持有）；
另修 3 处同类裸引用：`panes-arch.js` 的 `api`/`status` → `appState.*`、`panes-observe.js` 的 `refreshCurrentView` → `appState.refreshView`、
`panes-overview.js` 的 `show` → `appState.show`。

**复验（真机出图）**：深睡页现完整渲染 —— 「上次入睡 `2026/9/14 21:52:36`」（`dsFmtTime` 生效）、
「`idle 180 分钟` · 下次可睡 `2026/9/15 22:52:36`」（`dsFmtAgo` 生效）、「待蒸馏 27 / 停滞 5」（**`DS_STATE_TEXT` 生效**）。

### 新增门：`audit-pane-deps.mjs`（**防复发**）

把每个 pane 的**全部自由标识符**逐类判定：内建（**显式列举** 112 个）· 本文件已声明（含**具名函数表达式**）·
已 import · pane 导出 · 服务模块导出 · 其它 `src-client` 文件（含 `body.js` 顶层）· **全仓无定义** ⇒ 后四类**即 FAIL**。
**3 条反例自证**（临时目录夹具，不碰真实树）：干净 pane ⇒ PASS · 用未导入的 body 本地符号 ⇒ FAIL · 用全仓无定义符号 ⇒ FAIL。

**门禁 106 → 108 件。** 另把 `check-pane-sections` 的节数下限 **15 → 11**（附原因：内容整体迁出后已清空壳标记；
仍有效力 —— 合并 2 节即 10 < 11 报错）。

---

## 4. 方法论收获（可复用）

| # | 教训 | 佐证 |
|---|---|---|
| 1 | **"先红后绿"要真的跑** | U0-a-2 首跑报的是**硬顶**而非"超基线" ⇒ 若不跑就会以为"扩面即可用"，漏掉硬顶豁免问题 |
| 2 | **统计口径必须 node 解析** | PowerShell 对 `body.js` 给过 **5117**（偏差 360）与两次 **0**；权威值 **5476/5477** 差 1 也须写明口径 |
| 3 | **反例自证能拦住"门被改松"** | 可变全局口径改了三版：v1 漏检函数内赋值（**门被放宽**）、v2 误报声明行 ⇒ 均由 selftest 抓出 |
| 4 | **"红"是过程证据，不该常驻** | `check-pane-sections` 先登记后被撤销（那时它红）⇒ 转绿后才登记 |
| 5 | **代码注释会撑开棘轮** | 只加注释也 +15 行、吃满容差 ⇒ 立"注释只留一行指针"的约定 |
| 6 | **两门可能互补而非冗余** | 渲染层 vs 源码层：单门都漏一半 |
| 7 | **前提要先证伪再施工** | U2 若不做三次预检，会产出一堆"搬走 20 个依赖"的**假拆分** |

---

_建立 2026-09-15 · UI1 阶段验收记录（U0/U1/U2-B/U3/U5-a 完成；`<800` 未达成，待定性）。_
