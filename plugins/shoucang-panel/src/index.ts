/**
 * @dsh-external/shoucang-panel — 宿主半区。
 *
 * 职责：为 client 面板（client.js，纯 DOM）提供 /api/shoucang-panel HTTP RPC：
 *   GET  /roots     已登记守藏根目录列表 + 当前激活 root
 *   POST /set_root  {path, name?} 登记/切换 root（目录须含 shoucang.config.yaml）
 *   GET  /get_root  → {active}
 *   GET  /config    当前 root 的 shoucang.config.yaml 原文 + 关键字段解析
 *   POST /save      {text} 备份先行写入（.bak-<时间戳>）
 *   POST /toggle    {key} 翻转布尔项（boards.* / archive.enabled /
 *                   lifecycle.enabled / scheduler.enabled）
 *
 * 开源红线：零硬编码路径。root 登记表存 state_path（默认 ~/.dsh/storages/
 * shoucang-panel.json，支持 ~ 展开），初始为空——root 由用户在面板里添加。
 * 写操作全部「备份先行」，注释与原格式按原文保留（toggle 只做行级替换）。
 */
import type { Context } from 'cordis'
import z from 'schemastery'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { gunzipSync, zstdDecompressSync } from 'node:zlib'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

export const name = '@dsh-external/shoucang-panel'
export const inject = ['webServer', 'systemPrompt', 'commands'] as const

export interface Config {
  state_path: string
  projectRoots: string
}

export const Config = z.object({
  state_path: z.string().default('~/.dsh/storages/shoucang-panel.json'),
  projectRoots: z.string().default('D:\\FF').description('治理知识库项目发现根（逗号分隔，一层扫描）；仅收录存在 docs/devref/cards/ 的目录'),
}).description('面板设置')

interface RootEntry { id: string; name: string; path: string }
interface PanelState { roots: RootEntry[]; active: string | null }

interface RouteRegistry {
  register(route: { kind: 'exact' | 'prefix'; path: string; handler(req: IncomingMessage, res: ServerResponse): void }): () => void
}

const CONFIG_FILE = 'shoucang.config.yaml'

function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(homedir(), p.slice(2))
  return p
}

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** python 脚本 stdout 已 JSON 时原样透传，否则包成 { raw } 防吞。 */
function safeJson(s: string): Record<string, unknown> {
  const t = s.trim()
  try { const j = JSON.parse(t); return (j && typeof j === 'object') ? j as Record<string, unknown> : { raw: t.slice(0, 600) } } catch { return { raw: t.slice(0, 600) } }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

function statMtime(file: string): string {
  try { return statSync(file).mtime.toISOString() } catch { return '' }
}

/** 递归收集目录下全部 .md（跳过隐藏/.bak；可跳过指定子目录），零硬编码用户路径。 */
function walkMarkdown(rootDir: string, skipDirs: string[] = []): Array<{ rel: string; name: string; mtime: string; text: string }> {
  const out: Array<{ rel: string; name: string; mtime: string; text: string }> = []
  const visit = (dir: string, prefix: string): void => {
    let entries: import('node:fs').Dirent[]
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (skipDirs.includes(e.name)) continue
        visit(full, rel)
      } else if (e.name.endsWith('.md') && e.name.indexOf('.bak') === -1) {
        try {
          const text = readFileSync(full, 'utf8').slice(0, 12000)
          out.push({ rel, name: e.name, mtime: statMtime(full), text })
        } catch { /* 跳过不可读文件 */ }
      }
    }
  }
  visit(rootDir, '')
  return out
}


export function apply(ctx: Context, config: Config): void {
  const webServer = (ctx as unknown as { webServer?: RouteRegistry }).webServer
  if (!webServer) {
    ctx.logger?.warn?.('[shoucang] webServer 服务不可用，面板 RPC 未挂载')
    return
  }

  const statePath = expandHome(config.state_path)

  const loadState = (): PanelState => {
    try { return JSON.parse(readFileSync(statePath, 'utf8')) as PanelState } catch { return { roots: [], active: null } }
  }
  const saveState = (s: PanelState): void => {
    mkdirSync(dirname(statePath), { recursive: true })
    writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8')
  }

  const disposers: Array<() => void> = []
  /** 注册 exact 路由并纳入卸载清理（资源必须挂 effect——注入器踩坑记录）。 */
  const route = (sub: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void => {
    disposers.push(webServer.register({ kind: 'exact', path: `/api/shoucang-panel${sub}`, handler }))
  }

  const idleState = { lastActiveAt: 0, lastDistillAt: 0, lastSettleAt: 0, running: false }

  const configFileOf = (): string | null => {
    const root = activeRootOf()
    return root ? join(root.path, CONFIG_FILE) : null
  }

  const activeRootOf = (): RootEntry | null => {
    const s = loadState()
    return s.roots.find((r) => r.id === s.active) ?? null
  }

  // ESM 宿主：模块目录用 import.meta.url 解析（__dirname 在 ESM 未定义）
  const moduleDir = dirname(fileURLToPath(import.meta.url))

  /* ---------- 默认项目资料：目录结构 + _index.md 规则模板（切换根目录时自动构建） ---------- */

  interface DefaultProject { structure: Record<string, unknown>; index_templates: Record<string, string>; version?: string | null }

  let defaultProjectCache: DefaultProject | null = null
  const defaultProjectOf = (): DefaultProject | null => {
    if (defaultProjectCache) return defaultProjectCache
    const cands = [join(moduleDir, '../default-project.json'), join(moduleDir, 'default-project.json')]
    for (const file of cands) {
      try {
        defaultProjectCache = JSON.parse(readFileSync(file, 'utf8')) as DefaultProject
        return defaultProjectCache
      } catch { /* try next */ }
    }
    defaultProjectCache = null
    return null
  }

  const TEMPLATE = join(moduleDir, '../default-vault-template.tar.gz')

  /** 纯 Node tar.gz 解压（零外部依赖；防御路径穿越；仅处理文件/目录条目，GNU ustar 短路径） */
  const extractTgz = (buf: Buffer, dest: string): void => {
    const out = gunzipSync(buf)
    mkdirSync(dest, { recursive: true })
    let off = 0
    while (off + 512 <= out.length) {
      const block = out.subarray(off, off + 512)
      const readStr = (s: number, e: number): string => block.subarray(s, e).toString('utf8').replace(/\0[\s\S]*$/, '')
      const name = readStr(0, 100)
      if (!name) break
      const size = parseInt(readStr(124, 136) || '0', 8) || 0
      const type = String.fromCharCode(block[156])
      const prefix = readStr(345, 500)
      const full = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '').split('\\').join('/')
      if (full.includes('../') || full.startsWith('/')) throw new Error(`tar 路径非法：${full}`)
      const dataStart = off + 512
      const target = join(dest, full)
      if (type === '5') mkdirSync(target, { recursive: true })
      else if (type === '0' || type === '') {
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, out.subarray(dataStart, dataStart + size))
      }
      off = dataStart + Math.ceil(size / 512) * 512
    }
  }

  const bootstrapDefaults = (rootPath: string): { createdDirs: string[]; createdIndexes: string[]; skipped: string[]; template: boolean } => {
    const out = { createdDirs: [], createdIndexes: [], skipped: [], template: false } as { createdDirs: string[]; createdIndexes: string[]; skipped: string[]; template: boolean }
    mkdirSync(rootPath, { recursive: true })
    // 空根（全新库）：直接用默认知识库模板解压（含 _meta 管线/配置/wiki 规范/目录结构/18 份 _index.md）
    const fresh = !existsSync(join(rootPath, 'shoucang.config.yaml')) && !existsSync(join(rootPath, '记忆'))
    if (fresh && existsSync(TEMPLATE)) {
      try {
        extractTgz(readFileSync(TEMPLATE), rootPath)
        out.template = true
        return out
      } catch (e) {
        ctx.logger?.warn?.(`[shoucang] 模板解压失败，降级 JSON 骨架：${String(e)}`)
        // fallthrough 到 JSON 骨架
      }
    }
    const dp = defaultProjectOf()
    if (!dp) return out
    const rels = Object.keys(dp.index_templates ?? {})
    const walk = (tree: Record<string, unknown>, prefix: string): void => {
      for (const name of Object.keys(tree)) {
        const rel = prefix ? `${prefix}/${name}` : name
        const dir = join(rootPath, rel)
        if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); out.createdDirs.push(rel) }
        const idx = join(dir, '_index.md')
        if (!existsSync(idx)) {
          try {
            const tpl = dp.index_templates[rel] ?? ''
            if (tpl) writeFileSync(idx, tpl, 'utf8')
          } catch { out.skipped.push(rel) }
          if (existsSync(idx)) out.createdIndexes.push(rel)
        } else {
          out.skipped.push(rel)
        }
        const child = tree[name] as Record<string, unknown>
        walk(child, rel)
      }
    }
    walk(dp.structure ?? {}, '')
    return out
  }

  /* ---------- R1 热记忆注入（2026-08-27）：画像+记忆 指针行，每轮注入 ---------- */

  interface PointerFile { rel: string; name: string; mtime: string; text: string }

  const pointerTitle = (f: PointerFile): string => {
    const m = f.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (m) {
      for (const l of m[1].split(/\r?\n/)) {
        if (l.startsWith('title:')) { const v = l.replace(/^title:\s*/, '').replace(/^['"]|['"]$/g, ''); if (v) return v.slice(0, 30) }
        if (l.startsWith('name:')) { const v = l.replace(/^name:\s*/, '').replace(/^['"]|['"]$/g, ''); if (v) return v.slice(0, 30) }
      }
    }
    return f.name.replace(/\.md$/, '').slice(0, 30)
  }

  const pointerDesc = (f: PointerFile): string => {
    const m = f.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (m) {
      const desc = m[1].split(/\r?\n/).find((l) => l.startsWith('description:'))
      if (desc) {
        const v = desc.replace(/^description:\s*/, '').replace(/^['"]|['"]$/g, '')
        if (v) return v.slice(0, 60)
      }
    }
    const body = f.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
    const first = body.split(/\r?\n/).find((l) => l && !/^#/.test(l))
    return (first || f.text.slice(0, 40)).slice(0, 60)
  }

  const injectCache: { root: string | null; at: number; text: string } = { root: null, at: 0, text: '' }
  const injectMeta = { calls: 0, lastAt: 0 } // 提示词装配调用计数（实测新会话注入）
  const buildHotMemoryText = (): string => {
    const now = Date.now()
    const root = activeRootOf()
    const key = root?.path ?? ''
    if (injectCache.root === key && now - injectCache.at < 30000) return injectCache.text
    injectCache.root = key
    injectCache.at = now
    if (!root) { injectCache.text = ''; return '' }
    let level = 'smart'
    let maxTokens = 1500
    let personaOn = true
    let memoryOn = true
    let hotMemoryOn = true
    let personaMode = 'both'
    const file = configFileOf()
    if (file && existsSync(file)) {
      try {
        const view = parseView(readFileSync(file, 'utf8'))
        level = view.injection_level ?? 'smart'
        personaOn = view.boards.persona !== false
        memoryOn = view.boards.memory !== false
        hotMemoryOn = view.flags['injection.hot_memory'] !== false
        personaMode = String(view.flags['injection.persona'] ?? 'both')
      } catch { /* 缺配置用默认 */ }
    }
    if (level === 'off' || (!personaOn && !memoryOn)) { injectCache.text = ''; return '' }
    const lines: string[] = ['[守藏·热记忆] 画像与记忆指针（缩略注入·按需 get_file 拉全文）：']
    const seen = new Set<string>() // 防御性去重：同一 rel 绝不重复注入（审查 2026-08-27）
    const pushLine = (rel: string, line: string): boolean => {
      if (seen.has(rel)) return false
      seen.add(rel)
      lines.push(line)
      return true
    }
    // 画像：每轮必注（用户画像/agent画像 两行）
    if (personaOn) {
      const all = walkMarkdown(join(root.path, '画像'))
      const content = all.filter((f) => f.name !== '_index.md')
      const me = content.find((f) => f.rel.startsWith('我/')) ?? content[0] ?? null
      const you = content.find((f) => f.rel.startsWith('你/') && f !== me) ?? content.find((f) => f !== me) ?? null
      const injectMe = personaMode === 'me' || personaMode === 'both'
      const injectYou = personaMode === 'you' || personaMode === 'both'
      if (me && injectMe) pushLine(`画像/${me.rel}`, `- [[画像/${me.rel}|用户画像]] — ${pointerDesc(me)}`)
      if (you && you !== me && injectYou) pushLine(`画像/${you.rel}`, `- [[画像/${you.rel}|agent画像]] — ${pointerDesc(you)}`)
    }
    // 记忆·热：仅 日记忆（临时·当日蒸馏指针，每轮注入）；受 boards.memory + injection.hot_memory 双门控
    if (memoryOn && hotMemoryOn) {
      const memFiles = walkMarkdown(join(root.path, '记忆', '日记忆'), ['_assets', '_meta']).filter((f) => f.name !== '_index.md')
      const caps: Record<string, number> = { low: 2, medium: 4, high: 8, smart: 10 }
      const perType = level === 'low' ? 2 : level === 'medium' ? 4 : 6
      const total = caps[level] ?? 10
      // 2c 字节预算+重要性装箱（落地方案）：不按遍历序取前 N，而是按评分排序后取高分 N——
      // 评分 = frontmatter confidence（缺省 50）+ updated 新近加权（预算仍由末尾 max_tokens 裁切兜底）
      const scoreOf = (f: typeof memFiles[number]): number => {
        const m = f.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        if (!m) return 50
        const cf = m[1].match(/confidence:\s*(\d+)/)
        let s = cf ? parseInt(cf[1], 10) : 50
        const up = m[1].match(/^updated:\s*([\d-]+)/m)
        if (up) {
          const days = (Date.now() - new Date(up[1]).getTime()) / 86400000
          if (days < 1) s += 10; else if (days < 3) s += 5
        }
        return s
      }
      const ranked = memFiles.slice().sort((a, b) => scoreOf(b) - scoreOf(a))
      let count = 0
      for (const f of ranked) {
        if (pushLine(f.rel, `- [[记忆/日记忆/${f.rel}|${pointerTitle(f)}]] — ${pointerDesc(f)}`)) {
          count++
          if (count >= total) break
        }
      }
    }
    const budget = Math.max(400, maxTokens * 2) // 中文粗估 ~2 字符/token
    let text = lines.join('\n')
    if (text.length > budget) text = text.slice(0, budget) + '\n…（指针注入已按 max_tokens 预算裁切）'
    injectCache.text = text
    return text
  }

  const backupThenWrite = (file: string, text: string): void => {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    try { writeFileSync(`${file}.bak-${stamp}`, readFileSync(file)) } catch { /* 首次写入前无备份 */ }
    writeFileSync(file, text, 'utf8')
  }

  interface ParsedView { boards: Record<string, boolean>; flags: Record<string, boolean | string>; injection_level?: string; idle_review_ms?: number; age_days?: number; archive_mode?: string; fixed_time?: string; merge_fpr?: number; merge_floor?: number; sessions_dir?: string; interval_hours?: number; embedding?: Record<string, string | number> }

  /** 缩进栈解析：每行归一为带点路径（如 shoucang.boards.persona），栈深即嵌套层级。 */
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

  const parseView = (text: string): ParsedView => {
    const out: ParsedView = { boards: {}, flags: {} }
    scanPaths(text, (path, _indent, value) => {
      if (!value) return
      if (/^shoucang\.boards\./.test(path.join('.')) && path.length === 3 && (value === 'true' || value === 'false')) {
        out.boards[path[2]] = value === 'true'
        return
      }
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
  function flipBool(text: string, dottedKey: string): string | null {
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
  function setKey(text: string, dottedKey: string, rawValue: string): string | null {
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

  // ---- RPC ----

  route('/roots', (_req, res) => {
    const s = loadState()
    sendJson(res, 200, { roots: s.roots, active: s.active })
  })

  route('/get_root', (_req, res) => {
    const s = loadState()
    sendJson(res, 200, { active: s.roots.find((r) => r.id === s.active) ?? null })
  })

  // 按默认项目资料手动构建（body.root 可指定；缺省用当前激活根）——只补缺失目录/索引
  route('/root/bootstrap', async (req, res) => {
    const body = (await readBody(req).catch(() => ({}))) as { root?: string }
    const target = typeof body.root === 'string' && body.root.trim() ? resolve(body.root.trim()) : activeRootOf()?.path ?? ''
    if (!target) return sendJson(res, 400, { error: 'no root' })
    const boot = bootstrapDefaults(target)
    sendJson(res, 200, { root: target, ...boot, materialVersion: defaultProjectOf()?.version ?? null })
  })

  route('/set_root', async (req, res) => {
    const body = await readBody(req)
    const p = typeof body.path === 'string' ? body.path.trim() : ''
    if (!p) return sendJson(res, 400, { error: 'path required' })
    const abs = isAbsolute(p) ? resolve(p) : resolve(p)
    const file = join(abs, CONFIG_FILE)
    if (!existsSync(file)) return sendJson(res, 400, { error: `未找到 ${CONFIG_FILE}：${abs}` })
    const s = loadState()
    let entry = s.roots.find((r) => r.path === abs)
    if (!entry) {
      entry = {
        id: `root-${Date.now()}`,
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : abs.split(/[\\/]/).pop() || abs,
        path: abs,
      }
      s.roots.push(entry)
    }
    s.active = entry.id
    saveState(s)
    ctx.logger?.info?.(`[shoucang] panel root activated: ${abs}`)
    // 切换根目录默认构建：按默认项目资料补缺目录/索引（幂等，不覆盖既有 _index.md）
    try {
      const boot = bootstrapDefaults(abs)
      if (boot.createdDirs.length || boot.createdIndexes.length) {
        ctx.logger?.info?.(`[shoucang] bootstrap ${abs}: +${boot.createdDirs.length} dirs +${boot.createdIndexes.length} indexes`)
      }
    } catch (e) { ctx.logger?.warn?.(`[shoucang] bootstrap failed: ${String(e)}`) }
    sendJson(res, 200, { ok: true, active: entry })
  })

  route('/config', (_req, res) => {
    const file = configFileOf()
    if (!file) return sendJson(res, 200, { text: null, parsed: null, error: 'no-active-root' })
    try {
      const text = readFileSync(file, 'utf8')
      sendJson(res, 200, { text, parsed: parseView(text), file, mtime: statMtime(file) })
    } catch (e) {
      sendJson(res, 500, { error: String(e) })
    }
  })

  route('/save', async (req, res) => {
    const body = await readBody(req)
    if (typeof body.text !== 'string') return sendJson(res, 400, { error: 'text required' })
    const file = configFileOf()
    if (!file) return sendJson(res, 400, { error: 'no-active-root' })
    try {
      backupThenWrite(file, body.text)
      ctx.logger?.info?.(`[shoucang] panel saved ${file}`)
      sendJson(res, 200, { ok: true, parsed: parseView(body.text) })
    } catch (e) {
      sendJson(res, 500, { error: String(e) })
    }
  })

  route('/toggle', async (req, res) => {
    const body = await readBody(req)
    const key = typeof body.key === 'string' ? body.key : ''
    const allowed = ['boards.persona', 'boards.memory', 'boards.wiki', 'injection.hot_memory', 'archive.enabled', 'lifecycle.enabled', 'scheduler.enabled', 'lifecycle.archive.apply_confirm', 'merge.enabled']
    if (!allowed.includes(key)) return sendJson(res, 400, { error: `key 不允许：${key}` })
    const file = configFileOf()
    if (!file) return sendJson(res, 400, { error: 'no-active-root' })
    // 面板用逻辑名（boards.wiki），实际 YAML 多一层 shoucang 根命名空间
    const fileKey = 'shoucang.' + key
    let next: string | null
    try { next = flipBool(readFileSync(file, 'utf8'), fileKey) } catch (e) { return sendJson(res, 500, { error: String(e) }) }
    if (next === null) return sendJson(res, 500, { error: `未定位到布尔行：${key}` })
    backupThenWrite(file, next)
    injectCache.at = 0 // 注入缓存作废：toggle 立即反映到下一轮注入/预览
    ctx.logger?.info?.(`[shoucang] panel toggled ${key}`)
    sendJson(res, 200, { ok: true, parsed: parseView(next) })
  })

  // 设置标量值（枚举/数值/布尔）：{key, value}；key 白名单 + 枚举校验；写前备份
  route('/set', async (req, res) => {
    const body = await readBody(req)
    const key = typeof body.key === 'string' ? body.key : ''
    let value = typeof body.value === 'string' ? body.value.trim() : ''
    const allowed: Record<string, string[]> = {
      'injection.level': ['off', 'low', 'medium', 'high', 'smart'],
      'injection.persona': ['off', 'me', 'you', 'both'],
      'injection.max_tokens': [],
      'lifecycle.archive.min_confidence': [],
      'lifecycle.archive.age_days': [],
      'lifecycle.archive.mode': ['age', 'fixed'],
      'lifecycle.archive.fixed_time': [],
      'merge.fingerprint_threshold': [],
      'merge.complement_floor': [],
      'idle.sessions_dir': [],
      'archive.idle_review_ms': [],
      'archive.ttl_multiplier': [],
      'lifecycle.interval_hours': [],
      // 向量配置在模型「部署/导入」时自动写入，面板不允许手工改（2026-08-27 定稿；如需高级定制走配置原文 YAML）
    }
    // 数值范围校验（时间类）
    const RANGE: Record<string, [number, number]> = {
      'archive.idle_review_ms': [60000, 3600000], // 1–60 分钟（毫秒）
      'lifecycle.archive.age_days': [0.1, 30],
      'lifecycle.archive.min_confidence': [0, 100],
      'merge.fingerprint_threshold': [0.1, 1],
      'merge.complement_floor': [0.05, 0.9],
      'archive.ttl_multiplier': [0.5, 10],
      'lifecycle.interval_hours': [1, 168],
      'injection.max_tokens': [100, 8000],
      'embedding.dimension': [16, 8192], // 常见嵌入维度范围
    }
    if (!(key in allowed)) return sendJson(res, 400, { error: `key 不允许：${key}` })
    if (!value && key !== 'idle.sessions_dir') return sendJson(res, 400, { error: 'value required' })
    if (allowed[key].length && !allowed[key].includes(value)) return sendJson(res, 400, { error: `枚举值非法：${key} ∈ ${allowed[key].join('|')}` })
    if (key === 'lifecycle.archive.fixed_time') {
      if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) return sendJson(res, 400, { error: 'fixed_time 须为 HH:MM（如 21:30）' })
      value = `"${value}"` // YAML 时间对象防护：归档时刻保持字符串
    }
    if (RANGE[key] && !(Number(value) >= RANGE[key][0] && Number(value) <= RANGE[key][1])) {
      return sendJson(res, 400, { error: `数值越界：${key} ∈ [${RANGE[key][0]}, ${RANGE[key][1]}]` })
    }
    const file = configFileOf()
    if (!file) return sendJson(res, 400, { error: 'no-active-root' })
    const fileKey = 'shoucang.' + key
    let next: string | null
    try { next = setKey(readFileSync(file, 'utf8'), fileKey, value) } catch (e) { return sendJson(res, 500, { error: String(e) }) }
    if (next === null) return sendJson(res, 500, { error: `未定位到配置行：${key}` })
    backupThenWrite(file, next)
    injectCache.at = 0 // 注入缓存作废：数值/枚举改动立即反映
    ctx.logger?.info?.(`[shoucang] panel set ${key}=${value}`)
    sendJson(res, 200, { ok: true, key, value, parsed: parseView(next) })
  })

  // ---- 板块只读接口（画像直接展示内容 / 记忆 Obsidian 仓库树与互链） ----

  /* ---------- 记忆库（managing-memory 技能仓）实况只读展示（2026-09-06） ----------
   * F-003 重定义：面板「画像/记忆」视图不再读 Obsidian 仓库，改读蒸馏 watcher 的
   * 唯一事实源 ~/.dsh/skills/managing-memory/。零硬编码路径：home = DSH_HOME || ~/.dsh。
   * 只读：不提供任何写入口（写/裁决归记忆插件）。 */

  interface MemIndexEntry { tag: string; subject: string; pointer: string; raw: string }
  interface MemIndexFile { name: string; label: string; text: string; chars: number; cap: number; lines: MemIndexEntry[] }

  const memoryHomeOf = (): string | null => {
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    const base = join(home, 'skills', 'managing-memory')
    return existsSync(base) ? base : null
  }
  /* 守藏本地知识区（ADR-0002 阶段3 单飞切换后 = 蒸馏事实源宿主）：
   * $DSH_HOME/suite/knowledge —— 三索引 + notes 七类 + pending + audit，与记忆库同构。
   * 阶段4 UI 同步：panel 记忆视图双根（suite ∪ memory lib）+ 蒸馏统计卡（distill-audit.jsonl）。 */
  const suiteHomeOf = (): string | null => {
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    const base = join(home, 'suite', 'knowledge')
    return existsSync(base) ? base : null
  }
  /** 蒸馏统计卡聚合（suite/knowledge/audit/distill-audit.jsonl；全量汇总 + 尾部明细）。 */
  const distillStatsOf = (): Record<string, unknown> | null => {
    const base = suiteHomeOf()
    if (!base) return null
    const full = join(base, 'audit', 'distill-audit.jsonl')
    let rows: Array<Record<string, unknown>> = []
    try {
      rows = readFileSync(full, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) as Record<string, unknown> } catch { return null } }).filter((x): x is Record<string, unknown> => !!x)
    } catch { rows = [] }
    const num = (v: unknown): number => (typeof v === 'number' ? v : 0)
    const byRoute: Record<string, number> = {}
    // 近 7 日按日聚合（sparkline 趋势数据源；含空日补齐，前端画平线即"无活动"）
    const dayMap = new Map<string, { runs: number; added: number }>()
    const dayKey = (iso: unknown): string => String(iso || '').slice(0, 10)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      dayMap.set(d, { runs: 0, added: 0 })
    }
    let runs = 0, added = 0, rejected = 0, failed = 0, gateRejects = 0, writeFails = 0
    let last: Record<string, unknown> | null = null
    for (const r of rows) {
      last = r
      if (r.kind === 'gate-reject') { gateRejects++; continue }
      if (r.kind === 'write-fail') { writeFails++; failed++; continue }
      if (r.kind === 'distill-run') {
        runs++
        added += num(r.added); rejected += num(r.rejected); failed += num(r.failed)
        const route = String(r.route || 'unknown')
        byRoute[route] = (byRoute[route] || 0) + 1
        const k = dayKey(r.at)
        if (dayMap.has(k)) { const e = dayMap.get(k)!; e.runs++; e.added += num(r.added) }
      }
    }
    const byDay = Array.from(dayMap.entries()).map(([day, v]) => ({ day, ...v }))
    return { runs, added, rejected, failed, gateRejects, writeFails, byRoute, byDay, last, recent: rows.slice(-5) }
  }
  const MEM_INDEX_FILES: Array<{ file: string; label: string }> = [
    { file: 'MEMORY.md', label: '知识索引 MEMORY' },
    { file: 'USER.md', label: '用户画像 USER' },
    { file: 'AGENT.md', label: 'Agent 画像 AGENT' },
  ]
  const NOTE_RELS = ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent', 'INDEX']
  /** 容量上限单一事实源 = engine/target-registry.json（读失败回退默认值） */
  const memoryCaps = (base: string): Record<string, number> => {
    const out: Record<string, number> = { 'MEMORY.md': 3000, 'USER.md': 2000, 'AGENT.md': 2000 }
    try {
      const reg = JSON.parse(readFileSync(join(base, 'engine', 'target-registry.json'), 'utf8')) as { targets?: { memory?: { capacity?: Record<string, number> } } }
      const cap = reg?.targets?.memory?.capacity
      if (cap) for (const k of Object.keys(cap)) out[k] = cap[k]
    } catch { /* 回退默认容量 */ }
    return out
  }
  /** 索引行：`[标签] 主题 · 概况 → notes/x.md §小节` */
  const parseIndexLines = (text: string): MemIndexEntry[] => {
    const out: MemIndexEntry[] = []
    for (const raw of text.split(/\r?\n/)) {
      const m = raw.match(/^\[([^\]]+)\]\s+(.+?)\s*→\s*(.+)$/)
      if (!m) continue
      out.push({ tag: m[1].trim(), subject: m[2].trim(), pointer: m[3].trim(), raw })
    }
    return out
  }
  const charsOf = (text: string): number => text.replace(/\s+/g, '').length
  const readIndexFile = (base: string, f: { file: string; label: string }, caps: Record<string, number>): MemIndexFile | null => {
    try {
      const text = readFileSync(join(base, f.file), 'utf8')
      return { name: f.file, label: f.label, text, chars: charsOf(text), cap: caps[f.file] ?? 2000, lines: parseIndexLines(text) }
    } catch { return null }
  }
  /** notes 文件小节清单（标题+起始行；不含正文，正文走 /memory/sections） */
  const notesSectionIndex = (base: string): Array<{ rel: string; name: string; sections: Array<{ title: string; line: number }> }> => {
    const out: Array<{ rel: string; name: string; sections: Array<{ title: string; line: number }> }> = []
    for (const w of NOTE_RELS) {
      const full = join(base, 'notes', w + '.md')
      if (!existsSync(full)) continue
      const text = readFileSync(full, 'utf8')
      const sections: Array<{ title: string; line: number }> = []
      text.split(/\r?\n/).forEach((l, i) => { const m = l.match(/^##\s+(.+)$/); if (m) sections.push({ title: m[1].trim(), line: i + 1 }) })
      out.push({ rel: 'notes/' + w + '.md', name: w + '.md', sections })
    }
    return out
  }
  const readJsonlTail = (full: string, n: number): Array<Record<string, unknown>> => {
    try {
      return readFileSync(full, 'utf8').split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l) as Record<string, unknown> } catch { return null } }).filter((x): x is Record<string, unknown> => !!x)
    } catch { return [] }
  }

  // 记忆库总览（一次取回：索引+容量+pending+蒸馏水位+notes 小节索引；全部只读）
  // 阶段4：双根同构读取（memory lib + suite/knowledge）+ 蒸馏统计卡聚合。
  const memOverviewOf = (base: string): Record<string, unknown> => {
    const caps = memoryCaps(base)
    const indexes = MEM_INDEX_FILES.map((f) => readIndexFile(base, f, caps)).filter(Boolean) as MemIndexFile[]
    let pendingCount = 0
    let pendingMeta: Record<string, number> = {}
    const pendingRecent: Array<{ name: string; mtime: string }> = []
    try {
      const pendDir = join(base, 'pending')
      const nowMs = Date.now()
      const names = readdirSync(pendDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => e.name)
        .sort((a, b) => statMtime(join(pendDir, b)).localeCompare(statMtime(join(pendDir, a))))
      pendingCount = names.length
      // 24h 内新增数（趋势语境：候选正在被消化=减少，新增快于消化=增长）
      let last24h = 0
      for (const n of names) {
        try { if (nowMs - new Date(statMtime(join(pendDir, n))).getTime() < 86400000) last24h++ } catch { /* 跳过 */ }
      }
      for (const n of names.slice(0, 8)) pendingRecent.push({ name: n, mtime: statMtime(join(pendDir, n)) })
      pendingMeta = { last24h }
    } catch { /* pending 缺失 */ }
    const watermark = readJsonlTail(join(base, 'audit', 'distill-watermark.jsonl'), 5)
    return {
      root: base,
      indexes,
      pending: { count: pendingCount, ...pendingMeta, recent: pendingRecent },
      distill: { recent: watermark, last: watermark[watermark.length - 1] ?? null },
      notes: notesSectionIndex(base),
    }
  }
  route('/memory/overview', (_req, res) => {
    const base = memoryHomeOf()
    if (!base) return sendJson(res, 200, { present: false, error: '未检测到记忆库技能仓（~/.dsh/skills/managing-memory）——记忆插件蒸馏事实源不在本机默认位' })
    try {
      const mem = memOverviewOf(base)
      const suiteBase = suiteHomeOf()
      const suite = suiteBase ? memOverviewOf(suiteBase) : null
      const undone = (() => { try {
        return readFileSync(join(base, 'audit', 'archive-progress.jsonl'), 'utf8').split('\n')
          .filter((l) => { try { return l.trim() && (JSON.parse(l) as { done?: boolean }).done === false } catch { return false } })
          .length
      } catch { return 0 } })()
      sendJson(res, 200, {
        present: true,
        ...mem,
        // 蒸馏唯一权归守藏（ADR-0002 阶段3）：水位语义 = suite 活水位（记忆库根 watermark 已冻结为历史值）
        distill: suite ? suite.distill : mem.distill,
        queue: { undone },
        suite: suite ? { present: true, ...suite } : { present: false },
        distillStats: distillStatsOf(),
        now: new Date().toISOString(),
      })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  })

  // notes 小节正文（按 ## 切片；白名单 rel；只读）
  route('/memory/sections', (req, res) => {
    let rootParam = ''
    let rel = ''
    try {
      const sp = new URL(req.url ?? '/', 'http://dsh.local').searchParams
      rel = sp.get('rel') ?? ''
      rootParam = sp.get('root') ?? 'memory'
    } catch { /* noop */ }
    // 阶段4 双根：root=suite → 守藏本地知识区；root=memory（缺省）→ 记忆库
    const base = rootParam === 'suite' ? suiteHomeOf() : memoryHomeOf()
    if (!base) return sendJson(res, 200, { present: false, error: rootParam === 'suite' ? '未检测到守藏本地知识区（~/.dsh/suite/knowledge）' : '未检测到记忆库技能仓' })
    if (!new RegExp(`^notes/(${NOTE_RELS.join('|')})\\.md$`).test(rel)) return sendJson(res, 400, { error: 'bad rel' })
    const abs = join(base, rel)
    if (!existsSync(abs)) return sendJson(res, 404, { error: 'note not found' })
    try {
      const text = readFileSync(abs, 'utf8')
      const sections: Array<{ title: string; line: number; body: string }> = []
      const lines = text.split(/\r?\n/)
      let cur: { title: string; line: number; body: string[] } | null = null
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^##\s+(.+)$/)
        if (m) {
          if (cur) sections.push({ title: cur.title, line: cur.line, body: cur.body.join('\n').trim() })
          cur = { title: m[1].trim(), line: i + 1, body: [] }
        } else if (cur) {
          cur.body.push(lines[i])
        }
      }
      if (cur) sections.push({ title: cur.title, line: cur.line, body: cur.body.join('\n').trim() })
      sendJson(res, 200, { present: true, root: rootParam, rel, name: rel.split('/').pop() ?? '', text, sections })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  })

  /* ---------- 治理知识库（pmg devref 卡库，只读；2026-09-06） ----------
   * 通用知识 = pmg 权威仓 docs/devref/cards（跨项目规则/规范/拆坑）；
   * 项目知识 = projectRoots 一层扫描发现的 <项目>/docs/devref/cards（有卡库才收录，无硬编码名单）。
   * 卡册结构 = devref-card.mjs 写门契约：cards/{how-to,reference,decision}.md + INDEX.md。
   * 全只读：切片渲染在 host 完成，前端零路径参数（project 用发现序号 id，防 path traversal）。 */

  interface GmCardLib { id: number; name: string; path: string; generic: boolean; cards: Record<string, number>; hasIndex: boolean }
  const GM_CARD_FILES: Array<{ file: string; type: string; label: string }> = [
    { file: 'decision.md', type: 'decision', label: '架构决策' },
    { file: 'reference.md', type: 'reference', label: '契约事实' },
    { file: 'how-to.md', type: 'how-to', label: '操作步骤' },
  ]
  const GM_GENERIC_PROJECT = 'dsh-project-map-governance-plugin' // 通用知识库宿主（pmg 权威仓）
  const projectRootsOf = (): string[] => {
    const raw = (config.projectRoots || '').split(',').map((s) => expandHome(s.trim())).filter(Boolean)
    return raw.length ? raw : []
  }
  /** 发现所有卡库：根目录一层扫描 + 通用库宿主固定收录（存在 docs/devref/cards/ 才算） */
  const gmDiscover = (): GmCardLib[] => {
    const roots = projectRootsOf()
    const seen = new Set<string>()
    const libs: GmCardLib[] = []
    let id = 0
    const scanDir = (dir: string): void => {
      let entries: Array<{ name: string; isDirectory: boolean }> = []
      try { entries = readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, isDirectory: e.isDirectory() })) } catch { return }
      for (const e of entries) {
        if (!e.isDirectory || e.name.startsWith('.')) continue
        const proj = join(dir, e.name)
        if (seen.has(proj)) continue
        const cardsDir = join(proj, 'docs', 'devref', 'cards')
        if (!existsSync(cardsDir)) continue
        seen.add(proj)
        const cards: Record<string, number> = {}
        for (const c of GM_CARD_FILES) {
          try { cards[c.type] = readFileSync(join(cardsDir, c.file), 'utf8').split(/\r?\n/).filter((l) => /^##\s+/.test(l)).length } catch { cards[c.type] = 0 }
        }
        libs.push({ id: id++, name: e.name, path: proj, generic: e.name === GM_GENERIC_PROJECT, cards, hasIndex: existsSync(join(proj, 'docs', 'devref', 'INDEX.md')) })
      }
    }
    for (const r of roots) scanDir(r)
    return libs
  }
  route('/pmg/overview', (_req, res) => {
    try {
      const libs = gmDiscover()
      const generic = libs.find((l) => l.generic) ?? null
      const projects = libs.filter((l) => !l.generic).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      sendJson(res, 200, {
        present: libs.length > 0,
        generic,
        projects,
        cardTypes: GM_CARD_FILES.map((c) => ({ type: c.type, label: c.label })),
        roots: projectRootsOf(),
        now: new Date().toISOString(),
      })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  })
  route('/pmg/cards', (req, res) => {
    try {
      const sp = new URL(req.url ?? '/', 'http://dsh.local').searchParams
      const id = Number(sp.get('id') ?? '-1')
      const type = sp.get('type') ?? ''
      const cardFile = GM_CARD_FILES.find((c) => c.type === type)
      if (!cardFile) return sendJson(res, 400, { error: 'bad card type' })
      const lib = gmDiscover().find((l) => l.id === id)
      if (!lib) return sendJson(res, 404, { error: 'card library not found' })
      const full = join(lib.path, 'docs', 'devref', 'cards', cardFile.file)
      if (!existsSync(full)) return sendJson(res, 200, { present: false, error: '该册尚不存在（空卡册）' })
      const text = readFileSync(full, 'utf8')
      const cards: Array<{ title: string; body: string }> = []
      let cur: { title: string; body: string[] } | null = null
      for (const l of text.split(/\r?\n/)) {
        const m = l.match(/^##\s+(.+)$/)
        if (m) {
          if (cur) cards.push({ title: cur.title, body: cur.body.join('\n').trim() })
          cur = { title: m[1].trim(), body: [] }
        } else if (cur) cur.body.push(l)
      }
      if (cur) cards.push({ title: cur.title, body: cur.body.join('\n').trim() })
      sendJson(res, 200, { present: true, lib: lib.name, type, label: cardFile.label, cards })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  })

  /* ---------- 插件集合视图（#3：suite 装配状态，只读；算法与 scheduler shoucang_suite 同源） ---------- */

  interface SuiteMemberRow { id: string; package: string; repo: string; role: string; status: string; injected: boolean; profiles: string[]; detail: string }
  const SUITE_MEMBERS: SuiteMemberRow[] = [
    { id: 'memory', package: '@dsh-external/dsh-managing-memory', repo: 'Fishsb/dsh-managing-memory', role: 'commander', status: '', injected: false, profiles: [], detail: '' },
    { id: 'governance', package: '@dsh-external/project-map-governance', repo: 'Fishsb/dsh-project-map-governance', role: 'executor', status: '', injected: false, profiles: [], detail: '' },
  ]
  const suiteScan = (): { members: SuiteMemberRow[]; summary: string } => {
    const base = join(homedir(), '.dsh')
    const home = process.env.DSH_HOME || base
    // 注入器 registry
    const regPath = join(home, 'super-injector', 'registry.json')
    const injectedNames = new Set<string>()
    try {
      const raw = JSON.parse(readFileSync(regPath, 'utf8')) as { name?: string }[]
      if (Array.isArray(raw)) for (const e of raw) if (e?.name) injectedNames.add(e.name)
    } catch { /* 无 registry → 空 */ }
    // profiles 装配清单
    const profilesDir = join(home, 'profiles')
    let profDirs: string[] = []
    try { profDirs = readdirSync(profilesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { /* none */ }
    const profileHits: Record<string, string[]> = {}
    for (const prof of profDirs) {
      try {
        const pj = JSON.parse(readFileSync(join(profilesDir, prof, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } }
        const names = new Set([...Object.keys(pj.dependencies || {}), ...(pj.dsh?.profile?.bundles || [])])
        for (const m of SUITE_MEMBERS) {
          const short = m.package.split('/').pop() || m.package
          if (names.has(m.package) || names.has(short)) (profileHits[m.id] = profileHits[m.id] || []).push(prof)
        }
      } catch { /* skip broken profile */ }
    }
    const members = SUITE_MEMBERS.map((m) => {
      const inInj = injectedNames.has(m.package)
      const profs = profileHits[m.id] || []
      const status = inInj && profs.length ? 'both' : inInj ? 'injected' : profs.length ? 'profile' : 'missing'
      const detail = status === 'both' ? `注入器+${profs.join(',')} profile` : status === 'injected' ? '注入器装配' : status === 'profile' ? `${profs.join(',')} profile 装配` : '两基准均未装配'
      return { ...m, status, injected: inInj, profiles: profs, detail }
    })
    return { members, summary: `成员 ${members.length}（present ${members.filter((m) => m.status !== 'missing').length} / missing ${members.filter((m) => m.status === 'missing').length}）` }
  }

  // 插件集合装配状态（只读；client「插件集合」视图数据源）
  route('/suite', (_req, res) => {
    try { sendJson(res, 200, suiteScan()) } catch (e) { sendJson(res, 500, { error: String(e) }) }
  })

  // R1 热记忆注入预览（排障/验证用，只读）
  route('/inject/preview', (_req, res) => {
    sendJson(res, 200, { text: buildHotMemoryText() })
  })

  // 注入装配统计：每轮提示词渲染调用 +1（验证新会话/每轮注入）
  route('/inject/stats', (_req, res) => {
    sendJson(res, 200, { calls: injectMeta.calls, lastAt: injectMeta.lastAt ? new Date(injectMeta.lastAt).toISOString() : null, root: activeRootOf()?.path ?? null })
  })

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

  const cmds = (ctx as unknown as { commands?: { register?(def: unknown): unknown } }).commands
  if (cmds && typeof cmds.register === 'function') {
    cmds.register({
      name: 'scnote',
      description: '以“笔记化”方式执行任务，并把执行过程整理为 笔记/ 文档（典型：网络检索/调研）',
      input: { hint: '<任务描述，如：调研 XXX>', images: false },
      handler: (invocation: { rawInput?: string }) => scnoteReply(invocation?.rawInput ?? ''),
    })
    ctx.logger?.info?.('[shoucang] /scnote 命令已注册')
  } else {
    ctx.logger?.warn?.('[shoucang] commands 能力不可用，/scnote 未注册')
  }

  ctx.effect(() => {
    ctx.logger?.info?.('[shoucang] host RPC ready v6: roots/config/save/toggle/boards(persona|tree|note|memory)/inject')
    // 注册 systemPrompt 注入块（每轮渲染，指针缓存 30s）
    const sp = (ctx as unknown as { systemPrompt?: { context?(opts: unknown): () => void } }).systemPrompt
    if (sp && typeof sp.context === 'function') {
      disposers.push(sp.context({
        name: 'shoucang-hot-memory',
        order: 88, // mneme: user-settings=85 / memory=90 —— 守藏热记忆在其间
        text: () => { injectMeta.calls++; injectMeta.lastAt = Date.now(); idleState.lastActiveAt = Date.now(); return buildHotMemoryText() },
      }))
      ctx.logger?.info?.('[shoucang] R1 热记忆注入挂点已注册 (systemPrompt.context: shoucang-hot-memory)')
    } else {
      ctx.logger?.warn?.('[shoucang] systemPrompt 能力不可用，R1 热记忆注入未注册')
    }
  // ── 空闲巩固轮（Letta-heartbeat 模式 · 2026-08-27）：蒸馏/合并/归档/结算 一体化 ──
  const PY = process.env.SHOUCANG_PY || (existsSync('C:/Users/lk/AppData/Roaming/dsh-pytools/Scripts/python.exe') ? 'C:/Users/lk/AppData/Roaming/dsh-pytools/Scripts/python.exe' : 'python')
  const _metaOf = (): string => { const r = activeRootOf(); return r ? join(r.path, '_meta') : '' }
  // 2d 配额代码化（落地方案）：idle 轮内 py 进程调用硬上限——防蒸馏/归档风暴失控（配合 _writeFacts 单轮落笔 15 上限）。
// 仅 consolidateRound 会话内计配额；RPC（/model/* /vector/* 等）为交互路径不受限（修：此前全局计数使 RPC 也被拒）
let pyRoundCalls = 0
let inConsolidate = false
const MAX_PY_PER_ROUND = 24
  const _runPy = (args: string[]): string => {
    if (inConsolidate) {
      if (++pyRoundCalls > MAX_PY_PER_ROUND) {
        ctx.logger?.warn?.(`[shoucang] py 轮内配额超限(>{MAX_PY_PER_ROUND} 次)，本轮后续调用被拒`)
        return JSON.stringify({ error: 'py-call-quota-exceeded', quota: MAX_PY_PER_ROUND })
      }
    }
    try { return execFileSync(PY, args, { encoding: 'utf8', timeout: 180000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) as string }
    catch (e) { const ee = e as { stderr?: Buffer | string; message?: string }; const err = typeof ee.stderr === 'string' ? ee.stderr : ((ee.stderr as Buffer) || Buffer.from('')).toString() || ee.message || String(e); ctx.logger?.warn?.(`[shoucang][idle] py 失败: ${String(err).slice(0, 160)}`); return String(err) }
  }
  const _cfgOf = (): { cfg: ReturnType<typeof parseView>; file: string } | null => {
    const f = configFileOf(); if (!f || !existsSync(f)) return null
    try { return { cfg: parseView(readFileSync(f, 'utf8')), file: f } } catch { return null }
  }
  const _sessionsDir = (cfg: { sessions_dir?: string } | null | ReturnType<typeof parseView>): string => {
    const c = String((cfg as { sessions_dir?: string } | null)?.sessions_dir || '').trim()
    if (c) return c
    const env = process.env.SHOUCANG_SESSIONS_DIR
    if (env) return env
    const probe = join(process.env.USERPROFILE || '', '.dsh', 'sessions')
    return existsSync(probe) ? probe : ''
  }
  const _latestSession = (dir: string): string => {
    let best = '', bestMs = 0
    const scan = (d: string, depth: number): void => {
      let items: import('node:fs').Dirent[] = []
      try { items = readdirSync(d, { withFileTypes: true }) as unknown as import('node:fs').Dirent[] } catch { return }
      for (const ent of items) {
        if (ent.name.startsWith('.')) continue
        const full = join(d, ent.name)
        if (ent.isDirectory()) { if (depth < 4) scan(full, depth + 1); continue }
        try {
          const st = statSync(full)
          if (!st.isFile() || st.size < 64) continue
          if (!/\.(jsonl|zstd|zst|json)$/i.test(ent.name)) continue
          if (/\.bak-/.test(ent.name)) continue
          if (st.mtimeMs > bestMs) { bestMs = st.mtimeMs; best = full }
        } catch { /* skip */ }
      }
    }
    scan(dir, 0)
    return best
  }
  const _decodeBuf = (buf: Buffer): string => {
    if (buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd) {
      const parts: Buffer[] = []
      let i = 0
      while (i + 4 <= buf.length) {
        if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) {
          let j = i + 4
          while (j + 4 <= buf.length && !(buf[j] === 0x28 && buf[j + 1] === 0xb5 && buf[j + 2] === 0x2f && buf[j + 3] === 0xfd)) j++
          try { parts.push((zstdDecompressSync as unknown as (b: Buffer) => Buffer)(buf.subarray(i + 4, j))) } catch { /* frame skip */ }
          i = j
        } else i++
      }
      return Buffer.concat(parts).toString('utf8')
    }
    return buf.toString('utf8')
  }
  const _maxSeq = (text: string): number => {
    let max = 0
    const re = /"seq"\s*:\s*(\d+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) { const n = parseInt(m[1], 10); if (n > max) max = n }
    return max || text.split('\n').length
  }
  const _registryRead = (): Record<string, { cutoff?: number }> => {
    const f = join(_metaOf(), '.distilled-sessions.json')
    if (!existsSync(f)) return {}
    try {
      // 注册表实际形状：{ version, sessions: [{ id, cutoff, ... }]} —— 数组转映射（2026-08-27 修复：此前按对象属性查找永远 miss，增量蒸馏从不生效）
      const j = JSON.parse(readFileSync(f, 'utf8')) as { sessions?: Array<{ id?: string; cutoff?: number }> }
      const out: Record<string, { cutoff?: number }> = {}
      for (const s of j.sessions || []) { if (s && s.id) out[s.id] = { cutoff: s.cutoff } }
      return out
    } catch { return {} }
  }
  const _markDistilled = (sid: string, cutoff: number): void => {
    const meta = _metaOf()
    if (!meta) return
    _runPy([join(meta, 'explicit_facts_extractor.py'), '--mark-distilled', sid, '--cutoff', String(cutoff)])
  }
  const _writeFacts = (facts: Array<{ text?: string; type?: string }>): { written: number; filtered: number; capped: number } => {
    const meta = _metaOf(); const root = activeRootOf()
    if (!meta || !root || !facts.length) return { written: 0, filtered: 0, capped: 0 }
    let written = 0, filtered = 0, capped = 0
    const seenSlugs = new Set<string>()
    const MAX_WRITES_PER_RUN = 15 // 单轮落笔上限（2026-08-27 风暴修复：101 条垃圾一次性入库的教训）
    for (const [i, f] of facts.entries()) {
      const txt = String(f.text || '').trim()
      if (!txt) continue
      // 写门前置质量门：与提取端 _is_garbage 同口径兜底（无 CJK 正文 / 工程残迹 / 结构碎片 / 多行 / 表格行 / 无句号收尾）
      const head = txt.slice(0, 80)
      if (!/[\u4e00-\u9fff]/.test(head) || /^\W{4,}/.test(txt.slice(0, 24)) || /\{\s*"/.test(head)
        || /^[A-Za-z0-9_/:.\s-]*(GET|POST)\s+\//.test(txt)
        || txt.includes('\n') || txt.trimStart().startsWith('|') || txt.includes(' | ') || txt.includes('`')
        || !/[。！？]$/.test(txt)
        || /不要记|别记|不用记|勿记|别写进记忆|无需记录|不必记录|别惦记/.test(txt)) { filtered++; continue }
      if (written + 1 > MAX_WRITES_PER_RUN) { capped++; continue }
      let slug = (txt.replace(/^[-*•\s·]+/, '').replace(/[\\/:*?"<>|{}()[\]·\s]/g, '-') || ('fact-' + i)).slice(0, 24)
      slug = slug.replace(/^-+/, '') || ('fact-' + i)
      // 批内去重：同名合并进同一条，不产生 -1/-2 序列文件
      if (seenSlugs.has(slug)) {
        written += 0; continue
      }
      seenSlugs.add(slug)
      const tmp = join(tmpdir(), 'shoucang-fact-' + Date.now() + '-' + i + '.md') // i 避免同毫秒碰撞（2026-08-27 修复：此前循环共用同名 tmp 内容互相污染）
      const md = '---\ntype: memory\nname: ' + slug + '\ntitle: "' + txt.slice(0, 20).replace(/"/g, '') + '"\nsubtype: ref\nstage: daily\nconfidence: 60\ncreated: ' + new Date().toISOString().slice(0, 10) + '\nupdated: ' + new Date().toISOString().slice(0, 10) + '\ndescription: 空闲巩固-蒸馏\n---\n\n' + txt + '\n'
      writeFileSync(tmp, md, 'utf8')
      const out = _runPy([join(meta, 'merge_check.py'), tmp, '--dir', '日记忆', '--apply'])
      if (out.includes('已写入') || out.includes('已合并')) { written++; continue }
      // 写门未落笔且非重复合并 → 视为被拒（如 suspect 分支异常），计数观察
      if (!out.includes('decision')) filtered++
    }
    return { written, filtered, capped }
  }
  const consolidateRound = (force = false): Record<string, unknown> => {
    const root = activeRootOf()
    if (!root) return { ok: false, error: 'no-active-root' }
    const got = _cfgOf()
    const res: { at: string; steps: Record<string, unknown>; skipped?: string; error?: string } = { at: new Date().toISOString(), steps: {} }
    const rawIdle = got ? (got.cfg as { idle_review_ms?: number }).idle_review_ms : undefined
    const idleMs = (rawIdle === undefined || rawIdle === null) ? 600000 : Number(rawIdle) // 0=禁用（falsy 修复）
    // 1b 心跳活动门（落地方案）：会话源最新文件 mtime 作为「用户活跃」旁证——R1 注入 off 时
    // lastActiveAt 不再随注入装配更新，但用户发消息会刷新会话 jsonl，据此不误触发心跳
    let sessionActiveMs = 0
    const idleSessDir = got ? _sessionsDir(got.cfg) : ''
    if (idleSessDir) {
      const f = _latestSession(idleSessDir)
      if (f) { try { sessionActiveMs = statSync(f).mtimeMs } catch { /* stat 失败忽略 */ } }
    }
    const activeSince = Math.max(idleState.lastActiveAt, sessionActiveMs)
    if (!force && idleMs > 0 && Date.now() - activeSince < idleMs) { res.skipped = 'not-idle-yet'; return res }
    if (idleState.running) { res.skipped = 'already-running'; return res }
    pyRoundCalls = 0 // 2d 配额：每轮开始归零
    inConsolidate = true // 配额仅作用于 consolidate 会话内（RPC 交互路径不受限）
    idleState.running = true
    try {
      const meta = _metaOf()
      const dir = _sessionsDir(got ? got.cfg : null)
      if (dir && meta) {
        const file = _latestSession(dir)
        if (!file) { res.steps.distill = { note: 'sessions_dir 内无会话文件' } }
        else {
          let text = ''
          let workFile = file
          if (/\.zst(a|d)?$/i.test(file)) {
            const dec = _runPy([join(meta, 'session_decode.py'), file, join(tmpdir(), 'shoucang-session-dec.jsonl')])
            text = readFileSync(join(tmpdir(), 'shoucang-session-dec.jsonl'), 'utf8')
            workFile = join(tmpdir(), 'shoucang-session-dec.jsonl')
          } else {
            try { text = _decodeBuf(readFileSync(file)) } catch { text = '' }
          }
          void workFile
          // sid 带会话目录名（session-<uuid>）：同名 session.jsonl.zstd 导出互不污染 cutoff 边界
          const _segs = file.split(/[\\/]/)
          const _fname = _segs.pop() || 's'
          const _folder = _segs.pop() || ''
          const sid = 'idle-' + (_folder ? _folder.replace(/[^A-Za-z0-9._-]+/g, '-') + '-' : '') + _fname.replace(/\.(zst|zstd|jsonl|md|txt)$/i, '')
          const tmp = join(tmpdir(), 'shoucang-session-' + Date.now() + '.jsonl')
          writeFileSync(tmp, text, 'utf8')
          const reg = _registryRead()[sid]
          const args = [join(meta, 'explicit_facts_extractor.py'), tmp, '--session', sid]
          if (reg && reg.cutoff != null) args.push('--cutoff', String(reg.cutoff))
          const out = _runPy(args)
          let facts: Array<{ text?: string; type?: string }> = []
          try { const j = JSON.parse(out) as { facts?: Array<{ text?: string; type?: string }> }; facts = Array.isArray(j.facts) ? j.facts : [] } catch { /* parse fail */ }
          if (facts.length) {
            const w = _writeFacts(facts)
            _markDistilled(sid, _maxSeq(text))
            res.steps.distill = { session: sid, facts: facts.length, written: w.written, filtered: w.filtered, capped: w.capped, attach: true }
            idleState.lastDistillAt = Date.now()
          } else {
            res.steps.distill = { session: sid, facts: 0, note: '无新事实或已蒸馏', raw: out.slice(-90) }
          }
          try { const fsx = require('node:fs') as { unlinkSync(p: string): void }; fsx.unlinkSync(tmp) } catch { /* 残留无害 */ }
        }
      } else {
        res.steps.distill = { note: '无会话源（需配置 idle.sessions_dir）' }
      }
      const rawInterval = got ? (got.cfg as { interval_hours?: number }).interval_hours : undefined
      const intervalH = (rawInterval === undefined || rawInterval === null) ? 24 : Number(rawInterval) // 0=禁用（falsy 修复）
      if (meta && intervalH > 0 && Date.now() - idleState.lastSettleAt >= intervalH * 3600000) {
        const out = _runPy([join(meta, 'lifecycle_settle.py'), 'settle', '--apply'])
        res.steps.settle = { ran: true, rawTail: out.slice(-100) }
        idleState.lastSettleAt = Date.now()
      } else { res.steps.settle = { ran: false } }
    } catch (e) {
      res.error = String(e).slice(0, 200)
    } finally {
      idleState.running = false
      inConsolidate = false // 配额会话结束
    }
    return res
  }
  route('/idle/status', (_req, res) => {
    const got = _cfgOf()
    sendJson(res, 200, { ...idleState, now: Date.now(), idleMs: got ? (got.cfg as { idle_review_ms?: number }).idle_review_ms ?? 600000 : 600000, sessionsDir: _sessionsDir(got ? got.cfg : null) })
  })
  route('/idle/consolidate', async (_req, res) => {
    sendJson(res, 200, consolidateRound(true))
  })

  // ---- 向量检索（召回面）：配置体检 + 重建/迁移重嵌 ----
  const _runVector = (args: string[]): { out: string; raw: string } => {
    const meta = _metaOf()
    if (!meta) return { out: JSON.stringify({ error: 'no-active-root' }), raw: '' }
    const raw = _runPy([join(meta, 'vector_search.py'), ...args])
    let out = ''
    try { out = raw.trim(); JSON.parse(out) } catch (e) { out = raw.trim() }
    return { out, raw }
  }
  route('/vector/status', (_req, res) => {
    const r = _runVector(['check'])
    sendJson(res, 200, safeJson(r.out))
  })
  route('/vector/build', async (req, res) => {
    const body = await readBody(req).catch(() => ({}))
    const force = !!(body as { force?: boolean }).force
    const r = _runVector(['build', ...(force ? ['--force'] : [])])
    if (force) injectCache.at = 0 // 索引重建后注入无关，但保持缓存策略一致
    const js = safeJson(r.out)
    sendJson(res, 200, { ...js, force })
  })

  // ---- 向量模型一键下载/部署（2026-08-27 · 框架+可选下载） ----
  const _runModel = (args: string[]): { out: string; ok: boolean } => {
    const meta = _metaOf()
    if (!meta) return { out: JSON.stringify({ error: 'no-active-root' }), ok: false }
    const raw = _runPy([join(meta, 'model_manager.py'), ...args])
    const j = safeJson(raw.trim() || '{}')
    return { out: raw.trim(), ok: !(j as { error?: string }).error }
  }
  route('/model/list', (_req, res) => {
    const r = _runModel(['list'])
    sendJson(res, 200, r.ok ? safeJson(r.out) : { error: r.out.slice(0, 400) })
  })
  route('/model/pull', async (req, res) => {
    const body = await readBody(req).catch(() => ({})) as { id?: string; repo?: string; dim?: number }
    const id = String(body.id || '').trim()
    const repo = String(body.repo || '').trim()
    if (!id || !repo) return sendJson(res, 400, { error: '需要 id 与 repo' })
    const meta = _metaOf()
    if (!meta) return sendJson(res, 400, { error: 'no-active-root' })
    // 后台下载（模型数百 MB，同步会卡 RPC）：detached spawn + 前端轮询 /model/progress
    const py = PY
    const child = spawn(py as string, [join(meta, 'model_manager.py'), 'pull', id, repo, '--dim', String(body.dim || 1024)],
      { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    sendJson(res, 200, { ok: true, started: true, id, repo, hint: '轮询 /model/progress' })
  })
  route('/model/progress', async (req, res) => {
    const body = await readBody(req).catch(() => ({})) as { id?: string }
    const id = String(body.id || '').trim()
    if (!id) return sendJson(res, 400, { error: 'id required' })
    const r = _runModel(['progress', id])
    sendJson(res, 200, safeJson(r.out))
  })
  route('/model/import', async (_req, res) => {
    // 打开本地文件夹选择器：复用插件生态的 ctx.directoryPicker.pick()（系统对话框）
    const picker = (ctx as unknown as { directoryPicker?: { pick(signal?: AbortSignal): Promise<string | null> } }).directoryPicker
    if (!picker?.pick) return sendJson(res, 400, { error: 'directoryPicker 能力不可用（宿主未装配目录选择器）' })
    let dir: string | null = null
    try { dir = await picker.pick() } catch (e) { return sendJson(res, 500, { error: '目录选择器失败: ' + String((e as Error).message || e).slice(0, 160) }) }
    if (!dir) return sendJson(res, 200, { ok: false, cancelled: true })
    const r = _runModel(['import', dir])
    const j = safeJson(r.out) as { error?: string }
    // 只登记不接管配置：用户点「部署并启用」时才自动写 embedding（单一职责）
    sendJson(res, 200, { ...(j as Record<string, unknown>), picked: dir })
  })
  route('/model/deploy', async (req, res) => {
    const body = await readBody(req).catch(() => ({})) as { id?: string; port?: number; dim?: number }
    const id = String(body.id || '').trim()
    if (!id) return sendJson(res, 400, { error: 'id required' })
    const r = _runModel(['deploy', id, ...(body.port ? ['--port', String(body.port)] : []), ...(body.dim ? ['--dim', String(body.dim)] : [])])
    const j = safeJson(r.out) as { ok?: boolean; port?: number; dim?: number; error?: string }
    if (!j.error) {
      // 一键生效：自动写 embedding 配置（setKey 定位既有行；写前备份）
      const file = configFileOf()
      if (file && j.port) {
        let next: string | null = null
        try {
          next = setKey(readFileSync(file, 'utf8'), 'shoucang.embedding.base_url', `http://127.0.0.1:${j.port}`)
          if (next) {
            next = setKey(next, 'shoucang.embedding.model', id)
            if (next && j.dim) next = setKey(next, 'shoucang.embedding.dimension', String(j.dim))
          }
        } catch { next = null }
        if (next) { backupThenWrite(file, next); injectCache.at = 0 }
      }
    }
    sendJson(res, 200, { ...j, configured: !j.error && !!j.port })
  })
  const hb = setInterval(() => { try { consolidateRound(false) } catch { /* 心跳异常不阻塞 */ } }, 60000)
  disposers.push(() => clearInterval(hb))


    return () => { for (const d of disposers) d() }
  }, '@dsh-external/shoucang-panel: http rpc + hot memory injection')
}
