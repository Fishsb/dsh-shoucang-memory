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
  const bad = G.settleCommitment(recs, 'commitment:不存在', { status: 'kept', evidence: 'e', at: AT })
  ok(bad.ok === false && /不存在/.test(bad.reason), '未知承诺 id ⇒ 拒绝')
  // 结清
  const kept = G.settleCommitment(recs, c1.id, { status: 'kept', evidence: '迁移路径与回滚步骤已写入 notes/flows.md §切源', note: '已给迁移路径', at: AT })
  ok(kept.ok, '结清成功')
  recs = kept.records
  ok(recs.find((r) => r.id === c1.id).meta.status === 'kept' && recs.find((r) => r.id === c1.id).meta.settledAt === AT, '状态迁移 + 落 settledAt')
  ok(G.openCommitments(recs).length === 0, '结清后**出待办队列**（队列不是噪声）')
  ok(G.settleCommitment(recs, c1.id, { status: 'broken', evidence: 'e', at: AT }).ok === false, '重复结清被拒（兑现率不许虚高）')
  ok(recs.length === 1, '结清不新增记录（状态迁移，非追加）')
  // broken 路径
  const c2 = G.openCommitment(recs, { who: '用户', what: '另一个承诺', direction: 'owed-by-me', at: AT })
  const br = G.settleCommitment(c2.records, c2.id, { status: 'broken', evidence: '到期未做，无交付物', at: AT })
  ok(br.ok && G.openCommitments(br.records).length === 0, 'broken 也出队')
}

console.log('== C′. **结必有证**（册零/册一 · 2026-09-20）：空证据拒结 + 证据可溯 + 重放豁免 ==')
{
  let recs = []
  const c = G.openCommitment(recs, { who: '甲', what: '要交付 X', direction: 'owed-by-me', at: AT }); recs = c.records
  /* 先红证据（记录在案）：本组断言在**改实现前**必须红 —— 现实现里空证据照结。
   * 实测改前：`settleCommitment(recs, id, {status:'kept', evidence:'', at})` ⇒ `ok:true`（照结）。 */
  const noEv = G.settleCommitment(recs, c.id, { status: 'kept', evidence: '', at: AT })
  ok(noEv.ok === false && /证据/.test(noEv.reason), '**空证据 ⇒ 拒结**（结必有证：兑现率的唯一闸）')
  const blank = G.settleCommitment(recs, c.id, { status: 'kept', evidence: '   \n  ', at: AT })
  ok(blank.ok === false, '**纯空白证据 ⇒ 拒**（trim 后再判，防"填了空格就算有证据"）')
  ok(noEv.records.find((r) => r.id === c.id).meta?.status === 'pending', '被拒时**状态不变**（真拒，不是"拒了但仍改"）')
  // 有证据 ⇒ 落 evidence/settledBy
  const good = G.settleCommitment(recs, c.id, { status: 'kept', evidence: '文件 docs/x.md 已交付并复验', settledBy: 'user', at: AT })
  ok(good.ok, '有证据 ⇒ 照结')
  const g = good.records.find((r) => r.id === c.id)
  ok(g.meta.evidence === '文件 docs/x.md 已交付并复验', '**证据落库**（`meta.evidence` 逐字）')
  ok(g.meta.settledBy === 'user', '**执行者落库**（`meta.settledBy`：谁判的，此前不可分辨）')
  ok(g.meta.note === undefined || g.meta.note === '', '证据与 note **各司其职**（不动既有 note 字段）')
  // 缺省不写 settledBy（**只增字段**的最小形态）；显式给了才落
  const c2 = G.openCommitment(recs, { who: '乙', what: 'Y', direction: 'owed-by-me', at: AT })
  const d2 = G.settleCommitment(c2.records, c2.id, { status: 'kept', evidence: 'e', at: AT })
  ok(d2.records.find((r) => r.id === c2.id).meta.settledBy === undefined, '缺省**不写** `settledBy`（只增字段的最小形态）')
  const c2b = G.openCommitment(recs, { who: '乙2', what: 'Y2', direction: 'owed-by-me', at: AT })
  const d2b = G.settleCommitment(c2b.records, c2b.id, { status: 'kept', evidence: 'e', settledBy: 'cli', at: AT })
  ok(d2b.records.find((r) => r.id === c2b.id).meta.settledBy === 'cli', '显式 `settledBy:cli` 照落（可追溯）')
  // **重放豁免**（关键）：事件重放必须能重建历史（历史载荷无 evidence 字段），故须跳过证据门
  const rp = G.settleCommitment(good.records, c.id, { status: 'kept', replay: true, at: AT })
  ok(rp.ok === false && /已结清/.test(rp.reason), '（前提核对）已结清者即使走重放分支也**幂等拒绝**（豁免不放松幂等）')
  const fresh = G.openCommitment([], { who: '丙', what: 'Z', direction: 'owed-by-me', at: AT })
  const rp2 = G.settleCommitment(fresh.records, fresh.id, { status: 'kept', replay: true, at: AT })
  ok(rp2.ok === true, '**`replay:true` 跳过证据门**（否则全库历史事件再也重放不出来 ⇒ 对账恒红）')
  const rmeta = rp2.records.find((r) => r.id === fresh.id).meta
  ok(rmeta.evidence === undefined && rmeta.settledBy === undefined, '**重放（载荷无该字段）不补写新键**（对账不变式：重放须逐字重建 store 的 meta）')
  // 反向：**带证据的新事件**重放时必须把证据重建出来（否则新一轮对账反而红）
  const rp3 = G.settleCommitment(fresh.records, fresh.id, { status: 'kept', evidence: '交付物已存在', settledBy: 'user', replay: true, at: AT })
  const rmeta3 = rp3.records.find((r) => r.id === fresh.id).meta
  ok(rmeta3.evidence === '交付物已存在' && rmeta3.settledBy === 'user', '**重放（载荷含证据）照常重建证据**（新老事件各自对账都成立）')
}

console.log('== D. 双向兑现率（方向不许合成一个数）==')
{
  let recs = []
  // 我欠用户：1 兑现 1 未兑现
  const a = G.openCommitment(recs, { who: '甲', what: 'A1', direction: 'owed-by-me', at: AT }); recs = a.records
  const b = G.openCommitment(recs, { who: '甲', what: 'A2', direction: 'owed-by-me', at: AT }); recs = b.records
  recs = G.settleCommitment(recs, a.id, { status: 'kept', evidence: 'ea', at: AT }).records
  recs = G.settleCommitment(recs, b.id, { status: 'broken', evidence: 'eb', at: AT }).records
  // 甲欠我：2 兑现
  const c = G.openCommitment(recs, { who: '甲', what: 'B1', direction: 'owed-to-me', at: AT }); recs = c.records
  const d = G.openCommitment(recs, { who: '甲', what: 'B2', direction: 'owed-to-me', at: AT }); recs = d.records
  recs = G.settleCommitment(recs, c.id, { status: 'kept', evidence: 'ec', at: AT }).records
  recs = G.settleCommitment(recs, d.id, { status: 'kept', evidence: 'ed', at: AT }).records
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

console.log('== D′. **KPI 判别力**（册四 · 2026-09-20）：`0` 的两种含义必须当场可辨 ==')
{
  // 情形 1：**从未结算过**（全 pending）⇒ rate=0，但绝不是"全未兑现"
  let recs = []
  const a = G.openCommitment(recs, { who: '甲', what: 'A1', direction: 'owed-by-me', at: AT }); recs = a.records
  const b = G.openCommitment(recs, { who: '甲', what: 'A2', direction: 'owed-by-me', at: AT }); recs = b.records
  const t1 = G.trustOf(recs, '甲')
  ok(t1.mineRate === 0 && t1.minePending === 2 && t1.mineBroken === 0, '**未结算**：rate=0 但 pending=2 / broken=0（两义可辨）')
  // 情形 2：**全未兑现**（都 broken）⇒ rate=0 且 pending=0
  let r2 = recs
  r2 = G.settleCommitment(r2, a.id, { status: 'broken', evidence: '到期无交付', at: AT }).records
  r2 = G.settleCommitment(r2, b.id, { status: 'broken', evidence: '到期无交付', at: AT }).records
  const t2 = G.trustOf(r2, '甲')
  ok(t2.mineRate === 0 && t2.minePending === 0 && t2.mineBroken === 2, '**全未兑现**：rate=0 但 pending=0 / broken=2')
  ok(JSON.stringify(t1) !== JSON.stringify(t2), '**两种 `0` 的输出不同**（判别力核心：否则指标失去意义）')
  // 分母口径**不许漂移**：pending 不进分母
  const r3 = G.openCommitment(r2, { who: '甲', what: 'A3', direction: 'owed-by-me', at: AT })
  const t3 = G.trustOf(r3.records, '甲')
  ok(t3.mineRate === 0 && t3.minePending === 1, '**pending 不进分母**（否则"未结算"被伪装成"未兑现"）')
  // 方向**不许合成**（反例自证）：我欠 kept / 欠我 broken ⇒ 两个 rate 各为 1 / 0，不得输出单一 0.5
  let r4 = []
  const m1 = G.openCommitment(r4, { who: '乙', what: 'M1', direction: 'owed-by-me', at: AT }); r4 = m1.records
  const t1c = G.openCommitment(r4, { who: '乙', what: 'T1', direction: 'owed-to-me', at: AT }); r4 = t1c.records
  r4 = G.settleCommitment(r4, m1.id, { status: 'kept', evidence: 'e', at: AT }).records
  r4 = G.settleCommitment(r4, t1c.id, { status: 'broken', evidence: 'e', at: AT }).records
  const t4 = G.trustOf(r4, '乙')
  ok(t4.mineRate === 1 && t4.theirsRate === 0, `**方向不合成的反例**：我欠率 ${t4.mineRate} · 欠我率 ${t4.theirsRate}（不得输出单一 0.5）`)
  // 无据可溯计数：存量历史条目（无 `meta.evidence`）必须**可见**
  const legacy = [{ ...r4[0], meta: { who: '乙', status: 'kept', direction: 'owed-by-me', settledAt: AT } }]
  const t5 = G.trustOf(legacy, '乙')
  ok(t5.mineEvidenceMissing === 1, '**`evidenceMissing` 可见**（存量已结清但无据者，不假装有证据）')
  // 逾期计数（册三口径）：给了 `overdueAt` 才算，缺省 0 ⇒ 与旧行为逐字等价
  let r5 = []
  const o1 = G.openCommitment(r5, { who: '丙', what: '已逾期', direction: 'owed-by-me', due: '2026-09-01', at: AT }); r5 = o1.records
  const o2 = G.openCommitment(r5, { who: '丙', what: '未到期', direction: 'owed-by-me', due: '2027-01-01', at: AT }); r5 = o2.records
  const t6 = G.trustOf(r5, '丙', AT)
  ok(t6.mineOverdue === 1, `**逾期计数**（due=09-01 已过 ⇒ overdue=1；未到期的那个不算）`)
  ok(G.trustOf(r5, '丙').mineOverdue === 0, '**缺省不算逾期**（调用方零迁移 ⇒ 与旧行为逐字等价）')
}

console.log('== D″. **待裁决队列**（册三 · 2026-09-20）：逾期进队列，但**绝不自动 broken** ==')
{
  let recs = []
  const od = G.openCommitment(recs, { who: '甲', what: '已逾期', direction: 'owed-by-me', due: '2026-09-01', at: AT }); recs = od.records
  const soon = G.openCommitment(recs, { who: '甲', what: '临近', direction: 'owed-by-me', due: '2026-09-18', at: AT }); recs = soon.records
  const far = G.openCommitment(recs, { who: '甲', what: '远期', direction: 'owed-by-me', due: '2027-01-01', at: AT }); recs = far.records
  const noDue = G.openCommitment(recs, { who: '甲', what: '无期限', direction: 'owed-by-me', at: AT }); recs = noDue.records
  const bad = G.openCommitment(recs, { who: '甲', what: '坏时间戳', direction: 'owed-by-me', due: '不是日期', at: AT }); recs = bad.records
  const settled = G.openCommitment(recs, { who: '甲', what: '已结清', direction: 'owed-by-me', due: '2026-09-01', at: AT }); recs = settled.records
  recs = G.settleCommitment(recs, settled.id, { status: 'kept', evidence: 'e', at: AT }).records
  // T = 2026-09-20
  const q = G.overdueCommitments(recs, AT)
  ok(q.length === 2, `待裁决队列 = ${q.length} 条（已逾期 + 7 天内临近；远期/无 due/坏时间戳/已结清都不入）`)
  ok(q[0].overdue === true && q[0].record.id === od.id, '**过期在前**（最该被看见的排最前）')
  ok(q[1].overdue === false && q[1].record.id === soon.id, '临近者在后（`overdue:false`，语义与 `dueSoon` 同源）')
  ok(!q.some((x) => x.record.id === far.id), '远期不入队')
  ok(!q.some((x) => x.record.id === noDue.id), '无 due 不入队（不是"逾期"）')
  ok(!q.some((x) => x.record.id === bad.id), '**坏时间戳不入队**（与 `dueSoon` 同纪律，不抛）')
  ok(!q.some((x) => x.record.id === settled.id), '已结清不入队（队列只收 pending）')
  /* **最重的一条**：本操作是**纯读** —— 记录集与台账必须**逐字节不变**。
   * 判因（方案档红线）：逾期 ≠ 未兑现；自动 broken 会把"其实已交付只是没回写"的条目
   * 判成不兑现，直接污染 `trustOf`。故此处用**序列化前后全等**钉住"零副作用"。 */
  const before = JSON.stringify(recs)
  G.overdueCommitments(recs, AT)
  G.overdueCommitments(recs, '2027-01-01T00:00:00.000Z')
  ok(JSON.stringify(recs) === before, '**零副作用**：连跑两次后记录集逐字节不变（不是"看着没变"）')
  ok(recs.every((r) => r.meta?.status !== 'broken'), '**从未自动 broken**（红线：逾期不证明没做）')
  ok(G.overdueCommitments([], AT).length === 0, '空集 ⇒ 0 条（N=0 显式）')
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
