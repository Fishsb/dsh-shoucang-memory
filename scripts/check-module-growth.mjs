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
import { readFileSync, readdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
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
 *
 * ⚠ **双水位（2026-09-23 · ACT-351 · 用户授权档一）——治「容差被静默吃掉」**：
 *   判因（会审四席实测）：本件原先只有 `base` 一个数，于是 `base + SLACK` 的 15 行是
 *   「**每次 rebase 都会重置回满**」的**可再生额度**。实证（真形，不是推演）：
 *     · `851215f` 把 styles 由 730 下调到 726（干净）；
 *     · `467206f` 又把它长到 729，而该提交**只改了 body.js 一行基线** ⇒ styles 的 726 至今未动
 *       ⇒ **+3 自 2026-09-17 起永久固化在静默区**，此后每次读数都只重复「容差内」这句话。
 *     · scheduler 同形状，是**第二次**：`9b8bdb2`/`17db03b`/`41fd7f8` 三提交跨 3 天实测均
 *       617 / 基线 611（+6），直到 `5df4b42` 重构降到 606 才归零。
 *   ⇒ 故每个条目由 `数字` 改为 `{ base, hwm }`：
 *     · `base` —— 承诺基线，**只许降**（语义与改造前**逐字不变**：`lines > base + SLACK` 判红）；
 *     · `hwm`  —— **历史最高实测水位**（high-water mark）。新高度被观测到时**每次运行都会打印**，
 *                但**只在 `--rebase` 时落账**（门禁绝不自行改写源码）；与 `base` 之差即
 *                「**已吃掉、尚未归还的账面额度**」，**每次运行逐行显式打印** ⇒ 不再静默。
 *   ⚠ **判红语义零变更**：本改造**只加账、不加红**（改造前红的，改造后仍红；改造前绿的，仍绿）。
 *   ⚠ 兼容：条目仍可写**裸数字**（等价 `{ base: N, hwm: N }`）——旧形态不会被判成未登记。
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
  'src-client/body.js': { base: 613, hwm: 615 },
  'src-client/styles.js': { base: 726, hwm: 729 },
  // 2026-09-20 round 8：scheduler 实测 606 < 基线 611 ⇒ 按棘轮纪律**下调基线**（只许收紧）。
  //   （本件 `--print` 每次都会提示"可收紧"；此处把它落下来，避免该提示长期挂着成为背景噪音。）
  // ACT-295（2026-09-21）：子代理路由域 8 键 + 模型目录按领域接缝抽到 `model-config.ts` / `llm-catalog.ts`
  //   ⇒ **实测 578 < 606**，按同一棘轮纪律**再下调**（只许收紧；本轮是净减 28 行，不是放宽）。
  'src/scheduler.ts': { base: 578, hwm: 585 },
  /* ★IR1 册五 E2（2026-09-18）**冻结名单减项 6 → 3**：三条基线**退役**（不是放宽）——
   *   · `src/treeops.ts` 基线 588 → 实测 596（仍 >600 阈值以下？见下）… 实测 **596 < 600** ⇒ 按本件阈值
   *     （`FREEZE_THRESHOLD = 600`）它**不再需要登记**；
   *   · `src/panel-shared.ts` 522 → 实测 **510**（IR1 册三删影子复算 + 册五搬出画像装配）⇒ 同样落到阈值下；
   *   · `src/mcl.ts` 433 → 实测 **434**（册四键更名后未增行）⇒ 亦在阈值下。
   *   ⚠ **这不是"少守了一个模块"**：阈值规则仍在（≥600 行者**必须**登记基线），退役只表示"它现在够小"；
   *     若任一条日后长回 ≥600，门禁会立刻要求重新登记（判据由 `check-module-growth` 自身持有）。
   *   ⚠ 用户拍板口径（R3③"越过冻结棘轮须拍板"）**不适用**：本改动是**收紧**（移除豁免），不是抬基线。 */
}

/** 归一一个 FREEZE 条目：兼容**裸数字**（旧形态）与 `{ base, hwm }`（双水位新形态）。 */
export function freezeOf(entry) {
  if (typeof entry === 'number') return { base: entry, hwm: entry } // 旧形态：水位即基线（账面 0）
  if (entry && typeof entry === 'object') {
    const base = Number(entry.base)
    const hwm = entry.hwm === undefined ? base : Number(entry.hwm)
    return { base, hwm: Number.isFinite(hwm) ? hwm : base }
  }
  return { base: NaN, hwm: NaN }
}

/**
 * **FREEZE 块就地改写**（纯函数 —— `--rebase` 真路径与 `--selftest` **共用同一实现**）。
 *
 * ⚠ **存在的理由（2026-09-23 · ACT-351 · 独立复核席实测抓出）**：
 *   首版把这段逻辑**复制**了一份进 `--selftest`（`REBASE_SIM`）。复核席用变异测试证明：
 *   对**真实** `--rebase` 路径注入三种缺陷（丢行尾注释 / 吞全部注释 / 幽灵检查被短路），
 *   自证**全部 exit=0 PASS 逃逸** —— 因为自证验的是副本，副本没坏。
 *   ⇒ 正解 = **抽成单一实现，两侧共用**（本仓「单一实现」纪律；同 `bank-lock` 先例）。
 *   修后：变异真实现即自证红。
 *
 * ⚠⚠ **`raise` 参数的判因（2026-09-23 · ACT-355 · 用户「从根源解决」）**：
 *   首版**无条件**写 `{ base: 实测, hwm: 实测 }` ⇒ 等于一个「**把免检带重置回满**」的按钮：
 *   实测 `715(绿) → 716(红) → --rebase → 730(绿) → 731(红)`，**累计吃 31 行而判红从不提前**。
 *   而本件注释 8 行处一直写着「棘轮：**只许降**」——**工具与自己的语义自相矛盾**，
 *   这才是「容差可再生」的根因；加账（ACT-351）只是把它**说出来**，没有动它。
 *   ⇒ 现收口为：
 *     · `raise=false`（**缺省**）：`base := min(旧 base, 实测)` —— **只许收紧**，抬不了；
 *       `hwm := max(旧 hwm, 实测)`（水位如实跟涨，仅作观测）。
 *     · `raise=true`（**须显式 `--raise`**）：`base := hwm := 实测` —— 有意增长**显式**落账，
 *       且报告里**大声打印**「抬了哪几条、多少行」，进得了 review（同 R3③ 的知情要求）。
 *   ⚠ 判红语义仍**零变更**：`lines > base + slack`；本参数只改**回写**行为，不改判定。
 *
 * @param {string} src 源文件全文（CRLF 安全：条目行正则用 `\r?$`，见下）
 * @param {Map<string, number>} wanted 期望值（key = 仓根相对路径）
 * @param {{ raise?: boolean }} [opt] `raise:true` ⇒ 允许抬 base（等价旧行为，须显式）
 * @returns {{ inner:string, ghost:string[], seen:Set<string>, matched:boolean,
 *             tightened:Array<{key:string,from:number,to:number}>,
 *             raised:Array<{key:string,from:number,to:number}>,
 *             selfChanged:boolean }}
 */
export function rewriteFreezeBlock(src, wanted, opt = {}) {
  const raise = opt.raise === true
  const re = /(const FREEZE = \{)([\s\S]*?)(\n\})/
  const m = src.match(re)
  if (!m) return { inner: '', ghost: [], seen: new Set(), matched: false, tightened: [], raised: [], selfChanged: false }
  const ghost = []
  const seen = new Set()
  const tightened = []
  const raised = []
  let selfChanged = false
  const inner = m[2].split('\n').map((line) => {
    // 只认形如  <indent>'<path>': <值>[,] [行尾注释]  的条目行；注释行/空行原样透传
    // ⚠ `\r?$` **必须显式写**（2026-09-23 实测）：JS 正则里 `.` **不匹配 `\r`**，
    //   而本仓源文件是 CRLF ⇒ 若写 `(.*)$`，带 `\r` 的条目行**整体不匹配** ⇒
    //   既不改写、又不记 seen ⇒ 全部落进 additions ⇒ `--rebase` 后**条目重复**（实测 3→6）。
    const em = /^(\s*)'([^']+)':\s*(.*?)\r?$/.exec(line)
    if (!em) return line
    const indent = em[1]
    const key = em[2]
    const rest = em[3]
    // ⚠ 行尾风格**从原始行取**（正则已用 `\r?$` 把 `\r` 排除在捕获组外）
    const eol = line.endsWith('\r') ? '\r' : ''
    if (!wanted.has(key)) { ghost.push(key); return line }
    seen.add(key)
    // 把「值段」与「行尾注释」拆开：注释起点 = 首个 `//` 或 `/*`（值本身不含这两种记号）
    const ci = (() => {
      const a = rest.indexOf('//')
      const b = rest.indexOf('/*')
      if (a < 0) return b
      if (b < 0) return a
      return Math.min(a, b)
    })()
    const comment = ci >= 0 ? rest.slice(ci) : ''
    const valuePart = (ci >= 0 ? rest.slice(0, ci) : rest).trimEnd().replace(/,$/, '')
    if (!/^(\d+|\{[\s\S]*\})$/.test(valuePart.trim())) { ghost.push(`${key}（值段无法解析：${valuePart.trim()}）`); return line }
    const v = wanted.get(key)
    const old = freezeOf(/^\d+$/.test(valuePart.trim()) ? Number(valuePart.trim()) : evalFreezeLiteral(valuePart.trim()))
    // ── **棘轮收口**：缺省只许收紧（base 取小）、水位如实跟涨；抬 base 须显式 ──
    const nextBase = raise ? v : Math.min(old.base, v)
    const nextHwm = raise ? v : Math.max(old.hwm, v)
    if (nextBase < old.base) tightened.push({ key, from: old.base, to: nextBase })
    if (nextBase > old.base) raised.push({ key, from: old.base, to: nextBase })
    if (nextBase !== old.base || nextHwm !== old.hwm) selfChanged = true
    // 有意增长（raise）时 base↑ 与水位重置**在 diff 里同现**，review 看得见
    return `${indent}'${key}': { base: ${nextBase}, hwm: ${nextHwm} },${comment ? ' ' + comment : ''}${eol}`
  }).join('\n')
  return { inner, ghost, seen, matched: true, tightened, raised, selfChanged }
}

/** 解析源码里的 FREEZE 值字面量：`123` 或 `{ base: 123, hwm: 456 }`（**只做受控解析，不用 eval**）。 */
export function evalFreezeLiteral(text) {
  const t = String(text).trim()
  if (/^\d+$/.test(t)) return Number(t)
  const b = /base\s*:\s*(\d+)/.exec(t)
  const h = /hwm\s*:\s*(\d+)/.exec(t)
  if (!b) return NaN
  return { base: Number(b[1]), hwm: h ? Number(h[1]) : Number(b[1]) }
}

const PRINT = process.argv.includes('--print')
const REBASE = process.argv.includes('--rebase')
/** ⚠ **抬基线须显式**（2026-09-23 · ACT-355 · 用户「从根源解决」）：见 `rewriteFreezeBlock` 判因。 */
const RAISE = process.argv.includes('--raise')

/**
 * ⚠ **必须判定"是否被直接执行"（2026-09-23 实测踩到 · ACT-351）**：
 *   本件被 `check-pane-sections.mjs:29` **直接 import**（`import { codeLinesOf } from './check-module-growth.mjs'`）。
 *   而本件顶层代码含 `process.exit(...)` ⇒ 被 import 时**顶层会抢先执行并退出** ⇒
 *   消费方自己的判据**永远跑不到**。实测症状（这不是推演）：
 *     `node scripts/check-pane-sections.mjs --selftest` 输出 36 行**全是本件的断言**，
 *     pane 自己的 5 条 `okc` 断言**一条都没跑**，而其退出码来自本件 ⇒ **假绿**。
 *   （该缺陷在 HEAD 上同样存在，非本次引入；本件顺手收口——因为我在同一处施工。）
 *   ⇒ 范式照 `lib-scan-scope.mjs:222-231`（本仓已为同型问题留档的先例）：
 *     副作用代码必须分清「被 import」与「被直接执行」。
 *   ⚠ 实现用**早退**而非包块：本文件后面全是 `export function`（块内不许 export）。
 *
 *   ⚠⚠ **判据必须用 `realpath` 归一，不能比字符串（2026-09-23 · ACT-351 · 独立复核实测抓出）**：
 *     首版照抄 `lib-scan-scope.mjs:229-231` 的 `import.meta.url === new URL('file://' + argv[1])`。
 *     独立复核席用 **junction**（`<仓根上级>/sc-jt → <仓根>`）实测：该式**判为 false** ⇒
 *     整个文件体（含 `process.exit` 与 PASS/FAIL 输出）**一行都不执行** ⇒
 *     `node <junction>/check-module-growth.mjs` 与 `--selftest` 均为 **输出 0 行 · exit 0**
 *     ⇒ **判红能力在别名路径下整体消失，且比旧「假绿」更隐蔽**（旧至少打印内容）。
 *     ⚠ 该模式缺陷**继承自先例**（`lib-scan-scope --selftest` 经同一 junction 亦 `exit 0 / 0 行`），
 *       但本轮把它搬进了**门禁主体**，影响面变大 ⇒ 此处修掉，先例另行登记（不扩本轮范围）。
 *   ⇒ 正解：`realpathSync` 归一后比较（实测可穿透 junction；subst 盘符亦正常）。
 */
const IS_MAIN = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch { return false }
})()

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

// ══════════════════════════════════════════════════════════════════════════════
// ↓↓↓ **顶层副作用**（扫描读盘 / 打印 / 退出）——只在「被直接执行」时跑（ACT-355）
// ══════════════════════════════════════════════════════════════════════════════
//   ⚠ **判因（独立复核席登记项 (v)/(vi)）**：原实现把扫描、`--print`、`--rebase` 都放在
//     `IS_MAIN` 守卫**之前** ⇒ 被 `import` 时它们照样执行。实测后果：被 import 时带 `--rebase`
//     跑，会**把被 import 件自己的 FREEZE 改写掉**（隔离副本实测 `726/613/578 → 729/615/585`）；
//     带 `--print` 跑则只打印本件表、消费方自有输出不出现。
//     （今天不经 `check-runner` 触发——它只以裸参与 `--selftest` 跑消费方——但这是**结构性的**
//      「import 期副作用」，属本仓反复记账的「代理指标非判据」族 ⇒ 守卫前移根治。）
//   ⚠ 位置纪律：必须在全部 `export function` 之后（块内不许 export）。

// ⚠ **扫描提到模块作用域**（2026-09-23）：它是**纯读**、无副作用，且 `evaluate` 后的报告段
//   也要用 `rows` ⇒ 放进 `if` 块会造成作用域断裂（本轮实测踩到 `ReferenceError: rows is not defined`）。
//   只有「打印 / 写盘 / 退出」这三类副作用留在 `IS_MAIN` 块内。
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

if (IS_MAIN) {

if (PRINT) {
  console.log('模块行数（物理行 · 排除 *.generated.ts）')
  for (const r of rows) console.log(`  ${String(r.lines).padStart(5)}  ${r.file}`)
  process.exit(0)
}

if (REBASE) {
  /* ⚠ **改造（2026-09-23 · ACT-351 · 用户授权档一）**：原实现用
   *   `/(const FREEZE = \{)[\s\S]*?(\n\})/` **整段替换** ⇒ 实测把 FREEZE 表内的历史注释
   *   （`IR1 册五 E2` / `UI1/U2` 棘轮轨迹）**全部吞掉：28 行 → 4 行**。
   *   那些注释是「基线**为什么是这个数**」的唯一依据 ⇒ 等于每次 rebase 静默销毁判据的来源。
   *   ⇒ 改为**逐行就地改值**：只重写 `'file': <值>` 里的**值段**，行内注释与整行注释**原样保留**。
   *   ⚠ 幽灵条目（FREEZE 里有、扫描面里没有）**不再静默删除**（删行同样会丢注释）——
   *     改为**报错退出**，交人处置；这正是本次要治的「静默」形态。
   */
  const self = readFileSync(SELF, 'utf8')
  const re = /(const FREEZE = \{)([\s\S]*?)(\n\})/
  const m = self.match(re)
  if (!m) { console.error('check-module-growth: FREEZE 表定位失败（正则未命中），未回写'); process.exit(1) }

  const wanted = new Map()
  for (const r of rows) {
    if (r.lines >= FREEZE_THRESHOLD || FREEZE[r.file] !== undefined) wanted.set(r.file, r.lines)
  }

  // ⚠ **消费单一实现** `rewriteFreezeBlock`（与 `--selftest` 共用，见该函数注释的判因）
  //   ⚠ `raise`：缺省 **只许收紧**（棘轮语义）；抬 base 须显式 `--raise`（见该函数注释的判因）
  const { inner: rewritten, ghost, seen, tightened, raised } = rewriteFreezeBlock(self, wanted, { raise: RAISE })

  if (ghost.length) {
    console.error(`check-module-growth: FREEZE 含**幽灵条目**，拒绝回写（不静默删除）：${ghost.join(', ')}`)
    console.error('  处置：人工确认后从 FREEZE 删除该条目（保留其注释到 CHANGELOG 或本表其他位置），再重跑。')
    process.exit(1)
  }

  // 新增条目（≥阈值却未登记）追加在 FREEZE 块末尾，闭合花括号之前
  const additions = [...wanted.keys()].filter((k) => !seen.has(k))
    .sort((a, b) => wanted.get(b) - wanted.get(a))
    .map((k) => `  '${k}': { base: ${wanted.get(k)}, hwm: ${wanted.get(k)} },`)
  // ⚠ 行尾风格跟随原文（CRLF/LF），否则新增行会混入 LF（本仓源文件是 CRLF）
  const NL = self.includes('\r\n') ? '\r\n' : '\n'
  const inner = additions.length ? `${rewritten}${NL}${additions.join(NL)}` : rewritten

  writeFileSync(SELF, self.replace(re, `$1${inner}$3`), 'utf8')
  const mode = RAISE ? '**--raise（显式抬基线）**' : '**只许收紧（棘轮缺省）**'
  console.log(`check-module-growth: FREEZE 已就地回写（${mode} · 注释保持原样），请 git diff 复核：`)
  console.log(inner.split('\n').filter((l) => /^\s*'/.test(l)).join('\n'))
  // ⚠ **抬基线必须大声**（R3③「越过冻结棘轮须拍板」的知情要求）：逐条打印从多少抬到多少
  if (raised.length) {
    console.log('')
    console.log(`⚠ **本次抬高了 ${raised.length} 条基线**（这是越过冻结棘轮，属 R3③，须用户拍板）：`)
    for (const r of raised) console.log(`    ${r.key}  ${r.from} → ${r.to}（+${r.to - r.from}）`)
    console.log('    ⇒ 若不是有意增长，请回退：`git checkout -- scripts/check-module-growth.mjs`')
  }
  if (tightened.length) {
    console.log('')
    console.log(`✅ 收紧 ${tightened.length} 条基线（棘轮只许收紧）：`)
    for (const t of tightened) console.log(`    ${t.key}  ${t.from} → ${t.to}（-${t.from - t.to}）`)
  }
  if (!RAISE && !raised.length) console.log('ℹ 无基线可收紧（全部实测 ≥ 现有 base）；若要抬基线，须显式加 `--raise`。')
  process.exit(0)
}

} // end if (IS_MAIN) —— 第一段（扫描 / --print / --rebase）

// ══════════════════════════════════════════════════════════════════════════════
// 纯函数区（`export` 必须在任何 `if` 块之外 —— 块内不许 export）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 核心判定（纯函数 —— `--selftest` 直接驱动它，不碰真实源码）。
 * 为什么要抽出来：`HARD_CAP` 1000 对当前最大模块 879 而言**今天谁也碰不到**，
 *   不写自证就分不清「判定对了」与「分支根本没走到」。
 *
 * ⚠ **双水位（2026-09-23 · ACT-351）**：`freeze` 条目可为裸数字（旧）或 `{ base, hwm }`（新）。
 *   判红条件**逐字不变**：`lines > base + slack`。`hwm` **只产账、不产红**：
 *     · `lines > hwm`  ⇒ 计入 `newHigh`（新高水位），并在报告里逐行打印；
 *     · `hwm > base`   ⇒ 计入 `eaten`（**已吃掉未归还的额度** = hwm − base），逐行显式可见。
 *   ⇒ 这样「吃掉容差」这件事**每次运行都会被说出来**，不再依赖谁去读 git log。
 */
export function evaluate(rows, freeze = FREEZE, cap = HARD_CAP, threshold = FREEZE_THRESHOLD, mutBaseline = MUTABLE_BASELINE, slack = SLACK, exempt = HARD_CAP_EXEMPT) {
  const problems = []
  const shrunk = []
  const within = []
  const eaten = []   // 已吃掉未归还：{ file, base, hwm, delta, lines }
  const newHigh = [] // 本次观测到的新高水位：{ file, hwm, lines }

  for (const r of rows) {
    if (r.lines > cap && !exempt.has(r.file)) {
      problems.push(`[硬顶] ${r.file} 实测 ${r.lines} 行 > ${cap}（必须拆分，不许继续堆）`)
      continue
    }
    const entry = freeze[r.file]
    if (entry === undefined) {
      if (r.lines >= threshold) {
        problems.push(`[未登记] ${r.file} 实测 ${r.lines} 行 ≥ ${threshold} ⇒ 必须登记进 FREEZE 基线（新功能应落新模块，而不是堆大旧模块）`)
      }
      continue
    }
    const { base, hwm } = freezeOf(entry)
    // ── 账（只记不拦）──
    if (hwm > base) eaten.push({ file: r.file, base, hwm, delta: hwm - base, lines: r.lines })
    if (r.lines > hwm) newHigh.push({ file: r.file, hwm, lines: r.lines })
    // ── 判红（语义与改造前逐字一致）──
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
  return { problems, shrunk, within, eaten, newHigh }
}

// ══════════════════════════════════════════════════════════════════════════════
// ↓↓↓ 余下顶层副作用（自证 / 报告 / 退出）——同样只在「被直接执行」时跑
// ══════════════════════════════════════════════════════════════════════════════
if (IS_MAIN) {

if (!ROOTS.some((r) => existsSync(r.dir))) {
  console.log('check-module-growth: 所有扫描根缺席 ⇒ skip（exit 3）')
  process.exit(3)
}

if (process.argv.includes('--selftest')) {
  let bad = 0 // ⚠ 必须在所有自证块之前（本轮实测踩到 TDZ：曾把它放在新块之后 ⇒ ReferenceError）
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
    // ── 2026-09-23 ACT-351：**双水位**（{base,hwm}）——判红语义零变更 + 账非恒真 ──
    { name: '双水位：对象形态与裸数字**判定等价**（base=800, hwm=800 ↔ 数字 800）', rows: [{ file: 'a.ts', lines: 810 }], freeze: { 'a.ts': { base: 800, hwm: 800 } }, want: 0 },
    { name: '⚠ 双水位：hwm 高但 base 未动 ⇒ **不因 hwm 判红**（hwm 只产账，不产红）', rows: [{ file: 'a.ts', lines: 810 }], freeze: { 'a.ts': { base: 800, hwm: 830 } }, want: 0 },
    { name: '⚠ 双水位：仍按 base+slack 判红（hwm 不放松判据）', rows: [{ file: 'a.ts', lines: 816 }], freeze: { 'a.ts': { base: 800, hwm: 830 } }, want: 1 },
  ]
  // ── 双水位的**账**必须非恒真（否则是假绿）──
  const acctCases = [
    { n: 'hwm == base ⇒ 无账面额度（eaten 0）', rows: [{ file: 'a.ts', lines: 800 }], freeze: { 'a.ts': { base: 800, hwm: 800 } }, wantEaten: 0, wantHigh: 0 },
    { n: '⚠ hwm > base ⇒ 账面额度被看见（eaten = hwm−base）', rows: [{ file: 'a.ts', lines: 800 }], freeze: { 'a.ts': { base: 800, hwm: 815 } }, wantEaten: 15, wantHigh: 0 },
    { n: '⚠ 实测 > hwm ⇒ 计入新高水位（newHigh 非空）', rows: [{ file: 'a.ts', lines: 820 }], freeze: { 'a.ts': { base: 800, hwm: 815 } }, wantEaten: 15, wantHigh: 1 },
    { n: '裸数字形态 ⇒ 账面为 0（旧形态不被误报成欠账）', rows: [{ file: 'a.ts', lines: 800 }], freeze: { 'a.ts': 800 }, wantEaten: 0, wantHigh: 0 },
  ]
  // ── rebase 回写的**反例自证**：注释必须活下来（这是本次治的真缺陷）──
  //   ⚠ **必须覆盖 CRLF**（2026-09-23 实测教训）：本仓源文件是 CRLF，而首版自证只用 LF 合成样本
  //     ⇒ 自证全绿、真跑 `--rebase` 却产生**重复条目**（3→6）：行尾 `\r` 被 `(.*)$` 吃进值段 ⇒
  //     条目被误判"无法解析"而跳过 ⇒ 既未记 seen、又进 additions。**夹具绿 ≠ 真数据绿**。
  //   ⚠⚠ **必须驱动真实现**（2026-09-23 · 独立复核席变异测试抓出）：首版此处内联了一份
  //     `REBASE_SIM` 副本，复核席对**真** `--rebase` 路径注入三种缺陷（丢行尾注释 / 吞全部注释 /
  //     幽灵检查被短路），自证**全部 exit=0 PASS 逃逸** —— 因为验的是副本、副本没坏。
  //     ⇒ 现改为直接调用**被导出的真实现** `rewriteFreezeBlock`（单一实现，`--rebase` 亦用它）。
  //       修后：变异真实现即自证红（复核席自证过这条通路）。
  const REBASE_SIM = rewriteFreezeBlock
  const SAMPLE = [
    'const FREEZE = {',
    '  // 历史依据一行（不可丢）',
    "  'a.ts': { base: 100, hwm: 110 }, // 行尾注释（不可丢）",
    "  'b.ts': 200,",
    '}',
  ].join('\n')
  {
    // ⚠ **缺省 = 只许收紧**（ACT-355）：`a.ts` 旧 base 100、实测 105 ⇒ base **不动**（取 min）、
    //   hwm 涨到 max(110,105)=110。`b.ts` 裸数字 200、实测 200 ⇒ 不变。
    const r = REBASE_SIM(SAMPLE, new Map([['a.ts', 105], ['b.ts', 200]]))
    const ok1 = r && r.inner.includes('历史依据一行')
    const ok2 = r && r.inner.includes('行尾注释（不可丢）')
    // ⚠ **根因判据**：缺省**不得**把 base 抬到实测值（这正是「可再生额度」的来源）
    const ok3 = r && r.inner.includes("'a.ts': { base: 100, hwm: 110 },")
    const ok4 = r && r.inner.includes("'b.ts': { base: 200, hwm: 200 },")
    // ⚠ 反例：旧实现（整段替换）必吞注释 —— 证明本判据有判别力，不是恒真
    const oldSeg = SAMPLE.match(/(const FREEZE = \{)[\s\S]*?(\n\})/)[0]
    const oldAfter = SAMPLE.replace(/(const FREEZE = \{)[\s\S]*?(\n\})/, '$1\n  \'a.ts\': 105,\n$2')
    const ok5 = !oldAfter.includes('历史依据一行') // 旧实现确实吞掉 ⇒ 本判据对外
    for (const [c, nm] of [[ok1, 'rebase：**整行历史注释**保留'], [ok2, 'rebase：**行尾注释**保留'], [ok3, '⚠ **缺省不抬 base**（base 100 保持，hwm 110 保持）—— 棘轮只许收紧'], [ok4, 'rebase：裸数字条目同级处理'], [ok5, '⚠ 反例自证：旧整段替换实现**必**吞注释（证明上四条非恒真）']]) {
      if (!c) bad++
      console.log(`${c ? '✅' : '❌'} [rebase] ${nm}${nm.startsWith('⚠') ? `（旧实现段 ${oldSeg.split('\n').length} 行 → ${oldAfter.match(/(const FREEZE = \{)[\s\S]*?(\n\})/)[0].split('\n').length} 行）` : ''}`)
    }
    const ghostCase = REBASE_SIM(SAMPLE, new Map([['a.ts', 105]]))
    const ok6 = ghostCase && ghostCase.ghost.includes('b.ts')
    if (!ok6) bad++
    console.log(`${ok6 ? '✅' : '❌'} [rebase] 幽灵条目 ⇒ 进 ghost 清单（交人处置，**不静默删行**）`)
    // ⚠ CRLF 用例（真数据形态）：本仓源文件是 CRLF，LF 夹具曾让重复条目 bug 逃过自证
    const CRLF_SAMPLE = SAMPLE.split('\n').join('\r\n')
    const rc = REBASE_SIM(CRLF_SAMPLE, new Map([['a.ts', 105], ['b.ts', 200]]))
    const ok7 = rc && rc.seen.size === 2 && rc.ghost.length === 0
    if (!ok7) bad++
    console.log(`${ok7 ? '✅' : '❌'} [rebase] ⚠ **CRLF 样本**：两条都已 seen、零 ghost（防"条目被误判无法解析 ⇒ rebase 后重复"）`)
    const ok8 = rc && rc.inner.includes('历史依据一行') && rc.inner.includes('行尾注释（不可丢）')
    if (!ok8) bad++
    console.log(`${ok8 ? '✅' : '❌'} [rebase] ⚠ CRLF 样本：注释仍保留（LF 夹具曾掩盖此路径）`)
    // ══════════════════════════════════════════════════════════════════════════
    // ⚠⚠ **根因自证（2026-09-23 · ACT-355 · 用户「从根源解决」）**：
    //   这是本轮治「容差可再生」的**核心判据**，必须**成对**出现（缺一即恒真）：
    //     ① 缺省（raise=false）：base **不得**抬（实测 900 > base 700 ⇒ base 仍 700）
    //     ② `--raise`（raise=true）：base **必须**抬（700 → 900）
    //   并断言 `raised` 账目**只在 raise 时**非空，供报告大声打印。
    const EAT_SAMPLE = ['const FREEZE = {', "  'x.ts': { base: 700, hwm: 700 },", '}'].join('\n')
    {
      const d = rewriteFreezeBlock(EAT_SAMPLE, new Map([['x.ts', 900]])) // 缺省
      const a = rewriteFreezeBlock(EAT_SAMPLE, new Map([['x.ts', 900]]), { raise: true })
      const t1 = d.inner.includes("'x.ts': { base: 700, hwm: 900 },") // base 不动、水位跟涨
      const t2 = d.raised.length === 0
      const t3 = a.inner.includes("'x.ts': { base: 900, hwm: 900 },") // 显式才抬
      const t4 = a.raised.length === 1 && a.raised[0].from === 700 && a.raised[0].to === 900
      // ⚠ 反例：若「缺省」与「--raise」行为相同 ⇒ 本判据无判别力（防恒真）
      const t5 = d.inner !== a.inner
      for (const [c, nm] of [[t1, '⚠ **缺省只收紧**：实测 900 > base 700 ⇒ base 保持 700（额度不可再生）'], [t2, '⚠ 缺省 ⇒ `raised` 为空（无抬基线账目）'], [t3, '`--raise` ⇒ base 抬到 900（有意增长显式落账）'], [t4, '`--raise` ⇒ `raised` 账目含 700→900（供报告大声打印）'], [t5, '⚠ 反例自证：缺省与 --raise 结果**必不同**（否则本判据无判别力）']]) {
        if (!c) bad++
        console.log(`${c ? '✅' : '❌'} [根因] ${nm}`)
      }
    }
    // 收紧：实测 < base ⇒ base 下调（棘轮只许收紧的正方向）
    {
      const s = rewriteFreezeBlock(EAT_SAMPLE, new Map([['x.ts', 650]]))
      const t6 = s.inner.includes("'x.ts': { base: 650, hwm: 700 },") && s.tightened.length === 1
      if (!t6) bad++
      console.log(`${t6 ? '✅' : '❌'} [根因] 实测 650 < base 700 ⇒ base 降到 650（收紧生效，水温 hwm 保留 700 作历史峰）`)
    }
  }
  for (const c of acctCases) {
    const res = evaluate(c.rows, c.freeze, undefined, undefined, undefined, undefined, new Set())
    const gotEaten = res.eaten.reduce((s, e) => s + e.delta, 0)
    const gotHigh = res.newHigh.length
    const pass = gotEaten === c.wantEaten && gotHigh === c.wantHigh
    if (!pass) bad++
    console.log(`${pass ? '✅' : '❌'} [账] ${c.n}（期望 eaten=${c.wantEaten}/high=${c.wantHigh} · 实得 eaten=${gotEaten}/high=${gotHigh}）`)
  }
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
  console.log('\nPASS（selftest：冻结/硬顶/未登记/幽灵/双水位账/注释留存 各类判定均已自证）')
  process.exit(0)
}

const { problems, shrunk, within, eaten, newHigh } = evaluate(rows)

const frozen = rows.filter((r) => FREEZE[r.file] !== undefined)
console.log(`模块增长门禁 · src ${rows.length} 模块 · 最大 ${rows[0].lines} 行 · 硬顶 ${HARD_CAP} · 冻结名单 ${frozen.length} 个`)
for (const r of frozen) {
  const { base, hwm } = freezeOf(FREEZE[r.file])
  const debt = hwm > base ? ` · 已吃额度 ${hwm - base}` : ''
  console.log(`  ${String(r.lines).padStart(5)} / 基线 ${String(base).padStart(5)} / 水位 ${String(hwm).padStart(5)}${debt}  ${r.file}`)
}
const totalMut = rows.reduce((n, r) => n + (r.mutable ?? 0), 0)
const mutWhere = rows.filter((r) => (r.mutable ?? 0) > 0).map((r) => ` ${r.file}(${r.mutable})`).join('')
console.log(`  可变全局 ${totalMut} 处 / 基线 ${MUTABLE_BASELINE}${mutWhere ? ' ·' + mutWhere : ''}`)

if (within.length) { console.log(''); within.forEach((s) => console.log('· ' + s)) }
if (shrunk.length) { console.log(''); shrunk.forEach((s) => console.log(s)) }
// ── 账（**只记不拦** · ACT-351）────────────────────────────────────────────
//   为什么必须打印：改造前「吃掉容差」这件事**只有 git log 记得**，门禁每次只说「容差内」。
//   实测真形：styles +3 自 2026-09-17 永久固化，scheduler 同形状第二次复发（跨 3 提交/3 天）。
//   ⇒ 现在每次运行都把「已吃掉、尚未归还」的额度说出来。
if (eaten.length) {
  console.log('')
  console.log(`· 已吃额度（hwm − base，**只记不拦**）：合计 ${eaten.reduce((s, e) => s + e.delta, 0)} 行`)
  for (const e of eaten) console.log(`    ${e.file}  基线 ${e.base} → 水位 ${e.hwm}（吃掉 ${e.delta}）· 当前实测 ${e.lines}`)
  console.log('    ⇒ 归还方式：把模块拆/瘦回 base 以内；若确属必要增长，走 --rebase 显式落账（diff 里 base↑ 与水位重置同现）。')
}
if (newHigh.length) {
  console.log('')
  for (const n of newHigh) console.log(`· 新高水位：${n.file} 实测 ${n.lines} > 记录水位 ${n.hwm} ⇒ 下次 --rebase 会把水位抬到 ${n.lines}`)
}

if (problems.length) {
  console.log('')
  problems.forEach((p) => console.log('❌ ' + p))
  console.log(`\nFAIL（${problems.length} 项）`)
  process.exit(1)
}
console.log('\nPASS')

} // end if (IS_MAIN)
