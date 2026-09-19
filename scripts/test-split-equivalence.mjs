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
/**
 * 重建 client 产物。
 *
 * ⚠ **不得依赖 npm 在 PATH**（2026-09-15 实证缺陷）：本件曾用 `npm.cmd run build:client`，
 *   而实测环境里 npm **可能不在 PATH**（本会话就发生了）⇒ 构建**静默失败**（被 catch 吞掉）
 *   ⇒ 反例自证里「破坏未生效」⇒ 门报出**误导性结论**（"门没抓到"，真因是"根本没重建"）。
 *   这正是本项目反复治的**静默失效**类，且**发生在我自己的门上**。
 * ⇒ 两处加固：① 直接跑构建脚本（`node scripts/build-client.mjs`，与 package.json 的 `build:client` **同源**）；
 *   ② **不再吞异常** —— 构建失败即门失败（退出码非 0），绝不降级成"破坏未生效"。
 */
const build = () => {
  try {
    execFileSync(process.execPath, [join(root, 'scripts', 'build-client.mjs')], { stdio: 'pipe', cwd: root })
  } catch (e) {
    console.log('❌ 构建失败（门无法判定"破坏是否生效"）—— 原始报错：')
    console.log('   ' + String((e.stdout || '') + (e.stderr || '') || e.message).slice(0, 400))
    process.exit(1)
  }
}

let bad = 0
const ok = (c, n) => { console.log(`${c ? '✅' : '❌'} ${n}`); if (!c) bad++ }

const orig = readFileSync(TARGET)
let restored = false
let exitedEarly = 0
try {
  const text = orig.toString('utf8')
  if (!text.includes(MARK)) {
    /* ⚠⚠ **本处曾让污染永久留存（2026-09-20 实测事故 · 必须读）**：
     *   原实现直接 `process.exit(1)` —— 而 **Node 的 `process.exit()` 不执行 `finally`**。
     *   触发链条：① 本件先写入反例（污染 `panes-toggles.js` / `styles.js`）→ ② 某轮构建/子进程异常
     *   或并发跑 runner 时被打断 ⇒ 反例留存 → ③ 下一次运行走到这里，锚点 `MARK` **已被反例替换** ⇒
     *   "找不到锚点" ⇒ `process.exit(1)` ⇒ **又跳过还原** ⇒ **一旦污染就永远无法自愈**，
     *   并且把 `test-panel-view-contract` / `ui-geo-regress` / `test-css-usage-gate` / 自身
     *   **共 4 道门一起拖红**（实测：工作树里残留 2 个源文件的注入，`runner` 报 4 项红）。
     *   ⇒ 修法：**不得 `process.exit`**；改为设标记 + 走完 `finally`（还原）后再以退出码结束。
     *     并且：**锚点缺失本身就是"上次注入没还原"的强信号** ⇒ 此时**必须尝试还原**（见 finally 分支）。 */
    console.log('❌ 找不到注入点标记（panes-toggles.js 结构变了？）—— 本件需同步更新锚点')
    console.log('   ⚠ 该形态也可能是「上次反例未还原」⇒ 本件将在 finally 中执行 git 还原兜底')
    exitedEarly = 1
  } else {
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
  /* ⚠ 2026-09-18：原写死 `/100 PASS \/ 0 FAIL/` —— 每加一条几何断言就要来改这里（纯噪音，
   *   实测因新增「恒定面通道」断言变 103 而红）。判据改为**语义化**：0 FAIL 且 PASS 数不低于基线 100。
   *   （不断言精确值：本测试关心的是"还原后门**回绿**"，不是"断言总数恰好等于 100"。） */
  const m4 = /(\d+) PASS \/ (\d+) FAIL/.exec(out4)
  ok(m4 && Number(m4[2]) === 0 && Number(m4[1]) >= 100,
    'A3d 还原后 ui-geo-regress 回到全绿（实得 ' + (m4 ? m4[1] + ' PASS / ' + m4[2] + ' FAIL' : '取不到计数') + '，要求 ≥100 PASS 且 0 FAIL）')
  }
} finally {
  /* **还原兜底**（两条路）：
   *   ① 正常/异常路径未还原 ⇒ 用**内存里的 orig** 还原（逐字节）；
   *   ② 走到"锚点缺失"分支（= 上次未还原）⇒ 内存里的 orig **本身就是被污染的内容**，
   *      用它还原等于**继续污染** ⇒ 此时**必须用 `git checkout --` 从 HEAD 还原**。
   *   ⚠ `styles.js` 同理：本件对它的写入在 A2 之后才发生，锚点分支里它可能已被上次污染。 */
  if (!restored) {
    if (exitedEarly) {
      try {
        execFileSync('git', ['checkout', '--', 'src-client/panes-toggles.js', 'src-client/styles.js'], { cwd: root, stdio: 'pipe' })
        console.log('⚠ 锚点缺失 ⇒ 已用 `git checkout --` 从 HEAD 还原两源文件（上次反例未还原的兜底）')
      } catch (e) {
        console.log('❌ git 还原兜底失败 —— **工作树可能仍带反例污染**，须人工执行：')
        console.log('   git checkout -- src-client/panes-toggles.js src-client/styles.js')
        console.log('   ' + String(e.message).slice(0, 200))
      }
    } else {
      writeFileSync(TARGET, orig)
      console.log('⚠ 异常路径：已强制还原 panes-toggles.js')
    }
    build()
  }
}

console.log(bad ? `\nFAIL（${bad} 项未过 —— 拆分等价性证据不成立）` : (exitedEarly ? '\nFAIL（锚点缺失 ⇒ 反例未执行，本件未产出"门能抓到破坏"的证据；已兜底还原，请重跑）' : '\nPASS（拆分等价性证据成立：两门均能抓到人为破坏，且还原后回绿）'))
/* ⚠ **退出码不得用 `process.exit`**（会再次跳过 finally 里的兜底）—— 本处已走完 finally，安全。 */
process.exitCode = (bad || exitedEarly) ? 1 : 0
