#!/usr/bin/env node
// test-carrier-layers.mjs — 【载体层执行 · 行为级回归】
//
// ⚠️ 2026-09-12 Tessa 标注：本文件**不含** memory-append 落盘原子性的任何覆盖。
//    此前审查记录中「本文件 D2 组 18 条断言覆盖原子写」的说法不成立——本文件只有 A1–A5 五组、
//    13 条 ok() 断言，主题是载体层（P/R/E inject）过滤，从未执行 memory-append.mjs。
//    全仓实测：`grep -rln memory-append scripts/` 命中 0 个测试文件 ⇒ 原子写此前是**零覆盖**，
//    不是「假绿灯」。（零覆盖比假绿灯更危险：它连"看起来在测"的错觉都没提供。）
//    原子性的中间态覆盖已新建于 scripts/test-atomic-write.mjs，请以此为准。
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ 本脚本断言「gated 载体不得无差别进入恒定注入面」这条**应然**行为。          │
// │ 历史：2026-09-11 首次落地时它是一支**缺陷固化**脚本（断言在缺陷态下 FAIL、 │
// │   退出码非 0 属预期信号）；缺陷 1 于同日修复后，本脚本语义翻转为           │
// │   **回归护栏**——现在**必须通过**，FAIL 即代表层过滤被回退或绕过。          │
// │ 修复前实测：恒定注入面 67 条索引行中 51 条（76.1%）是 gated 载体。          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// 【被修复的缺陷】file:line + 证据 + 影响面
//   · 位置：src/panel.ts:288（修复前）`const idx = all.filter((l) => /^\[.+\]/.test(l))`
//   · 契约：src/criteria.generated.ts:CARRIERS（源 skill/engine/criteria.json#carriers）
//            P 层 inject=always；R/E 层 inject=gated。note 明言「P 层恒常、不参与相关性竞争；R/E 按任务型/相关性调用」。
//   · 证据：index 分支只按 `^\[.+\]` 通配选取，从不读 layer ⇒ R/E 一律进恒定预算。
//           唯一过滤分支（alwaysProfileTags）只覆盖 **profile 形式**，不覆盖 index 形式。
//   · 影响：R/E 每轮无差别注入，与 P 层争恒定预算；「gated」对 index 载体形同虚设。
//   · 修复：层准入收敛为 targets.ts 的单一实现（`indexRowInLayer` / `indexCarrierSet`，注册表驱动），
//           panel 恒定面调 `indexRowInLayer(l,'always')`；vec 侧重复扫描副本删除（改用 `scanIndexRows`）。
//
// 【断言口径】行为级（behavioral），非纯静态断言。
//   readCarrier / buildHotMemoryText 是 applyPanel 内的闭包，**未导出**，无法直接单测。
//   故用假 ctx 调用导出的 `applyPanel`，注册 systemPrompt.context 钩子，
//   把 MEMORY_ROOT 指向临时夹具库，再调用钩子的 `text()` 拿**真实注入文本**（取证对象是编译产物 lib/panel.js）。
//
// 用法: node scripts/test-carrier-layers.mjs   （先 `npm run build:host` 产出 lib/；npm test 已含 pretest）

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0, pass = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }

// ── 0. 前置：编译产物必须存在 ──
const panelJs = join(repoRoot, 'lib', 'panel.js')
const targetsJs = join(repoRoot, 'lib', 'targets.js')
for (const f of [panelJs, targetsJs]) {
  if (!existsSync(f)) { console.error(`❌ 缺编译产物 ${f}，先跑 npm run build:host`); process.exit(2) }
}

// ── 1. 构造最小夹具：伪 MEMORY.md（P/R/E 混合标签）+ INDEX.md 声明其 layer ──
//    标签与 layer 取自注册表（单一事实源），此处内联快照以便断言。
const REG_LAYERS = {
  原则: { layer: 'P', inject: 'always' }, // P · always  —— 应进注入面
  环境: { layer: 'P', inject: 'always' }, // P · always
  路径: { layer: 'R', inject: 'gated' },  // R · gated   —— 【应被门控，不应无差别注入】
  经验: { layer: 'E', inject: 'gated' },  // E · gated   —— 【同上】
  tool: { layer: 'E', inject: 'gated' },  // E · gated
  flow: { layer: 'E', inject: 'gated' },  // E · gated
}
const fixtureRoot = mkdtempSync(join(tmpdir(), 'sc-carrier-fixture-'))
mkdirSync(join(fixtureRoot, 'notes'), { recursive: true })
mkdirSync(join(fixtureRoot, 'audit'), { recursive: true })

// MEMORY.md：index 形式行（`[tag] 主题 · 概况 → notes/x.md §小节`）
const memRows = [
  '[原则] P层恒定原则 · 描述 → notes/lessons.md §pA', // P
  '[环境] P层用户环境 · 描述 → notes/env.md §pB',     // P
  '[路径] R层任务路径 · 描述 → notes/flows.md §rA',   // R · gated
  '[经验] E层情境经验 · 描述 → notes/lessons.md §eA', // E · gated
  '[tool] E层工具经验 · 描述 → notes/tools.md §eB',   // E · gated
  '[flow] E层流程经验 · 描述 → notes/flows.md §eC',   // E · gated
]
writeFileSync(join(fixtureRoot, 'MEMORY.md'), memRows.join('\n') + '\n', 'utf8')
// 画像行（always:profile 面，非本断言对象；给出以满足渲染器分支不报错）
writeFileSync(join(fixtureRoot, 'USER.md'), '- [边界] 用户边界 ← 源: 会话\n', 'utf8')
writeFileSync(join(fixtureRoot, 'AGENT.md'), '- [性格] agent性格 ← 源: 会话\n', 'utf8')
// INDEX.md：注册表消费侧声明各标签 layer（用于证明层判据源自注册表而非 INDEX.md）
writeFileSync(join(fixtureRoot, 'notes', 'INDEX.md'),
  '# notes/INDEX.md\n\n| 标签 | 层 | 注入性 |\n|---|---|---|\n' +
  Object.entries(REG_LAYERS).map(([t, c]) => `| ${t} | ${c.layer} | ${c.inject} |`).join('\n') + '\n', 'utf8')

// ── 2. 行为取证：applyPanel → systemPrompt.context 钩子 → text() ──
process.env.MEMORY_ROOT = fixtureRoot
const mod = await import(pathToFileURL(panelJs).href)
const hooks = []
const ctx = {
  webServer: { register: () => () => {} },
  effect: (cb) => { try { cb() } catch { /* 非注入路径异常忽略 */ } return () => {} },
  logger: { info: () => {}, warn: () => {} },
  systemPrompt: { context: (h) => { hooks.push(h); return () => {} } },
}
mod.applyPanel(ctx, { state_path: join(fixtureRoot, 'state.json') })
const hook = hooks.find((h) => h && h.name === 'shoucang-hot-memory')
if (!hook) { console.error('❌ 未挂上 shoucang-hot-memory 钩子，无法取证'); rmSync(fixtureRoot, { recursive: true, force: true }); process.exit(2) }
const injected = String(hook.text(undefined) || '')

// 只取「知识索引（MEMORY.md…）」段的行做断言，避开画像段与本夹具无关内容
const idxSection = injected.split('知识索引（MEMORY.md')[1] || injected

// ── 3. 断言（口径：产品【应然】——gated 行不得出现在恒定注入面）──
const pTags = Object.entries(REG_LAYERS).filter(([, c]) => c.inject === 'always')
const gTags = Object.entries(REG_LAYERS).filter(([, c]) => c.inject === 'gated')

console.log('— 夹具已注册标签 = ' + Object.keys(REG_LAYERS).join(', '))
console.log('— P/always 标签 = ' + pTags.map(([t]) => t).join(', '))
console.log('— R,E/gated 标签 = ' + gTags.map(([t]) => t).join(', '))
console.log('— 取证：注入文本中出现的 index 行数 = ' + (idxSection.match(/^-\s*\[/gm) || []).length)
console.log('')

// A1：P 层 always 行必须出现（恒定面的正资产）
for (const [t] of pTags) ok(idxSection.includes(`[${t}]`), `A1 P/always 标签 [${t}] 已进入恒定注入面`)

// A2：R/E 层 gated 行【不得】无差别进入恒定注入面
//     口径边界（重要）：本取证走 `hook.text(undefined)` ⇒ query 为空 ⇒ **不进相关性通道**，
//     故断言的是「位置式基线 + 新鲜度槽」这条**恒定铺开**路径——这正是缺陷面（无差别注入）。
//     有查询时 gated 行可**按需**出现（相关性通道即契约指定的 gated 渲染器），属应然行为，不在本断言范围。
let gatedLeak = 0
for (const [t] of gTags) {
  const leaked = idxSection.includes(`[${t}]`)
  if (leaked) gatedLeak++
  ok(!leaked, `A2 gated 标签 [${t}]（layer=${REG_LAYERS[t].layer}）不应无差别注入 —— 泄漏=${leaked}`)
}

// A3：总括 —— 不得「所有 index 行不问 layer 一律返回」
const allMemReturned = memRows.every((r) => {
  const tag = (r.match(/^\[([^\]]+)\]/) || [])[1]
  return idxSection.includes(`[${tag}]`)
})
ok(!allMemReturned, `A3 不应「全部 ^\\[.+\\] 行不论 layer 一律返回」—— allMemReturned=${allMemReturned}（=true 即层过滤失效）`)

// A4：静态佐证 —— 修复后的源码确实按层准入，且旧的通配写法已消失
const src = readFileSync(join(repoRoot, 'src', 'panel.ts'), 'utf8')
ok(/indexRowInLayer\(l,\s*'always'\)/.test(src), "A4 源码佐证：readCarrier index 分支按层准入（indexRowInLayer(l,'always')）")
const naiveIdx = /const idx = all\.filter\(\(l\) => \/\^\\\[\.\+\\\]\/\.test\(l\)\)/.test(src)
ok(!naiveIdx, 'A4c 旧的「无层过滤通配选取」写法已消失（防修复被回退）')
const readsIndexMd = /readCarrier[\s\S]{0,400}INDEX\.md/.test(src)
ok(!readsIndexMd, `A4b readCarrier 从不读 notes/INDEX.md（层判据源自注册表）—— readsIndexMd=${readsIndexMd}`)

// A5：**反向护栏** —— 层过滤不得演变为「gated 行永远取不回」。
//     恒定面不铺 ≠ 召回不到：gated 载体必须仍能被按需召回（召回侧不限层）。
const tg = await import(pathToFileURL(targetsJs).href)
// 查询覆盖夹具全部主题词（否则「召回不到」只是查询太窄，而非层过滤过严——A5 第一版就踩了这个坑）
const r5 = tg.recallIndex(fixtureRoot, '任务路径 工具经验 情境经验 流程经验 恒定原则 用户环境', 6, 'all')
const gotTags = new Set(r5.rows.map((x) => x.tag))
for (const [t] of gTags) ok(gotTags.has(t), `A5 gated 标签 [${t}] 仍可被召回取回（层过滤 ≠ 丢失）`)
ok(r5.rows.some((x) => REG_LAYERS[x.tag]?.inject === 'always'), 'A5 P/always 行同样可被召回取回（召回通道不限层）')

// A6：**按需通道反向护栏** —— 有查询时 gated 行必须能**按相关性**出现（相关性通道 = 契约指定的 gated 渲染器）。
//     防「过度过滤」：若把相关性通道也锁成 always-only，A2/A5 依然全绿，但 gated 载体将永远无法在注入面现身，
//     缺陷会从「无差别铺开」翻到另一个极端「永远取不到」——两个极端都不能只靠 A2/A5 发现。
// 注意：hook 的入参是**宿主 context**（`context.agent.session.snapshotEvents()` 取最后一条 user/message），
//   不是裸字符串——传字符串会被 `taskTextOf` 读成空 query（A6 第一版就踩了这个坑，误判为"过度过滤"）。
const ctxQ = { agent: { session: { snapshotEvents: () => [{ type: 'user/message', data: { content: [{ text: '任务路径 流程经验' }] } }] } } }
const injectedQ = String(hook.text(ctxQ) || '')
const idxQ = injectedQ.split('知识索引（MEMORY.md')[1] || injectedQ
ok(idxQ.includes('[路径]') || idxQ.includes('[flow]'), 'A6 有查询时 gated 行可按相关性进入知识索引（相关性通道 = gated 渲染器）')
const rowsQ = (idxQ.match(/^-\s*\[/gm) || []).length
ok(rowsQ <= 10, `A6b 按需进入的 gated 行受档位 cap 约束（实测 ${rowsQ} 行 ≤ smart cap 10）`)

// A7：**全 gated 夹具**（= 真实库形状）——MEMORY.md 里**一条 P/always 都没有**。
//   背景：这是本次修复自身引入的**回归**（2026-09-11 上机前代码审查发现，未上机即拦下）：
//   `panel.ts` 的按需通道守卫原为 `if (q && relOn && allMem.length)`，而 `allMem` 在分层过滤后
//   只剩 P/always 行 ⇒ 真实库 MEMORY.md（48 条索引行**全是 E 层 gated**）下 allMem 恒为空
//   ⇒ 守卫恒假 ⇒ 相关性通道（契约指定的 gated 渲染器）**永不执行** ⇒ gated 有无查询都取不到
//   ——正是 A6 要拦的「过度过滤」。**A6 夹具的 MEMORY.md 含 P 层行 ⇒ allMem 非空 ⇒ 守卫通过 ⇒ A6 假绿**。
//   A7 补的就是这个盲区：把夹具摆成真库形状（全 gated），守卫再写错就会在这里红。
const fixture2 = mkdtempSync(join(tmpdir(), 'sc-carrier-fixture2-'))
mkdirSync(join(fixture2, 'notes'), { recursive: true })
mkdirSync(join(fixture2, 'audit'), { recursive: true })
writeFileSync(join(fixture2, 'MEMORY.md'), [
  '[路径] R层任务路径 · 描述 → notes/flows.md §rA',
  '[经验] E层情境经验 · 描述 → notes/lessons.md §eA',
  '[tool] E层工具经验 · 描述 → notes/tools.md §eB',
  '[flow] E层流程经验 · 描述 → notes/flows.md §eC',
].join('\n') + '\n', 'utf8')
writeFileSync(join(fixture2, 'USER.md'), '- [边界] 用户边界 ← 源: 会话\n', 'utf8')
writeFileSync(join(fixture2, 'AGENT.md'), '- [性格] agent性格 ← 源: 会话\n', 'utf8')
writeFileSync(join(fixture2, 'notes', 'INDEX.md'), '# notes/INDEX.md\n', 'utf8')

process.env.MEMORY_ROOT = fixture2
const mod2 = await import(pathToFileURL(panelJs).href + '?v=all-gated') // 破 ESM 缓存，让新 env 生效
const hooks2 = []
const ctx2 = {
  webServer: { register: () => () => {} },
  effect: (cb) => { try { cb() } catch { /* 非注入路径异常忽略 */ } return () => {} },
  logger: { info: () => {}, warn: () => {} },
  systemPrompt: { context: (h) => { hooks2.push(h); return () => {} } },
}
mod2.applyPanel(ctx2, { state_path: join(fixture2, 'state.json') })
const hook2 = hooks2.find((h) => h && h.name === 'shoucang-hot-memory')
const idx2 = (String(hook2 ? hook2.text(undefined) || '' : '')).split('知识索引（MEMORY.md')[1] || ''
const leak2 = gTags.filter(([t]) => idx2.includes(`[${t}]`)).map(([t]) => t)
ok(leak2.length === 0, `A7-1 全 gated 夹具：无查询时恒定注入面 0 条 gated（实测泄漏 ${leak2.length}：${leak2.join(',') || '无'}）`)
// A7-2 = 回归点：有查询时 gated 必须仍能经相关性通道现身（守卫 `&& allMem.length` 会让它恒为 0）
const ctxQ2 = { agent: { session: { snapshotEvents: () => [{ type: 'user/message', data: { content: [{ text: '任务路径 工具经验 流程经验' }] } }] } } }
const idx2q = (String(hook2 ? hook2.text(ctxQ2) || '' : '')).split('知识索引（MEMORY.md')[1] || ''
const gated2q = gTags.filter(([t]) => idx2q.includes(`[${t}]`)).map(([t]) => t)
ok(gated2q.length > 0, `A7-2 全 gated 夹具：有查询时 gated 仍能经相关性通道现身（实测 ${gated2q.join(',') || '无'}）——「&& allMem.length」回归护栏`)
// A7-3：回补的 gated 行仍受档位 cap 约束（防「能取回」滑向「无上限铺开」，与 A6b 同口径）
const rows2q = (idx2q.match(/^-\s*\[/gm) || []).length
ok(rows2q > 0 && rows2q <= 10, `A7-3 全 gated 夹具：回补的 gated 行受档位 cap 约束（实测 ${rows2q} 行，须 1~10）`)

// ── 4. 结论 ──
rmSync(fixtureRoot, { recursive: true, force: true })
rmSync(fixture2, { recursive: true, force: true })
console.log('')
console.log('──────────────────────────────────────────────────────────')
console.log(`结果: ${pass} PASS / ${fail} FAIL`)
console.log(`gated 泄漏行数: ${gatedLeak} / ${gTags.length}`)
console.log(fail
  ? '结论: FAIL —— 层过滤被回退或绕过，恒定注入面又在不分层的铺 gated 载体。'
  : '结论: PASS —— 恒定面只收 P/always；gated 载体仍可按需召回（A5 反向护栏通过）。')
console.log('──────────────────────────────────────────────────────────')
process.exit(fail ? 1 : 0)
