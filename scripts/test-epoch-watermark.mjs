#!/usr/bin/env node
// test-epoch-watermark.mjs — **双维水位（时间 ∨ 内容）**（S-P1b · 2026-09-15）
//
// 依据：docs/sleep-granularity-plan-2026-09-15.md §5（R0 双维水位）+ 验收 AC-R0.2。
// 判据（AC-R0.2）：
//   · `时间维已到但内容维不足` ⇒ **可睡**（time）
//   · `内容维已到但时间维未到` ⇒ **可睡**（content）
//   · 两者都未到 ⇒ **不睡**（none）
//   · **回归保护**：内容维关闭（`contentMin<=0`）⇒ 判定**恒等于**改造前的纯时间判据
//
// ⚠ 为什么测的是**决策表**而不是端到端触发：真实触发还要求 `hottest > lastDeepSleepAt`，
//   而机器内部水位在装配时被初始化为 `Date.now()` ⇒ 单测无法把它倒回过去。
//   ⇒ 把判定抽成纯函数 `planTriggerDim`（同 `planDeepSleepVerdict` 的仓内范式）后，
//     决策表可被**穷举用例**驱动。`windowMaterialBytes` 则用**真临时目录**测（真文件、真 mtime）。
//
// 用法: node scripts/test-epoch-watermark.mjs
import { mkdtempSync, writeFileSync, utimesSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { planTriggerDim, windowMaterialBytes } from '../lib/deepsleep-core.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

const H = 3600e3
const IDLE = 45 * 60e3 // 45min（与注册表生效值一致）

console.log('── S-P1b 双维水位（时间 ∨ 内容）──')

// ① 决策表穷举
ok(planTriggerDim(IDLE, IDLE, 0, 0) === 'time', '① 时间维到（内容维关）⇒ time')
ok(planTriggerDim(IDLE * 2, IDLE, 0, 0) === 'time', '① 时间维远超（内容维关）⇒ time')
ok(planTriggerDim(0, IDLE, 0, 0) === 'none', '① 时间维未到（内容维关）⇒ none —— **改造前行为**')
ok(planTriggerDim(0, IDLE, 1e6, 1000) === 'content', '① **内容维达阈、时间维未到 ⇒ content**（本维新增，改造前不存在此分支）')
ok(planTriggerDim(0, IDLE, 999, 1000) === 'none', '① 内容未达阈 + 时间未到 ⇒ none')
ok(planTriggerDim(0, IDLE, 1000, 1000) === 'content', '① 边界：内容**等于**阈值 ⇒ content（`>=` 语义）')
ok(planTriggerDim(IDLE, IDLE, 1e9, 1) === 'time', '① 两维都到 ⇒ time（时间维优先，语义稳定）')
ok(planTriggerDim(0, IDLE, 1e9, 0) === 'none', '① **contentMin=0（关闭）时内容量再大也不触发** ⇒ none')

// ② 回归保护：内容维关闭 ⇒ 与纯时间判据**逐分支等价**（穷举 0..2×IDLE × 三档内容量）
{
  let mismatch = 0, cases = 0
  for (let t = 0; t <= IDLE * 2; t += IDLE / 8) {
    for (const bytes of [0, 1e6, 1e9]) {
      cases++
      const legacy = t >= IDLE ? 'time' : 'none' // 改造前的纯时间判据
      if (planTriggerDim(t, IDLE, bytes, 0) !== legacy) mismatch++
    }
  }
  ok(mismatch === 0, `② 回归保护：contentMin=0 ⇒ 与纯时间判据逐分支等价（${cases} 例，不符 ${mismatch}）`)
}

// ③ windowMaterialBytes：真临时目录、真文件、真 mtime
{
  const dir = mkdtempSync(join(tmpdir(), 'sc-wm-'))
  const pend = join(dir, 'pending'); const cand = join(dir, 'candidates')
  mkdirSync(pend); mkdirSync(cand)
  const old = join(pend, 'old.md'); const fresh = join(pend, 'fresh.md'); const freshC = join(cand, 'c.md')
  writeFileSync(old, 'x'.repeat(1000)); writeFileSync(fresh, 'y'.repeat(400)); writeFileSync(freshC, 'z'.repeat(200))
  writeFileSync(join(pend, 'ignore.jsonl'), 'q'.repeat(9999)) // 非 .md 不计
  const since = Date.now() - 60e3
  utimesSync(old, new Date(since - 3600e3), new Date(since - 3600e3)) // 窗口外
  utimesSync(fresh, new Date(), new Date())                            // 窗口内
  utimesSync(freshC, new Date(), new Date())                           // 窗口内
  const bytes = windowMaterialBytes({ pendDir: pend, candidateDir: cand }, since)
  ok(bytes === 600, `③ 只计窗口内 .md（400+200=600，实测 ${bytes}）—— 窗口外与 .jsonl 均排除`)
  ok(windowMaterialBytes({ pendDir: join(dir, 'nope'), candidateDir: '' }, since) === 0, '③ 目录缺席/空路径 ⇒ 0（失败收敛，不抛）')
  const all = windowMaterialBytes({ pendDir: pend, candidateDir: cand }, 0)
  ok(all === 1600, `③ since=0 ⇒ 全部 .md 计入（1000+400+200=1600，实测 ${all}）`)
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* 清理失败不影响判据 */ }
}

// ④ **S-P1b″ 守卫（2026-09-16）：内容维已停用** —— 口径被真机数据证伪
//   实测：审计行 `materialBytes=0` 而 `materialChars=46692`（差 4.6 万字符）
//   ⇒ `windowMaterialBytes` 与真实材料**非同源**；本系统材料模型是**窗口式**的，
//     "材料量"与"窗口长度"单调同源 ⇒ 内容维**不是独立轴**，按旧口径取阈会得到"永不触发的假阈值"。
//   ⇒ 代码里加了守卫：阈值 >0 时**告警并按关闭处理**（`contentMinEffective = 0`）。
//   本断言守的是**源码接线**（守卫存在且被用于判定）—— 若有人删守卫恢复旧口径，此处即红。
{
  const mach = join(root, 'lib', 'deepsleep-machine.js')
  ok(existsSync(mach), '④ 编译产物存在（lib/deepsleep-machine.js）')
  const src = readFileSync(mach, 'utf8')
  ok(/contentMinEffective/.test(src), '④ 守卫变量存在（contentMinEffective）')
  ok(/planTriggerDim\([^)]*contentMinEffective/.test(src), '④ 判定**用的是守卫后的值**（不是原始 contentMin —— 否则守卫形同虚设）')
  ok(/windowMaterialBytes/.test(src), '④ 旧口径度量仍保留（作**诊断**写入审计，不再作触发依据）')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
