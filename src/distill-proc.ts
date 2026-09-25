// distill-proc.ts — 异步子进程调用（蒸馏与深睡共用的**纯工具层**）
//
// 为什么单独成件：distill-llm.ts 需要 runNode / textOf，而它们原本定义在 distill.ts ⇒
//   直接 import 会形成 distill → distill-llm → distill 的**环**（本项目零环是硬性质，不能破）。
//   本件只 import node 内置与 `proc-async`（后者零 src 依赖 ⇒ **不成环**）；是所有蒸馏子模块的进程调用汇聚点。
import { spawn } from 'node:child_process'
import { makeCappedSink } from './proc-async.js'

// ── 异步进程调用（禁 spawnSync 红线）──
export type RunResult = { status: number | null; out: string; err: string }

/** 子进程输出上限（**真正的封顶**）。
 *  2026-09-17 修（M4 · 圆桌会审 P0）：原实现在 `spawn` 的 options 里写 `maxBuffer: 8MB` 并 `as any`
 *  —— 但 `maxBuffer` 只属 `exec/execFile/SpawnSyncOptions`，**不属 async `SpawnOptions`** ⇒ 该行
 *  **零运行时效果**（实测 `spawn(..., { maxBuffer: 1000 })` 输出 200000 B 仍 exit 0），
 *  且 `as any` 让无效选项在类型检查期也不报。现改为：去掉无效选项与 `as any`，
 *  在 data 回调里**按字节计数**，超限即记标记并 kill。 */
const OUT_CAP = 8 * 1024 * 1024
export function runNode(nodeBin: string, scriptPath: string, args: string[], opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<RunResult> {
  return new Promise((resolve) => {
    let out = '', err = '', killed = false
    /* ⚠ 2026-09-25：兜底 `'node'` → `process.execPath`（调用方未给 nodeBin 时**也不该依赖 PATH**）。
     *   裸命令名在系统 node 缺失/损坏时抛 ENOENT ⇒ 整条蒸馏链静默不跑（实测本机正是该状态）。 */
    const child = spawn(nodeBin || process.execPath, [scriptPath, ...args], {
      cwd: opts?.cwd, windowsHide: true,
      // 2026-09-10 实锤修复：宿主 process.env 含 NODE_OPTIONS（inspector --inspect=9445），子进程继承后
      // 端口冲突 → Node 启动异常（status=null / 无 stdout），所有 runNode 子脚本静默失效。
      // 统一清空 NODE_OPTIONS（子脚本无需 inspector），彻底消除该干扰。
      env: { ...process.env, NODE_OPTIONS: '', ...(opts?.env || {}) },
    })
    /* 封顶走 `proc-async#makeCappedSink`（**单一实现**，三处共用）：M4 的判据"输出被真正截断"
     * 由 `scripts/test-proc-cap.mjs` 用**真 20MB 缓冲**直接验纯逻辑 —— 沙箱下靠真 spawn 验不了（见该件头注）。 */
    const sink = makeCappedSink(OUT_CAP, () => { try { child.kill() } catch { /* */ } })
    const to = setTimeout(() => { killed = true; try { child.kill() } catch { /* */ } }, opts?.timeout ?? 60000)
    child.stdout?.on('data', (d) => { out = sink.push(out, d) })
    child.stderr?.on('data', (d) => { err = sink.push(err, d) })
    child.on('error', (e) => { clearTimeout(to); resolve({ status: null, out: '', err: String(e).slice(0, 200) }) })
    child.on('close', (code) => {
      clearTimeout(to)
      const overflow = sink.overflowed()
      const note = (overflow ? `\n[output truncated at ${OUT_CAP} bytes]` : '') + (killed ? '\n[timed out]' : '')
      resolve({ status: killed || overflow ? null : code, out, err: err + note })
    })
  })
}
export const textOf = (r: RunResult): string => (r.out + (r.err ? '\n[stderr] ' + r.err.trim() : '')).trim()
