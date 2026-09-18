// deepsleep-materials.ts — 深睡「归纳材料采集」领域（**零依赖**：只吃库根，只读文件）
//
// 由来：这段原本嵌在 runDeepSleep 体内（约 148 行 IIFE 串），把 runDeepSleep 顶到 406 行。
//   它是**纯读**：扫 USER/AGENT/MEMORY 现行文本 + notes 树节 + 分裂/遗忘/再现候选，
//   不写任何东西、不需要任何注入依赖 ⇒ 提到模块级后依赖数为 0，可独立单测。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
// 阶段 4（2026-09-14）：sectionExists 随「主动遗忘」一块迁至 forgetops（口径仍与 matchSection 同源）
import { resolveSection } from './section-ref.js'
import { dayKey } from './activity.js'
import { loadStore } from './record-shadow.js'
import { openDecisions } from './decision-ring.js'

/** 一轮深睡需要的全部「现行材料」文本（供 userInput 拼装；全部只读派生）。 */
export interface SleepMaterials {
  currentPrinciples: string
  currentList: string
  currentProfiles: string
  currentMemIndex: string
  currentTreeSections: string
  splitCandidates: string
  forgetCandidates: string
  replayRecent: string
  /** 待回收的裁决（P5 outcomes 通道的材料；见实现处注释） */
  pendingDecisions: string
  hotCtx: string
  interCtx: string
  /** S-P2c（2026-09-16）**本纪元工具使用**（第 12 段材料，来自 `audit/tool-usage.jsonl`）。
   *  与"经历"其余各段互补：这里回答的是「当天用了**哪些工具**、各用了几次」——
   *  人类睡眠重构的原料是「经历 × 用到的工具知识」的结合，此段即"工具"那一维的入口。
   *  ⚠ 只含 工具名/次数/会话短码/日期，**不含参数原文**（隐私红线由 `check-journal-privacy` 守）。 */
  toolUsage: string
  /** S3-3/S3-4（2026-09-14）材料段**条数**：审计可见化用 —— 让"本轮给了几条候选"可查
   *  （此前审计只有消费结果 `forgetArchived`/`forgetKept`，没有输入量）。 */
  counts: { split: number; forget: number; replay: number; hot: number; inter: number; pending: number; tools: number }
  /** S1R（2026-09-19 · G7）**小节寻址输入量可见化**：剔除不再静默。
   *  此前 `if (!sectionExists(...)) continue` 静默剔除（实测冷候选 37 → 剔 10 条，零痕迹），
   *  且 `sectionExists` 把「同名歧义」也算作"不存在"（`matchSection` 多命中⇒null）⇒ 真实可读的小节被丢弃。 */
  sectionRef: { droppedMissing: number; ambiguousKept: number; ambiguous: string[]; missing: string[] }
}

export function gatherMaterials(root: string, sinceMs?: number): SleepMaterials {
  const currentPrinciples = (() => { try { return readFileSync(join(root, 'AGENT.md'), 'utf8') } catch { return '' } })()
  const currentList = currentPrinciples.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\[(原则|路径)\]/.test(l)).join('\n') || '（暂无条目）'
  // 双画像巩固材料：现行 USER/AGENT 画像全文（行格式门禁的 replace 依据）
  const currentProfiles = ['USER.md', 'AGENT.md'].map((f) => {
    let body = ''
    try { body = readFileSync(join(root, f), 'utf8') } catch { /* 无文件=空 */ }
    return `### ${f}\n${body.trim() || '（空）'}`
  }).join('\n\n')
  // v6 指针自动维护材料：现行 MEMORY 索引行（pointerOps 扩容/重构的 match 逐字取自此处；USER/AGENT 行已在现行画像）
  const currentMemIndex = (() => {
    try {
      const b = readFileSync(join(root, 'MEMORY.md'), 'utf8')
      return b.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\[[^\]\s]+\]/.test(l)).join('\n') || '（暂无条目）'
    } catch { return '（无 MEMORY.md）' }
  })()
  // v17.3 treeOps 材料：现行树节清单（treeOps 的 file/oldTitle/dropTitle/keepTitle 必须逐字取自该段；
  // 每个小节一行 `notes/文件:标题`，含层级标记；无树节输出一行「（无）」）
  const currentTreeSections = (() => {
    try {
      const nd = join(root, 'notes')
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
      const nd = join(root, 'notes')
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
  // S1R（2026-09-19 · G7）：小节寻址统计（「输入量须可见化」——剔除与歧义都必须留痕，不静默）
  const sectionRef = { droppedMissing: 0, ambiguousKept: 0, ambiguous: [] as string[], missing: [] as string[] }
  const forgetCandidates = (() => {
    try {
      const rows: Array<{ f: string; s: string; hits: number; days: number | 'never'; orphan: boolean; amb: boolean }> = []
      // R1（审查项）：画像承载文件**不进候选**——画像行全量注入，其 cold 是机制性的，不是"没人用"
      const PROFILE = new Set(['user.md', 'agent.md'])
      // P2（审查项）：索引仍引用的 (file::§) 集合——用于标注**孤儿条目**（索引已删、正文仍在）
      const refs = new Set<string>()
      for (const idx of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
        let raw = ''
        try { raw = readFileSync(join(root, idx), 'utf8') } catch { continue }
        for (const line of raw.split(/\r?\n/)) {
          const fm = line.match(/→\s*notes\/([A-Za-z0-9_-]+)\.md/)
          if (!fm) continue
          for (const m of (line.split('→').pop() || '').matchAll(/§([^/→\s]+)/g)) {
            refs.add(`${fm[1]}::${String(m[1]).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim().toLowerCase()}`)
          }
        }
      }
      for (const l of readFileSync(join(root, 'audit', 'activity.jsonl'), 'utf8').split(/\r?\n/)) {
        if (!l.trim()) continue
        try {
          const o = JSON.parse(l) as { f?: string; s?: string; status?: string; hits?: number; lastHit?: number | null }
          if (String(o.status) !== 'cold') continue
          const days = o.lastHit ? Math.round((Date.now() - Number(o.lastHit)) / 86400000) : 'never' as const
          if (days !== 'never' && days <= 90) continue
          const f = String(o.f || '').replace(/^notes\//, '')
          const s = String(o.s || '')
          if (PROFILE.has(f.toLowerCase())) continue
          // R2（审查项）：剔除**悬空候选**（节不存在）——否则白占材料 top-10 名额。
          // S1R（2026-09-19 · G7）：口径升级为**三态**（`section-ref`）+ **输入量可见化**：
          //   · `missing`   ⇒ 剔除 **并计数**（不再静默）
          //   · `ambiguous` ⇒ **保留**（小节真实存在且在读侧可读）并在材料里标注"同名歧义"
          const ref = resolveSection(root, f, s)
          if (ref.state === 'missing') { sectionRef.droppedMissing++; sectionRef.missing.push(`${f} §${s}`); continue }
          const amb = ref.state === 'ambiguous'
          if (amb) { sectionRef.ambiguousKept++; sectionRef.ambiguous.push(`${f} §${s}（${ref.cands.length} 个同名候选）`) }
          const orphan = !refs.has(`${f.replace(/\.md$/, '')}::${s.toLowerCase()}`)
          rows.push({ f, s, hits: Number(o.hits || 0), days, orphan, amb })
        } catch { /* 坏行跳过 */ }
      }
      const v = (d: number | 'never'): number => (d === 'never' ? Number.MAX_SAFE_INTEGER : d)
      rows.sort((a, b) => v(b.days) - v(a.days))
      const top = rows.slice(0, 10)
      return top.length
        ? top.map((r) => `${r.f} §${r.s}（hits ${r.hits} · 距最后命中 ${r.days === 'never' ? '从未' : r.days + ' 天'}${r.orphan ? ' · **孤儿条目**：索引已不再引用，仅正文留存' : ''}${r.amb ? ' · **同名歧义**（该名有多个小节；索引宜写「父/子」全路径）' : ''}）`).join('\n')
        : '（无）'
    } catch { return '（无）' }
  })()
  // v19（认知对照 P2「跨日回放」）再现材料：近 7 日**已有条目被再次命中**（来源 access-real.jsonl = 真实读埋点）；
  //   供深睡判「跨日二次激活」（生物侧 replay / dream-lag）；上限 top-10。
  // S4Y（2026-09-14）**口径修正**：原先只按**命中次数**排序 ⇒ 会选出"**同一天**读了 100 次"的条目，
  //   而那**不是** replay —— replay 的语义是「**跨日**再次激活」。现改为按**不同日期数**降序
  //   （`≥2` 天才算跨日），并把跨日数**显式写进材料**，深睡才能据此判断。
  //   实测（2026-09-14）：41 条真跨日；旧口径 top-10 恰好全跨 5 天（**碰巧**，非保证）。
  const replayRecent = (() => {
    try {
      const since = Date.now() - 7 * 86400000
      const cnt = new Map<string, number>()
      const days = new Map<string, Set<string>>()
      for (const l of readFileSync(join(root, 'audit', 'access-real.jsonl'), 'utf8').split(/\r?\n/)) {
        if (!l.trim()) continue
        try {
          const o = JSON.parse(l) as { t?: string; f?: string; s?: string }
          const ts = Date.parse(String(o.t || ''))
          if (!ts || ts < since) continue
          const k = `${String(o.f || '').replace(/^notes\//, '')} §${String(o.s || '')}`
          cnt.set(k, (cnt.get(k) || 0) + 1)
          const d = String(o.t).slice(0, 10)
          if (!days.has(k)) days.set(k, new Set())
          days.get(k)?.add(d)
        } catch { /* 坏行跳过 */ }
      }
      const top = [...cnt.keys()]
        .filter((k) => (days.get(k)?.size ?? 0) >= 2) // **跨日**才算 replay
        .sort((a, b) => ((days.get(b)?.size ?? 0) - (days.get(a)?.size ?? 0)) || ((cnt.get(b) ?? 0) - (cnt.get(a) ?? 0)))
        .slice(0, 10)
      return top.length ? top.map((k) => `${k}（跨 ${days.get(k)?.size ?? 0} 天 · ${cnt.get(k) ?? 0} 次）`).join('\n') : '（无跨日再现条目）'
    } catch { return '（无）' }
  })()

  // 本地日键：**单一实现**（S4Z 收敛）—— 原为 `activity#dayKey` 的手写副本（根因：该函数当时**未导出**）
  const dayKeyLocal = dayKey(Date.now())
  // v7 B 加深上下文：活性聚合产出的今日高频小节清单（仅建议——是否扩容概况/提炼原则由本归纳按既有判据决定，宿主 gate 把关）
  const hotCtx = (() => {
    try {
      const f = join(root, 'audit', `activity-hot-${dayKeyLocal}.md`)
      if (!existsSync(f)) return ''
      const body = readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('|')).slice(2, 20).join('\n')
      return body ? `## 活性高频小节（近30天命中≥5；如需扩容概况经 pointerOps.update、如需提炼原则经 principles）\n${body}` : ''
    } catch { return '' }
  })()
  // v8（认知对照 P2「竞争性抑制」）互抑候选材料：同文件 § 名 bigram 重叠 ∈ [0.50, 0.66)（低于唯一门拒收阈值故并存至今）
  const interCtx = (() => {
    try {
      const f = join(root, 'audit', `activity-interference-${dayKeyLocal}.md`)
      if (!existsSync(f)) return ''
      const rows = readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('|')).slice(2, 14).join('\n')
      return rows ? `## 互抑候选（同文件 § 名高度重叠，低于唯一门阈值故并存至今；可经 treeOps.merge 并入或 pointerOps 合并概况）\n${rows}` : ''
    } catch { return '' }
  })()
  /** **待回收的裁决**（P5 `outcomes` 通道的材料 —— 2026-09-15 补接线）。
   *
   *  **判因（H-1 · 实测确凿）**：prompt 早写明「材料若给出**待回收的裁决**（含 `decisionId` 与**当时预测**），
   *   且你从痕迹看得出实际结果，就填 `outcomes[]`」（`deepsleep-core.ts` 的 P5 段）——
   *   但**材料侧从未给过这一段** ⇒ 该条件**永不成立** ⇒ `outcomes` **结构性恒 0**
   *   （实测：库内 `decision` 50 条、其中 **49 条待回收**，而历史上 `outcome` 只收过 **1** 条）。
   *  ⇒ 本段＝把既有的 `openDecisions()`（`decision-ring` 早已实现，**不另造**）接进材料。
   *  ⚠ 记录里若**无 `predicted`**，仍照实列出并标注「无预测」——**不编造预测**（伪造会让回收判据失真）。 */
  const pendingDecisions = (() => {
    try {
      const { records } = loadStore(root)
      const rows = openDecisions(records).map((r) => {
        const m = (r.meta || {}) as Record<string, string>
        const pred = String(m.predicted || '').trim()
        return `- \`${String(r.id)}\`｜${String(r.text || '').trim()}｜当时预测：${pred || '（无预测记录）'}`
      })
      return rows.length ? rows.join('\n') : '（无）'
    } catch { return '（无）' }
  })()
  /** 段**条数**（空态与标题行不计）：口径统一「非空 且 非 `##` 标题行 且 非分隔线」。
   *  ⚠ **不做 per-段特判** —— 特判必然漂移；此处只求"输入量可查"，不求精确语义计数。 */
  const countOf = (s: string): number => {
    const t = String(s || '').trim()
    if (!t || t === '（无）' || t === '（暂无条目）' || t === '（无 MEMORY.md）') return 0
    return t.split('\n').filter((l) => { const x = l.trim(); return !!x && !x.startsWith('##') && x !== '---' }).length
  }
  /* S-P2c（2026-09-16）**本纪元工具使用**（第 12 段）。数据源 = `audit/tool-usage.jsonl`
   *  （由 `skill/scripts/harvest-access.mjs` 在同一遍转录遍历里聚合，**只含工具名/次数/短码/日期**）。
   * ⚠ **窗口粒度 = 日**：日志的 `t` 是 `YYYY-MM-DD`（采集层为控体积与隐私只留日期），
   *   故此处按"日期 ≥ 窗口起点所在日"过滤 —— **比其它段的毫秒窗口粗**。这是已知取舍，
   *   若要精确到分钟，须改采集层的时间字段形态（连带改隐私门的 `t` 形态判据）。 */
  const toolUsage = (() => {
    try {
      const sinceDay = sinceMs ? new Date(Number(sinceMs)).toISOString().slice(0, 10) : ''
      const raw = readFileSync(join(root, 'audit', 'tool-usage.jsonl'), 'utf8')
      const rows: Array<{ t: string; sid: string; tool: string; n: number }> = []
      for (const l of raw.split(/\r?\n/)) {
        const s = l.trim(); if (!s) continue
        try { const o = JSON.parse(s); if (o && o.tool) rows.push(o) } catch { /* 坏行跳过（材料装配绝不因单行失败） */ }
      }
      const inWin = rows.filter((r) => !sinceDay || String(r.t) >= sinceDay)
      if (!inWin.length) return ''
      // 按工具汇总（跨会话），次数降序 —— 给模型的是"用了什么、多常用"，不是流水
      const byTool = new Map<string, number>()
      for (const r of inWin) byTool.set(r.tool, (byTool.get(r.tool) || 0) + (Number(r.n) || 0))
      return [...byTool.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${t} × ${n}`).join('\n')
    } catch { return '' } // 日志缺席/不可读 ⇒ 空段（既有行为不变）
  })()
  return {
    currentPrinciples, currentList, currentProfiles, currentMemIndex, currentTreeSections, splitCandidates, forgetCandidates, replayRecent, hotCtx, interCtx, pendingDecisions, toolUsage,
    // S3-3/S3-4（2026-09-14）：让"本轮给了多少条候选"进审计 —— 与消费结果配对后，才能区分
    //   「没候选可消费」（输入 0）与「有候选但代理没消费」（输入 >0 而产出 0）—— 两者此前**表现完全相同**。
    // 2026-09-15（H-1）：`pending` 同理 —— 它一进审计，「outcomes 恒 0」就能立刻区分
    //   「没有待回收裁决」与「有 49 条却没回收」。
    counts: { split: countOf(splitCandidates), forget: countOf(forgetCandidates), replay: countOf(replayRecent), hot: countOf(hotCtx), inter: countOf(interCtx), pending: countOf(pendingDecisions), tools: countOf(toolUsage) },
    // S1R（2026-09-19 · G7）：小节寻址输入量（剔除/歧义）—— 审计可见，不再静默
    sectionRef: { droppedMissing: sectionRef.droppedMissing, ambiguousKept: sectionRef.ambiguousKept, ambiguous: sectionRef.ambiguous.slice(0, 8), missing: sectionRef.missing.slice(0, 8) },
  }
}
