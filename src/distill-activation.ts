// distill-activation.ts — 蒸馏「激活采样（打扰度打分与自适应冷却）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（7 项）。
//   对外只暴露 createActApi(d) —— 返回绑定后的句柄，调用方零感知。
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { memoryLibRoot } from './targets.js'
import { recallRanked, semanticSim } from './vec.js'
import type { InfraApi } from './distill-infra.js'
import type { EmbedCfg } from './vec.js'
import { isNoiseIntent } from './distill-candidates.js'
import type { DistillState } from './distill-state.js'

export interface ActDeps {
  actShadowFile: string
  embedCfgOf(): EmbedCfg
  actConf: { on: number; off: number; cooldown: number; topK: number }
  actState: Map<string, { state: 'idle' | 'prefetch'; cooldown: number; prevScore: number }>
  infra: InfraApi
  st: DistillState
  config: any
}

/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never

export function createActApi(dep: ActDeps) {
  return {
    activationStep: (...a: Tail<Parameters<typeof activationStep>>) => activationStep(dep, ...a),
  }
}
export type ActApi = ReturnType<typeof createActApi>




// 路线④ 打扰度观察（v6 向量政策 2026-09-10：打分改 recallRanked 融合召回——dense 主、lexical 稳；
// sim 口径随 mode：fusion 的 score=0..100（已 min-max 归一）→ /100；lexical=命中数/tokens。阈值随影子样本再校准）
const activationStep = async (dep: ActDeps, sid: string, event: any): Promise<void> => {
  try {
    if (!event) return
    const d = event.data || {}
    // ACT-024（2026-09-11 结构性去污染，实测污染率 49.3%）：DSH 把**宿主注入块也作为 `user/message` 事件**下发
    // （系统提示快照 / 后台 job 与子代理回执 / 指令文件 / skill 目录），旧实现只按内容正则判 → 大量非用户文本
    // 进入影子样本（"Current runtime context…"、"Background subagent … finished"、"Agent <uuid> sent a message"）。
    // 判别改用**结构字段 `data.source.kind`**（真值域：user / plugin / agent-instructions / skill-catalog /
    // agent-message / subagent-settled …）：带源且非 `user` 一律丢弃；无 source 的旧格式/夹具事件走内容闸兜底。
    const srcKind = String((d.source && d.source.kind) || '')
    const arr = Array.isArray(d.content) ? d.content : []
    let text = ''
    for (const c of arr) if (c && c.type === 'text' && typeof c.text === 'string') text += c.text
    if (event.type !== 'user/message' || !text.trim()) return
    if (srcKind) { if (srcKind !== 'user') return } else if (isNoiseIntent(text.trim())) return
    const rres = await recallRanked(memoryLibRoot(), text, dep.actConf.topK, 'all', dep.embedCfgOf())
    const { rows, tokens } = rres
    if (!tokens.length && !rows.length) return
    // 相对分（旧口径）：融合召回**池内 min-max 归一化**后的分数
    const relSim = !rows.length ? 0
      : rres.mode === 'fusion' ? Math.min(1, (rows[0].score || 0) / 100)
      : Math.min(1, rows[0].score / (tokens.length || 1))
    // ACT-024（2026-09-11 重校准）：阈值量改为**绝对余弦**（用户文本 ↔ 命中索引行）。
    // 判因（实测 200 条干净样本）：相对分是池内归一化量，p50=0.770、p90=1.000 —— 现状阈值 0.62 会命中
    // 88.5% 的真实用户消息，**结构上不可标定**；绝对余弦则可分辨（真命中 0.62–0.73，噪声 0.38–0.45）。
    // embed 不可用/失败 → 退化回相对分（与旧行为一致，不误报）。
    const ecfg = dep.embedCfgOf()
    let sim = relSim
    let metric = 'rel-fallback'
    if (rows.length && ecfg.enabled) {
      try {
        const c = await semanticSim(text, rows[0].line, ecfg)
        if (c !== null) { sim = Math.max(0, Math.min(1, c)); metric = 'abs-cos' }
      } catch { /* 失败保持回退 */ }
    }
    let actSt = dep.actState.get(sid) || { state: 'idle', cooldown: 0, prevScore: 0 }
    const prev = actSt.state
    let emit = false
    if (actSt.cooldown > 0) actSt.cooldown--
    if (sim >= dep.actConf.on && actSt.cooldown === 0 && actSt.state === 'idle') { actSt.state = 'prefetch'; emit = true; actSt.cooldown = dep.actConf.cooldown }
    else if (sim < dep.actConf.off && actSt.state !== 'idle') { actSt.state = 'idle' }
    actSt.prevScore = sim
    dep.actState.set(sid, actSt)
    // 影子校准：每个有打分的 user 消息都落一行（跃迁/emit 也落）——样本分布是阈值校准原料，宁密勿稀
    try {
      mkdirSync(dirname(dep.actShadowFile), { recursive: true })
      appendFileSync(dep.actShadowFile, JSON.stringify({
        at: new Date().toISOString(), kind: 'activation-step', sid: dep.infra.sidShort(sid), rmode: rres.mode, mode: dep.config.activationPrefetch ? 'prefetch-armed' : 'shadow',
        src: srcKind || 'unknown', // ACT-024：采样源（应为 user；旧格式行无此字段）——供校准与污染复盘
        metric, rel: Number(relSim.toFixed(3)), // ACT-024：判据量（abs-cos 为现行）；rel 留档旧口径便于对照
        state: actSt.state, prev, sim: Number(sim.toFixed(3)), tOn: dep.actConf.on, tOff: dep.actConf.off,
        emit, tokens: tokens.length, hit: rows.length ? rows[0].line.slice(0, 120) : '',
        pointers: rows.slice(0, 2).map((r) => r.pointer), excerpt: text.slice(0, 60),
      }) + '\n', 'utf8')
    } catch { /* 影子日志失败静默 */ }
  } catch { /* 观察零抛出 */ }
}
