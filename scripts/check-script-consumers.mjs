#!/usr/bin/env node
/**
 * check-script-consumers.mjs — **消费方必须与产者同源**（2026-09-22 立 · ADR-328）
 *
 * ── 判因（真机实测回归，本轮新发现 · 此前无任何档登记）──────────────────────
 * 上一轮（`4fa315a`）把 `eval-gate.mjs` 的样本集从**字面量数组**改为**运行期构建器**：
 *   `const SAMPLES = [ …20 条… ]`  →  `const SAMPLES = (() => { … buildSamples({bank}) … })()`
 * 9 个兄弟消费者**都已正确改 import `scripts/eval-samples.mjs`**，**漏了 2 个**：
 *   · `_memory/audit/baseline-lab.mjs:32`        `indexOf('const SAMPLES = [')` ⇒ `< 0` ⇒ **exit 2**
 *   · `_memory/audit/baseline-lab-verify.mjs:35` `.match(/const SAMPLES = (\[[\s\S]*?\n\])/)[1]` ⇒ **null[1] 崩**
 * **而 `check-runner` 全绿** —— 两条叠加的盲区：
 *   ① 它们住 `_memory/`（`.gitignore:29` 已 ignore）⇒ 不在 `git ls-files` 面内；
 *   ② 它们**未登记 `CHECKS`** ⇒ 按仓规则 6「未登记 = 等于没写」，`npm test` 永不碰它们。
 * 后果不止"工具坏了"：那两件正是「TF-IDF+LR 基线 vs laya」那笔账的工具 ⇒ **账从"没做"变成"做不了"**
 * （末次成功出数 09-21 09:29，迁移在 09-22 12:37 ⇒ 一天无人察觉）。
 *
 * ── 判据（两条；**判据不是表态，故各含反例自证**）──────────────────────────
 *
 * ① **无安全网的源码文本取数**：文件读取另一模块源码、用 `indexOf('const X = …')` /
 *    `.match(/const X = …/)` **抠它的声明**，且**该文件不在 `CHECKS` 表内** ⇒ 判红。
 *
 *    ⚠ **为什么判据里要带「不在 CHECKS 表内」这一条**（本件首版**漏了它，实测 9 处里 7 处是假红**）：
 *      本仓 `scripts/check-*.mjs` / `audit-*.mjs` / `test-*.mjs` **本来就以"读源码做断言"为业**
 *      （`check-arch-sync` 数 `CHECKS` 行数 · `check-carriers` 比 `/set` 白名单 · `check-panel-contract`
 *      比白名单三向一致）—— 那是**正当**的：它们**每次 `npm test` 都跑**，产者一变**当场红**。
 *      ⇒ 真正的病灶**不是"读文本"**，而是「**读文本 + 没有安全网**」：
 *        **产者的写法一变，消费方静默失配，而没有任何一层会响。**
 *      这正是「**登记了 ⇒ 跑 ⇒ 红即看得见**」（仓规则 6）与「静默失效」之分。
 *    中和方法：`stripComments` 先剔注释 —— 否则**文档里引用该反模式的样例**会被判红
 *      （本仓踩过同族的坑：`test-supply-assembly` §H 首版命中的就是一句**注释**）。
 *
 * ② **import 面漂移**：`import { a, b } from './x.mjs'` ⇒ `x.mjs` 的**导出集**里必须有 `a`/`b`。
 *    仓规则 6 原话：「**重命名导出后必须同步 grep 消费方（含测试件 import），否则模块解析即失败**」
 *    —— 此前这条**只有人肉纪律、没有机检**，本件把它落成断言。
 *    保守处：`export *` ⇒ 标 star，**该文件不做具名核对**（防假红），并计数如实打印。
 *
 * ── 扫描面（**如实打印，不假装全覆盖**）──────────────────────────────────
 *   · `scripts/`（公开树 · CI 面）· 仓根 `*.mjs` · `_memory/**`（**gitignore 的机器本地面**）
 *   排除 `node_modules` / `lib/` / `dist/` / `.git` / `.roundtable` / `*.generated.*`。
 *   ⚠ 三条真实回归里两条住 `_memory/` ⇒ **该面必须扫**；不存在时如实报 0 件（不静默）。
 *
 * 退出码：0 = 全过 · 1 = 有违规。本件**只报不修**（判据，不是改写器）。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

/* ══ 取 CHECKS 表（**判据 ① 的分界线**）════════════════════════════════════════
 * 本件是**已登记门**，故此处"读文本"符合判据 ① 的自洽性。
 * ⚠ **抠不到即判红**（不得静默降级为"全员无安全网"或"全员有安全网"）——
 *   这正是仓内反复剿的「判据没跑却报绿」形态。 */
function readChecksSet() {
  const p = join(root, 'scripts', 'check-runner.mjs')
  const s = readFileSync(p, 'utf8')
  const i = s.indexOf('const CHECKS = [')
  if (i < 0) return { ok: false, why: '未找到 `const CHECKS = [`' }
  const j = s.indexOf('\n]', i)
  if (j < 0) return { ok: false, why: '未找到 CHECKS 数组终点' }
  const body = s.slice(i, j)
  const names = new Set()
  for (const m of body.matchAll(/\['([^']+)'/g)) names.add(m[1].replace(/\\/g, '/'))
  if (!names.size) return { ok: false, why: 'CHECKS 数组抽出 0 条' }
  return { ok: true, names }
}

/* ══ 收集扫描面 ══════════════════════════════════════════════════════════ */
const SKIP_DIR = new Set(['node_modules', 'lib', 'dist', '.git', '.roundtable', '.agent-teams'])
const isGenerated = (f) => /\.generated\./.test(f)

function walk(dir, out, depth = 0) {
  if (depth > 8 || !existsSync(dir)) return out
  let ents
  try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, out, depth + 1); continue }
    if (!/\.(mjs|js)$/.test(e.name) || isGenerated(p)) continue
    out.push(p)
  }
  return out
}

const faces = []
const scanFiles = []
const addFace = (label, dir, rootOnly = false) => {
  let files = []
  if (rootOnly) {
    try { files = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && /\.mjs$/.test(e.name)).map((e) => join(dir, e.name)) } catch { files = [] }
  } else {
    files = existsSync(dir) ? walk(dir, []) : []
  }
  faces.push({ label, dir, files })
  scanFiles.push(...files)
}
addFace('scripts/', join(root, 'scripts'))
addFace('(仓根 *.mjs)', root, true)
addFace('_memory/（gitignore · 机器本地面）', join(root, '_memory'))

const rel = (p) => relative(root, p).replace(/\\/g, '/')

/* ══ 工具：剔注释（防"注释里引用了该反模式"被判红 —— 本仓踩过同族坑）═════════ */
function stripComments(t) {
  return String(t)
    .replace(/\/\*[\s\S]*?\*\//g, '')          // /* … */
    .split(/\r?\n/).map((l) => {
      // 行注释：只在**非字符串上下文**里剔（保守：跳过含未闭合引号的行）
      const q = (l.match(/['"`]/g) || []).length
      const i = l.indexOf('//')
      if (i < 0) return l
      // 若 `//` 出现在字符串里（引号数为奇数且 // 之后还有引号），保守不动
      if (q % 2 === 1) return l
      return l.slice(0, i)
    }).join('\n')
}

/* ══ 判据 ①：无安全网的源码文本取数 ═══════════════════════════════════════ */
const P_SC = [
  { re: /\.match\(\s*\/const\s+[A-Za-z_$][\w$]*\s*=/, label: '.match(/const X = …/)' },
  { re: /\.(?:indexOf|search|lastIndexOf)\(\s*['"`]const\s+[A-Za-z_$][\w$]*\s*=/, label: 'indexOf(\'const X = …\')' },
]
const READS_FILE = /readFileSync\(/

const violations = []
const scanned = []
const checksInfo = readChecksSet()
if (!checksInfo.ok) {
  console.log(`❌ 判据 ① 的分界线取不到：${checksInfo.why}`)
  console.log('   ⇒ 本门**判红**（不得静默降级：那会让"有没有安全网"这个分界凭空失效）')
  process.exit(1)
}
const CHECKS = checksInfo.names
const inChecks = (r) => CHECKS.has(r) || CHECKS.has('./' + r)

for (const f of scanFiles) {
  let text
  try { text = readFileSync(f, 'utf8') } catch { continue }
  scanned.push(f)
  const r = rel(f)
  if (inChecks(r)) continue                      // 有安全网（每次 npm test 都跑 ⇒ 产者一变当场红）
  const code = stripComments(text)
  if (!READS_FILE.test(code)) continue           // 前提：该文件确实在读文件
  for (const { re, label } of P_SC) {
    if (!re.test(code)) continue
    const line = code.split(/\r?\n/).findIndex((l) => re.test(l)) + 1
    violations.push({
      kind: '① 无安全网的源码文本取数',
      file: r, line, label,
      why: '该件**不在 `CHECKS` 表内** ⇒ 产者改写法（字面量→构造器）时它**静默失配**，没有一层会响',
      fix: '产者**导出**该量，本件改 `import`（参本轮两件回归的修法：`buildSamples` / `buildSamples`）',
    })
    break
  }
}

/* ══ 判据 ②：import 面漂移 ═══════════════════════════════════════════════ */
function exportsOf(text) {
  const names = new Set()
  let star = false
  for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of text.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of text.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim()
      if (!t || /^type\s+/.test(t) && !/\bas\b/.test(t)) continue
      const as = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(t)
      names.add(as ? as[1] : t.replace(/^type\s+/, '').trim())
    }
  }
  if (/export\s+default\b/.test(text)) names.add('default')
  if (/export\s*\*\s*from/.test(text)) star = true
  return { names, star }
}

function namedImportsOf(text) {
  const out = []
  for (const m of text.matchAll(/import\s+(?:type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const from = m[2]
    if (!from.startsWith('.')) continue
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => {
        const t = s.replace(/^type\s+/, '')
        if (/\bas\b/.test(t)) return t.slice(0, t.indexOf(' as')).trim()
        return t
      })
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s))
    if (names.length) out.push({ from, names })
  }
  return out
}

const resolveTarget = (from, file) => {
  const base = resolve(dirname(file), from)
  for (const c of [base, base + '.mjs', base + '.js', join(base, 'index.mjs'), join(base, 'index.js')]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

let importPairs = 0, starSkipped = 0, unresolved = 0
for (const f of scanFiles) {
  let text
  try { text = readFileSync(f, 'utf8') } catch { continue }
  const r = rel(f)
  for (const imp of namedImportsOf(text)) {
    const target = resolveTarget(imp.from, f)
    if (!target) { unresolved++; continue }
    let tText
    try { tText = readFileSync(target, 'utf8') } catch { continue }
    const { names, star } = exportsOf(tText)
    if (star) { starSkipped++; continue }
    importPairs++
    for (const n of imp.names) {
      if (names.has(n)) continue
      if (new RegExp(`export\\s+(?:type|interface)\\s+${n}\\b`).test(tText)) continue
      const lns = text.split(/\r?\n/)
      const line = lns.findIndex((l) => /import/.test(l) && new RegExp(`\\b${n}\\b`).test(l)) + 1
      violations.push({
        kind: '② 具名导入不存在',
        file: r, line, label: `{ ${n} } from '${imp.from}'`,
        why: `产者 \`${rel(target)}\` 未导出 \`${n}\` ⇒ **模块解析即失败**（仓规则 6 原话）`,
        fix: '核对产者导出名，或同步改名（**重命名导出后必须同步消费方**）',
      })
    }
  }
}

/* ══ --selftest：判据自身可证伪（含反例）════════════════════════════════ */
if (SELFTEST) {
  let bad = 0
  const ok = (c, msg) => { console.log(`  ${c ? '✅' : '❌'} ${msg}`); if (!c) bad++ }
  console.log('── --selftest：判据自证（含反例）──')

  const hitSc = (t) => P_SC.some(({ re }) => re.test(stripComments(t))) && READS_FILE.test(stripComments(t))

  ok(hitSc(`import { readFileSync } from 'node:fs'\nconst s = readFileSync(G,'utf8')\nconst i = s.indexOf('const SAMPLES = [')\n`),
    '反例·**真机修前形态**（`indexOf(\'const SAMPLES = [\')`）**能**命中')
  ok(hitSc(`import { readFileSync } from 'node:fs'\nconst s=new Function('const s='+readFileSync(G,'utf8').match(/const SAMPLES = (\\[[\\s\\S]*?\\n\\])/)[1]+';return s')()\n`),
    '反例·第二种形态（`.match(/const SAMPLES = …/)`）**能**命中')
  ok(!hitSc(`const m = /const X = /.exec(line)\n`),
    '正例·仅**本文件内**的正则（无 readFileSync）⇒ 不报（非反模式）')
  ok(!hitSc(`// 文档举例：s.indexOf('const CHECKS = [') 是反模式\nconst a = 1\nreadFileSync('/x')\n`),
    '反例·**注释里引用该反模式** ⇒ 剔注释后不误报（本仓踩过同族坑）')
  ok(READS_FILE.test(stripComments(`/* readFileSync(x) */\n`)) === false,
    '正例·纯注释里的 readFileSync 不算"在读文件"')

  const ex = exportsOf(`export function a(){}\nexport const b = 1\nexport class C {}\n`)
  ok(ex.names.has('a') && ex.names.has('b') && ex.names.has('C'), '正例·导出抽取认得 function/const/class')
  ok(!ex.names.has('z'), '反例·未导出名**不**被认（断言具区分力）')
  ok(exportsOf(`const q=1\nexport { q as w }\n`).names.has('w'), '正例·`export { q as w }` ⇒ 取别名 `w`')
  ok(exportsOf(`export * from './o.mjs'\n`).star === true, '正例·`export *` ⇒ 标 star（不核对，防假红）')
  const im = namedImportsOf(`import { a } from './z.mjs'\n`)
  ok(im.length === 1 && im[0].names[0] === 'a', '正例·具名导入抽取认得 `{ a }`')
  ok(namedImportsOf(`import * as ns from './z.mjs'\n`).length === 0, '正例·命名空间导入 ⇒ 不计（无法静态核对）')
  ok(namedImportsOf(`import { b as c } from './z.mjs'`)[0].names[0] === 'b', '正例·`b as c` 核对的是**产者名** `b`')
  ok(CHECKS.size > 0, `正例·CHECKS 表已取到（${CHECKS.size} 条）`)

  console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}（判据自证可用：12 例，含 6 条反例）`)
  process.exit(bad === 0 ? 0 : 1)
}

/* ══ 输出 ═══════════════════════════════════════════════════════════════ */
console.log('消费方与产者同源机检（无安全网的源码文本取数 · 具名导入是否真实存在）')
console.log('  扫描面：')
for (const fc of faces) console.log(`    · ${fc.label} ${fc.files.length} 件`)
console.log(`  CHECKS 分界线：${CHECKS.size} 条已登记门（**在其内** ⇒ 每次 npm test 都跑 ⇒ 产者变当场红，故不判）`)
console.log(`  合计扫描 ${scanned.length} 件 · 具名导入核对 ${importPairs} 组 · \`export *\` 跳过 ${starSkipped} · 目标不可解析 ${unresolved}（不判红）`)
if (importPairs === 0) console.log('  ⚠ **0 组具名导入被核对** —— 判据可能空转（不得当作"已验"）')

if (violations.length) {
  console.log(`\n❌ 违规 ${violations.length} 处：`)
  for (const v of violations) {
    console.log(`  · ${v.kind} —— ${v.label}`)
    console.log(`      ${v.file}:${v.line}`)
    console.log(`      为什么错：${v.why}`)
    console.log(`      怎么修：${v.fix}`)
  }
  console.log('\nFAIL（消费方与产者不同源 ⇒ 产者改写法/改导出名，消费方**静默失配**而无一层会响）')
  process.exit(1)
}

console.log('\nPASS（消费方与产者同源：无「无安全网的源码文本取数」；具名导入全部真实存在）')
process.exit(0)
