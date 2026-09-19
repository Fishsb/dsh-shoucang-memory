// deepsleep-machine.ts — 深睡**会话状态机**（自 createDeepSleep 提出）
//
// 为什么单独成件：createDeepSleep 232 行 > audit-wiring I1 的 120 行上限，而它体内真正"厚"的
//   是这台状态机（noteEvent / 启动回放 / 巡检 / 快照 / 手动触发 / 配置），共 ~125 行。
//   状态（sessions / 水位 / 并发闸）仍归 createDeepSleep 所有，这里以 **SleepMachine 箱**按引用操作 ——
//   标量字段（lastDeepSleepAt 等）必须装箱，否则写不回装配层（与 streak 装箱同一理由）。
import { readFileSync } from 'node:fs'
import type { SessRec, SessState, DeepSleepStatus } from './deepsleep-core.js'
import { deepSleepReplayable } from './deepsleep-core.js'
import { readDistillAudit } from './audit-source.js'
import { probeSession, type ProbeDeps } from './deepsleep-probe.js'
import { runDeepSleep, type RunDeps } from './deepsleep-run.js'
import type { SleepIo, SleepSession, SleepState } from './deepsleep-contract.js'
// 触发阈值回退的**单一来源**已下沉到 deepsleep-core（依赖链底部，machine/deepsleep/distill-hooks 三处共用）——
// 见该件 `idleMsOf` 的注释：全仓曾有 8 处硬编码兜底（首轮因大小写敏感检索漏报 4 处）。
import { idleMsOf, epochIdOf, windowMaterialBytes, planTriggerDim } from './deepsleep-core.js'
// S-P2a（2026-09-20）：睡眠窗口归约（自 deepsleep-core 按领域接缝抽出，守其导出棘轮）
import { planSleepWindow } from './trigger-plan.js'

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
  rec.conflictRound = 0 // S-P2b：新事件 = 会话复活，冲突计数与新证据无关，必须同清
  rec.probeResult = undefined
  m.sessions.set(sid, rec)
}

/** 启动水位回放：取审计最新时间（重启不重置停滞判定）+ 上次深睡时间（痕迹窗口起点）。 */
export function replayWatermark(dep: MachineDeps, m: SleepMachine): void {
  
  // 启动水位回放：取蒸馏审计最新时间（重启不重置停滞判定）；同时回放上次深度睡眠时间（痕迹窗口起点）
  try {
    // DS4 第六刀（2026-09-13）：改走**双源读**（legacy ∪ 统一台账）——单读台账会让本回放命中 0 轮
    //   （历史丢光）⇒ 水位置 now ⇒ 丢一轮痕迹。实测：legacy 16 轮 / 仅台账 0 轮 / 双源 = legacy。
    for (const o of readDistillAudit(dep.io.auditFile) as Array<{ at?: string; kind?: string }>) {
      try {
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
  const idleMs = idleMsOf(dep.config)
  const probeAfter = Number(dep.config.deepSleepProbeAfterMs) || idleMs
  // 会话存续过滤（IO）+ 探测推进：**归约之前**的副作用一律留在这里（纯函数不得碰 ctx）。
  for (const [sid, rec] of m.sessions) {
    try { if (!dep.ctx.agents.get(sid)) { m.sessions.delete(sid); continue } } catch { m.sessions.delete(sid); continue }
    // 子代理守卫（2026-09-10 实态修复）：子代理在跑 = 父会话仍在干活——直接视为 running 且刷新活动，
    // 既不发起"输出增长探测"（子代理写的是自己的转录，父转录不增长会被误判卡住），也不阻塞计数为停滞。
    if (dep.session.hasActiveSubagents(sid)) { rec.state = 'running'; rec.lastEventAt = now; continue }
    // 状态机推进：running 且无事件 ≥ probeAfter → 发起探测；suspect → 下轮巡检复核（卡住需连续确认）
    if (dep.config.deepSleepProbe) {
      if (rec.state === 'running' && now - rec.lastEventAt >= probeAfter) probeSession(dep.probe, rec)
      else if (rec.state === 'suspect') probeSession(dep.probe, rec)
    }
  }
  // ★ S-P2a（2026-09-20）**归约与判定分离**：窗口派生量只此一处（与面板 `getDeepSleepStatus` 共用
  //   `planSleepWindow`）——此前两边各写一份循环，且 `stalled` 被跳过 ⇒ 全 stalled 时 `hottest` 恒 0
  //   ⇒ 永不触发（真机实测 11 小时零触发），而状态机自述 STALLED「不阻塞」。
  const win = planSleepWindow(m.sessions.values(), { lastActivityAt: m.lastActivityAt, lastDeepSleepAt: m.lastDeepSleepAt })
  const { hottest } = win
  const { running, ended, stalled } = win.counts
  const probing = win.blocking
  if (probing > 0) { dep.io.log(`deep sleep: ${probing} 个会话探测未决，本轮跳过（保守不睡）`); return }
  // ⚠ **判据顺序（S-P1b）**：「窗口已消化」必须先于「时间/内容双维」判定 ——
  //   否则内容维会绕过 `hottest <= m.lastDeepSleepAt` 而**重复消化同一批材料**。
  //   等价性：原序为 `if (A) return; if (B) return`（返回 A∨B）；新序为 `if (B) return; if (A ∧ ¬C) return`。
  //   内容维关闭时 ¬C 恒真 ⇒ 返回条件仍为 B∨A，**逐分支等价，缺省零行为变化**。
  if (hottest <= m.lastDeepSleepAt) return // 本轮停滞窗口已消化（新活动推进水位后重新武装）
  const contentMin = Number(dep.config.deepSleepContentMinChars) || 0 // S-P1b：内容水位阈值（0/未设 = 关闭）
  /* 🚫 S-P1b″（2026-09-16）**内容维已停用（口径被真机证伪）** —— 守卫在这里，而不是只写注释：
   *   实测（真机触发）：审计行 `materialBytes=0` 而 `materialChars=46692`（**差 4.6 万字符**）
   *   ⇒ `windowMaterialBytes`（数 pending/+candidates/ 里 mtime>since 的 .md 字节）**不是深睡材料的来源**：
   *     材料是 `gatherDeepSleepTraces` 按 `since` 从 notes 命中 / 运行统计 / 待回收裁决等处**聚合**出来的。
   *   ⇒ 根因是**架构性的**：本系统的材料模型是**窗口式**的，"材料量"与"窗口长度"**单调同源**
   *     ⇒ 内容维**不是独立轴**（按旧口径取阈会把内容水位钉在 ≈0，永不触发 = 假阈值）。
   *   ⇒ 故此处**拒绝启用**：阈值 >0 时告警并按关闭处理 —— **宁可功能关着，也不给一个恒不触发的假旋钮**
   *     （仓内已登记"假旋钮"教训：`alphaVal` 因恒 0 被放弃）。
   *   ⇒ 要真正启用，须先把度量换成**与材料同源**的口径（候选见 OPEN-ITEMS S-P1b″），再解除本守卫。 */
  if (contentMin > 0) {
    dep.io.log(`deep sleep: ⚠ contentMinChars=${contentMin} 已被停用（口径经真机证伪：windowMaterialBytes 与真实材料非同源，实测 0 vs 46692），本轮按**关闭**处理；详见 OPEN-ITEMS S-P1b″`)
  }
  const contentMinEffective = 0 // 守卫：一律按关闭
  // 只在**时间维未到**时才去算材料量（时间维到了就不必碰 IO）——决策表本身是纯函数（可穷举单测）
  const contentBytes = (now - hottest >= idleMs || !contentMinEffective)
    ? 0
    : windowMaterialBytes({ pendDir: dep.io.pendDir, candidateDir: dep.io.candidateDir }, dep.state.traceSince())
  const dim = planTriggerDim(now - hottest, idleMs, contentBytes, contentMinEffective)
  if (dim === 'none') return
  if (dim === 'content') {
    dep.io.log(`deep sleep: 内容维达阈（待消化 ${contentBytes} 字节 ≥ ${contentMin} · 时间维未到 ${Math.round((now - hottest) / 60000)}min < ${Math.round(idleMs / 60000)}min）`)
  }
  m.deepSleepRunning = true
  const prevDeepSleepAt = m.lastDeepSleepAt
  // 窗口起点必须在推进水位**之前**取：lastDeepSleepAt 一旦置为 now，traceSince() 会退化成
  // max(今日 0 点, now)=now，痕迹扫描窗口变成 [now, now] → 恒「本日无痕迹」（2026-09-09 实修）。
  const since = dep.state.traceSince()
  m.lastDeepSleepAt = now
  // S-P1a（2026-09-15）：**触发点开纪元** —— 纪元 = 上次睡眠成功 → 本次睡眠成功。
  //   写在这里而非 run 内部：手动触发（runDeepSleepNow）与巡检触发**共用同一纪元语义**，
  //   且 `runDeepSleep` 不认识 machine，避免反向依赖。
  dep.state.epoch.v = epochIdOf(now)
  dep.state.epoch.since = since // S-P1d：窗口起点随纪元存下（水位即将被推到 now，事后取不回）
  dep.io.log(`deep sleep: 触发（纪元 ${dep.state.epoch.v} · 停滞 ${Math.round((now - hottest) / 60000)}min ≥ 阈值 ${Math.round(idleMs / 60000)}min · 会话态 running=${running} ended=${ended} stalled=${stalled}）`)
  // S-P1c-multi（2026-09-16 · 二次实现）**按片循环** —— 续跑信号走 `state.epoch.pendingChunk`（**不走返回值**）：
  //   首片前置 0；每次调用只跑一片、并把"下一片序号或 null"写回 state；本片 failed ⇒ 立即停（返回值 failed
  //   ⇒ 下方既有逻辑**回滚水位**，同批下轮重试）。**全片落地才推水位**。
  const runAllChunks = async (): Promise<'done' | 'failed' | 'no-traces'> => {
    dep.state.epoch.pendingChunk = 0
    let r = await runDeepSleep(dep.run, since)
    while (r !== 'failed' && dep.state.epoch.pendingChunk !== null) r = await runDeepSleep(dep.run, since)
    dep.state.epoch.pendingChunk = null // 收尾：不留悬挂信号
    return r
  }
  runAllChunks().then((r) => {
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
  // ★ S-P2a：**与巡检共用同一归约**（`planSleepWindow`）——此前本函数自带一份循环，且把
  //   `stalled/probing/suspect` 排除出 `hottest` ⇒ 全 stalled 时 `lastActivityAt=0`
  //   ⇒ `nextEligibleAt = 0 + idleMs` ⇒ 面板「下次可睡」渲染成 **1970-01-01**（假读数）。
  const win = planSleepWindow(m.sessions.values(), { lastActivityAt: m.lastActivityAt, lastDeepSleepAt: m.lastDeepSleepAt })
  const { running, ended, probing, suspect, stalled } = win.counts
  const list: DeepSleepStatus['sessions'] = []
  for (const rec of m.sessions.values()) {
    list.push({ sid: (rec.sid.startsWith('session-') ? rec.sid.slice(8, 16) : rec.sid.slice(0, 8)), fullSid: rec.sid, state: rec.state, lastEventAt: rec.lastEventAt, lastEndAt: rec.lastEndAt, probeResult: rec.probeResult })
  }
  return {
    enabled: !!dep.config.enableDeepSleep,
    // S-P1a/S-P1d：纪元 id 与窗口起点由**触发点**写入 state（巡检与手动共用）；无纪元 ⇒ 双 null
    currentEpoch: (dep.state && dep.state.epoch && dep.state.epoch.v) || null,
    epochSince: (dep.state && dep.state.epoch && dep.state.epoch.since) || null,
    idleMs: idleMsOf(dep.config),
    probeAfterMs: Number(dep.config.deepSleepProbeAfterMs) || idleMsOf(dep.config),
    lastActivityAt: win.hottest,
    lastDeepSleepAt: m.lastDeepSleepAt,
    running, ended, probing, suspect, stalled,
    nextEligibleAt: win.hottest + idleMsOf(dep.config),
    // S3-6（2026-09-14）**当前阶段**：由既有计数与标志派生（**零新采集、零跨源依赖**）。
    //   优先级 = 「最该先知道」在前：开关关 → 正在跑 → 探测/复核中 → 会话活跃 → 可睡 → 等待 → 无会话。
    //   注：`suspect`（探针证据冲突、待复核）与 `probing` 同归"探测中"—— 对观察者而言都是"在确认能不能睡"。
    phase: (() => {
      if (!dep.config.enableDeepSleep) return 'disabled' as const
      if (m.deepSleepRunning) return 'running' as const
      if (probing > 0 || suspect > 0) return 'probing' as const
      if (running > 0) return 'active' as const
      if (stalled > 0) return 'eligible' as const
      if (ended > 0) return 'waiting' as const
      return 'idle' as const
    })(),
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
    dep.state.epoch.v = epochIdOf(Date.now()) // S-P1a：手动触发同样是**一个纪元**
    dep.state.epoch.since = since             // S-P1d：同巡检路径，起点随纪元存下
    dep.state.epoch.pendingChunk = 0 // S-P1c-multi：手动触发同样跑完所有片（共用"全片落地才推进"）
    let r = await runDeepSleep(dep.run, since)
    while (r !== 'failed' && dep.state.epoch.pendingChunk !== null) r = await runDeepSleep(dep.run, since)
    dep.state.epoch.pendingChunk = null
    if (r !== 'failed') m.lastDeepSleepAt = Date.now()
    return { ok: true, result: r }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e).slice(0, 160) }
  } finally {
    m.deepSleepRunning = false
  }
}
