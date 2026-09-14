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
 * **归一化：只守「结构骨架」，不守「记忆内容」**（2026-09-14 修正 · S4Y）。
 *
 * 为什么必须归一化：**记忆库是活的** —— 深睡、蒸馏、其他会话**持续写**（实测：本门首版在
 * 深睡产出 3 条原则后立刻假红，随后又因新增原则再次假红）。若把"内容行变化"当失败，
 * 这个门在活跃系统里会**频繁假红**，最终被人静音 —— 那就等于没有。
 *
 * 归一化规则：`- ` 开头的行是**记忆条目**（画像行 / 索引行），替换为占位符；
 *   其余行（抬头 / 段标题 / 省略提示 / 三层判据块 / 情境块标题）**原样保留比对**。
 * ⇒ 记忆增删**不报**，而**结构/格式/顺序/裁切提示**的任何变化**仍会抓到** —— 后者才是本门要守的。
 */
const normalize = (t) => String(t).split('\n').map((l) => (/^-\s/.test(l) ? '- <row>' : l)).join('\n')

const PORT = process.env.DSH_PORT || '3080'
const base = `http://127.0.0.1:${PORT}/api/shoucang-panel/inject/preview`
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
