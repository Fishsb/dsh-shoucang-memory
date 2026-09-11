# shoucang 三缺陷修复 · 生产上机部署报告（Go/No-Go + 热重载 Runbook）

**日期**：2026-09-11
**工作流**：工作流 4 · 部署前检查（Go / No-Go）
**参与成员**：Zhen（工程督导·编排）· Rex（SRE）· Cody（代码审查师）
**部署对象**：`dsh-shoucang-memory@4ec6dc650cf346d26b2ff8553f5f3af29da5ce79`
**宿主**：`127.0.0.1:3080`（dsh-web，承载用户会话，**全程未重启**）

---

## 📌 TL;DR（执行摘要）

- **整体结论**：🟢 **已上机生效**（2026-09-11 23:39 热重载完成并验收通过，见 §5.1 实测结果表，11 项判据全数命中）。
- **严重度分布**：🔴 严重 1（已修）· 🟠 高 2（已修）· 🟡 中 4（2 已修 / 2 待观察）· 🟢 低 2（提示）
- **阻塞 / 非阻塞**：**当前无阻塞项**。上机途中曾出现 2 个 🔴 阻断（B0 功能回归、B1 产物未对齐），均已消解。
- **最重要的一件事**：本次修复**自身引入过一个回归**——`panel.ts:340` 的守卫把 gated 载体永久短路，48 行深睡知识索引在**每一轮真实对话**中归零。它是被 Rex 与 Cody 交叉复核抓出来的，且**我自己写的 A6 断言没能拦住它**（夹具形态失真导致假绿）。已修并补了反向证伪。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟢 **已生效**（热重载完成 + 11 项验收判据全数命中） |
| 阻塞项数量 | **0**（B0 已修 + 反向证伪；B1 随重钉自动消解） |
| 上机实证 | `OK: …（清缓存 14 模块，重建 1 fiber）` · `before/after: [active]` · `reload ok:344 fail:0` |
| 关键行动项 | 3 条（重载已完成，剩余为观察与后续 ticket，见文末行动清单） |
| 上机目标 commit | `4ec6dc6`（含 B0 回归修复） |
| profile 依赖 | `github:Fishsb/dsh-shoucang-memory#4ec6dc650cf346d26b2ff8553f5f3af29da5ce79` |
| 安装副本核验 | `lib/` **43/43 一致**（`client.js` 仅换行符差异，已独立复核） |
| 建议下一步 | 在 DSH 会话内执行 `dev_reload_package {"packageName":"dsh-shoucang-memory"}`，随后按 §5 验收清单逐项核对 |

---

## 1. 检查清单逐项打勾

| # | 检查项 | 结论 | 证据 |
|---|--------|------|------|
| ① | 仓库提交 | ✅ | `git rev-parse HEAD` = `4ec6dc6`；`git ls-remote origin refs/heads/master` 同值 |
| ② | profile 依赖重钉 | ✅ | `~/.dsh/profiles/web/package.json` → `#4ec6dc6...`；备份 `package.json.bak-<ts>` + `pnpm-lock.yaml.bak-<ts>` 存在 |
| ③ | `pnpm install` | ✅ | `Packages: +1`，`Done in 21.4s`，exit 0 |
| ④ | 装配副本产物 | ✅ | `lib/` 递归比对 **43 文件 · 43 一致 · 0 不一致**；`client.js` 归一化 CR 后一致 |
| ⑤ | 修复特征已进产物 | ✅ | `lib/panel.js` 含 `if (q && relOn)`、旧守卫仅残留于说明注释；`lib/scheduler.js` 已指向 `SURFACE.mcl?.familiarThreshold` |
| ⑥ | 无陈旧残留 / 孤儿文件 | ✅ | 无 ONLY-REPO / ONLY-INSTALLED；`package.json` 版本 repo `0.3.0` = installed `0.3.0` |
| ⑦ | `skill/` 库根镜像 | ✅ | `check-deploy-sync` 81 件：**一致 65 · 库内缺失 16（仓内开发脚本，本就不部署）· 不一致 0** |
| ⑧ | 持久化阈值 | ✅ | `~/.dsh/suite/scheduler.json` → `mclFamiliarThreshold: 0.58` |
| ⑨ | patch 配置 | ✅ | `cordis.patch.yml` 无 shoucang 条目，无 config 覆盖干扰 |
| ⑩ | 宿主健康 | ✅ | 3080 在线；`/super-injector/api/list` → `{"ok":true,"stats":{"reload":{"ok":343,"fail":0}}}` |
| ⑪ | 机检全绿 | ✅ | `check-hardcode` PASS · `check-runner` 7/7 PASS · `test-carrier-layers` **20 PASS / 0 FAIL** · `npm test` exit 0 |
| ⑫ | 回滚预案 | ✅ | 备份齐备；`reloadPackage` 失败自动回滚保旧代（见 §6） |

### 上机途中出现并已消解的两个 🔴 阻断

| 项 | 内容 | 消解方式 |
|----|------|---------|
| **B0** | `panel.ts:340` 守卫 `if (q && relOn && allMem.length)` 恒假 ⇒ gated 载体**永久无法**进入注入面 | 去掉 `&& allMem.length` + 更正 1587 行同失效注释 + 新增 A7 真库形状断言（三条）+ **反向证伪** |
| **B1** | 安装副本 `scripts/check-deploy-sync.mjs` 落后仓一代 | 随本次重钉全量重装自动对齐（仓 `7609de58a559` = 安装副本 `7609de58a559`） |

---

## 2. 本次上机的修复内容（4 项）

| 编号 | 严重度 | 问题 | 修法 |
|------|--------|------|------|
| **缺陷1** | 🔴 严重 | 热记忆恒定注入面不执行载体分层过滤，R/E 层（gated）行被无条件注入，实测泄漏 **76.1%** | `src/targets.ts` 新增注册表驱动的分层谓词单一实现（`indexCarrierSet`/`profileCarrierSet`/`indexRowInLayer`/`highConfCarrierSet`/`scanIndexRows`），`panel.ts` 与 `vec.ts` 改为调用，消灭了三处重复实现与硬编码标签白名单 |
| **缺陷2** | 🟠 高 | MCL 快通道相似度阈值 0.65 **高于实测上限 0.634**（193 样本 max=0.634 / mean=0.5658 / p90=0.624，≥0.65 命中 **0**） | 注册表 `surface.mcl.familiarThreshold` 0.65 → **0.58**；`scheduler.ts` 兜底默认值与 schema default 一并改为读 SSOT（原 `default(SURFACE.threshold.tOn)` 属**另一套语义**的 0.65，被误用作熟悉度缺省） |
| **缺陷3** | 🟠 高 | 合规判定只认逐字复现，**159/159 恒 false**，5 次 nudge 零效果 | `mcl.ts` 改为多信号判定：整串包含 / 前 6 字符前缀 / 词元覆盖率（命中 ≥2 且 ≥0.6） |
| **B0 回归** | 🔴 严重 | 缺陷1 修复引入：相关性通道被空集合短路 | 见 §1 表格 |

### B0 回归的完整机制（本次最值得留痕的一条）

```
panel.ts:306  const allMem = readIdx('MEMORY.md')   ← 缺陷1 修复后只剩 P/always 行
panel.ts:340  if (q && relOn && allMem.length) {    ← 守卫写于 allMem 尚未过滤的年代
panel.ts:348    const { rows } = recallIndex(memRoot, q, cap, 'all')   ← gated 唯一渲染器
```
真库 `MEMORY.md` 的 48 条索引行全是 E 层 gated（`env19 / flow8 / tool7 / lesson14`），always **0** 行 ⇒ `allMem.length === 0` ⇒ **守卫恒假 ⇒ 348 行永不执行**。
而 `q` 在真实注入时 = 最近一条 `user/message` 的前 300 字符（`taskTextOf`，`panel.ts:1581-1594`），几乎恒非空 ⇒ **100% 真实轮次回归**，不是"仅预览态退化"。

**A6 为何没拦住**：A6 夹具的 MEMORY.md 混有 P 层行 ⇒ `allMem` 非空 ⇒ 守卫通过 ⇒ **断言假绿**。真库形状（全 gated）从未被覆盖。

**反向证伪（证明新断言真能变红）**：把守卫改回缺陷态重跑 —— **A7-2 / A7-3 变红而 A6 仍绿**，精确复现了 A6 的假绿；还原后 **20 PASS / 0 FAIL**。

---

## 3. 真实库离线验证（用**安装副本**的新 `targets.js` 跑真库）

这是"证明修复有效"而非"确认代码存在"的关键一步，无需重载即可验证：

```
真库 = C:\Users\lk\.dsh\skills\managing-memory
index/always = 身份 使命 演化 偏好 习惯 原则 环境 硬件
index/gated  = 经验 教训 路径 env tool flow lesson

MEMORY.md 全量索引行 = 48   其中 always 层 = 0   其中 gated 层 = 48

q="深睡"              → 总命中 3 行，MEMORY.md 2 行（gated 2）
                          [flow] 判据域分治 · 蒸馏/深睡各自判据…
q="DSH 环境 数据目录"  → 总命中 10 行，MEMORY.md 8 行（gated 8）
                          [env] DSH 环境 · 数据目录/3080/模型/组装链…
q="Zhihu 检索 工具"    → 总命中 10 行，MEMORY.md 5 行（gated 5）
                          [tool] Zhihu 检索 · cli0.2.0/本地…
q="继续"              → 总命中 0 行（契约内收窄，见 §7-N3）
```

**结论**：B0 修复有效——gated 载体按**相关性**回归注入面，且受 `cap` 约束。

---

## 4. 热重载执行 Runbook（**须由人在 DSH 会话内执行**）

### 为什么我做不了

`dev_reload_package` 是 super-injector 提供的 **host 工具**，只存在于 DSH 进程内。其 HTTP API 仅有 `GET /list`、`POST /uninstall`、`POST /inject`、`POST /ingest`，**没有 reload 端点**；`~/.dsh/super-injector/registry.json` = `[]`（shoucang 是 profile bundle 依赖，不在注入清单），自动 watch 亦不覆盖它。
已复核 `self-heal.log` 监听机制（lib/index.js:8041）——那是**脚手架守护 agent 模板**，不是重载通道。`reload-debug.log` 最后一条为 18:24，历史上 99 次 shoucang 重载**全部**由会话内手动调用产生。

### Step 0 —— 空参列清单（确认 entry 找得到）

```
dev_reload_package
```
- 参数：`{}`
- ✅ 成功：输出以 `===== 当前已装配插件（loader entries）=====` 开头，清单含 `- [active] include:dsh-shoucang-memory (dsh-shoucang-memory)`
- ❌ 失败：出现 `（loader 中无已装配插件 entry）` 或清单无 shoucang → **停下**，说明未装配，须交用户手动重启宿主

### Step 1 —— 重载

```
dev_reload_package {"packageName": "dsh-shoucang-memory"}
```
- ✅ 成功：`OK: dsh-shoucang-memory 热重载完成（清缓存 N 模块，重建 M fiber）` + `before: [active]` / `after: [active]`
- ⚠ 部分成功：`WARN: … 部分重建（x/y）` → 按 §7-N4 查多代并存
- ⚠ `after: [loading（检查超时，功能以实际为准）]` ≠ 失败（`waitFiberStable` 只等 3s），等 3–5s 直接查端点
- ❌ 失败四种：
  - `ERROR: 重载前构建产物预检失败` → 先 `npm run build:all`
  - `ERROR: import 失败，已回滚缓存（旧代保留）` → 旧代完好
  - `ERROR: 重建失败，已回滚（旧代保留）` → 见 §6(a)
  - `ERROR: 检测到未登记的裸注册…已自动清理残留路由` → 按提示再重载一次

### Step 2 —— 30 秒内完成 §5 验收（`injectCache` TTL = 30000ms）

---

## 5. 上机验收清单（可直接复制；**本机有 MITM 代理，curl 必须 `--noproxy '*'`**）

```bash
# ① MCL 阈值 + 计数器（最强重载证据）
curl -s --noproxy '*' -m 15 http://127.0.0.1:3080/api/shoucang-panel/mcl/status

# ② 无 q 的注入预览
curl -s --noproxy '*' -m 20 'http://127.0.0.1:3080/api/shoucang-panel/inject/preview'

# ③ 带 q 的相关性召回
curl -s --noproxy '*' -m 20 'http://127.0.0.1:3080/api/shoucang-panel/inject/preview?q=%E6%B7%B1%E7%9D%A1'

# ④ 注入装配计数
curl -s --noproxy '*' -m 15 http://127.0.0.1:3080/api/shoucang-panel/inject/stats

# ⑤ 注入器运营计数
curl -s --noproxy '*' -m 15 http://127.0.0.1:3080/super-injector/api/list
```

| # | 字段 | 重载前基线（实测） | 重载后期望 | 不通过的判读 |
|---|------|------------------|-----------|-------------|
| ① | `mcl/status.familiarThreshold` | `0.65` | **`0.58`** | 仍 0.65 ⇒ 新代未生效 |
| ①b | `mcl/status.steps` | `301` | **归零或跳到个位数** | 仍从 301 递增 ⇒ 旧代仍在跑 |
| ② | `inject/preview.text` 长度 | `2901` | **≈2000（1900–2150）** | 几乎不变 ⇒ 未生效 |
| ②b | gated 标签 `env/tool/flow/lesson/经验` | `3/3/2/2/1` | **全 0**（无 q 恒定面） | 仍出现 ⇒ 未生效 |
| ②c | `路径` 计数 | 3（含 1 个来自小标题） | **1**（只剩小标题） | — |
| ②d | `原则/偏好/习惯/身份/环境/硬件/演化` | `11/3/2/1/1/1/1` | **基本保留**（P 层不受影响） | 大幅下降 ⇒ 过度过滤，回退 |
| ③ | 带 q 的 preview（MEMORY 段） | 恒 ~10 行 | **≥1 行且 ≤10，通常 2–4 行** | 见下方 ⚠ |
| ④ | `inject/stats.calls` | `301` | **归零**（模块级 `const` 重建必重置），随后随对话 +1 | 不归零 ⇒ 未重载 |
| ⑤ | `stats.reload` | `ok:343 fail:0` | `ok:344 fail:0` | `fail` +1 ⇒ 重载抛错 |

⚠ **带 q 的验收口径（易误判，务必按此）**：去守卫后 `picked` **只**来自 `recallIndex`，且它是先在全库取 top-`cap` 再按 `file === 'MEMORY.md'` 过滤 ⇒ MEMORY 子集通常**明显小于 cap**。
- 修前：恒 ~10 行（相关性 ∪ 新鲜度 ∪ 位置式补位，被补到 cap）
- 修后：通常 **2~4 行**
- ⇒ 看到 3 行是**正常**；反过来若"回到 10 行"反而说明补位池被换成不限层（缺陷1 被回滚）

🚫 **不要用 `/criteria` 当证据**：它 `readFileSync` 读磁盘，现在就已返回 0.58，证明不了内存换了代。

---

## 5.1 验收实测结果（2026-09-11 23:39 重载后实测）

重载输出：`OK: dsh-shoucang-memory 热重载完成（清缓存 14 模块，重建 1 fiber）` · `client ✓ (lib/client.js)` · `before: [active] → after: [active]`。
装配表复核：`[active] dsh-shoucang-memory`，`entry: file:///…/node_modules/dsh-shoucang-memory/lib/index.js`。

| # | 判据 | 重载前 | 重载后实测 | 判定 |
|---|------|--------|-----------|------|
| ① | `mcl/status.familiarThreshold` | `0.65` | **0.58** | ✅ |
| ①b | `mcl/status.steps` | `411` | **5**（归零后重新计数） | ✅ 旧代已换 |
| ①c | `sessions` / `tasks` | `4` / `27` | **0** / **3**（未翻倍） | ✅ 无多代各记一份 |
| ② | `inject/preview` 长度（无 q） | `2902` | **2031**（−30%） | ✅ 落在 1900–2150 |
| ②b | gated **数据行**泄漏 | 13 行 | **0** | ✅ |
| ②c | `路径` 计数 | 3 | **1** | ✅ 经上下文坐实为提示文本 `agent 画像（AGENT.md；含 [原则]/[路径] …）`，**非索引行** |
| ②d | P/always 保留 | — | 身份1 演化1 偏好3 习惯2 原则11 环境1 硬件1 | ✅ 未过度过滤 |
| ③ | 带 `q=深睡` | 恒 ~10 行 | **flow×2 现身**（长度 2184） | ✅ **B0 修复生效**，gated 经相关性通道回归 |
| ④ | `inject/stats.calls` | `411` | **5**（归零） | ✅ 模块级 `const` 已重建 |
| ⑤ | `stats.reload` | `ok:343 fail:0` | `ok:344 fail:0` | ✅ 无失败 |
| ⑥ | `distill 启动` 累计 | 218 | **219**（+1） | ✅ 无多代并存 |
| ⑦ | `deep sleep 巡检启动` 累计 | 213 | **214**（+1） | ✅ 无多代并存 |
| ⑧ | `reload-debug.log` | 1372 行 | 1376 行，新增 1 条 `reload match=dsh-shoucang-memory` | ✅ `activeEntry` 唯一、`fiberState=active`、`entry.disabled=false` |
| ⑨ | `mcl-audit.jsonl` | 274 行 | 276 行：新增 `mcl-ready` + `mcl-step`（`channel=slow`、`sim=0.541`） | ✅ 新代已开始记录 |

**判定：已生效。** 三个关键实证——阈值换值（0.65→0.58）、计数器归零（411→5，旧代确已 dispose）、gated 相关性回补（带 q 时 `flow` 现身）——构成本次上机的完整证据链，不依赖 `before/after` 状态标签。

**未覆盖 / 待观察**：`mcl-step` 新增样本尚无 `compliant` 字段（新代刚起，nudge 未触发），缺陷3 的假阳率需在 ≥30 min 观察窗口后评估；`fast` 通道仍为 0，符合 §7 的双门联合 ~1% 预期。

---

## 6. 回滚方案

### (a) 热重载失败 / 新代异常

`reloadPackage` 主路径（lib/index.js:8806–8870）在 `import` 或 `registry.plugin()` 抛错时：`loadCache` 恢复 backup → `registry.delete(fresh)` → 用 `oldPlugin` 重建 fiber → 输出 `ERROR: …已回滚（旧代保留）`。

**如何确认已回滚**（四取二即可）：
1. Step 1 输出含「已回滚（旧代保留）」
2. `/mcl/status` 仍 `0.65` 且 `steps` 从 301 继续递增（不归零）
3. `inject/preview` 长度仍 ~2901、gated 标签仍在
4. `/super-injector/api/list` 的 `stats.reload.fail` +1

若新代起来了但行为异常：再调一次 `dev_reload_package`（幂等，回到当前磁盘代）。

### (b) 彻底回退（两级，备份均已**实测核验指向**，非假设）

| 目标 | 用哪个备份 | 该备份实测指向 |
|------|-----------|---------------|
| 回到 `3dfa68f`（缺陷1/2/3 已修、**B0 未修**） | `package.json.bak-20260911-232525` | `github:Fishsb/dsh-shoucang-memory#3dfa68f83b2cab241133dfec4c9361f8114c94b4` ✅ |
| 回到 `a70f134f`（**全部修复前**） | `package.json.bak-20260911-223950` | `github:Fishsb/dsh-shoucang-memory#a70f134f0a154ebbd88350c6a43bebcf392bee82` ✅ |

> ⚠ 注意：`3dfa68f` 带的是**未修 B0** 的代码（gated 永久 0 行）。只有在需要隔离"B0 之外的变更"时才回这一代；否则直接回 `a70f134f`。

步骤（以 `a70f134f` 为例）：

1. `~/.dsh/profiles/web/package.json` 的 `dsh-shoucang-memory` 改指 `#a70f134f…`（**先备份，勿覆盖 `package.json.bak-20260911-223950`**）
2. 在 `~/.dsh/profiles/web` 下 `pnpm install`
3. **复核**：重跑 `lib/` sha1 比对，确认 `targets.js/panel.js/mcl.js/vec.js/criteria.generated.js` 已变回旧哈希
4. `dev_reload_package` → `{"packageName":"dsh-shoucang-memory"}`
5. **把 `~/.dsh/suite/scheduler.json` 的 `mclFamiliarThreshold` 改回 `0.65`** —— 否则阈值仍是 0.58，回退不彻底（本条为 SRE 补出，原清单漏了）
6. 库根 `~/.dsh/skills/managing-memory` 若需同步回退：`engine/criteria.json`、`engine/criteria-gate.json`、`engine/criteria.md`、`docs/archive-detection-design.md` 四件的 `.bak-20260911-225449` 备份还原

> `hasHighConf` 侧无需回退：新代码从注册表读 `mclGate`，旧代码硬编码 `/^\[(路径|原则)\]/`，语义相同。

---

## 7. 风险、副作用与诚实上限

### 🔴 诚实上限一：缺陷2 的真实收益远低于 27.5%

`src/mcl.ts` 确认 `const fast = sim >= cfg.familiarThreshold && hasHighConf`（**双闸门 AND**）。本次只放宽了 sim 闸。193 条 `mcl-step` 独立重算：

| 指标 | 实测 |
|------|------|
| sim max / mean / p90 | `0.634` / `0.5658` / `0.624` |
| `sim ≥ 0.65` | 0 / 193 |
| `sim ≥ 0.58` | 53 / 193（27.5%） |
| `hasHighConf`（top-K 含 `原则`/`路径`） | 10 / 193（5.2%） |
| **双门联合（真正走 fast）** | **2 / 193 ≈ 1.0%** |
| `compliant: true` | 0 / 193 |

⇒ 验收口径应写为「快通道触发率 0% → 约 1%（约每 100 步 1 次）」。**不得**宣称 27.5%，**不得**宣称"必然触发"。

### 🟠 诚实上限二：缺陷3 的新判据可能过冲

新 `judge()` 是三信号「或」，其中词元覆盖率口径偏松：`signalTokens` 对中文取**二字滑窗**，`rowSignals` 并入「主题词 + 小节名 + 指针文件名」并取并集，常见词（「工具」「任务」「配置」）极易撞上。若某 row 仅 3 个词元、2 个是常见词 → `2/3 = 0.67 ≥ 0.6` → 判合规，即使模型并未引用。
**观察**：`compliant` 从 0% 跳到多少；若 >50% 说明过松，需收紧至「覆盖率 ≥0.75 或 词元数 ≥4」。

### 🟡 N3：短指令零命中属契约内收窄

去守卫后，新鲜度槽与位置式补位仍作用在空的 `allMem` 上（no-op）。像「继续」这类短指令若相关性零命中 ⇒ 知识索引段为空（真库实测 `q="继续"` → 0 行）。
**这是契约的正确结果**（gated 只按相关性现身），不是回归。若业务无法接受，正解是在注册表 `criteria.json#carriers.tags` 把 `env`/`tool`/`flow` 的 `inject` 提为 `always`，**不是放宽代码里的过滤器**（那等于回滚缺陷1）。

### 🟡 N4：多代 fiber 并存

`skill/docs/dev-scenarios.md` 记「reload 多代 fiber 并存：幽灵 tick / 双蒸馏 / interval 叠加」，标为「⬜ 部分覆盖，实测出现过 4 次启动行并存」。
**缓解证据**：`panel.ts` 的 28 条路由全经 `route()` 收集进 `disposers`，在 `ctx.effect` 里 `return () => disposers.forEach(d => d())`，dispose 语义正确；历史 99 次 reload 未出现 duplicate route。风险中等偏低但**仍需观察**。

**判据（重载后 1 分钟内）** —— 已记录重载前基线，**重载后做差即可**：

| 日志 | 重载前基线（2026-09-11 23:35 实测） | 重载后应见 |
|------|-----------------------------------|-----------|
| `shoucang-scheduler.log` | 行数 **3079**，末行 `[…15:29:11.240Z] distill: 09bd` | 新增行数有限 |
| `shoucang-scheduler.log` 「distill 启动」 | 累计 **218** | **+1**（>1 ⇒ 多代并存） |
| `shoucang-scheduler.log` 「deep sleep 巡检启动」 | 累计 **213** | **+1**（>1 ⇒ 多代并存） |
| `reload-debug.log` | 行数 **1372**（末条 18:24，停更逾 5 小时） | 新增段落：`activeEntry=` 唯一、`fiberState=active` |
| `mcl-audit.jsonl` | 行数 **274**，末行 `at=2026-09-11T15:27:58.853Z` | 新增 `mcl-step`，看 `channel` / `compliant` |

- `~/.dsh/super-injector/shoucang-scheduler.log`：「distill 启动」与「deep sleep 巡检启动」应**各只出现 1 条**
- `reload-debug.log` 新增段落：`activeEntry=` 唯一、`fiberState=active`、`entry.disabled=false`
- `/mcl/status` 的 `sessions` / `tasks`（现 1 / 19）：翻倍 ⇒ 多代各记一份
- `~/.dsh/suite/knowledge/audit/ledger.jsonl`：出现重复 decision/write 行 ⇒ 双蒸馏

### 🟢 提示：CRLF 会反复制造假 diff

仓无 `.gitattributes` 且 `core.autocrlf=true`，`client.js` 不经 tsc（由 `build-client.mjs` 逐字复制）是唯一受害者（Δbytes = 2331 = CR 数）。非阻塞，建议后续固化 `* text=auto eol=lf`。

---

## 8. 观察窗口与判定标准

| 时点 | 动作 | 判定 |
|------|------|------|
| T0 | 执行 Step 1 重载 | `OK: …热重载完成（清缓存 N 模块，重建 M fiber）` 且 `after: [active]` |
| T0 + 2 min | 跑 §5 全部端点 | `familiarThreshold=0.58` **且** `steps` 归零 **且** `inject/stats.calls` 归零 **且** preview ≈2000 且无 q 时 gated 标签为 0 且带 q 时 MEMORY 段 ≥1 行 ⇒ **可宣布"已生效"** |
| T0 + 30 min | 看 `mcl-audit.jsonl` 新增行 | 出现 `compliant: true`（缺陷3 生效）；`channel` 仍以 `slow` 为主属正常（双门联合仅 ~1%） |
| T0 + 1 min / T0 + 2 h | 看 `shoucang-scheduler.log` | 启动行各 1 条；2h 内无重复蒸馏/重复 tick ⇒ 无多代并存 |

**日志清单**
- `~/.dsh/super-injector/reload-debug.log` —— reload 明细
- `~/.dsh/super-injector/shoucang-scheduler.log` —— 启动行 / distill / deep sleep（**重载前记下行号做差**，该文件历史噪音大）
- `~/.dsh/suite/knowledge/audit/mcl-audit.jsonl` —— `mcl-step` 的 `channel / sim / compliant`
- ⚠ `mcl.ts` 的「MCL 认知环已装配」**不落** shoucang-scheduler.log（grep 命中 0 次），别拿它当观测指标

---

## ✅ 行动清单（按优先级）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | ~~**执行热重载**~~ | 用户 | **P0** | ✅ **已完成**（23:39，`清缓存 14 模块 / 重建 1 fiber`） |
| 2 | ~~按 §5 验收清单逐项核对~~ | Zhen | **P0** | ✅ **已完成**（11 项判据全数命中，见 §5.1） |
| 3 | **观察窗口**：`compliant` 率是否过冲（>50% 需收紧）、`fast` 触发率是否 ~1%、T0+2h 复查启动行未再增长 | 用户 / Zhen | P1 | T0+30 min / T0+2 h |
| 4 | 补 N1：`panel.ts:1125` / `:1526` 两处无过滤 `/^\[` 扫描（仅遥测/展示，非门控）接到 `indexCarrierSet`/`scanIndexRows`；并把 A4c 断言从「精确串匹配」扩为覆盖两处 | Cody | P1 | 下一迭代（需重钉 + 重装 + 重载一轮） |
| 5 | 待业务拍板：MEMORY.md 恒定面归零（48 行 env/tool/flow 全部不常驻）是否可接受；若否 → 改注册表 `inject` 提层，**不改代码** | 用户 | P1 | 观察窗口结束后 |

---

## ⚠️ 待完善 / 已知局限

- ~~热重载未被我执行~~ → **已由用户执行完成并验收通过**（2026-09-11 23:39）。附带确认：host 工具确实不在外部 shell 能力范围内（HTTP API 无 reload 端点、registry 为空、watchFile 属脚手架模板），此类动作今后仍需会话内执行。
- 缺陷2 真实收益约 1%（双门联合），且 `hasHighConf` 侧未放宽——这是**有意保留**，放宽它属行为变更，需单独决策。
- 缺陷3 新判据的假阳率未知，需真实轮次观察窗口（≥30 min）才能评估。
- `check-deploy-sync` 的「库内缺失 16 件」是仓内开发脚本，本就不部署，属诚实标注而非缺陷。
- 恒定注入面从 64 行降到 16 行（−75%）是**产品行为变更**，虽符合载体契约，但需业务确认。

---

## 📚 数据来源 & 成员产出索引

- **Rex（SRE）**：Go/No-Go 逐项打勾（7 项全绿）、热重载 runbook（Step 0/1/2 + 四种失败特征）、验收清单与期望值、两级回滚方案、观察窗口。独立发现并量化了 B0 回归的杀伤面（100% 真实轮次），并**主动改判 Go → No-Go**，修正了我 3 处事实错误（2901 而非 2902 字符、真实越权 13 条而非 14 条、`familiarThreshold=0.65` 源于启动快照而非硬编码兜底）。
- **Cody（代码审查师）**：`lib/` 43 对逐文件 sha1（42 MATCH + `client.js` CRLF-only，并补出根因 `core.autocrlf` + 无 `.gitattributes`）、`src/`→`lib/` 零漂移可重现验证（仓库外临时目录重编译比对）、修复特征 grep、零硬编码红线、三项部署风险。**自我更正**了上一份报告中「召回能补位」的误判（那次实测绕过了 panel 组装路径），并提出了比 Rex 更小的修法（只去守卫，不动补位池）。
- **Zhen（工程督导）**：修复实现、A7 真库形状断言与反向证伪、落盘与编排。

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
