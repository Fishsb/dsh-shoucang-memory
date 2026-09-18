// proposal-apply.ts — **S3 侧执行 L2 校正提案**（S2S3 册二 · 关闭 G3 的执行面）
//
// 由来：册一的 L2 会话级复盘**只产提案**（`<bank>/audit/session-review/proposals-<sid>.jsonl`，
//   append-only、执行权留 S3 —— 见 `session-review.ts` 抬头）；本件是那条流的**唯一消费者**。
//
// 分工与不变量：
//   · **执行权只在 S3**（本件由 `deepsleep-run` 调用），L2 侧永不改库 ⇒ 不撞 S2「只增不改历史」；
//   · 写路径**只用唯一写入原语**（`section-rewrite#editFileUnderLock`：库锁 + 唯一 tmp + 原子 rename + 写后回读）；
//   · **先留档再改**（`rollback/<opHash>.json` 存被改行原文）⇒ 「可还原」不是口头的；
//   · **幂等**：`(sid, opHash)` 记进 `applied.jsonl`，复跑即 no-op（G3 的第三半）；
//   · **fail-closed 默认关闭**：只有显式 `SHOUCANG_PROPOSAL_APPLY=1` 才执行 —— 与 release 同族理由：
//     执行面一旦默认开，就在生产上**改写用户库**；本项目的规矩是"接线上线、启用须显式"。
//
// 支持范围（**如实划定，不假装全支持**）：
//   · `revise` —— **逐字行级校正**：`before` 必须在目标文件里**逐字命中**（同 `distill-write` 的 replace 语义），
//      命中 ⇒ 用 `after` 替换该行；未命中 ⇒ 跳过并记「陈旧提案」。**不做模糊匹配**（模糊匹配 = 误改风险）。
//   · `merge` / `demote` —— **显式不执行**（需要成对取证与结构担保，属后续批次）；跳过时**逐条留理由**，绝不静默。
//   · `mainline` —— 不是库写入（会话主线），记 `not-a-write` 跳过。
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { editFileUnderLock } from './section-rewrite.js'

/** 一条 L2 提案（形状与 `session-review#appendProposals` 写出的行一致）。 */
export interface L2Proposal {
  at?: string
  sid: string
  reviewedSeq?: number
  opHash: string
  op: string
  /** **相对库根的路径**（如 `notes/env.md`）；绝对路径 / 越出库根 ⇒ 拒执行。 */
  target?: string
  section?: string
  before?: string
  after?: string
  why?: string
}

export const proposalDirOf = (bankRoot: string): string => join(String(bankRoot), 'audit', 'session-review')
/** 已执行账（幂等键来源；只增不改）。 */
export const appliedLedgerOf = (bankRoot: string): string => join(proposalDirOf(bankRoot), 'applied.jsonl')
/** 回滚留档目录（每 op 一份 JSON，含被改行原文）。 */
export const rollbackDirOf = (bankRoot: string): string => join(proposalDirOf(bankRoot), 'rollback')

const readLines = (p: string): string[] => {
  try { return readFileSync(p, 'utf8').split(/\r?\n/) } catch { return [] }
}
const jsonRows = (p: string): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = []
  for (const l of readLines(p)) {
    if (!l.trim()) continue
    try { out.push(JSON.parse(l) as Record<string, unknown>) } catch { /* 坏行跳过 */ }
  }
  return out
}

/** 已执行的 `opHash` 集合（幂等判据的**唯一**来源）。 */
export function appliedHashes(bankRoot: string): Set<string> {
  const s = new Set<string>()
  for (const r of jsonRows(appliedLedgerOf(bankRoot))) {
    const h = String(r.opHash || '')
    if (h) s.add(h)
  }
  return s
}

/** 待执行提案（全部 `proposals-<sid>.jsonl` 减已执行）。 */
export function readPendingProposals(bankRoot: string): L2Proposal[] {
  const dir = proposalDirOf(bankRoot)
  if (!existsSync(dir)) return []
  const done = appliedHashes(bankRoot)
  const out: L2Proposal[] = []
  for (const f of readdirSync(dir)) {
    if (!/^proposals-.*\.jsonl$/.test(f)) continue
    for (const r of jsonRows(join(dir, f))) {
      const p = r as unknown as L2Proposal
      if (!p || !p.opHash || done.has(p.opHash)) continue
      out.push(p)
    }
  }
  return out
}

/** 目标路径必须在库根内（**路径穿越防线**：`../` 与绝对路径一律拒）。 */
export function insideBank(bankRoot: string, rel: string): string | null {
  const root = resolve(String(bankRoot))
  const p = resolve(root, String(rel || ''))
  if (p !== root && !p.startsWith(root + sep)) return null
  return p
}

export interface ApplyResult {
  ran: boolean
  applied: number
  skipped: number
  reasons: string[]
  /** 逐条裁决（**可核验**：审计与测试都读它，不靠日志猜）。 */
  verdicts: Array<{ opHash: string; op: string; verdict: 'applied' | 'skipped'; reason: string }>
}

/**
 * 执行一批 L2 提案。**fail-closed**：`enabled !== true` ⇒ 零写入、零留档、零账行。
 * `maxPerRun`（缺省 3）与 release 同口径：单轮上限，超出留待下轮。
 */
export function applySessionProposals(
  d: { bankRoot: string; log: (m: string) => void; audit: (o: Record<string, unknown>) => void; enabled?: boolean; maxPerRun?: number },
  proposals: L2Proposal[] = readPendingProposals(d.bankRoot),
): ApplyResult {
  const reasons: string[] = []
  const verdicts: ApplyResult['verdicts'] = []
  if (!d.enabled) {
    return { ran: false, applied: 0, skipped: proposals.length, reasons: ['提案执行**默认关闭**（设 SHOUCANG_PROPOSAL_APPLY=1 才执行）⇒ 本轮零写入'], verdicts: proposals.map((p) => ({ opHash: p.opHash, op: p.op, verdict: 'skipped' as const, reason: 'disabled' })) }
  }
  const max = Math.max(1, Number(d.maxPerRun) || 3)
  let applied = 0, skipped = 0
  for (const p of proposals.slice(0, max)) {
    const op = String(p.op || '')
    if (op !== 'revise') {
      /* 未实现 / 非写入：**逐条留理由**（"没做"必须可见 —— 沉默的跳过等于假绿）。 */
      const why = op === 'mainline' ? 'mainline 不是库写入（会话主线，由 L2 侧审计承载）' : `${op} 尚未实现（需成对取证与结构担保，属后续批次）`
      skipped++; reasons.push(`${p.opHash.slice(0, 8)} ${op}：${why}`)
      verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: why })
      continue
    }
    const rel = String(p.target || '')
    const abs = insideBank(d.bankRoot, rel)
    if (!abs) { skipped++; reasons.push(`${p.opHash.slice(0, 8)}：目标路径越出库根（拒执行）：${rel}`); verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: 'path-outside-bank' }); continue }
    if (!existsSync(abs)) { skipped++; reasons.push(`${p.opHash.slice(0, 8)}：目标文件不存在：${rel}`); verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: 'no-such-file' }); continue }
    const before = String(p.before || '').trim()
    const after = String(p.after || '').trim()
    if (!before || !after) { skipped++; reasons.push(`${p.opHash.slice(0, 8)}：revise 缺 before/after（拒执行）`); verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: 'missing-before-after' }); continue }
    /* **陈旧提案**：`before` 必须逐字命中**当下**内容 —— 命中行才替换（不做模糊匹配）。 */
    const linesNow = readLines(abs)
    const hit = linesNow.filter((l) => l.trim() === before).length
    if (hit !== 1) {
      skipped++
      const why = hit === 0 ? '陈旧提案：before 在当下文件中逐字未命中（库已变）' : `歧义：before 命中 ${hit} 处（需唯一）`
      reasons.push(`${p.opHash.slice(0, 8)}：${why}`)
      verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: why })
      continue
    }
    /* **先留档再改**：回滚文件写失败 ⇒ 不改（可还原优先于"改成功"）。 */
    try {
      const rb = join(rollbackDirOf(d.bankRoot), `${String(p.opHash).replace(/[^\w.-]/g, '_')}.json`)
      mkdirSync(dirname(rb), { recursive: true })
      appendFileSync(rb, JSON.stringify({ at: new Date().toISOString(), sid: p.sid, opHash: p.opHash, file: rel, before, why: p.why || '' }) + '\n', 'utf8')
    } catch (e) {
      skipped++; reasons.push(`${p.opHash.slice(0, 8)}：留档失败 ⇒ 拒改（${String((e as Error)?.message || e).slice(0, 60)}）`)
      verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: 'rollback-write-failed' })
      continue
    }
    const w = editFileUnderLock(d.bankRoot, abs, (lines) => {
      const i = lines.findIndex((l) => l.trim() === before)
      if (i < 0) return null
      const indent = (lines[i].match(/^\s*/) || [''])[0]
      const next = lines.slice()
      next[i] = indent + after
      return next
    }, { note: `l2-proposal ${String(p.opHash).slice(0, 8)}` })
    if (!w.ok || !w.changed) {
      skipped++; reasons.push(`${p.opHash.slice(0, 8)}：写入未生效（${w.error || 'no-change'}${w.refused ? ' · 库锁被占用' : ''}）`)
      verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: w.refused ? 'lock-refused' : 'write-failed' })
      continue
    }
    try {
      appendFileSync(appliedLedgerOf(d.bankRoot), JSON.stringify({ at: new Date().toISOString(), sid: p.sid, opHash: p.opHash, op, file: rel, section: p.section || '' }) + '\n', 'utf8')
    } catch { /* 账行失败不回滚已成功的改写（下一次同 opHash 会重复执行一次 —— 记在 reasons 里，不静默） */ reasons.push(`${p.opHash.slice(0, 8)}：⚠ 应用账落盘失败（幂等键未记，可能重复执行）`) }
    applied++
    verdicts.push({ opHash: p.opHash, op, verdict: 'applied', reason: 'revise（逐字命中 ⇒ 已改 + 已留档）' })
    d.log(`proposal-apply: ${rel} 已按 L2 提案校正（${p.opHash.slice(0, 8)}）`)
  }
  return { ran: true, applied, skipped, reasons, verdicts }
}
