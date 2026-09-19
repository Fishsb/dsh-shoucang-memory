#!/usr/bin/env node
// check-ledger-volume-read.mjs — **台账必须跨档读**（G13「轮转失明」防第 N 次漏网 · 2026-09-20）
//
// ── 判因（真机实测，会掩盖其他问题的那一类）────────────────────────────────
// 台账 `audit/ledger.jsonl` 按大小**轮转**（`ledger-compact#rotateBySize`，保留 3 档）⇒
//   历史行会被搬进 `.1` / `.2` / `.3`。**只读主档 = 静默丢历史**，而且**不报错**。
//
// 已修过的三处（各自独立发现、各写各的注释）：
//   · `pointer-deficits`（真机先红：读数 0，旧卷实有 33 行）
//   · `deepsleep-run`（归因取样同因）
//   · `check-claim-alignment`（换用 `readLedgerVolumes`）
// ⇒ **本仓当时没有一道门问"还有谁在读单档"** —— 于是漏网继续存在。
//
// 2026-09-20 实测（本轮）：又抓到 **6 处**，失真幅度远超预期：
//   | 器 | 单档读 | 跨档真值 | 失真 |
//   |---|---|---|---|
//   | `yield-signal-probe` | compliance 行 635 | **4653** | **漏 87%** |
//   | 同上 | `switchSource=true` 622 | **4397** | 恒真率 98.0% → **94.5%**（跨档**更低** ⇒ 病更重） |
//   | `essence-review-stability` | deep-sleep 行 0 | **49** | **全丢** |
//   | `verify-open-items`（OPEN-3） | deep-sleep 行 0 | **49** | **全丢** |
//   | `epoch-calibrate` | 纪元 0 | **46 个不同纪元** | **全丢**（结论"纪元不足 ⇒ 维持关闭"**一直是错的**） |
//   | `criteria-report` / `criteria-audit` / `memory-reconcile` | — | — | 判据台账/write 回执历史丢 |
//   ⇒ `epoch-calibrate` 最严重：两条阈值（`trigger.contentMinChars` / `trigger.materialChunkChars`）
//     的**复检触发条件就挂在它身上** ⇒ 该结论错 ⇒ 两条阈值的"何时可校准"判断也错。
//
// ── 本件做什么 ────────────────────────────────────────────────────────────
// 把「**读台账必须跨档**」写成**可机检的正面断言**：
//   ① **源码面**（`src/*.ts`）：读了台账却没走 `ledger-compact#readLedgerVolumes` ⇒ **红**。
//   ② **脚本面**（`scripts/*.mjs`）：**报告态**——如实列出，含 `known-broken`（已知欠账）计数。
//   ③ **自证**（`--selftest`）：10 条样例**全部取自真机原文**（见下方 methodology 记档）。
//
// ── 为什么脚本面是报告态（不是放水，是判据本身如此）────────────────────────
// `scripts/` 里有两类**合法**单档读：
//   · **夹具/测试件**（`test-*.mjs`）：自造临时台账，无轮转、无历史可丢；
//   · **写侧件**（`sleep-selfcheck.mjs` 覆盖写主档等）：不是"读数"，是"落数"。
// ⇒ 判据只能判"**读数类**"；而"是不是读数类"**机器判不了**（要看用途，不看写法）。
//   ⇒ 脚本面**如实列出**、由人眼判；**本件不替人做那个判断**（宁可全列，不可误伤）。
//
// 用法: node scripts/check-ledger-volume-read.mjs [--selftest]
// 退出码：0 = 源码面全过 · 1 = 源码面有单档读（或自证失败）
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 合法脚本面单档读（须写明理由；`✅ 已修` = **本轮修毕留档，下一轮删**） */
const EXEMPT_SCRIPTS = new Map([
  ['scripts/sleep-selfcheck.mjs', '**写侧**：`writeFileSync` 覆盖写主档（不是读数）'],
  ['scripts/check-observability.mjs', '**流注册表**：把 `ledger.jsonl` 当"流名"登记与形态统计（不按 kind 读业务行）'],
  ['scripts/redact-secret.mjs', '**写侧/遮蔽侧**：按行改写台账文件本身'],
  ['scripts/scan-secrets.mjs', '**扫描件**：逐文件扫密钥，语义即"扫这个文件"'],
  ['scripts/harvest-access.mjs', '**采集器**：台账为路径常量；读转录另走库侧流水'],
  ['scripts/test-mcl.mjs', '夹具（自造临时台账）'],
  ['scripts/test-sleep-report.mjs', '夹具（自造临时台账）'],
  ['scripts/test-ledger-compact.mjs', '夹具（自造临时台账）'],
  ['scripts/test-ledger-rotation.mjs', '夹具（自造临时台账；本件的跨档读行为测试）'],
  ['scripts/test-distill-manifest.mjs', '夹具（自造临时台账）'],
  ['scripts/test-event-envelope.mjs', '夹具（自造临时台账）'],
  ['scripts/check-layer-handoff.mjs', '夹具（自造临时台账）'],
  ['scripts/test-session-review.mjs', '夹具（自造临时台账）'],
  ['scripts/test-secret-redact.mjs', '夹具（自造临时台账）'],
  ['scripts/ui-geo-regress.mjs', '夹具（模拟端点返回）'],
  ['scripts/check-deferred-queue.mjs', '夹具（自造临时台账 + **显式断言旧卷必须被读到** —— 本件就是跨档读的判据本体）'],
  ['scripts/check-ledger-volume-read.mjs', '**本件自身**（旧名残留）：自证样例含单档读写法（文本夹具）'],
  ['scripts/check-ledger-read.mjs', '**本件自身**：自证样例含单档读写法（文本夹具，不读真台账）'],
  // ── ✅ 本轮已修（留档对照，**下一轮从本表删**）──
  ['scripts/epoch-calibrate.mjs', '✅ 已修（readLedgerVolumes）：纪元 0 → **46**'],
  ['scripts/mcl-calibrate.mjs', '✅ 已修：mcl-step 单档 964 → 跨档 **9115**（漏 89%）'],
  ['scripts/mcl-compliance.mjs', '✅ 已修：判定样本补齐（回引率分母）'],
  ['scripts/recall-diagnose.mjs', '✅ 已修：可归因样本 → **4113**'],
  ['scripts/essence-review-stability.mjs', '✅ 已修：deep-sleep 行 0 → **49**；`--jaccard` 1 对 → **4 对**'],
  ['scripts/verify-open-items.mjs', '✅ 已修：OPEN-3 审计轮次 0 → **49**'],
  ['scripts/yield-signal-probe.mjs', '✅ 已修：compliance 行 635 → **4666**（漏 87%）'],
  ['scripts/criteria-audit.mjs', '✅ 已修：台账样本 → **915 行**（30 天窗）'],
  ['scripts/criteria-report.mjs', '✅ 已修：分母 4270 → **26624 行**'],
  ['scripts/memory-reconcile.mjs', '✅ 已修：台账 4270 → **26624 行**；并暴露「MEMORY.md 未解释 499 行」差异'],
])

/** **源码面例外**（须写明理由；只有"台账字面量与他处读取器同处一文件、但**不读台账**"才算）。
 *  ⚠ 这是本判据**已知的多报**（v6 用"共现"换可靠性 ⇒ 必然多报）——**如实登记，不当豁免**：
 *    注册在此只表示"人眼已核过：此处不读台账"，**不表示判据对它失效**。
 *    一旦该文件**真的**开始读台账，须把它从本表删、并改成跨档读。 */
const SRC_EXEMPT = new Map([
  ['src/scheduler.ts', '**误报**：4 处 `ledger.jsonl` 全在 zod `.description()` 文案里（"写**统一台账**…"）；本文件用 `readFileSync` 读的是 config/AGENT 文本，**不读台账**'],
  ['src/vec.ts', '**误报**：`ledger.jsonl` 只出现在 `appendFileSync`（**写侧**，影子打分落账）与注释；`readFileSync` 读的是 `activity.jsonl` 与向量缓存，**不读台账**'],
])

/** 从源码里剥注释（仓内既有先例：`check-carriers` / `check-observability` 的「先剥注释再匹配」） */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** **按行读取器**名单：接收"路径"并逐行解析者。新增读取器须登记于此。 */
const READERS = ['readFileSync', 'parseRows', 'readJsonl', 'readLines', 'tailLines', 'readTailLines']

/** 判断一段源码**是否读了台账**（即需要跨档读）。
 *
 * ── 判据设计（v6 · 最终版；**前五版全部作废**，理由必读）──────────────────
 * v1–v5 我都试图**用正则解析代码结构**（追踪"路径变量 → 读取器 → split 链"），五版全错，
 *   每版都呈现**判据不对称**：真机形态判红、我自造的反例判绿。
 *   **根因不是正则写法，是方向错了**：代码结构（尤其"路径绑定 ↔ 读取消费"的对应关系）
 *   **不可靠地用正则解析** —— 真机里两者可以跨行、跨函数、甚至跨文件。
 *
 * ⇒ v6 改为**不看结构、只看共现**（保守但可靠）：
 *     文件含 `ledger.jsonl` 字面量 **且** 含任一按行读取器 **且** 不含 `readLedgerVolumes`
 *     ⇒ 判"读了台账但没走跨档口" ⇒ 红（脚本面另见 `EXEMPT_SCRIPTS`）。
 *
 * **为什么不会误伤**（`--selftest` 的 5 条正例全部取自真机原文）：
 *   · 只写不读（`writeFileSync`）⇒ 无读取器；
 *   · 只当"流名"登记（`push('ledger.jsonl', …)`）⇒ 无读取器；
 *   · 只是路径常量（`const x = join(…,'ledger.jsonl')`）⇒ 无读取器；
 *   · 已走跨档口（`readLedgerVolumes`）⇒ 前置返回 false；夹具 ⇒ 显式登记。
 * **为什么这条会多报**（如实声明）：文件里"一处读台账、另一处读别的 jsonl"时会整体判红。
 *   ⇒ 这是**有意的保守**：多报交人眼（脚本面本就报告态），**漏报才是致命的**（漏报 = 缺陷静默存活）。
 *
 * ⚠ 已知**不可判**：路径经跨文件多层封装传入（A 收路径 → 传 B → B 读）。此类只能靠人眼。
 *
 * ⚠ **methodology 记档**（连错五版换来的）：本仓已登记纪律 `notes/lessons.md §诊断方法论`
 *   ——「**写判据前先 dump 原文样例核形态**」（同族教训已记 3 次）。我在 v1–v5 **持续自造合成样例**
 *   去试正则，测的是"我以为的写法"而非"真实写法"，故五版全废。
 *   **v6 的 10 条自证样例全部取自真机原文并标出处。** */
function readsLedgerSingleVolume(body) {
  const src = String(body)
  if (!/ledger\.jsonl/.test(src)) return false
  if (/readLedgerVolumes/.test(src)) return false
  const rdRe = new RegExp(`\\b(?:${READERS.join('|')})\\s*\\(`)
  return rdRe.test(src)
}

/* ── `--selftest`：反例自证（样例**全部取自真机原文**）───────────────────── */
if (process.argv.includes('--selftest')) {
  const cases = [
    ['正例·跨档读（src/panel-observe.ts:16 真形态）',
      `import { readLedgerVolumes } from './ledger-compact.js'\nconst rows = readLedgerVolumes(file)`, false],
    ['正例·只是路径常量（scripts/recall-diagnose.mjs:24 真形态）',
      `const BANK = process.env.MEMORY_ROOT || join(HOME, 'skills', 'managing-memory')`, false],
    ['正例·写侧（scripts/sleep-selfcheck.mjs:117 真形态）',
      `const ledgerFile = join(stateRoot, 'audit', 'ledger.jsonl')\nwriteFileSync(ledgerFile, JSON.stringify(o) + '\\n')`, false],
    ['正例·含跨档口 + 台账路径（scripts/test-ledger-rotation.mjs:21/28 真形态）',
      `import { LEDGER_VOLUMES, readLedgerVolumes, rotateBySize } from '../lib/ledger-compact.js'\nconst file = join(dir, 'ledger.jsonl')\nconst all = readLedgerVolumes(file)`, false],
    ['正例·仅注册为"流名"（scripts/check-observability.mjs:185 对面真形态）',
      `push('ledger.jsonl', (o) => String(o?.type || '').startsWith('mcl'))`, false],
    ['**反例**·真机形态（scripts/yield-signal-probe.mjs:21/25 原文）',
      `const ledger = argOf('--ledger', join(homedir(), '.dsh', 'suite', 'knowledge', 'audit', 'ledger.jsonl'))\nconst rows = []\nfor (const l of readFileSync(ledger, 'utf8').split(/\\r?\\n/)) { rows.push(JSON.parse(l)) }`, true],
    ['**反例**·链式 split（scripts/epoch-calibrate.mjs **修前**原文）',
      `const ledger = join(homedir(), '.dsh', 'suite', 'knowledge', 'audit', 'ledger.jsonl')\nconst rows = []\nfor (const l of readFileSync(ledger, 'utf8').split(/\\r?\\n/)) { const t = l.trim(); rows.push(t) }`, true],
    ['**反例**·结果绑变量后 split（src/panel-arch.ts:65 原文）',
      `const path = join(auditDir(), 'ledger.jsonl')\nconst byType = new Map()\ntry {\n  for (const l of readFileSync(path, 'utf8').split('\\n')) {\n    if (!l.trim()) continue\n  }\n} catch {}`, true],
    ['**反例**·逐行读取器（src/sleep-report.ts:264 原文）',
      `const rows = parseRows(join(d.kRoot, 'audit', 'ledger.jsonl'), 4000)`, true],
    ['**反例**·辅助函数间接读（scripts/criteria-audit.mjs:24/29 原文）',
      `const readJsonl = (p) => readFileSync(p, 'utf8').split(/\\r?\\n/).filter(Boolean)\nconst ledgerPath = join(stateRoot, 'audit', 'ledger.jsonl')\nconst ledger = readJsonl(ledgerPath).filter((r) => r.at)`, true],
  ]
  let bad = 0
  for (const [label, src, want] of cases) {
    const got = readsLedgerSingleVolume(strip(src))
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判${got ? '红' : '绿'}（期望${want ? '红' : '绿'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  const poss = cases.filter(([l]) => !l.includes('反例'))
  if (!negs.length || !poss.length) { bad++; console.log('❌ 自证必须同时含正例与反例 —— 缺任一即为无判别力') }
  console.log(bad ? `\nFAIL（${bad} 例）` : `\nPASS（台账跨档读判据自证可用：${cases.length} 例 = 正例 ${poss.length} + **反例 ${negs.length}**，全部取自真机原文）`)
  process.exit(bad ? 1 : 0)
}

/* ── ① 源码面（**硬门**）────────────────────────────────────────────────── */
console.log('台账跨档读（G13 轮转失明 · 防第 N 次漏网）')
const SRC = join(root, 'src')
const srcFiles = existsSync(SRC) ? readdirSync(SRC).filter((f) => f.endsWith('.ts')) : []
const srcBad = []
const srcExemptHit = []
for (const f of srcFiles) {
  let body = ''
  try { body = strip(readFileSync(join(SRC, f), 'utf8')) } catch { fail++; console.log(`  ❌ 读不到 src/${f} —— 读失败不得静默当作"合规"`); continue }
  if (!readsLedgerSingleVolume(body)) continue
  if (SRC_EXEMPT.has(`src/${f}`)) { srcExemptHit.push(`src/${f}`); continue }
  srcBad.push(`src/${f}`)
}
ok(srcBad.length === 0,
  `① 源码面：读台账者**一律经 readLedgerVolumes**（唯一实现）${srcBad.length ? ` —— 违规：${srcBad.join(', ')}` : ` · 扫描 ${srcFiles.length} 件 · 已核例外 ${srcExemptHit.length} 件`}`)
for (const p of srcExemptHit) console.log(`   · 已核例外（**人眼确认不读台账**，非豁免）：${p} —— ${SRC_EXEMPT.get(p)}`)

/* ── ② 脚本面（**报告态**）──────────────────────────────────────────────── */
const SCRIPTS = join(root, 'scripts')
const scriptFiles = existsSync(SCRIPTS) ? readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs')) : []
const scriptSingle = []
for (const f of scriptFiles) {
  let body = ''
  try { body = strip(readFileSync(join(SCRIPTS, f), 'utf8')) } catch { continue }
  if (readsLedgerSingleVolume(body)) scriptSingle.push(`scripts/${f}`)
}
const unlisted = scriptSingle.filter((p) => !EXEMPT_SCRIPTS.has(p))
const knownBroken = scriptSingle.filter((p) => String(EXEMPT_SCRIPTS.get(p) || '').startsWith('known-broken'))
const fixed = scriptSingle.filter((p) => String(EXEMPT_SCRIPTS.get(p) || '').startsWith('✅'))
const legit = scriptSingle.filter((p) => EXEMPT_SCRIPTS.has(p) && !String(EXEMPT_SCRIPTS.get(p)).match(/^(known-broken|✅)/))
console.log(`② 脚本面（**报告态** · 如实列出 ${scriptSingle.length} 件，判据由人眼做）：`)
if (knownBroken.length) {
  console.log(`   · 🔴 **已知欠账 ${knownBroken.length} 件**（实测确认失真；修完须从本表删）：`)
  for (const p of knownBroken) console.log(`       ${p} —— ${EXEMPT_SCRIPTS.get(p)}`)
} else {
  console.log('   · ✅ **已知欠账 0 件**（本轮已把实测确认失真的 10 件全部改为跨档读）')
}
if (fixed.length) {
  console.log(`   · ✅ 本轮已修 ${fixed.length} 件（留档对照，**下一轮从本表删**）：`)
  for (const p of fixed) console.log(`       ${p} —— ${EXEMPT_SCRIPTS.get(p)}`)
}
console.log(`   · 已声明合法 ${legit.length} 件（夹具/写侧/路径常量）`)
if (unlisted.length) {
  console.log(`   · ⚠ **未登记**（新出现的单档读，须在 EXEMPT_SCRIPTS 写明理由或将改为跨档）：`)
  for (const p of unlisted) console.log(`       ${p}`)
}

console.log('③ 分工声明：本件治「读的档位」（跨档/单档）· `check-observability --parsability` 治「读的编解码」（失败行）')
console.log('   实测：两者会同时命中同一个器 ⇒ 必须并存，不得合并。')

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（源码面台账读法合规；脚本面已如实列出，含已知欠账计数）')
