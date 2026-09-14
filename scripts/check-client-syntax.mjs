#!/usr/bin/env node
// check-client-syntax.mjs — `src-client/` 解析可读性门（UI1/U0-c · 2026-09-15）
//
// **判因**：U0 之前 `src-client/` **一条门禁都没有**。后果不只是"行数无人管"——
//   前端**连语法错误都没有检查**：`lib/client.js` 是 `esbuild` 产物，若 `src-client/` 里写坏一处，
//   在**跑构建之前**没有任何信号。（后端有 `tsc`，前端什么都没有。）
//
// ⚠ **两种模块形态并存**（实测）：
//   · `entry.js` / `vendor.js` —— **ESM**（顶层 `import`）；
//   · `body.js` —— **手写 IIFE + 条件 CJS 导出**（末行 `})();`，内含 `module.exports`）。
//   ⇒ 故**两种模式都试**，任一通过即算可解析；只试一种会**假红**。
//
// 断言：
//   A1 每个 `src-client/*.js` 都能被解析（CJS 或 ESM 任一）；
//   A2 **反例自证**：注入一处语法错误 ⇒ 必须检出（否则本门恒真）。
//
// 退出码：0 = pass · 1 = fail · 3 = skip（src-client 缺席）
import { readdirSync, readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(root, 'src-client')
if (!existsSync(DIR)) { console.log('check-client-syntax: src-client 缺席 ⇒ skip（exit 3）'); process.exit(3) }

let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 用 `node --check` 试解析；返回 true=可解析。两种模块模式都试。 */
function parses(file, asModule) {
  const args = ['--check']
  if (asModule) args.push('--input-type=module')
  args.push(file)
  try { execFileSync(process.execPath, args, { stdio: 'pipe' }); return true } catch { return false }
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort()
console.log(`src-client 解析可读性 · ${files.length} 个文件`)

for (const f of files) {
  const p = join(DIR, f)
  const cjs = parses(p, false)
  const esm = parses(p, true)
  const mode = cjs && esm ? 'CJS/ESM 均可' : cjs ? 'CJS' : esm ? 'ESM' : '**不可解析**'
  ok(cjs || esm, `A1 ${f} 可解析（${mode}）`)
}

// ── A2 反例自证：注入语法错误 ⇒ 必须检出 ──
{
  const tmp = join(tmpdir(), `sc-syntax-selftest-${process.pid}.js`)
  writeFileSync(tmp, 'const a = (1 + \n', 'utf8')
  const bad = parses(tmp, false) || parses(tmp, true)
  try { unlinkSync(tmp) } catch { /* 清理失败不影响判定 */ }
  ok(!bad, 'A2 反例自证：注入语法错误 ⇒ 检出（断言语义有效，非恒真）')
}

// ── A3 与 body.js 的形态声明一致（防"形态变了但门还按旧假设"）──
{
  const body = readFileSync(join(DIR, 'body.js'), 'utf8')
  const isIife = /\}\)\(\);\s*$/.test(body.trimEnd())
  ok(isIife, 'A3 `body.js` 仍是 IIFE 形态（U1/U2 拆分时若改为 ESM，须同步更新本件与方案 U1-7）')
}

// ── A4 **import 必须在模块顶层**（UI1/U1 实测：同一个错犯了两次）──
//   现象：把抽出服务的 `import` 锚在"被抽块的原位置"，而那个位置**在 IIFE 内**
//         ⇒ esbuild 报 `Unexpected "{"`（`import` 语句在函数体里非法）。
//   本断言把它变成机检：**IIFE 起始行之后不得出现顶层 `import`**。
{
  const body = readFileSync(join(DIR, 'body.js'), 'utf8').split(/\r?\n/)
  const iife = body.findIndex((l) => /^\(function \(\) \{/.test(l))
  const stray = iife < 0 ? [] : body.map((l, i) => ({ l, i })).filter((x) => /^\s*import\s/.test(x.l) && x.i > iife)
  ok(stray.length === 0,
    `A4 IIFE（L${iife + 1}）之后无 \`import\`（实际 ${stray.length} 条${stray.length ? '：L' + stray.map((x) => x.i + 1).join(', L') : ''}）`)
  const topImports = iife < 0 ? [] : body.slice(0, iife).filter((l) => l.startsWith('import'))
  console.log(`     顶层 import ${topImports.length} 条：${topImports.map((l) => l.split(' from ')[1] || l).join(' ')}`)
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（src-client 全部可解析；形态声明一致；import 位置合规）')
process.exit(fail ? 1 : 0)
