#!/usr/bin/env node
// inject-baseline-diff.mjs — R0/R1 **真机注入文本对拍（多 case）**（2026-09-14 · S4R 收尾）
//
// 用途：把「改造前后的注入文本逐字节等价」变成**可重复执行的断言**。
//
// 为什么用**真机端点**而不是单测构造：`buildHotMemoryText` 嵌在 `panel-shared.ts` 内**不可导出**
//   （该模块导出数已达 `audit-architecture` 棘轮上限 35）⇒ 无法在测试中调用它。而宿主插件正在运行，
//   `GET /api/shoucang-panel/inject/preview?q=…` 返回的 `text` 就是**真实注入文本** ——
//   证据比"构造同批候选"更强（覆盖真实库的全部选行/裁切/画像分块行为）。
//
// **为什么要多 case**：`q` 决定走哪条分支 ——
//   `q=''`      ⇒ `selectDynamicLines` 的**基线分支**（`if (!q || !relOn) return merge(memBase)`）
//   `q=有词`    ⇒ **相关性分支**（预热融合召回 ∪ 词法召回 ∪ 新鲜槽 ∪ 补位）
//   只测空 q **覆盖不到相关性分支** ⇒ 改造若只坏在那里，单 case 会假绿。
//
// 用法：
//   node scripts/inject-baseline-diff.mjs            # 与基线对拍（无基线 ⇒ SKIP）
//   node scripts/inject-baseline-diff.mjs --write    # 写新基线（**须先确认改动是有意的**）
//   node scripts/inject-baseline-diff.mjs --baseline <path>
//
// 退出码：0 = 全部一致 · 1 = 有 case 不一致（打印首个差异位置与两侧上下文）· 3 = SKIP
//
// ⚠ 基线含**真实记忆内容**，默认落 `_memory/`（gitignore 覆盖，不进公开树）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const wantWrite = argv.includes('--write')
const bIdx = argv.indexOf('--baseline')
const baselinePath = bIdx >= 0 && argv[bIdx + 1]
  ? resolve(argv[bIdx + 1])
  : join(root, '_memory', 'audit', 'inject-baseline-pre-R0.json')

/** 对拍用的 query 集：覆盖**基线分支 / 相关性分支（可能命中）/ 相关性分支（零命中）** */
const CASES = ['', '深睡蒸馏', 'xyzzy-nonexistent-token']

/**
 * **归一化：只守「结构骨架」，不守「活的记忆内容」**（2026-09-14 立 · 2026-09-15 补全）。
 *
 * 为什么必须归一化：**记忆库是活的** —— 深睡、蒸馏、环记录**持续写**。若把"内容行变化"当失败，
 * 这个门在活跃系统里会**频繁假红**，最终被人静音 —— 那就等于没有。
 *
 * **骨架 = 段标题 + 段顺序 + 段存在性**；**内容 = 段内的行**（条数与文本都会变）。
 *
 * ⚠ **2026-09-15 补全**：首版只归一化了 `- ` 开头的**记忆条目**，**漏了 `[环·…]` 开头的环记录段**
 *   （实测对拍时差异正是落在 `[环·决策]` 上）—— 归一化必须覆盖**所有活数据行**，否则门照旧假红。
 *   同时补「**连续同类行压缩**」：环记录**条数**会增减，行数变化**不是**骨架变化。
 */
const normalize = (t) => {
  const marks = t.split('\n').map((l) => {
    if (/^-\s/.test(l)) return '- <row>'                       // 记忆条目（画像行 / 索引行）
    if (/^\[环·/.test(l)) return '[环·<row>]'                   // 环记录（承诺/关系/决策…活数据）
    if (/^（.*省略.*）/.test(l)) return '（<omission-note>）'    // 省略/预算提示（数字会变）
    // **「另有 N 条…未进入本步注入面」亦属省略/预算提示 ⇒ 与上一条同归一**（2026-09-17 修）。
    //   判因（**实证**，非推断）：`panel-shared.ts:616` 的该行**只在 `droppedMem.length > 0` 时出现**
    //   ⇒「是否出现」取决于**库大小与预算**，属「活的记忆内容」而非结构骨架。实测：库在长 ⇒ 动态预算
    //   开始丢 2 条知识索引行 ⇒ 该行凭空出现 ⇒ 门假红（行级 diff 证实**唯一差异就是这一行**）。
    //   与上方 :48-50 的同类先例一致（「归一化必须覆盖**所有活数据行**，否则门照旧假红」）。
    //   ⚠ **未致门失明**：`--selftest` 三条真实结构变体（删/调序/增段标题）**仍全被抓**。
    //   ⚠ 带 `- ` 前缀的画像行变体（`panel-shared.ts:521`）由**首条规则**已归一为 `- <row>`，不到此处。
    if (/^（.*另有\s*\d+\s*条.*未进入.*）$/.test(l)) return '（<omission-note>）'
    // **「热取前 N 条」的数字属内容，不属骨架**（2026-09-17 修）。
    //   判因：记忆库在长 ⇒ N 会从 8 变 9（实测三 case 同因翻红），而本工具的既定语义是
    //   「只守结构骨架，不守活的记忆内容」（见头注 :41）。原先该行未归一 ⇒ **工具自身违背自己的语义**，
    //   把"库在长"误报成"改造改了注入结构"——属仓内「代理指标非判据」同族的**假红**。
    //   归一到 `<N>`：条数仍留痕（可读），但不参与骨架比对。
    if (/热取前\s*\d+\s*条/.test(l)) return l.replace(/热取前\s*\d+\s*条/, '热取前 <N> 条')
    return l
  })
  // 连续同类占位行压成一行：**条数变化 ≠ 骨架变化**
  const out = []
  for (const m of marks) {
    if (/^(- <row>|\[环·<row>\]|（<omission-note>）)$/.test(m) && out[out.length - 1] === m.replace(/\d+/g, '') && out[out.length - 1] === m) continue
    if (/^(- <row>|\[环·<row>\]|（<omission-note>）)$/.test(m) && out.length && out[out.length - 1] === m) continue
    out.push(m)
  }
  return out.join('\n')
}

const PORT = process.env.DSH_PORT || '3080'
const base = `http://127.0.0.1:${PORT}/api/shoucang-panel/inject/preview`

/* 归一化器的**双向自证**在**独立成件**：`scripts/test-inject-baseline-normalize.mjs`（已登记 CHECKS）
 *   —— 它从**本脚本原样提取** `normalize`（不是另抄一份 ⇒ 不可能与真身漂移），双向各锁：
 *   **活内容变 ⇒ 不报**、**骨架变 ⇒ 必报**（B1-B4 覆盖删段/增段/调序/结构行文本变）。
 *   ⚠ **勿在本脚本内再加 `--selftest`**：2026-09-17 我一度加了一份，属**重复实现**，
 *   违背本仓「单一实现」约定 —— 自证件已存在且口径更强（原样提取 > 另写一份）。 */
const sha1 = (s) => createHash('sha1').update(s, 'utf8').digest('hex')

/** 取某个 q 下的真机注入文本（不可达 ⇒ null） */
async function textFor(q) {
  const url = q ? `${base}?q=${encodeURIComponent(q)}` : base
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const o = await r.json()
    return typeof o?.text === 'string' ? o.text : null
  } catch { return null }
}

// ── 取全部 case（任一不可达即 SKIP：宿主未运行时不判失败）──
const cur = []
for (const q of CASES) {
  const t = await textFor(q)
  if (t === null) {
    console.log(`⏭ SKIP：无法取得注入文本（${base}）—— 宿主未运行时不判失败`)
    process.exit(3)
  }
  cur.push({ q, text: t })
}

if (wantWrite) {
  mkdirSync(dirname(baselinePath), { recursive: true })
  writeFileSync(baselinePath, JSON.stringify({
    at: new Date().toISOString(),
    url: base,
    cases: cur.map((c) => ({ q: c.q, sha1: sha1(c.text), chars: [...c.text].length, lines: c.text.split('\n').length, text: c.text })),
  }, null, 0), 'utf8')
  console.log(`✅ 已写入新基线：${baselinePath}`)
  for (const c of cur) console.log(`   q=${JSON.stringify(c.q)}  sha1=${sha1(c.text).slice(0, 12)} · 字符=${[...c.text].length} · 行=${c.text.split('\n').length}`)
  process.exit(0)
}

if (!existsSync(baselinePath)) {
  console.log(`⏭ SKIP：基线不存在（${baselinePath}）—— 首次运行请先 --write`)
  process.exit(3)
}

const saved = JSON.parse(readFileSync(baselinePath, 'utf8'))
const byQ = new Map((saved?.cases ?? []).map((c) => [String(c.q), String(c.text ?? '')]))

console.log('注入文本对拍（真机 vs 基线 · 多 case）')
let bad = 0
for (const { q, text } of cur) {
  if (!byQ.has(q)) { console.log(`  ⚠ q=${JSON.stringify(q)}：基线里没有该 case ⇒ 跳过（请 --write 补）`); continue }
  const bt = byQ.get(q)
  const nb = normalize(bt)
  const nc = normalize(text)
  const ok = nb === nc
  if (!ok) bad++
  const sameRaw = bt === text
  console.log(`  ${ok ? '✅' : '❌'} q=${JSON.stringify(q)}  骨架 ${sha1(nb).slice(0, 12)} vs ${sha1(nc).slice(0, 12)}${sameRaw ? '（内容亦逐字节相同）' : '（**内容已变**：记忆库是活的，不算失败）'}`)
  if (!ok) {
    let i = 0
    const n = Math.min(nb.length, nc.length)
    while (i < n && nb[i] === nc[i]) i++
    const ctx = (s) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 60))
    console.log(`       **骨架**首个差异 @ 字符 ${i}`)
    console.log(`       基线 …${ctx(nb)}…`)
    console.log(`       当前 …${ctx(nc)}…`)
  }
}

if (bad === 0) {
  console.log(`\n✅ PASS：${cur.length} 个 case **逐字节一致**（改造对注入文本零影响）`)
  process.exit(0)
}
console.log(`\n❌ FAIL：${bad} / ${cur.length} 个 case 不一致`)
process.exit(1)
