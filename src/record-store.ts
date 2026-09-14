/**
 * record-store.ts — Record 事实源模型（P4 存储解耦 · 方案档 docs/context-supply-plan.md §3.1/§10）
 *
 * 地位：P4 的**唯一事实源**形态。md（MEMORY/USER/AGENT + notes）降为**投影**——由 Record 渲染，
 *   逐字节可重现（前置闸 `scripts/record-export.mjs` 已证 100%）。
 *
 * 设计纪律（逐条对应仓内既有教训）：
 *   · **标签→类别不写第二份名单**：一律从 `criteria.generated.ts#CARRIERS`（注册表投影）派生。
 *     抄一份 P_TAGS/R_TAGS 就是「同一事实的第二份副本」，正是 ADR-130 明令禁止的漂移源。
 *   · **纯函数、零 I/O**：读写由调用方（CLI / 宿主）负责 ⇒ 可直接单测（教训：扇入高却零直接单测）。
 *   · **逐行保留各自行分隔符（eol）**：文件混用 CRLF/LF 也能字节级还原（否则切源即数据走形）。
 *   · **遗忘=状态迁移，不删除**（layer/lifecycle）：`active→cold→retired`，与 §9「生命周期」一致。
 *   · **主体是字段，不是文件名**：`subject` 承载 `user|agent|knowledge|companion:<id>`——新增主体零架构改动。
 */
import { CARRIERS } from './criteria.generated.js'

/** 载体注册表的标签表（`carriers.tags`）。**不在此处维护第二份标签名单**——层从注册表派生。 */
const CARRIER_TAGS = ((CARRIERS as unknown as { tags?: Record<string, { layer?: string }> }).tags) ?? {}

/** 记录类别（扩展点：新增一类只加常量，不动消费者）。
 * 2026-09-13（G1 内容环）：新增 `decision`/`outcome`/`valence` 三类——**Record 存得下 md 存不下的东西**，
 *   这正是 DS1「事实源↔投影解耦」的兑现：决策/后果/价态天然没有 md 投影（`file=''`）。
 *   新增 kind 必须同时登记环归属（`rings.ts#RING_OF_KIND`），否则 `check-ring-coverage` FAIL。 */
// ⚠ 2026-09-14（E9 清理）：删除 `'preference'` 与 `'principle'` 两个 **RecordKind 死词汇**。
//   判因（非印象）：`kindOfLine` 把 P 层标签**一律**派生为 `persona` ⇒ 这两个 kind **永不产出**
//   （实测库内 `principle=0` / `preference=0` ⇒ **无需迁移、无需对账**）；且 `'preference'` **零消费者**。
//   ⚠ **关键区分**（我最初误判过）：`criteria.ts#promoteVerdict('principle'|'path')` 与 `deepsleep-run.ts`
//   调用里的 `'principle'` 是**升格域字面量、不是 RecordKind**；`scripts/` 里的 `principles` 是**通道名**；
//   `panel` 契约里的 `principleRows` 是**UI 显示名** ⇒ **那些一处都不能动**。本次只删这两张表里的条目。
//   两者原属 value 环、与 `persona` 语义重叠（都走 P 层标签派生）⇒ 删除是**收敛**，不是丢功能。
export const KINDS = ['fact', 'procedure', 'persona', 'episode', 'decision', 'outcome', 'valence', 'relation', 'commitment', 'association', 'prose', 'structure', 'blank'] as const
export type RecordKind = (typeof KINDS)[number]

/** 生命周期（遗忘=迁移，不删除） */
export const LIFECYCLES = ['active', 'cold', 'retired'] as const
export type Lifecycle = (typeof LIFECYCLES)[number]

/** 基础主体；`companion:<id>` 由 `subjectIsCompanion` 判定，无需登记表 */
const BASE_SUBJECTS = ['user', 'agent', 'knowledge'] as const

/** md 投影文件 → 主体（新增主体=加一行，零架构改动） */
export const SUBJECT_OF_FILE: Readonly<Record<string, string>> = {
  'MEMORY.md': 'knowledge',
  'USER.md': 'user',
  'AGENT.md': 'agent',
}

/** 三索引投影文件（顺序即投影顺序） */
export const INDEX_FILES = ['MEMORY.md', 'USER.md', 'AGENT.md'] as const

export interface MemRecord {
  /** 内容指纹派生（`subject:kind:fp`）⇒ 天然去重 */
  id: string
  kind: RecordKind
  /** 主体（字段，不是文件名） */
  subject: string
  /** global / workspace:<path> / project:<name> */
  scope: string
  /** 原子正文（投影时原样拼回） */
  text: string
  /** 来源（会话 id + 事件序号 / notes 锚） */
  source: string
  /** 索引行标签（无标签=''） */
  tag: string
  /** 指针目标（notes/x.md §节） */
  pointer: string
  /** 投影归属文件 */
  file: string
  /** 投影顺序（同文件内按此稳定排序） */
  order: number
  /** 本行自己的行分隔符（逐字节还原的关键） */
  eol: string
  /** 环专属载荷（决策环：rationale/alternatives/predicted/decisionId/hit；价值环：valence/trigger）。
   * 通用槽位 ⇒ **新增一种内容类型不必再动 schema**（P4 验收「新增类型/主体零架构改动」的落地形态）。 */
  meta?: Record<string, string>
  /**
   * **双时间戳**（事实环时态失效，2026-09-13）：断言自何时成立 / 何时失效（空 = 未失效）。
   * 与 `lifecycle` **正交**：`lifecycle` 管「值不值得注入」（活性降级），`validTo` 管「还成不成立」（真伪失效）。
   * 二者混用会犯两类错——把"过时"当"不重要"，或把"不重要"当"不成立"。
   */
  validFrom?: string
  validTo?: string
  maturity: number
  lifecycle: Lifecycle
  hits: number
  lastHit: string
  createdAt: string
  updatedAt: string
}

/** 内容指纹（djb2 变体 → base36）：原文改一字即换 id ⇒ 视为新记录 */
export function fingerprint(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function subjectOfFile(file: string): string {
  const hit = SUBJECT_OF_FILE[file]
  if (hit) return hit
  // `notes/*.md`（2026-09-13 记录化新增的载体）：按**所属画像**归属，其余归 knowledge。
  //   规则而非逐文件枚举 ⇒ 未来新增 notes 文件自动有主体，不会掉进 'unknown'。
  //   （此前 notes 记录全落 `unknown`——而 `unknown` **不是合法主体**，`isValidSubject` 判否：
  //    这是我引入 notes 记录化时留下的质量缺口，本轮补上。）
  if (file.startsWith('notes/')) {
    if (file === 'notes/user.md') return 'user' // USER 画像的详情
    if (file === 'notes/agent.md') return 'agent' // AGENT 自我画像的详情
    return 'knowledge' // env/flows/lessons/tools/release/INDEX：MEMORY 知识索引背后的详情
  }
  return 'unknown'
}

export function subjectIsCompanion(subject: string): boolean {
  return /^companion:[^\s]+$/.test(subject)
}

export function isValidSubject(subject: string): boolean {
  return (BASE_SUBJECTS as readonly string[]).includes(subject) || subjectIsCompanion(subject)
}

export function isValidScope(scope: string): boolean {
  return scope === 'global' || /^(workspace|project):[^\s]+$/.test(scope)
}

/** 行首标签（`- [x]` 或 `[x]`） */
export function tagOfLine(line: string): string {
  const m = line.match(/^\s*-\s*\[([^\]]+)\]/) || line.match(/^\[([^\]]+)\]/)
  return m ? m[1] : ''
}

/** 指针目标（`→ notes/x.md §节`） */
export function pointerOfLine(line: string): string {
  const m = line.match(/→\s*(notes\/[\w.-]+\.md[^\s]*)/)
  return m ? m[1] : ''
}

/** 来源锚（`← 源: notes/x.md §节`） */
export function sourceOfLine(line: string): string {
  const m = line.match(/←\s*源:\s*([^\s]+(?:\s[^\s]+)?)/)
  return m ? m[1] : ''
}

/**
 * 行 → 类别。**层从注册表 CARRIERS 派生**（P=persona / R=procedure / 其余有标签=fact），
 * 不在此处维护第二份标签名单。
 */
export function kindOfLine(line: string, tag: string): RecordKind {
  if (!line.trim()) return 'blank'
  if (/^#{1,6}\s/.test(line) || /^>/.test(line) || /^<!--/.test(line)) return 'structure'
  const layer = tag ? CARRIER_TAGS[tag]?.layer : undefined
  if (layer === 'R') return 'procedure'
  if (layer === 'P') return 'persona'
  if (tag) return 'fact'
  return /^-\s/.test(line) ? 'prose' : 'fact'
}

/** 内容字段（不含 stats/时间戳）——id 与走形判定只认这些 */
export interface RecordInit {
  text: string
  file: string
  subject?: string
  scope?: string
  source?: string
  kind?: RecordKind
  tag?: string
  pointer?: string
  order?: number
  eol?: string
  maturity?: number
  lifecycle?: Lifecycle
  /** 显式 id 覆盖（环记录用：同文本但属不同决策的后果不得互相撞 id） */
  id?: string
  /** 环专属载荷（见 MemRecord.meta） */
  meta?: Record<string, string>
  /** 双时间戳（见 MemRecord.validFrom/validTo） */
  validFrom?: string
  validTo?: string
}

/** 由内容字段构造记录（id 派生；时间戳/stats 由调用方经 `stampRecord` 补） */
export function makeRecord(init: RecordInit): MemRecord {
  const file = init.file
  const subject = init.subject ?? subjectOfFile(file)
  const tag = init.tag ?? tagOfLine(init.text)
  const kind = init.kind ?? kindOfLine(init.text, tag)
  const pointer = init.pointer ?? pointerOfLine(init.text)
  const source = init.source ?? sourceOfLine(init.text)
  return {
    id: init.id ?? `${subject}:${kind}:${fingerprint(init.text)}`,
    kind,
    subject,
    scope: init.scope ?? 'global',
    text: init.text,
    source,
    tag,
    pointer,
    file,
    order: init.order ?? 0,
    eol: init.eol ?? '\n',
    maturity: init.maturity ?? 0,
    lifecycle: init.lifecycle ?? 'active',
    hits: 0,
    lastHit: '',
    createdAt: '',
    updatedAt: '',
    meta: init.meta,
    validFrom: init.validFrom,
    validTo: init.validTo,
  }
}

/** 逐行解析（**保留每行自己的分隔符**）⇒ 导出即原样拼回 */
export function parseRecords(raw: string, file: string, opts: { subject?: string; scope?: string } = {}): MemRecord[] {
  const parts = raw.split(/(\r?\n)/) // 交替：内容, 分隔符, 内容, 分隔符, …
  const out: MemRecord[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const text = parts[i]
    const eol = i + 1 < parts.length ? parts[i + 1] : ''
    if (text === '' && eol === '') continue // 末尾空段
    out.push(makeRecord({ text, file, eol, order: out.length, subject: opts.subject, scope: opts.scope }))
  }
  return out
}

/** 单文件投影（按 order 稳定排序后原样拼回） */
export function renderFile(records: readonly MemRecord[], file: string): string {
  return records
    .filter((r) => r.file === file)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((r) => r.text + r.eol)
    .join('')
}

/** 多文件投影（按 INDEX_FILES 顺序） */
export function renderAll(records: readonly MemRecord[], files: readonly string[] = INDEX_FILES): string {
  return files.map((f) => renderFile(records, f)).join('')
}

/** 记录集 → JSONL（事实源落盘形态：一行一记录，可 grep、可 diff、零依赖） */
export function serializeRecords(records: readonly MemRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '')
}

export function parseRecordStore(text: string): MemRecord[] {
  const out: MemRecord[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const r = JSON.parse(line) as MemRecord
    out.push(r)
  }
  return out
}

export interface RecordDiff {
  added: MemRecord[]
  removed: MemRecord[]
  changed: Array<{ id: string; from: MemRecord; to: MemRecord }>
}

/** 集合差分（按 id）。changed 只认**内容字段**变化，忽略 stats/时间戳噪声 */
export function diffRecords(prev: readonly MemRecord[], next: readonly MemRecord[]): RecordDiff {
  const a = new Map(prev.map((r) => [r.id, r]))
  const b = new Map(next.map((r) => [r.id, r]))
  const added: MemRecord[] = []
  const removed: MemRecord[] = []
  const changed: Array<{ id: string; from: MemRecord; to: MemRecord }> = []
  for (const [id, to] of b) {
    const from = a.get(id)
    if (!from) { added.push(to); continue }
    if (contentKey(from) !== contentKey(to)) changed.push({ id, from, to })
  }
  for (const [id, from] of a) if (!b.has(id)) removed.push(from)
  return { added, removed, changed }
}

/** 走形判定口径（内部）：只比内容字段，不比统计与时间戳 */
function contentKey(r: MemRecord): string {
  return [r.kind, r.subject, r.scope, r.text, r.source, r.tag, r.pointer, r.file, String(r.order), r.eol, r.lifecycle, JSON.stringify(r.meta ?? null), r.validFrom ?? '', r.validTo ?? ''].join('\u0000')
}

export type UpsertAction = 'added' | 'replaced' | 'unchanged'

/** 按 id 去重写入（事实源的天然去重，对应 §3.1「id 内容指纹派生」） */
export function upsertRecord(records: readonly MemRecord[], rec: MemRecord): { records: MemRecord[]; action: UpsertAction } {
  const i = records.findIndex((r) => r.id === rec.id)
  if (i < 0) return { records: [...records, rec], action: 'added' }
  const cur = records[i]
  if (contentKey(cur) === contentKey(rec)) return { records: records.slice(), action: 'unchanged' }
  const next = records.slice()
  next[i] = { ...rec, hits: cur.hits, lastHit: cur.lastHit, createdAt: cur.createdAt || rec.createdAt }
  return { records: next, action: 'replaced' }
}

/** 生命周期迁移（遗忘=迁移，不删除）；命中统计随供给侧写入 */
export function moveLifecycle(r: MemRecord, lifecycle: Lifecycle, at: string): MemRecord {
  return { ...r, lifecycle, updatedAt: at }
}

/** 命中记账（供给侧调用：hits/lastHit 是「被用过」的证据，不是猜测） */
export function noteHit(r: MemRecord, at: string): MemRecord {
  return { ...r, hits: r.hits + 1, lastHit: at, updatedAt: at }
}

/** 补时间戳（导入/新建时统一入口，避免各处自己写 new Date） */
export function stampRecord(r: MemRecord, at: string): MemRecord {
  return { ...r, createdAt: r.createdAt || at, updatedAt: at }
}

/** 校验（写门只守：类型合法 / 主体合法 / 来源可溯 / 指针不悬空由上层判） */
export function validateRecord(r: MemRecord): string[] {
  const errs: string[] = []
  if (!(KINDS as readonly string[]).includes(r.kind)) errs.push(`kind 非法: ${r.kind}`)
  if (!isValidSubject(r.subject) && r.subject !== 'unknown') errs.push(`subject 非法: ${r.subject}`)
  if (!isValidScope(r.scope)) errs.push(`scope 非法: ${r.scope}`)
  if (!(LIFECYCLES as readonly string[]).includes(r.lifecycle)) errs.push(`lifecycle 非法: ${r.lifecycle}`)
  if (typeof r.text !== 'string') errs.push('text 非字符串')
  if (!r.id) errs.push('id 空缺')
  return errs
}

export interface Inventory {
  records: number
  bytes: number
  byFile: Record<string, number>
  byKind: Record<string, number>
  bySubject: Record<string, number>
  byLifecycle: Record<string, number>
  byTag: Record<string, number>
  untagged: number
}

/** 清单统计（供面板/审计/迁移申报） */
export function inventoryOf(records: readonly MemRecord[]): Inventory {
  const inv: Inventory = { records: records.length, bytes: 0, byFile: {}, byKind: {}, bySubject: {}, byLifecycle: {}, byTag: {}, untagged: 0 }
  const bump = (o: Record<string, number>, k: string) => { o[k] = (o[k] || 0) + 1 }
  for (const r of records) {
    inv.bytes += r.text.length + r.eol.length
    bump(inv.byFile, r.file)
    bump(inv.byKind, r.kind)
    bump(inv.bySubject, r.subject)
    bump(inv.byLifecycle, r.lifecycle)
    if (r.tag) bump(inv.byTag, r.tag)
    else if (r.kind !== 'blank' && r.kind !== 'structure') inv.untagged++
  }
  return inv
}

/**
 * md → Record 全量导入（一次性迁移 + 对账用；不常驻——§10 单写向）。
 * `files` 为 { 文件名: 原文 }；返回记录集与逐文件往返结论。
 */
export function importFromMd(files: Readonly<Record<string, string>>, at: string, opts: { scope?: string } = {}): {
  records: MemRecord[]
  roundTrip: Record<string, boolean>
} {
  let records: MemRecord[] = []
  const roundTrip: Record<string, boolean> = {}
  for (const file of Object.keys(files)) {
    const parsed = parseRecords(files[file], file, { scope: opts.scope }).map((r) => stampRecord(r, at))
    roundTrip[file] = renderFile(parsed, file) === files[file]
    records = records.concat(parsed)
  }
  return { records, roundTrip }
}

/**
 * Record 集 → md 文件集合（投影；导出即事实源的一次渲染）。
 * 只渲染**文件内已有记录**，不凭空产生文件 ⇒ 投影与事实源一一对应。
 */
export function exportToMd(records: readonly MemRecord[], files: readonly string[] = INDEX_FILES): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of files) if (records.some((r) => r.file === f)) out[f] = renderFile(records, f)
  return out
}
