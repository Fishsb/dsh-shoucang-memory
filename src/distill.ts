/**
 * distill.ts — ADR-0002 阶段 2：蒸馏器（自记忆插件 index.ts 迁入，写入分发重接 targets.ts）。
 *
 * 事件链（ADR-0004 模式）：ctx.on('session/event') turn/end(completed) 且 root agent → per-agent idle 定时器
 *   → 到点且 agent idle → 内存增量（snapshotEvents 水位后）→ 预筛（信号词 + pending 候选；皆无则跳过不唤醒）
 *   → spawn 蒸馏子代理（maxDepth=1，10min 超时 race）→ 结构化 JSON（route=memory|project|discard）
 *   → targets.ts 动态路由 + 白名单门禁（不符合不存）→ 零拷贝写入（memory-append；R3 项目事实直写 workspace devref）
 *   → 水位推进（suite/knowledge/audit/distill-watermark.jsonl）→ 蒸馏审计（distill-audit.jsonl，UI 统计卡数据源）。
 *   v18 分段蒸馏（2026-09-10）：增量先由 buildEventChunks 按 CHUNK_CHARS/事件边界切段（不劈事件），distillAgent
 *   逐段 spawn——每段成功即推水位到该段 endSeq（断点续传，失败只停本段下轮续、不整窗重蒸）、段间紧凑清单 manifest
 *   续上下文防同轮重复入册、单轮至多 MAX_CHUNKS_PER_RUN 段；修复旧「整窗一次注入 24k 截断丢尾 / 失败整窗重蒸」。
 *
 * 深度睡眠归纳（v16：习得原则并入 agent 画像 AGENT.md；2026-09-08 拍板机制、2026-09-09 拍板定位=agent 的反思进化迭代）：独立巡检定时器（10min）检测「全部会话停滞 ≥3h」→ 触发一次。
 *   判据=**会话活跃状态机**（见 SessRec 注释）：任意事件→RUNNING，turn/end→ENDED；RUNNING 无事件 ≥probeAfterMs
 *   → PROBING（采样 transcript 两次比对 mtime/size）→ 增长=长任务（刷新水位不睡，唯一拦睡条件）/ 不增长+会话在
 *   =STALLED（不阻塞，发审计告警）/ 不增长+会话没了=EXIT / 探针不可用或异常=无法确认。后三者一律按停滞处理→正常睡。
 *   作用域=痕迹窗口（起点=上次深度睡眠水位，纯水位语义 2026-09-09：无痕迹滑窗不睡、消化后推进、失败回滚，
 *   不再叠加「本日 0 点」下限——0 点切会日切丢痕；按 mtime/时间戳判定，规避 pending 文件名 UTC 口径跨日偏差）：
 *   窗口内 pending + 窗口内写入的 notes + 窗口内 access 命中 → 归纳子代理 → 原则 JSON → write_gate 校验
 *   → `[原则]` 索引行原子写入 AGENT.md（冲突=原地 replace；反思双通道：认识自己+认识用户，同 pass 维护 USER 画像）。
 *
 * 坑位防御（devref/pitfalls 全清单）：禁 spawnSync（全异步 runAsync）；定时器随 disposed 事件清理；
 * reload 后旧 ctx 失效→错误 catch+水位保留重试；maxDepth=1+persona 委派禁令+toolFilter；
 * 路由归一化未知回退 memory（宁滥勿丢）；LLM 路由连败≥2 弃用指定 provider 回落继承（本迁入版补强）。
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  dshHome, knowledgeRoot, memoryLibRoot, resolveTarget, loadWhitelist, gateMemoryAppend,
  type Whitelist, type RouteTarget,
} from './targets.js'
import { recallRanked, semanticSim, type EmbedCfg } from './vec.js'
import { activityAggregate } from './activity.js'
import { applyTreeOps, applyForgetOps, sectionExists, type TreeOp } from './treeops.js'

// ═══ v18 分段蒸馏常量（2026-09-10 拍板「分段蒸馏 + 每段成功即推水位（可续传）+ 段间紧凑清单续上下文」）═══
// 开放可校准：CHUNK_CHARS=单段字符预算（切段只在事件边界、不劈事件），MAX_CHUNKS_PER_RUN=单轮触发至多处理段数
// （超出的段留待下一触发续传——水位停在已处理段的 endSeq）；UI 登记/参数化列为后续档。
const CHUNK_CHARS = 10000
const MAX_CHUNKS_PER_RUN = 3

// 蒸馏文本化规则单一实现（buildEventChunks 唯一入口，防口径漂移）：user/message 的每个 text 内容片
// ≤2000 前缀、assistant/chunk block-end 的 text ≤3000 前缀；事件无文本片 → 空数组。
const textPartsOfEvent = (e: any): string[] => {
  const parts: string[] = []
  if (e.type === 'user/message') {
    const d = (e as any).data || {}
    const arr = Array.isArray(d.content) ? d.content : []
    for (const c of arr) if (c && c.type === 'text' && typeof c.text === 'string') parts.push('[user] ' + c.text.slice(0, 2000))
  } else if (e.type === 'assistant/chunk') {
    const c = (e as any).data && (e as any).data.chunk
    if (c && c.type === 'block-end' && c.block && c.block.type === 'text' && typeof c.block.text === 'string') parts.push('[assistant] ' + c.block.text.slice(0, 3000))
  }
  return parts
}

// ── v18 纯函数分段器契约 ──
export interface DistillChunk { startSeq: number; endSeq: number; text: string }
export interface DistillChunks { chunks: DistillChunk[]; maxSeq: number }

/**
 * buildEventChunks — v18 分段器（2026-09-10）：把 seq>lastSeq 的事件增量按「累计字符超 chunkChars 即切段」切成若干段。
 * - 文本化规则 = 模块级 textPartsOfEvent 单一实现（user text 片 ≤2000、assistant block-end text ≤3000）；
 * - 切段只在事件边界，绝不劈事件；单个事件文本超 chunkChars 时允许单事件成段；
 * - 无文本事件并入当前开放段（只推进其 endSeq，不增字符）；窗口开头、首个文本事件之前的无文本事件不占段，
 *   但恒被水位推进覆盖（蒸馏成功推至首段 endSeq / 跳过推至 maxSeq），不丢事件；
 * - 窗口内完全没有 seq>lastSeq 的事件 → chunks=[]、maxSeq=lastSeq；maxSeq=窗口最末事件 seq；
 * - 不再返回 truncatedTail（2026-09-11 清理：该字段恒 false 且无消费方）；「还有后续段未处理」由调用方按
 *   chunks.length 与本轮段数上限（MAX_CHUNKS_PER_RUN）判定（水位停在已处理段的 endSeq，下一触发续传）。
 */
export function buildEventChunks(agent: any, lastSeq: number, chunkChars: number = CHUNK_CHARS, eventsOf?: any[]): DistillChunks {
  const events = eventsOf || agent.session.snapshotEvents()
  let maxSeq = lastSeq
  const chunks: DistillChunk[] = []
  let cur: { startSeq: number; endSeq: number; parts: string[]; len: number } | null = null
  for (const e of events) {
    const seq = (e as any).seq ?? 0
    if (seq <= lastSeq) continue
    if (seq > maxSeq) maxSeq = seq
    const parts = textPartsOfEvent(e)
    if (!parts.length) { if (cur) cur.endSeq = seq; continue }
    const partLen = parts.reduce((n, p) => n + p.length, 0)
    // 追加成本 = 各文本片长度 + join('\n') 分隔符数（cur 已有内容时每个新片前多一个 \n；开新段时片间分隔 n-1 个）
    const addCost = partLen + (cur ? parts.length : parts.length - 1)
    if (cur && cur.len + addCost > chunkChars) {
      chunks.push({ startSeq: cur.startSeq, endSeq: cur.endSeq, text: cur.parts.join('\n') })
      cur = null
    }
    if (!cur) cur = { startSeq: seq, endSeq: seq, parts: [], len: 0 }
    for (const p of parts) {
      cur.len += p.length + (cur.parts.length > 0 ? 1 : 0)
      cur.parts.push(p)
    }
    cur.endSeq = seq
  }
  if (cur) chunks.push({ startSeq: cur.startSeq, endSeq: cur.endSeq, text: cur.parts.join('\n') })
  return { chunks, maxSeq }
}

// 段间紧凑清单（v18）：manifest 行构造 / 推入（字符上限超出丢最早行）。行=每段成功后追加，
// 只服务「同轮后段查重/合并」；跨轮查重由「相关既有记忆（recallRanked）」承担。
const manifestLineFor = (endSeq: number, route: string, out: any): string => {
  const seen = new Set<string>()
  const topics: string[] = []
  // appends 目标小节（归一化后）前 12 字去重，最多 3 个
  for (const a of (out && Array.isArray(out.appends)) ? out.appends : []) {
    if (!a || topics.length >= 3) continue
    // v21（§8.1 分裂律）：section 可为树状路径「父/子」——逐段各截 12 字，不整体截断（否则同父下不同子撞键）
    const sec = String(a.section || '').trim().replace(/^[§#]+\s*/, '').replace(/(\/)?\s*[§#]+\s*/g, '$1')
      .split('/').map((s) => s.trim().slice(0, 12)).filter(Boolean).join('/')
    if (!sec || seen.has(sec)) continue
    seen.add(sec)
    topics.push(sec)
  }
  // newIndex 行主题最多 2 个（`[tag] 主题 · …` 取主题前 12 字）
  let niCount = 0
  for (const ni of (out && Array.isArray(out.newIndex)) ? out.newIndex : []) {
    if (!ni || niCount >= 2) continue
    const m = String(ni.line || '').match(/^\[[^\]\s]+\]\s*([^·]+?)\s*·/)
    const theme = m ? m[1].trim().slice(0, 12) : ''
    if (!theme || seen.has(theme)) continue
    seen.add(theme)
    topics.push(theme)
    niCount++
  }
  const n = (out && Array.isArray(out.appends)) ? out.appends.length : 0
  return `[segment ${endSeq}] route=${route} appends=${n} topics=${topics.length ? topics.join(',') : '-'}`
}
const manifestPush = (manifest: string, line: string, cap: number): string => {
  const next = manifest ? manifest + '\n' + line : line
  if (next.length <= cap) return next
  const ls = next.split('\n')
  let drop = 0
  while (ls.length - drop > 1 && ls.slice(drop).join('\n').length > cap) drop++
  return ls.slice(drop).join('\n')
}

type AppContext = {
  tools: { register(tool: unknown): unknown }
  llm: any
  subagents: { start(name: string, request: any): Promise<any> }
  agents: { get(id: string): any; list(): any[]; roots(): any[]; create(options: any): Promise<any> }
  logger?: { info?(msg: string): void }
  on(event: string, handler: (arg: any, arg2?: any) => void): unknown
  effect(fn: () => any, key?: string): unknown
}

export interface DistillConfig {
  nodeBin: string
  idleWakeMs: number
  minTurnChars: number
  distillPrescan: boolean
  prescanMinChars?: number // 大段强制蒸馏阈值（缺省 4000：增量≥此值跳过预筛直接蒸馏，2026-09-10 用户拍板：信息密集无关键词会话不再整段丢弃）
  distillPrompt: string
  llmProvider: string
  llmModel: string
  // 2026-09-10：蒸馏/深睡各自独立模型（空=回落 llmProvider/llmModel → 继承主会话）
  distillProvider: string
  distillModel: string
  sleepProvider: string
  sleepModel: string
  // ═══ 深度睡眠归纳（v16：习得原则并入 agent 画像 AGENT.md；2026-09-08 用户拍板：全部会话停滞 ≥3h 自动执行）═══
  enableDeepSleep: boolean
  // 认知对照 P2「REM 相」（2026-09-11）：深睡同时做**跨主题联想**（crossTopic，产出须覆盖 ≥2 个不同 § 主题）；
  // 缺省关；亦可用 env `SHOUCANG_REM_PASS=1` 打开（免改 zod schema 即可试跑）
  enableRemPass?: boolean
  deepSleepIdleMs: number
  // 会话活跃状态机（2026-09-08 重构）：running 状态持续无事件多久 → 发起「输出增长探测」确认真活跃
  deepSleepProbe: boolean
  deepSleepProbeAfterMs: number
  deepSleepProbeWindowMs: number
  // 探测可靠性加固（2026-09-08）：多轮采样 + 多信号交叉 + 卡住二次确认 + 失败重试 + 总时长兜底
  deepSleepProbeSamples: number
  deepSleepProbeConfirm: number
  deepSleepDaemonParent: boolean // 无会话兜底：自建守护 parent（默认关，宿主新建空 agent 路径未验证）
  deepSleepProbeRetries: number
  deepSleepProbeMaxMs: number
  // ═══ 路线④ 打扰度观察（shadow-first MVP 2026-09-09：默认只打影子日志不注入；active 注入待影子校准后拍板开启）═══
  activationShadow?: boolean // 观察打分+落 activation-shadow.jsonl（缺省开）
  activationPrefetch?: boolean // active 注入开关（缺省关；注入接线=v5.2 §5 后续档）
  activationTOn?: number // 滞回上阈（缺省 0.62；sim = top1 score / token 数，初值待影子校准）
  activationTOff?: number // 滞回下阈（缺省 0.52）
  activationCooldownSteps?: number // 触发后冷却步数（缺省 3）
  activationTopK?: number // 召回条数（缺省 3）
  // ═══ v6 向量政策（2026-09-10 用户拍板：项目各环节凡向量可提质处皆用之，质量优先；效率问题遇到再解）═══
  // 2026-09-10：记忆库容量门（写门 env 源）
  capAgent?: number
  capUser?: number
  capMemory?: number
  embedEnabled?: boolean // 嵌入开关（scheduler embedEnabled；本地 bge-m3 零 token）
  embedBaseUrl?: string // OpenAI 兼容 embeddings 基址
  embedModel?: string // embedding 模型名
  embedApiKeyEnv?: string // key 环境变量名（本地免 key）
  // ═══ v2（ADR-122）检索/运维面 ═══
  recallFusion?: string // 融合策略：'rrf'（缺省，排名融合 k=60）| 'weighted'（旧 min-max 加权，回滚用）
  bankGit?: boolean // 记忆库本地 git 版本化（写后快照；缺省开，失败静默）
  // v7 校准阈值（缺省 14/44/90/5/35，UI 可调）
  activityWarmDays?: number // active→warm 无命中天数（缺省 14）
  activityColdDays?: number // warm→cold 无命中天数（缺省 44）
  activityArchiveDays?: number // cold 且最近命中超过该天数 → 遗忘候选（缺省 90）
  activityHotHits?: number // 近 30 天命中 ≥ 此值 → 加深候选 B（缺省 5）
  recallColdFactorPercent?: number // 召回降权系数（百分比 → /100；缺省 35）
}

/**
 * 会话活跃状态机（Session Activity FSM）——深度睡眠「是否算停滞」的唯一判据源。
 *
 * 状态迁移：
 *   (新会话/任意事件) → RUNNING ──turn/end(completed)──► ENDED（开始停滞计时）
 *                          │                                  │
 *        无事件 ≥ probeAfterMs│                                  │ 所有会话停滞 ≥ idleMs
 *                          ▼                                    ▼
 *                    PROBING（采样 transcript 两次，比对 mtime/size）──► 触发深度睡眠
 *              ┌───────────┬────────────┬─────────────┬────────────┐
 *     输出在增长│ 无增长+会话还在│ 无增长+会话消失│ 探针不可用/异常│
 *              ▼           ▼            ▼             ▼
 *          RUNNING      SUSPECT      ENDED          ENDED
 *        (正常长任务)  (待复核，阻塞)  (异常退出)   (无法确认，正常睡)
 *                          │ 连续 confirm 轮无增长（或状态活跃但无增长=证据冲突）
 *                          ▼
 *                       STALLED（已确认卡住，不阻塞）
 *
 * 用户拍板口径（2026-09-08）：**只有确认「长线任务正在推进」才拦住睡眠**；其余（卡住/异常退出/探针不可用/
 * 探测异常）一律按停滞处理 → 正常睡眠（停滞计时沿用最后事件时刻，不再刷新成 now，否则会永远睡不着）。
 * 仅在采样窗口内「探测未决」时跳过本轮（最多延后一个巡检周期，10min）。
 */
type SessState = 'running' | 'ended' | 'probing' | 'suspect' | 'stalled'

/** 深度睡眠状态机快照（UI 已接线：deepsleep-share.ts 惰性桥接 → panel `GET /deepsleep` → client.js「深度睡眠」视图） */
export interface DeepSleepStatus {
  enabled: boolean
  idleMs: number
  probeAfterMs: number
  lastActivityAt: number
  lastDeepSleepAt: number
  running: number
  ended: number
  probing: number
  suspect: number
  stalled: number
  nextEligibleAt: number
  sessions: { sid: string; state: SessState; lastEventAt: number; lastEndAt: number; probeResult?: string }[]
}

interface SessRec {
  sid: string
  state: SessState
  lastEventAt: number // 最近一次任意会话事件（活跃信号 A）
  lastEndAt: number // 最近一次 turn/end(completed)（停滞计时起点）
  probeAt: number // 最近一次探测发起时刻
  probeRound: number // 已发起探测轮次（失败重试计数）
  stallRound: number // 连续「无输出增长」轮次（达到 confirm 才落 stalled）
  probeEvidence?: { rounds: number; samples: number; deltaBytes: number; alive: boolean; active: boolean } // 末次证据（排查用）
  probeResult?: 'long-run' | 'stall' | 'suspect' | 'conflict' | 'exit' | 'no-transcript' | 'error' // 探测结论（审计可查）
}

// ── 蒸馏裁决契约 v7（ADR-122 记忆核心 v2：判据段由 skill/engine/criteria.json 生成，禁手写）──
// v4 变更：取消「记忆库 vs 项目卡库」粒度二分——跨项目有用的细粒度条文也进 notes；项目专属事实直写项目工作区 devref；
//          新增 profiles 双画像通道（用户画像 USER + Agent 自我画像 AGENT，Q2「归谁」的落地写入通道）。
// v5 变更：appends 条目可选 rootCause/avoidWhen——教训/踩坑类浓缩附 WHY 根因与「不适用」场景。
// v7 变更（v2 架构）：① 判据段（R1-R4 + 四问 + Q2 画像判定）改为**生成投影** INGEST_JUDGE（源=criteria.json）；
//          ② 四问**降级为归属子判据组**（不再是全局判据抬头）；③ **删除「规则→SOUL.md」死支**（宿主无该写入通道）；
//          ④ 输出可带可选 `judgement`（L0 四维 + dup）→ 宿主写 judgement-ledger 供对账。
import { INGEST_JUDGE, CONSOLIDATE_JUDGE, JUDGEMENT_HINT, LEDGER_FILE, CRITERIA_VERSION } from './criteria.generated.js'
import { evaluateL0, promoteVerdict, demoteVerdict } from './criteria.js'
export const DEFAULT_DISTILL_PROMPT = `你是知识整理蒸馏子代理（守藏契约 v5）。任务：从给定会话增量正文中，判定每条可复用知识的归属（第一层路由），再输出结构化入册指令（由宿主执行写入，你无需也不能直接写文件/跑命令）。
判定锚（v4 单库）：只有一个记忆库——notes 存「下次做类似任务时给 agent 的方向」与跨项目有用的事实；项目专属事实不属于全局库，直写项目工作区。
${INGEST_JUDGE}
委派禁令：**独立完成，绝不 spawn/委派任何子代理**（查重凭给定正文与你自身知识判断）。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"route":"memory","appends":[{"target":"notes/tools.md","section":"<既有 ## 小节名，或「父/子」路径>","text":"教程式浓缩：目标一句+编号步骤+注意，≤120字"}],"newIndex":[{"target":"MEMORY.md","line":"[tag] 主题 · 概况短语/短语/短语 → notes/x.md §小节"}],"profiles":[{"target":"USER.md|AGENT.md","section":"≤12字小节名","text":"≤80字一句话"}],"projectCards":[{"cardType":"how-to|reference|decision","title":"≤20字","text":"≤200字","source":"≤30字"}],"skipped":[{"title":"...","reason":"≤30字"}]}
约束：route=memory → 填 appends/newIndex（target 白名单 notes/tools.md notes/flows.md notes/lessons.md notes/env.md notes/release.md；section = 既有 ## 小节名，或「父/子」树状路径（子节不存在时宿主自动建 ###，v21）；**裂 ### 判据（spec §8.1 分裂律）**：目标 ## 小节**子树正文 > 1000 字**（R=一次读取单元）**或同级条目 > 6 条**（K，防横向膨胀）→ 裂出子节、用「父/子」路径写入；否则并入父节（宁并勿滥裂，一层必须缩小候选集才有意义）；**text 教程式三段**「目标：… 1. … 2. … 注意：…」只写方向指引级浓缩——目标形态/步骤轮廓/关键注意点，不搬细节条文，纯事实类可省步骤保留目标行；**newIndex.line 格式权威=记忆库 spec §8**：[tag] 主题 · 概况短语/短语/短语 → notes/<file>.md §小节，定界符 ·=段界 /=短语界 →=指针，主题≤12字名词性禁冒号复合，概况名词短语 / 分隔、≤30字、高判别实词（专名/数值/路径关键词）、禁日期溯源），profiles/projectCards 留空；profiles 仅在 route=memory 时可填（0-2 条，宁缺毋滥，须是稳定画像而非一次性事实）；route=project → 填 projectCards（cardType: how-to=操作步骤/reference=契约事实/decision=架构决策），其余留空；route=discard → 除 skipped 全空；与 route 不匹配的条目宿主拒收。教训/踩坑类（notes/lessons.md 或 [lesson] 语境）可在 appends 条目附可选 rootCause/avoidWhen（各 ≤30 字，v5）——宿主写入时自动追加「- 根因：…」「- 不适用：…」两行，让教训带 WHY 与不适用条件（对标 WikiSkill pattern 双记 + When NOT to Apply），其余条目省略。
${JUDGEMENT_HINT}`

// ── 深度睡眠归纳契约（v17：习得原则与通用任务路径 [路径] 并入 agent 画像 AGENT.md；成败信号入材料；睡眠=agent 的反思进化迭代——认识自己也认识用户）──
// v17.2（2026-09-10 用户拍板 v6）：新增 pointerOps 通道——索引指针自动维护（扩容概况/重构指针 §/去重留优），只允许 update 不增删（新增=蒸馏 newIndex 唯一性硬门）。
// v17.3（2026-09-10 用户拍板 treeOps v1）：深睡可提 rename/merge 结构操作（宿主执行守不变量），v5.4「深睡不新建/不合并小节」禁令解除；分裂新 ### 仍归蒸馏写侧。
export const DEEP_SLEEP_PROMPT = `你是深度睡眠归纳子代理（守藏记忆·agent 画像成长引擎，audit-protocol §5）。任务：像人睡前回想当天经历一样，回顾给定「当天记忆痕迹」——**反思三通道：认识自己（提炼习得原则写入 AGENT.md）+ 认识用户（更新用户画像 USER.md）+ 沉淀通用任务路径（[路径] 行写入 AGENT.md，对标 AWM）**，仅认识自己或认识用户其一即反思不完整。原则=多条经验反复提纯凝成的跨任务泛化指引（巩固记忆；主动遗忘=提纯下放，不是删除）；路径=可复用任务类型的步骤序列（具体值必须变量化）。
判定规则：
${CONSOLIDATE_JUDGE}
- 路径行格式：\`[路径] <任务类型 ≤10 字> · <步骤概要 ≤40 字，用 ①②③ 串联> → notes/flows.md §小节\`；**具体值必须变量化**（如 <项目名>/<端口>/<文件名>——不抽象=过拟合单例）。
- 材料若含「窗口内任务运行统计」：先做成败对比（ExpeL 式）——异常集中出现的环节才是真因所在；对比结论仍受跨工作区红线约束，不得把单项目细节写成原则/路径。
- 源指针只能指向给定痕迹中真实出现过的 notes/<file>.md §小节（1-2 个小节）；行格式严格为（AGENT.md 索引行格式，概况段即原则一句或路径概要）：\`[原则] <主题 · 一句泛化> → notes/<file>.md §小节A/§小节B\`（主题 ≤12 字、概况 ≤30 字、禁日期戳）或 \`[路径]\`（格式见上，概要 ≤40 字）
- pending 内容尚未入册 notes 的，不得作为源指针（仅作背景理解）；找不到 notes 锚点就不提炼（宁缺毋滥）。
- 与既有原则/路径冲突时用 replace（match=既有行原文，须逐字来自给定「现行原则/路径」清单）；否则 add。
- **v17.3/v18 树由模型自动维护（2026-09-10/09-11 拍板）**：**你可以**在确有语义收益时提出 \`treeOps\` 结构操作——\`rename\`（改标题并改写指针）/ \`merge\`（并入叶子小节）/ **\`split\`（把一个叶子 \`##\` 按边界锚拆成 ≤6 个 \`###\`）**；宿主执行并守不变量（归档可回滚/锚存在/指针集内重写/无孤儿）。**split 判据（spec §8.1 分裂律）**：该 \`##\` 正文 > R=1000 字且能划出 ≥2 个**语义正交**子面 → 才拆（否则并入即可，宁并勿滥裂）；\`parts[].start\` 必须**逐字**取自材料「待拆候选节正文」的对应行、且在节内唯一；子节名 ≤12 字。**增量生长（并入/新建 \`###\`）由蒸馏写侧负责，存量整形归你**；宁缺毋滥，拿不准不出 treeOps。源指针仍指向真实存在的 §小节（含子节路径如 §父节/子节 若材料中已存在）。
- **split 的 JSON 形状**：\`{"action":"split","file":"lessons.md","title":"<目标叶子 ## 名>","parts":[{"title":"<子节名 ≤12 字>","start":"<该子节首行原文，逐字取自「待拆候选节正文」>"},…（2–6 个）]}\`；rename=\`{"action":"rename","file","oldTitle","newTitle"}\`、merge=\`{"action":"merge","file","keepTitle","dropTitle"}\`。
- **v19 forgetOps（认知对照 P0「主动遗忘」）**：材料「遗忘候选」列出 90 天零命中的冷节——**你可以**对其中若干条给出 \`forgetOps\`：\`{"action":"archive","file":"lessons.md","section":"<小节名>"}\`（该节**正文**移入归档区、原位留 stub，指针仍有效、可一键恢复）或 \`{"action":"keep","file":"lessons.md","section":"<小节名>","reason":"≤60 字"}\`（保留并给理由）。**只允许 archive/keep，任何删除类动作一律被宿主丢弃**。判据：**确不再需要**（一次性进度 / 已被取代 / 纯历史）→ archive；**仍可能用到**（安全红线 / 契约事实 / 偶发但关键）→ keep 并给理由。**宁 keep 勿 archive，拿不准不动**。
- **v19 crossTopic（认知对照 P2「REM 相」，仅在开启时生效）**：原则通道之外，可另提 \`crossTopic\`——**跨主题**联想出的上位原则：\`{"action":"add","text":"[原则] … → notes/x.md §A/§B"}\`。**硬门：text 的源指针必须覆盖 ≥2 个不同 § 小节**（同一主题内的归纳已由 principles 覆盖），不足即被宿主丢弃。没有真联想就留空，别硬凑。
- 独立完成：不 spawn 子代理、不使用任何工具，只依据给定材料。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"principles":[{"action":"add","text":"[原则] 排障先看根因 · 先验证成本低再修改成本高 → notes/lessons.md §A/§B"},{"action":"add","text":"[路径] DSH 插件升级 · ①提交推送 ②cp 覆盖 lib ③sc restart ④四端点 200 → notes/flows.md §升级"},{"action":"replace","match":"[原则] 既有原则原文行","text":"[原则] ... → notes/tools.md §C"}],"profileOps":[{"target":"USER.md","action":"add","section":"沟通偏好","text":"- ... ← 源: notes/lessons.md §A"}],"pointerOps":[{"target":"MEMORY.md","action":"update","match":"[lesson] 网络坑 · 旧概况短语 → notes/lessons.md §网络坑","line":"[lesson] 网络坑 · 新概况短语 → notes/lessons.md §网络坑"}],"treeOps":[{"action":"rename","file":"lessons.md","oldTitle":"旧名","newTitle":"新名"}],"forgetOps":[{"action":"keep","file":"lessons.md","section":"旧节","reason":"安全红线"}],"crossTopic":[],"skipped":[{"title":"...","reason":"≤30字"}]}
无足够素材 → {"principles":[],"profileOps":[],"pointerOps":[],"treeOps":[],"skipped":[]}。

双画像巩固（反思的另一通道=认识用户；与原则同判据、同红线）：
- 回顾给定「现行画像」（USER=用户画像 / AGENT=你的自我画像）与当天痕迹，若发现：**用户跨任务稳定的偏好/背景/禁忌**（非一次性需求）→ profileOps target=USER.md；**你自身反复出现的稳定做法/能力边界/常犯错误教训**（可跨任务复用的自我认知）→ target=AGENT.md。
- 每条必须带 notes 源指针（行内 \`← 源: notes/<file>.md §小节\`），无锚不提炼；与既有画像行冲突用 replace（match=既有行原文，须逐字来自给定现行画像）；宁缺毋滥。
索引指针自动维护（v6：只允许 pointerOps update 原地替换整行，**禁止新增/删除索引行**——新增归蒸馏 newIndex 且已有唯一性硬门；删除归审计裁决）：
- 扩容：小节正文显著增补 / 概况过时 / 主题出现新要点 → update 只刷新概况短语（保 标签/主题/指针 指向；概况 ≤30 字名词短语）。
- 重构：小节改名/合并导致指针 § 失效或漂移 → update 指针 §（概况如需一并刷新）。
- 去重：现行清单中同 标签+主题 出现两行 → 保留信息更全/命中更高者，update 被留行合并概况（绝不双写）。
- match 一律逐字取自「现行画像 / 现行知识索引」清单；无锚不 update，拿不准不动。
${JUDGEMENT_HINT}`

// ── 宿主注入样板判别（**单一实现**：候选区 isNoiseIntent + 打扰度采样 activationStep 共用；2026-09-11 ACT-024）──
// 背景：DSH 会把宿主注入块作为 `user/message` 事件下发——运行态快照（Current runtime context）、后台 job/子代理回执
// （Background subagent|job …）、`<system-reminder>` 指令块、子代理消息回执（Agent <uuid> sent a message）。这类文本
// 既不构成「可复用的任务类型」（候选区），也不代表用户任务意图（打扰度采样：实测 909 样本污染 49.3%）。
// 首选判别是**结构字段 `data.source.kind`**（采样侧已用）；本内容闸用于无 source 的旧格式/夹具事件与候选区文本兜底。
export const CANDIDATE_NOISE: RegExp[] = [
  /^Current runtime context\b/i,
  /<system-reminder>/i,
  /^Background (subagent|job)\b/i,
  /^background (subagent|job)\b/, // 实测真实模板是小写 `background job pwsh-1 (…)`，旧正则漏判
  /^You are an AI agent\b/i,
  /^Agent [0-9a-f-]{8,} sent a message\b/i, // 子代理→父会话回执
  /^#\s*守藏[·\s]/, // 热记忆横幅（若被当作用户输入）
]
/** 文本是否宿主注入样板（见上：候选区与采样共用的单一实现） */
export const isNoiseIntent = (s: string): boolean => CANDIDATE_NOISE.some((re) => re.test(String(s)))

// ── 预筛信号词（零拷贝优先动态加载记忆仓 engine/signals.mjs；不可达时内嵌兜底副本，与 engine 同源）──
const PRESCAN_STRONG = ['记住', '以后', '注意', '踩坑', '原来是这样', '应该改成', '别再用', '纠正', '别忘了', '务必']
const PRESCAN_MID = [/失败.{0,24}(换|改)用/, /(报错|失败).{0,16}(换|改)用/, /改用.{0,12}(工具|方式|方案|命令)/, /原因.{0,12}(是|为|在于)/, /(记|存).{0,6}(到|进)/, /根因/, /对策/, /(要|该)记住/, /下次(要|得|注意)/]
let hasDistillSignalsImpl: ((text: string) => boolean) | null = null
const hasDistillSignals = (text: string): boolean => {
  if (!text) return false
  if (hasDistillSignalsImpl) return hasDistillSignalsImpl(text)
  if (PRESCAN_STRONG.some((s) => text.includes(s))) return true
  return PRESCAN_MID.some((re) => re.test(text))
}
const loadEngineSignals = async (): Promise<void> => {
  const candidates = [join(memoryLibRoot(), 'engine', 'signals.mjs')]
  for (const p of candidates) {
    try {
      const mod = await import(pathToFileURL(p).href)
      if (mod && typeof mod.hasDistillSignals === 'function') { hasDistillSignalsImpl = mod.hasDistillSignals; return }
    } catch { /* 下一个 */ }
  }
}

// ── 异步进程调用（禁 spawnSync 红线）──
type RunResult = { status: number | null; out: string; err: string }
function runNode(nodeBin: string, scriptPath: string, args: string[], opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<RunResult> {
  return new Promise((resolve) => {
    let out = '', err = '', killed = false
    const child = spawn(nodeBin || 'node', [scriptPath, ...args], {
      cwd: opts?.cwd, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
      // 2026-09-10 实锤修复：宿主 process.env 含 NODE_OPTIONS（inspector --inspect=9445），子进程继承后
      // 端口冲突 → Node 启动异常（status=null / 无 stdout），所有 runNode 子脚本静默失效。
      // 统一清空 NODE_OPTIONS（子脚本无需 inspector），彻底消除该干扰。
      env: { ...process.env, NODE_OPTIONS: '', ...(opts?.env || {}) },
    } as any)
    const to = setTimeout(() => { killed = true; try { child.kill() } catch { /* */ } }, opts?.timeout ?? 60000)
    child.stdout?.on('data', (d) => { out += d })
    child.stderr?.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(to); resolve({ status: null, out: '', err: String(e).slice(0, 200) }) })
    child.on('close', (code) => { clearTimeout(to); resolve({ status: killed ? null : code, out, err: killed ? err + '\n[timed out]' : err }) })
  })
}
const textOf = (r: RunResult): string => (r.out + (r.err ? '\n[stderr] ' + r.err.trim() : '')).trim()

// ── 蒸馏器主体 ──
export function registerDistill(ctx: AppContext, config: DistillConfig): {
  getDeepSleepStatus: () => DeepSleepStatus
  runDeepSleepNow: () => Promise<{ ok: boolean; error?: string; result?: 'done' | 'failed' | 'no-traces' }>
  getConfig: () => {
    enableDeepSleep: boolean
    deepSleepIdleMs: number
    deepSleepProbe: boolean
    deepSleepProbeAfterMs: number
    deepSleepProbeWindowMs: number
  }
  runDistillNow: () => Promise<{ ok: boolean; sessions: number; note?: string }>
} {
  const SHORT = 'shoucang-scheduler'
  const logFile = join(dshHome(), 'super-injector', SHORT + '.log')
  const kRoot = knowledgeRoot()
  const watermarkFile = join(kRoot, 'audit', 'distill-watermark.jsonl')
  const auditFile = join(kRoot, 'audit', 'distill-audit.jsonl')
  // 判据台账（ADR-122 v2）：每次决策一行——判据取值 + 决策 + 结果 + 依据，供 scripts/criteria-audit.mjs 对账
  const ledgerFile = join(kRoot, LEDGER_FILE)
  const ledger = (o: Record<string, unknown>): void => {
    try {
      mkdirSync(dirname(ledgerFile), { recursive: true })
      appendFileSync(ledgerFile, JSON.stringify({ at: new Date().toISOString(), criteriaVersion: CRITERIA_VERSION, ...o }) + '\n', 'utf8')
    } catch { /* 台账失败静默（不影响主流程） */ }
  }
  const pendDir = join(kRoot, 'pending')
  // ═══ 路线② 成长环数据源：轻 episode（同类判定/转正数据源，不存全文）+ 低置信任务候选区（跨窗口记忆）═══
  const episodeFile = join(kRoot, 'audit', 'episodes.jsonl')
  const candidateDir = join(pendDir, 'flow-candidates')
  const EPISODE_CAP = 256
  const recordEpisode = (o: Record<string, unknown>): void => {
    try {
      mkdirSync(dirname(episodeFile), { recursive: true })
      appendFileSync(episodeFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8')
      try {
        const ls = readFileSync(episodeFile, 'utf8').split('\n').filter((l) => l.trim())
        if (ls.length > EPISODE_CAP + 8) writeFileSync(episodeFile, ls.slice(ls.length - EPISODE_CAP).join('\n') + '\n', 'utf8')
      } catch { /* 修剪失败无害 */ }
    } catch { /* 记录失败静默 */ }
  }
  const intentOf = (deltaText: string): string => {
    const m = String(deltaText || '').match(/^\[user\]\s*([\s\S]{0,120})/m)
    return m ? m[1].trim().replace(/\s+/g, ' ') : ''
  }
  // 语义指纹：intent → 判别 token 集（CJK 双字滑动 + 英文 ≥4 词），供同型判定（词法地板，零依赖）
  const intentTokens = (text: string): string[] => {
    const t = String(text || '').replace(/[^\w\u4e00-\u9fa5]+/g, ' ').trim()
    const out = new Set<string>()
    // 英文/数字 ≥4 的整词
    for (const w of t.split(' ')) if (/[A-Za-z0-9]/.test(w) && w.length >= 4) out.add(w.toLowerCase())
    // 中文连续 2 字滑动窗口（去标点后保留中文段）
    const zh = (t.match(/[\u4e00-\u9fa5]+/g) || []).join('')
    for (let i = 0; i + 1 < zh.length; i++) out.add(zh.slice(i, i + 2))
    return [...out]
  }
  // 项目卡标题相似度（2026-09-10）：英文词 ≥2（含 vec 等短词）+ 中文 2-gram；
  // 相似度 = 交集/min(|A|,|B|) ≥0.42 —— 比指针门 Jaccard 宽松，适配「标题短、同事实不同措辞」（实测同类对 0.444~1.0、异主题 ≤0.30）
  // （实测「vec缓存指纹与重建机制」vs「vec 缓存模型指纹与重建」用 intentTokens+Jaccard 仅 0.45 漏判）
  const cardTokens = (text: string): string[] => {
    const t = String(text || '').replace(/[^\w\u4e00-\u9fa5]+/g, ' ').trim()
    const out = new Set<string>()
    for (const w of t.split(' ')) if (/[A-Za-z0-9]/.test(w) && w.length >= 2) out.add(w.toLowerCase())
    const zh = (t.match(/[\u4e00-\u9fa5]+/g) || []).join('')
    for (let i = 0; i + 1 < zh.length; i++) out.add(zh.slice(i, i + 2))
    return [...out]
  }
  const cardSimilar = (a: string, b: string): number => {
    const A = cardTokens(a), B = cardTokens(b)
    if (!A.length || !B.length) return 0
    const inter = A.filter((x) => B.includes(x)).length
    return inter / Math.min(A.length, B.length)
  }
  // 候选噪声闸：判别实现已上提为模块级 `isNoiseIntent`（单一实现，候选区 + 打扰度采样共用；2026-09-11 ACT-024）
  const ensureFlowCandidate = async (sid: string, intent: string): Promise<void> => {
    if (!intent || intent.length < 8 || isNoiseIntent(intent)) return
    try {
      mkdirSync(candidateDir, { recursive: true })
      const day = new Date().toISOString().slice(0, 10)
      // 同型聚合（memory-core-model §4 转正数据源）：intent 指纹与既有候选「类型线索」共享 ≥2 token 视为同型，
      // 追加本次源会话 + 成功计数到既有文件（跨会话可见重复 → 深睡可归纳 [路径]），否则新建候选。
      // v6 向量第二批：词法无同型时再走语义（dense ≥0.80 保守并，补措辞迥异漏网；embed 未启用/失败=新建）
      const tokens = intentTokens(intent)
      let matched: string | null = null
      let matchedScore = 0
      for (const f of existsSync(candidateDir) ? readdirSync(candidateDir).filter((x) => x.endsWith('.md')) : []) {
        try {
          const body = readFileSync(join(candidateDir, f), 'utf8')
          const m = body.match(/- 类型线索：(.+)/)
          if (!m) continue
          const existing = intentTokens(m[1])
          const inter = tokens.filter((tk) => existing.includes(tk)).length
          if (inter >= 2 && inter > matchedScore) { matched = f; matchedScore = inter }
        } catch { /* 坏候选跳过 */ }
      }
      if (!matched) {
        try {
          const ecfg = embedCfgOf()
          if (ecfg.enabled) {
            let bestSim = 0.8
            for (const f of existsSync(candidateDir) ? readdirSync(candidateDir).filter((x) => x.endsWith('.md')) : []) {
              try {
                const body = readFileSync(join(candidateDir, f), 'utf8')
                const m = body.match(/- 类型线索：(.+)/)
                if (!m) continue
                const s = await semanticSim(intent, m[1].trim(), ecfg)
                if (s !== null && s > bestSim) { bestSim = s; matched = f }
              } catch { /* 坏候选跳过 */ }
            }
          }
        } catch { /* 语义匹配失败=按词法结论（新建） */ }
      }
      if (matched) {
        const fp = join(candidateDir, matched)
        const body = readFileSync(fp, 'utf8')
        const cur = body.match(/- 类型线索：(.+)/)
        const clue = cur ? cur[1].trim() : intent
        // 跨会话计数：源会话不重复追加；会话集合数=跨会话信号（供深睡「同类型 ≥2 次且跨会话」判据）
        const sids = [...new Set([...(body.match(/^- 源会话：(.+)$/gm) || []).map((l) => l.replace(/^- 源会话：/, '').trim()), sid])]
        const n = sids.length
        // 规范化整体重写（修 2026-09-11 实测缺陷）：原先只剔「源会话/成功次数/跨会话」三键，
        // **「最近更新」从不剔除** ⇒ 每次同型合并都再追加一行，实测单个候选累积 40 条重复行
        // （文件膨胀 + 「最近更新」语义失真）。现按固定字段序重建，任何字段都不会重复累积；
        // 源会话改为**每会话一行**，使跨会话数可从文件自身复算（不再只依赖计数行）。
        const newBody = [
          '# 任务候选（低置信 · 跨窗口记忆）',
          '',
          `- 类型线索：${clue}`,
          ...sids.map((s) => `- 源会话：${s}`),
          `- 成功次数：${n}`,
          `- 跨会话：${n}`,
          '- 状态：候选（非源指针；仅供深睡跨窗口同型判断——同类成功 ≥2 且跨会话 ≥2 由深睡归纳为 [路径]）',
          `- 最近更新：${day}`,
          '',
        ].join('\n')
        writeFileSync(fp, newBody, 'utf8')
        return
      }
      let hash = 0
      for (const c of intent) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
      const f = join(candidateDir, `${day}-${hash.toString(36).slice(0, 6)}.md`)
      writeFileSync(f, `# 任务候选（低置信 · 跨窗口记忆）\n\n- 类型线索：${intent}\n- 源会话：${sid}\n- 成功次数：1\n- 跨会话：1\n- 状态：候选（非源指针；仅供深睡跨窗口同型判断——同类成功 ≥2 且跨会话 ≥2 由深睡归纳为 [路径]）\n- 最近更新：${day}\n`, 'utf8')
    } catch { /* 候选落盘失败静默 */ }
  }
  const log = (msg: string): void => { try { mkdirSync(dirname(logFile), { recursive: true }); appendFileSync(logFile, '[' + new Date().toISOString() + '] ' + msg + '\n') } catch { /* 静默 */ } }
  // sid 可读短号：slice(0,8) 恒等于 'session-' 前缀（此前日志全打成 'session-' 无辨识度）——取 uuid 中段
  const sidShort = (sid: string): string => (sid && sid.startsWith('session-') && sid.length > 16 ? sid.slice(8, 16) : String(sid || '').slice(0, 12))
  const audit = (o: Record<string, unknown>): void => { try { mkdirSync(dirname(auditFile), { recursive: true }); appendFileSync(auditFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n') } catch { /* 静默 */ } }
  // ═══ WikiSkill 借鉴 · raw 裁决存根（raw-stub/）：每轮蒸馏裁决的不可变元数据留档（不含正文/文本内容，隐私安全），
  // 供 route 分流抽验（audit-protocol §8 第 5 问）与契约升级的离线重放评测（对标 WikiSkill raw/ 只存证据不存解读）。写入后不覆写。
  const stubDir = join(kRoot, 'audit', 'raw-stub')
  const recordStub = (o: Record<string, unknown>): void => {
    try {
      mkdirSync(stubDir, { recursive: true })
      appendFileSync(join(stubDir, 'stub.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8')
    } catch { /* 存根失败静默 */ }
  }
  const distilling = new Set<string>() // 并发守卫：同会话蒸馏在途标记（防 turn/end 重武装导致双写/竞态）

  // 单库化（2026-09-08 用户拍板）：守藏只有一个记忆库（生产根），不再有 presence 二分与降级链。
  // 库缺席（部署残缺）时由各写入点如实审计，不再静默换库。

  loadEngineSignals()

  // 水位（suite 本地，自记忆插件 audit/ 迁入；切换时存量水位行随 pending 一并移交）
  const readWatermarks = (): Map<string, any> => {
    const map = new Map<string, any>()
    try {
      for (const l of readFileSync(watermarkFile, 'utf8').split('\n')) {
        if (!l.trim()) continue
        try { const o = JSON.parse(l); map.set(o.sessionId, o) } catch { /* 坏行跳过 */ }
      }
    } catch { /* 无水位文件=全新 */ }
    return map
  }
  const writeWatermark = (sessionId: string, lastSeq: number, agent?: any): void => {
    try {
      // 双证随行（2026-09-10 v19）：格式代 + 锚点事件指纹。缺失则退化为纯数字水位（与旧行同构）。
      const ver = sessionFormatVersionOf(agent)
      const fp = agentFingerprintAt(agent, lastSeq)
      mkdirSync(dirname(watermarkFile), { recursive: true })
      appendFileSync(watermarkFile, JSON.stringify({
        sessionId, lastSeq, at: new Date().toISOString(),
        ...(ver === undefined ? {} : { formatVersion: ver }),
        ...(fp === null ? {} : { fp }),
      }) + '\n', 'utf8')
    } catch { /* 静默 */ }
  }

  // ═══ 水位双证校验（2026-09-10 v19：抗会话格式代际迁移的 seq 重排）═══
  // 背景（alpha V0→V3 迁移实锤）：DSH 会话格式升级时 seq 被**密集重排**并插入 system/message 行，
  // 同一个数字不再指向同一个事件；守藏水位是自持的 sessionId→lastSeq 数字，迁移后：
  //   ① 若 live seq 空间比记录的小 → 增量窗口被放大成整会话 → LLM 成本爆炸 + 重复入册；
  //   ② 若 live seq 空间更大 → 事件在挪位后的序号上未被消费 → 静默跳过一段真实增量。
  // 两种都无声出错，故记录时同时落「格式代 + 锚点事件指纹」，读取时双证一致才信任：
  //   - 格式代不同（v0/v1/v2 → v3）= 已发生迁移 → 作废全量重蒸（宁可重蒸，不可错漏）；
  //   - 锚点事件指纹（type|time|data 长度）不符 = 序号空间被重排 → 同样作废；
  //   - 两证皆缺（v19 前的历史水位行）= 不可验证 → 不信任（重蒸一次，随后被新行升级为双证）。
  const sessionFormatVersionOf = (agent: any): number | undefined => {
    try { const v = agent?.session?.header?.version; return typeof v === 'number' ? v : undefined } catch { return undefined }
  }
  /** 锚点事件指纹：记录时刻 lastSeq 处事件的 type|time|data 长度（seq 重排后此三元组随之改变）。 */
  const agentFingerprintAt = (agent: any, seq: number): string | null => {
    try {
      if (!(seq > 0) || typeof agent?.session?.eventAt !== 'function') return null
      const e: any = agent.session.eventAt(seq)
      if (!e) return null
      let dl = -1
      try { dl = JSON.stringify(e.data ?? null).length } catch { /* 不可序列化 → -1 */ }
      return `${e.type || '?'}|${e.time ?? -1}|${dl}`
    } catch { return null }
  }
  /**
   * 未验证水位行的一次性收尾（作废留痕）：**跳到当前 live maxSeq 并写双证**，而不是写 0。
   * 为何不是 0：写 0 的行没有可用锚点（seq 0 无事件）→ 下次读仍判「不可验证」→ 每轮全量重蒸，形成死循环。
   * 为何跳到 maxSeq 是安全的：作废的三种情形（格式代变更 / 锚点指纹不符 / 双证缺失的历史行）都意味着
   * 「已消费边界」不可定位——不可定位就无法安全重蒸（可能错位重蒸整会话，也可能错位跳过），
   * 故从当前边界继续；旧版本已消费的部分由旧版本负责，不重复也不再回补。
   * 代价明确且可接受：不可定位的那一段增量不再回补（宁可少蒸一次，不可错位重蒸/错位跳过）。
   */
  const discardWatermark = (sid: string, reason: string, agent: any, wm: any): void => {
    let maxSeq = 0
    try {
      if (typeof agent?.session?.snapshotEvents === 'function') {
        for (const e of agent.session.snapshotEvents()) { const s = (e as any).seq ?? 0; if (s > maxSeq) maxSeq = s }
      }
    } catch { /* 快照不可用 → 退化为 0（该会话下轮重扫，无害） */ }
    writeWatermark(sid, maxSeq, agent)
    try {
      audit({ sid, kind: 'watermark-invalidated', reason, prevSeq: wm?.lastSeq ?? null, prevVersion: wm?.formatVersion ?? null, version: sessionFormatVersionOf(agent) ?? null, restartFrom: maxSeq })
    } catch { /* 审计失败静默 */ }
    log(`watermark: ${sidShort(sid)} 双证失效（${reason}）→ 从当前边界 ${maxSeq} 继续（prevSeq=${wm?.lastSeq ?? '-'} prevVer=${wm?.formatVersion ?? '-'} ver=${sessionFormatVersionOf(agent) ?? '-'}）`)
  }
  /** 取单一可信任基线；返回 null = 无水位/双证失效（走全量窗口）；否则为可信任的 { lastSeq, formatVersion, fp }。 */
  const resolveWatermark = (sid: string, agent: any, mapCache?: Map<string, any>): { lastSeq: number; formatVersion: number; fp: string } | null => {
    const wm = (mapCache || readWatermarks()).get(sid)
    if (!wm) return null
    const lastSeq = Number(wm.lastSeq || 0)
    if (lastSeq <= 0) return null
    const liveVer = sessionFormatVersionOf(agent)
    const recVer = typeof wm.formatVersion === 'number' ? wm.formatVersion : undefined
    if (recVer === undefined || liveVer === undefined) { discardWatermark(sid, 'unverifiable-legacy', agent, wm); return null }
    if (liveVer !== recVer) { discardWatermark(sid, `format-migrated ${recVer}→${liveVer}`, agent, wm); return null }
    const fp = agentFingerprintAt(agent, lastSeq)
    if (fp === null || wm.fp === undefined || wm.fp === null) { discardWatermark(sid, 'fingerprint-unavailable', agent, wm); return null }
    if (fp !== wm.fp) { discardWatermark(sid, `seq-space-shifted (${String(wm.fp).slice(0, 40)} ≠ ${fp.slice(0, 40)})`, agent, wm); return null }
    return { lastSeq, formatVersion: recVer, fp }
  }

  // LLM 路由连败弃用（坑位补强：连败≥2 回落继承主会话模型，成功后复位）
  let providerFailCount = 0
  const validateProvider = (): void => {
    if (!(config.llmProvider && config.llmModel) || providerFailCount >= 2) return
    try {
      const llm = ctx.llm as any
      const providers = llm.listProviders ? llm.listProviders() : []
      const names = (providers || []).map((p: any) => p && (p.id || p.provider || p.name))
      if (names.length && !names.includes(config.llmProvider)) {
        log(`warn: llmProvider "${config.llmProvider}" 不在实例注册列表 [${names.join(', ')}]——spawn 将 NO_ADAPTER，请改用真实 adapter 名或留空继承`)
      }
    } catch { /* listProviders 不可用时静默 */ }
  }

  // 2026-09-10：蒸馏/深睡各自独立模型——具体键有值用之，否则回落共用键（仍空=继承主会话）
  const resolveLlm = (sp: string, sm: string): { provider: string; model: string } | null => {
    if (sp && sm) return { provider: sp, model: sm }
    if (config.llmProvider && config.llmModel) return { provider: config.llmProvider, model: config.llmModel }
    return null
  }

  // 2026-09-11 清理：原 extractDelta（24k 截断版）已实证**零调用**（全仓 grep 只剩定义与注释；原注释「勿删」与实况不符），
  // 故删除。文本化规则的唯一实现 = 模块级 textPartsOfEvent → buildEventChunks（蒸馏/深睡按需复用）。

  /** E3 桥：定位会话转录文件绝对路径（零拷贝调记忆仓 locate-transcript-probe；探测「是否还在输出」的硬证据） */
  const locateTranscript = async (sid: string): Promise<string | null> => {
    try {
      if (!existsSync(probeScriptPath)) return null
      const r = await runNode(config.nodeBin, probeScriptPath, [sid], { timeout: 15000 })
      if (r.status !== 0) return null
      return textOf(r).trim().split('\n').find((l) => l.includes('session.jsonl')) || null
    } catch { return null }
  }

  const resolveWorkspace = async (sid: string): Promise<string | null> => {
    // 反解带瞬态容错：转录定位可能晚于会话 end 落盘 / 探针单次抖动 → 仅「定位失败」重试 3 次（1.5s 退避）；
    // 路径已定位但无 workspace 归属属永久无归属，重试无意义，直接返回 null 走 writeDispatch 降级链。
    // 2026-09-10 实锤修复：目录名 decode 有歧义（盘符冒号压成 '-' 且目录内连字符无法区分，D:\FF\shoucang → D-FF-shoucang
    // 无法还原冒号 → 校验失败 → project 卡全降级 pending 死循环）——改为优先读转录首行 cwd（权威无歧义），目录 decode 仅兜底。
    for (let attempt = 1; attempt <= 3; attempt++) {
      let file: string | null = null
      try { file = await locateTranscript(sid) } catch { file = null }
      if (!file) log(`ws 反解: 转录定位失败 attempt=${attempt} sid=${sid.slice(0, 18)}`)
      if (file) {
        // ① 权威：转录首行 session.cwd
        try {
          const cwdProbe = join(memoryLibRoot(), 'scripts', 'transcript-cwd-probe.mjs')
          if (existsSync(cwdProbe)) {
            const r = await runNode(config.nodeBin, cwdProbe, [file], { timeout: 30000 })
            const wsCwd = r.status === 0 ? textOf(r).trim() : ''
            if (wsCwd && /^[A-Za-z]:[\\/]/.test(wsCwd)) return wsCwd
            log(`ws 反解: cwd 探针无结果 status=${r.status} out=${JSON.stringify(textOf(r).slice(0, 80))}`)
          } else {
            log(`ws 反解: cwd 探针缺失 ${cwdProbe}`)
          }
        } catch (e) { log(`ws 反解: cwd 探针异常 ${String((e as Error)?.message || e).slice(0, 80)}`) }
        // ② 兜底：目录名 decode（盘符冒号补全）
        const m = file.match(/sessions[\\/]+(--.+?--)[\\/]/)
        if (m) {
          const ws0 = m[1].slice(2, -2).replace(/--/g, '\\').replace(/~0040/g, '@')
          const ws = /^([A-Za-z])\\/.test(ws0) ? ws0[0] + ':' + ws0.slice(1) : ws0
          if (/^[A-Za-z]:/.test(ws)) return ws
        }
        return null // 已定位但无 workspace 归属：永久，不重试
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500))
    }
    return null
  }

  // 容量门实时读取（2026-09-10：面板调容量门后写门即时生效，不必重载插件）——
  // 优先 scheduler.json 的 capAgent/capUser/capMemory（= 面板同源），回落启动期 config 值。
  const liveCaps = (): { agent: number; user: number; memory: number } => {
    const d = { agent: config.capAgent ?? 3000, user: config.capUser ?? 3000, memory: config.capMemory ?? 5000 }
    try {
      const s = JSON.parse(readFileSync(join(dshHome(), 'suite', 'scheduler.json'), 'utf8')) as Record<string, unknown>
      if (typeof s.capAgent === 'number' && s.capAgent > 0) d.agent = s.capAgent
      if (typeof s.capUser === 'number' && s.capUser > 0) d.user = s.capUser
      if (typeof s.capMemory === 'number' && s.capMemory > 0) d.memory = s.capMemory
    } catch { /* 配置不可读=用启动值 */ }
    return d
  }

  const capEnv = (): Record<string, string> => {
    const c2 = liveCaps()
    return { SHOUCANG_CAP_MEMORY: String(c2.memory), SHOUCANG_CAP_USER: String(c2.user), SHOUCANG_CAP_AGENT: String(c2.agent) }
  }

  // ── 写入分发（ADR-0002 核心：动态路由 + 白名单门禁 + 零拷贝写入 + 审计）──
  const memAppend = async (target: string, kind: 'append' | 'new', payload: string, section: string, t: RouteTarget): Promise<RunResult> => {
    const script = join(memoryLibRoot(), 'scripts', 'memory-append.mjs')
    const args = kind === 'append' ? [target, section, payload] : [target, '-', '--new', payload]
    return runNode(config.nodeBin, script, args, { env: { MEMORY_ROOT: t.root, ...capEnv() }, timeout: 20000 })
  }

  // ── 双画像维护（2026-09-08 用户拍板：蒸馏/睡眠不只补记忆，还更新 USER/AGENT 双画像——助理角色要有自我认知）
  //    v16：AGENT.md 升格为「成长型自我画像」（含 [原则] 习得原则），容量 2,000→3,000 ──
  // v5.1（2026-09-10 架构体检实锤）：契约教模型输出 target=USER|AGENT，写门却只认 USER.md|AGENT.md →
  //   蒸馏 profiles 通道自 v15 上线以来每次写入必被拒（审计 kind=gate-reject target=USER/AGENT 为证）。
  //   模型输出的用词漂移一律在宿主侧收敛——与下方 section 归一化（前导 §/## 前缀）同法，不回退成「拒收」。
  const normalizeProfileTarget = (raw: string): 'USER.md' | 'AGENT.md' | null => {
    const k = String(raw || '').trim().toLowerCase().replace(/\.md$/, '')
    return k === 'user' ? 'USER.md' : k === 'agent' ? 'AGENT.md' : null
  }
  // 容量门同源（补齐 2026-09-10「画像/记忆容量与容量门同源」漏掉的第三处源：此处原为硬编码 3,000）
  const profileCapOf = (canon: 'USER.md' | 'AGENT.md'): number => (canon === 'USER.md' ? liveCaps().user : liveCaps().agent)
  const PROFILE_HEADER: Record<string, string> = {
    'USER.md': '# USER.md — 用户画像\n\n> 「人」的画像：用户稳定偏好/背景/禁忌。库中唯一直接关于用户的文件；其余（notes/原则/索引/AGENT.md）皆为 agent 自身资产。写入口=蒸馏 profileUpdates + 深度睡眠 profileOps；每行带源指针。',
    'AGENT.md': '# AGENT.md — Agent 自我画像（助理的成长档案）\n\n> 用户助理角色的自我认知：角色定位/稳定做法/能力边界/常犯错误与教训/[原则] 习得原则（深度睡眠归纳内化，v16）。库中其余一切（notes/索引）都是本 agent 为履行助理职责而积累的自身资产，本文件只回答「我是谁、我学到了什么、我怎样服务好用户」。写入口=蒸馏 profileUpdates + 深度睡眠（原则行 + profileOps）；每行带源指针。',
  }
  /**
   * 画像行写入（宿主直写，tmp+rename 原子）：小节存在→小节尾加行；不存在→文件尾建小节。
   * 门禁：target 归一化后仅 USER.md/AGENT.md、小节名防注入、单行 ≤160 字符、库容量按 liveCaps()、去重、replace 须 match 逐字存在。
   * 返回带拒因（v5.1）：拒收原因写真进审计，不再糊成一句「格式/容量门」导致无法诊断。
   */
  const writeProfileLine = (root: string, target: string, section: string, line: string, replaceMatch?: string): { st: 'added' | 'dedup' | 'failed' } | { st: 'rejected'; why: string } => {
    try {
      const canon = normalizeProfileTarget(target)
      if (!canon) return { st: 'rejected', why: `target 非画像（${String(target).slice(0, 24)}）` }
      const sec = String(section || '').trim().replace(/^##+ */, '').trim()
      const ln = String(line || '').trim()
      if (!sec || !ln || ln.length > 160 || /[#`]/.test(sec)) return { st: 'rejected', why: `格式违规（${!sec ? '小节名为空' : !ln ? '行为空' : ln.length > 160 ? `行长 ${ln.length} > 160` : '小节名含 # 或 ` 注入字符'}）` }
      const file = join(root, canon)
      let body = ''
      try { body = readFileSync(file, 'utf8') } catch { body = (PROFILE_HEADER[canon] || `# ${canon}\n`) + '\n' }
      if (body.split('\n').some((l) => l.trim() === ln)) return { st: 'dedup' }
      const cap = profileCapOf(canon)
      if (body.length + ln.length + sec.length + 8 > cap) return { st: 'rejected', why: `容量超限（${body.length}+${ln.length}+${sec.length}+8 > ${canon} 容量 ${cap}）` } // 容量门：超限拒绝，待画像间合并
      const lines = body.split('\n')
      const secIdx = lines.findIndex((l) => l.trim() === `## ${sec}`)
      if (secIdx < 0) lines.push('', `## ${sec}`, ln)
      else if (replaceMatch) {
        const mi = lines.findIndex((l) => l.trim() === String(replaceMatch).trim())
        if (mi < 0) return { st: 'rejected', why: 'replace 未逐字命中既有行' } // replace 要求 match 逐字存在（防误改）
        lines[mi] = ln
      } else {
        let end = secIdx + 1
        while (end < lines.length && !lines[end].startsWith('## ')) end++
        lines.splice(end, 0, ln)
      }
      const tmp = file + '.tmp'
      writeFileSync(tmp, lines.join('\n'), 'utf8')
      renameSync(tmp, file)
      return { st: 'added' }
    } catch { return { st: 'failed' } }
  }

  /**
   * 索引行新增 → 同步登记 notes/INDEX.md「条目元数据表」（维护台账）。
   * 判因（2026-09-11 ACT-030）：元数据表是「一行一主题」的维护台账，但 newIndex 通道从不登记
   * ⇒ 体检「未登记元数据表主题」缺口随每次蒸馏持续增长（实测存量 36 条）。这里补齐**登记端**，
   * 使台账随索引自动同步（幂等：同主题已存在则跳过）。失败不阻断索引写入——体检仍以 ⚠️ 暴露缺口。
   */
  const registerIndexMeta = (root: string, targetFile: string, indexLine: string, sid: string): void => {
    try {
      if (!['MEMORY.md', 'USER.md', 'AGENT.md'].includes(targetFile)) return
      const idxFile = join(root, 'notes', 'INDEX.md')
      if (!existsSync(idxFile)) return
      // 主题口径与体检脚本一致：去标签 → 取 · 前 → 去 → 后 → 去 =/：复合前段
      const topic = String(indexLine).replace(/^\[[^\]]+\]\s*/, '').split('·')[0].split('→')[0].trim().split(/[=：]/)[0].trim()
      if (!topic) return
      const body = readFileSync(idxFile, 'utf8')
      const meta = body.split('## 条目元数据表')[1]
      if (!meta || meta.includes(topic)) return
      const row = `| ${topic} | ${new Date().toISOString().slice(0, 10)} | agent | active | 蒸馏 ${sidShort(sid)} 新增 |`
      const lines = body.split('\n')
      const note = lines.findIndex((l) => l.startsWith('> 维护规则：新增条目'))
      lines.splice(note > -1 ? note : lines.length, 0, row)
      const tmp = idxFile + '.tmp'
      writeFileSync(tmp, lines.join('\n'), 'utf8')
      renameSync(tmp, idxFile)
    } catch { /* 台账登记失败不阻断索引写入 */ }
  }

  const writeDispatch = async (sid: string, out: any, route: string, workspace: string | null): Promise<{ added: number; rejected: number; failed: number; targetLib: string }> => {
    let added = 0, rejected = 0, failed = 0
    if (route === 'memory') {
      const resolved = resolveTarget()
      if (!resolved.present) {
        for (const _a of ((out && Array.isArray(out.appends)) ? out.appends : [])) { rejected++; audit({ sid, kind: 'gate-reject', reason: '记忆库缺席（部署残缺）', lib: resolved.library }) }
        return { added, rejected, failed, targetLib: resolved.library }
      }
      const { wl, source } = loadWhitelist(resolved.root)
      const gate = (t?: string): boolean => {
        const r = gateMemoryAppend({ target: t }, wl)
        if (!r.ok) { rejected++; audit({ sid, kind: 'gate-reject', target: t, reason: r.reason, lib: resolved.library }); log(`distill 拒收: ${r.reason?.slice(0, 120)}`) }
        return r.ok
      }
      const appends = (out && Array.isArray(out.appends)) ? out.appends : []
      const newIndex = (out && Array.isArray(out.newIndex)) ? out.newIndex : []
      for (const a of appends) {
        if (!a || !a.target || !a.section || !gate(a.target)) { if (a && (!a.target || !a.section)) failed++; continue }
        // v5：教训条目附 rootCause/avoidWhen → 追加「- 根因：…」「- 不适用：…」两行（WikiSkill 借鉴：WHY + 适用边界）
        const _base = String(a.text || '').trim()
        const _rc = typeof a.rootCause === 'string' && a.rootCause.trim() ? `\n- 根因：${a.rootCause.trim()}` : ''
        const _aw = typeof a.avoidWhen === 'string' && a.avoidWhen.trim() ? `\n- 不适用：${a.avoidWhen.trim()}` : ''
        // 小节名归一化（2026-09-10 实锤：模型偶发输出带前导 § 的 section → memory-append 按字面找不到既有锚，
        // 整条落点失败 dispatch-failed）：去前导 §、把路径间游离 § 规整为 /（保留 父/子 路径语义）
        // 2026-09-10 再实锤：模型还可能输出 '## 小节名'（带 markdown 标记，如 741dc51b 落点失败）→ 一并归一化
        const _sec = String(a.section || '').trim().replace(/^[§#]+\s*/, '').replace(/(\/)?\s*[§#]+\s*/g, '$1')
        if (!_sec) { failed++; continue }
        const r = await memAppend(String(a.target), 'append', _base + _rc + _aw, _sec, resolved)
        if (r.status === 0) added++; else { failed++; log(`distill 落点失败 ${a.target}§${a.section}: ${textOf(r).slice(0, 120)}`) }
      }
      for (const ni of newIndex) {
        if (!ni || !ni.line) { failed++; continue }
        const t = String(ni.target || 'MEMORY.md')
        if (!gate(t)) continue
        const nl = String(ni.line).trim()
        // 指针唯一性硬门（2026-09-10 用户拍板 v6：同类同事实的指针只允许一个）——
        // ① 精确键=同文件 同[标签]+同主题 → 拒；② 语义近似=标签同 + 主题 bigram 重叠 ≥0.66（双方 ≥2 token）→ 拒并留原指针。
        const mNew = nl.match(/^\[([^\]\s]+)\]\s*([^·]+?)\s*·/)
        if (mNew) {
          const tagNew = mNew[1]
          const themeNew = mNew[2].trim()
          const tn = intentTokens(themeNew)
          let dup = 'none'
          const sameTagLines: string[] = []
          try {
            for (const ol of readFileSync(join(resolved.root, t), 'utf8').split(/\r?\n/)) {
              const m = ol.match(/^\[([^\]\s]+)\]\s*([^·]+?)\s*·/)
              if (!m || m[1] !== tagNew) continue
              const themeOld = m[2].trim()
              if (themeOld === themeNew) { dup = 'exact'; break }
              const to = intentTokens(themeOld)
              if (tn.length >= 2 && to.length >= 2) {
                const inter = tn.filter((x) => to.includes(x)).length
                const union = new Set([...tn, ...to]).size
                if (union > 0 && inter / union >= 0.66) { dup = 'approx'; break }
              }
              sameTagLines.push(ol.trim())
            }
          } catch { /* 目标文件不存在=无既有行 */ }
          // ③ 向量近似（v6 第二批 2026-09-10）：embed 可用时对同标签既有行整行语义比对（去指针段），
          //    高阈值 0.80 保守拒并——补词法漏网的「措辞迥异同事实」；未启用/失败自动跳过（精确+词法已兜底）
          if (dup === 'none' && sameTagLines.length && tn.length >= 1) {
            try {
              const ecfg = embedCfgOf()
              if (ecfg.enabled) {
                const headOf = (l: string): string => { const i = l.indexOf('→'); return (i >= 0 ? l.slice(0, i) : l).trim() }
                const qText = headOf(nl)
                for (const ol of sameTagLines) {
                  const s = await semanticSim(qText, headOf(ol), ecfg)
                  if (s !== null && s >= 0.8) { dup = 'sem'; break }
                }
              }
            } catch { /* 语义拒并失败=按既有词法结论 */ }
          }
          if (dup !== 'none') {
            rejected++
            audit({ sid, kind: 'gate-reject', target: t, reason: `dup-index-topic:${dup}` })
            log(`distill 拒收: 索引行重复（${dup} ${tagNew}/${themeNew.slice(0, 20)}），保留原指针（同类同事实唯一）`)
            continue
          }
        }
        const r = await memAppend(t, 'new', nl, '-', resolved)
        if (r.status === 0) { added++; registerIndexMeta(resolved.root, t, nl, sid) } else { failed++; log(`distill 新索引失败: ${textOf(r).slice(0, 120)}`) }
      }
      // 双画像：Q2「归谁」的 USER/AGENT 通道（宿主直写，格式/容量/去重门禁）
      const profiles = (out && Array.isArray(out.profiles)) ? out.profiles : []
      const date = new Date().toISOString().slice(0, 10)
      for (const p of profiles) {
        if (!p || !p.target || !p.section || !p.text) { failed++; continue }
        const w = writeProfileLine(resolved.root, String(p.target).trim(), String(p.section), `- ${String(p.text).trim()} ← 源: distill ${sidShort(sid)} ${date}`)
        if (w.st === 'added') added++
        else if (w.st === 'rejected') { rejected++; audit({ sid, kind: 'gate-reject', target: p.target, reason: `画像更新被拒（${w.why}）` }) }
        else if (w.st === 'failed') failed++
        // dedup：静默不计
      }
      audit({ sid, kind: 'distill-run', route, lib: resolved.library, wlSource: source, added, rejected, failed })
      return { added, rejected, failed, targetLib: resolved.library }
    }
    if (route === 'project') {
      // 单库化（2026-09-08 用户拍板）：pmg 项目卡库已随治理插件移除，项目专属事实**直写项目工作区**
      // <workspace>/docs/devref/shoucang/（workspace 由会话转录反解）。
      // 降级链（2026-09-09 实态审计补缺）：反解失败≠丢弃——cards 幂等降级落 pending/
      // （<date>-project-defer-<slug>.md，符合蒸馏候选命名规范 → 下一轮随 pending 重新裁决；
      // workspace 恢复后 route=project 直写 devref；确认泛化则 route=memory 入 notes）。
      // 红线不变：项目专属内容绝不落全局 notes/索引——降级是「暂存等认领」，不是「放水入全局库」。
      const cards = (out && Array.isArray(out.projectCards)) ? out.projectCards : []
      if (!workspace) {
        for (const pc of cards) {
          if (!pc || !pc.title || !pc.text) { failed++; continue }
          try {
            const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'card'
            const date = new Date().toISOString().slice(0, 10)
            const deferFile = join(pendDir, `${date}-project-defer-${slug}.md`)
            // 幂等：同题降级文件已存在 → 不重复堆积，只审计计数（防止每轮蒸馏重复降级同一批）
            if (existsSync(deferFile)) { rejected++; audit({ sid, kind: 'gate-reject', target: pc.title, reason: 'workspace 反解失败 → 降级 pending 已存在（去重），待认领' }); continue }
            mkdirSync(pendDir, { recursive: true })
            writeFileSync(deferFile, `# [project-defer] ${pc.title}\n\n- 卡类型：${pc.cardType || 'reference'}\n- 源会话：${sid}\n- 溯源：${pc.source || ''}\n- 状态：workspace 反解失败降级暂存，待蒸馏重裁决或人工认领\n\n${pc.text}\n`, 'utf8')
            rejected++ // 未入册（defer=暂存非入册）
            audit({ sid, kind: 'gate-reject', target: pc.title, reason: 'workspace 反解失败 → 降级 pending 待认领（不丢弃）' })
          } catch (e3) { failed++; log(`distill project-defer 落盘失败: ${String((e3 as Error).message).slice(0, 120)}`) }
        }
        return { added, rejected, failed, targetLib: 'pending-defer' }
      }
      const dir = join(workspace, 'docs', 'devref', 'shoucang')
      const cardTypes = ['how-to', 'reference', 'decision']
      const date = new Date().toISOString().slice(0, 10)
      // 2026-09-10：project 卡去重门（防多轮蒸馏同主题重复产卡）——读 devref 已有卡标题，
      // 同标签语义近似（主题 bigram 重叠 ≥0.66，双方 ≥2 token）→ 判重跳过并审计（与 MEMORY 指针唯一性同口径）。
      const existingCardTitles = ((): string[] => {
        try {
          return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
            try { const m = readFileSync(join(dir, f), 'utf8').match(/^#\s*\[项目事实\][^·]*·\s*(.+)$/m); return m ? m[1].trim() : '' } catch { return '' }
          }).filter(Boolean)
        } catch { return [] }
      })()
      const cardDupOf = (title: string): string | null => {
        if (cardTokens(title).length < 2) return null
        for (const ex of existingCardTitles) {
          if (ex === title) return ex
          if (cardSimilar(title, ex) >= 0.42) return ex
        }
        return null
      }
      for (const pc of cards) {
        if (!pc || !pc.title || !pc.text) { failed++; continue }
        const cardType = cardTypes.includes(String(pc.cardType || '')) ? String(pc.cardType) : 'reference'
        if (!cardTypes.includes(String(pc.cardType || ''))) { rejected++; audit({ sid, kind: 'gate-reject', target: pc.title, reason: `cardType=${pc.cardType} 不在 [${cardTypes.join(',')}]` }); continue }
        const dupOf = cardDupOf(String(pc.title))
        if (dupOf) { rejected++; audit({ sid, kind: 'gate-reject', target: pc.title, reason: `项目卡重复（语义近似既有卡「${dupOf}」）——跳过防重复产卡`, lib: 'workspace' }); log(`distill 项目卡判重跳过: ${String(pc.title).slice(0, 30)}（≈ ${dupOf.slice(0, 30)}）`); continue }
        try {
          const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'card'
          mkdirSync(dir, { recursive: true })
          const fb = join(dir, `${date}-${cardType}-${slug}.md`)
          writeFileSync(fb, `# [项目事实] ${cardType} · ${pc.title}\n\n- 卡类型：${cardType}\n- 溯源：${pc.source || ''}\n- 源会话：${sid}\n- 工作区：${workspace}\n\n${pc.text}\n`, 'utf8')
          added++
        } catch (e2) { failed++; log(`distill 项目事实直写失败: ${String((e2 as Error).message).slice(0, 120)}`) }
      }
      audit({ sid, kind: 'distill-run', route, lib: 'workspace', added, rejected, failed })
      return { added, rejected, failed, targetLib: 'workspace' }
    }
    return { added, rejected, failed, targetLib: 'none' }
  }

  // ── pending defer 卡直写（2026-09-10：project-defer 是「已裁决为项目卡」的降级暂存——workspace 恢复后
  //    应直接直写该工作区 devref，不再让 LLM 重裁决（重裁决会按本轮会话 route 一刀切导致项目卡被 skip 丢失）。
  //    flush 成功后移入 .processed（防重复）；workspace 仍不可解则留 pending 等下轮。──
  const flushDeferCards = async (): Promise<{ written: number; kept: number }> => {
    let written = 0, kept = 0
    let files: string[] = []
    try { files = readdirSync(pendDir).filter((f) => /^\d{4}-\d{2}-\d{2}-project-defer-.*\.md$/.test(f)) } catch { return { written, kept } }
    for (const f of files) {
      try {
        const raw = readFileSync(join(pendDir, f), 'utf8')
        const sidM = raw.match(/^-\s*源会话：\s*(session-\S+)/m)
        const titleM = raw.match(/^#\s*\[project-defer\]\s*(.+)$/m)
        const typeM = raw.match(/^-\s*卡类型：\s*(\S+)/m)
        if (!sidM || !titleM) { kept++; log(`defer 保留 ${f.slice(0, 40)}: 解析失败 sid=${!!sidM} title=${!!titleM}`); continue }
        const ws = await resolveWorkspace(sidM[1].trim())
        if (!ws) { kept++; log(`defer 保留 ${f.slice(0, 40)}: workspace 不可解（sid=${sidM[1].trim().slice(0, 18)}）`); continue } // workspace 仍不可解：留 pending
        const title = titleM[1].trim()
        const cardType = ['how-to', 'reference', 'decision'].includes(String(typeM ? typeM[1].trim() : '')) ? String(typeM![1].trim()) : 'reference'
        const bodyIdx = raw.indexOf('待蒸馏重裁决或人工认领')
        const body = bodyIdx >= 0 ? raw.slice(bodyIdx + '待蒸馏重裁决或人工认领'.length).trim() : ''
        const dir = join(ws, 'docs', 'devref', 'shoucang')
        mkdirSync(dir, { recursive: true })
        const date = new Date().toISOString().slice(0, 10)
        const slug = title.replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'card'
        const out = join(dir, `${date}-${cardType}-${slug}.md`)
        // 2026-09-10：语义判重（防同主题重复卡，与蒸馏直写同口径）——近似既有卡则只清 pending 不重复写
        const dupTitle = ((): string | null => {
          if (cardTokens(title).length < 2) return null
          try {
            for (const ef of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
              const m = readFileSync(join(dir, ef), 'utf8').match(/^#\s*\[项目事实\][^·]*·\s*(.+)$/m)
              if (!m) continue
              const ex = m[1].trim()
              if (ex === title) return ex
              if (cardSimilar(title, ex) >= 0.42) return ex
            }
          } catch { /* 读取失败=不判重 */ }
          return null
        })()
        if (!dupTitle && !existsSync(out)) writeFileSync(out, `# [项目事实] ${cardType} · ${title}\n\n- 卡类型：${cardType}\n- 溯源：（defer 回流 ${f}）\n- 源会话：${sidM[1].trim()}\n- 工作区：${ws}\n\n${body}\n`, 'utf8')
        const procDir = join(pendDir, '.processed')
        try { mkdirSync(procDir, { recursive: true }); renameSync(join(pendDir, f), join(procDir, f)) } catch { /* 移动失败：下轮重试 */ }
        written++
        audit({ kind: 'defer-flush', target: title, workspace: ws, cardType, file: f, sid: sidM[1].trim(), ...(dupTitle ? { dupOf: dupTitle } : {}) })
        log(`defer 回流: ${title.slice(0, 30)} → ${ws}/docs/devref/shoucang/${dupTitle ? `（判重跳过 ≈${dupTitle.slice(0, 24)}）` : ''}`)
      } catch (e) { kept++; log(`defer 回流失败 ${f.slice(0, 30)}: ${String((e as Error)?.message || e).slice(0, 100)}`) }
    }
    if (written || kept) log(`defer 回流汇总: 写入 ${written} / 保留 ${kept}`)
    return { written, kept }
  }

  // ── A1（2026-09-11 审查修复）：段落级落盘失败的有界重试 ──
  // 语义：stop/JSON 都 OK 但条目级写失败（白名单外目标、磁盘错误、原子写失败…）时**不再前移水位**；
  // 同一段连续失败满 MAX_DISPATCH_RETRY 次后强制推进 + 落审计 dispatch-failed-forced（丢失显式记账）。
  const MAX_DISPATCH_RETRY = 3
  const dispatchFailStreak = new Map<string, number>() // `${sid}#${endSeq}` → 连续失败次数（内存态，重启清零=最多再试 MAX 次）

  // ── A3（2026-09-11 审查修复）：跨实例 claim 锁**统一判定** ──
  // 背景：claim 原只在 sweepBacklog 一侧读判，idle 路径（armIdleTimer → distillAgent）完全不查 ⇒
  //   重叠 fiber 的 idle 定时器可与扫尾同时蒸同一会话（注释宣称的「跨实例防双蒸」不成立）。
  // 现语义：claim 的**写**只发生在蒸馏入口（幂等）；扫尾只做只读让位判定；本轮结束/早退即释放。
  const CLAIM_TTL_MS = 25 * 60000
  const claimDirOf = (): string => join(kRoot, 'audit', 'claims')
  const claimFileOf = (sid: string): string => join(claimDirOf(), sid + '.json')
  /** 在途 claim（TTL 内）→ false（让位）；否则写入并返回 true。异常一律 true（claim 失败不阻塞，与既有语义一致） */
  const tryClaim = (sid: string, lastSeq: number, maxSeq: number): boolean => {
    try {
      let at = 0
      try { at = Number((JSON.parse(readFileSync(claimFileOf(sid), 'utf8')) as { at?: number }).at || 0) } catch { /* 无 claim */ }
      if (at && Date.now() - at < CLAIM_TTL_MS) return false
      mkdirSync(claimDirOf(), { recursive: true })
      writeFileSync(claimFileOf(sid), JSON.stringify({ at: Date.now(), lastSeq, maxSeq }), 'utf8')
      return true
    } catch { return true }
  }
  const claimHeld = (sid: string): boolean => {
    try {
      const at = Number((JSON.parse(readFileSync(claimFileOf(sid), 'utf8')) as { at?: number }).at || 0)
      return !!at && Date.now() - at < CLAIM_TTL_MS
    } catch { return false }
  }
  const releaseClaim = (sid: string): void => { try { unlinkSync(claimFileOf(sid)) } catch { /* 无 claim/删除失败均无害 */ } }

  const bankGitScript = join(memoryLibRoot(), 'scripts', 'bank-git.mjs')
  /** v2（ADR-122）：库 git 版本化快照（写后触发；失败静默——版本化是增强不是主流程依赖） */
  const bankSnapshot = async (label: string): Promise<void> => {
    if (config.bankGit === false) return
    try {
      if (!existsSync(bankGitScript)) return
      await runNode(config.nodeBin, bankGitScript, ['--message', `memory: ${label} @ ${new Date().toISOString().slice(0, 19)}`], { env: { MEMORY_ROOT: memoryLibRoot() }, timeout: 20000 })
    } catch { /* 静默 */ }
  }

  const distillAgent = async (agent: any): Promise<void> => {
    const sid = agent.id as string
    if (distilling.has(sid)) return // 并发守卫（本 fiber 内）：蒸馏在途（最长 10min）内再触发直接跳过
    if (agent.status && agent.status !== 'idle') { log(`distill: ${sidShort(sid)} 已恢复活跃（status=${agent.status}），跳过`); return }
    // 子代理守卫（2026-09-10 实态修复）：主会话派子代理执行并等待返回时，主会话 turn/end 已完成、status=idle、
    // 但其子代理仍在 running——此时蒸馏只是把任务"做到一半"的内容切碎入册，且水位推进后不会重蒸。
    // 处理：本轮推迟（不推水位、不消费），重新武装 idle 定时器；子代理完成时父会话会收到 followup 事件再触发。
    if (hasActiveSubagents(sid)) {
      audit({ sid, kind: 'distill-skip', reason: 'active-subagent', fclass: 'busy-subagent' })
      ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'busy-subagent' }, result: { added: 0, rejected: 0, failed: 0 } })
      log(`distill: ${sidShort(sid)} 有活跃子代理在跑（等待返回），推迟蒸馏（水位保留）`)
      armIdleTimer(agent)
      return
    }
    distilling.add(sid)
    let claimed = false
    try {
      // A2（2026-09-11 审查修复）：入口先回流 project-defer 卡 —— 它们是「已裁决为项目卡」的降级暂存，
      // 只因 workspace 当初不可解才留在 pending；绝不能再喂 LLM 重裁决（会按本轮会话 route 一刀切 →
      // 落错工作区；随后还可能被候选 .processed 吞掉）。flush 内部按卡内「源会话」反解 workspace。
      try { await flushDeferCards() } catch { /* 回流失败不阻断本轮蒸馏 */ }
      validateProvider()
      // v19（2026-09-10）：水位不再是裸数字——经「格式代 + 锚点事件指纹」双证校验，迁移/序号重排即作废全量重蒸。
      // 快照只取一次（同一数组喂水位增量计算 + 分段器），避免全量 snapshotEvents 被重复物化。
      const wmEvents: any[] = agent.session.snapshotEvents()
      const baseline = resolveWatermark(sid, agent)
      const lastSeq = baseline ? baseline.lastSeq : 0
      // v18 分段蒸馏（2026-09-10）：整窗按 CHUNK_CHARS/事件边界切段后逐段蒸馏——每段成功即推水位到该段 endSeq
      // （断点续传），段间紧凑清单 manifest 续上下文防同轮重复入册；修复旧「整窗一次注入 24k 截断丢尾 / 失败整窗重蒸」。
      const { chunks, maxSeq } = buildEventChunks(agent, lastSeq, CHUNK_CHARS, wmEvents)
      // A3：统一 claim（idle 与扫尾同一判定）——在途即让位（本 fiber 结束/早退时释放）。
      if (!tryClaim(sid, lastSeq, maxSeq)) {
        audit({ sid, kind: 'distill-skip', reason: 'claim-held', fclass: 'claim-held' })
        ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'claim-held' }, result: { added: 0, rejected: 0, failed: 0 } })
        log(`distill: ${sidShort(sid)} claim 在途（其他实例接管中），本轮让位`)
        return
      }
      claimed = true
      const totalChars = chunks.reduce((n, c) => n + c.text.length, 0)
      let candFiles: string[] = []
      // A2：候选池排除 project-defer 卡（它们归 flushDeferCards 直写，不进 LLM 重裁决）
      try { candFiles = readdirSync(pendDir).filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(f) && !f.includes('-project-defer-')).sort() } catch { candFiles = [] }
      // 门槛（below-min 语义保持现状）：整窗文本总字符 < minTurnChars（chunks 空=无增量/全无文本事件）→ 跳过并推进水位
      if (!chunks.length || totalChars < (config.minTurnChars ?? 200)) {
        writeWatermark(sid, maxSeq, agent)
        // 跳过也留审计痕（观测盲区修复 2026-09-09：此前门槛/预筛跳过只进日志，审计里只见真实 run，
        // 「蒸馏为什么没跑」无法从数据区分——是没触发还是被挡）
        audit({ sid, kind: 'distill-skip', reason: 'below-min-chars', fclass: 'below-min', chars: totalChars })
        ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'below-min-chars', chars: totalChars }, result: { added: 0, rejected: 0, failed: 0 } })
        log(`distill: ${sidShort(sid)} 增量 ${totalChars} 字符 < 门槛，水位推进 ${lastSeq}→${maxSeq}（不蒸馏）`)
        return
      }
      if (config.distillPrescan !== false) {
        // 2026-09-10 用户拍板：大段增量强制蒸馏——信息密集但无信号词的会话（如研究/工具流）不再被预筛整段丢弃
        // v18 分段口径：信号词判定按首段文本（首段=窗口最早 ≤CHUNK_CHARS 前缀，窗口小于预算时即整窗）；
        // 大段强制阈值按整窗总字符（保留现状语义：增量 ≥prescanMin 强制蒸馏，与切段与否无关）
        const prescanMin = Number(config.prescanMinChars) > 0 ? Number(config.prescanMinChars) : 4000
        const bigDelta = totalChars >= prescanMin
        const hasSig = bigDelta || hasDistillSignals(chunks[0].text)
        if (!hasSig && candFiles.length === 0) {
          writeWatermark(sid, maxSeq, agent)
          audit({ sid, kind: 'distill-skip', reason: 'prescan-no-signal', fclass: 'prescan-no-signal', chars: totalChars })
          ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'prescan-no-signal', chars: totalChars }, result: { added: 0, rejected: 0, failed: 0 } })
          log(`distill: ${sidShort(sid)} 预筛跳过（增量 ${totalChars} 字符无信号词 & pending 无候选），水位推进 ${lastSeq}→${maxSeq}`)
          return
        }
        log(`distill: ${sidShort(sid)} 预筛通过（信号词=${hasSig}${bigDelta ? `，大段 ${totalChars}≥${prescanMin} 强制蒸馏` : ''}，pending 候选=${candFiles.length}），进入分段蒸馏`)
      }
      // 候选按文件粒度装填：预算内进 prompt，放不下的整文件留 pending 下轮（防截断外候选被整批归档丢失知识）
      const CAND_BUDGET = 12000
      const candIncluded: string[] = []
      let candBudget = CAND_BUDGET
      const candText = candFiles.map((f) => {
        let body = ''
        try { body = readFileSync(join(pendDir, f), 'utf8') } catch { return '' }
        const candBlock = `### 源 ${f}\n${body}`
        if (candBlock.length > candBudget) return '' // 本文件装不下：不进本轮，保留 pending
        candBudget -= candBlock.length + 1 // +1 join('\n') 分隔符
        candIncluded.push(f)
        return candBlock
      }).join('\n')

      // ═══ v18 分段主循环（2026-09-10）：每段一次性 spawn（与现状同参数），段间连续性由 manifest 紧凑清单承接；
      // 「可复用子代理 + 全上下文」列为后续可选档（规格已定，本轮不实现）。
      // 每段成功（stop=completed && out）→ 既有 route 判定 + writeDispatch + episode 留痕 + 立即 writeWatermark(该段 endSeq)；
      // 段失败 → 记录 log/审计并 break：水位停在失败段前（已成功段已推进）→ 下一触发从失败段断点续传，前段不重蒸。
      const resolvedLlm = resolveLlm(config.distillProvider, config.distillModel)
      const useProvider = !!resolvedLlm && providerFailCount < 2
      const agentOptions = useProvider ? { provider: resolvedLlm!.provider, model: resolvedLlm!.model } : undefined
      const segLimit = Math.min(chunks.length, MAX_CHUNKS_PER_RUN)
      const MANIFEST_CAP = 1500 // 同轮前段固化清单字符上限（超出丢最早行；只服务同轮后段查重/合并）
      let manifest = ''
      let wmNow = lastSeq
      let anyAdded = false
      for (let k = 0; k < segLimit; k++) {
        const chunk = chunks[k]
        let segOk = false
        let ac: AbortController | null = null
        let abortTimer: ReturnType<typeof setTimeout> | null = null
        let raceTimer: ReturnType<typeof setTimeout> | null = null
        try {
          // v6 向量政策：给裁决 agent 喂「相关既有记忆」上下文（recallRanked 融合召回，query=本段 text 前 512）——
          // Q0 已有归属 / Q3 能合并 判定从此有库内证据；未启用/失败自动省略
          let relMemLines = ''
          try {
            const rres = await recallRanked(memoryLibRoot(), chunk.text.slice(0, 512), 5, 'all', embedCfgOf())
            if (rres.rows.length) relMemLines = rres.rows.map((r) => `- ${r.line}`).join('\n')
          } catch { /* 相关记忆上下文失败=省略 */ }
          const userInput = [
            `## 待蒸馏会话\nsessionId=${sid}（分段蒸馏，本段 seq ${chunk.startSeq}→${chunk.endSeq}，共 ${chunks.length} 段第 ${k + 1} 段）`,
            `## 会话增量正文（本段）\n${chunk.text}`,
            manifest ? `## 同轮前段固化清单（防重复入册/可引用合并，勿重复入册）\n${manifest}` : '（同轮前段固化清单：无——本段为当前触发首段；后续段将携带本段裁决清单防重复入册）',
            relMemLines ? `## 相关既有记忆（recallRanked 召回，Q0 已有归属 / Q3 合并判据；命中即视为已覆盖候选）\n${relMemLines}` : '（相关既有记忆：未启用向量或零命中，按无历史裁决）',
            candIncluded.length ? `## 待固化候选（pending/ 中 ${candIncluded.length}/${candFiles.length} 个，预算 ${CAND_BUDGET} 字符内）\n${candText}` : (candFiles.length ? '（待固化候选超预算，本轮不携带；候选保留 pending 待下轮）' : '（无待固化候选）'),
            '请按规则处理：裁决本段可复用知识点并输出入册指令 JSON。',
          ].join('\n\n')

          ac = new AbortController()
          abortTimer = setTimeout(() => { try { ac?.abort(new Error('distill timeout 10min')) } catch { /* */ } }, 600000)
          const run2 = await ctx.subagents.start('spawn', {
            label: `distill-${sidShort(sid)}`,
            parent: agent,
            signal: ac.signal,
            maxDepth: 1,
            ...(agentOptions ? { agentOptions } : {}),
            prompt: [{ type: 'text', text: userInput }],
            persona: config.distillPrompt || DEFAULT_DISTILL_PROMPT,
            toolFilter: { allow: [] },
          })
          const result = await Promise.race([
            run2.result,
            new Promise((resolve) => { raceTimer = setTimeout(() => resolve({ stopReason: 'timeout' } as any), 600000) }),
          ]) as any
          if (abortTimer) { clearTimeout(abortTimer); abortTimer = null }
          if (raceTimer) { clearTimeout(raceTimer); raceTimer = null }
          const stop = result && result.stopReason
          const out = parseAgentJson(result, `distill ${sidShort(sid)}`) // 子代理输出 → JSON（剥离代码栅栏+容错提取，与深睡共用同一实现）
          if (stop === 'completed' && out) providerFailCount = 0
          else if (useProvider && (stop !== 'completed' || !out)) providerFailCount++
          const rawRoute = (out && typeof out.route === 'string') ? out.route.trim().toLowerCase() : ''
          const route = ['memory', 'project', 'discard'].includes(rawRoute) ? rawRoute : 'memory' // 归一化+未知回退 memory（宁滥勿丢）
          const workspace = await resolveWorkspace(sid)
          const disp = route === 'discard'
            ? { added: 0, rejected: 0, failed: 0, targetLib: 'none' }
            : await writeDispatch(sid, out, route, workspace)
          log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit}（seq ${chunk.startSeq}→${chunk.endSeq}）stop=${stop} route=${route} → ${disp.targetLib} 入册 ${disp.added} / 拒收 ${disp.rejected} / 失败 ${disp.failed}`)
          // WikiSkill 借鉴：失败归类 fclass（供审计聚合/深睡根因回流）+ LLM 指纹（大小模型蒸馏质量实证的数据底座）
          const llmLabel = useProvider && resolvedLlm ? `${resolvedLlm.provider}/${resolvedLlm.model}` : 'inherited'
          const fclass = !out ? 'json-parse'
            : stop !== 'completed' ? (useProvider ? 'provider-fail' : 'agent-stop')
            : route === 'discard' ? 'discard'
            : disp.failed > 0 ? 'dispatch-failed'
            : disp.rejected > 0 ? 'gate-reject'
            : 'ok'
          // v18：审计行与 raw-stub 均带分段标记（chunk/chunkStart/chunkEnd/totalChunks）；stub watermark=该段推进区间（同步用该段 endSeq）
          audit({ sid, kind: 'distill-run', route, stop, fclass, llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length })
          // 判据台账（摄取域）：模型判据（可选 judgement）+ 宿主 L0 代理评估 + 决策与结果
          ledger({
            domain: 'ingest', sid: sid.slice(0, 8), chunk: k + 1,
            judgement: (out && out.judgement) || null,
            l0After: evaluateL0({ text: String(chunk.text || '').slice(0, 400), traces: 1 }),
            decision: { route, fclass, handledByHost: true },
            result: { added: disp.added, rejected: disp.rejected, failed: disp.failed, targetLib: disp.targetLib },
            enqueued: { appends: (out?.appends || []).length, newIndex: (out?.newIndex || []).length, profiles: (out?.profiles || []).length, projectCards: (out?.projectCards || []).length, skipped: (out?.skipped || []).length },
          })
          if (disp.added > 0 || (out?.newIndex || []).length > 0) void bankSnapshot('distill') // v2：写后库快照（best-effort，不阻塞）
          recordStub({ sid, watermark: [wmNow, chunk.endSeq], chars: chunk.text.length, route, stop, fclass, llm: llmLabel, disp: { added: disp.added, rejected: disp.rejected, failed: disp.failed, targetLib: disp.targetLib }, outShape: out ? { appends: (out.appends || []).length, newIndex: (out.newIndex || []).length, profiles: (out.profiles || []).length, projectCards: (out.projectCards || []).length, skipped: (out.skipped || []).length } : null, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length })
          if (stop === 'completed' && out && disp.failed === 0) {
            if (disp.added > 0) anyAdded = true
            // 路线②：蒸馏裁决完成（stop=completed && out，无论入册多少）即留轻 episode——episode=「任务发生+结果」的
            // 同类判定/转正数据源（memory-core-model §3.1）；入册或裁决非 discard 时再建/更新低置信任务候选
            const intent = intentOf(chunk.text)
            recordEpisode({ sid, intent: intent.slice(0, 120), route, fclass, llm: llmLabel, outcome: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, lib: disp.targetLib })
            if (route !== 'discard') await ensureFlowCandidate(sid, intent)
            // v18 核心：段成功立即推水位到该段 endSeq（断点续传——失败/截断不再丢尾；整窗处理完自然到达 maxSeq）
            writeWatermark(sid, chunk.endSeq, agent)
            log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit} completed，水位推进 ${wmNow}→${chunk.endSeq}${chunk.endSeq < maxSeq ? `（整窗尚余 ${chunks.length - k - 1} 段，下轮续传）` : '（整窗蒸馏完成，水位=maxSeq）'}`)
            wmNow = chunk.endSeq
            // 段间紧凑清单续上下文：本段裁决一行（供同轮后段查重/合并，勿重复入册；超 MANIFEST_CAP 丢最早行）
            manifest = manifestPush(manifest, manifestLineFor(chunk.endSeq, route, out), MANIFEST_CAP)
            segOk = true
          } else if (stop === 'completed' && out && disp.failed > 0) {
            // A1（2026-09-11 审查修复）：stop/JSON 都 OK 但**条目级落盘失败** → 本段不算消化，水位不前移。
            // 防死循环：同一段连续失败满 MAX_DISPATCH_RETRY 次 → 强制推进并落审计（丢失显式记账）。
            const streakKey = `${sid}#${chunk.endSeq}`
            const tries = (dispatchFailStreak.get(streakKey) || 0) + 1
            if (tries >= MAX_DISPATCH_RETRY) {
              dispatchFailStreak.delete(streakKey)
              writeWatermark(sid, chunk.endSeq, agent)
              wmNow = chunk.endSeq
              manifest = manifestPush(manifest, manifestLineFor(chunk.endSeq, route, out), MANIFEST_CAP)
              segOk = true
              audit({ sid, kind: 'distill-run', route, stop, fclass: 'dispatch-failed-forced', llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length, tries })
              log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit} 落盘失败 ${disp.failed} 条、已连续 ${tries} 轮——强制推进水位 → ${chunk.endSeq}（丢失已审计 dispatch-failed-forced）`)
            } else {
              dispatchFailStreak.set(streakKey, tries)
              log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit} 落盘失败 ${disp.failed} 条（第 ${tries}/${MAX_DISPATCH_RETRY} 次）——水位保留 ${wmNow}，下轮从本段（seq ${chunk.startSeq}）续传`)
            }
          } else {
            // 水位保留：stop≠completed（error/timeout/aborted）或 stop=completed 但 out=null（JSON 解析失败，
            // 2026-09-09 实锤「Unexpected end of JSON input」）都不算消化——本段不推进，下轮从本段续传
            log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit} stop=${stop} out=${out ? 'ok' : 'null'}，本段失败——水位保留 ${wmNow}，下轮从本段（seq ${chunk.startSeq}）续传`)
          }
        } catch (e) {
          if (abortTimer) { clearTimeout(abortTimer); abortTimer = null }
          if (raceTimer) { clearTimeout(raceTimer); raceTimer = null }
          const msg = String((e as Error)?.message || e)
          if (msg.includes('inactive context')) {
            // 旧 fiber 遗留定时器在 ctx 失效后触发（重载场景）：静默跳过、水位保留，由新实例积压扫尾补蒸馏（2026-09-10 修复）
            log(`distill: ${sidShort(sid)} 段${k + 1} 旧 ctx 已失效（inactive context），跳过本轮（水位保留 ${wmNow}，待扫尾）`)
          } else {
            if (useProvider) providerFailCount++
            log(`distill ERROR ${sidShort(sid)} 段${k + 1}: ${msg.slice(0, 200)}`)
          }
        }
        if (!segOk) break // v18：段失败即停——已成功段已推水位，本段未推 → 下轮从本段断点续传（前段不重蒸）
      }
      // pending 候选 .processed 移动（现语义：有段 added>0 且本轮携带候选）——循环后统一一次，
      // 避免多段重复移同名（rename 幂等已有，统一处理更干净）
      if (anyAdded && candIncluded.length) {
        const procDir = join(pendDir, '.processed')
        try { mkdirSync(procDir, { recursive: true }); for (const f of candIncluded) { try { renameSync(join(pendDir, f), join(procDir, f)) } catch { /* */ } } } catch { /* */ }
      }
    } catch (e) {
      log(`distill agent err ${sidShort(sid)}: ${String((e as Error)?.message || e).slice(0, 120)}`)
    } finally { distilling.delete(sid); if (claimed) releaseClaim(sid) }
  }

  // 子代理输出 → JSON（剥离代码栅栏 + 容错提取首个 {...}；蒸馏/深度睡眠共用）
  const parseAgentJson = (result: any, label: string): any => {
    if (!result || !Array.isArray(result.output)) return null
    const joined = result.output.filter((b: any) => b && b.type === 'text').map((b: any) => b.text).join('').trim()
    const cleaned = joined.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    try { return JSON.parse(cleaned) } catch (e1) {
      const m = cleaned.match(/\{[\s\S]*\}/)
      if (m) { try { return JSON.parse(m[0]) } catch (e2) { log(`${label} JSON 解析失败: ${String((e2 as Error).message).slice(0, 80)}`) } }
      else log(`${label} JSON 解析失败: ${String((e1 as Error).message).slice(0, 80)}`)
      return null
    }
  }

  // ═══ 深度睡眠归纳 pass（v16：习得原则 → AGENT.md `[原则]` 行自动写入口；2026-09-08 拍板）═══
  // 触发口径：以「最后一次根会话 turn/end（completed）」为活动水位——无任何会话活动持续 ≥deepSleepIdleMs
  // （缺省 3h）且无活跃 agent → 自动执行一次（每轮停滞窗口至多一次，新活动重置水位）；审计轮仍可手工兜底。
  // 作用域=当天痕迹（本日 pending + 本日写入的 notes + 本日 access 命中，不做全库扫描）；产出经 write_gate 落盘。
  const DEEP_SLEEP_CHECK_MS = 600000 // 巡检间隔 10min（停滞阈值由 deepSleepIdleMs 独立控制）
  let lastActivityAt = Date.now() // 全局兜底水位（无在册会话时使用）
  let lastDeepSleepAt = 0
  let deepSleepRunning = false
  /** 会话状态表：sid → SessRec（随 disposed 出表，防内存泄漏） */
  const sessions = new Map<string, SessRec>()
  const probeScriptPath = join(memoryLibRoot(), 'scripts', 'locate-transcript-probe.mjs')

  /** 状态迁移入口：任意事件 → RUNNING；turn/end(completed) → ENDED（停滞计时起点） */
  const noteEvent = (sid: string, isTurnEnd: boolean): void => {
    const now = Date.now()
    lastActivityAt = now
    const rec = sessions.get(sid) || { sid, state: 'running' as SessState, lastEventAt: now, lastEndAt: 0, probeAt: 0, probeRound: 0, stallRound: 0 }
    rec.lastEventAt = now
    // 任何新事件都让会话「复活」：清掉探测/卡住计数（卡住的会话若恢复输出，不应继续按 stall 处理）
    rec.state = isTurnEnd ? 'ended' : 'running'
    if (isTurnEnd) rec.lastEndAt = now
    rec.probeAt = 0
    rec.probeRound = 0
    rec.stallRound = 0
    rec.probeResult = undefined
    sessions.set(sid, rec)
  }
  // 启动水位回放：取蒸馏审计最新时间（重启不重置停滞判定）；同时回放上次深度睡眠时间（痕迹窗口起点）
  try {
    for (const l of readFileSync(auditFile, 'utf8').split('\n')) {
      if (!l.trim()) continue
      try {
        const o = JSON.parse(l) as { at?: string; kind?: string }
        const t = Date.parse(String(o.at))
        if (Number.isNaN(t)) continue
        if (t > lastActivityAt) lastActivityAt = t
        // 只回放「确实消化过痕迹」的深睡：error / no-parent / no-traces 都不推进水位——
        // no-traces 说明本轮一条痕迹都没收到（可能只是窗口被上一轮污染），
        // 若把它当水位，会把窗口内早于该时刻的痕迹永久关在窗外（当天再也回想不到）。
        if (o.kind === 'deep-sleep' && !(o as { error?: string }).error
          && (o as { stop?: string }).stop !== 'error'
          && !['no-parent', 'no-traces'].includes(String((o as { result?: string }).result))
          && t > lastDeepSleepAt) lastDeepSleepAt = t
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 无审计文件=新装 */ }
  // 全新启动（审计里从无消化记录）：水位从启动时刻起算——首轮睡眠只看启动后的新痕迹，
  // 不把既有全历史 notes/pending 一股脑当材料（那是一次性的激进归纳）。
  if (!lastDeepSleepAt) lastDeepSleepAt = Date.now()

  /**
   * 痕迹窗口起点 = 上次深度睡眠水位（纯水位语义，2026-09-09 拍板重构）——
   * ① 统一用 mtime/时间戳比较，规避 pending 文件名日期为 UTC（`toISOString` 切片）与本地日期跨日不一致导致的漏收；
   * ② 同一天多次触发时不重复喂同一批材料（已归纳的不再回想）；
   * ③ **不再叠加「本日 0 点」下限**：0 点切会把午夜前产生、午夜后才睡眠的痕迹永久划出窗口（日切丢痕迹）；
   *    纯水位下「无痕迹滑窗」与「消化后推进」都只会把起点移到更晚，未来产生的痕迹 mtime 必然更晚，永不丢失。
   */
  const traceSince = (): number => Number(lastDeepSleepAt) || 0

  // 当天痕迹收集（深度睡眠作用域=本日）
  // since 由调用方显式传入：**必须在推进 lastDeepSleepAt 之前取值**（否则窗口起点=当前时刻 → 恒零痕迹，
  // 见 deepSleepCheck 的调用处注释；此坑曾让深度睡眠自上线起从未真正归纳过任何材料）。
  const gatherDeepSleepTraces = (memRoot: string, since: number): string => {
    const parts: string[] = []
    // 窗口内文件枚举（pending 按 mtime 判定，不解析文件名日期——文件名是 UTC 口径，本地日切会跨日错配）
    const pendFiles = ((): string[] => {
      try {
        return readdirSync(pendDir).filter((f) => f.endsWith('.md')).filter((f) => {
          try { return statSync(join(pendDir, f)).mtimeMs >= since } catch { return false }
        }).sort()
      } catch { return [] }
    })()
    const notesDir = join(memRoot, 'notes')
    const noteFiles = ((): string[] => {
      try {
        return readdirSync(notesDir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md').filter((f) => {
          try { return statSync(join(notesDir, f)).mtimeMs >= since } catch { return false }
        }).sort()
      } catch { return [] }
    })()
    // 0) 痕迹清单先给全——跨工作区公平：正文按预算截断时，子代理至少知道窗口内有哪些痕迹存在（不被静默吞掉）
    if (pendFiles.length || noteFiles.length) {
      parts.push('### 窗口内痕迹清单（记忆库为全局单库，痕迹可能来自多个工作区；正文按单文件上限截断）\n'
        + [...pendFiles.map((f) => `pending/${f}`), ...noteFiles.map((f) => `notes/${f}`)].map((p) => `- ${p}`).join('\n'))
    }
    // 1) pending 正文（背景材料，不作源指针）：单文件上限 PEND_PER_FILE，防单个工作区大文件吃光预算
    const PEND_PER_FILE = 2500
    let budget = 12000
    for (const f of pendFiles) {
      if (budget <= 0) break
      let body = ''
      try { body = readFileSync(join(pendDir, f), 'utf8') } catch { continue }
      const cut = body.length > PEND_PER_FILE ? body.slice(0, PEND_PER_FILE) + '\n…(截断)' : body
      const chunk = `### pending/${f}\n${cut}`
      if (chunk.length > budget) break
      budget -= chunk.length + 1
      parts.push(chunk)
    }
    // 2) notes 正文（原则源指针唯一合法来源）：单文件上限 NOTES_PER_FILE，保证多工作区痕迹都能进上下文
    const NOTES_PER_FILE = 6000
    let notesBudget = 18000
    for (const f of noteFiles) {
      if (notesBudget <= 0) break
      let body = ''
      try { body = readFileSync(join(notesDir, f), 'utf8') } catch { continue }
      const cut = body.length > NOTES_PER_FILE ? body.slice(0, NOTES_PER_FILE) + '\n…(截断)' : body
      const chunk = `### notes/${f}\n${cut}`
      if (chunk.length > notesBudget) break
      notesBudget -= chunk.length + 1
      parts.push(chunk)
    }
    // 3) 本日 access.log 检索命中（回想强度信号）
    try {
      const hits = readFileSync(join(memRoot, 'audit', 'access.log'), 'utf8').split('\n').filter((l) => l.trim())
        .map((l) => { try { return JSON.parse(l) as { t?: string; f?: string; s?: string } } catch { return null } })
        .filter((o): o is { t?: string; f?: string; s?: string } => !!o && !Number.isNaN(Date.parse(String(o.t))) && Date.parse(String(o.t)) >= since)
      if (hits.length) {
        const agg = new Map<string, number>()
        for (const h of hits) { const k = `notes/${h.f || '?'} §${h.s || '?'}`; agg.set(k, (agg.get(k) || 0) + 1) }
        parts.push('### 本日 access 检索命中\n' + [...agg.entries()].map(([k, v]) => `- ${k} ×${v}`).join('\n'))
      }
    } catch { /* 无 access.log=无 */ }
    // 4) 窗口内蒸馏运行统计（成败对比材料；ExpeL 式信号；2026-09-09 v17）
    //    只取「带 stop 字段」的 distill-run 行：writeDispatch 与 distillAgent 会双写审计（前两者无 stop），
    //    直接过滤 kind 会把每次 run 计 2 次——此处以 stop 存在为唯一 run 记号（distillAgent 汇总行）。
    //    红线：只给统计与 stop/route 字段，不携带 target 文件名与 reason 全文（可能含项目专名，跨工作区红线）。
    try {
      let runs = 0, ok = 0, bad = 0, mem = 0, proj = 0, rej = 0
      for (const l of readFileSync(auditFile, 'utf8').split('\n')) {
        if (!l.trim()) continue
        try {
          const o = JSON.parse(l) as { at?: string; kind?: string; stop?: string; route?: string; rejected?: number }
          if (o.kind !== 'distill-run' || typeof o.stop !== 'string') continue
          if (!Number.isNaN(Date.parse(String(o.at))) && Date.parse(String(o.at)) < since) continue
          runs++
          if (o.stop === 'completed') ok++; else bad++
          if (o.route === 'memory') mem++; else if (o.route === 'project') proj++
          rej += Number(o.rejected) || 0
        } catch { /* 坏行跳过 */ }
      }
      if (runs > 0) {
        const stat = `### 窗口内任务运行统计（成败对比材料；ExpeL 式信号）\n- 蒸馏运行 ${runs} 次：成功（stop=completed）${ok} / 异常（error/timeout/aborted）${bad}；写入分布 memory ${mem} 条 / project ${proj} 条 / 拒收 ${rej} 条`
        parts.push(stat.length > 800 ? stat.slice(0, 800) : stat)
      }
    } catch { /* 无审计文件=无统计 */ }
    // 5) 跨窗口任务候选（路线②）：flow-candidates/ 恒随材料（不限水位）——低置信「成功做过且成类型的任务」记忆，
    //    让深睡能跨天看到「同类型重复」（[路径] 判据的数据基础）；仅背景材料，非源指针。
    //    S4（2026-09-09）：候选带「成功次数/跨会话」字段——满足 成功≥2 且跨会话≥2 的转正候选排序置顶，
    //    深睡可据此直接归纳 [路径]（memory-core-model §4 转正门槛：成功≥2 且跨会话≥2）。
    try {
      const candFiles = existsSync(candidateDir) ? readdirSync(candidateDir).filter((f) => f.endsWith('.md')) : []
      if (candFiles.length) {
        const scoreCand = (f: string): { n: number; cross: number } => {
          try {
            const body = readFileSync(join(candidateDir, f), 'utf8')
            const n = Number((body.match(/- 成功次数：(\d+)/) || [])[1] || 0)
            const cross = Number((body.match(/- 跨会话：(\d+)/) || [])[1] || 0)
            return { n, cross }
          } catch { return { n: 0, cross: 0 } }
        }
        // 转正候选（成功≥2 且跨会话≥2）置顶；其余按时间序；最多取 8 个
        const sorted = candFiles
          .map((f) => ({ f, ...scoreCand(f) }))
          .sort((a, b) => ((b.n >= 2 && b.cross >= 2 ? 1 : 0) - (a.n >= 2 && a.cross >= 2 ? 1 : 0)) || (a.f < b.f ? -1 : 1))
          .slice(0, 8)
        const blocks: string[] = ['### 跨窗口任务候选（背景材料，非源指针；含成功次数/跨会话）']
        let cbudget = 2400
        for (const { f } of sorted) {
          if (cbudget <= 0) break
          try {
            const body = readFileSync(join(candidateDir, f), 'utf8').slice(0, 600)
            const chunk = `### candidate/${f}\n${body}`
            if (chunk.length > cbudget) break
            cbudget -= chunk.length + 1
            blocks.push(chunk)
          } catch { /* 跳过坏候选 */ }
        }
        if (blocks.length > 1) parts.push(blocks.join('\n'))
      }
    } catch { /* 无候选区=无 */ }
    return parts.join('\n\n')
  }

  // 习得原则/任务路径落盘（v17：[原则]/[路径] 并入 AGENT.md）：宿主拼装新全文 → write_gate 校验（容量/指针/行格式）→ 原子替换（冲突=原地 replace）
  const applyPrinciples = async (memRoot: string, out: any): Promise<{ added: number; replaced: number; skipped: number; gate: string }> => {
    const principlesPath = join(memRoot, 'AGENT.md')
    const gateScript = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs')
    if (!existsSync(gateScript)) return { added: 0, replaced: 0, skipped: 0, gate: 'write_gate 未就位' }
    let content = ''
    try { content = readFileSync(principlesPath, 'utf8') } catch {
      content = PROFILE_HEADER['AGENT.md'] + '\n'
    }
    const lines = content.split(/\r?\n/)
    let added = 0, replaced = 0, skipped = 0
    for (const p of ((out && Array.isArray(out.principles)) ? out.principles : [])) {
      const text = String((p && p.text) || '').trim()
      if (!/^\[(原则|路径)\].+→\s*notes\/[A-Za-z0-9_-]+\.md/.test(text)) { skipped++; continue } // 行格式宿主预检（v17：[路径] 同行门禁；gate 亦校验 [tag] 索引行）
      if (p && p.action === 'replace') {
        const match = String(p.match || '').trim()
        const idx = lines.findIndex((l) => l.trim() === match)
        if (idx < 0) { skipped++; continue }
        lines[idx] = text
        replaced++
      } else {
        if (lines.some((l) => l.trim().toLowerCase() === text.toLowerCase())) { skipped++; continue } // 去重
        lines.push(text)
        added++
      }
    }
    if (!added && !replaced) return { added, replaced, skipped, gate: 'no-op' }
    const tmpPath = principlesPath + '.tmp'
    try {
      writeFileSync(tmpPath, lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n'), 'utf8')
      const g = await runNode(config.nodeBin, gateScript, ['AGENT.md', tmpPath], { env: { MEMORY_ROOT: memRoot, ...capEnv() }, timeout: 20000 })
      if (g.status === 0) { renameSync(tmpPath, principlesPath); return { added, replaced, skipped, gate: 'pass' } }
      try { unlinkSync(tmpPath) } catch { /* */ }
      const reason = g.status === 1 ? '超限=原则间合并（本轮跳过）' : g.status === 2 ? '指针悬空/未注册' : g.status === 4 ? '行格式违规' : `gate exit=${g.status}`
      log(`deep sleep: write_gate 拒收（${reason}）: ${textOf(g).slice(0, 120)}`)
      return { added, replaced, skipped, gate: reason }
    } catch (e) {
      try { unlinkSync(tmpPath) } catch { /* */ }
      return { added, replaced, skipped, gate: '落盘异常: ' + String((e as Error).message).slice(0, 80) }
    }
  }

  // 指针扩容/重构（v6 用户拍板：索引指针自动维护通道=深睡 pointerOps）——
  // 只允许 action=update（原地替换整行），禁止新增/删除行（新增=蒸馏 newIndex 且过唯一性硬门；删除=审计裁决）。
  // match 须逐字命中既有行；同文 no-op；最终整文件走 memory_write_gate 全校验（容量/指针小节/行格式）后原子 rename。
  const applyPointerOps = async (memRoot: string, out: any): Promise<{ updated: number; skipped: number; gate: string }> => {
    const gateScript = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs')
    if (!existsSync(gateScript)) return { updated: 0, skipped: 0, gate: 'write_gate 未就位' }
    const ops = (out && Array.isArray(out.pointerOps)) ? out.pointerOps : []
    let updated = 0, skipped = 0
    const byTarget = new Map<string, { match: string; line: string }[]>()
    for (const op of ops) {
      if (!op || !['MEMORY.md', 'USER.md', 'AGENT.md'].includes(String(op.target)) || String(op.action) !== 'update') { skipped++; continue }
      const line = String(op.line || '').trim()
      const match = String(op.match || '').trim()
      if (!match || !/^\[[^\]\s]+\]/.test(line) || !/→\s*notes\//.test(line)) { skipped++; continue } // 行格式宿主预检（写门仍会校验）
      if (!byTarget.has(String(op.target))) byTarget.set(String(op.target), [])
      byTarget.get(String(op.target))!.push({ match, line })
    }
    if (!byTarget.size) return { updated, skipped, gate: 'no-op' }
    let gate = 'ok'
    for (const [target, list] of byTarget) {
      const p = join(memRoot, target)
      let content = ''
      try { content = readFileSync(p, 'utf8') } catch { skipped += list.length; continue }
      const lines = content.split(/\r?\n/)
      let changed = false
      for (const op of list) {
        const idx = lines.findIndex((l) => l.trim() === op.match)
        if (idx < 0) { skipped++; continue }
        if (lines[idx].trim().toLowerCase() === op.line.toLowerCase()) continue // 同文 no-op
        lines[idx] = op.line
        changed = true
        updated++
      }
      if (!changed) continue
      const tmpPath = p + '.tmp'
      try {
        writeFileSync(tmpPath, lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n'), 'utf8')
        const g = await runNode(config.nodeBin, gateScript, [target, tmpPath], { env: { MEMORY_ROOT: memRoot, ...capEnv() }, timeout: 20000 })
        if (g.status === 0) { renameSync(tmpPath, p) } else {
          try { unlinkSync(tmpPath) } catch { /* */ }
          gate = `gate exit=${g.status}`
          log(`deep sleep: pointerOps write_gate 拒收（${target}）: ${textOf(g).slice(0, 120)}`)
        }
      } catch (e) { try { unlinkSync(tmpPath) } catch { /* */ }; gate = '落盘异常' }
    }
    return { updated, skipped, gate }
  }

  /**
   * consolidation v1（2026-09-10 用户拍板：向量去重整合通道，并入深度睡眠巡检）——
   * 树状记忆/画像（索引行冠层 → notes ##/###/#### 子树）只增不修的补偿机制：周期性去重整合。
   *
   * 子步骤（顺序执行，只改确有变化的文件；每文件写入一律「tmp 写后 rename 原子覆盖」，与本文件
   * applyPrinciples/applyPointerOps 落盘纪律一致）：
   *   A 索引行精确重复折叠（MEMORY.md/USER.md/AGENT.md）：同文件内 trim 后完全相同的指针行保留首次。
   *   B 索引行语义近重折叠（同一批文件）：组键=同文件+同 [标签]+同指针目标（同 notes 文件且 §小节名
   *     双向包含）；组内行两两 semanticSim 比较「去掉指针尾（→ 起）后的前段文本」，sim≥0.90 视为同事实
   *     → 保留概况（字符）较长者、删除较短者（保留/删除皆归档）。
   *   C 同小节正文行去重（notes/*.md 除 INDEX.md）：小节=某标题到下一「同层或更高层」标题之间、且不含
   *     子标题区；小节内 trim 完全相同的非空正文行保留首次，其余删除（删除前该小节整段原文归档一次）。
   *   D 叶子小节语义合并（notes/*.md 除 INDEX.md）：候选=同文件内两两「无子标题的叶子小节」，比较
   *     标题+正文 semanticSim≥0.95（正文逐行全同视为 1.0 直并；sim 为 null 时跳过语义但允许正文全同直并）。
   *
   * 树感知规则（用户「合并/调整树干时树枝必须有明确去向」）：
   *   - phase-1 限制：D 只并**叶子小节**（其下无更深子标题）——带子树的树干（如被并小节含 ###/#### 子树）
   *     本版明确不合并，避免树枝悬空/孤儿子树；带子树树干合并留给后续阶段（与 LLM 跨主题大合并同批）。
   *   - 被并小节删除后，其全文先归档（可回滚），且同文件索引行（MEMORY/USER/AGENT）中指向它的
   *     「§另一小节名」指针段**整段改写**为 canonical 小节去日期核心名 → 不留悬空指针。
   *   - 守卫：另一小节标题核心名与 canonical 核心名双向包含（同族/同名演化小节）→ 保守跳过；正文为空
   *     或「正文等长且内容不同」→ 无法唯一确定 canonical → 跳过。
   *   - 阈值 0.90（索引概况前段）/ 0.95（小节全文）为保守高置信，宁少勿错；校准预留：样本累积后按
   *     误并/漏并分布再下调或分档（本 v1 不做跨主题大合并）。
   * embed 不可用（embedCfgOf().enabled=false / semanticSim 返回 null / HTTP 失败）→ 整函数自动退化为
   * 「只做确定性去重」（A/C 恒做；D 仅正文全同直并；B 无语义折叠），不报错、不中断深睡主流程。
   * 全程防御式：内部 try/catch，单文件出错跳过继续，绝不抛出。
   */
  const consolidateTree = async (memRoot: string): Promise<{ idxExact: number; idxSem: number; secMerged: number; lineDedup: number; archived: number }> => {
    const pad2 = (n: number): string => String(n).padStart(2, '0')
    const n0 = new Date()
    const archStamp = `${n0.getFullYear()}${pad2(n0.getMonth() + 1)}${pad2(n0.getDate())}-${pad2(n0.getHours())}${pad2(n0.getMinutes())}${pad2(n0.getSeconds())}`
    let archFile = ''
    let archived = 0
    // 归档：每轮 <memRoot>/audit/consolidate/consolidate-<YYYYMMDD-HHmmss>.jsonl 逐条 append（可回滚证据）
    const archive = (o: Record<string, unknown>): void => {
      try {
        if (!archFile) {
          const dir = join(memRoot, 'audit', 'consolidate')
          mkdirSync(dir, { recursive: true })
          archFile = join(dir, `consolidate-${archStamp}.jsonl`)
        }
        appendFileSync(archFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8')
        archived++
      } catch { /* 归档失败静默：绝不影响 consolidation 主流程 */ }
    }
    // 原子整文件重写（tmp + rename，与本文件既有落盘纪律一致）
    const atomicWrite = (p: string, text: string): boolean => {
      try {
        const tmp = p + '.tmp'
        writeFileSync(tmp, text, 'utf8')
        renameSync(tmp, p)
        return true
      } catch {
        try { unlinkSync(p + '.tmp') } catch { /* */ }
        return false
      }
    }
    // 既有行整理口径：空行压缩 + 末尾单换行（与 applyPrinciples/applyPointerOps 一致）
    const finalize = (ls: string[]): string => ls.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n')
    // 索引指针行：`[标签] …` 起始（标签内无空白，与全文件既有口径一致）
    const idxRowRe = /^\[[^\]\s]+\]/
    // 小节标题核心名：去掉行尾「（20xx-…）」日期括号后缀（memory_write_gate.mjs 禁日期戳同口径）
    const coreName = (t: string): string => String(t || '').trim().replace(/\s*[（(]\s*20\d{2}[-/]\d{1,2}[-/]\d{1,2}[^）)]*[）)]\s*$/, '').trim()
    // 双向包含：title===kw || title.includes(kw) || kw.includes(title)（与 memory_write_gate.mjs 同口径，按核心名比较）
    const biContains = (a: string, b: string): boolean => {
      const x = coreName(a); const y = coreName(b)
      return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
    }
    // 行文本 → 指针引用清单（`→ notes/<file>.md §kw/§kw…`；支持一行多文件/多小节）
    type SecRef = { file: string; kw: string }
    const refsOf = (line: string): SecRef[] => {
      const out: SecRef[] = []
      const re = /→\s*(notes\/[A-Za-z0-9_-]+\.md)\s*([^→]*?)(?=→|$)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(line))) {
        const file = m[1].trim()
        for (const part of String(m[2] || '').split('/')) {
          const kw = part.replace(/^§+/, '').trim()
          if (kw) out.push({ file, kw })
        }
      }
      return out
    }
    const ecfg = embedCfgOf()
    let embedBudget = 300 // 单轮语义比较预算（本地 bge 也应控量；用尽后只做确定性去重）
    let idxExact = 0, idxSem = 0, secMerged = 0, lineDedup = 0
    const IDX_FILES = ['MEMORY.md', 'USER.md', 'AGENT.md']
    try {
      // ═══ A 索引行精确重复折叠（确定性，恒做）═══
      for (const f of IDX_FILES) {
        try {
          const p = join(memRoot, f)
          let content = ''
          try { content = readFileSync(p, 'utf8') } catch { continue } // 缺失/不可读 → 跳过该文件
          const lines = content.split(/\r?\n/)
          const seen = new Set<string>()
          const kept: string[] = []
          const droppedRaw: string[] = []
          for (const ln of lines) {
            const t = ln.trim()
            if (t && idxRowRe.test(t)) {
              if (seen.has(t)) { droppedRaw.push(ln); continue } // trim 完全相同：删后续，保留首次
              seen.add(t)
            }
            kept.push(ln)
          }
          if (!droppedRaw.length) continue // 无变化不落盘
          for (const d of droppedRaw) archive({ action: 'idx-exact-drop', file: f, original: d })
          if (atomicWrite(p, finalize(kept))) idxExact += droppedRaw.length
        } catch { /* A 单文件异常：跳过继续 */ }
      }
      // ═══ B 索引行语义近重折叠（同文件+同标签+同指针目标组内 pairwise sim≥0.90 → 留长删短）═══
      for (const f of IDX_FILES) {
        try {
          const p = join(memRoot, f)
          let content = ''
          try { content = readFileSync(p, 'utf8') } catch { continue }
          const lines = content.split(/\r?\n/)
          type PRow = { idx: number; raw: string; tag: string; front: string; refs: SecRef[] }
          const rows: PRow[] = []
          lines.forEach((ln, idx) => {
            const t = ln.trim()
            if (!t || !idxRowRe.test(t) || !/→\s*notes\//.test(t)) return
            const tag = String((t.match(/^\[([^\]\s]+)\]/) || [])[1] || '')
            const at = t.indexOf('→')
            rows.push({ idx, raw: ln, tag, front: (at >= 0 ? t.slice(0, at) : t).trim(), refs: refsOf(t) })
          })
          if (rows.length < 2) continue
          const shareTarget = (ra: SecRef[], rb: SecRef[]): boolean => {
            for (const a of ra) for (const b of rb) if (a.file === b.file && biContains(a.kw, b.kw)) return true
            return false
          }
          // 指针组（union-find）：同文件 + 同标签 + 共享指针目标（§小节名双向包含）→ 一组
          const parent = rows.map((_, i) => i)
          const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
          for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
              if (rows[i].tag === rows[j].tag && shareTarget(rows[i].refs, rows[j].refs)) parent[find(i)] = find(j)
            }
          }
          const groups = new Map<number, number[]>()
          rows.forEach((_, i) => { const r = find(i); const g = groups.get(r) || []; g.push(i); groups.set(r, g) })
          const dropSet = new Set<number>()
          // 语义组（仅 ecfg.enabled 且预算内）：组内两两前段 semanticSim≥0.90 → 同事实（union-find）
          if (ecfg.enabled && embedBudget > 0) {
            for (const g of groups.values()) {
              if (g.length < 2 || embedBudget <= 0) continue
              const sp = g.map((_, k) => k)
              const sfind = (x: number): number => { while (sp[x] !== x) { sp[x] = sp[sp[x]]; x = sp[x] } return x }
              for (let i = 0; i < g.length && embedBudget > 0; i++) {
                for (let j = i + 1; j < g.length && embedBudget > 0; j++) {
                  embedBudget--
                  let s: number | null = null
                  try { s = await semanticSim(rows[g[i]].front, rows[g[j]].front, ecfg) } catch { s = null } // sim 失败=跳过该对
                  if (s !== null && s >= 0.9) sp[sfind(i)] = sfind(j)
                }
              }
              const comps = new Map<number, number[]>()
              g.forEach((_, k) => { const r = sfind(k); const c = comps.get(r) || []; c.push(k); comps.set(r, c) })
              for (const c of comps.values()) {
                if (c.length < 2) continue
                // 保留概况（前段字符）较多者；等长取文件序更早（唯一确定，防抖动）
                let keep = c[0]
                for (const k of c) {
                  const a = rows[g[keep]]; const b = rows[g[k]]
                  if (b.front.length > a.front.length || (b.front.length === a.front.length && b.idx < a.idx)) keep = k
                }
                const keptRow = rows[g[keep]]
                for (const k of c) {
                  const r = rows[g[k]]
                  if (k === keep) archive({ action: 'idx-sem-keep', file: f, original: r.raw })
                  else { archive({ action: 'idx-sem-drop', file: f, original: r.raw, into: keptRow.raw }); dropSet.add(r.idx) }
                }
              }
            }
          }
          if (!dropSet.size) continue // 无变化不落盘
          const out: string[] = []
          lines.forEach((ln, idx) => { if (!dropSet.has(idx)) out.push(ln) })
          if (atomicWrite(p, finalize(out))) idxSem += dropSet.size
        } catch { /* B 单文件异常：跳过继续 */ }
      }
      // ═══ 小节解析（notes/*.md 除 INDEX.md；##/###/#### 层级）═══
      // 小节边界=某标题行到「下一个同层或更高层标题」之间；正文=此区间内排除子标题整段（子树）的行。
      // leaf=区间内无更深标题 → 叶子小节（无子树，可安全整节合并而不悬空树枝）。
      type Section = { idx: number; level: number; title: string; end: number; leaf: boolean; body: string[]; bodyIdx: number[]; raw: string[] }
      const parseSections = (ls: string[]): Section[] => {
        const heads: Array<{ i: number; level: number; title: string }> = []
        for (let i = 0; i < ls.length; i++) {
          const m = /^(#{2,})[ \t]+(.*)$/.exec(ls[i])
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
              // 遇到更深子标题：整段跳过（属子树区，不是本小节正文）→ 本小节非叶子
              leaf = false
              let q = p + 1
              while (q < ls.length) { const l2 = levelAt.get(q); if (l2 !== undefined && l2 <= lv) break; q++ }
              p = q
              continue
            }
            body.push(ls[p]); bodyIdx.push(p); p++
          }
          out.push({ idx: h.i, level: h.level, title: h.title, end, leaf, body, bodyIdx, raw: ls.slice(h.i, end) })
        }
        return out
      }
      let noteFiles: string[] = []
      try { noteFiles = readdirSync(join(memRoot, 'notes')).filter((x) => /\.md$/i.test(x) && x.toLowerCase() !== 'index.md') } catch { noteFiles = [] }
      // ═══ C 同小节内精确重复正文行去重（确定性，恒做）═══
      for (const nf of noteFiles) {
        try {
          const p = join(memRoot, 'notes', nf)
          let content = ''
          try { content = readFileSync(p, 'utf8') } catch { continue }
          const lines = content.split(/\r?\n/)
          const dropIdx = new Set<number>()
          const archivedSec = new Set<number>() // 每小节整段原文只归档一次（避免重复归档）
          let fileDedup = 0
          for (const s of parseSections(lines)) {
            const seenL = new Set<string>()
            const dups: string[] = []
            for (let k = 0; k < s.bodyIdx.length; k++) {
              const t = s.body[k].trim()
              if (!t) continue
              if (seenL.has(t)) { dups.push(s.body[k]); dropIdx.add(s.bodyIdx[k]) }
              else seenL.add(t)
            }
            if (!dups.length) continue
            if (!archivedSec.has(s.idx)) {
              archivedSec.add(s.idx)
              archive({ action: 'line-dedup-section', file: `notes/${nf}`, heading: s.title, sectionOriginal: s.raw.join('\n'), dropped: dups })
            }
            fileDedup += dups.length
          }
          if (fileDedup > 0) {
            const kept = lines.filter((_, i) => !dropIdx.has(i))
            if (atomicWrite(p, finalize(kept))) lineDedup += fileDedup
          }
        } catch { /* C 单文件异常：跳过继续 */ }
      }
      // ═══ D 叶子小节语义合并（树感知：只并叶子、指针整段改写、归档可回滚）═══
      const mergesByFile = new Map<string, Array<{ old: string; next: string }>>()
      for (const nf of noteFiles) {
        try {
          const p = join(memRoot, 'notes', nf)
          let content = ''
          try { content = readFileSync(p, 'utf8') } catch { continue }
          let lines = content.split(/\r?\n/)
          let merges = 0
          let changed = false
          const chain: Array<{ old: string; next: string }> = []
          for (let guard = 0; guard < 8; guard++) { // 每并一次结构变化 → 重解析再找；上限防病态循环
            const secs = parseSections(lines)
            const leaves = secs.filter((s) => s.leaf && !!coreName(s.title))
            if (leaves.length < 2) break
            let merged = false
            for (let a = 0; a < leaves.length && !merged; a++) {
              for (let b = a + 1; b < leaves.length && !merged; b++) {
                const x = leaves[a]; const y = leaves[b]
                const xBody = x.body.filter((l) => l.trim()).map((l) => l.trim()).join('\n')
                const yBody = y.body.filter((l) => l.trim()).map((l) => l.trim()).join('\n')
                // 守卫：正文空（无可并内容）、标题核心名双向包含（同名/演化同族）、或核心名含 / 或 §
                // （会破坏索引指针 `§A/§B` 列表语法，改写后无法再被解析）→ 保守跳过
                if (!xBody || !yBody || biContains(x.title, y.title)) continue
                const xCore = coreName(x.title); const yCore = coreName(y.title)
                if (xCore.includes('/') || xCore.includes('§') || yCore.includes('/') || yCore.includes('§')) continue
                let sim: number | null = null
                if (xBody === yBody) sim = 1 // 正文逐行全同 → 视为 1.0 直并（不依赖向量）
                else if (ecfg.enabled && embedBudget > 0) {
                  embedBudget--
                  try { sim = await semanticSim(`${coreName(x.title)}\n${xBody}`, `${coreName(y.title)}\n${yBody}`, ecfg) } catch { sim = null }
                }
                if (sim === null || sim < 0.95) continue // sim 不可用/未达标：跳过语义（正文全同已在上方直并）
                // canonical=正文较长者；等长且正文不同 → 无法唯一确定 canonical → 跳过；等长正文全同 → 取文件序更早
                let c: Section; let o: Section
                if (xBody.length > yBody.length) { c = x; o = y }
                else if (yBody.length > xBody.length) { c = y; o = x }
                else if (xBody !== yBody) continue
                else { c = x.idx < y.idx ? x : y; o = x.idx < y.idx ? y : x }
                // 合并执行：删除 o（标题+正文整段），把 o 正文中 canonical 没有的唯一非空行追加到 canonical 正文尾
                const cTrim = new Set(c.body.map((l) => l.trim()))
                const extra: string[] = []
                for (const ol of o.body) {
                  const t = ol.trim()
                  if (!t || cTrim.has(t)) continue
                  cTrim.add(t)
                  extra.push(/^-\s/.test(ol) ? ol : `- ${ol}`) // 原本有 `- ` 前缀保留原样，否则补 `- `
                }
                const delta = o.end - o.idx
                const rest = lines.slice(0, o.idx).concat(lines.slice(o.end))
                const cIdx = o.idx < c.idx ? c.idx - delta : c.idx
                // canonical 小节正文尾部（其末个非空行之后；下一个 ≤ 级标题前）作为追加插入点
                let slot = rest.length
                for (let q = cIdx + 1; q < rest.length; q++) {
                  const lv = /^(#{2,})[ \t]+/.exec(rest[q])
                  if (lv && lv[1].length <= c.level) { slot = q; break }
                }
                let ins = cIdx + 1
                for (let q = cIdx + 1; q < slot; q++) { if (rest[q].trim() !== '') ins = q + 1 }
                lines = rest.slice(0, ins).concat(extra, rest.slice(ins))
                archive({
                  action: 'sec-merge', file: `notes/${nf}`,
                  removedHeading: o.title, removedOriginal: o.raw.join('\n'),
                  keptHeading: c.title, keptOriginal: c.raw.join('\n'), mergedExtra: extra,
                  reason: xBody === yBody ? 'body-identical' : `semantic-${Number(sim).toFixed(3)}`,
                })
                chain.push({ old: coreName(o.title), next: coreName(c.title) })
                merges++; changed = true; merged = true
              }
            }
            if (!merged) break
          }
          if (changed && merges && atomicWrite(p, finalize(lines))) {
            secMerged += merges
            mergesByFile.set(nf, chain) // 落盘成功才登记指针改写链（防改指针指向未落盘的合并）
          }
        } catch { /* D 单文件异常：跳过继续 */ }
      }
      // D 尾：索引指针整段改写（被并 §另一小节名 → §canonical 去日期核心名；匹配=核心名双向包含）
      if (mergesByFile.size) {
        // 链式合并解析终值（A→B 后又 B→C → 最终 C），改写只对「已不存在的旧小节名」发生
        const finalChain = (chain: Array<{ old: string; next: string }>): Array<{ old: string; next: string }> => {
          const map = new Map<string, string>()
          for (const c of chain) { if (c.old && c.next && c.old !== c.next) map.set(c.old, c.next) }
          const out: Array<{ old: string; next: string }> = []
          for (const [old, n0] of map) {
            let next = n0; let hop = 0
            while (map.has(next) && hop < 8) { next = map.get(next) as string; hop++ }
            out.push({ old, next })
          }
          return out
        }
        // 单行改写：把 notes/<nf>（nf 已含 .md 扩展名）后紧跟的 § 目标 token 中匹配 old 的整段换成 new。
        // 段边界=下一个 notes/ 引用或 →（小节 token 列表必在 → 之前）；改写只替换 token 文本、保留其余原样；
        // 若整段为纯「§A/§B」语法（无杂散文本）才做重复 § 折叠归一，避免把 ` → ` 等连字符吞进 token。
        const rewriteRowPointers = (raw: string, nf: string, finals: Array<{ old: string; next: string }>): string | null => {
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
            if (nxArrow >= 0 && nxArrow < end) end = nxArrow // 段内不得越过 →（token 列表必在其前）
            let seg = raw.slice(pos + token.length, end)
            const firstSeg = seg
            let segChanged = false
            seg = seg.replace(/(§[^§/]*)/g, (whole) => {
              const kw = coreName(whole.replace(/^§+/, '').trim())
              if (!kw) return whole
              for (const fm of finals) {
                if (biContains(kw, fm.old)) { changed = true; segChanged = true; return `§${fm.next}` }
              }
              return whole
            })
            if (segChanged) {
              // 纯「§A/§B」（可带空白）才整段归一：去空 token、同目标重复折叠、统一 ` §A/§B` 风格；
              // 保留原段首/段尾空白（防 `…§X → …` 边界丢空格）；含杂散文本（如 →/notes/）则只做 token 替换不改其余
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
        for (const f of IDX_FILES) {
          try {
            const p = join(memRoot, f)
            let content = ''
            try { content = readFileSync(p, 'utf8') } catch { continue }
            const lines = content.split(/\r?\n/)
            let fileChanged = false
            const rewritten: string[] = []
            for (const raw of lines) {
              const t = raw.trim()
              if (!t || !idxRowRe.test(t)) { rewritten.push(raw); continue }
              let cur = raw
              for (const [nf, chain] of mergesByFile) {
                const upd = rewriteRowPointers(cur, nf, finalChain(chain))
                if (upd !== null) cur = upd
              }
              if (cur !== raw) {
                fileChanged = true
                archive({ action: 'sec-merge-pointer', file: f, original: raw, into: cur })
              }
              rewritten.push(cur)
            }
            if (fileChanged) atomicWrite(p, finalize(rewritten))
          } catch { /* 索引指针改写单文件异常：跳过继续 */ }
        }
      }
    } catch (e) {
      // 顶层防御：异常仅收敛为日志（已发生步骤的计数保留），绝不抛出、不中断深睡主流程
      log(`consolidate: 内部异常（已收敛）: ${String((e as Error)?.message || e).slice(0, 120)}`)
    }
    audit({ kind: 'consolidate', idxExact, idxSem, secMerged, lineDedup, archived, memRoot })
    log(`consolidate: 索引精确去重 ${idxExact} / 语义折叠 ${idxSem} / 小节合并 ${secMerged} / 行内去重 ${lineDedup} / 归档 ${archived}`)
    return { idxExact, idxSem, secMerged, lineDedup, archived }
  }

  /**
   * 深睡 parent 兜底（2026-09-08 修复：无 parent 直接崩 —— reading 'options'）。
   * 悖论：深睡在「全部会话停滞/结束」时触发，此时 ctx.agents.roots() 常为空，
   * 而宿主 spawn 必须有 parent（resolveChildDepth 读 parent.options）→ 必然会睡的时候必然崩。
   * 解法：事件中缓存最近一次活动过的 agent（对象带 options/ctx 即可当 parent 用），
   * 顺序=当前 roots → 在册 agents → 缓存的最近 agent；都没有则跳过本轮并审计（绝不崩）。
   */
  let lastParent: any = null
  let daemonParent: any = null
  const isValidParent = (p: any): boolean => !!p && typeof p === 'object' && !!p.options && !!p.ctx
  const rememberAgent = (a: any): void => { try { if (isValidParent(a)) lastParent = a } catch { /* */ } }
  // 子代理感知（2026-09-10 实态修复：主会话"派子代理执行、等返回"期间被误判空闲/停滞）：
  // DSH 子代理会话 header.origin='subagent' 且 header.parentSession=父会话 id；子代理在跑 = 父会话仍在干活。
  const isSubagentAgent = (a: any): boolean => { try { return a?.session?.header?.origin === 'subagent' } catch { return false } }
  // 父会话 id 解析（2026-09-10 三修）：E2E 实证记录对象上 header.parentSession 可能取不到（当时三会话同判 busy=走了全局兜底）
  // → 多字段探测（live session header / record header / options / 直挂字段），全失败才回落全局兜底。
  const parentSidOf = (a: any): string | null => {
    try {
      const cands = [
        a?.session?.header?.parentSession, a?.session?.header?.parent, a?.session?.parentSession,
        a?.session?.record?.header?.parentSession, a?.session?.record?.parentSession,
        a?.options?.parentSession, a?.options?.parentId, a?.parentSession, a?.parentId, a?.parent?.id,
      ]
      for (const c of cands) if (typeof c === 'string' && c) return c
      return null
    } catch { return null }
  }
  // 子代理活动双通道（2026-09-10 二修，E2E 实证 ctx.agents.list() 记录未必带 live status）：
  // ① 事件通道：收到任意子代理事件即记「该父会话有子代在跑」（3 分钟新鲜度，防僵尸残留）；
  // ② 枚举通道：list() 扫 subagent 记录并用 ctx.agents.get(id) 取 live agent 判 status==='running'。
  const childSeen = new Map<string, Map<string, number>>() // parentSid -> childSid -> lastSeen
  let globalChildSeen = 0 // 父归属解析失败时的全局兜底（宁少蒸勿切碎）
  let globalChildLoggedAt = 0 // 兜底生效日志节流（60s 一次，防每轮刷屏）
  const CHILD_ACTIVE_MS = 180000
  const noteChildActivity = (parentSid: string | null, childSid: string): void => {
    const now = Date.now()
    if (!parentSid) { globalChildSeen = now; return }
    let m = childSeen.get(parentSid)
    if (!m) { m = new Map(); childSeen.set(parentSid, m) }
    m.set(childSid, now)
  }
  const dropChild = (childSid: string): void => {
    for (const [p, m] of childSeen) { if (m.delete(childSid) && !m.size) childSeen.delete(p) }
  }
  /** 该会话是否有运行中的子代理后代（事件通道 + live status 枚举通道） */
  const hasActiveSubagents = (sid: string): boolean => {
    const now = Date.now()
    try {
      const m = childSeen.get(sid)
      if (m) {
        for (const [child, seen] of m) {
          const live = ctx.agents.get(child)
          if (live && live.status === 'running') return true
          if (now - seen < CHILD_ACTIVE_MS) return true
          m.delete(child)
        }
        if (!m.size) childSeen.delete(sid)
      }
      if (globalChildSeen && now - globalChildSeen < CHILD_ACTIVE_MS) {
        // 2026-09-11 审查：父归属解析失败的子代理事件会**全局**冻结蒸馏/深睡（保守取舍：宁少蒸勿切碎）——
        // 加节流日志，避免「为什么没蒸」无从判断。
        if (now - globalChildLoggedAt > 60000) {
          globalChildLoggedAt = now
          log(`子代理活动兜底生效：父归属未解，全局冻结蒸馏/深睡中（剩余 ${Math.ceil((CHILD_ACTIVE_MS - (now - globalChildSeen)) / 1000)}s）`)
        }
        return true
      }
    } catch { /* 事件通道异常→继续走枚举通道 */ }
    try {
      for (const a of ctx.agents.list() || []) {
        if (!isSubagentAgent(a)) continue
        const live = ctx.agents.get(a.id)
        if (!(live && live.status === 'running')) continue
        let p = parentSidOf(a) || parentSidOf(live); let depth = 0
        if (!p) return true // 归属解析失败：宁少蒸勿切碎（保守）
        while (p && depth++ < 4) {
          if (p === sid) return true
          const pa = ctx.agents.get(p); p = pa ? parentSidOf(pa) : null
        }
      }
    } catch { /* 查询失败=按无活跃子代理（保守不阻断） */ }
    return false
  }
  const pickParent = (): any | null => {
    try { for (const r of ctx.agents.roots() || []) if (isValidParent(r)) return r } catch { /* */ }
    try { for (const a of ctx.agents.list() || []) if (isValidParent(a)) return a } catch { /* */ }
    return isValidParent(lastParent) ? lastParent : null
  }
  /**
   * 守护 parent（最后兜底）：服务重启后若从未有过会话活动，roots/list/lastParent 全空，
   * 深睡将永远跑不起来（夜间正是这种场景）。此时用插件 ctx 惰性创建一个常驻 agent 当 parent
   * （只用于承载子代理创建，不给它下发任何任务）；创建失败则退回 no-parent 跳过，不崩。
   */
  /**
   * 默认 LLM 路由（守护 parent 用）：优先插件配置，其次宿主默认模型服务。
   * 守护 parent 是新建的空 agent，没有会话继承模型；不显式给路由，子代理会 100ms 内
   * stop=error 且零输出（实测），归纳必然空转。
   */
  const resolveDefaultModel = (): { provider: string; model: string } | undefined => {
    try {
      const c: any = ctx as any
      const svc = c.agentDefaultModel ?? (typeof c.get === 'function' ? c.get('agentDefaultModel') : undefined)
      const sel = svc && typeof svc.currentSelection === 'function' ? svc.currentSelection() : null
      if (sel && sel.provider && sel.model) return { provider: String(sel.provider), model: String(sel.model) }
    } catch { /* 解析失败=不给路由 */ }
    return undefined
  }
  const ensureDaemonParent = async (signal: AbortSignal, agentOptions?: { provider: string; model: string }): Promise<any | null> => {
    if (isValidParent(daemonParent)) return daemonParent
    try {
      // sessionId 必须显式给：宿主用它当 agent id（缺省会抛 agent id "undefined" does not match session id）
      const handle: any = await ctx.agents.create({
        sessionId: `session-${randomUUID()}`,
        ...(agentOptions ? { agentOptions } : {}),
        signal,
      })
      const a = handle && handle.agent ? handle.agent : handle
      if (isValidParent(a)) { daemonParent = a; log('deep sleep: 已建立守护 parent（无会话场景承载归纳子代理）'); return a }
      log('deep sleep: 守护 parent 创建结果不可用')
    } catch (e) { log(`deep sleep: 守护 parent 创建失败：${String((e as Error)?.message || e).slice(0, 120)}`) }
    return null
  }

  /** 返回 'done'=本轮窗口已消化（推进水位）；'failed'=瞬时故障（回滚水位，下轮可重试同一批痕迹） */
  const runDeepSleep = async (sinceArg?: number): Promise<'done' | 'failed' | 'no-traces'> => {
    try {
      const since = sinceArg ?? traceSince()
      const resolved = resolveTarget()
      if (!resolved.present) {
        log('deep sleep: 记忆库缺席（部署残缺），跳过')
        return 'failed'
      }
      // consolidation v1 并入深睡巡检（2026-09-10 用户拍板：停滞≥3h 窗口先向量去重整合再归纳）——
      // 在痕迹归纳之前先做确定性/高置信去重整合（A 索引精确重复 / B 语义近重 / C 小节内行去重 / D 叶子小节合并），
      // 收敛树状记忆「只增不修」的重复指针/重复详情；旧内容已归档可回滚；失败仅 log，绝不影响后续深睡流程。
      try {
        await consolidateTree(resolved.root)
      } catch (e) {
        log(`deep sleep: consolidation 失败（跳过，继续深睡）: ${String((e as Error)?.message || e).slice(0, 120)}`)
      }
      // 真实读采集（2026-09-10 ACT-023）：`access.log` 只覆盖 read_section 路径，agent 的真实读
      // （read/grep/glob/pwsh 命中记忆库）零埋点 ⇒ 活性/遗忘/回想强度三模型失真（假冷）。
      // 先由 harvest-access.mjs 从**会话转录**按「会话 seq 水位」增量采集真实读到 `access-real.jsonl`，
      // 再由 activityAggregate 合并两源（聚合是每轮按日志全量重算，故无需改判定逻辑）。
      // 失败仅 log，绝不阻断深睡（同 below 各步的收敛策略）。
      try {
        await runNode(config.nodeBin, join(resolved.root, 'scripts', 'harvest-access.mjs'), [], {
          env: { MEMORY_ROOT: resolved.root, ...capEnv() },
          timeout: 120000,
        })
      } catch (e) {
        log(`deep sleep: 真实读采集失败（跳过，按既有日志聚合）: ${String((e as Error)?.message || e).slice(0, 120)}`)
      }
      // v7 A 步：条目活性聚合（2026-09-10，方案 docs/memory-activity-model.md）——consolidation 之后、归纳之前：
      // 命中聚合 → ACT-R 式状态迁移（active/warm/cold）→ 遗忘候选清单（只建议不删除）；失败仅 log。
      // 阈值走 scheduler.json（activityWarmDays/ColdDays/ArchiveDays/HotHits，UI 可调），缺省 14/44/90/5。
      try {
        await activityAggregate(resolved.root, { audit, log }, {
          warmDays: Number(config.activityWarmDays) || 14,
          coldDays: Number(config.activityColdDays) || 44,
          archiveDays: Number(config.activityArchiveDays) || 90,
          hotHits: Number(config.activityHotHits) || 5,
        })
      } catch (e) {
        log(`deep sleep: activity 聚合失败（跳过，继续深睡）: ${String((e as Error)?.message || e).slice(0, 120)}`)
      }
      const traces = gatherDeepSleepTraces(resolved.root, since)
      // 无痕迹=无事可归纳，不调用 LLM、不留审计（防每巡检周期一条 no-traces 的膨胀与空转感）——
      // 「没有材料就不需要睡眠」：窗口直接滑到当前，未来痕迹 mtime 必然晚于水位，永不丢失。
      if (!traces) { log(`deep sleep: 窗口内无痕迹（起点 ${new Date(since).toLocaleString()}），窗口滑到当前，本轮不睡`); return 'no-traces' }
      log(`deep sleep: 窗口内痕迹 ${traces.length} 字符（起点 ${new Date(since).toLocaleString()}）`)
      const currentPrinciples = (() => { try { return readFileSync(join(resolved.root, 'AGENT.md'), 'utf8') } catch { return '' } })()
      const currentList = currentPrinciples.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\[(原则|路径)\]/.test(l)).join('\n') || '（暂无条目）'
      // 双画像巩固材料：现行 USER/AGENT 画像全文（行格式门禁的 replace 依据）
      const currentProfiles = ['USER.md', 'AGENT.md'].map((f) => {
        let body = ''
        try { body = readFileSync(join(resolved.root, f), 'utf8') } catch { /* 无文件=空 */ }
        return `### ${f}\n${body.trim() || '（空）'}`
      }).join('\n\n')
      // v6 指针自动维护材料：现行 MEMORY 索引行（pointerOps 扩容/重构的 match 逐字取自此处；USER/AGENT 行已在现行画像）
      const currentMemIndex = (() => {
        try {
          const b = readFileSync(join(resolved.root, 'MEMORY.md'), 'utf8')
          return b.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\[[^\]\s]+\]/.test(l)).join('\n') || '（暂无条目）'
        } catch { return '（无 MEMORY.md）' }
      })()
      // v17.3 treeOps 材料：现行树节清单（treeOps 的 file/oldTitle/dropTitle/keepTitle 必须逐字取自该段；
      // 每个小节一行 `notes/文件:标题`，含层级标记；无树节输出一行「（无）」）
      const currentTreeSections = (() => {
        try {
          const nd = join(resolved.root, 'notes')
          const files = readdirSync(nd).filter((f) => /\.md$/i.test(f) && f.toLowerCase() !== 'index.md').sort()
          const rows: string[] = []
          for (const f of files) {
            const body = readFileSync(join(nd, f), 'utf8')
            for (const m of body.matchAll(/^(#{2,4})[ \t]+(.*)$/gm)) {
              const title = String(m[2] || '').trim()
              if (!title) continue
              rows.push(`notes/${f} ${'#'.repeat(m[1].length)} ${title}`)
            }
          }
          return rows.length ? rows.join('\n') : '（无）'
        } catch { return '（无）' }
      })()
      // v18（§8.1 分裂律）treeOps.split 材料：超 R(1000 字) 的**叶子 ## 节**正文——parts[].start 必须逐字取自此处。
      //   有界：取最大的 3 个候选、每个 ≤60 行（分裂是低频手术，材料不铺全量）。
      const splitCandidates = (() => {
        try {
          const nd = join(resolved.root, 'notes')
          const files = readdirSync(nd).filter((f) => /\.md$/i.test(f) && f.toLowerCase() !== 'index.md').sort()
          const cands: Array<{ head: string; body: string[]; size: number }> = []
          for (const f of files) {
            const ls = readFileSync(join(nd, f), 'utf8').split(/\r?\n/)
            const heads: number[] = []
            for (let i = 0; i < ls.length; i++) if (/^#{2,4}[ \t]+/.test(ls[i])) heads.push(i)
            for (let h = 0; h < heads.length; h++) {
              const i0 = heads[h]
              const lvl = (ls[i0].match(/^#+/) || [''])[0].length
              if (lvl !== 2) continue // v2：split 只作用于 ##
              const nextLvl = h + 1 < heads.length ? ((ls[heads[h + 1]].match(/^#+/) || [''])[0].length) : 0
              if (nextLvl > lvl) continue // 非叶子（已含更深标题）→ 不是 split 候选
              const i1 = h + 1 < heads.length ? heads[h + 1] : ls.length
              const block = ls.slice(i0, i1)
              const size = block.join('').replace(/\s/g, '').length
              if (size > 1000) cands.push({ head: `notes/${f} ## ${ls[i0].replace(/^#+\s*/, '').trim()}（${size} 字）`, body: block.slice(0, 60), size })
            }
          }
          cands.sort((a, b) => b.size - a.size)
          const top = cands.slice(0, 3)
          return top.length ? top.map((c) => `${c.head}\n${c.body.join('\n')}`).join('\n\n---\n\n') : '（无）'
        } catch { return '（无）' }
      })()
      // v19（认知对照 P0「主动遗忘」）forgetOps 材料：cold 且 ≥90 天零命中的冷节——来源 audit/activity.jsonl
      //   （与 activity.ts 同源，不另立口径）；上限 top-10。此前该清单只写 audit/*.md 无人读 ⇒ 遗忘永不发生。
      const forgetCandidates = (() => {
        try {
          const rows: Array<{ f: string; s: string; hits: number; days: number | 'never'; orphan: boolean }> = []
          // R1（审查项）：画像承载文件**不进候选**——画像行全量注入，其 cold 是机制性的，不是"没人用"
          const PROFILE = new Set(['user.md', 'agent.md'])
          // P2（审查项）：索引仍引用的 (file::§) 集合——用于标注**孤儿条目**（索引已删、正文仍在）
          const refs = new Set<string>()
          for (const idx of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
            let raw = ''
            try { raw = readFileSync(join(resolved.root, idx), 'utf8') } catch { continue }
            for (const line of raw.split(/\r?\n/)) {
              const fm = line.match(/→\s*notes\/([A-Za-z0-9_-]+)\.md/)
              if (!fm) continue
              for (const m of (line.split('→').pop() || '').matchAll(/§([^/→\s]+)/g)) {
                refs.add(`${fm[1]}::${String(m[1]).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim().toLowerCase()}`)
              }
            }
          }
          for (const l of readFileSync(join(resolved.root, 'audit', 'activity.jsonl'), 'utf8').split(/\r?\n/)) {
            if (!l.trim()) continue
            try {
              const o = JSON.parse(l) as { f?: string; s?: string; status?: string; hits?: number; lastHit?: number | null }
              if (String(o.status) !== 'cold') continue
              const days = o.lastHit ? Math.round((Date.now() - Number(o.lastHit)) / 86400000) : 'never' as const
              if (days !== 'never' && days <= 90) continue
              const f = String(o.f || '').replace(/^notes\//, '')
              const s = String(o.s || '')
              if (PROFILE.has(f.toLowerCase())) continue
              // R2（审查项）：剔除**悬空候选**（节不存在）——否则白占材料 top-10 名额（口径与 matchSection 同源）
              if (!sectionExists(resolved.root, f, s)) continue
              const orphan = !refs.has(`${f.replace(/\.md$/, '')}::${s.toLowerCase()}`)
              rows.push({ f, s, hits: Number(o.hits || 0), days, orphan })
            } catch { /* 坏行跳过 */ }
          }
          const v = (d: number | 'never'): number => (d === 'never' ? Number.MAX_SAFE_INTEGER : d)
          rows.sort((a, b) => v(b.days) - v(a.days))
          const top = rows.slice(0, 10)
          return top.length
            ? top.map((r) => `${r.f} §${r.s}（hits ${r.hits} · 距最后命中 ${r.days === 'never' ? '从未' : r.days + ' 天'}${r.orphan ? ' · **孤儿条目**：索引已不再引用，仅正文留存' : ''}）`).join('\n')
            : '（无）'
        } catch { return '（无）' }
      })()
      // v19（认知对照 P2「跨日回放」）再现材料：近 7 日**已有条目被再次命中**（来源 access-real.jsonl = 真实读埋点）；
      //   供深睡判「跨日二次激活」（生物侧 replay / dream-lag）；上限 top-10。
      const replayRecent = (() => {
        try {
          const since = Date.now() - 7 * 86400000
          const cnt = new Map<string, number>()
          for (const l of readFileSync(join(resolved.root, 'audit', 'access-real.jsonl'), 'utf8').split(/\r?\n/)) {
            if (!l.trim()) continue
            try {
              const o = JSON.parse(l) as { t?: string; f?: string; s?: string }
              const ts = Date.parse(String(o.t || ''))
              if (!ts || ts < since) continue
              const k = `${String(o.f || '').replace(/^notes\//, '')} §${String(o.s || '')}`
              cnt.set(k, (cnt.get(k) || 0) + 1)
            } catch { /* 坏行跳过 */ }
          }
          const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
          return top.length ? top.map(([k, n]) => `${k}（${n} 次）`).join('\n') : '（无）'
        } catch { return '（无）' }
      })()
      validateProvider()

      // 本地日键（与 activity.ts dayKey 同口径：文件名 activity-hot-<YYYY-MM-DD>.md）
      const _now = new Date()
      const _p2 = (n: number): string => String(n).padStart(2, '0')
      const dayKeyLocal = `${_now.getFullYear()}-${_p2(_now.getMonth() + 1)}-${_p2(_now.getDate())}`
      // v7 B 加深上下文：活性聚合产出的今日高频小节清单（仅建议——是否扩容概况/提炼原则由本归纳按既有判据决定，宿主 gate 把关）
      const hotCtx = (() => {
        try {
          const f = join(resolved.root, 'audit', `activity-hot-${dayKeyLocal}.md`)
          if (!existsSync(f)) return ''
          const body = readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('|')).slice(2, 20).join('\n')
          return body ? `## 活性高频小节（近30天命中≥5；如需扩容概况经 pointerOps.update、如需提炼原则经 principles）\n${body}` : ''
        } catch { return '' }
      })()
      // v8（认知对照 P2「竞争性抑制」）互抑候选材料：同文件 § 名 bigram 重叠 ∈ [0.50, 0.66)（低于唯一门拒收阈值故并存至今）
      const interCtx = (() => {
        try {
          const f = join(resolved.root, 'audit', `activity-interference-${dayKeyLocal}.md`)
          if (!existsSync(f)) return ''
          const rows = readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('|')).slice(2, 14).join('\n')
          return rows ? `## 互抑候选（同文件 § 名高度重叠，低于唯一门阈值故并存至今；可经 treeOps.merge 并入或 pointerOps 合并概况）\n${rows}` : ''
        } catch { return '' }
      })()
      const userInput = [
        '## 当天记忆痕迹（作用域=本日，不做全库扫描）',
        traces,
        hotCtx || '（无活性高频小节）',
        interCtx || '（无互抑候选）',
        `## 现行原则/路径（冲突时 replace，match 逐字取自此清单）\n${currentList}`,
        `## 现行画像（profileOps 的 replace match 逐字取自此处）\n${currentProfiles}`,
        `## 现行知识索引（MEMORY.md；pointerOps 扩容/重构的 match 逐字取自此处）\n${currentMemIndex}`,
        `## 现行树节清单（treeOps 的 file/oldTitle/dropTitle/keepTitle 必须逐字取自此处；每个小节一行 \`notes/文件:标题\`，含 ## 与 ### 全部）\n${currentTreeSections}`,
        `## 待拆候选节正文（子树正文 > R=1000 字的叶子 ##；仅当确要 split 时看此段——parts[].start 必须**逐字**取自对应节的正文行）\n${splitCandidates}`,
        `## 遗忘候选（cold 且 ≥90 天零命中的冷节；forgetOps 的 file/section 必须逐字取自此处——只允许 archive/keep，禁止删除）\n${forgetCandidates}`,
        `## 近 7 日再现（已有条目被再次命中；判「跨日二次激活」用——同一条目在多个日窗重现 = 该主题稳固，可扩容概况/提纯为更高层原则）\n${replayRecent}`,
        '请按规则处理：提炼跨任务泛化原则与双画像/知识索引更新指令，输出 JSON。',
      ].join('\n\n')
      const resolvedLlm = resolveLlm(config.sleepProvider, config.sleepModel)
      const useProvider = !!resolvedLlm && providerFailCount < 2
      const agentOptions = useProvider ? { provider: resolvedLlm!.provider, model: resolvedLlm!.model } : undefined
      const ac = new AbortController()
      const timeout = setTimeout(() => { try { ac.abort(new Error('deep sleep timeout 10min')) } catch { /* */ } }, 600000)
      let parent = pickParent()
      // 守护 parent 默认关闭（宿主「新建空 agent 当 parent」路径未经验证，实测子代理 100ms stop=error）
      if (!parent && config.deepSleepDaemonParent) {
        const route = agentOptions ?? resolveDefaultModel()
        log(`deep sleep: 无可用 agent，尝试守护 parent（路由 ${route ? `${route.provider}/${route.model}` : '继承默认'}）`)
        parent = await ensureDaemonParent(ac.signal, route)
      }
      if (!parent) {
        log('deep sleep: 无可用 parent agent（宿主 spawn 必需），跳过本轮')
        audit({ kind: 'deep-sleep', result: 'no-parent' })
        return 'failed'
      }
      try {
        const run2 = await ctx.subagents.start('spawn', {
          label: 'deep-sleep-induction',
          parent,
          signal: ac.signal,
          maxDepth: 1,
          ...(agentOptions ? { agentOptions } : {}),
          prompt: [{ type: 'text', text: userInput }],
          persona: DEEP_SLEEP_PROMPT,
          toolFilter: { allow: [] },
        })
        const result = await Promise.race([
          run2.result,
          new Promise((resolve) => setTimeout(() => resolve({ stopReason: 'timeout' } as any), 600000)),
        ]) as any
        clearTimeout(timeout)
        const stop = result && result.stopReason
        if (stop !== 'completed') log(`deep sleep: 子代理非正常结束 stop=${stop} 详情=${JSON.stringify(result).slice(0, 400)}`)
        const out = parseAgentJson(result, 'deep sleep')
        if (stop === 'completed' && out) providerFailCount = 0
        else if (useProvider && (stop !== 'completed' || !out)) providerFailCount++
        // 认知对照 P2「REM 相」：crossTopic（跨主题联想）**合并进 principles 通道**——零新增落盘代码。
        //   硬门：text 的源指针须覆盖 ≥2 个**不同 § 小节**（同主题归纳已由 principles 覆盖）；
        //   开关关（config.enableRemPass / env SHOUCANG_REM_PASS=1）时整段丢弃，不污染既有通道。
        if (out && Array.isArray(out.crossTopic)) {
          const remOn = !!config.enableRemPass || process.env.SHOUCANG_REM_PASS === '1'
          const kept: Array<{ action: string; text: string }> = []
          for (const c of out.crossTopic) {
            if (!remOn) { log('deep sleep: crossTopic 丢弃（REM 相未开启）'); break }
            const text = String((c && (c as any).text) || '').trim()
            const secs = [...text.matchAll(/§([^/→]+)/g)]
              .map((m) => String(m[1]).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim())
              .filter(Boolean)
            const uniq = new Set(secs.map((s) => s.toLowerCase()))
            if (!text || uniq.size < 2) { log(`deep sleep: crossTopic 丢弃（源指针覆盖 ${uniq.size} 个主题 <2）`); continue }
            kept.push({ action: String((c && (c as any).action) || 'add'), text })
          }
          if (kept.length) {
            if (!Array.isArray(out.principles)) out.principles = []
            out.principles.push(...kept)
            log(`deep sleep: REM 相并入 ${kept.length} 条跨主题原则`)
          }
        }
        const app = (stop === 'completed' && out)
          ? await applyPrinciples(resolved.root, out)
          : { added: 0, replaced: 0, skipped: 0, gate: `stop=${stop}` }
        // 双画像巩固：profileOps（add/replace，须 notes 源指针；格式/容量/去重门禁同蒸馏）
        let profileAdded = 0
        if (stop === 'completed' && out && Array.isArray(out.profileOps)) {
          const ops = out.profileOps.filter((o: any) => o && normalizeProfileTarget(String(o.target)) && ['add', 'replace'].includes(String(o.action)))
          for (const op of ops) {
            const r = writeProfileLine(resolved.root, String(op.target), String(op.section || ''), String(op.text || ''), op.action === 'replace' ? String(op.match || '') : undefined)
            if (r.st === 'added') profileAdded++
          }
        }
        // v6 指针自动维护：pointerOps（update 原地替换整行，走 write_gate；扩容概况/重构指针 §）
        const ptrRes = (stop === 'completed' && out)
          ? await applyPointerOps(resolved.root, out)
          : { updated: 0, skipped: 0, gate: `stop=${stop}` }
        // v17.3 树自动维护：treeOps（rename/merge；模型提案 → 宿主执行守不变量——归档可回滚/锚存在/指针集内重写/无孤儿/幂等）
        const treeRes = (stop === 'completed' && out && Array.isArray(out.treeOps))
          ? await applyTreeOps(resolved.root, out.treeOps, { audit, log })
          : { applied: 0, skipped: 0, archived: 0 }
        // 认知对照 P0「主动遗忘」：forgetOps（模型对 cold 候选取舍 → 归档移正文留 stub / keep 留理由）
        //   宿主守三条守卫（叶子节 / activity 里为 cold / 非重复 stub）+ 禁止直删，全部在 applyForgetOps 内。
        const forgetRes = (stop === 'completed' && out && Array.isArray(out.forgetOps))
          ? await applyForgetOps(resolved.root, out.forgetOps, { audit, log })
          : { archived: 0, kept: 0, skipped: 0 }
        log(`deep sleep: stop=${stop} 原则 +${app.added}/替换 ${app.replaced}/跳过 ${app.skipped}（${app.gate}）画像 +${profileAdded} 指针更新 ${ptrRes.updated}/跳过 ${ptrRes.skipped}（${ptrRes.gate}）树 ops ${treeRes.applied}/跳过 ${treeRes.skipped}/归档 ${treeRes.archived} forget 归档 ${forgetRes.archived}/保留 ${forgetRes.kept}/跳过 ${forgetRes.skipped}`)
        audit({ kind: 'deep-sleep', stop, added: app.added, replaced: app.replaced, skipped: app.skipped, profiles: profileAdded, pointers: ptrRes.updated, ptrSkipped: ptrRes.skipped, tree: treeRes.applied, treeSkipped: treeRes.skipped, forgetArchived: forgetRes.archived, forgetKept: forgetRes.kept, forgetSkipped: forgetRes.skipped, gate: app.gate })
        // 判据台账（巩固域）：模型判据（可选 judgement）+ 宿主侧**升格/降格裁决**（criteria.ts 单一实现）+ 六通道结果
        ledger({
          domain: 'consolidate', step: 'deep-sleep', stop,
          judgement: (out && out.judgement) || null,
          hostGates: {
            // 升格裁决（原则：支撑条数；路径：同型次数+跨会话+只从成功）
            promote: {
              principles: (out?.principles || []).length ? promoteVerdict('principle', { traces: Number((out?.judgement && (out.judgement as any).evidence) || 0) || undefined }).ok : null,
              premiseGate: promoteVerdict('principle', { traces: 99, dependsOnPremise: !!(out?.judgement && (out.judgement as any).dependsOnPremise), premiseWritten: !!(out?.judgement && (out.judgement as any).premiseWritten) }),
            },
            // 降格/遗忘裁决逐条（三守卫 + 画像节保护 + 单轮上限）
            demote: (out?.forgetOps || []).slice(0, 8).map((o: any) => ({ section: `${String(o?.file || '')} §${String(o?.section || '')}`, verdict: demoteVerdict({ file: String(o?.file || ''), status: String(o?.status || 'cold') }).reason })),
          },
          result: { principlesAdded: app.added, principlesReplaced: app.replaced, principlesSkipped: app.skipped, profilesAdded: profileAdded, pointersUpdated: ptrRes.updated, treeApplied: treeRes.applied, treeArchived: treeRes.archived, forgetArchived: forgetRes.archived, forgetKept: forgetRes.kept, forgetSkipped: forgetRes.skipped },
          enqueued: { principles: (out?.principles || []).length, profileOps: (out?.profileOps || []).length, pointerOps: (out?.pointerOps || []).length, treeOps: (out?.treeOps || []).length, forgetOps: (out?.forgetOps || []).length, crossTopic: (out?.crossTopic || []).length, skipped: (out?.skipped || []).length },
        })
        if (stop === 'completed') void bankSnapshot('deep-sleep') // v2：巩固后库快照（best-effort）
        if (stop === 'completed') {
          // 路线② 晨起摘要 delta：深睡消化后的行级 diff（新增/替换 [原则]/[路径]/画像行 ≤3）→ suite/knowledge/delta.md
          // 语义：delta 是「最近变化的新闻」，AGENT.md/USER.md 是档案全本；delta 永非事实源，过期即弃（下轮深睡覆盖）。
          try {
            const afterAgent = (() => { try { return readFileSync(join(resolved.root, 'AGENT.md'), 'utf8') } catch { return '' } })()
            const rows: string[] = []
            const pushDiff = (beforeText: string, afterText: string): void => {
              const pre = new Set((beforeText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
              for (const l of (afterText || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
                if (pre.has(l)) continue
                const tag = (l.match(/^\[([^\] ]+)\]/) || [])[1]
                if (tag === '原则' || tag === '路径' || l.startsWith('- ')) rows.push(l)
              }
            }
            pushDiff(currentPrinciples, afterAgent) // AGENT 全档 diff：覆盖 [原则]/[路径] 行与 AGENT 画像 '- ' 行
            pushDiff(currentProfiles, (() => { try { return readFileSync(join(resolved.root, 'USER.md'), 'utf8') } catch { return '' } })()) // USER 画像行（currentProfiles 已含 USER 原文作 before）
            if (rows.length) {
              const deltaFile = join(kRoot, 'delta.md')
              writeFileSync(deltaFile, JSON.stringify({ at: new Date().toISOString(), staleAt: new Date(Date.now() + 48 * 3600e3).toISOString(), injections: 0, rows: rows.slice(0, 3) }, null, 2), 'utf8')
              log(`deep sleep: 晨起摘要已生成（${Math.min(rows.length, 3)} 行）`)
            }
          } catch (e) { log(`deep sleep: 晨起摘要生成失败 ${String((e as Error)?.message || e).slice(0, 100)}`) }
        }
        // 子代理异常结束（stop=error/timeout/aborted）不算消化：回滚水位，同一批痕迹下轮可重试。
        // 2026-09-09 补缺：stop=completed 但 out=null（JSON 解析失败，如「Unexpected end of JSON input」实锤 ×2）
        // 同样不算消化——否则 done 分支推进水位，整批痕迹永久划出窗口（归纳结果整轮丢失）。
        return (stop === 'completed' && out) ? 'done' : 'failed'
      } catch (e) {
        clearTimeout(timeout)
        if (useProvider) providerFailCount++
        log(`deep sleep ERROR: ${String((e as Error)?.message || e).slice(0, 200)}`)
        audit({ kind: 'deep-sleep', error: String((e as Error)?.message || e).slice(0, 160) })
        return 'failed'
      }
    } catch (e) {
      log(`deep sleep err: ${String((e as Error)?.message || e).slice(0, 120)}`)
      return 'failed'
    }
  }

  /**
   * 输出增长探测（状态机 PROBING，加固版 2026-09-08）——**避免一次采样错判就把长任务睡掉**：
   *   ① 多轮采样：`deepSleepProbeSamples`（默认 3）轮 × `deepSleepProbeWindowMs`，任一轮检出增长即判长任务；
   *   ② 多信号交叉：转录 size/mtime 增长（主证据）+ 事件心跳（探测期间来事件即中止，回 RUNNING）
   *      + agent 存活 + agent.status 活跃态；状态活跃但无增长=**证据冲突**，不直接判卡住，转 suspect 复核；
   *   ③ 卡住需连续 `deepSleepProbeConfirm`（默认 2）轮确认，首轮落 **suspect**（阻塞睡眠，下轮巡检复核）；
   *   ④ 探针不可用/异常：内部重试 `deepSleepProbeRetries`（默认 2）次，仍失败才按「无法确认 → 正常睡」处理；
   *   ⑤ 总时长 `deepSleepProbeMaxMs` 兜底，防悬挂；停滞计时一律沿用 lastEventAt（不刷新成 now，否则永不睡）。
   */
  const probeSession = (rec: SessRec): void => {
    if (rec.state === 'probing') return
    rec.state = 'probing'
    rec.probeAt = Date.now()
    rec.probeRound = (rec.probeRound || 0) + 1
    const short = (rec.sid.startsWith('session-') ? rec.sid.slice(8, 16) : rec.sid.slice(0, 8))
    const samples = Math.max(1, Number(config.deepSleepProbeSamples) || 3)
    const confirm = Math.max(1, Number(config.deepSleepProbeConfirm) || 2)
    const retries = Math.max(1, Number(config.deepSleepProbeRetries) || 2)
    const windowMs = Math.max(5000, Number(config.deepSleepProbeWindowMs) || 60000)
    const maxMs = Math.max(windowMs * samples + 30000, Number(config.deepSleepProbeMaxMs) || 600000)
    const started = Date.now()
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const agentAlive = (): boolean => { try { return !!ctx.agents.get(rec.sid) } catch { return false } }
    const agentActive = (): boolean => { try { const a = ctx.agents.get(rec.sid); const s = a && a.status; return !!s && s !== 'idle' } catch { return false } }
    void (async () => {
      try {
        // ① 定位转录（失败重试 retries 次；期间若来新事件则中止）
        let file: string | null = null
        for (let i = 0; i < retries && !file; i++) {
          file = await locateTranscript(rec.sid)
          if (!file && i < retries - 1) await sleep(windowMs)
          if (rec.state !== 'probing') return // 新事件打断 → 交回状态机，不覆盖
        }
        if (!file) {
          rec.probeResult = 'no-transcript'
          rec.state = 'ended'
          rec.lastEndAt = rec.lastEventAt
          log(`deep sleep probe: ${short} 探针不可用（已重试 ${retries} 次）→ 无法确认为长任务，按停滞处理（正常睡眠）；请检查记忆仓 locate-transcript-probe 是否就位`)
          audit({ kind: 'deep-sleep-probe', sid: short, result: 'no-transcript', rounds: rec.probeRound, note: '探针不可用，无法确认长任务，按停滞处理' })
          return
        }
        // ② 多轮采样：任一轮 size/mtime 增长 → long-run
        const snap = (): { mtimeMs: number; size: number } | null => {
          try { const st = statSync(file as string); return { mtimeMs: st.mtimeMs, size: st.size } } catch { return null }
        }
        let prev = snap()
        let grew = false, delta = 0, rounds = 1
        for (let i = 1; i < samples; i++) {
          await sleep(windowMs)
          if (rec.state !== 'probing') return // 事件心跳：探测期间会话恢复活跃 → 中止
          if (Date.now() - started > maxMs) break
          const cur = snap()
          if (!cur) break
          if (prev && (cur.size !== prev.size || cur.mtimeMs > prev.mtimeMs)) { grew = true; delta = cur.size - prev.size; rounds = i + 1; break }
          prev = cur
          rounds = i + 1
        }
        if (rec.state !== 'probing') return
        if (grew) {
          rec.probeResult = 'long-run'
          rec.state = 'running'
          rec.lastEventAt = Date.now() // 唯一会刷新水位的分支（确认长任务，3h 后再复查）
          rec.stallRound = 0
          rec.probeEvidence = { rounds, samples, deltaBytes: delta, alive: true, active: true }
          log(`deep sleep probe: ${short} 第 ${rounds}/${samples} 轮检出输出增长（+${delta}B）→ 正常长任务，不睡`)
          audit({ kind: 'deep-sleep-probe', sid: short, result: 'long-run', deltaBytes: delta, rounds, samples })
          return
        }
        // ③ 无增长：二次确认存活（防瞬时查找失败误判 exit）
        const alive1 = agentAlive()
        if (!alive1) await sleep(3000)
        const alive = alive1 && agentAlive()
        const active = agentActive()
        rec.probeEvidence = { rounds, samples, deltaBytes: 0, alive, active }
        if (!alive) {
          rec.probeResult = 'exit'
          rec.state = 'ended'
          rec.lastEndAt = rec.lastEventAt
          log(`deep sleep probe: ${short} ${samples} 轮无增长且会话已消失（二次确认）→ 异常退出（正常睡眠）`)
          audit({ kind: 'deep-sleep-probe', sid: short, result: 'exit', rounds, samples, note: '会话已退出（二次确认）' })
          return
        }
        if (active) {
          // 证据冲突：状态说活跃但输出没长 → 不判卡住，转 suspect 复核（宁可多等一轮，不误判长任务）
          rec.state = 'suspect'
          rec.probeResult = 'conflict'
          log(`deep sleep probe: ${short} 无输出增长但 agent 状态活跃 → 证据冲突，转 suspect 下轮复核`)
          audit({ kind: 'deep-sleep-probe', sid: short, result: 'conflict', rounds, samples, note: '状态活跃但无输出增长，复核' })
          return
        }
        // ④ 卡住需连续 confirm 轮确认
        const sr = (rec.stallRound || 0) + 1
        rec.stallRound = sr
        if (sr >= confirm) {
          rec.probeResult = 'stall'
          rec.state = 'stalled'
          log(`deep sleep probe: ${short} 连续 ${sr}/${confirm} 轮无输出增长（会话仍在）→ 确认卡住，不阻塞睡眠（请人工确认）`)
          audit({ kind: 'deep-sleep-probe', sid: short, result: 'stall', rounds, samples, stallRound: sr, idleMin: Math.round((Date.now() - rec.lastEventAt) / 60000), note: '疑似卡住：连续无输出增长且会话未退出' })
        } else {
          rec.state = 'suspect'
          rec.probeResult = 'suspect'
          log(`deep sleep probe: ${short} 第 ${sr}/${confirm} 次无增长 → suspect，下轮巡检复核（期间阻塞睡眠）`)
          audit({ kind: 'deep-sleep-probe', sid: short, result: 'suspect', rounds, samples, stallRound: sr })
        }
      } catch (e) {
        rec.probeResult = 'error'
        rec.state = 'ended'
        rec.lastEndAt = rec.lastEventAt
        log(`deep sleep probe err ${short}: ${String((e as Error)?.message || e).slice(0, 120)} → 按停滞处理（正常睡眠）`)
        audit({ kind: 'deep-sleep-probe', sid: short, result: 'error', rounds: rec.probeRound, note: String((e as Error)?.message || e).slice(0, 120) })
      }
    })()
  }

  const deepSleepCheck = (): void => {
    if (!config.enableDeepSleep || deepSleepRunning) return
    const now = Date.now()
    const idleMs = Number(config.deepSleepIdleMs) || 10800000
    const probeAfter = Number(config.deepSleepProbeAfterMs) || idleMs
    let hottest = sessions.size ? 0 : lastActivityAt // 无在册会话时用全局兜底水位
    let probing = 0, stalled = 0, ended = 0, running = 0
    for (const [sid, rec] of sessions) {
      try { if (!ctx.agents.get(sid)) { sessions.delete(sid); continue } } catch { sessions.delete(sid); continue }
      // 子代理守卫（2026-09-10 实态修复）：子代理在跑 = 父会话仍在干活——直接视为 running 且刷新活动，
      // 既不发起"输出增长探测"（子代理写的是自己的转录，父转录不增长会被误判卡住），也不阻塞计数为停滞。
      if (hasActiveSubagents(sid)) { rec.state = 'running'; rec.lastEventAt = now; running++; continue }
      // 状态机推进：running 且无事件 ≥ probeAfter → 发起探测；suspect → 下轮巡检复核（卡住需连续确认）
      if (config.deepSleepProbe) {
        if (rec.state === 'running' && now - rec.lastEventAt >= probeAfter) probeSession(rec)
        else if (rec.state === 'suspect') probeSession(rec)
      }
      if (rec.state === 'probing' || rec.state === 'suspect') { probing++; continue } // 未决/待复核 → 阻塞本轮（不睡）
      if (rec.state === 'stalled') { stalled++; continue } // 已确认无输出 → 不阻塞睡眠
      if (rec.state === 'ended') ended++; else running++
      const act = rec.state === 'ended' ? rec.lastEndAt : rec.lastEventAt
      if (act > hottest) hottest = act
    }
    if (probing > 0) { log(`deep sleep: ${probing} 个会话探测未决，本轮跳过（保守不睡）`); return }
    if (now - hottest < idleMs) return
    if (hottest <= lastDeepSleepAt) return // 本轮停滞窗口已消化（新活动推进水位后重新武装）
    deepSleepRunning = true
    const prevDeepSleepAt = lastDeepSleepAt
    // 窗口起点必须在推进水位**之前**取：lastDeepSleepAt 一旦置为 now，traceSince() 会退化成
    // max(今日 0 点, now)=now，痕迹扫描窗口变成 [now, now] → 恒「本日无痕迹」（2026-09-09 实修）。
    const since = traceSince()
    lastDeepSleepAt = now
    log(`deep sleep: 触发（停滞 ${Math.round((now - hottest) / 60000)}min ≥ 阈值 ${Math.round(idleMs / 60000)}min · 会话态 running=${running} ended=${ended} stalled=${stalled}）`)
    runDeepSleep(since).then((r) => {
      // 水位语义：done（消化了材料）与 no-traces（确认无材料）都把窗口滑到当前——未来痕迹 mtime 必然
      // 更晚，不丢；只有 failed（有材料但没消化成，如 no-parent / 子代理异常）回滚，同一批下轮重试。
      // 这同时消解空转：无材料滑窗后 hottest ≤ 水位 → 后续巡检直接 return，不再每 10min 重触发。
      if (r === 'failed') { lastDeepSleepAt = prevDeepSleepAt; log('deep sleep: 本轮未消化（failed），水位回滚（同一批痕迹下轮可重试）') }
      else lastDeepSleepAt = now
    }).catch((e) => {
      lastDeepSleepAt = prevDeepSleepAt
      log(`deep sleep err: ${String((e as Error)?.message || e).slice(0, 120)}（水位回滚）`)
    }).finally(() => { deepSleepRunning = false })
  }

  /** 状态机快照——面板展示 / 手动触发（POST /deepsleep/trigger）/ 配置读写（/deepsleep/config）均读这里 */
  const getDeepSleepStatus = (): DeepSleepStatus => {
    let hottest = sessions.size ? 0 : lastActivityAt
    const list: DeepSleepStatus['sessions'] = []
    let running = 0, ended = 0, probing = 0, stalled = 0, suspect = 0
    for (const rec of sessions.values()) {
      if (rec.state === 'probing') probing++
      else if (rec.state === 'suspect') suspect++
      else if (rec.state === 'stalled') stalled++
      else if (rec.state === 'ended') ended++
      else running++
      if (rec.state !== 'stalled' && rec.state !== 'probing' && rec.state !== 'suspect') {
        const act = rec.state === 'ended' ? rec.lastEndAt : rec.lastEventAt
        if (act > hottest) hottest = act
      }
      list.push({ sid: (rec.sid.startsWith('session-') ? rec.sid.slice(8, 16) : rec.sid.slice(0, 8)), state: rec.state, lastEventAt: rec.lastEventAt, lastEndAt: rec.lastEndAt, probeResult: rec.probeResult })
    }
    return {
      enabled: !!config.enableDeepSleep,
      idleMs: Number(config.deepSleepIdleMs) || 10800000,
      probeAfterMs: Number(config.deepSleepProbeAfterMs) || (Number(config.deepSleepIdleMs) || 10800000),
      lastActivityAt: hottest,
      lastDeepSleepAt,
      running, ended, probing, suspect, stalled,
      nextEligibleAt: hottest + (Number(config.deepSleepIdleMs) || 10800000),
      sessions: list,
    }
  }

  /** 手动触发入口（T2 面板「立即归纳一次」）：复用 deepSleepRunning 并发守卫，避免与自动巡检重叠。 */
  const runDeepSleepNow = async (): Promise<{ ok: boolean; error?: string; result?: 'done' | 'failed' | 'no-traces' }> => {
    if (deepSleepRunning) return { ok: false, error: 'deep-sleep-already-running' }
    deepSleepRunning = true
    try {
      // 手动触发同样按上次水位取窗口；done（消化）/ no-traces（确认无材料）都推进水位防重复回想，failed 回滚
      const since = traceSince()
      const r = await runDeepSleep(since)
      if (r !== 'failed') lastDeepSleepAt = Date.now()
      return { ok: true, result: r }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e).slice(0, 160) }
    } finally {
      deepSleepRunning = false
    }
  }

  /** 运行中深度睡眠配置（T2 面板「可调」展示源；持久化经 ~/.dsh/suite/scheduler.json） */
  const getConfig = () => ({
    enableDeepSleep: !!config.enableDeepSleep,
    deepSleepIdleMs: Number(config.deepSleepIdleMs) || 10800000,
    deepSleepProbe: !!config.deepSleepProbe,
    deepSleepProbeAfterMs: Number(config.deepSleepProbeAfterMs) || (Number(config.deepSleepIdleMs) || 10800000),
    deepSleepProbeWindowMs: Number(config.deepSleepProbeWindowMs) || 60000,
  })

  // ── 事件订阅（effect 自动清理，reload 零泄漏）──
  const idleTimers = new Map<string, any>()
  const armIdleTimer = (agent: any): void => {
    rememberAgent(agent) // 深睡 parent 兜底缓存
    const sid = agent.id as string
    const old = idleTimers.get(sid)
    if (old) clearTimeout(old)
    const t = setTimeout(() => {
      idleTimers.delete(sid)
      distillAgent(agent).catch((e) => log(`distill agent err ${sidShort(sid)}: ${String((e as Error)?.message || e).slice(0, 120)}`))
    }, config.idleWakeMs)
    idleTimers.set(sid, t)
  }
  ctx.on('session/event', (session: any, event: any) => {
    try {
      if (!event || event.type !== 'turn/end') return
      const reason = event.data && event.data.reason
      if (reason && reason.kind && reason.kind !== 'completed') return
      const sid = session && session.id
      if (!sid) return
      const agent = ctx.agents.get(sid)
      if (!agent) return
      const origin = agent.session && agent.session.header && agent.session.header.origin
      if (origin === 'subagent') { // 子代理 turn/end = 父会话仍在干活（2026-09-10）：记子代活动+刷新父会话，不武装蒸馏
        const p = parentSidOf(agent)
        noteChildActivity(p, sid)
        if (p) noteEvent(p, false)
        return
      }
      noteEvent(sid, true) // 状态机：turn 完成 → ENDED（停滞计时起点）
      armIdleTimer(agent)
    } catch { /* 事件回调零抛出 */ }
  })
  ctx.on('agent/disposed', ({ agent }: any) => {
    try { const t = idleTimers.get(agent.id); if (t) { clearTimeout(t); idleTimers.delete(agent.id) } } catch { /* */ }
    try { dropChild(agent.id) } catch { /* */ } // 子代理出表：清其活动标记（防僵尸阻止蒸馏）
    try { sessions.delete(agent.id) } catch { /* */ }
  })
  ctx.on('session/disposed', (session: any) => {
    try { const sid = session && session.id; const t = idleTimers.get(sid); if (t) { clearTimeout(t); idleTimers.delete(sid) } } catch { /* */ }
    try { dropChild(session && session.id) } catch { /* */ }
    try { sessions.delete(session && session.id) } catch { /* */ }
  })
  // ═══ 路线④ 打扰度观察（shadow-first MVP）：打分/滞回/冷却/落影子日志，默认不做上下文注入 ═══
  // 设计（v5.2 §5 + §9④）：先攒 activation-shadow.jsonl 真实样本校准阈值（T_on/T_off 初值 0.62/0.52），
  // 校准满意后再由用户开 activationPrefetch 走 active（注入接线=后续档，非本 MVP）。
  const actShadowFile = join(kRoot, 'audit', 'activation-shadow.jsonl')
  const actState = new Map<string, { state: 'idle' | 'prefetch'; cooldown: number; prevScore: number }>()
  const actConf = {
    on: Number(config.activationTOn) || 0.65,
    off: Number(config.activationTOff) || 0.6,
    cooldown: Math.max(0, Number(config.activationCooldownSteps) || 3),
    topK: Math.min(5, Math.max(1, Number(config.activationTopK) || 3)),
  }
  // v6 向量政策：embed cfg 单一构造（取自 DistillConfig 可选字段，与 scheduler vec 通道同源；未配置=词法降级）
  const embedCfgOf = (): EmbedCfg => ({
    enabled: !!(config.embedEnabled && config.embedBaseUrl && config.embedModel),
    baseUrl: String(config.embedBaseUrl || ''),
    model: String(config.embedModel || ''),
    apiKeyEnv: String(config.embedApiKeyEnv || ''),
    // v7 召回降权系数（UI 可调：recallColdFactorPercent，% → /100；缺省 35% → 0.35）
    coldFactor: (Number(config.recallColdFactorPercent) > 0 ? Number(config.recallColdFactorPercent) : 35) / 100,
    // v2（ADR-122）：融合策略（缺省 RRF；scheduler 配置 recallFusion=weighted 可回滚）
    fusionKind: config.recallFusion === 'weighted' ? 'weighted' : 'rrf',
  })

  // 路线④ 打扰度观察（v6 向量政策 2026-09-10：打分改 recallRanked 融合召回——dense 主、lexical 稳；
  // sim 口径随 mode：fusion 的 score=0..100（已 min-max 归一）→ /100；lexical=命中数/tokens。阈值随影子样本再校准）
  const activationStep = async (sid: string, event: any): Promise<void> => {
    try {
      if (!event) return
      const d = event.data || {}
      // ACT-024（2026-09-11 结构性去污染，实测污染率 49.3%）：DSH 把**宿主注入块也作为 `user/message` 事件**下发
      // （系统提示快照 / 后台 job 与子代理回执 / 指令文件 / skill 目录），旧实现只按内容正则判 → 大量非用户文本
      // 进入影子样本（"Current runtime context…"、"Background subagent … finished"、"Agent <uuid> sent a message"）。
      // 判别改用**结构字段 `data.source.kind`**（真值域：user / plugin / agent-instructions / skill-catalog /
      // agent-message / subagent-settled …）：带源且非 `user` 一律丢弃；无 source 的旧格式/夹具事件走内容闸兜底。
      const srcKind = String((d.source && d.source.kind) || '')
      const arr = Array.isArray(d.content) ? d.content : []
      let text = ''
      for (const c of arr) if (c && c.type === 'text' && typeof c.text === 'string') text += c.text
      if (event.type !== 'user/message' || !text.trim()) return
      if (srcKind) { if (srcKind !== 'user') return } else if (isNoiseIntent(text.trim())) return
      const rres = await recallRanked(memoryLibRoot(), text, actConf.topK, 'all', embedCfgOf())
      const { rows, tokens } = rres
      if (!tokens.length && !rows.length) return
      // 相对分（旧口径）：融合召回**池内 min-max 归一化**后的分数
      const relSim = !rows.length ? 0
        : rres.mode === 'fusion' ? Math.min(1, (rows[0].score || 0) / 100)
        : Math.min(1, rows[0].score / (tokens.length || 1))
      // ACT-024（2026-09-11 重校准）：阈值量改为**绝对余弦**（用户文本 ↔ 命中索引行）。
      // 判因（实测 200 条干净样本）：相对分是池内归一化量，p50=0.770、p90=1.000 —— 现状阈值 0.62 会命中
      // 88.5% 的真实用户消息，**结构上不可标定**；绝对余弦则可分辨（真命中 0.62–0.73，噪声 0.38–0.45）。
      // embed 不可用/失败 → 退化回相对分（与旧行为一致，不误报）。
      const ecfg = embedCfgOf()
      let sim = relSim
      let metric = 'rel-fallback'
      if (rows.length && ecfg.enabled) {
        try {
          const c = await semanticSim(text, rows[0].line, ecfg)
          if (c !== null) { sim = Math.max(0, Math.min(1, c)); metric = 'abs-cos' }
        } catch { /* 失败保持回退 */ }
      }
      let st = actState.get(sid) || { state: 'idle', cooldown: 0, prevScore: 0 }
      const prev = st.state
      let emit = false
      if (st.cooldown > 0) st.cooldown--
      if (sim >= actConf.on && st.cooldown === 0 && st.state === 'idle') { st.state = 'prefetch'; emit = true; st.cooldown = actConf.cooldown }
      else if (sim < actConf.off && st.state !== 'idle') { st.state = 'idle' }
      st.prevScore = sim
      actState.set(sid, st)
      // 影子校准：每个有打分的 user 消息都落一行（跃迁/emit 也落）——样本分布是阈值校准原料，宁密勿稀
      try {
        mkdirSync(dirname(actShadowFile), { recursive: true })
        appendFileSync(actShadowFile, JSON.stringify({
          at: new Date().toISOString(), kind: 'activation-step', sid: sidShort(sid), rmode: rres.mode, mode: config.activationPrefetch ? 'prefetch-armed' : 'shadow',
          src: srcKind || 'unknown', // ACT-024：采样源（应为 user；旧格式行无此字段）——供校准与污染复盘
          metric, rel: Number(relSim.toFixed(3)), // ACT-024：判据量（abs-cos 为现行）；rel 留档旧口径便于对照
          state: st.state, prev, sim: Number(sim.toFixed(3)), tOn: actConf.on, tOff: actConf.off,
          emit, tokens: tokens.length, hit: rows.length ? rows[0].line.slice(0, 120) : '',
          pointers: rows.slice(0, 2).map((r) => r.pointer), excerpt: text.slice(0, 60),
        }) + '\n', 'utf8')
      } catch { /* 影子日志失败静默 */ }
    } catch { /* 观察零抛出 */ }
  }

  // ═══ 积压扫尾（2026-09-10 用户拍板：稳健性修复——旧 ctx 失败/重启/错过空闲窗的会话自动补蒸馏）═══
  // 候选：**当前 ctx 根内（live）**的会话、水位<内存末事件 seq、且已出「10min 宽限期」（避免与 idle 定时器抢跑/打断用户续聊）。
  // ⚠ 覆盖边界（2026-09-11 审查修正注释）：root 之外/重启前已结束且**未被重新载入**的会话不在本链覆盖内——
  //   旧注释「重启前已结束的一律补」与现码不符；真要补需会话重新载入，或另立持久会话清单（本档未实现）。
  const sweepBacklog = async (): Promise<void> => {
    try {
      // 先回流 pending defer 卡（workspace 恢复后直写 devref；周期扫尾也覆盖）
      try { await flushDeferCards() } catch { /* 回流失败不阻断扫尾 */ }
      const roots = (ctx.agents && typeof ctx.agents.roots === 'function') ? ctx.agents.roots() : []
      for (const a of roots) {
        try {
          if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function') continue
          const origin = a.session && a.session.header && a.session.header.origin
          if (origin === 'subagent') continue
          const sid = a.id
          if (hasActiveSubagents(sid)) continue // 子代理在跑：任务未完，扫尾勿抢蒸（2026-09-10）
          if (distilling.has(sid)) continue
          const rec = sessions.get(sid)
          if (rec) {
            if (rec.state === 'running' || rec.state === 'probing' || rec.state === 'suspect') continue
            if (rec.lastEndAt && Date.now() - rec.lastEndAt < config.idleWakeMs) continue // 仍在宽限期，等 idle 定时器
          }
          // v19：水位走同一双证校验（resolveWatermark）——失效时由 discardWatermark 从当前边界续写并落审计，
          // 扫尾与 idle 通路口径一致（单一实现，勿在此另写判定）；快照取一次供增量比对与后续蒸馏复用。
          const base = resolveWatermark(sid, a)
          const lastSeq = base ? base.lastSeq : 0
          const sweepEvents: any[] = a.session.snapshotEvents()
          let maxSeq = lastSeq
          for (const e of sweepEvents) { const s = (e as any).seq ?? 0; if (s > lastSeq && s > maxSeq) maxSeq = s }
          if (maxSeq > lastSeq) {
            // 跨实例 claim 锁（2026-09-10 实锤：重叠 fiber 的 30s 首扫会同时抢同一积压窗口 → 471aca03 被双蒸馏双写）：
            // 在途 claim（25min 内）→ 跳过；过期 claim → 覆盖重试；无增量时顺手清理陈旧 claim。
            // A3：claim 判定已统一到 distillAgent 入口（幂等写入 / 结束释放）——扫尾只做**只读**让位判定，
            //     不再自己写 claim（否则与入口刚写入的 claim 互斥，补蒸馏将永不发生）。
            if (claimHeld(sid)) { continue } // 在途，其他 fiber 已接管
            log(`sweep: ${sidShort(sid)} 水位 ${lastSeq}→${maxSeq} 有未消化增量，补蒸馏`)
            void distillAgent(a).catch(() => { /* distillAgent 内部已兜底 */ })
          } else {
            try { unlinkSync(join(kRoot, 'audit', 'claims', sid + '.json')) } catch { /* 无 claim 可清 */ }
          }
        } catch { /* 单会话扫尾失败静默 */ }
      }
    } catch { /* 扫尾零抛出 */ }
  }

  // 状态机活跃信号：**任意**根会话事件 → RUNNING（长任务持续产生 chunk/tool 事件即持续刷新水位）
  ctx.on('session/event', (session: any, event: any) => {
    try {
      const sid = session && session.id
      if (!sid) return
      const a = ctx.agents.get(sid)
      if (!a) return
      const origin = a.session && a.session.header && a.session.header.origin
      if (origin === 'subagent') { // 子代理任意事件 = 父会话任务仍在推进（2026-09-10）：记子代活动+刷新父会话活动
        const p = parentSidOf(a)
        noteChildActivity(p, sid)
        if (p) noteEvent(p, false)
        return
      }
      noteEvent(sid, false)
      rememberAgent(a) // 深睡 parent 兜底缓存（任意根会话事件都刷新）
      if (config.activationShadow !== false || config.activationPrefetch) void activationStep(sid, event) // 路线④：影子默认开；prefetch 置位后决策通路照走（影子行 mode 区分），实际注入仍待影子校准（后续档）
    } catch { /* 状态迁移零抛出 */ }
  })
  ctx.effect(() => {
    const t = setTimeout(() => {
      try {
        const roots = ctx.agents.roots()
        log(`distill 启动（守藏蒸馏器 · idleWake ${Math.round(config.idleWakeMs / 60000)}min · adopt roots=${roots.length} · 数据区 ${kRoot}）`)
        validateProvider()
      } catch (e) { log(`adopt err: ${String((e as Error)?.message || e).slice(0, 120)}`) }
    }, 2000)
    return () => clearTimeout(t)
  }, SHORT + ': distill adopt')

  // 深度睡眠巡检定时器（10min 一查；effect 清理，reload 零泄漏）
  ctx.effect(() => {
    const probeOk = existsSync(probeScriptPath)
    log(`deep sleep 巡检启动（enable=${config.enableDeepSleep} · 停滞阈值 ${Math.round((Number(config.deepSleepIdleMs) || 10800000) / 60000)}min · 探测 ${config.deepSleepProbe ? '开' : '关'}${config.deepSleepProbe ? `（无事件 ${Math.round((Number(config.deepSleepProbeAfterMs) || 10800000) / 60000)}min 后发起，探针${probeOk ? '就位' : '缺失→无法确认即正常睡'}）` : ''}）`)
    const iv = setInterval(() => { try { deepSleepCheck() } catch { /* 巡检零抛出 */ } }, DEEP_SLEEP_CHECK_MS)
    return () => clearInterval(iv)
  }, SHORT + ': deep-sleep check')

  // ═══ 蒸馏器清理（reload/ctx dispose 零泄漏）：清空遗留 idle 定时器——旧 fiber 定时器在 ctx 失效后触发
  // 正是「cannot get required service subagents in inactive context」报错的根源（2026-09-10 修复）═══
  ctx.effect(() => {
    return () => {
      try { for (const [, t] of idleTimers) clearTimeout(t) } catch { /* */ }
      try { idleTimers.clear() } catch { /* */ }
      try { distilling.clear() } catch { /* */ }
    }
  }, SHORT + ': distill cleanup')

  // 积压扫尾定时器：启动 30s 首扫（覆盖重载/重启前错过窗口、仍在内存的会话）+ 每 10min 周期扫
  ctx.effect(() => {
    const run = (): void => { try { void sweepBacklog() } catch { /* 扫尾零抛出 */ } }
    const t0 = setTimeout(run, 30000)
    const iv = setInterval(run, DEEP_SLEEP_CHECK_MS)
    return () => { clearTimeout(t0); clearInterval(iv) }
  }, SHORT + ': distill sweep')

  // ── 手动蒸馏触发（2026-09-10：pending 回流闭环——参数调节「立即处理 pending」调此）──
  const runDistillNow = async (): Promise<{ ok: boolean; sessions: number; note?: string }> => {
    try {
      // 先回流 pending defer 卡（workspace 恢复后直写 devref，不等 LLM 重裁决）
      const fl = await flushDeferCards()
      const roots = (ctx.agents && typeof ctx.agents.roots === 'function') ? ctx.agents.roots() : []
      let n = 0
      for (const a of roots) {
        try {
          if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function') continue
          const origin = a.session && a.session.header && a.session.header.origin
          if (origin === 'subagent') continue
          if (distilling.has(a.id)) continue
          await distillAgent(a).catch(() => { /* 单会话失败不阻断 */ })
          n++
        } catch { /* 单会话跳过 */ }
      }
      const flNote = fl.written ? `（defer 回流 ${fl.written} 张卡${fl.kept ? `，保留 ${fl.kept}` : ''}）` : (fl.kept ? `（defer 待认领 ${fl.kept}：workspace 仍不可解）` : '')
      return { ok: true, sessions: n, note: `蒸馏 ${n} 个根会话${flNote}` }
    } catch (e) {
      return { ok: false, sessions: 0, note: String((e as Error)?.message || e).slice(0, 120) }
    }
  }

  return { getDeepSleepStatus, runDeepSleepNow, getConfig, runDistillNow }
}
