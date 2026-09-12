// deepsleep-machine.ts — 深睡**会话状态机**（自 createDeepSleep 提出）
//
// 为什么单独成件：createDeepSleep 232 行 > audit-wiring I1 的 120 行上限，而它体内真正"厚"的
//   是这台状态机（noteEvent / 启动回放 / 巡检 / 快照 / 手动触发 / 配置），共 ~125 行。
//   状态（sessions / 水位 / 并发闸）仍归 createDeepSleep 所有，这里以 **SleepMachine 箱**按引用操作 ——
//   标量字段（lastDeepSleepAt 等）必须装箱，否则写不回装配层（与 streak 装箱同一理由）。
import { readFileSync } from 'node:fs'
import type { SessRec, SessState, DeepSleepStatus } from './deepsleep-core.js'
import { deepSleepReplayable } from './deepsleep-core.js'
import { probeSession, type ProbeDeps } from './deepsleep-probe.js'
import { runDeepSleep, type RunDeps } from './deepsleep-run.js'
import type { SleepIo, SleepSession, SleepState } from './deepsleep-contract.js'

/** 装配层持有的**可变**状态（按引用传给状态机；标量必须装箱才写得回）。 */
export interface SleepMachine {
  sessions: Map<string, SessRec>
  lastActivityAt: number
  lastDeepSleepAt: number
  deepSleepRunning: boolean
}

/** 状态机需要的**依赖**（全部由 createDeepSleep 装配期构造）。 */
export interface MachineDeps {
  config: any
  ctx: any
  io: SleepIo
  session: SleepSession
  state: SleepState
  probe: ProbeDeps
  run: RunDeps
}



/** 状态迁移入口：任意事件 → RUNNING；turn/end(completed) → ENDED（停滞计时起点） */
export function noteEvent(dep: MachineDeps, m: SleepMachine, sid: string, isTurnEnd: boolean): void {
  const now = Date.now()
  m.lastActivityAt = now
  const rec = m.sessions.get(sid) || { sid, state: 'running' as SessState, lastEventAt: now, lastEndAt: 0, probeAt: 0, probeRound: 0, stallRound: 0 }
  rec.lastEventAt = now
  // 任何新事件都让会话「复活」：清掉探测/卡住计数（卡住的会话若恢复输出，不应继续按 stall 处理）
  rec.state = isTurnEnd ? 'ended' : 'running'
  if (isTurnEnd) rec.lastEndAt = now
  rec.probeAt = 0
  rec.probeRound = 0
  rec.stallRound = 0
  rec.probeResult = undefined
  m.sessions.set(sid, rec)
}

/** 启动水位回放：取审计最新时间（重启不重置停滞判定）+ 上次深睡时间（痕迹窗口起点）。 */
export function replayWatermark(dep: MachineDeps, m: SleepMachine): void {
  
  // 启动水位回放：取蒸馏审计最新时间（重启不重置停滞判定）；同时回放上次深度睡眠时间（痕迹窗口起点）
  try {
    for (const l of readFileSync(dep.io.auditFile, 'utf8').split('\n')) {
      if (!l.trim()) continue
      try {
        const o = JSON.parse(l) as { at?: string; kind?: string }
        const t = Date.parse(String(o.at))
        if (Number.isNaN(t)) continue
        if (t > m.lastActivityAt) m.lastActivityAt = t
        // 只回放「确实消化过痕迹」的深睡：error / no-parent / no-traces 都不推进水位——
        // no-traces 说明本轮一条痕迹都没收到（可能只是窗口被上一轮污染），
        // 若把它当水位，会把窗口内早于该时刻的痕迹永久关在窗外（当天再也回想不到）。
        // 2026-09-11：判据收敛到导出的 `deepSleepReplayable`（单一实现，供单测直接驱动编译产物）。
        // 旧判据只排 no-parent/no-traces（"无事可做"），漏排"做了但被拒"（attempted>0 && added=0）——
        // 那类轮次被当有效水位回放，那批痕迹就永久关在窗外（重启一次即丢料）。
        if (deepSleepReplayable(o) && t > m.lastDeepSleepAt) m.lastDeepSleepAt = t
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 无审计文件=新装 */ }
}






/**
 * consolidation v1（2026-09-10 用户拍板：向量去重整合通道，并入深度睡眠巡检）——
 * 树状记忆/画像（索引行冠层 → notes ##/###/#### 子树）只增不修的补偿机制：周期性去重整合。
 *
 * 子步骤（顺序执行，只改确有变化的文件；每文件写入一律「tmp 写后 rename 原子覆盖」，与本文件
 * applyPrinciples/applyPointerOps 落盘纪律一致）：
 *   A 索引行精确重复折叠（MEMORY.md/USER.md/AGENT.md）：同文件内 trim 后完全相同的指针行保留首次。
 *   B 索引行语义近重折叠（同一批文件）：组键=同文件+同 [标签]+同指针目标（同 notes 文件且 §小节名
 *     双向包含）；组内行两两 semanticSim 比较「去掉指针尾（→ 起）后的前段文本」，sim≥0.90 视为同事实
 *     → 保留概况（字符）较长者、删除较短者（保留/删除皆归档）。
 *   C 同小节正文行去重（notes/*.md 除 INDEX.md）：小节=某标题到下一「同层或更高层」标题之间、且不含
 *     子标题区；小节内 trim 完全相同的非空正文行保留首次，其余删除（删除前该小节整段原文归档一次）。
 *   D 叶子小节语义合并（notes/*.md 除 INDEX.md）：候选=同文件内两两「无子标题的叶子小节」，比较
 *     标题+正文 semanticSim≥0.95（正文逐行全同视为 1.0 直并；sim 为 null 时跳过语义但允许正文全同直并）。
 *
 * 树感知规则（用户「合并/调整树干时树枝必须有明确去向」）：
 *   - phase-1 限制：D 只并**叶子小节**（其下无更深子标题）——带子树的树干（如被并小节含 ###/#### 子树）
 *     本版明确不合并，避免树枝悬空/孤儿子树；带子树树干合并留给后续阶段（与 LLM 跨主题大合并同批）。
 *   - 被并小节删除后，其全文先归档（可回滚），且同文件索引行（MEMORY/USER/AGENT）中指向它的
 *     「§另一小节名」指针段**整段改写**为 canonical 小节去日期核心名 → 不留悬空指针。
 *   - 守卫：另一小节标题核心名与 canonical 核心名双向包含（同族/同名演化小节）→ 保守跳过；正文为空
 *     或「正文等长且内容不同」→ 无法唯一确定 canonical → 跳过。
 *   - 阈值 0.90（索引概况前段）/ 0.95（小节全文）为保守高置信，宁少勿错；校准预留：样本累积后按
 *     误并/漏并分布再下调或分档（本 v1 不做跨主题大合并）。
 * embed 不可用（embedCfgOf().enabled=false / semanticSim 返回 null / HTTP 失败）→ 整函数自动退化为
 * 「只做确定性去重」（A/C 恒做；D 仅正文全同直并；B 无语义折叠），不报错、不中断深睡主流程。
 * 全程防御式：内部 try/catch，单文件出错跳过继续，绝不抛出。
 */

/**
 * 深睡 parent 兜底（2026-09-08 修复：无 parent 直接崩 —— reading 'options'）。
 * 悖论：深睡在「全部会话停滞/结束」时触发，此时 ctx.agents.roots() 常为空，
 * 而宿主 spawn 必须有 parent（resolveChildDepth 读 parent.options）→ 必然会睡的时候必然崩。
 * 解法：事件中缓存最近一次活动过的 agent（对象带 options/ctx 即可当 parent 用），
 * 顺序=当前 roots → 在册 agents → 缓存的最近 agent；都没有则跳过本轮并审计（绝不崩）。
 */

/**
 * 输出增长探测（状态机 PROBING，加固版 2026-09-08）——**避免一次采样错判就把长任务睡掉**：
 *   ① 多轮采样：`deepSleepProbeSamples`（默认 3）轮 × `deepSleepProbeWindowMs`，任一轮检出增长即判长任务；
 *   ② 多信号交叉：转录 size/mtime 增长（主证据）+ 事件心跳（探测期间来事件即中止，回 RUNNING）
 *      + agent 存活 + agent.status 活跃态；状态活跃但无增长=**证据冲突**，不直接判卡住，转 suspect 复核；
 *   ③ 卡住需连续 `deepSleepProbeConfirm`（默认 2）轮确认，首轮落 **suspect**（阻塞睡眠，下轮巡检复核）；
 *   ④ 探针不可用/异常：内部重试 `deepSleepProbeRetries`（默认 2）次，仍失败才按「无法确认 → 正常睡」处理；
 *   ⑤ 总时长 `deepSleepProbeMaxMs` 兜底，防悬挂；停滞计时一律沿用 lastEventAt（不刷新成 now，否则永不睡）。
 */

export function deepSleepCheck(dep: MachineDeps, m: SleepMachine): void {
  if (!dep.config.enableDeepSleep || m.deepSleepRunning) return
  const now = Date.now()
  const idleMs = Number(dep.config.deepSleepIdleMs) || 10800000
  const probeAfter = Number(dep.config.deepSleepProbeAfterMs) || idleMs
  let hottest = m.sessions.size ? 0 : m.lastActivityAt // 无在册会话时用全局兜底水位
  let probing = 0, stalled = 0, ended = 0, running = 0
  for (const [sid, rec] of m.sessions) {
    try { if (!dep.ctx.agents.get(sid)) { m.sessions.delete(sid); continue } } catch { m.sessions.delete(sid); continue }
    // 子代理守卫（2026-09-10 实态修复）：子代理在跑 = 父会话仍在干活——直接视为 running 且刷新活动，
    // 既不发起"输出增长探测"（子代理写的是自己的转录，父转录不增长会被误判卡住），也不阻塞计数为停滞。
    if (dep.session.hasActiveSubagents(sid)) { rec.state = 'running'; rec.lastEventAt = now; running++; continue }
    // 状态机推进：running 且无事件 ≥ probeAfter → 发起探测；suspect → 下轮巡检复核（卡住需连续确认）
    if (dep.config.deepSleepProbe) {
      if (rec.state === 'running' && now - rec.lastEventAt >= probeAfter) probeSession(dep.probe, rec)
      else if (rec.state === 'suspect') probeSession(dep.probe, rec)
    }
    if (rec.state === 'probing' || rec.state === 'suspect') { probing++; continue } // 未决/待复核 → 阻塞本轮（不睡）
    if (rec.state === 'stalled') { stalled++; continue } // 已确认无输出 → 不阻塞睡眠
    if (rec.state === 'ended') ended++; else running++
    const act = rec.state === 'ended' ? rec.lastEndAt : rec.lastEventAt
    if (act > hottest) hottest = act
  }
  if (probing > 0) { dep.io.log(`deep sleep: ${probing} 个会话探测未决，本轮跳过（保守不睡）`); return }
  if (now - hottest < idleMs) return
  if (hottest <= m.lastDeepSleepAt) return // 本轮停滞窗口已消化（新活动推进水位后重新武装）
  m.deepSleepRunning = true
  const prevDeepSleepAt = m.lastDeepSleepAt
  // 窗口起点必须在推进水位**之前**取：lastDeepSleepAt 一旦置为 now，traceSince() 会退化成
  // max(今日 0 点, now)=now，痕迹扫描窗口变成 [now, now] → 恒「本日无痕迹」（2026-09-09 实修）。
  const since = dep.state.traceSince()
  m.lastDeepSleepAt = now
  dep.io.log(`deep sleep: 触发（停滞 ${Math.round((now - hottest) / 60000)}min ≥ 阈值 ${Math.round(idleMs / 60000)}min · 会话态 running=${running} ended=${ended} stalled=${stalled}）`)
  runDeepSleep(dep.run, since).then((r) => {
    // 水位语义：done（消化了材料）与 no-traces（确认无材料）都把窗口滑到当前——未来痕迹 mtime 必然
    // 更晚，不丢；只有 failed（有材料但没消化成，如 no-parent / 子代理异常）回滚，同一批下轮重试。
    // 这同时消解空转：无材料滑窗后 hottest ≤ 水位 → 后续巡检直接 return，不再每 10min 重触发。
    if (r === 'failed') { m.lastDeepSleepAt = prevDeepSleepAt; dep.io.log('deep sleep: 本轮未消化（failed），水位回滚（同一批痕迹下轮可重试）') }
    else m.lastDeepSleepAt = now
  }).catch((e) => {
    m.lastDeepSleepAt = prevDeepSleepAt
    dep.io.log(`deep sleep err: ${String((e as Error)?.message || e).slice(0, 120)}（水位回滚）`)
  }).finally(() => { m.deepSleepRunning = false })
}



/** 状态机快照——面板展示 / 手动触发（POST /deepsleep/trigger）/ 配置读写（/deepsleep/config）均读这里 */
export function getDeepSleepStatus(dep: MachineDeps, m: SleepMachine): DeepSleepStatus {
  let hottest = m.sessions.size ? 0 : m.lastActivityAt
  const list: DeepSleepStatus['sessions'] = []
  let running = 0, ended = 0, probing = 0, stalled = 0, suspect = 0
  for (const rec of m.sessions.values()) {
    if (rec.state === 'probing') probing++
    else if (rec.state === 'suspect') suspect++
    else if (rec.state === 'stalled') stalled++
    else if (rec.state === 'ended') ended++
    else running++
    if (rec.state !== 'stalled' && rec.state !== 'probing' && rec.state !== 'suspect') {
      const act = rec.state === 'ended' ? rec.lastEndAt : rec.lastEventAt
      if (act > hottest) hottest = act
    }
    list.push({ sid: (rec.sid.startsWith('session-') ? rec.sid.slice(8, 16) : rec.sid.slice(0, 8)), state: rec.state, lastEventAt: rec.lastEventAt, lastEndAt: rec.lastEndAt, probeResult: rec.probeResult })
  }
  return {
    enabled: !!dep.config.enableDeepSleep,
    idleMs: Number(dep.config.deepSleepIdleMs) || 10800000,
    probeAfterMs: Number(dep.config.deepSleepProbeAfterMs) || (Number(dep.config.deepSleepIdleMs) || 10800000),
    lastActivityAt: hottest,
    lastDeepSleepAt: m.lastDeepSleepAt,
    running, ended, probing, suspect, stalled,
    nextEligibleAt: hottest + (Number(dep.config.deepSleepIdleMs) || 10800000),
    sessions: list,
  }
}



/** 手动触发入口（T2 面板「立即归纳一次」）：复用 deepSleepRunning 并发守卫，避免与自动巡检重叠。 */
export async function runDeepSleepNow(dep: MachineDeps, m: SleepMachine): Promise<{ ok: boolean; error?: string; result?: 'done' | 'failed' | 'no-traces' }> {
  if (m.deepSleepRunning) return { ok: false, error: 'deep-sleep-already-running' }
  m.deepSleepRunning = true
  try {
    // 手动触发同样按上次水位取窗口；done（消化）/ no-traces（确认无材料）都推进水位防重复回想，failed 回滚
    const since = dep.state.traceSince()
    const r = await runDeepSleep(dep.run, since)
    if (r !== 'failed') m.lastDeepSleepAt = Date.now()
    return { ok: true, result: r }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e).slice(0, 160) }
  } finally {
    m.deepSleepRunning = false
  }
}
