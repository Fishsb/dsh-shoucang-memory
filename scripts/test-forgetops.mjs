// forgetOps 自测（玩具副本，不碰真库）——认知对照 P0「主动遗忘」验收（含 R1/R2/R4 审查修复项）
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyForgetOps, sectionExists } from '../lib/treeops.js'

const NOTE = `# notes/lessons.md — 玩具

## 冷节（2026-01-01）
- 冷节正文第一行（应被移入归档）
- 冷节正文第二行

## 热节（2026-09-10）
- 热节正文（不应被动）

## 带子树的树干（2026-09-11）
### 既有子节
- 子树内容

## 冷甲（2026-01-02）
- 甲

## 冷乙（2026-01-03）
- 乙

## 冷丙（2026-01-04）
- 丙

## 冷丁（2026-01-05）
- 丁
`

const USER = `# notes/user.md — 玩具画像

## 身份（2026-01-01）
- 画像节正文（**不得被归档**）
`

const cold = (s) => ({ key: `notes/lessons.md|${s}`, f: 'notes/lessons.md', s, hits: 0, hits30: 0, lastHit: null, firstSeen: 1, status: 'cold' })
const ACT = [
  cold('冷节'), cold('冷甲'), cold('冷乙'), cold('冷丙'), cold('冷丁'),
  { key: 'notes/lessons.md|热节', f: 'notes/lessons.md', s: '热节', hits: 9, hits30: 5, lastHit: Date.now(), firstSeen: 1, status: 'active' },
  { key: 'notes/user.md|身份', f: 'notes/user.md', s: '身份', hits: 0, hits30: 0, lastHit: null, firstSeen: 1, status: 'cold' },
].map((o) => JSON.stringify(o)).join('\n') + '\n'

const root = mkdtempSync(join(tmpdir(), 'forgetops-'))
mkdirSync(join(root, 'notes'), { recursive: true })
mkdirSync(join(root, 'audit'), { recursive: true })
writeFileSync(join(root, 'notes', 'lessons.md'), NOTE, 'utf8')
writeFileSync(join(root, 'notes', 'user.md'), USER, 'utf8')
writeFileSync(join(root, 'audit', 'activity.jsonl'), ACT, 'utf8')

const logs = []
const hooks = { audit: () => {}, log: (m) => logs.push(m) }
const P = []
const ok = (n, c, x = '') => { P.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); return c }
const note = () => readFileSync(join(root, 'notes', 'lessons.md'), 'utf8')
const user = () => readFileSync(join(root, 'notes', 'user.md'), 'utf8')
const archPath = join(root, 'notes', 'archive', 'lessons.md')

// ① cold + 叶子 → 归档
let r = await applyForgetOps(root, [{ action: 'archive', file: 'lessons.md', section: '冷节' }], hooks)
let body = note()
ok('① 归档 applied=1', r.archived === 1, `archived=${r.archived} skipped=${r.skipped}`)
ok('① 归档文件已建且含正文', existsSync(archPath) && readFileSync(archPath, 'utf8').includes('冷节正文第二行'))
ok('① 原位只剩 stub', !body.includes('冷节正文第二行') && /本节正文已归档/.test(body))
ok('① 标题行保留（指针 §冷节 仍有效）', /^## 冷节/m.test(body))

// ② 幂等
const before = note()
r = await applyForgetOps(root, [{ action: 'archive', file: 'lessons.md', section: '冷节' }], hooks)
ok('② 幂等：二次 archive → skipped', r.archived === 0 && r.skipped === 1, `a=${r.archived}/s=${r.skipped}`)
ok('② 内容未再变', note() === before)

// ③ 热节（active）→ 拒绝
r = await applyForgetOps(root, [{ action: 'archive', file: 'lessons.md', section: '热节' }], hooks)
ok('③ 热节拒绝归档（防误伤）', r.archived === 0 && r.skipped === 1)
ok('③ 热节正文完好', note().includes('热节正文'))

// ④ 非叶子 → 拒绝
r = await applyForgetOps(root, [{ action: 'archive', file: 'lessons.md', section: '带子树的树干' }], hooks)
ok('④ 非叶子拒绝（防孤儿）', r.archived === 0 && r.skipped === 1)

// ⑤ 禁直删
r = await applyForgetOps(root, [{ action: 'delete', file: 'lessons.md', section: '热节' }], hooks)
ok('⑤ delete 被拒（禁直删）', r.archived === 0 && r.skipped === 1, `s=${r.skipped}`)
r = await applyForgetOps(root, [{ action: 'remove', file: 'lessons.md', section: '热节' }], hooks)
ok('⑤ remove 被拒', r.archived === 0 && r.skipped === 1)

// ⑥ keep 留痕不改文件
const b6 = note()
r = await applyForgetOps(root, [{ action: 'keep', file: 'lessons.md', section: '热节', reason: '安全红线' }], hooks)
ok('⑥ keep 计数且不改文件', r.kept === 1 && r.archived === 0 && note() === b6, `kept=${r.kept}`)

// ⑦ 审计留痕
const fo = join(root, 'audit', 'forgetops')
const files = existsSync(fo) ? readdirSync(fo).filter((f) => f.endsWith('.jsonl')) : []
ok('⑦ 审计文件已写', files.length === 1, files.join(','))
if (files.length) {
  const recs = readFileSync(join(fo, files[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  ok('⑦ archive 留原文（可回滚）', recs.some((x) => x.action === 'archive' && x.sectionText && x.into))
  ok('⑦ keep 留理由', recs.some((x) => x.action === 'keep' && x.reason === '安全红线'))
  ok('⑦ 拒绝项留因', recs.some((x) => x.outcome === 'skipped' && /非冷节|非叶子|禁止直删|不在 activity/.test(String(x.reason))))
}

// ⑧ 空表 / 缺 root 的防御
r = await applyForgetOps(root, [], hooks)
ok('⑧ 空 ops 安全', r.archived === 0 && r.kept === 0 && r.skipped === 0)
r = await applyForgetOps('', [{ action: 'archive', file: 'lessons.md', section: '冷节' }], hooks)
ok('⑧ 空 root 安全（全跳过）', r.skipped === 1)

// ⑨ R1【审查修复】：画像承载文件不得归档（否则会真丢用户画像）
const u9 = user()
r = await applyForgetOps(root, [{ action: 'archive', file: 'user.md', section: '身份' }], hooks)
ok('⑨ 画像节 user.md 拒绝归档（R1）', r.archived === 0 && r.skipped === 1, `a=${r.archived}/s=${r.skipped}`)
ok('⑨ 画像正文完好', user() === u9 && user().includes('画像节正文'))
r = await applyForgetOps(root, [{ action: 'archive', file: 'notes/user.md', section: '身份' }], hooks)
ok('⑨ 带 notes/ 前缀亦拒绝', r.archived === 0 && r.skipped === 1)
r = await applyForgetOps(root, [{ action: 'archive', file: 'agent.md', section: '学习史' }], hooks)
ok('⑨ agent.md 亦拒绝（文件缺失也先被守卫拦）', r.archived === 0 && r.skipped === 1)

// ⑩ R4【审查修复】：单轮归档上限 3（keep 不受限）
const a10 = await applyForgetOps(root, [
  { action: 'archive', file: 'lessons.md', section: '冷甲' },
  { action: 'archive', file: 'lessons.md', section: '冷乙' },
  { action: 'archive', file: 'lessons.md', section: '冷丙' },
  { action: 'archive', file: 'lessons.md', section: '冷丁' },
  { action: 'keep', file: 'lessons.md', section: '热节', reason: '仍要用' },
], hooks)
ok('⑩ 单轮归档 ≤3（R4）', a10.archived === 3, `archived=${a10.archived}`)
ok('⑩ 超限项计 skipped', a10.skipped === 1, `skipped=${a10.skipped}`)
ok('⑩ keep 不受上限影响', a10.kept === 1, `kept=${a10.kept}`)
ok('⑩ 冷丁未被归档（正文仍在）', note().includes('## 冷丁') && note().includes('- 丁'))

// ⑪ R2【审查修复】：sectionExists 口径（供材料侧剔除悬空候选）
ok('⑪ sectionExists 真节为真', sectionExists(root, 'lessons.md', '冷甲') === true)
ok('⑪ sectionExists 悬空为假', sectionExists(root, 'lessons.md', 'DSH 环境') === false)
ok('⑪ sectionExists 非法文件为假', sectionExists(root, 'nope.md', '冷甲') === false)
ok('⑪ sectionExists 支持 notes/ 前缀', sectionExists(root, 'notes/lessons.md', '冷乙') === true)

console.log(P.join('\n'))
const fails = P.filter((x) => x.startsWith('FAIL')).length
console.log(`\n${P.length - fails} PASS / ${fails} FAIL`)
rmSync(root, { recursive: true, force: true })
process.exit(fails ? 1 : 0)
