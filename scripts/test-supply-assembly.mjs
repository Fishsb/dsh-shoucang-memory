#!/usr/bin/env node
// test-supply-assembly.mjs —— G4 读侧装配 **直接单测**（supply-assembly.ts）
//
// 为什么必须有这一件：装配的三条规则一旦静默失守，表现都是"看起来正常"：
//   ① **恒定面每步必在**（方案档 I2a）——被预算挤掉时若不显式记账，就是"人格静默消失"（仓内有过先例：
//      画像行被 `^\[` 过滤掉，永久不可见）；
//   ② **溢出必须可见**——静默截断会让"这次没给"看起来像"库里没有"；
//   ③ **联想槽独立**——若与相关性面共用预算，α_rel 越强越不会发生越界碰撞（精度与惊喜数学对立），
//      且启用它时**总预算上升必须可读**，不许悄悄多花上下文。
//
// 用法: node scripts/test-supply-assembly.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
let fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const SA = await import(load('lib/supply-assembly.js'))
const S = await import(load('lib/record-store.js'))

const L = (n, c = 'x') => `${c.repeat(n)}` // 造行长

console.log('== A. 预算口径 ==')
{
  ok(SA.DEFAULT_BUDGET.stable === 1000 && SA.DEFAULT_BUDGET.dynamic === 600 && SA.DEFAULT_BUDGET.oneshot === 200, '缺省三层预算 = 方案档 §13 #3（1000/600/200）')
  ok(SA.DEFAULT_BUDGET.serendipity === 0, '联想槽缺省 **0**（关闭：不许悄悄多花上下文）')
  ok(SA.budgetTotalOf(SA.DEFAULT_BUDGET) === 1800, `总预算 ${SA.budgetTotalOf(SA.DEFAULT_BUDGET)}（§13 #3 注入硬顶）`)
  ok(SA.budgetTotalOf({ ...SA.DEFAULT_BUDGET, serendipity: 300 }) === 2100, '启用联想槽 ⇒ 总预算**显式上升**（不是偷偷挤占）')
}

console.log('== B. 空输入与确定性 ==')
{
  const r = SA.assembleSupply({})
  ok(r.meta.chars === 0 && r.meta.dropped.length === 0 && !r.meta.overBudget, '空输入 ⇒ 零字符、零丢弃、不超预算')
  ok(SA.renderSupplyText(r) === '', '空装配渲染为空串（不产空标题）')
  const inp = { core: ['c1'], stable: ['s1', 's2'], dynamic: ['d1'], oneshot: ['o1'] }
  ok(JSON.stringify(SA.assembleSupply(inp)) === JSON.stringify(SA.assembleSupply(inp)), '同输入 ⇒ 同输出（确定性）')
}

console.log('== C. 核心必进 + 溢出可见（I2a）==')
{
  const big = L(1200)
  const r = SA.assembleSupply({ core: [big], stable: ['s1'] }, { ...SA.DEFAULT_BUDGET })
  ok(r.blocks.core === big, '**核心必进**：单行超预算仍保留（不静默丢身份/边界）')
  ok(r.meta.overBudget === true, '超预算被显式标记（overBudget）')
  ok(r.meta.chars > SA.DEFAULT_BUDGET.stable, `字符账 ${r.meta.chars} > 恒定面额度 ${SA.DEFAULT_BUDGET.stable}（核心必进把它顶穿了）`)
  // 恒定面溢出：后面的行必须被记账，不许静默
  const many = Array.from({ length: 30 }, (_, i) => `${i}`.padEnd(80, 'y'))
  const r2 = SA.assembleSupply({ stable: many })
  ok(r2.meta.dropped.length > 0, `恒定面超预算 ⇒ 有被挡下的行（${r2.meta.dropped.length} 行）`)
  ok(r2.meta.dropped.every((d) => d.slot === 'stable' && d.line && d.why), '每条丢弃都带 slot/原行/原因（可诊断）')
  ok(r2.meta.kept.stable + r2.meta.dropped.length === many.length, 'kept + dropped = 候选数（无凭空消失）')
  ok(r2.blocks.stable.split('\n').every((l) => many.includes(l)), '**整条进或整条丢**（无半截行）')
}

console.log('== D. 变动面：按调用方给序，不重排 ==')
{
  const r = SA.assembleSupply({ dynamic: ['第一', '第二', '第三'] })
  ok(r.blocks.dynamic === '第一\n第二\n第三', '顺序 = 调用方顺序（本件不读打分，不形成第二份排序实现）')
  const r2 = SA.assembleSupply({ dynamic: ['aaaa', 'bbbb'] }, { stable: 0, dynamic: 6, oneshot: 0, serendipity: 0 })
  ok(r2.meta.kept.dynamic === 1 && r2.meta.dropped[0].slot === 'dynamic', `变动面按预算截断（留 ${r2.meta.kept.dynamic} 丢 ${r2.meta.dropped.length}）`)
}

console.log('== E. 联想槽：独立预算 + 互不挤占 ==')
{
  const pairs = [
    { a: { id: 'a1', text: '甲行正文', section: '甲', file: 'MEMORY.md', cold: 99 }, b: { id: 'b1', text: '乙行正文', section: '乙', file: 'USER.md', cold: 99 }, span: 2.5, why: 'x' },
    { a: { id: 'a2', text: '丙行正文', section: '丙', file: 'MEMORY.md', cold: 88 }, b: { id: 'b2', text: '丁行正文', section: '丁', file: 'AGENT.md', cold: 88 }, span: 2.1, why: 'y' },
  ]
  const off = SA.assembleSupply({ dynamic: ['d'], serendipity: pairs })
  ok(off.blocks.serendipity === '' && off.meta.serendipityEnabled === false, '联想槽缺省关 ⇒ 不产出（即使传了候选）')
  const on = SA.assembleSupply({ dynamic: ['d'], serendipity: pairs }, { ...SA.DEFAULT_BUDGET, serendipity: 300 })
  ok(on.meta.serendipityEnabled === true && on.meta.kept.serendipity === 2, '开启后产出联想行')
  ok(/甲 ⨯ 乙/.test(on.blocks.serendipity) && /跨度 2.5/.test(on.blocks.serendipity), '联想行含两侧小节与跨度（人读可辨）')
  ok(on.blocks.dynamic === 'd', '**联想槽不挤占变动面**（两者各自成槽）')
  ok(on.meta.chars === off.meta.chars + on.blocks.serendipity.length + 1, '总字符账包含联想槽（上升可见）')
  ok(on.meta.budgetTotal === 2100, 'meta 回报总预算 2100（可读，不静默）')
  // 联想槽自身超预算
  const tiny = SA.assembleSupply({ serendipity: pairs }, { stable: 0, dynamic: 0, oneshot: 0, serendipity: 10 })
  ok(tiny.meta.dropped.some((d) => d.slot === 'serendipity'), '联想槽超预算 ⇒ 同样进丢弃账（同规矩）')
}

console.log('== F. 渲染 ==')
{
  const r = SA.assembleSupply({ core: ['C'], stable: ['S'], dynamic: ['D'], oneshot: ['O'] })
  const t = SA.renderSupplyText(r)
  ok(t.includes('【核心】') && t.includes('【恒定面】') && t.includes('【变动面】') && t.includes('【一次性】'), '渲染含各段标题')
  ok(!t.includes('【越界联想】'), '空段不产标题（联想槽关时不出现）')
  const t2 = SA.renderSupplyText(r, { headers: { core: '【Header】' } })
  ok(t2.includes('【Header】'), '标题可覆盖（贴合宿主文案）')
  const r3 = SA.assembleSupply({ stable: Array.from({ length: 20 }, () => L(80)) })
  ok(SA.renderSupplyText(r3, { annotateOverflow: true }).includes('因预算挡下'), '附溢出说明行（可选）')
  ok(!SA.renderSupplyText(r3).includes('因预算挡下'), '缺省不附（不额外占字符）')
}

console.log('== G. 候选集：时态失效者**不得入候选**（双时间戳的读侧闭环）==')
{
  const mk = (text, id, extra = {}) => ({ ...S.makeRecord({ text, file: 'MEMORY.md', id, pointer: 'notes/x.md §甲' }), ...extra })
  const AT = '2026-09-15T00:00:00.000Z'
  const recs = [
    mk('[身份] 我是谁 · x', 'core1'),
    mk('[env] 活的', 'live1'),
    { ...mk('[env] 死的', 'dead1'), validTo: '2026-09-01T00:00:00.000Z', meta: { staleNote: '版本已升' } },
    { ...mk('[env] 坏的', 'bad1'), validTo: '不是时间' },
    { ...S.makeRecord({ text: '- 用户偏好：极简 ← 源: distill x', file: 'USER.md', id: 'prof1' }) },
    S.makeRecord({ text: '# 标题', file: 'MEMORY.md', id: 'struct1' }),
    S.makeRecord({ text: '[碰撞] a ⨯ b｜c', file: '', kind: 'association', id: 'assoc1' }),
  ]
  const c = SA.buildCandidates(recs, { at: AT })
  ok(c.core.length === 1 && c.core[0].includes('[身份]'), '核心必进按标签分层（缺省 身份/使命/边界）')
  ok(c.stable.length === 1 && c.stable[0].includes('← 源:'), `**画像行进恒定面**（P 层 always 的另一种 form；实测曾被误判进变动面）`)
  ok(c.dynamic.length === 1, '其余可注入者落变动面')
  const all = [...c.core, ...c.stable, ...c.dynamic].join('\n')
  ok(!all.includes('[env] 死的'), '**已失效者不入候选**')
  ok(!all.includes('[env] 坏的'), '坏时间戳按失效处理 ⇒ 同样不入候选（fail-closed）')
  ok(c.expired.length === 2, `被剔者进 expired 清单（${c.expired.length} 条，不静默消失）`)
  ok(c.expired.some((e) => /版本已升/.test(e.why)), '剔除原因带失效因由（可复核）')
  // ⚠ 语义订正（2026-09-14 · 拟人化方案 A3）：`file === ''` 的语义是「**无 md 投影**」（Record 独有），
  //   **不是**「不可注入」。旧实现把两者混进同一个条件 ⇒ 环记录被静默丢弃（实测 980 条里带环语义的 9 条全部零注入，
  //   而它们恰是"经历"所在）。现按 kind 分流：属已登记环者进 `ring` 桶（交 `ring-supply` 走情境通道），
  //   只有**真无内容**（结构/空白/空文本）才计 notInjectable。故本组断言由「环记录计入 notInjectable」改为：
  //   结构行仍计入 notInjectable，**环记录进 ring 桶**——并继续断言它**不混入** core/stable/dynamic。
  ok(c.notInjectable === 1, `无内容者（结构行）计入 notInjectable（${c.notInjectable}）`)
  ok(c.ring.length === 1 && c.ring[0].id === 'assoc1', `环记录进 **ring 桶**（不再被静默丢弃；${c.ring.length} 条）`)
  ok(!all.includes('[碰撞]'), '环记录**不混入** core/stable/dynamic（走独立情境通道，不挤占相关性面）')
  ok(JSON.stringify(SA.buildCandidates(recs, { at: AT })) === JSON.stringify(c), '同 at ⇒ 同结果（不吃隐式 now，可复现）')
  // 组合：装配结果里绝不出现失效行
  const assembled = SA.assembleSupply({ core: c.core, stable: c.stable, dynamic: c.dynamic, oneshot: [] })
  ok(!SA.renderSupplyText(assembled).includes('死的'), '**端到端**：装配+渲染后失效行不出现')
  const c2 = SA.buildCandidates(recs, { at: '2026-08-01T00:00:00.000Z' })
  ok(!c2.expired.some((e) => e.id === 'dead1') && c2.expired.length === 1, '判定时刻早于 validTo ⇒ 该条**仍有效**（时态判定真按时刻走，不是一刀切）')
}

console.log('== H. 溢出判据：逐槽比自身额度（2026-09-22 修「恒真」）==')
{
  /* 判因（真机实测 · 修前恒真）：原式 `chars > budgetTotal || stableChars > budget.stable`
   *   把**全部槽**的字符和（含 `situation` 独立预算、`process` **不参与限额**）去比**三层**总额
   *   ⇒ 真机 `chars=4064 > 4000` 恒 true，而三层逐项都没超（stable 2799/3200 · dyn 360/600 · one 70/200）。
   * 本组钉住「**非受限槽不得把 overBudget 顶成 true**」，且**真超时必须仍能 true**（防改成恒假）。 */
  const big = L(500)
  // ① 三层都在额度内，但 situation/process 很大 ⇒ **不得**判溢出（真机形态）
  //   ⚠ 行数×长度必须让**总量真的越过 budgetTotal**（真机：4064 > 4000），否则本 case 无区分力
  //     —— 首版只放 4 行 ⇒ 总量 2013 < 4000，等于没测到那个边界（自查抓到）。
  const meta = SA.supplyMetaOf({
    stable: { kept: ['s1'] },
    dynamic: { kept: ['d1'] },
    oneshot: { kept: ['o1'] },
    situation: { kept: Array.from({ length: 7 }, () => big) },   // 3507
    process: { kept: Array.from({ length: 3 }, () => big) },     // 1503（只补账、**不参与限额**）
  }, { stable: 3200, dynamic: 600, oneshot: 200, serendipity: 0, situation: 4000 },
    { budgetTotal: 4000 })
  ok(meta.overBudget === false,
    `① 三层未超而 situation/process 撑大总量 ⇒ **不判溢出**（实得 ${meta.overBudget}；这正是真机修前的恒真形态）`)
  ok(meta.chars > meta.budgetTotal,
    `① 前置成立：字符总量 ${meta.chars} 确实 > 总额 ${meta.budgetTotal}（否则本 case 无区分力）`)
  // ② 真超恒定面额度 ⇒ **必须** true（防"恒真改成恒假"的假修）
  const over = SA.supplyMetaOf({ stable: { kept: [big, big, big, big, big, big, big] } },
    { stable: 100, dynamic: 600, oneshot: 200, serendipity: 0, situation: 0 }, { budgetTotal: 4000 })
  ok(over.overBudget === true, `② 恒定面真超额度 ⇒ **仍判溢出**（实得 ${over.overBudget}）—— 判据具区分力，非恒假`)
  // ③ 情境槽超**自己的**额度 ⇒ 判溢出（独立槽也要有闸）
  const sitOver = SA.supplyMetaOf({ situation: { kept: [big, big, big] } },
    { stable: 3200, dynamic: 600, oneshot: 200, serendipity: 0, situation: 100 }, { budgetTotal: 4000 })
  ok(sitOver.overBudget === true, `③ 情境槽超自身额度 ⇒ 判溢出（实得 ${sitOver.overBudget}）`)
  // ④ `budgetTotalOf` **不得**把 process（行数，非字符额度）计入字符总额（量纲混用）
  ok(SA.budgetTotalOf({ stable: 100, dynamic: 50, oneshot: 20, serendipity: 0, situation: 0, process: 999 }) === 170,
    `④ budgetTotalOf 只累加**参与限额**的槽（process 是行数 ⇒ 不计；实得 ${SA.budgetTotalOf({ stable: 100, dynamic: 50, oneshot: 20, serendipity: 0, situation: 0, process: 999 })}，期望 170）`)
  // ⑤ 两处实现同源：`isOverBudget` 被两个出口共用（防"只修一处"）
  /* ⚠ **必须剥注释再匹配**（首次实跑踩到）：判因注释里**引用了旧式原文**作说明
   *   （`overBudget: chars > …`），不剥注释就会把**判因文本**当成**残留代码**判红。
   *   本仓既有同款纪律：`check-carriers` / `check-injection-reach` 的「先剥注释再匹配」。 */
  const stripC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const src = stripC(readFileSync(join(repoRoot, 'src', 'supply-assembly.ts'), 'utf8'))
  const calls = (src.match(/isOverBudget\(/g) || []).length
  ok(calls >= 3, `⑤ 溢出判据**单一实现**：isOverBudget 定义 + 两处调用（实测出现 ${calls} 次）`)
  ok(!/overBudget:\s*chars\s*>/.test(src), '⑤ **旧式已清除**：不再有 `overBudget: chars > …` 的旧写法（恒真的根因）')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
