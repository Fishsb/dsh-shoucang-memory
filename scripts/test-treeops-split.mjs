// treeops split 自测（玩具副本，不碰真库）——§8.1 分裂律 P2 验收
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyTreeOps } from '../lib/treeops.js'

const NOTE = `# notes/lessons.md — 玩具

## 肥节（2026-09-01）
- 目标：这是 lead 段，应留在父节下。
- 子面A 首行：锚点一（唯一）
- 子面A 细则 甲
- 子面A 细则 乙
- 子面B 首行：锚点二（唯一）
- 子面B 细则 丙
- 子面B 细则 丁

## 树干净的小节（2026-09-02）
- 只有一行

## 带子树的树干（2026-09-03）
### 既有子节
- 一行
`

const idx = `[flow] 玩具主题 · 概况一/概况二 → notes/lessons.md §肥节
`

const root = mkdtempSync(join(tmpdir(), 'treeops-split-'))
mkdirSync(join(root, 'notes'), { recursive: true })
mkdirSync(join(root, 'audit'), { recursive: true })
writeFileSync(join(root, 'notes', 'lessons.md'), NOTE, 'utf8')
writeFileSync(join(root, 'MEMORY.md'), idx, 'utf8')

const logs = []
const hooks = { audit: () => {}, log: (m) => logs.push(m) }
const P = []
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); return cond }

const read = () => readFileSync(join(root, 'notes', 'lessons.md'), 'utf8')

// ① 正常 split：2 个 parts
let r = await applyTreeOps(root, [{
  action: 'split', file: 'lessons.md', title: '肥节',
  parts: [
    { title: '子面甲', start: '- 子面A 首行：锚点一（唯一）' },
    { title: '子面乙', start: '- 子面B 首行：锚点二（唯一）' },
  ],
}], hooks)
let body = read()
ok('① split 落盘 applied=1', r.applied === 1, `applied=${r.applied} skipped=${r.skipped}`)
ok('① 插入 ### 子面甲', body.includes('### 子面甲'))
ok('① 插入 ### 子面乙', body.includes('### 子面乙'))
ok('① lead 仍留在父 ## 下', /## 肥节[^\n]*\n- 目标：这是 lead 段/.test(body))
ok('① ### 在锚点行之前', /### 子面甲\n- 子面A 首行/.test(body))

// ② 幂等：同 op 再跑 → no-op skipped，内容不变
const before = read()
r = await applyTreeOps(root, [{
  action: 'split', file: 'lessons.md', title: '肥节',
  parts: [
    { title: '子面甲', start: '- 子面A 首行：锚点一（唯一）' },
    { title: '子面乙', start: '- 子面B 首行：锚点二（唯一）' },
  ],
}], hooks)
ok('② 幂等 no-op（applied=0/skipped=1）', r.applied === 0 && r.skipped === 1, `applied=${r.applied}/${r.skipped}`)
ok('② 内容未变', read() === before)

// ③ 非叶子目标 → 跳过
r = await applyTreeOps(root, [{ action: 'split', file: 'lessons.md', title: '带子树的树干', parts: [{ title: 'X', start: '- 一行' }, { title: 'Y', start: '- 一行' }] }], hooks)
ok('③ 非叶子目标跳过', r.applied === 0 && r.skipped === 1, `applied=${r.applied}/${r.skipped}`)

// ④ 边界锚不存在 → 跳过
r = await applyTreeOps(root, [{ action: 'split', file: 'lessons.md', title: '树干净的小节', parts: [{ title: 'X', start: '- 不存在的行' }, { title: 'Y', start: '- 只有一行' }] }], hooks)
ok('④ 锚点未找到跳过', r.applied === 0 && r.skipped === 1, `applied=${r.applied}/${r.skipped}`)
ok('④ 文件未被改动', read() === before)

// ⑤ 同层重名 → 跳过
r = await applyTreeOps(root, [{ action: 'split', file: 'lessons.md', title: '树干净的小节', parts: [{ title: '子面甲', start: '- 只有一行' }, { title: '另一个', start: '- 只有一行' }] }], hooks)
ok('⑤ 子节与既有 ### 重名跳过', r.applied === 0 && r.skipped === 1, `applied=${r.applied}/${r.skipped}`)

// ⑥ 参数门：parts<2 / >6 / 缺 start
r = await applyTreeOps(root, [{ action: 'split', file: 'lessons.md', title: '树干净的小节', parts: [{ title: 'A', start: '- 只有一行' }] }], hooks)
ok('⑥ parts<2 拒绝', r.applied === 0 && r.skipped === 1)
r = await applyTreeOps(root, [{ action: 'split', file: 'lessons.md', title: '树干净的小节', parts: Array.from({ length: 7 }, (_, i) => ({ title: 'P' + i, start: '- 只有一行' })) }], hooks)
ok('⑥ parts>6 拒绝（K=6）', r.applied === 0 && r.skipped === 1)
r = await applyTreeOps(root, [{ action: 'split', file: 'lessons.md', title: '树干净的小节', parts: [{ title: 'A' }, { title: 'B' }] }], hooks)
ok('⑥ 缺 start 拒绝', r.applied === 0 && r.skipped === 1)

// ⑦ 索引行未被改写（父指针保留）
ok('⑦ 索引行未改写（仍指 §肥节）', readFileSync(join(root, 'MEMORY.md'), 'utf8').includes('§肥节'))

// ⑧ 归档可回滚证据
const arch = join(root, 'audit', 'treeops')
const af = existsSync(arch) ? readdirSync(arch).filter((f) => f.endsWith('.jsonl')) : []
ok('⑧ 归档文件已写', af.length === 1, af.join(','))
if (af.length) {
  const recs = readFileSync(join(arch, af[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const sp = recs.filter((x) => x.action === 'split')
  ok('⑧ split 归档含原文与去向', sp.some((x) => x.outcome !== 'skipped' && x.section && x.into))
  ok('⑧ 跳过项也留痕', sp.some((x) => x.outcome === 'skipped'))
}

console.log(P.join('\n'))
const fails = P.filter((x) => x.startsWith('FAIL')).length
console.log(`\n${P.length - fails} PASS / ${fails} FAIL`)
rmSync(root, { recursive: true, force: true })
process.exit(fails ? 1 : 0)
