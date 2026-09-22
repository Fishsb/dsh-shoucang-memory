/**
 * @dsh-external/shoucang-panel / shared — 面板**领域无关的公共基元**。
 *
 * 由来：applyPanel 原为 1817 行巨型工厂闭包，全部实现寄生在入口函数的闭包里，
 * 依赖按「模块闭包」打包 ⇒ 无法单独测试/替换（架构根治的根因，见
 * deliverables/architecture-ultimate-plan.md）。本模块是切分后的**公共层**：
 *   ① 纯函数（无状态）：YAML 解析/改写、备份写、骨架引导、本机端点探测
 *   ② 有状态基元的**工厂**：状态库 / 路由绑定 / 全局配置 / 注入缓存 / 热记忆
 *
 * 纪律：这里只放**被两个以上领域模块共用**的东西；只被一个领域用到的实现留在那个领域模块里。
 * 依赖一律**窄传**（各工厂的依赖 ≤ 4 个），禁止再攒出第二个 DsScope 式团块。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SURFACE } from './criteria.generated.js'
import { dshHome, knowledgeRoot, memoryLibRoot, profileCarrierSet, indexRowInLayer, scanIndexRows } from './targets.js'
import { selectDynamicLines } from './dynamic-select.js'
import { relevanceNoteOf, type RelevanceTrace } from './relevance-supply.js'
import { libStampOf, stampKeyOf } from './supply-stamp.js'
// S2S3 册四：注入侧「最近成长」派生源与报告正文**同函数**（单一实现，勿在本件复算）
import { latestDerivation } from './sleep-report.js'
import { budgetOf, clampLines, renderSupplyText, supplyMetaOf, takeSlotLines, type SupplyBudget } from './supply-assembly.js'
/* S3（2026-09-21）：槽位额度的**覆盖层**（`scheduler.json` → 注册表）—— 三个消费点共用同一实现 */
import { resolveSupplyBudget } from './budget-override.js'
// T3（2026-09-17 圆桌会议）：面板路由来源栅栏**单一实现**（本件顶格，本体落新件）。
import { judgePanelRequest } from './panel-guard.js'
import { MEMORY_PLAYBOOK_LINES, playbookEnabled } from './injection-playbook.js'
import { cuesOf, taskCueOf, type SituationCtx } from './situation-key.js'
import { situationLinesOf, knownTaskCuesOf } from './situation-supply.js'
import { stableLinesOf, stableStashOf, stableTextOf, type StableStash } from './hot-stable.js'
import { loadStore } from './record-shadow.js'
import { dedupState, filterInjected } from './crossform-dedup.js'
import { runProcAsync } from './proc-async.js'

export interface RootEntry { id: string; name: string; path: string }
export interface PanelState { roots: RootEntry[]; active: string | null }
export interface RouteRegistry {
  register(route: { kind: 'exact' | 'prefix'; path: string; handler(req: IncomingMessage, res: ServerResponse): void }): () => void
}
export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void

/** 请求体校验器（schemastery 语义：**类型错抛错、缺字段不抛** —— 实测确认，故必填另用 required 声明）。
 *  入参用 any 而非 unknown：schemastery 的 Schema<T> 入参是具体 T（如 ObjectS<…>），
 *  在 strictFunctionTypes 下不能逆变赋给 (data: unknown) => unknown。（此处是"调用即校验"的边界，非内部数据流。） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BodySchema = (data: any) => unknown

/**
 * 路由契约（S4 · 2026-09-13）：把「这条路由收什么」从注释变成**可执行约束**。
 *   · body     —— 类型校验（schemastery schema）；类型不符 ⇒ 400，且**不调用 handler**
 *   · required —— 必填字段（缺一即 400）；与 body 分开是因为 schemastery 不校验缺字段
 * 只读 GET 端点可不声明契约（行为与旧版完全一致）。
 */
export interface RouteContract {
  body?: BodySchema
  required?: readonly string[]
}
export type RouteFn = (sub: string, handler: RouteHandler, contract?: RouteContract) => void
/** 日志窄接口：领域模块只许看日志，不许抱着整个 host ctx。 */
export interface PanelLogger { info?(s: string): void; warn?(s: string): void }
export interface StateStore { load(): PanelState; save(s: PanelState): void }
export interface RootAccess { activeRootOf(): RootEntry | null; configFileOf(): string | null }
export interface SuiteConfigAccess { read(): Record<string, unknown>; write(o: Record<string, unknown>): void }
export interface HotMemoryDeps { suite: SuiteConfigAccess; root: RootAccess }
/**
 * P0a（2026-09-14）：**影子记账**快照。把同批候选喂给读侧单一装配实现 `assembleSupply`，
 *   取它的溢出/丢弃账；**该账对主路径注入文本零影响**（这是 P0a「逐字节等价」的前提）。
 * 为什么先做影子而不是直接接管输出：G4 装配件在 `src/` 内**零运行时消费者**（唯一消费者是离线 CLI
 *   `scripts/supply-preview.mjs`），它自带的硬预算与溢出记账因此**从未在运行时生效、也从未被观测**。
 *   接成影子后，运行时首次有「候选集 vs 预算」的真实账（本文件下方「≈2,800 上限」长期是测算值无实测对照）。
 * ⚠ 阶段 3 口径修正（2026-09-14）：原注写「**不采用它的 blocks**」已不准确——本次起把装配器口径
 *   渲染出的文本也放进 `assemblerText`（**只读诊断字段，仍不进注入面**）。加它的理由：
 *   两套逻辑的结构性差异（抬头行 / 块标题 / `- ` 前缀 / 段落顺序 / 省略文案）原先只能靠读码推断，
 *   现在可与主路径文本**逐行并排比对**。这是阶段 3 产品决策的取证面，不是切换。
 */
export interface SupplyUsage {
  at: number
  chars: number
  budgetTotal: number
  overBudget: boolean
  kept: { stable: number; dynamic: number; oneshot: number; situation: number }
  dropped: string[]
  /** P3：本次用的情境键（**可见化**：键不对/为空时能一眼看出，而不是"情境层静默无效"） */
  cues: string[]
  /** P3：情境槽是否开启（注册表 `surface.injection.situation` 的解析后值） */
  situationEnabled: boolean
  /** S3：额度越界夹取的留痕（空 = 无夹取）—— **不静默**，用户设到范围外时必须看得出 */
  budgetClamped?: string[]
  /** 阶段 3 取证（2026-09-14）：装配器口径（`renderSupplyText`）渲染的注入文本。**只读诊断字段**。
   *  S4R/R1 起主路径**已改调** `renderSupplyText`（渲染收敛）⇒ 本字段现为**同一实现的独立复算**，用于对拍。 */
  assemblerText?: string
  /** S4R/R2（2026-09-14）：**真实被丢弃的行内容**（主路径 `clampLines` 产出，**逐条可比**）。
   *  有它才能核「账 == 真实裁切」—— B2 的判据要求**逐条**可比，不只是计数。 */
  droppedRows?: string[]
  /** IR1 册一（2026-09-18）：**相关性通道的可用性读数**（来源 = 桥/词法/位置式 + 失败原因 + 零命中）。
   *  有它才能分辨「按任务供给生效」与「退回位置式基线」——旧实现两者在读数上**完全同形**（静默）。 */
  relevance?: RelevanceTrace
  /** IR1 册三（2026-09-18）：**逐槽明细**（六槽全出账，含 `process`）—— 账由真实裁切直出，非影子复算 */
  slots?: Record<string, { kept: number; chars: number; dropped: number }>
}
export interface HotMemoryCache {
  key: string | null
  at: number
  text: string
  /** P2（2026-09-13）：稳定面（画像两段，query 无关）单独缓存 —— 键含索引文件尺寸签名，写入即失效 */
  stableKey: string | null
  stableAt: number
  stableText: string[]
  /** P0a（2026-09-14）：末次装配的影子记账（观测用，**不参与文本生成**） */
  usage: SupplyUsage
  /** S4R/R2：稳定面**真实裁切**结果（在缓存分支内产出 —— 该分支之外拿不到 `a2`/`u2`/`dA`/`dU`） */
  realCut?: { stable: number; dropped: string[] }
  /** P1（2026-09-18）：恒定面构造的 **query 无关参数**（主路径构建时写入；`buildStable()` 每步零副作用取用） */
  sd?: StableStash
}
/**
 * 2026-09-18 按域路由 P1：新增 `buildStable()` —— **恒定面单独出口**。
 *   恒定面（双画像索引行 + P 层画像行 + 三层判据常驻块）与 query **无关**（`readCarrier` 全文无 q 引用，实测）
 *   ⇒ 可独立于动态面单独注入：它挂 `systemPrompt.section` 落 **节点 0（压缩豁免）**，
 *   动态面（知识索引，依赖 query）仍走 `systemPrompt.context`（可压区，本就该按需可丢）。
 *   接口写单行是**有意的**：本模块受大模块冻结棘轮约束（基线 537 + 容差 15），拆行即撞顶。
 */
export interface HotMemory { build(query?: string): string; buildStable(): string; buildDynamic(query?: string): string; invalidate(): void; supplyUsage(): SupplyUsage }
export interface RouteBinder { route: RouteFn; disposers: Array<() => void> }
export interface InjectMeta { calls: number; lastAt: number }

export const CONFIG_FILE = 'shoucang.config.yaml'

export function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(homedir(), p.slice(2))
  return p
}

export function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * 读取并解析请求体。
 * ⚠ 必须**缓存**：路由契约的校验会先读一次 body，若 handler 再读一次会拿到空流（流已被消费）⇒ 参数全丢。
 *   缓存挂在请求对象上，后续 readBody 返回同一对象（handler 只读字段，不改写）。
 */
export async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const holder = req as IncomingMessage & { __scBody?: Record<string, unknown> }
  if (holder.__scBody) return holder.__scBody
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown> } catch { parsed = {} }
  holder.__scBody = parsed
  return parsed
}

export function statMtime(file: string): string {
  try { return statSync(file).mtime.toISOString() } catch { return '' }
}

/* ── 状态库（roots 登记表） ── */
export function createStateStore(statePath: string): StateStore {
  return {
    load: (): PanelState => {
      try { return JSON.parse(readFileSync(statePath, 'utf8')) as PanelState } catch { return { roots: [], active: null } }
    },
    save: (s: PanelState): void => {
      mkdirSync(dirname(statePath), { recursive: true })
      writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8')
    },
  }
}

/* ── 路由绑定：注册即纳入卸载清理（资源必须挂 effect——注入器踩坑记录） ── */
export function createRouteBinder(webServer: RouteRegistry, logger: PanelLogger): RouteBinder {
  const disposers: Array<() => void> = []
  /** 已注册路径（宿主按路径去重，重复注册会抛错并导致整个插件树加载失败）。 */
  const registeredPaths = new Set<string>()
  const route = (sub: string, handler: RouteHandler, contract?: RouteContract): void => {
    const path = `/api/shoucang-panel${sub}`
    if (registeredPaths.has(path)) {
      // 兜底：同一路径只允许注册一次（GET/POST 需在同一 handler 内按 method 分发），
      // 否则宿主抛 duplicate route → 插件树整体加载失败。此处告警降级而非让插件起不来。
      logger.warn?.(`[shoucang] 路由重复注册已忽略：${path}（请合并到同一 handler 按 method 分发）`)
      return
    }
    registeredPaths.add(path)
    /* 契约校验前置（S4）：400 且**不进入** handler —— 让「接口被喂错数据」在边界处显式失败，
     *   而不是在 handler 深处退化成"参数为空但返回 200"的假成功。 */
    const guarded: RouteHandler = contract
      ? (req, res) => {
          void (async () => {
            try {
              const body = await readBody(req)
              const missing = (contract.required ?? []).filter((k) => body[k] === undefined || body[k] === null || body[k] === '')
              if (missing.length) {
                logger.warn?.(`[shoucang] 请求缺必填字段：${path} → ${missing.join(',')}`)
                sendJson(res, 400, { error: 'invalid_request', detail: '缺少必填字段：' + missing.join(', ') })
                return
              }
              contract.body?.(body)
            } catch (e) {
              logger.warn?.(`[shoucang] 请求体校验失败：${path} → ${(e as Error).message}`)
              sendJson(res, 400, { error: 'invalid_request', detail: (e as Error).message })
              return
            }
            handler(req, res)
          })()
        }
      : handler
    /* T3（2026-09-17 圆桌会议）：**来源栅栏**——挂**无条件路径**（在 `contract` 三元分支之外），
     *   故 42 条路由（含 27 条无 contract 者）**全覆盖**；折进 contract 分支会漏防那 27 条
     *   （方案丙已实测判死：15/42 带 contract，漏防侧含 `/deepsleep/trigger` 等写端点）。
     *   判据与依据见 `panel-guard.ts` 头注；本体落**新件**（本件在冻结名单、顶格 537/537）。 */
    const fenced: RouteHandler = (req, res) => {
      const verdict = judgePanelRequest(req as { headers?: Record<string, string | string[] | undefined> })
      if (!verdict.trusted) {
        logger.warn?.(`[shoucang] 面板请求被来源栅栏拒绝：${path} → ${verdict.reason}`)
        sendJson(res, 403, { error: 'forbidden', detail: '请求来源不可信' })
        return
      }
      /* ⚠ **必须 `return`**（2026-09-17 修 · 实测踩坑）：
       *   宿主是 `await route.handler(req, res)`（`dsh-host-webserver/lib/index.js:234`）。
       *   若此处**丢弃**返回的 promise：① 异步 handler 的响应在宿主 await 返回后才写 ⇒
       *   调用方读到"未写响应"（实测 `test-panel-wiring` 的 `/vector/status2` code=0；
       *   本缺陷曾被我**误判为"既有问题"**，实为门禁抓出的真实回归）；
       *   ② 更严重 —— 异步 handler 内的异常**逃脱**宿主 `handle().catch()`（同文件 :247）
       *   ⇒ 变 unhandled rejection ⇒ **静默失效**（本仓明令禁止的失效形态）。 */
      return guarded(req, res)
    }
    disposers.push(webServer.register({ kind: 'exact', path, handler: fenced }))
  }
  return { route, disposers }
}

/* ── 根访问（激活根 / 其配置文件） ── */
export function createRootAccess(state: StateStore): RootAccess {
  const activeRootOf = (): RootEntry | null => {
    const s = state.load()
    return s.roots.find((r) => r.id === s.active) ?? null
  }
  return { activeRootOf, configFileOf: () => { const root = activeRootOf(); return root ? join(root.path, CONFIG_FILE) : null } }
}

/* ── 全局配置通道（~/.dsh/suite/scheduler.json；与 scheduler.applySuiteConfigFile 同源） ── */
export function createSuiteConfig(warn?: (m: string) => void): SuiteConfigAccess {
  const fileOf = (): string => join(dshHome(), 'suite', 'scheduler.json')
  return {
    read: (): Record<string, unknown> => {
      try {
        const f = fileOf()
        if (!existsSync(f)) return {}
        const raw = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
        return raw && typeof raw === 'object' ? raw : {}
      } catch (e) {
        /* ⚠ **2026-09-20 round 10**：此处原为 `catch { return {} }` —— **静默返回空**，
         *   与 `scheduler.applySuiteConfigFile` 的外层 catch 是**同一病**（把"坏掉了"显示成"没事"）：
         *   读侧一旦静默返回 `{}`，UI 会把「文件损坏」渲染成「用户啥都没设」（全是缺省），
         *   比配置加载失败更难发现。⇒ 仍然返回 `{}`（安全语义不变），但**必须留痕**。 */
        warn?.(`[shoucang] scheduler.json 读取失败 ⇒ 面板按空配置渲染（配置可能已损坏）：${String((e as Error)?.message || e).slice(0, 120)}`)
        return {}
      }
    },
    // 原子写（同目录 tmp + renameSync）+ 备份先行，零硬编码路径
    write: (obj: Record<string, unknown>): void => {
      const f = fileOf()
      mkdirSync(dirname(f), { recursive: true })
      if (existsSync(f)) {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
        try { writeFileSync(`${f}.bak-${stamp}`, readFileSync(f)) } catch { /* 首次无备份 */ }
      }
      const tmp = join(tmpdir(), 'shoucang-suite-cfg-' + Date.now() + '.json')
      writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
      renameSync(tmp, f)
    },
  }
}

export function createInjectMeta(): InjectMeta { return { calls: 0, lastAt: 0 } }

// ESM 宿主：模块目录用 import.meta.url 解析（__dirname 在 ESM 未定义）。
// ⚠ 名字必须是 moduleDir（下方 bootstrapDefaults 切片原文就引用它）；
//   且 lib/panel-shared.js 与 lib/panel.js 同目录 ⇒ join(moduleDir,'..','skill') 语义不变。
const moduleDir = dirname(fileURLToPath(import.meta.url))

/* ---------- 默认记忆库骨架（2026-09-11 重写：旧 wiki/Obsidian vault 模板退役） ----------
 * 判因（审查 B1）：旧实现把 pmg 时代的 default-vault-template.tar.gz（_meta/*.py 管线 + validate/ +
 *   wiki-* + _index.md）解压到新根，而**当前读写链**（memoryRootOf / targets.memoryLibRoot）只认单库化
 *   布局（MEMORY/USER/AGENT.md + notes/ + audit/ + pending/）⇒ 引导出来的库插件根本读不到。
 * 现语义：只建「单库骨架 + 随包脚本/引擎/规则档」，幂等（已存在一律不覆盖），零外部资产依赖。
 */

/** 单库骨架常量：七类 notes（与 targets.BUILTIN.notes 同源）+ 三索引 + 白名单 */
const LIB_NOTES = ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent']
const LIB_INDEX_FILES: Array<{ file: string; head: string }> = [
  { file: 'MEMORY.md', head: '# MEMORY.md — 知识索引（守藏记忆库）\n\n> 索引行：`[tag] 主题 · 概况 → notes/x.md §小节`；容量门与白名单见同根 `whitelist.json`。\n' },
  { file: 'USER.md', head: '# USER.md — 用户画像（守藏记忆库）\n\n> 索引行 + 画像行（`- … ← 源: …`）；画像行全量注入，不参与召回命中统计。\n' },
  { file: 'AGENT.md', head: '# AGENT.md — 自我画像（守藏记忆库）\n\n> 索引行 + 画像行；含 `[原则]`/`[路径]`/`[边界]`（深睡归纳落点）。\n' },
]

const writeIfAbsent = (p: string, body: string | Buffer, created: string[]): void => {
  try {
    if (existsSync(p)) return
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, body)
    created.push(p)
  } catch { /* 单文件失败不阻断（报告按实际创建数） */ }
}

const copyFileIfAbsent = (src: string, dst: string, created: string[]): void => {
  try {
    if (!existsSync(src) || existsSync(dst)) return
    mkdirSync(dirname(dst), { recursive: true })
    writeFileSync(dst, readFileSync(src))
    created.push(dst)
  } catch { /* 源缺失/写入失败=跳过 */ }
}

const copyTreeIfAbsent = (srcDir: string, dstDir: string, created: string[]): void => {
  try {
    if (!existsSync(srcDir)) return
    mkdirSync(dstDir, { recursive: true })
    for (const e of readdirSync(srcDir, { withFileTypes: true })) {
      const s = join(srcDir, e.name)
      const d = join(dstDir, e.name)
      if (e.isDirectory()) copyTreeIfAbsent(s, d, created)
      else copyFileIfAbsent(s, d, created)
    }
  } catch { /* 目录不可读=跳过 */ }
}

/** 幂等建「单库骨架」：目录 + 三索引 + 七 notes + INDEX 注册表 + whitelist.json + 随包 scripts/engine/规则档 */
export const bootstrapDefaults = (rootPath: string): { createdDirs: string[]; createdIndexes: string[]; skipped: string[]; template: boolean } => {
  const out = { createdDirs: [] as string[], createdIndexes: [] as string[], skipped: [] as string[], template: true }
  mkdirSync(rootPath, { recursive: true })
  for (const d of ['notes', 'audit', 'audit/archive', 'pending']) {
    const p = join(rootPath, d)
    if (existsSync(p)) continue
    try { mkdirSync(p, { recursive: true }); out.createdDirs.push(d) } catch { out.skipped.push(d) }
  }
  for (const { file, head } of LIB_INDEX_FILES) {
    if (existsSync(join(rootPath, file))) { out.skipped.push(file); continue }
    writeIfAbsent(join(rootPath, file), head, out.createdIndexes)
  }
  for (const n of LIB_NOTES) {
    const rel = `notes/${n}.md`
    if (existsSync(join(rootPath, rel))) { out.skipped.push(rel); continue }
    writeIfAbsent(join(rootPath, rel), `# notes/${n}.md — ${n}\n\n## 起始\n- （新库占位小节：写入由 memory-append 追加，或按「父/子」路径自动分裂 ###）\n`, out.createdIndexes)
  }
  writeIfAbsent(join(rootPath, 'notes', 'INDEX.md'), '# notes/INDEX.md — 详情子文档注册表\n\n## 元数据表\n\n| 文件 | 状态 | 说明 | 更新 | 范围 |\n|---|---|---|---|---|\n', out.createdIndexes)
  writeIfAbsent(join(rootPath, 'whitelist.json'), JSON.stringify({
    version: 1, library: 'shoucang', routes: ['memory'],
    indexTargets: ['MEMORY.md', 'USER.md', 'AGENT.md'], notes: LIB_NOTES,
    updatedAt: new Date().toISOString().slice(0, 10),
  }, null, 2) + '\n', out.createdIndexes)
  // 随包脚本/引擎/规则档：蒸馏与深睡**直接以 <库根>/scripts/*.mjs 起子进程**，
  // 骨架不带脚本 = 记忆循环空转（这正是旧 vault 模板的坑），故一并复制（幂等，不覆盖已存在文件）。
  const skillDir = join(moduleDir, '..', 'skill')
  copyTreeIfAbsent(join(skillDir, 'scripts'), join(rootPath, 'scripts'), out.createdIndexes)
  copyTreeIfAbsent(join(skillDir, 'engine'), join(rootPath, 'engine'), out.createdIndexes)
  for (const f of ['SKILL.md', 'audit-protocol.md', 'human-execution-loop.md', 'memory-whitelist-spec.md', 'task-protocols.md', 'README.md']) {
    copyFileIfAbsent(join(skillDir, f), join(rootPath, f), out.createdIndexes)
  }
  return out
}
// 路线② 晨起摘要读取：**睡眠汇报派生优先 + `delta.md` 兜底**（S2S3 册四 · 2026-09-19 换源）
//  主源 = `<kRoot>/audit/sleep-reports.jsonl` 末条 `sleep-round` 行 → `sleep-report.ts#latestDerivation`
//  （与报告正文**同函数** ⇒ 判据「注入块 == 报告提存/压缩/统计段」可**逐元素机检**）。
//  兜底 = 旧 `delta.md`（深睡行级 diff，≤3 行、48h 有效）——**只在派生为空时用**：
//    · 用户口径「注入源不断」：报告尚未产出（首轮睡眠未跑）或本轮无可陈述变化时，块**不得静默消失**；
//    · 且 `delta.md` 文件**未退役**（§5-U2 待用户拍板）⇒ 它仍是**活的兜底源**，故仍在失效键里（见 `supply-stamp`）。
//  两者的行语义不同（派生 = 方向级摘要；兜底 = 带源指针的画像行），故**不做跨源等价断言**——
//  等价判据是**各自与自己的上游同源**（派生 vs 报告段 · 兜底 vs delta.md 原文）。
const readDawnGrowth = (personaMode: string): string => {
  if (personaMode === 'off') return ''
  try {
    const rows = latestDerivation({ kRoot: knowledgeRoot() }).slice(0, 3).filter((r) => !!String(r).trim())
    if (rows.length) return ['🧠 最近成长（上次深睡归纳 · 数值同睡眠汇报）：', ...rows.map((r) => `  ${String(r).trim()}`)].join('\n')
    return readDeltaFallback()
  } catch { return '' }
}
// 兜底源：`suite/knowledge/delta.md`（旧实现原样保留语义：≤3 行 · 48h 过期即弃 · 不可读即空）
const readDeltaFallback = (): string => {
  try {
    const f = join(knowledgeRoot(), 'delta.md')
    if (!existsSync(f)) return ''
    const o = JSON.parse(readFileSync(f, 'utf8')) as { staleAt?: string; rows?: string[] }
    if (o.staleAt && Date.parse(o.staleAt) < Date.now()) return ''
    const rows = Array.isArray(o.rows) ? o.rows.slice(0, 3).filter((r): r is string => typeof r === 'string' && !!r.trim()) : []
    if (!rows.length) return ''
    return ['🧠 最近成长（上次深睡归纳，带源指针可核验）：', ...rows.map((r) => `  ${r.trim()}`)].join('\n')
  } catch { return '' }
}
// 数据根：守藏自有记忆库（三索引体系，与蒸馏写入权威根一致）；MEMORY_ROOT 可覆盖
const memoryRootOf = (): string => {
  // 收口到 targets#memoryLibRoot（2026-09-21）：此处原有**第二份**「env || 硬编码」实现，
  // 与 targets 的同名函数是重复事实源——迁移库根时两处须同时改，漏一处即半迁移。
  return memoryLibRoot()
}

/* ── R1 热记忆注入：画像+记忆指针行，每轮注入（依赖 2 个：suite / root） ──
 * ⚠ createHotMemory 只做「持有缓存 + 返回句柄」；选行实现在模块级 buildHotMemoryText。
 *   把 154 行实现塞进工厂 = 实现又寄生回入口，正是 audit-wiring I1 要拦的形态（本轮实测被判 159 行）。 */
export function createHotMemory(d: HotMemoryDeps): HotMemory {
  // 缓存键含「任务文本」：相关性选行随任务变化，仅按 root 缓存会让同一会话内永不更新（2026-09-10 ACT-027）
  const cache: HotMemoryCache = { key: null, at: 0, text: '', stableKey: null, stableAt: 0, stableText: [], usage: emptySupplyUsage() }
  return {
    build: (query = '') => buildHotMemoryText(d, cache, query),
    // 2026-09-18（按域路由 P1）：恒定面单独出口 —— 供 panel-inject 挂 systemPrompt.section（落节点 0 ⇒ 压缩豁免）。
    //   首次（stash 未生成）先跑一次完整 build 填充 —— 之后每步只读 `cache.sd` + 稳定面缓存，**零重算零读盘**。
    buildStable: () => { if (!cache.sd) buildHotMemoryText(d, cache, ''); return cache.sd ? stableTextOf(cache.sd, Date.now(), cache) : '' },
    // 2026-09-18（按域路由 P1）：**动态面**出口 —— 恒定面已由 buildStable() 挂 section，故本出口剔除 stable
    //   （否则两处注入同一内容）。context 通道用本方法；`build()` 保留完整形态供 `/inject/preview` 与对拍用。
    buildDynamic: (query = '') => buildHotMemoryText(d, cache, query, true),
    // ⚠ 2026-09-14 修（阶段 1）：原实现**只清 `cache.at`** ⇒ 面板写入后，
    //   30s 的 query 缓存清了，但**稳定面（画像段）缓存没清**，仍沿用旧值直到 120s TTL 过期。
    //   缺陷形态与「上游落盘不失效」同型：**通道建了、通知只做了一半**。
    invalidate: () => { cache.at = 0; cache.stableKey = null },
    // P0a：影子记账对外只读出口（显式句柄，**不新增模块级 holder** —— 仓内已用 composition root 退役过一轮隐式通道）
    supplyUsage: () => cache.usage,
  }
}

/** P0a：影子记账的零值（首次 build 之前读取时不返回 undefined）。**模块私有**——导出会顶到 audit-architecture 的导出棘轮（35）。 */
const emptySupplyUsage = (): SupplyUsage => ({ at: 0, chars: 0, budgetTotal: 0, overBudget: false, kept: { stable: 0, dynamic: 0, oneshot: 0, situation: 0 }, dropped: [], cues: [], situationEnabled: false })

/**
 * P3（2026-09-14）：**情境槽候选** —— 已迁至 `situation-supply.ts`（2026-09-17）。
 *
 * 迁因：本模块受 `check-module-growth` **大模块冻结棘轮**约束（有效行数 547 / 基线 547，顶格零余量），
 *   而本轮要在 `sitCtx` 补第二个键（`task`）⇒ 加一行即撞顶。先抽叶子逻辑腾空间，再改。
 *   `situationLinesOf` 的实现与语义**逐字未变**，只是搬家（依赖方向 L5→L2，无环）。
 */

/**
 * **影子记账已退役**（IR1 册三 · 2026-09-18）—— 原 `supplyUsageMeta` 在此把手写候选喂给
 * `assembleSupply` **再装配一遍**，与主路径真实裁切并列成两笔账（实测虚报 6 vs 真实 1）。
 * 现：账由 `supply-assembly#supplyMetaOf` **吃真实裁切结果**直出（见 `buildHotMemoryText` 尾部），
 * 六槽逐槽出账（含 `process`）⇒ 「账 == 真实裁切」不再是"靠对拍"，而是**结构上同源**。
 * 判据：`check-injection-reach`（主路径无第二份装配）+ `test-usage-truth`（六槽 + 逐条可比）。
 */

/**
 * P2：索引文件尺寸签名（写入即变 ⇒ 作为稳定面缓存的失效键；零依赖、零 spawn）
 *
 * ★IR1 册四（2026-09-18）：**整段文本的上游戳已迁 `supply-stamp.ts#libStampOf`**（单一实现：
 *   库戳 ∪ 介质戳 ∪ 观测用的 warm 戳）；本函数只保留给**稳定面键**（画像文件同尺寸改内容不该打穿它）。
 *   旧 `upstreamStampOf`（只签 activity + delta 两条介质）已删 —— 它的口径与 `supply-stamp` 重复。
 */
const sizeStampOf = (root: string, files: readonly string[]): string =>
  files.map((f) => { try { return `${f}:${statSync(join(root, f)).size}` } catch { return `${f}:-` } }).join(',')

/**
 * **上游戳**（IR1 册四起）**在 `supply-stamp.ts#libStampOf`** —— 单一实现：库戳（三索引 size+mtimeMs）
 * ∪ 介质戳（`activity.jsonl` · `delta.md`）∪ 观测用的 warm 戳。
 * ⚠ **必须接在 `cacheKey`（30s query 缓存）上，不是 `stableKey`**：验收实测发现接在稳定面键上时
 *   「改介质 ⇒ 键变了 ⇒ **输出没变**」——把关整段文本的是 `cacheKey`，稳定面只装画像段、这些介质
 *   **不进画像段**。此即「缓存失效了、输出没变」型假绿（正向测试看不见），已由 `test-inject-cache.mjs` 钉死。
 * ⚠ **`warm-recall.json` 只作观测、不进键**：它一次只装**一个 query** 的行，签它会
 *   「为 query B 的写入失效 query A 的缓存」而 A 输出不变 ⇒ 平白失效。
 */

/**
 * P2：逐行累计字符数并裁到 cap 以内；返回 [保留行, 被丢弃行数]（供调用方**可见化**留痕）。
 *
 * ★2026-09-18 按域路由 P1：新增 `omitStable` —— 恒定面已由 `buildStable()` 单独挂 `systemPrompt.section`
 *   （落节点 0 ⇒ 压缩豁免），故走 `context` 通道时必须**剔除 stable 段**，否则同一内容两处注入
 *   （正是本仓禁的"同一事实两处来源"）。缓存键含该标志 ⇒ 两种形态各自缓存、互不串用。
 */
function buildHotMemoryText(d: HotMemoryDeps, cache: HotMemoryCache, query = '', omitStable = false): string {
  const now = Date.now()
  const memRoot = memoryRootOf()
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  // P1-2（2026-09-10）：注入配置作用域迁全局——优先读 ~/.dsh/suite/scheduler.json 的 injection 键，
  // 回落 root config YAML（旧配置兼容），都无 → 缺省。切 root 不再影响注入（与记忆/蒸馏同域）。
  // 注：板块上限（caps）2026-09-10 起为「记忆库容量门」（写门用），不再裁注入——注入总看完整画像+记忆
  // ⚠ S3 补（2026-09-22）：**读配置与解析额度必须提到缓存键之前** —— 否则额度改变不进键，
  //   改额度后的 30s 内注入文本仍是旧代（真机实测的"旋钮迟滞"；判因详见下方 `cacheKey` 注）。
  const sched = (() => { try { return d.suite.read() } catch { return {} } })()
  /* S3：额度走覆盖链（`scheduler.json` → 注册表）；**判因与边界见 `budget-override.ts` 抬头**
   * （此处只留调用点，不复述 —— 该件受 §冻结上限约束，且同一判因不该两处各写一份）。 */
  const resolved = resolveSupplyBudget(sched, SURFACE.injection as unknown as Record<string, unknown>)
  const budgetClamped: string[] = [...resolved.clamped]
  // 阶段 1 修复（2026-09-14）：键尾接上游介质签名 —— **这一层才是把关整段文本的缓存**
  //   （稳定面只装画像段；签在那里会"缓存失效了、输出没变"，证据见 `upstreamStampOf` 头注）。
  // ⚠ S3 补（2026-09-22）：键还**必须含额度** —— 判因（真机实测）：删除 `injectBudgetChars` 覆盖后，
  //   注入文本与账**在 TTL 内纹丝不动**（30s 本层 / 120s 稳定面层各自迟滞一次）⇒ 用户刚调完旋钮
  //   却看到旧值，属「调了没用」的窗口。**凡是改变输出的输入都必须进键**（与 IR1 册五 E5 同一条纪律）。
  const cacheKey = memRoot + '|' + q + '|' + stampKeyOf(libStampOf(memRoot)) + '|budget:' + resolved.totalBudget + (omitStable ? '|nostable' : '')
  if (cache.key === cacheKey && now - cache.at < 30000) return cache.text
  cache.key = cacheKey
  cache.at = now
  let level = 'smart'
  let hotMemoryOn = true
  let personaMode = 'both'
  const hasSchedInject = 'injectLevel' in sched || 'injectPersona' in sched || 'hotMemory' in sched
  if (hasSchedInject) {
    if (typeof sched.injectLevel === 'string') level = sched.injectLevel
    if (typeof sched.injectPersona === 'string') personaMode = sched.injectPersona
    if (typeof sched.hotMemory === 'boolean') hotMemoryOn = sched.hotMemory
  } else {
    // 回落：旧 root config YAML（2026-09-10 前唯一注入配置源；迁移后仅兼容读取）
    const file = d.root.configFileOf()
    if (file && existsSync(file)) {
      try {
        const view = parseView(readFileSync(file, 'utf8'))
        level = view.injection_level ?? 'smart'
        hotMemoryOn = view.flags['injection.hot_memory'] !== false
        personaMode = String(view.flags['injection.persona'] ?? 'both') // v16：off|me|you|both 接通生效（me=AGENT 画像 / you=USER 画像）
      } catch { /* 缺配置用默认 */ }
    }
  }
  if (level === 'off' || !hotMemoryOn) { cache.text = ''; return '' }
  // 指针式注入：agent 画像（含 [原则] 习得原则与 [路径] 任务路径）+ 用户画像 + 知识索引一行一条（[tag] 主题 · 概况 → notes/x.md §小节），Agent 按需 get_file 拉详情
  // 2026-09-10 用户拍板：注入侧**不裁切**（任务执行时 agent 总看到完整双画像+记忆指针——裁切会漏记忆影响执行）；
  // 记忆库规模由容量门（写门 SHOUCANG_CAP_*，蒸馏扩增时强制）控制
  // v2.2 M0（ADR-130 载体契约）：按 **载体** 渲染 ——
  //   always:index（P 层索引行）全量；always:profile（P 层画像行 `- … ← 源:`）≤ injectProfileRows 条/档（0=关闭=回滚）；
  //   gated:index（E/R 层）由 recallIndex/recallRanked 按相关性/任务型选择（此处仅提供候选池）。
  //   标签→层映射**来自注册表**（CARRIERS），代码里不硬编码（单一事实源原则）。
  // 2026-09-11（缺陷1 修复）：层准入**不再本地推导**，统一用 targets 的单一实现（注册表驱动）。
  const alwaysProfileTags = profileCarrierSet('always')
  const readCarrier = (name: string, opts: { profile?: boolean; maxProfile?: number } = {}): string[] => {
    try {
      const all = readFileSync(join(memRoot, name), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      // 恒定面只收 `inject=always` 的索引行（P 层）：R/E 层是 gated，须由召回/任务型通道按需取回，
      // 不得在恒定预算里无差别铺开（契约见 criteria.json#carriers.note；机检 check-carriers ⑥）。
      const idx = all.filter((l) => indexRowInLayer(l, 'always'))
      if (!opts.profile || !(opts.maxProfile && opts.maxProfile > 0)) return idx
      const prof = all.filter((l) => {
        if (!/^-\s/.test(l) || !/←\s*源:/.test(l)) return false
        const m = l.match(/^-\s*\[([^\]]+)\]/)
        if (!m) return true // 历史无标签行：回落启发式（`- … ← 源:` 即画像行）
        if (alwaysProfileTags.size === 0) return true
        return alwaysProfileTags.has(m[1]) // 注册表驱动：仅 P 层 profile 标签进入 always 面
      })
      // v3（P0 2026-09-13）→ v4（同日质量回归评估修正）：**带标签的 P 层画像行优先保留**。
      //   实测缺陷：`[边界] 宿主服务免动 …`（唯一一条有身份的能力边界行）位于文件**首位**，
      //   在「slice(-N) 取最近」规则下**从未被注入过**（永远被更晚写入的无标签行挤掉）——静默失效。
      //   现规则：标签行全保留（同标签取最近 1 条），余额用最近的无标签行补齐；被挡下的仍留痕可见化。
      // ★IR1 册五 E5（S-P4e′ 的落点 · 2026-09-18）：**跨形态消重必须在配额结算之前** ——
      //   旧状：消重接在 `panel-inject` 的**注入文本后过滤**（预算花完之后）⇒ 被删行腾出的额度
      //   **没人用**（真机实测省 0 字符/0 行）。现在此先剔除"已被粗行涵盖"的细行，再按配额补齐 ⇒
      //   省下的槽位由**别的叙事行**接手（`inject-dedup-probe` 守该收益点）。
      const profKept = filterInjected(prof, dedupState().skip)
      const byTag = new Map<string, string>()
      const untagged: string[] = []
      for (const l of profKept) {
        const m = l.match(/^-\s*\[([^\]]+)\]/)
        if (m) byTag.set(m[1], l)
        else untagged.push(l)
      }
      const taggedRows = [...byTag.values()]
      const fill = Math.max(0, opts.maxProfile - taggedRows.length)
      const picked = [...taggedRows, ...(fill > 0 ? untagged.slice(-fill) : [])]
      // 截断可见化（P0）：被配额挡下的行必须留下痕迹，否则与「注入侧不裁切」的拍板精神冲突（静默丢失）。
      const dropped = profKept.length - picked.length
      if (dropped > 0) picked.push(`（另有 ${dropped} 条画像行未进入本步注入面，按需 get_file 读取）`)
      return idx.concat(picked)
    } catch { return [] }
  }
  const readIdx = (name: string): string[] => readCarrier(name)
  // v2.2：P 层画像行每档上限（0=回滚）。★2026-09-13 质量评估修正：兜底值改读**注册表**
  //   （原硬编码 `?? 3` 与注册表 `carriers.profile` 打架 —— 注册表 3→4 对运行时**零效果**，属"注册表驱动"失守）
  const profileCap = Number(sched.injectProfileRows ?? SURFACE.injection.carriers.profile) || 0
  const userLines = personaMode === 'off' || personaMode === 'me' ? [] : readCarrier('USER.md', { profile: true, maxProfile: profileCap })
  const agentLines = personaMode === 'off' || personaMode === 'you' ? [] : readCarrier('AGENT.md', { profile: true, maxProfile: profileCap })
  /* B 档：档位行数上限 —— **走覆盖层**（S3）。缺省无覆盖即注册表值 ⇒ 行为逐字不变。
   * ⚠ **不保留 `{ ...SURFACE.injection.levelCaps }` 兜底**（自查抓到）：那会把旧式直读又放回来，
   *   等于覆盖链只在"注册表非空"时成立；空注册表属配置损坏，宁可给空 caps（下面 `?? 10` 有兜底）。 */
  const rowCaps: Record<string, number> = resolved.levelCaps as Record<string, number>
  const cap = rowCaps[level] ?? 10
  const allMem = readIdx('MEMORY.md')
  // v8（认知对照 P1「降权贯穿三通道」+「复习-强化」）注入侧的冷热感知 + 命中次权重。
  //   R6 审查项：**回退分支也要生效**——否则 `injectRelevance=false` 或空 query 时「降权贯穿三通道」实际只剩两通道。
  // L5（2026-09-14）：动态面选行整段（~90 行）已抽至 `./dynamic-select.js`（**只移动、不改逻辑**）。
  //   抽取动因 = 本模块受大模块冻结棘轮约束（曾顶格 846/846），为 S4-3 的中层 `process` 槽腾出接入空间。
  // S4-3（2026-09-14）中层 `process` 槽的**候选源**：全层索引行（`[路径]` 属 R 层、在 AGENT.md）；
  //   ⚠ 只算**一次**并复用给选行与出账（IR1 册三：`process` 槽要单独出账 ⇒ 需要这份候选集）。
  const procCfg = (SURFACE.injection as unknown as { process?: { enabled?: boolean; carrierTag?: readonly string[]; topN?: number; gate?: string } }).process
  const procRows = procCfg?.enabled === true ? scanIndexRows(memRoot).map((r) => r.line) : []
  // ★Q4（2026-09-20）**任务键词表上移复用**：`knownTaskCuesOf(memRoot)` 每次要 loadStore 全量记录
  //   （实测 25ms / 5700+ 条）。原先它只在 :648 的 `sitCtx` 处算一次；若为 process 槽**就地再算一次**
  //   即「每轮注入多付一次 loadStore」。故此处**提前算一次并复用**给 process 槽与下方 `sitCtx`。
  //   ⚠ 与 `gate` 无关：无论 gate 取值都只算一次（缺省 tag 下结果不进任何判据 ⇒ 零行为变化）。
  const taskCueTable = knownTaskCuesOf(memRoot)
  const procTaskKeys = procCfg?.enabled === true && procCfg.gate === 'task' ? taskCueTable : []
  const dyn = selectDynamicLines({
    allMem, cap, q, memRoot,
    activityFile: join(memRoot, 'audit', 'activity.jsonl'),
    readSuite: () => { try { return d.suite.read() as Record<string, unknown> } catch { return {} } },
    // S4-3（2026-09-14）中层 `process` 槽：整对象传注册表配置（缺省 `enabled:false` ⇒ 本项零行为变化）
    process: procCfg,
    taskKeys: procTaskKeys,
    // IR1 册一：**恒定面已持有的行**不再进动态面（防"同一行两处注入"，实测曾出现 2 行重复）
    exclude: [...agentLines, ...userLines],
    processRows: procRows,
  })
  // IR1 册一：相关性面的**可用性读数**随行一起回来（来源/失败原因/零命中）⇒ 注入面与记账都能如实反映
  const memLines = dyn.lines
  if (!userLines.length && !agentLines.length && !memLines.length) { cache.text = ''; cache.usage = emptySupplyUsage(); return '' }
  // ── P2（2026-09-13）：三层预算 + 稳定面缓存分层（方案档 D6/DS3）──
  //   ① 稳定面（画像两段）与任务文本无关 ⇒ 单独缓存，键含索引文件尺寸签名（任何写入即失效），
  //      避免"新用户消息 ⇒ query 变 ⇒ 全量重读三个文件 + 解析 activity.jsonl"的每轮重算；
  //   ② 三层各有硬顶且受总预算约束（注册表 surface.injection.budgetChars 驱动，runtime 消费）；
  //   ③ 任何一层的丢弃都**留痕可见化**，不再出现"静默丢记忆"（与 L333「不裁切」拍板不冲突：
  //      不裁切的是"内容权威"，裁的是"本步上下文成本"，且被裁项有提示与按需 get_file 通道）。
  // ⚠ v2 语义修正（2026-09-13 质量回归评估实测）：恒定面**不是按比例分档**，而是「**必在 + 安全带**」。
  //   实测：AGENT.md always 索引行 15 条 / 1,138 字符 + USER.md 8 条 / 430 字符。按 56% 分档（1,008 字符）
  //   会把 AGENT 侧（含 11 条 `[原则]` + 4 条 `[路径]`）**裁掉一半以上** ⇒ 与方案 I2a「恒定面每步必在」
  //   自相矛盾，且直接损伤"习得原则常驻在场"（人格一致性 / 跨任务方向指引）。
  //   现改为：**变动面 / 一次性面各有硬顶（600 / 200），恒定面吃余额**（安全带 4,000 只防库无界膨胀）；
  //   现实占用 ≈ 1,990（画像）+ ≤600（知识）+ ≤200（一次性）≈ **2,800 上限**，且恒定面不再被裁。
  /* S3：总预算 —— 覆盖优先、注册表兜底；**判因见 `budget-override.ts`**（原式等价性由其门 ④ 断言）。 */
  const totalBudget = resolved.totalBudget
  /* 夹取留痕由 `resolved.clamped` 汇总 ⇒ 账里可见（`cache.usage.budgetClamped`，`/inject/stats` 只读出去）。
   * ⚠ 不为告警加 logger 依赖：`HotMemoryDeps` 只有 `{suite, root}`，而既有出口已能让它可见。 */
  // S4-1（2026-09-14）：三层额度由 `supply-assembly#budgetOf` **单一实现**派生（原为手写三行，
  //   与装配器侧 `DEFAULT_BUDGET` 构成两套口径）。**逐式等价 ⇒ 数值与注入文本均不变。**
  const { stable: capStable, dynamic: capDynamic, oneshot: capOneshot } = budgetOf(totalBudget)
  // ★2026-09-18（按域路由 P1）：恒定面构造已抽至 `hot-stable.ts`（按领域接缝拆 —— 本模块受大模块
  //   冻结棘轮约束，且恒定面与动态面本就是两个领域）。**语义逐字未变**，仅搬家；实现仍只有一份。
  // ★IR1 册五 E5（2026-09-18）：稳定面键**必须含消重状态** —— 消重（`dedupState`）在装配内部生效，
  //   而它是**异步预热**出来的（mount 后几秒才就绪）⇒ 若键不含它，首次渲染（skip 还空）算出的稳定面
  //   会被缓存 120s，此后 skip 就绪也**不重建**（实测：行仍在文本里）。用 `warmedAt` 作指纹即可。
  // ⚠ S3 补（2026-09-22 · **同一缺陷的第二次发作，本次是我自己引入的**）：键还**必须含 `capStable`**。
  //   判因（真机实测）：`injectBudgetChars` 覆盖被删除后，面板 `stable chars` 仍停在 **1433**（应为 2812），
  //   直到 **120s TTL 过期**才恢复 —— 即：**旋钮改了额度、注入文本纹丝不动**（"调了没用"的 120 秒窗口）。
  //   上一条 E5 的教训写在这里、本次却仍漏了 `capStable`：**凡是改变本函数输出的输入，都必须进键**。
  const stableKey = `${memRoot}|${personaMode}|${profileCap}|${playbookEnabled(d.suite)}|${sizeStampOf(memRoot, ['AGENT.md', 'USER.md'])}|cap:${capStable}|dedup:${dedupState().warmedAt}`
  // stash 供 `buildStable()` 每步零副作用取用（**不得**在里面重跑本函数 —— 那会覆盖 cache.text 与影子账）
  cache.sd = stableStashOf(memRoot, capStable, playbookEnabled(d.suite), stableKey, agentLines, userLines)
  const stablePart = stableLinesOf(cache.sd, now, cache)
  // S4X/X1（2026-09-14）**修 L8**：原先这里是**硬编码 `0`** ⇒ 末尾预算提示行**漏算 stable 分块丢弃的行**。
  //   实测（临时把注入预算降到 1200 触发）：画像另省略 **13 + 8** 行，而提示行只声明 oneshot 的 **1** 行
  //   ⇒ **少算 20 行**。真实值直接复用 R2 写入的 `cache.realCut`（= `[...dA, ...dU]`），零作用域问题。
  //   ⚠ 缺省配置（预算 4000）下 stable 不触发裁切 ⇒ `realCut.dropped` 为空 ⇒ 本修复**在该配置下零影响**。
  const droppedStable = cache.realCut?.dropped.length ?? 0
  const deltaText = readDawnGrowth(personaMode)
  const [oneshotPart, droppedOneshot] = clampLines(deltaText ? deltaText.split('\n') : [], capOneshot)
  const dynBlock: string[] = []
  // S4R/R2：提升到外层 —— 账需要 `m.length`（真实保留）与 `droppedMem`（被丢内容）
  const [m, droppedMem] = memLines.length ? clampLines(memLines, capDynamic) : [[], [] as string[]]
  if (memLines.length) {
    if (m.length) {
      dynBlock.push(`知识索引（MEMORY.md/AGENT.md，热取前 ${m.length} 条）：`)
      for (const l of m) dynBlock.push(`- ${l}`)
      if (droppedMem.length > 0) dynBlock.push(`（另有 ${droppedMem.length} 条知识索引未进入本步注入面，按需 get_file 读取）`)
    }
  }
  const droppedAll = droppedStable + droppedOneshot.length
  /* IR1 册一（A5）：**零命中必须可见** —— 相关性通道取不回任何行时，注入面末尾如实注明
   *   "以下为位置式基线"。判因：旧实现下"按任务供给"与"退回基线"在**输出上完全同形**
   *   （真命中词 vs 乱码词 63/63 行相同），使用者无法分辨 ⇒ 这正是 G1 要消灭的静默。 */
  const relNote = relevanceNoteOf(dyn.trace, q)
  // S4R/R1（2026-09-14）：**文本拼接改由 `renderSupplyText` 单一实现**（原先此处手写三行拼接，
  //   与装配器构成**两套渲染**）。四个选项逐项对应原行为：段序 `oneshot→stable→dynamic` ·
  //   段间分隔符 `'\n'` · 段内容**自带标题**（故传空标题 ⇒ 外层不加）· 末尾预算省略提示。
  //   **逐字节等价由 `scripts/inject-baseline-diff.mjs` 守**（三 case 真机对拍）。
  const text = renderSupplyText({
    blocks: { core: '', stable: omitStable ? '' : stablePart.join('\n'), dynamic: dynBlock.join('\n'), oneshot: oneshotPart.join('\n'), serendipity: '', situation: '' },
    meta: { chars: 0, budgetTotal: totalBudget, overBudget: false, serendipityEnabled: false, situationEnabled: false, kept: { stable: 0, dynamic: 0, oneshot: 0, serendipity: 0, situation: 0 }, dropped: [] },
  }, {
    order: ['oneshot', 'stable', 'dynamic'],
    separator: '\n',
    headers: { core: '', stable: '', dynamic: '', oneshot: '', serendipity: '', situation: '' },
    tailNote: [droppedAll > 0 ? `（本步受预算 ${totalBudget} 字符约束省略 ${droppedAll} 行；按需 get_file 读取）` : '', relNote].filter(Boolean).join('\n') || undefined,
  })
  // ── IR1 册三（2026-09-18）：**账由真实裁切直出**（不再有影子复算）──
  //   旧实现：此处把手写候选喂给 `assembleSupply` **再装配一遍**（影子账），与主路径真实裁切并列 ⇒
  //   "账 == 真实裁切"只能靠对拍（实测虚报 6 vs 真实 1），且 `kept` 只有 4 槽（**缺 `process`**）。
  //   现实现：每槽交**实际保留行 / 实际被丢行**，账与文本**同源**；六槽逐槽出账（含 `process`）。
  //   情境槽（P3）：环记录由 `ring-supply` 按**情境键**选（线索驱动，不走内容相似度）；只在注册表开启时读盘。
  const sitCfg = (SURFACE.injection as unknown as { situation?: { enabled?: boolean; budgetChars?: number; cueDims?: string[] } }).situation
  // 主开关与额度**都 honored**（两个都读，避免"放进来却不可控"的假可控——仓内 storeMode 的先例注解）
  // S3：额度走覆盖链（已在 `resolved` 算好）；`enabled` 仍**只由注册表定**（开关属结构声明，不随配置漂）。
  const sitBudget = resolved.situationBudget
  const sitCtx: SituationCtx = { scope: (() => { try { const p = d.root.activeRootOf()?.path; return p ? `workspace:${p}` : '' } catch { return '' } })(), task: taskCueOf(q, taskCueTable) }
  const sitCues = cuesOf(sitCtx, sitCfg?.cueDims)
  const sitLines = situationLinesOf(memRoot, sitCues, new Date(now).toISOString(), sitBudget)
  // 情境槽**按额度取行**（切割语义归装配域：`takeSlotLines` 与 `assembleSupply` 内部**同一实现**）
  const sitTake = takeSlotLines(sitLines, sitBudget, 'situation')
  // `process` 槽行是**外接追加**进动态面的（零挤占，设计不改）⇒ 出账时从动态面里**摘出来单列**，否则
  //   它会被算成"变动面供了 11 行"（读数失真），而 C3 要的正是"六槽各供了几行"。块标题行**不计入 kept**
  //   （C6：`kept.stable` 是**记忆行数**，不是渲染行数 —— 含标题会让账与"注入了几条记忆"对不上）。
  // ⚠ `procRows` 是 `process` 槽的**候选源**（全层索引行 ≈150 条），**不是**该槽的产出 —— 产出是
  //   `dyn.proc`（经 `selectProcessLines` 按标签取 topN 的那几条）。出账必须用**产出**：
  //   实测踩坑：用候选源做交集会把"相关性通道取回的索引行"误记成 process 供的行（8 vs 实际 2）。
  const TITLE_RE = /^(agent 画像|用户画像)（/
  const procPicked = dyn.proc
  const dynKept = m.filter((l) => !procPicked.includes(l))
  const meta = supplyMetaOf({
    stable: { kept: stablePart.filter((l) => !TITLE_RE.test(l)), droppedRows: cache.realCut?.dropped ?? [] },
    dynamic: { kept: dynKept, droppedRows: droppedMem },
    oneshot: { kept: oneshotPart, droppedRows: droppedOneshot },
    process: { kept: procPicked.filter((l) => m.includes(l)) },
    situation: { kept: sitTake.kept, droppedRows: sitTake.dropped.map((x) => x.line) },
  }, { stable: capStable, dynamic: capDynamic, oneshot: capOneshot, situation: sitBudget, serendipity: 0, process: procPicked.length }, { budgetTotal: totalBudget, cues: sitCues })
  // IR1 册一（A3）：相关性通道的**降级原因也进 `dropped`**（与预算丢弃同列 ⇒ 一处即可看到"为什么没取到"）；
  //   结构化读数另存 `relevance`（区分"桥不可用"与"桥可用但零命中"，两者处置完全不同）。
  cache.usage = {
    at: now, chars: meta.chars, budgetTotal: meta.budgetTotal, overBudget: meta.overBudget,
    kept: { stable: meta.kept.stable, dynamic: meta.kept.dynamic, oneshot: meta.kept.oneshot, situation: meta.kept.situation },
    slots: meta.slots, dropped: meta.dropped.map((x) => x.why),
    droppedRows: [...(cache.realCut?.dropped ?? []), ...droppedOneshot, ...droppedMem],
    cues: [...sitCues], situationEnabled: meta.situationEnabled,
    ...(budgetClamped.length ? { budgetClamped: [...budgetClamped] } : {}),
    relevance: dyn.trace, ...(dyn.trace.fallback ? { dropped: [...meta.dropped.map((x) => x.why), dyn.trace.fallback] } : {}),
  }
  // 情境块只在开启且有内容时并入 ⇒ 缺省（budgetChars=0）下**输出与开启前逐字节相同**（P3 验收）
  const finalText = sitTake.kept.length ? `${text}\n\n${sitTake.kept.join('\n')}` : text
  cache.text = finalText
  return finalText
}

export const backupThenWrite = (file: string, text: string): void => {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  try { writeFileSync(`${file}.bak-${stamp}`, readFileSync(file)) } catch { /* 首次写入前无备份 */ }
  writeFileSync(file, text, 'utf8')
}

interface ParsedView { flags: Record<string, boolean | string>; injection_level?: string; max_tokens?: number; caps_agent?: number; caps_user?: number; caps_memory?: number; idle_review_ms?: number; age_days?: number; archive_mode?: string; fixed_time?: string; merge_fpr?: number; merge_floor?: number; sessions_dir?: string; interval_hours?: number; embedding?: Record<string, string | number> }

/** 缩进栈解析：每行归一为带点路径（如 shoucang.injection.level），栈深即嵌套层级。 */
function scanPaths(text: string, visit: (path: string[], indent: number, value: string) => void): void {
  const stack: Array<{ indent: number; key: string }> = []
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue
    const m = raw.match(/^(\s*)([\w-]+):(\s*)(.*)$/)
    if (!m) continue
    const indent = m[1].length
    const value = m[4].split('#')[0].trim()
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    stack.push({ indent, key: m[2] })
    visit(stack.map((s) => s.key), indent, value)
  }
}

export const parseView = (text: string): ParsedView => {
  const out: ParsedView = { flags: {} }
  scanPaths(text, (path, _indent, value) => {
    if (!value) return
    const p = path.join('.')
    if (/^shoucang\.(archive|lifecycle|scheduler)\.enabled$/.test(p) && (value === 'true' || value === 'false')) {
      out.flags[`${p.split('.')[1]}.enabled`] = value === 'true'
      return
    }
    if (p === 'shoucang.injection.hot_memory' && (value === 'true' || value === 'false')) {
      out.flags['injection.hot_memory'] = value === 'true'
      return
    }
    if (p === 'shoucang.lifecycle.archive.apply_confirm' && (value === 'true' || value === 'false')) out.flags['lifecycle.archive.apply_confirm'] = value === 'true'
    if (p === 'shoucang.merge.enabled' && (value === 'true' || value === 'false')) out.flags['merge.enabled'] = value === 'true'
    if (p === 'shoucang.merge.fingerprint_threshold') out.merge_fpr = parseFloat(value) || undefined
    if (p === 'shoucang.idle.sessions_dir') out.sessions_dir = value.replace(/^['"]|['"]$/g, '')
    if (p === 'shoucang.lifecycle.interval_hours') { const n = parseFloat(value); if (!isNaN(n)) out.interval_hours = n } // 0 合法=禁用结算（falsy 修复）
    if (p === 'shoucang.merge.complement_floor') out.merge_floor = parseFloat(value) || undefined
    if (p === 'shoucang.injection.persona') out.flags['injection.persona'] = value.replace(/^['"]|['"]$/g, '')
    if (p === 'shoucang.injection.level') out.injection_level = value.replace(/^['"]|['"]$/g, '')
    // v16：板块容量上限（0 合法=不裁，显式 isNaN 检查防 falsy 丢失）；max_tokens 总预算已退役（2026-09-10）
    if (p === 'shoucang.injection.agent_max_chars') { const n = parseInt(value, 10); if (!isNaN(n)) out.caps_agent = n }
    if (p === 'shoucang.injection.user_max_chars') { const n = parseInt(value, 10); if (!isNaN(n)) out.caps_user = n }
    if (p === 'shoucang.injection.memory_max_chars') { const n = parseInt(value, 10); if (!isNaN(n)) out.caps_memory = n }
    if (p === 'shoucang.archive.idle_review_ms') { const n = parseInt(value, 10); if (!isNaN(n)) out.idle_review_ms = n } // 0 合法=禁用心跳（falsy 修复）
    if (p === 'shoucang.lifecycle.archive.age_days') out.age_days = parseFloat(value) || undefined
    if (p === 'shoucang.lifecycle.archive.mode') out.archive_mode = value.replace(/^['"]|['"]$/g, '')
    if (p === 'shoucang.lifecycle.archive.fixed_time') out.fixed_time = value.replace(/^['"]|['"]$/g, '')
    // 向量检索配置（召回面 · 2026-08-27）：embedding 服务自定义
    if (p.startsWith('shoucang.embedding.')) {
      const k = p.slice('shoucang.embedding.'.length)
      out.embedding = out.embedding || {}
      if (k === 'dimension') { const n = parseInt(value, 10); if (!isNaN(n)) out.embedding.dimension = n }
      else out.embedding[k] = value.replace(/^['"]|['"]$/g, '')
    }
  })
  return out
}

/** 在原文中翻转任意 `a.b.c=true|false` 布尔行（缩进栈定位，注释保留）。 */
export function flipBool(text: string, dottedKey: string): string | null {
  const lines = text.split(/\r?\n/)
  const stack: Array<{ indent: number; key: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^(\s*)([\w-]+):(\s*)(.*)$/)
    if (!head) continue
    const indent = head[1].length
    const value = head[4].split('#')[0].trim()
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    stack.push({ indent, key: head[2] })
    if (stack.map((s) => s.key).join('.') !== dottedKey || value === '') continue
    const vm = lines[i].match(/^(\s*)([\w-]+):(\s*)(true|false)(\s*(?:#.*)?)$/)
    if (!vm) return null
    lines[i] = `${vm[1]}${vm[2]}:${vm[3]}${vm[4] === 'true' ? 'false' : 'true'}${vm[5]}`
    return lines.join('\n')
  }
  return null
}

/** 设置标量（枚举/数值/布尔）：YAML 栈定位 dottedKey 行，替换值、保留注释与缩进 */
export function setKey(text: string, dottedKey: string, rawValue: string): string | null {
  const lines = text.split(/\r?\n/)
  const stack: Array<{ indent: number; key: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^(\s*)([\w-]+):(\s*)(.*)$/)
    if (!head) continue
    const indent = head[1].length
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    stack.push({ indent, key: head[2] })
    if (stack.map((s) => s.key).join('.') !== dottedKey) continue
    const tail = lines[i].match(/^(\s*)([\w-]+):(\s*)(.*?)(\s*#.*)?$/)
    if (!tail) return null
    const comment = tail[5] ?? ''
    lines[i] = `${tail[1]}${tail[2]}:${tail[3]}${rawValue}${comment}`
    return lines.join('\n')
  }
  return null
}

/* ── 本机向量端点判定（2026-09-11：不再写死 9915）─────────────────────────
 * 背景：原实现把「本机嵌入服务」硬编码为 `:9915`（自建 bge-m3 桥，曾由 nssm 托管）；
 * nssm 卸载 + 桥的 ONNX 模型资产被清后，本机改由 Ollama（11434，OpenAI 兼容）承载。
 * 判定改为「任意 127.0.0.1/localhost 基址 = 本机」，探测顺序：/health（自建桥）→ <base>/models（OpenAI 兼容：Ollama/LM Studio）→ /api/tags（Ollama 原生）。
 * **异步**探测（D-I4：原 `execFileSync` **同步阻塞宿主最长 12s** ⇒ 改异步；`/vector/status2` 已随之改 async handler）：
 */
export const isLocalBase = (baseUrl: string): boolean => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(String(baseUrl || '').trim())
export const probeLocalEmbed = async (baseUrl: string): Promise<{ ok: boolean; provider: string }> => {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  let origin = base
  try { origin = new URL(base).origin } catch { return { ok: false, provider: 'unreachable' } }
  const urls = [base + '/health', base + '/models', origin + '/api/tags']
  const probe = `(async()=>{for(const x of ${JSON.stringify(urls)}){try{const r=await fetch(x,{signal:AbortSignal.timeout(2500)});if(r.ok){console.log(JSON.stringify({ok:true,url:x,body:(await r.text()).slice(0,200)}));return}}catch(e){}}console.log(JSON.stringify({ok:false}))})()`
  try {
    const env2: Record<string, string | undefined> = { ...process.env, NODE_OPTIONS: '' }
    const r = await runProcAsync('node', ['-e', probe], { timeoutMs: 12000, env: env2 as NodeJS.ProcessEnv })
    const j = JSON.parse(String(r.out).trim()) as { ok?: boolean; url?: string; body?: string }
    if (!j.ok) return { ok: false, provider: 'unreachable' }
    const hit = String(j.url || '')
    // ① 自建桥 /health 自带 provider（如 DmlExecutionProvider）；②/③ 本机 OpenAI 兼容（Ollama /v1/models、LM Studio）或 Ollama 原生 → gpu-ready（=「本机就绪」，沿用 UI 既有词表）
    if (hit.endsWith('/health')) {
      try { return { ok: true, provider: (JSON.parse(String(j.body)) as { provider?: string }).provider || 'local' } } catch { return { ok: true, provider: 'local' } }
    }
    return { ok: true, provider: 'gpu-ready' }
  } catch { return { ok: false, provider: 'unreachable' } }
}
