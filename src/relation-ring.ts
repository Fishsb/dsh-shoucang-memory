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
import { dueSoon } from './due-window.js'
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

/**
 * 结算执行者（**可追溯**）：是模型判的、规则判的、用户说的，还是 CLI 手敲的。
 * 册零（2026-09-20）新增——此前 `kept/broken` 一旦落库即**不可复核**（无从分辨谁判的）。
 */
export type SettlementBy = 'user' | 'rule' | 'agent-proposal' | 'cli'

/** 事件重放专用入参（`ring-events#replayEvents` 唯一使用者）：按**载荷里真有的键**重建。 */
export interface SettlementReplay {
  /**
   * **重放专用标记**：本次调用是**重建历史状态**，不是一次结算裁决 ⇒ 跳过证据门。
   *
   * ⚠ 为什么必须有这个位（不给就会**改历史 / 对账恒红**）：
   *   · 历史事件的载荷里**没有** `evidence`（本轮才加的字段）⇒ 若不给豁免，全库既有 1022 条
   *     事件将**再也重放不出来**；
   *   · 但重放也必须**逐字重建 store 的 `meta`**（`reconcileRing` 比 `meta` 全等）——
   *     存量 11 条已结清记录的 `meta` 里**本来就没有** `evidence`/`settledBy`。
   *   ⇒ 故 `replay` 的语义是「**跳过证据门，且只写载荷里真有的键**」：
   *     缺字段的旧事件重建出缺字段的记录（与实际 store 一致），
   *     带字段的新事件照常重建出带字段的记录（新老并存，各自对账都成立）。
   */
  replay: true
  status: 'kept' | 'broken'
  /** 载荷里有才传（缺省 = 该事件无此字段 ⇒ 重建出的记录也不该有） */
  evidence?: string
  settledBy?: SettlementBy
  note?: string
  at: string
}

/**
 * 结算入参。**两态判别式**（册零 · 2026-09-20）：
 *   · **活路径**（clawback CLI / 提案执行 / 规则）—— `evidence` **必填**（tsc 即强制，
 *     这就是方案档 V0.1「构造缺 `evidence` 的结算调用 ⇒ `npm run typecheck` 必须报错」的落地形态）；
 *   · **重放路径** —— 见 `SettlementReplay`（跳过证据门，按载荷重建）。
 * 两态分开写而不是「一个类型 + 可选字段」：后者会让活路径**也能**不传证据，
 *   而那正是本册要堵的口子（"结必有证"必须是**编译期**约束，不是运行时自觉）。
 */
export type SettlementInit = {
  status: 'kept' | 'broken'
  /** **证据串（必填）**：凭什么结清 —— 会话里已发生的交付 / 复验 / 用户的一句话。 */
  evidence: string
  /** 执行者（可省：不传即不写该键）。 */
  settledBy?: SettlementBy
  note?: string
  at: string
} | SettlementReplay

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
 *
 * 册一（2026-09-20）**结必有证**：空/空白 `evidence` 一律拒绝（`{ok:false}`），且证据与执行者
 *   写进 `meta.evidence` / `meta.settledBy`（**只增字段**，不动既有 `note`）。
 *   判因：`kept/broken` 是 `trustOf` 的唯一分子/分母来源 ⇒ 若不在这里堵，"兑现率虚高"
 *   就只能靠人自觉——而本仓的纪律是**判据可机检**。
 *
 * ⚠ **事件重放的豁免**（关键，不改历史）：见 `SettlementInit.replay` 的详细说明——
 *   `replay:true` ⇒ 跳过证据门，且**只写载荷里真有的键**（缺字段的旧事件重建出缺字段的记录，
 *   与存量 store 逐字一致；带字段的新事件照常重建）。
 *   「这条结清有没有证据」的判法因此是：**`meta.evidence` 存在 ⇒ 新式（有证据）；缺失 ⇒ 存量无据**。
 *   `trustOf` 的 `evidenceMissing` 正是这么算的（册四）——不需要凭空补字段也能如实显示。
 */
export function settleCommitment(records: readonly MemRecord[], id: string, s: SettlementInit): { records: MemRecord[]; ok: boolean; reason?: string } {
  const idx = records.findIndex((r) => r.id === id && r.kind === 'commitment')
  if (idx < 0) return { records: records.slice(), ok: false, reason: `承诺不存在（${id}）` }
  const st = records[idx].meta?.status
  if (st && st !== 'pending') return { records: records.slice(), ok: false, reason: `该承诺已结清（${st}，不重复结清）` }
  const isReplay = (s as SettlementReplay).replay === true
  const evidence = String((s as SettlementReplay).evidence ?? '').trim()
  if (!isReplay && !evidence) {
    return { records: records.slice(), ok: false, reason: '结算必须带证据（`evidence` 为空）——「结必有证」是防止兑现率虚高的唯一闸' }
  }
  const next = records.slice()
  next[idx] = {
    ...next[idx],
    meta: {
      ...(next[idx].meta ?? {}),
      status: s.status,
      settledAt: s.at,
      // 重放=纯重建 ⇒ 只写载荷里真有的键（不补写新键，见上「对账不变式」）
      // 活路径 ⇒ 证据与执行者**如实落盘**（`settledBy` 缺省不写，保持"只增字段"的最小形态）
      ...(isReplay
        ? { ...(evidence ? { evidence } : {}), ...(s.settledBy ? { settledBy: s.settledBy } : {}) }
        : { evidence, ...(s.settledBy ? { settledBy: s.settledBy } : {}) }),
      ...(s.note ? { note: s.note } : {}),
    },
    updatedAt: s.at,
  }
  return { records: next, ok: true }
}

/** 待兑现队列（pending 承诺）——「想不起来兑现」的防线；可按 who 过滤 */
export function openCommitments(records: readonly MemRecord[], who?: string): MemRecord[] {
  return records.filter((r) => r.kind === 'commitment' && r.meta?.status === 'pending' && (!who || r.meta?.who === who))
}

/**
 * **待裁决队列**（册三 · 2026-09-20 · `docs/promise-settlement-plan.md` §6）：
 * `due` 已逾期（复用 `dueSoon` 的 **7 天窗**，口径唯一）**且仍 pending** 的承诺。
 *
 * **明确不做**：**不自动判 `broken`**。理由（方案档原文）：逾期只证明"时间到了"，
 *   不证明"没做"——自动 broken 会把"其实已交付、只是没回写"的条目判成不兑现，
 *   **直接污染 `trustOf`**（与册一"结必有证"直接冲突）。
 *   ⇒ 本函数是**纯读**（零写入、不改状态），产出交人工/面板裁决。
 *
 * `overdue` 字段（**只增**）：`true` = 已过期，`false` = 7 天内到期（"临近"，同 `dueSoon` 语义）。
 * 排序：**过期在前**（最该被看见）→ 其次按 `due` 升序（越早到期越急）→ 无 `due`/坏时间戳不入选。
 */
export function overdueCommitments(records: readonly MemRecord[], at: string): Array<{ record: MemRecord; overdue: boolean; due: string }> {
  const out: Array<{ record: MemRecord; overdue: boolean; due: string }> = []
  for (const r of records) {
    if (r.kind !== 'commitment' || r.meta?.status !== 'pending') continue
    const due = String(r.meta?.due ?? '').trim()
    if (!due) continue
    if (!dueSoon(r.meta, at)) continue
    const t = Date.parse(due)
    // 坏时间戳已被 dueSoon 挡掉（返回 false）⇒ 此处 t 必可解析
    out.push({ record: r, overdue: Number.isFinite(t) ? t < Date.parse(at) : false, due })
  }
  return out.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    return (Date.parse(a.due) || 0) - (Date.parse(b.due) || 0)
  })
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
  /* ── 册四（2026-09-20）**判别力**：`0` 的两种含义必须当场可辨 ──────────────────
   *   判因：`rate = kept/(kept+broken)` 的**pending 不进分母** ⇒ 现状读数恒为 `0`；
   *   而这个 `0` 同时可能是「全未兑现」也可能是「**从未结算过任何一条**」——两义混一，指标失去判别力。
   *   修法**不改分母口径**（那会把"未结算"伪装成"未兑现"），只**加字段**让两义可辨：
   *     · `minePending`/`theirsPending` —— 未结算（**不进分母**，展示面须同屏给出）
   *     · `mineOverdue`/`theirsOverdue` —— 已逾期且仍 pending（**不自动 broken**，见册三）
   *     · `mineEvidenceMissing`/`theirsEvidenceMissing` —— 已结算但**无 `meta.evidence`**
   *       （存量历史条目，`settledBy:'replay'` 重建的也在内）⇒ 兑现率里有多少条**无据可溯**。 */
  minePending: number
  theirsPending: number
  mineOverdue: number
  theirsOverdue: number
  mineEvidenceMissing: number
  theirsEvidenceMissing: number
}

/**
 * 双向兑现率（KPI，**只从记录集推导**）：把「我欠」与「欠我」分开统计。
 * 合成单一比率会丢掉方向——方向信息正是判断"这段关系健不健康"的依据。
 *
 * ⚠ **分母口径写死且不许漂移**（册四）：`rate = kept/(kept+broken)`，**pending 不进分母**。
 *   本件只**加字段**，不做算术改动（`test-relation-ring` 的既有断言逐字比对）。
 * `overdueAt` 为**可选**入参：给了才算逾期字段（缺省 0 ⇒ 与旧行为逐字等价，调用方零迁移）。
 */
export function trustOf(records: readonly MemRecord[], who: string, overdueAt?: string): TrustScore {
  const mine = records.filter((r) => r.kind === 'commitment' && r.meta?.who === who && r.meta?.direction === 'owed-by-me')
  const theirs = records.filter((r) => r.kind === 'commitment' && r.meta?.who === who && r.meta?.direction === 'owed-to-me')
  const cnt = (arr: readonly MemRecord[], s: CommitmentStatus) => arr.filter((r) => r.meta?.status === s).length
  const mineKept = cnt(mine, 'kept'), mineBroken = cnt(mine, 'broken')
  const theirsKept = cnt(theirs, 'kept'), theirsBroken = cnt(theirs, 'broken')
  const rate = (k: number, b: number) => (k + b ? k / (k + b) : 0)
  /* 逾期判据**复用唯一实现** `dueSoon`（7 天窗，`ring-supply` 内）——不在本件另写一个数。
   * ⚠ 逾期 ≠ broken（册三红线）：这里只**计数**，绝不改状态。 */
  const overdue = (arr: readonly MemRecord[]): number =>
    overdueAt ? arr.filter((r) => r.meta?.status === 'pending' && dueSoon(r.meta, overdueAt)).length : 0
  const pend = (arr: readonly MemRecord[]) => cnt(arr, 'pending')
  const noEv = (arr: readonly MemRecord[]) =>
    arr.filter((r) => (r.meta?.status === 'kept' || r.meta?.status === 'broken') && !String(r.meta?.evidence ?? '').trim()).length
  return {
    who,
    mineKept, mineBroken, theirsKept, theirsBroken,
    mineRate: rate(mineKept, mineBroken), theirsRate: rate(theirsKept, theirsBroken),
    minePending: pend(mine), theirsPending: pend(theirs),
    mineOverdue: overdue(mine), theirsOverdue: overdue(theirs),
    mineEvidenceMissing: noEv(mine), theirsEvidenceMissing: noEv(theirs),
  }
}
