# 守藏插件中英文切换 · 整体方案 v2（红队修订版）

> **圆桌会议**：`shoucang-i18n-bilingual`（4 专家定稿）→ `shoucang-i18n-redteam`（红队 25 条攻击 · pass 1/3）
> **用户裁决**：「全部纳入中英文切换，就是统一标准化，避免后期问题」→ 方案 B
> **v2 修订依据**：红队 25 条 + 主持人独立复核（5 条完全证实 / 1 条部分修正 / 1 条自抓）

---

## 修订说明（v1 → v2）

**v2 修掉了 v1 的 13 处问题，全部有实测证据。** 分级如下：

| # | v1 的问题 | 实测证据 | v2 处置 |
|---|---|---|---|
| R1 | 写「Chrome 缺失退 exit 3」 | `ui-geo-regress.mjs:49` 实测 `process.exit(4)`；`check-runner.mjs:530` 规定未登记 xfail 的 4 ⇒ **fail** | 改为 **exit 4**，并明确「必须登记 `{xfail:true}`，否则红掉整链」 |
| R2 | 说「词表 ≤400 行，避开 fnspan 400 软顶」 | `audit-fnspan.mjs:44` 的 `SOFT` 经 `filter(r => r.len > SOFT)` 证实是**函数跨度**；文件行数门禁在 `check-module-growth`（`FREEZE_THRESHOLD=600`/`HARD_CAP=1000`） | 拆清两个量；**补文件行数判据**（≤400 由新件自守），并登记空白带 |
| R3 | 说「body.js 必须净减」 | `--print` 实测 `626 = 基线 626`，`SLACK=15` | 改为 **P1 拆两个子步**（先减后加），并要求净减目标写死；承认 15 行容差会遮蔽 |
| R4 | 说 `check-installed-features` 是「31 项标记」 | 实测 `FEATURES` 数组 = **30 项** | 改 30；并把「须先补标记」从**口号**改为**判据**（见 R9） |
| R5 | 说 `try/catch` 两路都活 | `dsh-cordis-client-runner/lib/client.js:205-216` `CTX_VERBS` 10 项**不含 `inject`**；但 `dsh-client-modules/lib/client.js:359-364` 静态路径用真 cordis ctx | 明确**两路径互斥**（静态=inject 可用/catch 死；动态=inject 必抛/catch 唯一），按路径写 |
| R6 | `built()` 守卫判据 | `apply()` 首行 `mount()`（body.js:903）**同步**建容器；`refs.view` 在 L681 赋值、`appState` 在 L998-1017 注入 ⇒ 判据**恒为 true** | 改判据为 **`appState` 就绪**（真实窗口），并说明为何不能用 DOM 存在性 |
| R7 | 「三处必须用原始 tag」只是意图 | `panes-memory.js:53` map 并存 `env:180` 与 `环境:190`；两件机检与渲染验收**均不覆盖** | 补**机制守卫**：§7 断言 **G**（AST 断言禁 `tr(`/`tagLabel(` 出现在 `idxHue`/`TAG_ORDER.indexOf`/`tagCount` 的实参数据流上） |
| R8 | 砍掉 coverage（称与 keys③ 重叠） | keys③ 是「调用点→词表」防**裸键**；coverage 是「词表→调用点」防**死键**，**方向相反** | keys 检查改**双向相等**（一条断言同时杀裸键与死键） |
| R9 | 「须先补 i18n 标记」无判据 | `check-installed-features.mjs` 实测**无条件 exit 0** 报告态 ⇒ 不补标记照样全绿 | 改为**可红判据**：§八 第⑥条写死 **3 个必检标记**（`__SC_I18N_MISS__` / `attachLocale` / `tagLabel`），缺一即 FAIL |
| R10 | `tr(key, zh)` 与 scan「归零」自相矛盾 | `tr('nav.memory','记忆库')` 的 CJK 仍在扫描面内 | 裁定：**保留内联 zh 第二参**（零回归是结构性的），scan 按 **AST 位置豁免**（见 §7） |
| R11 | tag 映射表完整性无机检 | `check-i18n-keys` 只作用 `tr()` 调用点；`tag-label.js` 是纯数据叶子 | 折叠为 keys 的**断言 D**（键集 ⊇ `carriers.tags` ∪ `TAG_ORDER`） |
| R12 | 「必须先在词表」无门禁，「行为不变」无判据 | 两件机检**都不检查顺序**；P0 完成时 en 态尚不存在 | 把 P0 判据改为**两态行为一致**（可测），并规定 P0 独立成 commit |
| R13 | 未处理**标签撞名**（方案 B 副作用） | `carriers.tags` 实测 **18 键**，同时含 `env` 与 `环境`（后者 layer=P） | 加**歧义消解**（同列表内撞名时附原始键）+ `aria-label` |

**另外两条（不修，但如实登记，不再当不变式保护）**：
- **中文 tag 在 `TAG_ORDER` 恒垫底**（`indexOf` 恒返 -1 ⇒ idx=7 并列）—— 这是**既有缺陷**，v2 **不改**（属排序语义变更，非 i18n 范畴），但**不再把它写进"不变式保护"**。真正的不变式只有「排序必须吃原始 tag」（确定性）。
- **FREEZE 可自签**（`--rebase` 不在门禁调用面内）—— v2 不改工具，改为**要求 P1 的净减写进 commit message 并可 git 复核**。

---

## 一、目标

跟随 DSH 语言设置（`~/.dsh/settings.yaml` → `locale.preference: zh|en`）自动切换中英文；UI 显示同步切换；**包含索引小节标签分类**。

## 二、核心判断

**不自研 i18n，复用宿主内建的官方 locale 服务。** 宿主已有 `@deepseek-ai/dsh-client-locale`（运行时实测 `[active]`），自研属重复造轮（规则5）。同宿主的圆桌插件是可用参考实现。

---

## 三、实证事实链（全部有据）

| # | 事实 | 证据 |
|---|---|---|
| 1 | 宿主内建 locale，**运行时 active** | `dev_plugin_status` |
| 2 | 设置落点 | `settings.yaml` L1481-1482 |
| 3 | client 服务名 = `locale` | `dsh-client-locale/lib/client.js`：`ctx.provide("locale", locale)` |
| 4 | **缺键回落语义** | `translate()`：`lookup(ns,key,chain) ?? lookup('common',key,chain) ?? key` ⇒ **静默回落 key 字面量，不抛错** |
| 5 | `inject` 数组语义 | `registry.d.ts` L57：*"only loads while all are available"* |
| 6 | `ctx.inject(deps,cb)` 语义 | `registry.d.ts` L101-111：服务可用才跑、迟到即补跑 |
| 7 | `ctx.get()` 语义 | `reflect.d.ts` L7/L12：*"without the inject requirement"*，未提供返回 `undefined` |
| 8 | **`inject` 不在动态面白名单** | `dsh-cordis-client-runner/lib/client.js:205-216` `CTX_VERBS` 10 项；`L342 readService(prop,true)` → `L326 denyRead` → `L353 throw` |
| 9 | **我方走静态装配** | 我方 `client.js` 实测零 guard 特征；`dsh-client-modules/lib/client.js:359-364` 用 `ctx.reflect.provide` ⇒ 真 cordis ctx |
| 10 | **退出码** | `ui-geo-regress.mjs:49` = `exit(4)`；`check-runner.mjs:530`：`4 && xfail ? xfail : fail`；`:530` `3 ⇒ skip` |
| 11 | **门禁数学** | `audit-fnspan.mjs:44` `SOFT=400` 作用于**函数 len**；`check-module-growth.mjs:60/73` `HARD_CAP=1000`/`FREEZE_THRESHOLD=600` ⇒ **400–600 空白带** |
| 12 | **FREEZE 零余量** | `--print`：`626 src-client/body.js` = 基线 626，`SLACK=15`（L86） |
| 13 | **守卫真实窗口** | `body.js:903` `mount()` 同步；`refs.view` L681；`appState` L998-1017 注入 ⇒ DOM 存在性判据恒真 |
| 14 | 路由数实测 **42** | 文档里的 34/41 均不准 |
| 15 | 棘轮扫描面 | `audit-wiring` I1/I2 与 `audit-architecture` **只扫 `src/**/*.ts`** |
| 16 | **映射表覆盖面** | `carriers.tags` 实测 **18 键**（含 `env` 与 `环境` 双键）∪ `TAG_ORDER` 7 键 = **21 键**；专家映射表零缺失零多余 |
| 17 | **1:N 撞名** | `env`+`环境` → 同显 `Environment`；`lesson`+`教训` → 同显 `Lesson` |
| 18 | `check-installed-features` | `FEATURES` 实测 **30 项**；该件**无条件 exit 0**（报告态） |

---

## 四、架构定稿

### 4.1 分层：client-only（含门禁盲区的如实说明）

| 层 | 裁决 |
|---|---|
| client 面板文案 | ✅ 本次范围 |
| host RPC `error` **机器码** | ❌ 不译（**host 出码，client 出人话**；现状即如此：`body.js:542`、`panes-config.js:113`）⇒ 只把映射补进词表 |
| host `note`/`summary` 长文 | ❌ 不译（面向审计/开发者） |
| 面向 LLM 的串 | ❌ **严禁翻译**（会改模型行为） |
| 注释 | ❌ 一律不译（AST 只取字面量节点） |

> ⚠ **v2 更正 v1 的表述**：`audit-wiring` I1/I2 与 `audit-architecture` 只扫 `src/**/*.ts`，client 侧**确实不在架构门禁面内**。v1 把这个**盲区**写成了「降低本轮成本的理由」——**这是错的**。本仓 `check-module-growth.mjs` 件头记载过同型教训（"前端不受纪律约束本身才是真病灶"）。
> **v2 处置**：不假装有门禁。改为**自建两条自守判据**（§7 的 keys/scan 覆盖新增模块）＋ **模块行数 ≤400 由 keys 件附带断言**，把「无门禁」变成「有替代判据」。

### 4.2 契约：零改动

`panel-contract.ts` 一行不改 · 零新端点 · **路由数保持 42**。
理由：契约表只描述**请求体**；locale 在浏览器进程内可达。加端点 = 把进程内调用绕成网络往返。

### 4.3 新增模块

| 模块 | 职责 | 行数约束 |
|---|---|---|
| `src-client/i18n.js` | 运行时：`attachLocale(ctx)` / `t(ns,key,params)` / `tr(key,zh,params)` / 缺键记录 `window.__SC_I18N_MISS__` | ≤400 |
| `src-client/i18n-dict-nav.js` | 纯数据：视图/导航/插槽/共享词 | ≤400 |
| `src-client/i18n-dict-memory.js` | 纯数据：记忆库+画像+详情 | ≤400 |
| `src-client/i18n-dict-pane-run.js` | 纯数据：总览+插件集合+深睡+观测+架构 | ≤400 |
| `src-client/i18n-dict-cfg.js` | 纯数据：参数+设置+配置 | ≤400 |
| `src-client/tag-label.js` | 标签映射**唯一映射点**（纯函数零依赖） | ≤400 |

> **≤400 行是自守判据，不是门禁推论**（v2 更正 v1）：`audit-fnspan --client` 的 400 是**函数跨度**；文件行数门禁在 `check-module-growth`（≥600 才进 FREEZE、≥1000 硬顶）⇒ **400–600 属空白带**。故在 `check-i18n-keys` 中附带「新模块行数 ≤400」断言，否则该约束无人执行。

### 4.4 接入形态（v2 关键修订）

```js
// exports.inject 保持 ['slots'] —— locale 绝不入数组
// 路径判定（v2 新增）：静态装配下 ctx.inject 可用；动态注入面必抛，须走 ctx.get
var NS = 'shoucang', T = null;              // T：仅非 zh 态绑定；null ⇒ 全部回退中文
function tr (key, zh, params) {             // 调用形态：tr('nav.memory', '记忆库')
  if (!T) return zh;                        // ★ zh 路径不查表 ⇒ 零回归是结构性的
  var s = T(key, params);
  return s === key ? zh : s;                // 缺键回落 key ⇒ 显式改判中文，杜绝裸键上屏
}
function bind (loc, deps) {                 // deps: active()/setActive()/ready()/onChange()/effect()
  var apply = function () {
    var active = loc ? loc.getLocale().active : 'zh';
    if (active === deps.active()) return;                 // ★幂等：register 自身也推 revision
    deps.setActive(active);
    T = (loc && active !== 'zh') ? loc.bind(NS) : null;
    if (deps.ready()) deps.onChange();                    // ★见下「就绪判据」
  };
  if (loc) deps.effect(function () {
    var off = loc.subscribe(apply), un = null;
    try { un = loc.register(NS, 'en', EN) }               // ★v2：重复注册硬抛，必须护
    catch (e) { /* 同 ns+locale 已被旧代占用 ⇒ 沿用旧词表，不阻断加载 */ }
    return function () { off(); if (un) un(); };
  });
  apply();
}
// v2：两路径互斥，不是"两条路都活"
var loc = ctx.get('locale');                               // 静态/动态都放行
if (loc) bind(loc, deps);
else { try { ctx.inject(['locale'], function (s) { bind(s.locale, deps) }) } catch (e) { /* 无 locale 服务 ⇒ 保持中文 */ } }
```

| 约束 | 依据 | v2 变化 |
|---|---|---|
| **`locale` 绝不入 `inject` 数组** | 事实 5 ⇒ 缺失即停 PENDING、面板消失 | 不变；但**补一条运行时实测**（摘掉 locale 服务跑一次），把推理变成证据 |
| `ctx.get('locale')` 为主路径 | 事实 7/9：静态与动态**都放行** `get` | **v2 改为主路径**（v1 把 `inject` 当主路径，是错的） |
| `ctx.inject` 为备选 | 事实 6/8：静态可用、动态必抛 | **v2 明确两路径互斥**，并 `try/catch` 兜住动态面 |
| `register` 须 `try/catch` | `client.js:1264` 重复注册**硬抛** ⇒ 热重载时旧 disposer 未跑到会让**整面板不加载** | **v2 新增**（v1 只写"交 scoped.effect 托管"，零保护） |
| 订阅用 `subscribe(fn)` 非 `locale/change` | 宿主 `publish()` 只在语言切换时 emit；字典注册只推 revision | 不变（红队复核**裁决正确**） |
| 幂等按 **active 语言 id** | revision 每次递增（含字典注册） | 不变（红队复核**裁决正确**） |
| **就绪判据 = `appState` 已注入** | 事实 13：`mount()` 同步建容器 ⇒ DOM 存在性判据恒真 | **v2 改判据**：`ready() = !!(appState && appState.refreshView && appState.switchKeys)` |
| 词表用**三参无类型** `register` | typed 两参需宿主 `LocaleNamespaceMap` 合并，本仓无该依赖且 client 纯 JS | 不变 |
| **不自建语言入口** | `setLocale` 是宿主唯一偏好写入口，双写同一 `settings.yaml` | **v2 加一条**：面板内提供**只读当前语言 + 跳转宿主设置中心**的提示（把可用性缺口明示，而非藏起来） |

---

## 五、索引标签分类

### 裁决：显示层映射 + 方案 B

- **库内零改动**：`_memory/**`、`~/.dsh/suite/knowledge/**` 一行不改；标签原样存储，只在**渲染那一刻**映射。
- 用户「统一标准化」由显示层满足：中英两态都用显示名。

### 映射表（21 键 = `carriers.tags` 18 ∪ `TAG_ORDER` 7）

| tag | zh | en | | tag | zh | en |
|---|---|---|---|---|---|---|
| env | 环境 | Environment | | 身份 | 身份 | Identity |
| tool | 工具 | Tool | | 使命 | 使命 | Mission |
| flow | 流程 | Flow | | 边界 | 边界 | Boundary |
| lesson | 教训 | Lesson | | 性格 | 性格 | Trait |
| release | 发布 | Release | | 认知 | 认知 | Cognition |
| user | 用户 | User | | 演化 | 演化 | Evolution |
| agent | 智能体 | Agent | | 偏好 | 偏好 | Preference |
| 经验 | 经验 | Experience | | 习惯 | 习惯 | Habit |
| 教训 | 教训 | Lesson | | 原则 | 原则 | Principle |
| 环境 | 环境 | Environment | | 路径 | 路径 | Task path |
| 硬件 | 硬件 | Hardware | | | | |

### v2 新增：撞名消解（v1 缺失）

**问题**（实测）：`env` 与 `环境` 同显「环境」/`Environment`（1:N）；`lesson` 与 `教训` 同显「教训」/`Lesson`。中文态下 `env`→「环境」会与**原生 `环境`**（layer=P）在视觉上撞名 ⇒ **可分辨性丧失**，而 v1 的 CHANGELOG 豁免只覆盖「显示变化」。

**处置**：
1. `pill.title` = 原始 tag（不变）
2. **新增** `aria-label` = 原始 tag（键盘/读屏可达，红队指出 v1 只能 hover）
3. **新增歧义消解**：同一渲染列表中若出现两个不同原始 tag 映射到同一显示名，**仅此时**给胶囊追加原始键标记（如「环境 · env」）——按需显示，不污染常态

### 兜底三条（不变）

1. 未知 tag → **原样显示原始 tag**（不折「其他」，避免掩盖漏登记）
2. 空/`null`/`undefined` → `'?'`
3. **新增**：映射 miss 时打 `Log.warn`（与 `renderIndexRows:81` 既有的数据退化告警同口径）——v1 只让**用户**看见裸 tag，开发侧无观测通道

### 不变式（v2 收窄）

| 必须吃**原始 tag**（确定性） | 说明 |
|---|---|
| `idxHue(tag)` 色相 | 否则切语言换色，破坏空间记忆 |
| `TAG_ORDER.indexOf()` 排序 | 否则 zh 态排序漂移 |
| `tagCount[t]` 统计 | 否则计数失真 |
| host `panel-memory.ts:200` `m[1] === '原则'` | **数据侧统计，红线禁触** |

> **v2 更正**：v1 把「中文 tag 恒垫底」也当成不变式保护。实测 `TAG_ORDER.indexOf` 对中文键恒返 **-1（→idx=7）**，中文 tag 全部并列垫底——这是**既有缺陷**，不是不变式。v2 只保护「排序吃原始 tag」这条确定性，**不再保护缺陷本身**；修不修属排序语义变更，另议。

### 检索红线（禁触清单）

| 类别 | 禁触面 |
|---|---|
| 数据 | `_memory/**`、`~/.dsh/suite/knowledge/**` |
| 契约 | `criteria.json#carriers.tags` 键集、`criteria.generated.ts`、`panel-contract.ts` 的 tag 字段 |
| 实现 | `targets.ts`、`vec.ts`、`mcl.ts`、`criteria.ts#TAG_IMP`、`supply-assembly.ts`、`dynamic-select.ts`、`supply-ledger.ts` |
| 写入 | `distill-write.ts`、`deepsleep-apply.ts`、`deepsleep-tree.ts`、`ring-commit.ts`、`record-store.ts`、`record-shadow.ts`、`sectionops.ts`、`treeops.ts`、`forgetops.ts` |
| 注入面 | `panel-shared.ts#readCarrier/renderSupplyText` 产出 |

> **v2 处置**：v1 的守卫（「改动集不含 `_memory/`」「键集等于基线」）**未列 CHECKS、基线未定位** = 口号（违反规则6）。v2 把它落成**可执行判据**（§7 断言 E）。

---

## 六、P0 前置重构（v2 修正）

### 6.1 四处中文参与逻辑判断

| 位置 | 代码 | v2 修法与**范围更正** |
|---|---|---|
| `body.js:226` | `m.effect === '需重载'` | ⚠ **v1 只写改这一处是错的**：`'需重载'` 在 body.js **出现 10 次**（L209-220 `CTRL_META` 表 + L226 比较）⇒ **10 行必须一起动**，只改比较点会让 10 处字面量全部失配（warn 类永不出现，**静默 UI 缺陷**） |
| `body.js:772` | `textContent.trim() === '设置'` | 只按宿主类名/anchor 定位，删文本匹配 |
| `panes-suite.js:225/230` | `s[0] === '停滞'` | 按**状态键** `stalled` 决定 CSS 类，文案只做展示 |

**修法**：`m.effect` 改存**枚举键**（`'reload'`），文案由 `CTRL_META` 的展示层映射产出。

### 6.2 P0 判据（v2 新增，v1 缺失）

v1 写「判据 = 机检 + 行为不变」，但**没有任何断言**，且 P0 完成时 en 态尚不存在。

**v2 判据**（可测）：
- **两态行为一致**：同样的输入下，4 处决策点在 zh 与 en 两态产出**相同的 CSS 类 / 相同的定位结果**
- **归属**：并入 `test-i18n-render.mjs` 的 DOM harness（P0 改动在 IIFE 内，node 侧无法直接 import）
- **顺序**：P0 **独立成 commit**，且 `check-i18n-scan` 在 P0 commit 上必须**先红后绿**（红=改造前存在比较侧 CJK；绿=改造后为 0）—— 把「必须先于词表」从纪律变成**可复核的 commit 序列**

### 6.3 `dataset.view` 锚点（探针解耦）

`body.js:632` 加 `item.dataset.view = v[0]`；`ui-geo-regress.mjs` L61 `VIEWS` 改 id 数组、L170/L424 改 `[data-view="x"]` 选择器；`test-panel-view-contract`、`gen-ui-preview` 同批改。

---

## 七、机检（v2：仍两件，但判据双向且带位置豁免）

**登记 `check-runner.mjs` 的 `CHECKS`，`xfail: false`。**

### `scripts/check-i18n-keys.mjs`

| 断言 | 内容 |
|---|---|
| **A（双向）** | `{调用点 key 集}` **==** `{EN 字典 key 集}`；**两向都红** —— 缺键（裸键）与多余键（**死键**）同时杀。**v2 更正 v1 的单向 ③**，把被砍掉的 coverage 缺口补回 |
| **B** | 每个 key 的 `{占位符}` 集合：**调用点内联 zh 串** 与 **EN 值** 相等；值非空、无残留 `undefined` |
| **C** | 词表文件本身：zh 内联串非空、EN 值非空、无重复 key |
| **D（v2 新增）** | `keys(TAG_LABELS)` **⊇** `keys(criteria.json#carriers.tags)` ∪ `TAG_ORDER`；每行 2 元组非空（中英均衡）—— 补上 v1 的**标签映射表完整性缺口**（`tag-label.js` 是纯数据叶子，不在 keys A 的调用点面内） |
| **E（v2 新增）** | 红线守卫：改动集**不含** `_memory/**` 与 `suite/knowledge/**`；`carriers.tags` 键集**逐键等于**基线（基线文件定位并纳入版本控制）—— 把 v1 的口号落成判据。**改动集取法（v2.1 补定义）**：`git diff --name-only <基线commit>...HEAD` + `git status --porcelain` 的并集；基线 commit 记录在基线文件头部。**不用 mtime 或目录快照**（会漏已跟踪文件的修改） |
| **F（v2 新增）** | **新模块行数 ≤400**（补 400–600 空白带） |
| **G（v2.1 新增 · 补 R7 的空指向）** | **tag 数据流污染守卫（AST）**：在 `src-client/panes-memory.js`（及任何消费 `TAG_ORDER`/`tagCount` 的文件）中，断言 `idxHue(...)` / `TAG_ORDER.indexOf(...)` / `tagCount[...]` 的**实参表达式中不出现** `tr(` / `tagLabel(` 调用；且 `panes-memory.js` **不 import** `i18n.js` 的 `tr` 以外的映射函数到数据流。违反 ⇒ FAIL。AST 先例：`check-memory-write-path` / `test-wiring-gate-ast`。<br>**为什么必须机检**：`idxHue` 的 map 实测并存 `env:180` 与 `环境:190`，一旦有人"顺手"先映射再传参，zh 态色相半坏、en 态同显撞名的胶囊色相分裂 —— **两件机检与页面级渲染探针全部不覆盖数据流污染**（红队缺陷1原文） |

### `scripts/check-i18n-scan.mjs`

| 断言 | 内容 |
|---|---|
| 扫面 | `src-client/**/*.js` 的 **CJK 字面量**；**排除** `*.generated.*`、`*.bak-*`（4 个 320KB 备份在源码目录）、`.vendor-css.generated.js` |
| **位置豁免（v2 裁定 R10）** | 仅 **`tr(key, '中文')` 的第二个实参**豁免（AST 位置判定）；其余一律在面内。这样既保住「zh 路径不查表 ⇒ 零回归是结构性的」，又让扫描有意义 |
| **红线** | CJK 出现在 `===/!==/==/!=/includes/indexOf/switch-case` 任一侧 ⇒ **无条件红，不许白名单**（覆盖 v1 只写「比较运算」的旁路面） |
| 去注释 | 复用 **esbuild**（已在 devDependencies）做 token 级剥离，防「注释里的中文」假红 |
| `--selftest` | 合成违规样本必红 + 干净样本不误报 |

**否决项（保留 v1 的两条，理由更正）**：
- ❌ **不建**独立 coverage 件 —— 但**理由改为**「keys 断言 A 已双向」，**不是** v1 的"重叠"（那是对的，方向相反）
- ❌ **不建**行数件 —— `check-module-growth` 已覆盖 ≥600 面；400–600 由 keys 断言 F 补

---

## 八、验收口径（v2）

| # | 命令 | 通过判据 |
|---|---|---|
| ① | `npm run typecheck` | 零错 |
| ② | `npm run build` | host + client 成功 |
| ③ | `node scripts/check-runner.mjs` | 全绿，**且新增两件已在册**。**判据语义（v2.1 补展开）**：在 `check-runner.mjs` 的自证段新增一条**静态断言** —— 读 `CHECKS` 数组，断言其中**同时存在** `scripts/check-i18n-keys.mjs` 与 `scripts/check-i18n-scan.mjs` 条目；缺失即 runner 自身 exit 1。**不是人眼确认**，也不再依赖"记得登记" |
| ④ | `node scripts/ui-geo-regress.mjs --shots <dir>` + `node scripts/test-i18n-render.mjs` | **双绿** |
| ⑤ | `check-panel-contract && gen-panel-contract --check` | 三向一致，**routeCount 仍 42** |
| ⑥ | `check-installed-features` | **v2 改为可红**：i18n 标记数 ≥ 下限，缺失 ⇒ **FAIL**（v1 该件无条件 exit 0，验收⑥恒真）。**下限数值（v2.1 补写死）**：首期落 **3 个必检标记** —— `__SC_I18N_MISS__`（运行时缺键记录存在）、`attachLocale`（接入函数入产物）、`tagLabel`（标签映射入产物）。三者在 `lib/client.js` 产物中**必须同时出现**，缺一即 FAIL；后续每期按新增能力**只增不减** |

**④ 的失败语义（v2 更正 R1）**：Chrome 缺失 ⇒ `test-i18n-render` 退 **exit 4**；**必须在 CHECKS 登记 `{xfail:true}`**，否则 runner 判 **fail**（环境差异红掉整链，并被误判成 i18n bug）。

> ⚠ **v2.1 补记：这是一处「设计接受的半可见缺口」**（red-gate 复核指出，如实登记不掩盖）
> 登记 `{xfail:true}` 解决了「环境差异红掉整链」，但**代价**是：在无 Chrome 的机器上，**en 态渲染证据会系统性缺席**，且不判失败。
> 性质变化：从 v1 的「可能被偷放（xfail 吞断言）」变为 **「设计接受的半可见状态」** —— 它**不是静默**（runner 渲染 `⚠ xfail` 且 0 xfail 时也显示计数；XPASS 会退 1 判 fail），但确**不阻断**。
> **缓解**：③ 的「两新件在册」断言 + `check-i18n-keys` 的 A–G 断言（纯静态，不需要 Chrome）共同承担「无浏览器时的 i18n 正确性下限」；en 态**视觉**证据仅在具备 Chrome 的环境产出，并在交付说明中**显式声明该环境依赖**。

---

## 九、两态渲染证据（v2：修掉"自证即重言"）

`scripts/test-i18n-render.mjs`，**独立计数、独立登记**，**严禁**并入 `ui-geo-regress` / `test-panel-view-contract`（二者带 `{xfail:true}`）。

| 断言 | 内容 | v2 变化 |
|---|---|---|
| A | **P0 两态行为一致**（4 处决策点产出一致） | 新增（补 v1 的"行为不变无判据"） |
| B | **en 态 chrome 区零 CJK**（选择器圈定导航/标题/按钮/表头；数据原文与记忆库内容白名单） | 新增 —— **独立于词表的判据**，破 v1 的"读词表值断 DOM 等词表值"重言 |
| C | **en 态无裸键**（页面不出现 `xxx.yyy` 形态标识符） | 新增 |
| D | **`window.__SC_I18N_MISS__` 为空** | 新增 —— v1 记录了缺键却**无任何机检消费** |
| E | 几何：无横向溢出（`documentElement.scrollWidth ≤ innerWidth`）+ 文案未截断（`scrollWidth ≤ clientWidth+1`）+ **标签 pill 本身不换行** | 补 v1 只看页面级溢出的缺口 |
| F | `--selftest`：对已加载 client.js 做 in-memory 标签替换后重跑 8 视图仍全过 | 保留；**v2 明确其证明边界**：它只证「探针不依赖文案」，**不证 en 态正确**（后者由 B/C/D 承担） |

`panel-view-baseline.json` 改**主键化** `{pane,key,label,kind}`：zh 态仍要求 label 逐字一致；en 态只比 key+kind。**绝不进 `panel-contract`。**

---

## 十、分期工单（v2 修正 R3）

| 期 | 范围 | 条数 | 判据 |
|---|---|---|---|
| **P0** | 4 处解耦（含 `'需重载'` **10 行**）+ `dataset.view` | 0 | 两态行为一致 + scan 先红后绿 + **独立 commit** |
| **P1a** | **先减**：抽 body.js 串到词表（净减） | — | `check-module-growth` 显示 **< 626** |
| **P1b** | **后加**：`attachLocale` 接线 + 宿主外壳 12 处 + `aria-label` | 83 | 不涨回 626 之上（≤ 626−净减+SLACK） |
| P2 | 总览 + 记忆 | 339 | 扫描归零 + 键集双向 + 两态渲染 |
| P3 | 参数（toggles 独占 189 unique / 213 次出现） | 189 | 同上 |
| P4 | 运行面 | 336 | 同上 |
| P5 | 设置杂项 | 117 | 同上 |
| P6 | 宿主分区验收 | 0 | 端到端 |

> **v2 关键更正**：v1 要求 P1「必须净减」，但 `body.js` 实测 **626 = 基线 626（零余量，SLACK=15）**，而 P1 同时要**新增**接线与 12 处宿主外壳调用点 ⇒ 净减不天然成立。v2 拆成 **P1a 先减 / P1b 后加**，并要求净减量写进 commit message 可 git 复核（因 `--rebase` 不在门禁调用面内，FREEZE 可自签）。

### 易漏抽取面

- **宿主外壳 12 处 / 3 键**：插槽 React 分支 5 处（`body.js:950/951/952/958/969`）+ DOM 直插兜底分支 8 处（`mountFallbackEntry` L747/748、克隆设置按钮 L778/781、回退 L790/792/794）。**两条路径互斥，漏一条就在"另一半宿主"上留中文**。
- `body.js:624` nav title「守藏 SHOUCANG」+ `:620` `aria-label` + 模态 `aria-label '守藏记忆面板'`。
- ⚠ `mountSidebarEntry` 首行 `if (document.getElementById('scpanl-btn')) return true` ⇒ 切语言**不会重建入口**，须纳入订阅的定向补丁。
- 硬编码字面量：`panes-memory-detail.js:196`、`panes-overview.js:328`。

---

## 十一、零回归边界（v2 修正）

- **豁免仅限标签显示**：zh 态 `env` → 「环境」，属可感知变更 ⇒ 记 CHANGELOG `[Unreleased]`，并从「zh 逐字节零回归」中**显式豁免**。
- **v2 扩展**：豁免同时覆盖**可分辨性影响**（撞名消解是补偿措施，但仍是行为变更），须一并记账。
- **其余 1064 条 zh 态仍须逐字节不变**（`tr(key, zh)` 的 zh 路径不查表 ⇒ 结构性保证）。
- `1064` 是**出现次数**（`panes-toggles` 实测 189 unique / 213 次出现）；真实**键数**更小。⚠ **v2 新增防固化规定**：首跑 baseline 必须由**双人复核或与扫描器 `--selftest` 交叉验证**后写死，禁止"首跑即真理"（否则首跑漏抽会把错误低位固化，补键反被判成"新键违规"）。

---

## 十二、剩余已知缺口（如实登记，不假装已解决）

| 缺口 | 影响 | 为什么本次不修 |
|---|---|---|
| client 侧无架构门禁（I1/I2/architecture 只扫 host） | 新增模块的依赖方向、分层、扇入扇出无人看 | 属工具面扩建，非 i18n 范畴；v2 以 keys 件 A–F 作为**替代判据** |
| `FREEZE --rebase` 可自签 | 棘轮的理论执行者 = 被约束者 | 属工具面，v2 以 commit 序列 + git 复核承接 |
| 中文 tag 在 `TAG_ORDER` 垫底 | 排序上中文标签恒在末尾 | 属排序语义变更，非 i18n 范畴 |
| `tr()` 内联 zh 串使源码仍含大量中文 | 扫描面需位置豁免 | 换取「零回归结构性」，是**有意取舍** |
| `check-installed-features` 原为报告态 | 需改造为可红 | v2 已列为验收⑥的**前置改动**，不改造则该条恒真 |

---

## 附：本会话附带修复

**圆桌插件节点创建全线失败** —— `NODE_ALLOWED_TOOLS` 含本宿主不存在的工具名（`str_replace_editor`/`bash`/`list_subagent_models`），`ToolRuntime.restrict()` 对未注册名**直接抛错**（`registry.d.ts` L603）。
**修法**：改为**运行时按真实注册表过滤**（`ctx.tools.get(name, scope) !== undefined`）。`src/members.ts` 与运行时副本 `lib/index.js` 同步修改，热重载后节点创建**实证恢复**。
