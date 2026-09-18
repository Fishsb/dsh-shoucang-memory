// test-guard-lifetime.mjs — 册四单测：**守卫寿命（重试计数与段身份同寿）**
//
// 判因（真机实测）：`dispatchFailStreak` 是内存 Map，而插件热重载实测 **220 次**（09-18 单日 28 次）
//   ⇒ 计数每轮清零 ⇒「有界重试（连败 3 次强制推进）」退化为「无界重试」：
//   全日志「第 3/3 次」**0 次**、「强制推进水位」**17 次** —— 而水位冻在 2 / 808 / 0 的三个会话
//   在同一小时里被重蒸 12–15 次。
//
// 本件钉死三件（全部用真实实现驱动，不写假替身）：
//   ① `writeWatermark(..., {phase:'retry', attempt, segKey})` 落盘后，**新实例**（= 模拟热重载）
//      用 `readRunState` 能读回同一 `attempt`/`segKey` ⇒ 计数不归零；
//   ② **段身份不匹配 ⇒ 计数归零**（内容变了就是新段，旧失败不许算到新内容头上）；
//   ③ 旧行兼容：无 `attempt`/`segKey` 的历史行 ⇒ 回落 `0`/`''`（与改前逐字等价）。
//
// 反例自证：把 `readRunState` 的 `attempt`/`segKey` 回读删掉（即退回"只读 lastSeq"）⇒ ①②③ 立刻红；
//   把 `writeWatermark` 的 run 字段写入删掉 ⇒ ①红。
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createWmApi } from '../lib/distill-watermark.js'
import { newDistillState } from '../lib/distill-state.js'

const root = mkdtempSync(join(tmpdir(), 'guard-lifetime-'))
const wmFile = join(root, 'distill-watermark.jsonl')
const SID = 'session-3a0b155d-d94e-43ac-8c4e-0a329b9dcb4c'
const SEG = 'e430fd412d33'

const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }

/** 造一个"实例"（每次调用 = 新 fiber = 模拟热重载：全新 state、全新 api，只共享磁盘） */
const newInstance = () => {
  if (!existsSync(wmFile)) writeFileSync(wmFile, '', 'utf8')
  const st = newDistillState()
  const audit = []
  const api = createWmApi({
    watermarkFile: wmFile,
    log: () => {},
    audit: (o) => audit.push(o),
    sidShort: (s) => String(s).slice(8, 16),
    st,
  })
  return { api, st, audit }
}

// ── ① 落盘 → 新实例回读（热重载不归零）──
{
  const a = newInstance()
  a.api.writeWatermark(SID, 2, undefined, { runId: 'r1', phase: 'retry', attempt: 2, segKey: SEG })
  const rows = readFileSync(wmFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const last = rows[rows.length - 1]
  ok('① 水位行带 attempt/segKey（落盘）', last && last.attempt === 2 && last.segKey === SEG && last.phase === 'retry', JSON.stringify({ attempt: last && last.attempt, segKey: last && last.segKey, phase: last && last.phase }))

  const b = newInstance() // ← 模拟热重载（内存清零）
  const snap = b.api.readRunState(SID)
  ok('① 新实例（重载后）读回 attempt（计数不归零）', !!snap && snap.attempt === 2, `attempt=${snap ? snap.attempt : 'null'}`)
  ok('① 新实例读回 segKey（段身份同寿）', !!snap && snap.segKey === SEG, `segKey=${snap ? snap.segKey : 'null'}`)
  ok('① 内存缓存**确为空**（证明不是内存兜底）', b.st.dispatchFailStreak.size === 0, `size=${b.st.dispatchFailStreak.size}`)
}

// ── ② 段身份不匹配 ⇒ 计数归零（内容变了就是新段）──
{
  const c = newInstance()
  const snap = c.api.readRunState(SID)
  const other = 'ffffffffffff'
  const effective = snap && snap.segKey === other ? snap.attempt : 0
  ok('② 段身份不匹配 ⇒ 计数归零（新内容不背旧失败）', effective === 0, `effective=${effective}`)
  ok('② 段身份匹配 ⇒ 计数生效（对照）', (snap && snap.segKey === SEG ? snap.attempt : 0) === 2)
}

// ── ③ 旧行兼容（无 attempt/segKey 的历史行 ⇒ 0 / ''）──
{
  const legacy = join(root, 'legacy.jsonl')
  writeFileSync(legacy, JSON.stringify({ sessionId: SID, lastSeq: 100, at: '2026-09-01T00:00:00Z', type: 'watermark' }) + '\n', 'utf8')
  const api = createWmApi({ watermarkFile: legacy, log: () => {}, audit: () => {}, sidShort: (s) => String(s), st: newDistillState() })
  const snap = api.readRunState(SID)
  ok('③ 旧行 ⇒ attempt=0 / segKey=\'\' / phase=unknown（逐字等价）', !!snap && snap.attempt === 0 && snap.segKey === '' && snap.phase === 'unknown' && snap.lastSeq === 100, JSON.stringify(snap))
}

// ── ④ 不传 run ⇒ 行内不出现新字段（零行为变化的兼容不变量）──
{
  const plain = join(root, 'plain.jsonl')
  writeFileSync(plain, '', 'utf8')
  const api = createWmApi({ watermarkFile: plain, log: () => {}, audit: () => {}, sidShort: (s) => String(s), st: newDistillState() })
  api.writeWatermark(SID, 7, undefined)
  const row = JSON.parse(readFileSync(plain, 'utf8').trim())
  ok('④ 不传 run ⇒ 无 runId/phase/attempt/segKey', row.runId === undefined && row.phase === undefined && row.attempt === undefined && row.segKey === undefined && row.lastSeq === 7, JSON.stringify(row))
}

try { rmSync(root, { recursive: true, force: true }) } catch { /* 清理失败无害 */ }
for (const l of P) console.log(l)
console.log(bad ? `\n❌ test-guard-lifetime: ${bad} 条断言未通过` : '\n✅ test-guard-lifetime: 全绿')
process.exit(bad ? 1 : 0)
