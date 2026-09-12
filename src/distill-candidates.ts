// distill-candidates.ts — 蒸馏「流程候选（意图指纹 / 卡片相似度 / 候选落盘）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（3 项）。
//   对外只暴露 createCandApi(d) —— 返回绑定后的句柄，调用方零感知。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { semanticSim } from './vec.js'
import { promoteVerdict } from './criteria.js'
import type { EmbedCfg } from './vec.js'
import type { DistillState } from './distill-state.js'

export interface CandDeps {
  candidateDir: string
  embedCfgOf(): EmbedCfg
  ledger(o: Record<string, unknown>): void
}

/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never

export function createCandApi(d: CandDeps) {
  return {
    intentOf: (...a: Tail<Parameters<typeof intentOf>>) => intentOf(d, ...a),
    intentTokens: (...a: Tail<Parameters<typeof intentTokens>>) => intentTokens(d, ...a),
    cardTokens: (...a: Tail<Parameters<typeof cardTokens>>) => cardTokens(d, ...a),
    cardSimilar: (...a: Tail<Parameters<typeof cardSimilar>>) => cardSimilar(d, ...a),
    ensureFlowCandidate: (...a: Tail<Parameters<typeof ensureFlowCandidate>>) => ensureFlowCandidate(d, ...a),
  }
}
export type CandApi = ReturnType<typeof createCandApi>

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


const intentOf = (d: CandDeps, deltaText: string): string => {
  const m = String(deltaText || '').match(/^\[user\]\s*([\s\S]{0,120})/m)
  return m ? m[1].trim().replace(/\s+/g, ' ') : ''
}


// 语义指纹：intent → 判别 token 集（CJK 双字滑动 + 英文 ≥4 词），供同型判定（词法地板，零依赖）
const intentTokens = (d: CandDeps, text: string): string[] => {
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
const cardTokens = (d: CandDeps, text: string): string[] => {
  const t = String(text || '').replace(/[^\w\u4e00-\u9fa5]+/g, ' ').trim()
  const out = new Set<string>()
  for (const w of t.split(' ')) if (/[A-Za-z0-9]/.test(w) && w.length >= 2) out.add(w.toLowerCase())
  const zh = (t.match(/[\u4e00-\u9fa5]+/g) || []).join('')
  for (let i = 0; i + 1 < zh.length; i++) out.add(zh.slice(i, i + 2))
  return [...out]
}


const cardSimilar = (d: CandDeps, a: string, b: string): number => {
  const A = cardTokens(d, a), B = cardTokens(d, b)
  if (!A.length || !B.length) return 0
  const inter = A.filter((x) => B.includes(x)).length
  return inter / Math.min(A.length, B.length)
}


// 候选噪声闸：判别实现已上提为模块级 `isNoiseIntent`（单一实现，候选区 + 打扰度采样共用；2026-09-11 ACT-024）
const ensureFlowCandidate = async (d: CandDeps, sid: string, intent: string): Promise<void> => {
  if (!intent || intent.length < 8 || isNoiseIntent(intent)) return
  try {
    mkdirSync(d.candidateDir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    // 同型聚合（memory-core-model §4 转正数据源）：intent 指纹与既有候选「类型线索」共享 ≥2 token 视为同型，
    // 追加本次源会话 + 成功计数到既有文件（跨会话可见重复 → 深睡可归纳 [路径]），否则新建候选。
    // v6 向量第二批：词法无同型时再走语义（dense ≥0.80 保守并，补措辞迥异漏网；embed 未启用/失败=新建）
    const tokens = intentTokens(d, intent)
    let matched: string | null = null
    let matchedScore = 0
    for (const f of existsSync(d.candidateDir) ? readdirSync(d.candidateDir).filter((x) => x.endsWith('.md')) : []) {
      try {
        const body = readFileSync(join(d.candidateDir, f), 'utf8')
        const m = body.match(/- 类型线索：(.+)/)
        if (!m) continue
        const existing = intentTokens(d, m[1])
        const inter = tokens.filter((tk) => existing.includes(tk)).length
        if (inter >= 2 && inter > matchedScore) { matched = f; matchedScore = inter }
      } catch { /* 坏候选跳过 */ }
    }
    if (!matched) {
      try {
        const ecfg = d.embedCfgOf()
        if (ecfg.enabled) {
          let bestSim = 0.8
          for (const f of existsSync(d.candidateDir) ? readdirSync(d.candidateDir).filter((x) => x.endsWith('.md')) : []) {
            try {
              const body = readFileSync(join(d.candidateDir, f), 'utf8')
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
      const fp = join(d.candidateDir, matched)
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
      // v2（ADR-122）：转正资格由宿主判据函数**确定性预判**（单一实现 `criteria.ts#promoteVerdict`）——
      // 深睡材料据此直接看到"已达转正门槛"的证据，而不是只靠计数行措辞；判定结果同步落判据台账。
      const promote = promoteVerdict('path', { occurrences: n, sessions: n, success: true })
      const newBody = [
        '# 任务候选（低置信 · 跨窗口记忆）',
        '',
        `- 类型线索：${clue}`,
        ...sids.map((s) => `- 源会话：${s}`),
        `- 成功次数：${n}`,
        `- 跨会话：${n}`,
        '- 状态：候选（非源指针；仅供深睡跨窗口同型判断——同类成功 ≥2 且跨会话 ≥2 由深睡归纳为 [路径]）',
        `- 转正判据：${promote.ok ? 'eligible' : 'not-yet'}（${promote.basis.join(' + ')}${promote.ok ? '' : ` · ${promote.reason}`}）`,
        `- 最近更新：${day}`,
        '',
      ].join('\n')
      writeFileSync(fp, newBody, 'utf8')
      d.ledger({
        domain: 'consolidate', step: 'candidate-promote', sid: sid.replace(/^session-/, '').slice(0, 8),
        criteriaId: 'consolidate.support.path', basis: promote.basis,
        judgement: { evidence: n, stability: n >= 2 ? 'cross-day' : 'once', conflict: 'none', cost: 'conservative' },
        decision: { promote: promote.ok ? 'eligible' : 'hold', reason: promote.reason, clue },
        result: { occurrences: n, sessions: n, file: matched },
      })
      return
    }
    let hash = 0
    for (const c of intent) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
    const f = join(d.candidateDir, `${day}-${hash.toString(36).slice(0, 6)}.md`)
    writeFileSync(f, `# 任务候选（低置信 · 跨窗口记忆）\n\n- 类型线索：${intent}\n- 源会话：${sid}\n- 成功次数：1\n- 跨会话：1\n- 状态：候选（非源指针；仅供深睡跨窗口同型判断——同类成功 ≥2 且跨会话 ≥2 由深睡归纳为 [路径]）\n- 最近更新：${day}\n`, 'utf8')
  } catch { /* 候选落盘失败静默 */ }
}
