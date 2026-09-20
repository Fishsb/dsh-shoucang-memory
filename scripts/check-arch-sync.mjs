#!/usr/bin/env node
// check-arch-sync.mjs — **架构文档 ⟷ 实测** 一致性门（P1 · 2026-09-14）
//
// 为什么需要它（实证，见 docs/anthropomorphic-plan-2026-09-14.md §12）：
//   本仓 7 件架构机检全在查「代码结构」（无环/无桥/行数/依赖宽度/符号漂移），**没有一件查「文档说的与实测是否一致」**。
//   而 `docs/ARCHITECTURE.md` 开头**曾自己声明放弃机器兜底**（「文档与代码不一致已无机器兜底，属人工纪律」，2026-09-14 订正）
//   ⇒ 于是出现四处已实证的失真：
//     · 模块数：`AGENTS.md` 60 / `ARCHITECTURE.md` 55（**其分项相加 53，文档自身都不自洽**）/ 实测 **63**
//     · 注入预算：`ARCHITECTURE.md` 写 3,000，注册表 `surface.injection.budgetChars` 是 **4000**
//     · 陈旧陈述：`ARCHITECTURE.md` 仍称存在 **3 个 `-share` 惰性桥**，而 `src/*-share.ts` 实测 **0 个**
//     · **接线类断言完全无机检**（2026-09-14 补 ⑥ 后堵上）：`supply-assembly` 已接线（panel-shared.ts:21/368）、
//       composition root 已落地（composition.ts 消费方 5 处 · 桥 0 边）之后，`ARCHITECTURE.md` §3.1 末块
//       仍称两者未做 —— ①②③④⑤ **全绿**，因为当时的哨兵只认三个**具体桥名**，而这句写的是泛称「3 个 `-share` 桥」。
//   本门把这几类变成红灯；并把「审计脚本口径必须写在输出头」也钉住（否则每次引用都打架）。
//
// 纪律：**只查可程序化提取的数字与哨兵串**，不做语义判断（语义漂移仍需人工）。
// 用法: node scripts/check-arch-sync.mjs [--selftest]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }
let fail = 0
const chk = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

// ── 接线声明扫描（纯函数：主检与 --selftest 共用同一实现）──
//   判据：文档里「点名某模块缺席运行时接线」的断言，必须能在注册表 wiring.pending 找到申报。
//   · 只认**反引号包住的 kebab 模块名**（`supply-assembly`）——泛述不判（语义漂移归人工，见文件头纪律）
//   · 带撤回语义的行（订正/作废/此前/曾/不再/已退役）是**历史叙述**，不判
//   · 扇入判定**不在此重算**（归 scripts/audit-architecture.mjs）——本门只做「声明 ⟷ 注册表」单向绑定
const NEG_WIRING = /未接|尚未接|未落地|亦未做|尚未挂/
const RETRACTED = /订正|作废|此前|曾(写|称|记)|不再|已退役/
const scanWiringClaims = (mdText, pendingModules) => {
  const out = []
  mdText.split('\n').forEach((l, i) => {
    if (!NEG_WIRING.test(l) || RETRACTED.test(l)) return
    const names = [...l.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)].map((m) => m[1])
    const un = [...new Set(names)].filter((n) => !pendingModules.includes(n))
    if (un.length) out.push({ line: i + 1, modules: un })
  })
  return out
}

// ── `-share` 提及扫描（纯函数：主检与 --selftest 共用）──
//   ⚠ 必须排除 `panel-shared`（活的模块名，含子串 "-share"）——实测收紧 ④ 的第一版就把它两行误判为「称桥存在」。
//   判据：凡提到**惰性桥**（`xxx-share` / 泛称 `` `-share` ``）的行，必须同行带退役语义，否则视为「称其存在」。
const SHARE_BRIDGE = /(?<!panel)-share/
const scanShareMentions = (mdText) => {
  const RETIRE = /退役|已删|移除|收敛|不复存在|0\s*个|0\s*边/
  return mdText.split('\n').map((l, i) => [i + 1, l])
    .filter(([, l]) => SHARE_BRIDGE.test(l) && !RETIRE.test(l))
    .map(([n]) => n)
}

// ── 反向证伪（--selftest）：正例必抓 / 反例必放（不改盘、纯函数喂样本）──
if (process.argv.includes('--selftest')) {
  const cases = [
    ['正例·点名缺席且注册表无豁免 ⇒ 必抓', () => scanWiringClaims('> ⚠ 未接线：`supply-assembly` 尚未接进 systemPrompt', []).length, 1],
    ['反例·已订正的历史叙述 ⇒ 不抓', () => scanWiringClaims('> ✅ 订正：本块此前写「未接线」（`supply-assembly`）', []).length, 0],
    ['反例·注册表已申报豁免 ⇒ 不抓', () => scanWiringClaims('> ⚠ 未接线：`foo-bar` 尚未接进', ['foo-bar']).length, 0],
    ['反例·未点名的泛述 ⇒ 不抓（归人工）', () => scanWiringClaims('> ⚠ 有若干模块未接线', []).length, 0],
    ['反例·非 kebab 的点名 ⇒ 不抓', () => scanWiringClaims('> ⚠ 未接线：`wiring.pending` 尚未接进', []).length, 0],
    ['正例·泛称 `-share` 桥无退役语义 ⇒ 必抓', () => scanShareMentions('> 同理 3 个 `-share` 惰性桥亦未做').length, 1],
    ['反例·活模块 panel-shared ⇒ 不抓', () => scanShareMentions('| **M8 注入** | `panel-shared.ts` 的 buildHotMemoryText |').length, 0],
    ['反例·已退役叙述 ⇒ 不抓', () => scanShareMentions('> 三条 `-share` 惰性桥已全部退役').length, 0],
  ]
  let bad = 0
  for (const [name, run, expect] of cases) {
    const got = run()
    const ok = got === expect
    console.log(`${ok ? '✅' : '❌'} selftest ${name}（期望 ${expect} · 实得 ${got}）`)
    if (!ok) bad++
  }
  console.log(bad ? `\nFAIL（--selftest ${bad} 项）` : '\nPASS（--selftest 正反例全过）')
  process.exit(bad ? 1 : 0)
}

// ── 实测基准 ──
const srcFiles = readdirSync(join(root, 'src')).filter((f) => f.endsWith('.ts'))
const generated = srcFiles.filter((f) => f.includes('.generated.'))
const measured = srcFiles.length - generated.length // = audit-fnspan 口径（排除生成物）
const budget = (() => { try { return JSON.parse(read('skill/engine/criteria.json')).surface.injection.budgetChars } catch { return null } })()
const shareFiles = readdirSync(join(root, 'src')).filter((f) => f.endsWith('-share.ts'))

// ── ① 模块数：AGENTS.md ⟷ 实测 ──
{
  const m = read('AGENTS.md').match(/\*\*(\d+)\s*模块\*\*/)
  const claim = m ? Number(m[1]) : null
  chk(claim === measured, `① AGENTS.md 模块数 = 实测（声称 ${claim ?? '(未找到)'} · 实测 ${measured}，排除生成物 ${generated.length} 件）`)
}
// ── ② 模块数：docs/ARCHITECTURE.md ⟷ 实测 ──
{
  const m = read('docs/ARCHITECTURE.md').match(/共\s*\*\*(\d+)\s*模块\*\*/)
  const claim = m ? Number(m[1]) : null
  chk(claim === measured, `② ARCHITECTURE.md 模块数 = 实测（声称 ${claim ?? '(未找到)'} · 实测 ${measured}）`)
}
// ── ③ 注入预算：ARCHITECTURE.md ⟷ 注册表 ──
{
  // 取「M8 注入」行的「预算 N 字符」声明（注册表是唯一事实源）
  const md = read('docs/ARCHITECTURE.md')
  const m = md.match(/预算\s*\*{0,2}([\d,]+)\*{0,2}\s*字符/) || md.match(/注入\s*≤?\s*\*{0,2}([\d,]+)\*{0,2}\s*字符/)
  const claim = m ? Number(String(m[1]).replace(/,/g, '')) : null
  chk(claim !== null && claim === budget, `③ 注入预算 = 注册表（文档 ${claim ?? '(未找到)'} 字符 · 注册表 surface.injection.budgetChars = ${budget}）`)
}
// ── ④ 陈旧陈述哨兵：`-share` 惰性桥（已全部退役）──
//   2026-09-14 收紧：原实现只认三个**具体名字**，于是「3 个 `-share` 桥亦未做」这类**泛称**整条溜过
//   （实测：src/*-share.ts = 0 个，而本文仍称其存在，本门却 PASS）。现改为：凡提到**惰性桥**的行
//   （泛称 `` `-share` `` 或 `xxx-share`），必须**同行带退役语义**，否则即「称其存在」⇒ FAIL。
//   ⚠ 收窄口径：必须排除 `panel-shared`（**活的模块名**，含子串 "-share"）——第一版没排除，两行误判。
{
  const md = read('docs/ARCHITECTURE.md')
  const mentions = md.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => SHARE_BRIDGE.test(l))
  const unretracted = shareFiles.length === 0 ? scanShareMentions(md) : []
  chk(unretracted.length === 0,
    `④ -share 桥提及必须带「退役」语义（src/*-share.ts 实测 ${shareFiles.length} 个；提及桥的行 ${mentions.length} 行，未标退役 ${unretracted.length} 行${unretracted.length ? '：L' + unretracted.join(', L') : ''}）`)
}
// ── ⑤ 审计脚本输出头必须标注口径（否则引用打架：61 vs 60 之争正源于此）──
{
  const bad = []
  for (const f of ['scripts/audit-architecture.mjs', 'scripts/audit-fnspan.mjs']) {
    const head = read(f).split('\n').slice(0, 20).join('\n') // 只看头部
    const marked = /生成物|\.generated\.|口径/.test(head)
    if (!marked) bad.push(f.split('/').pop())
  }
  chk(bad.length === 0, `⑤ 审计脚本输出头标注「是否含生成物」口径（未标注：${bad.length ? bad.join(', ') : '无'}）`)
}

// ── ⑥ 接线声明 ⟷ 注册表（2026-09-14）：文档宣告某模块缺席运行时接线，必须在 wiring.pending 申报 ──
//   为什么：本门 ①–⑤ 只查数字与哨兵，**接线类断言一直是自由的** —— 实测后果是 §3.1 末块在
//   `supply-assembly` 已接线（panel-shared.ts:21 导入 · :368 调用 · 经 /inject/stats 回带）之后
//   仍称其「尚未接进 systemPrompt」、并称 composition root 未做（实际已是唯一 composition root · 桥 0 边），
//   而本门全绿。声明唯一合法处 = 注册表（扇入判定归 audit-architecture，本门不重算扇入）。
{
  const pending = (() => {
    try {
      const w = JSON.parse(read('skill/engine/criteria.json')).wiring || {}
      return (w.pending || []).map((x) => (typeof x === 'string' ? x : x && x.module)).filter(Boolean)
    } catch { return [] }
  })()
  const offenders = scanWiringClaims(read('docs/ARCHITECTURE.md'), pending)
  chk(offenders.length === 0,
    `⑥ 接线缺席声明 = 注册表 wiring.pending（豁免 ${pending.length} 条；未申报却宣告 ${offenders.length} 处${offenders.length ? '：' + offenders.map((o) => `L${o.line}(${o.modules.join('/')})`).join(' · ') : ''}）`)
}

// ── ⑦ 登记件数：AGENTS.md 声称的 `CHECKS` 件数 ⟷ `check-runner.mjs` 实装条目数（2026-09-20 round 10）──
//   判因（实证）：`AGENTS.md` 两处写死「**156 件**登记于 `CHECKS`」/「（63 项标记）」，
//   而实测 **190 / 82** —— 本门 ①–⑥ 只守**模块数 / 预算 / 桥 / 接线声明**，**这两个数字从来没被守过**
//   （与 §5′ 记档的「待办表自我繁殖」同族：文档里的数字没人对，就会一路偏下去）。
//   判据：从**源码**数（不跑全量 runner —— 本门须轻），口径写死在输出里以便复核。
{
  const seg = (() => {
    const s = read('scripts/check-runner.mjs')
    const i = s.indexOf('const CHECKS = [')
    const j = i < 0 ? -1 : s.indexOf('\n]', i)
    return i < 0 || j < 0 ? '' : s.slice(i, j)
  })()
  const measuredChecks = (seg.match(/^\s*\['/gm) || []).length
  const m = read('AGENTS.md').match(/\*\*(\d+)\s*件\*\*\s*登记于\s*`?CHECKS/)
  const claim = m ? Number(m[1]) : null
  chk(measuredChecks > 0 && claim === measuredChecks,
    `⑦ AGENTS.md 声称的 CHECKS 件数 = check-runner 实装条目数（声称 ${claim ?? '(未找到)'} · 实测 ${measuredChecks}；口径 = CHECKS 数组内 \`['…']\` 元组行数）`)
}

// ── ⑧ 特性标记数：AGENTS.md 声称 ⟷ `check-installed-features.mjs` 实装标记数（同轮）──
//   判因同 ⑦：该数字在 `AGENTS.md` 出现两处（原文 63），实测 **82**；而它**只在运行期由脚本自算**
//   （`FEATURES.length + HOST_FEATURES.length + FEATURES_I18N.length + 1`）⇒ 文档侧必须人工跟。
//   口径：本门**静态解析**该脚本的数组长度表达式（与运行时同式），不依赖已安装副本是否在位。
{
  const s = read('scripts/check-installed-features.mjs')
  const arrLen = (name) => {
    const i = s.indexOf(`const ${name} = [`)
    if (i < 0) return null
    const j = s.indexOf('\n]', i)
    if (j < 0) return null
    return (s.slice(i, j).match(/^\s*\{/gm) || []).length || (s.slice(i, j).match(/^\s*\[/gm) || []).length
  }
  const lens = ['FEATURES', 'HOST_FEATURES', 'FEATURES_I18N'].map(arrLen)
  const measuredFeatures = lens.every((x) => typeof x === 'number' && x >= 0) ? lens.reduce((a, b) => a + b, 0) + 1 : null
  const claims = [...read('AGENTS.md').matchAll(/（\s*(\d+)\s*项标记\s*）/g)].map((x) => Number(x[1]))
  const bad = measuredFeatures === null || claims.length === 0 || claims.some((c) => c !== measuredFeatures)
  chk(!bad,
    `⑧ AGENTS.md 声称的特性标记数 = 实装（声称 ${claims.length ? claims.join('/') : '(未找到)'} · 实测 ${measuredFeatures ?? '(解析失败)'}；口径 = FEATURES+HOST_FEATURES+FEATURES_I18N+1，与运行期同式）`)
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（架构文档与实测一致）')
process.exit(fail ? 1 : 0)
