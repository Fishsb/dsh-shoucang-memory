/**
 * i18n-convert — 把 pane 里的用户可见中文串机械转换为 tr(key, '中文')（2026-09-17）
 *
 * **为什么需要它**：待译串实测 1263 处，逐条手改既慢又会漏、且极易改错（漏一个逗号就 SyntaxError）。
 *   本件把「识别 → 生成键 → 改写 → 补词表」四步机械化，人只做**审查**。
 *
 * **安全规则（宁可少转，不可转错）**：
 *   · 只处理**字符串字面量**节点（AST 取），注释天然不在面内。
 *   · **排除 Log/console 调用内的串**——它们面向开发者，翻译无用户价值且污染 diff（v2.1 §4.1）。
 *   · **排除**已含 `{`/`}` 模板占位且形态复杂者、正则字面量、以及 `data-*`/CSS 类名等非文案串。
 *   · 跳过**已是 tr(...) 实参**的串（幂等：重复运行不叠加）。
 *   · 生成后**必须能构建通过**——本件不写文件前先 dry-run 打印，加 --apply 才落盘。
 *
 * 用法：
 *   node scripts/i18n-convert.mjs <源文件相对路径> [--ns mem] [--apply]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const FILE = args.find((a) => !a.startsWith('--'))
const NS = (args.find((a) => a.startsWith('--ns=')) || '--ns=x').split('=')[1]
const APPLY = args.includes('--apply')

if (!FILE) { console.error('用法: node scripts/i18n-convert.mjs <文件> [--ns=mem] [--apply]'); process.exit(2) }

const CJK = /[\u4e00-\u9fff]/
const abs = join(ROOT, FILE)
if (!existsSync(abs)) { console.error('文件不存在: ' + abs); process.exit(2) }
const text = readFileSync(abs, 'utf8')

/** 判定某节点是否应跳过转换。 */
function shouldSkip (node, sf) {
  const s = node.text
  if (!CJK.test(s)) return true
  // ① 已是 tr(...) 的实参（幂等）
  let p = node.parent
  if (ts.isCallExpression(p)) {
    const callee = p.expression.getText(sf)
    if (/(^|\.)tr$/.test(callee)) return true
  }
  // ② Log / console 调用内的串（面向开发者）
  let q = node.parent, depth = 0
  while (q && depth < 4) {
    if (ts.isCallExpression(q)) {
      const callee = q.expression.getText(sf)
      if (/^(Log|console)\./.test(callee) || /^Log$/.test(callee)) return true
      break
    }
    if (ts.isStatement(q)) break
    q = q.parent; depth++
  }
  /* ③ 【关键】跳过**参与逻辑判断**的字面量（比较/分支任一侧）。
   *
   *  判因（实测踩过一次，2026-09-17 · 我的转换器自己造的缺陷）：
   *   原实现把 `s[0] === '停滞'` 机械地包成 `s[0] === tr("停滞")` ——
   *   **保留了比较语义**，只是把中文挪进了函数调用。
   *   危害与「字面量直接比较」**完全相同**：切语言后 `tr()` 返回英文，比较恒 false ⇒ 静默失效；
   *   而 `check-i18n-scan` 的 AST 判据只看 `StringLiteral` 节点 ⇒ **看不见这种形态**。
   *   ⇒ 转换器必须**拒绝转换**这类位点：它们需要**人工按状态键重构**（如 `s[0] === 'stalled'`），
   *     而不是套一层 tr() 就完事。 */
  /* ③b 【关键】跳过**对象字面量的属性值** —— 那几乎总是「装载期建的表」。
   *
   *  判因（实测踩过，本类缺陷第 3 次）：`var CTRL_META = { x: { scope: '全局注入' } }` 被机械包成
   *  `scope: tr("全局注入")` —— 表在**装载期**建（locale 尚未接入）⇒ `tr()` 取不到词表，
   *  值被**冻死为中文**，切英文后徽章仍是中文（en 全页验收才抓出来）。
   *  ⚠ 正确做法是 **表存语义键、读取期分派**（见 body.js 的 `ctrlScopeText` / `ctrlEffectText`）。 */
  if (isTablePropertyValue(node)) return true
  if (isInComparison(node)) return true
  /* ④ 跳过**装载期求值**的字面量 —— 只转「渲染期」（函数体内、且不被立即调用）的串。
   *
   *  判因（实测踩过两次，2026-09-17）：
   *   `tr` 只在 `body.js` 的 factory 内可用；而各 pane 模块被 esbuild 提升到
   *   `__ModuleLoader__.load` **之外**求值。凡是**装载期就求值**的表达式里调 `tr()`
   *   ⇒ 抛 `ReferenceError: tr is not defined` ⇒ **整个 bundle 不注册**（面板完全消失、无任何提示）。
   *
   *  踩到的两个形态：
   *   ① 模块顶层 `var SUITE_STATUS = { text: tr('已装配') }`（裸顶层）
   *   ② IIFE 内的常量表 `var Derive = (function(){ var VEC_LABEL = { fusion: tr('融合') }; … })()`
   *      —— 它虽在函数体内，但 IIFE **装载期立即执行** ⇒ 同样炸。
   *
   *  保守判据（宁可少转，不可转错）：**只有位于「非 IIFE 的具名函数/方法」内**的串才转。
   *  这些函数在装载期不会被调用（渲染时才调），`tr` 此时已可用。 */
  if (isLoadTimeEvaluated(node)) return true
  // ⑤ 形态复杂的串：含换行、或纯符号/空白
  if (/\n/.test(s)) return true
  if (!/[\u4e00-\u9fff]/.test(s.replace(/[\s·—…「」（）()]/g, ''))) return true
  // ⑤ 形如 CSS 类名 / data 属性的（含空格分隔的纯 ASCII 片段）
  if (/^[a-z0-9\-_ ]+$/i.test(s)) return true
  return false
}

/**
 * 该字面量是否在**装载期就会求值**（⇒ 不得调 tr()，因 tr 只在 factory 内可用）。
 *
 * 判据（保守）：只有在「**非立即调用的具名函数/方法**」内的串才返回 false（可转）。
 * 其余一律视为装载期求值 ⇒ 跳过。具体：
 *   · 走在函数体外的语句里（模块顶层 `var X = {a: '中文'}`）      ⇒ 装载期 ⇒ 跳过
 *   · 走在 IIFE 内（`(function(){ … })()`，装载期立即执行）        ⇒ 装载期 ⇒ 跳过
 *   · 走在具名函数声明 / 对象方法 / 箭头函数（未被立即调用）内     ⇒ 渲染期 ⇒ 可转
 */
function isLoadTimeEvaluated (node) {
  let p = node.parent
  while (p && !ts.isSourceFile(p)) {
    if (ts.isFunctionLike(p)) {
      // 该函数是否**被立即调用**（IIFE）？是 ⇒ 其函数体在装载期执行 ⇒ 装载期。
      if (isImmediatelyInvoked(p)) return true
      // 具名函数声明 / 对象方法 / 普通回调 ⇒ 装载期不执行函数体 ⇒ 渲染期安全。
      return false
    }
    p = p.parent
  }
  return true   // 全程无函数 ⇒ 模块顶层 ⇒ 装载期
}

/**
 * 该字面量是否**参与逻辑判断**（比较运算任一侧 / switch-case / 匹配类调用实参）。
 *
 * 判因（实测，2026-09-17 · 转换器自己造过的缺陷）：
 *   把 `s[0] === '停滞'` 转成 `s[0] === tr("停滞")` **保留了比较语义**——
 *   切语言后 tr() 返回英文，比较恒 false ⇒ 静默失效；而扫描件的 AST 判据只看字面量节点，
 *   **看不见这个形态**（须靠 i18n-blindspot.mjs 才查得出）。
 *   ⇒ 这类位点**必须人工按状态键重构**（`s[0] === 'stalled'`），不接受机械包裹。
 */
/** 该字面量是否**直接**是对象字面量的属性值（⇒ 视为装载期表数据，拒绝转换）。
 *  ⚠ 保守判据：宁可少转（留待人工按「语义键 + 读取期分派」处理），不可转错（冻死语言）。 */
function isTablePropertyValue (node) {
  return !!(node.parent && ts.isPropertyAssignment(node.parent) &&
    node.parent.parent && ts.isObjectLiteralExpression(node.parent.parent))
}
function isInComparison (node) {
  const CMP = new Set([
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
  ])
  let p = node.parent
  let depth = 0
  while (p && depth < 6) {
    if (ts.isBinaryExpression(p) && CMP.has(p.operatorToken.kind)) return true
    if (ts.isCaseClause(p) || ts.isSwitchStatement(p)) return true
    if (ts.isCallExpression(p)) {
      const c = p.expression.getText(p.getSourceFile())
      if (/\.(includes|indexOf|lastIndexOf|startsWith|endsWith)$/.test(c)) return true
      return false
    }
    if (ts.isStatement(p) || ts.isFunctionLike(p)) return false
    p = p.parent; depth++
  }
  return false
}

/** 该函数节点是否被立即调用（`(function(){…})()` / `(() => {…})()`）。 */
function isImmediatelyInvoked (fn) {
  let q = fn.parent
  while (q && ts.isParenthesizedExpression(q)) q = q.parent
  if (!q) return false
  if (ts.isCallExpression(q)) {
    // 直接调用 或 .call/.apply 调用
    return q.expression === fn || (ts.isParenthesizedExpression(q.expression) && q.expression.expression === fn)
  }
  return false
}

/** 由中文原文生成键。
 *  **设计抉择**：用**中文原文本身**当键（而非哈希/人工命名）。
 *  理由：① 代码里 `tr('记忆库')` 一眼可读，审查时不必回头查词表；
 *        ② 词表即 `{'中文': 'English'}`，可直接通读、可 diff、可交给翻译；
 *        ③ 省掉上千个易漂移的键名（实测 1263 处串）。
 *  风险：中文原文若被改动，键随之变化 ⇒ en 词条失配。该风险由
 *        `check-i18n-keys` 断言 A（双向键集一致）正面拦截，不会静默。 */
function keyOf (s) {
  return s
}

function main () {
  const sf = ts.createSourceFile(basename(abs), text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  const targets = []
  const visit = (node) => {
    if (ts.isStringLiteral(node) && !shouldSkip(node, sf)) {
      targets.push({ node, start: node.getStart(sf), end: node.getEnd(), text: node.text })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  console.log(`i18n-convert · ${FILE} · 待转 ${targets.length} 处`)
  const entries = {}
  for (const t of targets) { entries[t.text] = t.text }
  console.log(`  → 去重后 ${Object.keys(entries).length} 条唯一原文（原文即键）`)
  if (!APPLY) {
    console.log('  （dry-run；加 --apply 才写盘）示例：')
    targets.slice(0, 10).forEach((t) => console.log(`    L${sf.getLineAndCharacterOfPosition(t.start).line + 1}  ${JSON.stringify(t.text).slice(0, 58)}`))
    return
  }

  // 从后往前替换（避免位移）
  let out = text
  for (const t of targets.slice().sort((a, b) => b.start - a.start)) {
    /* 转义：用 JSON.stringify 生成**双引号**字面量（对引号/反斜杠/换行都正确），
     * 保持双引号形态即可——本仓源码两种引号风格混用，无需强转单引号
     * （此前把 JSON 的 `"` 强行换成 `'` 而没处理内部的 `\'`，生成了 `tr('\'文本\'')` 这种坏码）。 */
    const repl = `tr(${JSON.stringify(t.text)})`   // 原文即键：单参形态
    out = out.slice(0, t.start) + repl + out.slice(t.end)
  }

  /* ── 写盘前的**语法自检**（防止再次产出坏码）──
   * 判因（实测踩过一次）：转义写错会静默产出 `tr('\'文本\'')` 这类语法坏码，
   *   而本件在 --apply 时直接落盘 ⇒ 坏码进仓、要到构建才炸。
   *   这里先解析改写后的源码，语法不通即**拒绝写盘**并原样保留文件。 */
  {
    const parsed = ts.createSourceFile(basename(abs), out, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
    const diags = parsed.parseDiagnostics || []
    if (diags.length) {
      console.error(`  ✗ 语法自检失败（${diags.length} 处）——**已拒绝写盘**，文件保持原样：`)
      diags.slice(0, 5).forEach((d) => {
        const pos = d.start !== undefined ? parsed.getLineAndCharacterOfPosition(d.start) : null
        console.error(`      ${pos ? 'L' + (pos.line + 1) + ':' : ''} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)
      })
      process.exit(1)
    }
  }
  // 确保 import 了 tr
  /* 必须用**多行匹配**定位最后一条 import——不能假设文件以 import 开头。
   *  实测踩过（2026-09-17）：本仓 pane 普遍以模块头注释块开头，按「文件开头就是 import」
   *  来插会**永不匹配** ⇒ import 从未插入，而 tr() 调用遍布全文 ⇒ 渲染期抛
   *  ReferenceError: tr is not defined ⇒ KPI/操作卡整块不渲染（构建与语法检查都不报）。 */
  if (!/import\s*\{[^}]*\btr\b[^}]*\}\s*from\s*['"]\.\/i18n\.js['"]/.test(out)) {
    const importRe = /^import\s[^\n]*\n/gm
    let lastEnd = -1
    let mm
    while ((mm = importRe.exec(out)) !== null) lastEnd = mm.index + mm[0].length
    const inject = "import { lang, tr } from './i18n.js'\n"
    out = lastEnd >= 0 ? (out.slice(0, lastEnd) + inject + out.slice(lastEnd)) : (inject + out)
  }
  writeFileSync(abs, out, 'utf8')
  console.log(`  ✓ 已写入 ${FILE}`)
  console.log(`  · 词表条目（请合并进 i18n-dict-*.js）：`)
  Object.entries(entries).forEach(([k, v]) => console.log(`      '${k}': ${JSON.stringify(v)},`))
}

main()
