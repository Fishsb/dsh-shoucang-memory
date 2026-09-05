/**
 * @dsh-external/shoucang-scheduler — 守藏调度执行器（suite-manager 只读模块）。
 * 由 dev_scaffold_plugin 生成；2026-09-05 重定义（HANDOVER #2）：
 * 旧「记忆归档调度（boards 三板块/R1-R5/W1-W3）」语义已按拍板废弃（facts F-003/F-004），
 * 本模块重定义为插件集合（suite）的**只读装配检测**——shoucang_suite 工具。
 *
 * 装配检测口径（facts F-006 零硬编码红线：不写死机器路径，运行时经 env/home 探测）：
 *   1. injected 基准：注入器 registry.json（$DSH_HOME/super-injector/registry.json，dev 注入装配）
 *   2. profile 基准：$DSH_HOME/profiles/<profile>/package.json 的 dependencies + dsh.profile.bundles
 *      （bundle 装配；多 profile 全扫，逐 profile 归属）
 *   成员状态 = injected / profile / both / missing。
 *
 * 高性能铁律：工具 schema 精简（description 短句，详解放 tool result / 引导文本）；
 * 只读工具，不产生副作用。
 */
import type { Context } from 'cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from 'schemastery'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = '@dsh-external/shoucang-scheduler'
export const inject = ['tools']

export interface SuiteMember {
  id: string
  package: string
  repo: string
  role: string
}

export interface Config {
  members: SuiteMember[]
  verify_enabled: boolean // 预留：G30 证据计数对接（HANDOVER #5，本次只读模块不启用）
}

export const Config: any = z.object({
  members: z
    .array(
      z.object({
        id: z.string(),
        package: z.string(),
        repo: z.string().default(''),
        role: z.string().default('member'),
      }),
    )
    .default([
      {
        id: 'memory',
        package: '@dsh-external/dsh-managing-memory',
        repo: 'Fishsb/dsh-managing-memory',
        role: 'commander',
      },
      {
        id: 'governance',
        package: '@dsh-external/project-map-governance',
        repo: 'Fishsb/dsh-project-map-governance',
        role: 'executor',
      },
    ]),
  verify_enabled: z.boolean().default(false),
})

// —— 装配事实源探测（无硬编码路径）——

function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 注入器 registry.json → 已注入包名集合 */
function readInjectedRegistry(): { names: Set<string>; entries: { dir: string; name: string; at: string }[] } {
  const reg = join(dshHome(), 'super-injector', 'registry.json')
  const names = new Set<string>()
  const entries: { dir: string; name: string; at: string }[] = []
  try {
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
  } catch {
    // registry 不可读时按空处理（工具如实报状态，不抛）
  }
  return { names, entries }
}

interface ProfileScan {
  profile: string
  pkgNames: Set<string> // dependencies + dsh.profile.bundles 里能对应包名的
  bundles: string[]
}

/** 扫描 $DSH_HOME/profiles 下各 profile 的 package.json → 装配包名（bundles + dependencies 键名） */
function scanProfiles(): ProfileScan[] {
  const base = join(dshHome(), 'profiles')
  const out: ProfileScan[] = []
  let dirs: string[] = []
  try {
    dirs = readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return out // profiles 不存在 → 空
  }
  for (const profile of dirs) {
    const pj = join(base, profile, 'package.json')
    if (!existsSync(pj)) continue
    try {
      const pkg = JSON.parse(readFileSync(pj, 'utf8')) as {
        dependencies?: Record<string, string>
        dsh?: { profile?: { bundles?: string[] } }
      }
      const deps = pkg.dependencies || {}
      const bundles = pkg.dsh?.profile?.bundles || []
      const pkgNames = new Set<string>()
      // dependencies：值含 link:/file: 的是本地包（dependencies 键名即包名）；npm 范围键名也是包名
      for (const k of Object.keys(deps)) pkgNames.add(k)
      for (const b of bundles) pkgNames.add(b)
      out.push({ profile, pkgNames, bundles })
    } catch {
      // 单 profile package.json 损坏跳过
    }
  }
  return out
}

function resolveBaseName(pkg: string): string {
  // '@dsh-external/project-map-governance' → 'project-map-governance'；bundles 常以短名登记
  return pkg.includes('/') ? pkg.split('/').pop() || pkg : pkg
}

// —— 工具 ——

export function apply(ctx: Context, config: Config): void {
  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'shoucang_suite',
          description:
            '守藏 suite-manager 只读装配检测：核对 suite 成员（config members）在 injected（注入器 registry.json）与 profile（profiles/*/package.json bundles+deps）两个装配基准上的状态，输出 each member: status=injected|profile|both|missing + 来源明细。只读不改装。',
          parameters: {
            member: { type: 'string', description: '只查指定成员 id（缺省=全部）' },
            scope: { type: 'string', description: 'all|injected|profile（缺省 all）' },
          },
          output: {
            schema: {
              type: 'object',
              properties: {
                members: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      package: { type: 'string' },
                      repo: { type: 'string' },
                      role: { type: 'string' },
                      status: { type: 'string' },
                      injected: { type: 'boolean' },
                      profiles: { type: 'array', items: { type: 'string' } },
                      detail: { type: 'string' },
                    },
                    required: ['id', 'package', 'status'],
                    additionalProperties: false,
                  },
                },
                summary: { type: 'string' },
              },
              additionalProperties: false,
            },
            render: (_args: unknown, v: any) => {
              const rows = (v?.members || []).map(
                (m: any) =>
                  `- ${m.id} [${m.status}] ${m.package}${m.repo ? ` (repo:${m.repo})` : ''}${m.detail ? ` — ${m.detail}` : ''}`,
              )
              return [{ type: 'text', text: rows.length ? `suite 装配检测：\n${rows.join('\n')}\n${v?.summary || ''}` : 'suite 装配检测：无成员' }]
            },
          },
          async execute(args: any) {
            const scope = (args?.scope || 'all') as string
            const filter = (args?.member || '').toString().trim()
            const injected = readInjectedRegistry()
            const profiles = scanProfiles()

            const rows = config.members
              .filter((m) => !filter || m.id === filter || m.package.includes(filter))
              .map((m) => {
                const inInjected = injected.names.has(m.package)
                const hitProfiles = profiles.filter((p) => {
                  // 精确包名或 bundle 短名命中
                  const short = resolveBaseName(m.package)
                  return p.pkgNames.has(m.package) || p.pkgNames.has(short)
                })
                const inProfile = hitProfiles.length > 0
                const inScope = scope === 'all' || (scope === 'injected' && inInjected) || (scope === 'profile' && inProfile)
                if (!inScope) return null
                let status = 'missing'
                if (inInjected && inProfile) status = 'both'
                else if (inInjected) status = 'injected'
                else if (inProfile) status = 'profile'
                const detail =
                  status === 'both'
                    ? `注入器+${hitProfiles.map((p) => p.profile).join(',')} profile`
                    : status === 'injected'
                      ? '注入器装配'
                      : status === 'profile'
                        ? `${hitProfiles.map((p) => p.profile).join(',')} profile 装配`
                        : '两基准均未装配（member 独立可装：dev_inject_plugin 或 dsh plugin add）'
                return {
                  id: m.id,
                  package: m.package,
                  repo: m.repo,
                  role: m.role,
                  status,
                  injected: inInjected,
                  profiles: hitProfiles.map((p) => p.profile),
                  detail,
                }
              })
              .filter((r): r is NonNullable<typeof r> => r !== null)

            const missing = rows.filter((r) => r.status === 'missing').length
            const present = rows.length - missing
            return {
              members: rows,
              summary: `共 ${rows.length} 成员（present ${present} / missing ${missing}）; 基准: injected registry ${injected.entries.length} 项, profiles ${profiles.length} 个`,
            }
          },
        }),
      ),
    '@dsh-external/shoucang-scheduler: suite tool',
  )
}
