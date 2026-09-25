// repo-lock.mjs — **源码树单写者锁**（零依赖 · 多进程安全 · 可重入 · 2026-09-25）
//
// **为什么需要它**（实测事故，非假设）：本仓有若干**会改源码并重建产物**的门禁件
//   （`test-split-equivalence` 明确自述"约 40 秒内临时改源码 + 重建 client.js"）。
//   而 `check-runner.mjs` **没有任何互斥**（实测 `lockfile|LOCK|flock|mutex|pidfile` 0 命中）
//   ⇒ 两处同时跑门禁时，后者的反例注入会被前者的读取/构建夹在中间：
//     · 实测 2026-09-25：`src-client/panes-toggles.js` 的 `renderTogglesSched` 被替换成反例注释后
//       **未被还原**，同时 `src-client/styles.js` 停在 `--sc-nav-w:4px`（反例值）⇒
//       `client.js` 变成**反例态产物**，`test-panel-view-contract` 缺 13 项而红。
//       `test-split-equivalence` 件头 :62-70 自己就记载过这个形态（"一旦污染就永远无法自愈"），
//       只是**没料到并发**是触发路径。
//     · 危害等级：产物被反例污染后，**所有**依赖 `client.js` 的门禁（视图契约 / 几何 / i18n 渲染）
//       读到的是"被人为破坏过的产品"，其绿/红都不可信 —— 属本仓最忌的「假绿」族。
//
// **为什么是仓级而不是文件级**：受害者是**构建产物**（`client.js`/`lib/client.js` 由整棵
//   `src-client/` 树共同产出），两个件改**不同**源文件仍会争同一个产物 ⇒ 互斥粒度必须覆盖整棵源码树。
//
// **为什么用 `mkdir` 而不是 `flock`**：同 `bank-lock.mjs` —— 本仓零依赖且要跨 Windows/POSIX；
//   `mkdirSync` 在两平台都是原子的"不存在才创建"（EEXIST 即失败），等价 O_EXCL。
//
// **与 `bank-lock.mjs` 的分工**（刻意分成两把锁，不合并）：`bank-lock` 守**记忆库数据**，
//   本件守**仓内源码树**；二者的持有者、生命周期、陈旧阈值都不同（源码树改动是秒级、库写入是毫秒级）
//   ⇒ 合成一把会让"跑一次门禁"顺便占住库锁，反而扩大互斥面。**同一套设计纪律，两个作用域。**
//
// 失败语义：**fail-closed**。等不到锁（缺省 90s，比 bank-lock 长 —— 门禁件实测单项可达 40s+）
//   就**拒跑**并落 log，绝不静默放行（放行 = 让两个 build 交叠 = 正是本件要防的那个事故）。
//
// 陈旧锁接管：持有者被强杀会留下锁目录 ⇒ 年龄超 `staleMs`（缺省 300s，覆盖最慢门禁件）
//   即被**改名**接管（`.repo-lock.stale-<ts>`，留证不直删）。释放时**只删自己那把**（比对 owner.json）。
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

export const LOCK_DIRNAME = '.repo-lock'
export const LOCK_ENV = 'SHOUCANG_REPO_LOCK_OWNER'
export const DEFAULT_STALE_MS = 300000
export const DEFAULT_WAIT_MS = 90000
const POLL_MS = 50

export const lockPathOf = (repoRoot) => join(String(repoRoot), LOCK_DIRNAME)
export const lockLogPathOf = (repoRoot) => join(String(repoRoot), '.repo-lock.log')
export const newOwnerId = () => `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** 进程内已持有的锁（**重入表**）：同进程嵌套调用 ⇒ 直接放行，避免自死锁。 */
const HELD = new Map()

/** 读锁状态（只读 · 不抛）。返回 null = 无锁。 */
export function readLockInfo(repoRoot) {
  const dir = lockPathOf(repoRoot)
  try {
    const raw = readFileSync(join(dir, 'owner.json'), 'utf8')
    const o = JSON.parse(raw)
    const ageMs = Date.now() - Number(o?.atMs || 0)
    return { owner: String(o?.owner || ''), pid: Number(o?.pid || 0), at: String(o?.at || ''), note: String(o?.note || ''), ageMs: Number.isFinite(ageMs) ? ageMs : 0 }
  } catch {
    try { return { owner: '', pid: 0, at: '', note: '(owner.json 缺失)', ageMs: Date.now() - statSync(dir).mtimeMs } } catch { return null }
  }
}

/** 锁事件日志：**纯文本行**（不是事件信封）—— 同 bank-lock 的理由：锁轨迹是本地排障信息，
 *  写成 `{ at, ... }` 会被 `check-observability` 的正确断言判为"原始信封写法"。
 *  格式：`<ISO 时刻> ev=… k=v …`（人眼可读、grep 友好）。 */
export function logLockEvent(repoRoot, ev) {
  const body = Object.entries(ev).map(([k, v]) => `${k}=${String(v).replace(/\s+/g, '_')}`).join(' ')
  try { appendFileSync(lockLogPathOf(repoRoot), `${new Date().toISOString()} ${body}\n`, 'utf8') } catch { /* 日志失败不影响锁语义 */ }
}

/** 原子取锁：mkdir 成功即持有（EEXIST ⇒ false）。 */
function tryTake(repoRoot, info) {
  const dir = lockPathOf(repoRoot)
  try {
    mkdirSync(dir)
  } catch {
    return false
  }
  try { writeFileSync(join(dir, 'owner.json'), JSON.stringify(info), 'utf8') } catch { /* owner 写失败仍算持有 */ }
  return true
}

/** 接管陈旧锁：**改名留证**，不直删（同 bank-lock）。 */
function takeOverStale(repoRoot, info, ageMs) {
  const dir = lockPathOf(repoRoot)
  try {
    renameSync(dir, `${dir}.stale-${Date.now()}`)
    logLockEvent(repoRoot, { ev: 'stale-taken-over', by: info.owner, ageMs })
    return true
  } catch { return false }
}

const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* 退化为忙等一次 */ } }

/**
 * 取仓锁。
 * @param repoRoot 仓根目录
 * @param opts { owner?, note?, staleMs?, waitMs?, reentrantToken? }
 * @returns { owner, root, path, reentrant, staleTakenOver, waitedMs } | null（null = 拒跑）
 */
export function acquireRepoLock(repoRoot, opts = {}) {
  const note = String(opts.note || '')
  const staleMs = Number(opts.staleMs || DEFAULT_STALE_MS)
  const waitMs = Number(opts.waitMs ?? DEFAULT_WAIT_MS)
  /* ⓪ 进程内重入：本进程已持锁 ⇒ 直接放行（防同进程嵌套自死锁）。
   * ⚠ **必须与盘上 owner 同源**（2026-09-25 **由自证件先红发现**）：初版只查 HELD 表就放行，
   *   于是「想模拟别的进程持锁」的调用方（传一个不匹配的 reentrantToken）也被判重入 ⇒
   *   **fail-closed 那条路径根本不可达**（自证件 ⑤⑥ 先红实测，且这正是本锁存在的理由）。
   *   真实语义是「**我**已持锁」而非「**有人**持锁」⇒ 只有盘上 owner == 本进程登记的 owner 才算重入。 */
  /* ⚠ 调用方**显式传了 `reentrantToken`** 时表示「我声称我是这个 token」⇒ **不得**再走
   *   进程内 HELD 判定（否则「模拟别的进程持锁」永远被判重入，fail-closed 不可达 ——
   *   这正是自证件 ⑤⑥ 先红暴露的第二层：第一版只查 HELD，第二版查了盘上 owner 但
   *   仍然忽略了 `opts.reentrantToken` 的**显式意图**）。显式 token ⇒ 只认 ① 那段的两边比对。 */
  const explicitToken = opts.reentrantToken !== undefined && String(opts.reentrantToken) !== ''
  const heldOwner = HELD.get(repoRoot)
  if (!explicitToken && heldOwner && readLockInfo(repoRoot)?.owner === heldOwner) {
    return { owner: heldOwner, root: repoRoot, path: lockPathOf(repoRoot), reentrant: true, staleTakenOver: false, waitedMs: 0 }
  }
  // ① 跨进程重入：env 的 owner 必须与盘上 owner 一致（两边都比对，防陈旧 env 免锁）
  const token = String(opts.reentrantToken ?? process.env[LOCK_ENV] ?? '')
  if (token) {
    const cur = readLockInfo(repoRoot)
    if (cur && cur.owner === token) return { owner: token, root: repoRoot, path: lockPathOf(repoRoot), reentrant: true, staleTakenOver: false, waitedMs: 0 }
  }
  const owner = String(opts.owner || newOwnerId())
  const info = { owner, pid: process.pid, at: new Date().toISOString(), atMs: Date.now(), note }
  const t0 = Date.now()
  const taken = (staleTakenOver, waitedMs) => { HELD.set(repoRoot, owner); return { owner, root: repoRoot, path: lockPathOf(repoRoot), reentrant: false, staleTakenOver, waitedMs } }
  for (;;) {
    if (tryTake(repoRoot, info)) return taken(false, Date.now() - t0)
    const cur = readLockInfo(repoRoot)
    const age = cur?.ageMs ?? 0
    if (age > staleMs && takeOverStale(repoRoot, info, age)) {
      if (tryTake(repoRoot, info)) return taken(true, Date.now() - t0)
    }
    if (Date.now() - t0 >= waitMs) {
      logLockEvent(repoRoot, { ev: 'refused', by: owner, holder: cur?.owner || '(unknown)', holderPid: cur?.pid || 0, ageMs: age, waitedMs: Date.now() - t0, note })
      return null
    }
    sleepSync(POLL_MS)
  }
}

/** 释放：**只删自己那把**（owner 不匹配即不动，防误删接管者的锁）。 */
export function releaseRepoLock(handle) {
  if (!handle || handle.reentrant) return false
  const cur = readLockInfo(handle.root)
  if (cur && cur.owner && cur.owner !== handle.owner) return false
  try {
    rmSync(handle.path, { recursive: true, force: true })
    HELD.delete(handle.root)
    return true
  } catch { return false }
}

/**
 * 在仓锁内执行 fn（同步）。**fail-closed**：拿不到锁 ⇒ 不执行、返回 refused。
 * @returns { ok, value?, refused?, error?, waitedMs, staleTakenOver, owner }
 */
export function withRepoLock(repoRoot, note, fn, opts = {}) {
  const h = acquireRepoLock(repoRoot, { ...opts, note })
  if (!h) return { ok: false, refused: true, waitedMs: Number(opts.waitMs ?? DEFAULT_WAIT_MS), staleTakenOver: false, owner: '' }
  try {
    return { ok: true, value: fn(h), refused: false, waitedMs: h.waitedMs, staleTakenOver: h.staleTakenOver, owner: h.owner }
  } catch (e) {
    return { ok: false, error: String(e?.message || e), refused: false, waitedMs: h.waitedMs, staleTakenOver: h.staleTakenOver, owner: h.owner }
  } finally {
    releaseRepoLock(h)
  }
}
