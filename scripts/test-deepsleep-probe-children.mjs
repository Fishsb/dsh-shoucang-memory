#!/usr/bin/env node
// test-deepsleep-probe-children.mjs — 深睡探针「**父转录无增长但子代理在跑**」判据（2026-09-16）
//
// 守什么：深睡父会话 **await 子代理**（归因 / 收益 / 语义复核共 8 个）期间**本就不写自己的转录**
//   ⇒ 只看父转录，"正常等待"必然满足「连续 confirm 轮无增长」⇒ **stall 是系统性的**
//   （实测：32 条 stall 的 `idleMin` 全为 58–66 分钟，含**仅触发数分钟**的新会话）。
//   判据（与 `distill-parent.ts:44/#hasActiveSubagents` 的 **live 枚举通道**同源）：
//   有**活跃**子代理（`origin==='subagent'` + **归属本会话** + `status!=='idle'`）⇒ 判 `long-run`。
//
// **先红后绿**：本件入口 A 断言 `long-run` + `viaChildren`；**修复前**探针无该分支 ⇒ 必然落 `stall` ⇒ A 红。
//   ⚠ 同时用 C/D **反向自证**护栏未削弱（存在但空闲 / 归属别人 ⇒ 仍判 stall）——
//     若只写"变绿"的断言，就可能把护栏削没了还全绿（仓内"空转判据"同族）。
//
// 用法: node scripts/test-deepsleep-probe-children.mjs
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeSession } from '../lib/deepsleep-probe.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`) } else { fail++; console.log(`  ❌ ${m}`) } }

const dir = mkdtempSync(join(tmpdir(), 'probe-'))
const file = join(dir, 'session-abcdef12.jsonl')
writeFileSync(file, '{"seq":1}\n', 'utf8')

/** 跑一次探针并等它出结论（`probeSession` 内部是 async IIFE ⇒ 轮询结论字段） */
const run = async (childAgents) => {
  const audits = []
  const rec = { sid: 'session-abcdef12', state: 'idle', lastEventAt: Date.now() - 60 * 60 * 1000, stallRound: 0 }
  const ctx = {
    agents: {
      get: (id) => childAgents.find((a) => a.id === id) || (id === rec.sid ? { status: 'idle' } : null),
      list: () => childAgents,
    },
  }
  const d = {
    log: () => { /* 静默 */ }, audit: (o) => audits.push(o), ctx,
    config: { deepSleepProbeSamples: 1, deepSleepProbeConfirm: 1, deepSleepProbeRetries: 1, deepSleepProbeWindowMs: 5000, deepSleepProbeMaxMs: 8000 },
    locateTranscript: async () => file,
  }
  probeSession(d, rec)
  for (let i = 0; i < 60 && !rec.probeResult; i++) await new Promise((r) => setTimeout(r, 50))
  return { rec, audits }
}

console.log('深睡探针 · 子代理活跃判据（行为级）')

// A **本会话的活跃子代理** ⇒ long-run（修复前必然 stall ⇒ 本件先红）
{
  const { rec, audits } = await run([{ id: 'child-1', status: 'running', session: { header: { origin: 'subagent', parentSession: 'session-abcdef12' } } }])
  ok(rec.probeResult === 'long-run', `A 父转录无增长 + **本会话子代理 running** ⇒ \`long-run\`（实测 ${rec.probeResult}）`)
  const a = audits.find((x) => x.result === 'long-run')
  ok(!!a && a.viaChildren === true, 'A 审计标 `viaChildren:true`（可分辨"因父增长"与"因子代理"两种长任务）')
  ok(rec.lastEventAt > Date.now() - 5000, 'A **顺手刷新了 `lastEventAt`** ⇒ 修正 `idleMin` 基准（它原先只在"确认长任务"分支刷新）')
  ok(rec.stallRound === 0, 'A `stallRound` 归零（不算一次无增长）')
}

// B 无子代理 ⇒ 仍判 stall（**护栏未削弱**）
{
  const { rec } = await run([])
  ok(rec.probeResult === 'stall', `B 无子代理 + 父转录无增长 ⇒ 仍判 \`stall\`（实测 ${rec.probeResult}）——护栏未被削弱`)
}

// C 子代理**存在但空闲** ⇒ 仍判 stall（要求"在跑"，不是"存在"）
{
  const { rec } = await run([{ id: 'child-2', status: 'idle', session: { header: { origin: 'subagent', parentSession: 'session-abcdef12' } } }])
  ok(rec.probeResult === 'stall', `C 子代理**空闲** ⇒ 仍判 \`stall\`（实测 ${rec.probeResult}）——不因"有子代理"就放行`)
}

// D 子代理归属**别的父会话** ⇒ 仍判 stall（归属必须对上）
{
  const { rec } = await run([{ id: 'child-3', status: 'running', session: { header: { origin: 'subagent', parentSession: 'session-其它会话' } } }])
  ok(rec.probeResult === 'stall', `D 子代理归属**别的会话** ⇒ 仍判 \`stall\`（实测 ${rec.probeResult}）——归属必须对上`)
}

// E 非 subagent 的活跃会话 ⇒ 仍判 stall（只认子代理来源）
{
  const { rec } = await run([{ id: 'child-4', status: 'running', session: { header: { origin: 'user', parentSession: 'session-abcdef12' } } }])
  ok(rec.probeResult === 'stall', `E `+"`origin!=='subagent'`"+` ⇒ 仍判 \`stall\`（实测 ${rec.probeResult}）`)
}

rmSync(dir, { recursive: true, force: true })
console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
console.log('⚠ 边界：本件**只测判据分支**（假 ctx）——真实子代理活动的端到端验证需真机触发深睡。')
process.exit(fail ? 1 : 0)
