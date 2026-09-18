#!/usr/bin/env node
// check-section-refs.mjs — 库「小节寻址」巡检门（S1R · G4/G5，2026-09-19）
//
// 判因（S1 库核心只读复查）：索引行是**唯一检索入口**（`§小节名` = 内容锚），但
//   ① 该链路断了**没有任何机制会翻红**：唯一逐条列出悬空的 `memory-reconcile.mjs` **不在 CHECKS** 且**恒 exit 0**；
//   ② 面板「指针健康」已按用户要求移除；
//   ③ `check-shared-fn.mjs` 只扫 `src/*.ts` ⇒ 库工具链的重复实现不在其视野。
//   实测存量：悬空 59 段（去重 50 组）· 同名歧义 32 段（去重 3 组）· 同名小节重复 3 处。
//
// 本件做什么（**棘轮**，只许降不许升）：
//   A 主档（MEMORY/USER/AGENT）逐行提取 `→ notes/x.md §y`（复用单一实现 `section-ref.mjs#pointersOfRow`），
//     按三态计数；`missing` / `ambiguous` 都不得高于**登记基线**（每次收口后**在同一处下调**）
//   B notes/*.md 内**归一同名标题**（`##`/`###` 同名 ⇒ 寻址歧义之源）计数不得高于基线
//   C `--selftest`：夹具根上**先红 + 阴性对照**自证（检出悬空/同名；干净夹具零误报）
//
// 退出码: 0=PASS  1=FAIL  2=用法错误  3=记忆库不存在（skip）
// 用法: node scripts/check-section-refs.mjs [--json|--selftest] [--root <库根>]
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const AS_JSON = argv.includes('--json')
const SELFTEST = argv.includes('--selftest')
const rootIdx = argv.indexOf('--root')
const LIB = rootIdx > -1 && argv[rootIdx + 1]
  ? argv[rootIdx + 1]
  : (process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))

/** 棘轮基线（**变更须在此处改并注明日期与原因**）——下调 = 收口完成，上调 = 需显式说明。
 *  ⚠ 口径（2026-09-19 定）：**spec 级**（`§父/子` 整体）计数，与写入准入同一判据面：
 *    · `missingSpecs`  = 全不可解析（**准入拒绝**；必须为 0 才算收口）
 *    · `partialSpecs`  = 路径部分可解析（准入放行 + **写侧归一为可解析前缀**）——P2 逐条改指后归零
 *    · `ambiguousSpecs`= 同名多候选（放行 + 提示）——同名合并后归零
 *    · `duplicateTitles` = notes 内归一同名标题（歧义之源）
 *  ⚠ **基线来历**：2026-09-19 P0/P1 落地时的**真库实测**（missing 36 · partial 14 · ambiguous 32 · dup 3）；
 *    P2 收口后**必须下调至 0**（只许收紧）。 */
const BASELINE = {
  date: '2026-09-19（P2 收口后收紧至 0：真库实测 0/0/0/0）',
  missingSpecs: 0,
  partialSpecs: 0,
  ambiguousSpecs: 0,
  duplicateTitles: 0,
}

const sr = await import(pathToFileURL(join(HERE, '..', 'skill', 'scripts', 'section-ref.mjs')).href)

let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 扫描一个库根 → 三态计数 + 同名重复清单 */
function scan(lib) {
  const spec = { exists: 0, ambiguous: 0, partial: 0, missing: 0 }
  const uniq = { ambiguous: new Map(), missing: new Map(), partial: new Map() }
  const missingList = []
  let rows = 0
  const docs = ['MEMORY.md', 'USER.md', 'AGENT.md'].map((d) => join(lib, d)).filter((p) => existsSync(p))
  for (const p of docs) {
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const ptrs = sr.pointersOfRow(line)
      if (ptrs.length) rows++
      for (const ptr of ptrs) {
        const { agg, parts } = sr.resolveSectionSpec(lib, ptr.file, ptr.spec)
        spec[agg]++
        if (agg !== 'exists') {
          const key = 'notes/' + ptr.file + ' §' + ptr.spec
          uniq[agg].set(key, (uniq[agg].get(key) || 0) + 1)
          if (agg === 'missing') {
            missingList.push(key + '（缺 ' + parts.filter((x) => x.res.state === 'missing').map((x) => x.name).join('/') + '）')
          }
        }
      }
    }
  }
  const dup = []
  const notesDir = join(lib, 'notes')
  if (existsSync(notesDir)) {
    for (const f of readdirSafe(notesDir).filter((x) => x.endsWith('.md'))) {
      const by = new Map()
      for (const t of (sr.sectionTitles(lib, f) || [])) {
        const c = sr.sectionCore(t.title)
        by.set(c, (by.get(c) || 0) + 1)
      }
      for (const [c, n] of by) if (n > 1) dup.push(`notes/${f} §${c} ×${n}`)
    }
  }
  return { docs: docs.length, rows, spec, uniq, dup, missingList }
}
function readdirSafe(d) { try { return readdirSync(d) } catch { return [] } }

// ── C 自证（先红 + 阴性对照）：夹具根上必须检出悬空与同名，干净根必须零误报 ──
if (SELFTEST) {
  const T = mkdtempSync(join(tmpdir(), 'sc-secrefs-'))
  mkdirSync(join(T, 'notes'), { recursive: true })
  writeFileSync(join(T, 'MEMORY.md'), [
    '# MEMORY',
    '[env] 悬空探针 · x → notes/a.md §不存在的节',
    '[env] 歧义探针 · x → notes/a.md §同名',
    '',
  ].join('\n'), 'utf8')
  writeFileSync(join(T, 'notes', 'a.md'), '# a\n\n## 同名\nx\n### 同名\nx\n\n## 存在节\nx\n', 'utf8')
  const bad = scan(T)
  console.log('自证 · 故障夹具：')
  ok(bad.spec.missing >= 1, `检出全不可解析（missing=${bad.spec.missing}）`)
  ok(bad.spec.ambiguous >= 1, `检出歧义（ambiguous=${bad.spec.ambiguous}）`)
  ok(bad.dup.length >= 1, `检出同名小节（${bad.dup.join(' / ')}）`)
  // 阴性对照：修好后必须零误报
  writeFileSync(join(T, 'MEMORY.md'), '# MEMORY\n[env] 正常 · x → notes/a.md §存在节\n', 'utf8')
  writeFileSync(join(T, 'notes', 'a.md'), '# a\n\n## 同名\nx\n\n## 存在节\nx\n', 'utf8')
  const good = scan(T)
  console.log('自证 · 干净夹具（阴性对照）：')
  ok(good.spec.missing === 0 && good.spec.ambiguous === 0 && good.spec.partial === 0 && good.dup.length === 0,
    `零误报（missing=${good.spec.missing} ambiguous=${good.spec.ambiguous} partial=${good.spec.partial} dup=${good.dup.length}）`)
  rmSync(T, { recursive: true, force: true })
  console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（自证 4 项）')
  process.exit(fail ? 1 : 0)
}

// ── A/B 真库巡检（棘轮）──
if (!existsSync(join(LIB, 'notes'))) {
  console.log(`skip: 记忆库不存在（${LIB}）—— 本件为真库巡检，缺库即 skip（exit 3）`)
  process.exit(3)
}
const r = scan(LIB)
console.log('小节寻址巡检（棘轮 · 基线 ' + BASELINE.date + '）')
console.log(`  库=${LIB} · 主档 ${r.docs} 件 · 含指针行 ${r.rows}`)
console.log(`  spec 级：exists ${r.spec.exists} · partial ${r.spec.partial} · ambiguous ${r.spec.ambiguous} · **missing ${r.spec.missing}**`)
console.log(`  去重：partial ${r.uniq.partial.size} 组 · ambiguous ${r.uniq.ambiguous.size} 组 · missing ${r.uniq.missing.size} 组 · 同名小节 ${r.dup.length} 处`)
ok(r.spec.missing <= BASELINE.missingSpecs, `全不可解析 ${r.spec.missing} ≤ 基线 ${BASELINE.missingSpecs}`)
ok(r.spec.partial <= BASELINE.partialSpecs, `路径部分悬空 ${r.spec.partial} ≤ 基线 ${BASELINE.partialSpecs}`)
ok(r.spec.ambiguous <= BASELINE.ambiguousSpecs, `同名歧义 ${r.spec.ambiguous} ≤ 基线 ${BASELINE.ambiguousSpecs}`)
ok(r.dup.length <= BASELINE.duplicateTitles, `同名小节 ${r.dup.length} ≤ 基线 ${BASELINE.duplicateTitles}`)
if (r.spec.missing < BASELINE.missingSpecs || r.spec.partial < BASELINE.partialSpecs || r.spec.ambiguous < BASELINE.ambiguousSpecs || r.dup.length < BASELINE.duplicateTitles) {
  console.log(`  ℹ 读数低于基线 ⇒ 可在 check-section-refs.mjs#BASELINE 下调（只许收紧）`)
}
if (AS_JSON) console.log(JSON.stringify({ docs: r.docs, rows: r.rows, spec: r.spec, dup: r.dup, uniq: { partial: r.uniq.partial.size, ambiguous: r.uniq.ambiguous.size, missing: r.uniq.missing.size }, baseline: BASELINE }))
console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（小节寻址巡检在册）')
process.exit(fail ? 1 : 0)
