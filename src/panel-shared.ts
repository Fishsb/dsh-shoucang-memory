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
import { execFileSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SURFACE } from './criteria.generated.js'
import { dshHome, knowledgeRoot, profileCarrierSet, indexRowInLayer, recallIndex } from './targets.js'

export interface RootEntry { id: string; name: string; path: string }
export interface PanelState { roots: RootEntry[]; active: string | null }
export interface RouteRegistry {
  register(route: { kind: 'exact' | 'prefix'; path: string; handler(req: IncomingMessage, res: ServerResponse): void }): () => void
}
export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void
export type RouteFn = (sub: string, handler: RouteHandler) => void
/** 日志窄接口：领域模块只许看日志，不许抱着整个 host ctx。 */
export interface PanelLogger { info?(s: string): void; warn?(s: string): void }
export interface StateStore { load(): PanelState; save(s: PanelState): void }
export interface RootAccess { activeRootOf(): RootEntry | null; configFileOf(): string | null }
export interface SuiteConfigAccess { read(): Record<string, unknown>; write(o: Record<string, unknown>): void }
export interface HotMemoryDeps { suite: SuiteConfigAccess; root: RootAccess }
export interface HotMemoryCache { key: string | null; at: number; text: string }
export interface HotMemory { build(query?: string): string; invalidate(): void }
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

export async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
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
  const route = (sub: string, handler: RouteHandler): void => {
    const path = `/api/shoucang-panel${sub}`
    if (registeredPaths.has(path)) {
      // 兜底：同一路径只允许注册一次（GET/POST 需在同一 handler 内按 method 分发），
      // 否则宿主抛 duplicate route → 插件树整体加载失败。此处告警降级而非让插件起不来。
      logger.warn?.(`[shoucang] 路由重复注册已忽略：${path}（请合并到同一 handler 按 method 分发）`)
      return
    }
    registeredPaths.add(path)
    disposers.push(webServer.register({ kind: 'exact', path, handler }))
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
export function createSuiteConfig(): SuiteConfigAccess {
  const fileOf = (): string => join(dshHome(), 'suite', 'scheduler.json')
  return {
    read: (): Record<string, unknown> => {
      try {
        const f = fileOf()
        if (!existsSync(f)) return {}
        const raw = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
        return raw && typeof raw === 'object' ? raw : {}
      } catch { return {} }
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
// 路线② 晨起摘要读取：深睡 delta（suite/knowledge/delta.md，≤3 行，48h 有效；delta 永非事实源，过期即弃）
const readDawnDelta = (personaMode: string): string => {
  if (personaMode === 'off') return ''
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
  const env = process.env.MEMORY_ROOT?.trim()
  return env || join(dshHome(), 'skills', 'managing-memory')
}

/* ── R1 热记忆注入：画像+记忆指针行，每轮注入（依赖 2 个：suite / root） ──
 * ⚠ createHotMemory 只做「持有缓存 + 返回句柄」；选行实现在模块级 buildHotMemoryText。
 *   把 154 行实现塞进工厂 = 实现又寄生回入口，正是 audit-wiring I1 要拦的形态（本轮实测被判 159 行）。 */
export function createHotMemory(d: HotMemoryDeps): HotMemory {
  // 缓存键含「任务文本」：相关性选行随任务变化，仅按 root 缓存会让同一会话内永不更新（2026-09-10 ACT-027）
  const cache: HotMemoryCache = { key: null, at: 0, text: '' }
  return {
    build: (query = '') => buildHotMemoryText(d, cache, query),
    invalidate: () => { cache.at = 0 },
  }
}

function buildHotMemoryText(d: HotMemoryDeps, cache: HotMemoryCache, query = ''): string {
  const now = Date.now()
  const memRoot = memoryRootOf()
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const cacheKey = memRoot + '|' + q
  if (cache.key === cacheKey && now - cache.at < 30000) return cache.text
  cache.key = cacheKey
  cache.at = now
  let level = 'smart'
  let hotMemoryOn = true
  let personaMode = 'both'
  // P1-2（2026-09-10）：注入配置作用域迁全局——优先读 ~/.dsh/suite/scheduler.json 的 injection 键，
  // 回落 root config YAML（旧配置兼容），都无 → 缺省。切 root 不再影响注入（与记忆/蒸馏同域）。
  // 注：板块上限（caps）2026-09-10 起为「记忆库容量门」（写门用），不再裁注入——注入总看完整画像+记忆
  const sched = (() => { try { return d.suite.read() } catch { return {} } })()
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
      return idx.concat(prof.slice(-opts.maxProfile)) // 写侧 append 在节尾 ⇒ 取最近 N 条
    } catch { return [] }
  }
  const readIdx = (name: string): string[] => readCarrier(name)
  const profileCap = Number(sched.injectProfileRows ?? 3) || 0 // v2.2：P 层画像行每档上限（缺省 3；0=回滚）
  const rowCaps: Record<string, number> = { ...SURFACE.injection.levelCaps } // B 档：档位行数上限读注册表（surface.injection.levelCaps）
  const userLines = personaMode === 'off' || personaMode === 'me' ? [] : readCarrier('USER.md', { profile: true, maxProfile: profileCap })
  const agentLines = personaMode === 'off' || personaMode === 'you' ? [] : readCarrier('AGENT.md', { profile: true, maxProfile: profileCap })
  // 知识索引行选行（ACT-027）：相关性 top-k（复用 recallIndex，单一实现）∪ 新鲜度保证槽（末尾 N 条）
  const cap = rowCaps[level] ?? 10
  const allMem = readIdx('MEMORY.md')
  // v8（认知对照 P1「降权贯穿三通道」+「复习-强化」）注入侧的冷热感知 + 命中次权重。
  //   R6 审查项：**回退分支也要生效**——否则 `injectRelevance=false` 或空 query 时「降权贯穿三通道」实际只剩两通道。
  let actMap = new Map<string, { cold: boolean; hits30: number }>()
  try {
    for (const l of readFileSync(join(memRoot, 'audit', 'activity.jsonl'), 'utf8').split(/\r?\n/)) {
      if (!l.trim()) continue
      try {
        const o = JSON.parse(l) as { f?: string; s?: string; status?: string; hits30?: number; retired?: boolean }
        const f = String(o.f || '').replace(/^notes\//, '')
        const s = String(o.s || '').trim().toLowerCase()
        if (f && s) actMap.set(`${f}::${s}`, { cold: String(o.status) === 'cold' || !!o.retired, hits30: Number(o.hits30 || 0) })
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 无 activity.jsonl = 不感知（保持旧行为） */ }
  const rowWeight = (l: string): { cold: boolean; hits30: number } => {
    const fm = (l.match(/notes\/([A-Za-z0-9_-]+)\.md/) || [])[1] || ''
    const tail = l.split('→').pop() || ''
    let cold = false
    let hits = 0
    for (const m of tail.matchAll(/§([^/→]+)/g)) {
      const s = String(m[1]).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim().toLowerCase()
      const e = actMap.get(`${fm}::${s}`) || actMap.get(`${fm}.md::${s}`)
      if (!e) continue
      if (e.cold) cold = true
      hits = Math.max(hits, e.hits30)
    }
    return { cold, hits30: hits }
  }
  // 回退基线 = 位置式前 N 行，但**冷行稳定后置**（组内原序不变，故仍属"位置式"）
  let memLines = [...allMem]
    .sort((a, b) => (rowWeight(a).cold ? 1 : 0) - (rowWeight(b).cold ? 1 : 0))
    .slice(0, cap)
  const relOn = (() => { try { return d.suite.read().injectRelevance !== false } catch { return true } })()
  // ⚠ 2026-09-11（缺陷1 修复的**连带回归**，同日发现并修复）：此处原为 `if (q && relOn && allMem.length)`。
  //   `allMem.length` 是「MEMORY.md 不存在/全空则不必走召回」的早退守卫，**写于 allMem 尚未分层过滤的年代**。
  //   分层过滤后 allMem 只剩 P/always 行，而真实库 MEMORY.md 的 48 条索引行**全是 E 层 gated**
  //   ⇒ allMem 恒为空 ⇒ 守卫恒假 ⇒ 相关性通道（契约指定的 gated 渲染器）**永不执行**，
  //   gated 载体有无查询都无法在注入面现身——这正是 A6 断言要拦的「过度过滤」退化
  //   （A6 夹具的 MEMORY.md 含 P 层行 ⇒ allMem 非空 ⇒ 守卫通过 ⇒ 断言假绿，未能发现）。
  //   去掉该条件后：`recallIndex` 对空库自然返回空 rows，且下方 `if (picked.length)` 兜底，语义不变。
  if (q && relOn) {
    const fresh = Math.max(0, Math.min(
      Number((() => { try { return d.suite.read().injectFreshSlots } catch { return undefined } })()) || 2, cap))
    const picked: string[] = []
    try {
      // 相关性通道**不限层**：它本身就是契约指定的 gated 渲染器（`gated:index` → recallIndex/recallRanked
      //   「按任务型/相关性选择」）。故 R/E 行可在此**按需**出现（且受 cap 约束），
      //   与「位置式基线/新鲜度槽恒定铺开」是两回事——被修掉的正是后者。
      const { rows } = recallIndex(memRoot, q, cap, 'all')
      for (const r of rows) if (r.file === 'MEMORY.md' && !picked.includes(r.line)) picked.push(r.line)
    } catch { /* 召回异常=保持位置式回退 */ }
    for (const l of allMem.slice(Math.max(0, allMem.length - fresh))) if (!picked.includes(l)) picked.push(l)
    // 槽位不足时用**位置式基线**补齐：防「短指令（如"继续"）零命中」导致知识行从 cap 缩到 fresh 的信息损失。
    // 三者叠加 = 相关性 ∪ 新鲜度 ∪ 基线覆盖，任一维度都不牺牲。
    // v8 补位顺序（actMap/rowWeight 见上方回退分支）：cold 降末段、hits30 高者先占槽——**只改补位顺序**，不改前两档语义
    const rest = allMem.filter((l) => !picked.includes(l))
    rest.sort((a, b) => {
      const A = rowWeight(a)
      const B = rowWeight(b)
      if (A.cold !== B.cold) return A.cold ? 1 : -1
      return B.hits30 - A.hits30
    })
    for (const l of rest) { if (picked.length >= cap) break; picked.push(l) }
    if (picked.length) memLines = picked.slice(0, cap)
  }
  if (!userLines.length && !agentLines.length && !memLines.length) { cache.text = ''; return '' }
  const lines: string[] = [`[守藏·热记忆] 记忆库指针（${memRoot}；详情按指针 get_file 拉对应 notes §小节）：`]
  if (agentLines.length) {
    lines.push('agent 画像（AGENT.md；含 [原则]/[路径] 与成长画像行 `← 源:`——①③步优先读）：')
    for (const l of agentLines) lines.push(/^-\s/.test(l) ? l : `- ${l}`)
  }
  if (userLines.length) {
    lines.push('用户画像（USER.md）：')
    for (const l of userLines) lines.push(/^-\s/.test(l) ? l : `- ${l}`)
  }
  if (memLines.length) {
    lines.push(`知识索引（MEMORY.md，热取前 ${memLines.length} 条）：`)
    for (const l of memLines) lines.push(`- ${l}`)
  }
  // 2026-09-10 用户拍板：去掉总预算（max_tokens）裁切——注入内容=双画像+记忆指针（薄行），
  // 由各板块字符上限（caps）独立控制；delta 晨起摘要直接前置（内容极少，不需预算预留）
  const deltaText = readDawnDelta(personaMode)
  let text = lines.join('\n')
  if (deltaText) text = deltaText + '\n' + text
  cache.text = text
  return text
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
 * 同步探测（execFileSync 子进程）：/vector/status2 是同步 handler，且清 NODE_OPTIONS 防 inspector 残留干扰。
 */
export const isLocalBase = (baseUrl: string): boolean => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(String(baseUrl || '').trim())
export const probeLocalEmbed = (baseUrl: string): { ok: boolean; provider: string } => {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  let origin = base
  try { origin = new URL(base).origin } catch { return { ok: false, provider: 'unreachable' } }
  const urls = [base + '/health', base + '/models', origin + '/api/tags']
  const probe = `(async()=>{for(const x of ${JSON.stringify(urls)}){try{const r=await fetch(x,{signal:AbortSignal.timeout(2500)});if(r.ok){console.log(JSON.stringify({ok:true,url:x,body:(await r.text()).slice(0,200)}));return}}catch(e){}}console.log(JSON.stringify({ok:false}))})()`
  try {
    const env2: Record<string, string | undefined> = { ...process.env, NODE_OPTIONS: '' }
    const r = execFileSync('node', ['-e', probe], { encoding: 'utf8', timeout: 12000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: env2 as NodeJS.ProcessEnv })
    const j = JSON.parse(String(r).trim()) as { ok?: boolean; url?: string; body?: string }
    if (!j.ok) return { ok: false, provider: 'unreachable' }
    const hit = String(j.url || '')
    // ① 自建桥 /health 自带 provider（如 DmlExecutionProvider）；②/③ 本机 OpenAI 兼容（Ollama /v1/models、LM Studio）或 Ollama 原生 → gpu-ready（=「本机就绪」，沿用 UI 既有词表）
    if (hit.endsWith('/health')) {
      try { return { ok: true, provider: (JSON.parse(String(j.body)) as { provider?: string }).provider || 'local' } } catch { return { ok: true, provider: 'local' } }
    }
    return { ok: true, provider: 'gpu-ready' }
  } catch { return { ok: false, provider: 'unreachable' } }
}
