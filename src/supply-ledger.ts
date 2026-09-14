/**
 * supply-ledger.ts — 会话级注入台账（P1 · 2026-09-13；v2 改「轮次窗口」去重）
 *
 * 解决的问题（实测）：MCL 慢通道材料的「已注入」信息原本存在 `SessMcl.topics` 里，而 `state.delete(sid)`
 *   在**每收到一条用户消息**时把它清掉（mcl.ts L214-215）⇒ 去重信息被自己的重置删除 ⇒ 同一会话内
 *   同一批指针逐字重复注入（实测 8 次注入 / 2,955 字符中 782 字符 = 26% 是重复）。
 *
 * ⚠ v2 修正（2026-09-13 质量回归评估发现的风险）：v1 是「**整会话永久去重**」——某行注入过一次就再不注入。
 *   风险：① 上下文压缩后材料已不在模型窗口内，台账却仍说"给过" ⇒ **该记忆对整个会话失效**；
 *        ② 模型当轮忽略的历史经验永不再被提示。而实测的浪费形态是**相邻轮重复**（375/375、407/407 逐字相同），
 *        不是"隔很多轮后再给"。
 *   ⇒ 改为**轮次窗口去重**：只压制"最近 WINDOW 轮内给过"的行，窗口外允许重新注入（有界、可持续、仍消掉实测浪费）。
 *
 * 设计（对应方案档 D3/D4）：
 *   - 台账键 = 会话 id，生命周期独立于轮级 state（轮级每条用户消息重置，台账跨轮累积但**按窗口衰减**）；
 *   - 记录单位 = 行指纹（内容哈希）⇒ 内容变更即视为新行；
 *   - 轮次由 `newTask(sid)` 推进（mcl 在收到用户消息时调用）；窗口外条目在推进时清理；
 *   - 零依赖、零抛出：任何异常都不影响主链路（宁可不省，不可打断）。
 */

/** 去重窗口（轮）：只压制"最近 N 轮内给过"的行。3 = 覆盖实测到的相邻轮重复，同时不长期屏蔽 */
export const DEDUP_WINDOW_TURNS = 3

export interface SupplyLedgerStats {
  /** 在册会话数 */
  sessions: number
  /** 在册行指纹总数（窗口内） */
  rows: number
  /** 累计登记次数 */
  marked: number
  /** 累计清理数（过期会话 + 窗口外条目） */
  swept: number
  /** 在册会话轮次合计 */
  turns: number
  /** 去重窗口（轮） */
  window: number
}

export interface SupplyLedger {
  /** 推进本会话轮次（收到一条用户消息时调用）；返回新轮次序号；顺带清掉窗口外条目 */
  newTask(sid: string): number
  /** 该行在本会话**最近 WINDOW 轮内**是否注入过 */
  seen(sid: string, fp: string): boolean
  /** 登记若干行（记当前轮次）；返回新登记条数 */
  mark(sid: string, fps: readonly string[]): number
  /** 显式忘掉一个会话（回滚/调试用） */
  forget(sid: string): boolean
  /** 惰性清理：返回被清理的会话数 */
  sweep(maxAgeMs?: number): number
  stats(): SupplyLedgerStats
}

/** 缺省 TTL：12h（长于任何正常会话） */
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000
/** sweep 触发节流：每 N 次调用探测一次 */
const SWEEP_EVERY = 128

/**
 * 内容指纹（djb2 变体 → base36）。同一行内容改动一个字即换指纹 ⇒ 视为新内容、允许重新注入。
 */
export function fingerprintOf(text: string): string {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** 召回行 → 指纹（以行文本为准；行内已含标签·主题·指针三段，足以区分） */
export function rowFingerprint(row: { line?: unknown }): string {
  return fingerprintOf(String((row as { line?: string })?.line || ''))
}

export function createSupplyLedger(now: () => number = Date.now): SupplyLedger {
  const sessions = new Map<string, { epoch: number; rows: Map<string, number>; lastAt: number }>()
  let marked = 0
  let swept = 0
  let calls = 0

  const sweep = (maxAgeMs: number = DEFAULT_TTL_MS): number => {
    const cut = now() - maxAgeMs
    let n = 0
    for (const [sid, e] of sessions) if (e.lastAt < cut) { sessions.delete(sid); n++ }
    swept += n
    return n
  }
  const tick = (): void => { calls++; if (calls % SWEEP_EVERY === 0) sweep() }
  const entryOf = (sid: string, at: number) => {
    let e = sessions.get(sid)
    if (!e) { e = { epoch: 0, rows: new Map(), lastAt: at }; sessions.set(sid, e) }
    return e
  }

  return {
    newTask(sid: string): number {
      try {
        tick()
        const at = now()
        const e = entryOf(sid, at)
        e.epoch += 1
        e.lastAt = at
        // 窗口外条目清理（防无界增长；窗口 = DEDUP_WINDOW_TURNS）
        const floor = e.epoch - DEDUP_WINDOW_TURNS
        for (const [fp, ep] of e.rows) if (ep <= floor) { e.rows.delete(fp); swept++ }
        return e.epoch
      } catch { return 0 }
    },
    seen(sid: string, fp: string): boolean {
      try {
        tick()
        const e = sessions.get(sid)
        if (!e) return false
        const ep = e.rows.get(fp)
        if (ep === undefined) return false
        // 只在窗口内才算"已给过"；窗口外视为可重新注入（防"压缩后永久失效"）
        return e.epoch - ep < DEDUP_WINDOW_TURNS
      } catch { return false }
    },
    mark(sid: string, fps: readonly string[]): number {
      try {
        tick()
        const at = now()
        const e = entryOf(sid, at)
        let fresh = 0
        for (const fp of fps) {
          if (!fp) continue
          if (!e.rows.has(fp)) fresh++
          e.rows.set(fp, e.epoch)
        }
        e.lastAt = at
        marked += fresh
        return fresh
      } catch { return 0 }
    },
    forget(sid: string): boolean {
      try { return sessions.delete(sid) } catch { return false }
    },
    sweep,
    stats(): SupplyLedgerStats {
      let rows = 0
      let turns = 0
      for (const e of sessions.values()) { rows += e.rows.size; turns += e.epoch }
      return { sessions: sessions.size, rows, marked, swept, turns, window: DEDUP_WINDOW_TURNS }
    },
  }
}
