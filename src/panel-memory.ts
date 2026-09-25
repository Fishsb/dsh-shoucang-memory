/**
 * @dsh-external/shoucang-panel / memory — 记忆库只读展示领域。
 * 端点：GET /memory/overview · GET /memory/sections
 * 依赖窄传：3 个（route / suite / logger）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dshHome, knowledgeRoot, memoryLibRoot } from './targets.js'
// ADR-333 册零：容量计数**单一实现**（去空白口径；与写门/门脚本同源）。
import { capacityCharsOf } from './budget-override.js'
/* 册二（决议 D1）：归一核心名与小节解析**均取库内唯一实现**（与 `section-ref` 同源），
 * 不在本文件另写一份——「同一语义多份实现」正是根因 C1 本身。
 * ⚠ `resolveSectionSpec` 是**权威四态解析**（exists|ambiguous|missing|partial）：自写匹配必然与它分叉
 *   （施工实测：自写版得 117 partial / 7 missing，而权威口径 655 exists / 0 partial / 0 missing）。 */
import { coreName } from './treeops.js'
import { resolveSectionSpec, pointersOfRow } from './section-ref.js'
import { MATURATION } from './criteria.generated.js'
import { vecStats } from './vec.js'
import { nonEmptyLineCount, statSize } from './file-stat-cache.js'
import { readDistillAuditText } from './audit-source.js'
import { isLocalBase, sendJson, statMtime } from './panel-shared.js'
import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js'

export interface MemoryDeps {
  route: RouteFn
  suite: SuiteConfigAccess
  logger: PanelLogger
}

// ---- 板块只读接口（画像直接展示内容 / 记忆 Obsidian 仓库树与互链） ----

/* ---------- 记忆库（managing-memory 技能仓）实况只读展示（2026-09-06） ----------
 * F-003 重定义：面板「画像/记忆」视图不再读 Obsidian 仓库，改读蒸馏 watcher 的
 * 唯一事实源（`memoryLibRoot()`；2026-09-21 起 = `~/.dsh/suite/memory`，
 * 与 skill 装载面已解耦）。零硬编码路径：home = DSH_HOME || ~/.dsh。
 * 只读：不提供任何写入口（写/裁决归记忆插件）。 */

/* 册零（2026-09-19 载荷瘦身）：`raw`（逐行原文）与 `text`（整文件全文）**不进响应**。
 * 判因（实测）：前端全域 `.raw` **0 命中**、`indexes[].text` **0 命中**；而 MEMORY.md 的
 *   `text` 与 `lines[].raw` 去空白后**比值 1.00**（同一文件被装了两份）⇒ 总载荷 297,928 B
 *   中 indexes 占 **95.6%**，瘦身后 ≈115 KB（−61.3%）。
 * ⚠ 边界（不得连带删）：`charsOf(text)` 与 `parseIndexLines(text)` 仍需**读文件文本**，
 *   只是不再把它塞进响应；`lines` 的 tag/subject/pointer 三字段**一个都不能少** ——
 *   少一个会让 `panes-memory-detail.js:219` 静默显示「知识索引 0 条」（该处无空态守卫）。 */
export interface MemIndexEntry { tag: string; subject: string; pointer: string }

interface MemIndexFile { name: string; label: string; chars: number; cap: number; lines: MemIndexEntry[] }

const memoryHomeOf = (): string | null => {
  // 收口到单一事实源（2026-09-21）：旧址写死 `skills/managing-memory`，与 targets 的
  // `MEMORY_ROOT` 覆盖语义不一致 ⇒ 迁库时面板会读旧根、插件写新根（半迁移）。
  const base = memoryLibRoot()
  return existsSync(base) ? base : null
}

/* 守藏本地知识区（ADR-0002 阶段3 单飞切换后 = 蒸馏事实源宿主）：
 * $DSH_HOME/suite/knowledge —— 三索引 + notes 七类 + pending + audit，与记忆库同构。
 * 阶段4 UI 同步：panel 记忆视图双根（suite ∪ memory lib）+ 蒸馏统计卡（distill-audit.jsonl）。 */
const suiteHomeOf = (): string | null => {
  const base = join(dshHome(), 'suite', 'knowledge')
  return existsSync(base) ? base : null
}

/** 蒸馏统计卡聚合（suite/knowledge/audit/distill-audit.jsonl；全量汇总 + 尾部明细）。 */
const distillStatsOf = (): Record<string, unknown> | null => {
  const base = suiteHomeOf()
  if (!base) return null
  const full = join(base, 'audit', 'distill-audit.jsonl')
  let rows: Array<Record<string, unknown>> = []
  try {
    // DS4 第六刀（2026-09-13）：双源读（legacy ∪ 台账 audit.*）
    rows = readDistillAuditText(full).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) as Record<string, unknown> } catch { return null } }).filter((x): x is Record<string, unknown> => !!x)
  } catch { rows = [] }
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0)
  const byRoute: Record<string, number> = {}
  // 近 7 日按日聚合（sparkline 趋势数据源；含空日补齐，前端画平线即"无活动"）
  const dayMap = new Map<string, { runs: number; added: number }>()
  // S4Z（2026-09-14）改名：原叫 `dayKey`，与 `activity#dayKey`（**时间戳 → 本地日键**）**同名不同义**
  //   （此处是"ISO 串取前 10 字符"）。同名不同义会让读者以为同一个 ⇒ 改名消除歧义（由 `check-shared-fn` 抓到）。
  const isoDateOf = (iso: unknown): string => String(iso || '').slice(0, 10)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    dayMap.set(d, { runs: 0, added: 0 })
  }
  let runs = 0, added = 0, rejected = 0, failed = 0, gateRejects = 0, writeFails = 0
  let last: Record<string, unknown> | null = null
  /* ADR-333 册三（2026-09-22）：`gate-reject` **按 target 分组** + 记最近一次。
   * 判因（会议 user 席实证 · 「门拒计数采了但不显示」）：原实现只累一个总数 `gateRejects`
   *   ⇒ 与 `rejectRate` 同病 —— **总量看不出"哪个文件在堵"**（实测画像 167 次被摊进总数），
   *   且前端 `src-client/*` 对该字段**零命中**（采了没人看）。
   *   ⇒ 本处给出 `{ total, byTarget, lastAt, lastTarget, lastReason }`，前端在「运行观测」渲染。 */
  const gateByTarget: Record<string, number> = {}
  let gateLastAt = ''
  let gateLastTarget = ''
  let gateLastReason = ''
  for (const r of rows) {
    last = r
    if (r.kind === 'gate-reject') {
      gateRejects++
      const t = String(r.target || '(未标)')
      gateByTarget[t] = (gateByTarget[t] || 0) + 1
      const at = String(r.at || '')
      if (at >= gateLastAt) { gateLastAt = at; gateLastTarget = t; gateLastReason = String(r.reason || '').slice(0, 120) }
      continue
    }
    if (r.kind === 'write-fail') { writeFails++; failed++; continue }
    if (r.kind === 'distill-run') {
      runs++
      added += num(r.added); rejected += num(r.rejected); failed += num(r.failed)
      const route = String(r.route || 'unknown')
      byRoute[route] = (byRoute[route] || 0) + 1
      const k = isoDateOf(r.at)
      if (dayMap.has(k)) { const e = dayMap.get(k)!; e.runs++; e.added += num(r.added) }
    }
  }
  const byDay = Array.from(dayMap.entries()).map(([day, v]) => ({ day, ...v }))
  return {
    runs, added, rejected, failed,
    /* `gateRejects` 保留数值（既有消费方零迁移）；新增 `gateRejectsDetail` 供前端渲染明细。 */
    gateRejects,
    gateRejectsDetail: {
      total: gateRejects,
      byTarget: gateByTarget,
      lastAt: gateLastAt,
      lastTarget: gateLastTarget,
      lastReason: gateLastReason,
    },
    writeFails, byRoute, byDay, last, recent: rows.slice(-5),
  }
}

const MEM_INDEX_FILES: Array<{ file: string; label: string }> = [
  { file: 'MEMORY.md', label: '知识索引 MEMORY' },
  { file: 'USER.md', label: '用户画像 USER' },
  { file: 'AGENT.md', label: 'Agent 画像 AGENT（含 [原则] 习得原则与 [路径] 任务路径）' },
]

const NOTE_RELS = ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent', 'INDEX']

/* ══ 册五（2026-09-19 · 用户拍板 A：三档枚举）库内结构盘点 ══
 *
 * 判因：面板此前**只读** MEMORY/USER/AGENT.md + notes/ + pending/ + audit 两个 jsonl
 *   ⇒ 库根 27 条目里 engine/ scripts/ audit/ .records/ reports/ 维护文档族**六个板块无任何入口**
 *   （用户问「库内到底有哪些板块」时面板给不出答案——这正是本方案的起点）。
 *
 * **零硬编码红线**：目录名**一律 readdirSync 派生**，不写成常量清单
 *   （写常量 = 把库内结构硬编码进源码，目录漂移即 UI 漂移）。下面的白名单**只做分档归类**，
 *   且未登记的新条目**默认落「内容档」**（宁可多报也不静默丢——与 `renderIndexRows` 的
 *   「异常可见而不静默」同口径）。
 *
 * 三档语义（用户裁决）：
 *   · content  内容档 —— 承载知识/判据，进分区展开（notes/engine/docs/…）
 *   · tooling  工具态档 —— 编辑器/版本库状态（.git/.obsidian/.internal/…），**只报计数**
 *   · artifact 产物档 —— 可重建或运行产物（audit/.records/reports/scripts/*.jsonl），**只报计数**
 *     （把可重建产物当「内容」展示 = 噪音大于信息，故只给体量不展开条目）
 */
/* 工具态档 = 版本库/编辑器状态 + **库自身工具代码**（`scripts/`）——均非知识内容，只报计数。
 * 判因：`scripts/` 是库的工具代码（memory_write_gate / read_section 等），不承载知识，
 *   与 `.git` 同属「不该以内容形态展开」的一类（用户裁决：只报只读计数）。 */
const STRUCT_TOOLING = new Set(['.git', '.obsidian', '.internal', '.gitignore', 'scripts'])
/* 产物档 = **可重建的运行产物与暂存区**（用户裁决：「工具态与产物档只报只读计数」）。
 * ⚠ 用户裁决原话把 `audit` 列在**内容档**（「内容档进分区（notes/engine/audit 等承载内容的板块）」）
 *   ⇒ audit 是台账（承载判据/水位/审计事实），**归内容档**；此处只列运行产物与候选暂存区。 */
const STRUCT_ARTIFACT = new Set(['.records', 'reports', 'pending', 'pending-migrated-20260906'])

/** 递归目录体量（文件数 + 字节数）。
 *  ⚠ `countBytes=false` 用于**工具态档**：`.git` 递归后可达数十 MB，会把「库有多大」这个读数
 *    彻底污染（实测 .git 36MB vs 内容总计 ~1.3MB）⇒ 工具态**只报文件数，字节记 0**
 *    （与用户裁决「工具态只报只读计数」一致：不展开、也不参与体量口径）。 */
const dirSizeOf = (p: string, countBytes = true): { files: number; bytes: number } => {
  let files = 0, bytes = 0
  try {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, e.name)
      if (e.isDirectory()) { const s = dirSizeOf(full, countBytes); files += s.files; bytes += s.bytes }
      else { files++; if (countBytes) { try { bytes += statSize(full) } catch { /* 跳过不可读 */ } } }
    }
  } catch { /* 不可读目录按 0 计 */ }
  return { files, bytes }
}

/** 库内结构盘点（派生式；返回紧凑结构，供前端按档渲染）。 */
const libraryStructureOf = (base: string): { entries: Array<{ name: string; kind: 'content' | 'tooling' | 'artifact'; files: number; bytes: number; doc?: boolean }>; summary: { content: number; tooling: number; artifact: number } } => {
  const entries: Array<{ name: string; kind: 'content' | 'tooling' | 'artifact'; files: number; bytes: number; doc?: boolean }> = []
  let names: string[] = []
  try { names = readdirSync(base, { withFileTypes: true }).map((e) => e.name).sort() } catch { /* 库根不可读 */ }
  for (const name of names) {
    const full = join(base, name)
    let isDir = false
    try { isDir = readdirSync(full) !== undefined } catch { isDir = false }
    const kind: 'content' | 'tooling' | 'artifact' =
      STRUCT_TOOLING.has(name) ? 'tooling' : STRUCT_ARTIFACT.has(name) ? 'artifact' : 'content'
    if (isDir) {
      const s = dirSizeOf(full, kind !== 'tooling')
      entries.push({ name, kind, files: s.files, bytes: s.bytes })
    } else {
      let bytes = 0
      if (kind !== 'tooling') { try { bytes = statSize(full) } catch { /* 跳过 */ } }
      // 根级文档（.md / .json）标 doc=true：它们与目录同属「内容」但形态不同，前端可分区呈现
      entries.push({ name, kind, files: 1, bytes, doc: /\.(md|json|yml)$/i.test(name) })
    }
  }
  const summary = { content: 0, tooling: 0, artifact: 0 }
  for (const e of entries) summary[e.kind]++
  return { entries, summary }
}

/**
 * 容量上限单一事实源（2026-09-10 修复：与写门同源）。
 * 优先级：① ~/.dsh/suite/scheduler.json 的容量门 capAgent/capUser/capMemory（= write_gate 的 env SHOUCANG_CAP_*，
 * 面板改容量门后 UI 立即联动）；② engine/target-registry.json 静态 capacity（旧源兼容）；③ 内建默认画像 3000 / 记忆 5000。
 */
const memoryCaps = (d: MemoryDeps, base: string): Record<string, number> => {
  const out: Record<string, number> = { 'MEMORY.md': 5000, 'USER.md': 3000, 'AGENT.md': 3000 }
  // ② 旧源：target-registry 静态容量
  try {
    const reg = JSON.parse(readFileSync(join(base, 'engine', 'target-registry.json'), 'utf8')) as { targets?: { memory?: { capacity?: Record<string, number> } } }
    const cap = reg?.targets?.memory?.capacity
    if (cap) for (const k of Object.keys(cap)) out[k] = cap[k]
  } catch { /* 回退默认容量 */ }
  // ① 权威：容量门配置（与 write_gate env 同源）——覆盖静态值，保证 UI 与写门一致
  try {
    const s = d.suite.read() as Record<string, unknown>
    if (typeof s.capMemory === 'number' && s.capMemory > 0) out['MEMORY.md'] = s.capMemory
    if (typeof s.capUser === 'number' && s.capUser > 0) out['USER.md'] = s.capUser
    if (typeof s.capAgent === 'number' && s.capAgent > 0) out['AGENT.md'] = s.capAgent
  } catch { /* 配置不可读=用静态值 */ }
  return out
}

/** 索引行：`[标签] 主题 · 概况 → notes/x.md §小节`（只留三字段，`raw` 不进响应——见上方册零说明）
 *
 * ⚠ **行尾空白必须先剥（2026-09-24 真机缺陷 · 本件是仓内唯一未剥的解析点）**：
 *   `split(/\r?\n/)` 只吃掉**一个** `\r`；文件若带多枚行尾 CR（实测真库 MEMORY.md 曾
 *   597 行是 `\r\r\r\r` / 268 行是 `\r\r\r`），残留的 `\r` 会让正则**整行失配** ——
 *   因为 `.` 不匹配 `\r`、而 `$` 要求真行尾。后果不是报错，是**静默吞行**：
 *   实测 890 条只解析出 **21** 条（吞吐 2.4%）且面板无任何异常提示。
 *   ⇒ 与仓内同族口径（`targets#scanIndexRows` / `count-memory-lines.mjs` 均先 `trim`）
 *     保持一致：这里取 `trimEnd()` 而非 `trim()`，**只剥行尾**，保住 `^\[` 的
 *     「列首锚定」语义不变（不得因宽容行尾而顺带接受行首缩进的行）。
 *   回归守：`scripts/check-index-parse-cr.mjs`（含变异自证）。
 *   ⚠ **导出仅为可机检**（行为面判定必须能 import 求值，不能 grep 源码判绿）：
 *     这是本仓"数值/语义口径要有可复算实现"的既有纪律（同 `count-memory-lines` 的立件理由）。 */
export const parseIndexLines = (text: string): MemIndexEntry[] => {
  const out: MemIndexEntry[] = []
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trimEnd().match(/^\[([^\]]+)\]\s+(.+?)\s*→\s*(.+)$/)
    if (!m) continue
    out.push({ tag: m[1].trim(), subject: m[2].trim(), pointer: m[3].trim() })
  }
  return out
}

// ADR-333 册零：容量计数**单一实现**（原为内联同式；口径相同、行为不变，收口为消"第二份实现"）。
const charsOf = (text: string): number => capacityCharsOf(text)

const readIndexFile = (base: string, f: { file: string; label: string }, caps: Record<string, number>): MemIndexFile | null => {
  try {
    const text = readFileSync(join(base, f.file), 'utf8')
    return { name: f.file, label: f.label, chars: charsOf(text), cap: caps[f.file] ?? 3000, lines: parseIndexLines(text) }
  } catch { return null }
}

/** notes 文件小节清单（标题+起始行；不含正文，正文走 /memory/sections） */
const notesSectionIndex = (base: string): Array<{ rel: string; name: string; sections: Array<{ title: string; line: number }> }> => {
  const out: Array<{ rel: string; name: string; sections: Array<{ title: string; line: number }> }> = []
  for (const w of NOTE_RELS) {
    const full = join(base, 'notes', w + '.md')
    if (!existsSync(full)) continue
    const text = readFileSync(full, 'utf8')
    const sections: Array<{ title: string; line: number }> = []
    text.split(/\r?\n/).forEach((l, i) => { const m = l.match(/^##\s+(.+)$/); if (m) sections.push({ title: m[1].trim(), line: i + 1 }) })
    out.push({ rel: 'notes/' + w + '.md', name: w + '.md', sections })
  }
  return out
}

const readJsonlTail = (full: string, n: number): Array<Record<string, unknown>> => {
  try {
    return readFileSync(full, 'utf8').split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l) as Record<string, unknown> } catch { return null } }).filter((x): x is Record<string, unknown> => !!x)
  } catch { return [] }
}

// 记忆库总览（一次取回：索引+容量+pending+蒸馏水位+notes 小节索引；全部只读）
// 阶段4：双根同构读取（memory lib + suite/knowledge）+ 蒸馏统计卡聚合。
// 路线③ 月度成长聚合（纯读、零定时器）：审计按月汇总 + AGENT 画像现状快照（「人格在长」可见物 + 一致性度量载体）
const growthOf = (monthStr?: string): Record<string, unknown> => {
  const now = new Date()
  const month = monthStr || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const out: Record<string, unknown> = { month }
  let sleepPass = 0, principleAdded = 0, principleReplaced = 0, sleepSkipped = 0, profilesAdded = 0, sleepErr = 0
  let runs = 0, okRuns = 0, badRuns = 0, distSkip = 0
  const recentDeep: Array<Record<string, unknown>> = []
  try {
    // DS4 第六刀（2026-09-13）：双源读（legacy ∪ 台账 audit.*）
    for (const l of readDistillAuditText(join(knowledgeRoot(), 'audit', 'distill-audit.jsonl')).split('\n')) {
      if (!l.trim()) continue
      try {
        const o = JSON.parse(l) as Record<string, any>
        if (!String(o.at || '').startsWith(month)) continue
        const kind = o.kind
        if (kind === 'deep-sleep') {
          if (typeof o.stop === 'string') {
            sleepPass++
            principleAdded += Number(o.added) || 0
            principleReplaced += Number(o.replaced) || 0
            sleepSkipped += Number(o.skipped) || 0
            profilesAdded += Number(o.profiles) || 0
            if ((o.added || o.replaced || o.profiles)) recentDeep.push({ at: o.at, added: o.added, replaced: o.replaced, profiles: o.profiles, gate: o.gate })
          } else sleepErr++
        } else if (kind === 'distill-run' && typeof o.stop === 'string') {
          runs++
          if (o.stop === 'completed') okRuns++; else badRuns++
        } else if (kind === 'distill-skip') distSkip++
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 无审计=新装 */ }
  let tagRows = 0, principleRows = 0, pathRows = 0, agentChars = 0
  const base = memoryHomeOf()
  if (base) {
    try {
      const txt = readFileSync(join(base, 'AGENT.md'), 'utf8')
      agentChars = txt.replace(/\s/g, '').length
      for (const l of txt.split(/\r?\n/)) {
        const m = l.match(/^\[([^\] ]+)\]/)
        if (m) { tagRows++; if (m[1] === '原则') principleRows++; if (m[1] === '路径') pathRows++ }
      }
    } catch { /* */ }
  }
  return {
    month,
    sleep: { passes: sleepPass, principleAdded, replaced: principleReplaced, skipped: sleepSkipped, profilesAdded, errors: sleepErr },
    distill: { runs, ok: okRuns, bad: badRuns, skips: distSkip },
    now: { agentChars, tagRows, principleRows, pathRows },
    recentDeep: recentDeep.slice(-5),
  }
}

/* 册一（2026-09-19）：候选**按根分装**——根因 C2「root 是隐式常量、读写两侧各绑不同根」。
 * 判因（实测）：`pending` 原只读本根（memory 库），而真候选 9 条在 suite 根 ⇒ UI 显示
 *   「候选 0 条」却点不到那 9 条；写侧（/memory/approve）也只读 suite 根 ⇒ **读写不同源**。
 * 现：`pendingByRoot` 显式并列各根本地（memory / suite / flow-candidates），
 *   `pending` 保持**向后兼容**（= memory 根，旧消费方零改动）。 */
const pendingOfRoot = (base: string): { count: number; last24h: number; recent: Array<{ name: string; mtime: string }> } => {
  const out = { count: 0, last24h: 0, recent: [] as Array<{ name: string; mtime: string }> }
  try {
    const pendDir = join(base, 'pending')
    const nowMs = Date.now()
    const names = readdirSync(pendDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort((a, b) => statMtime(join(pendDir, b)).localeCompare(statMtime(join(pendDir, a))))
    out.count = names.length
    for (const n of names) {
      try { if (nowMs - new Date(statMtime(join(pendDir, n))).getTime() < 86400000) out.last24h++ } catch { /* 跳过 */ }
    }
    for (const n of names.slice(0, 8)) out.recent.push({ name: n, mtime: statMtime(join(pendDir, n)) })
  } catch { /* pending 缺失 */ }
  return out
}

/** flow-candidates 子区（待转正候选；蒸馏采集不递归，故与根 pending 分列） */
const flowCandidatesOf = (base: string): { count: number; recent: Array<{ name: string; mtime: string }> } => {
  const out = { count: 0, recent: [] as Array<{ name: string; mtime: string }> }
  try {
    const dir = join(base, 'pending', 'flow-candidates')
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort((a, b) => statMtime(join(dir, b)).localeCompare(statMtime(join(dir, a))))
    out.count = names.length
    for (const n of names.slice(0, 8)) out.recent.push({ name: n, mtime: statMtime(join(dir, n)) })
  } catch { /* 无该子区 */ }
  return out
}

const memOverviewOf = (d: MemoryDeps, base: string): Record<string, unknown> => {
  const caps = memoryCaps(d, base)
  const indexes = MEM_INDEX_FILES.map((f) => readIndexFile(base, f, caps)).filter(Boolean) as MemIndexFile[]
  const pend = pendingOfRoot(base)
  const flow = flowCandidatesOf(base)
  const watermark = readJsonlTail(join(base, 'audit', 'distill-watermark.jsonl'), 5)
  return {
    root: base,
    indexes,
    pending: { count: pend.count, last24h: pend.last24h, recent: pend.recent },
    flowCandidates: flow,
    distill: { recent: watermark, last: watermark[watermark.length - 1] ?? null },
    notes: notesSectionIndex(base),
  }
}

function memoryOverviewRoute(d: MemoryDeps, _req: IncomingMessage, res: ServerResponse): void {
  const base = memoryHomeOf()
  if (!base) return sendJson(res, 200, { present: false, error: '未检测到记忆库根（<DSH_HOME>/suite/memory，可用 MEMORY_ROOT 覆盖）——记忆插件蒸馏事实源不在本机默认位' })
  try {
    const mem = memOverviewOf(d, base)
    const suiteBase = suiteHomeOf()
    const suite = suiteBase ? memOverviewOf(d, suiteBase) : null
    const undone = (() => { try {
      return readFileSync(join(base, 'audit', 'archive-progress.jsonl'), 'utf8').split('\n')
        .filter((l) => { try { return l.trim() && (JSON.parse(l) as { done?: boolean }).done === false } catch { return false } })
        .length
    } catch { return 0 } })()
    // U3：delta（晨起摘要，结构版）——读 suite/knowledge/delta.md
    const delta = ((): { present: boolean; staleAt?: string; rows?: string[]; injections?: number } => {
      try {
        const f = join(knowledgeRoot(), 'delta.md')
        if (!existsSync(f)) return { present: false }
        const o = JSON.parse(readFileSync(f, 'utf8')) as { staleAt?: string; rows?: string[]; injections?: number }
        return { present: true, staleAt: o.staleAt, rows: (o.rows || []).slice(0, 3), injections: o.injections || 0 }
      } catch { return { present: false } }
    })()
    // U3：向量简态（复用 status2 同源计算；供记忆板块 §7 展示，省一次轮询）
    const vectorMini = ((): { enabled: boolean; provider: string; cacheLines: number } => {
      try {
        const p = d.suite.read() as Record<string, unknown>
        const enabled = p.embedEnabled === false ? false : true
        const baseUrl = String((p as { embedBaseUrl?: unknown }).embedBaseUrl || 'http://127.0.0.1:11434/v1')
        let provider = enabled ? 'cloud' : 'off'
        let cacheLines = 0
        /* 2026-09-17（D-I5）：同 `/vector/status2` —— 原为全量读 10MB 取行数，改走 (mtimeMs,size) 缓存。 */
        try { const f = join(knowledgeRoot(), '.vector-cache.jsonl'); if (existsSync(f)) cacheLines = Math.max(0, nonEmptyLineCount(f)) } catch { /* */ }
        if (enabled && isLocalBase(baseUrl)) provider = vecStats.queries ? (vecStats.lastMode === 'fusion' ? 'fusion' : 'lexical') : 'gpu-ready'
        return { enabled, provider, cacheLines }
      } catch { return { enabled: false, provider: 'off', cacheLines: 0 } }
    })()
    // U3：周 diff（成长增量）——从 distill-audit 聚合近 7 天 [原则]/[路径] 落点（episodes + audit）
    const weekDiff = ((): { added: string[]; removed: string[]; deepAdded: number } => {
      const added: string[] = [], removed: string[] = []
      let deepAdded = 0
      try {
        const since = Date.now() - 7 * 86400e3
        const f = join(knowledgeRoot(), 'audit', 'distill-audit.jsonl')
        {
          // DS4 第六刀（2026-09-13）：双源读（legacy ∪ 台账 audit.*）——`if (existsSync(f))` 已并入读者器
          for (const l of readDistillAuditText(f).split('\n')) {
            if (!l.trim()) continue
            try {
              const o = JSON.parse(l) as { at?: string; kind?: string; added?: number }
              if (o.at && Date.parse(o.at) >= since) {
                if (o.kind === 'deep-sleep' && o.added) deepAdded += Number(o.added) || 0
              }
            } catch { /* 坏行 */ }
          }
        }
      } catch { /* 无审计 */ }
      return { added, removed, deepAdded }
    })()
    /* v9 第五轮 · 画像页「成熟度分布」的唯一数据源（此前前端只有形态、5 根柱恒 0 ⇒ 视觉等于坏图）。
     * 来源：**库内** audit/maturation.jsonl（与 deepsleep-apply 同一台账，一行一小节，A ∈ [0,1]）。
     * 口径（卡内如实标注）：A 按 0.2 五档计数 = **小节数**（台账每节一行），不是"命中次数"；
     * gate 为判据库升格阈值（criteria.maturation.gate，单一真源），供前端画升格线。 */
    const maturity = ((): { bins: number[]; total: number; gate: number } => {
      const bins = [0, 0, 0, 0, 0]
      let total = 0
      try {
        const f = join(base, 'audit', 'maturation.jsonl')
        if (existsSync(f)) {
          for (const l of readFileSync(f, 'utf8').split('\n')) {
            if (!l.trim()) continue
            try {
              const a = Number((JSON.parse(l) as { A?: unknown }).A)
              if (!Number.isFinite(a)) continue
              bins[Math.min(4, Math.max(0, Math.floor(a / 0.2)))]++
              total++
            } catch { /* 坏行 */ }
          }
        }
      } catch { /* 无台账：全 0（前端显示"未生成"，不假装有数据） */ }
      return { bins, total, gate: Number(MATURATION.gate ?? 0.5) }
    })()
    sendJson(res, 200, {
      present: true,
      ...mem,
      // 蒸馏唯一权归守藏（ADR-0002 阶段3）：水位语义 = suite 活水位（记忆库根 watermark 已冻结为历史值）
      distill: suite ? suite.distill : mem.distill,
      queue: { undone },
      suite: suite ? { present: true, ...suite } : { present: false },
      distillStats: distillStatsOf(),
      growth: growthOf(),
      delta,
      /* 册五：库内结构三档枚举（派生式 · 只读）——补全 engine/scripts/audit/.records/reports 等
       * 此前面板不可见的板块。「什么存在」由后端派生，前端只渲染（与决议 D1 同一原则）。 */
      structure: libraryStructureOf(base),
      vector: vectorMini,
      weekDiff,
      maturity,
      now: new Date().toISOString(),
    })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

function memorySectionsRoute(d: MemoryDeps, req: IncomingMessage, res: ServerResponse): void {
  let rootParam = ''
  let rel = ''
  try {
    const sp = new URL(req.url ?? '/', 'http://dsh.local').searchParams
    rel = sp.get('rel') ?? ''
    rootParam = sp.get('root') ?? 'memory'
  } catch { /* noop */ }
  // 阶段4 双根：root=suite → 守藏本地知识区；root=memory（缺省）→ 记忆库
  const base = rootParam === 'suite' ? suiteHomeOf() : memoryHomeOf()
  if (!base) return sendJson(res, 200, { present: false, error: rootParam === 'suite' ? '未检测到守藏本地知识区（~/.dsh/suite/knowledge）' : '未检测到记忆库技能仓' })
  if (!new RegExp(`^notes/(${NOTE_RELS.join('|')})\\.md$`).test(rel)) return sendJson(res, 400, { error: 'bad rel' })
  const abs = join(base, rel)
  if (!existsSync(abs)) return sendJson(res, 404, { error: 'note not found' })
  try {
    const text = readFileSync(abs, 'utf8')
    /* 册二（2026-09-19 · 决议 D1）：**小节的权威解析态与折叠键由后端下发**，前端只渲染。
     *
     * 判因（实测，根因 C1「同一语义三份实现 + 门禁只守库侧」）：
     *   前端 `panes-memory.js:42` 原用 `head.textContent.indexOf(autoSection) !== -1` 做**子串包含**匹配，
     *   而库侧权威语义是「归一核心名 + 双向包含 + 多命中 ⇒ ambiguous」（`section-ref.ts:170-192`）。
     *   实测（623 行索引行 / firstSeg 口径）：**多命中 209（33.8%）**——点一次展开**多个**同名/包含节点，
     *   且 `src-client/*.js` 全域 `scrollIntoView` **0 命中** ⇒ 用户看到「点了没反应」。
     * 现：每条小节带 `foldKey`（`data-fold-key` 的值，单一构造点）与 `core`（归一核心名），
     *   前端按 `foldKey` 精确置位（不再自己做匹配），并按解析结果滚动入视口。
     * ⚠ 与库侧同源：`coreName` 取自 `treeops.ts`（库内唯一归一实现），不在此另写一份。 */
    interface SecNode { title: string; line: number; body: string; children: SecNode[]; titleLevel: number; foldKey: string; core: string }
    const lines = text.split(/\r?\n/)
    const sections: SecNode[] = []
    const stack: Array<{ node: SecNode; body: string[] }> = []
    const heading = (l: string): { level: number; title: string } | null => {
      const m = l.match(/^(#{1,6})\s+(.+)$/)
      return m ? { level: m[1].length, title: m[2].trim() } : null
    }
    const flush = (): void => {
      while (stack.length) {
        const top = stack.pop()!
        top.node.body = top.body.join('\n').trim()
        if (stack.length) stack[stack.length - 1].node.children.push(top.node)
        else sections.push(top.node)
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const h = heading(lines[i])
      if (h && h.level >= 2) { // 记忆小节从 ## 起（# 是文件标题）
        // 弹栈到父层级（level-1 的标题）
        while (stack.length && stack[stack.length - 1].node.titleLevel >= h.level) {
          const top = stack.pop()!
          top.node.body = top.body.join('\n').trim()
          if (stack.length) stack[stack.length - 1].node.children.push(top.node)
          else sections.push(top.node)
        }
        const node: SecNode = { title: h.title, titleLevel: h.level, line: i + 1, body: '', children: [], foldKey: '', core: '' }
        stack.push({ node, body: [] })
      } else if (stack.length) {
        stack[stack.length - 1].body.push(lines[i])
      }
    }
    flush()
    /* 后序补 foldKey/core：折叠键 = `note:<rel>:<父路径>/…§<标题>`，与前端 `secFoldKey` **同式**
     * （此处是唯一构造点；前端同式函数由 `check-shared-fn` 与判据守，改动须双改）。 */
    const fillKeys = (list: SecNode[], path: string): void => {
      for (const s of list) {
        s.core = coreName(s.title)
        s.foldKey = `note:${rel}:${path}§${s.title}`
        if (s.children.length) fillKeys(s.children, (path ? path + '/' : '') + s.title)
      }
    }
    fillKeys(sections, '')
    // U3：反链聚合（Logseq/思源借鉴）——扫三索引 + notes 全文，找指向「本文件 §小节」的引用行
    const backrefs: Array<{ from: string; line: string }> = []
    try {
      const relStem = rel.replace(/^notes\//, '').replace(/\.md$/, '')
      const scanFiles = ['MEMORY.md', 'USER.md', 'AGENT.md', ...NOTE_RELS.filter((w) => w !== 'INDEX').map((w) => `notes/${w}.md`)]
      const sectionTitles = new Set(sections.map((s) => s.title.replace(/\s*（20\d{2}.*）\s*$/, '').trim()))
      for (const sf of scanFiles) {
        const sfAbs = join(base, sf)
        if (!existsSync(sfAbs) || sfAbs === abs) continue
        const raw = readFileSync(sfAbs, 'utf8')
        for (const l of raw.split(/\r?\n/)) {
          const t = l.trim()
          if (!/notes\/[A-Za-z0-9_-]+\.md\s*§/.test(t)) continue
          // 指向本文件？
          if (!t.includes(`notes/${relStem}.md`) && !t.includes(relStem + '.md')) continue
          const cited = (t.match(/notes\/[A-Za-z0-9_-]+\.md\s*§(.+)$/) || [])[1] || ''
          const hits = cited.split('/').some((s) => { const kw = s.replace(/^§/, '').trim(); if (!kw) return false; const tl = kw; return [...sectionTitles].some((st) => st === tl || st.includes(tl) || tl.includes(st)) })
          if (hits || !cited) backrefs.push({ from: sf.replace(/\.md$/, ''), line: t.slice(0, 120) })
        }
      }
    } catch { /* 反链扫描失败不阻塞正文 */ }
    /* 册二（决议 D1）**核心交付**：为本文件涉及的每条 `§指针` 做**权威解析**并随响应下发
     * `resolveState` + 目标折叠键，前端**只消费结果、不再自行匹配**。
     *
     * 判因（会议实测）：前端原用 `head.textContent.indexOf(autoSection)` 子串包含匹配，与库侧
     *   权威三态（归一核心名 + 双向包含 + 多命中 ⇒ ambiguous，见 `section-ref.ts:170-192`）不同源
     *   ⇒ 623 行索引行中**多命中 209 处（33.8%）**「点一次展开一堆且不滚到位置」。
     * ⚠ **本处必须调用 `resolveSectionSpec`（库内唯一实现）**，不得自写匹配——首版我自写了一份
     *   逐段收窄逻辑，实测与权威结论不符（自算 117 partial / 7 missing，而 `check-section-refs`
     *   权威口径为 655 exists / 0 partial / 0 missing）⇒ 那正是「第五份实现」，已废弃。
     * 形态：`{ [指针spec]: { state, foldKey, title, cands? } }`——state ∈ exists|ambiguous|missing|partial。
     * 折叠键由 `parts` 的解析结果（真实标题）在**本文件小节集合**里查得（单一构造点 `fillKeys`）。 */
    const pointerIndex: Record<string, { resolveState: string; foldKey: string; title: string; cands?: string[] }> = (() => {
      const out: Record<string, { resolveState: string; foldKey: string; title: string; cands?: string[] }> = {}
      const relStem2 = rel.replace(/^notes\//, '').replace(/\.md$/, '')
      /* 标题（原文）→ 折叠键：由后端 `fillKeys` 生成的**唯一键源**反查 */
      const keyByTitle = new Map<string, string>()
      const walkKeys = (list: SecNode[]): void => {
        for (const s of list) { keyByTitle.set(s.title, s.foldKey); if (s.children.length) walkKeys(s.children) }
      }
      walkKeys(sections)
      const scan = ['MEMORY.md', 'USER.md', 'AGENT.md', ...NOTE_RELS.filter((w) => w !== 'INDEX').map((w) => `notes/${w}.md`)]
      for (const sf of scan) {
        const sfAbs = join(base, sf)
        if (!existsSync(sfAbs)) continue
        let raw = ''
        try { raw = readFileSync(sfAbs, 'utf8') } catch { continue }
        for (const l of raw.split(/\r?\n/)) {
          /* ★ 行解析也走**权威实现** `pointersOfRow`（一行可含多个指针、正确处理 `§A/§B` 并列）。
           * ⚠ 首版此处自写正则 `/notes\/…\.md\s*§(.+)$/` ⇒ **贪婪捕获到行尾**，把后续指针文本
           *   并进了 spec（实测产出 10 条假 `partial`，形态如 `…/notes/lessons.md §假绿与实`），
           *   与 `check-section-refs` 的权威口径（655 exists / 0 partial）分叉 ⇒ 已换成权威解析器。 */
          for (const p of pointersOfRow(l)) {
            if (p.file !== relStem2 + '.md') continue
            const spec = p.spec.trim()
            if (!spec || out[spec]) continue
            /* ★ 权威四态解析（库内唯一实现） */
            const { agg, parts } = resolveSectionSpec(base, p.file, spec)
            /* 取「最深可解析段」的真实标题 → 折叠键（读侧 `partial` 回落最深段，与库侧一致） */
            let title = ''
            for (let i = parts.length - 1; i >= 0; i--) { if (parts[i].res.state === 'exists') { title = parts[i].res.cands[0]?.title ?? ''; break } }
            const candsOf = (): string[] => {
              const amb = parts.find((q) => q.res.state === 'ambiguous')
              return amb ? amb.res.cands.map((c) => c.title) : []
            }
            out[spec] = {
              resolveState: agg,
              foldKey: agg === 'exists' || agg === 'partial' ? (keyByTitle.get(title) || '') : '',
              title,
              ...(agg === 'ambiguous' ? { cands: candsOf() } : {}),
            }
          }
        }
      }
      return out
    })()
    sendJson(res, 200, { present: true, root: rootParam, rel, name: rel.split('/').pop() ?? '', text, sections, backrefs: backrefs.slice(0, 20), pointerIndex })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

export function registerMemoryRoutes(d: MemoryDeps): void {
  d.route('/memory/overview', (req, res) => memoryOverviewRoute(d, req, res))
  d.route('/memory/sections', (req, res) => memorySectionsRoute(d, req, res))
}
