#!/usr/bin/env node
// test-ledger-compact.mjs —— **统一台账按 type 裁剪**单测（`ledger-compact.ts` · 2026-09-13）
//
// 为什么必须有这一件：裁剪是**破坏性**操作（重写整个共享台账）。它的失败模式很重：
//   若裁错 type 或按"末 N 行"而不是"末 N 条同 type"，就会**把别的 type 的事件一起删掉**——
//   而台账是 best-effort（各写入点 catch 静默）⇒ 删错了**不会有人报错**。
//   故把「只删同 type 的最旧行 · 其他 type 原样且顺序不变 · 未超阈值绝不动手」钉成断言。
//
// 用法: node scripts/test-ledger-compact.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const { planCompaction, compactFile } = await import(load('lib/ledger-compact.js'))
const tmp = mkdtempSync(join(tmpdir(), 'sc-compact-'))
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 清理失败无害 */ } })

const j = (type, n) => JSON.stringify({ at: `2026-09-13T00:00:${String(n).padStart(2, '0')}.000Z`, type, n })
const types = (ls) => ls.map((l) => JSON.parse(l).type)
const nums = (ls) => ls.map((l) => JSON.parse(l).n)

console.log('== A. planCompaction：只删同 type 的最旧行 ==')
{
  const lines = [j('a', 1), j('b', 1), j('a', 2), j('b', 2), j('a', 3), j('a', 4)]
  const kept = planCompaction(lines, 'a', 2, 0)
  ok(kept !== null, 'A1 超阈值 ⇒ 返回保留集（非 null）')
  ok(kept.filter((l) => JSON.parse(l).type === 'a').length === 2, 'A2 目标 type 只留末 2 条')
  ok(kept.filter((l) => JSON.parse(l).type === 'b').length === 2, 'A3 **其他 type 一条不少**')
  ok(JSON.stringify(types(kept)) === JSON.stringify(['b', 'b', 'a', 'a']), `A4 其他 type 顺序不变（实测 ${types(kept).join(',')}）`)
  ok(nums(kept.filter((l) => JSON.parse(l).type === 'a')).join(',') === '3,4', 'A5 留的是**最新的**两条（3,4）')
}

console.log('== B. 阈值语义：未超 `keepLast + slack` 绝不动手 ==')
{
  const lines = [j('a', 1), j('a', 2), j('a', 3)]
  ok(planCompaction(lines, 'a', 3, 8) === null, 'B1 3 ≤ 3+8 ⇒ null（不重写文件）')
  ok(planCompaction(lines, 'a', 2, 1) === null, 'B2 3 ≤ 2+1 ⇒ null')
  ok(planCompaction(lines, 'a', 2, 0) !== null, 'B3 3 > 2+0 ⇒ 动手')
}

console.log('== C. 边界与安全 ==')
{
  ok(planCompaction([], 'a', 5, 0) === null, 'C1 空文件 ⇒ null')
  ok(planCompaction([j('b', 1)], 'a', 0, 0) === null, 'C2 目标 type 零条 ⇒ null（不误删别人的行）')
  const bad = ['{坏行', j('a', 1), j('a', 2)]
  const kept = planCompaction(bad, 'a', 0, 0)
  ok(kept !== null && kept.includes('{坏行'), 'C3 **坏行视为不可裁剪**（解析失败 ⇒ 保留，不因裁剪丢证据）')
  ok(planCompaction([j('a', 1)], 'a', 0, 0) !== null, 'C4 keepLast=0 ⇒ 允许清空该 type 的历史')
  ok(planCompaction([j('a', 1)], 'a', -1, 0) === null, 'C5 非法 keepLast<0 ⇒ null（防御，不删）')
}

console.log('== D. compactFile：真文件 + 原子替换 + 备份 ==')
{
  const f = join(tmp, 'ledger.jsonl')
  const rows = [j('decision.ingest', 1), j('a', 1), j('decision.ingest', 2), j('a', 2), j('a', 3)]
  writeFileSync(f, rows.join('\n') + '\n', 'utf8')
  const r = compactFile(f, 'a', 1, 0)
  ok(r === 'compacted', `D1 触发裁剪（返回 ${r}）`)
  const after = readFileSync(f, 'utf8').trim().split('\n')
  ok(after.filter((l) => JSON.parse(l).type === 'decision.ingest').length === 2, 'D2 **其他 type 行数不变**（2 条 decision.ingest 全在）')
  ok(after.filter((l) => JSON.parse(l).type === 'a').length === 1, 'D3 目标 type 留 1 条')
  ok(after.length === 3, `D4 总行数 5 → 3（实测 ${after.length}）`)
  const baks = readdirSync(tmp).filter((n) => n.includes('.bak-compact-'))
  ok(baks.length === 1, `D5 裁剪前**已备份**（实测 ${baks.length} 个备份）`)
  ok(!readdirSync(tmp).some((n) => n.includes('.tmp-')), 'D6 无 tmp 残留（rename 成功）')
  ok(compactFile(f, 'a', 1, 8) === 'noop', 'D7 余量内再裁 ⇒ noop（不重复重写）')
  ok(compactFile(join(tmp, 'nope.jsonl'), 'a', 1, 0) === 'missing', 'D8 文件不存在 ⇒ missing')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
