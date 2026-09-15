// deepsleep-run.ts — 深睡主流程**编排器**（依赖 8 个领域分组）
//
// ⚠ 它仍是编排器：协调 8 个领域分组，故内部会展开依赖名。与上一版的区别是「从哪来」变了 ——
//   旧版从 32 字段 DsScope 一把解构；现在从 8 个**领域分组**取，依赖来源可读、可按组替换，
//   且子领域各自只拿到 3–7 个（trace 3 / tree 3 / apply 7 / materials 0）。
//   已先行抽出「材料采集」相（deepsleep-materials.ts，零依赖）；
//   剩下的「调用 / 落地 / 收尾」三相拆分排在阶段 D（需重排 error 处理与 timeout 作用域）。
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { resolveTarget } from './targets.js'
import { applyTreeOps } from './treeops.js'
// 阶段 4（2026-09-14）：主动遗忘已自 treeops 拆出（领域边界 = 结构操作 vs 主动遗忘）
import { applyForgetOps } from './forgetops.js'
import { activityAggregate } from './activity.js'
import { TRIGGER } from './criteria.generated.js'
import { demoteVerdict, promoteVerdict } from './criteria.js'
import { DEEP_SLEEP_PROMPT, deepSleepLanded, liveFailPolicy, planDeepSleepVerdict } from './deepsleep-core.js'
import type { DeepSleepOtherChannels } from './deepsleep-core.js'
import { gatherDeepSleepTraces, type TraceDeps } from './deepsleep-traces.js'
import { consolidateTree, type TreeDeps } from './deepsleep-tree.js'
import { applyPrinciples, applyPointerOps, applyNarratives, type ApplyDeps } from './deepsleep-apply.js'
import { commitRingChannels } from './ring-commit.js'
import { gatherMaterials } from './deepsleep-materials.js'
import { carrierFiles, mirrorAll } from './record-shadow.js'
import { renderAssocBlock, supplyAssociations } from './association-supply.js'
import type { DeepSleepCtx, SleepState } from './deepsleep-contract.js'

/** 编排器的全部依赖：深睡注入契约的八个领域分组（每组内部 ≤8 字段）。 */
export type RunDeps = DeepSleepCtx & { state: SleepState }

export async function runDeepSleep(d: RunDeps, sinceArg?: number): Promise<'done' | 'failed' | 'no-traces'> {
  const { io, cfg, llm, session: sess, write, housekeep, state, appCtx } = d
  // 领域别名：下方正文是**原样迁出**的（零逻辑改动），用别名保住裸名，避免逐处改写失真
  const ctx = appCtx
  const { log, audit, ledger, kRoot } = io
  const { config, llmState, capEnv } = cfg
  const { streak, traceSince } = state
  const { runNode, validateProvider, resolveLlm, resolveDefaultModel } = llm
  const { pickParent, ensureDaemonParent } = sess
  const { parseAgentJson, normalizeProfileTarget, writeProfileLine } = write
  const { bankSnapshot, runSelfCheck } = housekeep
  const traceDeps: TraceDeps = { candidateDir: io.candidateDir, pendDir: io.pendDir, auditFile: io.auditFile }
  const treeDeps: TreeDeps = { log, audit, embedCfgOf: housekeep.embedCfgOf }
  const applyDeps: ApplyDeps = { config, log, PROFILE_HEADER: cfg.PROFILE_HEADER, kRoot, runNode, capEnv, textOf: llm.textOf }
  try {
    const since = sinceArg ?? traceSince()
    const resolved = resolveTarget()
    if (!resolved.present) {
      log('deep sleep: 记忆库缺席（部署残缺），跳过')
      return 'failed'
    }
    // consolidation v1 并入深睡巡检（2026-09-10 用户拍板：停滞≥3h 窗口先向量去重整合再归纳）——
    // 在痕迹归纳之前先做确定性/高置信去重整合（A 索引精确重复 / B 语义近重 / C 小节内行去重 / D 叶子小节合并），
    // 收敛树状记忆「只增不修」的重复指针/重复详情；旧内容已归档可回滚；失败仅 log，绝不影响后续深睡流程。
    try {
      await consolidateTree(treeDeps, resolved.root)
    } catch (e) {
      log(`deep sleep: consolidation 失败（跳过，继续深睡）: ${String((e as Error)?.message || e).slice(0, 120)}`)
    }
    // 真实读采集（2026-09-10 ACT-023）：`access.log` 只覆盖 read_section 路径，agent 的真实读
    // （read/grep/glob/pwsh 命中记忆库）零埋点 ⇒ 活性/遗忘/回想强度三模型失真（假冷）。
    // 先由 harvest-access.mjs 从**会话转录**按「会话 seq 水位」增量采集真实读到 `access-real.jsonl`，
    // 再由 activityAggregate 合并两源（聚合是每轮按日志全量重算，故无需改判定逻辑）。
    // 失败仅 log，绝不阻断深睡（同 below 各步的收敛策略）。
    try {
      await runNode(config.nodeBin, join(resolved.root, 'scripts', 'harvest-access.mjs'), [], {
        env: { MEMORY_ROOT: resolved.root, ...capEnv() },
        timeout: 120000,
      })
    } catch (e) {
      log(`deep sleep: 真实读采集失败（跳过，按既有日志聚合）: ${String((e as Error)?.message || e).slice(0, 120)}`)
    }
    // v7 A 步：条目活性聚合（2026-09-10，方案 docs/memory-activity-model.md）——consolidation 之后、归纳之前：
    // 命中聚合 → ACT-R 式状态迁移（active/warm/cold）→ 遗忘候选清单（只建议不删除）；失败仅 log。
    // 阈值走 scheduler.json（activityWarmDays/ColdDays/ArchiveDays/HotHits，UI 可调），缺省 14/44/90/5。
    try {
      await activityAggregate(resolved.root, { audit: io.audit, log: io.log }, {
        warmDays: Number(config.activityWarmDays) || 14,
        coldDays: Number(config.activityColdDays) || 44,
        archiveDays: Number(config.activityArchiveDays) || 90,
        hotHits: Number(config.activityHotHits) || 5,
      })
    } catch (e) {
      log(`deep sleep: activity 聚合失败（跳过，继续深睡）: ${String((e as Error)?.message || e).slice(0, 120)}`)
    }
    const traces = gatherDeepSleepTraces(traceDeps, resolved.root, since)
    // 无痕迹=无事可归纳，不调用 LLM、不留审计（防每巡检周期一条 no-traces 的膨胀与空转感）——
    // 「没有材料就不需要睡眠」：窗口直接滑到当前，未来痕迹 mtime 必然晚于水位，永不丢失。
    const minTraces = Number(TRIGGER.newTracesMin ?? 1) // B 档：读注册表（trigger.newTracesMin）
    if (!traces || traces.length < minTraces) { log(`deep sleep: 窗口内痕迹不足（${traces ? traces.length : 0} < ${minTraces}，起点 ${new Date(since).toLocaleString()}），窗口滑到当前，本轮不睡`); return 'no-traces' }
    log(`deep sleep: 窗口内痕迹 ${traces.length} 字符（起点 ${new Date(since).toLocaleString()}）`)
    llm.validateProvider()
    const M = gatherMaterials(resolved.root)
    // 认知对照 P2「REM 相」**带向量候选去判**（2026-09-13 · 项目原则：候选生成交向量，模糊判断交模型）：
    //   原先让 LLM 自己"注意到"跨主题联系（从零发现，成本高且易漏）；现在**先用向量找出"异域同构"候选**
    //   （语义近 + 跨载体 + 词面不重叠），再让 LLM 判断哪几条**真成立**。
    //   候选为空 / 向量不可用 ⇒ 照常走（只是少了这一路输入）；**绝不退回结构规则假装生成联想**。
    const remOn = !!config.enableRemPass || process.env.SHOUCANG_REM_PASS === '1'
    let assocBlock = ''
    if (remOn) {
      try {
        const sup = await supplyAssociations(resolved.root, d.housekeep.embedCfgOf(), { topN: 6 })
        if (sup.proposals.length) assocBlock = renderAssocBlock(sup)
        else log(`deep sleep: 联想候选为空（${sup.reason || '无'}）`)
      } catch (e) { log(`deep sleep: 联想候选失败（不影响本轮）: ${String((e as Error)?.message || e).slice(0, 100)}`) }
    }
    const userInput = [
      '## 当天记忆痕迹（作用域=本日，不做全库扫描）',
      traces,
      M.hotCtx || '（无活性高频小节）',
      M.interCtx || '（无互抑候选）',
      `## 现行原则/路径（冲突时 replace，match 逐字取自此清单）\n${M.currentList}`,
      `## 现行画像（profileOps 的 replace match 逐字取自此处）\n${M.currentProfiles}`,
      `## 现行知识索引（MEMORY.md；pointerOps 扩容/重构的 match 逐字取自此处）\n${M.currentMemIndex}`,
      `## 现行树节清单（treeOps 的 file/oldTitle/dropTitle/keepTitle 必须逐字取自此处；每个小节一行 \`notes/文件:标题\`，含 ## 与 ### 全部）\n${M.currentTreeSections}`,
      `## 待拆候选节正文（子树正文 > R=1000 字的叶子 ##；仅当确要 split 时看此段——parts[].start 必须**逐字**取自对应节的正文行）\n${M.splitCandidates}`,
      `## 遗忘候选（cold 且 ≥90 天零命中的冷节；forgetOps 的 file/section 必须逐字取自此处——只允许 archive/keep，禁止删除）\n${M.forgetCandidates}`,
      `## 近 7 日再现（已有条目被再次命中；判「跨日二次激活」用——同一条目在多个日窗重现 = 该主题稳固，可扩容概况/提纯为更高层原则）\n${M.replayRecent}`,
      /* H-1（2026-09-15）**接线补全**：prompt 的 P5 段原本就要求「材料若给出**待回收的裁决**…就填 outcomes[]」，
       *   但**这一段材料此前从未供给** ⇒ 条件永不成立 ⇒ `outcomes` 结构性恒 0
       *   （实测：库内 49 条待回收裁决，而历史只收过 1 条 outcome）。
       *   此处把材料接上 —— **判据原文未改**，只是让它**终于有素材可用**。 */
      `## 待回收的裁决（P5 outcomes：每条含 \`decisionId\` 与**当时预测**；若你能从痕迹/运行统计里看出**实际结果**，就填 outcomes[{decisionId,observed,hit}]；**看不出就别填**，勿编造）\n${M.pendingDecisions}`,
      ...(assocBlock ? [`## 向量联想候选（**仅供判断**：语义近且词面不重叠；**成立的写进 crossTopic** 并说明联系，**不成立就丢弃**——勿为凑数硬报）\n${assocBlock}`] : []),
      '请按规则处理：提炼跨任务泛化原则与双画像/知识索引更新指令，输出 JSON。',
    ].join('\n\n')
    const resolvedLlm = resolveLlm(config.sleepProvider, config.sleepModel)
    const useProvider = !!resolvedLlm && llmState.providerFailCount < 2
    const agentOptions = useProvider ? { provider: resolvedLlm!.provider, model: resolvedLlm!.model } : undefined
    const ac = new AbortController()
    const timeout = setTimeout(() => { try { ac.abort(new Error('deep sleep timeout 10min')) } catch { /* */ } }, 600000)
    let parent = pickParent()
    // 守护 parent 默认关闭（宿主「新建空 agent 当 parent」路径未经验证，实测子代理 100ms stop=error）
    if (!parent && config.deepSleepDaemonParent) {
      const route = agentOptions ?? resolveDefaultModel()
      log(`deep sleep: 无可用 agent，尝试守护 parent（路由 ${route ? `${route.provider}/${route.model}` : '继承默认'}）`)
      parent = await ensureDaemonParent(ac.signal, route)
    }
    if (!parent) {
      log('deep sleep: 无可用 parent agent（宿主 spawn 必需），跳过本轮')
      audit({ kind: 'deep-sleep', result: 'no-parent' })
      return 'failed'
    }
    try {
      const run2 = await ctx.subagents.start('spawn', {
        label: 'deep-sleep-induction',
        parent,
        signal: ac.signal,
        maxDepth: 1,
        ...(agentOptions ? { agentOptions } : {}),
        prompt: [{ type: 'text', text: userInput }],
        persona: DEEP_SLEEP_PROMPT,
        toolFilter: { allow: [] },
      })
      const result = await Promise.race([
        run2.result,
        new Promise((resolve) => setTimeout(() => resolve({ stopReason: 'timeout' } as any), 600000)),
      ]) as any
      clearTimeout(timeout)
      const stop = result && result.stopReason
      if (stop !== 'completed') log(`deep sleep: 子代理非正常结束 stop=${stop} 详情=${JSON.stringify(result).slice(0, 400)}`)
      const out = parseAgentJson(result, 'deep sleep')
      if (stop === 'completed' && out) llmState.providerFailCount = 0
      else if (useProvider && (stop !== 'completed' || !out)) llmState.providerFailCount++
      // 认知对照 P2「REM 相」：crossTopic（跨主题联想）**合并进 principles 通道**——零新增落盘代码。
      //   硬门：text 的源指针须覆盖 ≥2 个**不同 § 小节**（同主题归纳已由 principles 覆盖）；
      //   开关关（config.enableRemPass / env SHOUCANG_REM_PASS=1）时整段丢弃，不污染既有通道。
      if (out && Array.isArray(out.crossTopic)) {
        const kept: Array<{ action: string; text: string }> = []
        for (const c of out.crossTopic) {
          if (!remOn) { log('deep sleep: crossTopic 丢弃（REM 相未开启）'); break }
          const text = String((c && (c as any).text) || '').trim()
          const secs = [...text.matchAll(/§([^/→]+)/g)]
            .map((m) => String(m[1]).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim())
            .filter(Boolean)
          const uniq = new Set(secs.map((s) => s.toLowerCase()))
          if (!text || uniq.size < 2) { log(`deep sleep: crossTopic 丢弃（源指针覆盖 ${uniq.size} 个主题 <2）`); continue }
          kept.push({ action: String((c && (c as any).action) || 'add'), text })
        }
        if (kept.length) {
          if (!Array.isArray(out.principles)) out.principles = []
          out.principles.push(...kept)
          log(`deep sleep: REM 相并入 ${kept.length} 条跨主题原则`)
        }
      }
      const app = (stop === 'completed' && out)
        ? await applyPrinciples(applyDeps, resolved.root, out)
        : { attempted: 0, added: 0, replaced: 0, skipped: 0, gate: `stop=${stop}`, gateExit: -1, rejectedLines: [] as string[] }
      // 双画像巩固：profileOps（add/replace，须 notes 源指针；格式/容量/去重门禁同蒸馏）
      let profileAdded = 0
      let profileTried = 0
      if (stop === 'completed' && out && Array.isArray(out.profileOps)) {
        const ops = out.profileOps.filter((o: any) => o && normalizeProfileTarget(String(o.target)) && ['add', 'replace'].includes(String(o.action)))
        for (const op of ops) {
          const r = writeProfileLine(resolved.root, String(op.target), String(op.section || ''), String(op.text || ''), op.action === 'replace' ? String(op.match || '') : undefined)
          if (r.st === 'added') profileAdded++
          else profileTried++ // G-19：有提案但未落地（容量/去重/门禁拒收）⇒ 计入 tried
        }
      }
      // v6 指针自动维护：pointerOps（update 原地替换整行，走 write_gate；扩容概况/重构指针 §）
      const ptrRes = (stop === 'completed' && out)
        ? await applyPointerOps(applyDeps, resolved.root, out)
        : { updated: 0, skipped: 0, gate: `stop=${stop}` }
      // v17.3 树自动维护：treeOps（rename/merge；模型提案 → 宿主执行守不变量——归档可回滚/锚存在/指针集内重写/无孤儿/幂等）
      const treeRes = (stop === 'completed' && out && Array.isArray(out.treeOps))
        ? await applyTreeOps(resolved.root, out.treeOps, { audit: io.audit, log: io.log })
        : { applied: 0, skipped: 0, archived: 0 }
      // 认知对照 P0「主动遗忘」：forgetOps（模型对 cold 候选取舍 → 归档移正文留 stub / keep 留理由）
      //   宿主守三条守卫（叶子节 / activity 里为 cold / 非重复 stub）+ 禁止直删，全部在 applyForgetOps 内。
      const forgetRes = (stop === 'completed' && out && Array.isArray(out.forgetOps))
        ? await applyForgetOps(resolved.root, out.forgetOps, { audit: io.audit, log: io.log })
        : { archived: 0, kept: 0, skipped: 0 }
      // P5（2026-09-14）：**叙事落地**（author 层）——正文进 `notes/agent.md §经历/<标题>`，
      //   再由下面的 ring-commit 把同一批写成 `episode` 记录（`pointer` 指回该小节，可深读）。
      const narRes = (stop === 'completed' && out && Array.isArray(out.narratives))
        ? await applyNarratives(applyDeps, resolved.root, out)
        : { written: 0, skipped: 0, titles: [] as string[] }
      // P5：**后果回收**（决策环核心）+ **episode 记录**，与蒸馏共用同一落库实现（单一实现，防两套口径漂移）。
      //   为什么这里才回收：后果要等事实发生——深睡看到的是「后来的事实」，蒸馏看到的是「当下的话」。
      const episodeItems = (stop === 'completed' && out && Array.isArray(out.narratives) ? out.narratives : [])
        .filter((n: any) => n && String(n.title || '').trim() && String(n.text || '').trim())
        .map((n: any) => ({
          title: String(n.title).trim().slice(0, 40),
          text: String(n.text).trim(),
          pointer: `notes/agent.md §经历/${String(n.title).trim().slice(0, 40)}`,
          cues: n.cues,
          evidence: n.evidence,
        }))
      const ringRes = (stop === 'completed' && out)
        ? commitRingChannels({ log: io.log, audit: (o) => ledger(o) }, resolved.root, { ...out, episodes: episodeItems }, new Date().toISOString(), 'deep-sleep')
        : { decisions: 0, commitments: 0, relations: 0, valences: 0, outcomes: 0, episodes: 0, events: 0, ok: true as boolean, reason: undefined as string | undefined }
      // G-19：汇总 principles 之外**六**通道（画像/指针/树/遗忘/后果回收/叙事）的轮次结果，喂给 landed 判据。
      //   tried=有提案但未落地（含守卫跳过）；done=成功落地。
      //   ⚠ P5：新通道**必须计入**——否则重演「不进 attempted ⇒ 全数失败被误判 landed:true ⇒ 材料静默丢弃」
      //     （deepsleep-run 上方 :126/:290 已记录该教训；这是它第四次可能复发的地方，故显式纳入）。
      const outcTried = Math.max(0, ((out?.outcomes || []) as unknown[]).length - ringRes.outcomes)
      const epiTried = Math.max(0, episodeItems.length - ringRes.episodes)
      const otherChannels: DeepSleepOtherChannels = {
        tried: profileTried + ptrRes.skipped + treeRes.skipped + forgetRes.skipped + outcTried + epiTried,
        done: profileAdded + ptrRes.updated + treeRes.applied + forgetRes.archived + ringRes.outcomes + ringRes.episodes,
      }
      log(`deep sleep: stop=${stop} 原则 +${app.added}/替换 ${app.replaced}/跳过 ${app.skipped}（${app.gate}）画像 +${profileAdded} 指针更新 ${ptrRes.updated}/跳过 ${ptrRes.skipped}（${ptrRes.gate}）树 ops ${treeRes.applied}/跳过 ${treeRes.skipped}/归档 ${treeRes.archived} forget 归档 ${forgetRes.archived}/保留 ${forgetRes.kept}/跳过 ${forgetRes.skipped} 后果回收 ${ringRes.outcomes}/${(out?.outcomes || []).length} 叙事 ${narRes.written} 正文/${ringRes.episodes} 记录（ring ${ringRes.ok ? 'ok' : (ringRes.reason || 'fail')}）`)
      // G-19 失败策略：本轮裁定**只算一次**，审计与下方返回值共用同一结果（防两处口径漂移——
      //   此前审计记 failed、真实返回 done 的相反 bug 正是两份判据各自演进所致）。
      const landedNow = deepSleepLanded(stop, out, app, otherChannels)
      const fp = liveFailPolicy()
      const pv = planDeepSleepVerdict(landedNow, fp.policy, streak.v, fp.maxRounds)
      audit({ kind: 'deep-sleep', stop, attempted: app.attempted, added: app.added, replaced: app.replaced, skipped: app.skipped,
        // S3-3/S3-4（2026-09-14）**候选输入量**：与下方的消费结果（forgetArchived/forgetKept/forgetSkipped…）配对，
        //   才能区分「没候选可消费」（输入 0）与「有候选但代理没消费」（输入 >0 而产出 0）—— 二者此前不可分辨。
        forgetCandidates: M.counts.forget, replayHits: M.counts.replay, hotCandidates: M.counts.hot,
        interferenceCandidates: M.counts.inter, splitCandidates: M.counts.split,
        // S3-5（2026-09-14）**REM 相状态显式记录**：验收 D3 要求"未开启也必须记录**缺省关**状态"，
        //   否则「没开 REM」与「开了但没产出」在审计上不可分辨（同 S3-3/S3-4 的"输入量"问题）。
        remPass: remOn, rejected: (app.rejectedLines || []).length, rejectedLines: (app.rejectedLines || []).slice(0, 5), profiles: profileAdded, pointers: ptrRes.updated, ptrSkipped: ptrRes.skipped, tree: treeRes.applied, treeSkipped: treeRes.skipped, forgetArchived: forgetRes.archived, forgetKept: forgetRes.kept, forgetSkipped: forgetRes.skipped, gate: app.gate, gateExit: app.gateExit, otherTried: otherChannels.tried, otherDone: otherChannels.done, landed: landedNow, failPolicy: fp.policy, failStreak: streak.v, released: pv.release })
      // 判据台账（巩固域）：模型判据（可选 judgement）+ 宿主侧**升格/降格裁决**（criteria.ts 单一实现）+ 六通道结果
      ledger({
        domain: 'consolidate', step: 'deep-sleep', stop,
        judgement: (out && out.judgement) || null,
        hostGates: {
          // 升格裁决（原则：支撑条数；路径：同型次数+跨会话+只从成功）
          promote: {
            principles: (out?.principles || []).length ? promoteVerdict('principle', { traces: Number((out?.judgement && (out.judgement as any).evidence) || 0) || undefined }).ok : null,
            premiseGate: promoteVerdict('principle', { traces: 99, dependsOnPremise: !!(out?.judgement && (out.judgement as any).dependsOnPremise), premiseWritten: !!(out?.judgement && (out.judgement as any).premiseWritten) }),
          },
          // 降格/遗忘裁决逐条（三守卫 + 画像节保护 + 单轮上限）
          demote: (out?.forgetOps || []).slice(0, 8).map((o: any) => ({ section: `${String(o?.file || '')} §${String(o?.section || '')}`, verdict: demoteVerdict({ file: String(o?.file || ''), status: String(o?.status || 'cold') }).reason })),
        },
        result: { principlesAdded: app.added, principlesReplaced: app.replaced, principlesSkipped: app.skipped, profilesAdded: profileAdded, pointersUpdated: ptrRes.updated, treeApplied: treeRes.applied, treeArchived: treeRes.archived, forgetArchived: forgetRes.archived, forgetKept: forgetRes.kept, forgetSkipped: forgetRes.skipped, outcomesCollected: ringRes.outcomes, narrativesWritten: narRes.written, episodesCreated: ringRes.episodes },
        enqueued: { principles: (out?.principles || []).length, profileOps: (out?.profileOps || []).length, pointerOps: (out?.pointerOps || []).length, treeOps: (out?.treeOps || []).length, forgetOps: (out?.forgetOps || []).length, crossTopic: (out?.crossTopic || []).length, outcomes: (out?.outcomes || []).length, narratives: (out?.narratives || []).length, skipped: (out?.skipped || []).length },
      })
      if (stop === 'completed') void bankSnapshot('deep-sleep') // v2：巩固后库快照（best-effort）
      // v2.2 睡眠期自检（宿主义务：子代理只归纳，检测挂在其**完成之后**——守 [env] 子代理会话语义）
      if (config.selfCheck !== false) await runSelfCheck('deep-sleep')
      // v2.1 M2：**写入回执**（write.* 事件）——写入是否落地、被拒原因与原文，与上面的 decision.* 同址同版本
      ledger({
        type: 'write.consolidate', domain: 'consolidate', step: 'deep-sleep-write', channel: 'principles',
        carrier: 'always:index', target: 'AGENT.md',
        verdict: app.gate === 'pass' ? 'written' : (app.attempted ? 'rejected' : 'skipped'),
        attempted: app.attempted, written: app.added + app.replaced, added: app.added, replaced: app.replaced,
        reason: app.gate, gateExit: app.gateExit, rejectedLines: (app.rejectedLines || []).slice(0, 5),
        perItemGate: config.perItemGate !== false,
      })
      if (stop === 'completed') {
        // P4 双写期（2026-09-13 补 · **覆盖缺口修复**）：深睡整轮写入结束后**统一镜像**。
        //   为什么在这里补：镜像钩子原先只有 `distill-write.ts` 两处调用，而深睡的载体写入分散在
        //   `deepsleep-apply`（AGENT/USER/MEMORY 直接 `writeFileSync`+`renameSync`）与 `treeops`（重命名/遗忘）——
        //   **都不调 `mirrorShadow`** ⇒ `storeMode=dual` 下那些写入**不进影子库**，下一次对账就会红，
        //   且"写入即镜像"的承诺**只对 distill 成立**。此处**单点覆盖整轮**（频率=深睡频率，代价可接受）。
        //   ⚠ 已知残余：**面板/脚本侧的载体写入**仍不经此处（见 docs 记录），由对账闸兜底发现。
        if (config.storeMode === 'dual') {
          try { mirrorAll(resolved.root, new Date().toISOString(), carrierFiles(resolved.root)) } catch { /* 镜像失败不影响主流程 */ }
        }
        // 路线② 晨起摘要 delta：深睡消化后的行级 diff（新增/替换 [原则]/[路径]/画像行 ≤3）→ suite/knowledge/delta.md
        // 语义：delta 是「最近变化的新闻」，AGENT.md/USER.md 是档案全本；delta 永非事实源，过期即弃（下轮深睡覆盖）。
        try {
          const afterAgent = (() => { try { return readFileSync(join(resolved.root, 'AGENT.md'), 'utf8') } catch { return '' } })()
          const rows: string[] = []
          const pushDiff = (beforeText: string, afterText: string): void => {
            const pre = new Set((beforeText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
            for (const l of (afterText || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
              if (pre.has(l)) continue
              const tag = (l.match(/^\[([^\] ]+)\]/) || [])[1]
              if (tag === '原则' || tag === '路径' || l.startsWith('- ')) rows.push(l)
            }
          }
          pushDiff(M.currentPrinciples, afterAgent) // AGENT 全档 diff：覆盖 [原则]/[路径] 行与 AGENT 画像 '- ' 行
          pushDiff(M.currentProfiles, (() => { try { return readFileSync(join(resolved.root, 'USER.md'), 'utf8') } catch { return '' } })()) // USER 画像行（M.currentProfiles 已含 USER 原文作 before）
          if (rows.length) {
            const deltaFile = join(kRoot, 'delta.md')
            writeFileSync(deltaFile, JSON.stringify({ at: new Date().toISOString(), staleAt: new Date(Date.now() + 48 * 3600e3).toISOString(), injections: 0, rows: rows.slice(0, 3) }, null, 2), 'utf8')
            log(`deep sleep: 晨起摘要已生成（${Math.min(rows.length, 3)} 行）`)
          }
        } catch (e) { log(`deep sleep: 晨起摘要生成失败 ${String((e as Error)?.message || e).slice(0, 100)}`) }
      }
      // 子代理异常结束（stop=error/timeout/aborted）不算消化：回滚水位，同一批痕迹下轮可重试。
      // 2026-09-09 补缺：stop=completed 但 out=null（JSON 解析失败，如「Unexpected end of JSON input」实锤 ×2）
      // 同样不算消化——否则 done 分支推进水位，整批痕迹永久划出窗口（归纳结果整轮丢失）。
      // 2026-09-11 补缺（静默丢料实锤）：**水位必须与「落地」解耦**——只按 stop=completed && out 判 done 会漏掉
      //   「代理跑完但候选被门禁全数拒收」的轮次（app.gate 为 all-rejected / maturation-rejected / 尾部总门失败，
      //   attempted>0 且 added=0）。此时判 done 会推进水位 → 被拒痕迹永久划出窗口 → 静默丢失（审计实证：
      //   08:32:23.997Z attempted=3/added=0/all-rejected 与 08:48:10.129Z attempted=1/added=0/all-rejected，
      //   两轮 stop=completed 即判 done 并滑窗，丢弃 4 条候选行）。故新增 landed 判据：
      //   landed = 任一通道有落地 → done；五通道皆无提案（真·空轮）→ done（回滚会导致同一批
      //   痕迹无限重处理，必须仍判 done）；只要有提案而**一件都没落地** → failed（水位回滚、下轮重试）。
      //   ⚠ G-19 关键修正（2026-09-12）：旧口径只看 principles 通道的 attempted，导致
      //   「纯 profileOps / 指针 / 树 / 遗忘 轮且全数失败」被误判 done ⇒ 材料静默丢弃。
      //   现把另外四通道的 tried/done 一并纳入（上面的 otherChannels）。
      //   ⚠ 遗留风险（待产品决定）：若某通道**永久**失败（如画像容量满），每轮都会判 failed
      //   ⇒ 水位不推进、同批材料每 idleMs（3h）重试一次且永不放弃。是否需要「连败 N 轮后放行」
      //   的熔断，取决于产品取向（这正是 G-19 选项 A/B/C 的实质）。
      //   2026-09-11 追加：`write_gate 未就位`（applyPrinciples 早返回 :1538，attempted=0）是**基础设施失败**
      //   （门禁脚本缺席 → 根本不可能落地），不得因 attempted===0 而误判 done——显式排除，强制 failed 重试。
      //   **单一实现**：判据抽为模块级纯函数 `deepSleepLanded`（顶部导出），本处与单测共用，防漂移。
      // G-19：必须传 otherChannels —— 此前只传 app，导致审计字段用了全通道判据、
      // 而真实判定仍走旧口径，二者互相矛盾（审计记 failed、代码返回 done ⇒ 水位推进、材料静默丢弃）。
      // 连败计数：streakNow = **含本轮**的连续未消化轮数，须在归零前取值（否则放行日志恒为 1）。
      const streakNow = streak.v + 1
      if (pv.verdict === 'done') streak.v = 0
      else streak.v = streak.v + 1
      if (pv.release) {
        // 必须留痕：放行 = 这批材料不再重捞（水位推进），是**有告警的丢料**，不可静默。
        log(`deep sleep: 连续 ${streakNow} 轮未消化，按 graded 策略放行（水位推进）以避免无限重试；请检查画像/指针/树/遗忘通道是否长期失败`)
        audit({ kind: 'deep-sleep-release', streak: streakNow, maxRounds: fp.maxRounds, note: '连败达上限，放行并告警' })
      }
      return pv.verdict
    } catch (e) {
      clearTimeout(timeout)
      if (useProvider) llmState.providerFailCount++
      log(`deep sleep ERROR: ${String((e as Error)?.message || e).slice(0, 200)}`)
      audit({ kind: 'deep-sleep', error: String((e as Error)?.message || e).slice(0, 160) })
      return 'failed'
    }
  } catch (e) {
    log(`deep sleep err: ${String((e as Error)?.message || e).slice(0, 120)}`)
    return 'failed'
  }
}
