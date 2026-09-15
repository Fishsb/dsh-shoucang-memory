#!/usr/bin/env node
// audit-pane-deps.mjs — **pane 自由标识符全量审计**（UI1 收尾 · 2026-09-15）
//
// **判因（为什么必须新增这一件）**：人工视觉复核在「深度睡眠」页看到
//   `加载失败: dsFmtTime is not defined` —— 而**四个自动化门全绿**：
//     · 构建（esbuild）**不做未定义变量检查**；
//     · `ui-geo-regress` 的断言面不覆盖深睡页；
//     · `test-panel-view-contract` 只测「参数」「记忆库」；
//     · `check-client-syntax` A5 只监视「服务模块 + pane 间导出」——
//       `dsFmtTime`/`DS_STATE_TEXT` 属 **body.js 的本地符号**，不在其面内。
//   ⇒ 本件把 pane 的**全部自由标识符**做一次分类审计，**每一类都有明确判据**：
//
//   ✅ 内建（`BUILTINS` **显式列举**，非模式推导）→ 合法
//   ✅ 本文件内已声明（function/var/let/const/参数/**具名函数表达式**）→ 合法
//   ✅ 已 import → 合法
//   ❌ pane 导出（在别的 pane）→ 必须 import
//   ❌ 服务模块导出（UI/el/state/appState…）→ 必须 import
//   ❌ 其它 `src-client` 文件里的符号（含 `body.js` 顶层）→ 必须 import，或按域迁进本 pane
//   ❌ **全仓无定义** → 运行必崩（最硬的一类）
//   ⚠ 其余 → **也算失败**（说不清来源的自由标识符正是缺陷温床）
//
// 用法：node scripts/audit-pane-deps.mjs [--json]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REAL_DIR = join(root, 'src-client')
/* ── 目录可覆盖（供 `--selftest` 用临时夹具，**不碰真实树**）── */
const dirArg = process.argv.indexOf('--dir')
const DIR = dirArg > 0 ? process.argv[dirArg + 1] : REAL_DIR
if (!existsSync(join(DIR, 'body.js'))) { console.log('audit-pane-deps: body.js 缺席 ⇒ skip'); process.exit(3) }

/** 服务模块导出（**显式列举**；新增服务须同步此处，否则会被当作"未定义"而报） */
const SERVICES = {
  UI: './ui-kit.js', el: './dom.js', svg: './dom.js', ICONS: './dom.js',
  Derive: './derive.js', fmtTime: './derive.js',
  Bus: './state.js', Store: './state.js', Log: './state.js', Prog: './state.js', Cfg: './state.js', Fold: './state.js',
  setLogStatusSink: './state.js', appState: './app-state.js',
}
/** JS / 浏览器 / Node 内建（**显式列举** —— 模式推导会漏，实测漏过 Blob） */
const BUILTINS = new Set([
  'window', 'document', 'console', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'String', 'Number', 'Boolean', 'Object', 'Array', 'Math', 'JSON', 'Date', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Symbol', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'Function', 'Intl', 'URL', 'URLSearchParams',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'NaN', 'Infinity', 'undefined',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'AbortController', 'AbortSignal',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent',
  'Element', 'Node', 'NodeList', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'DocumentFragment',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'structuredClone', 'globalThis',
  'arguments', 'this', 'require', 'module', 'exports', 'process', 'Buffer', 'performance', 'crypto',
  'atob', 'btoa', 'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request', 'Response',
  'TextEncoder', 'TextDecoder', 'Image', 'Option', 'DOMException', 'EventTarget', 'Storage',
  'confirm', 'alert', 'prompt', 'getComputedStyle', 'matchMedia', 'scrollTo', 'open', 'close', 'print',
  'of', 'in', 'typeof', 'instanceof', 'void', 'delete', 'new', 'true', 'false', 'null',
])

/** AST：本文件"已声明"与"被自由使用"的标识符 */
function scan(src) {
  const sf = ts.createSourceFile('x.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const declared = new Set()
  const used = new Set()
  const w = (n) => {
    if ((ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n) || ts.isParameter(n)) && n.name && ts.isIdentifier(n.name)) declared.add(n.name.text)
    else if (ts.isImportSpecifier(n)) declared.add(n.name.text)
    else if (ts.isImportClause(n) && n.name) declared.add(n.name.text)
    /* **具名函数表达式**（`(function fillCap(){…})()` 的 `fillCap`）也是声明：
     *   首版漏了它 ⇒ 把合法的 IIFE 名字报成"未知来源"。 */
    else if (ts.isFunctionExpression(n) && n.name) declared.add(n.name.text)
    else if (ts.isClassDeclaration(n) && n.name) declared.add(n.name.text)
    else if (ts.isIdentifier(n)) {
      const p = n.parent
      const isPropName = p && ts.isPropertyAccessExpression(p) && p.name === n
      const isPropKey = p && ts.isPropertyAssignment(p) && p.name === n
      const isDeclName = p && (ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p) || ts.isParameter(p) ||
        ts.isImportSpecifier(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p))
      const isMethodName = p && (ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === n
      if (!isPropName && !isPropKey && !isDeclName && !isMethodName) used.add(n.text)
    }
    ts.forEachChild(n, w)
  }
  w(sf)
  return { declared, used }
}

const files = readdirSync(DIR).filter((x) => x.endsWith('.js') && !x.includes('.generated.'))
const info = new Map()
for (const f of files) info.set(f, scan(readFileSync(join(DIR, f), 'utf8')))

/** 全 `src-client` 的定义集合（用于区分"别处有定义"与"全仓无定义"） */
const definedSomewhere = new Map()   // name → 文件
for (const [f, { declared }] of info) for (const n of declared) if (!definedSomewhere.has(n)) definedSomewhere.set(n, f)

const panes = files.filter((x) => x.startsWith('panes-'))
const paneExports = new Map()
for (const f of panes) {
  const m = /export \{ ([^}]+) \}/.exec(readFileSync(join(DIR, f), 'utf8'))
  if (m) m[1].split(',').map((x) => x.trim()).filter(Boolean).forEach((n) => paneExports.set(n, f))
}

const HARD = []
const UNKNOWN = []
for (const f of panes) {
  const { declared, used } = info.get(f)
  const own = new Set(((/export \{ ([^}]+) \}/.exec(readFileSync(join(DIR, f), 'utf8')) || [, ''])[1]).split(',').map((x) => x.trim()))
  for (const id of [...used].sort()) {
    if (declared.has(id) || BUILTINS.has(id) || SERVICES[id]) continue
    if (own.has(id)) continue
    if (paneExports.has(id)) { HARD.push([f, id, `pane 导出（${paneExports.get(id)}）`]); continue }
    if (definedSomewhere.has(id)) { HARD.push([f, id, `定义在 ${definedSomewhere.get(id)}`]); continue }
    HARD.push([f, id, '**全 src-client 无定义 ⇒ 运行必崩**'])
  }
}

const json = process.argv.includes('--json')
if (json) {
  console.log(JSON.stringify({ panes: panes.length, hard: HARD.map(([f, i, w]) => ({ pane: f, id: i, why: w })) }, null, 2))
} else {
  console.log(`pane 依赖审计 · 扫 ${panes.length} 个 pane · 内建 ${BUILTINS.size} 个 · 服务 ${Object.keys(SERVICES).length} 个`)
  if (!HARD.length) {
    for (const f of panes) console.log(`  ✅ ${f}`)
  } else {
    const byFile = new Map()
    for (const [f, id, why] of HARD) { if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push([id, why]) }
    for (const [f, list] of byFile) {
      console.log(`  ❌ ${f}`)
      for (const [id, why] of list) console.log(`       ${id}  ← ${why}`)
    }
  }
  console.log(HARD.length
    ? `\nFAIL（${HARD.length} 个自由标识符无合法来源 —— 补 import，或按领域把它迁进该 pane）`
    : `\nPASS（所有 pane 的自由标识符都有明确来源）`)
}

/* ══ `--selftest`：**反例自证**（先红后绿纪律）══
 * 在**临时目录**造夹具：① 干净 pane ⇒ 必须 PASS；② 用了未导入的 body 本地符号 ⇒ 必须 FAIL；
 * ③ 用了全仓无定义的符号 ⇒ 必须 FAIL。**不触碰真实 src-client**。 */
if (process.argv.includes('--selftest')) {
  const { mkdtempSync, mkdirSync, writeFileSync: wf, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const tmp = mkdtempSync(join(tmpdir(), 'sc-paneaudit-'))
  mkdirSync(join(tmp, 'body.js') && tmp, { recursive: true })
  const run = (paneSrc) => {
    wf(join(tmp, 'body.js'), 'factory: function () {\n  function bodyHelper() { return 1; }\n  var BODY_VAR = 2;\n}\n', 'utf8')
    wf(join(tmp, 'panes-x.js'), paneSrc, 'utf8')
    try {
      execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--dir', tmp], { encoding: 'utf8', stdio: 'pipe' })
      return 0
    } catch (e) { return e.status || 1 }
  }
  const { execFileSync } = await import('node:child_process')
  let bad = 0
  const okc = (c, n) => { console.log(`${c ? '✅' : '❌'} ${n}`); if (!c) bad++ }
  okc(run('import { appState } from \'./app-state.js\'\nexport { zz }\nvar zz = appState.api\n') === 0, '反例①：干净 pane（只用 appState）⇒ PASS')
  okc(run('import { appState } from \'./app-state.js\'\nexport { zz }\nvar zz = bodyHelper()\n') === 1, '反例②：用了未导入的 body 本地符号 bodyHelper ⇒ FAIL（本门的核心判据）')
  okc(run('import { appState } from \'./app-state.js\'\nexport { zz }\nvar zz = totallyUndefinedThing()\n') === 1, '反例③：用了全仓无定义的符号 ⇒ FAIL')
  rmSync(tmp, { recursive: true, force: true })
  console.log(bad ? `\nFAIL（${bad} 条自证未过）` : '\nPASS（selftest：干净放行 / body 本地符号 / 全仓无定义 三类判定均已自证）')
  process.exit(bad ? 1 : 0)
}

process.exit(HARD.length ? 1 : 0)
