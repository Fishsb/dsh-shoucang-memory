#!/usr/bin/env node
// count-memory-lines.mjs — 记忆库「一条」的**规范计数口径**（报告态，不入 CHECKS）
//
// 为什么需要它（2026-09-15 P0.2）：
//   同一个 `AGENT.md` 曾有三份互相矛盾的计数：
//     · 本次实测          = 18 条 [原则] + 6 条 [路径]
//     · criteria.json:458 = 「18 条互不重复」
//     · master-architecture-plan §2.1（09-14）= 「17 指针 + 15 画像」
//   ⇒ 任何"粒度压缩/收敛"的收益都必须以**同一口径**度量，否则数字不可比。
//   ⇒ 本件把口径写成**可复算的代码**（口径即实现，避免"口头口径"漂移）。
//
// 规范口径（**唯一**，2026-09-15 定；⚠ 首版口径算错过一次，见下）：
//   「索引行」 = 行内出现 `→ notes/` 的行（路由四要素齐全：标签·主题·概况·指针）
//   「画像行」 = 以 `- ` 开头 **且含标签 `[xx]`** 的行（P 层，带 `← 源:` 尾巴）
//   「叙事行」 = 以 `- ` 开头 **但不含标签** 的行 ← **跨粒度冗余的候选面**（无标签画像行，回落 E 层）
//   「其他」   = 非标题、非空、且不属于以上三类的行
//   ⚠ **首版口径的错**（2026-09-15 实测自纠）：曾把「画像行」定义为"以 `- ` 开头"（不看标签），
//     于是 `AGENT.md` 里 `- 曾把「优化当前插件」扩成…` 这类**无标签叙事行被算进画像行** ⇒ 叙事恒 0，
//     与该文件的逐行实读（约 10 条）矛盾。**判据被 ground truth 证伪后立即收窄**——这正是"先红后绿"。
//   ⇒ 该切分才是"跨粒度冗余"的可度量面：**有标签的粗粒度行 ⟷ 无标签的细粒度行**。
//
// 按标签的计数（[原则]/[路径]/[边界]/[认知]/…）在**索引行 ∪ 画像行（有标签）**上做。
//
// 用法: node scripts/count-memory-lines.mjs [--bank <记忆库根>] [--json]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const JSON_OUT = argv.includes('--json')
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'suite', 'memory'))

const TAG_RE = /\[([^\]\s]{1,6})\]/g
const hasTag = (l) => /\[[^\]\s]{1,6}\]/.test(l)
const isIndex = (l) => l.includes('\u2192 notes/')          // →
const isProfile = (l) => /^\s*-\s/.test(l) && hasTag(l)      // 有标签的画像行
const isNarrative = (l) => /^\s*-\s/.test(l) && !hasTag(l)   // 无标签：跨粒度冗余候选面
const isHeading = (l) => /^\s*#{1,6}\s/.test(l)

const files = ['MEMORY.md', 'USER.md', 'AGENT.md']
const out = { bank, files: {}, tags: {}, totals: { index: 0, profile: 0, narrative: 0, other: 0, heading: 0 } }
for (const f of files) {
  const p = join(bank, f)
  if (!existsSync(p)) { out.files[f] = null; continue }
  const lines = readFileSync(p, 'utf8').split(/\r?\n/)
  const rec = { index: 0, profile: 0, narrative: 0, other: 0, heading: 0, bytes: 0 }
  for (const l of lines) {
    const s = l.trim()
    if (!s) continue
    if (isHeading(s)) { out.totals.heading++; rec.heading++; continue }
    const idx = isIndex(s)
    const prof = isProfile(s)
    if (idx) { out.totals.index++; rec.index++ }
    else if (prof) { out.totals.profile++; rec.profile++ }
    else if (isNarrative(s)) { out.totals.narrative++; rec.narrative++ }
    else { out.totals.other++; rec.other++ }
    // 标签统计：索引行 ∪ 有标签画像行（叙事行无标签，故不计）
    if (idx || prof) for (const m of s.matchAll(TAG_RE)) out.tags[m[1]] = (out.tags[m[1]] || 0) + 1
  }
  out.files[f] = rec
}

if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }
console.log(`bank = ${out.bank}`)
console.log('口径：索引行 = 含 `→ notes/`；画像行 = `- ` 开头**且含标签**；叙事行 = `- ` 开头**且无标签**（跨粒度冗余候选面）')
for (const [f, r] of Object.entries(out.files)) {
  console.log(r ? `  ${f}: 索引 ${r.index} · 画像 ${r.profile} · **叙事 ${r.narrative}** · 其他 ${r.other} · 标题 ${r.heading}` : `  ${f}: (缺失)`)
}
console.log(`合计: 索引 ${out.totals.index} · 画像 ${out.totals.profile} · **叙事 ${out.totals.narrative}** · 其他 ${out.totals.other} · 标题 ${out.totals.heading}`)
const tags = Object.entries(out.tags).sort((a, b) => b[1] - a[1])
console.log('标签分布（索引行 ∪ 有标签画像行）:', tags.map(([t, n]) => `${t}=${n}`).join(' '))
