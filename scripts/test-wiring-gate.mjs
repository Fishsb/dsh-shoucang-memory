#!/usr/bin/env node
// test-wiring-gate.mjs — 深睡/蒸馏「接线层」门禁（G-A1 · W1–W4）—— ⚠ **文本级**（text-regex），**非** AST
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │ 状态：进行中（interim）——**不是** G-A1 批准方案的终态，不得以「已完成」留账。 │
// │ G-A1 批准方案（deliverables/engineering-assurance/                            │
// │   reliability-distill-deepsleep-round4-2026-09-12.md 行动表第 4 行）是        │
// │   「符号级（TS AST），**禁用文本 grep**」——本件是文本正则，与之直接冲突。     │
// │ 保留原因：AST 版由 Archi 出，落地前先有快速护栏；落地后本件降级或删除。       │
// ├──────────────────────────────────────────────────────────────────────────────┤
// │ ⚠ 已知洞（下一个人照它以为有保护，就是这个洞的杀伤方式）：                    │
// │   正则**分不清代码与注释 / 字符串**。                                        │
// │   例：把 `return landed ? 'done' : 'failed'` 整行注释掉 ⇒ 文本仍在 ⇒          │
// │       **本件继续全绿，而接线已死**。                                         │
// │   同理抓不到：写在字符串常量里、写在多行 /* */ 块注释里、保留形状但语义改写。 │
// │ ⇒ 本件只能证明「接线文本按预期形状存在」，**不能**证明它真被执行。            │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// 为什么需要这一层（2026-09-12 可靠性审查，Cody）：
//   `test-deepsleep-verdict.mjs` 的 56 条断言**全部锁在纯函数**（deepSleepLanded / deepSleepReplayable / planDeepSleepVerdict /
//   commitPrinciples）上，而真正决定「丢不丢料」的是这四段**接线**——它们各自改坏一个字符，56 条断言
//   依旧全绿：
//     W1 原则落盘失败 ⇒ 是否真的报失败（added 归 0）——改成谎报 ⇒ 痕迹静默永久丢失（G-16）
//     W2 终判映射：landed ⇒ 'done' / 否则 'failed'——改成恒 'done' ⇒ 没消化的轮次也被划出窗口
//     W3 重启回放水位：只认可回放行且严格递增——去掉单调性 ⇒ 水位倒退，整窗重蒸
//     W4 判 failed ⇒ 水位回滚到本轮基准——改成推进到 now ⇒ 重试窗口被关死，本批痕迹永不再蒸
//   这四处都在闭包内、无 export、单测到不了 ⇒ 只能做**符号级（源码文本）接线闸**。
//
// 防「假绿门禁」的三条硬约束（本件自身必须满足，否则它就是我们刚踩过的那种假绿。
//   注意：这三条是**缓解**上面的已知洞，**不能消除它**——文本级门禁天生无法证明接线真被执行）：
//   ① **唯一性**：每条子断言要求命中次数**恰好等于**期望值。命中 0（接线被删）与命中 >1（出现第二处
//      旁路，语义不再唯一）都判 FAIL——只断言「存在」会被旁路骗过。
//   ② **反向证伪**：每条规则自带一组「破坏变体」，把源码按变体改写后，规则**必须翻红**。
//      只证明现状能过、不证明改坏会红，等于没锁。
//   ③ **变体非空**：变体改写必须真的改变了源码，否则该变体判 FAIL——防止变体字符串因源码漂移而
//      静默失效（replace 没命中 = 什么都没改 = 永远绿）。
//   ④ **基线守卫**（archi 2026-09-12 在 AST 版 `614abbf` 先撞到，本件同型，同批补上）：
//      基线（真实源码）已红时，「改坏后必须翻红」对**任何**变体都恒真 ⇒ 反向证伪整体空转，
//      输出里会冒出一排「✅ 改坏后必须翻红」——看起来门禁在工作，其实它什么也没证。
//      故：基线已红 ⇒ 每个变体判 FAIL 并标注「空转」，且显式断言「基线必须全绿」。
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

// ── 红因分桶（archi 2026-09-12「自伤型假红」）────────────────────────────────
// 为什么必须分桶：三类红**方向不同**，混在一个 fail 计数里会把诊断指反——
//   「结构」= 源码接线判据真的不成立 ⇒ 该改的是 **src/**；
//   「变体失效」/「空转」= 本件自己失效（变体锚点漂移 / 基线已红）⇒ 该修的是 **本件**，
//     此时源码一个字都没被证伪，exit=1 说的是"本件坏了"，读成"源码坏了"就是反的。
// ⇒ 判别式：看红的来源是「结构断言」还是「本件自校验」；结构红=0 而自伤红>0 时显式告警。
// 第四桶「漏网」= 变体把源码改坏了、本件却没翻红 ⇒ **这条接线根本没锁住**。
// ⚠ 它的处置方向与「变体失效/空转」**相反**：后两者是"本件坏了、改本件"；漏网是"判据不够、去补判据/锁接线"。
//   混桶会把"该去锁接线"误报成"该修本件"，故单列、且单独告警（archi 2026-09-12 第三亚型，team-lead 采纳）。
const BUCKET = { 结构: 0, 变体失效: 0, 空转: 0, 漏网: 0 }
const bad = (bucket, msg) => { fail++; BUCKET[bucket]++; console.log(`  ❌ [${bucket}] ${msg}`) }

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
    // G-19（2026-09-12）：终判由硬编码 `landed ⇒ done / !landed ⇒ failed` 换成**失败策略决策表**
    //   （retry=B 全重捞永不放行 / graded=C 连败 N 轮放行并告警）。锁点随之改为三段接线：
    //   landedNow 只能来自 deepSleepLanded → 裁定必须消费 landedNow → 终判必须返回裁定结果。
    id: 'W2',
    title: "深睡终判映射：由 planDeepSleepVerdict(landedNow,…) 产出（不得绕过策略/判据）",
    why: "改成恒 'done' 会让「做了但没落地」的轮次也划出窗口，等价于把拒收型丢料升级成永久丢料；"
      + "把裁定入参常量化则会让 landed 判据彻底失效（同型后果）。",
    asserts: [
      [/const landedNow = deepSleepLanded\(/g, 1, '终判输入由 deepSleepLanded 唯一产出（不得有旁路布尔量）'],
      [/const pv = planDeepSleepVerdict\(landedNow,/g, 1, '裁定必须消费 landedNow（决策表入参不得常量化）'],
      // 整行锚定（^\s*…$）：只查子串的话，`return pv.verdict === 'done' ? 'failed' : 'done'` 这类
      //   **映射反转**的改法仍能命中 ⇒ 闸门假绿（本件 2026-09-12 自测出的漏网，同 W1「只断言存在」的老洞）。
      [/^\s*return pv\.verdict\s*$/gm, 1, '终判返回决策表裁定（整行，不得包三元/常量化）'],
    ],
    breaks: [
      ['失败也判 done（静默推进水位）', (s) => s.replace('return pv.verdict', "return 'done'")],
      ['常量化终判（判据被完全绕过）', (s) => s.replace('planDeepSleepVerdict(landedNow,', 'planDeepSleepVerdict(true,')],
      ['映射反了（done/failed 互换）', (s) => s.replace('return pv.verdict', "return pv.verdict === 'done' ? 'failed' : 'done'")],
      ['断开 landedNow 与深睡判据的绑定', (s) => s.replace('const landedNow = deepSleepLanded(', 'const landedNow = true // ')],
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
    title: "判 failed / 异常 ⇒ 水位回滚到本轮基准（下轮可重试）",
    why: '改成推进到 now ⇒ 本批痕迹被永久关在窗外；这是「失败后会不会重新拉起」的最后一处接线。\n' +
      '     ⚠ 同一语义在代码里有**两个合法落点**（`.then` 的 failed 分支 与 `.catch` 分支），只锁一个等于没锁\n' +
      '       （2026-09-12 archi 在 AST 版闸上先撞到这个洞，本件同型：只锁了 .then，删掉 .catch 的回滚仍会全绿）。',
    asserts: [
      [/const prevDeepSleepAt = lastDeepSleepAt/g, 1, '本轮开始前先快照基准水位（回滚的落点）'],
      [/if \(r === 'failed'\) \{ lastDeepSleepAt = prevDeepSleepAt;/g, 1, '落点①：.then 内判 failed ⇒ 回滚到基准，而非推进到 now'],
      // ⚠ 根因留痕（archi 2026-09-12 要求，不要只绕开不留因）：
      //   早前写的是 `/\}\.catch\(\(e\) => \{.../`，**恒 0 命中 ⇒ 假红**。原因不是换行/缩进，是
      //   漏了一个 `)`：源码原文是 `}).catch((e) => {`（`}` 与 `.catch` 之间还有一个 `)`），
      //   `\}\.catch` 要求 `}` 紧跟 `.`。探针实测：`/\}\.catch/g` hits=0、`/\.catch\(/g` hits=4、
      //   全文 `lastDeepSleepAt = prevDeepSleepAt` hits=2 —— **前缀命中 0 而主体命中 2，即前缀写错**。
      //   故此处不锚 `}`，只锚 `.catch((e) => {` 并限窗口 60 字符，抗格式微调。
      //   ⇒ 纪律：写「唯一性正则」前，先把前缀和主体**分开各打一次命中数**（假红 100% 静默）。
      [/\.catch\(\(e\) => \{[\s\S]{0,60}?lastDeepSleepAt = prevDeepSleepAt/g, 1,
        '落点②：.catch 内同样回滚（异常时也不得推进水位——只锁落点① 的话删掉这里仍是绿的）'],
    ],
    breaks: [
      ['不回滚而推进到当前时间（重试窗口被关死）', (s) => s.replace(
        "if (r === 'failed') { lastDeepSleepAt = prevDeepSleepAt;",
        "if (r === 'failed') { lastDeepSleepAt = Date.now();")],
      ['回滚条件永不成立', (s) => s.replace("if (r === 'failed') {", "if (r === 'never') {")],
      ['基准快照丢失（回滚落点变成 0）', (s) => s.replace(
        'const prevDeepSleepAt = lastDeepSleepAt', 'const prevDeepSleepAt = 0')],
      ['删掉落点②（.catch 内回滚）——只锁一个落点时会假绿', (s) => s.replace(
        '      lastDeepSleepAt = prevDeepSleepAt\n      log(`deep sleep err:', '      log(`deep sleep err:')],
    ],
  },
]

const evalRule = (src, rule) => rule.asserts.map(([re, exp, label]) => {
  const n = hits(src, re)
  return { label, n, exp, pass: n === exp }
})

console.log('── 接线层门禁（W1–W4）· ⚠ 文本级（非 AST，已知洞见文件头）──')
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
  for (const r of res) {
    const label = `${r.label}（命中 ${r.n}，期望 ${r.exp}）`
    if (r.pass) ok(true, label); else bad('结构', label)
  }
  // 基线守卫：基线已红 ⇒ 下面的「改坏必须翻红」全部空转（任何变体都恒真），结论不可信
  const baseGreen = res.every((x) => x.pass)
  if (baseGreen) ok(true, `${rule.id} 基线全绿（反向证伪有效）`)
  else bad('空转', `${rule.id} 基线已红 ⇒ 反向证伪空转，下述变体一律判空转 FAIL`)
  // 反向证伪：把源码按「破坏变体」改写后，本规则**必须**翻红
  console.log(`  ── 反向证伪（改坏必须翻红）──`)
  for (const [name, mutate] of rule.breaks) {
    // 基线已红时不做变体判读：此时 stillGreen 恒 false ⇒ 会冒出一排假 ✅（archi 同型洞，614abbf）
    if (!baseGreen) { bad('空转', `基线已红，本变体判读无意义（空转）: ${name}`); continue }
    const mutated = mutate(src)
    if (mutated === src) { bad('变体失效', `变体未生效（锚点字符串已漂移，该变体形同虚设）: ${name}`); continue }
    const badRes = evalRule(mutated, rule)
    const stillGreen = badRes.every((x) => x.pass)
    if (stillGreen) bad('漏网', `改坏后**没**翻红（该接线根本没被本件锁住）: ${name}`)
    else ok(true, `改坏后必须翻红: ${name}`)
  }
}

console.log('\n⚠ 本件是**文本级**门禁（非 G-A1 批准的 TS AST 版），只能证明「接线文本按预期形状存在」，' +
  '\n  **不能**证明接线真被执行：把目标行整行注释掉，本件仍会全绿。AST 版落地前请勿据此判定「接线已锁」。')
// 自伤 = 变体失效 + 空转（该修**本件**）；漏网单列（该去**锁接线**）——两者处置方向相反，不得相加
const selfHurt = BUCKET.变体失效 + BUCKET.空转
console.log(`\n结果: ${pass} PASS / ${fail} FAIL（红因分解：结构 ${BUCKET.结构} · 变体失效 ${BUCKET.变体失效} · 空转 ${BUCKET.空转} · 漏网 ${BUCKET.漏网}）`)
// ⚠ 防误读：结构红=0 而自伤红>0 ⇒ exit=1 说的是「本件坏了」，不是「源码接线坏了」，方向相反必须点破
if (BUCKET.结构 === 0 && selfHurt > 0)
  console.log('⚠ 本件的红**全部来自自伤/空转**：源码接线判据一个字都没被证伪 ⇒ 该修的是**本件**，不是源码')
if (BUCKET.漏网 > 0)
  console.log(`⚠ 有 ${BUCKET.漏网} 条变体改坏源码后本件**没**翻红 ⇒ 该接线根本没锁住：该去**补判据/锁接线**，不是修本件`)
process.exit(fail === 0 ? 0 : 1)
