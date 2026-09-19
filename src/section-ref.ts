/**
 * section-ref.ts — 小节寻址**单一语义**（S1R · D1/D2，2026-09-19）
 *
 * 判因（S1 库核心只读复查，证据见 `docs/specs/S1-library-recheck-2026-09-19.md`）：
 *   库的 `§小节名` 是**内容锚**，但「名字 → 小节」的解析在仓内有**四份实现**且对「多命中」处置互不相同
 *   （`read_section` 取首个 / 写门集合去重 / `treeops#matchSection` 多命中⇒null / `memory-append` 逐级取首个）
 *   ⇒ 同一个指针在读侧、写门、材料侧**三种结论**；实测 `notes/env.md §插件注入` 正是此例
 *   （读侧能读、写门通过、材料侧判「不存在」并静默剔除）。
 *
 * 本件把语义收敛为**三态**：`exists | ambiguous | missing`。**歧义 ≠ 不存在**——
 *   同名小节是真实存在的情况（实测 env.md 两处），二值语义必然二选一地造假。
 *
 * ⚠ **物理多处、语义单源**：库工具链（`skill/scripts/section-ref.mjs`）因**子进程调用、零依赖**
 *   （不得 import src/）而必须另有一份同语义实现（与 `secret-redact.ts` ↔ `memory_write_gate.mjs`
 *   `findSecretHits` 的先例同型）。两处由 `scripts/check-section-ref-parity.mjs` 的**差分锁**守：
 *   同一夹具集逐例比对 `state + 候选集`，不一致即红。**改任一处必须同批改另一处。**
 *
 * 归一与裁决（两处实现必须逐条一致）：
 *   ① 去行尾维护元信息括号（`coreName` 口径）② 小写 ③ 去空白（含全角空格）
 *   ④ 标题面 = `##`/`###` 两级（ADR-015；不含 `####`）
 *   ⑤ 精确命中**唯一** ⇒ exists(exact)；否则双向包含命中唯一 ⇒ exists(loose)；
 *      否则命中 ≥2 ⇒ **ambiguous**；否则 ⇒ missing
 *   ⚠ ⑤ 与既有 `matchSection` 的差别**仅**在于「多命中」不再折成 null，而是显式 `ambiguous`
 *      ⇒ 既有调用点的二值判定（`state === 'exists'`）行为**逐例不变**。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { coreName, normalizeNotesFile, parseSections } from './treeops.js'

export type SectionRefState = 'exists' | 'ambiguous' | 'missing'
/** **spec 级**（`§父/子` 路径）四态：名字级只有三态；`partial` 是"路径部分可解析"（读侧回落父节）。
 *  判因（2026-09-19 实测 51 组悬空）：**主模式是「父/子」指针里子节不存在**（子节从未创建/被改名），
 *  而父节仍在且读侧可回落 ⇒ 若把 partial 当 missing 处理，生产链会**大面积误拒**（子节名是模型生成的深层锚）。 */
export type SectionRefSpecState = SectionRefState | 'partial'

export interface SectionRefCand {
  /** 标题原文（未归一） */
  title: string
  /** 归一核心名（小写、去空白、去行尾日期括号） */
  core: string
  /** 标题层级（2 = `##`，3 = `###`） */
  level: number
  /** 标题所在行号（0-based，相对 notes 文件） */
  idx: number
  /** 是否与查询名精确相等（归一后） */
  exact: boolean
}

export interface SectionRefResult {
  state: SectionRefState
  /** 命中集合里是否含精确命中（`exact` 优先用于展示与排序） */
  exact: boolean
  /** 全部候选（`ambiguous` 时 >1；`exists` 时恰 1；`missing` 时空） */
  cands: SectionRefCand[]
  /** 目标 notes 文件是否存在（区别于「文件在、小节不在」） */
  fileExists: boolean
  /** 无法解析时的原因（文件非法 / 名字为空）——供调用方如实呈现，不静默 */
  reason?: string
}

/** 归一：核心名 → 小写 → 去全部空白（两处实现同口径） */
export const sectionCore = (s: unknown): string => coreName(String(s ?? '')).toLowerCase().replace(/\s+/g, '')

/** 单文件标题清单（`##`/`###` 两级；ADR-015 两级检索单元）；文件不可读 ⇒ null */
export function sectionTitles(memRoot: string, file: string): { title: string; level: number; idx: number }[] | null {
  const f = normalizeNotesFile(file)
  if (!f) return null
  const p = join(String(memRoot || ''), 'notes', f)
  let text = ''
  try { text = readFileSync(p, 'utf8') } catch { return null }
  const ls = text.split(/\r?\n/)
  return parseSections(ls)
    .filter((s) => s.level === 2 || s.level === 3)
    .map((s) => ({ title: s.title, level: s.level, idx: s.idx }))
}

/**
 * 单一小节名 → 三态。
 * @param memRoot 记忆库根（其下须有 `notes/`）
 * @param file    `env.md` 或 `notes/env.md`（`normalizeNotesFile` 容错）
 * @param name    § 后的名字（可含括号日期；允许多级路径的**单段**）
 */
/**
 * ══ 册三（2026-09-19 · docs/pointer-supply-plan.md §5-1）：**层级化放置裁决** ══
 *
 * 判因（方案 §2.2 G5，实测坐实）：`memory-append` 自带一份 `matches`（**双向包含**）+ `findChild`（逐级取**首个**）
 *   ⇒ 夹具库只有 `## DSH 环境` 时写「环境」**误配**进「DSH 环境」（exit 0 无提示），与本节三态语义不统一。
 * 语义（与 `resolveFromTitles` 同源，但**限定父作用域 + 指定层级**）：exact → loose 唯一命中 →
 *   **多命中 ⇒ `ambiguous`**（调用方必须拒绝并要求写「父/子」全路径）；无命中 ⇒ `missing`（写入侧按既有策略建子节）。
 * ⚠ 与 `skill/scripts/section-ref.mjs` 是同一语义的两份物理实现（子进程活件零依赖，不可 import src/），
 *   一致由 `scripts/check-section-ref-parity.mjs` 的**放置用例**差分锁守。
 */
export interface PlacementHit { title: string; core: string; level: number; idx: number; at: number; exact: boolean }
export interface LevelResolution { state: 'exact' | 'loose' | 'ambiguous' | 'missing'; pick: PlacementHit | null; cands: PlacementHit[] }
export function resolveLevelInParent(
  titles: { title: string; level: number; idx: number }[] | null | undefined,
  parentIdx: number,
  level: number,
  name: unknown,
  opts: { loose?: 'prefix' | 'contains' } = {},
): LevelResolution {
  const kw = sectionCore(name)
  const looseMode: 'prefix' | 'contains' = opts.loose === 'contains' ? 'contains' : 'prefix'
  const list = Array.isArray(titles) ? titles : []
  const from = parentIdx < 0 ? 0 : Number(parentIdx) + 1
  const parentLevel = parentIdx < 0 ? 1 : list[Number(parentIdx)].level
  const scope: { t: { title: string; level: number; idx: number }; at: number }[] = []
  for (let i = from; i < list.length; i++) {
    if (list[i].level <= parentLevel) break // 出父范围
    if (list[i].level === level) scope.push({ t: list[i], at: i })
  }
  const cand = ({ t, at }: { t: { title: string; level: number; idx: number }; at: number }): PlacementHit => {
    const core = sectionCore(t.title); return { title: t.title, core, level: t.level, idx: t.idx, at, exact: core === kw }
  }
  const exactHits = scope.filter(({ t }) => sectionCore(t.title) === kw)
  if (exactHits.length === 1) return { state: 'exact', pick: cand(exactHits[0]), cands: [cand(exactHits[0])] }
  // ⚠ **写侧比读侧严**（册三 · §5-1）：读侧的"双向包含"是**容错回落**（读了再说），
  //   而写侧 loose 只认**前缀关系**（候选以 kw 开头 / kw 以候选开头）。
  //   判因（G5 实测）：仅尾部包含会让「环境」落进「DSH 环境」——语义面不同的两件事，属**放错**而非容错。
  const uniq = new Map<number, { t: { title: string; level: number; idx: number }; at: number }>()
  for (const s of scope) {
    const c = sectionCore(s.t.title)
    if (!kw || !c) continue
    const hit = looseMode === 'contains' ? (c === kw || c.includes(kw) || kw.includes(c)) : (c.startsWith(kw) || kw.startsWith(c))
    if (hit) uniq.set(s.t.idx, s)
  }
  const hits = [...uniq.values()].sort((a, b) => a.t.idx - b.t.idx)
  if (hits.length === 1) return { state: 'loose', pick: cand(hits[0]), cands: [cand(hits[0])] }
  if (hits.length > 1) return { state: 'ambiguous', pick: null, cands: hits.map(cand) }
  return { state: 'missing', pick: null, cands: [] }
}

export interface PlacementStep { pi: number; level: number; state: string; name: string; at?: number; title?: string }
export interface PlacementPlan {
  refused: { pi: number; level: number; name: string; cands: string[] } | null
  steps: PlacementStep[]
  parentIdx: number
  missingPi: number
}
/** 路径放置计划：逐级裁决；`ambiguous` ⇒ **refused**（不猜、不取首个）；首缺层 ⇒ `missingPi` */
export function planPlacement(titles: { title: string; level: number; idx: number }[] | null | undefined, pathParts: string[], opts: { loose?: 'prefix' | 'contains' } = {}): PlacementPlan {
  const parts = Array.isArray(pathParts) ? pathParts : []
  const steps: PlacementStep[] = []
  let parentIdx = -1
  let missingPi = -1
  for (let pi = 0; pi < parts.length; pi++) {
    const level = 2 + pi
    const r = resolveLevelInParent(titles, parentIdx, level, parts[pi], opts)
    if (r.state === 'ambiguous') return { refused: { pi, level, name: parts[pi], cands: r.cands.map((c) => c.title) }, steps, parentIdx, missingPi: -1 }
    if (r.state === 'missing') { missingPi = pi; steps.push({ pi, level, state: 'missing', name: parts[pi] }); break }
    steps.push({ pi, level, state: r.state, name: parts[pi], at: r.pick!.at, title: r.pick!.title })
    parentIdx = r.pick!.at
  }
  return { refused: null, steps, parentIdx, missingPi }
}

export function resolveSection(memRoot: string, file: string, name: unknown): SectionRefResult {
  const f = normalizeNotesFile(file)
  const kw = sectionCore(name)
  if (!f) return { state: 'missing', exact: false, cands: [], fileExists: false, reason: '文件名非法（仅 notes/<name>.md）' }
  const p = join(String(memRoot || ''), 'notes', f)
  const fileExists = existsSync(p)
  if (!fileExists) return { state: 'missing', exact: false, cands: [], fileExists: false, reason: `文件不存在 notes/${f}` }
  if (!kw) return { state: 'missing', exact: false, cands: [], fileExists: true, reason: '小节名为空' }
  const titles = sectionTitles(memRoot, f) || []
  return resolveFromTitles(titles, kw)
}

/** 纯函数裁决（供差分锁在不落盘的前提下逐例比对） */
export function resolveFromTitles(
  titles: { title: string; level: number; idx: number }[],
  name: unknown,
): SectionRefResult {
  const kw = sectionCore(name)
  if (!kw) return { state: 'missing', exact: false, cands: [], fileExists: true, reason: '小节名为空' }
  const cand = (t: { title: string; level: number; idx: number }): SectionRefCand => {
    const core = sectionCore(t.title)
    return { title: t.title, core, level: t.level, idx: t.idx, exact: core === kw }
  }
  const exactHits = titles.filter((t) => sectionCore(t.title) === kw)
  if (exactHits.length === 1) return { state: 'exists', exact: true, cands: [cand(exactHits[0])], fileExists: true }
  const looseHits = titles.filter((t) => {
    const c = sectionCore(t.title)
    return !!c && (c === kw || c.includes(kw) || kw.includes(c))
  })
  const uniq = new Map<number, { title: string; level: number; idx: number }>()
  for (const t of looseHits) uniq.set(t.idx, t)
  const list = [...uniq.values()].sort((a, b) => a.idx - b.idx)
  if (list.length === 1) return { state: 'exists', exact: exactHits.length > 0, cands: [cand(list[0])], fileExists: true }
  if (list.length > 1) return { state: 'ambiguous', exact: exactHits.length > 0, cands: list.map(cand), fileExists: true }
  return { state: 'missing', exact: false, cands: [], fileExists: true }
}

/**
 * `§A/§B`（同文件并列小节 / 父子路径）→ 逐部分三态 + **聚合四态**。
 * 聚合：全部 exists ⇒ exists；**部分可解析 ⇒ `partial`**（读侧回落最深可解析段）；
 *      无 missing 但有 ambiguous ⇒ ambiguous；**全不可解析 ⇒ missing**。
 * ⚠ `partial` **只作用于准入策略**（放行 + 提示），不是"名字存在"——名字级判定始终三态。
 */
export function resolveSectionSpec(memRoot: string, file: string, spec: unknown): { agg: SectionRefSpecState; parts: { name: string; res: SectionRefResult }[] } {
  const names = String(spec ?? '').split('/').map((s) => s.replace(/^§/, '').trim()).filter(Boolean)
  if (!names.length) return { agg: 'missing', parts: [] }
  const parts = names.map((name) => ({ name, res: resolveSection(memRoot, file, name) }))
  const nMissing = parts.filter((p) => p.res.state === 'missing').length
  const nAmbig = parts.filter((p) => p.res.state === 'ambiguous').length
  const nOk = parts.length - nMissing - nAmbig
  const agg: SectionRefSpecState = nMissing === 0
    ? (nAmbig > 0 ? 'ambiguous' : 'exists')
    : (nOk + nAmbig === 0 ? 'missing' : 'partial')
  return { agg, parts }
}

/** 二值兼容门（与迁移前 `forgetops#sectionExists` 逐例同结论：只有 exists 为真） */
export function sectionExistsRef(memRoot: string, file: string, section: unknown): boolean {
  return resolveSection(memRoot, file, section).state === 'exists'
}

/** 主档索引行里的 `→ notes/x.md §y` 引用（一行可含多个文件指针与 `§A/§B` 并列；不承担行格式校验） */
export interface RowPointer { file: string; spec: string }
export function pointersOfRow(line: string): RowPointer[] {
  const s = String(line ?? '')
  const toks: { file: string; at: number; end: number }[] = []
  const re = /notes\/([A-Za-z0-9_.-]+)\.md/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) toks.push({ file: m[1] + '.md', at: m.index, end: m.index + m[0].length })
  const out: RowPointer[] = []
  for (let i = 0; i < toks.length; i++) {
    const stop = i + 1 < toks.length ? toks[i + 1].at : s.length
    const tail = s.slice(toks[i].end, stop)
    if (!/^\s*§/.test(tail)) continue
    const spec: string[] = []
    for (const seg of tail.split('/').map((x) => x.trim()).filter(Boolean)) {
      if (/\.md$/.test(seg)) break
      spec.push(seg.replace(/^§/, '').trim())
    }
    if (spec.length) out.push({ file: toks[i].file, spec: spec.join('/') })
  }
  return out
}

/** 索引行准入（唯一强制点，S1R · D3）：`missing`（全不可解析）⇒ 不可写入；
 *  `partial`（父节可回落）/ `ambiguous`（同名多候选）⇒ **放行 + 提示**。
 *  ⚠ **2026-09-19 收口（真库实测病灶）**：`partial` 里**末段缺失**的那一支 ⇒ **视同 missing，拒写**。
 *   病灶形状（实测）：`§npm 失效与残留 shim 修复/junction 装配漂移` —— 父节在、子节**没落地**
 *   （同批 append 失败，见同轮 `failedItems k=append`）⇒ 旧策略"partial 一律放行"把它写成
 *   **孤儿指针**（真库 `check-section-refs` partial 0→1 翻红）。索引行与明细**同写 / 同不写**才是准入的本意；
 *   **中段**缺失仍放行（读侧可回落最深可解析段）。孪生 `skill/scripts/section-ref.mjs` 同改（差分锁守）。 */
export interface RowAdmission {
  ok: boolean
  missing: { file: string; spec: string; name: string }[]
  partial: { file: string; spec: string; missing: string[]; resolved: string[] }[]
  ambiguous: { file: string; spec: string; cands: string[] }[]
}
export function admitIndexRow(memRoot: string, line: string): RowAdmission {
  const missing: RowAdmission['missing'] = []
  const partial: RowAdmission['partial'] = []
  const ambiguous: RowAdmission['ambiguous'] = []
  for (const p of pointersOfRow(line)) {
    const { agg, parts } = resolveSectionSpec(memRoot, p.file, p.spec)
    if (agg === 'missing') {
      const bad = parts.find((x) => x.res.state === 'missing')
      missing.push({ file: p.file, spec: p.spec, name: bad ? bad.name : p.spec })
    } else if (agg === 'partial') {
      partial.push({
        file: p.file,
        spec: p.spec,
        missing: parts.filter((x) => x.res.state === 'missing').map((x) => x.name),
        resolved: parts.filter((x) => x.res.state !== 'missing').map((x) => x.name),
      })
      const last = parts[parts.length - 1]
      if (last && last.res.state === 'missing') missing.push({ file: p.file, spec: p.spec, name: last.name })
    } else if (agg === 'ambiguous') {
      const amb = parts.find((x) => x.res.state === 'ambiguous')
      ambiguous.push({ file: p.file, spec: p.spec, cands: (amb ? amb.res.cands : []).map((c) => c.title) })
    }
  }
  return { ok: missing.length === 0, missing, partial, ambiguous }
}
