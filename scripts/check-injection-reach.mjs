#!/usr/bin/env node
// check-injection-reach.mjs —「模块输出**是否抵达注入文本**」正面断言（S4-9 · 2026-09-14）
//
// 判因（G10）：`check-arch-sync` 的"接线"口径只要求**被 import 且被调用过**，**不要求输出真的进注入面**。
//   实测假绿：`supply-assembly` 被记为「已接线（P0a）」，而它在 `src/` 内唯一消费者是
//   `panel-shared.ts` 的 `supplyUsageMeta` —— 其产出 `kept`/`dropped`/`blocks.stable|dynamic|oneshot`
//   **只进 `/inject/stats` 诊断**，只有 `blocks.situation` 进注入面。
//   ⇒ **「接线」与「抵达」是两件事**；本仓所有架构门都是"负面约束"（不许有环/不许超行数），
//     缺一条**正面**断言问"这东西的输出到底有没有到用户眼前"。
//
// 本件把「抵达」写成可机检的申报 + 三条断言：
//   ② 申报的模块真实存在；
//   ③ 申报 `full` 者，其符号必须出现在**注入文本构造函数** `buildHotMemoryText` 体内；
//   ④ **专项锁**：注入文本当前**只并入 `situation` 块** —— 把 `supply-assembly` 的 `partial` 现状钉住，
//      任何"装配器接管主路径"的改动都会在此翻红，提醒同步本表与验收。
//
// 反例自证：把 `finalText` 改为并入装配器的其他输出（模拟接管），④ 必须红；还原则绿。
//
// 用法: node scripts/check-injection-reach.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }

/**
 * 抵达申报表：模块 → 代表符号 → 抵达程度。
 *   `full`    产物**直接进注入文本**
 *   `partial` 部分进 / 或只作**输入**（自身不产生文本）
 *   `none`    不进注入面（诊断、或只影响"是否注入"）
 * **改这份表必须同步改代码注释与验收记录** —— 它是"输出到底到没到用户眼前"的唯一账。
 */
const REACH = [
  { module: 'injection-playbook', symbol: 'MEMORY_PLAYBOOK_LINES', reaches: 'full', path: 'panel-shared#buildHotMemoryText → sl（stable 段）' },
  { module: 'ring-supply', symbol: 'createRingSupplyApi', reaches: 'full', path: 'panel-shared#situationLinesOf（**经调用间接抵达**）→ situationBlock → finalText' },
  { module: 'supply-assembly', symbol: 'budgetOf', reaches: 'partial', path: 'panel-shared#buildHotMemoryText → 三层额度（**决定裁多少**，不产生文本）', note: 'S4-1：口径统一的单一实现；它影响的是"哪些行进得来"，不是"文本长什么样"' },
  { module: 'supply-assembly', symbol: 'assembleSupply', reaches: 'partial', path: 'supplyUsageMeta → usage（**仅诊断**）+ blocks.situation（注入）', note: '核心输出 kept/dropped/blocks.stable|dynamic|oneshot **不进注入面** —— 本件存在理由即此（原被记为"已接线"）' },
  { module: 'situation-key', symbol: 'cuesOf', reaches: 'partial', path: '提供情境线索（**输入**），自身不产生注入文本' },
  { module: 'vec', symbol: 'recallRanked', reaches: 'partial', path: '提供候选行（**输入**），经调用方渲染后才成文本' },
  { module: 'supply-ledger', symbol: 'rowFingerprint', reaches: 'none', path: '只决定"本会话是否已注入过"（**影响**注入，不产生文本）' },
  { module: 'content-types', symbol: 'createContentTypesApi', reaches: 'none', path: '仅供 `/content-types` 只读端点（面板诊断）' },
]

const shared = read('src/panel-shared.ts')
/** 注入文本的构造函数体（判定基准）：从 `function buildHotMemoryText(` 到下一个顶层 `function` */
const body = (() => {
  const i = shared.indexOf('function buildHotMemoryText(')
  if (i < 0) return ''
  const rest = shared.slice(i)
  const j = rest.indexOf('\nfunction ', 10)
  return j > 0 ? rest.slice(0, j) : rest
})()

console.log('注入抵达面（S4-9 正面断言）')
ok(body.length > 0, '① 找到注入文本构造函数 `buildHotMemoryText`（判定基准；找不到即无法判定任何"抵达"）')

const missingMod = REACH.filter((r) => !existsSync(join(root, 'src', `${r.module}.ts`))).map((r) => r.module)
ok(missingMod.length === 0, `② 申报的模块都在 src/（缺：${missingMod.join(', ') || '无'}）`)

const fulls = REACH.filter((r) => r.reaches === 'full')
const notInFile = fulls.filter((r) => !shared.includes(r.symbol)).map((r) => `${r.module}#${r.symbol}`)
ok(notInFile.length === 0, `③ 申报 full 者，符号确实出现在**注入面构造文件**（panel-shared.ts）内（缺：${notInFile.join(', ') || '无'}）`)
// 直接 vs 间接：不在 `buildHotMemoryText` 直体内者为"经调用间接抵达"—— **可见化**，不判失败
//   （例：`createRingSupplyApi` 在 `situationLinesOf` 内被调用，而后者被本函数调用）
const indirect = fulls.filter((r) => !body.includes(r.symbol)).map((r) => `${r.module}#${r.symbol}`)
if (indirect.length) console.log(`   · 其中**经调用间接抵达**（不在 buildHotMemoryText 直体内）：${indirect.join(', ')}`)

// ④ 专项锁：注入文本只并入 `situation` 块（钉住 supply-assembly 的 partial 现状）
const situationOnly = /const finalText = shadow\.situationBlock \? `\$\{text\}\\n\\n\$\{shadow\.situationBlock\}` : text/.test(shared)
ok(situationOnly, '④ 注入文本**只并入 situation 块**（`supply-assembly` 的 partial 现状被钉住；"装配器接管主路径"会在此翻红）')

/* ══ ⑤⑥ **深睡 prompt 材料抵达面**（H-1 根因修 · 2026-09-15）══════════════
 * 判因（实测）：prompt 的 P5 段写着「**材料若给出待回收的裁决**…就填 `outcomes[]`」，
 *   而 `gatherMaterials` **从未产出**该段 ⇒ 条件永不成立 ⇒ `outcomes` **结构性恒 0**
 *   （库内 49 条待回收裁决、历史只收过 1 条）。本仓有 `check-injection-reach` 守**注入文本**的抵达面，
 *   却**没有**守「**prompt 依赖的材料段是否真的产出并被拼接**」—— 这就是它能潜伏的结构性原因。
 * ⇒ 补两条**正面**断言（与既有 ③④ 同一风格，**不新开文件**）：
 *   ⑤ userInput 里引用的每个 `M.<key>` 都必须由 `gatherMaterials` 产出（**用了但没产出 = 假绿**）；
 *   ⑥ **通道锁**：prompt 声明的 P5 `outcomes` 通道，必须有材料段背书 **且** 已拼进 userInput。 */
const runSrc = read('src/deepsleep-run.ts')
const matSrc = read('src/deepsleep-materials.ts')
const coreSrc = read('src/deepsleep-core.ts')
/** 产出集：`gatherMaterials` 的 `return { … }` 里的键（**含 `counts`** —— 它也被 userInput 侧用于审计）
 *  ⚠ 解析要点（首版踩过）：`return {` 行**开头的 `{`** 必须剥掉，否则首个键被当作非法标识符丢弃；
 *    且 `counts: {…}` 是**嵌套对象**，需在它处**止步**（否则内层键会污染产出集）。 */
const produced = (() => {
  const lines = matSrc.split('\n')
  const i = lines.findIndex((l) => /^\s*return \{/.test(l))
  if (i < 0) return new Set()
  const set = new Set()
  for (let k = i; k < lines.length; k++) {
    const t = lines[k].replace(/\/\/.*$/, '').trim()
    if (k > i && /^counts\s*:/.test(t)) { set.add('counts'); break }
    if (/^\}/.test(t)) break
    for (const tok of t.replace(/^return\s*\{/, '').split(',')) {
      const x = tok.trim()
      if (/^[A-Za-z_$][\w$]*$/.test(x)) set.add(x)
    }
  }
  return set
})()
/** 使用集：`deepsleep-run.ts` 里出现的 `M.<key>` */
const used = new Set([...runSrc.matchAll(/\bM\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
const missingKeys = [...used].filter((k) => !produced.has(k))
ok(missingKeys.length === 0, `⑤ 深睡 userInput 引用的材料键**全部由 gatherMaterials 产出**（产出 ${produced.size} 键 · 引用 ${used.size} 键 · 缺：${missingKeys.join(', ') || '无'}）`)
const unusedKeys = [...produced].filter((k) => !used.has(k))
if (unusedKeys.length) console.log(`   · 产出但未被 userInput 引用（可见化，不判红）：${unusedKeys.join(', ')}`)
const declaresOutcomes = /outcomes/.test(coreSrc.slice(coreSrc.indexOf('P5'), coreSrc.indexOf('P5') + 400))
ok(!declaresOutcomes || (produced.has('pendingDecisions') && used.has('pendingDecisions')),
  `⑥ 通道锁：prompt 声明的 P5 \`outcomes\` 通道**有材料背书且已拼接**（材料段=${produced.has('pendingDecisions')} · 拼接=${used.has('pendingDecisions')}）`)

console.log('')
console.log('📋 抵达面申报（**不静默**：partial/none 逐条写明理由）：')
for (const r of REACH) console.log(`   · ${r.reaches.padEnd(7)} ${r.module}#${r.symbol} —— ${r.path}`)
const part = REACH.filter((r) => r.reaches !== 'full').length
console.log(`   合计 ${REACH.length} 项：full ${REACH.length - part} · partial/none ${part}`)

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（注入抵达面断言全过）')
process.exit(fail ? 1 : 0)
