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
 *   ⑤ 界面设置项必须在 UI 中可见（防止"可配但没入口"；新增界面设置项须同步本数组）
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { clientSource } from './lib-client-src.mjs'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')
// ⚠ 2026-09-12：panel.ts 已按领域拆为 panel-shared/config/memory/observe/inject，
//   端点散在各模块 —— 只扫 panel.ts 会得到「0 个端点」的假结论。这里扫**全部** panel 模块。
const PANEL_DIR = join(ROOT, 'src')
const PANEL_FILES = readdirSync(PANEL_DIR).filter((f) => /^panel.*\.ts$/.test(f)).sort()
const PANEL = join(PANEL_DIR, 'panel.ts')

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

console.log(`UI 契约机检（client.js ↔ src/panel*.ts · ${PANEL_FILES.length} 个模块）`)

if (!existsSync(CLIENT)) { bad('找不到 client.js'); summary() }
if (!PANEL_FILES.length) { bad('找不到 src/panel*.ts'); summary() }

/* UI1/U1（2026-09-15）：源码级断言改读**源码拼接**（原读产物 `client.js` —— esbuild 会重排/改名，
 * 且抽服务后 `UI` 等符号已不在产物同一处）。`CLIENT` 仍保留：它还兼作产物同步检查。 */
const clientSrc = clientSource(ROOT)
const panelSrc = PANEL_FILES.map((f) => readFileSync(join(PANEL_DIR, f), 'utf8')).join('\n')

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

/* ---------- ②b UI 成员与调用点一致（派生式 · 2026-09-13 教训固化） ----------
 * 背景：一次「整段切片替换」把夹在中间的 UI.kpi 一起删掉，总览页 KPI 全消失，
 *   而当时**所有静态门禁仍全绿**（语法合法、CSS 无死规则、契约检查不查成员表）——
 *   只有渲染级回归抓到。此处把「UI 必须提供哪些原语」变成机检，缺一即红。
 * 注意：对象字面量**键名不会被压缩器重命名**，故对产物同样有效（正则容忍空白/引号）。 */
/* **派生式**检查（2026-09-13 二次教训）：不再手写"应该有哪些成员"的名单——
 * 上一版名单是从**已经损坏的源码**里抄的，等于自证，于是 UI.collapsible 整块消失（17 处调用全抛
 * TypeError、设置/观测等视图渲染中断）而门禁全绿。改为：**从调用点反查定义**，
 * 凡源码里出现 `UI.x(` 的，UI 对象就必须有 x（定义侧从 UI 对象花括号切片里取，避免误收同名键）。 */
const uiUsed = new Set()
{
  const re = /\bUI\.([A-Za-z_$][\w$]*)\s*\(/g
  let m
  while ((m = re.exec(clientSrc)) !== null) uiUsed.add(m[1])
}
const uiDefined = new Set()
{
  const at = clientSrc.search(/\bUI\s*=\s*\{/)
  if (at >= 0) {
    let i = clientSrc.indexOf('{', at)
    let depth = 0
    let end = i
    for (; end < clientSrc.length; end++) {
      const c = clientSrc[end]
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { end++; break } }
    }
    const body = clientSrc.slice(i, end)
    const re = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*function/g
    let m
    while ((m = re.exec(body)) !== null) uiDefined.add(m[1])
  }
}
const uiMissing = [...uiUsed].filter((k) => !uiDefined.has(k))
if (uiMissing.length === 0) ok('UI 成员与调用点一致（用到 ' + uiUsed.size + ' 个，均已定义）')
else bad('UI 成员缺失（渲染时会抛 TypeError）：' + uiMissing.join(', '))

/* ---------- ③ VIEWS 与 show() 分派一致 ---------- */
/* 引号无关（S3）：产物经 esbuild 重排后可能用双引号/不同空白 —— 文本门禁不得依赖引号风格 */
const vm = clientSrc.match(/var VIEWS = \[([\s\S]*?)\]\s*;/)
const viewNames = vm ? (vm[1].match(/\[\s*['"]([a-z0-9_-]+)['"]/g) || []).map((s) => s.replace(/^\[\s*['"]/, '').replace(/['"]$/, '')) : []
if (!viewNames.length) bad('未能解析 VIEWS 注册表')
else {
  const showBody = clientSrc.slice(clientSrc.indexOf('function show(name)'), clientSrc.indexOf('function show(name)') + 4000)
  const hasStr = (src, s) => src.indexOf("'" + s + "'") >= 0 || src.indexOf('"' + s + '"') >= 0
  const undisp = viewNames.filter((n) => !(showBody.indexOf("name === '" + n + "'") >= 0 || showBody.indexOf('name === "' + n + '"') >= 0))
  if (undisp.length === 0) ok('VIEWS 全部有 show() 分派（' + viewNames.length + ' 个视图）')
  else bad('VIEWS 登记但 show() 无分派（点击后空白）: ' + undisp.join(', '))
}

/* ---------- ④ 端点覆盖（核心护栏） ---------- */
// 有意不在 UI 暴露的端点：必须写明理由，否则不得列入
const ALLOW_NO_ENTRY = {
  // 例：'/internal/xxx': '仅脚本调用，UI 不暴露'
  // UI1/U1（2026-09-15）：本门改读**源码拼接**后变准，暴露此端点**确实没有 UI 入口** ——
  //   此前读产物 `client.js`，而契约被挂全局 `window.__SC_CONTRACT__` ⇒ 产物里必然含该串
  //   ⇒ 被误判为"有入口"（**产物掩盖了真问题**）。改源码后它才浮出来。
  //   `/content-types` 是 S0 内容类型契约的**查询端点**，供诊断/开发核对「类型边界」用，
  //   面板无对应视图 —— 属**有意不暴露**。
  '/content-types': 'S0 内容类型契约查询端点，供诊断/开发用；面板无对应视图（有意不暴露）',
}

const endpoints = [...new Set((panelSrc.match(/route\('\/[a-zA-Z0-9\/_-]*'/g) || []).map((s) => s.slice(7, -1)))]
  .sort()
if (!endpoints.length) bad('未能从 src/panel*.ts 解析出任何端点')
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
  // ⚠ **本段必须独立读产物**（不能用上面的 `clientSrc`）：`clientSrc` 自 UI1/U1 起指向
  //   **源码拼接**（供源码级断言用）；拿它比产物 ⇒ 得到"源码 ≠ 产物"的**必然**不一致（实测假红）。
  //   教训：源码级断言与产物级断言**必须用两个不同的变量**，否则一改就互相污染。
  const b = norm(readFileSync(CLIENT, 'utf8'))
  if (a === b) ok('前端产物已同步（lib/client.js 与 client.js 一致，换行符已归一化）')
  else bad('前端产物漂移：lib/client.js 与 client.js 不一致 —— 请执行 npm run build:client')
} else {
  bad('缺少 lib/client.js（前端产物未构建）')
}

/* ---------- ⑥ 递归防护（P0 回归护栏 · UI1/U1 2026-09-15 改为**更强断言**） ---------- */
// 实测踩坑：status() 写日志 → Log.add() 遇 error 回调 status() → 无限递归 → RangeError 栈溢出，
//   任何 error 级状态都会让面板崩溃。解耦方式：抽出 setStatusText() 只更新 DOM，
//   status() = setStatusText + Log.add；Log.add 内部**只允许**碰 setStatusText。
//
// ⚠ **为什么改断言**：U1 把 `Log` 抽到 `src-client/state.js` ⇒ 闭包被打破 ⇒ 原实现（直接引用
//   `setStatusText`）会变成 ESM 里的**自由变量**（产物中实测被 esbuild 改名为 `setStatusText2`，
//   说明它真的跨模块了 ⇒ 运行到 error 分支即 ReferenceError，属**潜伏 bug**）。
//   现改为**显式注入**，故断言也改为**正面锁定**（比旧的"区段内没提到 status(" 更直接）：
//     ① `state.js` 的 Log 块内不得出现 `status(`（防递归）；
//     ② `body.js` 里 `setLogStatusSink(...)` 的实参**必须是 `setStatusText`**（不得是 `status`）。
{
  const CLIENT_SRC = join(ROOT, 'src-client', 'state.js')
  const BODY_SRC = join(ROOT, 'src-client', 'body.js')
  if (!existsSync(CLIENT_SRC) || !existsSync(BODY_SRC)) {
    bad('未能定位 src-client/{state,body}.js，无法校验递归防护')
  } else {
    const st = readFileSync(CLIENT_SRC, 'utf8')
    const bd = readFileSync(BODY_SRC, 'utf8')
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // ① Log 块内不得出现裸 status(
    const ls = st.indexOf('export const Log = ')
    const le = st.indexOf('export const Prog') > ls ? st.indexOf('export const Prog') : st.length
    const seg = strip(st.slice(ls < 0 ? 0 : ls, le))
    const segNoSink = seg.replace(/statusSink\(/g, '')
    if (/[^A-Za-z_]status\(/.test(segNoSink)) {
      bad('state.js 的 Log 区段内回调了 status() —— 会导致 status↔Log 无限递归（栈溢出），应改用注入的 statusSink')
    } else {
      ok('无 status↔Log 递归（Log 区段仅经注入的 statusSink 更新状态栏）')
    }
    // ② 注入的实参必须是 setStatusText
    const m = bd.match(/setLogStatusSink\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/)
    if (!m) bad('body.js 未注入状态栏写入器（setLogStatusSink(...) 缺失）⇒ Log 的 error 分支将静默失效')
    else if (m[1] !== 'setStatusText') bad(`注入的是 \`${m[1]}\` —— 必须是 \`setStatusText\`（注入 status 会造成无限递归）`)
    else ok('注入的状态栏写入器 = setStatusText（非 status ⇒ 递归护栏成立）')
  }
}
if (/function setStatusText\(/.test(clientSrc)) ok('存在 setStatusText() 解耦函数')
else bad('缺少 setStatusText() —— status 与 Log 无法解耦，递归风险')

/* ---------- ⑦ 界面设置项可见 ---------- */
const CFG_KEYS = ['density', 'navWidth', 'autoRefresh', 'refreshMs', 'showLogs', 'logLevel', 'overviewMode', 'maxRows', 'startView']
const hiddenCfg = CFG_KEYS.filter((k) => !(clientSrc.indexOf("'" + k + "'") >= 0 || clientSrc.indexOf('"' + k + '"') >= 0))
if (hiddenCfg.length === 0) ok('界面设置项全部在 UI 暴露（' + CFG_KEYS.length + ' 项）')
else bad('设置项已定义但 UI 无入口: ' + hiddenCfg.join(', '))

summary()

function summary() {
  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
  process.exit(fail === 0 ? 0 : 1)
}
