#!/usr/bin/env node
// check-inject-order.mjs —「共享句柄注入位置」不变量门（UI1/U2 · 2026-09-15）
//
// **判因（本会话最贵的一次踩坑，两个方向都错过）**：
//   `body.js` 在 `factory` 里把 10 个共享句柄注入 `appState`（`api`/`statusFn`/`refs`/…），
//   供 `panes-*.js` 模块经容器取用。**注入位置有两个反向的坏位置**：
//
//   · **太晚**（原处：`factory` 后部 L2839）⇒ `renderViewToggles` 的 4 个子渲染在
//     `apply`/`mount` → `show()` 时就被调用 ⇒ **调用早于注入** ⇒ `appState.api is not a function`
//     ⇒ 参数页 3 个 tab **静默空掉**（门报"基线 34 项 → 实测 13 项"，且**无异常抛出**）。
//
//   · **太早**（前移到 `factory` 顶部）⇒ `var` 声明（`refs` / `SWITCH_KEYS`）**没有提升值**
//     ⇒ 注入时仍是 `undefined` ⇒ `appState.switchKeys.forEach` 崩。
//     （函数声明有提升，所以"部分能用"—— **这正是它难查的原因**。）
//
//   ⇒ 唯一正确位置 = **「晚于所有声明」∩「早于任何调用」**。实测可行点是 **`factory` 体末尾、`return` 之前**。
//
// **本门断言**（AST，不靠正则猜）：
//   A1 每个 `appState.X = Y` 注入的 **Y 必须在同一作用域内被声明**，且**声明位置早于注入位置**；
//   A2 注入位置**必须早于** `factory` 里的 `return module.exports`（即确实在体内）；
//   A3 **反例自证**：把注入挪到声明之前 ⇒ A1 必须报（否则本门恒真）。
//
// 退出码：0 = pass · 1 = fail · 3 = skip
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BODY = join(root, 'src-client', 'body.js')
if (!existsSync(BODY)) { console.log('check-inject-order: body.js 缺席 ⇒ skip（exit 3）'); process.exit(3) }

/** 注入字段名 → 期望的 RHS 符号名（表是**显式列举**的，避免"模式推导"漏项 —— 见 AGENT 原则） */
export const INJECT_MAP = {
  api: 'api',
  statusFn: 'status',
  failFn: 'fail',
  refreshView: 'refreshCurrentView',
  refs: 'refs',
  flushFolds: 'flushFolds',
  switchKeys: 'SWITCH_KEYS',
  metaBadges: 'metaBadges',
  makeToggle: 'makeToggle',
  show: 'show',
  // UI1/U2（2026-09-15）第二轮：记忆板块 pane 所需句柄
  // ⚠ **加字段必须同时加这里** —— 否则新字段不被"晚于声明"断言覆盖（门只守表内项）。
  deferFold: 'deferFold',
  filterViewRows: 'filterViewRows',
  apiCtx: 'apiCtx',
  opCard: 'opCard',
  renderRunExtras: 'renderRunExtras',
  applyLogPanel: 'applyLogPanel',
}

/** 纯函数：给定源码，返回问题清单（供 selftest 驱动） */
export function checkOrder(text) {
  const sf = ts.createSourceFile('body.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const lineOf = (o) => text.slice(0, o).split('\n').length
  const decl = new Map()      // name → {ln, kind}
  const inj = []              // {field, rhs, ln, pos}
  let retPos = -1
  const walk = (n) => {
    if ((ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n)) && n.name && ts.isIdentifier(n.name)) {
      if (!decl.has(n.name.text)) decl.set(n.name.text, { ln: lineOf(n.getStart(sf)), kind: ts.isFunctionDeclaration(n) ? 'function' : 'var' })
    }
    /* **import 的绑定也算已声明**（UI1/U2 · 2026-09-15 补）：
     *   符号迁到 pane 模块后，`body.js` 改为 `import` 它 ⇒ 注入的 RHS 变成**导入绑定**。
     *   ESM 的 import **先于模块体求值** ⇒ 注入时必然可用，顺序上永远安全。
     *   早前本门只认 `function`/`var` 声明 ⇒ 对导入符号误报 `[未声明]`（实测 renderRunExtras）。 */
    if (ts.isImportSpecifier(n)) {
      if (!decl.has(n.name.text)) decl.set(n.name.text, { ln: lineOf(n.getStart(sf)), kind: 'import' })
    }
    if (ts.isReturnStatement(n) && n.expression && n.expression.getText(sf) === 'module.exports') retPos = n.getStart(sf)
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = n.left.getText(sf)
      const m = /^appState\.(\w+)$/.exec(left)
      if (m) inj.push({ field: m[1], rhs: n.right.getText(sf), ln: lineOf(n.getStart(sf)), pos: n.getStart(sf) })
    }
    ts.forEachChild(n, walk)
  }
  walk(sf)

  const problems = []
  for (const [field, expectedRhs] of Object.entries(INJECT_MAP)) {
    const hit = inj.find((x) => x.field === field)
    if (!hit) { problems.push(`[缺失] 未找到注入 \`appState.${field} = …\`（pane 模块依赖它，缺则运行时报 undefined）`); continue }
    if (hit.rhs !== expectedRhs) { problems.push(`[RHS 不符] appState.${field} 注入的是 \`${hit.rhs}\`，表期望 \`${expectedRhs}\``); continue }
    const d = decl.get(expectedRhs)
    if (!d) { problems.push(`[未声明] \`${expectedRhs}\` 在文件中找不到声明`); continue }
    if (!(d.ln < hit.ln)) {
      problems.push(`[**注入早于声明**] \`appState.${field} = ${expectedRhs}\` 在 L${hit.ln}，而 \`${expectedRhs}\`（${d.kind}）声明在 L${d.ln}` +
        (d.kind === 'var' ? ' —— **var 无提升值 ⇒ 注入时是 undefined**（函数声明有提升，故只有部分功能坏，极难查）' : '（函数声明有提升，侥幸可用，但不应依赖）'))
    }
    if (retPos >= 0 && !(hit.pos < retPos)) problems.push(`[不在体内] \`appState.${field}\` 注入在 \`return module.exports\` 之后 ⇒ 不在 factory 体执行路径上`)
  }
  return problems
}

if (process.argv[1] && process.argv[1].endsWith('check-inject-order.mjs')) {
  if (process.argv.includes('--selftest')) {
    let bad = 0
    const okc = (c, n) => { console.log(`${c ? '✅' : '❌'} ${n}`); if (!c) bad++ }
    const mk = (body) => `factory: function (require) {\n  var module = { exports: {} };\n${body}\n  return module.exports;\n}`
    const injAll = Object.entries(INJECT_MAP).map(([f, r]) => `  appState.${f} = ${r};`).join('\n')
    const decls = Object.values(INJECT_MAP).map((r) => `  function ${r}() {}`).join('\n')
    // 注意：var 类符号用 var 声明以复现"无提升值"
    const declsMixed = Object.values(INJECT_MAP).map((r) => (/^(refs|SWITCH_KEYS)$/.test(r) ? `  var ${r} = 1;` : `  function ${r}() {}`)).join('\n')
    okc(checkOrder(mk(declsMixed + '\n' + injAll)).length === 0, '正常：全部声明在前、注入在 return 之前 ⇒ 无错')
    okc(checkOrder(mk(injAll + '\n' + declsMixed)).some((p) => p.includes('注入早于声明')), '反例：注入挪到声明之前 ⇒ 报"注入早于声明"（本门真的在判）')
    okc(checkOrder(mk(declsMixed)).some((p) => p.includes('缺失')), '反例：删掉全部注入 ⇒ 报"缺失"')
    console.log(bad ? `\nFAIL（${bad} 条自证未过）` : '\nPASS（selftest：缺失 / 顺序颠倒 两类判定均已自证）')
    process.exit(bad ? 1 : 0)
  }
  const problems = checkOrder(readFileSync(BODY, 'utf8'))
  console.log(`共享句柄注入位置门 · 表内 ${Object.keys(INJECT_MAP).length} 个字段`)
  if (problems.length) {
    console.log('')
    problems.forEach((p) => console.log('❌ ' + p))
    console.log(`\nFAIL（${problems.length} 项）`)
    process.exit(1)
  }
  console.log('\nPASS（注入均晚于声明、且位于 factory 体执行路径上）')
}
