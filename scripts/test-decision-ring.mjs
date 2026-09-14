#!/usr/bin/env node
// test-decision-ring.mjs —— G1 决策环 + 环注册表 **直接单测**（rings.ts / decision-ring.ts）
//
// 为什么必须有这一件：决策环的核心不是"记裁决"，是**后果回收**——而回收一旦重复或漏挂，
//   记分卡就开始撒谎（重复产记录 ⇒ hits 虚高；漏挂 ⇒ pending 永远不清）。
//   另有三条来自三轮讨论的结论必须钉死，否则会静默退化：
//     · **免频率门**：一次性裁决/价态即成立（既有 `minTraces≥3` 频率门会结构性杀死它）；
//     · **环记录无 md 投影**：`file=''` 的记录不得被 `mirrorFile` 的按文件替换吞掉；
//     · **新增类型必须登记环**：否则 check-ring-coverage 应翻红（此处直接断言谓词）。
//
// 用法: node scripts/test-decision-ring.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
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
const D = await import(load('lib/decision-ring.js'))
const H = await import(load('lib/record-shadow.js'))

const tmp = mkdtempSync(join(tmpdir(), 'sc-ring-'))
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 清理失败无害 */ } })

const AT = '2026-09-13T00:00:00.000Z'

console.log('== A. 环登记（新增类型必须登记生命周期）==')
{
  ok(R.uncoveredKinds().length === 0, `KINDS ${S.KINDS.length} 类全部登记环归属`)
  ok(R.emptyUndeclaredRings().length === 0, '无未申报空环')
  // 棘轮：G2 关系环已落地 ⇒ relation 必须已从 RING_PENDING 撤销（申报表不许留陈旧项）
  ok(R.RING_PENDING.length === 0, 'RING_PENDING 全清空（G2/G3 均落地 ⇒ 无豁免申报）')
  ok(R.stalePendingRings().length === 0, '无陈旧 pending 申报（已落 kind 的环不得仍申报豁免）')
  ok(R.ringOfKind('decision') === 'decision' && R.ringOfKind('outcome') === 'decision', 'decision/outcome 归决策环')
  ok(R.ringOfKind('valence') === 'value', 'valence 归价值环')
  ok(R.ringOfKind('prose') === 'none' && R.ringOfKind('structure') === 'none', 'prose/structure 属 none（无生命周期语义）')
  // 讨论结论的机械化：免频率门环
  ok(R.FREQUENCY_FREE_RINGS.includes('association'), '联想环免频率门（一次性洞见不被 ≥3 痕迹门杀死）')
  ok(R.FREQUENCY_FREE_RINGS.includes('decision'), '决策环免频率门（一条裁决即成立）')
  ok(R.isFrequencyFree('association') && !R.isFrequencyFree('fact'), 'isFrequencyFree 谓词可用（事实环仍受重现约束）')
}

console.log('== B. 开裁决（id 派生 + 影响后续回收的载荷）==')
{
  let recs = []
  const r1 = D.openDecision(recs, { text: '拍板：切 storeMode=dual', predicted: '对账零差异', rationale: '前置三项已绿', alternatives: '直接切 record（风险高）', evidence: 'session-a', at: AT })
  recs = r1.records
  ok(recs.length === 1 && recs[0].kind === 'decision', '开裁决产生一条 decision 记录')
  ok(recs[0].meta?.predicted === '对账零差异' && recs[0].meta?.rationale === '前置三项已绿', '预测与理由存进 meta（后果回收的对照项）')
  ok(recs[0].meta?.alternatives === '直接切 record（风险高）', '被否方案存进 meta（防重复讨论已否决项）')
  ok(recs[0].file === '', '环记录 file=\'\'（**无 md 投影**，详见 G 组）')
  ok(recs[0].createdAt === AT, 'stampRecord 落 createdAt')
  ok(D.openDecisions(recs).length === 1, '进入待回收队列')
  // 同文本幂等：再开一次不新增
  const r2 = D.openDecision(recs, { text: '拍板：切 storeMode=dual', at: AT })
  ok(r2.records.length === 1 && r2.id === r1.id, '同文本重开幂等（同 id 不重复堆积）')
}

console.log('== C. 后果回收（本环的核心）==')
{
  let recs = []
  const { records, id } = D.openDecision([], { text: '拍板 A', predicted: '会成功', at: AT })
  recs = records
  // 未知 id
  const bad = D.collectOutcome(recs, 'decision:不存在', { observed: 'x', at: AT })
  ok(bad.ok === false && /不存在/.test(bad.reason), '未知裁决 id ⇒ 拒绝（不静默产后果）')
  // 命中
  const hit = D.collectOutcome(recs, id, { observed: '对账零差异', hit: true, at: AT })
  ok(hit.ok && hit.hit === true, '回收命中')
  recs = hit.records
  ok(recs.some((r) => r.kind === 'outcome' && r.meta.decisionId === id && r.meta.hit === '1'), '产生 outcome 记录并挂回 decisionId')
  ok(recs.find((r) => r.id === id).meta.status === 'collected', '裁决状态改 collected（出待回收队列）')
  ok(D.openDecisions(recs).length === 0, '待回收队列清空')
  // 幂等：重复回收拒绝
  const dup = D.collectOutcome(recs, id, { observed: '又回收一次', hit: true, at: AT })
  ok(dup.ok === false && /已回收/.test(dup.reason), '重复回收被拒（记分卡不许虚高）')
  ok(dup.records.length === recs.length, '拒绝时不产记录')
  // 未命中 + 由价态推导命中
  const a = D.collectOutcome(D.openDecision([], { text: '拍板 B', at: AT }).records, D.openDecision([], { text: '拍板 B', at: AT }).id, { observed: '翻车了', valence: -1, at: AT })
  ok(a.ok && a.hit === false, '未给 hit 时由 valence<0 推导为未命中')
  const b = D.collectOutcome(D.openDecision([], { text: '拍板 C', at: AT }).records, D.openDecision([], { text: '拍板 C', at: AT }).id, { observed: '顺利', valence: 1, at: AT })
  ok(b.ok && b.hit === true, 'valence>0 推导为命中')
  // 同文本不同决策的后果不得撞 id
  const d1 = D.openDecision([], { text: '决策甲', at: AT })
  const d2recs = D.openDecision(d1.records, { text: '决策乙', at: AT }).records
  const o1 = D.collectOutcome(d2recs, d1.id, { observed: '同样的话', hit: true, at: AT })
  const d2id = d2recs.find((r) => r.text === '决策乙').id
  const o2 = D.collectOutcome(o1.records, d2id, { observed: '同样的话', hit: true, at: AT })
  const ids = o2.records.filter((r) => r.kind === 'outcome').map((r) => r.id)
  ok(new Set(ids).size === ids.length, '同文本后果挂不同决策 ⇒ id 不撞（显式 id 覆盖生效）')
}

console.log('== D. 价态采集（唯一的人工信号入口）==')
{
  const r1 = D.recordValence([], { trigger: '用户看到视觉走样', valence: -1, evidence: 'distill adfc3535', at: AT })
  ok(r1.records.length === 1 && r1.records[0].kind === 'valence', '采价态产生 valence 记录')
  ok(r1.records[0].meta.valence === '-1' && r1.records[0].meta.trigger === '用户看到视觉走样', 'meta 带 trigger/valence（存价态与触发条件，不存事件）')
  ok(/否定/.test(r1.records[0].text), '正文人读可辨（认可/否定/中性）')
  const again = D.recordValence(r1.records, { trigger: '用户看到视觉走样', valence: -1, at: 'T2' })
  ok(again.records.length === 1 && again.records[0].hits === 1, '同价态重现 ⇒ 累加 hits 而非新增（重现是"更稳固"的证据）')
  const pos = D.recordValence(again.records, { trigger: '用户看到视觉走样', valence: 1, at: AT })
  ok(pos.records.length === 2, '反向价态是另一条记录（符号进 id）')
}

console.log('== E. 记分卡（KPI 只从记录集推导）==')
{
  ok(D.scorecardOf([]).hitRate === 0 && D.scorecardOf([]).opened === 0, '空集不编造（hitRate=0 而非 NaN）')
  let recs = []
  const a = D.openDecision(recs, { text: '裁决甲', at: AT }); recs = a.records
  const b = D.openDecision(recs, { text: '裁决乙', at: AT }); recs = b.records
  recs = D.collectOutcome(recs, a.id, { observed: '成了', hit: true, at: AT }).records
  recs = D.collectOutcome(recs, b.id, { observed: '没成', hit: false, at: AT }).records
  recs = D.recordValence(recs, { trigger: '某个情境', valence: 1, at: AT }).records
  const sc = D.scorecardOf(recs)
  ok(sc.opened === 2 && sc.collected === 2 && sc.pending === 0, `开 ${sc.opened} / 收 ${sc.collected} / 待 ${sc.pending}`)
  ok(sc.hits === 1 && sc.misses === 1 && Math.abs(sc.hitRate - 0.5) < 1e-9, `命中率 ${sc.hitRate}`)
  ok(sc.valences === 1, '价态计数')
  ok(sc.missSamples.length === 1 && sc.missSamples[0] === '裁决乙', '未命中样本回指裁决正文（供复盘）')
  const sc2 = D.scorecardOf(D.openDecision(recs, { text: '裁决丙', at: AT }).records)
  ok(sc2.pending === 1, '新开裁决立刻计入待回收（"想不起来回收"可见）')
}

console.log('== F. 免频率门实证（讨论结论：一次性即成立）==')
{
  // 既有判据要求「同主题 ≥3 条痕迹」或「同型 ≥2 次」；决策/价态环**不得**受此约束。
  const once = D.openDecision([], { text: '只出现这一次的裁决', at: AT })
  ok(once.records.length === 1, '**单次**裁决即入库（不需要 ≥2 次重现）')
  const v = D.recordValence([], { trigger: '只出现这一次的价态', valence: -1, at: AT })
  ok(v.records.length === 1, '**单次**价态即入库')
  ok(D.scorecardOf(once.records).opened === 1, '记分卡立刻可见（不靠"痕迹累积"）')
}

console.log('== G. 集成不变量：环记录无 md 投影，且不被镜像吞掉 ==')
{
  const root = join(tmp, 'lib1')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'MEMORY.md'), '# MEMORY.md\n\n- [env] A · 概况 → notes/env.md §A\n', 'utf8')
  H.mirrorAll(root, AT, ['MEMORY.md'])
  const before = H.loadStore(root).records
  ok(before.length > 0, '镜像后影子库有索引记录')

  // 写入环记录（file=''）
  const dec = D.openDecision(before, { text: '裁决 X', predicted: '会成', at: AT })
  const val = D.recordValence(dec.records, { trigger: '情境 Y', valence: 1, at: AT })
  H.saveStoreRecords(root, val.records)
  ok(H.loadStore(root).records.some((r) => r.id === dec.id), '环记录已落影子库')

  // 再镜像同一 md 文件（按文件整片替换）——环记录必须存活
  H.mirrorFile(root, 'MEMORY.md', 'T2')
  const after = H.loadStore(root).records
  ok(after.some((r) => r.id === dec.id && r.kind === 'decision'), '**镜像不吞环记录**（file=\'\' 不在替换范围）')
  ok(after.some((r) => r.kind === 'valence'), '价态记录同样存活')
  ok(H.parityOf(root, ['MEMORY.md'])[0].ok === true, '环记录存在不影响 md 对账（对账只比投影文件）')
  const ring = R.ringCensus(after)
  ok(ring.decision === 1 && ring.value >= 1, `环普查可见（decision:${ring.decision} · value:${ring.value}）`)
}

console.log('== H. 走形判定含 meta（改了 meta 必须算变更）==')
{
  const a = S.makeRecord({ text: '裁决 Z', file: '', kind: 'decision', id: 'decision:z' })
  const b = { ...a, meta: { status: 'collected' } }
  ok(S.diffRecords([a], [b]).changed.length === 1, 'meta 变化被 diff 识别（否则回收状态变更对账不可见）')
  ok(S.diffRecords([a], [{ ...a, hits: 9 }]).changed.length === 0, '统计变化仍不算内容变更（对照）')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
