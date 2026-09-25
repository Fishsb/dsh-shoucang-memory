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
/**
 * CAS 原语结果（ADR-333 册三 · 2026-09-22 新增）。
 * `conflict: true` = **写前**发现文件已被他人改动 ⇒ 本次拒写（fail-closed，**不覆盖**）。
 */
export interface CasResult extends WriteResult { conflict?: boolean }

/**
 * **乐观并发写（CAS）**：写前校验「盘上内容仍是我读到的那份」，是则原子写，否则**拒写**。
 *
 * ── 为什么必须在**原语层**加（不是在各调用点各补一段比对）──────────────────────
 * 本件头注自称三层保障「原子 / **互斥** / **可验**」，但实测两处是缺口：
 *   · **互斥**只有 `editFileUnderLock` 一条路（库锁）；而 `atomicWriteFile` **不取锁**，
 *     且注释明写「需要互斥请用 editFileUnderLock」——问题是**调用方未必能改走库锁**
 *     （`distill-write.writeProfileLine` 与 `deepsleep-apply.commitPrinciples` 都不在锁内）。
 *   · **可验**只比 `statSync(p).size`（**字节数**）⇒ 内容被并发覆盖但**长度相同**时检测不出。
 * ⇒ 两个写者写同一个 `AGENT.md`（画像通道 / 原则通道）**没有任何协议**，末写者胜，
 *   而双方回执都报 `added`/`ok`。该缺陷此前被"画像 167 次全拒"**掩盖**（ADR-333 §4.4 已记载）。
 *
 * ── 语义（与库锁的关系：**互补，不互斥**）────────────────────────────────────
 * · 库锁（`editFileUnderLock`）解决「**同进程内/多进程的编排级互斥**」：拿不到锁就拒写。
 * · CAS 解决「**没有库锁的写者之间的一致性**」：不需要锁，但要求写者的读-改-写是
 *   「读一份 → 基于它改 → 提交时确认它没变」——变了就退让（拒写），由调用方决定重试或上报。
 * · **两者可叠加**：CAS 在锁内是无害的（锁已保证串行，CAS 恒通过）。
 *
 * @param expected 调用方**读到的原始内容**；与实际盘上内容**逐字比较**。
 *   `undefined` ⇒ 允许"文件不存在"（首次创建场景）。
 * @returns 成功 `{ok:true, bytes}`；不一致 `{ok:false, conflict:true}`；其余同 `atomicWriteFile`。
 */
export function atomicWriteFileCas(p: string, text: string, expected: string | undefined): CasResult {
  let current: string | null = null
  try { current = readFileSync(p, 'utf8') } catch { current = null }
  /* 期望「不存在」：只有当前真的读不到时才算匹配（否则说明别人刚建了它 ⇒ 冲突）。 */
  if (expected === undefined) {
    if (current !== null) return { ok: false, conflict: true, error: 'CAS 冲突：文件已被他人创建' }
  } else if (current !== expected) {
    return { ok: false, conflict: true, error: `CAS 冲突：盘上内容与读到的基线不符（盘上 ${current === null ? '不存在' : current.length + ' 字符'} / 基线 ${expected.length} 字符）` }
  }
  return atomicWriteFile(p, text)
}

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
    /* ⚠ ADR-333 册三（2026-09-22）**补内容校验**：原实现只比 `size` ⇒ 内容被并发覆盖
     *   但**长度相同**时检测不出（`atomicWriteFile` 不取锁，`AGENT.md` 有两个无锁写者）。
     *   本件头注自称"③ **可验**"，只验长度撑不起这个自称——现改为**逐字回读比对**。
     *   代价：一次全文件 `readFileSync`（三主档均在 10–50 KB 量级；写入本就是整文件重写，
     *   不构成数量级变化）。⚠ 与下方 `gatedWriteFile` 的同一处校验须**同批**改（孪生形态）。 */
    const gotText = readFileSync(p, 'utf8')
    if (gotText !== text) return { ok: false, error: '回读内容不符（长度相同但内容不同 ⇒ 可能被并发覆盖）' }
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
    // ADR-333 册三：与 `atomicWriteFile` **同批**补内容校验（孪生形态，不同批会造成两套"可验"语义）。
    if (readFileSync(p, 'utf8') !== text) return { ok: false, gate: '回读不符', error: '内容不符（长度相同但内容不同 ⇒ 可能被并发覆盖）' }
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
