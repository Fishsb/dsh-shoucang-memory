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
