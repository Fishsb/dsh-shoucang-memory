#!/usr/bin/env node
/**
 * 包装函数排除规则的反向证伪（P0-2 · 2026-09-13）
 *
 * 目的：包装函数规则必须**真实可靠**，不是「在 body.js 上跑出来看着对」——
 *   三版规则迭代中被这个证伪集连续抓出问题（详见 deliverables/ui-implementation-plan-2026-09-13.md §2 P0-2）。
 *
 * 方法：把若干 JS 片段写到系统临时目录（不污染项目），用 audit-fnspan.mjs --dir 扫它，
 *   断言输出中的债务计数与预期完全一致。每条用例针对一个**已知想绕过的途径**。
 *
 * 用例设计原则：
 *   ① 真大函数必须被判为债务（防漏报 —— 假阴性比假阳性危险）
 *   ② 模块封装层（IIFE + cordis factory）必须被排除（防误伤真债务）
 *   ③ 改名字、改形态都不能绕过（防脆弱收口）
 *   ④ 反向激励：把大函数塞进大闭包不能让指标变好看（防塞闭包）
 *   ⑤ 纯 ESM（无 IIFE 包装）不受影响（防误伤正常代码）
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

const pad = (n) => Array.from({ length: n }, (_, i) => '  var v' + i + ' = ' + i + ';').join('\n')
/* 注意点：JS 字符串必须**换行分布**，不能把多个 function 塞进同一行，
 * 否则 AST getStart() 都返回 line 1、getEnd() 都返回最后一行 —— 所有函数跨度都是「文件全长」，
 * 包装函数排除规则的全部判据都被短路成「同一个长函数」，无法区分真债务与包装。
 * 这里把每个 function 的开括号 `{` 单独成行 ⇒ 它们的 lineOfStart 各不相同。 */

/** 写一个 JS 文件 + 跑 audit-fnspan --client --dir <dir> --top 100 + parse 数字 */
function scanOne (label, js, expectDebt) {
  const dir = mkdtempSync(join(tmpdir(), 'sc-wrap-'))
  const f = join(dir, 'probe.js')
  writeFileSync(f, js, 'utf8')
  let out = ''
  try {
    out = execFileSync(process.execPath, [
      'scripts/audit-fnspan.mjs', '--client', '--dir', dir, '--top', '100', '--soft', '400'
    ], { encoding: 'utf8' })
  } catch (e) {
    /* 非零退出码也带回输出 */
    out = (e.stdout || '') + (e.stderr || '')
  }
  // 提取 "> 400 行的函数: N"
  const m = out.match(/>\s*400\s*行的函数:\s*(\d+)/)
  const got = m ? Number(m[1]) : (() => { console.log('--- 实际输出 ---\n' + out + '----------------'); return -1 })()
  const ok_ = got === expectDebt
  ;(ok_ ? ok : bad)(`${label.padEnd(40)} → 债务 ${got}（期望 ${expectDebt}）`)
  rmSync(dir, { recursive: true, force: true })
  return ok_
}

console.log('包装函数排除规则 · 7 个反向证伪用例')
console.log('─'.repeat(78))

// ① 基线：IIFE + 500 行函数 → 应判 1 个债务
scanOne('① IIFE + 500 行函数（基线，应判 1）',
  '__ModuleLoader__ = {\n  load: function(c) {\n    c.factory(function() {\n      function bigOne(a) {\n' + pad(496) + '\n        return a;\n      }\n      return { bigOne };\n    });\n  }\n};\n', 1)

// ② 包装函数改名（bootstrap / createPanel）→ 应判 1 个
scanOne('② 包装改名（仍应判 1）',
  '__ModuleLoader__ = {\n  load: function(c) {\n    c.factory(function() {\n      function bigOne(a) {\n' + pad(496) + '\n        return a;\n      }\n      return { bigOne };\n    });\n  }\n};\nvar bootstrap = function() {};\nvar createPanel = function() {};\n', 1)

// ③ 大函数改名（renderSomethingElse）→ 应判 1 个（名字识别不到，但仍是真债务）
scanOne('③ 大函数改名（仍应判 1）',
  '__ModuleLoader__ = {\n  load: function(c) {\n    c.factory(function() {\n      function renderSomethingElse(a) {\n' + pad(496) + '\n        return a;\n      }\n      return { renderSomethingElse };\n    });\n  }\n};\n', 1)

// ④ 大函数拆成 3 个小函数 → 应判 0 个（改善可度量）
scanOne('④ 大函数拆 3 个（应判 0）',
  '__ModuleLoader__ = {\n  load: function(c) {\n    c.factory(function() {\n      function p1(a) {\n' + pad(160) + '\n        return a;\n      }\n      function p2(a) {\n' + pad(160) + '\n        return a;\n      }\n      function p3(a) {\n' + pad(160) + '\n        return a;\n      }\n      return { p1, p2, p3 };\n    });\n  }\n};\n', 0)

// ⑤ 反向激励：3 个 500 行函数塞进大闭包 → 应判 3 个（防「塞闭包指标变好看」）
scanOne('⑤ 3 个 500 行塞进闭包（应判 3）',
  '__ModuleLoader__ = {\n  load: function(c) {\n    c.factory(function() {\n      function b1(a) {\n' + pad(496) + '\n        return a;\n      }\n      function b2(a) {\n' + pad(496) + '\n        return a;\n      }\n      function b3(a) {\n' + pad(496) + '\n        return a;\n      }\n      return { b1, b2, b3 };\n    });\n  }\n};\n', 3)

// ⑥ 纯 ESM 无包装：1 个 500 行导出函数 → 应判 1 个（深度 1 但非包装形态）
scanOne('⑥ 纯 ESM 500 行导出（应判 1）',
  'export function bigExport(a) {\n' + pad(496) + '\n  return a;\n}\n', 1)

// ⑦ 纯 ESM 拆分 → 应判 0 个（无包装 + 函数不大）
scanOne('⑦ 纯 ESM 拆分（应判 0）',
  'export function p1(a) {\n' + pad(160) + '\n  return a;\n}\nexport function p2(a) {\n' + pad(160) + '\n  return a;\n}\n', 0)

console.log('─'.repeat(78))
console.log('反向证伪：' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail ? 1 : 0)