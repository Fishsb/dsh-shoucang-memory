export declare const LOCK_DIRNAME = ".write-lock";
export declare const LOCK_ENV = "SHOUCANG_BANK_LOCK_OWNER";
export declare const DEFAULT_STALE_MS = 120000;
export declare const DEFAULT_WAIT_MS = 5000;
export interface LockInfo {
    owner: string;
    pid: number;
    at: string;
    note: string;
    ageMs: number | null;
}
export interface LockHandle {
    owner: string;
    root: string;
    path: string;
    reentrant: boolean;
    staleTakenOver: boolean;
    waitedMs: number;
}
export interface LockOpts {
    owner?: string;
    note?: string;
    staleMs?: number;
    waitMs?: number;
    reentrantToken?: string;
}
export interface LockedRun<T> {
    ok: boolean;
    value?: T;
    refused?: boolean;
    error?: string;
    waitedMs: number;
    staleTakenOver: boolean;
    owner: string;
}
export declare const lockPathOf: (bankRoot: string) => string;
export declare const lockLogPathOf: (bankRoot: string) => string;
export declare const newOwnerId: () => string;
/** 读锁状态（只读 · 不抛）。null = 无锁。 */
export declare function readLockInfo(bankRoot: string): LockInfo | null;
/** 锁事件日志：**纯文本行**（刻意不写成 `{ at, ... }` 的 JSON 信封——那会被
 *  `check-observability` 判为"原始信封写法"，且锁轨迹本不该混进统一台账语义）。
 *  格式：`<ISO 时刻> ev=… k=v …`（人眼可读、grep 友好）。 */
export declare function logLockEvent(bankRoot: string, ev: Record<string, unknown>): void;
/** 取库锁；null = 等不到（调用方**必须**按拒写处理）。 */
export declare function acquireBankLock(bankRoot: string, opts?: LockOpts): LockHandle | null;
/** 释放：只删自己那把（owner 不匹配即不动）。 */
export declare function releaseBankLock(handle: LockHandle | null): boolean;
/** 在库锁内执行（同步）；**fail-closed**：拿不到锁 ⇒ 不执行、refused=true。 */
export declare function withBankLock<T>(bankRoot: string, note: string, fn: (h: LockHandle) => T, opts?: LockOpts): LockedRun<T>;
