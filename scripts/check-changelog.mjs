#!/usr/bin/env node
// check-changelog.mjs — CHANGELOG 结构机检（防守「前置新条目时吃掉上一条标题」这类反复失误）
//
// 背景（实测两次，2026-09-11）：用「替换上一条首个 `- **标题**`」的方式前置新条目，会把**上一条的标题吃掉**，
//   正文变成以「：」/「。」开头的孤立行 ⇒ 结构损坏（HEAD 里曾累积 12 条孤立行，标题要靠 git 历史回收）。
// 判据（硬门）：① [Unreleased] 块内**不得有**以 `：`/`。`/`:` 开头的孤立行；
//   ② 小节不得重复（`### Fixed` 等每类至多一次）；③ 除 Keep-a-Changelog 三类外不得出现其他 `###`；
//   ④ 每个 `- **…**` 条目必须标题闭合（存在配对的 `**`）。
// 用法: node scripts/check-changelog.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lines = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split(/\r?\n/)
const i = lines.findIndex((l) => /^## \[Unreleased\]/.test(l))
const j = lines.findIndex((l, k) => k > i && /^## \[/.test(l))
const block = lines.slice(i + 1, j < 0 ? lines.length : j)

const issues = []
block.forEach((l, k) => {
  const s = l.trim()
  if (!s) return
  if (/^[：。:]/.test(s)) issues.push(`孤立行（标题被吃）：L${i + 2 + k} 「${s.slice(0, 40)}…」`)
  if (/^- \*\*/.test(s) && (s.match(/\*\*/g) || []).length < 2) issues.push(`条目标题未闭合：L${i + 2 + k}`)
})
const sections = block.filter((l) => /^### /.test(l)).map((l) => l.trim())
const dup = sections.filter((s, k) => sections.indexOf(s) !== k)
const allowed = new Set(['### Fixed', '### Changed', '### Added', '### Removed', '### Deprecated', '### Security'])
const unknown = sections.filter((s) => !allowed.has(s))

if (dup.length) issues.push(`小节重复：${[...new Set(dup)].join(' / ')}`)
if (unknown.length) issues.push(`非标准小节：${unknown.join(' / ')}`)

if (issues.length) {
  console.error('⛔ CHANGELOG 结构损坏：')
  for (const x of issues.slice(0, 10)) console.error('   · ' + x)
  console.error('   修法：前置新条目时**保留上一条的 `- **标题**`**（不要把标题一起替换掉）')
  process.exit(1)
}
console.log(`✅ CHANGELOG 结构正常（[Unreleased] 小节 ${[...new Set(sections)].join(' / ')} · 条目 ${block.filter((l) => /^- \*\*/.test(l.trim())).length} 条）`)
