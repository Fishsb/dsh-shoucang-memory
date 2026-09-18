#!/usr/bin/env node
// test-sleep-report.mjs — S2S3 册四：**睡眠汇报 + 问题标记 + 影响账**判据（2026-09-19）
//
// 判据（四要素）：
//   ① 判据：每轮睡眠产出**一份汇报**（固定五段）· 同日多轮**追加不覆盖**（"日历式永不删除"）·
//      影响账并入 `sleep-reports.jsonl`（册二裁定：不另开流）· 问题标记**只标记不处理**（`handled:'not-handled'`）·
//      `suspect-recall` 与 `suspect-quality` **按指针可解析性分开**（前者=召回面，后者=记忆面）·
//      统计**分母带绝对值**且 `injected` 显式记 unknown（不用代理指标冒充判据）。
//   ② 检查方式：直接调 `lib/sleep-report.js` 的纯函数 + 在临时库上跑 `writeSleepRound` 后**读回文件**。
//   ③ 阈值：两轮同日 ⇒ 文件包含两个 `## ` 段且第一段**逐字节未变**；issues 行数 = 标记数；impact 行数 = 窗口内条目数。
//   ④ 失败退回：任一红 ⇒ 该册不得合入（"汇报被覆盖"= 用户口径的直接违背）。
//
// **先红**：改造前无 `sleep-report.ts`（`reports/sleep/` 目录也不存在）⇒ 首跑即 FAIL。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

let M = null
try { M = await import(new URL('../lib/sleep-report.js', import.meta.url).href) } catch { /* 缺件 */ }
if (!M || typeof M.writeSleepRound !== 'function') {
  bad('lib/sleep-report.js 缺 writeSleepRound（先红成立：册四改造前无此件）')
  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
  process.exit(1)
}

const kRoot = mkdtempSync(join(tmpdir(), 'sc-sleep-k-'))
const bankRoot = mkdtempSync(join(tmpdir(), 'sc-sleep-b-'))
mkdirSync(join(kRoot, 'audit'), { recursive: true })
mkdirSync(join(bankRoot, 'notes'), { recursive: true })
writeFileSync(join(bankRoot, 'notes', 'env.md'), '# env\n\n## 基准节\n- 有一条\n', 'utf8')
// 为区分「召回面 vs 记忆面」：tools.md 里**正常存在**的节 ⇒ unused 应判 `suspect-recall`（指针没问题）；
//   而 activity 里的「悬空节」在库里不存在 ⇒ 应判 `suspect-quality`（指针不可解析）。
writeFileSync(join(bankRoot, 'notes', 'tools.md'), '# tools\n\n## 正常节\n- 有一条但从未被读\n', 'utf8')
writeFileSync(join(bankRoot, 'MEMORY.md'), '# MEMORY\n', 'utf8')

// 影响账数据源（既有遥测的形态：access-real `t/f/s`；activity `key/f/s/hits/lastHit/status`）
const now = Date.now()
writeFileSync(join(kRoot, 'audit', 'access-real.jsonl'), [
  JSON.stringify({ t: new Date(now - 1000).toISOString(), f: 'notes/env.md', s: '基准节' }),
  JSON.stringify({ t: new Date(now - 2000).toISOString(), f: 'notes/env.md', s: '基准节' }),
  JSON.stringify({ t: new Date(now - 3 * 3600 * 1000).toISOString(), f: 'notes/tools.md', s: '旧节' }),
].join('\n') + '\n', 'utf8')
writeFileSync(join(kRoot, 'audit', 'activity.jsonl'), [
  JSON.stringify({ key: 'notes/env.md|基准节', f: 'notes/env.md', s: '基准节', hits: 5, lastHit: now - 1000, status: 'active', hits30: 5, days30: 1, salience: 2 }),
  JSON.stringify({ key: 'notes/tools.md|正常节', f: 'notes/tools.md', s: '正常节', hits: 0, lastHit: 0, status: 'cold' }),
  JSON.stringify({ key: 'notes/tools.md|悬空节', f: 'notes/tools.md', s: '悬空节', hits: 0, lastHit: 0, status: 'cold' }),
].join('\n') + '\n', 'utf8')

// ── 1 · 影响账（确定性聚合 + 口径诚实）────────────────────────
{
  const rows = M.buildImpactRows({ kRoot, sinceMs: now - 3600 * 1000, untilMs: now })
  const env = rows.find((r) => r.section === '基准节')
  env && env.realReads === 2 && env.verdict === 'keep'
    ? ok('影响账：窗口内真读 2 次的条目 verdict=keep（确定性证据）') : bad(`影响账错：${JSON.stringify(env)}`)
  const others = rows.filter((r) => r.section === '旧节')
  others.length === 0 ? ok('窗口外（3h 前的读）不计入本窗 —— 区间是真截断的') : bad(`窗口截断失效：${JSON.stringify(others)}`)
  rows.every((r) => r.injected === 'unknown')
    ? ok('`injected` 一律记 unknown（步级遥测无法按条目归属 ⇒ **不用代理指标冒充判据**）') : bad('injected 被伪装成确定值')
  const cold = rows.find((r) => r.section === '悬空节')
  cold && cold.verdict === 'unused-candidate' ? ok('零真读零活性 ⇒ unused-candidate') : bad(`cold 条未标：${JSON.stringify(cold)}`)
}

// ── 2 · 问题标记：召回面 / 记忆面分开 ─────────────────────────
{
  const rows = M.buildImpactRows({ kRoot, sinceMs: now - 3600 * 1000, untilMs: now })
  const issues = M.issueRowsOf(bankRoot, rows)
  const recall = issues.filter((i) => i.tag === 'suspect-recall')
  const quality = issues.filter((i) => i.tag === 'suspect-quality')
  recall.some((i) => i.section === '正常节') && quality.some((i) => i.section === '悬空节')
    ? ok(`标记分开计数：suspect-recall ${recall.length}（指针正常未读=召回面）/ suspect-quality ${quality.length}（指针悬空=记忆面）`)
    : bad(`标记分类错：${JSON.stringify(issues.map((i) => i.tag + ':' + i.section))}`)
  issues.every((i) => i.handled === 'not-handled' && String(i.why).trim())
    ? ok('**只标记不处置**：每条带 `handled=not-handled` 与归因理由（用户口径）') : bad('标记越权处置或缺理由')
  const stats = M.statsOf(rows, issues)
  stats.rows > 0 && typeof stats.unusedRate === 'number' && stats.injectedUnknown === rows.length
    ? ok(`统计带分母绝对值：rows=${stats.rows} · unused=${stats.unused} · 率=${stats.unusedRate} · unknown=${stats.injectedUnknown}`)
    : bad(`统计口径错：${JSON.stringify(stats)}`)
}

// ── 3 · 汇报：五段齐 + 同日多轮追加不覆盖 ─────────────────────
{
  const mk = (at) => ({
    at, sinceMs: now - 3600 * 1000, untilMs: now,
    produceOff: true, produced: { added: 0, replaced: 0, profiles: 0 },
    maintenance: { tree: 1, pointers: 2, archived: 3, kept: 10 },
    materials: { segments: 2, failures: 1 },
    impact: M.buildImpactRows({ kRoot, sinceMs: now - 3600 * 1000, untilMs: now }),
  })
  const date = '2026-09-19'
  const r1 = M.writeSleepRound({ kRoot, bankRoot, date }, mk(new Date(now - 60_000).toISOString()))
  const first = readFileSync(r1.reportFile, 'utf8')
  const five = ['### 1. 区间', '### 2. 提存', '### 3. 压缩', '### 4. 问题标记', '### 5. 统计'].every((s) => first.includes(s))
  five ? ok('汇报五段齐备（区间/提存/压缩/问题标记/统计）') : bad('汇报缺段')
  first.includes('只标记不处理') ? ok('汇报第 4 段明写「只标记不处理」') : bad('第 4 段未写处置口径')
  const r2 = M.writeSleepRound({ kRoot, bankRoot, date }, mk(new Date(now).toISOString()))
  const second = readFileSync(r2.reportFile, 'utf8')
  second.startsWith(first) && (second.match(/^## /gm) || []).length === 2
    ? ok('同日两轮 ⇒ **追加不覆盖**（第一段逐字节未变 + 段数 2 = 日历式留存）') : bad('第二轮覆盖了第一轮')
  existsSync(M.sleepReportsStreamOf(kRoot)) && existsSync(M.sleepIssuesStreamOf(kRoot))
    ? ok('两份流都落了（`sleep-reports.jsonl` 含本轮行 + `sleep-issues.jsonl` 含标记行）') : bad('流缺失')
  const stream = readFileSync(M.sleepReportsStreamOf(kRoot), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  stream.filter((r) => r.kind === 'sleep-round').length === 2 ? ok('每轮一行 `kind=sleep-round`（册三 D 档的判据载体）') : bad('轮行数不对')
  stream.filter((r) => r.kind === 'impact').length === r1.stats.rows + r2.stats.rows
    ? ok(`影响账**并入**同一流（${r1.stats.rows + r2.stats.rows} 条 impact 行）——册二裁定：不另开 audit/impact/`) : bad('影响账未并入')
  const der = M.derivationOf(mk(new Date(now).toISOString()), r1.stats)
  der.length >= 1 && der.length <= 3 ? ok(`「最近成长」派生 3 行内（${der.length} 行）——delta 退役后的注入源`) : bad('派生化异常')
}

rmSync(kRoot, { recursive: true, force: true }); rmSync(bankRoot, { recursive: true, force: true })
console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
