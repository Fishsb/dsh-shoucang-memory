/**
 * @dsh-external/shoucang-panel / observe — 观测/判据/深睡-蒸馏配置领域。
 * 端点：GET /suite · /mcl/status · /reconcile · /selfcheck · /selfcheck/run · /config/recent ·
 *      /criteria · /cognition/report · /llm/models ·
 *      GET /deepsleep · POST /deepsleep/trigger · GET+POST /deepsleep/config ·
 *      POST /distill/run · GET+POST /distill/config
 * 依赖窄传：3 个（route / suite / logger）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SURFACE, TRIGGER } from './criteria.generated.js'
import { dshHome, knowledgeRoot, memoryLibRoot } from './targets.js'
import { runProcAsync } from './proc-async.js'
import { readLedgerVolumes } from './ledger-compact.js'
import type { DeepSleepApi, MclHandle, SchedulerApi } from './composition.js'
import { contractFor } from './panel-contract.js'
import { readBody, sendJson } from './panel-shared.js'
import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js'
import { RECORD_DIR, loadStore } from './record-shadow.js'
import { readDistillAuditText } from './audit-source.js'
import { readTailLines } from './file-stat-cache.js'
import { associationCensus } from './association-ring.js'
import { scorecardOf } from './decision-ring.js'
import { factCensus } from './fact-ring.js'
import { relationCensus, trustOf } from './relation-ring.js'
import { ringCensus } from './rings.js'
import { RING_EVENT_FILE, parseEvents, reconcileRing } from './ring-events.js'
import { CONSUMER_CHANNELS, createContentTypesApi } from './content-types.js'
import { splitLawOf } from './criteria.js'

export interface ObserveDeps {
  route: RouteFn
  suite: SuiteConfigAccess
  logger: PanelLogger
  /** G0 composition root（2026-09-13）：MCL 句柄由 root 显式传入，取代原 `mcl-share` 全局 holder */
  mcl: { current: MclHandle | null }
  /** 同上：深睡/蒸馏句柄，取代原 `deepsleep-share` 全局 holder */
  deepSleep: { current: DeepSleepApi | null }
  /** 同上：scheduler 装配面句柄，取代原 `scheduler-share` 全局 holder（三桥至此全消） */
  scheduler: { current: SchedulerApi | null }
}

/** 深度睡眠配置键校验（与 scheduler.Config 同约束）；返回错误串或 null */
const validateDeepSleepConfig = (c: Record<string, unknown>): string | null => {
  if ('enableDeepSleep' in c && typeof c.enableDeepSleep !== 'boolean') return 'enableDeepSleep 须为布尔'
  if ('deepSleepProbe' in c && typeof c.deepSleepProbe !== 'boolean') return 'deepSleepProbe 须为布尔'
  if ('deepSleepIdleMs' in c) {
    const n = Number(c.deepSleepIdleMs)
    if (!Number.isFinite(n) || n < 600000) return 'deepSleepIdleMs 须 ≥ 600000（10 分钟）'
  }
  if ('deepSleepProbeAfterMs' in c) {
    const n = Number(c.deepSleepProbeAfterMs)
    if (!Number.isFinite(n) || n < 600000) return 'deepSleepProbeAfterMs 须 ≥ 600000（10 分钟）'
  }
  if ('deepSleepProbeWindowMs' in c) {
    const n = Number(c.deepSleepProbeWindowMs)
    if (!Number.isFinite(n) || n < 5000) return 'deepSleepProbeWindowMs 须 ≥ 5000（5 秒）'
  }
  return null
}

/** 蒸馏节流组键（键名同 scheduler.Config；UI 通道写入 ~/.dsh/suite/scheduler.json，重载生效） */
const DISTILL_CONFIG_KEYS = ['enableDistill', 'idleWakeMs', 'minTurnChars', 'distillPrescan', 'llmProvider', 'llmModel', 'distillProvider', 'distillModel', 'sleepProvider', 'sleepModel'] as const

/** 蒸馏节流组配置键校验（与 scheduler.Config 同约束）；返回错误串或 null */
const validateDistillConfig = (c: Record<string, unknown>): string | null => {
  if ('enableDistill' in c && typeof c.enableDistill !== 'boolean') return 'enableDistill 须为布尔'
  if ('distillPrescan' in c && typeof c.distillPrescan !== 'boolean') return 'distillPrescan 须为布尔'
  if ('idleWakeMs' in c) {
    const n = Number(c.idleWakeMs)
    if (!Number.isFinite(n) || n < 60000) return 'idleWakeMs 须 ≥ 60000（1 分钟）'
  }
  if ('minTurnChars' in c) {
    const n = Number(c.minTurnChars)
    if (!Number.isFinite(n) || n < 0) return 'minTurnChars 须 ≥ 0'
  }
  if ('llmProvider' in c && typeof c.llmProvider !== 'string') return 'llmProvider 须为字符串'
  if ('llmModel' in c && typeof c.llmModel !== 'string') return 'llmModel 须为字符串'
  if ('distillProvider' in c && typeof c.distillProvider !== 'string') return 'distillProvider 须为字符串'
  if ('distillModel' in c && typeof c.distillModel !== 'string') return 'distillModel 须为字符串'
  if ('sleepProvider' in c && typeof c.sleepProvider !== 'string') return 'sleepProvider 须为字符串'
  if ('sleepModel' in c && typeof c.sleepModel !== 'string') return 'sleepModel 须为字符串'
  return null
}

// v2.2：睡眠期自检视图 —— GET 读最近一次裁决；POST /selfcheck/run 立即跑一次（**手动触发**，解"想不起来"）
/** 自检互斥（D-I4）。**为什么 async 化后必须有它**：原同步实现天然串行；改异步后并发两次会
 *  **争写同一个 `--out` 文件**（后者的产物覆盖前者、且两份 JSON 可能交错）⇒ 第二次直接**拒绝、不排队**
 *  （排队会让前端"点了没反应"，拒绝能立刻给出可读原因）。
 *  ⚠ 状态**刻意不落模块级 `let`**：`check-module-growth` 把「模块级可重赋绑定」判为**可变全局**
 *  （棘轮基线 0，只许降）⇒ 由 `registerObserveRoutes` 的**闭包按实例持有**，见下方注册处。 */
type SelfcheckLock = { running: boolean }

const runSelfCheckNow = async (d: ObserveDeps, lock: SelfcheckLock): Promise<Record<string, unknown>> => {
  const script = join(memoryLibRoot(), 'scripts', 'sleep-selfcheck.mjs')
  if (!existsSync(script)) return { active: false, error: 'sleep-selfcheck.mjs 未部署' }
  if (lock.running) return { active: false, error: 'already-running', note: '上一次自检仍在跑（并发被拒绝，不排队）' }
  lock.running = true
  try {
    const out = join(knowledgeRoot(), 'audit', 'selfcheck-latest.json')
    const args = ['--out', out, '--trigger', 'manual']
    const repo = String(d.suite.read().selfCheckRepo || '')
    if (repo) args.push('--repo', repo)
    /* D-I4：原为 `execFileSync`（**同步阻塞宿主唯一事件循环，上限 180s**）且 `stdio:'ignore'`（丢光子进程 stderr）。
     *   改异步后不阻塞、且不丢 stderr。**超时值沿用 180s 不动**：新值须先测内层 6 项串行真实耗时，
     *   按 `6×t_inner + 启动 + 余量 ≤ t_outer` 落值，并与 `src-client` 的文案**同批**改（未测前不拍数字）。 */
    const r = await runProcAsync('node', [script, ...args], { timeoutMs: 180000 })
    if (!r.ok) return { active: false, error: (r.timedOut ? '自检超时（180s）' : '自检失败') + (r.err ? '：' + r.err.trim().slice(0, 200) : '') }
    return { active: true, ...(JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>) }
  } catch (e) { return { active: false, error: String(e).slice(0, 200) } } finally { lock.running = false }
}

/**
 * 五环 KPI + 环事件对账（只读，零 LLM）。
 *
 * 为什么有它：环内容（决策/后果/价态/关系/承诺/碰撞）此前**只有 CLI 面**，面板完全看不到——
 * 而"机制没有仪表盘"正是本项目反复踩的坑（快通道恒 0、崩两次才被人肉发现）。
 * 本路由把五环 KPI 与**事件流重放对账**一次暴露：人不必开终端就能看出「哪条环僵了」。
 * 只读：不写库、不触发 LLM、不改配置（与 observe 域其余端点同规格）。
 */
function ringsRoute(_d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const root = memoryLibRoot()
    const { records, error } = loadStore(root)
    const at = new Date().toISOString()
    const evPath = join(root, RECORD_DIR, RING_EVENT_FILE)
    const hasEvents = existsSync(evPath)
    const events = hasEvents ? parseEvents(readFileSync(evPath, 'utf8')) : []
    const rec = reconcileRing(records, events)
    const who = Object.keys(relationCensus(records).byWho)
    sendJson(res, 200, {
      active: !error,
      root,
      at,
      census: ringCensus(records),
      decision: scorecardOf(records),
      relation: { ...relationCensus(records), trust: who.map((w) => trustOf(records, w)) },
      association: associationCensus(records),
      fact: factCensus(records, at),
      events: {
        present: hasEvents,
        count: events.length,
        reconcile: {
          ok: rec.ok,
          store: rec.storeCount,
          replay: rec.replayCount,
          missing: rec.missingInReplay.length,
          extra: rec.extraInReplay.length,
          differing: rec.differing.length,
          errors: rec.errors.length,
        },
      },
      ...(error ? { error } : {}),
    })
  } catch (e) { sendJson(res, 500, { error: String(e).slice(0, 200) }) }
}

function suiteRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const api = d.scheduler.current
    if (!api) return sendJson(res, 200, { members: [], summary: '调度器未就绪（装配面经 composition root 显式传入；空成员=如实空态）' })
    sendJson(res, 200, api.suiteScan())
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

/**
 * 认知环审计的**最近若干行**（DS4 合并第五刀 · 2026-09-13）：
 * 现行落在**统一台账**里（`type=mcl.*`），历史批次仍在 legacy `mcl-audit.jsonl` ⇒ **双源合并**（历史不丢）。
 */
function mclAuditRecent(root: string, n = 10): unknown[] {
  const out: unknown[] = []
  const push = (file: string, keep: (o: { type?: unknown }) => boolean): void => {
    try {
      const f = join(root, 'audit', file)
      if (!existsSync(f)) return
      /* 2026-09-17（D-I5）：原为**全量同步读 + 逐行 parse**（台账实测 3,499,167 B），而调用方只要**最近 10 条**
       *   ⇒ 改真字节级尾读（末尾 ≤256KB 窗口，缓存）。窗口以前的历史行不在此列 —— 对"最近 N 条"语义等价。 */
      for (const l of readTailLines(f, 400)) {
        try { const o = JSON.parse(l); if (keep(o)) out.push(o) } catch { /* 坏行跳过 */ }
      }
    } catch { /* 不可读=空 */ }
  }
  push('mcl-audit.jsonl', () => true) // 历史批次（legacy 只读）
  push('ledger.jsonl', (o) => String(o?.type || '').startsWith('mcl')) // 现行（统一台账；兼容历史 `mcl.*` 写法）
  return out.slice(-n)
}

function mclStatusRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const recent = mclAuditRecent(knowledgeRoot())
    const mclApi = d.mcl.current
    if (!mclApi) return sendJson(res, 200, { active: false, reason: 'mcl-not-ready', recent })
    // 实测补记：`topK` 此前未暴露（自测误判为"未生效"）——补上，便于可观测核对（真源=注册表 surface.mcl.topK → scheduler 持久层）
    const persisted = d.suite.read()
    const topK = Number(persisted.mclTopK ?? SURFACE.mcl.topK)
    sendJson(res, 200, { active: true, topK, ...mclApi.status(), recent })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function reconcileRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const script = join(memoryLibRoot(), 'scripts', 'memory-reconcile.mjs')
    if (!existsSync(script)) return sendJson(res, 200, { active: false, error: 'memory-reconcile.mjs 未部署（跑 npm run build 后同步 skill/scripts）' })
    const tmp = join(knowledgeRoot(), 'audit', '.reconcile-tmp.json')
    const r = await runProcAsync('node', [script, '--json', '--out', tmp], { timeoutMs: 30000 }) // D-I4：原 execFileSync 同步阻塞宿主 30s
    if (!r.ok) return sendJson(res, 200, { active: false, error: (r.timedOut ? 'reconcile 超时（30s）' : 'reconcile 失败') + (r.err ? '：' + r.err.trim().slice(0, 200) : '') })
    const out = JSON.parse(readFileSync(tmp, 'utf8'))
    sendJson(res, 200, { active: true, ...out })
  } catch (e) { sendJson(res, 200, { active: false, error: String(e).slice(0, 200) }) }
}

/* v9 总览对齐（2026-09-13）：成熟度扫描 —— 与 /reconcile **同构**的运维脚本端点。
 * 成熟度扫描在插件运行时无对应能力（实现是库内 scripts/maturation-scan.mjs），而 v9 原型总览页
 * 「快捷操作」卡有该按钮 ⇒ 端点化（沿用 reconcile 的「跑脚本 + 读 --out JSON」模式，30s 超时、失败降级为
 * 200 + active:false，不让前端拿到 500）。扫描本身**只写台账**（audit/maturation.jsonl），不改记忆内容。 */
async function maturationScanRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const script = join(memoryLibRoot(), 'scripts', 'maturation-scan.mjs')
    if (!existsSync(script)) return sendJson(res, 200, { active: false, error: 'maturation-scan.mjs 未部署（库内 scripts/ 缺失）' })
    const tmp = join(knowledgeRoot(), 'audit', '.maturation-tmp.json')
    const r = await runProcAsync('node', [script, '--json', '--out', tmp], { timeoutMs: 30000 }) // D-I4：原 execFileSync 同步阻塞宿主 30s
    if (!r.ok) return sendJson(res, 200, { active: false, error: (r.timedOut ? 'maturation 超时（30s）' : 'maturation 失败') + (r.err ? '：' + r.err.trim().slice(0, 200) : '') })
    const out = JSON.parse(readFileSync(tmp, 'utf8')) as Record<string, unknown>
    sendJson(res, 200, { active: true, ...out })
  } catch (e) { sendJson(res, 200, { active: false, error: String(e).slice(0, 200) }) }
}

function selfcheckRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const f = join(knowledgeRoot(), 'audit', 'selfcheck-latest.json')
    if (!existsSync(f)) return sendJson(res, 200, { active: false, error: '尚未跑过自检（POST /selfcheck/run 立即跑一次）' })
    sendJson(res, 200, { active: true, ...(JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>) })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function selfcheckRunRoute(d: ObserveDeps, lock: SelfcheckLock, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  try { sendJson(res, 200, await runSelfCheckNow(d, lock)) } catch (e) { sendJson(res, 500, { error: String(e).slice(0, 200) }) }
}

function configRecentRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const recent: Array<{ at: number; msg: string }> = []
    try {
      const lines = readFileSync(join(memoryLibRoot(), '.git', 'logs', 'HEAD'), 'utf8').trim().split(/\r?\n/).filter(Boolean)
      for (const l of lines.slice(-5).reverse()) {
        const m = l.match(/>\s(\d+)\s[+-]\d{4}\t(.*)$/)
        if (m) recent.push({ at: Number(m[1]) * 1000, msg: m[2] })
      }
    } catch { /* 无库 git */ }
    let configMtime = 0
    try { configMtime = statSync(join(dshHome(), 'suite', 'scheduler.json')).mtimeMs } catch { /* 无配置文件 */ }
    sendJson(res, 200, { configMtime, recent })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

/**
 * 内容类型契约（S0 · 2026-09-14）：信息类型 ↔ 生产/载体/消费 的映射与**可达性**。
 * 只读、零 LLM、零 IO（契约经 gen-criteria 投影进 criteria.generated）。
 *
 * 为什么开这个端点：「某类信息能否被消费」此前**只能靠人读代码推断** —— 105 条环记录结构性
 *   不可达长期无人发现即因此。此处把类型分布、不可达清单、**通路未接线清单（假绿检测）**一次暴露。
 */
function contentTypesRoute(_d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const api = createContentTypesApi()
    const all = api.all()
    const byLayer: Record<string, string[]> = {}
    for (const { id, type } of all) {
      const l = type.consumer.layer
      if (!byLayer[l]) byLayer[l] = []
      byLayer[l].push(id)
    }
    const byBudget = all.reduce<Record<string, number>>((m, x) => { m[x.type.budget] = (m[x.type.budget] || 0) + 1; return m }, {})
    sendJson(res, 200, {
      total: all.length,
      byLayer,
      byBudget,
      unreachable: api.unreachable(),
      unwired: api.unwired(),
      channels: CONSUMER_CHANNELS.map((c) => ({ criterion: c.criterion, wired: c.wired, impl: c.impl })),
      // S1-2（2026-09-14）：数据面**三处根的主从**（活体 vs 非活体）—— 此前只在 `targets.ts` 头注里，
      //   非读码者无从判断"哪份是活体"（实测因此出现过把仓内私有副本误当主库的分析）。
      roots: [
        { role: 'memoryLib', authority: '活体', path: memoryLibRoot(), note: '唯一记忆库（数据 + 脚本 + 审计同根）' },
        { role: 'knowledge', authority: '活体（非记忆库）', path: knowledgeRoot(), note: '运行状态区：审计 / 水位 / pending 输入队列' },
      ],
    })
  } catch (e) {
    sendJson(res, 500, { error: String((e as Error)?.message || e) })
  }
}

function criteriaRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    let reg: any = null
    try { reg = JSON.parse(readFileSync(join(memoryLibRoot(), 'engine', 'criteria-gate.json'), 'utf8')) } catch { /* 投影未部署 */ }
    let ledgerRows = 0
    let lastAt = 0
    try {
      // v2.1 M2：统一台账 audit/ledger.jsonl 优先（decision.* + write.*），旧 judgement-ledger.jsonl 兼容
      const unified = join(knowledgeRoot(), 'audit', 'ledger.jsonl')
      const legacy = join(knowledgeRoot(), 'audit', 'judgement-ledger.jsonl')
      /* D-M5：台账可能已**按体积轮转**（`ledger.jsonl` + `.1/.2/.3`）⇒ 行数与末行都必须**跨档**取。
       *   不改的后果是具体的：轮转一发生，下面 `rows` 会**静默变小**（前端"台账 N 行"骤降，
       *   看着像数据丢了），而 `lastAt` 也可能取到空。 */
      /* ⚠ 不能以 `existsSync(unified)` 作守卫：轮转期间主档可能是"刚被重建的空档"或"尚未重建"，
       *   而历史在 `.1/.2/.3` 里 ⇒ 必须以**跨档读的结果**判空，否则会错误回退到 legacy（读成另一份数据）。 */
      const unifiedLines = readLedgerVolumes(unified)
      const lines = unifiedLines.length
        ? unifiedLines
        : (existsSync(legacy) ? readFileSync(legacy, 'utf8').split(/\r?\n/).filter(Boolean) : [])
      ledgerRows = lines.length
      const last = lines[lines.length - 1]
      if (last) lastAt = Date.parse((JSON.parse(last) as { at?: string }).at || '') || 0
    } catch { /* 无台账 */ }
    sendJson(res, 200, {
      active: !!reg,
      version: reg?.version || null,
      caps: reg?.caps || null,
      health: { R: reg?.R ?? null, K: reg?.K ?? null, notesWarn: reg?.notesWarn ?? null },
      surface: reg?.surface || null,
      rerankGate: (() => {
        let indexRows = 0
        try { indexRows = readFileSync(join(memoryLibRoot(), 'MEMORY.md'), 'utf8').split(/\r?\n/).filter((l) => /^\[/.test(l.trim())).length } catch { /* 缺库 */ }
        const threshold = Number(reg?.surface?.rerank?.gate?.indexRows || 200)
        return { indexRows, threshold, ready: indexRows >= threshold }
      })(),
      ledger: { rows: ledgerRows, lastAt },
      bankGit: (() => {
        // v2（ADR-122）：库 git 版本化状态（只读 .git，不 spawn git；无仓库=commits 0）
        try {
          const reflog = readFileSync(join(memoryLibRoot(), '.git', 'logs', 'HEAD'), 'utf8').trim().split(/\r?\n/).filter(Boolean)
          const last = reflog[reflog.length - 1] || ''
          const m = last.match(/>\s(\d+)\s/)
          return { commits: reflog.length, lastAt: m ? Number(m[1]) * 1000 : 0 }
        } catch { return { commits: 0, lastAt: 0 } }
      })(),
      docs: 'skill/engine/criteria.md（生成的人读判据表） · skill/engine/criteria.json（唯一事实源）',
    })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

/**
 * S3-2（2026-09-14）**深睡空转摘要**（模块级 —— 路由函数受行数约束，且此聚合可独立验证）。
 *
 * 为什么需要它：`deep-sleep` 的审计字段**早已齐全**（`landed`/`attempted`/`result`/`gate`/`failStreak`…），
 *   但**缺聚合视图** ⇒ 「最近这些轮里到底有几轮真在干活」无人能一眼回答。实测（双源 42 轮）：
 *   `landed:true` 仅 **3** 轮 · 空转（`no-traces`+`no-op`）**21** 轮 · 异常（error/aborted）**5** 轮 ·
 *   另有 **21** 轮为**旧格式字段缺失**（09-08~09-12 的记录尚无这些字段）。
 *
 * 口径要点：**旧格式（stop 与 gate 都缺）单列 `legacy`，不混入分母** ——
 *   否则会把"当年没记"误算成"空转"或"有产出"，重演仓内"未跑与通过不可区分"的老问题。
 */
export function sleepSummaryOf(sleeps: Array<Record<string, unknown>>): {
  total: number; landed: number; noop: number; error: number; legacy: number
  landedRate: number | null; noopRate: number | null
  byResult: Record<string, number>; byGate: Record<string, number>
} {
  const byResult: Record<string, number> = {}
  const byGate: Record<string, number> = {}
  let landed = 0, noop = 0, error = 0, legacy = 0
  for (const s of sleeps) {
    const resKey = s.result ? String(s.result) : '(无 result 字段)'
    byResult[resKey] = (byResult[resKey] || 0) + 1
    const gateKey = s.gate ? String(s.gate) : '(无 gate 字段)'
    byGate[gateKey] = (byGate[gateKey] || 0) + 1
    // legacy 判据 = **stop / gate / result 三字段全无**（09-08~09-12 的旧格式记录）。
    //   ⚠ **不能只判"stop/gate 都缺"**：`no-traces`/`no-parent` 的记录**有 `result` 但无 `stop`**
    //   （提前返回、未进主流程）—— 若把它们算作 legacy，就等于**把真实的空转从分母里剔除**
    //   （实测 16 条 no-traces 属此情形）。这条由 `test-sleep-summary` 的 ⑧ 画像用例钉住。
    if (s.stop == null && s.gate == null && s.result == null) { legacy++; continue }
    const stop = String(s.stop || '')
    if (s.landed === true) landed++
    else if (s.result === 'error' || stop === 'error' || stop === 'aborted') error++
    else noop++
  }
  const denom = sleeps.length - legacy
  const pct = (n: number): number | null => (denom > 0 ? Math.round((n / denom) * 1000) / 10 : null)
  return { total: sleeps.length, landed, noop, error, legacy, landedRate: pct(landed), noopRate: pct(noop), byResult, byGate }
}

function cognitionReportRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const root = memoryLibRoot()
    const auditDir = join(root, 'audit')
    const d0 = new Date()
    const p2 = (n: number): string => String(n).padStart(2, '0')
    const dk = `${d0.getFullYear()}-${p2(d0.getMonth() + 1)}-${p2(d0.getDate())}`
    const sleeps: Array<Record<string, unknown>> = []
    try {
      const f = join(knowledgeRoot(), 'audit', 'distill-audit.jsonl')
      {
        // DS4 第六刀（2026-09-13）：双源读（legacy ∪ 台账 audit.*）
        for (const l of readDistillAuditText(f).split('\n')) {
          if (!l.trim() || !l.includes('deep-sleep')) continue
          try {
            const o = JSON.parse(l) as Record<string, unknown>
            if (o.kind !== 'deep-sleep') continue
            sleeps.push({
              at: o.at || o.ts || o.time || null, stop: o.stop || null, gate: o.gate || null,
              // S3-2（2026-09-14）**空转可见化**：补 `landed`/`attempted`/`result`/`otherTried`/`otherDone`/`failStreak`
              //   —— 此前报告投影把这些丢了 ⇒「空转」与「有产出」在面板上**不可区分**
              //   （实测 42 轮里 `landed:true` 仅 3 轮，而报告看不出来）。`landed` 判据见 `deepsleep-run#deepSleepLanded`。
              landed: o.landed === true, attempted: Number(o.attempted || 0),
              result: o.result ? String(o.result) : (o.error ? 'error' : null),
              otherTried: Number(o.otherTried || 0), otherDone: Number(o.otherDone || 0),
              failStreak: Number(o.failStreak || 0),
              added: Number(o.added || 0), replaced: Number(o.replaced || 0), skipped: Number(o.skipped || 0),
              profiles: Number(o.profiles || 0), pointers: Number(o.pointers || 0), tree: Number(o.tree || 0),
              forgetArchived: Number(o.forgetArchived || 0), forgetKept: Number(o.forgetKept || 0),
              // #2（2026-09-13）：**门禁失败留明细** —— 原始审计早已落 `rejectedLines`（形如 `[gate:原因] 行原文`），
              //   但报告投影把它丢了 ⇒ 失败只剩一个字符串、不可诊断。此处透出（上限 5 条，与审计同源）。
              gateExit: Number(o.gateExit ?? -1),
              rejected: Number(o.rejected || 0),
              gateDetail: Array.isArray(o.rejectedLines) ? (o.rejectedLines as string[]).slice(0, 5) : [],
            })
          } catch { /* 坏行跳过 */ }
        }
      }
    } catch { /* 无审计文件 = 空态 */ }
    const numFrom = (p: string): number => { try { const m = readFileSync(p, 'utf8').match(/共 (\d+) 条/); return m ? Number(m[1]) : 0 } catch { return 0 } }
    const rowsIn = (p: string): number => { try { return Math.max(0, readFileSync(p, 'utf8').split('\n').filter((x) => x.startsWith('|')).length - 2) } catch { return 0 } }
    const act: Array<Record<string, unknown>> = []
    try {
      for (const l of readFileSync(join(auditDir, 'activity.jsonl'), 'utf8').split('\n')) {
        if (!l.trim()) continue
        try { act.push(JSON.parse(l) as Record<string, unknown>) } catch { /* 坏行跳过 */ }
      }
    } catch { /* 空态 */ }
    const byStatus: Record<string, number> = { active: 0, warm: 0, cold: 0, retired: 0 }
    for (const r of act) {
      const k = r.retired ? 'retired' : String(r.status || 'cold')
      if (byStatus[k] !== undefined) byStatus[k]++
    }
    let idxRows = 0
    for (const n of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
      try { idxRows += readFileSync(join(root, n), 'utf8').split('\n').filter((l) => /^\s*\[/.test(l)).length } catch { /* 缺件跳过 */ }
    }
    /* 分裂律读取单元 R（`ingest.granularity.split-law`）——
     *   原为裸字面量 `1000`（2026-09-20 round 9 接线：改注册表即改本面板的超限节判据）。 */
    const { R } = splitLawOf()
    const overR: Array<{ lvl: number; name: string; chars: number }> = []
    try {
      const own = (b: string): number => b.split('\n').slice(1).join('\n').replace(/\s/g, '').length
      for (const nf of readdirSync(join(root, 'notes'))) {
        if (!/\.md$/i.test(nf) || /^INDEX/i.test(nf)) continue
        const raw = readFileSync(join(root, 'notes', nf), 'utf8')
        const short = nf.replace(/\.md$/, '')
        const title = (b: string): string => b.split('\n')[0].replace(/^#+\s*/, '').replace(/（[^）]*）\s*$/, '').trim()
        for (const b of raw.split(/^(?=## )/m).filter((x) => /^## /.test(x))) {
          const s = own(b)
          if (s > R) overR.push({ lvl: 2, name: `${short} §${title(b)}`, chars: s })
        }
        for (const b of raw.split(/^(?=#{2,3} )/m).filter((x) => /^### /.test(x))) {
          const s = own(b)
          if (s > R) overR.push({ lvl: 3, name: `${short} §${title(b)}`, chars: s })
        }
      }
    } catch { /* 空态 */ }
    let archive: Array<{ file: string; chars: number }> = []
    try {
      const ad = join(root, 'notes', 'archive')
      if (existsSync(ad)) {
        archive = readdirSync(ad).filter((f) => /\.md$/i.test(f)).map((f) => ({ file: f, chars: readFileSync(join(ad, f), 'utf8').replace(/\s/g, '').length }))
      }
    } catch { /* 空态 */ }
    sendJson(res, 200, {
      ok: true, day: dk,
      sleeps: sleeps.slice(-20),
      // S3-2（2026-09-14）：**空转摘要**（全量口径聚合；`sleeps` 本身只回最近 20 轮以免报告过长）
      sleepSummary: sleepSummaryOf(sleeps),
      materials: {
        forget: numFrom(join(auditDir, `activity-candidates-${dk}.md`)),
        hot: numFrom(join(auditDir, `activity-hot-${dk}.md`)),
        interference: rowsIn(join(auditDir, `activity-interference-${dk}.md`)),
      },
      activity: { byStatus, tracked: act.length, idxRows, coverage: idxRows ? Math.round(act.length / idxRows * 100) : 0 },
      overR: overR.sort((a, b) => b.chars - a.chars),
      archive,
    })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function llmModelsRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const api = d.scheduler.current
    if (!api || typeof api.llmModels !== 'function') return sendJson(res, 200, { models: [], note: '调度器未就绪（llmModels 不在装配面）' })
    const models = await api.llmModels()
    sendJson(res, 200, { models })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

function deepsleepRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const sleep = d.deepSleep.current
    if (!sleep) return sendJson(res, 200, { active: false, reason: 'distill-not-ready' })
    sendJson(res, 200, { active: true, ...sleep.getDeepSleepStatus() })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function deepsleepTriggerRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if ((TRIGGER as { manual?: boolean }).manual === false) return sendJson(res, 403, { ok: false, error: 'manual-trigger-disabled-by-registry' }) // B 档：读注册表 criteria.trigger.manual
    const sleep = d.deepSleep.current
    if (!sleep) return sendJson(res, 400, { ok: false, error: 'distill-not-ready' })
    const r = await sleep.runDeepSleepNow()
    sendJson(res, r.ok ? 200 : 409, r)
  } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
}

async function distillRunRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const sleep = d.deepSleep.current
    if (!sleep || typeof sleep.runDistillNow !== 'function') return sendJson(res, 400, { ok: false, error: 'distill-not-ready' })
    const r = await sleep.runDistillNow()
    sendJson(res, r.ok ? 200 : 409, r)
  } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
}

async function deepsleepConfigRoute(d: ObserveDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === 'POST') {
      const body = (await readBody(req).catch(() => ({}))) as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      for (const k of ['enableDeepSleep', 'deepSleepProbe', 'deepSleepIdleMs', 'deepSleepProbeAfterMs', 'deepSleepProbeWindowMs']) {
        if (k in body) patch[k] = body[k]
      }
      if (!Object.keys(patch).length) return sendJson(res, 400, { error: 'no-deep-sleep-keys' })
      const err = validateDeepSleepConfig(patch)
      if (err) return sendJson(res, 400, { error: err })
      const merged = { ...d.suite.read(), ...patch }
      d.suite.write(merged)
      d.logger.info?.(`[shoucang] deep-sleep config updated: ${Object.keys(patch).join(',')}`)
      return sendJson(res, 200, { ok: true, merged })
    }
    const sleep = d.deepSleep.current
    if (sleep) return sendJson(res, 200, { active: true, running: sleep.getConfig(), persisted: d.suite.read() })
    // 未就绪：退化为读取自持配置文件（至少给出现有持久值）
    sendJson(res, 200, { active: false, running: null, persisted: d.suite.read() })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function distillConfigRoute(d: ObserveDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === 'POST') {
      const body = (await readBody(req).catch(() => ({}))) as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      for (const k of DISTILL_CONFIG_KEYS) if (k in body) patch[k] = body[k]
      if (!Object.keys(patch).length) return sendJson(res, 400, { error: 'no-distill-keys' })
      const err = validateDistillConfig(patch)
      if (err) return sendJson(res, 400, { error: err })
      const merged = { ...d.suite.read(), ...patch }
      d.suite.write(merged)
      d.logger.info?.(`[shoucang] distill config updated: ${Object.keys(patch).join(',')}（重载后生效）`)
      return sendJson(res, 200, { ok: true, merged, reloadRequired: true })
    }
    const api = d.scheduler.current
    const running = api ? api.distillConfig() : null
    sendJson(res, 200, { active: !!api, running, persisted: d.suite.read() })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

export function registerObserveRoutes(d: ObserveDeps): void {
  d.route('/suite', (req, res) => suiteRoute(d, req, res))
  d.route('/rings', (req, res) => ringsRoute(d, req, res))
  d.route('/mcl/status', (req, res) => mclStatusRoute(d, req, res))
  d.route('/reconcile', async (req, res) => reconcileRoute(d, req, res))
  d.route('/maturation/scan', async (req, res) => maturationScanRoute(d, req, res))
  d.route('/selfcheck', (req, res) => selfcheckRoute(d, req, res))
  /* 互斥锁**按实例**持有（闭包内局部 const），不落模块级可变全局 —— 见 `runSelfCheckNow` 上方说明 */
  const selfcheckLock: SelfcheckLock = { running: false }
  d.route('/selfcheck/run', async (req, res) => selfcheckRunRoute(d, selfcheckLock, req, res))
  d.route('/config/recent', (req, res) => configRecentRoute(d, req, res))
  d.route('/criteria', (req, res) => criteriaRoute(d, req, res))
  d.route('/content-types', (req, res) => contentTypesRoute(d, req, res))
  d.route('/cognition/report', (req, res) => cognitionReportRoute(d, req, res))
  // S2S3 册四（2026-09-19）：**睡眠汇报 + 问题统计的只读面**（用户口径「汇报要 UI 可见 + 问题统计」）。
  //   两条都纯读：前者列最近若干份汇报（日历式留存，同日多轮 = 同一份文件里的多段）；
  //   后者读问题队列分布（**只标记不处置** ⇒ 没有写口，故只读）。
  d.route('/sleep/reports', (req, res) => sleepReportsRoute(d, req, res))
  d.route('/sleep/issues', (req, res) => sleepIssuesRoute(d, req, res))
  d.route('/llm/models', async (req, res) => llmModelsRoute(d, req, res))
  d.route('/deepsleep', (req, res) => deepsleepRoute(d, req, res))
  d.route('/deepsleep/trigger', async (req, res) => deepsleepTriggerRoute(d, req, res))
  d.route('/distill/run', async (req, res) => distillRunRoute(d, req, res))
  d.route('/deepsleep/config', async (req, res) => deepsleepConfigRoute(d, req, res), contractFor('/deepsleep/config'))
  d.route('/distill/config', async (req, res) => distillConfigRoute(d, req, res), contractFor('/distill/config'))
}

/** **睡眠汇报列表**（只读 · S2S3 册四）：`<bank>/reports/sleep/*.md` 的日历式留存面。
 *  同日多轮 = 同一份文件里的多段（`## ` 计段数）⇒ 这里给「份数 + 每份段数 + 最近一份摘要」。 */
function sleepReportsRoute(_d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const dir = join(memoryLibRoot(), 'reports', 'sleep')
    const rows: Array<{ date: string; sections: number; bytes: number; mtimeMs: number }> = []
    for (const f of existsSync(dir) ? readdirSync(dir) : []) {
      if (!f.endsWith('.md')) continue
      try {
        const st = statSync(join(dir, f))
        const text = readFileSync(join(dir, f), 'utf8')
        rows.push({ date: f.replace(/\.md$/, ''), sections: (text.match(/^## /gm) || []).length, bytes: st.size, mtimeMs: st.mtimeMs })
      } catch { /* 单份坏文件跳过 */ }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date))
    const latest = rows[0] ? readFileSync(join(dir, `${rows[0].date}.md`), 'utf8') : ''
    const tailIdx = latest.lastIndexOf('\n## ')
    sendJson(res, 200, { present: rows.length > 0, count: rows.length, days: rows.slice(0, 60), latest: rows[0] ? { date: rows[0].date, text: (tailIdx > 0 ? latest.slice(tailIdx + 1) : latest).slice(0, 4000) } : null })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

/** **睡眠问题统计**（只读 · 结清册三 D 档的读侧）：`<kRoot>/audit/sleep-issues.jsonl` 的分布。
 *  口径与 `sleep-report.ts` 同源（`suspect-recall`=召回面 / `suspect-quality`=记忆面）；**分母附绝对值**。 */
function sleepIssuesRoute(_d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const file = join(knowledgeRoot(), 'audit', 'sleep-issues.jsonl')
    const rows = readTailLines(file, 2000).map((l) => { try { return JSON.parse(l) as Record<string, unknown> } catch { return null } }).filter((x): x is Record<string, unknown> => !!x)
    const byTag: Record<string, number> = {}
    for (const r of rows) { const t = String(r.tag || 'unknown'); byTag[t] = (byTag[t] || 0) + 1 }
    const roundFile = join(knowledgeRoot(), 'audit', 'sleep-reports.jsonl')
    const rounds = readTailLines(roundFile, 2000).map((l) => { try { return JSON.parse(l) as Record<string, unknown> } catch { return null } }).filter((x): x is Record<string, unknown> => !!x).filter((r) => r.kind === 'sleep-round')
    const last = rounds.length ? rounds[rounds.length - 1] : null
    const st = (last?.stats || {}) as Record<string, unknown>
    sendJson(res, 200, {
      present: rows.length > 0,
      issues: rows.length,
      byTag,
      /* 两个分母**各自带口径**（G13）：本窗影响账条数 与 当日产出条数（后者来自末轮 `added`+`replaced`）。 */
      denominator: { impactRows: rounds.length ? Number(st.rows || 0) : 0, producedToday: Number(st.producedToday || 0) },
      recent: rows.slice(-10),
      lastRound: last,
    })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}
