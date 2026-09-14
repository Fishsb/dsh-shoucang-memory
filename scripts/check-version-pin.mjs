#!/usr/bin/env node
/**
 * check-version-pin.mjs — 部署版本**三处记录一致性**只读巡检（G0「deploy 版本一致性」· 2026-09-13）
 *
 * 背景（仓内 AGENTS.md 实测记录，不是推测）：profile 里同一个依赖有**三份互不相同的版本记录**——
 *   `package.json`（声明的 specifier）· `pnpm-lock.yaml`（锁定的解析结果）· `node_modules/.modules.yaml`
 *   （实际装上去的那份）。三份各说各话时，**"仓内绿"与"装上去的是哪一代"完全脱钩**：
 *   曾出现修复早已提交、安装副本仍是旧代码，而三道门全绿的情况。
 *
 * ⚠ 为什么是**报告态**（不一致时仍 exit 0）：
 *   部署含 push / 用户热重载等**环境侧步骤**，把环境问题做成红灯＝**假红灯**（与假绿灯是镜像错误）。
 *   仓内先例：`check-installed-sync.mjs` 同为报告工具。要把它当 CI 硬门时加 `--strict` 即可。
 *
 * 用法：
 *   node scripts/check-version-pin.mjs [--profile web] [--pkg dsh-shoucang-memory] [--json out.json] [--strict]
 * 退出码：0 = 一致，或（不一致但非 --strict）报告态 · 1 = --strict 下不一致 · 3 = 跳过（profile/依赖不存在）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const STRICT = argv.includes('--strict')
const SELFTEST = argv.includes('--selftest')
const JSON_OUT = argOf('--json', '')
const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE = argOf('--profile', 'web')
const PKG = argOf('--pkg', 'dsh-shoucang-memory')
const root = join(dshHome, 'profiles', PROFILE)

if (!existsSync(root)) {
  console.log(`⏭ profile 不存在（${root}）—— 版本巡检跳过`)
  process.exit(3)
}

/** 从文本里抽取所有 `<pkg>...tar.gz/<sha40>` 或 `#<sha40>`（同一份文件可能记多处） */
function shasIn(text, pkg) {
  const out = new Set()
  for (const m of text.matchAll(new RegExp(`${pkg}[^\\s"']*?(?:tar\\.gz/|#)([0-9a-f]{7,40})`, 'g'))) out.add(m[1])
  return [...out]
}

// ── 反向证伪（`--selftest`）：证明抽取器**真的会抽出东西**，否则它坏了也只会显示"跳过" ──
if (SELFTEST) {
  const cases = [
    ['dsh-shoucang-memory": "github:Fishsb/dsh-shoucang-memory#f81eb2e5b6f8517e4af6f0d0284f3375302fed74",', 'dsh-shoucang-memory', ['f81eb2e5b6f8517e4af6f0d0284f3375302fed74']],
    ['version: https://codeload.github.com/Fishsb/dsh-shoucang-memory/tar.gz/9f6c920ed7b14ff5fd8871127e72ee3273934561(schemastery@3.18.0)', 'dsh-shoucang-memory', ['9f6c920ed7b14ff5fd8871127e72ee3273934561']],
    ['"dsh-shoucang-memory@https://codeload.github.com/Fishsb/dsh-shoucang-memory/tar.gz/1c5b09fee7bf130ab96e4b548e3fcfd8ca93f26c(s@1)": [', 'dsh-shoucang-memory', ['1c5b09fee7bf130ab96e4b548e3fcfd8ca93f26c']],
    ['"other-pkg": "github:x/y#abcdef1",', 'dsh-shoucang-memory', []],
  ]
  let bad = 0
  for (const [text, pkg, want] of cases) {
    const got = shasIn(text, pkg)
    const okCase = JSON.stringify(got) === JSON.stringify(want)
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} 抽 ${want.length} 个 → 得 ${JSON.stringify(got)}`)
  }
  console.log(bad ? `\nFAIL（${bad} 例）` : '\nPASS（抽取器自证可用）')
  process.exit(bad ? 1 : 0)
}

const sources = []
const pkgJsonPath = join(root, 'package.json')
const lockPath = join(root, 'pnpm-lock.yaml')
const modulesPath = join(root, 'node_modules', '.modules.yaml')

let declared = ''
if (existsSync(pkgJsonPath)) {
  try {
    const j = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
    const spec = { ...(j.dependencies || {}), ...(j.devDependencies || {}) }[PKG]
    if (typeof spec === 'string') declared = (spec.split('#')[1] || '').trim()
    sources.push({ file: 'package.json', role: '声明', present: true, shas: declared ? [declared] : [] })
  } catch (e) { sources.push({ file: 'package.json', role: '声明', present: true, shas: [], error: String(e.message).slice(0, 80) }) }
} else sources.push({ file: 'package.json', role: '声明', present: false, shas: [] })

for (const [file, role] of [['pnpm-lock.yaml', '锁定'], [join('node_modules', '.modules.yaml'), '实装']]) {
  const abs = join(root, file)
  if (!existsSync(abs)) { sources.push({ file, role, present: false, shas: [] }); continue }
  const text = readFileSync(abs, 'utf8')
  const shas = shasIn(text, PKG)
  // **静默失效防御**：文件里有该依赖名却抽不出 SHA ⇒ 是解析器坏了，不是"没有记录"。
  // 若不区分，解析器一旦失效就会走"跳过"分支（exit 3）而永远不被发现——正是仓内一直在剿的假绿。
  const parseMiss = shas.length === 0 && text.includes(PKG)
  sources.push({ file, role, present: true, shas, parseMiss })
}

const broken = sources.filter((s) => s.parseMiss)
if (broken.length) {
  console.log(`❌ 解析器失效：${broken.map((s) => s.file).join(', ')} 含依赖名但未抽出 SHA —— 这是代码问题（非环境问题），不判跳过`)
  process.exit(1)
}

if (!sources.some((s) => s.present && s.shas.length)) {
  console.log(`⏭ 三处均无 ${PKG} 的版本记录（profile=${PROFILE}）—— 巡检跳过`)
  process.exit(3)
}

const all = new Set(sources.flatMap((s) => s.shas))
const consistent = all.size === 1
console.log(`版本记录巡检 · profile=${PROFILE} · 依赖=${PKG}`)
for (const s of sources) {
  const v = !s.present ? '（文件缺席）' : s.shas.length ? s.shas.map((x) => x.slice(0, 8)).join(' / ') : '（无记录）'
  console.log(`  ${s.role.padEnd(2)} ${s.file.padEnd(26)} ${v}${s.error ? ` · ${s.error}` : ''}`)
}
if (consistent) console.log(`\nPASS（三处一致 @ ${[...all][0].slice(0, 8)}）`)
else {
  console.log(`\n⚠ 三处不一致（${[...all].map((x) => x.slice(0, 8)).join(' / ')}）`)
  console.log('  · 这意味着「仓内绿」与「装上去的是哪一代」脱钩——曾有修复已提交、安装副本仍旧代而三道门全绿的前例。')
  console.log('  · 根治：在 profile 跑一次 `pnpm install` 重生成 lock 与 .modules.yaml（会触发宿主批量删除保护，宜择时手动做）。')
  console.log(`  · 本件为报告态（不改仓库、不判代码红）；要当 CI 硬门用 --strict。`)
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ profile: PROFILE, pkg: PKG, root, consistent, shas: [...all], sources }, null, 1), 'utf8')
  console.log(`报告已落：${JSON_OUT}`)
}
if (!consistent && STRICT) process.exit(1)
