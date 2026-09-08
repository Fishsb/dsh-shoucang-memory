/**
 * targets.ts — 目标层：单库路由 + 白名单门禁（纯函数，零硬编码路径）。
 *
 * 单库化（2026-09-08 用户拍板：pmg 项目卡库已随治理插件整体移除，守藏只是一个记忆插件）：
 *   - 唯一记忆库 = 生产部署根 ~/.dsh/skills/managing-memory（数据 + 脚本 + 审计同根）
 *   - 取消 route=project 的 pmg-cards / local-pending 二分：项目专属事实由蒸馏器直写
 *     「项目工作区」<workspace>/docs/devref/shoucang/（workspace 由会话转录反解，见 distill.ts）
 *   - suite/knowledge 仅承载蒸馏器运行状态（审计/水位/pending 输入队列），不再是库
 * 白名单：库数据根 whitelist.json 自治（库自维护，蒸馏器只读）；缺文件 → 内建缺省（可观测标注）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
export function dshHome() {
    return process.env.DSH_HOME || join(homedir(), '.dsh');
}
/** 守藏运行状态区（蒸馏审计/水位/pending 输入队列；非记忆库） */
export function knowledgeRoot() {
    return join(dshHome(), 'suite', 'knowledge');
}
/** 记忆库根（数据与脚本同根，scripts 缺省自定位） */
export function memoryLibRoot() {
    return join(dshHome(), 'skills', 'managing-memory');
}
// —— 装配探测（与 index.ts shoucang_suite 同源口径：injected registry + profiles 双基准）——
function readInjectedNames() {
    const names = new Set();
    try {
        const reg = join(dshHome(), 'super-injector', 'registry.json');
        if (existsSync(reg)) {
            const raw = JSON.parse(readFileSync(reg, 'utf8'));
            if (Array.isArray(raw))
                for (const e of raw)
                    if (e?.name)
                        names.add(e.name);
        }
    }
    catch { /* registry 不可读按空 */ }
    return names;
}
function readProfileNames() {
    const names = new Set();
    try {
        const base = join(dshHome(), 'profiles');
        if (!existsSync(base))
            return names;
        // 简版扫描：只取包名集合（profile 归属明细由 shoucang_suite 工具负责）
        for (const d of readdirSync(base, { withFileTypes: true })) {
            if (!d.isDirectory())
                continue;
            const pj = join(base, d.name, 'package.json');
            if (!existsSync(pj))
                continue;
            try {
                const pkg = JSON.parse(readFileSync(pj, 'utf8'));
                for (const k of Object.keys(pkg.dependencies || {}))
                    names.add(k);
                for (const b of pkg.dsh?.profile?.bundles || [])
                    names.add(b);
            }
            catch { /* 单 profile 损坏跳过 */ }
        }
    }
    catch { /* profiles 不可读按空 */ }
    return names;
}
const baseName = (pkg) => (pkg.includes('/') ? pkg.split('/').pop() || pkg : pkg);
/** 成员是否已装配（任一基准命中） */
export function memberPresent(memberPackage) {
    const n = baseName(memberPackage);
    return readInjectedNames().has(memberPackage) || readProfileNames().has(memberPackage) || readInjectedNames().has(n) || readProfileNames().has(n);
}
/**
 * 记忆库就位探测：库根下 MEMORY.md 存在（数据随 skill 部署到同一根）。
 */
export function memorySkillPresent() {
    return existsSync(join(memoryLibRoot(), 'MEMORY.md'));
}
/** 解析唯一记忆库（present=false 时仍返回目标，由调用方决定降级行为并如实审计） */
export function resolveTarget() {
    const root = memoryLibRoot();
    return {
        library: 'shoucang', kind: 'memory', root,
        present: memorySkillPresent(),
        writer: 'scripts/memory-append.mjs（零拷贝）',
        note: '守藏记忆库（唯一）',
    };
}
const BUILTIN = {
    version: 1, library: 'shoucang', routes: ['memory'],
    indexTargets: ['PRINCIPLES.md', 'MEMORY.md', 'USER.md', 'AGENT.md'],
    notes: ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent'],
};
export function loadWhitelist(root) {
    try {
        const p = join(root, 'whitelist.json');
        if (existsSync(p)) {
            const raw = JSON.parse(readFileSync(p, 'utf8'));
            return {
                wl: {
                    version: raw.version ?? 1,
                    library: raw.library ?? BUILTIN.library,
                    routes: raw.routes ?? BUILTIN.routes,
                    indexTargets: raw.indexTargets ?? BUILTIN.indexTargets,
                    notes: raw.notes ?? BUILTIN.notes,
                },
                source: 'file',
            };
        }
    }
    catch { /* 白名单文件损坏 → 内建缺省（报告注明） */ }
    return { wl: BUILTIN, source: 'builtin' };
}
/** memory 路由入册条目门禁：target ∈ indexTargets（含 USER/AGENT 画像）或 notes/<白名单名>.md */
export function gateMemoryAppend(a, wl) {
    const t = String(a.target || '').trim();
    if (wl.indexTargets.includes(t))
        return { ok: true };
    const m = t.match(/^notes\/([A-Za-z0-9_-]+)\.md$/);
    if (m && wl.notes.includes(m[1]))
        return { ok: true };
    return { ok: false, reason: `白名单不符: ${t || '(空)'} 不在 ${wl.library} 收录范围（indexTargets=[${wl.indexTargets.join(',')}] notes=[${wl.notes.join(',')}]）` };
}
// —— 自测：单库解析 + 白名单门禁抽样 ——
export function selftestMatrix(real) {
    void real;
    const lines = [];
    const t = resolveTarget();
    lines.push(`${t.present ? '✅' : '❌'} 单库解析: ${t.library} @ ${t.root} present=${t.present}`);
    // 白名单门禁抽样（生产根）
    const { wl, source } = loadWhitelist(t.root);
    lines.push(`ℹ️ 白名单来源=${source} routes=[${wl.routes.join(',')}] notes=${wl.notes.length} 类 indexTargets=[${wl.indexTargets.join(',')}]`);
    const g1 = gateMemoryAppend({ target: 'notes/lessons.md' }, wl);
    const g2 = gateMemoryAppend({ target: 'notes/evil.md' }, wl);
    const g3 = gateMemoryAppend({ target: 'USER.md' }, wl);
    lines.push(`${g1.ok ? '✅' : '❌'} 门禁抽样: notes/lessons.md ${g1.ok ? '放行' : '误拒:' + g1.reason}`);
    lines.push(`${!g2.ok ? '✅' : '❌'} 门禁抽样: notes/evil.md ${!g2.ok ? '拒收(' + g2.reason?.slice(0, 40) + '…)' : '误放行'}`);
    lines.push(`${g3.ok ? '✅' : '❌'} 门禁抽样: USER.md（画像）${g3.ok ? '放行' : '误拒:' + g3.reason}`);
    return lines;
}
//# sourceMappingURL=targets.js.map