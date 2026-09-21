#!/usr/bin/env node
/**
 * test-eval-ingest-audit.mjs — 评估通道**真实消费者**的行为判据（ACT-293 · 方案档 A4 另一半）
 *
 * 判因：A4 原文「新件**有真实消费者** + 登记」。消费者已接（蒸馏索引行落盘后只读复核），
 *   本件守它的**行为契约**——尤其是三条最容易变成"假接线"的地方：
 *     ① 关闭态**必须零接线**（钩子为 undefined，装配层不传）
 *     ② 端基址为空 / 拆不出主题概况 ⇒ **未判**（返回 off，不放行也不误拒）
 *     ③ 任何异常 ⇒ **放行**，绝不打断蒸馏主线
 *
 * ⚠ 能力（是否够准）**不在本件**——由 `_memory/audit/consumer-compare.mjs` 的三模型真库
 *   对照回答（假阳性 15–50%）。本件只守**接线与契约**。
 * 退出码：0 pass / 1 fail / 3 skip（未 build）
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`) } else { fail++; console.log(`  ❌ ${m}`) } }

console.log('══ test-eval-ingest-audit ══')

const LIB = join(ROOT, 'lib', 'eval-ingest-audit.js')
if (!existsSync(LIB)) { console.log('⏭ skip：lib/eval-ingest-audit.js 不存在（先 npm run build:host）'); process.exit(3) }
const M = await import(`file://${LIB.replace(/\\/g, '/')}`)

/* ── A 配置门 ── */
console.log('\nA 配置门（关闭态必须零接线）')
const ioNoop = { audit: () => {} }
for (const [label, cfg] of [
  ['缺省 undefined', undefined],
  ['evalEnabled=false', { evalEnabled: false }],
  ['evalEnabled 非布尔("true" 字符串)', { evalEnabled: 'true' }],
  ['evalEnabled=null', { evalEnabled: null }],
  ['空对象', {}],
]) {
  const h = M.ingestAuditOf(cfg, ioNoop)
  ok(h === undefined, `${label} ⇒ 不建钩子（实测 ${h === undefined ? 'undefined' : 'typeof ' + typeof h}）`)
}
{
  const h = M.ingestAuditOf({ evalEnabled: true, evalBaseUrl: 'http://127.0.0.1:11434/v1' }, ioNoop)
  ok(typeof h === 'function', 'evalEnabled=true ⇒ 建钩子（反例自证：门不是恒 undefined）')
}

/* ── B 拆解器 ── */
console.log('\nB 索引行拆解')
for (const [line, wantT, wantS] of [
  ['[lesson] 网络坑 · 代理分通道/重钉合并 → notes/lessons.md §网络坑', '网络坑', '代理分通道/重钉合并'],
  ['- [env] DSH 环境 · 数据目录/3080 → notes/env.md §DSH 环境', 'DSH 环境', '数据目录/3080'],
  ['[原则] 代理指标非判据 · 心跳不等运行态', '代理指标非判据', '心跳不等运行态'],
]) {
  const r = M.splitIndexLine(line)
  ok(!!r && r.topic === wantT && r.summary === wantS, `拆解「${line.slice(0, 32)}…」⇒ ${JSON.stringify(r)}`)
}
for (const [line, why] of [
  ['[lesson] 只有主题没有分隔符', '无 · 分隔'],
  ['没有标签也没分隔符', '无标签无分隔'],
  ['[lesson] 主题 · ', '概况为空'],
  ['[lesson]  · 概况', '主题为空'],
]) {
  const r = M.splitIndexLine(line)
  ok(r === null, `不合法输入（${why}）⇒ null（实测 ${JSON.stringify(r)}）`)
}

/* ── C/D/E 判定语义（走真实 evaluate 的零网络分支）── */
console.log('\nC/D/E 判定语义')
{
  const recs = []
  const d = {
    cfg: { evalEnabled: false, evalBaseUrl: '', evalModel: '', evalApiKeyEnv: 'K', evalTier: 'local', evalEgressAllow: false },
    env: () => undefined, audit: (r) => recs.push(r),
  }
  const r = await M.auditIndexLine(d, '[lesson] 主题 · 概况 → notes/lessons.md §X', { sid: 's', target: 'MEMORY.md' })
  ok(r === 'off', `通道关 ⇒ 'off'（实测 ${JSON.stringify(r)}）`)
  ok(recs.length === 0, `通道关 ⇒ **不落账**（实测 ${recs.length} 条）`)
}
{
  const recs = []
  const d = {
    cfg: { evalEnabled: true, evalBaseUrl: '', evalModel: '', evalApiKeyEnv: 'K', evalTier: 'local', evalEgressAllow: false },
    env: () => undefined, audit: (r) => recs.push(r),
  }
  const r = await M.auditIndexLine(d, '[lesson] 主题 · 概况 → notes/lessons.md §X', { sid: 's', target: 'MEMORY.md' })
  ok(r === 'off', `端基址为空 ⇒ 'off'（不误判，实测 ${JSON.stringify(r)}）`)
}
{
  const recs = []
  const d = {
    cfg: { evalEnabled: true, evalBaseUrl: 'http://127.0.0.1:1/v1', evalModel: 'm', evalApiKeyEnv: 'K', evalTier: 'local', evalEgressAllow: false },
    env: () => undefined, audit: (r) => recs.push(r),
  }
  let threw = null, r
  try { r = await M.auditIndexLine(d, '[lesson] 主题 · 概况 → notes/lessons.md §X', { sid: 's', target: 'MEMORY.md' }) }
  catch (e) { threw = e }
  ok(threw === null, `后端不可达 ⇒ **不抛异常**（${threw ? '抛 ' + threw.message : '未抛'}）`)
  ok(r === 'off', `后端不可达 ⇒ 'off'（放行，实测 ${JSON.stringify(r)}）`)
  ok(recs.length >= 1, `后端不可达 ⇒ **仍落账**（分态可辨，实测 ${recs.length} 条）`)
  if (recs.length) {
    const rec = recs[0], has = (k) => Object.prototype.hasOwnProperty.call(rec, k)
    ok(has('outcome') && has('tier') && has('modelId') && has('destHost') && has('destLoopback'),
      '落账含四问字段（outcome/tier/modelId/destHost/destLoopback）')
    ok(rec.point === 'distill-ingest', `落账 point=distill-ingest（实测 ${rec.point}）`)
    ok(rec.outcome === 'unreachable', `分态 = unreachable（**不塌缩**，实测 ${rec.outcome}）`)
  }
}

/* ── F 消费者接线（A4 正判据）── */
console.log('\nF 消费者接线（A4 判据）')
{
  const dw = readFileSync(join(ROOT, 'src', 'distill-write.ts'), 'utf8')
  ok(/dep\.auditIndexLine\(/.test(dw), 'distill-write.ts 调用 `dep.auditIndexLine(...)`（真实消费点）')
  ok(/auditIndexLine\?\s*\(/.test(dw), 'WriteDeps 声明可选钩子（缺省 undefined ⇒ 零行为变化）')
  const dt = readFileSync(join(ROOT, 'src', 'distill.ts'), 'utf8')
  ok(/writeDepsOf\(/.test(dt), 'distill.ts 经 writeDepsOf 装配（I1 ≤120 行的抽出形态）')
  ok(/ingestAuditOf\(/.test(dt), 'distill.ts 调 `ingestAuditOf(...)`')
  ok(/import \{ ingestAuditOf \}/.test(dt), 'distill.ts 导入 ingestAuditOf')
  ok(!/dep\.auditIndexLineTypo\(/.test(dw), '反例自证：写错的钩子名 ⇒ 不存在（断言语义有效）')
}

console.log(`\n════ ${pass} pass / ${fail} fail ════`)
process.exit(fail ? 1 : 0)
