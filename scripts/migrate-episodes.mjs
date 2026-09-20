#!/usr/bin/env node
/**
 * migrate-episodes.mjs — 把 `audit/episodes.jsonl` 的**孤儿情景数据**迁成 `episode` 记录（P5 · 2026-09-14）
 *
 * 为什么有它（拟人化方案 D1）：`audit/episodes.jsonl` 有 257 条「任务发生 + 结果」的会话级情景
 *   （字段 `at,sid,intent,route,fclass,llm,outcome,added,rejected,failed,lib`），**而 src/ 内已无任何代码写它**
 *   （生产者被 ledger 取代）⇒ 它是**孤儿数据**：既不在环里、也不在注入面上。
 *   情境层（P2/P3/P6）能供给的正是这类记录 ⇒ 迁移让这批**现成的经历**重新可用。
 *
 * 纪律：
 *   · **复用唯一落库实现** `lib/ring-commit.js` 的 `episodes` 通道 —— 不另写第二份写入器（防两套口径漂移）；
 *   · **幂等**：`episode` 记录的 id 由 `title|text` 指纹派生 ⇒ 重复跑不会翻倍；
 *   · **默认 dry-run**（只报告不写），`--apply` 才落库；原文件**只读不删**（留档，可回溯）；
 *   · 库未建 ⇒ exit 3（与 `record-ring.mjs` 同契约）。
 *
 * 用法：
 *   node scripts/migrate-episodes.mjs                 # dry-run：报告将迁多少条
 *   node scripts/migrate-episodes.mjs --apply         # 真迁
 *   node scripts/migrate-episodes.mjs --apply --root <库根>
 * 退出码：0 = pass · 3 = skip（库或源文件缺席）· 1 = fail
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const ROOT = argOf('--root', process.env.MEMORY_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'memory'))
const APPLY = has('--apply')

const H = await import(new URL('../lib/record-shadow.js', import.meta.url).href)
const R = await import(new URL('../lib/ring-commit.js', import.meta.url).href)
const T = await import(new URL('../lib/targets.js', import.meta.url).href)
// 宿主样板判别：**复用唯一实现**（`distill-candidates`；P5 施工中顺带把 `distill.ts` 里的重复副本改成转发）。
// 为什么必须过滤：`episodes.intent` 实测大量含宿主注入块（`Current runtime context` / `<system-reminder>` /
//   Router 指令…）——targest.ts:458 记过「75% 是宿主样板」。**盲迁 = 把样板灌进记忆库**（误注入代价 > 漏注入）。
const C = await import(new URL('../lib/distill-candidates.js', import.meta.url).href)
// ⚠ 源文件在 **suite 知识区**（`knowledgeRoot()/audit/`），**不在记忆库**——审计流与数据分域（本仓 DS4 口径）。
//   实测教训：初版写死 `ROOT/audit/episodes.jsonl` ⇒ 库里根本没有该文件，脚本报"源缺席"。
const SRC = argOf('--src', join(T.knowledgeRoot(), 'audit', 'episodes.jsonl'))

if (!existsSync(H.recordStorePath(ROOT))) {
  console.log(`⏭ 影子库未建（${H.recordStorePath(ROOT)}）——先跑：node scripts/record-sync.mjs --import`)
  process.exit(3)
}
if (!existsSync(SRC)) {
  console.log(`⏭ 源文件缺席（${SRC}）——无需迁移`)
  process.exit(3)
}

const rows = readFileSync(SRC, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
/** 一行 → episodes 通道条目（字段映射**显式**，不靠猜） */
const items = []
let skipped = 0
let skippedNoise = 0
for (const r of rows) {
  // ① 去会话角色标记，② 在宿主注入块处截断，③ **只取首轮意图**（`[assistant]` 之后是回复，不是意图）
  const raw = String(r.intent || '')
    .replace(/^\s*\[(user|assistant|system)\]\s*/i, '')
    .split(/<system-reminder>|Current runtime context|\bRouter:\s*classify/i)[0]
    .split(/\[(?:user|assistant|system)\]/i)[0]
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) { skipped++; continue }
  // ④ 复用唯一实现做样板判别（过滤后仍可能是样板 ⇒ 丢弃，不迁）
  if (C.isNoiseIntent(raw)) { skippedNoise++; continue }
  if (raw.length < 8) { skipped++; continue }
  const sid8 = String(r.sid || '').replace(/^session-/, '').slice(0, 8)
  // ⚠ 只用 `outcome`（真结果）；**不要拿 `route` 冒充结果**（route 是路由分流，不是"后来怎样"）
  const outcome = String(r.outcome || '').trim()
  const text = `[经历] ${raw.slice(0, 160)}${outcome ? ` · 结果：${outcome}` : ''}`
  items.push({
    title: `会话 ${sid8}`,
    text,
    evidence: String(r.at || ''),
    cues: r.lib ? [`scope=workspace:${String(r.lib)}`] : [],
  })
}

console.log(`迁移 episodes → episode 记录（P5）`)
console.log(`  库根：${ROOT}`)
console.log(`  源：${SRC}（${rows.length} 行）`)
console.log(`  可迁：${items.length} 条 · 跳过（无正文）：${skipped} 条 · 跳过（宿主样板）：${skippedNoise} 条`)
console.log(`  模式：${APPLY ? '**--apply（将写入）**' : 'dry-run（只报告，不写）'}`)
if (!items.length) { console.log('\nPASS（无可迁条目）'); process.exit(0) }

if (!APPLY) {
  console.log('\n  样例（前 3 条）：')
  items.slice(0, 3).forEach((it) => console.log(`    - [${it.title}] ${it.text.slice(0, 100)}`))
  console.log('\nPASS（dry-run：未写库；加 --apply 执行）')
  process.exit(0)
}

// 幂等由 ring-commit 的 id 指纹保证；分片调用避免单次过大（每批 50）
const logs = []
let created = 0
for (let i = 0; i < items.length; i += 50) {
  const r = R.commitRingChannels({ log: (m) => logs.push(m), audit: () => {} }, ROOT, { episodes: items.slice(i, i + 50) }, new Date().toISOString(), 'migrate-episodes')
  if (!r.ok) { console.log(`\n❌ 第 ${Math.floor(i / 50) + 1} 批失败：${r.reason || ''}`); process.exit(1) }
  created += r.episodes
}
const after = H.loadStore(ROOT).records.filter((r) => r.kind === 'episode').length
console.log(`\n  本次写入 ${created} 条 · 库内 episode 记录合计 ${after} 条`)
console.log('  ⚠ 原文件**未删**（留档，可回溯）')
if (logs.length) console.log(`  日志：${logs.slice(0, 3).join(' | ')}`)
console.log('\nPASS（迁移完成）')
