#!/usr/bin/env node
// check-shared-fn.mjs —「共享纯函数不得多模块复制」门（S4Z · 2026-09-14）
//
// **判因（结构性缺陷 · 由"补丁 vs 真修"审查发现）**：
//   仓内铁律是「**同一事实不得有第二份实现**」（`ring-commit.ts` 原话）。但实测有三对复制：
//     · `coreName`    —— `treeops` 与 `deepsleep-tree` 各一份（正则字面相同、各自手写）
//     · `biContains`  —— 同上（成对复制）
//     · `dayKey`      —— `activity` 与 `deepsleep-materials` 各一份
//   **根因不是"某人偷懒"**，而是**导出边界**：`biContains` 在 `treeops` 里是 **私有 `const`**、
//   `dayKey` 在 `activity` 里是 **私有 `function`** ⇒ 需要它们的模块**只能复制一份**。
//   ⇒ 真修 = **导出 + 消除副本**（不是"再抄一份对齐"）；本门是它的另一半 ——
//     让**第四处**不可能再悄悄出现（复制是静默的，没有任何门会红）。
//
// 断言：
//   A1 表中每个共享符号，在 `src/` 中**只在声明模块内有定义**（其余文件只能 `import`）；
//   A2 声明模块**确实导出**了它（否则别人无法复用 ⇒ 又会被迫复制）；
//   A3 **反例自证**：注入一处伪造的"副本定义" ⇒ 本门必须检出（否则断言恒真）。
//
// 用法: node scripts/check-shared-fn.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 共享纯函数表：符号 → 唯一声明模块（**新增共享件时在此登记**） */
const SHARED = [
  { name: 'coreName', home: 'treeops.ts' },
  { name: 'biContains', home: 'treeops.ts' },
  { name: 'dayKey', home: 'activity.ts' },
  { name: 'sectionExists', home: 'forgetops.ts' },
  { name: 'renderSupplyText', home: 'supply-assembly.ts' },
  { name: 'budgetOf', home: 'supply-assembly.ts' },
  { name: 'clampLines', home: 'supply-assembly.ts' },
  { name: 'scanIndexRows', home: 'targets.ts' },
  { name: 'isRealUserEvent', home: 'targets.ts' },
]

const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && f !== 'criteria.generated.ts')

/** 某文件里是否**定义**了该名（`function N(` / `const N =` / `class N`）——不含 import 行 */
const defines = (text, name) => {
  const re = new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`, 'm')
  return re.test(text.split('\n').filter((l) => !/^\s*import\b/.test(l)).join('\n'))
}

console.log('共享纯函数单一实现（防静默复制）')

const texts = new Map(files.map((f) => [f, readFileSync(join(SRC, f), 'utf8')]))

for (const s of SHARED) {
  const owners = files.filter((f) => defines(texts.get(f), s.name))
  ok(owners.length === 1 && owners[0] === s.home,
    `A1 \`${s.name}\` 只在 \`${s.home}\` 定义（实际：${owners.join(', ') || '无'}）`)
  const homeText = texts.get(s.home) || ''
  ok(new RegExp(`^export\\s+(?:async\\s+)?(?:function|const)\\s+${s.name}\\b`, 'm').test(homeText),
    `A2 \`${s.home}\` **确实导出** \`${s.name}\`（未导出 ⇒ 别人只能复制，正是本缺陷的根因）`)
}

// ── A3 反例自证：伪造一处副本 ⇒ 必须检出 ──
{
  const fake = new Map(texts)
  fake.set('deepsleep-tree.ts', (fake.get('deepsleep-tree.ts') || '') + '\nexport const coreName = (t: string): string => t\n')
  const owners = files.filter((f) => defines(fake.get(f), 'coreName'))
  ok(owners.length > 1, `A3 反例自证：注入副本 ⇒ 检出多定义（${owners.join(', ')}）—— 断言语义有效，非恒真`)
  ok(defines('import { coreName } from "./treeops.js"', 'coreName') === false, 'A3 反例自证：`import` 行**不算定义**（不误伤正解）')
}

console.log(fail ? `\nFAIL（${fail} 项）` : `\nPASS（共享纯函数单一实现门全过 · ${SHARED.length} 个符号）`)
process.exit(fail ? 1 : 0)
