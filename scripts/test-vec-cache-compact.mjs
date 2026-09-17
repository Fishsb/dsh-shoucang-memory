#!/usr/bin/env node
/**
 * test-vec-cache-compact.mjs — 向量缓存**压缩等价性**测试（D-M5 后半段 · 2026-09-17）
 *
 * 判据核心是**等价**，不是"跑一遍没报错"：
 *   `loadCache`（src/vec.ts）按**行序** `Map.set` ⇒ 同键**后写覆盖先写**。
 *   故"每键保留**最后一次**写入"的压缩，与压缩前的内存态**逐键相同**。
 *   本件用同一套 `load()` 模拟对压缩前后各建一次映射，断言逐键相等。
 *
 * ⚠ **反例自证**（判据 ⑤）：若把 `planVecCompaction` 误实现成"保留第一次"，
 *   两套映射会在**内容不同的同键行**上分叉 —— 本件断言该分叉数 > 0，
 *   即"反例确实会被这条判据抓住"，而不是一条恒真的断言。
 */
import { planVecCompaction } from '../lib/vec.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`) } else { fail++; console.error(`  ❌ ${m}`) } }

const mk = (file, hash, model, tag) => JSON.stringify({ file, line: 'L-' + tag, hash, vec: [1, 2, 3], model, baseUrl: 'u' })
const keyOf = (o) => `${o.file}|${o.hash}|${o.model}|${o.baseUrl}`
/** 模拟 `loadCache`：按行序 set ⇒ last-wins */
const load = (lines) => {
  const m = new Map()
  for (const l of lines) { if (!l.trim()) continue; try { const o = JSON.parse(l); m.set(keyOf(o), o.line) } catch { /* 跳过 */ } }
  return m
}

// ── 构造：3 个键，其中 2 个有内容不同的重复行 + 1 行坏行 + 1 空行 ──
const A1 = mk('a.md', 1, 'm', 'a1'), A2 = mk('a.md', 1, 'm', 'a2'), A3 = mk('a.md', 1, 'm', 'a3')
const B1 = mk('b.md', 2, 'm', 'b1'), B2 = mk('b.md', 2, 'm', 'b2')
const C1 = mk('c.md', 3, 'm', 'c1')
const lines = [A1, B1, 'not-json', A2, C1, B2, A3, '']

const before = load(lines)
const kept = planVecCompaction(lines, 1e9)
const after = load(kept)

ok(before.size === 3 && after.size === 3, `① 去重后键数不变（前 ${before.size} / 后 ${after.size}）`)
ok([...before.keys()].every((k) => after.get(k) === before.get(k)),
  '② **等价**：压缩前后内存态**逐键相同**（保留每键最后一次写入）')
ok(kept.length === 3, `③ 死行被清掉（${lines.filter((l) => l.trim()).length} 非空行 → ${kept.length} 行）`)
ok(!kept.includes('not-json'), '④ 坏行被丢弃（loadCache 本来也进不了内存态）')

// ── ⑤ 反例自证：first-wins 会分叉 ──
const firstWins = new Map()
for (const l of lines) { if (!l.trim()) continue; try { const o = JSON.parse(l); if (!firstWins.has(keyOf(o))) firstWins.set(keyOf(o), o.line) } catch { /* */ } }
const diverge = [...before.keys()].filter((k) => firstWins.get(k) !== before.get(k)).length
ok(diverge > 0, `⑤ 反例自证：**first-wins** 与真语义在 ${diverge} 个键上分叉 ⇒ 误实现为"保留第一次"时 ② 必红`)

// ── ⑥⑦ 超限截断：保留最近的 ──
const many = []
for (let i = 0; i < 100; i++) many.push(mk('f.md', i, 'm', 'x'.repeat(60) + i))
const capped = planVecCompaction(many, 3000)
const idxs = capped.map((l) => JSON.parse(l).hash)
ok(capped.length > 0 && capped.length < 100, `⑥ 超 cap ⇒ 截断（100 → ${capped.length} 行）`)
ok(Math.min(...idxs) > 0, `⑦ 丢的是**最旧的**（保留的最小 hash = ${Math.min(...idxs)} > 0）`)

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
