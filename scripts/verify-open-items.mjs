#!/usr/bin/env node
// verify-open-items.mjs — `docs/OPEN-ITEMS.md` 三项的**判据机检**（2026-09-15 立 · 报告态）
//
// **为什么单独立件**：三项都写着"何时可做 / 复验命令"，但**判据分散**（一个要跑 recall-diagnose、
//   一个要翻审计的 replayHits、一个要算材料 counts）⇒ 复检成本高 ⇒ 实际没人复检（本次实测发现
//   OPEN-1 的阻塞条件早已满足却仍挂在表里）。本件把三条判据收敛成**一次运行**。
//
// **三项判据**（逐条来自 `OPEN-ITEMS.md`，不得在此处改口径）：
//   OPEN-1：样本 ≥30 ⇒ `advice` 落 fix-recall/lower-threshold/enable-embed；**且**按预注册判据
//           （目标覆盖率 27.5%）的细校准结论（`mcl-calibrate.mjs`）。
//   OPEN-2：**≥1 条原则的 `← 源:` 落在 `replayHits` 候选内**（候选 = `gatherMaterials().replayRecent`）。
//   OPEN-3：`forgetCandidates > 0` ⇒ 应见 `forgetArchived`/`forgetKept` 消费；`= 0` ⇒ **正确期望**（非故障）。
//
// 退出码恒 0（报告态；同 `recall-diagnose` / `criteria-report` —— **不入 CHECKS**）。
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const AUD = join(HOME, 'suite', 'knowledge', 'audit')
const BANK = process.env.MEMORY_ROOT || join(HOME, 'skills', 'managing-memory')
const rd = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)
  .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : [])
/* ⚠ **跨档读（G13 轮转失明 · 2026-09-20 修）**：OPEN-3 的判据是"审计轮次里有几轮 cand>0 / 见到消费"，
 *   而 deep-sleep 行**全在旧卷**（实测：主档 0 行 / 跨档 **49** 行）⇒ 该判据原读到的 `withF.length` 恒 0
 *   ⇒ 报「条件未到/未满足」。现改走唯一实现 `readLedgerVolumes`。
 *   判据：`scripts/check-ledger-read.mjs`（脚本面 known-broken 名单）——**修完须从该名单删**。 */
const { readLedgerVolumes } = await import(new URL('../lib/ledger-compact.js', import.meta.url).href)
const rdLedgerAll = () => readLedgerVolumes(join(AUD, 'ledger.jsonl'))
  .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
const rows = []

/* ── OPEN-1：样本量 + coarse advice + 细校准结论 ── */
let o1 = { ok: false, note: '未能取值' }
try {
  const out = execFileSync(process.execPath, [join(root, 'scripts', 'recall-diagnose.mjs')], { encoding: 'utf8', cwd: root })
  const m = /可归因（带 missReason[^=]*=\s*(\d+)/.exec(out)
  const adv = /调参建议[^\n]*?\*\*([a-z-]+)\*\*/.exec(out) || /→\s*(fix-recall|lower-threshold|enable-embed|insufficient-data)/.exec(out)
  const n = m ? Number(m[1]) : 0
  const advice = adv ? adv[1] : '(未取到)'
  /* 细校准：**复用既有 `mcl-calibrate.mjs`**（不要另建 —— 它已含"阈值 × 标签门"维度，见 AGENTS 规则 5） */
  const calib = JSON.parse(execFileSync(process.execPath, [join(root, 'scripts', 'mcl-calibrate.mjs'), '--json'], { encoding: 'utf8', cwd: root }))
  const RECHECK_N = 300
  o1 = {
    ok: n >= 30 && ['fix-recall', 'lower-threshold', 'enable-embed'].includes(advice),
    note: `样本 ${n}（≥30 ${n >= 30 ? '✅' : '❌'}）· coarse advice=${advice} · 细校准结论=**${calib.verdict}** ` +
      `（最优 t=${calib.bestT} 过线率 ${(calib.bestRate * 100).toFixed(1)}% vs 预注册目标 ${(calib.target * 100).toFixed(1)}%）· 现值 ${calib.current}` +
      ` · 真实可救回：below-threshold ${calib.recoverable.belowThreshold} / 不可救(召回层) ${calib.recoverable.noHighConf}`,
    recheck: `近期带 missReason 样本 N≥${RECHECK_N}（现 ${n}${n >= RECHECK_N ? ' ⇒ 已到' : ''}）· 命令 node scripts/mcl-calibrate.mjs`,
  }
} catch (e) { o1.note = '取值失败：' + String(e.message).slice(0, 80) }
rows.push(['OPEN-1', o1])

/* ── OPEN-2：原则 `← 源:` ∩ replay 候选 ── */
let o2 = { ok: false, note: '未能取值' }
try {
  const mats = await import('file:///' + join(root, 'lib', 'deepsleep-materials.js').replace(/\\/g, '/'))
  const M = mats.gatherMaterials(BANK)
  const candKeys = new Set(M.replayRecent.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { const m = /^([^\s（(]+\.md)\s*§\s*([^（(]+)/.exec(l); return m ? `${m[1]} §${m[2].trim()}` : null }).filter(Boolean))
  const agent = existsSync(join(BANK, 'AGENT.md')) ? readFileSync(join(BANK, 'AGENT.md'), 'utf8').split('\n') : []
  let hits = 0
  const named = new Set()
  for (const l of agent) {
    if (!/←\s*源:/.test(l)) continue
    const after = l.split(/←\s*源:/)[1] || ''
    const fm = /notes\/([A-Za-z0-9_.-]+\.md)/.exec(after)
    if (!fm) continue
    for (const s of [...after.matchAll(/§([^/／\s)）]+)/g)].map((x) => x[1].trim())) {
      const k = `${fm[1]} §${s}`
      if (candKeys.has(k)) { hits++; named.add(k) }
    }
  }
  o2 = {
    ok: hits >= 1,
    note: `replay 候选 ${candKeys.size} 条（counts.replay=${M.counts.replay}）· 原则源命中 **${hits}** 处（需 ≥1）· 被消费候选 ${named.size}/${candKeys.size}`,
    recheck: '每轮深睡后自动可复检（本件只读，不触发深睡）',
  }
} catch (e) { o2.note = '取值失败：' + String(e.message).slice(0, 80) }
rows.push(['OPEN-2', o2])

/* ── OPEN-3：forget 候选与消费 ── */
let o3 = { ok: false, note: '未能取值' }
try {
  const mats = await import('file:///' + join(root, 'lib', 'deepsleep-materials.js').replace(/\\/g, '/'))
  const M = mats.gatherMaterials(BANK)
  const rounds = rdLedgerAll().filter((o) => o.kind === 'deep-sleep')
  const withF = rounds.filter((r) => typeof r.forgetCandidates === 'number')
  const consumed = withF.filter((r) => (r.forgetKept || 0) + (r.forgetArchived || 0) > 0)
  const nonzero = withF.filter((r) => r.forgetCandidates > 0)
  /* 判据：cand>0 ⇒ 必须见消费；cand=0 ⇒ 正确期望（算通过，但注明"空非故障"） */
  const ok = nonzero.length === 0 ? withF.length > 0 : consumed.length > 0
  o3 = {
    ok,
    note: `当前材料 counts.forget=${M.counts.forget} · 审计轮次 ${withF.length}（cand>0 的 ${nonzero.length} 轮）· ` +
      `消费轮次 ${consumed.length}` + (nonzero.length ? ` · 最近一轮 cand=${nonzero[nonzero.length - 1].forgetCandidates} kept=${nonzero[nonzero.length - 1].forgetKept} arch=${nonzero[nonzero.length - 1].forgetArchived}` : ' ⇒ **cand 恒 0 = 正确期望（库龄不足），非故障**'),
    recheck: nonzero.length ? '已见非零候选 ⇒ 库龄门已过，此后每轮都应见消费额' : '库龄窗口到期（约 2026-12）后复检',
  }
} catch (e) { o3.note = '取值失败：' + String(e.message).slice(0, 80) }
rows.push(['OPEN-3', o3])

console.log('OPEN-ITEMS 判据机检（报告态 · 不改库不改配置）')
for (const [id, r] of rows) {
  console.log(`\n  ${r.ok ? '✅' : '⏳'} ${id} ${r.ok ? '判据满足' : '条件未到/未满足'}`)
  console.log(`     ${r.note}`)
  console.log(`     复检：${r.recheck}`)
}
console.log(`\n  合计：${rows.filter(([, r]) => r.ok).length}/${rows.length} 项判据满足`)
process.exit(0)
