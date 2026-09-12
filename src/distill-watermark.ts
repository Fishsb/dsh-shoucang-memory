// distill-watermark.ts — 蒸馏「蒸馏水位（会话 seq 基准与回退裁决）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（5 项）。
//   对外只暴露 createWmApi(d) —— 返回绑定后的句柄，调用方零感知。
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveWatermarkBaseline, runDiscardWatermark } from './deepsleep-core.js'
import type { WmBaseline } from './deepsleep-core.js'
import type { DistillState } from './distill-state.js'

export interface WmDeps {
  watermarkFile: string
  log(m: string): void
  audit(o: Record<string, unknown>): void
  sidShort(sid: string): string
  st: DistillState
}

/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never

export function createWmApi(d: WmDeps) {
  return {
    readWatermarks: (...a: Tail<Parameters<typeof readWatermarks>>) => readWatermarks(d, ...a),
    writeWatermark: (...a: Tail<Parameters<typeof writeWatermark>>) => writeWatermark(d, ...a),
    sessionFormatVersionOf: (...a: Tail<Parameters<typeof sessionFormatVersionOf>>) => sessionFormatVersionOf(d, ...a),
    agentFingerprintAt: (...a: Tail<Parameters<typeof agentFingerprintAt>>) => agentFingerprintAt(d, ...a),
    discardWatermark: (...a: Tail<Parameters<typeof discardWatermark>>) => discardWatermark(d, ...a),
    resolveWatermark: (...a: Tail<Parameters<typeof resolveWatermark>>) => resolveWatermark(d, ...a),
  }
}
export type WmApi = ReturnType<typeof createWmApi>

const readWatermarks = (d: WmDeps, ): Map<string, any> => {
  const map = new Map<string, any>()
  try {
    for (const l of readFileSync(d.watermarkFile, 'utf8').split('\n')) {
      if (!l.trim()) continue
      try { const o = JSON.parse(l); map.set(o.sessionId, o) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 无水位文件=全新 */ }
  return map
}

const writeWatermark = (d: WmDeps, sessionId: string, lastSeq: number, agent?: any): void => {
  try {
    // 双证随行（2026-09-10 v19）：格式代 + 锚点事件指纹。缺失则退化为纯数字水位（与旧行同构）。
    const ver = sessionFormatVersionOf(d, agent)
    const fp = agentFingerprintAt(d, agent, lastSeq)
    mkdirSync(dirname(d.watermarkFile), { recursive: true })
    appendFileSync(d.watermarkFile, JSON.stringify({
      sessionId, lastSeq, at: new Date().toISOString(),
      ...(ver === undefined ? {} : { formatVersion: ver }),
      ...(fp === null ? {} : { fp }),
    }) + '\n', 'utf8')
    // G-20：任一成功写入 = 本轮快照可用 → 熔断计数复位（单一复位点，覆盖全部写入点）
    d.st.snapshotUnavailableStreak.delete(sessionId)
  } catch { /* 静默 */ }
}

// ═══ 水位双证校验（2026-09-10 v19：抗会话格式代际迁移的 seq 重排）═══
// 背景（alpha V0→V3 迁移实锤）：DSH 会话格式升级时 seq 被**密集重排**并插入 system/message 行，
// 同一个数字不再指向同一个事件；守藏水位是自持的 sessionId→lastSeq 数字，迁移后：
//   ① 若 live seq 空间比记录的小 → 增量窗口被放大成整会话 → LLM 成本爆炸 + 重复入册；
//   ② 若 live seq 空间更大 → 事件在挪位后的序号上未被消费 → 静默跳过一段真实增量。
// 两种都无声出错，故记录时同时落「格式代 + 锚点事件指纹」，读取时双证一致才信任：
//   - 格式代不同（v0/v1/v2 → v3）= 已发生迁移 → 作废全量重蒸（宁可重蒸，不可错漏）；
//   - 锚点事件指纹（type|time|data 长度）不符 = 序号空间被重排 → 同样作废；
//   - 两证皆缺（v19 前的历史水位行）= 不可验证 → 不信任（重蒸一次，随后被新行升级为双证）。
const sessionFormatVersionOf = (d: WmDeps, agent: any): number | undefined => {
  try { const v = agent?.session?.header?.version; return typeof v === 'number' ? v : undefined } catch { return undefined }
}

/** 锚点事件指纹：记录时刻 lastSeq 处事件的 type|time|data 长度（seq 重排后此三元组随之改变）。 */
const agentFingerprintAt = (d: WmDeps, agent: any, seq: number): string | null => {
  try {
    if (!(seq > 0) || typeof agent?.session?.eventAt !== 'function') return null
    const e: any = agent.session.eventAt(seq)
    if (!e) return null
    let dl = -1
    try { dl = JSON.stringify(e.data ?? null).length } catch { /* 不可序列化 → -1 */ }
    return `${e.type || '?'}|${e.time ?? -1}|${dl}`
  } catch { return null }
}

/**
 * 未验证水位行的一次性收尾（作废留痕）：**跳到当前 live maxSeq 并写双证**，而不是写 0。
 * 为何不是 0：写 0 的行没有可用锚点（seq 0 无事件）→ 下次读仍判「不可验证」→ 每轮全量重蒸，形成死循环。
 * 为何跳到 maxSeq 是安全的：作废的三种情形（格式代变更 / 锚点指纹不符 / 双证缺失的历史行）都意味着
 * 「已消费边界」不可定位——不可定位就无法安全重蒸（可能错位重蒸整会话，也可能错位跳过），
 * 故从当前边界继续；旧版本已消费的部分由旧版本负责，不重复也不再回补。
 * 代价明确且可接受：不可定位的那一段增量不再回补（宁可少蒸一次，不可错位重蒸/错位跳过）。
 * G-20（2026-09-12）：本注释此前被自身代码违反——`snapshotEvents()` 抛异常时 catch 把 maxSeq 退化为 0，
 *   随后仍 `writeWatermark(d, sid, 0, agent)`，即写下本注释明令禁止的「0 行」。现由 runDiscardWatermark
 *   强制：maxSeq<=0 ⇒ **不写**（读侧 `lastSeq<=0 → null` 与不写等价，写 0 只污染文件与审计）。
 */
const discardWatermark = (d: WmDeps, sid: string, reason: string, agent: any, wm: any): { maxSeq: number; wrote: boolean } => {
  // G-20：实现下沉到导出的 runDiscardWatermark（可单测）；此处只管熔断计数的推进/复位，并回传 live 边界。
  const r = runDiscardWatermark(sid, reason, agent, wm, d.st.snapshotUnavailableStreak.get(sid) ?? 0, {
    writeWatermark: (...a) => writeWatermark(d, ...a), audit: d.audit, log: d.log, versionOf: (...a) => sessionFormatVersionOf(d, ...a),
  })
  if (r.wrote) {
    // 成功写入时 writeWatermark 已复位计数；此处保留原日志口径
    d.log(`watermark: ${d.sidShort(sid)} 双证失效（${reason}）→ 从当前边界 ${r.maxSeq} 继续（prevSeq=${wm?.lastSeq ?? '-'} prevVer=${wm?.formatVersion ?? '-'} ver=${sessionFormatVersionOf(d, agent) ?? '-'}）`)
  } else {
    d.st.snapshotUnavailableStreak.set(sid, r.streak)
  }
  return { maxSeq: r.maxSeq, wrote: r.wrote }
}

/**
 * 取基线。返回 null **仅当**真的需要全量（水位缺失 / seq 空间回退 / 快照不可用）；
 * 双证失效但 live 边界未回退时返回**降级基线**（lastSeq=当前 live maxSeq, degraded=true），
 * 不再返回裸 null —— 旧码返回 null 会让调用方 `baseline ? baseline.lastSeq : 0` 把 lastSeq 打成 0 ⇒ 整窗重蒸。
 */
const resolveWatermark = (d: WmDeps, sid: string, agent: any, mapCache?: Map<string, any>): WmBaseline | null => {
  const wm = (mapCache || readWatermarks(d, )).get(sid)
  return resolveWatermarkBaseline(sid, wm, agent, {
    discard: (...a) => discardWatermark(d, ...a),
    versionOf: (...a) => sessionFormatVersionOf(d, ...a),
    fingerprintAt: (...a) => agentFingerprintAt(d, ...a),
  })
}
