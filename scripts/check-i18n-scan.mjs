/**
 * check-i18n-scan — 用户可见串扫描与逻辑耦合守卫（v2.1 §7）
 *
 * **它解决两个不同的问题**（缺一不可）：
 *   ① **漏抽守卫**：「有人新写了中文硬编码却没进词表」——扫 `src-client/**` 的 CJK 字面量，
 *      白名单外的每一条都必须**经 tr() 第二参**进入（即认得出它是「已登记的文案」）。
 *   ② **逻辑耦合红线**：CJK 字面量出现在**比较/分支**任一侧 ⇒ 无条件红、不许白名单。
 *      判因（实测）：全仓曾有 4 处拿文案做逻辑判断（`m.effect === '需重载'` /
 *      `textContent.trim() === '设置'` / `s[0] === '停滞'` ×2）。这类缺陷**切语言即静默失效**
 *      （不崩溃、行为悄悄变错），是 i18n 改造里最危险的一类。
 *
 * **口径要点（实测踩过的坑）**：
 *   · esbuild 产物把 CJK 转义成 `\uXXXX` ⇒ 本件扫**源码**（未转义），产物核对另行处理。
 *   · 必须**排除** `*.bak-*`（源码目录躺着 4 个 320KB 备份）、`*.generated.*`（生成物禁手改）、
 *     `.vendor-css.generated.js` —— 不排除即假红。
 *   · 注释用 **AST** 天然不在面内（本件只遍历字符串字面量节点），无需手写去注释正则。
 *
 * 退出码：0 PASS · 1 FAIL（发现未登记串或逻辑耦合）· 3 跳过（无源码目录）
 * 用法：node scripts/check-i18n-scan.mjs [--selftest] [--verbose]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const VERBOSE = process.argv.includes('--verbose')
const SELFTEST = process.argv.includes('--selftest')

/** 扫描面排除项（每条带理由；新增须说明为何该文件不含用户可见串）。 */
const EXCLUDE_PATTERNS = [
  [/\.bak-/, '源码目录内的历史备份（4 个 320KB .bak-p1-*）——非交付面'],
  [/\.generated\./, '生成物（panel-contract.generated.js 等）禁手改，其串源于 host 契约表'],
  [/^\.vendor-css\.generated\.js$/, '第三方组件库主题令牌层，非本仓文案'],
]

/**
 * 允许保留的 CJK 白名单：**逐条带理由**。
 * 判定原则：**非用户可见**（面向开发者/日志/LLM）或**已是 i18n 承载位**。
 */
const CJK_ALLOWLIST = [
  // tr() 的第二参是「中文原文」，本身就是 i18n 的承载位（v2.1 §7 R10 裁定）
  { kind: 'tr-arg', note: 'tr(key, 中文) 的中文原文——i18n 承载位，允许内联' },
]

/** 需要扫描的源文件（排除面在此外收口）。 */
function scanFiles () {
  if (!existsSync(SRC)) return null
  const out = []
  for (const name of readdirSync(SRC)) {
    if (!name.endsWith('.js')) continue
    let excluded = null
    for (const [re, why] of EXCLUDE_PATTERNS) if (re.test(name)) { excluded = why; break }
    if (excluded) { if (VERBOSE) console.log(`  · 排除 ${name}（${excluded}）`); continue }
    out.push(name)
  }
  return out.sort()
}

const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/

/** 比较/分支运算符（CJK 出现在其任一侧 ⇒ 逻辑耦合红线）。 */
const COMPARE_KINDS = new Set([
  ts.SyntaxKind.BinaryExpression,       // === !== == != < > 等
  ts.SyntaxKind.SwitchStatement,        // switch(x){case '停滞':}
  ts.SyntaxKind.CaseClause,             // case 侧
])

/**
 * 找出一条 CJK 字面量所在的**最内层**父链，判断它是否位于比较/分支位置。
 * @returns {nullable} 命中的运算符描述，或 null
 */
function compareContext (node) {
  let p = node.parent
  let depth = 0
  while (p && depth < 8) {
    // ① 匹配类调用（纯 CallExpression，如 `arr.includes('环境')` / `s.indexOf('停滞')`）——
    //    必须在二元比较之前判，否则这类形态会被漏掉（--selftest 抓到过这个假绿）。
    if (ts.isCallExpression(p)) {
      const callee = p.expression && p.expression.getText ? p.expression.getText(p.getSourceFile()) : ''
      if (/\.(includes|indexOf|lastIndexOf|startsWith|endsWith|match|test|search)$/.test(callee)) {
        return `匹配调用 (${callee})`
      }
      return null   // 其他调用（如 tr(...)）不是逻辑位置
    }
    // ② 二元比较：字面量在左或右
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken && p.operatorToken.kind
      if (op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
          op === ts.SyntaxKind.EqualsEqualsToken ||
          op === ts.SyntaxKind.ExclamationEqualsToken) {
        return `比较运算 (${p.operatorToken.getText(p.getSourceFile())})`
      }
    }
    if (ts.isCaseClause(p)) return 'switch-case 分支'
    if (ts.isIfStatement(p) && p.expression === node) return 'if 条件'
    // 遇到语句/函数边界就停
    if (ts.isStatement(p) || ts.isFunctionLike(p)) return null
    p = p.parent
    depth++
  }
  return null
}

/** 判断字面量是否为 tr(...)/tn(...) 的实参位置（i18n 承载位）。 */
function isTrArg (node) {
  let p = node.parent
  let idx = -1
  if (ts.isCallExpression(p)) {
    const callee = p.expression && p.expression.getText ? p.expression.getText(p.getSourceFile()) : ''
    if (!/\btr$|\btn$/.test(callee)) return false
    return p.arguments.indexOf(node) >= 0
  }
  return false
}

/** 遍历一个源文件的字符串字面量，收集 CJK 串及其位置。 */
function collect (fileName, text) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  const hits = []
  const visit = (node) => {
    const isStr = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    if (isStr && CJK.test(node.text)) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      hits.push({
        file: fileName,
        line: line + 1,
        col: character + 1,
        text: node.text,
        compare: compareContext(node),
        trArg: isTrArg(node),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

function run () {
  const files = scanFiles()
  if (files === null) { console.log('check-i18n-scan：未找到 src-client/ —— 跳过（exit 3）'); process.exit(3) }

  let total = 0
  const violations = []   // 逻辑耦合：无条件红
  const unregistered = [] // 非 tr 第二参、非白名单的 CJK 串
  for (const f of files) {
    let hits
    try { hits = collect(f, readFileSync(join(SRC, f), 'utf8')) } catch (e) {
      console.error(`check-i18n-scan ✗ 解析失败 ${f}: ${e.message}`); process.exit(1)
    }
    for (const h of hits) {
      total++
      if (h.compare) { violations.push(h); continue }
      if (h.trArg) continue                     // i18n 承载位，允许
      unregistered.push(h)
    }
  }

  console.log(`check-i18n-scan · 扫描 ${files.length} 个源文件 · CJK 字面量 ${total} 处`)
  if (VERBOSE && unregistered.length) {
    console.log('  —— 尚未经 tr() 承载的串（漏抽候选，前 20）——')
    unregistered.slice(0, 20).forEach((h) => console.log(`    ${h.file}:${h.line} 「${h.text.slice(0, 42)}」`))
  }

  if (violations.length) {
    console.error('')
    console.error(`✗ 逻辑耦合红线：${violations.length} 处 CJK 字面量参与比较/分支（切语言即静默失效，不许白名单）`)
    violations.forEach((h) => console.error(`    ${h.file}:${h.line}:${h.col} 「${h.text}」 ← ${h.compare}`))
    process.exit(1)
  }

  console.log('  ✓ 逻辑耦合：0 处（CJK 未参与任何比较/分支）')
  console.log(`  · 未承载串（漏抽候选）：${unregistered.length} 处 —— 随分期收敛至 0`)
  console.log('check-i18n-scan: PASS')
  process.exit(0)
}

/** --selftest：用合成样本证明「红线会红、干净样本不误报」（防恒真）。 */
function selftest () {
  const bad = [
    ["const a = (m.effect === '需重载')", '比较运算'],
    ["switch (s) { case '停滞': break }", 'switch-case 分支'],
    ["if (arr.includes('环境')) {}", '匹配调用'],
    ["const x = (t !== '设置')", '比较运算'],
  ]
  const good = [
    ["var s = tr('nav.memory', '记忆库')", 'tr 承载位'],
    ["var label = tagLabel(tag, loc)", '无 CJK 字面量'],
  ]
  let pass = 0, fail = 0
  for (const [code, why] of bad) {
    const hits = collect('synthetic.js', code)
    const coupled = hits.some((h) => h.compare)
    if (coupled) { pass++; console.log(`  ✓ 合成违规必红：${why}`) }
    else { fail++; console.error(`  ✗ 合成违规未红（假绿！）：${why} ← ${code}`) }
  }
  for (const [code, why] of good) {
    const hits = collect('synthetic.js', code)
    const coupled = hits.some((h) => h.compare)
    if (!coupled) { pass++; console.log(`  ✓ 合成干净不误报：${why}`) }
    else { fail++; console.error(`  ✗ 合成干净被误报：${why} ← ${code}`) }
  }
  console.log(`\n--selftest: ${pass} PASS / ${fail} FAIL`)
  process.exit(fail ? 1 : 0)
}

if (SELFTEST) selftest(); else run()
