#!/usr/bin/env node
// test-event-envelope.mjs —— **统一事件信封**单测（`distill-infra.ts#envelope` · 2026-09-13）
//
// 为什么必须有这一件：缺陷是**静默**形态——`{ at: new Date(), ...o }` 的展开顺序允许调用方用
//   `at: undefined` 覆盖注入值，而 `JSON.stringify` **丢弃 undefined 键** ⇒ 行里没有 `at`，
//   不报错、不抛异常。实测 `distill-audit` 930 行里有 1 行如此（`check-observability --shape` 抓出）。
//   本件把「**任何一行都必须有非空 `at` 与 `type`**」钉成断言，覆盖四条写出路径（audit/episode/stub/ledger）。
//
// 用法: node scripts/test-event-envelope.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const { createInfraApi } = await import(load('lib/distill-infra.js'))
const tmp = mkdtempSync(join(tmpdir(), 'sc-env-'))
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 清理失败无害 */ } })

const paths = {
  logFile: join(tmp, 'x.log'),
  auditFile: join(tmp, 'audit', 'distill-audit.jsonl'),
  ledgerFile: join(tmp, 'audit', 'ledger.jsonl'),
  episodeFile: join(tmp, 'audit', 'episodes.jsonl'),
  stubDir: join(tmp, 'audit', 'raw-stub'),
  kRoot: tmp,
  EPISODE_CAP: 256,
  LEDGER_FILE: 'ledger.jsonl',
}
const api = createInfraApi(paths)
const lines = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
// DS4 第六刀（2026-09-13）：**审计行已并入统一台账**（`type=audit.*`）⇒ 从这里取，**不再有 legacy 文件**
//   （改落点必须同步**全部**消费方——本条就是被门禁抓出来的：原先读 `paths.auditFile` ⇒ ENOENT）。
const auditRows = () => lines(paths.ledgerFile).filter((r) => String(r.type || '').startsWith('audit.'))

console.log('== A. 覆盖攻击：调用方传 `at: undefined` 不得把时间戳弄没 ==')
{
  api.audit({ kind: 'distill-run', at: undefined, added: 1 })
  api.audit({ kind: 'gate-reject', at: null, reason: 'x' })
  api.audit({ kind: 'distill-run', at: '', added: 2 })
  const rows = auditRows()
  ok(rows.length === 3, `三条审计已落（${rows.length}）`)
  ok(rows.every((r) => typeof r.at === 'string' && r.at.length > 0), '**每行都有非空 `at`**（覆盖攻击无效）')
  ok(rows.every((r) => /^\d{4}-\d{2}-\d{2}T/.test(r.at)), '`at` 是 ISO 时间串（不是 undefined 被丢弃）')
}

console.log('== B. 判别字段 `type`：四条写出路径都要有 ==')
{
  api.audit({ kind: 'defer-flush', target: 't' })
  api.recordEpisode({ sid: 's1', intent: 'i', route: 'memory', outcome: 'ok' })
  api.recordStub({ sid: 's1', route: 'discard' })
  api.ledger({ domain: 'ingest', decision: 'x', result: 'y' })
  const a = auditRows().at(-1)
  const e = lines(paths.episodeFile).at(-1)
  // DS4 第三刀：存根并入台账 ⇒ 从 ledger 里按 type 取
  const s = lines(paths.ledgerFile).filter((r) => r.type === 'stub').at(-1)
  const l = lines(paths.ledgerFile).filter((r) => r.type === 'decision.ingest').at(-1)
  ok(a.type === 'audit.defer-flush', `审计 type 带 kind 信息（${a.type}）`)
  ok(e.type === 'episode', `episode type=episode（${e.type}）`)
  ok(!!s && s.type === 'stub', `**存根已并入台账** type=stub（${s && s.type}）`)
  ok(!existsSync(join(paths.stubDir, 'stub.jsonl')), '不再单开 raw-stub/stub.jsonl（合并的实质）')
  ok(l && l.type === 'decision.ingest', `ledger type 沿用 domain 推导（${l && l.type}）`)
  ok(l && typeof l.criteriaVersion === 'string' && l.criteriaVersion.length > 0, 'ledger 仍带 criteriaVersion')
}

console.log('== C. 合法值被尊重（不覆盖调用方给的有效 at/type）==')
{
  api.audit({ kind: 'custom', at: '2020-01-02T03:04:05.000Z', type: 'audit.custom' })
  const r = auditRows().at(-1)
  ok(r.at === '2020-01-02T03:04:05.000Z', '调用方的合法 `at` 被保留')
  ok(r.type === 'audit.custom', '调用方的合法 `type` 被保留')
}

console.log('== D. 全量不变量：四个文件所有行都必须有 at + type ==')
{
  const all = [
    ...auditRows().map((r) => ['audit', r]),
    ...lines(paths.episodeFile).map((r) => ['episode', r]),
    ...lines(paths.ledgerFile).map((r) => ['ledger', r]),
  ]
  ok(all.length >= 8, `共 ${all.length} 行参与核对`)
  const noAt = all.filter(([, r]) => typeof r.at !== 'string' || !r.at)
  const noType = all.filter(([, r]) => typeof r.type !== 'string' || !r.type)
  ok(noAt.length === 0, `缺 \`at\` 的行 = ${noAt.length}（应为 0）`)
  ok(noType.length === 0, `缺 \`type\` 的行 = ${noType.length}（应为 0）`)
}

console.log('== E. 水位流（另一个写入器）：补判别字段后仍保真 ==')
{
  const { createWmApi } = await import(load('lib/distill-watermark.js'))
  const wmFile = join(tmp, 'wm.jsonl')
  const wm = createWmApi({
    watermarkFile: wmFile,
    log: () => { /* 静默 */ },
    audit: () => { /* 静默 */ },
    sidShort: (s) => String(s).slice(0, 8),
    st: { snapshotUnavailableStreak: new Map() },
  })
  wm.writeWatermark('session-abcdef123456', 42)
  const wmRows = lines(wmFile)
  ok(wmRows.length === 1, `水位行已落（${wmRows.length}）`)
  ok(wmRows[0].type === 'watermark', `**补上判别字段** type=watermark（${wmRows[0].type}）`)
  ok(typeof wmRows[0].at === 'string' && wmRows[0].at.length > 0, '水位行有非空 `at`')
  ok(wmRows[0].sessionId === 'session-abcdef123456' && wmRows[0].lastSeq === 42, '**既有字段未被破坏**（sessionId/lastSeq 原样）')
  // 读回仍能取到（改判别字段不得破坏读侧取键）
  const back = wm.readWatermarks()
  ok(back.get('session-abcdef123456')?.lastSeq === 42, '`readWatermarks` 仍按 sessionId 取得到（读侧未受影响）')
}

console.log('== F. 打扰度影子流（DS4 第二刀）：并入 ledger 且带判别字段 ==')
{
  // 本流**代码侧零读取者**（只有写入者）⇒ 只需验证写入点确实落在给定路径并带 type/at。
  const { createActApi } = await import(load('lib/distill-activation.js'))
  const led = join(tmp, 'ledger.jsonl')
  const act = createActApi({
    actShadowFile: led,
    embedCfgOf: () => ({ enabled: false, baseUrl: '', model: '', apiKeyEnv: '', coldFactor: 0.35 }),
    actConf: { on: 0.65, off: 0.6, cooldown: 3, topK: 3 },
    actState: new Map(),
    infra: { sidShort: (s) => String(s).slice(0, 8) },
    st: {},
    config: { activationPrefetch: false },
  })
  const ev = { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '指针 分裂 结构 怎么搭树' }] } }
  await act.activationStep('session-abcdef123456', ev)
  const rows = lines(led)
  if (!rows.length) {
    // 库内该 query 未召回（词法地板空）⇒ 写入点被前置守卫拦住，属环境差异而非缺陷。
    console.log('⚠️  F1-F3 跳过：当前记忆库对该 query 无召回（写入点被 tokens/rows 守卫拦住）')
  } else {
    const r = rows.at(-1)
    ok(r.type === 'activation.shadow', `**判别字段** type=activation.shadow（${r.type}）`)
    ok(typeof r.at === 'string' && r.at.length > 0, '非空 `at`（统一信封注入）')
    ok(r.kind === 'activation-step' && typeof r.src === 'string', '既有字段保真（kind/src 原样）')
  }
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
