/**
 * ledger-compact.ts — **统一台账的按 type 裁剪**（DS4 前置机制 · 2026-09-13）
 *
 * 为什么需要它：DS4 要把多条事件流并进 `ledger.jsonl`（单一事件源）。但其中 `episodes` 带
 *   **保留期**（`EPISODE_CAP`，超限淘汰最旧）——它原本的做法是「读**自己那个文件**全部行 → 重写保留末 N 行」。
 *   一旦并进**共享**台账，那段裁剪就会**截断整个 ledger**（把别的 type 的事件一起删掉）。
 *   ⇒ 合并的前置不是搬代码，而是**先有"只裁某一个 type"的能力**。本件即是。
 *
 * 设计要点：
 *   · **纯决策函数** `planCompaction`：给全部行 + 目标 type + 上限 + 余量，返回应保留的行（或 null＝不动）。
 *     纯函数 ⇒ 逻辑可单测，不必真写文件。
 *   · **只删同 type 的最旧行**：其他 type 的行**原样保留、顺序不变**（这是本机制存在的全部理由）。
 *   · **余量（slack）**：超过 `keepLast + slack` 才动手 —— 裁剪要重写整个文件，不能每追加一行就重写一次。
 *   · **原子替换**：备份 `.bak-compact-<ts>` → 同目录 tmp → `renameSync`（与仓内 `test-atomic-write` 同纪律）。
 *
 * ⚠ 残余风险（诚实记录）：重写窗口内其他写入者的 **append 可能丢失**（先读→后写之间新增的行不在保留集里）。
 *   缓解：只在超阈值时触发（低频）· 台账本就是 best-effort 审计（各写入点都 catch 静默）。
 *   这与被替换掉的旧 `episodes` 裁剪**同一量级**的风险，不构成回归。
 */
import { copyFileSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
/** 取一行的 `type`（解析失败或非 JSON ⇒ 空串：**坏行视为不可裁剪**，绝不因裁剪丢坏行证据）。 */
function typeOfLine(line) {
    try {
        const o = JSON.parse(line);
        return typeof o?.type === 'string' ? o.type : '';
    }
    catch {
        return '';
    }
}
/**
 * 裁剪决策（纯函数）。
 * @returns 应保留的行数组；**`null` 表示未超阈值、无需裁剪**（调用方不该重写文件）。
 */
export function planCompaction(lines, type, keepLast, slack) {
    const hit = [];
    lines.forEach((l, i) => { if (typeOfLine(l) === type)
        hit.push(i); });
    if (keepLast < 0)
        return null;
    if (hit.length <= keepLast + Math.max(0, slack))
        return null;
    const drop = new Set(hit.slice(0, hit.length - keepLast));
    return lines.filter((_, i) => !drop.has(i));
}
/**
 * 对文件执行按 type 裁剪（best-effort，**绝不抛**）。
 * @returns `'compacted'`（已裁剪并原子替换）| `'noop'`（未超阈值）| `'missing'`（文件不存在）
 */
export function compactFile(file, type, keepLast, slack) {
    try {
        if (!existsSync(file))
            return 'missing';
        const raw = readFileSync(file, 'utf8');
        const hadTrailingNl = raw.endsWith('\n');
        const lines = raw.split(/\r?\n/).filter((l) => l.trim());
        const kept = planCompaction(lines, type, keepLast, slack);
        if (kept === null)
            return 'noop';
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        copyFileSync(file, `${file}.bak-compact-${ts}`); // 先备份（可回滚）
        const tmp = `${file}.tmp-${ts}`;
        writeFileSync(tmp, kept.join('\n') + (hadTrailingNl && kept.length ? '\n' : ''), 'utf8');
        renameSync(tmp, file); // 同目录 rename = 原子替换
        return 'compacted';
    }
    catch {
        return 'noop';
    } // 裁剪失败绝不影响主流程（与各写入点同纪律）
}
/** 台账**档位数**（`<file>` + `.1` … `.{LEDGER_VOLUMES}`）。读取侧与轮转侧共用同一常量，防两侧漂移。 */
export const LEDGER_VOLUMES = 3;
/**
 * 按**体积**轮转（2026-09-17 · 圆桌会审 D-M5）。与同文件 `compactFile` 的分工：
 *   · `compactFile` 按 **type** 裁 —— 保住共享台账里**其他 type** 的行（这是它存在的全部理由）；
 *   · 本件按**整体体积**轮转 —— 保住**时间窗口**（旧档整份留存、可回读）。
 * 二者互补：前者管"某类事件不留太久"，后者管"文件不无限长大"。
 *
 * 档位命名：`<file>`（最新）→ `<file>.1` → … → `<file>.{keep}`（最旧），只保留 `keep` 份。
 * 阈值依据（实测 ≈608 KB/天）：8 MB ≈ **13 天**；保留 **3 份** ⇒ 窗口 ≈ **39 天**。
 *   硬依据是 `panel-memory.ts#growthOf` **按月**统计 —— 必须保住**当前月 + 上月**。
 *
 * ⚠ **读取侧必须跨档**（`audit-source.ts` 与 `panel-observe.ts` 已**同批**改）——
 *   否则轮转一发生就是"数据看起来丢了"。本仓有前例事故：单读主档致蒸馏水位回放**命中 0 轮**
 *   （见 `audit-source.ts` 头注的实测表）。
 * 零抛出：任何异常返回 `'noop'`（轮转失败绝不影响主流程，与各写入点同纪律）。
 */
export function rotateBySize(file, capBytes, keep = LEDGER_VOLUMES) {
    try {
        if (!existsSync(file))
            return 'missing';
        if (statSync(file).size <= capBytes)
            return 'noop';
        const oldest = `${file}.${keep}`;
        if (existsSync(oldest))
            unlinkSync(oldest); // 丢最旧的一份
        for (let i = keep - 1; i >= 1; i--) {
            const from = `${file}.${i}`;
            if (existsSync(from))
                renameSync(from, `${file}.${i + 1}`); // 逐档顺移（从旧到新，防覆盖）
        }
        renameSync(file, `${file}.1`); // 主档让位给新一轮
        /* 立刻重建**空主档**。判因（本轮测试抓到）：不重建的话，从"轮转完成"到"下次 append"之间存在一个
         *   **主档不存在**的瞬态；而多处读取以 `existsSync(主档)` 作守卫（如 `panel-observe#mclAuditRecent`、
         *   `readTailLines` 的调用点）⇒ 该瞬态会被读成"无台账"，表现是**偶发的数据看起来消失**。 */
        writeFileSync(file, '', 'utf8');
        return 'rotated';
    }
    catch {
        return 'noop';
    }
}
/**
 * **跨档按时间序**读出台账全部非空行（最旧档 → … → 主档）。
 *
 * 顺序是判据的一部分：`audit-source` 的**水位回放**依赖"历史在前"，
 * `deepsleep-machine` 取"最后一条"= 最新 —— 顺序错了这两处都会静默取错值。
 * 不可读的档位跳过（零抛出）；调用方负责坏行处理（与既有读侧同纪律）。
 */
export function readLedgerVolumes(file, keep = LEDGER_VOLUMES) {
    const out = [];
    const pushFile = (p) => {
        try {
            if (!existsSync(p))
                return;
            for (const l of readFileSync(p, 'utf8').split(/\r?\n/))
                if (l.trim())
                    out.push(l);
        }
        catch { /* 不可读=贡献空 */ }
    };
    for (let i = keep; i >= 1; i--)
        pushFile(`${file}.${i}`);
    pushFile(file);
    return out;
}
//# sourceMappingURL=ledger-compact.js.map