#!/usr/bin/env node
// check-bank-lock-parity.mjs — S2S3 册零：**库锁跨面差分锁**（2026-09-19）
//
// 为什么需要：库锁有**两份物理实现** —— 宿主侧 `src/bank-lock.ts`（编译为 `lib/bank-lock.js`）与
//   零依赖孪生 `scripts/bank-lock.mjs` ≡ `skill/scripts/bank-lock.mjs`（子进程与 skill 侧调用）。
//   两份实现若语义漂移，会出现「宿主以为互斥、子进程以为没锁」的**静默并发写**（本册要治的正是这个）。
//   先例：`section-ref` ↔ `section-ref.mjs` 由 `check-section-ref-parity.mjs` 差分锁守。
//
// 三档断言：
//   ① **孪生逐字节**：skill 侧与 scripts 侧 sha256 相等（同一份文件两处投放）
//   ② **行为差分**：脚本化场景（取锁/重入/拒写/陈旧接管/释放）在 `.mjs` 与 `lib/*.js` 两侧
//      产出**同一组结果**（忽略 owner id 与耗时）
//   ③ **反例自证**：故意让一侧"免锁"（注入 owner 令牌但盘上无锁）⇒ 断言必须判两者一致为**拒写/正常取锁**，
//      即"只有 env 无锁 ⇒ 不认重入"这条不能漂移
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

// ① 孪生逐字节
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const twinA = join(ROOT, 'skill', 'scripts', 'bank-lock.mjs')
const twinB = join(ROOT, 'scripts', 'bank-lock.mjs')
if (!existsSync(twinA) || !existsSync(twinB)) {
  bad(`孪生缺失：${existsSync(twinA)} / ${existsSync(twinB)}`)
} else {
  const a = sha(twinA), b = sha(twinB)
  a === b ? ok(`孪生逐字节一致（${a.slice(0, 12)}）`) : bad(`孪生漂移：${a.slice(0, 12)} ≠ ${b.slice(0, 12)}`)
}

// ② 行为差分：两侧跑同一脚本化场景
const mkBank = () => {
  const b = mkdtempSync(join(tmpdir(), 'sc-lockpar-'))
  mkdirSync(b, { recursive: true })
  return b
}
const scenario = (m) => {
  const b = mkBank()
  const rec = {}
  const h1 = m.acquireBankLock(b, { note: 'p1' })
  rec.acquired = !!h1
  rec.ownerMatches = !!h1 && m.readLockInfo(b)?.owner === h1.owner
  const h2 = m.acquireBankLock(b, { note: 'p2' })
  rec.nestedReentrant = !!h2?.reentrant
  rec.stillLocked = existsSync(join(b, '.write-lock'))
  m.releaseBankLock(h1)
  rec.released = m.readLockInfo(b) === null
  // 拒写：占位锁 + 短等待
  mkdirSync(join(b, '.write-lock'), { recursive: true })
  writeFileSync(join(b, '.write-lock', 'owner.json'), JSON.stringify({ owner: 'busy', pid: 1, at: new Date().toISOString(), atMs: Date.now(), note: 'busy' }), 'utf8')
  const r = m.withBankLock(b, 'p3', () => 'ran', { waitMs: 120 })
  rec.refused = !!r.refused && r.ok === false
  rec.ranNot = r.value === undefined
  // 陈旧接管
  rmSync(join(b, '.write-lock'), { recursive: true, force: true })
  mkdirSync(join(b, '.write-lock'), { recursive: true })
  writeFileSync(join(b, '.write-lock', 'owner.json'), JSON.stringify({ owner: 'ghost', pid: 9, at: new Date(0).toISOString(), atMs: 1, note: 'stale' }), 'utf8')
  const h3 = m.acquireBankLock(b, { note: 'p4', staleMs: 50 })
  rec.staleTakenOver = !!h3?.staleTakenOver
  rec.forensics = readdirSync(b).filter((n) => n.startsWith('.write-lock.stale-')).length === 1
  m.releaseBankLock(h3)
  // 只有 env 令牌、盘上无锁 ⇒ 不得认重入（防陈旧 env 静默免锁）
  const h4 = m.acquireBankLock(b, { note: 'p5', reentrantToken: 'stale-env-token' })
  rec.envWithoutLockNotReentrant = !!h4 && h4.reentrant === false
  m.releaseBankLock(h4)
  rmSync(b, { recursive: true, force: true })
  return rec
}

const mjs = await import(new URL('../scripts/bank-lock.mjs', import.meta.url).href)
let lib = null
try { lib = await import(new URL('../lib/bank-lock.js', import.meta.url).href) } catch { /* 未构建 */ }
if (!lib) {
  bad('lib/bank-lock.js 缺失（未构建）⇒ 差分锁无法比对')
} else {
  const a = scenario(mjs), b = scenario(lib)
  const keys = Object.keys(a)
  const diff = keys.filter((k) => a[k] !== b[k])
  diff.length === 0
    ? ok(`行为差分：${keys.length} 项语义两侧一致（取锁/重入/拒写/接管/释放/env 令牌）`)
    : bad(`行为漂移：${diff.map((k) => `${k}(mjs=${a[k]},lib=${b[k]})`).join(' · ')}`)
  a.refused && a.envWithoutLockNotReentrant && a.staleTakenOver && a.forensics
    ? ok('反例自证：拒写 / 陈旧接管留证 / env 无锁不认重入 三项均成立（断言非恒真）')
    : bad(`反例自证失败：${JSON.stringify(a)}`)
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
