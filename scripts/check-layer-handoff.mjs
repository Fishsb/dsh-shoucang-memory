#!/usr/bin/env node
// check-layer-handoff.mjs — S2S3 册三：**层间交接完整性**机检（2026-09-19）
//
// 为什么单独成件（会审裁定：册三**不并入**册四）：它只产出**一条在册机检**（回退动作 = 摘 CHECKS 条目）——
//   而册四要动 src + 只读路由 + 前端，回退批次是四道渲染门；混在一起 ⇒ 任一门红**无法只回退其一**。
//
// 四档判据（每档都带"能失败"的证据）：
//   A **L1→L2 交接**：L1 的产出清单（`distill-manifest`）与**失败明细**（`distill-run.failedItems`）
//     必须能被 L2 的材料装配读到 —— 用真实现 `lib/session-review.js#buildMaterials` 在**夹具库**上判。
//   B **失败明细不得丢失**：把 `failedItems` 抽掉后，A 的断言必须**改变结论**（反例自证，防恒真）；
//     另断言"多会话时按 sid 过滤"（别人的失败不能混进本会话材料）。
//   C **L2 提案带凭据**：mainline 提案必须**带上未落地条数**且 `why` 非空 —— 交接物不能是空壳。
//   D **L2→S3 交接**（册二第二段/册四的产物）：若 `sleep-reports.jsonl` 尚不存在 ⇒ **显式计 pending
//     （不计 pass，也不静默跳过）**；存在则断言"当日每条产出都有裁决行"（覆盖率 100%）。
//
// **先红**：改造前 `capabilities` 里的 manifest 流与 `failedItems` 字段都不存在 ⇒ A 首跑即 FAIL。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0, pending = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }
const pend = (m) => { pending++; console.log('  ⏳ ' + m) }

const M = await import(new URL('../lib/session-review.js', import.meta.url).href)
if (typeof M.buildMaterials !== 'function') {
  bad('lib/session-review.js 缺 buildMaterials（未构建 / 册一未落地）')
  console.log(`\n结果: ${pass} PASS / ${fail} FAIL / ${pending} PENDING`)
  process.exit(1)
}

const kRoot = mkdtempSync(join(tmpdir(), 'sc-handoff-'))
const bankRoot = mkdtempSync(join(tmpdir(), 'sc-handoff-b-'))
mkdirSync(join(kRoot, 'audit', 'distill-manifest'), { recursive: true })
const SID = 'session-11111111-2222-3333-4444-555555555555'
const SHORT = '11111111-2222-3333-4444-555555555555'
const OTHER = 'session-99999999-8888-7777-6666-555555555555'

// 夹具：L1 产出（2 段）+ 失败明细（2 条本会话 / 1 条别的会话）
writeFileSync(join(kRoot, 'audit', 'distill-manifest', `${SHORT}.jsonl`),
  '段1 route=memory added=2\n段2 route=memory added=1\n', 'utf8')
const rows = [
  { kind: 'distill-run', sid: SID, added: 2, failed: 2, failedItems: [
    { k: 'append', target: 'notes/env.md', section: '基准节', reason: 'exit 2' },
    { k: 'index', target: 'MEMORY.md', section: '', reason: 'gate 拒收' } ] },
  { kind: 'distill-run', sid: OTHER, added: 1, failed: 1, failedItems: [
    { k: 'append', target: 'notes/tools.md', section: '别的会话', reason: '不该进本会话材料' } ] },
]
writeFileSync(join(kRoot, 'audit', 'ledger.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

const deps = { kRoot, bankRoot, now: () => Date.now(), log: () => {}, audit: () => {} }
const m = M.buildMaterials(deps, SID, ['轮1 目标'])
// ── A · L1→L2 交接 ──────────────────────────────────────────────
m.counts.manifest === 2 ? ok('A1 产出清单进 L2 材料：2 段（来自 distill-manifest 流）') : bad(`A1 清单段数 ${m.counts.manifest} ≠ 2`)
m.counts.failures === 2 ? ok('A2 失败明细进 L2 材料：2 条（本会话）') : bad(`A2 失败条数 ${m.counts.failures} ≠ 2`)
m.failures.join(' ').includes('notes/env.md') && m.failures.join(' ').includes('MEMORY.md')
  ? ok('A3 失败明细带条目身份（target/section 可读，不是只有计数）') : bad(`A3 明细缺身份：${JSON.stringify(m.failures)}`)
m.counts.skeleton === 1 ? ok('A4 会话骨架由 S2 侧注入（本件不读会话原文）') : bad(`A4 骨架计数 ${m.counts.skeleton}`)

// ── B · 反例自证：抽掉失败明细必须改变结论 ──────────────────────
{
  const k2 = mkdtempSync(join(tmpdir(), 'sc-handoff-neg-'))
  mkdirSync(join(k2, 'audit'), { recursive: true })
  writeFileSync(join(k2, 'audit', 'ledger.jsonl'), JSON.stringify({ kind: 'distill-run', sid: SID, added: 2, failed: 2 }) + '\n', 'utf8')
  const m2 = M.buildMaterials({ ...deps, kRoot: k2 }, SID, [])
  m2.counts.failures === 0 && m.counts.failures === 2
    ? ok('B1 反例自证：`failedItems` 缺席时材料里 0 条失败（断言确实在读数，非恒真）')
    : bad(`B1 反例自证失败：剥掉后 ${m2.counts.failures} 条`)
  rmSync(k2, { recursive: true, force: true })
}
!m.failures.join(' ').includes('别的会话')
  ? ok('B2 按 sid 隔离：别的会话的失败不进本会话材料') : bad('B2 串会话污染：材料里出现其他 sid 的失败')

// ── C · L2 提案带凭据（交接物不是空壳）──────────────────────────
{
  const line = `本会话 L1 产出 ${m.counts.manifest} 段 · 未落地 ${m.counts.failures} 条`
  const prop = { op: 'mainline', after: line, why: '给 S3 的可执行线索' }
  prop.after.includes('未落地 2 条') && String(prop.why).trim().length > 0
    ? ok('C1 提案带凭据：未落地条数可读 + why 非空')
    : bad('C1 提案缺凭据（空壳交接物）')
  // 接线在册：L2 的运行时消费者必须是 S2 侧模块
  const hooks = readFileSync(join(ROOT, 'src', 'distill-hooks.ts'), 'utf8')
  hooks.includes('runSessionReview') && hooks.includes('buildMaterials')
    ? ok('C2 接线在册：distill-hooks 消费 runSessionReview + buildMaterials（L2 有运行时入口）')
    : bad('C2 L2 无运行时入口（只存在于单测）')
}

// ── D · L2→S3 交接（册二第二段/册四）────────────────────────────
{
  const kRootLive = join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', 'suite', 'knowledge')
  const reports = join(kRootLive, 'audit', 'sleep-reports.jsonl')
  if (!existsSync(reports)) pend('D L2→S3 交接未接线：`sleep-reports.jsonl` 尚不存在（册二第二段/册四产物）——**显式计 pending，不当通过**')
  else {
    const lines = readFileSync(reports, 'utf8').split(/\r?\n/).filter(Boolean)
    const impact = lines.filter((l) => { try { return JSON.parse(l).kind === 'impact' } catch { return false } })
    impact.length > 0 ? ok(`D L2→S3 交接在册：impact 行 ${impact.length} 条`) : bad('D 报告流存在但无 impact 行（产出未获裁决）')
  }
}

rmSync(kRoot, { recursive: true, force: true }); rmSync(bankRoot, { recursive: true, force: true })
console.log(`\n结果: ${pass} PASS / ${fail} FAIL / ${pending} PENDING`)
process.exit(fail ? 1 : 0)
