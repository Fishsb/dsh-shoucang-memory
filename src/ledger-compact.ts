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
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

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
