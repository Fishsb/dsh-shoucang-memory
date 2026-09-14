#!/usr/bin/env node
// test-relation-ring.mjs —— G2 关系环 **直接单测**（relation-ring.ts）
//
// 为什么必须有这一件：关系环的价值全在**双向**与**未结事项不丢**上，而这两点最容易被静默做错：
//   · 方向丢失（把「我欠」与「欠我」合成一个数）⇒ 兑现率失去意义；
//   · 重复结清 ⇒ 兑现率虚高（与决策环重复回收同型）；
//   · 已结清的承诺仍留在待办队列 ⇒ "想不起来兑现"的防线变成噪声；
//   · 陈旧 `RING_PENDING` 申报（环已落 kind 却仍申报豁免）⇒ 豁免名单永不清空。
//
// 用法: node scripts/test-relation-ring.mjs   （先 `npm run build:host`；npm test 已含 pretest）
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
const R = await import(load('lib/rings.js'))
const G = await import(load('lib/relation-ring.js'))
const H = await import(load('lib/record-shadow.js'))

const tmp = mkdtempSync(join(tmpdir(), 'sc-rel-'))
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 清理失败无害 */ } })
const AT = '2026-09-13T00:00:00.000Z'

console.log('== A. 环登记棘轮（关系环落地后必须撤销 pending 申报）==')
{
  ok(R.ringOfKind('relation') === 'relation' && R.ringOfKind('commitment') === 'relation', 'relation/commitment 归关系环')
  ok(R.kindsOfRing('relation').length === 2, `关系环已落 kind（${R.kindsOfRing('relation').join(',')}）`)
  ok(!R.RING_PENDING.includes('relation'), 'RING_PENDING 已撤销 relation 申报（棘轮生效）')
  ok(R.stalePendingRings().length === 0, '无陈旧 pending 申报（已落 kind 的环不得仍申报豁免）')
  ok(R.uncoveredKinds().length === 0 && R.emptyUndeclaredRings().length === 0, '环登记仍全自洽（新增 kind 未破坏覆盖）')
  ok(R.RING_PENDING.length === 0, 'RING_PENDING 已清空（G3 联想环落地 ⇒ 五个环全部落 kind）')
}

console.log('== B. 关系事实（谁在意什么）==')
{
  const r1 = G.assertRelation([], { who: '用户', note: '要求不偏离主线、不要过度思考', level: 2, evidence: 'session-a', at: AT })
  ok(r1.records.length === 1 && r1.records[0].kind === 'relation', '记关系事实产生 relation 记录')
  ok(r1.records[0].meta?.who === '用户' && r1.records[0].meta?.level === '2', 'meta 带 who/level（主体是字段）')
  ok(r1.records[0].file === '' && r1.records[0].text.includes('用户：'), '无 md 投影（file=\'\'）且正文人读可辨')
  const again = G.assertRelation(r1.records, { who: '用户', note: '要求不偏离主线、不要过度思考', at: 'T2' })
  ok(again.records.length === 1 && again.records[0].hits === 1, '同事实重现 ⇒ 累加 hits 而非新增')
}

console.log('== C. 承诺状态机（pending → kept | broken）==')
{
  let recs = []
  const c1 = G.openCommitment(recs, { who: '用户', what: '先出迁移与回滚路径再切源', direction: 'owed-by-me', due: '2026-09-20', at: AT })
  recs = c1.records
  ok(recs[0].kind === 'commitment' && recs[0].meta?.status === 'pending', '开承诺 → status=pending')
  ok(recs[0].meta?.direction === 'owed-by-me' && recs[0].meta?.due === '2026-09-20', '方向与期限进 meta（双向记账的关键字段）')
  ok(G.openCommitments(recs).length === 1, '进入待兑现队列')
  // 未知 id
  const bad = G.settleCommitment(recs, 'commitment:不存在', { status: 'kept', at: AT })
  ok(bad.ok === false && /不存在/.test(bad.reason), '未知承诺 id ⇒ 拒绝')
  // 结清
  const kept = G.settleCommitment(recs, c1.id, { status: 'kept', note: '已给迁移路径', at: AT })
  ok(kept.ok, '结清成功')
  recs = kept.records
  ok(recs.find((r) => r.id === c1.id).meta.status === 'kept' && recs.find((r) => r.id === c1.id).meta.settledAt === AT, '状态迁移 + 落 settledAt')
  ok(G.openCommitments(recs).length === 0, '结清后**出待办队列**（队列不是噪声）')
  ok(G.settleCommitment(recs, c1.id, { status: 'broken', at: AT }).ok === false, '重复结清被拒（兑现率不许虚高）')
  ok(recs.length === 1, '结清不新增记录（状态迁移，非追加）')
  // broken 路径
  const c2 = G.openCommitment(recs, { who: '用户', what: '另一个承诺', direction: 'owed-by-me', at: AT })
  const br = G.settleCommitment(c2.records, c2.id, { status: 'broken', at: AT })
  ok(br.ok && G.openCommitments(br.records).length === 0, 'broken 也出队')
}

console.log('== D. 双向兑现率（方向不许合成一个数）==')
{
  let recs = []
  // 我欠用户：1 兑现 1 未兑现
  const a = G.openCommitment(recs, { who: '甲', what: 'A1', direction: 'owed-by-me', at: AT }); recs = a.records
  const b = G.openCommitment(recs, { who: '甲', what: 'A2', direction: 'owed-by-me', at: AT }); recs = b.records
  recs = G.settleCommitment(recs, a.id, { status: 'kept', at: AT }).records
  recs = G.settleCommitment(recs, b.id, { status: 'broken', at: AT }).records
  // 甲欠我：2 兑现
  const c = G.openCommitment(recs, { who: '甲', what: 'B1', direction: 'owed-to-me', at: AT }); recs = c.records
  const d = G.openCommitment(recs, { who: '甲', what: 'B2', direction: 'owed-to-me', at: AT }); recs = d.records
  recs = G.settleCommitment(recs, c.id, { status: 'kept', at: AT }).records
  recs = G.settleCommitment(recs, d.id, { status: 'kept', at: AT }).records
  const t = G.trustOf(recs, '甲')
  ok(t.mineKept === 1 && t.mineBroken === 1 && Math.abs(t.mineRate - 0.5) < 1e-9, `我欠的兑现率 ${t.mineRate}（1/1）`)
  ok(t.theirsKept === 2 && t.theirsBroken === 0 && t.theirsRate === 1, `欠我的兑现率 ${t.theirsRate}（2/0）`)
  const none = G.trustOf(recs, '查无此人')
  ok(none.mineRate === 0 && none.theirsRate === 0, '无记录 ⇒ 报 0（不编造、不 NaN）')
  // 方向进 id：同 who 同 what 不同方向不得撞
  const x = G.openCommitment([], { who: '乙', what: '同样的话', direction: 'owed-by-me', at: AT })
  const y = G.openCommitment(x.records, { who: '乙', what: '同样的话', direction: 'owed-to-me', at: AT })
  ok(y.records.length === 2, '同内容不同方向 ⇒ 两条记录（方向进 id）')
}

console.log('== E. 关系普查与按人过滤 ==')
{
  let recs = []
  recs = G.assertRelation(recs, { who: '甲', note: '在意磁盘占用', at: AT }).records
  recs = G.assertRelation(recs, { who: '乙', note: '偏好开源方案', at: AT }).records
  recs = G.openCommitment(recs, { who: '甲', what: 'C1', direction: 'owed-by-me', at: AT }).records
  recs = G.openCommitment(recs, { who: '乙', what: 'C2', direction: 'owed-to-me', at: AT }).records
  const cen = G.relationCensus(recs)
  ok(cen.relations === 2 && cen.commitments === 2 && cen.pending === 2, `普查 relations ${cen.relations} / commitments ${cen.commitments} / pending ${cen.pending}`)
  ok(cen.entities === 2, `关系网去重主体 = ${cen.entities}`)
  ok(cen.byWho['甲'] === 2 && cen.byWho['乙'] === 2, 'byWho 计数')
  ok(G.openCommitments(recs, '甲').length === 1 && G.openCommitments(recs, '乙').length === 1, '待办队列按人过滤')
  ok(G.relationsOf(recs, '甲').length === 2, '按人取全部关系与承诺（双向）')
  ok(G.relationsOf(recs, '查无此人').length === 0, '未知主体返回空（不抛）')
}

console.log('== F. 集成不变量：环记录无 md 投影、不被镜像吞 ==')
{
  const root = join(tmp, 'lib1')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'USER.md'), '# USER.md\n\n- [偏好] 开源优先 ← 源: notes/user.md §偏好\n', 'utf8')
  H.mirrorAll(root, AT, ['USER.md'])
  let recs = H.loadStore(root).records
  const rel = G.assertRelation(recs, { who: '甲', note: '在意磁盘', at: AT })
  const com = G.openCommitment(rel.records, { who: '甲', what: 'D1', direction: 'owed-by-me', at: AT })
  H.saveStoreRecords(root, com.records)
  H.mirrorFile(root, 'USER.md', 'T2') // 按文件整片替换
  const after = H.loadStore(root).records
  ok(after.some((r) => r.id === rel.id && r.kind === 'relation'), '**镜像不吞关系记录**')
  ok(after.some((r) => r.id === com.id && r.kind === 'commitment'), '**镜像不吞承诺记录**')
  ok(H.parityOf(root, ['USER.md'])[0].ok === true, '环记录存在不影响 md 对账')
  const ring = R.ringCensus(after)
  ok(ring.relation === 2, `环普查可见（relation:${ring.relation}）`)
}

console.log('== G. 走形判定：承诺状态变更必须被 diff 识别 ==')
{
  const a = S.makeRecord({ text: '[承诺] 我欠 甲：D1', file: '', kind: 'commitment', id: 'commitment:d1', meta: { status: 'pending' } })
  const b = { ...a, meta: { status: 'kept', settledAt: AT } }
  ok(S.diffRecords([a], [b]).changed.length === 1, '状态迁移被识别为内容变更（否则兑现对账不可见）')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
