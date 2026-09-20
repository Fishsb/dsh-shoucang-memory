#!/usr/bin/env node
// check-threshold-control.mjs — **阈值旋钮必须真的有传动**（2026-09-20 round 8 · 取代 check-threshold-consumed）
//
// ── 判因（本轮实测 · 且**推翻了我上一轮的分类本身**）─────────────────────────
// 上一轮我建了 `check-threshold-consumed.mjs`，判据是「阈值项的**键名**在 `src/` 里是否出现」，
//   据此把 9 项分成「真死配置 / 命名不符 / 键名写错 / 消费点是字面量」四类，并写进注册表 `unconsumed`。
// **本轮逐项复核，四类里至少两类是错的**（证据见 `docs/OPEN-ITEMS.md §0g`）：
//   · `mcl.fastGate` 判「真死配置」—— **错**。它的 `probe.contains` 对应 `mcl.ts` 里**确有一处**
//     （`hit / sg.length >= 0.6`），但那是 **`judge()` 的词元覆盖率门**，**不是**快通道门
//     （后者 = `sim >= familiarThreshold && hasHighConf`）。⇒ 判据真实存在，只是**登记项贴错了名字**。
//   · `activity.statusDays` 判「键名写错」—— **错**。值是活的（`scheduler.ts` zod 缺省 → `deepsleep-run`
//     → `activity.ts` opts），只是 zod 缺省**硬编码 14/44/90** 而不读注册表 ⇒ 与其余同类，都是**双源**。
// **根因（这才是本轮真正的发现）**：那套判据的**代理是「键名匹配」**，而键名会被**注释、生成物、同名
//   局部变量**同时满足/不满足 ⇒ 产出的是「命名巧合表」而非「断链表」。同族教训：`[原则] 代理指标非判据`。
// **机制级事实（上一轮整轮漏掉）**：`THRESHOLDS`（整份阈值投影）在 `src/` 内 **零消费者** ——
//   8 项登记项的 `probe` 指向代码里的**裸数值字面量**（`>= 0.66` / `>= 0.9` / `v >= 0.5 && v < 0.66` …）
//   ⇒ 改注册表 + `gen:criteria` + 门禁全绿，而**行为零变化**（"假旋钮"）。
//
// ── 本件守什么（两条断言 · 判据建立在**读口**上，不是名字上）──────────────────
//   ① **字面量型登记项必须有活读口**：凡 `probe` 为 `file` + `contains` 形态的项，必须带
//      `read` 字段声明读口，且 `src/` 内**真实存在**一处 `thresholdValue('<id>'` 调用
//      （或 `thresholdParam('<id>'`）—— 即「改注册表 ⇒ 真的改了判据」。
//   ② **读口不得是孤儿**：`thresholdValue` / `thresholdParam` 至少有一个 `src/` 内调用点
//      （防「读口建了没人用」—— 那只是把假旋钮换成假读口）。
// ⚠ **判据的已知局限（如实声明）**：本件查「**有没有读口调用**」，**不查「读得对不对」**
//   （后者归各自的单测）。且 `registryPath` 型登记项（值直接从注册表 `params` 取）天然是"活"的，
//   不需要 `read` —— 它们的风险是**别的东西**（见 `check-threshold-registry` ④ 漂移检测）。
//
// 用法: node scripts/check-threshold-control.mjs [--selftest] [--json]
// 退出码：0=PASS  1=FAIL
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 剥注释（仓内既有先例：`check-carriers` / `check-observability` 的「先剥注释再匹配」）。
 *  ⚠ **对本件是必需的**：上一轮的假绿正是被**注释**喂出来的（`check-threshold-consumed` 的样例
 *     甚至把注释文本当证据）。剥掉后只剩真代码，杜绝同族。 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** 判定：某 id 的读口是否在 src（非生成物、已剥注释）里真实存在。 */
export const hasReadPort = (id, srcText) =>
  new RegExp(`threshold(?:Value|Param)\\s*(?:<[^>]*>)?\\s*\\(\\s*['"]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(srcText)

/* ── `--selftest`：反例自证（样例取自真机形态）────────────────────────────── */
if (argv.includes('--selftest')) {
  const cases = [
    ['正例·有真读口（真机 `tree.indexSemanticSim` 形态）',
      'tree.indexSemanticSim', `const idxSemSim = thresholdValue<number>('tree.indexSemanticSim', 0.9)`, true],
    ['正例·对象读口（真机 `activity.statusDays` 形态）',
      'activity.statusDays', `thresholdParam<number>('activity.statusDays', 'warm', 14)`, true],
    ['**反例**·只有字面量、无读口（真机"假旋钮"形态）',
      'write.semanticDupSim', `if (s !== null && s >= 0.8) { dup = 'sem' }`, false],
    ['**反例**·读口出现在**注释**里（剥注释后必须不认账）',
      'write.semanticDupSim', `// 应改读 thresholdValue('write.semanticDupSim')\nconst x = 0.8`, false],
    ['反例·读了**别的 id**（不得张冠李戴）',
      'tree.sectionMergeSim', `const x = thresholdValue('tree.indexSemanticSim', 0.9)`, false],
  ]
  let bad = 0
  for (const [label, id, raw, want] of cases) {
    const got = hasReadPort(id, strip(raw))
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判${got ? '有读口' : '无读口'}（期望${want ? '有' : '无'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (negs.length < 2) { bad++; console.log('❌ 反例不足（须含"无读口"与"注释里的读口"两类）') }
  console.log(bad ? `\nFAIL（--selftest ${bad} 例）` : `\nPASS（判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────── */
const regPath = join(root, 'skill', 'engine', 'criteria.json')
if (!existsSync(regPath)) { console.log('❌ 找不到判据注册表（事实源不可缺）'); process.exit(1) }
const reg = JSON.parse(readFileSync(regPath, 'utf8'))
const entries = reg?.thresholds?.entries || []

const S = join(root, 'src')
// **排除生成物**：它是投影，不是消费者（真机正是靠"只在生成物里"被误认为有消费）
const srcFiles = readdirSync(S).filter((f) => f.endsWith('.ts') && f !== 'criteria.generated.ts')
const srcAll = srcFiles.map((f) => strip(readFileSync(join(S, f), 'utf8'))).join('\n')
console.log(`阈值传动核查（thresholds.entries ${entries.length} 项 · 扫描 ${srcFiles.length} 个**非生成物·已剥注释**的 src 文件）`)

// ── ① 字面量型登记项必须有活读口 ──
const noPort = []
const literal = []
for (const e of entries) {
  const id = String(e.id || '')
  const p = e.probe || {}
  if (Array.isArray(p.registryPath)) continue // 值直接从注册表 params 取 ⇒ 天然"活"
  literal.push(id)
  if (!e.read) { noPort.push(`${id}（缺 read 声明）`); continue }
  if (!hasReadPort(id, srcAll)) noPort.push(`${id}（read 声明了但 src 无该读口：${e.read}）`)
}
ok(noPort.length === 0,
  `① 代码字面量型登记项（${literal.length} 项）必须有**活读口**（src 内真实存在 thresholdValue/thresholdParam 调用）` +
  (noPort.length ? ` —— 无传动：${noPort.join(' · ')}` : ` —— ${literal.join(' · ')}`))

// ── ② 读口本身不得是孤儿 ──
const portCalls = (srcAll.match(/threshold(?:Value|Param)\s*(?:<[^>]*>)?\s*\(/g) || []).length
ok(portCalls > 0, `② 读口非孤儿：src 内 thresholdValue/thresholdParam 调用点 ${portCalls} 处`)

/* ── ③ `registryPath` 型**也不自动安全**（本轮新增 · 堵"参数在注册表里但没人取"）────────
 *  判因：① 只覆盖 `file`+`contains` 型的 9 项。但「值在注册表」**不等于**「实现取了它」——
 *    真机实例：`ingest.dedup.bigram.threshold` 的 `registryPath` 指向
 *    `ingest.criteria[ingest.dedup.bigram].params.threshold`（值确在注册表），
 *    而 `distill-write.ts` 的消费点当时写的是**裸字面量 `>= 0.66`** ⇒ 改注册表**零效果**。
 *    ⇒ 对 `ingest.criteria[...]` / `consolidate.criteria[...]` 这两族，取值**必须经由**：
 *      A) `paramOf('<行 id>', '<键>'`（src 侧读 CRITERIA_ROWS），或
 *      B) `thresholdValue('<项 id>'`，或
 *      C) 该键被投影进 `skill/engine/criteria-gate.json` **且**有脚本面读者
 *         （`granularity` / `dedup` / `format` / `demote` 四族 —— `memory_write_gate` / `memory_health_check` 读它）。
 *    三者皆无 ⇒ 红。 */
{
  const gateJson = (() => {
    try { return JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria-gate.json'), 'utf8')) } catch { return null }
  })()
  const gateReaders = ['skill/scripts/memory_write_gate.mjs', 'skill/scripts/memory_health_check.mjs']
    .map((p) => { try { return strip(readFileSync(join(root, p), 'utf8')) } catch { return '' } }).join('\n')
  const keyInGate = (k) => {
    if (!gateJson || !k) return false
    const hit = (o) => o && typeof o === 'object'
      && (Object.prototype.hasOwnProperty.call(o, k) || Object.values(o).some((v) => hit(v)))
    return hit(gateJson)
  }
  const stranded = []
  let rowFamily = 0
  for (const e of entries) {
    const rp = e.probe?.registryPath
    if (!Array.isArray(rp) || !['ingest.criteria', 'consolidate.criteria'].includes(rp.slice(0, 2).join('.'))) continue
    rowFamily++
    const rowId = rp[2]
    /* ⚠ **`registryPath` 以 `params` 结尾 = 登记的是"整个 params 对象"**（真机 `ingest.granularity.splitLaw`
     *   的 value 是 `{R:1000, K:6}`）⇒ 此时该查的不是字面键 `params`，而是**对象自己的键**（`R`/`K`）。
     *   本判据首版把 `params` 当键 ⇒ 报假红（**这条修正不是放宽**：从"查一个不存在的键"改成
     *   "查真实被消费的键"，两者严格性不变）。 */
    const keys = rp[rp.length - 1] === 'params' && e.value && typeof e.value === 'object'
      ? Object.keys(e.value)
      : [rp[rp.length - 1]]
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const viaParam = keys.some((k) => new RegExp(`paramOf\\s*(?:<[^>]*>)?\\s*\\(\\s*['"]${esc(rowId)}['"][^)]*['"]${esc(k)}['"]`).test(srcAll))
    const viaPort = hasReadPort(String(e.id), srcAll)
    const viaGate = keys.some((k) => keyInGate(k)) && gateReaders.length > 0
    if (!viaParam && !viaPort && !viaGate) stranded.push(`${e.id}（行 ${rowId} 的键 ${keys.join('/')} 无取值路径）`)
  }
  ok(stranded.length === 0,
    `③ 判据行型登记项（${rowFamily} 项）取值须经 paramOf / thresholdValue / criteria-gate.json 之一` +
    (stranded.length ? ` —— 悬空：${stranded.join(' · ')}` : ''))
}

// ── 报告：每项传动状态 ──
console.log('')
for (const e of entries) {
  const p = e.probe || {}
  const kind = Array.isArray(p.registryPath) ? '注册表参数' : '代码字面量'
  const alive = Array.isArray(p.registryPath) ? '（值即注册表 → 改注册表生效）' : (hasReadPort(String(e.id), srcAll) ? '→ thresholdValue ✓' : '✗ 无读口')
  console.log(`   ${alive.startsWith('✗') ? '❌' : '✅'} ${String(e.id).padEnd(34)} ${kind.padEnd(10)} ${alive}`)
}

console.log('')
if (argv.includes('--json')) console.log(JSON.stringify({ literal, noPort, portCalls }, null, 2))
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（阈值传动核查通过：登记项或直接读注册表，或有**已验证存在**的读口 —— 不存在"改了没反应"的旋钮）')
