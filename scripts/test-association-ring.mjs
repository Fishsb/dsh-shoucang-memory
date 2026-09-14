#!/usr/bin/env node
// test-association-ring.mjs —— G3 联想环 **直接单测**（association-ring.ts）
//
// 为什么必须有这一件：联想环最容易在三个地方静默做错，而三处都**不会报错**：
//   ① **跨度门失守**：同 § 内的归纳被当成"碰撞"入库 ⇒ 联想环退化成第二个 principles 通道；
//   ② **免频率门被回归掉**：一次性碰撞被 ≥3 痕迹门挡在外面 ⇒ 洞见一条都进不来（讨论的核心结论）；
//   ③ **去重尺子错位**：碰撞存的是锚点、召回查的是记录 id ⇒ 已撞过的对**被反复推荐**（本模块初版真实踩过）。
//   另有落地回收幂等与镜像不吞两条不变量。
//
// 用法: node scripts/test-association-ring.mjs   （先 `npm run build:host`；npm test 已含 pretest）
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
const A = await import(load('lib/association-ring.js'))
const H = await import(load('lib/record-shadow.js'))

const tmp = mkdtempSync(join(tmpdir(), 'sc-assoc-'))
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 清理失败无害 */ } })
const AT = '2026-09-13T00:00:00.000Z'

/** 夹具：一条可注入的索引行（带指针 ⇒ 规范锚点 = 指针） */
const mk = (sec, file = 'MEMORY.md') => S.makeRecord({ text: `- [env] ${sec} · 概况`, file, pointer: `notes/${sec}.md §${sec}`, id: `k:${sec}` })

console.log('== A. 环登记（五个环全部落 kind，pending 清空）==')
{
  ok(R.ringOfKind('association') === 'association', 'association 归联想环')
  ok(R.RING_PENDING.length === 0, 'RING_PENDING 已清空（五个环全部落 kind）')
  ok(R.emptyUndeclaredRings().length === 0 && R.stalePendingRings().length === 0, '无空环、无陈旧申报')
  ok(R.uncoveredKinds().length === 0, `KINDS ${S.KINDS.length} 类全部登记环归属`)
  ok(R.kindsOfRing('association').length === 1, '联想环有 1 个 kind')
  ok(R.FREQUENCY_FREE_RINGS.includes('association'), '**免频率门**：联想环一次性即成立（讨论核心结论的契约化）')
  // 环普查五环齐备
  const c = R.ringCensus([mk('甲'), mk('乙')])
  ok(c.fact === 2 && c.association === 0, '环普查可用')
}

console.log('== B. 跨度门（硬门：≥2 个不同 §）==')
{
  const bad1 = A.recordCollision([], { a: '', b: 'notes/x.md §甲', context: 'c', at: AT })
  ok(bad1.ok === false && /锚点缺失/.test(bad1.reason), '缺锚点 ⇒ 拒')
  const bad2 = A.recordCollision([], { a: 'notes/x.md §甲', b: 'notes/x.md §甲', context: 'c', at: AT })
  ok(bad2.ok === false && /相同/.test(bad2.reason), '两锚点相同 ⇒ 拒（不是碰撞）')
  const bad3 = A.recordCollision([], { a: 'notes/x.md §甲', b: 'notes/y.md §甲', context: 'c', at: AT })
  ok(bad3.ok === false && /跨度不足/.test(bad3.reason), '**同 § ⇒ 拒**（同一主题内的归纳归 principles，不许冒充碰撞）')
  const bad4 = A.recordCollision([], { a: '- 画像行正文（无小节地址）', b: 'notes/y.md §乙', context: 'c', at: AT })
  ok(bad4.ok === false && /无 § 小节/.test(bad4.reason), '**锚点无 § 地址 ⇒ 拒**（否则任意两行都能判"不同 §"，跨度门形同虚设）')
  ok(A.hasSection('notes/x.md §甲') === true && A.hasSection('- 裸正文') === false, 'hasSection 口径')
  const good = A.recordCollision([], { a: 'notes/x.md §甲', b: 'notes/y.md §乙', context: '做 P4 时想到', insight: '往返闸与日志回放同型', accepted: true, evidence: 's1', at: AT })
  ok(good.ok === true && good.records.length === 1, '跨 § ⇒ 通过')
  ok(good.records[0].kind === 'association' && good.records[0].file === '', '落为 association 记录（无 md 投影）')
  ok(good.records[0].meta?.a === 'notes/x.md §甲' && good.records[0].meta?.b === 'notes/y.md §乙' && good.records[0].meta?.landed === '0', 'meta 存锚点/语境/落地起点')
  ok(A.sectionOf('notes/x.md §甲') === '甲' && A.sectionOf('无小节串') === '无小节串', 'sectionOf 口径（无 § 取整串）')
}

console.log('== C. 免频率门实证 + 同对重现语义 ==')
{
  const one = A.recordCollision([], { a: 'notes/a.md §一', b: 'notes/b.md §二', context: 'c', at: AT })
  ok(one.records.length === 1, '**单次**碰撞即入库（不需要重现 ≥2 次）')
  const again = A.recordCollision(one.records, { a: 'notes/b.md §二', b: 'notes/a.md §一', context: 'c', accepted: true, at: 'T2' })
  ok(again.records.length === 1 && again.records[0].hits === 1, '同一对再撞 ⇒ 累加 hits（锚点无序键去重）')
  ok(again.records[0].meta?.accepted === '1', '再撞时并入新的认可状态')
}

console.log('== D. 价态（认可/否定）记与改 ==')
{
  const c = A.recordCollision([], { a: 'notes/a.md §一', b: 'notes/b.md §二', context: 'c', at: AT })
  ok(c.records[0].meta?.accepted === undefined, '未表态时不写 accepted（不假装知道用户态度）')
  const m = A.markAccepted(c.records, c.id, false, AT)
  ok(m.ok && m.records[0].meta.accepted === '0', 'markAccepted 改认可状态（否定）')
  ok(A.markAccepted(c.records, 'association:不存在', true, AT).ok === false, '未知 id ⇒ 拒')
}

console.log('== E. 落地回收（幂等）==')
{
  const c = A.recordCollision([], { a: 'notes/a.md §一', b: 'notes/b.md §二', context: 'c', accepted: true, at: AT })
  ok(A.openCollisions(c.records).length === 1, '未登记落地 ⇒ 在待回收队列')
  ok(A.landCollision(c.records, 'association:不存在', { landed: true, at: AT }).ok === false, '未知 id ⇒ 拒')
  const l = A.landCollision(c.records, c.id, { landed: true, note: '写进了 criteria', at: AT })
  ok(l.ok && l.records[0].meta.landed === '1' && l.records[0].meta.landedAt === AT, '登记落地（成）')
  ok(A.landCollision(l.records, c.id, { landed: false, at: AT }).ok === false, '重复登记被拒（幂等）')
  ok(A.openCollisions(l.records).length === 0, '登记后出队')
  const c2 = A.recordCollision([], { a: 'notes/a.md §一', b: 'notes/b.md §二', context: 'c', at: AT })
  const l2 = A.landCollision(c2.records, c2.id, { landed: false, at: AT })
  ok(l2.records[0].meta.landed === '0-' && A.openCollisions(l2.records).length === 0, '登记未落地也用 `0-` 区分于初始 `0`（否则永远"未回收"）')
}

console.log('== F. 普查（落地率只对已认可者算）==')
{
  let recs = []
  const c1 = A.recordCollision(recs, { a: 'notes/a.md §一', b: 'notes/b.md §二', context: 'c', accepted: true, at: AT }); recs = c1.records
  const c2 = A.recordCollision(recs, { a: 'notes/c.md §三', b: 'notes/d.md §四', context: 'c', accepted: false, at: AT }); recs = c2.records
  const c3 = A.recordCollision(recs, { a: 'notes/e.md §五', b: 'notes/f.md §六', context: 'c', at: AT }); recs = c3.records
  recs = A.landCollision(recs, c1.id, { landed: true, at: AT }).records
  const cen = A.associationCensus(recs)
  ok(cen.collisions === 3 && cen.accepted === 1 && cen.denied === 1 && cen.unstated === 1, `普查 碰撞${cen.collisions}/认可${cen.accepted}/否定${cen.denied}/未表态${cen.unstated}`)
  ok(cen.landed === 1 && cen.landedRate === 1, `落地率 ${cen.landedRate}（分母=已认可者，不是全部碰撞）`)
  ok(cen.pending === 2, '待回收 = 未登记落地的（含未表态者）')
  ok(A.associationCensus([]).landedRate === 0, '空集报 0（不 NaN）')
}

console.log('== G. 越界召回（独立于相关性；确定性）==')
{
  const recs = [mk('甲'), mk('乙'), mk('丙'), mk('丁', 'USER.md')]
  const p = A.serendipityPairs(recs, { seed: 's1', k: 10 })
  ok(p.length > 0, `产出候选对 ${p.length} 对`)
  ok(p.every((x) => x.a.section !== x.b.section), '**所有候选对跨 §**（不推荐同主题自撞）')
  ok(p.every((x) => x.a.id !== x.b.id), '不成自反对')
  const p2 = A.serendipityPairs(recs, { seed: 's1', k: 10 })
  ok(JSON.stringify(p) === JSON.stringify(p2), '同 seed ⇒ 结果逐字可复现（可作回归基线）')
  ok(A.serendipityPairs(recs, { seed: 's1', k: 2 }).length === 2, 'k 生效')
  ok(A.serendipityPairs([], { seed: 's' }).length === 0, '空池 ⇒ 空（不抛）')
  // 结构/空白行不参与
  const withStruct = recs.concat([S.makeRecord({ text: '# 标题', file: 'MEMORY.md', id: 'k:struct' })])
  const p3 = A.serendipityPairs(withStruct, { seed: 's1', k: 10 })
  ok(!p3.some((x) => x.a.id === 'k:struct' || x.b.id === 'k:struct'), '结构行被排除（不可注入的东西不参与联想）')
  // 无 § 地址的行（画像行/裸正文）不进候选池 —— 真库实测暴露：否则 span 恒为满分，跨度门形同虚设
  const withProfile = recs.concat([S.makeRecord({ text: '- 用户偏好：极简 ← 源: distill x', file: 'USER.md', id: 'k:profile' })])
  const p4 = A.serendipityPairs(withProfile, { seed: 's1', k: 10 })
  ok(!p4.some((x) => x.a.id === 'k:profile' || x.b.id === 'k:profile'), '无 § 地址的行不进候选池（画像行不参与越界召回）')
  const anchorHasSection = (list, id) => { const r = list.find((x) => x.id === id); return !!r && A.hasSection(A.anchorOfRecord(r)) }
  ok(p4.every((x) => anchorHasSection(withProfile, x.a.id) && anchorHasSection(withProfile, x.b.id)), '候选锚点均带 § 地址（可寻址者才配当碰撞种子）')

  // perSection 生效：4 段 × 3 条，perSection=1 时最多 C(4,2)=6 对
  const many = []
  for (const sec of ['甲', '乙', '丙', '丁']) for (let i = 0; i < 3; i++) many.push({ ...mk(`${sec}${i}`), pointer: `notes/${sec}.md §${sec}`, id: `m:${sec}:${i}` })
  const cap1 = A.serendipityPairs(many, { seed: 's', k: 100, maxPerSection: 1 })
  const cap3 = A.serendipityPairs(many, { seed: 's', k: 100, maxPerSection: 3 })
  ok(cap1.length === 6, `每 § 取 1 条 ⇒ 恰好 C(4,2)=6 对（实测 ${cap1.length}）`)
  ok(cap3.length > cap1.length, `放宽每 § 取数 ⇒ 候选变多（${cap1.length} → ${cap3.length}）`)
}

console.log('== H. 去重尺子一致（本模块初版真实踩过的缺陷）==')
{
  const recs = [mk('甲'), mk('乙'), mk('丙')]
  const before = A.serendipityPairs(recs, { seed: 's', k: 10 })
  ok(before.length > 0, '先有候选')
  const target = before[0]
  const collided = A.collideRecords(recs, target.a.id, target.b.id, { context: '已撞过', accepted: true, at: AT })
  ok(collided.ok === true, '按记录 id 记碰撞（anchorOfRecord 推导锚点）')
  const after = A.serendipityPairs(collided.records, { seed: 's', k: 10 })
  const key = [target.a.id, target.b.id]
  const stillThere = after.some((x) => [x.a.id, x.b.id].sort().join() === key.sort().join())
  ok(stillThere === false, '**已撞过的对不再被推荐**（锚点口径与排除集同尺子）')
  ok(A.collideRecords(recs, 'k:不存在', target.b.id, { context: 'x', at: AT }).ok === false, '未知记录 id ⇒ 拒')
  ok(A.anchorOfRecord(recs[0]) === 'notes/甲.md §甲', 'anchorOfRecord 取指针为规范锚点')
}

console.log('== I. 集成：镜像不吞碰撞记录；走形可辨 ==')
{
  const root = join(tmp, 'lib1')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'MEMORY.md'), '# MEMORY.md\n\n- [env] 甲 · 概况 → notes/甲.md §甲\n', 'utf8')
  H.mirrorAll(root, AT, ['MEMORY.md'])
  const c = A.recordCollision(H.loadStore(root).records, { a: 'notes/甲.md §甲', b: 'notes/乙.md §乙', context: 'c', accepted: true, at: AT })
  H.saveStoreRecords(root, c.records)
  H.mirrorFile(root, 'MEMORY.md', 'T2')
  const after = H.loadStore(root).records
  ok(after.some((r) => r.id === c.id && r.kind === 'association'), '**镜像不吞碰撞记录**')
  ok(H.parityOf(root, ['MEMORY.md'])[0].ok === true, '碰撞记录不影响 md 对账')
  ok(R.ringCensus(after).association === 1, '环普查可见联想环')
  const a = S.makeRecord({ text: '[碰撞] x ⨯ y｜c', file: '', kind: 'association', id: 'association:z', meta: { landed: '0' } })
  const b = { ...a, meta: { landed: '1', landedAt: AT } }
  ok(S.diffRecords([a], [b]).changed.length === 1, '落地状态变更被 diff 识别')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
