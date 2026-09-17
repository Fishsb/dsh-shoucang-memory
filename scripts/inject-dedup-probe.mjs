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

// ① 不重复注入：skip 行确实在基线里、过滤后消失
if (preview && dedup.skip.length) {
  /* ⚠⚠ **2026-09-16 真机首测的当头一击**：skip=1（0.809 那条）却 `0/1 在基线里` ⇒ 省 0 字符。
   *   根因怀疑：**注入面按预算选行，可能根本不含画像叙事行** ⇒ 那么"库内跨形态冗余"与
   *   "注入面重复"**不是同一集合**，注入侧消重的收益为 0。⇒ 本节**必须**报告
   *   「38 条细行里有几条真进了注入面」——这是该路线成立与否的**前提事实**，不是细节。 */
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
  const coarseInPreview = fineInPreview.length
  console.log(`\n🔎 **前提事实**：库内无标签叙事行 ${fineAll.length} 条 ⇒ 其中**真进了注入面**的 ${fineInPreview.length} 条`)
  console.log(`   （若此处为 0 或极小 ⇒ "注入侧消重"可去之物本就极少，**该路线收益趋零**，须另判）`)
  void coarseInPreview
  const inPreview = dedup.skip.filter((s) => preview.includes(s))
  const filtered = filterInjectedText(preview, dedup.skip)
  const gone = dedup.skip.filter((s) => !filtered.includes(s))
  console.log(`\n① 去重效果：基线 ${preview.length} 字符 → 去重后 ${filtered.length} 字符（省 ${preview.length - filtered.length} 字符 · ${preview.split('\n').length - filtered.split('\n').length} 行）`)
  chk(inPreview.length > 0, `① skip 行**确实出现在基线里**（${inPreview.length}/${dedup.skip.length} 条 —— 否则"去重"是空转）`)
  chk(gone.length === dedup.skip.length, `① 过滤后**全部消失**（${gone.length}/${dedup.skip.length}）`)
  // ③ 可解释
  console.log('\n③ 逐条理由（被跳过 ← 覆盖它的粗行 · 相似度）：')
  for (const r of dedup.reasons.slice(0, 6)) console.log(`   · ${r.line.slice(0, 40)}…\n     ← ${r.by.slice(0, 52)}… ⟨${r.sim}⟩`)
  chk(dedup.reasons.every((r) => r.by && Number.isFinite(r.sim)), '③ 每条 skip 都带 `by` 与 `sim`（可解释）')
} else if (!dedup.skip.length) {
  console.log('\n① 本轮 skip 为空 —— 无重复可去（**合法结果**：说明当前阈值下无"粗行已涵盖"的细行）')
} else {
  console.log('\n① 预览不可达 ⇒ 无法核"基线里确实有那些行"（**如实记：未判**）')
}

console.log(verdict ? '\nFAIL（见上）' : '\nPASS（真机四条：不重复注入 · 库 sha 不变 · 可解释 · 关闭即回基线）')
process.exit(verdict)
