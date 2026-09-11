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
//
// 用法: node scripts/check-installed-sync.mjs [--installed <path>] [--json]
// 退出码: 0=已产出报告（漂移与否都算完成）  3=未探测到已安装副本（诚实跳过，非失败）
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : null }
const AS_JSON = argv.includes('--json')

const REPO_LIB = join(root, 'lib')

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
        const sha1 = createHash('sha1').update(readFileSync(p)).digest('hex')
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

const repo = walkFiles(REPO_LIB)
const reports = []
for (const tgt of targets) {
  const instLib = join(tgt, 'lib')
  if (!existsSync(instLib)) { reports.push({ target: tgt, error: '已安装副本无 lib/，无法比对' }); continue }
  const inst = walkFiles(instLib)
  const differ = [], onlyRepo = [], onlyInst = []
  for (const [k, v] of inst) if (!repo.has(k)) onlyInst.push(k)
  for (const [k, v] of repo) {
    const b = inst.get(k)
    if (!b) onlyRepo.push(k)
    else if (b.sha1 !== v.sha1) differ.push({ file: k, repoBytes: v.size, instBytes: b.size })
  }
  reports.push({
    target: tgt,
    repoFiles: repo.size, instFiles: inst.size,
    same: repo.size - differ.length - onlyRepo.length,
    differ: differ.sort((a, b) => a.file.localeCompare(b.file)),
    onlyRepo: onlyRepo.sort(), onlyInst: onlyInst.sort(),
  })
}

const drift = reports.filter((r) => !r.error && (r.differ.length || r.onlyRepo.length || r.onlyInst.length))
if (AS_JSON) { console.log(JSON.stringify({ root, reports }, null, 2)) }
else {
  console.log(`已安装副本漂移报告（仓 lib/ ↔ 已安装 lib/ · 报告态，漂移不判失败）`)
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
    const n = drift.reduce((a, r) => a + r.differ.length + r.onlyRepo.length, 0)
    console.log(`\n⚠️⚠️  WARN：${drift.length} 个已安装副本存在漂移（合计 ${n} 件）。`)
    console.log(`    ⇒ 含义：仓内构建产物与**宿主实际加载的副本**不一致；修复可能已合入并编译，但**未部署**。`)
    console.log(`    ⇒ 本工具为报告态（exit 0）：部署链路含 push / 用户热重载等环境侧步骤，做成红灯会把环境问题误报成代码问题。`)
  } else {
    console.log(`\n✅ 全部已安装副本与仓内 lib/ 逐文件 sha1 一致`)
  }
}
process.exit(0)
