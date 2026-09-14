/**
 * mcl.ts — 记忆认知环（MCL）双通道机制化（ACT-029，2026-09-11）
 *
 * 设计来源：`.internal/arch/shoucang-SC-S05-MCL-实施方案.md` §3（ADR-009 宿主强制 → ADR-010 熟悉度自适应双通道）。
 * 核心问题：SC-S05 的七步循环此前**只在提示词里**（模型自愿 read 才发生）——「材料在场、认知动作不在」。
 * 本模块把它变成**宿主必经环节**：在 `agent/pre-step`（DSH 官方扩展点，签名同 `dsh-agent-instructions`）按**熟悉度**分流：
 *   快通道（高置信命中 [路径]/[原则]）：零额外材料、零额外往返（RPD：识别即行动，不拖慢熟悉的活）；
 *   慢通道（新颖/低置信）：任务首步注入「薄契约 + top-k 指针」；此后若仍未引用材料，则**再引导一次**（上限可配，之后放行）。
 *
 * 不变量（照方案档 D1/D2/D7 + 项目红线）：
 *   D1 单一实现：熟悉度 = 复用 `vec.recallRanked` / `vec.semanticSim`（**不新写打分**）。
 *   D2 引导优先于拒绝：材料注入发生在**模型本来就要做的第一步**；最多再引导 `maxNudges`（缺省 1），绝不死锁。
 *   D7 预算有界：材料 ≤ `budgetChars`（缺省 600 字符）；只作用于慢通道首步；不进 systemPrompt 常驻面。
 *   零硬编码路径（一律 targets 派生）、零抛出（异常只审计，绝不打断 agent 循环）、审计落 knowledgeRoot()/audit。
 *
 * 熟悉度判据口径 = ACT-024 校准的**绝对余弦**（用户文本 ↔ 命中索引行）。
 *   阈值缺省 **0.58**（2026-09-11 重校准：旧值 0.65 在 193 条实测样本上 max=0.634 ⇒ 结构性零命中；
 *   详见 criteria.json#surface.mcl.note）。高置信标签来自注册表 `mclGate`（**非本模块硬编码**）。
 * 判据只在 turn 首步计算一次（后续步复用通道与主题，避免每步重复嵌入）。
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { knowledgeRoot, memoryLibRoot, highConfCarrierSet, indexRowTag, isRealUserEvent, recallKeyOf, type RecallRow } from './targets.js'
import { recallRanked, semanticSim, type EmbedCfg } from './vec.js'
import { createSupplyLedger, rowFingerprint, type SupplyLedger } from './supply-ledger.js'
// S4-6′（2026-09-14）：召回零命中归因（单独成件 —— mcl.ts 受大模块冻结棘轮约束，基线 617）
import { recallMissReasonOf } from './recall-diagnosis.js'
import { nextZeroGain, shouldSwitchSource } from './recall-yield.js'
import { envelopeEvent as envelope } from './event-envelope.js'

export interface MclConfig {
  enabled: boolean
  /** 熟悉度阈值（绝对余弦；缺省 0.58 = 2026-09-11 按 193 条实测样本重校准，见 criteria.json#surface.mcl） */
  familiarThreshold: number
  /** 慢通道再引导上限（缺省 1；0 = 只注入不引导） */
  maxNudges: number
  /** 材料硬预算（字符） */
  budgetChars: number
  /** 指针条数 */
  topK: number
  /** 审计开关（落 knowledgeRoot()/audit/mcl-audit.jsonl） */
  audit: boolean
  /**
   * **P2b（2026-09-13）**：慢通道材料是否改走 **systemPrompt 段**（缺省 false ＝ 现状零行为变化）。
   * 关时材料以「插一条 user 消息」进转录（旧行为）；开时材料只挂 systemPrompt 块、**不进消息面**
   * （消息面仅保留 `nudge`——方案档 §3.3 明确允许的唯一一项）。
   * ⚠ 若 `systemPrompt.context` 不可用，注册期会把本字段**回落为 false** 并记日志（宁走旧路，不可静默失效）。
   */
  materialInSystem: boolean
  /** 召回/嵌入配置（复用 vec 通道，与 scheduler 同源） */
  embed: EmbedCfg
}

export interface MclHooks {
  audit(o: Record<string, unknown>): void
  log(msg: string): void
}

export interface MclStatus {
  enabled: boolean
  familiarThreshold: number
  maxNudges: number
  budgetChars: number
  /**
   * P2b（2026-09-13）：慢通道材料的**实际去向**——true=挂 systemPrompt 段（消息面零插入）；
   * false=插消息面。这是**解析后**的值：`systemPrompt` 能力不可用时注册期会回落为 false，
   * 故读它可当场判断开关是否真的生效（不是读了配置就算数）。
   */
  materialInSystem: boolean
  /** P2b：systemPrompt 块被宿主渲染的次数（0 = 块没被调用；>0 = 通道在工作） */
  sysBlockCalls: number
  /** 其中**返回了材料**的次数（>0 ⇒ 材料真的进得了注入面） */
  sysBlockNonEmpty: number
  /** 末次返回的材料长度 */
  sysBlockLastChars: number
  /** **宿主传入 context 的键名**（诊断用：确认块渲染时拿得到什么） */
  sysBlockCtxKeys: string
  /** 末次从 context 解出的会话 id（`(未解出)` = 形状不符 ⇒ 材料取不到） */
  sysBlockLastSid: string
  /** **时序轨迹**（最近 14 条 `t|tag|sid8|len`）：`cap` 捕获用户消息 · `set` 写材料 · `ren` 块渲染 */
  trace: string[]
  steps: number
  fast: number
  slow: number
  injected: number
  /** P1（2026-09-13）：因「本会话已注入过」而省下的候选行数 —— 增量注入的证据面 */
  dupSkipped: number
  nudged: number
  lastAt: number
  lastChannel: 'fast' | 'slow' | ''
  lastSim: number
  sessions: number
  tasks: number
  /** P1 会话级台账规模（跨轮累积；轮级 state 的重置不影响它） */
  ledgerSessions: number
  ledgerRows: number
}

interface SessMcl {
  nudges: number
  topics: string[]
  /** 每行材料的「引用信号词元」集合（见 rowSignals；judge 的容错匹配用，2026-09-11 缺陷3） */
  signals: string[][]
  channel: 'fast' | 'slow' | ''
  sim: number
  lateLogged?: boolean
  /** P2b：本轮材料正文（供 systemPrompt 块渲染；轮级重置随 state 一并清） */
  materialText?: string
  /** 材料落在第几步（同一材料的当步不判合规） */
  materialStep?: number
  /** S4/D1（2026-09-14）：**连续零增益计数** —— 材料连投却始终未被引用即"线索变弱"，达阈值出换向信号 */
  zeroGain?: number
}

/** 消息工厂（DSH 官方 `createUserMessage` 动态加载；宿主/装配副本可解析，仓内无该包故不入静态 import → 手构兜底） */
type AnyMsg = { id: string; role: 'user'; content: Array<{ type: 'text'; text: string }>; source: Record<string, unknown> }
let msgFactory: ((input: unknown) => AnyMsg) | null = null
const loadMsgFactory = async (): Promise<void> => {
  if (msgFactory) return
  try {
    const spec = '@deepseek-ai/dsh-llm'
    const mod: any = await import(spec)
    if (mod && typeof mod.createUserMessage === 'function') {
      const f = mod.createUserMessage as (input: unknown) => AnyMsg
      msgFactory = (input: unknown) => f(input)
      return
    }
  } catch { /* 宿主未提供该包 → 手工构造兜底（同形状 + 冻结） */ }
  msgFactory = (input: unknown) => {
    const i = input as { content: Array<{ type: 'text'; text: string }>; source: Record<string, unknown> }
    return Object.freeze({
      id: `msg_mcl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'user' as const,
      content: i.content,
      source: i.source,
    })
  }
}

const topicOf = (line: string): string => {
  const m = String(line || '').match(/^\[[^\]]+\]\s*([^·]+)/)
  return (m ? m[1] : '').trim()
}

/**
 * 引用信号词元（缺陷3 修复，2026-09-11）：把「一行材料」拆成可被**转述**仍命中的词元。
 *   ASCII 整词 + 中文二字滑窗（长串拆窗以容忍省略/换序，如「MCP 工具接入」→「工具/具接/接入」）。
 *   旧 judge 只认「主题词前 6 字逐字复现」，模型一旦转述即判未引用（159/159 全 false，5 次再引导零生效）。
 */
const signalTokens = (s: string): string[] => {
  const t = String(s || '').toLowerCase()
  const out: string[] = []
  for (const m of t.matchAll(/[a-z0-9][a-z0-9._#+-]{1,}/g)) out.push(m[0])
  for (const m of t.matchAll(/[\u4e00-\u9fa5]{2,}/g)) {
    const run = m[0]
    if (run.length <= 4) { out.push(run); continue }
    for (let i = 0; i + 2 <= run.length; i++) out.push(run.slice(i, i + 2))
  }
  return out
}

/** 一行材料的信号词元 = 主题词 ∪ §小节名 ∪ 指针文件名（三条独立线索，任一足够命中即可判定已引用） */
const rowSignals = (r: RecallRow): string[] => {
  const sec = (String(r.line || '').match(/§([^/→]+)/) || [])[1] || ''
  const base = String(r.pointer || r.line || '').replace(/^notes\//, '').replace(/\.md$/, '')
  return [...new Set([...signalTokens(topicOf(r.line)), ...signalTokens(sec), ...signalTokens(base.replace(/^\[[^\]]+\]\s*/, ''))])]
}

/** 薄契约（只在慢通道出现，不进常驻注入面） */
const THIN_CONTRACT = [
  '【认知环·慢通道】这是你**不熟悉**的任务（记忆库无高置信命中）。本步先做三件事，再动手：',
  '① 复述任务类型与目标（一句话）；② 需要经验时调用 `shoucang_recall`，或按下面指针读详情；',
  '③ 定方向：引用一条 `[路径]`（可复用步骤）或 `[原则]`（跨任务约束），说明它如何改变你的做法。',
].join('\n')

/**
 * P2b：把慢通道材料挂上 `systemPrompt` 段（块序 89）。
 * **资源纪律**：块注册挂 `ctx.effect`（宿主能力，生命周期归 fiber）；无 effect 能力时直接注册。
 * **回落而非失效**：拿不到 `systemPrompt.context` 就把 `cfg.materialInSystem` 置回 false 并记日志
 * （宁走旧路，不可静默让认知环失效）。
 * 抽成模块级函数的原因：`registerMcl` 受 I1 棘轮约束（装配函数 ≤120 行），此处属可搬运的装配细节。
 */
/**
 * **时序轨迹**（模块级共用实现 · 2026-09-13）：环形保留最近 14 条 `t|tag|sid8|len`。
 * tag：`cap`=捕获用户消息（随后清轮级 state）· `set`=慢通道写入材料 · `ren`=块被渲染。
 * 动机：探针已排除"形状不符"（sid 能解出）⇒ 只能靠**事件序列**区分"渲染早于设置"与"设置后被清"。
 * ⚠ 必须放在**模块级**：`mountMaterialBlock` 与 `handlePreStep` 都是模块级函数，放注册函数内它们看不到。
 */
function pushTrace(counters: { trace?: string[] } | undefined, tag: string, sid: string, len = 0): void {
  try {
    const arr = counters?.trace
    if (!Array.isArray(arr)) return
    arr.push(`${(Date.now() % 1000000).toString(36)}|${tag}|${String(sid).slice(-8)}|${len}`)
    if (arr.length > 14) arr.shift()
  } catch { /* 轨迹失败无害（绝不影响主流程） */ }
}

/**
 * **任务文本捕获**（模块级 · 依赖显式窄传）：`session/event` 的 `user/message` 带结构源字段。
 * 为什么必须走事件流：pre-step 的 `decision.messages` 只是「本步出队的消息」，turn 首步过后就取不到用户原话
 * （口径同 ACT-024）。⚠ 实测（2026-09-13 轨迹）：该事件**可能晚于当轮 step 1 的 pre-step 到达**
 * ⇒ 那一步读不到任务文本，而判定被 `step !== 1` 挡住 ⇒ **整轮不判定**（见 §68 的时序轨迹）。
 */
function captureTaskText(
  d: { state: Map<string, SessMcl>; taskText: Map<string, string>; taskTextAt: Map<string, number>; ready: Set<string>; ledger: { newTask(sid: string): void }; counters?: { trace?: string[] } },
  session: any,
  event: any,
): void {
  try {
    if (!event || event.type !== 'user/message') return
    const sid = String(session?.id || '')
    if (!sid) return
    const data = event.data || {}
    if (!isRealUserEvent(event)) return // #4（2026-09-13）：判据收敛为 targets.isRealUserEvent 单一实现
    const text = (Array.isArray(data.content) ? data.content : [])
      .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string').map((b: any) => b.text).join('').trim()
    if (text.length < 6) return
    // P1 硬上界（原先 state/taskText/ready 三张 Map 除 state 外从无清理 ⇒ 长跑进程按会话数线性增长）
    if (d.state.size > 256) { d.state.clear(); d.taskText.clear(); d.taskTextAt.clear(); d.ready.clear() }
    d.taskText.set(sid, text)
    // **消息到达时刻**（2026-09-13 · 修判定门竞态）：判定时机改为"消息到达后的第一个 pre-step"，
    //   故必须记下到达时间。实测：子代理会话的 `cap` 可能落在当轮 step 1 的 pre-step **之后**
    //   ⇒ 旧门（只认 `step === 1`）让**整轮不判定**（`slow=0 fast=0`）。
    d.taskTextAt.set(sid, Date.now())
    // P1 v2：推进**本会话轮次** —— 台账按「最近 WINDOW 轮」去重，而非整会话永久去重
    d.ledger.newTask(sid)
    // 轮级重置（新任务）：**只清"判定态"，不清材料**（2026-09-13 §71 **活体根因**）。
    //   实测序列（真机 `trace`）：`pre`(判定) → `set`(材料 441 字符) → **`cap`(本函数) 到达** → 下一步 `ren` 读到 **0**。
    //   原因就是原来这里的 `state.delete(sid)`：**本机宿主的 `user/message` 落在当轮 pre-step 之后**
    //   ⇒ 它把刚写入的材料**抹掉** ⇒ 块永远读不到（而审计仍记 `viaSystem=1` ⇒ "意图"≠"送达"）。
    //   单元夹具一直通过，是因为夹具里 `cap` 总在 `set` **之前**（真实顺序恰好相反）——**夹具顺序一次都没覆盖真机顺序**。
    //   ⇒ 保留 `materialText`/`materialStep`（材料要活到那一步的渲染），只重置通道/主题/信号/再引导计数。
    if (d.state.has(sid)) {
      const st0 = d.state.get(sid)!
      st0.channel = ''
      st0.topics = []
      st0.signals = []
      st0.nudges = 0
      st0.sim = 0
      st0.lateLogged = false
    }
    pushTrace(d.counters, 'cap', sid, text.length)
  } catch { /* 捕获失败静默 */ }
}

function mountMaterialBlock(
  ctx: { logger?: { info?(m: string): void } },
  cfg: MclConfig,
  state: Map<string, SessMcl>,
  counters: { sysBlockCalls: number; sysBlockNonEmpty: number; sysBlockLastChars: number; sysBlockCtxKeys: string; sysBlockLastSid: string; trace?: string[] },
): void {
  const sp = (ctx as unknown as { systemPrompt?: { context?(o: unknown): () => void } }).systemPrompt
  if (!(sp && typeof sp.context === 'function')) {
    cfg.materialInSystem = false
    ctx.logger?.info?.('[shoucang] systemPrompt 能力不可用 ⇒ MCL 材料回落消息面（materialInSystem 已回落为 false）')
    return
  }
  const spawn = (): (() => void) => sp.context!({
    name: 'shoucang-mcl-material',
    order: 89, // mneme：user-settings=85 / 守藏热记忆=88 / 本块=89 / memory=90
    text: (context?: unknown) => {
      // **渲染计数**（2026-09-13 补）：把"块到底有没有被宿主调用、有没有返回材料"变成可读数字。
      // 动机：P2b 的原判据（引用合规率）在真实分布下**样本结构性稀疏**（合规判定只落在慢通道后续步，
      //   而多数步是快通道 ⇒ 实测窗口 0/803）⇒ 那条判据**执行不了**。块渲染计数则是**当场可测**的：
      //   它直接回答"材料有没有真的进注入面"这个 P2b 的实质问题。
      try {
        counters.sysBlockCalls++
        // **宿主传参探针**（2026-09-13 · 实测 `sysBlockNonEmpty=0` 而审计 `viaSystem=1` ⇒ 材料没送达）：
        //   把宿主实际传入的 context **形状**记下来（键名 + 能否解出 sid）——**测，不猜**。
        const ctxObj = (context && typeof context === 'object') ? (context as Record<string, unknown>) : {}
        counters.sysBlockCtxKeys = Object.keys(ctxObj).slice(0, 8).join(',').slice(0, 80)
        const ctxAgent = (context as { agent?: { id?: string; session?: { id?: string } } })?.agent
        const sid = String(ctxAgent?.session?.id || '')
        // **键同源判定**（2026-09-13 · 定 P2b 死活）：pre-step 用 `agent.id` 写 state，块用 `agent.session.id` 读 ——
        //   若两者不同 ⇒ 材料**永远读不到**（这就是"设了却渲染不空"的最可能原因）。故把"同/不同"直接记进轨迹。
        const aid = String(ctxAgent?.id || '')
        counters.sysBlockLastSid = sid ? sid.slice(0, 14) : '(未解出)'
        const t = sid ? (state.get(sid)?.materialText || '') : ''
        pushTrace(counters, aid && sid && aid !== sid ? 'renDIFF' : 'renSame', sid, t.length)
        if (t) { counters.sysBlockNonEmpty++; counters.sysBlockLastChars = t.length }
        return t
      } catch { return '' }
    },
  })
  const eff = (ctx as unknown as { effect?: (fn: () => unknown) => void }).effect
  if (typeof eff === 'function') eff(() => spawn())
  else spawn()
  ctx.logger?.info?.('[shoucang] MCL 材料已挂 systemPrompt 段（shoucang-mcl-material · order 89）')
}

/** 薄材料构造（纯函数，无闭包状态 ⇒ 模块级）：预算内有界取行 + 主题词 + 引用信号元 */
function materialOf(rows: RecallRow[], budget: number): { text: string; topics: string[]; signals: string[][] } {
  let budgetLeft = Math.max(120, budget - THIN_CONTRACT.length)
  const picked: string[] = []
  const topics: string[] = []
  const signals: string[][] = []
  for (const r of rows) {
    const ln = `- [${r.file}] ${r.line}`.slice(0, 200)
    if (ln.length > budgetLeft) break
    budgetLeft -= ln.length + 1
    picked.push(ln)
    const t = topicOf(r.line)
    if (t) topics.push(t)
    const sg = rowSignals(r)
    if (sg.length) signals.push(sg)
  }
  const text = picked.length ? `${THIN_CONTRACT}\n${picked.join('\n')}\n（材料仅本步有效；引用其主题词即视为已用）` : THIN_CONTRACT
  return { text, topics, signals }
}

export function registerMcl(
  ctx: {
    on(event: string, handler: (payload: any, arg2?: any) => any): unknown
    logger?: { info?(m: string): void }
  },
  cfg: MclConfig,
  hooksIn?: Partial<MclHooks>,
): { status(): MclStatus } {
  const hooks: MclHooks = {
    audit: hooksIn?.audit || ((o) => {
      if (!cfg.audit) return
      try {
        mkdirSync(join(knowledgeRoot(), 'audit'), { recursive: true })
        // DS4 合并第五刀（2026-09-13）：认知环审计并入**统一台账** `ledger.jsonl`（type=`mcl.<kind>`），
        //   不再单开 `mcl-audit.jsonl`。消费者核查：**代码侧 2 个**（面板 `/mcl/status` 的 recent、
        //   `scripts/mcl-compliance.mjs`）⇒ 两处均改为「legacy 文件（历史）∪ 台账里的 mcl.* 行」双源读。
        // 判别字段直接用 kind（`mcl-ready` 等）——**别再加 `mcl.` 前缀**：kind 本身已带，否则成 `mcl.mcl-ready`。
        appendFileSync(join(knowledgeRoot(), 'audit', 'ledger.jsonl'), envelope(o, String((o as { kind?: string }).kind || 'mcl-event')), 'utf8')
      } catch { /* 审计失败静默 */ }
    }),
    log: hooksIn?.log || (() => { /* 静默 */ }),
  }
  const state = new Map<string, SessMcl>()
  const taskText = new Map<string, string>()
  const taskTextAt = new Map<string, number>() // 消息到达时刻（判定门用，见 §69）
  const lastStepAt = new Map<string, number>() // 上次 pre-step 时刻（判定门用）
  // P1（2026-09-13 · 方案档 D3/D4）：**会话级**注入台账。刻意与轮级 `state` 分离——
  //   state 在每条用户消息时 reset（那是轮级语义，正确），台账则跨轮累积（否则去重信息自删 ⇒ 重复注入）。
  const ledger = createSupplyLedger()
  const counters = { steps: 0, fast: 0, slow: 0, injected: 0, dupSkipped: 0, nudged: 0, lastAt: 0, lastChannel: '' as '' | 'fast' | 'slow', lastSim: 0, sysBlockCalls: 0, sysBlockNonEmpty: 0, sysBlockLastChars: 0, sysBlockCtxKeys: '', sysBlockLastSid: '', trace: [] as string[] }
  const ready = new Set<string>()
  // ── P2b（2026-09-13）：慢通道材料改挂 **systemPrompt 段** ──
  // 动机（方案档 §8 P2 / §3.3）：材料原以「插一条 user 消息」进转录 ⇒ ① 污染转录（§11 度量
  //   「转录内 MCL user/message 条数」目标 0）② 位置随消息漂移、前缀缓存不友好。改挂 systemPrompt 块后
  //   材料随注入面渲染、字节稳定、**不再进消息面**（消息面只留 `nudge`）。
  // 缺省关（`materialInSystem=false`）＝现状零行为变化；一键回滚见 scheduler `mclMaterialInSystem`。
  // 资源纪律：块注册挂 `ctx.effect`（宿主能力，生命周期归 fiber）；无 effect 能力时直接注册。
  if (cfg.materialInSystem) mountMaterialBlock(ctx, cfg, state, counters)
  void loadMsgFactory()

  /**
   * 合规判定（缺陷3 修复）：三信号「或」——① 主题词全串 ② 主题词前缀（旧口径，保留）③ 信号词元覆盖率。
   *   ③ 是修复核心：容忍转述/省字（≥2 个词元且覆盖率 ≥60% 即算引用）。
   *   保留严格下限的意义：不能把「提了一句相关词」也算合规，故仍要求**足够密度**而非任意单字命中。
   */
  const judge = (text: string, topics: string[], signals: string[][] = []): boolean => {
    if (!text) return false
    if (!topics.length && !signals.length) return false
    const low = String(text).toLowerCase()
    for (const t of topics) {
      if (!t || t.length < 2) continue
      if (low.includes(t.toLowerCase())) return true // ① 全串
      if (low.includes(t.slice(0, 6).toLowerCase())) return true // ② 前缀（旧口径）
    }
    for (const sg of signals) { // ③ 词元覆盖率
      if (!sg.length) continue
      const hit = sg.filter((s) => low.includes(s)).length
      if (hit >= 2 && hit / sg.length >= 0.6) return true
    }
    return false
  }

  const mkMsg = (text: string): AnyMsg => msgFactory!({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'shoucang-mcl', form: 'recall' } })

  // 任务文本捕获（主通道）：实现已提到**模块级** `captureTaskText`（仓内约定：实现函数在模块级，依赖显式窄传）
  //   —— 提出来同时把装配函数行数压回 I1 棘轮（≤120 行）以内。
  ctx.on('session/event', (session: any, event: any) => {
    captureTaskText({ state, taskText, taskTextAt, ready, ledger, counters }, session, event)
    // ★2026-09-13 §70 **层二修复**：**消息到达即判定**。
    //   为什么必须在这里判：块在**请求装配**时渲染，**早于本步 pre-step** ⇒ 若材料只在 pre-step 里写，
    //   块永远晚一步、实际取不到（真机实测 `injected=436 viaSystem=1` 而 `sysBlockNonEmpty=0`）。
    //   本处理器本就可 async ⇒ 在这里先判一次，**当轮首次渲染**即可取到材料；pre-step 仍调用同一函数兜底。
    //   **仅 system 段模式**下做：消息面模式下 pre-step 要负责插消息，提前判定会抢走那次插入。
    if (cfg.materialInSystem && event?.type === 'user/message') {
      const sid = String(session?.id || '')
      if (sid && taskText.get(sid)) {
        void decideTurn({ cfg, counters, state, taskText, ledger, hooks, tools: { material: materialOf, judge, mkMsg } }, sid, 1)
          .then(() => pushTrace(counters, 'early', sid, 0))
          .catch(() => { /* 静默：pre-step 仍会兜底 */ })
      }
    }
  })

  ctx.on('agent/pre-step', (payload: any, next: () => Promise<any>) => handlePreStep(payload, next, { cfg, counters, taskText, taskTextAt, lastStepAt, ready, hooks, state, ledger, tools: { material: materialOf, judge, mkMsg } }))

  ctx.logger?.info?.(`[shoucang] MCL 认知环已装配（enabled=${cfg.enabled} 阈值=${cfg.familiarThreshold} maxNudges=${cfg.maxNudges} 预算=${cfg.budgetChars} 指针=${cfg.topK}）`)

  return {
    status: (): MclStatus => ({
      enabled: cfg.enabled,
      familiarThreshold: cfg.familiarThreshold,
      maxNudges: cfg.maxNudges,
      budgetChars: cfg.budgetChars,
      materialInSystem: cfg.materialInSystem, // P2b 解析后的实际去向（回落时会变 false ⇒ 活体可核）
      // P2b 的**可当场测量**面：块被宿主渲染了几次 / 其中几次带材料 / 末次材料长度
      sysBlockCalls: counters.sysBlockCalls,
      sysBlockNonEmpty: counters.sysBlockNonEmpty,
      sysBlockLastChars: counters.sysBlockLastChars,
      sysBlockCtxKeys: counters.sysBlockCtxKeys,
      sysBlockLastSid: counters.sysBlockLastSid,
      trace: counters.trace,
      steps: counters.steps,
      fast: counters.fast,
      slow: counters.slow,
      injected: counters.injected,
      nudged: counters.nudged,
      dupSkipped: counters.dupSkipped,
      lastAt: counters.lastAt,
      lastChannel: counters.lastChannel,
      lastSim: Number(counters.lastSim.toFixed(3)),
      sessions: state.size,
      tasks: taskText.size,
      ledgerSessions: ledger.stats().sessions,
      ledgerRows: ledger.stats().rows,
    }),
  }
}

/** `agent/pre-step` 处理器（自 registerMcl 提出；registerMcl 因此满足 I1 的 120 行上限）。
 *  依赖 **7 项**（收尾前 9 项：把注入面三个纯函数收进 `tools` 一组），均为装配期构造的会话态/工具；
 *  依赖显式传递，不再靠闭包隐式可见。
 *  口径：终极方案 §五「任一实现函数的依赖宽度 ≤ 8」+ AGENTS.md「分组后每组 ≤8」。
 *  为何是收 `material/judge/mkMsg` 而不是会话态：前者全函数仅 5 次引用、后者 15 次——
 *  收组要动引用面最小的一侧，别为凑指标去翻热路径。 */
export interface PreStepDeps {
  /** registerMcl 的配置形参（不是 body 里的 const ⇒ 依赖测绘易漏） */
  cfg: MclConfig
  counters: { steps: number; fast: number; slow: number; injected: number; dupSkipped: number; nudged: number; lastAt: number; lastChannel: '' | 'fast' | 'slow'; lastSim: number; trace?: string[] }
  state: Map<string, SessMcl>
  /** P1：会话级注入台账（跨轮累积；与轮级 state 生命周期不同） */
  ledger: SupplyLedger
  taskText: Map<string, string>
  /** 该会话**任务文本到达时刻**（判定门用） */
  taskTextAt: Map<string, number>
  /** 该会话**上次 pre-step 时刻**（判定门用） */
  lastStepAt: Map<string, number>
  ready: Set<string>
  hooks: MclHooks
  /** 注入面三件：材料装配 / 合规判定 / 消息构造 */
  tools: {
    material(rows: RecallRow[], budget: number): { text: string; topics: string[]; signals: string[][] }
    judge(text: string, topics: string[], signals?: string[][]): boolean
    mkMsg(text: string): AnyMsg
  }
}

/**
 * **通道判定（单一实现 · 两处触发）** —— 2026-09-13 §70 层二修复。
 *
 * 为什么需要"两处触发"：**块在请求装配时渲染，早于本步的 `pre-step`**（实测：`injected=436 viaSystem=1`
 * 而 `sysBlockNonEmpty=0`，21 次渲染全空）⇒ 若材料只在 `pre-step` 里写，块**永远晚一步**、实际取不到。
 * 故：① **消息到达时**（`session/event`，本可 async）先判一次 ⇒ 当轮**首次渲染**即可取到材料；
 *     ② `pre-step` 仍调用同一函数兜底（消息面注入也在此完成）。靠 `st.channel` **幂等**，不会判两次。
 */
export interface DecideDeps { cfg: PreStepDeps['cfg']; counters: PreStepDeps['counters']; state: Map<string, SessMcl>; taskText: Map<string, string>; ledger: SupplyLedger; hooks: MclHooks; tools: PreStepDeps['tools'] }
export interface DecideResult { decided: boolean; channel: '' | 'fast' | 'slow'; material: { text: string; topics: string[]; signals: string[][] } | null; fresh: RecallRow | null; dupSkipped: number; hit: string; st: SessMcl }

export async function decideTurn(d: DecideDeps, sid: string, step: number): Promise<DecideResult> {
  let st = d.state.get(sid)
  if (!st) { st = { nudges: 0, topics: [], signals: [], channel: '', sim: 0, materialText: '' }; d.state.set(sid, st) }
  const none: DecideResult = { decided: false, channel: '', material: null, fresh: null, dupSkipped: 0, hit: '', st }
  if (st.channel) return none // 本轮已判定 ⇒ 幂等
  const text = d.taskText.get(sid) || ''
  if (!text) return none
  const short = sid.replace(/^session-/, '').slice(0, 8)
  const r = await recallRanked(memoryLibRoot(), text, d.cfg.topK, 'all', d.cfg.embed)
  const hcSet = highConfCarrierSet() // 单一事实源：注册表 `mclGate: true`（勿再写硬编码正则）
  // ★R2：熟悉度探针用**高置信行**（若存在），与 hasHighConf **同一行**（旧实现锚在不同行 ⇒ 快通道恒 0）
  const tagOfRow = (x: RecallRow): string => String(indexRowTag(String(x.line || '')) || '')
  const probeRow = r.rows.find((x) => { const t = tagOfRow(x); return !!t && hcSet.has(t) }) || r.rows[0]
  let sim = 0
  if (probeRow && d.cfg.embed.enabled) {
    try { const c = await semanticSim(text, probeRow.line, d.cfg.embed); if (c !== null) sim = Math.max(0, Math.min(1, c)) } catch { /* 保持 0 */ }
  }
  // R1：把融合召回结果落**预热缓存**，供**同步**注入面复用（零新增嵌入开销）
  try {
    mkdirSync(join(knowledgeRoot(), 'audit'), { recursive: true })
    writeFileSync(join(knowledgeRoot(), 'audit', 'warm-recall.json'), JSON.stringify({
      at: Date.now(), key: recallKeyOf(text), rows: r.rows.slice(0, 6).map((x) => ({ line: x.line, file: x.file, pointer: x.pointer })),
    }), 'utf8')
  } catch { /* 预热失败不影响主链路 */ }
  const hasHighConf = r.rows.some((x) => { const t = indexRowTag(String(x.line || '')); return !!t && hcSet.has(t) })
  const fast = sim >= d.cfg.familiarThreshold && hasHighConf
  // S4-6′（2026-09-14）**零命中归因**：口径与上面的 `fast` 判定**同序**（实现在 recall-diagnosis）。
  //   判因：实测 81.7% 的步 `hit` 为空，而审计此前**说不出为什么**（"没网格可召回"与"召回了但不熟悉"
  //   在审计上都是 `hit:''`）⇒ 任何关于阈值/分流的改动都只能是猜。
  const missReason = recallMissReasonOf({ rowsN: r.rows.length, hasHighConf, sim, threshold: d.cfg.familiarThreshold, embedEnabled: d.cfg.embed.enabled })
  st.channel = fast ? 'fast' : 'slow'
  st.sim = sim
  d.counters.lastAt = Date.now(); d.counters.lastChannel = st.channel; d.counters.lastSim = sim
  if (fast) {
    d.counters.fast++
    d.hooks.audit({ kind: 'mcl-step', sid: short, step, channel: 'fast', phase: 'inject', sim: Number(sim.toFixed(3)), rowsN: r.rows.length, missReason, hit: r.rows[0]?.line?.slice(0, 100) || '', injected: 0 })
    return { decided: true, channel: 'fast', material: null, fresh: null, dupSkipped: 0, hit: r.rows[0]?.line?.slice(0, 100) || '', st }
  }
  d.counters.slow++
  // P1 增量注入：剔除**本会话已注入过**的行（台账独立于轮级 state ⇒ 跨轮生效）
  const fps = r.rows.map((x) => rowFingerprint(x))
  const freshRows = r.rows.filter((_x, i) => !d.ledger.seen(sid, fps[i]))
  const dupSkipped = r.rows.length - freshRows.length
  d.counters.dupSkipped += dupSkipped
  if (!freshRows.length) {
    d.hooks.audit({ kind: 'mcl-step', sid: short, step, channel: 'slow', phase: 'inject', sim: Number(sim.toFixed(3)), rowsN: r.rows.length, missReason, injected: 0, dupSkipped, nudge: 0 })
    d.hooks.log(`mcl: ${sid.slice(0, 8)} 慢通道 → 全量去重，本步零注入（省 ${dupSkipped} 行）`)
    return { decided: true, channel: 'slow', material: null, fresh: null, dupSkipped, hit: '', st }
  }
  const m = d.tools.material(freshRows, d.cfg.budgetChars)
  d.ledger.mark(sid, freshRows.map((x) => rowFingerprint(x)))
  st.topics = m.topics; st.signals = m.signals
  st.materialText = m.text // 供 systemPrompt 块渲染（跨步存活、随新任务重置）
  st.materialStep = step // ★记录"材料落在第几步"：同一材料的**当步**不做合规判（模型还没机会用它）
  pushTrace(d.counters, 'set', sid, m.text.length)
  d.counters.injected++
  if (d.cfg.materialInSystem) {
    d.hooks.audit({ kind: 'mcl-step', sid: short, step, channel: 'slow', phase: 'inject', sim: Number(sim.toFixed(3)), rowsN: r.rows.length, missReason, hit: r.rows[0]?.line?.slice(0, 100) || '', topics: m.topics, injected: m.text.length, dupSkipped, nudge: 0, viaSystem: 1 })
    d.hooks.log(`mcl: ${sid.slice(0, 8)} 慢通道 → 材料入 systemPrompt 段 ${m.text.length} 字符 / ${m.topics.length} 主题（sim=${sim.toFixed(3)}；不进消息面）`)
    return { decided: true, channel: 'slow', material: null, fresh: freshRows[0] || null, dupSkipped, hit: r.rows[0]?.line?.slice(0, 100) || '', st }
  }
  return { decided: true, channel: 'slow', material: { text: m.text, topics: m.topics, signals: m.signals }, fresh: freshRows[0] || null, dupSkipped, hit: r.rows[0]?.line?.slice(0, 100) || '', st }
}

export async function handlePreStep(payload: any, next: () => Promise<any>, dep: PreStepDeps): Promise<any> {

    let decision: any = null
    try { decision = await next() } catch { return null }
    try {
      dep.counters.steps++ // 最前置：steps>0 即证明宿主确实调用了本钩子（存活判据）
      if (!dep.cfg.enabled || !decision || decision.kind === 'reject') return decision
      const agent = payload?.agent
      const sid = String(agent?.id || '')
      if (!sid) return decision
      if (agent?.session?.header?.origin === 'subagent') return decision // 子代理不引导
      const step = Number(payload?.step || 0)
      const messages: any[] = Array.isArray(decision.messages) ? decision.messages : []

      // 任务文本按会话记忆（主通道=session/event 捕获；此处为兜底：首步 messages 里若带真用户消息则刷新）
      const fresh = [...messages].reverse().find((m) => m && m.role === 'user' && isRealUserEvent(m))
      if (fresh) {
        const t = (Array.isArray(fresh.content) ? fresh.content : [])
          .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string').map((b: any) => b.text).join('').trim()
        if (t.length >= 6 && !dep.taskText.get(sid)) {
          dep.taskText.set(sid, t)
          // 兜底捕获也算"消息到达"（否则判定门 `freshTurn` 恒 false ⇒ 热重载跨轮时整轮不判定）
          if (!dep.taskTextAt.get(sid)) dep.taskTextAt.set(sid, Date.now())
        }
      }
      const text = dep.taskText.get(sid) || ''
      if (!text) { pushTrace(dep.counters, 'pre0', sid, 0); return decision } // `pre0`=该步无任务文本（含 sid 空的情形，见 §69 轨迹）
      pushTrace(dep.counters, 'pre', sid, text.length)
      if (!dep.ready.has(sid)) { dep.ready.add(sid); dep.hooks.audit({ kind: 'mcl-ready', sid: sid.replace(/^session-/, '').slice(0, 8), step }) }

      let st = dep.state.get(sid)
      if (!st) { st = { nudges: 0, topics: [], signals: [], channel: '', sim: 0, materialText: '' }; dep.state.set(sid, st) }

      // 注入只发生在**任务首步**：中途步（如热重载跨轮）不插材料，只记一次 skip（防在任务半途打断）
      // ★修正（2026-09-13 §69）：原判据只认 `step === 1`，而实测**消息可能落在当轮 step 1 的 pre-step 之后**
      //   （子代理会话 `cap` 晚到）⇒ 那一步读到空文本、后续步又被 `step !== 1` 挡 ⇒ **整轮不判定**（slow=0 fast=0）。
      //   修正后的原理：**判定时机 = 消息到达后的第一个 pre-step**（`capAt > 上次 pre-step 时刻`），
      //   并**限前 3 步内**（超出仍按"不打断进行中的任务"处理）——这才是原意图（不中途打断）的正确表达。
      const capAt = dep.taskTextAt.get(sid) || 0
      const prevStepAt = dep.lastStepAt.get(sid) || 0
      dep.lastStepAt.set(sid, Date.now())
      const freshTurn = capAt > prevStepAt && step <= 3
      if (!st.channel && step !== 1 && !freshTurn) {
        if (!st.lateLogged) { st.lateLogged = true; dep.hooks.audit({ kind: 'mcl-skip', sid: sid.replace(/^session-/, '').slice(0, 8), step, reason: 'late-step' }) }
        return decision
      }

      // ① 通道判定（**单一实现** = decideTurn；本次 pre-step 是**兜底触发**——消息到达时已可能判过）
      if (!st.channel) {
        const res = await decideTurn(dep, sid, step)
        if (!res.decided || res.channel !== 'slow' || !res.material) return decision
        // 消息面注入（system 段模式已在 decideTurn 内落账并返回 null material）
        await loadMsgFactory()
        const idx = messages.lastIndexOf(res.fresh)
        const entered = idx >= 0 ? messages.slice(0, idx + 1).concat([dep.tools.mkMsg(res.material.text)], messages.slice(idx + 1)) : messages.concat([dep.tools.mkMsg(res.material.text)])
        dep.hooks.audit({ kind: 'mcl-step', sid: sid.replace(/^session-/, '').slice(0, 8), step, channel: 'slow', phase: 'inject', sim: Number(res.st.sim.toFixed(3)), hit: res.hit, topics: res.material.topics, injected: res.material.text.length, dupSkipped: res.dupSkipped, nudge: 0 })
        dep.hooks.log(`mcl: ${sid.slice(0, 8)} 慢通道 → 首步注入 ${res.material.text.length} 字符 / ${res.material.topics.length} 主题（sim=${res.st.sim.toFixed(3)}）`)
        return { ...decision, messages: entered }
      }
      // ② 快通道：零材料零往返
      if (st.channel === 'fast') return decision

      // ③ 慢通道后续步：合规机检（是否引用注入材料的主题词）→ 有界再引导
      //   ★闸（2026-09-13 §70）：材料若**落在本步**（含"消息到达即判定"把材料放进 system 段的情形），
      //   本步**不判合规**——模型还没有机会使用它；否则会在第 1 步就误发再引导（实测 F3 回归）。
      if (step <= Number(st.materialStep || 0)) return decision
      const prevAssistant = [...messages].reverse().find((m) => m && m.role === 'assistant')
      const prevText = prevAssistant && Array.isArray(prevAssistant.content)
        ? prevAssistant.content.filter((b: any) => b && (b.type === 'text' || b.type === 'reasoning') && typeof b.text === 'string').map((b: any) => b.text).join('')
        : ''
      const compliant = dep.tools.judge(prevText, st.topics, st.signals)
      st.zeroGain = nextZeroGain(st.zeroGain, compliant) // S4/D1：折收益（合规归零、不合规递增）
      if (!compliant && st.nudges < dep.cfg.maxNudges && st.topics.length) {
        st.nudges++
        dep.counters.nudged++
        await loadMsgFactory()
        const nudge = `【认知环·再引导 ${st.nudges}/${dep.cfg.maxNudges}】上一步未引用本任务相关的经验（${st.topics.slice(0, 3).join(' / ')}）。请用一句话补上：任务类型与目标 + 你要引用的一条 \`[路径]\`/\`[原则]\`（指针见上一步材料），然后继续。`
        dep.hooks.audit({ kind: 'mcl-step', sid: sid.replace(/^session-/, '').slice(0, 8), step, channel: 'slow', phase: 'compliance', materialChars: (st.materialText || '').length, materialStep: st.materialStep || 0, sim: Number(st.sim.toFixed(3)), compliant: false, nudge: 1, zeroGain: st.zeroGain, switchSource: shouldSwitchSource(st.zeroGain), topics: st.topics })
        dep.hooks.log(`mcl: ${sid.slice(0, 8)} 慢通道 → 再引导 ${st.nudges}/${dep.cfg.maxNudges}`)
        return { ...decision, messages: messages.concat([dep.tools.mkMsg(nudge)]) }
      }
      if (!compliant) {
        dep.hooks.audit({ kind: 'mcl-step', sid: sid.replace(/^session-/, '').slice(0, 8), step, channel: 'slow', phase: 'compliance', materialChars: (st.materialText || '').length, materialStep: st.materialStep || 0, sim: Number(st.sim.toFixed(3)), compliant: false, nudge: 0, nudges: st.nudges, zeroGain: st.zeroGain, switchSource: shouldSwitchSource(st.zeroGain), topics: st.topics })
      } else {
        // **合规步也落账**（2026-09-13 补）：原实现只在「不合规」分支写审计行 ⇒ 合规率**没有分母**
        //   （实测 mcl-audit 803 条全为 compliant:false、合规 0 行）⇒ 方案档 §12 风险 1 的放行判据
        //   「合规率不降才放行」**无法执行**。补上这一行才有前后可比 —— 「机制必须有仪表盘」的又一例。
        dep.hooks.audit({ kind: 'mcl-step', sid: sid.replace(/^session-/, '').slice(0, 8), step, channel: 'slow', phase: 'compliance', materialChars: (st.materialText || '').length, materialStep: st.materialStep || 0, sim: Number(st.sim.toFixed(3)), compliant: true, nudge: 0, nudges: st.nudges, zeroGain: st.zeroGain, switchSource: shouldSwitchSource(st.zeroGain), topics: st.topics })
      }
      return decision
    } catch (e) {
      try { dep.hooks.audit({ kind: 'mcl-error', err: String((e as Error)?.message || e).slice(0, 160) }) } catch { /* 静默 */ }
      return decision
    }
  
}
