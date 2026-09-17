/**
 * UI 几何回归（S1 验收门禁 · 2026-09-13）
 *
 * 背景：UI 走样/「内容被挤出首屏」这类问题，**结构性断言与 CSS 门禁都抓不到**——
 *   本轮实测：`check-ui-contract` 8/8 绿、`audit-css-usage` 绿，但真机首屏 4 张 KPI 在 1024 宽直接归零。
 *   根因是「写死尺寸」而非逻辑错误，只有**在真实渲染里量几何**才看得见。
 *
 * 本件做法：把真实 `client.js` 装进无头浏览器（mock API 顶掉 RPC），在 3 档视口下量：
 *   弹窗是否随视口自适应（不溢出、不过窄）/ 内容区是否唯一滚动容器 / 卡片是否换行 /
 *   同网格行的进度条是否共线 / 首屏是否容纳 KPI 行 / 底部状态栏是否可见。
 *
 * 退出码：0 全过 · 1 断言失败（真问题）· 4 Chrome 不可用（环境缺件，登记为 xfail）
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')

/* ── Chrome 探测（缺失 ⇒ exit 4 xfail，不判失败） ── */
/* 仓规红线：**不写死本机路径** —— 候选一律由环境变量派生，找不到再退回 PATH 探测（where/which）。 */
const PF = process.env.PROGRAMFILES || ''
const PF86 = process.env['PROGRAMFILES(X86)'] || ''
const LOCAL = process.env.LOCALAPPDATA || ''
const j = (base, rest) => (base ? base.replace(/\\/g, '/') + '/' + rest : '')
const CANDIDATES = [
  process.env.CHROME_PATH,
  j(PF, 'Google/Chrome/Application/chrome.exe'),
  j(PF86, 'Google/Chrome/Application/chrome.exe'),
  j(PF86, 'Microsoft/Edge/Application/msedge.exe'),
  j(PF, 'Microsoft/Edge/Application/msedge.exe'),
  j(LOCAL, 'Google/Chrome/Application/chrome.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean)
let CHROME = CANDIDATES.find((p) => existsSync(p))
if (!CHROME) {
  for (const name of ['chrome', 'google-chrome', 'chromium', 'msedge']) {
    try {
      const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim()
      if (out && existsSync(out)) { CHROME = out; break }
    } catch (e) { /* 未安装 */ }
  }
}
if (!CHROME) {
  console.log('UI 几何回归：未找到 Chrome/Edge —— 环境缺件，跳过（exit 4）')
  process.exit(4)
}

const VIEWPORTS = [[1024, 760], [1280, 860], [1600, 1000]]
/* 逐视图**冒烟**集（各视图"渲染非空"）。⚠ 实测澄清（2026-09-14）：**严格**几何断言
 *   （4 KPI 共线 / 3 操作卡 / 组件按钮 / shadowRoot）目前**只覆盖「运行总览」**（`run(w,h,'运行总览')`），
 *   其余视图走本冒烟集。『架构』纳入本集；其版式对齐同族标准，逐页签内容由探针上报 + 出图集取证。 */
const VIEWS = ['运行总览', '记忆库', '画像', '参数', '设置', '架构']

/* ⚠⚠ **本模板字符串内禁止出现反引号** —— 一个反引号就会**提前终止模板串** ⇒
   SyntaxError: Unexpected identifier（已踩两次：2026-09-13 成熟度注释、归档区注释）。
   注释里引用字段名/类名**一律不加反引号**（下面模板串内的注释同样受此约束）。 */
const FIX = `var FIX = {
  /* ⚠ 索引行必须是**对象数组** {tag,subject,pointer} —— 端点返回的就是这个形状；
     此前用 new Array(N).fill('[x]')（字符串）⇒ renderIndexRows 判为退化元素**整块跳过**，
     页面只剩一句「N 条索引行格式异常已跳过」⇒ 记忆库/画像两页的"列表全空"是假象（实测踩到）。 */
  '/memory/overview': { present:true, indexes:[
      {name:'MEMORY.md',chars:3100,cap:5000,lines:Array.from({length:86},function(_,i){var t=['env','tool','flow','lesson','release','user','agent'];var f=['env','tools','flows','lessons','release','user','agent'];return {tag:t[i%7],subject:'索引样例 '+(i+1)+'：'+(i%7===1?'门禁与脚本链':i%7===3?'踩坑与教训':'运行约定'),pointer:'notes/'+f[i%7]+'.md §小节'+(i+1)}})},
      {name:'USER.md',chars:2340,cap:3000,lines:Array.from({length:24},function(_,i){var t=['偏好','环境','纪律'];return {tag:t[i%3],subject:'用户画像样例 '+(i+1),pointer:'notes/user.md §'+(i%3===0?'偏好':i%3===1?'本机':'纪律')}})},
      {name:'AGENT.md',chars:1440,cap:3000,lines:Array.from({length:19},function(_,i){var t=['原则','路径'];return {tag:t[i%2],subject:'Agent 画像样例 '+(i+1),pointer:'notes/agent.md §'+(i%2===0?'原则':'路径')}})}],
    pending:{count:9,last24h:3,recent:[{file:'2026-09-12-部署最后一跳.md',mtime:'2026-09-12 14:02'},{file:'2026-09-11-零硬编码红线.md',mtime:'2026-09-11 09:12'}]}, distillStats:{runs:128,last:{at:Date.now()-120000},added:342,failed:4,byRoute:{memory:120},byDay:[{added:2},{added:5}]},
    distill:{last:{at:new Date().toISOString(),lastSeq:36,sessionId:'session-abcdef12'}},
    growth:{month:'2026-09',sleep:{passes:18,principleAdded:42,replaced:7,profilesAdded:11},distill:{runs:128,ok:121,bad:4,skips:31},now:{tagRows:63,principleRows:41,pathRows:22,agentChars:2880}},
    vector:{enabled:true,provider:'fusion',cacheLines:3204}, queue:{undone:2},
    /* 成熟度分布（第五轮接通）：库内 audit/maturation.jsonl 按 A 值 0.2 分档的小节数——
     * 夹具用真机实测分布（0/35/8/4/14，共 61 节），出图才反映真实柱形而不是全 0 占位。 */
    maturity:{bins:[0,35,8,4,14],total:61,gate:0.5},
    /* notes 七类（记忆库页「笔记 N 类」Tab 与 notes 详情小节都读它）——缺字段会让该类计数恒 0。 */
    notes:['env','tools','flows','lessons','release','user','agent'].map(function(w,i){
      return { rel:'notes/'+w+'.md', name:w+'.md',
        sections:Array.from({length:[6,4,9,18,3,5,7][i]}, function(_,k){ return { title:'小节 '+(k+1), line:k*10+1 } }) };
    }),
    /* 晨起摘要（总览页第 2 张卡）：{present, staleAt, rows[], injections} —— 缺字段会让卡片落到空态。 */
    delta:{ present:true, staleAt:new Date(Date.now()+6*3600000).toISOString(),
      rows:['部署链路最后一跳是用户热重载','G-20 读方根因 = resolveWatermark 返回 null'], injections:14 } },
  /* 记忆库「归档区」Tab 与观测页归档区都读 archive 字段；缺该端点 ⇒ 归档区落到"读取失败"。
     ok 必须给：renderCognitionReport 首行是 if(!r||!r.ok)return —— 缺 ok 时深睡页的
     「本轮产出回执 / 下轮材料预估」两块**整块不渲染**，出图会得到一张缺块的假页（实测踩到）。
     ⚠ 本行注释里**不得写反引号** —— 模板串会提前终止（本次已踩：SyntaxError Unexpected token 'if'）。 */
  '/cognition/report': { ok:true, active:true, day:'2026-09-13',
    archive:[{ file:'2026-08-14-旧部署流程.md', chars:1204 },{ file:'2026-08-02-早期判据草稿.md', chars:892 }],
    materials:{ forget:7, hot:12, interference:3, deepen:12, suppress:3 },
    sleeps:[{ at:Date.now()-7200000, stop:'completed', added:3, replaced:1, profiles:2, pointers:5, tree:2, forgetArchived:4, forgetKept:12 }] },
  '/mcl/status': { active:true, fast:23, slow:7, mode:'slow', familiarity:0.52 },
  /* ── 架构视图（2026-09-14 新增）：**加视图必须同时补夹具**——否则新页只有空态，
   *    图里看不出"数据形态对不对"（本页 4 KPI + 5 页签全靠下面这些端点）。
   *    ⚠ 数值取**真机实测**并**脱敏**（库路径一律换成 <bank>/<audit>/<lib>）——仓内零硬编码红线。 ── */
  '/arch/records': { root:'<bank>',
    store:{ dir:'.records', records:967, byKind:{ fact:240, prose:420, persona:25, blank:134, structure:134, decision:1, outcome:1, valence:1, relation:1, commitment:3, association:2, procedure:5 }, byLifecycle:{active:967}, untagged:864, inventory:{ records:967, untagged:864 } },
    carriers:[{file:'MEMORY.md',mdBytes:3100,storeBytes:3100,ok:true,reason:''},{file:'USER.md',mdBytes:2340,storeBytes:2340,ok:true,reason:''},{file:'AGENT.md',mdBytes:1440,storeBytes:1440,ok:true,reason:''}],
    carriersOk:11, carriersTotal:11,
    shadow:{ writes:33, verified:33, diverged:0, lastAt:Date.now()-600000, lastFile:'notes/user.md' },
    dups:[{count:2,text:'## 偏好-开源免费',files:[{file:'USER.md',order:24},{file:'notes/user.md',order:25}]},{count:2,text:'## 身份',files:[{file:'notes/agent.md',order:17},{file:'notes/user.md',order:7}]}],
    address:{ key:'(file, order)', note:'id 是内容指纹、可能重复 ⇒ 行寻址必须用 (file,order)' } },
  '/arch/graph': { nodes:865, edges:139, recordNodes:831, anchors:34, live:865, expired:0, answers:1, collision:4, commitment:3, relation:1, pointsTo:91, provenance:39, supersede:0, danglingEvidence:0, records:967 },
  '/arch/observability': { ledger:{ path:'<audit>/ledger.jsonl', lines:494, missingAt:0, byType:[{type:'decision.ingest',count:145},{type:'write.ingest',count:106},{type:'check.sleep',count:102},{type:'mcl-step',count:55},{type:'score.shadow',count:42}] },
    auditDir:'<audit>', files:[{name:'ledger.jsonl',bytes:186000,mtime:Date.now()-120000},{name:'distill-audit.jsonl',bytes:92000,mtime:Date.now()-3600000}],
    legacy:[{name:'judgement-ledger.jsonl',present:true},{name:'distill-audit.jsonl',present:true},{name:'mcl-audit.jsonl',present:false}],
    envelope:{ missingAt:0, ok:true },
    registry:{ authority:'scripts/check-observability.mjs', families:['事件流（读侧逐条）','键控日志（按 key 取最后一条）','状态表/投影（整表重写）'], domains:['suite（可并）','bank（数据属库，跨域并入是语义错误）'], baseline:{ suiteEventStreams:1 } } },
  '/arch/assembly': { composition:{ bridges:0, handles:[{name:'mcl',ready:true},{name:'deepSleep',ready:true},{name:'scheduler',ready:true}] },
    routes:{ declared:41 },
    /* 存储模式（真机持久值 dual —— 夹具不给就会回落成 md，图里就与真值不符＝假证据） */
    store:{ mode:'dual', allowed:['md','dual'], note:'dual = md↔Record 双写（写时自证：可还原/分歧）；record 未实现，故不提供' },
    plugin:{ version:'0.3.1', libDir:'<lib>', libFiles:62, modules:[{name:'composition',present:true},{name:'event-envelope',present:true},{name:'assertion-graph',present:true},{name:'decision-ring',present:true},{name:'record-shadow',present:true}] } },
  /* 默认页签「内容环」的内容源（真机 801B 实测，root 脱敏）——
   * 夹具缺它 ⇒ 默认页签在图里是一张空白卡，等于该页签**没有视觉证据**。 */
  '/rings': { active:true, root:'<bank>', at:'2026-09-13T18:11:40.729Z',
    census:{ fact:245, decision:2, relation:4, association:2, value:26, none:688 },
    decision:{ opened:1, collected:1, hits:1, misses:0, pending:0, hitRate:1, valences:1, missSamples:[] },
    relation:{ relations:1, commitments:3, pending:2, kept:1, broken:0, entities:1, byWho:{'用户':4},
      trust:[{who:'用户',mineKept:1,mineBroken:0,theirsKept:0,theirsBroken:0,mineRate:1,theirsRate:0}] },
    association:{ collisions:2, accepted:2, denied:0, unstated:0, landed:1, landedRate:0.5, pending:1, reused:0 },
    fact:{ total:967, live:967, expired:0, withPremise:0, unparseable:0 },
    events:{ present:true, count:13, reconcile:{ ok:true, store:9, replay:9, missing:0, extra:0, differing:0, errors:0 } } },
  '/mcl/config': { active:true,
    running:{ steps:3, slow:2, injected:1, sysBlockNonEmpty:2, sysBlockLastChars:430, sysBlockCtxKeys:'agent,scope,signal', sysBlockLastSid:'session-697a44', trace:['43u1|pre|697a44d4|8','43xh|set|697a44d4|441','43xq|cap|697a44d4|8','as2c|renSame|697a44d4|430'] },
    persisted:{ mclEnabled:true, mclFamiliarThreshold:0.58, mclMaxNudges:1, mclBudgetChars:600, mclTopK:3, mclAudit:true, mclMaterialInSystem:true, enableRemPass:false },
    keys:['mclEnabled','mclFamiliarThreshold','mclMaxNudges','mclBudgetChars','mclTopK','mclAudit','mclMaterialInSystem','enableRemPass'],
    limits:{ mclFamiliarThreshold:[0,1], mclMaxNudges:[0,3], mclBudgetChars:[120,4000], mclTopK:[1,5], defaults:{ familiarThreshold:0.58, maxNudges:1, budgetChars:600, topK:3 } } },
  /* health.notesWarn 供总览「判据与重排门」卡；ledger.rows / rerankGate / bankGit 同下。 */
  '/criteria': { active:true, version:'v2.2.0', ledger:{rows:1284}, bankGit:{commits:417},
    health:{ R:0.82, K:0.64, notesWarn:8000 }, rerankGate:{ready:true,indexRows:1204,threshold:200} },
  /* 深睡：补 active / lastActivityAt / probeAfterMs —— 端点见 r.active 为假时整块跳过渲染，
   * 夹具缺 active ⇒ 状态机与分布卡全不出，出图会得到一张"未激活"的空页（实测踩到）。
   * 取值让"停滞 2h"落在判定线(1h)与阈值(3h)之间 ⇒ 三节点样式（done/当前/未达）一张图全可见。 */
  '/deepsleep': { active:true, enabled:true, running:0, ended:14, probing:7, suspect:6, stalled:5, idleMs:10800000,
    probeAfterMs:3600000, lastActivityAt:Date.now()-7200000, lastDeepSleepAt:Date.now()-86400000,
    // S-P1d（2026-09-15）夹具必须镜像真实契约：/deepsleep 现带 currentEpoch + epochSince（纪元起止）。
    // 本项是被【出图】抓出来的：先只改了客户端，重出图后那一行没出现 —— 根因就是夹具缺字段。
    // 教训：契约加字段时出图夹具必须同步，否则渲染级证据会对新面系统性失明。
    currentEpoch: 'epoch-1789504353992', epochSince: Date.now()-86400000,
    nextEligibleAt:Date.now()+3600000,
    /* 会话列表：缺它「最近会话」卡整块不出（原型有该卡，出图必须能核对形态） */
    /* 2026-09-14 会话行名改三块（工作区+会话栏标题+编码）：夹具须带 workspace/title，否则新路径零覆盖；
       第三行 title 为空专覆盖退化路径（取不到标题则只显示 工作区+编码）。 */
    sessions:[{ sid:'7f3a91c2', workspace:'shoucang', title:'修复深睡会话状态判定', state:'suspect', lastEventAt:Date.now()-7200000, probeResult:'stall' },
      { sid:'b41e08d5', workspace:'dsh-memory-archive', title:'整理历史归档与指针核对', state:'ended', lastEndAt:Date.now()-82800000, lastEventAt:Date.now()-82800000 },
      { sid:'c9d0e1f2', workspace:'prj-x', title:'', state:'ended', lastEndAt:Date.now()-93600000, lastEventAt:Date.now()-93600000 },
      /* 第四行 state:'stalled' —— **「停滞」标签的唯一视觉覆盖点**（前三行按映射都是「待蒸馏」，
       * 缺它则新标签的另一半在渲染回归里零覆盖）。 */
      { sid:'a0b1c2d3', workspace:'dsh-memory-archive', title:'核对归档指针与水位', state:'stalled', lastEndAt:Date.now()-172800000, lastEventAt:Date.now()-172800000 }] },
  '/inject/stats': { calls:14, lastAt:Date.now()-60000, root:'./shoucang' },
  '/get_root': { root:'./shoucang', active:true }, '/vector/status2': { present:true, rows:3204, provider:'fusion' },
  '/config': { global:{}, parsed:{flags:{}}, text:'roots: []', file:'x.yaml' },
  /* suite 成员：夹具给 3 条（原型同款形态），否则成员卡网格恒为「仅添加卡」——
   *   真机 members 缺省 = 自检本插件（SELF_MEMBER），单成员；夹具补多条是为了核对**卡片形态**而非数量。 */
  '/suite': { members: [
      { id:'managing-memory', package:'managing-memory', repo:'skill/ · notes/', role:'记忆技能本体 · 目标库', status:'both', detail:'注入器 + web profile' },
      { id:'shoucang-core', package:'shoucang-core', repo:'principle/ · path/', role:'守藏核心 · 蒸馏器', status:'both', detail:'注入器 + web profile' },
      { id:'scheduler', package:'scheduler', repo:'cron/', role:'调度 · 定时蒸馏', status:'profile', detail:'web profile 装配' }],
    summary:'共 3 成员（present 3 / missing 0）' },
  '/roots': { roots:[] }
};`

const PROBE = (view) => `<script>
setTimeout(function () {
  var b = document.getElementById('scpanl-btn'); if (b) b.click();
  setTimeout(function () {
    var items = document.querySelectorAll('#scpanl-root .sc-nav-item');
    for (var i = 0; i < items.length; i++) { if ((items[i].textContent || '').trim() === '${view}') { items[i].click(); break } }
    setTimeout(function () {
      function R(e) { var r = e.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) } }
      var out = { view: '${view}', vw: innerWidth, vh: innerHeight };
      var modal = document.getElementById('scpanl-modal'), mask = document.getElementById('scpanl-mask');
      out.modal = modal ? R(modal) : null; out.maskOpen = !!(mask && mask.classList.contains('open'));
      var view_ = document.querySelector('#scpanl-root .sc-view');
      out.viewEl = view_ ? R(view_) : null;
      out.scroll = view_ ? { sh: view_.scrollHeight, ch: view_.clientHeight } : null;
      out.opCards = [].slice.call(document.querySelectorAll('#scpanl-root .sc-opcard')).map(R);
      out.kpis = [].slice.call(document.querySelectorAll('#scpanl-root .sc-kpi')).map(function (c) {
        var bar = c.querySelector('.sc-kpi-bar'); var v = c.querySelector('.sc-kpi-val');
        return { h: R(c).h, val: v ? v.textContent : '', barY: bar ? R(bar).t : -1 };
      });
      out.badgeRows = (function () { var s = {}; [].slice.call(document.querySelectorAll('#scpanl-root .sc-ds-badge')).forEach(function (b) { s[R(b).t] = 1 }); return Object.keys(s).length })();
      var sb = document.getElementById('sc-statusbar'); out.statusbar = sb ? R(sb) : null;
      var lw = document.querySelector('#scpanl-root .sc-logwrap'); out.logwrap = lw ? { h: R(lw).h, hidden: lw.classList.contains('sc-hidden') || R(lw).h === 0 } : null;
      /* S3：组件库（web components）落地观测 —— 替换手写 DOM 后必须由渲染断言背书 */
      var qsa = function (s) { return [].slice.call(document.querySelectorAll('#scpanl-root ' + s)) };
      /* 手写按钮（回滚后的被测对象）：取首个可见 .sc-btn 的高度 */
      var hb = qsa('.sc-btn').filter(function (b) { return b.getBoundingClientRect().height > 0 })[0];
      out.handBtn = { count: qsa('.sc-btn').length, h: hb ? Math.round(hb.getBoundingClientRect().height) : -1 };
      /* S-P1d（2026-09-15）**纪元行的 DOM 几何** —— 用户指正后加的判据：
       *   面板内容区有**滑动导轨**（内部滚动容器）⇒ **纯像素截图对视口折叠线以下系统性失明**，
       *   「图里没有」≠「没渲染」。故必须用 **DOM 几何**独立判一次：元素在不在、rect 是否非零、
       *   它在**滚动容器内容区**的什么位置（相对 viewEl 的 top）。
       *   本探针不依赖看得见与否，因此对折叠免疫。 */
      out.epochRow = (function () {
        var hit = null;
        qsa('.sc-desc, .sc-card-sub, .sc-kpi-sub').forEach(function (e) {
          if (!hit && (e.textContent || '').indexOf('epoch-') >= 0) hit = e;
        });
        if (!hit) return { found: false };
        var rr = R(hit);
        var vt = out.viewEl ? out.viewEl.t : 0;
        return { found: true, text: (hit.textContent || '').slice(0, 90), rect: rr, relTop: rr.t - vt, visibleInViewport: rr.t >= 0 && rr.t < innerHeight };
      })();
      var wb = qsa('wa-button');
      /* 组件按钮的标签色必须可读（视觉复核抓到过"蓝字压紫底"）：取 shadow DOM 内标签的计算色，
       * 用"取数字"而非正则解析 —— 该探针整体是模板字符串，正则转义易踩坑；并整体 try/catch 防拖垮全件。 */
      var waLabel = { color: '', lum: -1 };
      try {
        var wb0v = wb.filter(function (b) { return b.getBoundingClientRect().height > 0 })[0];
        var lab = wb0v && wb0v.shadowRoot ? wb0v.shadowRoot.querySelector('button, [part]') : null;
        var labColor = lab ? getComputedStyle(lab).color : '';
        var nums = (String(labColor).match(/[0-9]+/g) || []).map(Number);
        waLabel = { color: labColor, lum: nums.length >= 3 ? (nums[0] * 299 + nums[1] * 587 + nums[2] * 114) / 1000 / 255 : -1 };
      } catch (e) { waLabel = { color: 'err', lum: -1 }; }
      out.waLabel = waLabel;
      /* 架构页**逐页签**内容探针（2026-09-14）：实测踩过"默认页签有内容、其余页签空白"这类静默空态——
       *   只截默认页签 / 只看整页都发现不了。此处量每个 wa-tab-panel 内 .sc-tabpane 的文字量。 */
      if ('${view}' === '架构') {
        var g2 = document.querySelector('#scpanl-root wa-tab-group');
        var tabs2 = g2 ? [].slice.call(g2.querySelectorAll('wa-tab')) : [];
        out.archTabContent = tabs2.map(function (t) {
          var id = t.getAttribute('panel');
          var p = g2.querySelector('wa-tab-panel[name="' + id + '"] .sc-tabpane');
          return { label: (t.textContent || '').trim(), chars: p ? (p.textContent || '').length : 0 };
        });
      }
      out.waBtn = {
        count: wb.length,
        shadow: wb.length ? !!wb[0].shadowRoot : false,
        h: wb.length ? Math.round(wb[0].getBoundingClientRect().height) : -1,
        label: wb.length ? (wb[0].textContent || '').trim().slice(0, 12) : ''
      };
      /* S3：表单组件（toggle→wa-switch / select→wa-select）——数量 + 值绑定 + 是否真渲染 */
      var sws = qsa('wa-switch'), sels = qsa('select');
      /* 「渲染」而非「存在」：本轮教训——我曾只验 shadow DOM 里有没有 <wa-icon> 元素，于是**假绿**；
       * 实际它渲染尺寸为 0、画面上没有箭头（视觉复核像素穷举证明）。此处保留一个**按渲染尺寸判定**的工具函数，
       * 供任何"组件是否真画出来"的断言复用。 */
      var rendered = function (el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 };
      out.forms = {
        switches: sws.length, selects: sels.length,
        firstChecked: sws.length ? !!sws[0].checked : null,
        firstSelectValue: sels.length ? String(sels[0].value) : null,
        selectArrow: false, /* 原生 select 无此概念；WA select 的箭头判据已升级为 rendered(icon) */
        waSelects: qsa('wa-select').length, /* 回滚彻底性：由探针回报，Node 侧不能调 qsa */
        selectShadow: sels.length ? !!sels[0].shadowRoot : false,
        /* shadow 只判开关：下拉已回滚原生 select（无 shadowRoot 属正常） */
        shadow: sws.length ? !!sws[0].shadowRoot : false
      };
      /* P2（2026-09-13）：<wa-icon> 可渲染性取证 —— vendor.js 注册了内联 SVG 图标库，但实测
       * 「注册了」≠「能渲染」（wa-select 因此回滚）。这里挂一个离屏探针到 body 量尺寸，
       * 输出真实宽高供 run() 报告。**前置门禁**：未通过前不得替换依赖图标的组件。 */
      var probeIcon = document.createElement('wa-icon');
      probeIcon.setAttribute('name', 'chevron-down');
      probeIcon.style.cssText = 'position:absolute;left:-9999px;top:0;display:inline-block;width:auto;height:auto';
      document.body.appendChild(probeIcon);
      var ir = probeIcon.getBoundingClientRect();
      out.waIcon = {
        defined: !!customElements.get('wa-icon'),
        rendered: ir.width > 0 && ir.height > 0,
        w: Math.round(ir.width), h: Math.round(ir.height)
      };
      document.body.removeChild(probeIcon);
      /* P0-1（2026-09-13）：进度条组件替换的**渲染级证据**。
       *   为什么不靠出图：进度条只在「运行观测」页出现，而它在静态渲染下处于 .sc-hidden（progress 状态
       *   由 apiCtx 上报驱动，mock 环境下为空）⇒ 出图根本看不见它。
       *   故直接挂一个与 UI.progress 同构的探针（同样的 sc-prog-bar 类）进 #scpanl-root（CSS 规则带该前缀，
       *   挂 body 上不生效），离屏量**实际渲染高度**：接管生效应为 6px（组件自带 --track-height 是 16px）。 */
      var prog = { h: -1, trackH: -1, def: false };
      try {
        var scRoot = document.getElementById('scpanl-root');
        var pb = document.createElement('wa-progress-bar');
        pb.className = 'sc-prog-bar';
        pb.setAttribute('max', '100');
        pb.setAttribute('value', '40');
        pb.style.cssText = 'position:absolute;left:-9999px;top:0;width:200px';
        scRoot.appendChild(pb);
        var inner = pb.shadowRoot ? pb.shadowRoot.querySelector('.progress-bar') : null;
        prog = {
          h: Math.round(pb.getBoundingClientRect().height),
          trackH: inner ? Math.round(inner.getBoundingClientRect().height * 10) / 10 : -1,
          def: !!customElements.get('wa-progress-bar'),
          hasShadow: !!pb.shadowRoot,
          /* 判据用**计算样式**而非几何：组件是 LitElement，插进 DOM 后要等一个 microtask 才渲染
           *   （同步读几何拿到 h=0、shadow 里只有注释 —— 实测踩到）。而 CSS 变量解析是同步的，
           *   且「--track-height 是否被接管」正是本项要守的靶点，所以它比高度更直接、也更稳。 */
          trackVar: getComputedStyle(pb).getPropertyValue('--track-height').trim(),
          html: pb.shadowRoot ? String(pb.shadowRoot.innerHTML).replace(/\s+/g, ' ').slice(0, 110) : '(无 shadowRoot)'
        };
        scRoot.removeChild(pb);
      } catch (e) { prog = { h: -1, trackH: -1, def: false, err: String(e) }; }
      out.prog = prog;
      /* S4：后端契约表生成的**共享产物**是否真到客户端（含真实字段，不是空壳） */
      var C = (typeof window !== 'undefined' && window.__SC_CONTRACT__) || null;
      var saveRoute = C ? (C.routes || []).filter(function (r) { return r.path === '/save' })[0] : null;
      out.contract = {
        present: !!C,
        count: C ? C.routeCount : -1,
        routes: C ? (C.routes || []).length : -1,
        saveRequired: saveRoute ? (saveRoute.required || []).join(',') : '',
        saveFields: saveRoute && saveRoute.fields ? saveRoute.fields.map(function (f) { return f.name + (f.optional ? '?' : '') + ':' + f.type }).join(',') : ''
      };
      out.wa = {
        defined: !!customElements.get('wa-tab-group'),
        group: qsa('wa-tab-group').length,
        tab: qsa('wa-tab').length,
        panel: qsa('wa-tab-panel').length,
        visiblePanels: qsa('wa-tab-panel').filter(function (p) { return p.offsetParent !== null || p.getClientRects().length > 0 }).length
      };
      var d = document.createElement('div'); d.id = 'geo-out'; d.textContent = JSON.stringify(out); document.body.appendChild(d);
    }, 900);
  }, 400);
}, 350);
</script>`

/** 截图模式（S3 起）：与断言用同一 harness 出图 —— UI 结论必须视觉实证，且不另起一套夹具 */
function shoot (w, h, view, out, tab) {
  /* ⚠⚠ 2026-09-16 **根因实修（本仓"渲染级证据"整环失效的真因）**：
   *   Chrome 的 `--screenshot=<相对路径>` **静默不写文件**（实测：相对 `deliverables\ui1-shots\rel.png`
   *   与正斜杠写法**都不生成**；改成绝对路径立刻写出 1116 B）。而本函数此前把 CLI 给的 `dir`
   *   （相对路径）直接交给 Chrome ⇒ **每一张图都从未被写出**；叠加"用 `existsSync` 判成功"，
   *   于是**永远显示旧图的 `(94 KB)`、汇总永远 `12/12 张有效`** ⇒ 门禁全绿而**出图通道全程失效**。
   *   ⇒ 唯一修法：**交给 Chrome 前一律 `resolve()` 成绝对路径**。
   *   教训（值得记入纪律）：**"文件存在"不能作为"本次动作成功"的判据** —— 二者在"有历史残留"时不可分。 */
  out = resolve(out)
  const tmp = mkdtempSync(join(tmpdir(), 'sc-shot-'))
  const f = join(tmp, 'shot.html')
  const client = readFileSync(CLIENT, 'utf8')
  const html = `<!DOCTYPE html><html class="dark" data-theme="dark"><head><meta charset="utf-8"></head>
<body><div class="hHd-Xa_footArea"></div>
<script>window.__ModuleLoader__={load:function(cfg){try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>
<script>${FIX}</script>
<script>window.fetch=function(url){var p=String(url).replace(/^.*?\\/api\\/shoucang-panel/,'').split('?')[0];return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve(Object.prototype.hasOwnProperty.call(FIX,p)?FIX[p]:{})},text:function(){return Promise.resolve('{}')}})};</script>
<script>${client}</script>
<script>try{window.__scMod.apply({logger:{info:function(){},warn:function(){}},effect:function(){},on:function(){},get:function(){return undefined}})}catch(e){window.BE=String(e)}</script>
<script>
setTimeout(function () {
  var b = document.getElementById('scpanl-btn'); if (b) b.click();
  setTimeout(function () {
    var items = document.querySelectorAll('#scpanl-root .sc-nav-item');
    for (var i = 0; i < items.length; i++) { if ((items[i].textContent || '').trim() === '${view}') { items[i].click(); break } }
    /* 页签（可选）：加视图后**必须能逐页签取证**——只截默认页签会漏掉"其余页签空白/控件缺失"。 */
    var tb = '${tab || ''}';
    if (tb) setTimeout(function () {
      var ts = document.querySelectorAll('#scpanl-root wa-tab');
      for (var k = 0; k < ts.length; k++) { if ((ts[k].textContent || '').trim() === tb) { ts[k].click(); break } }
    }, 400);
  }, 500);
}, 350);
</script></body></html>`
  writeFileSync(f, html, 'utf8')
  /* ⚠ 2026-09-16 实修（本轮踩到）：**先删目标文件**。
   *   原实现用 `existsSync(out)` 判"出图成功"，而 `catch` 又吞掉 Chrome 的非零退出 ⇒
   *   **一旦目标文件是上次残留，"本次失败"与"本次成功"完全不可区分** ——
   *   实测因此连看两轮旧图、据旧图误判"纪元行未渲染"（真相反：DOM 几何 h=19px 在视口内）。
   *   先删之后，`existsSync(out)` 才真正等价于"**本次写出**"。 */
  rmSync(out, { force: true })
  try {
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--user-data-dir=' + join(tmp, 'cp'), '--virtual-time-budget=6000', '--window-size=' + w + ',' + h,
      '--screenshot=' + out, 'file:///' + f], { stdio: 'ignore', timeout: 120000 })
  } catch (e) { /* Chrome 截图偶发非零退出，文件可能已生成（**故下面按文件实况判，不按退出码**） */ }
  rmSync(tmp, { recursive: true, force: true })
  const shotSize = existsSync(out) ? statSync(out).size : 0
  const shotOk = shotSize > 2048
  console.log('shot ' + view + ' → ' + out + (shotOk ? ' (' + Math.round(shotSize / 1024) + ' KB)' : ' ✗（**本次未写出**：Chrome 失败或产物过小 ' + shotSize + 'B）'))
  return shotOk
}

/* ── 整页长图（--full-shots <dir>）：逐页核对必须看整页，不是首屏 ──
 * 教训（第十一轮）：--shots 的 860px 首屏对每页 **4800–6000px** 的真实高度只覆盖约 15%，
 *   滚动区下方的卡片从未进过图 ⇒ 曾据此误判「总览页只有 2 张卡」。
 * 两侧同一放开规则：面板放掉模态高度上限、原型放掉 .frame 的 720px 上限，并各自解除 .view 滚动。
 * 高度**实测两趟**：先 dump-dom 量高，再按该高度截图（不猜、不留大片空白）。 */
const PROTO = join(ROOT, 'deliverables', 'ui-redesign-v9-2026-09-13.html')
const VIEW_PAGE = {
  运行总览: 'overview', 记忆库: 'memory', 画像: 'persona', 插件集合: 'suite',
  深度睡眠: 'sleep', 运行观测: 'observe', 参数: 'param', 设置: 'settings',
  /* 架构视图（2026-09-13 架构重构后新增）——**加视图必须同时纳入视觉验收**，
   *   否则它的样式/渲染没有任何真机证据（本轮教训：新视图曾因缺图标 key 让整页白屏，
   *   而当时的出图清单里根本没有它 ⇒ 差点漏掉）。 */
  架构: 'arch'
}
const FULL_FREE_CSS = [
  '#scpanl-mask{align-items:flex-start !important;overflow:visible !important;}',
  '#scpanl-modal{height:auto !important;max-height:none !important;overflow:visible !important;}',
  '#scpanl-root .sc-view,#scpanl-root .sc-logwrap,#scpanl-root .sc-card-body,#scpanl-root .sc-nav{overflow:visible !important;max-height:none !important;}'
].join('')
const PROTO_FREE_CSS = [
  'html,body{height:auto !important;overflow:visible !important;}',
  '.shell{height:auto !important;}',
  '.topbar,.wrap,.legend{display:none !important;}',
  '.stage{display:block !important;padding:0 !important;overflow:visible !important;}',
  '.frame{height:auto !important;max-height:none !important;width:1180px !important;box-shadow:none !important;}',
  '.frame .view{overflow:visible !important;}'
].join('')
const heightProbe = (sel) => '<script>setTimeout(function(){var e=document.querySelector(' + JSON.stringify(sel) +
  ');var d=document.createElement("div");d.id="sc-full-h";d.textContent=e?String(Math.ceil(e.getBoundingClientRect().height)):"0";document.body.appendChild(d)},1500)</script>'
/* 原型切页：直接置类，不派发 click（原型在 frame 上有 click 代理，派发会触发额外动作）。
 * ⚠ 不要动 .pane —— 原型各页 Tab 的默认 pane 已带 on；按 data-paneOf 自行匹配一旦命名不同，
 *   会把所有 pane 都置为隐藏，出图得到「Tab 有、内容空白」的假象（已踩，见 panel-memory 对照）。 */
const protoSwitch = (page) => '<script>setTimeout(function(){var f=document.getElementById("newFrame");' +
  'f.querySelectorAll(".nav-item").forEach(function(x){x.classList.toggle("on",x.dataset.page==="' + page + '")});' +
  'f.querySelectorAll(".page").forEach(function(s){s.classList.toggle("on",s.dataset.page==="' + page + '")});},300)</script>'

/** 页面 harness —— 整页出图（--full-shots）与骨架实测（--skeleton）**共用同一份**：
 *  两侧夹具一旦分家，出图与实测会得出互相矛盾的结论（本轮 P0 教训：夹具失真比代码错更难发现）。 */
function pageHtml (view, proto, extra) {
  if (proto) {
    return readFileSync(PROTO, 'utf8').replace('</body>',
      '<style>' + PROTO_FREE_CSS + '</style>' + protoSwitch(VIEW_PAGE[view]) + (extra || '') + '</body>')
  }
  const client = readFileSync(CLIENT, 'utf8')
  return '<!DOCTYPE html><html class="dark" data-theme="dark"><head><meta charset="utf-8"><style>' + FULL_FREE_CSS + '</style></head>'
    + '<body><div class="hHd-Xa_footArea"></div>'
    + '<script>window.__ModuleLoader__={load:function(cfg){try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>'
    + '<script>' + FIX + '</script>'
    + '<script>window.fetch=function(url){var p=String(url).replace(/^.*?\\/api\\/shoucang-panel/,"").split("?")[0];return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve(Object.prototype.hasOwnProperty.call(FIX,p)?FIX[p]:{})},text:function(){return Promise.resolve("{}")}})};</script>'
    + '<script>' + client + '</script>'
    + '<script>try{window.__scMod.apply({logger:{info:function(){},warn:function(){}},effect:function(){},on:function(){},get:function(){return undefined}})}catch(e){window.BE=String(e)}</script>'
    + '<script>setTimeout(function(){var b=document.getElementById("scpanl-btn");if(b)b.click();setTimeout(function(){'
    + 'var items=document.querySelectorAll("#scpanl-root .sc-nav-item");for(var i=0;i<items.length;i++){'
    + 'if((items[i].textContent||"").trim()==="' + view + '"){items[i].click();break}}},500)},350)</script>'
    + (extra || '') + '</body></html>'
}

/* ── DOM 骨架同口径实测（--skeleton <dir>）：逐块比对的**主依据** ──
 * 为什么不用肉眼：v9 计划 §2 的记忆库页曾实测 card:0 而页面明明有内容 —— 探针类名覆盖不全就会得出
 * 与图完全相反的结论。这里两侧用**同一套选择器**（面板与原型类名各自列全），并把块树落成 txt 存档。 */
const SK_PROBE = (sel) => ['<script>setTimeout(function(){',
  'function R(e){var r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}}',
  'function txt(e){var t=(e.textContent||"").replace(/\\s+/g," ").trim();return t.slice(0,44)}',
  'function cls(e){var c=e.className;if(c&&c.baseVal!==undefined)c=c.baseVal;return String(c||"").trim().split(/\\s+/).slice(0,3).join(".")}',
  'var SEL=[["kpi",".kpi,.sc-kpi"],["card",".card,.sc-card"],["row",".row,.sc-row,.sc-setrow,.sc-idx-row"],["pill",".pill,.sc-pill,.badge,.sc-ds-badge,.sc-badge"],',
  '["dot",".dot,.sc-dot"],["bar",".cap-track,.sc-kpi-bar,.k-bar,.sc-bar"],["btn","button,.btn,.sc-btn"],["src",".src,.sc-src"],',
  '["alert",".alert,.sc-alert"],["tab","wa-tab,.sc-tabbox button"],["pane","wa-tab-panel,.sc-pane"],["tl",".tl-item,.sc-tl-item"],["code",".code,.sc-code"]];',
  'function counts(e){var o={};SEL.forEach(function(p){var n=e.querySelectorAll(p[1]).length;if(n)o[p[0]]=n});return o}',
  'function block(e,d){var r=R(e);var o={tag:e.tagName.toLowerCase(),cls:cls(e),w:r.w,h:r.h,t:txt(e),c:counts(e)};',
  /* 深度 8：卡片的层数随容器嵌套而变（设置/参数页的卡在 wa-tab-panel > .sc-tabpane 之下 = 第 5 层，
     深度卡在 5 就会「卡有尺寸但看不见卡内行」，误判成结构缺失 —— 已踩）。 */
  'if(d<8){var kids=[];for(var i=0;i<e.children.length&&kids.length<20;i++){var k=e.children[i];var kr=R(k);',
  'if(kr.h>3&&kr.w>3)kids.push(block(k,d+1))}if(kids.length)o.kids=kids}return o}',
  'var c=document.querySelector(' + JSON.stringify(sel) + ');',
  'var d=document.createElement("div");d.id="sk-out";d.textContent=c?JSON.stringify(block(c,0)):"null";document.body.appendChild(d)',
  '},1600)</script>'].join('')

/** 路径编号（1.2.3）：两侧块顺序对不上时，编号让「多了哪块/少了哪块」一眼可见 */
function skNumber (b, path, out) {
  out.push(path + '  ' + b.tag + (b.cls ? '.' + b.cls : '') + '  ' + b.w + 'x' + b.h + '  「' + b.t + '」  ' +
    Object.keys(b.c).map((k) => k + ':' + b.c[k]).join(' '))
  ;(b.kids || []).forEach((k, i) => skNumber(k, path + '.' + (i + 1), out))
  return out
}

/** 跑一页骨架，返回 { html, lines }（lines 为可读文本） */
function skeletonOf (view, proto) {
  const sel = proto ? '#newFrame .page.on' : '#scpanl-root .sc-view'
  const tmp = mkdtempSync(join(tmpdir(), 'sc-sk-'))
  const f = join(tmp, 'sk.html')
  writeFileSync(f, pageHtml(view, proto, SK_PROBE(sel)), 'utf8')
  let dom = ''
  try {
    dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--user-data-dir=' + join(tmp, 'cp'),
      '--virtual-time-budget=7000', '--window-size=1280,900', '--dump-dom', 'file:///' + f],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 })
  } catch (e) { dom = (e && e.stdout) || '' }
  rmSync(tmp, { recursive: true, force: true })
  const m = /<div id="sk-out">([\s\S]*?)<\/div>/.exec(dom)
  if (!m) return { html: pageHtml(view, proto, ''), lines: ['（取不到骨架：渲染失败）'] }
  const json = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  let b = null
  try { b = JSON.parse(json) } catch (e) { return { html: '', lines: ['（骨架 JSON 解析失败）'] } }
  if (!b) return { html: '', lines: ['（容器选择器无命中：' + sel + '）'] }
  const lines = ['容器 ' + b.w + 'x' + b.h + '  ' + b.tag + '.' + b.cls + '  ' + JSON.stringify(b.c)]
  return { html: '', lines: skNumber(b, '1', lines).slice(1) }
}

/* 整页长图的最小有效字节数（与 `--shots` 段同源：**同一文件不得三套标准**） */
const SHOT_MIN_BYTES = 5000

function fullShot (view, out, proto) {
  /* 截图必须用**绝对路径**：Chrome 对相对路径按自己的 cwd 解析，文件会静默落到别处（表现为「✗」） */
  out = resolve(out)
  /* ⚠ 2026-09-17 实修（M2 · 圆桌会审 P0）：**先删目标文件** —— 与 `run()` 的 `:359` 同一条判据。
   *   原 `fullShot` 没有这一步，且失败只打印普通 console.log（**不调 bad()**）⇒
   *   「本次失败」与「捡到上次残留」不可区分，且**截图全缺也 exit 0**（实测）。
   *   现改为返回 verdict，由 `--full-shots` 段计入 `fail` 计数。 */
  rmSync(out, { force: true })
  const tmp = mkdtempSync(join(tmpdir(), 'sc-full-'))
  const f = join(tmp, 'full.html')
  writeFileSync(f, pageHtml(view, proto, heightProbe(proto ? '#newFrame .page.on' : '#scpanl-modal')), 'utf8')
  const chrome = (extra) => execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--user-data-dir=' + join(tmp, extra === 'dom' ? 'cp1' : 'cp2'), '--virtual-time-budget=7000',
    '--window-size=1280,' + (extra === 'dom' ? 900 : extra), extra === 'dom' ? '--dump-dom' : '--screenshot=' + out, 'file:///' + f],
  { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, stdio: extra === 'dom' ? ['ignore', 'pipe', 'pipe'] : 'ignore' })
  let h = 0, why = ''
  try {
    const dom = chrome('dom')
    why = 'dom len=' + String(dom || '').length
    const m = /<div id="sc-full-h">(\d+)<\/div>/.exec(dom || '')
    if (m) h = parseInt(m[1], 10)
  } catch (e) {
    why = 'ERR ' + String((e && e.message) || e).slice(0, 160) + ' | stdout len=' + String((e && e.stdout) || '').length
    const m = /<div id="sc-full-h">(\d+)<\/div>/.exec((e && e.stdout) || '')
    if (m) h = parseInt(m[1], 10)
  }
  if (!h || h < 400) {
    rmSync(tmp, { recursive: true, force: true })
    console.log('full ' + (proto ? '原型' : '面板') + ' ' + view + ' ✗ 取不到高度（h=' + h + ' · ' + why + '）')
    return { ok: false, size: 0, reason: 'h<400' }
  }
  try { chrome(String(h + 24)) } catch (e) { /* 截图偶发非零退出，文件可能已生成 */ }
  rmSync(tmp, { recursive: true, force: true })
  const size = existsSync(out) ? statSync(out).size : 0
  const okShot = size >= SHOT_MIN_BYTES
  console.log('full ' + (proto ? '原型' : '面板') + ' ' + view + ' → ' + out +
    (okShot ? ' (' + h + 'px · ' + Math.round(size / 1024) + ' KB)' : ' ✗（本次未写出或过小 ' + size + 'B）'))
  return { ok: okShot, size }
}

function run (w, h, view) {
  const tmp = mkdtempSync(join(tmpdir(), 'sc-geo-'))
  const f = join(tmp, 'geo.html')
  const client = readFileSync(CLIENT, 'utf8')
  const html = `<!DOCTYPE html><html class="dark" data-theme="dark"><head><meta charset="utf-8"></head>
<body><div class="hHd-Xa_footArea"></div><div class="mneme-trigger"></div>
<script>window.__ModuleLoader__={load:function(cfg){try{window.__scMod=cfg.factory(function(){return {}})}catch(e){window.__LE=String(e)}}};</script>
<script>${FIX}</script>
<script>window.fetch=function(url){var p=String(url).replace(/^.*?\\/api\\/shoucang-panel/,'').split('?')[0];return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve(Object.prototype.hasOwnProperty.call(FIX,p)?FIX[p]:{})},text:function(){return Promise.resolve('{}')}})};</script>
<script>${client}</script>
<script>try{window.__scMod.apply({logger:{info:function(){},warn:function(){}},effect:function(){},on:function(){},get:function(){return undefined}})}catch(e){window.BE=String(e)}</script>
${PROBE(view)}
</body></html>`
  writeFileSync(f, html, 'utf8')
  let dom = ''
  try {
    dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--user-data-dir=' + join(tmp, 'cp'),
      '--virtual-time-budget=6000', '--window-size=' + w + ',' + h, '--dump-dom', 'file:///' + f],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 })
  } catch (e) { dom = e.stdout || '' }
  rmSync(tmp, { recursive: true, force: true })
  const m = /<div id="geo-out">([\s\S]*?)<\/div>/.exec(dom)
  if (!m) return null
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
}

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }
console.log('UI 几何回归（真实 client.js × ' + VIEWPORTS.length + ' 视口 × ' + VIEWS.length + ' 视图）')

for (const [w, h] of VIEWPORTS) {
  console.log('\n── 视口 ' + w + '×' + h + ' ──')
  const g = run(w, h, '运行总览')
  if (!g) { bad('取不到几何数据（渲染失败）'); continue }
  /* ① 弹窗随视口自适应 */
  if (!g.modal) bad('弹窗未渲染')
  else {
    const fits = g.modal.w <= g.vw && g.modal.h <= g.vh
    fits ? ok('弹窗不溢出视口（' + g.modal.w + '×' + g.modal.h + ' ≤ ' + g.vw + '×' + g.vh + '）')
      : bad('弹窗溢出视口：' + g.modal.w + '×' + g.modal.h + ' > ' + g.vw + '×' + g.vh)
    const ratio = g.modal.w / g.vw
    ratio >= 0.75 ? ok('弹窗宽度随视口自适应（占 ' + Math.round(ratio * 100) + '% 视口宽）')
      : bad('弹窗宽度被钉死：仅占 ' + Math.round(ratio * 100) + '% 视口宽（应 ≥75%）—— 疑有固定 width/max-width')
  }
  /* ② 内容区是唯一滚动容器 */
  if (g.viewEl && g.modal) {
    g.viewEl.b <= g.modal.b + 1 ? ok('内容区收口在弹窗内（不越界）') : bad('内容区越出弹窗底边')
    g.scroll && g.scroll.sh >= g.scroll.ch ? ok('内容区可滚动（scrollHeight ' + g.scroll.sh + ' ≥ clientHeight ' + g.scroll.ch + '）') : bad('内容区滚动度量异常')
  }
  /* ③ 首屏容纳关键区块 */
  const kpiVisible = g.kpis.filter((k) => k.barY > 0 && k.barY < (g.statusbar ? g.statusbar.t : g.vh)).length
  g.kpis.length === 4 ? ok('KPI 卡 4 张齐备') : bad('KPI 卡数量 ' + g.kpis.length + '（期望 4）')
  kpiVisible === 4 ? ok('四张 KPI 的进度条全部落在首屏可视区')
    : bad('仅 ' + kpiVisible + '/4 张 KPI 进度条在首屏（其余被挤出 / 未渲染）')
  const sameRow = new Set(g.kpis.filter((k) => k.barY > 0).map((k) => k.barY)).size
  sameRow <= 1 ? ok('四张 KPI 同行（进度条共线 ' + g.kpis.map((k) => k.barY).join('/') + '）')
    : bad('KPI 换行（条 y = ' + g.kpis.map((k) => k.barY).join('/') + '）')
  /* ④ 操作卡 / 徽章 / 状态栏 */
  g.opCards.length === 3 ? ok('操作卡 3 张') : bad('操作卡 ' + g.opCards.length + ' 张（期望 3）')
  /* S4：共享契约（后端契约表 → 客户端）必须真实送达且带字段类型。
   * 条数从**产物**（lib/panel-contract.json 的 routeCount）读，不写死数字 ——
   * 写死意味着"每加一个端点就要来改一次测试"，纯噪音（2026-09-13 加 /maturation/scan 时 34→35 连挂 3 条断言）。 */
  const ct = g.contract || {}
  const ctWant = (() => { try { return JSON.parse(readFileSync('lib/panel-contract.json', 'utf8')).routeCount } catch { return -1 } })()
  ct.present && ct.count === ctWant && ct.routes === ctWant
    ? ok('共享契约已送达客户端（' + ctWant + ' 条路由）')
    : bad('共享契约缺失或条数不符（期望 ' + ctWant + '）：' + JSON.stringify(ct))
  ct.saveRequired === 'text' ? ok('契约字段带必填信息（/save 必填 text）') : bad('/save 必填信息异常：' + ct.saveRequired)
  /* 用 indexOf 而非行首正则：本文件是省略分号风格，行首 /x/ 会被解析成上一句的除法（ASI 陷阱） */
  ct.saveFields.indexOf('text:string') >= 0 ? ok('契约字段带类型（/save → ' + ct.saveFields + '）') : bad('契约字段类型缺失：' + ct.saveFields)
  /* S3：按钮已由组件库承载（结构 + 真渲染 + 尺寸未走样） */
  /* 按钮（S3 重做）：组件库承载 + 尺寸守方案（前置的尺寸层接管后实测 size=s = 30px） */
  const wb = g.waBtn || {}
  wb.count >= 3 ? ok('按钮由组件库承载（wa-button ×' + wb.count + '，首个「' + wb.label + '」）') : bad('按钮未走组件库（' + wb.count + '）')
  wb.shadow ? ok('组件内部已渲染（shadowRoot 存在）') : bad('组件未渲染（无 shadowRoot）')
  const wl = g.waLabel || {}
  wl.lum >= 0.7 ? ok('组件按钮标签可读（' + wl.color + '，亮度 ' + wl.lum.toFixed(2) + ' ≥ 0.7）')
    : bad('组件按钮标签对比不足：' + wl.color + '（亮度 ' + (wl.lum < 0 ? '?' : wl.lum.toFixed(2)) + '，应 ≥0.7）')
  wb.h >= 26 && wb.h <= 34 ? ok('组件库按钮高度 ' + wb.h + 'px（方案基准 ≈30px）') : bad('按钮高度偏离方案：' + wb.h + 'px（期望 26–34）')
  new Set(g.opCards.map((c) => c.t)).size <= 1 ? ok('三张操作卡同行') : bad('操作卡换行（t = ' + g.opCards.map((c) => c.t).join('/') + '）')
  g.badgeRows <= 1 ? ok('徽章行单行（' + g.badgeRows + ' 行）') : bad('徽章行折行 ' + g.badgeRows + ' 行（方案为单行）')
  g.statusbar && g.modal && g.statusbar.b <= g.modal.b + 1 ? ok('底部状态栏可见') : bad('底部状态栏被挤出视口')
  g.logwrap && (g.logwrap.hidden || g.logwrap.h <= 44) ? ok('日志折叠成一行（' + g.logwrap.h + 'px，不侵占首屏）') : bad('日志未折叠：占 ' + (g.logwrap ? g.logwrap.h : '缺失') + 'px')
  /* P0-1（2026-09-13）：进度条组件替换的**渲染级证据**（探针见 PROBE 尾部的 out.prog）。
   *   断言的是「尺寸变量真的接管了」：组件自带 --track-height:1rem(16px)，方案是 6px；
   *   首版未接管直接替换 ⇒ 整页网格位移（93 → 70 PASS）。改为真实渲染量轨道高度后才算数。 */
  const pg = g.prog || {}
  pg.def ? ok('进度条已由组件库承载（wa-progress-bar 已注册）') : bad('wa-progress-bar 未注册（组件库未随产物送达？）')
  pg.trackVar === '6px'
    ? ok('进度条尺寸已接管方案值（--track-height = 6px）')
    : bad('进度条尺寸变量未接管：' + JSON.stringify(pg.trackVar) + '（期望 6px；组件默认 1rem=16px ⇒ 会顶开整页网格）' + (pg.err ? ' err=' + pg.err : ''))
}

/* 其余视图：只查「有无运行时崩溃 + 内容非空」 */
console.log('\n── 其余视图冒烟（1280×860） ──')
/* v9 严格对齐（2026-09-13）：记忆库页 tab 由 5 → **4**（原型无「运行态」Tab ——
 *   其蒸馏运行/记忆库状态属运行总览页），故此处同步收敛。 */
/* 各页分段数：记忆库 5（知识索引 / 候选区 / 笔记 / **归档区** / 统计，与 v9 原型 DOM 一致 ——
   2026-09-13 补归档区后 4→5）；参数 4；设置 2。 */
const TABBED = { 记忆库: 5, 参数: 4, 设置: 2 }
VIEWS.slice(1).forEach((v) => {
  const g = run(1280, 860, v)
  if (!g) return bad(v + '：取不到几何数据')
  g.scroll && g.scroll.sh > 40 ? ok(v + ' 渲染非空（scrollHeight ' + g.scroll.sh + '）') : bad(v + ' 渲染为空')
  /* S-P1d（2026-09-15）**深度睡眠页 · 纪元行的渲染级几何判据**（用户指正后立）：
   *   **面板内容区有滑动导轨（内部滚动容器）** ⇒ **纯像素截图对视口折叠线以下系统性失明**，
   *   「图里没有」≠「没渲染」（本仓已两次栽在"判据看不见"上：H-5/H-16 是看代码对位置失明）。
   *   ⇒ 渲染类判据一律 **图证 + DOM 几何** 双判据：此处查 `out.epochRow`（探针见 PROBE 的 S-P1d 段），
   *     只看"元素在不在 DOM、rect 是否非零" —— **与折叠、滚动位置、是否在截图内全都无关**。 */
  if (v === '深度睡眠') {
    const er = g.epochRow || {}
    er.found && er.rect && er.rect.h > 0
      ? ok('S-P1d 纪元行已渲染（DOM 几何 h=' + er.rect.h + 'px · 相对内容区 top=' + er.relTop + 'px · 视口内=' + er.visibleInViewport + '）')
      : bad('S-P1d 纪元行**未渲染**（DOM 里没有含 epoch- 文本的节点）—— 数据面已有字段却到不了 UI')
  }
  /* S3：组件库 Tab —— 结构齐备 + 同时只显示一个面板 + web component 已注册 */
  /* S3：设置页的表单控件必须已由组件库承载且**值已绑定**（不是空壳） */
  if (v === '设置') {
    const fm = g.forms || {}
    fm.switches >= 1 ? ok('开关由组件库承载（wa-switch ×' + fm.switches + '）') : bad('开关未走组件库（' + fm.switches + '）')
    fm.waSelects === 0 ? ok('零 wa-select 残留（二度回滚彻底；判因见源码注释）') : bad('仍有 ' + fm.waSelects + ' 个 wa-select（回滚不彻底）')
    fm.selects >= 1 ? ok('下拉就位（原生 select ×' + fm.selects + '）') : bad('下拉缺失（' + fm.selects + '）')
    fm.shadow ? ok('开关已真渲染（shadowRoot 存在）') : bad('开关未渲染（无 shadowRoot）')
    /* 「存在 ≠ 渲染」的固化断言：任何"组件是否画出来"都必须按**渲染尺寸**判，不按元素是否存在 */
    fm.selectArrow === false ? ok('下拉为原生实现（其箭头由原生控件绘制；WA select 的箭头未渲染已被像素级证据否决）')
      : bad('下拉判据异常：' + fm.selectArrow)
    fm.firstChecked === true ? ok('开关值已绑定（首个 checked=true，与默认配置一致）') : bad('开关值未绑定：' + fm.firstChecked)
    fm.firstSelectValue === 'comfortable' ? ok('下拉值已绑定（首个 value=comfortable）') : bad('下拉值未绑定：' + fm.firstSelectValue)
  }
  if (TABBED[v]) {
    const w = g.wa || {}
    w.group === 1 ? ok(v + '：Tab 已由组件库承载（wa-tab-group ×1）') : bad(v + '：未用组件库 Tab（group=' + w.group + '）')
    w.panel === TABBED[v] ? ok(v + '：wa-tab-panel ×' + w.panel + '（与分段数一致）') : bad(v + '：wa-tab-panel ' + w.panel + ' ≠ ' + TABBED[v])
    w.tab === TABBED[v] ? ok(v + '：wa-tab ×' + w.tab) : bad(v + '：wa-tab ' + w.tab + ' ≠ ' + TABBED[v])
    w.visiblePanels === 1 ? ok(v + '：同时仅显示 1 个面板（互斥正确）') : bad(v + '：可见面板 ' + w.visiblePanels + ' ≠ 1')
    w.defined ? ok(v + '：customElements 已注册 wa-tab-group（组件库随产物送达）') : bad(v + '：wa-tab-group 未注册')
  }
})

/* ── S2：插槽路径 —— 宿主插槽可用时，注册 sidebar.footer.action 且**不得**再挂 DOM 直插入口 ── */
console.log('\n── 插槽路径（S2 · 互斥） ──')
{
  const tmp = mkdtempSync(join(tmpdir(), 'sc-slot-'))
  const f = join(tmp, 'slot.html')
  const client = readFileSync(CLIENT, 'utf8')
  const html = `<!DOCTYPE html><html class="dark" data-theme="dark"><head><meta charset="utf-8"></head>
<body><div class="hHd-Xa_footArea"></div>
<script>
window.__REG = []; window.__INJECTED = [];
window.__FAKE_REACT = { createElement: function () { return { $typeof: 'react.element' } } };
window.__SLOTS = {
  inject: function (name, fn) { window.__INJECTED.push(name); return fn() },
  register: function (desc, comp) { window.__REG.push({ name: desc.name, id: desc.id, comp: typeof comp }); return function () {} }
};
window.__ModuleLoader__ = { load: function (cfg) {
  try { window.__scMod = cfg.factory(function (n) { return n === 'react' ? window.__FAKE_REACT : {} }) } catch (e) { window.__LE = String(e) }
} };
</script>
<script>${client}</script>
<script>
try {
  window.__scMod.apply({
    logger: { info: function () {}, warn: function () {} },
    effect: function (fn) { return fn() },
    on: function () {}, get: function () { return undefined },
    slots: window.__SLOTS
  });
} catch (e) { window.__AE = String(e) }
setTimeout(function () {
  var d = document.createElement('div'); d.id = 'slot-out';
  d.textContent = JSON.stringify({ reg: window.__REG, injected: window.__INJECTED, btn: !!document.getElementById('scpanl-btn'), root: !!document.getElementById('scpanl-root'), err: window.__AE || window.__LE || null });
  document.body.appendChild(d);
}, 600);
</script>
</body></html>`
  writeFileSync(f, html, 'utf8')
  let dom = ''
  try {
    dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--user-data-dir=' + join(tmp, 'cp'),
      '--virtual-time-budget=4000', '--window-size=1280,860', '--dump-dom', 'file:///' + f],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 })
  } catch (e) { dom = e.stdout || '' }
  rmSync(tmp, { recursive: true, force: true })
  const m = /<div id="slot-out">([\s\S]*?)<\/div>/.exec(dom)
  const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) : null
  if (!r) bad('插槽路径：取不到结果（渲染失败）')
  else {
    r.err ? bad('插槽路径抛异常：' + r.err) : ok('插槽路径无异常')
    ;(r.injected || []).slice().sort().join(',') === 'settings.section,sidebar.footer.action'
      ? ok('向两个宿主插槽注入：' + r.injected.join(' + '))
      : bad('插槽注入异常：' + JSON.stringify(r.injected))
    const names = r.reg.map((x) => x.name).sort()
    names.join(',') === 'settings.section,sidebar.footer.action'
      ? ok('注册两条插槽条目：' + r.reg.map((x) => x.id + '@' + x.name).join(' + '))
      : bad('插槽注册异常：' + JSON.stringify(r.reg))
    r.reg.every((x) => x.comp === 'function') ? ok('两条均以组件函数注册') : bad('组件形态异常')
    r.btn === false ? ok('互斥生效：插槽可用时**不**再挂 DOM 直插入口（#scpanl-btn 不存在）')
      : bad('互斥失效：插槽已注册却仍挂了 DOM 直插入口（侧栏会出现两个入口）')
    r.root === true ? ok('面板骨架仍挂载（插槽化不影响自有壳）') : bad('面板骨架未挂载')
  }
}

/* ── S1-b：皮肤机制 —— v9（默认）与宿主原生（真取自 --dsw-alias-*，而非写死色值） ── */
console.log('\n── 皮肤（S1-b） ──')
function runSkin (skin, hostVar) {
  const tmp = mkdtempSync(join(tmpdir(), 'sc-skin-'))
  const f = join(tmp, 'skin.html')
  const client = readFileSync(CLIENT, 'utf8')
  const fakeHost = hostVar ? `:root{--dsw-alias-bg-layer-1:${hostVar};--dsw-alias-bg-layer-2:#0a0a0a;--dsw-alias-bg-layer-3:#222222;--dsw-alias-border-l2:#333333;--dsw-alias-border-l1:#444444;--dsw-alias-label-primary:#ffffff;--dsw-alias-label-secondary:#bbbbbb;--dsw-alias-label-tertiary:#888888;--dsw-alias-brand-primary:#ff0000;--dsw-alias-state-success-primary:#00ff00;--dsw-alias-state-warn-primary:#ffff00;--dsw-alias-state-error-primary:#ff00ff;--dsw-alias-interactive-bg-hover:rgba(255,255,255,.06);}` : ''
  const html = `<!DOCTYPE html><html class="dark" data-theme="dark"><head><meta charset="utf-8"><style>${fakeHost}</style></head>
<body><div class="hHd-Xa_footArea"></div>
<script>
try { localStorage.setItem('shoucang.ui.cfg.v1', JSON.stringify({ skin: '${skin}' })); } catch (e) {}
window.__ModuleLoader__ = { load: function (cfg) { try { window.__scMod = cfg.factory(function () { return {} }) } catch (e) { window.__LE = String(e) } } };
${FIX}
window.fetch = function (url) { var p = String(url).replace(/^.*?\\/api\\/shoucang-panel/, '').split('?')[0]; return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(Object.prototype.hasOwnProperty.call(FIX, p) ? FIX[p] : {}) }, text: function () { return Promise.resolve('{}') } }) };
</script>
<script>${client}</script>
<script>
try { window.__scMod.apply({ logger: { info: function () {}, warn: function () {} }, effect: function () {}, on: function () {}, get: function () { return undefined } }); } catch (e) { window.__AE = String(e) }
setTimeout(function () {
  var b = document.getElementById('scpanl-btn'); if (b) b.click();
  setTimeout(function () {
    var root = document.getElementById('scpanl-root');
    var kpi = document.querySelector('#scpanl-root .sc-kpi');
    var main = document.querySelector('#scpanl-root .sc-main');
    var d = document.createElement('div'); d.id = 'skin-out';
    d.textContent = JSON.stringify({
      cls: root ? root.className : '(无 root)',
      kpiBg: kpi ? getComputedStyle(kpi).backgroundColor : null,
      mainBg: main ? getComputedStyle(main).backgroundColor : null,
      err: window.__AE || window.__LE || null
    });
    document.body.appendChild(d);
  }, 1100);
}, 500);
</script></body></html>`
  writeFileSync(f, html, 'utf8')
  let dom = ''
  try {
    dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--user-data-dir=' + join(tmp, 'cp'), '--virtual-time-budget=4000', '--window-size=1280,860', '--dump-dom', 'file:///' + f], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 })
  } catch (e) { dom = e.stdout || '' }
  rmSync(tmp, { recursive: true, force: true })
  const m = /<div id="skin-out">([\s\S]*?)<\/div>/.exec(dom)
  return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) : null
}
{
  const v9 = runSkin('v9', null)
  if (!v9) bad('v9 皮肤：取不到结果')
  else {
    /sc-skin-v9/.test(v9.cls) ? ok('默认皮肤标记 sc-skin-v9 已打') : bad('缺少 sc-skin-v9（cls=' + v9.cls + '）')
    v9.mainBg === 'rgb(19, 19, 21)' ? ok('v9 皮肤页面底色 = rgb(19,19,21)（= 原型 v9 --bg #131315）') : bad('v9 皮肤页面底色异常：' + v9.mainBg + '（期望 rgb(19,19,21) = 原型 --bg #131315）')
    v9.kpiBg === null ? console.log('  ℹ v9 用例未切视图 ⇒ 未取到卡面色（面板底色已证皮肤生效）')
      : (v9.kpiBg === 'rgb(42, 42, 47)' ? ok('v9 皮肤卡面 = rgb(42,42,47)（凸卡）') : bad('v9 皮肤卡面色异常：' + v9.kpiBg))
  }
  const host = runSkin('host', '#123456')
  if (!host) bad('宿主皮肤：取不到结果')
  else {
    /sc-skin-host/.test(host.cls) ? ok('宿主皮肤标记 sc-skin-host 已打') : bad('缺少 sc-skin-host（cls=' + host.cls + '）')
    host.mainBg === 'rgb(18, 52, 86)' ? ok('宿主皮肤面板底色真取自 --dsw-alias-bg-layer-1（伪造 #123456 → rgb(18,52,86)）')
      : bad('宿主皮肤未取自宿主变量：mainBg=' + host.mainBg)
  }
}

if (process.argv.includes('--shots')) {
  const dir = process.argv[process.argv.indexOf('--shots') + 1] || tmpdir()
  /* UI1 收尾（2026-09-15）：**原来不建目录** ⇒ 传入不存在的路径时 Chrome `--screenshot` 静默失败，
   *   12 张图全部产出 `✗`，而门本身仍报 100 PASS ⇒ **"出图失败"被吞掉**（典型的假绿）。
   *   ⇒ 显式 `mkdirSync(recursive)`；并在末尾汇总**实际产出数**，缺图即红。 */
  mkdirSync(dir, { recursive: true })
  shoot(1280, 860, '运行总览', join(dir, 'shot-overview.png'))
  shoot(1280, 860, '参数', join(dir, 'shot-params.png'))
  /* 参数页「④ 后台与调度」页签（2026-09-15 补）：该页签承载**蒸馏节流 4 键 + 蒸馏/深睡模型下拉**
   *   （即 H-5/H-16 = F-001 唤醒空闲时长 / F-002 蒸馏子代理模型）。
   *   判因：此前出图集只出**默认页签①** ⇒ 这 6 个键的 UI 长期没有视觉证据，
   *   以致 `OPEN-ITEMS` 里"无持久 UI 通道"的**过时判断**能存活很久（实测它们**早已有控件**）。 */
  shoot(1280, 860, '参数', join(dir, 'shot-params-sched.png'), '④ 后台与调度')
  /* 记忆库页（2026-09-13 P1-2 拆分 renderMemoryExpanded 后纳入出图集）——
   * 该页是 5 Tab + 容量卡 + 徽章行的复合结构，只靠断言看不见「层级反了 / 内容被挤出去」。 */
  shoot(1280, 860, '记忆库', join(dir, 'shot-memory.png'))
  /* 运行观测页（2026-09-13 P0-1 接入 wa-progress-bar 后纳入）——本页是 4 折叠区 + 日志，
   * 组件替换的布局影响只在这里可见（进度条本身在 mock 下 hidden，故另配常驻 CSS 变量断言）。 */
  shoot(1280, 860, '运行观测', join(dir, 'shot-observe.png'))
  shoot(1280, 860, '设置', join(dir, 'shot-settings.png'))
  /* 画像 / 插件集合 / 深度睡眠（2026-09-13 第五轮 v9 逐页对齐纳入）——
   * 这三页是"形态差异断言天然失明"的重灾区：柱高全 0、状态机整块缺失、卡片数量不符，
   * 门禁全绿也照样错；只有出图肉眼比对才看得见。 */
  shoot(1280, 860, '画像', join(dir, 'shot-persona.png'))
  shoot(1280, 860, '插件集合', join(dir, 'shot-suite.png'))
  /* S-P1d 判据（2026-09-15 · 用户指正后立）**深度睡眠页 · 纪元行的 DOM 几何断言**。
   *   ⚠ 为什么挂在这里而不是上面的冒烟循环：实测该循环的 `VIEWS.slice(1)` **不含「深度睡眠」**
   *     （我先把断言写在那里，跑完日志里**一条 S-P1d 都没有** ⇒ 断言根本没执行 ⇒ 典型的"以为覆盖了"）。
   *   **面板内容区有滑动导轨（内部滚动容器）** ⇒ **纯像素截图对视口折叠线以下系统性失明**，
   *     「图里没有」≠「没渲染」。故渲染类判据一律 **图证 + DOM 几何** 双判据：
   *     此处 `run()` 重取该视图探针，只看"元素在不在 DOM、rect 是否非零" —— 与折叠/滚动/截图无关。 */
  shoot(1280, 860, '深度睡眠', join(dir, 'shot-sleep.png'))
  {
    const gs = run(1280, 860, '深度睡眠')
    const er = (gs && gs.epochRow) || {}
    er.found && er.rect && er.rect.h > 0
      ? ok('S-P1d 纪元行已渲染（DOM 几何 h=' + er.rect.h + 'px · 相对内容区 top=' + er.relTop + 'px · 视口内=' + er.visibleInViewport + ' · text=' + String(er.text || '').slice(0, 46) + '）')
      : bad('S-P1d 纪元行**未渲染**（DOM 里没有含 epoch- 文本的节点）—— 数据面已有字段却到不了 UI')
  }
  /* 架构页（2026-09-13 架构重构后新增）——**加视图必须同时进视觉验收**：
   *   本轮实证：新视图曾因图标 key 缺失让**整页白屏**，而出图集里没有它 ⇒ 差点漏判。
   *   该页是 5 Tab（内容环/记录与图/观测/装配/认知环旋钮）+ 通用事实表的复合结构，
   *   只靠形态断言看不见「Tab 挤没了 / 键值表错行 / 旋钮换行」，必须出图。 */
  shoot(1280, 860, '架构', join(dir, 'shot-arch.png'))
  /* 逐页签出图（2026-09-14 接通）：`shoot()` 的页签参数已落到点击脚本（wa-tab 按文字点选）。
   *   先出两张信息最密的：装配（含 storeMode 存储模式控件）· 认知环旋钮（4 数值 + 4 开关 + 探针）。 */
  shoot(1280, 860, '架构', join(dir, 'shot-arch-asm.png'), '装配')
  shoot(1280, 860, '架构', join(dir, 'shot-arch-mcl.png'), '认知环旋钮')

  /* ── **产出汇总 + 缺图即红**（UI1 收尾补 · 2026-09-15）──
   *   判因：出图集此前**不校验产出** —— 12 张全 `✗`（目录不存在）而门仍 100 PASS，
   *   即"**出图失败被吞掉**"，与"日志面板静默空掉"是同一类假绿。
   *   ⇒ 逐张核对存在且非空；缺一张即 FAIL（exit 1），并写明差在哪。 */
  const SHOTS = ['shot-overview', 'shot-params', 'shot-params-sched', 'shot-memory', 'shot-observe', 'shot-settings',
    'shot-persona', 'shot-suite', 'shot-sleep', 'shot-arch', 'shot-arch-asm', 'shot-arch-mcl']
  const missing = SHOTS.filter((n) => {
    const p = join(dir, n + '.png')
    return !existsSync(p) || statSync(p).size < SHOT_MIN_BYTES
  })
  console.log(`\n出图汇总：${SHOTS.length - missing.length}/${SHOTS.length} 张有效（目录 ${dir}）`)
  if (missing.length) {
    console.log('❌ 缺图/过小：' + missing.join(', '))
    console.log('   （Chrome `--screenshot` 对不可写路径会静默失败 —— 已加 mkdirSync，若仍缺请查 Chrome 路径/权限）')
    process.exit(1)
  }
  console.log('✅ 出图完整（可直接人工视觉复核）')
}

/* 骨架实测：逐页两侧各一份 txt，供程序化 diff（比肉眼可靠，也是"差异清单"的证据来源） */
if (process.argv.includes('--skeleton')) {
  const dir = process.argv[process.argv.indexOf('--skeleton') + 1] || tmpdir()
  mkdirSync(dir, { recursive: true })
  for (const v of Object.keys(VIEW_PAGE)) {
    for (const proto of [true, false]) {
      const tag = proto ? 'proto-' : 'panel-'
      const r = skeletonOf(v, proto)
      const head = '# ' + (proto ? '原型' : '面板') + ' · ' + v + '\n'
      writeFileSync(join(dir, tag + VIEW_PAGE[v] + '.txt'), head + r.lines.join('\n') + '\n', 'utf8')
      console.log('skeleton ' + tag + VIEW_PAGE[v] + ' → ' + r.lines.length + ' 块行')
    }
  }
}

/* 整页长图：面板 8 视图 + 原型 8 帧（同目录同名前缀，便于并排比对） */
if (process.argv.includes('--full-shots')) {
  const dir = process.argv[process.argv.indexOf('--full-shots') + 1] || tmpdir()
  /* Chrome 不会自建目录：目标目录不存在时截图静默不落盘（表现为「→ out ✗」，极易误判为渲染失败） */
  mkdirSync(dir, { recursive: true })
  let missing = 0
  for (const v of Object.keys(VIEW_PAGE)) {
    const a = fullShot(v, join(dir, 'panel-' + VIEW_PAGE[v] + '.png'), false)
    const b = fullShot(v, join(dir, 'proto-' + VIEW_PAGE[v] + '.png'), true)
    if (!a.ok) missing++
    if (!b.ok) missing++
  }
  /* 缺件必须进入 fail 计数（2026-09-17 修 M2）：原实现只打印 ✗、退出码仍为 0 ⇒「门绿而图缺」 */
  if (missing) bad(`整页长图缺件 ${missing} 张（输出目录 ${dir}）—— ✗ 必须影响退出码，不得只印字样`)
}

/* wa-icon 可渲染性（P2 前置门禁）：数据已在 PROBE 的 out.waIcon 里。
 * 这里只做轻量额外探针（不计入 pass/fail 计数，避免门禁恒红），靠 grep 解析输出。 */
if (process.argv.includes('--icon-check')) {
  const probe = run(1280, 860, '设置')
  if (probe && probe.waIcon) {
    const wi = probe.waIcon
    console.log('wa-icon: defined=' + wi.defined + ' rendered=' + wi.rendered + ' size=' + wi.w + 'x' + wi.h)
  } else {
    console.log('wa-icon: 取不到探针结果')
  }
}

/* P0-1 进度条探针（诊断用，与 --icon-check 同风格：不参与 pass/fail 计数） */
if (process.argv.includes('--prog-check')) {
  const probe = run(1280, 860, '运行总览')
  console.log('progress-bar: ' + (probe && probe.prog ? JSON.stringify(probe.prog) : '取不到探针结果'))
}

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
process.exit(fail === 0 ? 0 : 1)
