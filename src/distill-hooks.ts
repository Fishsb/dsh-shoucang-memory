// distill-hooks.ts — 蒸馏「待办清扫（含工具注册）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（11 项）。
//   对外只暴露 createHooksApi(d) —— 返回绑定后的句柄，调用方零感知。
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
// 触发阈值回退的单一来源（2026-09-15 P0.1 扩面订正）：本文件曾硬编码 2 处 `|| 10800000`（3h）。
import { idleMsOf } from './deepsleep-core.js'
import { memoryLibRoot } from './targets.js'
import { decideReview, runSessionReview, buildMaterials, readReviewState, type ReviewDeps, type ReviewProposal } from './session-review.js'
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

/** L2 复盘的**依赖/状态/材料**三件套（模块级构造 · 2026-09-19）。
 *  为什么不写在装配层：装配 `registerDistill` 受 `audit-wiring` I1（≤120 行）管，加 12 行就地越线
 *  （实测 130 ⇒ FAIL）。本函数的输入只有 `kRoot` 与 `infra`（`HooksDeps.io` 已带），
 *  故放在本文件即可，装配层零改动——**依赖面更窄，且不新增接口字段**。 */
const reviewApiOf = (io: { infra: InfraApi; kRoot: string }, thresholds?: { idleMs?: number; minNewEntries?: number; minNewEvents?: number }) => (sid: string) => {
  const deps: ReviewDeps = {
    kRoot: io.kRoot,
    bankRoot: memoryLibRoot(),
    now: () => Date.now(),
    log: (m) => io.infra.log(m),
    audit: (o) => io.infra.audit({ sid, ...o }),
    // G16（2026-09-19）：三阈值经配置注入（schema 缺省取自注册表 `criteria.json#trigger.review*`）——
    //   本函数**不新增 HooksDeps 字段**（依赖面窄）；调用点从已注入的 `dep.env.config` 取。
    thresholds,
  }
  return { deps, prev: readReviewState(deps, sid), materials: buildMaterials(deps, sid) }
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
 * **L2 会话级复盘扫尾**（S2S3 册一 · 2026-09-19）：把 `session-review` 挂进运行时。
 *
 * 为什么挂在这里：L2 的触发是「**空闲 ≥30min** 或 disposed」+ 内容维（会审 U4 裁定），而本文件已有
 *   10min 周期的扫尾定时器（与 `sweepBacklog` 同一节拍）——复用它的节拍，不新开定时器（不新增常驻开销）。
 *
 * 为什么 proposals 是**确定性摘要**（本批）：L2 的"语义校正"（revise/merge/demote）要靠 LLM 判断，
 *   而 LLM 通道要按 S2 的分段蒸馏子进程形态接（下一次接线段）。本批先落**事实型主线**：
 *   「本会话共 N 段 L1 产出 · 未落地 K 条（列出身份）」——它本身对 S3 有用（S3 据此知道哪些知识没进库），
 *   且**零 LLM 成本**。语义版提案在同一回调里升级，形态不变（`ReviewProposal[]`）。
 *
 * 幂等由 `runSessionReview` 自己守（`(sid, reviewedSeq, opHash)` + 同水位 no-op）⇒ 本函数可被反复调用。
 */
const reviewSessions = async (dep: HooksDeps): Promise<void> => {
  try {
    if ((dep.env.config as { enableSessionReview?: boolean }).enableSessionReview === false) return
    /* G16（2026-09-19）：三阈值**运行期可取**（schema 缺省 = 注册表 `criteria.json#trigger.review*`）；
     *   取了就传，取不到（`0`/缺字段）传 `undefined` ⇒ `decideReview` 回落 `REVIEW_DEFAULTS`。 */
    const cfg = dep.env.config as { reviewIdleMs?: number; reviewMinNewEntries?: number; reviewMinNewEvents?: number }
    const reviewOf = reviewApiOf(dep.io, {
      idleMs: Number(cfg.reviewIdleMs) || undefined,
      minNewEntries: Number(cfg.reviewMinNewEntries) || undefined,
      minNewEvents: Number(cfg.reviewMinNewEvents) || undefined,
    })
    const roots = (dep.env.ctx.agents && typeof dep.env.ctx.agents.roots === 'function') ? dep.env.ctx.agents.roots() : []
    for (const a of roots) {
      try {
        if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function') continue
        const origin = a.session.header && a.session.header.origin
        if (origin === 'subagent') continue
        const sid = a.id
        if (dep.dom.parent.hasActiveSubagents(sid)) continue // 子代理在跑 ⇒ 会话未完，L2 等它
        const rec = dep.sleep.sessions.get(sid)
        const lastActivityMs = Number(rec?.lastEndAt || 0)
        const base = dep.dom.wm.resolveWatermark(sid, a) as (Record<string, unknown> | null)
        const l1Seq = Number((base as { lastSeq?: number } | null)?.lastSeq || 0)
        const evs: any[] = a.session.snapshotEvents()
        let maxSeq = l1Seq
        for (const e of evs) { const s = Number(e?.seq ?? 0); if (s > maxSeq) maxSeq = s }
        const rd = reviewOf(sid)
        const prevSeq = Number(rd.prev?.reviewedSeq || 0)
        const newEvents = Math.max(0, maxSeq - Math.max(prevSeq, 0))
        const m = rd.materials
        const input = { sid, lastActivityMs, newEntries: m.counts.manifest, newEvents, disposed: false, reviewedSeq: maxSeq, fp: String((base as { fp?: string } | null)?.fp || '') }
        const dec = decideReview(rd.deps, input)
        if (dec.state !== 'ready') continue
        const mainline: ReviewProposal = {
          op: 'mainline',
          after: `本会话 L1 产出 ${m.counts.manifest} 段 · 未落地 ${m.counts.failures} 条`
            + (m.failures.length ? `（示例：${m.failures.slice(0, 3).join('；')}）` : ''),
          why: 'L2 确定性摘要（v1 无 LLM）：给 S3 一份"哪些知识没进库"的可执行线索',
        }
        const r = await runSessionReview(rd.deps, input, async () => [mainline])
        if (r.state === 'reviewed' && r.appended > 0) dep.io.infra.log(`session-review: ${dep.io.infra.sidShort(sid)} 复盘落 ${r.appended} 条提案（§${r.reviewedSeq}）`)
      } catch (e) {
        try { dep.io.infra.log(`session-review 单会话失败（不影响主链）：${String((e as Error)?.message || e).slice(0, 120)}`) } catch { /* */ }
      }
    }
  } catch { /* 复盘扫尾零抛出 */ }
}

/**
 * 事件钩子 + 工具注册（自 registerDistill 迁出）。
 * 为什么整块搬：这 3 个 ctx.on + 5 个 ctx.effect 连注释占 ~86 行，是装配函数里**唯一**的体积来源；
 *   它们虽是"注册"语义，但体积上让 registerDistill 无法满足 I1（≤120 行）。
 *   搬出后装配层只剩「构造依赖 → 调 mount → 返回句柄」，判据里的三条都成立。
 * ⚠ ctx 单独传（注册必须挂在宿主上下文上），其余依赖走 HooksDeps。
 */
/**
 * `turn/end` 的**归属判据**（**单一实现**，专用钩子与兜底钩子共用 —— 防两处口径漂移）。
 *
 * 为什么必须有它：两个钩子**同挂 `session/event`**，都写同一台深睡状态机，而语义相反——
 *   专用钩子把「任务完成」置 **ENDED**（停滞计时起点），兜底钩子把「任意事件」置 **RUNNING**。
 *   原先各自的判据**各写一份**：专用钩子写 `reason.kind !== 'completed' → return`，兜底钩子则**无判据、全收**
 *   ⇒ 对同一个 `turn/end(completed)`，先置 `ended`、**紧接着被覆盖回 `running`**（实测 `noteEvent`
 *   收到 `[["s1",true],["s1",false]]`）⇒ **会话永不到 ENDED**（详见下方兜底钩子处的后果说明）。
 *
 * 归属：**completed（含缺 reason / reason 缺 kind，兼容旧格式）归专用钩子**；其余（`aborted` 等
 *   未完成的轮次结束）**归兜底钩子**记普通活动 —— 未完成轮次当然不是「任务完成」，不该置停滞。
 */
const isCompletedTurnEnd = (event: any): boolean => {
  if (!event || event.type !== 'turn/end') return false
  const k = event.data && event.data.reason && event.data.reason.kind
  return !k || k === 'completed'
}

export function mountDistillEvents(ctx: any, dep: HooksDeps): void {

ctx.on('session/event', (session: any, event: any) => {
  try {
    if (!isCompletedTurnEnd(event)) return
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
    // ⚠ 2026-09-14 修复：原为 `agent.armIdleTimer(agent)`——把**绑定句柄**当宿主 agent 的方法调。
    //   宿主与任何插件都不提供该属性（DSH 内核树 0 命中）⇒ 每次 turn/end 在此抛 TypeError，
    //   被下面那句 `catch { }` 吞掉 ⇒ **空闲蒸馏全链失效**（2026-09-12 C-2b 重构写坏，实测两天）。
    //   正确形态：经注入面 `dep.dom.distill`（= createAgentApi 的绑定句柄，签名 `(agent)`）。
    dep.dom.distill.armIdleTimer(agent)
  } catch (e) {
    // 零抛出纪律保留，但**必须留痕**：此前这里是 `catch { }`，把"武装失败"与"从未武装"静默成同一现象
    //   （外部只见 lastEndAt 正常 + 日志空白，排障只能靠数日志条数）。2026-09-14 实锤后补。
    try { dep.io.infra.log(`distill: turn/end 钩子异常（${dep.io.infra.sidShort(String(session?.id || ''))}）: ${String((e as Error)?.message || e).slice(0, 160)}`) } catch { /* 日志失败无害 */ }
  }
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
    dep.dom.parent.rememberAgent(a) // 深睡 parent 兜底缓存（任意根会话事件都刷新）
    // ★★ 2026-09-14 修（**两个钩子抢同一事件** · 实测致睡眠长期被阻塞）：
    //   上面 `:94` 的专用钩子把 `turn/end(completed)` 置为 **ENDED**（停滞计时起点），
    //   而本兜底钩子把**任意**根会话事件置为 **RUNNING**——两钩子**同挂 `session/event`**，
    //   本钩子注册序在后 ⇒ 对 `turn/end` 这一个事件，刚置好的 `ended` **立刻被覆盖回 `running`**
    //   （实测 `noteEvent` 收到 `[["s1",true],["s1",false]]`）⇒ **会话永不到 ended**。
    //   后果（真机实测）：任务完成后仍被算作"活跃" ⇒ 45min 后触发「输出增长探测」⇒ 而转录是
    //   **批量落盘**（实测活跃会话 105 秒 size/mtime 零变化；DSH 持久化 README 原文
    //   "Live-event write batching is not configuration"）⇒ 判 `suspect` ⇒ **阻塞睡眠**
    //   （`write.consolidate` 末条停在 09-13T10:17，>24h 未产出）。
    //   语义（用户拍板）：**任务执行完成 ⇒ 停滞 / 等待蒸馏**，不得被兜底钩子复活。
    //   ⇒ 只让出**状态迁移**这一件事；`rememberAgent` / `activationStep` 等副作用照旧（与事件类型无关）。
    //   归属判据用 `isCompletedTurnEnd`（**单一实现**，与专用钩子同源）——只让出**它**拥有的那类 `turn/end`；
    //   `aborted` 等未完成轮次仍由本钩子记 RUNNING（**既有断言锁着这条**：未完成 ≠ 任务完成）。
    if (!isCompletedTurnEnd(event)) dep.sleep.noteEvent(sid, false)
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
  dep.io.infra.log(`deep sleep 巡检启动（enable=${dep.env.config.enableDeepSleep} · 停滞阈值 ${Math.round(idleMsOf(dep.env.config) / 60000)}min · 探测 ${dep.env.config.deepSleepProbe ? '开' : '关'}${dep.env.config.deepSleepProbe ? `（无事件 ${Math.round(Number(dep.env.config.deepSleepProbeAfterMs) || idleMsOf(dep.env.config)) / 60000}min 后发起，探针${probeOk ? '就位' : '缺失→无法确认即正常睡'}）` : ''}）`)
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

// S2S3 册一：**L2 会话级复盘**（与扫尾同节拍：启动 45s 首跑 + 每 10min 一次；不新开定时器）
ctx.effect(() => {
  const run = (): void => { try { void reviewSessions(dep) } catch { /* 复盘扫尾零抛出 */ } }
  const t0 = setTimeout(run, 45000)
  const iv = setInterval(run, dep.sleep.DEEP_SLEEP_CHECK_MS)
  return () => { clearTimeout(t0); clearInterval(iv) }
}, dep.io.SHORT + ': session review')
}
