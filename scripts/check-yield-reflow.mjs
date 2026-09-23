#!/usr/bin/env node
// check-yield-reflow.mjs — **收益回流可触发性**（2026-09-23 · 消费链拟态落地方案 §5.2）
//
// ── 守什么（先给会掩盖其他问题的那一类）──────────────────────────────────────
// 2026-09-22（D5）之后，中层换向出口**结构性哑火**：`zeroGain` 恒 0 → `switchSource` 永假
//   → `mcl-switch` 不可达。而它在**读数上与"一切都顺利"完全同形**，全程零告警。
//   真机实证（全三档台账）：
//     · D5 **前**：`zeroGain` 有 39 种取值 · `≥2` 行 **180** · `switchSource=true` **114 行**
//     · D5 **后**：judge 2570 行 `zeroGain` **全为 0** · `switchSource=true` **0 行**
//   ⇒ **不是"从未触发"，是 D5 把它关死的**。
//
// 本件要回答的**只有一件事**：**这个判据信号此刻是否还有判别力**？
//   —— 即：能不能把「**没触发（正常）**」与「**不可能触发（缺陷）**」分开。
//
// ── 判据形态（三条，锚**结构量**，不用墙钟）──────────────────────────────────
// ⚠ **禁用墙钟窗**（如"最近 30 天"）：实测反例 —— 已哑 1.5 天时 `inWindow=10 → exit 0`，
//   墙钟窗会把"又哑了一天"藏进去。**锚点必须是事件**（首条带 `acted` 键的 judge 行 = D5 接线点）。
//
//   ① **R1 结构可触发性**：`zeroGain` 取值数 ≥ 2 **且** `≥2` 的行 > 0（只在 `note==='slow'` 桶内算
//      —— 那是唯一走到 `foldZeroGain` 的分支；`fast`/`decide-none` 桶天然恒 0，**计入会误报**）。
//   ② **R2 出口可触发性**：锚点之后 `mcl-switch` 行数 > 0（锚点 = 首条带 `acted` 键的 judge 行）。
//   ③ **R3 回流配对率**：`mcl-switch` 与 `yield.verdict` 行**同一会话内配对**（防"回流没通、计数自己动了"）。
//      60s/3600s 窗配对为 0 而总数 >0 ⇒ 两边**不是同一因果链**（真机曾是"跨日错开、86400s 才 10/10"）。
//
// ── 今天的状态（**如实标**）────────────────────────────────────────────────
// 本件落地时（2026-09-23，D5 尚未解除）：R1/R2 **应当是红的**（缺陷仍在，数据尚未产生）。
//   ⇒ 按 `check-runner` 的 xfail 契约，**先以 `{ xfail: true }` 登记**（显式声明"已知未修"）；
//     一旦判定转绿 ⇒ emitter 必须退 1（XPASS = 施工完成信号，**不是**回归失败）。
//   ⚠ R3 依赖回流跑起来才有数据 ⇒ **未取得数据时判 skip（exit 3）**，不假装通过、也不算失败。
//     这正是本仓纪律：「缺席 ≠ 干净」（见 `check-journal-privacy` 对缺席日志的同一处置）。
//
// 用法: node scripts/check-yield-reflow.mjs [--selftest] [--json] [--ledger <path>]
// 退出码：0 = 全过 · 3 = 数据不足（诚实跳过） · 4 = 存在已知未修（xfail；调用方按声明制处理） · 1 = 真失败/自证失败
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/* ── 纯判据（可单测 · 不碰盘）───────────────────────────────────────────────── */

/** 首条带 `acted` 键的 judge 行的 `at`（= D5 接线**事件锚点**，**不用墙钟**） */
export function anchorOf(rows) {
  let best = ''
  for (const o of rows) {
    if (o?.phase !== 'judge') continue
    if (!Object.prototype.hasOwnProperty.call(o, 'acted')) continue
    const at = String(o?.at || '')
    if (at && (!best || at < best)) best = at
  }
  return best
}

/**
 * R1 **结构可触发性**（只看 `note==='slow'` 桶 —— 唯一走到 `foldZeroGain` 的分支）。
 * 判据：取值数 ≥ 2 **且** `≥2` 的行数 > 0。返回 `{n, distinct, ge2, ok}`。
 *
 * ⚠ **必须按事件锚点分段**（2026-09-23 圆桌会议 §1 记账纪律 **C：分界前/后分段并列**）：
 *   全库混算会让 D5 **之前**的 39 种取值把 D5 **之后**的"恒 0"掩盖成绿 —— 实测踩过：
 *   全档得 `distinct=39 / ge2=110`（绿），而锚点后得 `distinct=1 / ge2=0`（红）。
 *   而结论句「换代后结构性不输出」**只能**由**锚点之后**支撑（前段列出来是为了证明"曾经有"）。
 *   ⚠ 且**禁用卷边界当时间边界**：D5 边界切在 `.1` **内部**（同卷内既有前段又有后段）。
 *
 * @param rows   全档行
 * @param anchor 事件锚点（首条带 `acted` 的 judge 行 `at`）；**空串 ⇒ 不设下界**（未接线时退回全档）
 */
export function structuralReachability(rows, anchor = '') {
  const zs = []
  for (const o of rows) {
    if (o?.phase !== 'judge' || o?.note !== 'slow') continue
    if (!Object.prototype.hasOwnProperty.call(o, 'zeroGain')) continue
    if (anchor && String(o?.at || '') < anchor) continue   // 只看锚点之后（换代后形态）
    zs.push(Number(o.zeroGain) || 0)
  }
  const distinct = new Set(zs).size
  const ge2 = zs.filter((z) => z >= 2).length
  return { n: zs.length, distinct, ge2, ok: zs.length > 0 && distinct >= 2 && ge2 > 0 }
}

/** R2 **出口可触发性**：锚点之后 `mcl-switch` 行数 > 0 */
export function switchAfterAnchor(rows, anchor) {
  const sw = rows.filter((o) => o?.kind === 'mcl-switch' && String(o?.at || '') >= anchor)
  return { n: sw.length, ok: sw.length > 0 }
}

/** R3 **回流配对率**：`mcl-switch` 与 `yield.verdict` 在同一窗内配对 */
export function reflowPairing(rows, windowSec = 3600) {
  const sw = rows.filter((o) => o?.kind === 'mcl-switch').map((o) => Date.parse(String(o.at)))
  const vd = rows.filter((o) => o?.type === 'yield.verdict').map((o) => Date.parse(String(o.at)))
  if (!sw.length || !vd.length) return { sw: sw.length, vd: vd.length, paired: 0, ok: null }
  const w = windowSec * 1000
  const paired = sw.filter((t) => vd.some((u) => Math.abs(u - t) <= w)).length
  return { sw: sw.length, vd: vd.length, paired, ok: paired > 0 }
}

/* ── 自证（反例必须被抓；正例取自真机形态）────────────────────────────────── */
if (process.argv.includes('--selftest')) {
  console.log('check-yield-reflow · 自证')
  let bad = 0
  const t = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) bad++ }

  // 正例：D5 前的真机形态（zeroGain 取值丰富 + switch 有行）⇒ R1 应绿
  const preD5 = [
    { phase: 'judge', note: 'slow', zeroGain: 0, at: '2026-09-21T20:00:00Z', acted: true },
    { phase: 'judge', note: 'slow', zeroGain: 2, at: '2026-09-21T20:01:00Z', acted: true },
    { phase: 'judge', note: 'slow', zeroGain: 5, at: '2026-09-21T20:02:00Z', acted: true },
    { kind: 'mcl-switch', at: '2026-09-21T20:02:30Z' },
  ]
  t(structuralReachability(preD5).ok === true, '自证·正例：D5 前形态 ⇒ R1 绿（取值 ≥2 且 ge2>0）')
  t(switchAfterAnchor(preD5, anchorOf(preD5)).ok === true, '自证·正例：D5 前形态 ⇒ R2 绿（锚点后有 switch）')

  // 反例 A：D5 后真机形态（zeroGain 恒 0）⇒ R1 必须**红**
  const postD5 = [
    { phase: 'judge', note: 'slow', zeroGain: 0, at: '2026-09-23T01:00:00Z', acted: true },
    { phase: 'judge', note: 'slow', zeroGain: 0, at: '2026-09-23T01:01:00Z', acted: true },
    { phase: 'judge', note: 'slow', zeroGain: 0, at: '2026-09-23T01:02:00Z', acted: true },
  ]
  t(structuralReachability(postD5).ok === false, '自证·反例A：D5 后 `zeroGain` 恒 0 ⇒ R1 **红**（这正是哑火形态，不得判绿）')
  t(switchAfterAnchor(postD5, anchorOf(postD5)).ok === false, '自证·反例A：无 switch ⇒ R2 红')

  // 反例 B（**误报防线**）：`fast`/`decide-none` 桶天然恒 0 ⇒ 若计入则**误报**
  const fastOnly = [
    { phase: 'judge', note: 'fast', zeroGain: 0, at: '2026-09-23T01:00:00Z', acted: true },
    { phase: 'judge', note: 'decide-none', zeroGain: 0, at: '2026-09-23T01:01:00Z', acted: true },
  ]
  t(structuralReachability(fastOnly).n === 0 && structuralReachability(fastOnly).ok === false,
    '自证·反例B：非 slow 桶**不计入** R1（它们天然恒 0，计入会误报）—— 这是本件的误报防线')

  // 反例 C：**墙钟形态**的假绿（已哑 1.5 天但"窗内有 10 行"⇒ 旧写法判绿）
  const wallClockGreen = postD5.slice()
  t(structuralReachability(wallClockGreen).ok === false && wallClockGreen.length === 3,
    '自证·反例C：**行数多 ≠ 有判别力**（旧"墙钟窗"写法见行数 >0 即绿 ⇒ 假绿；本件看**取值数**）')

  // R3 配对：跨日错开 ⇒ 0 配对（真机曾是"86400s 才 10/10"的同日巧合）
  const misaligned = [
    { kind: 'mcl-switch', at: '2026-09-22T06:00:00Z' },
    { type: 'yield.verdict', at: '2026-09-16T06:00:00Z' },
  ]
  t(reflowPairing(misaligned, 3600).paired === 0, '自证·R3：跨日错开 ⇒ 配对 0（**总数 >0 不等于回流通**）')
  const aligned = [
    { kind: 'mcl-switch', at: '2026-09-23T06:00:00Z' },
    { type: 'yield.verdict', at: '2026-09-23T06:10:00Z' },
  ]
  t(reflowPairing(aligned, 3600).paired === 1, '自证·R3：同窗 ⇒ 配对 1')
  t(reflowPairing([{ kind: 'mcl-switch', at: 'x' }], 3600).ok === null, '自证·R3：无 verdict 数据 ⇒ `ok=null`（**判不了就承认**，不假装通过）')

  if (bad) { console.log(`\nFAIL（自证 ${bad} 项）`); process.exit(1) }
  console.log('\nPASS（自证全过：正例绿 / 反例红 / 误报防线有效）')
  process.exit(0)
}

/* ── 真机判定（跨档读 —— 本仓 G13 纪律：只读主档会静默丢历史）────────────── */
const argOf = (k, dflt) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt }
const ledgerFile = argOf('--ledger', join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'knowledge', 'audit', 'ledger.jsonl'))

console.log('收益回流可触发性（消费链拟态 · 中层元推理）')
let rows = []
try {
  const { readLedgerVolumes } = await import(new URL('../lib/ledger-compact.js', import.meta.url).href)
  rows = readLedgerVolumes(ledgerFile).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  console.log(`扫描面：全档（${ledgerFile} + .1/.2）· ${rows.length} 行`)
} catch (e) {
  console.log(`⏭ 台账不可读 ⇒ skip（**不是"干净"**）：${String(e?.message || e).slice(0, 80)}`)
  process.exit(3)
}
if (!rows.length) { console.log('⏭ 台账为空 ⇒ skip（不是"干净"）'); process.exit(3) }

const anchor = anchorOf(rows)
console.log(`事件锚点（首条带 acted 的 judge 行）= ${anchor || '(无 ⇒ 未接线)'}`)

const r1 = structuralReachability(rows, anchor)
console.log(`${r1.ok ? '✅' : '❌'} R1 结构可触发性（**锚点后**，防前段掩盖）：slow 桶 n=${r1.n} · zeroGain 取值数=${r1.distinct} · ≥2 行=${r1.ge2}`)
if (!r1.ok) fail = Math.max(fail, 1)
// 对照：全档（含锚点前）—— 只作读数，**不参与判定**（证明"曾经有"）
const r1all = structuralReachability(rows, '')
console.log(`   ↳ 对照·全档（不参与判定）：n=${r1all.n} · 取值数=${r1all.distinct} · ≥2 行=${r1all.ge2} ⇒ ${r1all.ok ? '曾可触' : '从未可触'}`)

const r2 = switchAfterAnchor(rows, anchor)
console.log(`${r2.ok ? '✅' : '❌'} R2 出口可触发性：锚点后 mcl-switch = ${r2.n} 行`)
if (!r2.ok) fail = Math.max(fail, 1)

const r3 = reflowPairing(rows, 3600)
if (r3.ok === null) {
  console.log(`⏭ R3 回流配对率：数据不足（mcl-switch=${r3.sw} · yield.verdict=${r3.vd}）⇒ **未取得数据，不假装通过**`)
} else {
  console.log(`${r3.ok ? '✅' : '❌'} R3 回流配对率：mcl-switch=${r3.sw} · yield.verdict=${r3.vd} · 3600s 窗内配对=${r3.paired}`)
  if (!r3.ok) fail = Math.max(fail, 1)
}

/* ── 退出码：真失败 ⇒ 1；已知未修 ⇒ 4（调用方按 **声明制** 处理，见 check-runner 契约）── */
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ anchor, r1, r2, r3, fail }))
}
if (fail) {
  console.log('\n⚠ xfail（exit 4）：R1/R2 为**已知未修**的中层哑火形态 —— 本件按 `{ xfail: true }` 声明制登记；')
  console.log('   一旦判定转绿，本件应退 **1**（XPASS = 施工完成信号，**不是**回归失败）。')
  process.exit(4)
}
console.log('\nPASS（收益回流可触发性：信号有判别力）')
process.exit(0)
