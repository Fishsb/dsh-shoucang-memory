#!/usr/bin/env node
// check-attribution-samples.mjs — **归因样本：取值上限必须 ≥ 判定门槛**（2026-09-20 round 9）
//
// ── 判因（真机实测 · **又一个"读成在等样本，其实是链断了"**）────────────────
// J3/U1 这条挂了多轮，登记上一直写着「**已接线并真机跑通；一致率待样本积累**」。
// 本轮实测把它戳穿：跨档 **35** 条带 `attribution*` 字段的深睡行，
//   `attributionSamples` **min 0 / max 18**，**≥30 者 0 条**，出非 `insufficient` verdict 的 **0 条**。
// 读码找到根因 —— **两处字面量互相打架**：
//   · `deepsleep-run.ts` 取样本：`samplesFromMclRows(missRows, 20)`  ← **上限 20**
//   · 同一函数判定：      `if (samples.length < 30) return insufficient` ← **门槛 30**
//   ⇒ **上限 20 永远不可能 ≥ 30** ⇒ 该分支**结构性恒真** ⇒
//     后面那段**真调子代理**的代码（整个 J3/U1 的目的）**从未执行过一次**。
//
// ── 为什么长期没人发现 ────────────────────────────────────────────────────
// ① 判定结果 `insufficient` **看起来像"样本不足"**（它字面就写着"未命中样本 N < 30"），
//    而 N 一路是 6/10/11/14/17 —— 一串**看起来在涨**的数 ⇒ 极易读成"在积累，快到了"。
//    实际它**永远到不了**：上限 20 卡死在前面。
// ② 门禁全绿：`check-runner` 跑的是"调用点存在 / 字段齐备"，**没有一道问"这个分支会不会恒真"**。
// ⇒ 与本仓已登记的「门4 零样本实为断链」「S-P1b′ 纪元 3/10 实为单档读」**同族**：
//   **"样本不足"与"结构性不可达"在读数上长得一模一样。**
//
// ── 本件守什么（两条断言）─────────────────────────────────────────────────
//   ① **不变量**：`ATTRIBUTION_SAMPLE_LIMIT >= ATTRIBUTION_MIN_SAMPLES`
//      （从**源码实际取值**解析，不采信注释）。
//   ② **判定可达性**：门槛分支之后**必须真的存在**调用子代理的代码
//      （否则"上门槛"也白搭 —— 防"把恒真分支改成恒假分支"的假修）。
//   ③ 反例自证：复现真机缺陷形态（limit=20 / min=30）⇒ ① 必红。
//
// 用法: node scripts/check-attribution-samples.mjs [--selftest]
// 退出码：0=PASS  1=FAIL
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** 从源码文本解析 `const NAME = <number>`（**剥注释**，只认可执行代码）。 */
export const numConst = (src, name) => {
  const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*(\\d+)`).exec(strip(src))
  return m ? Number(m[1]) : null
}

/* ── `--selftest`：反例自证（样例取自真机缺陷形态）────────────────────────── */
if (process.argv.includes('--selftest')) {
  const cases = [
    ['正例·上限 = 门槛（真机修后形态 30/30）→ 可达', 30, 30, true],
    ['正例·上限 > 门槛（40/30）→ 可达', 40, 30, true],
    ['**反例**·上限 < 门槛（**真机修前形态 20/30**）→ 恒真不可达', 20, 30, false],
    ['反例·上限远小于门槛（5/30）→ 不可达', 5, 30, false],
  ]
  let bad = 0
  for (const [label, limit, min, want] of cases) {
    const got = limit >= min
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判${got ? '可达' : '不可达'}（期望${want ? '可达' : '不可达'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (negs.length < 2) { bad++; console.log('❌ 反例不足（须含"上限<门槛"与"上限远小于门槛"）') }
  console.log(bad ? `\nFAIL（--selftest ${bad} 例）` : `\nPASS（判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────── */
const F = join(root, 'src', 'deepsleep-run.ts')
if (!existsSync(F)) { console.log('❌ 找不到 src/deepsleep-run.ts（事实源不可缺）'); process.exit(1) }
const src = readFileSync(F, 'utf8')
const limit = numConst(src, 'ATTRIBUTION_SAMPLE_LIMIT')
const min = numConst(src, 'ATTRIBUTION_MIN_SAMPLES')
console.log('归因样本不变量核查（取值上限 ≥ 判定门槛）')
console.log(`   实测：ATTRIBUTION_SAMPLE_LIMIT=${limit ?? '(未找到)'} · ATTRIBUTION_MIN_SAMPLES=${min ?? '(未找到)'}`)
ok(limit !== null && min !== null, '① 两个常量都在（**不得退回字面量** —— 那正是本轮修的病）')
if (limit !== null && min !== null) {
  ok(limit >= min,
    `① 不变量成立：上限 ${limit} ≥ 门槛 ${min}${limit < min ? ` —— **结构性不可达**（上限 < 门槛 ⇒ 门槛分支恒真 ⇒ 判定永不发生）` : ''}`)
}
/* ② 判定分支之后必须**真的存在**调用子代理的代码（防"把恒真改成恒假"的假修） */
const code = strip(src)
const afterGate = code.slice(code.indexOf('ATTRIBUTION_MIN_SAMPLES'))
ok(/subagents\.start\s*\(/.test(afterGate),
  '② 门槛分支之后**确有**调用子代理的代码（`subagents.start(`）—— 否则"上门槛"也到不了判定')

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（归因判定**可达**：取值上限 ≥ 门槛，且门槛之后真有判定代码）')
