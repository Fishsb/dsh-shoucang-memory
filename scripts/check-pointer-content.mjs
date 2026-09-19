// check-pointer-content.mjs — 册二机检（第二件）：**内容存在性**（地址背后是否真有知识）
//
// 判因（方案 §2.2 最重要的一条认识，两条实测形态）：
//   **准入只能保证「地址有效」，不能保证「地址下有知识」**——
//   ① 半落（写入时）：append 失败 ⇒ 行照写；且指针指向**真实存在且合法**的小节 ⇒ 该行背后什么都没有；
//   ② 空壳落点（重指时，**已在真库发生**）：行被重指到**存在但正文 0 非空行**的小节。
//   ⇒ 这解释了「棘轮全绿」与「指针指向空处」为何能并存：**现有全部机检都在测地址空间（名字能否解析），
//     没有一条在测「地址背后是否真有内容」**。本件补这条空白面。
//
// ⚠ **判据只做确定性判定**（正文非空），**不做语义/词面相似度**：
//   第一版词面代理（行主题词 ∩ 小节正文实词 ≥1）真库读数 **405/551 = 73.5% 疑似**，
//   抽验 `§网络坑`(1812 字) / `§DSH 环境`(16084 字) 等**内容充沛的宽节全被判疑似** ⇒ 代理在真数据上失效，已弃用。
//   ⇒ 本件**不含**任何词面判据（反例自证：夹具里"主题与行毫无词面交集的宽节"必须**不**被报）。
//
// 态（遵守方案 §9 步 4 的耦合约束）：**缺省报告态**（exit 0，打印清单）；`--strict` 才在
//   **数量 > 基线** 时红（= 出现**新增**空壳 ⇒ 回归）。基线 **4 条 / 3 小节**（真库实测，方案 §2.3）。
//   ⚠ 基线**不**下调：那 3 个空壳的处置（回填/重指/废弃）属**用户拍板**项（方案 §2.3 待决项），
//     本件**不自行处置**、也不锁死待决项。
//
// 用法：node scripts/check-pointer-content.mjs [--strict] [--json] [--root <bankRoot>]
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { pointersOfRow, resolveSectionSpec, sectionTitles } from '../lib/section-ref.js'
import { memoryLibRoot } from '../lib/targets.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')
const STRICT = process.argv.includes('--strict')
const argRoot = (() => { const i = process.argv.indexOf('--root'); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null })()
/** 真库实测基线（方案 §2.3）：空壳落点 4 条 / 去重 3 小节。**只许收紧**，下调须等 §2.3 待决项拍板。 */
export const BASELINE_EMPTY = 4

/** 小节正文 = 标题后到**下一个同级或更高级**标题之间的非空行数（确定性口径） */
const bodyNonEmptyLines = (absFile, titleIdx, level) => {
  let lines = []
  try { lines = readFileSync(absFile, 'utf8').split(/\r?\n/) } catch { return null }
  let n = 0
  for (let i = titleIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{2,6})[ \t]+/)
    if (m && m[1].length <= level) break
    if (lines[i].trim()) n++
  }
  return n
}

/** 扫描主档里的指针行 → 落点小节 → 正文是否为空壳（纯确定性） */
export function scanContent(bankRoot) {
  const mainFiles = ['MEMORY.md', 'AGENT.md', 'USER.md']
  const out = { pointers: 0, rows: 0, empty: [], unresolvable: [], noContentCheck: 0 }
  for (const mf of mainFiles) {
    const p = join(bankRoot, mf)
    if (!existsSync(p)) continue
    let text = ''
    try { text = readFileSync(p, 'utf8') } catch { continue }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || !line.includes('→')) continue
      const ptrs = pointersOfRow(line)
      if (!ptrs.length) continue
      out.rows++
      for (const ptr of ptrs) {
        out.pointers++
        const { agg, parts } = resolveSectionSpec(bankRoot, ptr.file, ptr.spec)
        // 读侧回落语义：取**最后一个可解析**的部分作为落点；全不可解析 ⇒ 计入 unresolvable（另行可见）
        const okParts = parts.filter((x) => x.res.state === 'exists')
        if (agg === 'missing' || !okParts.length) { out.unresolvable.push(`${mf}: notes/${ptr.file}§${ptr.spec}`); continue }
        const landing = okParts[okParts.length - 1]
        const titles = sectionTitles(bankRoot, ptr.file) || []
        const t = titles.find((x) => x.idx === landing.res.cands[0].idx)
        if (!t) { out.noContentCheck++; continue }
        const n = bodyNonEmptyLines(join(bankRoot, 'notes', String(ptr.file).replace(/^notes\//, '')), t.idx, t.level)
        if (n === null) { out.noContentCheck++; continue }
        if (n === 0) out.empty.push({ main: mf, file: `notes/${ptr.file}`, section: t.title, level: t.level, row: line.trim().slice(0, 100) })
      }
    }
  }
  return out
}

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
  const r = scanContent(fix)
  ok('① 阴性对照：只报真空壳 1 条（零误报）', r.empty.length === 1 && r.empty[0].section === '真空壳节', JSON.stringify(r.empty.map((e) => e.section)))
  ok('① 口径边界：父节空、子节有内容 ⇒ **不算**空壳（判据是正文区间非空，非"本节直接正文非空"）', !r.empty.some((e) => e.section === '父节仅有子节'), JSON.stringify(r.empty.map((e) => e.section)))
  ok('① 悬空指针单列（不混进空壳）', r.unresolvable.length === 1 && r.unresolvable[0].includes('根本不存在的节'), JSON.stringify(r.unresolvable))
  ok('② 反例自证：**无词面交集**但正文充沛的宽节**不得**被报（判据非词面代理）', !r.empty.some((e) => e.section.includes('宽节')), JSON.stringify(r.empty.map((e) => e.section)))
  ok('② 指针/行计数可见（输入量可见化）', r.pointers === 5 && r.rows === 5, `pointers=${r.pointers} rows=${r.rows}`)
  rmSync(fix, { recursive: true, force: true })
}

// ── 真库报告态（不可读 ⇒ 显式跳过，不冒充 0）──
const bank = argRoot || memoryLibRoot()
let real = null
if (existsSync(join(bank, 'MEMORY.md'))) real = scanContent(bank)
const summary = real
  ? { bank, pointers: real.pointers, rows: real.rows, empty: real.empty.length, emptySections: new Set(real.empty.map((e) => `${e.file}§${e.section}`)).size, unresolvable: real.unresolvable.length, baseline: BASELINE_EMPTY }
  : { bank, skipped: true, reason: '库不可读或 MEMORY.md 缺席' }

if (AS_JSON) console.log(JSON.stringify({ checks: P, real: summary }, null, 1))
else {
  for (const l of P) console.log(l)
  console.log(`\n真库报告（${summary.bank}）：${summary.skipped ? `**跳过**（${summary.reason}）` : `指针 ${summary.pointers} · 含指针行 ${summary.rows} · **空壳落点 ${summary.empty}（去重 ${summary.emptySections} 小节）** · 悬空 ${summary.unresolvable} · 基线 ${summary.baseline}`}`)
  if (real && real.empty.length) for (const e of real.empty) console.log(`  · 空壳: ${e.file} §${e.section} ← ${e.main}（${e.row}）`)
  if (real && real.unresolvable.length) console.log(`  （悬空指针 ${real.unresolvable.length} 条：由 check-section-refs 棘轮另守）`)
  console.log(real && !STRICT ? 'ℹ 报告态：不判失败（方案 §9 步 4 与 §2.3 待决项耦合；`--strict` 才按基线判回归）' : '')
}
const violate = STRICT && real && real.empty.length > BASELINE_EMPTY
if (violate) console.log(`\n❌ 空壳落点 ${real.empty.length} > 基线 ${BASELINE_EMPTY} ⇒ **新增**空壳（回归）`)
console.log(bad ? `\n❌ check-pointer-content: ${bad} 条断言未通过` : `\n✅ check-pointer-content: 断言全绿${violate ? '（但 strict 基线判红）' : ''}`)
process.exit(bad || violate ? 1 : 0)
