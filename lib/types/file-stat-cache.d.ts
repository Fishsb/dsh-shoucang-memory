/** 读数计数器（验收判据用；**不是**性能指标，只证"有没有真的少读"） */
export declare const fileReadStats: {
    hits: number;
    misses: number;
    bytesRead: number;
};
/** 显式失效（进程内写者写完必须调；否则要等 mtime/size 变化才刷新）。**按路径失效该路径的全部生产者**。 */
export declare function invalidate(path: string): void;
/** 清空全部缓存（自测/校准用） */
export declare function clearFileStatCache(): void;
/**
 * 非空行数（缓存）。文件不存在或不可读 ⇒ `-1`（调用方按既有 `existsSync` 守卫处理）。
 * ⚠ 语义 = 「非空行数」，与原先 `readFileSync(...).split('\n').filter(trim).length` **逐字等价**。
 */
export declare function nonEmptyLineCount(path: string): number;
/**
 * **真字节级尾读**：返回文件末尾 ≤`n` 个非空行（缓存）。
 *
 * ⚠ 语义边界（如实记）：只读末尾 ≤`maxBytes` 窗口。窗口**以前**的历史行不在结果里 ——
 *   对"最近 N 行"型展示是**等价**的；对"必须看到全史"的调用点（如蒸馏水位回放）**不得使用本函数**。
 * 缺省窗口 256KB：以台账每行 ~200–400B 计 ≈ 700+ 行，远大于展示所需的 10 行。
 */
export declare function readTailLines(path: string, n: number, maxBytes?: number): string[];
/** 文件字节数（缓存 stat）；不存在 ⇒ `-1`。给"只要一个尺寸"的展示型调用点用。 */
export declare function statSize(path: string): number;
