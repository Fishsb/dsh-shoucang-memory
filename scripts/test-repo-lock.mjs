#!/usr/bin/env node
// test-repo-lock.mjs — 仓级单写者锁的行为级判据（2026-09-25 · 事故驱动）
//
// **判因（实测事故）**：`test-split-equivalence` 会临时改源码 + 重建产物，而 `check-runner`
//   无任何互斥 ⇒ 并发跑门禁时它的反例注入未被还原（实测：`panes-toggles.js` 残留反例注释、
//   `styles.js` 停在 `--sc-nav-w:4px`、`client.js` 成反例态产物 ⇒ 视图契约缺 13 项）。
//   本件守 `scripts/repo-lock.mjs` 的四条行为：**互斥 / fail-closed / 只删自己的锁 / 陈旧接管**。
//
// 注意：本件**不建子进程**（跨进程互斥已由人工实测确认：B 抢 A 的锁 ⇒ REFUSED），
//   只验单进程可见的语义 —— 子进程用例在 Windows 上易受 spawn 环境干扰，属"测试自身不稳"风险。
import { acquireRepoLock, releaseRepoLock, readLockInfo, lockPathOf, withRepoLock, newOwnerId } from './repo-lock.mjs'
import { rmSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (c, n) => { console.log(`${c ? '✅' : '❌'} ${n}`); if (c) pass++; else fail++ }

// 隔离沙箱：**绝不锁真仓**（锁目录写在沙箱根下）
const box = mkdtempSync(join(tmpdir(), 'repo-lock-test-'))
const cleanup = () => { try { rmSync(box, { recursive: true, force: true }) } catch {} }

try {
  // ① 取锁成功后盘上可见，且带 owner
  const h1 = acquireRepoLock(box, { note: 't1', waitMs: 300 })
  ok(!!h1 && !h1.reentrant, '① 取锁成功（非重入）')
  const info = readLockInfo(box)
  ok(!!info && info.note === 't1' && info.owner === h1.owner, `① 盘上锁信息与句柄一致（note=${info?.note}）`)

  // ② 同进程重入 ⇒ 放行（防自死锁）
  const h2 = acquireRepoLock(box, { note: 't2', waitMs: 300 })
  ok(!!h2 && h2.reentrant === true, '② 同进程重入直接放行（reentrant=true，防自死锁）')

  // ③ 释放重入句柄**不得**删锁（只删自己那把）
  releaseRepoLock(h2)
  ok(existsSync(lockPathOf(box)), '③ 释放重入句柄后锁仍在（只删真持有者那把）')

  // ④ **反例自证**：把 owner 改写成别人 ⇒ release 必须拒绝删锁（证明"只删自己那把"有判别力）
  const ownerFile = join(lockPathOf(box), 'owner.json')
  const realOwner = readLockInfo(box).owner
  writeFileSync(ownerFile, JSON.stringify({ owner: 'SOMEONE-ELSE', pid: 1, atMs: Date.now() }), 'utf8')
  const del = releaseRepoLock(h1)
  ok(del === false && existsSync(lockPathOf(box)), '④ 反例自证：owner 不匹配 ⇒ release 拒绝删锁（防误删接管者）')
  // 还原 owner 后正常释放
  writeFileSync(ownerFile, JSON.stringify({ owner: realOwner, pid: process.pid, atMs: Date.now() }), 'utf8')
  releaseRepoLock(h1)
  ok(!existsSync(lockPathOf(box)), '④ 还原 owner 后正常释放 ⇒ 锁目录消失')

  // ⑤ **fail-closed**：外部持有（模拟另一进程）⇒ 等不到即返回 null，**绝不静默放行**
  const h3 = acquireRepoLock(box, { note: 'holder', waitMs: 200 })
  const t0 = Date.now()
  // 用**另一个 owner 令牌**绕开同进程重入（模拟"别的进程已持锁"）
  const h4 = acquireRepoLock(box, { note: 'challenger', waitMs: 350, reentrantToken: 'not-the-holder' })
  const waited = Date.now() - t0
  ok(h4 === null, `⑤ fail-closed：拿不到锁返回 null（拒绝执行，实测等待 ${waited}ms）`)
  ok(waited >= 300, `⑤ 确实等满了 waitMs 才放弃（${waited}ms ≥ 300ms，不是立即假拒）`)
  releaseRepoLock(h3)

  // ⑥ withRepoLock：refused 分支**不执行 fn**（'不执行' 与 '执行后失败' 两回事）
  let ran = false
  const h5 = acquireRepoLock(box, { note: 'hold2', waitMs: 200 })
  const r = withRepoLock(box, 'should-be-refused', () => { ran = true; return 1 }, { waitMs: 250, reentrantToken: 'not-the-holder' })
  ok(r.refused === true && ran === false, '⑥ withRepoLock 拒锁时 **fn 未被调用**（refused=true 且 ran=false）')
  releaseRepoLock(h5)

  // ⑦ withRepoLock：成功路径返回 value 且**自动释放**（finally）
  const r2 = withRepoLock(box, 'happy', () => 42, { waitMs: 300 })
  ok(r2.ok === true && r2.value === 42 && !existsSync(lockPathOf(box)), '⑦ withRepoLock 成功路径返回值且自动释放锁')

  // ⑧ 陈旧接管：把锁年龄做成超阈 ⇒ 应被接管（留证改名）而非直删
  /* 模拟"持锁进程已被强杀"：① 让本进程取一次锁（锁目录就位）→ ② 把盘上 owner 改成**
   * 谁都不认识**的死人并配一个很老的 atMs → ③ 从进程内登记表里**摘掉自己**（否则会被判重入）。
   * ⚠ 初版漏了 ③ —— 自证件自己先红，暴露"测不了陈旧接管"（即该分支无覆盖）。 */
  const h6 = acquireRepoLock(box, { note: 'stale-src', waitMs: 200 })
  writeFileSync(ownerFile, JSON.stringify({ owner: 'dead-owner', pid: 999999, atMs: Date.now() - 10 * 60 * 1000 }), 'utf8')
  releaseRepoLock(h6)                                  // 摘掉进程内登记（锁已被改成死人持有，故这次 release 不删目录——见 ④ 的守卫）
  ok(existsSync(lockPathOf(box)), '⑧ 前置：陈旧锁目录仍在（release 因 owner 不匹配而未删，符合 ④ 守卫）')
  const h7 = acquireRepoLock(box, { note: 'taker', waitMs: 2000, staleMs: 1000 })
  ok(!!h7 && h7.staleTakenOver === true, `⑧ 陈旧锁被**接管**（staleTakenOver=${h7?.staleTakenOver}）`)
  const staleLeaked = existsSync(box) && readdirSync(box).some((n) => /stale-/.test(n))
  ok(staleLeaked, '⑧ 接管**留证**（陈旧锁被改名保留，未直删）')
  if (h7) releaseRepoLock(h7)

  // ⑨ newOwnerId 唯一性（防两个进程撞同一 owner ⇒ 互相误删锁）
  const ids = new Set(Array.from({ length: 200 }, () => newOwnerId()))
  ok(ids.size === 200, `⑨ owner id 200 次生成无重复（实测 ${ids.size}/200）`)
} finally {
  cleanup()
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass / ${fail} fail）`)
process.exit(fail ? 1 : 0)
