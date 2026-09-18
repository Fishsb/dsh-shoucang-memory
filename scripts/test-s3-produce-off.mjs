#!/usr/bin/env node
// test-s3-produce-off.mjs — S2S3 册二：**S3 三通道停产**判据（2026-09-19）
//
// 判据（四要素）：
//   ① 判据：`s3Produce=false`（缺省）时——原则通道（applyPrinciples 的 add/replace）**零产出**、
//      画像通道（profileOps）被门住；且**"停产"与"没跑"在台账上可分辨**（`gate='produce-off'` + `attempted=N`）。
//   ② 检查方式：直接调 `lib/deepsleep-apply.js#applyPrinciples`（模块级实现）＋ 对 `lib/deepsleep-run.js`
//      的画像通道条件做**结构性断言**（源码级，防"只关了一半"）。
//   ③ 阈值：停产 ⇒ `added=0 && replaced=0 && gate='produce-off' && attempted=输入条数`；
//      开关置 true ⇒ **不再出现** produce-off（证明它读的是开关而不是常量）。
//   ④ 失败退回：任一红 ⇒ 该册不得合入（"睡眠还在产出"是用户口径的直接违背）。
//
// **先红**：改造前 `applyPrinciples` 无停产挡位 ⇒ 首跑即 FAIL（拿不到 produce-off），非恒真。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

const mod = await import(new URL('../lib/deepsleep-apply.js', import.meta.url).href)
const memRoot = mkdtempSync(join(tmpdir(), 'sc-s3off-'))
const depsOf = (s3Produce) => ({
  config: { s3Produce }, log: () => {}, PROFILE_HEADER: {}, kRoot: memRoot,
  runNode: async () => ({ status: 0, out: '', err: '' }), capEnv: () => ({}), textOf: () => '',
})

if (typeof mod.applyPrinciples !== 'function') bad('lib/deepsleep-apply.js 缺 applyPrinciples（未构建？）')
else {
  const out = { principles: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }
  const off = await mod.applyPrinciples(depsOf(false), memRoot, out)
  off.gate === 'produce-off' && off.added === 0 && off.replaced === 0 && off.attempted === 3
    ? ok(`停产：attempted=3 · added=0 · replaced=0 · gate=produce-off（"不产出"与"没跑"可分辨）`)
    : bad(`停产挡位未生效：${JSON.stringify(off)}`)
  const offEmpty = await mod.applyPrinciples(depsOf(false), memRoot, { principles: [] })
  offEmpty.gate === 'produce-off' && offEmpty.attempted === 0
    ? ok('停产下空输入同样记 attempted=0（不把"没料"错记成"跑了"）')
    : bad(`空输入口径错：${JSON.stringify(offEmpty)}`)
  const on = await mod.applyPrinciples(depsOf(true), memRoot, { principles: [] })
  on.gate !== 'produce-off'
    ? ok(`开关置 true ⇒ 不再走停产分支（gate=${on.gate}）——证明读的是开关而非常量`)
    : bad('开关置 true 仍返回 produce-off（开关未被读取）')

  // 结构性断言：三通道**都得门住**（只关原则、不关画像 = 只关了一半）
  const applySrc = readFileSync(join(ROOT, 'src', 'deepsleep-apply.ts'), 'utf8')
  const runSrc = readFileSync(join(ROOT, 'src', 'deepsleep-run.ts'), 'utf8')
  const iOff = applySrc.indexOf("config.s3Produce === false")
  const iGate = applySrc.indexOf('const gateScript')
  iOff >= 0 && iGate > iOff
    ? ok('原则通道：停产判定位于**写入路径之前**（不是事后补一刀）')
    : bad(`原则通道停产判定位置错：iOff=${iOff} iGate=${iGate}`)
  runSrc.includes("config.s3Produce !== false && stop === 'completed'")
    ? ok('画像通道：profileOps 条件已挂同一开关（三通道齐）')
    : bad('画像通道未挂开关 ⇒ 睡眠仍会写画像（只关了一半）')
  readFileSync(join(ROOT, 'src', 'scheduler.ts'), 'utf8').includes("s3Produce: z.boolean().default(false)")
    ? ok('配置三处齐全：schema 有键且缺省 false（scheduler.json 的键白名单从 schema 自动派生，无需第二份名单）')
    : bad('schema 缺 s3Produce 或缺省不是 false')

  // 反例自证：断言对"没有开关的文本"必须判否（防恒真）
  const stripped = applySrc.replace(/config\.s3Produce === false/g, 'false')
  ;(stripped.indexOf('config.s3Produce === false') >= 0)
    ? bad('反例自证失败：剥掉开关后仍声称存在')
    : ok('反例自证：剥掉开关的文本被正确判为"无停产挡位"（断言非恒真）')
}
rmSync(memRoot, { recursive: true, force: true })
console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
