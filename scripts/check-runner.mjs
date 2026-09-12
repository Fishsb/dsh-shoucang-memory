#!/usr/bin/env node
// check-runner.mjs — 检测件统一运行器（审查 F6 · M 档护栏）
//
// 问题：同一批检测件被多个入口调用，但**退出码口径不一**——`sleep-selfcheck` 把 exit 3 当「依赖缺失 ⇒ 跳过」，
//   而 `npm test` 的 `&&` 链把任何 exit≠0 当失败并中断。同一份检测件在两种入口下判读不同，会让人对"到底过没过"失去信任。
// 契约（ADR-132）：退出码语义，**本运行器是唯一实现方**：
//     exit 0 = pass（全部通过）
//     exit 3 = skip（诚实跳过：依赖缺失，不算失败）
//     exit 4 = xfail（存在**已知未修**的预期失败；不判失败，但**必须可见**）
//     其他    = fail
//
// ⚠ exit 4 是**已被占用的码位**（2026-09-12 archi 实测）：运行时脚本
//   `skill/scripts/memory-append.mjs:33`、`memory_write_gate.mjs:178`、`read_section.mjs:22` 都在用 4。
//   ⇒ 本运行器**绝不能**把 4 一律判 xfail：那样任何已登记件一旦因**真实失败**退 4，
//     就会被渲染 `⚠ xfail` 且不计入 failed ⇒ **真实失败被静默降级**。
//     这正是本轮一直在剿的病——**把「坏了」显示成「没那么坏」**。
//   ⇒ 故 4 采**声明制**：只有登记为 `{ xfail: true }` 的件退 4 才判 xfail；
//     **未声明件退 4 一律判 fail**。这让「允许某件存在未修缺陷」成为**显式决定**——
//     谁想加第二条 xfail 必须显式登记，进得了 review，不能靠退出码偷偷混进来。
//
// emitter（检测件）侧的义务，与上面一一对应，**别只实现一半**：
//   · 退 4 的前提是「**有 xfail 且没有任何真实断言失败**」；
//   · 一旦某条 xfail **意外变成 XPASS**（缺陷被修了、或被绕过），emitter 必须退 **1（fail）**，**不是 4**
//     —— 这是双向锁的另一半：只锁「FAIL 也接受」等于把未修缺陷正当化成绿（= skipped）；
//       只锁「PASS 判 FAIL」等于制造永久红灯。两端都锁，4 这个码位才有意义。
//
// 渲染三条硬约束（2026-09-12 team-lead 裁定，改动时不要退化掉）：
//   ① xfail 的字形**不得**与 ✅ 相混淆（用 ⚠，不用 ✓/✔）——人扫终端只看图标，
//      长得像 PASS 的话这个码位等于白加；
//   ② xfail 计数为 **0 时也要显示**（写 `0 xfail`，不得省略）——省略后读者分不清
//      「没有 xfail」与「runner 没统计 xfail」，后者是本件最怕的静默失效；
//   ③ 本运行器必须**自证能识别 4**（见文件末「反向证伪」说明）：加了码位但渲染分支没接上，
//      是一个「加了等于没加」的静默洞，与假绿同型。
//
// 运行行为：· 逐件运行并按其退出码归类；· 打印统一摘要（xfail 单独成段）；
//   · 任一 fail ⇒ 自身 exit 1；全 pass/skip/**xfail** ⇒ exit 0（xfail 不判失败）。
// 用法: node scripts/check-runner.mjs [--json]
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')
// 参与 test 链的检测件/测试件（顺序=依赖顺序：判据→载体→字段→分层→行为测试→红线→部署面→变更日志）
// 2026-09-11（测试清单收敛）：此前 `npm test` 的 && 链与 CHECKS 是**两份零重叠的清单**，
//   新增测试件无处登记（既不在 CHECKS 也不在 npm test）⇒ 写了也可能永远不跑。
//   现统一纪律：**行为级测试件一律进 CHECKS**（本运行器是唯一清单），npm test 只跑本运行器。
// 2026-09-12（N1 纪律执行化）：上面这条纪律**文本本身没有执行力**——立完之后，
//   `test-deepsleep-verdict.mjs`（G-16 的 36 条断言）、`test-watermark-guard.mjs`（G-20）、
//   `test-atomic-write.mjs`（D3 原子性 29 条断言，且从未 git add）三件仍然既不在 CHECKS 也不在 npm test，
//   等于 G-16 的断言一条都没跑过。故本次把全部行为级测试件登记进本清单，并把 `npm test` 退化为
//   只跑本运行器：**只有一个入口，就不存在"登记在另一份清单里"的漏网件**。
//   新增件**必须**登记在此；登记了但文件不存在 ⇒ 判 FAIL（不是静默跳过）。
// 每项格式：[相对仓根的脚本路径, ...argv, { 选项 }]。
//   · argv 中的 '__ROOT__' 会替换为仓根绝对路径（供需要根路径的检测件使用）；
//   · 末位的**选项对象**可选，目前唯一支持的选项是 `{ xfail: true }`——
//     声明该件允许用 exit 4 表达「已知未修」；**未声明件退 4 一律判 fail**（理由见件头「exit 4 是已被占用的码位」）。
const CHECKS = [
  ['scripts/check-criteria.mjs'],
  ['scripts/check-carriers.mjs'],
  ['scripts/check-field-usage.mjs'],
  ['scripts/test-layering.mjs'],
  ['scripts/test-carrier-layers.mjs'],
  ['scripts/test-forgetops.mjs'],
  ['scripts/test-treeops-split.mjs'],
  ['scripts/test-mcl.mjs'],
  ['scripts/test-deepsleep-verdict.mjs'],
  // 深睡层接线契约（P1 一/二期拆分后的行为安全网）：typecheck 只证明类型对，
  //   证明不了「东西还在、还跑得起来」。本件用全 mock ctx 装配 createDeepSleep，
  //   验 9 个句柄齐备 + 状态机真跑 + 实例隔离（状态没被提到模块级）。
  ['scripts/test-deepsleep-wiring.mjs'],
  ['scripts/test-watermark-guard.mjs'],
  ['scripts/test-atomic-write.mjs'],
  ['scripts/test-wiring-gate.mjs'],
  ['scripts/test-wiring-gate-ast.mjs'],
  ['scripts/test-treeops-rm.mjs', { xfail: true }],
  ['skill/scripts/test.mjs'],
  ['scripts/check-hardcode.mjs', '__ROOT__'],
  // 架构门禁（棘轮：只许收紧不许放松）——守「零循环依赖 / 模块规模 / 接口宽度 / 扇入上限」。
  // 与 check-srcmap 分工：srcmap 管 src↔lib 产物漂移，本件管模块依赖图的**结构性质**。
  ['scripts/audit-architecture.mjs', '--gate'],
  // 函数跨度门禁（棘轮双层）：守「单函数行数」这个**真病灶**——文件行数会随拆分发散，
  //   单函数跨度不会。① 硬顶 2000 行防新增怪物；② >400 行的函数个数 ≤ 4（棘轮基线，
  //   新增任何一个立刻红，拆掉一个则提示收紧基线）。避免「阈值取到今天谁也碰不到」的假绿。
  ['scripts/audit-fnspan.mjs', '--gate'],
  ['scripts/check-srcmap.mjs'],
  ['scripts/check-memory-write-path.mjs'],
  ['scripts/check-deploy-sync.mjs'],
  ['scripts/check-changelog.mjs'],
  ['scripts/check-ui-contract.mjs'],
  ['scripts/test-fold-state.mjs'],
  ['scripts/test-ui-derive.mjs'],
  ['scripts/test-css-usage-gate.mjs'],
]
const rows = []
for (const entry of CHECKS) {
  const [file, ...rest] = entry
  // 末位若是**普通对象**即为选项（{ xfail: true }），不参与 argv——否则会被当成参数喂给检测件
  const last = rest[rest.length - 1]
  const opts = (last && typeof last === 'object' && !Array.isArray(last)) ? rest.pop() : {}
  const argv = rest.map((a) => (a === '__ROOT__' ? root : a))
  let code = 0
  try { execFileSync('node', [join(root, file), ...argv], { stdio: 'ignore', timeout: 300000, windowsHide: true }) }
  catch (e) { code = Number(e.status ?? -1) }
  // 4 **且**已声明 xfail ⇒ xfail；未声明件退 4 ⇒ **fail**（见件头：4 是被运行时脚本占用的码位）
  rows.push({ file, code, verdict: code === 0 ? 'pass' : code === 3 ? 'skip' : (code === 4 && opts.xfail) ? 'xfail' : 'fail' })
}
const failed = rows.filter((r) => r.verdict === 'fail')
const xfailed = rows.filter((r) => r.verdict === 'xfail')
const out = {
  checks: rows,
  fail: failed.map((r) => r.file),
  xfail: xfailed.map((r) => r.file),
  note: '契约（ADR-132）：0=pass · 3=skip(依赖缺失) · 4=xfail(已知未修，不判失败但必须可见) · 其他=fail',
}
if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  // 字形：⚠ 与 ✅ 一眼可辨（硬约束①）；xfail 计数恒显示，含 0（硬约束②）
  const GLYPH = { pass: '✅', skip: '⏭', xfail: '⚠', fail: '❌' }
  const nPass = rows.filter((r) => r.verdict === 'pass').length
  const nSkip = rows.filter((r) => r.verdict === 'skip').length
  console.log('检测件统一运行（契约：0=pass · 3=skip · 4=xfail · 其他=fail）')
  for (const r of rows) console.log(`  ${GLYPH[r.verdict]} ${r.file.padEnd(36)} exit=${r.code} ${r.verdict}`)
  console.log(`\n${failed.length ? 'FAIL' : 'PASS'}（${nPass} pass · ${xfailed.length} xfail · ${nSkip} skip${failed.length ? ` · ${failed.length} fail` : ''}）`)
  if (xfailed.length) console.log(`⚠ XFAIL 项（已知未修，不判失败但必须可见）：${xfailed.map((r) => r.file).join(', ')}`)
  if (failed.length) console.log(`FAIL 项：${failed.map((r) => r.file).join(', ')}`)
}
// 反向证伪（硬约束③：自证 4 码位**渲染分支真的接上了**，不是"加了等于没加"的静默洞）
//   做法（不污染 CHECKS 常驻清单，跑完必须还原）：
//     ① 建临时件 `scripts/__xfail-probe.mjs`，内容 `process.exit(4)`
//     ② 在 CHECKS 首行插入 `['scripts/__xfail-probe.mjs', { xfail: true }],`（**必须带选项**，见下 ⑥）
//     ③ 跑 `node scripts/check-runner.mjs` ⇒ 必须同时满足：
//          渲染 `  ⚠ scripts/__xfail-probe.mjs  exit=4 xfail`
//          摘要出现 `1 xfail`，且出现「⚠ XFAIL 项（…必须可见）」段
//          **runner 自身 exit 仍为 0**（xfail 不判失败）
//     ④ 还原 runner 与 CHECKS、删除探针 ⇒ 与步骤 ① 之前的 **cp 备份件逐字节比对一致**
//        （**不要**在注释里写死哈希：本件一改哈希就变，写死即过期锚点，正是本轮反复踩的"证据与结论不同源"）
//   实测（2026-09-12）：③ 得到 `PASS（20 pass · 1 xfail · 0 skip）` + ⚠ 段 + RUNNER_EXIT=0 ✓
//   若哪天改了渲染分支却没重跑这条，4 就会被悄悄判成 ❌ fail（恒红）或 ✅ pass（假绿）——二者都是本件要防的。
//     ⑤ **反向的另一半，不可省**：把探针改成 `process.exit(5)`（未知码）重跑 ⇒ 必须仍渲染
//        `❌ … exit=5 fail`、计入 FAIL 项、**runner 自身 exit 1**。
//        只证 ③ 不证 ⑤ 等于没证：把判读写成一律 `'xfail'` 时 ③ 照样通过，**只有 ⑤ 抓得到**
//        ——那就是「新加的 4 分支把 else 吞掉了」，与本件要防的假绿完全同型。
//        （2026-09-12 实测四向：仅 4 ⇒ exit 0；仅 5 ⇒ exit 1；0+4 ⇒ exit 0；4+5 ⇒ exit 1，全中。）
//     ⑥ **声明制的核心方向，最不可省**（2026-09-12 team-lead 派工）：探针 `process.exit(4)` 但登记项
//        **不带** `{ xfail: true }` ⇒ 必须渲染 `❌ … exit=4 fail`、**计入 failed**、**runner exit 1**。
//        它锁的正是「4 是被运行时脚本占用的码位」这个洞：全局版（不看声明）会把任何真实失败退 4
//        静默降级成 xfail ⇒ **把「坏了」显示成「没那么坏」**。只验 ③ 不验 ⑥，这个洞就是敞开的。
//        （实测：声明件退 4 ⇒ ⚠/不计 failed/exit 0；**未声明件退 4 ⇒ ❌/计入 failed/exit 1**；
//          未声明件退 5 ⇒ ❌/计入 failed/exit 1；还原 ⇒ `PASS（19 pass · 1 xfail · 0 skip）` exit 0。）
process.exit(failed.length ? 1 : 0)
