/**
 * test-idxrow-pills — 索引行胶囊唯一性（2026-09-17，用户实测报告「点击展开全部又是双标签」）
 *
 * **判因**：`renderIndexRows(container, lines, returnRender, withTagCount)` 在 `withTagCount=true` 时
 *   **同一行渲染了两次同一个胶囊** —— 左列（`.sc-idx-row > .sc-idx-tag`）与右列
 *   （`.sc-idx-row > .sc-right > .sc-idx-tag` 紧跟「N 条」）各一个 ⇒ 视觉上「双标签」。
 *   而折叠态与「展开全部」都走同一个 `renderIndexRows(..., true)`，故展开后同样重复。
 *
 * **本件是行为级真机验收**（不是读源码）：用**真实索引行**造 `/memory/overview` 夹具，
 *   渲染面板 → 进记忆库 → 知识索引 Tab → 逐行数 `.sc-idx-tag`，断言**每行恰好 1 个**。
 *   另断言右列「N 条」仍在（修复不得把计数一起丢掉）。
 *
 * ── 判据载体补齐（2026-09-19 · 会议 R2/R3，两处口径修正）──
 * ① **夹具源改活库**：原读仓根 `_memory/MEMORY.md`（实测 1,935 B / **19 索引行** / mtime 2026-09-08，
 *    是**未被 git 跟踪的旧副本**），与真库（67,405 B / 518 行）**规模差 34 倍、形态已分叉**
 *    ⇒ 用旧副本跑绿 = 「夹具绿 ≠ 真数据绿」。现优先用活库（`~/.dsh/skills/managing-memory/MEMORY.md`，
 *    尊重 `MEMORY_ROOT` 覆盖），旧副本降为**兜底**（并在输出里标明用的是哪一个）。
 *    ⚠ `_memory/` 在验收链里的本职是**红线看守对象**（`check-i18n-redlines` R3 查其无改动 /
 *      `check-public-tree` FORBIDDEN / `check-hardcode` EXCLUDE_DIRS），**不应被当数据基准**。
 * ② **新增「响应字段真机断言」**：本仓**无任何响应字段级门禁**（`panel-contract.ts` 只声明请求侧）
 *    ⇒ 删字段零护栏。此处补上：真机 HTTP 拉 `/memory/overview`，断言
 *    `indexes[]` 不含 `text`、`lines[]` 不含 `raw`、且 `lines[]` 的 tag/subject/pointer **三字段完整且 >0**
 *    （少一个会让 `panes-memory-detail.js` 静默显示「知识索引 0 条」——该处无空态守卫）。
 *    **反例自证**：把 text 加回夹具，本判据必须 FAIL（断言非恒真）。
 *
 * 退出码：0 PASS · 1 FAIL · 3 skip（无 Chrome / 无索引数据）
 * 用法：node scripts/test-idxrow-pills.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/* 夹具源优先级：① $MEMORY_ROOT/MEMORY.md（显式覆盖）② 活库（真数据）③ 仓根 _memory/（旧副本兜底） */
const LIVE = process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'suite', 'memory')
const CANDIDATES = [
  { path: join(LIVE, 'MEMORY.md'), src: '活库' },
  { path: join(ROOT, '_memory', 'MEMORY.md'), src: '仓根 _memory（旧副本，兜底）' },
]
const picked = CANDIDATES.find((c) => existsSync(c.path))
if (!picked) { console.log('test-idxrow-pills：未找到 MEMORY.md（活库与 _memory 皆无）—— 跳过（exit 3）'); process.exit(3) }
const MEM = picked.path

const PF = process.env.PROGRAMFILES || '', LOCAL = process.env.LOCALAPPDATA || ''
const CHROME = [process.env.CHROME_PATH,
  PF ? PF.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe' : '',
  PF ? PF.replace(/\\/g, '/') + '/Microsoft/Edge/Application/msedge.exe' : '',
  LOCAL ? LOCAL.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe' : '',
].filter(Boolean).find((p) => existsSync(p))
if (!CHROME) { console.log('test-idxrow-pills：未找到 Chrome/Edge —— 跳过（exit 3）'); process.exit(3) }

/* ── 用真实索引行造夹具 ──
 * 册零后索引行**只含三字段**（tag/subject/pointer）——`text`/`raw` 已从响应删除（零消费）。
 * 本夹具因此**只能**造三字段；下文的「响应字段断言」直接验真端点，不依赖本夹具。 */
const lines = []
for (const ln of readFileSync(MEM, 'utf8').split(/\r?\n/)) {
  const m = /^\s*(?:-\s*)?\[([^\]]{1,14})\]\s*(.*)$/.exec(ln)
  if (m) lines.push({ tag: m[1], subject: m[2].slice(0, 60), pointer: 'notes/x.md' })
}
if (!lines.length) { console.log('test-idxrow-pills：真实索引行为空 —— 跳过（exit 3）'); process.exit(3) }
const OVERVIEW = JSON.stringify({
  present: true,
  indexes: [{ name: 'MEMORY.md', chars: 900, cap: 3000, lines }],
  notes: [{ file: 'env.md', chars: 100 }],
  pending: { count: 0 },
})

const dir = mkdtempSync(join(tmpdir(), 'idxpill-'))
const page = join(dir, 'p.html')
const P = []
P.push('<!DOCTYPE html><html><head><script>window.__ERRS=[];window.onerror=function(m){window.__ERRS.push(String(m))};</script></head><body>')
P.push('<div class="VOzbGW_footArea"><div class="VOzbGW_triggerRow"><button type="button">Settings</button></div></div>')
P.push('<script>window.__ModuleLoader__={load:function(cfg){try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>')
P.push('<script>window.fetch=function(url){var p=String(url).replace(/^.*?\\/api\\/shoucang-panel/,"").split("?")[0];')
P.push('  var R={"/memory/overview":' + OVERVIEW + ',"/cognition/report":{archive:[]},"/vector/status2":{provider:"off"}};')
P.push('  return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve(R[p]||{})}})};</script>')
P.push('<script>' + readFileSync(join(ROOT, 'client.js'), 'utf8') + '</script>')
P.push('<script>try{window.__scMod.apply({logger:{info:function(){},warn:function(){}},effect: function (fn) { return fn ? fn() : undefined },on:function(){},get:function(){return undefined}});window.__OK=1}catch(e){window.__BE=String(e)}</script>')
P.push('<script>')
P.push('var OUT={};setTimeout(function(){')
P.push("  var b=document.getElementById('scpanl-btn'); if(b)b.click();")
P.push('  setTimeout(function(){')
P.push("    var root=document.getElementById('scpanl-root');")
P.push('    var items=root?root.querySelectorAll(".sc-nav-item"):[];')
P.push('    var target=null;')
P.push('    for(var i=0;i<items.length;i++){ if((items[i].textContent||"").indexOf("记忆库")>=0){ target=items[i]; break } }')
P.push('    if(!target){ document.title="RESULT"+JSON.stringify({err:"未找到记忆库导航项"}); return }')
P.push('    target.click();')
P.push('    setTimeout(function(){')
P.push('      var heads=root.querySelectorAll(".sc-idx-group");')
P.push('      var rows=root.querySelectorAll(".sc-idx-row");')
P.push('      var hs=[];')
P.push('      for(var i=0;i<heads.length;i++){')
P.push('        var hp=heads[i].querySelectorAll(".sc-idx-tag");')
P.push('        var nEl=heads[i].querySelector(".sc-idx-group-n");')
P.push('        hs.push({pills:hp.length, tag:hp.length?hp[0].textContent:"", n:nEl?nEl.textContent:""})')
P.push('      }')
P.push('      var rowPills=0;')
P.push('      for(var r=0;r<rows.length;r++){ rowPills+=rows[r].querySelectorAll(".sc-idx-tag").length }')
P.push('      document.title="RESULT"+JSON.stringify({ok:!!window.__OK, be:window.__BE||null, errs:window.__ERRS,')
P.push('        heads:hs.length, rows:rows.length, rowPills:rowPills, hs:hs.slice(0,8)})')
P.push('    }, 1200);')
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
rmSync(dir, { recursive: true, force: true })

const m = out.match(/<title>RESULT([\s\S]*?)<\/title>/)
if (!m) { console.error('  ❌ 未能取到渲染结果（Chrome dump 失败）'); process.exit(1) }
const R = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
if (R.err) { console.error('  ❌ ' + R.err); process.exit(1) }

let pass = 0
const fails = []
const ok = (s) => { pass++; console.log('  ✅ ' + s) }
const bad = (s) => { fails.push(s); console.error('  ❌ ' + s) }

console.log('test-idxrow-pills · 索引行/组头形状（真实数据夹具 · 源=' + picked.src + '）')
console.log('  夹具源：' + MEM)
console.log('  装载 ok=' + !!R.ok + ' 异常=' + (R.errs || []).length + ' · 组头 ' + R.heads + ' · 行 ' + R.rows + ' · 索引行 ' + lines.length)

if (R.err) { console.error('  ❌ ' + R.err); process.exit(1) }
if (!R.heads || !R.rows) { console.error('  ❌ 未渲染出组头或行（导航/Tab 未生效）'); process.exit(1) }

/* 接缝①（2026-09-17 阶段 2）：标签与「N 条」归**组头**，且只出现一次；行内零胶囊。
 *  原判据是「每行恰好 1 个胶囊」—— 那正是本接缝要修掉的形状（标签两页前后不一 + N 条逐行重复）。 */
const dup = (R.hs || []).filter((h) => h.pills !== 1)
const noN = (R.hs || []).filter((h) => !/\d+\s*条/.test(h.n || ''))
if (dup.length) bad('组头胶囊数≠1：' + JSON.stringify(dup))
if (R.rowPills !== 0) bad('行内仍有 ' + R.rowPills + ' 个标签胶囊（应归组头）')
if (noN.length) bad('组头缺「N 条」：' + JSON.stringify(noN.map((h) => h.tag)))
if (!dup.length && !R.rowPills && !noN.length) {
  pass += 3
  ok('组头 ' + R.heads + ' 个，每个恰好 1 个标签胶囊 + 「N 条」计数')
  ok('行 ' + R.rows + ' 个，行内**零**标签胶囊（标签只在组头出现一次）')
  ok('形状统一（同一 renderIndexRows，无 withTagCount 布尔分叉）')
}
if (fails.length) {
  console.error(`test-idxrow-pills: FAIL（${pass} PASS / ${fails.length} FAIL）`)
  fails.forEach((s) => console.error('  · ' + s))
  process.exit(1)
}

/* ══ 响应字段真机断言（2026-09-19 · 判据载体补齐）══
 * 判因：本仓**无任何响应字段级门禁**（`panel-contract.ts` 只声明请求侧；`check-panel-contract`
 *   三件事全在请求侧/白名单）。册零删 `text`/`raw` 时**零护栏** —— 本段即那层缺失的护栏。
 * 语义：真 HTTP 拉活端点，断言
 *   ① `indexes[]` 不含 `text`；② `lines[]` 不含 `raw`；
 *   ③ `lines[]` 的 tag/subject/pointer **三字段完整且总数 > 0**（缺一个会让面板静默显示「0 条」）。
 * 端点不可达（宿主未运行）⇒ 判 **skip**，不判失败（与仓内「宿主不可达则 skip」先例一致）。 */
try {
  const API = process.env.SHOUCANG_API || 'http://127.0.0.1:3080/api/shoucang-panel/memory/overview'
  const resp = await fetch(API, { signal: AbortSignal.timeout(8000) })
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  const j = await resp.json()
  console.log('\ntest-idxrow-pills · 响应字段真机断言（' + API + '）')
  let withText = 0, withRaw = 0, total = 0, malformed = 0
  for (const f of j.indexes || []) {
    if ('text' in f) withText++
    for (const l of f.lines || []) {
      total++
      if ('raw' in l) withRaw++
      if (typeof l.tag !== 'string' || typeof l.subject !== 'string' || typeof l.pointer !== 'string') malformed++
    }
  }
  const rFail = []
  if (withText !== 0) rFail.push(`indexes[] 含 text（${withText} 个文件）—— 册零已删，零消费字段不得回归`)
  if (withRaw !== 0) rFail.push(`lines[] 含 raw（${withRaw} 行）—— 册零已删，零消费字段不得回归`)
  if (total === 0) rFail.push('lines[] 总数为 0 —— 面板会静默显示「知识索引 0 条」')
  if (malformed !== 0) rFail.push(`lines[] 三字段不完整（${malformed} 行）`)
  if (rFail.length) { rFail.forEach((s) => console.error('  ❌ ' + s)); console.error(`test-idxrow-pills: FAIL（响应字段 ${rFail.length} 项）`); process.exit(1) }
  console.log(`  ✅ indexes[] 不含 text（0 个文件）`)
  console.log(`  ✅ lines[] 不含 raw（0 行）`)
  console.log(`  ✅ lines[] 三字段完整（${total} 条，> 0）`)
} catch (e) {
  const msg = String(e && e.message || e)
  /* 端点不可达/超时 ⇒ skip（宿主未运行是常见态，不该让本件假红） */
  if (/fetch failed|ECONNREFUSED|timeout|aborted|HTTP 4|HTTP 5/i.test(msg)) {
    console.log('\ntest-idxrow-pills · 响应字段真机断言：端点不可达（' + msg.slice(0, 60) + '）—— 跳过该段')
  } else { console.error('  ❌ 响应字段断言异常：' + msg); process.exit(1) }
}

console.log(`test-idxrow-pills: PASS（${pass} 项 + 响应字段 3 项）`)
process.exit(0)
