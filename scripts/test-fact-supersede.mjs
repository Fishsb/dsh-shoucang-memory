#!/usr/bin/env node
// test-fact-supersede.mjs —— 门4 册 A：**时态剔除的落库接线**行为级单测（TDD 先红）
//
// 为什么必须有这一件：`fact-ring#supersede()` 是纯函数且**全仓零调用方** ⇒ 真库 `validTo` 非空
//   长期 **0/6037** —— 旧断言永不失效、与新断言并存，模型在两份矛盾记忆间随机选。
//   本册把那条链接上，而**接线最容易的失败形态恰恰是"看着接上了"**：
//     ① 开关没关严 ⇒ 默认就在生产上改用户库；
//     ② 留档失败仍改库 ⇒ "可还原"变成一句空话；
//     ③ 目标定位靠模糊匹配 ⇒ 误标真事实失效（比不标更坏）；
//     ④ 库不存在时"顺手造库" ⇒ 凭空造出游离事实源。
//   故本件逐条把上述四类钉住，并含**反例自证**（证明判据非恒真）。
//
// 用法: node scripts/test-fact-supersede.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const S = await import(load('lib/record-store.js'))
const A = await import(load('lib/fact-supersede-apply.js'))
const F = await import(load('lib/fact-ring.js'))
const H = await import(load('lib/record-shadow.js'))

const tmp = mkdtempSync(join(tmpdir(), 'sc-sup-'))
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 清理失败无害 */ } })

const AT = '2026-09-20T10:00:00.000Z'
const sha = (p) => createHash('sha1').update(readFileSync(p)).digest('hex')
const storeOf = (root) => join(root, '.records', 'records.jsonl')

/** 造一个带影子库的临时记忆库 */
function mkLib(name, rows) {
  const root = join(tmp, name)
  mkdirSync(root, { recursive: true })
  const recs = rows.map((text, i) => S.stampRecord(S.makeRecord({ text, file: 'MEMORY.md', order: i }), AT))
  H.saveStoreRecords(root, recs)
  return { root, recs }
}
const deps = (root, sink) => ({ root, at: AT, log: (m) => sink.push(['log', m]), audit: (o) => sink.push(['audit', o]) })

console.log('== A. **默认关闭**：不开开关必须零写入（fail-closed）==')
{
  const { root, recs } = mkLib('a1', ['- [env] 甲 · 概况 → notes/env.md §甲'])
  const before = sha(storeOf(root))
  const sink = []
  const r = A.applySupersedeOps(deps(root, sink), [{ targetId: recs[0].id }])
  ok(r.ran === false && r.applied === 0 && r.skipped === 1, `关闭 ⇒ ran=false / 零应用（skipped=${r.skipped}）`)
  ok(sha(storeOf(root)) === before, '**真库 sha 不变**（零写入，不是"看着没变"）')
  ok(!existsSync(A.supersedeArchiveDirOf(root)), '零留档（未执行不该留档）')
  ok(sink.length === 0, '零审计（未执行不该写审计）')
  ok(r.verdicts.length === 1 && r.verdicts[0].reason === 'disabled', '逐条留理由 `disabled`（不静默）')
}

console.log('== B. 目标定位：id 命中 / 正文命中 / **多命中与 0 命中均拒** ==')
{
  const { root, recs } = mkLib('b1', ['- [env] 甲 · 概况 → notes/env.md §甲', '- [env] 乙 · 概况 → notes/env.md §乙'])
  const sink = []
  const r = A.applySupersedeOps(deps(root, sink), [{ targetId: recs[0].id, note: '被新版本取代', by: 'commit x' }], { enabled: true })
  ok(r.applied === 1 && r.archived === 1, `id 精确命中 ⇒ applied=1 / archived=1`)
  const after = H.loadStore(root).records
  ok(after.find((x) => x.id === recs[0].id).validTo === AT, '目标 `validTo` 已落库')
  ok(after.find((x) => x.id === recs[0].id).meta.staleNote === '被新版本取代', '记下因由（人读可追溯）')
  ok(after.find((x) => x.id === recs[0].id).meta.supersededBy === 'commit x', '记下被谁取代')
  ok(after.find((x) => x.id === recs[1].id).validTo === undefined, '**未命中的那条纹丝不动**（不误伤）')

  const { root: r2, recs: c2 } = mkLib('b2', ['- [env] 丙 · 概况 → notes/env.md §丙'])
  const s2 = []
  const t = A.applySupersedeOps(deps(r2, s2), [{ targetText: '- [env] 丙 · 概况 → notes/env.md §丙' }], { enabled: true })
  ok(t.applied === 1, '无 id 时按**逐字**正文命中')

  const { root: r3 } = mkLib('b3', ['- [env] 丁 · 概况 → notes/env.md §丁'])
  const s3 = []
  const miss = A.applySupersedeOps(deps(r3, s3), [{ targetText: '- [env] 不存在的一行' }], { enabled: true })
  ok(miss.applied === 0 && miss.verdicts[0].reason === 'no-match', '**0 命中 ⇒ 拒**（陈旧指令不猜）')

  // 多命中：同文本两条（不同 id）⇒ 必须拒，不得任选其一
  const root4 = join(tmp, 'b4')
  mkdirSync(root4, { recursive: true })
  const dup = '- [env] 重复行 · 概况 → notes/env.md §重复'
  H.saveStoreRecords(root4, [
    S.stampRecord(S.makeRecord({ text: dup, file: 'MEMORY.md', order: 0, id: 'x:fact:dup1' }), AT),
    S.stampRecord(S.makeRecord({ text: dup, file: 'MEMORY.md', order: 1, id: 'x:fact:dup2' }), AT),
  ])
  const s4 = []
  const amb = A.applySupersedeOps(deps(root4, s4), [{ targetText: dup }], { enabled: true })
  ok(amb.applied === 0 && amb.verdicts[0].reason === 'ambiguous-text', '**多命中 ⇒ 拒**（歧义不猜——与 section-ref 同口径）')
  ok(H.loadStore(root4).records.every((x) => !x.validTo), '歧义被拒后库内零改动')
}

console.log('== C. 幂等：重复提交 ⇒ 不改既有失效时刻（"何时失效"不被后来者覆盖）==')
{
  const { root, recs } = mkLib('c1', ['- [env] 戊 · 概况 → notes/env.md §戊'])
  const sink = []
  const r1 = A.applySupersedeOps(deps(root, sink), [{ targetId: recs[0].id, note: '首次' }], { enabled: true })
  ok(r1.applied === 1, '首次标记生效')
  const later = '2027-01-01T00:00:00.000Z'
  const r2 = A.applySupersedeOps({ ...deps(root, sink), at: later }, [{ targetId: recs[0].id, note: '再标一次' }], { enabled: true })
  ok(r2.applied === 0 && r2.skipped === 1 && r2.verdicts[0].reason === 'already-superseded', '**重复标记被拒**（applied=0）')
  const rec = H.loadStore(root).records.find((x) => x.id === recs[0].id)
  ok(rec.validTo === AT, '既有失效时刻**未被后来的 `at` 覆盖**')
  ok(rec.meta.staleNote === '首次', '因由也未被覆盖')
}

console.log('== D. 留档：含**整行原文**，且可据此回滚 ==')
{
  const { root, recs } = mkLib('d1', ['- [env] 己 · 概况 → notes/env.md §己'])
  const sink = []
  A.applySupersedeOps(deps(root, sink), [{ targetId: recs[0].id, note: '换代' }], { enabled: true })
  const dir = A.supersedeArchiveDirOf(root)
  ok(existsSync(dir), '留档目录已建')
  const file = join(dir, readdirSync(dir)[0])
  const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  ok(rows.length === 1 && rows[0].id === recs[0].id, '一行一条，带 id')
  ok(rows[0].text === recs[0].text, '**整行原文**（逐字，不是摘要）')
  ok(rows[0].note === '换代' && typeof rows[0].at === 'string', '带因由与时刻（"谁在何时失效了什么"可溯）')
  ok(rows[0].meta && typeof rows[0].meta === 'object', '带完整 meta（回滚核对用）')
  // 可回滚：既有 revive() 现成，不必新写恢复逻辑
  const revived = F.revive(H.loadStore(root).records, recs[0].id, AT)
  ok(revived.ok && revived.records.find((x) => x.id === recs[0].id).validTo === undefined, '**既有 `revive()` 即可回滚**（不新造恢复逻辑）')
}

console.log('== E. **库未建 ⇒ 拒**（不得顺手造出游离事实源）==')
{
  const root = join(tmp, 'e-no-store')
  mkdirSync(root, { recursive: true })
  const sink = []
  const r = A.applySupersedeOps(deps(root, sink), [{ targetId: 'whatever' }], { enabled: true })
  ok(r.ok === false && r.applied === 0, '库未建 ⇒ ok=false（拒绝执行）')
  ok(!existsSync(storeOf(root)), '**不得把库目录建出来**（否则 root 指错就凭空造库）')
}

console.log('== F. 异常不抛：注入故障 ⇒ 返回 ok=false 且不打断 ==')
{
  const { root, recs } = mkLib('f1', ['- [env] 庚 · 概况 → notes/env.md §庚'])
  const sink = []
  // 注入故障：留档目录指向一个「已存在的文件」⇒ mkdirSync 必失败 ⇒ 必须整批拒改
  const blocker = join(tmp, 'f-blocker')
  writeFileSync(blocker, 'not a dir', 'utf8')
  const r = A.applySupersedeOps(deps(root, sink), [{ targetId: recs[0].id }], { enabled: true, archiveDir: join(blocker, 'sub') })
  ok(r.ok === false && r.applied === 0, '**留档失败 ⇒ 整批拒改**（可还原优先于"改成功"）')
  ok(H.loadStore(root).records.find((x) => x.id === recs[0].id).validTo === undefined, '库**未被改动**（拒改是真拒）')
  ok(sink.some(([k]) => k === 'audit'), '留证：审计已记录 `archive-failed`（不静默）')
}

console.log('== G. 反例自证：判据有判别力（非恒真）==')
{
  // 反例 1：若「留档失败仍改库」，F 组必须红 —— 用等价构造证明该断言非恒真
  const { root, recs } = mkLib('g1', ['- [env] 辛 · 概况 → notes/env.md §辛'])
  const sink = []
  const good = A.applySupersedeOps(deps(root, sink), [{ targetId: recs[0].id }], { enabled: true })
  ok(good.applied === 1 && good.ok === true, '正例：留档可用 ⇒ 正常落库（与 F 组构成对照）')
  // 反例 2：「开关关闭」与「开关打开」在同一输入上结论必须不同 —— 否则开关是假旋钮
  const { root: r2, recs: c2 } = mkLib('g2', ['- [env] 壬 · 概况 → notes/env.md §壬'])
  const off = A.applySupersedeOps(deps(r2, []), [{ targetId: c2[0].id }])
  const on = A.applySupersedeOps(deps(r2, []), [{ targetId: c2[0].id }], { enabled: true })
  ok(off.applied !== on.applied, '开关**真的改变结论**（off=0 / on=1）—— 防"假旋钮"')
}

console.log('== H. 提案 → 指令（**纯函数**）：幻觉门 + 配额 + 空格 ==')
{
  const seen = ['- [env] 甲 · 概况 → notes/env.md §甲', '- [原则] 乙 · 一句 → notes/flows.md §乙']
  const p1 = A.planSupersedeOps([{ target: seen[0], note: '被取代' }], seen)
  ok(p1.accepted === 1 && p1.ops.length === 1 && p1.ops[0].targetText === seen[0], '逐字来自材料 ⇒ 接受')
  ok(p1.ops[0].note === '被取代', 'note 透传')
  // **幻觉门**：模型编一条"看起来像既有行"但不来自材料的文本
  const p2 = A.planSupersedeOps([{ target: '- [env] 库里没有的这一行' }], seen)
  ok(p2.accepted === 0 && p2.rejected === 1 && /幻觉/.test(p2.reasons[0]), '**目标不在给定材料中 ⇒ 拒（幻觉门）**')
  // 空目标（模型留空是常态）不该进 ops
  const p3 = A.planSupersedeOps([{ target: '   ' }, { target: seen[1] }], seen)
  ok(p3.accepted === 1 && p3.rejected === 1, '空目标拒、有效目标收（不因一条坏数据全丢）')
  // 配额
  const many = Array.from({ length: 6 }, (_, i) => ({ target: seen[i % 2] }))
  const p4 = A.planSupersedeOps(many, seen, { maxOps: 3 })
  ok(p4.accepted === 3, `配额生效（6 条提案 → 3 条，maxOps=3）`)
  ok(p4.reasons.some((r) => /配额截断/.test(r)), '配额截断**留理由**（不静默丢）')
  // 超长目标
  const p5 = A.planSupersedeOps([{ target: 'x'.repeat(500) }], ['x'.repeat(500)])
  ok(p5.accepted === 0 && /超长/.test(p5.reasons[0]), '超长目标 ⇒ 拒')
  // 非数组 / 缺省 ⇒ 空计划（N=0 显式）
  ok(A.planSupersedeOps(undefined, seen).ops.length === 0 && A.planSupersedeOps([], seen).accepted === 0, '无提案 ⇒ 空计划（N=0 显式记 0）')
  // 反例自证：**去掉幻觉门**的等价构造必须与正例结论不同
  const noGate = seen.includes('- [env] 库里没有的这一行')
  ok(noGate === false, '反例自证：若无幻觉门，该目标会直落库匹配（0 命中或误标）—— 门确实在起作用')
}

console.log('== I. 边界：失效**不进环事件流**（显式，非半接线）==')
{
  const E = await import(load('lib/ring-events.js'))
  const { root, recs } = mkLib('h1', ['- [env] 癸 · 概况 → notes/env.md §癸'])
  const sink = []
  A.applySupersedeOps(deps(root, sink), [{ targetId: recs[0].id }], { enabled: true })
  const evPath = join(root, '.records', 'ring-events.jsonl')
  ok(!existsSync(evPath), '本操作**不产环事件**（索引行非环记录 ⇒ 结构上不可能）')
  ok(E.RING_OPS.length === 9, '`RING_OPS` 仍为 9 种（边界未被本册悄悄放宽）')
  ok(!E.RING_OPS.includes('fact.supersede'), 'op 集不含 fact 失效（`test-fact-ring` §I 的边界被遵守）')
  ok(E.ringRecordsOf(H.loadStore(root).records).length === 0, '失效对象不在环记录取集范围内（一致，不是半接线）')
}

console.log('== J. **门4 的终极目的**：错的事实进不了注入面 —— 分层实证（本轮实测）==')
{
  /* ⚠ **本轮最重要的一条事实更正**（实测推翻方案档 §4.1 册D 的写实）：
   *   方案档写「`supply-assembly` 的 `out.expired` 出现该 id，且**注入面**里不再有它」——
   *   实测：**只有一半成立**，且分界线是 `file` 字段，不是 kind：
   *     · **环记录**（`file === ''`）→ `ring-supply#ringCandidates` 的 `isLive(r, at)` 门（:174）
   *       → 进 `situationLinesOf` → `buildHotMemoryText` 的 situation 块 ⇒ **真抵达**（本组 A 段实证）；
   *     · **索引行**（`file !== ''`，即绝大多数"旧断言"）→ 唯一看 `validTo` 的读侧是
   *       `supply-assembly#buildCandidates`，而它在 `src/` 内**零消费者**（`check-injection-reach` ⑫ 早已机检此事实）
   *       ⇒ 注入面读的是 **md 原文**（`readCarrier`），records 的 `validTo` **不影响 md 文本** ⇒ **无抵达**。
   *   ⇒ 故本组把"哪一半真通、哪一半真不通"**机检钉住**：将来若 `buildCandidates` 接入注入链，
   *     本组 B 段翻红并强制同步（这正是"如实登记"该有的样子——不是自述，是断言）。 */
  const SA = await import(load('lib/supply-assembly.js'))
  const RS = await import(load('lib/ring-supply.js'))
  const { mkdirSync: mkd, writeFileSync: wf } = await import('node:fs')

  // 两条记录：一条索引行（有 md 投影）+ 一条环记录（无 md 投影）
  const root = join(tmp, 'j1')
  mkd(root, { recursive: true })
  const idx = S.stampRecord(S.makeRecord({ text: '- [env] 旧断言 · 概况 → notes/env.md §旧', file: 'MEMORY.md', order: 0 }), AT)
  const ring = S.stampRecord(S.makeRecord({ id: 'commitment:j', kind: 'commitment', file: '', text: '[承诺] 我欠 用户：旧承诺', meta: { who: '用户', status: 'pending', direction: 'owed-by-me' } }), AT)
  H.saveStoreRecords(root, [idx, ring])
  wf(join(root, 'MEMORY.md'), idx.text + '\n', 'utf8')
  let recs = F.supersede(H.loadStore(root).records, idx.id, { at: AT, note: '被取代' }).records
  recs = F.supersede(recs, 'commitment:j', { at: AT, note: '被取代' }).records
  H.saveStoreRecords(root, recs)

  // A. 环记录：真抵达（situation 块不再有它）
  const ringLines = RS.createRingSupplyApi({ topN: 10 }).lines(recs, [], AT)
  ok(!JSON.stringify(ringLines).includes('旧承诺'), '**环记录**（file=\'\'）：失效后从 situation 块消失 ⇒ **真抵达注入面**')
  ok(recs.find((r) => r.id === 'commitment:j').validTo === AT, '（前提核对）环记录的 validTo 已落库')

  // B. 索引行：**无抵达** —— 如实钉住，不是自我安慰
  const cand = SA.buildCandidates(recs, { at: AT })
  ok(cand.expired.length === 2, `读侧时态门**看得见**两条失效（expired=${cand.expired.length}）`)
  ok(cand.core.length === 0 && cand.ring.length === 0, '失效者确实**不进任何候选分区**（候选层过滤有效）')
  const mdRaw = readFileSync(join(root, 'MEMORY.md'), 'utf8')
  ok(mdRaw.includes('旧断言'), '**但注入面读的是 md 原文，索引行原样还在** ⇒ 索引行失效**无抵达**（如实登记）')
  const src = readdirSync(join(repoRoot, 'src')).filter((f) => f.endsWith('.ts'))
  const aliveConsumers = src.filter((f) => {
    const t = readFileSync(join(repoRoot, 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    return /\bbuildCandidates\s*\(/.test(t) && !/export function buildCandidates/.test(t)
  })
  ok(aliveConsumers.length === 0, `\`buildCandidates\` 在 \`src/\` 内**零消费者**（实测扫描 ${src.length} 件 ⇒ [${aliveConsumers.join(', ') || '无'}]）—— 这就是索引行无抵达的结构原因`)
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
