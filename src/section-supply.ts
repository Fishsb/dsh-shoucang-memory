// section-supply.ts — 册一（2026-09-19）：**小节地址供给**（地址由库侧定义并供给，模型只做选择）
//
// 判因（方案 `docs/pointer-supply-plan.md` §1 取证链，真机实测）：
//   · 蒸馏 prompt 要求「section = **既有** ## 小节名」，但**材料里从未注入真实小节清单**
//     （`distill-agent.ts` 的 userInput 只有：会话正文 / 同轮清单 / 召回行 / pending 候选）
//     ⇒ 模型只能凭记忆编名：抽查 5 个典型悬空名，在真库 **334** 个两级小节中 **0 命中**；
//   · 后果链：`section-ref` 的写门会「拒」⇒ 污染换成了**丢料**（同条知识静默丢弃，只落日志）；
//     且（改前）一条 append 失败会连带水位被扣（该面已由 `docs/distill-admission-plan.md` 册三修）。
//
// 本件的架构位置：**地址空间的单一供给实现**（读侧）。
//   · 解析器**不新写**：逐文件调 `section-ref#sectionTitles`（`##`/`###` 两级检索单元，ADR-015）；
//   · 输出**材料**、绝不进 persona（用户可自定义 `distillPrompt`，清单写进提示词会陈旧）；
//   · 预算有界 + **逐级降级**（全量 → 仅 `##` 级 → 仅计数），且**绝不截断到半行**（输入量可见化）。
//
// 与深睡侧的关系（方案 §3-3：「并入既有「现行树节清单」段，不叠第二份」）：
//   深睡材料里**已经有**等价的小节清单（`deepsleep-materials.ts#currentTreeSections`，逐文件列 `notes/x.md ## 标题`），
//   故本件**不**在深睡侧新增第二段；`scripts/check-section-supply.mjs` 另加**正面断言**锁住"深睡材料确实含清单"
//   （把"已有"从假设变成机检事实）。
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { sectionCore, sectionTitles } from './section-ref.js'

/** 主档顺序（与蒸馏 prompt 的白名单同序；其余 notes 文件按名排在后面） */
const PRIMARY = ['tools.md', 'flows.md', 'lessons.md', 'env.md', 'release.md']

/** 每文件的两级小节（复用 `sectionTitles` 单一解析器；父/子关系按 idx 就近归属） */
export interface FileSections {
  file: string
  /** `##` 级标题 */
  tops: string[]
  /** `##父/子` 形式的树状路径（含父在浅、子在深） */
  paths: string[]
}

/** 逐文件枚举 `notes/*.md`（排除 `INDEX.md`；不可读/零小节的文件**不出现**，不冒充） */
export function fileSectionsOf(memRoot: string): FileSections[] {
  const root = String(memRoot || '')
  let files: string[] = []
  try {
    files = readdirSync(join(root, 'notes'))
      .filter((f) => /\.md$/i.test(f) && f.toLowerCase() !== 'index.md')
      .sort()
  } catch { return [] }
  const ordered = [...PRIMARY.filter((f) => files.includes(f)), ...files.filter((f) => !PRIMARY.includes(f))]
  const out: FileSections[] = []
  for (const f of ordered) {
    const titles = sectionTitles(root, f)
    if (!titles || !titles.length) continue
    const tops: string[] = []
    const paths: string[] = []
    let curTop = ''
    for (const t of titles) {
      if (t.level === 2) { curTop = t.title; tops.push(t.title) }
      else if (t.level === 3) paths.push(curTop ? `${curTop}/${t.title}` : t.title)
    }
    out.push({ file: `notes/${f}`, tops, paths })
  }
  return out
}

export interface AddressSupply {
  /** 供模型逐字选取的地址行（已按预算裁剪） */
  lines: string[]
  /** 清单里的地址集合（归一化键 `notes/x.md§<core>`，供 `sectionMiss` 比对；与 `section-ref.sectionCore` 同口径） */
  set: Set<string>
  sections: number
  files: number
  /** 是否发生降级（true ⇒ 只给了 `##` 级或更少） */
  degraded: boolean
  /** 人读摘要（**N=0 显式记 0**） */
  summary: string
}

/** 归一化地址键（逐段走 `section-ref#sectionCore` —— **不在此另写归一器**，防口径漂移） */
export const addressKeyOf = (file: string, section: unknown): string =>
  `${String(file || '').trim()}§${String(section ?? '').split('/').map((s) => sectionCore(s)).filter(Boolean).join('/')}`

/**
 * 生成地址清单（纯读、零抛出）。
 * 降级链：① 全量（`##` + `##父/子`）→ ② 仅 `##` 级 → ③ 仅摘要计数（连 `##` 级都放不下时）。
 * ⚠ 任何一级都**按行裁剪**（不截断到半行），且降级时**显式标注**（不静默变少）。
 */
export function sectionAddressSupply(memRoot: string, maxChars = 3000): AddressSupply {
  const per = fileSectionsOf(memRoot)
  const set = new Set<string>()
  for (const f of per) for (const t of f.tops) set.add(addressKeyOf(f.file, t))
  for (const f of per) for (const p of f.paths) set.add(addressKeyOf(f.file, p))
  const sections = [...set].length
  const files = per.length
  const budget = Math.max(400, Number(maxChars) || 0)
  const head = `小节地址清单（${files} 个文件 · ${sections} 个小节；appends.section 与 newIndex.line 的 § 必须**逐字**取自此处）`
  if (!sections) {
    return { lines: [`${head}\n（0 条——库为空或 notes/ 不可读：本轮**没有**可用地址，宁可不写也不要编名）`], set, sections: 0, files, degraded: false, summary: '地址清单 0 条' }
  }
  // ① 全量
  const full: string[] = []
  for (const f of per) {
    full.push(`${f.file} §${f.tops.join(' §')}`)
    if (f.paths.length) full.push(`  └ ${f.paths.map((p) => `§${p}`).join(' §')}`)
  }
  const build = (rows: string[]): string[] => [head, ...rows]
  const size = (rows: string[]): number => build(rows).join('\n').length
  if (size(full) <= budget) return { lines: build(full), set, sections, files, degraded: false, summary: `地址清单 ${sections} 条（全量 · ${files} 文件）` }
  // ② 仅 ## 级
  const topsOnly: string[] = per.map((f) => `${f.file} §${f.tops.join(' §')}`)
  const note2 = '（预算不足 ⇒ 已降级为**仅 ## 级**；### 级需写「父/子」路径时，按 ## 父节名推）'
  if (size([note2, ...topsOnly]) <= budget) return { lines: build([note2, ...topsOnly]), set, sections, files, degraded: true, summary: `地址清单 ${sections} 条（降级：仅 ## 级 · ${files} 文件）` }
  // ③ 逐行裁剪（保留完整行，末尾显式标注被裁）
  const kept: string[] = [note2]
  let used = size(kept)
  for (const row of topsOnly) {
    if (used + row.length + 1 > budget) break
    kept.push(row); used += row.length + 1
  }
  const dropped = topsOnly.length - (kept.length - 1)
  if (dropped > 0) kept.push(`…（预算所限，另有 ${dropped} 个文件未列出；地址集仍按全量校验）`)
  return { lines: build(kept), set, sections, files, degraded: true, summary: `地址清单 ${sections} 条（强降级：列出 ${kept.length - 1 + (dropped > 0 ? 1 : 0)}/${topsOnly.length} 文件）` }
}

/** 材料段标题（**唯一字面量**：判据件据此断言"抵达"） */
export const ADDRESS_SUPPLY_HEADER = '## 可用小节地址（库侧供给；不在清单内的 § 会被写门拒收——宁缺勿编）'

/**
 * 蒸馏材料装配（**纯字符串**，无 IO）——单独成函数是为了让"接线 ≠ 抵达"可机检：
 *   判据件直接调用本函数并断言返回文本里**含**地址段与其内容（见 `check-section-supply.mjs`）。
 */
export interface DistillInputParts {
  sid: string
  startSeq: number
  endSeq: number
  totalChunks: number
  index: number
  body: string
  manifest: string
  relMemLines: string
  candidates: string
  addressLines: string[]
}
export function buildDistillUserInput(p: DistillInputParts): string {
  return [
    `## 待蒸馏会话\nsessionId=${p.sid}（分段蒸馏，本段 seq ${p.startSeq}→${p.endSeq}，共 ${p.totalChunks} 段第 ${p.index} 段）`,
    `${ADDRESS_SUPPLY_HEADER}\n${(p.addressLines || []).join('\n')}`,
    `## 会话增量正文（本段）\n${p.body}`,
    p.manifest ? `## 同轮前段固化清单（防重复入册/可引用合并，勿重复入册）\n${p.manifest}` : '（同轮前段固化清单：无——本段为当前触发首段；后续段将携带本段裁决清单防重复入册）',
    p.relMemLines ? `## 相关既有记忆（recallRanked 召回，Q0 已有归属 / Q3 合并判据；命中即视为已覆盖候选）\n${p.relMemLines}` : '（相关既有记忆：未启用向量或零命中，按无历史裁决）',
    p.candidates,
    '请按规则处理：裁决本段可复用知识点并输出入册指令 JSON。',
  ].join('\n\n')
}
