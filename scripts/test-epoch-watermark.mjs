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
import { gatherDeepSleepTraces, countWindowTraces } from '../lib/deepsleep-traces.js'

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

// ⑤ **痕迹数 vs 材料字符数：两个量必须可分辨**（2026-09-20 round 9 · S-P1b″ 口径定案）
//   判因（真机实测）：注册项 `trigger.newTracesMin` 名与 note 都说「窗口内最少新痕迹**数**」，
//     而消费点 `deepsleep-run.ts` 比的是 `gatherDeepSleepTraces(...).length` —— **材料段字符数**。
//     值 `1` 时两者恰好同效（材料非空 ⇔ 至少一条痕迹）⇒ **潜伏的假旋钮**：调到 3 名字说"3 个文件"、
//     行为是"3 个字符"（几乎必然通过）。真机影响面：49 纪元中 46 个 `materialBytes=0`，
//     其中 25 个仍入睡 ⇒ 若真按文件数判，这 25 轮全不该入睡（**行为级差距**）。
//   ⇒ 本轮新增 `countWindowTraces`（真轴）并落审计 `traceFiles`，使二者**从此可分辨**。
//   本断言守三件事：① 两个量在**同一夹具**上给出**不同**的数；② 与 `windowMaterialBytes` 同源枚举；
//   ③ 审计字段 `traceFiles` 真的被写（接线而非仅存在）。
{
  const dir = mkdtempSync(join(tmpdir(), 'sc-tf-'))
  const pend = join(dir, 'pending'); const cand = join(dir, 'candidates')
  const notes = join(dir, 'notes')
  mkdirSync(pend); mkdirSync(cand); mkdirSync(notes)
  const since = Date.now() - 60e3
  // 窗口内：1 个 pending（内容 4000 字符 —— 故意让"字符数"远大于"文件数"）
  //         1 个 notes；窗口外 1 个；非 .md 1 个
  const p1 = join(pend, 'a.md'); const n1 = join(notes, 'b.md')
  writeFileSync(p1, 'x'.repeat(4000)); writeFileSync(n1, 'y'.repeat(2000))
  const pOld = join(pend, 'old.md'); writeFileSync(pOld, 'z'.repeat(9999))
  utimesSync(pOld, new Date(since - 3600e3), new Date(since - 3600e3))
  writeFileSync(join(pend, 'junk.jsonl'), 'q'.repeat(9999))
  const deps = { candidateDir: cand, pendDir: pend, auditFile: join(dir, 'x.jsonl') }
  const files = countWindowTraces(deps, dir, since)
  const chars = gatherDeepSleepTraces(deps, dir, since).length
  ok(files === 2, `⑤ 痕迹**文件数** = 窗口内 .md 文件数（期望 2，实测 ${files}）—— 窗口外/非 .md 排除`)
  ok(chars > 100, `⑤ 材料**字符数** = 段装配后字符串长度（实测 ${chars}）`)
  ok(files !== chars, `⑤ 两个量**可分辨**（文件数 ${files} ≠ 字符数 ${chars}）—— 这正是本轮定案的病灶点`)
  // 单文件 vs 多文件：字符数变、文件数不变 ⇒ 证明二者是**独立轴**
  //  ⚠ 必须在**单文件上限之内**改内容：`gatherDeepSleepTraces` 有 `PEND_PER_FILE=2500` /
  //    `NOTES_PER_FILE=6000` 截断（本断言首版改成 8000 撞了上限 ⇒ 字符数不变 ⇒ 假红；
  //    这是**我的断言写错**，不是实现问题 —— 记档：测"量随输入变"时先确认没有饱和机制）。
  writeFileSync(p1, 'x'.repeat(1200)) // 从 4000 降到 1200（两者都在 cap 内 ⇒ 字符数必然变）
  const files2 = countWindowTraces(deps, dir, since)
  const chars2 = gatherDeepSleepTraces(deps, dir, since).length
  ok(files2 === files && chars2 !== chars, `⑤ 内容变（cap 内）：文件数不变（${files2}）而字符数变（${chars} → ${chars2}）⇒ 独立轴`)
  // 反向：文件数变而内容为 0 增量（空文件）⇒ 字符数不变
  writeFileSync(join(pend, 'empty.md'), '')
  const files3 = countWindowTraces(deps, dir, since)
  ok(files3 === files + 1, `⑤ 新增空文件：文件数 +1（${files3}）—— 空文件在"痕迹数"轴上算一个痕迹`)
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* 清理失败不影响判据 */ }
}
// ⑤′ **接线**：`traceFiles` 必须真的进审计（防"建了读数没人写"）
{
  const run = readFileSync(join(root, 'lib', 'deepsleep-run.js'), 'utf8')
  ok(/traceFiles/.test(run), '⑤′ 审计字段 `traceFiles` 已接线（lib/deepsleep-run.js）')
  ok(/countWindowTraces/.test(run), '⑤′ 真轴由 `countWindowTraces` 产出（非另写一份枚举）')
  ok(/traceFiles[,:}\s]/.test(run) && /emitDeepSleepAudit/.test(run), '⑤′ 经 `emitDeepSleepAudit` 出账（不是只在 log 里）')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
