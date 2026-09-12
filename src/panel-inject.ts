/**
 * @dsh-external/shoucang-panel / inject — 注入与写回领域（热记忆注入挂点 + 向量 + 记忆写端点）。
 * 端点：GET /inject/preview · /inject/stats · /vector/status2 · /vector/cache/clear ·
 *      GET+POST /embed/config · POST /embed/test ·
 *      POST /memory/section-edit · /memory/edit · /memory/remove · /memory/approve
 *      + /scnote 命令 + systemPrompt 注入挂点（须挂 ctx.effect）
 * 依赖窄传：7 个；ctx 另传（只有 effect/systemPrompt 挂点需要宿主上下文）。
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from 'cordis'
import { knowledgeRoot, memoryLibRoot } from './targets.js'
import { clearVecCache, vecStats } from './vec.js'
import { isLocalBase, parseView, probeLocalEmbed, readBody, sendJson } from './panel-shared.js'
import type { HotMemory, InjectMeta, PanelLogger, RootAccess, RouteFn, SuiteConfigAccess } from './panel-shared.js'

export interface InjectDeps {
  route: RouteFn
  disposers: Array<() => void>
  root: RootAccess
  hot: HotMemory
  injectMeta: InjectMeta
  suite: SuiteConfigAccess
  logger: PanelLogger
}

// ── 空闲巩固轮（Letta-heartbeat 模式 · 2026-08-27）：蒸馏/合并/归档/结算 一体化 ──
const _cfgOf = (d: InjectDeps): { cfg: ReturnType<typeof parseView>; file: string } | null => {
  const f = d.root.configFileOf(); if (!f || !existsSync(f)) return null
  try { return { cfg: parseView(readFileSync(f, 'utf8')), file: f } } catch { return null }
}

// U1：/embed/config —— 向量 provider 持久通道（GET 展示 persisted ／ POST 校验写入 scheduler.json）
// 同 /deepsleep/config：GET 与 POST 合并同一 handler 按 method 分发（宿主按路径去重，拆分注册会拖垮插件树）。
const EMBED_CONFIG_KEYS = ['embedEnabled', 'embedBaseUrl', 'embedModel', 'embedApiKeyEnv']

const validateEmbedConfig = (patch: Record<string, unknown>): string | null => {
  if ('embedEnabled' in patch && typeof patch.embedEnabled !== 'boolean') return 'embedEnabled must be boolean'
  if ('embedBaseUrl' in patch && typeof patch.embedBaseUrl !== 'string') return 'embedBaseUrl must be string'
  if ('embedModel' in patch && typeof patch.embedModel !== 'string') return 'embedModel must be string'
  if ('embedApiKeyEnv' in patch && typeof patch.embedApiKeyEnv !== 'string') return 'embedApiKeyEnv must be string'
  return null
}

// U2（2026-09-09，ui-impl-plan）：记忆写端点（编辑/删除/批准）——全部走既有门禁：
//   edit/remove → 临时文件整改 → memory_write_gate（exit 0 才 rename；失败回滚不落盘）
//   approve → 候选移 .processed（确认有价值，内容由蒸馏正常入册；候选无结构化小节不强行归纳）
// 安全网：file 白名单 + 前端 confirm（remove）+ write_gate 备份。用户显式触发，非热路径。
const NOTE_WRITE_RELS = ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent']

// 7 件（INDEX 禁写）
const isWritable = (file: string): boolean => {
  if (file === 'MEMORY.md' || file === 'USER.md' || file === 'AGENT.md') return true
  return NOTE_WRITE_RELS.includes(String(file).replace(/^notes[\\/]/, '').replace(/\.md$/, ''))
}

/** 写门前置（2026-09-11 修复：原 execFileSync 在慢门禁下阻塞宿主事件循环最长 30s → 改异步 execFile） */
const gateWrite = (target: string, tmpPath: string): Promise<{ ok: boolean; reason?: string; out?: string }> =>
  new Promise((done) => {
    const gate = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs')
    if (!existsSync(gate)) return done({ ok: false, reason: 'write_gate 未就位' })
    execFile(
      'node',
      [gate, target, tmpPath],
      { encoding: 'utf8', timeout: 30000, windowsHide: true, env: { ...process.env, MEMORY_ROOT: memoryLibRoot() } },
      (err, stdout, stderr) => {
        if (!err) return done({ ok: true, out: String(stdout) })
        const code = (err as { code?: number | string }).code
        done({ ok: false, reason: `gate exit=${code ?? '?'}`, out: String(stderr || (err as Error).message || '') })
      },
    )
  })

/** v2（ADR-122）：面板写入后的库 git 快照（best-effort；不动写门语义，失败静默） */
const snapshotBank = (): void => {
  try {
    const script = join(memoryLibRoot(), 'scripts', 'bank-git.mjs')
    if (!existsSync(script)) return
    execFile('node', [script, '--message', `memory: panel-write @ ${new Date().toISOString().slice(0, 19)}`],
      { env: { ...process.env, MEMORY_ROOT: memoryLibRoot() }, windowsHide: true, timeout: 20000 },
      () => { /* 静默 */ })
  } catch { /* 静默 */ }
}

const readMemFile = (file: string): { text: string | null; abs: string } => {
  const abs = join(memoryLibRoot(), file)
  try { return { text: readFileSync(abs, 'utf8'), abs } } catch { return { text: null, abs } }
}

const writeMemViaGate = async (file: string, nextText: string): Promise<{ ok: boolean; reason?: string; out?: string }> => {
  const abs = join(memoryLibRoot(), file)
  const tmp = abs + '.ui-tmp'
  try { writeFileSync(tmp, nextText, 'utf8') } catch (e) { return { ok: false, reason: 'tmp write fail: ' + String((e as Error).message).slice(0, 80) } }
  const g = await gateWrite(file, tmp)
  if (g.ok) { try { renameSync(tmp, abs); return { ok: true, out: g.out || '' } } catch (e) { return { ok: false, reason: 'rename fail: ' + String((e as Error).message).slice(0, 80) } } }
  try { unlinkSync(tmp) } catch { /* 清理失败无害 */ }
  return g
}

function vectorStatus2Route(d: InjectDeps, _req: IncomingMessage, res: ServerResponse): void {
try {
  const p = d.suite.read() as Record<string, unknown>
  // 缺省语义对齐 scheduler.Config：embedEnabled 缺省 true、本地 bge-m3（无键=缺省开）
  const enabled = p.embedEnabled === false ? false : true
  const baseUrl = String((p as { embedBaseUrl?: unknown }).embedBaseUrl || 'http://127.0.0.1:11434/v1')
  const model = String((p as { embedModel?: unknown }).embedModel || 'bge-m3')
  const apiKeyEnv = String((p as { embedApiKeyEnv?: unknown }).embedApiKeyEnv || 'EMBED_API_KEY')
  const running = { enabled, baseUrl, model, apiKeyEnv }
  // 探测本机服务 → provider 标签（子进程清 NODE_OPTIONS 防 inspector 残留干扰）
  let provider = 'off', localOk = false
  const local = isLocalBase(baseUrl)
  if (enabled && local) {
    const p2 = probeLocalEmbed(baseUrl)
    provider = p2.provider
    localOk = p2.ok
  } else if (enabled) provider = 'cloud'
  // 缓存统计
  let cacheLines = 0, cacheKB = 0
  try { const f = join(knowledgeRoot(), '.vector-cache.jsonl'); if (existsSync(f)) { const st = statSync(f); cacheKB = Math.round(st.size / 1024); cacheLines = readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length } } catch { /* 无缓存 */ }
  const stats = { queries: vecStats.queries, lastMode: vecStats.lastMode, lastMs: vecStats.lastMs, lastAt: vecStats.lastAt, lastQuery: vecStats.lastQuery, lastHit: vecStats.lastHit }
  sendJson(res, 200, { ok: true, running, persisted: p, provider, localOk, cache: { lines: cacheLines, kb: cacheKB }, stats })
} catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function embedConfigRoute(d: InjectDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
try {
  if (req.method === 'POST') {
    const body = (await readBody(req).catch(() => ({}))) as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    for (const k of EMBED_CONFIG_KEYS) if (k in body) patch[k] = body[k]
    if (!Object.keys(patch).length) return sendJson(res, 400, { error: 'no-embed-keys' })
    const err = validateEmbedConfig(patch)
    if (err) return sendJson(res, 400, { error: err })
    const merged = { ...d.suite.read(), ...patch }
    d.suite.write(merged)
    d.logger.info?.(`[shoucang] embed config updated: ${Object.keys(patch).join(',')}（重载后生效）`)
    return sendJson(res, 200, { ok: true, merged, reloadRequired: true })
  }
  sendJson(res, 200, { persisted: d.suite.read() })
} catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function embedTestRoute(d: InjectDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
try {
  const body = (await readBody(req).catch(() => ({}))) as { baseUrl?: string; apiKey?: string }
  const raw = String(body.baseUrl || '').trim().replace(/\/+$/, '')
  if (!raw) return sendJson(res, 400, { error: 'baseUrl required' })
  let parsed: URL
  try { parsed = new URL(raw) } catch { return sendJson(res, 200, { models: [], error: 'URL 无效（需含 http:// 或 https://）' }) }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return sendJson(res, 200, { models: [], error: '仅支持 http/https' })
  // 宿主进程全局 fetch 被 DSH patch（实测 11434 经 fetch 不通、node:http 通）——
  // /embed/test 用 node:http/https 模块直连（不依赖 fetch），规避宿主 fetch 层限制。
  const key = String(body.apiKey || '').trim()
  const t0 = Date.now()
  const fin = (models: Array<{ id: string; name?: string }>, error: string | null, extra: Record<string, unknown> = {}) =>
    sendJson(res, 200, { baseUrl: raw, models, error, latencyMs: Date.now() - t0, ...extra })
  const httpGet = async (url: string, withAuth: boolean): Promise<{ status: number; body: string }> => {
    let target: URL
    try { target = new URL(url) } catch { return { status: 0, body: 'bad url' } }
    const lib = target.protocol === 'https:' ? 'https' : 'http'
    const mod = await import(lib) as typeof import('node:http')
    return new Promise((resolve) => {
      const headers: Record<string, string> = {}
      if (withAuth && key) headers.Authorization = `Bearer ${key}`
      const req = mod.get(target, { headers, timeout: 6000 }, (res) => {
        let d = ''
        res.on('data', (c: Buffer) => { d += c.toString() })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: d.slice(0, 200000) }))
      })
      req.on('error', () => resolve({ status: 0, body: 'network error' }))
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
    })
  }
  // ① OpenAI 兼容枚举（GET {base}/models；base 已含 /v1 时不再重复拼接——2026-09-11 修：原实现恒拼 `raw + '/v1/models'`，
  //    而 UI 预设与 vec.ts 用的 baseUrl 形如 `http://127.0.0.1:11434/v1` ⇒ 实际请求 `/v1/v1/models` 恒 404，Ollama 枚举静默失效）
  const modelsUrl = /\/v1$/.test(raw) ? raw + '/models' : raw + '/v1/models'
  try {
    const r = await httpGet(modelsUrl, true)
    if (r.status >= 200 && r.status < 300) {
      let j: { data?: Array<{ id: string }> } = {}
      try { j = JSON.parse(r.body) as { data?: Array<{ id: string }> } } catch { /* 非 JSON */ }
      const models = (j.data || []).map((m) => ({ id: m.id, name: m.id }))
      if (models.length) return fin(models, null, { mode: 'openai-compatible' })
      return fin(models, null, { mode: 'openai-compatible', empty: true })
    }
    if (r.status !== 404 && r.status !== 0) return fin([], `服务不可达（HTTP ${r.status}）`, { mode: 'openai-compatible' })
  } catch { /* 404/网络错 → health 降级 */ }
  // ② 无 /v1/models → 降级 /health（bge 类自建服务）
  try {
    const r = await httpGet(raw.replace(/\/v1$/, '') + '/health', false)
    if (r.status >= 200 && r.status < 300) {
      let j: { model?: string; dims?: number } = {}
      try { j = JSON.parse(r.body) as { model?: string; dims?: number } } catch { /* */ }
      return fin([], null, { mode: 'health-fixed', fixedModel: j.model || 'bge-m3', dims: j.dims, hint: '服务在但无 /models——用固定模型 ' + (j.model || 'bge-m3') })
    }
    return fin([], '服务不可达（/v1/models 与 /health 均无响应）', { mode: 'health' })
  } catch { return fin([], '服务不可达（网络错误）', { mode: 'none' }) }
} catch (e) { sendJson(res, 500, { error: String(e) }) }
}

function vectorCacheClearRoute(d: InjectDeps, _req: IncomingMessage, res: ServerResponse): void {
try {
  const r = clearVecCache()
  d.hot.invalidate() // 缓存清理后召回将重建，注入无关但保持缓存策略一致
  sendJson(res, 200, r)
} catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function memorySectionEditRoute(d: InjectDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
try {
  const body = (await readBody(req).catch(() => ({}))) as { rel?: string; section?: string; newBody?: string }
  const rel = String(body.rel || '').trim().replace(/\\/g, '/')
  const section = String(body.section || '').trim()
  const newBody = String(body.newBody || '').trim()
  if (!isWritable(rel)) return sendJson(res, 400, { error: 'rel not writable: ' + rel })
  if (!section) return sendJson(res, 400, { error: 'section required' })
  if (!newBody) return sendJson(res, 400, { error: 'newBody required' })
  const { text } = readMemFile(rel)
  if (text == null) return sendJson(res, 404, { error: 'file not found: ' + rel })
  const lines = text.split(/\r?\n/)
  const normTitle = (s: string): string => s.replace(/^#+\s*/, '').replace(/\s+/g, '')
  const headIdx = lines.findIndex((l) => /^#{2,4}\s+/.test(l) && normTitle(l) === normTitle(section))
  if (headIdx < 0) return sendJson(res, 404, { error: 'section not found: ' + section })
  const level = (lines[headIdx].match(/^#+/) || ['##'])[0].length
  let endIdx = lines.length
  for (let i = headIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/)
    if (m && m[1].length <= level) { endIdx = i; break }
  }
  const out = [...lines.slice(0, headIdx), lines[headIdx], '', ...newBody.split(/\r?\n/), '', ...lines.slice(endIdx)]
  // 折叠连续空行（正文块前后各留一空行即可）
  const folded: string[] = []
  for (const l of out) { if (l.trim() === '' && folded.length && folded[folded.length - 1].trim() === '') continue; folded.push(l) }
  const r = await writeMemViaGate(rel, folded.join('\n'))
  if (!r.ok) return sendJson(res, 400, { error: r.reason, detail: (r.out || '').slice(0, 300) })
  d.hot.invalidate()
  snapshotBank() // v2：库 git 快照（面板写后；best-effort）
  return sendJson(res, 200, { ok: true })
} catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function memoryEditRoute(d: InjectDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
try {
  const body = (await readBody(req).catch(() => ({}))) as { file?: string; line?: string; newText?: string }
  const file = String(body.file || '').trim()
  const oldLine = String(body.line || '').trim()
  const newText = String(body.newText || '').trim()
  if (!isWritable(file)) return sendJson(res, 400, { error: 'file not writable: ' + file })
  if (!oldLine) return sendJson(res, 400, { error: 'line required' })
  const { text } = readMemFile(file)
  if (text == null) return sendJson(res, 404, { error: 'file not found' })
  const lines = text.split(/\r?\n/)
  const normOld = oldLine.replace(/\s+/g, '')
  const idx = lines.findIndex((l) => l.trim() === oldLine || l.replace(/\s+/g, '') === normOld)
  if (idx < 0) return sendJson(res, 404, { error: 'line not found (可能已被修改，请刷新)' })
  lines[idx] = newText || oldLine
  const r = await writeMemViaGate(file, lines.join('\n'))
  if (!r.ok) return sendJson(res, 400, { error: r.reason, detail: (r.out || '').slice(0, 300) })
  d.hot.invalidate()
  snapshotBank() // v2：库 git 快照（面板写后；best-effort）
  return sendJson(res, 200, { ok: true })
} catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function memoryRemoveRoute(d: InjectDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
try {
  const body = (await readBody(req).catch(() => ({}))) as { file?: string; line?: string }
  const file = String(body.file || '').trim()
  const oldLine = String(body.line || '').trim()
  if (!isWritable(file)) return sendJson(res, 400, { error: 'file not writable' })
  if (!oldLine) return sendJson(res, 400, { error: 'line required' })
  const { text } = readMemFile(file)
  if (text == null) return sendJson(res, 404, { error: 'file not found' })
  const lines = text.split(/\r?\n/)
  const before = lines.length
  const kept = lines.filter((l) => l.trim() !== oldLine)
  if (kept.length === before) return sendJson(res, 404, { error: 'line not found' })
  const r = await writeMemViaGate(file, kept.join('\n'))
  if (!r.ok) return sendJson(res, 400, { error: r.reason, detail: (r.out || '').slice(0, 300) })
  d.hot.invalidate()
  snapshotBank() // v2：库 git 快照（面板写后；best-effort）
  return sendJson(res, 200, { ok: true })
} catch (e) { sendJson(res, 500, { error: String(e) }) }
}

async function memoryApproveRoute(d: InjectDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
try {
  const body = (await readBody(req).catch(() => ({}))) as { pendingFile?: string }
  const pf = String(body.pendingFile || '').trim().replace(/^.*[\\/]/, '')
  if (!/^[\w\u4e00-\u9fa5-]+\.md$/.test(pf)) return sendJson(res, 400, { error: 'bad pending file' })
  // 双区支持：优先 flow-candidates（待转正候选），其次根 pending
  const pendRoot = join(knowledgeRoot(), 'pending')
  let src = join(pendRoot, 'flow-candidates', pf)
  let zone = 'flow-candidates'
  if (!existsSync(src)) { src = join(pendRoot, pf); zone = 'pending' }
  if (!existsSync(src)) return sendJson(res, 404, { error: 'candidate not found' })
  // approved 移区（与蒸馏成功处理一致：.processed 子目录，蒸馏采集不递归不回流）
  const procDir = zone === 'flow-candidates' ? join(pendRoot, 'flow-candidates', '.processed') : join(pendRoot, '.processed')
  try { mkdirSync(procDir, { recursive: true }); renameSync(src, join(procDir, pf)) } catch (e) { return sendJson(res, 500, { error: 'move fail: ' + String((e as Error).message).slice(0, 100) }) }
  return sendJson(res, 200, { ok: true, moved: zone + '/.processed/' + pf })
} catch (e) { sendJson(res, 500, { error: String(e) }) }
}

function registerVectorRoutes(d: InjectDeps): void {
  d.route('/vector/status2', (req, res) => vectorStatus2Route(d, req, res))
  d.route('/embed/config', async (req, res) => embedConfigRoute(d, req, res))
  d.route('/embed/test', async (req, res) => embedTestRoute(d, req, res))
  d.route('/vector/cache/clear', (req, res) => vectorCacheClearRoute(d, req, res))
}

function registerMemoryWriteRoutes(d: InjectDeps): void {
  d.route('/memory/section-edit', async (req, res) => memorySectionEditRoute(d, req, res))
  d.route('/memory/edit', async (req, res) => memoryEditRoute(d, req, res))
  d.route('/memory/remove', async (req, res) => memoryRemoveRoute(d, req, res))
  d.route('/memory/approve', async (req, res) => memoryApproveRoute(d, req, res))
}

/* ---------- /scnote 命令：任务执行并整理为笔记文档（2026-08-27） ---------- */

const scnoteReply = (raw: string): { kind: 'success' | 'error'; text: string } => {
  const task = (raw || '').trim()
  if (!task || task.startsWith('help') || task === '?') {
    return { kind: 'error', text: '用法：/scnote <任务描述>\n示例：/scnote 调研 DeepSeek V4 能力边界\n调用后本回合以“笔记化”方式执行任务，结束前把执行过程整理为 笔记/ 文档。' }
  }
  return {
    kind: 'success',
    text: [
      '【守藏·笔记化任务】已进入笔记化执行模式。',
      '',
      `任务：${task}`,
      '',
      '执行要求：',
      '0. 合规红线：本任务所有写入必须遵循目标目录 `_index.md` 的「目录文件规范」段——它是该目录的格式权威（frontmatter/命名/正文/维护）；**先读取目标目录 `_index.md` 再执行**；',
      '1. 执行任务（网络检索类优先 web_search/advanced_search + read_page 读原文并注明来源）；',
      '2. 任务完成后，把本次执行过程整理为一篇笔记文档（按 笔记/_index.md 与目标目录 _index.md 的规范）：',
      '   - 落位：笔记/<域>/（冷层·蒸馏来源；不符现有域 → **扩展目录类型须先网络检索**（web_search/read_page）补全新子目录 _index.md 的「目录文件规范」块，复用归档检索扩容方式 `index_rules.py --ensure-researched 笔记 <域> --summary <检索结论>`，然后建目录+登记父 `笔记/_index.md`（备份先行、幂等）；**禁止不检索直接扩展**）',
      '   - 文件：type: note；name 主-宾-谓 kebab-case；frontmatter 必含 type/name/title/tags/source/created/updated/description（与目标 _index.md 规范一致）',
      '   - 正文：自己的话提炼、单主题、来源归因（列出本次检索到的链接）、≥150 字；必做双链 [[wiki-link]]（与相关记忆/画像条目互链）',
      '   - 维护：目录指针表由写门自动投影（落库后 `_meta/gen_pointer_tables.py` 重建目标目录 _index 索引区），**无需手工登记指针行**；',
      '   - **合并写门（合并去重设计-v1）**：落库前先运行 `python _meta/merge_check.py <落库文件> --dir <目标目录> --apply` —— 重复→并入既有条目（不新建）、改版/矛盾→时序 supersede（旧条目标记不删）、无命中→正常新建；落库后写门自动投影指针（无需再登记）',
      '3. 完成后回复：笔记相对路径 + 一句摘要 + 来源链接数。',
    ].join('\n'),
  }
}

function injectPreviewRoute(d: InjectDeps, req: IncomingMessage, res: ServerResponse): void {
  let q = ''
  try { q = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('q') ?? '' } catch { q = '' }
  sendJson(res, 200, { text: d.hot.build(q), q })
}

function injectStatsRoute(d: InjectDeps, _req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { calls: d.injectMeta.calls, lastAt: d.injectMeta.lastAt ? new Date(d.injectMeta.lastAt).toISOString() : null, root: d.root.activeRootOf()?.path ?? null })
}

/** systemPrompt 注入挂点（每轮渲染，指针缓存 30s）；systemPrompt 不可用时降级告警。 */
function mountHotMemoryInjection(ctx: Context, d: InjectDeps): void {
  // 注册 systemPrompt 注入块（每轮渲染，指针缓存 30s）
  const sp = (ctx as unknown as { systemPrompt?: { context?(opts: unknown): () => void } }).systemPrompt
  if (sp && typeof sp.context === 'function') {
    // 任务文本：`dsh-system-prompt:346` 会把 assembly context 传给 text 回调，其中含 `context.agent.session`；
    // 取最近一条 user/message 作相关性 query。
    // ⚠ 2026-09-11 更正一条**已失效**的注释：原文写「取不到即空串 ⇒ 选行回退位置式，不影响可用性」——
    //   该假设成立于「位置式池 = MEMORY.md 全量行」的年代。缺陷1 修复后位置式池本身就是分层过滤后的
    //   `allMem`（只含 P/always），真实库 MEMORY.md 48 条索引行**全为 E 层 gated** ⇒ allMem 为空
    //   ⇒ **回退 = 回退到空**，不再是安全网。gated 载体要靠相关性通道按需取回（见上方 340 行守卫的更正），
    //   空 query 时本就应当不铺 gated——这是设计原意，不是可用性损失。
    const taskTextOf = (context: unknown): string => {
      try {
        const evs = (context as { agent?: { session?: { snapshotEvents?: () => unknown[] } } })
          ?.agent?.session?.snapshotEvents?.()
        if (!Array.isArray(evs)) return ''
        for (let i = evs.length - 1; i >= 0; i--) {
          const e = evs[i] as { type?: string; data?: { content?: Array<{ text?: string }> } }
          if (e?.type !== 'user/message') continue
          const txt = (e.data?.content || []).map((b) => (typeof b?.text === 'string' ? b.text : '')).join(' ').trim()
          if (txt) return txt.slice(0, 300)
        }
      } catch { /* 取不到=空 query */ }
      return ''
    }
    d.disposers.push(sp.context({
      name: 'shoucang-hot-memory',
      order: 88, // mneme: user-settings=85 / memory=90 —— 守藏热记忆在其间
      text: (context?: unknown) => { d.injectMeta.calls++; d.injectMeta.lastAt = Date.now(); return d.hot.build(taskTextOf(context)) },
    }))
    d.logger.info?.('[shoucang] R1 热记忆注入挂点已注册 (systemPrompt.context: shoucang-hot-memory)')
  } else {
    d.logger.warn?.('[shoucang] systemPrompt 能力不可用，R1 热记忆注入未注册')
  }
}

/** effect 体内装配：注入挂点 + 向量路由 + 记忆写路由；返回卸载器。 */
function mountInjectEffect(ctx: Context, d: InjectDeps): () => void {
  d.logger.info?.('[shoucang] host RPC ready: roots(roots|get_root|set_root|bootstrap)/config(save|toggle|set)/memory(overview|sections|section-edit|edit|remove|approve)/suite/mcl-status/criteria/cognition-report/deepsleep(status|trigger|config)/distill(run|config)/vector(status2|cache-clear)/embed(config|test)/llm-models/inject(preview|stats)')
  mountHotMemoryInjection(ctx, d)
  registerVectorRoutes(d)
  registerMemoryWriteRoutes(d)
  return () => { for (const dispose of d.disposers) dispose() }
}

export function registerInject(ctx: Context, d: InjectDeps): void {
  d.route('/inject/preview', (req, res) => injectPreviewRoute(d, req, res))
  d.route('/inject/stats', (req, res) => injectStatsRoute(d, req, res))
  registerScnoteCommand(ctx, d)
  ctx.effect(() => mountInjectEffect(ctx, d), '@dsh-external/shoucang-panel: http rpc + hot memory injection')
}

/** /scnote 命令注册（commands 能力不可用时降级告警，不抛）。 */
function registerScnoteCommand(ctx: Context, d: InjectDeps): void {
  const cmds = (ctx as unknown as { commands?: { register?(def: unknown): unknown } }).commands
  if (cmds && typeof cmds.register === 'function') {
    cmds.register({
      name: 'scnote',
      description: '以“笔记化”方式执行任务，并把执行过程整理为 笔记/ 文档（典型：网络检索/调研）',
      input: { hint: '<任务描述，如：调研 XXX>', images: false },
      handler: (invocation: { rawInput?: string }) => scnoteReply(invocation?.rawInput ?? ''),
    })
    d.logger.info?.('[shoucang] /scnote 命令已注册')
  } else {
    d.logger.warn?.('[shoucang] commands 能力不可用，/scnote 未注册')
}
}
