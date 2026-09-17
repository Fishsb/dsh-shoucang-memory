#!/usr/bin/env node
// check-module-growth.mjs — **大模块冻结 + 模块行数硬顶**（阶段 0 · 2026-09-14）
//
// 为什么需要它（两条实证，不是理论推演）：
//
// **① 现有模块行数门禁是恒绿的假绿。** `audit-architecture --gate` 的模块行数阈值是 2000，
//   而当前最大模块 880 行 ⇒ **今天谁也碰不到它**。这与「永久红灯人人无视」是同型问题、
//   方向相反：一个从不可能红的门禁，守不住任何东西。
//
// **② 「功能往大模块里堆」才是当前真病灶。** 函数跨度债务已归零（>400 行函数实测 0 个），
//   但模块级在稳步膨胀：treeops 880 / panel-shared 802 / scheduler 746 / mcl 618。
//   单纯收紧全局阈值治不了它——treeops 880 配阈值 1000 仍有 120 行空间可堆。
//   ⇒ 故本件做**两件事**，第二件才是治病的那一刀：
//     ① 硬顶 1000（比 2000 收紧一半，仍留有余地，但能拦住「悄悄长到 1500」）；
//     ② **冻结名单**：≥600 行的模块行数**只许降不许升**（棘轮，基线写死在 `FREEZE` 里）。
//
// 新增模块原则：**新功能落新模块**。模块数应随功能增长，而不是单模块行数增长。
//   ⇒ 出现新的 ≥600 行模块时，本件报「需登记基线」并 FAIL（不许无声混入）。
//
// 口径声明（本仓反复栽在口径不一致上，故显式钉死）：
//   · 行数 = **代码行数**：先 `stripCommentsLite()` 剥掉 `//` 整行与 `/* */` 块注释，再 `split('\n')` 去末尾空行；
//     ⚠ **不等于物理行数**（2026-09-17 实测订正：此前此处写"物理行数…与 `wc -l` 一致"，与实现不符 ——
//     实测 `scheduler.ts` 本件 617 / audit-architecture 769 / `wc -l` 768，差值 152 而**不是**下方所称的"可能差 1"。
//     该口径**此前一直是错的**，是文档缺陷而非门禁失效：棘轮逻辑自身自洽，只是标注误导。）
//   · 扫描面 = **多根**：`src/**/*.ts` + `src-client/**/*.js`，**均排除 `*.generated.*`**
//     （生成物由生成器产出，冻结它无意义且必然误红）；
//     ⚠ 2026-09-15 扩面：原先只扫 `src/`，导致前端 `body.js` **5477 行零门禁**（UI1/U0 起纳入）；
//   · 键 = **仓根相对路径**（`src/x.ts` / `src-client/x.js`）—— 多根后裸名会互相串；
//   · 与 `audit-architecture` 的行数**口径不同**（本件剥注释、那件含注释），故差值可达数百行而非 1 行；
//     **本件口径以本件输出为准**（冻结基线全部按本口径标定）。
//
// 退出码：0 = pass · 1 = fail · 3 = skip（src 缺席，诚实跳过）
// 用法: node scripts/check-module-growth.mjs [--print] [--rebase]
//   --print   只打印各模块行数（用于取样定基线，不判红）
//   --rebase  把当前实测行数**回写**进本文件的 FREEZE 表（有意为之的增长走这条路，
//             回写后必须用 git diff 复核——这让「允许某模块变大」成为显式可见的决定）
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELF = fileURLToPath(import.meta.url)

/**
 * **扫描根（多根 · 2026-09-15 扩面）**。
 *
 * 为什么扩：本件原先只扫 `src/**\/*.ts`，于是 **`src-client/` 一条门禁都没有** ——
 *   实测 `body.js` 长到 **5477 行**而无人知（后端最大模块 `panel-shared.ts` 779 行，却受棘轮紧盯）。
 *   「**前端不受纪律约束**」本身才是真病灶，故把同一套棘轮覆盖到前端。
 *
 * ⚠ **键格式随之迁移**：从**裸文件名**改为**仓根相对路径**（`src/x.ts` / `src-client/x.js`）——
 *   两个根可能有同名文件，裸名会互相串。
 */
const ROOTS = [
  { dir: join(root, 'src'), ext: '.ts', skip: (f) => f.includes('.generated.') },
  { dir: join(root, 'src-client'), ext: '.js', skip: (f) => f.includes('.generated.') },
]

/** 硬顶：任何模块（生成物除外）超过即红 */
const HARD_CAP = 1000
/**
 * **硬顶豁免（临时 · 拆分对象专用）**（2026-09-15 UI1/U0 引入）。
 *
 * 为什么需要：`src-client/body.js` **5476 行 > HARD_CAP** ⇒ 若不豁免，**硬顶先判**，
 *   于是它**在拆分完成前会一直红** —— 连"登记基线"都过不去，任何前端改动都被堵死。
 *   而它恰恰是 UI1 的**拆分对象**：门的作用应是**逼出拆分**，不是**阻塞拆分**。
 *
 * 语义：豁免者**退出硬顶**，但**仍受冻结棘轮**（只许降）—— 于是拆分每推进一步，基线随之下调。
 * ⚠ **留痕要求**：本集合**必须在对应模块拆完后清空**（条目长期留着 = 一个永久后门）。
 */
const HARD_CAP_EXEMPT = new Set(['src-client/body.js'])
/** 进入冻结名单的下限：≥ 此行数的模块必须登记基线且只许降 */
const FREEZE_THRESHOLD = 600
/**
 * **容差带**（2026-09-14 用户反馈后加）：允许在基线之上小幅增长而不判红。
 *
 * 为什么需要它：写死「只许降不许升」过于刚性——加几行注释、加一个分支、补一处兜底都会被拦，
 *   于是开发者要么放弃这次合理改动，要么为了过门禁把内聚的代码**硬切**成两个模块。
 *   后者比堆积更有害：**切错接缝 = 把一个内聚体拆成两个互相依赖的碎片**，行数好看了，可维护性变差。
 *
 * 容差的定位（**关键，别用反**）：
 *   · 它是「日常波动的缓冲」，**不是可支配的额度**。故超容差即红，且在容差内也会打印提示；
 *   · 大幅且必要的增长走 `--rebase` 显式回写（写进 git diff，进得了 review），
 *     而不是靠容差悄悄吃掉。
 */
const SLACK = 15

/**
 * 冻结基线（棘轮：**只许降**）。
 * 2026-09-14 定基线（实测取样，口径见件头）。每完成一次瘦身，应把对应条目**下调**。
 */
const FREEZE = {
  // UI1/U2（2026-09-15）：抽出 panes-memory(240)/panes-config(118) ⇒ **棘轮下调** 3147 → 2867
  //   （口径：**有效行数** = 物理行 − 注释 − 空行，见 codeLinesOf）
  // UI1/U2（2026-09-15）：抽出 panes-toggles.js（8 符号）⇒ **棘轮下调** 2867 → 2610
  // UI1/U2（2026-09-15）：抽出 panes-memory-detail.js（14 符号）+ 删死代码 sparkline ⇒ 棘轮 2314 → 1849
  // UI1/U2（2026-09-15）：抽出 panes-overview.js（8 符号）+ 清空壳标记 ⇒ 棘轮 1882 → 实测值
  // UI1/U2（2026-09-15）：抽出 panes-arch(4)/panes-observe(3) ⇒ 棘轮 1552 → 实测值
  // UI1/U2（2026-09-15）：抽出 panes-suite(2 符号) ⇒ 棘轮 1065 → 840
  // UI1/U2（2026-09-15）：抽出 panes-settings(11 符号) ⇒ 棘轮 840 → 实测值
  // UI1 收尾（2026-09-15）：DS_STATE_TEXT/DS_PROBE_TEXT/dsFmt* 迁入 panes-suite.js + 删 dsFmtTime 重复定义 ⇒ 棘轮 648 → 626
  // 2026-09-17 i18n：导航文案层（i18n-nav.js）与控件元数据域（i18n-ctrl.js）**按领域接缝外提**后，
  //   body.js 由 708（超容差红）回落到 613 ⇒ 按棘轮纪律**下调基线**（只许收紧，不许借机抬高）。
  'src-client/body.js': 613,
  'src-client/styles.js': 726,
  'src/scheduler.ts': 611,
  'src/treeops.ts': 588,
  'src/panel-shared.ts': 537,
  'src/mcl.ts': 433,
}

const PRINT = process.argv.includes('--print')
const REBASE = process.argv.includes('--rebase')

if (!ROOTS.some((r) => existsSync(r.dir))) {
  console.log('check-module-growth: 所有扫描根缺席 ⇒ skip（exit 3）')
  process.exit(3)
}

/**
 * 模块级**可变全局**基线（棘轮：只许降）。
 * 口径（保守、可机检）：**列 0** 的 `let` / `var` 顶层声明（先剥注释）。
 * ⚠ 与 `audit-architecture` 的「可变全局」列**口径不同**（它另含可变绑定对象，实测报 5 处；
 *   本件按上述保守口径实测 2 处：`mcl.ts` 的 msgFactory、`distill.ts` 的惰性实现缓存）。
 *   两件并存不冲突：那件给全貌，本件做**可回写、可收紧的棘轮**。
 */
const MUTABLE_BASELINE = 0

/** 剥注释（本件内联，避免 import 触发 check-file-channel 的顶层执行逻辑） */
function stripCommentsLite(s) {
  // ⚠ 顺序不可调换，理由见 check-file-channel.mjs 同名函数（注释里的 audit/*.md 会吞代码）
  return s.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 模块级**可变全局**数（列 0 的 `let`/`var`，且**确被重新赋值**）。
 *
 * ⚠ **口径已精确化（UI1/U1 · 2026-09-15）**：原口径按关键字计数 `^(let|var)\s` ⇒ 会把
 *   `var Bus = (function () { … })();` 这类**一次绑定**误判为可变全局（实测抽服务后 6 处 IIFE
 *   绑定被误报，而它们**从不被重新赋值**）。
 *
 *   为什么不能简单改成 `const` 了事：仓内多件门禁/测试按 **`var X = ` 字面**抽区段
 *   （`test-fold-state` / `check-ui-contract` ⑥）⇒ 改 `const` 会让它们全部失配（实测连挂两次）。
 *   ⇒ 故**修门口径**（精确化，不是放宽）：只有「**在别处被重新赋值**」的绑定才算可变全局。
 *   **真的可变状态仍会被抓到**（见 `--selftest` 的反例用例）。
 */
export function countMutableGlobals(code) {
  const lines = stripCommentsLite(code).split('\n')
  const bound = []
  for (const l of lines) {
    const m = /^(?:var|let)\s+([A-Za-z_$][\w$]*)\s*=/.exec(l)
    if (m) bound.push(m[1])
  }
  let n = 0
  for (const name of bound) {
    // 被重新赋值 = 在**非声明行**上出现 `name = …`（行内任意位置都算）。
    //   ⚠ 两条边界**都由 selftest 的反例抓出**（本函数改了三版，每版都被自证拦住）：
    //     · 要求"行首" ⇒ `function f() { Y = 2; }` **漏检**（门被悄悄放宽）；
    //     · 不跳声明行 ⇒ `var Bus = (…)` 里的 `Bus = ` **被当成重新赋值**（6 处误报）。
    //   `[^=]` 排除 `==`；`[^\w.$]` 前缀排除 `obj.name =`（改属性 ≠ 改变量绑定）。
    const isDecl = new RegExp(`^\\s*(?:var|let|const)\\s+${name}\\s*=`)
    const re = new RegExp(`(?:^|[^\\w.$])${name}\\s*=[^=]`)
    if (lines.some((l) => !isDecl.test(l) && re.test(l))) n++
  }
  return n
}

/**
 * **有效行数 = 物理行数 − 注释行 − 空行**（2026-09-15 用户指正后改）。
 *
 * **为什么必须这么改**（两条实证）：
 *   ① **注释撑开棘轮**：UI1/U2-B 用"只加注释"做分区块 ⇒ `body.js` 从 3816 → **3831**，
 *      **正好吃满 15 行容差** ⇒ 此后**加一行注释就红** ⇒ 门会**把它自己锁死**。
 *   ② **口径与直觉不符**：门的本意是守"**代码规模**"，而注释与空行**不是规模**。
 *      一个满注释的实现被算成"超大模块"、而删掉注释就能"变瘦" —— 那守的是**风格**，不是**规模**。
 *
 * 口径（保守、可复算）：
 *   · 剥 `//` 行注释 与 `/* … *​/` 块注释（**含跨行块**，且**不误伤字符串里的 `//`** ——
 *     本件按"整行以注释符起头"判定，避免解析 JS 字符串的复杂度）；
 *   · 空行不计；
 *   · **行尾注释也算注释**（整行只有 `code // comment` 时，该行**仍计入** —— 它含代码）。
 */
export function codeLinesOf(s) {
  const parts = s.split('\n')
  if (parts.length && parts[parts.length - 1] === '') parts.pop()
  let inBlock = false
  let n = 0
  for (const raw of parts) {
    const l = raw.trim()
    if (!l) continue // 空行
    if (inBlock) { if (l.includes('*/')) inBlock = false; continue } // 块注释内
    if (l.startsWith('/*')) { if (!l.includes('*/')) inBlock = true; continue } // 块注释起
    if (l.startsWith('//')) continue // 行注释
    n++
  }
  return n
}

const files = []
for (const r of ROOTS) {
  if (!existsSync(r.dir)) continue
  for (const f of readdirSync(r.dir)) {
    if (!f.endsWith(r.ext) || r.skip(f)) continue
    files.push({ rel: join(relative(root, r.dir), f).split(sep).join('/'), abs: join(r.dir, f) })
  }
}
const rows = files.map((f) => {
  const code = readFileSync(f.abs, 'utf8')
  return { file: f.rel, lines: codeLinesOf(code), mutable: countMutableGlobals(code) }
}).sort((a, b) => b.lines - a.lines)

if (PRINT) {
  console.log('模块行数（物理行 · 排除 *.generated.ts）')
  for (const r of rows) console.log(`  ${String(r.lines).padStart(5)}  ${r.file}`)
  process.exit(0)
}

if (REBASE) {
  const next = {}
  for (const r of rows) {
    if (r.lines >= FREEZE_THRESHOLD || FREEZE[r.file] !== undefined) next[r.file] = r.lines
  }
  const body = Object.entries(next).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  '${k}': ${v},`).join('\n')
  const self = readFileSync(SELF, 'utf8')
  const re = /(const FREEZE = \{)[\s\S]*?(\n\})/
  if (!re.test(self)) { console.error('check-module-growth: FREEZE 表定位失败（正则未命中），未回写'); process.exit(1) }
  writeFileSync(SELF, self.replace(re, `$1\n${body}$2`), 'utf8')
  console.log('check-module-growth: FREEZE 已回写为当前实测值，请 git diff 复核：')
  console.log(body)
  process.exit(0)
}

/**
 * 核心判定（纯函数 —— `--selftest` 直接驱动它，不碰真实源码）。
 * 为什么要抽出来：`HARD_CAP` 1000 对当前最大模块 879 而言**今天谁也碰不到**，
 *   不写自证就分不清「判定对了」与「分支根本没走到」。
 */
export function evaluate(rows, freeze = FREEZE, cap = HARD_CAP, threshold = FREEZE_THRESHOLD, mutBaseline = MUTABLE_BASELINE, slack = SLACK, exempt = HARD_CAP_EXEMPT) {
  const problems = []
  const shrunk = []
  const within = []

  for (const r of rows) {
    if (r.lines > cap && !exempt.has(r.file)) {
      problems.push(`[硬顶] ${r.file} 实测 ${r.lines} 行 > ${cap}（必须拆分，不许继续堆）`)
      continue
    }
    const base = freeze[r.file]
    if (base === undefined) {
      if (r.lines >= threshold) {
        problems.push(`[未登记] ${r.file} 实测 ${r.lines} 行 ≥ ${threshold} ⇒ 必须登记进 FREEZE 基线（新功能应落新模块，而不是堆大旧模块）`)
      }
      continue
    }
    if (r.lines > base + slack) {
      problems.push(`[冻结] ${r.file} 实测 ${r.lines} > 基线 ${base} + 容差 ${slack}（+${r.lines - base}）⇒ 出路二选一：① 新功能落新模块，或按**领域接缝**拆出一块（不是按行数硬切）；② 确属必要增长 → --rebase 显式回写并写明理由`)
    } else if (r.lines > base) {
      within.push(`[容差内] ${r.file} 实测 ${r.lines} > 基线 ${base}（+${r.lines - base} / 容差 ${slack}）⇒ 允许，但容差是波动缓冲**不是额度**，别当成长空间`)
    } else if (r.lines < base) {
      shrunk.push(`[可收紧] ${r.file} 实测 ${r.lines} < 基线 ${base}（-${base - r.lines}）⇒ 请下调 FREEZE 基线（棘轮只许收紧）`)
    }
  }
  // 已消失的冻结条目（模块被删/改名）——必须清理，否则基线里留幽灵条目
  for (const k of Object.keys(freeze)) {
    if (!rows.some((r) => r.file === k)) problems.push(`[幽灵基线] FREEZE 里的 ${k} 在 src/ 中不存在 ⇒ 请删除该条目（留着会让「未登记」检查失准）`)
  }
  // 模块级可变全局（棘轮）：跨域的隐式可变状态是「重启后行为不一致」的常见源头，
  //   本仓已把三条 `-share` 桥退役（边数 0），此处防其以可变全局的形式复活。
  const totalMut = rows.reduce((n, r) => n + (r.mutable ?? 0), 0)
  if (totalMut > mutBaseline) {
    const where = rows.filter((r) => (r.mutable ?? 0) > 0).map((r) => `${r.file}(${r.mutable})`).join(', ')
    problems.push(`[可变全局] 实测 ${totalMut} 处 > 基线 ${mutBaseline} ⇒ 只许降不许升（当前：${where || '无'}）`)
  } else if (totalMut < mutBaseline) {
    shrunk.push(`[可收紧] 可变全局实测 ${totalMut} < 基线 ${mutBaseline} ⇒ 请下调 MUTABLE_BASELINE（棘轮只许收紧）`)
  }
  return { problems, shrunk, within }
}

if (process.argv.includes('--selftest')) {
  const cases = [
    { name: '等于基线 ⇒ 无错', rows: [{ file: 'a.ts', lines: 800 }], freeze: { 'a.ts': 800 }, want: 0 },
    { name: '超基线但在容差内 ⇒ 不红（容差生效，不拦合理微调）', rows: [{ file: 'a.ts', lines: 810 }], freeze: { 'a.ts': 800 }, want: 0 },
    { name: '超基线且超容差 ⇒ 红（冻结真的生效）', rows: [{ file: 'a.ts', lines: 816 }], freeze: { 'a.ts': 800 }, want: 1 },
    { name: '低于基线 ⇒ 不红（只提示收紧）', rows: [{ file: 'a.ts', lines: 790 }], freeze: { 'a.ts': 800 }, want: 0 },
    { name: '超硬顶 ⇒ 红', rows: [{ file: 'a.ts', lines: 1001 }], freeze: {}, want: 1 },
    { name: '新模块 ≥600 未登记 ⇒ 红（防无声混入）', rows: [{ file: 'new.ts', lines: 600 }], freeze: {}, want: 1 },
    { name: '幽灵基线条目 ⇒ 红', rows: [{ file: 'a.ts', lines: 10 }], freeze: { 'gone.ts': 900 }, want: 1 },
    { name: '未冻结的小模块增长 ⇒ 不拦（不受冻结约束）', rows: [{ file: 's.ts', lines: 599 }], freeze: {}, want: 0 },
    { name: '可变全局超基线 ⇒ 红', rows: [{ file: 'a.ts', lines: 10, mutable: 3 }], freeze: {}, want: 1 },
    { name: '可变全局等于基线 ⇒ 不红', rows: [{ file: 'a.ts', lines: 10, mutable: 0 }], freeze: {}, want: 0 },
    // ── 2026-09-15 UI1/U0：硬顶豁免（拆分对象专用）──
    { name: '超硬顶且**不在豁免集** ⇒ 红', rows: [{ file: 'big.js', lines: 5000 }], freeze: { 'big.js': 5000 }, exempt: new Set(), want: 1 },
    { name: '超硬顶但在**豁免集** ⇒ 不因硬顶红（豁免生效）', rows: [{ file: 'big.js', lines: 5000 }], freeze: { 'big.js': 5000 }, exempt: new Set(['big.js']), want: 0 },
    { name: '⚠ 豁免硬顶 **≠** 豁免棘轮：豁免集内增长超容差 ⇒ 仍红', rows: [{ file: 'big.js', lines: 5020 }], freeze: { 'big.js': 5000 }, exempt: new Set(['big.js']), want: 1 },
  ]
  let bad = 0
  // ── countMutableGlobals 口径自证（UI1/U1：口径精确化后必须证明"没放宽"）──
  const mutCases = [
    { n: 'IIFE 一次绑定 ⇒ **不算**可变（旧口径误报的正是这类）', src: 'var Bus = (function () { return {} })();\n', want: 0 },
    { n: 'let 一次绑定 ⇒ 不算可变', src: 'let W = (function () { return 1 })();\n', want: 0 },
    { n: 'const 绑定 ⇒ 不算可变', src: 'const Z = {}\n', want: 0 },
    { n: '⚠ 顶层**重新赋值** ⇒ 仍算可变（未放宽）', src: 'var X = 1;\nX = 2;\n', want: 1 },
    { n: '⚠ 函数内**重新赋值** ⇒ 仍算可变（未放宽）', src: 'var Y = 1;\nfunction f() { Y = 2; }\n', want: 1 },
    { n: 'var 无初值 ⇒ 不计入（口径只认 `= ` 绑定）', src: 'var A;\n', want: 0 },
  ]
  for (const c of mutCases) {
    const got = countMutableGlobals(c.src)
    const pass = got === c.want
    if (!pass) bad++
    console.log(`${pass ? '✅' : '❌'} [可变口径] ${c.n}（期望 ${c.want} · 实得 ${got}）`)
  }
  for (const c of cases) {
    const got = evaluate(c.rows, c.freeze, undefined, undefined, undefined, undefined, c.exempt ?? new Set()).problems.length
    const ok = got === c.want
    if (!ok) bad++
    console.log(`${ok ? '✅' : '❌'} ${c.name}（期望 ${c.want} 项错 · 实得 ${got}）`)
  }
  if (bad) { console.log(`\nFAIL（${bad} 条自证未过）`); process.exit(1) }
  console.log('\nPASS（selftest：冻结/硬顶/未登记/幽灵四类判定均已自证）')
  process.exit(0)
}

const { problems, shrunk, within } = evaluate(rows)

const frozen = rows.filter((r) => FREEZE[r.file] !== undefined)
console.log(`模块增长门禁 · src ${rows.length} 模块 · 最大 ${rows[0].lines} 行 · 硬顶 ${HARD_CAP} · 冻结名单 ${frozen.length} 个`)
for (const r of frozen) console.log(`  ${String(r.lines).padStart(5)} / 基线 ${String(FREEZE[r.file]).padStart(5)}  ${r.file}`)
const totalMut = rows.reduce((n, r) => n + (r.mutable ?? 0), 0)
const mutWhere = rows.filter((r) => (r.mutable ?? 0) > 0).map((r) => ` ${r.file}(${r.mutable})`).join('')
console.log(`  可变全局 ${totalMut} 处 / 基线 ${MUTABLE_BASELINE}${mutWhere ? ' ·' + mutWhere : ''}`)

if (within.length) { console.log(''); within.forEach((s) => console.log('· ' + s)) }
if (shrunk.length) { console.log(''); shrunk.forEach((s) => console.log(s)) }

if (problems.length) {
  console.log('')
  problems.forEach((p) => console.log('❌ ' + p))
  console.log(`\nFAIL（${problems.length} 项）`)
  process.exit(1)
}
console.log('\nPASS')
