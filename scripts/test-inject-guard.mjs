/**
 * test-inject-guard.mjs — 注入边界 `{{` 防护（S-P5 · 2026-09-17 圆桌会议产出）
 *
 * ── 为什么必须有它（判因）────────────────────────────────────────────
 * 会议实证：宿主 `dsh-system-prompt/lib/index.js` 的 `interpolate()` 对注入文本
 * 做严格 `{{var}}` 插值，三处 throw（L158/L164/L167）会冒泡到 `assemble` ⇒
 * **该轮请求整体失败，且记忆永久在库 ⇒ 会话永久不可用、无法自修**。
 * 而守藏全部注入出口（`panel-inject.ts` / `mcl.ts`）此前**零处理**（全仓 `{{` 零命中）。
 *
 * 本件同时承担**"先红"留痕**职责（accept 判据 1）：未接线时断言必须失败，
 *   接了才转绿 —— 防"先写绿再补红"造假。
 *
 * ── 覆盖（accept 判据 1/2/3）────────────────────────────────────────
 *   ① 先红：**未接线**时，原始文本确实会触发宿主 throw 路径（证明防护必要）
 *   ② 防护：`guardContextText` 输出不再触发宿主 throw 路径
 *   ③ 幂等：`f(f(x)) === f(x)` 逐字节
 *   ④ 保真：不含 `{{` 的文本**逐字节零改写**（真实库取样，禁合成夹具）
 *   ⑤ 两入口覆盖：静态断言 `panel-inject.ts` 与 `mcl.ts` 两处出口都调用了
 *      同一实现（**2/2**，只测一处不算通过 —— 会议修正：入口是 2 处不是 1 处）
 *
 * 退出码：0 全绿 / 1 有断言失败。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
const fails = []
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; return }
  fails.push(`${name}${detail ? ' :: ' + detail : ''}`)
}

/* ── 载入被测实现（lib 产物，与运行时同源） ── */
const implPath = join(ROOT, 'lib', 'inject-guard.js')
if (!existsSync(implPath)) {
  console.log(`test-inject-guard: lib/inject-guard.js 尚未构建 ⇒ skip（exit 3）`)
  process.exit(3)
}
const mod = await import(`file://${implPath.replaceAll('\\', '/')}`)
const { guardContextText, wouldThrowHostInterpolation } = mod
ok('导出 guardContextText', typeof guardContextText === 'function')
ok('导出 wouldThrowHostInterpolation', typeof wouldThrowHostInterpolation === 'function')

/* ── ① 先红：证明宿主确实会炸（未防护的原始文本） ── */
const HOSTILE = [
  '{{.Architecture}}',            // docker inspect --format（L164/L167 型）
  'a{{b}}c',                      // 组成立（L164/L167 型）
  '{{DSH_TOOLS_VERSION}}',        // 实测库中真出现过的形态（本库 devref 命中）
  '{{ orphan }}',                 // 名不合法（L164 型）
  'x{{a}}y{{b}}z',
]
for (const s of HOSTILE) {
  ok(`先红·未防护确实会触发宿主 throw: ${JSON.stringify(s)}`, wouldThrowHostInterpolation(s) === true)
}
// 反例：落单 `{{`（宿主 L159-161 透传）—— verify 节点推翻主持人口径的实证
ok('落单 {{ 不触发（宿主透传，verify 实证口径）', wouldThrowHostInterpolation('{% raw %}{{ 未闭合') === false)
ok('普通文本不触发', wouldThrowHostInterpolation('普通中文文本，含 { 单花括号') === false)

/* ── ② 防护：处理后不再触发 ── */
for (const s of HOSTILE) {
  const out = guardContextText(s)
  ok(`防护后不再触发: ${JSON.stringify(s)}`, wouldThrowHostInterpolation(out) === false, `out=${JSON.stringify(out)}`)
  ok(`防护后无 '{{': ${JSON.stringify(s)}`, !out.includes('{{'))
}

/* ── ③ 幂等：f(f(x)) === f(x) 逐字节 ── */
for (const s of [...HOSTILE, '{{{{{x}}}}}', '{a}{b}', 'no braces']) {
  const once = guardContextText(s)
  const twice = guardContextText(once)
  ok(`幂等: ${JSON.stringify(s)}`, Buffer.compare(Buffer.from(once), Buffer.from(twice)) === 0)
}

/* ── ④ 保真：不含 `{{` 的文本逐字节零改写（**真实库取样**，禁合成夹具） ── */
const libRoot = join(homedir(), '.dsh', 'suite', 'memory')
const sampled = []
if (existsSync(libRoot)) {
  const walk = (dir, depth = 0) => {
    if (depth > 3 || sampled.length >= 100) return
    let entries = []
    try { entries = readdirSync(dir) } catch { return }
    for (const e of entries) {
      if (sampled.length >= 100) return
      const p = join(dir, e)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) { if (!/^(\.git|node_modules|audit)$/.test(e)) walk(p, depth + 1); continue }
      if (!/\.(md|json|mjs|ts)$/.test(e) || st.size > 512 * 1024) continue
      let lines = []
      try { lines = readFileSync(p, 'utf8').split('\n') } catch { continue }
      for (const ln of lines) {
        if (sampled.length >= 100) break
        const t = ln.trim()
        if (t.length >= 8 && !t.includes('{{')) sampled.push(`${p}:${t}`)
      }
    }
  }
  walk(libRoot)
}
ok('保真取样规模 ≥100 行（真实库）', sampled.length >= 100, `实测 ${sampled.length} 行`)
let fidelityBad = 0
for (const s of sampled) if (Buffer.compare(Buffer.from(guardContextText(s)), Buffer.from(s)) !== 0) fidelityBad++
ok('保真：真实库取样逐字节零改写', fidelityBad === 0, `改写 ${fidelityBad}/${sampled.length}`)

/* ── ⑤ 两入口覆盖：静态断言两处出口调用同一实现 ── */
const entryFiles = ['src/panel-inject.ts', 'src/mcl.ts']
let wired = 0
for (const f of entryFiles) {
  const p = join(ROOT, f)
  if (!existsSync(p)) { ok(`入口文件存在: ${f}`, false); continue }
  const src = readFileSync(p, 'utf8')
  const hasImport = /from\s+['"]\.\/inject-guard(\.js)?['"]/.test(src)
  const hasCall = /guardContextText\s*\(/.test(src)
  ok(`入口接线: ${f}（import + 调用）`, hasImport && hasCall, `import=${hasImport} call=${hasCall}`)
  if (hasImport && hasCall) wired++
}
ok('两处入口均接线（2/2，只测一处不算通过）', wired === 2, `实测 ${wired}/2`)

/* ── 报告 ── */
if (fails.length) {
  console.error(`test-inject-guard: FAIL (${fails.length})`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`test-inject-guard: PASS ${pass} 项（先红 5 · 防护 10 · 幂等 8 · 保真 ${sampled.length} 行取样 · 双入口 2/2）`)
