#!/usr/bin/env node
// test-seg-flow-state.mjs — S-P3 段级流程状态读口单测（2026-09-20）
//
// 判因（真机三证 + 可执行探针）：`retryAttemptFor` 用 `readRunState`（**会话级末行**）取**段级**重试计数
//   ⇒ 语义错配。水位流里另有多处**不带 segKey/attempt** 的写入（跳过分支 / `segment-done` / `forced`），
//   任何一条插在中间，末行 `segKey` 即与当前段失配 ⇒ **计数结构性归零**：
//     ① 水位流 1093 行中 `phase:"retry"` **0 行**；
//     ② `spawn` 行 399 条，`attempt` 分布 `{0:31, undefined:368}` ⇒ 带 segKey 且 attempt>0 的 **0 条**；
//     ③ 日志重试 307 条，分布 `{1/3:267, 2/3:40}` ⇒ **`3/3` 从未达**（"有界重试"真机从未生效）。
//   探针复现：retry 行后插入一条 skip 式写入 ⇒ carriedAttempt 由 1 变 **0**。
//
// 本件钉死五件：
//   ① 段级读口取**最近一条带 segKey 的行**（不受其后无 segKey 写入干扰）；
//   ② 插入 skip / segment-done 行后，同一段的计数**仍可读回**（治归零）；
//   ③ 段身份变化 ⇒ 计数归零（新内容不背旧失败）；
//   ④ 旧行/空文件/无该会话 ⇒ 0 / '' / null，零抛出；
//   ⑤ 水位流**核心语义不变**（readRunState 仍取末行 —— 本册只**增加**读口，不改既有语义）。
//
// 反例自证（先红）：把 `readSegFlowState` 换成 `readRunState`（旧形态）⇒ ② 必红。
//
// 退出码：0=全过 / 1=有失败
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let fail = 0
const ok = (c, m, extra = '') => { P.push(`${c ? '✅' : '❌'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fail++ }

const W = await import(new URL('../lib/distill-watermark.js', import.meta.url).href)
const { createWmApi } = W
const st = () => ({ distilling: new Set(), snapshotUnavailableStreak: new Map(), dispatchFailStreak: new Map(), skipHoldStreak: new Map(), idleTimers: new Map(), lastParent: null, daemonParent: null, childSeen: new Map(), globalChildSeen: 0, globalChildLoggedAt: 0 })
const mkApi = (file) => createWmApi({ watermarkFile: file, log: () => {}, audit: () => {}, sidShort: (s) => String(s).slice(8, 16), st: st() })

const dir = mkdtempSync(join(tmpdir(), 'segflow-'))
const wf = join(dir, 'distill-watermark.jsonl')
const api = mkApi(wf)
const SID = 'session-f25fad0c-0702-4dbf-93e7-fa962bd498cc'
const SEG = 'b93b389e19d9'

console.log('S-P3 段级流程状态读口\n')

// ── ① 基本读回 ──
{
  api.writeWatermark(SID, 808, undefined, { runId: 'r1', phase: 'retry', attempt: 1, segKey: SEG })
  const s = api.readSegFlowState(SID)
  ok(!!s && s.segKey === SEG && s.phase === 'retry' && s.attempt === 1, '① 读回最近段级行（retry/attempt=1）', JSON.stringify(s))
  ok(!!s && s.lastSeq === 808, '① 同时给出该行水位（诊断用）')
}

// ── ② **核心**：插入无 segKey 的写入 ⇒ 计数不得归零 ──
{
  api.writeWatermark(SID, 808) // 形如跳过分支（skip-normal）的真实形态：无 run 参数
  const afterSkip = api.readSegFlowState(SID)
  ok(!!afterSkip && afterSkip.segKey === SEG && afterSkip.attempt === 1, '② 插入 skip 式写入后，**段级计数仍读回 1**（治结构性归零）', JSON.stringify(afterSkip))
  // 对照：旧形态（会话级末行）此刻已归零
  const oldWay = api.readRunState(SID)
  ok(!!oldWay && Number(oldWay.segKey === SEG ? oldWay.attempt : 0) === 0, '② 反例自证：**旧形态**（末行读）此刻为 0 ⇒ 两态确有差别', `old=${oldWay && oldWay.attempt}/${oldWay && oldWay.segKey}`)

  api.writeWatermark(SID, 900, undefined, { runId: 'r1', phase: 'segment-done' }) // 另一段完成（无 segKey）
  const afterSeg = api.readSegFlowState(SID)
  ok(!!afterSeg && afterSeg.attempt === 1, '② 插入 segment-done 行后仍读回 1')
}

// ── ③ 段身份变化 ⇒ 计数归零（调用方判据）──
{
  api.writeWatermark(SID, 1200, undefined, { runId: 'r2', phase: 'retry', attempt: 2, segKey: 'ffffffffffff' })
  const s = api.readSegFlowState(SID)
  const effective = s && s.segKey === SEG ? s.attempt : 0
  ok(effective === 0, '③ 段身份不匹配 ⇒ 计数归零（新内容不背旧失败）')
  const effective2 = s && s.segKey === 'ffffffffffff' ? s.attempt : 0
  ok(effective2 === 2, '③ 段身份匹配 ⇒ 计数生效（新段自己的计数）')
}

// ── ④ 边界与零抛出 ──
{
  const empty = join(dir, 'empty.jsonl'); writeFileSync(empty, '', 'utf8')
  let threw = false, r = null
  try { r = mkApi(empty).readSegFlowState('nope') } catch { threw = true }
  ok(!threw && r === null, '④ 空文件/无该会话 ⇒ null 且不抛')
  const legacy = join(dir, 'legacy.jsonl')
  writeFileSync(legacy, JSON.stringify({ sessionId: SID, lastSeq: 42, at: '2026-09-01T00:00:00Z', type: 'watermark' }) + '\n', 'utf8')
  ok(mkApi(legacy).readSegFlowState(SID) === null, '④ 旧行（无 segKey）⇒ null（与改前"无段状态"等价）')
  const broken = join(dir, 'broken.jsonl')
  writeFileSync(broken, '{not json\n' + JSON.stringify({ sessionId: SID, lastSeq: 1, segKey: 'ok123', phase: 'retry', attempt: 1 }) + '\n', 'utf8')
  const rb = mkApi(broken).readSegFlowState(SID)
  ok(!!rb && rb.segKey === 'ok123', '④ 坏行跳过不阻断（仍能读到后面合法行）')
}

// ── ⑤ 不改既有语义：readRunState 仍取末行 ──
{
  const d2 = mkdtempSync(join(tmpdir(), 'segflow2-'))
  const f2 = join(d2, 'w.jsonl')
  const a2 = mkApi(f2)
  a2.writeWatermark('s', 1, undefined, { runId: 'r', phase: 'spawn', attempt: 0, segKey: 'aaa' })
  a2.writeWatermark('s', 2, undefined, { runId: 'r', phase: 'segment-done' })
  const last = a2.readRunState('s')
  ok(last.lastSeq === 2 && last.phase === 'segment-done', '⑤ `readRunState` 仍取**末行**（水位流核心语义不变）')
  const seg = a2.readSegFlowState('s')
  ok(!!seg && seg.segKey === 'aaa' && seg.phase === 'spawn', '⑤ 段级读口独立取"最近带 segKey 的行"（与末行读并存不冲突）')
}

// ── ⑥ 接线：两处消费同源 ──
{
  const agent = readFileSync(join(root, 'src', 'distill-agent.ts'), 'utf8')
  const uses = (agent.match(/readSegFlowState\s*\(/g) || []).length
  ok(uses === 2, '⑥ `retryAttemptFor` 与 `retryRowHeld` **同源**（同一段级读口，防口径漂移）', `引用数=${uses}`)
  ok(!/readRunState\(sid\)\?\.phase === 'retry'/.test(agent), '⑥ 旧「末行判 retry」形态已消除')
}

try { rmSync(dir, { recursive: true, force: true }) } catch { /* 清理失败无害 */ }
console.log(P.join('\n'))
console.log(fail ? `\n❌ test-seg-flow-state: ${fail} 条断言未通过` : `\n✅ test-seg-flow-state: 全绿（${P.length} 条）`)
process.exit(fail ? 1 : 0)
