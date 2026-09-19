// check-deferred-queue.mjs — 遗留②③机检：**待认领队列统一出口 + 周期登记闭环**（指针供给 §4-3 / §12）
//
// 判因（两轮方案的共同遗留）：缺陷被"看见"了，但**没有出口也没有消费路径**——
//   · 写侧：`anchor-needed`（需人工建锚）落台账、`-knowledge-defer-*` 落 pending，各写各的，**无处统一读**；
//   · 读侧：跨批"行落了、详情始终没落"的空壳落点，**没有任何周期机制把它捞出来** ⇒ 只会在下一次人工巡检时被发现。
//
// 本件锁四件（全部驱动**库内单一实现** `lib/pointer-deficits.js`，不在判据里重写扫描）：
//   ① **统一出口** `deferredQueueOf`：四类来源（空壳落点 / 全库空壳标题 / 台账 anchor-needed / pending 知识回退）
//      合并成一份计数+清单，且**按 ref 去重**；
//   ② **幂等登记** `registerDeficits`：同缺陷重复巡检 ⇒ 第二次 `written=0 / skipped=N`，**文件集合不变**；
//   ③ **阴性对照**：健康库（无空壳）⇒ `scanned=0 / written=0`（N=0 显式，不冒充"跑过了"）；
//      并**反例自证**：给空壳标题补上正文 ⇒ 立刻不再登记（判据有区分力）；
//   ④ **接线**：维护链（`distill-bank#runSelfCheck`）真的调用登记；卡命名**只有一份实现**（`distill-write` 转发本模块）。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { deferredQueueOf, registerDeficits, knowledgeDeferFileOf } from '../lib/pointer-deficits.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }
const note = (m) => P.push(`NOTE  ${m}`)

const mkFixture = (opts = {}) => {
  const bank = mkdtempSync(join(tmpdir(), 'dq-bank-'))
  const k = mkdtempSync(join(tmpdir(), 'dq-kroot-'))
  mkdirSync(join(bank, 'notes'), { recursive: true })
  mkdirSync(join(k, 'audit'), { recursive: true })
  mkdirSync(join(k, 'pending'), { recursive: true })
  writeFileSync(join(bank, 'notes', 'a.md'), ['# a', '', '## 有内容节', '正文', '', ...(opts.emptySection === false ? ['## 空壳节', '已补正文', ''] : ['## 空壳节', ''])].join('\n'), 'utf8')
  // 供"过时项"判据用：该小节**已存在** ⇒ 指向它的 anchor-needed 行是**过时**的（不是真缺陷）
  writeFileSync(join(bank, 'notes', 'env.md'), ['# env', '', '## 已建锚节', '正文', ''].join('\n'), 'utf8')
  writeFileSync(join(bank, 'MEMORY.md'), ['- [env] 落点探针 · 概况/短语 → notes/a.md §空壳节', ''].join('\n'), 'utf8')
  // 台账：两条同 ref（应去重）+ 一条不同 ref + **一条指向已存在小节（过时）**
  writeFileSync(join(k, 'audit', 'ledger.jsonl'), [
    JSON.stringify({ at: 'x', type: 'anchor-needed', target: 'notes/env.md', section: '不存在的一号', reason: 'r1', sid: 'sid1' }),
    JSON.stringify({ at: 'y', type: 'anchor-needed', target: 'notes/env.md', section: '不存在的一号', reason: 'r2', sid: 'sid2' }),
    JSON.stringify({ at: 'z', type: 'anchor-needed', target: 'notes/env.md', section: '不存在的二号', reason: 'r3', sid: 'sid3' }),
    JSON.stringify({ at: 's', type: 'anchor-needed', target: 'notes/env.md', section: '已建锚节', reason: 'r4', sid: 'sid4' }),
    JSON.stringify({ at: 'w', type: 'distill-run', added: 1 }),
    '',
  ].join('\n'), 'utf8')
  writeFileSync(join(k, 'pending', '2026-09-19-knowledge-defer-abcdef0123.md'), '# [knowledge-defer] 探针\n', 'utf8')
  return { bank, k }
}

// ── ① 统一出口（四类合并 + 去重）──
{
  const { bank, k } = mkFixture()
  const q = deferredQueueOf({ bankRoot: bank, kRoot: k })
  ok('① 空壳落点计入', q.counts['empty-landing'] === 1, JSON.stringify(q.counts))
  ok('① 全库空壳标题计入', q.counts['empty-section'] === 1)
  ok('① 台账 anchor-needed **按 ref 去重**（3 行 → 2 条）', q.counts['anchor-needed'] === 2, `anchors=${q.counts['anchor-needed']}`)
  ok('① pending 知识回退计入', q.counts['knowledge-defer'] === 1)
  ok('① total = 各类之和', q.total === q.counts['empty-landing'] + q.counts['empty-section'] + q.counts['anchor-needed'] + q.counts['knowledge-defer'], `total=${q.total}`)
  // ── ①′ 过时项（G14 · 2026-09-19 真机暴露：台账里指向**已存在**小节的行仍在报缺）──
  ok('①′ 指向**已存在**小节的 anchor-needed **不计入**（过时项不再冒充缺陷）', q.counts['anchor-needed'] === 2, JSON.stringify(q.counts))
  ok('①′ 过时项**单独可见**（staleAnchor 计数，不静默丢弃）', q.staleAnchor === 1, `staleAnchor=${q.staleAnchor}`)
  ok('①′ 过时项 ref 可列举（供人工复核）', Array.isArray(q.staleRefs) && q.staleRefs.some((r) => r.includes('已建锚节')), JSON.stringify(q.staleRefs))
  ok('①′ 不变量：rows.length === total === Σcounts（清单与计数同源）', q.rows.length === q.total && q.total === Object.values(q.counts).reduce((a, b) => a + b, 0), `rows=${q.rows.length} total=${q.total}`)
  rmSync(bank, { recursive: true, force: true }); rmSync(k, { recursive: true, force: true })
}

// ── ①″ 台账**窗口不截断**（G12 · 2026-09-19 真机暴露：25 vs 33）──
// 判因：`readAnchorNeeded` 缺省只回读**末 4000 行** ⇒ 台账长到 2.2 万行时，
//   **靠前**的 anchor-needed 行**被静默漏掉**（真机实测：出口报 25 条，全量 33 条 ⇒ 输入量不可信）。
// 判据：缺陷行落在窗口之外也必须被读到；且**不改写台账**（纯读）。
{
  const bank = mkdtempSync(join(tmpdir(), 'dq-win-bank-'))
  const k = mkdtempSync(join(tmpdir(), 'dq-win-k-'))
  mkdirSync(join(bank, 'notes'), { recursive: true })
  mkdirSync(join(k, 'audit'), { recursive: true })
  mkdirSync(join(k, 'pending'), { recursive: true })
  writeFileSync(join(bank, 'MEMORY.md'), '', 'utf8')
  const filler = Array.from({ length: 6000 }, (_, i) => JSON.stringify({ at: `f${i}`, type: 'distill-run', added: 0 }))
  // 缺陷行放在**最前**（旧实现的 slice(-4000) 必然漏掉它）
  const led = [JSON.stringify({ at: 'head', type: 'anchor-needed', target: 'notes/env.md', section: '窗口外的锚', reason: 'r', sid: 's' }), ...filler, ''].join('\n')
  writeFileSync(join(k, 'audit', 'ledger.jsonl'), led, 'utf8')
  const q = deferredQueueOf({ bankRoot: bank, kRoot: k })
  ok('①″ 窗口外（靠前）的 anchor-needed 行**必须被读到**（先红：旧实现只读末 4000 行 ⇒ 0 条）', q.counts['anchor-needed'] === 1, `anchors=${q.counts['anchor-needed']} 台账行=${led.split('\n').length - 1}`)
  ok('①″ 台账**零改写**（纯读：行数不变）', readFileSync(join(k, 'audit', 'ledger.jsonl'), 'utf8').split('\n').length - 1 === 6001)
  rmSync(bank, { recursive: true, force: true }); rmSync(k, { recursive: true, force: true })
}

// ── ①‴ 台账**读全部卷**（G13 · 2026-09-19 真机暴露，比窗口截断更严重）──
// 判因：台账按大小**轮转**（`ledger-compact#rotateBySize` ⇒ `ledger.jsonl.1`）。
//   真机实测（17:45 轮转后）：主档只剩 105 行，**33 条 anchor-needed 全在旧卷** ⇒
//   只读主档的实现读数变 **0**（全盲）。⇒ 判据：缺陷行**只在旧卷**时也必须被读到。
//   真机先红读数：修前 `deferredQueueOf` = `{anchor-needed:0}`，旧卷实有 **33** 行。
{
  const bank = mkdtempSync(join(tmpdir(), 'dq-vol-bank-'))
  const k = mkdtempSync(join(tmpdir(), 'dq-vol-k-'))
  mkdirSync(join(bank, 'notes'), { recursive: true })
  mkdirSync(join(k, 'audit'), { recursive: true })
  mkdirSync(join(k, 'pending'), { recursive: true })
  writeFileSync(join(bank, 'MEMORY.md'), '', 'utf8')
  // 缺陷行只在**旧卷**（.1），主档只有无关行
  writeFileSync(join(k, 'audit', 'ledger.jsonl.1'), [
    JSON.stringify({ at: 'old', type: 'anchor-needed', target: 'notes/env.md', section: '旧卷里的锚', reason: 'r', sid: 's' }),
    '',
  ].join('\n'), 'utf8')
  writeFileSync(join(k, 'audit', 'ledger.jsonl'), [JSON.stringify({ at: 'new', type: 'distill-run', added: 1 }), ''].join('\n'), 'utf8')
  const q = deferredQueueOf({ bankRoot: bank, kRoot: k })
  ok('①‴ 缺陷行只在**旧卷**（ledger.jsonl.1）也必须被读到（真机先红：读数 0，旧卷实有 33 行）', q.counts['anchor-needed'] === 1, `anchors=${q.counts['anchor-needed']}`)
  ok('①‴ 主档与旧卷**都不被改写**', readFileSync(join(k, 'audit', 'ledger.jsonl.1'), 'utf8').includes('旧卷里的锚'))
  rmSync(bank, { recursive: true, force: true }); rmSync(k, { recursive: true, force: true })
}

// ── ② 幂等登记（重复巡检不膨胀）──
{
  const { bank, k } = mkFixture()
  const a = registerDeficits({ bankRoot: bank, kRoot: k })
  const files1 = readdirSync(join(k, 'pending')).filter((f) => f.includes('-knowledge-defer-')).sort()
  const b = registerDeficits({ bankRoot: bank, kRoot: k })
  const files2 = readdirSync(join(k, 'pending')).filter((f) => f.includes('-knowledge-defer-')).sort()
  ok('② 首跑：登记 2 条缺陷（空壳落点 + 空壳标题）', a.scanned === 2 && a.written === 2, JSON.stringify({ scanned: a.scanned, written: a.written }))
  ok('② 复跑：written=0 且 skipped=2（**幂等**）', b.written === 0 && b.skipped === 2, JSON.stringify(b))
  ok('② 复跑后文件集合**不变**', JSON.stringify(files1) === JSON.stringify(files2), `${files1.length} vs ${files2.length}`)
  const card = readFileSync(join(k, 'pending', files1.find((f) => readFileSync(join(k, 'pending', f), 'utf8').includes('empty-landing')) || files1[0]), 'utf8')
  ok('② 登记卡**声明边界**（不自动建锚/不自动回填，防误用）', /不自动建锚/.test(card) && /不自动回填/.test(card))
  rmSync(bank, { recursive: true, force: true }); rmSync(k, { recursive: true, force: true })
}

// ── ③ 阴性对照 + 反例自证（判据有区分力）──
{
  const { bank, k } = mkFixture()
  const r0 = registerDeficits({ bankRoot: bank, kRoot: k })
  rmSync(bank, { recursive: true, force: true }); rmSync(k, { recursive: true, force: true })
  const { bank: b2, k: k2 } = mkFixture({ emptySection: false }) // 给空壳标题补上正文 ⇒ 只剩落点那条仍空
  const r1 = registerDeficits({ bankRoot: b2, kRoot: k2 })
  ok('③ 反例自证：补上正文后 **缺陷归零**（2 → 0；落点与空壳标题同源消失）', r0.scanned === 2 && r1.scanned === 0, `${r0.scanned} → ${r1.scanned}`)
  rmSync(b2, { recursive: true, force: true }); rmSync(k2, { recursive: true, force: true })
  const { bank: b3, k: k3 } = mkFixture()
  writeFileSync(join(b3, 'MEMORY.md'), '- [env] 有内容 · 概况/短语 → notes/a.md §有内容节\n', 'utf8')
  writeFileSync(join(b3, 'notes', 'a.md'), ['# a', '', '## 有内容节', '正文', ''].join('\n'), 'utf8')
  const r2 = registerDeficits({ bankRoot: b3, kRoot: k3 })
  ok('③ 健康库 ⇒ scanned=0 / written=0（N=0 显式，不冒充跑过）', r2.scanned === 0 && r2.written === 0, JSON.stringify(r2))
  rmSync(b3, { recursive: true, force: true }); rmSync(k3, { recursive: true, force: true })
}

// ── ④ 接线（源码级；"接线 ≠ 抵达"型断言）──
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const bankSrc = strip(readFileSync(join(ROOT, 'src', 'distill-bank.ts'), 'utf8'))
  ok('④ 维护链（runSelfCheck）真的调用登记闭环', /registerDeficits\s*\(/.test(bankSrc))
  const writeSrc = strip(readFileSync(join(ROOT, 'src', 'distill-write.ts'), 'utf8'))
  ok('④ 卡命名**只有一份实现**（distill-write 转发本模块，不再自建）', /export \{ knowledgeDeferFileOf \} from '\.\/pointer-deficits\.js'/.test(writeSrc) && !/createHash[\s\S]{0,200}knowledge-defer/.test(writeSrc))
  const pd = strip(readFileSync(join(ROOT, 'src', 'pointer-deficits.ts'), 'utf8')).replace(/^\s*import[\s\S]*?from\s+'[^']+'\s*$/gm, '')
  ok('④ 模块**不自动建锚/回填**（只写登记卡；边界由注释声明+此处锁定）', !/memory-append|treeOps|applyTreeOps/.test(pd))
  const readSide = pd.slice(0, pd.indexOf('export function registerDeficits'))
  ok('④ 统一出口是纯读（读侧函数不写文件）', !/writeFileSync|appendFileSync/.test(readSide), readSide.match(/writeFileSync|appendFileSync/)?.[0] || '')
  note('④ 出口渠道：模块 API + 自检台账 `type=pointer-deficit-registered` + 自检日志一行（无新增面板路由/工具，避免冻结棘轮与契约改动）')
}

for (const l of P) console.log(l)
console.log(bad ? `\n❌ check-deferred-queue: ${bad} 条断言未通过` : '\n✅ check-deferred-queue: 全绿')
process.exit(bad ? 1 : 0)
