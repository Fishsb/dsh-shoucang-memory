#!/usr/bin/env node
/**
 * record-ring.mjs — 决策环 CLI（G1 · 2026-09-13）：裁决 → 预测 → 后果回收 → 价态采集
 *
 * 为什么有它：记忆库里「没有后果回收」时，经历永远只是日志。本件给这条环一个**可用的入口**：
 *   开裁决（记下当时预测）→ 之后回收实际结果（改记分卡）→ 采集价态（用户真实反应）。
 *
 * 落点：与三索引同一个 Record 事实源（`<库根>/.records/records.jsonl`），环记录 `file=''`
 *   ⇒ **天然没有 md 投影**，也不会被镜像的按文件替换碰掉。
 *
 * 用法（缺省子命令 = --score）：
 *   node scripts/record-ring.mjs --decide "拍板：切 storeMode=dual" --predict "对账零差异" --why "前置已绿"
 *   node scripts/record-ring.mjs --outcome <decisionId> "实际结果…" --hit
 *   node scripts/record-ring.mjs --valence "用户看到视觉走样" --value -1 --evidence "distill adfc3535"
 *   node scripts/record-ring.mjs --open          # 待回收队列（开了没回收的裁决）
 *   node scripts/record-ring.mjs --score         # 记分卡（只从记录集推导）
 * 退出码：0 = pass · 3 = skip（影子库未建：先跑 record-sync --import）· 1 = fail
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const argOf = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def }
/** 取 flag 之后的第一个非 flag 位置参数（裁决/后果正文可带空格，故用引号包整体） */
const positionalAfter = (flag) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '' }

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = argOf('--root', process.env.MEMORY_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'skills', 'managing-memory'))
const at = new Date().toISOString()

const S = await import(new URL('../lib/record-store.js', import.meta.url).href)
const H = await import(new URL('../lib/record-shadow.js', import.meta.url).href)
const D = await import(new URL('../lib/decision-ring.js', import.meta.url).href)
const G = await import(new URL('../lib/relation-ring.js', import.meta.url).href)
const A = await import(new URL('../lib/association-ring.js', import.meta.url).href)
const E = await import(new URL('../lib/ring-events.js', import.meta.url).href)
const F = await import(new URL('../lib/fact-ring.js', import.meta.url).href)

const storePath = H.recordStorePath(ROOT)
if (!existsSync(storePath)) {
  console.log(`⏭ 影子库未建（${storePath}）——先跑：node scripts/record-sync.mjs --import --root "${ROOT}"`)
  process.exit(3)
}
const cur = H.loadStore(ROOT)
if (cur.error) { console.log(`❌ 影子库损坏：${cur.error}`); process.exit(1) }

// ── 环事件流（G0「统一事件流账本」的环侧）：每次变更先记事件、再存状态 ──
// 为什么两样都要：事件流是**不可变历史**，store 是**当前状态**（store 会被镜像重写，历史不会）。
// 对账判据：`--reconcile` 要求「事件流重放必须能重建 store 的环记录」。
const EV = join(ROOT, H.RECORD_DIR, E.RING_EVENT_FILE)
const loadEvents = () => (existsSync(EV) ? E.parseEvents(readFileSync(EV, 'utf8')) : [])
const commit = (next) => {
  const evs = E.eventsFromDiff(cur.records, next, at, loadEvents().length + 1)
  if (evs.length) {
    mkdirSync(join(ROOT, H.RECORD_DIR), { recursive: true })
    writeFileSync(EV, E.serializeEvents(loadEvents().concat(evs)), 'utf8')
  }
  H.saveStoreRecords(ROOT, next)
}

if (has('--decide')) {
  const text = positionalAfter('--decide')
  if (!text) { console.log('❌ --decide 后须给裁决正文'); process.exit(1) }
  const r = D.openDecision(cur.records, { text, predicted: argOf('--predict', ''), rationale: argOf('--why', ''), alternatives: argOf('--alt', ''), evidence: argOf('--evidence', ''), at })
  commit(r.records)
  console.log(`✅ 已开裁决 ${r.id}`)
  console.log(`   正文：${text}`)
  if (argOf('--predict', '')) console.log(`   预测：${argOf('--predict', '')}`)
  console.log(`   待回收队列：${D.openDecisions(r.records).length} 条（回收：--outcome ${r.id} "实际结果" --hit|--miss）`)
} else if (has('--outcome')) {
  const id = positionalAfter('--outcome')
  const observed = positionalAfter(id) || (() => { const i = argv.indexOf(id); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '' })()
  if (!id || !observed) { console.log('❌ 用法：--outcome <decisionId> "实际结果" [--hit|--miss] [--valence N] [--evidence s]'); process.exit(1) }
  const vRaw = argOf('--valence', '')
  const r = D.collectOutcome(cur.records, id, {
    observed,
    ...(has('--hit') ? { hit: true } : has('--miss') ? { hit: false } : {}),
    ...(vRaw !== '' ? { valence: Number(vRaw) } : {}),
    evidence: argOf('--evidence', ''),
    at,
  })
  if (!r.ok) { console.log(`❌ 回收失败：${r.reason}`); process.exit(1) }
  commit(r.records)
  console.log(`✅ 已回收 ${id} · ${r.hit === undefined ? '未判命中' : r.hit ? '命中' : '未命中'}`)
  console.log('   实际：' + observed)
} else if (has('--valence')) {
  const trigger = positionalAfter('--valence')
  const value = Number(argOf('--value', '0'))
  if (!trigger) { console.log('❌ 用法：--valence "触发情境" --value <±1|0> [--evidence s]'); process.exit(1) }
  const r = D.recordValence(cur.records, { trigger, valence: value, evidence: argOf('--evidence', ''), at })
  commit(r.records)
  console.log(`✅ 已采价态 ${r.id} · ${value > 0 ? '认可' : value < 0 ? '否定' : '中性'} · ${trigger}`)
} else if (has('--open')) {
  const q = D.openDecisions(cur.records)
  if (!q.length) console.log('✅ 待回收队列为空（所有裁决都已回收后果）')
  else {
    console.log(`待回收 ${q.length} 条：`)
    for (const d of q) console.log(`  · ${d.id}  ${d.text}${d.meta?.predicted ? `（预测：${d.meta.predicted}）` : ''}`)
  }
} else if (has('--relation')) {
  const who = argOf('--relation', '')
  const note = argOf('--note', '')
  if (!who || !note) { console.log('❌ 用法：--relation <who> --note "关于他/她的事实" [--level N] [--evidence s]'); process.exit(1) }
  const lv = argOf('--level', '')
  const r = G.assertRelation(cur.records, { who, note, ...(lv !== '' ? { level: Number(lv) } : {}), evidence: argOf('--evidence', ''), at })
  commit(r.records)
  console.log(`✅ 已记关系 ${r.id} · ${who}：${note}`)
} else if (has('--commit')) {
  const who = argOf('--commit', '')
  const what = argOf('--what', '')
  const dir = argOf('--dir', 'owed-by-me')
  if (!who || !what) { console.log('❌ 用法：--commit <who> --what "承诺内容" --dir owed-by-me|owed-to-me [--due D]'); process.exit(1) }
  if (!['owed-by-me', 'owed-to-me'].includes(dir)) { console.log('❌ --dir 只能是 owed-by-me | owed-to-me'); process.exit(1) }
  const r = G.openCommitment(cur.records, { who, what, direction: dir, due: argOf('--due', ''), evidence: argOf('--evidence', ''), at })
  commit(r.records)
  console.log(`✅ 已开承诺 ${r.id} · ${dir === 'owed-by-me' ? '我欠' : '欠我'} ${who}：${what}`)
  console.log(`   待兑现队列：${G.openCommitments(r.records).length} 条（结清：--settle ${r.id} --kept|--broken）`)
} else if (has('--settle')) {
  const id = argOf('--settle', '')
  const status = has('--kept') ? 'kept' : has('--broken') ? 'broken' : ''
  if (!id || !status) { console.log('❌ 用法：--settle <commitmentId> --kept|--broken --evidence "凭什么是这个结论" [--note s]'); process.exit(1) }
  /* 册一（2026-09-20）**结必有证**：`evidence` 必填（`settleCommitment` 内部校验，单一实现）。
   * 为什么在 CLI 也显式提示：这是唯一的人工结算入口 —— 不提示的话，用户只会在
   * `❌ 结清失败：结算必须带证据` 之后才第一次知道有这条规矩。 */
  const evidence = argOf('--evidence', '')
  const r = G.settleCommitment(cur.records, id, { status, evidence, settledBy: 'cli', note: argOf('--note', ''), at })
  if (!r.ok) { console.log(`❌ 结清失败：${r.reason}`); process.exit(1) }
  commit(r.records)
  console.log(`✅ 已结清 ${id} · ${status === 'kept' ? '兑现' : '未兑现'}（证据：${evidence.slice(0, 60)}）`)
} else if (has('--commitments')) {
  const who = argOf('--commitments', '')
  const q = G.openCommitments(cur.records, who || undefined)
  if (!q.length) console.log(`✅ 待兑现队列为空${who ? `（${who}）` : ''}`)
  else {
    console.log(`待兑现 ${q.length} 条${who ? `（${who}）` : ''}：`)
    for (const c of q) console.log(`  · ${c.id}  ${c.meta.direction === 'owed-by-me' ? '我欠' : '欠我'} ${c.meta.who}：${c.text.split('：').slice(1).join('：')}${c.meta.due ? `（期限 ${c.meta.due}）` : ''}`)
  }
} else if (has('--relations')) {
  const who = argOf('--relations', '')
  if (!who) { console.log('❌ 用法：--relations <who>'); process.exit(1) }
  const list = G.relationsOf(cur.records, who)
  if (!list.length) console.log(`（无 ${who} 的关系记录）`)
  else { console.log(`${who} 的关系与承诺 ${list.length} 条：`); for (const r of list) console.log(`  · [${r.kind}] ${r.text}${r.meta?.status ? `（${r.meta.status}）` : ''}`) }
} else if (has('--collide')) {
  // --collide --a <记录id|锚点> --b <记录id|锚点> --context "任务语境" [--insight s] [--accepted|--denied] [--evidence s]
  const av = argOf('--a', ''), bv = argOf('--b', '')
  const context = argOf('--context', '')
  if (!av || !bv || !context) { console.log('❌ 用法：--collide --a <记录id|锚点> --b <同> --context "任务语境" [--insight s] [--accepted|--denied]'); process.exit(1) }
  const isId = (v) => cur.records.some((r) => r.id === v)
  const accepted = has('--accepted') ? true : has('--denied') ? false : undefined
  const extra = { context, insight: argOf('--insight', ''), ...(accepted === undefined ? {} : { accepted }), evidence: argOf('--evidence', ''), at }
  const r = isId(av) && isId(bv)
    ? A.collideRecords(cur.records, av, bv, extra)
    : A.recordCollision(cur.records, { ...extra, a: av, b: bv })
  if (!r.ok) { console.log(`❌ 碰撞被拒：${r.reason}`); process.exit(1) }
  commit(r.records)
  console.log(`✅ 已记碰撞 ${r.id} · ${av} ⨯ ${bv}`)
  console.log(`   语境：${context}${accepted === undefined ? '（未表态）' : accepted ? '（认可）' : '（否定）'}`)
} else if (has('--land')) {
  const id = argOf('--land', '')
  const landed = has('--landed') ? true : has('--unlanded') ? false : null
  if (!id || landed === null) { console.log('❌ 用法：--land <collisionId> --landed|--unlanded [--note s]'); process.exit(1) }
  const r = A.landCollision(cur.records, id, { landed, note: argOf('--note', ''), at })
  if (!r.ok) { console.log(`❌ 落地登记失败：${r.reason}`); process.exit(1) }
  commit(r.records)
  console.log(`✅ 已登记落地 ${id} · ${landed ? '后来用上了' : '没用上'}`)
} else if (has('--collisions')) {
  const q = A.openCollisions(cur.records)
  if (!q.length) console.log('✅ 待回收碰撞为空（每条都已登记落地结论）')
  else { console.log(`待回收碰撞 ${q.length} 条：`); for (const c of q) console.log(`  · ${c.id}  ${c.meta.a} ⨯ ${c.meta.b}${c.meta.accepted === '1' ? '（已认可）' : ''}`) }
} else if (has('--serendipity')) {
  const k = Number(argOf('--k', '3'))
  const seed = argOf('--seed', new Date().toISOString().slice(0, 10))
  const pairs = A.serendipityPairs(cur.records, { seed, k })
  if (!pairs.length) console.log('（候选池不足或已全部撞过）')
  else {
    console.log(`越界召回候选（seed=${seed} · 不按相关性排序）：`)
    for (const p of pairs) console.log(`  · [${p.span}] ${p.a.section} ⨯ ${p.b.section}（${p.why}）\n      A: ${p.a.text.slice(0, 60)}\n      B: ${p.b.text.slice(0, 60)}`)
  }
} else if (has('--backfill-events')) {
  // 一次性迁移：库里已有环记录但无事件日志时，把当前状态回填成事件（`at` 取记录自身 createdAt，保序）
  const existing = loadEvents()
  if (existing.length && !has('--force')) { console.log(`❌ 已有 ${existing.length} 条事件，回填会重复记账。确认要重来请加 --force`); process.exit(1) }
  const evs = E.eventsFromDiff([], E.ringRecordsOf(cur.records), at, 1, (r) => r.createdAt || at)
  mkdirSync(join(ROOT, H.RECORD_DIR), { recursive: true })
  writeFileSync(EV, E.serializeEvents(evs), 'utf8')
  console.log(`✅ 已回填环事件 ${evs.length} 条 → ${EV}`)
  console.log(`   时间取各记录 createdAt（保主观顺序）；此后每次变更自动追加`)
} else if (has('--supersede')) {
  const id = argOf('--supersede', '')
  if (!id) { console.log('❌ 用法：--supersede <记录id> [--note "因何失效"] [--by "被谁取代"]'); process.exit(1) }
  const r = F.supersede(cur.records, id, { at, note: argOf('--note', ''), by: argOf('--by', '') })
  if (!r.ok) { console.log(`❌ 标记失效失败：${r.reason}`); process.exit(1) }
  commit(r.records)
  console.log(`✅ 已标记失效 ${id} @ ${at}`)
  console.log(`   （注意：这是**有效位**不是活性位——lifecycle 不变；下次镜像会承接该字段，不会复活）`)
} else if (has('--revive')) {
  const id = argOf('--revive', '')
  if (!id) { console.log('❌ 用法：--revive <记录id>'); process.exit(1) }
  const r = F.revive(cur.records, id, at)
  if (!r.ok) { console.log(`❌ 恢复失败：${r.reason}`); process.exit(1) }
  commit(r.records)
  console.log(`✅ 已恢复有效 ${id}`)
} else if (has('--facts')) {
  const c = F.factCensus(cur.records, at)
  console.log('事实环（时态）：')
  console.log(`  合计 ${c.total} · 有效 ${c.live} · 已失效 ${c.expired} · 带前提 ${c.withPremise} · 坏时间戳 ${c.unparseable}`)
  const stale = F.staleReport(cur.records)
  if (stale.length) { console.log(`  已失效清单（前 5）：`); for (const s of stale.slice(0, 5)) console.log(`    · ${s.id} @ ${s.validTo.slice(0, 10)}｜${s.why || '（未记因）'}${s.by ? ` ← ${s.by}` : ''}`) }
} else if (has('--events')) {
  const evs = loadEvents()
  if (!evs.length) console.log('（事件流为空）')
  else {
    console.log(`环事件流 ${evs.length} 条 · ${EV}`)
    for (const e of evs.slice(-20)) console.log(`  #${String(e.seq).padStart(3)} ${e.at.slice(0, 19)} ${e.op.padEnd(18)} ${e.id}`)
    if (evs.length > 20) console.log(`  …（仅显示最近 20 条）`)
  }
} else if (has('--reconcile')) {
  const rec = E.reconcileRing(cur.records, loadEvents())
  console.log(`环事件对账：store 环记录 ${rec.storeCount} · 事件重放 ${rec.replayCount}`)
  if (rec.missingInReplay.length) console.log(`  ❌ 重放缺失 ${rec.missingInReplay.length}：${rec.missingInReplay.slice(0, 3).join(', ')}`)
  if (rec.extraInReplay.length) console.log(`  ❌ 重放多出 ${rec.extraInReplay.length}：${rec.extraInReplay.slice(0, 3).join(', ')}`)
  if (rec.differing.length) console.log(`  ❌ 内容不一致 ${rec.differing.length}：${rec.differing.slice(0, 3).join(', ')}`)
  if (rec.errors.length) console.log(`  ❌ 重放报错 ${rec.errors.length}：${rec.errors.slice(0, 3).join(' / ')}`)
  if (!rec.ok) { console.log('\nFAIL（事件流重放不能重建当前状态）'); process.exit(1) }
  console.log('\nPASS（事件流重放逐条重建当前状态）')
} else {
  const sc = D.scorecardOf(cur.records)
  const cen = G.relationCensus(cur.records)
  console.log('决策环记分卡（只从记录集推导）：')
  console.log(`  已开 ${sc.opened} · 已回收 ${sc.collected} · 待回收 ${sc.pending} · 命中 ${sc.hits} / 未命中 ${sc.misses} · 命中率 ${(sc.hitRate * 100).toFixed(1)}% · 价态 ${sc.valences}`)
  if (sc.missSamples.length) { console.log('  未命中样本：'); for (const m of sc.missSamples) console.log(`    · ${m}`) }
  console.log('关系环：')
  console.log(`  关系事实 ${cen.relations} · 承诺 ${cen.commitments}（待兑现 ${cen.pending} / 兑现 ${cen.kept} / 未兑现 ${cen.broken}）· 关系网 ${cen.entities} 人 · 待办 ${G.openCommitments(cur.records).length}`)
  for (const who of Object.keys(cen.byWho)) {
    const t = G.trustOf(cur.records, who)
    console.log(`  · ${who}：我欠兑现率 ${(t.mineRate * 100).toFixed(0)}%（${t.mineKept}/${t.mineKept + t.mineBroken}）· 其兑现率 ${(t.theirsRate * 100).toFixed(0)}%（${t.theirsKept}/${t.theirsKept + t.theirsBroken}）`)
  }
  const asc = A.associationCensus(cur.records)
  console.log('联想环：')
  console.log(`  碰撞 ${asc.collisions}（认可 ${asc.accepted} / 否定 ${asc.denied} / 未表态 ${asc.unstated}）· 已落地 ${asc.landed}（落地率 ${(asc.landedRate * 100).toFixed(0)}%，分母=已认可者）· 待回收 ${asc.pending} · 复撞 ${asc.reused}`)
  const fc = F.factCensus(cur.records, at)
  console.log('事实环（时态）：')
  console.log(`  合计 ${fc.total} · 有效 ${fc.live} · 已失效 ${fc.expired} · 带前提 ${fc.withPremise} · 坏时间戳 ${fc.unparseable}`)
}
