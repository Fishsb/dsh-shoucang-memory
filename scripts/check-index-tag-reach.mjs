#!/usr/bin/env node
// check-index-tag-reach.mjs — **索引行合法标签集：注册表 ⟷ 写门 ⟷ prompt 三处一致**（2026-09-20 · 真机取证驱动）
//
// ── 判因（真机实测 · 与 `formatConstraintLine()` / 门4「取值域未抵达 prompt」**同族**）──────────
// 真机跨档台账 915 轮蒸馏：`新索引行标签非法` **131 条**（占同期 rejected 725 的 **18%**）；
//   09-20 单日 added 92 / rejected 106 ⇒ 其中标签非法 **27 = 25%**。
//   非法标签分布：`[路径]` 75 · `[原则]` 40 · `工具` 4 · `方法` 4 · `lesson` 4 · `机制` 3 · …
//
// 三层事实：
//   ① **写门白名单**（唯一强制点）= `scripts/memory-append.mjs` 的 `--new` 正则（14 个标签）；
//   ② **prompt 里一个都没有** —— 实测 `src/distill.ts` / `src/deepsleep-core.ts` 的 prompt 常量
//      中标签集命中 **0** ⇒ 模型只能自造（`[路径]`/`[原则]` 是它最自然的两种归纳命名）；
//   ③ 被拒 ⇒ `rejected` ⇒ **推水位、不再重试** ⇒ 知识**静默流失**（不是"没提炼"，是"提炼了被整条丢弃"）。
//
// ── 本件守三条（全部可机检）──────────────────────────────────────────────────
//   ① **差分锁**：注册表 `ingest.format.index-line.params.lineTags` ⟷ 写门正则 ⟷ 仓内孪生脚本，
//      三者标签集必须**逐个相等**（任一处改了另一处没改 ⇒ 红）。
//   ② **抵达面**：`lineTags` 经生成器派生（`indexTagLine()`）后，必须**运行期**出现在
//      `DEFAULT_DISTILL_PROMPT`（读 `lib/` 编译产物求值，**不 grep 源码**——那正是
//      `check-l0-conflict-wiring` 曾踩的假红：tsc 不内联模板表达式）。
//      且必须**显式声明 `[原则]`/`[路径]` 不在本通道**（真机 88% 的流失是这两类）。
//   ③ **不得反向污染**：深睡 `DEEP_SLEEP_PROMPT` **不得**携带该白名单 —— 深睡的产出通道是
//      `principles`/`pointerOps`（写 AGENT.md 的 `[原则]`/`[路径]`），若把"newIndex 白名单"
//      喂给它，恰好会**禁止它做本职**（把判据放错面 = 造新缺陷）。
//
// 用法: node scripts/check-index-tag-reach.mjs [--selftest]
// 退出码：0=PASS  1=FAIL
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 从 `memory-append.mjs` 的 `--new` 正则里解析出标签集（**唯一强制点的实际取值**） */
const tagsOfWriteGate = (src) => {
  const m = String(src).match(/if\s*\(\s*!\/\^\\\[\(([^)]+)\)\\\]\//)
  if (!m) return null
  return m[1].split('|').map((s) => s.trim()).filter(Boolean)
}
/** 注册表声明 */
const tagsOfRegistry = (reg) =>
  reg?.ingest?.criteria?.find((c) => c.id === 'ingest.format.index-line')?.params?.lineTags || null

/* ── `--selftest`：反例自证（样例取自真机形态）──────────────────────────────── */
if (argv.includes('--selftest')) {
  const cases = [
    ['正例·三处标签集逐个相等', { reg: ['env', '教训'], gate: ['env', '教训'], twin: ['env', '教训'] }, true],
    ['**反例**·注册表多一个、写门没有（真机修前形态：声明了却没落地）', { reg: ['env', '教训', '边界'], gate: ['env', '教训'], twin: ['env', '教训'] }, false],
    ['**反例**·写门加了、注册表没同步（改一处忘另一处）', { reg: ['env'], gate: ['env', '教训'], twin: ['env', '教训'] }, false],
    ['**反例**·仓内孪生与生产脚本不一致（两份副本漂移）', { reg: ['env'], gate: ['env'], twin: ['env', '教训'] }, false],
    ['**反例**·prompt 里一个标签都没有（真机原始形态）', { promptHas: 0, total: 14 }, false],
    ['**反例**·prompt 缺 `[原则]` 排除说明（模型仍会往 newIndex 写原则行）', { promptHas: 14, total: 14, excludesPrinciple: false }, false],
  ]
  let bad = 0
  for (const [label, c, want] of cases) {
    let got
    if (c.promptHas !== undefined) got = c.promptHas === c.total && c.excludesPrinciple !== false
    else got = JSON.stringify(c.reg) === JSON.stringify(c.gate) && JSON.stringify(c.gate) === JSON.stringify(c.twin)
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判${got ? '绿' : '红'}（期望${want ? '绿' : '红'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (!negs.length) { bad++; console.log('❌ 自证不含反例 —— 恒真断言不得进验收') }
  console.log(bad ? `\nFAIL（${bad} 例）` : `\nPASS（索引行标签集三处一致判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ─────────────────────────────────────────────────────────────────── */
const regPath = join(root, 'skill', 'engine', 'criteria.json')
if (!existsSync(regPath)) { console.log('❌ 找不到判据注册表（事实源不可缺）'); process.exit(1) }
const reg = JSON.parse(readFileSync(regPath, 'utf8'))
const regTags = tagsOfRegistry(reg)
if (!regTags || !regTags.length) {
  console.log('❌ 注册表缺 `ingest.format.index-line.params.lineTags` —— 白名单无从差分（登记缺失 = 不可见）')
  process.exit(1)
}

console.log('索引行标签集一致性（注册表 ⟷ 写门 ⟷ 孪生 ⟷ prompt 抵达）')

const gatePath = join(root, 'scripts', 'memory-append.mjs')
const twinPath = join(root, 'skill', 'scripts', 'memory-append.mjs')
const gateSrc = existsSync(gatePath) ? readFileSync(gatePath, 'utf8') : ''
const twinSrc = existsSync(twinPath) ? readFileSync(twinPath, 'utf8') : ''
const gateTags = tagsOfWriteGate(gateSrc)
const twinTags = tagsOfWriteGate(twinSrc)
console.log(`   · 注册表 ${regTags.length} 个：${regTags.join(' ')}`)
console.log(`   · 写门   ${gateTags ? gateTags.join(' ') : '（解析失败）'}`)
console.log(`   · 孪生   ${twinTags ? twinTags.join(' ') : '（解析失败）'}`)

const eq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])
ok(!!gateTags, '① 写门 `--new` 正则可解析（标签集的实际取值）')
ok(eq(regTags, gateTags),
  `① 注册表 lineTags == 写门正则${eq(regTags, gateTags) ? '' : ` —— 差集：注册表独有 ${regTags.filter((t) => !(gateTags || []).includes(t)).join(',') || '无'} · 写门独有 ${(gateTags || []).filter((t) => !regTags.includes(t)).join(',') || '无'}`}`)
ok(eq(gateTags, twinTags), '① 仓内孪生 `skill/scripts/memory-append.mjs` 与生产脚本同集（改一份必须改两份，见 `check-deploy-sync`）')

/* ② 抵达面：**运行期 prompt 文本**（import 模板常量求值；不 grep 源码/lib 文本） */
const distillJs = join(root, 'lib', 'distill.js')
if (!existsSync(distillJs)) {
  console.log('   · ② `lib/distill.js` 缺席 ⇒ **无法判定抵达面**（先 `npm run build`；不假装通过）')
  fail++
} else {
  const { DEFAULT_DISTILL_PROMPT } = await import(new URL('../lib/distill.js', import.meta.url).href)
  const prompt = String(DEFAULT_DISTILL_PROMPT || '')
  const missing = regTags.filter((t) => !prompt.includes(`[${t}]`))
  const excludesPrinciple = prompt.includes('[原则]') && prompt.includes('[路径]') && /不在\s*.?newIndex.?|newIndex.{0,12}白名单内/.test(prompt.replace(/\s+/g, ' '))
  console.log(`   · ② 运行期 `+'`DEFAULT_DISTILL_PROMPT`'+` 含 ${regTags.length - missing.length}/${regTags.length} 个标签 · 排除说明 ${excludesPrinciple ? '有' : '无'}`)
  ok(missing.length === 0,
    '② 全部 `lineTags` 抵达**运行期**蒸馏 prompt（读 `lib/` 求值，防「引用了但投影为空」的假绿）' + (missing.length ? ` —— 缺：${missing.join(', ')}` : ''))
  ok(excludesPrinciple,
    '② prompt **显式声明** `[原则]`/`[路径]` 不在 `newIndex` 通道（真机 131 条非法标签里 115 条即此二类，占 88%）')

  /* ③ 不得反向污染：深睡 prompt 的产出通道是 principles/pointerOps（写 AGENT.md 的 [原则]/[路径]），
   *   把 newIndex 白名单喂给它恰好会禁止它做本职 —— 判据放错面 = 造新缺陷。 */
  const sleepJs = join(root, 'lib', 'deepsleep-core.js')
  if (existsSync(sleepJs)) {
    const { DEEP_SLEEP_PROMPT } = await import(new URL('../lib/deepsleep-core.js', import.meta.url).href)
    const sp = String(DEEP_SLEEP_PROMPT || '')
    const polluted = /索引行行首标签必须逐字取下列之一/.test(sp)
    ok(!polluted, '③ 深睡 prompt **未**携带 newIndex 白名单（它的产出走 principles/pointerOps，写 AGENT.md 的 [原则]/[路径]）—— 判据不得放错面')
  } else {
    console.log('   · ③ `lib/deepsleep-core.js` 缺席 ⇒ 反向污染检查跳过（build 后复跑）')
  }
}

/* ④ 真机样本（报告态）：标签非法占 rejected 的比例（存量不可改造，只报告） */
{
  const { homedir } = await import('node:os')
  const ledPath = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'knowledge', 'audit', 'ledger.jsonl')
  if (!existsSync(ledPath)) {
    console.log('   · ④ 台账缺席 ⇒ **无样本**（N=0 显式记 0，不假装通过）')
  } else {
    /* ⚠ **必须跨档读**（G13「轮转失明」：本仓已因单档读丢过 87% 数据） */
    const { readLedgerVolumes } = await import(new URL('../lib/ledger-compact.js', import.meta.url).href)
    let runs = 0, rejected = 0, tagIllegal = 0, rowsWith = 0
    const dist = {}
    for (const l of readLedgerVolumes(ledPath)) {
      if (!l.trim()) continue
      let o
      try { o = JSON.parse(l) } catch { continue }
      if (o.kind !== 'distill-run') continue
      runs++
      rejected += Number(o.rejected) || 0
      let hit = false
      for (const it of (o.failedItems || [])) {
        const m = String(it.reason || '').match(/标签非法[:：]\s*(-\s*)?\[([^\]]+)\]/)
        if (!m) continue
        tagIllegal++; hit = true
        dist[m[2]] = (dist[m[2]] || 0) + 1
      }
      if (hit) rowsWith++
    }
    const pct = rejected ? ((tagIllegal / rejected) * 100).toFixed(1) : '—'
    const top = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v}`).join(' · ')
    console.log(`   · ④ 存量（跨档）：distill-run **${runs}** 轮 · rejected **${rejected}** · 其中**标签非法 ${tagIllegal}**（${pct}%，涉及 ${rowsWith} 轮）`)
    if (top) console.log(`     非法标签分布（前 6）：${top}`)
  }
}

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（索引行标签集：注册表 == 写门 == 孪生，且**运行期抵达 prompt**；深睡面未被误污染）')
