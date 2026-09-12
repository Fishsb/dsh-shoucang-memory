/**
 * CSS 使用审计（死规则 / 缺失样式 / 重复定义）
 *
 * 背景：client.js 的 CSS 是 `var CSS = [ ... ].join('')` 内嵌字符串，六层设计系统是
 *       多轮补丁叠加出来的，天然会积累三类垃圾：
 *         A. **死规则** —— CSS 里定义了 `.sc-xxx`，但 JS 从未把它挂到任何元素上
 *                          （历史版本遗留 / 功能下线后忘删）。浏览器每帧都要匹配它。
 *         B. **缺失样式** —— JS 挂了 `.sc-xxx`，但 CSS 无定义（靠继承或裸样式兜底，
 *                          与"样式集中"原则冲突）。
 *         C. **重复定义** —— 同一选择器被定义多次（后写覆盖先写，实际生效的只有一份，
 *                          前面的是噪音，且让人误判级联结果）。
 *
 * 关键点（与 gen-ui-preview.mjs 同源）：
 *   - CSS **从 client.js 原地 eval 抽取**，不复制粘贴 ⇒ 改了源码必然被测到。
 *   - 判定"是否被使用"时，**剔除 CSS 文本本身**再做子串匹配，否则 CSS 里自引用会
 *     把自己算成"已使用"（这正是首版审计全部误报的原因）。
 *   - 用**子串**匹配而非全等：类名大量来自拼接（`'sc-ds-badge ' + kind`、
 *     `'sc-log-row sc-log-' + lv`），全等匹配会把在用类误判成死规则。
 *     ⇒ 本报告只在 A 类上保守（宁可漏报不误杀），删除前仍需人工确认。
 *
 * 用法：node scripts/audit-css-usage.mjs [--json] [--gate]
 *   --json 输出机器可读结果
 *   --gate 门禁模式：A 类（死规则）/ C 类（同层重复定义）必须为 0，
 *          B 类（无样式）必须全部在 ALLOW_NO_STYLE 白名单内，否则 exit 1。
 *          （一份代码两用：报告给人看、门禁给 CI 跑 —— 避免两份实现漂移。）
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// --src <path>：允许对副本审计（test-css-usage-gate.mjs 靠它做反向证伪，不动真实源码）
const srcArgIdx = process.argv.indexOf('--src')
const CLIENT = srcArgIdx > 0 && process.argv[srcArgIdx + 1] ? process.argv[srcArgIdx + 1] : join(ROOT, 'client.js')
const text = readFileSync(CLIENT, 'utf8')

/* ── 1. 原地抽取 CSS ── */
const start = text.indexOf('var CSS = [')
if (start < 0) { console.error('未找到 var CSS = [ —— client.js 结构变了？'); process.exit(1) }
const endTok = "].join('');"
const end = text.indexOf(endTok, start)
if (end < 0) { console.error('未找到 CSS 数组结尾'); process.exit(1) }
const cssSlice = text.slice(start, end + endTok.length)
// eslint-disable-next-line no-eval
const css = eval(cssSlice.slice('var CSS = '.length))
if (typeof css !== 'string' || css.length < 1000) { console.error('CSS 求值异常 len=' + (css || '').length); process.exit(1) }

/* JS 源码 = 全文剔除 CSS 切片（含数组边界），避免 CSS 自引用污染"是否被使用"的判定 */
const jsSrc = text.slice(0, start) + text.slice(end + endTok.length)

/* ── 2. 从 CSS 提取类名与选择器 ── */
/** 按块切分，返回 [{ at, selector, body, index }]。
 *  at = 所处的 @media/@supports 上下文（'' 表示顶层）。
 *  ⚠ 必须用**栈**追踪 at-rule：@media 块内通常有多条规则，只有用栈才能在块尾
 *    （遇到多余的 `}`）时正确弹层。首版只在"行首是 @"时记前缀，导致 @media 里的
 *    第二条及之后的规则被误判成顶层规则 ⇒ C 类把「响应式覆盖」全报成了「重复冲突」。 */
function splitRules(cssText) {
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '') // CSS 内注释
  const rules = []
  const atStack = []
  let i = 0
  while (i < stripped.length) {
    const ch = stripped[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '}') { atStack.pop(); i++; continue } // at 块（或未知块）结束，弹层
    const atM = /^@([a-z-]+)[^{;]*\{/i.exec(stripped.slice(i))
    if (atM) { atStack.push(atM[0].slice(0, -1).trim()); i += atM[0].length; continue }
    const open = stripped.indexOf('{', i)
    if (open < 0) break
    let d = 0, j = open
    for (; j < stripped.length; j++) {
      if (stripped[j] === '{') d++
      else if (stripped[j] === '}') { d--; if (d === 0) break }
    }
    const sel = stripped.slice(i, open).trim()
    const body = stripped.slice(open + 1, j).trim()
    if (sel) rules.push({ at: atStack.join(' > '), selector: sel, body, index: i })
    i = j + 1
  }
  return rules
}

const rules = splitRules(css)

/** 从一个选择器里抽出类名（`.sc-foo`）；排除 `.5em` 这类数字开头 */
function classesOf(sel) {
  const out = []
  const re = /\.([a-zA-Z][\w-]*)/g
  let m
  while ((m = re.exec(sel)) !== null) out.push(m[1])
  return out
}

const cssClasses = new Set()
rules.forEach((r) => classesOf(r.selector).forEach((c) => cssClasses.add(c)))

/* ── 3. 从 JS 提取被挂到 DOM 上的类名 ── */
/** 只认"会被写进 class 属性"的位置：el(tag,cls) / classList.* / className= / setAttribute('class') */
const jsClasses = new Set()
function addTokens(str) {
  String(str).split(/[\s'"+,)]+/).forEach((t) => {
    t = t.replace(/^\.+/, '')
    // 丢掉以 '-' 结尾的拼接残渣（如 'sc-log-row sc-log-' 的 'sc-log-'），它不是真类名
    if (t.slice(-1) === '-') return
    if (/^[a-zA-Z][\w-]*$/.test(t)) jsClasses.add(t)
  })
}
const patterns = [
  /\bel\(\s*'[^']*'\s*,\s*'([^']*)'/g,          // el('div','sc-foo sc-bar', ...)
  /\bel\(\s*"[^"]*"\s*,\s*"([^"]*)"/g,
  /classList\.(?:add|remove|toggle|contains)\(\s*'([^']*)'/g,
  /className\s*=\s*'([^']*)'/g,
  /className\s*=\s*"([^"]*)"/g,
  /setAttribute\(\s*'class'\s*,\s*'([^']*)'/g,
]
patterns.forEach((re) => { let m; while ((m = re.exec(jsSrc)) !== null) addTokens(m[1]) })

/* ── 4. 三类清单 ── */

/** 拼接前缀：'sc-badge-' + kind / 'sc-log-row sc-log-' + lv 这类写法的左半段。
 *  类名若以某前缀开头，即视为"可能用到"（保守：宁可漏报，不可误杀在用样式）。 */
const concatPrefixes = []
{
  const re = /'([^']*)'\s*\+/g // 只要"字符串字面量后面紧跟 +"就是拼接上下文
  let m
  while ((m = re.exec(jsSrc)) !== null) {
    const seg = m[1].trim().split(/\s+/).pop() // 取最后一段：'sc-log-row sc-log-' → 'sc-log-'
    if (seg && seg.length >= 4 && seg.slice(-1) === '-') concatPrefixes.push(seg)
  }
}

/** 是否被使用：① 子串直接出现 ② 命中拼接前缀 */
function mentioned(c) {
  if (jsSrc.indexOf(c) >= 0) return true
  return concatPrefixes.some((p) => c.indexOf(p) === 0)
}

const own = [...cssClasses].filter((c) => c.indexOf('sc-') === 0).sort()
const dead = own.filter((c) => !mentioned(c))                       // A 死规则
/** B 类白名单：**有意无样式**的类 —— 不是样式类，而是定位/语义标记。
 *  ⚠ 加白名单必须写理由，否则等于给"漏写样式"开后门。 */
const ALLOW_NO_STYLE = {
  'sc-fold-mark': '折叠哨兵：空 div 作为插入锚点，被 scheduleFold 消费后即移除；空 div 零高度，本就不需要样式',
}
const missing = [...jsClasses].filter((c) => c.indexOf('sc-') === 0 && !cssClasses.has(c)).sort() // B 缺失
const missingUnexplained = missing.filter((c) => !Object.prototype.hasOwnProperty.call(ALLOW_NO_STYLE, c))

// C 重复定义：规范化（去空白）后统计
const bySel = new Map()
rules.forEach((r) => {
  if (r.at) return // @media 内的规则允许与外层同名（响应式覆盖是有意的，不算冲突）
  const key = r.selector.replace(/\s+/g, ' ')
  if (!bySel.has(key)) bySel.set(key, [])
  bySel.get(key).push(r)
})
const dup = [...bySel.entries()].filter(([, rs]) => rs.length > 1)
  .map(([sel, rs]) => ({ sel, n: rs.length, bodys: rs.map((r) => r.body) }))
  .sort((a, b) => b.n - a.n)

/* 附加：宿主约定类（非 sc- 前缀）单独列出，供人工判断是宿主提供还是我方应补 */
const hostClasses = [...cssClasses].filter((c) => c.indexOf('sc-') !== 0).sort()

/* ── 5. 输出 ── */
const asJson = process.argv.includes('--json')
if (asJson) {
  console.log(JSON.stringify({ dead, missing, dup, hostClasses, total: own.length }, null, 2))
} else {
  console.log('CSS 使用审计（client.js 原地抽取 · css ' + css.length + ' chars · ' + rules.length + ' 条规则）\n')
  console.log('── A. 死规则候选：CSS 有定义，JS 零出现（共 ' + dead.length + ' / ' + own.length + ' 个自有类）──')
  if (!dead.length) console.log('  （无）')
  dead.forEach((c) => console.log('  · .' + c))
  console.log('\n── B. 样式缺失：JS 挂了但 CSS 无定义（共 ' + missing.length + '）──')
  if (!missing.length) console.log('  （无）')
  missing.forEach((c) => console.log('  · .' + c + (ALLOW_NO_STYLE[c] ? '   （白名单：' + ALLOW_NO_STYLE[c] + '）' : '   ← 待补样式')))
  console.log('  其中未说明的：' + (missingUnexplained.length ? missingUnexplained.map((c) => '.' + c).join(', ') : '无'))
  console.log('\n── C. 重复定义的选择器（共 ' + dup.length + '，后写覆盖先写）──')
  if (!dup.length) console.log('  （无）')
  dup.forEach((d) => {
    console.log('  · ' + d.sel + '  ×' + d.n)
    d.bodys.forEach((b, i) => console.log('      [' + (i + 1) + '] ' + b.slice(0, 100)))
  })
  console.log('\n── D. 非 sc- 前缀的宿主约定类（共 ' + hostClasses.length + '，需人工判断归属）──')
  hostClasses.forEach((c) => console.log('  · .' + c + (mentioned(c) ? '' : '   ← JS 零出现')))
  console.log('\n（拼接前缀识别：' + (concatPrefixes.length ? [...new Set(concatPrefixes)].join(' / ') : '无') + '）')
}

/* ── 6. 门禁模式：死规则 / 同层重复 / 未说明的缺样式，三者任一非零即 FAIL ── */
if (process.argv.includes('--gate')) {
  const problems = []
  if (dead.length) problems.push('死规则 ' + dead.length + ' 个：' + dead.map((c) => '.' + c).join(' '))
  if (dup.length) problems.push('同层重复定义 ' + dup.length + ' 个：' + dup.map((d) => d.sel).join(' / '))
  if (missingUnexplained.length) problems.push('未说明的缺样式 ' + missingUnexplained.length + ' 个：' + missingUnexplained.map((c) => '.' + c).join(' '))
  if (problems.length) {
    console.log('\nFAIL（CSS 审计门禁）')
    problems.forEach((p) => console.log('  ❌ ' + p))
    console.log('  → 死规则请删除；确属有意无样式的，加进 ALLOW_NO_STYLE 并写明理由')
    process.exit(1)
  }
  console.log('\nPASS（CSS 审计门禁：死规则 0 · 同层重复 0 · 缺样式均已说明；自有类 ' + own.length + ' 个）')
  process.exit(0)
}
