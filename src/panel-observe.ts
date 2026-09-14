/**
 * @dsh-external/shoucang-panel / observe — 观测/判据/深睡-蒸馏配置领域。
 * 端点：GET /suite · /mcl/status · /reconcile · /selfcheck · /selfcheck/run · /config/recent ·
 *      /criteria · /cognition/report · /llm/models ·
 *      GET /deepsleep · POST /deepsleep/trigger · GET+POST /deepsleep/config ·
 *      POST /distill/run · GET+POST /distill/config
 * 依赖窄传：3 个（route / suite / logger）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SURFACE, TRIGGER } from './criteria.generated.js'
import { dshHome, knowledgeRoot, memoryLibRoot } from './targets.js'
import type { DeepSleepApi, MclHandle, SchedulerApi } from './composition.js'
import { contractFor } from './panel-contract.js'
import { readBody, sendJson } from './panel-shared.js'
import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js'
import { RECORD_DIR, loadStore } from './record-shadow.js'
import { readDistillAuditText } from './audit-source.js'
import { associationCensus } from './association-ring.js'
import { scorecardOf } from './decision-ring.js'
import { factCensus } from './fact-ring.js'
import { relationCensus, trustOf } from './relation-ring.js'
import { ringCensus } from './rings.js'
import { RING_EVENT_FILE, parseEvents, reconcileRing } from './ring-events.js'
import { CONSUMER_CHANNELS, createContentTypesApi } from './content-types.js'

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
const runSelfCheckNow = (d: ObserveDeps): Record<string, unknown> => {
  const script = join(memoryLibRoot(), 'scripts', 'sleep-selfcheck.mjs')
  if (!existsSync(script)) return { active: false, error: 'sleep-selfcheck.mjs 未部署' }
  const out = join(knowledgeRoot(), 'audit', 'selfcheck-latest.json')
  const args = ['--out', out, '--trigger', 'manual']
  const repo = String(d.suite.read().selfCheckRepo || '')
  if (repo) args.push('--repo', repo)
  execFileSync('node', [script, ...args], { stdio: 'ignore', timeout: 180000, windowsHide: true })
  return { active: true, ...(JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>) }
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
      for (const l of readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)) {
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

function reconcileRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const script = join(memoryLibRoot(), 'scripts', 'memory-reconcile.mjs')
    if (!existsSync(script)) return sendJson(res, 200, { active: false, error: 'memory-reconcile.mjs 未部署（跑 npm run build 后同步 skill/scripts）' })
    const tmp = join(knowledgeRoot(), 'audit', '.reconcile-tmp.json')
    execFileSync('node', [script, '--json', '--out', tmp], { stdio: 'ignore', timeout: 30000, windowsHide: true })
    const out = JSON.parse(readFileSync(tmp, 'utf8'))
    sendJson(res, 200, { active: true, ...out })
  } catch (e) { sendJson(res, 200, { active: false, error: String(e).slice(0, 200) }) }
}

/* v9 总览对齐（2026-09-13）：成熟度扫描 —— 与 /reconcile **同构**的运维脚本端点。
 * 成熟度扫描在插件运行时无对应能力（实现是库内 scripts/maturation-scan.mjs），而 v9 原型总览页
 * 「快捷操作」卡有该按钮 ⇒ 端点化（沿用 reconcile 的「跑脚本 + 读 --out JSON」模式，30s 超时、失败降级为
 * 200 + active:false，不让前端拿到 500）。扫描本身**只写台账**（audit/maturation.jsonl），不改记忆内容。 */
function maturationScanRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const script = join(memoryLibRoot(), 'scripts', 'maturation-scan.mjs')
    if (!existsSync(script)) return sendJson(res, 200, { active: false, error: 'maturation-scan.mjs 未部署（库内 scripts/ 缺失）' })
    const tmp = join(knowledgeRoot(), 'audit', '.maturation-tmp.json')
    execFileSync('node', [script, '--json', '--out', tmp], { stdio: 'ignore', timeout: 30000, windowsHide: true })
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

function selfcheckRunRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try { sendJson(res, 200, runSelfCheckNow(d, )) } catch (e) { sendJson(res, 500, { error: String(e).slice(0, 200) }) }
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
      const lines = readFileSync(existsSync(unified) ? unified : legacy, 'utf8').split(/\r?\n/).filter(Boolean)
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
    const R = 1000
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
  d.route('/reconcile', (req, res) => reconcileRoute(d, req, res))
  d.route('/maturation/scan', (req, res) => maturationScanRoute(d, req, res))
  d.route('/selfcheck', (req, res) => selfcheckRoute(d, req, res))
  d.route('/selfcheck/run', (req, res) => selfcheckRunRoute(d, req, res))
  d.route('/config/recent', (req, res) => configRecentRoute(d, req, res))
  d.route('/criteria', (req, res) => criteriaRoute(d, req, res))
  d.route('/content-types', (req, res) => contentTypesRoute(d, req, res))
  d.route('/cognition/report', (req, res) => cognitionReportRoute(d, req, res))
  d.route('/llm/models', async (req, res) => llmModelsRoute(d, req, res))
  d.route('/deepsleep', (req, res) => deepsleepRoute(d, req, res))
  d.route('/deepsleep/trigger', async (req, res) => deepsleepTriggerRoute(d, req, res))
  d.route('/distill/run', async (req, res) => distillRunRoute(d, req, res))
  d.route('/deepsleep/config', async (req, res) => deepsleepConfigRoute(d, req, res), contractFor('/deepsleep/config'))
  d.route('/distill/config', async (req, res) => distillConfigRoute(d, req, res), contractFor('/distill/config'))
}
