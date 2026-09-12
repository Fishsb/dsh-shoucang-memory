// distill-hooks.ts — 蒸馏「待办清扫（含工具注册）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（11 项）。
//   对外只暴露 createHooksApi(d) —— 返回绑定后的句柄，调用方零感知。
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { InfraApi } from './distill-infra.js'
import type { WriteApi } from './distill-write.js'
import type { ParentApi } from './distill-parent.js'
import type { WmApi } from './distill-watermark.js'
import type { AgentApi } from './distill-agent.js'
import type { BankApi } from './distill-bank.js'
import type { ActApi } from './distill-activation.js'
import type { LlmApi } from './distill-llm.js'
import type { DistillState } from './distill-state.js'

export interface HooksDeps {
  io: { infra: InfraApi; kRoot: string; SHORT: string }
  dom: { write: WriteApi; parent: ParentApi; wm: WmApi; distill: AgentApi; act: ActApi; llm: LlmApi; bank: BankApi }

  state: DistillState
  sleep: { sessions: Map<string, any>; noteEvent(sid: string, isTurnEnd: boolean): void; deepSleepCheck(): void; DEEP_SLEEP_CHECK_MS: number; getDeepSleepStatus(): any }
  env: { ctx: any; config: any }

}

/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never

export function createHooksApi(dep: HooksDeps) {
  return {
    sweepBacklog: (...a: Tail<Parameters<typeof sweepBacklog>>) => sweepBacklog(dep, ...a),
  }
}
export type HooksApi = ReturnType<typeof createHooksApi>

// ═══ 积压扫尾（2026-09-10 用户拍板：稳健性修复——旧 ctx 失败/重启/错过空闲窗的会话自动补蒸馏）═══
// 候选：**当前 ctx 根内（live）**的会话、水位<内存末事件 seq、且已出「10min 宽限期」（避免与 idle 定时器抢跑/打断用户续聊）。
// ⚠ 覆盖边界（2026-09-11 审查修正注释）：root 之外/重启前已结束且**未被重新载入**的会话不在本链覆盖内——
//   旧注释「重启前已结束的一律补」与现码不符；真要补需会话重新载入，或另立持久会话清单（本档未实现）。
const sweepBacklog = async (dep: HooksDeps, ): Promise<void> => {
  try {
    // 先回流 pending defer 卡（workspace 恢复后直写 devref；周期扫尾也覆盖）
    try { await dep.dom.write.flushDeferCards() } catch { /* 回流失败不阻断扫尾 */ }
    const roots = (dep.env.ctx.agents && typeof dep.env.ctx.agents.roots === 'function') ? dep.env.ctx.agents.roots() : []
    for (const a of roots) {
      try {
        if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function') continue
        const origin = a.session && a.session.header && a.session.header.origin
        if (origin === 'subagent') continue
        const sid = a.id
        if (dep.dom.parent.hasActiveSubagents(sid)) continue // 子代理在跑：任务未完，扫尾勿抢蒸（2026-09-10）
        if (dep.state.distilling.has(sid)) continue
        const rec = dep.sleep.sessions.get(sid)
        if (rec) {
          if (rec.state === 'running' || rec.state === 'probing' || rec.state === 'suspect') continue
          if (rec.lastEndAt && Date.now() - rec.lastEndAt < dep.env.config.idleWakeMs) continue // 仍在宽限期，等 idle 定时器
        }
        // v19：水位走同一双证校验（resolveWatermark）——失效时由 discardWatermark 从当前边界续写并落审计，
        // 扫尾与 idle 通路口径一致（单一实现，勿在此另写判定）；快照取一次供增量比对与后续蒸馏复用。
        const base = dep.dom.wm.resolveWatermark(sid, a)
        // 同蒸馏主路径：`lastSeq = 0` 有两种成因——(a) 真·无水位 ⇒ 全量是唯一选择；
        // (b) 语义 B 主动全量（live 边界 maxSeq < prevSeq，序号空间已重排）⇒ **故意全量，不要"修"**。
        const lastSeq = base ? base.lastSeq : 0
        const sweepEvents: any[] = a.session.snapshotEvents()
        let maxSeq = lastSeq
        for (const e of sweepEvents) { const s = (e as any).seq ?? 0; if (s > lastSeq && s > maxSeq) maxSeq = s }
        if (maxSeq > lastSeq) {
          // 跨实例 claim 锁（2026-09-10 实锤：重叠 fiber 的 30s 首扫会同时抢同一积压窗口 → 471aca03 被双蒸馏双写）：
          // 在途 claim（25min 内）→ 跳过；过期 claim → 覆盖重试；无增量时顺手清理陈旧 claim。
          // A3：claim 判定已统一到 distillAgent 入口（幂等写入 / 结束释放）——扫尾只做**只读**让位判定，
          //     不再自己写 claim（否则与入口刚写入的 claim 互斥，补蒸馏将永不发生）。
          if (dep.dom.write.claimHeld(sid)) { continue } // 在途，其他 fiber 已接管
          dep.io.infra.log(`sweep: ${dep.io.infra.sidShort(sid)} 水位 ${lastSeq}→${maxSeq} 有未消化增量，补蒸馏`)
          void dep.dom.distill.distillAgent(a).catch(() => { /* distillAgent 内部已兜底 */ })
        } else {
          try { unlinkSync(join(dep.io.kRoot, 'audit', 'claims', sid + '.json')) } catch { /* 无 claim 可清 */ }
        }
      } catch { /* 单会话扫尾失败静默 */ }
    }
  } catch { /* 扫尾零抛出 */ }
}

/**
 * 事件钩子 + 工具注册（自 registerDistill 迁出）。
 * 为什么整块搬：这 3 个 ctx.on + 5 个 ctx.effect 连注释占 ~86 行，是装配函数里**唯一**的体积来源；
 *   它们虽是"注册"语义，但体积上让 registerDistill 无法满足 I1（≤120 行）。
 *   搬出后装配层只剩「构造依赖 → 调 mount → 返回句柄」，判据里的三条都成立。
 * ⚠ ctx 单独传（注册必须挂在宿主上下文上），其余依赖走 HooksDeps。
 */
export function mountDistillEvents(ctx: any, dep: HooksDeps): void {

ctx.on('session/event', (session: any, event: any) => {
  try {
    if (!event || event.type !== 'turn/end') return
    const reason = event.data && event.data.reason
    if (reason && reason.kind && reason.kind !== 'completed') return
    const sid = session && session.id
    if (!sid) return
    const agent = ctx.agents.get(sid)
    if (!agent) return
    const origin = agent.session && agent.session.header && agent.session.header.origin
    if (origin === 'subagent') { // 子代理 turn/end = 父会话仍在干活（2026-09-10）：记子代活动+刷新父会话，不武装蒸馏
      const p = dep.dom.parent.parentSidOf(agent)
      dep.dom.parent.noteChildActivity(p, sid)
      if (p) dep.sleep.noteEvent(p, false)
      return
    }
    dep.sleep.noteEvent(sid, true) // 状态机：turn 完成 → ENDED（停滞计时起点）
    agent.armIdleTimer(agent)
  } catch { /* 事件回调零抛出 */ }
})

ctx.on('agent/disposed', ({ agent }: any) => {
  try { const t = dep.state.idleTimers.get(agent.id); if (t) { clearTimeout(t); dep.state.idleTimers.delete(agent.id) } } catch { /* */ }
  try { dep.dom.parent.dropChild(agent.id) } catch { /* */ } // 子代理出表：清其活动标记（防僵尸阻止蒸馏）
  try { dep.sleep.sessions.delete(agent.id) } catch { /* */ }
})

ctx.on('session/disposed', (session: any) => {
  try { const sid = session && session.id; const t = dep.state.idleTimers.get(sid); if (t) { clearTimeout(t); dep.state.idleTimers.delete(sid) } } catch { /* */ }
  try { dep.dom.parent.dropChild(session && session.id) } catch { /* */ }
  try { dep.sleep.sessions.delete(session && session.id) } catch { /* */ }
})

// 状态机活跃信号：**任意**根会话事件 → RUNNING（长任务持续产生 chunk/tool 事件即持续刷新水位）
ctx.on('session/event', (session: any, event: any) => {
  try {
    const sid = session && session.id
    if (!sid) return
    const a = ctx.agents.get(sid)
    if (!a) return
    const origin = a.session && a.session.header && a.session.header.origin
    if (origin === 'subagent') { // 子代理任意事件 = 父会话任务仍在推进（2026-09-10）：记子代活动+刷新父会话活动
      const p = dep.dom.parent.parentSidOf(a)
      dep.dom.parent.noteChildActivity(p, sid)
      if (p) dep.sleep.noteEvent(p, false)
      return
    }
    dep.sleep.noteEvent(sid, false)
    dep.dom.parent.rememberAgent(a) // 深睡 parent 兜底缓存（任意根会话事件都刷新）
    if (dep.env.config.activationShadow !== false || dep.env.config.activationPrefetch) void dep.dom.act.activationStep(sid, event) // 路线④：影子默认开；prefetch 置位后决策通路照走（影子行 mode 区分），实际注入仍待影子校准（后续档）
  } catch { /* 状态迁移零抛出 */ }
})

ctx.effect(() => {
  const t = setTimeout(() => {
    try {
      const roots = ctx.agents.roots()
      dep.io.infra.log(`distill 启动（守藏蒸馏器 · idleWake ${Math.round(dep.env.config.idleWakeMs / 60000)}min · adopt roots=${roots.length} · 数据区 ${dep.io.kRoot}）`)
      dep.dom.llm.validateProvider()
    } catch (e) { dep.io.infra.log(`adopt err: ${String((e as Error)?.message || e).slice(0, 120)}`) }
  }, 2000)
  return () => clearTimeout(t)
}, dep.io.SHORT + ': distill adopt')

// 深度睡眠巡检定时器（10min 一查；effect 清理，reload 零泄漏）
ctx.effect(() => {
  const probeOk = existsSync(dep.dom.llm.probeScriptPath)
  dep.io.infra.log(`deep sleep 巡检启动（enable=${dep.env.config.enableDeepSleep} · 停滞阈值 ${Math.round((Number(dep.env.config.deepSleepIdleMs) || 10800000) / 60000)}min · 探测 ${dep.env.config.deepSleepProbe ? '开' : '关'}${dep.env.config.deepSleepProbe ? `（无事件 ${Math.round((Number(dep.env.config.deepSleepProbeAfterMs) || 10800000) / 60000)}min 后发起，探针${probeOk ? '就位' : '缺失→无法确认即正常睡'}）` : ''}）`)
  const iv = setInterval(() => { try { dep.sleep.deepSleepCheck() } catch { /* 巡检零抛出 */ } }, dep.sleep.DEEP_SLEEP_CHECK_MS)
  return () => clearInterval(iv)
}, dep.io.SHORT + ': deep-sleep check')

// ═══ v2.2 定时自检：独立于深睡（深睡触发严苛：需全部会话停滞 ≥3h）——保证「想不起来也会自动做」═══
//   启动 3 分钟后先跑一次；此后每 selfCheckIntervalHours（缺省 6h）；selfCheck=false 或周期=0 时关闭。
//   与深睡后的自检共用同一实现（runSelfCheck），台账 type=check.sleep 区分 trigger。
ctx.effect(() => {
  const hours = Number((dep.env.config as { selfCheckIntervalHours?: number }).selfCheckIntervalHours ?? 6)
  if (dep.env.config.selfCheck === false || !(hours > 0)) return
  const ms = Math.max(30 * 60 * 1000, hours * 3600 * 1000)
  const t0 = setTimeout(() => { void dep.dom.bank.runSelfCheck('timer') }, 3 * 60 * 1000)
  const iv = setInterval(() => { void dep.dom.bank.runSelfCheck('timer') }, ms)
  return () => { clearTimeout(t0); clearInterval(iv) }
}, dep.io.SHORT + ': sleep selfcheck timer')

// ═══ 蒸馏器清理（reload/ctx dispose 零泄漏）：清空遗留 idle 定时器——旧 fiber 定时器在 ctx 失效后触发
// 正是「cannot get required service subagents in inactive context」报错的根源（2026-09-10 修复）═══
ctx.effect(() => {
  return () => {
    try { for (const [, t] of dep.state.idleTimers) clearTimeout(t) } catch { /* */ }
    try { dep.state.idleTimers.clear() } catch { /* */ }
    try { dep.state.distilling.clear() } catch { /* */ }
  }
}, dep.io.SHORT + ': distill cleanup')

// 积压扫尾定时器：启动 30s 首扫（覆盖重载/重启前错过窗口、仍在内存的会话）+ 每 10min 周期扫
ctx.effect(() => {
  const run = (): void => { try { void sweepBacklog(dep) } catch { /* 扫尾零抛出 */ } }
  const t0 = setTimeout(run, 30000)
  const iv = setInterval(run, dep.sleep.DEEP_SLEEP_CHECK_MS)
  return () => { clearTimeout(t0); clearInterval(iv) }
}, dep.io.SHORT + ': distill sweep')
}
