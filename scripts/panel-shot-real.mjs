/**
 * panel-shot-real — 用**真实宿主数据**渲染面板并截图（人眼核对用 · 2026-09-17）
 *
 * 判因（实测教训）：只读源码 + 自造夹具，会漏掉「同一节点渲染两次」「v9 两代实现并存」这类
 *   **结构性**缺陷 —— 夹具不产生真实形态的数据，几何门禁又不数同类节点个数。
 *   本件从**运行中的宿主**直取 `/api/shoucang-panel/memory/overview` 真数据，
 *   喂给真实 `client.js` 渲染，再出图 ⇒ **所见即用户所见**，供人眼/模型目视核对。
 *
 * ⚠ 本件**只出图不做断言**（断言归 `test-idxrow-pills` 等）；它的价值是「让人真的看见」。
 * 用法：node scripts/panel-shot-real.mjs <输出png> [视图id，缺省 memory] [宿主端口，缺省 3080]
 */
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.argv[2] || join(tmpdir(), 'shot-real.png')
const VIEW = process.argv[3] || 'memory'
const PORT = process.argv[4] || '3080'
const EXPAND = process.argv.includes('--expand')
/** 语言态：默认 zh（零回归基线）；`--en` 出英文态图。
 *  ⚠ 用**忠实 locale 替身**（register 累积 + bind 活查 + effect 执行回调）——
 *    真实注册路径被行使，故「词表未注册」这类缺陷会在图上如实暴露（不会假绿）。 */
const LOCALE = process.argv.includes('--en') ? 'en' : 'zh'
/** `--full`：按**滚动容器全高**出图。
 *  ⚠ 判因（2026-09-17 用户提示）：面板内容区有纵向滚动导轨 ⇒ 默认窗口只截到**首屏**，
 *    折叠线以下的缺陷在图上根本看不见（实测因此漏过参数页整段）。故默认改为两步：
 *    先量内容全高 → 再按该高度重出一张。 */
const FULL = process.argv.includes('--full')
const BASE = 'http://127.0.0.1:' + PORT + '/api/shoucang-panel'

/* 只读 GET 路由（POST 类跳过）——取自 `lib/panel-contract.json` */
const POST_ONLY = new Set(['/root/bootstrap', '/set_root', '/save', '/toggle', '/set', '/selfcheck/run',
  '/deepsleep/trigger', '/distill/run', '/vector/cache/clear', '/memory/approve', '/memory/section-edit',
  '/memory/edit', '/memory/remove', '/embed/test', '/deepsleep/config', '/distill/config', '/embed/config',
  '/mcl/config'])
let ROUTES = []
try {
  const c = JSON.parse(readFileSync(join(ROOT, 'lib', 'panel-contract.json'), 'utf8'))
  ROUTES = (Array.isArray(c) ? c : (c.routes || [])).map((r) => (typeof r === 'string' ? r : (r.path || r.name))).filter(Boolean)
} catch (e) { /* 契约缺失时退回最小集 */ }
if (!ROUTES.length) ROUTES = ['/memory/overview', '/cognition/report', '/vector/status2', '/config', '/roots']

/* 逐个取真数据（失败即跳过；每请求独立超时）——**所见即用户所见** */
const DATA = {}
const FAILED = []
for (const p of ROUTES) {
  if (POST_ONLY.has(p)) continue
  try {
    const r = await fetch(BASE + p, { signal: AbortSignal.timeout(15000) })
    DATA[p] = await r.json()
  } catch (e) { FAILED.push(p) }
}
const mem = (DATA['/memory/overview'] && (DATA['/memory/overview'].indexes || []).find((i) => i.name === 'MEMORY.md')) || {}
console.log('真数据：路由 ' + Object.keys(DATA).length + '/' + ROUTES.length +
  (FAILED.length ? '（失败 ' + FAILED.length + '：' + FAILED.slice(0, 4).join(',') + '）' : '') +
  ' · root=' + ((DATA['/memory/overview'] || {}).root || '?') + ' · MEMORY.md lines=' + ((mem.lines || []).length))
if (!Object.keys(DATA).length) { console.error('一条真数据都没取到 —— 宿主未运行？'); process.exit(1) }

const PF = process.env.PROGRAMFILES || '', LOCAL = process.env.LOCALAPPDATA || ''
const CHROME = [process.env.CHROME_PATH,
  PF ? PF.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe' : '',
  PF ? PF.replace(/\\/g, '/') + '/Microsoft/Edge/Application/msedge.exe' : '',
  LOCAL ? LOCAL.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe' : '',
].filter(Boolean).find((p) => existsSync(p))
if (!CHROME) { console.error('未找到 Chrome/Edge'); process.exit(1) }

const dir = mkdtempSync(join(tmpdir(), 'panel-shot-'))
const page = join(dir, 'p.html')
const P = []
P.push('<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#111}</style></head><body>')
P.push('<div class="VOzbGW_footArea"><div class="VOzbGW_triggerRow"><button type="button">Settings</button></div></div>')
P.push('<script>window.__ModuleLoader__={load:function(cfg){try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>')
P.push('<script>var REAL=' + JSON.stringify(DATA) + ';')
P.push('window.fetch=function(url){var p=String(url).replace(/^.*?\\/api\\/shoucang-panel/,"").split("?")[0];')
P.push('  var v=REAL[p];')
P.push('  return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve(v===undefined?{}:v)}})};</script>')
P.push('<script>' + readFileSync(join(ROOT, 'client.js'), 'utf8') + '</script>')
P.push('<script>var LOCALE=' + JSON.stringify(LOCALE) + ';var REG={};')
P.push('var svc={getLocale:function(){return {active:LOCALE,locales:[],revision:1}},')
P.push('  getSnapshot:function(){return this.getLocale()},subscribe:function(){return function(){}},')
P.push('  register:function(ns,loc,dict){(REG[ns]=REG[ns]||{})[loc]=Object.assign((REG[ns]||{})[loc]||{},dict);return function(){}},')
P.push('  bind:function(ns){return function(k){var d=(REG[ns]||{})[LOCALE]||{};return (k in d)?d[k]:k}},')
P.push('  setLocale:function(){},addLanguage:function(){}};</script>')
P.push('<script>try{window.__scMod.apply({logger:{info:function(){},warn:function(){}},effect: function (fn) { return fn ? fn() : undefined },on:function(){},get:function(n){return n==="locale"?svc:undefined}});window.__OK=1}catch(e){window.__BE=String(e)}</script>')
P.push('<script>')
P.push('setTimeout(function(){')
P.push("  var b=document.getElementById('scpanl-btn'); if(b)b.click();")
P.push('  setTimeout(function(){')
P.push("    var root=document.getElementById('scpanl-root');")
P.push('    var items=root?root.querySelectorAll(".sc-nav-item"):[];')
P.push('    for(var i=0;i<items.length;i++){ if(items[i].getAttribute("data-view")==="' + VIEW + '"){ items[i].click(); break } }')
// --expand：再点「展开全部」按钮（供核对展开态）
P.push('    setTimeout(function(){')
P.push("      var more=root?root.querySelector('.sc-idx-more'):null;")
P.push("      if(" + (EXPAND ? 'true' : 'false') + " && more){ more.click(); }")
P.push('    }, 1200);')
P.push('  }, 1500);')
P.push('}, 500)</script>')
P.push('<script>setTimeout(function(){')
/* 滚动位置经 URL hash 传入（`#scroll=N`）—— 同一页面可按段出多张，
 *  无需为每个位置重建页面。判因：模态自带高度上限，只加窗高或解限高都取不到折叠线以下。 */
P.push('  var sm=/scroll=(\\d+)/.exec(location.hash);')
P.push("  var sc=document.querySelector('.sc-view');")
P.push('  if(sm&&sc){ sc.scrollTop=+sm[1]; }')
P.push('  var ch=sc?sc.clientHeight:0, sh=sc?sc.scrollHeight:0;')
P.push("  document.title='SCROLLH'+JSON.stringify({sh:sh,ch:ch,st:sc?Math.round(sc.scrollTop):0})")
P.push('}, 2600)</script>')
P.push('</body></html>')
writeFileSync(page, P.join('\n'), 'utf8')

/** 出图一次（scrollTop 经 hash 传入；0 表示不传） */
function shot (h, out, scrollTop) {
  const url = 'file:///' + page.replace(/\\/g, '/') + (scrollTop ? ('#scroll=' + scrollTop) : '')
  return execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--window-size=1400,' + h, '--screenshot=' + out, '--virtual-time-budget=20000', url],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000, windowsHide: true })
}

if (FULL) {
  /* 量 .sc-view 的 scrollHeight / clientHeight，按段出图 */
  let sh = 0, ch = 0
  try {
    const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
      '--window-size=1400,1000', '--virtual-time-budget=20000', '--dump-dom', 'file:///' + page.replace(/\\/g, '/')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000, maxBuffer: 64 * 1024 * 1024, windowsHide: true })
    const m = dom.match(/<title>SCROLLH(\{[^<]*\})</)
    if (m) { const o = JSON.parse(m[1].replace(/&quot;/g, '"')); sh = o.sh; ch = o.ch }
  } catch (e) { /* 量不到就单张 */ }
  if (!sh || !ch || sh <= ch + 4) {
    console.log('内容未超出视口（sh=' + sh + ' ch=' + ch + '）⇒ 单张全页')
    shot(1000, OUT)
  } else {
    const n = Math.min(Math.ceil(sh / ch), 6)
    console.log('内容 ' + sh + 'px / 视口 ' + ch + 'px ⇒ 分 ' + n + ' 段出图')
    const base = OUT.replace(/\.png$/i, '')
    for (let i = 0; i < n; i++) {
      const st = Math.min(Math.round(i * ch), sh - ch)
      const f = base + '-p' + (i + 1) + '.png'
      shot(1000, f, st)
      console.log('  ' + f + '（scrollTop=' + st + '）')
    }
    console.log('提示：单张 ' + OUT + ' 未生成（--full 时改为分段图）')
  }
} else {
  shot(1000, OUT)
}