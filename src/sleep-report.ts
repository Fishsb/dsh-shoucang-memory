// sleep-report.ts — **睡眠汇报 + 问题标记 + 影响账**（S2S3 册四；同时结清册二「影响账并入 sleep-reports.jsonl」）
//
// 用户口径：**每一次睡眠要产出一个汇报**（提存与压缩）· 导致反向/无用**只标记不处理** · 汇报**像日历一样一直有、
//   不会删除**且 UI 可见 · 还要一个**睡眠产出问题统计**。
//
// 三份产物（会审裁剪后的形态）：
//   ① 人读汇报 `<bank>/reports/sleep/<YYYY-MM-DD>.md` —— **同日多轮按轮追加，绝不覆盖**（"不删除"的落点）
//   ② 机器可读 `<kRoot>/audit/sleep-reports.jsonl` —— **每轮一行**；**影响账行也并入这条流**（册二裁定：不另开 `audit/impact/`）
//   ③ 问题队列 `<kRoot>/audit/sleep-issues.jsonl` —— 每条标记一行（状态机 `open → 处置/关闭`，**只增不改历史行**）
//
// **标记判据（确定性证据；代理指标只排序不裁定 —— 会审 Q3）**：
//   `unused`（本窗真读 0 且注入 0/未知）· `counter`（决策环 `outcome.hit==='0'`，Q7 裁定源）·
//   `suspect-recall`（`unused` **但索引行质量正常** ⇒ 归因指向注入/召回面）· `suspect-quality`（`unused` **且**指针悬空）。
//   ⚠ **"是否被注入"当前无法按条目判定**（`mcl-step` 的 `injected` 只到步级、fast 通道硬写 0）⇒
//   本件把它显式记成 `injected:'unknown'` 并在统计里单列，**不用代理指标冒充判据**。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { readTailLines } from './file-stat-cache.js'
import { resolveSection } from './section-ref.js'

export interface ImpactRow {
  file: string
  section: string
  realReads: number
  activityHits: number | null
  activityStatus: string
  lastHitMs: number | null
  injected: 'unknown'
  verdict: 'keep' | 'unused-candidate'
}
/** **问题标记行**（G13 双字段的载体；`issueRowsOf` 产、`buildReportSection`/`statsOf`/面板三处消费）。 */
export interface IssueRow {
  tag: string
  file: string
  section: string
  evidence: string
  /** **只标记不处置**（用户口径）——状态机走**新行**，不重写旧行。 */
  handled: 'not-handled'
  why: string
  /** 该 (file,section) **第一次**被判 `unused-candidate` 的时刻（跨轮继承）。 */
  unusedAtFirstObservation: string
  /** 本轮是否仍然未被真读（本函数只产 `true`；字段存在的意义是让后续轮次可写 `false`）。 */
  stillUnused: boolean
}
export interface SleepRoundInput {
  at: string
  sinceMs: number
  untilMs: number
  produceOff: boolean
  produced: { added: number; replaced: number; profiles: number }
  maintenance: { tree: number; pointers: number; archived: number; kept: number }
  materials: { segments: number; failures: number }
  impact: ImpactRow[]
}

export const sleepReportDirOf = (bankRoot: string): string => join(bankRoot, 'reports', 'sleep')
export const sleepReportPathOf = (bankRoot: string, date: string): string => join(sleepReportDirOf(bankRoot), `${date}.md`)
export const sleepReportsStreamOf = (kRoot: string): string => join(kRoot, 'audit', 'sleep-reports.jsonl')
export const sleepIssuesStreamOf = (kRoot: string): string => join(kRoot, 'audit', 'sleep-issues.jsonl')
/** **报告指纹账**（G11「报告永不删除」的判据载体）：每轮一行，整文件 sha256 + 字节/行/段数。 */
export const sleepLedgerStreamOf = (kRoot: string): string => join(kRoot, 'audit', 'sleep-report-ledger.jsonl')

/** 指纹行（**整文件**口径；理由见 `writeSleepRound` 内注释）。 */
export interface FingerprintRow {
  dateFile: string
  sha256: string
  bytes: number
  lines: number
  sections: number
  /** 该日文件**首次**出现的时间（同日多轮不重置 —— 它答的是"这份报告从何时起存在"）。 */
  firstSeenAt: string
  /** 本次记录时间（= 本轮 `at`）。 */
  at: string
}
/** 复算某份报告的指纹（**与 `writeSleepRound` 同一实现** ⇒ 账与真身不可能漂移）。 */
export function fingerprintOf(file: string, date: string, at: string, firstSeenAt?: string): FingerprintRow {
  const buf = readFileSync(file)
  const text = buf.toString('utf8')
  return {
    dateFile: `${date}.md`,
    sha256: createHash('sha256').update(buf).digest('hex'),
    bytes: buf.length,
    lines: text.split('\n').length,
    sections: (text.match(/^## /gm) || []).length,
    firstSeenAt: firstSeenAt || at,
    at,
  }
}
/** 已记录的**首次出现时间**（同 `dateFile` 取最早的一行；无 ⇒ 空串）。 */
export function firstSeenOf(kRoot: string, dateFile: string): string {
  let out = ''
  for (const r of parseRows(sleepLedgerStreamOf(kRoot), 2000)) {
    if (String(r.dateFile || '') !== dateFile) continue
    const t = String(r.firstSeenAt || '')
    if (t && (!out || t < out)) out = t
  }
  return out
}

/* ⚠ **字节上限必须显式给**（2026-09-19 实测缺陷）：`readTailLines` 缺省只回读**末端 256KB** ⇒
 *   台账 18.8k 行时「末条 deep-sleep」在 **2778 行**之前（≈800KB）⇒ 缺省窗口**看不见它**，
 *   生产上表现为「自检触发了但静默无汇报」（reason 只写 no-deep-sleep-round ⇒ 看着像"没跑过深睡"）。
 *   ⇒ 需要跨越多行距的调用点显式放大窗口（2MB ≈ 6.6k 行；每轮一次，代价可接受）。 */
const TAIL_MAX_BYTES = 2 * 1024 * 1024
const tail = (file: string, n: number, maxBytes = TAIL_MAX_BYTES): string[] => { try { return readTailLines(file, n, maxBytes).filter(Boolean) } catch { return [] } }
const parseRows = (file: string, n: number, maxBytes = TAIL_MAX_BYTES): Array<Record<string, unknown>> => {
  const out: Array<Record<string, unknown>> = []
  for (const l of tail(file, n, maxBytes)) { try { out.push(JSON.parse(l) as Record<string, unknown>) } catch { /* 坏行跳过 */ } }
  return out
}

/** **影响账**（确定性聚合）：窗口内每个 `(file, section)` 的真实读取与活性。
 *  数据源 = `access-real.jsonl`（真读埋点，字段 `t/f/s`）+ `activity.jsonl`（`hits/lastHit/status`）；
 *  两者都是**既有遥测**，本件不新建遥测。 */
/* ⚠ **读侧根必须是库根（bankRoot）**（2026-09-19 实测缺陷）：`access-real.jsonl`（harvest-access 增采）
 *   与 `activity.jsonl` 都在 **`<bank>/audit/`**，而 `kRoot/audit/` 放的是知识区台账/审计流。
 *   夹具曾把两者放 kRoot ⇒ 测试全绿而**真机影响账恒 0 行**（D 档「产出未获裁决」当场翻红）。
 *   ⇒ 本函数的入参从 kRoot 改为 bankRoot（**夹具随之改正**：夹具放错根 = 假绿）。 */
export function buildImpactRows(d: { bankRoot: string; untilMs: number; sinceMs: number }, limit = 3000): ImpactRow[] {
  const reads = new Map<string, number>()
  for (const r of parseRows(join(d.bankRoot, 'audit', 'access-real.jsonl'), limit)) {
    const t = Date.parse(String(r.t || ''))
    if (!Number.isFinite(t) || t < d.sinceMs || t > d.untilMs) continue
    const k = `${String(r.f || '')}|${String(r.s || '')}`
    reads.set(k, (reads.get(k) || 0) + 1)
  }
  const act = new Map<string, Record<string, unknown>>()
  for (const r of parseRows(join(d.bankRoot, 'audit', 'activity.jsonl'), limit)) act.set(String(r.key || `${r.f}|${r.s}`), r)
  const keys = new Set<string>([...reads.keys(), ...act.keys()])
  const rows: ImpactRow[] = []
  for (const k of keys) {
    const [file, section] = k.split('|')
    if (!file) continue
    const a = act.get(k)
    const realReads = reads.get(k) || 0
    const hits = a ? Number(a.hits || 0) : null
    rows.push({
      file, section, realReads, activityHits: hits,
      activityStatus: String(a?.status || 'unknown'),
      lastHitMs: a && Number.isFinite(Number(a.lastHit)) ? Number(a.lastHit) : null,
      injected: 'unknown',
      verdict: realReads > 0 || (hits || 0) > 0 ? 'keep' : 'unused-candidate',
    })
  }
  return rows.sort((x, y) => y.realReads - x.realReads || x.file.localeCompare(y.file))
}

/** 问题标记：**只用确定性证据**（真读/活性）；`suspect-recall` 与 `suspect-quality` 用**指针可解析性**分开。
 *
 *  G13 双字段（2026-09-19 补）：
 *   · `unusedAtFirstObservation` —— 该 (file,section) **第一次**被判 `unused-candidate` 的时刻
 *     （跨轮**继承**：先读既有问题流的同键最早一行；无 ⇒ 记本轮 `at`）⇒ 能回答"标记了多久"；
 *   · `stillUnused` —— 本轮**仍然**未被真读（本函数只处理 `unused-candidate`，故恒 `true`；字段存在的意义是
 *     **让后续轮次可写 false**，从而"已恢复"与"从未被标"可分辨 —— 那两个状态今天无法区分）。
 *  ⚠ 两字段**只增不改历史行**：状态迁移由**新行**表达（`state:'open'` → 后续行），不重写旧行。 */
export function issueRowsOf(memRoot: string, impact: ImpactRow[], at = new Date().toISOString(), kRoot?: string): IssueRow[] {
  const out: IssueRow[] = []
  const seen = kRoot ? firstObservedMap(kRoot) : new Map<string, string>()
  for (const r of impact) {
    if (r.verdict !== 'unused-candidate') continue
    const res = r.section ? resolveSection(memRoot, r.file.replace(/^notes\//, ''), r.section) : { state: 'missing' as const }
    const qualityOk = res.state === 'exists'
    out.push({
      tag: qualityOk ? 'suspect-recall' : 'suspect-quality',
      file: r.file, section: r.section,
      evidence: `realReads=${r.realReads} activityHits=${r.activityHits ?? 'n/a'} injected=${r.injected} pointer=${res.state}`,
      handled: 'not-handled',
      why: qualityOk
        ? '索引行/指针正常但从未被真读 ⇒ **归因指向注入/召回面**，不是记忆本身的问题（用户口径：只标记不处理）'
        : '指针不可解析 ⇒ 才可能是记忆质量问题（与上者分开计数）',
      unusedAtFirstObservation: seen.get(`${r.file}|${r.section}`) || at,
      stillUnused: true,
    })
  }
  return out
}
/** 既有问题流里的**首次观测时刻**（同 `file|section` 取最早一行；无 ⇒ 不建键）。 */
export function firstObservedMap(kRoot: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of parseRows(sleepIssuesStreamOf(kRoot), 2000)) {
    const key = `${String(r.file || '')}|${String(r.section || '')}`
    const t = String(r.unusedAtFirstObservation || r.at || '')
    if (!t) continue
    const cur = out.get(key)
    if (!cur || t < cur) out.set(key, t)
  }
  return out
}

/** 统计：**两个分母各自带口径**（会审计数纪律：禁写死数字、禁混分母）+ 单列 `injected-unknown`。
 *   · `rows` = 本窗影响账条数（**体积分母**：率的分母）
 *   · `producedToday` = 当日**产出条数**（G13 要求的第二个分母：`added`+`replaced` 的当日合计） */
export function statsOf(impact: ImpactRow[], issues: Array<Pick<IssueRow, 'tag'>>, produced = 0): Record<string, number> {
  const denom = impact.length
  const unused = impact.filter((r) => r.verdict === 'unused-candidate').length
  const suspect = issues.filter((i) => i.tag === 'suspect-recall' || i.tag === 'suspect-quality').length
  return {
    rows: denom,
    unused,
    unusedRate: denom ? Number((unused / denom).toFixed(3)) : 0,
    suspectRecall: issues.filter((i) => i.tag === 'suspect-recall').length,
    suspectQuality: issues.filter((i) => i.tag === 'suspect-quality').length,
    injectedUnknown: impact.filter((r) => r.injected === 'unknown').length,
    /** 当日产出条数（**第二个分母**；口径见 `buildReportSection` §5 的括注） */
    producedToday: Math.max(0, Number(produced) || 0),
    /** 标记数占当日产出的比例（**只在分母 > 0 时给值**；否则 0 —— 不给"无意义的 0%"） */
    suspectPerProduced: produced > 0 ? Number((suspect / produced).toFixed(3)) : 0,
  }
}

/** 汇报正文（**固定五段**）：区间 / 提存 / 压缩 / 问题标记 / 统计。 */
export function buildReportSection(i: SleepRoundInput, stats: Record<string, number>, issues: IssueRow[]): string {
  const ts = String(i.at).replace(/[:.]/g, '-')
  const lines: string[] = []
  lines.push(`\n## ${i.at} · 第 ${i.materials.segments} 段区间\n`)
  lines.push(`### 1. 区间\n- 起止：${new Date(i.sinceMs).toISOString()} → ${new Date(i.untilMs).toISOString()}\n- 材料：L1 产出 ${i.materials.segments} 段 · 未落地 ${i.materials.failures} 条\n`)
  lines.push(`### 2. 提存\n- 原则：新增 ${i.produced.added} · 替换 ${i.produced.replaced}${i.produceOff ? '（**本月按口径停产**：gate=produce-off）' : ''}\n- 画像：${i.produced.profiles} 行\n`)
  lines.push(`### 3. 压缩\n- 树操作 ${i.maintenance.tree} · 指针 ${i.maintenance.pointers} · 归档 ${i.maintenance.archived} · 保留 ${i.maintenance.kept}\n`)
  lines.push(`### 4. 问题标记（**只标记不处理**）\n`)
  if (!issues.length) lines.push('- 本轮无标记\n')
  for (const s of issues.slice(0, 20)) lines.push(`- \`${s.tag}\` ${s.file}${s.section ? ' §' + s.section : ''} · ${s.evidence} · **未处理**（${s.why}） · 首次标记 ${s.unusedAtFirstObservation} · ${s.stillUnused ? '**仍未真读**' : '已恢复真读'}\n`)
  lines.push(`\n### 5. 统计\n- 影响账 ${stats.rows} 条 · `+'`unused`'+` ${stats.unused}（率 ${stats.unusedRate}，**分母=本窗影响账 ${stats.rows} 条**）\n- \`suspect-recall\` ${stats.suspectRecall} / \`suspect-quality\` ${stats.suspectQuality}（**前者占比高 ⇒ 问题在召回面**）\n- 占**当日产出** ${stats.producedToday} 条的比例 ${stats.suspectPerProduced}（**第二个分母**：口径 = 分子本窗标记数 ÷ 分母当日 \`added\`+\`replaced\`；分母 0 ⇒ 记 0，不给"无意义的 0%"）\n- 注入口径不可判定 ${stats.injectedUnknown} 条（\`injected=unknown\`：步级遥测无法按条目归属，**不冒充判据**）\n`)
  lines.push(`\n<!-- round ${ts} -->\n`)
  return lines.join('')
}

/** 「最近成长」派生（`delta.md` 退役后的**注入源**）：三行方向级摘要。 */
export function derivationOf(i: SleepRoundInput, stats: Record<string, number>): string[] {
  const out = [`本轮提存 ${i.produced.added + i.produced.replaced} 条（原则/画像）`]
  if (i.maintenance.archived > 0) out.push(`压缩归档 ${i.maintenance.archived} 条（方向节点保留）`)
  if (stats.unused > 0) out.push(`标出 ${stats.unused} 条未被真读（疑似召回面 ${stats.suspectRecall} 条）`)
  return out.slice(0, 3)
}

/** **注入侧唯一入口**：从末条 `sleep-round` 行**复算**「最近成长」三行。
 *
 *  与报告正文**同函数**（`derivationOf`）⇒ 判据「**注入块 == 报告提存/压缩/统计段**」可**逐元素机检**
 *  （`scripts/test-sleep-report.mjs` 的 D 组；不是"文本非空"那种代理判据）。
 *  ⚠ **不读** `reports/sleep/*.md`：注入失效键跟**派生源**（本流），留存面每轮 append 增长**不代表内容变**。
 *  缺流/坏行/字段残缺 ⇒ `[]`（**失败开放**：报告缺失不得让注入中断或抛错）。 */
export function latestDerivation(d: { kRoot: string }): string[] {
  const rows = parseRows(sleepReportsStreamOf(d.kRoot), 400)
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r.kind !== 'sleep-round') continue
    const num = (k: string): number => Number(r[k] || 0)
    const input: SleepRoundInput = {
      at: String(r.at || ''), sinceMs: num('sinceMs'), untilMs: num('untilMs'), produceOff: r.produceOff === true,
      produced: { added: num('added'), replaced: num('replaced'), profiles: num('profiles') },
      maintenance: { tree: num('tree'), pointers: num('pointers'), archived: num('archived'), kept: num('kept') },
      materials: { segments: num('segments'), failures: num('failures') },
      impact: [],
    }
    const st = (r.stats || {}) as Record<string, unknown>
    return derivationOf(input, { unused: Number(st.unused || 0), suspectRecall: Number(st.suspectRecall || 0) })
  }
  return []
}

/** 从**台账末条 `deep-sleep` 行**装配本轮输入（**解耦**：不必把一轮的十几个字段穿过装配层，
 *  也避开 `runDeepSleep` 的函数跨度上限 399/400 —— 这是会审记下的"净减前置"约束下的务实解法）。 */
export function roundInputFromLedger(d: { kRoot: string; untilMs?: number }, fallbackDate = new Date().toISOString()): SleepRoundInput | null {
  const rows = parseRows(join(d.kRoot, 'audit', 'ledger.jsonl'), 4000)
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r.kind !== 'deep-sleep') continue
    const at = String(r.at || fallbackDate)
    const until = Number(d.untilMs || Date.parse(at) || Date.now())
    const sinceMs = Number(r.epochSince || 0) || until - 6 * 3600 * 1000
    return {
      at, sinceMs, untilMs: until,
      produceOff: String(r.gate || '') === 'produce-off' || Number(r.added || 0) === 0,
      produced: { added: Number(r.added || 0), replaced: Number(r.replaced || 0), profiles: Number(r.profiles || 0) },
      maintenance: {
        tree: Number(r.tree || 0), pointers: Number(r.pointers || 0),
        archived: Number(r.forgetArchived || 0), kept: Number(r.forgetKept || 0),
      },
      materials: { segments: Number(r.attempted || 0), failures: Number(r.rejected || 0) },
      impact: [],
    }
  }
  return null
}

/** 一轮睡眠结束后落汇报（**从台账末条装配**；影响账在窗口上聚合）。 */
export function writeSleepReportFromLedger(d: { kRoot: string; bankRoot: string; date: string }, untilMs?: number): { ok: boolean; reportFile?: string; issues?: number; reason?: string } {
  const input = roundInputFromLedger({ kRoot: d.kRoot, untilMs })
  if (!input) return { ok: false, reason: 'no-deep-sleep-round（尾读窗口 2MB/4000 行内未见 kind=deep-sleep —— 见 sleep-report#TAIL_MAX_BYTES 的口径说明）' }
  input.impact = buildImpactRows({ bankRoot: d.bankRoot, sinceMs: input.sinceMs, untilMs: input.untilMs })
  const r = writeSleepRound(d, input)
  return { ok: true, reportFile: r.reportFile, issues: r.issues }
}
export function writeSleepRound(
  d: { kRoot: string; bankRoot: string; date: string },
  input: SleepRoundInput,
): { reportFile: string; streamRow: boolean; issues: number; report: string; stats: Record<string, number>; ledger: FingerprintRow } {
  const impact = input.impact
  const produced = Number(input.produced.added || 0) + Number(input.produced.replaced || 0)
  const issues = issueRowsOf(d.bankRoot, impact, input.at, d.kRoot)
  const stats = statsOf(impact, issues, produced)
  const report = buildReportSection(input, stats, issues)
  const file = sleepReportPathOf(d.bankRoot, d.date)
  const existed = existsSync(file)
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, report, 'utf8') // 追加：**同日多轮不覆盖**（"永不删除"的落点）
  mkdirSync(join(d.kRoot, 'audit'), { recursive: true })
  appendFileSync(sleepReportsStreamOf(d.kRoot), JSON.stringify({ kind: 'sleep-round', at: input.at, sinceMs: input.sinceMs, untilMs: input.untilMs, produceOff: input.produceOff, ...input.produced, ...input.maintenance, materials: input.materials, stats, firstOfDay: !existed }) + '\n', 'utf8')
  for (const r of impact) appendFileSync(sleepReportsStreamOf(d.kRoot), JSON.stringify({ kind: 'impact', at: input.at, ...r }) + '\n', 'utf8')
  for (const s of issues) appendFileSync(sleepIssuesStreamOf(d.kRoot), JSON.stringify({ at: input.at, state: 'open', ...s }) + '\n', 'utf8')
  /* **指纹账**（G11 的"永不删除"判据载体 · 2026-09-19）：每轮对**整份报告文件**记一行
   * `{dateFile, sha256, bytes, lines, firstSeenAt, at, sections}`。
   *  为什么必须是**整文件**指纹而不是"本轮增量"：判据要拦的是「被覆盖 / 被截断」——
   *  只记增量的话，**覆盖写**（内容变了、行数没变）照样真的通过（本仓最典型的假绿形态）。
   *  三断言（`scripts/test-sleep-report.mjs` 第 5 组）：
   *   ① 账行数单调不减且增量 == 轮数；
   *   ② **前缀哈希**：账内每条 `sha256(当下文件[0..bytes)) == row.sha256` 且 `len ≥ bytes`
   *      （⚠ 实测修正：追加式文件的早期行**不可能**等于"整文件当下哈希"——只有前缀口径才既为真又可判，
   *      且它拦的正是"被覆盖 / 被截断"）；
   *   ③ 报告段数 == `sleep-reports.jsonl` 同轮值（逐值相等）。
   *  ⚠ 账本身**只增不改**（append-only）；它不参与注入、不进失效键。 */
  const ledger = fingerprintOf(file, d.date, input.at, firstSeenOf(d.kRoot, d.date + '.md') || input.at)
  appendFileSync(sleepLedgerStreamOf(d.kRoot), JSON.stringify(ledger) + '\n', 'utf8')
  return { reportFile: file, streamRow: true, issues: issues.length, report, stats, ledger }
}
