#!/usr/bin/env node
// test-recall-yield.mjs — S4/D1「检索收益与停止准则」断言（2026-09-14 · S4 消费链条）
//
// 守什么：`foldZeroGain` / `shouldSwitchSource` / 回流拼行的**语义与边界** ——
//   ① **轮级模型判是唯一驱动者**（`verdict`）——"这一步有没有实质进展"是**语义**问题；
//   ② **未判 ⇒ 计数不动**（fail-closed：绝不据"没有证据"换向）；
//   ③ **词面代理 `echoed` 仅观测、不驱动**（它实测恒 false：true=0/3119）；
//   ④ 回流行**只落形态不落内容**（隐私红线）+ `type` 唯一拼写处。
//
// ══ 2026-09-23 圆桌会议定稿（消费链拟态落地方案 §3）——本件重写 ══
// 旧断言守的是「动作优先 / 词面兜底」三态，而**该设计已被真机证伪**：
//   `acted` 取自**整个会话**快照（`mcl.ts:723/757`）⇒ 会话内调过一次工具即**恒 true**
//   （实测 1356 true / **0** false）⇒ 无条件归零 ⇒ `zeroGain` 恒 0 ⇒ 出口结构性锁死。
//   实证（全三档台账）：D5 前 `zeroGain` 有 39 种取值 / `≥2` 行 180 / `switchSource=true` 114 行；
//   D5 后 2570 行全 0 ⇒ **不是"从未触发"，是 D5 把它关死的**。
// ⇒ 改为「**判断者替换**」（用户拍板原则：代码/向量不足够判断时积极介入模型判断）：
//   唯一驱动者 = 轮级模型判；`echoed` 降为纯观测；**未判不动**。
//
// 用法: node scripts/test-recall-yield.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/recall-yield.js', import.meta.url).href)
const { foldZeroGain, shouldSwitchSource, SWITCH_THRESHOLD, yieldVerdictEventOf, YIELD_VERDICT_TYPE, verdictOfJudgement, shortSidOf, sampleYieldRounds } = mod
if (typeof foldZeroGain !== 'function') {
  console.log('❌ lib/recall-yield.js 导出不齐（先 npm run build:host）')
  process.exit(1)
}

console.log('S4/D1 检索收益与停止准则（2026-09-23 判断者替换版）')

// ── ① 唯一驱动者：轮级模型判 ──
ok(foldZeroGain(5, { verdict: 'helped' }).zeroGain === 0, '① `helped` ⇒ **归零**（有实质进展，线索没变弱）')
ok(foldZeroGain(1, { verdict: 'not-helped' }).zeroGain === 2, '① `not-helped` ⇒ **递增**（确实没帮上）')
ok(foldZeroGain(undefined, { verdict: 'not-helped' }).zeroGain === 1, '① 边界：无历史 + not-helped ⇒ 1')
{
  const a = foldZeroGain(3, { verdict: 'helped' }); const b = foldZeroGain(0, { verdict: 'not-helped' })
  ok(a.signal === 'verdict' && a.judged === true && b.signal === 'verdict' && b.judged === true,
    '① 两态均 `signal=verdict` 且 `judged=true`（**判定已发生**可分辨）')
  ok(a.reason === 'verdict-helped' && b.reason === 'verdict-not-helped', '① 理由可机检（输入量可见化）')
}

// ── ② 未判 ⇒ 计数不动（核心安全语义；这正是 D5 之前被违反的那条）──
{
  const n1 = foldZeroGain(7, { verdict: 'unjudged' })
  ok(n1.zeroGain === 7 && n1.judged === false && n1.reason === 'verdict-unjudged',
    '② `unjudged`（模型判不准）⇒ **计数保持不动**、`judged=false`（不冒充"没进展"）')
  const n2 = foldZeroGain(7, {})
  ok(n2.zeroGain === 7 && n2.judged === false && n2.reason === 'no-evidence', '② 无 verdict ⇒ 不动（不据缺失换向）')
  const n3 = foldZeroGain(7, { echoed: true })
  ok(n3.zeroGain === 7 && n3.signal === 'echo' && n3.judged === false, '② 仅 `echoed` ⇒ **仍不动**（词面代理不驱动计数）')
  const n4 = foldZeroGain(7, { echoed: false })
  ok(n4.zeroGain === 7, '② ⚠ **`echoed=false` 也必须不动** —— 旧实现据它递增，正是"恒 false ⇒ 只增不归零"的病灶')
  ok(foldZeroGain(undefined, {}).zeroGain === 0, '② 无证据且无历史 ⇒ 0（不抛）')
}

// ── ③ 阈值语义（未判不得出换向由调用方按 `judged` 把关）──
ok(SWITCH_THRESHOLD === 2, `③ 缺省阈值 = 2（对齐"线索变弱即换向"；实际 ${SWITCH_THRESHOLD}）`)
ok(shouldSwitchSource(0) === false && shouldSwitchSource(1) === false, '③ 未达阈值 ⇒ false')
ok(shouldSwitchSource(2) === true && shouldSwitchSource(3) === true, '③ 达/超阈值 ⇒ true')
ok(shouldSwitchSource(undefined) === false, '③ undefined ⇒ false（不抛）')
ok(shouldSwitchSource(1, 1) === true, '③ 阈值可注入（1 ⇒ 首次 not-helped 即换向）')

// ── ④ 序列模拟：连续 2 轮 not-helped ⇒ 第 2 轮起出信号 ──
{
  let z
  const seq = []
  for (const v of ['not-helped', 'not-helped', 'not-helped']) { z = foldZeroGain(z, { verdict: v }).zeroGain; seq.push(shouldSwitchSource(z)) }
  ok(seq.join(',') === 'false,true,true', `④ 连续 not-helped ⇒ 信号序列 false,true,true（实际 ${seq.join(',')}）`)
  z = foldZeroGain(z, { verdict: 'helped' }).zeroGain
  ok(z === 0 && shouldSwitchSource(z) === false, '④ **一次 helped 即复位** ⇒ 信号消失（不残留"该换向"状态）')
  // 未判**打断**链（不递增、也不清零）——保守口径：宁可多试一次
  let z2 = foldZeroGain(1, { verdict: 'not-helped' }).zeroGain
  z2 = foldZeroGain(z2, { verdict: 'unjudged' }).zeroGain
  ok(z2 === 2 && shouldSwitchSource(z2) === true, '④ `unjudged` 不进位也不清零（保持既有链长）')
}

// ── ⑤ 反例自证：三个错法必须被抓（否则本件断言恒真）──
{
  // 错法 A：把"未判"当成"没进展" ⇒ 会据缺失换向（D5 前 `echoed` 恒 false 的病灶同源）
  let a = 0
  for (let i = 0; i < 2; i++) a = Math.max(0, a) + 1
  ok(a === 2 && shouldSwitchSource(a) === true, `⑤ 反例·A：未判被当"没进展" ⇒ 2 次后**误判该换向**（${a}）—— 本件同输入不动`)
  ok(foldZeroGain(0, {}).zeroGain === 0 && shouldSwitchSource(0) === false, '⑤ 反例·A 对照：本件 ⇒ 不动、不换向')

  // 错法 B：把"有证据"当成"有进展"（= `acted` 恒 true 的形态）⇒ 计数永为 0，出口永不触发
  const wrongActed = () => 0
  let b = 5
  for (let i = 0; i < 3; i++) b = wrongActed()
  ok(b === 0 && shouldSwitchSource(b) === false, `⑤ 反例·B：恒归零 ⇒ 出口**永不触发**（${b}）—— 这正是 D5 真机形态`)
  let c = 0
  for (let i = 0; i < 3; i++) c = foldZeroGain(c, { verdict: 'not-helped' }).zeroGain
  ok(shouldSwitchSource(c) === true, `⑤ 反例·B 对照：真 not-helped ⇒ 第 2 次起触发（${c}）—— 信号确有区分力`)

  // 错法 C：词面代理驱动（恒 false ⇒ 只增不归零 ⇒ 换向恒真）
  let d
  for (let i = 0; i < 3; i++) d = Math.max(0, Number(d) || 0) + (false ? 0 : 1)
  ok(shouldSwitchSource(d) === true, `⑤ 反例·C：词面代理驱动 ⇒ 恒 false 下**必然换向**（${d}）—— D5 前 94.6% 恒真的成因`)
  let e = 0
  for (let i = 0; i < 3; i++) e = foldZeroGain(e, { echoed: false }).zeroGain
  ok(e === 0 && shouldSwitchSource(e) === false, '⑤ 反例·C 对照：本件对同一输入 ⇒ 不动（词面代理不驱动）')
}

// ── ⑥ 回流拼行（只落形态、不落内容；type 唯一拼写处）──
{
  ok(YIELD_VERDICT_TYPE === 'yield.verdict', '⑥ 回流行 type 唯一拼写处 = `yield.verdict`（读侧复用同一常量）')
  const ev = yieldVerdictEventOf({ sid: 'session-abcdef12', verdict: 'not-helped', roundIndex: 3, injectedChars: 456, nextToolsN: 2 })
  ok(ev.type === 'yield.verdict' && ev.kind === 'yield-verdict', '⑥ 事件带 type/kind（读侧按 type 筛选）')
  /* ⚠ **本条曾把缺陷当预期**（ACT-363 复验抓出，如实记）：原断言为
   *   `ev.sid === 'abcdef12'`，注释写"与 `mcl.ts` 的 `slice(-8)` 同口径"——而**读侧正是 `slice(-8)`**，
   *   即它用"两侧同错"来自洽通过。真机 `agent.id` 是长形 `session-<uuid>`（`abcdef12` 那个夹具
   *   恰好前 8 位=后 8 位都不含 `-`，掩盖了口径差异）。⇒ 口径依据改为**与全量审计行同源**（前 8 位），
   *   并用**真机形状**的 id 做反例：只有前 8 位口径才能让读写两侧取到同一个键。 */
  ok(ev.sid === 'abcdef12', '⑥ sid = 剥 `session-` 前缀后**前 8 位**（与既有全量审计行同源口径）')
  const evLong = yieldVerdictEventOf({ sid: 'session-abcdef12-9999-8888-7777-666655554444', verdict: 'helped' })
  ok(evLong.sid === 'abcdef12', '⑥⚠ 真机长形 id ⇒ 短码仍为 `abcdef12`（旧 `slice(-8)` 会得 `55554444` ⇒ 读侧永不命中）')
  ok(ev.verdict === 'not-helped' && ev.injectedChars === 456 && ev.nextToolsN === 2, '⑥ 只落形态数字（verdict / 字符数 / 工具**个数**）')
  // 隐私红线：不得出现内容类字段（沿 yield-rounds 的既有决定，check-journal-privacy 同口径）
  const banned = ['topics', 'q', 'query', 'arguments', 'args', 'text', 'line', 'note']
  ok(banned.every((k) => !(k in ev)), `⑥ **不落内容**：${banned.join('/')} 均不在事件里（隐私红线）`)
  // 非法 verdict ⇒ 归为 unjudged（不抛、不兜底成 not-helped）
  ok(yieldVerdictEventOf({ sid: 's', verdict: 'garbage' }).verdict === 'unjudged', '⑥ 非法 verdict ⇒ `unjudged`（**不兜底成 not-helped**）')
  // 映射器：null（判不准）⇒ unjudged，不是 not-helped
  ok(verdictOfJudgement(true) === 'helped' && verdictOfJudgement(false) === 'not-helped', '⑥ 映射：true⇒helped / false⇒not-helped')
  ok(verdictOfJudgement(null) === 'unjudged' && verdictOfJudgement(undefined) === 'unjudged', '⑥ 映射：null/undefined ⇒ **unjudged**（判不准 ≠ 没帮上）')
}

// ── ⑦ 旧入口已删（本会议的裁定：`nextZeroGain` 对外零调用方 + `acted` 主信号删除）──
{
  ok(typeof mod.nextZeroGain === 'undefined', '⑦ 旧入口 `nextZeroGain` 已删（对外零调用方；留着=为 ≤2 使用点留抽象）')
  ok(typeof mod.yieldOf === 'undefined', '⑦ 旧 `yieldOf` 仍为删除态（恒 false 字段不得发布成"合规率"）')
  const a1 = foldZeroGain(0, { acted: true, echoed: false })
  ok(a1.zeroGain === 0 && a1.judged === false && a1.reason === 'echo', '⑦ ⚠ **`acted` 字段已失效**：传入也不再驱动计数（旧签名调用被安全降级，不静默归零）')
}

// ── ⑧ ACT-363（2026-09-23 复验）：**三处回流链缺陷的防复发断言** ──
//   判因：这三处都在"回流端到端"上，且都**fail-closed 静默失效**（不报警）。逐条钉死。
{
  // ⑧-1 键口径：真机长形 id ⇒ 必须取**前 8 位**（与全量审计行同源）。旧 `slice(-8)` 会得别的键。
  ok(shortSidOf('session-abcdef12-9999-8888-7777-666655554444') === 'abcdef12',
    '⑧-1 长形 id ⇒ 短码 = 剥前缀后**前 8 位**（旧 `slice(-8)` 得 `55554444` ⇒ 读侧永不命中）')
  ok(shortSidOf('abcdef12') === 'abcdef12', '⑧-1 幂等：已是短码 ⇒ 不变（写侧重复归一安全）')
  ok(shortSidOf('session-') === '' && shortSidOf('') === '', '⑧-1 边界：空/仅前缀 ⇒ 空（调用方按"无键"处理）')

  // ⑧-2 取样器：`idleSteps` 饱和（实测 85% 并列）⇒ **不得**据它排序取样，否则取到最老的行。
  const mk = (sid, at, idle, chars = 100) => ({ sid, at, idleSteps: idle, materialChars: chars, nextTools: idle > 0 ? ['x'] : [] })
  const rows = [
    mk('stale001', '2026-09-15T00:00:00Z', 3), mk('stale002', '2026-09-15T00:01:00Z', 3), mk('stale003', '2026-09-15T00:02:00Z', 3),
    mk('live0001', '2026-09-23T10:00:00Z', 3), mk('live0002', '2026-09-23T10:01:00Z', 3), mk('live0003', '2026-09-23T10:02:00Z', 3),
  ]
  const got = sampleYieldRounds(rows, 3)
  ok(got.length === 3 && got[got.length - 1].sid === 'live0003',
    `⑧-2 取样按**时间序取最近**（得 ${got[got.length - 1].sid}）—— 旧 sort(idleSteps) 因饱和取到最老的 stale*`)
  ok(got.every((r) => (Number(r.idleSteps) || 0) > 0), '⑧-2 先筛「有动作」（idleSteps>0）—— 无动作的轮模型只能判不准')
  const zeroOnly = [mk('z1', '2026-09-23T10:00:00Z', 0), mk('z2', '2026-09-23T10:01:00Z', 0)]
  ok(sampleYieldRounds(zeroOnly, 3).length === 0, '⑧-2 全无动作 ⇒ 取空（不硬凑样本交模型瞎判）')
  ok(sampleYieldRounds([], 3).length === 0, '⑧-2 空输入 ⇒ 空（不抛）')
  // 反例：旧实现的取法（据 idleSteps 排序）在同一输入下必取到 stale
  const oldWay = rows.slice().sort((a, b) => (Number(b.idleSteps) || 0) - (Number(a.idleSteps) || 0)).slice(0, 3).reverse()
  ok(oldWay[oldWay.length - 1].sid.startsWith('stale'),
    `⑧-2 反例自证：旧取法得 ${oldWay[oldWay.length - 1].sid}（**最老**）—— 这正是"回流行写给死会话"的机制`)
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（检索收益与停止准则断言全过）')
process.exit(fail ? 1 : 0)
