#!/usr/bin/env node
// test-situation-key.mjs —— 情境指纹 **直接单测**（src/situation-key.ts · P2 2026-09-14）
//
// 为什么单测它：情境键是「情境层」的唯一入口判据。它错 ⇒ 环记录要么永不命中（功能静默失效），
//   要么乱命中（误注入，代价 > 漏注入）。且它必须**确定性**（同输入同输出），否则候选序不可复现、
//   审计无法对账。
// 用法: node scripts/test-situation-key.mjs     （先 npm run build:host；npm test 已含 pretest）
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (p) => new URL('../' + p, import.meta.url).href
const S = await import(load('lib/situation-key.js'))

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`) } else { fail++; console.log(`  ❌ ${m}`) } }

console.log('情境指纹（situation-key）')

// ── ① 维度序与取值 ──
{
  const ctx = { scope: 'workspace:/repo', task: 'build', subject: 'user', event: 'decision.consolidate' }
  const c = S.cuesOf(ctx)
  ok(c.length === 4, '四维齐全时产出 4 个键')
  ok(c[0] === 'scope=workspace:/repo', '第一键按**注册表维度序**（scope 先）而非对象键序')
  ok(c[3] === 'event=decision.consolidate', '末键为 event')
  ok(JSON.stringify(S.cuesOf(ctx)) === JSON.stringify(c), '确定性：同输入 ⇒ 同输出')
}

// ── ② 空值 / 去重 / 未知维度 ──
{
  ok(S.cuesOf({ scope: '', task: 'build' }).length === 1, '空串值被丢弃')
  ok(S.cuesOf({ scope: '   ', task: ' build ' })[0] === 'task=build', '值做 trim')
  const dup = S.cuesOf({ scope: 'a', scope2: 'a' })
  ok(dup.length === 1, '未知维度 scope2 被跳过（零抛出），且不产生重复键')
  let threw = false
  try { S.cuesOf({ totallyUnknown: 'x' }) } catch { threw = true }
  ok(!threw, '全未知维度不抛（零抛出纪律）')
  ok(S.cuesOf({}).length === 0, '空上下文 ⇒ 空键集')
  ok(S.cuesOf({ scope: 'x' }, ['bogus', 'scope'])[0] === 'scope=x', '注册表给非法维度名时跳过而非崩')
}

// ── ③ 交集（匹配判据的唯一实现）──
{
  const a = ['scope=w', 'task=build', 'subject=user']
  const b = ['subject=user', 'scope=w', 'event=x']
  const ov = S.cueOverlap(a, b)
  ok(ov.length === 2, '交集大小正确（2）')
  ok(ov[0] === 'scope=w' && ov[1] === 'subject=user', '交集**保留 a 的顺序**（可复现）')
  ok(S.cueOverlap(a, []).length === 0 && S.cueOverlap([], b).length === 0, '任一侧为空 ⇒ 空交集')
  ok(S.cueOverlap(a, ['nope=1']).length === 0, '无共同键 ⇒ 不匹配')
  ok(S.cueOverlap(['x=1', 'x=1'], ['x=1']).length === 1, '交集内去重')
}

// ── ④ createSituationKeyApi：句柄口径 ──
{
  const api = S.createSituationKeyApi({ dims: ['subject', 'scope'] })
  const c = api.cuesOf({ scope: 'w', subject: 'agent', task: 'build' })
  ok(c.length === 2 && c[0] === 'subject=agent', 'api 按给定维度与序产出（task 不在维度内 ⇒ 丢弃）')
  ok(api.matches(['a=1'], ['a=1']) === true && api.matches(['a=1'], ['b=2']) === false, 'matches 布尔正确')
  const d = S.createSituationKeyApi()
  ok(JSON.stringify(d.cuesOf({ scope: 'w' })) === JSON.stringify(S.cuesOf({ scope: 'w' })), '缺省维度 = 内置缺省（空 deps 不改变语义）')
}

// ── ⑤ 零依赖常量 ──
{
  ok(Array.isArray(S.DEFAULT_CUE_DIMS) && S.DEFAULT_CUE_DIMS.length === 4, 'DEFAULT_CUE_DIMS 暴露 4 维（供调用方零依赖取用）')
  ok(S.DEFAULT_CUE_DIMS.join(',') === 'scope,task,subject,event', 'DEFAULT_CUE_DIMS 与注册表缺省值一致')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
