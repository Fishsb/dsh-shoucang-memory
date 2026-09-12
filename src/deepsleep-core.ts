// deepsleep-core.ts — 深度睡眠「判据层」（纯函数 / 决策表 / 契约常量 / 状态机类型）
//
// 为什么存在（2026-09-12 架构根治 P1，依据 deliverables/architecture-review-2026-09-12.md）：
//   原全部挤在 distill.ts 内 —— 该文件 3512 行（全仓 38.2%）、变更 81 次（第二名 1.65 倍），
//   且深睡标识符 172 处**贯穿** 163–3510 行，与蒸馏逻辑**交织而非分段**。
//   后果：任何深睡改动都必须在全项目影响半径最大的文件里穿针引线。
//
// 本模块准入条件（**只放这三类**）：
//   ① 纯函数 / 决策表 —— 无闭包状态、可直接单测驱动；
//   ② 深睡契约常量与提示词模板；
//   ③ 深睡状态机类型（SessState / DeepSleepStatus / SessRec）。
//
// **不放在这里**：任何需要访问 registerDistill 闭包状态的代码。
//   那属于 Phase 2 的 deepsleep.ts（带显式 ctx 参数）—— 见报告 §P1 分期表。
//
// 依赖方向（切分的全部意义所在）：
//   本模块**只向下**依赖 criteria.generated.ts（生成物 = 事实源）与 targets.ts（dshHome），
//   **绝不依赖 distill.ts**。判据层从此不再被 3500 行的闭包裹挟，可独立阅读、独立测试、独立演进。
import { readFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { CONSOLIDATE_JUDGE, JUDGEMENT_HINT } from './criteria.generated.js'
import { dshHome } from './targets.js'

// ─────────────────────────────────────────────────────────────────────────────
// 以下三节整体自 src/distill.ts 迁入（原 219–269 / 290–318 / 337–633 行），内容未改写。
// ─────────────────────────────────────────────────────────────────────────────

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
export type SessState = 'running' | 'ended' | 'probing' | 'suspect' | 'stalled'

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

export interface SessRec {
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
/**
 * 深睡本轮是否算「已消化」（决定水位推进 or 回滚）——**单一实现**，供 runDeepSleep 与单测共用。
 *
 * 2026-09-11 实修（静默丢料根因）：原判据只按 `stop === 'completed' && out`，从不检查候选是否**真正落地**。
 * 当代理跑完但门禁把候选行**全数拒收**（attempted>0 && added===0，如 gate=all-rejected /
 * maturation-rejected / 尾部总门失败）时仍判 done → 调用方推进水位 → 被拒痕迹永久划出窗口 → 静默丢失。
 * 审计实证 2 轮（08:32:23.997Z attempted=3/added=0、08:48:10.129Z attempted=1/added=0）共丢 4 条候选行。
 *
 * 判定口径：
 *  - `stop !== 'completed' || !out` → 未完成 / 无产出 ⇒ failed（回滚重试，含 stop=error/aborted、JSON 解析失败）。
 *  - `app.gate === 'write_gate 未就位'` → 门禁脚本缺席（applyPrinciples 早返回，attempted 恰为 0）属
 *    **基础设施失败**，不得因 attempted===0 误判 done ⇒ failed。
 *  - `app.added > 0` → 有落地 ⇒ done。
 *  - `app.attempted === 0` → 代理本就无新原则/路径提案（真·空轮）⇒ done。
 *  - `attempted>0 && added===0` → 100% 拒收 = 材料损失 ⇒ failed（水位回滚、同批下轮重试）。
 *
 * ⚠ G-19 修正（2026-09-12）：上述判据**只消费 principles 一个通道**（`app`）。深睡同轮另有
 *   profileOps / pointerOps / treeOps / forgetOps 四个写入通道，其结果**从不进入判据** ⇒
 *   「纯 profileOps/指针/树/遗忘 轮且全数失败」时 `app.attempted === 0` ⇒ 误判 landed:true
 *   ⇒ 水位推进 ⇒ 那批材料永久关在窗外（静默丢料）。Rex 实测约占 9.5%~14.3% 轮次。
 *   架构修法：**判据必须消费完整轮次结果，而非其子集**（与 G-16 同源——判据只认真实完整产出）。
 *   取向：宁可重试（failed，幂等、可观测），不可静默丢料（landed，无声无息）。
 */
// 落盘失败 gate 字面量（2026-09-12 G-16）：applyPrinciples **产出**、deepSleepLanded **消费**——
//   单一定义，改一处两边同步。原先两边各写死一个字符串字面量，将来改任一侧都会**静默脱钩**
//   （判据还在、门禁已失效，且不报错不测试红——Arch 2026-09-12 指出的漂移隐患）。
export const COMMIT_FAILED_GATE = '落盘异常'

/** 除 principles 外四通道的轮次汇总（G-19）：`tried`=该通道有提案且未落地数，`done`=成功落地数。 */
export type DeepSleepOtherChannels = { tried: number; done: number }

export const deepSleepLanded = (
  stop: unknown,
  out: unknown,
  app: { attempted: number; added: number; gate: string },
  // G-19：缺省 {} ⇒ 与旧行为一致（纯 principles 轮），保证向后兼容、不引入回归。
  other: DeepSleepOtherChannels = { tried: 0, done: 0 },
): boolean => {
  if (stop !== 'completed' || !out) return false
  // G-16 纵深防御（2026-09-12）：失败 gate 一律判 failed——即使上游把 added 误报成 >0（谎报），
  //   判据侧也不认。只靠 producer 归零不够：applyPrinciples 在闭包内不可单测，谎报无人拦。
  if (['write_gate 未就位', COMMIT_FAILED_GATE].includes(app.gate)) return false
  // G-19：全通道汇总——任何通道有落地即 done；五通道皆无提案（真·空轮）即 done；
  //   只要有提案而**一件都没落地**（含四通道），即 failed（水位回滚、下轮重试，幂等）。
  const done = (app.added > 0 ? 1 : 0) + (other.done > 0 ? 1 : 0)
  const tried = app.attempted > 0 || other.tried > 0
  return done > 0 || !tried
}

// ── 深睡失败策略（2026-09-12 G-19：B/C 两种产品取向做成可配项，不再硬编码）──
// 背景：landed=false 原一律返回 'failed' ⇒ 水位回滚、同批材料下轮重捞（=策略 B，永不放弃，防静默丢料）。
//   但某通道若**永久**失败（画像容量满、门禁脚本长期缺席…），B 会每 idleMs 重捞一次且永不放弃（持续烧 LLM）。
//   故并存策略 C：连败达 maxRounds 轮后**放行**（判 done、推进水位）并留痕告警——
//   取舍是「有告警的丢料」优于「无上限的烧算力」，二者皆可观测。
//   B='retry'（全重捞、永不放行）；C='graded'（分级，连败 N 轮放行并告警）。缺省 graded/3。
export type DeepSleepFailPolicy = 'retry' | 'graded'
export const DEFAULT_FAIL_POLICY: DeepSleepFailPolicy = 'graded'
export const DEFAULT_FAIL_MAX_ROUNDS = 3

// 纯决策表（模块级导出 ⇒ 单测可直接驱动，防判定与调用点漂移）：先匹配先返回。
export const planDeepSleepVerdict = (
  landed: boolean,
  policy: DeepSleepFailPolicy,
  failStreak: number,
  maxRounds: number,
): { verdict: 'done' | 'failed'; release: boolean; reason: string } => {
  if (landed) return { verdict: 'done', release: false, reason: 'landed' }
  if (policy === 'retry') return { verdict: 'failed', release: false, reason: 'policy=retry' }
  if (failStreak + 1 >= maxRounds) return { verdict: 'done', release: true, reason: 'graded-release' }
  return { verdict: 'failed', release: false, reason: 'graded-retry' }
}

// 实时读取（与 liveCaps 同法：每轮读 ~/.dsh/suite/scheduler.json，面板改后即时生效，不必重载插件）。
// 非法值一律回落默认：策略必须命中 'retry'|'graded' 字面量，maxRounds 必须为正整数。
export const liveFailPolicy = (): { policy: DeepSleepFailPolicy; maxRounds: number } => {
  const d: { policy: DeepSleepFailPolicy; maxRounds: number } = { policy: DEFAULT_FAIL_POLICY, maxRounds: DEFAULT_FAIL_MAX_ROUNDS }
  try {
    const s = JSON.parse(readFileSync(join(dshHome(), 'suite', 'scheduler.json'), 'utf8')) as Record<string, unknown>
    if (s.deepSleepFailPolicy === 'retry' || s.deepSleepFailPolicy === 'graded') d.policy = s.deepSleepFailPolicy
    if (typeof s.deepSleepFailMaxRounds === 'number' && Number.isInteger(s.deepSleepFailMaxRounds) && s.deepSleepFailMaxRounds > 0) d.maxRounds = s.deepSleepFailMaxRounds
  } catch { /* 配置不可读=用默认值 */ }
  return d
}

// ── 深睡水位「可否回放」判据（2026-09-11 抽出为单一实现：重启回放与语义同源，防两份判据漂移）──
// 背景：重启时 lastDeepSleepAt 从 audit/distill-audit.jsonl 回放重建，旧判据只排
//   error / stop=error / result ∈ {no-parent, no-traces}（"无事可做"），**漏排"做了但被拒"**
//   （attempted>0 && added=0，如 gate=all-rejected）——这类轮次被当有效水位回放，
//   那批痕迹就永久关在窗外（重启一次即丢料，实测 09-11 08:32/08:48 两轮共 4 条）。
// 口径：审计行**自本次起**带 `landed`（由 deepSleepLanded 写入）；旧行无该字段时回落旧判据
//   （保守兼容——历史 785 行绝大多数无 landed，**不回捞**：回捞会把水位往回推，在幂等键落地前
//    只会把"丢料"换成"重复写"）。
export const deepSleepReplayable = (o: {
  kind?: unknown; error?: unknown; stop?: unknown; result?: unknown; landed?: unknown
}): boolean => {
  if (o.kind !== 'deep-sleep') return false
  if (o.error || o.stop === 'error') return false
  if (['no-parent', 'no-traces'].includes(String(o.result))) return false
  if (o.landed !== undefined) return Boolean(o.landed)
  return true
}

// ── 原则落盘提交点（2026-09-12 G-16：抽成单一实现并**导出**，供单测直接驱动）──
// 背景：applyPrinciples 是闭包内 const（:1576 附近），无 export，单测到不了；
//   不抽则 G-16「rename 失败仍按 added>0 返回」只能靠人肉 review 兜，改天被人改回去也不会有任何断言变红。
// 契约：成功 ⇒ ok=true 且 tmp 已消失；失败 ⇒ ok=false + err 字符串，且**不留孤儿 tmp**（尽量清理）。
export const commitPrinciples = (tmpPath: string, targetPath: string): { ok: boolean; err?: string } => {
  try { renameSync(tmpPath, targetPath); return { ok: true } } catch (e) {
    try { unlinkSync(tmpPath) } catch { /* tmp 本就不存在 */ }
    return { ok: false, err: String((e as any)?.message ?? e) }
  }
}

// ── G-20：水位作废时「快照不可用」分支的处置（2026-09-12）——抽成单一实现并**导出**，供单测直接驱动 ──
// 背景（实测 09-11 00:54:56，sid session-5f024550）：旧 `discardWatermark` 在
//   `agent.session.snapshotEvents()` 抛异常时把 maxSeq 退化为 0，随后**照样** `writeWatermark(sid, 0, agent)`。
//   而下方 :664 的注释白纸黑字写着「为何不是 0：写 0 的行没有可用锚点（seq 0 无事件）→ 下次读仍判
//   「不可验证」→ **每轮全量重蒸，形成死循环**」——即代码实现了注释明确禁止的那件事，属自相矛盾。
// 判据：读侧 `resolveWatermark` 是 `if (lastSeq <= 0) return null`，故**写 0 与不写在读侧完全等价**；
//   写 0 唯一的作用是污染水位文件 + 让审计把「无水位」误读成「从 0 续」。故此处一律不写。
// ⚠ 今天没进入死循环是**运气**（下一轮快照就恢复了），**不是设计保证**——只要 snapshotEvents 连续不可用，
//   :664 注释预言的死循环就会真实发生。故另加熔断闸（连续 N 轮不可用 ⇒ 本轮跳过，不再整窗重蒸烧 LLM）。
export const DISCARD_SNAPSHOT_CB_N = 3

/**
 * 写方决策表（单测直接驱动）：① maxSeq<=0 ⇒ 不写（禁写 0）；② maxSeq < prevSeq ⇒ 不写（禁写回退值）；③ 否则写。
 * `snapshotUnavailable` 是**熔断计数的唯一推进条件**（G-20 二修，cody 2026-09-12 指出）：
 *   只有「快照真的拿不到」才算一轮；「快照正常但序号空间重排」**不计**（它不烧 LLM，也不是故障，
 *   且读方已按语义 B 判为「保持全量」——若让它推进计数，连续 3 轮零写入就会撞上熔断被跳过，
 *   与语义 B「要重蒸」直接冲突 ⇒ 会话变「永久不蒸」）。
 */
export const planDiscardWrite = (
  maxSeq: number,
  prevSeq: number,
  consecutiveUnavailable: number,
): { write: boolean; circuitBroken: boolean; snapshotUnavailable: boolean; reason: string } => {
  const streak = Number(consecutiveUnavailable) > 0 ? Math.floor(Number(consecutiveUnavailable)) : 0
  if (!(maxSeq > 0)) {
    const n = streak + 1
    const broken = n >= DISCARD_SNAPSHOT_CB_N
    return {
      write: false, circuitBroken: broken, snapshotUnavailable: true,
      reason: broken ? 'snapshot-unavailable-circuit-break' : 'snapshot-unavailable-noop',
    }
  }
  const p = Number(prevSeq) > 0 ? Number(prevSeq) : 0
  if (p > 0 && maxSeq < p) return { write: false, circuitBroken: false, snapshotUnavailable: false, reason: 'seq-space-regressed-noop' }
  return { write: true, circuitBroken: false, snapshotUnavailable: false, reason: '' }
}

/**
 * 读方决策表（G-20 补正的**主修点**）：双证失效后是「降级到当前 live 边界」还是「全量重蒸」。
 * 为何读方才是主修：**回退 100% 由读方决定**——旧码四个作废分支全部 `return null`，而调用方是
 *   `const lastSeq = baseline ? baseline.lastSeq : 0`，null ⇒ lastSeq=0 ⇒ **整窗重蒸**。写方写什么都与回退无关。
 *   实证（Cody 实测）：restartFrom = 114654 / 811483 / 339724 三条健康边界值写进去了，下一轮仍从 7~8 开始。
 * 判据：`maxSeq >= prevSeq` ⇒ 同一（或已增长的）seq 空间 ⇒ 跳到当前边界（下方注释 :662-668 声明的**语义 A**，
 *   是代码自己选过的语义）；`maxSeq < prevSeq` ⇒ 序号空间已重排/缩小，旧边界不可寻址 ⇒ **保持全量**（语义 B，
 *   此情形新空间通常只有几百条，便宜）。B 才是违背声明的实现，故按 A 修不需要用户拍板。
 */
export const planDegradedBaseline = (maxSeq: number, prevSeq: number): { degrade: boolean; reason: string } => {
  if (!(maxSeq > 0)) return { degrade: false, reason: 'no-live-boundary' }
  const p = Number(prevSeq) > 0 ? Number(prevSeq) : 0
  if (!(p > 0)) return { degrade: false, reason: 'no-prev-seq' }
  return maxSeq >= p ? { degrade: true, reason: 'same-seq-space' } : { degrade: false, reason: 'seq-space-regressed' }
}

/**
 * G-4a（2026-09-12）：**跳过分支（below-min / prescan-no-signal）的水位推进判据**——抽成纯函数并导出。
 * 背景（实测，审计 800 行）：段 dispatch 失败后水位保留，但下一轮若命中跳过分支，旧码直接
 *   `writeWatermark(sid, maxSeq)` ⇒ 一步跨过未消化段 ⇒ 该段**永不重扫**（50 段中 35 段如此，真重扫仅 4 段）
 *   ⇒ `dispatch-failed-forced` 恒为 0 的真因是「重试从未累积到第 2 次」，而非计数没持久化。
 * 语义：
 *   · 无未消化段 ⇒ 照旧推 maxSeq（`skip-normal`，保持跳过分支原有行为，不引入死循环）；
 *   · 有未消化段 ⇒ **不推**（保留基线，把窗口留给下一轮再看一次），连续扣满 SKIP_HOLD_MAX 轮仍无进展
 *     ⇒ 放弃并推 maxSeq（`skip-abandoned-after-hold`，显式记账）——**没有这条就会死循环**：
 *     某会话内容长期低于门槛时，每轮都会重扫同一窗口。
 */
export const SKIP_HOLD_MAX = 3
export const planSkipWatermark = (
  hasUndigested: boolean, holdRounds: number, maxSeq: number,
): { write: boolean; seq: number; reason: string; holdRounds: number } => {
  if (!hasUndigested) return { write: true, seq: maxSeq, reason: 'skip-normal', holdRounds: 0 }
  if (holdRounds + 1 >= SKIP_HOLD_MAX) return { write: true, seq: maxSeq, reason: 'skip-abandoned-after-hold', holdRounds: 0 }
  return { write: false, seq: 0, reason: 'skip-held-for-undigested', holdRounds: holdRounds + 1 }
}

export interface DiscardWatermarkDeps {
  writeWatermark(sid: string, lastSeq: number, agent: any): void
  audit(o: Record<string, unknown>): void
  log(m: string): void
  versionOf?(agent: any): number | undefined
}

/**
 * 水位作废收尾的可单测驱动（`discardWatermark` 是闭包内 const，无 export，单测到不了；与 commitPrinciples 同手法）。
 * 返回 `wrote=false` 表示**未写水位**（快照不可用），读侧语义等价于「无水位」——绝不再写 lastSeq=0 的行。
 */
export const runDiscardWatermark = (
  sid: string,
  reason: string,
  agent: any,
  wm: any,
  consecutiveUnavailable: number,
  deps: DiscardWatermarkDeps,
): { wrote: boolean; circuitBroken: boolean; reason: string; streak: number; maxSeq: number } => {
  let maxSeq = 0
  try {
    if (typeof agent?.session?.snapshotEvents === 'function') {
      for (const e of agent.session.snapshotEvents()) { const s = (e as any).seq ?? 0; if (s > maxSeq) maxSeq = s }
    }
  } catch { /* 快照不可用 → maxSeq 保持 0（旧码在此退化为 0 后仍写 0，与 :664 注释自相矛盾） */ }
  const plan = planDiscardWrite(maxSeq, wm?.lastSeq ?? 0, consecutiveUnavailable)
  const prev = Number(consecutiveUnavailable) > 0 ? Math.floor(Number(consecutiveUnavailable)) : 0
  if (!plan.write) {
    // G-20 二修：只有「快照真的不可用」才推进熔断计数；seq 空间重排不推进（并顺带复位），
    // 否则连续 3 轮「快照正常但空间重排」会被熔断跳过，与读方语义 B「保持全量」直接冲突。
    const streak = plan.snapshotUnavailable ? prev + 1 : 0
    try {
      deps.audit({
        sid,
        kind: plan.circuitBroken ? 'snapshot-unavailable-circuit-break' : 'watermark-invalidated',
        reason: plan.reason,
        invalidatedBy: reason,
        streak,
        threshold: DISCARD_SNAPSHOT_CB_N,
        prevSeq: wm?.lastSeq ?? null,
        prevVersion: wm?.formatVersion ?? null,
        restartFrom: null, // 未写水位 ⇒ 无续写边界（写 0 会让审计误读成「从 0 续」）
      })
    } catch { /* 审计失败静默 */ }
    try { deps.log(`watermark: 双证失效（${reason}）但快照不可用（连续 ${streak}/${DISCARD_SNAPSHOT_CB_N} 轮）→ 不写水位（${plan.reason}）`) } catch { /* */ }
    return { wrote: false, circuitBroken: plan.circuitBroken, reason: plan.reason, streak, maxSeq }
  }
  deps.writeWatermark(sid, maxSeq, agent)
  try {
    deps.audit({
      sid, kind: 'watermark-invalidated', reason,
      prevSeq: wm?.lastSeq ?? null,
      prevVersion: wm?.formatVersion ?? null,
      version: deps.versionOf ? deps.versionOf(agent) ?? null : null,
      restartFrom: maxSeq,
    })
  } catch { /* 审计失败静默 */ }
  return { wrote: true, circuitBroken: false, reason: '', streak: 0, maxSeq }
}

/**
 * 水位基线：`degraded=false` = 双证可信；`degraded=true` = 降级基线（跳到当前 live 边界，非可信但**不回退到 0**）。
 *
 * ⚠ `degraded: true` **只在本轮有效，不会被持久化，也永远不会出现在水位文件里**——不要为它加防御代码：
 *   ① 降级基线是 `resolveWatermarkBaseline` 的**返回值**，仅用于喂给本轮 `baseline ? baseline.lastSeq : 0`；
 *   ② 落盘路径只有一条：`discardWatermark` → `writeWatermark`，而它由 `planDiscardWrite` 把关——
 *      `maxSeq >= prevSeq` 才写，且写的是**带双证的 maxSeq**（不是 degraded 标记）；
 *   ③ 故下一轮 `readWatermarks` 读到的总是可信行，**不存在「把不可信洗成可信」的路径**；
 *   ④ 这也是为什么**不加** `degradedFrom` 字段：lastSeq / formatVersion / fp 都是当时实测值，
 *      下轮双证校验会重新验一遍；加字段要在已跑通的水位格式上动刀，收益（元信息可见）不抵风险（解析分叉）。
 *      （G-20 审查结论，2026-09-12，team-lead 核准）
 */
export interface WmBaseline {
  lastSeq: number
  degraded: boolean
  reason: string
  formatVersion?: number
  fp?: string
}

export interface BaselineDeps {
  /** 返回本轮作废收尾后的 live 边界（maxSeq）与是否落了水位 */
  discard(sid: string, reason: string, agent: any, wm: any): { maxSeq: number; wrote: boolean }
  versionOf(agent: any): number | undefined
  fingerprintAt(agent: any, seq: number): string | null
}

/**
 * 读方可单测驱动（G-20 补正主修点；`resolveWatermark` 是闭包内 const，无 export，与 commitPrinciples 同手法）。
 * 返回 null 仍表示「无基线 / 需全量」——但**只在真正需要全量时**（水位缺失、seq 空间回退、快照不可用）。
 * 关键不变量：双证失效且 live 边界未回退时，**不得返回 null**（旧码返回 null ⇒ 调用方把 lastSeq 打成 0 ⇒ 整窗重蒸）。
 */
export const resolveWatermarkBaseline = (sid: string, wm: any, agent: any, deps: BaselineDeps): WmBaseline | null => {
  if (!wm) return null
  const lastSeq = Number(wm.lastSeq || 0)
  if (!(lastSeq > 0)) return null
  const liveVer = deps.versionOf(agent)
  const recVer = typeof wm.formatVersion === 'number' ? wm.formatVersion : undefined
  const toBaseline = (reason: string): WmBaseline | null => {
    const r = deps.discard(sid, reason, agent, wm)
    const plan = planDegradedBaseline(r.maxSeq, lastSeq)
    if (!plan.degrade) return null // 语义 B：seq 空间已回退/无边界 ⇒ 保持全量
    return { lastSeq: r.maxSeq, degraded: true, reason: `${reason}/${plan.reason}` }
  }
  if (recVer === undefined || liveVer === undefined) return toBaseline('unverifiable-legacy')
  if (liveVer !== recVer) return toBaseline(`format-migrated ${recVer}→${liveVer}`)
  const fp = deps.fingerprintAt(agent, lastSeq)
  if (fp === null || wm.fp === undefined || wm.fp === null) return toBaseline('fingerprint-unavailable')
  if (fp !== wm.fp) return toBaseline(`seq-space-shifted (${String(wm.fp).slice(0, 40)} ≠ ${fp.slice(0, 40)})`)
  return { lastSeq, degraded: false, reason: '', formatVersion: recVer, fp }
}
