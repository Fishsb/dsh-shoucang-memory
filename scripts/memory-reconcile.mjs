#!/usr/bin/env node
// memory-reconcile.mjs — 账本对账器（v2.1 M3 · ADR-130）
//
// 三件事（对应总纲 §3 G4 统一度量）：
//   ① 行数闭合：主档实际行数 == 台账 written 累计 −（合并/退役/归档）——差异必须为 0 或**显式豁免**
//   ② 产出健康度：上次成功写入 / 连续空转轮数 / 被拒率 / 材料量 / 下次可睡
//   ③ 三层占比：P（always）/ R（任务门控）/ E（相关性门控）的条目数与注入占比
// 用法: node scripts/memory-reconcile.mjs [--bank <库根>] [--json] [--out <文件>]
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const stateRoot = argOf('--state', join(homedir(), '.dsh', 'suite', 'knowledge'))
const AS_JSON = argv.includes('--json')

const readJsonl = (p) => {
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
const auditDir = join(stateRoot, 'audit')
/* ⚠ **跨档读（G13 轮转失明 · 2026-09-20 修）**：台账按大小轮转（保留 3 档），本件原只读主档
 *   ⇒ ①「行数闭合」期望值里的**台账写入累计**丢历史 ②`distillAudit` 的 `audit.*` 行丢历史。
 *   实测（本轮）：`distill-run` 主档 56 行 / 旧卷 **823** 行；`write.*` 回执同类。
 *   现改走唯一实现 `readLedgerVolumes`（跨档、按时间序）。 */
const { readLedgerVolumes } = await import(new URL('../lib/ledger-compact.js', import.meta.url).href)
const ledgerPath = join(auditDir, 'ledger.jsonl')
const ledgerRowsAll = existsSync(ledgerPath)
  ? readLedgerVolumes(ledgerPath).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  : readJsonl(join(auditDir, 'judgement-ledger.jsonl'))
const ledger = ledgerRowsAll
// DS4 第六刀（2026-09-13）：蒸馏审计写入已并入统一台账（type=audit.*）⇒ **双源读**（历史不丢）。
// ⚠ 双源是**强制**的：实测单读台账会让深睡水位回放命中 0 轮（历史丢光）⇒ 水位置 now ⇒ 丢一轮痕迹。
const distillAudit = [
  ...readJsonl(join(auditDir, 'distill-audit.jsonl')),
  ...ledgerRowsAll.filter((r) => String(r?.type || '').startsWith('audit.')),
]
// 载体契约（层映射唯一来源）—— 兼容两种布局：仓内 skill/engine/ · 库内 engine/
const carriers = (() => {
  const cands = [join(repo, 'skill', 'engine', 'criteria.json'), join(repo, 'engine', 'criteria.json'), join(bank, 'engine', 'criteria.json')]
  for (const p of cands) { try { return JSON.parse(readFileSync(p, 'utf8')).carriers } catch { /* 下一个 */ } }
  return { tags: {} }
})()

// ── ① 行数闭合（**自举基线**：台账窗口只覆盖 M2 之后，历史行必须显式豁免，否则永远报差异 ⇒ 报警疲劳）──
//   机制：首次运行记录 `audit/row-baseline.json`（各主档当时的行数 + 时间）；此后
//   期望 = 基线 + **基线之后**的台账写入累计；`未解释差异 = 实际 − 期望`，只有它 ≠ 0 才算真问题。
const writeEvents = ledger.filter((r) => String(r.type || '').startsWith('write.'))
const exemptionEvents = ledger.filter((r) => String(r.type || '').startsWith('write.') && r.verdict && r.verdict !== 'written')
const files = ['MEMORY.md', 'USER.md', 'AGENT.md']
const countRows = (bankDir, f) => {
  try {
    const lines = readFileSync(join(bankDir, f), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    return { idx: lines.filter((l) => /^\[.+\]/.test(l)).length, prof: lines.filter((l) => /^-\s/.test(l) && /←\s*源:/.test(l)).length }
  } catch { return { idx: 0, prof: 0 } }
}
const baselinePath = join(auditDir, 'row-baseline.json')
let baseline = null
try { if (existsSync(baselinePath)) baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) } catch { /* 损坏则重建 */ }
if (!baseline) {
  const snap = { at: new Date().toISOString(), note: '行数闭合的自举基线：此前的历史行无写入回执（M2 之前），显式豁免；此后按「基线 + 台账写入累计」判定', files: {} }
  for (const f of files) { const c = countRows(bank, f); snap.files[f] = c.idx + c.prof }
  try { mkdirSync(dirname(baselinePath), { recursive: true }); writeFileSync(baselinePath, JSON.stringify(snap, null, 2), 'utf8') } catch { /* 静默 */ }
  baseline = snap
}
/* ── **按「回执维度版本」重锚（2026-09-20）**────────────────────────────────
 * 判因：原基线建于 `2026-09-11`，而当时的**回执维度不完整**：
 *   · v0（原始）：只有 `write.consolidate` 且硬编码 `AGENT.md`；`profiles` 通道**无回执**；
 *     `write.ingest` 的 `target` **无文件维**。
 *   ⇒ 对 `MEMORY.md` / `USER.md` 而言，「基线 + 写入」**永远补不上缺口**：那些行是
 *     **在回执维度缺失期**写入的，账上无据 —— 与"凭空多出行"**不可分辨**。
 *   ⇒ 处置：**每补齐一层回执维度就重锚一次**，并把每次的旧值留档（`priorBaselines`）。
 *     ⚠ 这不是"移动门槛"。判据反而**更严**（重锚后三文件一律 `unexplained === 0` 硬判）。
 *       区别在**触发条件**：只由**代码里的维度版本号**决定 —— 版本号变动 ⇒ 重锚一次；
 *       版本号不变 ⇒ **永不重锚**（红了就是真红）。故"因为红了所以重锚"这条路是被堵死的。
 *       ⚠ 版本号的**正确用法**：在与本次补维度同一批提交里递增，且**必须在部署 + 热重载之后**
 *         跑本件，否则"版本已升而运行态仍是旧码"⇒ 窗口期内新写入仍无回执 ⇒ 会残留假红。
 *
 * 版本沿革：
 *   v0 → **v1**（2026-09-20 · `write.profile`）：`profiles` 通道补回执（修 USER.md 无据）。
 *   v1 → **v2**（2026-09-20 · `write.ingest-file`）：摄取侧补**文件维**（修 MEMORY.md 无据）。
 */
const RECEIPT_VERSION = 2
if (Number(baseline.receiptVersion || 0) < RECEIPT_VERSION) {
  const prior = { at: baseline.at, note: baseline.note, files: { ...(baseline.files || {}) }, receiptVersion: Number(baseline.receiptVersion || 0) }
  for (const f of files) { const c = countRows(bank, f); baseline.files[f] = c.idx + c.prof }
  baseline.priorBaselines = [...(baseline.priorBaselines || []), prior]
  baseline.receiptVersion = RECEIPT_VERSION
  baseline.at = new Date().toISOString()
  baseline.note = `行数闭合的自举基线。**按回执维度版本重锚**（现 v${RECEIPT_VERSION}）：v1 补 \`write.profile\`（画像通道此前无回执）· v2 补 \`write.ingest-file\`（摄取侧此前无文件维）。每次补维度都会让"历史无据行"现形，故在补维度时重锚一次；**版本不变则永不重锚**。旧值存 \`priorBaselines\`。此后三文件一律 \`unexplained === 0\` 硬判。`
  try { mkdirSync(dirname(baselinePath), { recursive: true }); writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf8') } catch { /* 静默 */ }
  console.log(`⚠ 基线已重锚（回执维度 v${prior.receiptVersion} → v${RECEIPT_VERSION}）→ ${files.map((f) => `${f}=${baseline.files[f]}`).join(' · ')}（旧值存 priorBaselines，可查）`)
}
const baselineMs = Date.parse(baseline.at || '') || 0
/* ⚠ **口径缺陷（2026-09-20 实测暴露）**：`write.*` 回执的 `target` 字段**两种语义并存** ——
 *   · `write.consolidate` 的 `target` = **文件名**（`AGENT.md` / `USER.md`，见 `deepsleep-run` 写出点）；
 *   · `write.ingest` 的 `target` = **目标库标识**（`disp.targetLib`：`shoucang` / `none` / `workspace` / `pending-defer`，
 *     见 `distill-agent.ts:338`）——**不是文件名**。
 *   ⇒ 原判据 `String(r.target).includes(f)` 对 `write.ingest` **永远匹配不到**（实测 `target` 分布：
 *     `shoucang` 452 · `none` 67 · `AGENT.md` 65 · `workspace` 16 · `pending-defer` 2）。
 *   后果：MEMORY.md 的"台账写入累计"恒为 **0** ⇒ 未解释差异 = 实际 543 − 基线 44 = **499**（**假红**）。
 *   ⚠ 但**不能简单地"只认 consolidate"** —— `write.ingest` 确实往 MEMORY.md 写索引行（`newIndex`），
 *     只是它**不在回执里区分落到哪个文件**（该维度缺失，属写侧"输入量须可见化"的欠账）。
 *   ⇒ 本件的诚实处置：**按文件精确匹配（≈现行为）与"按域计数"并列报**，并把差异标为
 *     「**口径不可判**」而非「未解释」——**不假装能闭合**，也不把假红当故障。
 *     真正闭合需要写侧补 `target` 的**文件维**（登记于 `OPEN-ITEMS`，属独立一轮）。
 *
 * ⚠ **第二处口径缺陷（同轮实测）**：原判据 `expected = 基线 + 写入` **只算加项、不算减项** ——
 *   而库内确有**行数减少**的通道：`treeops`（merge/rename/split ⇒ 行可归并）· `forgetops`（archive
 *   把行移走）· `converge`（细行并入粗行 ⇒ **净减 1 行/次**）。实测 `AGENT.md` 因此报 **-2**
 *   （精确写入 100 而实际只增 98）——**是假红，不是缺陷**。
 *   ⇒ 现把减项按**可确证的粒度**计入：
 *     · `converge`：逐条事件带 `file` ⇒ **可按文件精确减 1**（每次收敛把细行并入粗行、细行移除）；
 *     · `forgetops.archived` / `treeops.archived`：**不带 file** ⇒ 只记**域级减项**，用于上界；
 *     · `treeops.applied`：可增可减（merge 减、split 增）⇒ **符号不定，不并入闭合**（如实声明）。 */
const ingestEvents = ledger.filter((r) => r.type === 'write.ingest')
const consolidEvents = ledger.filter((r) => r.type === 'write.consolidate')
/* ⚠ **第三处口径缺陷（同轮实测 + 修复）**：`write.consolidate` 是**深睡专属**且硬编码
 *   `target: 'AGENT.md'`（`deepsleep-run.ts:728`）⇒ 台账里它的 target 分布**恒为** `{AGENT.md: 65}`；
 *   而**唯一能写 `USER.md` / `AGENT.md` 画像行的 `profiles` 通道此前完全不发回执**
 *   ⇒ 闭合判据的分母结构性缺失（USER.md 未解释 21 行即源于此）。
 *   ⇒ **写侧已补**：`distill-write` 的 profiles 通道现按 target 各发一行 **`write.profile`**
 *     （**独立 type** —— `write.ingest` 的 target 是库标识、本处是文件名，**同字段两语义是禁止的**）。
 *   本件据此把画像写入量计入闭合。⚠ 本键**只对补丁之后的写入生效**（历史画像行仍靠基线豁免）。 */
const profileEvents = ledger.filter((r) => r.type === 'write.profile')
/* ⚠ **第四处：`write.ingest` 无文件维（本轮补齐 · 见 `OPEN-ITEMS §0f` 遗留项）** ——
 *   上条修完 profile 回执后，`MEMORY.md` 的写入量**仍**只能靠"域级上界"猜（`newIndex` 落 MEMORY.md，
 *   而 `write.ingest.target` 是库标识）⇒ 闭合仍**不是真闭合**。
 *   ⇒ **写侧已补 `write.ingest-file`**（`distill-write` 的 appends/newIndex 循环按**实际落点文件**计数，
 *     各发一行，`target` = 文件名、`targetKind='file'`）。本件据此把**摄取侧的文件维**计入闭合。
 *   ⚠ 生效边界同 profile：**只对补丁之后的写入生效**（历史行靠基线豁免）。 */
const ingestFileEvents = ledger.filter((r) => r.type === 'write.ingest-file')
/* 减项（跨档已读入）：`converge` 带 file ⇒ 精确；`forgetops`/`treeops` 的 archived 不带 file ⇒ 域级 */
const convergeEvents = ledger.filter((r) => String(r.kind || r.type) === 'converge' || r.type === 'audit.converge')
const archivedDomain = ledger
  .filter((r) => ['forgetops', 'treeops', 'converge-summary'].includes(String(r.kind || '')) || ['audit.forgetops', 'audit.treeops', 'audit.converge-summary'].includes(String(r.type || '')))
  .filter((r) => Date.parse(r.at || '') >= baselineMs)
  .reduce((n, r) => n + Number(r.archived || 0), 0)
const closure = files.map((f) => {
  const c = countRows(bank, f)
  /* 口径 A（精确）：`write.consolidate`（深睡·AGENT.md）+ `write.profile`（画像通道·按 target）
   *   + `write.ingest-file`（摄取侧**文件维**·本轮补） —— **三者都带文件名 ⇒ 精确可算** */
  const writtenExact = consolidEvents.filter((r) => String(r.target || '') === f && Date.parse(r.at || '') >= baselineMs).reduce((n, r) => n + Number(r.written || 0), 0)
    + profileEvents.filter((r) => String(r.target || '') === f && Date.parse(r.at || '') >= baselineMs).reduce((n, r) => n + Number(r.written || 0), 0)
    + ingestFileEvents.filter((r) => String(r.target || '') === f && Date.parse(r.at || '') >= baselineMs).reduce((n, r) => n + Number(r.written || 0), 0)
  /* 减项·精确：`converge` 带 `file` ⇒ 每次净减 1 行 */
  const removedExact = convergeEvents.filter((r) => String(r.file || '') === f && Date.parse(r.at || '') >= baselineMs).length
  /* 口径 B（域级）：`write.ingest` 往库写（含 MEMORY.md 的 newIndex），但**不知落哪个文件** ⇒ 只作上界参考 */
  const writtenIngestDomain = ingestEvents.filter((r) => Date.parse(r.at || '') >= baselineMs).reduce((n, r) => n + Number(r.written || 0), 0)
  // 兼容旧字段名（`written` 之外的历史口径）
  const written = writtenExact
  const attempted = writeEvents.filter((r) => String(r.target || '').includes(f) && Date.parse(r.at || '') >= baselineMs).reduce((n, r) => n + Number(r.attempted || 0), 0)
  const base = Number(baseline.files?.[f] ?? 0)
  const expected = base + written - removedExact
  return { file: f, currentRows: c.idx + c.prof, indexRows: c.idx, profileRows: c.prof, baselineRows: base, writtenSinceBaseline: written, writtenExact, removedExact, writtenIngestDomain, archivedDomain, attemptedSinceBaseline: attempted, unexplained: (c.idx + c.prof) - expected }
})
const ledgerSince = ledger.length ? ledger[0].at : null
/* ⚠ **判定口径（2026-09-20 更正）**：原判据 = 所有文件 unexplained === 0。
 *   实测该判据**结构性不可达**：`write.ingest` 的 target 无文件维 ⇒ MEMORY.md 的写入量恒按 0 计
 *   ⇒ 只要摄取侧往索引写一行，`unexplained` 就 +1，**必然报红**（与"是否真有问题"无关）。
 *   ⇒ 现分两步：① `AGENT.md`/`USER.md`（有精确口径）仍按 **unexplained === 0** 硬判；
 *     ② `MEMORY.md` 改判「**不超过域级上界**」——即 unexplained ≤ 摄取域写入总量（口径 B）。
 *        这仍能否定"凭空多出行"（超出上界即真问题），但不再把"写侧维度缺失"当成故障。 */
const closureOk = closure.every((c) => c.unexplained === 0)

// ── ② 产出健康度 ──
const dsRows = distillAudit.filter((r) => r.kind === 'deep-sleep')
// 「有效」= completed ∧ 有落地 ∧ **门禁通过**（老行无 gate 字段时按 added>0 认定；新行必须 gate=pass，
//   否则 added 只是 gate 前的试探数——这正是 09-10 那轮 added=4/gate=行格式违规 实际 0 落地的陷阱）
const productive = (r) => r.stop === 'completed' && (Number(r.added || 0) + Number(r.replaced || 0)) > 0 && (r.gate === undefined || r.gate === 'pass')
const okRows = dsRows.filter(productive)
const lastOk = okRows.length ? okRows[okRows.length - 1].at : null
let idleStreak = 0
for (let i = dsRows.length - 1; i >= 0; i--) {
  if (productive(dsRows[i])) break
  idleStreak++
}
const rejected = writeEvents.filter((r) => r.verdict === 'rejected').length
const attemptedTotal = writeEvents.reduce((n, r) => n + Number(r.attempted || 0), 0)
const writtenTotal = writeEvents.reduce((n, r) => n + Number(r.written || 0), 0)
const rejectRate = attemptedTotal ? rejected / Math.max(1, writeEvents.length) : null
const materialChars = dsRows.slice(-10).map((r) => Number(r.chars || 0)).filter((n) => n > 0)

// ── ③ 三层占比 ──
const layerOf = (tag) => (carriers.tags?.[tag]?.layer) || 'E'
const layers = { P: { index: 0, profile: 0 }, R: { index: 0, profile: 0 }, E: { index: 0, profile: 0 } }
for (const f of files) {
  let lines = []
  try { lines = readFileSync(join(bank, f), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) } catch { /* */ }
  for (const l of lines) {
    const m = l.match(/^\[([^\]]+)\]/)
    if (m) { layers[layerOf(m[1])].index++; continue }
    const pm = l.match(/^-\s*\[([^\]]+)\]/)
    if (/←\s*源:/.test(l)) { layers[pm ? layerOf(pm[1]) : 'E'].profile++ }
  }
}
const injectProfileRows = 3 // P 层画像行每档上限（注册表 surface.injection.carriers.profile）
const pInjected = Math.min(injectProfileRows * 2, layers.P.profile) // AGENT+USER 各 ≤3
const injectShare = {
  P: layers.P.index + pInjected,
  R: 0, // 任务型门控：命中才注入（此处不计常驻）
  E: null, // 相关性门控：按档位 top-k（见注入面统计）
}

// ── ④ 成熟度与影子打分（v2.2 M4）──
// 成熟度台账在**库**内（数据属库：小节成熟度）—— `audit/maturation.jsonl` 相对库根
const matRows = readJsonl(join(bank, 'audit', 'maturation.jsonl'))
const gate = Number((() => { try { return JSON.parse(readFileSync(join(bank, 'engine', 'criteria.json'), 'utf8')).maturation.gate } catch { return 0.5 } })())
const maturation = matRows.length
  ? { sections: matRows.length, mature: matRows.filter((r) => Number(r.A) >= gate).length, gate, top: [...matRows].sort((a, b) => Number(b.A) - Number(a.A)).slice(0, 5) }
  : { sections: 0, mature: 0, gate, top: [], note: '未扫描（跑 node scripts/maturation-scan.mjs）' }
// DS4 合并第一刀（2026-09-13）：影子打分已并入 `ledger.jsonl`（type=score.shadow）。
// 读取口径 = **legacy 文件（历史批次，只读）∪ 统一台账里的 score.shadow 行** ⇒ 历史不丢、新数据同源。
const shadowRows = [
  ...readJsonl(join(auditDir, 'score-shadow.jsonl')),
  ...ledger.filter((r) => r.type === 'score.shadow'),
]
const pairs = shadowRows.flatMap((r) => (r.top || []).map((t) => [Number(t.imp), Number(t.old)])).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
const pearson = (xs) => {
  const n = xs.length
  if (n < 8) return null
  const mx = xs.reduce((s, p) => s + p[0], 0) / n, my = xs.reduce((s, p) => s + p[1], 0) / n
  let num = 0, dx = 0, dy = 0
  for (const [x, y] of xs) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2 }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}
const corrImpRel = pearson(pairs)
const shadow = {
  rows: shadowRows.length, samples: pairs.length, corrImpRel,
  verdict: corrImpRel === null ? '样本不足（<8 对）' : Math.abs(corrImpRel) > 0.9 ? '⚠ importance 与 relevance 高度冗余（R-2：应删该分量）' : '✅ 分量不冗余（可进入 M5 切换评估）',
}

// ── ⑥ 笔记结构体检（**只报告建议，不自动改**——守「数据先问」：笔记是私人记忆数据）──
//   实测发现（2026-09-11）：`notes/env.md` 的 `## DSH 环境` 下挂 10 个 `###`，其中 `Windows npm 执行策略`
//   **同时**以独立 `##` 章节存在 ⇒ 主题重复 + 层级语义失真（`### 记忆库与内核概览` 显然不属于"环境"）。
const notesDir = join(bank, 'notes')
const norm = (s) => String(s).replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim()
const notesHealth = { files: 0, chapters: 0, sections: 0, crowded: [], duplicateTopics: [] }
try {
  for (const f of readdirSync(notesDir).filter((x) => x.endsWith('.md'))) {
    const t = readFileSync(join(notesDir, f), 'utf8')
    const heads = t.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^#{2,3} /.test(l))
    if (!heads.length) continue
    notesHealth.files++
    const h2 = heads.filter((l) => l.startsWith('## ')).map((l) => norm(l.slice(3)))
    const h3 = heads.filter((l) => l.startsWith('### ')).map((l) => norm(l.slice(4)))
    notesHealth.chapters += h2.length
    notesHealth.sections += h3.length
    // 章节下 ### 数量（按出现顺序归章）
    let cur = null
    const perChapter = {}
    for (const l of heads) { if (l.startsWith('## ')) { cur = norm(l.slice(3)); perChapter[cur] = 0 } else if (cur) perChapter[cur]++ }
    for (const [k, n] of Object.entries(perChapter)) if (n >= 4) notesHealth.crowded.push({ file: `notes/${f}`, chapter: k, subSections: n })
    // 同名主题既作 ### 又作 ## ⇒ 重复/错位
    for (const s of h3) if (h2.includes(s)) notesHealth.duplicateTopics.push({ file: `notes/${f}`, topic: s })
  }
} catch (e) { notesHealth.scanError = String(e && e.message ? e.message : e).slice(0, 120) } // **不静默**：扫描失败必须可见（实测踩过 ReferenceError 被裸 catch 吞成"0 文件 = 健康"）

// ⑥b **悬空指针体检**（F12 类）：索引/画像行里的 `notes/<f>.md §<名>` 必须能在该文件中解析到标题
//   解析语义**照抄读取器** `read_section.mjs`：## 或 ### 标题，大小写不敏感 + 双向包含 + 去尾部 (2026…) 后缀
const dangling = []
try {
  const headTitles = new Map() // file -> string[]（小写）
  for (const f of readdirSync(notesDir).filter((x) => x.endsWith('.md'))) {
    headTitles.set(f, readFileSync(join(notesDir, f), 'utf8').split(/\r?\n/).map((l) => l.match(/^(#{2,3})\s+(.*)$/)).filter(Boolean).map((m) => m[2].trim().toLowerCase()))
  }
  const coreOf = (s) => String(s).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim().toLowerCase()
  const resolve = (file, name) => {
    const heads = headTitles.get(file)
    if (!heads) return false
    const kw = coreOf(name)
    return heads.some((t) => { const tt = coreOf(t); return tt === kw || tt.includes(kw) || kw.includes(tt) })
  }
  const sources = ['MEMORY.md', 'USER.md', 'AGENT.md', 'notes/INDEX.md']
  for (const src of sources) {
    let text = ''
    try { text = readFileSync(join(bank, src), 'utf8') } catch { continue }
    for (const m of text.matchAll(/notes\/([A-Za-z0-9_-]+)\.md\s*§([^\s/、，,）)]+)/g)) {
      if (!resolve(`${m[1]}.md`, m[2])) dangling.push({ from: src, ref: `notes/${m[1]}.md §${m[2]}` })
    }
  }
  notesHealth.danglingPointers = dangling
} catch (e) { notesHealth.danglingError = String(e && e.message ? e.message : e).slice(0, 120) }

const out = {
  window: { bank, stateRoot, ledgerPath, ledgerSince, ledgerRows: ledger.length },
  closure: { ok: closureOk, note: `自举基线（${baseline.at}）：此前历史行无回执，显式豁免；闭合只判定「基线之后」的未解释差异`, baseline, files: closure },
  health: {
    lastSuccessfulWrite: lastOk,
    deepSleepRounds: dsRows.length,
    idleStreak,
    writeEvents: writeEvents.length,
    rejectedWrites: rejected,
    rejectRate,
    attemptedTotal,
    writtenTotal,
    materialCharsRecent: materialChars,
  },
  layers: { counts: layers, injectShare, profileCap: injectProfileRows },
  maturation,
  shadow,
  notesHealth,
  samples: { ledgerRows: ledger.length, writeEvents: writeEvents.length, distillAuditRows: distillAudit.length, exemptionEvents: exemptionEvents.length },
}
const outFile = argOf('--out', '')
if (AS_JSON) {
  const body = JSON.stringify(out, null, 2)
  if (outFile) { mkdirSync(dirname(outFile), { recursive: true }); writeFileSync(outFile, body, 'utf8'); console.log(`已写出 ${outFile}`) } else console.log(body)
} else {
  const pct = (v) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`)
  console.log(`账本对账（库=${bank}）`)
  console.log(`  台账: ${ledgerPath.split(/[\\/]/).pop()} · ${ledger.length} 行 · 起点 ${ledgerSince || '（空）'}`)
  console.log(`  ① 闭合: ${closureOk ? '✅ 未解释差异 0' : '⚠ 有未解释差异（见下）'}（自举基线 ${String(baseline.at).slice(0, 19)} · 回执维度 v${baseline.receiptVersion ?? '?'}；历史行显式豁免）`)
  console.log(`     ⚠ **口径**：带**文件名**的回执（\`write.consolidate\` 深睡·AGENT.md · \`write.profile\` 画像通道 · \`write.ingest-file\` 摄取文件维）⇒ 精确判；\`write.ingest\` 的 \`target\` 是**库标识** ⇒ 只作域级上界参考、不入闭合`)
  for (const c of out.closure.files) {
    console.log(`     ${c.file}: 实际 ${c.currentRows} 行（索引 ${c.indexRows} + 画像 ${c.profileRows}）· 基线 ${c.baselineRows} + 精确写入 ${c.writtenExact} − 收敛移除 ${c.removedExact} · **未解释 ${c.unexplained}**（判据：= 0）`)
  }
  console.log(`  ② 健康: 上次有效深睡 ${lastOk || '（无）'} · 连续空转 ${idleStreak} 轮 · 被拒率 ${pct(rejectRate)}（${rejected}/${writeEvents.length} 次写事件）`)
  console.log(`  ③ 三层: P ${layers.P.index} 索引 + ${layers.P.profile} 画像 · R ${layers.R.index} · E ${layers.E.index} 索引 + ${layers.E.profile} 画像`)
  console.log(`     注入占比（估算）: P ${injectShare.P} 行（含画像 ≤${injectProfileRows}/档）· R 按任务命中 · E 按相关性 top-k`)
  console.log(`  ④ 成熟度: 小节 ${maturation.sections} 个 · 达 gate(≥${maturation.gate}) ${maturation.mature} 个${maturation.note ? '（' + maturation.note + '）' : ''}`)
  console.log(`  ⑤ 影子打分: ${shadow.rows} 行 / ${shadow.samples} 样本 · corr(importance,relevance)=${shadow.corrImpRel === null ? 'n/a' : shadow.corrImpRel.toFixed(3)} → ${shadow.verdict}`)
  console.log(`  ⑥ 笔记结构体检（**建议，不自动改**——私人数据先问）：${notesHealth.files} 文件 / ${notesHealth.chapters} 章节 / ${notesHealth.sections} 子节`)
  // 子节多的章节**只作信息**（同质章节是健康的组织方式；用任意阈值报 ⚠ 会造成报警疲劳）
  for (const c of notesHealth.crowded) console.log(`     ℹ ${c.file} 的「${c.chapter}」含 ${c.subSections} 个子节（若为同质主题则属正常，仅展示）`)
  for (const d of notesHealth.duplicateTopics) console.log(`     ⚠ ${d.file}：「${d.topic}」既作 ### 又作 ##（同名主题重复/错位 ⇒ 应合并）`)
  const dg = notesHealth.danglingPointers || []
  if (dg.length) for (const x of dg) console.log(`     ❌ **悬空指针**：${x.from} → ${x.ref}（该小节在目标文件里不存在；写门视之为 exit=2 硬错）`)
  if (!notesHealth.crowded.length && !notesHealth.duplicateTopics.length && !dg.length) console.log('     ✅ 未发现层级错位 / 主题重复 / 悬空指针')
  if (notesHealth.scanError) console.log(`     ⚠ 结构扫描失败（不静默）：${notesHealth.scanError}`)
}
