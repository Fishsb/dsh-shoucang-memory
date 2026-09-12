// deepsleep.ts — 深度睡眠「状态机层」（带显式 ctx，可独立阅读 / 装配 / 演进）
//
// 2026-09-12 架构根治 P1 二期：自 `distill.ts` 的 `registerDistill` 巨型闭包（2835 行）迁出两段：
//   块A 原 1344–2141（798 行）：状态变量 / noteEvent / traceSince / gatherDeepSleepTraces
//                                / applyPrinciples / applyPointerOps / consolidateTree
//   块B 原 2259–2879（621 行）：runDeepSleep / probeSession / deepSleepCheck
//                                / getDeepSleepStatus / runDeepSleepNow
//   ⇒ registerDistill 由 2835 行降到约 1400 行。
//
// ⚠ 为什么不直接 `import ... from './distill.js'`：深睡**会回调蒸馏**（distillAgent / writeDispatch）。
//   直接 import 就形成 distill ↔ deepsleep 的**循环依赖**，正是本项目此前唯一没有的性质（零环）会被破坏。
//   ⇒ 改用**依赖倒置**：回调经 ctx 注入。本模块零 import distill，依赖方向保持严格单向：
//       index → scheduler → distill → deepsleep → deepsleep-core → criteria.generated
//
// 形态说明（**刻意的第一步**）：`createDeepSleep(ctx)` 仍是一个工厂闭包，
//   这样 1419 行代码得以**零逻辑改动**迁出（缩进不变、裸名不变），把本次变更的风险压到最低。
//   待本步站稳，再把内部函数逐个提到模块级（显式传 ctx），消除最后一个大闭包 —— 那属于 P1 三期。
//
// 共享可变状态：providerFailCount 由蒸馏与深睡**双方读写** ⇒ 必须以共享对象引用传递
//   （`llmState`），传值快照会让两侧计数脱钩。
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { knowledgeRoot, memoryLibRoot, dshHome, extractRecallTokens, highConfCarrierSet, indexCarrierSet, indexRowInLayer, indexRowTag, profileCarrierSet, recallApprox, recallIndex, scanIndexRows, sectionKeyOf, dedupeBySection } from './targets.js'
import { applyForgetOps, applyTreeOps, sectionExists, type TreeOp } from './treeops.js'
import { recallRanked, semanticSim, type EmbedCfg } from './vec.js'
import { activityAggregate } from './activity.js'
import { CRITERIA_VERSION, LEDGER_FILE, MATURATION, SCORE, SURFACE, TRIGGER } from './criteria.generated.js'
import { demoteVerdict, evaluateL0, maturationVerdict, promoteVerdict } from './criteria.js'
import {
  COMMIT_FAILED_GATE, DEEP_SLEEP_PROMPT, commitPrinciples, deepSleepLanded,
  deepSleepReplayable, liveFailPolicy, planDeepSleepVerdict, resolveWatermarkBaseline,
  runDiscardWatermark,
  type BaselineDeps, type DeepSleepOtherChannels, type DeepSleepStatus,
  type SessRec, type SessState, type WmBaseline,
} from './deepsleep-core.js'
import { resolveTarget } from './targets.js'

/** 深睡状态机的外部依赖（全部由 distill 注入；本模块不反向依赖 distill）。 */
export interface DeepSleepCtx {
  // ── 基础设施：只读值 + 副作用出口 ──
  log(m: string): void
  audit(o: Record<string, unknown>): void
  ledger(o: Record<string, unknown>): void
  kRoot: string
  auditFile: string
  pendDir: string
  candidateDir: string
  PROFILE_HEADER: Record<string, string>
  capEnv(): Record<string, string>
  /** 蒸馏与深睡**共享**的可变状态（引用传递，两侧都写） */
  llmState: { providerFailCount: number }
  /**
   * `registerDistill` 的两个入参。
   * ⚠ 类型用 any 是**刻意**的：AppContext / DistillConfig 定义在 distill.ts，
   *   若此处 `import type` 就会形成 deepsleep → distill 的依赖边，与「深睡回调蒸馏」一起构成**循环依赖**。
   *   代价是深睡内对 config/ctx 的字段访问失去编译期检查 —— 本区块是**原样搬移**（非新写），
   *   字段名不会错；待 P1 三期把这两个类型提到独立契约层后可恢复强类型。
   */
  appCtx: any
  config: any
  /** 子进程调用（模块级函数，定义在 distill.ts；注入以避免反向依赖） */
  runNode(nodeBin: string, scriptPath: string, args: string[], opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<{ status: number | null; out: string; err: string }>
  textOf(r: { status: number | null; out: string; err: string }): string
  embedCfgOf(): EmbedCfg
  probeScriptPath: string
  // ── 回调蒸馏（依赖倒置：避免 deepsleep → distill 循环依赖）──
  distillAgent(agent: any): Promise<void>
  writeDispatch(sid: string, out: any, route: string, workspace: string | null): Promise<{ added: number; rejected: number; failed: number; targetLib: string }>
  // ── 注入的其余依赖（留在 distill 的共享设施）──
  writeProfileLine(root: string, target: string, section: string, line: string, replaceMatch?: string): { st: 'added' | 'dedup' | 'failed' } | { st: 'rejected'; why: string }
  validateProvider(): void
  runSelfCheck(trigger: 'deep-sleep' | 'timer' | 'manual'): Promise<{ verdict?: string; adjustments: string[] } | null>
  resolveLlm(sp: string, sm: string): { provider: string; model: string } | null
  resolveDefaultModel(): { provider: string; model: string } | undefined
  pickParent(): any | null
  parseAgentJson(result: any, label: string): any
  normalizeProfileTarget(raw: string): 'USER.md' | 'AGENT.md' | null
  locateTranscript(sid: string): Promise<string | null>
  hasActiveSubagents(sid: string): boolean
  ensureDaemonParent(signal: AbortSignal, agentOptions?: { provider: string; model: string }): Promise<any | null>
  bankSnapshot(label: string): Promise<void>
}

export function createDeepSleep(C: DeepSleepCtx) {
  const {
    log, audit, ledger, kRoot, auditFile, pendDir, candidateDir, PROFILE_HEADER, capEnv, llmState,
    // appCtx 重命名回 ctx：让迁出的 1419 行代码里的 `ctx.xxx` **一个字都不用改**
    appCtx: ctx, config, runNode, textOf, embedCfgOf, probeScriptPath,
    distillAgent, writeDispatch, writeProfileLine, validateProvider, runSelfCheck, resolveLlm,
    resolveDefaultModel, pickParent, parseAgentJson, normalizeProfileTarget, locateTranscript,
    hasActiveSubagents, ensureDaemonParent, bankSnapshot,
  } = C

  const DEEP_SLEEP_CHECK_MS = 600000 // 巡检间隔 10min（停滞阈值由 deepSleepIdleMs 独立控制）
  let lastActivityAt = Date.now() // 全局兜底水位（无在册会话时使用）
  let lastDeepSleepAt = 0
  // 连续「未消化」轮数（G-19 策略 C 用）：每轮 failed 累加，任一轮 done 归零。仅内存态——
  //   重启后从 0 起算（保守：宁可再重试几轮，也不因回放误判立刻放行丢料）。
  let deepSleepFailStreak = 0
  let deepSleepRunning = false
  /** 会话状态表：sid → SessRec（随 disposed 出表，防内存泄漏） */
  const sessions = new Map<string, SessRec>()

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
        // 2026-09-11：判据收敛到导出的 `deepSleepReplayable`（单一实现，供单测直接驱动编译产物）。
        // 旧判据只排 no-parent/no-traces（"无事可做"），漏排"做了但被拒"（attempted>0 && added=0）——
        // 那类轮次被当有效水位回放，那批痕迹就永久关在窗外（重启一次即丢料）。
        if (deepSleepReplayable(o) && t > lastDeepSleepAt) lastDeepSleepAt = t
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
  const applyPrinciples = async (memRoot: string, out: any): Promise<{ attempted: number; added: number; replaced: number; skipped: number; gate: string; gateExit: number; rejectedLines: string[] }> => {
    const principlesPath = join(memRoot, 'AGENT.md')
    const gateScript = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs')
    if (!existsSync(gateScript)) return { attempted: 0, added: 0, replaced: 0, skipped: 0, gate: 'write_gate 未就位', gateExit: -1, rejectedLines: [] }
    let content = ''
    try { content = readFileSync(principlesPath, 'utf8') } catch {
      content = PROFILE_HEADER['AGENT.md'] + '\n'
    }
    const origin = content
    const lines = content.split(/\r?\n/)
    let skipped = 0
    // v2.1 M0（ADR-130）：**attempted** = 模型提交的条目数（与 added 区分——gate 拒收时 added 会归零但 attempted 保留）；
    //   rejectedLines = 被门禁拒收时的候选行原文（进审计，便于下次直接定位「指针悬空 / 行格式」）
    let attempted = 0
    const pending: Array<{ kind: 'add' | 'replace'; idx: number; text: string; prev: string | null }> = []
    const rejectedLines: string[] = []
    for (const p of ((out && Array.isArray(out.principles)) ? out.principles : [])) {
      attempted++
      const text = String((p && p.text) || '').trim()
      if (!/^\[(原则|路径)\].+→\s*notes\/[A-Za-z0-9_-]+\.md/.test(text)) { skipped++; rejectedLines.push(`[format] ${text}`); continue } // 行格式宿主预检（v17：[路径] 同行门禁；gate 亦校验 [tag] 索引行）
      if (p && p.action === 'replace') {
        const match = String(p.match || '').trim()
        const idx = lines.findIndex((l) => l.trim() === match)
        if (idx < 0) { skipped++; rejectedLines.push(`[no-match] ${text}`); continue }
        pending.push({ kind: 'replace', idx, text, prev: lines[idx] })
        lines[idx] = text
      } else {
        if (lines.some((l) => l.trim().toLowerCase() === text.toLowerCase())) { skipped++; rejectedLines.push(`[dup] ${text}`); continue } // 去重
        pending.push({ kind: 'add', idx: lines.length, text, prev: null as string | null })
        lines.push(text)
      }
    }
    if (!pending.length) return { attempted, added: 0, replaced: 0, skipped, gate: 'no-op', gateExit: 0, rejectedLines }
    // v2.1 M2（ADR-130）：**逐条裁决** —— 单条不合格不再拖垮整轮；最后对并集再做一次总门（防并集超限），
    //   若并集超限则从尾部贪心回退，直到通过（被回退项按 `[gate:final]` 记账）。
    const baseLines = origin.split(/\r?\n/)
    const buildText = (items: typeof pending): string => {
      const t = baseLines.slice()
      for (const it of items) { if (it.kind === 'replace') t[it.idx] = it.text; else t.push(it.text) }
      return t.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n')
    }
    let lastExit = 0
    // v2.2 M5（ADR-130）：成熟度门（enforce=true 时生效；缺省 false=只记录）——
    //   A 来自 audit/maturation.jsonl（由 scripts/maturation-scan.mjs 按「跨日再现天数」计算）；查不到按 A0（未成熟）计。
    const AOf = (text: string): { A: number; key: string } => {
      const m = String(text).match(/→\s*notes\/([A-Za-z0-9_-]+)\.md\s*§([^/\s]+)/)
      if (!m) return { A: Number(MATURATION.A0 ?? 0.3), key: '（无指针）' }
      const key = `notes/${m[1]}.md §${m[2].trim()}`
      try {
        const rows = readFileSync(join(kRoot, 'audit', 'maturation.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
        const hit = rows.find((r) => `${r.file} §${r.section}` === key)
        return { A: hit ? Number(hit.A) : Number(MATURATION.A0 ?? 0.3), key }
      } catch { return { A: Number(MATURATION.A0 ?? 0.3), key } }
    }
    const gateText = async (body: string): Promise<{ ok: boolean; status: number; out: string }> => {
      const tmpPath = principlesPath + '.tmp'
      try {
        writeFileSync(tmpPath, body, 'utf8')
        const g = await runNode(config.nodeBin, gateScript, ['AGENT.md', tmpPath], { env: { MEMORY_ROOT: memRoot, ...capEnv() }, timeout: 20000 })
        lastExit = Number(g.status ?? -1)
        if (g.status !== 0) { try { unlinkSync(tmpPath) } catch { /* */ } }
        return { ok: g.status === 0, status: Number(g.status ?? -1), out: textOf(g) }
      } catch (e) { try { unlinkSync(tmpPath) } catch { /* */ } return { ok: false, status: -1, out: String((e as Error).message) } }
    }
    const reasonOf = (status: number): string => status === 1 ? '超限=原则间合并（本轮跳过）' : status === 2 ? '指针悬空/未注册' : status === 4 ? '行格式违规' : status === -1 ? '门禁执行异常' : `gate exit=${status}`
    const usePerItem = config.perItemGate !== false
    let acceptedItems = pending.slice()
    // v2.2 M5：成熟度门（enforce=true）—— A<gate 的升格候选直接降级 notes（不写入索引行）
    if (config.maturationEnforce === true) {
      const kept: typeof pending = []
      for (const it of pending) {
        const { A, key } = AOf(it.text)
        const v = maturationVerdict(A, true)
        if (v.ok) kept.push(it)
        else { skipped++; rejectedLines.push(`[maturation ${v.reason}] ${key} :: ${it.text}`) }
      }
      acceptedItems = kept
      if (!acceptedItems.length) return { attempted, added: 0, replaced: 0, skipped: attempted, gate: 'maturation-rejected', gateExit: -1, rejectedLines }
    }
    if (usePerItem) {
      acceptedItems = []
      for (const it of pending) {
        const g = await gateText(buildText([...acceptedItems, it]))
        if (g.ok) acceptedItems.push(it)
        else { skipped++; rejectedLines.push(`[gate:${reasonOf(g.status)}] ${it.text}`); log(`deep sleep: 逐条门禁拒收（${reasonOf(g.status)}）: ${it.text}`) }
      }
      if (!acceptedItems.length) return { attempted, added: 0, replaced: 0, skipped: attempted, gate: 'all-rejected', gateExit: lastExit, rejectedLines }
    }
    // 并集总门（防并集超限 / 交叉影响）：不通过则从尾部贪心回退
    let g2 = await gateText(buildText(acceptedItems))
    while (!g2.ok && acceptedItems.length > 1) {
      const dropped = acceptedItems.pop() as (typeof pending)[number]
      skipped++
      rejectedLines.push(`[gate:final ${reasonOf(g2.status)}] ${dropped.text}`)
      g2 = await gateText(buildText(acceptedItems))
    }
    if (!g2.ok) {
      if (acceptedItems[0]) rejectedLines.push(`[gate:final ${reasonOf(g2.status)}] ${acceptedItems[0].text}`)
      return { attempted, added: 0, replaced: 0, skipped: attempted, gate: reasonOf(g2.status), gateExit: lastExit, rejectedLines }
    }
    if (g2.ok) {
      // G-16（2026-09-12）：rename 失败必须**报失败**——原写法空 catch 吞异常后仍按 added>0 返回，
      //   而 deepSleepLanded(:357) 判据只看 added/attempted（不读 gate），会把「没落盘」判成 landed:true
      //   ⇒ 审计记已消化、水位推进、下轮不再重蒸 ⇒ 这批痕迹**静默永久丢失**（崩溃型，比拒收型更隐蔽）。
      //   修法要点是 **added 归 0**（只改 gate 无效，见上）；replaced 一并归 0 免污染判据台账；失败留日志。
      const cm = commitPrinciples(principlesPath + '.tmp', principlesPath)
      if (!cm.ok) {
        log(`deep sleep: 原则落盘失败（未写入，本轮判失败待重蒸）: ${cm.err}`)
        // 不往 rejectedLines 追加（Cody 2026-09-12 纠正，我采纳）：① 审计行已带 gate/gateExit/landed
        //   三字段，落盘失败在其中**直接可见**，追加是冗余；② 审计取 (rejectedLines||[]).slice(0,5)，
        //   已有 ≥5 条时追加的标记会被切掉（push 到尾部 = 写了也白写）；③ rejectedLines 语义是
        //   「被门禁拒收」，落盘失败不是拒收，混入会污染判据台账。可观测性由 log + 三字段承担。
        return { attempted, added: 0, replaced: 0, skipped: attempted, gate: COMMIT_FAILED_GATE, gateExit: -1, rejectedLines }
      }
      const addedN = acceptedItems.filter((i) => i.kind === 'add').length
      const replacedN = acceptedItems.filter((i) => i.kind === 'replace').length
      return { attempted, added: addedN, replaced: replacedN, skipped, gate: 'pass', gateExit: 0, rejectedLines }
    }
    return { attempted, added: 0, replaced: 0, skipped: attempted, gate: reasonOf(lastExit), gateExit: lastExit, rejectedLines }
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
      const minTraces = Number(TRIGGER.newTracesMin ?? 1) // B 档：读注册表（trigger.newTracesMin）
      if (!traces || traces.length < minTraces) { log(`deep sleep: 窗口内痕迹不足（${traces ? traces.length : 0} < ${minTraces}，起点 ${new Date(since).toLocaleString()}），窗口滑到当前，本轮不睡`); return 'no-traces' }
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
      const useProvider = !!resolvedLlm && llmState.providerFailCount < 2
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
        if (stop === 'completed' && out) llmState.providerFailCount = 0
        else if (useProvider && (stop !== 'completed' || !out)) llmState.providerFailCount++
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
          : { attempted: 0, added: 0, replaced: 0, skipped: 0, gate: `stop=${stop}`, gateExit: -1, rejectedLines: [] as string[] }
        // 双画像巩固：profileOps（add/replace，须 notes 源指针；格式/容量/去重门禁同蒸馏）
        let profileAdded = 0
        let profileTried = 0
        if (stop === 'completed' && out && Array.isArray(out.profileOps)) {
          const ops = out.profileOps.filter((o: any) => o && normalizeProfileTarget(String(o.target)) && ['add', 'replace'].includes(String(o.action)))
          for (const op of ops) {
            const r = writeProfileLine(resolved.root, String(op.target), String(op.section || ''), String(op.text || ''), op.action === 'replace' ? String(op.match || '') : undefined)
            if (r.st === 'added') profileAdded++
            else profileTried++ // G-19：有提案但未落地（容量/去重/门禁拒收）⇒ 计入 tried
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
        // G-19：汇总 principles 之外四通道（画像/指针/树/遗忘）的轮次结果，喂给 landed 判据。
        //   tried=有提案但未落地（含守卫跳过）；done=成功落地。
        const otherChannels: DeepSleepOtherChannels = {
          tried: profileTried + ptrRes.skipped + treeRes.skipped + forgetRes.skipped,
          done: profileAdded + ptrRes.updated + treeRes.applied + forgetRes.archived,
        }
        log(`deep sleep: stop=${stop} 原则 +${app.added}/替换 ${app.replaced}/跳过 ${app.skipped}（${app.gate}）画像 +${profileAdded} 指针更新 ${ptrRes.updated}/跳过 ${ptrRes.skipped}（${ptrRes.gate}）树 ops ${treeRes.applied}/跳过 ${treeRes.skipped}/归档 ${treeRes.archived} forget 归档 ${forgetRes.archived}/保留 ${forgetRes.kept}/跳过 ${forgetRes.skipped}`)
        // G-19 失败策略：本轮裁定**只算一次**，审计与下方返回值共用同一结果（防两处口径漂移——
        //   此前审计记 failed、真实返回 done 的相反 bug 正是两份判据各自演进所致）。
        const landedNow = deepSleepLanded(stop, out, app, otherChannels)
        const fp = liveFailPolicy()
        const pv = planDeepSleepVerdict(landedNow, fp.policy, deepSleepFailStreak, fp.maxRounds)
        audit({ kind: 'deep-sleep', stop, attempted: app.attempted, added: app.added, replaced: app.replaced, skipped: app.skipped, rejected: (app.rejectedLines || []).length, rejectedLines: (app.rejectedLines || []).slice(0, 5), profiles: profileAdded, pointers: ptrRes.updated, ptrSkipped: ptrRes.skipped, tree: treeRes.applied, treeSkipped: treeRes.skipped, forgetArchived: forgetRes.archived, forgetKept: forgetRes.kept, forgetSkipped: forgetRes.skipped, gate: app.gate, gateExit: app.gateExit, otherTried: otherChannels.tried, otherDone: otherChannels.done, landed: landedNow, failPolicy: fp.policy, failStreak: deepSleepFailStreak, released: pv.release })
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
        // v2.2 睡眠期自检（宿主义务：子代理只归纳，检测挂在其**完成之后**——守 [env] 子代理会话语义）
        if (config.selfCheck !== false) await runSelfCheck('deep-sleep')
        // v2.1 M2：**写入回执**（write.* 事件）——写入是否落地、被拒原因与原文，与上面的 decision.* 同址同版本
        ledger({
          type: 'write.consolidate', domain: 'consolidate', step: 'deep-sleep-write', channel: 'principles',
          carrier: 'always:index', target: 'AGENT.md',
          verdict: app.gate === 'pass' ? 'written' : (app.attempted ? 'rejected' : 'skipped'),
          attempted: app.attempted, written: app.added + app.replaced, added: app.added, replaced: app.replaced,
          reason: app.gate, gateExit: app.gateExit, rejectedLines: (app.rejectedLines || []).slice(0, 5),
          perItemGate: config.perItemGate !== false,
        })
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
        // 2026-09-11 补缺（静默丢料实锤）：**水位必须与「落地」解耦**——只按 stop=completed && out 判 done 会漏掉
        //   「代理跑完但候选被门禁全数拒收」的轮次（app.gate 为 all-rejected / maturation-rejected / 尾部总门失败，
        //   attempted>0 且 added=0）。此时判 done 会推进水位 → 被拒痕迹永久划出窗口 → 静默丢失（审计实证：
        //   08:32:23.997Z attempted=3/added=0/all-rejected 与 08:48:10.129Z attempted=1/added=0/all-rejected，
        //   两轮 stop=completed 即判 done 并滑窗，丢弃 4 条候选行）。故新增 landed 判据：
        //   landed = 任一通道有落地 → done；五通道皆无提案（真·空轮）→ done（回滚会导致同一批
        //   痕迹无限重处理，必须仍判 done）；只要有提案而**一件都没落地** → failed（水位回滚、下轮重试）。
        //   ⚠ G-19 关键修正（2026-09-12）：旧口径只看 principles 通道的 attempted，导致
        //   「纯 profileOps / 指针 / 树 / 遗忘 轮且全数失败」被误判 done ⇒ 材料静默丢弃。
        //   现把另外四通道的 tried/done 一并纳入（上面的 otherChannels）。
        //   ⚠ 遗留风险（待产品决定）：若某通道**永久**失败（如画像容量满），每轮都会判 failed
        //   ⇒ 水位不推进、同批材料每 idleMs（3h）重试一次且永不放弃。是否需要「连败 N 轮后放行」
        //   的熔断，取决于产品取向（这正是 G-19 选项 A/B/C 的实质）。
        //   2026-09-11 追加：`write_gate 未就位`（applyPrinciples 早返回 :1538，attempted=0）是**基础设施失败**
        //   （门禁脚本缺席 → 根本不可能落地），不得因 attempted===0 而误判 done——显式排除，强制 failed 重试。
        //   **单一实现**：判据抽为模块级纯函数 `deepSleepLanded`（顶部导出），本处与单测共用，防漂移。
        // G-19：必须传 otherChannels —— 此前只传 app，导致审计字段用了全通道判据、
        // 而真实判定仍走旧口径，二者互相矛盾（审计记 failed、代码返回 done ⇒ 水位推进、材料静默丢弃）。
        // 连败计数：streakNow = **含本轮**的连续未消化轮数，须在归零前取值（否则放行日志恒为 1）。
        const streakNow = deepSleepFailStreak + 1
        if (pv.verdict === 'done') deepSleepFailStreak = 0
        else deepSleepFailStreak = deepSleepFailStreak + 1
        if (pv.release) {
          // 必须留痕：放行 = 这批材料不再重捞（水位推进），是**有告警的丢料**，不可静默。
          log(`deep sleep: 连续 ${streakNow} 轮未消化，按 graded 策略放行（水位推进）以避免无限重试；请检查画像/指针/树/遗忘通道是否长期失败`)
          audit({ kind: 'deep-sleep-release', streak: streakNow, maxRounds: fp.maxRounds, note: '连败达上限，放行并告警' })
        }
        return pv.verdict
      } catch (e) {
        clearTimeout(timeout)
        if (useProvider) llmState.providerFailCount++
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

  // 对外句柄：distill 装配期取用（事件钩子用 noteEvent，巡检用 deepSleepCheck + DEEP_SLEEP_CHECK_MS，
  // 面板经 deepsleep-share 取 getDeepSleepStatus / runDeepSleepNow）。
  // sessions 也对外暴露：distill 的 `agent/disposed` / `session/disposed` 事件钩子要清表。
  return { DEEP_SLEEP_CHECK_MS, sessions, noteEvent, runDeepSleep, probeSession, deepSleepCheck, getDeepSleepStatus, runDeepSleepNow, getConfig }
}
