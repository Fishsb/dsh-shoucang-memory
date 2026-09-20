#!/usr/bin/env node
// check-threshold-consumed.mjs — **阈值必须真被消费**（2026-09-20 · 真机取证驱动）
//
// ── 判因（真机实测 · "假旋钮"类缺陷）──────────────────────────────────────
// `thresholds.entries` 里登记了 **20 项**阈值，而其中至少一项**在 `src/` 实现里零消费者**：
//   · `mcl.fastGate` = `{minHits: 2, ratio: 0.6}` —— 实测 `grep minHits src/*.ts` **只命中
//     `criteria.generated.ts`（生成物）**，而 `mcl.ts` 的快通道判据实际用的是
//     `sim >= familiarThreshold && hasHighConf`（`mcl.ts:501`），**根本不读这两个参数**。
//   ⇒ 它是**死配置 / 假旋钮**：改了注册表、跑了 `gen:criteria`、门禁全绿，而**行为零变化**。
//     与本仓已登记的「假旋钮」教训（`alphaVal` 恒 0 被放弃）**同族**，
//     也与「接线 ≠ 抵达」「schema 有、显式映射没有」同族 —— 只是这次的断点在**阈值→实现**。
//
// ── 为什么现有门禁抓不到 ────────────────────────────────────────────────
//   · `check-threshold-registry`：判"**登记了没**（含预注册/样本/无矛盾/漂移）"，
//     **不问"项是否被实现读"**；
//   · `check-field-usage`：管**字段角色**（fieldRoles），不管阈值参数；
//   · `check-hardcode`：管**硬编码**，恰恰相反（它希望常量集中，不查是否被用）。
//   ⇒ 三方全绿而参数**永不被读** —— **"没登记 = 看不见"的另一面：登记了但不查消费 = 同样看不见"**。
//
// ── 本件守什么（两条断言）──────────────────────────────────────────────────
//   ① **每个阈值项至少有一个消费点**：对 `thresholds.entries` 的每一项，取其
//      **参数字面量键**（`minHits` / `ratio` / `threshold` / `value` …）与**项 id 尾段**，
//      在 `src/**/*.ts`（**排除 `criteria.generated.ts` 生成物**）里搜消费点；
//      零命中 ⇒ 红（除非在注册表 `thresholds.unconsumed` 显式登记并写明理由与 `until`）。
//   ② **反例自证**：注入一个"只在生成物里出现"的阈值 ⇒ ① 必红。
//
// ⚠ **判据的已知局限（如实声明）**：
//   · 名为 `value` / `threshold` 的**通用键**在多处出现 ⇒ 可能**误判为已消费**（宁可多报绿）。
//     故只对**特异键**（如 `minHits` / `ratio` / `bigram` / `chunkChars`）严格判；
//     通用键退化为"报告态"（列出但不判红）—— 与 `check-ledger-read` 的脚本面同纪律。
//   · 动态读取（`paramOf(id, 'k')` 以**变量**为键）静态看不见 ⇒ 同样只能报告态。
//
// 用法: node scripts/check-threshold-consumed.mjs [--selftest] [--json]
// 退出码：0=PASS  1=FAIL
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 通用键（多处出现 ⇒ 不可作"已消费"的强证据）——只报告不判红 */
const GENERIC_KEYS = new Set(['value', 'threshold', 'samples', 'note', 'conclusion', 'rollback', 'id', 'owner'])
/** **阈值登记项的元数据键**（与"被消费的参数名"无关）——**必须排除**，否则每项都判"零消费"。
 *  ⚠ 本件首版正是把 `preregisteredCriterion` / `recheck` 当参数字面量 ⇒ **20/20 全红**（全假）。
 *     根因：我只按"自有键"取，而没区分"**参数名**"与"**登记元数据**"。
 *     ⇒ 正解：参数名的**唯一权威来源**是 `probe.registryPath`（它指向注册表里那个真键），
 *       元数据键一律不算。（同理 `calibrator` / `preregistered` 也是元数据。） */
const META_KEYS = new Set(['preregisteredCriterion', 'recheck', 'calibrator', 'preregistered', 'probe', 'until', 'reason'])
const isMeta = (k) => GENERIC_KEYS.has(k) || META_KEYS.has(k)

/** 剥注释（仓内既有先例：`check-carriers` / `check-observability` 的「先剥注释再匹配」） */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/* ── `--selftest`：反例自证（样例取自真机形态）────────────────────────────── */
if (argv.includes('--selftest')) {
  const cases = [
    ['正例·特异键有消费点（`minHits` 在 src 里被读）',
      { keys: ['minHits', 'ratio'], src: `const m = paramOf('x', 'minHits', 2)\nconst r = paramOf('x', 'ratio', 0.6)` }, true],
    ['**反例**·特异键只在生成物里（真机 `mcl.fastGate` 形态）',
      { keys: ['minHits', 'ratio'], src: `const fast = sim >= cfg.familiarThreshold && hasHighConf` }, false],
    ['正例·已显式登记为未消费（豁免生效）',
      { keys: ['minHits'], src: `const x = 1`, unconsumed: ['mcl.fastGate'] }, true],
    ['报告态·通用键不判红',
      { keys: ['value'], src: `const x = 1` }, true],
  ]
  let bad = 0
  for (const [label, c, want] of cases) {
    const specKeys = c.keys.filter((k) => !GENERIC_KEYS.has(k))
    let got
    if (c.unconsumed) got = true
    else if (!specKeys.length) got = true // 通用键 ⇒ 报告态 ⇒ 不判红
    else got = specKeys.some((k) => new RegExp(`['"]${k}['"]`).test(c.src))
    const okCase = got === want
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 判${got ? '绿' : '红'}（期望${want ? '绿' : '红'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (!negs.length) { bad++; console.log('❌ 自证不含反例') }
  console.log(bad ? `\nFAIL（${bad} 例）` : `\nPASS（阈值消费判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────── */
const regPath = join(root, 'skill', 'engine', 'criteria.json')
if (!existsSync(regPath)) { console.log('❌ 找不到判据注册表（事实源不可缺）'); process.exit(1) }
const reg = JSON.parse(readFileSync(regPath, 'utf8'))
const entries = reg?.thresholds?.entries || []
const unconsumedDeclared = new Set(reg?.thresholds?.unconsumed || [])
/* **第四类：消费点存在但为硬编码字面量**（注册表象牙 + 代码字面量真牙）——判据 ① 看不见它们
 *   （判据只查"有没有**同名**消费点"，而这类消费点用的是**数值字面量**）。
 *   实测三项：`ingest.dedup.bigram.threshold`(0.66) · `tree.indexSemanticSim`(0.90) ·
 *   `activity.interferenceBand`([0.5,0.66])。⇒ 它们在注册表里**也有登记**，但**不读注册表**。
 *   ⚠ 已**逐项实查确认有消费点** ⇒ 计入本表（`valueHardcoded`）后判据 ① **不判红**
 *     （因为"有没有消费点"的答案确实是"有"），但会**单列报告** —— 避免"有消费点"被误读为"改它有效"。 */
const valueHardcoded = new Set(reg?.thresholds?.valueHardcoded || [])

const S = join(root, 'src')
// **排除生成物**：它是投影，不是消费者（真机 `mcl.fastGate` 正是靠"只在生成物里"被误认为有消费）
const srcFiles = readdirSync(S).filter((f) => f.endsWith('.ts') && f !== 'criteria.generated.ts')
const srcAll = srcFiles.map((f) => strip(readFileSync(join(S, f), 'utf8'))).join('\n')
console.log(`阈值消费核查（thresholds.entries ${entries.length} 项 · 扫描 ${srcFiles.length} 个**非生成物** src 文件）`)

const reds = []
const reports = []
for (const e of entries) {
  const id = String(e.id || '(无 id)')
  if (unconsumedDeclared.has(id)) { reports.push({ id, keys: [], verdict: '已登记未消费' }); continue }
  /* **参数名的权威来源** = `probe.registryPath` 的**末段**（它指向注册表里被读的那个键）。
   *  e.g. `mcl.fastGate` 的 registryPath = ['mcl','fastGate'] ⇒ 参数名 = `fastGate`。
   *  ⚠ 不用"项对象自有键"：那会混入 `preregisteredCriterion` / `recheck` 等**登记元数据**（首版 20/20 全假红的根因）。 */
  const rp = Array.isArray(e.probe?.registryPath) ? e.probe.registryPath : []
  /* **双通道判据**（2026-09-20 收紧 · 首版两轮都过度报红，原因逐轮记档）：
   *   通道 A：`probe.registryPath` 末段（注册表里的**参数键名**，如 `familiarThreshold`）；
   *   通道 B：`e.id` 的**末段**（如 `mcl.familiarThreshold` → `familiarThreshold`；
   *           `trigger.reviewIdleMs` → `reviewIdleMs`），以及**去掉 `trigger.`/`mcl.` 前缀后的整段**
   *           （本仓不少阈值的消费点是 **Config 字段名**，如 `deepSleepContentMinChars` /
   *            `mclFamiliarThreshold` —— 它们由 `scheduler.ts` 的**显式映射**读取，
   *            参数名与注册表键名**不同形**，故单靠通道 A 会误报）。
   *   ⚠ 为什么不是"单通道 + 白名单"：白名单会把"真死配置"一起盖住 —— 那是本件要抓的东西。
   *   ⚠ 仍然**只判"有没有人读这个键名"**，不判"读对了没"（后者归单测）。 */
  const idTail = String(id).split('.').pop()
  const camel = (s) => s.replace(/(?:^|\.)(\w)/g, (_, c) => c.toUpperCase()).replace(/\./g, '')
  const candidates = [...new Set([
    ...(rp.length ? [String(rp[rp.length - 1])] : []),
    idTail,
    `deepSleep${camel(idTail)}`,
    `mcl${camel(idTail)}`,
    camel(idTail),
  ])].filter((k) => k && !isMeta(k))
  const specKeys = candidates
  const hitKeys = specKeys.filter((k) => new RegExp(`['"]${k}['"]`).test(srcAll) || new RegExp(`\\b${k}\\b`).test(srcAll))
  const verdict = specKeys.length === 0 ? '通用键（报告态）' : (hitKeys.length ? '有消费点' : '**零消费点**')
  reports.push({ id, keys: specKeys, hit: hitKeys, verdict })
  if (specKeys.length && !hitKeys.length && !valueHardcoded.has(id)) reds.push(id)
}
for (const r of reports) {
  const tag = r.verdict === '**零消费点**' ? '❌' : (r.verdict === '有消费点' ? '✅' : '·')
  console.log(`   ${tag} ${r.id.padEnd(36)} ${r.verdict}${r.keys?.length ? ` · 键 ${r.keys.join('/')}` : ''}${r.hit?.length ? ` · 命中 ${r.hit.join('/')}` : ''}`)
}
ok(reds.length === 0,
  `① 每个阈值项至少有一个**消费点**（在非生成物的 src 里）${reds.length ? ` —— 零消费：${reds.join(', ')}（须实现或登记 \`thresholds.unconsumed\` 并写明 until）` : ''}`)

console.log('')
if (argv.includes('--json')) console.log(JSON.stringify({ entries: entries.length, reds, reports }, null, 2))
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（阈值消费核查通过：登记项均能在实现侧找到消费点，或已显式登记为未消费）')
