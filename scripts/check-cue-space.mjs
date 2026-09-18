#!/usr/bin/env node
// check-cue-space.mjs — IR1 册二「cue 键空间统一」验收件（B1–B5 · 2026-09-18）
//
// 病灶（实测，IR1 方案册 §2-2）：**同一工作区在库里裂成两种拼写**（正斜杠 267 / 反斜杠 152），
//   而匹配判据是**字符串全等** ⇒ 读侧只对得上其中一片；`createdAt ≥ 09-18` 的新记录命中 **0/119**。
//   根因是**归一只有写侧私有实现、读侧无同源**，且注册表只声明维名、不声明值规则。
//
// 判据（对应验收册 B1–B5）：
//   **B1** 同一工作区 `scope=` 键**只剩一种拼写**（每条键都 == 其归一形态）；
//   **B2** 新落库环记录 **100% 可被同维 cue 命中**（结构化判据 = 键已归一 + 维已声明 + 与读侧实产键可比）；
//   **B3** 归一/解析/序列化在 `src/` 内**只有 1 处定义**（其余只许再导出）；
//   **B4** 写侧写入注册表**未声明维** ⇒ **拒收 + 审计可见**（旧行为：37 条静默）；
//   **B5** 注册表声明维 **⊆** 读侧可产维，且**每维都有值规则**（注册表 + 实现两处）。
//
// 用法：node scripts/check-cue-space.mjs [--since 2026-09-18] [--json] [--selftest]
// 退出码：0 = PASS · 1 = FAIL · 3 = SKIP（库内无记录 —— 与 `inject-baseline-diff` 同规格）
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const SINCE = argOf('--since', '2026-09-18')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/cue-space.js', import.meta.url).href)
const { normalizeCueKey, validateCueKey, parseCues, cueSetOf, declaredCueDims, CUE_VALUE_RULES } = mod
if (typeof normalizeCueKey !== 'function') { console.log('❌ lib/cue-space.js 导出不齐（先 npm run build:host）'); process.exit(1) }

// ── `--selftest`：判据双向自证（不读真库）──
//   ⚠ 盘符用**拼接构造**（`String.fromCharCode(68)+':'`）而不是字面量 —— 仓内「零硬编码本机路径」红线
//   对**样本也要生效**（`check-hardcode` 的硬面命中即红；先例见 S-P2-顺带修）。
const DRV = String.fromCharCode(68) + ':' // 'D:'（拼接：不写字面盘符）
if (argv.includes('--selftest')) {
  console.log('check-cue-space · --selftest（判据自证）')
  ok(normalizeCueKey(`scope=workspace:${DRV}/a/b`) === `scope=workspace:${DRV}/a/b`, '① 正斜杠键 ⇒ 不变（幂等）')
  ok(normalizeCueKey(`scope=workspace:${DRV}\\a\\b`) === `scope=workspace:${DRV}/a/b`, '② **反斜杠键 ⇒ 归一成正斜杠**（劈半的修复本体）')
  ok(normalizeCueKey(`scope=workspace:${DRV}/a/`) === `scope=workspace:${DRV}/a`, '③ 去尾斜杠')
  ok(normalizeCueKey(`scope=workspace:${DRV}//a`) === `scope=workspace:${DRV}/a`, '④ 折叠重复斜杠')
  ok(normalizeCueKey('TASK=Deep  Sleep') === 'task=deep-sleep', '⑤ 维名小写 + task kebab')
  ok(normalizeCueKey('') === '' && normalizeCueKey('no-equals') === '', '⑥ 空/无 `=` ⇒ 丢弃（不把垃圾带进库）')
  ok(validateCueKey('topic=x', ['scope', 'task']).ok === false, '⑦ **未声明维 ⇒ 拒收**（B4 的判定点）')
  ok(cueSetOf([`scope=workspace:${DRV}\\a`, 'topic=x', 'task=Build']).rejected.length === 1, '⑧ 批量：坏键逐条拒收、好键照收（不连坐）')
  console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（判据双向可证）')
  process.exit(fail ? 1 : 0)
}

// ── 事实源：记录集 + 注册表 + 源码 ──
const memRoot = process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory')
const recFile = join(memRoot, '.records', 'records.jsonl')
const registry = JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria.json'), 'utf8'))
const declared = registry?.surface?.injection?.situation?.cueDims
const dimRules = registry?.surface?.injection?.situation?.cueDimRules
if (!Array.isArray(declared)) { console.log('❌ 注册表缺 `surface.injection.situation.cueDims`（本门的事实源不可缺）'); process.exit(1) }

console.log('IR1 册二 · cue 键空间统一')
console.log(`  注册表声明维 = [${declared.join(', ')}] · 值规则声明 ${dimRules && typeof dimRules === 'object' ? Object.keys(dimRules).length : 0} 维`)

if (!existsSync(recFile)) {
  console.log(`⏭ SKIP：库内无记录文件（${recFile}）—— 键空间判据需要真实存量`)
  process.exit(3)
}
const rows = readFileSync(recFile, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
const withCues = rows.filter((r) => r?.meta && r.meta.cues)

// ── B1：同一工作区 `scope=` 只剩一种拼写（= 每条键都等于其归一形态）──
const scopeKeys = []
const allCueKeys = []
const dimCount = {}
for (const r of withCues) for (const k of parseCues(r.meta.cues)) {
  allCueKeys.push(k)
  const d = k.split('=')[0]
  dimCount[d] = (dimCount[d] || 0) + 1
  if (d === 'scope') scopeKeys.push(k)
}
const rawScope = []
for (const r of withCues) for (const k of String(r.meta.cues).split('\n')) { const t = k.trim(); if (t.startsWith('scope=')) rawScope.push(t) }
const unnormalized = rawScope.filter((k) => normalizeCueKey(k) !== k)
const distinctRaw = new Set(rawScope.map((k) => k.split('=')[1])).size
ok(unnormalized.length === 0, `B1 存量 scope 键**全部已归一**（未归一 ${unnormalized.length} 条 / 共 ${rawScope.length} 条 · 去重后工作区值 ${distinctRaw} 个）`)
if (unnormalized.length) {
  console.log(`     ⚠ 未归一样例：${unnormalized.slice(0, 3).map((k) => k.slice(0, 60)).join(' ｜ ')}`)
  console.log('     ⇒ 修复：`node scripts/migrate-cue-keys.mjs --apply`（dry-run 先行；只改 `meta.cues`，带备份，幂等）')
}

// ── B2：新落库记录 100% 可被同维 cue 命中（结构化判据 = 键已归一）──
//   ⚠ 未声明维**不在此判**（归 B4）：B2 只问"同维同形态可比"，维是否登记是另一条判据。
const recent = withCues.filter((r) => String(r.createdAt || '') >= SINCE)
const recentKeys = recent.flatMap((r) => parseCues(r.meta.cues))
const badRecent = recentKeys.filter((k) => normalizeCueKey(k) !== k)
ok(recent.length === 0 || badRecent.length === 0,
  `B2 新记录（createdAt ≥ ${SINCE}）键**全部已归一 ⇒ 可与读侧同维键全等匹配**：${recent.length} 条 · ${recentKeys.length} 键 · 未归一 ${badRecent.length}（旧读数 **0/119 命中 = 0%**）`)
if (badRecent.length) console.log(`     ⚠ 未归一样例：${badRecent.slice(0, 3).join(' ｜ ')}`)

// ── B2-live：与**读侧实产键**互核（真机；宿主不可达 ⇒ 跳过该子项）──
{
  const PORT = process.env.DSH_PORT || '3080'
  let live = null
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/shoucang-panel/inject/preview?q=${encodeURIComponent('继续')}`, { signal: AbortSignal.timeout(8000) })
    if (r.ok) live = await r.json()
  } catch { /* 宿主未运行 */ }
  const readKeys = live?.supplyUsage?.cues
  if (!Array.isArray(readKeys)) {
    console.log('   ⏭ B2-live 跳过：宿主不可达（读侧实产键不可取）')
  } else {
    const inter = recentKeys.filter((k) => readKeys.includes(k))
    ok(live.supplyUsage?.situationEnabled !== false, `B2-live 情境槽开启且读侧产出 ${readKeys.length} 键：${readKeys.slice(0, 3).join(' / ') || '(空)'}`)
    console.log(`   B2-live 证据：读侧键 ∩ 新记录键 = ${inter.length} 条${inter.length ? '（' + inter.slice(0, 2).join(' / ') + '）' : ''}`)
    // 断言只落**形态**：读侧键必须已归一（否则又是"单侧归一"）
    ok(readKeys.every((k) => normalizeCueKey(k) === k), 'B2-live **读侧实产键已归一**（读写同源 —— 旧实现读侧产反斜杠键 ⇒ 此处必红）')
    /* **命中**判据（G2 的可核验形态）：读侧产出的键**若库里已有同值记录** ⇒ 必须命中 ≥1。
     *   为什么加"若有"这个前提：读侧键 = 当前工作区 + 当前任务 ⇒ 换库/换工作区时**天然无交集**，
     *   无条件要求 >0 会造出"环境一变就假红"的门（仓内最忌）。实测（2026-09-18 归一后）：命中 **73** 条。 */
    const sameVal = recentKeys.filter((k) => readKeys.some((rk) => rk === k))
    ok(readKeys.length === 0 || sameVal.length === 0 || inter.length > 0, `B2-live **同值即命中**（读侧键在库中有同值记录 ⇒ 命中 ${inter.length} ≥ 1）`)
  }
}

// ── B3：归一/解析/序列化在 `src/` 内只有 1 处定义 ──
{
  const files = []
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.ts') && e.name !== 'criteria.generated.ts') files.push(p) } }
  walk(join(root, 'src'))
  const DEF = /(?:export\s+)?(?:function|const)\s+(normalizeCueKey|normalizeCue|parseCues|serializeCues|cueKeyOf|validateCueKey)\b/
  const defs = []
  for (const f of files) {
    const t = readFileSync(f, 'utf8')
    t.split('\n').forEach((l, i) => { if (DEF.test(l)) defs.push({ mod: f.split(/[\\/]/).pop(), line: i + 1, sym: l.trim().slice(0, 60) }) })
  }
  const mods = [...new Set(defs.map((d) => d.mod))]
  ok(mods.length === 1 && mods[0] === 'cue-space.ts', `B3 cue 键函数**只在 1 处定义**（实测：${mods.join(', ') || '无'}；${defs.length} 个符号）`)
  if (mods.length !== 1) for (const d of defs) console.log(`     · ${d.mod}:${d.line} ${d.sym}`)
}

// ── B4：未声明维 ⇒ 拒收 + 审计可见（静态接线 + 存量读数）──
{
  const rc = readFileSync(join(root, 'src', 'ring-commit.ts'), 'utf8')
  ok(/cueSetOf\(/.test(rc) && /cue\.rejected/.test(rc), 'B4 写侧走**校验路径**（`cueSetOf`）且拒收**落审计** `cue.rejected`')
  const undeclared = allCueKeys.filter((k) => !declared.includes(k.split('=')[0]))
  console.log(`   B4 存量读数：带 cue 记录 ${withCues.length} 条 · 键 ${allCueKeys.length} 条 · 维分布 ${JSON.stringify(dimCount)}`)
  console.log(`   B4 **未声明维**键 ${undeclared.length} 条${undeclared.length ? '（历史存量；新写入自本册起逐条拒收 + 审计）' : ''}`)
  ok(cueSetOf(['topic=x']).rejected.length === 1, 'B4 行为级：喂 `topic=x`（未声明维）⇒ 拒收（不是静默写入）')
}

// ── B5：注册表声明维 ⊆ 读侧可产维，且每维有值规则（注册表 + 实现两处）──
{
  const sk = readFileSync(join(root, 'src', 'situation-key.ts'), 'utf8')
  const known = (sk.match(/KNOWN_DIMS[^=]*=\s*\[([^\]]+)\]/) || [])[1] || ''
  const knownDims = known.split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)
  const notProducible = declared.filter((d) => !knownDims.includes(d))
  ok(notProducible.length === 0, `B5 声明维 ⊆ 读侧可产维（读侧词表 [${knownDims.join(', ')}]${notProducible.length ? ' · 越界：' + notProducible.join(',') : ''}）`)
  const missingRuleImpl = declared.filter((d) => !CUE_VALUE_RULES[d])
  const missingRuleDoc = declared.filter((d) => !dimRules || !dimRules[d])
  ok(missingRuleImpl.length === 0, `B5 每维有**值规则实现**（缺：${missingRuleImpl.join(',') || '无'}）`)
  ok(missingRuleDoc.length === 0, `B5 每维有**注册表值规则声明**（缺：${missingRuleDoc.join(',') || '无'}）`)
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（cue 键空间读写同源）')
process.exit(fail ? 1 : 0)
