#!/usr/bin/env node
// check-host-compat.mjs — 宿主契约兼容闸门（2026-09-23）
//
// **判因**：0.1.7-rc.1 兼容性检查原先是**一次性人工报告**（docs/compat-0.1.7-rc.1.md），
//   结论对，但**没人会重跑**。而本仓《测试登记纪律》写明「未登记 = 等于没写」——
//   一次性报告的价值在写下那一刻就开始衰减：宿主每出一个 rc，结论就旧一分，
//   而**没有任何机制会告诉人它旧了**（与 `check-installed-sync` 之前同一病灶）。
//   本件把那份报告里**可机检的三条**变成每次 `npm test` 都跑的门。
//
// 断言的**对象是静态契约**（package.json + 仓内真相），不是"跑一遍宿主"：
//   A1 `dsh.client.inject` 的每一项都必须是当前宿主**真实存在**的包
//      —— 判因：实测 `@deepseek-ai/dsh-client-runtime` 在 0.1.7 安装里**全盘零命中**
//         （npm 上停在 0.1.1-rc.2，roundtable 发布说明明写"不再发布"），
//         而宿主 `dsh-client-modules` 解析该字段时 `graphRows.get(pkg)` **找不到即静默跳过**
//         ⇒ 悬空声明**永远不报错**，只能靠机检抓。这正是本仓最忌的「失败不可观测」。
//   A2 `dsh.engines.dsh`（若存在）必须是可解析的 semver range
//      —— 判因：它是**有真实消费者**的字段（dshmarket `discovery-compatibility.js`
//         读 `manifest.dsh.engines`），写坏即市场侧判据失效。
//   A3 `peerDependencies` 里 `@deepseek-ai/dsh*` 的 range 必须能容纳**当前已装宿主**
//      —— 这是 0.1.7 新增插件兼容闸门 `evaluatePluginCompatibility` 的**同口径前置自检**，
//         让人在**升级前**就看见，而不是等宿主拒绝装载。
//
// ⚠ 三条都**不做**「连网查 npm」：网络不可用时门会变成噪声源。判据一律基于
//   ① 仓库自身 package.json ② 本机**已装宿主**的真 manifest。宿主不可达 ⇒ 诚实 skip(3)。
//
// 退出码：0 = pass · 1 = fail · 3 = skip（本机无宿主安装，诚实跳过，非失败）
import { readFileSync, existsSync, readdirSync, accessSync, constants, realpathSync } from 'node:fs'
import { join, dirname, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++ }

const pkgPath = join(root, 'package.json')
if (!existsSync(pkgPath)) { console.log('check-host-compat: package.json 缺失 ⇒ skip（exit 3）'); process.exit(3) }
/** 读 JSON 并剥离 UTF-8 BOM。
 * ⚠ 判因（2026-09-23 实测）：Windows 上 `Set-Content -Encoding UTF8` 写的文件**带 BOM**，
 *   `JSON.parse` 会抛 `Unexpected token '﻿'` —— 若此处不剥，本门在真实机器上会
 *   以**崩溃**代替**判定**（噪声，且看起来像门坏了）。 */
function readJson (p) {
  let t = readFileSync(p, 'utf8')
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1)
  return JSON.parse(t)
}
const pkg = readJson(pkgPath)

// ── 探测已装宿主的 @deepseek-ai 包目录（零硬编码本机路径） ──
/** 沿 PATH 解析 `dsh` 的真实包根，向上找 `node_modules/@deepseek-ai`。
 *
 * 判因（2026-09-23 WSL 实测）：**不能用 `process.execPath` 推导**——
 *   WSL 上 node 在 `/usr/bin/node`，而全局包在 `/usr/local/lib/node_modules`，
 *   两者不在同一祖先链上（实测 `/usr/lib/node_modules/@deepseek-ai` 不存在）。
 *   **唯一可靠来源是用户实际在跑的 dsh**：`which dsh` → realpath → 向上找
 *   `node_modules/@deepseek-ai`。两侧实测均精确命中：
 *   · WSL   `/usr/local/bin/dsh` → `/usr/local/lib/node_modules/@deepseek-ai/…`
 *   · Windows `…\prefix\dsh`     → `…\prefix\node_modules\@deepseek-ai`
 *   这条路径**天然覆盖任何安装布局**，比写死候选目录稳。 */
function scopesFromPath () {
  const out = []
  const exts = process.platform === 'win32' ? ['', '.cmd', '.exe', '.ps1'] : ['']
  const dirs = (process.env.PATH || '').split(delimiter)
  for (const dir of dirs) {
    if (!dir) continue
    for (const ext of exts) {
      const bin = join(dir, 'dsh' + ext)
      try { accessSync(bin, constants.X_OK) } catch { continue }
      let real
      try { real = realpathSync(bin) } catch { continue }
      // 从 bin 所在目录向上**收全所有** `node_modules/@deepseek-ai` 层级（最多 8 层）。
      // ⚠ 判因（2026-09-23 WSL 实测）：曾被写成「首个命中即 break」——而 WSL 上
      //   `dsh` 包在**顶层** scope、`dsh-client-ui-renderer` 在**嵌套面**，首个命中的是嵌套面
      //   ⇒ 顶层被丢弃 ⇒ `hostPkg('dsh')` 一路落到 Windows 兜底 scope，报出
      //   「A1 用 0.1.7 的 renderer、A2/A3 却用 0.1.5-rc.2 的 dsh」——
      //   **同一个门里混用了两个不同宿主**，版本自相矛盾。收全各层即消此病。
      let d = dirname(real)
      for (let i = 0; i < 8; i++) {
        const cand = join(d, 'node_modules', '@deepseek-ai')
        if (existsSync(cand)) out.push(cand)
        const parent = dirname(d)
        if (parent === d) break
        d = parent
      }
    }
  }
  return out
}

/** 返回候选宿主 node_modules/@deepseek-ai 目录列表（按存在性过滤，去重）。
 *
 * ⚠ 实测布局（2026-09-23）：宿主**自己的**包不在 scope 顶层，而是嵌套在
 *   `<scope>/dsh/node_modules/@deepseek-ai`（Windows 实测 239 个 / WSL 实测 277 个）。
 *   只扫顶层会让 `dsh-tools`、`dsh-client-ui-renderer` 一类探不到
 *   ⇒ A1 误判「悬空」= **假红**（WSL 实测复现）。
 *   ⚠ 本件被自己的 A4 反例自证抓出过两个 bug（嵌套面 / scope 双前缀），勿简化掉。
 */
function hostScopes () {
  const out = []
  const push = (p) => { if (p && existsSync(p) && !out.includes(p)) out.push(p) }
  /** 给定一个 @deepseek-ai 目录，连同其 dsh 自带的嵌套面一并纳入。
   * ⚠ 所有来源**一律**走这里 —— 曾因 `DSH_HOST_SCOPE` 走裸 `push` 而漏掉嵌套面（实测），
   *   结果「显式指对了路径却仍探不到 renderer」⇒ 假红。 */
  const pushWithNested = (scope) => {
    if (!scope) return
    push(scope)
    push(join(scope, 'dsh', 'node_modules', '@deepseek-ai'))
  }
  // ① 主来源：用户实际在跑的 dsh（PATH → realpath → 向上找）——覆盖任意安装布局
  for (const s of scopesFromPath()) pushWithNested(s)
  // ② 便携前缀（Windows 布局；dsh 不在 PATH 时的兜底）
  pushWithNested(join(homedir(), '.dsh-win', 'prefix', 'node_modules', '@deepseek-ai'))
  // ③ profile 侧：~/.dsh/profiles/<name>/node_modules/@deepseek-ai
  const prof = join(homedir(), '.dsh', 'profiles')
  if (existsSync(prof)) for (const p of readdirSync(prof)) pushWithNested(join(prof, p, 'node_modules', '@deepseek-ai'))
  // ④ 显式覆盖（一律带嵌套面，见上）
  pushWithNested(process.env.DSH_HOST_SCOPE)
  return out
}
const scopes = hostScopes()

/** 在候选宿主目录里查包 manifest；返回 { version, manifest } 或 undefined。
 * ⚠ scopes 里每一项**本身就是** `@deepseek-ai` 目录，故此处只取包名末段拼接；
 *   若误拼全名会得到 `<scope>/@deepseek-ai/<pkg>` 这种双前缀路径 ⇒ 恒探不到
 *   ⇒ A1 变假门（本件被 A4 反例自证抓出过一次）。 */
function hostPkg (name) {
  const base = name.startsWith('@deepseek-ai/') ? name.slice('@deepseek-ai/'.length) : name
  for (const sc of scopes) {
    const f = join(sc, base, 'package.json')
    if (existsSync(f)) {
      try { const m = readJson(f); return { version: m.version, manifest: m } } catch { /* 坏 manifest 视为不存在，交给 skip 语义 */ }
    }
  }
  return undefined
}

console.log(`宿主契约兼容闸门 · 探测到 ${scopes.length} 处宿主 @deepseek-ai 目录`)

// ── A1：dsh.client.inject 每一项都要在当前宿主里真实存在 ──
const inject = pkg.dsh?.client?.inject
if (!Array.isArray(inject)) {
  console.log('⏭ A1 跳过：package.json 未声明 dsh.client.inject')
} else if (scopes.length === 0) {
  console.log('⏭ A1 跳过：未探测到已装宿主（诚实跳过，不判失败）')
} else {
  for (const dep of inject) {
    // 只检查宿主域名下的包；其余（如第三方 client 包）不在本门职责内
    if (!dep.startsWith('@deepseek-ai/')) { console.log(`· A1 跳过非宿主项：${dep}`); continue }
    const hit = hostPkg(dep)
    ok(hit !== undefined, `A1 dsh.client.inject 项在当前宿主存在：${dep}${hit ? ` (v${hit.version})` : ' ← 悬空，宿主解析时静默跳过'}`)
  }
}

// ── A2：dsh.engines.dsh 若存在，必须是可解析的 semver range ──
const enginesDsh = pkg.dsh?.engines?.dsh
if (enginesDsh === undefined) {
  console.log('· A2 未声明 dsh.engines.dsh（可选字段）')
} else {
  // 不引 semver 依赖（本仓 devDeps 无它）：用与宿主同口径的保守语法自校验
  const rangeOk = typeof enginesDsh === 'string' && enginesDsh.trim() !== '' && !/[\s]$/.test(enginesDsh)
  ok(rangeOk, `A2 dsh.engines.dsh 是合法 range 形态：${JSON.stringify(enginesDsh)}`)
  // 与已装宿主做一次真实比对（能比对才比对；比不了不判失败）
  const hostDsh = hostPkg('dsh')
  if (hostDsh && rangeOk) {
    const m = /^>=\s*([0-9][^\s<]*)\s*(?:<([^\s]+))?$/.exec(enginesDsh)
    if (m) {
      const lo = m[1]; const hi = m[2]
      const cmp = (a, b) => {
        const pa = a.split(/[-.]/).map((x) => /^\d+$/.test(x) ? Number(x) : x)
        const pb = b.split(/[-.]/).map((x) => /^\d+$/.test(x) ? Number(x) : x)
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const x = pa[i]; const y = pb[i]
          if (x === undefined) return -1
          if (y === undefined) return 1
          if (typeof x === 'number' && typeof y === 'number') { if (x !== y) return x - y } else { const s = String(x).localeCompare(String(y)); if (s !== 0) return s }
        }
        return 0
      }
      const geLo = cmp(hostDsh.version, lo) >= 0
      const ltHi = hi === undefined || cmp(hostDsh.version, hi) < 0
      ok(geLo && ltHi, `A2 已装宿主 v${hostDsh.version} 落在 dsh.engines.dsh 声明内`)
    } else {
      console.log(`· A2 声明形态非 \`>=x <y\`，跳过与已装宿主(${hostDsh.version})的比对`)
    }
  }
}

// ── A3：@deepseek-ai/dsh* peer 的 range 必须容纳已装宿主（0.1.7 兼容闸门同口径前置自检） ──
const peers = pkg.peerDependencies ?? {}
const dshPeers = Object.entries(peers).filter(([n]) => n === '@deepseek-ai/dsh' || n.startsWith('@deepseek-ai/dsh-'))
const hostDsh = hostPkg('dsh')
if (dshPeers.length === 0) {
  console.log('· A3 无 @deepseek-ai/dsh* peer 声明')
} else if (!hostDsh) {
  console.log('⏭ A3 跳过：未探测到已装宿主 dsh（诚实跳过）')
} else {
  console.log(`A3 用已装宿主 v${hostDsh.version} 核对 ${dshPeers.length} 条 @deepseek-ai/dsh* peer`)
  for (const [name, range] of dshPeers) {
    // 宿主同款区间语义：`>=A <B` 与 `^A` / `~A` 的保守处理
    const hit = hostPkg(name)
    if (!hit) { console.log(`· A3 ${name} 当前宿主未装（动态提供），仅检查 range 形态`); continue }
    const r = String(range)
    let pass
    const ver = hit.version
    const geLoLt = /^>=\s*([^\s<]+)\s*<\s*([^\s]+)$/.exec(r)
    if (geLoLt) {
      const cmp = (a, b) => {
        const pa = a.split(/[-.]/).map((x) => /^\d+$/.test(x) ? Number(x) : x)
        const pb = b.split(/[-.]/).map((x) => /^\d+$/.test(x) ? Number(x) : x)
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const x = pa[i]; const y = pb[i]
          if (x === undefined) return -1
          if (y === undefined) return 1
          if (typeof x === 'number' && typeof y === 'number') { if (x !== y) return x - y } else { const s = String(x).localeCompare(String(y)); if (s !== 0) return s }
        }
        return 0
      }
      pass = cmp(ver, geLoLt[1]) >= 0 && cmp(ver, geLoLt[2]) < 0
    } else if (r.startsWith('^')) {
      const [maj] = r.slice(1).split('.')
      pass = ver.split('.')[0] === maj
    } else if (r.startsWith('~')) {
      const [maj, min] = r.slice(1).split('.')
      const p = ver.split('.')
      pass = p[0] === maj && p[1] === min
    } else {
      pass = ver === r
    }
    ok(pass, `A3 ${name}@${ver} 满足声明 range ${JSON.stringify(r)}`)
  }
}

// ── A4 反例自证：断言语义真的有效（不是恒真） ──
{
  // 用一份**故意悬空**的假 manifest 走 A1 的判定路径，必须判「不存在」
  const bogus = hostPkg('@deepseek-ai/definitely-not-a-real-package-xyz')
  ok(bogus === undefined, 'A4 反例自证：不存在的包被判为不存在（A1 非恒真）')
  // 反向：一个**已知存在**的宿主包必须能被找到（否则探测函数恒返回 undefined ⇒ A1 恒绿）
  const real = hostPkg('@deepseek-ai/dsh-tools') ?? hostPkg('@deepseek-ai/dsh-tools')
  ok(real !== undefined, `A4 反例自证：已知宿主包可被探测到${real ? ` (dsh-tools v${real.version})` : ' ← 探测函数失效，A1 会在全悬空时仍报绿'}`)
}

console.log(fail === 0 ? '\ncheck-host-compat: PASS' : `\ncheck-host-compat: FAIL（${fail} 项）`)
process.exit(fail === 0 ? 0 : 1)
