#!/usr/bin/env node
// test-ring-commit.mjs —— 环记录落库 **直接单测**（src/ring-commit.ts · P4/P5 2026-09-14）
//
// 为什么单测它：这是五环**唯一的自动生产者**（蒸馏与深睡两条产线共用）。它错 ⇒ 环记录要么永不增长
//   （情境层永远只有 CLI 手敲的那几条），要么把脏数据写进 Record 事实源（并写进不可变的 `ring-events.jsonl` 历史）。
// 纪律：**全程用临时库根**（mkdtemp），绝不触碰真实记忆库 `~/.dsh/skills/managing-memory`。
// 覆盖：六通道落库 · meta 载荷保留 · **cues 回填** · **后果回收**（含重复回收被拒）· **episode 叙事** ·
//   事件流写入 · **幂等** · **库未建拒写**（不得凭空造游离事实源）· 坏输入跳过 · 零抛出 · **重放对账**。
// 用法: node scripts/test-ring-commit.mjs     （先 npm run build:host；npm test 已含 pretest）
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const load = (p) => new URL('../' + p, import.meta.url).href
const R = await import(load('lib/ring-commit.js'))
const H = await import(load('lib/record-shadow.js'))
const E = await import(load('lib/ring-events.js'))
const RS = await import(load('lib/ring-supply.js'))
void dirname(fileURLToPath(import.meta.url))

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`) } else { fail++; console.log(`  ❌ ${m}`) } }
const AT = '2026-09-14T00:00:00.000Z'
const AT2 = '2026-09-15T00:00:00.000Z'
const root = mkdtempSync(join(tmpdir(), 'shoucang-ring-'))
// 建库（真实系统由 `record-sync --import` 完成）。**必须先建**：`commitRingChannels` 对库未建是**拒绝**的
//   ——否则 MEMORY_ROOT 指错时会凭空造出游离事实源（本轮实测抓到这个缺陷）。
H.saveStoreRecords(root, [])
const logs = [], audits = []
const deps = { log: (m) => logs.push(m), audit: (o) => audits.push(o) }
const recsOf = (k) => H.loadStore(root).records.filter((r) => r.kind === k)

console.log('环记录落库（ring-commit）')

// ── ① 空 out：不写任何东西 ──
{
  const r = R.commitRingChannels(deps, root, {}, AT)
  ok(r.ok === true && R.RING_CHANNELS.every((k) => r[k] === 0), '空 out ⇒ 全 0 且 ok（不空转、不写盘）')
  ok(R.countRingChannels({}).episodes === 0, 'countRingChannels 对空输出给 0（含新增通道）')
  ok(R.RING_CHANNELS.length === 6, 'RING_CHANNELS 覆盖 6 通道（含 outcomes/episodes）')
}

// ── ② 四通道落库 + meta 载荷 + cues 回填 ──
{
  const out = {
    decisions: [{ text: '拍板：切 storeMode=dual', predicted: '对账零差异', rationale: '前置已绿', alternatives: '直接切 record', cues: ['scope=workspace:/repo', 'task=build'] }],
    commitments: [{ who: '用户', what: '先出迁移与回滚路径', direction: 'owed-by-me', due: '2026-09-20', cues: [] }],
    relations: [{ who: '用户', note: '在意磁盘占用，拒冗余限制', level: 2 }],
    valences: [{ trigger: '用户看到视觉走样', valence: -1 }],
  }
  const r = R.commitRingChannels(deps, root, out, AT, 'distill')
  ok(r.ok && r.decisions === 1 && r.commitments === 1 && r.relations === 1 && r.valences === 1, `四通道各落 1 条（${r.decisions}/${r.commitments}/${r.relations}/${r.valences}）`)
  ok(r.events > 0, `事件流写入 ${r.events} 条（不可变历史；对账要能重放重建）`)
  const d = recsOf('decision')[0]
  ok(d && d.meta.predicted === '对账零差异', '裁决保留**当时预测**（后果回收的对照项）')
  ok(d && d.file === '', '环记录 file 为空串（= 无 md 投影，读侧据此识别）')
  ok(d && RS.parseCues(d.meta.cues).join('|') === 'scope=workspace:/repo|task=build', '**cues 回填**（读侧 parseCues 往返无损）')
  ok(recsOf('commitment')[0]?.meta.direction === 'owed-by-me', '承诺保留 direction')
  ok(recsOf('valence')[0]?.meta.trigger === '用户看到视觉走样', '价态保留**触发情境**（脱离情境的价态无意义）')
  ok(audits.some((a) => a.kind === 'ring-commit' && a.source === 'distill'), '审计回执带**产线来源**（可区分 distill / deep-sleep）')
}

// ── ③ 后果回收（决策环的核心）+ 重复回收被拒 ──
{
  R.commitRingChannels(deps, root, { decisions: [{ text: '待回收的裁决', predicted: '会成' }] }, AT, 'distill')
  const did = recsOf('decision').find((r) => r.text === '待回收的裁决')?.id
  ok(!!did, '先开一条待回收裁决（拿到 id）')
  const r = R.commitRingChannels(deps, root, { outcomes: [{ decisionId: did, observed: '确实成了', hit: true }] }, AT2, 'deep-sleep')
  ok(r.outcomes === 1, `后果回收落 1 条（${r.outcomes}）`)
  ok(recsOf('outcome').length === 1, 'outcome 记录已入库')
  ok(recsOf('decision').find((x) => x.id === did)?.meta.status !== 'open', '回收后裁决**不再是 open**（状态迁移）')
  const dup = R.commitRingChannels(deps, root, { outcomes: [{ decisionId: did, observed: '又回收一次', hit: true }] }, AT2, 'deep-sleep')
  ok(dup.outcomes === 0 && recsOf('outcome').length === 1, '**重复回收被拒**（幂等；否则后果账污染）')
  const bad = R.commitRingChannels(deps, root, { outcomes: [{ decisionId: 'decision:不存在', observed: 'x' }] }, AT2, 'deep-sleep')
  ok(bad.outcomes === 0 && bad.ok === true, '回收不存在的裁决 ⇒ 跳过且不抛')
}

// ── ④ episode 叙事（author 层）+ 幂等 ──
{
  const r = R.commitRingChannels(deps, root, { episodes: [{ title: 'P0a 接线门', text: '架构门先红后绿：从"只打印扇入"到"扇入 0 必须申报"', pointer: 'notes/agent.md §经历/P0a', cues: ['scope=workspace:/repo'] }] }, AT2, 'deep-sleep')
  ok(r.episodes === 1, `叙事落 1 条（${r.episodes}）`)
  const ep = recsOf('episode')[0]
  ok(!!ep, 'episode 记录已入库（**关闭 D-04a：episode kind 恒 0**）')
  ok(ep.file === '', 'episode 无 md 投影（file=""，与其它环记录同规格）')
  ok(ep.pointer === 'notes/agent.md §经历/P0a', 'episode 带 pointer 指向 notes 正文小节（可深读）')
  ok(ep.meta.title === 'P0a 接线门' && RS.parseCues(ep.meta.cues).length === 1, 'episode 保留 title 与 cues')
  const again = R.commitRingChannels(deps, root, { episodes: [{ title: 'P0a 接线门', text: '架构门先红后绿：从"只打印扇入"到"扇入 0 必须申报"' }] }, AT2, 'deep-sleep')
  ok(again.episodes === 1 && recsOf('episode').length === 1, 'episode 幂等（同 title|text ⇒ 同 id，不重复入库）')
}

// ── ⑤ 幂等：同 out 再提交 ⇒ 记录数不变（同文本同 id 原地替换）──
{
  const before = H.loadStore(root).records.length
  R.commitRingChannels(deps, root, {
    decisions: [{ text: '拍板：切 storeMode=dual', predicted: '对账零差异' }],
    commitments: [{ who: '用户', what: '先出迁移与回滚路径', direction: 'owed-by-me' }],
  }, AT2, 'distill')
  ok(H.loadStore(root).records.length === before, `幂等：重放同内容记录数不变（${before} → ${H.loadStore(root).records.length}）`)
  const d = recsOf('decision').find((r) => r.text === '拍板：切 storeMode=dual')
  ok(RS.parseCues(d.meta.cues).length === 2, '**重提交不丢字段**：第二次没带 cues，cues 仍在（旧键保留、新键覆盖）')
}

// ── ⑥ 坏输入：缺必填/非法值被跳过，且不抛 ──
{
  let threw = false
  let r
  try {
    r = R.commitRingChannels(deps, root, {
      decisions: [{ predicted: '没有正文' }, null, { text: '达标的一条' }],
      commitments: [{ what: '' }, { who: '甲', what: '有话', direction: '乱写的方向' }],
      relations: [{ who: '乙' }, { who: '丙', note: '有 note' }],
      valences: [{ trigger: '有情境', valence: '不是数字' }, { trigger: '好情境', valence: 1 }],
      episodes: [{ title: '缺正文' }, { title: '有正文', text: '正文在此' }],
    }, AT, 'distill')
  } catch { threw = true }
  ok(!threw, '零抛出：坏输入不崩（记忆写入失败不得打断主链路）')
  ok(r.decisions === 1, 'decisions 跳过无正文者')
  ok(r.commitments === 1 && recsOf('commitment').some((x) => x.meta.direction === 'owed-by-me'), '非法 direction 回落 owed-by-me（不落脏值）')
  ok(r.relations === 1, 'relations 跳过缺 note 者')
  ok(r.valences === 1, 'valences 跳过非数字价态')
  ok(r.episodes === 1, 'episodes 跳过缺正文者')
}

// ── ⑦ 影子库不可用：**拒绝而非凭空建库** ──
{
  const bogus = join(root, 'no-such-root', 'deep')
  const r = R.commitRingChannels(deps, bogus, { decisions: [{ text: 'x' }] }, AT, 'distill')
  ok(r.ok === false && r.decisions === 0, '库未建 ⇒ **拒绝**（ok=false 且零写入，不凭空造游离事实源）')
  ok(typeof r.reason === 'string' && r.reason.length > 0, '拒绝带可读 reason（不静默）')
}

// ── ⑧ 事件流可解析且可重放对账（episode 不在对账范围，不得造成假红）──
{
  const evPath = join(root, H.RECORD_DIR, E.RING_EVENT_FILE)
  ok(existsSync(evPath), 'ring-events.jsonl 已生成')
  const evs = E.parseEvents(readFileSync(evPath, 'utf8'))
  ok(evs.length > 0, `事件流可解析（${evs.length} 条）`)
  ok(!evs.some((e) => String(e.op).includes('episode')), 'episode **不产生环事件**（显式口径：不在 ringRecordsOf 范围 ⇒ 不造成假红）')
  // ⚠ 签名是 `reconcileRing(records, events)`——**先记录后事件**（本测试初版把两者传反，
  //   于是内部把记录当事件读、报一串「未知 op：undefined」；属于"传参顺序靠猜"的典型失手）。
  const rec = E.reconcileRing(H.loadStore(root).records, evs)
  ok(rec.ok === true, `**重放对账通过**：事件流能重建 store 的环记录（store ${rec.storeCount} / replay ${rec.replayCount}）`)
}

// ── ⑨ countRingChannels ──
{
  const c = R.countRingChannels({ decisions: [1, 2], commitments: [1], relations: [], valences: [1, 2, 3], outcomes: [1], episodes: [1, 2] })
  ok(c.decisions === 2 && c.commitments === 1 && c.relations === 0 && c.valences === 3 && c.outcomes === 1 && c.episodes === 2, 'countRingChannels 逐通道计数正确（6 通道）')
  ok(R.RING_CHANNELS.join(',') === 'decisions,commitments,relations,valences,outcomes,episodes', 'RING_CHANNELS 是通道名唯一声明处（判据段与统计同源）')
}

rmSync(root, { recursive: true, force: true })
console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
