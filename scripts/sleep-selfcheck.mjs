#!/usr/bin/env node
// sleep-selfcheck.mjs — 睡眠期自检（v2.2 · 与深睡同步执行 + 白名单内事实调整）
//
// 背景：深睡由 **DSH 子代理**执行（独立 session，父状态恒 idle）⇒ 自检必须挂在**子代理完成之后由宿主执行**，
//   不能靠父状态轮询；子代理内部只做归纳，自检是宿主的职责。
// 做三件事：
//   ① 跑齐检测（判据门 / 载体门 / 分层单测 / 成熟度 / 影子打分 / 账本对账），结构化取数（`--out` 读文件，不解析屏幕文本）
//   ② 出**裁决** ok | warn | adjust（并给出建议动作）
//   ③ 输出**白名单事实调整**清单（adjustments）：本轮只定义一项安全动作——`rollback-scoreWeights`（依据 shadow-sim 的 flipReady 翻转回去）
// 边界（写进输出，避免误解）：**只做可回滚的窄动作**；改 α/改 gate/改判据/删库内容 一律只建议、不动手。
// 用法: node scripts/sleep-selfcheck.mjs [--repo <仓根>] [--bank <库根>] [--out <file>] [--json]
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const repo = argOf('--repo', process.env.SHOUCANG_REPO || '')
const stateRoot = argOf('--state', join(homedir(), '.dsh', 'suite', 'knowledge'))
const AS_JSON = argv.includes('--json')
const day = new Date().toISOString().slice(0, 10)

const run = (scriptDir, script, args) => {
  const p = join(scriptDir, script)
  if (!existsSync(p)) return { ok: false, skipped: true, reason: `未部署：${p}` }
  try { execFileSync('node', [p, ...args], { stdio: 'ignore', timeout: 120000, windowsHide: true }); return { ok: true } }
  catch (e) {
    const code = Number(e.status ?? -1)
    // exit 3 = 检测件主动声明的「依赖缺失」⇒ 诚实跳过（不是失败）；如 shadow-sim 需要产品实现 lib/criteria.js
    if (code === 3) return { ok: false, skipped: true, reason: '依赖缺失（exit 3：需仓内 lib/，库内布局无 lib）' }
    return { ok: false, reason: `exit≠0（${code}）` }
  }
}
const runJson = (scriptDir, script, args) => {
  const p = join(scriptDir, script)
  if (!existsSync(p)) return { ok: false, skipped: true, reason: `未部署：${p}` }
  const tmp = join(stateRoot, 'audit', `.selfcheck-${script}.json`)
  try { mkdirSync(dirname(tmp), { recursive: true }) } catch { /* */ }
  const r = run(scriptDir, script, [...args, '--json', '--out', tmp])
  if (!r.ok) return r
  try { return { ok: true, data: JSON.parse(readFileSync(tmp, 'utf8')) } } catch (e) { return { ok: false, reason: `读 JSON 失败：${String(e.message).slice(0, 60)}` } }
}

// ① 检测（**优先仓内脚本**：仓内有 src/lib 与全部检测件；库内仅有可独立运行的三支）
const repoDir = repo && existsSync(join(repo, 'scripts')) ? join(repo, 'scripts') : ''
const bankScripts = join(bank, 'scripts')
// json 检测件解析顺序：仓内 → 库内；`shadow-sim` 依赖 ../lib/criteria.js ⇒ 库内必然不可跑（诚实跳过并说明）
const jsonDir = (name) => (repoDir && existsSync(join(repoDir, name)) ? repoDir : bankScripts)
const checks = {}
checks.criteria = repoDir ? run(repoDir, 'check-criteria.mjs', []) : { ok: false, skipped: true, reason: '未提供 --repo（仓侧检测跳过）' }
checks.carriers = repoDir ? run(repoDir, 'check-carriers.mjs', []) : { ok: false, skipped: true, reason: '未提供 --repo（仓侧检测跳过）' }
checks.layering = repoDir ? run(repoDir, 'test-layering.mjs', []) : { ok: false, skipped: true, reason: '未提供 --repo（仓侧检测跳过）' }
checks.maturation = runJson(jsonDir('maturation-scan.mjs'), 'maturation-scan.mjs', ['--bank', bank])
checks.shadow = runJson(jsonDir('shadow-sim.mjs'), 'shadow-sim.mjs', ['--bank', bank])
checks.reconcile = runJson(jsonDir('memory-reconcile.mjs'), 'memory-reconcile.mjs', ['--bank', bank])

// ② 裁决
const failed = Object.entries(checks).filter(([, v]) => !v.ok && !v.skipped).map(([k]) => k)
const skipped = Object.entries(checks).filter(([, v]) => v.skipped).map(([k]) => k)
const flipReady = checks.shadow?.data?.verdict?.flipScoreWeights
const matReady = checks.maturation?.data?.verdict?.ready ?? checks.shadow?.data?.maturationReadiness?.ready
const closureOk = checks.reconcile?.data?.closure?.ok
const adjustments = []
if (flipReady === false) adjustments.push({ id: 'rollback-scoreWeights', why: 'shadow-sim.flipReady=false（R-3）', safe: true, action: { key: 'scoreWeights', value: 'legacy' } })
const verdict = failed.length ? 'warn' : (adjustments.length ? 'adjust' : 'ok')

const out = {
  at: new Date().toISOString(), day, repo: repoDir || null, bank,
  verdict, failed, skipped,
  summary: {
    checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.skipped ? 'skipped' : v.ok ? 'pass' : 'fail'])),
    flipScoreWeights: flipReady ?? null,
    maturationReady: matReady ?? null,
    closureOk: closureOk ?? null,
    shadowCorr: checks.shadow?.data?.metrics?.corrImpRel ?? null,
    matureSections: checks.maturation?.data?.mature ?? null,
    layerCounts: checks.reconcile?.data?.layers?.counts ?? null,
  },
  adjustments,
  policy: {
    auto: '仅白名单窄动作（可回滚）：rollback-scoreWeights（依据 R-3）。需宿主显式开启 selfCheckAutoRollback。',
    suggestOnly: '改 α 权重 / 改 maturation.gate / 改判据条目 / 删改库内容 / 翻 maturationEnforce → 只建议，等用户拍板',
    never: '自动删记忆 · 自动接受被拒写入 · 自动重启宿主',
  },
}

const outFile = argOf('--out', join(stateRoot, 'audit', 'selfcheck-latest.json'))
try { mkdirSync(dirname(outFile), { recursive: true }); writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8') } catch { /* */ }
// 台账：**由脚本自己写**统一台账 `audit/ledger.jsonl`（type=check.sleep）——
//   这样 深睡后 / 定时 / 手动 三条触发路径在同一处留痕（单一实现，避免宿主与脚本各写一份）
try {
  const ledgerFile = join(stateRoot, 'audit', 'ledger.jsonl')
  mkdirSync(dirname(ledgerFile), { recursive: true })
  writeFileSync(ledgerFile, JSON.stringify({ at: out.at, type: 'check.sleep', domain: 'consolidate', trigger: argOf('--trigger', 'manual'), verdict, failed, skipped, summary: out.summary, adjustments: adjustments.map((a) => a.id) }) + '\n', { encoding: 'utf8', flag: 'a' })
} catch { /* 台账失败静默 */ }
try {
  const hist = join(stateRoot, 'audit', `selfcheck-${day}.jsonl`)
  mkdirSync(dirname(hist), { recursive: true })
  writeFileSync(hist, JSON.stringify({ at: out.at, verdict, failed, skipped, summary: out.summary, adjustments: adjustments.map((a) => a.id) }) + '\n', { encoding: 'utf8', flag: 'a' })
} catch { /* */ }

if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`睡眠期自检（${out.at}）→ 裁决 **${verdict}**`)
  for (const [k, v] of Object.entries(out.summary.checks)) console.log(`  ${v === 'pass' ? '✅' : v === 'skipped' ? '⏭' : '❌'} ${k}: ${v}`)
  console.log(`  影子 flipReady=${out.summary.flipScoreWeights} · 成熟度就绪=${out.summary.maturationReady} · 账本闭合=${out.summary.closureOk === null ? 'n/a' : out.summary.closureOk}`)
  console.log(`  白名单事实调整：${adjustments.length ? adjustments.map((a) => a.id + '（' + a.why + '）').join(' · ') : '无'}`)
  if (skipped.length) console.log(`  跳过：${skipped.map((k) => `${k}(${checks[k].reason || '—'})`).join(' · ')}`)
}
// 退出码语义：**恒 0**（裁决在 JSON 的 verdict 字段；调用方/机检读 JSON 而非退出码——
//   避免把"有告警"误当"检测件崩了"，也避免宿主把它当失败中断）
process.exit(0)
