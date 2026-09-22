#!/usr/bin/env node
// threshold-scan.mjs — 数值阈值**报告态列举器**（不入 CHECKS，依 check-runner.mjs:156 的 recall-diagnose 先例）
//
// 为什么是"列举"而不是"判定"（仓内原则）：
//   `[原则] 模式派生集合先核对` —— 通配/名字推导出的"阈值集合"**只是候选**，须显式列举逐条核对
//   （2026-09-21 隐私红线整改：此处原为**真实记忆库原文**，而 `scripts/` 是公开树；
//    已换为**不引用库文**的转述 —— 原则的指称走指针即可，不必复制正文）。
//   ⇒ 本件**只列举**（exit 恒 0）；把关的是 `check-threshold-registry.mjs`（它消费本件的输出 + 注册表）。
//
// 用法: node scripts/threshold-scan.mjs [--json] [--all]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src')

// 判据名的语义提示词（**显式列举**，不是通配推导）
const NAME_HINT = /(sim|score|ratio|overlap|thresh|band|cold|warm|archive|hot|gate|min|max|factor|alpha|days|hits|k$|r$)/i

// ⚠ **首版规则漏得比抓得多**（2026-09-15 实测自纠）：首版要求「名字含语义提示」**或**「行内含
//   sim|ratio|hits 等词紧跟比较符」，结果 `s >= 0.9` / `inter / union >= 0.66` / `v >= 0.5 && v < 0.66`
//   / `hit / sg.length >= 0.6` / `cardSimilar(...) >= 0.42` **全部漏掉**（变量名是单字母或含括号）。
//   ⇒ 改成**高召回**两条规则（宁可多报，人工核对；这才是"列举器"该有的行为）：
//     A. 与**小数**（digits.digits）比较的行 —— 相似度/占比阈值几乎都是小数
//     B. 带语义名的 `?? N` / `|| N` / `= N` 默认值 —— 天数/计数/上限类阈值
const RULE_A = /(?:>=|<=|>|<|===|!==)\s*\d+\.\d+/
const RULE_B = /(?:\?\?|\|\||=)\s*-?\d+(?:\.\d+)?\b/

const files = []
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (e.endsWith('.ts') && !e.endsWith('.generated.ts') && !e.endsWith('.d.ts')) files.push(p)
  }
}
walk(SRC)

const hits = []
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/)
  lines.forEach((l, i) => {
    const t = l.trim()
    if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    const ruleA = RULE_A.test(t)
    const decl = t.match(/^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)/)
    const ruleB = RULE_B.test(t) && (decl ? NAME_HINT.test(decl[1]) : NAME_HINT.test(t))
    if (!ruleA && !ruleB) return
    const nums = t.match(/-?\d+(?:\.\d+)?/g) || []
    hits.push({ file: relative(root, f).replace(/\\/g, '/'), line: i + 1, rule: ruleA ? 'A' : 'B', nums: nums.slice(0, 4), name: decl ? decl[1] : '(inline)', snippet: t.slice(0, 110) })
  })
}

if (process.argv.includes('--json')) { console.log(JSON.stringify(hits, null, 2)); process.exit(0) }
console.log(`numercial-threshold candidates: ${hits.length}（**候选**，须逐条人工核对后方可当全集）`)
const byFile = {}
for (const h of hits) (byFile[h.file] = byFile[h.file] || []).push(h)
for (const [f, arr] of Object.entries(byFile).sort()) {
  console.log(`\n${f}  (${arr.length})`)
  for (const h of arr) console.log(`  L${h.line}  [${h.name}]  ${h.nums.join(',')}  | ${h.snippet}`)
}
