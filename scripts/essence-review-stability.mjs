#!/usr/bin/env node
// essence-review-stability.mjs — **P5c 语义判定稳定性校准器**（2026-09-16）
// ⚠ 2026-09-25 订正：此行原写「报告态，不入 CHECKS」——**与事实不符**。ACT-349（2026-09-23）已把它
//   登记为 **S-P5c 释放接线的前置门**（`scripts/check-runner.mjs:270`，只登记只读档 `--from-ledger`）。
//   本器既在前置门位上，就**不得**「红在终端、绿在退出码」：三条判据路径现均以 **exit 4**
//   （已知未修 · 声明制）表达「不收敛 ⇒ 不得接线自动执行」，与同族的 `check-yield-reflow` 同规格。
//   ⚠ 残余一步（未做，因 `check-runner.mjs` 当前属**跨会话冻结面**）：`check-runner.mjs:270` 须补
//   `{ xfail: true }`，否则按运行器 `:1348` 的规则——**未声明却退 4 ⇒ 判 fail**。解冻后补一行即可。
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

/* ⚠ **跨档读（G13 轮转失明 · 2026-09-20 修）**：本件原先**只读主档**，而 deep-sleep 行**全在旧卷**
 *   （实测：主档 `type==='audit.deep-sleep'` **0** 行 / 旧卷 **49** 行）⇒ 该器一直报
 *   「上一纪元 (无)」并按**空样本**算分布（P5c 接线的全部结论建立在此之上）。
 *   现改用唯一实现 `lib/ledger-compact.js#readLedgerVolumes`（最旧档 → 主档，按时间序）。
 *   判据：`scripts/check-ledger-read.mjs`（脚本面 known-broken 名单）——**修完须从该名单删**。 */
const { readLedgerVolumes } = await import(new URL('../lib/ledger-compact.js', import.meta.url).href)
/** 跨档深睡行（**唯一读出口**，本件所有分布/极差/Jaccard 都从这里取） */
const deepSleepRows = () => {
  const rows = []
  for (const l of readLedgerVolumes(ledger)) {
    const t = l.trim(); if (!t) continue
    try { const o = JSON.parse(t); if (o?.type === 'audit.deep-sleep') rows.push(o) } catch { /* 坏行 */ }
  }
  return rows
}

/**
 * 该纪元是否**判定未完成**（异常态），而非"判了全否"。
 *
 * ⚠ **唯一实现**（2026-09-23 · ACT-352 收敛）：此前 `--decompose` 与 `--from-ledger` **各写一份**
 *   （同语义两处重实现，本仓反复记账的漂移源）⇒ 现只此一份，两分支共用。
 *
 * **必要性（真缺陷实测）**：真机某纪元 `候选 113 · 通过 0 · 否 0`，而 note 明写
 *   「全部批次无法解析（`stop=error`×12）」⇒ 旧实现算 `approved/candidates` **把"12 批全失败"
 *   计成"通过率 0%"**，使极差从真值 **16.3pp 虚增到 37.2pp**（判读被污染一倍）。
 *
 * **三级判据（强 → 弱）**：
 *   ① **显式字段** `releaseSemanticError`（`unparsable`|`threw`）—— ACT-352 起由产出侧写出，
 *      **这是判据**（结构化事实）；新行一律走此路。
 *   ② `releaseSemanticNote` 文本匹配（`全部批次无法解析|stop=error`）——
 *      **仅回退给历史行**（写字段之前产出的），**代理指标**，不作为长期依赖。
 *   ③ 末位兜底：候选 > 0 而 通过+否 = 0 ⇒ 判定面未产出（**最弱**，仅救既无字段又无特征文案的历史行）。
 */
const isEpochError = (r) => {
  if (r && r.releaseSemanticError) return true
  const note = String((r && r.releaseSemanticNote) || '')
  if (/全部批次无法解析|stop=error/.test(note)) return true
  const sum = Number((r && r.releaseSemanticApproved) || 0) + Number((r && r.releaseSemanticRejected) || 0)
  return Number((r && r.releaseSemanticCandidates) || 0) > 0 && sum === 0
}

const lastDeepSleep = () => {
  const rows = deepSleepRows()
  return rows[rows.length - 1] || null
}
const before = lastDeepSleep()
const seenEpoch = before?.sleepEpoch || null

const READONLY = argv.includes('--live') || argv.includes('--from-ledger') || argv.includes('--decompose') || argv.includes('--jaccard')
console.log(READONLY ? 'P5c 语义判定稳定性（**只读模式**）' : 'P5c 语义判定稳定性（报告态 · **会触发深睡**）')
console.log(`台账 ${ledger}（**跨档读**：最旧档 → 主档）`)
console.log(READONLY ? '（只读：不发触发）' : `将触发 ${rounds} 轮深睡；逐轮取 releaseSemantic*（上一纪元 ${seenEpoch || '(无)'}）`)
console.log('')

/* ── `--decompose`：**波动分解**（只读台账 · 不触发）──────────────────────────────────
 * 判因（2026-09-16）：三轮读数里**候选池本身在变**（54→55→56，每轮深睡往 `AGENT.md` 落新原则）
 *   ⇒ 直接看通过率极差会**把候选变化算进模型波动**。两者可**用已有数据分离**（无需再跑）：
 *   · 候选每轮只 +1 条 ⇒ "新增那条全通过/全不通过"给出**通过率变化上界**；
 *   · 实测相邻轮变化若**远大于**该上界 ⇒ 差额只能归因于**模型判定波动**。 */
if (argv.includes('--decompose')) {
  const rowsAll = deepSleepRows().filter((o) => typeof o.releaseSemanticCandidates === 'number' && o.releaseSemanticCandidates > 0)
  /**
   * ⚠ **异常纪元必须识别并排除**（2026-09-23 修 · 真缺陷，非补丁）。
   *
   * **判因（实测到行号与原文）**：末 6 轮读数里第 6 轮是 `候选 113 · 通过 0 · 否 0 · 未判 0 ⇒ 0%`，
   *   而它把整段**极差拉到 37.2pp**，据此判"未收敛"。但该行的 `releaseSemanticNote` 明写：
   *     `全部批次无法解析（stop=error,error,…×12 · 输出 0/0/0/…×12 字符）`
   *   ⇒ **`approved=0` 不是"模型判了全否"，而是"12 批全失败"**。
   *   旧实现直接算 `approved/candidates` ⇒ **把异常退化成 0%**，
   *   与"真的 0 通过"**不可分辨** —— 本仓「失败不可观测」族的标准形态
   *   （同族先例：`vec.ts` 把六类失败塌缩成 `null`；`sleep-selfcheck` 把"未跑"记成 ok）。
   * **修法**：`stop=error` / 输出全 0 字符 / `approved+rejected == 0` 而 `candidates > 0` 者
   *   ⇒ 归 **`error` 档**，**不进通过率序列**（否则极差与判读都被污染）。
   * ⚠ **未致漏报**：异常行**单独计数并打印**（不静默丢弃）——读者仍能看到"本轮 12 批全失败"。
   * ⚠ `isEpochError` 现为**模块级唯一实现**（见其定义处长注）——此处不再内联。
   */
  const all = rowsAll.slice(-6)
  const errored = all.filter(isEpochError)
  const last = all.filter((r) => !isEpochError(r))
  if (errored.length) {
    console.log(`⚠ **排除 ${errored.length} 个异常纪元**（判定面未产出，非"0 通过"）：`)
    for (const r of errored) console.log(`   · ${r.at} 候选 ${r.releaseSemanticCandidates} —— ${String(r.releaseSemanticNote || '').slice(0, 110)}`)
    console.log('   （异常计入极差会污染判读 ⇒ 已排除；但它**单独列出**，不静默丢弃）\n')
  }
  if (last.length < 2) { console.log(`⚠ 可分解样本 ${last.length} < 2 ⇒ 不足以分解（异常 ${errored.length} 个已排除）`); process.exit(0) }
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
  const rowsAll = deepSleepRows().filter((o) => Number(o.releaseSemanticCandidates) > 0)
  let pool = rowsAll
  if (since) {
    /* ⚠ 语义首版写错（`endsWith` = **只精确匹配那一个**），而 `--since` 应为「**从该世代起**（含之后）」。
     *   实测由它得出"可用真纪元 1 < 2"，正是把"起点"误当"单点"的症状。 */
    const idx = rowsAll.findIndex((r) => String(r.sleepEpoch || '').endsWith(String(since)))
    const byTime = rowsAll.filter((r) => String(r.at || '') >= String(since))
    pool = idx >= 0 ? rowsAll.slice(idx) : byTime
    if (!pool.length) { console.log(`⚠ --since ${since} 未命中任何纪元（台账共 ${rowsAll.length} 行）⇒ **不判**（别据此说"收敛"）`); process.exit(0) }
  }
  // ⚠ **异常纪元必须排除**（2026-09-23 修 · 与 `--decompose` 分支同因，见该处长注）：
  //   实测末轮 `候选 113 · 通过 0 · 否 0` 而 note 明写「全部批次无法解析（stop=error×12 · 输出 0 字符）」
  //   ⇒ 直接算 `approved/candidates` 会**把"12 批全失败"计成"通过率 0%"**，
  //     进而把极差从 **16.3pp 虚增到 37.2pp**（判读被污染），与"真 0 通过"不可分辨。
  //   ⇒ 归 `error` 档、**不进通过率序列**；但**单独列出**（不静默丢弃）。
  //   ⚠ `isEpochError` 现为**模块级唯一实现**——此前两分支各写一份（同语义重实现），已收敛。
  const tailRaw = pool.slice(-n)
  const erroredLedger = tailRaw.filter(isEpochError)
  const last = tailRaw.filter((r) => !isEpochError(r))
  if (erroredLedger.length) {
    console.log(`⚠ **排除 ${erroredLedger.length} 个异常纪元**（判定面未产出，非"0 通过"）：`)
    for (const r of erroredLedger) console.log(`   · ${r.at} 候选 ${r.releaseSemanticCandidates} —— ${String(r.releaseSemanticNote || '').slice(0, 110)}`)
    console.log('')
  }
  if (last.length < 2) { console.log(`⚠ 可用真纪元 ${last.length} < 2 ⇒ 不足以判波动（异常 ${erroredLedger.length} 个已排除）`); process.exit(0) }
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
  // 2026-09-25（L6-04 · 独立复验 confirmed）：**本行才是 check-runner 登记的那条**
  //   （`['scripts/essence-review-stability.mjs','--from-ledger']`），原实现 `process.exit(0)` 恒绿
  //   ⇒ 终端打 ❌、runner 摘要却是 ✅，禁令无执行力。补真退出码与 `:282` 同规格。
  if (!(span <= 10 && unjSpan <= 10)) {
    console.error(`\n❌ exit 4（已知未修 · 声明制）：未收敛（极差 ${Math.round(span * 10) / 10}pp / ${Math.round(unjSpan * 10) / 10}pp ＞ 10pp）⇒ 不得接线自动执行`)
    process.exit(4)
  }
  process.exit(0)
}

/* `--live`（2026-09-16 新增）：**区分"没跑"与"跑了但还没落账"**。
 *   判因：审计行**只在深睡结束时写** ⇒ 只读台账会看到"末行纪元没变"，从而**误判为"没动"**
 *   （我在第 59 轮就因此把"三轮读数相同"当成"收敛" ⇒ **假绿**）。
 *   ⇒ 本模式读宿主状态 `/deepsleep`：若 `currentEpoch` ≠ 台账末行纪元 ⇒ **有纪元在跑**（未落账），
 *     这与"没跑"是**完全不同**的事实，必须分开报。 */
if (argv.includes('--live')) {
  const rowsAll = deepSleepRows()
  const lastRow = rowsAll[rowsAll.length - 1] || null
  let st = null
  /* 下一段原为 `readFileSync(ledger)` 单档读；已随跨档读统一（见 `deepSleepRows`）。 */
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
  const rowsAll = deepSleepRows().filter((o) => Array.isArray(o.releaseApprovedHashes) && o.releaseApprovedHashes.length)
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
  // 2026-09-25（高并发遍历审计 L6-04 · 独立复验 confirmed）：本件 `:270` 在 check-runner 里
  //   登记为「S-P5c 释放接线前置门」，却**全文无 exit 1** ⇒ 判据红了（❌）而退出码恒 0
  //   ⇒ `npm test` 摘要与 CI 都读不到，禁令无执行力（仓规 6「未登记=没写」的镜像：
  //   登记了但判不出红）。此处**就地改真门禁**，不再靠 runner 注记降级——
  //   理由：该门拦的是「自动执行放量」，读数不收敛正是它该拦的状态；真收敛时自然转绿。
  const unstable = min < 0.8
  if (unstable) {
    console.error('\n❌ exit 4（已知未修 · 声明制）：释放集合不稳定 ⇒ 不得接线自动执行（见上：最小 Jaccard ' + min.toFixed(3) + ' < 0.8）')
    process.exit(4)
  }
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
// 2026-09-25（L6-04 同族第三处）：默认（触发式）路径同样补退出码，使「不得接线自动执行」
//   在三条路径上都有执行力——否则同一条禁令的强度随参数而异，读者无法据退出码判断。
if (!converged) {
  console.error('\n❌ exit 4（已知未修 · 声明制）：未收敛 ⇒ 不得接线自动执行（见上极差）')
  process.exit(4)
}
