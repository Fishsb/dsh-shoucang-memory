#!/usr/bin/env node
/**
 * test-ledger-rotation.mjs — 台账**体积轮转 + 跨档读**的行为测试（圆桌会审 D-M5 · 2026-09-17）
 *
 * 为什么必须有它：轮转的失效模式是**静默的** —— 写侧轮转了、读侧没跨档，表现就是
 *   "数据看起来丢了"（本仓前例：单读主档致蒸馏水位回放**命中 0 轮**，见 `src/audit-source.ts` 头注）。
 *   仅靠"跑一遍门禁 PASS"**验不出**它：门禁不读台账。故本件直接对**行为**断言，且**带反例自证**。
 *
 * 判据（全部可机检，逐条打印）：
 *   ① cap 内 ⇒ `noop`（不轮转）
 *   ② 超 cap ⇒ `rotated`，主档 → `.1`，原 `.1` → `.2`，最旧 `.3` 被丢
 *   ③ 档位数上限 = keep（**不存在 `.4`**）
 *   ④ `readLedgerVolumes` **按时间序**：最旧档在前、主档在后
 *      —— 顺序错 ⇒ `deepsleep-machine` 取"最后一条"会取到旧值（静默错值，不报错）
 *   ⑤ **反例自证**：模拟"读侧没改"（只读主档）⇒ 行数**显著少于**跨档读 ⇒ 证明"不改就丢"
 *   ⑥ 文件不存在 ⇒ `missing` + 空数组（**零抛出**）
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LEDGER_VOLUMES, readLedgerVolumes, rotateBySize } from '../lib/ledger-compact.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`) } else { fail++; console.error(`  ❌ ${m}`) } }

const dir = join(tmpdir(), 'sc-ledger-rot-' + Date.now())
mkdirSync(dir, { recursive: true })
const file = join(dir, 'ledger.jsonl')
const line = (tag, i) => JSON.stringify({ at: new Date(Date.now() + i).toISOString(), type: 'audit.x', tag })

try {
  // ① cap 内 ⇒ noop
  writeFileSync(file, line('a', 1) + '\n', 'utf8')
  ok(rotateBySize(file, 10 * 1024 * 1024) === 'noop', '① cap 内 ⇒ noop（不轮转）')

  // ②③ 造四轮超 cap 写入，验证搬家与丢弃
  const CAP = 200 // 极小 cap：每轮都会触发
  const tags = []
  for (let round = 1; round <= LEDGER_VOLUMES + 1; round++) {
    writeFileSync(file, Array.from({ length: 5 }, (_, i) => line(`r${round}-${i}`, i)).join('\n') + '\n', 'utf8')
    tags.push(`r${round}-0`)
    rotateBySize(file, CAP)
  }
  ok(existsSync(`${file}.1`) && existsSync(`${file}.2`), '② 超 cap ⇒ 主档 → .1，原 .1 → .2（逐档顺移）')
  ok(!existsSync(`${file}.${LEDGER_VOLUMES + 1}`), `③ 档位数上限 = ${LEDGER_VOLUMES}（不存在 .${LEDGER_VOLUMES + 1}）`)

  // ④ 跨档读按时间序
  const all = readLedgerVolumes(file)
  const firstTags = all.map((l) => JSON.parse(l).tag || '')
  const idxOf = (t) => firstTags.findIndex((x) => x === t)
  const [oldest, newest] = [`r2-0`, `r${LEDGER_VOLUMES + 1}-0`]
  ok(idxOf(oldest) >= 0 && idxOf(newest) > idxOf(oldest),
    `④ 跨档读**按时间序**（${oldest} 在 ${newest} 之前；实测 ${idxOf(oldest)} < ${idxOf(newest)}）`)

  // ⑤ 反例自证：只读主档（模拟读侧没改）
  // ⚠ 轮转后主档被**重建为空**（`rotateBySize` 的行为）⇒ 这里同时断言该不变量：
  //   否则"轮转完成 → 下次 append"之间主档不存在，`existsSync(主档)` 型守卫会读成"无台账"。
  ok(existsSync(file) && readFileSync(file, 'utf8').trim() === '',
    '⑤a 轮转后主档被**重建为空文件**（消除"主档不存在"的瞬态）')
  const mainOnly = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()) : []
  ok(mainOnly.length < all.length,
    `⑤b 反例自证：**只读主档**得 ${mainOnly.length} 行 < 跨档 ${all.length} 行 ⇒ 读侧不跨档就是丢数据（不是"没数据"）`)

  // ⑥ 不存在 ⇒ missing + 空
  const missing = join(dir, 'nope.jsonl')
  ok(rotateBySize(missing, CAP) === 'missing' && readLedgerVolumes(missing).length === 0,
    '⑥ 文件不存在 ⇒ missing + 空数组（零抛出）')
} finally {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* 清理失败无害 */ }
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
