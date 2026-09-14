/**
 * decision-ring.ts — 决策环（G1 · 2026-09-13）：裁决 → 预测 → **后果回收** → 价态采集
 *
 * 为什么单独成环（三轮讨论的结论，逐条对应）：
 *   · **没有后果回收，「经历」永远变不成「认知」**——模型知道"一般该怎么做"，缺的是"上次这么做结果如何"；
 *     后果账是唯一能纠正聪明模型过度自信的东西。故本模块的核心不是"记裁决"，是 **`collectOutcome`**。
 *   · **免频率门**：一条裁决、一条价态，**只出现一次也成立**（`rings.ts#FREQUENCY_FREE_RINGS`）。
 *     AWM「只从成功学」那类频率门（≥2 次/≥3 痕迹）在这里是错的判据。
 *   · **价态是唯一模型推不出来的部分**：撞过/裁决过、以及**当时被认可还是被否**，是历史事实，不是推测。
 *
 * 形态：纯函数（记录集进、记录集出）——与 `record-store` 同规格，可脱离宿主直接单测。
 *   环记录 `file=''`（**天然没有 md 投影**：决策/后果/价态不属于三索引），因此 `mirrorFile` 的
 *   「按文件整片替换」不会碰它们（`record-shadow` 保 `r.file !== file` 的其余记录）。
 */
import { fingerprint, makeRecord, stampRecord } from './record-store.js'
import type { MemRecord } from './record-store.js'

export interface DecisionInit {
  /** 裁决正文（一句话：拍了什么板） */
  text: string
  /** 当时预测会怎样（后果回收的对照项） */
  predicted?: string
  /** 当时为什么这么拍（防下一次把已拍板的事重开一遍） */
  rationale?: string
  /** 被否的方案（防止重复讨论已否决项） */
  alternatives?: string
  /** 源（会话 id / notes 锚） */
  evidence?: string
  subject?: string
  scope?: string
  /** 情境键（`\n` 分隔；用 `ring-supply#serializeCues` 序列化，**与读侧同一实现**）。
   *  它是「**在什么情境下该想起它**」的唯一线索（编码特异性）；写不出就省——读侧有兜底序，不会因此丢失。 */
  cues?: string
  at: string
  /** 显式 id（**事件重放时由事件指定**：身份以事件流为准，载荷缺字段也不改身份） */
  id?: string
}

export interface OutcomeInit {
  /** 实际发生了什么 */
  observed: string
  /** 命中预测？（省略时由 valence 符号推导） */
  hit?: boolean
  /** 价态：+1 好 / -1 坏 / 0 中性 */
  valence?: number
  evidence?: string
  at: string
  /** 显式 id（见 DecisionInit.id 说明） */
  id?: string
}

export interface ValenceInit {
  /** 触发条件（在什么情境下） */
  trigger: string
  /** 价态（正/负） */
  valence: number
  /** 情境键（见 DecisionInit.cues） */
  cues?: string
  evidence?: string
  at: string
  /** 显式 id（见 DecisionInit.id 说明） */
  id?: string
}

/** 开一条裁决（status=open，进入待回收队列） */
export function openDecision(records: readonly MemRecord[], d: DecisionInit): { records: MemRecord[]; id: string } {
  const id = d.id ?? `decision:${fingerprint(d.text)}`
  const rec = stampRecord(makeRecord({
    id,
    kind: 'decision',
    file: '',
    subject: d.subject ?? 'agent',
    scope: d.scope ?? 'global',
    text: d.text,
    source: d.evidence ?? '',
    meta: {
      status: 'open',
      ...(d.predicted ? { predicted: d.predicted } : {}),
      ...(d.rationale ? { rationale: d.rationale } : {}),
      ...(d.alternatives ? { alternatives: d.alternatives } : {}),
      ...(d.cues ? { cues: d.cues } : {}),
    },
  }), d.at)
  const i = records.findIndex((r) => r.id === id)
  if (i < 0) return { records: [...records, rec], id }
  const next = records.slice()
  // 重提交**不得静默丢字段**（2026-09-14 实测缺陷：整体替换 meta ⇒ 第二次提交没带 `cues` 就把 cues 抹掉，
  //   而事件流仍带 cues ⇒ `reconcileRing` 必红。对账门抓到的正是这种"状态与历史漂移"）。
  //   语义：旧键保留、新键覆盖（新载荷未提及的字段不消失）。
  next[i] = { ...rec, meta: { ...(records[i].meta ?? {}), ...(rec.meta ?? {}) }, hits: records[i].hits, lastHit: records[i].lastHit, createdAt: records[i].createdAt || d.at }
  return { records: next, id }
}

/** 该裁决已回收的后果（无则 undefined） */
export function outcomeOf(records: readonly MemRecord[], decisionId: string): MemRecord | undefined {
  return records.find((r) => r.kind === 'outcome' && r.meta?.decisionId === decisionId)
}

/**
 * **后果回收**（本环的核心）：把实际结果挂回裁决，改其状态为 collected。
 * 幂等：已回收过的裁决**拒绝重复回收**（不重复产记录——重复即污染记分卡）。
 */
export function collectOutcome(records: readonly MemRecord[], decisionId: string, o: OutcomeInit): { records: MemRecord[]; ok: boolean; reason?: string; hit?: boolean } {
  const idx = records.findIndex((r) => r.id === decisionId && r.kind === 'decision')
  if (idx < 0) return { records: records.slice(), ok: false, reason: `裁决不存在（${decisionId}）` }
  if (outcomeOf(records, decisionId)) return { records: records.slice(), ok: false, reason: '该裁决已回收（不重复产记录）' }
  const hit = o.hit ?? (typeof o.valence === 'number' ? o.valence > 0 : undefined)
  const outcome = stampRecord(makeRecord({
    id: o.id ?? `outcome:${decisionId}:${fingerprint(o.observed)}`,
    kind: 'outcome',
    file: '',
    subject: records[idx].subject,
    scope: records[idx].scope,
    text: o.observed,
    source: o.evidence ?? '',
    meta: {
      decisionId,
      ...(hit === undefined ? {} : { hit: hit ? '1' : '0' }),
      ...(typeof o.valence === 'number' ? { valence: String(o.valence) } : {}),
    },
  }), o.at)
  const next = records.slice()
  next[idx] = { ...next[idx], meta: { ...(next[idx].meta ?? {}), status: 'collected' }, updatedAt: o.at }
  next.push(outcome)
  return { records: next, ok: true, hit }
}

/** 价态采集（用户/agent 对某情境的真实反应；**唯一的人工信号入口**） */
export function recordValence(records: readonly MemRecord[], v: ValenceInit): { records: MemRecord[]; id: string } {
  const id = v.id ?? `valence:${fingerprint(`${v.trigger}|${v.valence}`)}`
  const rec = stampRecord(makeRecord({
    id,
    kind: 'valence',
    file: '',
    subject: 'user',
    scope: 'global',
    text: `[价态] ${v.trigger} · ${v.valence > 0 ? '认可' : v.valence < 0 ? '否定' : '中性'}`,
    source: v.evidence ?? '',
    meta: { trigger: v.trigger, valence: String(v.valence), ...(v.cues ? { cues: v.cues } : {}) },
  }), v.at)
  const i = records.findIndex((r) => r.id === id)
  if (i < 0) return { records: [...records, rec], id }
  const next = records.slice()
  next[i] = { ...rec, meta: { ...(records[i].meta ?? {}), ...(rec.meta ?? {}) }, hits: records[i].hits + 1, lastHit: v.at, createdAt: records[i].createdAt || v.at }
  return { records: next, id }
}

/** 待回收队列（开了没回收的裁决）——「想不起来回收」的防线 */
export function openDecisions(records: readonly MemRecord[]): MemRecord[] {
  return records.filter((r) => r.kind === 'decision' && r.meta?.status !== 'collected')
}

export interface Scorecard {
  opened: number
  collected: number
  hits: number
  misses: number
  pending: number
  /** 命中率（collected=0 时 0，不编造） */
  hitRate: number
  valences: number
  /** 未命中的裁决正文（前 3 条，供复盘） */
  missSamples: string[]
}

/** 决策环记分卡（KPI：**只从记录集推导**，不另立计数器——与「KPI 只能由事件流推导」同纪律） */
export function scorecardOf(records: readonly MemRecord[]): Scorecard {
  const decisions = records.filter((r) => r.kind === 'decision')
  const outcomes = records.filter((r) => r.kind === 'outcome')
  const hits = outcomes.filter((r) => r.meta?.hit === '1')
  const misses = outcomes.filter((r) => r.meta?.hit === '0')
  const missSamples = misses
    .map((o) => decisions.find((d) => d.id === o.meta?.decisionId))
    .filter((d): d is MemRecord => !!d)
    .slice(0, 3)
    .map((d) => d.text)
  return {
    opened: decisions.length,
    collected: outcomes.length,
    hits: hits.length,
    misses: misses.length,
    pending: openDecisions(records).length,
    hitRate: outcomes.length ? hits.length / outcomes.length : 0,
    valences: records.filter((r) => r.kind === 'valence').length,
    missSamples,
  }
}
