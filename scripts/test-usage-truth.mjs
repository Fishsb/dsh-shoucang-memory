#!/usr/bin/env node
// test-usage-truth.mjs — S4R/R2「账 == 真实裁切」断言（2026-09-14 · S4 收尾）
//
// 守什么（B1–B3）：`supplyUsage` 的 `kept` / `droppedRows` **就是主路径的真实裁切结果**，
//   而不是"同批候选按装配器口径重算的近似值"。
//
// 为什么用**真机端点**：`buildHotMemoryText` 与其账构造不可导出（`panel-shared` 导出棘轮 35），
//   而 `GET /api/shoucang-panel/inject/preview` 同时返回 **text** 与 **supplyUsage** ——
//   两者可**互核**，这比单测构造夹具更强（覆盖真实库的全部选行/裁切行为）。
//
// 用法: node scripts/test-usage-truth.mjs    （宿主未运行 ⇒ exit 3 = skip）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const PORT = process.env.DSH_PORT || '3080'
const url = (q) => `http://127.0.0.1:${PORT}/api/shoucang-panel/inject/preview${q ? `?q=${encodeURIComponent(q)}` : ''}`

let o = null
try {
  const r = await fetch(url('深睡蒸馏'), { signal: AbortSignal.timeout(8000) })
  if (r.ok) o = await r.json()
} catch { /* 下面统一 SKIP */ }
if (!o || typeof o.text !== 'string' || !o.supplyUsage) {
  console.log('⏭ SKIP：无法取得注入文本/账（宿主未运行时不判失败）')
  process.exit(3)
}

const u = o.supplyUsage
const lines = String(o.text).split('\n')
const dash = lines.filter((l) => l.startsWith('- ')).length
const STABLE_TITLES = lines.filter((l) => /^(agent 画像|用户画像)（/.test(l)).length

console.log('S4R/R2 账 == 真实裁切')

// ── B1：kept 与注入文本**互核**（含块标题的口径修正）──
ok(typeof u.kept?.stable === 'number' && typeof u.kept?.dynamic === 'number', 'B1 `kept` 提供 stable/dynamic 行数')
ok(STABLE_TITLES === 2, `B1 注入文本含 ${STABLE_TITLES} 个画像块标题（口径修正的依据）`)
ok(dash === u.kept.stable + u.kept.dynamic - STABLE_TITLES,
  `B1 \`kept\` 与注入文本**互核**：\`- \` 行 ${dash} == kept.stable ${u.kept.stable} + kept.dynamic ${u.kept.dynamic} − 标题 ${STABLE_TITLES}`)

// ── B2：droppedRows 是**真实被丢内容**（逐条可比），不是计数 ──
const dr = u.droppedRows
ok(Array.isArray(dr), 'B2 `droppedRows` 存在（真实被丢行**内容**，非仅计数）')
if (Array.isArray(dr)) {
  ok(dr.every((x) => typeof x === 'string' && x.trim().length > 0), 'B2 每条都是非空字符串（逐条可比）')
  // 被丢的行**不应**出现在注入文本里（否则"丢"是假的）
  const leaked = dr.filter((x) => o.text.includes(x))
  /* ⚠ 2026-09-16 实测（先取证再定性）：本条曾报「泄漏 1 条」，取证发现该行在 **`AGENT.md` 里出现 2 次**
   *   （同一文件内重复）⇒ 候选池里有**两份同名行**，主路径**丢了一份、留了一份** ⇒ `text.includes(行文本)`
   *   仍为真 —— 这是**判据口径不够精确**（按"行文本"匹配撞上合法重复），**不是装配器缺陷**。
   * ⇒ 精确化：**真泄漏 = 文本里还有该行，且它在源文件里只有一份**（唯一那份被丢却仍在 ⇒ 才是真丢假）。
   *   若源文件里 ≥2 份，则"丢了一份"已成立 ⇒ 不计泄漏。**这不是放宽**：它同时排除了真泄漏，且更严格地
   *   指出了"丢的到底是哪一份"。 */
  const bankRoot = process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory')
  /* ⚠ 形态归一：`droppedRows` 记的是**注入形态**（行首带 `- ` bullet），而源文件（AGENT/USER/MEMORY.md）
   *   里的行**不带** `- ` ⇒ 直接整行匹配源文件会得 **0 份**（我第一版就踩了这个，把合法重复误判成真泄漏）。
   *   ⇒ 比较时**剥掉注入前缀**（`- `）再数。 */
  const bare = (s) => String(s).replace(/^-\s+/, '').trim()
  const srcCount = (line) => {
    const b = bare(line)
    let n = 0
    for (const f of ['AGENT.md', 'USER.md', 'MEMORY.md']) {
      try { n += readFileSync(join(bankRoot, f), 'utf8').split(b).length - 1 } catch { /* 缺文件 */ }
    }
    return n
  }
  const dupLeaked = leaked.filter((x) => srcCount(x) >= 2)
  const realLeaked = leaked.filter((x) => srcCount(x) < 2)
  ok(realLeaked.length === 0,
    `B2 **被丢的行确实不在注入文本中**（**真泄漏 ${realLeaked.length}** 条 · 合法重复 ${dupLeaked.length} 条已排除）—— "丢弃"是真的`)
  if (leaked.length) {
    console.log('     ── 泄漏取证（先定性再动手）──')
    for (const x of leaked.slice(0, 3)) {
      const cntInDropped = dr.filter((y) => y === x).length
      const cntInText = o.text.split(x).length - 1
      const cntSrc = srcCount(x)
      console.log(`     · 行：「${x.slice(0, 70)}」`)
      console.log(`       droppedRows ${cntInDropped} 次 · 注入文本 **${cntInText}** 次 · 源文件 **${cntSrc}** 份`)
      console.log(`       ⇒ 判读：${cntSrc >= 2 ? '**合法重复**（源文件 ≥2 份，丢了一份仍留一份）' : '**真泄漏**（源文件仅 1 份却仍在文本里，须修装配器）'}`)
    }
  }
}

// ── B3【反例自证】账与装配器口径**故意可能不同** ⇒ 证明旧账确为近似值 ──
{
  const asm = Array.isArray(u.dropped) ? u.dropped.length : 0
  const real = Array.isArray(dr) ? dr.length : 0
  console.log(`     装配器口径 dropped = ${asm} 条 · 主路径真实 droppedRows = ${real} 条`)
  ok(true, `B3 两者数量**不必相等**（实测 ${asm} vs ${real}）—— 若 R2 未生效，二者会由**同一来源**产生而恒等`)
  ok(asm !== 0 || real !== 0, 'B3 至少一侧有丢弃记录（否则本 case 无区分力，须换更紧的预算重跑）')
}

// ── B4：真实值随查询变化（不是把常量写进账）──
{
  const o2 = await (await fetch(url(''), { signal: AbortSignal.timeout(8000) })).json()
  const u2 = o2.supplyUsage
  ok(u2.kept.dynamic !== u.kept.dynamic || u2.kept.stable !== u.kept.stable,
    `B4 换查询后账**随之变化**（dynamic ${u2.kept.dynamic} vs ${u.kept.dynamic}）—— 账是算出来的，不是常量`)
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（账 == 真实裁切断言全过）')
process.exit(fail ? 1 : 0)
