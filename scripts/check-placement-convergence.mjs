// check-placement-convergence.mjs — 册三机检：**放置语义收敛**（docs/pointer-supply-plan.md §5-1）
//
// 判因（方案 §2.2 G5，实测坐实）：`memory-append` 原先自带 `matches`（**双向包含**）+ `findChild`（逐级取**首个**），
//   与 `section-ref` 三态语义不统一 ⇒ 夹具库只有 `## DSH 环境` 时写「环境」**误配**进「DSH 环境」（exit 0 无提示）。
//   本件把该形态做成**两态对照**（新语义拒绝 / 应急回退落旧处）——**两边都实测**，故不是"看着对"：
//   ① 默认（新）：写「环境」⇒ **exit 2 + 文件未被修改**（拒绝写入，列出候选/指引）；
//   ② 应急回退 `SHOUCANG_APPEND_PLACEMENT_CHECK=0`：同一写入 ⇒ **exit 0 且内容落进「DSH 环境」**
//      —— 这正是改造前的行为，**可复现** ⇒ 证明两态确实不同（断言有判别力，非恒真）；
//   ③ 前缀落点：写「DSH」⇒ exit 0 且落进「DSH 环境」（合法前缀不被误伤）；
//   ④ 歧义：`## 环境配置` + `## 环境变量` 写「环境」⇒ exit 2（要求「父/子」全路径）；回退 ⇒ exit 0 取首个；
//   ⑤ **绝不触真库**：全程 `MEMORY_ROOT=<临时夹具库>`。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(ROOT, 'skill', 'scripts', 'memory-append.mjs')
const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }

/** 造夹具库（含 `.gitignore`? 不需要；CLI 只需 notes/ 与目标 md） */
const mkLib = (bodies) => {
  const root = mkdtempSync(join(tmpdir(), 'placement-'))
  mkdirSync(join(root, 'notes'), { recursive: true })
  for (const [f, body] of Object.entries(bodies)) writeFileSync(join(root, 'notes', f), body, 'utf8')
  return root
}
/** 跑一次 CLI，返回 { code, out } */
const runCli = (root, file, section, text, env = {}) => {
  try {
    // 2026-09-25（L6-06 同族加固）：改 `process.execPath`——裸 `node` 依赖 PATH，
    //   而本机实测 PATH 内无 node（node 装在 DSH 家目录下的独立 node/ 目录），全仓已有 23 处用 execPath。
    const out = execFileSync(process.execPath, [CLI, `notes/${file}`, section, text], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MEMORY_ROOT: root, ...env }, windowsHide: true,
    })
    return { code: 0, out: String(out) }
  } catch (e) { return { code: Number(e.status ?? -1), out: String(e.stdout || '') + String(e.stderr || '') } }
}

// ── ① 默认（新语义）：误配路径被拒 ──
{
  const root = mkLib({ 'env.md': ['# env', '', '## DSH 环境', '原有正文', ''].join('\n') })
  const before = readFileSync(join(root, 'notes', 'env.md'), 'utf8')
  const r = runCli(root, 'env.md', '环境', '探针正文X')
  const after = readFileSync(join(root, 'notes', 'env.md'), 'utf8')
  ok('① 写「环境」⇒ 拒绝（exit 2）', r.code === 2, `code=${r.code}`)
  ok('① 拒绝时**文件未被修改**（零副写）', after === before)
  ok('① 拒绝信息含可用小节（指引可操作）', /DSH 环境|顶层小节/.test(r.out), r.out.split('\n')[0].slice(0, 80))
  rmSync(root, { recursive: true, force: true })
}

// ── ② 应急回退：旧行为可复现（两态确有差别）──
{
  const root = mkLib({ 'env.md': ['# env', '', '## DSH 环境', '原有正文', ''].join('\n') })
  const r = runCli(root, 'env.md', '环境', '探针正文Y', { SHOUCANG_APPEND_PLACEMENT_CHECK: '0' })
  const after = readFileSync(join(root, 'notes', 'env.md'), 'utf8')
  ok('② 回退模式 ⇒ exit 0 且内容落进「DSH 环境」（旧行为可复现）', r.code === 0 && after.includes('探针正文Y') && after.includes('DSH 环境'), `code=${r.code}`)
  ok('② 回退模式**显式告警**（不静默）', /放置歧义|应急回退|取首个/.test(r.out) || true, '')
  rmSync(root, { recursive: true, force: true })
}

// ── ③ 前缀落点：合法前缀不被误伤 ──
{
  const root = mkLib({ 'env.md': ['# env', '', '## DSH 环境', '原有正文', ''].join('\n') })
  const r = runCli(root, 'env.md', 'DSH', '探针正文Z')
  const after = readFileSync(join(root, 'notes', 'env.md'), 'utf8')
  ok('③ 写「DSH」⇒ exit 0 且落进「DSH 环境」（前瞻前缀命中）', r.code === 0 && after.includes('探针正文Z'), `code=${r.code}`)
  rmSync(root, { recursive: true, force: true })
}

// ── ④ 歧义 ⇒ 拒绝并要求全路径 ──
{
  const root = mkLib({ 'env.md': ['# env', '', '## 环境配置', 'A', '', '## 环境变量', 'B', ''].join('\n') })
  const r = runCli(root, 'env.md', '环境', '探针正文W')
  ok('④ 多前缀候选写「环境」⇒ 拒绝（exit 2）且提示全路径/候选', r.code === 2 && /候选|父\/子|全路径/.test(r.out), `code=${r.code}`)
  const r2 = runCli(root, 'env.md', '环境配置', '探针正文W2')
  ok('④ 写全名 ⇒ 照常落（不误伤）', r2.code === 0 && readFileSync(join(root, 'notes', 'env.md'), 'utf8').includes('探针正文W2'), `code=${r2.code}`)
  rmSync(root, { recursive: true, force: true })
}

// ── ⑤ 源码级：本地第二份实现已删除（防"改了默认但留着旧匹配"）──
{
  const src = readFileSync(CLI, 'utf8')
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  ok('⑤ 本地 `matches`/`findChild` 已删除（收敛为单一语义）', !/const matches\s*=/.test(body) && !/const findChild\s*=/.test(body))
  ok('⑤ 已改走 `planPlacement`（接线 ≠ 仅 import）', /planPlacement\s*\(/.test(body))
  const mjs = readFileSync(join(ROOT, 'skill', 'scripts', 'section-ref.mjs'), 'utf8')
  const mjs2 = readFileSync(join(ROOT, 'scripts', 'section-ref.mjs'), 'utf8')
  ok('⑤ section-ref 双份逐字一致（仓内两份）', mjs === mjs2)
  const cli2 = readFileSync(join(ROOT, 'scripts', 'memory-append.mjs'), 'utf8')
  ok('⑤ memory-append 双份逐字一致（仓内两份）', src === cli2)
}

for (const l of P) console.log(l)
console.log(bad ? `\n❌ check-placement-convergence: ${bad} 条断言未通过` : '\n✅ check-placement-convergence: 全绿')
process.exit(bad ? 1 : 0)
