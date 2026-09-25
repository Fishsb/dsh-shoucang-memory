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
/** 台账**档位数**（`<file>` + `.1` … `.{LEDGER_VOLUMES}`）。读取侧与轮转侧共用同一常量，防两侧漂移。 */
export declare const LEDGER_VOLUMES = 3;
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
export declare function appendLedgerLine(file: string, line: string): number;
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
export declare function rotateBySize(file: string, capBytes: number, keep?: number): 'rotated' | 'noop' | 'missing';
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
export declare function readLatestLedgerRow<T = Record<string, unknown>>(file: string, match: (o: Record<string, unknown>) => boolean, perVolume?: number): T | undefined;
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
export declare function ledgerVolumeKey(file: string, keep?: number): string;
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
export declare function readLedgerVolumes(file: string, keep?: number): string[];
