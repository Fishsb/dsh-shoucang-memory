/**
 * fact-supersede-apply.ts — **时态剔除的落库接线**（门4 册 A · 2026-09-20）
 *
 * 为什么需要它（门4 的真实缺口）：`fact-ring#supersede()` 是**纯函数**（记录集进、记录集出、零 I/O），
 *   在 `src/` 内**零调用方** —— 于是真库 `.records/records.jsonl` 的 `validTo` 非空 **0/6037**：
 *   旧断言永不失效、与新断言并存 ⇒ 模型在两份矛盾记忆间随机选（这正是 `fact-ring.ts` 抬头写的"库内污染"）。
 *   本件是那条链的**唯一落库出口**：把「哪条被取代」变成一次真实的 store 变更。
 *
 * 与 `ring-commit` 的分工（**同一配方，不同对象**）：
 *   · `ring-commit` 落**环记录的创建/迁移**（新内容进来）；
 *   · 本件落**既有记录的时态失效**（旧内容退出）。
 *   两者共用纪律（零抛出 / 先判库存在 / 走唯一写入原语），但**不共用通道**——理由见下「边界」。
 *
 * 边界（**显式**，不是遗漏）：
 *   · **不进环事件流**。`ring-events#ringRecordsOf` 只收六个环 kind，而失效的对象绝大多数是
 *     **索引行/画像行**（`file !== ''`）⇒ 本件的变更**结构上不可能**产生环事件。
 *     这不是半接线：`test-fact-ring.mjs` §I 早已把这条边界钉死（`RING_OPS.length === 9` 且不含 fact 失效），
 *     本件**遵守**该边界而非绕过它。历史由**留档**承担（见下），不是由事件流承担。
 *   · **先留档再改**：被失效记录的**整行原文**（含 `meta`）先写入
 *     `<库根>/audit/supersede/supersede-<ts>.jsonl`；写档失败 ⇒ **拒改**（可还原优先于"改成功"）。
 *     回滚复用**既有** `fact-ring#revive()`，不新写恢复逻辑。
 *   · **失败不打断主链路**：同 `ring-commit` 的「零抛出」纪律——异常只进返回值与审计。
 *   · **不改内容、不动 lifecycle**：`validTo`（真伪）与 `lifecycle`（活性）**正交**，
 *     `fact-ring.ts:12` 有明文；本件只碰前者。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadStore, saveStoreRecords, recordStorePath, RECORD_DIR } from './record-shadow.js'
import { supersede } from './fact-ring.js'
import type { MemRecord } from './record-store.js'

/** 一条失效指令。**目标定位二选一**：优先 `targetId`（精确），否则 `targetText`（逐字，须唯一）。 */
export interface SupersedeOp {
  /** 目标记录 id（精确命中；与 `targetText` 同给时**以 id 为准**） */
  targetId?: string
  /** 目标记录正文（**逐字**匹配；0 命中 ⇒ 陈旧，多命中 ⇒ 歧义 ⇒ 均拒） */
  targetText?: string
  /** 因何失效（人读；进 `meta.staleNote`） */
  note?: string
  /** 被谁取代（记录 id 或一句话；进 `meta.supersededBy`）。**不得编造** —— 定不下就不填。 */
  by?: string
}

export interface SupersedeApplyDeps {
  /** 记忆库根（`memoryLibRoot()`） */
  root: string
  /** 判定时刻（**必填**：不吃隐式 now，否则结果不可复现 —— 与 `buildCandidates`/`ringCandidates` 同纪律） */
  at: string
  log(m: string): void
  audit(o: Record<string, unknown>): void
}

export interface SupersedeVerdict {
  /** 命中的目标 id（未命中为空串） */
  targetId: string
  verdict: 'applied' | 'skipped'
  reason: string
}

export interface SupersedeApplyResult {
  /** 是否真的执行（开关关闭时 false ⇒ 零写入、零留档、零审计） */
  ran: boolean
  applied: number
  skipped: number
  /** 留档条数（**成功留档**才计；留档失败 ⇒ 该条被拒改 ⇒ 不计） */
  archived: number
  reasons: string[]
  /** 逐条裁决（**可核验**：审计与测试都读它，不靠日志猜） */
  verdicts: SupersedeVerdict[]
  ok: boolean
}

/** 留档目录（每轮一个文件，一行一记录原文）。 */
export const supersedeArchiveDirOf = (root: string): string => join(String(root), 'audit', 'supersede')

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * 执行一批失效指令。**fail-closed**：`enabled !== true` ⇒ 零写入、零留档、零审计。
 *
 * 幂等由 `fact-ring#supersede` 自身守（已失效者拒绝重复标记）⇒ 重复提交计 `skipped`
 * 且**不改既有失效时刻**（"何时失效"不被后来者覆盖）。
 */
export function applySupersedeOps(
  d: SupersedeApplyDeps,
  ops: readonly SupersedeOp[],
  opts: { enabled?: boolean; archiveDir?: string } = {},
): SupersedeApplyResult {
  const list = Array.isArray(ops) ? ops : []
  const res: SupersedeApplyResult = { ran: false, applied: 0, skipped: 0, archived: 0, reasons: [], verdicts: [], ok: true }
  if (!opts.enabled) {
    /* **默认关闭**：与 `proposal-apply` / `release` 同族理由 —— 执行面一旦默认开，
     *   就在生产上改写用户库。本项目的规矩是"接线上线、启用须显式"。 */
    res.skipped = list.length
    res.reasons.push('时态剔除落库**默认关闭**（设 `supersedeApply:true` 或 env `SHOUCANG_SUPERSEDE_APPLY=1` 才执行）⇒ 本轮零写入')
    res.verdicts = list.map((o) => ({ targetId: str(o?.targetId), verdict: 'skipped' as const, reason: 'disabled' }))
    return res
  }
  if (!list.length) { res.ran = true; return res }
  res.ran = true
  try {
    /* ⚠ **库未建 ⇒ 拒**（同 `ring-commit`：`loadStore` 对缺失 root 不报错，而 `saveStoreRecords`
     *   会把目录建出来 ⇒ 若 root 指错，产线会**凭空造出一个游离事实源**）。 */
    if (!existsSync(recordStorePath(d.root))) {
      res.ok = false
      res.reasons.push(`影子库未建（${RECORD_DIR}/ 不存在）⇒ 全部拒绝`)
      res.skipped = list.length
      res.verdicts = list.map((o) => ({ targetId: str(o?.targetId), verdict: 'skipped' as const, reason: 'no-store' }))
      d.log(`时态剔除落库跳过：${res.reasons[0]}`)
      return res
    }
    const cur = loadStore(d.root)
    if (cur.error) {
      res.ok = false
      res.reasons.push(`影子库不可用：${cur.error}`)
      res.skipped = list.length
      res.verdicts = list.map((o) => ({ targetId: str(o?.targetId), verdict: 'skipped' as const, reason: 'store-unreadable' }))
      return res
    }

    /* 逐条裁决（**纯函数区**，落模块级）：目标定位 → 幂等前置判 → `fact-ring#supersede` 裁决。
     *   抽出动因 = 本函数受 `audit-wiring` I1 棘轮（装配函数 ≤120 行）。 */
    const judged = judgeOps(d.at, cur.records, list)

    // ⑤ 留档落盘（**失败 ⇒ 整批拒改**：可还原优先于"改成功"）
    if (judged.applied) {
      try {
        const archiveDir = opts.archiveDir ?? supersedeArchiveDirOf(d.root)
        mkdirSync(archiveDir, { recursive: true })
        const f = join(archiveDir, `supersede-${String(d.at).replace(/[:.]/g, '-')}.jsonl`)
        appendFileSync(f, judged.rows.join('\n') + '\n', 'utf8')
        res.archived = judged.rows.length
      } catch (e) {
        res.ok = false
        res.skipped += judged.applied
        res.reasons.push(`留档失败 ⇒ 整批拒改（未写库）：${String((e as Error)?.message || e).slice(0, 80)}`)
        // 逐条把已裁决的 applied 改判为 skipped（**可见**，不是默默不算）
        res.verdicts = judged.verdicts.map((x) => (x.verdict === 'applied' ? { ...x, verdict: 'skipped' as const, reason: 'archive-failed' } : x))
        d.audit({ kind: 'fact-supersede', at: d.at, applied: 0, archived: 0, refused: 'archive-failed' })
        return res
      }
    }
    res.applied = judged.applied
    res.skipped += judged.skipped
    res.reasons.push(...judged.reasons)
    res.verdicts = judged.verdicts
    if (!judged.applied) return res

    // ⑥ 落库（唯一写入原语在 `saveStoreRecords` 内：唯一 tmp 名 + 原子 rename + 回读校验）
    saveStoreRecords(d.root, judged.records)
    d.audit({ kind: 'fact-supersede', at: d.at, applied: res.applied, archived: res.archived, skipped: res.skipped, ids: res.verdicts.filter((v) => v.verdict === 'applied').map((v) => v.targetId).slice(0, 12) })
    return res
  } catch (e) {
    res.ok = false
    res.reasons.push(String((e as Error)?.message ?? e).slice(0, 160))
    d.log(`时态剔除落库失败（不影响主链路）：${res.reasons[res.reasons.length - 1]}`)
    return res
  }
}

/**
 * **逐条裁决**（纯逻辑区，零 I/O；自 `applySupersedeOps` 抽出以解 I1 棘轮 120 行）。
 *
 * 四步（顺序即语义）：
 *   ① **目标定位** —— 优先 `targetId`（精确）；否则 `targetText` **逐字**匹配。
 *      **多命中与 0 命中一律拒绝**（不猜）：与 `section-ref#planPlacement` / `proposal-apply` 同口径。
 *   ② **幂等前置判** —— `validTo` 已有者拒绝（**先判再留档**：已失效者不该进档，否则档会重复膨胀）。
 *   ③ **纯函数裁决** —— 失效语义**唯一**来自 `fact-ring#supersede`（本件不另写一套）；
 *      失败只记 `supersede-refused`，不抛。
 *   ④ **攒留档行** —— 整行原文（含 `meta`/`validTo` 全部字段）：回滚时 `revive()` 只需 id，
 *      但档里留全文才谈得上"谁在何时失效了什么"可溯（沿用 forgetops/converge 的归档纪律）。
 */
function judgeOps(at: string, input: readonly MemRecord[], list: readonly SupersedeOp[]): {
  records: MemRecord[]; applied: number; skipped: number; reasons: string[]; verdicts: SupersedeVerdict[]; rows: string[]
} {
  let records: MemRecord[] = input.slice()
  const out = { applied: 0, skipped: 0, reasons: [] as string[], verdicts: [] as SupersedeVerdict[], rows: [] as string[] }
  for (const op of list) {
    const id = str(op?.targetId)
    const text = str(op?.targetText)
    if (!id && !text) {
      out.skipped++
      out.reasons.push('未给目标（`targetId` / `targetText` 二选一）⇒ 拒')
      out.verdicts.push({ targetId: '', verdict: 'skipped', reason: 'no-target' })
      continue
    }
    const hit = locate(records, id, text)
    if (!hit.record) {
      out.skipped++
      out.reasons.push(hit.why)
      out.verdicts.push({ targetId: id, verdict: 'skipped', reason: hit.reason })
      continue
    }
    const rec = hit.record
    if (rec.validTo) {
      out.skipped++
      out.reasons.push(`${rec.id}：已失效（${rec.validTo}）⇒ 不重复标记`)
      out.verdicts.push({ targetId: rec.id, verdict: 'skipped', reason: 'already-superseded' })
      continue
    }
    const r = supersede(records, rec.id, { at, note: str(op?.note), by: str(op?.by) })
    if (!r.ok) {
      out.skipped++
      out.reasons.push(`${rec.id}：${r.reason ?? '裁决拒绝'}`)
      out.verdicts.push({ targetId: rec.id, verdict: 'skipped', reason: 'supersede-refused' })
      continue
    }
    out.rows.push(JSON.stringify({ at, id: rec.id, kind: rec.kind, file: rec.file, text: rec.text, validTo: rec.validTo ?? '', meta: rec.meta ?? {}, note: str(op?.note), by: str(op?.by) }))
    records = r.records
    out.applied++
    out.verdicts.push({ targetId: rec.id, verdict: 'applied', reason: '已标失效（validTo 落库）' })
  }
  return { ...out, records }
}

/** 目标定位（**唯一实现**）：id 优先；否则逐字正文。多命中/0 命中均拒（不猜）。 */
function locate(records: readonly MemRecord[], id: string, text: string): { record?: MemRecord; reason: string; why: string } {
  if (id) {
    const m = records.filter((r) => r.id === id)
    if (m.length === 1) return { record: m[0], reason: 'ok', why: '' }
    return m.length === 0
      ? { reason: 'no-such-id', why: `目标不存在（${id}）` }
      : { reason: 'ambiguous-id', why: `id 歧义（命中 ${m.length} 条）` }
  }
  /* **逐字匹配**（不做模糊匹配 —— 模糊匹配 = 误标失效风险）。
   * 多命中 ⇒ **拒绝**（不猜）：与 `section-ref#planPlacement` / `proposal-apply` 的「多命中拒绝」口径一致。 */
  const m = records.filter((r) => r.text.trim() === text)
  if (m.length === 0) return { reason: 'no-match', why: '陈旧指令：目标正文在当下库中逐字未命中（库已变）' }
  if (m.length > 1) return { reason: 'ambiguous-text', why: `歧义：目标正文命中 ${m.length} 处（需唯一）⇒ 拒` }
  return { record: m[0], reason: 'ok', why: '' }
}

/** 读取留档（回滚入口用：`revive` 只需 id，此处给出 id 与原文供人工核对）。 */
export function readSupersedeArchive(root: string, file?: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  try {
    const f = file ?? join(supersedeArchiveDirOf(root), `supersede-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)
    for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!l.trim()) continue
      try { out.push(JSON.parse(l) as Record<string, unknown>) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 档不存在 = 空 */ }
  return out
}

/** 模型侧提交的一条失效提案（形状与两处 prompt 的 `supersedes` 通道一致）。 */
export interface SupersedeProposal {
  /** **目标正文**：须逐字抄自材料里给出的「相关既有记忆」/「现行条目清单」 */
  target?: unknown
  note?: unknown
  by?: unknown
}

/** 提案 → 指令的裁决结论（**纯函数**，供判据件断言"接线 ≠ 抵达"）。 */
export interface SupersedePlan {
  ops: SupersedeOp[]
  accepted: number
  rejected: number
  reasons: string[]
}

/**
 * **提案 → 指令**（纯函数，零 I/O）。
 *
 * 为什么单独成函数：本仓反复踩的「接线 ≠ 抵达」——把通道接上了，但模型给的字段**从不被真的消费**。
 *   把转换做成纯函数，判据件就能**直接调用并断言返回**（不 grep 源码、不靠日志猜）。
 *
 * 三条硬门（与 `fact-supersede-apply` 的目标定位同口径，**在入口先拦一道**）：
 *   ① 空目标 ⇒ 拒（模型留空是常态，不该进日志）；
 *   ② 目标不在**给定材料**里出现过 ⇒ 拒——这是**幻觉门**：模型很容易编一条"看起来像既有行"的文本，
 *      而编造的目标在库里要么 0 命中（白白留一条 noise 日志），要么**恰好命中一条真记录**（误标失效）。
 *      故要求"逐字来自材料"这一条**先于**库匹配成立。
 *   ③ 超长目标 ⇒ 拒（模型倾向把整段话当目标）。
 */
export function planSupersedeOps(
  proposals: unknown,
  seenLines: readonly string[],
  limits: { maxOps?: number; maxTargetChars?: number } = {},
): SupersedePlan {
  const list = Array.isArray(proposals) ? proposals : []
  const maxOps = Math.max(0, Number(limits.maxOps ?? 3) || 0)
  const maxChars = Math.max(1, Number(limits.maxTargetChars ?? 400) || 400)
  const seen = new Set((seenLines ?? []).map((l) => String(l).trim()).filter(Boolean))
  const out: SupersedePlan = { ops: [], accepted: 0, rejected: 0, reasons: [] }
  if (!list.length) return out
  for (const raw of list.slice(0, Math.max(maxOps, 0) || 0)) {
    const p = (raw ?? {}) as SupersedeProposal
    const target = str(p.target)
    if (!target) { out.rejected++; out.reasons.push('空目标 ⇒ 拒'); continue }
    if (target.length > maxChars) { out.rejected++; out.reasons.push(`目标超长（${target.length} > ${maxChars}）⇒ 拒`); continue }
    if (!seen.has(target)) {
      /* **幻觉门**：目标必须逐字出现在本轮**真的给过模型**的材料里。
       *   判因（与 `JUDGEMENT_VALUES` 同族）：模型没有库的实体表，写"目标"时只能凭印象 ——
       *   不设这道门，误标失效的风险直接落在真库上。 */
      out.rejected++
      out.reasons.push(`目标不在给定材料中（疑幻觉）⇒ 拒：${target.slice(0, 40)}`)
      continue
    }
    out.ops.push({ targetText: target, note: str(p.note), by: str(p.by) })
    out.accepted++
  }
  if (list.length > maxOps) out.reasons.push(`配额截断：提案 ${list.length} 条，上限 ${maxOps}`)
  return out
}

