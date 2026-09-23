# 部署覆盖面修复 + WSL 部署检查（2026-09-23 · 第二轮）

- 目标环境：WSL Ubuntu-26.04 · DSH **0.1.7-rc.1**
- 本轮动作：**修复部署缺口** → **部署到 WSL** → **复验**
- 证据方式：全部实测（逐字节 sha1 / 真跑门禁 / 真机 mtime 归因）

---

## 0. 结论

| 项 | 结果 |
|---|---|
| 部署缺口修复 | ✅ `deploy-installed.mjs` 面 1 纳入 `package.json` |
| 配套机检 | ✅ `check-installed-sync` 扩面（该缺口原先**完全不可见**） |
| WSL 部署 | ✅ `package.json` 逐字节一致（sha1 `3be3e38e…`） |
| WSL 一致性复核 | ✅ 322 件中 **321 一致**；余 1 件 `client.js` **属他人在途，非本轮引入**（见 §4） |
| WSL 门禁 | ✅ `check-host-compat` **PASS** |
| 仓内改动面 | ✅ 全绿（arch-sync / changelog / hardcode / public-tree / host-compat / deploy-sync） |

---

## 1. 修复：`package.json` 未纳入安装面

**判因（WSL 实测）**：`deploy-installed.mjs` 面 1 的 `FACE1_EXTRA` **原先只有 `cordis.patch.yml`**
⇒ 仓内改了 `dsh.client.inject` / 补了 `dsh.engines`，**装上去的那份 package.json 永远不变**。

**为什么这是真缺口**（不是可选项）——宿主**运行期真读它**：

```
dsh-client-modules/lib/index.js
  locatePkgJson()  →  readFileSync(pkgPath)  →  parseDshClient(packageName, dsh.client)
```

即客户端半区的 `inject` / `platform` 由**安装副本的 package.json** 决定，**不由 lib 或 Cordis patch 决定**。

**实证差额**（WSL · 部署前）：

| | 仓内 | 已部署 |
|---|---|---|
| `dsh.client.inject` | `["@deepseek-ai/dsh-client-ui-renderer"]` | `["@deepseek-ai/dsh-client-runtime"]`（已除名） |
| `dsh.engines` | `{dsh:">=0.1.5-rc.1"}` | *undefined* |

差额 **100% 集中在这一个文件**，而当时三道门（srcmap / deploy-sync / installed-sync）**全绿**。

### 覆盖安全性（实测前置，非推断）

| 前提 | 实测 |
|---|---|
| 两侧键集合相同 | ✅ 各 **19 键**，双向独有均 **0** |
| 差异范围 | ✅ **仅 `dsh` 一键** |
| pnpm 注入字段 | ✅ `_id`/`_resolved`/`_integrity`/`_from` **全无** |
| 是否 symlink | ✅ 实体目录 |
| 是否有真实 dependencies | ✅ **为空**（依赖全在 `peerDependencies`）⇒ 覆盖**不动依赖解析** |

## 2. 配套机检：`check-installed-sync` 扩面

原先**只比 `lib/`** ⇒ 上述漂移**完全不可见**。现并入：

```js
const META_FILES = ['package.json', 'cordis.patch.yml']
```

- 与 `lib/` **同判据**（sha1 · 换行归一）、**同报告面**。
- 实现上**逐目标重建合成表**（模板 `repoAll` 绝不就地改）——初版就地改 `repo` 会让多 profile 串味，已修。
- **反向验证**：未部署时该门**精确报出 `../package.json` 内容不同**（此前 0 条），`--strict` 转红；
  部署后转绿；`--installed /nonexistent` 仍 **exit 3** 诚实跳过（CI 语义零回归）。

## 3. WSL 部署执行与复验

```
部署前  已部署 inject = ["@deepseek-ai/dsh-client-runtime"] · engines = undefined
部署后  已部署 inject = ["@deepseek-ai/dsh-client-ui-renderer"] · engines = {"dsh":">=0.1.5-rc.1"}
        sha1 3be3e38e32883776  ==  仓内 3be3e38e32883776   （逐字节一致）
check-installed-sync : 仓内 322 · 已安装 322 · 一致 321 · 内容不同 1（见 §4）
check-host-compat    : PASS（A1 renderer ✓ · A2 ✓ · A3 ✓ · A4 ✓）
```
（部署前已备份原文件 → `package.json.bak-before-meta-deploy`，可回退。）

### ⚠ 范围克制（R3）

WSL dry-run 同时列出去 `skill/engine/criteria-{gate.json,md}` 两件投影，
其源 `criteria.json` 是**他人未提交在途改动** ⇒ 按 R3「跨会话共享件须拍板」**未代为推进**，
本次只部署与修复直接相关的 `package.json`（与 Windows 侧同范围）。

## 4. 唯一剩余漂移：`client.js` —— 归因明确，**非本轮引入**

```
仓内   client.js  830179B  mtime 2026-09-24 05:40:05   ← 晚于我的部署
已部署 client.js  830181B  mtime 2026-09-23 18:53:54   ← 早于我的部署
我的部署时刻             2026-09-24 05:28:53
git status:  M client.js /  M lib/client.js          （未提交在途改动）
```

**判读**：仓内件 mtime **晚于**我的部署动作，且 `client.js` + `lib/client.js` 均为**在途未提交**
⇒ 属**他人正在进行的构建**，与本次修复无关。**未覆盖**（覆盖会替他人推进未完成施工）。

## 5. 顺带修正：我上一轮的一处误判

上一轮我把 `check-arch-sync` 的失败判为「既存、非我引起」——**那是错的**。本轮细查发现：

```
❌ ⑦ AGENTS.md 声称的 CHECKS 件数 = check-runner 实装条目数（声称 233 · 实测 234）
```

我在上一轮把 `CHECKS` 从 233 加到 234，却**没同步 AGENTS.md**。已修（AGENTS.md → 234 件，
并顺带把 `check-host-compat` 写入该清单）。复验 **PASS**。

> 教训：失败归因不能靠"看起来与我无关"——必须逐项读断言文本。上一轮我只看清单比对，
> 把一条由我引起的红灯归成了既存问题。

## 6. 诚实边界

- 未在 WSL 跑**全量** `check-runner`（该环境 pin 停在 `a5c9b40`，副本 scripts 面为旧代；
  据旧代跑出的"全绿"没有意义）。
- 本轮的「部署」是**磁盘面**归位；**「部署 ≠ 生效」这一层见 §8**（已实测到具体机制）。

## 7. 建议

1. ~~提交~~ ✅ **已完成**（`8770591`，已推 origin，远端 HEAD 一致）。
2. ✅ **两侧 pin 已归位**至 `8770591`（字节级替换，仅 1 行差异，无 BOM 引入）。
3. ⚠ **重新物化**与**宿主重启**仍待办——见 §8。

---

## 8. 部署链路收尾（2026-09-23 · 第二轮后续）

### 8.1 五层清单逐层状态

| 层 | 判据 | 状态 |
|---|---|---|
| ① 仓内绿 | 我改动面 6 门全绿 | ✅ |
| ② 部署同步 | 安装副本 `package.json` 已带本轮修复（inject=renderer / engines 已补） | ✅ |
| ③ 运行态生效 | 热重载已执行（fiber active，105 模块清缓存，client ✓） | ⚠ **仅对 lib 有效**，见 8.3 |
| ④ 功能探针 | `check-installed-features` exit 0 | ✅ |
| ⑤ 云端 + pin | 本地 HEAD = 远端 HEAD = `8770591`；两侧 pin 同值 | ✅ |

### 8.2 pin 归位（纯文本，已做）

两侧均用**字节级精确替换**（`a5c9b40…` → `8770591…`，替换前先断言旧串**出现次数 == 1**，
备份留 `.bak-pin-8770591`）。校验：仅 **1 行**差异、前 3 字节 `7b 0a 20`（**无 BOM**）、bundles 仍 16 项。

> ⚠ 中间踩过一次坑并已回退：`ConvertTo-Json | Set-Content` **重排了整个文件**（缩进 2→4 空格、
> 值前多空格）**且引入 BOM**。改用字节级替换后差异收敛为 1 行。**改 JSON 配置勿用序列化器往返。**
> 这正是记忆里 `[原则] 文本改动先定编码` 的实例。

### 8.3 ⚠ 关键边界：「热重载」**不足以**让 `package.json` 声明生效

实测证据（非推断）：

```
dsh-client-modules/lib/index.js
  resolveMeta:  const cached = this.pkgMeta.get(sourceKey);
                if (cached !== void 0) return cached;   ← 命中即直接返回，不再读盘
  pkgMeta 的失效路径（delete/clear）命中数 = 0        ← 无任何文件失效机制
  statSync 唯一用处 = client bundle 的陈旧基线（与 package.json 无关）
```

且 `super-injector` 的 `client-meta-healed` 只清**它自己**的键：
```js
cmSvc.pkgMeta.delete("@dsh-external/dsh-super-injector");
```

⇒ **热重载重建 fiber（作用于 `lib/`），但 `package.json` 的解析结果仍留在 `pkgMeta` 里。**
**要让 `dsh.client.inject` 的新声明真正生效，必须重启 DSH 进程。**

判别方法（无需读源码，可复现）：比较**宿主进程启动时刻**与**安装副本 `package.json` 的 mtime**——
前者晚于后者 ⇒ 该进程用的是旧解析。本轮实测：宿主启动 `09-23 18:42`，部署 `09-24 05:08` ⇒ **仍是旧值**。

### 8.4 仍待用户决定的两步（不擅自执行）

1. ~~**重新物化**（`pnpm install`）~~ ✅ **已完成（WSL 侧，见 §9）**。
2. **重启 DSH 进程**——让 `pkgMeta` 重读（否则 `inject` 声明仍是 `dsh-client-runtime`）。
   ⚠ 重启会**中断本会话所在的 GUI**，故不擅自执行。

> 注：重启**不影响**已完成的代码面/声明面修复——它只决定「运行中的宿主何时看到新声明」。

---

## 9. WSL 部署执行（2026-09-23 · 用户指令「只用部署WSL」）

### 9.1 执行（严格按记忆 L470「profile pin 归位四步」）

| 步 | 内容 | 实测 |
|---|---|---|
| ① | 备份三件 | `package.json` / `pnpm-lock.yaml` / `node_modules/.modules.yaml` → `.bak-pindeploy-20260924-060012/` |
| ② | pin 全 sha | 已为 `8427f43473595a2cdca9b9d7655ec1c40fb25522`（40 位） |
| ③ | profile 内 `pnpm install` | `--config.confirmModulesPurge=false`；**3.5s / +2 包 / 未见批量删除拦截** |
| ④ | 复验三处一致 | ✅ 见 9.2 |

### 9.2 三处一致性（归位前是「声明领先、锁定落后」）

| | 归位前 | 归位后 |
|---|---|---|
| `package.json` pin | `8427f43…` | `8427f43…` |
| `pnpm-lock.yaml` | `a5c9b40…`（落后） | **`8427f43…`** |
| `.modules.yaml` | `a5c9b40…`（落后） | **`8427f43…`** |

前置检查：`pnpm -v = 12.4.2`（记忆 L455 要求 ≥12）；`git ls-remote` 通（远端 HEAD = `8427f43`）。

### 9.3 本轮修复是否抵达（逐件核）

| 目标 | 已安装副本实况 |
|---|---|
| `dsh.client.inject` | `["@deepseek-ai/dsh-client-ui-renderer"]` ✅ |
| `dsh.engines` | `{"dsh":">=0.1.5-rc.1"}` ✅ |
| `scripts/check-host-compat.mjs` | 存在 ✅ |
| `check-runner` 登记 | 含该件、1507 行 ✅ |
| `deploy-installed` 面 1 | `['cordis.patch.yml','package.json']` ✅ |

四件与仓内在**换行归一化口径**下全部一致（仓内 CRLF / tarball LF——这正是
`check-installed-sync` 归一化判等的原因，**非内容漂移**）。

### 9.4 ⚠ 两处须记录的发现

**① 一次「假绿」我自己的验证方法造成的**：初版我在**安装副本目录内**跑
`check-installed-sync`，该脚本 `root = dirname(script)/..` ⇒ root 解析成**安装副本自身**
⇒ 报「319/319 全一致」= **自己跟自己比**。在**仓根**重跑才是真判定。
> 教训：验证工具的 **root 归属**必须先确认，否则「跑绿了」可能只是自比。

**② `import` 失败属既有的未提交半截态，非本轮引入**（已逐一归因排除）：

```
已安装 deepsleep-run.js 引用 zeroLandedChannels
        deepsleep-core.js 不导出该符号（计数 0）
        channel-plan.js 在 tarball 中不存在
```

**归因**：该半截状态在 `a5c9b40`（我介入**之前**的提交）就已存在，
`a5c9b40` / `8770591` / `8427f43` **三个提交全部相同** ⇒ **不是 pin 推进引入的**。
`channel-plan.js` / `deepsleep-core.js` 等在工作树是**未提交在途改动**（属其他会话），
tarball 由 **committed 状态**打包，故不含它们。

⇒ 本轮部署**未造成**该状态，也**未尝试修复**它（属跨会话在途施工，按 R3 不越界）。

### 9.5 边界

- 部署的是**磁盘面**；`pkgMeta` 缓存那条边界（§8.3）在 WSL 侧同样适用——
  需**重启该环境的 dsh** 才会重读新声明。本次**未重启**（未获指令，且会中断服务）。
- `check-installed-sync` 在 WSL 仓根跑报「289 一致 / 30 内容不同 / 3 仅仓内」，
  经核**全部指向未提交在途件**（`channel-plan.*`、`budget-override.*`、`client.js` 等），
  与本轮修复无关。
