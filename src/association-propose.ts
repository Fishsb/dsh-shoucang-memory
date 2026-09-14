/**
 * association-propose.ts — **联想生成**（向量空间里的"异域同构" · 2026-09-13 用户点拨）
 *
 * ## 为什么纯代码实现不了联想（先把这件事说清楚，别再拿结构规则硬凑）
 * 现有 `association-ring` 只能**记账**：`recordCollision` 的「碰撞」内容是**人或模型先想到的**，
 * 代码负责去重、跨度门、落地状态、KPI —— 它**不生成任何联想**。
 * 而联想的本质是**发现意外联系**，这是模糊判断。（同一道理：上一版断言图拿 `pointer` 相等判
 * "同一断言"，真数据一跑就露馅。）
 *
 * ## 本件的形态：在**向量空间**里找"异域同构"
 * 有价值的联想**不是**"两段话用词很像"（那是**检索**，代码很擅长，不值得称联想）；
 * 而是：**语义高度相近 · 却来自不同载体 · 且词面几乎不重叠** ⇒ **同一道理出现在两个领域**。
 *
 * 故职责这样切：
 * | 层 | 归谁 | 做什么 |
 * |---|---|---|
 * | 嵌入/相似 | **向量模型**（调用方经 `vec#embedMany` 取得，本件注入） | 语义距离 |
 * | 过滤/排序 | **代码**（精确、可测、零 IO） | 跨载体 · 词面重叠上限 · 相似下限 · 排序截断 |
 * | 落环 | **人或模型复核后**（本件只**提议**，不擅自落环） | 沿用既有 `association-ring` 记账 |
 *
 * 产出带**证据**（相似度 + 共词数 + 两侧地址），让人能核"凭什么说这俩有关系"。
 */
import type { MemRecord } from './record-store.js'
import { extractRecallTokens } from './targets.js'

export interface AssocSection {
  /** 地址：`<file> §<小节名>` */
  key: string
  file: string
  section: string
  text: string
}

export interface AssocProposal {
  a: AssocSection
  b: AssocSection
  sim: number
  /** 两侧共有的检索 token 数（**越小越像"异域同构"**；大 ⇒ 只是用词像） */
  sharedTokens: number
  shared: string[]
}

/**
 * 把 notes 记录按标题切成**小节**（纯函数）。
 * 口径：`#`/`##`/`###` 行开新节（记录 `kind==='structure'` 由解析器标注），节体 = 其后至下一个标题的行。
 * 只取 notes/*（索引行是"指针"，不是内容；联想要在**内容**之间发生）。
 */
export function sectionsOf(records: readonly MemRecord[]): AssocSection[] {
  const byFile = new Map<string, MemRecord[]>()
  for (const r of records) {
    if (!r.file || !r.file.startsWith('notes/')) continue
    const arr = byFile.get(r.file)
    if (arr) arr.push(r); else byFile.set(r.file, [r])
  }
  const out: AssocSection[] = []
  for (const [file, rows] of byFile) {
    const sorted = rows.slice().sort((x, y) => x.order - y.order)
    let cur: { section: string; lines: string[] } | null = null
    const flush = (): void => {
      if (!cur) return
      const text = cur.lines.join(' ').trim()
      if (cur.section && text) out.push({ key: `${file} §${cur.section}`, file, section: cur.section, text })
      cur = null
    }
    for (const r of sorted) {
      const t = (r.text || '').trim()
      if (/^#{1,6}\s/.test(t)) {
        flush()
        cur = { section: t.replace(/^#{1,6}\s*/, '').trim(), lines: [] }
        continue
      }
      if (cur) cur.lines.push(t)
      // 标题之前的内容（文件抬头）不属于任何小节 ⇒ 丢弃（它不是"断言"，是说明文字）
    }
    flush()
  }
  return out
}

/**
 * **提议联想**（纯函数：向量由调用方注入 ⇒ 本件零 IO、可单测）。
 *
 * 判据（三条都要满足，缺一即"不是联想"）：
 *   ① **跨载体**：`a.file !== b.file` —— 同一文件内的相近是"重复"，不是"异域同构"；
 *   ② **语义相近**：`sim >= minSim`（默认 0.72，`bge-m3` 余弦；可调）；
 *   ③ **词面不重叠**：共有检索 token 数 `<= maxShared`（默认 2）—— **这是与"检索"的分界线**：
 *      若两段话共词很多，那只是"用词像"，检索就能找到，**不值得称联想**。
 *
 * 排序：相似度降序（同分按共词数升序 ⇒ 更"异域"的排前面）；截断 `topN`。
 */
export function proposeAssociations(
  sections: readonly AssocSection[],
  vectors: readonly (readonly number[] | null)[],
  opts: { minSim?: number; maxShared?: number; topN?: number } = {},
): AssocProposal[] {
  const minSim = opts.minSim ?? 0.72
  const maxShared = opts.maxShared ?? 2
  const topN = opts.topN ?? 20
  const toks = sections.map((s) => new Set(extractRecallTokens(s.text)))
  const cos = (a: readonly number[], b: readonly number[]): number => {
    let d = 0, na = 0, nb = 0
    const n = Math.min(a.length, b.length)
    for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
    return na && nb ? d / Math.sqrt(na * nb) : 0
  }
  const out: AssocProposal[] = []
  for (let i = 0; i < sections.length; i++) {
    const va = vectors[i]
    if (!va || !va.length) continue
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[i].file === sections[j].file) continue // ① 同文件 ⇒ 不算异域
      const vb = vectors[j]
      if (!vb || !vb.length) continue
      const sim = cos(va, vb)
      if (sim < minSim) continue // ② 语义要近
      const shared: string[] = []
      for (const t of toks[i]) if (toks[j].has(t)) shared.push(t)
      if (shared.length > maxShared) continue // ③ 词面别重叠（否则那是检索，不是联想）
      out.push({ a: sections[i], b: sections[j], sim, sharedTokens: shared.length, shared })
    }
  }
  return out.sort((x, y) => (y.sim - x.sim) || (x.sharedTokens - y.sharedTokens)).slice(0, topN)
}
