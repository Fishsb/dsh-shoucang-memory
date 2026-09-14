/**
 * CSS 审计门禁的有效性测试（反向证伪）
 *
 * 背景：`scripts/audit-css-usage.mjs --gate` 是防止死规则再生的护栏。但**一个永远
 *       绿的门禁等于没有门禁** —— 必须证明它「改坏了会翻红」。本件做三处反向证伪：
 *         ① 往 CSS 里塞一条零使用的规则        → 必须 FAIL（A 类死规则被抓到）
 *         ② 往顶层插一条与既有同名的选择器      → 必须 FAIL（C 类同层重复被抓到）
 *         ③ 往 JS 里挂一个 CSS 未定义的 sc- 类  → 必须 FAIL（B 类缺样式且未说明）
 *       以及一条**反向证伪的反向**：@media 内的同名覆盖属有意行为，不得误报（C 类
 *       曾把 9 处响应式覆盖全报成冲突，是首版 at-rule 上下文追踪缺失所致）。
 *
 * 手法：把 client.js 复制进系统临时目录做**变异**，用 --src 指过去审计 —— 真实源码全程不动。
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')
const AUDIT = join(ROOT, 'scripts', 'audit-css-usage.mjs')
const src = readFileSync(CLIENT, 'utf8')

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }
const section = (m) => console.log('\n── ' + m + ' ──')

console.log('CSS 审计门禁有效性（反向证伪 · client.js）')

const tmp = mkdtempSync(join(tmpdir(), 'sc-css-audit-'))
/** 把变异后的源码写到临时文件，跑门禁，返回 { code, out } */
function gate(mutated) {
  const f = join(tmp, 'm' + Math.random().toString(36).slice(2) + '.js')
  writeFileSync(f, mutated, 'utf8')
  try {
    const out = execFileSync(process.execPath, [AUDIT, '--gate', '--src', f], { encoding: 'utf8' })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') }
  }
}

/* CSS 数组结尾锚点 —— 所有 CSS 变异都插在它前面 */
/* 引号无关 + 定位精确（S3）：产物里组件库也可能出现 ].join("")，故先锚定我方 CSS 数组
 * （window.__SC_CSS__ = [ …），再取**它之后**的首个 ].join('') 作为注入点。 */
const mAnchor = /window\.__SC_CSS__\s*=\s*\[/.exec(src)
if (!mAnchor) { console.error('未找到 CSS 数组稳定锚点 window.__SC_CSS__'); process.exit(1) }
let cssEndAt = -1
{
  const reEnd = /\]\.join\(\s*['"]['"]\s*\)/g
  reEnd.lastIndex = mAnchor.index
  const mEnd = reEnd.exec(src)
  if (!mEnd) { console.error('未找到 CSS 数组结尾锚点'); process.exit(1) }
  cssEndAt = mEnd.index
}
/* 注入点位于数组最后一个元素之后：打包产物**不留尾逗号**，需自动补一个（否则变异体语法错，门禁崩而非翻红） */
const insertCss = (snippet) => {
  const head = src.slice(0, cssEndAt).replace(/\s+$/, '')
  const needComma = head.slice(-1) !== ','
  return head + (needComma ? ',' : '') + snippet + src.slice(cssEndAt)
}

section('A. 基线：真实源码必须 PASS')
const base = gate(src)
base.code === 0 ? ok('真实 client.js 通过 CSS 审计门禁') : bad('真实源码未通过（exit=' + base.code + '）：\n' + base.out)

section('B. 反向证伪：改坏必须翻红')
/* ① 死规则：定义了一个从未被 JS 挂到 DOM 上的类 */
const r1 = gate(insertCss("'#scpanl-root .sc-zzz-never-used{color:red;}',"))
r1.code !== 0 && /死规则/.test(r1.out) ? ok('① 塞入零使用规则 → FAIL 且报「死规则」（门禁非空转）')
  : bad('① 死规则未被抓到（exit=' + r1.code + '）')

/* ② 同层重复：顶层再定义一次既有选择器（非 @media 内） */
const r2 = gate(insertCss("'#scpanl-root .sc-btn{padding:99px;}',"))
r2.code !== 0 && /同层重复定义/.test(r2.out) ? ok('② 顶层重复定义既有选择器 → FAIL 且报「同层重复定义」')
  : bad('② 同层重复未被抓到（exit=' + r2.code + '）')

/* ③ 缺样式：JS 挂了一个 CSS 里没定义的 sc- 类，且未加白名单说明 */
/* 追加式注入：不再依赖任何既有源码行（旧写法锚在 var foldMark=... 上，该行被 Tab 化重构删除后
 * 变异静默失效 ⇒ 门禁"假绿"）。锚点改为模块导出处的稳定语句。 */
const r3 = gate(src.replace('exports.apply = apply;', "var _zzzProbe = el('div', 'sc-zzz-unstyled');\nexports.apply = apply;"))
r3.code !== 0 && /未说明的缺样式/.test(r3.out) ? ok('③ JS 挂未定义的 sc- 类 → FAIL 且报「未说明的缺样式」')
  : bad('③ 缺样式未被抓到（exit=' + r3.code + '）')

section('C. 防误报：有意的写法不得被判违规')
/* ④ @media 内的同名覆盖是响应式设计的正常手段，必须放行 */
const r4 = gate(insertCss("'@media (max-width:500px){#scpanl-root .sc-btn{padding:1px;}}',"))
r4.code === 0 ? ok('④ @media 内同名覆盖被正确放行（首版曾误报 9 处响应式覆盖）')
  : bad('④ @media 内的响应式覆盖被误判（exit=' + r4.code + '）：\n' + r4.out)

/* ⑤ 白名单不能成为后门：每条都必须给出**非空理由**（否则等于给"漏写样式"开绿灯） */
const auditSrc = readFileSync(AUDIT, 'utf8')
const blockAt = auditSrc.indexOf('const ALLOW_NO_STYLE = {')
const blockEnd = blockAt < 0 ? -1 : auditSrc.indexOf('\n}', blockAt)
const entries = blockAt < 0 ? [] : [...auditSrc.slice(blockAt, blockEnd).matchAll(/'([^']+)':\s*'([^']*)'/g)]
const noReason = entries.filter((e) => (e[2] || '').trim().length < 10)
/* 不变量是「每条都必须有理由」，不是「必须恰有 N 条」——白名单清空（0 条）是**最理想**状态
 * （2026-09-13：sc-fold-mark 哨兵随 Tab 化移除后白名单自然归零，旧断言 entries.length>0 反而误红）。 */
noReason.length === 0
  ? ok('⑤ 白名单 ' + entries.length + ' 条' + (entries.length ? '且全部写明理由（' + entries.map((e) => e[1]).join(',') + '）' : '（空 = 无「漏写样式」需开绿灯）'))
  : bad('⑤ 白名单异常：条目 ' + entries.length + ' · 缺理由 ' + noReason.length)

rmSync(tmp, { recursive: true, force: true })
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '（' + pass + ' pass · ' + fail + ' fail）')
process.exit(fail === 0 ? 0 : 1)
