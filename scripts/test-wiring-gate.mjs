#!/usr/bin/env node
// test-wiring-gate.mjs — 深睡/蒸馏「接线层」符号级门禁（G-A1 · W1–W4）
//
// 为什么需要这一层（2026-09-12 可靠性审查，Cody）：
//   `test-deepsleep-verdict.mjs` 的 36 条断言**全部锁在纯函数**（deepSleepLanded / deepSleepReplayable /
//   commitPrinciples）上，而真正决定「丢不丢料」的是这四段**接线**——它们各自改坏一个字符，36 条断言
//   依旧全绿：
//     W1 原则落盘失败 ⇒ 是否真的报失败（added 归 0）——改成谎报 ⇒ 痕迹静默永久丢失（G-16）
//     W2 终判映射：landed ⇒ 'done' / 否则 'failed'——改成恒 'done' ⇒ 没消化的轮次也被划出窗口
//     W3 重启回放水位：只认可回放行且严格递增——去掉单调性 ⇒ 水位倒退，整窗重蒸
//     W4 判 failed ⇒ 水位回滚到本轮基准——改成推进到 now ⇒ 重试窗口被关死，本批痕迹永不再蒸
//   这四处都在闭包内、无 export、单测到不了 ⇒ 只能做**符号级（源码文本）接线闸**。
//
// 防「假绿门禁」的三条硬约束（本件自身必须满足，否则它就是我们刚踩过的那种假绿）：
//   ① **唯一性**：每条子断言要求命中次数**恰好等于**期望值。命中 0（接线被删）与命中 >1（出现第二处
//      旁路，语义不再唯一）都判 FAIL——只断言「存在」会被旁路骗过。
//   ② **反向证伪**：每条规则自带一组「破坏变体」，把源码按变体改写后，规则**必须翻红**。
//      只证明现状能过、不证明改坏会红，等于没锁。
//   ③ **变体非空**：变体改写必须真的改变了源码，否则该变体判 FAIL——防止变体字符串因源码漂移而
//      静默失效（replace 没命中 = 什么都没改 = 永远绿）。
//
// 用法: node scripts/test-wiring-gate.mjs
import { readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src', 'distill.ts')

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }
const hits = (s, re) => (s.match(re) || []).length

// 每条规则 = 一组「唯一性子断言」+ 一组「破坏变体」
// 子断言格式：[正则, 期望命中次数, 说明]
const RULES = [
  {
    id: 'W1',
    title: '原则落盘失败 ⇒ 本轮必须判失败（added=0 + 共享常量 gate），不得谎报已消化',
    why: 'G-16：rename 失败后若仍按 added>0 返回 ⇒ landed:true ⇒ 水位推进 ⇒ 本批痕迹静默永久丢失（崩溃型）。',
    asserts: [
      [/const cm = commitPrinciples\(/g, 1, '提交点 commitPrinciples 调用存在且唯一'],
      [/if \(!cm\.ok\) \{/g, 1, '提交失败分支存在且唯一'],
      [/return \{ attempted, added: 0, replaced: 0, skipped: attempted, gate: COMMIT_FAILED_GATE, gateExit: -1, rejectedLines \}/g,
        1, '失败返回形状：added 归 0 + gate 用共享常量（只改 gate 无效，added 才是判据输入）'],
      [/export const COMMIT_FAILED_GATE = /g, 1, 'gate 字面量单一定义（producer 与 consumer 共享同一常量）'],
      [/COMMIT_FAILED_GATE\]\.includes\(app\.gate\)/g, 1, '判据侧 deepSleepLanded 消费同一常量（不得写死字面量）'],
    ],
    breaks: [
      ['谎报：失败分支把 added: 0 改成 acceptedItems.length', (s) => s.replace(
        'return { attempted, added: 0, replaced: 0, skipped: attempted, gate: COMMIT_FAILED_GATE',
        'return { attempted, added: acceptedItems.length, replaced: 0, skipped: attempted, gate: COMMIT_FAILED_GATE')],
      ['producer 写死字面量，脱离共享常量', (s) => s.replace(
        'gate: COMMIT_FAILED_GATE, gateExit: -1', "gate: '落盘异常', gateExit: -1")],
      ['consumer 脱钩：判据不再消费该 gate', (s) => s.replace(
        "['write_gate 未就位', COMMIT_FAILED_GATE].includes(app.gate)", "['write_gate 未就位'].includes(app.gate)")],
      ['吞掉失败：失败分支永不进入', (s) => s.replace('if (!cm.ok) {', 'if (false) {')],
    ],
  },
  {
    id: 'W2',
    title: "深睡终判映射：landed ⇒ 'done'，否则 'failed'",
    why: "改成恒 'done' 会让「做了但没落地」的轮次也划出窗口，等价于把拒收型丢料升级成永久丢料。",
    asserts: [
      [/const landed = deepSleepLanded\(/g, 1, '终判输入由 deepSleepLanded 唯一产出（不得有旁路布尔量）'],
      [/return landed \? 'done' : 'failed'/g, 1, "终判映射存在且唯一：landed ⇒ 'done' / !landed ⇒ 'failed'"],
    ],
    breaks: [
      ['失败也判 done（静默推进水位）', (s) => s.replace(
        "return landed ? 'done' : 'failed'", "return landed ? 'done' : 'done'")],
      ['常量化终判（判据被完全绕过）', (s) => s.replace("return landed ? 'done' : 'failed'", "return 'done'")],
      ['映射反了', (s) => s.replace("return landed ? 'done' : 'failed'", "return landed ? 'failed' : 'done'")],
      ['断开 landed 与深睡判据的绑定', (s) => s.replace('const landed = deepSleepLanded(', 'const landed = true // ')],
    ],
  },
  {
    id: 'W3',
    title: '重启回放水位：只认可回放行，且严格单调递增（不得倒退）',
    why: '去掉单调性 ⇒ 旧审计行把水位拉回过去 ⇒ 整窗重蒸（G-20 实测：13 次回退、≈137 万事件重蒸）。',
    asserts: [
      [/if \(deepSleepReplayable\(o\) && t > lastDeepSleepAt\) lastDeepSleepAt = t/g, 1,
        '回放：先过 deepSleepReplayable 过滤，再要求 t > lastDeepSleepAt（单调）'],
      [/if \(!lastDeepSleepAt\) lastDeepSleepAt = Date\.now\(\)/g, 1,
        '兜底：仅在无回放值时用当前时间（无条件覆盖会冲掉刚回放出来的水位）'],
    ],
    breaks: [
      ['去掉单调性（水位可倒退）', (s) => s.replace(
        'if (deepSleepReplayable(o) && t > lastDeepSleepAt) lastDeepSleepAt = t',
        'if (deepSleepReplayable(o)) lastDeepSleepAt = t')],
      ['不再过滤可回放行（全拒收轮次也被当成有效水位）', (s) => s.replace(
        'if (deepSleepReplayable(o) && t > lastDeepSleepAt)', 'if (t > lastDeepSleepAt)')],
      ['兜底变成无条件覆盖（回放值被冲掉）', (s) => s.replace(
        'if (!lastDeepSleepAt) lastDeepSleepAt = Date.now()', 'lastDeepSleepAt = Date.now()')],
    ],
  },
  {
    id: 'W4',
    title: "判 failed ⇒ 水位回滚到本轮基准（下轮可重试）",
    why: '改成推进到 now ⇒ 本批痕迹被永久关在窗外；这是「失败后会不会重新拉起」的最后一处接线。',
    asserts: [
      [/const prevDeepSleepAt = lastDeepSleepAt/g, 1, '本轮开始前先快照基准水位（回滚的落点）'],
      [/if \(r === 'failed'\) \{ lastDeepSleepAt = prevDeepSleepAt;/g, 1, "判 failed ⇒ 回滚到基准，而非推进到 now"],
    ],
    breaks: [
      ['不回滚而推进到当前时间（重试窗口被关死）', (s) => s.replace(
        "if (r === 'failed') { lastDeepSleepAt = prevDeepSleepAt;",
        "if (r === 'failed') { lastDeepSleepAt = Date.now();")],
      ['回滚条件永不成立', (s) => s.replace("if (r === 'failed') {", "if (r === 'never') {")],
      ['基准快照丢失（回滚落点变成 0）', (s) => s.replace(
        'const prevDeepSleepAt = lastDeepSleepAt', 'const prevDeepSleepAt = 0')],
    ],
  },
]

const evalRule = (src, rule) => rule.asserts.map(([re, exp, label]) => {
  const n = hits(src, re)
  return { label, n, exp, pass: n === exp }
})

console.log('── 接线层符号级门禁（W1–W4）──')
let src
try {
  const buf = readFileSync(SRC)
  src = buf.toString('utf8')
  const st = statSync(SRC)
  console.log(`源码戳: src/distill.ts bytes=${st.size} mtime=${st.mtime.toISOString()} md5=${createHash('md5').update(buf).digest('hex')}`)
} catch (e) {
  console.log(`  ❌ 读不到源码 ${SRC}: ${String(e?.message ?? e)}`)
  console.log(`\n结果: 0 PASS / 1 FAIL`)
  process.exit(1)
}

for (const rule of RULES) {
  console.log(`\n[${rule.id}] ${rule.title}`)
  console.log(`  为什么锁它：${rule.why}`)
  const res = evalRule(src, rule)
  for (const r of res) ok(r.pass, `${r.label}（命中 ${r.n}，期望 ${r.exp}）`)
  // 反向证伪：把源码按「破坏变体」改写后，本规则**必须**翻红
  console.log(`  ── 反向证伪（改坏必须翻红）──`)
  for (const [name, mutate] of rule.breaks) {
    const bad = mutate(src)
    if (bad === src) { ok(false, `变体未生效（锚点字符串已漂移，该变体形同虚设）: ${name}`); continue }
    const badRes = evalRule(bad, rule)
    const stillGreen = badRes.every((x) => x.pass)
    ok(!stillGreen, `改坏后必须翻红: ${name}`)
  }
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
