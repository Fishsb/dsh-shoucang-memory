# 守藏 shoucang 架构根治 · 终极方案（2026-09-12 18:00）

> 目标：**一次解决，不再迭代打补丁**。本文给出根因、终局形态、两条不变量（已做成门禁）、
> 一次性执行方案与可判定的验收标准。执行完即达终局，不需要第三轮。

---

## 一、根因（一层层剥到不能再剥）

**表象**：四个模块里各有一个 400–1817 行的巨型函数。

**第一层**：`panel:applyPanel` 1817 / `distill:registerDistill` 1435 / `deepsleep:createDeepSleep`(原) 1434 / `scheduler:applyScheduler`(原) 430。

**第二层**：四个都是同一个模板 —— **`applyXxx(ctx)` 工厂闭包**。
入口函数 = 实现容器，模块的全部实现寄生在入口函数的闭包里，闭包内 60+ 个定义互相可见。

**第三层（真正的根因）**：**依赖按「模块闭包」打包，而不是按「领域」传递。**
于是任何一块实现都能看到全部依赖 ⇒ 无法单独测试、无法单独替换、按领域切的时候
只能把整个扁平命名空间重新打包成一个对象整体传下去。

**⚠ 我上一轮犯的错（写在这里防止重犯）**：顺序搞反了。
我做的是「**先把函数提到模块级，再把依赖整体传下去**」⇒ 必然产出 `DsScope`（32 字段团块）。
正确顺序是「**先按领域切模块，每个模块自己持有自己需要的三五个依赖**」⇒ 根本不需要团块。
**结论：搬家式提取不能解决根因，只会把隐式闭包换成显式团块。**

---

## 二、终局形态（一句话 + 一张图）

> **装配层与实现层分离；依赖按领域窄传，禁止按模块打包。**

```
┌─ 装配层（薄，≤120 行）────────────────────────────┐
│  applyXxx(ctx, config)                            │
│   ① 构造领域模块（各自只拿自己要的 3–7 个依赖）      │
│   ② 注册到宿主                                     │
│   ③ 返回对外句柄                                   │
└───────────────────────────────────────────────────┘
        │ 每个领域模块导出窄接口（≤12），自有状态
        ▼
┌─ 实现层（按领域切开的独立模块）────────────────────┐
│  panel-config / panel-memory / panel-observe /     │
│  panel-inject / panel-shared                       │
│  distill-agent / distill-watermark / distill-tools │
│  deepsleep-traces / deepsleep-tree /               │
│  deepsleep-run / deepsleep-probe                   │
└───────────────────────────────────────────────────┘
```

**判据（不满足就是没做到）**：
- 装配函数里**看不到任何业务分支**，只有构造与注册；
- 任一实现函数的依赖**能在一行里读完**（3–7 个），而不是从一个 30+ 字段的对象里解构；
- 任一领域模块可以**单独 import 并单测**，不需要先构造整个插件。

---

## 三、两条不变量（已做成门禁 `audit-wiring.mjs`）

| | 不变量 | 阈值 | **当前实测** | 基线（棘轮） |
|---|---|---:|---:|---:|
| **I1** | 装配函数（`apply*/register*/create*` 且**导出**）行数 | ≤ 120 | 违规 **5** 个 | 5 |
| **I2** | 作用域对象（`XxxScope`）字段数 | ≤ 12 | 违规 **1** 个（DsScope 32） | 1 |

I1 当前 5 个违规：`applyPanel` 1817 / `registerDistill` 1435 / `createDeepSleep` 239 /
`registerMcl` 200 / `applyForgetOps` 125。
（`scheduler:applyScheduler` **24 行 ✓** —— 上一轮已达标，是这套标准的样板。）

**为什么是棘轮**：基线取当前实测，只许收紧不许放松。新增一个违规立刻红；
拆掉一个 ⇒ 工具会打印"请收紧基线"，逼着把标准拧紧。避免"永久红灯人人无视"。

---

## 四、一次性执行方案（按此顺序一次做完，中途不停）

### 阶段 A · panel（最大、接缝最清晰、扇入 0 不连累别人）

`panel.ts` 1904 行 → 装配 ~60 行 + 5 个领域模块。区间为 AST 实测：

| 新模块 | 取自 | 行数 | 内容 |
|---|---|---:|---|
| `panel-shared.ts` | 87–456 | 370 | 状态读写 / `route()` / 引导 boot / `buildHotMemoryText` / `parseView`（**拆成模块级函数，不再是一个闭包**） |
| `panel-config.ts` | 500–781 | 282 | `/roots` `/get_root` `/root/bootstrap` `/set_root` `/config` `/save` `/toggle` `/set` |
| `panel-memory.ts` | 793–1161 | 369 | 记忆 helper + `/memory/overview` `/memory/sections` |
| `panel-observe.ts` | 1169–1533 | 365 | `/suite` `/mcl/status` `/reconcile` `/selfcheck`×2 `/config/recent` `/criteria` `/cognition/report` `/llm/models` + 睡眠配置 |
| `panel-inject.ts` | 1536–1901 | 366 | `/inject/*` + commands + **1588 起的 `ctx.effect` 回调**（`/vector/*` `/embed/*` `/memory/edit` 族 + systemPrompt 注入 + disposer） |

**作用域传递（保类型，别图省事）**：
`type PanelScope = NonNullable<ReturnType<typeof makePanelScope>>` —— 自动推断，
路由函数签名 `(P: PanelScope)`。若写 `Record<string, any>`，搬过去的 1400 行会全变 `any`，
等于一次性交出 1400 行的类型保护。

**⚠ 已知结构陷阱**：1628 之后的路由不在 `applyPanel` 顶层，而包在 1588–1902 的
`ctx.effect(() => {...})` 回调里。必须**整块搬**，只切 `route()` 调用行会把 effect 的 `return disposer` 切飞。

### 阶段 B · deepsleep（拆掉 DsScope 团块 —— 本轮自己的债）

把 32 字段的 `DsScope` 按领域拆成 4 个窄接口（各 3–7 字段）：

| 新模块 | 内容 | 需要的依赖（估算） |
|---|---|---|
| `deepsleep-traces.ts` | `gatherDeepSleepTraces` | 3（candidateDir / pendDir / auditFile） |
| `deepsleep-tree.ts` | `consolidateTree`（411 行，需再拆） | 3（log / audit / embedCfgOf） |
| `deepsleep-probe.ts` | `probeSession` | 5 |
| `deepsleep-run.ts` | `runDeepSleep`（406 行，解构 23 个 ⇒ **必须再拆**） | 拆后每块 ≤8 |
| `deepsleep.ts` | 装配 + 会话状态机所有权 | — |

`runDeepSleep` 解构 23 个是 I2 的直接违规来源，**不把它拆开就永远过不了 I2**。

### 阶段 C · distill（变更频次全仓第一，82 次）

`registerDistill` 1435 行 → 装配 + 领域模块：
`distill-agent.ts`（`distillAgent` 1069–1330）/ `distill-watermark.ts`（水位）/ `distill-tools.ts`（4 个工具注册）/ `distill-session.ts`（父子会话）。
顺带退役 `export *` 兼容层（实测仅 1 个机检件用到 4 个符号）⇒ `distill` 转发 24 → 8。

### 阶段 D · 收尾

- `mcl.ts:registerMcl` 200 → 拆分
- `treeops.ts:applyForgetOps` 125 → 小拆
- 收紧三条基线：`audit-fnspan` 债务 4 → 0/1；`audit-wiring` I1 5 → 0、I2 1 → 0

---

## 五、验收标准（可判定，不靠感觉）

| 指标 | 现在 | 终局 |
|---|---:|---:|
| 静态 / 动态循环依赖 | 0 / 0 | **0 / 0**（必须不退化） |
| 单函数跨度债务（>400 行） | 4 | **≤ 1** |
| 装配函数违规（>120 行） | 5 | **0** |
| 作用域团块（>12 字段） | 1 | **0** |
| 任一实现函数的依赖宽度 | 最大 23 | **≤ 8** |
| `distill` 转发（re-export） | 24 | **≤ 8** |
| `npm test` | 28 pass · 1 xfail | **不退化**（xfail 仍是既有的 treeops-rm） |

**一句话验收**：`npm test` 全绿 + `audit-wiring` I1=I2=0 + `audit-fnspan` 债务 ≤1。

---

## 六、明确不做的事

1. **不为降低层数而重构**（深度 8 是清晰分层，不是乱链）。
2. **不切碎 `targets.ts`**（33 导出偏宽，但纯函数无状态）—— **先补直接单测**。
   它是当前**第一风险**：扇入 7 却零直接单测，坏了 7 个模块一起错。补测试优先级高于切分。
3. **不上微服务 / 不加抽象层**——单体插件内按领域切模块即可。
4. **不再"先搬函数再传大对象"**——这是本轮的根因复发点。

---

## 七、风险与回滚

- 每个阶段结束即 `git commit`，是可回滚的检查点（**不中途停在未提交状态**）。
- 每阶段都必须跑：`npm run typecheck` → `npm run build` → `npm test`（含 3 个契约测试：
  深睡 18 条 / scheduler 20 条 / 面板 13 条）。
- 面板有 13 条路由契约兜底（34 条路由在册、只读端点响应 200），路由改名/丢失立刻红。
- 部署沿用"只覆盖差异文件"（`pnpm install` 会触发宿主批量删除保护）。

---

## 八、一句话总结

**根因是"依赖按模块闭包打包"，不是"文件太大"。**
终局是装配层与实现层分离、依赖按领域窄传，并用 `audit-wiring` 的 I1/I2 两条不变量钉死；
按 A(panel) → B(deepsleep 拆团块) → C(distill) → D(收尾) **一次执行完**，验收即达标，不需要第三轮。
