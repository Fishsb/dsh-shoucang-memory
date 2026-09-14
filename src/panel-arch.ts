/**
 * panel-arch.ts — **架构观测与调节面**（2026-09-13 架构重构后新增）
 *
 * ## 为什么新增这个模块
 * G0–G4 重构后，新架构的**事实面**（记录层 Record / 内容环 / 统一台账 / 装配根 / 断言图）
 * 在界面里**完全不可见**（实测：`record`/`assertion`/`observability`/`composition`/`pin` 在客户端出现 **0 次**），
 * MCL 的**旋钮**也没有写入口（只有 deepsleep/distill/embed 三家有）。本模块把两面开出来：
 *   · **可观测**（只读）：`/arch/records` · `/arch/graph` · `/arch/observability` · `/arch/assembly`
 *   · **可调节**（受控白名单补丁）：`/mcl/config`（GET 读运行态 + POST 改持久配置）
 *
 * ## 纪律
 * · 实现全部在**模块级**（依赖首参 `d`），入口只做注册；依赖 4 项窄传；
 * · **零 LLM、零重活**：都是读文件/算计数；向量近邻不在此处（那是工具面的事）；
 * · 只读端点**不做写**；唯一写端点 `/mcl/config` 走**白名单补丁**（同 deepsleep/distill 的既有语义）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { knowledgeRoot, memoryLibRoot } from './targets.js'
import { RECORD_DIR, carrierFiles, loadStore, parityOf, readShadowStats, shadowInventory } from './record-shadow.js'
import { buildGraph, exactCrossFileDups, graphCensus } from './assertion-graph.js'
import { readBody, sendJson } from './panel-shared.js'
import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js'
import { MCL_CONFIG_KEYS, PANEL_ROUTES, contractFor } from './panel-contract.js'
import { SURFACE, WIRING } from './criteria.generated.js'
import type { DeepSleepApi, MclHandle, SchedulerApi } from './composition.js'

export interface ArchDeps {
  route: RouteFn
  suite: SuiteConfigAccess
  logger: PanelLogger
  mcl: { current: MclHandle | null }
  deepSleep: { current: DeepSleepApi | null }
  scheduler: { current: SchedulerApi | null }
}

/** 本模块所在目录（= 安装/运行中的 `lib/`）——用于"装上去的那份带着哪些模块"的自我盘点 */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))

/** 重构后**新增**的架构模块（存在性 = 特性标记；与 check-installed-features 的 31 项互补，此处给人看） */
const ARCH_MODULES = [
  'composition', 'event-envelope', 'ledger-compact', 'audit-source',
  'record-store', 'record-shadow',
  'rings', 'decision-ring', 'relation-ring', 'association-ring', 'fact-ring', 'ring-events',
  'supply-assembly', 'supply-ledger',
  'assertion-graph', 'association-propose', 'association-supply',
]

/** 已并入 `ledger.jsonl` 的 **legacy 只读**流（面板只展示"还在不在"，不读它们） */
const LEGACY_STREAMS = [
  'judgement-ledger.jsonl', 'score-shadow.jsonl', 'activation-shadow.jsonl',
  'stub.jsonl', 'episodes.jsonl', 'mcl-audit.jsonl', 'distill-audit.jsonl',
]

const auditDir = (): string => join(knowledgeRoot(), 'audit')

/** `ledger.jsonl` 实况：行数 / 按 type 分布 / 缺 `at` 的行数（信封完整性） */
const ledgerFacts = (): { path: string; lines: number; missingAt: number; byType: Array<{ type: string; count: number }> } => {
  const path = join(auditDir(), 'ledger.jsonl')
  const byType = new Map<string, number>()
  let lines = 0
  let missingAt = 0
  try {
    for (const l of readFileSync(path, 'utf8').split('\n')) {
      if (!l.trim()) continue
      lines++
      try {
        const o = JSON.parse(l) as { type?: unknown; at?: unknown }
        const t = String(o.type || '(无 type)')
        byType.set(t, (byType.get(t) || 0) + 1)
        if (!o.at) missingAt++
      } catch { byType.set('(坏行)', (byType.get('(坏行)') || 0) + 1) }
    }
  } catch { /* 台账缺席=空 */ }
  return {
    path, lines, missingAt,
    byType: [...byType.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  }
}

/** `audit/` 目录实况（文件名/字节/改时）——"观测面到底有哪些文件"的直接答案 */
const auditDirFacts = (): Array<{ name: string; bytes: number; mtime: number }> => {
  try {
    return readdirSync(auditDir())
      .filter((f) => f.endsWith('.jsonl') || f.endsWith('.json'))
      .map((f) => {
        try { const s = statSync(join(auditDir(), f)); return { name: f, bytes: s.size, mtime: s.mtimeMs } }
        catch { return { name: f, bytes: 0, mtime: 0 } }
      })
      .sort((a, b) => b.bytes - a.bytes)
  } catch { return [] }
}

/** ① 记录层：store 人口 + md↔store 逐载体对账 + 写时自证 + 跨文件同文 + 寻址口径
 *  ⚠ 根目录：Record 事实源在**记忆库**（`memoryLibRoot()`），不是 suite 知识区
 *    ——实测踩过：错传 `knowledgeRoot()` 会得到「记录 0 · 载体 0/11」这种**看起来很正常的空态**。 */
function archRecordsRoute(_d: ArchDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const root = memoryLibRoot()
    const { records } = loadStore(root)
    const byKind: Record<string, number> = {}
    const byLifecycle: Record<string, number> = {}
    let untagged = 0
    for (const r of records) {
      byKind[r.kind || '(无)'] = (byKind[r.kind || '(无)'] || 0) + 1
      byLifecycle[r.lifecycle || '(无)'] = (byLifecycle[r.lifecycle || '(无)'] || 0) + 1
      if (!r.tag) untagged++
    }
    const inv = shadowInventory(root)
    const carriers = parityOf(root, carrierFiles(root)).map((p) => ({
      file: p.file, mdBytes: p.mdBytes, storeBytes: p.storeBytes, ok: p.ok, reason: p.reason || '',
    }))
    sendJson(res, 200, {
      root,
      store: { dir: RECORD_DIR, records: records.length, byKind, byLifecycle, untagged, inventory: inv },
      carriers,
      carriersOk: carriers.filter((c) => c.ok).length,
      carriersTotal: carriers.length,
      shadow: readShadowStats(root),
      dups: exactCrossFileDups(records, 20),
      address: {
        key: '(file, order)',
        note: 'id 是**内容指纹**、可能重复（实测 976 行里有 145 行同 id）⇒ 行寻址必须用 (file,order)，不可拿 id 当主键',
      },
    })
  } catch (e) { sendJson(res, 500, { error: String(e).slice(0, 300) }) }
}

/** ② 断言图：节点/边/各 rel/悬空证据（纯计数，零向量）——同样读**记忆库**根 */
function archGraphRoute(_d: ArchDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const { records } = loadStore(memoryLibRoot())
    sendJson(res, 200, { ...graphCensus(buildGraph(records)), records: records.length })
  } catch (e) { sendJson(res, 500, { error: String(e).slice(0, 300) }) }
}

/** ③ 观测面：统一台账实况 + audit 目录 + legacy 流是否仍在 + 信封完整性 */
function archObservabilityRoute(_d: ArchDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    const ledger = ledgerFacts()
    sendJson(res, 200, {
      ledger,
      auditDir: auditDir(),
      files: auditDirFacts(),
      legacy: LEGACY_STREAMS.map((name) => ({ name, present: existsSync(join(auditDir(), name)) })),
      envelope: {
        missingAt: ledger.missingAt,
        ok: ledger.missingAt === 0,
        note: '统一信封为**单一实现**（源码中无原始 `JSON.stringify({ at: … })` 写法，由 check-observability 守）',
      },
      registry: {
        authority: 'scripts/check-observability.mjs',
        families: ['事件流（读侧逐条语义，可并入单一事件源）', '键控日志（读侧按 key 取最后一条）', '状态表/投影（整表重写或 upsert）'],
        domains: ['suite（suite 知识区，ledger 在此，可并）', 'bank（记忆库，数据属库——**跨域并入是语义错误**）'],
        baseline: { suiteEventStreams: 1, note: 'DS4 目标：suite 域事件流 → 1（= ledger）· 门禁为权威' },
      },
    })
  } catch (e) { sendJson(res, 500, { error: String(e).slice(0, 300) }) }
}

/** ④ 装配面：composition root 就绪度 + 契约路由数 + 装上去的那份带了哪些新架构模块 */
function archAssemblyRoute(d: ArchDeps, _req: IncomingMessage, res: ServerResponse): void {
  try {
    let version = '(未知)'
    let libFiles = 0
    try { version = String((JSON.parse(readFileSync(join(LIB_DIR, '..', 'package.json'), 'utf8')) as { version?: string }).version || '(未知)') } catch { /* 读不到就给未知 */ }
    try { libFiles = readdirSync(LIB_DIR).filter((f) => f.endsWith('.js')).length } catch { /* 同上 */ }
    sendJson(res, 200, {
      composition: {
        bridges: 0,
        note: '三条惰性桥（scheduler-share / deepsleep-share / mcl-share）已**退役**；跨域句柄经 `src/composition.ts` 显式传递（`check-bridges` 边数 0 为权威）',
        handles: [
          { name: 'mcl', ready: !!d.mcl.current },
          { name: 'deepSleep', ready: !!d.deepSleep.current },
          { name: 'scheduler', ready: !!d.scheduler.current },
        ],
      },
      routes: { declared: PANEL_ROUTES.length, note: '契约声明数；实际注册一致性由 check-panel-contract 守' },
      /* 存储模式（2026-09-14）：P4「存储解耦」开关，属**新增架构的可调节面**——
       *   枚举只放 md|dual：`record`（记录为唯一事实源）**未实现**（M4 未收口/M5 未切），
       *   放进来就是"假可控"。写入走既有 `/set`（白名单 + 枚举校验 + SCHED_KEY 映射）。 */
      store: {
        mode: String((d.suite.read() as { storeMode?: unknown }).storeMode || 'md'),
        allowed: ['md', 'dual'],
        note: 'dual = md↔Record 双写（写时自证：可还原/分歧）；record 未实现，故不提供',
      },
      plugin: {
        version, libDir: LIB_DIR, libFiles,
        /* P0a（2026-09-14）：判定从「文件存在」升为「**在接线**」。
         *   原实现只 `existsSync(lib/x.js)` ⇒ 必然把 `supply-assembly` / `record-address` 报成在位，
         *   而它们当时在 `src/` 内零运行时消费者（功能完整、结构合法、单测全绿、运行时缺席）。
         *   现口径 = 存在 ∧ 未被 `criteria.json#wiring.pending` 申报为待接线 —— 观测面不再说谎。
         *   （静态扇入在运行时不可得，故以注册表申报为准；扇入的权威判定在 audit-architecture --gate。） */
        modules: ARCH_MODULES.map((name) => ({
          name,
          present: existsSync(join(LIB_DIR, `${name}.js`)),
          wired: !WIRING.pending.some((p) => p.name === name),
        })),
        pendingWiring: WIRING.pending.map((p) => ({ name: p.name, until: p.until })),
      },
    })
  } catch (e) { sendJson(res, 500, { error: String(e).slice(0, 300) }) }
}

/** ⑤ 认知环旋钮：白名单补丁（与 deepsleep/distill 同语义；改后需重载生效） */
const validateMclConfig = (c: Record<string, unknown>): string | null => {
  for (const k of ['mclEnabled', 'mclAudit', 'mclMaterialInSystem', 'enableRemPass']) {
    if (k in c && typeof c[k] !== 'boolean') return `${k} 须为布尔`
  }
  const ranges: Record<string, [number, number]> = { mclFamiliarThreshold: [0, 1], mclMaxNudges: [0, 3], mclBudgetChars: [120, 4000], mclTopK: [1, 5] }
  for (const [k, [lo, hi]] of Object.entries(ranges)) {
    if (k in c) { const n = Number(c[k]); if (!Number.isFinite(n) || n < lo || n > hi) return `${k} 须在 ${lo}–${hi}` }
  }
  return null
}

async function mclConfigRoute(d: ArchDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === 'POST') {
      const body = (await readBody(req).catch(() => ({}))) as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      for (const k of MCL_CONFIG_KEYS) if (k in body) patch[k] = body[k]
      if (!Object.keys(patch).length) return sendJson(res, 400, { error: 'no-mcl-keys' })
      const err = validateMclConfig(patch)
      if (err) return sendJson(res, 400, { error: err })
      const merged = { ...d.suite.read(), ...patch }
      d.suite.write(merged)
      d.logger.info?.(`[shoucang] MCL config updated: ${Object.keys(patch).join(',')}（重载后生效）`)
      return sendJson(res, 200, { ok: true, merged: pickMcl(merged), reloadRequired: true })
    }
    const persisted = pickMcl(d.suite.read())
    sendJson(res, 200, {
      active: !!d.mcl.current,
      running: d.mcl.current ? d.mcl.current.status() : null,
      persisted,
      keys: MCL_CONFIG_KEYS,
      limits: {
        mclFamiliarThreshold: [0, 1], mclMaxNudges: [0, 3], mclBudgetChars: [120, 4000], mclTopK: [1, 5],
        defaults: {
          familiarThreshold: SURFACE.mcl?.familiarThreshold,
          maxNudges: SURFACE.mcl?.maxNudges,
          budgetChars: SURFACE.mcl?.budgetChars,
          topK: SURFACE.mcl?.topK,
        },
      },
    })
  } catch (e) { sendJson(res, 500, { error: String(e).slice(0, 300) }) }
}

/** 从整份持久配置里**只挑 MCL 键**（面板不该把无关键灌回前端） */
const pickMcl = (all: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const k of MCL_CONFIG_KEYS) if (k in all) out[k] = all[k]
  return out
}

export function registerArchRoutes (d: ArchDeps): void {
  d.route('/arch/records', (req, res) => archRecordsRoute(d, req, res))
  d.route('/arch/graph', (req, res) => archGraphRoute(d, req, res))
  d.route('/arch/observability', (req, res) => archObservabilityRoute(d, req, res))
  d.route('/arch/assembly', (req, res) => archAssemblyRoute(d, req, res))
  d.route('/mcl/config', async (req, res) => mclConfigRoute(d, req, res), contractFor('/mcl/config'))
}
