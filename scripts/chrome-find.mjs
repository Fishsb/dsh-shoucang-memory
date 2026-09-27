/**
 * chrome-find.mjs — **浏览器探测的唯一实现**（2026-09-26 U1 抽取）
 *
 * ## 判因（实测，非推断）
 *
 * 仓内原有 **8 件**脚本各自写了一份「候选数组 + PATH 探测」：
 *   ui-geo-regress / test-panel-view-contract / test-idxrow-pills / panel-shot-real /
 *   i18n-parity / i18n-probe / i18n-smoke / test-i18n-render
 * 它们**全部只查固定系统路径与 PATH**，都不查 puppeteer 缓存 ⇒ 在主力环境（WSL）里
 * Ubuntu 26.04 的 `chromium` 包**无候选**（只有 snap 过渡包、WSL 内不可用）
 * ⇒ 每一件都退 exit 4「环境缺件」。
 *
 * 后果是**失败不可观测**：`ui-geo-regress` 被 `check-runner` 登记成 `xfail: true` 承接，
 * 于是 AGENTS 规则 7 第④条「渲染级证据」**长期无人执行**；`test-panel-view-contract` 退 4
 * 又反过来让 `test-split-equivalence` 的 A1/A3c 断言**恒失败**（它要求该件能报 PASS）。
 * 一处探测盲区 → 三件测试连环失效。
 *
 * ## 本模块做什么
 *
 * 把探测收敛为**一份**实现，覆盖真实的安装方式：
 *   ① 显式环境变量 `CHROME_PATH`（CI/自备二进制入口）
 *   ② Windows 侧常见安装位（由 `PROGRAMFILES` / `LOCALAPPDATA` 派生，**不写死盘符**）
 *   ③ 系统 PATH 里的 chrome/chromium/msedge
 *   ④ **puppeteer 缓存**（`~/.cache/puppeteer/chrome/<ver>/chrome-linux64/chrome`，由 homedir 枚举）
 *      ⚠ 本行刻意用 `<ver>` 而非通配符：注释里写 `*` + `/` 会**提前闭合块注释**（实测踩过）
 *   ⑤ `PUPPETEER_CHROME` 显式指定
 *
 * ## 红线
 *
 * · **零硬编码本机路径**：一律由环境变量与 homedir 派生（守 `check-hardcode`）。
 * · 找不到时**返回 null**，由调用方决定怎么表达（退 4 / 退 1 各有语义，本模块不替它决定）。
 *
 * ## 另一条同族教训（调用方须守）
 *
 * 找到二进制**不等于**能跑。Linux/无 X/无 DBus 环境下，Chrome 154 **只要显式给
 * `--user-data-dir` 就会卡死 ~45s 后被杀、输出为空**（实测对照：给了 45,132ms/0B；
 * 不给 1,118ms/60B）。故本模块同时导出 {@link runChrome}，把**参数组合**也收敛为一处 ——
 * 各件自己拼参数正是这条坑的来源。
 */
import { existsSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'

/**
 * 探测可用的 Chromium 系浏览器。
 * @returns {string|null} 可执行文件绝对路径；找不到返回 null。
 */
export function findChrome () {
  const PF = process.env.PROGRAMFILES || ''
  const PF86 = process.env['PROGRAMFILES(X86)'] || ''
  const LOCAL = process.env.LOCALAPPDATA || ''
  const j = (base, rest) => (base ? base.replace(/\\/g, '/') + '/' + rest : '')

  const candidates = [
    process.env.CHROME_PATH,
    j(PF, 'Google/Chrome/Application/chrome.exe'),
    j(PF86, 'Google/Chrome/Application/chrome.exe'),
    j(PF86, 'Microsoft/Edge/Application/msedge.exe'),
    j(PF, 'Microsoft/Edge/Application/msedge.exe'),
    j(LOCAL, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    ...puppeteerCacheCandidates()
  ].filter(Boolean)

  const hit = candidates.find((p) => existsSync(p))
  if (hit) return hit

  for (const name of ['chrome', 'google-chrome', 'chromium', 'msedge']) {
    try {
      const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim()
      if (out && existsSync(out)) return out
    } catch (e) { /* 未安装 */ }
  }
  return null
}

/** puppeteer 自带 Chromium 的缓存落点（由 homedir 枚举，不写死路径）。 */
export function puppeteerCacheCandidates () {
  const out = []
  if (process.env.PUPPETEER_CHROME) out.push(process.env.PUPPETEER_CHROME)
  const base = join(homedir(), '.cache', 'puppeteer', 'chrome')
  try {
    for (const d of readdirSync(base)) {
      const p = join(base, d, 'chrome-linux64', 'chrome')
      if (existsSync(p)) out.push(p)
    }
  } catch (e) { /* 未装 puppeteer：无候选，不报错 */ }
  return out
}

/**
 * 统一调用口：**不传 `--user-data-dir`**，改用临时 HOME 隔离 profile。
 *
 * @param {string} chrome  {@link findChrome} 的返回值
 * @param {string[]} extraArgs 除公共参数外的其余 argv
 * @param {object} opts     execFileSync 选项（stdio/encoding/timeout/maxBuffer）
 */
export function runChrome (chrome, extraArgs, opts = {}) {
  const home = mkdtempSync(join(tmpdir(), 'sc-chrome-home-'))
  try {
    return execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--disable-dev-shm-usage',         /* /dev/shm 在容器内常偏小；显式改走磁盘 */
      '--disable-background-networking', /* 免 GCM/组件更新等后台握手拖启动 */
      '--no-first-run', '--no-default-browser-check',
      ...extraArgs
    ], { env: { ...process.env, HOME: home }, ...opts })
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}
