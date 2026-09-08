/**
 * targets.ts — 目标层：单库路由 + 白名单门禁（纯函数，零硬编码路径）。
 *
 * 单库化（2026-09-08 用户拍板：pmg 项目卡库已随治理插件整体移除，守藏只是一个记忆插件）：
 *   - 唯一记忆库 = 生产部署根 ~/.dsh/skills/managing-memory（数据 + 脚本 + 审计同根）
 *   - 取消 route=project 的 pmg-cards / local-pending 二分：项目专属事实由蒸馏器直写
 *     「项目工作区」<workspace>/docs/devref/shoucang/（workspace 由会话转录反解，见 distill.ts）
 *   - suite/knowledge 仅承载蒸馏器运行状态（审计/水位/pending 输入队列），不再是库
 * 白名单：库数据根 whitelist.json 自治（库自维护，蒸馏器只读）；缺文件 → 内建缺省（可观测标注）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 守藏运行状态区（蒸馏审计/水位/pending 输入队列；非记忆库） */
export function knowledgeRoot(): string {
  return join(dshHome(), 'suite', 'knowledge')
}

/** 记忆库根（数据与脚本同根，scripts 缺省自定位） */
export function memoryLibRoot(): string {
  return join(dshHome(), 'skills', 'managing-memory')
}

// —— 装配探测（injected registry + profiles 双基准；shoucang_suite 工具与 panel /suite 视图共用）——

export interface RegistryEntry { dir: string; name: string; at: string }

/** 注入器 registry.json → 已注入包名集合 + 原始条目（panel 明细展示用） */
export function readInjectedRegistry(): { names: Set<string>; entries: RegistryEntry[] } {
  const names = new Set<string>()
  const entries: RegistryEntry[] = []
  try {
    const reg = join(dshHome(), 'super-injector', 'registry.json')
    if (existsSync(reg)) {
      const raw = JSON.parse(readFileSync(reg, 'utf8')) as { dir?: string; name?: string; at?: string }[]
      if (Array.isArray(raw)) {
        for (const e of raw) {
          if (!e?.name) continue
          names.add(e.name)
          entries.push({ dir: e.dir || '', name: e.name, at: e.at || '' })
        }
      }
    }
  } catch { /* registry 不可读按空 */ }
  return { names, entries }
}

export interface ProfileScan {
  profile: string
  pkgNames: Set<string> // dependencies + dsh.profile.bundles 里能对应包名的
  bundles: string[]
}

/** 扫描 $DSH_HOME/profiles 下各 profile 的 package.json → 装配包名（bundles + dependencies 键名，逐 profile 归属） */
export function scanProfiles(): ProfileScan[] {
  const base = join(dshHome(), 'profiles')
  const out: ProfileScan[] = []
  let dirs: string[] = []
  try {
    dirs = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return out // profiles 不存在 → 空
  }
  for (const profile of dirs) {
    const pj = join(base, profile, 'package.json')
    if (!existsSync(pj)) continue
    try {
      const pkg = JSON.parse(readFileSync(pj, 'utf8')) as { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } }
      const deps = pkg.dependencies || {}
      const bundles = pkg.dsh?.profile?.bundles || []
      const pkgNames = new Set<string>()
      for (const k of Object.keys(deps)) pkgNames.add(k)
      for (const b of bundles) pkgNames.add(b)
      out.push({ profile, pkgNames, bundles })
    } catch { /* 单 profile package.json 损坏跳过 */ }
  }
  return out
}

export function resolveBaseName(pkg: string): string {
  // '@dsh-external/xxx' → 'xxx'；bundles 常以短名登记
  return pkg.includes('/') ? pkg.split('/').pop() || pkg : pkg
}

function readInjectedNames(): Set<string> {
  return readInjectedRegistry().names
}

function readProfileNames(): Set<string> {
  const names = new Set<string>()
  for (const p of scanProfiles()) for (const n of p.pkgNames) names.add(n)
  return names
}

const baseName = (pkg: string): string => resolveBaseName(pkg)

/** 成员是否已装配（任一基准命中） */
export function memberPresent(memberPackage: string): boolean {
  const n = baseName(memberPackage)
  return readInjectedNames().has(memberPackage) || readProfileNames().has(memberPackage) || readInjectedNames().has(n) || readProfileNames().has(n)
}

// —— suite 装配矩阵（单一实现：scheduler 的 shoucang_suite 工具与 panel 的 /suite RPC 都调这里）——

export interface SuiteMemberSpec { id: string; package: string; repo: string; role: string }
export interface SuiteMemberRow extends SuiteMemberSpec { status: 'both' | 'injected' | 'profile' | 'missing'; injected: boolean; profiles: string[]; detail: string }

export function suiteAssemblyMatrix(members: SuiteMemberSpec[]): { members: SuiteMemberRow[]; summary: string } {
  const injected = readInjectedRegistry()
  const profiles = scanProfiles()
  const rows = members.map((m): SuiteMemberRow => {
    const inInjected = injected.names.has(m.package)
    const hitProfiles = profiles.filter((p) => p.pkgNames.has(m.package) || p.pkgNames.has(resolveBaseName(m.package)))
    const inProfile = hitProfiles.length > 0
    const status = inInjected && inProfile ? 'both' : inInjected ? 'injected' : inProfile ? 'profile' : 'missing'
    const detail = status === 'both'
      ? `注入器+${hitProfiles.map((p) => p.profile).join(',')} profile`
      : status === 'injected'
        ? '注入器装配'
        : status === 'profile'
          ? `${hitProfiles.map((p) => p.profile).join(',')} profile 装配`
          : '两基准均未装配（member 独立可装：dev_inject_plugin 或 dsh plugin add）'
    return { ...m, status, injected: inInjected, profiles: hitProfiles.map((p) => p.profile), detail }
  })
  const missing = rows.filter((r) => r.status === 'missing').length
  const present = rows.length - missing
  return {
    members: rows,
    summary: `共 ${rows.length} 成员（present ${present} / missing ${missing}）; 基准: injected registry ${injected.entries.length} 项, profiles ${profiles.length} 个`,
  }
}

/**
 * 记忆库就位探测：库根下 MEMORY.md 存在（数据随 skill 部署到同一根）。
 */
export function memorySkillPresent(): boolean {
  return existsSync(join(memoryLibRoot(), 'MEMORY.md'))
}

// —— 唯一路由（单库化后不再有降级链）——

export interface RouteTarget {
  library: 'shoucang'
  kind: 'memory'
  root: string
  present: boolean
  /** 写入口：zero-copy 脚本相对 root 的调用物（蒸馏器据此派发） */
  writer: string
  note: string
}

/** 解析唯一记忆库（present=false 时仍返回目标，由调用方决定降级行为并如实审计） */
export function resolveTarget(): RouteTarget {
  const root = memoryLibRoot()
  return {
    library: 'shoucang', kind: 'memory', root,
    present: memorySkillPresent(),
    writer: 'scripts/memory-append.mjs（零拷贝）',
    note: '守藏记忆库（唯一）',
  }
}

// —— 白名单（库自治 config，蒸馏器只读消费；不符合不存）——

export interface Whitelist {
  version: number
  library: string
  routes: string[]
  indexTargets: string[]
  notes: string[]
}

const BUILTIN: Whitelist = {
  version: 1, library: 'shoucang', routes: ['memory'],
  indexTargets: ['PRINCIPLES.md', 'MEMORY.md', 'USER.md', 'AGENT.md'],
  notes: ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent'],
}

export function loadWhitelist(root: string): { wl: Whitelist; source: 'file' | 'builtin' } {
  try {
    const p = join(root, 'whitelist.json')
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<Whitelist>
      return {
        wl: {
          version: raw.version ?? 1,
          library: raw.library ?? BUILTIN.library,
          routes: raw.routes ?? BUILTIN.routes,
          indexTargets: raw.indexTargets ?? BUILTIN.indexTargets,
          notes: raw.notes ?? BUILTIN.notes,
        },
        source: 'file',
      }
    }
  } catch { /* 白名单文件损坏 → 内建缺省（报告注明） */ }
  return { wl: BUILTIN, source: 'builtin' }
}

export interface GateResult { ok: boolean; reason?: string }

/** memory 路由入册条目门禁：target ∈ indexTargets（含 USER/AGENT 画像）或 notes/<白名单名>.md */
export function gateMemoryAppend(a: { target?: string }, wl: Whitelist): GateResult {
  const t = String(a.target || '').trim()
  if (wl.indexTargets.includes(t)) return { ok: true }
  const m = t.match(/^notes\/([A-Za-z0-9_-]+)\.md$/)
  if (m && wl.notes.includes(m[1])) return { ok: true }
  return { ok: false, reason: `白名单不符: ${t || '(空)'} 不在 ${wl.library} 收录范围（indexTargets=[${wl.indexTargets.join(',')}] notes=[${wl.notes.join(',')}]）` }
}

// —— 自测：单库解析 + 白名单门禁抽样 ——

export function selftestMatrix(): string[] {
  const lines: string[] = []
  const t = resolveTarget()
  lines.push(`${t.present ? '✅' : '❌'} 单库解析: ${t.library} @ ${t.root} present=${t.present}`)
  // 白名单门禁抽样（生产根）
  const { wl, source } = loadWhitelist(t.root)
  lines.push(`ℹ️ 白名单来源=${source} routes=[${wl.routes.join(',')}] notes=${wl.notes.length} 类 indexTargets=[${wl.indexTargets.join(',')}]`)
  const g1 = gateMemoryAppend({ target: 'notes/lessons.md' }, wl)
  const g2 = gateMemoryAppend({ target: 'notes/evil.md' }, wl)
  const g3 = gateMemoryAppend({ target: 'USER.md' }, wl)
  lines.push(`${g1.ok ? '✅' : '❌'} 门禁抽样: notes/lessons.md ${g1.ok ? '放行' : '误拒:' + g1.reason}`)
  lines.push(`${!g2.ok ? '✅' : '❌'} 门禁抽样: notes/evil.md ${!g2.ok ? '拒收(' + g2.reason?.slice(0, 40) + '…)' : '误放行'}`)
  lines.push(`${g3.ok ? '✅' : '❌'} 门禁抽样: USER.md（画像）${g3.ok ? '放行' : '误拒:' + g3.reason}`)
  return lines
}
