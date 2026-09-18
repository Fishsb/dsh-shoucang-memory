/**
 * cue-space.ts — **情境键空间**领域（IR1 册二 · 2026-09-18）
 *
 * 由来（IR1-injection-recall-plan v3 §2-2 的**实测**病灶）：cue 键空间**劈成两半**且在**持续漏**——
 *   · 写侧（`ring-commit`）把 `\` 归一成 `/`，读侧（`situation-key#cuesOf` → `panel-shared#sitCtx`）
 *     产出的 `scope=workspace:<盘符>/…` **不过同一归一**，而匹配判据是**字符串全等**
 *     ⇒ 库里同一工作区裂成多片（实测 正斜杠 267 / 反斜杠 152），**读侧只对得上其中一片**；
 *   · 新写入的记录 `scope` cue 命中 **0 / 119 = 0%**（存量 152 条在"撑门面"）；
 *   · 注册表只声明**维名**、不声明**值规则**；写侧写入未声明维 **37 条静默无痕**。
 *
 * 本件是 cue 键的**唯一实现**（归一 / 校验 / 解析 / 序列化），三处旧实现全部收敛到它：
 *   ① `ring-commit#normalizeCue`（写侧私有）② `situation-key#cuesOf`（读侧组装）③ `ring-supply#parseCues|serializeCues`。
 *   **读侧写侧同一实现**是本册的判据本体（B3：`src/` 内只许 1 处定义）。
 *
 * 边界：纯函数、零 I/O、零抛出、确定性（同输入必同输出）；**不认识任何盘符**（值一律由调用方给）。
 * 值规则是"**归一**"（best-effort，失败回原值），**维校验**才是硬门（未声明维 ⇒ 写侧拒收 + 审计）。
 */
import { SURFACE } from './criteria.generated.js'

/** `meta.cues` 的分隔符：用**换行**（路径里可能含空格与 `|`，但不可能含换行）——单值 string 承载集合 */
export const CUES_SEP = '\n'

/**
 * **值规则表**（每维一条；注册表 `surface.injection.situation.cueDimRules` 只声明**规则文案**，
 *   规则本体在此 —— 单一实现）。未列出的维：值**原样保留**（让"未声明维"以可见形态被拒收，而不是被洗白）。
 */
export const CUE_VALUE_RULES: Record<string, string> = {
  scope: '路径归一：`\\`→`/` · 去尾斜杠 · 折叠重复斜杠 · **不改大小写**（POSIX 敏感，折叠会引入新错配）',
  task: 'kebab：小写 · 空白/下划线→`-` · 折叠 `-` · 去首尾 `-`（CJK 原样保留）',
  event: 'kebab（同 `task`）',
  subject: '枚举值小写：`user|agent|knowledge|companion:<id>`',
}

/** 归一维名（小写去空白）——维名大小写不应造成第二个键空间 */
const dimOf = (s: string): string => String(s ?? '').split('=')[0].trim().toLowerCase()

/** kebab 归一（`task`/`event`）：小写 + 空白/下划线→`-` + 折叠 + 去首尾 */
const kebab = (v: string): string => String(v ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')

/**
 * **键归一**（**唯一实现** · 读侧写侧共用）。`''` = 空键/无值（调用方应丢弃）。
 * 只做**确定性、可逆性无损**的归一：不做别名归一（`<盘符>:\<别名>\<a>` 是否等于 `<盘符>:\<a>`
 *   **无确定性依据，须人裁决**），不做大小写折叠（理由见上）。
 */
export function normalizeCueKey(raw: unknown): string {
  try {
    const s = String(raw ?? '').trim()
    if (!s) return ''
    const eq = s.indexOf('=')
    if (eq <= 0) return '' // 无 `=`（或维名为空）⇒ 不是键，丢弃（旧实现原样返回，会把垃圾带进库）
    const dim = s.slice(0, eq).trim().toLowerCase()
    const v0 = s.slice(eq + 1).trim()
    if (!dim || !v0) return ''
    let v = v0
    if (dim === 'scope') {
      const p = v0.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '')
      v = p || v0
    } else if (dim === 'task' || dim === 'event') v = kebab(v0)
    else if (dim === 'subject') v = v0.toLowerCase()
    return v ? `${dim}=${v}` : ''
  } catch {
    return ''
  }
}

/** 已声明维（读注册表 -> **不另立名单**）。注册表是唯一事实源；本函数只做读取与缓存。 */
let dimCache: string[] | null = null
export function declaredCueDims(): string[] {
  if (dimCache) return dimCache
  const d = (SURFACE as unknown as { injection?: { situation?: { cueDims?: unknown } } })?.injection?.situation?.cueDims
  const list = Array.isArray(d) ? d.map((x) => String(x)) : []
  // 注册表未声明时**不擅自兜底**（否则"声明缺失"会被静默掩盖）——返回空数组，由机检判红
  dimCache = list
  return list
}

export interface CueValidation {
  ok: boolean
  /** 归一后的键（`ok:false` 时仍给出，供审计留痕） */
  key: string
  /** 拒收原因（`''` = 通过）：`empty` · `undeclared-dim:<d>` */
  reason: string
}

/**
 * **维校验**（硬门）：维名必须在注册表 `cueDims` 声明内。未声明 ⇒ 写侧拒收 + 审计 `cue.rejected`。
 * 为什么是硬门而不是告警：实测**37 条**静默写入未声明维 ⇒ 那些键**读侧永不产出** ⇒ 记录"写了情境、
 *   实际永不可达"（与"键劈半"同族的静默失效）。
 */
export function validateCueKey(raw: unknown, dims: readonly string[] = declaredCueDims()): CueValidation {
  const key = normalizeCueKey(raw)
  if (!key) return { ok: false, key: '', reason: 'empty' }
  const dim = dimOf(key)
  if (!dims.includes(dim)) return { ok: false, key, reason: `undeclared-dim:${dim}` }
  return { ok: true, key, reason: '' }
}

/** 从 `meta.cues` 还原键集合（空/缺失 ⇒ 空数组，走兜底序）。**归一在此生效**（读写同源）。 */
export function parseCues(raw: unknown): string[] {
  const s = String(raw ?? '')
  if (!s) return []
  const out: string[] = []
  for (const x of s.split(CUES_SEP)) {
    const k = normalizeCueKey(x)
    if (k && !out.includes(k)) out.push(k)
  }
  return out
}

/** 把键集合序列化进 `meta.cues`（写侧用；与 `parseCues` 同一分隔符与归一 ⇒ 往返无损） */
export function serializeCues(cues: readonly string[]): string {
  const out: string[] = []
  for (const c of cues ?? []) {
    const k = normalizeCueKey(c)
    if (k && !out.includes(k)) out.push(k)
  }
  return out.join(CUES_SEP)
}

/** 组装一个键（读侧用）：`cueKeyOf('scope', 'workspace:<盘符>/repo')` ⇒ `scope=workspace:<盘符>/repo`（已归一） */
export function cueKeyOf(dim: string, value: unknown): string {
  const v = String(value ?? '').trim()
  if (!v) return ''
  return normalizeCueKey(`${String(dim ?? '').trim()}=${v}`)
}

/**
 * **一批值的整批校验**（写侧用）：返回 `{ keys, rejected }` —— 通过的按原序去重，拒收的留痕。
 * 批量语义是**逐条独立**（一条坏键不连坐其余），因为 cue 是**附加线索**：丢掉一条不该让整条记录落空。
 */
export function cueSetOf(raw: unknown, dims: readonly string[] = declaredCueDims()): { keys: string[]; rejected: Array<{ key: string; reason: string }> } {
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(CUES_SEP) : []
  const keys: string[] = []
  const rejected: Array<{ key: string; reason: string }> = []
  for (const x of arr) {
    const v = validateCueKey(x, dims)
    if (v.ok) { if (!keys.includes(v.key)) keys.push(v.key) }
    else if (v.key || String(x ?? '').trim()) rejected.push({ key: v.key || String(x).trim(), reason: v.reason })
  }
  return { keys, rejected }
}
