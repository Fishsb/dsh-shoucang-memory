/**
 * i18n-extract — 汇总全 client 侧的待译中文原文（原文即键形态）（2026-09-17）
 *
 * 用途：把 `tr("中文")` 单参形态的**唯一原文**汇总成清单，供：
 *   ① 生成 `i18n-dict-*.js` 的 EN 词表（键 = 中文原文，值 = 英文）；
 *   ② 与 `check-i18n-keys` 的断言 A 对账（缺 EN 词条即红）。
 *
 * 输出：`scripts/fixtures/i18n-strings.json`（全量，按频次降序）
 * 用法：node scripts/i18n-extract.mjs [--json]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const OUT = join(ROOT, 'scripts', 'fixtures', 'i18n-strings.json')
const AS_JSON = process.argv.includes('--json')
const CJK = /[\u4e00-\u9fff]/

function trStrings () {
  const counts = new Map()
  if (!existsSync(SRC)) return counts
  const files = readdirSync(SRC).filter((f) => f.endsWith('.js') && !/\.bak-|\.generated\./.test(f))
  for (const f of files) {
    const src = readFileSync(join(SRC, f), 'utf8')
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const c = node.expression.getText(sf)
        if (/(^|\.)tr$/.test(c)) {
          // 单参形态：原文即键
          if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && CJK.test(node.arguments[0].text)) {
            const s = node.arguments[0].text
            counts.set(s, (counts.get(s) || 0) + 1)
          }
          // 双参语义键形态：键 + 中文原文
          if (node.arguments.length >= 2 && ts.isStringLiteral(node.arguments[0]) && ts.isStringLiteral(node.arguments[1])) {
            const s = node.arguments[1].text
            if (CJK.test(s)) counts.set(s, (counts.get(s) || 0) + 1)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return counts
}

const counts = trStrings()
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), total: sorted.length, strings: sorted.map(([s, n]) => ({ s, n })) }, null, 1), 'utf8')

if (AS_JSON) { console.log(JSON.stringify(sorted.map(([s, n]) => ({ s, n })))) } else {
  console.log(`i18n-extract · 唯一中文原文 ${sorted.length} 条（已写入 scripts/fixtures/i18n-strings.json）`)
  sorted.slice(0, 20).forEach(([s, n]) => console.log(String(n).padStart(3), JSON.stringify(s).slice(0, 80)))
}
