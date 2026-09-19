#!/usr/bin/env node
// test-ring-supply.mjs —— 环记录情境供给 **直接单测**（src/ring-supply.ts · P2 2026-09-14）
//
// 为什么单测它：这是五环记录**唯一**的读侧通道。它错 ⇒ 承诺/意图/后果/情景要么永不出现
//   （拟人化核心静默失效），要么把不该出现的塞进上下文（误注入代价 > 漏注入）。
// 覆盖重点：准入判据（file/kind/ring/活性/空文本）· 排序判据（命中→环序→due→新鲜）·
//   边界（topN=0 / 坏时间戳 / 缺 meta）· 确定性。
// 用法: node scripts/test-ring-supply.mjs     （先 npm run build:host；npm test 已含 pretest）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (p) => new URL('../' + p, import.meta.url).href
const R = await import(load('lib/ring-supply.js'))

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`) } else { fail++; console.log(`  ❌ ${m}`) } }

const AT = '2026-09-14T00:00:00.000Z'
let seq = 0
/** 造一条记录（环记录形态：file=''；stats 字段给齐以免依赖隐式默认） */
const mk = (over = {}) => ({
  id: over.id ?? `t${++seq}`,
  kind: 'commitment',
  subject: 'user',
  scope: 'global',
  text: '我欠 用户：先出迁移路径',
  source: 's',
  tag: '',
  pointer: '',
  file: '',
  order: seq,
  eol: '\n',
  maturity: 0,
  lifecycle: 'active',
  hits: 0,
  lastHit: '',
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
  ...over,
})

console.log('环记录情境供给（ring-supply）')

// ── ① 准入判据 ──
{
  const recs = [
    mk({ id: 'a', text: '环记录-承诺' }),
    mk({ id: 'b', text: '有 md 投影的索引行', file: 'MEMORY.md' }),          // 非环记录
    mk({ id: 'c', text: '结构行', kind: 'structure' }),                        // none 环
    mk({ id: 'd', text: '   ' }),                                             // 空文本
    mk({ id: 'e', text: '价值环记录', kind: 'valence' }),                      // value 环（不在缺省 ringOrder）
  ]
  const out = R.ringCandidates(recs, [], { at: AT })
  const ids = out.map((x) => x.id)
  ok(!ids.includes('b'), 'file 非空（有 md 投影）⇒ 排除')
  ok(!ids.includes('c'), 'kind 属 none 环（structure）⇒ 排除')
  ok(!ids.includes('d'), '空文本 ⇒ 排除')
  ok(!ids.includes('e'), 'value 环不在 ringOrder ⇒ 排除（图式层管它，不进情境层）')
  ok(ids.includes('a'), '合规环记录 ⇒ 入选')
}

// ── ①′ 承诺的**结清门**（G11 · 2026-09-19 实测暴露）──
// 判因：`settleCommitment` 改的是 `meta.status`，而本通道此前只按 `isLive()`（`validTo`）过滤
//   ⇒ **结算对注入面零影响**：已结清的承诺仍被当作"待办"唤起（真机实测：落库 10 条后注入面照旧显示）。
// 判据：承诺类记录**只收 `status === 'pending'`**；缺 `status` 视为 pending（向后兼容老记录）。
//   范围**只限承诺**：其它环记录（决策/事实/联想…）没有 status 语义，不得被本门误伤。
{
  const statusOf = (s) => ({ status: s, direction: 'owed-by-me', who: '用户' })
  const recs = [
    mk({ id: 'p1', text: '待办承诺', meta: statusOf('pending') }),
    mk({ id: 'k1', text: '已兑现承诺', meta: statusOf('kept') }),
    mk({ id: 'b1', text: '未兑现承诺', meta: statusOf('broken') }),
    mk({ id: 'legacy', text: '老记录无 status 字段' }),                     // 兼容：视作 pending
    mk({ id: 'dec', kind: 'decision', text: '决策记录带 status', meta: statusOf('kept') }), // 不得误伤
  ]
  // ⚠ 必须显式给 `topN`：默认 topN=3 会**截断**候选 ⇒ 断言会因"被裁掉"而假绿/假红（本判据自身踩过）。
  const out = R.ringCandidates(recs, [], { at: AT, topN: 10 })
  const ids = out.map((x) => x.id)
  ok(!ids.includes('k1'), 'G11 已兑现（status=kept）⇒ **不进**情境层')
  ok(!ids.includes('b1'), 'G11 未兑现（status=broken）⇒ **不进**情境层（已结清即出待办）')
  ok(ids.includes('p1'), 'G11 阴性对照：pending ⇒ 仍入选')
  ok(ids.includes('legacy'), 'G11 向后兼容：缺 meta.status ⇒ 视作 pending，仍入选（不静默丢老记录）')
  ok(ids.includes('dec'), 'G11 范围只限承诺：决策记录带 status=kept **照常入选**（不误伤其它环）')
}

// ── ② 活性（时态维，与 lifecycle 正交）──
{
  const live = mk({ id: 'live', text: '未失效' })
  const dead = mk({ id: 'dead', text: '已失效', validTo: '2026-09-01T00:00:00.000Z' })
  const out = R.ringCandidates([live, dead], [], { at: AT })
  ok(out.some((x) => x.id === 'live'), '有效记录入选')
  ok(!out.some((x) => x.id === 'dead'), 'validTo 已过 ⇒ 排除（活性由 fact-ring 单一实现判）')
}

// ── ③ 排序：情境命中 > 兜底；命中数降序 ──
{
  const c1 = R.serializeCues(['scope=w', 'task=build'])
  const c2 = R.serializeCues(['scope=w'])
  const recs = [
    mk({ id: 'fallback', text: '无 cues' }),
    mk({ id: 'one', text: '命中1', meta: { cues: c2 } }),
    mk({ id: 'two', text: '命中2', meta: { cues: c1 } }),
  ]
  const out = R.ringCandidates(recs, ['scope=w', 'task=build'], { at: AT })
  ok(out[0].id === 'two', '命中数多者排第一')
  ok(out[1].id === 'one', '命中数少者次之')
  ok(out[2].id === 'fallback', '未命中者（兜底）排最后')
  ok(out[0].why === 'cue' && out[2].why === 'fallback', 'why 字段可辨（不静默：能看出凭什么进）')
  ok(JSON.stringify(out[0].hits) === JSON.stringify(['scope=w', 'task=build']), 'hits 记录命中的键（可复核）')
}

// ── ④ 排序：环优先级（注册表序）relation 先于 decision ──
{
  const recs = [
    mk({ id: 'dec', text: '决策', kind: 'decision' }),
    mk({ id: 'rel', text: '承诺', kind: 'commitment' }),
  ]
  const out = R.ringCandidates(recs, [], { at: AT })
  ok(out[0].id === 'rel', 'relation 环（ringOrder[0]）先于 decision 环')
}

// ── ⑤ 排序：due 紧迫度（过期 < 无 due < 未到期）──
{
  const recs = [
    mk({ id: 'future', text: '未到期', meta: { due: '2026-12-01' } }),
    mk({ id: 'none', text: '无 due' }),
    mk({ id: 'overdue', text: '已过期', meta: { due: '2026-09-01' } }),
  ]
  const out = R.ringCandidates(recs, [], { at: AT })
  ok(out.map((x) => x.id).join(',') === 'overdue,none,future', '过期 → 无 due → 未到期')
  const bad = R.ringCandidates([mk({ id: 'bad', text: '坏时间戳', meta: { due: '不是日期' } })], [], { at: AT })
  ok(bad.length === 1, '坏 due 时间戳不抛，按"无 due"处理')
}

// ── ⑥ 边界与确定性 ──
{
  const recs = [mk({ id: 'x' }), mk({ id: 'y' })]
  ok(R.ringCandidates(recs, [], { at: AT, topN: 1 }).length === 1, 'topN=1 截断')
  ok(R.ringCandidates(recs, [], { at: AT, topN: 0 }).length === 0, 'topN=0 ⇒ 空（关闭语义）')
  ok(R.ringCandidates([], [], { at: AT }).length === 0, '空输入 ⇒ 空输出')
  const a = JSON.stringify(R.ringCandidates(recs, ['scope=w'], { at: AT }))
  const b = JSON.stringify(R.ringCandidates(recs, ['scope=w'], { at: AT }))
  ok(a === b, '确定性：同输入 ⇒ 同输出')
  const dup = R.ringCandidates([mk({ id: 'dup', text: '同 id' }), mk({ id: 'dup', text: '同 id 副本' })], [], { at: AT })
  ok(dup.length === 1, '同 id 去重（id 是内容指纹，同 id 视为同一记录）')
}

// ── ⑦ cues 编解码（单值 string 承载集合）──
{
  const withSpace = ['scope=workspace:/my proj', 'task=build']
  const s = R.serializeCues(withSpace)
  ok(JSON.stringify(R.parseCues(s)) === JSON.stringify(withSpace), '往返无损（含空格的路径不被拆断）')
  ok(JSON.stringify(R.parseCues(R.serializeCues(['a=1', 'a=1']))) === JSON.stringify(['a=1']), 'serialize 去重')
  ok(R.parseCues(undefined).length === 0 && R.parseCues('').length === 0, '缺失/空 cues ⇒ 空数组（不抛）')
}

// ── ⑧ 渲染 ──
{
  const line = R.renderRingLine(mk({ text: '我欠 用户：出迁移路径', meta: { due: '2026-09-20', direction: 'owed-by-me' } }))
  ok(line.includes('环·承诺'), '渲染含 kind 标签（承诺）')
  ok(line.includes('due 2026-09-20') && line.includes('我欠'), '渲染含 due 与方向')
  const hit = R.renderRingLine(mk({ kind: 'outcome', text: '对账逐字节一致', meta: { hit: '1' } }))
  ok(hit.includes('环·后果') && hit.includes('已应验'), '后果记录渲染应验状态')
  const plain = R.renderRingLine(mk({ kind: 'association', text: 'A ⨯ B' }))
  ok(plain.startsWith('[环·联想]'), '无 meta 时渲染不抛、格式稳定')
}

// ── ⑨ createRingSupplyApi ──
{
  const api = R.createRingSupplyApi({ rings: ['decision'], topN: 1 })
  const recs = [mk({ id: 'r1', kind: 'commitment' }), mk({ id: 'd1', kind: 'decision', text: '决策甲' })]
  const lines = api.lines(recs, [], AT)
  ok(lines.length === 1 && lines[0].includes('环·决策'), 'api 遵守注入的 rings/topN（只留 decision）')
  ok(R.RING_RECORD_FILE === '' && typeof R.CUES_SEP === 'string', '公开常量可供写侧复用（file 基准 + cues 分隔符单一来源）')
}

// ── ⑩ S4-4（2026-09-14）**到期前瞻**：已到期/临近者**单列一组**，跨组优先于兜底 ──
//   判因：前瞻记忆的失败模式就是**漏掉到期的承诺**；而此前 due 只在"同组内"排序 ——
//   一旦未命中情境线索就落进兜底组，**永远排在所有命中者之后**（跨组优先级压过组内 due）。
{
  const day = 86400000
  const atMs = Date.parse(AT)
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
  const soon = mk({ id: 'due-soon', text: '临近到期', meta: { due: iso(atMs + 3 * day) } })
  const far = mk({ id: 'due-far', text: '远期', meta: { due: iso(atMs + 30 * day) } })
  const hit = mk({ id: 'hit', text: '命中线索', meta: { cues: 'scope=x' } }) // IR1 册二：键必须是 `dim=value` 形态（裸串归一即丢弃）

  const out = R.ringCandidates([far, soon], [], { at: AT })
  ok(out[0].id === 'due-soon' && out[0].why === 'due', '⑩ 临近到期者进 `due` 组（why="due"）')
  ok(out[1].why === 'fallback', '⑩ 远期者仍为兜底组')

  const out2 = R.ringCandidates([far, soon, hit], ['scope=x'], { at: AT })
  ok(out2.map((x) => x.why).join(',') === 'cue,due,fallback', `⑩ 组序 = 情境命中 → due → 兜底（实际 ${out2.map((x) => x.why).join(',')}）`)

  ok(R.dueSoon({ due: iso(atMs) }, AT) === true, '⑩ 恰在 at 当天 ⇒ dueSoon true（已到期）')
  ok(R.dueSoon({ due: iso(atMs + 3 * day) }, AT) === true, '⑩ 3 天内 ⇒ true（窗口内）')
  ok(R.dueSoon({ due: iso(atMs + 30 * day) }, AT) === false, '⑩ 30 天后 ⇒ false（窗口外，缺省 7 天）')
  ok(R.dueSoon({ due: '不是日期' }, AT) === false && R.dueSoon({}, AT) === false && R.dueSoon(undefined, AT) === false, '⑩ 坏时间戳/无 due/无 meta ⇒ false（与 dueRank 同纪律，不抛）')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
