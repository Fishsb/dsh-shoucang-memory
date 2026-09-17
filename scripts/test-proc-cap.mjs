#!/usr/bin/env node
/**
 * test-proc-cap.mjs — 子进程输出**封顶**的行为测试（圆桌会审 M4 · 2026-09-17）
 *
 * **为什么用纯逻辑测，而不是真 spawn 一个 20MB 子进程**：
 *   本会话实测 —— pwsh 沙箱下 node 的**异步**管道 stdout **不回传**（`spawn` / `execFile` 的 `'data'`
 *   事件拿不到数据；**显式 `stdio:'pipe'` 亦然**；而 `execFileSync` / `spawnSync` 走另一条路所以能通）。
 *   ⇒ "真起一个吐 20MB 的子进程"这类测试在本环境**测不了**。这是**沙箱边界，不是代码缺陷**。
 *   故把封顶逻辑抽成纯函数 `proc-async#makeCappedSink`（三处共用一份实现），
 *   用**真 20MB 字符串**直接喂它，判据落在**行为**上 —— 这正是 M4 要的那条"输出被真正截断"的证据。
 *
 * 判据（每条可机检；②③④ 是 M4 的正面判据，⑤ 是**反例自证**）：
 *   ① 未超限 ⇒ 与朴素拼接**逐字符相同**（不引入行为变化）
 *   ② 超限 ⇒ 返回值长度**恰为 cap**（真截断）
 *   ③ 超限回调**只触发一次**（它负责 kill 子进程，重复触发无意义）
 *   ④ 超限之后的 chunk **全部丢失**（缓冲不再增长）
 *   ⑤ 反例自证：cap 放大到 64MB ⇒ 同样喂 20MB **不触发**、长度 = 20MB
 *      ⇒ 证明"②的截断来自 cap 本身"，而不是别的什么把它截断了
 *   ⑥ 边界：**正好等于 cap 不触发**，多 1 字节即触发
 */
import { makeCappedSink } from '../lib/proc-async.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`) } else { fail++; console.error(`  ❌ ${m}`) } }

const CAP = 8 * 1024 * 1024
const chunkOf = (n) => 'A'.repeat(n)

// ① 未超限 ⇒ 与朴素拼接等价
{
  let calls = 0
  const s = makeCappedSink(CAP, () => { calls++ })
  let got = ''
  for (let i = 0; i < 20; i++) got = s.push(got, chunkOf(1000))
  ok(got === chunkOf(20000) && !s.overflowed() && calls === 0,
    `① 未超限：累积 ${got.length} B 与朴素拼接逐字符相同、回调未触发`)
}

// ②③④ 超限（真 20MB，分 20 块）
{
  let calls = 0
  const s = makeCappedSink(CAP, () => { calls++ })
  let got = ''
  for (let i = 0; i < 20; i++) got = s.push(got, chunkOf(1024 * 1024))
  ok(got.length === CAP, `② 超限 ⇒ 返回值长度**恰为 cap**（实测 ${got.length} = ${CAP}）`)
  ok(calls === 1, `③ 超限回调**只触发一次**（实测 ${calls} 次）`)
  const before = got.length
  got = s.push(got, chunkOf(1024 * 1024))
  ok(s.overflowed() && got.length === before, `④ 超限之后的 chunk **全部丢失**（长度仍 ${got.length}，未增长）`)
}

// ⑤ 反例自证：cap 放大 ⇒ 同样数据不触发
{
  let calls = 0
  const s = makeCappedSink(64 * 1024 * 1024, () => { calls++ })
  let got = ''
  for (let i = 0; i < 20; i++) got = s.push(got, chunkOf(1024 * 1024))
  ok(!s.overflowed() && calls === 0 && got.length === 20 * 1024 * 1024,
    `⑤ 反例自证：cap=64MB 时同样喂 20MB ⇒ 不触发、长度 = ${got.length}（截断确由 cap 决定）`)
}

// ⑥ 边界
{
  let calls = 0
  const s1 = makeCappedSink(1000, () => { calls++ })
  const r1 = s1.push('', chunkOf(1000))
  const exactOk = r1.length === 1000 && !s1.overflowed() && calls === 0
  let calls2 = 0
  const s2 = makeCappedSink(1000, () => { calls2++ })
  s2.push('', chunkOf(1001))
  ok(exactOk && s2.overflowed() && calls2 === 1, '⑥ 边界：**正好等于 cap 不触发**，多 1 字节即触发')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
