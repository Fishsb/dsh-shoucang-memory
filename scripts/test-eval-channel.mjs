#!/usr/bin/env node
/**
 * test-eval-channel.mjs — 「可配置评估通道」行为判据（M1 · 2026-09-21 · ACT-283）
 *
 * 判据四组（**全部先红后绿式可证伪**，沿本仓 `test-proposal-apply` / `test-bank-lock` 同法）：
 *   A. **出网闸**（G1 ①②）：loopback 放行；非 loopback 无许可 ⇒ **拒发**（`egress-denied`）；有许可 ⇒ 放行。
 *      ⚠ 本案是"拒发不脱敏"的可执行部分 —— 会审 edge E-01 认定这是**继续推进的前置**。
 *   B. **七态归因**（G3）：`off` / `egress-denied` / `key-missing` / `bad-body` / `type-violation` 各自可判。
 *      ⚠ 判因：本仓 `vec.ts:240-260` 把六类失败**全塌缩成 null** ⇒ 真机 `embed-off`=0（"调了但失败"与"没调"同形）。
 *   C. **state 白名单**（G1 ③）：只收"已提炼断言"；自由长文/空文本被拒且**如实计数**（不静默丢弃）。
 *   D. **严格解析**：非法 JSON / 缺题 / 值越域 一律**拒**，不猜、不兜底。
 *
 * ⚠ 本件**不发起任何真实网络请求**（纯判据；连通性由 `/eval/test` 端点负责）。
 * 退出码：0=pass · 1=fail
 */
// ⚠ 从**编译产物** `lib/` 导入（与 `test-bank-lock` 从 `scripts/*.mjs` 同法：测试件不直接吃 TS 源码）。
//   故本件依赖先 `npm run build:host`；`check-runner` 的 `pretest` 已保证这一点。
import { isLoopbackUrl, egressAllowed, evalOptionsOf, EVAL_TIERS } from '../lib/eval-config.js'
import { buildEvalState, admitStateRow, parseEvalAnswers, evaluate } from '../lib/eval-channel.js'
// M2（ACT-283）落账与阈值
import { stateSha8Of, isLoopbackHost, hostOf, shapeOf, confidenceMinOf, decisionEventOf, statsOfLines, evaluateGateOf, isCalibratedTier, EVAL_THRESHOLDS } from '../lib/eval-ledger.js'

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }
const eq = (a, b, m) => (a === b ? ok(m) : bad(m + `（得到 ${JSON.stringify(a)} · 期望 ${JSON.stringify(b)}）`))

/* ══ A. 出网闸 ══════════════════════════════════════════════════════════ */
console.log('\nA. 出网闸（loopback 判定走解析 hostname，非正则）')
{
  eq(isLoopbackUrl('http://127.0.0.1:11434/v1'), true, 'A1 127.0.0.1 判 loopback')
  eq(isLoopbackUrl('http://127.0.0.2:11434/v1'), true, 'A2 127.0.0.2 也在 127/8（仓内两份正则**都漏**这条）')
  eq(isLoopbackUrl('http://[::1]:11434/v1'), true, 'A3 IPv6 loopback（vec.ts:243 漏）')
  eq(isLoopbackUrl('http://localhost:11434/v1'), true, 'A4 localhost')
  eq(isLoopbackUrl('http://127.0.0.1:11434'), true, 'A5 无尾斜杠（vec.ts:243 漏）')
  eq(isLoopbackUrl('http://LOCALHOST:11434/v1'), true, 'A6 大写（vec.ts:243 无 /i，漏）')
  /* 下面两条是 panel-shared.ts:803 `isLocalBase` **误判为 LOCAL** 的伪造 URL —— 本件必须判 remote */
  eq(isLoopbackUrl('http://127.0.0.1.evil.com/v1'), false, 'A7 伪造域名 127.0.0.1.evil.com 判 remote（isLocalBase 会误判 LOCAL）')
  eq(isLoopbackUrl('http://localhost:11434@evil.com/v1'), false, 'A8 用户信息语法劫持判 remote（isLocalBase 会误判 LOCAL）')
  eq(isLoopbackUrl('https://api.typesafe.ai/v1'), false, 'A9 远端判 remote')
  eq(isLoopbackUrl('not a url'), false, 'A10 非法 URL 判 remote（保守）')

  eq(egressAllowed({ evalBaseUrl: 'http://127.0.0.1:11434/v1', evalEgressAllow: false }).ok, true, 'A11 loopback 无需出网许可即放行')
  eq(egressAllowed({ evalBaseUrl: 'https://api.example.com/v1', evalEgressAllow: false }).ok, false, 'A12 **非 loopback 无许可 ⇒ 拒发**（G1 核心）')
  eq(egressAllowed({ evalBaseUrl: 'https://api.example.com/v1', evalEgressAllow: false }).why, 'egress-not-allowed', 'A13 拒绝理由分态')
  eq(egressAllowed({ evalBaseUrl: 'https://api.example.com/v1', evalEgressAllow: true }).ok, true, 'A14 显式许可后放行')
  eq(egressAllowed({ evalBaseUrl: '', evalEgressAllow: true }).ok, false, 'A15 端点为空 ⇒ 拒')
}

/* ══ B. 七态归因 ════════════════════════════════════════════════════════ */
console.log('\nB. 七态归因（不塌缩成单一 null —— 治 embed-off=0 同形病）')
{
  const deps = (over) => ({ cfg: evalOptionsOf({ evalEnabled: false, evalBaseUrl: 'http://127.0.0.1:11434/v1', evalModel: 'm', evalApiKeyEnv: 'K', evalTier: 'local', evalEgressAllow: false, ...over }), env: () => undefined, log: () => {} })
  const qs = { x: { type: 'boolean', instructions: 't?' } }

  eq((await evaluate(deps({}), 'state', qs)).outcome, 'off', 'B1 关闭 ⇒ off（**未调用**，与"调了但失败"可分辨）')
  eq((await evaluate(deps({ evalEnabled: true, evalBaseUrl: 'https://api.example.com/v1' }), 's', qs)).outcome, 'egress-denied', 'B2 非 loopback 无许可 ⇒ egress-denied（**拒发**，先于任何网络动作）')
  eq((await evaluate(deps({ evalEnabled: true, evalBaseUrl: 'https://api.example.com/v1', evalEgressAllow: true }), 's', qs)).outcome, 'key-missing', 'B3 许可但无 key ⇒ key-missing')
  eq((await evaluate(deps({ evalEnabled: true, evalBaseUrl: '' }), 's', qs)).outcome, 'off', 'B4 端点空 ⇒ off')
  eq((await evaluate(deps({ evalEnabled: true }), '', qs)).outcome, 'bad-body', 'B5 空 state ⇒ bad-body')
  eq((await evaluate(deps({ evalEnabled: true }), 's', {})).outcome, 'bad-body', 'B6 无问题 ⇒ bad-body')

  const off = await evaluate(deps({}), 's', qs)
  const denied = await evaluate(deps({ evalEnabled: true, evalBaseUrl: 'https://api.example.com/v1' }), 's', qs)
  ok(`B7 **分态可分辨实证**：off.why=${off.why} vs egress-denied.why=${denied.why}（旧法两者同为 null）`)
}

/* ══ C. state 白名单 ═══════════════════════════════════════════════════ */
console.log('\nC. state 白名单（只收"已提炼断言"；拒项如实计数）')
{
  eq(admitStateRow({ tag: '原则', text: '短断言' }).ok, true, 'C1 合法断言放行')
  eq(admitStateRow({ tag: '原则', text: '' }).why, 'empty', 'C2 空文本拒')
  eq(admitStateRow({ tag: '', text: 'x' }).why, 'no-tag', 'C3 无标签拒')
  eq(admitStateRow({ tag: '原则', text: 'x'.repeat(401) }).why, 'too-long', 'C4 超长（属"原料"非断言）拒')

  const r = buildEvalState([
    { tag: '原则', text: 'A' },
    { tag: '原则', text: '' },          // 拒
    { tag: '', text: 'B' },             // 拒
    { tag: '路径', text: 'C' },
  ])
  eq(r.used, 2, 'C5 组装只用合法 2 行')
  eq(r.rejected, 2, 'C6 **拒项如实计数**（不静默丢弃 —— 本仓纪律：无输入与未消费须可分辨）')
  ok(`C7 state 文本=${JSON.stringify(r.text)}`)
}

/* ══ D. 严格解析 ═══════════════════════════════════════════════════════ */
console.log('\nD. 严格解析（不猜、不兜底）')
{
  const qs = {
    pick: { type: 'choice', instructions: '?', criteria: { a: 'A', b: 'B' } },
    yes: { type: 'boolean', instructions: '?' },
    sc: { type: 'score', instructions: '?', criteria: ['低', '中', '高'] },
  }
  const good = parseEvalAnswers('{"pick":{"choice":"a","confidence":0.9},"yes":{"answer":true,"confidence":0.8},"sc":{"score":1.5,"confidence":0.7}}', qs)
  eq(good.ok, true, 'D1 合法三型解析通过')
  eq(good.ok && good.answers.pick.value, 'a', 'D2 choice 取值正确')
  eq(good.ok && good.answers.sc.value, 1.5, 'D3 score **可落两级之间**（官方口径，非整数）')

  eq(parseEvalAnswers('不是 JSON', qs).why, 'no-json', 'D4 无 JSON 拒')
  eq(parseEvalAnswers('{bad json}', qs).why, 'bad-json', 'D5 坏 JSON 拒')
  eq(parseEvalAnswers('{"pick":{"choice":"a"}}', qs).why, 'missing:yes', 'D6 缺题拒（不补默认值）')
  eq(parseEvalAnswers('{"pick":{"choice":"zzz"},"yes":{"answer":true},"sc":{"score":1}}', qs).why, 'type-violation:pick', 'D7 **choice 值越域 ⇒ type-violation**（不当字符串硬用）')
  eq(parseEvalAnswers('{"pick":{"choice":"a"},"yes":{"answer":"true"},"sc":{"score":1}}', qs).why, 'type-violation:yes', 'D8 boolean 非布尔 ⇒ 拒（不把 "true" 当 true）')
  eq(parseEvalAnswers('{"pick":{"choice":"a"},"yes":{"answer":true},"sc":{"score":99}}', qs).why, 'type-violation:sc', 'D9 score 越出量表范围 ⇒ 拒')
  eq(parseEvalAnswers('{"pick":{"choice":"a"},"yes":{"answer":true},"sc":{"score":NaN}}', qs).ok, false, 'D10 NaN ⇒ 拒（本仓教训：NaN 比较恒 false ⇒ 会静默走降级）')
}

/* ══ E. 档位与配置域 ═══════════════════════════════════════════════════ */
console.log('\nE. 档位（const union，防死开关）与默认值')
{
  eq(EVAL_TIERS.length, 4, 'E1 四档：local/fast/native/llm')
  const cfg = evalOptionsOf({ evalEnabled: false, evalBaseUrl: 'u', evalModel: 'm', evalApiKeyEnv: 'k', evalTier: 'local', evalEgressAllow: false })
  eq(cfg.evalEnabled, false, 'E2 **缺省关闭**（fail-closed）')
  eq(cfg.evalEgressAllow, false, 'E3 **缺省不许出网**')
  eq(Object.keys(cfg).length, 6, 'E4 投影不漏键（6 键 —— 沿"schema 有 ≠ config 有"的教训）')
}

/* ══ F. M2 落账形态（只落形态不落内容） ═══════════════════════════════════ */
console.log('\nF. M2 落账（只落形态不落内容 —— 沿 yield-rounds 的隐私决定）')
{
  const st = '材料：[原则] 代理指标非判据 · 心跳与端口不等运行态'
  const sha = stateSha8Of(st)
  eq(sha.length, 8, 'F1 state sha8 取 8 位')
  eq(/^[0-9a-f]{8}$/.test(sha), true, 'F2 sha8 为十六进制')
  eq(stateSha8Of(st) === sha, true, 'F3 同材料同 sha（可对账）')
  eq(stateSha8Of(st + 'x') !== sha, true, 'F4 材料变一字即换 sha（不误判"发过"）')
  eq(stateSha8Of(st).includes('代理') || st.includes(stateSha8Of(st)), false, 'F5 **sha 不可逆**：原文不出现在 sha 里')

  eq(hostOf('http://127.0.0.1:11434/v1'), '127.0.0.1', 'F6 取 host')
  eq(hostOf('https://api.typesafe.ai/v1'), 'api.typesafe.ai', 'F7 取远端 host')
  eq(hostOf('not-a-url'), '', 'F8 非法 URL 取空（不抛）')
  eq(isLoopbackHost('127.0.0.1'), true, 'F9 loopback host')
  eq(isLoopbackHost('127.1.2.3'), true, 'F10 127/8 整段')
  eq(isLoopbackHost('127.0.0.1.evil.com'), false, 'F11 伪造 host 判非 loopback（与 A7 同口径）')

  const sh = shapeOf('abc', ['boolean', 'choice', 'boolean'])
  eq(sh.stateChars, 3, 'F12 只记字符数')
  eq(sh.qCount, 3, 'F13 记题数')
  eq(sh.qTypes.join(','), 'boolean,choice', 'F14 题类型去重且排序')
  eq(confidenceMinOf({ a: { confidence: 0.9 }, b: { confidence: 0.4 } }), 0.4, 'F15 置信取**最小值**（保守）')
  eq(confidenceMinOf({ a: { confidence: null } }), null, 'F16 全无置信 ⇒ null（不伪造 1.0）')
  eq(confidenceMinOf(undefined), null, 'F17 无答案 ⇒ null')

  const ev = decisionEventOf({
    source: 'eval', tier: 'local', outcome: 'ok', why: 'ok', modelId: 'qwen3:8b',
    destHost: '127.0.0.1', destLoopback: true, ...sh, confidenceMin: 0.8,
    fellBack: false, latencyMs: 123, sid: 'abcdef12', point: 'probe',
  })
  eq(ev.type, 'eval.decision', 'F18 落账 type = eval.decision（并入统一台账，不新开流）')
  ok('F19 **不含内容字段**：' + (('text' in ev) || ('state' in ev) || ('q' in ev) ? '❌ 出现了内容字段' : '无 text/state/q')) 
  eq(Object.keys(ev).includes('stateSha8'), true, 'F20 含形态字段 stateSha8')
}

/* ══ G. M2 阈值随档（native 校准 vs 其余保守） ═══════════════════════════════ */
console.log('\nG. M2 阈值随档 —— **不共用一套**（官方：适配器"不保证校准"）')
{
  eq(isCalibratedTier('native'), true, 'G1 native = 有校准概率')
  eq(isCalibratedTier('local'), false, 'G2 local ≠ 校准档')
  eq(isCalibratedTier('fast'), false, 'G3 fast ≠ 校准档')
  eq(EVAL_THRESHOLDS.native.high !== EVAL_THRESHOLDS.weak.high, true, 'G4 **两套阈值不同**（核心判据）')

  eq(evaluateGateOf({ outcome: 'ok', tier: 'native', confidence: 0.95 }).gate, 'accept', 'G5 native 高置信 ⇒ accept（native.high=0.9）')
  /* G6 的判据是「**同一置信度在两档下处置不同**」——而不是"local 一律 review"。
   * ⚠ 本条最初被我写成"0.95@local ⇒ review"，是**测试断言写错**（把 `>=` 误当 `>`）：0.95 恰达 weak.high，
   *   判 accept 是对的。改判据为：取一个**落在两档之间**的置信度（0.92），验证分档确实不同。 */
  eq(evaluateGateOf({ outcome: 'ok', tier: 'native', confidence: 0.92 }).gate, 'accept', 'G6a 0.92@native ⇒ accept（≥0.9）')
  eq(evaluateGateOf({ outcome: 'ok', tier: 'local', confidence: 0.92 }).gate, 'review', 'G6b **0.92@local ⇒ review**（<0.95）—— 同置信度、不同档、不同处置')
  eq(evaluateGateOf({ outcome: 'ok', tier: 'local', confidence: 0.94 }).gate, 'review', 'G6c 0.94@local ⇒ review（未达 0.95）')
  eq(evaluateGateOf({ outcome: 'ok', tier: 'local', confidence: 0.99 }).gate, 'accept', 'G7 local 极高置信才 accept')
  eq(evaluateGateOf({ outcome: 'ok', tier: 'native', confidence: 0.2 }).gate, 'reject', 'G8 低置信 ⇒ reject')
  eq(evaluateGateOf({ outcome: 'off', tier: 'native', confidence: 0.99 }).gate, 'reject', 'G9 **非 ok 一律 reject**（fail-closed）')
  eq(evaluateGateOf({ outcome: 'ok', tier: 'native', confidence: null }).gate, 'review', 'G10 **无置信不可放行** ⇒ review')
  eq(evaluateGateOf({ outcome: 'ok', tier: 'local', confidence: NaN }).gate, 'review', 'G11 NaN 置信 ⇒ review（不因比较恒 false 而误 reject）')
}

/* ══ H. M2 统计折叠（四问必须答得出） ═════════════════════════════════════ */
console.log('\nH. M2 统计折叠（谁做的 / 有无回落 / 去向哪里 / 分态可辨）')
{
  const lines = [
    JSON.stringify({ type: 'eval.decision', outcome: 'ok', source: 'eval', destLoopback: true, fellBack: false }),
    JSON.stringify({ type: 'eval.decision', outcome: 'unreachable', source: 'eval', destLoopback: true, fellBack: true }),
    JSON.stringify({ type: 'eval.decision', outcome: 'egress-denied', source: 'eval', destLoopback: false, fellBack: true }),
    JSON.stringify({ type: 'eval.decision', outcome: 'ok', source: 'llm', destLoopback: false, fellBack: false }),
    JSON.stringify({ type: 'mcl-step' }),                       // 别族行：必须被忽略
    '{ 坏 json',                                                  // 坏行：跳过不抛
  ]
  const s = statsOfLines(lines)
  eq(s.total, 4, 'H1 只数 eval.decision 行（别族与坏行忽略）')
  eq(s.byOutcome.ok, 2, 'H2 分态计数 ok')
  eq(s.byOutcome.unreachable, 1, 'H3 **分态计数可辨**（unreachable 独立可数 —— 治"归因塌缩"）')
  eq(s.byOutcome['egress-denied'], 1, 'H4 egress-denied 独立可数')
  eq(Object.keys(s.byOutcome).length, 3, 'H5 三种不同 outcome ⇒ 分态未塌缩')
  eq(s.bySource.eval, 3, 'H6 谁做的：source 分布')
  eq(s.bySource.llm, 1, 'H7 回落来源可数')
  eq(s.fellBack, 2, 'H8 有回落 2 次')
  eq(s.egressOk, 1, 'H9 **去向哪里**：真出机且成功 1 次（destLoopback=false 且 ok）')
  eq(statsOfLines([]).total, 0, 'H10 空账 ⇒ 0（N=0 显式，不冒充分母）')
}

/* ══ I. M4 明细（四问本是**单条**属性 —— 聚合答不了"哪一条回落了、去了哪"） ═══════ */
console.log('\nI. M4 明细（recent 行含四问，且**不含内容**）')
{
  const mk = (over) => JSON.stringify({
    type: 'eval.decision', at: '2026-09-21T00:00:00.000Z', source: 'eval', tier: 'local',
    outcome: 'ok', why: 'ok', modelId: 'qwen3:8b', destHost: '127.0.0.1', destLoopback: true,
    qCount: 1, confidenceMin: 0.9, fellBack: false, latencyMs: 100, point: 'p', ...over,
  })
  const lines = [mk({ outcome: 'off', why: 'disabled', fellBack: true }), mk({ outcome: 'egress-denied', destHost: 'api.x.com', destLoopback: false })]

  const s0 = statsOfLines(lines, 0)
  eq(Array.isArray(s0.recent) && s0.recent.length === 0, true, 'I1 recentN=0 ⇒ 空明细（**不假装有明细**）')

  const s = statsOfLines(lines, 10)
  eq(s.recent.length, 2, 'I2 取到 2 条明细')
  eq(s.recent[0].outcome, 'off', 'I3 明细保序（台账 append ⇒ 尾部最新）')
  eq(s.recent[1].destHost, 'api.x.com', 'I4 **去向哪里**可逐条读')
  eq(s.recent[1].destLoopback, false, 'I5 是否出机可逐条读')
  eq(s.recent[0].fellBack, true, 'I6 **有无回落**可逐条读')
  eq(s.recent[0].confidenceMin, 0.9, 'I7 置信度可逐条读')
  eq(s.recent[0].source, 'eval', 'I8 谁做的可逐条读')
  eq(s.recent[0].latencyMs, 100, 'I9 耗时可逐条读')
  const keys = Object.keys(s.recent[0])
  eq(keys.some((k) => /state|text|q\b|material/i.test(k)), false, 'I10 **明细不含内容字段**（只形态）')

  const s2 = statsOfLines([mk({}), mk({})], 1)
  eq(s2.recent.length, 1, 'I11 recentN 截断生效')
  eq(s2.total, 2, 'I12 **聚合仍全量**（截断只影响明细，不影响分母）')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
