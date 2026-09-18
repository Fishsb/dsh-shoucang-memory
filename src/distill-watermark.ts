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

/**
 * 阶段 2（2026-09-14）：**流程实例** —— 让「这一轮跑到哪一步」可查询。
 *
 * 背景（审核 `docs/eda-architecture-audit-20260914.md` F1）：原先的续传状态**只是一个数字**
 * （`lastSeq`），加上内存态（`distilling` / `dispatchFailStreak`）重启清零 ⇒
 * **没有「当前在第几步」这回事，只有「上次到哪」**。后果：spawn 卡住 10 分钟时无从判断，
 * 面板也查不到蒸馏进度。
 *
 * 形态：**纯增量**追加字段，既有字段语义一律不动
 * （本件头注 :54-57 已记：为形态对齐去动水位读链风险与收益不成比例）。
 * 旧行没有这些字段 ⇒ `readRunState` 回落 `phase='unknown'`，与旧行为完全等价。
 */
export interface RunState {
  /** 一次蒸馏 run 的标识（跨段共享；重启后由新 run 重新生成） */
  runId: string
  /** 当前阶段：`spawn` / `segment-done` / `forced` / `retry`（册四新增 `retry`=本轮段级失败待重试） */
  phase: string
  attempt?: number
  /**
   * 段身份（册一 · 内容指纹）——**册四**用它把「重试计数」绑到**同一段内容**上：
   *   读侧只认 `segKey` 相同的行，内容变了即视为新段（计数归零），故热重载/重启后计数可**重建**。
   */
  segKey?: string
}

export interface RunSnapshot {
  runId: string | null
  phase: string
  lastSeq: number
  updatedAt: string
  /** 本轮（末行）重试计数；旧行无此字段 ⇒ 0 */
  attempt: number
  /** 本轮（末行）段身份；旧行无此字段 ⇒ ''（读侧按"不匹配"处理，等价于计数归零） */
  segKey: string
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
    readRunState: (...a: Tail<Parameters<typeof readRunState>>) => readRunState(d, ...a),
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

/**
 * 阶段 2：读回某会话的**流程实例快照**（取该会话最后一行为准）。
 *
 * 为什么取最后一行：水位流是 append-only 且**同名覆盖 = 末行生效**（与 `readWatermarks` 同口径），
 *   故末行就是「最近一次推进后的状态」。
 * 旧行兼容：v18 之前的历史行没有 `runId`/`phase` ⇒ 回落 `runId=null, phase='unknown'`
 *   ——**不加这个兜底，升级后首次读会把历史会话全判成"运行中"**。
 * 零抛出：水位文件不可读时返回 null（调用方按"无实例"处理）。
 */
const readRunState = (d: WmDeps, sid: string): RunSnapshot | null => {
  const wm = readWatermarks(d).get(sid)
  if (!wm) return null
  return {
    runId: typeof wm.runId === 'string' ? wm.runId : null,
    phase: typeof wm.phase === 'string' ? wm.phase : 'unknown',
    lastSeq: Number(wm.lastSeq) || 0,
    updatedAt: typeof wm.at === 'string' ? wm.at : '',
    // 册四（2026-09-19）：重试计数与段身份回读（旧行缺字段 ⇒ 0 / ''，语义 = "无在途重试"）
    attempt: Number(wm.attempt) || 0,
    segKey: typeof wm.segKey === 'string' ? wm.segKey : '',
  }
}

const writeWatermark = (d: WmDeps, sessionId: string, lastSeq: number, agent?: any, run?: RunState): void => {
  try {
    // 双证随行（2026-09-10 v19）：格式代 + 锚点事件指纹。缺失则退化为纯数字水位（与旧行同构）。
    const ver = sessionFormatVersionOf(d, agent)
    const fp = agentFingerprintAt(d, agent, lastSeq)
    mkdirSync(dirname(d.watermarkFile), { recursive: true })
    appendFileSync(d.watermarkFile, JSON.stringify({
      sessionId, lastSeq, at: new Date().toISOString(),
      // 阶段 2：流程实例（**纯增量**；不传 run 时完全等同旧行，零行为变化）
      // 册四：`segKey` 一并落盘 —— 重试计数与段身份**同寿**（读侧按 `segKey` 匹配重建计数，见 readRunState）
      ...(run ? { runId: run.runId, phase: run.phase, ...(run.attempt === undefined ? {} : { attempt: run.attempt }), ...(run.segKey === undefined ? {} : { segKey: run.segKey }) } : {}),
      // DS4 形态统一（2026-09-13）：补判别字段 `type`，使本流具备与统一事件流合并的前提。
      // ⚠ **刻意不改** `sessionId` → `sid`：读侧 `readWatermarks` 与 G-20 双证守卫都按 `sessionId` 取键，
      //   为一次形态对齐去动**水位守卫**的读链，风险与收益不成比例。此处记下该偏离（合并时做字段映射即可）。
      type: 'watermark',
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
