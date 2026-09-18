// deepsleep-run.ts — 深睡主流程**编排器**（依赖 8 个领域分组）
//
// ⚠ 它仍是编排器：协调 8 个领域分组，故内部会展开依赖名。与上一版的区别是「从哪来」变了 ——
//   旧版从 32 字段 DsScope 一把解构；现在从 8 个**领域分组**取，依赖来源可读、可按组替换，
//   且子领域各自只拿到 3–7 个（trace 3 / tree 3 / apply 7 / materials 0）。
//   已先行抽出「材料采集」相（deepsleep-materials.ts，零依赖）；
//   剩下的「调用 / 落地 / 收尾」三相拆分排在阶段 D（需重排 error 处理与 timeout 作用域）。

// 阶段 4（2026-09-14）：主动遗忘已自 treeops 拆出（领域边界 = 结构操作 vs 主动遗忘）

/** 编排器的全部依赖：深睡注入契约的八个领域分组（每组内部 ≤8 字段）。 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { resolveTarget, knowledgeRoot, dshHome } from './targets.js'
import { applyTreeOps } from './treeops.js'
import { applyForgetOps } from './forgetops.js'
import { activityAggregate } from './activity.js'
import { TRIGGER, SURFACE } from './criteria.generated.js'
import { demoteVerdict, promoteVerdict } from './criteria.js'
import { DEEP_SLEEP_PROMPT, deepSleepLanded, liveFailPolicy, planDeepSleepVerdict, DeepSleepOtherChannels, splitByCap, windowMaterialBytes } from './deepsleep-core.js'
import { gatherDeepSleepTraces, type TraceDeps } from './deepsleep-traces.js'
import { consolidateTree, type TreeDeps } from './deepsleep-tree.js'
import { applyPrinciples, applyPointerOps, applyNarratives, type ApplyDeps } from './deepsleep-apply.js'
import { commitRingChannels } from './ring-commit.js'
import { gatherMaterials } from './deepsleep-materials.js'
import { carrierFiles, mirrorAll } from './record-shadow.js'
import { renderAssocBlock, supplyAssociations } from './association-supply.js'
import { applySessionProposals } from './proposal-apply.js'
import { DeepSleepCtx, SleepState } from './deepsleep-contract.js'
import { applyConvergeOps } from './sectionops.js'
import { convergeCandidates } from './converge-candidates.js'
import { planRelease, buildSemanticReviewRequest, buildSemanticReviewBatches, parseSemanticReview, intersectApprovals, semanticApprovedRows, stableSetHashes, releaseOpsFromPlan, applyRelease, RELEASE_MAX_PER_RUN } from './essence-release.js'
import { buildAttributionRequest, parseAttribution, calibrationVerdictOf, samplesFromMclRows } from './recall-diagnosis.js'
import { buildYieldRequest, parseYieldJudgements, switchFromJudgements, shouldSwitchSource } from './recall-yield.js'

export type RunDeps = DeepSleepCtx & { state: SleepState }

// S-P4（2026-09-16）**跨粒度收敛**（R2-A）：与 forgetOps 语义不同（那条守"整节归档"，且**硬保护画像文件**），
//   本通道动的是画像文件里的**无标签叙事行** ⇒ 独立成件、独立护栏（成对取证 + 配额 + 归档可回滚）。
// S-P4c′（2026-09-16）**候选生成（向量层）**：分工纠正的一半 —— 「候选生成交向量，模糊判断交模型」。
// S-P5c（2026-09-16）**精要层释放**：本件只产**计划**（纯读扫描，不写任何文件）——
//   不可逆的执行须先具备三件保护（语义复核 / 归档可回滚 / 未自足零释放），见 `essence-release.ts` 抬头。
// J3/U1（2026-09-16）**归因调用点**：归因与方向交 LLM，并与**注册表细校准结论**对账（判据 = 一致率）。
// J5/U3（2026-09-16）收益判定：由**取证信号**（注入后工具名序列）判 helped，并与计数法对账

/** 子代理输出文本 —— **与 `distill-agent#parseAgentJson` 同口径**：取 `result.output` 里 `type==='text'` 的块拼接。
 *  ⚠ 2026-09-16 实测教训：我先前自己猜 `res.text || res.content` ⇒ **两次调用都取到 0 字符**、
 *    误记成"无法解析（输出 0 字符）"，看着像**模型没输出**，其实**是我没取对字段**。
 *    ⇒ 凡取子代理输出，**一律走本函数**（单一实现；仓内教训：同一语义两处实现必然漂移）。 */
const agentTextOf = (r: any) => (!r || !Array.isArray(r.output)) ? '' : r.output.filter((b: any) => b && b.type === 'text').map((b: any) => b.text).join('').trim()

/* J3/U1（2026-09-16）**归因调用点（真实 LLM 调用）** —— 方案册 §3.1 的判据是「归因与细校准的一致率」，
 *   而一致率**必须有 LLM 产出才算得出**。取最近 `mcl-step` 审计行作样本 → 构造请求（**含注册表细校准结论**，
 *   要求对账）→ 交子代理判 → 严格解析 → 与注册表结论比。
 *   ⚠ 样本不足（< 30）⇒ **不调用**（省一次子代理）并记 `insufficient`；调用/解析失败 ⇒ 记 `null`
 *     （**不兜底成 maintain** —— 那会把失败伪装成一致）。
 *   ⚠ 抽到模块级是**棘轮要求**：`runDeepSleep` 一度被顶到 431 行（> 400 即计入"债务"，基线 0）。
 *     遵 [原则] 装配超限先抽模块函数 · 逼近上限勿内联，抽模块级后等价可断言。 */
async function attributeRecallMisses(ctx: any, parent: any, agentOptions: any): Promise<any> {
    const calib = { id: 'mcl.familiarThreshold', value: Number(SURFACE?.mcl?.familiarThreshold ?? 0.55), conclusion: String(SURFACE?.mcl?.note || '') }
    const calibVerdict = calibrationVerdictOf(calib.conclusion)
    const missRows = []
    try {
        const rows = readFileSync(join(knowledgeRoot(), 'audit', 'ledger.jsonl'), 'utf8').split(/\r?\n/)
        for (let i = rows.length - 1; i >= 0 && missRows.length < 60; i--) {
            const t = rows[i].trim()
            if (!t)
                continue
            try {
                const o = JSON.parse(t)
                if (o?.kind === 'mcl-step')
                    missRows.push(o)
            }
            catch { /* 坏行跳过 */ }
        }
    }
    catch { /* 台账不可读 ⇒ 样本 0 */ }
    const samples = samplesFromMclRows(missRows, 20)
    /* ⚠ 门槛用 **samples.length**（= **未命中**样本数），不是 `missRows.length`（全体 mcl-step 行）——
     *   首版用错：真机实测 missRows 够多而真正的未命中样本只有 7 条，于是**带着 7 条样本去调用**，
     *   白烧一次子代理且结论不可信。**门槛必须卡在"能支撑判断的样本"上**。 */
    if (samples.length < 30)
        return { verdict: 'insufficient', agrees: null, samples: samples.length, calibration: calibVerdict, note: `未命中样本 ${samples.length} < 30` }
    const req = buildAttributionRequest({ 'recall-empty': missRows.filter((r) => r.missReason === 'recall-empty').length, 'no-highconf': missRows.filter((r) => r.missReason === 'no-highconf').length, 'below-threshold': missRows.filter((r) => r.missReason === 'below-threshold').length, 'embed-off': missRows.filter((r) => r.missReason === 'embed-off').length, ok: 0 }, samples, calib)
    try {
        const a = new AbortController()
        const run3 = await ctx.subagents.start('spawn', {
            label: 'mcl-attribution', parent: parent, signal: a.signal, maxDepth: 1,
            ...(agentOptions ? { agentOptions } : {}),
            prompt: [{ type: 'text', text: req }], persona: '你是召回质量归因器。只输出一行 JSON。', toolFilter: { allow: [] },
        })
        const res3 = await Promise.race([run3.result, new Promise((r) => setTimeout(() => r({ stopReason: 'timeout' }), 120000))])
        const raw = agentTextOf(res3)
        const parsed = parseAttribution(raw)
        // ⚠ **失败原因必须可见**（仓内最忌"静默失效"）：`null` 只说明"未判"，说不出为什么。
        if (!parsed)
            return { verdict: null, agrees: null, samples: samples.length, calibration: calibVerdict, note: `无法解析（stop=${String(res3?.stopReason || '?')} · 输出 ${raw.length} 字符）` }
        return { verdict: parsed.verdict, agrees: parsed.verdict === calibVerdict, samples: samples.length, calibration: calibVerdict, note: parsed.reason.slice(0, 60) }
    }
    catch (e) {
        return { verdict: null, agrees: null, samples: samples.length, calibration: calibVerdict, note: '调用异常：' + String((e as Error)?.message || e).slice(0, 60) }
    }
}

/* J5/U3（2026-09-16）**收益判定调用点**：读 `yield-rounds.jsonl`（注入时刻 × 注入后工具名序列）
 *   → 构造请求（**明确告知旧信号恒 false、要看动作**）→ 子代理判 → 严格解析 → 出语义换向判定，
 *   并与**计数法**对账（`误判率 = 判 helped=true 的比例` —— 那些正是计数法会误当"没帮上"的轮次）。
 *   ⚠ 抽到模块级是**棘轮要求**（`runDeepSleep` 已 397 行 / 上限 400）。
 *   ⚠ 样本不足或解析失败 ⇒ 如实记 `insufficient`/`null` + `note`（**不兜底**）。 */
async function judgeYieldRounds(ctx: any, parent: any, agentOptions: any, bankRoot: string): Promise<any> {
    const blank = { judged: 0, helpedTrue: 0, switchSemantic: false, switchCounter: false }
    let rows = []
    try {
        const raw = readFileSync(join(bankRoot, 'audit', 'yield-rounds.jsonl'), 'utf8').split(/\r?\n/)
        // ⚠ **必须读全量再筛**：先前先截断"最后 20 条"再排序 ⇒ **排序改变不了集合**（那 20 条恰好全零动作）
        //   ⇒ 实测两次都是 `注入后有动作 0/20`。**筛在前、截在后**是这里的关键。
        for (const l of raw) {
            const t = l.trim()
            if (!t)
                continue
            try {
                rows.push(JSON.parse(t))
            }
            catch { /* 坏行跳过 */ }
        }
    }
    catch {
        return { ...blank, note: 'yield-rounds.jsonl 不可读（未跑过采集器）' }
    }
    if (rows.length < 5)
        return { ...blank, note: `取证行 ${rows.length} < 5` }
    /* ⚠ 2026-09-16 实测教训（第二轮）：先前取"**最近 20 条**"⇒ 那批**注入后都没有动作**（`idleSteps:0`）
     *   ⇒ 模型只能全判 `null`（判不准）。**信息量取决于取样**：注入后有动作的行才谈得上"帮没帮上"
     *   （实测有动作者占 **13.2%** 且集中在较早会话）。
     *   ⇒ **确定性先筛**（有动作者优先），再交 LLM 判 —— 这正是"候选由确定性产出、判定交模型"的分工。 */
    rows = rows.sort((a: any, b: any) => (Number(b.idleSteps) || 0) - (Number(a.idleSteps) || 0)).slice(0, 10).reverse()
    const rounds = rows.map((r, i) => ({ i, injectedChars: Number(r.materialChars) || 0, cited: false, nextTools: (Array.isArray(r.nextTools) ? r.nextTools : []).map(String) }))
    const anyActed = rounds.filter((r) => r.nextTools.length > 0).length
    try {
        const ac = new AbortController()
        const run4 = await ctx.subagents.start('spawn', {
            label: 'yield-judge', parent, signal: ac.signal, maxDepth: 1,
            ...(agentOptions ? { agentOptions } : {}),
            prompt: [{ type: 'text', text: buildYieldRequest(rounds) }], persona: '你是检索收益判定器。只输出一行 JSON 数组。', toolFilter: { allow: [] },
        })
        const res4 = await Promise.race([run4.result, new Promise((r) => setTimeout(() => r({ stopReason: 'timeout' }), 180000))])
        const raw4 = agentTextOf(res4)
        const judged = parseYieldJudgements(raw4)
        if (!judged)
            return { ...blank, note: `无法解析（stop=${String(res4?.stopReason || '?')} · 输出 ${raw4.length} 字符）` }
        const helpedTrue = judged.filter((j) => j.helped === true).length
        const unjudged = judged.filter((j) => j.helped === null).length
        return {
            judged: judged.length, helpedTrue,
            switchSemantic: switchFromJudgements(judged),
            // 计数法对同一批轮次的判定：旧信号恒 false ⇒ 它恒判"该换向"（这正是误判来源）
            switchCounter: shouldSwitchSource(rounds.length),
            note: `判 ${judged.length}（帮上 ${helpedTrue} · 未判 ${unjudged} · 注入后有动作 ${anyActed}/${rounds.length}）`,
        }
    }
    catch (e) {
        return { ...blank, note: '调用异常：' + String((e as Error)?.message || e).slice(0, 60) }
    }
}

/* P5c 语义门（2026-09-16）：**字面自足 ≠ 语义自足** —— 对释放候选（判据行）问
 *   "丢掉正文后还能不能据以复现做法"，与字面判据**对账**；**不一致以更严者为准**（未判 ⇒ 不通过）。
 *   ⚠ 无候选 ⇒ **直接返回、不调 LLM**（释放默认关闭，不该每轮白烧一次子代理）。 */
async function reviewReleaseSemantics(ctx: any, parent: any, agentOptions: any, bankRoot: string): Promise<any> {
    const plan = planRelease(bankRoot)
    if (!plan.candidates.length)
        return { candidates: 0, approved: 0, rejected: 0, unjudged: 0, note: '无候选 ⇒ 不调用（释放默认关闭）' }
    try {
        const ac = new AbortController()
        const run5 = await ctx.subagents.start('spawn', {
            label: 'essence-release-review', parent, signal: ac.signal, maxDepth: 1,
            ...(agentOptions ? { agentOptions } : {}),
            prompt: [{ type: 'text', text: buildSemanticReviewRequest(plan) }], persona: '你是"丢掉正文还能不能用"的复核器。只输出一行 JSON 数组。', toolFilter: { allow: [] },
        })
        const res5 = await Promise.race([run5.result, new Promise((r) => setTimeout(() => r({ stopReason: 'timeout' }), 180000))])
        const raw5 = agentTextOf(res5)
        const parsed = parseSemanticReview(raw5)
        if (!parsed)
            return { candidates: plan.candidates.length, approved: 0, rejected: 0, unjudged: 0, note: `无法解析（stop=${String(res5?.stopReason || '?')} · 输出 ${raw5.length} 字符）` }
        const m = semanticApprovedRows(plan, parsed)
        return { candidates: plan.candidates.length, approved: m.approved.length, rejected: m.rejected, unjudged: m.unjudged, note: `候选 ${plan.candidates.length} ⇒ 语义通过 ${m.approved.length} · 否 ${m.rejected} · 未判 ${m.unjudged}（**未判按不通过**）` }
    }
    catch (e) {
        return { candidates: plan.candidates.length, approved: 0, rejected: 0, unjudged: 0, note: '调用异常：' + String((e as Error)?.message || e).slice(0, 60) }
    }
}

/* P5c 语义门 · **分批版**（2026-09-16）：实测 49 条一次问 ⇒ **59% 判不准**（每条分到的注意力太少）。
 *   ⇒ 按 10 条一批、**并发**问，再合并 —— 每批的 `i` 是全局下标，故合并后仍可对齐（`semanticApprovedRows` 直接吃）。
 *   ⚠ 为什么另起一个函数而不改上面那个：**保留单批路径**以便对照（"分批是否真的降低未判率"须可比较）。 */
async function reviewReleaseSemanticsBatched(ctx: any, parent: any, agentOptions: any, bankRoot: string): Promise<any> {
    const plan = planRelease(bankRoot)
    /* 册二「release 接线两前置」之②（2026-09-19）：**返回值补 `approvedRows`（全量行文本）+ 同一份 plan 的 ops**
     *   —— 原先只回 `sample`（前 5 条截断）+ `hashes`，调用方拿不到可执行清单 ⇒ 出口接不上
     *   （`applyRelease` 的 `semanticApproved` 参数只能空传 = 恒定零释放）。
     *  ⚠ **不重跑 `planRelease`**：ops 与语义门必须来自**同一次快照**，否则"批准的行"与"要释放的 op"
     *     可能指向不同的库状态（`applyRelease` 内部仍会**再复核一次当下状态**，那是第二道门，不冲突）。 */
    const opsPack = releaseOpsFromPlan(plan)
    const base = { candidates: plan.candidates.length, approved: 0, rejected: 0, unjudged: 0, batches: 0, sample: [], approvedRows: [], ops: [], opsSkipped: opsPack.skipped, executable: false }
    if (!plan.candidates.length)
        return { ...base, note: '无候选 ⇒ 不调用（释放默认关闭）' }
    const reqs = buildSemanticReviewBatches(plan, 10)
    try {
        /* 2026-09-16 **降波动：跑两组独立判定，取通过集交集**（两次都判 true 才通过）。
         *   依据：当代 6 纪元分解显示波动**加权 93% 来自模型判定**；文献（arXiv:2510.27106）已证伪
         *   "调温度"（降低与人类一致性）与"多跑取多数"（对自可靠性无显著改善）
         *   ⇒ 唯一方向安全的剩余手段 = **取交集**（**单调更保守**：少释放、不误释放）。
         *   两组**并发**（不增总时长）；代价是通过率下降（效率换稳定）。 */
        const runBatches = async (batchReqs: string[], tag: string) => await Promise.all(batchReqs.map(async (text: string, k: number) => {
            const ac = new AbortController()
            const run = await ctx.subagents.start('spawn', {
                label: `essence-review-${tag}-${k}`, parent, signal: ac.signal, maxDepth: 1,
                ...(agentOptions ? { agentOptions } : {}),
                prompt: [{ type: 'text', text }], persona: '你是"丢掉正文还能不能用"的复核器。只输出一行 JSON 数组。', toolFilter: { allow: [] },
            })
            const res = await Promise.race([run.result, new Promise((r) => setTimeout(() => r({ stopReason: 'timeout' }), 180000))])
            const raw = agentTextOf(res)
            return { parsed: parseSemanticReview(raw), stop: String(res?.stopReason || '?'), len: raw.length }
        }))
        const [results, results2] = await Promise.all([runBatches(reqs, 'a'), runBatches(reqs, 'b')])
        const all = results.flatMap((r) => r.parsed || [])
        if (!all.length)
            return { ...base, batches: reqs.length, note: `全部批次无法解析（stop=${results.map((r) => r.stop).join(',')} · 输出 ${results.map((r) => r.len).join('/')} 字符）` }
        const m = semanticApprovedRows(plan, all)
        const all2 = results2.flatMap((r) => r.parsed || [])
        const m2 = all2.length ? semanticApprovedRows(plan, all2) : null
        /* ⚠ 第二组缺席 ⇒ **保守取空**（不假装"一组就够"） */
        const stable = m2 ? intersectApprovals(m.approved, m2.approved) : []
        /* 2026-09-16 **集合指纹**（判据用，零隐私暴露）：短哈希记进审计 ⇒ 可算相邻纪元的 **Jaccard**，
         *   直接测「两轮释放集合有多像」—— 比"通过率极差"本质（后者被未判率污染，属代理指标）。 */
        const hashes = stableSetHashes(stable)
        const sample = stable.slice(0, 5).map((r) => r.slice(0, 80))
        /* ⚠ 2026-09-16 **反制判据**：通过率**异常高**本身是可疑信号，不是好消息。
         *   实测：单批 49 条时 `通过 19 / 未判 29`（38.8%）；分批+少样本后 `通过 51 / 未判 0`（**100%**）
         *   ⇒ 抬高到 100% **更可能是判据被带偏（过松）**，而不是"判准了"。
         *   ⇒ 把它记为**警报**（`over-permissive`），并**明确不建议**据此接线自动执行。 */
        const rate = m.approved.length / Math.max(1, plan.candidates.length)
        const alarm = m.approved.length >= 10 && rate >= 0.95 ? ` ⚠ **over-permissive**：通过率 ${Math.round(rate * 100)}% 异常高 ⇒ 判据疑过松（**未判/否 全为 0 是可疑信号，不是好消息**），**不得据此接线自动执行**` : ''
        /* 可执行性（**fail-closed 单一判据**，调用方不得自行推断）：
         *   · 交集为空 ⇒ 不执行（没有"批准的行"）；
         *   · `over-permissive` 警报 ⇒ **不执行**（判据疑过松时自动执行 = 误释放，正是警报要拦的那类）。 */
        const executable = !alarm && stable.length > 0
        return { candidates: plan.candidates.length, approved: stable.length, rejected: m.rejected, unjudged: m.unjudged, ungrounded: m.ungrounded, batches: reqs.length * 2, sample, hashes, approvedRows: stable, ops: opsPack.ops, opsSkipped: opsPack.skipped, executable, note: `${reqs.length}×2 批（并发）⇒ 候选 ${plan.candidates.length} · 单组通过 ${m.approved.length}${m2 ? ` / ${m2.approved.length}` : '（第二组缺席）'} · **交集通过 ${stable.length}** · 否 ${m.rejected} · 未判 ${m.unjudged}（引文接地失败 ${m.ungrounded}）${alarm}` }
    }
    catch (e) {
        return { ...base, batches: reqs.length, note: '调用异常：' + String((e as Error)?.message || e).slice(0, 60) }
    }
}

/* 路线② **晨起摘要 delta**（逐字搬迁 · 2026-09-19 · 册二「release 接线两前置」之① **净减**）。
 *  语义（原注释保留）：delta = 「最近变化的新闻」（深睡消化后的行级 diff：新增/替换 [原则]/[路径]/画像行 ≤3）
 *  → `suite/knowledge/delta.md`；AGENT.md/USER.md 是**档案全本**，delta **永非事实源**，过期即弃（下轮深睡覆盖）。
 *  ⚠ 册四后它的**角色变了**：注入侧主源已改「睡眠汇报派生」，delta 降为**兜底源**（`panel-shared#readDawnGrowth`）
 *    ——故本写入侧**必须继续跑**（停写 = 把兜底抽掉；文件退役是 §5-U2 用户待拍板项）。
 *  为什么抽出来：`runDeepSleep` 实测 **399/400**（`audit-fnspan` DEBT_BASE=0），而本册要给它**加**接线 ⇒
 *   先净减、再加线（这是会审写死的次序）。搬迁为**逐字**（自由变量经参数传入）⇒ 行为零变化。 */
function writeDawnDelta(env: { kRoot: string; root: string; M: any; log: (s: string) => void }): void {
    const { kRoot, root, M, log } = env
    try {
        const afterAgent = (() => { try {
            return readFileSync(join(root, 'AGENT.md'), 'utf8')
        }
        catch {
            return ''
        } })()
        const rows: any[] = []
        const pushDiff = (beforeText: any, afterText: any) => {
            const pre = new Set((beforeText || '').split(/\r?\n/).map((l: any) => l.trim()).filter(Boolean))
            for (const l of (afterText || '').split(/\r?\n/).map((x: any) => x.trim()).filter(Boolean)) {
                if (pre.has(l))
                    continue
                const tag = (l.match(/^\[([^\] ]+)\]/) || [])[1]
                if (tag === '原则' || tag === '路径' || l.startsWith('- '))
                    rows.push(l)
            }
        }
        pushDiff(M.currentPrinciples, afterAgent); // AGENT 全档 diff：覆盖 [原则]/[路径] 行与 AGENT 画像 '- ' 行
        pushDiff(M.currentProfiles, (() => { try {
            return readFileSync(join(root, 'USER.md'), 'utf8')
        }
        catch {
            return ''
        } })()); // USER 画像行（M.currentProfiles 已含 USER 原文作 before）
        if (rows.length) {
            const deltaFile = join(kRoot, 'delta.md')
            writeFileSync(deltaFile, JSON.stringify({ at: new Date().toISOString(), staleAt: new Date(Date.now() + 48 * 3600e3).toISOString(), injections: 0, rows: rows.slice(0, 3) }, null, 2), 'utf8')
            log(`deep sleep: 晨起摘要已生成（${Math.min(rows.length, 3)} 行）`)
        }
    }
    catch (e) {
        log(`deep sleep: 晨起摘要生成失败 ${String((e as Error)?.message || e).slice(0, 100)}`)
    }
}

/* 册二「打开出口」② **精要层释放的执行侧接线**（2026-09-19）—— 三重 fail-closed：
 *   ① **默认关闭**：需显式开启（持久配置 `releaseAuto:true` 或 env `SHOUCANG_RELEASE_AUTO=1`；
 *      **不设 = 零写入**）——理由是语义门自己的读数：`over-permissive` 警报明写"不得据此接线自动执行"；
 *   ② `relReview.executable` 由**语义门**给出（空交集 / over-permissive ⇒ false）——调用方**不得自行推断**；
 *   ③ `applyRelease` 内部的第二道门：逐条按**当下库状态**重新复核，且"不在批准清单 ⇒ 不释放"。
 *   归档走既有链路 `applyForgetOps`（叶子节 / cold / 非重复 stub 三守卫 + 归档可回滚 + **绝不直删**）。
 *  ⚠ 与产线停产（`s3Produce`）**无关**：那是"不新增知识"，本动作是**维护性压缩**（细节归档、方向节点保留）。
 *  ⚠ **不进 `otherChannels`（G-19 landed 判据）**：释放 op 来自**全库计划**而非本轮材料 ⇒ 计入会让
 *    "本轮材料全被拒收"的轮次被误判 landed ⇒ 水位推进 ⇒ 静默丢料（正是 G-19 修过的那类）。 */
/** 自动执行开关（二选一即可，**默认关闭**；实时读取 ⇒ 改完即生效，不必重载）：
 *   ① 持久配置 `~/.dsh/suite/scheduler.json` 的 `releaseAuto` / `proposalApply`
 *      （**面板 /deepsleep/config 同一通道** ⇒ 用户可在 UI 改；schema 亦有同名键做缺省与白名单）；
 *   ② 进程 env `SHOUCANG_RELEASE_AUTO=1` / `SHOUCANG_PROPOSAL_APPLY=1`（部署侧临时开启）。
 *  ⚠ 读不到 / 非法值一律 `false`（fail-closed：宁可零释放，也不误改用户库）。 */
function liveAutoSwitch(key: 'releaseAuto' | 'proposalApply', envName: string): boolean {
    if (process.env[envName] === '1') return true
    try {
        const s = JSON.parse(readFileSync(join(dshHome(), 'suite', 'scheduler.json'), 'utf8')) as Record<string, unknown>
        return s[key] === true
    }
    catch { return false }
}
function releaseAutoOn(): boolean { return liveAutoSwitch('releaseAuto', 'SHOUCANG_RELEASE_AUTO') }
async function runRelease(env: { root: string; relReview: any; log: (s: string) => void; audit: (o: any) => void }): Promise<any> {
    const { root, relReview, log, audit } = env
    const zero = { released: 0, skipped: 0, reasons: [] as string[], ran: false, executed: false }
    if (!relReview || !Array.isArray(relReview.ops) || !relReview.ops.length) return { ...zero, reasons: ['无释放提案（候选为空 / 字面判据未过）'] }
    if (!relReview.executable) return { ...zero, reasons: [`语义门未放行（交集 ${Number(relReview.approved) || 0} 条 · 空集或 over-permissive 警报）⇒ **零释放**`] }
    if (!releaseAutoOn()) return { ...zero, reasons: ['release 自动执行**默认关闭**（开启：scheduler.json 的 `releaseAuto:true` 或 env `SHOUCANG_RELEASE_AUTO=1`）⇒ 本轮零写入'] }
    const r = await applyRelease(root, relReview.ops, relReview.approvedRows, (ops) => applyForgetOps(root, ops as any, { audit, log }), { maxPerRun: RELEASE_MAX_PER_RUN })
    audit({ kind: 'essence-release', ops: relReview.ops.length, released: r.released, skipped: r.skipped, note: String(r.reasons.slice(-1)[0] || '').slice(0, 160) })
    log(`deep sleep: 精要层释放 → 归档 ${r.released} · 跳过 ${r.skipped}`)
    return { ...r, ran: true, executed: r.released > 0 }
}

/* S-P1c/P1c-multi 抽出（2026-09-16）：**材料段装配** → 向量候选 → 释放计划。
 *   抽出原因：函数跨度棘轮（`runDeepSleep` 承载产物版全部接线后 451 行 > 400）。
 *   等价性：整块搬迁、自由变量经参数传入；段序与内容未改（`test-epoch-chunk` 核对逐段等序）。 */
async function assembleSegs(deps: any): Promise<any> {
    const { d, M, traces, assocBlock, resolved } = deps
    const segs = [
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
        /* S-P2c（2026-09-16）**第 12 段：本纪元工具使用**（"经历 × 工具知识"里"工具"那一维的入口）。
         *   只给 工具名 + 次数（跨会话汇总、次数降序），**不含参数/路径/命令原文**。
         *   用途：① 工具维度与既有 `[路径]` 的一致/冲突可被模型看见（冲突 = 跨粒度收敛的候选来源，R2 的输入）；
         *   ② 反复高频的工具是"该沉淀成 [路径]、还是该降权"的判断素材。 ⚠ 窗口粒度=日（见 gatherMaterials 注释）。 */
        `## 本纪元工具使用（只含 工具名 × 次数；**无参数原文/无路径**；用于判断"哪些工具反复用/哪些与既有 [路径] 冲突"）\n${M.toolUsage || '（无可用的工具使用记录）'}`,
        ...(assocBlock ? [`## 向量联想候选（**仅供判断**：语义近且词面不重叠；**成立的写进 crossTopic** 并说明联系，**不成立就丢弃**——勿为凑数硬报）\n${assocBlock}`] : []),
        '请按规则处理：提炼跨任务泛化原则与双画像/知识索引更新指令，输出 JSON。',
    ]
    // ── S-P1c 分片计划（2026-09-15）→ **S-P1c-multi 多轮执行已接线（2026-09-16 二次实现）** ──────
    // 消费 `config.materialChunkChars`（缺省 null=关 ⇒ **单片**，行为与改造前逐字等价）。
    // ✅ 多轮执行**不是计划态**：本函数每次只跑一片，跑完把"下一片序号"（或 null=无后续）写进
    //   `state.epoch.pendingChunk`，由状态机（`deepsleep-machine`）循环至全片落地 —— 真机实证：
    //   同一纪元 **2 行**审计（`chunk=0/2` · `chunk=1/2`），ledger `wired:true` / `hasMore` 递减。
    //   ⚠ 判据面：`test-epoch-chunk`（27 用例）· `test-wiring-gate(-ast)`（漏网 0）。
    //   ★2026-09-18（IR1 附册 F1）：旧注释曾把多轮执行写成"计划态（下一期）"，而**实况早已接线** ⇒ 已订正。
    //   无论哪一版，都**绝不**把"计划了 3 片"当成"跑了 3 片"（那是仓内最忌的假绿）。
    /* S-P4c′（2026-09-16）**跨粒度收敛候选（宿主预筛 · 向量层）** —— 分工纠正：
     *   上一版把 `convergeOps` 写进 prompt、要模型**自己从全量材料里找**"同一知识的粗/细两版"
     *   ⇒ 真机首发 **一条未提**（`otherTried:0`）。仓内既有分工是「**候选生成交向量，模糊判断交模型**」
     *   ⇒ 此处补上前一半：向量先筛候选并**逐字**列出，模型只需对**少数候选**判"是不是同一知识"。
     *   ⚠ 与 `scripts/effective-directions.mjs#crossForm` **同一口径**（否则"度量出的空间"与"收敛的空间"不可比）；
     *     向量不可用时**不下发候选段且如实记账**（不假装已判）。 */
    const cc = await convergeCandidates(resolved.root, { embedCfg: d.housekeep.embedCfgOf() })
    const relPlan = planRelease(resolved.root)
    return { segs, cc, relPlan }
}

/* 深睡审计字段抽出（2026-09-16）：只**构造并落一行审计**，无判据、无其它副作用。
 *   抽出原因同①（函数跨度棘轮）。等价性：字段名、取值与顺序**逐字保留**（解构只为把名字带进作用域）。 */
function emitDeepSleepAudit(audit: any, x: any): any {
    const { state, since, userInput, chunkIdx, chunks, app, M, cc, relPlan, attribution, yieldRes, relReview, out, remOn, profileAdded, ptrRes, treeRes, forgetRes, otherChannels, landedNow, fp, streak, pv, materialBytes, stop } = x
    return { kind: 'deep-sleep', sleepEpoch: state.epoch.v, epochSince: since, materialBytes, materialChars: userInput.length, chunk: chunkIdx, totalChunks: chunks.length,
                // S-P1a（2026-09-15）**纪元标识**：`epoch-<起时刻 ms>`（单一实现 `deepsleep-core#epochIdOf`）。
                //   用途：① R1 有效性度量以**纪元**为样本（"这一纪元睡完，下一纪元召回命中/误注入有无改善"）；
                //   ② 面板把"本轮深睡"与审计行对上；③ P1c 分片后**片间共享同一 id**。
                //   ⚠ 时间上下界一并落库（`epochSince` = 窗口起点），否则"起止"只有一端、区间不可复算。
                stop, attempted: app.attempted, added: app.added, replaced: app.replaced, skipped: app.skipped,
                // S3-3/S3-4（2026-09-14）**候选输入量**：与下方的消费结果（forgetArchived/forgetKept/forgetSkipped…）配对，
                //   才能区分「没候选可消费」（输入 0）与「有候选但代理没消费」（输入 >0 而产出 0）—— 二者此前不可分辨。
                forgetCandidates: M.counts.forget, replayHits: M.counts.replay, hotCandidates: M.counts.hot,
                interferenceCandidates: M.counts.inter, splitCandidates: M.counts.split, toolCandidates: M.counts.tools,
                // S1R（2026-09-19 · G7）**小节寻址输入量**：材料侧剔除不再静默 ——
                //   `sectionRefDropped` = 因**小节不存在**被剔除的候选数（旧实现静默 `continue`，零痕迹）；
                //   `sectionRefAmbiguous` = 因**同名歧义**本该被旧口径误剔、现**保留**的条数（附前 8 条样例名）。
                sectionRefDropped: M.sectionRef.droppedMissing, sectionRefAmbiguous: M.sectionRef.ambiguousKept,
                sectionRefAmbiguousSample: M.sectionRef.ambiguous, sectionRefMissingSample: M.sectionRef.missing,
                convergeCandidates: cc.candidates.length, convergeCandidateNote: cc.reason,
                // S-P5c：精要层释放**计划**（候选 / 被拦 / 判定面）—— 只记数，**本通道不写任何文件**
                releaseCandidates: relPlan.candidates.length, releaseBlocked: relPlan.blocked, releaseScanned: relPlan.stat.scanned,
                // J3/U1：归因一致率（判据本体）—— `attributionVerdict` 为 null ⇒ **未判**（不兜底）
                attributionVerdict: attribution.verdict, attributionAgrees: attribution.agrees, attributionSamples: attribution.samples, attributionCalibration: attribution.calibration, attributionNote: attribution.note,
                // J5/U3：收益判定与**计数法对账**（`yieldHelpedTrue` > 0 ⇒ 计数法把"其实帮上了"的轮次误当零增益）
                yieldJudged: yieldRes.judged, yieldHelpedTrue: yieldRes.helpedTrue, yieldSwitchSemantic: yieldRes.switchSemantic, yieldSwitchCounter: yieldRes.switchCounter, yieldNote: yieldRes.note,
                // P5c 语义门：**通过数**（= 可释放面）与未判数；⚠ **仍未执行任何释放**（applyRelease 默认关闭）
                releaseSemanticCandidates: relReview.candidates, releaseSemanticApproved: relReview.approved, releaseSemanticRejected: relReview.rejected, releaseSemanticUnjudged: relReview.unjudged, releaseSemanticUngrounded: relReview.ungrounded, releaseSemanticNote: relReview.note, releaseApprovedSample: relReview.sample, releaseApprovedHashes: relReview.hashes,
                // S-P4c″（2026-09-16）**输出形状可见化**：`otherTried:0` **无法区分**「模型没提」与
                //   「提了但字段名/位置不符（解析没取到）」—— 两者后果完全不同（后者是**接线缺陷**）。
                //   ⇒ 只记 `out` 的**顶层键名**（**不含任何值/内容**，避免把模型原文写进审计），
                //     一眼即可判：出现 converge 相关键却没进 tried ⇒ 形状不符；完全没出现 ⇒ 模型未提。
                outKeys: out && typeof out === 'object' ? Object.keys(out).slice(0, 24) : [],
                // S3-5（2026-09-14）**REM 相状态显式记录**：验收 D3 要求"未开启也必须记录**缺省关**状态"，
                //   否则「没开 REM」与「开了但没产出」在审计上不可分辨（同 S3-3/S3-4 的"输入量"问题）。
                remPass: remOn, rejected: (app.rejectedLines || []).length, rejectedLines: (app.rejectedLines || []).slice(0, 5), profiles: profileAdded, pointers: ptrRes.updated, ptrSkipped: ptrRes.skipped, tree: treeRes.applied, treeSkipped: treeRes.skipped, forgetArchived: forgetRes.archived, forgetKept: forgetRes.kept, forgetSkipped: forgetRes.skipped, gate: app.gate, gateExit: app.gateExit, otherTried: otherChannels.tried, otherDone: otherChannels.done, landed: landedNow, failPolicy: fp.policy, failStreak: streak.v, released: pv.release }
}

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
    const traceDeps = { candidateDir: io.candidateDir, pendDir: io.pendDir, auditFile: io.auditFile }
    const treeDeps = { log, audit, embedCfgOf: housekeep.embedCfgOf }
    const applyDeps = { config, log, PROFILE_HEADER: cfg.PROFILE_HEADER, kRoot, runNode, capEnv, textOf: llm.textOf }
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
        }
        catch (e) {
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
        }
        catch (e) {
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
                hotHits: Number(config.activityHotHits) || 23,
            })
        }
        catch (e) {
            log(`deep sleep: activity 聚合失败（跳过，继续深睡）: ${String((e as Error)?.message || e).slice(0, 120)}`)
        }
        const traces = gatherDeepSleepTraces(traceDeps, resolved.root, since)
        // 无痕迹=无事可归纳，不调用 LLM、不留审计（防每巡检周期一条 no-traces 的膨胀与空转感）——
        // 「没有材料就不需要睡眠」：窗口直接滑到当前，未来痕迹 mtime 必然晚于水位，永不丢失。
        const minTraces = Number(TRIGGER.newTracesMin ?? 1); // B 档：读注册表（trigger.newTracesMin）
        if (!traces || traces.length < minTraces) {
            log(`deep sleep: 窗口内痕迹不足（${traces ? traces.length : 0} < ${minTraces}，起点 ${new Date(since).toLocaleString()}），窗口滑到当前，本轮不睡`)
            return 'no-traces'
        }
        log(`deep sleep: 窗口内痕迹 ${traces.length} 字符（起点 ${new Date(since).toLocaleString()}）`)
        llm.validateProvider()
        const M = gatherMaterials(resolved.root, since)
        // 认知对照 P2「REM 相」**带向量候选去判**（2026-09-13 · 项目原则：候选生成交向量，模糊判断交模型）：
        //   原先让 LLM 自己"注意到"跨主题联系（从零发现，成本高且易漏）；现在**先用向量找出"异域同构"候选**
        //   （语义近 + 跨载体 + 词面不重叠），再让 LLM 判断哪几条**真成立**。
        //   候选为空 / 向量不可用 ⇒ 照常走（只是少了这一路输入）；**绝不退回结构规则假装生成联想**。
        const remOn = !!config.enableRemPass || process.env.SHOUCANG_REM_PASS === '1'
        let assocBlock = ''
        if (remOn) {
            try {
                const sup = await supplyAssociations(resolved.root, d.housekeep.embedCfgOf(), { topN: 6 })
                if (sup.proposals.length)
                    assocBlock = renderAssocBlock(sup)
                else
                    log(`deep sleep: 联想候选为空（${sup.reason || '无'}）`)
            }
            catch (e) {
                log(`deep sleep: 联想候选失败（不影响本轮）: ${String((e as Error)?.message || e).slice(0, 100)}`)
            }
        }
        // S-P1c（2026-09-15）：材料**先装成段数组**（每段 = 一个"面"），再决定分片 ——
        //   段边界即语义边界（材料本就按面装配，见 deepsleep-core#splitByCap 的三条口径）。
        const { segs, cc, relPlan } = await assembleSegs({ d, M, traces, assocBlock, resolved })
        if (cc.candidates.length) {
            segs.push('## 跨粒度收敛候选（**宿主已用向量预筛**；请**逐条判定**是否「同一知识」——是 ⇒ 填 convergeOps，两条**逐字抄自下方**）\n'
                + cc.candidates.map((c: any, i: number) => `- 候选 ${i + 1}（相似度 ${c.sim} · file=${c.file}）\n  粗（带标签）：${c.coarse}\n  细（无标签）：${c.fine}`).join('\n'))
        }
        const chunkCap = Number(config.deepSleepMaterialChunkChars ?? config.materialChunkChars) || 0
        const chunks = splitByCap(segs, chunkCap)
        /* S-P1c-multi（2026-09-16 · 二次实现）**按片多轮** —— 续跑信号走 `state.epoch.pendingChunk`，
         *   **刻意不走返回值**：上一版用 `return hasMore ? 'more' : pv.verdict` 被 `test-wiring-gate` 判红
         *   （该门禁要求**终判整行直接返回决策表裁定**，防"在决策表外再包一层判定"）。此处终判行**原样不动**。
         * 语义：本函数**每次只跑一片**；跑完把"下一片序号"（或 null=无后续）写进 pendingChunk，由状态机循环。
         *   本片 failed ⇒ pendingChunk 置 null（停）+ 返回值 failed ⇒ 调用方**回滚水位、下轮同批重试**（全片落地才推进）。
         *   **不按片推进水位**：单一时间戳水位表达不了片级进度，片级推进会永久排除失败片的材料（G-16/G-19 修过的静默丢料）。 */
        const chunkIdx = Math.max(0, Math.min(chunks.length - 1, Number(state.epoch.pendingChunk) || 0))
        const hasMore = chunkIdx + 1 < chunks.length
        const userInput = (chunks[chunkIdx] || []).join('\n\n')
        log(`deep sleep: 材料 ${segs.length} 段 → ${chunks.length} 片（cap=${chunkCap || '关'}）· 本片 #${chunkIdx + 1}/${chunks.length}（${(chunks[chunkIdx] || []).length} 段 · ${userInput.length} 字符）`)
        if (chunks.length > 1) {
            ledger({ domain: 'consolidate', step: 'deep-sleep-plan', sleepEpoch: state.epoch.v, chunks: chunks.length, chunk: chunkIdx, cap: chunkCap, segCounts: chunks.map((c) => c.length), wired: true, hasMore, note: hasMore ? '多轮执行：本片已跑，尚有后续片' : '多轮执行：本片为末片' })
        }
        // S-P1b′/S-P1c′ 前置（2026-09-16）：把**待消化材料量**落进审计 —— 否则两个阈值
        //   （`contentMinChars` / `materialChunkChars`）永远只能看"纪元区间长度"，按材料量校准无从回溯。
        //   ⚠ 口径 = `deepsleep-core#windowMaterialBytes`（pending/+candidates/ 中 mtime > since 的 .md 字节和），
        //     与"最终喂给模型的材料字符数"**不是一个量**（后者经分段装配与各段预算裁剪）——审计里二者都记，
        //     供 `scripts/epoch-calibrate.mjs` 按正确口径取分位。
        const materialBytes = windowMaterialBytes({ pendDir: io.pendDir, candidateDir: io.candidateDir }, since)
        const resolvedLlm = resolveLlm(config.sleepProvider, config.sleepModel)
        const useProvider = !!resolvedLlm && llmState.providerFailCount < 2
        const agentOptions = useProvider ? { provider: resolvedLlm.provider, model: resolvedLlm.model } : undefined
        const ac = new AbortController()
        const timeout = setTimeout(() => { try {
            ac.abort(new Error('deep sleep timeout 10min'))
        }
        catch { /* */ } }, 600000)
        let parent = pickParent()
        // 守护 parent 默认关闭（宿主「新建空 agent 当 parent」路径未经验证，实测子代理 100ms stop=error）
        if (!parent && config.deepSleepDaemonParent) {
            const route = agentOptions ?? resolveDefaultModel()
            log(`deep sleep: 无可用 agent，尝试守护 parent（路由 ${route ? `${route.provider}/${route.model}` : '继承默认'}）`)
            parent = await ensureDaemonParent(ac.signal, route)
        }
        if (!parent) {
            log('deep sleep: 无可用 parent agent（宿主 spawn 必需），跳过本轮')
            audit({ kind: 'deep-sleep', result: 'no-parent', sleepEpoch: state.epoch.v, epochSince: since })
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
                new Promise((resolve) => setTimeout(() => resolve({ stopReason: 'timeout' }), 600000)),
            ])
            clearTimeout(timeout)
            const stop = result && result.stopReason
            if (stop !== 'completed')
                log(`deep sleep: 子代理非正常结束 stop=${stop} 详情=${JSON.stringify(result).slice(0, 400)}`)
            const out = parseAgentJson(result, 'deep sleep')
            /* 2026-09-16 **阶段可见化**：实测有"跑到写入阶段却不落 `audit.deep-sleep` 行"的情形
             *   （13:20:55 有 decision/check/write 三行、却无深睡审计行）⇒ 卡点在 write 之后、audit 之前，
             *   但**日志不可读**（无插件日志文件）⇒ 插阶段痕迹进台账，让卡点**可定位**而非靠猜。 */
            ledger({ domain: 'consolidate', step: 'deep-sleep-stage', stage: 'llm-done', sleepEpoch: state.epoch.v, chunk: chunkIdx, totalChunks: chunks.length })
            if (stop === 'completed' && out)
                llmState.providerFailCount = 0
            else if (useProvider && (stop !== 'completed' || !out))
                llmState.providerFailCount++
            // 认知对照 P2「REM 相」：crossTopic（跨主题联想）**合并进 principles 通道**——零新增落盘代码。
            //   硬门：text 的源指针须覆盖 ≥2 个**不同 § 小节**（同主题归纳已由 principles 覆盖）；
            //   开关关（config.enableRemPass / env SHOUCANG_REM_PASS=1）时整段丢弃，不污染既有通道。
            if (out && Array.isArray(out.crossTopic)) {
                const kept = []
                for (const c of out.crossTopic) {
                    if (!remOn) {
                        log('deep sleep: crossTopic 丢弃（REM 相未开启）')
                        break
                    }
                    const text = String((c && c.text) || '').trim()
                    const secs = [...text.matchAll(/§([^/→]+)/g)]
                        .map((m) => String(m[1]).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim())
                        .filter(Boolean)
                    const uniq = new Set(secs.map((s) => s.toLowerCase()))
                    if (!text || uniq.size < 2) {
                        log(`deep sleep: crossTopic 丢弃（源指针覆盖 ${uniq.size} 个主题 <2）`)
                        continue
                    }
                    kept.push({ action: String((c && c.action) || 'add'), text })
                }
                if (kept.length) {
                    if (!Array.isArray(out.principles))
                        out.principles = []
                    out.principles.push(...kept)
                    log(`deep sleep: REM 相并入 ${kept.length} 条跨主题原则`)
                }
            }
            const app = (stop === 'completed' && out)
                ? await applyPrinciples(applyDeps, resolved.root, out)
                : { attempted: 0, added: 0, replaced: 0, skipped: 0, gate: `stop=${stop}`, gateExit: -1, rejectedLines: [] }
            // 双画像巩固：profileOps（add/replace，须 notes 源指针；格式/容量/去重门禁同蒸馏）
            let profileAdded = 0
            let profileTried = 0
            if (config.s3Produce !== false && stop === 'completed' && out && Array.isArray(out.profileOps)) {
                const ops = out.profileOps.filter((o: any) => o && normalizeProfileTarget(String(o.target)) && ['add', 'replace'].includes(String(o.action)))
                for (const op of ops) {
                    const r = writeProfileLine(resolved.root, String(op.target), String(op.section || ''), String(op.text || ''), op.action === 'replace' ? String(op.match || '') : undefined)
                    if (r.st === 'added')
                        profileAdded++
                    else
                        profileTried++; // G-19：有提案但未落地（容量/去重/门禁拒收）⇒ 计入 tried
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
                : { written: 0, skipped: 0, titles: [] }
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
                : { decisions: 0, commitments: 0, relations: 0, valences: 0, outcomes: 0, episodes: 0, events: 0, ok: true, reason: undefined }
            // G-19：汇总 principles 之外**六**通道（画像/指针/树/遗忘/后果回收/叙事）的轮次结果，喂给 landed 判据。
            //   tried=有提案但未落地（含守卫跳过）；done=成功落地。
            //   ⚠ P5：新通道**必须计入**——否则重演「不进 attempted ⇒ 全数失败被误判 landed:true ⇒ 材料静默丢弃」
            //     （deepsleep-run 上方 :126/:290 已记录该教训；这是它第四次可能复发的地方，故显式纳入）。
            const outcTried = Math.max(0, (out?.outcomes || []).length - ringRes.outcomes)
            const epiTried = Math.max(0, episodeItems.length - ringRes.episodes)
            // S-P4（2026-09-16）**跨粒度收敛**：模型给出的 `convergeOps` ⇒ 宿主校验（成对取证/形态/配额）后移除细粒度行并归档。
            //   计入 G-19 的**全通道汇总**（tried/done）—— 否则"纯收敛轮且全数被拒"会被误判 done ⇒ 水位推进 ⇒ 静默丢料。
            // J3/U1：**归因调用点**（真实 LLM 调用；实现已抽到模块级以避开函数跨度棘轮）
            // 2026-09-16 细粒度二分：llm-done→pre-audit 实测可慢 20+ 分钟，该段含三路并发子代理（8 个）⇒ 前后各插痕迹
            ledger({ domain: 'consolidate', step: 'deep-sleep-stage', stage: 'apply-done', sleepEpoch: state.epoch.v, chunk: chunkIdx, totalChunks: chunks.length })
            ledger({ domain: 'consolidate', step: 'deep-sleep-stage', stage: 'aux-start', sleepEpoch: state.epoch.v, chunk: chunkIdx, totalChunks: chunks.length })
            const [attribution, yieldRes, relReview] = await Promise.all([attributeRecallMisses(ctx, parent, agentOptions), judgeYieldRounds(ctx, parent, agentOptions, resolved.root), reviewReleaseSemanticsBatched(ctx, parent, agentOptions, resolved.root)])
            ledger({ domain: 'consolidate', step: 'deep-sleep-stage', stage: 'aux-done', sleepEpoch: state.epoch.v, chunk: chunkIdx, totalChunks: chunks.length })
            const conv = await applyConvergeOps(resolved.root, (out && out.convergeOps) || [], { audit: io.audit, log })
            ledger({ domain: 'consolidate', step: 'deep-sleep-stage', stage: 'converge-done', sleepEpoch: state.epoch.v, chunk: chunkIdx, totalChunks: chunks.length })
            /* 册二「打开出口」：精要层释放（**默认关闭** · fail-closed；判据与理由见 `runRelease` 抬头）。
             *  口径（供验收取数）：`kind=essence-release` 审计行的 `released` = `applyForgetOps.archived`
             *  （**归档数**，不是 `pv.release` 那个 graded-release 布尔 —— 两者语义完全不同，勿混）。 */
            const relRes = await runRelease({ root: resolved.root, relReview, log, audit })
            /* 册二「执行 L2 提案」（G3 的执行面）：**只由 S3 消费**册一的提案流；同样**默认关闭**
             *  （持久配置 `proposalApply:true` 或 env `SHOUCANG_PROPOSAL_APPLY=1`）——执行面默认开就在生产上改写用户库。
             *  判据与不变量（逐字行级校正 / 先留档再改 / 幂等 / 逐条裁决）见 `proposal-apply.ts` 抬头。 */
            const propRes = applySessionProposals({ bankRoot: resolved.root, log, audit, enabled: liveAutoSwitch('proposalApply', 'SHOUCANG_PROPOSAL_APPLY') })
            const otherChannels = {
                tried: profileTried + ptrRes.skipped + treeRes.skipped + forgetRes.skipped + outcTried + epiTried + conv.skipped + conv.applied,
                done: profileAdded + ptrRes.updated + treeRes.applied + forgetRes.archived + ringRes.outcomes + ringRes.episodes + conv.applied,
            }
            log(`deep sleep: stop=${stop} 原则 +${app.added}/替换 ${app.replaced}/跳过 ${app.skipped}（${app.gate}）画像 +${profileAdded} 指针更新 ${ptrRes.updated}/跳过 ${ptrRes.skipped}（${ptrRes.gate}）树 ops ${treeRes.applied}/跳过 ${treeRes.skipped}/归档 ${treeRes.archived} forget 归档 ${forgetRes.archived}/保留 ${forgetRes.kept}/跳过 ${forgetRes.skipped} 释放 ${relRes.released}（${relRes.ran ? '已执行' : relRes.reasons[0]}）L2 提案 ${propRes.applied}/${propRes.applied + propRes.skipped}（${propRes.ran ? (propRes.reasons[0] || '已执行') : propRes.reasons[0]}）后果回收 ${ringRes.outcomes}/${(out?.outcomes || []).length} 叙事 ${narRes.written} 正文/${ringRes.episodes} 记录（ring ${ringRes.ok ? 'ok' : (ringRes.reason || 'fail')}）`)
            // G-19 失败策略：本轮裁定**只算一次**，审计与下方返回值共用同一结果（防两处口径漂移——
            //   此前审计记 failed、真实返回 done 的相反 bug 正是两份判据各自演进所致）。
            const landedNow = deepSleepLanded(stop, out, app, otherChannels)
            const fp = liveFailPolicy()
            const pv = planDeepSleepVerdict(landedNow, fp.policy, streak.v, fp.maxRounds)
        ledger({ domain: 'consolidate', step: 'deep-sleep-stage', stage: 'pre-audit', sleepEpoch: state.epoch.v, chunk: chunkIdx, totalChunks: chunks.length })
        audit(emitDeepSleepAudit(audit, { state, since, userInput, chunkIdx, chunks, app, M, cc, relPlan, attribution, yieldRes, relReview, out, remOn, profileAdded, ptrRes, treeRes, forgetRes, otherChannels, landedNow, fp, streak, pv, materialBytes, stop }))
        ledger({ domain: 'consolidate', step: 'deep-sleep-stage', stage: 'audit-done', sleepEpoch: state.epoch.v, chunk: chunkIdx, totalChunks: chunks.length })
            // 判据台账（巩固域）：模型判据（可选 judgement）+ 宿主侧**升格/降格裁决**（criteria.ts 单一实现）+ 六通道结果
            ledger({
                domain: 'consolidate', step: 'deep-sleep', stop,
                judgement: (out && out.judgement) || null,
                hostGates: {
                    // 升格裁决（原则：支撑条数；路径：同型次数+跨会话+只从成功）
                    promote: {
                        principles: (out?.principles || []).length ? promoteVerdict('principle', { traces: Number((out?.judgement && out.judgement.evidence) || 0) || undefined }).ok : null,
                        premiseGate: promoteVerdict('principle', { traces: 99, dependsOnPremise: !!(out?.judgement && out.judgement.dependsOnPremise), premiseWritten: !!(out?.judgement && out.judgement.premiseWritten) }),
                    },
                    // 降格/遗忘裁决逐条（三守卫 + 画像节保护 + 单轮上限）
                    demote: (out?.forgetOps || []).slice(0, 8).map((o: any) => ({ section: `${String(o?.file || '')} §${String(o?.section || '')}`, verdict: demoteVerdict({ file: String(o?.file || ''), status: String(o?.status || 'cold') }).reason })),
                },
                result: { principlesAdded: app.added, principlesReplaced: app.replaced, principlesSkipped: app.skipped, profilesAdded: profileAdded, pointersUpdated: ptrRes.updated, treeApplied: treeRes.applied, treeArchived: treeRes.archived, forgetArchived: forgetRes.archived, forgetKept: forgetRes.kept, forgetSkipped: forgetRes.skipped, outcomesCollected: ringRes.outcomes, narrativesWritten: narRes.written, episodesCreated: ringRes.episodes },
                enqueued: { principles: (out?.principles || []).length, profileOps: (out?.profileOps || []).length, pointerOps: (out?.pointerOps || []).length, treeOps: (out?.treeOps || []).length, forgetOps: (out?.forgetOps || []).length, crossTopic: (out?.crossTopic || []).length, outcomes: (out?.outcomes || []).length, narratives: (out?.narratives || []).length, skipped: (out?.skipped || []).length },
            })
            if (stop === 'completed')
                void bankSnapshot('deep-sleep'); // v2：巩固后库快照（best-effort）
            // v2.2 睡眠期自检（宿主义务：子代理只归纳，检测挂在其**完成之后**——守 [env] 子代理会话语义）
            if (config.selfCheck !== false)
                await runSelfCheck('deep-sleep')
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
                    try {
                        mirrorAll(resolved.root, new Date().toISOString(), carrierFiles(resolved.root))
                    }
                    catch { /* 镜像失败不影响主流程 */ }
                }
                // 路线② 晨起摘要 delta（**已抽为模块级 `writeDawnDelta`**：本函数 399/400，册二须先净减再加线）
                writeDawnDelta({ kRoot, root: resolved.root, M, log })
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
            //   ⇒ 水位不推进、同批材料每 idleMs（注册表 TRIGGER.idleMs = 45min）重试一次且永不放弃。是否需要「连败 N 轮后放行」
            //   的熔断，取决于产品取向（这正是 G-19 选项 A/B/C 的实质）。
            //   2026-09-11 追加：`write_gate 未就位`（applyPrinciples 早返回 :1538，attempted=0）是**基础设施失败**
            //   （门禁脚本缺席 → 根本不可能落地），不得因 attempted===0 而误判 done——显式排除，强制 failed 重试。
            //   **单一实现**：判据抽为模块级纯函数 `deepSleepLanded`（顶部导出），本处与单测共用，防漂移。
            // G-19：必须传 otherChannels —— 此前只传 app，导致审计字段用了全通道判据、
            // 而真实判定仍走旧口径，二者互相矛盾（审计记 failed、代码返回 done ⇒ 水位推进、材料静默丢弃）。
            // 连败计数：streakNow = **含本轮**的连续未消化轮数，须在归零前取值（否则放行日志恒为 1）。
            const streakNow = streak.v + 1
            if (pv.verdict === 'done')
                streak.v = 0
            else
                streak.v = streak.v + 1
            if (pv.release) {
                // 必须留痕：放行 = 这批材料不再重捞（水位推进），是**有告警的丢料**，不可静默。
                log(`deep sleep: 连续 ${streakNow} 轮未消化，按 graded 策略放行（水位推进）以避免无限重试；请检查画像/指针/树/遗忘通道是否长期失败`)
                audit({ kind: 'deep-sleep-release', streak: streakNow, maxRounds: fp.maxRounds, note: '连败达上限，放行并告警' })
            }
            // S-P1c-multi：**先把续跑信号写进 state**（本片 failed ⇒ null=停；否则写下一片序号），
            //   终判行**原样不动** —— 这是与上一版失败实现的关键差别（续跑不得走返回值）。
            state.epoch.pendingChunk = (pv.verdict === 'failed' || !hasMore) ? null : chunkIdx + 1
            return pv.verdict
        }
        catch (e) {
            clearTimeout(timeout)
            if (useProvider)
                llmState.providerFailCount++
            log(`deep sleep ERROR: ${String((e as Error)?.message || e).slice(0, 200)}`)
            audit({ kind: 'deep-sleep', sleepEpoch: state.epoch.v, epochSince: since, error: String((e as Error)?.message || e).slice(0, 160) })
            return 'failed'
        }
    }
    catch (e) {
        log(`deep sleep err: ${String((e as Error)?.message || e).slice(0, 120)}`)
        return 'failed'
    }
}
