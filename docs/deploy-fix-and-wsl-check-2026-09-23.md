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
- **运行态未验证**：`package.json` 的读取结果被宿主缓存在 `pkgMeta`（per-process Map，
  键 = `${baseUrl}\0${loaderName}`，**无任何 mtime 失效路径**——`statSync` 仅用于 client bundle）
  ⇒ **磁盘部署不保证运行中进程感知**，需宿主重启/热重载才会重读。检查时刻 dsh 进程未运行。
- 本轮的「部署」是**磁盘面**归位；**「部署 ≠ 生效」这一层未闭合**。

## 7. 建议

1. **提交**本轮改动（`deploy-installed.mjs` / `check-installed-sync.mjs` / `AGENTS.md` / `CHANGELOG.md`）。
   未提交时宿主重新物化会把装上去的那份退回已提交版本（本仓有实测先例）。
2. 推进 WSL pin → 重新物化 ⇒ 修复后的 `deploy-installed` 才会随包抵达该环境。
3. 需要时**重启/热重载** dsh 让 `pkgMeta` 重读（否则运行中的宿主仍用旧声明）。
