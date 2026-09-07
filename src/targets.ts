/**
 * targets.ts — ADR-0002 阶段 1 目标层：R0 动态目标路由 + 白名单门禁（纯函数，零硬编码路径）。
 *
 * 路由语义（ADR-0002 决策 3/4/5）：
 *   memory  → 记忆插件库（成员在 && 生产副本在）→ 守藏本地知识区（同构兜底）
 *   project → pmg 卡库（成员在 && 写门脚本在）→ 守藏本地待办区（pending 积压兜底）
 *   白名单门禁只管「正式入库」；pending 兜底是防丢失积压，不过白名单但记审计。
 * 白名单：各库数据根 whitelist.json 自治（库自维护，蒸馏器只读）；缺文件 → 内建缺省（可观测标注）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 守藏本地知识区（记忆库同构三索引 + notes + pending + audit + whitelist.json） */
export function knowledgeRoot(): string {
  return join(dshHome(), 'suite', 'knowledge')
}

/** 记忆插件生产副本根（数据与脚本同根，scripts 缺省自定位） */
export function memoryLibRoot(): string {
  return join(dshHome(), 'skills', 'managing-memory')
}

/** pmg 引擎 scripts 目录——双部署探测：skills 运行副本优先，plugins/engine 兜底（pmg 治理保证两副本同步） */
export function pmgScriptsRoot(): string {
  const skills = join(dshHome(), 'skills', 'project-map-governance', 'scripts')
  if (existsSync(join(skills, 'devref-card.mjs'))) return skills
  const engine = join(dshHome(), 'plugins', 'project-map-governance', 'engine', 'scripts')
  if (existsSync(join(engine, 'devref-card.mjs'))) return engine
  return skills // 两处皆无 → 返回 skills 路径（present=false 走降级链，如实报）
}

// —— 装配探测（与 index.ts shoucang_suite 同源口径：injected registry + profiles 双基准）——

function readInjectedNames(): Set<string> {
  const names = new Set<string>()
  try {
    const reg = join(dshHome(), 'super-injector', 'registry.json')
    if (existsSync(reg)) {
      const raw = JSON.parse(readFileSync(reg, 'utf8')) as { name?: string }[]
      if (Array.isArray(raw)) for (const e of raw) if (e?.name) names.add(e.name)
    }
  } catch { /* registry 不可读按空 */ }
  return names
}

function readProfileNames(): Set<string> {
  const names = new Set<string>()
  try {
    const base = join(dshHome(), 'profiles')
    if (!existsSync(base)) return names
    // 简版扫描：只取包名集合（profile 归属明细由 shoucang_suite 工具负责）
    for (const d of readdirSync(base, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const pj = join(base, d.name, 'package.json')
      if (!existsSync(pj)) continue
      try {
        const pkg = JSON.parse(readFileSync(pj, 'utf8')) as { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } }
        for (const k of Object.keys(pkg.dependencies || {})) names.add(k)
        for (const b of pkg.dsh?.profile?.bundles || []) names.add(b)
      } catch { /* 单 profile 损坏跳过 */ }
    }
  } catch { /* profiles 不可读按空 */ }
  return names
}

const baseName = (pkg: string): string => (pkg.includes('/') ? pkg.split('/').pop() || pkg : pkg)

/** 成员是否已装配（任一基准命中） */
export function memberPresent(memberPackage: string): boolean {
  const n = baseName(memberPackage)
  return readInjectedNames().has(memberPackage) || readProfileNames().has(memberPackage) || readInjectedNames().has(n) || readProfileNames().has(n)
}

/**
 * 记忆技能就位探测（2026-09-08 合并后 A 方案）：
 * 记忆技能内嵌本插件 skill/，生产部署仍以 ~/.dsh/skills/managing-memory 为权威根；
 * 探测口径 = 该根下 MEMORY.md 存在（不再探测已消失的 @dsh-external/dsh-managing-memory 包）。
 */
export function memorySkillPresent(): boolean {
  return existsSync(join(dshHome(), 'skills', 'managing-memory', 'MEMORY.md'))
}

// —— 路由链（ADR-0002 决策 5：动态解析 + 降级链）——

export interface RouteTarget {
  library: 'memory-plugin' | 'shoucang-local' | 'pmg-cards' | 'local-pending'
  kind: 'memory' | 'project'
  root: string
  present: boolean
  /** 写入口：zero-copy 脚本相对 root 的调用物（蒸馏器据此派发） */
  writer: string
  note: string
}

export function memoryChain(memoryMemberPresent: boolean): RouteTarget[] {
  const memRoot = memoryLibRoot()
  return [
    {
      library: 'memory-plugin', kind: 'memory', root: memRoot,
      present: memoryMemberPresent && existsSync(join(memRoot, 'MEMORY.md')),
      writer: 'scripts/memory-append.mjs（零拷贝）',
      note: '泛用元记忆权威库',
    },
    {
      library: 'shoucang-local', kind: 'memory', root: knowledgeRoot(),
      present: existsSync(join(knowledgeRoot(), 'whitelist.json')),
      writer: 'scripts/memory-append.mjs（零拷贝，MEMORY_ROOT=本地知识区）',
      note: '记忆库同构降级兜底',
    },
  ]
}

export function projectChain(governanceMemberPresent: boolean): RouteTarget[] {
  const pmg = pmgScriptsRoot()
  return [
    {
      library: 'pmg-cards', kind: 'project', root: pmg,
      present: governanceMemberPresent && existsSync(join(pmg, 'devref-card.mjs')),
      writer: 'devref-card.mjs（零拷贝，唯一写门）',
      note: '项目知识库（项目/通用两板块，白名单 pmg 自治）',
    },
    {
      library: 'local-pending', kind: 'project', root: join(knowledgeRoot(), 'pending'),
      present: existsSync(join(knowledgeRoot(), 'pending')),
      writer: '宿主直写 pending（防丢失积压，过白名单校验后由迁移消化）',
      note: '积压兜底（非正式库）',
    },
  ]
}

export interface ResolvedRoute { resolved: RouteTarget; chain: RouteTarget[] }

export function resolveTarget(route: 'memory' | 'project', members: { memory: boolean; governance: boolean }): ResolvedRoute {
  const chain = route === 'memory' ? memoryChain(members.memory) : projectChain(members.governance)
  return { resolved: chain.find((t) => t.present) || chain[chain.length - 1], chain }
}

// —— 白名单（ADR-0002 决策 4：各库自治 config，蒸馏器只读消费；不符合不存）——

export interface BoardDef {
  host?: string
  accept?: string[]
  reject?: string[]
}

export interface Whitelist {
  version: number
  library: string
  routes: string[]
  indexTargets: string[]
  notes: string[]
  cardTypes: string[]
  /** 契约 v3 粒度锚：板块边界（generic=官方/规范文档级；project=项目事实/用户拍板）。空键=不设板块门禁 */
  boards: Record<string, BoardDef>
}

const NO_BOARDS: Record<string, BoardDef> = {}

const PMG_BOARDS: Record<string, BoardDef> = {
  generic: { host: 'dsh-project-map-governance-plugin', accept: ['官方规范', '平台规则', 'DSH 开发规范', '工具用法资料', '跨项目通用的规范性条文'], reject: ['泛化方向指引（记忆库粒度）', '一次性内容', '项目专属事实（归 project 板块）'] },
  project: { host: 'workspace 项目（docs/devref/cards）', accept: ['项目事实', '开发中用户拍板的决策（decision）', '项目专属开发契约（reference）', '项目踩坑 SOP（how-to）'], reject: ['官方规范原文（归 generic 板块）', '泛化方向指引（记忆库粒度）'] },
}

export const BUILTIN_WHITELISTS: Record<RouteTarget['library'], Whitelist> = {
  'memory-plugin': { version: 1, library: 'memory-plugin', routes: ['memory'], indexTargets: ['MEMORY.md', 'USER.md', 'AGENT.md'], notes: ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent'], cardTypes: [], boards: NO_BOARDS },
  'shoucang-local': { version: 1, library: 'shoucang-local', routes: ['memory'], indexTargets: ['MEMORY.md', 'USER.md', 'AGENT.md'], notes: ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent'], cardTypes: [], boards: NO_BOARDS },
  'pmg-cards': { version: 1, library: 'pmg-cards', routes: ['project'], indexTargets: [], notes: [], cardTypes: ['how-to', 'reference', 'decision'], boards: PMG_BOARDS },
  'local-pending': { version: 1, library: 'local-pending', routes: ['project'], indexTargets: [], notes: [], cardTypes: ['how-to', 'reference', 'decision'], boards: NO_BOARDS },
}

export function loadWhitelist(root: string, library: RouteTarget['library']): { wl: Whitelist; source: 'file' | 'builtin' } {
  try {
    const p = join(root, 'whitelist.json')
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<Whitelist>
      const base = BUILTIN_WHITELISTS[library]
      return {
        wl: {
          version: raw.version ?? 1,
          library: raw.library ?? base.library,
          routes: raw.routes ?? base.routes,
          indexTargets: raw.indexTargets ?? base.indexTargets,
          notes: raw.notes ?? base.notes,
          cardTypes: raw.cardTypes ?? base.cardTypes,
          boards: raw.boards ?? base.boards,
        },
        source: 'file',
      }
    }
  } catch { /* 白名单文件损坏 → 内建缺省（报告注明） */ }
  return { wl: BUILTIN_WHITELISTS[library], source: 'builtin' }
}

export interface GateResult { ok: boolean; reason?: string }

/** memory 路由入册条目门禁：target ∈ indexTargets 或 notes/<白名单名>.md */
export function gateMemoryAppend(a: { target?: string }, wl: Whitelist): GateResult {
  const t = String(a.target || '').trim()
  if (wl.indexTargets.includes(t)) return { ok: true }
  const m = t.match(/^notes\/([A-Za-z0-9_-]+)\.md$/)
  if (m && wl.notes.includes(m[1])) return { ok: true }
  return { ok: false, reason: `白名单不符: ${t || '(空)'} 不在 ${wl.library} 收录范围（indexTargets=[${wl.indexTargets.join(',')}] notes=[${wl.notes.join(',')}]）` }
}

/** project 路由卡目门禁：cardType ∈ 白名单卡型；板块 ∈ 白名单 boards（契约 v3 粒度锚，空键=不设板块门禁） */
export function gateProjectCard(pc: { cardType?: string; board?: string }, wl: Whitelist): GateResult {
  const c = String(pc.cardType || '').trim()
  if (!wl.cardTypes.includes(c)) return { ok: false, reason: `白名单不符: cardType=${c || '(空)'} 不在 ${wl.library} 收录范围（cardTypes=[${wl.cardTypes.join(',')}]）` }
  const boardKeys = Object.keys(wl.boards || {})
  if (boardKeys.length > 0) {
    const b = String(pc.board || 'project').trim()
    if (!boardKeys.includes(b)) return { ok: false, reason: `白名单不符: 板块=${b} 不在 ${wl.library} 收录范围（boards=[${boardKeys.join(',')}]，越界知识宁弃不存）` }
  }
  return { ok: true }
}

// —— 阶段 1 验收：组合矩阵 4 行自测 + 白名单门禁抽样 ——

export function selftestMatrix(real: { memory: boolean; governance: boolean }): string[] {
  const lines: string[] = []
  const combos: Array<{ label: string; m: boolean; g: boolean; expectMem: string; expectProj: string }> = [
    { label: '守藏+记忆+pmg', m: true, g: true, expectMem: 'memory-plugin', expectProj: 'pmg-cards' },
    { label: '守藏+记忆', m: true, g: false, expectMem: 'memory-plugin', expectProj: 'local-pending' },
    { label: '守藏+pmg', m: false, g: true, expectMem: 'shoucang-local', expectProj: 'pmg-cards' },
    { label: '守止单装（不作验收场景，仅核退化路径）', m: false, g: false, expectMem: 'shoucang-local', expectProj: 'local-pending' },
  ]
  for (const c of combos) {
    const mem = resolveTarget('memory', { memory: c.m, governance: c.g })
    const proj = resolveTarget('project', { memory: c.m, governance: c.g })
    const okM = mem.resolved.library === c.expectMem
    const okP = proj.resolved.library === c.expectProj
    lines.push(`${okM && okP ? '✅' : '❌'} ${c.label}: memory→${mem.resolved.library}${okM ? '' : '(期望 ' + c.expectMem + ')'} | project→${proj.resolved.library}${okP ? '' : '(期望 ' + c.expectProj + ')'}`)
  }
  // 真实装配现状
  const rm = resolveTarget('memory', real)
  const rp = resolveTarget('project', real)
  lines.push(`ℹ️ 现网实测: memory→${rm.resolved.library}(${rm.resolved.note}) | project→${rp.resolved.library}(${rp.resolved.note})`)
  // 白名单门禁抽样（守藏本地库）
  const { wl, source } = loadWhitelist(knowledgeRoot(), 'shoucang-local')
  lines.push(`ℹ️ shoucang-local 白名单来源=${source} routes=[${wl.routes.join(',')}] notes=${wl.notes.length} 类`)
  const g1 = gateMemoryAppend({ target: 'notes/lessons.md' }, wl)
  const g2 = gateMemoryAppend({ target: 'notes/evil.md' }, wl)
  const g3 = gateProjectCard({ cardType: 'how-to' }, wl)
  lines.push(`${g1.ok ? '✅' : '❌'} 门禁抽样: notes/lessons.md ${g1.ok ? '放行' : '误拒:' + g1.reason}`)
  lines.push(`${!g2.ok ? '✅' : '❌'} 门禁抽样: notes/evil.md ${!g2.ok ? '拒收(' + g2.reason?.slice(0, 40) + '…)' : '误放行'}`)
  lines.push(`${!g3.ok ? '✅' : '❌'} 门禁抽样: 本地库拒 project 卡 ${!g3.ok ? '拒收（routes 不含 project）' : '误放行'}`)
  return lines
}
