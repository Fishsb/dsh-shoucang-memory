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
// 参与 test 链的检测件/测试件（顺序=依赖顺序：判据→载体→字段→分层→行为测试→红线→部署面→变更日志）
// 2026-09-11（测试清单收敛）：此前 `npm test` 的 && 链与 CHECKS 是**两份零重叠的清单**，
//   新增测试件无处登记（既不在 CHECKS 也不在 npm test）⇒ 写了也可能永远不跑。
//   现统一纪律：**行为级测试件一律进 CHECKS**（本运行器是唯一清单），npm test 只跑本运行器。
// 2026-09-12（N1 纪律执行化）：上面这条纪律**文本本身没有执行力**——立完之后，
//   `test-deepsleep-verdict.mjs`（G-16 的 36 条断言）、`test-watermark-guard.mjs`（G-20）、
//   `test-atomic-write.mjs`（D3 原子性 29 条断言，且从未 git add）三件仍然既不在 CHECKS 也不在 npm test，
//   等于 G-16 的断言一条都没跑过。故本次把全部行为级测试件登记进本清单，并把 `npm test` 退化为
//   只跑本运行器：**只有一个入口，就不存在"登记在另一份清单里"的漏网件**。
//   新增件**必须**登记在此；登记了但文件不存在 ⇒ 判 FAIL（不是静默跳过）。
// 每项格式：[相对仓根的脚本路径, ...argv]；argv 中的 '__ROOT__' 会替换为仓根绝对路径（供需要根路径的检测件使用）。
const CHECKS = [
  ['scripts/check-criteria.mjs'],
  ['scripts/check-carriers.mjs'],
  ['scripts/check-field-usage.mjs'],
  ['scripts/test-layering.mjs'],
  ['scripts/test-carrier-layers.mjs'],
  ['scripts/test-forgetops.mjs'],
  ['scripts/test-treeops-split.mjs'],
  ['scripts/test-mcl.mjs'],
  ['scripts/test-deepsleep-verdict.mjs'],
  ['scripts/test-watermark-guard.mjs'],
  ['scripts/test-atomic-write.mjs'],
  ['scripts/test-wiring-gate.mjs'],
  ['scripts/test-treeops-rm.mjs'],
  ['skill/scripts/test.mjs'],
  ['scripts/check-hardcode.mjs', '__ROOT__'],
  ['scripts/check-srcmap.mjs'],
  ['scripts/check-deploy-sync.mjs'],
  ['scripts/check-changelog.mjs'],
]
const rows = []
for (const entry of CHECKS) {
  const [file, ...args] = entry
  const argv = args.map((a) => (a === '__ROOT__' ? root : a))
  let code = 0
  try { execFileSync('node', [join(root, file), ...argv], { stdio: 'ignore', timeout: 300000, windowsHide: true }) }
  catch (e) { code = Number(e.status ?? -1) }
  rows.push({ file, code, verdict: code === 0 ? 'pass' : code === 3 ? 'skip' : 'fail' })
}
const failed = rows.filter((r) => r.verdict === 'fail')
const out = { checks: rows, fail: failed.map((r) => r.file), note: '契约：0=pass · 3=skip(依赖缺失) · 其他=fail（ADR-132）' }
if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  console.log('检测件统一运行（契约：0=pass · 3=skip · 其他=fail）')
  for (const r of rows) console.log(`  ${r.verdict === 'pass' ? '✅' : r.verdict === 'skip' ? '⏭' : '❌'} ${r.file.padEnd(36)} exit=${r.code} ${r.verdict}`)
  console.log(failed.length ? `\nFAIL（${failed.length} 项）：${failed.map((r) => r.file).join(', ')}` : `\nPASS（${rows.filter((r) => r.verdict === 'pass').length} pass · ${rows.filter((r) => r.verdict === 'skip').length} skip）`)
}
process.exit(failed.length ? 1 : 0)
