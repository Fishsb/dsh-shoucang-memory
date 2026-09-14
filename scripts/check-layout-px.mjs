/**
 * 容器级布局尺寸门禁（S1 架构约束 · 2026-09-13）
 *
 * 背景（实测教训）：UI 走样的根因不是逻辑错误，而是**容器级尺寸被写死**——
 *   弹窗 `min(1040px,100%)`、日志面板 `150px`、宽屏内容列 `40px` 内距……
 *   这些一写死，容器一变就把可压缩元素挤出可见区（1024 宽下 4 张 KPI 直接归零）。
 *
 * 约束（本件守护）：**容器级选择器**（外壳/滚动区/网格/卡片/日志/状态栏…）的
 *   `width|height|min/max-width|min/max-height|padding|margin|gap` 不得出现裸 px，
 *   必须用 `clamp() / min() / max() / % / vh·vw / var(--sc-*)`。
 *   组件级尺寸（按钮高度、控件内距、图标边长）**不受限**——那些本就该固定。
 *
 * 例外必须登记在 ALLOW 并写明理由（宁可显式声明，不可静默写死）。
 * 用法：node scripts/check-layout-px.mjs [--selftest]
 *   --selftest 反向证伪：往容器里塞死值必须被抓到，写 clamp()/白名单必须放行。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'client.js')

/* 容器级选择器：**末段简单选择器**须为容器本身（否则 `.sc-nav-item svg` 会误判） */
const CONTAINER = /(^|[\s>+~,])(#scpanl-modal|#scpanl-mask|\.sc-view|\.sc-main|\.sc-nav|\.sc-logwrap|\.sc-card-body|\.sc-fold|\.sc-tabbox|\.sc-tabpanes|\.sc-kpis|\.sc-opgrid|\.sc-mem-grid|\.sc-statusbar|\.sc-log-head)$/
const PROPS = ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'padding', 'margin', 'gap']
const ALLOW = {
  '.sc-kpi-val{min-height}': 'KPI 数值行等高：四卡数值/文字混排时靠它保证进度条共线（v9 实测要求）',
  '.sc-kpi-sub{min-height}': 'KPI 副行等高：同上，避免换行把条推走',
  '.sc-log-lv{width}': '日志级别列定宽：三列对齐（时间/级别/消息）需要，属列宽非容器',
  '.sc-statusbar{min-height}': '状态栏最小高度：单行文本条自身高度（内容高了可撑开），属组件高度非容器挤压'
}

/** 扫描一段 CSS 文本，返回违规清单 */
export function scan (css) {
  const rules = []
  const re = /([^{}@]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(css))) {
    const sel = (m[1] || '').trim()
    if (sel) rules.push({ sel, body: m[2] || '' })
  }
  const hits = []
  rules.forEach((r) => {
    const parts = r.sel.split(',').map((x) => x.trim().replace(/::?[a-z-]+(\([^)]*\))?/g, ''))
    if (!parts.some((p) => CONTAINER.test(p))) return
    PROPS.forEach((p) => {
      const rx = new RegExp('(^|;)\\s*' + p + '\\s*:\\s*([^;}]+)', 'g')
      let x
      while ((x = rx.exec(r.body))) {
        const val = x[2].trim()
        if (!/\d+px/.test(val)) continue
        if (/clamp\(|min\(|max\(|calc\(|var\(/.test(val)) continue
        if (/^(0|1px|2px)(\s|$)/.test(val)) continue
        const key = r.sel.replace(/^#scpanl-root\s*/, '') + '{' + p + '}'
        if (ALLOW[key]) continue
        hits.push({ sel: r.sel, prop: p, val })
      }
    })
  })
  return { hits, ruleCount: rules.length, cssLen: css.length }
}

function readCss () {
  const text = readFileSync(SRC, 'utf8')
  const mCss = /window\.__SC_CSS__\s*=\s*(\[[\s\S]*?\]\.join\(\s*['"]['"]\s*\))/.exec(text)
  if (!mCss) throw new Error('未找到 CSS 数组稳定锚点 window.__SC_CSS__')
  // eslint-disable-next-line no-eval
  const css = eval(mCss[1])
  return css
}

/* ── 反向证伪（证明改坏了会翻红，而不是一个永远绿的门禁） ── */
if (process.argv.includes('--selftest')) {
  let pass = 0, fail = 0
  const ok = (m) => { pass++; console.log('  ✅ ' + m) }
  const bad = (m) => { fail++; console.log('  ❌ ' + m) }
  console.log('容器级布局尺寸门禁 · 反向证伪')
  const base = readCss()
  scan(base).hits.length === 0 ? ok('① 基线：真实 client.js 通过') : bad('① 基线未通过')
  const m1 = scan(base + '\n#scpanl-root .sc-view{width:1000px;}').hits
  m1.length === 1 ? ok('② 塞入 `.sc-view{width:1000px}` → 被抓到') : bad('② 未抓到（' + m1.length + '）')
  const m2 = scan(base + '\n#scpanl-root .sc-logwrap{height:300px;}').hits
  m2.length === 1 ? ok('③ 塞入 `.sc-logwrap{height:300px}` → 被抓到') : bad('③ 未抓到（' + m2.length + '）')
  scan(base + '\n#scpanl-root .sc-view{width:clamp(320px,60vw,1200px);}').hits.length === 0
    ? ok('④ clamp() 写法放行（不误报）') : bad('④ clamp() 被误报')
  scan(base + '\n#scpanl-root .sc-view{width:min(1480px,96vw);}').hits.length === 0
    ? ok('⑤ min() 写法放行（不误报）') : bad('⑤ min() 被误报')
  scan(base + '\n#scpanl-root .sc-kpi-val{min-height:40px;}').hits.length === 0
    ? ok('⑥ 白名单（已写明理由）放行') : bad('⑥ 白名单未生效')
  scan(base + '\n#scpanl-root .sc-nav-item svg{width:16px;}').hits.length === 0
    ? ok('⑦ 组件后代（.sc-nav-item svg）不误判为容器') : bad('⑦ 组件后代被误判')
  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '（' + pass + ' pass · ' + fail + ' fail）')
  process.exit(fail === 0 ? 0 : 1)
}

const cssText = readCss()
/* 花括号配平（2026-09-13 立，三次复发）：一条未闭合的规则会把**其后所有规则**吞进它的块里，
 *   浏览器随即整块丢弃 ⇒ 表现为「网格塌陷 + 大面积缺样式」，而语法检查（node --check）完全看不见（CSS 是字符串）。
 *   故在抽取 CSS 后直接数括号：不配平即失败并指出差值。 */
{
  const open = (cssText.match(/\{/g) || []).length
  const close = (cssText.match(/\}/g) || []).length
  if (open !== close) {
    console.error('  ❌ CSS 花括号不配平：{ ×' + open + ' vs } ×' + close + '（差 ' + (open - close) + '）' +
      ' —— 极可能有一条规则未闭合，会吞掉其后全部规则')
    process.exit(1)
  }
}
const { hits, ruleCount, cssLen } = scan(cssText)
console.log('容器级布局尺寸门禁（client.js CSS ' + cssLen + ' 字符 · 规则 ' + ruleCount + ' 条 · 花括号配平 ' + (cssText.match(/\{/g) || []).length + ' 对）')
if (hits.length === 0) {
  console.log('  ✅ 容器级选择器无裸 px 布局尺寸（' + Object.keys(ALLOW).length + ' 条例外已登记理由）')
  process.exit(0)
}
hits.forEach((h) => console.log('  ❌ ' + h.sel + ' { ' + h.prop + ': ' + h.val + ' }  —— 容器级尺寸必须用 clamp()/min()/%/vh/var()'))
console.log('\n若有正当理由，请登记到 scripts/check-layout-px.mjs 的 ALLOW 并写明原因（不允许静默写死）。')
process.exit(1)
