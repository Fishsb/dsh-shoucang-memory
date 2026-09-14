#!/usr/bin/env node
// test-ring-events.mjs —— G0 环事件流 **直接单测**（ring-events.ts）
//
// 为什么必须有这一件：事件流的价值全在**「重放能重建状态」**这一条判据上。
//   它若不成立，事件流就只是一份"看起来像历史"的冗余拷贝——而冗余拷贝最坏的结果不是没用，
//   是**在对账时给人虚假的安心**。故本件把三条钉死：
//     ① 差分推导的事件**载荷逐字够用**（不做正文反解，否则文本格式一动就静默走偏）；
//     ② 事件流 → 状态 → 事件流 **往返无损**（日志足以承载全部状态）；
//     ③ 对账能抓到 缺失/多出/内容不一致/坏事件 四类偏差（不是永远绿的装饰）。
//
// 用法: node scripts/test-ring-events.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
let fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const E = await import(load('lib/ring-events.js'))
const D = await import(load('lib/decision-ring.js'))
const G = await import(load('lib/relation-ring.js'))
const A = await import(load('lib/association-ring.js'))

const AT = '2026-09-13T00:00:00.000Z'
const AT2 = '2026-09-14T00:00:00.000Z'

/** 造一份真实状态的环记录集（覆盖五个环的写与状态迁移） */
function buildState() {
  let recs = []
  const d = D.openDecision(recs, { text: '裁决甲', predicted: '会成', rationale: '因为 X', alternatives: '方案乙', evidence: 's1', at: AT })
  recs = d.records
  recs = D.collectOutcome(recs, d.id, { observed: '真成了', hit: true, at: AT2 }).records
  recs = D.recordValence(recs, { trigger: '看到视觉走样', valence: -1, evidence: 's2', at: AT }).records
  recs = G.assertRelation(recs, { who: '用户', note: '在意磁盘', level: 2, at: AT }).records
  const c = G.openCommitment(recs, { who: '用户', what: '先出迁移路径', direction: 'owed-by-me', due: '2026-09-20', at: AT })
  recs = c.records
  recs = G.settleCommitment(recs, c.id, { status: 'kept', note: '已出', at: AT2 }).records
  const col = A.recordCollision(recs, { a: 'notes/x.md §甲', b: 'notes/y.md §乙', context: '做 P4 时', insight: '同型判据', accepted: true, evidence: 's3', at: AT })
  recs = col.records
  recs = A.landCollision(recs, col.id, { landed: true, note: '写进门禁', at: AT2 }).records
  return { records: recs, decisionId: d.id, commitmentId: c.id, collisionId: col.id }
}

console.log('== A. 序列化（JSONL 往返 + 坏行不毁账本）==')
{
  ok(E.RING_OPS.length === 9, `事件类型 ${E.RING_OPS.length} 种（五环的写与状态迁移全覆盖）`)
  const evs = [E.makeEvent(1, 'decision.open', 'd1', { text: 'x' }, AT), E.makeEvent(2, 'valence.record', 'v1', { trigger: 't', valence: '-1' }, AT2)]
  const back = E.parseEvents(E.serializeEvents(evs))
  ok(back.length === 2 && back[1].data.valence === '-1' && back[0].op === 'decision.open', 'JSONL 往返保内容')
  ok(E.parseEvents('{"seq":1,"op":"decision.open","id":"a","data":{},"at":"T"}\n{坏行\n').length === 1, '坏行被跳过（解析失败不得让整条历史不可用）')
  ok(E.serializeEvents([]) === '', '空事件流序列化为空串')
  ok(E.makeEvent(3, 'collision.land', 'c1', {}, AT).seq === 3, 'makeEvent 记 seq')
}

console.log('== B. 差分推导（CDC）：载荷逐字够用，不做正文反解 ==')
{
  const { records } = buildState()
  const evs = E.eventsFromDiff([], records, AT, 1)
  const ops = evs.map((e) => e.op)
  ok(ops.includes('decision.open') && ops.includes('decision.outcome') && ops.includes('valence.record'), `决策环事件齐（${ops.filter((o) => o.startsWith('decision') || o.startsWith('valence')).join(',')}）`)
  ok(ops.includes('relation.assert') && ops.includes('commitment.open') && ops.includes('commitment.settle'), '关系环事件齐（含状态迁移 settle）')
  ok(ops.includes('collision.record') && ops.includes('collision.land'), '联想环事件齐（含落地）')
  const open = evs.find((e) => e.op === 'commitment.open')
  ok(open.data.what === '先出迁移路径' && open.data.direction === 'owed-by-me' && open.data.due === '2026-09-20', '**承诺内容逐字来自 meta**（不解析"[承诺] 我欠 X：Y"这种正文格式）')
  const rel = evs.find((e) => e.op === 'relation.assert')
  ok(rel.data.note === '在意磁盘' && rel.data.level === '2', '关系事实逐字来自 meta')
  const col = evs.find((e) => e.op === 'collision.record')
  ok(col.data.a === 'notes/x.md §甲' && col.data.context === '做 P4 时' && col.data.insight === '同型判据', '碰撞载荷逐字来自 meta（含 insight）')
  ok(evs.every((e) => e.seq >= 1) && new Set(evs.map((e) => e.seq)).size === evs.length, 'seq 单调且唯一')
  ok(E.eventsFromDiff(records, records, AT).length === 0, '无变更 ⇒ 零事件（不产噪声）')
  ok(E.eventsFromDiff([], records, AT, 7)[0].seq === 7, 'startSeq 可续接（追加不重号）')
}

console.log('== C. 重放：往返无损（事件流足以承载全部状态）==')
{
  const { records } = buildState()
  const evs = E.eventsFromDiff([], records, AT, 1)
  const r1 = E.replayEvents(evs)
  ok(r1.errors.length === 0, `重放零报错（applied ${r1.applied}/${evs.length}）`)
  const key = (rs) => JSON.stringify(E.ringRecordsOf(rs).map((r) => ({ i: r.id, k: r.kind, t: r.text, m: r.meta })).sort((a, b) => (a.i < b.i ? -1 : 1)))
  ok(key(r1.records) === key(records), '**重放结果 === 原始状态**（逐记录 kind/text/meta）')
  // 二次往返：状态 → 事件 → 状态 → 事件，必须仍无损
  const evs2 = E.eventsFromDiff([], r1.records, AT, 1)
  const r2 = E.replayEvents(evs2)
  ok(key(r2.records) === key(r1.records), '二次往返仍无损（可反复重建）')
  ok(E.replayEvents([]).records.length === 0 && E.replayEvents([]).errors.length === 0, '空事件流 ⇒ 空状态、零报错')
  ok(JSON.stringify(E.replayEvents(evs)) === JSON.stringify(E.replayEvents([...evs].reverse())), '重放按 seq 排序，与传入顺序无关（确定性）')
}

console.log('== D. 对账：四类偏差都要抓得住（不是永远绿的装饰）==')
{
  const { records, decisionId } = buildState()
  const evs = E.eventsFromDiff([], records, AT, 1)
  ok(E.reconcileRing(records, evs).ok === true, '一致 ⇒ ok')
  // ① store 少一条（事件有、状态无）
  const dropped = records.filter((r) => r.id !== decisionId)
  const rec1 = E.reconcileRing(dropped, evs)
  ok(rec1.ok === false && rec1.extraInReplay.includes(decisionId), '① 状态缺记录 ⇒ 抓出「重放多出」')
  // ② store 多一条（状态有、事件无）
  const extra = records.concat([D.openDecision([], { text: '凭空多出的裁决', at: AT }).records[0]])
  const rec2 = E.reconcileRing(extra, evs)
  ok(rec2.ok === false && rec2.missingInReplay.length === 1, '② 状态多记录 ⇒ 抓出「重放缺失」')
  // ③ 内容不一致（meta 被改）
  const tampered = records.map((r) => (r.id === decisionId ? { ...r, meta: { ...r.meta, status: 'collected-X' } } : r))
  const rec3 = E.reconcileRing(tampered, evs)
  ok(rec3.ok === false && rec3.differing.includes(decisionId), '③ 内容被改 ⇒ 抓出「不一致」（只比 kind/text/meta，不比统计）')
  // ④ 坏事件
  const bad = evs.concat([E.makeEvent(999, 'nope.op', 'x', {}, AT)])
  const rec4 = E.reconcileRing(records, bad)
  ok(rec4.ok === false && rec4.errors.length === 1, '④ 未知 op ⇒ 记 error 并判 FAIL（不静默跳过）')
  // 统计字段不参与对账（与 diffRecords 同口径）
  const hitBumped = records.map((r) => ({ ...r, hits: r.hits + 5, lastHit: AT2 }))
  ok(E.reconcileRing(hitBumped, evs).ok === true, '统计变更（hits/lastHit）不算不一致（口径与 diffRecords 一致）')
}

console.log('== E. 回填（atOf 用记录自身 createdAt 保序）==')
{
  const { records } = buildState()
  const stamped = records.map((r, i) => ({ ...r, createdAt: `2026-09-${String(10 + i).padStart(2, '0')}T00:00:00.000Z` }))
  const evs = E.eventsFromDiff([], stamped, 'NOW', 1, (r) => r.createdAt || 'NOW')
  ok(evs.every((e) => e.at !== 'NOW'), 'atOf 生效：时间取记录 createdAt（回填不把所有事件压成同一时刻）')
  ok(evs[0].at === stamped.find((r) => r.id === evs[0].id).createdAt, '事件时间 = 该记录 createdAt')
  const r = E.replayEvents(evs)
  const key = (rs) => JSON.stringify(E.ringRecordsOf(rs).map((x) => ({ i: x.id, k: x.kind, t: x.text, m: x.meta })).sort((a, b) => (a.i < b.i ? -1 : 1)))
  ok(key(r.records) === key(stamped), '回填事件重放 === 当前状态（迁移后立即可对账）')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
