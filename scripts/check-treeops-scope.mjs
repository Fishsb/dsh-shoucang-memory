#!/usr/bin/env node
// check-treeops-scope.mjs —「节范围口径单一实现」门（S4Z · 2026-09-14）
//
// **判因（G-22 · 真修）**：`treeops` 的 level 过滤原**散落四处、各自手写**
//   （rename 手写 L2/L3 · split 手写 L2 · split 自查手写 L3 · **merge 漏了过滤**）
//   ⇒ merge 会匹配并落盘 **L4（`####`）**，实证造成**已落盘的树结构破坏**
//   （cody-loss 2026-09-12：整节消失 + 跨容器搬运 + 孤儿空容器）。
//
// **只给 merge 补一个 filter 是"补丁"** —— 它对齐了第二处，却没消除"每处手写"这个结构，
//   下一处新 op 仍会漏。本门是**真修的另一半**：把口径收敛到 `OP_SCOPE` + `scopeOf`，
//   并用机检**禁止**再出现手写 filter。
//
// 断言：
//   A1 `scopeOf` / `OP_SCOPE` 存在（口径表 + 唯一落点）；
//   A2 全文件里"手写 level 过滤"**只允许 1 处**，且必须落在 `scopeOf` 的实现体内；
//   A3 **反例自证**：给一个带手写过滤的样本 ⇒ 本门必须能检出（否则断言恒真）。
//
// 用法: node scripts/check-treeops-scope.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const p = join(root, 'src', 'treeops.ts')
if (!existsSync(p)) { console.log('❌ src/treeops.ts 不存在'); process.exit(1) }
const src = readFileSync(p, 'utf8')
const lines = src.split('\n')

console.log('节范围口径单一实现（G-22 真修）')

// ── A1 口径表 + 唯一落点存在 ──
ok(/const OP_SCOPE = \{/.test(src), 'A1 `OP_SCOPE` 口径表存在（各 op 的可操作 level 集中一处声明）')
ok(/export const scopeOf = /.test(src), 'A1 `scopeOf` 存在（唯一 filter 落点）')

// ── A2 手写 level 过滤只允许 1 处，且在 scopeOf 内 ──
/** 手写过滤的特征：`.filter(...)` 同行出现 `.level`（`OP_SCOPE` 表本身不含 `.filter`，不会误报） */
const scan = (text) => text.split('\n')
  .map((l, i) => ({ ln: i + 1, line: l }))
  .filter((x) => /\.filter\(/.test(x.line) && /\.level\b/.test(x.line))
const hits = scan(src)
ok(hits.length === 1, `A2 手写 level 过滤**只允许 1 处**（实际 ${hits.length} 处${hits.length ? '：' + hits.map((h) => 'L' + h.ln).join(', ') : ''}）`)
const scopeLn = lines.findIndex((l) => l.includes('export const scopeOf =')) + 1
const scopeEndLn = (() => { // scopeOf 的实现体：从其行起，到下一个顶层声明（行首非空白）为止
  for (let i = scopeLn; i < lines.length; i++) if (/^\S/.test(lines[i]) && i + 1 > scopeLn) return i
  return lines.length
})()
if (hits.length === 1) {
  const ln = hits[0].ln
  ok(ln > scopeLn && ln <= scopeEndLn, `A2 该处落在 \`scopeOf\` 实现体内（L${ln} ∈ (L${scopeLn}, L${scopeEndLn}]）—— 不在则说明有人就地手写`)
}

// ── A3 反例自证：本门必须能检出手写过滤（否则 A2 恒真）──
{
  const bad = 'x\n  const s2 = sections.filter((s) => s.level === 2)\ny\n'
  ok(scan(bad).length === 1, 'A3 反例自证：注入一处手写过滤 ⇒ 本门检出（断言语义有效，非恒真）')
  const clean = 'x\n  const s2 = scopeOf(sections, \'splitTarget\')\ny\n'
  ok(scan(clean).length === 0, 'A3 反例自证：改用 `scopeOf` ⇒ 不报（不误伤正解）')
}

// ── A4 口径表覆盖全部 op（新增 op 必须登记，防"忘了加"）──
{
  const ops = ['rename', 'merge', 'splitTarget', 'splitConflict']
  const missing = ops.filter((o) => !new RegExp(`\\b${o}:\\s*\\[`).test(src))
  ok(missing.length === 0, `A4 \`OP_SCOPE\` 覆盖已知 op（缺：${missing.join(', ') || '无'}）`)
  const used = ops.filter((o) => new RegExp(`scopeOf\\([^)]*'${o}'`).test(src))
  ok(used.length === ops.length, `A4 四个 op 都已改用 \`scopeOf\`（未用：${ops.filter((o) => !used.includes(o)).join(', ') || '无'}）`)
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（节范围口径单一实现门全过）')
process.exit(fail ? 1 : 0)
