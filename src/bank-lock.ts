// bank-lock.ts — **库级单写者锁**（宿主侧实现 · 与零依赖孪生 `scripts/bank-lock.mjs` / `skill/scripts/bank-lock.mjs` **同语义**）
//
// 为什么是**库级**而不是文件级：册零实测的病灶是**跨文件不一致**——「索引行落了、notes 节没落」。
//   两个文件各自加锁仍可半成功，所以互斥粒度必须覆盖**整个库**：同一时刻只有一个写者可持 `<bank>/.write-lock`。
//
// 为什么 `mkdir`：零依赖 + 跨平台；`mkdirSync` 在 Windows/POSIX 都是原子的"不存在才创建"，等价 O_EXCL。
//
// 跨进程：蒸馏落盘走子进程（`memory-append.mjs`），而宿主可能已持锁（父写 → 派生 → 子写）⇒ 子进程
//   必须能识别**重入**。父进程把 owner 经 `SHOUCANG_BANK_LOCK_OWNER` 传下去；子进程要求
//   「env 的 owner == 盘上 owner」才认重入（只有 env 无锁 ⇒ 不认，防陈旧 env 静默免锁）。
//
// 失败语义：**fail-closed**（等不到就拒写并落 `<bank>/.write-lock.log`），绝不静默放行。
// 陈旧接管：年龄超 `staleMs` ⇒ 改名 `.write-lock.stale-<ts>`（留证不直删）后重试一次；释放只删自己那把。
//
// ⚠ 与本件同语义的第二份物理实现在 `scripts/bank-lock.mjs`（零依赖 · 供子进程与 skill 侧调用），
//   两者由 `scripts/check-bank-lock-parity.mjs` 差分锁守（先例：`section-ref` ↔ `section-ref.mjs`）。
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const LOCK_DIRNAME = '.write-lock'
export const LOCK_ENV = 'SHOUCANG_BANK_LOCK_OWNER'
export const DEFAULT_STALE_MS = 120000
export const DEFAULT_WAIT_MS = 5000
const POLL_MS = 25

export interface LockInfo { owner: string; pid: number; at: string; note: string; ageMs: number | null }
export interface LockHandle { owner: string; root: string; path: string; reentrant: boolean; staleTakenOver: boolean; waitedMs: number }
export interface LockOpts { owner?: string; note?: string; staleMs?: number; waitMs?: number; reentrantToken?: string }
export interface LockedRun<T> { ok: boolean; value?: T; refused?: boolean; error?: string; waitedMs: number; staleTakenOver: boolean; owner: string }

export const lockPathOf = (bankRoot: string): string => join(String(bankRoot), LOCK_DIRNAME)
export const lockLogPathOf = (bankRoot: string): string => join(String(bankRoot), '.write-lock.log')
export const newOwnerId = (): string => `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** 读锁状态（只读 · 不抛）。null = 无锁。 */
export function readLockInfo(bankRoot: string): LockInfo | null {
  const dir = lockPathOf(bankRoot)
  try {
    const o = JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8')) as Record<string, unknown>
    const age = Date.now() - Number(o?.atMs || 0)
    return { owner: String(o?.owner || ''), pid: Number(o?.pid || 0), at: String(o?.at || ''), note: String(o?.note || ''), ageMs: Number.isFinite(age) ? age : null }
  } catch {
    try { return { owner: '', pid: 0, at: '', note: '(owner.json 缺失)', ageMs: Date.now() - statSync(dir).mtimeMs } } catch { return null }
  }
}

/** 锁事件日志：**纯文本行**（刻意不写成 `{ at, ... }` 的 JSON 信封——那会被
 *  `check-observability` 判为"原始信封写法"，且锁轨迹本不该混进统一台账语义）。
 *  格式：`<ISO 时刻> ev=… k=v …`（人眼可读、grep 友好）。 */
export function logLockEvent(bankRoot: string, ev: Record<string, unknown>): void {
  const body = Object.entries(ev).map(([k, v]) => `${k}=${String(v).replace(/\s+/g, '_')}`).join(' ')
  try { appendFileSync(lockLogPathOf(bankRoot), `${new Date().toISOString()} ${body}\n`, 'utf8') } catch { /* 日志失败不影响锁语义 */ }
}

/** 原子取锁：mkdir 成功即持有。 */
function tryTake(bankRoot: string, info: Record<string, unknown>): boolean {
  try { mkdirSync(lockPathOf(bankRoot)) } catch { return false }
  try { writeFileSync(join(lockPathOf(bankRoot), 'owner.json'), JSON.stringify(info), 'utf8') } catch { /* 互斥已成立 */ }
  return true
}

/** 陈旧锁改名接管（留证不直删）。 */
function takeOverStale(bankRoot: string, owner: string, ageMs: number): boolean {
  const dst = `${lockPathOf(bankRoot)}.stale-${new Date().toISOString().replace(/[:.]/g, '-')}`
  try { renameSync(lockPathOf(bankRoot), dst) } catch { return false }
  logLockEvent(bankRoot, { ev: 'takeover', by: owner, staleOwner: readLockInfo(dst)?.owner || '(unknown)', ageMs, dir: dst })
  return true
}

const sleepSync = (ms: number): void => {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { const t = Date.now(); while (Date.now() - t < ms) { /* 退化自旋 */ } }
}

/** 进程内已持有的锁（**重入表**）：宿主持锁时再嵌套调用 ⇒ 直接放行，避免自死锁。 */
const HELD = new Map<string, string>()

/** 取库锁；null = 等不到（调用方**必须**按拒写处理）。 */
export function acquireBankLock(bankRoot: string, opts: LockOpts = {}): LockHandle | null {
  const note = String(opts.note || '')
  const staleMs = Number(opts.staleMs || DEFAULT_STALE_MS)
  const waitMs = Number(opts.waitMs ?? DEFAULT_WAIT_MS)
  // ⓪ 进程内重入：本进程已持库锁 ⇒ 直接放行（防宿主自身嵌套调用自死锁）
  if (HELD.has(bankRoot)) return { owner: HELD.get(bankRoot) as string, root: bankRoot, path: lockPathOf(bankRoot), reentrant: true, staleTakenOver: false, waitedMs: 0 }
  // ① 跨进程重入：env 的 owner 必须与盘上 owner 一致（两边都比对，防陈旧 env 免锁）
  const token = String(opts.reentrantToken ?? process.env[LOCK_ENV] ?? '')
  if (token) {
    const cur = readLockInfo(bankRoot)
    if (cur && cur.owner === token) return { owner: token, root: bankRoot, path: lockPathOf(bankRoot), reentrant: true, staleTakenOver: false, waitedMs: 0 }
  }
  const owner = String(opts.owner || newOwnerId())
  const info = { owner, pid: process.pid, at: new Date().toISOString(), atMs: Date.now(), note }
  const t0 = Date.now()
  const taken = (staleTakenOver: boolean): LockHandle => {
    HELD.set(bankRoot, owner)
    return { owner, root: bankRoot, path: lockPathOf(bankRoot), reentrant: false, staleTakenOver, waitedMs: Date.now() - t0 }
  }
  for (;;) {
    if (tryTake(bankRoot, info)) return taken(false)
    const cur = readLockInfo(bankRoot)
    const age = cur?.ageMs ?? 0
    if (age > staleMs && takeOverStale(bankRoot, owner, age) && tryTake(bankRoot, info)) return taken(true)
    if (Date.now() - t0 >= waitMs) {
      logLockEvent(bankRoot, { ev: 'refused', by: owner, holder: cur?.owner || '(unknown)', holderPid: cur?.pid || 0, ageMs: age, waitedMs: Date.now() - t0, note })
      return null
    }
    sleepSync(POLL_MS)
  }
}

/** 释放：只删自己那把（owner 不匹配即不动）。 */
export function releaseBankLock(handle: LockHandle | null): boolean {
  if (!handle || handle.reentrant) return false
  const cur = readLockInfo(handle.root)
  if (cur && cur.owner && cur.owner !== handle.owner) return false
  try { rmSync(handle.path, { recursive: true, force: true }); HELD.delete(handle.root); return true } catch { return false }
}

/** 在库锁内执行（同步）；**fail-closed**：拿不到锁 ⇒ 不执行、refused=true。 */
export function withBankLock<T>(bankRoot: string, note: string, fn: (h: LockHandle) => T, opts: LockOpts = {}): LockedRun<T> {
  const h = acquireBankLock(bankRoot, { ...opts, note })
  if (!h) return { ok: false, refused: true, waitedMs: Number(opts.waitMs ?? DEFAULT_WAIT_MS), staleTakenOver: false, owner: '' }
  try {
    return { ok: true, value: fn(h), refused: false, waitedMs: h.waitedMs, staleTakenOver: h.staleTakenOver, owner: h.owner }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e), refused: false, waitedMs: h.waitedMs, staleTakenOver: h.staleTakenOver, owner: h.owner }
  } finally {
    releaseBankLock(h)
  }
}
