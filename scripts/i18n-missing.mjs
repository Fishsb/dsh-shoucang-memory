/**
 * i18n-missing — 列出「调用点有、EN 词表无」的键（JSON），供批量翻译。
 *
 * 与 `i18n-diff-keys.mjs` 的分工：那件是**人读**诊断（只印前 30），本件输出**机器可消费**的全量 JSON，
 * 供翻译流水线接力（`i18n-merge-dicts` 之后的新增键补译）。
 * 用法：node scripts/i18n-missing.mjs [--by-file]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const BYFILE = process.argv.includes('--by-file')

const files = readdirSync(SRC).filter((f) => f.endsWith('.js') && !f.includes('.generated.') && !f.startsWith('.'))
const isDict = (f) => /^i18n-dict-.*\.js$/.test(f)

const en = new Set()
for (const f of files.filter(isDict)) {
  const t = readFileSync(join(SRC, f), 'utf8')
  const re = /^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',\s*$/gm
  let m
  while ((m = re.exec(t)) !== null) en.add(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'))
}

const need = new Map()   // key -> [files]
for (const f of files.filter((x) => !isDict(x))) {
  const raw = readFileSync(join(SRC, f), 'utf8')
  /* ⚠ 必须先剥注释：正则扫全文本会命中**注释里的** `tr('中文')`（实测假阳性，
   *   而权威件 check-i18n-keys 走 AST 故不认 ⇒ 两件口径不一致会误导）。 */
  const t = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  /* ⚠ 两种引号都要认：转换器产出 `tr("…")`（双引号，JSON.stringify 产物），
   *   手写处多为 `tr('…')`。只认单引号会漏掉绝大多数（实测：认单引号仅得 42 键，实为 912）。 */
  const re = /(?:^|[^a-zA-Z0-9_$.])tr\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g
  let m
  while ((m = re.exec(t)) !== null) {
    const k = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    if (!/[\u4e00-\u9fff]/.test(k)) continue
    if (!need.has(k)) need.set(k, [])
    if (!need.get(k).includes(f)) need.get(k).push(f)
  }
}

const missing = [...need.keys()].filter((k) => !en.has(k)).sort()
if (BYFILE) {
  const byFile = {}
  for (const k of missing) for (const f of need.get(k)) (byFile[f] = byFile[f] || []).push(k)
  console.log(JSON.stringify(byFile, null, 2))
} else {
  console.log(JSON.stringify(missing, null, 2))
}
console.error('调用点键 ' + need.size + ' · EN 词表 ' + en.size + ' · 缺失 ' + missing.length)
