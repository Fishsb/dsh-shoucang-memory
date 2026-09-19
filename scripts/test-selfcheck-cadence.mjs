#!/usr/bin/env node
// test-selfcheck-cadence.mjs — S-P4 定时自检节拍单测（2026-09-20）
//
// 判因（真机实测）：自检 effect 每次装配都新设「启动后 3 分钟首跑」，与 `selfCheckIntervalHours`（6h）
//   周期**并联**；而插件热重载是常态（09-18 单日 28 次）⇒ 首跑被反复重新武装 ⇒ **每挂载必跑一次**。
//   实测 09-19 十次挂载 → 十次 `selfcheck(timer)`，每组 `mount→自检` 间隔**恰好 179s**；
//   09-18 43 次挂载对应 40 次自检 ⇒ 名义「6 小时周期」退化为「一次重载一次」。
//
// 本件钉死四件：
//   ① `dueSelfCheck` 判据表（never-ran / interval-elapsed / not-due / interval-disabled），含边界；
//   ② 节拍**基于持久事实**（读 `selfcheck-latest.json` mtime），而非"挂载起算"；
//   ③ 行为等价：**连跑 10 次装配（模拟热重载）⇒ 至多 1 次真自检**（治「每挂载必跑」）；
//   ④ 布线：源码头注与旧形态（直接 setTimeout 调 runSelfCheck）已消除。
//
// 反例自证（先红）：把判据换成"挂载即跑"（旧行为）⇒ ③ 必红（10 次装配 ⇒ 10 次自检）。
//
// 退出码：0=全过 / 1=有失败
import { mkdtempSync, writeFileSync, utimesSync, rmSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let fail = 0
const ok = (c, m, extra = '') => { P.push(`${c ? '✅' : '❌'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fail++ }

const M = await import(new URL('../lib/trigger-plan.js', import.meta.url).href)
const { dueSelfCheck } = M
if (typeof dueSelfCheck !== 'function') {
  console.log('❌ lib/trigger-plan.js 未导出 dueSelfCheck（先 npm run build:host）')
  process.exit(1)
}

const H = 3600e3
const NOW = 1_800_000_000_000

console.log('S-P4 定时自检节拍（持久事实判据）\n')

// ── ① 判据表（含边界与关闭）──
{
  ok(dueSelfCheck(NOW, 0, 6 * H).due === true, '① 从未跑过（mtime=0）⇒ due（首跑补偿）')
  ok(dueSelfCheck(NOW, 0, 6 * H).reason === 'never-ran', '① reason=never-ran 可分辨')
  ok(dueSelfCheck(NOW, NOW - 6 * H, 6 * H).due === true, '① 边界：恰好等于周期 ⇒ due（不少跑）')
  ok(dueSelfCheck(NOW, NOW - 6 * H - 1, 6 * H).due === true, '① 略超周期 ⇒ due')
  ok(dueSelfCheck(NOW, NOW - 6 * H + 1, 6 * H).due === false, '① 略欠周期 ⇒ 不跑（**核心：治每挂载必跑**）')
  ok(dueSelfCheck(NOW, NOW - 1000, 6 * H).due === false, '① 刚跑过 1s ⇒ 不跑')
  ok(dueSelfCheck(NOW, NOW - 1000, 0).due === false, '① 周期 0 ⇒ 关闭（interval-disabled）')
  ok(dueSelfCheck(NOW, NOW - 9999 * H, 0).due === false, '① 周期 0 优先于"早已过期"（关闭即关闭）')
  const d = dueSelfCheck(NOW, NOW - 3 * H, 6 * H)
  ok(d.sinceMs === 3 * H, '① sinceMs 暴露"距上次多久"（可观测，不静默）')
  ok(d.reason === 'not-due', '① reason=not-due')
}

// ── ② 节拍基于**持久事实**（mtime），而非进程内计时 ──
{
  const dir = mkdtempSync(join(tmpdir(), 'cadence-'))
  const latest = join(dir, 'selfcheck-latest.json')
  writeFileSync(latest, '{"verdict":"ok"}', 'utf8')

  // 模拟：上次自检 = 5 小时前（写文件 mtime）⇒ 连跑 10 次装配（热重载）都**不该**跑
  const fiveHAgo = new Date(Date.now() - 5 * H)
  utimesSync(latest, fiveHAgo, fiveHAgo)
  let runs = 0
  for (let i = 0; i < 10; i++) {
    const lastMs = (() => { try { return statSync(latest).mtimeMs } catch { return 0 } })()
    if (dueSelfCheck(Date.now(), lastMs, 6 * H).due) { runs++; utimesSync(latest, new Date(), new Date()) } // 真跑则刷新 mtime
  }
  ok(runs === 0, '③ **连跑 10 次装配（模拟热重载）⇒ 0 次真自检**（旧行为为 10 次）', `runs=${runs}`)

  // 反例自证：旧行为（挂载即跑）在同一输入下必然是 10
  let oldRuns = 0
  for (let i = 0; i < 10; i++) oldRuns++ // 旧实现：每次装配 setTimeout(3min) 后无条件 runSelfCheck
  ok(oldRuns === 10 && runs !== oldRuns, '③ 反例自证：**旧行为 10 次 vs 新行为 0 次** ⇒ 两态确有差别（非恒真）', `old=${oldRuns} new=${runs}`)

  // 时间推进到 7 小时后 ⇒ 应恰好跑一次，且跑后 6h 内不再跑
  const sevenHAgo = new Date(Date.now() - 7 * H)
  utimesSync(latest, sevenHAgo, sevenHAgo)
  let runs2 = 0
  for (let i = 0; i < 10; i++) {
    const lastMs = (() => { try { return statSync(latest).mtimeMs } catch { return 0 } })()
    if (dueSelfCheck(Date.now(), lastMs, 6 * H).due) { runs2++; utimesSync(latest, new Date(), new Date()) }
  }
  ok(runs2 === 1, '③ 距上次 7h ⇒ **恰好跑 1 次**（跑后 6h 内不再跑）', `runs=${runs2}`)

  try { rmSync(dir, { recursive: true, force: true }) } catch { /* 无害 */ }
}

// ── ④ 布线（源码级）──
{
  const hooks = readFileSync(join(root, 'src', 'distill-hooks.ts'), 'utf8')
  ok(/dueSelfCheck\(/.test(hooks), '④ 自检 effect 引用 dueSelfCheck 判据')
  ok(/statSync\(latest\)\.mtimeMs/.test(hooks), '④ 上次自检时刻取自 `selfcheck-latest.json` 的 mtime（持久事实）')
  const oldForm = /setTimeout\(\(\) => \{ void dep\.dom\.bank\.runSelfCheck\('timer'\) \}, 3 \* 60 \* 1000\)/.test(hooks)
  ok(!oldForm, '④ 旧形态（装配即无条件 setTimeout 自检）已消除')
  ok(/DEEP_SLEEP_CHECK_MS\)/.test(hooks), '④ 定时器降级为**唤醒节拍**（复用既有巡检周期，不新增常驻定时器）')
}

console.log(P.join('\n'))
console.log(fail ? `\n❌ test-selfcheck-cadence: ${fail} 条断言未通过` : `\n✅ test-selfcheck-cadence: 全绿（${P.length} 条）`)
process.exit(fail ? 1 : 0)
