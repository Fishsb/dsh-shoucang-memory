/**
 * i18n-parity — 双验收一体（常驻机检 · 2026-09-17）
 *
 * **为什么单独立一件**：`test-i18n-render` 只验**chrome 区**（导航/页头）与总览页——
 *   实测它放过了两处真缺陷：① 设置页渲染裸键（zh 态红线被破，8/9 视图一致时才发现）
 *   ② 观测页 KPI 与 22 个装载期表的 en 态中文残留。**chrome 干净 ≠ 页面干净。**
 *   本件把验收面放大到**全部 9 个视图的全页面可见文本**。
 *
 * 两个判据：
 *   **A. zh 全页保真**：`git show HEAD:client.js`（改动前产物）与新产物逐视图对照，
 *      归一化日志时间戳后必须**逐字符一致**（标签显示变更在记忆库页，本夹具不渲染标签 pill）。
 *   **B. en 全页干净**：新产物在 en 态下逐视图断言**无裸键、无中文残留**（品牌名「守藏」白名单）。
 *
 * 只取**可见文本**（跳过 `<style>`/`<script>`）：`#scpanl-root` 内含样式表，
 *   直接 `textContent` 会把整段 CSS 算进来 ⇒ `.sc-idx-tag.hued` 之类选择器被误判为裸键（实测踩过）。
 *
 * 退出码：0 PASS · 1 FAIL · 3 skip（无 Chrome / 无 git 基线）
 * 用法：node scripts/i18n-parity.mjs [--shots <dir>]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const shotsArg = process.argv.indexOf('--shots')
const SHOTS = shotsArg >= 0 ? resolve(process.argv[shotsArg + 1] || tmpdir()) : null

const PF = process.env.PROGRAMFILES || '', LOCAL = process.env.LOCALAPPDATA || ''
const CHROME = [process.env.CHROME_PATH,
  PF ? PF.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe' : '',
  PF ? PF.replace(/\\/g, '/') + '/Microsoft/Edge/Application/msedge.exe' : '',
  LOCAL ? LOCAL.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe' : '',
].filter(Boolean).find((p) => existsSync(p))
if (!CHROME) { console.log('i18n-parity：未找到 Chrome/Edge —— 跳过（exit 3）'); process.exit(3) }

const NEW = readFileSync(join(ROOT, 'client.js'), 'utf8')
let OLD = null
try { OLD = execFileSync('git', ['show', 'HEAD:client.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) } catch (e) { /* 无基线 */ }

/* 英文词表（模拟宿主 locale 服务的 bind） */
function loadEn () {
  const out = {}
  const dir = join(ROOT, 'src-client')
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter((x) => /^i18n-dict-.*\.js$/.test(x))) {
    const text = readFileSync(join(dir, f), 'utf8')
    const re = /^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',\s*$/gm
    let m
    while ((m = re.exec(text)) !== null) out[m[1].replace(/\\'/g, "'")] = m[2].replace(/\\'/g, "'")
  }
  return out
}
const DICT = JSON.stringify(loadEn())

const FIXTURE = `
window.fetch = function (url) {
  var p = String(url).replace(/^.*?\\/api\\/shoucang-panel/, '').split('?')[0]
  var R = { '/suite':{members:[]}, '/criteria':{carriers:[],tags:[]}, '/mcl/status':{count:0},
    '/config/recent':{items:[]}, '/roots':{roots:[],active:null}, '/deepsleep':{sessions:[],level:0},
    '/memory/index':{rows:[],total:0}, '/memory/notes':{notes:[]}, '/persona':{files:[]},
    '/observe':{events:[]}, '/arch/graph':{nodes:[],edges:[]}, '/vector/status2':{provider:'off',enabled:false} }
  return Promise.resolve({ ok:true, status:200, json:function(){ return Promise.resolve(R[p] || {}) } })
}`

/** 渲染并抓取 9 个视图的可见文本。locale=null ⇒ 不注入 locale 服务（zh 态）。 */
function render (clientSrc, locale, label) {
  const dir = mkdtempSync(join(tmpdir(), 'i18npar-'))
  const page = join(dir, 'p.html')
  const P = []
  P.push('<!DOCTYPE html><html><head><script>window.__ERRS=[];window.onerror=function(m){window.__ERRS.push(String(m))};</script></head><body>')
  P.push('<div class="VOzbGW_footArea"><div class="VOzbGW_triggerRow"><button type="button">Settings</button></div></div>')
  P.push('<script>window.__ModuleLoader__={load:function(cfg){try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>')
  P.push('<script>' + FIXTURE + '</script>')
  P.push('<script>' + clientSrc + '</script>')
  if (locale) {
    P.push('<script>var DICT=' + DICT + ';var LOCALE=' + JSON.stringify(locale) + ';var REG={};')
    P.push('var svc={getLocale:function(){return {active:LOCALE,locales:[],revision:1}},')
    P.push('getSnapshot:function(){return this.getLocale()},subscribe:function(){return function(){}},')
    /* ⚠ 忠实替身（2026-09-17 修假绿）：真实宿主协议是 `register(ns, loc, dict)` 累积 + `bind(ns)` 查累积表。
   *  旧实现把 register 写成空函数、bind 直接查**自读的 DICT** ⇒ **注册路径从未被行使**，
   *  于是「700 条词条未注册」这种功能缺陷在本件里**永远显示为绿**（实测骗过一整轮交付）。
   *  现改为：register 累积进 REG[ns][loc]，bind 只查 REG ⇒ 不注册 ⇒ 回落成中文键 ⇒ **测试如实变红**。 */
  P.push('register:function(ns,loc,dict){(REG[ns]=REG[ns]||{})[loc]=Object.assign((REG[ns]||{})[loc]||{},dict);return function(){}},')
  P.push('bind:function(ns){return function(k){var d=(REG[ns]||{})[LOCALE]||{};return (k in d)?d[k]:k}},')
    P.push('setLocale:function(){},addLanguage:function(){}};</script>')
    P.push('<script>try{window.__scMod.apply({logger:{info:function(){},warn:function(){}},effect: function (fn) { return fn ? fn() : undefined },on:function(){},get:function(n){return n==="locale"?svc:undefined}});window.__OK=1}catch(e){window.__BE=String(e)}</script>')
  } else {
    P.push('<script>try{window.__scMod.apply({logger:{info:function(){},warn:function(){}},effect: function (fn) { return fn ? fn() : undefined },on:function(){},get:function(){return undefined}});window.__OK=1}catch(e){window.__BE=String(e)}</script>')
  }
  P.push('<script>')
  P.push('var OUT={};setTimeout(function(){')
  P.push("  var b=document.getElementById('scpanl-btn'); if(b)b.click();")
  P.push('  setTimeout(function(){')
  P.push("    var root=document.getElementById('scpanl-root');")
  P.push('    function visText(n){var s="";for(var i=0;i<n.childNodes.length;i++){var c=n.childNodes[i];')
  P.push('      if(c.nodeType===3)s+=c.nodeValue;')
  P.push('      else if(c.nodeType===1&&c.tagName!=="STYLE"&&c.tagName!=="SCRIPT")s+=visText(c);}')
  P.push('      return s;}')
  P.push('    var items = root ? root.querySelectorAll(".sc-nav-item") : [];')
  P.push('    var i = 0;')
  P.push('    function step(){')
  P.push('      if (i >= items.length) { document.title="RESULT"+JSON.stringify({ok:!!window.__OK,errs:window.__ERRS,be:window.__BE||null,n:items.length,miss:(window.__SC_I18N_MISS__||[]).length,out:OUT}); return }')
  P.push('      items[i].click();')
  P.push('      setTimeout(function(){ OUT["idx"+i]=(visText(root)||"").replace(/\\s+/g," ").trim(); i++; step(); }, 220);')
  P.push('    }')
  P.push('    step();')
  P.push('  }, 1400);')
  P.push('}, 500)</script>')
  P.push('</body></html>')
  writeFileSync(page, P.join('\n'), 'utf8')
  let out = ''
  try {
    out = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=20000', '--dump-dom', 'file:///' + page.replace(/\\/g, '/')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000, maxBuffer: 64 * 1024 * 1024, windowsHide: true })
  } catch (e) { out = String(e.stdout || '') }
  if (SHOTS && locale) {
    try {
      mkdirSync(SHOTS, { recursive: true })
      execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--window-size=1280,860', '--screenshot=' + join(SHOTS, 'i18n-parity-' + label + '.png'),
        '--virtual-time-budget=20000', 'file:///' + page.replace(/\\/g, '/')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000, windowsHide: true })
    } catch (e) { /* 出图失败不影响断言 */ }
  }
  rmSync(dir, { recursive: true, force: true })
  const m = out.match(/<title>RESULT([\s\S]*?)<\/title>/)
  if (!m) return null
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) } catch (e) { return null }
}

let pass = 0
const fails = []
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fails.push(m); console.error('  ❌ ' + m) }

console.log('i18n 双验收（A. zh 全页保真 vs 改动前产物 · B. en 全页无裸键/无中文残留）')

/* ── A. zh 全页保真 ──
 *
 * ⚠ 基线机制（2026-09-17 改）：原基线是 `git show HEAD:client.js` ——
 *   它只能抓「**未提交**的意外漂移」：一旦提交，与自身比对即成**恒真**；
 *   而**刻意**的 UI 改动（如阶段 2 的行形状归一）在提交前必红，无法验收。
 *   现改为**夹具基线**（`scripts/fixtures/i18n-zh-baseline.json`）：
 *   · 默认与夹具逐视图比对 —— 任何 zh 漂移都报，**与提交状态无关**；
 *   · 刻意改动时跑 `--update-baseline` 显式更新（CHANGELOG 记一笔）；
 *   · 夹具缺失时回退到 `git show HEAD:client.js`（首次或无夹具环境）。
 */
const ZH_BASELINE = join(ROOT, 'scripts', 'fixtures', 'i18n-zh-baseline.json')
const UPDATE = process.argv.includes('--update-baseline')
if (UPDATE) {
  const r = render(NEW, null, 'new-zh')
  if (!r) bad('A 未能取到 zh 渲染结果（无法更新基线）')
  else {
    mkdirSync(dirname(ZH_BASELINE), { recursive: true })
    writeFileSync(ZH_BASELINE, JSON.stringify({ at: new Date().toISOString(), n: r.n, out: r.out }, null, 1), 'utf8')
    console.log('  · A 基线已更新：scripts/fixtures/i18n-zh-baseline.json（' + r.n + ' 个视图）')
  }
} else {
  let base = null, srcName = ''
  if (existsSync(ZH_BASELINE)) { try { base = JSON.parse(readFileSync(ZH_BASELINE, 'utf8')); srcName = '夹具 i18n-zh-baseline.json' } catch (e) { base = null } }
  if (!base && OLD) { base = render(OLD, null, 'old-zh'); srcName = 'git HEAD:client.js（夹具缺失，兜底）' }
  if (!base) {
    console.log('  · A 跳过（无夹具亦无 git 基线；跑 `--update-baseline` 可建立夹具）')
  } else {
    const newR = render(NEW, null, 'new-zh')
    if (!newR) bad('A 未能取到 zh 渲染结果')
    else {
      const norm = (s) => String(s == null ? '' : s).replace(/\d{2}:\d{2}:\d{2}/g, 'TT:TT:TT').replace(/·\d+ms·200/g, '·Xms·200')
      const n = Math.min(base.n || 0, newR.n || 0)
      const diffs = []
      for (let k = 0; k < n; k++) {
        const a = norm((base.out || {})['idx' + k]), b = norm(newR.out['idx' + k])
        if (a !== b) diffs.push('idx' + k)
      }
      if (diffs.length) bad('A zh 态与基线不一致的视图：' + diffs.join(', ') + '（基线来源：' + srcName + '）')
      else ok('A zh 全页保真：' + n + ' 个视图与基线逐字符一致（基线来源：' + srcName + '）')
    }
  }
}
/* ── B. en 全页干净 ── */
{
  const enR = render(NEW, 'en', 'new-en')
  if (!enR) bad('B 未能取到 en 渲染结果')
  else if (enR.miss) bad('B en 态缺键记录 ' + enR.miss + ' 个（t() 回落成 key 字面量）')
  else {
    const CJK = /[\u4e00-\u9fff]/g
    const KEYISH = /\b((?:nav|mem|shell|host|persona|note|growth|tag|cfg|pane)\.[a-zA-Z][a-zA-Z0-9.]*)/g
    const n = enR.n || 0
    let problems = 0
    for (let k = 0; k < n; k++) {
      const txt = enR.out['idx' + k] || ''
      const keys = [...new Set(txt.match(KEYISH) || [])]
      const segs = [...new Set(txt.match(/[\u4e00-\u9fff][^\s]{0,14}/g) || [])].filter((s) => s[0] !== '守')
      if (keys.length) { problems++; bad('B idx' + k + ' 裸键：' + keys.slice(0, 5).join(', ')) }
      if (segs.length) { problems++; bad('B idx' + k + ' 中文残留：' + segs.slice(0, 4).join(' | ')) }
    }
    if (!problems) ok('B en 全页干净：' + n + ' 个视图（无裸键、无中文残留、零缺键）')
  }
}

console.log('')
if (fails.length) {
  console.error(`i18n 双验收: FAIL（${pass} PASS / ${fails.length} FAIL）`)
  fails.forEach((m) => console.error('  · ' + m))
  process.exit(1)
}
console.log(`i18n 双验收: PASS（${pass} 项）`)
process.exit(0)
