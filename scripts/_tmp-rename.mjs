// 共用：把「闭包里的裸名」改到句柄上（**AST 感知**）。
//
// ⚠ 为什么不能用纯正则（本轮实锤翻车）：
//   `join(kRoot, 'audit', 'distill-watermark.jsonl')` 里的 **字符串字面量** `'audit'` 和
//   `SHORT + '.log'` 里的 `log` 会被 `\bname\b` 命中 ⇒ 路径被改成 `'infra.audit'`/`'.infra.log'`。
//   这是**静默的语义损坏**（typecheck 完全拦不住，只有运行期路径错）。
//   ⇒ 只改**真正的标识符引用**：用 TS AST 定位 Identifier，并排除
//      ① 属性访问名（`x.log` 的 log）② 属性键名（`{ log: … }`）③ 简写属性（单独处理）
//
// 简写属性 `{ log, audit }` 必须转成 `{ log: infra.log, audit: infra.audit }` ——
//   直接整体替换会得到 `{ infra.log }`，那是**语法错误**。
import ts from 'typescript'

export function renameInSource(src, renames) {
  const map = new Map(renames)
  if (!map.size) return src
  const sf = ts.createSourceFile('__r.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const edits = []
  const visit = (n) => {
    if (ts.isIdentifier(n) && map.has(n.text)) {
      const p = n.parent
      const isKeyOrAccess = p && (
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isPropertySignature(p) && p.name === n) ||
        (ts.isQualifiedName(p) && p.right === n) ||
        (ts.isMethodDeclaration(p) && p.name === n)
      )
      if (ts.isShorthandPropertyAssignment(p) && p.name === n) {
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${n.text}: ${map.get(n.text)}` })
      } else if (!isKeyOrAccess) {
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: map.get(n.text) })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  edits.sort((a, b) => b.start - a.start)
  let out = src
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}
