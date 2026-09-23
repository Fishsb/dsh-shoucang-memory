#!/usr/bin/env node
// check-installed-sync.mjs — 已安装副本（profile node_modules）↔ 仓内构建产物 漂移报告（审查 N2）
//
// 为什么需要第二把尺子：`scripts/check-deploy-sync.mjs` 比的是仓 `scripts/` 与 `skill/{scripts,engine,docs}/`
//   ↔ **记忆库**下的同名路径，它**不覆盖 profile 的 node_modules 安装副本**。于是存在一种状态：
//   记忆库副本同步（deploy-sync 全绿）、仓内 src↔lib 一致（srcmap 全绿），
//   而**宿主实际加载的那份 lib 是陈旧的**——三道门全绿，修复却根本没在运行。
//   实测（2026-09-12 G-16）：已部署 `lib/distill.js` 停在 2026-09-11 22:41，仓内为 09-12 01:22，
//   `commitPrinciples` / `COMMIT_FAILED_GATE` / `deepSleepReplayable` 在已部署副本中计数均为 0。
//
// 为什么是**报告工具**而不是 CI 红灯：部署是宿主侧四步（push → profile 重钉 → 安装 → 用户热重载），
//   其中 push 依赖外网、热重载是用户动作。把「网络不通」或「用户还没热重载」做成红灯，
//   等于把环境问题误报成代码问题——**假红灯**，与我们一整天在打的假绿灯是镜像错误。
//   故：探测到漂移 ⇒ 打醒目 WARN 行，但**仍 exit 0**。等部署链路可自动化后再一句改成门禁。
//   2026-09-14（P7 · D11）补：**`--strict`** 让**部署者自己**（本机有已安装副本）能把「运行态绿」
//   判成红/绿；缺省不开 ⇒ CI 语义逐字不变。**为什么必须补**：报告态下真漂移对 `npm test` 完全不可见，
//   而仓内自己的教训正是「**仓内绿 ≠ 运行态绿**」——缺一个只在"有部署"时才亮红灯的开关。
//
// 用法: node scripts/check-installed-sync.mjs [--installed <path>] [--json] [--strict]
// 退出码: 0=已产出报告（漂移与否都算完成；`--strict` 且漂移则为 1）  3=未探测到已安装副本（诚实跳过，非失败）
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : null }
const AS_JSON = argv.includes('--json')
// 2026-09-14（P7 · D11）：`--strict` ⇒ 漂移即 exit 1。缺省**不开**（CI 语义零回归，保住下方「假红灯」论证）；
//   部署者在本机（有已安装副本）用它把「运行态绿」变成可判定的红/绿。
const STRICT = argv.includes('--strict')

const REPO_LIB = join(root, 'lib')

/**
 * 安装面**元文件**（与 `lib/` 同属「宿主实际加载/读取的那份」，但不在 lib/ 下）。
 *
 * 判因（2026-09-23 WSL 部署检查实测）：本件原先**只比 `lib/`** ⇒ `package.json` 的
 *   `dsh.client.inject` / `dsh.engines` 停在旧代**完全不可见**。
 *   而宿主**运行期真读它**：`dsh-client-modules/lib/index.js` 的
 *   `locatePkgJson()` → `readFileSync(pkgPath)` → `parseDshClient(packageName, dsh.client)`
 *   ⇒ 客户端半区的 `inject`/`platform` 由安装副本的 package.json 决定，不由 lib 决定。
 *   实证：仓内 `inject=[dsh-client-ui-renderer]` 而已部署仍 `[dsh-client-runtime]`，而本门报"全一致"。
 *   `cordis.patch.yml` 同理（`deploy-installed` 2026-09-21 才纳入面1，本门当时也未跟上）。
 * ⚠ 与 `lib/` 同一判据（sha1 逐字节，换行归一）：这些件在 `deploy-installed` 的面1 内，
 *   漂移即"部署未跟上"，属本门职责；缺件不判失败（只是未部署）。
 */
const META_FILES = ['package.json', 'cordis.patch.yml']

// 默认探测：~/.dsh/profiles/<profile>/node_modules/<包名>。路径一律由 homedir() 推导（零硬编码红线）
// 注：注释里写「profiles/ 通配」会形成注释闭合符，故此处用占位名描述
const PKG_NAME = 'dsh-shoucang-memory'
function probeInstalled() {
  const explicit = argOf('--installed')
  if (explicit) return existsSync(explicit) ? [explicit] : []
  const profiles = join(homedir(), '.dsh', 'profiles')
  if (!existsSync(profiles)) return []
  const out = []
  for (const p of readdirSync(profiles)) {
    const cand = join(profiles, p, 'node_modules', PKG_NAME)
    if (existsSync(cand)) out.push(cand)
  }
  return out
}

/** 递归收集 dir 下全部文件：rel(用 / 归一) → { size, sha1 } */
function walkFiles(dir) {
  const map = new Map()
  const rec = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) rec(p)
      else {
        // 归一化换行后求 sha1：仓内是 CRLF，npm 发布/安装时被规范化为 LF。
        // 若按原始字节比，仅换行符不同也会被判「内容不同 ⇒ 未部署」——实测 client.js
        // （仓 219263B CRLF / 已安装 216129B LF）就是这种假红，会在刚部署完误报"未部署"。
        const sha1 = createHash('sha1').update(readFileSync(p, 'utf8').replace(/\r/g, '')).digest('hex')
        map.set(relative(dir, p).split(sep).join('/'), { size: st.size, sha1 })
      }
    }
  }
  rec(dir)
  return map
}

const targets = probeInstalled()
if (!existsSync(REPO_LIB)) {
  console.log(`⏭ 跳过：仓内 lib/ 不存在（root=${root}）——诚实跳过（exit 3）`)
  process.exit(3)
}
if (targets.length === 0) {
  console.log(`⏭ 跳过：未探测到已安装副本（已查 ~/.dsh/profiles/*/node_modules/${PKG_NAME} 与 --installed）——诚实跳过（exit 3）`)
  process.exit(3)
}

/** 安装面元文件（package.json / cordis.patch.yml）：与 lib/ 合并进**同一张表**同判据比对。
 *  实现要点：**逐目标重建合成表**（`repoAll` 是模板，绝不就地改），否则上一个目标的元文件
 *  会污染下一个目标的比对（同一进程多 profile 时会串味）。 */
const sha1Of = (p) => createHash('sha1').update(readFileSync(p, 'utf8').replace(/\r/g, '')).digest('hex')
const entryOf = (p) => ({ size: statSync(p).size, sha1: sha1Of(p) })
const metaEntries = new Map()
for (const rel of META_FILES) {
  const a = join(root, rel)
  if (existsSync(a)) metaEntries.set(`../${rel}`, entryOf(a))
}
const repoAll = new Map([...walkFiles(REPO_LIB), ...metaEntries])
const reports = []
for (const tgt of targets) {
  const instLib = join(tgt, 'lib')
  if (!existsSync(instLib)) { reports.push({ target: tgt, error: '已安装副本无 lib/，无法比对' }); continue }
  const inst = walkFiles(instLib)
  for (const rel of META_FILES) {
    const dst = join(tgt, rel)
    if (existsSync(dst)) inst.set(`../${rel}`, entryOf(dst))
  }
  const differ = [], onlyRepo = [], onlyInst = []
  for (const [k] of inst) if (!repoAll.has(k)) onlyInst.push(k)
  for (const [k, v] of repoAll) {
    const b = inst.get(k)
    if (!b) onlyRepo.push(k)
    else if (b.sha1 !== v.sha1) differ.push({ file: k, repoBytes: v.size, instBytes: b.size })
  }
  reports.push({
    target: tgt,
    repoFiles: repoAll.size, instFiles: inst.size,
    same: [...repoAll.keys()].filter((k) => inst.has(k) && inst.get(k).sha1 === repoAll.get(k).sha1).length,
    differ: differ.sort((a, b) => a.file.localeCompare(b.file)),
    onlyRepo: onlyRepo.sort(), onlyInst: onlyInst.sort(),
  })
}

const drift = reports.filter((r) => !r.error && (r.differ.length || r.onlyRepo.length || r.onlyInst.length))
if (AS_JSON) { console.log(JSON.stringify({ root, reports }, null, 2)) }
else {
  console.log(`已安装副本漂移报告（仓 lib/ + 安装面元文件 ↔ 已安装副本 · 报告态，漂移不判失败）`)
  for (const r of reports) {
    console.log(`\n  📦 ${r.target}`)
    if (r.error) { console.log(`     ⚠ ${r.error}`); continue }
    console.log(`     仓内文件 ${r.repoFiles} · 已安装 ${r.instFiles} · 一致 ${r.same} · 内容不同 ${r.differ.length} · 仅仓内 ${r.onlyRepo.length} · 仅已安装 ${r.onlyInst.length}`)
    for (const d of r.differ.slice(0, 30)) console.log(`     ❌ 内容不同 ${d.file}（仓 ${d.repoBytes}B / 已安装 ${d.instBytes}B）`)
    if (r.differ.length > 30) console.log(`     … 另有 ${r.differ.length - 30} 件内容不同`)
    for (const f of r.onlyRepo.slice(0, 15)) console.log(`     ⚠ 仅仓内有（已安装缺失）${f}`)
    if (r.onlyRepo.length > 15) console.log(`     … 另有 ${r.onlyRepo.length - 15} 件仅仓内有`)
    for (const f of r.onlyInst.slice(0, 15)) console.log(`     ⚠ 仅已安装有（仓内已删/未提交）${f}`)
    if (r.onlyInst.length > 15) console.log(`     … 另有 ${r.onlyInst.length - 15} 件仅已安装有`)
  }
  if (drift.length) {
    // ⚠ 汇总口径必须**三项都算**：初版只算 differ + onlyRepo ⇒ 删除传播缺失时会出现
    //   「漂移 1 个（合计 **0** 件）」这种自相矛盾的读数（实测于删除死件 record-address 之后）。
    const n = drift.reduce((a, r) => a + r.differ.length + r.onlyRepo.length + r.onlyInst.length, 0)
    console.log(`\n⚠️⚠️  WARN：${drift.length} 个已安装副本存在漂移（合计 ${n} 件）。`)
    console.log(`    ⇒ 含义：仓内构建产物与**宿主实际加载的副本**不一致；修复可能已合入并编译，但**未部署**。`)
    console.log(`    ⇒ 缺省为报告态（exit 0）：部署链路含 push / 用户热重载等环境侧步骤，做成无条件红灯会把环境问题误报成代码问题。`)
    // 2026-09-14（P7 · D11）：加 **`--strict`** —— 报告态保留给 CI（无部署的环境），
    //   但**部署者自己**（本机有已安装副本）需要把「运行态绿」变成可判定的红/绿。
    //   不加旗标时行为**逐字不变**（CI 语义零回归）。（仓内教训：「仓内绿」≠「运行态绿」。）
    if (STRICT) {
      console.error(`\n❌ --strict：已安装副本漂移 ${drift.length} 个（合计 ${n} 件）——先重跑「只覆盖差异文件」部署，再复验}`)
      process.exit(1)
    }
  } else {
    console.log(`\n✅ 全部已安装副本与仓内 lib/ 逐文件 sha1 一致`)
  }
}
process.exit(0)
