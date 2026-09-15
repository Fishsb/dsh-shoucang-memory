#!/usr/bin/env node
/**
 * mcl-calibrate.mjs — **MCL 快/慢通道阈值与标签门的离线标定**（2026-09-13）
 *
 * ## 为什么是"离线标定"而不是"每步交模型"
 * 快/慢通道判定在**热路径**（每一步 `agent/pre-step` 都要判）⇒ **不可能每步调模型**。
 * 按项目原则「哪个更合适用哪个」：这一步的**判定**必须廉价（向量/规则），
 * 而**口径的选择**应当由**数据**决定 —— 本器就是那个"用数据定口径"的地方。
 *
 * ## 判据（MCL 现行双门）
 * `fast`（快通道，零材料零往返）= `sim ≥ mclFamiliarThreshold` **且** top hit 带**高置信标签**
 * （注册表 `surface.mcl.gate`，现行 `[路径]`/`[原则]`）。两者都满足才不注入。
 *
 * ## 输出
 * ① `sim` 分位（看阈值落在真实分布的哪里）② `hit` 首标签分布 ③ **阈值 × 标签门 的门槛表**
 * （sim 过线数 / 其中快通道数 / **被标签门挡掉数**及其标签构成）——后者直接回答"瓶颈在哪"。
 *
 * 用法：node scripts/mcl-calibrate.mjs [--json] [--bank 忽略] [--top 5]
 * 退出码：0（有样本）· 3（无样本：诚实跳过）
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓根（用于读判据源 `skill/engine/criteria.json` 取预注册目标与当前值） */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const AS_JSON = argv.includes('--json')

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const auditDir = join(dshHome, 'suite', 'knowledge', 'audit')
const legacy = join(auditDir, 'mcl-audit.jsonl')
const ledger = join(auditDir, 'ledger.jsonl')
if (!existsSync(legacy) && !existsSync(ledger)) { console.log(`⏭ 无 MCL 审计源（${auditDir}）—— 无数据可标定`); process.exit(3) }

// **双源读**（与 mcl.ts / panel 同口径）：legacy 历史 ∪ 台账里的 `mcl*` 行
const rows = []
const readInto = (file, keep) => {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    try { const o = JSON.parse(line); if (keep(o)) rows.push(o) } catch { /* 坏行跳过 */ }
  }
}
readInto(legacy, () => true)
readInto(ledger, (o) => String(o?.type || '').startsWith('mcl'))
const steps = rows.filter((r) => r.kind === 'mcl-step' && typeof r.sim === 'number')
if (!steps.length) { console.log('⏭ 无 mcl-step 样本（阈值标定需要带 sim 的步级审计）'); process.exit(3) }

const HIGH = new Set(['路径', '原则']) // 与注册表 surface.mcl.gate 同口径（改这里前先改注册表）
const tagOf = (r) => { const m = String(r.hit || '').match(/^\[([^\]]+)\]/); return m ? m[1] : '(无/空)' }
const sims = steps.map((r) => r.sim).sort((a, b) => a - b)
const q = (p) => sims[Math.min(sims.length - 1, Math.floor(sims.length * p))]
const tally = (arr, f) => { const o = {}; for (const x of arr) { const k = f(x); o[k] = (o[k] || 0) + 1 } return o }

const tagAll = tally(steps, tagOf)
const noHit = steps.filter((r) => !String(r.hit || '').trim()).length
const table = [0.5, 0.55, 0.58, 0.6, 0.62, 0.65].map((T) => {
  const pass = steps.filter((r) => r.sim >= T)
  const fast = pass.filter((r) => HIGH.has(tagOf(r)))
  const blocked = pass.filter((r) => !HIGH.has(tagOf(r)))
  return { T, pass: pass.length, fast: fast.length, blocked: blocked.length, blockedBy: tally(blocked, tagOf) }
})

const out = {
  samples: steps.length, noHit, noHitRate: Number((noHit / steps.length).toFixed(3)),
  sim: { p50: q(0.5), p90: q(0.9), p99: q(0.99), max: sims[sims.length - 1] },
  tagAll, table,
}

/* ── **预注册判据**（OPEN-1 · 2026-09-15 补）─────────────────────────────
 * 出处：`skill/engine/criteria.json#surface.mcl.note`（2026-09-14 P7/D3 定的方法 + 目标覆盖率）。
 * ⚠ **目标值不得事后调整** —— 改了它就不再是"预注册"，而是把标尺往结论上凑。
 * 为什么要在本器里给"结论"：`mcl-calibrate` 原先只给数据不给定论（设计如此），
 *   但 OPEN-1 需要的正是「**当前值是否已最优**」这一句 —— 否则每次都要人肉比对 27.5%。
 *   ② 另补**真实可救回集**：`recallMissReasonOf` 里 `no-highconf`（召回层）判定**先于**阈值
 *   ⇒ **调阈值只能救 `below-threshold`**，对召回层零命中完全无效（避免"以为降阈值能救全部"）。 */
const TARGET = 0.275
const fine = []
for (let T = 0.46; T <= 0.621; T = +(T + 0.01).toFixed(2)) {
  const pass = steps.filter((r) => r.sim >= T).length
  fine.push({ T, pass, rate: Number((pass / steps.length).toFixed(4)) })
}
const best = fine.reduce((a, b) => (Math.abs(b.rate - TARGET) < Math.abs(a.rate - TARGET) ? b : a))
/** 当前生效值（scheduler.json 热覆盖优先，否则判据源默认） */
const cur = (() => {
  try {
    const s = JSON.parse(readFileSync(join(dshHome, 'suite', 'scheduler.json'), 'utf8')).mclFamiliarThreshold
    if (typeof s === 'number' && s > 0) return { v: s, from: 'scheduler.json（热覆盖）' }
  } catch { /* 无则不取 */ }
  try {
    const c = JSON.parse(readFileSync(join(ROOT, 'skill', 'engine', 'criteria.json'), 'utf8'))
    const v = c?.surface?.mcl?.familiarThreshold
    if (typeof v === 'number') return { v, from: 'criteria.json（判据源）' }
  } catch { /* 无则不取 */ }
  return { v: null, from: '(未取到)' }
})()
const bt = steps.filter((r) => r.missReason === 'below-threshold')
const noHigh = steps.filter((r) => r.missReason === 'no-highconf').length
const recover = {}
for (const T of [0.54, 0.53, 0.52, 0.51]) recover[T] = bt.filter((r) => r.sim >= T).length
const verdict = cur.v == null ? 'UNKNOWN' : (best.T === cur.v ? 'KEEP' : (best.T < cur.v ? 'LOWER' : 'RAISE'))
Object.assign(out, {
  target: TARGET, bestT: best.T, bestRate: best.rate, current: cur.v, currentFrom: cur.from, verdict,
  fine, recoverable: { belowThreshold: bt.length, noHighConf: noHigh, byT: recover },
})
if (AS_JSON) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

console.log(`MCL 通道标定（离线 · 数据源 legacy ∪ 台账 mcl*）`)
console.log(`  样本 ${out.samples} 步 · **hit 为空 ${noHit}（${(out.noHitRate * 100).toFixed(1)}%）**`)
console.log(`  sim 分位：p50=${q(0.5).toFixed(3)} p90=${q(0.9).toFixed(3)} p99=${q(0.99).toFixed(3)} max=${sims[sims.length - 1].toFixed(3)}`)
console.log(`  hit 首标签：${Object.entries(tagAll).map(([k, v]) => `${k}:${v}`).join(' ')}`)
console.log(`\n阈值 × 标签门（快通道 = sim ≥ T **且** hit 带 [${[...HIGH].join(']/[')}]）：`)
console.log('  T      sim 过线        其中快通道   被标签门挡掉   挡掉的标签构成')
for (const r of table) {
  console.log(`  ${r.T.toFixed(2)}   ${String(r.pass).padStart(4)} (${(r.pass / out.samples * 100).toFixed(1)}%)   ${String(r.fast).padStart(6)}   ${String(r.blocked).padStart(10)}   ${Object.entries(r.blockedBy).map(([k, v]) => `${k}:${v}`).join(' ')}`)
}
console.log(`\n读数提示（**本器只给数据，不替你定口径**）：`)
console.log(`  · 「被标签门挡掉」里 **(无/空) 占多数** ⇒ 那些步**根本没有召回命中**，与阈值/标签门无关；`)
console.log(`  · 真正的瓶颈若在"无命中"，**调阈值不会改善快通道率**，该查召回（词表/索引）；`)
console.log(`  · 若瓶颈在标签门（如 [flow] 被挡），那是**注册表 gate 口径**问题，改口径要同步改 surface.mcl.gate。`)

/* ── 预注册判据结论（见文件内 `TARGET` 注释）── */
console.log(`\n预注册判据（目标覆盖率 ${(TARGET * 100).toFixed(1)}% · 出处 criteria.json#surface.mcl.note）：`)
console.log(`  细扫最接近者：T=${best.T.toFixed(2)} ⇒ 过线率 ${(best.rate * 100).toFixed(1)}%（距目标 ${(Math.abs(best.rate - TARGET) * 100).toFixed(1)}pp）`)
console.log(`  当前值 ${cur.v ?? '—'}（${cur.from}）`)
console.log(`  🧭 结论：**${verdict === 'KEEP' ? '保持当前值' : verdict === 'LOWER' ? '应下调至 ' + best.T : verdict === 'RAISE' ? '应上调至 ' + best.T : '无法判定（未取到当前值）'}**`)
console.log(`  真实可救回集：\`below-threshold\` **${bt.length}** 条（可救）· \`no-highconf\` **${noHigh}** 条（**阈值动不了** ⇒ 属召回层）`)
console.log(`    降阈值代价：${[0.54, 0.53, 0.52, 0.51].map((T) => `t=${T}⇒救回 ${recover[T]}/${bt.length} 且总过线率 ${(fine.find((f) => f.T === T)?.rate * 100).toFixed(1)}%${(fine.find((f) => f.T === T)?.rate ?? 0) > TARGET + 0.05 ? '⚠过冲' : ''}`).join(' · ')}`)
