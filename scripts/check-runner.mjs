#!/usr/bin/env node
// check-runner.mjs — 检测件统一运行器（审查 F6 · M 档护栏）
//
// 问题：同一批检测件被多个入口调用，但**退出码口径不一**——`sleep-selfcheck` 把 exit 3 当「依赖缺失 ⇒ 跳过」，
//   而 `npm test` 的 `&&` 链把任何 exit≠0 当失败并中断。同一份检测件在两种入口下判读不同，会让人对"到底过没过"失去信任。
// 契约（ADR-132）：`0 = pass · 3 = skip（依赖缺失，不算失败） · 其他 = fail`。本运行器**唯一实现**该契约：
//   · 逐件运行并按其退出码归类；· 打印统一摘要；· 任一 fail ⇒ 自身 exit 1；全 pass/skip ⇒ exit 0。
// 用法: node scripts/check-runner.mjs [--json]
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')
// 参与 test 链的检测件（顺序=依赖顺序：判据→载体→字段→分层→部署面→变更日志）
// 2026-09-11（测试清单收敛）：此前 `npm test` 的 && 链与 CHECKS 是**两份零重叠的清单**，
//   新增测试件无处登记（既不在 CHECKS 也不在 npm test）⇒ 写了也可能永远不跑。
//   现统一纪律：**行为级测试件一律进 CHECKS**（本运行器是唯一清单），npm test 只保留不在 CHECKS 里的杂项。
const CHECKS = [
  'check-criteria.mjs',
  'check-carriers.mjs',
  'check-field-usage.mjs',
  'test-layering.mjs',
  'test-carrier-layers.mjs',
  'check-deploy-sync.mjs',
  'check-changelog.mjs',
]
const rows = []
for (const f of CHECKS) {
  let code = 0
  try { execFileSync('node', [join(root, 'scripts', f)], { stdio: 'ignore', timeout: 180000, windowsHide: true }) }
  catch (e) { code = Number(e.status ?? -1) }
  rows.push({ file: f, code, verdict: code === 0 ? 'pass' : code === 3 ? 'skip' : 'fail' })
}
const failed = rows.filter((r) => r.verdict === 'fail')
const out = { checks: rows, fail: failed.map((r) => r.file), note: '契约：0=pass · 3=skip(依赖缺失) · 其他=fail（ADR-132）' }
if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  console.log('检测件统一运行（契约：0=pass · 3=skip · 其他=fail）')
  for (const r of rows) console.log(`  ${r.verdict === 'pass' ? '✅' : r.verdict === 'skip' ? '⏭' : '❌'} ${r.file.padEnd(26)} exit=${r.code} ${r.verdict}`)
  console.log(failed.length ? `\nFAIL（${failed.length} 项）：${failed.map((r) => r.file).join(', ')}` : `\nPASS（${rows.filter((r) => r.verdict === 'pass').length} pass · ${rows.filter((r) => r.verdict === 'skip').length} skip）`)
}
process.exit(failed.length ? 1 : 0)
