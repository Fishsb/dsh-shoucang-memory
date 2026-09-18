#!/usr/bin/env node
// test-bank-lock.mjs — S2S3 册零：**库级锁 + 丢更新不变量**（2026-09-19）
//
// 判据（四要素）：
//   ① 判据：并发写同一库时不得丢更新（"末写者吃掉前者"）；索引行指向的小节必须存在；锁语义（重入/接管/只删自己）成立。
//   ② 检查方式：本件在**临时库**上用**真路径**（`memory-append.mjs` 子进程）并发跑；锁语义直接调 `bank-lock.mjs`。
//   ③ 阈值：丢更新数 = 0；`.tmp-*` 残留 = 0；跑完不得留锁；锁语义 6 项全绿。
//   ④ 失败退回：任一红 ⇒ 该册不得合入（丢更新=数据丢失，静默型）。
//
// **先红（改造前写法等价复现）**：B1 用"读 → 停 → 直写"的**无锁**形状并发两进程 —— 这正是改造前
//   `memory-append.mjs`（无锁读改写）与 `sectionops.applyConvergeOps`（锁外直写）的形状。
//   改造前跑 B1 必观察到丢更新；现行走 B2（真路径 + 库锁）必须 0 丢更新。
//   若 B1 **一次都丢不了** ⇒ 打印「夹具未命中病灶」并判 FAIL（防"夹具绿=假绿"）。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireBankLock, readLockInfo, releaseBankLock, withBankLock } from '../scripts/bank-lock.mjs'
import { resolveSectionSpec } from '../scripts/section-ref.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPEND = join(ROOT, 'skill', 'scripts', 'memory-append.mjs')
const B1_ROUNDS = 8
const B2_ROUNDS = 16

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

const mkBank = (tag) => {
  const b = mkdtempSync(join(tmpdir(), `sc-banklock-${tag}-`))
  mkdirSync(join(b, 'notes'), { recursive: true })
  writeFileSync(join(b, 'notes', 'env.md'), '# env\n\n## 基准节\n- 既有条目\n', 'utf8')
  writeFileSync(join(b, 'MEMORY.md'), '# MEMORY\n', 'utf8')
  return b
}

const run = (args, env) => new Promise((done) => {
  const c = spawn(process.execPath, args, { env: { ...process.env, ...env }, windowsHide: true })
  let out = ''
  c.stdout.on('data', (d) => { out += d })
  c.stderr.on('data', (d) => { out += d })
  c.on('close', (code) => done({ code, out }))
})

const tmpResidue = (b) => {
  const hits = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== 'audit') walk(join(dir, e.name)); continue }
      if (/\.tmp-|\.ui-tmp|\.tmp$/.test(e.name)) hits.push(join(dir, e.name))
    }
  }
  try { walk(b) } catch { /* */ }
  return hits
}

// ── Part A · 锁语义（进程内） ───────────────────────────────────────────────
console.log('\n── Part A · 锁语义 ──')
{
  const b = mkBank('a1')
  const h = acquireBankLock(b, { note: 'A1' })
  const info = readLockInfo(b)
  h && info && info.owner === h.owner ? ok('A1 取锁后盘上 owner 一致') : bad(`A1 owner 不一致：${JSON.stringify(info)}`)
  const h2 = acquireBankLock(b, { note: 'A1-nested' })
  h2?.reentrant && existsSync(join(b, '.write-lock')) ? ok('A2 进程内重入放行且不重复建锁') : bad('A2 重入语义错')
  releaseBankLock(h)
  !releaseBankLock(h2) ? ok('A2b 重入句柄不负责释放（返回 false）') : bad('A2b 重入句柄误判为持有者')
  readLockInfo(b) === null ? ok('A3 外层释放后锁消失') : bad('A3 释放后仍有锁')

  // A4 只删自己那把：盘上已是"别的持有者"时，旧句柄释放不得误删（用幽灵旧句柄模拟"已被接管的进程"）
  const hNew = acquireBankLock(b, { note: 'A4-new' })
  const phantomOld = { owner: 'ghost-old-owner', root: b, path: join(b, '.write-lock'), reentrant: false, staleTakenOver: false, waitedMs: 0 }
  const deleted = releaseBankLock(phantomOld)
  const still = readLockInfo(b)
  !deleted && still?.note === 'A4-new' && !!hNew ? ok('A4 旧句柄释放不误删新持有者的锁') : bad(`A4 误删/误判：deleted=${deleted} cur=${JSON.stringify(still)}`)
  releaseBankLock(hNew)

  // A5 陈旧接管
  mkdirSync(join(b, '.write-lock'), { recursive: true })
  writeFileSync(join(b, '.write-lock', 'owner.json'), JSON.stringify({ owner: 'ghost', pid: 999999, at: new Date(0).toISOString(), atMs: 1, note: 'stale' }), 'utf8')
  const hTake = acquireBankLock(b, { note: 'A5', staleMs: 50 })
  const forensics = readdirSync(b).filter((n) => n.startsWith('.write-lock.stale-'))
  hTake?.staleTakenOver && forensics.length === 1 ? ok('A5 陈旧锁被改名接管并留证') : bad(`A5 接管失败：taken=${!!hTake?.staleTakenOver} stale=${forensics.length}`)
  releaseBankLock(hTake)

  // A6 withBankLock 的 fail-closed：另一"进程"（此处用 owner 不匹配的手造锁）占用 ⇒ 拒写
  mkdirSync(join(b, '.write-lock'), { recursive: true })
  writeFileSync(join(b, '.write-lock', 'owner.json'), JSON.stringify({ owner: 'other', pid: 1, at: new Date().toISOString(), atMs: Date.now(), note: 'busy' }), 'utf8')
  const r = withBankLock(b, 'A6', () => { throw new Error('不应执行') }, { waitMs: 120 })
  r.refused && !r.ok ? ok('A6 拿不到锁 ⇒ fail-closed 拒执行') : bad(`A6 未 fail-closed：${JSON.stringify(r)}`)
  const log = existsSync(join(b, '.write-lock.log')) ? readFileSync(join(b, '.write-lock.log'), 'utf8') : ''
  log.includes('ev=refused') ? ok('A7 拒写落 .write-lock.log（可观测，纯文本行）') : bad('A7 拒写无痕迹')
  rmSync(join(b, '.write-lock'), { recursive: true, force: true })
  rmSync(b, { recursive: true, force: true })
}

// ── Part B1 · 改造前写法的等价复现（无锁读改写）⇒ 必须能丢更新 ────────────────
console.log('\n── Part B1 · 无锁读改写（改造前形状）⇒ 期望丢更新 ──')
{
  const b = mkBank('b1')
  const target = join(b, 'notes', 'env.md')
  const writer = (marker) => `
    const fs=require('fs');
    const p=${JSON.stringify(target)};
    const t=fs.readFileSync(p,'utf8');
    const s=Date.now(); while(Date.now()-s<40){}
    fs.writeFileSync(p, t + ${JSON.stringify(`- ${marker}\n`)}, 'utf8');
  `
  let lost = 0
  for (let i = 0; i < B1_ROUNDS; i++) {
    await Promise.all([
      run(['-e', writer(`W1-r${i}`)], {}),
      run(['-e', writer(`W2-r${i}`)], {}),
    ])
    const txt = readFileSync(target, 'utf8')
    const miss = ['W1-r' + i, 'W2-r' + i].filter((m) => !txt.includes(m))
    if (miss.length) lost += miss.length
  }
  lost > 0
    ? ok(`B1 无锁形状确实丢更新 ${lost}/${B1_ROUNDS * 2} 条（夹具命中病灶 = 先红成立）`)
    : bad('B1 无锁形状**未丢更新** ⇒ 夹具未命中病灶（阈值/时序需调，不得据此判"安全"）')
  rmSync(b, { recursive: true, force: true })
}

// ── Part B2 · 现行真路径（memory-append + 库锁）⇒ 必须 0 丢更新 ──────────────
console.log('\n── Part B2 · 真路径 memory-append（库锁）⇒ 期望 0 丢更新 ──')
{
  const b = mkBank('b2')
  const target = join(b, 'notes', 'env.md')
  let lost = 0, refused = 0
  for (let i = 0; i < B2_ROUNDS; i++) {
    const rs = await Promise.all([
      run([APPEND, 'notes/env.md', '基准节', `- W1-r${i}`], { MEMORY_ROOT: b }),
      run([APPEND, 'notes/env.md', '基准节', `- W2-r${i}`], { MEMORY_ROOT: b }),
    ])
    refused += rs.filter((r) => r.code === 6).length
    const txt = readFileSync(target, 'utf8')
    const miss = ['W1-r' + i, 'W2-r' + i].filter((m) => !txt.includes(m))
    if (miss.length) lost += miss.length
  }
  lost === 0
    ? ok(`B2 真路径并发 ${B2_ROUNDS} 轮 × 2 写者：0 丢更新${refused ? `（其中 ${refused} 次拒写=锁忙，语义允许）` : ''}`)
    : bad(`B2 真路径仍丢更新 ${lost} 条 ⇒ 库锁未覆盖该写路径`)
  // Part C · 索引行指向的小节必须存在（防孤儿指针）
  await run([APPEND, 'notes/env.md', '基准节', '- 并发锚点条目'], { MEMORY_ROOT: b })
  await run([APPEND, 'MEMORY.md', '基准节', '--new', '[lesson] 并发锚点 · 概况 → notes/env.md §基准节'], { MEMORY_ROOT: b })
  const mem = readFileSync(join(b, 'MEMORY.md'), 'utf8')
  const { agg } = resolveSectionSpec(b, 'env.md', '基准节')
  const hasPtr = mem.includes('notes/env.md')
  hasPtr && agg !== 'missing'
    ? ok('C1 索引行落盘后其 § 指针可解析（无孤儿）')
    : bad(`C1 孤儿指针：memHasPtr=${hasPtr} agg=${agg}`)
  // Part D · 卫生
  const residue = tmpResidue(b)
  residue.length === 0 ? ok('D1 无 .tmp-* 残留（唯一 tmp 名 + 清理）') : bad(`D1 残留：${residue.join(', ')}`)
  !existsSync(join(b, '.write-lock')) ? ok('D2 跑完不留锁') : bad('D2 锁残留（会阻塞后续写者）')
  rmSync(b, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
