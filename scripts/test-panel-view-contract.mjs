#!/usr/bin/env node
/**
 * 面板视图契约（P1-1 / P1-2 前置安全网 · 2026-09-13）
 *
 * 背景：`src-client/body.js` 里两个渲染函数是前端仅有的百行级巨石——
 *   `renderViewToggles`（原 615 行，P1-1 已拆）与 `renderMemoryExpanded`（321 行，P1-2 待拆）。
 *   **两个页面都零单测**，拆完无法证明「渲染出的东西完全等价」。
 *   方案档 `deliverables/ui-impl-architecture-details-2026-09-13.md` 把本件列为**不可跳过的前置**。
 *
 * 本件做法：把**真机渲染**出的结构清单按视图固化成基线，拆分前后逐项比对——
 *   **清单不变 = 行为等价**（顺序无关，按 (Tab, 名称, 类型) 排序后比对）。
 *
 * 为什么必须真机渲染、不能静态扫源码：
 *   ① `SWITCH_KEYS.forEach` 里有 `if (typeof cur !== 'boolean') return` —— 数据驱动的整体跳过；
 *   ② `UI.item(name, desc, control, { children })` 的**控件形态由 children 决定**；
 *   ③ 部分项在异步回调里追加（`/vector/status2`、`/distill/config`、`/inject/preview`）。
 *   与 ui-geo-regress 同一判据：**渲出来的才算数**。
 *
 * ── 两个受测视图 ──
 *   参数页（`renderViewToggles`）：每个 `.setting-item` 的「Tab + 名称 + **控件类型**」。
 *   记忆库页（`renderMemoryExpanded`）：每个 Tab 内的小节锚点「Tab + 标题 + **元素类**」
 *     （`.sc-mem-group-title` 小节标题 / `.sc-cap-top` 容量列 / `.sc-mem-stat-label` 统计卡）
 *     —— 该页的契约对象是**结构骨架**而非表单控件（它本来就没有表单）。
 *
 * 用法：
 *   node scripts/test-panel-view-contract.mjs            # 与基线比对（门禁）
 *   node scripts/test-panel-view-contract.mjs --update   # 重新固化基线（**仅在已确认改动等价时**）
 *   node scripts/test-panel-view-contract.mjs --view 参数 # 只比对单个视图
 *
 * 退出码：0 一致 · 1 漂移（真问题）· 4 Chrome 不可用（环境缺件 ⇒ 由 CHECKS 的 xfail 声明承接）
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = join(ROOT, 'client.js');
const BASELINE = join(ROOT, 'scripts', 'fixtures', 'panel-view-baseline.json');
const UPDATE = process.argv.includes('--update');
const ONLY = process.argv.includes('--view') ? process.argv[process.argv.indexOf('--view') + 1] : null;

/* ── Chrome 探测（缺失 ⇒ exit 4，由 CHECKS 的 xfail 声明承接） ──
 * 仓规红线：**不写死本机路径** —— 候选一律由环境变量派生，找不到再退回 PATH 探测。 */
const PF = process.env.PROGRAMFILES || '';
const PF86 = process.env['PROGRAMFILES(X86)'] || '';
const LOCAL = process.env.LOCALAPPDATA || '';
const j = (base, rest) => (base ? base.replace(/\\/g, '/') + '/' + rest : '');
const CANDIDATES = [
  process.env.CHROME_PATH,
  j(PF, 'Google/Chrome/Application/chrome.exe'),
  j(PF86, 'Google/Chrome/Application/chrome.exe'),
  j(PF86, 'Microsoft/Edge/Application/msedge.exe'),
  j(PF, 'Microsoft/Edge/Application/msedge.exe'),
  j(LOCAL, 'Google/Chrome/Application/chrome.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
let CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  for (const name of ['chrome', 'google-chrome', 'chromium', 'msedge']) {
    try {
      const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim();
      if (out && existsSync(out)) { CHROME = out; break; }
    } catch (e) { /* 未安装 */ }
  }
}
if (!CHROME) {
  console.log('面板视图契约：未找到 Chrome/Edge —— 环境缺件，跳过（exit 4）');
  process.exit(4);
}

/* ── 受测视图定义 ──
 *   sel  收集哪些元素；by 'item' = 名称取自后代 .setting-item-name、类型按控件判定；
 *        by 'self' = 名称与类型都取自元素自身。 */
const VIEWS = [
  { view: '参数', key: 'toggles', by: 'item', sel: '.setting-item' },
  { view: '记忆库', key: 'memory', by: 'self', sel: '.sc-mem-group-title, .sc-cap-top, .sc-mem-stat-label' }
];

/* ── 夹具：参数页 / 记忆库页依赖的全部端点。**给全**（给不全则数据驱动的项不渲染 ⇒ 基线漏项 ⇒ 安全网有洞）。
 *    缺省值刻意取「非空且非默认」，使 `gVal(key, fallback)` 走真实分支而非回落，清单更接近真机。 ── */
const FIX = `var FIX = {
  '/config': { global: {
      hot_memory: true, level: 'smart', persona: 'both',
      cap_agent: 3000, cap_user: 3000, cap_memory: 5000,
      activityWarmDays: 14, activityColdDays: 44, activityArchiveDays: 90, activityHotHits: 5,
      recallColdFactorPercent: 35, injectRelevance: true, injectFreshSlots: 2,
      enableDeepSleep: true, recallFusion: true, bankGit: true,
      mclEnabled: true, mclFamiliarThreshold: 0.5, mclMaxNudges: 3, mclBudgetChars: 800, mclTopK: 5, mclAudit: true,
      actual: { agent: 1440, user: 2340, memory: 3100 }
    }, parsed: { flags: { 'injection.hot_memory': true } }, text: 'roots: []', file: 'shoucang.config.yaml' },
  '/inject/preview': { text: '- [x] a\\n- [x] b\\n- [x] c' },
  '/inject/stats': { calls: 14, lastAt: 1757000000000 },
  '/vector/status2': { present: true, rows: 3204, provider: 'fusion',
    running: { enabled: true, baseUrl: 'http://127.0.0.1:11434/v1', model: 'bge-m3', apiKeyEnv: 'EMBED_API_KEY' },
    cache: { lines: 3204 }, stats: { queries: 12, lastMode: 'fast', lastMs: 31, lastQuery: 'x' } },
  '/embed/config': { embedEnabled: true, model: 'bge-m3' },
  '/distill/config': { active: true,
    running: { enableDistill: true, distillPrescan: true, idleWakeMs: 600000, minTurnChars: 200, distillProvider: '', distillModel: '' },
    persisted: { enableDistill: true, distillPrescan: true, idleWakeMs: 600000, minTurnChars: 200 } },
  '/llm/config': { provider: 'opencode-go', model: 'deepseek-v4-flash', presets: [] },
  '/llm/models': { models: [ { provider: 'opencode-go', id: 'deepseek-v4-flash', name: 'Flash' } ] },
  '/mcl/status': { active: true, fast: 23, slow: 7, mode: 'slow', familiarity: 0.52 },
  '/criteria': { active: true, version: 'v2.2.0', ledger: { rows: 1284 }, bankGit: { commits: 417 }, rerankGate: { ready: true, indexRows: 1204, threshold: 200 } },
  '/deepsleep': { enabled: true, running: 0, ended: 14, probing: 7, suspect: 6, stalled: 5, idleMs: 2700000 },
  '/deepsleep/config': { failPolicy: 'graded', attempted: 0 },
  '/memory/overview': { present: true,
    indexes: [ { name: 'MEMORY.md', chars: 3100, cap: 5000, lines: new Array(86).fill('[x]') }, { name: 'USER.md', chars: 2340, cap: 3000, lines: new Array(24).fill('[x]') }, { name: 'AGENT.md', chars: 1440, cap: 3000, lines: new Array(19).fill('[x]') } ],
    pending: { count: 9, last24h: 3, recent: [ { name: 'a.md', mtime: '2026-09-12 14:02' } ] },
    /* 册一（2026-09-19）新增：候选区改「双根合并」后，本夹具**必须**给 suite 根，
     * 否则 suite 组为空、组标题不渲染 ⇒ 基线漏项（实测：正是本次 1 项漂移的根因）。
     * 字段名与真实契约一致（name，非 file）——旧夹具写 file 是**与真机不符的口径**，
     *   会造出「夹具绿而真机不渲染」的假绿（本仓既有教训：夹具绿非真数据绿）。 */
    suite: { present: true, pending: { count: 9, last24h: 3, recent: [ { name: 'a.md', mtime: '2026-09-12 14:02' } ] },
      flowCandidates: { count: 14, recent: [ { name: 'b.md', mtime: '2026-09-13 09:00' } ] } },
    structure: { summary: { content: 2, tooling: 1, artifact: 1 }, entries: [
      { name: 'notes', kind: 'content', files: 12, bytes: 460000 },
      { name: 'MEMORY.md', kind: 'content', files: 1, bytes: 67000, doc: true },
      { name: '.git', kind: 'tooling', files: 432, bytes: 0 },
      { name: 'pending', kind: 'artifact', files: 70, bytes: 88000 } ] },
    distillStats: { runs: 128, last: { at: 1757000000000 }, added: 342, failed: 4, byRoute: { memory: 120 }, byDay: [ { added: 2 }, { added: 5 } ] },
    distill: { last: { at: '2026-09-13T06:00:00.000Z', lastSeq: 36, sessionId: 'session-abcdef12' } },
    growth: { month: '2026-09', sleep: { passes: 18, principleAdded: 42, replaced: 7, profilesAdded: 11 }, distill: { runs: 128, ok: 121, bad: 4, skips: 31 }, now: { tagRows: 63, principleRows: 41, pathRows: 22, agentChars: 2880 } },
    vector: { enabled: true, provider: 'fusion', cacheLines: 3204 }, queue: { undone: 2 } },
  '/memory/sections': { sections: [] }, '/get_root': { root: './shoucang', active: true },
  '/suite': { members: [] }, '/roots': { roots: [] }
};`;

/* ── 探针：切到指定视图后，按 wa-tab-panel 分组采集结构清单 ── */
function probe (view, by, sel) {
  return `<script>
setTimeout(function () {
  var b = document.getElementById('scpanl-btn'); if (b) b.click();
  setTimeout(function () {
    var items = document.querySelectorAll('#scpanl-root .sc-nav-item');
    for (var i = 0; i < items.length; i++) { if ((items[i].textContent || '').trim() === '${view}') { items[i].click(); break; } }
    setTimeout(function () {
      var root = document.getElementById('scpanl-root');
      var out = { items: [], err: window.__AE || window.__LE || null, errs: window.__ERRS || [] };
      function ctlOf(it) {
        if (it.querySelector('wa-switch')) return 'wa-switch';
        if (it.querySelector('input.checkbox-container')) return 'checkbox';
        if (it.querySelector('.sc-persona-slider')) return 'slider';
        if (it.querySelector('select')) return 'select';
        if (it.querySelector('.sc-num-wrap')) return 'number';
        if (it.querySelector('input.sc-input')) return 'text';
        if (it.querySelector('textarea')) return 'textarea';
        if (it.querySelector('button')) return 'button';
        return 'none';
      }
      var panels = root ? root.querySelectorAll('wa-tab-panel') : [];
      for (var p = 0; p < panels.length; p++) {
        var pid = panels[p].getAttribute('name') || ('pane' + p);
        var rows = panels[p].querySelectorAll('${sel}');
        for (var k = 0; k < rows.length; k++) {
          if ('${by}' === 'item') {
            var ne = rows[k].querySelector('.setting-item-name');
            out.items.push({ pane: pid, name: ne ? (ne.textContent || '').trim() : '(无名)', kind: ctlOf(rows[k]) });
          } else {
            var cls = (rows[k].className || '');
            out.items.push({ pane: pid, name: (rows[k].textContent || '').trim(), kind: cls.replace(/^sc-/, '') });
          }
        }
      }
      var d = document.createElement('div'); d.id = 'vie-out'; d.textContent = JSON.stringify(out);
      document.body.appendChild(d);
    }, 1700);
  }, 620);
}, 520);
</script>`;
}

function collect (view, by, sel) {
  const tmp = mkdtempSync(join(tmpdir(), 'sc-vie-'));
  const f = join(tmp, 'vie.html');
  const client = readFileSync(CLIENT, 'utf8');
  const html = `<!DOCTYPE html><html class="dark" data-theme="dark"><head><meta charset="utf-8"></head>
<body><div class="hHd-Xa_footArea"></div><div class="mneme-trigger"></div>
<script>window.__ERRS=[];window.addEventListener('error',function(e){window.__ERRS.push(String((e&&e.message)||e))});window.addEventListener('unhandledrejection',function(e){window.__ERRS.push('(promise) '+String((e&&e.reason&&e.reason.message)||(e&&e.reason)||e))});</script>
<script>window.__ModuleLoader__={load:function(cfg){try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>
<script>${FIX}</script>
<script>window.fetch=function(url){var p=String(url).replace(/^.*?\\/api\\/shoucang-panel/,'').split('?')[0];return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve(Object.prototype.hasOwnProperty.call(FIX,p)?FIX[p]:{})},text:function(){return Promise.resolve('{}')}})};</script>
<script>${client}</script>
<script>try{window.__scMod.apply({logger:{info:function(){},warn:function(){}},effect:function(){},on:function(){},get:function(){return undefined}})}catch(e){window.BE=String(e)}</script>
${probe(view, by, sel)}
</body></html>`;
  writeFileSync(f, html, 'utf8');
  let dom = '';
  try {
    dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--user-data-dir=' + join(tmp, 'cp'),
      '--virtual-time-budget=6000', '--window-size=1280,860', '--dump-dom', 'file:///' + f],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { dom = e.stdout || ''; }
  rmSync(tmp, { recursive: true, force: true });
  const m = /<div id="vie-out">([\s\S]*?)<\/div>/.exec(dom);
  if (!m) return null;
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

const keyOf = (it) => it.pane + '\u0000' + it.name + '\u0000' + it.kind;

/** 去重 + 排序：同一 (pane,name,kind) 出现两次视为一条。**入参与出参都是对象数组**
 *  —— 基线文件与实测结果同构，两边都过这一个函数。
 *  （教训：首版让本函数吐字符串、又对基线文件再跑一次 ⇒ 字符串被当对象取出 undefined，
 *    整个基线塌成 1 项，比对恒判漂移。**结构不对称 = 静默失效**。） */
function dedupe (items) {
  const seen = new Set();
  const out = [];
  for (const it of (items || [])) {
    if (!it || typeof it !== 'object') continue;
    const o = { pane: String(it.pane), name: String(it.name), kind: String(it.kind) };
    const k = keyOf(o);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };
console.log('面板视图契约（真机渲染 × 基线比对）');

const store = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
if (!UPDATE && !existsSync(BASELINE)) {
  console.log('基线缺失（' + BASELINE + '）—— 先跑 --update 固化');
  process.exit(1);
}

for (const V of VIEWS) {
  if (ONLY && V.view !== ONLY) continue;
  console.log('\n── 视图「' + V.view + '」(' + V.key + ') ──');
  const got = collect(V.view, V.by, V.sel);
  if (!got) { bad('取不到渲染结果（页面渲染失败）'); continue; }
  if (got.err) { bad('装配期抛异常：' + got.err); continue; }
  /* 渲染期异常必须**先于**「缺失 N 项」报出——它是项数不对的**根因**。
   *   实测教训：拆 renderViewToggles 时子函数引用了父函数局部变量 `g` ⇒ ReferenceError ⇒
   *   父函数中断 ⇒ 之后所有 pane 一个都不渲染（34 项只剩 5 项）。当时只报「缺失 29 项」看不出根因。 */
  if (Array.isArray(got.errs) && got.errs.length) {
    bad('渲染期捕获到 ' + got.errs.length + ' 个异常 —— 这是项数不对的根因，先修它：');
    got.errs.slice(0, 5).forEach((e) => console.log('     ! ' + e));
    continue;
  }
  const now = dedupe(got.items);
  if (UPDATE) {
    store[V.key] = now;
    console.log('  基线已更新：' + now.length + ' 项');
    const byPane = {};
    for (const it of now) { byPane[it.pane] = (byPane[it.pane] || 0) + 1; }
    console.log('  分布：' + Object.keys(byPane).sort().map((p) => p + '=' + byPane[p]).join(' · '));
    continue;
  }
  const base = dedupe(store[V.key]);
  const baseSet = new Set(base.map(keyOf)), nowSet = new Set(now.map(keyOf));
  const missing = base.filter((it) => !nowSet.has(keyOf(it)));
  const added = now.filter((it) => !baseSet.has(keyOf(it)));
  const human = (it) => '[' + it.pane + '] ' + it.name + '  → ' + it.kind;
  console.log('  基线 ' + base.length + ' 项 · 实测 ' + now.length + ' 项');
  if (!missing.length && !added.length) { ok('清单一致：' + now.length + ' 项逐项相同'); continue; }
  if (missing.length) {
    bad('缺失 ' + missing.length + ' 项（基线有、实测无 —— 拆分可能丢了内容或改了渲染条件）：');
    missing.forEach((it) => console.log('     - ' + human(it)));
  }
  if (added.length) {
    bad('新增 ' + added.length + ' 项（基线无、实测有）：');
    added.forEach((it) => console.log('     + ' + human(it)));
  }
}

if (UPDATE) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  store.note = '面板视图契约基线（真机渲染快照）';
  store.at = new Date().toISOString();
  writeFileSync(BASELINE, JSON.stringify(store, null, 2) + '\n', 'utf8');
  console.log('\n基线已写 → ' + BASELINE);
  process.exit(0);
}

console.log('\n结果: ' + (fail ? 'FAIL（' + fail + ' 视图漂移）' : 'PASS（' + pass + ' 视图一致）'));
if (fail) console.log('若已确认改动确实等价（例如刻意新增了内容），跑 --update 重新固化基线。');
process.exit(fail ? 1 : 0);
