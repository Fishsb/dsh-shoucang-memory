# WSL 侧部署检查报告（2026-09-23）

- 目标环境：**WSL Ubuntu-26.04 · DSH 0.1.7-rc.1**（`/usr/local/lib/node_modules`）
- 被检对象：已部署的 `dsh-shoucang-memory@0.3.1`
- 检查方式：全部实测（真 import / 真跑门禁 / 逐件 sha1 / 真机日志），非读文档推断

---

## 0. 结论

| 面 | 状态 | 证据 |
|---|---|---|
| **代码面（lib/）** | ✅ **已同步** | 320 件逐件一致（sha1），`check-installed-sync` 报「一致 320 · 内容不同 0」 |
| **运行态** | ✅ **可装载** | 在 WSL 0.1.7 实际 `import()`：**IMPORT OK**，导出 `Config, apply, inject, name` |
| **package.json 契约面** | ❌ **未部署（旧代）** | 仍 `client-runtime` + 无 `engines` |
| **根 scripts/ 面（含新门禁）** | ❌ **未部署（旧代）** | `check-runner` 1274 行 vs 仓内 1507；无 `check-host-compat` |
| **pin** | ⚠️ 指向 `a5c9b40`（= 仓内 HEAD） | 但工作树改动**不在** pin 里 |

**总判**：代码面与运行态**健康**；契约面与门禁面**停在旧代**——因为**标准的 `deploy-installed` 根本不覆盖它们**（见 §3）。

---

## 1. 环境事实

```
宿主版本      dsh --version = 0.1.7-rc.1
安装位置      /usr/local/lib/node_modules/@deepseek-ai/dsh
node          v22.22.1 · pnpm 12.4.2
profile       ~/.dsh/profiles/web
pin           github:Fishsb/dsh-shoucang-memory#a5c9b404d1549a699092a6c071a2c361fb3d6797
仓内 HEAD     a5c9b404d1549a699092a6c071a2c361fb3d6797（与 pin 相同）
```

## 2. 部署一致性（实测）

- **lib 面**：仓内 320 件 ⟷ 已部署 320 件，**逐件一致 320 · 内容不同 0 · 仅仓内 0 · 仅已部署 0**。
- **scripts 面差 8 件**（仅仓内有，未部署）：
  `check-capacity-wiring` · **`check-host-compat`** · `check-yield-reflow` · `lib-scan-scope` ·
  `probe-capacity-gate` · `record-snapshot` · `verify-capacity-live` · `verify-cas-live`
  （+1 备份件 `ui-geo-regress.mjs.bak-*`）。仅已部署有的：**0 件**。
- **运行态**：`import()` 已部署 `lib/index.js` 成功；日志显示蒸馏 / 深睡巡检曾启动
  （最后 20:43:28Z；检查时刻 21:15Z ⇒ 当前 **dsh 进程未在运行**，属历史运行证据）。

## 3. 关键发现：标准部署路径**不覆盖** package.json 与根 scripts

`scripts/deploy-installed.mjs` 的覆盖面（读源确认）：

| 面 | 内容 | 目标 |
|---|---|---|
| 面 1 | `lib/**` + `cordis.patch.yml` + `skill/**` | **安装副本** |
| 面 2 | `scripts/` · `skill/scripts` · `skill/engine` · `skill/docs` | **记忆库**（`<bank>/scripts` 等） |

⇒ **安装副本的 `package.json` 与根 `scripts/` 都不在任何面内**。
故本仓 `package.json` 的两处修正、以及新增的 `check-host-compat.mjs`，**无法经标准部署到达 WSL**，
只能经 **git 提交 + 改 profile pin + 重新物化** 抵达。

这与 WSL 实测吻合：`inject` 仍是 `client-runtime`、`engines` 仍 `undefined`、
已部署 `check-runner` 无 `check-host-compat`。

## 4. 顺带查出：我新门禁在 WSL 上的**两处真缺陷**（已修）

> 这正是「升版兼容取证 · **消假红**」的落点——若只在 Windows 上跑过就宣布门禁可用，会带着两个 bug 发布。

| # | 缺陷 | 后果 | 修法 |
|---|---|---|---|
| 1 | 探测面只有 `~/.dsh-win/prefix` 与 `~/.dsh/profiles/*`，**不含 `/usr/local/lib/node_modules`** | WSL 上判 renderer「悬空」= **假红** | 改为**沿 PATH 解析 `dsh` 真实包根**（零硬编码，覆盖任意布局） |
| 2 | `DSH_HOST_SCOPE` 走裸 `push`，漏嵌套面 | 显式指对路径仍探不到 ⇒ 假红 | 一律走 `pushWithNested` |
| 3 | **混用宿主**：`scopesFromPath` 首个命中即 `break` | WSL 上 `dsh` 取 Windows 侧 0.1.5-rc.2、renderer 取 Linux 侧 0.1.7-rc.1 ⇒ **同一门内两个宿主，版本自相矛盾** | 收全各层，A1–A3 同源 |

**修复后 WSL 复验**：
- 跑仓内 manifest ⇒ **PASS**（A1 renderer v0.1.7-rc.1；A2/A3 宿主 v0.1.7-rc.1，不再混 0.1.5）
- 跑已部署旧 manifest ⇒ **FAIL**（A1 抓到 `dsh-client-runtime` 悬空）⇒ 证明门在 WSL 上**真能判**
- Windows 侧复跑 ⇒ **PASS**（无回归）

## 5. 诚实边界

- 本检查**未**在 WSL 上跑全量 `check-runner`（该副本本身没有新版 runner）。
- 已部署副本 `check-runner` 的 CHECKS 计数（205）与仓内同源，但**文件内容不同代**（1274 vs 1507 行），
  故未在 WSL 侧据其下"全绿"结论。
- §3 的结论基于读 `deploy-installed.mjs` 源头 + dry-run（报「待部署差异 2 件」全在 skill/engine）
  + 已部署副本实况，三者一致。

## 6. 建议（按依赖顺序）

1. **提交**本次改动（`package.json` / `check-runner.mjs` / `check-host-compat.mjs` / `CHANGELOG.md`）。
   未提交 ⇒ 重新物化会把装上去的那份**退回已提交版本**（本仓已有实测先例）。
2. **推进 WSL 的 pin** 到含本轮改动的提交，再重新物化 ⇒ 契约面与门禁面才会到达 WSL。
3. 到那之后，在 WSL 侧跑 `node scripts/check-runner.mjs --only check-host-compat` 复核
   （预期 PASS；若 FAIL，说明该环境真有声明面问题）。
4. `lib/` 面**无需**动作（已 320/320 一致）。
