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
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { dshHome, selftestMatrix, suiteAssemblyMatrix } from './targets.js'
import { registerDistill } from './distill.js'
import { deepSleepShare } from './deepsleep-share.js'
import { schedulerShare } from './scheduler-share.js'

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
  // ═══ ADR-0002 阶段 2：蒸馏器配置（蒸馏配置归守藏，承接原记忆仓 F-001/F-002）═══
  enableDistill: boolean // 守藏蒸馏器开关；单飞切换后缺省 true（记忆插件蒸馏已关，ADR-0002 阶段3）
  idleWakeMs: number // 唤醒判定：turn 结束后空闲满此毫秒数才蒸馏（缺省 10 分钟）
  minTurnChars: number // 本轮新增正文少于此字符数则跳过蒸馏（水位仍推进）
  distillPrescan: boolean // 预筛：spawn 前扫增量信号词 + pending 候选，皆无则跳过（零 LLM 成本）
  distillPrompt: string // 蒸馏子代理 persona 覆盖（缺省内建 v4 契约）
  llmProvider: string // 蒸馏子代理指定 provider（空=继承主会话模型）
  llmModel: string // 蒸馏子代理指定 model（空=继承主会话模型）
  // ═══ 深度睡眠归纳（v16：习得原则并入 agent 画像 AGENT.md；2026-09-08 拍板机制，2026-09-09 拍板定位）═══
  enableDeepSleep: boolean // 深度睡眠巡检开关（停滞 ≥deepSleepIdleMs 自动归纳 [原则] 行入 AGENT.md）
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
  deepSleepDaemonParent: boolean // 无会话场景兜底：是否自建守护 parent 承载归纳子代理（缺省关；宿主新建空 agent 场景未验证）
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
  enableDistill: z.boolean().default(true).description('守藏蒸馏器（ADR-0002 阶段2）；单飞切换完成后缺省开（记忆插件蒸馏已关）'),
  idleWakeMs: z.number().min(60000).default(600000).description('唤醒判定：turn 结束后空闲满此毫秒数才蒸馏（缺省 10 分钟）'),
  minTurnChars: z.number().min(0).default(200).description('本轮新增正文少于此字符数跳过蒸馏（水位仍推进）'),
  distillPrescan: z.boolean().default(true).description('预筛：无信号词且无 pending 候选则不唤醒 LLM 子代理'),
  distillPrompt: z.string().default('').description('蒸馏子代理 persona 覆盖（缺省内建 v4 契约）'),
  llmProvider: z.string().default('').description('蒸馏子代理 provider（空=继承主会话模型）'),
  llmModel: z.string().default('').description('蒸馏子代理 model（空=继承主会话模型）'),
  enableDeepSleep: z.boolean().default(true).description('深度睡眠归纳：全部会话停滞 ≥deepSleepIdleMs 自动提炼习得原则写入 agent 画像 AGENT.md（[原则] 行），同 pass 反思双通道维护 USER 画像'),
  deepSleepIdleMs: z.number().min(600000).default(10800000).description('停滞判定阈值（毫秒）：无任何会话活动持续满此时长触发深度睡眠归纳（缺省 3 小时）'),
  deepSleepProbe: z.boolean().default(true).description('输出增长探测：会话 running 但长时间无事件时，采样转录文件两次确认是长任务还是卡住'),
  deepSleepProbeAfterMs: z.number().min(600000).default(10800000).description('running 状态无事件持续此毫秒数后发起探测（缺省 3 小时）'),
  deepSleepProbeWindowMs: z.number().min(5000).default(60000).description('探测采样间隔（毫秒，缺省 60 秒）'),
  deepSleepProbeSamples: z.number().min(1).default(3).description('每轮探测采样次数：任一次检出转录增长即判为长任务（缺省 3）'),
  deepSleepProbeConfirm: z.number().min(1).default(2).description('判「卡住」需连续无增长的轮数，首轮落 suspect 阻塞睡眠待下轮复核（缺省 2）'),
  deepSleepProbeRetries: z.number().min(1).default(2).description('探针不可用或异常时的重试次数（缺省 2）'),
  deepSleepProbeMaxMs: z.number().min(30000).default(600000).description('单轮探测总时长兜底（毫秒，缺省 10 分钟，防悬挂）'),
  deepSleepDaemonParent: z.boolean().default(false).description('无会话场景兜底：自建守护 parent 承载归纳子代理（宿主新建空 agent 路径未经验证，默认关）'),
})

// —— 自持配置文件（契约 v3 落地通道；dshHome 等路径探测统一来自 targets.ts，单一事实源）——

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
            const matrix = suiteAssemblyMatrix(config.members)
            const rows = matrix.members
              .filter((m) => !filter || m.id === filter || m.package.includes(filter))
              .filter((m) => scope === 'all' || (scope === 'injected' && m.injected) || (scope === 'profile' && m.profiles.length > 0))
            const missing = rows.filter((r) => r.status === 'missing').length
            const present = rows.length - missing
            return {
              members: rows,
              summary: `共 ${rows.length} 成员（present ${present} / missing ${missing}）`,
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
                ? 'route=project 但卡产出 0——审计 Q3 落点失败，检查 workspace docs/devref/shoucang 直写'
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

  // ═══ ADR-0002 阶段 1：R0 动态目标路由 + 白名单门禁自测（targets.ts）═══
  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'shoucang_targets_probe',
          description:
            '守藏蒸馏目标层自测：单库路由解析 + 白名单门禁抽样（USER/AGENT 画像与 notes 白名单，不符合不存）。只读。',
          parameters: {},
          output: { schema: { type: 'string' }, render: (_a: unknown, v: unknown) => [{ type: 'text', text: String(v) }] },
          async execute() {
            const lines = selftestMatrix()
            return ['守藏蒸馏目标层自测（单库）：', ...lines].join('\n')
          },
        }),
      ),
    '@dsh-external/shoucang-scheduler: targets probe tool')

  // ═══ ADR-0002 阶段 2：守藏蒸馏器（事件驱动，写入分发走 targets.ts 路由+白名单）═══
  if (config.enableDistill) {
    const distill = registerDistill(ctx as any, {
      nodeBin: 'node',
      idleWakeMs: config.idleWakeMs,
      minTurnChars: config.minTurnChars,
      distillPrescan: config.distillPrescan,
      distillPrompt: config.distillPrompt,
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      enableDeepSleep: config.enableDeepSleep,
      deepSleepIdleMs: config.deepSleepIdleMs,
      deepSleepProbe: config.deepSleepProbe,
      deepSleepProbeAfterMs: config.deepSleepProbeAfterMs,
      deepSleepProbeWindowMs: config.deepSleepProbeWindowMs,
      deepSleepProbeSamples: config.deepSleepProbeSamples,
      deepSleepProbeConfirm: config.deepSleepProbeConfirm,
      deepSleepProbeRetries: config.deepSleepProbeRetries,
      deepSleepProbeMaxMs: config.deepSleepProbeMaxMs,
      deepSleepDaemonParent: config.deepSleepDaemonParent,
    })
    // 跨模块桥接：状态机 API 供 panel /deepsleep RPC 惰性读取；suite 矩阵供 panel /suite RPC 复用同一实现；
    // 蒸馏节流组运行时值供 panel /distill/config 展示（缺省值单一实现=本文件 Config，panel 不复制）
    if (distill) deepSleepShare.api = distill
    schedulerShare.api = {
      suiteScan: () => suiteAssemblyMatrix(config.members),
      distillConfig: () => ({
        enableDistill: config.enableDistill,
        idleWakeMs: config.idleWakeMs,
        minTurnChars: config.minTurnChars,
        distillPrescan: config.distillPrescan,
        llmProvider: config.llmProvider,
        llmModel: config.llmModel,
      }),
    }
  } else {
    // 蒸馏器关闭也要给 panel 提供装配矩阵（/suite 是只读视图，与蒸馏无关）
    schedulerShare.api = {
      suiteScan: () => suiteAssemblyMatrix(config.members),
      distillConfig: () => ({
        enableDistill: config.enableDistill,
        idleWakeMs: config.idleWakeMs,
        minTurnChars: config.minTurnChars,
        distillPrescan: config.distillPrescan,
        llmProvider: config.llmProvider,
        llmModel: config.llmModel,
      }),
    }
  }
}
