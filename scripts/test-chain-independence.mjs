#!/usr/bin/env node
// test-chain-independence.mjs — S3-1「生产链（蒸馏）与维护链（深睡）**独立启停**」行为断言
//   （2026-09-14 · S3 维护链条）
//
// 守什么：`distillEntryOf` 在 `enableDistill === false` 时**只关蒸馏的触发入口**，
//   且**必须保留 `distillAgent`** —— 深睡以它为归纳回调（`write: { distillAgent: agent.distillAgent }`）。
//   若有人图省事把 agent 整体 no-op，本件当场红：那样"关蒸馏"会连带让维护链失去归纳能力，
//   正是 S3 要修的「反向不独立」。
//
// 用法: node scripts/test-chain-independence.mjs   （先 npm run build:host）
// 退出码：0=全过 / 1=有失败
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const mod = await import(new URL('../lib/distill.js', import.meta.url).href)
const { distillEntryOf } = mod
if (typeof distillEntryOf !== 'function') {
  console.log('❌ lib/distill.js 未导出 distillEntryOf（先 npm run build:host）')
  process.exit(1)
}

console.log('S3-1 两链独立启停（蒸馏 ⇄ 深睡）')

/** 造一个最小的 agent 句柄探针：记录「触发入口是否真的被调用」 */
const mkAgent = () => {
  const calls = { armed: 0, ran: 0 }
  const agent = {
    armIdleTimer: () => { calls.armed++ },
    runDistillNow: async () => { calls.ran++; return { ok: true, sessions: 1 } },
    // 深睡的归纳回调（**必须被保留**）：用一个可识别的函数引用做身份断言
    distillAgent: async () => { /* 深睡回调探针 */ },
    parseAgentJson: () => ({}),
  }
  return { agent, calls }
}

// ── ① 缺省（undefined）= 开启：原样返回，触发入口照常工作 ──
{
  const { agent, calls } = mkAgent()
  const got = distillEntryOf(agent, undefined)
  ok(got === agent, '① enableDistill 缺省（undefined）⇒ 原样返回同一句柄（行为与改动前一致）')
  got.armIdleTimer()
  ok(calls.armed === 1, '① 缺省时 armIdleTimer 正常武装')
}

// ── ② true = 开启：同上 ──
{
  const { agent, calls } = mkAgent()
  const got = distillEntryOf(agent, true)
  ok(got === agent, '② enableDistill=true ⇒ 原样返回（不等价即红：说明开关反向）')
  got.armIdleTimer()
  ok(calls.armed === 1, '② true 时 armIdleTimer 正常武装')
}

// ── ③ false = 关蒸馏：触发入口必须 no-op ──
{
  const { agent, calls } = mkAgent()
  const got = distillEntryOf(agent, false)
  ok(got !== agent, '③ enableDistill=false ⇒ 返回包装后的句柄（不再是同一引用）')
  got.armIdleTimer()
  ok(calls.armed === 0, '③ 关蒸馏后 armIdleTimer **不再武装**（自动触发已断）')
  const r = await got.runDistillNow()
  ok(r.ok === false && String(r.note || '').includes('enableDistill=false'), '③ 关蒸馏后 runDistillNow **拒绝执行**并说明原因')
  ok(calls.ran === 0, '③ 关蒸馏后原 runDistillNow **未被调用**')
}

// ── ④ 关键：关蒸馏**必须保留 distillAgent**（深睡回调）──
{
  const { agent } = mkAgent()
  const got = distillEntryOf(agent, false)
  ok(got.distillAgent === agent.distillAgent, '④ **distillAgent 严格保留**（深睡以它为归纳回调）—— 整体 noop 即红')
  ok(typeof got.distillAgent === 'function', '④ distillAgent 仍是可调用函数')
  ok(got.parseAgentJson === agent.parseAgentJson, '④ 其余方法（parseAgentJson）同样保留')
}

// ── ⑤ 反向：深睡自身的门不在此函数管辖（文档级断言，防后人把两链耦合回来）──
{
  const src = readFileSync(join(root, 'src', 'distill.ts'), 'utf8')
  ok(/enableDistill === false/.test(src), '⑤ 判据用 `=== false` 而非 falsy（undefined/true 均视为开启）')
  const sched = readFileSync(join(root, 'src', 'scheduler.ts'), 'utf8')
  ok(/config\.enableDistill \|\| config\.enableDeepSleep/.test(sched), '⑤ scheduler 装配条件为「两者任一开启」（关蒸馏不再连带关深睡）')
  ok(/if \(config\.enableDistill\) \{/.test(sched) === false, '⑤ 旧的「仅 enableDistill」装配条件已移除（否则反向仍不独立）')
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（两链独立启停断言全过）')
process.exit(fail ? 1 : 0)
