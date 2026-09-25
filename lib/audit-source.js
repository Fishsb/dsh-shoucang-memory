/**
 * audit-source.ts — **蒸馏审计的双源读**（DS4 第六刀 · 2026-09-13）
 *
 * ## 为什么必须双源（**实测证据，不是谨慎**）
 * 蒸馏审计的写入已并入**统一台账**（`ledger.jsonl`，`type=audit.*`），而**历史批次**仍在
 * 原 `distill-audit.jsonl`。实测（真库）：
 *
 * ```
 * legacy 回放 → 2026-09-13T10:17:48.975Z（命中 16 轮深睡）
 * 仅台账      → (无)（命中 0 轮）        ← **单读台账会丢光水位历史**
 * 双源合并    → 2026-09-13T10:17:48.975Z ✅ 与 legacy 相同
 * ```
 *
 * 单读台账的后果是**具体的**：`deepsleep-machine` 的回放拿不到值时会把水位置为 `Date.now()`
 * ⇒ **窗口滑到当前 ⇒ 丢掉一轮本可回想的痕迹**（与仓内 D2「丢料」同一类事故）。
 *
 * ## 形态
 * - 读侧**只认 legacy 路径**（各调用方已有的 `auditFile`），台账路径由它**同目录推导** ⇒ 契约零改动；
 * - 台账侧**按 `type` 过滤**（只要 `audit.*`，不把别的域的事件混进蒸馏审计口径）；
 * - 返回顺序 = legacy 在前、台账在后（时间序，历史在前）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readLedgerVolumes, ledgerVolumeKey } from './ledger-compact.js';
/** 双源读蒸馏审计行（坏行跳过、不可读=空，**零抛出**）。 */
export function readDistillAudit(legacyFile) {
    const out = [];
    for (const { o } of readDistillAuditRows(legacyFile))
        out.push(o);
    return out;
}
/**
 * **双源合并文本**（JSONL）——给"原本就是 `readFileSync(路径,'utf8').split('\n')`"的调用点用：
 * 只换读取表达式即可，**既有的过滤/解析/括号结构一律不动**（改面越小越安全）。
 * 不存在的历史文件 ⇒ 贡献空串（调用方原有的 `existsSync` 守卫可保留，也可直接删）。
 */
export function readDistillAuditText(legacyFile) {
    const lines = [];
    for (const { line } of readDistillAuditRows(legacyFile))
        lines.push(line);
    return lines.join('\n');
}
/** 双源逐行（内部单一实现：legacy 在前、台账 `audit.*` 在后）。 */
function readDistillAuditRows(legacyFile) {
    const out = [];
    const push = (file, keep) => {
        try {
            if (!existsSync(file))
                return;
            for (const l of readFileSync(file, 'utf8').split('\n')) {
                if (!l.trim())
                    continue;
                try {
                    const o = JSON.parse(l);
                    if (keep(o))
                        out.push({ line: l, o });
                }
                catch { /* 坏行跳过：解析失败不得让整段审计不可用 */ }
            }
        }
        catch { /* 不可读=空 */ }
    };
    push(legacyFile, () => true); // 历史批次
    /* 台账侧**跨档读**（D-M5 · 2026-09-17）：台账按体积轮转后，最新数据在主档、历史在 `.1/.2/.3`
     *   ⇒ 必须**按时间序合并各档**。**这正是不改不行的原因**：单读主档时，轮转一发生，
     *   水位回放就会拿不到旧值 ⇒ 水位置 `Date.now()` ⇒ **命中 0 轮**（本文件头注的实测事故即此类）。
     *
     * 2026-09-26（性能改造第 2 层）：台账侧改用**带缓存的**筛选读（见 `ledgerAuditRowsOf`）——
     *   本函数其余部分（legacy 侧的读法/姿态、返回形状、顺序）**一字未动**。 */
    for (const r of ledgerAuditRowsOf(join(dirname(legacyFile), 'ledger.jsonl')))
        out.push(r);
    return out;
}
const AUDIT_ROWS_CACHE = new Map();
const AUDIT_ROWS_CACHE_MAX = 4;
const auditCacheStats = { hits: 0, misses: 0 };
/** 缓存命中/未命中计数（**只读**；供机检断言缓存真生效，勿用于业务逻辑）。 */
export function readDistillAuditCacheStats() {
    return { hits: auditCacheStats.hits, misses: auditCacheStats.misses, keys: [...AUDIT_ROWS_CACHE.keys()] };
}
/** 台账侧行筛选（**带缓存**）：返回按时间序（最旧档 → 主档）的 `audit.*` 行。 */
function ledgerAuditRowsOf(ledgerFile) {
    const key = ledgerVolumeKey(ledgerFile);
    const hit = AUDIT_ROWS_CACHE.get(ledgerFile);
    if (hit && hit.key === key) {
        auditCacheStats.hits++;
        AUDIT_ROWS_CACHE.delete(ledgerFile);
        AUDIT_ROWS_CACHE.set(ledgerFile, hit); // LRU 提升
        // 深到对象级的一层拷贝：见上方「返回副本」判因
        return hit.rows.map((r) => ({ line: r.line, o: { ...r.o } }));
    }
    auditCacheStats.misses++;
    const rows = [];
    for (const l of readLedgerVolumes(ledgerFile)) {
        if (!l.trim())
            continue;
        /* **廉价子串预筛**（实测冷路径 **155.6 → 29.0 ms**，5.4×）：台账里只有 **6.5%** 的行是 `audit.*`
         *   （4,535 / 69,954），却要对**每一行**做 `JSON.parse`。先用 `includes('"audit.')` 把 93.5% 的行
         *   挡在 parse 之前。
         *  **等价性已实证**（不是推断）：以同一批真数据跑两条路径，命中集合
         *   `A=4535 / B=4535 / 逐个相同`，且"`audit.*` 行中序列化后不含 `"audit.` 的"= **0**。
         *   该零来自**写入侧的强保证**：所有台账写入都经 `eventEnvelope`/`JSON.stringify`
         *   （`JSON.stringify` 无空格 ⇒ 恒产出 `"type":"audit.xxx"`）；实测全库"含空格形态的 type" = **0**
         *   ⇒ 不存在人工书写的 `"type": "audit.x"` 这种会漏筛的形态。
         *  ⚠ 若将来出现**非 `JSON.stringify` 的写入路径**（手写 JSON 且带空格），本预筛会**漏行**。
         *     守：`scripts/` 侧台账写入者一律经 `envelope()`/`appendLedgerLine`（`check-ledger-read` 面）。
         *     真正会漏的形态只有 `"type" : "audit.x"` 这类，一旦引入会立刻被上面的口径抓出。 */
        if (!l.includes('"audit.'))
            continue;
        try {
            const o = JSON.parse(l);
            if (String(o.type || '').startsWith('audit.'))
                rows.push({ line: l, o });
        }
        catch { /* 坏行跳过：解析失败不得让整段审计不可用 */ }
    }
    AUDIT_ROWS_CACHE.set(ledgerFile, { key, rows });
    while (AUDIT_ROWS_CACHE.size > AUDIT_ROWS_CACHE_MAX) {
        const k = AUDIT_ROWS_CACHE.keys().next().value;
        if (k === undefined)
            break;
        AUDIT_ROWS_CACHE.delete(k);
    }
    return rows.map((r) => ({ line: r.line, o: { ...r.o } }));
}
//# sourceMappingURL=audit-source.js.map