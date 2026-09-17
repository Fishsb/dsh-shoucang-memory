/**
 * i18n-blindspot — 扫描器盲区探针（只读诊断 · 2026-09-17）
 *
 * **背景（实测发现）**：`check-i18n-scan` 的红线是「**CJK 字面量**出现在比较/分支任一侧」。
 *   但存在一类它**天然看不到**的等价坏形态：
 *
 *     `s[0] === tr("停滞")`      —— 比较边是**函数调用**，不是字面量
 *     `if (x === tr('需重载'))`  —— 同上
 *
 *   AST 遍历只看 `StringLiteral` 节点，故这类写法**不红**；
 *   而它的危害与字面量版**完全一样**：切语言后 `tr()` 返回英文，比较恒 false ⇒ **静默失效**。
 *   实测位点：`src-client/panes-suite.js` 的 `s[0] === tr("停滞")`（另一会话的改造形态）。
 *
 * **本件的定位**：**诊断工具，不进 CHECKS**（它报的是「可疑形态」，不是「确凿违规」——
 *   例如把 tr() 结果与**用户输入**比较是合理的）。用于人工复核，或作为将来收紧
 *   `check-i18n-scan` 判据（把「比较边含 tr() 调用」也纳入红线）的依据。
 *
 * 用法：node scripts/i18n-blindspot.mjs
 * 退出码：0 = 无此类位点 · 1 = 存在可疑位点（诊断用，不作为 CI 门禁）
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
if (!existsSync(SRC)) { console.log('i18n-blindspot：未找到 src-client/ —— 跳过'); process.exit(0) }

const CMP = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
])

/** 该表达式是否含 tr()/tagLabel() 调用（即"值来自词表"）。 */
function hasTrCall (node, sf) {
  let found = false
  const walk = (n) => {
    if (found) return
    if (ts.isCallExpression(n)) {
      const c = n.expression.getText(sf)
      if (/(^|\.)(tr|tagLabel|navLabelById|navGroupByKey)$/.test(c)) { found = true; return }
    }
    ts.forEachChild(n, walk)
  }
  walk(node)
  return found
}

const hits = []
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.js') && !/\.bak-|\.generated\./.test(x))) {
  const src = readFileSync(join(SRC, f), 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  const visit = (n) => {
    if (ts.isBinaryExpression(n) && CMP.has(n.operatorToken.kind)) {
      const left = hasTrCall(n.left, sf)
      const right = hasTrCall(n.right, sf)
      // 只有**一边**是 tr() 结果、另一边不是 ⇒ 可疑（两边都同一函数结果则无意义，跳过）
      if (left !== right) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf))
        hits.push({ file: f, line: line + 1, text: n.getText(sf).replace(/\s+/g, ' ').slice(0, 100) })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

console.log(`i18n-blindspot · 扫描 ${SRC}`)
console.log(`  可疑位点（一侧为 tr()/tagLabel() 结果、另一侧不是）：${hits.length}`)
hits.forEach((h) => console.log(`    ${h.file}:${h.line}  ${h.text}`))
if (hits.length) {
  console.log('')
  console.log('  ⚠ 这类形态与「CJK 字面量参与比较」**危害相同**（切语言即静默失效），')
  console.log('    但 check-i18n-scan 的 AST 判据只看字面量节点 ⇒ **看不到它们**。')
  console.log('    处置建议：改为按**状态键**比较（如 s[0] === "stalled"），或把 tr() 结果先落变量再比。')
  process.exit(1)
}
console.log('  ✓ 无此类位点')
process.exit(0)
