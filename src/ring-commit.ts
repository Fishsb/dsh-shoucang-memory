/**
 * ring-commit.ts — **环记录落库（两条产线共用）**（P4/P5 · 2026-09-14 · 拟人化方案 §4.3 线 B）
 *
 * 为什么需要它：五个内容环此前**唯一生产者是 CLI**（`scripts/record-ring.mjs`）⇒
 *   实测 988 条记录里带环语义的**仅 9 条**，且全靠手敲。没有自动生产者，「经历」就永远不增长——
 *   而情境层（P2/P3/P6 已接通）能供给的，正是这些环记录。**写侧不断线，读侧才有内容。**
 *
 * 为什么只有一份：蒸馏（会话→库）与深睡（库→库）都要落同样的环记录。
 *   本件是这一步的**单一实现**（仓内铁律：同一事实不得有第二份实现；名字取领域中立的 `ring-commit`
 *   而不是 `distill-ring`，正因它同时服务两条产线）。
 *
 * 落盘配方与 CLI **逐字一致**（`scripts/record-ring.mjs#commit`）：
 *   `eventsFromDiff` 求差分 → 追加 `ring-events.jsonl` → `saveStoreRecords` 存状态。
 *   为什么两样都写：**事件流是不可变历史、store 是当前状态**（store 会被镜像重写，历史不会）；
 *   对账判据要求「事件流重放必须能重建 store 的环记录」。
 *
 * 边界纪律：
 *   · **只做落库**——把模型输出的通道转成环 API 调用；判定/不变量仍在 `criteria` 与各环模块；
 *   · **零抛出**：任何异常只进返回值（记忆写入失败**不得**打断蒸馏/深睡主链路）；
 *   · **不新写打分/排序**；`meta.cues` 由 `ring-supply#serializeCues` 单一实现序列化（与读侧同源）。
 *   · `episodes` 通道写 `episode` kind（属 fact 环）：它**不在** `ringRecordsOf` 的对账范围内
 *     （那里只收 decision/outcome/valence/relation/commitment/association）⇒ 不产生环事件，
 *     也**不会**造成「store 有而事件流无」的假红。这是**显式口径**，不是遗漏。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadStore, saveStoreRecords, recordStorePath, RECORD_DIR } from './record-shadow.js'
import { eventsFromDiff, parseEvents, serializeEvents, RING_EVENT_FILE } from './ring-events.js'
import { openDecision, collectOutcome, recordValence } from './decision-ring.js'
import { assertRelation, openCommitment } from './relation-ring.js'
import { serializeCues, cueSetOf } from './cue-space.js'
import { makeRecord, stampRecord, fingerprint } from './record-store.js'
import type { MemRecord } from './record-store.js'

/** 产出通道名（**唯一声明处**；判据段与统计都从这里派生，不另立名单） */
export const RING_CHANNELS = ['decisions', 'commitments', 'relations', 'valences', 'outcomes', 'episodes'] as const
export type RingChannel = (typeof RING_CHANNELS)[number]

export interface RingCommitDeps {
  log(m: string): void
  audit(o: Record<string, unknown>): void
}

export interface RingCommitResult {
  decisions: number
  commitments: number
  relations: number
  valences: number
  /** 后果回收条数（**本环的核心**：没有回收，经历永远只是日志） */
  outcomes: number
  /** 叙事/情景条数（author 层：把经历整合成带时间的因果短叙事） */
  episodes: number
  /** 写入的环事件条数（>0 才表示 store 真被改过） */
  events: number
  ok: boolean
  reason?: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * **cue 键落库**（IR1 册二 · 2026-09-18：写侧私有归一已收敛到 `cue-space.ts`）。
 *
 * 旧实现（本件私有 `normalizeCue`）只归一 `scope`，且**只在写侧**做；读侧 `situation-key#cuesOf`
 *   组装键时不过同一归一 ⇒ 匹配判据（字符串全等）把它劈成两半：实测 正斜杠 267 / 反斜杠 152，
 *   新写入记录命中 **0/119**。现改为**调用唯一实现**（读写同源），并在写侧加**维校验硬门**：
 *   未声明维（注册表 `cueDims` 之外）⇒ **拒收** + 审计 `cue.rejected`（旧行为：37 条静默写入）。
 *
 * 零抛出：任何异常路径返回空串（记忆写入**不得**因 cue 处理失败而中断）。
 */
const cuesOfItem = (it: unknown, audit?: (o: Record<string, unknown>) => void): string => {
  const raw = (it as { cues?: unknown } | null)?.cues
  const { keys, rejected } = cueSetOf(raw)
  if (rejected.length && audit) {
    try { audit({ kind: 'cue.rejected', count: rejected.length, keys: rejected.map((r) => r.key).slice(0, 8), reasons: [...new Set(rejected.map((r) => r.reason))].slice(0, 4) }) } catch { /* 审计失败不影响落库 */ }
  }
  return serializeCues(keys)
}

/** 通道计数（供 `enqueued` 统计与审计；**不落库**，纯读） */
export function countRingChannels(out: unknown): Record<RingChannel, number> {
  const o = (out ?? {}) as Record<string, unknown>
  const n = (k: string): number => (Array.isArray(o[k]) ? (o[k] as unknown[]).length : 0)
  const r = {} as Record<RingChannel, number>
  for (const k of RING_CHANNELS) r[k] = n(k)
  return r
}

/**
 * 把模型输出的通道落成环记录（**幂等性由各环模块自身守**：同文本同 id、重复结清被拒）。
 * `root` = 记忆库根（`memoryLibRoot()`）；`at` = 判定时刻（必填，不吃隐式 now）；
 * `source` = 产线标签（`distill` / `deep-sleep`），只进审计，不参与语义。
 */
export function commitRingChannels(d: RingCommitDeps, root: string, out: unknown, at: string, source = 'unknown'): RingCommitResult {
  const res: RingCommitResult = { decisions: 0, commitments: 0, relations: 0, valences: 0, outcomes: 0, episodes: 0, events: 0, ok: true }
  const o = (out ?? {}) as Record<string, unknown[]>
  const dec = Array.isArray(o.decisions) ? o.decisions : []
  const com = Array.isArray(o.commitments) ? o.commitments : []
  const rel = Array.isArray(o.relations) ? o.relations : []
  const val = Array.isArray(o.valences) ? o.valences : []
  const outc = Array.isArray(o.outcomes) ? o.outcomes : []
  const eps = Array.isArray(o.episodes) ? o.episodes : []
  if (!dec.length && !com.length && !rel.length && !val.length && !outc.length && !eps.length) return res

  try {
    // ⚠ **库未建 ⇒ 拒**，不得"顺手创建"：`loadStore` 对缺失根不报错，而 `saveStoreRecords` 会把目录建出来
    //   ⇒ 若 MEMORY_ROOT 指错，产线会**凭空造出一个游离事实源**（实测：库根不存在时曾"假装成功"写入 1 条）。
    //   与 CLI 契约一致（`record-ring.mjs` 遇库未建 exit 3 并提示先跑 record-sync --import）。
    const storePath = recordStorePath(root)
    if (!existsSync(storePath)) {
      res.ok = false
      res.reason = `影子库未建（${RECORD_DIR}/ 不存在）——先跑 record-sync.mjs --import`
      d.log(`${source} 环记录落库跳过：${res.reason}`)
      return res
    }
    const cur = loadStore(root)
    if (cur.error) { res.ok = false; res.reason = `影子库不可用：${cur.error}`; return res }
    let records: MemRecord[] = cur.records

    // ① 决策（记下**当时预测**——那是后果回收的对照项；没有它，经历永远只是日志）
    for (const it of dec) {
      const text = str((it as { text?: unknown })?.text)
      if (!text) continue
      const r = openDecision(records, {
        text,
        predicted: str((it as { predicted?: unknown })?.predicted),
        rationale: str((it as { rationale?: unknown })?.rationale),
        alternatives: str((it as { alternatives?: unknown })?.alternatives),
        evidence: str((it as { evidence?: unknown })?.evidence),
        cues: cuesOfItem(it, d.audit),
        at,
      })
      records = r.records
      res.decisions++
    }
    // ② 承诺/意图（前瞻记忆：**形成时落库**才有意义——事后无从恢复）
    for (const it of com) {
      const who = str((it as { who?: unknown })?.who) || '用户'
      const what = str((it as { what?: unknown })?.what)
      if (!what) continue
      const dir = str((it as { direction?: unknown })?.direction)
      const r = openCommitment(records, {
        who,
        what,
        direction: dir === 'owed-to-me' ? 'owed-to-me' : 'owed-by-me',
        due: str((it as { due?: unknown })?.due),
        evidence: str((it as { evidence?: unknown })?.evidence),
        cues: cuesOfItem(it, d.audit),
        at,
      })
      records = r.records
      res.commitments++
    }
    // ③ 关系事实（谁是谁 / 在意什么 / 忌讳什么）
    for (const it of rel) {
      const who = str((it as { who?: unknown })?.who)
      const note = str((it as { note?: unknown })?.note)
      if (!who || !note) continue
      const lv = Number((it as { level?: unknown })?.level)
      const r = assertRelation(records, { who, note, ...(Number.isFinite(lv) ? { level: lv } : {}), evidence: str((it as { evidence?: unknown })?.evidence), cues: cuesOfItem(it, d.audit), at })
      records = r.records
      res.relations++
    }
    // ④ 价态（**触发条件**必须带——价态脱离情境就没有意义）
    for (const it of val) {
      const trigger = str((it as { trigger?: unknown })?.trigger)
      const v = Number((it as { valence?: unknown })?.valence)
      if (!trigger || !Number.isFinite(v)) continue
      const r = recordValence(records, { trigger, valence: v, evidence: str((it as { evidence?: unknown })?.evidence), cues: cuesOfItem(it, d.audit), at })
      records = r.records
      res.valences++
    }
    // ⑤ **后果回收**（决策环的核心；深睡产出，蒸馏一般产不出——后果要等事实发生）
    //   幂等：`collectOutcome` 自身拒绝重复回收；未给 hit 时由价态符号推导。
    for (const it of outc) {
      const decisionId = str((it as { decisionId?: unknown })?.decisionId)
      const observed = str((it as { observed?: unknown })?.observed)
      if (!decisionId || !observed) continue
      const hitRaw = (it as { hit?: unknown })?.hit
      const vRaw = (it as { valence?: unknown })?.valence
      const v = Number(vRaw)
      const r = collectOutcome(records, decisionId, {
        observed,
        ...(typeof hitRaw === 'boolean' ? { hit: hitRaw } : {}),
        ...(Number.isFinite(v) ? { valence: v } : {}),
        evidence: str((it as { evidence?: unknown })?.evidence),
        at,
      })
      if (!r.ok) { d.log(`${source} 后果回收被拒（${decisionId}）：${r.reason ?? ''}`); continue }
      records = r.records
      res.outcomes++
    }
    // ⑥ **叙事/情景**（author 层）：写 `episode` kind（属 fact 环），`pointer` 指向 notes 正文小节。
    //   为何复用 episode 而非新增 kind：kind 表已登记它（`RING_OF_KIND.episode='fact'`），
    //   加新 kind 只会让"登记了没生产者"的旧病复发（本项目 D-04a 就是这么来的）。
    for (const it of eps) {
      const text = str((it as { text?: unknown })?.text)
      const title = str((it as { title?: unknown })?.title)
      if (!text || !title) continue
      const id = `episode:${fingerprint(`${title}|${text}`)}`
      const rec = stampRecord(makeRecord({
        id,
        kind: 'episode',
        file: '',
        subject: 'agent',
        scope: str((it as { scope?: unknown })?.scope) || 'global',
        text,
        source: str((it as { evidence?: unknown })?.evidence),
        pointer: str((it as { pointer?: unknown })?.pointer),
        meta: { title, ...(cuesOfItem(it, d.audit) ? { cues: cuesOfItem(it, d.audit) } : {}) },
      }), at)
      const i = records.findIndex((r) => r.id === id)
      if (i < 0) records = [...records, rec]
      else records = records.map((r, k) => (k === i ? { ...rec, createdAt: r.createdAt || at } : r))
      res.episodes++
    }

    // ⑦ 提交：先事件流（不可变历史）后状态（当前）——顺序与 CLI 一致
    const wrote = res.decisions + res.commitments + res.relations + res.valences + res.outcomes
    if (!wrote && !res.episodes) return res
    if (wrote) {
      const evPath = join(root, RECORD_DIR, RING_EVENT_FILE)
      const evs = eventsFromDiff(cur.records, records, at, (existsSync(evPath) ? parseEvents(readFileSync(evPath, 'utf8')) : []).length + 1)
      if (evs.length) {
        mkdirSync(join(root, RECORD_DIR), { recursive: true })
        const prev = existsSync(evPath) ? parseEvents(readFileSync(evPath, 'utf8')) : []
        writeFileSync(evPath, serializeEvents(prev.concat(evs)), 'utf8')
        res.events = evs.length
      }
    }
    saveStoreRecords(root, records)
    d.audit({ kind: 'ring-commit', source, decisions: res.decisions, commitments: res.commitments, relations: res.relations, valences: res.valences, outcomes: res.outcomes, episodes: res.episodes, events: res.events })
    return res
  } catch (e) {
    res.ok = false
    res.reason = String((e as Error)?.message ?? e).slice(0, 160)
    d.log(`${source} 环记录落库失败（不影响主链路）：${res.reason}`)
    return res
  }
}
