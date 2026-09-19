// check-pointer-content.mjs — 册二机检（第二件）：**内容存在性**（地址背后是否真有知识）
//
// 判因（方案 §2.2 最重要的一条认识，两条实测形态）：
//   **准入只能保证「地址有效」，不能保证「地址下有知识」**——
//   ① 半落（写入时）：append 失败 ⇒ 行照写；且指针指向**真实存在且合法**的小节 ⇒ 该行背后什么都没有；
//   ② 空壳落点（跨批 / 重指时，**已在真库发生**）：行落在**存在但正文 0 非空行**的小节上。
//   ⇒ 这解释了「棘轮全绿」与「指针指向空处」为何能并存：**现有全部机检都在测地址空间（名字能否解析），
//     没有一条在测「地址背后是否真有内容」**。本件补这条空白面。
//
// ⚠ **判据只做确定性判定**（正文非空），**不做语义/词面相似度**：
//   第一版词面代理（行主题词 ∩ 小节正文实词 ≥1）真库读数 **405/551 = 73.5% 疑似**，
//   抽验 `§网络坑`(1812 字) / `§DSH 环境`(16084 字) 等**内容充沛的宽节全被判疑似** ⇒ 代理在真数据上失效，已弃用。
//
// 态（**基线 2026-09-19 由 4 收紧为 0**）：原缺省报告态是因为「3 个空壳的处置属**用户拍板**项（方案 §2.3 待决项）」；
//   该待决项**已处置完毕**（4 行逐条重指 + 4 个空壳 `treeops#merge` 结构性消除）⇒ 基线钉 0，
//   并新增「**全库空壳标题**（不论有无引用）」一并按 0 判（空壳标题本身是"下次被误指进去"的诱因）。
//
// **单一实现**：扫描全部来自 `lib/pointer-deficits.js`（`pointerStats`/`scanEmptySections`）——
//   判据件**不再自带第二份扫描**（运行时周期巡检 `registerDeficits` 用的是同一函数）。
//
// 用法：node scripts/check-pointer-content.mjs [--strict] [--json] [--root <bankRoot>]
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { memoryLibRoot } from '../lib/targets.js'
import { pointerStats, scanEmptySections, scanEmptyLandings } from '../lib/pointer-deficits.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')
const STRICT = process.argv.includes('--strict')
const argRoot = (() => { const i = process.argv.indexOf('--root'); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null })()
/** 真库实测基线（**2026-09-19 处置后收紧为 0**）：空壳落点 0 / 全库空壳标题 0。**只许收紧**。 */
export const BASELINE_EMPTY = 0

// ── 阴性对照 + 反例自证（夹具库；**绝不触真库**）──
const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }
{
  const fix = mkdtempSync(join(tmpdir(), 'ptr-content-'))
  mkdirSync(join(fix, 'notes'), { recursive: true })
  writeFileSync(join(fix, 'notes', 'a.md'), [
    '# a', '',
    '## 有内容节', '正文一行', '正文两行', '',
    '## 真空壳节', '',
    '## 父节仅有子节', '',
    '### 子节有内容', '子节正文一行', '',
    '## 宽节（正文充沛）', ...Array.from({ length: 20 }, (_, i) => `宽节正文第 ${i + 1} 行`), '',
  ].join('\n'), 'utf8')
  writeFileSync(join(fix, 'MEMORY.md'), [
    '- [env] 有内容 · 概况/短语 → notes/a.md §有内容节',
    '- [env] 空壳探针 · 概况/短语 → notes/a.md §真空壳节',
    '- [env] 父节空但子节有内容探针 · 概况/短语 → notes/a.md §父节仅有子节',
    '- [env] 宽节但**主题与正文毫无词面交集** · 概况/短语 → notes/a.md §宽节（正文充沛）',
    '- [env] 悬空探针 · 概况/短语 → notes/a.md §根本不存在的节',
    '',
  ].join('\n'), 'utf8')
  const st = pointerStats(fix)
  const empty = scanEmptyLandings(fix)
  ok('① 阴性对照：只报真空壳落点 1 条（零误报）', empty.length === 1 && empty[0].ref.includes('真空壳节'), JSON.stringify(empty.map((e) => e.ref)))
  ok('① 口径边界：父节空、子节有内容 ⇒ **不算**空壳（判据是正文区间非空，非"本节直接正文非空"）', !empty.some((e) => e.ref.includes('父节仅有子节')))
  ok('① 悬空指针**不进**空壳清单（由 check-section-refs 棘轮另守）', st.unresolvable === 1 && empty.length === 1, `unresolvable=${st.unresolvable}`)
  const es = scanEmptySections(fix)
  ok('③ 全库空壳标题：夹具恰 1 个（真空壳）', es.length === 1 && es[0].ref.includes('真空壳节'), JSON.stringify(es.map((e) => e.ref)))
  ok('③ 全库空壳标题：父节空但子节有内容**不计**（口径与落点判据同源）', !es.some((e) => e.ref.includes('父节仅有子节')))
  ok('② 反例自证：**无词面交集**但正文充沛的宽节**不得**被报（判据非词面代理）', !empty.some((e) => e.ref.includes('宽节')))
  ok('② 指针/行计数可见（输入量可见化）', st.pointers === 5 && st.rows === 5, `pointers=${st.pointers} rows=${st.rows}`)
  rmSync(fix, { recursive: true, force: true })
}

// ── 真库读数（不可读 ⇒ 显式跳过，不冒充 0）──
const bank = argRoot || memoryLibRoot()
let real = null
if (existsSync(join(bank, 'MEMORY.md'))) real = pointerStats(bank)
const summary = real
  ? { bank, pointers: real.pointers, rows: real.rows, empty: real.emptyLandings.length, emptySections: new Set(real.emptyLandings.map((e) => e.ref)).size, unresolvable: real.unresolvable, bankEmptyShells: real.emptySections.length, baseline: BASELINE_EMPTY }
  : { bank, skipped: true, reason: '库不可读或 MEMORY.md 缺席' }

if (AS_JSON) console.log(JSON.stringify({ checks: P, real: summary, bankEmptyShells: real ? real.emptySections : [] }, null, 1))
else {
  for (const l of P) console.log(l)
  console.log(`\n真库报告（${summary.bank}）：${summary.skipped ? `**跳过**（${summary.reason}）` : `指针 ${summary.pointers} · 含指针行 ${summary.rows} · **空壳落点 ${summary.empty}（去重 ${summary.emptySections} 小节）** · 悬空 ${summary.unresolvable} · **全库空壳标题 ${summary.bankEmptyShells}** · 基线 ${summary.baseline}`}`)
  if (real) for (const e of real.emptyLandings) console.log(`  · 空壳落点: ${e.ref} ← ${e.detail}`)
  if (real) for (const e of real.emptySections) console.log(`  · 全库空壳标题: ${e.ref}（${e.detail}）`)
  console.log(real && !STRICT ? 'ℹ 报告态：不判失败（`--strict` 才按基线判回归）' : '')
}
const violateShells = STRICT && real && summary.bankEmptyShells > 0
const violate = (STRICT && real && summary.empty > BASELINE_EMPTY) || violateShells
if (violateShells) console.log(`\n❌ 全库空壳标题 ${summary.bankEmptyShells} > 0 ⇒ 存在空壳（本类缺陷已收口，回归即红）`)
else if (STRICT && real && summary.empty > BASELINE_EMPTY) console.log(`\n❌ 空壳落点 ${summary.empty} > 基线 ${BASELINE_EMPTY} ⇒ **新增**空壳落点（回归）`)
console.log(bad ? `\n❌ check-pointer-content: ${bad} 条断言未通过` : `\n✅ check-pointer-content: 断言全绿${violate ? '（但 strict 基线判红）' : ''}`)
process.exit(bad || violate ? 1 : 0)
