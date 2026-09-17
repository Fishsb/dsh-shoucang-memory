/**
 * i18n-smoke — 用 harness 同款 mock 加载真实 client.js，捕获**加载/挂载期**的真实异常（2026-09-17）
 *
 * 判因：`ui-geo-regress` 的面板装载在 `<script>try{__scMod.apply(...)}catch(e){window.BE=...}</script>`
 *   里——异常被吞成 `window.BE`，只表现为「面板骨架未挂载」，**看不到真因**。
 *   本件用同一 mock 形态跑一遍并**打印原始异常与堆栈**，把「假绿/假红」变成可定位的报错。
 *
 * 用法：node scripts/i18n-smoke.mjs
 * 退出码：0 = 挂载成功 · 1 = 挂载失败（打印真因）· 3 = 无 Chrome（跳过）
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')

/* Chrome 探测（与 ui-geo-regress 同口径；不写死本机路径） */
const PF = process.env.PROGRAMFILES || ''
const PF86 = process.env['PROGRAMFILES(X86)'] || ''
const LOCAL = process.env.LOCALAPPDATA || ''
const j = (b, r) => (b ? b.replace(/\\/g, '/') + '/' + r : '')
const CAND = [
  process.env.CHROME_PATH,
  j(PF, 'Google/Chrome/Application/chrome.exe'),
  j(PF86, 'Google/Chrome/Application/chrome.exe'),
  j(PF86, 'Microsoft/Edge/Application/msedge.exe'),
  j(PF, 'Microsoft/Edge/Application/msedge.exe'),
  j(LOCAL, 'Google/Chrome/Application/chrome.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean)
let CHROME = CAND.find((p) => existsSync(p))
if (!CHROME) {
  for (const n of ['chrome', 'msedge']) {
    try {
      const o = execFileSync(process.platform === 'win32' ? 'where' : 'which', [n], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim()
      if (o && existsSync(o)) { CHROME = o; break }
    } catch (e) { /* 未安装 */ }
  }
}
if (!CHROME) { console.log('i18n-smoke：未找到 Chrome/Edge —— 跳过（exit 3）'); process.exit(3) }

const client = readFileSync(CLIENT, 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'i18n-smoke-'))
const page = join(dir, 'p.html')

/* mock ctx 形态**与 ui-geo-regress 完全一致**（logger/effect/on/get，无 slots、无 inject）
 * —— 这是关键：要复现 harness 的装载条件，而不是自造一个更宽松的 ctx。 */
const html = `<!DOCTYPE html><html><head><script>
/* 顶层静默异常捕获（实测：esbuild 把 pane 模块提升到 load 之外执行，
 *  顶层 tr() 缺失会抛 ReferenceError 而**整包不注册**，页面上看不到任何提示）。 */
window.__ERRS=[];
window.onerror=function(m,s,l,c,e){ window.__ERRS.push(String(m)+' @'+l+':'+c); };
</script></head><body>
<script>window.__ModuleLoader__={load:function(cfg){window.__LOADED=String(cfg.id);try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>
<script>window.fetch=function(){return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve({})}})};window.__REG=[];</script>
<script>${client}</script>
<script>try{window.__scMod.apply({logger:{info:function(){},warn:function(){}},effect:function(){},on:function(){},get:function(){return undefined}})}catch(e){window.BE=String(e)+'\\n'+(e&&e.stack||'')}</script>
<script>setTimeout(function(){
  document.title = 'RESULT' + JSON.stringify({
    LOADED: window.__LOADED || null,
    ERRS: window.__ERRS || [],
    LE: window.__LE || null,
    BE: window.BE || null,
    root: document.getElementById('scpanl-root') ? true : false,
    mask: document.getElementById('scpanl-mask') ? true : false
  });
}, 500)</script>
</body></html>`
writeFileSync(page, html, 'utf8')

const dom = join(dir, 'dom.txt')
/* Chrome 的 `--dump-dom` 走 **stdout**，但它常以非零码退出（无害告警）⇒ 必须**两条路都收 stdout**，
 * 否则 dump 内容丢失、探针恒报"未取到结果"（本件自身踩过这个假红）。 */
let dumpOut = ''
try {
  dumpOut = execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=4000', '--dump-dom', 'file:///' + page.replace(/\\/g, '/'),
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
} catch (e) {
  dumpOut = String(e.stdout || '')
}
if (dumpOut) writeFileSync(dom, dumpOut, 'utf8')
const dump = existsSync(dom) ? readFileSync(dom, 'utf8') : ''
/* ⚠ 取结果用「带前缀的 title」而非纯 JSON：`--dump-dom` 会把 title 内的 JSON 做 HTML 转义
 *   （`"` → `&quot;`），直接 parse 会失败成 undefined 而**看起来像"未注册"**（本件自身踩过）。
 *   加前缀后按前缀切分，再逐层 unescape。 */
const m = dump.match(/<title>RESULT([\s\S]*?)<\/title>/)
let info = null
if (m) {
  const raw = m[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  try { info = JSON.parse(raw) } catch (e) { info = null }
}
rmSync(dir, { recursive: true, force: true })

if (!info) { console.error('i18n-smoke ✗ 未能取到装载结果（Chrome dump 失败或 title 未写）'); process.exit(1) }

console.log('i18n-smoke · 与 ui-geo-regress 同款 mock ctx')
console.log('  模块注册(id)      :', info.LOADED || '（未注册）')
console.log('  顶层静默异常      :', (info.ERRS && info.ERRS.length) ? '\n    ' + info.ERRS.join('\n    ') : '无')
console.log('  工厂求值异常(__LE):', info.LE ? '\n    ' + info.LE : '无')
console.log('  apply 异常(__BE)  :', info.BE ? '\n    ' + info.BE : '无')
console.log('  #scpanl-root 挂载 :', info.root)
console.log('  #scpanl-mask 挂载 :', info.mask)
const okAll = info.LOADED && !(info.ERRS && info.ERRS.length) && !info.LE && !info.BE && info.root
if (!okAll) {
  console.error('\ni18n-smoke: FAIL（注册/装载期异常或骨架未挂载）')
  process.exit(1)
}
console.log('\ni18n-smoke: PASS（模块已注册、装载无异常、骨架已挂载）')
process.exit(0)
