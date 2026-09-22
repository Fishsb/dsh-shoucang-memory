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
//   ★4 · **注入侧换源**（册四 ②「『最近成长』改派生」）：注入块 == 报告提存/压缩/统计段**逐元素**可机检
//         （`latestDerivation` 与报告正文**同函数**）；失效键**同轮**把第二条介质由 `delta.md` 换成
//         `sleep-reports.jsonl`（篡改汇报行 ⇒ `media` 变；只动 md 留存面 ⇒ 不变 —— 会审 §3.4 的"进键/声明"二选一）。
//
// **先红**：改造前无 `sleep-report.ts`（`reports/sleep/` 目录也不存在）⇒ 首跑即 FAIL。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
mkdirSync(join(bankRoot, 'audit'), { recursive: true })   // 遥测（access-real/activity）在**库内** audit/
writeFileSync(join(bankRoot, 'notes', 'env.md'), '# env\n\n## 基准节\n- 有一条\n', 'utf8')
// 为区分「召回面 vs 记忆面」：tools.md 里**正常存在**的节 ⇒ unused 应判 `suspect-recall`（指针没问题）；
//   而 activity 里的「悬空节」在库里不存在 ⇒ 应判 `suspect-quality`（指针不可解析）。
writeFileSync(join(bankRoot, 'notes', 'tools.md'), '# tools\n\n## 正常节\n- 有一条但从未被读\n', 'utf8')
writeFileSync(join(bankRoot, 'MEMORY.md'), '# MEMORY\n', 'utf8')

// 影响账数据源（既有遥测的形态：access-real `t/f/s`；activity `key/f/s/hits/lastHit/status`）
const now = Date.now()
writeFileSync(join(bankRoot, 'audit', 'access-real.jsonl'), [
  JSON.stringify({ t: new Date(now - 1000).toISOString(), f: 'notes/env.md', s: '基准节' }),
  JSON.stringify({ t: new Date(now - 2000).toISOString(), f: 'notes/env.md', s: '基准节' }),
  JSON.stringify({ t: new Date(now - 3 * 3600 * 1000).toISOString(), f: 'notes/tools.md', s: '旧节' }),
].join('\n') + '\n', 'utf8')
writeFileSync(join(bankRoot, 'audit', 'activity.jsonl'), [
  JSON.stringify({ key: 'notes/env.md|基准节', f: 'notes/env.md', s: '基准节', hits: 5, lastHit: now - 1000, status: 'active', hits30: 5, days30: 1, salience: 2 }),
  JSON.stringify({ key: 'notes/tools.md|正常节', f: 'notes/tools.md', s: '正常节', hits: 0, lastHit: 0, status: 'cold' }),
  JSON.stringify({ key: 'notes/tools.md|悬空节', f: 'notes/tools.md', s: '悬空节', hits: 0, lastHit: 0, status: 'cold' }),
].join('\n') + '\n', 'utf8')

// ── 1 · 影响账（确定性聚合 + 口径诚实）────────────────────────
{
  const rows = M.buildImpactRows({ bankRoot, sinceMs: now - 3600 * 1000, untilMs: now })
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
  const rows = M.buildImpactRows({ bankRoot, sinceMs: now - 3600 * 1000, untilMs: now })
  const issues = M.issueRowsOf(bankRoot, rows)
  const recall = issues.filter((i) => i.tag === 'suspect-recall')
  const quality = issues.filter((i) => i.tag === 'suspect-quality')
  recall.some((i) => i.section === '正常节') && quality.some((i) => i.section === '悬空节')
    ? ok(`标记分开计数：suspect-recall ${recall.length}（指针正常未读=召回面）/ suspect-quality ${quality.length}（指针悬空=记忆面）`)
    : bad(`标记分类错：${JSON.stringify(issues.map((i) => i.tag + ':' + i.section))}`)
  issues.every((i) => i.handled === 'not-handled' && String(i.why).trim())
    ? ok('**只标记不处置**：每条带 `handled=not-handled` 与归因理由（用户口径）') : bad('标记越权处置或缺理由')
  /* G12 反例夹具（会审 v2 明确要求）：构造 `unused` ⇒ **条目仍在原位**（标记不可动手）。
   *  判据形式 = 写标记前后，目标 notes 文件**逐字节不变**（"仍在原位"的可机检写法）。 */
  {
    const before = {}
    for (const f of readdirSync(bankRoot + '/notes')) before[f] = readFileSync(join(bankRoot, 'notes', f))
    const rows2 = M.buildImpactRows({ bankRoot, sinceMs: now - 3600 * 1000, untilMs: now })
    M.issueRowsOf(bankRoot, rows2)   // 只产标记行（纯函数，不落盘）
    const changed = Object.keys(before).filter((f) => !readFileSync(join(bankRoot, 'notes', f)).equals(before[f]))
    changed.length === 0
      ? ok(`G12 反例夹具：构造 ${rows2.filter((r) => r.verdict === 'unused-candidate').length} 条 unused ⇒ notes 文件**逐字节未动**（只有存在真实容量门的载体才允许被处置）`)
      : bad(`G12：标记动作改动了 notes 文件（${changed.join(', ')}）—— 越权处置`)
  }
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
    impact: M.buildImpactRows({ bankRoot, sinceMs: now - 3600 * 1000, untilMs: now }),
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

// ── 4 · 注入侧换源（S2S3 册四 ②「『最近成长』改派生」）：**注入块 == 报告提存/压缩/统计段** ──
//   判据（会审 §3.4/§4）：不是"文本非空"，而是**逐元素等价** + **失效键同轮换源**。
//   **先红**：换源前无 `latestDerivation` 导出（本组直接抛/判红）；`media` 里也仍是 `delta.md`。
{
  let SS = null
  try { SS = await import(new URL('../lib/supply-stamp.js', import.meta.url).href) } catch { /* 缺件 */ }
  const der = M.latestDerivation({ kRoot })
  const rows = readFileSync(M.sleepReportsStreamOf(kRoot), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'sleep-round')
  const last = rows[rows.length - 1] || {}
  // ① 逐元素等于「同一条 round 行 + **同一个** `derivationOf`」的输出 ⇒ 注入侧没有第二份复算副本
  const expect = M.derivationOf({
    at: String(last.at || ''), sinceMs: last.sinceMs, untilMs: last.untilMs, produceOff: last.produceOff === true,
    produced: { added: last.added, replaced: last.replaced, profiles: last.profiles },
    maintenance: { tree: last.tree, pointers: last.pointers, archived: last.archived, kept: last.kept },
    materials: last.materials, impact: [],
  }, last.stats)
  der.length > 0 && JSON.stringify(der) === JSON.stringify(expect)
    ? ok(`注入派生**逐元素等于**同函数输出（${der.length} 行：${der.join(' ／ ')}）`) : bad(`派生不一致：${JSON.stringify(der)} ≠ ${JSON.stringify(expect)}`)
  // ② 每个元素里的**数值**必须能在**报告正文**里找到（注入块 == 报告提存/压缩/统计段）
  const report = readFileSync(join(bankRoot, 'reports', 'sleep', '2026-09-19.md'), 'utf8')
  const nums = der.flatMap((l) => String(l).match(/\d+/g) || [])
  const missing = nums.filter((n) => !report.includes(n))
  nums.length > 0 && missing.length === 0
    ? ok(`派生行里 ${nums.length} 个数值**逐个可在报告正文命中**（${nums.join(',')}）——"注入块 == 报告段"可机检`)
    : bad(`派生数值在报告里查不到：${JSON.stringify(missing)}`)
  // ③ 失效键**同轮换源**：篡改汇报行 ⇒ `media` 必变；只动 md 留存面 ⇒ `media` 不变（已声明不参与 + 理由在 supply-stamp 头注）
  const mediaOf = () => (SS ? SS.libStampOf(bankRoot, kRoot).media : '')
  const m0 = mediaOf()
  const raw = readFileSync(M.sleepReportsStreamOf(kRoot), 'utf8')
  writeFileSync(M.sleepReportsStreamOf(kRoot), raw.replace(/"added":0/, '"added":7'), 'utf8')
  const m1 = mediaOf()
  m0 && m1 !== m0 ? ok(`篡改汇报行 ⇒ \`media\` 变化（${m0.split('|')[1] || ''} → ${m1.split('|')[1] || ''}）`) : bad(`汇报行改了但 media 未变（${m0} → ${m1}）`)
  writeFileSync(join(bankRoot, 'reports', 'sleep', '2026-09-19.md'), report + '\n<!-- tamper -->\n', 'utf8')
  const m2 = mediaOf()
  m2 === m1 ? ok('只动 md 留存面 ⇒ `media` **不变**（append-only 人读面**不进失效键**：否则缓存每轮必失效）') : bad('md 留存面竟然进了失效键')
  // ④ 失效键**同轮加源**：派生源（汇报流）进键；`delta.md` **留键**（未退役 + 兜底源）——
  //    判据是"**不得少签**"：加的是派生源这条新介质，不是把旧介质抽掉（退役时才同轮移除）。
  const mediaAll = SS ? SS.libStampOf(bankRoot, kRoot).media : ''
  mediaAll.includes('audit/sleep-reports.jsonl') && mediaAll.includes('delta.md') && mediaAll.includes('activity.jsonl')
    ? ok('失效键三条介质齐（activity + 睡眠汇报流〔派生源〕+ delta.md〔兜底源〕）')
    : bad(`失效键介质不全：${mediaAll}`)
  // ⑤ 反向判据：把「留存面 md」也签进去 = 缓存每轮必失效 ⇒ 明确**不在**键内（会审 §3.4 的二选一：声明不参与 + 记录理由）
  mediaAll.includes('reports/sleep') ? bad('留存面 md 竟然进键（会让缓存每轮必失效）') : ok('留存面 md 不在键内（已声明 + 理由在 supply-stamp 头注）')
}

// ── 5 · G11「报告永不删除」指纹账三断言 + G13 双字段（2026-09-19 补）──────────────
//   ⚠ 为什么不能只断言"文件存在"：追加式产物的"存在"永远为真 —— 覆盖写（内容变、行数不变）照样全绿。
//   **先红**：改造前无 `sleep-report-ledger.jsonl`（账不存在 ⇒ 本组首条即红）。
{
  const ledgerFile = M.sleepLedgerStreamOf(kRoot)
  const led = existsSync(ledgerFile) ? readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
  const roundRows = readFileSync(M.sleepReportsStreamOf(kRoot), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'sleep-round')
  // ① 账行数单调不减且增量 == 轮数（本夹具 2 轮 ⇒ 2 行）
  led.length === roundRows.length && led.length >= 2
    ? ok(`指纹账①：行数 == 轮数（${led.length} 行，单调不减 —— 每轮必记且不重写旧行）`)
    : bad(`指纹账①：账 ${led.length} 行 ≠ 轮 ${roundRows.length} 行`)
  // ② 账内**每条**的 sha256 仍等于**当下文件的前缀哈希**（覆盖 100%）
  //   ⚠ 口径（本次实测修正）：追加式文件的早期行**不可能**等于"整文件当下哈希"（后续轮会继续追加）
  //     ⇒ 正确的可判据形式是 **前缀哈希**：`sha256(now[0..bytes)) == row.sha256` **且** `now.length ≥ bytes`
  //     —— 它拦的正是"被覆盖 / 被截断"（一旦改写，前缀哈希立刻不等）。
  const cur = readFileSync(join(bankRoot, 'reports', 'sleep', '2026-09-19.md'))
  const curSha = createHash('sha256').update(cur).digest('hex')
  const prefixOk = led.filter((r) => {
    if (cur.length < r.bytes) return false
    const pref = createHash('sha256').update(cur.subarray(0, r.bytes)).digest('hex')
    if (pref !== r.sha256) return false
    // 该行记录时必须**恰好**看到 `bytes` 长度（即它是那一轮的整文件）——叠加单调性，等价于"只增不覆盖"
    return true
  }).length
  led.length > 0 && prefixOk === led.length
    ? ok(`指纹账②：账内 ${prefixOk}/${led.length} 条的 sha256 == **当下文件前缀哈希**（覆盖 100% ⇒ 无覆盖/截断）`)
    : bad(`指纹账②：仅 ${prefixOk}/${led.length} 条前缀哈希相等（疑被覆盖/截断；当下整文件 sha ${curSha.slice(0, 8)}）`)
  // ③ 报告段数 == `sleep-reports.jsonl` 同轮值（逐值相等：段数 == 轮数）
  const sectionsNow = (cur.toString('utf8').match(/^## /gm) || []).length
  sectionsNow === roundRows.length && led[led.length - 1].sections === roundRows.length
    ? ok(`指纹账③：报告段数 == 汇报流轮数（${sectionsNow} == ${roundRows.length}，账内同值 —— 逐值相等）`)
    : bad(`指纹账③：段数 ${sectionsNow} / 账内 ${led[led.length - 1].sections} / 轮数 ${roundRows.length} 不相等`)
  // ④ 首现时间**同日多轮不重置**（第二轮的 firstSeenAt == 第一轮）
  led.length >= 2 && led[0].firstSeenAt === led[led.length - 1].firstSeenAt && !!led[0].firstSeenAt
    ? ok(`指纹账④：同日多轮 \`firstSeenAt\` **不重置**（${led[0].firstSeenAt}）——"这份报告从何时起存在"可答`)
    : bad(`指纹账④：firstSeenAt 被重置或为空（${JSON.stringify(led.map((r) => r.firstSeenAt))}）`)
  // G13 双字段：问题行必须带 `unusedAtFirstObservation` 与 `stillUnused`
  const iss = readFileSync(M.sleepIssuesStreamOf(kRoot), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const withBoth = iss.filter((r) => typeof r.unusedAtFirstObservation === 'string' && r.unusedAtFirstObservation && r.stillUnused === true)
  iss.length > 0 && withBoth.length === iss.length
    ? ok(`G13 双字段齐：${iss.length} 条标记全带 \`unusedAtFirstObservation\` + \`stillUnused=true\`（"标了多久"与"是否仍在"可答）`)
    : bad(`G13 双字段缺：${withBoth.length}/${iss.length}`)
  // 第二个分母：当日产出条数（本夹具 0 产出 ⇒ 分母 0、比例记 0 —— **不给"无意义的 0%"**）
  const lastRoundStats = roundRows[roundRows.length - 1].stats
  lastRoundStats.producedToday === 0 && lastRoundStats.suspectPerProduced === 0
    ? ok('G13 第二分母：当日产出 0 ⇒ 分母记 0 且比例记 0（口径显式，不冒充"通过"）')
    : bad(`G13 第二分母异常：${JSON.stringify(lastRoundStats)}`)
}

// ── 6 · 尾读窗口口径（2026-09-19 · **实测缺陷**：台账尾窗太小 ⇒ 生产静默无汇报）────────────
//   病灶：`readTailLines` 缺省只回读末端 **256KB**；真库台账 18.8k 行时「末条 deep-sleep」在 **2778 行**之前
//   ⇒ `roundInputFromLedger` 看不见它 ⇒ 自检触发时**静默返回 no-deep-sleep-round**（看着像"没跑过深睡"）。
//   **先红**：本组在旧实现（缺省 256KB）下第一条必红；修后（2MB 窗口）必须命中。
{
  const kRoot2 = mkdtempSync(join(tmpdir(), 'sc-sleep-tail-'))
  const bankRoot2 = mkdtempSync(join(tmpdir(), 'sc-sleep-tail-b-'))
  mkdirSync(join(kRoot2, 'audit'), { recursive: true })
  mkdirSync(join(bankRoot2, 'notes'), { recursive: true })
  const filler = JSON.stringify({ at: '2026-09-19T00:00:00.000Z', type: 'mcl-step', phase: 'inject', pad: 'x'.repeat(220) })
  const deep = JSON.stringify({ at: '2026-09-19T01:00:00.000Z', kind: 'deep-sleep', gate: 'produce-off', epochSince: Date.parse('2026-09-19T00:00:00.000Z'), attempted: 2, rejected: 0, added: 0, replaced: 0, profiles: 0 })
  // 2500 行填充（≈ 2500×260B ≈ 650KB > 256KB 缺省窗口，< 2MB 新窗口）
  writeFileSync(join(kRoot2, 'audit', 'ledger.jsonl'), [deep, ...Array.from({ length: 2500 }, () => filler)].join('\n') + '\n', 'utf8')
  const got = M.roundInputFromLedger({ kRoot: kRoot2 })
  got && got.produceOff === true && got.materials.segments === 2
    ? ok(`尾窗口径：deep-sleep 行距尾 2500 行（≈650KB > 缺省 256KB）仍被命中（produceOff=${got.produceOff} · segments=${got.materials.segments}）`)
    : bad(`尾窗口径：2500 行距的 deep-sleep 行未被命中（${JSON.stringify(got)}）—— 生产上会静默无汇报`)
  // 反向：真的一条都没有时，理由必须**带窗口口径**（否则"没跑过深睡"与"窗口太小"不可分辨）
  const kRoot3 = mkdtempSync(join(tmpdir(), 'sc-sleep-tail3-'))
  mkdirSync(join(kRoot3, 'audit'), { recursive: true })
  writeFileSync(join(kRoot3, 'audit', 'ledger.jsonl'), filler + '\n', 'utf8')
  const r = M.writeSleepReportFromLedger({ kRoot: kRoot3, bankRoot: bankRoot2, date: '2026-09-19' })
  r.ok === false && /尾读窗口/.test(String(r.reason))
    ? ok('失败理由可分辨：`no-deep-sleep-round` 附带**尾读窗口口径**（不再与"没跑过深睡"混淆）')
    : bad(`失败理由缺口径：${JSON.stringify(r)}`)
  for (const d of [kRoot2, kRoot3, bankRoot2]) rmSync(d, { recursive: true, force: true })
}

// ── 7 · 归因取样读数**必须有消费面**（2026-09-22 · 补「写入侧有、消费面零」）──────────────
//   判因（全树 grep 实测）：`deepsleep-run.ts:552` 落的 `attributionScanned`（为收满样本扫了多少行）
//   是「**扫描触顶**（调上限）」与「**样本真不足**（等时间）的**唯一分辨依据** ——
//   两者在 `samples < 门槛` 上读数同形而处置相反 —— 却**零读取方** ⇒ 该分辨能力从未抵达任何人眼前。
//   **先红**：改造前 `SleepRoundInput` 无 `attribution` 字段 ⇒ 本组头一条即红。
{
  const mkAt = (at, attr) => ({
    at, sinceMs: now - 3600 * 1000, untilMs: now,
    produceOff: true, produced: { added: 0, replaced: 0, profiles: 0 },
    maintenance: { tree: 0, pointers: 0, archived: 0, kept: 0 },
    materials: { segments: 1, failures: 0 },
    impact: [], ...(attr ? { attribution: attr } : {}),
  })
  const date2 = '2026-09-22'
  /* ⚠ 汇报文件是**追加式**（同日多轮不覆盖，本册的核心口径）⇒ 判读**必须只看最后一段**：
   *   首版直接 `includes` 整份文件 ⇒ 读到的是**上一轮**的内容（两处断言因此假红 —— 是测试的
   *   读法错，不是实现错）。取 `lastIndexOf('\n## ')` 之后的切片即"最新一轮"。 */
  const lastRoundOf = (file) => {
    const t = readFileSync(file, 'utf8')
    const i = t.lastIndexOf('\n## ')
    return i < 0 ? t : t.slice(i + 1)
  }
  // ① 触顶态：必须能一眼看出「该调上限」而不是「该等时间」
  const rCap = M.writeSleepRound({ kRoot, bankRoot, date: date2 }, mkAt('2026-09-22T01:00:00.000Z', {
    verdict: 'insufficient', samples: 7, scanned: 4000, hitCap: true, note: '扫描触顶',
  }))
  const capText = lastRoundOf(rCap.reportFile)
  capText.includes('扫描触顶') && /等时间不够|调 `ATTRIBUTION_MAX_SCAN`/.test(capText)
    ? ok('触顶态**人读可见**：汇报明写「扫描触顶 ⇒ 调上限，等时间不够」（不再是只有一句"样本 < 30"）')
    : bad('触顶态未抵达汇报正文（分辨能力仍不可见）')
  // ② 真不足态：必须与触顶态**措辞可分辨**（同形是这条缺陷的本质）
  const rLow = M.writeSleepRound({ kRoot, bankRoot, date: date2 }, mkAt('2026-09-22T02:00:00.000Z', {
    verdict: 'insufficient', samples: 7, scanned: 120, hitCap: false, note: '',
  }))
  const lowText = lastRoundOf(rLow.reportFile)
  lowText.includes('属样本真不足') && !lowText.includes('扫描触顶')
    ? ok('真不足态**措辞可分辨**：明写「未触顶 ⇒ 属样本真不足，等时间」（与触顶态不再同形）')
    : bad('两种不足态在汇报里仍同形 —— 正是本缺陷要消灭的形态')
  // ③ 机器面：`sleep-reports.jsonl` 的轮行必须带 attribution（供面板/脚本消费，不只人读）
  const stream2 = readFileSync(M.sleepReportsStreamOf(kRoot), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const rounds2 = stream2.filter((r) => r.kind === 'sleep-round')
  const withAttr = rounds2.filter((r) => r.attribution && typeof r.attribution.scanned === 'number')
  withAttr.length === 2 && withAttr.some((r) => r.attribution.hitCap === true)
    ? ok(`机器面同源：${withAttr.length} 条轮行带 \`attribution{scanned,hitCap}\`（面板/脚本可直接消费）`)
    : bad(`机器面缺 attribution（实得 ${withAttr.length}/${rounds2.length}）`)
  // ④ 反向：**无该通道时不得编造 0**（"没跑该通道"与"扫了 0 行"必须可分辨）
  const rNone = M.writeSleepRound({ kRoot, bankRoot, date: date2 }, mkAt('2026-09-22T03:00:00.000Z', null))
  const rounds3 = readFileSync(M.sleepReportsStreamOf(kRoot), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'sleep-round')
  const lastR = rounds3[rounds3.length - 1]
  lastR.attribution === undefined && !lastRoundOf(rNone.reportFile).includes('召回归因取样')
    ? ok('反向：**无该通道时不编造**（轮行无 attribution 键 · 正文不出该行 —— 不把"没跑"渲染成"扫了 0 行"）')
    : bad(`无通道时仍编造了读数：${JSON.stringify(lastR.attribution)}`)
}

rmSync(kRoot, { recursive: true, force: true }); rmSync(bankRoot, { recursive: true, force: true })
console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
