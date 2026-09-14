#!/usr/bin/env node
// test-render-opts.mjs — S4R/R1「渲染等价化」断言（2026-09-14 · S4 收尾）
//
// 守什么：`renderSupplyText` 的新选项（`order` / `separator` / `headers` 空串 / `tailNote`）
//   足以**逐字节复现主路径形态**，且**缺省行为与 R1 之前相同**（既有调用方零影响）。
//
// **本件的「先红」用例是核心**（X1）：它断言「**缺省选项渲染 ≠ 主路径形态**」——
//   这是"两套渲染确实不同"的**可执行证据**。若 X1 失败，说明差异不存在，那么 R1 的整个前提就是错的。
//   按验收方案 §0：凡"等价/不变"类断言，其反命题**必须先被证明成立**。
//
// 用法: node scripts/test-render-opts.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/supply-assembly.js', import.meta.url).href)
const { renderSupplyText } = mod
if (typeof renderSupplyText !== 'function') {
  console.log('❌ lib/supply-assembly.js 未导出 renderSupplyText（先 npm run build:host）')
  process.exit(1)
}

/** 夹具：三段有内容、三段空（覆盖"空段不产标题"） */
const mk = (over = {}) => ({
  blocks: { core: '', stable: 'STABLE-A\nSTABLE-B', dynamic: 'DYN-A', oneshot: 'ONE-A', serendipity: '', situation: '', ...over },
  meta: {
    chars: 0, budgetTotal: 4000, overBudget: false, serendipityEnabled: false, situationEnabled: false,
    kept: { stable: 2, dynamic: 1, oneshot: 1, serendipity: 0, situation: 0 }, dropped: [],
  },
})

/** **主路径形态**：逐字对照 `panel-shared#buildHotMemoryText` 的文本拼接（段序 oneshot→stable→dynamic、
 *  段间 `'\n'`、段内容自带标题故外层不加、末尾可有一行预算省略提示）。 */
const mainPathForm = (res, tail) => {
  const parts = []
  if (res.blocks.oneshot) parts.push(res.blocks.oneshot)
  if (res.blocks.stable) parts.push(res.blocks.stable)
  if (res.blocks.dynamic) parts.push(res.blocks.dynamic)
  if (tail) parts.push(tail)
  return parts.join('\n')
}

/** 复现主路径所需的选项集 */
const MAIN_OPTS = {
  order: ['oneshot', 'stable', 'dynamic'],
  separator: '\n',
  headers: { core: '', stable: '', dynamic: '', oneshot: '', serendipity: '', situation: '' },
}

console.log('S4R/R1 渲染等价化')

const R = mk()
const TAIL = '（本步受预算 4000 字符约束省略 3 行；按需 get_file 读取）'

// ── X1【先红】缺省选项 ≠ 主路径形态（证明"两套渲染确实不同"）──
{
  const def = renderSupplyText(R)
  const main = mainPathForm(R)
  ok(def !== main, 'X1【先红】缺省选项渲染 **≠** 主路径形态 —— 两套渲染确实不同（R1 的前提成立）')
  let i = 0
  const n = Math.min(def.length, main.length)
  while (i < n && def[i] === main[i]) i++
  console.log(`     首个差异 @ 字符 ${i}：缺省 ${JSON.stringify(def.slice(Math.max(0, i - 25), i + 25))}`)
  console.log(`                             主路径 ${JSON.stringify(main.slice(Math.max(0, i - 25), i + 25))}`)
}

// ── X2 加选项后**逐字节相等**（等价能力达成 —— R1 的核心）──
{
  const off = renderSupplyText(R, MAIN_OPTS)
  ok(off === mainPathForm(R), 'X2 使用 order+separator+空标题 ⇒ **逐字节 == 主路径形态**（等价达成）')
  const offWithTail = renderSupplyText(R, { ...MAIN_OPTS, tailNote: TAIL })
  ok(offWithTail === mainPathForm(R, TAIL), 'X2 `tailNote` ⇒ 末尾省略行也逐字节 == 主路径（含提示行的情形）')
}

// ── X3 缺省行为 == R1 之前（既有调用方零影响）──
{
  const def = renderSupplyText(R)
  const legacy = ['【恒定面】\nSTABLE-A\nSTABLE-B', '【变动面】\nDYN-A', '【一次性】\nONE-A'].join('\n\n')
  ok(def === legacy, 'X3 **缺省输出与 R1 之前逐字节相同**（共享接口只做增量扩展 ⇒ 既有调用方零影响）')
  const flipped = renderSupplyText(R, { order: ['oneshot', 'stable', 'dynamic'] })
  ok(flipped.startsWith('【一次性】'), 'X3 只配 `order`（不配 separator/headers）也生效 ⇒ 选项彼此独立')
}

// ── X4 既有选项未被破坏 ──
{
  const withOverflow = renderSupplyText({ ...R, meta: { ...R.meta, dropped: [{}, {}] } }, { annotateOverflow: true })
  ok(withOverflow.includes('本次因预算挡下 2 行'), 'X4 `annotateOverflow` 仍工作（既有行为未破坏）')
  const custom = renderSupplyText(R, { headers: { stable: '【我的恒定面】' } })
  ok(custom.includes('【我的恒定面】\nSTABLE-A'), 'X4 `headers` 覆盖仍工作（非空标题路径未破坏）')
  ok(!renderSupplyText(mk({ core: '' })).includes('【核心】'), 'X4 空段不产标题（既有纪律保持）')
}

// ── X5 反例自证：separator 改回缺省即不等 ⇒ X2 语义有效、非恒真 ──
{
  const wrong = renderSupplyText(R, { ...MAIN_OPTS, separator: '\n\n' })
  ok(wrong !== mainPathForm(R), 'X5 反例自证：`separator` 一项错 ⇒ 立刻不等（X2 不是恒真断言）')
  const wrong2 = renderSupplyText(R, { ...MAIN_OPTS, headers: {} }) // 不给空标题 ⇒ 多出【段名】行
  ok(wrong2 !== mainPathForm(R), 'X5 反例自证：`headers` 不给空串 ⇒ 多出段标题 ⇒ 不等（第 7 处差异确实存在）')
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（渲染等价化断言全过）')
process.exit(fail ? 1 : 0)
