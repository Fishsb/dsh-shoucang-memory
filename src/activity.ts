/**
 * activity.ts — v7 条目活性聚合（2026-09-10，方案 docs/memory-activity-model.md §6-7 A 步）。
 *
 * 借鉴来源（不从零造轮子）：Mem0 Memory Decay（活性随使用增、随时间衰减）＋ ACT-R base-level activation
 * 幂律衰减借形（久不用指数性衰退）；FSRS review-强化语义=一次命中=一次使用事件。本项目适配：
 * 树状文件记忆（MEMORY/USER/AGENT 索引行 → notes §小节），活性按「小节」维度聚合（同小节多条索引行共享活性，
 * 正对用户"同事实多份"噪音——小节级召回排序可据此降权/提权）。
 *
 * v1（A 步）只做：命中聚合 + ACT-R 式活性重算 + 状态迁移（active/warm/cold）+ 遗忘候选清单产出。
 * 不做任何删除/修改记忆正文；INDEX.md 人工注册表不动（活性为派生数据，存 audit/activity.jsonl 机读文件，
 * 遵循"运行时与维护信息分离"——索引行/人工表不承载机器计数）。
 *
 * 阈值初值（开放参数，见方案 §8）：active <14 天无命中 → warm；warm 再 30 天无命中 → cold；
 * cold 且（0 命中 或 最近命中 >90 天）→ archive 候选（清单供审计/人工确认，绝不自动删）。
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface ActivityHooks {
  audit(o: Record<string, unknown>): void
  log(msg: string): void
}

export interface ActivityRow {
  key: string // `${f}|${s}`
  f: string // notes/env.md 等（含 notes/ 前缀与 .md）
  s: string // 小节名（锚，来自索引指针 §/access.log s）
  hits: number // 当前 access.log 窗口内命中数
  lastHit: number | null // 最近命中 ms；null=从未命中
  firstSeen: number // 本行首次纳入跟踪时间 ms
  status: 'active' | 'warm' | 'cold'
}

const DAY = 86400_000
// 阈值初值（方案 §8，待影子/审计数据校准）
const WARM_DAYS = 14
const COLD_DAYS = 44 // 14+30
const ARCHIVE_NO_HIT_DAYS = 90

function dayKey(d: number): string {
  const x = new Date(d)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}

function loadRows(file: string): Map<string, ActivityRow> {
  const map = new Map<string, ActivityRow>()
  try {
    for (const l of readFileSync(file, 'utf8').split('\n')) {
      if (!l.trim()) continue
      try {
        const o = JSON.parse(l) as ActivityRow
        if (o && o.key) map.set(o.key, o)
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 无文件=全新 */ }
  return map
}

function saveRows(file: string, rows: Map<string, ActivityRow>): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    const out = [...rows.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n'
    writeFileSync(tmp, out, 'utf8')
    renameSync(tmp, file) // 原子替换（与记忆库落盘纪律一致）
  } catch { /* 落盘失败静默（派生数据可重建） */ }
}

/**
 * 活性聚合（v1）：只读 access.log + 索引指针 §锚 建立条目宇宙 → 命中计数 → ACT-R 式状态迁移 → 遗忘候选清单。
 * 纯本地、零 LLM、零删除；任何失败只降级（跳过该文件），绝不抛出。
 */
export async function activityAggregate(memRoot: string, hooks: ActivityHooks): Promise<void> {
  const { audit, log } = hooks
  const now = Date.now()
  const auditDir = join(memRoot, 'audit')
  const actFile = join(auditDir, 'activity.jsonl')
  try {
    mkdirSync(auditDir, { recursive: true })

    // 1) 条目宇宙 = 三索引指针 §锚 去重（同小节多条索引行共享一个 activity 行——锚定"事实小节"而非"行"）
    const topics = new Map<string, { f: string; s: string }>()
    for (const idx of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
      let raw = ''
      try { raw = readFileSync(join(memRoot, idx), 'utf8') } catch { continue }
      for (const l of raw.split(/\r?\n/)) {
        const m = l.match(/→\s*(notes\/[A-Za-z0-9_-]+\.md)\s*§(.+)$/)
        if (!m) continue
        const f = m[1]
        const s = m[2].trim().split(/\s*\/\s*/)[0].replace(/^§+/, '') // 去并列/去 § 前缀，取首个锚
        if (!f || !s || s === 'INDEX.md') continue
        const key = `${f}|${s}`
        if (!topics.has(key)) topics.set(key, { f, s })
      }
    }

    // 2) access.log 命中聚合（t=ISO 时间 / f=notes/xx.md / s=小节名）
    const hitsBy = new Map<string, { n: number; last: number }>()
    const logFile = join(auditDir, 'access.log')
    if (existsSync(logFile)) {
      try {
        for (const l of readFileSync(logFile, 'utf8').split('\n')) {
          if (!l.trim()) continue
          try {
            const o = JSON.parse(l) as { t?: string; f?: string; s?: string }
            if (!o.t || !o.f || !o.s) continue
            const f = o.f.startsWith('notes/') ? o.f : 'notes/' + o.f
            const s = String(o.s).trim()
            if (!f.endsWith('.md') || !s) continue
            const key = `${f}|${s}`
            const at = Date.parse(o.t)
            if (!Number.isFinite(at)) continue
            const cur = hitsBy.get(key) || { n: 0, last: 0 }
            cur.n++
            if (at > cur.last) cur.last = at
            hitsBy.set(key, cur)
          } catch { /* 坏行跳过 */ }
        }
      } catch { /* access.log 读失败=按零命中 */ }
    }

    // 3) 合并既有状态（activity.jsonl 持久 firstSeen），写入新聚合
    const rows = loadRows(actFile)
    for (const [key, tp] of topics) {
      const prev = rows.get(key)
      const hit = hitsBy.get(key)
      const row: ActivityRow = prev
        ? { ...prev }
        : { key, f: tp.f, s: tp.s, hits: 0, lastHit: null, firstSeen: now, status: 'active' }
      row.hits = hit ? hit.n : 0
      if (hit && hit.last) row.lastHit = hit.last
      rows.set(key, row)
    }
    // 清理：索引已不存在的条目（指针删除/归档）保留但不计（标记由审计后续处置）——v1 不删行

    // 4) 状态迁移（ACT-R 式：久未使用自然衰退；有命中即回升 active）
    let active = 0, warm = 0, cold = 0
    const archiveCands: Array<{ key: string; f: string; s: string; hits: number; days: string }> = []
    for (const row of rows.values()) {
      const daysSince = row.lastHit ? (now - row.lastHit) / DAY : Infinity
      if (row.lastHit !== null && daysSince < WARM_DAYS) {
        row.status = 'active'
        active++
      } else if (row.lastHit !== null && daysSince < COLD_DAYS) {
        row.status = 'warm'
        warm++
      } else {
        row.status = 'cold'
        cold++
        // 遗忘候选：从未命中 或 很久未命中（含索引存在但从未被读过的小节）
        const neverHit = row.lastHit === null && row.hits === 0
        const staleHit = row.lastHit !== null && daysSince > ARCHIVE_NO_HIT_DAYS
        if (neverHit || staleHit) {
          archiveCands.push({
            key: row.key, f: row.f, s: row.s, hits: row.hits,
            days: neverHit ? 'never' : `${Math.round(daysSince)}d`,
          })
        }
      }
    }
    saveRows(actFile, rows)

    // 5) 审计 + 遗忘候选清单（只读建议文件，供 audit-protocol §3 处置）
    audit({ kind: 'activity', tracked: rows.size, active, warm, cold, archiveCands: archiveCands.length, at: now })
    log(`activity: 跟踪 ${rows.size}（active ${active} / warm ${warm} / cold ${cold}）遗忘候选 ${archiveCands.length}`)
    if (archiveCands.length) {
      try {
        const f = join(auditDir, `activity-candidates-${dayKey(now)}.md`)
        const lines = [
          `# 遗忘候选（v7 A 步 · ${dayKey(now)}）`,
          '',
          '> 仅建议清单，供 audit-protocol §3/周期审计人工裁决：确认后按提纯降级（移 audit/archive、索引行退化为提示或不存）处置；本清单不自动删除任何内容。',
          '',
          '| 小节 | hits | 距最后命中 |',
          '|---|---|---|',
          ...archiveCands.slice(0, 50).map((c) => `| \`${c.f} §${c.s}\` | ${c.hits} | ${c.days} |`),
          '',
          `共 ${archiveCands.length} 条（清单截断显示前 50）。`,
        ]
        writeFileSync(f, lines.join('\n') + '\n', 'utf8')
      } catch { /* 清单写失败静默 */ }
    }
  } catch (e) {
    // 活性聚合绝不中断深睡主流程
    log(`activity: 聚合异常（跳过本轮）: ${String((e as Error)?.message || e).slice(0, 160)}`)
  }
}
