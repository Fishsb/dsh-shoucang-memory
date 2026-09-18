// bank-lock.mjs — **库级单写者锁**（零依赖 · 多进程安全 · 可重入 · 2026-09-19 S2S3 册零）
//
// 为什么是**库级**而不是文件级：册零实测的病灶是**跨文件不一致**——「索引行落了、notes 节没落」。
//   两个文件各自加锁仍可半成功（先写 INDEX.md 成功、后写 notes/ 失败，或反之），所以互斥粒度必须
//   覆盖**整个库**：同一时刻只允许一个写者持有 `<bank>/.write-lock`。
//
// 为什么用 `mkdir` 而不是 `flock`：本仓**零依赖**且要跨 Windows/POSIX；`mkdirSync` 在两个平台上
//   都是原子的"不存在才创建"（EEXIST 即失败），等价于 O_EXCL，无需第三方库。
//
// 为什么子进程要经 env 参与：蒸馏的落盘走**子进程**（`memory-append.mjs`），而宿主侧可能已经持锁
//   （父写 → 派生 → 子写）。子进程若再抢同一把锁 ⇒ **自死锁**。故父进程把 owner 写进
//   `SHOUCANG_BANK_LOCK_OWNER` 传给子进程；子进程发现「env 里的 owner == 盘上锁的 owner」即
//   判定为**重入**，直接放行（不重复加锁、也不负责释放）。判定必须两边都比对：只有 env 而无对应
//   盘上锁 ⇒ 不认（防陈旧 env 让写者**静默免锁**）。
//
// 失败语义：**fail-closed**。等不到锁（缺省 5s）就**拒写**并把拒写落进 `<bank>/.write-lock.log`，
//   绝不静默放行（"探针 PASS ≠ 生效"那种假绿在本层代价最大：会写坏库）。
//
// 陈旧锁接管：持有者被强杀会留下锁目录 ⇒ 年龄超 `staleMs`（缺省 120s）即被**改名**接管
//   （`.write-lock.stale-<ts>`，留证不直删），接管动作同样落 log。释放时**只删自己那把**
//   （比对 owner.json），防"我的锁已被接管，我却把新持有者的锁删了"。
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

export const LOCK_DIRNAME = '.write-lock'
export const LOCK_ENV = 'SHOUCANG_BANK_LOCK_OWNER'
export const DEFAULT_STALE_MS = 120000
export const DEFAULT_WAIT_MS = 5000
const POLL_MS = 25

export const lockPathOf = (bankRoot) => join(String(bankRoot), LOCK_DIRNAME)
export const lockLogPathOf = (bankRoot) => join(String(bankRoot), '.write-lock.log')
export const newOwnerId = () => `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** 进程内已持有的锁（**重入表**）：宿主持锁时再嵌套调用 ⇒ 直接放行，避免自死锁。 */
const HELD = new Map()

/** 读锁状态（只读 · 不抛）。返回 null = 无锁。 */
export function readLockInfo(bankRoot) {
  const dir = lockPathOf(bankRoot)
  try {
    const raw = readFileSync(join(dir, 'owner.json'), 'utf8')
    const o = JSON.parse(raw)
    const ageMs = Date.now() - Number(o?.atMs || 0)
    return { owner: String(o?.owner || ''), pid: Number(o?.pid || 0), at: String(o?.at || ''), note: String(o?.note || ''), ageMs: Number.isFinite(ageMs) ? ageMs : null }
  } catch {
    try { return { owner: '', pid: 0, at: '', note: '(owner.json 缺失)', ageMs: Date.now() - statSync(dir).mtimeMs } } catch { return null }
  }
}

/** 锁事件日志：**纯文本行**（不是事件信封）——锁轨迹是本地排障信息，刻意不写成
 *  `{ at, ... }` 的 JSON 信封形态：① 会被 `check-observability` 的正确断言判为"原始信封写法"；
 *  ② 也不该混进统一台账的语义。格式：`<ISO 时刻> ev=… k=v …`（人眼可读、grep 友好）。 */
export function logLockEvent(bankRoot, ev) {
  const body = Object.entries(ev).map(([k, v]) => `${k}=${String(v).replace(/\s+/g, '_')}`).join(' ')
  try { appendFileSync(lockLogPathOf(bankRoot), `${new Date().toISOString()} ${body}\n`, 'utf8') } catch { /* 日志失败不影响锁语义 */ }
}

/** 原子取锁：mkdir 成功即持有（EEXIST ⇒ false）。 */
function tryTake(bankRoot, info) {
  try {
    mkdirSync(lockPathOf(bankRoot))
  } catch {
    return false
  }
  try {
    writeFileSync(join(lockPathOf(bankRoot), 'owner.json'), JSON.stringify(info), 'utf8')
  } catch { /* owner.json 写失败不影响互斥本身 */ }
  return true
}

/** 陈旧锁改名接管（留证不直删）。改名成功即视为腾空，由调用方重试取锁。 */
function takeOverStale(bankRoot, info, ageMs) {
  const dst = `${lockPathOf(bankRoot)}.stale-${new Date().toISOString().replace(/[:.]/g, '-')}`
  try {
    renameSync(lockPathOf(bankRoot), dst)
  } catch {
    return false
  }
  logLockEvent(bankRoot, { ev: 'takeover', by: info.owner, staleOwner: readLockInfo(dst)?.owner || '(unknown)', ageMs, dir: dst })
  return true
}

const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { const t = Date.now(); while (Date.now() - t < ms) { /* 退化自旋 */ } } }

/**
 * 取库锁。
 * @param bankRoot 库根（记忆库根目录）
 * @param opts { owner?, note?, staleMs?, waitMs?, reentrantToken? }
 * @returns { owner, path, reentrant, staleTakenOver, waitedMs } | null
 */
export function acquireBankLock(bankRoot, opts = {}) {
  const note = String(opts.note || '')
  const staleMs = Number(opts.staleMs || DEFAULT_STALE_MS)
  const waitMs = Number(opts.waitMs ?? DEFAULT_WAIT_MS)
  // ⓪ 进程内重入：本进程已持库锁 ⇒ 直接放行（防宿主自身嵌套调用自死锁）
  if (HELD.has(bankRoot)) return { owner: HELD.get(bankRoot), root: bankRoot, path: lockPathOf(bankRoot), reentrant: true, staleTakenOver: false, waitedMs: 0 }
  // ① 跨进程重入：env 的 owner 必须与盘上 owner 一致（两边都比对，防陈旧 env 免锁）
  const token = String(opts.reentrantToken ?? process.env[LOCK_ENV] ?? '')
  if (token) {
    const cur = readLockInfo(bankRoot)
    if (cur && cur.owner === token) return { owner: token, root: bankRoot, path: lockPathOf(bankRoot), reentrant: true, staleTakenOver: false, waitedMs: 0 }
  }
  const owner = String(opts.owner || newOwnerId())
  const info = { owner, pid: process.pid, at: new Date().toISOString(), atMs: Date.now(), note }
  const t0 = Date.now()
  const taken = (staleTakenOver) => { HELD.set(bankRoot, owner); return { owner, root: bankRoot, path: lockPathOf(bankRoot), reentrant: false, staleTakenOver, waitedMs: Date.now() - t0 } }
  for (;;) {
    if (tryTake(bankRoot, info)) return taken(false)
    const cur = readLockInfo(bankRoot)
    const age = cur?.ageMs ?? 0
    if (age > staleMs && takeOverStale(bankRoot, info, age)) {
      if (tryTake(bankRoot, info)) return taken(true)
    }
    if (Date.now() - t0 >= waitMs) {
      logLockEvent(bankRoot, { ev: 'refused', by: owner, holder: cur?.owner || '(unknown)', holderPid: cur?.pid || 0, ageMs: age, waitedMs: Date.now() - t0, note })
      return null
    }
    sleepSync(POLL_MS)
  }
}

/** 释放：**只删自己那把**（owner 不匹配即不动，防误删接管者的锁）。 */
export function releaseBankLock(handle) {
  if (!handle || handle.reentrant) return false
  const cur = readLockInfo(handle.root)
  if (cur && cur.owner && cur.owner !== handle.owner) return false
  try {
    rmSync(handle.path, { recursive: true, force: true })
    HELD.delete(handle.root)
    return true
  } catch {
    return false
  }
}

/**
 * 在库锁内执行 fn（同步）。**fail-closed**：拿不到锁 ⇒ 不执行、返回 refused。
 * @returns { ok, value?, refused?, error?, waitedMs, staleTakenOver, owner }
 */
export function withBankLock(bankRoot, note, fn, opts = {}) {
  const h = acquireBankLock(bankRoot, { ...opts, note })
  if (!h) return { ok: false, refused: true, waitedMs: Number(opts.waitMs ?? DEFAULT_WAIT_MS), staleTakenOver: false, owner: '' }
  try {
    return { ok: true, value: fn(h), refused: false, waitedMs: h.waitedMs, staleTakenOver: h.staleTakenOver, owner: h.owner }
  } catch (e) {
    return { ok: false, error: String(e?.message || e), refused: false, waitedMs: h.waitedMs, staleTakenOver: h.staleTakenOver, owner: h.owner }
  } finally {
    releaseBankLock(h)
  }
}

// ── CLI（人工查锁 / 夹具取证）：node bank-lock.mjs --root <bank> [--info|--json] ──
// ⚠ 判据必须是**精确 basename**：`endsWith('bank-lock.mjs')` 会把 `test-bank-lock.mjs` 也判成主模块
//   （实测：一跑夹具就掉进这里）。故取分隔符后的文件名做全等比对。
const selfName = String(process.argv[1] || '').split(/[\\/]/).pop()
if (selfName === 'bank-lock.mjs') {
  const a = process.argv.slice(2)
  const i = a.indexOf('--root')
  const root = i >= 0 ? a[i + 1] : ''
  if (!root) {
    console.log('用法: node bank-lock.mjs --root <库根> [--info|--json]')
    process.exit(2)
  }
  const info = readLockInfo(root)
  if (a.includes('--json')) console.log(JSON.stringify(info))
  else console.log(info ? `锁存在：owner=${info.owner} pid=${info.pid} age=${info.ageMs}ms note=${info.note}` : '无锁（空闲）')
}
