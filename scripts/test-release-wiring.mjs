#!/usr/bin/env node
// test-release-wiring.mjs — S2S3 册二「打开出口：`release` 接线」判据（2026-09-19）
//
// 判据（四要素）：
//   ① 判据：`release` **出口已接线**——不是"模块存在"，而是 `deepsleep-run` 真的 import **且**调用
//      `applyRelease`；且执行**默认关闭**（env 开关）· 语义门 `executable` 才放行 · 释放**不得**计入
//      G-19 landed 判据（`otherChannels`）。
//   ② 检查方式：**静态**（源码接线点文本）+ **行为**（真调 `applyRelease` 的 fail-closed 分支与放行分支）。
//   ③ 阈值：三条 fail-closed 分支 released===0 且 reasons 非空；放行分支 released===1（走真实链路）；
//      接线点 5 项文本齐备；反例（批准清单不含该行）⇒ 0。
//   ④ 失败退回：任一红 ⇒ 册二不得合入「打开出口」这一项。
//
// **先红**（本件在下列半成品下必红，实测留证）：
//   · 只 import 不调用（`runRelease(` 缺席）· 无 `SHOUCANG_RELEASE_AUTO` 开关（= 接上就自动改写用户库）
//   · 无 `executable` 门（over-permissive 警报形同虚设）· 把 `relRes` 计进 `otherChannels`（会让失败轮被误判 landed）
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

let R = null
try { R = await import(new URL('../lib/essence-release.js', import.meta.url).href) } catch { /* 缺件 */ }
if (!R || typeof R.applyRelease !== 'function') {
  console.log('  ❌ lib/essence-release.js 缺 applyRelease（先跑 npm run build:host）')
  console.log(`\n结果: ${pass} PASS / ${fail + 1} FAIL`); process.exit(1)
}

/* ── A 静态：接线点 5 项（**先红**：改造前 `applyRelease` 全仓只在自身定义处出现） ── */
{
  const src = readFileSync(join(ROOT, 'src', 'deepsleep-run.ts'), 'utf8')
  const importLine = (src.match(/import \{[^}]*\} from '\.\/essence-release\.js'/) || [''])[0]
  importLine.includes('applyRelease') ? ok('A1 断链已接：`deepsleep-run` 的 essence-release import 含 `applyRelease`')
    : bad('A1 import 未含 `applyRelease`（出口仍断链）')
  src.includes('await applyRelease(') ? ok('A2 不只是 import：源码确有 `applyRelease(` 调用点')
    : bad('A2 只 import 未调用 ⇒ 出口仍为死路')
  src.includes('SHOUCANG_RELEASE_AUTO') ? ok('A3 默认关闭：执行需显式 `SHOUCANG_RELEASE_AUTO=1`（不设 ⇒ 零写入）')
    : bad('A3 无显式开关 ⇒ 接上即自动改写用户库（不可接受）')
  src.includes('relReview.executable') ? ok('A4 语义门门禁在位：只有 `executable` 才放行（空集 / over-permissive ⇒ 零释放）')
    : bad('A4 缺 `executable` 门 ⇒ over-permissive 警报形同虚设')
  const oc = (src.match(/const otherChannels = \{[\s\S]*?\n\s*\}/) || [''])[0]
  !oc.includes('relRes') ? ok('A5 释放**不进** G-19 landed 判据（`otherChannels` 无 `relRes`）——全库计划计入会让失败轮误判 landed')
    : bad('A5 `relRes` 计进 otherChannels ⇒ 水位误推进、材料静默丢弃')
  // ★C（2026-09-19 用户授权「全部做」）：开关**双通道**（持久配置 ∪ env）+ schema 同名键（面板通道）
  src.includes('liveAutoSwitch') && src.includes("'releaseAuto'") && src.includes('scheduler.json')
    ? ok('A3b 开关双通道：持久配置 `scheduler.json#releaseAuto` ∪ env（**实时读取** ⇒ 改完即生效、不必重载）')
    : bad('A3b 只认 env ⇒ 面板通道开不了（用户只能到部署侧改环境变量）')
  readFileSync(join(ROOT, 'src', 'scheduler.ts'), 'utf8').includes('releaseAuto: z.boolean().default(false)')
    ? ok('A3c schema 含 `releaseAuto`（面板 `/deepsleep/config` 白名单由 schema 派生 ⇒ UI 可读可写）')
    : bad('A3c schema 无该键 ⇒ 面板通道读不到/写不了')
}

/* ── B 行为：fail-closed 三分支（真调 `applyRelease`）── */
{
  const bank = mkdtempSync(join(tmpdir(), 'sc-rel-'))
  mkdirSync(join(bank, 'notes'), { recursive: true })
  const row = '[原则] 探针行 · 先查 PATH 再改脚本，逐条核对后回滚 → notes/env.md §探针节'
  writeFileSync(join(bank, 'AGENT.md'), `- ${row}\n`, 'utf8')
  writeFileSync(join(bank, 'notes', 'env.md'), '# env\n\n## 探针节\n- 正文\n', 'utf8')
  const ops = R.releaseOpsFromPlan(R.planRelease(bank)).ops
  ops.length === 1 ? ok(`B0 夹具成立：字面自足行 ⇒ 1 条 release op（notes/env.md §探针节）`) : bad(`B0 夹具不成立：ops=${ops.length}`)
  // 批准清单的口径 = **计划里的逐字行**（`planRelease` 的 `candidates[].row`，含行首 `- `）——
  //   ⚠ 这里必须取真身而不是自己拼：拼错一个前缀就会把"批准"变成"不在清单"，B2/B3 会互相掩盖。
  const planRow = R.planRelease(bank).candidates[0].row

  let calls = 0
  const applyOps = async (list) => { calls += list.length; return { archived: list.length, kept: 0, skipped: 0 } }
  const r1 = await R.applyRelease(bank, ops, [], applyOps)
  r1.released === 0 && r1.reasons.length > 0 && calls === 0
    ? ok('B1 语义清单为空 ⇒ **零释放**且零写入（fail-closed 第①重）') : bad(`B1 ${JSON.stringify({ ...r1, calls })}`)
  const r2 = await R.applyRelease(bank, ops, ['与库内任何行都不相等的串'], applyOps)
  r2.released === 0 && calls === 0
    ? ok('B2 批准清单**不含该行** ⇒ 零释放（防"调用方自报自足"）') : bad(`B2 ${JSON.stringify({ ...r2, calls })}`)
  const r3 = await R.applyRelease(bank, ops, [planRow], applyOps)
  r3.released === 1 && calls === 1
    ? ok('B3 **放行分支**：显式批准 ⇒ 经 `applyOps` 归档 1 条（出口真的能用，不是恒零）')
    : bad(`B3 ${JSON.stringify({ ...r3, calls })}`)
  // 反例自证：把"当下复核"打断（候选行被改掉）⇒ 必须不释放（第六道保护：不接受陈旧计划）
  writeFileSync(join(bank, 'AGENT.md'), '- [原则] 探针行 · 短 → notes/env.md §探针节\n', 'utf8')
  const r4 = await R.applyRelease(bank, ops, [planRow], applyOps)
  r4.released === 0 ? ok('B4 反例自证：库状态已变（行不再自足）⇒ 当下复核拦下，零释放')
    : bad('B4 陈旧计划仍被释放（复核失效）')
  rmSync(bank, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
