/**
 * file-stat-cache.ts — 按 (mtimeMs,size) 失效的**文件读取结果缓存**（2026-09-17 · 圆桌会审 D-I5）
 *
 * **判因（实测）**：面板热路径每次请求都**全量同步读**大文件 ——
 *   · `.vector-cache.jsonl` = 10,411,213 B（`/vector/status2`，前端 `panes-toggles.js:435` **每 30s** 轮询，
 *     而该处**只需要一个行数**）；
 *   · `audit/ledger.jsonl` = 3,499,167 B（`/mcl/status` 全量读 + 逐行 `JSON.parse` 后**只取末 10 行**）。
 *   文件没变时，这些结果**逐字相同** ⇒ 每 30s 白读 ~10MB（同步读，占唯一事件循环）。
 *
 * **设计**
 *   · 键 = 绝对路径；失效判据 = **`mtimeMs` + `size` 双元组**（任一变化即失效 ⇒ 跨进程写入也能自然失效）
 *   · 容量 **LRU ≤ 32 条**（本模块自身不得成为新的内存泄漏源）
 *   · **进程内写者**应显式调 `invalidate(path)`；跨进程只能靠双元组（代价 = 一次 `statSync`，可接受）
 *   · `readTailLines` 是**真字节级尾读**（`openSync`+`fstatSync`+末尾 ≤maxBytes 回读再切行）——
 *     刻意**不复用** `panel-memory.ts#readJsonlTail`：那件本身也是 `readFileSync` **全量读** + `slice(-n)`，
 *     拿它当"尾读范式"是伪优化（圆桌会审已实测点破）。
 *   · 零依赖；任何异常回退为"调用方拿到空/负值"，**绝不抛**（热路径不得因缓存不可用而 500）。
 *
 * **可观测**：导出 `fileReadStats`（hits/misses/bytesRead），供验收断言
 *   「读取字节数**不随文件增长线性增长**」（实测口径，而非自述）。
 */
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
const MAX_ENTRIES = 32;
const cache = new Map();
/** 读数计数器（验收判据用；**不是**性能指标，只证"有没有真的少读"） */
export const fileReadStats = { hits: 0, misses: 0, bytesRead: 0 };
/** 缓存键 = **生产者标识 + 路径**。
 *  ⚠ 判因（本轮实测抓到的真 bug）：首版只用路径作键 ⇒ `statSize()` 存的 `st.size` 被
 *  `nonEmptyLineCount()` 命中后**当成行数返回**（实测 `/vector/status2` 的 `cache.lines` 等于
 *  文件字节数 10411213）。同一路径会被多个**语义不同**的生产者读 ⇒ 键必须带上生产者身份。 */
const keyOf = (kind, path) => kind + '\u0000' + path;
function statOf(path) {
    try {
        const st = statSync(path);
        return { mtimeMs: st.mtimeMs, size: st.size };
    }
    catch {
        return null;
    }
}
function cached(kind, path, produce) {
    const st = statOf(path);
    if (!st)
        return null;
    const key = keyOf(kind, path);
    const hit = cache.get(key);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
        fileReadStats.hits++;
        cache.delete(key);
        cache.set(key, hit); // LRU 提升（Map 保序）
        return hit.value;
    }
    fileReadStats.misses++;
    const value = produce(st);
    cache.set(key, { mtimeMs: st.mtimeMs, size: st.size, value });
    while (cache.size > MAX_ENTRIES) {
        const k = cache.keys().next().value;
        if (k === undefined)
            break;
        cache.delete(k);
    }
    return value;
}
/** 显式失效（进程内写者写完必须调；否则要等 mtime/size 变化才刷新）。**按路径失效该路径的全部生产者**。 */
export function invalidate(path) {
    const suffix = '\u0000' + path;
    for (const k of [...cache.keys()])
        if (k.endsWith(suffix))
            cache.delete(k);
}
/** 清空全部缓存（自测/校准用） */
export function clearFileStatCache() { cache.clear(); }
/**
 * 非空行数（缓存）。文件不存在或不可读 ⇒ `-1`（调用方按既有 `existsSync` 守卫处理）。
 * ⚠ 语义 = 「非空行数」，与原先 `readFileSync(...).split('\n').filter(trim).length` **逐字等价**。
 */
export function nonEmptyLineCount(path) {
    const v = cached('lines', path, (st) => {
        const text = readFileSync(path, 'utf8');
        fileReadStats.bytesRead += st.size;
        let n = 0;
        for (const l of text.split('\n'))
            if (l.trim())
                n++;
        return n;
    });
    return v === null ? -1 : v;
}
/**
 * **真字节级尾读**：返回文件末尾 ≤`n` 个非空行（缓存）。
 *
 * ⚠ 语义边界（如实记）：只读末尾 ≤`maxBytes` 窗口。窗口**以前**的历史行不在结果里 ——
 *   对"最近 N 行"型展示是**等价**的；对"必须看到全史"的调用点（如蒸馏水位回放）**不得使用本函数**。
 * 缺省窗口 256KB：以台账每行 ~200–400B 计 ≈ 700+ 行，远大于展示所需的 10 行。
 */
export function readTailLines(path, n, maxBytes = 256 * 1024) {
    const v = cached('tail:' + n + ':' + maxBytes, path, (st) => {
        if (st.size === 0)
            return [];
        const want = Math.max(1, Math.min(maxBytes, st.size));
        const pos = Math.max(0, st.size - want);
        const fd = openSync(path, 'r');
        try {
            const buf = Buffer.allocUnsafe(want);
            const got = readSync(fd, buf, 0, want, pos);
            fileReadStats.bytesRead += got;
            const lines = buf.subarray(0, got).toString('utf8').split(/\r?\n/).filter((l) => l.trim());
            // 从非零偏移起读：首行很可能是被截断的半行 ⇒ 丢弃（只有正好从文件头读起才保留）
            if (pos > 0 && lines.length)
                lines.shift();
            return lines.slice(-n);
        }
        finally {
            closeSync(fd);
        }
    });
    return v === null ? [] : v;
}
/** 文件字节数（缓存 stat）；不存在 ⇒ `-1`。给"只要一个尺寸"的展示型调用点用。 */
export function statSize(path) {
    const v = cached('size', path, (st) => st.size);
    return v === null ? -1 : v;
}
//# sourceMappingURL=file-stat-cache.js.map