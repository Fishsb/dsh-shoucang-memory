#!/usr/bin/env node
// check-attribution-samples.mjs — **归因样本：取值上限必须 ≥ 判定门槛**（2026-09-20 round 9）
//
// ── 判因（真机实测 · **又一个"读成在等样本，其实是链断了"**）────────────────
// J3/U1 这条挂了多轮，登记上一直写着「**已接线并真机跑通；一致率待样本积累**」。
// 本轮实测把它戳穿：跨档 **35** 条带 `attribution*` 字段的深睡行，
//   `attributionSamples` **min 0 / max 18**，**≥30 者 0 条**，出非 `insufficient` verdict 的 **0 条**。
// 读码找到根因 —— **两处字面量互相打架**：
//   · `deepsleep-run.ts` 取样本：`samplesFromMclRows(missRows, 20)`  ← **上限 20**
//   · 同一函数判定：      `if (samples.length < 30) return insufficient` ← **门槛 30**
//   ⇒ **上限 20 永远不可能 ≥ 30** ⇒ 该分支**结构性恒真** ⇒
//     后面那段**真调子代理**的代码（整个 J3/U1 的目的）**从未执行过一次**。
//
// ── 为什么长期没人发现 ────────────────────────────────────────────────────
// ① 判定结果 `insufficient` **看起来像"样本不足"**（它字面就写着"未命中样本 N < 30"），
//    而 N 一路是 6/10/11/14/17 —— 一串**看起来在涨**的数 ⇒ 极易读成"在积累，快到了"。
//    实际它**永远到不了**：上限 20 卡死在前面。
// ② 门禁全绿：`check-runner` 跑的是"调用点存在 / 字段齐备"，**没有一道问"这个分支会不会恒真"**。
// ⇒ 与本仓已登记的「门4 零样本实为断链」「S-P1b′ 纪元 3/10 实为单档读」**同族**：
//   **"样本不足"与"结构性不可达"在读数上长得一模一样。**
//
// ── 本件守什么（两条断言）─────────────────────────────────────────────────
//   ① **不变量**：`ATTRIBUTION_SAMPLE_LIMIT >= ATTRIBUTION_MIN_SAMPLES`
//      （从**源码实际取值**解析，不采信注释）。
//   ② **判定可达性**：门槛分支之后**必须真的存在**调用子代理的代码
//      （否则"上门槛"也白搭 —— 防"把恒真分支改成恒假分支"的假修）。
//   ③ 反例自证：复现真机缺陷形态（limit=20 / min=30）⇒ ① 必红。
//
// 用法: node scripts/check-attribution-samples.mjs [--selftest]
// 退出码：0=PASS  1=FAIL
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** 从源码文本解析 `const NAME = <number>`（**剥注释**，只认可执行代码）。 */
export const numConst = (src, name) => {
  const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*(\\d+)`).exec(strip(src))
  return m ? Number(m[1]) : null
}

/* ── `--selftest`：反例自证（样例取自真机缺陷形态）────────────────────────── */
if (process.argv.includes('--selftest')) {
  const cases = [
    ['正例·上限 = 门槛（真机修后形态 30/30）→ 可达', 30, 30, true],
    ['正例·上限 > 门槛（40/30）→ 可达', 40, 30, true],
    ['**反例**·上限 < 门槛（**真机修前形态 20/30**）→ 恒真不可达', 20, 30, false],
    ['反例·上限远小于门槛（5/30）→ 不可达', 5, 30, false],
  ]
  let bad = 0
  for (const [label, limit, min, want] of cases) {
    const got = limit >= min
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判${got ? '可达' : '不可达'}（期望${want ? '可达' : '不可达'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (negs.length < 2) { bad++; console.log('❌ 反例不足（须含"上限<门槛"与"上限远小于门槛"）') }
  console.log(bad ? `\nFAIL（--selftest ${bad} 例）` : `\nPASS（判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────── */
const F = join(root, 'src', 'deepsleep-run.ts')
if (!existsSync(F)) { console.log('❌ 找不到 src/deepsleep-run.ts（事实源不可缺）'); process.exit(1) }
const src = readFileSync(F, 'utf8')
const limit = numConst(src, 'ATTRIBUTION_SAMPLE_LIMIT')
const min = numConst(src, 'ATTRIBUTION_MIN_SAMPLES')
console.log('归因样本不变量核查（取值上限 ≥ 判定门槛）')
console.log(`   实测：ATTRIBUTION_SAMPLE_LIMIT=${limit ?? '(未找到)'} · ATTRIBUTION_MIN_SAMPLES=${min ?? '(未找到)'}`)
ok(limit !== null && min !== null, '① 两个常量都在（**不得退回字面量** —— 那正是本轮修的病）')
if (limit !== null && min !== null) {
  ok(limit >= min,
    `① 不变量成立：上限 ${limit} ≥ 门槛 ${min}${limit < min ? ` —— **结构性不可达**（上限 < 门槛 ⇒ 门槛分支恒真 ⇒ 判定永不发生）` : ''}`)
}
/* ② 判定分支之后必须**真的存在**调用子代理的代码（防"把恒真改成恒假"的假修） */
const code = strip(src)
const afterGate = code.slice(code.indexOf('ATTRIBUTION_MIN_SAMPLES'))
ok(/subagents\.start\s*\(/.test(afterGate),
  '② 门槛分支之后**确有**调用子代理的代码（`subagents.start(`）—— 否则"上门槛"也到不了判定')

/* ── ③ **取样窗口必须按消费谓词关闭**（2026-09-21 · ADR-324）──────────────────────────
 *  判因（真机实测）：M3a 新增的 `phase:'judge'` 行**不带 missReason** 且占切点后量的 **77.7%**，
 *    而窗口原按「末 60 条 mcl-step」截断 ⇒ 窗口内可用样本 **0** ⇒ 又一次结构性不可达。
 *  ⇒ 本断言守两件事：
 *     (a) 取样循环**必须**经过 `takeAttributionScan`（唯一窗口实现）且谓词含 `isAttributionRow`
 *         —— 若退回"数行数截断"（`missRows.length < N` 之类），本条必红；
 *     (b) `isAttributionRow` 与 `samplesFromMclRows` **同源**（同一谓词函数，不得各写一份）。
 *  为什么是"结构断言"而不是"数值断言"：数值断言（"窗口内 ≥30"）需要真台账，
 *    而台账是**活体**（每次跑都在变）⇒ 会变成不稳定门。这里的病是**结构**（谓词不同源），
 *    结构断言恰好钉得住它，且不依赖台账状态。 */
const diag = (() => {
  const P = join(root, 'src', 'recall-diagnosis.ts')
  return existsSync(P) ? readFileSync(P, 'utf8') : ''
})()
const diagCode = strip(diag)
ok(/export function isAttributionRow/.test(diagCode) && /export function takeAttributionScan/.test(diagCode),
  '③ 窗口的**唯一实现**在场：`isAttributionRow` + `takeAttributionScan`（`recall-diagnosis.ts`）')
ok(/takeAttributionScan\s*\(/.test(afterGate),
  '③ 取样**走窗口实现**：`deepsleep-run` 的取样循环调用 `takeAttributionScan(`（不得退回行数截断）')
ok(/isAttributionRow\s*\(/.test(afterGate),
  '③ 窗口谓词含**消费谓词**：取样谓词里出现 `isAttributionRow(`（这才是"收满可用样本"而非"收满行"）')
// 反向：取样循环里**不得**再有"按 mcl-step 行数截断"的旧写法（它是本轮的病根）
ok(!/missRows\.length\s*<\s*\d+/.test(afterGate),
  '③ **旧病根已消除**：取样循环里不再有 `missRows.length < N` 形式的**行数截断**')
// (b) 同源：`samplesFromMclRows` 内部必须复用 `isAttributionRow`，而非自己再写一份判据
const samplesFn = diagCode.slice(diagCode.indexOf('export function samplesFromMclRows'))
ok(/isAttributionRow\s*\(/.test(samplesFn.slice(0, 400)),
  '③ **谓词同源**：`samplesFromMclRows` 复用 `isAttributionRow`（防"两处判据"再次漂移）')
/* (c) **窗口返回的必须是"已解析行"而非原始行** —— 2026-09-21 实测抓到的自身缺陷：
 *   首版 `takeAttributionScan` 把 parse 与 pred 合成一个（直接返回裸行），
 *   而下游 `samplesFromMclRows` 要的是**对象** ⇒ **样本恒为 0**，
 *   而当时上面那四条断言**全绿**（调用点在场、谓词在场、无行数截断、谓词同源）——
 *   即：**门只看"接线了没"，没看"过出来的东西对不对"**。这条断言补的正是那一格。
 *   判据：窗口函数签名须含**显式 parse 参数**，且返回类型是 `parse` 的产物。
 *   反例自证见 `--selftest` 的 `takeAttributionScan` 行为断言（下面实跑段）。 */
ok(/parse:\s*\(raw:/.test(diagCode) && /const row = parse\(raw\)/.test(diagCode),
  '③ **窗口返回已解析行**（签名含显式 `parse` 参数 · 内部 `const row = parse(raw)`）—— 防"裸行直传致样本恒 0"')
ok(/rows\.push\(row\)/.test(diagCode),
  '③ 推入的是 `parse` 的产物（`rows.push(row)`）而非原始行')
/* (d) **「扫描触顶」与「样本真不足」必须可分辨**（2026-09-21 补 · 承接同一"两种情形同形"的教训）：
 *   两者 `samples` 都 < 门槛 ⇒ **读数同形**，但处置相反（**调上限** vs **等时间**）。
 *   实测密度**在漂**：同一库收满 30 条从 ≈503 行涨到 ≈1514 行（降到 **1/3**），
 *   而 `ATTRIBUTION_MAX_SCAN=4000` 的余量只剩 **2.6×** ⇒ 迟早触顶，届时**必须**能从 note 一眼分辨。 */
ok(/hitCap/.test(afterGate) && /ATTRIBUTION_MAX_SCAN/.test(afterGate),
  '③ **触顶可分辨**：门槛未达时区分「扫描触顶」（须调上限）与「样本真不足」（须等时间）')
ok(/ATTRIBUTION_MAX_SCAN/.test(diagCode),
  '③ 上限常量定义在**窗口侧**（`recall-diagnosis#ATTRIBUTION_MAX_SCAN`，与消费谓词同源）')

/* ── ④ **行为级**：窗口函数真的按消费谓词关闭（非文本断言）──────────────────────────
 *  上面 ①–③ 都是**文本/结构**断言，它们能被"改个名就绕过"。本条用**真跑**钉行为：
 *  喂入一个"大量不满足谓词的行 + 少量满足的"序列，断言窗口**只收满足者**且**收满即停**。
 *  ⚠ 本仓教训（`[原则] 声明非判据`）：结构断言会漏"接线了但过出来的东西不对"。 */
const { takeAttributionScan, isAttributionRow } = await import(new URL('../lib/recall-diagnosis.js', import.meta.url).href)
  .catch(() => ({ takeAttributionScan: null, isAttributionRow: null }))
if (!takeAttributionScan) {
  ok(false, '④ 行为级：`lib/recall-diagnosis.js` 未导出 `takeAttributionScan`（先 `npm run build:host`）')
} else {
  // ⚠ 排列须**照真机形态**：噪音（judge 行）**更新** ⇒ 排在**前面**；真样本更旧 ⇒ 在后面。
  //   （首版我把真样本放前面 ⇒ 窗口第 2 行就收满 ⇒ 断言平凡通过。**夹具顺序错了，判据就失去区分力**。）
  const noise = Array.from({ length: 100 }, (_, i) => JSON.stringify({ kind: 'mcl-step', phase: 'judge', step: i }))
  const real = Array.from({ length: 3 }, (_, i) => JSON.stringify({ kind: 'mcl-step', phase: 'inject', missReason: 'below-threshold', topics: [`t${i}`] }))
  const feed = [...noise, ...real] // 倒序（最新在前）= 噪音打头
  const parse = (raw) => { const t = String(raw).trim(); if (!t) return null; try { return JSON.parse(t) } catch { return null } }
  const r = takeAttributionScan(feed, parse, (o) => o.kind === 'mcl-step' && isAttributionRow(o), 2)
  ok(r.rows.length === 2 && r.rows.every((o) => typeof o === 'object' && o !== null && o.missReason === 'below-threshold'),
    `④ 行为级：100 条噪音**打头**仍能收满 2 条**已解析的**满足者（实测收 ${r.rows.length} 条 · 首条 ${JSON.stringify(r.rows[0])}）`)
  ok(r.scanned === 102, `④ 行为级：**跳过噪音继续扫**（收满即停 ⇒ 实测扫 ${r.scanned} 行，期望 102 = 100 噪音 + 2 样本）`)
  // **反例**：把 pred 换成"只要是 mcl-step"（= 本轮病根形态）⇒ 收回来的是噪音，不是样本
  const bad = takeAttributionScan(feed, parse, (o) => o.kind === 'mcl-step', 2)
  ok(bad.rows.every((o) => isAttributionRow(o)) === false,
    `④ **反例**：谓词退化（只判 kind）⇒ 收回来的全是噪音（实测 ${JSON.stringify(bad.rows[0])}）⇒ 判据具区分力、非恒真`)
}

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（归因判定**可达**：取值上限 ≥ 门槛 · 门槛后有判定代码 · **取样窗口按消费谓词关闭**（结构 + 行为双证））')
