#!/usr/bin/env node
// check-session-review-scope.mjs — S2S3 册一：**L2 复盘件的边界机检**（2026-09-19）
//
// 为什么必须机检（架构主审裁定的落点）：「L2 不直接改库、执行权留 S3」这条**不能靠注释自觉**——
//   只要 `session-review.ts` 里出现一个重写者 import 或一次库内写入调用，"执行权留 S3"就名存实亡，
//   而**功能测试依然全绿**（提案照出、审计照写）。故把边界做成断言。
//
// 四档断言：
//   ① **文件在册**：`src/session-review.ts` 存在且导出 `runSessionReview`（防"删了也算过"）
//   ② **依赖白名单**：禁止 import `treeops` / `forgetops` / `sectionops` / `deepsleep-*` / `panel-*`
//   ③ **不得持有写入原语**：源码不得出现 `atomicWriteFile` / `editFileUnderLock` / `writeFileSync(` /
//      `renameSync(` / `unlinkSync(` —— 只许 `appendFileSync`（append-only 提案流与状态流）
//   ④ **反例自证**：往临时副本里注入一条禁止 import 与一次 `writeFileSync(` ⇒ 断言必须各自命中
//      （否则本件是"恒真断言"）
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src', 'session-review.ts')
const FORBIDDEN_IMPORTS = ['treeops', 'forgetops', 'sectionops', 'deepsleep-', 'panel-']
const FORBIDDEN_WRITES = ['atomicWriteFile', 'editFileUnderLock', 'writeFileSync(', 'renameSync(', 'unlinkSync(']

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const importLines = (t) => t.split(/\r?\n/).filter((l) => /^\s*import\b/.test(l)).join('\n')
const scan = (text) => ({
  badImports: FORBIDDEN_IMPORTS.filter((k) => importLines(stripComments(text)).includes(k)),
  badWrites: FORBIDDEN_WRITES.filter((k) => stripComments(text).includes(k)),
})

let text = ''
try { text = readFileSync(SRC, 'utf8') } catch { /* 缺失下面报 */ }
if (!text) bad('src/session-review.ts 缺失')
else {
  text.includes('export async function runSessionReview') ? ok('在册：导出 runSessionReview') : bad('缺 runSessionReview 导出')
  text.includes('appendFileSync') ? ok('写入面只有 appendFileSync（append-only 提案流/状态流）') : bad('未见 appendFileSync —— 提案流如何落盘？')
  const r = scan(text)
  r.badImports.length === 0 ? ok(`依赖白名单：未 import ${FORBIDDEN_IMPORTS.join(' / ')}`) : bad(`越界 import：${r.badImports.join(', ')}（L2 不得把重写者引进 S2）`)
  r.badWrites.length === 0 ? ok(`不持有写入原语：未出现 ${FORBIDDEN_WRITES.join(' / ')}`) : bad(`出现库内写入原语：${r.badWrites.join(', ')}`)
}

// ④ 反例自证：扫描器必须能抓到违规
{
  const dir = mkdtempSync(join(tmpdir(), 'sc-srscope-'))
  const f = join(dir, 'fake.ts')
  writeFileSync(f, [
    "import { forgetops } from './forgetops.js'",
    'export function x() { writeFileSync(1 as never, "" as never) }',
  ].join('\n'), 'utf8')
  const r = scan(readFileSync(f, 'utf8'))
  r.badImports.includes('forgetops') && r.badWrites.includes('writeFileSync(')
    ? ok('反例自证：注入越界 import 与库内写入 ⇒ 两项均被检出（断言非恒真）')
    : bad(`反例自证失败：${JSON.stringify(r)}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
