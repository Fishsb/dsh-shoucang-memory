#!/usr/bin/env node
// test-assertion-graph.mjs —— **断言图内核**单测（`assertion-graph.ts` · 2026-09-13）
//
// 为什么必须有这一件：断言图是**派生视图**，它的错误全部是"静默错图"——边连错了不会报错，
//   只会让人据此做出错误判断（"这条决策没有后果回收"其实有，只是边没连上）。
//   故把每条边的**出现条件**与**不出现条件**都钉成断言（尤其：不该连的不能连，如跨 kind 的替代边）。
//
// 用法: node scripts/test-assertion-graph.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const { buildGraph, neighborsOf, nearPairs, graphCensus } = await import(load('lib/assertion-graph.js'))

/** 造一条最小 MemRecord（只给本图关心的字段） */
const rec = (over) => ({
  id: 'x', kind: 'fact', subject: 'knowledge', scope: 'global', text: 't', source: '', tag: '', pointer: '',
  file: '', order: 0, eol: '\n', maturity: 0, lifecycle: 'active', hits: 0, lastHit: '',
  createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z', ...over,
})

console.log('== A. 节点：记录 + 外部锚 + 去重 ==')
{
  const rs = [
    rec({ id: 'd1', kind: 'decision', meta: { status: 'collected' } }),
    rec({ id: 'o1', kind: 'outcome', meta: { decisionId: 'd1', hit: '1' } }),
    rec({ id: 'f1', kind: 'fact', pointer: 'notes/env.md', source: 'distill abc' }),
    rec({ id: 'f1', kind: 'fact', pointer: 'notes/env.md' }), // 同 id 重复 ⇒ 只入图一次
  ]
  const g = buildGraph(rs)
  ok(g.nodes.filter((n) => !n.anchor).length === 3, `A1 记录节点 3（同 id 去重；实测 ${g.nodes.filter((n) => !n.anchor).length}）`)
  ok(g.nodes.filter((n) => n.anchor).length === 2, `A2 外部锚 2（ptr + src；实测 ${g.nodes.filter((n) => n.anchor).length}）`)
  ok(g.stats.nodes === 5 && g.stats.anchors === 2, 'A3 stats 记节点与锚数')
}

console.log('== B. 边：answers（后果回收）==')
{
  const g = buildGraph([rec({ id: 'd1', kind: 'decision' }), rec({ id: 'o1', kind: 'outcome', meta: { decisionId: 'd1', hit: '1' } })])
  const e = g.edges.find((x) => x.rel === 'answers')
  ok(!!e && e.from === 'o1' && e.to === 'd1', `B1 outcome → decision（${e && `${e.from}→${e.to}`}）`)
  ok(!!e && e.note === '1', 'B2 边带 hit 附属事实')
  const g2 = buildGraph([rec({ id: 'o2', kind: 'outcome', meta: {} })])
  ok(g2.edges.filter((x) => x.rel === 'answers').length === 0, 'B3 无 decisionId ⇒ **不连边**（不猜）')
}

console.log('== C. 边：collision（联想环）+ landed 标记 ==')
{
  const g = buildGraph([rec({ id: 'a1', kind: 'association', meta: { a: 'notes/x.md §一', b: 'notes/y.md §二', landed: '1' } })])
  const cs = g.edges.filter((e) => e.rel === 'collision')
  ok(cs.length === 2, `C1 撞两个 § ⇒ 两条边（实测 ${cs.length}）`)
  ok(cs.every((e) => e.note === 'landed'), 'C2 landed=1 ⇒ 边标 landed')
  ok(cs.map((e) => e.to).sort().join('|') === 'sec:notes/x.md §一|sec:notes/y.md §二', 'C3 指向两个 § 锚（不是别的）')
}

console.log('== D. 边：commitment / relation（关系环）==')
{
  const g = buildGraph([
    rec({ id: 'c1', kind: 'commitment', subject: 'user', meta: { who: '用户', direction: 'owed-by-me', status: 'pending' } }),
    rec({ id: 'r1', kind: 'relation', subject: 'user', meta: { who: '用户', level: '2' } }),
  ])
  const ce = g.edges.find((e) => e.rel === 'commitment')
  ok(!!ce && ce.to === 'party:用户' && ce.note === 'owed-by-me/pending', `D1 承诺边带方向与状态（${ce && ce.note}）`)
  const re = g.edges.find((e) => e.rel === 'relation')
  ok(!!re && re.to === 'party:用户', 'D2 关系边指向关系方（不是 subject 字段本身）')
  ok(g.nodes.some((n) => n.id === 'party:用户' && n.anchor), 'D3 关系方作为锚节点存在')
}

console.log('== E. 边：时态替代（supersede）——**只在同一 kind+subject 内** ==')
{
  const g = buildGraph([
    rec({ id: 'old', kind: 'fact', subject: 'knowledge', validTo: '2026-09-01T00:00:00.000Z' }),
    rec({ id: 'new', kind: 'fact', subject: 'knowledge' }),
    rec({ id: 'other', kind: 'decision', subject: 'knowledge' }), // 同 subject 异 kind ⇒ 不连
  ])
  const se = g.edges.filter((e) => e.rel === 'supersede')
  ok(se.length === 1 && se[0].from === 'old' && se[0].to === 'new', `E1 失效→活跃（实测 ${se.map((e) => `${e.from}→${e.to}`).join(',')}）`)
  ok(!se.some((e) => e.from === 'other' || e.to === 'other'), 'E2 **跨 kind 不连替代边**（不同环的谱系不可混）')
  ok(g.stats.expired === 1 && g.stats.live === 2, 'E3 live/expired 计数正确')
  const g2 = buildGraph([rec({ id: 'x', lifecycle: 'retired' }), rec({ id: 'y' })])
  ok(g2.edges.filter((e) => e.rel === 'supersede').length === 1, 'E4 lifecycle=retired 也算失效（不只是 validTo）')
}

console.log('== F. 邻域查询（两个方向）==')
{
  const g = buildGraph([rec({ id: 'o1', kind: 'outcome', meta: { decisionId: 'd1' } }), rec({ id: 'd1', kind: 'decision' })])
  ok(neighborsOf(g, 'o1').out.length === 1 && neighborsOf(g, 'o1').in.length === 0, 'F1 o1 出边 1 / 入边 0')
  ok(neighborsOf(g, 'd1').in.length === 1 && neighborsOf(g, 'd1').out.length === 0, 'F2 d1 入边 1 / 出边 0（"谁回答了我"）')
  const n = neighborsOf(g, '不存在')
  ok(n.out.length === 0 && n.in.length === 0, 'F3 未知 id ⇒ 空邻域（不抛）')
}

console.log('== G. 近邻候选对：**候选生成交向量**（取代原 pointer 分组）==')
{
  const { nearPairs } = await import(load('lib/assertion-graph.js'))
  // 同 pointer ≠ 同一件事；向量近才是候选。故意造"同 pointer 但向量远"与"异 pointer 但向量近"。
  const rs = [
    rec({ id: 'p1', pointer: 'notes/x.md §A', text: '甲说法' }),
    rec({ id: 'p2', pointer: 'notes/y.md §B', text: '甲说法（同一件事，异节）' }),
    rec({ id: 'p3', pointer: 'notes/x.md §A', text: '完全另一回事' }),
    rec({ id: 'p4', text: '   ' }), // 空文本：不参与
    rec({ id: 'p5', text: '孤例' }),
  ]
  // 向量用**正交基**（[1,0,0]/[0,1,0]/[0,0,1]）⇒ 两两余弦是**精确的 0**，不靠眼估。
  //   ⚠ 教训（本会话第四次夹具错）：我上一版写 [0,1] 与 [0.1,0.9] 想表达"都远离"，
  //     实际二者几乎平行（cos≈0.994）⇒ 凭空多出一对候选。**合成向量必须正交或算出来，别目测。**
  const V = (x, y, z = 0) => [x, y, z] // z 默认 0：两参三参两种写法都对（上一版改签名后漏改调用点 ⇒ undefined ⇒ NaN）
  const vecs = [V(1, 0, 0), V(0.99, 0.01, 0), V(0, 1, 0), V(0, 0, 1), V(0, 0, 1)]
  const r = nearPairs(rs, vecs, { topK: 3, minSim: 0.9, maxN: 100 })
  ok(r.pairs.length === 1, `G1 只有 p1⨯p2 成候选（实测 ${r.pairs.length}）`)
  ok(r.pairs[0].sim >= 0.9 && [r.pairs[0].a.id, r.pairs[0].b.id].sort().join(',') === 'p1,p2', `G2 命中的是向量近的那对（${r.pairs[0].a.id}⨯${r.pairs[0].b.id}）`)
  ok(r.pairs[0].samePointer === false, 'G3 **异 pointer 也能成候选**（旧版按 pointer 分组会漏掉它）')
  ok(!r.pairs.some((x) => x.a.id === 'p3' || x.b.id === 'p3'), 'G4 **同 pointer 但向量远 ⇒ 不成候选**（旧版会误报）')
  ok(r.considered === 4, `G5 空文本被排除（considered=${r.considered}：p1/p2/p3/p5）`)
  ok(r.skipped === 0, 'G6 未超 maxN ⇒ skipped=0')
  const capped = nearPairs(rs, vecs, { topK: 3, minSim: 0.9, maxN: 2 })
  ok(capped.skipped === 2 && capped.considered === 2, `G7 maxN 生效且**如实计数**（considered=${capped.considered} skipped=${capped.skipped}）`)
  const off = nearPairs(rs, [null, null, null, null, null], {})
  ok(off.pairs.length === 0 && off.considered === 0, 'G8 向量缺失 ⇒ 零候选（不猜）')
  const dup = nearPairs([rec({ id: 'x1', text: 'a' }), rec({ id: 'x2', text: 'b' })], [V(1, 0), V(0.99, 0.01)], { topK: 5, minSim: 0.5 })
  ok(dup.pairs.length === 1, 'G9 对称对只出现一次（去重）')
}

console.log('== H. KPI（graphCensus）==')
{
  const g = buildGraph([
    rec({ id: 'd1', kind: 'decision' }),
    rec({ id: 'o1', kind: 'outcome', meta: { decisionId: 'd1' } }),
    rec({ id: 'f1', kind: 'fact', pointer: 'notes/a.md §x', source: 'distill z' }),
    rec({ id: 'a1', kind: 'association', meta: { a: 's1', b: 's2', landed: '1' } }),
  ])
  const c = graphCensus(g)
  ok(c.answers === 1 && c.collision === 2 && c.pointsTo === 1 && c.provenance === 1, `H1 各 rel 计数（answers=${c.answers} collision=${c.collision} pointsTo=${c.pointsTo} provenance=${c.provenance}）`)
  ok(c.recordNodes === 4 && c.anchors === 4, `H2 记录 4 / 锚 4（ptr + src + s1 + s2）实测 ${c.recordNodes}/${c.anchors}`)
  ok(c.nodes === c.recordNodes + c.anchors && c.edges === g.edges.length, 'H3 总数自洽（nodes = 记录 + 锚）')
}

console.log('== I. 真库（若在）：引用完整性 —— **每条边的两端都必须是图中节点** ==')
{
  const cands = [
    join(homedir(), '.dsh', 'suite', 'knowledge', '.records', 'records.jsonl'),
    join(homedir(), '.dsh', 'suite', 'memory', '.records', 'records.jsonl'),
  ]
  const file = cands.find((p) => existsSync(p))
  if (!file) { console.log('⚠️  I1 跳过：未找到真库 records.jsonl') }
  else {
    const rows = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const g = buildGraph(rows)
    const ids = new Set(g.nodes.map((n) => n.id))
    const bad = g.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to))
    ok(bad.length === 0, `I1 引用完整性：${g.edges.length} 条边两端都在图中（悬空 ${bad.length} 条）`)
    ok(g.nodes.filter((n) => !n.anchor).length === new Set(rows.map((r) => r.id)).size, 'I2 记录节点数 = 去重后的真库行数')
    const c = graphCensus(g)
    console.log(`   · 真库图：${c.recordNodes} 记录 + ${c.anchors} 锚 · ${c.edges} 边（answers ${c.answers} / collision ${c.collision} / commitment ${c.commitment} / relation ${c.relation} / pointsTo ${c.pointsTo} / provenance ${c.provenance}）`)
    const comp = nearPairs(rows, rows.map(() => null), {})
    console.log(`   · 近邻候选：${comp.pairs.length}（无向量 ⇒ 0，属**如实未判**而非"无竞争"）`)
    ok(Array.isArray(comp.pairs), 'I3 近邻候选扫描在真库上可跑（无向量则空）')
  }
}

console.log('== L. 判层：**判交模型**（向量说不了"一致还是相斥"）==')
{
  const { adjudicatePairs } = await import(load('lib/assertion-graph.js'))
  const mk = (id, text, sim) => ({ a: rec({ id: `${id}a`, text }), b: rec({ id: `${id}b`, text: `${text}B` }), sim, samePointer: false })
  const pairs = [mk('1', '甲', 0.95), mk('2', '乙', 0.9), mk('3', '丙', 0.85)]

  // 判层返回四种裁决 + null（未判）
  const judged = await adjudicatePairs(pairs, async (a) => (a.includes('甲') ? 'duplicate' : a.includes('乙') ? 'contradictory' : 'consistent'))
  ok(judged.length === 3, 'L1 逐对判，顺序保持')
  ok(judged[0].verdict === 'duplicate' && judged[1].verdict === 'contradictory' && judged[2].verdict === 'consistent',
    `L2 **四种裁决透传**（实测 ${judged.map((x) => x.verdict).join('/')}）`)
  ok(judged[0].sim === 0.95 && judged[0].a.text === '甲', 'L3 判层**不改动候选证据**（sim/text 原样）')

  // 无模型（判层返回 null）⇒ **未判**，与"判过但结论如何"分开记
  const none = await adjudicatePairs(pairs, async () => null)
  ok(none.every((x) => x.verdict === null), 'L4 **无模型 ⇒ 全部未判**（不假装判过）')

  // 判层抛异常 ⇒ 未判，不炸（判层不得拖垮调用方）
  const boom = await adjudicatePairs(pairs, async () => { throw new Error('llm down') })
  ok(boom.every((x) => x.verdict === null), 'L5 判层抛异常 ⇒ 记未判而非崩')

  // 空输入
  ok((await adjudicatePairs([], async () => 'duplicate')).length === 0, 'L6 空输入 ⇒ 空输出')

  // 为什么必须模型：向量给不出"一致 vs 相斥"——两层职责在类型上就分开（sim: number 判: ClaimVerdict）
  ok(typeof pairs[0].sim === 'number' && !('verdict' in pairs[0]), 'L7 候选层**只带相似度**、不带裁决（职责分层）')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
