/**
 * record-shadow.ts — 宿主侧 Record 影子写（P4 双写期 · 方案档 docs/context-supply-plan.md §10）
 *
 * 地位：P4 双写期的**只读镜像**。Phase「双写」的定义是「Record 是事实源、md 是投影」，
 *   但**切换事实源是数据安全级动作**（§12 风险 2），故本模块先只做一件事：
 *   每次 md 成功写入后，把该 md **镜像**进 Record 存储，并逐字节验证「Record 导出 == md」。
 *   md 仍是这一段的事实源 ⇒ 本模块**绝不回写 md**（单写向，§10）。
 *
 * 设计纪律：
 *   · **零抛出**：任何异常都只进返回值，不影响主写入链路（与 supply-ledger 同规格）；
 *   · **原子落盘**：tmp + rename，半截文件不会成为"事实源"；
 *   · **镜像而非追加**：按文件整片替换（md 是该文件的事实源），避免影子库随时间走形累积；
 *   · 无开关时**不动作**（`storeMode==='md'` 缺省）——开关由 scheduler Config 提供，此处不猜默认。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { atomicWriteFile } from './section-rewrite.js'
import { join } from 'node:path'
import { INDEX_FILES, inventoryOf, parseRecords, parseRecordStore, renderFile, serializeRecords, stampRecord } from './record-store.js'
import type { Inventory, MemRecord } from './record-store.js'

/** 影子库落点（与 md 同根，隐藏目录；随记忆库一起 git 版本化） */
export const RECORD_DIR = '.records'
export const RECORD_FILE = 'records.jsonl'
/** **写时自证**计数落点（M3 · 2026-09-13）：状态表，非事件流；体积极小，随镜像低频重写 */
export const SHADOW_STATS_FILE = 'shadow-stats.json'

export interface ShadowStats {
  /** 镜像次数 */
  writes: number
  /** 其中"记录导出可逐字节还原 md"的次数 */
  verified: number
  /** **分歧次数**（不可还原）——切源的运行态放行门：必须为 0 */
  diverged: number
  lastAt: string
  lastFile: string
  lastDivergedAt: string
  lastDivergedFile: string
}

const EMPTY_STATS: ShadowStats = { writes: 0, verified: 0, diverged: 0, lastAt: '', lastFile: '', lastDivergedAt: '', lastDivergedFile: '' }

/** 计数落点路径 */
export function shadowStatsPath(root: string): string {
  return join(root, RECORD_DIR, SHADOW_STATS_FILE)
}

/** 读计数（缺席/损坏 ⇒ 全零，**不抛**） */
export function readShadowStats(root: string): ShadowStats {
  try {
    const p = shadowStatsPath(root)
    if (!existsSync(p)) return { ...EMPTY_STATS }
    const o = JSON.parse(readFileSync(p, 'utf8')) as Partial<ShadowStats>
    return { ...EMPTY_STATS, ...o }
  } catch { return { ...EMPTY_STATS } }
}

/**
 * 累加一次写时自证结果（best-effort · **零抛出**）。
 * 为什么落盘而不是只留内存：**"生产里到底有没有分歧过"必须能被事后核**（内存计数随进程消失），
 * 而它正是 M4/M5 切源的运行态依据 —— `diverged === 0` 才是"记录能还原 md"在生产上的证据。
 */
export function bumpShadowStats(root: string, at: string, file: string, roundTrip: boolean): void {
  try {
    const dir = join(root, RECORD_DIR)
    mkdirSync(dir, { recursive: true })
    const s = readShadowStats(root)
    const next: ShadowStats = {
      writes: s.writes + 1,
      verified: s.verified + (roundTrip ? 1 : 0),
      diverged: s.diverged + (roundTrip ? 0 : 1),
      lastAt: at, lastFile: file,
      lastDivergedAt: roundTrip ? s.lastDivergedAt : at,
      lastDivergedFile: roundTrip ? s.lastDivergedFile : file,
    }
    writeFileSync(shadowStatsPath(root), JSON.stringify(next, null, 2) + '\n', 'utf8')
  } catch { /* 计数失败绝不影响主流程 */ }
}

export interface MirrorResult {
  file: string
  ok: boolean
  records: number
  bytes: number
  /** Record 导出能否逐字节还原 md —— 双写期的核心判据 */
  roundTrip: boolean
  error?: string
}

export interface ParityRow {
  file: string
  present: boolean
  /** 影子库该文件投影 == md 原文 */
  ok: boolean
  mdBytes: number
  storeBytes: number
  reason?: string
}

export function recordStorePath(root: string): string {
  return join(root, RECORD_DIR, RECORD_FILE)
}

/** 读影子库（缺失/损坏 → 空集 + 原因，不抛） */
export function loadStore(root: string): { records: MemRecord[]; error?: string } {
  const f = recordStorePath(root)
  if (!existsSync(f)) return { records: [] }
  try { return { records: parseRecordStore(readFileSync(f, 'utf8')) } } catch (e) { return { records: [], error: String((e as Error).message).slice(0, 120) } }
}

/** 落盘记录集（环记录用：`file=''` 的记录不会被 mirrorFile 的按文件替换碰到） */
export function saveStoreRecords(root: string, records: readonly MemRecord[]): void {
  saveStore(root, records)
}

function saveStore(root: string, records: readonly MemRecord[]): void {
  const dir = join(root, RECORD_DIR)
  mkdirSync(dir, { recursive: true })
  const f = recordStorePath(root)
  // S2S3 册零：改走**唯一写入原语**（唯一 tmp 名 + 回读校验）；原固定名 `f + '.tmp'` 并发互踩。
  atomicWriteFile(f, serializeRecords(records))
}

/** 一个 md 文件 → Record 片（保留各自 eol ⇒ 可逐字节还原） */
export function parseMdFile(root: string, file: string, at: string): { records: MemRecord[]; raw: string } | null {
  const abs = join(root, file)
  if (!existsSync(abs)) return null
  try {
    const raw = readFileSync(abs, 'utf8')
    return { records: parseRecords(raw, file).map((r) => stampRecord(r, at)), raw }
  } catch { return null }
}

/**
 * **记忆载体清单**（2026-09-13 · `storeMode=record` 切源的前置）：索引三件 + `notes/*.md`。
 *
 * 为什么需要它：DS1 的「Record 事实源 **→** md 投影」要求**每个载体都得有记录表示**。
 *   实测（`check-record-parity --coverage`）：索引 **3/3** 有表示，而 **notes 0/8**（94.7KB 详情主体）
 *   ⇒ 彼时切源 = 「索引由 Record 权威 + 详情由 md 权威」的**双权威**，正是"合并"要消除的东西。
 *
 * 可行性**先实证后落地**：既有 `parseRecords` + `renderFile` 对 8 个 notes 文件**全部往返逐字节一致**
 *   （合计 789 行）——故本件只需把载体面**显式列全**，不需要新的解析/渲染逻辑。
 */
export function carrierFiles(root: string): string[] {
  const out: string[] = [...INDEX_FILES]
  try {
    const dir = join(root, 'notes')
    if (existsSync(dir)) for (const f of readdirSync(dir).sort()) if (f.endsWith('.md')) out.push(`notes/${f}`)
  } catch { /* 无 notes 目录 = 仅索引载体 */ }
  return out
}

/**
 * 镜像单个 md 文件进影子库（按文件整片替换）。
 * `storeMode==='md'` 时调用方不应调用本函数（无开关=不动作）。
 */
export function mirrorFile(root: string, file: string, at: string): MirrorResult {
  try {
    const parsed = parseMdFile(root, file, at)
    if (!parsed) return { file, ok: false, records: 0, bytes: 0, roundTrip: false, error: 'md 缺席' }
    const roundTrip = renderFile(parsed.records, file) === parsed.raw
    const { records: existing, error } = loadStore(root)
    if (error) return { file, ok: false, records: 0, bytes: parsed.raw.length, roundTrip, error: `影子库损坏：${error}` }
    const others = existing.filter((r) => r.file !== file)
    // **状态字段承接**（2026-09-13 修）：镜像会按文件整片替换记录，若直接用新解析的记录，
    //   该文件上累积的**状态**会被静默清零——命中统计（hits/lastHit）、活性（lifecycle）、成熟度、
    //   **双时间戳（validFrom/validTo）**全部丢失。实测风险：事实环标记"已失效"的断言，下次镜像就复活。
    //   承接口径：**内容以 md 为准**（text/eol/order/tag/pointer），**状态以既有记录为准**。
    const prevOf = new Map(existing.filter((r) => r.file === file).map((r) => [r.id, r]))
    const merged = parsed.records.map((r) => {
      const prev = prevOf.get(r.id)
      if (!prev) return r
      return {
        ...r,
        hits: prev.hits, lastHit: prev.lastHit, maturity: prev.maturity, lifecycle: prev.lifecycle,
        validFrom: prev.validFrom, validTo: prev.validTo,
        // `meta` 同样承接：它是**断言的属性**（前提 premise / 失效因由 staleNote / supersededBy），
        // 不在 md 正文里 ⇒ 不承接就会随镜像静默丢失（实测踩过：失效因由没了）。
        meta: prev.meta,
        createdAt: prev.createdAt || r.createdAt,
      }
    })
    const next = others.concat(merged)
    saveStore(root, next)
    // M3 写时自证（2026-09-13）：把"记录导出能否逐字节还原 md"累加落盘 ⇒ 切源有生产证据可依
    bumpShadowStats(root, at, file, roundTrip)
    return { file, ok: true, records: parsed.records.length, bytes: parsed.raw.length, roundTrip }
  } catch (e) {
    return { file, ok: false, records: 0, bytes: 0, roundTrip: false, error: String((e as Error).message).slice(0, 120) }
  }
}

/** 镜像全部三索引（一次性迁移 / 对账 / 自检用） */
export function mirrorAll(root: string, at: string, files: readonly string[] = INDEX_FILES): MirrorResult[] {
  const out: MirrorResult[] = []
  for (const f of files) if (existsSync(join(root, f))) out.push(mirrorFile(root, f, at))
  return out
}

/**
 * 对账：影子库投影 ⟷ md 原文（**双写期唯一判据**，§10「同一 Record 集导出 md 必须逐字节重现」）。
 * 只读，不写任何文件。
 */
export function parityOf(root: string, files: readonly string[] = INDEX_FILES): ParityRow[] {
  const { records, error } = loadStore(root)
  return files.map((f) => {
    const abs = join(root, f)
    const present = existsSync(abs)
    // 事实源损坏**优先**报出：投影缺席不能掩盖"影子库读不出来"这件事（否则损坏被静默通过）
    if (error) return { file: f, present, ok: false, mdBytes: 0, storeBytes: 0, reason: `影子库损坏：${error}` }
    if (!present) return { file: f, present: false, ok: true, mdBytes: 0, storeBytes: 0, reason: 'md 缺席（跳过）' }
    const raw = readFileSync(abs, 'utf8')
    const rendered = renderFile(records, f)
    return {
      file: f,
      present: true,
      ok: rendered === raw,
      mdBytes: raw.length,
      storeBytes: rendered.length,
      reason: rendered === raw ? undefined : '影子库投影与 md 不逐字节一致',
    }
  })
}

/** 影子库清单（供面板/审计申报；与供给无关，纯统计） */
export function shadowInventory(root: string): Inventory & { error?: string } {
  const { records, error } = loadStore(root)
  const inv = inventoryOf(records)
  return error ? { ...inv, error } : inv
}
