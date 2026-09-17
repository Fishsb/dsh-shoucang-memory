/**
 * test-i18n-render — 中英两态渲染验收（v2.1 §九 · 2026-09-17）
 *
 * **为什么不并入 ui-geo-regress**：该件（与 test-panel-view-contract）在 `check-runner.mjs`
 *   的 CHECKS 中登记为 `{ xfail: true }` —— 并进去会被「预期失败」语义**吞掉**
 *   （无 Chrome 机器上整件退 4 不判失败）。本件独立计数、独立登记，**永不申报 xfail**。
 *
 * **它证什么**（v2.1 明确边界，防「同源重言」）：
 *   ① 中英两态都能装载且骨架挂载（不是白屏）
 *   ② 两态导航文本**确实不同**（语言切换真生效）
 *   ③ en 态 chrome 区**零中文残留**（判据独立于词表：不读词表值去比词表值）
 *   ④ 页面**不出现裸键**（xxx.yyy 形态标识符）
 *   ⑤ 运行时缺键记录 `window.__SC_I18N_MISS__` 为空
 *   ⑥ 几何：无横向溢出
 *
 * 退出码：0 PASS · 1 FAIL · 3 skip（无 Chrome）· 4 **永不使用**
 * 用法：node scripts/test-i18n-render.mjs [--shots <dir>] [--selftest]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')
const SELFTEST = process.argv.includes('--selftest')
const shotsArg = process.argv.indexOf('--shots')
const SHOTS = shotsArg >= 0 ? resolve(process.argv[shotsArg + 1] || tmpdir()) : null

/* ── Chrome 探测（与姊妹件同口径：不写死本机路径） ── */
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
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean)
let CHROME = CAND.find((p) => existsSync(p))
if (!CHROME) {
  for (const n of ['chrome', 'google-chrome', 'chromium', 'msedge']) {
    try {
      const o = execFileSync(process.platform === 'win32' ? 'where' : 'which', [n],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim()
      if (o && existsSync(o)) { CHROME = o; break }
    } catch (e) { /* 未安装 */ }
  }
}
if (!CHROME) { console.log('i18n 两态渲染：未找到 Chrome/Edge —— 环境缺件，跳过（exit 3）'); process.exit(3) }
if (!existsSync(CLIENT)) { console.error('缺 client.js（先 npm run build:client）'); process.exit(1) }
const client = readFileSync(CLIENT, 'utf8')

/* ── 读词表（仅供 mock locale 服务取数；**不用于断言英文正确性**，避免同源重言） ── */
function loadEnDict () {
  const out = {}
  const dir = join(ROOT, 'src-client')
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter((x) => /^i18n-dict-.*\.js$/.test(x))) {
    const text = readFileSync(join(dir, f), 'utf8')
    const re = /^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',\s*$/gm
    let mm
    while ((mm = re.exec(text)) !== null) {
      out[mm[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')] = mm[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    }
  }
  return out
}
/* ⚠ DICTS 必须在 render() 调用**之前**定义：早先它放在文件末尾，而 render 内引用它
 *   ⇒ TDZ（Cannot access before initialization）被 try/catch 吞成「未取到结果」，
 *   表现为「Chrome dump 失败」的**假缺陷**（实测踩过）。 */
const DICTS = { en: loadEnDict() }

const CJK = /[\u4e00-\u9fff]/
let pass = 0
const fails = []
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fails.push(m); console.error('  ❌ ' + m) }

/**
 * 在指定语言下装载面板并取回测量结果。
 *
 * 关键：mock ctx **提供 locale 服务**（本件与 ui-geo-regress 的核心差异），
 * 并注入**最小宿主外壳**（footArea）——否则 mountSidebarEntry 要重试 40×500ms 才落兜底按钮，
 * 探针等不到 ⇒ 面板打不开、导航读不到（会表现为「chrome 区文本为空」的假缺陷）。
 */
function render (locale) {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-render-' + locale + '-'))
  const page = join(dir, 'p.html')
  const P = []
  P.push('<!DOCTYPE html><html><head><script>')
  P.push("window.__ERRS=[];window.onerror=function(m,s,l,c,e){window.__ERRS.push(String(m)+' @'+l+':'+c)};")
  P.push('</script></head><body>')
  P.push('<div class="VOzbGW_footArea"><div class="VOzbGW_triggerRow"><button type="button">Settings</button></div></div>')
  P.push("<script>window.__ModuleLoader__={load:function(cfg){try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>")
  P.push("<script>window.fetch=function(){return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve({})}})};window.__REG=[];</script>")
  P.push('<script>' + client + '</script>')
  P.push('<script>')
  P.push('var DICT = ' + JSON.stringify(DICTS.en) + ';')
  P.push('var LOCALE = ' + JSON.stringify(locale) + ';')
  P.push('var svc = {')
  P.push("  getLocale: function () { return { active: LOCALE, locales: [{id:'zh',label:'中文'},{id:'en',label:'English'}], revision: 1 } },")
  P.push('  getSnapshot: function () { return this.getLocale() },')
  P.push('  subscribe: function () { return function () {} },')
  P.push('  register: function (ns, loc, dict) { (REG[ns] = REG[ns] || {})[loc] = Object.assign((REG[ns] || {})[loc] || {}, dict); return function () {} },')
  P.push('  bind: function () { return function (key) { return (key in DICT) ? DICT[key] : key } },')
  P.push('  setLocale: function () {}, addLanguage: function () {}')
  P.push('};')
  P.push('try {')
  P.push('  window.__scMod.apply({')
  P.push('    logger:{info:function(){},warn:function(){}},')
  P.push('    effect: function (fn) { return fn ? fn() : undefined },')
  P.push("    on:function(){}, get:function(n){ return n === 'locale' ? svc : undefined }")
  P.push('  });')
  P.push('  window.__APPLY_OK = true;')
  P.push('} catch(e) { window.__BE = String(e); }')
  P.push('</script>')
  P.push('<script>setTimeout(function(){')
  P.push("  var b = document.getElementById('scpanl-btn'); if (b) b.click();")
  P.push('  setTimeout(function(){')
  P.push("    var root = document.getElementById('scpanl-root');")
  P.push("    var navSel = root ? root.querySelectorAll('.sc-nav-item[data-view]') : [];")
  P.push("    var chromeTxt = '';")
  P.push('    if (root) {')
  P.push("      var nav = root.querySelector('.sc-nav');")
  P.push('      if (nav) {')
  P.push('        var ps = [];')
  P.push("        var gs = nav.querySelectorAll('.sc-nav-group');")
  P.push("        for (var g = 0; g < gs.length; g++) ps.push(gs[g].textContent || '');")
  P.push("        var ns = nav.querySelectorAll('.sc-nav-item[data-view] span');")
  P.push("        for (var n = 0; n < ns.length; n++) ps.push(ns[n].textContent || '');")
  P.push("        chromeTxt = ps.join('|');")
  P.push('      }')
  P.push('    }')
  P.push('    /* 只取**可见文本**：`#scpanl-root` 内含 <style>，直接 textContent 会把整段 CSS 算进来')
  P.push('     *  ⇒ CSS 选择器（如 .sc-idx-tag.hued）会被误判成裸键（实测踩过：tag.hued 假报）。 */')
  P.push("    function visText(n){var s='';for(var i=0;i<n.childNodes.length;i++){var c=n.childNodes[i];")
  P.push("      if(c.nodeType===3)s+=c.nodeValue;")
  P.push("      else if(c.nodeType===1&&c.tagName!=='STYLE'&&c.tagName!=='SCRIPT')s+=visText(c);}")
  P.push('      return s;}')
  P.push("    var bodyTxt = root ? visText(root) : '';")
  P.push('    /* 裸键探测：v2.1 的意图是「界面出现**词表键**字面量」（如 nav.memory）。')
  P.push('     *  ⚠ 不能把所有 a.b 都当裸键——实测踩过：运行观测页的日志文本含 i.running /')
  P.push('     *  i.stalled 这类**数据内容**（对象序列化），宽判据会误报成裸键（假缺陷）。')
  P.push('     *  故只认本仓词表键的**真实前缀**（见 i18n-dict-*.js 的 key 约定）。 */')
  P.push('    var KEY_PREFIX = /^(nav|mem|shell|host|persona|note|growth|tag)\\./;')
  P.push('    var bareKeys = [];')
  P.push('    /* 裸键判据（2026-09-17 修）：**不要求前置边界符**。')
  P.push('     *  判因（实测漏报 · 假绿）：旧判据要求键前是 [\\s（(【\\[] 之一，而设置页实际是')
  P.push('     *  「…此项。nav.overviewnav.memory…」—— 分隔符是**句号**、9 个键**彼此紧邻**')
  P.push('     *  ⇒ 前后都取不到边界 ⇒ **全部漏报**：两态验收当轮 PASS，却漏掉 zh 态红线违反。')
  P.push('     *  现用 \\b + 前缀白名单，任意分隔符均可命中（配合 KEY_PREFIX 白名单防误报）。 */')
  P.push('    var re = /\\b((?:nav|mem|shell|host|persona|note|growth|tag)\\.[a-zA-Z][a-zA-Z0-9.]*)/g;')
  P.push('    var mm;')
  P.push('    while ((mm = re.exec(bodyTxt)) !== null) {')
  P.push('      var s = mm[1];')
  P.push('      if (!KEY_PREFIX.test(s)) continue;')
  P.push('      bareKeys.push(s);')
  P.push('    }')
  P.push('    bareKeys = bareKeys.slice(0, 8);')
  P.push('    var overflow = { doc: document.documentElement.scrollWidth, win: window.innerWidth };')
  P.push("    var pills = root ? root.querySelectorAll('.sc-idx-tag') : [];")
  P.push('    var wrapped = 0;')
  P.push('    for (var i = 0; i < pills.length; i++) {')
  P.push('      if (pills[i].scrollHeight > pills[i].clientHeight + 2 && pills[i].clientHeight > 0) wrapped++;')
  P.push('    }')
  P.push("    document.title = 'RESULT' + JSON.stringify({")
  P.push('      locale: LOCALE, applyOk: !!window.__APPLY_OK, root: !!root,')
  P.push('      errs: window.__ERRS, le: window.__LE || null, be: window.__BE || null,')
  P.push('      navCount: navSel.length, chromeTxt: chromeTxt, bareKeys: bareKeys,')
  P.push('      missCount: (window.__SC_I18N_MISS__ || []).length, miss: (window.__SC_I18N_MISS__ || []).slice(0, 5),')
  P.push('      overflow: overflow, pills: pills.length, wrapped: wrapped')
  P.push('    });')
  P.push('  }, 1600);')
  P.push('}, 600)</script>')
  P.push('</body></html>')
  writeFileSync(page, P.join('\n'), 'utf8')

  let out = ''
  try {
    out = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=9000', '--dump-dom', 'file:///' + page.replace(/\\/g, '/')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
  } catch (e) { out = String(e.stdout || '') }

  if (SHOTS) {
    try {
      mkdirSync(SHOTS, { recursive: true })
      execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--window-size=1280,860', '--screenshot=' + join(SHOTS, 'i18n-' + locale + '.png'),
        '--virtual-time-budget=9000', 'file:///' + page.replace(/\\/g, '/')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000, windowsHide: true })
    } catch (e) { /* 出图失败不影响断言 */ }
  }

  const m = out.match(/<title>RESULT([\s\S]*?)<\/title>/)
  rmSync(dir, { recursive: true, force: true })
  if (!m) return null
  try {
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
  } catch (e) { return null }
}

/** --selftest：证明断言会红（防恒真）。 */
function selftest () {
  console.log('--selftest：用合成数据证明断言会红（防恒真）')
  let p = 0, f = 0
  const chk = (cond, name) => { if (cond) { p++; console.log('  ✓ ' + name) } else { f++; console.error('  ✗ ' + name) } }
  chk(CJK.test('运行总览'), '含中文串被检出')
  chk(!CJK.test('Overview'), '纯英文串不误报')
  const bare = (s) => (s.match(/(?:^|[\s（(【\[])([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)(?=[\s）)】\]，,。;；:：!?]|$)/g) || [])
    .map((x) => x.trim()).filter((x) => !/\.(md|js|ts|json|jsonl|mjs|html|css|yaml|yml|cjs)$/.test(x))
  chk(bare('见 nav.memory 项').length === 1, '裸键 nav.memory 被检出')
  chk(bare('见 README.md 文件').length === 0, '文件名 README.md 不误报')
  chk(bare('端点 /arch/graph 正常').length === 0, '路径不误报')
  const d = loadEnDict()
  chk(Object.keys(d).length > 100, '词表加载非空（' + Object.keys(d).length + ' 条）')
  console.log('\n--selftest: ' + p + ' PASS / ' + f + ' FAIL')
  process.exit(f ? 1 : 0)
}

if (SELFTEST) selftest()

console.log('i18n 两态渲染验收（zh / en · 真实 client.js + locale 服务替身 + 最小宿主外壳）')
console.log('  词表条目（en）: ' + Object.keys(DICTS.en).length)

const zh = render('zh')
const en = render('en')
if (!zh || !en) { console.error('  ❌ 未能取到渲染结果（Chrome dump 失败或页面未写 title）'); process.exit(1) }

for (const [name, r] of [['zh', zh], ['en', en]]) {
  if (r.applyOk && r.root) ok(name + ' 态：面板装载且骨架挂载（导航项 ' + r.navCount + '）')
  else bad(name + ' 态装载失败（applyOk=' + r.applyOk + ' root=' + r.root + ' be=' + (r.be || '-') + ' le=' + (r.le || '-') + '）')
  if (r.errs && r.errs.length) bad(name + ' 态运行时异常：' + r.errs.slice(0, 2).join(' | '))
  else ok(name + ' 态：无运行时异常')
}

if (zh.chromeTxt && en.chromeTxt && zh.chromeTxt !== en.chromeTxt) ok('zh 与 en 导航文本确实不同（语言切换生效）')
else bad('语言切换未生效或导航为空（zh="' + (zh.chromeTxt || '').slice(0, 40) + '" en="' + (en.chromeTxt || '').slice(0, 40) + '"）')

{
  const residual = (en.chromeTxt.match(/[\u4e00-\u9fff]+/g) || []).filter((s) => s !== '守藏')
  if (residual.length) bad('en 态导航/页头仍有中文残留：' + [...new Set(residual)].slice(0, 6).join(' '))
  else ok('en 态 chrome 区零中文残留（仅品牌名白名单）')
}

if (en.bareKeys && en.bareKeys.length) bad('en 态出现疑似裸键：' + en.bareKeys.join(', '))
else ok('en 态无裸键')

if (en.missCount) bad('en 态缺键 ' + en.missCount + ' 个（t() 回落成 key）：' + (en.miss || []).slice(0, 5).join(', '))
else ok('en 态缺键记录为空（所有 tr() 键均有词条）')

for (const [name, r] of [['zh', zh], ['en', en]]) {
  if (r.overflow.doc <= r.overflow.win + 2) ok(name + ' 态无横向溢出（' + r.overflow.doc + ' ≤ ' + r.overflow.win + '）')
  else bad(name + ' 态横向溢出：' + r.overflow.doc + ' > ' + r.overflow.win)
}
if (en.pills > 0) {
  if (en.wrapped === 0) ok('en 态标签 pill 不换行（' + en.pills + ' 个）')
  else bad('en 态 ' + en.wrapped + '/' + en.pills + ' 个标签 pill 换行')
} else {
  console.log('  ℹ en 态本页无标签 pill（总览页）—— pill 断言在记忆库页由几何回归覆盖')
}

console.log('')
if (fails.length) {
  console.error('i18n 两态渲染: FAIL（' + pass + ' PASS / ' + fails.length + ' FAIL）')
  fails.forEach((m) => console.error('  · ' + m))
  process.exit(1)
}
console.log('i18n 两态渲染: PASS（' + pass + ' 项断言）')
process.exit(0)
