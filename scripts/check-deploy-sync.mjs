#!/usr/bin/env node
// check-deploy-sync.mjs — 部署面双源一致性机检（审查 F8 · M 档护栏）
//
// 背景：检测件在**仓内 `scripts/`** 与**库内 `<bank>/scripts/`** 各有一份拷贝（库是私有数据区，
//   插件 skill/ 与库根同源的部署形态必然如此）。一致性此前靠人工 Copy-Item 维持——实测 7 件当时一致，
//   但**无校验**；一旦漏同步，库内定时/深睡自检跑的就是旧逻辑（而且"跑成功了"）。本门把这件事变成红灯。
// 语义：库根不存在 ⇒ 跳过（exit 3，诚实跳过，不判失败）；同名件 sha1 不一致 ⇒ FAIL。
// 用法: node scripts/check-deploy-sync.mjs [--bank <库根>] [--json]
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const AS_JSON = argv.includes('--json')
const sha = (p) => createHash('sha1').update(readFileSync(p)).digest('hex')

if (!existsSync(join(bank, 'scripts'))) {
  console.log(`⏭ 跳过：库内 scripts/ 不存在（bank=${bank}）——诚实跳过（exit 3）`)
  process.exit(3)
}
// 仓内 `scripts/` **与** `skill/scripts/` 里与库内**同名**的 .mjs 都需要一致
//   （库内专有 archive-* 等不在仓内，天然跳过）。⚠ 覆盖缺口修复（2026-09-11）：
//   此前只比对 `scripts/`，漏了 `skill/scripts/`（技能本体脚本）——实测 `memory_write_gate.mjs` 就因此漏同步，
//   导致"门读的仍是硬编码"，端到端验证才暴露。
const dirs = [join(root, 'scripts'), join(root, 'skill', 'scripts')]
const rows = []
for (const dir of dirs) {
  let names = []
  try { names = readdirSync(dir).filter((f) => f.endsWith('.mjs')) } catch { continue }
  for (const f of names) {
    const a = join(dir, f)
    const b = join(bank, 'scripts', f)
    const label = (dir.includes(join('skill', 'scripts')) ? 'skill/scripts/' : 'scripts/') + f
    if (!existsSync(b)) { rows.push({ file: label, state: 'bank-missing' }); continue }
    rows.push({ file: label, state: sha(a) === sha(b) ? 'same' : 'DIFF' })
  }
}
const diffs = rows.filter((r) => r.state === 'DIFF')
const missing = rows.filter((r) => r.state === 'bank-missing')
const out = { bank, checked: rows.length, diffs: diffs.map((r) => r.file), bankMissing: missing.map((r) => r.file), rows }
if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`部署面一致性（仓 scripts/ ↔ 库 scripts/）：检查 ${rows.length} 件`)
  console.log(`  ✅ 一致 ${rows.filter((r) => r.state === 'same').length} · ⚠ 库内缺失 ${missing.length}（未部署，非错误） · ❌ 不一致 ${diffs.length}`)
  if (diffs.length) console.log(`  需同步：${diffs.map((r) => r.file).join(', ')}（复制仓内 → 库内 scripts/）`)
}
if (diffs.length) { console.error(`\nFAIL（${diffs.length} 件同名脚本两处不一致——库内跑的是旧逻辑）`); process.exit(1) }
console.log('\nPASS（部署面一致）')
