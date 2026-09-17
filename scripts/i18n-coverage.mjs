/** 诊断：未承载 CJK 字面量的按文件分布 + 按上下文分类（装载期表 / Log / 渲染期） */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const CJK = /[\u4e00-\u9fff]/

const files = readdirSync(SRC).filter((f) => f.endsWith('.js') && !f.includes('.generated.') && !f.startsWith('.'))
const per = {}
let totalCjk = 0, wrapped = 0
const kinds = { logArg: 0, inTable: 0, inCall: 0, other: 0 }
const samples = { inTable: [], logArg: [], inCall: [], other: [] }

for (const f of files) {
  const src = readFileSync(join(SRC, f), 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  let unwrapped = 0
  const visit = (n) => {
    if (ts.isStringLiteral(n) && CJK.test(n.text)) {
      totalCjk++
      // 是否作为 tr()/tagLabel() 的实参？
      let p = n.parent, isTr = false, depth = 0
      while (p && depth < 3) {
        if (ts.isCallExpression(p)) {
          const c = p.expression.getText(sf)
          if (/(^|\.)(tr|tagLabel)$/.test(c)) { isTr = true }
          break
        }
        p = p.parent; depth++
      }
      if (isTr) { wrapped++; }
      else {
        unwrapped++
        // 上下文分类
        let q = n.parent, d2 = 0, kind = 'other'
        while (q && d2 < 8) {
          if (ts.isPropertyAssignment(q) || ts.isArrayLiteralExpression(q)) { kind = 'inTable'; break }
          if (ts.isCallExpression(q)) {
            const c = q.expression.getText(sf)
            if (/^Log\./.test(c)) kind = 'logArg'
            else kind = 'inCall'
            break
          }
          if (ts.isVariableDeclaration(q) || ts.isBinaryExpression(q)) { kind = 'inTable'; break }
          q = q.parent; d2++
        }
        kinds[kind] = (kinds[kind] || 0) + 1
        if (samples[kind].length < 6) samples[kind].push(f + ':' + (sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1) + ' 「' + n.text.slice(0, 40) + '」')
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  if (unwrapped) per[f] = unwrapped
}

console.log('CJK 字面量 ' + totalCjk + ' · 经 tr() 承载 ' + wrapped + ' · 未承载 ' + (totalCjk - wrapped))
console.log('\n按文件（未承载）：')
Object.entries(per).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log('  ' + String(n).padStart(5) + '  ' + f))
console.log('\n按上下文分类：')
for (const [k, v] of Object.entries(kinds)) {
  console.log('  ' + String(v).padStart(5) + '  ' + k)
  samples[k].forEach((s) => console.log('         ' + s))
}
