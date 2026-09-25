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
import { appendFileSync, copyFileSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
// 有界尾读（2026-09-23）：热路径不得全量读台账（实测 48k 行 / 18MB）——
//   复用既有真字节级尾读 + `(mtimeMs,size)` 缓存（单一实现，不重造）。
import { readTailLines } from './file-stat-cache.js'

/** 取一行的 `type`（解析失败或非 JSON ⇒ 空串：**坏行视为不可裁剪**，绝不因裁剪丢坏行证据）。 */
function typeOfLine(line: string): string {
  try {
    const o = JSON.parse(line) as { type?: unknown }
    return typeof o?.type === 'string' ? o.type : ''
  } catch { return '' }
}

/**
 * 裁剪决策（纯函数）。
 * @returns 应保留的行数组；**`null` 表示未超阈值、无需裁剪**（调用方不该重写文件）。
 */
export function planCompaction(lines: string[], type: string, keepLast: number, slack: number): string[] | null {
  const hit: number[] = []
  lines.forEach((l, i) => { if (typeOfLine(l) === type) hit.push(i) })
  if (keepLast < 0) return null
  if (hit.length <= keepLast + Math.max(0, slack)) return null
  const drop = new Set(hit.slice(0, hit.length - keepLast))
  return lines.filter((_, i) => !drop.has(i))
}

/**
 * 对文件执行按 type 裁剪（best-effort，**绝不抛**）。
 * @returns `'compacted'`（已裁剪并原子替换）| `'noop'`（未超阈值）| `'missing'`（文件不存在）
 */
export function compactFile(file: string, type: string, keepLast: number, slack: number): 'compacted' | 'noop' | 'missing' {
  try {
    if (!existsSync(file)) return 'missing'
    const raw = readFileSync(file, 'utf8')
    const hadTrailingNl = raw.endsWith('\n')
    const lines = raw.split(/\r?\n/).filter((l) => l.trim())
    const kept = planCompaction(lines, type, keepLast, slack)
    if (kept === null) return 'noop'
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    copyFileSync(file, `${file}.bak-compact-${ts}`) // 先备份（可回滚）
    const tmp = `${file}.tmp-${ts}`
    writeFileSync(tmp, kept.join('\n') + (hadTrailingNl && kept.length ? '\n' : ''), 'utf8')
    renameSync(tmp, file) // 同目录 rename = 原子替换
    return 'compacted'
  } catch { return 'noop' } // 裁剪失败绝不影响主流程（与各写入点同纪律）
}

/** 台账**档位数**（`<file>` + `.1` … `.{LEDGER_VOLUMES}`）。读取侧与轮转侧共用同一常量，防两侧漂移。 */
export const LEDGER_VOLUMES = 3

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
export function appendLedgerLine(file: string, line: string): number {
  try { appendFileSync(file, line, 'utf8'); return 1 } catch { return 0 }
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
export function rotateBySize(file: string, capBytes: number, keep = LEDGER_VOLUMES): 'rotated' | 'noop' | 'missing' {
  try {
    if (!existsSync(file)) return 'missing'
    if (statSync(file).size <= capBytes) return 'noop'
    const oldest = `${file}.${keep}`
    if (existsSync(oldest)) unlinkSync(oldest) // 丢最旧的一份
    for (let i = keep - 1; i >= 1; i--) {
      const from = `${file}.${i}`
      if (existsSync(from)) renameSync(from, `${file}.${i + 1}`) // 逐档顺移（从旧到新，防覆盖）
    }
    renameSync(file, `${file}.1`) // 主档让位给新一轮
    /* 立刻重建**空主档**。判因（本轮测试抓到）：不重建的话，从"轮转完成"到"下次 append"之间存在一个
     *   **主档不存在**的瞬态；而多处读取以 `existsSync(主档)` 作守卫（如 `panel-observe#mclAuditRecent`、
     *   `readTailLines` 的调用点）⇒ 该瞬态会被读成"无台账"，表现是**偶发的数据看起来消失**。 */
    writeFileSync(file, '', 'utf8')
    return 'rotated'
  } catch { return 'noop' }
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
export function readLatestLedgerRow<T = Record<string, unknown>>(
  file: string,
  match: (o: Record<string, unknown>) => boolean,
  perVolume = 1000,
): T | undefined {
  const scan = (p: string): T | undefined => {
    let lines: string[] = []
    try { lines = readTailLines(p, Math.max(1, perVolume)) } catch { return undefined }
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const o = JSON.parse(lines[i]) as Record<string, unknown>
        if (match(o)) return o as T
      } catch { /* 坏行跳过（与各读侧同纪律） */ }
    }
    return undefined
  }
  // 新 → 旧：主档优先，其次 .1 … .{LEDGER_VOLUMES}
  const main = scan(file)
  if (main !== undefined) return main
  for (let i = 1; i <= LEDGER_VOLUMES; i++) {
    const hit = scan(`${file}.${i}`)
    if (hit !== undefined) return hit
  }
  return undefined
}

/* ── 跨档读的「各卷 (mtimeMs,size) 元组」缓存（2026-09-26 · 性能改造第 1 层）─────────────
 * 判因（实测，非推演）：`/memory/overview` 一次请求经 `audit-source` 调本函数 **3 遍**
 *   （`panel-memory.ts:73 / 297 / 438`），真库 4 卷 **26.7 MB / 68,523 行**，实测：
 *     · 单遍读+split = **62–109 ms**；`readDistillAuditRows` 整遍（读+parse+过滤）= **191–225 ms**
 *     · 同进程连续 3 遍 = **642 ms**（请求内小计 804 ms）—— 纯同步，占满唯一事件循环
 *   ⇒ 文件没变时结果**逐字相同**，第 2/3 遍是纯白读。
 *
 * **为什么不复用 `file-stat-cache#cached`**（那件看似现成）：
 *   它的键是**单路径**（`keyOf = kind + '\0' + path`，file-stat-cache.ts:36），失效判据是
 *   **该路径**的 (mtimeMs,size)。而本函数读的是**一组**文件（`<file>.{keep}..<file>`）⇒
 *   单路径键在 `rotateBySize`（本件 :100-117）下**会静默漏**：
 *     · 那次轮转 5 步里，`unlink(.keep)` / `rename(.{i}→.{i+1})` 共 **3 步完全不碰主档**；
 *     · 且 `rename(主档→.1)` 与 `writeFileSync(主档,'')` 之间有**主档不存在**的瞬态
 *       （:111-114 已自行记载该瞬态会造成"数据看起来消失"）。
 *   ⇒ 只按主档 stat 做键，会把「少读一卷」的结果当**有效条目**缓存下来，**且不报错**。
 *   故本缓存自持，键自足到**这一组文件各自的 (mtimeMs,size)**。
 *
 * **为什么不依赖调用方失效**：`file-stat-cache#invalidate` 是**死代码**
 *   （实测：全仓 `src/` 无任何文件 import 它；`clearFileStatCache` 同样零调用），
 *   而 `ledger.jsonl` 有 **6 处同进程写者**（`distill-infra` 的 `ledger()`+`rotateBySize` /
 *   `deepsleep-run` 的 `appendLedgerLine` / `mcl` / `vec` / `panel-eval` / `pointer-deficits`）
 *   ⇒ 任何"写完记得作废"的约定都会重蹈「声明了却从没实现」的覆辙。
 *   本缓存**只靠元组自然失效**，不需要任何调用方配合。
 *
 * **语义等价（三条，缺一即错）**：
 *   ① **保序**：返回顺序仍是「最旧档 → … → 主档」（本函数原有循环语义，见下方 :176-181 头注）。
 *      命中路径直接复用缓存数组，**不做任何重排** ⇒ 顺序与未缓存时逐字节相同。
 *   ② **补读「缓存时不存在、现存在」的卷位**（SYNC-MISS）：命中后**逐卷复读 stat** 并与缓存时的
 *      元组逐个比对（`null` = 当时不存在）。这条**必需**：台账是「高频 append、每 ~17h 才轮转一次」，
 *      若只比较"已缓存卷的 stat 是否变化"，则在主档缺失瞬态里缓存过**一整轮空数组**之后，
 *      空主档重建**不会被察觉** ⇒ 面板在该窗口内恒显示"无台账"。代价 4×statSync = **0.033 ms**。
 *   ③ **返回副本**：命中时 `slice()`（实测 **0.171 ms**，相对单遍读 62–109 ms 占 **0.16–0.28%**）。
 *      刻意为之：调用方若就地 `sort/reverse/push`，会把**缓存本身**写坏，而这是**跨请求粘滞**的
 *      静默错误 —— 本仓有同形前例：`file-stat-cache` 首版只用路径作键，导致 `statSize()` 存的
 *      字节数被 `nonEmptyLineCount()` 当行数返回（该件 :33-35 自记）。实测当下 8 个调用点
 *      **均未变异**返回数组，但"今天没人变异"不是"明天不会"。
 *      ⚠ **能力边界（独立审查 verify 席 2026-09-26 指出，据实修正）**：本件元素类型是
 *      `string`（**不可变原始值**）⇒ `slice()` 已**足够**，不存在"嵌套字段被改写"的面。
 *      先前此处写的「整类消除该失效模式」是**过度声明**，已改为：本件消除的是**数组本身**被
 *      就地改动这一种；对**元素为对象**的缓存（如 `audit-source` 的 `{line,o}`）**不适用** ——
 *      那里必须另做对象级拷贝，见 `audit-source.ts` 的对应判因。
 *
 * **容量与上界**：`MAX_ENTRIES = 4`（生产真路径只有 1 个，其余留给脚本/自测的临时目录）。
 *   ⚠ **上界论证的对象（独立审查 verify 席 2026-09-26 纠正，据实修正）**：
 *     先前注释以「台账磁盘硬上限 32 MB（`LEDGER_CAP_BYTES` 8 MB/卷 × 4 卷，见 `distill-infra.ts:83`）」
 *     论证"缓存有界"—— **界错了对象**：那是**磁盘**上界，而缓存放的是**堆**里的 JS 字符串。
 *     verify 席实测：**单条目 ≈ 52.0 MiB**（UTF-16 双字节 + 对象/数组开销），
 *     `cap=4` 满载 ⇒ **堆上界 ≈ 208 MiB**（相对磁盘界的放大 ≈ **6.5×**）。
 *     修正后的**正确表述**：缓存**有界**（由 `MAX_ENTRIES` 与磁盘上界**共同**约束），
 *     但**堆占用须按 ~6.5× 放大估算**；生产真路径只有 1 个键 ⇒ 现网实际 ≈ **52 MiB**。
 *     若未来出现多根多键场景，须以 208 MiB 为估算上界，不得再引用 32 MB。
 */
type VolStatKey = { path: string; mtimeMs: number; size: number }
interface VolCacheEntry { keep: number; keys: Array<VolStatKey | null>; value: string[] }
const VOL_CACHE = new Map<string, VolCacheEntry>()
const VOL_CACHE_MAX = 4
/** 卷位路径，**与读侧循环同序**（最旧档 → … → 主档）。读侧与轮转侧共用同一顺序语义。 */
const volumePathsOf = (file: string, keep: number): string[] => {
  const out: string[] = []
  for (let i = keep; i >= 1; i--) out.push(`${file}.${i}`)
  out.push(file)
  return out
}
/** 一组路径的 (mtimeMs,size)；该档不存在/不可读 ⇒ `null`（与"该档贡献空"同义）。 */
const volStatKeysOf = (paths: string[]): Array<VolStatKey | null> => paths.map((p) => {
  try { const st = statSync(p); return { path: p, mtimeMs: st.mtimeMs, size: st.size } } catch { return null }
})
/** 元组等价（`null` 表示"当时不存在"；`null` vs 对象 恒不等 ⇒ 触发重读 = SYNC-MISS）。 */
const sameVolStat = (a: VolStatKey | null, b: VolStatKey | null): boolean =>
  a === null || b === null ? a === b : a.mtimeMs === b.mtimeMs && a.size === b.size

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
export function ledgerVolumeKey(file: string, keep = LEDGER_VOLUMES): string {
  const paths = volumePathsOf(file, keep)
  const keys = volStatKeysOf(paths)
  return paths
    .map((p, i) => {
      const k = keys[i]
      return k === null ? `${p}\u0000absent` : `${k.path}\u0000${k.mtimeMs}\u0000${k.size}`
    })
    .join('\u0001')
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
export function readLedgerVolumes(file: string, keep = LEDGER_VOLUMES): string[] {
  const paths = volumePathsOf(file, keep)
  const now = volStatKeysOf(paths)
  const hit = VOL_CACHE.get(file)
  if (hit && hit.keep === keep && hit.keys.length === now.length && hit.keys.every((k, i) => sameVolStat(k, now[i]))) {
    VOL_CACHE.delete(file); VOL_CACHE.set(file, hit) // LRU 提升（Map 保序）
    return hit.value.slice()
  }
  const out: string[] = []
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
  let unreadable = false
  for (const p of paths) {
    try {
      if (!existsSync(p)) continue
      for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) if (l.trim()) out.push(l)
    } catch { unreadable = true /* 存在但读失败：本轮结果不得入缓存 */ }
  }
  if (!unreadable) VOL_CACHE.set(file, { keep, keys: now, value: out })
  while (VOL_CACHE.size > VOL_CACHE_MAX) {
    const k = VOL_CACHE.keys().next().value as string | undefined
    if (k === undefined) break
    VOL_CACHE.delete(k)
  }
  return out.slice() // 与命中路径同姿态：**绝不把缓存数组本体交出去**
}
