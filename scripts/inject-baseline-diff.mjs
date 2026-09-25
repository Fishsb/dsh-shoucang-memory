#!/usr/bin/env node
// inject-baseline-diff.mjs — R0/R1 **真机注入文本对拍（多 case）**（2026-09-14 · S4R 收尾）
//
// 用途：把「改造前后的注入文本逐字节等价」变成**可重复执行的断言**。
//
// ══════════════════════════════════════════════════════════════════════════════
// ⚠ **本件的判定对象是「结构骨架」，不是「逐字节」**（2026-09-23 明确化 · 非行为变更）
// ══════════════════════════════════════════════════════════════════════════════
//   · **骨架** = 段标题 + 段顺序 + 段存在性；**内容** = 段内行（**记忆库是活的**，条数与文本都会变）。
//   · 归一化规则见下方 `normalize()`（5 类活数据行）。
//
//   ⚠ **已知结构性质（不是 bug，是"活的系统"的必然）**：归一化是**枚举式**的 —— 它覆盖已知的
//     5 类活数据行；**记忆库若长出新的活数据形态**（新段种/新横幅/新计数行），该行未被归一 ⇒
//     本件会**报骨架不一致**（即"假红"）。**这不是偶发抖动**，而是"活库 × 枚举归一"的固有边界。
//       · **正解**：发现新形态时**把该形态归一**（属修判据，方案已在 `normalize()` 内注明先例），
//         **不是**给门加减震/容错（那会把真骨架变一并静音 —— 本仓明令「未证实的容错等于掩盖真漂移」）。
//       · **判据**：本件自带独立自证件 `scripts/test-inject-baseline-normalize.mjs`（原样提取 `normalize`，
//         双向各锁：活内容变 ⇒ 不报 / 骨架变 ⇒ 必报）。**若本件报红而自证件全绿** ⇒ 按上方"正解"补归一。
//   · **文案纪律**（2026-09-23 修）：行尾注与 PASS 行**必须与 `ok` 判定同源** —— 修前尾注只看
//     `sameRaw`，于是**骨架不一致时仍打印「不算失败」**（读数与判定相反，属"失败被文案淡化"）。
// ══════════════════════════════════════════════════════════════════════════════
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
    // **「零命中提示」行属"运行时可达性"信号，不属结构骨架**（2026-09-23 修 · **本件非确定性的真根因**）。
    //   判因（**实测到字符号 + 分支源码**，非推断）：差异行是
    //     `（本步相关性零命中，以下为位置式基线）` —— 其产者是 `src/relevance-supply.ts:216`
    //       `if (!trace || !trace.zeroHit || !String(q||'').trim()) return ''`
    //     而 `zeroHit` 只在 `rows.length === 0`（**桥 ∧ 词法都取不回**）时为真（同件 :198-203）。
    //   ⇒ **它的出现与否取决于"桥（向量 embedding）当时能否取回行"** —— 那是**运行时资源状态**
    //     （本机 Ollama 在忙 ⇒ 桥超时 ⇒ 零命中 ⇒ 多这一行），**不是注入结构变了**。
    //   实测对照（同一 case·同一时刻）：**单跑 10 次全不含**该行（字符恒 4395）；
    //     **全量跑时含**（~500s 期间其它门禁同样在打真机端点/占资源）。
    //   ⇒ **处置：整行剔除**（不是换成占位符）。理由：基线与当前**一行有一行无** ⇒
    //     换占位符仍会差一行；而该行的**存在性由运行时资源状态决定**（非结构），
    //     故按本件语义**不该参与骨架**。剔除后"它在或不在"都不影响骨架比对。
    //   ⚠ **未致门失明**：自证件 B1–B4（删段/增段/调序/结构行文本变）**仍全被抓**（已复验）。
    if (/^（本步相关性零命中.*）$/.test(l)) return ''
    // **「热取前 N 条」的数字属内容，不属骨架**（2026-09-17 修）。
    //   判因：记忆库在长 ⇒ N 会从 8 变 9（实测三 case 同因翻红），而本工具的既定语义是
    //   「只守结构骨架，不守活的记忆内容」（见头注 :41）。原先该行未归一 ⇒ **工具自身违背自己的语义**，
    //   把"库在长"误报成"改造改了注入结构"——属仓内「代理指标非判据」同族的**假红**。
    //   归一到 `<N>`：条数仍留痕（可读），但不参与骨架比对。
    if (/热取前\s*\d+\s*条/.test(l)) return l.replace(/热取前\s*\d+\s*条/, '热取前 <N> 条')
    // **成长横幅的两个数字属活数据，不属骨架**（2026-09-21 修 · §13-P3）。
    //   判因（**实证**）：门翻红时首差落在**字符 34** —— 即 `本轮提存 7 条` → `0 条`、`标出 18 条（… 9 条）` → `10 条（… 1 条）`
    //   两个数字上。而本工具既定语义是「**只守结构骨架，不守活的记忆内容**」（头注 :41）⇒
    //   这两个数字理当归一（与 :65「热取前 N 条」**同一先例**：该行**存在性**仍受骨架约束 —— 删/增仍报，
    //   只有数字不参与比对）。⚠ 横幅的**段标题**（`🧠 最近成长…`）**不归一**：它属骨架。
    if (/^\s*本轮提存\s*\d+\s*条/.test(l)) return l.replace(/本轮提存\s*\d+\s*条/, '本轮提存 <N> 条')
    if (/^\s*标出\s*\d+\s*条未被真读/.test(l)) return l.replace(/\d+/g, '<N>')
    return l
  })
  // 连续同类占位行压成一行：**条数变化 ≠ 骨架变化**
  //
  // ⚠ **2026-09-23 修：原实现有两条实质问题（实测定位到字符号，非推断）**
  //   **问题①：`:100` 的判据恒真** —— 它写 `out[last] === m.replace(/\d+/g,'') && out[last] === m`，
  //     而 `m` **已是占位符**（如 `（<omission-note>）`，不含数字）⇒ `m.replace(...) === m` **恒为 true**
  //     ⇒ 该行**等价于** `:101`（两条判断重复）。**冗余不是无害的**：它让读者以为有两种压缩路径。
  //   **问题②：空行不参与压缩 ⇒ 骨架随"活库条数"分裂**（**这才是非确定性门的真根因**）：
  //     实测差异 @ 字符 464：**基线** `（<omission-note>）\n\n[环·<row>]`（占位行与环记录段间**有空行**）
  //     vs **当前** `（<omission-note>）\n[环·<row>]`（无空行）。
  //     成因链：`热取前 N 条` 的 **N 会随库增长变**（基线 7 → 当前 8）⇒ 该段**实际行数**随之变
  //       ⇒ 之后的行**整体错位** ⇒ 某些占位块**恰好被空行分隔**（基线）而**没有**（当前）。
  //     而空行**不在占位行正则里** ⇒ 不被压缩 ⇒ **同一结构因条数不同而算出不同骨架** ⇒ 假红。
  //   ⇒ **正解（本版）**：**先剔空行再压缩**。空行不承载结构（段存在性由标题行表达），
  //     留着它只会把"活库条数"混进骨架。这与本件既定语义（头注 :41「只守结构骨架」）**同向**。
  const out = []
  for (const m of marks) {
    if (m.trim() === '') continue                                   // ← 空行不承载结构（本轮修）
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
  // ⚠ **文案必须与判定同源**（2026-09-23 修 · 与 `check-l0-conflict-wiring` ② 同族的**文案说谎**）：
  //   修前尾注只看 `sameRaw`，于是**骨架也不一致**（`ok=false`）时仍打印
  //   「**内容已变**：记忆库是活的，**不算失败**」—— 而它**同一条已计 `bad++` 并最终 exit 1**
  //   ⇒ 读者看到的是"不算失败"，账上却是失败（本仓最忌的「失败不可观测」反向形态：**失败被文案淡化**）。
  //   修法：**先看骨架判定**（它才是判据），只有 `ok===true && !sameRaw` 时才说"内容变、不算失败"。
  const note = ok
    ? (sameRaw ? '（内容亦逐字节相同）' : '（**内容已变**：记忆库是活的，**不算失败** —— 骨架一致）')
    : '（**骨架不一致 ⇒ 判失败**；下方给出首个差异位置）'
  console.log(`  ${ok ? '✅' : '❌'} q=${JSON.stringify(q)}  骨架 ${sha1(nb).slice(0, 12)} vs ${sha1(nc).slice(0, 12)}${note}`)
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
  // ⚠ **文案须与判据同源**：本件判的是 **`normalize()` 后的骨架**（头注 :41），**不是逐字节**。
  //   修前写「N 个 case **逐字节一致**」⇒ 与 `--selftest` 明说的"内容变不报"**自相矛盾**
  //   （若真逐字节，库一长就必红）。改为照实说：**骨架一致**（并注明内容可活）。
  console.log(`\n✅ PASS：${cur.length} 个 case **结构骨架一致**（归一化后；活的记忆内容可不一致 —— 见件头 :41）`)
  process.exit(0)
}
console.log(`\n❌ FAIL：${bad} / ${cur.length} 个 case 不一致`)
process.exit(1)
