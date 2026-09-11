// G-20 水位守卫自测（玩具副本，不碰真库）——写方「禁写 0 / 禁写回退值」+ 读方「降级基线不回退到 0」
//
// 背景：`src/distill.ts` 水位注释白纸黑字写着「为何不是 0：写 0 的行没有可用锚点 → 下次读仍判
//   「不可验证」→ 每轮全量重蒸，形成死循环」，而旧 `discardWatermark` 在 `snapshotEvents()` 抛异常时
//   把 maxSeq 退化为 0 后**照样** writeWatermark(sid, 0, agent)——实现了注释明令禁止的那件事。
//
// ⚠ 写方改了不等于回退不发生（2026-09-12 补正）：**回退 100% 由读方决定**。旧码四个作废分支
//   全部 `return null`，而调用方是 `const lastSeq = baseline ? baseline.lastSeq : 0`
//   ⇒ null 把 lastSeq 打成 0 ⇒ 整窗重蒸。实证：restartFrom = 114654 / 811483 / 339724 三条健康
//   边界值写进去了，下一轮仍从 7~8 开始。**故读方（⑩⑪）才是主修点**，写方（①~⑨）是配套。
//
// 可证伪性声明：
//   ⑥ 用「snapshotEvents 抛异常」的假 agent 驱动真实实现，断言水位落盘文件不出现任何 lastSeq<=0 的行；
//   ⑪ 用假 deps 驱动 `resolveWatermarkBaseline`，断言双证失效但 live 边界未回退时**返回降级基线而非 null**。
//   把守卫去掉（写方恢复无条件写 / 读方 toBaseline 恢复无条件 return null）⇒ 这两组立刻变红。
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  planDiscardWrite, planDegradedBaseline, runDiscardWatermark,
  resolveWatermarkBaseline, DISCARD_SNAPSHOT_CB_N,
} from '../lib/distill.js'

const root = mkdtempSync(join(tmpdir(), 'wm-guard-'))
const wmFile = join(root, 'distill-watermark.jsonl')
writeFileSync(wmFile, '', 'utf8')

const P = []
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); return cond }

// ── 写方夹具 ──
const writes = []
const fakeWriteWatermark = (sid, lastSeq) => {
  writes.push({ sid, lastSeq })
  writeFileSync(wmFile, JSON.stringify({ sessionId: sid, lastSeq, at: new Date().toISOString() }) + '\n', { flag: 'a' }, 'utf8')
}
const mkDeps = () => ({ writeWatermark: fakeWriteWatermark, audit: (o) => audits.push(o), log: () => {}, versionOf: () => 0 })
let audits = []

const wmLines = () => readFileSync(wmFile, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
/** 快照抛异常（= 旧码 catch 后 maxSeq 退化为 0 的场景） */
const brokenAgent = { session: { snapshotEvents: () => { throw new Error('snapshot unavailable') } } }
/** 快照可用但为空（maxSeq 恒 0，不抛） */
const emptyAgent = { session: { snapshotEvents: () => [] } }
/** 快照健康、边界未回退 */
const goodAgent = { session: { snapshotEvents: () => [{ seq: 114654 }, { seq: 1200 }] } }
/** 序号空间已重排/缩小（live 511 << prevSeq 101539） */
const shrunkAgent = { session: { snapshotEvents: () => [{ seq: 511 }] } }

// ── 读方夹具 ──
let discardCalls = []
const mkBaselineDeps = (maxSeq, opts = {}) => ({
  discard: (sid, reason) => { discardCalls.push({ sid, reason }); return { maxSeq, wrote: opts.wrote ?? true } },
  versionOf: () => opts.liveVer ?? 0,
  fingerprintAt: () => (opts.fp === undefined ? null : opts.fp),
})

// ══════════ 写方 ══════════
// ① 阈值常量
ok('① 熔断阈值 N=3', DISCARD_SNAPSHOT_CB_N === 3, `N=${DISCARD_SNAPSHOT_CB_N}`)

// ② 写方决策表：live 边界未回退 ⇒ 可写（prevSeq 取 <= maxSeq 的正数，真正压到 `maxSeq < p` 判据上，
//    不传 0——传 0 会走 `p>0` 为假的短路，断言被架空成恒真）
const pOk = planDiscardWrite(114654, 100000, 0)
ok('② maxSeq>=prevSeq ⇒ write=true', pOk.write === true && pOk.circuitBroken === false && pOk.reason === '')
// ②b 写方决策表：live 边界回退 ⇒ 禁止写（禁写比 prevSeq 小的值）
const pReg = planDiscardWrite(511, 101539, 0)
ok('②b maxSeq<prevSeq ⇒ 不写 + seq-space-regressed-noop',
  pReg.write === false && pReg.circuitBroken === false && pReg.reason === 'seq-space-regressed-noop', pReg.reason)

// ③④⑤ 熔断计数（maxSeq<=0 分支**不看** prevSeq，此处显式传 100000 表明测的是"未回退下的快照不可用"，
//    不是 seq 回退——避免读者误读）
const p1 = planDiscardWrite(0, 100000, 0)
const p2 = planDiscardWrite(0, 100000, 1)
const p3 = planDiscardWrite(0, 100000, 2)
ok('③ maxSeq=0 首轮 ⇒ 不写 + noop', p1.write === false && p1.circuitBroken === false && p1.reason === 'snapshot-unavailable-noop', p1.reason)
ok('④ maxSeq=0 次轮 ⇒ 仍不写 + noop', p2.write === false && p2.circuitBroken === false && p2.reason === 'snapshot-unavailable-noop', p2.reason)
ok('⑤ 连续第 3 轮 ⇒ 不写 + 熔断', p3.write === false && p3.circuitBroken === true && p3.reason === 'snapshot-unavailable-circuit-break', p3.reason)

// ⑥ 核心（可证伪）：快照抛异常 ⇒ 不得落任何 lastSeq<=0 的水位行
audits = []
let r = runDiscardWatermark('session-aaaa', 'unverifiable-legacy', brokenAgent, { lastSeq: 114654 }, 0, mkDeps())
ok('⑥ 快照不可用 ⇒ wrote=false', r.wrote === false)
ok('⑥ 水位文件无 lastSeq<=0 的行（守卫生效）', wmLines().filter((l) => !(l.lastSeq > 0)).length === 0,
  `落盘行=${JSON.stringify(wmLines())}`)
ok('⑥ 未写时审计 restartFrom=null（不谎报「从 0 续」）', audits.some((a) => a.restartFrom === null))
ok('⑥ 未写时审计 reason=snapshot-unavailable-noop', audits.some((a) => a.reason === 'snapshot-unavailable-noop'))
ok('⑥ 审计带阈值与连续轮次', audits.some((a) => a.streak === 1 && a.threshold === 3))

// ⑦ 空会话（不抛但无事件）同样不得写 0
audits = []
r = runDiscardWatermark('session-bbbb', 'fingerprint-unavailable', emptyAgent, { lastSeq: 7 }, 0, mkDeps())
ok('⑦ 空快照 ⇒ 也不写 lastSeq=0', r.wrote === false && wmLines().filter((l) => !(l.lastSeq > 0)).length === 0)

// ⑧ 连续 3 轮 ⇒ 第 3 轮熔断审计
audits = []
runDiscardWatermark('session-cccc', 'unverifiable-legacy', brokenAgent, {}, 0, mkDeps())
runDiscardWatermark('session-cccc', 'unverifiable-legacy', brokenAgent, {}, 1, mkDeps())
const r3 = runDiscardWatermark('session-cccc', 'unverifiable-legacy', brokenAgent, {}, 2, mkDeps())
ok('⑧ 第 3 轮 circuitBroken=true', r3.circuitBroken === true && r3.streak === 3)
ok('⑧ 第 3 轮审计 kind=snapshot-unavailable-circuit-break', audits.some((a) => a.kind === 'snapshot-unavailable-circuit-break'))
ok('⑧ 前两轮不熔断', audits.filter((a) => a.kind === 'snapshot-unavailable-circuit-break').length === 1)

// ⑨ 快照恢复且边界未回退 ⇒ 正常写入
audits = []
r = runDiscardWatermark('session-dddd', 'format-migrated 0→3', goodAgent, { lastSeq: 114654 }, 2, mkDeps())
const lines = wmLines().filter((l) => l.sessionId === 'session-dddd')
ok('⑨ 快照可用 ⇒ wrote=true', r.wrote === true)
ok('⑨ 落盘 lastSeq=114654（非 0）', lines.length === 1 && lines[0].lastSeq === 114654, JSON.stringify(lines))
ok('⑨ 恢复后 streak 归零', r.streak === 0 && r.circuitBroken === false)
ok('⑨ 写入分支审计 restartFrom=maxSeq', audits.some((a) => a.restartFrom === 114654))

// ⑨b 边界回退 ⇒ 不得落回退值（写方禁令的端到端）
audits = []
const wmBefore = wmLines().length
r = runDiscardWatermark('session-eeee', 'format-migrated 0→3', shrunkAgent, { lastSeq: 101539 }, 0, mkDeps())
ok('⑨b maxSeq=511 < prevSeq=101539 ⇒ wrote=false', r.wrote === false && r.maxSeq === 511)
ok('⑨b 未落任何回退值（水位文件未新增）', wmLines().length === wmBefore)
ok('⑨b 审计 reason=seq-space-regressed-noop', audits.some((a) => a.reason === 'seq-space-regressed-noop'))

// ══════════ 读方（主修点）══════════
// ⑩ 读方决策表：A/B 分级
ok('⑩-a maxSeq>=prevSeq ⇒ 降级（语义 A）', planDegradedBaseline(114654, 100000).degrade === true)
ok('⑩-b maxSeq=prevSeq（相等）⇒ 仍降级', planDegradedBaseline(114654, 114654).degrade === true)
ok('⑩-c maxSeq<<prevSeq ⇒ 全量（语义 B 保真）',
  planDegradedBaseline(511, 101539).degrade === false && planDegradedBaseline(511, 101539).reason === 'seq-space-regressed')
ok('⑩-d maxSeq<=0（快照不可用）⇒ 全量（无可用边界）',
  planDegradedBaseline(0, 114654).degrade === false && planDegradedBaseline(0, 114654).reason === 'no-live-boundary')
ok('⑩-e prevSeq<=0 ⇒ 全量', planDegradedBaseline(114654, 0).degrade === false)

// ⑪ 读方端到端：双证失效 ⇒ 返回降级基线，**不是 null**
// ⑪-a unverifiable-legacy 真分支（水位行无 formatVersion）
discardCalls = []
let b = resolveWatermarkBaseline('session-ffff', { lastSeq: 114654 }, {}, mkBaselineDeps(114654))
ok('⑪-a unverifiable-legacy ⇒ 返回降级基线而非 null', b !== null, `ret=${JSON.stringify(b)}`)
ok('⑪-a lastSeq === maxSeq === 114654（不回退到 0）', b && b.lastSeq === 114654)
ok('⑪-a degraded=true', b && b.degraded === true)
ok('⑪-a reason 含 unverifiable-legacy', !!b && b.reason.includes('unverifiable-legacy'), b ? b.reason : 'null')

// ⑪-b format-migrated 分支（wm.formatVersion=0 / liveVer=3 / fingerprintAt=null）
//      ⚠ 注意：此夹具两条 version 都有值且不等 ⇒ 实际走的是 `format-migrated 0→3`，**不是** unverifiable-legacy
//      （unverifiable-legacy 需 recVer 或 liveVer 之一为 undefined，见 ⑪-a）。此处按 team-lead 给的原夹具保留，
//       并显式断言分支名，防止后人把它当 unverifiable-legacy 用。
discardCalls = []
b = resolveWatermarkBaseline('session-gggg', { lastSeq: 114654, formatVersion: 0 }, {}, mkBaselineDeps(114654, { liveVer: 3 }))
ok('⑪-b 双证失效（formatVersion 0→3）⇒ 降级基线而非 null', b !== null, `ret=${JSON.stringify(b)}`)
ok('⑪-b lastSeq === 114654', b && b.lastSeq === 114654)
ok('⑪-b 实际分支是 format-migrated（不是 unverifiable-legacy）',
  !!b && b.reason.startsWith('format-migrated'), b ? b.reason : 'null')

// ⑪-c fingerprint-unavailable 分支（version 一致，指纹取不到）
b = resolveWatermarkBaseline('session-hhhh', { lastSeq: 811483, formatVersion: 3, fp: 'x' }, {}, mkBaselineDeps(811483, { liveVer: 3 }))
ok('⑪-c fingerprint-unavailable ⇒ 降级基线 lastSeq=811483', b !== null && b.lastSeq === 811483 && b.degraded === true,
  `ret=${JSON.stringify(b)}`)

// ⑪-d seq-space-shifted 分支（指纹不符）
b = resolveWatermarkBaseline('session-iiii', { lastSeq: 339724, formatVersion: 3, fp: 'old' }, {}, mkBaselineDeps(339724, { liveVer: 3, fp: 'new' }))
ok('⑪-d seq-space-shifted ⇒ 降级基线 lastSeq=339724', b !== null && b.lastSeq === 339724 && b.degraded === true,
  `ret=${JSON.stringify(b)}`)

// ⑪-e 反向：语义 B 保真——live 边界远小于 prevSeq ⇒ **必须**返回 null（保持全量）
b = resolveWatermarkBaseline('session-jjjj', { lastSeq: 114654, formatVersion: 0 }, {}, mkBaselineDeps(5, { liveVer: 3 }))
ok('⑪-e maxSeq=5 << prevSeq=114654 ⇒ 返回 null（保持全量，语义 B）', b === null, `ret=${JSON.stringify(b)}`)

// ⑪-f 对照组：双证齐全且匹配 ⇒ 不得降级（防误伤正常路径）
b = resolveWatermarkBaseline('session-kkkk', { lastSeq: 114654, formatVersion: 3, fp: 'same' }, {}, mkBaselineDeps(114654, { liveVer: 3, fp: 'same' }))
ok('⑪-f 双证齐全 ⇒ degraded=false 且 lastSeq=prevSeq', b !== null && b.degraded === false && b.lastSeq === 114654,
  `ret=${JSON.stringify(b)}`)

// ⑪-g 无水位 ⇒ null
ok('⑪-g 无水位行 ⇒ null', resolveWatermarkBaseline('s', undefined, {}, mkBaselineDeps(114654)) === null)

console.log(P.join('\n'))
const fails = P.filter((x) => x.startsWith('FAIL')).length
console.log(`\n${P.length - fails} PASS / ${fails} FAIL  (writes=${writes.length}, wmLines=${wmLines().length}, discardCalls=${discardCalls.length})`)
rmSync(root, { recursive: true, force: true })
process.exit(fails ? 1 : 0)
