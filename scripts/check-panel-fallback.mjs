#!/usr/bin/env node
// check-panel-fallback.mjs — **面板回落值必须与运行态同源**（2026-09-21 · S4/ADR-324 同批）
//
// ── 判因（真机实测 · "同一开关两套口径"）──────────────────────────────────────────
// `/config` 的 `global` 块是**面板渲染配置的取值面**：有持久值用持久值，**没有则回落**。
//   而回落原先是**硬编码字面量**，运行时的真实缺省却是**注册表**（`scheduler.ts` 的 zod 写
//   `default(SURFACE.…)`）。两套口径各自演化 ⇒ **必然打架**。实测（本轮）：
//     · `mclFamiliarThreshold` 回落 **0.65** vs 注册表 **0.58**
//     · `injectProfileRows`      回落 **3**    vs 注册表 `carriers.profile` = **6**
//     · `scoreWeights`           回落 **'legacy'** vs 运行态 `SCORE.mode` = **'v2'**
//     · `injectFreshSlots`       回落 **2**    vs 注册表 **2**（巧合相等）
//   ⇒ 后果：当 `scheduler.json` **无该键**时 **面板显示 A、运行时按 B** ——
//     用户看着面板以为改对了，实际行为不同（本仓最忌的「假可控」）。
//
// ── 本件守什么 ─────────────────────────────────────────────────────────────────
//   ① `panel-config.ts` 的回落**不得出现已知的陈旧字面量**（逐个点名，带真机反例）
//   ② 声明"读注册表"的键，其表达式**必须真的引用 `SURFACE.*` / `SCORE.*`**
//   ③ 反向：注册表**未声明**的键（`activity*` 四项）**允许**保留字面量，
//      但**不得**写成 `SURFACE.不存在的字段`（那是"为统一而造的假引用"，比字面量更坏）——
//      本条用**实际 import 的 SURFACE 对象**做键存在性检查，不靠文本猜。
//   ④ 反例自证：把任一回落改回陈旧字面量 ⇒ ① 必红（`--selftest` 内联复现）
//
// 用法: node scripts/check-panel-fallback.mjs [--selftest]
// 退出码：0=PASS  1=FAIL
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/* (key, 必须引用的注册表路径, 已实测的陈旧字面量形态) —— **陈旧形态用于反例自证** */
const KEYS = [
  ['mclFamiliarThreshold', 'SURFACE.mcl.familiarThreshold', ': 0.65'],
  ['injectProfileRows', 'SURFACE.injection.carriers.profile', ': 3'],
  ['mclMaxNudges', 'SURFACE.mcl.maxNudges', ': 1'],
  ['mclBudgetChars', 'SURFACE.mcl.budgetChars', ': 600'],
  ['mclTopK', 'SURFACE.mcl.topK', ': 3'],
  ['injectFreshSlots', 'SURFACE.injection.freshSlots', ': 2'],
  ['recallColdFactorPercent', 'SURFACE.recall.coldFactorPercent', ': 35'],
  ['recallFusion', 'SURFACE.fusion.kind', "?? 'rrf'"],
  ['scoreWeights', 'SCORE.mode', "?? 'legacy'"],
]

/* ── `--selftest`：反例自证 ─────────────────────────────────────────────────── */
if (process.argv.includes('--selftest')) {
  const cases = [
    ['正例·真机修后形态（回落读 SURFACE）', 'mclFamiliarThreshold: typeof sched.mclFamiliarThreshold === \'number\' ? sched.mclFamiliarThreshold : SURFACE.mcl.familiarThreshold', true],
    ['**反例**·真机修前形态（回落字面量 0.65）', 'mclFamiliarThreshold: typeof sched.mclFamiliarThreshold === \'number\' ? sched.mclFamiliarThreshold : 0.65', false],
    ['**反例**·真机修前形态（injectProfileRows: 3）', 'injectProfileRows: typeof sched.injectProfileRows === \'number\' ? sched.injectProfileRows : 3', false],
    ['正例·未声明键保留字面量（activity* 四项）→ 允许', 'activityWarmDays: typeof sched.activityWarmDays === \'number\' ? sched.activityWarmDays : 14', true],
  ]
  let bad = 0
  for (const [label, line, want] of cases) {
    const stale = KEYS.some(([k, , s]) => line.includes(k) && line.trim().endsWith(s))
    const got = !stale
    if (got !== want) bad++
    console.log(`${got === want ? '✅' : '❌'} ${label} → 判${got ? '同源' : '陈旧'}（期望${want ? '同源' : '陈旧'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (negs.length < 2) { bad++; console.log('❌ 反例不足（须含"回落字面量"与另一陈旧形态）') }
  console.log(bad ? `\nFAIL（--selftest ${bad} 例）` : `\nPASS（判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────────── */
const F = join(root, 'src', 'panel-config.ts')
if (!existsSync(F)) { console.log('❌ 找不到 src/panel-config.ts（事实源不可缺）'); process.exit(1) }
const src = readFileSync(F, 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/* ① 逐个键：陈旧字面量不得出现 */
console.log('面板回落值 ⟷ 运行态缺省（同一开关不得两套口径）')
for (const [key, ref, stale] of KEYS) {
  const line = code.split('\n').find((l) => l.trim().startsWith(key + ':')) || ''
  const isStale = line.trim().endsWith(stale) || (stale.startsWith('??') && line.includes(stale))
  ok(line !== '' && !isStale, `① ${key} 回落**非陈旧字面量**（陈旧形态 \`${stale}\`${isStale ? ' ← **命中，正是本轮修的病**' : ' · 未出现'}）`)
  /* ② 且必须真的引用注册表 */
  ok(line.includes(ref), `② ${key} 回落**引用注册表** \`${ref}\``)
}

/* ③ 反向：不得引用 SURFACE 上**不存在的字段**（假引用比字面量更坏） */
const gen = join(root, 'lib', 'criteria.generated.js')
if (existsSync(gen)) {
  const mod = await import(new URL('../lib/criteria.generated.js', import.meta.url).href)
  const SURFACE = mod.SURFACE ?? {}
  const refs = [...code.matchAll(/\bSURFACE(?:\.\w+)+/g)].map((m) => m[0])
  const badRefs = [...new Set(refs)].filter((r) => {
    const path = r.replace(/^SURFACE\./, '').split('.')
    let cur = SURFACE
    for (const p of path) { if (cur === null || cur === undefined || !(p in cur)) return true; cur = cur[p] }
    return false
  })
  ok(badRefs.length === 0,
    `③ 无**假引用**：本文件引用的 ${new Set(refs).size} 个 SURFACE 路径**都真实存在**${badRefs.length ? `（悬空：${badRefs.join(', ')} —— **为统一而造的假引用，比字面量更坏**）` : ''}`)
  ok('activity' in SURFACE === false,
    '③ 反向确认：`SURFACE.activity` **确不存在** ⇒ `activity*` 四项保留字面量是**如实**的（非疏漏）')
} else {
  ok(true, '③ 跳过假引用检查（`lib/criteria.generated.js` 不在 ⇒ 先 `npm run build:host`）')
}

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（面板回落与运行态**同源**：无陈旧字面量 · 引用真实注册表路径 · 未声明的键如实保留）')
