#!/usr/bin/env node
// test-process-supply.mjs — S4-3「中层 process 槽」断言（2026-09-14 · S4 消费链条）
//
// 守什么：`selectProcessLines` 把 `[路径]` 行按**标签**取出（**不走内容相关性竞争**），且三条纪律成立 ——
//   ① **缺省零行为变化**（`enabled !== true` ⇒ 空）；② 只取**声明标签**（`[原则]` 等不得混入）；
//   ③ **去重 + topN 有界**（不得把同一行重复塞进注入面）。
//
// 判因：人类三层里**中层是唯一没有专用通路的层** —— `[路径]`（可复用步骤）原经 R 层 gated 相关性召回，
//   与知识索引行争同一 `dynamic` 预算 ⇒ 过程指引会被"内容相关性"挤掉。
//
// 用法: node scripts/test-process-supply.mjs   （先 npm run build:host）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/dynamic-select.js', import.meta.url).href)
const { selectProcessLines } = mod
if (typeof selectProcessLines !== 'function') {
  console.log('❌ lib/dynamic-select.js 未导出 selectProcessLines（先 npm run build:host）')
  process.exit(1)
}

const ROWS = [
  '[路径] 合成路径甲 · 占位说明 → notes/合成.md §合成甲',
  '[原则] 合成原则甲 · 占位说明 → notes/合成.md §合成乙',
  '[路径] 合成路径乙 · 占位说明 → notes/合成.md §合成丙',
  '[路径] 合成路径丙 · 占位说明 → notes/合成.md §合成丁',
  '[env] 合成环境甲 · 占位说明 → notes/合成.md §合成戊',
  '[路径] 合成路径丁 · 不该被 topN=3 取到 → notes/x.md §y',
]

console.log('S4-3 中层 process 槽（按标签供给）')

// ── ① 缺省零行为变化 ──
ok(selectProcessLines(ROWS).length === 0, '① 未传 opts ⇒ 空（**缺省零行为变化**）')
ok(selectProcessLines(ROWS, { enabled: false }).length === 0, '① `enabled:false` ⇒ 空')
ok(selectProcessLines(ROWS, { enabled: true }).length > 0, '① `enabled:true` ⇒ 有输出（开关可控）')

// ── ② 只取声明标签（缺省 `[路径]`）──
{
  const out = selectProcessLines(ROWS, { enabled: true, topN: 10 })
  ok(out.length === 4, `② 只取 4 条 \`[路径]\`（实际 ${out.length}）—— \`[原则]\`/\`[env]\` 不得混入`)
  ok(out.every((l) => /^\[路径\]/.test(l)), '② 输出行全部以 `[路径]` 开头')
  ok(!out.some((l) => l.includes('合成原则甲')), '② 未混入 `[原则]` 行')
}

// ── ③ topN 有界 + 顺序稳定（按输入序）──
{
  const out3 = selectProcessLines(ROWS, { enabled: true, topN: 3 })
  ok(out3.length === 3, '③ `topN:3` ⇒ 恰 3 条')
  ok(out3[0].includes('合成路径甲') && out3[2].includes('合成路径丙'), '③ 顺序 = 输入序（稳定，不重排 —— 重排归调用方）')
  ok(!out3.some((l) => l.includes('第四步')), '③ 第 4 条 `[路径]` 未越界取入')
}

// ── ④ 自定义标签 + 去重 ──
{
  const out = selectProcessLines(ROWS, { enabled: true, carrierTag: ['原则'], topN: 5 })
  ok(out.length === 1 && out[0].includes('合成原则甲'), '④ `carrierTag` 可配（此处取 `[原则]`）')
  const dup = ['[路径] A → notes/a.md §x', '[路径] A → notes/a.md §x', '[路径] B → notes/b.md §y']
  ok(selectProcessLines(dup, { enabled: true, topN: 5 }).length === 2, '④ **去重**：同文两次只留一条（不得重复塞入注入面）')
}

// ── ⑤ 边界：空输入 / 无匹配标签 / 坏行 ──
{
  ok(selectProcessLines([], { enabled: true }).length === 0, '⑤ 空输入 ⇒ 空')
  ok(selectProcessLines(['无标签行', '', '  '], { enabled: true }).length === 0, '⑤ 无标签/空行 ⇒ 空（不抛）')
  ok(selectProcessLines(ROWS, { enabled: true, topN: 0 }).length === 3, '⑤ `topN:0` ⇒ 回落下限 3（**不返回空**，避免"开关开了却没内容"）')
}

// ── ⑥ 反例自证：若不过滤标签，会把全部行都取出来 ──
{
  const wrong = ROWS.slice(0, 3) // 不过滤标签、不做 topN
  ok(wrong.length === 3 && selectProcessLines(ROWS, { enabled: true, topN: 10 }).length === 4, '⑥ 反例自证：不过滤标签会混入 `[原则]`/`[env]`（本件按标签过滤，语义有效）')
}

// ── ⑦ Q4（2026-09-20）`gate` 开关：**成对断言**（命中则入 / 不命中**不**入）──
//   判因：原实现完全不读 query ⇒ 真机三个语义无关 query 得到同一组 3 条（位置门控被写成
//   「任务型门控」）。本组必须**成对**验证，只测正向 = 未验（判据 Q4-A1）。
{
  const rows = [
    '[路径] 插件运行时注入 · ①状态自测 ②脚手架 → notes/env.md §插件注入',
    '[路径] 深睡记忆蒸馏 · ①取值传参 ②三通道 → notes/flows.md §深睡蒸馏',
    '[路径] 服务重启判生效 · ①比对PID → notes/lessons.md §服务与重启约束',
  ]
  // 缺省（不传 gate）⇒ tag 行为，与改造前逐字等价
  const legacy = selectProcessLines(rows, { enabled: true, topN: 3 })
  const tagGate = selectProcessLines(rows, { enabled: true, topN: 3, gate: 'tag' })
  ok(legacy.length === 3 && legacy.join('|') === tagGate.join('|'), '⑦ **缺省=tag 逐字等价**（gate 缺省是旧行为，零行为变化）')
  // 拼写错误不得静默改变行为（非 'task' 一律回落 tag）
  const typo = selectProcessLines(rows, { enabled: true, topN: 3, gate: 'Task' })
  ok(typo.join('|') === tagGate.join('|'), '⑦ 非 `task` 值（含大小写错）⇒ 回落 tag（不静默变行为）')
  // 正向：命中任务键 ⇒ 入
  const hit = selectProcessLines(rows, { enabled: true, topN: 3, gate: 'task', taskKeys: ['插件'] })
  ok(hit.length === 1 && hit[0].includes('插件运行时注入'), '⑦ 任务键命中 ⇒ 入（正向）')
  // 反向：不命中 ⇒ **不**入（缺此半条即假绿）
  const miss = selectProcessLines(rows, { enabled: true, topN: 3, gate: 'task', taskKeys: ['不存在的任务键xyz'] })
  ok(miss.length === 0, '⑦ 任务键不命中 ⇒ **不**入（反向，成对断言的另一半）')
  // 空键 ⇒ 不筛（回落 tag 行为，防「开了开关却空槽」退化）
  const empty = selectProcessLines(rows, { enabled: true, topN: 3, gate: 'task', taskKeys: [] })
  ok(empty.length === 3, '⑦ `taskKeys` 空 ⇒ 不筛（回落 tag，**不空槽**）')
  // 量纲守卫：0.55 不得出现在本门控路径（dense sim ≠ 离散命中）
  const src = readFileSync(join(root, 'src', 'dynamic-select.ts'), 'utf8')
  ok(!/familiarThreshold|0\.55/.test(src), '⑦ **拒复用 0.55**：门控路径不得出现 `familiarThreshold`/`0.55`（量纲误用）')
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（中层 process 槽断言全过）')
process.exit(fail ? 1 : 0)
