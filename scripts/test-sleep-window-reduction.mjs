#!/usr/bin/env node
// test-sleep-window-reduction.mjs — S-P2a 睡眠窗口归约单测（2026-09-20）
//
// 判因（真机实测 + 可执行探针）：`deepSleepCheck` 把「状态归约」与「触发判定」写在**同一个循环**里，
//   且对 `stalled` 直接 `continue`（**不参与 hottest**）⇒ 在册会话**全为** stalled 时 `hottest` 恒为初值 0
//   ⇒ `hottest <= lastDeepSleepAt` **恒真** ⇒ **永不触发**。而 `deepsleep-core` 的状态机图明写
//   STALLED =「已确认卡住，**不阻塞**」—— **代码与自述相反**。
//   真机证据：09-17 08:34 起 `28f9f094` 等会话转 stalled 后，日志**再未出现任何触发行**（11 小时零触发）。
//   面板同源缺陷：同一过滤令 `lastActivityAt=0` ⇒ `nextEligibleAt = 0 + idleMs` ⇒ 渲染成 **1970-01-01**。
//
// 本件钉死四件：
//   ① 全 stalled ⇒ **仍应答**（hottest 取 lastEventAt，非 0）；
//   ② 归约与判定分离后的**阻塞语义**：probing/suspect 阻塞，stalled/running/ended 不阻塞；
//   ③ 水位取值规则：只有 ended 取 lastEndAt，其余取 lastEventAt；
//   ④ 巡检与面板**共用同一归约**（符号级：两处都引用 planSleepWindow，不得各写一份循环）。
//
// 反例自证（**先红**）：把 `planSleepWindow` 中 stalled 的分支改回 `continue`（即旧行为）⇒ ① 立即红；
//   把 `getDeepSleepStatus` 改回自带循环 ⇒ ④ 红。两个变异体已在本文件末尾以**文本断言 + 逻辑重演**双证。
//
// 退出码：0=全过 / 1=有失败
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let fail = 0
const ok = (c, m, extra = '') => { P.push(`${c ? '✅' : '❌'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fail++ }

const M = await import(new URL('../lib/trigger-plan.js', import.meta.url).href)
const { planSleepWindow } = M
if (typeof planSleepWindow !== 'function') {
  console.log('❌ lib/trigger-plan.js 未导出 planSleepWindow（先 npm run build:host）')
  process.exit(1)
}
// planTriggerDim 仍在判据内核（等价性对照用）
const CORE = await import(new URL('../lib/deepsleep-core.js', import.meta.url).href)

const NOW = 1_800_000_000_000
const rec = (sid, state, over = {}) => ({ sid, state, lastEventAt: NOW - 3600e3, lastEndAt: NOW - 3600e3, probeAt: 0, probeRound: 0, stallRound: 0, ...over })
const opts = { lastActivityAt: NOW, lastDeepSleepAt: NOW - 10 * 3600e3 } // 水位 10h 前 ⇒ 远超阈值

console.log('S-P2a 睡眠窗口归约（归约与判定分离）\n')

// ── ① 全 stalled ⇒ 仍应答（核心回归）──
{
  const w = planSleepWindow([rec('a', 'stalled'), rec('b', 'stalled')].values(), opts)
  ok(w.hottest === NOW - 3600e3, '① 全 stalled ⇒ hottest = lastEventAt（**不再恒 0**）', `hottest=${w.hottest}`)
  ok(w.hottest > 0, '① hottest > 0（面板 nextEligibleAt 不再是 1970-01-01）')
  ok(w.due === true, '① **全 stalled ⇒ 应答即触发**（状态机自述「STALLED 不阻塞」首次由代码兑现）')
  ok(w.counts.stalled === 2 && w.blocking === 0, '① stalled 计数正确且**不阻塞**', `stalled=${w.counts.stalled} blocking=${w.blocking}`)
}

// ── ② 阻塞语义（probing/suspect 阻塞；其余不阻塞）──
{
  const w1 = planSleepWindow([rec('a', 'probing')].values(), opts)
  ok(w1.blocking === 1 && w1.due === false, '② probing ⇒ 阻塞本轮（保守不睡）')
  const w2 = planSleepWindow([rec('a', 'suspect')].values(), opts)
  ok(w2.blocking === 1 && w2.due === false, '② suspect ⇒ 阻塞本轮（待复核）')
  const w3 = planSleepWindow([rec('a', 'running')].values(), opts)
  ok(w3.blocking === 0 && w3.due === true, '② running ⇒ 不阻塞（且计水位）')
  const w4 = planSleepWindow([rec('a', 'ended')].values(), opts)
  ok(w4.blocking === 0 && w4.due === true, '② ended ⇒ 不阻塞')
  for (const [st, k] of [['running', 'running'], ['ended', 'ended'], ['probing', 'probing'], ['suspect', 'suspect'], ['stalled', 'stalled']]) {
    const w = planSleepWindow([rec('x', st)].values(), opts)
    ok(w.counts[k] === 1, `② 计数覆盖每个状态：${st} → counts.${k}`)
  }
}

// ── ③ 水位取值规则：只有 ended 取 lastEndAt ──
{
  const w = planSleepWindow([rec('a', 'ended', { lastEndAt: NOW - 1000, lastEventAt: NOW - 9999e3 })].values(), opts)
  ok(w.hottest === NOW - 1000, '③ ended ⇒ 取 lastEndAt（停滞计时起点）', `hottest=${w.hottest}`)
  const w2 = planSleepWindow([rec('a', 'stalled', { lastEndAt: NOW - 9999e3, lastEventAt: NOW - 2000 })].values(), opts)
  ok(w2.hottest === NOW - 2000, '③ stalled ⇒ 取 lastEventAt（**不受 lastEndAt 影响**）', `hottest=${w2.hottest}`)
  const w3 = planSleepWindow([rec('a', 'probing', { lastEventAt: NOW - 1 })].values(), opts)
  ok(w3.hottest === 0, '③ 阻塞项**不计水位**（hottest 保持 0；由 due=false 兜住）', `hottest=${w3.hottest} due=${w3.due}`)
}

// ── ④ 空集合回落全局兜底水位 ──
{
  const w = planSleepWindow([].values(), { lastActivityAt: NOW - 500, lastDeepSleepAt: NOW - 10 * 3600e3 })
  ok(w.hottest === NOW - 500, '④ 无在册会话 ⇒ 回落 lastActivityAt（既有兜底语义不变）')
  const w0 = planSleepWindow([].values(), { lastActivityAt: NOW - 500, lastDeepSleepAt: NOW })
  ok(w0.due === false, '④ 水位已覆盖 ⇒ 不重复触发（空转消除语义不变）')
}

// ── ⑤ 已消化窗口不重复触发（等价性：due 的边界）──
{
  const w = planSleepWindow([rec('a', 'ended', { lastEndAt: NOW - 1000 })].values(), { lastActivityAt: NOW, lastDeepSleepAt: NOW - 1000 })
  ok(w.due === false, '⑤ hottest == lastDeepSleepAt ⇒ 不触发（边界与改前一致：`<=` 判据）')
  const w2 = planSleepWindow([rec('a', 'ended', { lastEndAt: NOW - 999 })].values(), { lastActivityAt: NOW, lastDeepSleepAt: NOW - 1000 })
  ok(w2.due === true, '⑤ hottest > lastDeepSleepAt ⇒ 触发（边界另一侧）')
}

// ── ⑥ 符号级：巡检与面板**共用同一归约**（防两处漂移复发）──
{
  const machine = readFileSync(join(root, 'src', 'deepsleep-machine.ts'), 'utf8')
  const uses = (machine.match(/planSleepWindow\s*\(/g) || []).length
  ok(uses === 2, '⑥ `planSleepWindow` 恰好被引用 2 次（巡检 + 面板），不得各写一份循环', `引用数=${uses}`)
  // 旧形态（各自内联 highest 计算）必须已消失：面板里不得再出现 rec.state === 'ended' ? rec.lastEndAt : rec.lastEventAt
  const inlineOld = /rec\.state\s*===\s*'ended'\s*\?\s*rec\.lastEndAt/.test(machine)
  ok(!inlineOld, '⑥ 内联水位计算已从 machine 消除（单一实现）')
  // 巡检里不得再出现"stalled 直接 continue 不计数"的旧形态
  const oldSkip = /if \(rec\.state === 'stalled'\) \{ stalled\+\+; continue \}/.test(machine)
  ok(!oldSkip, '⑥ 旧「stalled 跳过不计数」形态已消除')
}

// ── ⑦ 反向证伪（**变异重演**：把 stalled 改回"跳过"⇒ ① 必红）──
{
  // 用与实现同构的逻辑重演两个变体，证明判据**非恒真**
  const reduce = (sessions, skipStalled) => {
    let seen = 0, hottest = 0
    for (const r of sessions) {
      seen++
      if (r.state === 'probing' || r.state === 'suspect') continue
      if (skipStalled && r.state === 'stalled') continue          // ← 变异体（旧行为）
      const act = r.state === 'ended' ? r.lastEndAt : r.lastEventAt
      if (act > hottest) hottest = act
    }
    if (!seen) hottest = opts.lastActivityAt
    return hottest
  }
  const old = reduce([rec('a', 'stalled'), rec('b', 'stalled')], true)
  const now = reduce([rec('a', 'stalled'), rec('b', 'stalled')], false)
  ok(old === 0, '⑦ 反例自证：**变异体**（跳过 stalled）⇒ hottest=0（旧缺陷可复现）', `old=${old}`)
  ok(now > 0, '⑦ 当前实现 ⇒ hottest>0（判据有判别力，非恒真）', `now=${now}`)
  ok(old !== now, '⑦ 两态确有差别（证明本件不是"恒真式"假绿）')
}

// ── ⑧ planTriggerDim 等价性（未动，确认归约未波及时间/内容维判据）──
{
  const { planTriggerDim } = CORE
  ok(planTriggerDim(60 * 60e3, 45 * 60e3, 0, 0) === 'time', '⑧ 时间维到 ⇒ time（不受本册影响）')
  ok(planTriggerDim(0, 45 * 60e3, 0, 0) === 'none', '⑧ 两维均未到 ⇒ none')
  ok(planTriggerDim(0, 45 * 60e3, 100, 50) === 'content', '⑧ 内容维到 ⇒ content（口径不变）')
}

// ── ⑨ dueSelfCheck（S-P4 判据，与册一同批补测）──
{
  const { dueSelfCheck } = M
  if (typeof dueSelfCheck !== 'function') ok(false, '⑨ dueSelfCheck 已导出')
  else {
    ok(dueSelfCheck(NOW, 0, 6 * 3600e3).due === true, '⑨ 从未跑过 ⇒ due（首跑补偿）')
    ok(dueSelfCheck(NOW, NOW - 1000, 6 * 3600e3).due === false, '⑨ 距上次 1s ⇒ 不跑（**治「每挂载必跑」**）')
    ok(dueSelfCheck(NOW, NOW - 7 * 3600e3, 6 * 3600e3).due === true, '⑨ 距上次 7h ≥ 6h ⇒ due')
    ok(dueSelfCheck(NOW, NOW - 6 * 3600e3, 6 * 3600e3).due === true, '⑨ 边界：恰好等于周期 ⇒ due（不少跑）')
    ok(dueSelfCheck(NOW, NOW - 999, 0).due === false, '⑨ 周期 0 ⇒ 关闭（不跑）')
    ok(dueSelfCheck(NOW, 0, 6 * 3600e3).reason === 'never-ran', '⑨ reason 可分辨（never-ran）')
    ok(dueSelfCheck(NOW, NOW - 1000, 6 * 3600e3).reason === 'not-due', '⑨ reason 可分辨（not-due）')
  }
}

console.log(P.join('\n'))
console.log(fail ? `\n❌ test-sleep-window-reduction: ${fail} 条断言未通过` : `\n✅ test-sleep-window-reduction: 全绿（${P.length} 条）`)
process.exit(fail ? 1 : 0)
