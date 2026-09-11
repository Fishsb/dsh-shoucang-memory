// G-20 水位守卫自测（玩具副本，不碰真库）——「快照不可用不得写 lastSeq=0」+ 连续 N 轮熔断
//
// 背景：src/distill.ts 水位注释白纸黑字写着「为何不是 0：写 0 的行没有可用锚点 → 下次读仍判
//   「不可验证」→ 每轮全量重蒸，形成死循环」，而旧 `discardWatermark` 在 `snapshotEvents()` 抛异常时
//   把 maxSeq 退化为 0 后**照样** writeWatermark(sid, 0, agent)——实现了注释明令禁止的那件事。
//   读侧是 `if (lastSeq <= 0) return null`，故「写 0」与「不写」读侧等价；写 0 只污染水位文件与审计。
//
// 可证伪性声明：本用例的核心断言是 ⑥ —— 用「snapshotEvents 抛异常」的假 agent 驱动真实实现，
//   并断言水位落盘文件中**不出现任何 lastSeq<=0 的行**。若有人把守卫去掉（恢复无条件写水位），
//   假 writeWatermark 就会收到 lastSeq=0 ⇒ ⑥ 变红。故本用例不是恒真断言。
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { planDiscardOnUnavailableSnapshot, runDiscardWatermark, DISCARD_SNAPSHOT_CB_N } from '../lib/distill.js'

const root = mkdtempSync(join(tmpdir(), 'wm-guard-'))
const wmFile = join(root, 'distill-watermark.jsonl')
writeFileSync(wmFile, '', 'utf8')

const P = []
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); return cond }

// 与 src 的 writeWatermark 同构的落盘实现（只留判据需要的字段）
const writes = []
const fakeWriteWatermark = (sid, lastSeq) => {
  writes.push({ sid, lastSeq })
  writeFileSync(wmFile, JSON.stringify({ sessionId: sid, lastSeq, at: new Date().toISOString() }) + '\n', { flag: 'a' }, 'utf8')
}
const mkDeps = () => ({ writeWatermark: fakeWriteWatermark, audit: (o) => audits.push(o), log: () => {}, versionOf: () => 0 })
let audits = []

/** 读回水位文件，返回全部行 */
const wmLines = () => readFileSync(wmFile, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
/** 快照抛异常的 agent（= 旧码 catch 后 maxSeq 退化为 0 的场景） */
const brokenAgent = { session: { snapshotEvents: () => { throw new Error('snapshot unavailable') } } }
/** 快照不可用但**不抛**（空会话，maxSeq 恒 0） */
const emptyAgent = { session: { snapshotEvents: () => [] } }
const goodAgent = { session: { snapshotEvents: () => [{ seq: 114654 }, { seq: 1200 }] } }

// ① 阈值常量
ok('① 熔断阈值 N=3', DISCARD_SNAPSHOT_CB_N === 3, `N=${DISCARD_SNAPSHOT_CB_N}`)

// ② 决策表：快照可用 ⇒ 写
const pOk = planDiscardOnUnavailableSnapshot(114654, 0)
ok('② maxSeq>0 ⇒ write=true', pOk.write === true && pOk.circuitBroken === false)

// ③④⑤ 决策表：maxSeq<=0 ⇒ 不写；连续第 3 轮起熔断
const p1 = planDiscardOnUnavailableSnapshot(0, 0)
const p2 = planDiscardOnUnavailableSnapshot(0, 1)
const p3 = planDiscardOnUnavailableSnapshot(0, 2)
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

// ⑨ 快照恢复 ⇒ 正常写入（且不写 0）
audits = []
r = runDiscardWatermark('session-dddd', 'format-migrated 0→3', goodAgent, { lastSeq: 114654 }, 2, mkDeps())
const lines = wmLines().filter((l) => l.sessionId === 'session-dddd')
ok('⑨ 快照可用 ⇒ wrote=true', r.wrote === true)
ok('⑨ 落盘 lastSeq=114654（非 0）', lines.length === 1 && lines[0].lastSeq === 114654, JSON.stringify(lines))
ok('⑨ 恢复后 streak 归零', r.streak === 0 && r.circuitBroken === false)
ok('⑨ 写入分支审计 restartFrom=maxSeq', audits.some((a) => a.restartFrom === 114654))

console.log(P.join('\n'))
const fails = P.filter((x) => x.startsWith('FAIL')).length
console.log(`\n${P.length - fails} PASS / ${fails} FAIL  (writes=${writes.length}, wmLines=${wmLines().length})`)
rmSync(root, { recursive: true, force: true })
process.exit(fails ? 1 : 0)
