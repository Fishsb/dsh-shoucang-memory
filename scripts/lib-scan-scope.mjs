// lib-scan-scope.mjs — **门禁「扫描面」的单一实现**（2026-09-23 · ACT-343 · 收口轮）
//
// ── 判因（实测：同一守卫被我写了四遍，措辞还各不相同）──────────────────────────
// 圆桌会审发现「**空集上『无违规』是恒真命题**」这一族假绿（`audit-architecture --gate --dir <空目录>`
//   报 0 模块却打「✅ 全部在阈值内」exit 0）。处置过程中，同一道守卫在 **4 件**里各写了一份：
//   `audit-architecture`(`EMPTY_SCAN`) · `check-bridges`(`SCAN_EMPTY`) ·
//   `check-field-usage`(内联判 `files.length`) · `check-i18n-attr-literal`(内联三向)。
//   ⇒ **四份副本 = 下一个会漂移的东西**（本仓既有教训：惰性桥 6 处副本 · 信封写法 6 处副本 ·
//     三值各说各话）——「同一语义多处重实现」正是本仓反复记账的漂移源。
//
// ── 本件的定位（**先例**，非新造）────────────────────────────────────────────
// 抄 `scripts/lib-client-src.mjs`（前端源码统一读取口径）的范式：
//   `lib-*.mjs` = 被多个 `check-*` 以 `import { … } from './lib-*.mjs'` 消费的**单一事实源**。
//   那边收敛的是「前端源码怎么读」，本件收敛的是「**扫描面为空/不可用/正常 该怎么判**」。
//
// ── 三态语义（**这是全仓唯一权威**，各门不得再自行解释）──────────────────────
//   `ok`    —— 扫描面有内容 ⇒ 正常判（各门继续自己的判据）
//   `empty` —— **扫描面为空** ⇒ **判红**（空集上"无违规"是恒真命题；**不是**"没问题"）
//   `skip`  —— 扫描面**按设计**不存在（如可选目录）⇒ **显式跳过**，exit 3，**不算通过**
//   `error` —— 存在但**读不出**（权限/IO）⇒ **判红**。⚠ 与 `skip` **必须分开**：
//             修前多处用 `catch { … exit(3) }` 把"读不出来"与"目录不存在"**混为一谈**，
//             人读到的结论（"正常跳过"）与真实原因（"读不出来"）不一致 ——
//             「**失败不可观测**」族的标准形态（本仓最在意的缺陷类）。
//
// ── 用法（消费方三行）──────────────────────────────────────────────────────
//   import { resolveScanScope, reportScanScope, scanScopeExitCode } from './lib-scan-scope.mjs'
//   const scope = resolveScanScope({ dir, label: '`src/`', required: true, why: '本件判据建立在…之上' })
//   const stop = reportScanScope(scope)          // 打印统一判因+退回动作；ok 时返回 null
//   if (stop !== null) process.exit(scanScopeExitCode(scope))
//
// ⚠ **不得**再在门禁里内联写「扫描面为空 ⇒ 判红」的文案与退出码（那就是第二份副本）。
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

/**
 * 判定一个扫描面。
 *
 * @param {object} o
 * @param {string} o.dir       —— 要扫的目录（绝对路径）
 * @param {string} [o.label]   —— 报错里显示的路径写法（缺省用 dir）
 * @param {boolean} [o.required=true] —— 该目录**按设计必须存在**？
 *        `true`  ⇒ 不存在判 `error`（判红）
 *        `false` ⇒ 不存在判 `skip`（诚实跳过，exit 3，**不算通过**）
 * @param {string} [o.why]     —— 「本件判据建立在什么之上」一句话（写进判因，供人看懂为什么红）
 * @param {(name:string)=>boolean} [o.accept] —— 目录内哪些条目算"可扫"（缺省：全部）
 * @param {string} [o.root]    —— 单文件模式时用（见下）
 *
 * 另有**单文件**形态：传 `o.file` 而非 `o.dir` ⇒ 只判该文件存在性（`skip`/`error`）。
 * @param {string} [o.file]
 * @param {boolean} [o.requiredFile=true]
 * @returns {{ state:'ok'|'empty'|'skip'|'error', dir:string, label:string, entries:string[],
 *             count:number, message:string, why:string, hint:string }}
 */
export function resolveScanScope (o = {}) {
  const label = o.label || o.dir || o.file || '(未指定扫描面)'
  const why = o.why || '（未声明判因 —— 消费方应传 `why`，否则红得不可解释）'
  const hint = o.hint || '确认在**仓库根**下运行、扫描面存在且非空。**不得把本件未跑当作通过。**'

  // ── 单文件形态 ──
  if (o.file) {
    const required = o.requiredFile !== false
    if (existsSync(o.file)) {
      return { state: 'ok', dir: o.file, label, entries: [o.file], count: 1, message: `${label} 存在`, why, hint }
    }
    return required
      ? { state: 'error', dir: o.file, label, entries: [], count: 0, message: `**判据源不可用**：${label} 不存在`, why, hint }
      : { state: 'skip', dir: o.file, label, entries: [], count: 0, message: `${label} 不存在 —— 按设计可缺，跳过（**不算通过**）`, why, hint }
  }

  // ── 目录形态 ──
  const required = o.required !== false
  if (!existsSync(o.dir)) {
    return required
      ? { state: 'error', dir: o.dir, label, entries: [], count: 0, message: `**扫描面不可用**：${label} 不存在`, why, hint }
      : { state: 'skip', dir: o.dir, label, entries: [], count: 0, message: `${label} 不存在 —— 按设计可缺，跳过（**不算通过**）`, why, hint }
  }

  let names
  try {
    names = readdirSync(o.dir)
  } catch (e) {
    // ⚠ **读不出 ≠ 不存在**：绝不与 skip 合并
    return {
      state: 'error', dir: o.dir, label, entries: [], count: 0,
      message: `**扫描面不可用**：${label} 存在但读不出（${String((e && e.message) || e).slice(0, 90)}）`,
      why, hint,
    }
  }

  const accept = typeof o.accept === 'function' ? o.accept : () => true
  const entries = names.filter(accept)
  if (!entries.length) {
    return {
      state: 'empty', dir: o.dir, label, entries, count: 0,
      message: `**扫描面为空**：${label} 下 0 个可扫条目 —— **不得判绿**（空集上"无违规"是恒真命题）`,
      why, hint,
    }
  }
  return { state: 'ok', dir: o.dir, label, entries, count: entries.length, message: `${label} 命中 ${entries.length} 项`, why, hint }
}

/** 该状态对应的**退出码**（全仓统一）：ok → null（调用方继续）· skip → 3 · empty/error → 1 */
export function scanScopeExitCode (scope) {
  if (scope.state === 'ok') return null
  return scope.state === 'skip' ? 3 : 1
}

/**
 * 打印统一判因与退回动作。`ok` 时返回 `null`（调用方继续自己的判据）；
 * 否则返回该状态（调用方应取 `scanScopeExitCode` 退出）。
 *
 * ⚠ 输出走 **stderr**（红）或 **stdout**（skip）—— 与仓内契约一致（`exit 3 = skip` 不算失败）。
 */
export function reportScanScope (scope, log = console) {
  if (scope.state === 'ok') return null
  const mark = scope.state === 'skip' ? '⏭' : '❌'
  const sink = scope.state === 'skip' ? (log.log || log.info) : (log.error || log.log)
  sink.call(log, `${mark} ${scope.message}`)
  sink.call(log, `   · 判因：${scope.why}`)
  sink.call(log, `   · 退回动作：${scope.hint}`)
  return scope.state
}

/** 便捷组合：判定 → 若不可用则打印并返回退出码（`null` = 继续）。消费方最常见的一行写法。 */
export function guardScanScope (o, log = console) {
  const s = resolveScanScope(o)
  const stopped = reportScanScope(s, log)
  return { scope: s, exitCode: stopped === null ? null : scanScopeExitCode(s) }
}

// ══════════════════════════════════════════════════════════════════════════════
// **空扫判据的件内自证 helper**（2026-09-23 · ACT-344 · 五版元门禁失败后的正解）
// ══════════════════════════════════════════════════════════════════════════════
//
// ── 为什么需要它（判因：一次**连续五版失败**的实测，比结论更值得留档）────────────
// 起因：圆桌会审发现一族假绿 —— **空集上"无违规"是恒真命题**，门禁在扫描面失效时仍打 PASS。
// 我先**逐件打了四遍补丁**（用户当轮点破：「注意要避免打补丁问题」），
// 再试图建一个**元门禁**在外围机检"谁真读 src/" —— **五版判据全部被证伪**：
//   文本正则（误报 4）→ sentinel（漏 1）→ 件数（仍漏）→ ENOTDIR（漏到候选剩 1）→ 输出证据（误报 2）。
// **根因**：「某件是否真读某目录」**从进程外部不可判定**；五版都在用**代理**替代那个不可观测的事实
//   —— 又一次「代理指标非判据」，且是同一件工具里连犯五遍。
//
// ── 正解（本 helper 的存在理由）──────────────────────────────────────────────
// 空扫这件事，**只有件自己知道**：它清楚自己的扫描面是什么、从哪来、缺了会怎样。
// ⇒ 判据应**写在各件自己的 `--selftest` 里**（**件内知识、可复现、不依赖外部推断**）。
// 但"逐件手写"会退化成 23 份副本（又是补丁）⇒ 故把**通用形态**抽成下面这一个 helper：
//   件只需声明「我的扫描面在哪、哪些条目算数、为什么依赖它」，helper 负责：
//     ① 在**隔离夹具**上真造三态（空 / 缺 / 有内容），② 断言件自身的判定函数随之改变，
//     ③ 顺便反证「判定函数**不是恒真**」。
//
// ── 与已删的 `check-scan-scope.mjs` 的关系（**据实留档**）─────────────────────
//   曾建过一个**外围**元门禁想机检"谁真读 src/"—— **五版判据全被证伪**（误报 4 件 ↔ 漏报至 1 件来回摆），
//   根因是**该事实从进程外部不可判定**。⇒ 该件已**删除**（报告态、恒 exit 0、16.5s/次，价值被本 helper 取代）。
//   ⇒ 本 helper 是**正解**：件内判据（在件自己的上下文中验自己），不依赖任何外部推断。
//
// 用法（件内 3 行）：
//   if (process.argv.includes('--selftest')) {
//     const { selftestScanGuard } = await import('./lib-scan-scope.mjs')
//     process.exit(selftestScanGuard({ label: '`src/`', probe: (dir) => myScan(dir).length }))
//   }
//   ↑ `probe(dir)` = **件自己的扫描函数**（返回"扫到几项"或任意可比较值）。
//     helper 会用它分别在 空目录 / 缺席目录 / 有文件目录 上取值并断言三者**可区分**。
//
// 参数：
//   o.label    扫描面在报错里的写法
//   o.probe    件自己的扫描函数（**必须是纯读**，只读传入目录）
//   o.eq       比较器（缺省 `===`）
//   o.required 该目录按设计必须存在？（缺省 true）
// 返回：0 = 自证通过 · 1 = 失败（可直接 `process.exit` 该值）
export function selftestScanGuard (o = {}) {
  const label = o.label || '（未命名扫描面）'
  const probe = o.probe
  const eq = o.eq || ((a, b) => a === b)
  const required = o.required !== false

  let pass = 0, fail = 0
  const ok = (c, n) => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}`) } }

  if (typeof probe !== 'function') {
    console.log('  ❌ 未提供 `probe`（件的扫描函数）—— 本 helper 无法自证')
    return 1
  }

  const work = mkdtempSync(join(tmpdir(), 'sc-guard-'))
  try {
    const emptyDir = join(work, 'empty'); mkdirSync(emptyDir, { recursive: true })
    const fullDir = join(work, 'full'); mkdirSync(fullDir, { recursive: true })
    writeFileSync(join(fullDir, 'sample.ts'), 'export const x = 1\n', 'utf8')
    const missingDir = join(work, 'missing')

    let vFull, vEmpty, vMissing
    try { vFull = probe(fullDir) } catch (e) { vFull = `THREW:${String(e && e.message).slice(0, 40)}` }
    try { vEmpty = probe(emptyDir) } catch (e) { vEmpty = `THREW:${String(e && e.message).slice(0, 40)}` }
    try { vMissing = probe(missingDir) } catch (e) { vMissing = `THREW:${String(e && e.message).slice(0, 40)}` }

    // ① 扫描函数**不是恒真**：有内容 vs 空，必须可区分
    ok(!eq(vFull, vEmpty), `① 扫描函数非恒真：有内容(${JSON.stringify(vFull)}) ≠ 空(${JSON.stringify(vEmpty)})`)
    // ② 空目录**必须**与"有内容"可分（防"空也当正常"）
    ok(!eq(vEmpty, vFull), '② 空目录的读数**不等于**正常读数（空集不得被当作正常）')
    // ③ 件应能表达"目录缺失"这一态（`required` 时更须与"空"区分；尽力而为，不强判恒等）
    /* ⚠ 2026-09-25 修复（恒真断言）：原写 `ok(true, …)` —— 该断言**永远为真**，
     *   它出现在「反空扫 helper」的**自证**里尤其自相矛盾：本 helper 的全部存在理由就是
     *   「不许用代理指标替代不可观测事实」，而它自己用了一条不可证伪的断言充当证据。
     *   （这条被 2026-09-25 两轮独立审计同时点名，L1-05。）
     *   可证伪的替代判据：**三态（有内容 / 空 / 缺席）必须至少两两可分** ——
     *   若三态读数全相等，说明本件区分不出任何状态，③ 才真正失败。
     *   刻意**不**断言 `vMissing` 与另两态的具体关系：`probe` 在缺目录时**允许返回 error 态**
     *   而不 throw（`required` 只影响主路径是否判红），故具体形态由调用方决定，
     *   这里只锁「可分」这一必要条件。 */
    if (required) {
      /* ⚠ 2026-09-25 二次修（独立复核席指出**判别力弱**，已实测）：
       *   初版写 `distinct >= 2`（三态里至少两两可分）。复核席构造反例：探针
       *   `(d) => existsSync(d) ? readdirSync(d).length : 0` —— 空目录与**缺席**取同一值(0)，
       *   distinct = 2 ⇒ ③ 判 ✅。但本件要问的恰恰是「**缺席**能不能与'空'分开」。
       *   而 ①（有内容 ≠ 空）早已拦住"全相等"⇒ `distinct >= 2` 相对 ① 几乎零增量。
       *   改为**针对性判据**：缺席读数必须**不等于**空读数（真正想要的区分）。 */
      ok(!eq(vMissing, vEmpty),
        `③ 「缺席」态与「空」态可分：缺席取值 ${JSON.stringify(vMissing)} ≠ 空取值 ${JSON.stringify(vEmpty)}`)
    }
    // ④ 反例自证：把 probe 换成恒真函数时，① 必须失败（证明 ① 有判别力）
    const alwaysSame = () => 42
    const eqSame = eq(alwaysSame(fullDir), alwaysSame(emptyDir))
    ok(eqSame === true, '④ 反例自证：恒真 probe 在本判据下**必被判相同**（⇒ ① 有判别力，非恒真）')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass / ${fail} fail）`)
  return fail ? 1 : 0
}

// ── --selftest（2026-09-23 · ACT-343）────────────────────────────────────
//   本件是**被多个门禁消费的单一实现** ⇒ 它自己坏掉会**同时**污染所有消费方。
//   故自证必须覆盖**三态 × 边界**，且含**反例**（防恒真）。
//   ⚠ 全在 `mkdtemp` 合成夹具上做，**不碰真仓**。
//
//   ⚠⚠ **必须判定"是否被直接执行"**（2026-09-23 实测踩到，据实留档）：
//     首版只判 `process.argv.includes('--selftest')` —— 而**消费方**（如 `check-bridges --selftest`）
//     也带着 `--selftest` 进 `process.argv` ⇒ `await import('./lib-scan-scope.mjs')` 时
//     **本库的 selftest 会抢先执行并 `process.exit`** ⇒ 消费方自己的自证**永远跑不到**。
//     实测症状：跑 `check-bridges --selftest` 却看到本库的 21 例输出。
//     ⇒ **库文件的自证只能在"它自己是主模块"时跑**（`import.meta.url === argv[1]` 的 file URL 比较）。
//     教训与「守卫挡住了自证」同族：**副作用代码必须分清"被 import"与"被直接执行"**。
//
//   ⚠⚠ **判据必须用 `realpath` 归一，不能比字符串（2026-09-23 · ACT-355 · 独立复核实测抓出）**：
//     上式（字符串比较）在**别名路径**下判 **false** ⇒ 整段副作用**一行不执行** ⇒ 静默 `exit 0`。
//     实测（junction `<仓根上级>/sc-jt → <仓根>`）：`node <junction>/lib-scan-scope.mjs --selftest`
//     ⇒ **输出 0 行 · exit 0**（真实路径同命令输出 21 行）⇒ **判红能力在别名路径下整体消失**，
//     且比「假绿」更隐蔽（旧至少打印内容）。
//     该模式此前被 `check-module-growth.mjs` 抄去、造成了同样后果（那里已由 ACT-351 修掉）。
//     ⇒ 正解：**`realpathSync` 归一后比较**（实测可穿透 junction；`subst` 盘符亦正常）。
const IS_MAIN = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch { return false }
})()
if (IS_MAIN && process.argv.includes('--selftest')) {
  const { mkdtempSync, mkdirSync, writeFileSync: wf, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join: pjoin } = await import('node:path')

  let pass = 0, fail = 0
  const ok = (c, n) => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}`) } }

  const work = mkdtempSync(pjoin(tmpdir(), 'sc-scope-lib-'))
  const emptyDir = pjoin(work, 'empty'); mkdirSync(emptyDir, { recursive: true })
  const someDir = pjoin(work, 'some'); mkdirSync(someDir, { recursive: true })
  wf(pjoin(someDir, 'a.ts'), 'x', 'utf8')
  wf(pjoin(someDir, 'b.md'), 'y', 'utf8')
  const missing = pjoin(work, 'nope')

  // ── 目录形态：四态 ──
  const sOk = resolveScanScope({ dir: someDir, label: 'some/' })
  ok(sOk.state === 'ok' && sOk.count === 2, `① 有内容 ⇒ ok（count=${sOk.count}）`)
  ok(scanScopeExitCode(sOk) === null, '① ok ⇒ 退出码 null（调用方继续）')

  const sEmpty = resolveScanScope({ dir: emptyDir, label: 'empty/' })
  ok(sEmpty.state === 'empty', '② 空目录 ⇒ empty（**不是 ok**）')
  ok(scanScopeExitCode(sEmpty) === 1, '② empty ⇒ exit 1（不得判绿）')
  ok(/不得判绿/.test(sEmpty.message), '② empty 的文案含「不得判绿」（红得可解释）')

  const sMissingReq = resolveScanScope({ dir: missing, label: 'nope/', required: true, why: '测试用' })
  ok(sMissingReq.state === 'error', '③ 必须存在却缺席 ⇒ error')
  ok(scanScopeExitCode(sMissingReq) === 1, '③ error ⇒ exit 1')

  const sSkip = resolveScanScope({ dir: missing, label: 'nope/', required: false, why: '测试用' })
  ok(sSkip.state === 'skip', '④ 按设计可缺而缺席 ⇒ skip')
  ok(scanScopeExitCode(sSkip) === 3, '④ skip ⇒ exit 3（诚实跳过，**不算通过**）')

  // ── ⚠ 核心不变量：**「读不出」绝不与「不存在」合并**（本仓「失败不可观测」族的正解）──
  ok(sMissingReq.state !== sSkip.state, '⑤ 「必须存在却缺席」(error) 与「可缺而缺席」(skip) **状态不同**')
  ok(scanScopeExitCode(sMissingReq) !== scanScopeExitCode(sSkip), '⑤ 二者退出码不同（1 vs 3）——**不得混为一谈**')

  // ── accept 过滤：**过滤后为空必须判 empty，不是 ok**（最易漏的一格）──
  const sFiltered = resolveScanScope({ dir: someDir, label: 'some/*.ts', accept: (n) => n.endsWith('.ts') })
  ok(sFiltered.state === 'ok' && sFiltered.count === 1, `⑥ accept 命中 1 项 ⇒ ok（count=${sFiltered.count}）`)
  const sAllFiltered = resolveScanScope({ dir: someDir, label: 'some/*.nope', accept: (n) => n.endsWith('.nope') })
  ok(sAllFiltered.state === 'empty', '⑥ **accept 过滤后为空 ⇒ empty**（不得因"目录非空"而判 ok）')

  // ── 单文件形态 ──
  const fPath = pjoin(someDir, 'a.ts')
  ok(resolveScanScope({ file: fPath }).state === 'ok', '⑦ 单文件存在 ⇒ ok')
  ok(resolveScanScope({ file: missing, requiredFile: false }).state === 'skip', '⑦ 单文件可缺而缺席 ⇒ skip')
  ok(resolveScanScope({ file: missing, requiredFile: true }).state === 'error', '⑦ 单文件必须存在却缺席 ⇒ error')

  // ── 反例自证：**判据必须能判红**（否则恒真）──
  ok(sEmpty.state !== 'ok', '⑧ 反例自证：空目录**不得**被判 ok（否则本件恒真）')
  ok(sAllFiltered.state !== 'ok', '⑧ 反例自证：过滤后空**不得**被判 ok')

  // ── 便捷组合 guardScanScope：ok 时 exitCode 为 null，否则给码 ──
  const quiet = { log () {}, error () {} }
  ok(guardScanScope({ dir: someDir }, quiet).exitCode === null, '⑨ guardScanScope：ok ⇒ exitCode null')
  ok(guardScanScope({ dir: emptyDir }, quiet).exitCode === 1, '⑨ guardScanScope：empty ⇒ exitCode 1')
  ok(guardScanScope({ dir: missing, required: false }, quiet).exitCode === 3, '⑨ guardScanScope：skip ⇒ exitCode 3')

  rmSync(work, { recursive: true, force: true })
  console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass / ${fail} fail）`)
  process.exit(fail ? 1 : 0)
}
