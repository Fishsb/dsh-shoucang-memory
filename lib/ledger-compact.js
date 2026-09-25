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
import { appendFileSync, copyFileSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
// 有界尾读（2026-09-23）：热路径不得全量读台账（实测 48k 行 / 18MB）——
//   复用既有真字节级尾读 + `(mtimeMs,size)` 缓存（单一实现，不重造）。
import { readTailLines } from './file-stat-cache.js';
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
 * **台账追加一行**（fail-safe · 2026-09-23）—— 台账**写侧**的单一出口。
 *
 * 为什么要有它：写入点此前各自内联 `appendFileSync(join(knowledgeRoot(),'audit','ledger.jsonl'), …)`，
 *   而**读者**要同时满足「跨档」（`readLatestLedgerRow` / `readLedgerVolumes`）与「有界」。
 *   把写口也归到本域 ⇒ 台账的**读写两侧同处一模块**，"路径 + 编码 + 失败姿态"只有一份口径。
 *
 * 语义：**绝不抛**（审计是 best-effort —— 各既有写入点无一例外都包了 `try/catch` 并静默；
 *   把该姿态收进本件，调用方就不必各自重复 try/catch）。
 * @returns 写入的行数（`1` = 已写；`0` = 失败被吞，调用方按"未落账"处理）
 */
export function appendLedgerLine(file, line) {
    try {
        appendFileSync(file, line, 'utf8');
        return 1;
    }
    catch {
        return 0;
    }
}
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
 * **跨档有界取"最后一条匹配行"**（2026-09-23 · 消费链拟态落地方案 §3.1）。
 *
 * 为什么需要它（两条硬约束同时成立，别的写法都满足不了其一）：
 *   ① **必须跨档**：台账按体积轮转（`.1`/`.2`）⇒ 只读主档会**静默丢历史且不报错**。
 *      本仓有专门门禁 `check-ledger-read.mjs`（G13「轮转失明」防第 N 次漏网），其 v6 判据为
 *      「含 `ledger.jsonl` 字面量 ∧ 含按行读取器 ∧ **不含 `readLedgerVolumes`** ⇒ 红」。
 *      本函数**在本件内**经 `LEDGER_VOLUMES` 枚举全部卷位 ⇒ 满足该判据的**本意**（真跨档）；
 *      而调用方（如 `mcl.ts`）只需调本函数、**不自持台账路径与读取器** ⇒ 也不再撞该判据的字面。
 *   ② **必须有界**：调用点在**每轮热路径**（`decideTurn` 每轮一次），而全量跨档读实测
 *      **48k 行 / 18MB** ⇒ 每轮全读会占满唯一事件循环。故走 `file-stat-cache#readTailLines`
 *      （**真字节级尾读** + `(mtimeMs,size)` 缓存 ⇒ 文件没变则一次 `statSync` 即返回）。
 *
 * 顺序语义：**新 → 旧**逐卷找，**命中即返回**（首条匹配就是全局最新的一条，无需读完所有卷）。
 *
 * @param file      主档路径（`.1`/`.2` 由本函数派生）
 * @param match     行判定（**收已 parse 的对象**；抛异常的行视为不匹配）
 * @param perVolume 每卷尾读窗口行数（缺省 1000；`readTailLines` 的字节窗 256KB ≈ 700–1300 行，
 *                  取 1000 与之匹配 —— **不留"读了却丢弃"的空转**。见下方 ACT-363 判因）
 * @returns 解析后的对象；无匹配/不可读 ⇒ `undefined`（**零抛出**，调用方按"没有"处理）
 *
 * ⚠ **缺省值判因（2026-09-23 · ACT-363 · 复验抓出的第三处缺陷）**：原缺省 `200`。
 *   `readTailLines` 的字节窗是 `maxBytes = 256KB`（≈ 750 行）⇒ 读进来后 `slice(-200)`
 *   **丢掉已读的 ~73%**（实测：末 730 行 = 260KB 已进内存，只保留末 200 行 = 76KB）。
 *   而这不只是浪费 —— 它**直接导致读不到**：回流行 `yield.verdict` 写在**深睡那一刻**，
 *   之后每步都在追加 `mcl-step`（实测 4.8 行/分）⇒ 距末尾 271 行时，
 *   `perVolume=200` **MISS**、`300` **HIT**（同一行、同一函数，实测对照）。
 *   ⇒ 一个**每分钟都在发生的**时间差就能让回流静默失效（约 42 分钟后必然读不到）。
 *   取 1000 行：与字节窗同量级 ⇒ **零新增读盘**，只把已经读到的东西真正用起来。
 */
export function readLatestLedgerRow(file, match, perVolume = 1000) {
    const scan = (p) => {
        let lines = [];
        try {
            lines = readTailLines(p, Math.max(1, perVolume));
        }
        catch {
            return undefined;
        }
        for (let i = lines.length - 1; i >= 0; i--) {
            try {
                const o = JSON.parse(lines[i]);
                if (match(o))
                    return o;
            }
            catch { /* 坏行跳过（与各读侧同纪律） */ }
        }
        return undefined;
    };
    // 新 → 旧：主档优先，其次 .1 … .{LEDGER_VOLUMES}
    const main = scan(file);
    if (main !== undefined)
        return main;
    for (let i = 1; i <= LEDGER_VOLUMES; i++) {
        const hit = scan(`${file}.${i}`);
        if (hit !== undefined)
            return hit;
    }
    return undefined;
}
const VOL_CACHE = new Map();
const VOL_CACHE_MAX = 4;
/** 卷位路径，**与读侧循环同序**（最旧档 → … → 主档）。读侧与轮转侧共用同一顺序语义。 */
const volumePathsOf = (file, keep) => {
    const out = [];
    for (let i = keep; i >= 1; i--)
        out.push(`${file}.${i}`);
    out.push(file);
    return out;
};
/** 一组路径的 (mtimeMs,size)；该档不存在/不可读 ⇒ `null`（与"该档贡献空"同义）。 */
const volStatKeysOf = (paths) => paths.map((p) => {
    try {
        const st = statSync(p);
        return { path: p, mtimeMs: st.mtimeMs, size: st.size };
    }
    catch {
        return null;
    }
});
/** 元组等价（`null` 表示"当时不存在"；`null` vs 对象 恒不等 ⇒ 触发重读 = SYNC-MISS）。 */
const sameVolStat = (a, b) => a === null || b === null ? a === b : a.mtimeMs === b.mtimeMs && a.size === b.size;
/**
 * **台账整组卷位的「内容版本」键**（单一实现，供下游按同一判据做**自持缓存**）。
 *
 * 为什么必须由本件导出，而不是让下游各自算（**这是本仓反复栽过的坑**）：
 *   `audit-source` 的第 2 层缓存（缓存"已 parse 的 `audit.*` 行"）需要一个"底层数据变没变"的判据。
 *   若它自己写一份 `statSync(主档)` 就算数 —— 正是**只按主档做键**那个已证伪的错法
 *   （轮转 5 步里 3 步不碰主档、且存在主档缺失瞬态，见上方整段判因）。
 *   ⇒ 键的**判据只有一处实现**：与本函数读侧用的 `volumePathsOf` + `volStatKeysOf` **同源**，
 *     下游拿到的就是"我读的到底是哪一组、各自什么状态"的**忠实指纹**。
 *
 * 形态：`<path>\0<mtimeMs>\0<size>` 逐卷用 `\u0001` 连接；该卷不存在/不可读 ⇒ `null` 段。
 *   ⚠ 用 `\0`/`\u0001` 作分隔符（而非 `:`/`|`）—— 路径本身可能含 `:`（Windows 盘符）与 `|`。
 * 代价：4×`statSync` ≈ **0.033 ms**（实测），相对其保护的一遍全量 parse（**327 ms**）可忽略。
 */
export function ledgerVolumeKey(file, keep = LEDGER_VOLUMES) {
    const paths = volumePathsOf(file, keep);
    const keys = volStatKeysOf(paths);
    return paths
        .map((p, i) => {
        const k = keys[i];
        return k === null ? `${p}\u0000absent` : `${k.path}\u0000${k.mtimeMs}\u0000${k.size}`;
    })
        .join('\u0001');
}
/**
 * **跨档按时间序**读出台账全部非空行（最旧档 → … → 主档）。
 *
 * 顺序是判据的一部分：`audit-source` 的**水位回放**依赖"历史在前"，
 * `deepsleep-machine` 取"最后一条"= 最新 —— 顺序错了这两处都会静默取错值。
 * 不可读的档位跳过（零抛出）；调用方负责坏行处理（与既有读侧同纪律）。
 *
 * 2026-09-26：加「各卷 (mtimeMs,size) 元组」缓存（见上方整段判因）——**返回语义零变化**
 *   （同序、同类型 `string[]`、同"不可读档跳过"姿态、零新导出）。
 */
export function readLedgerVolumes(file, keep = LEDGER_VOLUMES) {
    const paths = volumePathsOf(file, keep);
    const now = volStatKeysOf(paths);
    const hit = VOL_CACHE.get(file);
    if (hit && hit.keep === keep && hit.keys.length === now.length && hit.keys.every((k, i) => sameVolStat(k, now[i]))) {
        VOL_CACHE.delete(file);
        VOL_CACHE.set(file, hit); // LRU 提升（Map 保序）
        return hit.value.slice();
    }
    const out = [];
    /* ⚠ 「读失败」不得被缓存（2026-09-26 · 独立审查 verify 席 find A，先红后修）：
     *   判因（实测）：原实现无条件 `VOL_CACHE.set(...)` —— 若某卷**存在但读失败**
     *   （被独占锁 / EACCES / EISDIR / 瞬态 IO 错），`catch` 静默吞成"该档贡献空"，
     *   而元组 `now` 是**读之前**取的 ⇒ 该卷的 `(mtimeMs,size)` **没有任何变化** ⇒
     *   下一次调用**元组全等 ⇒ 直接命中缓存**，把"读失败"当成有效结果**永久**返回。
     *   实测（严格复现，PowerShell `FileShare.None` 独占锁 .1 档）：
     *     改前：锁期间读 1 行 → **释放锁后再读仍 1 行**（残缺结果被粘住，不再重试）
     *   危害：水位回放/深睡统计会**静默少算**，且**无任何痕迹**（本仓最忌的失败形态）。
     *   修法（一行级、零返回语义变化）：只要本轮出现**「存在但读失败」**，就**不写缓存**
     *   ⇒ 下一次调用退回"重新读盘"路径 ⇒ 与该缓存引入前的**逐调用自愈**姿态完全一致。
     *   注：`existsSync` 为假（档位本就不存在）**不算**读失败 —— 那是正常形态，可缓存。 */
    let unreadable = false;
    for (const p of paths) {
        try {
            if (!existsSync(p))
                continue;
            for (const l of readFileSync(p, 'utf8').split(/\r?\n/))
                if (l.trim())
                    out.push(l);
        }
        catch {
            unreadable = true; /* 存在但读失败：本轮结果不得入缓存 */
        }
    }
    if (!unreadable)
        VOL_CACHE.set(file, { keep, keys: now, value: out });
    while (VOL_CACHE.size > VOL_CACHE_MAX) {
        const k = VOL_CACHE.keys().next().value;
        if (k === undefined)
            break;
        VOL_CACHE.delete(k);
    }
    return out.slice(); // 与命中路径同姿态：**绝不把缓存数组本体交出去**
}
//# sourceMappingURL=ledger-compact.js.map