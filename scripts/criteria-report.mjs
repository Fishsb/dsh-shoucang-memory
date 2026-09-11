#!/usr/bin/env node
// criteria-report.mjs — 判据健康报告生成器（ADR-122 v2 · M3 数据驱动调参的准备件）
//
// 用途：把「判据注册表 + 判据台账对账 + 注入预算 + rerank 触发门 + 模型判据覆盖率」汇成一份 Markdown 报告，
//   写入记忆库 `audit/criteria-report-<date>.md`，供 M3 调参时按数字决策（而非凭感觉改阈值）。
//   本器**只读 + 只写报告**，不改任何判据、不写台账。
// 用法: node scripts/criteria-report.mjs [--bank <库根>] [--days 7] [--out <相对库根路径>]
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const days = Number(argOf('--days', '7')) || 7
const day = new Date().toISOString().slice(0, 10)
const outRel = argOf('--out', `audit/criteria-report-${day}.md`)

// 注册表投影（优先记忆库内已部署的，其次仓内）
const gatePaths = [join(bank, 'engine', 'criteria-gate.json'), join(repo, 'skill', 'engine', 'criteria-gate.json')]
let gate = null
let gateSrc = ''
for (const p of gatePaths) { try { gate = JSON.parse(readFileSync(p, 'utf8')); gateSrc = p; break } catch { /* 下一个 */ } }

// 对账指标（复用 criteria-audit.mjs --json --out，避免第二份实现；stdio 忽略以避沙箱管道限制）
const tmp = join(bank, 'audit', `.criteria-audit-tmp-${Date.now()}.json`)
let audit = null
try {
  execFileSync('node', [join(repo, 'scripts', 'criteria-audit.mjs'), '--bank', bank, '--days', String(days), '--json', '--out', tmp], { stdio: 'ignore', windowsHide: true })
  audit = JSON.parse(readFileSync(tmp, 'utf8'))
} catch { audit = null }

// 注入预算（与体检同口径：画像行全量 + 索引行按档位 cap）
const capRows = Number(gate?.surface?.injection?.levelCaps?.smart || 10)
const budget = Number(gate?.surface?.injection?.budgetChars || 3000)
const files = ['MEMORY.md', 'USER.md', 'AGENT.md']
let injectChars = 0
const perFile = []
for (const f of files) {
  try {
    const lines = readFileSync(join(bank, f), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    const prof = lines.filter((l) => /←\s*源:/.test(l))
    const idx = lines.filter((l) => /^\[/.test(l))
    const avg = idx.length ? idx.reduce((n, l) => n + l.replace(/\s+/g, '').length, 0) / idx.length : 0
    const est = prof.reduce((n, l) => n + l.replace(/\s+/g, '').length, 0) + avg * Math.min(capRows, idx.length)
    injectChars += est
    perFile.push(`| ${f} | ${idx.length} | ${prof.length} | ${Math.round(est)} |`)
  } catch { perFile.push(`| ${f} | — | — | — |`) }
}
// rerank 触发门
let indexRows = 0
try { indexRows = readFileSync(join(bank, 'MEMORY.md'), 'utf8').split(/\r?\n/).filter((l) => /^\[/.test(l.trim())).length } catch { /* 缺库 */ }
const gateRows = Number(gate?.surface?.rerank?.gate?.indexRows || 200)

// 模型判据覆盖率（台账里带 judgement 的行占比）
const ledgerPath = join(homedir(), '.dsh', 'suite', 'knowledge', 'audit', 'judgement-ledger.jsonl')
let ledgerRows = 0
let withJudgement = 0
try {
  const rows = readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  ledgerRows = rows.length
  withJudgement = rows.filter((r) => r.judgement && Object.keys(r.judgement).length).length
} catch { /* 无台账 */ }

const pct = (v) => (v === null || v === undefined ? 'n/a（样本不足）' : `${(v * 100).toFixed(1)}%`)
const md = [
  `# 判据健康报告 · ${day}`,
  '',
  `> 生成：\`node scripts/criteria-report.mjs --days ${days}\`（只读；不改判据）。用于 ADR-122 的 **M3 数据驱动调参**——按数字改阈值，不凭感觉。`,
  `> 判据源：\`${gateSrc || '(未找到 criteria-gate.json)'}\`${gate ? `（${gate.version}）` : ''} · 窗口 ${days} 天 · 库 = \`${bank}\``,
  '',
  '## 1. 判据对账（指标可空 = 样本不足，不编造）',
  '',
  '| 指标 | 值 | 口径 |',
  '|---|---|---|',
  `| 判据-结果一致率 | ${pct(audit?.metrics?.judgementResultConsistency)} | 判"跨任务/跨项目"的条目是否被真实读命中 |`,
  `| 两域冲突率 | ${pct(audit?.metrics?.domainConflictRate)} | 同主题既进 notes 又升 principle/path |`,
  `| 保守度 | ${pct(audit?.metrics?.conservatism)} | 摄取域「跳过+拒收」占比 |`,
  `| 台账样本 | ${ledgerRows} 行（带 judgement ${withJudgement} 行 / 覆盖率 ${ledgerRows ? (withJudgement / ledgerRows * 100).toFixed(0) + '%' : 'n/a'}） | judgement-ledger.jsonl |`,
  '',
  '## 2. 注入预算（与体检同口径：画像行全量 + 索引行按档位 cap）',
  '',
  '| 主档 | 索引行 | 画像行 | 估算注入字符 |',
  '|---|---|---|---|',
  ...perFile,
  '',
  `合计 ≈ **${Math.round(injectChars)} 字符** / 预算 ${budget} 字符 → 占比 **${(injectChars / budget * 100).toFixed(0)}%**（档位 cap=${capRows} 行）`,
  '',
  '## 3. rerank 触发门（未达门前不引入 reranker——防堆叠）',
  '',
  `- 当前索引行 **${indexRows}** / 阈值 **${gateRows}** → ${indexRows >= gateRows ? '⚠️ **已达门**：应评估引入本地 reranker（并做 A/B）' : '未达门（继续用 RRF + 绝对余弦阈值）'}`,
  '',
  '## 4. 判据分层与强制面（供调参时核对"改哪一层"）',
  '',
  `- L0 内核：${Object.keys(gate?.surface ? { a: 1 } : {}).length ? 'reuse / generality / stability / conflict（两域同口径，枚举不打分）' : '-'}`,
  `- L1 摄取域：归属（含四问子判据）/ 落点 / 粒度 R=${gate?.granularity?.R} K=${gate?.granularity?.K} / 去重 bigram≥${gate?.dedup?.threshold} / 格式`,
  `- L1 巩固域：支撑（原则≥3 痕迹 / 路径≥2 且跨会话）/ premise 硬门 / 整形 / 降格 cold+${gate?.demote?.coldDays}天 / 跨主题≥2§`,
  `- 硬门：容量 ${JSON.stringify(gate?.caps || {})} · 退出码 ${JSON.stringify(gate?.exit || {})}`,
  '',
  '## 5. M3 调参清单（按报告数字逐条决策，每项须 A/B）',
  '',
  '- [ ] 一致率偏低 → 收紧 L0 `generality`（方向指引门槛）或提高 `support` 门槛',
  '- [ ] 冲突率偏高 → 检查两域判据是否再次互借词表（应收敛到 criteria.json）',
  '- [ ] 保守度过高（拒收 >60%）→ 复核 `dedup.bigram` 阈值与格式硬门是否误杀',
  '- [ ] judgement 覆盖率低 → 强化两个 prompt 的 judgement 要求（模型侧）',
  '- [ ] 注入占比 >85% → 按 §8.1 分裂律裂节或下调 cap',
  '',
  `_生成于 ${new Date().toISOString()} · 本报告由 scripts/criteria-report.mjs 产出，勿手改_`,
  '',
].join('\n')

const outAbs = join(bank, outRel)
mkdirSync(dirname(outAbs), { recursive: true })
writeFileSync(outAbs, md, 'utf8')
try { const { unlinkSync } = await import('node:fs'); unlinkSync(tmp) } catch { /* 清理失败无害 */ }
console.log(`判据健康报告已写出：${outAbs}`)
console.log(`  对账：一致率 ${pct(audit?.metrics?.judgementResultConsistency)} · 冲突率 ${pct(audit?.metrics?.domainConflictRate)} · 保守度 ${pct(audit?.metrics?.conservatism)}`)
console.log(`  注入占比 ${(injectChars / budget * 100).toFixed(0)}% · rerank 门 ${indexRows}/${gateRows} ${indexRows >= gateRows ? '（已达）' : '（未达）'}`)
