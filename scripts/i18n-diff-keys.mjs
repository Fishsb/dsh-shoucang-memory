/**
 * i18n-diff-keys — 诊断：把「检查器的调用点键集」与「词表实际条目」对差（2026-09-17）
 *
 * 用途：`check-i18n-keys` 报「缺 EN 词条 N 个」时，用它**逐条列出**到底缺哪些、
 *   分布在哪个文件 —— 避免只看前 12 条样例就动手（曾经因此误判为某文件未转换）。
 *
 * 用法：node scripts/i18n-diff-keys.mjs [--max 30]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const maxArg = process.argv.indexOf('--max')
const MAX = maxArg >= 0 ? Number(process.argv[maxArg + 1]) : 30

const DICT_FILES = ['i18n-dict-nav.js', 'i18n-dict-memory.js', 'i18n-dict-pane-run.js', 'i18n-dict-pane-arch.js', 'i18n-dict-cfg.js']

/** 读词表模块的 `export var EN = {...}`。 */
function readEn (file) {
  const abs = join(SRC, file)
  if (!existsSync(abs)) return {}
  const text = readFileSync(abs, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  const out = {}
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.name.text === 'EN' &&
        node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const p of node.initializer.properties) {
        if (!ts.isPropertyAssignment(p)) continue
        const k = p.name && (ts.isStringLiteral(p.name) ? p.name.text : ts.isIdentifier(p.name) ? p.name.text : null)
        if (k !== null) out[k] = true
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

const EN = {}
for (const f of DICT_FILES) Object.assign(EN, readEn(f))

const files = readdirSync(SRC).filter((f) => f.endsWith('.js') && !/\.bak-|\.generated\./.test(f) && f !== '.vendor-css.generated.js').sort()
const sites = []
for (const f of files) {
  const src = readFileSync(join(SRC, f), 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const c = n.expression.getText(sf)
      if (/(^|\.)tr$/.test(c) && n.arguments.length >= 1) {
        const a0 = n.arguments[0]
        if (ts.isStringLiteral(a0)) sites.push({ f, k: a0.text })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

const uniq = new Set(sites.map((s) => s.k))
const miss = [...uniq].filter((k) => !EN[k])
const dead = Object.keys(EN).filter((k) => !uniq.has(k))

console.log(`词表条目 ${Object.keys(EN).length} · 调用点 ${sites.length}（唯一 ${uniq.size}）`)
console.log(`缺 EN 词条：${miss.length} · 死键：${dead.length}`)
if (miss.length) {
  const byFile = {}
  for (const s of sites) if (!EN[s.k]) byFile[s.f] = (byFile[s.f] || 0) + 1
  console.log('  缺失分布：', JSON.stringify(byFile))
  console.log(`  前 ${Math.min(MAX, miss.length)} 条：`)
  miss.slice(0, MAX).forEach((k) => console.log('    ' + JSON.stringify(k).slice(0, 100)))
}
if (dead.length) {
  console.log(`  死键前 ${Math.min(MAX, dead.length)} 条：`)
  dead.slice(0, MAX).forEach((k) => console.log('    ' + JSON.stringify(k).slice(0, 100)))
}
