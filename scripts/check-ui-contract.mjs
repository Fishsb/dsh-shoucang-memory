/**
 * UI 契约机检（2026-09-12 UI 重构配套）
 *
 * 背景：本轮审查发现 `src/panel.ts` 有 34 个 route 端点，其中 6 个在 `client.js` 中
 * 完全无引用 —— 后端实现了、界面上不可达（"死角入口"）。这类缺口没有任何门禁能发现，
 * 只能靠人工逐个比对。本件把该比对自动化，作为长期护栏。
 *
 * 检查项：
 *   ① client.js 语法可解析（node --check）
 *   ② UI 基础设施层符号齐备（Bus/Store/Log/Prog/Cfg/UI 等）
 *   ③ 视图注册表 VIEWS 与 show() 分派一致（登记了就必须能渲染）
 *   ④ **端点覆盖：panel.ts 的每个 route 端点都必须在 client.js 中被引用**
 *      —— 未被引用的端点若是"有意不暴露"，须加入下方 ALLOW_NO_ENTRY 白名单并写明理由，
 *         否则判 FAIL（宁可显式声明，不可静默遗漏）。
 *   ⑤ 界面设置项必须在 UI 中可见（防止"可配但没入口"）
 */

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')
const PANEL = join(ROOT, 'src', 'panel.ts')

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

console.log('UI 契约机检（client.js ↔ src/panel.ts）')

if (!existsSync(CLIENT)) { bad('找不到 client.js'); summary() }
if (!existsSync(PANEL)) { bad('找不到 src/panel.ts'); summary() }

const clientSrc = readFileSync(CLIENT, 'utf8')
const panelSrc = readFileSync(PANEL, 'utf8')

/* ---------- ① 语法 ---------- */
try {
  execFileSync(process.execPath, ['--check', CLIENT], { stdio: 'pipe' })
  ok('client.js 语法可解析')
} catch (e) {
  bad('client.js 语法错误: ' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' '))
}

/* ---------- ② 基础设施层符号 ---------- */
const INFRA = ['Bus', 'Store', 'Log', 'Prog', 'Cfg', 'UI', 'apiCtx', 'buildLogPanel',
  'renderViewObserve', 'renderViewSettings', 'collectMetrics',
  'applyDensity', 'applyNavWidth', 'applyLogPanel', 'restartPolling', 'installShortcuts']
const missingInfra = INFRA.filter((n) => !new RegExp('(function\\s+' + n + '\\b|var\\s+' + n + '\\s*=)').test(clientSrc))
if (missingInfra.length === 0) ok('UI 基础设施层符号齐备（' + INFRA.length + ' 个）')
else bad('缺少基础设施符号: ' + missingInfra.join(', '))

/* ---------- ③ VIEWS 与 show() 分派一致 ---------- */
const vm = clientSrc.match(/var VIEWS = \[([\s\S]*?)\];/)
const viewNames = vm ? (vm[1].match(/\['([a-z0-9_-]+)'/g) || []).map((s) => s.slice(2, -1)) : []
if (!viewNames.length) bad('未能解析 VIEWS 注册表')
else {
  const showBody = clientSrc.slice(clientSrc.indexOf('function show(name)'), clientSrc.indexOf('function show(name)') + 4000)
  const undisp = viewNames.filter((n) => showBody.indexOf("name === '" + n + "'") < 0)
  if (undisp.length === 0) ok('VIEWS 全部有 show() 分派（' + viewNames.length + ' 个视图）')
  else bad('VIEWS 登记但 show() 无分派（点击后空白）: ' + undisp.join(', '))
}

/* ---------- ④ 端点覆盖（核心护栏） ---------- */
// 有意不在 UI 暴露的端点：必须写明理由，否则不得列入
const ALLOW_NO_ENTRY = {
  // 例：'/internal/xxx': '仅脚本调用，UI 不暴露'
}

const endpoints = [...new Set((panelSrc.match(/route\('\/[a-zA-Z0-9\/_-]*'/g) || []).map((s) => s.slice(7, -1)))]
  .sort()
if (!endpoints.length) bad('未能从 panel.ts 解析出任何端点')
else {
  const noEntry = endpoints.filter((ep) => {
    if (Object.prototype.hasOwnProperty.call(ALLOW_NO_ENTRY, ep)) return false
    // client.js 中可能带查询串拼接（如 '/memory/sections?rel=' + …），故按前缀匹配
    return clientSrc.indexOf("'" + ep) < 0 && clientSrc.indexOf('"' + ep) < 0
  })
  const allowed = endpoints.filter((ep) => Object.prototype.hasOwnProperty.call(ALLOW_NO_ENTRY, ep))
  console.log('  端点总数: ' + endpoints.length + ' · 有 UI 入口: ' + (endpoints.length - noEntry.length - allowed.length) +
    ' · 白名单豁免: ' + allowed.length + ' · 无入口: ' + noEntry.length)
  if (noEntry.length === 0) ok('所有端点均可在 UI 触达（无死角入口）')
  else noEntry.forEach((ep) => bad('端点无 UI 入口（后端已实现但界面不可达）: ' + ep))
  allowed.forEach((ep) => console.log('  ⚠ 白名单豁免: ' + ep + ' —— ' + ALLOW_NO_ENTRY[ep]))
}

/* ---------- ⑤ 前端产物同步（client.js → lib/client.js） ---------- */
// 坑：package.json 的 pretest 只跑 build:host（tsc），**不含 build:client**。
//    ⇒ 改了 client.js 后 npm test 不会把它复制进 lib/，而插件发布的是 lib/（files 含 lib）。
//    ⇒ 表现为"改了源码却没生效"，且无任何门禁报错。本项常驻比对，发现漂移即 FAIL。
const LIB_CLIENT = join(ROOT, 'lib', 'client.js')
if (existsSync(LIB_CLIENT)) {
  // 归一化换行后比对：仓内为 CRLF，npm 发布后会被规范化为 LF，逐字节比对会产生假红。
  const norm = (s) => s.replace(/\r/g, '')
  const a = norm(readFileSync(LIB_CLIENT, 'utf8'))
  const b = norm(clientSrc)
  if (a === b) ok('前端产物已同步（lib/client.js 与 client.js 一致，换行符已归一化）')
  else bad('前端产物漂移：lib/client.js 与 client.js 不一致 —— 请执行 npm run build:client')
} else {
  bad('缺少 lib/client.js（前端产物未构建）')
}

/* ---------- ⑥ 递归防护（P0 回归护栏） ---------- */
// 实测踩坑：status() 写日志 → Log.add() 遇 error 回调 status() → 无限递归 → RangeError 栈溢出，
//   任何 error 级状态都会让面板崩溃。解耦方式：抽出 setStatusText() 只更新 DOM，
//   status() = setStatusText + Log.add；Log.add 内部只允许调用 setStatusText。
// 用确定性的区段切分（var Log = … 到 var Prog），避免贪婪正则越界误报
const logStart = clientSrc.indexOf('var Log = ')
const logEnd = clientSrc.indexOf('var Prog')
if (logStart >= 0 && logEnd > logStart) {
  // 先剥注释（说明文字里可能提到 status()，不能当代码判定），再去 setStatusText(
  const seg = clientSrc.slice(logStart, logEnd)
    .replace(/\/\*[\s\S]*?\*\//g, '')   // 块注释
    .replace(/^\s*\/\/.*$/gm, '')       // 行注释
  const stripped = seg.replace(/setStatusText\(/g, '')
  if (/status\(/.test(stripped)) {
    bad('Log 区段内回调了 status() —— 会导致 status↔Log 无限递归（栈溢出），应改用 setStatusText()')
  } else {
    ok('无 status↔Log 递归（Log 区段仅用 setStatusText 更新状态栏）')
  }
} else {
  bad('未能定位 Log 区段，无法校验递归防护')
}
if (/function setStatusText\(/.test(clientSrc)) ok('存在 setStatusText() 解耦函数')
else bad('缺少 setStatusText() —— status 与 Log 无法解耦，递归风险')

/* ---------- ⑦ 界面设置项可见 ---------- */
const CFG_KEYS = ['density', 'navWidth', 'autoRefresh', 'refreshMs', 'showLogs', 'logLevel', 'overviewMode', 'maxRows']
const hiddenCfg = CFG_KEYS.filter((k) => clientSrc.indexOf("'" + k + "'") < 0)
if (hiddenCfg.length === 0) ok('界面设置项全部在 UI 暴露（' + CFG_KEYS.length + ' 项）')
else bad('设置项已定义但 UI 无入口: ' + hiddenCfg.join(', '))

summary()

function summary() {
  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
  process.exit(fail === 0 ? 0 : 1)
}
