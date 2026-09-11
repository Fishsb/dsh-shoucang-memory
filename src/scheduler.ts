/**
 * @dsh-external/shoucang-scheduler — 守藏调度执行器。
 * 沿革：2026-09-05 重定义为 suite 只读装配检测（HANDOVER #2，旧 boards 三板块废弃）；
 * 2026-09-08 三合一后本模块承载 = ① suite 装配检测（shoucang_suite，矩阵单一实现在 targets.ts）
 * + ② 蒸馏器装配与回归工具（shoucang_verify / shoucang_targets_probe，蒸馏器本体在 distill.ts）
 * + ③ 自持配置通道加载（~/.dsh/suite/scheduler.json 启动期覆盖 Config 缺省）。
 *
 * 装配检测口径（零硬编码红线：不写死机器路径，运行时经 env/home 探测）：
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
import { dshHome, selftestMatrix, suiteAssemblyMatrix, memoryLibRoot, recallApprox } from './targets.js'
import { recallRanked } from './vec.js'
import { registerDistill } from './distill.js'
import { deepSleepShare } from './deepsleep-share.js'
import { schedulerShare } from './scheduler-share.js'
import { mclShare } from './mcl-share.js'
import { registerMcl } from './mcl.js'

export const name = '@dsh-external/shoucang-scheduler'
export const inject = ['tools', 'llm', 'subagents', 'agents']

export interface SuiteMember {
  id: string
  package: string
  repo: string
  role: string
}

/** 单插件仓（2026-09-08 三合一后 suite 无外部成员）：members 缺省 = **自检本插件装配状态**，
 *  消除 shoucang_suite / panel /suite / assistant_capabilities 三处恒返回「无成员」的空转（2026-09-11 审查修复）。 */
const SELF_MEMBER: SuiteMember = {
  id: 'shoucang',
  package: 'dsh-shoucang-memory',
  repo: 'Fishsb/dsh-shoucang-memory',
  role: 'self（单插件仓：默认自检装配状态）',
}

/** 生效成员表：显式配置优先，缺省回落到自检自身 */
const memberSpecsOf = (config: Config): SuiteMember[] =>
  (Array.isArray(config.members) && config.members.length ? config.members : [SELF_MEMBER])

export interface Config {
  members: SuiteMember[]
  verify_enabled: boolean // G30 证据计数（#5，审计 §8 Q3 兼容）
  // ═══ ADR-0002 阶段 2：蒸馏器配置（蒸馏配置归守藏，承接原记忆仓 F-001/F-002）═══
  enableDistill: boolean // 守藏蒸馏器开关；单飞切换后缺省 true（记忆插件蒸馏已关，ADR-0002 阶段3）
  idleWakeMs: number // 唤醒判定：turn 结束后空闲满此毫秒数才蒸馏（缺省 10 分钟）
  minTurnChars: number // 本轮新增正文少于此字符数则跳过蒸馏（水位仍推进）
  distillPrescan: boolean // 预筛：spawn 前扫增量信号词 + pending 候选，皆无则跳过（零 LLM 成本）
  prescanMinChars: number // 2026-09-11：大段强制蒸馏阈值（增量 ≥ 此值跳过预筛直接蒸馏；缺省 4000）
  distillPrompt: string // 蒸馏子代理 persona 覆盖（缺省内建 v5 契约）
  llmProvider: string // 子代理 provider 缺省（空=继承主会话模型）——distill/sleep 未单独指定时回落
  llmModel: string // 子代理 model 缺省（空=继承主会话模型）
  // 2026-09-10 用户拍板：蒸馏/深睡各自独立模型（直接用 Harness 模型体系）
  distillProvider: string // 蒸馏子代理 provider（空=回落 llmProvider→继承主会话）
  distillModel: string
  sleepProvider: string // 深睡归纳子代理 provider（空=回落 llmProvider→继承主会话）
  sleepModel: string
  // 2026-09-10：记忆库容量门（写门用）
  capAgent: number
  capUser: number
  capMemory: number
  // ═══ 深度睡眠归纳（v16：习得原则并入 agent 画像 AGENT.md；2026-09-08 拍板机制，2026-09-09 拍板定位）═══
  enableDeepSleep: boolean // 深度睡眠巡检开关（停滞 ≥deepSleepIdleMs 自动归纳 [原则] 行入 AGENT.md）
  enableRemPass?: boolean // REM 相（认知对照 P2）：深睡同 pass 内做跨主题联想（crossTopic，须 ≥2 不同 § 主题）；缺省关
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
  // ═══ 路线④ 打扰度观察（shadow-first MVP：默认只写影子日志不注入；active 待影子校准后拍板）═══
  activationShadow: boolean // 观察打分+落 activation-shadow.jsonl（缺省开；不注入上下文）
  activationPrefetch: boolean // active 注入开关（缺省关；注入接线=后续档）
  activationTOn: number // 滞回上阈（初值 0.62，影子校准后调）
  activationTOff: number // 滞回下阈（初值 0.52）
  activationCooldownSteps: number // 触发后冷却步数（缺省 3）
  activationTopK: number // 召回条数（缺省 3）
  // ═══ 路线⑤ 向量档（可选、默认关；派生缓存非事实源，未配置/失败自动降级词法）═══
  embedEnabled: boolean // 融合召回开关（缺省关；开=0.7dense ⊕ 0.3lex）
  embedBaseUrl: string // OpenAI 兼容 embeddings 基址（如 https://api.openai.com/v1；留空=关）
  embedModel: string // embedding 模型名
  embedApiKeyEnv: string // API key 所在环境变量名（不落盘/不入库）
  // ═══ v7 记忆活性/遗忘/加深校准阈值（2026-09-10：可 UI 设置，缺省单一实现=本 schema 默认，UI 通道 /set → scheduler.json）═══
  activityWarmDays: number // active→warm 无命中天数（缺省 14）
  activityColdDays: number // warm→cold 无命中天数（缺省 44 = warm+30）
  activityArchiveDays: number // cold 且最近命中超过该天数 → 遗忘候选（缺省 90）
  activityHotHits: number // 近 30 天命中 ≥ 此值 → 加深候选 B（缺省 5）
  recallColdFactorPercent: number // 召回时 cold/retired 小节降权系数（%，→ /100；缺省 35）
  // ═══ ACT-029 认知环（MCL）双通道（2026-09-11）：熟悉度分流 + 慢通道薄材料 + 有界再引导 ═══
  mclEnabled: boolean // 认知环总开关（缺省开；一键回滚 = false）
  mclFamiliarThreshold: number // 熟悉度阈值（绝对余弦口径，ACT-024 校准：0.65 → 触发率 ~2%）
  mclMaxNudges: number // 慢通道再引导上限（缺省 1；0 = 只注入不引导）
  mclBudgetChars: number // 慢通道材料硬预算（字符，缺省 600）
  mclTopK: number // 慢通道指针条数（缺省 3）
  mclAudit: boolean // 审计流开关（knowledgeRoot()/audit/mcl-audit.jsonl）
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
  prescanMinChars: z.number().min(0).default(4000).description('大段强制蒸馏阈值（字符）：增量 ≥ 此值跳过预筛直接蒸馏（2026-09-10 用户拍板；缺省 4000）'),
  distillPrompt: z.string().default('').description('蒸馏子代理 persona 覆盖（缺省内建 v5 契约）'),
  llmProvider: z.string().default('').description('子代理 provider 缺省（空=继承主会话模型）——distill/sleep 未单独指定时回落此键'),
  llmModel: z.string().default('').description('子代理 model 缺省（空=继承主会话模型）——distill/sleep 未单独指定时回落此键'),
  // 2026-09-10 用户拍板：蒸馏/深睡模型各自独立配置（直接用 Harness 模型体系，下拉选宿主模型）
  distillProvider: z.string().default('').description('蒸馏子代理 provider（空=回落 llmProvider → 继承主会话）'),
  distillModel: z.string().default('').description('蒸馏子代理 model（空=回落 llmModel → 继承主会话）'),
  sleepProvider: z.string().default('').description('深睡归纳子代理 provider（空=回落 llmProvider → 继承主会话）'),
  sleepModel: z.string().default('').description('深睡归纳子代理 model（空=回落 llmModel → 继承主会话）'),
  // 2026-09-10：记忆库容量门（写门 SHOUCANG_CAP_* 的 UI 源）——控制蒸馏/扩增能长多大；注入不裁（执行时总看完整画像+记忆）
  // 2026-09-11 用户拍板：默认值 = 画像 3,000（AGENT/USER 各一）/ 记忆 5,000（原 AGENT 3000 · USER 2000 · MEMORY 3000）
  capAgent: z.number().min(100).default(3000).description('AGENT.md 容量门（字符，写门强制；缺省 3000）'),
  capUser: z.number().min(100).default(3000).description('USER.md 容量门（字符，写门强制；缺省 3000）'),
  capMemory: z.number().min(100).default(5000).description('MEMORY.md 容量门（字符，写门强制；缺省 5000）'),
  enableDeepSleep: z.boolean().default(true).description('深度睡眠归纳：全部会话停滞 ≥deepSleepIdleMs 自动提炼习得原则写入 agent 画像 AGENT.md（[原则] 行），同 pass 反思双通道维护 USER 画像'),
  enableRemPass: z.boolean().default(false).description('REM 相（认知对照 P2）：深睡同 pass 内额外做**跨主题联想**（crossTopic 通道，产出须覆盖 ≥2 个不同 § 主题才被宿主接收）；缺省关'),
  deepSleepIdleMs: z.number().min(600000).default(10800000).description('停滞判定阈值（毫秒）：无任何会话活动持续满此时长触发深度睡眠归纳（缺省 3 小时）'),
  deepSleepProbe: z.boolean().default(true).description('输出增长探测：会话 running 但长时间无事件时，采样转录文件两次确认是长任务还是卡住'),
  deepSleepProbeAfterMs: z.number().min(600000).default(10800000).description('running 状态无事件持续此毫秒数后发起探测（缺省 3 小时）'),
  deepSleepProbeWindowMs: z.number().min(5000).default(60000).description('探测采样间隔（毫秒，缺省 60 秒）'),
  deepSleepProbeSamples: z.number().min(1).default(3).description('每轮探测采样次数：任一次检出转录增长即判为长任务（缺省 3）'),
  deepSleepProbeConfirm: z.number().min(1).default(2).description('判「卡住」需连续无增长的轮数，首轮落 suspect 阻塞睡眠待下轮复核（缺省 2）'),
  deepSleepProbeRetries: z.number().min(1).default(2).description('探针不可用或异常时的重试次数（缺省 2）'),
  deepSleepProbeMaxMs: z.number().min(30000).default(600000).description('单轮探测总时长兜底（毫秒，缺省 10 分钟，防悬挂）'),
  deepSleepDaemonParent: z.boolean().default(false).description('无会话场景兜底：自建守护 parent 承载归纳子代理（宿主新建空 agent 路径未经验证，默认关）'),
  activationShadow: z.boolean().default(true).description('路线④ 打扰度影子观察：每轮 user 消息按词法打分（recallIndex），滞回+冷却，只落 activation-shadow.jsonl，不注入上下文——默认开，攒样本校准阈值'),
  activationPrefetch: z.boolean().default(false).description('路线④ active 注入（缺省关）：影子校准满意后开启；注入接线为后续档'),
  activationTOn: z.number().min(0).max(1).default(0.65).description('滞回上阈：sim≥此值且冷却结束 → prefetch/emit（2026-09-11 ACT-024 重校准：口径=用户文本↔命中索引行的**绝对余弦**，实测干净样本 p95≈0.619 / p99≈0.649；旧相对分口径 0.62 会命中 88.5% 真实消息故废弃）'),
  activationTOff: z.number().min(0).max(1).default(0.6).description('滞回下阈：sim<此值 → 回到 idle（防阈值抖动；绝对余弦口径，同 ACT-024）'),
  activationCooldownSteps: z.number().min(0).default(3).description('触发后冷却步数，防连续打扰'),
  activationTopK: z.number().min(1).max(5).default(3).description('每次观察召回条数'),
  embedEnabled: z.boolean().default(true).description('向量融合召回（2026-09-09 缺省开；本地 bge-m3 零 token；未配置/失败自动降级纯词法）'),
  embedBaseUrl: z.string().default('http://127.0.0.1:11434/v1').description('OpenAI 兼容 /embeddings 基址（缺省 Ollama :11434；自建桥/ LM Studio / 云端改此键）'),
  embedModel: z.string().default('bge-m3').description('embedding 模型名（缺省 bge-m3，Ollama 官方库 1.2GB；换云端如 text-embedding-3-small）'),
  embedApiKeyEnv: z.string().default('EMBED_API_KEY').description('API key 环境变量名（本地免 key；云端须设，不落盘）'),
  // ═══ v7 记忆活性/遗忘/加深校准阈值（2026-09-10：面板「参数调节」可调；缺省=本 schema 默认；schemastery 无 .int()，整数值由 UI parseInt + 默认/范围保证）═══
  activityWarmDays: z.number().min(1).max(120).default(14).description('活性降级：active→warm 无命中天数（缺省 14）'),
  activityColdDays: z.number().min(2).max(365).default(44).description('遗忘冷降：warm→cold 无命中天数（缺省 44 = warm+30）'),
  activityArchiveDays: z.number().min(30).max(730).default(90).description('遗忘候选：cold 且最近命中超过该天数 → 候选清单（缺省 90）'),
  activityHotHits: z.number().min(1).max(50).default(5).description('加深候选：近 30 天命中 ≥ 此值 → 加深候选 B（缺省 5）'),
  recallColdFactorPercent: z.number().min(5).max(95).default(35).description('召回降权：cold/retired 小节融合召回降权系数（百分比，→ /100；缺省 35）'),
  // ═══ ACT-029 认知环（MCL）：熟悉度分流 + 慢通道薄材料 + 有界再引导（方案见 .internal/arch/shoucang-SC-S05）═══
  mclEnabled: z.boolean().default(true).description('认知环（MCL）开关：慢通道在任务首步注入「薄契约 + top-k 指针」并按需再引导一次；快通道零额外往返。缺省开，置 false 一键回滚'),
  mclFamiliarThreshold: z.number().min(0).max(1).default(0.65).description('熟悉度阈值（用户文本↔命中索引行的**绝对余弦**，ACT-024 校准：0.65 → 触发率 ~2% 且阈上样本全为真命中）'),
  mclMaxNudges: z.number().min(0).max(3).default(1).description('慢通道再引导上限（缺省 1：只对「未引用材料」再引导一次，之后放行，绝不死锁）'),
  mclBudgetChars: z.number().min(120).max(4000).default(600).description('慢通道材料硬预算（字符；薄契约 + top-k 薄行，只作用于慢通道首步）'),
  mclTopK: z.number().min(1).max(5).default(3).description('慢通道注入的指针条数（缺省 3）'),
  mclAudit: z.boolean().default(true).description('认知环审计流：knowledgeRoot()/audit/mcl-audit.jsonl（每步一行：通道/熟悉度/注入/再引导/合规）'),
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
  // LLM 模型枚举（2026-09-10：直接用 Harness 模型体系——listProviders→listModels 扁平；供蒸馏/深睡下拉）
  const llmModels = async (): Promise<Array<{ provider: string; id: string; name: string }>> => {
    const out: Array<{ provider: string; id: string; name: string }> = []
    try {
      const llm = (ctx as { llm?: unknown }).llm as { listProviders?: () => unknown[]; listModels?: (p: string) => Promise<Array<{ id: string; name?: string }>> } | undefined
      if (!llm || typeof llm.listProviders !== 'function') return out
      const providers = llm.listProviders() || []
      for (const p of providers) {
        const pid = String((p as { id?: string; provider?: string; name?: string })?.id ?? (p as { provider?: string })?.provider ?? (p as { name?: string })?.name ?? '')
        if (!pid) continue
        if (typeof llm.listModels === 'function') {
          try {
            const ms = await llm.listModels(pid)
            for (const m of ms || []) out.push({ provider: pid, id: m.id, name: m.name || m.id })
          } catch { /* 单 provider 枚举失败跳过 */ }
        }
      }
    } catch { /* 宿主 llm 不可用=空 */ }
    return out
  }
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
            const matrix = suiteAssemblyMatrix(memberSpecsOf(config))
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

  // ═══ 路线② 读侧召回（词法地板；查询 → 记忆库薄行 top-k，详情按指针懒展开；向量接入前的缺省召回）═══
  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'shoucang_recall',
          description:
            '守藏读侧召回（词法版）：给一句话任务描述/问题，在记忆库索引行（AGENT [原则]/[路径] + MEMORY + USER）做确定性 top-k 关键词匹配，返回薄行与 notes 指针；命中后按指针 get_file 读详情小节。任务开始（认领类型）与卡住补检时调用。',
          parameters: {
            query: { type: 'string', description: '任务描述/问题（自然语言，如：把插件打包发布到 github）' },
            topK: { type: 'number', description: '返回条数（缺省 3，最多 5）' },
            scope: { type: 'string', description: 'agent=只查 AGENT.md（原则/路径）；all=AGENT+MEMORY+USER（缺省 all）' },
          },
          output: { schema: { type: 'string' }, render: (_a: unknown, v: unknown) => [{ type: 'text', text: String(v) }] },
          async execute(args: any) {
            const root = memoryLibRoot()
            const query = String(args?.query || '')
            const topK = Math.min(5, Number(args?.topK) || 3)
            const scope = args?.scope === 'agent' ? 'agent' : 'all'
            const { rows, tokens, mode } = await recallRanked(root, query, topK, scope, {
              enabled: !!config.embedEnabled,
              baseUrl: config.embedBaseUrl,
              model: config.embedModel,
              apiKeyEnv: config.embedApiKeyEnv || 'EMBED_API_KEY',
              coldFactor: (Number(config.recallColdFactorPercent) > 0 ? Number(config.recallColdFactorPercent) : 35) / 100, // v7 UI 可调（% → 0.35 缺省）
            })
            if (!rows.length) {
              // S5 召回零命中兜底（assistant-focus-plan S5）：不再静默新手态——
              // 给「库内主题地图 + 建议检索词 + pending 提醒」：near=notes/ 各文件小节清单（换问法的线索），
              // 建议词=库内出现过的查询高判别 token；并提醒收尾沉淀（跨会话第二次同型即转正成经验）。
              const { near, suggest } = recallApprox(root, query, scope === 'agent' ? 'agent' : 'all')
              const out: string[] = [`shoucang_recall：无全文命中（库 ${root}；token=${tokens.join(',') || '空'}）`]
              if (suggest.length) out.push(`建议：查询词中「${suggest.join(' / ')}」在库内出现过——换措辞/组合重试（用库内术语）更易命中`)
              if (near.length) {
                out.push('库内主题地图（可围绕以下话题换问法，或 get_file 直读详情）：')
                out.push(...near.map((r) => `- ${r.line}`))
              } else out.push('库内暂无 notes 主题（记忆库尚空/新库）——首次经验收尾沉淀候选，同类第二次跨会话即转正')
              out.push('下一步：按上面线索换词重试；确认经验有价值 → 收尾四步沉淀候选，不静默丢弃')
              return out.join('\n')
            }
            return [
              `shoucang_recall：命中 ${rows.length} 条（${mode === 'fusion' ? 'dense0.7+lexical0.3 融合' : '词法'}；token=${tokens.join(',')}）`,
              ...rows.map((r) => `- [${r.file}] ${r.line}`),
              '提示：以上为薄行指针，命中后按 `→ notes/…` 读详情小节；相似≠适用，展开前核对任务类型。',
            ].join('\n')
          },
        }),
      ),
    '@dsh-external/shoucang-scheduler: recall tool')

  // ═══ S3 能力自省（assistant-focus-plan S3：只读，任务认领前自查「现在能做什么/边界在哪」）═══
  // 数据源：① 当前 Agent 可见工具面（ctx.tools.schemas(exec.agent)，DSH 官方同款用法）；② suite 装配状态；
  // ③ 记忆库边界纪律（AGENT.md [边界] 行 + 记忆库在位性）。只读不产生副作用。
  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'assistant_capabilities',
          description:
            '助理能力自省（只读）：返回当前 Agent 的能力面——按族归类的可见工具清单、装配与权限状态、记忆库边界纪律（AGENT.md [边界] 行/红线）。任务认领（澄清意图）前自查「我现在会什么、不会什么、边界在哪」，判断任务是否需要新能力/升级用户；不替代具体工具。',
          parameters: {},
          output: { schema: { type: 'string' }, render: (_a: unknown, v: unknown) => [{ type: 'text', text: String(v) }] },
          async execute(_args: any, exec: any) {
            const parts: string[] = []
            // ① 当前 Agent 可见工具面（按族归类）
            try {
              const agent = exec && exec.agent
              const schemas: { name?: string; description?: string }[] = (agent ? (ctx as any).tools?.schemas?.(agent) : (ctx as any).tools?.schemas?.()) || []
              const FAMILIES: [string, RegExp][] = [
                ['记忆/召回', /shoucang_|recall|memory|managing|delta/],
                ['执行/命令', /^(pwsh|bash|shell|terminal|job|subprocess|task)/],
                ['文件/读写', /^(fs|read|write|edit|glob|grep|file|str_replace|search_files)/],
                ['检索/网页', /web|search|fetch|page|platform|browser/],
                ['视觉/媒体', /vision|image|screen|read_image|ocr|audio/],
                ['治理/项目', /nav_|project|governance|architecture/],
                ['开发/注入', /dev_|plugin|inject|scaffold|build|reload|stage/],
                ['编排/多代理', /subagent|workflow|agent|goal|plan|todo|ralph/],
                ['工具/技能', /^tool_|^skill$/],
              ]
              const byFamily = new Map<string, string[]>()
              const other: string[] = []
              for (const s of schemas) {
                const n = s.name || ''
                const hit = FAMILIES.find(([, re]) => re.test(n))
                if (hit) { const arr = byFamily.get(hit[0]) || []; arr.push(n); byFamily.set(hit[0], arr) }
                else other.push(n)
              }
              const lines: string[] = [`可见工具 ${schemas.length} 个（按族）：`]
              for (const [fam, names] of byFamily) lines.push(`- ${fam} (${names.length})：${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''}`)
              if (other.length) lines.push(`- 其他 (${other.length})：${other.slice(0, 10).join(', ')}${other.length > 10 ? '…' : ''}`)
              lines.push('（完整 schema 已在工具目录可见；此处为族级概览。要精确看某工具用法直接读其描述。）')
              parts.push(lines.join('\n'))
            } catch (e) {
              parts.push(`⚠ 工具面枚举失败：${String((e as Error)?.message || e).slice(0, 120)}`)
            }
            // ② 记忆库在位 + AGENT 边界纪律
            try {
              const memRoot = memoryLibRoot()
              const agentFile = join(memRoot, 'AGENT.md')
              if (!existsSync(agentFile)) { parts.push('⚠ 记忆库缺席（AGENT.md 不在）——能力边界纪律不可用') }
              else {
                const ag = readFileSync(agentFile, 'utf8')
                const bounds = ag.split(/\r?\n/).filter((l) => /\[边界\]|\[原则\]/.test(l)).map((l) => l.trim()).filter(Boolean)
                if (bounds.length) parts.push(`记忆库边界/原则（${bounds.length} 条，常注入）：\n${bounds.map((b) => `- ${b}`).join('\n')}`)
              }
            } catch { /* 边界读取失败不致命 */ }
            // ③ 装配与蒸馏状态
            try {
              const sm = suiteAssemblyMatrix(memberSpecsOf(config))
              parts.push(`suite 装配：${sm.summary || `${memberSpecsOf(config).length} 成员`}`)
            } catch { /* 装配信息可选 */ }
            return parts.join('\n\n')
          },
        }),
      ),
    '@dsh-external/shoucang-scheduler: assistant capabilities tool')

  // ═══ ADR-0002 阶段 2：守藏蒸馏器（事件驱动，写入分发走 targets.ts 路由+白名单）═══
  if (config.enableDistill) {
    const distill = registerDistill(ctx as any, {
      nodeBin: 'node',
      capAgent: config.capAgent,
      capUser: config.capUser,
      capMemory: config.capMemory,
      idleWakeMs: config.idleWakeMs,
      minTurnChars: config.minTurnChars,
      distillPrescan: config.distillPrescan,
      prescanMinChars: config.prescanMinChars,
      distillPrompt: config.distillPrompt,
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      distillProvider: config.distillProvider,
      distillModel: config.distillModel,
      sleepProvider: config.sleepProvider,
      sleepModel: config.sleepModel,
      enableDeepSleep: config.enableDeepSleep,
      enableRemPass: config.enableRemPass,
      deepSleepIdleMs: config.deepSleepIdleMs,
      deepSleepProbe: config.deepSleepProbe,
      deepSleepProbeAfterMs: config.deepSleepProbeAfterMs,
      deepSleepProbeWindowMs: config.deepSleepProbeWindowMs,
      deepSleepProbeSamples: config.deepSleepProbeSamples,
      deepSleepProbeConfirm: config.deepSleepProbeConfirm,
      deepSleepProbeRetries: config.deepSleepProbeRetries,
      deepSleepProbeMaxMs: config.deepSleepProbeMaxMs,
      deepSleepDaemonParent: config.deepSleepDaemonParent,
      activationShadow: config.activationShadow,
      activationPrefetch: config.activationPrefetch,
      activationTOn: config.activationTOn,
      activationTOff: config.activationTOff,
      activationCooldownSteps: config.activationCooldownSteps,
      activationTopK: config.activationTopK,
      embedEnabled: config.embedEnabled,
      embedBaseUrl: config.embedBaseUrl,
      embedModel: config.embedModel,
      embedApiKeyEnv: config.embedApiKeyEnv,
      // v7 活性/遗忘/加深校准阈值（scheduler.Config 同键名直传，运行时生效）
      activityWarmDays: config.activityWarmDays,
      activityColdDays: config.activityColdDays,
      activityArchiveDays: config.activityArchiveDays,
      activityHotHits: config.activityHotHits,
      recallColdFactorPercent: config.recallColdFactorPercent,
    })
    // 跨模块桥接：状态机 API 供 panel /deepsleep RPC 惰性读取；suite 矩阵供 panel /suite RPC 复用同一实现；
    // 蒸馏节流组运行时值供 panel /distill/config 展示（缺省值单一实现=本文件 Config，panel 不复制）
    if (distill) deepSleepShare.api = distill
    schedulerShare.api = {
      suiteScan: () => suiteAssemblyMatrix(memberSpecsOf(config)),
      distillConfig: () => ({
        enableDistill: config.enableDistill,
        idleWakeMs: config.idleWakeMs,
        minTurnChars: config.minTurnChars,
        distillPrescan: config.distillPrescan,
        llmProvider: config.llmProvider,
        llmModel: config.llmModel,
        distillProvider: config.distillProvider,
        distillModel: config.distillModel,
        sleepProvider: config.sleepProvider,
        sleepModel: config.sleepModel,
      }),
      llmModels,
    }
  } else {
    // 蒸馏器关闭也要给 panel 提供装配矩阵（/suite 是只读视图，与蒸馏无关）
    schedulerShare.api = {
      suiteScan: () => suiteAssemblyMatrix(memberSpecsOf(config)),
      distillConfig: () => ({
        enableDistill: config.enableDistill,
        idleWakeMs: config.idleWakeMs,
        minTurnChars: config.minTurnChars,
        distillPrescan: config.distillPrescan,
        llmProvider: config.llmProvider,
        llmModel: config.llmModel,
        distillProvider: config.distillProvider,
        distillModel: config.distillModel,
        sleepProvider: config.sleepProvider,
        sleepModel: config.sleepModel,
      }),
      llmModels,
    }
  }

  // ═══ ACT-029 认知环（MCL）装配：与蒸馏器**解耦**（不依赖 enableDistill）——`agent/pre-step` 按熟悉度分流 ═══
  // 快通道：高置信命中 [路径]/[原则] → 零材料零往返；慢通道：首步薄材料 + 最多 maxNudges 次再引导。
  try {
    const mcl = registerMcl(ctx as any, {
      enabled: config.mclEnabled !== false,
      familiarThreshold: Number(config.mclFamiliarThreshold) > 0 ? Number(config.mclFamiliarThreshold) : 0.65,
      maxNudges: Math.max(0, Number(config.mclMaxNudges) || 0),
      budgetChars: Math.max(120, Number(config.mclBudgetChars) || 600),
      topK: Math.min(5, Math.max(1, Number(config.mclTopK) || 3)),
      audit: config.mclAudit !== false,
      embed: {
        enabled: !!config.embedEnabled && !!config.embedBaseUrl && !!config.embedModel,
        baseUrl: String(config.embedBaseUrl || ''),
        model: String(config.embedModel || ''),
        apiKeyEnv: String(config.embedApiKeyEnv || ''),
        coldFactor: (Number(config.recallColdFactorPercent) > 0 ? Number(config.recallColdFactorPercent) : 35) / 100,
      },
    })
    if (mcl) mclShare.api = { status: () => mcl.status() }
  } catch (e) {
    ctx.logger?.warn?.(`[shoucang] MCL 装配失败（认知环跳过）：${String((e as Error)?.message || e).slice(0, 120)}`)
  }
}
