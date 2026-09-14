/**
 * relation-ring.ts — 关系环（G2 · 2026-09-13）：谁是谁 / 谁欠谁 / **承诺状态机**
 *
 * 为什么单独成环（三轮讨论的结论）：人记的大量内容不是知识，是**社会位置**——
 *   「谁对我有期待、我欠谁、谁可信」。模型没有社会位置，这部分只能外置；
 *   而且它是**双向**的（对面也记得你）⇒ 本模块用 `direction` 把「我欠」与「欠我」分开记账，
 *   两侧的兑现率**分开统计**（合成一个数就丢掉了方向这个最有用的信息）。
 *
 * 与决策环的分工：决策环管「我拍了什么板、结果如何」（对内）；关系环管「我与谁之间的未结事项」（对外）。
 *   两者的共同点是**都要回收**：决策要回收后果、承诺要回收兑现 ⇒ 都有"待办队列"，
 *   都是**免"想不起来"**的防线（`openDecisions` / `openCommitments`）。
 *
 * 形态：纯函数（记录集进、记录集出）；环记录 `file=''`（无 md 投影，与决策环同规格）。
 */
import { fingerprint, makeRecord, stampRecord } from './record-store.js'
import type { MemRecord } from './record-store.js'

/** 方向：我欠（owed-by-me）/ 欠我（owed-to-me）—— 双向记账的关键字段 */
export type CommitmentDirection = 'owed-by-me' | 'owed-to-me'
export type CommitmentStatus = 'pending' | 'kept' | 'broken'

export interface RelationInit {
  /** 关系主体（人/角色/项目干系人） */
  who: string
  /** 关于他/她的事实（在意什么、期待什么、忌讳什么） */
  note: string
  /** 信任/重要性档位（-2..2，可省） */
  level?: number
  /** 情境键（`\n` 分隔；`ring-supply#serializeCues` 序列化，与读侧同一实现）——「在什么情境下该想起它」 */
  cues?: string
  evidence?: string
  at: string
  /** 显式 id（事件重放以事件为身份权威：载荷缺字段也不改身份） */
  id?: string
  /** 显式正文覆盖（**legacy 记录的最后手段**：老版本只把内容写在正文里、meta 无 payload 时，
   *  事件携带原始正文 ⇒ 重放仍逐字还原；payload 完整时无需使用） */
  text?: string
}

export interface CommitmentInit {
  who: string
  /** 承诺内容（我答应做什么 / 对方答应做什么） */
  what: string
  direction: CommitmentDirection
  /** 期限（ISO 日期或自由文本，可省） */
  due?: string
  /** 情境键（见 RelationInit.cues） */
  cues?: string
  evidence?: string
  at: string
  /** 显式 id（见 RelationInit.id 说明） */
  id?: string
  /** 显式正文覆盖（见 RelationInit.text 说明） */
  text?: string
}

export interface SettlementInit {
  status: 'kept' | 'broken'
  note?: string
  at: string
}

/** 记一条关系事实 */
export function assertRelation(records: readonly MemRecord[], r: RelationInit): { records: MemRecord[]; id: string } {
  const id = r.id ?? `relation:${fingerprint(`${r.who}|${r.note}`)}`
  const rec = stampRecord(makeRecord({
    id,
    kind: 'relation',
    file: '',
    subject: 'user',
    scope: 'global',
    text: r.text ?? `${r.who}：${r.note}`,
    source: r.evidence ?? '',
    meta: { who: r.who, ...(r.note ? { note: r.note } : {}), ...(typeof r.level === 'number' ? { level: String(r.level) } : {}), ...(r.cues ? { cues: r.cues } : {}) },
  }), r.at)
  const i = records.findIndex((x) => x.id === id)
  if (i < 0) return { records: [...records, rec], id }
  const next = records.slice()
  // 重提交不得静默丢字段（见 decision-ring#openDecision 的同一缺陷说明）：旧键保留、新键覆盖
  next[i] = { ...rec, meta: { ...(records[i].meta ?? {}), ...(rec.meta ?? {}) }, hits: records[i].hits + 1, lastHit: r.at, createdAt: records[i].createdAt || r.at }
  return { records: next, id }
}

/** 开一条承诺（status=pending，进入待兑现队列） */
export function openCommitment(records: readonly MemRecord[], c: CommitmentInit): { records: MemRecord[]; id: string } {
  const id = c.id ?? `commitment:${fingerprint(`${c.who}|${c.what}|${c.direction}`)}`
  const rec = stampRecord(makeRecord({
    id,
    kind: 'commitment',
    file: '',
    subject: 'user',
    scope: 'global',
    text: c.text ?? `[承诺] ${c.direction === 'owed-by-me' ? '我欠' : '欠我'} ${c.who}：${c.what}`,
    source: c.evidence ?? '',
    meta: { who: c.who, ...(c.what ? { what: c.what } : {}), direction: c.direction, status: 'pending', ...(c.due ? { due: c.due } : {}), ...(c.cues ? { cues: c.cues } : {}) },
  }), c.at)
  const i = records.findIndex((x) => x.id === id)
  if (i < 0) return { records: [...records, rec], id }
  const next = records.slice()
  next[i] = { ...rec, meta: { ...(records[i].meta ?? {}), ...(rec.meta ?? {}) }, hits: records[i].hits, lastHit: records[i].lastHit, createdAt: records[i].createdAt || c.at }
  return { records: next, id }
}

/**
 * **结清承诺**（本环的核心）：pending → kept | broken。
 * 幂等：已结清的承诺**拒绝重复结清**（重复即污染兑现率）。
 */
export function settleCommitment(records: readonly MemRecord[], id: string, s: SettlementInit): { records: MemRecord[]; ok: boolean; reason?: string } {
  const idx = records.findIndex((r) => r.id === id && r.kind === 'commitment')
  if (idx < 0) return { records: records.slice(), ok: false, reason: `承诺不存在（${id}）` }
  const st = records[idx].meta?.status
  if (st && st !== 'pending') return { records: records.slice(), ok: false, reason: `该承诺已结清（${st}，不重复结清）` }
  const next = records.slice()
  next[idx] = {
    ...next[idx],
    meta: { ...(next[idx].meta ?? {}), status: s.status, settledAt: s.at, ...(s.note ? { note: s.note } : {}) },
    updatedAt: s.at,
  }
  return { records: next, ok: true }
}

/** 待兑现队列（pending 承诺）——「想不起来兑现」的防线；可按 who 过滤 */
export function openCommitments(records: readonly MemRecord[], who?: string): MemRecord[] {
  return records.filter((r) => r.kind === 'commitment' && r.meta?.status === 'pending' && (!who || r.meta?.who === who))
}

/** 某主体的全部关系与承诺（双向视角：我欠与欠我都在） */
export function relationsOf(records: readonly MemRecord[], who: string): MemRecord[] {
  return records.filter((r) => (r.kind === 'relation' || r.kind === 'commitment') && r.meta?.who === who)
}

export interface RelationCensus {
  relations: number
  commitments: number
  pending: number
  kept: number
  broken: number
  /** 关系网规模（去重主体数） */
  entities: number
  byWho: Record<string, number>
}

export function relationCensus(records: readonly MemRecord[]): RelationCensus {
  const rel = records.filter((r) => r.kind === 'relation')
  const com = records.filter((r) => r.kind === 'commitment')
  const byWho: Record<string, number> = {}
  for (const r of [...rel, ...com]) { const w = r.meta?.who; if (w) byWho[w] = (byWho[w] ?? 0) + 1 }
  return {
    relations: rel.length,
    commitments: com.length,
    pending: com.filter((r) => r.meta?.status === 'pending').length,
    kept: com.filter((r) => r.meta?.status === 'kept').length,
    broken: com.filter((r) => r.meta?.status === 'broken').length,
    entities: Object.keys(byWho).length,
    byWho,
  }
}

export interface TrustScore {
  who: string
  /** 我欠的：兑现 / 未兑现 */
  mineKept: number
  mineBroken: number
  /** 欠我的：兑现 / 未兑现 */
  theirsKept: number
  theirsBroken: number
  /** 兑现率（分母为 0 时报 0，不编造） */
  mineRate: number
  theirsRate: number
}

/**
 * 双向兑现率（KPI，**只从记录集推导**）：把「我欠」与「欠我」分开统计。
 * 合成单一比率会丢掉方向——方向信息正是判断"这段关系健不健康"的依据。
 */
export function trustOf(records: readonly MemRecord[], who: string): TrustScore {
  const mine = records.filter((r) => r.kind === 'commitment' && r.meta?.who === who && r.meta?.direction === 'owed-by-me')
  const theirs = records.filter((r) => r.kind === 'commitment' && r.meta?.who === who && r.meta?.direction === 'owed-to-me')
  const cnt = (arr: readonly MemRecord[], s: CommitmentStatus) => arr.filter((r) => r.meta?.status === s).length
  const mineKept = cnt(mine, 'kept'), mineBroken = cnt(mine, 'broken')
  const theirsKept = cnt(theirs, 'kept'), theirsBroken = cnt(theirs, 'broken')
  const rate = (k: number, b: number) => (k + b ? k / (k + b) : 0)
  return { who, mineKept, mineBroken, theirsKept, theirsBroken, mineRate: rate(mineKept, mineBroken), theirsRate: rate(theirsKept, theirsBroken) }
}
