/**
 * 路由契约门禁（S4 · 2026-09-13）
 *
 * 守护三件事（全部从源码/产物**推导**，不维护手写名单）：
 *   ① 契约表 ⟷ 实际注册 双向一致：`src/panel-*.ts` 里 `route('<path>')` 的集合
 *      必须与 `lib/panel-contract.js` 的 PANEL_ROUTES 完全一致（一侧多/少即失败）。
 *   ② **凡 handler 读请求体的路由必须有契约**（把"喂错数据不显式失败"从根上堵住）：
 *      实现方式——从注册行取被委托的函数名，到同文件找该函数体，看是否出现 `readBody(`；
 *      是则要求该注册行带 `contractFor('<path>')`。
 *   ③ 配置补丁白名单不漂移：契约模块导出的 DEEPSLEEP/DISTILL_CONFIG_KEYS
 *      必须与 `panel-observe.ts` 里的实际白名单数组逐键一致。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const LIB = join(ROOT, 'lib', 'panel-contract.js')

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

const files = readdirSync(SRC).filter((f) => /^panel-.*\.ts$/.test(f) && f !== 'panel-contract.ts')

/* ── 扫注册 ── */
const registered = new Map() // path → { file, line, hasContract, handler }
files.forEach((f) => {
  const lines = readFileSync(join(SRC, f), 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const m = /route\(\s*'([^']+)'\s*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\(/.exec(line)
      || /route\(\s*'([^']+)'/.exec(line)
    if (!m) return
    registered.set(m[1], { file: f, line: i + 1, hasContract: /contractFor\(/.test(line), handler: m[2] || null })
  })
})
console.log('路由契约门禁（S4）')
console.log('  扫描 ' + files.length + ' 个领域文件 · 注册路由 ' + registered.size + ' 条')

/* ── 引契约表 ── */
if (!existsSync(LIB)) { bad('lib/panel-contract.js 不存在（先 npm run build:host）'); console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(1) }
const mod = await import('file://' + LIB.replace(/\\/g, '/'))
const table = new Map((mod.PANEL_ROUTES || []).map((r) => [r.path, r]))

/* ① 双向一致 */
{
  const onlySrc = [...registered.keys()].filter((p) => !table.has(p))
  const onlyTable = [...table.keys()].filter((p) => !registered.has(p))
  onlySrc.length === 0 && onlyTable.length === 0
    ? ok('① 契约表 ⟷ 实际注册一致（' + registered.size + ' 条）')
    : bad('① 不一致 —— 仅源码有：' + (onlySrc.join(', ') || '无') + ' ｜ 仅契约表有：' + (onlyTable.join(', ') || '无'))
}

/* ② 读 body ⇒ 必须有契约 */
{
  const needContract = []
  const cache = new Map()
  files.forEach((f) => {
    const text = readFileSync(join(SRC, f), 'utf8')
    cache.set(f, text)
  })
  registered.forEach((info, path) => {
    if (!info.handler) return
    const text = cache.get(info.file) || ''
    const at = text.search(new RegExp('function ' + info.handler + '\\b'))
    if (at < 0) return
    /* 精确取函数体：从函数首个 '{' 起做花括号配平（首版用固定 1800 字符窗口，跨到邻接函数 ⇒ 6 处误报） */
    const open = text.indexOf('{', at)
    let depth = 0, end = open
    for (; end < text.length; end++) {
      const c = text[end]
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { end++; break } }
    }
    const seg = text.slice(at, end)
    if (/\breadBody\(/.test(seg) && !info.hasContract) needContract.push(path + '（' + info.file + ':' + info.line + '）')
  })
  needContract.length === 0
    ? ok('② 所有"读请求体"的路由均已声明契约')
    : bad('② 以下路由读 body 却没有契约：' + needContract.join(', '))
}

/* ③ 白名单不漂移 */
{
  const obs = readFileSync(join(SRC, 'panel-observe.ts'), 'utf8')
  const inj = readFileSync(join(SRC, 'panel-inject.ts'), 'utf8')
  /* M1（ACT-283）：评估通道白名单随其面板面一并切到 `panel-eval.ts`（初版在 panel-inject 使其 624 行 ≥600）。
   * 门禁按**源码文本**取白名单 ⇒ 源文件换了必须同步此处，否则会报「源码未找到白名单」（本轮实测踩过）。 */
  const evl = readFileSync(join(SRC, 'panel-eval.ts'), 'utf8')
  const cmp = (label, exported, srcKey, srcText) => {
    const m = new RegExp('const ' + srcKey + "\\s*=\\s*\\[([^\\]]*)\\]").exec(srcText)
    if (!m) return bad('③ 源码未找到白名单 ' + srcKey)
    const srcKeys = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    const exp = [...exported]
    const same = srcKeys.length === exp.length && srcKeys.every((k, i) => k === exp[i])
    same ? ok('③ ' + label + ' 白名单一致（' + exp.length + ' 键）')
      : bad('③ ' + label + ' 白名单漂移：源码 [' + srcKeys.join(',') + '] vs 契约 [' + exp.join(',') + ']')
  }
  /* 深睡白名单在 observe 里是内联数组（for const k of [...]），单独比 */
  {
    const m = /for \(const k of \[([^\]]*)\]\)/.exec(obs)
    const srcKeys = m ? m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : []
    const exp = [...(mod.DEEPSLEEP_CONFIG_KEYS || [])]
    srcKeys.length === exp.length && srcKeys.every((k, i) => k === exp[i])
      ? ok('③ 深睡配置白名单一致（' + exp.length + ' 键，源码内联数组）')
      : bad('③ 深睡白名单漂移：源码 [' + srcKeys.join(',') + '] vs 契约 [' + exp.join(',') + ']')
  }
  cmp('蒸馏配置', mod.DISTILL_CONFIG_KEYS || [], 'DISTILL_CONFIG_KEYS', obs)
  cmp('嵌入配置', mod.EMBED_CONFIG_KEYS || [], 'EMBED_CONFIG_KEYS', inj)
  cmp('评估通道配置', mod.EVAL_CONFIG_KEYS || [], 'EVAL_CONFIG_KEYS', evl)
}

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
process.exit(fail === 0 ? 0 : 1)
