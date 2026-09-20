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
import { fileURLToPath, pathToFileURL } from 'node:url'

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

/** 判定：某 `registryPath` 行族登记项的参数**真的被脚本面按归属路径读到**吗（2026-09-20 round 9）。
 *
 *  ── 判因（本轮实测 · **③ 曾结构性恒真**）────────────────────────────────
 *  旧实现 `keyInGate(k)` 在**整份 `criteria-gate.json` 里递归找键名** ⇒ 键名一旦与别处同名即误判。
 *  真机形态：投影里**顶层 `R`/`K`**（= `reg.health.R`，体检用）与 **`granularity.R`/`granularity.K`**
 *  （= 分裂律，`ingest.granularity.split-law` 的参数）**同名同值**。
 *  实测（`_tmp-probe-gate3-collide.mjs` 实证）：查 `granularity` 的 `R` 命中顶层 `R`
 *  ⇒ **把整个 `granularity` 支删掉仍判"有"** ⇒ 该分支**恒真** ⇒ 遮盖下面这个**真缺陷**：
 *  **`granularity.R/K` 在 `src/` 与 `skill/scripts/` 里都零消费者**
 *  （`panel-observe.ts:440` 是裸 `const R = 1000`；`distill.ts:162` 与 `deepsleep-core.ts:262`
 *   两处 prompt 也把 `> 1000 字 / > 6 条` 写死在模板里）。
 *
 *  ── 怎么才算"被读到"（**归属不靠猜，靠生成器**）────────────────────────────
 *  ⚠ 第一版修正曾用「路径深度 ≥2」区分归属 —— **那是代理指标**：`notesWarn` 是真消费者却恰在顶层，
 *    而 `dedup.R` 与 `granularity.R` 同名同值时又会互相冒充（selftest 当场两条都判错）。
 *  正解 = 问**生成器自己**：`scripts/gen-criteria.mjs#buildGate` 明确写着每一支取自哪一行的 `params`
 *    （`granularity: … criteria.find(c => c.id === 'ingest.granularity.split-law').params`）。
 *    本件解析该映射 ⇒ `行 id → 投影支名`，再要求读者写出**该支的路径取值**。
 *  与被推翻的旧版相比**不是放宽**：从"整份 JSON 里有个同名键"收紧到
 *    "该行确被投影到某支、该支下确有此键、键值等于登记值、且读者按该支路径取值"四条合取。
 */
export const gateBranchOf = (genSrc, rowId) => {
  const s = strip(genSrc)
  // 形如： granularity: { R: reg.ingest.criteria.find((c) => c.id === 'ingest.granularity.split-law').params.R, ... }
  //   或： demote: reg.consolidate.criteria.find((c) => c.id === 'consolidate.demote.archive').params,
  const out = new Map()
  const re = /^\s*([A-Za-z_$][\w$]*)\s*:\s*([^\n]+)$/gm
  let m
  while ((m = re.exec(s))) {
    const [, branch, rhs] = m
    const idm = /c\.id\s*===\s*['"]([^'"]+)['"]/.exec(rhs)
    if (idm && out.get(idm[1]) === undefined) out.set(idm[1], branch)
  }
  return out.get(rowId) || null
}

/** 该行族参数是否被脚本面**按归属支路径**读到（`atPath` 由 `gateBranchOf` 给出，不是猜的）。 */
export const gateReadAt = (gateJson, readersText, branch, keys, wantObj) => {
  if (!branch) return { ok: false, present: false, byPath: false, path: null, why: '该行未被 gen-criteria 投影到任何支' }
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const head = gateJson?.[branch]
  if (!head || typeof head !== 'object') return { ok: false, present: false, byPath: false, path: null, why: `投影无 ${branch} 支` }
  const present = keys.every((k) => {
    const v = head[k]
    const want = wantObj && typeof wantObj === 'object' ? wantObj[k] : undefined
    return v !== undefined && (want === undefined || JSON.stringify(v) === JSON.stringify(want))
  })
  const byPath = keys.some((k) => new RegExp(`\\b[A-Za-z_$][\\w$]*\\s*\\.\\s*${esc(branch)}\\s*\\.\\s*${esc(k)}\\b`).test(readersText))
  return { ok: present && byPath, present, byPath, path: `${branch}.${keys.join('/')}`, why: present ? (byPath ? 'ok' : '键在但无人按该支路径读') : '支下缺该键或值不符' }
}

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

  /* ── ③ 的**反例自证**（2026-09-20 round 9 补）：同名键不得冒充"投影里有读数" ────────
   *  真机形态：`criteria-gate.json` 里 **顶层 `R`/`K`**（= `health.R/K`）与
   *    **`granularity.R`/`granularity.K`**（= 分裂律）**同名同值**。
   *  旧判据在**整份 JSON 里递归找键名** ⇒ 查 `granularity` 的 `R` 时被顶层 `R` 满足
   *    ⇒ **恒真**（删掉 `granularity` 支仍判"有"）。⇒ 改为**按归属路径 + 值一致 + 读者按路径读**。 */
  const gateCases = [
    ['正例·行被投影到某支、键在、值符、读者按该支路径读（`proj.demote.coldDays` 形态）',
      { gj: { demote: { coldDays: 90 } }, readers: 'const c = proj.demote.coldDays',
        gen: `demote: reg.consolidate.criteria.find((c) => c.id === 'consolidate.demote.archive').params,`,
        row: 'consolidate.demote.archive', want: { coldDays: 90 }, keys: ['coldDays'], expect: true }],
    ['**反例**·同名键冒充：行被投影到 `granularity`，而读者只读顶层 `proj.R`（**真机恒真形态**）',
      { gj: { R: 1000, granularity: { R: 1000 } }, readers: 'const R = proj.R',
        gen: `granularity: reg.ingest.criteria.find((c) => c.id === 'ingest.granularity.split-law').params,`,
        row: 'ingest.granularity.split-law', want: { R: 1000, K: 6 }, keys: ['R', 'K'], expect: false }],
    ['正例·读者按归属支路径读（应改成的形态 `proj.granularity.R`）',
      { gj: { R: 1000, granularity: { R: 1000, K: 6 } }, readers: 'const R = proj.granularity.R\nconst K = proj.granularity.K',
        gen: `granularity: reg.ingest.criteria.find((c) => c.id === 'ingest.granularity.split-law').params,`,
        row: 'ingest.granularity.split-law', want: { R: 1000, K: 6 }, keys: ['R', 'K'], expect: true }],
    ['**反例**·值不一致（投影里该支的键值 ≠ 登记值 ⇒ 不是同一件事）',
      { gj: { granularity: { R: 999 } }, readers: 'const R = proj.granularity.R',
        gen: `granularity: reg.ingest.criteria.find((c) => c.id === 'ingest.granularity.split-law').params,`,
        row: 'ingest.granularity.split-law', want: { R: 1000, K: 6 }, keys: ['R'], expect: false }],
    ['**反例**·支在、读者在，但读者读的是**另一支**（`proj.dedup.R`）',
      { gj: { granularity: { R: 1000 }, dedup: { R: 1000 } }, readers: 'const R = proj.dedup.R',
        gen: `granularity: reg.ingest.criteria.find((c) => c.id === 'ingest.granularity.split-law').params,\ndedup: reg.ingest.criteria.find((c) => c.id === 'ingest.dedup.bigram').params,`,
        row: 'ingest.granularity.split-law', want: { R: 1000 }, keys: ['R'], expect: false }],
    ['**反例**·该行**根本未被投影**到任何支（生成器里找不到它）',
      { gj: { granularity: { R: 1000 } }, readers: 'const R = proj.granularity.R',
        gen: `granularity: reg.ingest.criteria.find((c) => c.id === 'ingest.granularity.split-law').params,`,
        row: 'ingest.ghost.row', want: { R: 1000 }, keys: ['R'], expect: false }],
  ]
  for (const [label, c] of gateCases) {
    const branch = gateBranchOf(c.gen, c.row)
    const got = gateReadAt(c.gj, c.readers, branch, c.keys, c.want).ok
    const okCase = got === c.expect
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → 支=${branch || '(无)'} · 判${got ? '有' : '无'}（期望${c.expect ? '有' : '无'}）`)
  }
  negs.push(...gateCases.filter(([l]) => l.includes('反例')))
  if (negs.length < 5) { bad++; console.log('❌ 反例不足（须含"无读口 / 注释里的读口 / 同名键冒充 / 值不一致 / 读了别的支 / 未投影"六类）') }

  console.log(bad ? `\nFAIL（--selftest ${bad} 例）` : `\nPASS（判据自证可用：${cases.length + gateCases.length} 例，含 ${negs.length} 条反例）`)
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
const srcTexts = srcFiles.map((f) => ({ f, t: strip(readFileSync(join(S, f), 'utf8')) }))
const srcAll = srcTexts.map((x) => x.t).join('\n')
console.log(`阈值传动核查（thresholds.entries ${entries.length} 项 · 扫描 ${srcFiles.length} 个**非生成物·已剥注释**的 src 文件）`)

/** `paramOf('<rowId>', '<key>'` 的**别名感知**判定（2026-09-20 round 9）。
 *  判因：`criteria.ts#demoteVerdict` 写的是 `const id = 'consolidate.demote.archive'`
 *        再 `paramOf<number>(id, 'coldDays', 90)` —— **行 id 经局部别名传入**。
 *  旧正则要求两个参数都是**字面量** ⇒ 判"无取值路径"（**假红**，会误报真消费者）。
 *  ⇒ 先在该文件里收集绑定到该 rowId 字面量的**局部标识符**，再连带匹配。 */
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const viaParamOf = (rowId, keys) => srcTexts.some(({ t }) => {
  const aliasRe = new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*['"]${escRe(rowId)}['"]`, 'g')
  const aliases = []
  let m
  while ((m = aliasRe.exec(t))) aliases.push(m[1])
  const srcAlt = [`'${escRe(rowId)}'`, ...aliases.map((a) => `\\b${escRe(a)}\\b`)].join('|')
  return keys.some((k) => new RegExp(`paramOf\\s*(?:<[^>]*>)?\\s*\\(\\s*(?:${srcAlt})\\s*,\\s*['"]${escRe(k)}['"]`).test(t))
})

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
 *      C) 该键被投影进 `skill/engine/criteria-gate.json` **且**被脚本面**按归属路径**读者取用
 *         （`gateReadHit`；⚠ 2026-09-20 round 9 订正：旧版是"整份 JSON 里有个同名键"⇒ **恒真**，
 *          实证见 `gateReadHit` 的判因段）。
 *    三者皆无 ⇒ 红。 */
{
  const gateJson = (() => {
    try { return JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria-gate.json'), 'utf8')) } catch { return null }
  })()
  // **归属映射的唯一来源 = 生成器自己**（不另写一份表，否则又是一处漂移源）
  const genSrc = (() => {
    try { return readFileSync(join(root, 'scripts', 'gen-criteria.mjs'), 'utf8') } catch { return '' }
  })()
  if (!genSrc) { console.log('❌ 读不到 scripts/gen-criteria.mjs（归属映射的来源不可缺）'); process.exit(1) }
  const gateReaders = ['skill/scripts/memory_write_gate.mjs', 'skill/scripts/memory_health_check.mjs']
    .map((p) => { try { return strip(readFileSync(join(root, p), 'utf8')) } catch { return '' } }).join('\n')
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
    const viaParam = viaParamOf(rowId, keys)
    const viaPort = hasReadPort(String(e.id), srcAll)
    /* C) 脚本面投影路：**归属支由生成器给出**（`gateBranchOf`），再要求"支下有此键 +
     *    值等于登记值 + 读者按该支路径取值"三条合取。⚠ 归属**不靠猜深度/名字**——
     *    第一版曾用"路径深度 ≥2"，而 `notesWarn` 恰在顶层（真消费者被判无）且
     *    `dedup.R`/`granularity.R` 同名同值会互相冒充（selftest 两条都判错）。 */
    const branch = gateBranchOf(genSrc, rowId)
    const gateHit = gateReadAt(gateJson, gateReaders, branch, keys, e.value)
    const viaGate = gateHit.ok
    if (!viaParam && !viaPort && !viaGate) stranded.push(`${e.id}（行 ${rowId} 的键 ${keys.join('/')} 无取值路径：${branch ? `投影支 ${branch}` : '未投影'} · ${gateHit.why}）`)
  }
  ok(stranded.length === 0,
    `③ 判据行型登记项（${rowFamily} 项）取值须经 paramOf / thresholdValue / criteria-gate.json（**按归属路径**）之一` +
    (stranded.length ? ` —— 悬空：${stranded.join(' · ')}` : ''))
}

/** 在投影里为某行 id 的键**反查实际归属路径**，并核对读者是否按该路径取值。
 *  做法：穷举投影的**路径**（不只是键名），挑出「叶键名 ∈ keys 且叶值 === 登记值」的那些路径，
 *  再要求读者代码中至少有一条**该路径的取值**。⇒ 同名键不再冒充（路径不同即不算）。
 *  实现在文件上方（`gatePathOf`，导出版）。此处仅留说明，避免第二份定义。 */

/* ── ④ **运行期抵达**（2026-09-20 round 9 新增 · 补"接线 ≠ 抵达"型假绿）────────────────
 *  判因：①②③ 查的都是**静态读口**（源码里有没有那行调用）——而 `distill.ts` 的
 *    `DEFAULT_DISTILL_PROMPT` / `deepsleep-core.ts` 的 `DEEP_SLEEP_PROMPT` 是**模板字面量**，
 *    `tsc` **不内联** `${SPLIT.R}`（实测编译产物里原样保留该表达式，运行期才展开）
 *    ⇒ 只 grep 源码会**漏判**（同族教训：`check-l0-conflict-wiring` 曾 grep 编译产物里的字面量而假红，
 *      正解是 `await import()` 编译模块取运行期值）。
 *  本规则：**导入编译产物**，断言两处提示词真的含**注册表登记值**（不是源码里的表达式文本）。 */
{
  const libDir = join(root, 'lib')
  const want = (() => {
    const row = (() => {
      try { return JSON.parse(readFileSync(join(root, 'skill/engine/criteria.json'), 'utf8')) } catch { return null }
    })()
    const c = row?.ingest?.criteria?.find((x) => x.id === 'ingest.granularity.split-law')
    return c?.params || null
  })()
  if (!want) { console.log('❌ 注册表缺 ingest.granularity.split-law.params（事实源不可缺）'); process.exit(1) }
  const imported = []
  try {
    const { DEFAULT_DISTILL_PROMPT } = await import(pathToFileURL(join(libDir, 'distill.js')).href)
    const { DEEP_SLEEP_PROMPT } = await import(pathToFileURL(join(libDir, 'deepsleep-core.js')).href)
    imported.push(['lib/distill.js#DEFAULT_DISTILL_PROMPT', DEFAULT_DISTILL_PROMPT])
    imported.push(['lib/deepsleep-core.js#DEEP_SLEEP_PROMPT', DEEP_SLEEP_PROMPT])
  } catch (e) {
    console.log(`❌ 无法导入编译产物（lib/ 未构建？）: ${String(e?.message || e).slice(0, 100)}`)
    process.exit(1)
  }
  const miss = imported.filter(([, text]) =>
    !new RegExp(`>\\s*(?:R=)?${want.R}\\s*字`).test(String(text)))
  if (miss.length) {
    console.log(`❌ ④ 运行期抵达：以下提示词**不含**注册表值 R=${want.R} —— ${miss.map(([n]) => n).join(' · ')}`)
    fail++
  }
  // ② K 维：只有 distill 提示词带同级条目上限
  const kOk = new RegExp(`>\\s*${want.K}\\s*条`).test(String(imported.find(([n]) => n.includes('distill'))?.[1] || ''))
  ok(miss.length === 0 && kOk,
    '④ 运行期抵达：`lib/distill.js#DEFAULT_DISTILL_PROMPT` 与 `lib/deepsleep-core.js#DEEP_SLEEP_PROMPT` **运行期**含注册表值（R=' + want.R + (kOk ? ` · K=${want.K}` : '') + '）' +
    (miss.length || !kOk ? ' —— 提示词仍写死或未展开' : ' —— **改注册表即改喂给模型的提示词**'))
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
