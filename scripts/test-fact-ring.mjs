#!/usr/bin/env node
// test-fact-ring.mjs —— G0 事实环时态失效 **直接单测**（fact-ring.ts + 镜像承接）
//
// 为什么必须有这一件：时态失效是全仓**最容易被静默吃掉**的机制——
//   ① 时间戳坏掉时若 fail-open，就会把"不知道还成不成立"的事实当有效注入；
//   ② 镜像按文件整片替换记录，**会把有效位与命中统计一起清零**（标了失效，下次镜像就复活）；
//   ③ 与 `lifecycle`（活性）混用，会把"过时"当"不重要"，或把"不重要"当"不成立"。
//
// 用法: node scripts/test-fact-ring.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
let fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const S = await import(load('lib/record-store.js'))
const F = await import(load('lib/fact-ring.js'))
const H = await import(load('lib/record-shadow.js'))
const E = await import(load('lib/ring-events.js'))

const tmp = mkdtempSync(join(tmpdir(), 'sc-fact-'))
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 清理失败无害 */ } })

const T1 = '2026-09-01T00:00:00.000Z'
const T2 = '2026-09-15T00:00:00.000Z'
const mk = (text, id, extra = {}) => ({ ...S.makeRecord({ text, file: 'MEMORY.md', id, pointer: `notes/x.md §甲` }), ...extra })

console.log('== A. isLive 口径（坏时间戳 fail-closed）==')
{
  ok(F.isLive(mk('- [env] A', 'a'), T2) === true, '无 validTo ⇒ 有效')
  ok(F.isLive({ ...mk('- [env] A', 'a'), validTo: '2026-10-01T00:00:00.000Z' }, T2) === true, 'validTo 在未来 ⇒ 有效')
  ok(F.isLive({ ...mk('- [env] A', 'a'), validTo: T1 }, T2) === false, 'validTo 已过 ⇒ 失效')
  ok(F.isLive({ ...mk('- [env] A', 'a'), validTo: '不是时间' }, T2) === false, '**坏时间戳 ⇒ 按失效处理**（真相上宁可保守，不拿坏标记当好标记）')
  ok(F.isLive({ ...mk('- [env] A', 'a'), validTo: T2 }, T2) === false, '恰在失效时刻 ⇒ 失效（边界取闭区间右端）')
}

console.log('== B. 标记失效（幂等 + 记因 + 不动活性）==')
{
  const recs = [mk('- [env] A', 'a')]
  const bad = F.supersede(recs, '不存在', { at: T2 })
  ok(bad.ok === false && /不存在/.test(bad.reason), '未知 id ⇒ 拒')
  const r1 = F.supersede(recs, 'a', { at: T2, note: '版本已升', by: 'commit abc123' })
  ok(r1.ok && r1.records[0].validTo === T2, '标记失效写入 validTo')
  ok(r1.records[0].meta.staleNote === '版本已升' && r1.records[0].meta.supersededBy === 'commit abc123', '记下因由与被谁取代（人读可追溯）')
  ok(r1.records[0].updatedAt === T2, 'updatedAt 同步')
  const r2 = F.supersede(r1.records, 'a', { at: '2027-01-01T00:00:00.000Z', note: '再标一次' })
  ok(r2.ok === false && /已失效/.test(r2.reason), '**重复标记被拒**（否则"何时失效"会被后来者覆盖）')
  ok(r2.records[0].validTo === T2, '拒绝时不改既有的失效时刻')
  ok(r1.records[0].lifecycle === 'active', '**不动 lifecycle**（真伪与活性正交）')
  ok(r1.records[0].hits === 0 && r1.records[0].lastHit === '', '不动命中统计')
}

console.log('== C. 恢复有效 ==')
{
  const s = F.supersede([mk('- [env] A', 'a')], 'a', { at: T2 }).records
  const r = F.revive(s, 'a', T1)
  ok(r.ok && r.records[0].validTo === undefined, '恢复后 validTo 清空')
  ok(!('validTo' in r.records[0]) || r.records[0].validTo === undefined, '字段不残留字符串（避免 "undefined" 被当成时间）')
  ok(F.revive(r.records, 'a', T1).ok === false, '本就有效 ⇒ 拒绝（幂等）')
  ok(F.revive(s, '不存在', T1).ok === false, '未知 id ⇒ 拒')
}

console.log('== D. 分区与失效清单 ==')
{
  const recs = [
    mk('- [env] 活', 'live1'),
    { ...mk('- [env] 死', 'dead1'), validTo: T1, meta: { staleNote: '换了方案', supersededBy: 'rec-x' } },
    { ...mk('- [env] 坏', 'bad1'), validTo: '乱码' },
  ]
  ok(F.liveRecords(recs, T2).length === 1 && F.liveRecords(recs, T2)[0].id === 'live1', '有效分区')
  ok(F.expiredRecords(recs, T2).length === 2, '失效分区（含坏时间戳）')
  const rep = F.staleReport(recs)
  ok(rep.length === 2 && rep.some((x) => x.why === '换了方案' && x.by === 'rec-x'), '失效清单带因由与被取代者')
}

console.log('== E. 事实环 KPI（只从记录集推导）==')
{
  ok(F.factCensus([], T2).live === 0 && F.factCensus([], T2).expired === 0, '空集不编造')
  const recs = [
    mk('- [env] 活', 'l1'),
    { ...mk('- [env] 活2', 'l2'), meta: { premise: '仅在 Ollama 可用时' } },
    { ...mk('- [env] 死', 'd1'), validTo: T1 },
    { ...mk('- [env] 坏', 'b1'), validTo: 'NaN' },
  ]
  const c = F.factCensus(recs, T2)
  ok(c.total === 4 && c.live === 2 && c.expired === 2, `census total ${c.total} / live ${c.live} / expired ${c.expired}`)
  ok(c.withPremise === 1, '带前提计数')
  ok(c.unparseable === 1, '**坏时间戳可见**（按失效处理但不静默）')
  ok(F.premiseOf(recs[1]) === '仅在 Ollama 可用时' && F.premiseOf(recs[0]) === '', '前提读写口径')
}

console.log('== F. 正交性：活性迁移不动有效位，反之亦然 ==')
{
  const base = mk('- [env] A', 'a')
  const cold = { ...base, lifecycle: 'cold' }
  ok(F.isLive(cold, T2) === true, 'lifecycle 降级**不等于**失效（不把"不重要"当"不成立"）')
  const dead = F.supersede([base], 'a', { at: T1 }).records[0]
  ok(dead.lifecycle === 'active', '失效**不等于**活性降级（不把"过时"当"不重要"）')
}

console.log('== G. 走形判定含双时间戳 ==')
{
  const a = mk('- [env] A', 'a')
  const b = { ...a, validTo: T1 }
  ok(S.diffRecords([a], [b]).changed.length === 1, 'validTo 变更被 diff 识别（否则失效对账不可见）')
  ok(S.diffRecords([a], [{ ...a, hits: 3 }]).changed.length === 0, '统计变更仍不算内容变更（对照）')
  ok(S.diffRecords([{ ...a, validTo: T1 }], [{ ...a, validTo: T1 }]).changed.length === 0, '同有效位不算变更')
}

console.log('== H. 镜像**承接**状态字段（否则标了失效，下次镜像就复活）==')
{
  const root = join(tmp, 'lib1')
  mkdirSync(root, { recursive: true })
  const md = '# MEMORY.md\n\n- [env] A · 概况 → notes/env.md §A\n- [env] B · 概况 → notes/env.md §B\n'
  writeFileSync(join(root, 'MEMORY.md'), md, 'utf8')
  H.mirrorAll(root, T1, ['MEMORY.md'])
  let recs = H.loadStore(root).records
  const target = recs.find((r) => r.text.includes('[env] A'))
  // 造状态：命中统计 + 活性降级 + 标失效
  recs = recs.map((r) => (r.id === target.id ? { ...r, hits: 7, lastHit: T1, lifecycle: 'cold' } : r))
  recs = F.supersede(recs, target.id, { at: T2, note: '已被取代' }).records
  H.saveStoreRecords(root, recs)
  ok(H.loadStore(root).records.find((r) => r.id === target.id).validTo === T2, '失效位已落库')

  // 再镜像同一文件（按文件整片替换）——状态必须承接
  H.mirrorFile(root, 'MEMORY.md', 'T3')
  const after = H.loadStore(root).records.find((r) => r.id === target.id)
  ok(after.validTo === T2, '**镜像承接 validTo**（不复活已失效的断言）')
  ok(after.hits === 7 && after.lastHit === T1, '镜像承接命中统计（此前会被静默清零）')
  ok(after.lifecycle === 'cold', '镜像承接活性')
  ok(after.meta?.staleNote === '已被取代', '镜像承接失效因由')
  ok(H.parityOf(root, ['MEMORY.md'])[0].ok === true, '承接不破坏 md 对账（内容仍以 md 为准）')
  // 内容仍以 md 为准：改 md 后镜像，正文应更新
  writeFileSync(join(root, 'MEMORY.md'), md.replace('A · 概况', 'A · 概况（改）'), 'utf8')
  H.mirrorFile(root, 'MEMORY.md', 'T4')
  const after2 = H.loadStore(root).records.find((r) => r.id === target.id)
  ok(after2 === undefined || !after2.text.includes('A · 概况 →'), 'md 改文 ⇒ 视为新记录（id 随内容变，内容以 md 为准）')
}

console.log('== I. 已知边界（显式，不是遗漏）==')
{
  // 事实环的失效是**状态位变更**，不属环事件流的 9 种 op（那些是环记录的创建/迁移）。
  // 索引行由 mirror 管（内容以 md 为准、状态承接），故其有效位不进事件流——本断言把这条边界钉住，
  // 将来若要"状态位也进事件流"，必须同时改 ringRecordsOf 的取集范围与重放载荷，改错了这里先红。
  const recs = [{ ...mk('- [env] A', 'a'), validTo: T1 }]
  ok(E.ringRecordsOf(recs).length === 0, '事实环记录不在环事件流的取集范围内（边界显式）')
  ok(E.RING_OPS.length === 9 && !E.RING_OPS.includes('fact.supersede'), '事件 op 集未含事实环失效（边界显式）')
  ok(E.eventsFromDiff([], recs, T2).length === 0, '故差分也不会为它产事件（一致，不是半接线）')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
