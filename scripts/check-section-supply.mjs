// check-section-supply.mjs — 册一机检：**小节地址供给**（docs/pointer-supply-plan.md §3）
//
// 判因（真机取证，方案 §1）：蒸馏 prompt 要求「section = **既有** ## 小节名」，但材料里**从未注入真实清单**
//   ⇒ 模型编名：抽查 5 个典型悬空名在真库 **334** 个两级小节中 **0 命中**；写门据此拒收（先污染、后丢料）。
//
// 本件锁五件：
//   ① **清单条数 == 实测**（独立用 `section-ref#sectionTitles` 数一遍逐例比对；不是自证恒真）；
//   ② 清单里每条地址**都能被读侧解析**（拿真夹具逐条跑 `resolveSection` ⇒ 全 `exists`）；
//   ③ **接线 ≠ 抵达**：直接调用材料装配函数 `buildDistillUserInput`，断言返回文本**含**地址段与其内容；
//   ④ **输入量可见化**：空库 ⇒ 显式「0 条」；预算不足 ⇒ 显式降级标注，且**绝不截断到半行**；
//   ⑤ **深睡侧不叠第二份**（方案 §3-3）：正面断言深睡材料 `currentTreeSections` **已含**同一批小节
//      （把"已有"从假设变成机检事实 —— 这样本件才不必在深睡侧再加一段）。
//
// 反例自证：把 `sectionAddressSupply` 的过滤条件改成"恒返回全部文件"或把 0 条分支的文案删掉
//   ⇒ ①/④ 立刻红（断言不是恒真）。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { sectionAddressSupply, buildDistillUserInput, ADDRESS_SUPPLY_HEADER, addressKeyOf } from '../lib/section-supply.js'
import { sectionTitles, resolveSection } from '../lib/section-ref.js'
import { gatherMaterials } from '../lib/deepsleep-materials.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }

// ── 夹具库（临时目录；**绝不触真库**）──
const root = mkdtempSync(join(tmpdir(), 'sec-supply-'))
mkdirSync(join(root, 'notes'), { recursive: true })
writeFileSync(join(root, 'notes', 'tools.md'), ['# tools', '', '## 甲', '正文甲', '', '### 乙', '正文乙', '', '## 丙', '正文丙', ''].join('\n'), 'utf8')
writeFileSync(join(root, 'notes', 'env.md'), ['# env', '', '## 环境', '正文', '', '### 子环境', '正文', ''].join('\n'), 'utf8')
writeFileSync(join(root, 'notes', 'INDEX.md'), ['## 不该出现', '索引文件不是地址空间'].join('\n'), 'utf8')
// 第三文件：**故意做长**（30 个小节）——让「预算降级」这条断言在夹具上**可达**
// （预算下限 400 字符；小夹具永远放得下 ⇒ 降级分支不可达 = 断言形同虚设，这正是仓内"夹具须能先红"的纪律）
const bigSections = Array.from({ length: 30 }, (_, i) => `## 流程甲组第${String(i + 1).padStart(2, '0')}小节的长名字用于占位\n正文占位`).join('\n\n')
writeFileSync(join(root, 'notes', 'flows.md'), ['# flows', '', bigSections, ''].join('\n'), 'utf8')

const supply = sectionAddressSupply(root, 100000)

// ── ① 条数 == 实测（独立数一遍）──
{
  const want = []
  for (const f of ['tools.md', 'env.md', 'flows.md']) want.push(...(sectionTitles(root, f) || []).filter((t) => t.level === 2 || t.level === 3))
  ok('① 清单条数 == 实测（sectionTitles 独立计数）', supply.sections === want.length, `supply=${supply.sections} 实测=${want.length}`)
  ok('① 文件数正确（INDEX.md 被排除）', supply.files === 3, `files=${supply.files}`)
  ok('① sections 集合不含 INDEX.md 的节', ![...supply.set].some((k) => k.includes('/INDEX.md') || k.startsWith('notes/INDEX.md')))
}

// ── ② 每条地址可被读侧解析（exists）──
{
  const rows = supply.lines.filter((l) => l.startsWith('notes/'))
  const badAddrs = []
  for (const r of rows) {
    for (const m of r.matchAll(/§([^\s§]+)/g)) {
      const name = m[1]
      const file = r.split(' ')[0]
      const res = resolveSection(root, file, name)
      if (res.state !== 'exists') badAddrs.push(`${file}§${name}=${res.state}`)
    }
  }
  ok('② 清单内每条地址读侧可达（exists）', badAddrs.length === 0, badAddrs.slice(0, 3).join(' '))
  ok('② 子节以「父/子」路径列出', supply.lines.some((l) => l.includes('§甲/乙')), supply.lines.find((l) => l.includes('甲')) || '')
}

// ── ③ 接线 ≠ 抵达：材料装配函数真跑一遍 ──
{
  const text = buildDistillUserInput({
    sid: 'session-probe', startSeq: 1, endSeq: 2, totalChunks: 1, index: 1,
    body: '[user] 探针正文', manifest: '', relMemLines: '', candidates: '（无待固化候选）', addressLines: supply.lines,
  })
  ok('③ 材料含地址段标题', text.includes(ADDRESS_SUPPLY_HEADER))
  ok('③ 材料含 fixture 地址（逐字抵达）', text.includes('notes/tools.md §甲') && text.includes('§甲/乙'))
  ok('③ 材料仍含会话正文（未顶掉既有段）', text.includes('探针正文'))
  // 空清单时**段头不消失**（输入量可见化：宁可显式空，不许静默少一段）
  const emptyText = buildDistillUserInput({ sid: 's', startSeq: 1, endSeq: 1, totalChunks: 1, index: 1, body: 'b', manifest: '', relMemLines: '', candidates: 'c', addressLines: [] })
  ok('③ 空清单 ⇒ 段头仍在（不静默消失）', emptyText.includes(ADDRESS_SUPPLY_HEADER))
}

// ── ④ 输入量可见化：空库 / 预算降级 / 不截半行 ──
{
  const empty = mkdtempSync(join(tmpdir(), 'sec-empty-'))
  mkdirSync(join(empty, 'notes'), { recursive: true })
  const s0 = sectionAddressSupply(empty, 100000)
  ok('④ 空库 ⇒ 显式「0 条」（不静默、不冒充）', s0.sections === 0 && s0.set.size === 0 && s0.lines.join('\n').includes('0 条'), s0.summary)
  ok('④ 空库 summary 亦记 0', /0 条/.test(s0.summary))
  rmSync(empty, { recursive: true, force: true })

  const tight = sectionAddressSupply(root, 500)
  ok('④ 预算不足 ⇒ 显式降级标记（degraded=true）', tight.degraded === true, `summary=${tight.summary}`)
  ok('④ 降级时地址集仍按**全量**校验（不因裁剪而少算）', tight.sections === supply.sections, `tight=${tight.sections} full=${supply.sections}`)
  const rows = tight.lines.filter((l) => l.trim())
  const halfLine = rows.find((l) => /[§]\S*$/.test(l) === false && l.startsWith('notes/') === false && !l.startsWith('  └') && !l.startsWith('…（') && !l.startsWith('小节地址清单') && !l.startsWith('（'))
  ok('④ 每行完整（不截断到半行）', !halfLine, halfLine || '')
}

// ── ⑤ 深睡侧「不叠第二份」：正面断言既有材料已含清单 ──
{
  let tree = ''
  try { tree = String(gatherMaterials(root, 0).currentTreeSections || '') } catch (e) { tree = `__ERR__${String(e && e.message || e).slice(0, 60)}` }
  ok('⑤ 深睡材料已含小节清单（无需第二段）', tree.includes('notes/tools.md') && tree.includes('甲'), tree.startsWith('__ERR__') ? tree : tree.split('\n').slice(0, 2).join(' | '))
}

// ── ⑥ 反例自证（判别力）：条数与 key 不是恒真 ──
{
  const keyA = addressKeyOf('notes/tools.md', '甲')
  const keyB = addressKeyOf('notes/tools.md', '甲（2026-08-13）') // coreName 应把尾括号维护元信息剥掉
  ok('⑥ 地址键归一（尾括号元信息不计入）', keyA === keyB, `${keyA} vs ${keyB}`)
  ok('⑥ 归一后仍能区分不同节', addressKeyOf('notes/tools.md', '甲') !== addressKeyOf('notes/tools.md', '丙'))
  ok('⑥ 集合命中判定有判别力（丙在集内 / 丁不在）', supply.set.has(addressKeyOf('notes/tools.md', '丙')) && !supply.set.has(addressKeyOf('notes/tools.md', '丁')))
}

rmSync(root, { recursive: true, force: true })
for (const l of P) console.log(l)
console.log(bad ? `\n❌ check-section-supply: ${bad} 条断言未通过` : '\n✅ check-section-supply: 全绿')
process.exit(bad ? 1 : 0)
