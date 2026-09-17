/**
 * 诊断：用**真实 _memory 索引数据**复现 idxPill 的显示文本（定位「标签重复」）
 * 用法：node scripts/i18n-tagprobe.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MEM = join(ROOT, '_memory')
const t = await import(pathToFileURL(join(ROOT, 'src-client', 'tag-label.js')).href)

const FILES = ['MEMORY.md', 'AGENT.md', 'USER.md']
for (const f of FILES) {
  const p = join(MEM, f)
  if (!existsSync(p)) continue
  const lines = readFileSync(p, 'utf8').split(/\r?\n/)
  const rows = []
  for (const ln of lines) {
    const m = /^\s*(?:-\s*)?\[([^\]]{1,14})\]\s*(.*)$/.exec(ln)
    if (m) rows.push({ tag: m[1], subject: m[2].slice(0, 40) })
  }
  if (!rows.length) { console.log('── ' + f + '：无索引行'); continue }
  const amb = t.ambiguousTags(rows.map((r) => r.tag), 'zh')
  console.log('── ' + f + '（' + rows.length + ' 行）')
  for (const r of rows) {
    const name = t.tagLabel(r.tag, 'zh')
    // 复刻 panes-memory.js:83 的判据
    const text = (amb && amb[r.tag]) ? (name + ' · ' + String(r.tag)) : name
    const flag = (name === String(r.tag) && amb && amb[r.tag]) ? '   ← **重复显示**' : ''
    console.log(`   tag=${JSON.stringify(r.tag).padEnd(10)} 显示=${JSON.stringify(text).padEnd(22)} 主题=${r.subject}${flag}`)
  }
  console.log('   撞名标记：' + JSON.stringify(amb))
}
