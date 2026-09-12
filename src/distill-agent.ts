// distill-agent.ts — 蒸馏「单会话蒸馏驱动（主流程 / 空闲重武装 / JSON 解析 / 手动触发入口）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（15 项）。
//   对外只暴露 createAgentApi(d) —— 返回绑定后的句柄，调用方零感知。
import { mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { memoryLibRoot } from './targets.js'
import { CHUNK_CHARS, MAX_CHUNKS_PER_RUN, buildEventChunks, manifestLineFor, manifestPush } from './distill-chunks.js'
import { recallRanked } from './vec.js'
import { evaluateL0 } from './criteria.js'
import { DISCARD_SNAPSHOT_CB_N, SKIP_HOLD_MAX, planSkipWatermark } from './deepsleep-core.js'
import type { EmbedCfg } from './vec.js'
import type { InfraApi } from './distill-infra.js'
import type { CandApi } from './distill-candidates.js'
import type { WmApi } from './distill-watermark.js'
import type { LlmApi } from './distill-llm.js'
import type { WriteApi } from './distill-write.js'
import type { ParentApi } from './distill-parent.js'
import type { DistillState } from './distill-state.js'

export interface AgentDeps {
  io: { infra: InfraApi; pendDir: string }
  wm: { wm: WmApi; st: DistillState }
  write: { write: WriteApi; bankSnapshot(label: string): Promise<void> }
  llm: { llm: LlmApi; llmState: { providerFailCount: number }; embedCfgOf(): EmbedCfg }
  cand: { cand: CandApi }
  parent: { parent: ParentApi }
  env: { config: any; ctx: any; hasDistillSignals(...a: any[]): boolean; DEFAULT_DISTILL_PROMPT: string }
}

/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never

export function createAgentApi(dep: AgentDeps) {
  return {
    distillAgent: (...a: Tail<Parameters<typeof distillAgent>>) => distillAgent(dep, ...a),
    armIdleTimer: (...a: Tail<Parameters<typeof armIdleTimer>>) => armIdleTimer(dep, ...a),
    parseAgentJson: (...a: Tail<Parameters<typeof parseAgentJson>>) => parseAgentJson(dep, ...a),
    runDistillNow: (...a: Tail<Parameters<typeof runDistillNow>>) => runDistillNow(dep, ...a),
  }
}
export type AgentApi = ReturnType<typeof createAgentApi>





const distillAgent = async (dep: AgentDeps, agent: any): Promise<void> => {
  const sid = agent.id as string
  if (dep.wm.st.distilling.has(sid)) return // 并发守卫（本 fiber 内）：蒸馏在途（最长 10min）内再触发直接跳过
  if (agent.status && agent.status !== 'idle') { dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 已恢复活跃（status=${agent.status}），跳过`); return }
  // 子代理守卫（2026-09-10 实态修复）：主会话派子代理执行并等待返回时，主会话 turn/end 已完成、status=idle、
  // 但其子代理仍在 running——此时蒸馏只是把任务"做到一半"的内容切碎入册，且水位推进后不会重蒸。
  // 处理：本轮推迟（不推水位、不消费），重新武装 idle 定时器；子代理完成时父会话会收到 followup 事件再触发。
  if (dep.parent.parent.hasActiveSubagents(sid)) {
    dep.io.infra.audit({ sid, kind: 'distill-skip', reason: 'active-subagent', fclass: 'busy-subagent' })
    dep.io.infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'busy-subagent' }, result: { added: 0, rejected: 0, failed: 0 } })
    dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 有活跃子代理在跑（等待返回），推迟蒸馏（水位保留）`)
    armIdleTimer(dep, agent)
    return
  }
  dep.wm.st.distilling.add(sid)
  let claimed = false
  try {
    // A2（2026-09-11 审查修复）：入口先回流 project-defer 卡 —— 它们是「已裁决为项目卡」的降级暂存，
    // 只因 workspace 当初不可解才留在 pending；绝不能再喂 LLM 重裁决（会按本轮会话 route 一刀切 →
    // 落错工作区；随后还可能被候选 .processed 吞掉）。flush 内部按卡内「源会话」反解 workspace。
    try { await dep.write.write.flushDeferCards() } catch { /* 回流失败不阻断本轮蒸馏 */ }
    dep.llm.llm.validateProvider()
    // v19（2026-09-10）：水位不再是裸数字——经「格式代 + 锚点事件指纹」双证校验，迁移/序号重排即作废全量重蒸。
    // 快照只取一次（同一数组喂水位增量计算 + 分段器），避免全量 snapshotEvents 被重复物化。
    const wmEvents: any[] = agent.session.snapshotEvents()
    const baseline = dep.wm.wm.resolveWatermark(sid, agent)
    // ⚠ `lastSeq = 0`（整窗）在此处承载**两种成因完全不同的情况**，勿再误读成单一缺陷：
    //   (a) 真·无基线：`resolveWatermark` 返回 null 是因为**水位缺失**（`!wm`）或**水位本身 <= 0**
    //       —— 没有可用边界，全量是**唯一选择**；
    //   (b) 语义 B 主动全量：水位存在且双证失效，但 live 边界 `maxSeq < prevSeq`（序号空间已重排/缩小，
    //       如 prevSeq=101539 / maxSeq=511）——旧 seq 已不可寻址，**全量是故意的、是正确行为，不要"修"**。
    //       对应 `planDegradedBaseline` 返回 `degrade:false` 的分支（G-20）。
    //   反之，双证失效但边界未回退（`maxSeq >= prevSeq`）时 `resolveWatermark` 返回的是**降级基线**
    //   （`{ lastSeq: maxSeq, degraded: true }`），走的是语义 A——此处 lastSeq 不为 0，不整窗。
    const lastSeq = baseline ? baseline.lastSeq : 0
    // G-20 熔断：连续 N 轮拿不到会话快照 ⇒ 本轮跳过（不再整窗重蒸烧 LLM）。
    // 依据：水位注释预言「写 0 → 下次读仍判不可验证 → 每轮全量重蒸，形成死循环」；
    //       实测 09-11 仅失效 2 轮即自愈，**没触发是运气（下轮快照就恢复），不是设计保证**——故必须有这道闸。
    const streak = dep.wm.st.snapshotUnavailableStreak.get(sid) ?? 0
    if (streak >= DISCARD_SNAPSHOT_CB_N) {
      dep.io.infra.audit({ sid, kind: 'distill-skip', reason: 'snapshot-unavailable-circuit-break', fclass: 'snapshot-unavailable', streak, threshold: DISCARD_SNAPSHOT_CB_N })
      dep.io.infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'snapshot-unavailable-circuit-break' }, result: { added: 0, rejected: 0, failed: 0 } })
      dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 快照连续 ${streak} 轮不可用（阈值 ${DISCARD_SNAPSHOT_CB_N}）→ 本轮跳过（熔断，防整窗重蒸死循环）`)
      return
    }
    // v18 分段蒸馏（2026-09-10）：整窗按 CHUNK_CHARS/事件边界切段后逐段蒸馏——每段成功即推水位到该段 endSeq
    // （断点续传），段间紧凑清单 manifest 续上下文防同轮重复入册；修复旧「整窗一次注入 24k 截断丢尾 / 失败整窗重蒸」。
    const { chunks, maxSeq } = buildEventChunks(agent, lastSeq, CHUNK_CHARS, wmEvents)
    // A3：统一 claim（idle 与扫尾同一判定）——在途即让位（本 fiber 结束/早退时释放）。
    if (!dep.write.write.tryClaim(sid, lastSeq, maxSeq)) {
      dep.io.infra.audit({ sid, kind: 'distill-skip', reason: 'claim-held', fclass: 'claim-held' })
      dep.io.infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'claim-held' }, result: { added: 0, rejected: 0, failed: 0 } })
      dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} claim 在途（其他实例接管中），本轮让位`)
      return
    }
    claimed = true
    const totalChars = chunks.reduce((n, c) => n + c.text.length, 0)
    let candFiles: string[] = []
    // A2：候选池排除 project-defer 卡（它们归 flushDeferCards 直写，不进 LLM 重裁决）
    try { candFiles = readdirSync(dep.io.pendDir).filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(f) && !f.includes('-project-defer-')).sort() } catch { candFiles = [] }
    // 门槛（below-min 语义保持现状）：整窗文本总字符 < minTurnChars（chunks 空=无增量/全无文本事件）→ 跳过并推进水位
    if (!chunks.length || totalChars < (dep.env.config.minTurnChars ?? 200)) {
      // G-4a：有未消化段时**不得**把水位推到 maxSeq（否则该段永不重扫），改为扣住不推（最多 SKIP_HOLD_MAX 轮）
      const skipPlan = planSkipWatermark(dep.write.write.hasPendingUndigested(sid), dep.wm.st.skipHoldStreak.get(sid) || 0, maxSeq)
      dep.wm.st.skipHoldStreak.set(sid, skipPlan.holdRounds)
      if (skipPlan.write) dep.wm.wm.writeWatermark(sid, skipPlan.seq, agent)
      // 跳过也留审计痕（观测盲区修复 2026-09-09：此前门槛/预筛跳过只进日志，审计里只见真实 run，
      // 「蒸馏为什么没跑」无法从数据区分——是没触发还是被挡）
      dep.io.infra.audit({ sid, kind: 'distill-skip', reason: 'below-min-chars', fclass: 'below-min', chars: totalChars, skipPlan: skipPlan.reason, heldForUndigested: !skipPlan.write, starved: skipPlan.holdRounds, watermarkTo: skipPlan.write ? skipPlan.seq : lastSeq })
      dep.io.infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'below-min-chars', chars: totalChars, heldForUndigested: !skipPlan.write }, result: { added: 0, rejected: 0, failed: 0 } })
      dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 增量 ${totalChars} 字符 < 门槛${skipPlan.write ? `，水位推进 ${lastSeq}→${skipPlan.seq}（${skipPlan.reason}）` : `，因存在未消化段**扣住水位** ${lastSeq}（第 ${skipPlan.holdRounds}/${SKIP_HOLD_MAX} 轮，${skipPlan.reason}）`}`)
      return
    }
    if (dep.env.config.distillPrescan !== false) {
      // 2026-09-10 用户拍板：大段增量强制蒸馏——信息密集但无信号词的会话（如研究/工具流）不再被预筛整段丢弃
      // v18 分段口径：信号词判定按首段文本（首段=窗口最早 ≤CHUNK_CHARS 前缀，窗口小于预算时即整窗）；
      // 大段强制阈值按整窗总字符（保留现状语义：增量 ≥prescanMin 强制蒸馏，与切段与否无关）
      const prescanMin = Number(dep.env.config.prescanMinChars) > 0 ? Number(dep.env.config.prescanMinChars) : 4000
      const bigDelta = totalChars >= prescanMin
      const hasSig = bigDelta || dep.env.hasDistillSignals(chunks[0].text)
      if (!hasSig && candFiles.length === 0) {
        // G-4a：同上——有未消化段时不得推到 maxSeq
        const skipPlan = planSkipWatermark(dep.write.write.hasPendingUndigested(sid), dep.wm.st.skipHoldStreak.get(sid) || 0, maxSeq)
        dep.wm.st.skipHoldStreak.set(sid, skipPlan.holdRounds)
        if (skipPlan.write) dep.wm.wm.writeWatermark(sid, skipPlan.seq, agent)
        dep.io.infra.audit({ sid, kind: 'distill-skip', reason: 'prescan-no-signal', fclass: 'prescan-no-signal', chars: totalChars, skipPlan: skipPlan.reason, heldForUndigested: !skipPlan.write, starved: skipPlan.holdRounds, watermarkTo: skipPlan.write ? skipPlan.seq : lastSeq })
        dep.io.infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'prescan-no-signal', chars: totalChars, heldForUndigested: !skipPlan.write }, result: { added: 0, rejected: 0, failed: 0 } })
        dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 预筛跳过（增量 ${totalChars} 字符无信号词 & pending 无候选）${skipPlan.write ? `，水位推进 ${lastSeq}→${skipPlan.seq}（${skipPlan.reason}）` : `，因存在未消化段**扣住水位** ${lastSeq}（第 ${skipPlan.holdRounds}/${SKIP_HOLD_MAX} 轮，${skipPlan.reason}）`}`)
        return
      }
      dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 预筛通过（信号词=${hasSig}${bigDelta ? `，大段 ${totalChars}≥${prescanMin} 强制蒸馏` : ''}，pending 候选=${candFiles.length}），进入分段蒸馏`)
    }
    // 候选按文件粒度装填：预算内进 prompt，放不下的整文件留 pending 下轮（防截断外候选被整批归档丢失知识）
    const CAND_BUDGET = 12000
    const candIncluded: string[] = []
    let candBudget = CAND_BUDGET
    const candText = candFiles.map((f) => {
      let body = ''
      try { body = readFileSync(join(dep.io.pendDir, f), 'utf8') } catch { return '' }
      const candBlock = `### 源 ${f}\n${body}`
      if (candBlock.length > candBudget) return '' // 本文件装不下：不进本轮，保留 pending
      candBudget -= candBlock.length + 1 // +1 join('\n') 分隔符
      candIncluded.push(f)
      return candBlock
    }).join('\n')

    // ═══ v18 分段主循环（2026-09-10）：每段一次性 spawn（与现状同参数），段间连续性由 manifest 紧凑清单承接；
    // 「可复用子代理 + 全上下文」列为后续可选档（规格已定，本轮不实现）。
    // 每段成功（stop=completed && out）→ 既有 route 判定 + writeDispatch + episode 留痕 + 立即 writeWatermark(该段 endSeq)；
    // 段失败 → 记录 log/审计并 break：水位停在失败段前（已成功段已推进）→ 下一触发从失败段断点续传，前段不重蒸。
    const resolvedLlm = dep.llm.llm.resolveLlm(dep.env.config.distillProvider, dep.env.config.distillModel)
    const useProvider = !!resolvedLlm && dep.llm.llmState.providerFailCount < 2
    const agentOptions = useProvider ? { provider: resolvedLlm!.provider, model: resolvedLlm!.model } : undefined
    const segLimit = Math.min(chunks.length, MAX_CHUNKS_PER_RUN)
    const MANIFEST_CAP = 1500 // 同轮前段固化清单字符上限（超出丢最早行；只服务同轮后段查重/合并）
    let manifest = ''
    let wmNow = lastSeq
    let anyAdded = false
    for (let k = 0; k < segLimit; k++) {
      const chunk = chunks[k]
      let segOk = false
      let ac: AbortController | null = null
      let abortTimer: ReturnType<typeof setTimeout> | null = null
      let raceTimer: ReturnType<typeof setTimeout> | null = null
      try {
        // v6 向量政策：给裁决 agent 喂「相关既有记忆」上下文（recallRanked 融合召回，query=本段 text 前 512）——
        // Q0 已有归属 / Q3 能合并 判定从此有库内证据；未启用/失败自动省略
        let relMemLines = ''
        try {
          const rres = await recallRanked(memoryLibRoot(), chunk.text.slice(0, 512), 5, 'all', dep.llm.embedCfgOf())
          if (rres.rows.length) relMemLines = rres.rows.map((r) => `- ${r.line}`).join('\n')
        } catch { /* 相关记忆上下文失败=省略 */ }
        const userInput = [
          `## 待蒸馏会话\nsessionId=${sid}（分段蒸馏，本段 seq ${chunk.startSeq}→${chunk.endSeq}，共 ${chunks.length} 段第 ${k + 1} 段）`,
          `## 会话增量正文（本段）\n${chunk.text}`,
          manifest ? `## 同轮前段固化清单（防重复入册/可引用合并，勿重复入册）\n${manifest}` : '（同轮前段固化清单：无——本段为当前触发首段；后续段将携带本段裁决清单防重复入册）',
          relMemLines ? `## 相关既有记忆（recallRanked 召回，Q0 已有归属 / Q3 合并判据；命中即视为已覆盖候选）\n${relMemLines}` : '（相关既有记忆：未启用向量或零命中，按无历史裁决）',
          candIncluded.length ? `## 待固化候选（pending/ 中 ${candIncluded.length}/${candFiles.length} 个，预算 ${CAND_BUDGET} 字符内）\n${candText}` : (candFiles.length ? '（待固化候选超预算，本轮不携带；候选保留 pending 待下轮）' : '（无待固化候选）'),
          '请按规则处理：裁决本段可复用知识点并输出入册指令 JSON。',
        ].join('\n\n')

        ac = new AbortController()
        abortTimer = setTimeout(() => { try { ac?.abort(new Error('distill timeout 10min')) } catch { /* */ } }, 600000)
        const run2 = await dep.env.ctx.subagents.start('spawn', {
          label: `distill-${dep.io.infra.sidShort(sid)}`,
          parent: agent,
          signal: ac.signal,
          maxDepth: 1,
          ...(agentOptions ? { agentOptions } : {}),
          prompt: [{ type: 'text', text: userInput }],
          persona: dep.env.config.distillPrompt || dep.env.DEFAULT_DISTILL_PROMPT,
          toolFilter: { allow: [] },
        })
        const result = await Promise.race([
          run2.result,
          new Promise((resolve) => { raceTimer = setTimeout(() => resolve({ stopReason: 'timeout' } as any), 600000) }),
        ]) as any
        if (abortTimer) { clearTimeout(abortTimer); abortTimer = null }
        if (raceTimer) { clearTimeout(raceTimer); raceTimer = null }
        const stop = result && result.stopReason
        const out = parseAgentJson(dep, result, `distill ${dep.io.infra.sidShort(sid)}`) // 子代理输出 → JSON（剥离代码栅栏+容错提取，与深睡共用同一实现）
        if (stop === 'completed' && out) dep.llm.llmState.providerFailCount = 0
        else if (useProvider && (stop !== 'completed' || !out)) dep.llm.llmState.providerFailCount++
        const rawRoute = (out && typeof out.route === 'string') ? out.route.trim().toLowerCase() : ''
        const route = ['memory', 'project', 'discard'].includes(rawRoute) ? rawRoute : 'memory' // 归一化+未知回退 memory（宁滥勿丢）
        const workspace = await dep.llm.llm.resolveWorkspace(sid)
        const disp = route === 'discard'
          ? { added: 0, rejected: 0, failed: 0, targetLib: 'none' }
          : await dep.write.write.writeDispatch(sid, out, route, workspace)
        dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 段${k + 1}/${segLimit}（seq ${chunk.startSeq}→${chunk.endSeq}）stop=${stop} route=${route} → ${disp.targetLib} 入册 ${disp.added} / 拒收 ${disp.rejected} / 失败 ${disp.failed}`)
        // WikiSkill 借鉴：失败归类 fclass（供审计聚合/深睡根因回流）+ LLM 指纹（大小模型蒸馏质量实证的数据底座）
        const llmLabel = useProvider && resolvedLlm ? `${resolvedLlm.provider}/${resolvedLlm.model}` : 'inherited'
        const fclass = !out ? 'json-parse'
          : stop !== 'completed' ? (useProvider ? 'provider-fail' : 'agent-stop')
          : route === 'discard' ? 'discard'
          : disp.failed > 0 ? 'dispatch-failed'
          : disp.rejected > 0 ? 'gate-reject'
          : 'ok'
        // v18：审计行与 raw-stub 均带分段标记（chunk/chunkStart/chunkEnd/totalChunks）；stub watermark=该段推进区间（同步用该段 endSeq）
        dep.io.infra.audit({ sid, kind: 'distill-run', route, stop, fclass, llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length })
        // 判据台账（摄取域）：模型判据（可选 judgement）+ 宿主 L0 代理评估 + 决策与结果
        dep.io.infra.ledger({
          domain: 'ingest', sid: sid.slice(0, 8), chunk: k + 1,
          judgement: (out && out.judgement) || null,
          l0After: evaluateL0({ text: String(chunk.text || '').slice(0, 400), traces: 1 }),
          decision: { route, fclass, handledByHost: true },
          result: { added: disp.added, rejected: disp.rejected, failed: disp.failed, targetLib: disp.targetLib },
          enqueued: { appends: (out?.appends || []).length, newIndex: (out?.newIndex || []).length, profiles: (out?.profiles || []).length, projectCards: (out?.projectCards || []).length, skipped: (out?.skipped || []).length },
        })
        if (disp.added > 0 || (out?.newIndex || []).length > 0) void dep.write.bankSnapshot('distill') // v2：写后库快照（best-effort，不阻塞）
        // v2.1 M2：摄取侧**写入回执**（write.ingest）
        dep.io.infra.ledger({
          type: 'write.ingest', domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), chunk: k + 1,
          channel: 'appends+newIndex', carrier: 'gated:index', target: disp.targetLib || 'memory',
          verdict: disp.added > 0 ? 'written' : (disp.rejected > 0 ? 'rejected' : 'skipped'),
          attempted: (out?.appends || []).length + (out?.newIndex || []).length, written: disp.added, rejected: disp.rejected, failed: disp.failed,
        })
        dep.io.infra.recordStub({ sid, watermark: [wmNow, chunk.endSeq], chars: chunk.text.length, route, stop, fclass, llm: llmLabel, disp: { added: disp.added, rejected: disp.rejected, failed: disp.failed, targetLib: disp.targetLib }, outShape: out ? { appends: (out.appends || []).length, newIndex: (out.newIndex || []).length, profiles: (out.profiles || []).length, projectCards: (out.projectCards || []).length, skipped: (out.skipped || []).length } : null, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length })
        if (stop === 'completed' && out && disp.failed === 0) {
          if (disp.added > 0) anyAdded = true
          // 路线②：蒸馏裁决完成（stop=completed && out，无论入册多少）即留轻 episode——episode=「任务发生+结果」的
          // 同类判定/转正数据源（memory-core-model §3.1）；入册或裁决非 discard 时再建/更新低置信任务候选
          const intent = dep.cand.cand.intentOf(chunk.text)
          dep.io.infra.recordEpisode({ sid, intent: intent.slice(0, 120), route, fclass, llm: llmLabel, outcome: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, lib: disp.targetLib })
          if (route !== 'discard') await dep.cand.cand.ensureFlowCandidate(sid, intent)
          // v18 核心：段成功立即推水位到该段 endSeq（断点续传——失败/截断不再丢尾；整窗处理完自然到达 maxSeq）
          dep.wm.wm.writeWatermark(sid, chunk.endSeq, agent)
          // G-4a：本段已消化 ⇒ 清掉它的失败记账与「扣住」计数（否则 hasPendingUndigested 永久为真 ⇒ 跳过分支被无谓扣住）
          dep.wm.st.dispatchFailStreak.delete(`${sid}#${chunk.endSeq}`)
          dep.wm.st.skipHoldStreak.delete(sid)
          dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 段${k + 1}/${segLimit} completed，水位推进 ${wmNow}→${chunk.endSeq}${chunk.endSeq < maxSeq ? `（整窗尚余 ${chunks.length - k - 1} 段，下轮续传）` : '（整窗蒸馏完成，水位=maxSeq）'}`)
          wmNow = chunk.endSeq
          // 段间紧凑清单续上下文：本段裁决一行（供同轮后段查重/合并，勿重复入册；超 MANIFEST_CAP 丢最早行）
          manifest = manifestPush(manifest, manifestLineFor(chunk.endSeq, route, out), MANIFEST_CAP)
          segOk = true
        } else if (stop === 'completed' && out && disp.failed > 0) {
          // A1（2026-09-11 审查修复）：stop/JSON 都 OK 但**条目级落盘失败** → 本段不算消化，水位不前移。
          // 防死循环：同一段连续失败满 MAX_DISPATCH_RETRY 次 → 强制推进并落审计（丢失显式记账）。
          const streakKey = `${sid}#${chunk.endSeq}`
          const tries = (dep.wm.st.dispatchFailStreak.get(streakKey) || 0) + 1
          if (tries >= dep.write.write.MAX_DISPATCH_RETRY) {
            dep.wm.st.dispatchFailStreak.delete(streakKey)
            dep.wm.st.skipHoldStreak.delete(sid) // 本段已放弃 ⇒ 不再因它扣住跳过分支
            dep.wm.wm.writeWatermark(sid, chunk.endSeq, agent)
            wmNow = chunk.endSeq
            manifest = manifestPush(manifest, manifestLineFor(chunk.endSeq, route, out), MANIFEST_CAP)
            segOk = true
            dep.io.infra.audit({ sid, kind: 'distill-run', route, stop, fclass: 'dispatch-failed-forced', llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length, tries })
            dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 段${k + 1}/${segLimit} 落盘失败 ${disp.failed} 条、已连续 ${tries} 轮——强制推进水位 → ${chunk.endSeq}（丢失已审计 dispatch-failed-forced）`)
          } else {
            dep.wm.st.dispatchFailStreak.set(streakKey, tries)
            dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 段${k + 1}/${segLimit} 落盘失败 ${disp.failed} 条（第 ${tries}/${dep.write.write.MAX_DISPATCH_RETRY} 次）——水位保留 ${wmNow}，下轮从本段（seq ${chunk.startSeq}）续传`)
          }
        } else {
          // 水位保留：stop≠completed（error/timeout/aborted）或 stop=completed 但 out=null（JSON 解析失败，
          // 2026-09-09 实锤「Unexpected end of JSON input」）都不算消化——本段不推进，下轮从本段续传
          dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 段${k + 1}/${segLimit} stop=${stop} out=${out ? 'ok' : 'null'}，本段失败——水位保留 ${wmNow}，下轮从本段（seq ${chunk.startSeq}）续传`)
        }
      } catch (e) {
        if (abortTimer) { clearTimeout(abortTimer); abortTimer = null }
        if (raceTimer) { clearTimeout(raceTimer); raceTimer = null }
        const msg = String((e as Error)?.message || e)
        if (msg.includes('inactive context')) {
          // 旧 fiber 遗留定时器在 ctx 失效后触发（重载场景）：静默跳过、水位保留，由新实例积压扫尾补蒸馏（2026-09-10 修复）
          dep.io.infra.log(`distill: ${dep.io.infra.sidShort(sid)} 段${k + 1} 旧 ctx 已失效（inactive context），跳过本轮（水位保留 ${wmNow}，待扫尾）`)
        } else {
          if (useProvider) dep.llm.llmState.providerFailCount++
          dep.io.infra.log(`distill ERROR ${dep.io.infra.sidShort(sid)} 段${k + 1}: ${msg.slice(0, 200)}`)
        }
      }
      if (!segOk) break // v18：段失败即停——已成功段已推水位，本段未推 → 下轮从本段断点续传（前段不重蒸）
    }
    // pending 候选 .processed 移动（现语义：有段 added>0 且本轮携带候选）——循环后统一一次，
    // 避免多段重复移同名（rename 幂等已有，统一处理更干净）
    if (anyAdded && candIncluded.length) {
      const procDir = join(dep.io.pendDir, '.processed')
      try { mkdirSync(procDir, { recursive: true }); for (const f of candIncluded) { try { renameSync(join(dep.io.pendDir, f), join(procDir, f)) } catch { /* */ } } } catch { /* */ }
    }
  } catch (e) {
    dep.io.infra.log(`distill agent err ${dep.io.infra.sidShort(sid)}: ${String((e as Error)?.message || e).slice(0, 120)}`)
  } finally { dep.wm.st.distilling.delete(sid); if (claimed) dep.write.write.releaseClaim(sid) }
}




const armIdleTimer = (dep: AgentDeps, agent: any): void => {
  dep.parent.parent.rememberAgent(agent) // 深睡 parent 兜底缓存
  const sid = agent.id as string
  const old = dep.wm.st.idleTimers.get(sid)
  if (old) clearTimeout(old)
  const t = setTimeout(() => {
    dep.wm.st.idleTimers.delete(sid)
    distillAgent(dep, agent).catch((e) => dep.io.infra.log(`distill agent err ${dep.io.infra.sidShort(sid)}: ${String((e as Error)?.message || e).slice(0, 120)}`))
  }, dep.env.config.idleWakeMs)
  dep.wm.st.idleTimers.set(sid, t)
}





// 子代理输出 → JSON（剥离代码栅栏 + 容错提取首个 {...}；蒸馏/深度睡眠共用）
const parseAgentJson = (dep: AgentDeps, result: any, label: string): any => {
  if (!result || !Array.isArray(result.output)) return null
  const joined = result.output.filter((b: any) => b && b.type === 'text').map((b: any) => b.text).join('').trim()
  const cleaned = joined.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try { return JSON.parse(cleaned) } catch (e1) {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) } catch (e2) { dep.io.infra.log(`${label} JSON 解析失败: ${String((e2 as Error).message).slice(0, 80)}`) } }
    else dep.io.infra.log(`${label} JSON 解析失败: ${String((e1 as Error).message).slice(0, 80)}`)
    return null
  }
}





// ── 手动蒸馏触发（2026-09-10：pending 回流闭环——参数调节「立即处理 pending」调此）──
const runDistillNow = async (dep: AgentDeps, ): Promise<{ ok: boolean; sessions: number; note?: string }> => {
  try {
    // 先回流 pending defer 卡（workspace 恢复后直写 devref，不等 LLM 重裁决）
    const fl = await dep.write.write.flushDeferCards()
    const roots = (dep.env.ctx.agents && typeof dep.env.ctx.agents.roots === 'function') ? dep.env.ctx.agents.roots() : []
    let n = 0
    for (const a of roots) {
      try {
        if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function') continue
        const origin = a.session && a.session.header && a.session.header.origin
        if (origin === 'subagent') continue
        if (dep.wm.st.distilling.has(a.id)) continue
        await distillAgent(dep, a).catch(() => { /* 单会话失败不阻断 */ })
        n++
      } catch { /* 单会话跳过 */ }
    }
    const flNote = fl.written ? `（defer 回流 ${fl.written} 张卡${fl.kept ? `，保留 ${fl.kept}` : ''}）` : (fl.kept ? `（defer 待认领 ${fl.kept}：workspace 仍不可解）` : '')
    return { ok: true, sessions: n, note: `蒸馏 ${n} 个根会话${flNote}` }
  } catch (e) {
    return { ok: false, sessions: 0, note: String((e as Error)?.message || e).slice(0, 120) }
  }
}
