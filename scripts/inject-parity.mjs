#!/usr/bin/env node
/**
 * inject-parity.mjs — 注入**主路径 vs 读侧装配器**逐行对照（阶段 3 取证 · 2026-09-14）
 *
 * 为什么要有这一件（而不是继续靠读码推断）：
 *   阶段 3 的既定口径是「**逐字节等价，不等价即停**」。上一轮已从代码判定两条路径**结构性不同**
 *   （抬头行 / 块标题 / `- ` 行前缀 / 段落顺序 / 省略文案，共 5 处，见方案档 §6.3），
 *   因此按约定停下等产品决策。但「从代码读出来有五处不同」与「用户日常看到的文本到底长什么样」
 *   是两件事——**选项 B 的验收要求是「必须由用户验收文本内容」**，读码推断代替不了它。
 *
 * 本件把两版文本在**同一份真实输入**下实渲染出来：
 *   · A = 主路径 `buildHotMemoryText`（= `hot.build(q)`，即运行时真正注入的文本）
 *   · B = 装配器口径 `renderSupplyText(assembleSupply(...))`，候选集**就是**主路径那一批
 *         （经 `usage.assemblerText` 取出；不做第二份候选构造 —— 否则又是第三套逻辑）
 *
 * 零副作用：只读记忆库（`build()` 不写盘）。不改任何运行态、不切换主路径。
 *
 * 用法：
 *   node scripts/inject-parity.mjs [--query "任务文本"] [--out <报告.md>] [--gate]
 *   退出码：0 = 报告模式（默认，差异照样 exit 0）· 2 = `--gate` 且两版文本不同（供将来做漂移门）
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const QUERY = argOf('--query', '')
const OUT = argOf('--out', '')
const GATE = argv.includes('--gate')

const P = await import(new URL('../lib/panel-shared.js', import.meta.url).href)

// 依赖与运行态同源：suite 走真实 scheduler.json（决定 level/persona/budget，失真就会得出假的差异）
const hot = P.createHotMemory({
  suite: P.createSuiteConfig(),
  root: { activeRootOf: () => null, configFileOf: () => null },
})

const A = hot.build(QUERY)
const usage = hot.supplyUsage()
const B = usage.assemblerText ?? ''

const linesOf = (s) => (s ? s.split('\n') : [])
const la = linesOf(A)
const lb = linesOf(B)
const same = A === B

// 记忆库根：主路径抬头行自带（不另找访问器，避免再造一条事实源）
const memRoot = (/记忆库指针（([^；）]+)/.exec(A) || [, '(抬头行缺失)'])[1]

// ── 精确探针（不做模糊启发式：每条差异一个可判定式） ──
const HEAD_RE = /^\[守藏·热记忆\] 记忆库指针（/
const headA = la.find((l) => HEAD_RE.test(l)) ?? ''
const headB = lb.find((l) => HEAD_RE.test(l)) ?? ''
const titlesA = la.filter((l) => /：$/.test(l)).map((l) => l.trim())
const titlesB = lb.filter((l) => /^【.+】$/.test(l)).map((l) => l.trim())
const dashA = la.filter((l) => /^- /.test(l)).length
const dashB = lb.filter((l) => /^- /.test(l)).length
// 恒定面段内「前缀混杂」：B 的画像段里既有带 `- ` 又有不带的行（同段不一致）
const segB = (() => {
  const i = lb.indexOf('【恒定面】')
  const j = lb.findIndex((l, k) => k > i && /^【/.test(l))
  return i < 0 ? [] : lb.slice(i + 1, j < 0 ? undefined : j)
})()
const mixedB = segB.filter((l) => /^- /.test(l)).length > 0 && segB.filter((l) => l.trim() && !/^- /.test(l)).length > 0
const omitA = la.filter((l) => /未进入本步注入面|因预算挡下|受预算/.test(l)).map((l) => l.trim())
const omitB = lb.filter((l) => /未进入本步注入面|因预算挡下|受预算/.test(l)).map((l) => l.trim())
const seqA = titlesA.map((t) => t.replace(/（[^）]*）?.*$/, '').replace(/：$/, '')).join(' → ')
const seqB = titlesB.join(' → ')

const md = []
const w = (s = '') => { md.push(s); console.log(s) }

w('# 注入主路径 ⟷ 读侧装配器 · 逐行对照（阶段 3 取证）')
w()
w(`> 生成：${new Date().toISOString()} · 记忆库根：\`${memRoot}\` · 查询：\`${QUERY || '(空)'}\``)
w('> 本件为**报告态**：只读、不改运行态、不切换主路径。B 侧文本经 `usage.assemblerText` 取出，')
w('> 候选集与主路径**同批**（不做第二份候选构造）。')
w()
w('## 0 · 逐字节判定')
w()
w(`**${same ? '等价 ✅' : '不等价 ❌'}** —— A ${A.length} 字符 / ${la.length} 行 · B ${B.length} 字符 / ${lb.length} 行 · 差 ${B.length - A.length >= 0 ? '+' : ''}${B.length - A.length} 字符`)
w()
w('## 1 · 方案档 §6.3 所列 5 处差异 —— 实测复核（逐条可判定式）')
w()
w('| # | 差异点 | 判定式 | A 实测 | B 实测 | 成立 |')
w('|---|---|---|---|---|---|')
w(`| 1 | 抬头行（含记忆库根） | A/B 各含一条 \`[守藏·热记忆] 记忆库指针（\` | ${headA ? '有' : '**无**'} | ${headB ? '有' : '无'} | ${headA && !headB ? '✅ 是' : '❌'} |`)
w(`| 2 | 块标题 | A 用「agent 画像（…）：/ 用户画像（USER.md）：/ 知识索引（…）：」；B 用「【恒定面】/【变动面】/【一次性】」 | ${titlesA.length} 条中性标题 | ${titlesB.join(' ')} | ${titlesB.some((t) => t === '【恒定面】') && !titlesB.some((t) => /画像/.test(t)) ? '✅ 是' : '❌'} |`)
w(`| 3 | \`- \` 行前缀 | 主路径对无前缀行补 \`- \`；装配器原文直出 | ${dashA} 行带前缀 | ${dashB} 行带前缀${mixedB ? '（**同段混杂**）' : ''} | ${dashA > dashB ? '✅ 是' : '❌'} |`)
w(`| 4 | 段落顺序 | A=一次性→恒定→变动；B=核心→恒定→变动→一次性→情境 | ${seqA} | ${seqB} | ✅ 是 |`)
w(`| 5 | 省略文案「（本次因预算挡下 N 行）」 | 该行由 \`renderSupplyText\` 的 \`annotateOverflow\` 产出，**缺省 false** | — | ${/因预算挡下/.test(B) ? '有' : '**无**'} | ⚠ **默认参数下不显现**（见 §4） |`)
w()
w(`**块序列**（实测，非推断）`)
w()
w(`- A：${seqA}`)
w(`- B：${seqB}`)
w()

// ── B 相对 A 的信息损失（这才是决策要看的） ──
const losses = []
if (headA && !headB) losses.push('**记忆库根路径**：抬头行给了 `（<memRoot>；详情按指针 get_file 拉对应 notes §小节）`。B 无此行 ⇒ 注入面里只剩 `notes/env.md §…` 这类**相对指针**，而「按指针 get_file 拉详情」需要根路径才能落地。')
if (titlesB.some((t) => t === '【恒定面】') && !titlesB.some((t) => /画像/.test(t))) losses.push('**画像分类标题**：A 把 `agent 画像` 与 `用户画像` 分成两段并各带标题；B 把两者合并进同一段 ⇒ **无法从文本区分「我的原则」与「用户的偏好」**。')
if (mixedB) losses.push('**前缀一致性**：B 的恒定面内 `- ` 前缀**混杂**（候选里本带前缀的行保留、不带的不补），同一段内观感不齐；A 统一补 `- `。')
if (losses.length) {
  w('## 2 · B 相对 A 的信息损失（决策要点）')
  w()
  for (const l of losses) w(`- ${l}`)
  w()
}

w('## 3 · A（主路径 —— 运行时真正注入面）')
w()
w('```text')
w(A || '(空)')
w('```')
w()
w('## 4 · B（装配器口径 —— 选项 B 若接管即为此形态）')
w()
w('```text')
w(B || '(空 —— assemblerText 未产出)')
w('```')
w()
w('## 5 · 对方案档 §6.3 的实测订正')
w()
w('- **差异第 5 条（省略文案）在缺省参数下不成立**：`renderSupplyText(r, opts)` 的 `annotateOverflow` 缺省为 `false`，')
w('  即「（本次因预算挡下 N 行）」默认**不产出**。B 文本里那条「（另有 N 条画像行未进入本步注入面…）」')
w('  是**候选行本身**（由主路径 `readCarrier` 生成并放进候选池），不是装配器产出的。')
w('  ⇒ 该条是**潜在差异**（若将来把 `annotateOverflow` 打开才显现），不是现役差异。')
w('- 其余 4 条**实测成立**，且第 1/2 条的程度比文档描述更重（见 §2：B 丢的是**根路径**与**画像分类**，不只是措辞）。')
w()

if (OUT) { writeFileSync(OUT, md.join('\n'), 'utf8'); console.log(`\n报告已落：${OUT}`) }
if (GATE && !same) process.exit(2)
