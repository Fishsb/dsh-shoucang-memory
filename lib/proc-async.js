/**
 * proc-async.ts — **异步**子进程调用（圆桌会审 D-I4 · 2026-09-17）
 *
 * **判因（根因级）**：`panel-observe.ts` 的三处运维端点与 `panel-shared.ts#probeLocalEmbed` 用
 *   `execFileSync` **在同步 HTTP handler 里**独占宿主**唯一的事件循环** —— 上限分别 **180s / 30s / 30s / 12s**。
 *   同仓已有先例与既有修法：`panel-inject.ts:63`「原 `execFileSync` 在慢门禁下阻塞宿主事件循环最长 30s
 *   → 改异步 `execFile`」。本件把那次的修法抽成**单一实现**，供其余四处复用。
 *
 * **前提已实证（圆桌会审核对，非假设）**：
 *   · 宿主 `dsh-host-webserver/lib/index.js:245` 是裸 `createServer` + `const handle = async` 内
 *     `await route.handler(req,res)` ⇒ **异步 handler 受支持**（本仓已有 11+ 个 async handler 走同一 route()）；
 *   · 前端 `src-client/body.js` 的 `api()` 是 `fetch` + Promise、**无 AbortController / 无客户端超时**
 *     ⇒ **改异步不改前端契约**；
 *   · 唯一"契约"是文案（`src-client/panes-overview.js` 的超时上限提示）⇒ 文案与最终取值**同批**改。
 *
 * **与 `distill-proc.ts` 的分工（不重复实现）**：那件是**长时蒸馏脚本**的进程调用汇聚点（自带 NODE_OPTIONS
 *   清理与输出封顶）；本件是**面板请求期**的一次性短调用，薄一层 —— 只做 `execFile` + 超时 + 不丢 stderr。
 *
 * ⚠ **超时取值纪律**：本件**不预设数值**，由调用方按关系式给定
 *   `N×t_inner + 启动 + 余量 ≤ t_outer`（`N` = 串行子检查数）。**不得凭感觉拍数字**：
 *   先测出内层真实耗时分布，再落值；`src-client` 的文案必须与落值**同批**改。
 */
import { execFile } from 'node:child_process';
/** 面板请求期子进程输出的上限（与 `distill-proc.ts` 的 8MB 分属两个场景：这里是交互式短输出） */
const OUT_CAP = 4 * 1024 * 1024;
/**
 * 异步跑一个子进程，**绝不抛**（失败以 `ok:false` 返回，由调用方决定降级语义）。
 *
 * ⚠ 与已被修掉的 M4 的对照：`maxBuffer` 在这里是**有效**的 —— 它属 `execFile`，而**不属** async `spawn`
 *   （那正是 M4 的病根）。此处不写 `as any`，让类型检查真的能校验选项合法性。
 */
export function runProcAsync(bin, args, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 30000;
    return new Promise((resolve) => {
        execFile(bin, args, { cwd: opts.cwd, env: opts.env, windowsHide: true, timeout: timeoutMs, maxBuffer: OUT_CAP }, (e, stdout, stderr) => {
            const eo = e;
            const code = eo && typeof eo.code === 'number' ? eo.code : (e ? null : 0);
            resolve({
                ok: !e,
                code,
                out: String(stdout ?? ''),
                err: String(stderr ?? ''),
                timedOut: !!(eo && eo.killed),
                truncated: !!(eo && String(eo.code) === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'),
            });
        });
    });
}
//# sourceMappingURL=proc-async.js.map