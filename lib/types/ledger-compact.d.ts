/**
 * 裁剪决策（纯函数）。
 * @returns 应保留的行数组；**`null` 表示未超阈值、无需裁剪**（调用方不该重写文件）。
 */
export declare function planCompaction(lines: string[], type: string, keepLast: number, slack: number): string[] | null;
/**
 * 对文件执行按 type 裁剪（best-effort，**绝不抛**）。
 * @returns `'compacted'`（已裁剪并原子替换）| `'noop'`（未超阈值）| `'missing'`（文件不存在）
 */
export declare function compactFile(file: string, type: string, keepLast: number, slack: number): 'compacted' | 'noop' | 'missing';
