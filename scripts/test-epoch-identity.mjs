#!/usr/bin/env node
// test-epoch-identity.mjs — **睡眠纪元身份**（S-P1a · 2026-09-15）
//
// 依据：docs/sleep-granularity-plan-2026-09-15.md §5（R0 睡眠纪元）+ 验收 AC-R0.1。
// 判据：纪元 = 上次睡眠成功 → 本次睡眠成功；**既是触发单位也是度量单位**（R1 以它为样本）。
//
// 断言：
//   ① `epochIdOf` 形状/唯一/有序 + **生成器产出者必过 `EPOCH_ID_RE`**（单一实现，防两套正则漂移）
//   ② 判据**非恒真**：反例（`epoch-abc` / `epoch-` / `1` 前缀错）必须被拒
//   ③ `DeepSleepStatus.currentEpoch` 存在且**初值 null**（接线存在性：无在跑纪元不得伪报 id）
//   ④ **接线层**：触发点（machine）确实调用 `epochIdOf`，且 `deepsleep-run` 三处 `kind:'deep-sleep'`
//      审计**都带 `sleepEpoch`** —— 少一处就有一种结束路径（正常/无 parent/异常）丢失纪元归属。
//      ⚠ **诚实标注**：④ 是**源码文本断言**，强度弱于行为断言。之所以取此形态：真实触发需要
//      「所有根会话停滞 ≥ idleMs」或走 `/deepsleep/trigger`（会真跑一次 LLM 归纳、写记忆库）——
//      单测不该有那种副作用。仓内有同类先例（`test-wiring-gate` 文本版 · `check-arch-sync` 亦为源码断言）。
//      **行为级证据**由**真机手动触发**补齐（见 OPEN-ITEMS S-P1a 的复验命令）。
//
// 用法: node scripts/test-epoch-identity.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDeepSleep } from '../lib/deepsleep.js'
import { epochIdOf, EPOCH_ID_RE } from '../lib/deepsleep-core.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

console.log('── S-P1a 睡眠纪元身份 ──')

// ① 纯函数：形状 / 唯一 / 有序 / 生成器自洽
{
  const t0 = 1789493200827
  const a = epochIdOf(t0)
  const b = epochIdOf(t0 + 1)
  ok(a === `epoch-${t0}`, `① 形状正确（${a}）`)
  ok(a !== b, '① 相邻毫秒生成不同 id（唯一性）')
  ok(epochIdOf(t0 + 1) > epochIdOf(t0), '① 字典序 = 时间序（可直接排序）')
  // 生成器产出者**必过**校验（同一实现的两个入口不得互相矛盾）
  const samples = [0, 1, 999, t0, Date.now(), Number.MAX_SAFE_INTEGER]
  const bad = samples.map(epochIdOf).filter((x) => !EPOCH_ID_RE.test(x))
  ok(bad.length === 0, `① 生成器产出者必过校验（${samples.length} 个样本，违规 ${bad.length}）`)
  ok(epochIdOf(NaN) === 'epoch-0', '① 非法入参收敛为 epoch-0（不产出 NaN 形状）')
}

// ② 判据非恒真：反例必须被拒
{
  const rej = ['epoch-abc', 'epoch-', 'epoch', 'epoch-1a', 'xepoch-123', 'epoch- 123']
  const leaked = rej.filter((x) => EPOCH_ID_RE.test(x))
  ok(leaked.length === 0, `② 反例全部被拒（${rej.length} 个，漏放 ${leaked.length}）`)
  ok(EPOCH_ID_RE.test('epoch-123'), '② 正例通过（epoch-123）—— 判据非恒假')
}

// ③ 状态暴露：字段存在且初值 null
{
  const mk = () => ({
    io: { log: () => {}, audit: () => {}, ledger: () => {}, kRoot: '', auditFile: '', pendDir: '', candidateDir: '', probeScriptPath: '' },
    cfg: { config: { enableDeepSleep: true }, PROFILE_HEADER: {}, capEnv: () => ({}), llmState: { providerFailCount: 0 } },
    llm: { runNode: async () => ({ status: 0, out: '', err: '' }), textOf: () => '', resolveLlm: () => null, resolveDefaultModel: () => undefined, validateProvider: () => {} },
    session: { pickParent: () => null, ensureDaemonParent: async () => null, locateTranscript: async () => null, hasActiveSubagents: () => false },
    write: { distillAgent: async () => {}, writeDispatch: async () => ({ added: 0, rejected: 0, failed: 0, targetLib: '' }), writeProfileLine: () => ({ st: 'added' }), parseAgentJson: () => ({}), normalizeProfileTarget: () => null },
    housekeep: { runSelfCheck: async () => null, bankSnapshot: async () => {}, embedCfgOf: () => ({}) },
    appCtx: {},
  })
  const ds = createDeepSleep(mk())
  const st = ds.getDeepSleepStatus()
  ok('currentEpoch' in st, '③ DeepSleepStatus 含 currentEpoch 字段')
  ok(st.currentEpoch === null, '③ 无在跑纪元时 currentEpoch === null（不伪报 id）')
  ok('epochSince' in st, '③ DeepSleepStatus 含 epochSince 字段（S-P1d 起止）')
  ok(st.epochSince === null, '③ 无纪元时 epochSince === null（不得回落到 traceSince() 现取值）')
}

// ④ 接线层：触发点开纪元 + 三处审计都带 sleepEpoch
{
  const mach = join(root, 'lib', 'deepsleep-machine.js')
  const run = join(root, 'lib', 'deepsleep-run.js')
  ok(existsSync(mach) && existsSync(run), '④ 编译产物存在（lib/ 已构建）')
  const mSrc = readFileSync(mach, 'utf8')
  const rSrc = readFileSync(run, 'utf8')
  const callN = (mSrc.match(/epochIdOf\(/g) || []).length
  ok(callN >= 2, `④ 触发点调用 epochIdOf（巡检 + 手动；实测 ${callN} 处）`)
  // 三处审计：no-parent / 主记录 / 异常 —— 各自都必须在同一 audit 对象里带 sleepEpoch
  const auditCount = (rSrc.match(/kind:\s*'deep-sleep'/g) || []).length
  // ⚠ **键形式**（`\bsleepEpoch\s*:`）而非裸子串 —— 实测教训：初版写成裸 `sleepEpoch`，
  //   把字段改名为 `sleepEpochXX` 时**测试仍绿**（子串仍在）⇒ 判据对"改名"这一变异**失明**。
  //   加固后 `sleepEpochXX` 不再匹配（无冒号）⇒ 改名与删字段两种变异都能抓到。
  const withEpoch = (rSrc.match(/kind:\s*'deep-sleep'[^)]*?\bsleepEpoch\s*:/g) || []).length
  ok(auditCount === 3, `④ deep-sleep 审计共 3 处（实测 ${auditCount}）`)
  ok(withEpoch === auditCount, `④ 三处审计**全部**带 sleepEpoch（${withEpoch}/${auditCount}；少一处即某种结束路径丢失纪元归属）`)
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
