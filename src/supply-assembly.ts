/**
 * supply-assembly.ts — 读侧装配（G4 · 2026-09-13）：把「检索 top-k」升为「**预算内最小充分集**」
 *
 * 为什么需要它（前几轮讨论的结论）：
 *   · 价值只在**下游**兑现 ⇒ 架构重心该从写侧（蒸馏/归纳/水位）右移到**读侧装配**；
 *   · 「记多了会变笨」的第一病是**注入面稀释**（context rot / lost in the middle）⇒ 读侧必须有**硬预算**，
 *     而预算不是愿望：任何被预算挡下的行都必须**显式可见**（仓内先例：画像行曾静默被挤掉）。
 *
 * 与既有实现的边界：本件**只做装配**（选择 + 预算 + 溢出记账），**不重排**——相关性排序由调用方给出
 *   （`dynamic` 视为已按相关性排好序），本件不读任何打分函数 ⇒ 与 `panel`/`mcl` 的打分口径**不形成第二份实现**。
 *
 * 独立槽的意义（本件相对仓内既有三层预算的**新增**）：`serendipity`（G3 越界召回的产物）拿**自己的预算**，
 *   与相关性面**互不挤占**。依据：注入打分是 `α_rel·relevance + …`，α_rel 越强越不可能发生越界碰撞——
 *   精度与惊喜在数学上对立，**改权重解决不了，只能分槽**。缺省额度 **0**（关闭），
 *   不给"悄悄多花上下文"的机会：启用后总预算上升，且从 `meta` 里读得到。
 */
import type { SerendipityPair } from './association-ring.js'
import type { MemRecord } from './record-store.js'
import { isLive } from './fact-ring.js'
import { ringOfKind } from './rings.js'
import { indexRowInLayer, indexRowTag, isProfileRow } from './targets.js'

export interface SupplyBudget {
  /** 恒定面（P 层 always；不参与相关性竞争，每步必在） */
  stable: number
  /** 变动面（按任务相关性，调用方给序） */
  dynamic: number
  /** 一次性（成长 delta / 提醒，带 TTL 由调用方管） */
  oneshot: number
  /** 越界联想槽（**独立**；缺省 0 = 关闭） */
  serendipity: number
  /**
   * **情境槽（独立；缺省 0 = 关闭）** —— 2026-09-14 P3 新增。
   * 承载环记录（decision / outcome / relation / commitment / episode / association / valence）：
   * 它们**天然无 md 投影**（`file=''`），既不在恒定面也不在内容相关性面，
   * 由**情境键匹配**（线索驱动）供给。依据：编码特异性（提取取决于编码情境↔线索匹配，非内容相似度）
   * 与前瞻记忆多进程框架（承诺/意图须线索驱动，纯战略监控在高负荷下系统性失败）。
   * **独占预算**的理由与 `serendipity` 同构：`α_rel` 越强越不可能给"与当前情境相关但与任务文本不像"的条目留位置，
   * 改权重解决不了，只能分槽。
   */
  situation: number
  /**
   * **中层 `process` 槽（IR1 册三 · 2026-09-18 补账）**：任务级供给（`[路径]` 行）。
   * ⚠ **额度语义与其它槽不同**：它 `cap + proc.length` **外接追加**、**不吃 dynamic 额度**（零挤占是设计，不改）；
   *   本字段只为**出账**（"这一槽供了几行"）——缺省 0，不影响任何切割行为。
   */
  process?: number
}

/** 缺省 = 方案档 §13 #3 的注入硬顶（恒定 1,000 / 变动 600 / 一次性 200）；联想与情境槽缺省关 */
export const DEFAULT_BUDGET: SupplyBudget = { stable: 1000, dynamic: 600, oneshot: 200, serendipity: 0, situation: 0 }

/**
 * S4-1（2026-09-14）**预算口径的单一实现**：按总预算派生三层额度。
 *
 * 判因：这条公式此前**只写在 `panel-shared#buildHotMemoryText` 里**（手写三行），而 `DEFAULT_BUDGET`
 *   是另一套固定值 —— 同一件事两处口径，且**运行时的真实额度只存在于那一处代码里**
 *   （装配器拿到的 `stable` 是 1000，主路径实际是 3200，**差 3 倍**）⇒ 抽成单一实现。
 *
 * ⚠ **与 `DEFAULT_BUDGET` 的区别（不可互换）**：后者是**无总预算上下文时的固定缺省**（离线预览用）；
 *   本函数是**运行时按注册表总预算派生**（`stable` 吃余额，故远大于 1000）。
 *   这就是 S4-1「统一口径」的**边界**：统一的是**公式**，不是"把所有场景压成同一组数"。
 *
 * 与改前手写实现**逐式等价**（由 `scripts/test-budget-single.mjs` 内联旧公式作夹具比对）
 *   ⇒ 数值不变、**注入文本不变** —— 这正是本项能自主推进、无须产品决策的前提。
 */
export function budgetOf(totalChars: number): SupplyBudget {
  const total = Math.max(1200, Number(totalChars) || 4000)
  const oneshot = Math.max(80, Math.min(200, Math.round(total * 0.05)))
  const dynamic = Math.max(120, Math.min(600, Math.round(total * 0.15)))
  return { stable: Math.max(200, total - oneshot - dynamic), dynamic, oneshot, serendipity: 0, situation: 0 }
}

/**
 * 按字符预算逐行保留；返回 `[保留行, **被丢弃的行**]`。
 *
 * **归属**（S4R/R2 迁移）：本件从 `panel-shared` 迁来 —— 它是**裁切**（装配域），与 `budgetOf` /
 *   `assembleSupply` 同域，**放在 panel 侧本就是错位**（迁移同时解冻了 `panel-shared` 的冻结棘轮）。
 *
 * S4R/R2 语义变更：原先只返回"丢了几行"（`number`）⇒ 账**无法逐条比对**，只能是近似值。
 *   返回内容后账可**逐条核**（B2 的判据要求"逐条可比内容"）。
 *   **裁切行为不变**：保留集与丢弃集与原实现完全相同（`lines.length - out.length` → `lines.slice(out.length)`）。
 */
export const clampLines = (lines: readonly string[], cap: number): [string[], string[]] => {
  const out: string[] = []
  let used = 0
  for (const l of lines) {
    if (out.length && used + l.length + 1 > cap) return [out, lines.slice(out.length)]
    out.push(l)
    used += l.length + 1
  }
  return [out, []]
}

export interface SupplyInputs {
  /** 核心必进（身份/边界/当前工作区）——**超预算也进**，但计入溢出账，绝不静默 */
  core?: string[]
  /** 恒定面其余行 */
  stable?: string[]
  /** 变动面候选（**调用方按相关性排好序**；本件不重排） */
  dynamic?: string[]
  oneshot?: string[]
  /** 越界召回候选（G3 产物）——只在 serendipity 预算 > 0 时参与 */
  serendipity?: SerendipityPair[]
  /**
   * 情境槽候选（P3）——**已渲染好的环记录行**（`ring-supply#renderRingLine`），
   * 序由 `ring-supply` 按「情境命中 → 环优先级 → due → 新鲜」给出；本件**不重排**。
   * 只在 situation 预算 > 0 时参与。
   */
  situation?: string[]
}

export interface DroppedRow {
  /** 槽名（IR1 册三起含 `core` / `process` —— 六槽全出账，`process` 只补账不改额度） */
  slot: 'core' | 'stable' | 'dynamic' | 'oneshot' | 'process' | 'serendipity' | 'situation'
  line: string
  why: string
}

export interface SupplyResult {
  blocks: { core: string; stable: string; dynamic: string; oneshot: string; serendipity: string; situation: string }
  meta: {
    chars: number
    budgetTotal: number
    overBudget: boolean
    serendipityEnabled: boolean
    /** 情境槽是否开启（P3）——**解析后的值**，便于诊断"开关拔了没插" */
    situationEnabled: boolean
    kept: Record<'stable' | 'dynamic' | 'oneshot' | 'serendipity' | 'situation', number>
    dropped: DroppedRow[]
  }
}

export function budgetTotalOf(b: SupplyBudget): number {
  return b.stable + b.dynamic + b.oneshot + b.serendipity + b.situation + (b.process ?? 0)
}

/* ══ IR1 册三（2026-09-18）**装配单出口 · 账由真实裁切直出** ══════════════════════════════
 * 旧状（实测病灶 §2-3/§2-4）：主路径**两套装配** —— 自己切一遍（`clampLines` / `stableLinesOf` /
 *   `situationLinesOf`），再把手写候选喂给 `assembleSupply` **影子复算一遍**，两笔账并列 ⇒
 *   "账 == 真实裁切"只能靠**对拍**（实测虚报 6 vs 真实 1）；且 `kept` 只有 4 槽（**缺 `process`**）。
 * 现口径：**主路径的真实裁切结果直接进这里出账**（不再有第二份装配/复算），六槽逐槽出
 *   `{ kept, chars, dropped }`，丢弃行**带槽名 + 原因**（通道来源可分辨）。
 *
 * ⚠ **本件不切割**（不重排、不重算预算）—— 它是**记账**：切割语义仍属各领域（`hot-stable` 的块内配额、
 *   `clampLines` 的停-在首超、`situation-supply` 的环优先级）。这条边界是**有意**的：
 *   把三处切割搬进来需重做三种语义，而 C1（逐字节不变）是硬约束 ⇒ 收益（形式统一）不抵风险。
 *   账的**唯一性**（本册要消灭的"两笔账"）在此已彻底解决：账就是真实结果本身。
 */
export type SupplySlot = 'core' | 'stable' | 'dynamic' | 'oneshot' | 'process' | 'serendipity' | 'situation'

/** 主路径的真实裁切结果（每槽：**保留行** / 被丢行 / 该槽的丢弃原因） */
export interface SlotOutcome {
  kept: readonly string[]
  droppedRows?: readonly string[]
  /** 该槽**为何**被限量（缺省自动措辞）——`process` 槽零挤占，不带此字段 */
  why?: string
}

export interface SupplySlotsMeta {
  chars: number
  budgetTotal: number
  overBudget: boolean
  serendipityEnabled: boolean
  situationEnabled: boolean
  kept: Record<SupplySlot, number>
  /** 逐槽明细（IR1 册三 C3：**六槽全出账**，含 `process`） */
  slots: Record<SupplySlot, { kept: number; chars: number; dropped: number }>
  dropped: DroppedRow[]
}

const SLOT_WHY: Record<SupplySlot, string> = {
  core: '核心必进（不计入预算判定）',
  stable: '恒定面（P 层 always + 画像行）预算',
  dynamic: '变动面预算',
  oneshot: '一次性面预算',
  process: '中层 process 槽（**外接追加，零挤占** —— 只补账，不参与限额）',
  serendipity: '越界联想槽预算',
  situation: '情境槽预算',
}

/**
 * **账：由真实裁切直出**（纯函数、零 I/O、零重算）。
 * 入参 = 每槽**实际**保留的行与被丢的行（主路径产出）⇒ 账与文本**同源**，不可能漂移。
 * 不变式：`kept + dropped == 候选数`（由调用方保证；`test-usage-truth` 逐条核）。
 */
export function supplyMetaOf(
  outcomes: Partial<Record<SupplySlot, SlotOutcome>>,
  budget: SupplyBudget,
  opts: { budgetTotal?: number; cues?: readonly string[] } = {},
): SupplySlotsMeta {
  const slots = {} as SupplySlotsMeta['slots']
  const kept = {} as SupplySlotsMeta['kept']
  const dropped: DroppedRow[] = []
  let chars = 0
  let stableChars = 0
  for (const slot of ['core', 'stable', 'dynamic', 'oneshot', 'process', 'serendipity', 'situation'] as SupplySlot[]) {
    const o = outcomes[slot]
    const kLines = (o?.kept ?? []).map(String)
    const kChars = kLines.reduce((n, s) => n + s.length + 1, 0)
    chars += kChars
    if (slot === 'stable' || slot === 'core') stableChars += kChars
    const dRows = (o?.droppedRows ?? []).map(String)
    for (const line of dRows) dropped.push({ slot, line, why: `${slot}：${o?.why ?? SLOT_WHY[slot]}` })
    kept[slot] = kLines.length
    slots[slot] = { kept: kLines.length, chars: kChars, dropped: dRows.length }
  }
  const budgetTotal = Number(opts.budgetTotal ?? budgetTotalOf(budget))
  return {
    chars,
    budgetTotal,
    // 溢出 = 超总预算，或恒定面自身超额度（与 `assembleSupply` 同式）
    overBudget: chars > budgetTotal || stableChars > budget.stable,
    serendipityEnabled: budget.serendipity > 0,
    situationEnabled: budget.situation > 0,
    kept,
    slots,
    dropped,
  }
}

export interface CandidateDropped {
  id: string
  text: string
  why: string
}

export interface CandidateOpts {
  /** 判定时刻（**必填**：不吃隐式 now，否则结果不可复现） */
  at: string
  /** 核心必进的标签（缺省：身份/使命/边界） */
  coreTags?: readonly string[]
}

export interface Candidates {
  core: string[]
  stable: string[]
  dynamic: string[]
  /**
   * **环记录**（P2/P3）：无 md 投影但属已登记环（决策/后果/价态/关系/承诺/联想/情景）。
   * 它们**不属于**内容相关性面，交 `ring-supply` 走**情境键匹配**通道。此处只做**归类**，不在此处选行。
   */
  ring: MemRecord[]
  /** **时态失效**被剔除者（保留文本供复核——不静默消失） */
  expired: CandidateDropped[]
  /** 非可注入者条数（结构/空白/空行，以及无投影且不属任何环的记录） */
  notInjectable: number
}

export const DEFAULT_CORE_TAGS: readonly string[] = ['身份', '使命', '边界']

/**
 * **候选集构建**（读侧装配器的入口）：记录集 → 按层分好、且**已剔时态失效者**的候选。
 *
 * ⚠ **接线状态（2026-09-20 实测，先读这段再看下面）**：本函数**不在运行时注入链上** ——
 *   `src/` 内**零消费者**，唯一调用者是离线件 `scripts/supply-preview.mjs`（真库预览）
 *   与单测 `scripts/test-supply-assembly.mjs`（同族纪律：**注释自称不得当证据**，故此处只陈述实测）。
 *   ⇒ 时态失效（`validTo`）到注入面之间**没有经本函数的通路**；环记录那一路由 `ring-supply.ts:174`
 *     的 `isLive` 自行过滤（**另有一条同名语义**，见下方「口径」）。
 *   本节**曾经**把「失效者不得入候选」写成"**读侧的硬规则**"并称其为"读侧闭环" —— **那描述与实况不符**：
 *   `validTo` 在真库**从未落库过一条**（`.records/records.jsonl` 5777 行 · 非空 0），
 *   即便落了，本函数也吃不到（零消费者）。⇒ 现如实改为「**离线装配器的语义**」，
 *   并**登记**该缺口（`scripts/check-injection-reach.mjs` 的 REACH 表 + `docs/OPEN-ITEMS.md`）。
 *   ⚠ 不在此处"顺手接线"：零样本接线只会产出"机制在、证据无"的**假绿**（仓内教训）。
 *
 * 「为什么必须有这一步」的原设计意图（**保留**，它仍是本函数存在的理由）：`validFrom/validTo`
 *   若只写不读，机制就是**空转**——标了失效的断言照样进候选、照样被注入，
 *   「旧事实与新事实并存」的污染一点没减。本函数把「失效者不得入候选」变成候选构建的规则，
 *   并把被剔者**显式记账**（不是静默过滤）。
 *
 * 分层判据**复用仓内单一实现** `targets#indexRowInLayer` / `targets#isProfileRow`（不在此另写标签名单
 * 或行形态判据）。活性（lifecycle）**不在此处理**——那是既有 recall/panel 的职责；本件只管**时间维**（新轴），
 * 免得两条路径对同一件事各判一次（口径漂移的经典来源）。
 */
export function buildCandidates(records: readonly MemRecord[], opts: CandidateOpts): Candidates {
  const coreTags = new Set(opts.coreTags ?? DEFAULT_CORE_TAGS)
  const out: Candidates = { core: [], stable: [], dynamic: [], ring: [], expired: [], notInjectable: 0 }
  for (const r of records) {
    // ① **无内容**才是真的不可注入（结构/空白/空文本）
    if (r.kind === 'structure' || r.kind === 'blank' || !r.text.trim()) { out.notInjectable++; continue }
    // ② `file === ''` 的语义是「**无 md 投影**」（Record 独有），**不是**「不可注入」。
    //    旧实现把这两个概念混进同一个条件 ⇒ 环记录被**静默丢弃**。实测：980 条记录里带环语义的仅 9 条，
    //    且 9/9 因此零注入 —— 而它们恰好是"经历"所在（决策/后果/价态/关系/承诺/联想/情景）。
    //    现按 kind 分流：属已登记环者进 `ring`（交 ring-supply 走**情境键匹配**通道），其余仍计 non-injectable。
    if (r.file === '') {
      if (ringOfKind(r.kind) !== 'none') { if (isLive(r, opts.at)) out.ring.push(r); else out.expired.push({ id: r.id, text: r.text, why: `已于 ${r.validTo} 失效（环记录）` }) ; continue }
      out.notInjectable++
      continue
    }
    if (!isLive(r, opts.at)) { out.expired.push({ id: r.id, text: r.text, why: `已于 ${r.validTo} 失效${r.meta?.staleNote ? `（${r.meta.staleNote}）` : ''}` }); continue }
    const tag = indexRowTag(r.text)
    if (tag && coreTags.has(tag)) { out.core.push(r.text); continue }
    // 画像行（`- … ← 源:`）也属**恒定面**（P 层 always 的另一种 form）——不按 tag 分流的活口
    if (isProfileRow(r.text)) { out.stable.push(r.text); continue }
    if (indexRowInLayer(r.text, 'always')) out.stable.push(r.text)
    else out.dynamic.push(r.text)
  }
  return out
}

/** 把一条越界联想渲染成一行（人读可辨：两侧小节 + 跨度） */
export function serendipityLine(p: SerendipityPair): string {
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
  return `[联想] ${p.a.section} ⨯ ${p.b.section}（跨度 ${p.span}）｜${clip(p.a.text, 48)} ／ ${clip(p.b.text, 48)}`
}

/**
 * **按槽限额取行**（对外出口；IR1 册三起供主路径直接调用 —— 语义与 `assembleSupply` 内**同一实现**：
 *   「超出即跳过、后续更短的行仍有机会」，与 `clampLines` 的「停-在首超」**不同且不可互换**）。
 * 主路径的情境槽用它 ⇒ 切割语义仍属装配域（单一实现），而整段文本**逐字节不变**。
 */
export function takeSlotLines(lines: readonly string[], limit: number, slot: DroppedRow['slot'] = 'situation'): { kept: string[]; dropped: DroppedRow[] } {
  const dropped: DroppedRow[] = []
  const { kept } = takeSlot(lines, limit, slot, dropped)
  return { kept, dropped }
}

/**
 * 逐槽取行：**整条进或整条丢**（绝不截半行——半截行既走样又可能断指针）。
 * `mustInclude` 为 true 的行无视预算（核心必进），但仍计入字符账。
 */
function takeSlot(
  lines: readonly string[],
  limit: number,
  slot: DroppedRow['slot'],
  dropped: DroppedRow[],
  mustInclude: (l: string) => boolean = () => false,
): { kept: string[]; chars: number } {
  const kept: string[] = []
  let chars = 0
  for (const l of lines) {
    const s = String(l ?? '')
    if (!s.trim()) continue
    const cost = s.length + 1 // + 换行
    if (chars + cost > limit && !mustInclude(s)) {
      dropped.push({ slot, line: s, why: `超出 ${slot} 预算（已用 ${chars}/${limit}，本行 ${cost}）` })
      continue
    }
    kept.push(s)
    chars += cost
  }
  return { kept, chars }
}

/**
 * 装配（纯函数、确定性）：同输入必同输出。
 * 顺序即优先级：`core`（必进）→ `stable` → `dynamic` → `oneshot`；`serendipity` **独立成槽**。
 */
export function assembleSupply(inputs: SupplyInputs, budget: SupplyBudget = DEFAULT_BUDGET): SupplyResult {
  const dropped: DroppedRow[] = []
  const coreLines = (inputs.core ?? []).map(String).filter((s) => s.trim())
  const budgetTotal = budgetTotalOf(budget)
  const serendipityEnabled = budget.serendipity > 0
  const situationEnabled = budget.situation > 0

  // 恒定面：core 必进 + stable 其余填预算（core 的字符也占本槽额度，但 core 不受限）
  const stableTake = takeSlot(inputs.stable ?? [], budget.stable, 'stable', dropped)
  const coreChars = coreLines.reduce((n, s) => n + s.length + 1, 0)
  const stableChars = coreChars + stableTake.chars
  const dynamicTake = takeSlot(inputs.dynamic ?? [], budget.dynamic, 'dynamic', dropped)
  const oneshotTake = takeSlot(inputs.oneshot ?? [], budget.oneshot, 'oneshot', dropped)
  const serLines = serendipityEnabled ? (inputs.serendipity ?? []).map(serendipityLine) : []
  const serTake = takeSlot(serLines, budget.serendipity, 'serendipity', dropped)
  // 情境槽（P3）：独立预算，与相关性面**互不挤占**（与联想槽同规格）；关闭时不参与、也不记账
  const sitLines = situationEnabled ? (inputs.situation ?? []).map(String).filter((s) => s.trim()) : []
  const sitTake = takeSlot(sitLines, budget.situation, 'situation', dropped)

  const chars = coreChars + stableTake.chars + dynamicTake.chars + oneshotTake.chars + serTake.chars + sitTake.chars
  return {
    blocks: {
      core: coreLines.join('\n'),
      stable: stableTake.kept.join('\n'),
      dynamic: dynamicTake.kept.join('\n'),
      oneshot: oneshotTake.kept.join('\n'),
      serendipity: serTake.kept.join('\n'),
      situation: sitTake.kept.join('\n'),
    },
    meta: {
      chars,
      budgetTotal,
      // 溢出 = 超了预算，或（恒定面自身超额度/存在被挡下的行）
      overBudget: chars > budgetTotal || stableChars > budget.stable,
      serendipityEnabled,
      situationEnabled,
      kept: {
        stable: stableTake.kept.length,
        dynamic: dynamicTake.kept.length,
        oneshot: oneshotTake.kept.length,
        serendipity: serTake.kept.length,
        situation: sitTake.kept.length,
      },
      dropped,
    },
  }
}

export interface RenderOpts {
  /** 段落标题（缺省中文；调用方可覆盖以贴合宿主注入面文案） */
  headers?: Partial<Record<keyof SupplyResult['blocks'], string>>
  /** 是否附溢出说明行（缺省 false：溢出由 meta 记账，正文不额外占字符） */
  annotateOverflow?: boolean
  /**
   * S4R/R1（2026-09-14）**段序**（缺省 = 装配优先级 `core→stable→dynamic→oneshot→situation→serendipity`）。
   * 主路径（`buildHotMemoryText`）的段序是 **`oneshot→stable→dynamic`** —— 与装配优先级不同，
   * 这是"两套渲染"的结构差异之一（`S4R-closure-plan` §1）。
   */
  order?: readonly (keyof SupplyResult['blocks'])[]
  /**
   * S4R/R1 **段间分隔符**（缺省 `'\n\n'`）。主路径用 **`'\n'`**（单换行）。
   * ⚠ 这是 S4 §6.1 当初**漏记的第 6 处差异**，由本次真机对拍实证
   * （见 `test-render-opts.mjs` 的「先红」用例 —— 它**先证明差异存在**，再加选项消解）。
   */
  separator?: string
  /** S4R/R1 **末尾附加行**（缺省无）。主路径用「（本步受预算 N 字符约束省略 M 行；按需 get_file 读取）」 */
  tailNote?: string
}

/** 缺省段序（= 装配优先级）。**改它等于改所有既有调用方的输出** ⇒ 只许通过 `opts.order` 按调用点覆盖。 */
const DEFAULT_SEG_ORDER = ['core', 'stable', 'dynamic', 'oneshot', 'situation', 'serendipity'] as const

/**
 * 渲染成可注入文本（空段不产标题）。
 *
 * 缺省行为**与 R1 之前逐字节相同**（段序 = 装配优先级 · 分隔符 `'\n\n'` · 无 tailNote）——
 * 新选项全可选，既有调用方**零影响**（[原则] 变更先判因备份：共享接口只做**增量扩展**）。
 */
export function renderSupplyText(r: SupplyResult, opts: RenderOpts = {}): string {
  const H = { core: '【核心】', stable: '【恒定面】', dynamic: '【变动面】', oneshot: '【一次性】', serendipity: '【越界联想】', situation: '【情境】', ...opts.headers }
  const order = opts.order && opts.order.length ? opts.order : DEFAULT_SEG_ORDER
  const sep = opts.separator ?? '\n\n'
  const parts: string[] = []
  for (const k of order) {
    const body = r.blocks[k]
    if (!body) continue
    const h = H[k]
    // `headers[k]` 传**空串** ⇒ 视为"本段**不要外层标题**"（段内容自带标题）。
    //   主路径（`buildHotMemoryText`）即此形态 —— 它的 stable/dynamic 块内已含标题与行前缀。
    //   这是"两套渲染"的第 7 处差异（段标题有无），由 `test-render-opts` 的「先红」用例实证。
    parts.push(h ? `${h}\n${body}` : body)
  }
  if (opts.annotateOverflow && r.meta.dropped.length) parts.push(`（本次因预算挡下 ${r.meta.dropped.length} 行）`)
  if (opts.tailNote) parts.push(opts.tailNote)
  return parts.join(sep)
}
