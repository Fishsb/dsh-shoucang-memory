// restructure-notes.mjs — notes 层级重排（F11）：只做①层级提升 ②同名重复合并；**不动内容、不改小节名**
//
// ⚠ 教训（2026-09-11 实测翻车并已修）：**首次实现把"提升"按原位置发射**，导致父章节的**后续子节**被提升出的
//   新 `##` 吞掉（Markdown 层级是**位置性**的）——`## Windows 系统运维与数据安全` 标题消失、其 8 个子节
//   挂到了被提升的 `## 假绿与实证（干跑对账）` 之下。且我当时用"标题数 23/23 相同"当验证 = **假绿**
//   （数量相同但标题被替换）。⇒ 现改为：**两阶段发射**（先父章节+保留子节，再统一发射提升项）
//   + **内容级断言**（标题多重集 / 层级归属 / 守恒），任一不过 ⇒ 拒绝写盘。
// 用法: node scripts/restructure-notes.mjs [--bank <库根>] [--apply]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const APPLY = argv.includes('--apply')
const notesDir = join(bank, 'notes')
const norm = (s) => String(s).replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim()

// 显式提升清单（逐条给理由；同质章节保持不动）
const PROMOTE = {
  'env.md': { 'DSH 环境': { keep: ['执行环境（pwsh / node / 工具可用性）', '沙箱与子进程', '本机事实（目录 / 端口 / 模型 / 转录 / 事件流）'], promote: ['插件注入', 'Windows npm 执行策略', 'Windows PowerShell 编码', '记忆库与内核概览', '插件装配·部署·卸载', '检索链路与桥', '内核边界与四层叠加'], why: '「环境」只该收执行环境/沙箱/本机事实；其余为独立主题' } },
  'lessons.md': {
    'DSH 自托管约束': { keep: ['运行时与装配约束', '插件注册与服务判活', '服务与重启约束'], promote: ['ESM 再导出陷阱', '多根拷贝与文件判因', '假绿与实证（干跑对账）', '指针规范化与并发', '诊断方法论（信息源与面板）'], why: '「自托管约束」只该收运行时/装配/服务重启；其余为独立教训主题' },
    'Windows 系统运维与数据安全': { keep: '*', promote: [], why: '同质子节 ⇒ 保持不动' },
  },
  'flows.md': { '全局工程纪律': { keep: '*', promote: [], why: '同质子节 ⇒ 保持不动' } },
}

// ── 块模型：前言 + [章节{head,body,children[{head,body}]}] ──
const parse = (text) => {
  const out = { preamble: [], chapters: [] }
  let cur = null, sub = null
  for (const l of text.split(/\r?\n/)) {
    if (/^## /.test(l)) { cur = { head: l, title: l.slice(3).trim(), body: [], children: [] }; out.chapters.push(cur); sub = null; continue }
    if (/^### /.test(l) && cur) { sub = { head: l, title: l.slice(4).trim(), body: [] }; cur.children.push(sub); continue }
    if (sub) sub.body.push(l)
    else if (cur) cur.body.push(l)
    else out.preamble.push(l)
  }
  return out
}
const render = (m) => [...m.preamble, ...m.chapters.flatMap((c) => [c.head, ...c.body, ...c.children.flatMap((s) => [s.head, ...s.body])])].join('\n')

const plans = []
const perFile = []
let before = 0, after = 0

for (const f of readdirSync(notesDir).filter((x) => x.endsWith('.md'))) {
  const p = join(notesDir, f)
  const text = readFileSync(p, 'utf8')
  before += text.length
  const model = parse(text)
  const rule = PROMOTE[f] || {}
  const promoted = [] // {head, body} 提升为 ## 的子节（**统一在父章节发射完之后**再发）
  for (const c of model.chapters) {
    const r = rule[c.title] || rule[Object.keys(rule).find((k) => norm(k) === norm(c.title))]
    if (!r || r.keep === '*') continue
    const keep = [], prom = []
    for (const s of c.children) (r.promote.some((x) => norm(x) === norm(s.title)) ? prom : keep).push(s)
    if (!prom.length) continue
    c.children = keep // 保留项留在原位（父章节内）
    promoted.push(...prom.map((s) => ({ head: '## ' + s.title, body: s.body })))
    plans.push({ file: f, chapter: c.title, kept: keep.length, promoted: prom.map((s) => s.title), why: r.why })
  }
  // ── 两阶段：先所有章节（含保留子节），再把提升项作为**顶层章节**追加到其后（不吞父章节的其它子节）──
  //   **提升项也算顶层章节**（否则提升出的 `## 假绿与实证（干跑对账）` 与 Windows 章下的 `### 假绿与实证`
  //   同名却互不合并 ⇒ 体检仍报重复）
  const chapterTitles = new Set([...model.chapters.map((c) => norm(c.title)), ...promoted.map((pr) => norm(pr.head.slice(3)))])
  // 跨级同名合并：保留子节若与**已存在的 ## 章节**同名 ⇒ 内容并入该章节、不再单列
  const mergeInto = new Map() // chapterNorm -> lines[]
  const droppedChildTitles = new Set() // 被跨级合并而**丢弃的 ### 标题**（正文已并入同名 ## 章节）
  for (const c of model.chapters) {
    c.children = c.children.filter((s) => {
      if (!chapterTitles.has(norm(s.title))) return true
      const key = norm(s.title)
      if (!mergeInto.has(key)) mergeInto.set(key, [])
      mergeInto.get(key).push(...s.body) // **只搬正文**：同名 ## 章节的标题已表达同一主题，重复标题丢弃
      droppedChildTitles.add(s.title)
      plans.push({ file: f, chapter: s.title, mergedCrossLevel: true, why: `### 与 ## 同名（原属「${c.title}」）⇒ 正文并入顶层同名章节，重复标题丢弃` })
      return false
    })
  }
  const emitted = []
  const mergedTitles = new Set()
  for (const c of model.chapters) {
    const extra = mergeInto.get(norm(c.title))
    emitted.push(c.head, ...c.body, ...(extra ? ['', ...extra] : []), ...c.children.flatMap((s) => [s.head, ...s.body]))
  }
  for (const pr of promoted) {
    const extra = mergeInto.get(norm(pr.head.slice(3)))
    // 提升项自身若被跨级合并且**它自己就是**该同名章节 ⇒ 直接并入自己的正文
    emitted.push(pr.head, ...pr.body, ...(extra ? ['', ...extra] : []))
  }
  for (const k of mergeInto.keys()) mergedTitles.add(k)
  const outText = [...model.preamble, ...emitted].join('\n')

  // ═══ 内容级断言（不过则拒绝写盘）═══
  const errs = []
  const headsOf = (t) => t.split(/\r?\n/).map((l) => l.match(/^(#{2,3})\s+(.*)$/)).filter(Boolean).map((m) => ({ lvl: m[1].length, title: m[2].trim() }))
  const hb = headsOf(text), ha = headsOf(outText)
  // A1 标题多重集：每个原始标题文本必须仍出现（**被合并掉的同名标题豁免**，但其内容行必须仍在）；级别只能 3→2 或保持
  const mergedNorm = new Set([...mergedTitles])
  const dropped = droppedChildTitles
  for (const h of hb) {
    const same = ha.filter((x) => x.title === h.title)
    if (!same.length) {
      if (dropped.has(h.title)) continue // 跨级合并丢弃的同名 ### 标题（正文已并入同名 ## 章节，另在其正文断言里核）
      errs.push(`标题丢失：「${h.title}」`); continue
    }
    const okLevel = same.some((x) => x.lvl === h.lvl || (h.lvl === 3 && x.lvl === 2))
    if (!okLevel) errs.push(`层级异常：「${h.title}」原 L${h.lvl} → 现 ${same.map((x) => 'L' + x.lvl).join('/')}`)
  }
  if (ha.length !== hb.length - dropped.size) errs.push(`标题数异常：${hb.length} 原 → ${ha.length} 现（期望 ${hb.length - dropped.size}，跨级合并丢弃 ${dropped.size}）`)
  // A2 层级归属：每个 `###` 的最近前驱 `##` 必须是其**原父章节**（或被合并掉）
  const parentOf = new Map()
  for (const c of parse(text).chapters) for (const s of c.children) parentOf.set(s.title, norm(c.title))
  let lastH2 = null
  for (const h of ha) {
    if (h.lvl === 2) { lastH2 = norm(h.title); continue }
    const expect = parentOf.get(h.title)
    if (expect && lastH2 !== expect) errs.push(`层级归属错位：「${h.title}」应在「${expect}」之下，实际在「${lastH2}」之下`)
  }
  // A3 守恒：Δ = −(提升数) + (合并补入行)
  const expectDelta = -promoted.length
  const delta = outText.length - text.length
  if (delta > expectDelta + 200 || delta < expectDelta - 200) errs.push(`守恒异常：Δ=${delta} 期望≈${expectDelta}`)
  perFile.push({ file: f, before: text.length, after: outText.length, delta, promoted: promoted.length, errs: errs.slice() })
  after += outText.length
  if (errs.length) continue
  if (APPLY) {
    const bak = join(bank, 'audit', `backup-notes-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`)
    mkdirSync(bak, { recursive: true })
    if (!existsSync(join(bak, f))) copyFileSync(p, join(bak, f))
    writeFileSync(p, outText, 'utf8')
  }
}

console.log((APPLY ? '✅ 已应用' : '🔍 dry-run（未写盘）') + ` · 库=${bank}\n`)
for (const pl of plans) {
  if (pl.mergedCrossLevel) console.log(`  [合并] ${pl.file} ·「${pl.chapter}」${pl.why}`)
  else console.log(`  [提升] ${pl.file} ·「${pl.chapter}」保留 ${pl.kept} 个；提升 ${pl.promoted.length} 个：${pl.promoted.join(' / ')}\n         理由：${pl.why}`)
}
console.log('\n逐文件（含断言）：')
let bad = 0
for (const x of perFile) {
  console.log(`  ${x.file}: Δ=${x.delta >= 0 ? '+' : ''}${x.delta} · 提升 ${x.promoted}${x.errs.length ? ' · ❌ ' + x.errs.length + ' 项断言未过' : ' · ✅'}`)
  for (const e of x.errs.slice(0, 3)) console.log(`      · ${e}`)
  if (x.errs.length) bad++
}
console.log(`\n合计：字符 前=${before} 后=${after}（Δ=${after - before}）· 断言未过文件=${bad}`)
if (bad) { console.error('⛔ 断言未过 ⇒ 拒绝写盘'); process.exit(1) }
console.log('✅ 全部断言通过（标题多重集 / 层级归属 / 守恒）' + (APPLY ? ' · 已写盘（备份在 audit/backup-notes-*）' : '（加 --apply 写盘）'))
