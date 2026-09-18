// section-rewrite.ts — 库内文件的**唯一写入原语**（S2S3 册零 · 2026-09-19）
//
// 为什么要有这一件：册零实测的病灶不是"某个函数忘了加锁"，而是**写入原语有四分五裂的实现**——
//   ① `treeops.atomicWrite`（`p + '.tmp'` 固定 tmp 名）② `sectionops.applyConvergeOps` 直写（无 tmp/无 rename）
//   ③ `deepsleep-apply.applyPointerOps`（`p + '.tmp'` + 外部 gate）④ `panel-inject.writeMemViaGate`（`.ui-tmp` 固定名）
//   ⑤ `distill-write.writeProfileLine`（`file + '.tmp'`）。固定 tmp 名在两写者并发时**互踩**（一方 rename 走另一方
//   半截的 tmp，或 unlink 掉对方的 tmp），而直写根本没有原子性。⇒ 原语收敛为一件 + **唯一 tmp 名**（pid+序号+随机）。
//
// 三层保障（缺一层就不是原语）：
//   ① **原子**：同目录唯一 tmp → rename（POSIX/Windows 皆原子替换）
//   ② **互斥**：`editFileUnderLock` 在**库级锁**内做「读 → 变换 → 写」，拿不到锁 ⇒ **拒写**（fail-closed）
//   ③ **可验**：写后**回读字节数**校验（`writeFileSync` 返回成功 ≠ 内容真落盘；本项目有"接口成功非达成"的历史事故）
//
// 用法边界：**已在库锁内的调用方**必须用 `atomicWriteFile`（纯原子写，不取锁），不要用 `editFileUnderLock`
//   （它会再取锁——进程内重入表会放行，但语义上是嵌套的两次"读改写"，容易把外层读到的内容写回旧值）。
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { withBankLock, type LockOpts } from './bank-lock.js'

let TMP_SEQ = 0

export interface WriteResult { ok: boolean; error?: string; bytes?: number }
export interface EditResult extends WriteResult { changed?: boolean; refused?: boolean }

/** 原子整文件写（**唯一 tmp 名** + 回读校验）。不取锁 —— 需要互斥请用 `editFileUnderLock`。 */
export function atomicWriteFile(p: string, text: string): WriteResult {
  const tmp = `${p}.tmp-${process.pid}-${TMP_SEQ++}-${Math.random().toString(36).slice(2, 6)}`
  try {
    writeFileSync(tmp, text, 'utf8')
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* 清理失败无害：tmp 名唯一，不会误伤他人 */ }
    return { ok: false, error: `tmp 写失败：${msg(e)}` }
  }
  try {
    renameSync(tmp, p)
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* 同上 */ }
    return { ok: false, error: `rename 失败：${msg(e)}` }
  }
  const want = Buffer.byteLength(text, 'utf8')
  try {
    const got = statSync(p).size
    if (got !== want) return { ok: false, error: `回读字节不符：${got} ≠ ${want}` }
  } catch (e) {
    return { ok: false, error: `回读失败：${msg(e)}` }
  }
  return { ok: true, bytes: want }
}

export const readTextFile = (p: string): string | null => {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

export interface GatedWriteResult extends WriteResult { gate?: string }

/**
 * **带门禁的原子写**（`tmp → 跑门禁 → rename`）：deepsleep `applyPointerOps` 与面板 `writeMemViaGate`
 * 原是两份同型实现（都用固定 tmp 名）⇒ 收敛到本件。门禁在**库锁内**跑（调用方负责取锁）：
 * 门禁脚本本身只读，不会与锁冲突。
 */
export async function gatedWriteFile(
  p: string,
  text: string,
  gate: (tmp: string) => Promise<{ ok: boolean; out?: string; raw?: string }>,
): Promise<GatedWriteResult> {
  const tmp = `${p}.tmp-${process.pid}-${TMP_SEQ++}-${Math.random().toString(36).slice(2, 6)}`
  try {
    writeFileSync(tmp, text, 'utf8')
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* 唯一名，无副作用 */ }
    return { ok: false, error: `tmp 写失败：${msg(e)}` }
  }
  let g: { ok: boolean; out?: string; raw?: string }
  try {
    g = await gate(tmp)
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* 同上 */ }
    return { ok: false, gate: 'gate 异常', error: msg(e) }
  }
  if (!g.ok) {
    try { unlinkSync(tmp) } catch { /* 同上 */ }
    return { ok: false, gate: String(g.out || 'gate 拒收'), error: String(g.raw || '').slice(0, 120) || 'gate 拒收' }
  }
  try {
    renameSync(tmp, p)
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* 同上 */ }
    return { ok: false, gate: 'rename 失败', error: msg(e) }
  }
  const want = Buffer.byteLength(text, 'utf8')
  try {
    if (statSync(p).size !== want) return { ok: false, gate: '回读不符', error: `字节 ${statSync(p).size} ≠ ${want}` }
  } catch (e) {
    return { ok: false, gate: '回读失败', error: msg(e) }
  }
  return { ok: true, bytes: want }
}

const msg = (e: unknown): string => String((e as Error)?.message || e).slice(0, 80)

/** 库锁内的**追加**（append-only 产物：审计/报告/提案流）。 */
export function appendFileUnderLock(bankRoot: string, absPath: string, text: string, opts: LockOpts & { note?: string } = {}): WriteResult {
  const r = withBankLock(bankRoot, String(opts.note || 'append'), () => {
    mkdirSync(dirname(absPath), { recursive: true })
    appendFileSync(absPath, text, 'utf8')
    return Buffer.byteLength(text, 'utf8')
  }, opts)
  if (r.refused) return { ok: false, error: '库锁被占用（拒写）' }
  if (!r.ok) return { ok: false, error: String(r.error || '追加失败') }
  return { ok: true, bytes: Number(r.value || 0) }
}

/**
 * 库锁内的**读 → 变换 → 原子写**（唯一正确的"改写既有文件"姿势）。
 * `mutate` 返回 `null` ⇒ 视为"无需变更"（changed=false，不写盘，避免无谓 mtime 变动与镜像失步）。
 */
export function editFileUnderLock(
  bankRoot: string,
  absPath: string,
  mutate: (lines: string[]) => string[] | null,
  opts: LockOpts & { note?: string } = {},
): EditResult {
  let changed = false
  const r = withBankLock(bankRoot, String(opts.note || 'rewrite'), () => {
    const raw = readFileSync(absPath, 'utf8')
    const next = mutate(raw.split(/\r?\n/))
    if (next === null) return { changed: false }
    const w = atomicWriteFile(absPath, next.join('\n'))
    if (!w.ok) throw new Error(w.error)
    return { changed: true }
  }, opts)
  if (r.refused) return { ok: false, refused: true, changed, error: '库锁被占用（拒写）' }
  if (!r.ok) return { ok: false, changed, error: String(r.error || '改写失败') }
  changed = !!(r.value as { changed?: boolean })?.changed
  return { ok: true, changed }
}
