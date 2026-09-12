/**
 * 展开/收起状态机（Fold）行为测试 + 反模式回归锁
 *
 * 背景：面板里曾并存 4 套折叠实现，状态分别存在 DOM class / 闭包变量 / 局部变量，
 *       其中 notes 小节树甚至**从 DOM 反推开合**（`!body.classList.contains('sc-hidden')`），
 *       导致重绘失同步、嵌套项相互影响、保存后整棵树塌回。本件锁住重构后的两条不变量：
 *
 *   A. 行为：Fold 是唯一数据源 —— 默认值 / toggle / 同值不广播 / 按前缀清空 / key 互不串
 *   B. 反模式：源码里不得再出现「把 DOM 当作状态来源」「用 setTimeout 延迟收口」
 *
 * ⚠ A 段不是复制一份实现来测，而是**从 client.js 原地抽出 Fold 模块求值执行**
 *   （与 gen-ui-preview.mjs 抽 CSS 同法）—— 保证测的就是线上那份代码，改了源码必然被测到。
 *   不引入 jsdom / 测试框架：Fold 只依赖 Bus.emit，用桩即可。
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')
const src = readFileSync(CLIENT, 'utf8')

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }
const section = (m) => console.log('\n── ' + m + ' ──')

console.log('折叠状态机 Fold / 反模式回归锁（client.js）')

/* ══════════ A. 行为：抽出真实 Fold 模块执行 ══════════ */
section('A. Fold 行为（从 client.js 原地抽取）')

/** 从源码里按大括号配平截取 `var Fold = (function () { ... })();` */
function extractFold(text) {
  const at = text.indexOf('var Fold = (function ()')
  if (at < 0) return null
  const open = text.indexOf('{', at)
  let d = 0, i = open
  for (; i < text.length; i++) {
    if (text[i] === '{') d++
    else if (text[i] === '}') { d--; if (d === 0) break }
  }
  // 找到 `})();` 结束
  const endTok = '})();'
  const end = text.indexOf(endTok, i)
  if (end < 0) return null
  return text.slice(at, end + endTok.length)
}

/** 用真实源码构建 Fold；log 收集所有广播，用于断言「同值不广播」 */
function buildFold(override) {
  const body = override || foldSrc
  // eslint-disable-next-line no-eval
  return eval('(function(){ var log=[]; var Bus={emit:function(k,p){log.push({k:k,p:p});}}; ' +
    body + '; return { Fold: Fold, log: log }; })()')
}

const foldSrc = extractFold(src)
if (!foldSrc) {
  bad('未能从 client.js 抽出 Fold 模块 —— 结构变了？')
} else {
  const { Fold, log } = buildFold()
  ok('Fold 模块可独立求值（无 DOM 依赖）')

  // 默认值：未登记 ⇒ 返回调用方默认值，且**不**落库（否则默认值会被固化，默认展开项失效）
  const before = Fold.size()
  if (Fold.get('a', true) === true && Fold.get('a', false) === false && Fold.size() === before) ok('未登记时返回调用方默认值，且不写入（默认展开项不被固化）')
  else bad('默认值语义错误：get 应只读取不落库')

  // toggle
  if (Fold.toggle('a', false) === true && Fold.get('a') === true) ok('toggle 首次取反默认值并落库')
  else bad('toggle 首次行为错误')
  if (Fold.toggle('a', false) === false && Fold.get('a') === false) ok('toggle 二次回到 false')
  else bad('toggle 二次行为错误')

  // 同值不广播（防 paint ↔ set 回环：set 广播 → 订阅者 sync → 再 set → 再广播…）
  Fold.set('same', true)
  const n1 = log.length
  Fold.set('same', true) // 同值
  if (log.length === n1) ok('同值写入不广播（幂等，切断 paint↔set 回环）')
  else bad('同值写入仍广播 —— 会与订阅者形成回环')
  Fold.set('same', false) // 变值
  if (log.length === n1 + 1 && Fold.get('same') === false) ok('变值写入广播一次且落库')
  else bad('变值写入广播次数异常')

  // key 互不串（嵌套项 / 兄弟同名不互相影响）
  Fold.set('note:x.md:§A', true)
  Fold.set('note:x.md:§A/§B', false)
  Fold.set('note:y.md:§A', false)
  if (Fold.get('note:x.md:§A') === true && Fold.get('note:x.md:§A/§B') === false && Fold.get('note:y.md:§A') === false) ok('key 精确隔离：父子同名 / 跨笔记同名互不串状态')
  else bad('key 隔离失败（嵌套项会互相影响）')

  // 按前缀清空（换数据源清残）
  const n0 = Fold.size()
  const cleared = Fold.clear('note:x.md:')
  if (cleared === 2 && Fold.get('note:y.md:§A') === false && n0 - Fold.size() === 2) ok('clear(prefix) 只清该前缀，其余键保留（防跨数据源状态残留）')
  else bad('clear(prefix) 语义错误：cleared=' + cleared)

  // 全清
  Fold.clear()
  if (Fold.size() === 0) ok('clear() 全清')
  else bad('clear() 未清空：剩余 ' + Fold.size())

  /* 反向证伪：把「同值短路」删掉后，同值写入必须**重新广播** —— 证明上面那条判据不是空转，
     而是真的在拦截「删掉就会回环」的回归。只断言"源码与原来不同"是假证伪。 */
  const ANCHOR = 'if (hasOwn.call(m, s) && m[s] === next) return next;'
  if (foldSrc.indexOf(ANCHOR) < 0) {
    bad('未能定位「同值不广播」语句 —— 判据锚点丢失，测试在空转')
  } else {
    const broken = foldSrc.replace(ANCHOR, '/* 短路已删除 */')
    const b = buildFold(broken)
    b.Fold.set('x', true)
    const m1 = b.log.length
    b.Fold.set('x', true)
    if (b.log.length === m1 + 1) ok('反向证伪有效：删掉同值短路后，同值写入会重复广播（原版不广播）')
    else bad('反向证伪未翻红 —— 该判据可能在空转')
  }
}

/* ══════════ B. 反模式回归锁 ══════════ */
section('B. 反模式：不得再把 DOM 当状态来源')

// B1：不允许用 classList.contains 来**判定**开合。
//   注意排除注释行——本文件里就有一段注释在引用旧代码做说明，按行首 `*` 过滤。
const domAsSource = (src.match(/var\s+open\s*=\s*![^;]*classList\.contains/g) || [])
  .filter((m) => {
    const line = src.slice(0, src.indexOf(m)).split('\n').pop().trim()
    return !line.startsWith('*') && !line.startsWith('/*')
  })
if (domAsSource.length === 0) ok('无「从 DOM 反推开合态」的写法（旧小节树病根）')
else bad('仍存在从 DOM class 反推 open 的代码: ' + domAsSource.join(' | ').slice(0, 120))

// B2：折叠收口不得再用 setTimeout（抖动闪烁的来源）
const foldTimeout = (src.match(/setTimeout\([^)]*scheduleFold/g) || [])
if (foldTimeout.length === 0) ok('折叠收口不再走 setTimeout（消除"先铺开再收起"的抖动）')
else bad('仍存在 setTimeout(scheduleFold) —— 会跨任务边界导致闪动')

/* B3：折叠体的显隐只允许写在**由 Fold 驱动**的 paint 里。
   判定：每处 `toggle('sc-hidden', !open)` 的**外层函数体**必须引用 Fold
   —— 单看这行样式无法区分「正规 paint」与「私有闭包实现」，故往上找函数边界。 */
const manualToggle = []
{
  // ⚠ 正则必须在循环外创建：在 while 条件里写字面量会每次重建、lastIndex 归零 ⇒ 死循环
  const re = /classList\.toggle\('sc-hidden',\s*!\s*\w+\)/g
  let m
  while ((m = re.exec(src)) !== null) {
    const at = m.index
    const fnStart = src.lastIndexOf('function', at)
    const win = fnStart < 0 ? '' : src.slice(fnStart, at + 4000)
    if (win.indexOf('Fold.') < 0) manualToggle.push(src.slice(at, at + 48))
  }
}
if (manualToggle.length === 0) ok('所有 sc-hidden 显隐都由 Fold 驱动（无私有闭包实现）')
else bad('存在非 Fold 驱动的私有折叠实现: ' + manualToggle.join(' | '))

// B4：关键符号齐备 + 生命周期边界（换视图清、同视图留）
const need = ['var Fold = ', 'function deferFold', 'function flushFolds', 'function secFoldKey']
const miss = need.filter((s) => src.indexOf(s) < 0)
if (miss.length === 0) ok('折叠基础设施符号齐备（Fold / deferFold / flushFolds / secFoldKey）')
else bad('缺少符号: ' + miss.join(', '))

if (src.indexOf('if (currentView !== name) Fold.clear();') >= 0) ok('生命周期边界：仅换视图时 clear（同视图重绘保留开合态）')
else bad('未找到「换视图才 clear」的边界处理')

// B5：UI.fold 必须支持三种边界
const foldOptSrc = src.slice(src.indexOf('fold: function (opts)'), src.indexOf('collapsible: function (title'))
;['disabled', 'emptyText', 'sc-loading'].forEach((k) => {
  if (foldOptSrc.indexOf(k) >= 0) ok('UI.fold 支持边界：' + k)
  else bad('UI.fold 缺少边界处理: ' + k)
})

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
process.exit(fail ? 1 : 0)
