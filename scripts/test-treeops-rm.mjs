#!/usr/bin/env node
// test-treeops-rm.mjs — treeOps **rename / merge** 断言契约（G-18）
//
// 背景（2026-09-12 可靠性审查）：`test-treeops-split.mjs` 只覆盖 split（8 处 action 全 'split'），
//   而 `src/treeops.ts` 里 rename 与 merge **都已实装约 90 行**（rename 成功路径 + 3 条 skipped 归档、
//   merge 成功路径 + 4 条 skipped 归档），断言覆盖为 0。本件补上这一片。
//
// 契约（R1–R6 / M1–M6），逐条对齐实现：
//   R1 rename 成功：标题改、正文不变、applied=1
//   R2 rename 层级标记保留：`### 丙` ⇒ `### 丙新`（markerLen），不得升/降为 `##`
//   R3 rename 只认 L2/L3：`#### 丁`（L4）不在 scope ⇒ skipped（本件**锁定**该口径）
//   R4 rename 同层同名冲突 ⇒ skipped **且文件字节不变**（回滚不落盘）
//   R5 rename 幂等：重复同 op ⇒ no-op（applied=0/skipped=1，内容不变），**但归档仍 +1**
//      ⇒ 陷阱：归档**先于** no-op 判定，故**禁止**写 `archived === applied`（幂等用例下会假 FAIL）
//   R6 rename 成功归档同时带 `headingOriginal` 与 `headingNew`（只断言「含原标题」不够）
//   M1 merge 成功：drop 标题消失、keep 保留、applied=1
//   M2 merge 精确去重：drop 中与 keep **字面完全相同**的行不重复追加
//   M3 merge 并入位置在 keep **原有正文之后**（keep 原正文尾部，下一同级/更高标题之前）
//   M4 merge 非叶子跳过时，归档里 **keepSection 与 dropSection 两个原文都必须在**
//   M5 merge 模糊同义行**不去重**（字面不同即保留两条语义相近的行）
//   M6 merge skip 分支：keep=drop 同一小节 / keep 未找到或歧义 / drop 未找到或歧义 / notes 文件缺失
//
// 防「假绿」的两条硬约束（本件自身必须满足）：
//   ① **非空性**：每条「文件未变」断言，必须同时证明「若真执行了，内容本会变」（否则"未变"是空断言）；
//      每条 skip 断言，必须同时断言**归档里的 reason 精确匹配**（否则可能是被别的分支跳过）。
//   ② **反向证伪**：逐条破坏 rename/merge 的 skip 判定，本件必须 FAIL；恢复后 PASS（见文件末尾说明）。
//
// 本件**明确未覆盖**（不假装覆盖，避免又一份假绿）：
//   - gate 拒路径：玩具库里 `memory_write_gate.mjs` 恒不存在 ⇒ gate='absent' 分支天然走不到
//   - `atomicWrite` 落盘失败路径、归档目录不可建路径
//   - 索引指针改写（MEMORY/USER/AGENT）：本件不建索引文件，故 rewriteOneIndex 恒 return 0
//   - **L4（####）口径不一致 ⇒ G-22**：rename 侧 scope 过滤成 L2/L3（R3 锁定"不匹配 L4"）；
//     merge 侧 `matchSection(sections, …)` 用**全 sections**，L4 可被匹配。两侧口径不一致。
//     本件用 **xfail 双向锁**（M6-e）：未修期间判 XFAIL（不算通过、不用 ✅ 图标），
//     行为一旦变化判 XPASS 并计入 FAIL ⇒ 既不制造永久红灯，也不把缺陷正当化成绿。
//
// 用法: node scripts/test-treeops-rm.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyTreeOps } from '../lib/treeops.js'

// 玩具库：甲/乙 为 L2 叶子；树干/另一树干 为 L2 非叶子；丙 为 L3 叶子；丁 为 L4
const NOTE = `# notes/lessons.md — G-18 玩具

## 甲
- 甲独有行 A
- 记忆需周期性梳理
- 共有行（甲与乙完全相同）

## 乙
- 乙独有行 B
- 记忆要定期整理
- 共有行（甲与乙完全相同）

## 树干
- 树干正文
### 树干的子
- 子正文

## 另一树干
- 另一树干正文
### 另一树干的子
- 另一子正文

## 丙容器
### 丙
- 丙正文

## 戊容器
#### 丁
- 丁正文
`

const P = []
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); return cond }

// ── xfail（双向锁）：给「已知缺陷、暂不修」的契约断言用 ────────────────────────
// 为什么不是 skipped：skipped 会把未修的缺陷**正当化成绿**（archi 明确反对，team-lead 背书）。
// 为什么不是让它红着：永久红灯的下场是所有人学会无视它 ⇒ **等于把假绿换成假红**，同一个病换个位置。
// 所以两条路都判 FAIL，只有中间那条「缺陷仍在、且我们知道它在」才接受：
//   · 断言 FAIL ⇒ XFAIL（接受）：缺陷未修，打印 ⚠（**不用 ✅**，否则一眼扫过去像全绿）
//   · 断言 PASS ⇒ XPASS（**判 FAIL**）：行为变了 ⇒ 缺陷需重审，不许悄悄绿
// 缺任何一个方向都不成立：只有"FAIL 也接受"等于 skipped；只有"PASS 判 FAIL"等于永久红灯。
const XF = []
const xfail = (name, cond, meta) => {
  if (!cond) {
    P.push(`⚠ XFAIL（${meta.tag} 未修）  ${name} — ${meta.reason}`)
    XF.push('xfail')
    return false
  }
  P.push(`❌ XPASS（意外通过：${meta.tag} 行为已变，需重审，不得悄悄绿）  ${name} — ${meta.reason}`)
  XF.push('xpass')
  return true
}
const roots = []

/** 每个用例一个全新玩具库，避免用例间顺序耦合 */
const mk = () => {
  const root = mkdtempSync(join(tmpdir(), 'treeops-rm-'))
  mkdirSync(join(root, 'notes'), { recursive: true })
  writeFileSync(join(root, 'notes', 'lessons.md'), NOTE, 'utf8')
  roots.push(root)
  return root
}
const noteOf = (root) => join(root, 'notes', 'lessons.md')
const readNote = (root) => readFileSync(noteOf(root), 'utf8')
const archDir = (root) => join(root, 'audit', 'treeops')
/** 归档记录（本用例内全部记录） */
const recs = (root) => {
  const d = archDir(root)
  if (!existsSync(d)) return []
  const out = []
  for (const f of readdirSync(d).filter((x) => x.endsWith('.jsonl'))) {
    for (const l of readFileSync(join(d, f), 'utf8').trim().split('\n')) { if (l.trim()) { try { out.push(JSON.parse(l)) } catch { /* */ } } }
  }
  return out
}
const hooks = () => ({ audit: () => {}, log: () => {} })

// ── R1 rename 成功 ─────────────────────────────────────────────────────────
{
  const root = mk()
  const before = readNote(root)
  const r = await applyTreeOps(root, [{ action: 'rename', file: 'lessons.md', oldTitle: '甲', newTitle: '甲新' }], hooks())
  const after = readNote(root)
  ok('R1 rename 成功 applied=1/skipped=0', r.applied === 1 && r.skipped === 0, `applied=${r.applied} skipped=${r.skipped}`)
  ok('R1 新标题落盘', after.includes('## 甲新'))
  ok('R1 旧标题已消失', !after.includes('## 甲\n'))
  ok('R1 正文不变（甲独有行 A 仍在）', after.includes('- 甲独有行 A') && after.includes('- 共有行（甲与乙完全相同）'))
  ok('R1 非空性：内容确实变了（否则"改成功"是空断言）', after !== before)
}

// ── R2 层级标记保留（markerLen）────────────────────────────────────────────
{
  const root = mk()
  const r = await applyTreeOps(root, [{ action: 'rename', file: 'lessons.md', oldTitle: '丙', newTitle: '丙新' }], hooks())
  const after = readNote(root)
  ok('R2 L3 改名后仍是 L3（### 丙新）', r.applied === 1 && after.includes('### 丙新'), `applied=${r.applied}`)
  // 注意：用正则而非 includes——`includes('## 丙新')` 会被 `### 丙新` 命中（子串），是假断言
  ok('R2 未被升降为 L2（不存在独立的 ## 丙新 标题行）', !/(^|\n)## 丙新(\n|$)/.test(after))
}

// ── R3 rename 只认 L2/L3：L4 不匹配 ────────────────────────────────────────
{
  const root = mk()
  const before = readNote(root)
  const r = await applyTreeOps(root, [{ action: 'rename', file: 'lessons.md', oldTitle: '丁', newTitle: '丁新' }], hooks())
  const a = recs(root)
  ok('R3 L4（#### 丁）不在 rename scope ⇒ skipped', r.applied === 0 && r.skipped === 1, `applied=${r.applied} skipped=${r.skipped}`)
  ok('R3 精确 reason=标题未找到或匹配歧义（防止被别的分支跳过）',
    a.some((x) => x.action === 'rename' && x.outcome === 'skipped' && x.reason === '标题未找到或匹配歧义'),
    JSON.stringify(a.map((x) => x.reason)))
  ok('R3 文件字节不变', readNote(root) === before)
  ok('R3 非空性：目标标题原本存在（否则"未找到"是空断言）', before.includes('#### 丁'))
}

// ── R4 同层同名冲突 ⇒ skipped 且字节不变（team-lead 点名坑位）──────────────
{
  const root = mk()
  const before = readNote(root)
  const r = await applyTreeOps(root, [{ action: 'rename', file: 'lessons.md', oldTitle: '甲', newTitle: '乙' }], hooks())
  const a = recs(root)
  const rec = a.find((x) => x.outcome === 'skipped')
  ok('R4 同层同名冲突 ⇒ skipped（不落盘）', r.applied === 0 && r.skipped === 1, `applied=${r.applied} skipped=${r.skipped}`)
  ok('R4 精确 reason=同层同名双向包含冲突（回滚不落盘）', rec && rec.reason === '同层同名双向包含冲突（回滚不落盘）', rec && rec.reason)
  ok('R4 **文件字节不变**（核心坑位：只断言 skipped=1 会漏掉真落盘）', readNote(root) === before)
  ok('R4 冲突归档同时带 headingOriginal 与 headingNew', rec && typeof rec.headingOriginal === 'string' && typeof rec.headingNew === 'string',
    rec && `orig=${rec.headingOriginal} new=${rec.headingNew}`)
  ok('R4 非空性：newHeading 与原标题不同（否则"未变"是空断言）', rec && rec.headingOriginal !== rec.headingNew)
}

// ── R5 幂等 + 归档先于 no-op（陷阱锁）───────────────────────────────────────
{
  const root = mk()
  const r1 = await applyTreeOps(root, [{ action: 'rename', file: 'lessons.md', oldTitle: '甲', newTitle: '甲新' }], hooks())
  const after1 = readNote(root)
  const arch1 = recs(root).length
  const r2 = await applyTreeOps(root, [{ action: 'rename', file: 'lessons.md', oldTitle: '甲', newTitle: '甲新' }], hooks())
  const arch2 = recs(root).length
  ok('R5 第二次 no-op（applied=0/skipped=1）', r1.applied === 1 && r2.applied === 0 && r2.skipped === 1,
    `first=${r1.applied} second=${r2.applied}/${r2.skipped}`)
  ok('R5 内容不再变化', readNote(root) === after1)
  ok('R5 **归档仍 +1**：归档先于 no-op 判定 ⇒ 禁止写 archived===applied', arch2 > arch1, `arch ${arch1}→${arch2}`)
}

// ── R6 成功归档字段完整性 ──────────────────────────────────────────────────
{
  const root = mk()
  await applyTreeOps(root, [{ action: 'rename', file: 'lessons.md', oldTitle: '甲', newTitle: '甲新' }], hooks())
  // 限定**已定位到小节**的成功分支（!x.outcome）：未定位（文件缺失/标题未找到/冲突）的归档记录
  //   没有 headingOriginal/headingNew，若不限定，后人会补出永远红的断言（archi 2026-09-12 指出）
  const rec = recs(root).find((x) => x.action === 'rename' && !x.outcome)
  ok('R6 成功归档存在', !!rec)
  ok('R6 带 headingOriginal（原标题行原文）', rec && rec.headingOriginal === '## 甲', rec && rec.headingOriginal)
  ok('R6 带 headingNew（新标题行原文）', rec && rec.headingNew === '## 甲新', rec && rec.headingNew)
  ok('R6 带 oldTitle/newTitle/file', rec && rec.oldTitle === '甲' && rec.newTitle === '甲新' && rec.file === 'notes/lessons.md',
    rec && `file=${rec.file}`)
}

// ── R7 rename 文件缺失 ─────────────────────────────────────────────────────
{
  const root = mkdtempSync(join(tmpdir(), 'treeops-rm-nonotes-'))
  roots.push(root)
  const r = await applyTreeOps(root, [{ action: 'rename', file: 'lessons.md', oldTitle: '甲', newTitle: '甲新' }], hooks())
  const a = recs(root)
  ok('R7 notes 文件缺失 ⇒ skipped', r.applied === 0 && r.skipped === 1, `applied=${r.applied} skipped=${r.skipped}`)
  ok('R7 精确 reason=notes 文件缺失/不可读', a.some((x) => x.reason === 'notes 文件缺失/不可读'), JSON.stringify(a.map((x) => x.reason)))
}

// ── M1/M2/M3/M5 merge 成功 ─────────────────────────────────────────────────
{
  const root = mk()
  const before = readNote(root)
  const r = await applyTreeOps(root, [{ action: 'merge', file: 'lessons.md', keepTitle: '甲', dropTitle: '乙' }], hooks())
  const after = readNote(root)
  ok('M1 merge 成功 applied=1', r.applied === 1 && r.skipped === 0, `applied=${r.applied} skipped=${r.skipped}`)
  ok('M1 drop 小节（## 乙）已消失', !after.includes('## 乙'))
  ok('M1 keep 小节（## 甲）保留', after.includes('## 甲'))
  ok('M2 **精确去重**：字面相同的「共有行」只留一条', after.split('- 共有行（甲与乙完全相同）').length - 1 === 1,
    `出现 ${after.split('- 共有行（甲与乙完全相同）').length - 1} 次`)
  ok('M3 并入位置在 keep **原有正文之后**：记忆需周期性梳理 早于 乙独有行 B',
    after.indexOf('- 记忆需周期性梳理') < after.indexOf('- 乙独有行 B'),
    `keep尾=${after.indexOf('- 记忆需周期性梳理')} 并入=${after.indexOf('- 乙独有行 B')}`)
  ok('M5 **模糊同义行不去重**：记忆需周期性梳理 与 记忆要定期整理 同时在',
    after.includes('- 记忆需周期性梳理') && after.includes('- 记忆要定期整理'))
  ok('M1 非空性：内容确实变了', after !== before)
  const rec = recs(root).find((x) => x.action === 'merge' && !x.outcome)
  ok('M1 成功归档带 appended/keepSection/dropSection/canonicalHeading',
    rec && Array.isArray(rec.appended) && typeof rec.keepSection === 'string' && typeof rec.dropSection === 'string' && typeof rec.canonicalHeading === 'string',
    rec && `appended=${JSON.stringify(rec.appended)}`)
  ok('M2 归档 appended 不含已被精确去重的共有行', rec && !rec.appended.some((l) => l.includes('共有行')))
}

// ── M4 非叶子跳过 ⇒ 两个原文都进归档（team-lead 点名坑位）─────────────────
{
  const root = mk()
  const before = readNote(root)
  const r = await applyTreeOps(root, [{ action: 'merge', file: 'lessons.md', keepTitle: '树干', dropTitle: '另一树干' }], hooks())
  const rec = recs(root).find((x) => x.action === 'merge' && x.outcome === 'skipped')
  ok('M4 非叶子 ⇒ skipped（applied=0）', r.applied === 0 && r.skipped === 1, `applied=${r.applied} skipped=${r.skipped}`)
  ok('M4 精确 reason=keep 非叶子（含更深标题）', rec && rec.reason === 'keep 非叶子（含更深标题）', rec && rec.reason)
  ok('M4 **keepSection 原文进归档**', rec && typeof rec.keepSection === 'string' && rec.keepSection.includes('- 树干正文'),
    rec && String(rec.keepSection).slice(0, 40))
  ok('M4 **dropSection 原文进归档**', rec && typeof rec.dropSection === 'string' && rec.dropSection.includes('- 另一树干正文'),
    rec && String(rec.dropSection).slice(0, 40))
  ok('M4 文件字节不变', readNote(root) === before)
}

// ── M6 各 skip 分支 ────────────────────────────────────────────────────────
{
  // M6-a keep=drop 同一小节（两个不同标题命中同一 section）
  const rootA = mk()
  const beforeA = readNote(rootA)
  const rA = await applyTreeOps(rootA, [{ action: 'merge', file: 'lessons.md', keepTitle: '甲', dropTitle: '甲独有' }], hooks())
  ok('M6-a keep=drop 同一小节 ⇒ skipped',
    rA.applied === 0 && rA.skipped === 1 && recs(rootA).some((x) => x.reason === 'keep=drop 同一小节'),
    `applied=${rA.applied} skipped=${rA.skipped} reasons=${JSON.stringify(recs(rootA).map((x) => x.reason))}`)
  // archi 2026-09-12：此用例 notes 文件是存在的，字节完全可比 ⇒ 不必归为"不可比"
  ok('M6-a 文件字节不变', readNote(rootA) === beforeA)
  // M6-b drop 未找到
  const rootB = mk()
  const beforeB = readNote(rootB)
  const rB = await applyTreeOps(rootB, [{ action: 'merge', file: 'lessons.md', keepTitle: '甲', dropTitle: '查无此节' }], hooks())
  ok('M6-b drop 未找到 ⇒ skipped 且 reason 精确',
    rB.applied === 0 && rB.skipped === 1 && recs(rootB).some((x) => x.reason === 'drop 未找到/歧义'),
    `reasons=${JSON.stringify(recs(rootB).map((x) => x.reason))}`)
  // archi 2026-09-12 要求：每条 skipped 都得带字节不变（9 条 skipped 断言原先只有 5 处带）
  ok('M6-b 文件字节不变', readNote(rootB) === beforeB)
  // M6-c keep 未找到
  const rootC = mk()
  const beforeC = readNote(rootC)
  const rC = await applyTreeOps(rootC, [{ action: 'merge', file: 'lessons.md', keepTitle: '查无此节', dropTitle: '甲' }], hooks())
  ok('M6-c keep 未找到 ⇒ skipped 且 reason 精确',
    rC.applied === 0 && rC.skipped === 1 && recs(rootC).some((x) => x.reason === 'keep 未找到/歧义'),
    `reasons=${JSON.stringify(recs(rootC).map((x) => x.reason))}`)
  ok('M6-c 文件字节不变', readNote(rootC) === beforeC)
  // M6-d notes 文件缺失
  const rootD = mkdtempSync(join(tmpdir(), 'treeops-rm-mnonotes-'))
  roots.push(rootD)
  const rD = await applyTreeOps(rootD, [{ action: 'merge', file: 'lessons.md', keepTitle: '甲', dropTitle: '乙' }], hooks())
  ok('M6-d notes 文件缺失 ⇒ skipped 且 reason 精确',
    rD.applied === 0 && rD.skipped === 1 && recs(rootD).some((x) => x.reason === 'notes 文件缺失/不可读'),
    `reasons=${JSON.stringify(recs(rootD).map((x) => x.reason))}`)
  // 本用例没有 notes 文件可比对，对应断言是「跳过不得顺手把文件创建出来」
  ok('M6-d notes 文件仍不存在（跳过不得顺手创建）', !existsSync(noteOf(rootD)))
}

// ── M6-e merge 侧 L4（####）口径 —— G-22 **xfail 双向锁** ──────────────────
// 契约口径：merge 应与 rename 同口径（scope 限 L2/L3），L4 不得被匹配 ⇒ skipped 且字节不变。
// 现状（`src/treeops.ts`）：rename 用 `sections.filter((s) => s.level === 2 || s.level === 3)`；
//   merge 用 `matchSection(sections, …)`——**全 sections、无 level 过滤** ⇒ L4 会被匹配并落盘。
// 实证后果（cody-loss 2026-09-12）：`#### 丁` 整节消失、正文被搬进 `### 丙`（跨容器搬运），
//   `## 戊容器` 剩下**孤儿空容器** ⇒ 不是「口径不一致」的描述性问题，是已落盘的树结构破坏。
// 用 xfail 而非 skipped/红灯的理由见本文件 `xfail` 定义处；G-22 定级由 team-lead 裁定。
{
  const root = mk()
  const before = readNote(root)
  const r = await applyTreeOps(root, [{ action: 'merge', file: 'lessons.md', keepTitle: '丙', dropTitle: '丁' }], hooks())
  const after = readNote(root)
  xfail('M6-e merge 不得匹配 L4（#### 丁）⇒ 应 skipped 且字节不变',
    r.applied === 0 && r.skipped === 1 && after === before,
    { tag: 'G-22', reason: `rename 限 L2/L3 而 merge 用全 sections；实测 applied=${r.applied} skipped=${r.skipped} 字节变化=${after !== before}` })
  // 非空性：若夹具里根本没有 L4，「不得匹配」就是空断言（随便改实现都 XFAIL，锁不住任何东西）
  ok('M6-e 非空性：夹具里确实存在 L4 小节「#### 丁」', before.includes('#### 丁'))
  ok('M6-e 非空性：keep「丙」也确实存在且为 L3（否则"未匹配"可能只是标题打错）', before.includes('### 丙'))
}

console.log(P.join('\n'))
console.log('\n未覆盖声明（不假装覆盖）：① gate 拒路径（玩具库无 memory_write_gate.mjs，恒 absent）' +
  '② atomicWrite 落盘失败 / 归档目录不可建 ③ 索引指针改写（本件不建 MEMORY/USER/AGENT，rewriteOneIndex 恒 return 0）' +
  '④ ~~merge 侧 L4（####）行为不锁~~ ⇒ 已改为 **xfail 双向锁**（见 M6-e，G-22）：未修期间判 XFAIL（不算通过），' +
  '一旦行为变化判 XPASS 并计入 FAIL')
const xfailN = XF.filter((x) => x === 'xfail').length
const xpassN = XF.filter((x) => x === 'xpass').length
// XPASS 计入 FAIL：缺陷行为变了却悄悄绿，比红着更危险
const fails = P.filter((x) => x.startsWith('FAIL')).length + xpassN
console.log(`\n${P.length - fails - xfailN} PASS / ${xfailN} XFAIL（已知缺陷未修，非通过） / ${fails} FAIL`)
if (xfailN) console.log(`⚠ 有 ${xfailN} 条 XFAIL——缺陷仍在，本件**不是**全绿，G-22 未消解`)
for (const d of roots) rmSync(d, { recursive: true, force: true })
process.exit(fails ? 1 : 0)
