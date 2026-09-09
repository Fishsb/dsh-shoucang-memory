/**
 * distill.ts — ADR-0002 阶段 2：蒸馏器（自记忆插件 index.ts 迁入，写入分发重接 targets.ts）。
 *
 * 事件链（ADR-0004 模式）：ctx.on('session/event') turn/end(completed) 且 root agent → per-agent idle 定时器
 *   → 到点且 agent idle → 内存增量（snapshotEvents 水位后）→ 预筛（信号词 + pending 候选；皆无则跳过不唤醒）
 *   → spawn 蒸馏子代理（maxDepth=1，10min 超时 race）→ 结构化 JSON（route=memory|project|discard）
 *   → targets.ts 动态路由 + 白名单门禁（不符合不存）→ 零拷贝写入（memory-append；R3 项目事实直写 workspace devref）
 *   → 水位推进（suite/knowledge/audit/distill-watermark.jsonl）→ 蒸馏审计（distill-audit.jsonl，UI 统计卡数据源）。
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
  dshHome, knowledgeRoot, memoryLibRoot, memorySkillPresent, resolveTarget, loadWhitelist, gateMemoryAppend, recallIndex,
  type Whitelist, type RouteTarget,
} from './targets.js'
import { recallRanked, semanticSim, type EmbedCfg } from './vec.js'
import { activityAggregate } from './activity.js'

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

// ── 蒸馏裁决契约 v5（v4 单库化之上，2026-09-10 WikiSkill 借鉴：失败即知识 + 教训带适用边界）──
// v4 变更：取消「记忆库 vs 项目卡库」粒度二分——跨项目有用的细粒度条文也进 notes；项目专属事实直写项目工作区 devref；
//          新增 profiles 双画像通道（用户画像 USER + Agent 自我画像 AGENT，Q2「归谁」的落地写入通道）。
// v5 变更：appends 条目可选 rootCause/avoidWhen——教训/踩坑类浓缩附 WHY 根因与「不适用」场景（对标 WikiSkill pattern
//          双记 + SKILL.md When NOT to Apply），宿主写入时追加「- 根因：…」「- 不适用：…」两行；其余字段语义兼容 v4。
export const DEFAULT_DISTILL_PROMPT = `你是知识整理蒸馏子代理（守藏契约 v5）。任务：从给定会话增量正文中，判定每条可复用知识的归属（第一层路由），再输出结构化入册指令（由宿主执行写入，你无需也不能直接写文件/跑命令）。
判定锚（v4 单库）：只有一个记忆库——notes 存「下次做类似任务时给 agent 的方向」与跨项目有用的事实；项目专属事实不属于全局库，直写项目工作区。
第一层归属路由（对每条候选按序判定）：
- R1 泛化方向指引？这条知识的作用=下次做类似任务给大概方向？→ route=memory（粗粒度是特性，不要把细节条文塞进记忆库）
- R2 官方规范/平台规则/工具用法等**跨项目有用**的细粒度条文 → route=memory（归 notes/tools 或 notes/lessons，教程式浓缩）
- R3 某项目专属事实（项目结构/该项目用户拍板的决策/项目契约踩坑，只在单一项目语境有用）→ route=project（宿主直写该项目工作区 docs/devref/shoucang/）
- R4 其余（一次性进度/可搜索公开知识/无实质/<relevant-memories>注入缓存/重复已有归属）→ route=discard
- 同一条既像 R1/R2 又像 R3：跨项目可复用→memory；只在单一项目成立→project。既不跨项目也不属于当前会话项目→丢弃。
- 拿不准 → route=memory 但 appends 留空记 skipped（宁缺毋滥）。
route=memory 时续走四问：Q0 已有归属？Q1 下周用得上？Q2 归谁（notes 记忆 / USER 用户画像 / AGENT 自我画像）？Q3 能合并？
Q2 画像判定：**用户的稳定偏好/背景/禁忌**（非一次性需求）→ profiles target=USER；**agent 自身的稳定做法/能力边界/常犯错误教训**（可跨任务复用的自我认知）→ profiles target=AGENT；一般知识→appends。
委派禁令：**独立完成，绝不 spawn/委派任何子代理**（查重凭给定正文与你自身知识判断）。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"route":"memory","appends":[{"target":"notes/tools.md","section":"<既有 ## 小节名>","text":"教程式浓缩：目标一句+编号步骤+注意，≤120字"}],"newIndex":[{"target":"MEMORY.md","line":"[tag] 主题 · 概况短语/短语/短语 → notes/x.md §小节"}],"profiles":[{"target":"USER|AGENT","section":"≤12字小节名","text":"≤80字一句话"}],"projectCards":[{"cardType":"how-to|reference|decision","title":"≤20字","text":"≤200字","source":"≤30字"}],"skipped":[{"title":"...","reason":"≤30字"}]}
约束：route=memory → 填 appends/newIndex（target 白名单 notes/tools.md notes/flows.md notes/lessons.md notes/env.md notes/release.md；section 必须既有 ## 小节名；**text 教程式三段**「目标：… 1. … 2. … 注意：…」只写方向指引级浓缩——目标形态/步骤轮廓/关键注意点，不搬细节条文，纯事实类可省步骤保留目标行；**newIndex.line 格式权威=记忆库 spec §8**：[tag] 主题 · 概况短语/短语/短语 → notes/<file>.md §小节，定界符 ·=段界 /=短语界 →=指针，主题≤12字名词性禁冒号复合，概况名词短语 / 分隔、≤30字、高判别实词（专名/数值/路径关键词）、禁日期溯源），profiles/projectCards 留空；profiles 仅在 route=memory 时可填（0-2 条，宁缺毋滥，须是稳定画像而非一次性事实）；route=project → 填 projectCards（cardType: how-to=操作步骤/reference=契约事实/decision=架构决策），其余留空；route=discard → 除 skipped 全空；与 route 不匹配的条目宿主拒收。教训/踩坑类（notes/lessons.md 或 [lesson] 语境）可在 appends 条目附可选 rootCause/avoidWhen（各 ≤30 字，v5）——宿主写入时自动追加「- 根因：…」「- 不适用：…」两行，让教训带 WHY 与不适用条件（对标 WikiSkill pattern 双记 + When NOT to Apply），其余条目省略。`

// ── 深度睡眠归纳契约（v17：习得原则与通用任务路径 [路径] 并入 agent 画像 AGENT.md；成败信号入材料；睡眠=agent 的反思进化迭代——认识自己也认识用户）──
// v17.2（2026-09-10 用户拍板 v6）：新增 pointerOps 通道——索引指针自动维护（扩容概况/重构指针 §/去重留优），只允许 update 不增删（新增=蒸馏 newIndex 唯一性硬门）。
export const DEEP_SLEEP_PROMPT = `你是深度睡眠归纳子代理（守藏记忆·agent 画像成长引擎，audit-protocol §5）。任务：像人睡前回想当天经历一样，回顾给定「当天记忆痕迹」——**反思三通道：认识自己（提炼习得原则写入 AGENT.md）+ 认识用户（更新用户画像 USER.md）+ 沉淀通用任务路径（[路径] 行写入 AGENT.md，对标 AWM）**，仅认识自己或认识用户其一即反思不完整。原则=多条经验反复提纯凝成的跨任务泛化指引（巩固记忆；主动遗忘=提纯下放，不是删除）；路径=可复用任务类型的步骤序列（具体值必须变量化）。
判定规则：
- **原则判据**：同主题 ≥3 条痕迹，或单主题当日反复命中 → 提炼 1 条原则；支撑不足的一律不提炼（路径判据见下，二者区分勿混）。
- 原则=一句方向指引（对齐 R1 粒度锚：目标形态/步骤轮廓/关键注意点），不搬细节条文。
- **路径判据**：同一任务类型在窗口内出现 ≥2 次（痕迹/运行统计可见重复模式）→ 归纳 1 条路径；候选区若含「成功次数 ≥2 且跨会话 ≥2」的任务候选 = 已达转正门槛（memory-core-model §4），直接归纳为 [路径]；**只归纳成功走通的任务**，失败任务只进原则教训（AWM：只从成功学）。
- 路径行格式：\`[路径] <任务类型 ≤10 字> · <步骤概要 ≤40 字，用 ①②③ 串联> → notes/flows.md §小节\`；**具体值必须变量化**（如 <项目名>/<端口>/<文件名>——不抽象=过拟合单例）。
- 材料若含「窗口内任务运行统计」：先做成败对比（ExpeL 式）——异常集中出现的环节才是真因所在；对比结论仍受跨工作区红线约束，不得把单项目细节写成原则/路径。
- 源指针只能指向给定痕迹中真实出现过的 notes/<file>.md §小节（1-2 个小节）；行格式严格为（AGENT.md 索引行格式，概况段即原则一句或路径概要）：\`[原则] <主题 · 一句泛化> → notes/<file>.md §小节A/§小节B\`（主题 ≤12 字、概况 ≤30 字、禁日期戳）或 \`[路径]\`（格式见上，概要 ≤40 字）
- **跨工作区红线**：记忆库是全局单库，痕迹可能来自多个工作区，而原则会常驻注入到**所有**工作区会话。含项目专名/具体路径/版本号/一次性事实的经验一律不提炼（skipped 注明「项目专属」）；只在单一项目语境成立的结论同样不提炼——宁缺毋滥，误注入比漏提炼危害大。
- pending 内容尚未入册 notes 的，不得作为源指针（仅作背景理解）；找不到 notes 锚点就不提炼（宁缺毋滥）。
- 与既有原则/路径冲突时用 replace（match=既有行原文，须逐字来自给定「现行原则/路径」清单）；否则 add。
- **v5.4 树状纪律**：notes 小节的**结构生长（分裂新子节）由事件蒸馏自动完成**（写侧按内容量归并 vs 分裂 ###）；你**不新建/不合并 notes 小节**（深睡聚焦画像/原则/路径提炼，树形整编——合并冗余子节/降级冷枝——在树出现冗余后由后续整编步骤做，本契约不改 JSON 结构）。源指针仍指向真实存在的 §小节（含子节路径如 §父节/子节 若材料中已存在）。
- 独立完成：不 spawn 子代理、不使用任何工具，只依据给定材料。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"principles":[{"action":"add","text":"[原则] 排障先看根因 · 先验证成本低再修改成本高 → notes/lessons.md §A/§B"},{"action":"add","text":"[路径] DSH 插件升级 · ①提交推送 ②cp 覆盖 lib ③sc restart ④四端点 200 → notes/flows.md §升级"},{"action":"replace","match":"[原则] 既有原则原文行","text":"[原则] ... → notes/tools.md §C"}],"profileOps":[{"target":"USER.md","action":"add","section":"沟通偏好","text":"- ... ← 源: notes/lessons.md §A"}],"pointerOps":[{"target":"MEMORY.md","action":"update","match":"[lesson] 网络坑 · 旧概况短语 → notes/lessons.md §网络坑","line":"[lesson] 网络坑 · 新概况短语 → notes/lessons.md §网络坑"}],"skipped":[{"title":"...","reason":"≤30字"}]}
无足够素材 → {"principles":[],"profileOps":[],"pointerOps":[],"skipped":[]}。

双画像巩固（反思的另一通道=认识用户；与原则同判据、同红线）：
- 回顾给定「现行画像」（USER=用户画像 / AGENT=你的自我画像）与当天痕迹，若发现：**用户跨任务稳定的偏好/背景/禁忌**（非一次性需求）→ profileOps target=USER.md；**你自身反复出现的稳定做法/能力边界/常犯错误教训**（可跨任务复用的自我认知）→ target=AGENT.md。
- 每条必须带 notes 源指针（行内 \`← 源: notes/<file>.md §小节\`），无锚不提炼；与既有画像行冲突用 replace（match=既有行原文，须逐字来自给定现行画像）；宁缺毋滥。
索引指针自动维护（v6：只允许 pointerOps update 原地替换整行，**禁止新增/删除索引行**——新增归蒸馏 newIndex 且已有唯一性硬门；删除归审计裁决）：
- 扩容：小节正文显著增补 / 概况过时 / 主题出现新要点 → update 只刷新概况短语（保 标签/主题/指针 指向；概况 ≤30 字名词短语）。
- 重构：小节改名/合并导致指针 § 失效或漂移 → update 指针 §（概况如需一并刷新）。
- 去重：现行清单中同 标签+主题 出现两行 → 保留信息更全/命中更高者，update 被留行合并概况（绝不双写）。
- match 一律逐字取自「现行画像 / 现行知识索引」清单；无锚不 update，拿不准不动。`

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
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
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
} {
  const SHORT = 'shoucang-scheduler'
  const logFile = join(dshHome(), 'super-injector', SHORT + '.log')
  const kRoot = knowledgeRoot()
  const watermarkFile = join(kRoot, 'audit', 'distill-watermark.jsonl')
  const auditFile = join(kRoot, 'audit', 'distill-audit.jsonl')
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
  const ensureFlowCandidate = async (sid: string, intent: string): Promise<void> => {
    if (!intent || intent.length < 8) return
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
        // 跨会话计数：源会话不重复追加；会话集合数=跨会话信号（供深睡「同类型 ≥2 次且跨会话」判据）
        const sids = [...new Set([...(body.match(/^- 源会话：(.+)$/gm) || []).map((l) => l.replace(/^- 源会话：/, '').trim()), sid])]
        const n = sids.length
        const out = body
          .replace(/- 源会话：[^\n]*(\n|$)/g, '')
          .replace(/- 成功次数：[^\n]*\n/, '')
          .replace(/- 跨会话：[^\n]*\n/, '')
        const newBody = `${out.trim()}\n- 成功次数：${n}\n- 跨会话：${n}（${sids.slice(-4).join(', ')}${sids.length > 4 ? '…' : ''}）\n- 最近更新：${day}\n`
        writeFileSync(fp, newBody, 'utf8')
        return
      }
      let hash = 0
      for (const c of intent) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
      const f = join(candidateDir, `${day}-${hash.toString(36).slice(0, 6)}.md`)
      writeFileSync(f, `# 任务候选（低置信 · 跨窗口记忆）\n\n- 类型线索：${intent}\n- 源会话：${sid}\n- 成功次数：1\n- 跨会话：1\n- 状态：候选（非源指针；仅供深睡跨窗口同型判断——同类成功 ≥2 且跨会话 ≥2 由深睡归纳为 [路径]）\n`, 'utf8')
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
  const writeWatermark = (sessionId: string, lastSeq: number): void => {
    try { mkdirSync(dirname(watermarkFile), { recursive: true }); appendFileSync(watermarkFile, JSON.stringify({ sessionId, lastSeq, at: new Date().toISOString() }) + '\n', 'utf8') } catch { /* 静默 */ }
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

  const extractDelta = (agent: any, lastSeq: number): { maxSeq: number; text: string } => {
    const events = agent.session.snapshotEvents()
    let maxSeq = lastSeq
    const parts: string[] = []
    for (const e of events) {
      const seq = (e as any).seq ?? 0
      if (seq <= lastSeq) continue
      if (seq > maxSeq) maxSeq = seq
      if (e.type === 'user/message') {
        const d = (e as any).data || {}
        const arr = Array.isArray(d.content) ? d.content : []
        for (const c of arr) if (c && c.type === 'text' && typeof c.text === 'string') parts.push('[user] ' + c.text.slice(0, 2000))
      } else if (e.type === 'assistant/chunk') {
        const c = (e as any).data && (e as any).data.chunk
        if (c && c.type === 'block-end' && c.block && c.block.type === 'text' && typeof c.block.text === 'string') {
          parts.push('[assistant] ' + c.block.text.slice(0, 3000))
        }
      }
    }
    return { maxSeq, text: parts.join('\n').slice(0, 24000) }
  }

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
    // 路径已定位但正则不匹配（如 _no-cwd 会话）属永久无归属，重试无意义，直接返回 null 走 writeDispatch 降级链。
    // 2026-09-09 实态审计：曾出现 route=project 整批 6 连拒、reason=workspace 反解失败——
    // 同会话稍后探针即可定位，属触发时刻瞬态而非永久无归属。
    for (let attempt = 1; attempt <= 3; attempt++) {
      let file: string | null = null
      try { file = await locateTranscript(sid) } catch { file = null }
      if (file) {
        const m = file.match(/sessions[\\/]+(--.+?--)[\\/]/)
        if (m) {
          const ws = m[1].slice(2, -2).replace(/--/g, '\\').replace(/~0040/g, '@')
          if (/^[A-Za-z]:/.test(ws)) return ws
        }
        return null // 已定位但无 workspace 归属：永久，不重试
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500))
    }
    return null
  }

  // ── 写入分发（ADR-0002 核心：动态路由 + 白名单门禁 + 零拷贝写入 + 审计）──
  const memAppend = async (target: string, kind: 'append' | 'new', payload: string, section: string, t: RouteTarget): Promise<RunResult> => {
    const script = join(memoryLibRoot(), 'scripts', 'memory-append.mjs')
    const args = kind === 'append' ? [target, section, payload] : [target, '-', '--new', payload]
    return runNode(config.nodeBin, script, args, { env: { MEMORY_ROOT: t.root, SHOUCANG_CAP_MEMORY: String(config.capMemory ?? 3000), SHOUCANG_CAP_USER: String(config.capUser ?? 2000), SHOUCANG_CAP_AGENT: String(config.capAgent ?? 3000) }, timeout: 20000 })
  }

  // ── 双画像维护（2026-09-08 用户拍板：蒸馏/睡眠不只补记忆，还更新 USER/AGENT 双画像——助理角色要有自我认知）
  //    v16：AGENT.md 升格为「成长型自我画像」（含 [原则] 习得原则），容量 2,000→3,000 ──
  const PROFILE_CAP = 3000
  const PROFILE_HEADER: Record<string, string> = {
    'USER.md': '# USER.md — 用户画像\n\n> 「人」的画像：用户稳定偏好/背景/禁忌。库中唯一直接关于用户的文件；其余（notes/原则/索引/AGENT.md）皆为 agent 自身资产。写入口=蒸馏 profileUpdates + 深度睡眠 profileOps；每行带源指针。',
    'AGENT.md': '# AGENT.md — Agent 自我画像（助理的成长档案）\n\n> 用户助理角色的自我认知：角色定位/稳定做法/能力边界/常犯错误与教训/[原则] 习得原则（深度睡眠归纳内化，v16）。库中其余一切（notes/索引）都是本 agent 为履行助理职责而积累的自身资产，本文件只回答「我是谁、我学到了什么、我怎样服务好用户」。写入口=蒸馏 profileUpdates + 深度睡眠（原则行 + profileOps）；每行带源指针。',
  }
  /**
   * 画像行写入（宿主直写，tmp+rename 原子）：小节存在→小节尾加行；不存在→文件尾建小节。
   * 门禁：target 仅 USER.md/AGENT.md、小节名防注入、单行 ≤160 字符、库容量 ≤2,000、去重、replace 须 match 逐字存在。
   */
  const writeProfileLine = (root: string, target: string, section: string, line: string, replaceMatch?: string): 'added' | 'dedup' | 'rejected' | 'failed' => {
    try {
      if (target !== 'USER.md' && target !== 'AGENT.md') return 'rejected'
      const sec = String(section || '').trim().replace(/^##+ */, '').trim()
      const ln = String(line || '').trim()
      if (!sec || !ln || ln.length > 160 || /[#`]/.test(sec)) return 'rejected'
      const file = join(root, target)
      let body = ''
      try { body = readFileSync(file, 'utf8') } catch { body = (PROFILE_HEADER[target] || `# ${target}\n`) + '\n' }
      if (body.split('\n').some((l) => l.trim() === ln)) return 'dedup'
      if (body.length + ln.length + sec.length + 8 > PROFILE_CAP) return 'rejected' // 容量门：超限拒绝，待画像间合并
      const lines = body.split('\n')
      const secIdx = lines.findIndex((l) => l.trim() === `## ${sec}`)
      if (secIdx < 0) lines.push('', `## ${sec}`, ln)
      else if (replaceMatch) {
        const mi = lines.findIndex((l) => l.trim() === String(replaceMatch).trim())
        if (mi < 0) return 'rejected' // replace 要求 match 逐字存在（防误改）
        lines[mi] = ln
      } else {
        let end = secIdx + 1
        while (end < lines.length && !lines[end].startsWith('## ')) end++
        lines.splice(end, 0, ln)
      }
      const tmp = file + '.tmp'
      writeFileSync(tmp, lines.join('\n'), 'utf8')
      renameSync(tmp, file)
      return 'added'
    } catch { return 'failed' }
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
        if (r.status === 0) added++; else { failed++; log(`distill 新索引失败: ${textOf(r).slice(0, 120)}`) }
      }
      // 双画像：Q2「归谁」的 USER/AGENT 通道（宿主直写，格式/容量/去重门禁）
      const profiles = (out && Array.isArray(out.profiles)) ? out.profiles : []
      const date = new Date().toISOString().slice(0, 10)
      for (const p of profiles) {
        if (!p || !p.target || !p.section || !p.text) { failed++; continue }
        const r = writeProfileLine(resolved.root, String(p.target).trim(), String(p.section), `- ${String(p.text).trim()} ← 源: distill ${sidShort(sid)} ${date}`)
        if (r === 'added') added++
        else if (r === 'rejected') { rejected++; audit({ sid, kind: 'gate-reject', target: p.target, reason: '画像更新被拒（格式/容量门）' }) }
        else if (r === 'failed') failed++
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
      for (const pc of cards) {
        if (!pc || !pc.title || !pc.text) { failed++; continue }
        const cardType = cardTypes.includes(String(pc.cardType || '')) ? String(pc.cardType) : 'reference'
        if (!cardTypes.includes(String(pc.cardType || ''))) { rejected++; audit({ sid, kind: 'gate-reject', target: pc.title, reason: `cardType=${pc.cardType} 不在 [${cardTypes.join(',')}]` }); continue }
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

  const distillAgent = async (agent: any): Promise<void> => {
    const sid = agent.id as string
    if (distilling.has(sid)) return // 并发守卫：蒸馏在途（最长 10min）内再触发直接跳过（防双写/竞态）
    if (agent.status && agent.status !== 'idle') { log(`distill: ${sidShort(sid)} 已恢复活跃（status=${agent.status}），跳过`); return }
    distilling.add(sid)
    try {
      validateProvider()
      const wm = readWatermarks().get(sid)
      const lastSeq = wm ? (wm.lastSeq || 0) : 0
      const { maxSeq, text: deltaText } = extractDelta(agent, lastSeq)
      let candFiles: string[] = []
      try { candFiles = readdirSync(pendDir).filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(f)).sort() } catch { candFiles = [] }
      if (!deltaText || deltaText.length < (config.minTurnChars ?? 200)) {
        writeWatermark(sid, maxSeq)
        // 跳过也留审计痕（观测盲区修复 2026-09-09：此前门槛/预筛跳过只进日志，审计里只见真实 run，
        // 「蒸馏为什么没跑」无法从数据区分——是没触发还是被挡）
        audit({ sid, kind: 'distill-skip', reason: 'below-min-chars', fclass: 'below-min', chars: deltaText.length })
        log(`distill: ${sidShort(sid)} 增量 ${deltaText.length} 字符 < 门槛，水位推进 ${lastSeq}→${maxSeq}（不蒸馏）`)
        return
      }
      if (config.distillPrescan !== false) {
        // 2026-09-10 用户拍板：大段增量强制蒸馏——信息密集但无信号词的会话（如研究/工具流）不再被预筛整段丢弃
        const prescanMin = Number(config.prescanMinChars) > 0 ? Number(config.prescanMinChars) : 4000
        const bigDelta = deltaText.length >= prescanMin
        const hasSig = bigDelta || hasDistillSignals(deltaText)
        if (!hasSig && candFiles.length === 0) {
          writeWatermark(sid, maxSeq)
          audit({ sid, kind: 'distill-skip', reason: 'prescan-no-signal', fclass: 'prescan-no-signal', chars: deltaText.length })
          log(`distill: ${sidShort(sid)} 预筛跳过（增量 ${deltaText.length} 字符无信号词 & pending 无候选），水位推进 ${lastSeq}→${maxSeq}`)
          return
        }
        log(`distill: ${sidShort(sid)} 预筛通过（信号词=${hasSig}${bigDelta ? `，大段 ${deltaText.length}≥${prescanMin} 强制蒸馏` : ''}，pending 候选=${candFiles.length}），进入蒸馏`)
      }
      // 候选按文件粒度装填：预算内进 prompt，放不下的整文件留 pending 下轮（防截断外候选被整批归档丢失知识）
      const CAND_BUDGET = 12000
      const candIncluded: string[] = []
      let candBudget = CAND_BUDGET
      const candText = candFiles.map((f) => {
        let body = ''
        try { body = readFileSync(join(pendDir, f), 'utf8') } catch { return '' }
        const chunk = `### 源 ${f}\n${body}`
        if (chunk.length > candBudget) return '' // 本文件装不下：不进本轮，保留 pending
        candBudget -= chunk.length + 1 // +1 join('\n') 分隔符
        candIncluded.push(f)
        return chunk
      }).join('\n')
      // v6 向量政策：给裁决 agent 喂「相关既有记忆」上下文（recallRanked 融合召回）——Q0 已有归属 / Q3 能合并
      // 判定从此有库内证据（命中既有同主题时模型应走 skipped/合并而非新建，降低重复入册）；未启用/失败自动省略
      let relMemLines = ''
      try {
        const rres = await recallRanked(memoryLibRoot(), deltaText.slice(0, 512), 5, 'all', embedCfgOf())
        if (rres.rows.length) relMemLines = rres.rows.map((r) => `- ${r.line}`).join('\n')
      } catch { /* 相关记忆上下文失败=省略 */ }
      const userInput = [
        `## 待蒸馏会话\nsessionId=${sid}（内存增量，水位 ${lastSeq}→${maxSeq}）`,
        `## 会话增量正文\n${deltaText}`,
        relMemLines ? `## 相关既有记忆（recallRanked 召回，Q0 已有归属 / Q3 合并判据；命中即视为已覆盖候选）\n${relMemLines}` : '（相关既有记忆：未启用向量或零命中，按无历史裁决）',
        candIncluded.length ? `## 待固化候选（pending/ 中 ${candIncluded.length}/${candFiles.length} 个，预算 ${CAND_BUDGET} 字符内）\n${candText}` : (candFiles.length ? '（待固化候选超预算，本轮不携带；候选保留 pending 待下轮）' : '（无待固化候选）'),
        '请按规则处理：裁决可复用知识点并输出入册指令 JSON。',
      ].join('\n\n')

      const resolvedLlm = resolveLlm(config.distillProvider, config.distillModel)
      const useProvider = !!resolvedLlm && providerFailCount < 2
      const agentOptions = useProvider ? { provider: resolvedLlm!.provider, model: resolvedLlm!.model } : undefined
      const ac = new AbortController()
      const timeout = setTimeout(() => { try { ac.abort(new Error('distill timeout 10min')) } catch { /* */ } }, 600000)
      try {
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
          new Promise((resolve) => setTimeout(() => resolve({ stopReason: 'timeout' } as any), 600000)),
        ]) as any
        clearTimeout(timeout)
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
        log(`distill: ${sidShort(sid)} stop=${stop} route=${route} → ${disp.targetLib} 入册 ${disp.added} / 拒收 ${disp.rejected} / 失败 ${disp.failed}`)
        // WikiSkill 借鉴：失败归类 fclass（供审计聚合/深睡根因回流）+ LLM 指纹（大小模型蒸馏质量实证的数据底座）
        const llmLabel = useProvider && resolvedLlm ? `${resolvedLlm.provider}/${resolvedLlm.model}` : 'inherited'
        const fclass = !out ? 'json-parse'
          : stop !== 'completed' ? (useProvider ? 'provider-fail' : 'agent-stop')
          : route === 'discard' ? 'discard'
          : disp.failed > 0 ? 'dispatch-failed'
          : disp.rejected > 0 ? 'gate-reject'
          : 'ok'
        audit({ sid, kind: 'distill-run', route, stop, fclass, llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed })
        recordStub({ sid, watermark: [lastSeq, maxSeq], chars: deltaText.length, route, stop, fclass, llm: llmLabel, disp: { added: disp.added, rejected: disp.rejected, failed: disp.failed, targetLib: disp.targetLib }, outShape: out ? { appends: (out.appends || []).length, newIndex: (out.newIndex || []).length, profiles: (out.profiles || []).length, projectCards: (out.projectCards || []).length, skipped: (out.skipped || []).length } : null })
        if (disp.added > 0 && candIncluded.length) {
          const procDir = join(pendDir, '.processed')
          try { mkdirSync(procDir, { recursive: true }); for (const f of candIncluded) { try { renameSync(join(pendDir, f), join(procDir, f)) } catch { /* */ } } } catch { /* */ }
        }
        // 路线②：蒸馏裁决完成（stop=completed && out，无论入册多少）即留轻 episode——episode=「任务发生+结果」的
        // 同类判定/转正数据源（memory-core-model §3.1），与是否入册无关（discard 也是有效裁决：该任务不值得记）；
        // 入册或裁决非 discard 时再建/更新低置信任务候选（跨窗口记忆；同类二次出现供深睡跨窗归纳 [路径]）
        if (stop === 'completed' && out) {
          const intent = intentOf(deltaText)
          recordEpisode({ sid, intent: intent.slice(0, 120), route, fclass, llm: llmLabel, outcome: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, lib: disp.targetLib })
          if (route !== 'discard') await ensureFlowCandidate(sid, intent)
        }
        if (stop === 'completed' && out) {
          writeWatermark(sid, maxSeq)
          log(`distill: ${sidShort(sid)} completed，水位推进 → ${maxSeq}`)
        } else {
          // 水位保留：stop≠completed（error/timeout/aborted）或 stop=completed 但 out=null（JSON 解析失败，
          // 2026-09-09 实锤「Unexpected end of JSON input」）都不算消化——推进水位会把本窗口增量永久划出
          log(`distill: ${sidShort(sid)} stop=${stop} out=${out ? 'ok' : 'null'}，水位保留 ${lastSeq} 待下轮重试`)
        }
      } catch (e) {
        clearTimeout(timeout)
        const msg = String((e as Error)?.message || e)
        if (msg.includes('inactive context')) {
          // 旧 fiber 遗留定时器在 ctx 失效后触发（重载场景）：静默跳过、水位保留，由新实例积压扫尾补蒸馏（2026-09-10 修复）
          log(`distill: ${sidShort(sid)} 旧 ctx 已失效（inactive context），跳过本轮（水位保留，待扫尾）`)
        } else {
          if (useProvider) providerFailCount++
          log(`distill ERROR ${sidShort(sid)}: ${msg.slice(0, 200)}`)
        }
      }
    } catch (e) {
      log(`distill agent err ${sidShort(sid)}: ${String((e as Error)?.message || e).slice(0, 120)}`)
    } finally { distilling.delete(sid) }
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
      const g = await runNode(config.nodeBin, gateScript, ['AGENT.md', tmpPath], { env: { MEMORY_ROOT: memRoot, SHOUCANG_CAP_MEMORY: String(config.capMemory ?? 3000), SHOUCANG_CAP_USER: String(config.capUser ?? 2000), SHOUCANG_CAP_AGENT: String(config.capAgent ?? 3000) }, timeout: 20000 })
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
        const g = await runNode(config.nodeBin, gateScript, [target, tmpPath], { env: { MEMORY_ROOT: memRoot, SHOUCANG_CAP_MEMORY: String(config.capMemory ?? 3000), SHOUCANG_CAP_USER: String(config.capUser ?? 2000), SHOUCANG_CAP_AGENT: String(config.capAgent ?? 3000) }, timeout: 20000 })
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
      // v7 A 步：条目活性聚合（2026-09-10，方案 docs/memory-activity-model.md）——consolidation 之后、归纳之前：
      // 命中聚合 → ACT-R 式状态迁移（active/warm/cold）→ 遗忘候选清单（只建议不删除）；失败仅 log。
      try {
        await activityAggregate(resolved.root, { audit, log })
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
      validateProvider()
      const userInput = [
        '## 当天记忆痕迹（作用域=本日，不做全库扫描）',
        traces,
        `## 现行原则/路径（冲突时 replace，match 逐字取自此清单）\n${currentList}`,
        `## 现行画像（profileOps 的 replace match 逐字取自此处）\n${currentProfiles}`,
        `## 现行知识索引（MEMORY.md；pointerOps 扩容/重构的 match 逐字取自此处）\n${currentMemIndex}`,
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
        const app = (stop === 'completed' && out)
          ? await applyPrinciples(resolved.root, out)
          : { added: 0, replaced: 0, skipped: 0, gate: `stop=${stop}` }
        // 双画像巩固：profileOps（add/replace，须 notes 源指针；格式/容量/去重门禁同蒸馏）
        let profileAdded = 0
        if (stop === 'completed' && out && Array.isArray(out.profileOps)) {
          const ops = out.profileOps.filter((o: any) => o && ['USER.md', 'AGENT.md'].includes(String(o.target)) && ['add', 'replace'].includes(String(o.action)))
          for (const op of ops) {
            const r = writeProfileLine(resolved.root, String(op.target), String(op.section || ''), String(op.text || ''), op.action === 'replace' ? String(op.match || '') : undefined)
            if (r === 'added') profileAdded++
          }
        }
        // v6 指针自动维护：pointerOps（update 原地替换整行，走 write_gate；扩容概况/重构指针 §）
        const ptrRes = (stop === 'completed' && out)
          ? await applyPointerOps(resolved.root, out)
          : { updated: 0, skipped: 0, gate: `stop=${stop}` }
        log(`deep sleep: stop=${stop} 原则 +${app.added}/替换 ${app.replaced}/跳过 ${app.skipped}（${app.gate}）画像 +${profileAdded} 指针更新 ${ptrRes.updated}/跳过 ${ptrRes.skipped}（${ptrRes.gate}）`)
        audit({ kind: 'deep-sleep', stop, added: app.added, replaced: app.replaced, skipped: app.skipped, profiles: profileAdded, pointers: ptrRes.updated, ptrSkipped: ptrRes.skipped, gate: app.gate })
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
      if (origin === 'subagent') return
      noteEvent(sid, true) // 状态机：turn 完成 → ENDED（停滞计时起点）
      armIdleTimer(agent)
    } catch { /* 事件回调零抛出 */ }
  })
  ctx.on('agent/disposed', ({ agent }: any) => {
    try { const t = idleTimers.get(agent.id); if (t) { clearTimeout(t); idleTimers.delete(agent.id) } } catch { /* */ }
    try { sessions.delete(agent.id) } catch { /* */ }
  })
  ctx.on('session/disposed', (session: any) => {
    try { const sid = session && session.id; const t = idleTimers.get(sid); if (t) { clearTimeout(t); idleTimers.delete(sid) } } catch { /* */ }
    try { sessions.delete(session && session.id) } catch { /* */ }
  })
  // ═══ 路线④ 打扰度观察（shadow-first MVP）：打分/滞回/冷却/落影子日志，默认不做上下文注入 ═══
  // 设计（v5.2 §5 + §9④）：先攒 activation-shadow.jsonl 真实样本校准阈值（T_on/T_off 初值 0.62/0.52），
  // 校准满意后再由用户开 activationPrefetch 走 active（注入接线=后续档，非本 MVP）。
  const actShadowFile = join(kRoot, 'audit', 'activation-shadow.jsonl')
  const actState = new Map<string, { state: 'idle' | 'prefetch'; cooldown: number; prevScore: number }>()
  const actConf = {
    on: Number(config.activationTOn) || 0.62,
    off: Number(config.activationTOff) || 0.52,
    cooldown: Math.max(0, Number(config.activationCooldownSteps) || 3),
    topK: Math.min(5, Math.max(1, Number(config.activationTopK) || 3)),
  }
  // v6 向量政策：embed cfg 单一构造（取自 DistillConfig 可选字段，与 scheduler vec 通道同源；未配置=词法降级）
  const embedCfgOf = (): EmbedCfg => ({
    enabled: !!(config.embedEnabled && config.embedBaseUrl && config.embedModel),
    baseUrl: String(config.embedBaseUrl || ''),
    model: String(config.embedModel || ''),
    apiKeyEnv: String(config.embedApiKeyEnv || ''),
  })

  // 路线④ 打扰度观察（v6 向量政策 2026-09-10：打分改 recallRanked 融合召回——dense 主、lexical 稳；
  // sim 口径随 mode：fusion 的 score=0..100（已 min-max 归一）→ /100；lexical=命中数/tokens。阈值随影子样本再校准）
  const activationStep = async (sid: string, event: any): Promise<void> => {
    try {
      if (!event) return
      const d = event.data || {}
      const arr = Array.isArray(d.content) ? d.content : []
      let text = ''
      for (const c of arr) if (c && c.type === 'text' && typeof c.text === 'string') text += c.text
      if (event.type !== 'user/message' || !text.trim()) return
      const rres = await recallRanked(memoryLibRoot(), text, actConf.topK, 'all', embedCfgOf())
      const { rows, tokens } = rres
      if (!tokens.length && !rows.length) return
      const sim = !rows.length ? 0
        : rres.mode === 'fusion' ? Math.min(1, (rows[0].score || 0) / 100)
        : Math.min(1, rows[0].score / (tokens.length || 1))
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
          state: st.state, prev, sim: Number(sim.toFixed(3)), tOn: actConf.on, tOff: actConf.off,
          emit, tokens: tokens.length, hit: rows.length ? rows[0].line.slice(0, 120) : '',
          pointers: rows.slice(0, 2).map((r) => r.pointer), excerpt: text.slice(0, 60),
        }) + '\n', 'utf8')
      } catch { /* 影子日志失败静默 */ }
    } catch { /* 观察零抛出 */ }
  }

  // ═══ 积压扫尾（2026-09-10 用户拍板：稳健性修复——旧 ctx 失败/重启/错过空闲窗的会话自动补蒸馏）═══
  // 候选：仍在 ctx 根内的会话、水位<内存末事件 seq、且已出「10min 宽限期」（避免与 idle 定时器抢跑/打断用户续聊）。
  // 无 FSM 记录的历史会话（如重启前已结束的）一律视为积压候选直接补。
  const sweepBacklog = async (): Promise<void> => {
    try {
      const roots = (ctx.agents && typeof ctx.agents.roots === 'function') ? ctx.agents.roots() : []
      for (const a of roots) {
        try {
          if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function') continue
          const origin = a.session && a.session.header && a.session.header.origin
          if (origin === 'subagent') continue
          const sid = a.id
          if (distilling.has(sid)) continue
          const rec = sessions.get(sid)
          if (rec) {
            if (rec.state === 'running' || rec.state === 'probing' || rec.state === 'suspect') continue
            if (rec.lastEndAt && Date.now() - rec.lastEndAt < config.idleWakeMs) continue // 仍在宽限期，等 idle 定时器
          }
          const wm = readWatermarks().get(sid)
          const lastSeq = wm ? (wm.lastSeq || 0) : 0
          let maxSeq = lastSeq
          for (const e of a.session.snapshotEvents()) { const s = (e as any).seq ?? 0; if (s > lastSeq && s > maxSeq) maxSeq = s }
          if (maxSeq > lastSeq) {
            // 跨实例 claim 锁（2026-09-10 实锤：重叠 fiber 的 30s 首扫会同时抢同一积压窗口 → 471aca03 被双蒸馏双写）：
            // 在途 claim（25min 内）→ 跳过；过期 claim → 覆盖重试；无增量时顺手清理陈旧 claim。
            const claimDir = join(kRoot, 'audit', 'claims')
            const claimFile = join(claimDir, sid + '.json')
            try {
              let claim: any = null
              try { claim = JSON.parse(readFileSync(claimFile, 'utf8')) } catch { /* 无 claim */ }
              if (claim && Date.now() - (claim.at || 0) < 25 * 60000) { continue } // 在途，其他 fiber 已接管
              mkdirSync(claimDir, { recursive: true })
              writeFileSync(claimFile, JSON.stringify({ at: Date.now(), lastSeq, maxSeq }), 'utf8')
            } catch { /* claim 失败不阻塞 */ }
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
      if (origin === 'subagent') return
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

  return { getDeepSleepStatus, runDeepSleepNow, getConfig }
}
