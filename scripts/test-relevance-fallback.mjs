#!/usr/bin/env node
// test-relevance-fallback.mjs — IR1 册一（相关性重建）断言（2026-09-18）
//
// 守什么（对应验收册 A2–A5，**每条都带反例自证**）：
//   ① **分层配额是"保底"且在起作用的**：AGENT.md 的 `[原则]`/`[路径]` 行**排在候选末尾也能入选**
//      （旧实现 `file==='MEMORY.md'` 单点过滤 ⇒ 必然为空 ⇒ **本断言在旧实现下必红**，这就是 A2 的"先红"）；
//   ② **降级必须记账**：桥缺失/过期/键不匹配 ⇒ `fallback` 写明原因（旧实现静默退词法 ⇒ A3 必红）；
//   ③ **零命中必须可见**：桥与词法都取不回 ⇒ `zeroHit=true` + 注入面尾注（A5）；
//   ④ 边界：空 query 不算失败 · 坏桥不抛 · 同输入同输出（确定性）。
//
// 判因（真机实测，2026-09-18）：真命中词 vs 乱码词的注入面 **63/63 行逐行相同**；
//   `recallIndex("深睡蒸馏")` 取回 10 行**全在 AGENT.md**，被单点过滤全丢 ⇒ 相关性通道对注入**零贡献**。
//
// 用法: node scripts/test-relevance-fallback.mjs   （先 npm run build:host）
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/relevance-supply.js', import.meta.url).href)
const { selectRelevantLines, relevanceNoteOf, quotaOf, layerOf, pickByLayer } = mod
for (const [n, f] of Object.entries({ selectRelevantLines, relevanceNoteOf, quotaOf, layerOf, pickByLayer })) {
  if (typeof f !== 'function') { console.log(`❌ lib/relevance-supply.js 未导出 ${n}（先 npm run build:host）`); process.exit(1) }
}
// 键必须用**写侧同一实现**（`recallKeyOf`）—— 手写字符串只会测出"键不匹配"
const { recallKeyOf } = await import(new URL('../lib/targets.js', import.meta.url).href)

// ── 夹具：**落被审工作区**（`_memory/` 已 gitignore；不用系统临时目录 —— 验收册 §H.4）──
const fix = join(root, '_memory', 'audit', `rel-test-${process.pid}`)
mkdirSync(fix, { recursive: true })
const MEM_ROWS = Array.from({ length: 10 }, (_, i) => `[lesson] 知识行 ${i + 1} · 概况 → notes/lessons.md §知识${i + 1}`)
const AGENT_ROWS = [
  '[原则] 假绿与实证 · 探针 PASS≠生效 → notes/lessons.md §假绿与实证',
  '[路径] 深睡记忆蒸馏 · ①区间起点显式传参 ②判据三通道 ③done 才推水位 → notes/flows.md §深睡蒸馏',
  '- 主张只给方向级粗粒度 ← 源: notes/user.md §偏好',
]
writeFileSync(join(fix, 'MEMORY.md'), ['# MEMORY.md', '', ...MEM_ROWS].join('\n'), 'utf8')
writeFileSync(join(fix, 'AGENT.md'), ['# AGENT.md', '', ...AGENT_ROWS].join('\n'), 'utf8')
writeFileSync(join(fix, 'USER.md'), '# USER.md\n\n[身份] 中文用户 → notes/user.md §身份\n', 'utf8')
const bridgeFile = join(fix, 'warm-recall.json')
const now = 1789739000000
const HIT = '深睡蒸馏'
const KEY = recallKeyOf(HIT)
const rowsOf = (mem, agent) => [...mem.map((line) => ({ line, file: 'MEMORY.md', pointer: '' })), ...agent.map((line) => ({ line, file: 'AGENT.md', pointer: '' }))]
const writeBridge = (rows, key = KEY, at = now) => writeFileSync(bridgeFile, JSON.stringify({ at, key, rows }), 'utf8')

console.log('IR1 册一 · 相关性重建（分层配额 / 记账 / 零命中可见）')

// ── ① 层归类的**单一判据**（注册表 mclGate 驱动，不另写标签名单）──
ok(layerOf('MEMORY.md', MEM_ROWS[0]) === 'memory-index', '① `[lesson]` 索引行 → memory-index')
ok(layerOf('AGENT.md', AGENT_ROWS[0]) === 'agent-principles', '① AGENT.md `[原则]` → agent-principles（注册表 mclGate 驱动）')
ok(layerOf('AGENT.md', AGENT_ROWS[1]) === 'agent-principles', '① AGENT.md `[路径]` → agent-principles')
ok(layerOf('AGENT.md', AGENT_ROWS[2]) === 'profile', '① 画像行（`- … ← 源:`）→ profile（不占动态面）')

// ── ② 分层配额**保底**：AGENT 行排在候选**末尾**、cap 又小于候选数 ⇒ 仍必须入选（A2 的核心判定点）──
{
  const q = quotaOf(10)
  ok(q.agentPrinciples >= 1 && q.memoryIndex + q.agentPrinciples === 10, `② cap=10 ⇒ 配额 memory ${q.memoryIndex} + agent ${q.agentPrinciples}`)
  // 桥：10 条 MEMORY 索引行在前（相关性更靠前）+ 2 条 AGENT 行在末尾；cap=4（agent 保底配额 = 1）
  writeBridge(rowsOf(MEM_ROWS, [AGENT_ROWS[1], AGENT_ROWS[0]]))
  const r = selectRelevantLines({ memRoot: fix, q: HIT, cap: 4, bridgeFile, now })
  ok(r.trace.source === 'bridge', '② 桥键匹配且新鲜 ⇒ source=bridge（向量融合通道生效）')
  ok(r.trace.fallback === '', '② 无降级 ⇒ fallback 为空（不是"降级了还说自己好"）')
  ok(r.picked.length === 4, `② cap=4 ⇒ 恰 4 行（实际 ${r.picked.length}）`)
  ok(r.picked.some((l) => l.includes('深睡记忆蒸馏')), '② **AGENT.md 的 `[路径]` 行入选**（排在第 11 位仍被保底取回；旧实现按 `file===\'MEMORY.md\'` 过滤 ⇒ 此处必空）')
  ok(r.trace.byLayer['agent-principles'] >= 1, '② `byLayer` 记账：agent-principles 供上了 ≥1 条（可核验"哪层供上了"）')
}
// ②′ 反例自证：把 agent 配额压到 0 ⇒ 该行**必须消失**（证明保底真在起作用，不是"碰巧全进"）
{
  const r = selectRelevantLines({ memRoot: fix, q: HIT, cap: 4, bridgeFile, now, quota: { memoryIndex: 4, agentPrinciples: 0, profile: 0 } })
  ok(!r.picked.some((l) => l.includes('深睡记忆蒸馏')), '②′ 反例：agent 配额=0 ⇒ 该行消失（= 纯全局序，正是修复前的行为）')
}

// ── ③ 降级记账（A3）：桥四种失败形态各留其名 ──
{
  rmSync(bridgeFile, { force: true })
  const r = selectRelevantLines({ memRoot: fix, q: HIT, cap: 10, bridgeFile, now })
  ok(r.trace.source === 'lexical' && r.trace.fallback.startsWith('bridge-missing'), `③ 桥缺失 ⇒ fallback=bridge-missing（实测 ${r.trace.fallback}）`)
  ok(r.picked.some((l) => l.includes('深睡记忆蒸馏')), '③ **词法回退也带层**：AGENT.md 命中行仍被取回（A2 的第二条通路）')
  writeBridge(rowsOf(MEM_ROWS, []), KEY, now - 300000)
  ok(selectRelevantLines({ memRoot: fix, q: HIT, cap: 10, bridgeFile, now }).trace.fallback.startsWith('bridge-stale'), '③ 桥过期（>120s）⇒ fallback=bridge-stale')
  writeBridge(rowsOf(MEM_ROWS, []), 'other-query', now)
  ok(selectRelevantLines({ memRoot: fix, q: HIT, cap: 10, bridgeFile, now }).trace.fallback.startsWith('bridge-key-mismatch'), '③ 桥键不匹配 ⇒ fallback=bridge-key-mismatch（**不拿别的 query 的行充数**）')
  writeFileSync(bridgeFile, '{ 坏 JSON', 'utf8')
  const bad = selectRelevantLines({ memRoot: fix, q: HIT, cap: 10, bridgeFile, now })
  ok(bad.trace.fallback.startsWith('bridge-unreadable') && bad.picked.length > 0, '③ 桥文件损坏 ⇒ 记 bridge-unreadable 且**不抛**（退词法继续）')
  writeBridge([], KEY, now)
  ok(selectRelevantLines({ memRoot: fix, q: HIT, cap: 10, bridgeFile, now }).trace.fallback.startsWith('bridge-empty'), '③ 桥存在但空 ⇒ fallback=bridge-empty（"空"与"缺"可分辨）')
}

// ── ④ 零命中可见（A5）──
{
  rmSync(bridgeFile, { force: true })
  const r = selectRelevantLines({ memRoot: fix, q: 'zzz-完全没有的词', cap: 10, bridgeFile, now })
  ok(r.trace.zeroHit === true && r.trace.source === 'positional', '④ 桥+词法都取不回 ⇒ zeroHit=true 且 source=positional')
  ok(r.trace.fallback.includes('zero-hit'), '④ `fallback` 含 zero-hit（N=0 显式记 0，不静默）')
  ok(relevanceNoteOf(r.trace, 'zzz-完全没有的词').includes('相关性零命中'), '④ 注入面尾注生成（A5：使用者能分辨"基线"与"按任务供给"）')
  ok(relevanceNoteOf(r.trace, '') === '', '④ 边界：空 query ⇒ 不注明（空 query 本就是位置式基线，不算失败）')
  const empty = selectRelevantLines({ memRoot: fix, q: '', cap: 10, bridgeFile, now })
  ok(empty.picked.length === 0 && empty.trace.zeroHit === false && empty.trace.source === 'positional', '④ 空 query ⇒ 位置式基线且**不算**零命中（既有语义不变）')
}

// ── ⑤′ 恒定面排除（册一实测缺陷：同一行两处注入 / 被恒定面裁掉的行从动态面复活）──
{
  writeBridge(rowsOf(MEM_ROWS, [AGENT_ROWS[1], AGENT_ROWS[0]]))
  const keep = MEM_ROWS[0]
  const r = selectRelevantLines({ memRoot: fix, q: HIT, cap: 10, bridgeFile, now, exclude: [keep, AGENT_ROWS[0]] })
  ok(!r.picked.includes(keep) && !r.picked.includes(AGENT_ROWS[0]), '⑤′ `exclude`（恒定面已持有）的行**不进**相关性面（防同一行两处注入）')
  ok(r.picked.some((l) => l.includes('深睡记忆蒸馏')), '⑤′ 未排除的 gated 行仍被取回（排除不误伤按需行）')
}

// ── ⑤ 确定性 / 边界 ──
{
  writeBridge(rowsOf(MEM_ROWS, AGENT_ROWS.slice(0, 2)))
  const a = selectRelevantLines({ memRoot: fix, q: HIT, cap: 10, bridgeFile, now })
  const b = selectRelevantLines({ memRoot: fix, q: HIT, cap: 10, bridgeFile, now })
  ok(JSON.stringify(a) === JSON.stringify(b), '⑤ 确定性：同输入 ⇒ 同输出（可按字复现，含 trace）')
  ok(selectRelevantLines({ memRoot: fix, q: HIT, cap: 0, bridgeFile, now }).picked.length === 0, '⑤ cap=0 ⇒ 空（不越界选行）')
  const { picked, byLayer } = pickByLayer([{ file: 'MEMORY.md', tag: 'lesson', line: MEM_ROWS[0], score: 0, pointer: '' }], { memoryIndex: 0, agentPrinciples: 0, profile: 0 }, 0)
  ok(picked.length === 0 && byLayer['memory-index'] === 0, '⑤ cap=0 ⇒ 空（不靠"补齐"绕过 cap）')
}

rmSync(fix, { recursive: true, force: true })
console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（相关性重建断言全过 · 含 A2/A3/A5 的判定点）')
process.exit(fail ? 1 : 0)
