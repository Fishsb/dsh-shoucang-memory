# 守藏插件 中英文切换 — 交付报告（2026-09-17）

> 原 `deliverables/i18n-ratification-request.md`（冻结期待裁决文档）已由本报告取代 ——
> 用户 17:5x 明确指示「不要让我决策，直到全部完成；不确定就测试 + 检索判断」，据此解除冻结并完成收口。

## 一、交付内容

| 层 | 交付物 |
|---|---|
| 运行时 | `src-client/i18n.js`（`tr()` / `attachLocale()` / 缺键记录）· `src-client/tag-label.js`（21 键标签映射 + 撞名消歧） |
| 词表 | `src-client/i18n-dict-{nav,memory,pane-run,pane-arch,cfg}.js` — **923 条**中文原文 → 英文 |
| 新模块（外提解冻） | `src-client/i18n-nav.js`（导航文案层）· `src-client/i18n-ctrl.js`（控件元数据域） |
| 接入 | `src-client/body.js`（`attachLocale` + `relabelChrome` + `data-view` 锚点）等 12 个 pane 文件 |
| 机检（新增 6 件，均已登记 `CHECKS` 且**无 xfail**） | `check-i18n-keys` · `check-i18n-scan` · `check-i18n-redlines` · `test-i18n-render` · `i18n-parity` · `i18n-smoke` |
| 诊断（不进 CHECKS） | `i18n-blindspot`（扫描器盲区）· `i18n-probe` · `i18n-missing` · `i18n-coverage 诊断` |
| 工具 | `i18n-convert` / `i18n-extract` / `i18n-merge-dicts` / `i18n-diff-keys` |
| 记账 | `CHANGELOG.md` `[Unreleased] ### Added` 一条 · `.gitignore` 补 i18n 瞬态产物 |

## 二、验收证据（六条 + 两条补充，全部实跑）

| # | 验收项 | 结果 |
|---|---|---|
| ① | `npm run typecheck` | **零错** |
| ② | `npm run build` | 成功（`client.js` 668KB，路由数仍 **42**） |
| ③ | `node scripts/check-runner.mjs` | **PASS（135 pass · 0 xfail · 0 skip）** |
| ④ | `ui-geo-regress` | **100 PASS / 0 FAIL**（回到基线） |
| ④b | `i18n-parity`（**本件新增**） | **PASS**：A. zh 全页 9/9 视图逐字符一致 · B. en 全页 9/9 视图无裸键/无中文残留/零缺键 |
| ⑤ | `check-panel-contract` + `gen-panel-contract --check` | **5 PASS / 0 FAIL** · 产物新鲜（3 份一致） |
| ⑥ | `check-installed-features --require-i18n` | **35 项标记齐全**（含 4 项 i18n） |
| ⑦ | 部署同步 `check-installed-sync --strict` | **239 件逐文件 sha1 一致** |
| ⑧ | 热重载 `dev_reload_package` | fiber **前后均 active** |
| ⑨ | 推送前 `check-public-tree` | **PASS**（公开树纯净） |

### 三条核心红线（`check-i18n-redlines` 常驻守）

| 红线 | 判据 | 结果 |
|---|---|---|
| zh 态零回归 | `tr()` 未接入 locale 时**原样返回原文且不查表**（控制流性质） | ✅ + 全页 9/9 逐字符一致 |
| 不破坏 recall 标签匹配 | `targets.ts` 5 个匹配符号完好；`src/*.ts` **零改动** | ✅ |
| 不动真源数据 | `carriers.tags` **18 键逐键等于基线** + `_memory/` 无改动 | ✅ |

## 三、过程中自证抓出的缺陷（全部是「构建绿、真机炸」型）

1. **转换器漏插 import** —— pane 文件以注释块开头，正则缺 `m` 标志 ⇒ import 从未插入 ⇒ **面板 KPI 整块不渲染**（曾从 100 PASS 跌至 48）
2. **顶层 `tr()` 引用** —— pane 被 esbuild 提升到 `load` 之外求值 ⇒ `ReferenceError` ⇒ **整包不注册、面板消失且无提示**
3. **`DICTS` TDZ** —— 常量定义晚于使用 ⇒ 被 catch 吞成「Chrome dump 失败」假缺陷
4. **比较位点被机械包成 `tr()`** —— `s[0] === '停滞'` → `=== tr("停滞")` **保留比较语义**；切语言后恒 false ⇒ 色条永远 running 色。**且 AST 扫描看不见该形态**（比较边是函数调用）⇒ 另建 `i18n-blindspot` 专司捕获
5. **裸键判据漏报（假绿）** —— 探针要求键前边界符属 `[\s（(【\[]`，而实际分隔符是 `。` 且 9 键紧邻 ⇒ **设置页 9 个裸键全部漏报**，两态验收 PASS 却破了 zh 红线 ⇒ 改判据 + 新增全页 `i18n-parity`
6. **装载期 `tr()`（复发 3 次）** —— `CTRL_META`/`SWITCH_KEYS` 等**装配期**建的表里调 `tr()`，那时取不到词表 ⇒ 值**冻死为中文**。⇒ 改「表存语义键 + 读取期分派」，并新增 **R4 机检**常驻守 + 转换器拒绝「对象字面量属性值」
7. **`TABBED` 静默降级** —— 视图名改 id 后漏改配套表 ⇒ `ui-geo-regress` 从 100 跌到 85 而**0 FAIL**（覆盖丢失被 0 FAIL 掩盖）
8. **`UI.pageHead` 裸键回归** —— `panes-settings.js` 直读元组索引 1 当标签，该位改词表键后吐键名 ⇒ zh 红线被破

## 三·附 用户实测报告的缺陷（已修）

**现象**：索引与小节里的标签重复显示 —— `偏好 · 偏好`、`习惯 · 习惯`。

**判因**：`ambiguousTags` 的撞名判据按**出现次数**（`group.length > 1`）而非**不同原始 tag 数**，
而函数文档注释写的是「两个**不同的**原始 tag」—— 注释与实现不一致。USER.md 的 `偏好`×2 / `习惯`×2
因此被误判撞名 ⇒ 「显示名 · 原始键」拼成自重复。

**修法（双重防线）**：
1. `tag-label.js`：判据改「**不同 tag 数** > 1」（先去重再判）——同一 tag 重复出现不再触发附键
2. `panes-memory.js`：显示名与原始键**相同**时不附键（`env`→「环境 · env」仍可消歧；`环境`→「环境」无自重复）
   原始键仍保留在 `title` / `aria-label`（悬停与读屏可达），不靠可见文本承载

**证据**：用真实 `_memory/` 索引数据复现（`scripts/i18n-tagprobe.mjs`）——修复前 `偏好 · 偏好`，
修复后 `偏好`、`环境`、`习惯` 均无自重复，MEMORY/AGENT/USER 三份索引的撞名标记全归零。
新增 `test-i18n-taglabel`（**9 项**，已登记 CHECKS + REQUIRED_CHECKS）——该显示层此前**零测试覆盖**。

---
## 三·附2 用户二次实测：索引行「双标签」（**架构层问题，非 i18n 实现**）

**现象**：一级索引行改好后，点击「展开全部」仍是双标签。

**判因（答「是实现架构还是 UI 架构」）—— 是 UI 架构层**：

`renderIndexRows(container, lines, returnRender, withTagCount)` 在 `withTagCount=true` 时**同时**往两处塞了胶囊：

- **左列** `.sc-idx-row > .sc-idx-tag` —— `row.appendChild(idxPill(...))`，**v9 之前**的旧实现
- **右列** `.sc-idx-row > .sc-right > .sc-idx-tag` —— v9 对齐时**新增**（标签 + 「N 条」）

⇒ **两代实现并存**：新增右列时**没移走左列**，同一行渲染两次同一个标签。
且折叠态与「展开全部」走**同一个** `renderIndexRows(..., true)`，故展开后同样重复 —— 你看到的正是这一处。

**真机证据**（`test-idxrow-pills`，用真实 `_memory/MEMORY.md` 造夹具、逐行数 `.sc-idx-tag`）：

- 修复前：`pills=2 "环境 | 环境"`、`pills=2 "工具 | 工具"`、`pills=2 "流程 | 流程"` …（**每行 2 个**）
- 修复后：**8/8 行每行恰好 1 个**，且右列「标签 + N 条」仍在（未把计数一并删掉）

**修法（归属互斥，不是简单删一个）**：

- `withTagCount`（记忆库页，原型 `.row > .right`）⇒ 标签归**右列**，与「N 条」同格
- 否则（画像页，右列是成熟度数值）⇒ 标签归**左列**

新增 `test-idxrow-pills`（**3 项**，已登记 CHECKS + REQUIRED_CHECKS）：每行恰好 1 个 · 无标签丢失 · 右列计数未被一并删除。

> **为什么此前验收没抓到**：`i18n-parity` / `test-i18n-render` 的夹具不产生索引行，
> 而 `ui-geo-regress` 只量几何、**不数同类节点个数** ⇒ 「同一节点渲染两次」这类缺陷面面皆漏。
> 已按「真实数据造夹具 + 真机计数」补上该面。

---
## 三·附3 标签「· 原始键」后缀（**用户二次实测，已修并目视确认**）

**现象**：折叠态正常，**点「展开全部 212 条」后每行胶囊变成 `环境 · env`**。

**判因**：胶囊曾按 1:N 撞名给显示名拼「· 原始键」后缀。折叠态只渲染 8 行、tag 少 ⇒ **不撞名** ⇒ 无后缀；
**展开后 212 行里 `env` 与 `环境` 同时出现** ⇒ 触发撞名 ⇒ 每行都多一截 `· env`。
这正是「一级界面是正了，点击要开全部看又是双标签」的成因。

**修法**：可见文本**只留映射名**；原始键改由 `title` / `aria-label` 承载（悬停 / 读屏可达）；
随之删除已成死代码的 `ambiguousTags`（函数 + 导出 + 相关判据）。

**目视证据（新增能力）**：`scripts/panel-shot-real.mjs` —— 从**运行中的宿主**直取真实数据
（`/api/shoucang-panel/memory/overview`，root = `~/.dsh/skills/managing-memory`，212 行索引），
喂真实 `client.js` 渲染后**截图**，供人眼核对。修复前后对比：

- 展开态：`环境 · env` → **`环境`**
- 画像页：左列单一标签 `身份` / `环境` / `硬件` / `偏好`（无重复）

> **方法论教训（记一笔）**：前几轮我只读源码 + 自造夹具，漏掉了这类**结构性**缺陷 ——
> 夹具不产生真实形态的数据（真实库 212 行、tag 混杂才触发撞名），而几何门禁只量尺寸、
> **不数同类节点个数**。已补「**真实数据出图 + 人眼核对**」这一面（`panel-shot-real.mjs`）。

---
## 四、待人工确认的一项

**宿主真实 locale 联动**：以上验收用**locale 服务替身**（与宿主 `dsh-client-locale` 同形 API）验证。
真机上请手动确认：**DSH 设置中心切「语言」为 English ⇒ 面板导航/标题/正文即时变英文，切回中文即时复原**
（已列入 `check-installed-features` 的装后核对清单第 6 条）。
