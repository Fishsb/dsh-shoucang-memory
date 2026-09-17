#!/usr/bin/env node
// essence-review-stability.mjs — **P5c 语义判定稳定性校准器**（2026-09-16 · 报告态，不入 CHECKS）
//
// 判因（实测）：同一判据、同一候选，**轮间结果差很大** ——
//   轮 A `通过 19 · 否 28 · 未判 4`（37.3% / 8%）· 轮 B `通过 14 · 否 17 · 未判 20`（**27.5% / 39%**）。
//   ⇒ 判据**已抽样验证可信**（5/5 干净），但**可重复性不足** ⇒ 每轮释放集合不同 ⇒ **接线自动执行前必须先量化并降波动**。
//
// 本器做什么：连续触发 N 轮深睡，逐轮取 `audit.deep-sleep` 的 `releaseSemantic*`，给出**分布 + 极差 + 判读**。
//   ⚠ **只读 + 触发**（触发会跑深睡、写库 —— 与手动点"立即进入深睡"等价，非新增副作用）。
//
// 用法: node scripts/essence-review-stability.mjs [--rounds 3] [--port 3080]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const rounds = Math.max(1, Number(argOf('--rounds', '3')) || 3)
const port = argOf('--port', '3080')
const ledger = join(homedir(), '.dsh', 'suite', 'knowledge', 'audit', 'ledger.jsonl')

const lastDeepSleep = () => {
  const rows = []
  for (const l of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t) continue
    try { const o = JSON.parse(t); if (o?.type === 'audit.deep-sleep') rows.push(o) } catch { /* 坏行 */ }
  }
  return rows[rows.length - 1] || null
}
const before = lastDeepSleep()
const seenEpoch = before?.sleepEpoch || null

const READONLY = argv.includes('--live') || argv.includes('--from-ledger') || argv.includes('--decompose')
console.log(READONLY ? 'P5c 语义判定稳定性（**只读模式**）' : 'P5c 语义判定稳定性（报告态 · **会触发深睡**）')
console.log(`台账 ${ledger}`)
console.log(READONLY ? '（只读：不发触发）' : `将触发 ${rounds} 轮深睡；逐轮取 releaseSemantic*（上一纪元 ${seenEpoch || '(无)'}）`)
console.log('')

/* ── `--decompose`：**波动分解**（只读台账 · 不触发）──────────────────────────────────
 * 判因（2026-09-16）：三轮读数里**候选池本身在变**（54→55→56，每轮深睡往 `AGENT.md` 落新原则）
 *   ⇒ 直接看通过率极差会**把候选变化算进模型波动**。两者可**用已有数据分离**（无需再跑）：
 *   · 候选每轮只 +1 条 ⇒ "新增那条全通过/全不通过"给出**通过率变化上界**；
 *   · 实测相邻轮变化若**远大于**该上界 ⇒ 差额只能归因于**模型判定波动**。 */
if (argv.includes('--decompose')) {
  const rowsAll = []
  for (const l of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t) continue
    try { const o = JSON.parse(t); if (o?.type === 'audit.deep-sleep' && typeof o.releaseSemanticCandidates === 'number' && o.releaseSemanticCandidates > 0) rowsAll.push(o) } catch { /* 坏行 */ }
  }
  const last = rowsAll.slice(-6)
  if (last.length < 2) { console.log(`⚠ 可分解样本 ${last.length} < 2 ⇒ 不足以分解`); process.exit(0) }
  console.log('P5c 波动分解（只读台账 · 不触发）')
  console.log('')
  console.log('轮  纪元                      候选  通过  否   未判  通过率')
  last.forEach((r, i) => {
    const rate = Math.round((r.releaseSemanticApproved / r.releaseSemanticCandidates) * 1000) / 10
    console.log(`${String(i + 1).padStart(2)}  ${String(r.sleepEpoch).padEnd(24)} ${String(r.releaseSemanticCandidates).padStart(4)}  ${String(r.releaseSemanticApproved).padStart(4)}  ${String(r.releaseSemanticRejected).padStart(3)}  ${String(r.releaseSemanticUnjudged).padStart(4)}  ${rate}%`)
  })
  console.log('')
  console.log('分解（相邻轮）：')
  let shareSum = 0, cnt = 0
  for (let i = 1; i < last.length; i++) {
    const a = last[i - 1], b = last[i]
    const ra = a.releaseSemanticApproved / a.releaseSemanticCandidates
    const rb = b.releaseSemanticApproved / b.releaseSemanticCandidates
    const dRate = (rb - ra) * 100
    const dn = b.releaseSemanticCandidates - a.releaseSemanticCandidates
    const hi = ((a.releaseSemanticApproved + Math.max(0, dn)) / b.releaseSemanticCandidates - ra) * 100
    const lo = (a.releaseSemanticApproved / b.releaseSemanticCandidates - ra) * 100
    const bound = Math.max(Math.abs(hi), Math.abs(lo))
    const model = Math.max(0, Math.abs(dRate) - bound)
    const share = Math.abs(dRate) > 0 ? model / Math.abs(dRate) : 0
    shareSum += share; cnt++
    console.log(`  轮${i}→${i + 1}：通过率变 ${Math.round(dRate * 10) / 10}pp · 候选变 ${dn >= 0 ? '+' : ''}${dn} 条 ⇒ 候选可解释**至多 ${Math.round(bound * 10) / 10}pp** ⇒ **模型波动 ≥ ${Math.round(model * 10) / 10}pp（占 ${Math.round(share * 100)}%）**`)
  }
  console.log('')
  /* ⚠ 判读**不能只用算术平均**：变化极小的一对（如 +1.0pp）会把均值拉低，掩盖"大变化对几乎全由模型造成"这一事实。
   *   ⇒ 同时给**按变化量加权**的份额（Σ模型波动 / Σ|通过率变化|）—— 对"大变化对"更敏感，也更贴问题本身。 */
  const sumModel = last.slice(1).reduce((s, _, k) => {
    const a = last[k], b = last[k + 1]
    const ra = a.releaseSemanticApproved / a.releaseSemanticCandidates
    const rb = b.releaseSemanticApproved / b.releaseSemanticCandidates
    const dn = b.releaseSemanticCandidates - a.releaseSemanticCandidates
    const hi = ((a.releaseSemanticApproved + Math.max(0, dn)) / b.releaseSemanticCandidates - ra) * 100
    const lo = (a.releaseSemanticApproved / b.releaseSemanticCandidates - ra) * 100
    return s + Math.max(0, Math.abs((rb - ra) * 100) - Math.max(Math.abs(hi), Math.abs(lo)))
  }, 0)
  const sumAbs = last.slice(1).reduce((s, _, k) => {
    const ra = last[k].releaseSemanticApproved / last[k].releaseSemanticCandidates
    const rb = last[k + 1].releaseSemanticApproved / last[k + 1].releaseSemanticCandidates
    return s + Math.abs((rb - ra) * 100)
  }, 0)
  const weighted = sumAbs > 0 ? Math.round((sumModel / sumAbs) * 100) : 0
  const avgShare = cnt ? Math.round((shareSum / cnt) * 100) : 0
  console.log(`⇒ 模型判定波动占比：**算术均值 ${avgShare}%** · **按变化量加权 ${weighted}%**（后者更能说明"大变化"由谁造成）`)
  console.log(`   （Σ模型波动 ${Math.round(sumModel * 10) / 10}pp / Σ|通过率变化| ${Math.round(sumAbs * 10) / 10}pp）`)
  console.log(weighted >= 75
    ? `⇒ **结论：波动主要来自模型判定（加权 ${weighted}%）** ⇒ 降波动应落在**判据/提示**上，而不是"等库稳定"`
    : `⇒ 候选变化与模型波动**相当** ⇒ 两者都要处理`)
  process.exit(0)
}

/* `--from-ledger N`（2026-09-16 新增）：**不发触发**，直接用台账里**已有的 N 个真纪元**算分布。
 *   ⚠ 为什么需要它：触发式测量依赖"本轮真的落了新行"，而**实测存在无痕跳过不落行**的情形 ⇒
 *     触发式会**重复读旧值**（假绿：三轮读数相同 ⇒ 误判"极差 0pp = 收敛"）。
 *     ⇒ 只读模式**只用真纪元**（每行 = 一次真的深睡），结论可信。
 * `--since <epoch尾号|ISO时间>`（2026-09-16 追加）：**世代过滤** —— 只用指定世代之后的纪元。
 *   判因：`N` 只是**近似**（台账混着多个世代：抽取事故前/后、接地前/后），拿跨世代极差当当代结论会
 *   **高估波动**（实测跨世代 26.1pp vs 当代 18.7pp）⇒ 世代边界应**显式给出**
 *   （例：`--since 1789567727088` 或 `--since 2026-09-16T14:00`）。 */
if (argv.includes('--from-ledger')) {
  const n = Math.max(2, Number(argOf('--from-ledger', '6')) || 6)
  const since = argOf('--since', '')
  const rowsAll = []
  for (const l of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t) continue
    try { const o = JSON.parse(t); if (o?.type === 'audit.deep-sleep' && Number(o.releaseSemanticCandidates) > 0) rowsAll.push(o) } catch { /* 坏行 */ }
  }
  let pool = rowsAll
  if (since) {
    /* ⚠ 语义首版写错（`endsWith` = **只精确匹配那一个**），而 `--since` 应为「**从该世代起**（含之后）」。
     *   实测由它得出"可用真纪元 1 < 2"，正是把"起点"误当"单点"的症状。 */
    const idx = rowsAll.findIndex((r) => String(r.sleepEpoch || '').endsWith(String(since)))
    const byTime = rowsAll.filter((r) => String(r.at || '') >= String(since))
    pool = idx >= 0 ? rowsAll.slice(idx) : byTime
    if (!pool.length) { console.log(`⚠ --since ${since} 未命中任何纪元（台账共 ${rowsAll.length} 行）⇒ **不判**（别据此说"收敛"）`); process.exit(0) }
  }
  const last = pool.slice(-n)
  if (last.length < 2) { console.log(`⚠ 可用真纪元 ${last.length} < 2 ⇒ 不足以判波动`); process.exit(0) }
  console.log(`P5c 判定波动（**只读模式**：${since ? `世代 --since ${since} · 命中 ${pool.length} 个 · ` : ''}取最近 ${last.length} 个真纪元 · 不发触发）`)
  console.log('')
  const rates = [], unjs = []
  last.forEach((r, i) => {
    const c = Number(r.releaseSemanticCandidates)
    const a = Number(r.releaseSemanticApproved)
    const u = Number(r.releaseSemanticUnjudged)
    const rate = Math.round((a / c) * 1000) / 10
    const unj = Math.round((u / c) * 1000) / 10
    rates.push(rate); unjs.push(unj)
    console.log(`  ${String(i + 1).padStart(2)}  ${r.sleepEpoch}  候选 ${c} · 通过 ${a} · 否 ${r.releaseSemanticRejected} · 未判 ${u} ⇒ **${rate}%**（未判 ${unj}%）`)
  })
  const span = Math.max(...rates) - Math.min(...rates)
  const unjSpan = Math.max(...unjs) - Math.min(...unjs)
  console.log('')
  console.log(`极差：通过率 **${Math.round(span * 10) / 10}pp** · 未判率 **${Math.round(unjSpan * 10) / 10}pp**（阈值 10pp）`)
  console.log(span <= 10 && unjSpan <= 10
    ? '✅ **收敛** ⇒ 满足接线自动执行的"波动"条件（仍须抽样干净）'
    : '❌ **未收敛** ⇒ 不得接线自动执行（每轮释放集合不同）')
  process.exit(0)
}

/* `--live`（2026-09-16 新增）：**区分"没跑"与"跑了但还没落账"**。
 *   判因：审计行**只在深睡结束时写** ⇒ 只读台账会看到"末行纪元没变"，从而**误判为"没动"**
 *   （我在第 59 轮就因此把"三轮读数相同"当成"收敛" ⇒ **假绿**）。
 *   ⇒ 本模式读宿主状态 `/deepsleep`：若 `currentEpoch` ≠ 台账末行纪元 ⇒ **有纪元在跑**（未落账），
 *     这与"没跑"是**完全不同**的事实，必须分开报。 */
if (argv.includes('--live')) {
  const rowsAll = []
  for (const l of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t) continue
    try { const o = JSON.parse(l); if (o?.type === 'audit.deep-sleep') rowsAll.push(o) } catch { /* 坏行 */ }
  }
  const lastRow = rowsAll[rowsAll.length - 1] || null
  let st = null
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/shoucang-panel/deepsleep`, { signal: AbortSignal.timeout(10000) })
    if (r.ok) st = await r.json()
  } catch { /* 宿主不可达 */ }
  console.log('P5c 深睡活性（只读 · 区分"没跑"与"跑了未落账"）')
  console.log(`  台账末行纪元 = ${lastRow ? lastRow.sleepEpoch : '(无)'}`)
  if (!st) { console.log('  ⚠ 宿主状态不可达 ⇒ **不判**（不要据此说"没跑"）'); process.exit(3) }
  console.log(`  宿主 currentEpoch = ${st.currentEpoch} ｜ running=${st.running} · ended=${st.ended} · probing=${st.probing} · **suspect=${st.suspect} · stalled=${st.stalled}**`)
  const same = lastRow && st.currentEpoch === lastRow.sleepEpoch
  console.log('')
  console.log(same
    ? '⇒ 当前纪元**已落账** ⇒ 无在跑纪元；可安全用 `--from-ledger` 读数'
    : `⇒ **有纪元在跑且未落账**（${st.currentEpoch}）⇒ 台账"没变"**不代表没跑** —— 等它跑完再读（\`--from-ledger\` 天然滞后一轮）`)
  console.log((st.stalled || st.suspect)
    ? `⚠ 探针报 stalled=${st.stalled} · suspect=${st.suspect} ⇒ **确有疑似停滞**，需人工看`
    : '✅ 探针未报 stalled/suspect（活跃判定正常）')
  process.exit(0)
}

/* `--jaccard`（2026-09-16 新增）：**更本质的稳定性判据** —— 直接测「**相邻两轮释放集合有多像**」。
 *   判因：原先用「通过率极差」当判据，但它是**代理指标** —— 被**未判率污染**（未判 ⇒ 缩小交集 ⇒ 通过率下降），
 *   实测未判率 `0→25.3%` 直接变成通过率摆动（仓内 [原则] 代理指标非判据）。
 *   ⇒ 用**集合指纹**（审计里的 `releaseApprovedHashes`，短哈希）算 **Jaccard = |交| / |并|**：
 *     1.0 = 两轮释放集合完全一致；0 = 完全无关。**阈值 0.8**（与"极差 ≤10pp"同精神：允许小扰动）。
 *   ⚠ 只对有指纹的纪元有效（本字段自 2026-09-16 起才记）⇒ 无指纹时**如实说"不可判"**，不猜。 */
if (argv.includes('--jaccard')) {
  const rowsAll = []
  for (const l of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t) continue
    try {
      const o = JSON.parse(t)
      if (o?.type === 'audit.deep-sleep' && Array.isArray(o.releaseApprovedHashes) && o.releaseApprovedHashes.length) rowsAll.push(o)
    } catch { /* 坏行 */ }
  }
  if (rowsAll.length < 2) {
    console.log(`⚠ 带集合指纹的纪元 ${rowsAll.length} < 2 ⇒ **不可判**（该字段自 2026-09-16 起才记；不猜）`)
    process.exit(3)
  }
  console.log(`P5c 释放集合稳定度（**集合指纹 · Jaccard**）：${rowsAll.length} 个带指纹纪元`)
  console.log('')
  const js = []
  for (let i = 1; i < rowsAll.length; i++) {
    const a = rowsAll[i - 1].releaseApprovedHashes, b = rowsAll[i].releaseApprovedHashes
    const A = new Set(a), B = new Set(b)
    let inter = 0
    for (const x of A) if (B.has(x)) inter++
    const j = inter / (A.size + B.size - inter)
    js.push(j)
    console.log(`  ${String(rowsAll[i].sleepEpoch).slice(-6)}：|A|=${A.size} · |B|=${B.size} · 交=${inter} ⇒ **Jaccard ${j.toFixed(3)}**`)
  }
  const min = Math.min(...js), mean = js.reduce((x, y) => x + y, 0) / js.length
  console.log('')
  console.log(`最小 **${min.toFixed(3)}** · 均值 **${mean.toFixed(3)}**（阈值 **0.8**）`)
  console.log(min >= 0.8
    ? '✅ **释放集合稳定** ⇒ 满足接线的"集合稳定"条件（仍须抽样干净）'
    : '❌ **释放集合不稳定** ⇒ 不得接线自动执行（每轮释放的条目在换）')
  process.exit(0)
}

const rows = []
/* ⚠ 实测（2026-09-16）：深睡运行时端点返回 **409 Conflict**（`m.deepSleepRunning` 已在跑）——
 *   而一轮深睡要跑 **8 个并发子代理**（归因 + 收益 + 6 批语义复核），耗时可达数分钟。
 *   ⇒ 必须先**等空闲**再触发，否则 409 会被误读成"触发失败/端点坏了"。 */
const triggerWhenIdle = async (maxWaitMs = 900000) => {
  const t0 = Date.now()
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/shoucang-panel/deepsleep/trigger`, { method: 'POST', signal: AbortSignal.timeout(1200000) })
      if (r.status === 409) {
        if (Date.now() - t0 > maxWaitMs) return { ok: false, why: `等空闲超 ${Math.round(maxWaitMs / 60000)}min（一直 409）` }
        await new Promise((res) => setTimeout(res, 20000))
        continue
      }
      return { ok: r.ok, why: r.ok ? '' : `HTTP ${r.status}` }
    } catch (e) {
      if (Date.now() - t0 > maxWaitMs) return { ok: false, why: 'fetch 失败：' + String(e?.cause?.code || e?.message || e).slice(0, 60) }
      await new Promise((res) => setTimeout(res, 20000))
    }
  }
}

for (let i = 1; i <= rounds; i++) {
  const t = await triggerWhenIdle()
  if (!t.ok) { console.log(`  第 ${i} 轮：${t.why}`); continue }
  /* ⚠⚠ 2026-09-16 **实测假绿（必须校验行是否为本轮新产）**：先前只取"台账最后一行"⇒ 若本轮深睡
   *   **没有落新行**（如无痕跳过、水位未推进），就会**把上一行的旧值重复报**，于是三轮读数完全相同、
   *   算出"极差 0pp = 收敛" —— 那是**空转判读**（仓内最忌）。⇒ 现在**必须等到 `sleepEpoch` 变化**才读数；
   *   超时未见新行 ⇒ **明说"未产生新审计行"且不计入分布**（宁可不判，也不报假读数）。 */
  const prevEpoch = lastDeepSleep()?.sleepEpoch || null
  let now = null
  for (let w = 0; w < 30; w++) {
    now = lastDeepSleep()
    if (now && now.sleepEpoch && now.sleepEpoch !== prevEpoch) break
    await new Promise((res) => setTimeout(res, 10000))
  }
  if (!now || !now.sleepEpoch || now.sleepEpoch === prevEpoch) {
    console.log(`  第 ${i} 轮：**未产生新审计行**（epoch 仍为 ${prevEpoch}）⇒ **不判读数**（防空转假绿）`)
    continue
  }
  const c = now?.releaseSemanticCandidates
  const p = now?.releaseSemanticApproved
  if (typeof c !== 'number' || c === 0) { console.log(`  第 ${i} 轮：无候选或无读数（cand=${c}）`); continue }
  const rate = Math.round((p / c) * 1000) / 10
  rows.push({ i, epoch: now.sleepEpoch, cand: c, appr: p, rej: now.releaseSemanticRejected, unj: now.releaseSemanticUnjudged, rate })
  console.log(`  第 ${i} 轮：候选 ${c} · 通过 ${p} · 否 ${now.releaseSemanticRejected} · 未判 ${now.releaseSemanticUnjudged} ⇒ **通过率 ${rate}%**（未判率 ${Math.round((now.releaseSemanticUnjudged / c) * 1000) / 10}%）`)
}

console.log('')
if (rows.length < 2) {
  console.log(`⚠ 有效轮次 ${rows.length} < 2 ⇒ **不足以判波动**（如实记，不猜）`)
  process.exit(0)
}
const rates = rows.map((r) => r.rate)
const unjs = rows.map((r) => Math.round((r.unj / r.cand) * 1000) / 10)
const span = Math.max(...rates) - Math.min(...rates)
const unjSpan = Math.max(...unjs) - Math.min(...unjs)
const mean = Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10
console.log(`分布：通过率 ${rates.join('% / ')}% ⇒ 均值 **${mean}%** · **极差 ${Math.round(span * 10) / 10}pp**`)
console.log(`      未判率 ${unjs.join('% / ')}% ⇒ **极差 ${Math.round(unjSpan * 10) / 10}pp**`)
console.log('')
const converged = span <= 10 && unjSpan <= 10
console.log(converged
  ? '✅ **收敛**（通过率极差 ≤10pp 且 未判率极差 ≤10pp）⇒ 满足接线自动执行的"波动"条件（仍须抽样干净）'
  : `❌ **未收敛**（极差 ${Math.round(span * 10) / 10}pp / ${Math.round(unjSpan * 10) / 10}pp ＞ 10pp）⇒ **不得接线自动执行**（每轮释放集合会不同）`)
console.log('⚠ 提醒：本器只量"轮间一致性"；判据**正确性**另由抽样核对背书（`releaseApprovedSample` 人眼核）。')
