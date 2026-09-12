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
import { deepSleepShare } from './deepsleep-share.js'
import { schedulerShare } from './scheduler-share.js'
import { mclShare } from './mcl-share.js'
import { readBody, sendJson } from './panel-shared.js'
import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js'

export interface ObserveDeps {
  route: RouteFn
  suite: SuiteConfigAccess
  logger: PanelLogger
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

function suiteRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const api = schedulerShare.api
    if (!api) return sendJson(res, 200, { members: [], summary: '调度器未就绪（suite 矩阵经 scheduler-share 桥接；空成员=如实空态）' })
    sendJson(res, 200, api.suiteScan())
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

function mclStatusRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const recent: unknown[] = []
    try {
      const f = join(knowledgeRoot(), 'audit', 'mcl-audit.jsonl')
      if (existsSync(f)) {
        const lines = readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)
        for (const l of lines.slice(-10)) { try { recent.push(JSON.parse(l)) } catch { /* 坏行跳过 */ } }
      }
    } catch { /* 审计不可读=空 */ }
    if (!mclShare.api) return sendJson(res, 200, { active: false, reason: 'mcl-not-ready', recent })
    // 实测补记：`topK` 此前未暴露（自测误判为"未生效"）——补上，便于可观测核对（真源=注册表 surface.mcl.topK → scheduler 持久层）
    const persisted = d.suite.read()
    const topK = Number(persisted.mclTopK ?? SURFACE.mcl.topK)
    sendJson(res, 200, { active: true, topK, ...mclShare.api.status(), recent })
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
      if (existsSync(f)) {
        for (const l of readFileSync(f, 'utf8').split('\n')) {
          if (!l.trim() || !l.includes('deep-sleep')) continue
          try {
            const o = JSON.parse(l) as Record<string, unknown>
            if (o.kind !== 'deep-sleep') continue
            sleeps.push({
              at: o.at || o.ts || o.time || null, stop: o.stop || null, gate: o.gate || null,
              added: Number(o.added || 0), replaced: Number(o.replaced || 0), skipped: Number(o.skipped || 0),
              profiles: Number(o.profiles || 0), pointers: Number(o.pointers || 0), tree: Number(o.tree || 0),
              forgetArchived: Number(o.forgetArchived || 0), forgetKept: Number(o.forgetKept || 0),
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
    const api = schedulerShare.api
    if (!api || typeof api.llmModels !== 'function') return sendJson(res, 200, { models: [], note: '调度器未就绪（llmModels 桥不可用）' })
    const models = await api.llmModels()
    sendJson(res, 200, { models })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

function deepsleepRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    if (!deepSleepShare.api) return sendJson(res, 200, { active: false, reason: 'distill-not-ready' })
    sendJson(res, 200, { active: true, ...deepSleepShare.api.getDeepSleepStatus() })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function deepsleepTriggerRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if ((TRIGGER as { manual?: boolean }).manual === false) return sendJson(res, 403, { ok: false, error: 'manual-trigger-disabled-by-registry' }) // B 档：读注册表 criteria.trigger.manual
    if (!deepSleepShare.api) return sendJson(res, 400, { ok: false, error: 'distill-not-ready' })
    const r = await deepSleepShare.api.runDeepSleepNow()
    sendJson(res, r.ok ? 200 : 409, r)
  } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
}

async function distillRunRoute(d: ObserveDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (!deepSleepShare.api || typeof deepSleepShare.api.runDistillNow !== 'function') return sendJson(res, 400, { ok: false, error: 'distill-not-ready' })
    const r = await deepSleepShare.api.runDistillNow()
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
    if (deepSleepShare.api) return sendJson(res, 200, { active: true, running: deepSleepShare.api.getConfig(), persisted: d.suite.read() })
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
    const running = schedulerShare.api ? schedulerShare.api.distillConfig() : null
    sendJson(res, 200, { active: !!schedulerShare.api, running, persisted: d.suite.read() })
  } catch (e) { sendJson(res, 500, { error: String(e) }) }
}

export function registerObserveRoutes(d: ObserveDeps): void {
  d.route('/suite', (req, res) => suiteRoute(d, req, res))
  d.route('/mcl/status', (req, res) => mclStatusRoute(d, req, res))
  d.route('/reconcile', (req, res) => reconcileRoute(d, req, res))
  d.route('/selfcheck', (req, res) => selfcheckRoute(d, req, res))
  d.route('/selfcheck/run', (req, res) => selfcheckRunRoute(d, req, res))
  d.route('/config/recent', (req, res) => configRecentRoute(d, req, res))
  d.route('/criteria', (req, res) => criteriaRoute(d, req, res))
  d.route('/cognition/report', (req, res) => cognitionReportRoute(d, req, res))
  d.route('/llm/models', async (req, res) => llmModelsRoute(d, req, res))
  d.route('/deepsleep', (req, res) => deepsleepRoute(d, req, res))
  d.route('/deepsleep/trigger', async (req, res) => deepsleepTriggerRoute(d, req, res))
  d.route('/distill/run', async (req, res) => distillRunRoute(d, req, res))
  d.route('/deepsleep/config', async (req, res) => deepsleepConfigRoute(d, req, res))
  d.route('/distill/config', async (req, res) => distillConfigRoute(d, req, res))
}
