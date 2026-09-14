#!/usr/bin/env node
// audit-impl-drift.mjs —「同一语义多处实现」**发现器**（报告态 · S4Z · 2026-09-14）
//
// **判据**（由"补丁 vs 真修"审查提炼）：
//   **同一语义在多处各自实现 ⇒ 必然漂移。**
//   两个实证：① `treeops` 的 level 口径 **4 处手写**（merge 漏了 ⇒ 已落盘的树结构破坏，G-22）；
//             ② `coreName`/`biContains`/`dayKey` **3 对静默复制**（根因是导出边界：私有 ⇒ 用方只能复制）。
//
// **本件不判 FAIL** —— 同名/同源**可能是有意的**（不同模块各自的私有辅助，如 `mk`/`hooks`/`log`），
//   当门禁会产生大量误报并最终被静音。故它是**发现器**：给人看、供决策。
//   对**已知必须单一**的符号集，另有硬门 `scripts/check-shared-fn.mjs`（登记表 + 反例自证）。
//
// 三类信号：
//   A **同名函数多处定义**（跨模块）—— 疑似复制
//   B **「与 X 同口径/同源」声明，但本文件并未 import X** —— **高置信复制**（注释自己供出）
//   C 同名且有定义、但**函数体起始不同** —— 待人工核（可能是"同名不同义" ⇒ 建议改名）
//
// 用法: node scripts/audit-impl-drift.mjs [--json] [--top N]
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src')
const AS_JSON = process.argv.includes('--json')

const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && f !== 'criteria.generated.ts')
const texts = new Map(files.map((f) => [f, readFileSync(join(SRC, f), 'utf8')]))

/** 定义提取：**只取模块级**（行首无缩进）—— 函数内的 `const out = …` 不是"同一语义的实现"，
 *  否则同名噪音会淹没真信号（首版实测：275 个"同名"里绝大多数是局部变量）。跳过 import 与注释行。 */
function defs(text) {
  const out = new Map()
  for (const raw of text.split('\n')) {
    if (/^\s*(?:\/\/|\*|\/\*)/.test(raw)) continue
    if (/^import\b/.test(raw)) continue
    const m = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/.exec(raw)
    if (m) if (!out.has(m[1])) out.set(m[1], raw.trim().slice(0, 140))
  }
  return out
}

const perFile = new Map(files.map((f) => [f, defs(texts.get(f))]))
const byName = new Map()
for (const [f, d] of perFile) for (const [n, body] of d) {
  if (!byName.has(n)) byName.set(n, [])
  byName.get(n).push({ file: f, body })
}

// ── A / C：同名多处定义 ──
const dupNames = [...byName.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length)
const sameBody = dupNames.filter(([, v]) => new Set(v.map((x) => x.body)).size === 1)
const diffBody = dupNames.filter(([, v]) => new Set(v.map((x) => x.body)).size > 1)

// ── B：「与 X 同源/同口径」声明但未 import X ──
/** 从注释里抠出"与 <X> 同口径/同源/一致"的 X（形如 `mod` / `mod.ts` / `mod#fn` / `mod.fn`） */
const SRC_CLAIM = /与\s*`?([A-Za-z][\w.-]*(?:\.ts)?)(?:#[\w$]+)?`?\s*(?:同口径|同源|保持一致|一致)/g
const claimMisses = []
for (const [f, text] of texts) {
  const imports = [...text.matchAll(/^\s*import\s[^'"]*['"]\.\/([\w.-]+)\.js['"]/gm)].map((m) => m[1])
  const seen = new Set()
  for (const m of text.matchAll(SRC_CLAIM)) {
    const mod = String(m[1]).replace(/\.ts$/, '')
    if (mod === f.replace(/\.ts$/, '') || seen.has(mod)) continue
    seen.add(mod)
    if (!files.includes(`${mod}.ts`)) continue // 指向非模块（如外部脚本）⇒ 交给人工
    if (!imports.includes(mod)) claimMisses.push({ file: f, claims: mod, line: text.slice(0, m.index).split('\n').length })
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ dupNames: dupNames.map(([n, v]) => ({ name: n, files: v.map((x) => x.file) })), claimMisses }, null, 2))
  process.exit(0)
}

console.log('同一语义多处实现 —— 发现器（报告态，不判失败）')
console.log(`  扫描 ${files.length} 个模块\n`)

console.log(`【A】同名函数多处定义：${dupNames.length} 个`)
for (const [n, v] of dupNames.slice(0, Number(process.env.TOP || 12))) {
  console.log(`   · ${n.padEnd(22)} ${v.length} 处：${v.map((x) => x.file).join(', ')}`)
}
console.log('')
console.log(`【B】「与 X 同源/同口径」声明但**未 import X**：${claimMisses.length} 处  ← 高置信复制（注释自供）`)
for (const c of claimMisses) console.log(`   · ${c.file}:${c.line} 声称与 \`${c.claims}\` 同源，但本文件没有 import 它`)
console.log('')
console.log(`【C】同名且**实现不同**：${diffBody.length} 个  ← 待人工核（可能同名不同义 ⇒ 建议改名）`)
for (const [n, v] of diffBody.slice(0, Number(process.env.TOP || 12))) {
  console.log(`   · ${n.padEnd(22)} ${v.map((x) => x.file).join(' vs ')}`)
}
console.log('')
console.log(`【D】同名且**实现逐字相同**：${sameBody.length} 个  ← 最像"复制粘贴"，优先收敛`)
for (const [n, v] of sameBody.slice(0, Number(process.env.TOP || 12))) {
  console.log(`   · ${n.padEnd(22)} ${v.map((x) => x.file).join(' = ')}`)
}
console.log('')
console.log('建议：D（逐字相同）优先收敛到单一实现；B 逐条核实是否真复制；C 判断是否有意同名（否则改名）。')
console.log('对**已知必须单一**的符号，请登记进 `scripts/check-shared-fn.mjs`（硬门 + 反例自证）。')
