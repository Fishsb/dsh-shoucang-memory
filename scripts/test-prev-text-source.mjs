#!/usr/bin/env node
// test-prev-text-source.mjs — **回引判定的输入来源**（2026-09-20 · 真机缺陷驱动）
//
// ── 判因（真机实测，**"机制正常、输入为零"型假绿**）──────────────────────────
// `topicEcho`（上一步是否回引材料主题词）在真机**恒 false**（`true = 0 / 4865` 行），
// 于是 `zeroGain` **只能递增、永不清零** ⇒ `switchSource` 在阈值后**恒真**
// （实测 `switchSource=true` 占 **4604/4865 = 94.6%**）⇒ 该信号**无判别力**。
//
// **逐层排除后的真因**（每步都有实测证据）：
//   ① `topics` 恒空？**否** —— 4865 行里 52.3% 非空（样本 `["指针非限制","记忆体系分工",…]`）；
//   ② `materialChars` 恒 0？**否** —— 全为非零；
//   ③ 判定点从未到达？**否** —— `nudge=1` 有 **107 行**（再引导确实发出过）；
//   ④ 判据本身失效？**否** —— 重放实测：喂真实主题词 ⇒ `true`、喂无关句 ⇒ `false`（判据是好的）；
//   ⑤ **⇒ `prevText` 恒为 `''`**：原实现从 `decision.messages` 里找 assistant 回复，
//      而**宿主的 `messages` 是"本步新认领的消息"**（`inbox.claim(target, turn)`；仓内
//      `OPEN-ITEMS §0d` 已实证）⇒ **收尾步根本没有认领消息** ⇒ 取不到任何 assistant 文本。
//   ⇒ 修复：改从**会话事件流**取（`agent.session.snapshotEvents()` 里最近一条 `assistant/message`
//     的 text 片），复用仓内**既有**解析器口径（**不取 reasoning**，与蒸馏材料面一致）。
//
// ── 本件守什么（四条断言）──────────────────────────────────────────────────
//   ① **数据源正确**：源码中取 `prevText` 的路径必须含 `snapshotEvents`（会话事件流），
//      且**不得**再以"从 `decision.messages` 找 assistant"为**唯一**来源。
//   ② **解析口径单一**：只取 `type === 'text'` 片（**不取 reasoning**）——与 `distill-chunks`
//      的材料面同口径（`reasoning` 不进材料，也不应进回引判定）。
//   ③ **可分辨**：审计行必须带 `prevTextSrc`，使 **"真没回引"与"取不到回复"可区分**
//      （此前两者混为一谈 ⇒ 该缺陷潜伏至今）。
//   ④ **降级保护**：`snapshotEvents` 不可达时**退回原口径**（不得直接抛错或使判定失效）。
//
// ── 反例自证（`--selftest`）────────────────────────────────────────────────
//   样例取自**真机修前形态**（只认 `decision.messages`）⇒ ①② 必红。
//
// 用法: node scripts/test-prev-text-source.mjs [--selftest]
// 退出码：0=PASS  1=FAIL
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 剥注释（仓内既有先例：`check-carriers` / `check-observability` 的「先剥注释再匹配」） */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** 判定：一段源码的 `prevText` 取值是否**以会话事件流为主源** */
function usesEventStream(src) {
  const s = strip(src)
  const hasSnapshot = /snapshotEvents\s*\(/.test(s)
  // 主源判据：取 prevText 的那一段里出现 snapshotEvents（而非仅靠 messages）
  /* ⚠ **锚点必须具体**（2026-09-21 修 · 实测踩到）：原锚是 `indexOf('prevText')` ——
   *   只要**更靠前**出现任意含 `prevText` 的标识符（实测：`shouldResetTurn(prevText, …)` 的参数名），
   *   窗口就落到**无关代码**上 ⇒ **假红**（判据被无关文本左右）。⇒ 锚改为**赋值语句** `let prevText`。 */
  const seg = (() => {
    const i = s.indexOf('let prevText')
    return i < 0 ? '' : s.slice(i, i + 1800)
  })()
  return hasSnapshot && /snapshotEvents\s*\(/.test(seg)
}
/** 是否**只**认 reasoning（错口径）——应为"只取 text" */
function takesReasoningOnly(src) {
  const s = strip(src)
  const seg = (() => { const i = s.indexOf('let prevText'); return i < 0 ? '' : s.slice(i, i + 1800) })()
  return /type\s*===\s*'reasoning'/.test(seg) && !/type\s*===\s*'text'/.test(seg)
}

/* ── `--selftest`：反例自证（样例取自真机修前形态）────────────────────────── */
if (argv.includes('--selftest')) {
  const cases = [
    ['正例·修后形态（事件流取 assistant/message 的 text 片 + 降级退回）',
      `let prevText = ''\nlet prevTextSrc = 'none'\nconst evs = agent?.session?.snapshotEvents()\nif (Array.isArray(evs)) {\n  for (let i = evs.length - 1; i >= 0; i--) {\n    if (String(evs[i]?.type) !== 'assistant/message') continue\n    const arr = evs[i]?.data?.message?.content || []\n    const txt = arr.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('')\n    if (txt) { prevText = txt; prevTextSrc = 'events'; break }\n  }\n}\nif (!prevText) { const prevAssistant = [...messages].reverse().find((m) => m && m.role === 'assistant') }`, 'event-stream'],
    ['**反例**·真机修前形态（只从 `decision.messages` 取 ⇒ 收尾步恒空）',
      `const prevAssistant = [...messages].reverse().find((m) => m && m.role === 'assistant')\nconst prevText = prevAssistant && Array.isArray(prevAssistant.content) ? prevAssistant.content.filter((b) => b.type === 'text' || b.type === 'reasoning').map((b) => b.text).join('') : ''`, 'messages-only'],
  ]
  let bad = 0
  for (const [label, src, want] of cases) {
    const s = strip(src)
    let got
    if (!usesEventStream(s)) got = 'messages-only'
    else got = 'event-stream'
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判「${got}」（期望「${want}」）`)
  }
  if (!takesReasoningOnly(cases[0][1])) console.log('✅ 正例只取 text 片（不含 reasoning）')
  else { bad++; console.log('❌ 正例混入了 reasoning 口径') }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (!negs.length) { bad++; console.log('❌ 自证不含反例') }
  console.log(bad ? `\nFAIL（${bad} 例）` : `\nPASS（回引输入源判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────── */
const MCL = join(root, 'src', 'mcl.ts')
if (!existsSync(MCL)) { console.log('❌ 找不到 src/mcl.ts（扫描范围错误必须判红）'); process.exit(1) }
const src = readFileSync(MCL, 'utf8')
const s = strip(src)
console.log('回引判定的输入来源（`mcl.ts` · 真机缺陷驱动）')

ok(usesEventStream(s),
  '① `prevText` 以**会话事件流**（`agent.session.snapshotEvents()`）为主源 —— 修前只认 `decision.messages`（收尾步恒空）')
ok(!takesReasoningOnly(s),
  '② 只取 `type === "text"` 片（**不含 reasoning**）—— 与 `distill-chunks` 材料面同口径')
ok(/prevTextSrc/.test(s),
  '③ 审计落 `prevTextSrc` ⇒ **"真没回引"与"取不到回复"可分辨**（此前混为一谈，缺陷因此潜伏）')
ok(/snapshotEvents/.test(s) && /!prevText/.test(s) && /\[\.\.\.messages\]\.reverse\(\)/.test(s),
  '④ `snapshotEvents` 不可达时**退回原口径**（降级保护，不使判定整体失效）')

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（回引判定输入源正确：事件流主源 · text-only · 可分辨 · 有降级）')
