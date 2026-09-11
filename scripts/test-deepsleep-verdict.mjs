#!/usr/bin/env node
// test-deepsleep-verdict.mjs — 深睡「已消化」判据（deepSleepLanded）确定性回归。
//
// 背景（2026-09-11 睡眠链路专项检索）：runDeepSleep 原判据只按 `stop==='completed' && out`，
//   从不检查候选是否真正落地 ⇒ 门禁全数拒收的轮次也判 done ⇒ 水位推进 ⇒ 被拒痕迹永久划出窗口
//   ⇒ **静默丢料**（审计实证 2 轮共丢 4 条候选行）。本单测锁定修复后的判据，防回归。
//
// 覆盖：① completed+有产出的正常分支 ② all-rejected/maturation-rejected/尾部总门 全拒 ⇒ failed
//        ③ attempted===0 纯 ops 轮/真·空轮 ⇒ done（防无限重处理）④ stop≠completed / out 假值 ⇒ failed
//        ⑤ write_gate 未就位（基础设施失败）⇒ failed ⑥ 部分接受 skipped>0 ⇒ done
// 用法: node scripts/test-deepsleep-verdict.mjs
import { deepSleepLanded, deepSleepReplayable, commitPrinciples, planDeepSleepVerdict, DEFAULT_FAIL_POLICY, DEFAULT_FAIL_MAX_ROUNDS } from '../lib/distill.js'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`✅ ${msg}`) } else { fail++; console.log(`❌ ${msg}`) } }
const app = (o) => ({ attempted: 0, added: 0, gate: 'no-op', ...o })

console.log('── deepSleepLanded 判据回归 ──')

// ① 正常：completed + out + 有落地 ⇒ done
ok(deepSleepLanded('completed', {}, app({ attempted: 3, added: 3, gate: 'pass' })) === true,
  '① completed + added=3 ⇒ done（正常消化）')
ok(deepSleepLanded('completed', {}, app({ attempted: 2, added: 1, gate: 'pass' })) === true,
  '① completed + added=1/skipped=1（部分接受）⇒ done')

// ② 全拒收：attempted>0 && added===0 ⇒ failed（核心修复点）
ok(deepSleepLanded('completed', {}, app({ attempted: 3, added: 0, gate: 'all-rejected' })) === false,
  '② all-rejected（attempted=3/added=0）⇒ failed（静默丢料修复点）')
ok(deepSleepLanded('completed', {}, app({ attempted: 1, added: 0, gate: 'all-rejected' })) === false,
  '② all-rejected（attempted=1/added=0）⇒ failed')
ok(deepSleepLanded('completed', {}, app({ attempted: 2, added: 0, gate: 'maturation-rejected' })) === false,
  '② maturation-rejected ⇒ failed')
ok(deepSleepLanded('completed', {}, app({ attempted: 4, added: 0, gate: '行格式违规' })) === false,
  '② 尾部总门失败（gate=行格式违规）⇒ failed')

// ③ attempted===0 纯 ops 轮 / 真·空轮 ⇒ done（防无限重处理）
ok(deepSleepLanded('completed', {}, app({ attempted: 0, added: 0, gate: 'no-op' })) === true,
  '③ attempted=0/added=0（纯 profileOps/pointerOps/treeOps/forgetOps 轮或空轮）⇒ done（不回滚）')
ok(deepSleepLanded('completed', {}, app({ attempted: 0, added: 0, gate: 'pass' })) === true,
  '③ attempted=0 且 gate=pass ⇒ done')

// ④ 未完成 / 无产出 ⇒ failed
ok(deepSleepLanded('error', {}, app({ attempted: 1, added: 0, gate: 'x' })) === false,
  '④ stop=error ⇒ failed')
ok(deepSleepLanded('aborted', {}, app({ attempted: 1, added: 0, gate: 'x' })) === false,
  '④ stop=aborted ⇒ failed')
ok(deepSleepLanded('completed', null, app({ attempted: 1, added: 0, gate: 'x' })) === false,
  '④ stop=completed 但 out=null（JSON 解析失败）⇒ failed')
ok(deepSleepLanded('completed', undefined, app({ attempted: 0, added: 0, gate: 'no-op' })) === false,
  '④ out=undefined ⇒ failed（即使 attempted=0 也不判 done）')

// ⑤ 基础设施失败：write_gate 未就位（attempted 恰为 0，须显式排除）
ok(deepSleepLanded('completed', {}, app({ attempted: 0, added: 0, gate: 'write_gate 未就位' })) === false,
  '⑤ write_gate 未就位（attempted=0）⇒ failed（基础设施失败不得计为已消化）')
ok(deepSleepLanded('completed', {}, app({ attempted: 5, added: 0, gate: 'write_gate 未就位' })) === false,
  '⑤ write_gate 未就位（attempted=5）⇒ failed')

// ⑥ 回归不变量：done 的必要条件 = stop=completed && out 真值
ok(deepSleepLanded('completed', {}, app({ attempted: 1, added: 1, gate: 'pass' })) === true &&
  deepSleepLanded('error', {}, app({ attempted: 1, added: 1, gate: 'pass' })) === false,
  '⑥ 不变量：added>0 也须 stop=completed 才判 done')

// ── 深睡水位「可否回放」判据（deepSleepReplayable）────────────────────────────
// 背景（2026-09-11 可靠性审查 D2）：重启时 lastDeepSleepAt 从 distill-audit.jsonl 回放重建，
//   旧判据只排 error / stop=error / result∈{no-parent,no-traces}（"无事可做"），**漏排"做了但被拒"**
//   （attempted>0 && added=0）⇒ 那类轮次被当有效水位回放 ⇒ 那批痕迹永久关在窗外（重启即丢料）。
// 反向证伪：把 deepSleepReplayable 的 landed 分支删掉（回落旧实现）⇒ 下方 ④ 由 false 翻成 true。
console.log('\n── deepSleepReplayable 回放判据回归 ──')

ok(deepSleepReplayable({ kind: 'distill' }) === false, '① 非深睡审计行 ⇒ 不可回放')
ok(deepSleepReplayable({ kind: 'deep-sleep', error: 'boom' }) === false, '② 带 error ⇒ 不可回放')
ok(deepSleepReplayable({ kind: 'deep-sleep', stop: 'error' }) === false, '② stop=error ⇒ 不可回放')
ok(deepSleepReplayable({ kind: 'deep-sleep', stop: 'completed', result: 'no-parent' }) === false,
  '③ result=no-parent ⇒ 不可回放（旧判据保留）')
ok(deepSleepReplayable({ kind: 'deep-sleep', stop: 'completed', result: 'no-traces' }) === false,
  '③ result=no-traces ⇒ 不可回放（旧判据保留）')
ok(deepSleepReplayable({ kind: 'deep-sleep', stop: 'completed', attempted: 3, added: 0, gate: 'all-rejected', landed: false }) === false,
  '④ 真库形状 attempted=3/added=0/gate=all-rejected/landed=false ⇒ 不可回放（D2 修复点）')
ok(deepSleepReplayable({ kind: 'deep-sleep', stop: 'completed', attempted: 1, added: 0, gate: 'all-rejected', landed: false }) === false,
  '④ attempted=1/added=0/landed=false ⇒ 不可回放')
ok(deepSleepReplayable({ kind: 'deep-sleep', stop: 'completed', attempted: 3, added: 0, gate: 'all-rejected' }) === true,
  '⑤ 旧行无 landed ⇒ 回落旧判据 true（**不回捞**：回捞会把丢料换成重复写，等幂等键落地后再议）')
ok(deepSleepReplayable({ kind: 'deep-sleep', stop: 'completed', attempted: 0, added: 0, landed: true }) === true,
  '⑥ landed=true（空轮也算已消化）⇒ 可回放')
ok(deepSleepReplayable({ kind: 'deep-sleep', stop: 'completed', attempted: 3, added: 3, landed: true }) === true,
  '⑥ landed=true（有落地）⇒ 可回放')
ok(deepSleepReplayable({}) === false, '⑦ 空对象 ⇒ 不可回放（兜底）')

// ── G-16 原则落盘提交点（commitPrinciples）── producer 侧 ─────────────────────
// 背景（2026-09-12 二修二补）：applyPrinciples 内原写法 `try { renameSync() } catch {}` 空吞异常，
//   随后仍按 added>0 返回 ⇒ deepSleepLanded 判 landed:true ⇒ 水位推进、下轮不重蒸 ⇒ **静默永久丢失**。
//   applyPrinciples 是闭包内 const 无 export，单测到不了 ⇒ 抽出 commitPrinciples 才锁得住 producer。
// 反向证伪：把 commitPrinciples 的 catch 改成 `return { ok: true }` ⇒ 下方 ② 全部翻红。
console.log('\n── commitPrinciples 落盘提交点回归（G-16）──')
const tdir = mkdtempSync(join(tmpdir(), 'sc-g16-'))
const tTmp = join(tdir, 'p.tmp')
const tOut = join(tdir, 'p.md')
ok(typeof commitPrinciples === 'function', '① commitPrinciples 已导出（producer 侧可单测）')
const r1 = commitPrinciples(tTmp, tOut) // tmp 不存在 ⇒ rename 必失败
ok(r1.ok === false, '② tmp 不存在 ⇒ ok=false（rename 失败不得谎报成功——G-16 核心）')
ok(typeof r1.err === 'string' && r1.err.length > 0, '② 失败带 err 字符串（供 log 记账）')
ok(!existsSync(tOut), '② 失败后目标文件不得被创建')
writeFileSync(tTmp, 'x', 'utf8')
const r2 = commitPrinciples(tTmp, tOut)
ok(r2.ok === true, '③ tmp 存在 ⇒ ok=true（正常落盘）')
ok(existsSync(tOut), '③ 成功后目标文件存在')
ok(!existsSync(tTmp), '③ 成功后 tmp 已消失（rename 语义，非复制）')
rmSync(tdir, { recursive: true, force: true })

// 判据侧纵深防御：即使 producer 把 added 谎报成 >0，失败 gate 也不得判 done
ok(deepSleepLanded('completed', {}, app({ attempted: 5, added: 5, gate: '落盘异常' })) === false,
  '④ 纵深防御：gate=落盘异常 且 added 被误报成 5 ⇒ 仍判 failed（谎报拦截，producer 回归的第二道闸）')
ok(deepSleepLanded('completed', {}, app({ attempted: 3, added: 0, gate: '落盘异常' })) === false,
  '④ gate=落盘异常（attempted=3/added=0）⇒ failed（G-16 修复形状）')
ok(deepSleepLanded('completed', {}, app({ attempted: 3, added: 3, gate: 'pass' })) === true,
  '④ 对照组：gate=pass/added=3 ⇒ 仍判 done（不得误伤正常路径）')

// ── G-19：landed 判据必须消费完整轮次结果（不只 principles 通道）──
// 核心缺陷：纯 profileOps/pointerOps/treeOps/forgetOps 轮且全失败时，app.attempted===0 ⇒ 旧判据误判 done ⇒ 静默丢料。
ok(deepSleepLanded('completed', {}, app({ attempted: 0, added: 0, gate: 'pass' }), { tried: 2, done: 0 }) === false,
  '⑤ G-19 核心：纯其他通道轮且 2 件全未落地 ⇒ failed（旧判据误判 done ⇒ 静默丢料）')
ok(deepSleepLanded('completed', {}, app({ attempted: 0, added: 0, gate: 'pass' }), { tried: 0, done: 0 }) === true,
  '⑤ 对照组：五通道皆无提案（真·空轮）⇒ done（回滚会导致无限重处理，必须排除）')
ok(deepSleepLanded('completed', {}, app({ attempted: 0, added: 0, gate: 'pass' }), { tried: 1, done: 3 }) === true,
  '⑤ 其他通道有落地（done=3）⇒ done（不得因 principles 无产出而误判失败）')
ok(deepSleepLanded('completed', {}, app({ attempted: 0, added: 0, gate: 'pass' })) === true,
  '⑤ 向后兼容：不传 other ⇒ 与旧行为一致（attempted=0 ⇒ done），不引入回归')
ok(deepSleepLanded('completed', {}, app({ attempted: 0, added: 0, gate: '落盘异常' }), { tried: 0, done: 5 }) === false,
  '⑤ 纵深防御：失败 gate 优先于其他通道的成功（done=5 也不得判 done）')
ok(deepSleepLanded('error', null, app({ attempted: 0, added: 0, gate: 'pass' }), { tried: 0, done: 0 }) === false,
  '⑤ stop≠completed ⇒ failed（与通道结果无关，保持原语义）')

// ── G-19 深睡失败策略（planDeepSleepVerdict）────────────────────────────────
// 背景：landed=false 原硬编码 ⇒ failed ⇒ 水位回滚、同批材料下轮重捞（=策略 B，永不放弃）。
//   某通道若**永久**失败（画像容量满 / 门禁长期缺席），B 会每 idleMs 重捞一次、永不停（烧 LLM）。
//   故并存 C=graded：连败达 maxRounds 轮后放行（判 done、推进水位）并告警。两者做成可配项。
// 反向证伪：把决策表第 2 条（policy=retry 分支）删掉 ⇒ retry+streak=99 会掉进 graded 放行分支 ⇒ ② 翻红；
//   把第 3 条的 `+1` 去掉 ⇒ streak=2/max=3 需到第 4 轮才放行 ⇒ ④ 翻红（差一轮即越界放行/丢料）。
console.log('\n── planDeepSleepVerdict 失败策略回归（G-19）──')
ok(planDeepSleepVerdict(true, 'retry', 0, 3).verdict === 'done' && planDeepSleepVerdict(true, 'retry', 0, 3).release === false,
  '① landed=true ⇒ done 且 release=false（策略/连败一概不看）')
ok(planDeepSleepVerdict(true, 'graded', 99, 3).verdict === 'done' && planDeepSleepVerdict(true, 'graded', 99, 3).release === false,
  '① landed=true 优先于 graded 放行（连败=99 也不得判 release）')

ok(planDeepSleepVerdict(false, 'retry', 0, 3).verdict === 'failed' && planDeepSleepVerdict(false, 'retry', 0, 3).release === false,
  '② policy=retry 且 landed=false ⇒ failed（B：全重捞，永不放行）')
ok(planDeepSleepVerdict(false, 'retry', 99, 3).verdict === 'failed' && planDeepSleepVerdict(false, 'retry', 99, 3).release === false,
  '② policy=retry 且连败 99 轮 ⇒ 仍 failed（永不放行——B 的核心不变量）')
ok(planDeepSleepVerdict(false, 'retry', 2, 3).verdict === 'failed',
  '② policy=retry 且刚好达阈值（streak=2/max=3）⇒ 仍 failed（retry 不受 maxRounds 影响）')

ok(planDeepSleepVerdict(false, 'graded', 0, 3).verdict === 'failed' && planDeepSleepVerdict(false, 'graded', 0, 3).release === false,
  '③ policy=graded/streak=0/max=3 ⇒ failed（首轮失败：重试，不丢料）')
ok(planDeepSleepVerdict(false, 'graded', 1, 3).verdict === 'failed' && planDeepSleepVerdict(false, 'graded', 1, 3).release === false,
  '③ policy=graded/streak=1/max=3 ⇒ failed（第 2 轮仍重试）')

ok(planDeepSleepVerdict(false, 'graded', 2, 3).verdict === 'done' && planDeepSleepVerdict(false, 'graded', 2, 3).release === true,
  '④ policy=graded/streak=2/max=3 ⇒ done 且 release=true（第 3 轮连败达上限 ⇒ 放行+告警）')
ok(planDeepSleepVerdict(false, 'graded', 5, 3).verdict === 'done' && planDeepSleepVerdict(false, 'graded', 5, 3).release === true,
  '④ policy=graded/streak=5/max=3（超上限）⇒ done 且 release=true（不得因超界回退成重试）')
ok(planDeepSleepVerdict(false, 'graded', 0, 1).verdict === 'done' && planDeepSleepVerdict(false, 'graded', 0, 1).release === true,
  '④ max=1 ⇒ 首轮失败即放行（阈值下界，等价于「不重试」）')

ok(planDeepSleepVerdict(true, 'graded', 0, 3).reason === 'landed' &&
  planDeepSleepVerdict(false, 'retry', 0, 3).reason === 'policy=retry' &&
  planDeepSleepVerdict(false, 'graded', 0, 3).reason === 'graded-retry' &&
  planDeepSleepVerdict(false, 'graded', 2, 3).reason === 'graded-release',
  '⑤ reason 四分支齐备（审计可读：landed / policy=retry / graded-retry / graded-release）')

ok(DEFAULT_FAIL_POLICY === 'graded' && DEFAULT_FAIL_MAX_ROUNDS === 3,
  '⑥ 默认值常量合理：DEFAULT_FAIL_POLICY=graded（C 缺省）、DEFAULT_FAIL_MAX_ROUNDS=3')
ok(typeof planDeepSleepVerdict === 'function' && planDeepSleepVerdict.length === 4,
  '⑥ planDeepSleepVerdict 已导出且为 4 参纯函数（模块级，闭包外可单测）')
ok(planDeepSleepVerdict(false, 'graded', 2, 3).verdict === planDeepSleepVerdict(false, 'graded', 2, 3).verdict,
  '⑥ 纯函数：同参两次调用结果一致（无隐藏状态）')

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)

