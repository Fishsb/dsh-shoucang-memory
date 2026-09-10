/**
 * treeops.ts — 深睡 treeOps 最小通道 v1（模型自动维护树第一档；2026-09-10 用户拍板）。
 *
 * 定位：树状记忆由模型自动维护（memory-core-model §2.7.2）——模型在深度睡眠归纳里输出「结构提案」
 * （treeOps），本模块=宿主执行层，只守不变量（锚存在 / 指针不悬空 / 无孤儿 / 操作前归档可回滚 /
 * 索引整文件过 memory_write_gate / 幂等）。层义为模型规范；确定性兜底（v6 唯一门 / consolidation
 * 叶子合并）留在宿主既有通道不变。
 *
 * v1 操作集（最小、安全）：
 *   - rename：同 notes 文件内匹配的标题行（以 ## 或 ### 开头；标题文本与 oldTitle 双向包含或相等）
 *     改为新标题；随后 MEMORY.md/USER.md/AGENT.md 索引行中指向 `notes/<file>.md §…`、且 §token 与
 *     oldTitle 双向包含的指针 token 改写为新标题（仅替换匹配段，保留行其余部分与格式）。
 *   - merge：同文件内两个**均为叶子小节**的标题（canonical=keepTitle；dropTitle 正文中 canonical
 *     不存在的非空行逐行精确去重后追加到 canonical 正文末尾；删除 dropTitle 标题及其正文）；
 *     索引行指向 dropTitle 的指针 token 改写为 keepTitle；找不到 / 任一非叶子 → 跳过该 op 不改任何内容。
 *   - split/move/attach-clone：v1 范围外（后续档；注释预留）。
 *
 * 宿主纪律：
 *   - 防御式：单 op 全程 try/catch，任何异常仅 hooks.log 并跳过该 op，绝不抛出。
 *   - 归档：每轮 <memRoot>/audit/treeops/treeops-<YYYYMMDD-HHmmss>.jsonl——每个 op 应用前记录一行
 *     {op, 相关小节原文}（rename 记标题原/新；merge 记两个小节全文与去向），可回滚证据。
 *   - 文件写：只改确有变化的目标文件；每文件 tmp 写 + rename 原子覆盖（对齐本仓记忆库落盘纪律）。
 *   - 自查（宿主不做 notes 正文 gate，notes 非主文档）：① rename 落盘后该文件标题不产生重复——
 *     同层同名双向包含即冲突 → 回滚该 op（不落盘、计 skipped）；② 索引改写不产生重复指针——
 *     同 target 同新 § 已有其它行 → 跳过该指针改写并 skipped；③ 索引文件（MEMORY/USER/AGENT）
 *     改写走同样 tmp+rename，且改写前对整文件调 join(memRoot,'scripts','memory_write_gate.mjs')
 *     （脚本不存在 → 跳过 gate 仅自查）；exit≠0 → 放弃该索引文件改写并 skipped。
 *   - 幂等：目标标题/小节已不存在、标题已等于新标题、指针 token 同文 → no-op 计 skipped，不改内容。
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface TreeOp {
  action: 'rename' | 'merge'
  file: string
  oldTitle?: string
  newTitle?: string
  keepTitle?: string
  dropTitle?: string
}

export interface TreeOpsHooks {
  audit(o: Record<string, unknown>): void
  log(m: string): void
}

export interface TreeOpsResult {
  applied: number // 主结构变更已落盘的 op 数（rename 标题已改 / merge 已并入并删除 drop）
  skipped: number // 被跳过的 op 数 + 指针改写子跳过数（阻塞/冲突/gate 拒/异常）
  archived: number // 本轮归档记录条数（每个解析通过的 op 应用前一行）
}

// ── 子进程 gate 运行（与 distill.ts runNode 同构；nodeBin=process.execPath，无 PATH 依赖）──
type RunResult = { status: number | null; out: string; err: string }
function runNodeBin(args: string[], opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<RunResult> {
  return new Promise((resolve) => {
    let out = '', err = '', killed = false
    // 子进程剥离 --inspect/--debug 类 NODE_OPTIONS（宿主调试端口二次占用会干扰 gate 判定/误杀子进程）
    const env: Record<string, string | undefined> = { ...process.env }
    env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '').split(/\s+/)
      .filter((t) => t && !/^--(inspect|inspect-brk|debug|debug-brk)(=.*)?$/.test(t)).join(' ')
    if (opts?.env) Object.assign(env, opts.env)
    const child = spawn(process.execPath || 'node', args, {
      cwd: opts?.cwd, env: env as NodeJS.ProcessEnv, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    } as any)
    const to = setTimeout(() => { killed = true; try { child.kill() } catch { /* */ } }, opts?.timeout ?? 60000)
    child.stdout?.on('data', (d) => { out += d })
    child.stderr?.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(to); resolve({ status: null, out: '', err: String(e).slice(0, 200) }) })
    child.on('close', (code) => { clearTimeout(to); resolve({ status: killed ? null : code, out, err }) })
  })
}

// ── 命名/核心名口径（与 distill.ts consolidateTree / memory_write_gate 一致）──
// 小节标题核心名：去行尾「（20xx-…维护元信息）」父括号；索引 §token 与标题按核心名双向包含匹配
const CORE_TAIL_RE = /\s*[（(]\s*20\d{2}[-/]\d{1,2}[-/]\d{1,2}[^）)]*[）)]\s*$/
const coreName = (t: string): string => String(t || '').trim().replace(CORE_TAIL_RE, '').trim()
/** 双向包含（核心名口径）：x===y || x.includes(y) || y.includes(x) */
const biContains = (a: string, b: string): boolean => {
  const x = coreName(a); const y = coreName(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}
const coreKey = (t: string): string => coreName(t).toLowerCase()
// 标题可安全出现在 notes/索引 §token 里的字符集（/ § → 会破坏 §A/§B 指针列表语法 → 拒）
const TITLE_OK = (t: string): boolean => !/[#`\n\r]/.test(t) && !/[\/§→]/.test(coreName(t)) && coreName(t).length > 0 && t.length <= 120

// ── 文件/小节解析 ──
type Section = { idx: number; level: number; title: string; end: number; leaf: boolean; body: string[]; bodyIdx: number[] }
const HEAD_RE = /^(#{2,})[ \t]+(.*)$/
/** 小节解析：标题到「下一个同层或更高层标题」之间；正文=区间内排除更深子树段的行；leaf=区间内无更深标题 */
function parseSections(ls: string[]): Section[] {
  const heads: Array<{ i: number; level: number; title: string }> = []
  for (let i = 0; i < ls.length; i++) {
    const m = HEAD_RE.exec(ls[i])
    if (m) heads.push({ i, level: m[1].length, title: m[2].trim() })
  }
  const levelAt = new Map<number, number>()
  heads.forEach((h) => levelAt.set(h.i, h.level))
  const out: Section[] = []
  for (let k = 0; k < heads.length; k++) {
    const h = heads[k]
    let end = ls.length
    for (let kk = k + 1; kk < heads.length; kk++) { if (heads[kk].level <= h.level) { end = heads[kk].i; break } }
    let leaf = true
    const body: string[] = []
    const bodyIdx: number[] = []
    let p = h.i + 1
    while (p < end) {
      const lv = levelAt.get(p)
      if (lv !== undefined && lv > h.level) {
        leaf = false // 更深子标题区：整段跳过（子树不属本小节正文）
        let q = p + 1
        while (q < ls.length) { const l2 = levelAt.get(q); if (l2 !== undefined && l2 <= lv) break; q++ }
        p = q
        continue
      }
      body.push(ls[p]); bodyIdx.push(p); p++
    }
    out.push({ idx: h.i, level: h.level, title: h.title, end, leaf, body, bodyIdx })
  }
  return out
}

/** 归一化 op.file（容忍 `notes/x.md` 与 `x.md` 两种写法；禁 INDEX.md/穿越路径） */
function normalizeNotesFile(f: unknown): string | null {
  const raw = String(f || '').trim().replace(/\\/g, '/')
  const name = raw.startsWith('notes/') ? raw.slice('notes/'.length) : raw
  if (!/^[A-Za-z0-9_-]+\.md$/i.test(name)) return null
  if (name.toLowerCase() === 'index.md') return null
  return name
}

// ── 整文件原子写（tmp + rename；对齐记忆库落盘纪律）──
function atomicWrite(p: string, text: string): boolean {
  const tmp = p + '.tmp'
  try {
    writeFileSync(tmp, text, 'utf8')
    renameSync(tmp, p)
    return true
  } catch {
    try { unlinkSync(tmp) } catch { /* */ }
    return false
  }
}
/** 既有行整理口径：空行压缩 + 末尾单换行（与 applyPrinciples/applyPointerOps/consolidateTree 一致） */
const finalize = (ls: string[]): string => ls.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n')
const readLines = (p: string): string[] | null => {
  try { return readFileSync(p, 'utf8').split(/\r?\n/) } catch { return null }
}

/** § 指针 token 改写：`notes/<nf>` 之后至下一个 notes/ 或 → 之前的 § 段中，与 oldCore 双向包含的 token → §newCore。
 *  仅替换匹配段、保留行其余部分；纯「§A/§B」语法段整段归一（去空 token、同目标折叠）；返回 null=未变。 */
function rewriteRowPointers(raw: string, nf: string, oldCore: string, newCore: string): string | null {
  const token = `notes/${nf}`
  if (!raw.includes(token)) return null
  let out = ''
  let cursor = 0
  let pos = raw.indexOf(token)
  let changed = false
  while (pos >= 0) {
    out += raw.slice(cursor, pos + token.length)
    let end = raw.length
    const nx = raw.indexOf('notes/', pos + token.length)
    const nxArrow = raw.indexOf('→', pos + token.length)
    if (nx >= 0 && nx < end) end = nx
    if (nxArrow >= 0 && nxArrow < end) end = nxArrow
    let seg = raw.slice(pos + token.length, end)
    const firstSeg = seg
    let segChanged = false
    seg = seg.replace(/(§[^§/]*)/g, (whole) => {
      const kw = coreName(whole.replace(/^§+/, '').trim())
      if (!kw) return whole
      if (biContains(kw, oldCore)) { changed = true; segChanged = true; return `§${newCore}` }
      return whole
    })
    if (segChanged) {
      // 纯「§A/§B」（可带空白）才整段归一：去空 token、同目标重复折叠、统一 ` §A/§B` 风格；
      // 含杂散文本则只做 token 替换不改其余（保留行其余部分与格式）
      const gm = /^\s*((?:§[^§/→]*)(?:\s*\/\s*(?:§[^§/→]*))*)\s*$/.exec(seg)
      if (gm) {
        const seen = new Set<string>()
        const norm: string[] = []
        const tokRe = /§([^§/]+)/g
        let tm: RegExpExecArray | null
        while ((tm = tokRe.exec(gm[1]))) {
          const core = coreName(tm[1].trim())
          if (!core || seen.has(core)) continue
          seen.add(core)
          norm.push(`§${core}`)
        }
        if (norm.length) {
          const lead = /^\s/.test(firstSeg) ? ' ' : ''
          const trail = /\s$/.test(firstSeg) ? ' ' : ''
          seg = lead + norm.join('/') + trail
        }
      }
    }
    out += seg
    cursor = end
    if (end >= raw.length) break
    pos = raw.indexOf(token, end)
  }
  out += raw.slice(cursor)
  return changed ? out : null
}

/** 收集一行内 `notes/<nf>` 之后 §token 的核心名（小写；供重复指针自查） */
function rowPointerKeys(raw: string, nf: string): string[] {
  const token = `notes/${nf}`
  const keys: string[] = []
  if (!raw.includes(token)) return keys
  let pos = raw.indexOf(token)
  while (pos >= 0) {
    let end = raw.length
    const nx = raw.indexOf('notes/', pos + token.length)
    const nxArrow = raw.indexOf('→', pos + token.length)
    if (nx >= 0 && nx < end) end = nx
    if (nxArrow >= 0 && nxArrow < end) end = nxArrow
    const seg = raw.slice(pos + token.length, end)
    const tokRe = /§([^§/]+)/g
    let m: RegExpExecArray | null
    while ((m = tokRe.exec(seg))) {
      const core = coreName(m[1].trim())
      if (core) keys.push(core.toLowerCase())
    }
    if (end >= raw.length) break
    pos = raw.indexOf(token, end)
  }
  return keys
}

/** gate 运行：脚本位于 <memRoot>/scripts/memory_write_gate.mjs（不存在 → 'absent'） */
async function runIndexGate(memRoot: string, target: string, tmp: string): Promise<'pass' | 'fail' | 'absent'> {
  const gateScript = join(memRoot, 'scripts', 'memory_write_gate.mjs')
  if (!existsSync(gateScript)) return 'absent'
  const env: Record<string, string> = { MEMORY_ROOT: memRoot }
  for (const k of ['SHOUCANG_CAP_MEMORY', 'SHOUCANG_CAP_USER', 'SHOUCANG_CAP_AGENT']) {
    if (process.env[k]) env[k] = process.env[k] as string
  }
  try {
    const r = await runNodeBin([gateScript, target, tmp], { env, timeout: 20000 })
    if (r.status === 0) return 'pass'
    return 'fail'
  } catch {
    return 'fail'
  }
}

/** 单索引文件指针改写规划（含重复指针自查；dupGuard=rename 打开、merge 关闭——merge 改写无条件，见 v1 操作集 §2） */
function planIndexRewrite(
  lines: string[], nf: string, oldCore: string, newCore: string, dupGuard: boolean,
): { out: string[]; blocked: number; changedRows: number } {
  const token = `notes/${nf}`
  const isIdxRow = (s: string): boolean => /^\[[^\]\s]+\]/.test(s)
  const affected: number[] = []
  lines.forEach((l, i) => {
    if (!l.trim() || !isIdxRow(l.trim()) || !l.includes(token)) return
    const cand = rewriteRowPointers(l, nf, oldCore, newCore)
    if (cand !== null && cand !== l) affected.push(i)
  })
  const out = lines.slice()
  let blocked = 0
  if (!affected.length) return { out, blocked, changedRows: 0 }
  const seen = new Set<string>() // 既存「其它行」指针目标（notes 文件|§核心）
  for (let i = 0; i < lines.length; i++) {
    if (affected.includes(i)) continue
    for (const k of rowPointerKeys(lines[i], nf)) seen.add(`${nf}|${k}`)
  }
  let changedRows = 0
  for (const i of affected) {
    const cand = rewriteRowPointers(lines[i], nf, oldCore, newCore) as string
    const keys = rowPointerKeys(cand, nf)
    const collide = dupGuard && keys.some((k) => seen.has(`${nf}|${k}`))
    if (collide) {
      blocked++ // 跳过该指针改写（行保留原样）；spec：同 target 同新 § 已有其它行
      continue
    }
    out[i] = cand
    changedRows++
    for (const k of keys) seen.add(`${nf}|${k}`)
  }
  return { out, blocked, changedRows }
}

type Ctx = { memRoot: string; hooks: TreeOpsHooks; archFile: string; archived: number }

function safeAudit(hooks: TreeOpsHooks, o: Record<string, unknown>): void { try { hooks.audit(o) } catch { /* */ } }
function safeLog(hooks: TreeOpsHooks, m: string): void { try { hooks.log(m) } catch { /* */ } }

/**
 * 深睡 treeOps 最小通道 v1 宿主执行：模型提结构提案（rename/merge），宿主守不变量执行。
 * 全程防御式（单 op 异常仅 log 并跳过），绝不抛出；返回 {applied, skipped, archived}。
 */
export async function applyTreeOps(memRoot: string, ops: TreeOp[], hooksIn?: TreeOpsHooks): Promise<TreeOpsResult> {
  const hooks: TreeOpsHooks = hooksIn || { audit: () => { /* */ }, log: () => { /* */ } }
  const result: TreeOpsResult = { applied: 0, skipped: 0, archived: 0 }
  const list = Array.isArray(ops) ? ops : []
  if (!list.length) {
    safeAudit(hooks, { kind: 'treeops', ops: 0, applied: 0, skipped: 0, archived: 0 })
    safeLog(hooks, 'treeops: 应用 0 / 跳过 0 / 归档 0')
    return result
  }
  const root = String(memRoot || '')
  if (!root) {
    safeAudit(hooks, { kind: 'treeops', ops: list.length, applied: 0, skipped: list.length, archived: 0, reason: 'memRoot 为空' })
    safeLog(hooks, `treeops: memRoot 为空，跳过 ${list.length} 个 op`)
    result.skipped = list.length
    return result
  }
  const ctx: Ctx = { memRoot: root, hooks, archFile: '', archived: 0 }
  try {
    const dir = join(root, 'audit', 'treeops')
    mkdirSync(dir, { recursive: true })
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
    ctx.archFile = join(dir, `treeops-${stamp}.jsonl`)
  } catch (e) {
    // 归档目录建不成 → 本轮不做结构手术（无回滚证据纪律优先），全部跳过并如实审计
    result.skipped = list.length
    safeAudit(hooks, { kind: 'treeops', ops: list.length, applied: 0, skipped: list.length, archived: 0, reason: `归档目录不可建: ${String((e as Error)?.message || e).slice(0, 80)}` })
    safeLog(hooks, `treeops: 归档目录不可建，跳过 ${list.length} 个 op（可回滚证据优先）`)
    return result
  }
  const archive = (o: Record<string, unknown>): void => {
    try {
      appendFileSync(ctx.archFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8')
      ctx.archived++
    } catch { /* 单条归档失败静默：不影响主流程（防御式） */ }
  }

  for (const raw of list) {
    try {
      const v = parseOp(raw)
      if (typeof v === 'string') {
        safeLog(hooks, `treeops: 跳过 op（${v}）: ${JSON.stringify(raw).slice(0, 160)}`)
        result.skipped++
        continue
      }
      if (v.kind === 'rename') {
        const r = await runRename(ctx, v, archive)
        result.applied += r.applied; result.skipped += r.skipped
        continue
      }
      const r = await runMerge(ctx, v, archive)
      result.applied += r.applied; result.skipped += r.skipped
    } catch (e) {
      // 防御式：任何异常只 log 并跳过该 op，绝不抛出
      safeLog(hooks, `treeops: op 异常（跳过）: ${String((e as Error)?.message || e).slice(0, 160)}`)
      result.skipped++
    }
  }
  result.archived = ctx.archived
  safeAudit(hooks, { kind: 'treeops', ops: list.length, applied: result.applied, skipped: result.skipped, archived: result.archived })
  safeLog(hooks, `treeops: 应用 ${result.applied} / 跳过 ${result.skipped} / 归档 ${result.archived}`)
  return result
}

// ── op 解析（宽松：读取时按需取字段；非法/越权一律跳过）──
type ParsedRename = { kind: 'rename'; file: string; oldTitle: string; newTitle: string; oldCore: string; newCore: string }
type ParsedMerge = { kind: 'merge'; file: string; keepTitle: string; dropTitle: string; keepCore: string; dropCore: string }
type ParsedOp = ParsedRename | ParsedMerge

function parseOp(raw: TreeOp): ParsedOp | string {
  if (!raw || typeof raw !== 'object') return 'op 非对象'
  const file = normalizeNotesFile((raw as any).file)
  if (!file) return 'file 非法（须 notes/<白名单名>.md 或 <名>.md，非 INDEX.md）'
  const action = String((raw as any).action || '')
  if (action === 'rename') {
    const oldTitle = String((raw as any).oldTitle || '').trim()
    const newTitle = String((raw as any).newTitle || '').trim()
    if (!oldTitle || !newTitle) return 'rename 缺 oldTitle/newTitle'
    if (!TITLE_OK(newTitle)) return 'rename newTitle 非法（禁 #/`/换行/指针语法字符）'
    const oldCore = coreName(oldTitle); const newCore = coreName(newTitle)
    if (!oldCore || !newCore || oldCore.toLowerCase() === newCore.toLowerCase()) return 'rename 新旧标题核心名缺失或相同'
    return { kind: 'rename', file, oldTitle, newTitle, oldCore, newCore }
  }
  if (action === 'merge') {
    const keepTitle = String((raw as any).keepTitle || '').trim()
    const dropTitle = String((raw as any).dropTitle || '').trim()
    if (!keepTitle || !dropTitle) return 'merge 缺 keepTitle/dropTitle'
    const keepCore = coreName(keepTitle); const dropCore = coreName(dropTitle)
    if (!keepCore || !dropCore) return 'merge 标题核心名缺失'
    if (keepCore.toLowerCase() === dropCore.toLowerCase()) return 'merge keep/drop 核心名相同'
    if (!TITLE_OK(keepTitle) || !TITLE_OK(dropTitle)) return 'merge 标题非法（禁 #/`/换行/指针语法字符）'
    return { kind: 'merge', file, keepTitle, dropTitle, keepCore, dropCore }
  }
  return 'action 非 rename/merge（v1 不含 split/move/attach-clone）'
}

/** 标题匹配：核心名精确优先，无精确时唯一双向包含；仍歧义（>1）→ 不匹配（宁缺毋滥） */
function matchSection(sections: Section[], kw: string): { sec: Section; exact: boolean } | null {
  const exact = sections.filter((s) => coreKey(s.title) === coreKey(kw))
  if (exact.length === 1) return { sec: exact[0], exact: true }
  const loose = sections.filter((s) => biContains(s.title, kw))
  if (loose.length === 1) return { sec: loose[0], exact: false }
  return null
}

async function runRename(ctx: Ctx, v: ParsedRename, archive: (o: Record<string, unknown>) => void): Promise<{ applied: number; skipped: number }> {
  const { memRoot, hooks } = ctx
  const notePath = join(memRoot, 'notes', v.file)
  const lines = readLines(notePath)
  if (!lines) {
    archive({ action: 'rename', file: `notes/${v.file}`, oldTitle: v.oldTitle, newTitle: v.newTitle, outcome: 'skipped', reason: 'notes 文件缺失/不可读' })
    safeLog(hooks, `treeops: rename ${v.file} 跳过：文件缺失/不可读`)
    return { applied: 0, skipped: 1 }
  }
  const sections = parseSections(lines)
  // 只匹配 ## 与 ### 开头标题行（v1 口径）
  const scope = sections.filter((s) => s.level === 2 || s.level === 3)
  const hit = matchSection(scope, v.oldTitle)
  if (!hit) {
    archive({ action: 'rename', file: `notes/${v.file}`, oldTitle: v.oldTitle, newTitle: v.newTitle, outcome: 'skipped', reason: '标题未找到或匹配歧义' })
    safeLog(hooks, `treeops: rename ${v.file} §${v.oldTitle} 跳过：标题未找到或匹配歧义（宁缺毋滥）`)
    return { applied: 0, skipped: 1 }
  }
  const sec = hit.sec
  const headingOriginal = lines[sec.idx]
  // 保留原标题行层级标记（## 或 ###），文本改为新标题
  const markerLen = (headingOriginal.match(/^#+/) || ['##'])[0].length
  const newHeading = `${'#'.repeat(markerLen)} ${v.newTitle}`
  // 自查①：改动后该文件标题不产生重复（同层同名双向包含即冲突 → 回滚该 op：不落盘、计 skipped）
  const newCore = v.newCore
  const conflict = scope.some((s) => s.idx !== sec.idx && s.level === sec.level && biContains(s.title, newCore))
  if (conflict) {
    archive({ action: 'rename', file: `notes/${v.file}`, oldTitle: v.oldTitle, newTitle: v.newTitle, headingOriginal, headingNew: newHeading, outcome: 'skipped', reason: '同层同名双向包含冲突（回滚不落盘）' })
    safeLog(hooks, `treeops: rename ${v.file} §${v.oldTitle} → ${v.newTitle} 跳过：同层重名冲突（回滚）`)
    return { applied: 0, skipped: 1 }
  }
  archive({ action: 'rename', file: `notes/${v.file}`, oldTitle: v.oldTitle, newTitle: v.newTitle, headingOriginal, headingNew: newHeading })
  const next = lines.slice()
  next[sec.idx] = newHeading
  const body = finalize(next)
  if (body === finalize(lines)) {
    // 幂等 no-op（标题文本已等于目标）
    safeLog(hooks, `treeops: rename ${v.file} §${v.oldTitle} no-op（标题已等于新标题）`)
    return { applied: 0, skipped: 1 }
  }
  if (!atomicWrite(notePath, body)) {
    safeLog(hooks, `treeops: rename ${v.file} 落盘失败（跳过）`)
    return { applied: 0, skipped: 1 }
  }
  // 索引指针改写（MEMORY/USER/AGENT；指向 `notes/<file>.md §…` 且 §token 与 oldTitle 双向包含 → 新标题）
  let skipped = 0
  for (const idxFile of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
    const r = await rewriteOneIndex(ctx, idxFile, v.file, v.oldCore, v.newCore, true, v)
    skipped += r
  }
  return { applied: 1, skipped }
}

async function runMerge(ctx: Ctx, v: ParsedMerge, archive: (o: Record<string, unknown>) => void): Promise<{ applied: number; skipped: number }> {
  const { memRoot, hooks } = ctx
  const notePath = join(memRoot, 'notes', v.file)
  const lines = readLines(notePath)
  if (!lines) {
    archive({ action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle, outcome: 'skipped', reason: 'notes 文件缺失/不可读' })
    safeLog(hooks, `treeops: merge ${v.file} 跳过：文件缺失/不可读`)
    return { applied: 0, skipped: 1 }
  }
  const sections = parseSections(lines)
  const keep = matchSection(sections, v.keepTitle)
  const drop = matchSection(sections, v.dropTitle)
  if (!keep || !drop) {
    archive({ action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle, outcome: 'skipped', reason: keep ? 'drop 未找到/歧义' : 'keep 未找到/歧义' })
    safeLog(hooks, `treeops: merge ${v.file} 跳过：keep/drop 未找到或匹配歧义`)
    return { applied: 0, skipped: 1 }
  }
  if (keep.sec.idx === drop.sec.idx) {
    archive({ action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle, outcome: 'skipped', reason: 'keep=drop 同一小节' })
    return { applied: 0, skipped: 1 }
  }
  // v1 守卫：两个均须为叶子小节（标题到下一个同层/更高层标题之间不含更深标题）——带子树树干不并（树枝去向不明）
  if (!keep.sec.leaf || !drop.sec.leaf) {
    const why = !keep.sec.leaf ? 'keep 非叶子（含更深标题）' : 'drop 非叶子（含更深标题）'
    archive({
      action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle, outcome: 'skipped', reason: why,
      keepSection: lines.slice(keep.sec.idx, keep.sec.end).join('\n'),
      dropSection: lines.slice(drop.sec.idx, drop.sec.end).join('\n'),
    })
    safeLog(hooks, `treeops: merge ${v.file} ${v.dropTitle}→${v.keepTitle} 跳过：${why}`)
    return { applied: 0, skipped: 1 }
  }
  const keepRaw = lines.slice(keep.sec.idx, keep.sec.end).join('\n')
  const dropRaw = lines.slice(drop.sec.idx, drop.sec.end).join('\n')
  // 逐行精确去重：drop 正文中 canonical 不存在的非空行（trim 口径）→ 追加到 canonical 正文末尾
  const have = new Set<string>()
  for (const l of keep.sec.body) { const t = l.trim(); if (t) have.add(t) }
  const extra: string[] = []
  for (const l of drop.sec.body) {
    const t = l.trim()
    if (!t || have.has(t)) continue
    have.add(t)
    extra.push(l) // 原样保留（非空行逐行精确去重；不做 - 前缀改写——v1 merge 直并正文行）
  }
  // 手术：先删 drop 区间，再在 canonical 正文末尾插入 extra
  const reduced = lines.slice(0, drop.sec.idx).concat(lines.slice(drop.sec.end))
  const keepIdx2 = drop.sec.idx < keep.sec.idx ? keep.sec.idx - (drop.sec.end - drop.sec.idx) : keep.sec.idx
  let slot = reduced.length
  for (let q = keepIdx2 + 1; q < reduced.length; q++) {
    const m = HEAD_RE.exec(reduced[q])
    if (m && m[1].length <= keep.sec.level) { slot = q; break }
  }
  let ins = keepIdx2 + 1
  for (let q = keepIdx2 + 1; q < slot; q++) { if (reduced[q].trim() !== '') ins = q + 1 }
  const merged = reduced.slice(0, ins).concat(extra, reduced.slice(ins))
  const mergedBody = finalize(merged)
  archive({
    action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle,
    canonicalHeading: keep.sec.title, into: `notes/${v.file} §${coreName(keep.sec.title)}`,
    keepSection: keepRaw, dropSection: dropRaw, appended: extra,
  })
  if (mergedBody === finalize(lines)) {
    safeLog(hooks, `treeops: merge ${v.file} ${v.dropTitle}→${v.keepTitle} no-op（内容无变化）`)
    return { applied: 0, skipped: 1 }
  }
  if (!atomicWrite(notePath, mergedBody)) {
    safeLog(hooks, `treeops: merge ${v.file} 落盘失败（跳过）`)
    return { applied: 0, skipped: 1 }
  }
  // 索引行指向 dropTitle 的指针 token → keepTitle（改写无条件，见 v1 操作集 §2；仍整文件过 gate）
  let skipped = 0
  for (const idxFile of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
    const r = await rewriteOneIndex(ctx, idxFile, v.file, v.dropCore, v.keepCore, false, v)
    skipped += r
  }
  return { applied: 1, skipped }
}

/** 单索引文件改写：+1=该文件改写被放弃/有行被跳过（子跳过计数）；0=无需改写或全部落盘 */
async function rewriteOneIndex(ctx: Ctx, idxFile: string, notesFile: string, oldCore: string, newCore: string, dupGuard: boolean, v: ParsedOp): Promise<number> {
  const { memRoot, hooks } = ctx
  const p = join(memRoot, idxFile)
  const lines = readLines(p)
  if (!lines) return 0 // 索引文件缺失 = 无需改写（库缺件场景由部署口径管）
  const plan = planIndexRewrite(lines, notesFile, oldCore, newCore, dupGuard)
  if (!plan.changedRows) {
    if (plan.blocked) safeLog(hooks, `treeops: ${idxFile} 指针改写跳过 ${plan.blocked} 行（同 target 同新 § 已有其它行）`)
    return plan.blocked
  }
  const content = finalize(plan.out)
  const tmp = p + '.tmp'
  try {
    writeFileSync(tmp, content, 'utf8')
  } catch {
    safeLog(hooks, `treeops: ${idxFile} tmp 写失败（放弃改写）`)
    return plan.changedRows
  }
  const gate = await runIndexGate(memRoot, idxFile, tmp)
  if (gate === 'fail') {
    try { unlinkSync(tmp) } catch { /* */ }
    // spec：gate exit≠0 → 放弃该索引文件改写并 skipped（文件保持原样；行内容仍可在归档/日志回溯）
    safeLog(hooks, `treeops: ${idxFile} 索引改写被 memory_write_gate 拒（exit≠0），放弃该文件改写`)
    return plan.changedRows + plan.blocked
  }
  // gate='absent'（memRoot/scripts 无 gate 脚本）→ 仅自查后写入（v1 口径）
  try {
    renameSync(tmp, p)
    return plan.blocked
  } catch {
    try { unlinkSync(tmp) } catch { /* */ }
    safeLog(hooks, `treeops: ${idxFile} 原子落盘失败（放弃改写）`)
    return plan.changedRows + plan.blocked
  }
}
