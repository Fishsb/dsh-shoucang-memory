#!/usr/bin/env node
// test-association-propose.mjs —— **联想生成**单测（`association-propose.ts` · 2026-09-13）
//
// 为什么必须有这一件：联想的判据是**三条合取**（跨载体 + 语义近 + 词面不重叠），
//   任何一条写松/写反都会产出大量"看着像联想、实则是重复或同义"的噪声——而噪声不会报错，
//   只会让人**不再信任这个能力**。故三条判据的**出现与不出现条件**逐条钉死。
//
// 用法: node scripts/test-association-propose.mjs   （先 `npm run build:host`；npm test 已含 pretest）
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const { sectionsOf, proposeAssociations } = await import(load('lib/association-propose.js'))

const rec = (over) => ({
  id: 'x', kind: 'prose', subject: 'knowledge', scope: 'global', text: '', source: '', tag: '', pointer: '',
  file: 'notes/a.md', order: 0, eol: '\n', maturity: 0, lifecycle: 'active', hits: 0, lastHit: '',
  createdAt: '', updatedAt: '', ...over,
})

console.log('== A. sectionsOf：按标题切节（纯函数）==')
{
  const rs = [
    rec({ file: 'notes/a.md', order: 0, text: '文件抬头说明（不属于任何节）' }),
    rec({ file: 'notes/a.md', order: 1, text: '## 甲节', kind: 'structure' }),
    rec({ file: 'notes/a.md', order: 2, text: '甲的第一行' }),
    rec({ file: 'notes/a.md', order: 3, text: '甲的第二行' }),
    rec({ file: 'notes/a.md', order: 4, text: '## 乙节', kind: 'structure' }),
    rec({ file: 'notes/a.md', order: 5, text: '乙的内容' }),
    rec({ file: 'MEMORY.md', order: 0, text: '[env] 索引行（不是内容，不参与联想）' }),
    rec({ file: 'notes/b.md', order: 0, text: '## 丙节', kind: 'structure' }),
    rec({ file: 'notes/b.md', order: 1, text: '丙的内容' }),
  ]
  const s = sectionsOf(rs)
  ok(s.length === 3, `A1 切出 3 节（实测 ${s.length}）`)
  ok(s.map((x) => x.key).join('|') === 'notes/a.md §甲节|notes/a.md §乙节|notes/b.md §丙节', `A2 节地址正确（${s.map((x) => x.key).join(' / ')}）`)
  ok(s[0].text === '甲的第一行 甲的第二行', 'A3 节体 = 标题之后至下一标题（跨行合并）')
  ok(!s.some((x) => x.file === 'MEMORY.md'), 'A4 **索引行不参与**（联想要在内容之间发生，不是指针）')
  ok(!s.some((x) => x.text.includes('文件抬头')), 'A5 首个标题之前的内容丢弃（那是说明文字，不是断言）')
}

console.log('== B. 三条判据：跨载体 · 语义近 · 词面不重叠（合取）==')
{
  const secs = [
    { key: 'notes/a.md §甲', file: 'notes/a.md', section: '甲', text: 'alpha beta gamma' },
    { key: 'notes/b.md §乙', file: 'notes/b.md', section: '乙', text: 'delta epsilon zeta' }, // 零共词 + 高相似
    { key: 'notes/a.md §甲二', file: 'notes/a.md', section: '甲二', text: 'eta theta iota' }, // 同文件 + 高相似
    { key: 'notes/c.md §丙', file: 'notes/c.md', section: '丙', text: 'alpha beta gamma delta' }, // 多共词 + 高相似
    { key: 'notes/d.md §丁', file: 'notes/d.md', section: '丁', text: 'kappa lambda mu' }, // 低相似
  ]
  // 合成向量：让"高相似"组方向一致，"低相似"组正交
  const V = (x, y) => [x, y]
  const vecs = [V(1, 0), V(0.99, 0.01), V(0.98, 0.02), V(0.97, 0.03), V(0, 1)]
  const p = proposeAssociations(secs, vecs, { minSim: 0.9, maxShared: 2, topN: 10 })
  const keys = p.map((x) => `${x.a.key}⨯${x.b.key}`)
  ok(p.some((x) => x.b.key === 'notes/b.md §乙'), 'B1 **跨载体 + 高相似 + 零共词 ⇒ 提议**（这就是"异域同构"）')
  ok(!keys.some((k) => k.includes('§甲⨯') && k.includes('notes/a.md §甲二')) && !p.some((x) => x.a.file === x.b.file),
    'B2 **同文件不提议**（同一文件里的相近是"重复"，不是异域）')
  // ⚠ 断言要**收窄到那一对**：§丙 与 §乙 共词只有 1（'delta'）⇒ **那对本来就该被提议**；
  //   我第一版写成"任何涉及 §丙 的提议都不许有"，把合法提议也判了错（**夹具断言过宽**，不是代码错）。
  const pairKeys = p.map((x) => [x.a.key, x.b.key].sort().join('⨯'))
  ok(!pairKeys.includes(['notes/a.md §甲', 'notes/c.md §丙'].sort().join('⨯')),
    `B3 **共词过多的一对不提议**（甲⨯丙 共词 3 > 上限 2；实测提议 ${pairKeys.length} 对）`)
  ok(!p.some((x) => (x.a.key.includes('§丁') || x.b.key.includes('§丁'))), 'B4 低相似不提议')
  ok(p.every((x) => x.a.file !== x.b.file && x.sim >= 0.9 && x.sharedTokens <= 2), 'B5 全体提议满足三条合取（不变量）')
}

console.log('== C. 排序与截断 ==')
{
  const secs = [
    { key: 'a', file: 'notes/a.md', section: 'a', text: 'x1' },
    { key: 'b', file: 'notes/b.md', section: 'b', text: 'x2' },
    { key: 'c', file: 'notes/c.md', section: 'c', text: 'x3' },
  ]
  const vecs = [[1, 0], [0.999, 0.001], [0.995, 0.005]]
  const p = proposeAssociations(secs, vecs, { minSim: 0.5, maxShared: 9, topN: 2 })
  ok(p.length === 2, `C1 topN 截断生效（实测 ${p.length}）`)
  ok(p[0].sim >= p[1].sim, 'C2 相似度降序')
  const all = proposeAssociations(secs, vecs, { minSim: 0.5, maxShared: 9, topN: 9 })
  ok(all.length === 3, 'C3 三节两两组合 = 3 对（跨载体全组合）')
}

console.log('== D. 向量缺失：如实"未判"，不猜、不崩 ==')
{
  const secs = [
    { key: 'a', file: 'notes/a.md', section: 'a', text: 'p' },
    { key: 'b', file: 'notes/b.md', section: 'b', text: 'q' },
  ]
  ok(proposeAssociations(secs, [null, [1, 0]], {}).length === 0, 'D1 一侧向量缺失 ⇒ 不提议（不猜）')
  ok(proposeAssociations(secs, [[], []], {}).length === 0, 'D2 空向量 ⇒ 不提议')
  ok(proposeAssociations(secs, [[0, 0], [0, 0]], {}).length === 0, 'D3 零向量 ⇒ 相似度 0（不产生 NaN 提议）')
  ok(proposeAssociations([], [], {}).length === 0, 'D4 空输入 ⇒ 空输出（不抛）')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
