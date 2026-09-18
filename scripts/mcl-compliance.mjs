#!/usr/bin/env node
/**
 * mcl-compliance.mjs — 认知环**引用合规率**读数（G4 接线 P2b 的放行判据工具 · 2026-09-13）
 *
 * 为什么需要它：方案档 §12 风险 1 规定「P2b 改道后用 `judge` 合规机检**前后对比，合规率不降才放行**」。
 *   但 `mcl-audit` 原先**只在「不合规」分支写行**（合规步不落账）⇒ 合规率没有分母，判据**执行不了**。
 *   补上合规步落账后，本工具把两段分开算：**材料走消息面**（viaSystem 缺省）vs **走 systemPrompt 段**（viaSystem=1）。
 *
 * 用法：
 *   node scripts/mcl-compliance.mjs [--min 20] [--json out.json]
 *     --min N   每段最少样本数（不足则判"样本不足"，exit 3 —— 诚实跳过，不拿小样本下结论）
 * 退出码：0 = 达标或样本不足（报告）· 1 = 样本充足且**回引率显著下降** · 3 = 无数据/样本不足
 *
 * ⚠ 2026-09-18（IR1 附册 F2）**口径订正**：本工具测的字段原名 `compliant`，其真实含义是
 *   「上一步回复是否**回引了材料主题词**」的**词面代理**（真机实测 true = 0 / 3119）；键名已更为 `topicEcho`，
 *   文案随之称**回引率**（不再叫"合规率"——那会被读成"材料被用上了"，正是要防的漂移）。
 *   真实收益信号在 `audit/yield-rounds.jsonl`（"注入之后模型实际做了什么"，J5/U3-修信号），不在本工具口径内。
 *
 * 判据：`rate(systemPrompt段) ≥ rate(消息面段) − 0.05`（5pp 容差；不设"提升"要求——目标是**不降**）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const MIN = Number(argOf('--min', '20'))
const JSON_OUT = argOf('--json', '')
const TOLERANCE = 0.05

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
// DS4 合并第五刀（2026-09-13）：认知环审计现行落在**统一台账** `ledger.jsonl`（type=`mcl.*`），
//   历史批次仍在 legacy `mcl-audit.jsonl` ⇒ **双源合并读**（历史不丢、口径不变）。
const auditDir = join(dshHome, 'suite', 'knowledge', 'audit')
const legacyF = join(auditDir, 'mcl-audit.jsonl')
const ledgerF = join(auditDir, 'ledger.jsonl')
if (!existsSync(legacyF) && !existsSync(ledgerF)) {
  console.log(`⏭ 无 mcl 审计源（${legacyF} / ${ledgerF}）—— 无数据可算`)
  process.exit(3)
}

const rows = []
const readInto = (file, keep) => {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    try { const o = JSON.parse(line); if (keep(o)) rows.push(o) } catch { /* 坏行跳过 */ }
  }
}
readInto(legacyF, () => true) // 历史批次
readInto(ledgerF, (o) => String(o?.type || '').startsWith('mcl')) // 现行（统一台账；兼容历史 `mcl.*` 写法）
rows.sort((a, b) => Date.parse(a.at || '') - Date.parse(b.at || '')) // 合并后按时间序（下游按窗口过滤）
// 键名 2026-09-18 由 `compliant` 更名为 `topicEcho`（IR1 附册 F2：诚实命名）⇒ 跨代都收（历史行 + 现行行）。
const hasEcho = (r) => typeof r.topicEcho === 'boolean' || typeof r.compliant === 'boolean'
const echoOf = (r) => r.topicEcho === true || r.compliant === true
const judgedAll = rows.filter((r) => r.kind === 'mcl-step' && r.channel === 'slow' && hasEcho(r))
// **时间窗（--since）**：合规步落账是 2026-09-13 才补的 ⇒ 更早的行**只有 false、没有分母**，
//   混进来会把"合规率"算成 0%（实测 803 条 0 合规即此artifact）。故对比必须限定窗口。
const SINCE = argOf('--since', '')
const judged = SINCE ? judgedAll.filter((r) => { const t = Date.parse(r.at); return Number.isFinite(t) && t >= Date.parse(SINCE) }) : judgedAll

const group = (pred) => {
  const g = judged.filter(pred)
  const okN = g.filter(echoOf).length
  return { n: g.length, compliant: okN, rate: g.length ? okN / g.length : 0 }
}
const byMsg = group((r) => r.viaSystem !== 1)   // 材料走消息面（P2b 改道前 / 开关关）
const bySys = group((r) => r.viaSystem === 1)   // 材料走 systemPrompt 段（P2b 开启后）

const pct = (x) => `${(x * 100).toFixed(1)}%`
console.log(`认知环材料回引率 · 数据源 legacy mcl-audit ∪ 统一台账里的 mcl.*（${auditDir}）`)
console.log(`  窗口：${SINCE ? `≥ ${SINCE}` : '全量（⚠ 含 2026-09-13 之前的行——那时回引步不落账，分母不存在）'} · 判定样本 ${judged.length}/${judgedAll.length}`)
console.log(`  材料走**消息面**（viaSystem≠1）  n=${byMsg.n}  回引 ${byMsg.compliant}  回引率 ${pct(byMsg.rate)}`)
console.log(`  材料走**systemPrompt 段**（=1） n=${bySys.n}  回引 ${bySys.compliant}  回引率 ${pct(bySys.rate)}`)

let verdict = 'insufficient'
let detail = ''
if (byMsg.n < MIN || bySys.n < MIN) {
  verdict = 'insufficient'
  detail = `样本不足（各段需 ≥ ${MIN}；当前 ${byMsg.n} / ${bySys.n}）——**不下结论**`
} else if (bySys.rate >= byMsg.rate - TOLERANCE) {
  verdict = 'pass'
  detail = `systemPrompt 段 ${pct(bySys.rate)} ≥ 消息面段 ${pct(byMsg.rate)} − ${TOLERANCE * 100}pp ⇒ **可放行**`
} else {
  verdict = 'regress'
  detail = `systemPrompt 段 ${pct(bySys.rate)} < 消息面段 ${pct(byMsg.rate)} − ${TOLERANCE * 100}pp ⇒ **合规率下降，应回滚开关**`
}
console.log(`\n判据：systemPrompt 段 ≥ 消息面段 − ${TOLERANCE * 100}pp`)
console.log(`裁决：${verdict.toUpperCase()} — ${detail}`)

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ file: f, min: MIN, tolerance: TOLERANCE, byMessage: byMsg, bySystemPrompt: bySys, verdict, detail, totalJudged: judged.length }, null, 1), 'utf8')
  console.log(`报告已落：${JSON_OUT}`)
}
process.exit(verdict === 'regress' ? 1 : verdict === 'insufficient' ? 3 : 0)
