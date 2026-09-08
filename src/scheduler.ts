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
import { memberPresent, memorySkillPresent, selftestMatrix, pmgScriptsRoot } from './targets.js'
import { registerDistill } from './distill.js'

export const name = '@dsh-external/shoucang-scheduler'
export const inject = ['tools', 'llm', 'subagents', 'agents']

export interface SuiteMember {
  id: string
  package: string
  repo: string
  role: string
}

export interface Config {
  members: SuiteMember[]
  verify_enabled: boolean // G30 证据计数（#5，审计 §8 Q3 兼容）
  migrate_enabled: boolean // migrationHint 消费（#4）
  default_project: string // #4 devref-card 派发默认目标项目路径（空=仅提示不派发）
  generic_project: string // 契约 v3 通用知识库宿主项目路径（=pmg 权威仓；空=board=generic 卡降级 pending）
  // ═══ ADR-0002 阶段 2：蒸馏器配置（蒸馏配置归守藏，承接原记忆仓 F-001/F-002）═══
  enableDistill: boolean // 守藏蒸馏器开关；单飞切换后缺省 true（记忆插件蒸馏已关，ADR-0002 阶段3）
  idleWakeMs: number // 唤醒判定：turn 结束后空闲满此毫秒数才蒸馏（缺省 10 分钟）
  minTurnChars: number // 本轮新增正文少于此字符数则跳过蒸馏（水位仍推进）
  distillPrescan: boolean // 预筛：spawn 前扫增量信号词 + pending 候选，皆无则跳过（零 LLM 成本）
  distillPrompt: string // 蒸馏子代理 persona 覆盖（缺省内建 v2 契约）
  llmProvider: string // 蒸馏子代理指定 provider（空=继承主会话模型）
  llmModel: string // 蒸馏子代理指定 model（空=继承主会话模型）
  // ═══ 深度睡眠归纳（L0 原则层；2026-09-08 拍板：全部会话停滞 ≥3h 自动执行）═══
  enableDeepSleep: boolean // 深度睡眠巡检开关（停滞 ≥deepSleepIdleMs 自动归纳 PRINCIPLES）
  deepSleepIdleMs: number // 停滞判定：无任何根会话活动持续此毫秒数才触发（缺省 3 小时）
  // ═══ 会话活跃状态机（2026-09-08 重构）：区分「正常长任务 / 卡住 / 异常退出」═══
  deepSleepProbe: boolean // 输出增长探测开关（running 无事件超时后，采样 transcript 确认真活跃）
  deepSleepProbeAfterMs: number // running 状态无事件多久发起探测（缺省 3 小时，同 idleMs）
  deepSleepProbeWindowMs: number // 探测采样间隔（缺省 60 秒）
  // 探测可靠性加固（2026-09-08）：防一次采样错判把长任务睡掉
  deepSleepProbeSamples: number // 每轮采样次数（缺省 3；任一次检出增长即判长任务）
  deepSleepProbeConfirm: number // 卡住需连续确认轮数（缺省 2；首轮落 suspect，阻塞睡眠待复核）
  deepSleepProbeRetries: number // 探针不可用/异常时重试次数（缺省 2）
  deepSleepProbeMaxMs: number // 单轮探测总时长兜底（缺省 10 分钟，防悬挂）
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
    .default([]), // 2026-09-08 单插件合并：记忆技能已内嵌（skill/）、pmg 治理整体移除，suite 外部成员清空
  verify_enabled: z.boolean().default(true),
  migrate_enabled: z.boolean().default(true),
  default_project: z.string().default(''),
  generic_project: z.string().default('').description('通用知识库宿主项目路径（pmg 权威仓 docs/devref；蒸馏 board=generic 卡落此；空=降级 pending 待迁移）'),
  enableDistill: z.boolean().default(true).description('守藏蒸馏器（ADR-0002 阶段2）；单飞切换完成后缺省开（记忆插件蒸馏已关）'),
  idleWakeMs: z.number().min(60000).default(600000).description('唤醒判定：turn 结束后空闲满此毫秒数才蒸馏（缺省 10 分钟）'),
  minTurnChars: z.number().min(0).default(200).description('本轮新增正文少于此字符数跳过蒸馏（水位仍推进）'),
  distillPrescan: z.boolean().default(true).description('预筛：无信号词且无 pending 候选则不唤醒 LLM 子代理'),
  distillPrompt: z.string().default('').description('蒸馏子代理 persona 覆盖（缺省内建 v3 契约）'),
  llmProvider: z.string().default('').description('蒸馏子代理 provider（空=继承主会话模型）'),
  llmModel: z.string().default('').description('蒸馏子代理 model（空=继承主会话模型）'),
  enableDeepSleep: z.boolean().default(true).description('深度睡眠归纳：全部会话停滞 ≥deepSleepIdleMs 自动提炼原则层 PRINCIPLES.md'),
  deepSleepIdleMs: z.number().min(600000).default(10800000).description('停滞判定阈值（毫秒）：无任何会话活动持续满此时长触发深度睡眠归纳（缺省 3 小时）'),
  deepSleepProbe: z.boolean().default(true).description('输出增长探测：会话 running 但长时间无事件时，采样转录文件两次确认是长任务还是卡住'),
  deepSleepProbeAfterMs: z.number().min(600000).default(10800000).description('running 状态无事件持续此毫秒数后发起探测（缺省 3 小时）'),
  deepSleepProbeWindowMs: z.number().min(5000).default(60000).description('探测采样间隔（毫秒，缺省 60 秒）'),
  deepSleepProbeSamples: z.number().min(1).default(3).description('每轮探测采样次数：任一次检出转录增长即判为长任务（缺省 3）'),
  deepSleepProbeConfirm: z.number().min(1).default(2).description('判「卡住」需连续无增长的轮数，首轮落 suspect 阻塞睡眠待下轮复核（缺省 2）'),
  deepSleepProbeRetries: z.number().min(1).default(2).description('探针不可用或异常时的重试次数（缺省 2）'),
  deepSleepProbeMaxMs: z.number().min(30000).default(600000).description('单轮探测总时长兜底（毫秒，缺省 10 分钟，防悬挂）'),
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

// —— #4 migrationHint 日志解析（记忆插件 distill 契约：route=project 知识密集 → 指挥者发迁移调度信号）——

interface MigrateHint {
  at: string
  text: string
}

function readMigrationHints(limit = 20): MigrateHint[] {
  const logPath = join(dshHome(), 'super-injector', 'dsh-managing-memory.log')
  const out: MigrateHint[] = []
  try {
    if (!existsSync(logPath)) return out
    const text = readFileSync(logPath, 'utf8')
    const lines = text.split('\n')
    // 倒序取最近 limit 条含「迁移调度提示」的行
    const hits: { at: string; line: string }[] = []
    for (let i = lines.length - 1; i >= 0 && hits.length < limit; i--) {
      const line = lines[i]
      if (!line.includes('迁移调度提示')) continue
      const at = (line.match(/^\[([^\]]+)\]/) || [])[1] || ''
      hits.push({ at, line })
    }
    for (const h of hits.reverse()) out.push({ at: h.at, text: h.line.slice(0, 300) })
  } catch {
    // 日志不可读 → 空（只读工具如实报）
  }
  return out
}

/** #4 目标项目 pending 积压估算：读 devref/pending 目录（pmg 卡库写门前置） */
function readPendingBacklog(project: string): number {
  try {
    const dir = join(project, 'docs', 'devref', 'pending')
    if (!existsSync(dir)) return 0
    return readdirSync(dir).filter((f) => f.endsWith('.md')).length
  } catch {
    return 0
  }
}

// —— 工具 ——

// —— 自持配置文件（契约 v3 落地通道）——

/**
 * ~/.dsh/suite/scheduler.json — 唯一持久配置通道。
 * 背景：注入插件不进 loader 配置持久化（super-injector dev_inject 硬编码 config:{}，README 明言重启不恢复），
 * schemastery UI 配置对本插件不持久 → 自持 JSON 覆盖缺省（键名同 Config；缺文件/坏文件=纯缺省，不 fail-loud）。
 */
function applySuiteConfigFile(config: Config): void {
  try {
    const f = join(dshHome(), 'suite', 'scheduler.json')
    if (!existsSync(f)) return
    const raw = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        if (v !== undefined) (config as any)[k] = v
      }
    }
  } catch { /* 坏文件按纯缺省（可选文件） */ }
}

export function applyScheduler(ctx: Context, config: Config): void {
  applySuiteConfigFile(config)
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
                    // 注意：output schema 走 dsh-tools value schema DSL（0.1.2-rc.1），items 内 required 不被支持——不可恢复此行（2026-09-08 启动崩溃根因）
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

  // shoucang_verify：G3 验证门（#5，G30 证据计数 + 审计 §8 Q3 兼容）
  ctx.effect(() => {
    if (!config.verify_enabled) return () => {}
    return ctx.tools.register(
      defineTool({
        name: 'shoucang_verify',
        description:
          '守藏 G3 验证门（G30 证据计数）：claims（断言数）≤ evidence_reads（工具实证数）才 pass，只信工具证据。输出对齐记忆审计 §8 第三问（route 分流质量抽验）可消费格式；无分布数据时仅证据判定。',
        parameters: {
          claims: { type: 'string', description: '断言/主张数（数字）' },
          evidence_reads: { type: 'string', description: '工具实证读取数（read_file/工具结果，数字）' },
          route: { type: 'string', description: '本次分流 route（memory|project|discard，审计 Q3 用）' },
          project_cards: { type: 'string', description: 'route=project 的卡产出数（审计 Q3 落点）' },
          route_total: { type: 'string', description: '同期 route 总样本数（审计 Q3 分布分母，可省）' },
          conflict: { type: 'string', description: 'yes|no（有冲突需裁决）' },
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              gate: { type: 'string' },
              g30_pass: { type: 'boolean' },
              claims: { type: 'number' },
              evidence_reads: { type: 'number' },
              fix_level: { type: 'string' },
              audit: {
                type: 'object',
                properties: {
                  q3_route: { type: 'string' },
                  q3_route_present: { type: 'boolean' },
                  q3_cards_ok: { type: 'boolean' },
                  q3_pass_rate: { type: 'number' },
                },
                additionalProperties: false,
              },
              note: { type: 'string' },
            },
            additionalProperties: false,
          },
          render: (_a: unknown, v: any) => [
            {
              type: 'text',
              text: `gate=${v.gate} g30=${v.g30_pass} claims=${v.claims} evidence=${v.evidence_reads} fix=${v.fix_level}${v.audit?.q3_route ? ` auditQ3:route=${v.audit.q3_route} cardsOk=${v.audit.q3_cards_ok}` : ''} note=${v.note || '-'}`,
            },
          ],
        },
        async execute(args: any) {
          const c = Number(args?.claims) || 0
          const e = Number(args?.evidence_reads) || 0
          const g30Pass = e >= c
          const conflict = (args?.conflict || 'no') === 'yes'
          const fix = !g30Pass ? 'L1-fix-evidence' : conflict ? 'L2-fix-adjudication' : 'L0-ok'
          const route = (args?.route || '').toString().trim()
          const cards = Number(args?.project_cards) || 0
          const total = Number(args?.route_total) || 0
          // 审计 §8 Q3：route=project 时核验「projectCards 落点」——有产出即 cards_ok；给分布则算 pass_rate
          const audit = {
            q3_route: route || 'memory',
            q3_route_present: route === 'project',
            q3_cards_ok: route === 'project' ? cards > 0 : true,
            q3_pass_rate: total > 0 ? Number((e / Math.max(total, 1)).toFixed(3)) : 0,
          }
          const note = !g30Pass
            ? 'G30 未过：claims 无足够工具实证，削减断言或补 read_file 证据'
            : conflict
              ? '证据充分但存在冲突，需裁决'
              : route === 'project' && cards === 0
                ? 'route=project 但卡产出 0——审计 Q3 落点失败，检查 devref-card 迁移'
                : '验证通过'
          return {
            gate: 'g3/verify',
            g30_pass: g30Pass,
            claims: c,
            evidence_reads: e,
            fix_level: fix,
            audit,
            note,
          }
        },
      }),
    )
  }, '@dsh-external/shoucang-scheduler: verify tool')

  // shoucang_migrate：#4 migrationHint 消费（只读：读记忆插件日志迁移调度提示 + 目标项目积压，给派发命令）
  ctx.effect(() => {
    if (!config.migrate_enabled) return () => {}
    return ctx.tools.register(
      defineTool({
        name: 'shoucang_migrate',
        description:
          '守藏 migrationHint 消费（只读）：读记忆插件日志（$DSH_HOME/super-injector/dsh-managing-memory.log）的「迁移调度提示」行，聚合近期提示 + 目标项目 pending 积压（devref/pending），并给出 devref-card 派发命令（目标=参数 project 或 config default_project；写卡由 pmg devref-card 执行，本工具不写）。',
        parameters: {
          project: { type: 'string', description: '目标项目路径（覆盖 config default_project）' },
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              hints: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { at: { type: 'string' }, text: { type: 'string' } },
                  additionalProperties: false,
                },
              },
              hint_count_24h: { type: 'number' },
              backlog: { type: 'number' },
              backlog_threshold_met: { type: 'boolean' },
              target_project: { type: 'string' },
              dispatch_command: { type: 'string' },
              note: { type: 'string' },
            },
            additionalProperties: false,
          },
          render: (_a: unknown, v: any) => [
            {
              type: 'text',
              text:
                `migrationHint 消费：近 24h 提示 ${v.hint_count_24h} 条（共 ${v.hints.length} 条）；目标 ${v.target_project || '(未配置)'} pending ${v.backlog} 张（阈值 ${v.backlog_threshold_met ? '已过' : '未过'}）` +
                (v.dispatch_command ? `\n派发命令：${v.dispatch_command}` : '') +
                (v.hints.length ? `\n最新提示：${v.hints[v.hints.length - 1].text}` : '\n（无迁移调度提示）'),
            },
          ],
        },
        async execute(args: any) {
          const hints = readMigrationHints()
          const now = Date.now()
          const recent24h = hints.filter((h) => {
            const t = Date.parse(h.at)
            return !Number.isNaN(t) && now - t < 24 * 3600 * 1000
          }).length
          const target = (args?.project || '').toString().trim() || config.default_project.trim()
          const backlog = target ? readPendingBacklog(target) : 0
          const thresholdMet = backlog >= 3
          // pmg devref-card 引擎路径统一走 targets.ts 双部署探测（skills 优先/engine 兜底，零硬编码）
          const pmgScript = join(pmgScriptsRoot(), 'devref-card.mjs')
          const pmgReady = existsSync(pmgScript)
          const dispatchCmd = !target
            ? '（未配置 default_project——config 指定目标项目路径后给出派发命令）'
            : !pmgReady
              ? `（pmg devref-card 未就位于 ${pmgScript}——需先注入 @dsh-external/project-map-governance）`
              : `node "${pmgScript}" "${target}" --list` + (backlog > 0 ? '  # 待迁移卡见 --list；写卡用 --title/--card-type/--text/--source' : '')
          return {
            hints: hints.slice(-5),
            hint_count_24h: recent24h,
            backlog,
            backlog_threshold_met: thresholdMet,
            target_project: target,
            dispatch_command: dispatchCmd,
            note: backlog >= 3 ? 'pending ≥3，建议派发 pmg devref-card 迁移' : backlog > 0 ? '有积压但未达阈值' : '无积压或未配置目标',
          }
        },
      }),
    )
  }, '@dsh-external/shoucang-scheduler: migrate tool')

  // ═══ ADR-0002 阶段 1：R0 动态目标路由 + 白名单门禁自测（targets.ts）═══
  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'shoucang_targets_probe',
          description:
            '守藏蒸馏目标层自测（ADR-0002 阶段1）：组合矩阵 4 行路由解析（memory/project × 成员在缺）+ 现网实测落点 + 白名单门禁抽样（各库 whitelist.json 自治，不符合不存）。只读。',
          parameters: {},
          output: { schema: { type: 'string' }, render: (_a: unknown, v: unknown) => [{ type: 'text', text: String(v) }] },
          async execute() {
            const real = {
              memory: memorySkillPresent(), // A 方案：探测技能权威根（@dsh-external/dsh-managing-memory 包已随合并消失）
              governance: memberPresent('@dsh-external/project-map-governance'),
            }
            const lines = selftestMatrix(real)
            return ['守藏蒸馏目标层自测（ADR-0002）：', ...lines].join('\n')
          },
        }),
      ),
    '@dsh-external/shoucang-scheduler: targets probe tool')

  // ═══ ADR-0002 阶段 2：守藏蒸馏器（事件驱动，写入分发走 targets.ts 路由+白名单）═══
  if (config.enableDistill) {
    const governancePkg = config.members.find((m: SuiteMember) => m.id === 'governance')?.package || '@dsh-external/project-map-governance'
    registerDistill(ctx as any, {
      nodeBin: 'node',
      idleWakeMs: config.idleWakeMs,
      minTurnChars: config.minTurnChars,
      distillPrescan: config.distillPrescan,
      distillPrompt: config.distillPrompt,
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      defaultProject: config.default_project,
      genericProject: config.generic_project,
      memberPackages: { governance: governancePkg },
      enableDeepSleep: config.enableDeepSleep,
      deepSleepIdleMs: config.deepSleepIdleMs,
      deepSleepProbe: config.deepSleepProbe,
      deepSleepProbeAfterMs: config.deepSleepProbeAfterMs,
      deepSleepProbeWindowMs: config.deepSleepProbeWindowMs,
      deepSleepProbeSamples: config.deepSleepProbeSamples,
      deepSleepProbeConfirm: config.deepSleepProbeConfirm,
      deepSleepProbeRetries: config.deepSleepProbeRetries,
      deepSleepProbeMaxMs: config.deepSleepProbeMaxMs,
    })
  }
}
