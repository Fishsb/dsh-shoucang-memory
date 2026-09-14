/**
 * association-supply.ts — **联想候选的 IO 组合层**（单一实现 · 2026-09-13）
 *
 * 为什么要单独一层：同一条管道现在有**三个入口**——`shoucang_associate` 工具（会话内）、
 * 深睡 REM 相（`crossTopic` 的材料）、CLI（离线查看）。三处各写一遍必然漂移
 * （本会话已因"同事实多份副本"吃过多次亏）。故：
 *   · `association-propose.ts` 保持**纯函数零 IO**（切节 / 过滤 / 排序，可单测）；
 *   · 本件只做**组合**：读影子库 → 切节 → 批量嵌入 → 过滤；
 *   · 三个入口都调本件。
 *
 * 降级纪律：向量不可用 ⇒ **如实给出 `reason`，不产出候选、不退回结构规则假装生成**。
 */
import { loadStore } from './record-shadow.js'
import { sectionsOf, proposeAssociations, type AssocProposal } from './association-propose.js'
import { embedMany, type EmbedCfg } from './vec.js'

export interface AssocSupply {
  /** 切出的小节数 */
  sections: number
  /** 成功嵌入的小节数 */
  embedded: number
  proposals: AssocProposal[]
  /** 空结果的原因（**可读、可判断**；有候选时为 undefined） */
  reason?: string
}

export interface AssocSupplyOpts {
  minSim?: number
  maxShared?: number
  topN?: number
  /** 单批嵌入条数（本地端点过大不划算；缺省 32） */
  batch?: number
}

export async function supplyAssociations(root: string, embed: EmbedCfg, opts: AssocSupplyOpts = {}): Promise<AssocSupply> {
  const { records, error } = loadStore(root)
  if (error || !records.length) return { sections: 0, embedded: 0, proposals: [], reason: `影子库不可用（${error || '空'}）——先跑 record-sync --import` }
  const sections = sectionsOf(records)
  if (!sections.length) return { sections: 0, embedded: 0, proposals: [], reason: '未切出 notes 小节（库空或只有索引）——联想发生在**内容**之间' }
  const batch = Math.max(1, opts.batch ?? 32)
  const vecs: Array<number[] | null> = []
  for (let i = 0; i < sections.length; i += batch) {
    const vs = await embedMany(embed, sections.slice(i, i + batch).map((s) => s.text))
    if (!vs) {
      return {
        sections: sections.length,
        embedded: 0,
        proposals: [],
        reason: `**向量不可用**（${embed.enabled ? 'embed 调用失败/超时' : 'embedEnabled=false'}）——没有向量就生成不了联想；这正说明**纯结构规则做不了这件事**`,
      }
    }
    for (const v of vs) vecs.push(v && v.length ? v : null)
  }
  const embedded = vecs.filter((v) => !!v).length
  const proposals = proposeAssociations(sections, vecs, { minSim: opts.minSim, maxShared: opts.maxShared, topN: opts.topN })
  if (!proposals.length) return { sections: sections.length, embedded, proposals: [], reason: '本次无候选——要么语义都离得远，要么近的都只是**用词像**（那属于检索，不叫联想）' }
  return { sections: sections.length, embedded, proposals }
}

/** 把候选渲染成给**模型读的文本块**（工具与深睡共用同一版式 ⇒ 口径一致）。 */
export function renderAssocBlock(s: AssocSupply): string {
  const head = `候选 **${s.proposals.length}** 条（小节 ${s.sections} 全嵌入）——**仅为候选，勿当结论**`
  const rows = s.proposals.map((p) => `- 相似 ${p.sim.toFixed(3)} · 共词 ${p.sharedTokens}${p.shared.length ? `（${p.shared.slice(0, 3).join('/')}）` : '（**零共词**）'}\n    A ${p.a.key}：${p.a.text.slice(0, 70)}\n    B ${p.b.key}：${p.b.text.slice(0, 70)}`)
  return [head, ...rows, '判据：跨载体 + 语义近 + **词面不重叠**（共词多 ⇒ 那是检索，不是联想）。请判断哪几条**真成立**并说明联系，再决定是否落环。'].join('\n')
}
