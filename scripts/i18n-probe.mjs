/**
 * i18n-probe — 调试：把 test-i18n-render 的页面装配单独跑一遍并打印**页面内真实报错**
 *
 * 背景：`test-i18n-render` 的结果靠 `document.title` 回传；页面内若有 JS 错误，
 *   title 根本不写 ⇒ 外层只看到「未取到结果」，**看不到真因**。
 *   本件在页面里挂 `window.onerror` 并把错误一并写进 title，用于定位这类静默失败。
 *
 * 用法：node scripts/i18n-probe.mjs [en|zh]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCALE = (process.argv[2] || 'en').trim()
const client = readFileSync(join(ROOT, 'client.js'), 'utf8')

function loadEnDict () {
  const out = {}
  for (const f of readdirSync(join(ROOT, 'src-client')).filter((x) => /^i18n-dict-.*\.js$/.test(x))) {
    const text = readFileSync(join(ROOT, 'src-client', f), 'utf8')
    const re = /^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',\s*$/gm
    let mm
    while ((mm = re.exec(text)) !== null) out[mm[1].replace(/\\'/g, "'")] = mm[2].replace(/\\'/g, "'")
  }
  return out
}

const PF = process.env.PROGRAMFILES || ''
const LOCAL = process.env.LOCALAPPDATA || ''
const chrome = [
  process.env.CHROME_PATH,
  PF ? PF.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe' : '',
  PF ? PF.replace(/\\/g, '/') + '/Microsoft/Edge/Application/msedge.exe' : '',
  LOCAL ? LOCAL.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe' : '',
].filter(Boolean).find((p) => existsSync(p))
if (!chrome) { console.log('未找到 Chrome —— 跳过'); process.exit(3) }

const dir = mkdtempSync(join(tmpdir(), 'i18n-probe-'))
const page = join(dir, 'p.html')
const dict = JSON.stringify(loadEnDict())

const html = `<!DOCTYPE html><html><head><script>
window.__ERRS=[];window.onerror=function(m,s,l,c,e){window.__ERRS.push(String(m)+' @'+l+':'+c)};
</script></head><body>
<!-- 最小宿主外壳：提供 sidebar footArea + triggerRow 按钮。
     判因（实测）：无 footArea 时 mountSidebarEntry 重试 40x500ms=20s 才落兜底按钮，
     探针等不到 ⇒ 面板打不开、导航读不到（假「未渲染」）。ui-geo-regress 正是靠夹具注入这层。 -->
<div class="VOzbGW_footArea"><div class="VOzbGW_triggerRow"><button type="button">Settings</button></div></div>
<script>window.__ModuleLoader__={load:function(cfg){try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>
<script>window.fetch=function(){return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve({})}})};window.__REG=[];</script>
<script>${client}</script>
<script>
var DICT=${dict}; var LOCALE="${LOCALE}";
var svc={
  getLocale:function(){return {active:LOCALE,locales:[],revision:1}},
  getSnapshot:function(){return this.getLocale()},
  subscribe:function(){return function(){}},
  register:function(){return function(){}},
  bind:function(){return function(key){return (key in DICT)?DICT[key]:key}},
  setLocale:function(){}, addLanguage:function(){}
};
try{
  window.__scMod.apply({logger:{info:function(){},warn:function(){}},
    effect:function(){},
    on:function(){}, get:function(n){return n==='locale'?svc:undefined}});
  window.__APPLY_OK=true;
}catch(e){window.__BE=String(e)+' | '+(e&&e.stack||'').split('\\n').slice(0,2).join(' <<< ')}
</script>
<script>setTimeout(function(){
  /* 打开面板：#scpanl-btn 只在 DOM 直插回退路径存在；插槽可用时不挂它（S2 互斥）。
   *  注意：本段位于 HTML 模板串内，注释中不得使用反引号（会提前终止模板串）。 */
  var opened=false;
  var btn=document.getElementById('scpanl-btn');
  if(btn){ btn.click(); opened=true; }
  if(!opened){
    // 退路：直接构造 mask 上的点击（openPanel 未导出，故用侧栏入口或程序化触发）
    var mask=document.getElementById('scpanl-mask');
    if(mask){ mask.classList.add('open'); }
  }
  setTimeout(function(){
  var root=document.getElementById('scpanl-root');
  var navTxt='', navCount=0, diag={};
  diag.hasBtn=!!btn; diag.opened=opened;
  diag.mask=!!document.getElementById('scpanl-mask');
  diag.modal=!!document.getElementById('scpanl-modal');
  if(root){
    diag.nav=!!root.querySelector('.sc-nav');
    diag.navItems=root.querySelectorAll('.sc-nav-item').length;
    diag.navItemsDataView=root.querySelectorAll('.sc-nav-item[data-view]').length;
    var nav=root.querySelector('.sc-nav'); if(nav){
      var parts=[]; var gs=nav.querySelectorAll('.sc-nav-group');
      for(var g=0;g<gs.length;g++)parts.push(gs[g].textContent||'');
      var ns=nav.querySelectorAll('.sc-nav-item[data-view] span');
      for(var n=0;n<ns.length;n++)parts.push(ns[n].textContent||'');
      navTxt=parts.join('|'); navCount=ns.length;
    }
  }
  document.title='RESULT'+JSON.stringify({
    locale:LOCALE, applyOk:!!window.__APPLY_OK, root:!!root,
    errs:window.__ERRS, le:window.__LE||null, be:window.__BE||null,
    navTxt:navTxt, navCount:navCount, diag:diag,
    missCount:(window.__SC_I18N_MISS__||[]).length, miss:(window.__SC_I18N_MISS__||[]).slice(0,5)
  });
  },1000);
},600)</script>
</body></html>`
writeFileSync(page, html, 'utf8')

let out = ''
try {
  out = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=6000',
    '--dump-dom', 'file:///' + page.replace(/\\/g, '/')],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
} catch (e) { out = String(e.stdout || '') }
rmSync(dir, { recursive: true, force: true })

const m = out.match(/<title>RESULT([\s\S]*?)<\/title>/)
if (!m) { console.log('未取到 title；dom 长度 =', out.length); process.exit(1) }
const info = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
console.log(`i18n-probe · locale=${LOCALE}`)
console.log('  apply 成功 :', info.applyOk)
console.log('  骨架挂载   :', info.root)
console.log('  页面异常   :', info.errs.length ? info.errs : '无')
console.log('  工厂异常   :', info.le || '无')
console.log('  apply 异常 :', info.be || '无')
console.log('  effect 异常:', info.effectErr || '无')
console.log('  缺键数     :', info.missCount, info.miss.length ? info.miss : '')
console.log('  导航项数   :', info.navCount)
console.log('  诊断       :', JSON.stringify(info.diag))
console.log('  导航文本   :', JSON.stringify(info.navTxt))
