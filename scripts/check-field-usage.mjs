#!/usr/bin/env node
// check-field-usage.mjs — 注册表字段「是否真被消费」机检（审查 F1-B · M 档护栏）
//
// 背景（`docs/architecture-review-20260911.md` F1）：注册表里 `SCORE.mode` / `SURFACE.injection` / `TRIGGER.idleMs`
//   等字段**没有任何代码消费** ⇒ 改注册表不生效，而文档读起来像"改注册表即可"。这类"写了不生效"的字段
//   与实测修过的三次缺陷（recallFusion='rrf'→0、白名单缺映射、selfCheckRepo→0）同族，必须机检红灯。
//
// 判据粒度 = **文件级**（可判定且容别名）：某字段声明为 runtime ⇔ 存在一个 `src/*.ts`（排除生成物自身）
//   同时满足 ① import 了该字段所属的导出常量 ② 文件里出现该字段名。这样 `s.alphaImp`（别名访问）
//   与 `(CARRIERS as {...}).tags`（cast 访问）都能正确判为**已消费**，而"整块没接"会被判为 doc。
//
// 声明机制：`criteria.json#fieldRoles`，键 = 导出常量.字段（如 `SCORE.alphaImp`），值 = `runtime` | `doc`。
//   门禁同时反向校验：声明 `doc` 的字段**不得**被判为已消费（否则标记说谎）；声明 `runtime` 的必须已消费。
// 用法: node scripts/check-field-usage.mjs [--json]
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reg = JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria.json'), 'utf8'))
const roles = reg.fieldRoles || {}
const AS_JSON = process.argv.includes('--json')
const SUGGEST = process.argv.includes('--suggest')

// 采集：每个 src 文件（排除生成物）import 了哪些导出常量 + 全文
const srcDir = join(root, 'src')
const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts') && f !== 'criteria.generated.ts')
const info = files.map((f) => {
  const text = readFileSync(join(srcDir, f), 'utf8')
  const consts = new Set([...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/criteria\.generated\.js'/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim())).filter(Boolean))
  return { f: `src/${f}`, text, consts }
})
// **脚本面消费者**（B 档）：只认**把字段当参数用**的脚本，且**排除元操作**——
//   `gen-criteria.mjs`（把注册表投影成 generated/gate，是"搬运"不是"消费"）与 `check-*.mjs`（把注册表当数据校验）
//   若算作消费，会让每个字段永远"被消费"⇒ 判据自我满足（实测踩过：suggest 一度把 29 项全判 runtime）。
const isMeta = (f) => /^(gen-|check-)/.test(f)
const PROJ_CONSTS = ['GATE', 'HEALTH', 'SURFACE', 'CARRIERS', 'SCORE', 'MATURATION', 'TRIGGER', 'L0']
for (const [dir, label] of [[join(root, 'skill', 'scripts'), 'skill/scripts/'], [join(root, 'scripts'), 'scripts/']]) {
  let names = []
  try { names = readdirSync(dir).filter((f) => f.endsWith('.mjs')) } catch { /* 目录缺失 */ }
  for (const f of names) {
    if (isMeta(f)) continue
    let text = ''
    try { text = readFileSync(join(dir, f), 'utf8') } catch { continue }
    if (!text.includes('criteria-gate.json') && !text.includes('criteria.json')) continue
    info.push({ f: label + f, text, consts: new Set(PROJ_CONSTS) })
  }
}
// 判据收紧为「**属性访问形态**」：字段名前面必须有点或方括号（`.field` / `['field']`）——
//   否则 `enforce`/`step` 这类**参数名/局部变量**会与字段同名而误判为已消费（实测踩过）。
const consumed = (constName, field) => info.some((x) => x.consts.has(constName) && new RegExp(`[.[]\\s*['"]?${field}\\b`).test(x.text))

// 未声明字段：只报告（不 FAIL）——便于逐步把真相写进注册表
const allConsts = ['L0', 'GATE', 'HEALTH', 'SURFACE', 'CARRIERS', 'SCORE', 'MATURATION', 'TRIGGER', 'CRITERIA_ROWS', 'CRITERIA_VERSION', 'INGEST_JUDGE', 'CONSOLIDATE_JUDGE', 'JUDGEMENT_HINT', 'LEDGER_FILE']
const constLevel = allConsts.map((c) => ({ constName: c, imported: info.some((x) => x.consts.has(c)) }))

let fail = 0
const warnings = []
const rows = []
for (const [path, role] of Object.entries(roles)) {
  const [constName, field] = path.split('.')
  const is = consumed(constName, field)
  // 方向一（**硬红灯**）：声明 runtime 却无人消费 ⇒ "改了不生效"，这是危险方向，必须失败。
  // 方向二（**仅告警**）：声明 doc 却疑似被消费 —— token 级分析有假阳性（`process.exit` 撞 `GATE.exit`、`proj.K` 撞局部变量），
  //   故只提示"标记可能过期"，不失败（避免门禁自己说谎而逼人写假声明）。
  const ok = role === 'runtime' ? is : true
  if (role === 'runtime' && !is) fail++
  if (role === 'doc' && is) warnings.push(path)
  rows.push({ path, role, consumed: is, ok, why: role === 'runtime' && !is ? '声明 runtime 但无人消费（改了不生效）' : role === 'doc' && is ? '疑似被消费（标记可能过期；token 级分析，人工确认）' : '' })
}
// 常量级：被导出却无人 import ⇒ 整块没接（硬红灯）
const orphanConsts = constLevel.filter((c) => !c.imported && !['CRITERIA_VERSION'].includes(c.constName))
const report = { declared: rows.length, violations: fail, rows, constLevel, orphanConsts: orphanConsts.map((c) => c.constName) }
if (SUGGEST) {
  // --suggest：按当前实现**反推**每个候选字段的真实角色，直接给出可粘贴进 criteria.json 的 fieldRoles
  const CAND = [
    ['SCORE', 'alphaRel'], ['SCORE', 'alphaImp'], ['SCORE', 'alphaRec'], ['SCORE', 'mode'],
    ['SURFACE', 'injection'], ['SURFACE', 'recall'], ['SURFACE', 'fusion'], ['SURFACE', 'threshold'], ['SURFACE', 'rerank'], ['SURFACE', 'mcl'],
    ['TRIGGER', 'idleMs'], ['TRIGGER', 'newTracesMin'], ['TRIGGER', 'manual'],
    ['MATURATION', 'A0'], ['MATURATION', 'step'], ['MATURATION', 'gate'], ['MATURATION', 'enforce'],
    ['CARRIERS', 'tags'], ['CARRIERS', 'renderers'],
    ['GATE', 'caps'], ['GATE', 'notesWarn'], ['GATE', 'exit'], ['HEALTH', 'R'], ['HEALTH', 'K'], ['HEALTH', 'notesWarn'],
    ['L0', 'reuse'], ['L0', 'generality'], ['L0', 'stability'], ['L0', 'conflict'],
  ]
  const out = {}
  for (const [c, f] of CAND) out[`${c}.${f}`] = consumed(c, f) ? 'runtime' : 'doc'
  console.log(JSON.stringify(out, null, 2))
  process.exit(0)
}
if (AS_JSON) console.log(JSON.stringify(report, null, 2))
else {
  console.log('注册表字段消费机检（filed-level: import ∧ 字段名）')
  for (const r of rows) console.log(`  ${r.ok ? '✅' : '❌'} ${r.path} [${r.role}] 消费=${r.consumed}${r.why ? ' — ' + r.why : ''}`)
  if (orphanConsts.length) console.log(`  ⚠ 导出常量无人 import：${orphanConsts.map((c) => c.constName).join(', ')}`)
  console.log(fail ? `\nFAIL（${fail} 项字段角色与实现不符）` : `\nPASS（${rows.length} 项字段角色与实现一致）`)
}
process.exit(fail ? 1 : 0)
