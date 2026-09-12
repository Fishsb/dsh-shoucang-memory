// distill-write.ts — 蒸馏「写回与派发（画像行 / 索引登记 / 卡片派发 / defer 回流 / claim 并发闸）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（8 项）。
//   对外只暴露 createWriteApi(d) —— 返回绑定后的句柄，调用方零感知。
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { memoryLibRoot, dshHome, resolveTarget, loadWhitelist, gateMemoryAppend } from './targets.js'
import type { RouteTarget } from './targets.js'
import { runNode, textOf } from './distill-proc.js'
import type { RunResult } from './distill-proc.js'
import { semanticSim } from './vec.js'
import type { EmbedCfg } from './vec.js'
import type { InfraApi } from './distill-infra.js'
import type { CandApi } from './distill-candidates.js'
import type { LlmApi } from './distill-llm.js'
import type { DistillState } from './distill-state.js'

export interface WriteDeps {
  kRoot: string
  pendDir: string
  embedCfgOf(): EmbedCfg
  infra: InfraApi
  cand: CandApi
  llm: LlmApi
  st: DistillState
  config: any
}

/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never

export function createWriteApi(dep: WriteDeps) {
  return {
    liveCaps: (...a: Tail<Parameters<typeof liveCaps>>) => liveCaps(dep, ...a),
    capEnv: (...a: Tail<Parameters<typeof capEnv>>) => capEnv(dep, ...a),
    memAppend: (...a: Tail<Parameters<typeof memAppend>>) => memAppend(dep, ...a),
    normalizeProfileTarget: (...a: Tail<Parameters<typeof normalizeProfileTarget>>) => normalizeProfileTarget(dep, ...a),
    profileCapOf: (...a: Tail<Parameters<typeof profileCapOf>>) => profileCapOf(dep, ...a),
    PROFILE_HEADER,
    writeProfileLine: (...a: Tail<Parameters<typeof writeProfileLine>>) => writeProfileLine(dep, ...a),
    registerIndexMeta: (...a: Tail<Parameters<typeof registerIndexMeta>>) => registerIndexMeta(dep, ...a),
    writeDispatch: (...a: Tail<Parameters<typeof writeDispatch>>) => writeDispatch(dep, ...a),
    flushDeferCards: (...a: Tail<Parameters<typeof flushDeferCards>>) => flushDeferCards(dep, ...a),
    MAX_DISPATCH_RETRY,
    hasPendingUndigested: (...a: Tail<Parameters<typeof hasPendingUndigested>>) => hasPendingUndigested(dep, ...a),
    CLAIM_TTL_MS,
    claimDirOf: (...a: Tail<Parameters<typeof claimDirOf>>) => claimDirOf(dep, ...a),
    claimFileOf: (...a: Tail<Parameters<typeof claimFileOf>>) => claimFileOf(dep, ...a),
    tryClaim: (...a: Tail<Parameters<typeof tryClaim>>) => tryClaim(dep, ...a),
    claimHeld: (...a: Tail<Parameters<typeof claimHeld>>) => claimHeld(dep, ...a),
    releaseClaim: (...a: Tail<Parameters<typeof releaseClaim>>) => releaseClaim(dep, ...a),
  }
}
export type WriteApi = ReturnType<typeof createWriteApi>




// 容量门实时读取（2026-09-10：面板调容量门后写门即时生效，不必重载插件）——
// 优先 scheduler.json 的 capAgent/capUser/capMemory（= 面板同源），回落启动期 config 值。
const liveCaps = (dep: WriteDeps, ): { agent: number; user: number; memory: number } => {
  const d = { agent: dep.config.capAgent ?? 3000, user: dep.config.capUser ?? 3000, memory: dep.config.capMemory ?? 5000 }
  try {
    const s = JSON.parse(readFileSync(join(dshHome(), 'suite', 'scheduler.json'), 'utf8')) as Record<string, unknown>
    if (typeof s.capAgent === 'number' && s.capAgent > 0) d.agent = s.capAgent
    if (typeof s.capUser === 'number' && s.capUser > 0) d.user = s.capUser
    if (typeof s.capMemory === 'number' && s.capMemory > 0) d.memory = s.capMemory
  } catch { /* 配置不可读=用启动值 */ }
  return d
}




const capEnv = (dep: WriteDeps, ): Record<string, string> => {
  const c2 = liveCaps(dep, )
  return { SHOUCANG_CAP_MEMORY: String(c2.memory), SHOUCANG_CAP_USER: String(c2.user), SHOUCANG_CAP_AGENT: String(c2.agent) }
}




// ── 写入分发（ADR-0002 核心：动态路由 + 白名单门禁 + 零拷贝写入 + 审计）──
const memAppend = async (dep: WriteDeps, target: string, kind: 'append' | 'new', payload: string, section: string, t: RouteTarget): Promise<RunResult> => {
  const script = join(memoryLibRoot(), 'scripts', 'memory-append.mjs')
  const args = kind === 'append' ? [target, section, payload] : [target, '-', '--new', payload]
  return runNode(dep.config.nodeBin, script, args, { env: { MEMORY_ROOT: t.root, ...capEnv(dep, ) }, timeout: 20000 })
}




// ── 双画像维护（2026-09-08 用户拍板：蒸馏/睡眠不只补记忆，还更新 USER/AGENT 双画像——助理角色要有自我认知）
//    v16：AGENT.md 升格为「成长型自我画像」（含 [原则] 习得原则），容量 2,000→3,000 ──
// v5.1（2026-09-10 架构体检实锤）：契约教模型输出 target=USER|AGENT，写门却只认 USER.md|AGENT.md →
//   蒸馏 profiles 通道自 v15 上线以来每次写入必被拒（审计 kind=gate-reject target=USER/AGENT 为证）。
//   模型输出的用词漂移一律在宿主侧收敛——与下方 section 归一化（前导 §/## 前缀）同法，不回退成「拒收」。
const normalizeProfileTarget = (dep: WriteDeps, raw: string): 'USER.md' | 'AGENT.md' | null => {
  const k = String(raw || '').trim().toLowerCase().replace(/\.md$/, '')
  return k === 'user' ? 'USER.md' : k === 'agent' ? 'AGENT.md' : null
}



// 容量门同源（补齐 2026-09-10「画像/记忆容量与容量门同源」漏掉的第三处源：此处原为硬编码 3,000）
const profileCapOf = (dep: WriteDeps, canon: 'USER.md' | 'AGENT.md'): number => (canon === 'USER.md' ? liveCaps(dep, ).user : liveCaps(dep, ).agent)



const PROFILE_HEADER: Record<string, string> = {
  'USER.md': '# USER.md — 用户画像\n\n> 「人」的画像：用户稳定偏好/背景/禁忌。库中唯一直接关于用户的文件；其余（notes/原则/索引/AGENT.md）皆为 agent 自身资产。写入口=蒸馏 profileUpdates + 深度睡眠 profileOps；每行带源指针。',
  'AGENT.md': '# AGENT.md — Agent 自我画像（助理的成长档案）\n\n> 用户助理角色的自我认知：角色定位/稳定做法/能力边界/常犯错误与教训/[原则] 习得原则（深度睡眠归纳内化，v16）。库中其余一切（notes/索引）都是本 agent 为履行助理职责而积累的自身资产，本文件只回答「我是谁、我学到了什么、我怎样服务好用户」。写入口=蒸馏 profileUpdates + 深度睡眠（原则行 + profileOps）；每行带源指针。',
}



/**
 * 画像行写入（宿主直写，tmp+rename 原子）：小节存在→小节尾加行；不存在→文件尾建小节。
 * 门禁：target 归一化后仅 USER.md/AGENT.md、小节名防注入、单行 ≤160 字符、库容量按 liveCaps(dep, )、去重、replace 须 match 逐字存在。
 * 返回带拒因（v5.1）：拒收原因写真进审计，不再糊成一句「格式/容量门」导致无法诊断。
 */
const writeProfileLine = (dep: WriteDeps, root: string, target: string, section: string, line: string, replaceMatch?: string): { st: 'added' | 'dedup' | 'failed' } | { st: 'rejected'; why: string } => {
  try {
    const canon = normalizeProfileTarget(dep, target)
    if (!canon) return { st: 'rejected', why: `target 非画像（${String(target).slice(0, 24)}）` }
    const sec = String(section || '').trim().replace(/^##+ */, '').trim()
    const ln = String(line || '').trim()
    if (!sec || !ln || ln.length > 160 || /[#`]/.test(sec)) return { st: 'rejected', why: `格式违规（${!sec ? '小节名为空' : !ln ? '行为空' : ln.length > 160 ? `行长 ${ln.length} > 160` : '小节名含 # 或 ` 注入字符'}）` }
    const file = join(root, canon)
    let body = ''
    try { body = readFileSync(file, 'utf8') } catch { body = (PROFILE_HEADER[canon] || `# ${canon}\n`) + '\n' }
    if (body.split('\n').some((l) => l.trim() === ln)) return { st: 'dedup' }
    const cap = profileCapOf(dep, canon)
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
const registerIndexMeta = (dep: WriteDeps, root: string, targetFile: string, indexLine: string, sid: string): void => {
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
    const row = `| ${topic} | ${new Date().toISOString().slice(0, 10)} | agent | active | 蒸馏 ${dep.infra.sidShort(sid)} 新增 |`
    const lines = body.split('\n')
    const note = lines.findIndex((l) => l.startsWith('> 维护规则：新增条目'))
    lines.splice(note > -1 ? note : lines.length, 0, row)
    const tmp = idxFile + '.tmp'
    writeFileSync(tmp, lines.join('\n'), 'utf8')
    renameSync(tmp, idxFile)
  } catch { /* 台账登记失败不阻断索引写入 */ }
}




const writeDispatch = async (dep: WriteDeps, sid: string, out: any, route: string, workspace: string | null): Promise<{ added: number; rejected: number; failed: number; targetLib: string }> => {
  let added = 0, rejected = 0, failed = 0
  if (route === 'memory') {
    const resolved = resolveTarget()
    if (!resolved.present) {
      for (const _a of ((out && Array.isArray(out.appends)) ? out.appends : [])) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', reason: '记忆库缺席（部署残缺）', lib: resolved.library }) }
      return { added, rejected, failed, targetLib: resolved.library }
    }
    const { wl, source } = loadWhitelist(resolved.root)
    const gate = (t?: string): boolean => {
      const r = gateMemoryAppend({ target: t }, wl)
      if (!r.ok) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: t, reason: r.reason, lib: resolved.library }); dep.infra.log(`distill 拒收: ${r.reason?.slice(0, 120)}`) }
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
      const r = await memAppend(dep, String(a.target), 'append', _base + _rc + _aw, _sec, resolved)
      if (r.status === 0) added++; else { failed++; dep.infra.log(`distill 落点失败 ${a.target}§${a.section}: ${textOf(r).slice(0, 120)}`) }
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
        const tn = dep.cand.intentTokens(themeNew)
        let dup = 'none'
        const sameTagLines: string[] = []
        try {
          for (const ol of readFileSync(join(resolved.root, t), 'utf8').split(/\r?\n/)) {
            const m = ol.match(/^\[([^\]\s]+)\]\s*([^·]+?)\s*·/)
            if (!m || m[1] !== tagNew) continue
            const themeOld = m[2].trim()
            if (themeOld === themeNew) { dup = 'exact'; break }
            const to = dep.cand.intentTokens(themeOld)
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
            const ecfg = dep.embedCfgOf()
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
          dep.infra.audit({ sid, kind: 'gate-reject', target: t, reason: `dup-index-topic:${dup}` })
          dep.infra.log(`distill 拒收: 索引行重复（${dup} ${tagNew}/${themeNew.slice(0, 20)}），保留原指针（同类同事实唯一）`)
          continue
        }
      }
      const r = await memAppend(dep, t, 'new', nl, '-', resolved)
      if (r.status === 0) { added++; registerIndexMeta(dep, resolved.root, t, nl, sid) } else { failed++; dep.infra.log(`distill 新索引失败: ${textOf(r).slice(0, 120)}`) }
    }
    // 双画像：Q2「归谁」的 USER/AGENT 通道（宿主直写，格式/容量/去重门禁）
    const profiles = (out && Array.isArray(out.profiles)) ? out.profiles : []
    const date = new Date().toISOString().slice(0, 10)
    for (const p of profiles) {
      if (!p || !p.target || !p.section || !p.text) { failed++; continue }
      const w = writeProfileLine(dep, resolved.root, String(p.target).trim(), String(p.section), `- ${String(p.text).trim()} ← 源: distill ${dep.infra.sidShort(sid)} ${date}`)
      if (w.st === 'added') added++
      else if (w.st === 'rejected') { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: p.target, reason: `画像更新被拒（${w.why}）` }) }
      else if (w.st === 'failed') failed++
      // dedup：静默不计
    }
    dep.infra.audit({ sid, kind: 'distill-run', route, lib: resolved.library, wlSource: source, added, rejected, failed })
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
          const deferFile = join(dep.pendDir, `${date}-project-defer-${slug}.md`)
          // 幂等：同题降级文件已存在 → 不重复堆积，只审计计数（防止每轮蒸馏重复降级同一批）
          if (existsSync(deferFile)) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: pc.title, reason: 'workspace 反解失败 → 降级 pending 已存在（去重），待认领' }); continue }
          mkdirSync(dep.pendDir, { recursive: true })
          writeFileSync(deferFile, `# [project-defer] ${pc.title}\n\n- 卡类型：${pc.cardType || 'reference'}\n- 源会话：${sid}\n- 溯源：${pc.source || ''}\n- 状态：workspace 反解失败降级暂存，待蒸馏重裁决或人工认领\n\n${pc.text}\n`, 'utf8')
          rejected++ // 未入册（defer=暂存非入册）
          dep.infra.audit({ sid, kind: 'gate-reject', target: pc.title, reason: 'workspace 反解失败 → 降级 pending 待认领（不丢弃）' })
        } catch (e3) { failed++; dep.infra.log(`distill project-defer 落盘失败: ${String((e3 as Error).message).slice(0, 120)}`) }
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
      if (dep.cand.cardTokens(title).length < 2) return null
      for (const ex of existingCardTitles) {
        if (ex === title) return ex
        if (dep.cand.cardSimilar(title, ex) >= 0.42) return ex
      }
      return null
    }
    for (const pc of cards) {
      if (!pc || !pc.title || !pc.text) { failed++; continue }
      const cardType = cardTypes.includes(String(pc.cardType || '')) ? String(pc.cardType) : 'reference'
      if (!cardTypes.includes(String(pc.cardType || ''))) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: pc.title, reason: `cardType=${pc.cardType} 不在 [${cardTypes.join(',')}]` }); continue }
      const dupOf = cardDupOf(String(pc.title))
      if (dupOf) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: pc.title, reason: `项目卡重复（语义近似既有卡「${dupOf}」）——跳过防重复产卡`, lib: 'workspace' }); dep.infra.log(`distill 项目卡判重跳过: ${String(pc.title).slice(0, 30)}（≈ ${dupOf.slice(0, 30)}）`); continue }
      try {
        const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'card'
        mkdirSync(dir, { recursive: true })
        const fb = join(dir, `${date}-${cardType}-${slug}.md`)
        writeFileSync(fb, `# [项目事实] ${cardType} · ${pc.title}\n\n- 卡类型：${cardType}\n- 溯源：${pc.source || ''}\n- 源会话：${sid}\n- 工作区：${workspace}\n\n${pc.text}\n`, 'utf8')
        added++
      } catch (e2) { failed++; dep.infra.log(`distill 项目事实直写失败: ${String((e2 as Error).message).slice(0, 120)}`) }
    }
    dep.infra.audit({ sid, kind: 'distill-run', route, lib: 'workspace', added, rejected, failed })
    return { added, rejected, failed, targetLib: 'workspace' }
  }
  return { added, rejected, failed, targetLib: 'none' }
}




// ── pending defer 卡直写（2026-09-10：project-defer 是「已裁决为项目卡」的降级暂存——workspace 恢复后
//    应直接直写该工作区 devref，不再让 LLM 重裁决（重裁决会按本轮会话 route 一刀切导致项目卡被 skip 丢失）。
//    flush 成功后移入 .processed（防重复）；workspace 仍不可解则留 pending 等下轮。──
const flushDeferCards = async (dep: WriteDeps, ): Promise<{ written: number; kept: number }> => {
  let written = 0, kept = 0
  let files: string[] = []
  try { files = readdirSync(dep.pendDir).filter((f) => /^\d{4}-\d{2}-\d{2}-project-defer-.*\.md$/.test(f)) } catch { return { written, kept } }
  for (const f of files) {
    try {
      const raw = readFileSync(join(dep.pendDir, f), 'utf8')
      const sidM = raw.match(/^-\s*源会话：\s*(session-\S+)/m)
      const titleM = raw.match(/^#\s*\[project-defer\]\s*(.+)$/m)
      const typeM = raw.match(/^-\s*卡类型：\s*(\S+)/m)
      if (!sidM || !titleM) { kept++; dep.infra.log(`defer 保留 ${f.slice(0, 40)}: 解析失败 sid=${!!sidM} title=${!!titleM}`); continue }
      const ws = await dep.llm.resolveWorkspace(sidM[1].trim())
      if (!ws) { kept++; dep.infra.log(`defer 保留 ${f.slice(0, 40)}: workspace 不可解（sid=${sidM[1].trim().slice(0, 18)}）`); continue } // workspace 仍不可解：留 pending
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
        if (dep.cand.cardTokens(title).length < 2) return null
        try {
          for (const ef of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
            const m = readFileSync(join(dir, ef), 'utf8').match(/^#\s*\[项目事实\][^·]*·\s*(.+)$/m)
            if (!m) continue
            const ex = m[1].trim()
            if (ex === title) return ex
            if (dep.cand.cardSimilar(title, ex) >= 0.42) return ex
          }
        } catch { /* 读取失败=不判重 */ }
        return null
      })()
      if (!dupTitle && !existsSync(out)) writeFileSync(out, `# [项目事实] ${cardType} · ${title}\n\n- 卡类型：${cardType}\n- 溯源：（defer 回流 ${f}）\n- 源会话：${sidM[1].trim()}\n- 工作区：${ws}\n\n${body}\n`, 'utf8')
      const procDir = join(dep.pendDir, '.processed')
      try { mkdirSync(procDir, { recursive: true }); renameSync(join(dep.pendDir, f), join(procDir, f)) } catch { /* 移动失败：下轮重试 */ }
      written++
      dep.infra.audit({ kind: 'defer-flush', target: title, workspace: ws, cardType, file: f, sid: sidM[1].trim(), ...(dupTitle ? { dupOf: dupTitle } : {}) })
      dep.infra.log(`defer 回流: ${title.slice(0, 30)} → ${ws}/docs/devref/shoucang/${dupTitle ? `（判重跳过 ≈${dupTitle.slice(0, 24)}）` : ''}`)
    } catch (e) { kept++; dep.infra.log(`defer 回流失败 ${f.slice(0, 30)}: ${String((e as Error)?.message || e).slice(0, 100)}`) }
  }
  if (written || kept) dep.infra.log(`defer 回流汇总: 写入 ${written} / 保留 ${kept}`)
  return { written, kept }
}




// ── A1（2026-09-11 审查修复）：段落级落盘失败的有界重试 ──
// 语义：stop/JSON 都 OK 但条目级写失败（白名单外目标、磁盘错误、原子写失败…）时**不再前移水位**；
// 同一段连续失败满 MAX_DISPATCH_RETRY 次后强制推进 + 落审计 dispatch-failed-forced（丢失显式记账）。
const MAX_DISPATCH_RETRY = 3


// sid → 因未消化段而「扣住不推」的连续轮数
// 本会话是否还有未消化段（= dispatchFailStreak 里还有它自己的失败段记账）
const hasPendingUndigested = (dep: WriteDeps, sid: string): boolean => {
  const p = `${sid}#`
  for (const k of dep.st.dispatchFailStreak.keys()) if (k.startsWith(p)) return true
  return false
}



// 判据本身是**模块级纯函数** `planSkipWatermark`（见 planDiscardWrite 附近），与 G-20 同规格，
// 便于脱离宿主直接驱动；这里只持有状态（内存态，重载清零 ⇒ 最多再扣 SKIP_HOLD_MAX 轮）。

// ── A3（2026-09-11 审查修复）：跨实例 claim 锁**统一判定** ──
// 背景：claim 原只在 sweepBacklog 一侧读判，idle 路径（armIdleTimer → distillAgent）完全不查 ⇒
//   重叠 fiber 的 idle 定时器可与扫尾同时蒸同一会话（注释宣称的「跨实例防双蒸」不成立）。
// 现语义：claim 的**写**只发生在蒸馏入口（幂等）；扫尾只做只读让位判定；本轮结束/早退即释放。
const CLAIM_TTL_MS = 25 * 60000



const claimDirOf = (dep: WriteDeps, ): string => join(dep.kRoot, 'audit', 'claims')



const claimFileOf = (dep: WriteDeps, sid: string): string => join(claimDirOf(dep, ), sid + '.json')



/** 在途 claim（TTL 内）→ false（让位）；否则写入并返回 true。异常一律 true（claim 失败不阻塞，与既有语义一致） */
const tryClaim = (dep: WriteDeps, sid: string, lastSeq: number, maxSeq: number): boolean => {
  try {
    let at = 0
    try { at = Number((JSON.parse(readFileSync(claimFileOf(dep, sid), 'utf8')) as { at?: number }).at || 0) } catch { /* 无 claim */ }
    if (at && Date.now() - at < CLAIM_TTL_MS) return false
    mkdirSync(claimDirOf(dep, ), { recursive: true })
    writeFileSync(claimFileOf(dep, sid), JSON.stringify({ at: Date.now(), lastSeq, maxSeq }), 'utf8')
    return true
  } catch { return true }
}



const claimHeld = (dep: WriteDeps, sid: string): boolean => {
  try {
    const at = Number((JSON.parse(readFileSync(claimFileOf(dep, sid), 'utf8')) as { at?: number }).at || 0)
    return !!at && Date.now() - at < CLAIM_TTL_MS
  } catch { return false }
}



const releaseClaim = (dep: WriteDeps, sid: string): void => { try { unlinkSync(claimFileOf(dep, sid)) } catch { /* 无 claim/删除失败均无害 */ } }
