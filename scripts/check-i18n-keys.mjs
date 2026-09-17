/**
 * check-i18n-keys — i18n 键集守恒与红线守卫（v2.1 §7，断言 A–G）
 *
 * **为什么需要它**：宿主 `t()` 缺键时**静默回落为 key 字面量、不抛错**
 * （`dsh-client-locale/lib/client.js`：`lookup(ns,key,chain) ?? lookup('common',key,chain) ?? key`）。
 * 没有这道门，界面会出现 `nav.memory` 这种裸键而**全绿**——本仓最典型的假绿形态。
 *
 * 断言清单：
 *   A 双向键集：{调用点 key} == {EN 词表 key}。缺键=裸键风险；多余键=死键（永久无人用）。
 *   B 占位符一致：每个 key 的 `{name}` 集合在「EN 值」与「调用点内联 zh」间相等；值非空、无 undefined。
 *   C 词表自检：zh 内联串非空、EN 值非空、同表内无重复 key。
 *   D 标签映射完整性：keys(tag-label) ⊇ criteria.json#carriers.tags ∪ TAG_ORDER，且每行 2 元组非空。
 *   E 红线守卫：改动集不含 _memory/** 与 suite 知识区；carriers.tags 键集逐键等于基线。
 *   F 新模块行数 ≤400（补 400–600 门禁空白带）。
 *   G tag 数据流污染（AST）：idxHue / TAG_ORDER.indexOf / tagCount 的实参不得经 tr()/tagLabel() 回流。
 *
 * 退出码：0 PASS · 1 FAIL · 3 跳过（词表尚未建立）
 * 用法：node scripts/check-i18n-keys.mjs [--selftest] [--verbose]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const VERBOSE = process.argv.includes('--verbose')
const SELFTEST = process.argv.includes('--selftest')

/** 词表模块（建齐后本件才有实质校验对象）。 */
/* ⚠ 本清单是**硬编码**的 —— 实测踩过一次（2026-09-17）：新增 `i18n-dict-pane-arch.js` 时忘了
 *   同步这里，该词表的 185 条全被判「缺 EN 词条」而**看起来像转换失败**（实为检查器根本没读到它）。
 *   ⇒ 下方 assertDictCoverage() 用「目录扫描 ⟷ 本清单」双向对账，把这类漏配变成红灯。 */
const DICT_FILES = ['i18n-dict-nav.js', 'i18n-dict-memory.js', 'i18n-dict-pane-run.js', 'i18n-dict-pane-arch.js', 'i18n-dict-cfg.js']
/** 新增的 i18n 模块（断言 F 的行数上限对象）。 */
const I18N_MODULES = ['i18n.js', 'tag-label.js', ...DICT_FILES]
/** 单文件行数上限（补 check-module-growth 的 400–600 空白带）。 */
const MODULE_LINE_CAP = 400

const fail = []
const ok = []
const note = (s) => { ok.push(s); if (VERBOSE) console.log('  ✓ ' + s) }
const bad = (s) => { fail.push(s); console.error('  ✗ ' + s) }

function listClientFiles () {
  if (!existsSync(SRC)) return []
  return readdirSync(SRC).filter((n) => n.endsWith('.js') &&
    !/\.bak-/.test(n) && !/\.generated\./.test(n) && n !== '.vendor-css.generated.js').sort()
}

/* ─────────── 断言 A/B/C：词表 ↔ 调用点 ─────────── */

/** 从词表模块静态提取 `export var EN = { '键': '值' }`（AST，不执行代码）。 */
function readDict (file) {
  const abs = join(SRC, file)
  if (!existsSync(abs)) return null
  const text = readFileSync(abs, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  const out = {}
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) &&
        /^(ZH|EN)$/.test(node.name.text) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const entries = {}
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const k = prop.name && (ts.isStringLiteral(prop.name) ? prop.name.text
          : ts.isIdentifier(prop.name) ? prop.name.text : null)
        const v = prop.initializer && ts.isStringLiteral(prop.initializer) ? prop.initializer.text : null
        if (k !== null) entries[k] = v
      }
      out[node.name.text] = entries
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** 扫描全 client 侧的 tr(...) 调用点（两种形态都收）。 */
function collectCallSites () {
  const sites = []
  for (const f of listClientFiles()) {
    const text = readFileSync(join(SRC, f), 'utf8')
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression && node.expression.getText ? node.expression.getText(sf) : ''
        if (/(^|\.)tr$/.test(callee) && node.arguments.length >= 1) {
          const a0 = node.arguments[0]
          const a1 = node.arguments[1]
          const isStr = (x) => x && (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x))
          if (isStr(a0)) {
            const { line } = sf.getLineAndCharacterOfPosition(a0.getStart(sf))
            if (node.arguments.length === 1) {
              // ① 原文即键形态：key 与中文原文同为 a0
              sites.push({ file: f, line: line + 1, key: a0.text, zh: a0.text, form: 'literal' })
            } else if (isStr(a1)) {
              // ② 语义键形态：key = a0，中文原文 = a1
              sites.push({ file: f, line: line + 1, key: a0.text, zh: a1.text, form: 'semantic' })
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return sites
}

function placeholders (s) {
  return [...String(s || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}
const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

/* ─────────── 断言 D：标签映射完整性 ─────────── */

function assertTagLabels () {
  const abs = join(SRC, 'tag-label.js')
  if (!existsSync(abs)) { bad('D 未找到 tag-label.js（映射表缺失）'); return }
  const text = readFileSync(abs, 'utf8')
  const sf = ts.createSourceFile('tag-label.js', text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  let keys = null, rowsComplete = true, emptyRow = []
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) &&
        node.name.text === 'TAG_LABELS' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      keys = []
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const k = ts.isStringLiteral(prop.name) ? prop.name.text : ts.isIdentifier(prop.name) ? prop.name.text : null
        if (k === null) continue
        keys.push(k)
        const arr = prop.initializer
        const pair = ts.isArrayLiteralExpression(arr) ? arr.elements : null
        if (!pair || pair.length !== 2 ||
            !ts.isStringLiteral(pair[0]) || !ts.isStringLiteral(pair[1]) ||
            !pair[0].text || !pair[1].text) {
          rowsComplete = false; emptyRow.push(k)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (!keys) { bad('D 未解析出 TAG_LABELS（结构变了？）'); return }

  // 需覆盖集 = carriers.tags ∪ TAG_ORDER
  const need = new Set()
  try {
    const cj = JSON.parse(readFileSync(join(ROOT, 'skill', 'engine', 'criteria.json'), 'utf8'))
    Object.keys((cj.carriers && cj.carriers.tags) || {}).forEach((k) => need.add(k))
  } catch (e) { bad(`D 读 criteria.json 失败：${e.message}`) }
  try {
    const pm = readFileSync(join(SRC, 'panes-memory.js'), 'utf8')
    const m = pm.match(/var TAG_ORDER\s*=\s*\[([^\]]+)\]/)
    if (m) m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).forEach((k) => need.add(k))
    else bad('D 未在 panes-memory.js 找到 TAG_ORDER')
  } catch (e) { bad(`D 读 panes-memory.js 失败：${e.message}`) }

  const have = new Set(keys)
  const missing = [...need].filter((k) => !have.has(k))
  const extra = keys.filter((k) => !need.has(k))
  if (missing.length) bad(`D 映射表缺键 ${missing.length} 个：${missing.join(', ')}（注册表新增 tag 未同步 ⇒ en 态将显示裸中文）`)
  if (extra.length) bad(`D 映射表多余键 ${extra.length} 个：${extra.join(', ')}（不在注册表∪TAG_ORDER 内，易漂移）`)
  if (!rowsComplete) bad(`D 以下 tag 行的中英 2 元组不完整：${emptyRow.join(', ')}`)
  if (!missing.length && !extra.length && rowsComplete) note(`D 标签映射完整性（${keys.length} 键覆盖 ${need.size} 需求）`)
}

/* ─────────── 断言 E：红线守卫 ─────────── */

const REDLINE_PATHS = [/^_memory\//, /^skill\/docs\/devref\//]
const TAG_BASELINE = join(ROOT, 'scripts', 'fixtures', 'carriers-tags-baseline.json')

function assertRedlines () {
  // E1：改动集不含禁止目录
  //   ⚠ git 会往 stderr 打 CRLF 警告；不吞掉会污染调用方（PowerShell 视 stderr 为错误、退出码判读被带偏）。
  const GIT_OPTS = { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  let changed = ''
  try {
    changed = execFileSync('git', ['diff', '--name-only', 'HEAD'], GIT_OPTS)
      + '\n' + execFileSync('git', ['status', '--porcelain'], GIT_OPTS)
  } catch (e) { changed = '' }
  const touched = String(changed).split(/\r?\n/)
    .map((l) => l.replace(/^\s*[AM?]{1,2}\s+/, '').trim())
    .filter(Boolean)
  const violated = touched.filter((p) => REDLINE_PATHS.some((re) => re.test(p.replace(/\\/g, '/'))))
  if (violated.length) bad(`E 改动集触碰红线目录：${violated.join(', ')}`)
  else note('E1 改动集未触碰 _memory/ 等红线目录')

  // E2：carriers.tags 键集等于基线
  let cur = null
  try {
    const cj = JSON.parse(readFileSync(join(ROOT, 'skill', 'engine', 'criteria.json'), 'utf8'))
    cur = Object.keys((cj.carriers && cj.carriers.tags) || {}).sort()
  } catch (e) { bad(`E 读 criteria.json 失败：${e.message}`); return }
  if (!existsSync(TAG_BASELINE)) {
    // 首次运行：落基线（写入后仍需人工/交叉复核确认——见方案 §十一 防固化规定）
    try {
      execFileSync(process.execPath, ['-e', 'process.exit(0)'])
      const dir = dirname(TAG_BASELINE)
      if (!existsSync(dir)) execFileSync(process.execPath, ['-e',
        `require('fs').mkdirSync(${JSON.stringify(dir)},{recursive:true})`])
      execFileSync(process.execPath, ['-e',
        `require('fs').writeFileSync(${JSON.stringify(TAG_BASELINE)}, JSON.stringify({note:'carriers.tags 键集基线（i18n 红线守卫）',keys:${JSON.stringify(cur)}},null,2))`])
      note(`E2 首次运行：已落 carriers.tags 基线（${cur.length} 键）`)
    } catch (e) { bad(`E2 落基线失败：${e.message}`) }
    return
  }
  const base = JSON.parse(readFileSync(TAG_BASELINE, 'utf8'))
  const baseKeys = (base.keys || []).slice().sort()
  const added = cur.filter((k) => !baseKeys.includes(k))
  const removed = baseKeys.filter((k) => !cur.includes(k))
  if (added.length || removed.length) {
    bad(`E2 carriers.tags 键集相对基线漂移：新增[${added.join(',')}] 删除[${removed.join(',')}]`
      + '（若为正常演进，须同步 tag-label.js 并显式更新基线）')
  } else note(`E2 carriers.tags 键集与基线一致（${cur.length} 键）`)
}

/* ─────────── 断言 F：新模块行数 ─────────── */

function assertModuleSize () {
  let over = []
  for (const f of I18N_MODULES) {
    const abs = join(SRC, f)
    if (!existsSync(abs)) continue
    const n = readFileSync(abs, 'utf8').split(/\r?\n/).length
    if (n > MODULE_LINE_CAP) over.push(`${f}=${n}`)
  }
  if (over.length) bad(`F i18n 模块超 ${MODULE_LINE_CAP} 行：${over.join(', ')}（400–600 是门禁空白带，本件补位）`)
  else note(`F i18n 模块行数 ≤${MODULE_LINE_CAP}`)
}

/* ─────────── 断言 G：tag 数据流污染（AST） ─────────── */

function assertTagDataflow () {
  const targets = ['panes-memory.js', 'panes-memory-detail.js', 'panes-overview.js']
  const offenders = []
  for (const f of targets) {
    const abs = join(SRC, f)
    if (!existsSync(abs)) continue
    const text = readFileSync(abs, 'utf8')
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression && node.expression.getText ? node.expression.getText(sf) : ''
        // 受保护的三类：色相 / 排序 / 统计
        const guarded = /(^|\.)(idxHue|tagLabel)$/.test(callee) === false &&
          (/idxHue$/.test(callee) || /\.indexOf$/.test(callee) || /^tagCount/.test(callee))
        if (guarded) {
          for (const a of node.arguments) {
            const argText = a.getText ? a.getText(sf) : ''
            if (/\b(tr|tagLabel)\s*\(/.test(argText)) {
              const { line } = sf.getLineAndCharacterOfPosition(a.getStart(sf))
              offenders.push(`${f}:${line + 1} ${callee}(${argText.slice(0, 40)})`)
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  if (offenders.length) {
    bad(`G tag 数据流污染 ${offenders.length} 处（色相/排序/统计必须吃**原始 tag**，经 tr/tagLabel 回流会让 zh 态色相半坏且不可观测）：`)
    offenders.forEach((o) => console.error('      ' + o))
  } else note('G tag 数据流：色相/排序/统计均直连原始 tag')
}

/* ─────────── 断言 H：词表清单 ⟷ 目录双向对账（防硬编码清单漏配） ─────────── */

/**
 * 判因（实测，2026-09-17）：`DICT_FILES` 是硬编码清单；新增词表文件却忘了登记时，
 *   该文件里的**全部条目**会被判成「缺 EN 词条」，表现得像**转换失败**——
 *   而真因是**检查器没读到它**。这类「检查器自己漏读 ⇒ 报假缺陷」会浪费大量排查时间。
 * 本断言把「目录里的 i18n-dict-*.js ⟷ 清单里的名字」双向对齐，任何一边多出即红。
 */
function assertDictCoverage () {
  if (!existsSync(SRC)) return
  /* ⚠ 排除生成物自身（`i18n-dict-index.generated.js` 文件名同样匹配 `i18n-dict-*`）——
   *  接缝③（阶段 4）引入按目录生成的索引后，它会被误判为「未登记词表」。 */
  const onDisk = readdirSync(SRC).filter((f) => /^i18n-dict-.*\.js$/.test(f) && !/\.generated\./.test(f)).sort()
  const listed = [...DICT_FILES].sort()
  const notListed = onDisk.filter((f) => !listed.includes(f))
  const notOnDisk = listed.filter((f) => !onDisk.includes(f))
  if (notListed.length) {
    bad(`H 目录中存在未登记的词表：${notListed.join(', ')}（⇒ 其条目会被误判为「缺 EN 词条」，请加进 DICT_FILES）`)
  }
  if (notOnDisk.length) {
    bad(`H DICT_FILES 列了不存在的词表：${notOnDisk.join(', ')}`)
  }
  if (!notListed.length && !notOnDisk.length) note(`H 词表清单与目录一致（${onDisk.length} 份）`)
}

/* ─────────── 主流程 ─────────── */

function run () {
  if (!existsSync(SRC)) { console.log('check-i18n-keys：未找到 src-client/ —— 跳过（exit 3）'); process.exit(3) }

  const dicts = {}
  let dictCount = 0
  for (const f of DICT_FILES) {
    const d = readDict(f)
    if (d) { dicts[f] = d; dictCount++ }
  }

  console.log(`check-i18n-keys · 词表 ${dictCount}/${DICT_FILES.length} 份 · 客户端源文件 ${listClientFiles().length} 个`)

  // —— 词表尚未建立：只跑 D/E/F/G（结构类断言），A/B/C 待词表落地后强制 ——
  const sites = collectCallSites()
  console.log(`  · tr() 调用点：${sites.length} 处`)

  if (dictCount === 0) {
    console.log('  · 词表尚未建立（分期进行中）⇒ 仅校验结构类断言 D/E/F/G')
    assertTagLabels(); assertRedlines(); assertModuleSize(); assertTagDataflow(); assertDictCoverage()
  } else {
    // A/B/C：合并全部词表的 ZH/EN
    const ZH = {}, EN = {}
    const dup = []
    for (const [f, d] of Object.entries(dicts)) {
      for (const [k, v] of Object.entries(d.zh || d.ZH || {})) { if (k in ZH) dup.push(`${k}@${f}`); ZH[k] = v }
      for (const [k, v] of Object.entries(d.en || d.EN || {})) { if (k in EN) dup.push(`${k}@${f}(en)`); EN[k] = v }
    }
    if (dup.length) bad(`C 词表内重复键：${dup.join(', ')}`)

    const callKeys = new Set(sites.map((s) => s.key))
    const enKeys = new Set(Object.keys(EN))
    // A1 缺键（调用点有、EN 无）⇒ 裸键风险
    const noEn = [...callKeys].filter((k) => !enKeys.has(k))
    // A2 死键（EN 有、无调用点）⇒ 永久无人用
    const dead = [...enKeys].filter((k) => !callKeys.has(k))
    if (noEn.length) bad(`A 缺 EN 词条 ${noEn.length} 个（宿主 t() 会静默回落成 key 字面量）：${noEn.slice(0, 12).join(', ')}${noEn.length > 12 ? ' …' : ''}`)
    if (dead.length) bad(`A 死键 ${dead.length} 个（词表有、无调用点）：${dead.slice(0, 12).join(', ')}${dead.length > 12 ? ' …' : ''}`)
    if (!noEn.length && !dead.length) note(`A 双向键集一致（调用点 ${callKeys.size} = EN ${enKeys.size}）`)

    // B 占位符一致性 + 值非空
    let bBad = 0
    for (const s of sites) {
      const en = EN[s.key]
      if (en === undefined) continue
      if (!en.trim() || /undefined/.test(en)) { bad(`B ${s.key} 的 EN 值空或含 undefined`); bBad++ }
      if (s.zh !== null && !sameSet(placeholders(s.zh), placeholders(en))) {
        bad(`B ${s.key} 占位符不一致：zh{${placeholders(s.zh).join(',')}} vs en{${placeholders(en).join(',')}}`); bBad++
      }
    }
    for (const [k, v] of Object.entries(EN)) { if (!String(v || '').trim()) { bad(`B EN[${k}] 为空`); bBad++ } }
    if (!bBad) note('B 占位符集合与值非空校验通过')

    // C zh 内联非空
    const emptyZh = sites.filter((s) => s.zh !== null && !s.zh.trim())
    if (emptyZh.length) bad(`C ${emptyZh.length} 处 tr() 的中文原文为空`)
    else note('C zh 内联串非空')

    assertTagLabels(); assertRedlines(); assertModuleSize(); assertTagDataflow(); assertDictCoverage()
  }

  console.log('')
  if (fail.length) {
    console.error(`check-i18n-keys: FAIL（${fail.length} 条）`)
    process.exit(1)
  }
  console.log(`check-i18n-keys: PASS（${ok.length} 项断言通过）`)
  process.exit(0)
}

/** --selftest：证明断言会红（防恒真）。 */
function selftest () {
  let p = 0, f = 0
  const chk = (cond, name) => { if (cond) { p++; console.log('  ✓ ' + name) } else { f++; console.error('  ✗ ' + name) } }
  chk(sameSet(placeholders('a {x} b'), placeholders('c {x} d')), '占位符一致判定')
  chk(!sameSet(placeholders('a {x}'), placeholders('a {y}')), '占位符不一致判定')
  chk(!sameSet(placeholders('a {x}'), placeholders('a {x}{y}')), '占位符多寡判定')
  chk(sameSet(placeholders('无参数'), placeholders('none')), '无占位符等价判定')
  // tr 调用点提取
  const sf = ts.createSourceFile('x.js', "tr('a.b','中')\ntr('c.d','英',{n:1})", ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  let n = 0
  const v = (node) => { if (ts.isCallExpression(node)) { const c = node.expression.getText(sf); if (/(^|\.)tr$/.test(c)) n++ } ts.forEachChild(node, v) }
  v(sf); chk(n === 2, 'tr() 调用点计数（含带参数形态）')
  console.log(`\n--selftest: ${p} PASS / ${f} FAIL`)
  process.exit(f ? 1 : 0)
}

if (SELFTEST) selftest(); else run()
