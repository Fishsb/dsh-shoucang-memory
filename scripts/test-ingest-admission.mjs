// test-ingest-admission.mjs — 册二单测：**准入判定单一实现**（触发宽 · 准入严）
//
// 判因（真机实测）：「该不该现在蒸」原先散在三处、口径不一；而宽限期只看内存 `sleep.sessions`
//   （每实例新建的 Map，热重载实测 **220 次**）⇒ 重载后宽限期整段跳过 ⇒ **每次重载 30 秒后必蒸**
//   （实测 5/5 配对：21:14:08→21:14:36 · 21:22:01→21:22:28 · 21:25:23→21:25:51 …）。
//
// 本件钉死三件：
//   ① `planIngestAdmission` 决策表穷举（**顺序即优先级**：无增量先短路 → 熔断 → claim → 不静默 → 宽限 → 放行）；
//   ② `quiescenceOf` 三态证据链（子代理 / status / inbox；取不到 ⇒ `unknown`，**不是 busy**）；
//   ③ 接线单一实现（三个调用点都调本函数；扫尾里**不再**有内联宽限期比较）。
//
// 反例自证：把 `quiet === 'busy'` 分支删掉 ⇒ ④ 红；把 `grace-period` 分支删掉 ⇒ ⑤ 红
//   （后者正是"重载后 30s 必蒸"的旧行为——本件的 ⑤ 就是它的回归锁）。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planIngestAdmission, quiescenceOf, lastTurnEndMsOf } from '../lib/ingest-admission.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const base = { lastSeq: 10, maxSeq: 20, sinceLastEndMs: 600000, idleWakeMs: 600000, quiet: 'quiet', claimHeld: false, snapshotStreak: 0, circuitBreakN: 3 }
const adm = (o = {}) => planIngestAdmission({ ...base, ...o })

// ── ① 决策表（顺序即优先级）──
{
  ok('① 全绿 ⇒ 放行（ok）', adm().run === true && adm().reason === 'ok', adm().reason)
  const n = adm({ maxSeq: 10 })
  ok('① 无增量 ⇒ 短路（即便 busy/manual 也先短路）', n.run === false && n.reason === 'no-increment' && adm({ maxSeq: 5, quiet: 'busy', manual: true }).reason === 'no-increment')
  const cb = adm({ snapshotStreak: 3 })
  ok('① 熔断 ⇒ 拒绝（先于 claim/静默）', cb.run === false && cb.reason === 'snapshot-unavailable-circuit-break')
  const cl = adm({ claimHeld: true })
  ok('① claim 在途 ⇒ 让位', cl.run === false && cl.reason === 'claim-held')
  const bq = adm({ quiet: 'busy' })
  ok('① 不静默（busy）⇒ 让位（not-quiet）', bq.run === false && bq.reason === 'not-quiet')
  const gp = adm({ sinceLastEndMs: 1000 })
  ok('① 静默但未满宽限 ⇒ grace-period（**旧行为下这里会开蒸**）', gp.run === false && gp.reason === 'grace-period')
  const gpNull = adm({ sinceLastEndMs: null })
  ok('① 宽限期取不到 ⇒ 不阻断（按时间兜底）', gpNull.run === true, gpNull.reason)
  const unk = adm({ quiet: 'unknown' })
  ok('① 静默证据 unknown ⇒ 放行但**可分辨**（不静默通过）', unk.run === true && unk.reason === 'unknown-quiescence-fallback', unk.reason)
  const man = adm({ sinceLastEndMs: 1000, manual: true })
  ok('① 手动 ⇒ 豁免宽限期（manual）', man.run === true && man.reason === 'manual')
  const manBusy = adm({ quiet: 'busy', manual: true })
  ok('① 手动**不**豁免在途/claim/熔断', manBusy.run === false && manBusy.reason === 'not-quiet' && adm({ claimHeld: true, manual: true }).reason === 'claim-held' && adm({ snapshotStreak: 9, manual: true }).reason === 'snapshot-unavailable-circuit-break')
  ok('① 证据串可见（quiet/since/idle 三值）', /quiet=quiet/.test(adm().evidence) && /sinceLastEndMs=600000/.test(adm().evidence) && /idleWakeMs=600000/.test(adm().evidence), adm().evidence)
  ok('① 边界：since 恰好等于 idleWakeMs ⇒ 放行（不小气）', adm({ sinceLastEndMs: 600000 }).run === true)
  ok('① 异常输入不炸（NaN 阈值 ⇒ 归 1）', typeof planIngestAdmission({ ...base, idleWakeMs: Number.NaN }).run === 'boolean')
}

// ── ② quiescenceOf 证据链 ──
{
  const mk = (get, sub) => ({ ctx: { agents: { get: () => get } }, hasActiveSubagents: () => !!sub })
  ok('② 有活跃子代理 ⇒ busy', quiescenceOf(mk({ status: 'idle' }, true), { id: 's1', status: 'idle' }).state === 'busy')
  ok('② status=running ⇒ busy', quiescenceOf(mk({ status: 'running' }, false), { id: 's1', status: 'idle' }).state === 'busy')
  ok('② idle + inbox 排队 ⇒ busy', quiescenceOf(mk({ status: 'idle', inbox: [{}, {}] }, false), { id: 's1' }).state === 'busy')
  ok('② idle + 无队列 ⇒ quiet', quiescenceOf(mk({ status: 'idle', inbox: [] }, false), { id: 's1' }).state === 'quiet')
  const unk = quiescenceOf(mk(null, false), { id: 's1' })
  ok('② 取不到 status ⇒ unknown（**不是** busy，也不冒充 quiet）', unk.state === 'unknown' && unk.why === 'status-unavailable', unk.why)
  ok('② 无 sid ⇒ unknown', quiescenceOf(mk({ status: 'idle' }, false), {}).state === 'unknown')
  ok('② 探测抛错 ⇒ unknown（零抛出）', quiescenceOf({ ctx: { agents: { get: () => { throw new Error('x') } } }, hasActiveSubagents: () => false }, { id: 's1' }).state === 'unknown')
}

// ── ③ lastTurnEndMsOf（宽限期的**持久来源**）──
{
  const agent = { session: { snapshotEvents: () => [{ seq: 1, type: 'user/message', time: 111 }, { seq: 2, type: 'turn/end', time: 222 }, { seq: 3, type: 'subagent/catalog', time: 333 }, { seq: 4, type: 'turn/end', time: 444 }] } }
  ok('③ 取**最后**一次 turn/end 的时间', lastTurnEndMsOf(agent) === 444, String(lastTurnEndMsOf(agent)))
  ok('③ 无 turn/end ⇒ 0', lastTurnEndMsOf({ session: { snapshotEvents: () => [{ seq: 1, type: 'user/message', time: 1 }] } }) === 0)
  ok('③ 快照不可用 ⇒ 0（零抛出）', lastTurnEndMsOf({ session: { snapshotEvents: () => { throw new Error('x') } } }) === 0 && lastTurnEndMsOf(null) === 0)
}

// ── ④ 接线：单一实现（符号级；去注释后判定）──
const hooks = stripComments(readFileSync(join(ROOT, 'src', 'distill-hooks.ts'), 'utf8'))
const agentSrc = stripComments(readFileSync(join(ROOT, 'src', 'distill-agent.ts'), 'utf8'))
{
  const calls = (agentSrc.match(/planIngestAdmission\s*\(/g) || []).length + (hooks.match(/planIngestAdmission\s*\(/g) || []).length
  ok('④ 三处调用点都走同一准入函数（≥3 处调用）', calls >= 3, `calls=${calls}`)
  ok('④ 扫尾**不再**有内联宽限期比较（旧形态 `Date.now() - rec.lastEndAt < idleWakeMs`）', !/rec\.lastEndAt\s*<\s*dep\.env\.config\.idleWakeMs/.test(hooks) && !/lastEndAt\s*&&\s*Date\.now\(\)\s*-\s*rec\.lastEndAt/.test(hooks))
  ok('④ 扫尾用持久回落 `lastTurnEndMsOf`（重载后仍有宽限）', /lastTurnEndMsOf\s*\(/.test(hooks))
  ok('④ idle 入口与手动入口都传 `quiet`（静默判据单一实现）', (agentSrc.match(/quiescenceOf\s*\(/g) || []).length >= 2)
  ok('④ 判定层零副作用（纯函数模块不含 IO 调用）', !/readFileSync|writeFileSync|appendFileSync/.test(stripComments(readFileSync(join(ROOT, 'src', 'ingest-admission.ts'), 'utf8'))))
}

for (const l of P) console.log(l)
console.log(bad ? `\n❌ test-ingest-admission: ${bad} 条断言未通过` : '\n✅ test-ingest-admission: 全绿')
process.exit(bad ? 1 : 0)
