// 机械拼接会留下成片空行（本轮实测 registerDistill 365 行里有 120 行是空行）。
// 本件把「连续 ≥2 个空行」压成 1 个，**但跳过模板字符串内部**（多行模板里的空行是内容，不能动）。
import { readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'

const tidy = (file) => {
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const guarded = [] // [start, end) 不可动的区间（模板串 / 字符串）
  const visit = (n) => {
    if (ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) {
      guarded.push([n.getStart(sf), n.getEnd()])
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  const inGuard = (p) => guarded.some(([a, b]) => p >= a && p < b)

  const lines = text.split('\n')
  const out = []
  let blanks = 0
  let offset = 0
  for (const l of lines) {
    const lineStart = offset
    offset += l.length + 1
    if (l.trim() === '' && !inGuard(lineStart)) {
      blanks++
      if (blanks >= 2) continue
    } else {
      blanks = 0
    }
    out.push(l)
  }
  const next = out.join('\n')
  const before = lines.length - lines.filter((l) => l.trim() !== '').length
  const after = out.length - out.filter((l) => l.trim() !== '').length
  writeFileSync(file, next)
  return { before, after }
}

for (const f of process.argv.slice(2)) {
  const r = tidy(f)
  console.log(`${f}: 空行 ${r.before} → ${r.after}`)
}
