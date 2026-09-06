/**
 * distill.ts — ADR-0002 阶段 2：蒸馏器（自记忆插件 index.ts 迁入，写入分发重接 targets.ts）。
 *
 * 事件链（ADR-0004 模式）：ctx.on('session/event') turn/end(completed) 且 root agent → per-agent idle 定时器
 *   → 到点且 agent idle → 内存增量（snapshotEvents 水位后）→ 预筛（信号词 + pending 候选；皆无则跳过不唤醒）
 *   → spawn 蒸馏子代理（maxDepth=1，10min 超时 race）→ 结构化 JSON（route=memory|project|discard）
 *   → targets.ts 动态路由 + 各库白名单门禁（不符合不存）→ 零拷贝写入（memory-append / devref-card）
 *   → 水位推进（suite/knowledge/audit/distill-watermark.jsonl）→ 蒸馏审计（distill-audit.jsonl，UI 统计卡数据源）。
 *
 * 坑位防御（devref/pitfalls 全清单）：禁 spawnSync（全异步 runAsync）；定时器随 disposed 事件清理；
 * reload 后旧 ctx 失效→错误 catch+水位保留重试；maxDepth=1+persona 委派禁令+toolFilter；
 * 路由归一化未知回退 memory（宁滥勿丢）；LLM 路由连败≥2 弃用指定 provider 回落继承（本迁入版补强）。
 */
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import {
  dshHome, knowledgeRoot, memoryLibRoot, pmgScriptsRoot,
  memberPresent, resolveTarget, loadWhitelist, gateMemoryAppend, gateProjectCard,
  type Whitelist, type RouteTarget,
} from './targets.js'

type AppContext = {
  tools: { register(tool: unknown): unknown }
  llm: any
  subagents: { start(name: string, request: any): Promise<any> }
  agents: { get(id: string): any; list(): any[]; roots(): any[] }
  logger?: { info?(msg: string): void }
  on(event: string, handler: (arg: any, arg2?: any) => void): unknown
  effect(fn: () => any, key?: string): unknown
}

export interface DistillConfig {
  nodeBin: string
  idleWakeMs: number
  minTurnChars: number
  distillPrescan: boolean
  distillPrompt: string
  llmProvider: string
  llmModel: string
  defaultProject: string
  genericProject: string
  memberPackages: { memory: string; governance: string }
}

// ── 蒸馏裁决契约 v3（事实源=记忆仓 engine/distill-contract.md；守藏为执行宿主，契约文本不改动语义）──
// v3（2026-09-06 用户拍板）：判定锚从类别改为粒度——两库区别不是主题，是粒度分工。
export const DEFAULT_DISTILL_PROMPT = `你是知识整理蒸馏子代理（ADR-0005 v3）。任务：从给定会话增量正文中，判定每条可复用知识的归属（第一层路由），再输出结构化入册指令（由宿主执行写入，你无需也不能直接写文件/跑命令）。
判定锚（v3）：两库不是按主题分类，是按粒度分工——
- 记忆库=泛化元记忆（人脑类比）：只存「下次做类似任务时给 agent 的大概方向」——任务大概步骤轮廓/关键注意点/目标形态，粒度宁粗勿细。
- pmg 项目卡库=细粒度承载，内分两板块：board=generic 收官方性/规范性文档级信息（DSH 开发规范、官方规则、平台规则、工具用法资料）；board=project 收项目事实/开发中用户拍板的决策/项目专属契约踩坑细节。
第一层归属路由（对每条候选按序判定）：
- R1 泛化方向指引？这条知识的作用=下次做类似任务给大概方向？→ route=memory（粗粒度是特性，不要把细节条文塞进记忆库）
- R2 细粒度开发知识？官方规范/平台规则/开发规范条文（→board=generic）或某项目事实/用户决策/契约踩坑细节（→board=project）→ route=project
- R3 其余（一次性进度/可搜索公开知识/无实质/<relevant-memories>注入缓存/重复已有归属）→ route=discard
- 同一条既像 R1 又像 R2：能浓缩成一句方向指引的价值→R1；必须保留细节条文才有用→R2；两边都塞=双写漂移，禁止。
- 超出 R1/R2 范围一律不存；R2 且无承接插件→丢弃不回退记忆库。
- 拿不准 → route=memory 但 appends 留空记 skipped（宁缺毋滥）。
route=memory 时续走四问：Q0 已有归属？Q1 下周用得上？Q2 归谁（MEMORY/USER/AGENT）？Q3 能合并？
委派禁令：**独立完成，绝不 spawn/委派任何子代理**（查重凭给定正文与你自身知识判断）。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"route":"memory","appends":[{"target":"notes/tools.md","section":"<既有 ## 小节名>","text":"≤120字高密度"}],"newIndex":[{"target":"MEMORY.md","line":"[tool] ... → notes/x.md §小节"}],"projectCards":[{"cardType":"how-to|reference|decision","board":"generic|project","title":"≤20字","text":"≤200字","source":"≤30字"}],"migrationHint":"","skipped":[{"title":"...","reason":"≤30字"}]}
约束：route=memory → 填 appends/newIndex（target 白名单 notes/tools.md notes/flows.md notes/lessons.md notes/env.md notes/release.md；section 必须既有 ## 小节名；text 只写方向指引级浓缩，不搬细节条文），projectCards 留空；route=project → 填 projectCards（cardType: how-to=操作步骤/reference=契约事实/decision=架构决策；board 必填：generic=官方规范/平台规则，project=项目事实/用户决策，缺省按 project），appends/newIndex 留空，若该项目开发知识密集（连续踩坑/多契约）填 migrationHint（≤30字，提示宿主安排卡库迁移复核）；route=discard → 除 skipped 全空；与 route 不匹配的条目宿主拒收。`

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
      const mod = await import('file://' + p.replace(/\\/g, '/'))
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
export function registerDistill(ctx: AppContext, config: DistillConfig): void {
  const SHORT = 'shoucang-scheduler'
  const logFile = join(dshHome(), 'super-injector', SHORT + '.log')
  const kRoot = knowledgeRoot()
  const watermarkFile = join(kRoot, 'audit', 'distill-watermark.jsonl')
  const auditFile = join(kRoot, 'audit', 'distill-audit.jsonl')
  const pendDir = join(kRoot, 'pending')
  const log = (msg: string): void => { try { mkdirSync(dirname(logFile), { recursive: true }); appendFileSync(logFile, '[' + new Date().toISOString() + '] ' + msg + '\n') } catch { /* 静默 */ } }
  const audit = (o: Record<string, unknown>): void => { try { mkdirSync(dirname(auditFile), { recursive: true }); appendFileSync(auditFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n') } catch { /* 静默 */ } }
  const distilling = new Set<string>() // 并发守卫：同会话蒸馏在途标记（防 turn/end 重武装导致双写/竞态）

  const presence = () => ({
    memory: memberPresent(config.memberPackages.memory),
    governance: memberPresent(config.memberPackages.governance),
  })

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

  // E3 桥：反解会话所属 workspace（零拷贝调记忆仓 locate-transcript-probe）
  const resolveWorkspace = async (sid: string): Promise<string | null> => {
    try {
      const probe = join(memoryLibRoot(), 'scripts', 'locate-transcript-probe.mjs')
      if (!existsSync(probe)) return null
      const r = await runNode(config.nodeBin, probe, [sid], { timeout: 15000 })
      let file: string | null = null
      if (r.status === 0) file = textOf(r).trim().split('\n').find((l) => l.includes('session.jsonl')) || null
      if (!file) return null
      const m = file.match(/sessions[\\/]+(--.+?--)[\\/]/)
      if (!m) return null
      const ws = m[1].slice(2, -2).replace(/--/g, '\\').replace(/~0040/g, '@')
      if (!/^[A-Za-z]:/.test(ws)) return null
      return ws
    } catch { return null }
  }

  // ── 写入分发（ADR-0002 核心：动态路由 + 白名单门禁 + 零拷贝写入 + 审计）──
  const memAppend = async (target: string, kind: 'append' | 'new', payload: string, section: string, t: RouteTarget): Promise<RunResult> => {
    const script = join(memoryLibRoot(), 'scripts', 'memory-append.mjs')
    const args = kind === 'append' ? [target, section, payload] : [target, '-', '--new', payload]
    const env = t.library === 'shoucang-local' ? { MEMORY_ROOT: t.root } : undefined
    return runNode(config.nodeBin, script, args, { env, timeout: 20000 })
  }

  const writeDispatch = async (sid: string, out: any, route: string, workspace: string | null): Promise<{ added: number; rejected: number; failed: number; targetLib: string }> => {
    let added = 0, rejected = 0, failed = 0
    if (route === 'memory') {
      const { resolved } = resolveTarget('memory', presence())
      const { wl, source } = loadWhitelist(resolved.root, resolved.library)
      const gate = (t?: string): boolean => {
        const r = gateMemoryAppend({ target: t }, wl)
        if (!r.ok) { rejected++; audit({ sid, kind: 'gate-reject', target: t, reason: r.reason, lib: resolved.library }); log(`distill 拒收: ${r.reason?.slice(0, 120)}`) }
        return r.ok
      }
      const appends = (out && Array.isArray(out.appends)) ? out.appends : []
      const newIndex = (out && Array.isArray(out.newIndex)) ? out.newIndex : []
      if (resolved.library !== 'memory-plugin' && resolved.library !== 'shoucang-local') {
        for (const _a of appends) { rejected++; audit({ sid, kind: 'gate-reject', reason: 'memory 目标库不可用', lib: resolved.library }) }
        return { added, rejected, failed, targetLib: resolved.library }
      }
      for (const a of appends) {
        if (!a || !a.target || !a.section || !gate(a.target)) { if (a && (!a.target || !a.section)) failed++; continue }
        const r = await memAppend(String(a.target), 'append', String(a.text || '').trim(), String(a.section).trim(), resolved)
        if (r.status === 0) added++; else { failed++; log(`distill 落点失败 ${a.target}§${a.section}: ${textOf(r).slice(0, 120)}`) }
      }
      for (const ni of newIndex) {
        if (!ni || !ni.line) { failed++; continue }
        const t = String(ni.target || 'MEMORY.md')
        if (!gate(t)) continue
        const r = await memAppend(t, 'new', String(ni.line).trim(), '-', resolved)
        if (r.status === 0) added++; else { failed++; log(`distill 新索引失败: ${textOf(r).slice(0, 120)}`) }
      }
      audit({ sid, kind: 'distill-run', route, lib: resolved.library, wlSource: source, added, rejected, failed })
      return { added, rejected, failed, targetLib: resolved.library }
    }
    if (route === 'project') {
      const { resolved } = resolveTarget('project', presence())
      const cards = (out && Array.isArray(out.projectCards)) ? out.projectCards : []
      for (const pc of cards) {
        if (!pc || !pc.title || !pc.text) { failed++; continue }
        const wl: Whitelist = loadWhitelist(resolved.root, resolved.library).wl
        const g = gateProjectCard({ cardType: pc.cardType }, wl)
        if (!g.ok) { rejected++; audit({ sid, kind: 'gate-reject', target: pc.title, reason: g.reason, lib: resolved.library }); log(`distill 拒收: ${g.reason?.slice(0, 120)}`); continue }
        if (resolved.library === 'pmg-cards') {
          const script = join(pmgScriptsRoot(), 'devref-card.mjs')
          // 契约 v3：board=generic → 通用知识库宿主（config.genericProject，即 pmg 权威仓）；board=project → workspace 项目卡库
          const board = String(pc.board || 'project') === 'generic' ? 'generic' : 'project'
          const project = board === 'generic'
            ? (config.genericProject.trim() || '')
            : (workspace || (config.defaultProject.trim() || ''))
          if (!project || !existsSync(script)) {
            failed++
            const reason = !project ? (board === 'generic' ? '通用板块未配置 generic_project（宿主直写积压）' : '无目标项目（workspace 反解失败且未配 defaultProject）') : 'devref-card 未就位'
            audit({ sid, kind: 'write-fail', target: pc.title, reason, lib: 'pmg-cards' })
            try {
              // 降级积压（不丢知识；迁移工具并入时按标记分流）
              const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 30) || 'card'
              const tag = board === 'generic' ? '[board:generic]' : '[route:project]'
              const fb = join(pendDir, `${new Date().toISOString().slice(0, 10)}-proj-${sid.slice(0, 8)}-${slug}.md`)
              writeFileSync(fb, `# ${tag} ${pc.cardType || 'reference'} · ${pc.title}\n\n- 卡类型：${pc.cardType || 'reference'}\n- 板块：${board}\n- 溯源：${pc.source || ''}\n- 源会话：${sid}\n- 落点：${board === 'generic' ? '通用板块（配置 generic_project 后经迁移并入）' : 'pmg 缺席积压（装上后经迁移工具并入卡库）'}\n\n${pc.text}\n`, 'utf8')
              failed--; added++
            } catch (e2) { log(`distill project 卡积压兜底失败: ${String((e2 as Error).message).slice(0, 120)}`) }
            continue
          }
          const args = [project, '--title', String(pc.title).trim(), '--card-type', String(pc.cardType || 'reference').trim(), '--text', String(pc.text || '').trim()]
          if (pc.source) args.push('--source', String(pc.source).trim())
          const r = await runNode(config.nodeBin, script, args, { timeout: 20000 })
          if (r.status === 0) added++; else { failed++; audit({ sid, kind: 'write-fail', target: pc.title, reason: textOf(r).slice(0, 120), lib: 'pmg-cards' }) }
        } else {
          // local-pending 兜底：宿主直写防丢失积压（白名单已过；积压不过白名单语义见 ADR-0002 决策 4）
          try {
            const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 30) || 'card'
            const fb = join(pendDir, `${new Date().toISOString().slice(0, 10)}-proj-${sid.slice(0, 8)}-${slug}.md`)
            writeFileSync(fb, `# [route:project] ${pc.cardType || 'reference'} · ${pc.title}\n\n- 卡类型：${pc.cardType || 'reference'}\n- 溯源：${pc.source || ''}\n- 源会话：${sid}\n- 落点：pmg 缺席积压（装上后经迁移工具并入卡库）\n\n${pc.text}\n`, 'utf8')
            added++
          } catch (e2) { failed++; log(`distill project 卡积压兜底失败: ${String((e2 as Error).message).slice(0, 120)}`) }
        }
      }
      audit({ sid, kind: 'distill-run', route, lib: resolved.library, added, rejected, failed })
      return { added, rejected, failed, targetLib: resolved.library }
    }
    return { added, rejected, failed, targetLib: 'none' }
  }

  const distillAgent = async (agent: any): Promise<void> => {
    const sid = agent.id as string
    if (distilling.has(sid)) return // 并发守卫：蒸馏在途（最长 10min）内再触发直接跳过（防双写/竞态）
    if (agent.status && agent.status !== 'idle') { log(`distill: ${sid.slice(0, 8)} 已恢复活跃（status=${agent.status}），跳过`); return }
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
        log(`distill: ${sid.slice(0, 8)} 增量 ${deltaText.length} 字符 < 门槛，水位推进 ${lastSeq}→${maxSeq}（不蒸馏）`)
        return
      }
      if (config.distillPrescan !== false) {
        const hasSig = hasDistillSignals(deltaText)
        if (!hasSig && candFiles.length === 0) {
          writeWatermark(sid, maxSeq)
          log(`distill: ${sid.slice(0, 8)} 预筛跳过（增量 ${deltaText.length} 字符无信号词 & pending 无候选），水位推进 ${lastSeq}→${maxSeq}`)
          return
        }
        log(`distill: ${sid.slice(0, 8)} 预筛通过（信号词=${hasSig}，pending 候选=${candFiles.length}），进入蒸馏`)
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
      const userInput = [
        `## 待蒸馏会话\nsessionId=${sid}（内存增量，水位 ${lastSeq}→${maxSeq}）`,
        `## 会话增量正文\n${deltaText}`,
        candIncluded.length ? `## 待固化候选（pending/ 中 ${candIncluded.length}/${candFiles.length} 个，预算 ${CAND_BUDGET} 字符内）\n${candText}` : (candFiles.length ? '（待固化候选超预算，本轮不携带；候选保留 pending 待下轮）' : '（无待固化候选）'),
        '请按规则处理：裁决可复用知识点并输出入册指令 JSON。',
      ].join('\n\n')

      const useProvider = config.llmProvider && config.llmModel && providerFailCount < 2
      const agentOptions = useProvider ? { provider: config.llmProvider, model: config.llmModel } : undefined
      const ac = new AbortController()
      const timeout = setTimeout(() => { try { ac.abort(new Error('distill timeout 10min')) } catch { /* */ } }, 600000)
      try {
        const run2 = await ctx.subagents.start('spawn', {
          label: `distill-${sid.slice(0, 8)}`,
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
        let out: any = null
        if (result && Array.isArray(result.output)) {
          const joined = result.output.filter((b: any) => b && b.type === 'text').map((b: any) => b.text).join('').trim()
          const cleaned = joined.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
          try { out = JSON.parse(cleaned) } catch (e1) {
            const m = cleaned.match(/\{[\s\S]*\}/)
            if (m) { try { out = JSON.parse(m[0]) } catch (e2) { log(`distill: ${sid.slice(0, 8)} JSON 解析失败: ${String((e2 as Error).message).slice(0, 80)}`) } }
            else log(`distill: ${sid.slice(0, 8)} JSON 解析失败: ${String((e1 as Error).message).slice(0, 80)}`)
          }
        }
        if (stop === 'completed' && out) providerFailCount = 0
        else if (useProvider && (stop !== 'completed' || !out)) providerFailCount++
        const rawRoute = (out && typeof out.route === 'string') ? out.route.trim().toLowerCase() : ''
        const route = ['memory', 'project', 'discard'].includes(rawRoute) ? rawRoute : 'memory' // 归一化+未知回退 memory（宁滥勿丢）
        const workspace = await resolveWorkspace(sid)
        const disp = route === 'discard'
          ? { added: 0, rejected: 0, failed: 0, targetLib: 'none' }
          : await writeDispatch(sid, out, route, workspace)
        log(`distill: ${sid.slice(0, 8)} stop=${stop} route=${route} → ${disp.targetLib} 入册 ${disp.added} / 拒收 ${disp.rejected} / 失败 ${disp.failed}`)
        audit({ sid, kind: 'distill-run', route, stop, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed })
        if (disp.added > 0 && candIncluded.length) {
          const procDir = join(pendDir, '.processed')
          try { mkdirSync(procDir, { recursive: true }); for (const f of candIncluded) { try { renameSync(join(pendDir, f), join(procDir, f)) } catch { /* */ } } } catch { /* */ }
        }
        if (stop === 'completed') {
          writeWatermark(sid, maxSeq)
          log(`distill: ${sid.slice(0, 8)} completed，水位推进 → ${maxSeq}`)
        } else {
          log(`distill: ${sid.slice(0, 8)} stop=${stop}，水位保留 ${lastSeq} 待下轮重试`)
        }
      } catch (e) {
        clearTimeout(timeout)
        if (useProvider) providerFailCount++
        log(`distill ERROR ${sid.slice(0, 8)}: ${String((e as Error)?.message || e).slice(0, 200)}`)
      }
    } catch (e) {
      log(`distill agent err ${sid.slice(0, 8)}: ${String((e as Error)?.message || e).slice(0, 120)}`)
    } finally { distilling.delete(sid) }
  }

  // ── 事件订阅（effect 自动清理，reload 零泄漏）──
  const idleTimers = new Map<string, any>()
  const armIdleTimer = (agent: any): void => {
    const sid = agent.id as string
    const old = idleTimers.get(sid)
    if (old) clearTimeout(old)
    const t = setTimeout(() => {
      idleTimers.delete(sid)
      distillAgent(agent).catch((e) => log(`distill agent err ${sid.slice(0, 8)}: ${String((e as Error)?.message || e).slice(0, 120)}`))
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
      armIdleTimer(agent)
    } catch { /* 事件回调零抛出 */ }
  })
  ctx.on('agent/disposed', ({ agent }: any) => {
    try { const t = idleTimers.get(agent.id); if (t) { clearTimeout(t); idleTimers.delete(agent.id) } } catch { /* */ }
  })
  ctx.on('session/disposed', (session: any) => {
    try { const sid = session && session.id; const t = idleTimers.get(sid); if (t) { clearTimeout(t); idleTimers.delete(sid) } } catch { /* */ }
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
}
