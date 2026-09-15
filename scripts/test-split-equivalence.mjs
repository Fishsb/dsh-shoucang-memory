#!/usr/bin/env node
// test-split-equivalence.mjs — **拆分等价性证据门**（UI1/U5-b · 2026-09-15）
//
// **判据（原 U5-b："拆分前后同一次提交的 DOM 差异为空"）怎么落地**：
//   U2 把 `body.js` 的 24 个 render 迁到 9 个 pane 模块。事后**无法**再取"拆分前"的 DOM
//   （旧版本已不在工作树）⇒ 直接做"前后对拍"已不可行。
//   ⇒ 改为**证明"现有的两个渲染门确实能抓到拆分破坏"**（**先红后绿**的可信度证据）：
//     ① `test-panel-view-contract`（结构清单：每个 `.setting-item` / 小节锚点的 [Tab,名称,类型]）
//     ② `ui-geo-regress`（几何：弹窗宽度 / KPI 首屏数 / 按钮高度 / 日志折叠 …）
//   若这两个门**抓不到**人为破坏，那"拆分没破坏渲染"就是**无证据的自述**（本项目最忌者）。
//
// **本件做的事**：
//   A1 反例：在「参数」视图**故意不渲染一个 tab** ⇒ `test-panel-view-contract` 必须报"缺失"
//   A2 反例：故意改一处几何（导航宽）⇒ `ui-geo-regress` 必须报对应项
//   A3 还原后**两门都必须回到绿**（否则说明还原不彻底，本件自身不可信）
//
// ⚠ **本件会临时改源码并重建产物**（约 40 秒）。所有改动在 finally 中还原，且**校验逐字节还原**。
// ⚠ 教训：首次写本件时，反例打在了**门没覆盖的视图**（运行总览的 ov*Card）上 ⇒ 门"没抓到"，
//    差点被误判为"门的缺陷"。**反例必须打在门覆盖的面上**，否则反例自身无效。
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(root, 'src-client', 'panes-toggles.js')
const MARK = "  renderTogglesSched(UI.cardIn(_tb.pane('sched')), g);"

const run = (script) => {
  try { return execFileSync(process.execPath, [script], { encoding: 'utf8', cwd: root }) }
  catch (e) { return String(e.stdout || '') + String(e.stderr || '') }
}
const build = () => {
  try { execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:client'], { stdio: 'pipe', cwd: root, shell: process.platform === 'win32' }) } catch (e) { /* 构建失败也要继续，由断言判 */ }
}

let bad = 0
const ok = (c, n) => { console.log(`${c ? '✅' : '❌'} ${n}`); if (!c) bad++ }

const orig = readFileSync(TARGET)
let restored = false
try {
  const text = orig.toString('utf8')
  if (!text.includes(MARK)) {
    console.log('❌ 找不到注入点标记（panes-toggles.js 结构变了？）—— 本件需同步更新锚点')
    process.exit(1)
  }
  const broken = text.replace(MARK, '  /* 反例（本件临时注入）：故意不渲染 sched tab */')

  /* ── A2 的破坏点：把导航宽压成极小值（`styles.js` 的 `--sc-nav-w`）—— `ui-geo-regress` 量得到 ── */
  const SET = join(root, 'src-client', 'styles.js')
  const setOrig = readFileSync(SET)
  const setText = setOrig.toString('utf8')
  const NAV_RE = /--sc-nav-w:216px;/

  /* ══ A1：结构门必须抓到"少渲染一个 tab" ══ */
  writeFileSync(TARGET, Buffer.from(broken, 'utf8'))
  build()
  const out1 = run('scripts/test-panel-view-contract.mjs')
  const caught1 = /缺失/.test(out1) && /基线 (\d+) 项 · 实测 (\d+) 项/.test(out1)
  const m1 = /基线 (\d+) 项 · 实测 (\d+) 项/.exec(out1)
  ok(caught1, `A1 反例：故意不渲染 sched tab ⇒ \`test-panel-view-contract\` 报"缺失"（${m1 ? m1[1] + ' → ' + m1[2] : '未取到计数'}）`)

  /* ══ A2：几何门必须抓到几何破坏 ══ */
  if (NAV_RE.test(setText)) {
    writeFileSync(SET, Buffer.from(setText.replace(NAV_RE, '--sc-nav-w:4px;'), 'utf8'))
    build()
    const out2 = run('scripts/ui-geo-regress.mjs')
    ok(/FAIL/.test(out2), 'A2 反例：故意把导航宽压到 4px ⇒ `ui-geo-regress` 报 FAIL')
  } else {
    ok(false, 'A2 跳过失败：`styles.js` 里找不到 `--sc-nav-w:216px`（锚点过期）')
  }

  /* ══ A3：还原后两门都回绿 ══ */
  writeFileSync(TARGET, orig)
  writeFileSync(SET, setOrig)
  restored = true
  ok(readFileSync(TARGET).equals(orig), 'A3a panes-toggles.js 已**逐字节**还原')
  ok(readFileSync(SET).equals(setOrig), 'A3b styles.js 已**逐字节**还原')
  build()
  const out3 = run('scripts/test-panel-view-contract.mjs')
  const out4 = run('scripts/ui-geo-regress.mjs')
  ok(/PASS/.test(out3), 'A3c 还原后 `test-panel-view-contract` 回到 PASS')
  ok(/100 PASS \/ 0 FAIL/.test(out4), 'A3d 还原后 `ui-geo-regress` 回到 100 PASS')
} finally {
  if (!restored) { writeFileSync(TARGET, orig); build(); console.log('⚠ 异常路径：已强制还原') }
}

console.log(bad ? `\nFAIL（${bad} 项未过 —— 拆分等价性证据不成立）` : '\nPASS（拆分等价性证据成立：两门均能抓到人为破坏，且还原后回绿）')
process.exit(bad ? 1 : 0)
