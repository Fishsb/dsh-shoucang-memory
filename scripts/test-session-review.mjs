#!/usr/bin/env node
// test-session-review.mjs — S2S3 册一：**L2 会话级复盘**行为判据（2026-09-19）
//
// 判据（四要素）：
//   ① 判据：L2 复盘必须——三态可分辨（`not-triggered`/`skipped-by-threshold`/`reviewed`）· 材料取自
//      **清单流 + 失败明细**（而非会话原文）· 提案 **append-only 且幂等**（同 op 第二次即跳过）·
//      只在真有产出时推进 `reviewedSeq`（失败不前移 = 下轮重试）· 库内**零写入**（只动提案流与状态流）。
//   ② 检查方式：直接调 `lib/session-review.js`（模块级实现，可单测）：临时 kRoot/bankRoot + 注入假复盘回调。
//   ③ 阈值：三态各 1 次命中；幂等复跑 appended=0/skipped=N；库内文件（除 `audit/session-review/` 与
//      `audit/session-review-state.jsonl`）**一个都不许新增/变化**。
//   ④ 失败退回：任一红 ⇒ 该册不得合入（L2 泄漏成"直接改库"是本册最危险的回归）。
//
// **先红**：改造前无 `session-review.ts` ⇒ 本件首跑即 FAIL（模块缺失），非恒真。
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

let M = null
try { M = await import(new URL('../lib/session-review.js', import.meta.url).href) } catch { /* 缺件下面报 */ }
if (!M || typeof M.runSessionReview !== 'function') {
  bad('lib/session-review.js 缺 runSessionReview（先红成立：改造前无此件）')
  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
  process.exit(1)
}

const mkEnv = () => {
  const kRoot = mkdtempSync(join(tmpdir(), 'sc-sr-k-'))
  const bankRoot = mkdtempSync(join(tmpdir(), 'sc-sr-b-'))
  mkdirSync(join(kRoot, 'audit', 'distill-manifest'), { recursive: true })
  mkdirSync(join(bankRoot, 'notes'), { recursive: true })
  writeFileSync(join(bankRoot, 'MEMORY.md'), '# MEMORY\n', 'utf8')
  writeFileSync(join(bankRoot, 'notes', 'env.md'), '# env\n\n## 基准节\n- 既有\n', 'utf8')
  return { kRoot, bankRoot }
}
const snapBank = (bankRoot) => {
  const out = new Map()
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      out.set(p.replace(bankRoot, ''), `${statSync(p).size}:${readFileSync(p, 'utf8').length}`)
    }
  }
  walk(bankRoot)
  return out
}
const mkDeps = (env, audits) => ({
  kRoot: env.kRoot, bankRoot: env.bankRoot,
  now: () => Date.now(),
  log: () => {},
  audit: (o) => { audits.push(o) },
})

const SID = 'session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const SHORT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const NOW = Date.now()

// ── 1 · 三态可分辨 ─────────────────────────────────────────────
{
  const env = mkEnv(); const audits = []; const d = mkDeps(env, audits)
  const idle = await M.runSessionReview(d, { sid: SID, lastActivityMs: NOW, newEntries: 9, newEvents: 9000, disposed: false }, async () => [])
  idle.state === 'not-triggered' ? ok('态①not-triggered：未到静默维且未 disposed（不烧 LLM）') : bad(`态①错：${idle.state}`)
  const skip = await M.runSessionReview(d, { sid: SID, lastActivityMs: NOW - 40 * 60000, newEntries: 0, newEvents: 0, disposed: false }, async () => [])
  skip.state === 'skipped-by-threshold' ? ok('态②skipped-by-threshold：到点但内容维不足（与"没跑"可分辨）') : bad(`态②错：${skip.state}`)
  const rev = await M.runSessionReview(d, { sid: SID, lastActivityMs: NOW - 40 * 60000, newEntries: 3, newEvents: 0, disposed: false }, async () => [{ op: 'mainline', after: '会话主线：做完了册零' }])
  rev.state === 'reviewed' && rev.appended === 1 ? ok('态③reviewed：真跑了且落 1 条提案') : bad(`态③错：state=${rev.state} appended=${rev.appended}`)
  const states = audits.map((a) => a.state)
  states.includes('not-triggered') && states.includes('skipped-by-threshold') && states.includes('reviewed')
    ? ok('审计三态齐备（漏触发 / 内容不足 / 真跑 在台账上可分辨）') : bad(`审计态不全：${JSON.stringify(states)}`)
  rmSync(env.kRoot, { recursive: true, force: true }); rmSync(env.bankRoot, { recursive: true, force: true })
}

// ── 2 · 材料 = 清单流 + 失败明细（不读会话原文）──────────────────
{
  const env = mkEnv(); const d = mkDeps(env, [])
  writeFileSync(join(env.kRoot, 'audit', 'distill-manifest', `${SHORT}.jsonl`), '段1 route=memory added=2\n段2 route=memory added=1\n', 'utf8')
  writeFileSync(join(env.kRoot, 'audit', 'ledger.jsonl'), [
    JSON.stringify({ kind: 'distill-run', sid: SID, added: 2, failed: 1, failedItems: [{ k: 'append', target: 'notes/env.md', section: '基准节', reason: 'exit 2' }] }),
    JSON.stringify({ kind: 'distill-run', sid: 'session-other', added: 1, failed: 5, failedItems: [{ k: 'append', target: 'notes/tools.md', section: 'X', reason: '不该出现' }] }),
  ].join('\n') + '\n', 'utf8')
  const m = M.buildMaterials(d, SID, ['轮1 目标', '轮2 目标'])
  m.counts.manifest === 2 ? ok('材料①：本会话清单流 2 行（来自 manifest 持久化）') : bad(`清单计数 ${m.counts.manifest}`)
  m.counts.failures === 1 && m.failures[0].includes('notes/env.md') ? ok('材料②：失败明细按 sid 过滤且带条目身份') : bad(`失败明细：${JSON.stringify(m.failures)}`)
  m.counts.skeleton === 2 ? ok('材料③：骨架由调用方（S2 侧）提供，本件不读会话原文') : bad(`骨架计数 ${m.counts.skeleton}`)
  rmSync(env.kRoot, { recursive: true, force: true }); rmSync(env.bankRoot, { recursive: true, force: true })
}

// ── 3 · 幂等（同 op 第二次即跳过）+ 库内零写入 ─────────────────────
{
  const env = mkEnv(); const d = mkDeps(env, [])
  const ops = [{ op: 'revise', target: 'notes/env.md', section: '基准节', before: '旧', after: '新' }]
  const before = snapBank(env.bankRoot)
  const r1 = M.appendProposals(d, SID, 100, ops)
  const r2 = M.appendProposals(d, SID, 100, ops)
  r1.appended === 1 && r2.appended === 0 && r2.skipped === 1
    ? ok('幂等：同 (sid, reviewedSeq, opHash) 复跑 appended=0 / skipped=1（不重复入提案流）')
    : bad(`幂等失败：r1=${JSON.stringify(r1)} r2=${JSON.stringify(r2)}`)
  const tail = readFileSync(M.proposalPathOf(env.bankRoot, SID), 'utf8').split('\n').filter(Boolean)
  tail.length === 1 && JSON.parse(tail[0]).reviewedSeq === 100 ? ok('提案行携带 (sid/reviewedSeq/opHash)，append-only 不改历史行') : bad(`提案行异常：${JSON.stringify(tail)}`)
  const after = snapBank(env.bankRoot)
  const changed = [...after.entries()].filter(([p, v]) => before.get(p) !== v)
  changed.every(([p]) => p.includes('session-review')) && !after.has('/MEMORY.md.tmp')
    ? ok('库内零写入：库文件快照未变（只新增 audit/session-review/ 提案流）')
    : bad(`库内被改动：${JSON.stringify(changed.map(([p]) => p))}`)
  rmSync(env.kRoot, { recursive: true, force: true }); rmSync(env.bankRoot, { recursive: true, force: true })
}

// ── 4 · 水位纪律：失败不前移；成功才推进 ─────────────────────────
{
  const env = mkEnv(); const audits = []; const d = mkDeps(env, audits)
  const input = { sid: SID, lastActivityMs: NOW - 40 * 60000, newEntries: 5, newEvents: 0, disposed: true }
  await M.runSessionReview(d, input, async () => { throw new Error('LLM 超时') })
  M.readReviewState(d, SID) === null ? ok('复盘失败 ⇒ reviewedSeq **不前移**（下轮重试；与 L1 同款断点续传）') : bad('失败却推进了水位')
  const okRun = await M.runSessionReview(d, input, async () => [{ op: 'mainline', after: '主线' }])
  const st = M.readReviewState(d, SID)
  st && st.reviewedSeq === okRun.reviewedSeq ? ok(`成功 ⇒ 状态推进到 reviewedSeq=${st.reviewedSeq}（末行生效）`) : bad(`状态未推进：${JSON.stringify(st)}`)
  existsSync(join(env.kRoot, 'audit', 'session-review-state.jsonl')) ? ok('状态落**自有流**（不并入 distill-watermark：那条流 sid 末行生效，会被 L1 每段一写冲掉）') : bad('状态流缺失')
  rmSync(env.kRoot, { recursive: true, force: true }); rmSync(env.bankRoot, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
