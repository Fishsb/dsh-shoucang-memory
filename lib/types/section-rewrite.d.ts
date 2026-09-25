import { type LockOpts } from './bank-lock.js';
export interface WriteResult {
    ok: boolean;
    error?: string;
    bytes?: number;
}
export interface EditResult extends WriteResult {
    changed?: boolean;
    refused?: boolean;
}
/**
 * CAS 原语结果（ADR-333 册三 · 2026-09-22 新增）。
 * `conflict: true` = **写前**发现文件已被他人改动 ⇒ 本次拒写（fail-closed，**不覆盖**）。
 */
export interface CasResult extends WriteResult {
    conflict?: boolean;
}
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
export declare function atomicWriteFileCas(p: string, text: string, expected: string | undefined): CasResult;
/** 原子整文件写（**唯一 tmp 名** + 回读校验）。不取锁 —— 需要互斥请用 `editFileUnderLock`。 */
export declare function atomicWriteFile(p: string, text: string): WriteResult;
export declare const readTextFile: (p: string) => string | null;
export interface GatedWriteResult extends WriteResult {
    gate?: string;
}
/**
 * **带门禁的原子写**（`tmp → 跑门禁 → rename`）：deepsleep `applyPointerOps` 与面板 `writeMemViaGate`
 * 原是两份同型实现（都用固定 tmp 名）⇒ 收敛到本件。门禁在**库锁内**跑（调用方负责取锁）：
 * 门禁脚本本身只读，不会与锁冲突。
 */
export declare function gatedWriteFile(p: string, text: string, gate: (tmp: string) => Promise<{
    ok: boolean;
    out?: string;
    raw?: string;
}>): Promise<GatedWriteResult>;
/** 库锁内的**追加**（append-only 产物：审计/报告/提案流）。 */
export declare function appendFileUnderLock(bankRoot: string, absPath: string, text: string, opts?: LockOpts & {
    note?: string;
}): WriteResult;
/**
 * 库锁内的**读 → 变换 → 原子写**（唯一正确的"改写既有文件"姿势）。
 * `mutate` 返回 `null` ⇒ 视为"无需变更"（changed=false，不写盘，避免无谓 mtime 变动与镜像失步）。
 */
export declare function editFileUnderLock(bankRoot: string, absPath: string, mutate: (lines: string[]) => string[] | null, opts?: LockOpts & {
    note?: string;
}): EditResult;
