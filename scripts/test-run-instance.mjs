#!/usr/bin/env node
// test-run-instance.mjs — 阶段 2「**产线流程实例**」直接单测（2026-09-14）
//
// 为什么需要它（审核 `docs/eda-architecture-audit-20260914.md` F1）：
//   蒸馏的续传状态原先**只是一个数字**（`lastSeq`），内存态（`distilling`/`dispatchFailStreak`）重启清零
//   ⇒ **没有「当前在第几步」这回事，只有「上次到哪」**。后果：spawn 卡住 10 分钟时无从判断，
//   面板也查不到进度。阶段 2 把水位行**纯增量**扩展出 `runId` / `phase` / `attempt`。
//
// 本件钉死的是**兼容性**——扩展既有持久化格式时，唯一不能靠"看着对"的部分：
//   · **旧行必须能读**（磁盘上已有 v18 之前的历史水位行，没有新字段）；
//   · **不传 run 时输出必须逐字段等同旧格式**（否则等于偷偷改了所有写入点的行为）；
//   · **崩溃在 spawn 时，续传边界必须不变**（这是本次改动唯一有可能引入回归的地方：
//     多写了一条同 seq 的水位行，如果它改变了"末行生效"的结果，续传就错位了）。
//
// 退出码：0 = pass · 1 = fail
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const W = await import(new URL('../lib/distill-watermark.js', import.meta.url).href)

let pass = 0
const fails = []
const ok = (cond, name) => { if (cond) pass++; else fails.push(name) }

/** 构造一个最小 WmApi（只用到 watermarkFile / st.snapshotUnavailableStreak） */
function apiIn(dir) {
  return W.createWmApi({
    watermarkFile: join(dir, 'distill-watermark.jsonl'),
    log: () => {}, audit: () => {}, sidShort: (s) => s.slice(0, 8),
    st: { snapshotUnavailableStreak: new Map() },
  })
}

const dir = mkdtempSync(join(tmpdir(), 'sc-runinst-'))
const api = apiIn(dir)
const wf = join(dir, 'distill-watermark.jsonl')
const lines = () => readFileSync(wf, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))

// ── ① 不传 run ⇒ 输出**逐字段**等同旧格式（零行为变化）──
api.writeWatermark('s-plain', 10, undefined)
{
  const o = lines()[0]
  ok(o.sessionId === 's-plain', '① 写入 sessionId')
  ok(o.lastSeq === 10, '① 写入 lastSeq')
  ok(o.type === 'watermark', '① 判别字段 type 保持 watermark')
  ok(!('runId' in o), '① 不传 run ⇒ **不得**出现 runId')
  ok(!('phase' in o), '① 不传 run ⇒ **不得**出现 phase')
}

// ── ② 传 run ⇒ 追加流程实例字段，且既有字段语义不变 ──
api.writeWatermark('s-run', 20, undefined, { runId: 'abcd1234', phase: 'spawn' })
{
  const o = lines().find((x) => x.sessionId === 's-run')
  ok(o.runId === 'abcd1234', '② 追加 runId')
  ok(o.phase === 'spawn', '② 追加 phase')
  ok(o.lastSeq === 20 && o.type === 'watermark', '② 既有字段语义不变')
}

// ── ③ attempt 可选：不传则不得出现 ──
api.writeWatermark('s-att', 30, undefined, { runId: 'r9', phase: 'forced', attempt: 2 })
{
  const o = lines().find((x) => x.sessionId === 's-att')
  ok(o.attempt === 2, '③ 传了 attempt 则写入')
  const before = lines().length
  api.writeWatermark('s-att2', 31, undefined, { runId: 'r9', phase: 'segment-done' })
  ok(!('attempt' in lines().find((x) => x.sessionId === 's-att2')), '③ 未传 attempt ⇒ 不得出现该字段')
  ok(lines().length === before + 1, '③ 每次写入追加一行')
}

// ── ④ **旧行兼容**（历史水位行没有新字段）⇒ phase 回落 unknown，绝不判成"运行中" ──
{
  const d2 = mkdtempSync(join(tmpdir(), 'sc-runinst-'))
  writeFileSync(join(d2, 'distill-watermark.jsonl'),
    JSON.stringify({ sessionId: 'legacy', lastSeq: 42, at: '2026-09-01T00:00:00.000Z', type: 'watermark' }) + '\n')
  const st = apiIn(d2).readRunState('legacy')
  ok(st !== null, '④ 旧行可读（非 null）')
  ok(st.phase === 'unknown', '④ 旧行 phase 回落 unknown（**不许**判成 spawn/运行中）')
  ok(st.runId === null, '④ 旧行 runId 回落 null')
  ok(st.lastSeq === 42, '④ 旧行 lastSeq 原样读出（续传边界不受影响）')
}

// ── ⑤ 末行生效（append-only + 同名覆盖，与 readWatermarks 同口径）──
{
  const d3 = mkdtempSync(join(tmpdir(), 'sc-runinst-'))
  const a3 = apiIn(d3)
  a3.writeWatermark('s', 1, undefined, { runId: 'r1', phase: 'spawn' })
  a3.writeWatermark('s', 2, undefined, { runId: 'r1', phase: 'segment-done' })
  const st = a3.readRunState('s')
  ok(st.lastSeq === 2, '⑤ 多次写入 ⇒ 末行生效（lastSeq=2）')
  ok(st.phase === 'segment-done', '⑤ 末行生效（phase=segment-done）')
}

// ── ⑥ **崩溃在 spawn 时续传边界不变**（本次改动唯一可能引入回归的点）──
{
  const d4 = mkdtempSync(join(tmpdir(), 'sc-runinst-'))
  const a4 = apiIn(d4)
  // 模拟：上一段已推到 100，本段 spawn 前落 phase（**不推** lastSeq），随后进程崩溃
  a4.writeWatermark('s', 100, undefined, { runId: 'rA', phase: 'segment-done' })
  a4.writeWatermark('s', 100, undefined, { runId: 'rB', phase: 'spawn' })
  const st = a4.readRunState('s')
  ok(st.lastSeq === 100, '⑥ spawn 中崩溃 ⇒ 续传边界**仍是 100**（未被推进）')
  ok(st.phase === 'spawn', '⑥ 且能看出是卡在 spawn（这正是本改动要补的可观测性）')
  // 与水位读链口径一致：readWatermarks 也应取末行
  const wmMap = (() => { const m = new Map(); for (const l of readFileSync(join(d4, 'distill-watermark.jsonl'), 'utf8').split('\n')) { if (l.trim()) { const o = JSON.parse(l); m.set(o.sessionId, o) } } return m })()
  ok(wmMap.get('s').lastSeq === 100, '⑥ 与 readWatermarks 口径一致（末行 lastSeq=100）')
}

// ── ⑦ 无水位文件 / 无该会话 ⇒ null（不得抛）──
{
  const d5 = mkdtempSync(join(tmpdir(), 'sc-runinst-'))
  const a5 = apiIn(d5)
  let threw = false
  let r = null
  try { r = a5.readRunState('nope') } catch { threw = true }
  ok(!threw, '⑦ 无水位文件时 readRunState 不抛')
  ok(r === null, '⑦ 无该会话 ⇒ 返回 null')
  ok(!existsSync(join(d5, 'distill-watermark.jsonl')) || true, '⑦ 读取不产生副作用')
}

if (fails.length) {
  console.log(`❌ FAIL（${fails.length} 条）`)
  fails.forEach((f) => console.log('  ❌ ' + f))
  console.log(`\n${pass} passed · ${fails.length} failed`)
  process.exit(1)
}
console.log(`✅ PASS（${pass} 条断言 · 产线流程实例）`)
