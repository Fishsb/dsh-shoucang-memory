#!/usr/bin/env node
// bank-git.mjs — 记忆库本地版本化（ADR-122 v2 · P4「可 diff / 可 revert」）
//
// 语义：给**记忆库根**（MEMORY_ROOT 或 ~/.dsh/skills/managing-memory）加本地 git 仓库；有变更则 commit。
//   - 首次自动 `git init` + 写 .gitignore（`audit/*.tmp` / `*.ui-tmp`）；
//   - 每次调用只提交"有实际变化"的情况（无变化则 no-op，保持安静）；
//   - 全部失败静默（版本化是增强，不是主流程依赖）——但 `--verbose` 会打印原因；
//   - 库在 ~/.dsh 下，**不入公开树**（零硬编码红线不受影响：路径一律 env/家目录派生）。
// 用法: node scripts/bank-git.mjs [--message "<msg>"] [--root <库根>] [--verbose]
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const VERBOSE = argv.includes('--verbose')
const root = argOf('--root', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const message = argOf('--message', `memory: snapshot ${new Date().toISOString().slice(0, 19)}`)
const log = (m) => { if (VERBOSE) console.log(`bank-git: ${m}`) }

const git = (args, opts = {}) => execFileSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, ...args], { cwd: root, stdio: 'ignore', windowsHide: true, ...opts })
/** 只读 git（需回显时用；同样带 safe.directory，避免 Windows 属主判定拒绝） */
const gitOut = (args) => execFileSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, ...args], { cwd: root, encoding: 'utf8', windowsHide: true })

try {
  if (!existsSync(root)) { log(`库根不存在：${root}`); process.exit(0) }
  if (!existsSync(join(root, '.git'))) {
    git(['init', '-q'])
    try { writeFileSync(join(root, '.gitignore'), 'audit/*.tmp\n*.ui-tmp\n', 'utf8') } catch { /* 忽略 */ }
    log(`已初始化本地 git：${root}`)
  }
  // 预检：Windows 无法寻址的文件名（以 '.' 或空格结尾 / 含 ':'）会让 `git add` **致命失败**——就地改名自愈（可逆）
  try {
    const bad = []
    const scan = (dir) => {
      let ents = []
      try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of ents) {
        const p = join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== '.git') scan(p); continue }
        if (/[. ]$|:/.test(e.name)) bad.push(p)
      }
    }
    scan(root)
    for (const p of bad) {
      const fixed = p.replace(/[. ]+$/, '') + '.fixdot'
      try { renameSync(p, fixed); log(`改名（Windows 不可寻址）: ${p} → ${fixed}`) } catch (e) { log(`改名失败（跳过该文件）: ${p}`) }
    }
    if (bad.length) log(`预检自愈 ${bad.length} 个不可寻址文件名`)
  } catch { /* 预检失败不阻塞 */ }
  // 无变更 → no-op
  const dirty = gitOut(['status', '--porcelain']).trim()
  if (!dirty) { log('无变更，跳过'); process.exit(0) }
  mkdirSync(root, { recursive: true })
  git(['add', '-A'])
  git(['-c', 'user.name=shoucang', '-c', 'user.email=shoucang@local', 'commit', '-q', '-m', message])
  log(`已提交 ${dirty.split('\n').length} 项变更`)
  console.log(`bank-git: committed（${dirty.split('\n').length} 项）`)
} catch (e) {
  log(`跳过（${String(e?.message || e).slice(0, 120)}）`)
  process.exit(0)
}
