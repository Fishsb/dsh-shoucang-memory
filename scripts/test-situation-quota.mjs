#!/usr/bin/env node
// test-situation-quota.mjs — S4-5「情境槽额度自适应」断言（2026-09-14 · S4 消费链条）
//
// 守什么：`adaptiveTopN` 由**活体环记录数**派生 `topN`，且三条纪律成立 ——
//   ① **只数环记录**（`file === ''` 且属已登记的非 none 环）：md 投影行不得计入，
//      否则"库大"会被内容面行数虚增，额度跟着虚涨；
//   ② **次线性 + 双向钳位**：小库零变化（下限 3）、大库不撑爆注入面（上限 12）；
//   ③ **可回滚**：`adaptive=false` ⇒ 精确回到固定 `topN`（缺省行为）。
//
// 判因：此前 `topN` 固定 3，而实测库内环记录 **105 条** ⇒ 命中率天花板 ≈3%（105 抢 3 个位置）——
//   "库越大，经历面越稀释"。本项把额度与库规模挂钩。
//
// 用法: node scripts/test-situation-quota.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/ring-supply.js', import.meta.url).href)
const { adaptiveTopN } = mod
if (typeof adaptiveTopN !== 'function') {
  console.log('❌ lib/ring-supply.js 未导出 adaptiveTopN（先 npm run build:host）')
  process.exit(1)
}

console.log('S4-5 情境槽额度自适应')

// ── 夹具：造 N 条环记录 + M 条 md 投影行 ──
const mk = (ringN, mdN = 0) => [
  ...Array.from({ length: ringN }, (_, i) => ({ file: '', kind: 'decision', id: `r${i}`, text: `t${i}` })),
  ...Array.from({ length: mdN }, (_, i) => ({ file: 'MEMORY.md', kind: 'fact', id: `m${i}`, text: `m${i}` })),
]

// ── ① 派生按 √N ──
ok(adaptiveTopN(mk(105)) === 11, `① N=105 ⇒ 11（实测库内环记录数；实际 ${adaptiveTopN(mk(105))}）—— 原固定值为 3，提升 ≈3.7 倍`)
ok(adaptiveTopN(mk(9)) === 3, '① N=9 ⇒ 3（√9=3，恰在下限）')
ok(adaptiveTopN(mk(100)) === 10, '① N=100 ⇒ 10（√100=10）')
ok(adaptiveTopN(mk(4)) === 3, '① N=4 ⇒ 3（√4=2 但下限 3 —— 小库零变化）')

// ── ② 双向钳位 ──
ok(adaptiveTopN(mk(1)) === 3 && adaptiveTopN(mk(0)) === 3, '② 空库/极小库 ⇒ 下限 3（与原行为一致）')
ok(adaptiveTopN(mk(1000)) === 12 && adaptiveTopN(mk(100000)) === 12, '② 极大库 ⇒ 上限 12（**不撑爆注入面**）')

// ── ③ **只数环记录**：md 投影行不得计入 ──
ok(adaptiveTopN(mk(105, 1000)) === adaptiveTopN(mk(105)), '③ 1000 条 md 投影行**不影响**额度（只数 file==="" 的环记录）')
ok(adaptiveTopN(mk(0, 5000)) === 3, '③ 只有 md 行、无环记录 ⇒ 回落下限 3（经历面本就无内容）')
// 非环 kind（如 persona/prose）虽 file='' 也不计
{
  const weird = [{ file: '', kind: 'prose', id: 'x', text: 'x' }, { file: '', kind: 'persona', id: 'y', text: 'y' }]
  ok(adaptiveTopN(weird) === 3, '③ `file=""` 但 kind **不属已登记环** ⇒ 不计入（用 ringOfKind 判环，非只判 file）')
}

// ── ④ 回滚：adaptive=false ⇒ 精确回到固定值 ──
ok(adaptiveTopN(mk(105), 3, false) === 3, '④ `adaptive=false` ⇒ 回到固定 3（回滚通道）')
ok(adaptiveTopN(mk(105), 7, false) === 7, '④ `adaptive=false` 且注册表 topN=7 ⇒ 精确用 7（尊重显式配置）')
ok(adaptiveTopN(mk(105), 7, true) === 11, '④ `adaptive=true` 时注册表 topN 仅作**下限兜底**（7 < 11 ⇒ 用派生值 11）')

// ── ⑤ 反例自证：若把"只数环记录"写成"数全部记录"，结果必然不同 ──
{
  const wrong = (recs) => Math.max(3, Math.min(12, Math.ceil(Math.sqrt(recs.length))))
  ok(wrong(mk(105, 1000)) !== adaptiveTopN(mk(105, 1000)), '⑤ 反例自证：把 md 行也数进去 ⇒ 额度被虚增到 12（本断言②③语义有效，非恒真）')
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（情境槽额度自适应断言全过）')
process.exit(fail ? 1 : 0)
