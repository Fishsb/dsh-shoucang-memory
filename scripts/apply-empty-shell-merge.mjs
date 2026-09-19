#!/usr/bin/env node
// apply-empty-shell-merge.mjs — 空壳小节**结构性收口**（指针供给 §2.3 待决项 · §12 处置记录）
//
// 判因（实测）：真库有 4 个**正文 0 非空行**的 `###` 空壳，全部是历史改名/容量收口（INDEX 台账记
//   「行号锚点口径/双表达计数对账 → merged 2026-09-11」）留下的**空标题**。它们造成两种误导：
//   ① 行指向空处（已由 `section-ref-reanchor.mjs` 的 ROW_OVERRIDES 重指处置）；
//   ② 空标题仍在 ⇒ 后来人可能再次指进去（跑本档之前已有 4 行命中其中 3 个）。
//
// 处置选择（**不手改真源**，走宿主既有结构操作 `treeops#merge`）：
//   · **不做"回填正文"**：这些节的知识在库内**别处承载**（如 lessons.md §完整性核验 / §文本文件字节级改写），
//     回填 = 同一事实两份副本，与本库 2026-09-11 的**合并收口**方向相反 ⇒ 明确不做；
//   · 用 `merge`（宿主唯一结构操作通道）把空壳并入**同父叶子兄弟节**：drop 正文为空
//     ⇒ 结果 = **标题消失、内容零变化**。这是"废弃空壳"最保守的落地。
//   ⚠ 两个空壳标题的**括号里含 `/`**（`pwsh / node`、`GitHub raw / ghproxy`），而 treeops 的标题不变量
//     `TITLE_OK` **禁标题含 `/`** ⇒ 表里对该两项用**无斜杠短名**匹配（`matchSection` 双向包含，
//     已实测唯一命中：PRE 读数里的 actual 字段给出真实标题）。
//
// 纪律（对齐 `section-ref-reanchor.mjs`）：
//   · **先干跑**（临时区副本上真跑一遍 `applyTreeOps`，dry 读数即终态）→ `--apply` 才写真库；
//   · APPLY 前**整库备份**到 `~/.dsh/backups/sc-shellmerge-<ts>/`；
//   · 写回由 `applyTreeOps` 自己做（tmp + rename 原子覆盖 + `audit/treeops/` 归档行可回滚）；
//   · **前置断言**：drop 可解析、正文为空、是叶子；keep 可解析且是叶子；**且无主档行仍指向 drop**
//     （有 ⇒ 拒绝执行，先跑 `section-ref-reanchor.mjs --apply`——顺序错了会把"行指向空处"变成"行指向不存在"）；
//   · **后置断言**：标题消失 / keep 保留 / **非标题非空行多重集逐文件不变**（内容守恒）。
// 用法: node scripts/apply-empty-shell-merge.mjs [--bank <库根>] [--dry|--apply] [--json]
import { readFileSync, existsSync, readdirSync, copyFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const APPLY = argv.includes('--apply')
const AS_JSON = argv.includes('--json')
const BANK = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))

/** 处置表：drop = 待废弃空壳（可用无斜杠短名匹配）；keep = 同父叶子兄弟节（依据见 docs/pointer-supply-plan.md §12） */
const OPS = [
  { file: 'env.md', dropTitle: '执行环境', keepTitle: '模型与缓存前缀', why: '空壳（执行环境知识在 §DSH 环境 与 §记忆库与内核概览）' },
  { file: 'lessons.md', dropTitle: '通道与代理', keepTitle: '重钉与全量下载', why: '空壳（ghproxy 通道知识在 §重钉与全量下载 与 env.md §网络与代理）' },
  { file: 'lessons.md', dropTitle: '行号与字节核验', keepTitle: '管道与退出码', why: '空壳（行号/字节核验知识在 §完整性核验 / §文本文件字节级改写）' },
  { file: 'lessons.md', dropTitle: '运行时与装配约束', keepTitle: '插件注册与服务判活', why: '空壳（无任何引用行；并入同父最近叶子兄弟）' },
]

const treeops = await import(pathToFileURL(join(HERE, '..', 'lib', 'treeops.js')).href)
const read = (p) => readFileSync(p, 'utf8')
const DOCS = ['MEMORY.md', 'AGENT.md', 'USER.md']
const notesFiles = (root) => readdirSync(join(root, 'notes')).filter((f) => /\.md$/i.test(f))

/** 解析一个可匹配小节（**复用 treeops#matchSection** —— 口径单一，勿在此另写匹配） */
const resolveSec = (text, kw) => {
  const sections = treeops.parseSections(text.split(/\r?\n/))
  const scope = sections.filter((s) => s.level === 2 || s.level === 3)
  const hit = treeops.matchSection(scope, kw)
  if (!hit) return null
  const ls = text.split(/\r?\n/)
  let n = 0
  for (let j = hit.sec.idx + 1; j < ls.length; j++) {
    const m = ls[j].match(/^(#{2,6})\s/)
    if (m && m[1].length <= hit.sec.level) break
    if (ls[j].trim()) n++
  }
  return { title: hit.sec.title, level: hit.sec.level, leaf: hit.sec.leaf, body: n, exact: hit.exact }
}
const contentMultiset = (text) => {
  const m = new Map()
  for (const l of text.split(/\r?\n/)) { const t = l.trim(); if (!t || /^#{1,6}\s/.test(t)) continue; m.set(t, (m.get(t) || 0) + 1) }
  return m
}
const sameMultiset = (a, b) => { if (a.size !== b.size) return false; for (const [k, v] of a) if (b.get(k) !== v) return false; return true }
const copyDir = (src, dst) => { mkdirSync(dst, { recursive: true }); for (const e of readdirSync(src, { withFileTypes: true })) { if (e.isDirectory()) copyDir(join(src, e.name), join(dst, e.name)); else copyFileSync(join(src, e.name), join(dst, e.name)) } }
const copyBank = (src, dst) => {
  mkdirSync(join(dst, 'notes'), { recursive: true })
  for (const f of notesFiles(src)) copyFileSync(join(src, 'notes', f), join(dst, 'notes', f))
  for (const d of DOCS) if (existsSync(join(src, d))) copyFileSync(join(src, d), join(dst, d))
  for (const d of ['scripts', 'engine']) if (existsSync(join(src, d))) copyDir(join(src, d), join(dst, d))
}

// ── 前置断言（只读）──
const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }
const before = {}
for (const f of notesFiles(BANK)) before[f] = read(join(BANK, 'notes', f))
const resolved = []
for (const op of OPS) {
  const r = resolveSec(before[op.file] || '', op.dropTitle)
  const k = resolveSec(before[op.file] || '', op.keepTitle)
  resolved.push({ op, drop: r, keep: k })
  ok(`前置：${op.file} 「${op.dropTitle}」命中且**正文为空**`, !!r && r.body === 0, `actual=${r ? r.title : 'null'} body=${r ? r.body : '-'}`)
  ok(`前置：${op.file} 「${op.dropTitle}」是叶子`, !!r && r.leaf === true)
  ok(`前置：${op.file} 「${op.keepTitle}」命中且是叶子`, !!k && k.leaf === true, k ? `「${k.title}」body=${k.body}` : 'null')
}
{
  const stragglers = []
  for (const d of DOCS) {
    const p = join(BANK, d); if (!existsSync(p)) continue
    for (const l of read(p).split(/\r?\n/)) {
      for (const { drop } of resolved) {
        if (!drop) continue
        if (l.includes(`§${drop.title}`) || l.includes(`§${drop.title.split('（')[0]}`)) stragglers.push(`${d}: ${l.trim().slice(0, 76)}`)
      }
    }
  }
  ok('前置：无主档行仍指向待废弃空壳（应先跑 section-ref-reanchor --apply）', stragglers.length === 0, stragglers.slice(0, 3).join(' | '))
}

// ── 干跑：临时区副本上**真跑** applyTreeOps ──
const stage = mkdtempSync(join(tmpdir(), 'shellmerge-'))
copyBank(BANK, stage)
const hooksOf = (sink) => ({ audit: (o) => sink.push(o), log: (m) => sink.push(m) })
const TREEOPS = OPS.map((o) => ({ action: 'merge', file: o.file, keepTitle: o.keepTitle, dropTitle: o.dropTitle }))
const stageLog = []
const stageRes = await treeops.applyTreeOps(stage, TREEOPS, hooksOf(stageLog))
ok('干跑：全部 op 被应用（applied == 4 且 skipped == 0）', stageRes.applied === OPS.length && stageRes.skipped === 0, JSON.stringify(stageRes))
let gone = true, conserved = true
for (const { op, drop } of resolved) {
  const afterText = read(join(stage, 'notes', op.file))
  if (resolveSec(afterText, drop ? drop.title : op.dropTitle)) gone = false
  if (!sameMultiset(contentMultiset(before[op.file]), contentMultiset(afterText))) conserved = false
}
ok('干跑：空壳标题全部消失', gone)
ok('干跑：**非标题内容逐文件守恒**（零内容变化）', conserved)
if (!conserved || stageRes.skipped) for (const l of stageLog.filter((x) => typeof x === 'string').slice(0, 6)) console.log('   log: ' + l)

if (AS_JSON) console.log(JSON.stringify({ pre: P, resolved: resolved.map((r) => ({ file: r.op.file, want: r.op.dropTitle, actual: r.drop ? r.drop.title : null, keep: r.keep ? r.keep.title : null })), stageRes, stageLog }, null, 1))
else { for (const l of P) console.log(l); console.log(`  干跑 applyTreeOps → ${JSON.stringify(stageRes)} · 解析：${resolved.map((r) => `${r.op.file}:${r.op.dropTitle}⇒${r.drop ? r.drop.title : 'null'}`).join(' | ')}`) }

// ── APPLY ──
let backup = null
if (APPLY && !bad) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  backup = join(homedir(), '.dsh', 'backups', `sc-shellmerge-${ts}`)
  copyBank(BANK, backup)
  const log = []
  const res = await treeops.applyTreeOps(BANK, TREEOPS, hooksOf(log))
  console.log(`\nAPPLY applyTreeOps → ${JSON.stringify(res)}\n  备份：${backup}`)
  let allOk = true
  for (const { op, drop, keep } of resolved) {
    const afterText = read(join(BANK, 'notes', op.file))
    const stillThere = resolveSec(afterText, drop ? drop.title : op.dropTitle)
    const keepOk = !!resolveSec(afterText, keep ? keep.title : op.keepTitle)
    const cons = sameMultiset(contentMultiset(before[op.file]), contentMultiset(afterText))
    const good = !stillThere && keepOk && cons
    if (!good) allOk = false
    console.log(`  后置 ${op.file} 「${drop ? drop.title : op.dropTitle}」: 已消失=${!stillThere} · keep 保留=${keepOk} · 内容守恒=${cons}`)
  }
  console.log(allOk ? '  ✅ 后置断言全过（回滚点：上方备份目录）' : '  ❌ 后置断言失败（用上方备份回滚）')
} else if (APPLY) console.log('\n⚠ 前置断言未过 ⇒ **拒绝写入真库**（不执行 apply）')
rmSync(stage, { recursive: true, force: true })
console.log(bad ? `\nFAIL（前置/干跑 ${bad} 项）` : (APPLY ? '\nAPPLY 完成' : '\nDRY 完成（未写入真库；加 --apply 生效）'))
process.exit(bad ? 1 : 0)
