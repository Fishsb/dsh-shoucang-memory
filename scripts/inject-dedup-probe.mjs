#!/usr/bin/env node
// inject-dedup-probe.mjs — **注入侧消重的真机探针**（S-P4e · 2026-09-16 · 报告态，不入 CHECKS）
//
// 为什么需要它：`crossform-dedup` 接在**宿主注入回调**（`systemPrompt.context`）上，那条回调的结果
//   **不落在任何可读文件里** ⇒ 外部无法直接观测。但仓内有一个**等价基线**：
//   `GET /inject/preview` 直接调 `d.hot.build(q)`（**未过滤**）⇒ 它就是"**若不去重会注入什么**"。
//   ⇒ 本探针把三者摆到一起对照：**去重前（preview）× skip 集 × 去重后（filterInjectedText）**。
//
// 判据（OPEN-ITEMS S-P4e 四条的真实机版本）：
//   ① **不重复注入**：skip 里的行**确实出现在** preview 里（否则"去重"是空转），且过滤后消失
//   ② **库文件 sha 不变**：跑前跑后对 `AGENT.md`/`USER.md` 取 sha256，必须相等（本件纯读）
//   ③ **误判可解释**：逐条打印「被跳过行 ← 覆盖它的粗行（相似度）」
//   ④ **关闭即逐字节回基线**：`filterInjectedText(preview, [])` === preview（Buffer 级）
//
// 用法: node scripts/inject-dedup-probe.mjs [--port 3080] [--bank <根>]
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { crossFormCovered, filterInjectedText, embedCfgFromSuite } from '../lib/crossform-dedup.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const port = argOf('--port', '3080')
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const sha = (p) => { try { return createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16) } catch { return '(缺)' } }
const FILES = ['AGENT.md', 'USER.md']

const before = Object.fromEntries(FILES.map((f) => [f, sha(join(bank, f))]))

console.log('S-P4e 注入侧消重 · 真机探针（报告态）')
console.log(`bank = ${bank}`)
console.log(`库文件 sha（前）：${FILES.map((f) => `${f}=${before[f]}`).join(' · ')}`)

// —— 取真机注入基线（未过滤）——
let preview = ''
let note = ''
try {
  const r = await fetch(`http://127.0.0.1:${port}/api/shoucang-panel/inject/preview`, { method: 'GET' })
  const j = await r.json()
  preview = String(j?.text || '')
  note = `HTTP ${r.status} · ${preview.length} 字符`
} catch (e) { note = '预览路由不可达：' + String(e?.message || e).slice(0, 80) }
console.log(`\n注入基线（去重前）：${note}`)

// —— 算 skip 集（真库 + 真向量配置）——
const cfg = embedCfgFromSuite()
console.log(`向量配置：enabled=${cfg.enabled} model=${cfg.model || '(空)'}`)
const dedup = await crossFormCovered(bank, cfg)
console.log(`\n去重判定：${dedup.note}`)
console.log(`  判定面：粗 ${dedup.stat.coarse} 行 · 细 ${dedup.stat.fine} 行 · 已嵌入 ${dedup.stat.embedded}`)

let verdict = 0
const chk = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) verdict = 1 }

// ② 库 sha 不变（纯读）
const after = Object.fromEntries(FILES.map((f) => [f, sha(join(bank, f))]))
chk(FILES.every((f) => before[f] === after[f]), `② **库文件 sha 未变**（${FILES.map((f) => after[f]).join(' · ')}）`)

// ④ 关闭即回基线
if (preview) {
  const off = filterInjectedText(preview, [])
  chk(off === preview && Buffer.from(off, 'utf8').equals(Buffer.from(preview, 'utf8')),
    '④ **关闭（skip 空）⇒ 逐字节回基线**（Buffer 级相等）')
}

/* ① **消重已在装配内部生效**（IR1 册五 E5 · 2026-09-18 判据改写）。
 *   旧状（S-P4e 首测）：消重接在**注入文本后过滤**（预算结算**之后**）⇒ skip 行**在**基线里，
 *     过滤后才消失，而腾出的额度**没人用**（实测省 0 字符/0 行）——那时判据是"skip 行在基线里"。
 *   现态：消重进了 `panel-shared#readCarrier` 的**配额结算之前** ⇒ skip 行**根本不出现在**注入面，
 *     槽位由**别的叙事行**接手 ⇒ 判据必须反过来：**skip 行不在基线里** 且 **画像配额仍被填满**。
 *   ⚠ 这正是"判据随口径更新"的实例：旧判据在新态下恒红，而它红得**没有信息量**（不是回归）。 */
if (preview && dedup.skip.length) {
  const fineAll = []
  for (const f of FILES) {
    try {
      for (const raw of readFileSync(join(bank, f), 'utf8').split(/\r?\n/)) {
        const l = raw.trim()
        if (l && /^\s*-\s/.test(l) && !/\[[^\]\s]{1,8}\]/.test(l)) fineAll.push(l)
      }
    } catch { /* 缺文件 */ }
  }
  const fineInPreview = fineAll.filter((l) => preview.includes(l))
  console.log(`\n🔎 **前提事实**：库内无标签叙事行 ${fineAll.length} 条 ⇒ 其中**真进了注入面**的 ${fineInPreview.length} 条`)
  const inPreview = dedup.skip.filter((s) => preview.includes(s))
  const profRows = preview.split('\n').filter((l) => /^-\s/.test(l) && /←\s*源:/.test(l))
  console.log(`\n① 消重位置：skip ${dedup.skip.length} 条 ⇒ 注入面里仍有 ${inPreview.length} 条（E5 后应为 **0**）`)
  console.log(`   画像行 ${profRows.length} 条（配额结算后仍被填满 ⇒ 省下的额度确实被别的叙事行用上）`)
  chk(inPreview.length === 0, `① **skip 行不在注入面**（${inPreview.length}/${dedup.skip.length} 条仍在 —— 消重在**配额之前**生效，E5）`)
  chk(profRows.length >= 6, `①′ **额度被用上**：画像行 ${profRows.length} 条 ≥ 6（旧状＝事后过滤 ⇒ 槽位空置、省 0 行）`)
  // ③ 可解释
  console.log('\n③ 逐条理由（被跳过 ← 覆盖它的粗行 · 相似度）：')
  for (const r of dedup.reasons.slice(0, 6)) console.log(`   · ${r.line.slice(0, 40)}…\n     ← ${r.by.slice(0, 52)}… ⟨${r.sim}⟩`)
  chk(dedup.reasons.every((r) => r.by && Number.isFinite(r.sim)), '③ 每条 skip 都带 `by` 与 `sim`（可解释）')
} else if (!dedup.skip.length) {
  console.log('\n① 本轮 skip 为空 —— 无重复可去（**合法结果**：说明当前阈值下无"粗行已涵盖"的细行）')
} else {
  console.log('\n① 预览不可达 ⇒ 无法核"skip 行是否已不在注入面"（**如实记：未判**）')
}

console.log(verdict ? '\nFAIL（见上）' : '\nPASS（真机四条：重复不入注入面 · 额度被用上 · 可解释 · 关闭即回基线）')
process.exit(verdict)
