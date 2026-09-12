// distill-proc.ts — 异步子进程调用（蒸馏与深睡共用的**纯工具层**）
//
// 为什么单独成件：distill-llm.ts 需要 runNode / textOf，而它们原本定义在 distill.ts ⇒
//   直接 import 会形成 distill → distill-llm → distill 的**环**（本项目零环是硬性质，不能破）。
//   本件零 import（除 node 内置），是所有蒸馏子模块的进程调用汇聚点。
import { spawn } from 'node:child_process';
export function runNode(nodeBin, scriptPath, args, opts) {
    return new Promise((resolve) => {
        let out = '', err = '', killed = false;
        const child = spawn(nodeBin || 'node', [scriptPath, ...args], {
            cwd: opts?.cwd, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
            // 2026-09-10 实锤修复：宿主 process.env 含 NODE_OPTIONS（inspector --inspect=9445），子进程继承后
            // 端口冲突 → Node 启动异常（status=null / 无 stdout），所有 runNode 子脚本静默失效。
            // 统一清空 NODE_OPTIONS（子脚本无需 inspector），彻底消除该干扰。
            env: { ...process.env, NODE_OPTIONS: '', ...(opts?.env || {}) },
        });
        const to = setTimeout(() => { killed = true; try {
            child.kill();
        }
        catch { /* */ } }, opts?.timeout ?? 60000);
        child.stdout?.on('data', (d) => { out += d; });
        child.stderr?.on('data', (d) => { err += d; });
        child.on('error', (e) => { clearTimeout(to); resolve({ status: null, out: '', err: String(e).slice(0, 200) }); });
        child.on('close', (code) => { clearTimeout(to); resolve({ status: killed ? null : code, out, err: killed ? err + '\n[timed out]' : err }); });
    });
}
export const textOf = (r) => (r.out + (r.err ? '\n[stderr] ' + r.err.trim() : '')).trim();
//# sourceMappingURL=distill-proc.js.map