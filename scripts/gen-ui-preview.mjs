/**
 * 生成 UI 预览页（设计系统 / 响应式回归台）。
 *
 * 关键点：CSS **不做复制粘贴**，而是从 client.js 的 `var CSS = [ ... ].join('')`
 * 里原地求值取出 —— 预览页与线上样式永远同源，改了 client.js 没重跑本脚本才会漂移。
 *
 * 用法：node scripts/gen-ui-preview.mjs
 * 产物：deliverables/ui-preview.html（可直接双击打开；含桌面/平板/移动宽度切换 + 深浅色切换）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'client.js')
const out = join(root, 'deliverables', 'ui-preview.html')

/* ── 1. 抽出 client.js 里的 CSS ── */
const text = readFileSync(src, 'utf8')
const start = text.indexOf('var CSS = [')
if (start < 0) throw new Error('未找到 var CSS = [ —— client.js 结构变了？')
const endTok = "].join('');"
const end = text.indexOf(endTok, start)
if (end < 0) throw new Error('未找到 CSS 数组结尾 ' + endTok)
// 含尾部的 .join('') —— 只切到 ] 会拿到数组本身而不是拼好的字符串
const arrExpr = text.slice(start + 'var CSS = '.length, end + endTok.length)
// eslint-disable-next-line no-eval
const css = eval(arrExpr)
if (typeof css !== 'string' || css.length < 1000) throw new Error('CSS 求值结果异常：len=' + (css || '').length)

/* ── 2. 预览页骨架 ── */
const NAV_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>'

function navItem(label, active) {
  return (
    '<div class="sc-nav-item' +
    (active ? ' active' : '') +
    '">' +
    NAV_ICON +
    '<span>' +
    label +
    '</span></div>'
  )
}

const inner = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>守藏面板</title>
<style>__CSS__</style>
<style>
  html,body{margin:0;height:100%;background:var(--pv-page,#141414);}
  #scpanl-mask{display:flex !important;}
  .pv-note{padding:8px 24px;font-size:11px;color:#888;}
</style>
</head>
<body>
<div id="scpanl-root">
  <div id="scpanl-mask" class="open">
    <div id="scpanl-modal">
      <nav class="sc-nav">
        <div class="sc-nav-title">守藏 SHOUCANG</div>
        <div class="sc-nav-group">记忆</div>
        ${navItem('画像板块', true)}
        ${navItem('记忆板块', false)}
        <div class="sc-nav-group">运行</div>
        ${navItem('插件集合', false)}
        ${navItem('深度睡眠', false)}
        ${navItem('运行观测', false)}
        <div class="sc-nav-group">配置</div>
        ${navItem('参数调节', false)}
        ${navItem('界面设置', false)}
        ${navItem('配置原文', false)}
        <div class="sc-nav-spacer"></div>
        <div class="sc-nav-title">storage = obsidian vault</div>
        <button class="sc-nav-close" type="button" aria-label="关闭面板">✕</button>
      </nav>
      <div class="sc-main">
        <div class="sc-view">
          <div class="sc-pagehead">
            <h2 class="sc-h1">记忆板块</h2>
            <div class="sc-desc">蒸馏运行 → 记忆库状态 → 知识索引 → 候选与详情。画像（USER/AGENT）见「画像板块」。</div>
          </div>

          <div class="sc-mem-stats">
            <div class="sc-mem-stat hero">
              <div class="sc-mem-stat-label">MEMORY.md</div>
              <div class="sc-mem-stat-value">12,480</div>
              <div class="sc-mem-stat-sub">容量 20,000 · 62%</div>
              <svg class="sc-spark" width="220" height="34" viewBox="0 0 220 34"><path class="base" d="M0 30H220"/><path d="M0 26 L22 24 L44 25 L66 19 L88 21 L110 15 L132 17 L154 11 L176 13 L198 7 L220 9"/><circle cx="220" cy="9" r="2"/></svg>
            </div>
            <div class="sc-mem-stat"><div class="sc-mem-stat-label">索引行</div><div class="sc-mem-stat-value">318</div><div class="sc-mem-stat-sub">较昨日 +6</div></div>
            <div class="sc-mem-stat"><div class="sc-mem-stat-label">候选</div><div class="sc-mem-stat-value">27</div><div class="sc-mem-stat-sub">待裁决</div></div>
            <div class="sc-mem-stat"><div class="sc-mem-stat-label">冷条目</div><div class="sc-mem-stat-value">94</div><div class="sc-mem-stat-sub">cold / retired</div></div>
          </div>

          <div class="sc-h2">运行态</div>
          <div class="sc-ds-badges">
            <span class="sc-ds-badge running"><span class="dot"></span>蒸馏中</span>
            <span class="sc-ds-badge probing"><span class="dot"></span>探测输出增长</span>
            <span class="sc-ds-badge ended"><span class="dot"></span>已结束</span>
            <span class="sc-ds-badge stalled"><span class="dot"></span>停滞</span>
          </div>
          <div class="sc-ds-timing">
            <div class="sc-ds-stat"><span class="k">已运行</span><span class="v">03:12</span></div>
            <div class="sc-ds-stat"><span class="k">剩余</span><span class="v">≈ 01:40</span></div>
            <div class="sc-ds-stat"><span class="k">上次睡眠</span><span class="v">2 小时前</span></div>
          </div>
          <div class="sc-prog"><div class="sc-prog-bar"><div class="sc-prog-fill" style="width:62%"></div></div><div class="sc-prog-txt">蒸馏进度 · 62% · batch 3/5</div></div>

          <div class="sc-fold open">
            <div class="sc-fold-head"><span class="sc-fold-arrow">▾</span><span>知识索引</span><span class="sc-fold-summary">318 行</span></div>
            <div class="sc-fold-body">
              <div class="sc-idx-list">
                <div class="sc-idx-row"><span class="sc-idx-tag">决策</span><span class="sc-idx-subject">面板 UI 采用单一分层设计系统</span><span class="sc-idx-pointer">notes/ui.md §3</span></div>
                <div class="sc-idx-row"><span class="sc-idx-tag">原则</span><span class="sc-idx-subject">颜色只走令牌、尺寸只走标尺</span><span class="sc-idx-pointer">notes/ui.md §1</span></div>
                <div class="sc-idx-row"><span class="sc-idx-tag">坑</span><span class="sc-idx-subject">移动端全屏模态盖住遮罩导致无法关闭</span><span class="sc-idx-pointer">notes/ui.md §6</span></div>
              </div>
            </div>
          </div>

          <div class="sc-fold">
            <div class="sc-fold-head"><span class="sc-fold-arrow">▸</span><span>参数设置</span><span class="sc-fold-summary">6 项</span></div>
            <div class="sc-fold-body">
              <div class="setting-item">
                <div class="setting-item-info"><div class="setting-item-name">语义召回</div><div class="setting-item-desc">启用 bge-m3 向量档；关闭回落词法召回。</div></div>
                <div class="setting-item-control"><input type="checkbox" class="checkbox-container" checked></div>
              </div>
              <div class="setting-item">
                <div class="setting-item-info"><div class="setting-item-name">嵌入模型</div><div class="setting-item-desc">选择 provider 与模型；改后需重载插件。</div><div class="sc-ctrl-meta"><span class="sc-chip">全局</span><span class="sc-chip warn">需重载</span></div></div>
                <div class="setting-item-control">
                  <select><option>Ollama / bge-m3</option><option>OpenAI / text-embedding-3-small</option></select>
                </div>
              </div>
              <div class="setting-item">
                <div class="setting-item-info"><div class="setting-item-name">融合权重 k</div><div class="setting-item-desc">RRF 融合参数，越大越偏向词法召回。</div></div>
                <div class="setting-item-control"><div class="sc-num-wrap"><input class="sc-input" type="number" value="60"><span class="sc-mem-sub muted">条</span></div></div>
              </div>
              <div class="setting-item">
                <div class="setting-item-info"><div class="setting-item-name">画像密度</div><div class="setting-item-desc">控制画像小节的描述详尽程度。</div></div>
                <div class="setting-item-control">
                  <div class="sc-persona-slider"><button class="sc-persona-cell">精简</button><button class="sc-persona-cell active">标准</button><button class="sc-persona-cell">详尽</button></div>
                </div>
              </div>
            </div>
          </div>

          <div class="sc-h2">指针</div>
          <div class="sc-pointer-list">
            <div class="sc-pointer">
              <div class="sc-pointer-main">
                <div class="sc-pointer-head"><span class="sc-pointer-title">USER.md</span><span class="sc-pointer-meta">2,140 字</span></div>
                <div class="sc-pointer-summary">用户画像：偏好证据先行、反对无据结论；长期关注记忆系统与信息架构。</div>
              </div>
              <span class="sc-pointer-go">›</span>
            </div>
            <div class="sc-pointer">
              <div class="sc-pointer-main">
                <div class="sc-pointer-head"><span class="sc-pointer-title">AGENT.md</span><span class="sc-pointer-meta">1,860 字</span></div>
                <div class="sc-pointer-summary">Agent 画像：默认先给结论再给依据；改动必须标注是否已部署。</div>
              </div>
              <span class="sc-pointer-go">›</span>
            </div>
          </div>

          <div class="sc-h2">关键指标</div>
          <div class="sc-kv">
            <div class="sc-kv-row"><span class="sc-kv-k">MCL 状态</span><span class="sc-kv-v">slow</span></div>
            <div class="sc-kv-row"><span class="sc-kv-k">熟悉度</span><span class="sc-kv-v">0.72</span></div>
            <div class="sc-kv-row"><span class="sc-kv-k">向量档</span><span class="sc-kv-v">318 行</span></div>
            <div class="sc-kv-row"><span class="sc-kv-k">当前根</span><span class="sc-kv-v">D:/FF/shoucang</span></div>
          </div>

          <div class="sc-h2">操作</div>
          <div class="sc-toolbar">
            <button class="sc-btn sc-btn-primary">保存</button>
            <button class="sc-btn">重新拉取</button>
            <button class="sc-btn sc-btn-danger">清空错误</button>
            <button class="sc-btn" disabled>不可用</button>
            <button class="sc-btn sc-btn-xs">小按钮</button>
            <span class="sc-badge sc-badge-ok">已同步</span>
            <span class="sc-badge sc-badge-warn">需重载</span>
            <span class="sc-badge sc-badge-error">失败 2</span>
            <span class="sc-badge">草稿</span>
          </div>
        </div>
        <div class="sc-logwrap">
          <div class="sc-log-head"><span>日志</span><select><option>全部</option></select><span>3 条</span><span style="margin-left:auto"></span><button class="sc-btn sc-btn-xs">清空</button></div>
          <div class="sc-log-row sc-log-info"><span class="sc-log-t">07:41:02</span><span class="sc-log-lv">info</span><span class="sc-log-msg">GET /memory/overview ✓ 42ms</span></div>
          <div class="sc-log-row sc-log-warn"><span class="sc-log-t">07:41:03</span><span class="sc-log-lv">warn</span><span class="sc-log-msg">向量档缺失 12 行，已回落词法召回</span></div>
          <div class="sc-log-row sc-log-error"><span class="sc-log-t">07:41:05</span><span class="sc-log-lv">error</span><span class="sc-log-msg">POST /embed/test ✗ connect ECONNREFUSED</span></div>
        </div>
        <div class="sc-statusbar sc-status-info">已加载 shoucang.config.yaml · mtime 2026-09-12 07:40</div>
      </div>
    </div>
  </div>
</div>
</body></html>`

const shell = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>守藏面板 · UI 预览（设计系统 / 响应式）</title>
<style>
  :root{--pv-bg:#f4f5f7;--pv-fg:#1f2328;--pv-bd:#d8dce1;--pv-card:#fff;}
  @media (prefers-color-scheme:dark){:root{--pv-bg:#0f0f10;--pv-fg:#e6e6e6;--pv-bd:#2b2b2e;--pv-card:#1a1a1c;}}
  *{box-sizing:border-box;}
  body{margin:0;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Inter",sans-serif;
    background:var(--pv-bg);color:var(--pv-fg);display:flex;flex-direction:column;height:100vh;}
  header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px;
    border-bottom:1px solid var(--pv-bd);background:var(--pv-card);}
  header b{font-size:13px;margin-right:4px;}
  .seg{display:flex;gap:2px;background:var(--pv-bg);border:1px solid var(--pv-bd);border-radius:7px;padding:2px;}
  button{font:inherit;cursor:pointer;border:1px solid transparent;background:transparent;color:inherit;
    border-radius:5px;padding:4px 10px;}
  .seg button.on{background:var(--pv-card);border-color:var(--pv-bd);font-weight:600;}
  .hint{font-size:11px;opacity:.65;margin-left:auto;}
  main{flex:1;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;}
  .framewrap{border:1px solid var(--pv-bd);border-radius:10px;overflow:hidden;background:var(--pv-card);
    box-shadow:0 6px 24px rgba(0,0,0,.18);}
  iframe{border:0;display:block;}
  /* 浅色主题：注入宿主语义变量，验证 --sc-* → --dsw-alias-* 的映射链路 */
  .light-alias{--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-layer-2:#f7f7f8;--dsw-alias-bg-layer-3:#edeff2;
    --dsw-alias-label-primary:#1f2328;--dsw-alias-label-secondary:#57606a;--dsw-alias-label-tertiary:#8c959f;
    --dsw-alias-border-l1:#d0d7de;--dsw-alias-border-l2:#e4e8ed;
    --dsw-alias-brand-primary:#7c5cff;--dsw-alias-state-success-primary:#1a7f37;
    --dsw-alias-state-warn-primary:#9a6700;--dsw-alias-state-error-primary:#cf222e;
    --dsw-alias-interactive-bg-hover:rgba(0,0,0,.05);}
</style>
</head>
<body>
<header>
  <b>守藏面板 · UI 预览</b>
  <div class="seg" id="dev"></div>
  <div class="seg" id="theme"><button data-t="dark" class="on">深色</button><button data-t="light">浅色</button></div>
  <span class="hint">CSS 由 scripts/gen-ui-preview.mjs 从 client.js 原地抽取 —— 与线上同源</span>
</header>
<main><div class="framewrap"><iframe id="fr" title="panel"></iframe></div></main>
<script>
var DEV=[["桌面 1440",1440,900],["笔记本 1280",1280,820],["小笔记本 1024",1024,780],
         ["平板 900",900,760],["平板竖 768",768,900],["手机 480",480,860],["手机 390",390,800]];
var DOC=__DOC__;
var fr=document.getElementById('fr');
var devBox=document.getElementById('dev');
var cur=0, theme='dark';
function apply(){
  var d=DEV[cur];
  var availW=Math.max(320,document.querySelector('main').clientWidth-32);
  var availH=Math.max(320,document.querySelector('main').clientHeight-32);
  var w=Math.min(d[1],availW), h=Math.min(d[2],availH);
  var scale=Math.min(1,availW/w);
  fr.style.width=w+'px'; fr.style.height=h+'px';
  fr.style.transform='scale('+scale+')'; fr.style.transformOrigin='top center';
  var doc = DOC.replace('__THEMECLASS__', theme==='light'?'light-alias':'');
  fr.srcdoc = doc;
}
DEV.forEach(function(d,i){
  var b=document.createElement('button'); b.textContent=d[0];
  if(i===0)b.className='on';
  b.onclick=function(){cur=i;[].forEach.call(devBox.children,function(c){c.className='';});b.className='on';apply();};
  devBox.appendChild(b);
});
document.getElementById('theme').addEventListener('click',function(e){
  var t=e.target.getAttribute('data-t'); if(!t)return; theme=t;
  [].forEach.call(this.children,function(c){c.className=c.getAttribute('data-t')===t?'on':'';});
  apply();
});
window.addEventListener('resize',apply);
apply();
</script>
</body></html>`

const docWithTheme = inner.replace('<html lang="zh-CN">', '<html lang="zh-CN" class="__THEMECLASS__">').replace('__CSS__', css)

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, shell.replace('__DOC__', JSON.stringify(docWithTheme)), 'utf8')
console.log('gen-ui-preview ✓ ' + out + '  (css ' + css.length + ' chars)')
