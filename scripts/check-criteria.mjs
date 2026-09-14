#!/usr/bin/env node
// check-criteria.mjs — 判据机检门（ADR-122 记忆核心 v2，纳入 npm test）
//
// 三道：
//   ① 注册表自洽：id 唯一 / kind ∈ {hard,soft} / 每条有 text / L0 取值域非空 / version 存在
//   ② 投影最新：调 gen-criteria.mjs --check（生成产物与注册表逐字一致）
//   ③ 投影接线：五处投影确实被消费（prompt 引用生成段 / criteria.ts 读 CRITERIA_ROWS / 两个脚本读 criteria-gate.json）
// 用法: node scripts/check-criteria.mjs      exit 0 = 过；1 = 有一道未过
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

// ① 注册表自洽
const regPath = join(root, 'skill', 'engine', 'criteria.json')
let reg = null
try { reg = JSON.parse(readFileSync(regPath, 'utf8')) } catch (e) { console.log(`❌ 注册表不可读：${String(e.message)}`); process.exit(1) }
const all = [...(reg.ingest?.criteria || []), ...(reg.consolidate?.criteria || [])]
const ids = all.map((c) => c.id)
ok(typeof reg.version === 'string' && reg.version.length > 0, `①注册表 version=${reg.version}`)
ok(new Set(ids).size === ids.length, `①判据 id 唯一（${ids.length} 条，去重后 ${new Set(ids).size}）`)
ok(all.every((c) => c.kind === 'hard' || c.kind === 'soft'), '①每条判据 kind ∈ {hard,soft}')
ok(all.every((c) => typeof c.text === 'string' && c.text.length > 0), '①每条判据都有 text')
ok(Object.values(reg.l0 || {}).every((d) => Array.isArray(d.values) && d.values.length > 0), '①L0 四维取值域非空')
ok(Array.isArray(reg.antiScope) && reg.antiScope.length > 0, `①anti-scope 已定义（${reg.antiScope?.length || 0} 条）`)

// ② 投影最新（生成器自检）
try {
  execFileSync('node', [join(root, 'scripts', 'gen-criteria.mjs'), '--check'], { stdio: 'inherit', cwd: root })
  ok(true, '②三处生成投影与注册表一致（src/criteria.generated.ts · skill/engine/criteria.md · criteria-gate.json）')
} catch { ok(false, '②投影过期（重跑 node scripts/gen-criteria.mjs）') }

// ③ 投影接线（消费面确实引用生成物）
const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }
const distill = read('src/distill.ts')
ok(distill.includes('INGEST_JUDGE') && distill.includes('CONSOLIDATE_JUDGE'), '③蒸馏/深睡 prompt 引用生成判据段')
ok(distill.includes('JUDGEMENT_HINT') && distill.includes('LEDGER_FILE'), '③prompt 带 judgement 提示且宿主写台账文件')
ok(/from '\.\/criteria\.generated\.js'/.test(read('src/criteria.ts')), '③criteria.ts 读生成投影（CRITERIA_ROWS/参数）')
ok(read('src/criteria.ts').includes('evaluateL0') && read('src/criteria.ts').includes('promoteVerdict') && read('src/criteria.ts').includes('demoteVerdict'), '③L0 内核 + 升格/降格裁决单一实现齐备')
const gateReads = ['skill/scripts/memory_write_gate.mjs', 'skill/scripts/memory_health_check.mjs'].map((p) => ({ p, t: read(p) }))
ok(gateReads.every(({ t }) => t.includes('criteria-gate.json')), `③硬门/体检脚本读 criteria-gate.json（${gateReads.map((g) => g.p).join(' · ')}）`)
ok(existsSync(join(root, 'skill', 'engine', 'criteria.md')), '③人读判据表已生成（skill/engine/criteria.md）')
const gateJson = (() => { try { return JSON.parse(read('skill/engine/criteria-gate.json')) } catch { return null } })()
ok(!!gateJson && gateJson.version === reg.version, '③脚本面参数版本与注册表一致')

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（判据机检门全过）')
process.exit(fail ? 1 : 0)
