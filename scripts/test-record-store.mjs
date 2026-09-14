#!/usr/bin/env node
// test-record-store.mjs —— P4 Record 事实源 **直接单测**（record-store.ts / record-shadow.ts）
//
// 为什么必须有这一件（P4 是数据安全级改动，方案档 §12 风险 2）：
//   「切事实源」的唯一安全网是**逐字节可重现**。这条不能靠"跑一次看看"，必须有断言钉死：
//   混用 CRLF/LF、空行、无尾换行、结构行/无标签行——任一走形都会静默改写用户的记忆库。
//   本件直接 import 编译产物 lib/record-store.js 与 lib/record-shadow.js，用临时夹具库真读写。
//
// 断言口径：标签→类别**从注册表 CARRIERS 派生**（不抄第二份名单）；夹具用 mkdtemp，绝不碰真库。
//
// 用法: node scripts/test-record-store.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
let fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const S = await import(load('lib/record-store.js'))
const H = await import(load('lib/record-shadow.js'))
const { CARRIERS } = await import(load('lib/criteria.generated.js'))
const CARRIER_TAGS = CARRIERS.tags || {}

const tmp = mkdtempSync(join(tmpdir(), 'sc-record-'))
const cleanups = [tmp]
process.on('exit', () => { for (const d of cleanups) { try { rmSync(d, { recursive: true, force: true }) } catch { /* 清理失败无害 */ } } })

console.log('== A. 指纹与 id（内容派生 ⇒ 天然去重）==')
{
  ok(S.fingerprint('abc') === S.fingerprint('abc'), '同文同指纹（稳定）')
  ok(S.fingerprint('abc') !== S.fingerprint('abd'), '一字之差即换指纹')
  const r1 = S.makeRecord({ text: '- [env] A · B → notes/env.md §X', file: 'MEMORY.md' })
  const r2 = S.makeRecord({ text: '- [env] A · B → notes/env.md §X', file: 'MEMORY.md' })
  ok(r1.id === r2.id, 'id 由内容派生（同内容同 id）')
  ok(r1.id.startsWith('knowledge:fact:'), `id 形态 subject:kind:fp（= ${r1.id}）`)
  ok(S.makeRecord({ text: 'x', file: 'USER.md' }).id.startsWith('user:'), '主体从文件名派生（USER.md → user）')
  ok(S.makeRecord({ text: 'x', file: 'AGENT.md' }).id.startsWith('agent:'), '主体从文件名派生（AGENT.md → agent）')
  ok(S.makeRecord({ text: 'x', file: 'MEMORY.md', subject: 'companion:ana' }).id.startsWith('companion:ana:'), 'companion:<id> 主体可用（新增主体零架构改动）')
}

console.log('== B. 标签 → 类别：从注册表 CARRIERS 派生（不抄第二份名单）==')
{
  const pTag = Object.keys(CARRIER_TAGS).find((t) => CARRIER_TAGS[t].layer === 'P' && CARRIER_TAGS[t].inject === 'always')
  const rTag = Object.keys(CARRIER_TAGS).find((t) => CARRIER_TAGS[t].layer === 'R')
  const eTag = Object.keys(CARRIER_TAGS).find((t) => CARRIER_TAGS[t].layer === 'E')
  ok(!!pTag && S.kindOfLine(`- [${pTag}] x`, pTag) === 'persona', `P 层标签 ${pTag} → persona（注册表驱动）`)
  ok(!!rTag && S.kindOfLine(`- [${rTag}] x`, rTag) === 'procedure', `R 层标签 ${rTag} → procedure（注册表驱动）`)
  ok(!!eTag && S.kindOfLine(`- [${eTag}] x`, eTag) === 'fact', `E 层标签 ${eTag} → fact（注册表驱动）`)
  ok(S.kindOfLine('- [不存在的标签] x', '不存在的标签') === 'fact', '未知标签 → fact（不崩）')
  ok(S.kindOfLine('# 标题', '') === 'structure', '标题行 → structure')
  ok(S.kindOfLine('> 引用', '') === 'structure', '引用行 → structure')
  ok(S.kindOfLine('', '') === 'blank', '空行 → blank')
  ok(S.kindOfLine('- 无标签散文', '') === 'prose', '无标签列表行 → prose')
  ok(S.tagOfLine('- [env] x') === 'env' && S.tagOfLine('[env] x') === 'env', '两种标签写法都取到')
  ok(S.pointerOfLine('- [env] A · B → notes/env.md §X') === 'notes/env.md', '指针抽取')
  ok(S.sourceOfLine('- x ← 源: notes/a.md §B') === 'notes/a.md §B', '源锚抽取（含小节段，与既有记录导出同口径）')
  ok(S.sourceOfLine('- x ← 源: distill e739b514 2026-09-12') === 'distill e739b514', '源锚抽取（蒸馏落款形态）')
}

console.log('== C. 往返：逐字节重现（含 CRLF/LF 混用、空行、无尾换行）==')
{
  const cases = {
    'CRLF': 'a\r\nb\r\n',
    'LF': 'a\nb\n',
    '混用': 'a\r\nb\nc',
    '无尾换行': 'a\nb',
    '连续空行': 'a\n\n\nb\n',
    '空文件': '',
    '仅换行': '\n',
    '中文与标记': '# 标题\n- [env] 中文 · 概况 → notes/env.md §节\n\n尾部',
  }
  for (const [name, raw] of Object.entries(cases)) {
    const recs = S.parseRecords(raw, 'MEMORY.md')
    ok(S.renderFile(recs, 'MEMORY.md') === raw, `往返逐字节一致：${name}（${recs.length} 记录 / ${raw.length}B）`)
  }
  const recs = S.parseRecords('a\nb\n', 'MEMORY.md')
  ok(recs[0].eol === '\n' && recs[1].eol === '\n', 'eol 逐行保留（还原的关键）')
  const crlf = S.parseRecords('a\r\nb', 'MEMORY.md')
  ok(crlf[0].eol === '\r\n' && crlf[1].eol === '', '混用时各行 eol 各自保留')
  ok(S.renderAll(recs, ['MEMORY.md']) === 'a\nb\n', 'renderAll 按文件顺序')
  const two = S.parseRecords('x\n', 'MEMORY.md').concat(S.parseRecords('y\n', 'USER.md'))
  ok(S.renderAll(two, ['USER.md', 'MEMORY.md']) === 'y\nx\n', 'renderAll 遵守给定文件顺序')
}

console.log('== D. 去重与差分（upsert / diffRecords）==')
{
  const a = S.makeRecord({ text: '- [env] A', file: 'MEMORY.md', order: 0 })
  const b = S.makeRecord({ text: '- [env] B', file: 'MEMORY.md', order: 1 })
  const r1 = S.upsertRecord([a], b)
  ok(r1.action === 'added' && r1.records.length === 2, 'upsert：新 id → added')
  const r2 = S.upsertRecord([a, b], { ...a })
  ok(r2.action === 'unchanged', 'upsert：同内容 → unchanged（不产生无谓写）')
  const r3 = S.upsertRecord([{ ...a, hits: 7, lastHit: 'T' }], { ...a, lifecycle: 'cold' })
  ok(r3.action === 'replaced' && r3.records[0].hits === 7 && r3.records[0].lifecycle === 'cold', 'upsert：内容变 → replaced 且保留命中统计')
  ok(S.diffRecords([a, b], [a]).removed.length === 1, 'diff：识别删除')
  ok(S.diffRecords([a], [a, b]).added.length === 1, 'diff：识别新增')
  ok(S.diffRecords([a], [{ ...a, lifecycle: 'retired' }]).changed.length === 1, 'diff：识别内容变更')
  ok(S.diffRecords([a], [{ ...a, hits: 9, updatedAt: 'T' }]).changed.length === 0, 'diff：统计/时间戳噪声不算变更')
}

console.log('== E. 生命周期与命中（遗忘=迁移不删除；命中=被用过的证据）==')
{
  const r = S.makeRecord({ text: '- [env] A', file: 'MEMORY.md' })
  ok(S.moveLifecycle(r, 'cold', 'T').lifecycle === 'cold', 'active → cold（迁移）')
  ok(S.moveLifecycle(r, 'retired', 'T').text === r.text, '迁移不改正文（不删除）')
  ok(S.noteHit(r, 'T').hits === 1 && S.noteHit(r, 'T').lastHit === 'T', 'noteHit 记 hits/lastHit')
  ok(S.stampRecord(r, 'T').createdAt === 'T' && S.stampRecord(S.stampRecord(r, 'T'), 'T2').createdAt === 'T', 'stampRecord 保首个 createdAt')
}

console.log('== F. 校验（写门只守：类型/主体/scope/lifecycle 合法）==')
{
  const good = S.makeRecord({ text: '- [env] A', file: 'MEMORY.md' })
  ok(S.validateRecord(good).length === 0, '合法记录零错误')
  ok(S.validateRecord({ ...good, kind: 'nope' }).some((e) => e.includes('kind')), '非法 kind 被拒')
  ok(S.validateRecord({ ...good, subject: 'hacker' }).some((e) => e.includes('subject')), '非法 subject 被拒')
  ok(S.validateRecord({ ...good, scope: 'nope' }).some((e) => e.includes('scope')), '非法 scope 被拒')
  ok(S.validateRecord({ ...good, lifecycle: 'gone' }).some((e) => e.includes('lifecycle')), '非法 lifecycle 被拒')
  ok(S.isValidSubject('companion:ana') && S.isValidSubject('user') && !S.isValidSubject('wiki'), '主体判定：三基主体 + companion:<id>')
  ok(S.isValidScope('global') && S.isValidScope('workspace:/opt/x') && S.isValidScope('project:sc') && !S.isValidScope('elsewhere'), 'scope 判定')
}

console.log('== G. 事实源序列化（JSONL 往返）==')
{
  const recs = S.parseRecords('a\nb\n', 'MEMORY.md')
  const back = S.parseRecordStore(S.serializeRecords(recs))
  ok(back.length === 2 && back[0].text === 'a' && back[1].eol === '\n', 'serialize → parse 往返保内容与 eol')
  ok(S.serializeRecords([]) === '', '空集序列化为空串')
}

console.log('== H. 清单统计（迁移申报用）==')
{
  const recs = S.parseRecords('# H\n- [env] A\n- [env] B\n\nx\n', 'MEMORY.md')
  const inv = S.inventoryOf(recs)
  ok(inv.records === 5, `记录数（= ${inv.records}）`)
  ok(inv.byKind.structure === 1 && inv.byKind.blank === 1, 'kind 分布')
  ok(inv.byTag.env === 2, '标签分布')
  ok(inv.untagged === 1, '无标签待归类计数（structure/blank 不计）')
  ok(inv.bytes === '# H\n- [env] A\n- [env] B\n\nx\n'.length, 'bytes 含 eol（与文件字节同口径）')
}

console.log('== I. 影子写与对账（真夹具库：record-shadow）==')
{
  const root = join(tmp, 'lib1')
  mkdirSync(root, { recursive: true })
  const md = '# MEMORY.md — 记忆索引\r\n\r\n- [env] A · 概况 → notes/env.md §A\n- [env] B · 概况 → notes/env.md §B\r\n'
  writeFileSync(join(root, 'MEMORY.md'), md, 'utf8')
  writeFileSync(join(root, 'USER.md'), '- 身份：中文用户\n', 'utf8')

  const res = H.mirrorAll(root, 'T', ['MEMORY.md', 'USER.md'])
  ok(res.length === 2 && res.every((r) => r.ok && r.roundTrip), '镜像两文件且各自往返逐字节一致')
  ok(H.recordStorePath(root).endsWith(join('.records', 'records.jsonl')), '影子库落点 = <root>/.records/records.jsonl')
  const rows = H.parityOf(root, ['MEMORY.md', 'USER.md'])
  ok(rows.every((r) => r.ok), '对账：影子库投影 ⟷ md 全部一致')
  ok(H.shadowInventory(root).records === res.reduce((n, r) => n + r.records, 0), '清单记录数 = 各文件镜像之和')

  // 整片替换语义：同文件再镜像不应堆积重复
  H.mirrorFile(root, 'MEMORY.md', 'T2')
  ok(H.shadowInventory(root).records === H.shadowInventory(root).records, '重复镜像幂等（不重复堆积）')
  const n1 = H.shadowInventory(root).records
  H.mirrorFile(root, 'MEMORY.md', 'T3')
  ok(H.shadowInventory(root).records === n1, `重复镜像记录数不变（${n1}）`)

  // 走形必须被抓到（反向证伪：改了 md 而不重新镜像 ⇒ 对账翻红）
  writeFileSync(join(root, 'MEMORY.md'), md + '- [env] C · 新增 → notes/env.md §C\n', 'utf8')
  ok(H.parityOf(root, ['MEMORY.md'])[0].ok === false, '反向证伪：md 变更未镜像 ⇒ 对账 FAIL（门禁不是永远绿）')
  H.mirrorFile(root, 'MEMORY.md', 'T4')
  ok(H.parityOf(root, ['MEMORY.md'])[0].ok === true, '重新镜像后对账恢复 PASS')

  // 缺席文件与损坏影子库：不抛、给出原因
  ok(H.parityOf(root, ['AGENT.md'])[0].ok === true, 'md 缺席 ⇒ 视为通过（跳过，不误报）')
  const root2 = join(tmp, 'lib2')
  mkdirSync(join(root2, '.records'), { recursive: true })
  writeFileSync(join(root2, '.records', 'records.jsonl'), '{坏行\n', 'utf8')
  ok(typeof H.loadStore(root2).error === 'string', '影子库损坏 ⇒ 返回 error 而非抛异常')
  ok(H.parityOf(root2, ['MEMORY.md'])[0].ok === false, '影子库损坏 ⇒ 对账 FAIL（不静默通过）')
}

console.log('== K. M3 写时自证计数（落盘可事后核 · 分歧必须可数）==')
{
  const bank2 = join(tmp, 'bank-k')
  mkdirSync(join(bank2, 'notes'), { recursive: true })
  writeFileSync(join(bank2, 'MEMORY.md'), '行一\n\n行三\n', 'utf8')
  const zero = H.readShadowStats(bank2)
  ok(zero.writes === 0 && zero.diverged === 0, 'K1 无计数文件 ⇒ 全零（不抛）')

  // 真镜像一次 ⇒ writes/verified 各 +1
  const r = H.mirrorFile(bank2, 'MEMORY.md', '2026-09-13T00:00:00.000Z')
  ok(r.ok && r.roundTrip, 'K2 夹具镜像成功且往返一致')
  const s1 = H.readShadowStats(bank2)
  ok(s1.writes === 1 && s1.verified === 1 && s1.diverged === 0, `K3 镜像自证落盘（writes=${s1.writes} verified=${s1.verified} diverged=${s1.diverged}）`)
  ok(s1.lastFile === 'MEMORY.md' && !!s1.lastAt, 'K4 记录末次文件与时刻')

  // 人为造一次"分歧"（直接调用 bump，模拟解析器回归时的口径）
  H.bumpShadowStats(bank2, '2026-09-13T09:00:00.000Z', 'USER.md', false)
  const s2 = H.readShadowStats(bank2)
  ok(s2.writes === 2 && s2.verified === 1 && s2.diverged === 1, 'K5 分歧可数（writes=2/verified=1/diverged=1）')
  ok(s2.lastDivergedFile === 'USER.md' && s2.lastDivergedAt === '2026-09-13T09:00:00.000Z', 'K6 **分歧留痕**（末次分歧的文件与时刻）')
  ok(s1.lastDivergedFile === '' && s1.lastDivergedAt === '', 'K7 未分歧时分歧留痕为空（不误留痕）')

  // 损坏的计数文件 ⇒ 全零而不是崩（它只是仪表，坏了不该拖垮上报）
  writeFileSync(H.shadowStatsPath(bank2), '{坏 JSON', 'utf8')
  const s3 = H.readShadowStats(bank2)
  ok(s3.writes === 0 && s3.diverged === 0, 'K8 计数文件损坏 ⇒ 全零（仪表坏了不拖垮上报）')

  // notes 载体也走同一条自证路径
  writeFileSync(join(bank2, 'notes', 'env.md'), '# env\n\n内容\n', 'utf8')
  const r2 = H.mirrorFile(bank2, 'notes/env.md', '2026-09-13T10:00:00.000Z')
  ok(r2.ok && r2.roundTrip, 'K9 notes 载体镜像往返一致（自证覆盖全部载体）')
  ok(H.readShadowStats(bank2).writes === 1, 'K10 覆盖损坏文件后计数重新开始（写一次 = 1）')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
