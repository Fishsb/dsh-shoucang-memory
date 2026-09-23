# shoucang × DSH 0.1.7-rc.1 兼容性检查报告

- 检查日期：2026-09-23
- 被检插件：`dsh-shoucang-memory@0.3.1`（本仓 `a5c9b40`）
- 对照宿主：**0.1.7-rc.1**（npm `next` 标签）· 基线 0.1.5-rc.2（本机当前安装）
- 证据方式：全部实测（宿主真函数调用 / WSL 真运行态 import / 符号面 diff），非版本串比对

> **📌 本报告已「收口为机检」（2026-09-23 优化轮）**：§3、§4 两项已**修复**，
> 且其中**可机检的三条**已升级为常驻门禁 `scripts/check-host-compat.mjs`
> （登记于 `check-runner.mjs` 的 `CHECKS`，`233 → 234` 件）——本文件从此只是**背景说明**，
> 结论的「新鲜度」由门禁持续守着，不再依赖有人来重读这份报告。
> ⇒ 门禁用法：`node scripts/check-runner.mjs --only check-host-compat`
> ⇒ 反向验证已做：把 `inject` 改回旧值（`dsh-client-runtime`）⇒ 门 **exit 1**；恢复 ⇒ **exit 0**。

---

## 0. 结论

**兼容性判定：PASS（可用）。** 无阻断项。

- 0.1.7 新增的插件兼容闸门，用宿主自己的判定函数跑我方 manifest：**PASS**（不需要 `compatibility.json` 豁免）。
- 在 WSL 真实的 0.1.7-rc.1 环境里实际 `import()` 已安装的 host 入口：**IMPORT OK**。
- 真实运行日志显示蒸馏 / 深睡巡检在 0.1.7 下**确在运行**。

原发现 2 项**非阻断但应处理**的问题（§3、§4）——**均已于优化轮修复**，见 §9。

---

## 1. 版本面（实测）

| 项 | 值 | 来源 |
|---|---|---|
| 本机（Windows）已装 DSH | `0.1.5-rc.2` | `~/.dsh-win/prefix/.../@deepseek-ai/dsh/package.json` |
| npm `latest` | `0.1.5-rc.3` | `npm view dist-tags` |
| npm `next` | **`0.1.7-rc.1`** | 同上 |
| WSL 已装 DSH | **`0.1.7-rc.1`** | `dsh --version` + package.json |
| WSL node / pnpm | v22.22.1 / 12.4.2 | WSL 实测 |

> 「最新」以 `next` 标签计（用户口径）。`latest` 仍停在 0.1.5 线。

## 2. 依赖面：真实 import 只有 2 处

全仓 417 个源码文件（`src`/`src-client`/`scripts`/`skill`）精确 import 扫描，
宿主依赖**只有两处**（其余 `@deepseek-ai/*` 命中全是注释/文档文本）：

| 文件:行 | 语句 | 性质 |
|---|---|---|
| `src/scheduler.ts:18` | `import { defineTool } from '@deepseek-ai/dsh-tools'` | **运行时真依赖** |
| `src/llm-catalog.ts:20` | `import type { Context } from '@deepseek-ai/cordis'` | 类型 only（编译期擦除） |

编译产物 `lib/` 中实际残留的宿主 import，只有 `lib/scheduler.js:1` 的 `defineTool`；
其余全是 `schemastery`（非宿主包）。**依赖面极小 ⇒ 兼容风险面极小。**

### 2.1 `defineTool` 面：无破坏

`@deepseek-ai/dsh-tools` 符号面 0.1.5-rc.2 → 0.1.7-rc.1：**113 → 113**
（仅删 `CodeSdkLanguage`、增 1；`defineTool` 在 0.1.7 实测 `typeof === 'function'`）。
`DefineToolOptions` 仅**新增**可选字段 `deferLoading?: true`（纯增量，向后兼容）。

### 2.2 被删符号：零命中

`dsh-llm` 侧删除 5 个符号（`ToolResultBlock` / `AssistantProvenance` /
`RequestImageOffloadPolicy` / `offloadRequestImagesWithPolicy` / `offloadedImagePrefixCount`）——
逐名 grep 本仓：**全部 clean**（且本仓不 import `dsh-llm`）。

## 3. 发现①：`dsh.client.inject` 指向已除名的包（非阻断）

`package.json` 声明：

```json
"dsh": { "client": { "inject": ["@deepseek-ai/dsh-client-runtime"], "platform": "web" } }
```

实测事实：

- `@deepseek-ai/dsh-client-runtime` **在 0.1.7-rc.1 整个安装里不存在**
  （`find` 全盘零命中；npm 上该包停在 `0.1.1-rc.2`，早已不发新版）。
- 生态旁证：`dsh-plugin-roundtable/release-notes/v0.2.1.md` 明写
  「客户端运行时三个包被合并/移除：`dsh-client-runtime`…**不再发布**」。
- **为何非阻断**：宿主 `dsh-client-modules` 解析该字段的代码是
  `const dependency = this.graphRows.get(packageName); if (dependency !== void 0) await …`
  —— **找不到即静默跳过**，不抛错、不告警。且 shoucang 的 `client.js` 是 esbuild
  **单 IIFE 自包含**产物（`require("@deepseek-ai/...")` 命中数 = **0**，外部字样零命中），
  并不真的 import 该包。

⇒ 属**悬空声明**：今天无害，但它让「客户端依赖面」读起来是错的。
横向对照：`dsh-prompt-enhancer`、`dsh-plugin-wallpaper-engine`、`@dsh-external/dsh-super-injector`
**同样声明它** ⇒ 属生态级历史遗留，非 shoucang 独有缺陷。

## 4. 发现②：缺 `dsh.engines`，插件失声（非阻断）

本仓 `dsh.engines` **undefined**；而 `dsh-free-search`、`@linxin666/dsh-session-archive`
都声明了（如 `">=0.1.1-rc.1"`）。

实测宿主判定逻辑（`dsh-app-boot` 的 `evaluatePluginCompatibility`）**只读 `peerDependencies`**，
不看 `dsh.engines` ⇒ 缺它**不拦装载**。
但代价是：**插件对宿主版本没有任何声明面**，将来真出现不兼容时不会有人替它报警。
与本仓自订原则「最在意让失败不可观测的缺陷」相冲。

## 5. 兼容闸门实测（0.1.7 新增机制）

0.1.7 引入 `evaluatePluginCompatibility` + profile 级 `compatibility.json` 豁免
（`dsh plugin allow-version <pkg@ver> --dsh-version <exact> --accept-risk`）。

判定规则（读源确认）：**只检查以 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-` 开头的 peer**，
用 `semver.satisfies(runtime, range, { includePrerelease: true })`。

我方落在该前缀上的 peer 只有两条：

```
"@deepseek-ai/dsh-llm":   ">=0.0.1-rc <2"
"@deepseek-ai/dsh-tools": ">=0.0.1-rc <2"
```

**用宿主自己的函数**（非复述规则）对真实 `package.json` 判定：

| 运行时 | 结果 |
|---|---|
| `0.1.7-rc.1` | **PASS**（compatible，返回 `undefined`） |
| `0.1.5-rc.2` | **PASS** |

⇒ 不需要 `compatibility.json`；WSL 侧实测该文件也确实**不存在**。

> 注：`cordis` / `schemastery` 两条 peer 不在 `@deepseek-ai/dsh*` 前缀内 ⇒ 被闸门忽略。
> 裸 `cordis` 在 0.1.7 运行时**不可解析**（`ERR_MODULE_NOT_FOUND`），
> 但我方唯一用处是 `import type`（编译期擦除）⇒ 无运行时影响。

## 6. 真运行态证据（WSL 0.1.7-rc.1）

```
shoucang 安装版本 = 0.3.1   lib 文件 215   client.js 830181 bytes
profile bundles  = [... "dsh-shoucang-memory" ...]   已列入装配
compatibility.json = 不存在（无豁免需求）
shoucang-scheduler.log:
  [2026-09-23T20:34:11Z] distill 启动（守藏蒸馏器 · idleWake 10min · adopt roots=0 · 数据区 .../suite/knowledge）
  [2026-09-23T20:35:00Z] deep sleep 巡检启动（enable=true · 停滞阈值 45min · 探测 开）
```

`lib/index.js` 在 0.1.7 环境实际 `import()`：**IMPORT OK**，导出 `Config, apply, inject, name`。

## 7. 未验证项（明确标注）

- 未在 0.1.7 下跑完整 `check-runner`（233 项）与面板端到端 UI 回归。
- 未升级本机 Windows 侧（仍 0.1.5-rc.2 / `latest` 0.1.5-rc.3）。
- 插件内部 `export const name = '@dsh-external/shoucang'` 与包名
  `dsh-shoucang-memory` 不一致 —— 未发现宿主据此做装载判定（改用 Loader 包的 package.json），
  但**未穷尽验证**，暂按低风险记录。

## 8. 建议（不阻断升级）—— 已执行，见 §9

1. **清理 `dsh.client.inject`**：删掉已除名的 `@deepseek-ai/dsh-client-runtime`，
   或改为客户端真正需要的包；当前声明与事实不符。
2. **补 `dsh.engines`**：给出可声明区间，让版本不兼容时有据可查（对齐 free-search 写法）。
3. 升级到 0.1.7-rc.1 前，按本仓「五层检查清单」走一遍
   （typecheck / build / check-runner / 部署同步 / 热重载 / 功能探针 / pin）。

## 9. 优化轮：修复 + 收口为机检（2026-09-23）

> 本节记录的判据全部**实测**，非推断。凡「目标是谁」均给出**证据**而非命名相似。

### 9.1 建议① 已修：`dsh.client.inject` 换到**可证的**目标

```diff
- "inject": ["@deepseek-ai/dsh-client-runtime"]
+ "inject": ["@deepseek-ai/dsh-client-ui-renderer"]
```

**为什么是 renderer（三步实证，不是猜名字）**：

1. 我方 `lib/client.js` **实际依赖的是服务名 `slots`**，不是那个包：
   `ctx.inject(["locale"], …)` + `var inject = ["slots"]` + 多处 `ctx.slots.inject(...)`。
2. `slots` 服务由 **renderer** 提供：`dsh-client-ui-renderer/lib/client.js` 里 `super(ctx, "slots")`
   （0.1.7 与 0.1.5-rc.2 **两代皆同**，已分别实测）。
3. renderer 才是**真 client module**：`dsh.client` 与 `exports["./client"]` **齐备**；
   而 `@deepseek-ai/dsh-client-ui-slots` **两者皆无**（实测）⇒ 它**不可能是** `inject` 的合法目标
   （这也排除了「名字更像所以选它」的错误答案——`dsh-edit-diff` 声明它实为落空边）。

**为何不会制造新悬空**：目标在 **0.1.5-rc.2 与 0.1.7-rc.1 两代**上实测均为 client-module。

### 9.2 建议② 已修：补 `dsh.engines`

```diff
+ "engines": { "dsh": ">=0.1.5-rc.1" }
```

- **它不是死字段**：dshmarket `lib/discovery-compatibility.js:44` 真读 `manifest.dsh.engines`。
- **下界有锚点**：`dsh-client-ui-renderer@0.1.5-rc.1` 实测已是 client-module ⇒ 该版即可用。

### 9.3 收口为常驻机检：`scripts/check-host-compat.mjs`

一次性报告的**结论对，但没人会重跑** ⇒ 把可机检的三条变成每次 `npm test` 都跑的门
（登记 CHECKS，`233 → 234`）：

| 断言 | 内容 | 它防的失败模式 |
|---|---|---|
| A1 | `dsh.client.inject` 每项在**当前宿主真实存在** | 悬空声明被宿主**静默跳过** ⇒ 永不报错 |
| A2 | `dsh.engines.dsh` 形态 + 与已装宿主比对 | 市场侧判据失效 |
| A3 | `@deepseek-ai/dsh*` peer range 容纳已装宿主 | 0.1.7 兼容闸门的前置自检（升级前可见） |
| A4 | **反例自证** | 防门本身恒真 |

⚠ **A4 不是装饰**：本轮它**抓出了我自己写的两个真 bug**——
① 宿主包实际嵌套在 `dsh/node_modules/` 下（只扫顶层会探不到）；
② scope 路径被拼成双前缀 `@deepseek-ai/@deepseek-ai/…`。
**若无 A4，A1 会在「全悬空」时依然报绿**，本门就成假门。

**反向验证（已做）**：把 `inject` 改回 `dsh-client-runtime` ⇒ 门 **exit 1**；恢复 ⇒ **exit 0**。

### 9.4 诚实边界（未被本门覆盖）

- 本门**只查静态契约**（`package.json` ⟷ 已装宿主真 manifest），**不跑宿主**、**不联网**。
  联网会让门在断网时变噪声源。
- §7 的未验证项**依然未验证**（0.1.7 下全量 runner、面板端到端 UI 回归、Windows 侧升级）。
- 未在 **WSL 0.1.7** 上复跑全量门禁（本机为 0.1.5-rc.2）。
