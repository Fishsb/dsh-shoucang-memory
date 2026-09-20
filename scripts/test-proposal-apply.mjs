#!/usr/bin/env node
// test-proposal-apply.mjs — S2S3 册二「执行 L2 提案」判据（G3 的执行面 · 2026-09-19）
//
// 判据（四要素）：
//   ① 判据：L2 提案流**有人消费且只由 S3 消费**；执行必须 ① **默认关闭**（不设开关 ⇒ 零写入）
//      ② **先留档再改**（rollback 文件含被改行原文）③ **幂等**（复跑 no-op）④ 逐条裁决可见（不静默跳过）
//      ⑤ 目标路径**必须在库根内**（路径穿越拒执行）。
//   ② 检查方式：真调 `lib/proposal-apply.js`（夹具库 + 真提案流），改后**读回文件**对比。
//   ③ 阈值：改前改后逐字节可辨；`before` 命中 0/多次 ⇒ 一律跳过；越界路径 ⇒ 跳过。
//   ④ 失败退回：任一红 ⇒ 本项不得合入（它直接决定"L2 提案能不能执行"）。
//
// **先红**：本件在"未接线"（`deepsleep-run` 无 import/调用/开关）与"无幂等键"两种半成品下必红。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

let M = null
try { M = await import(new URL('../lib/proposal-apply.js', import.meta.url).href) } catch { /* 缺件 */ }
if (!M || typeof M.applySessionProposals !== 'function') {
  console.log('  ❌ lib/proposal-apply.js 缺 applySessionProposals（先跑 npm run build:host）')
  console.log(`\n结果: ${pass} PASS / ${fail + 1} FAIL`); process.exit(1)
}

/* ── A 静态：接线点（**先红**：改造前 `proposal-apply` 无人 import） ── */
{
  const src = readFileSync(join(ROOT, 'src', 'deepsleep-run.ts'), 'utf8')
  const importOk = /import \{[^}]*applySessionProposals[^}]*\} from '\.\/proposal-apply\.js'/.test(src)
  importOk
    ? ok('A1 断链已接：`deepsleep-run` import 了 `applySessionProposals`（S3 侧唯一消费者）') : bad('A1 未接线（L2 提案流无消费者 ⇒ G3 执行面仍空）')
  src.includes('applySessionProposals({') ? ok('A2 不只是 import：源码确有调用点（同步函数，无 await）') : bad('A2 只 import 未调用')
  src.includes('SHOUCANG_PROPOSAL_APPLY') ? ok('A3 默认关闭：执行需显式 `SHOUCANG_PROPOSAL_APPLY=1`') : bad('A3 无显式开关 ⇒ 接上即改用户库')
}

/* ── B 行为：真调（默认关闭 / 执行 / 幂等 / 陈旧 / 越界 / 未实现 op） ── */
const bank = mkdtempSync(join(tmpdir(), 'sc-proposal-'))
mkdirSync(join(bank, 'notes'), { recursive: true })
mkdirSync(join(bank, 'audit', 'session-review'), { recursive: true })
const FILE = join(bank, 'notes', 'env.md')
const writeNotes = (extra) => writeFileSync(FILE, ['# env', '', '## 节甲', '- OLD-LINE', extra || '', ''].join('\n'), 'utf8')
writeNotes()
const P = (over) => JSON.stringify({ at: 'T', sid: 'SID1', reviewedSeq: 1, opHash: 'h-' + Math.random().toString(36).slice(2, 8), op: 'revise', target: 'notes/env.md', section: '节甲', before: '- OLD-LINE', after: '- NEW-LINE', ...over })
const propsFile = join(bank, 'audit', 'session-review', 'proposals-SID1.jsonl')
const good = P({ opHash: 'h1' })
const outside = P({ opHash: 'h2', target: '../outside.md', before: '- OLD-LINE', after: '- X' })
const unsupported = P({ opHash: 'h3', op: 'merge', target: 'notes/env.md' })
writeFileSync(propsFile, [good, outside, unsupported].join('\n') + '\n', 'utf8')
const logs = [], audits = []
const D = (enabled) => ({ bankRoot: bank, log: (m) => logs.push(m), audit: (o) => audits.push(o), enabled })

// ① 默认关闭 ⇒ 零写入、零账、零留档
{
  const r = M.applySessionProposals(D(false))
  const unchanged = readFileSync(FILE, 'utf8').includes('- OLD-LINE')
  const noLedger = !existsSync(M.appliedLedgerOf(bank))
  r.applied === 0 && r.ran === false && unchanged && noLedger
    ? ok('B1 默认关闭：零写入 + 零应用账 + 零留档（"接线上线、启用须显式"）') : bad(`B1 ${JSON.stringify({ applied: r.applied, ran: r.ran, unchanged, noLedger })}`)
}
// ② 显式开启 ⇒ 逐字命中 ⇒ 改写 + 留档 + 账
{
  const r = M.applySessionProposals(D(true))
  const after = readFileSync(FILE, 'utf8')
  const rb = existsSync(M.rollbackDirOf(bank)) ? readdirSync(M.rollbackDirOf(bank)) : []
  const rbText = rb.length ? readFileSync(join(M.rollbackDirOf(bank), rb[0]), 'utf8') : ''
  const ledger = existsSync(M.appliedLedgerOf(bank)) ? readFileSync(M.appliedLedgerOf(bank), 'utf8').trim().split('\n').filter(Boolean) : []
  r.applied === 1 && after.includes('- NEW-LINE') && !after.includes('- OLD-LINE') && rb.length === 1 && rbText.includes('- OLD-LINE') && ledger.length === 1
    ? ok(`B2 执行面成立：命中⇒改写（OLD→NEW）+ 留档含原文（${rb.length} 份）+ 应用账 1 行（**可还原**不是口头的）`)
    : bad(`B2 ${JSON.stringify({ applied: r.applied, after: after.includes('- NEW-LINE'), rollback: rb.length, rbHasOld: rbText.includes('- OLD-LINE'), ledger: ledger.length })}`)
  const v = r.verdicts || []
  v.length === 3 && v.some((x) => x.verdict === 'skipped' && x.reason === 'path-outside-bank') && v.some((x) => x.verdict === 'skipped' && /尚未实现/.test(x.reason))
    ? ok('B3 逐条裁决可见：越界路径 ⇒ `path-outside-bank` · 未实现 op（merge）⇒ **显式理由**（不静默跳过）')
    : bad(`B3 verdicts=${JSON.stringify(v)}`)
}
// ③ 复跑 ⇒ 幂等 no-op
{
  const before = readFileSync(FILE, 'utf8')
  const r = M.applySessionProposals(D(true))
  const after = readFileSync(FILE, 'utf8')
  r.applied === 0 && before === after
    ? ok('B4 幂等：同一批提案复跑 ⇒ `applied=0` 且文件逐字节不变（`(sid,opHash)` 账生效；未支持 op 仍逐条留理由）')
    : bad(`B4 ${JSON.stringify({ applied: r.applied, skipped: r.skipped, same: before === after })}`)
}
// ④ 陈旧提案（before 已不在文件里）⇒ 跳过 + 理由
{
  // 库已变：OLD-LINE 不复存在（**不能用 writeNotes**——那个夹具恒含 OLD-LINE）
  writeFileSync(FILE, ['# env', '', '## 节甲', '- OTHER', ''].join('\n'), 'utf8')
  writeFileSync(propsFile, P({ opHash: 'h9', before: '- OLD-LINE', after: '- Y' }) + '\n', 'utf8')
  const r = M.applySessionProposals(D(true))
  const v = (r.verdicts || [])[0] || {}
  r.applied === 0 && /陈旧提案/.test(String(v.reason))
    ? ok('B5 陈旧提案：`before` 逐字未命中 ⇒ 跳过并记「陈旧提案」（**不做模糊匹配** = 不误改）')
    : bad(`B5 ${JSON.stringify({ applied: r.applied, reason: v.reason })}`)
}
// ⑤ 歧义（before 命中多处）⇒ 跳过（唯一性判据）
{
  writeFileSync(FILE, ['# env', '', '## 节甲', '- DUP', '- DUP', ''].join('\n'), 'utf8')
  writeFileSync(propsFile, P({ opHash: 'h10', before: '- DUP', after: '- Z' }) + '\n', 'utf8')
  const r = M.applySessionProposals(D(true))
  const v = (r.verdicts || [])[0] || {}
  r.applied === 0 && /歧义/.test(String(v.reason))
    ? ok('B6 歧义拒改：`before` 命中多处 ⇒ 跳过（唯一性先于便利）') : bad(`B6 ${JSON.stringify({ applied: r.applied, reason: v.reason })}`)
}
rmSync(bank, { recursive: true, force: true })

/* ── 册二（2026-09-20）：`op='settle'` **承诺结算**执行面 ───────────────────────────────
 *  判据同 revise 四要素（默认关闭 / 逐字唯一 / 先留档 / 幂等），额外两条本册专属：
 *    ① **只结不建**（提案试图新增/删除承诺 ⇒ 拒）；② **证据门在册一**（执行面不重复实现判据）。 */
console.log('  ── C. 册二：承诺结算执行面（`op=settle`） ──')
{
  const S = await import(new URL('../lib/record-store.js', import.meta.url).href)
  const H = await import(new URL('../lib/record-shadow.js', import.meta.url).href)
  const E = await import(new URL('../lib/ring-events.js', import.meta.url).href)

  const bank2 = mkdtempSync(join(tmpdir(), 'sc-settle-'))
  mkdirSync(join(bank2, 'audit', 'session-review'), { recursive: true })
  const props = join(bank2, 'audit', 'session-review', 'proposals-s1.jsonl')
  const AT = '2026-09-20T10:00:00.000Z'
  /** 造库：一条 pending 承诺（**无 md 投影**，环记录形态）。
   *  ⚠ **必须连同 `commitment.open` 一起造**（用 `eventsFromDiff([], [rec])` 补发创建事件）——
   *    真机里承诺是 `ring-commit` 开的（事件流里必然先有 open）；只造 store 不造事件
   *    会让 C2′ 的对账**结构性红**，那是**夹具失真**不是真缺陷（同一坑：`test-fact-ring` §I 的边界注释）。 */
  const mkBank = () => {
    const rec = S.stampRecord(S.makeRecord({
      id: 'commitment:c1', kind: 'commitment', file: '', text: '[承诺] 我欠 用户：先出迁移路径',
      meta: { who: '用户', what: '先出迁移路径', direction: 'owed-by-me', status: 'pending' },
    }), AT)
    H.saveStoreRecords(bank2, [rec])
    const evPath0 = join(bank2, '.records', 'ring-events.jsonl')
    mkdirSync(join(bank2, '.records'), { recursive: true })
    writeFileSync(evPath0, E.serializeEvents(E.eventsFromDiff([], [rec], AT, 1)), 'utf8')
    return rec
  }
  const D2 = (enabled) => ({ bankRoot: bank2, log: () => { }, audit: () => { }, enabled })
  const P2 = (o) => JSON.stringify({ sid: 's1', op: 'settle', ...o })
  const readStatus = () => H.loadStore(bank2).records.find((x) => x.id === 'commitment:c1').meta.status

  // C1 **默认关闭**：不设 enabled ⇒ 零写入（记录与事件流**逐字节不变**）
  {
    const rec = mkBank()
    const evPath0 = join(bank2, '.records', 'ring-events.jsonl')
    const evBefore = readFileSync(evPath0, 'utf8')
    const stBefore = readFileSync(join(bank2, '.records', 'records.jsonl'), 'utf8')
    writeFileSync(props, P2({ opHash: 's1', before: rec.text, after: 'kept', evidence: '交付物已存在' }) + '\n', 'utf8')
    const r = M.applySessionProposals(D2(false))
    r.applied === 0 && readStatus() === 'pending'
      && readFileSync(join(bank2, '.records', 'records.jsonl'), 'utf8') === stBefore
      && readFileSync(evPath0, 'utf8') === evBefore
      ? ok('C1 默认关闭：不设开关 ⇒ `applied=0` · 承诺仍 pending · **store 与事件流逐字节不变**（fail-closed）')
      : bad(`C1 ${JSON.stringify({ applied: r.applied, status: readStatus() })}`)
  }
  // C2 开启 + 逐字唯一命中 ⇒ 结算生效 + 留档 + 事件流恰好 2 条（open + settle）
  {
    rmSync(join(bank2, '.records'), { recursive: true, force: true })
    rmSync(join(bank2, 'audit', 'session-review', 'rollback'), { recursive: true, force: true })
    rmSync(join(bank2, 'audit', 'session-review', 'applied.jsonl'), { force: true })
    const rec = mkBank()
    writeFileSync(props, P2({ opHash: 's1', before: rec.text, after: 'kept', evidence: '交付物已存在' }) + '\n', 'utf8')
    const r = M.applySessionProposals(D2(true))
    const after = H.loadStore(bank2).records.find((x) => x.id === 'commitment:c1')
    const rbPath = join(bank2, 'audit', 'session-review', 'rollback', 'settle-rollback.jsonl')
    const rb = existsSync(rbPath) ? readFileSync(rbPath, 'utf8') : ''
    const evPath = join(bank2, '.records', 'ring-events.jsonl')
    const evs = existsSync(evPath) ? E.parseEvents(readFileSync(evPath, 'utf8')) : []
    const settles = evs.filter((e) => e.op === 'commitment.settle')
    r.applied === 1 && after.meta.status === 'kept' && after.meta.evidence === '交付物已存在'
      && rb.includes(rec.text) && settles.length === 1 && evs.length === 2
      ? ok('C2 结算成立：命中⇒`kept` + 证据落库 + 留档含原文 + 事件流恰 1 条 `commitment.settle`（+ 既有 open = 2 条）')
      : bad(`C2 ${JSON.stringify({ applied: r.applied, status: after.meta.status, ev: after.meta.evidence, rbHasText: rb.includes(rec.text), settles: settles.length, total: evs.length })}`)
    // C2′ **对账不变式**：事件流重放必须能重建 store 的该条记录
    const recon = E.reconcileRing(H.loadStore(bank2).records, evs)
    recon.ok ? ok('C2′ 对账不变式：事件流重放**能重建** store（承诺面零漂移）') : bad(`C2′ ${JSON.stringify(recon).slice(0, 200)}`)
  }
  // C3 幂等：同 (sid,opHash) 复跑 ⇒ no-op
  {
    const before = readFileSync(join(bank2, '.records', 'records.jsonl'), 'utf8')
    const r = M.applySessionProposals(D2(true))
    const after = readFileSync(join(bank2, '.records', 'records.jsonl'), 'utf8')
    r.applied === 0 && before === after
      ? ok('C3 幂等：同 `(sid,opHash)` 复跑 ⇒ `applied=0` 且记录**逐字节不变**')
      : bad(`C3 ${JSON.stringify({ applied: r.applied, same: before === after })}`)
  }
  // C4 **证据门在册一**：无证据的结算提案 ⇒ 被拦下（执行面不重复实现判据）
  {
    rmSync(join(bank2, '.records'), { recursive: true, force: true })
    rmSync(join(bank2, 'audit', 'session-review', 'applied.jsonl'), { force: true })
    const rec = mkBank()
    writeFileSync(props, P2({ opHash: 's2', before: rec.text, after: 'kept', evidence: '' }) + '\n', 'utf8')
    const r = M.applySessionProposals(D2(true))
    r.applied === 0 && readStatus() === 'pending' && /证据/.test(r.reasons.join(' '))
      ? ok('C4 **无证据 ⇒ 被册一拦下**（执行面零通过；理由如实转述 ⇒ 「模型自批」路径被堵）')
      : bad(`C4 ${JSON.stringify({ applied: r.applied, status: readStatus(), reasons: r.reasons })}`)
  }
  // C5 **只结不建** + 状态枚举不扩
  {
    writeFileSync(props, P2({ opHash: 's3', before: '- 凭空新增的承诺', after: 'kept', evidence: 'e' }) + '\n', 'utf8')
    const r1 = M.applySessionProposals(D2(true))
    r1.applied === 0 && r1.verdicts.some((x) => x.reason === 'stale')
      ? ok('C5 **只结不建**：目标不存在 ⇒ `stale` 拒（不给"顺手建一条"留口子）')
      : bad(`C5 ${JSON.stringify(r1.verdicts)}`)
    const rec = H.loadStore(bank2).records.find((x) => x.id === 'commitment:c1')
    writeFileSync(props, P2({ opHash: 's4', before: rec.text, after: 'expired', evidence: 'e' }) + '\n', 'utf8')
    const r2 = M.applySessionProposals(D2(true))
    r2.applied === 0 && r2.verdicts.some((x) => x.reason === 'bad-status')
      ? ok('C5′ **不扩状态枚举**：`after=expired` ⇒ 拒（状态机仍只 `pending→kept|broken`）')
      : bad(`C5′ ${JSON.stringify(r2.verdicts)}`)
  }
  rmSync(bank2, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
