// hot-stable.ts — 恒定面构造（2026-09-18 · 按域路由方案 P1，自 panel-shared 抽出）
//
// **由来**：`panel-shared.ts` 受 `check-module-growth` 大模块冻结棘轮约束（基线 537 + 容差 15），
//   本轮要新增「恒定面单独出口」——内联即撞顶（实测 553 FAIL）。门禁给出的正道是
//   「按**领域接缝**拆，不是按行数硬切」：恒定面构造（双画像块 + 块内配额 + 留痕 + 缓存判定）
//   本就是一个内聚领域，与动态面选行无关 ⇒ 按此抽出（panel-shared 净减行，实现仍只有一份）。
//
// **为什么需要这个出口（P1 的实质）**：守藏原注入走 `systemPrompt.context` ⇒ 落 `user/message`
//   （**可压区**，实测节点索引 3）；而 `systemPrompt.section` ⇒ 落 **surface 节点 0**（压缩豁免，
//   `compaction-basic/lib/index.js:393-398`）。恒定面与 query **无关**（`readCarrier` 全文无 q 引用，实测）
//   ⇒ 可独立挂 section 获得豁免；动态面依赖 query ⇒ 留在 context（本就该按需、可丢）。
//
// **接口形态（为什么 stash 而非传 ctx）**：`buildStable()` 每步都被调用，必须**零副作用**——
//   尤其不能调 `buildHotMemoryText('')`（那会覆盖 `cache.text` 与影子记账 usage，使 `/inject/stats`
//   读到空 query 口径）。故主路径构建时把**与 query 无关的参数**存进 `cache.sd`，本出口只消费它 + 缓存。
import { clampLines } from './supply-assembly.js'
import { MEMORY_PLAYBOOK_LINES } from './injection-playbook.js'

/** 稳定面缓存的失效窗口（毫秒）。与主路径同口径（两套 TTL 会让两处不同步）。 */
export const STABLE_TTL_MS = 120000

/**
 * 恒定面构造的**query 无关参数**（主路径在 `buildHotMemoryText` 内组装一次并存入 `cache.sd`）。
 * 全部字段与 query 无关 ⇒ 可安全供每步调用。
 */
export interface StableStash {
  /** 缓存键：`memRoot|personaMode|profileCap|playbook|尺寸签名`（口径属调用方，本件只比对） */
  key: string
  /** 记忆库根（抬头行用） */
  memRoot: string
  /** 恒定面额度 = `budgetOf(totalBudget).stable` */
  capStable: number
  /** 判据常驻块是否启用 */
  playbookOn: boolean
  /** agent 侧恒定面行（**含块标题行**） */
  agentBlock: readonly string[]
  /** user 侧恒定面行（同上） */
  userBlock: readonly string[]
}

/** 本件只需 cache 的这 4 个字段（窄化 ⇒ 与 panel-shared 的 HotMemoryCache 结构兼容）。 */
export interface StableCache {
  stableKey: string | null
  stableAt: number
  stableText: string[]
  realCut?: { stable: number; dropped: string[] }
}

/** 把「画像行」渲染成带块标题的行集（标题行也受配额约束 —— 与抽出的原实现一致）。 */
export function stableStashOf(
  memRoot: string, capStable: number, playbookOn: boolean,
  key: string, agentLines: readonly string[], userLines: readonly string[],
): StableStash {
  return {
    key, memRoot, capStable, playbookOn,
    agentBlock: agentLines.length ? ['agent 画像（AGENT.md；含 [原则]/[路径] 与成长画像行 `← 源:`——①③步优先读）：', ...agentLines.map((l) => (/^-\s/.test(l) ? l : `- ${l}`))] : [],
    userBlock: userLines.length ? ['用户画像（USER.md）：', ...userLines.map((l) => (/^-\s/.test(l) ? l : `- ${l}`))] : [],
  }
}

/**
 * 构造（或复用）恒定面行集。**与主路径同源**：主路径也调本函数 ⇒ 不存在第二套渲染口径。
 * 缓存判定：键相同且未超 TTL ⇒ 复用（零重算、零读盘）；否则重算并回写同一 cache。
 * ⚠ `realCut`（真实裁切的保留数与被丢行）由本件回写 —— `supplyUsageMeta` 依赖它算账，不得漏。
 */
export function stableLinesOf(s: StableStash, now: number, cache: StableCache): string[] {
  if (cache.stableKey === s.key && cache.stableAt > 0 && now - cache.stableAt < STABLE_TTL_MS && cache.stableText.length) {
    return cache.stableText
  }
  const head = `[守藏·热记忆] 记忆库指针（${s.memRoot}；详情按指针 get_file 拉对应 notes §小节）：`
  // ★运行态缺陷修复（2026-09-13 重启验证实测）：**两块各自配额**。
  //   原实现对「agent+user 合并后的 stable 数组」做一次 clamp ⇒ agent 画像一超预算就把 USER 画像
  //   **整段挤掉**（/inject/preview 实测 `含用户画像段 = false`），违反 I2a「恒定面每步必在」。
  //   现按块切分（55% / 45%，各自下限 120 字符）：**块内裁行、不丢块**，且各自留痕可见化。
  const capAgent = Math.max(120, Math.round(s.capStable * 0.55))
  const capUser = Math.max(120, s.capStable - capAgent)
  const [a2, dA] = clampLines([...s.agentBlock], capAgent)
  const [u2, dU] = clampLines([...s.userBlock], capUser)
  const sl: string[] = s.playbookOn ? [head, ...MEMORY_PLAYBOOK_LINES, ...a2] : [head, ...a2]
  if (dA.length > 0) sl.push(`（agent 画像另省略 ${dA.length} 行，按需 get_file 读取）`)
  sl.push(...u2)
  if (dU.length > 0) sl.push(`（用户画像另省略 ${dU.length} 行，按需 get_file 读取）`)
  cache.stableKey = s.key
  cache.stableAt = now
  cache.stableText = sl
  cache.realCut = { stable: a2.length + u2.length, dropped: [...dA, ...dU] }
  return sl
}

/** 恒定面**单独出口**的文本形态（`HotMemory.buildStable()` 用）。 */
export function stableTextOf(s: StableStash, now: number, cache: StableCache): string {
  return stableLinesOf(s, now, cache).join('\n')
}
