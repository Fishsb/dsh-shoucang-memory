#!/usr/bin/env node
// check-section-ref-parity.mjs — 「小节寻址语义」**跨面差分锁**（S1R · G1，2026-09-19）
//
// 判因（S1 库核心只读复查）：`§小节名 → 小节` 的解析在仓内曾有**四份实现**且对「多命中」处置互不相同
//   （read_section 取首个 / 写门集合去重 / treeops#matchSection 多命中⇒null / memory-append 逐级取首个）
//   ⇒ 同一指针在读侧、写门、材料侧**三种结论**（实测 `notes/env.md §插件注入` 即此例）。
// 收敛后的架构（S1R · D1/D2）：**语义单源、物理多处**——
//   宿主侧 `src/section-ref.ts`（编译产物 `lib/section-ref.js`）与库工具链 `skill/scripts/section-ref.mjs`
//   是同一语义的两份实现（子进程活件**零依赖**、不得 import src/ ⇒ 物理唯一不可达）。
//   ⇒ 正确的不变量不是「只有一份代码」，而是**两侧逐例同结论**，由本件守。
//
// 本件做什么：
//   A 夹具集（≥40 例）在**临时库**上驱动两侧实现，逐例比对 `state / exact / fileExists / cands`
//     （并显式断言一小批**语义契约**期望值 —— 防「两侧一致地错」）
//   B **反例自证**：注入实现级偏差（硬编码 missing / 候选集被截断）⇒ 本件必须检出（否则锁无效）
//   C 报告态打印两侧差异（有差异时逐例给出）
//
// 退出码: 0=PASS  1=FAIL
// 用法: node scripts/check-section-ref-parity.mjs [--json]
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')

// ── 夹具库（临时目录；**绝不触真库**）──
const FIX = {
  'a.md': [
    '# a', '',
    '## 甲', '正文甲',
    '### 乙', '正文乙',
    '#### 丙（更深的四级标题：不属两级检索单元）', '正文丙',
    '#### 四级专名', '仅在四级标题里出现的名字',
    '## 前缀甲乙', 'x',
    '### 后缀甲乙丙', 'x',
    '## 甲（2026-01-02）', '带维护元信息括号的甲',
    '### 尺寸', 'x',
    '## 尺寸与预算', 'x',
    '## 全角　空格', 'x',
    '## Mixed CASE 标题', 'x',
    '## 短', 'x',
    '## 长标题包含短名', 'x',
    '## 重复同名', 'x',
    '### 重复同名', 'x',
    '## 仅半角括号（2026-09-01）', 'x',
    '## 带空白 的 名', 'x',
    '',
  ].join('\n'),
  'b.md': ['# b', '', '## 唯一节', 'x', ''].join('\n'),
  'c.md': ['# c', '', '## 空壳', ''].join('\n'),
}

const CASES = [
  // 精确唯一
  ['a.md', '乙'], ['b.md', '唯一节'], ['a.md', '前缀甲乙'], ['a.md', 'Mixed CASE 标题'],
  // loose 唯一 / 双向包含
  ['a.md', '长标题包含短名'], ['a.md', '包含短名'], ['a.md', '全角　空格'], ['a.md', '全角 空格'],
  // 日期括号归一（全角 / 半角）
  ['a.md', '仅半角括号'], ['a.md', '甲（2026-01-02）'],
  // 歧义（同名 ## / ###；多候选 loose）
  ['a.md', '重复同名'], ['a.md', '甲'], ['a.md', '乙'], ['a.md', '尺寸'],
  // 两级检索单元：#### 不算（丙 仍可经 loose 命中 `后缀甲乙丙`，故另设只在四级出现的名字）
  ['a.md', '四级专名'], ['a.md', '专名'], ['a.md', '后缀甲乙丙'], ['a.md', '尺寸与预算'], ['a.md', '预算'],
  ['a.md', '丙'],
  // 空白归一 / 空名
  ['a.md', '带空白 的 名'], ['a.md', '带空白的名'], ['a.md', ''], ['a.md', '   '], ['', '乙'],
  ['a.md', '甲 （2026-01-02）'], ['a.md', '全角　空格（2026-01-02）'], ['a.md', 'mixed case 标题'],
  ['a.md', '长度'], ['c.md', '空壳'],
  // 缺失
  ['a.md', '不存在的节'], ['c.md', '不存在的节'],
  // 文件面
  ['nosuch.md', '唯一节'], ['notes/INDEX.md', '唯一节'], ['INDEX.md', '唯一节'],
  ['../etc/passwd', '唯一节'], ['notes/../a.md', '乙'], ['a.txt', '唯一节'], ['notes/a.md', '乙'], ['notes/a.md', '甲'],
  // 前缀写法容错
  ['b.md', '唯一'], ['b.md', '一'], ['b.md', '唯一节的全部'], ['b.md', '唯一节的'],
]

/** 语义契约：这些例子必须给出**指定**结论（防两侧一致地错） */
const EXPECT = [
  [['a.md', '重复同名'], 'ambiguous'],
  [['a.md', '甲'], 'ambiguous'],
  [['a.md', '乙'], 'exists'],
  [['a.md', '前缀甲乙'], 'exists'],
  [['a.md', '四级专名'], 'missing'],
  [['a.md', '后缀甲乙丙'], 'exists'],
  [['a.md', '全角　空格（2026-01-02）'], 'exists'],
  [['a.md', '不存在的节'], 'missing'],
  [['a.md', ''], 'missing'],
  [['nosuch.md', '唯一节'], 'missing'],
  [['notes/INDEX.md', '唯一节'], 'missing'],
  [['b.md', '唯一'], 'exists'],
]

const TMP = mkdtempSync(join(tmpdir(), 'sc-secref-'))
mkdirSync(join(TMP, 'notes'), { recursive: true })
for (const [k, v] of Object.entries(FIX)) writeFileSync(join(TMP, 'notes', k), v, 'utf8')

const sig = (r) => JSON.stringify({
  state: r.state, exact: r.exact, fileExists: r.fileExists,
  cands: (r.cands || []).map((c) => [c.title, c.level, c.idx]),
})

let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

console.log('小节寻址跨面差分锁（src/section-ref.ts ↔ skill/scripts/section-ref.mjs）')
let ts, mjs
try {
  ts = await import(pathToFileURL(join(root, 'lib', 'section-ref.js')).href)
  mjs = await import(pathToFileURL(join(root, 'skill', 'scripts', 'section-ref.mjs')).href)
} catch (e) {
  console.error(`❌ 无法加载实现: ${e.message}（TS 侧需先 npm run build:host）`)
  process.exit(1)
}

/** 比对器：两个 resolveSection 实现逐例比对（可注入"故障实现"以做反例自证） */
function compare(tsFn, mjsFn, cases) {
  const diffs = []
  for (const [file, name] of cases) {
    let a, b
    try { a = tsFn(TMP, file, name) } catch (e) { a = { state: 'ERR', err: String(e && e.message) } }
    try { b = mjsFn(TMP, file, name) } catch (e) { b = { state: 'ERR', err: String(e && e.message) } }
    if (sig(a) !== sig(b)) diffs.push({ file, name, ts: sig(a), mjs: sig(b) })
  }
  return diffs
}

// ── A 差分 + 语义契约 ──
const diffs = compare(ts.resolveSection, mjs.resolveSection, CASES)
ok(CASES.length >= 40, `夹具用例数 ${CASES.length} ≥ 40`)
ok(diffs.length === 0, `两侧逐例同结论（差异 ${diffs.length} / ${CASES.length} 例）`)
for (const d of diffs.slice(0, 10)) console.log(`   ⚠ ${d.file} §${d.name}  TS=${d.ts}  MJS=${d.mjs}`)

let expectFail = 0
for (const [[file, name], want] of EXPECT) {
  const a = ts.resolveSection(TMP, file, name)
  const b = mjs.resolveSection(TMP, file, name)
  if (a.state !== want || b.state !== want) {
    expectFail++
    console.log(`   ⚠ 契约不符 ${file} §${name}: 期望 ${want} · TS=${a.state} · MJS=${b.state}`)
  }
}
ok(expectFail === 0, `语义契约 ${EXPECT.length} 例（state 期望逐条命中）`)

// ── A2 一行多指针：pointersOfRow / admitIndexRow 两侧同结论 ──
const ROW_CASES = [
  '[原则] 甲 · 说明 → notes/a.md §乙/notes/b.md §唯一节',
  '[env] 甲 · 说明 → notes/a.md §甲/§重复同名',
  '[env] 甲 · 说明 → notes/a.md §不存在的节',
  '[env] 甲 · 说明 → notes/a.md §重复同名',
  '[env] 甲 · 说明 → notes/b.md',
  '[env] 甲 · 说明 → notes/nosuch.md §无',
]
let rowDiff = 0
for (const row of ROW_CASES) {
  const a = sig({ state: JSON.stringify(ts.admitIndexRow(TMP, row)), exact: false, fileExists: true, cands: [] })
  const b = sig({ state: JSON.stringify(mjs.admitIndexRow(TMP, row)), exact: false, fileExists: true, cands: [] })
  if (a !== b) { rowDiff++; console.log(`   ⚠ 行准入不一致: ${row}`) }
}
ok(rowDiff === 0, `索引行准入 ${ROW_CASES.length} 例（含一行两指针 / §A/§B 并列）两侧一致`)

// ── A3 准入**收口**（2026-09-19 · 真库实测病灶）──────────────────────────────
//   病灶形状（实证，见 `docs/OPEN-ITEMS.md` §11-d）：`§npm 失效与残留 shim 修复/junction 装配漂移`
//   —— **父节在、子节没落地**（同批 append 失败，同轮 `failedItems k=append`），而旧策略
//   「partial 一律放行」把它写成了**孤儿指针**（真库 `check-section-refs` partial 0→1 翻红）。
//   ⚠ **先红**：收口前第一条断言为红（ok=true）；收口后 `missing` 里应带**末段名**（可诊断、不静默）。
{
  const ROW_LAST = '[env] 甲 · 说明 → notes/a.md §甲/不存在的节'
  const ROW_MID = '[env] 甲 · 说明 → notes/a.md §不存在的节/乙'
  const last = ts.admitIndexRow(TMP, ROW_LAST)
  const lastM = mjs.admitIndexRow(TMP, ROW_LAST)
  const mid = ts.admitIndexRow(TMP, ROW_MID)
  ok(last.ok === false && last.missing.some((m) => m.name === '不存在的节'),
    'A3 末段缺失 ⇒ **拒写**（末段名进 missing，可诊断）')
  ok(lastM.ok === false, 'A3 孪生 `skill/scripts/section-ref.mjs` 同结论（末段缺失 ⇒ 拒写）')
  ok(mid.ok === true && mid.partial.length === 1,
    'A3 中段缺失 ⇒ **仍放行**（读侧可回落最深可解析段，partial 留痕）')
  ok(JSON.stringify(last.partial).length > 2, 'A3 拒写时 partial 明细仍在（不静默丢诊断信息）')
}

// ── B 反例自证：注入实现级偏差 ⇒ 必须检出 ──
const wrongHard = () => ({ state: 'missing', exact: false, cands: [], fileExists: true })
ok(compare(ts.resolveSection, wrongHard, CASES).length > 0, '反例自证①：硬编码 missing ⇒ 差分锁检出')
const wrongCands = (r, f, n) => { const x = mjs.resolveSection(r, f, n); return { ...x, cands: x.cands.slice(0, 1) } }
ok(compare(ts.resolveSection, wrongCands, CASES).length > 0, '反例自证②：候选集被截断 ⇒ 差分锁检出')
const wrongExact = (r, f, n) => ({ ...mjs.resolveSection(r, f, n), exact: false })
ok(compare(ts.resolveSection, wrongExact, CASES).length > 0, '反例自证③：exact 标志被抹平 ⇒ 差分锁检出')

// ── B2 **历史分歧复现**（本锁的"先红"证据）：改造前两侧对「多命中」的处置相反 ──
//   旧 TS 侧 = `treeops#matchSection`（多命中 ⇒ null ⇒ 判不存在）；
//   旧 mjs 侧 = 写门 `listSections`（标题集去重 ⇒ 任一命中 ⇒ 判存在）。
//   ⇒ 本锁若在当时存在，必然当场翻红。这里以可复现的形式把那条分歧固化下来。
const legacyTs = (r, f, n) => { const x = ts.resolveSection(r, f, n); return x.state === 'ambiguous' ? { ...x, state: 'missing', exact: false, cands: [] } : x }
const legacyMjs = (r, f, n) => { const x = mjs.resolveSection(r, f, n); return x.state === 'missing' ? x : { ...x, state: 'exists' } }
const legacyDiffs = compare(legacyTs, legacyMjs, CASES)
ok(legacyDiffs.length > 0, `先红证据：旧两实现（多命中⇒判不存在 ↔ 任一命中⇒判存在）在本夹具上分歧 ${legacyDiffs.length} 例 ⇒ 本锁对历史分歧有效`)
for (const d of legacyDiffs.slice(0, 3)) console.log(`   · 分歧样例 ${d.file} §${d.name}  旧TS=${d.ts}  旧MJS=${d.mjs}`)

rmSync(TMP, { recursive: true, force: true })
console.log(fail ? `\nFAIL（${fail} 项）` : `\nPASS（夹具 ${CASES.length} 例 + 契约 ${EXPECT.length} 例 + 准入 ${ROW_CASES.length} 例 + 反例 3 组）`)
if (AS_JSON) console.log(JSON.stringify({ cases: CASES.length, diffs: diffs.length, fail }))
process.exit(fail ? 1 : 0)
