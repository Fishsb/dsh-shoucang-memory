/**
 * check-i18n-redlines — i18n 三条核心红线的常驻守卫（2026-09-17）
 *
 * **判因**：v2.1 把三条红线写成「核心不变量」，但它们只在**人读文档时**存在 ——
 *   没有任何机检守。实测（目标轮 2/40）：三条红线此前**从未被实证过**，是我手工逐条跑出来的。
 *   手工证据会随会话消失；本件把它变成**可复跑的判据**（规则6：未登记=没写）。
 *
 * 三条红线与判据：
 *   R1 **zh 态零回归**：`tr()` 在未接入 locale 时（= zh 态）必须**原样返回中文原文**，
 *      且**不查表**（故 `__SC_I18N_MISS__` 为空）。判据 = 动态 import i18n.js 后逐例断言。
 *      为什么不静态扫：这是**控制流性质**（`if (S.bound === null) return source`），只有跑才作数。
 *   R2 **不破坏 recall 标签匹配**：host 侧 `targets.ts` 的 5 个匹配符号必须存在
 *      （`indexRowTag` / `indexCarrierSet` / `highConfCarrierSet` / `scanIndexRows` / `TAG_WEIGHT`）。
 *      判据 = 源码符号存在性（这些是 recall 的入口面，改名即断链）。
 *   R3 **不动真源数据**：`carriers.tags` 键集必须逐键等于基线（与 check-i18n-keys 的 E2 互补：
 *      那条查漂移，这条查**基线文件本身是否还在**），且 `_memory/` 无改动。
 *
 * 退出码：0 PASS · 1 FAIL · 3 skip（源码/基线缺失）
 * 用法：node scripts/check-i18n-redlines.mjs [--verbose]
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERBOSE = process.argv.includes('--verbose')

const fail = []
const ok = []
const note = (s) => { ok.push(s); if (VERBOSE) console.log('  ✓ ' + s) }
const bad = (s) => { fail.push(s); console.error('  ✗ ' + s) }

/* ── R1：zh 态零回归（动态 import，验控制流性质） ── */
async function checkZhIdentity () {
  const p = join(ROOT, 'src-client', 'i18n.js')
  if (!existsSync(p)) { bad('R1 未找到 src-client/i18n.js'); return }
  let m
  try { m = await import(pathToFileURL(p).href) } catch (e) { bad(`R1 i18n.js 无法加载：${e.message}`); return }
  if (typeof m.tr !== 'function') { bad('R1 i18n.js 未导出 tr()'); return }

  // 语料：真实词表键 + 拼接片段 + 边界
  const CASES = [
    '记忆库', '该条目无 notes 跳转目标', ' 条', '⚠ 触发失败：',
    '运行总览', '守藏 SHOUCANG', '（空）', '',
    'USER.md（用户画像）与 AGENT.md（Agent 画像）的唯一展示位。',
  ]
  let n = 0
  for (const k of CASES) {
    // 单参形态（原文即键）与双参形态（语义键 + 原文）都必须原样返回
    let got1, got2
    try { got1 = m.tr(k); got2 = m.tr(k, k) } catch (e) { bad(`R1 tr() 抛错（key=${JSON.stringify(k)}）：${e.message}`); return }
    if (got1 !== k || got2 !== k) { bad(`R1 zh 态未原样返回：${JSON.stringify(k)} → 单参 ${JSON.stringify(got1)} / 双参 ${JSON.stringify(got2)}`); return }
    n++
  }
  // 未接入 ⇒ 不应有缺键记录（zh 态根本不查表）
  const miss = typeof m.missingKeys === 'function' ? m.missingKeys() : []
  if (miss.length) { bad(`R1 zh 态产生了缺键记录（说明查了表）：${miss.slice(0, 3).join(', ')}`); return }
  if (typeof m.isAttached === 'function' && m.isAttached()) { bad('R1 未接入 locale 却报告 isAttached()=true'); return }
  note(`R1 zh 态零回归（${n} 例原样返回、零查表、零缺键）`)
}

/* ── R2：recall 标签匹配面（符号存在性） ── */
function checkRecallSurface () {
  const p = join(ROOT, 'src', 'targets.ts')
  if (!existsSync(p)) { bad('R2 未找到 src/targets.ts'); return }
  const src = readFileSync(p, 'utf8')
  const SYMS = ['indexRowTag', 'indexCarrierSet', 'highConfCarrierSet', 'scanIndexRows', 'TAG_WEIGHT']
  const missing = SYMS.filter((s) => !src.includes(s))
  if (missing.length) {
    bad(`R2 recall 匹配面符号缺失（改名/删除即断链）：${missing.join(', ')}`)
  } else {
    note(`R2 recall 匹配面完好（targets.ts 含全部 ${SYMS.length} 个匹配符号）`)
  }
}

/* ── R4：装载期表内不得出现 tr()（本类缺陷已复发 3 次） ── */
function checkLoadTimeTr () {
  const SRC = join(ROOT, 'src-client')
  if (!existsSync(SRC)) { bad('R4 未找到 src-client/'); return }
  const CMP_FILES = readdirSync(SRC).filter((f) => f.endsWith('.js') && !f.includes('.generated.') && !f.startsWith('.'))
  const hits = []
  for (const f of CMP_FILES) {
    const src = readFileSync(join(SRC, f), 'utf8')
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const c = n.expression.getText(sf)
        if (/(^|\.)(tr|tagLabel)$/.test(c)) {
          /* 上溯找**装载期表**：仅当最近的变量声明其**初始化式本身**是对象/数组字面量
           *   （`var X = {…}` / `var X = […]`）才算 —— 这类表在函数执行（插件装配）时即建好，
           *   而 locale 尚未接入 ⇒ 值冻死为中文。
           *   ⚠ 不把 `return {…}` / `f({…})` 算进来：那是**调用期**求值（渲染时），
           *     把 tr() 放那里是对的（实测首版判据过宽，误报 6/8 处）。 */
          /* ① **扫全部祖先函数**：只要链上出现渲染期函数（本项目约定 renderXxx/buildXxx/
           *     makeXxx/showXxx/openXxx/refreshXxx），就按渲染期处理 —— 其体内的 `var X = {…}`
           *     每次渲染/回调重建 ⇒ tr() 在渲染期求值**是对的**。
           *     ⚠ 实测教训：只看「最近的那个函数」会误报 —— 代码常在 `.then(function(s2){…})`
           *       这类**匿名回调**里，最近函数没有名字 ⇒ 被误判为装载期（误报 3 处）。
           *  ② 再判是否为「装载期表」：仅当变量的**初始化式本身**是对象/数组字面量，
           *     且链上无渲染函数 ⇒ 该表在装配期建好、locale 未接入 ⇒ 值冻死为中文（真阳性）。 */
          let q = n.parent, qd = 0, isRenderFn = false
          while (q && qd < 40) {
            if (ts.isFunctionLike(q) && q.name && q.name.getText &&
                /^(render|build|make|show|open|refresh)/.test(q.name.getText())) { isRenderFn = true; break }
            q = q.parent; qd++
          }
          let p = n.parent, d = 0, inTable = false
          if (!isRenderFn) {
            while (p && d < 8) {
              if (ts.isVariableDeclaration(p)) {
                const init = p.initializer
                if (init && (ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init))) inTable = true
                break
              }
              if (ts.isReturnStatement(p) || ts.isCallExpression(p) || ts.isStatement(p) || ts.isFunctionLike(p)) break
              p = p.parent; d++
            }
          }
          if (inTable) {
            const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
            hits.push(f + ':' + line)
          }
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  if (hits.length) {
    bad('R4 装载期表内出现 tr()（值会被冻死为中文，切语言不生效）：' + hits.slice(0, 8).join(', '))
  } else {
    note('R4 无装载期 tr()（' + CMP_FILES.length + ' 个源文件）')
  }
}
/* ── R3：真源数据不动（键集 ≡ 基线 + _memory 无改动） ── */
function checkSourceData () {
  const cj = join(ROOT, 'skill', 'engine', 'criteria.json')
  const bl = join(ROOT, 'scripts', 'fixtures', 'carriers-tags-baseline.json')
  if (!existsSync(cj)) { bad('R3 未找到 skill/engine/criteria.json'); return }
  if (!existsSync(bl)) { bad('R3 未找到 carriers.tags 基线（check-i18n-keys 的 E2 会落，但基线丢失即失去守卫）'); return }
  const cur = Object.keys(JSON.parse(readFileSync(cj, 'utf8')).carriers.tags || {}).sort()
  const base = (JSON.parse(readFileSync(bl, 'utf8')).keys || []).slice().sort()
  const added = cur.filter((k) => !base.includes(k))
  const removed = base.filter((k) => !cur.includes(k))
  if (added.length || removed.length) {
    bad(`R3 carriers.tags 相对基线漂移：新增[${added.join(',')}] 删除[${removed.join(',')}]（recall 键空间变化！）`)
  } else {
    note(`R3 carriers.tags 逐键等于基线（${cur.length} 键）`)
  }

  // _memory 无改动（用 git 判；git 不可用则跳过该子项，不误红）
  try {
    const out = execFileSync('git', ['status', '--porcelain', '_memory'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (out) bad(`R3 _memory/ 存在改动（真源数据被动过）：\n      ${out.split('\n').slice(0, 5).join('\n      ')}`)
    else note('R3 _memory/ 无改动')
  } catch (e) {
    if (VERBOSE) console.log('  · R3 _memory 检查跳过（git 不可用）')
  }
}

/* ── 主流程 ── */
console.log('i18n 核心红线守卫（R1 zh 零回归 · R2 recall 面完好 · R3 真源不动 · R4 装载期无 tr()）')
await checkZhIdentity()
checkRecallSurface()
checkLoadTimeTr()
checkSourceData()

if (fail.length) {
  console.error(`\ncheck-i18n-redlines: FAIL（${fail.length} 条红线被破）`)
  process.exit(1)
}
console.log(`\ncheck-i18n-redlines: PASS（${ok.length} 条红线全部成立）`)
process.exit(0)
