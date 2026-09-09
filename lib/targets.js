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
/** 注入器 registry.json → 已注入包名集合 + 原始条目（panel 明细展示用） */
export function readInjectedRegistry() {
    const names = new Set();
    const entries = [];
    try {
        const reg = join(dshHome(), 'super-injector', 'registry.json');
        if (existsSync(reg)) {
            const raw = JSON.parse(readFileSync(reg, 'utf8'));
            if (Array.isArray(raw)) {
                for (const e of raw) {
                    if (!e?.name)
                        continue;
                    names.add(e.name);
                    entries.push({ dir: e.dir || '', name: e.name, at: e.at || '' });
                }
            }
        }
    }
    catch { /* registry 不可读按空 */ }
    return { names, entries };
}
/** 扫描 $DSH_HOME/profiles 下各 profile 的 package.json → 装配包名（bundles + dependencies 键名，逐 profile 归属） */
export function scanProfiles() {
    const base = join(dshHome(), 'profiles');
    const out = [];
    let dirs = [];
    try {
        dirs = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    }
    catch {
        return out; // profiles 不存在 → 空
    }
    for (const profile of dirs) {
        const pj = join(base, profile, 'package.json');
        if (!existsSync(pj))
            continue;
        try {
            const pkg = JSON.parse(readFileSync(pj, 'utf8'));
            const deps = pkg.dependencies || {};
            const bundles = pkg.dsh?.profile?.bundles || [];
            const pkgNames = new Set();
            for (const k of Object.keys(deps))
                pkgNames.add(k);
            for (const b of bundles)
                pkgNames.add(b);
            out.push({ profile, pkgNames, bundles });
        }
        catch { /* 单 profile package.json 损坏跳过 */ }
    }
    return out;
}
export function resolveBaseName(pkg) {
    // '@dsh-external/xxx' → 'xxx'；bundles 常以短名登记
    return pkg.includes('/') ? pkg.split('/').pop() || pkg : pkg;
}
function readInjectedNames() {
    return readInjectedRegistry().names;
}
function readProfileNames() {
    const names = new Set();
    for (const p of scanProfiles())
        for (const n of p.pkgNames)
            names.add(n);
    return names;
}
const baseName = (pkg) => resolveBaseName(pkg);
/** 成员是否已装配（任一基准命中） */
export function memberPresent(memberPackage) {
    const n = baseName(memberPackage);
    return readInjectedNames().has(memberPackage) || readProfileNames().has(memberPackage) || readInjectedNames().has(n) || readProfileNames().has(n);
}
export function suiteAssemblyMatrix(members) {
    const injected = readInjectedRegistry();
    const profiles = scanProfiles();
    const rows = members.map((m) => {
        const inInjected = injected.names.has(m.package);
        const hitProfiles = profiles.filter((p) => p.pkgNames.has(m.package) || p.pkgNames.has(resolveBaseName(m.package)));
        const inProfile = hitProfiles.length > 0;
        const status = inInjected && inProfile ? 'both' : inInjected ? 'injected' : inProfile ? 'profile' : 'missing';
        const detail = status === 'both'
            ? `注入器+${hitProfiles.map((p) => p.profile).join(',')} profile`
            : status === 'injected'
                ? '注入器装配'
                : status === 'profile'
                    ? `${hitProfiles.map((p) => p.profile).join(',')} profile 装配`
                    : '两基准均未装配（member 独立可装：dev_inject_plugin 或 dsh plugin add）';
        return { ...m, status, injected: inInjected, profiles: hitProfiles.map((p) => p.profile), detail };
    });
    const missing = rows.filter((r) => r.status === 'missing').length;
    const present = rows.length - missing;
    return {
        members: rows,
        summary: `共 ${rows.length} 成员（present ${present} / missing ${missing}）; 基准: injected registry ${injected.entries.length} 项, profiles ${profiles.length} 个`,
    };
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
    indexTargets: ['MEMORY.md', 'USER.md', 'AGENT.md'],
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
// —— 读侧召回（路线②，词法地板）：确定性零依赖 top-k 薄行检索（向量接入前的缺省召回）——
const CJK_RUN = /[\u4e00-\u9fa5]{2,}/g;
const ASCII_WORD = /[a-z0-9][a-z0-9._/#+-]{1,}/g;
const RECALL_STOP = new Set([
    '一个', '一下', '一直', '一些', '为了', '之后', '之前', '以上', '以下', '什么', '他们', '你们', '我们',
    '应该', '需要', '可以', '不能', '不要', '没有', '进行', '这个', '那个', '这样', '那样', '然后', '还是',
    '但是', '因为', '所以', '如果', '就是', '不是', '怎么', '如何', '哪些', '哪个', '请问', '麻烦', '帮我',
    '继续', '开始', '完成', '现在', '今天', '昨天',
]);
/** 查询 → 检索 token（ASCII 词 + 中文短语；中文长句先按停用词切分，仍 ≥6 字再补三字滑窗，支持部分重叠命中；去重全小写） */
export function extractRecallTokens(text) {
    const t = String(text || '').toLowerCase();
    const out = [];
    const add = (w) => { if (w && w.length >= 2 && !RECALL_STOP.has(w) && !out.includes(w))
        out.push(w); };
    for (const m of t.matchAll(ASCII_WORD))
        add(m[0]);
    for (const m of t.matchAll(CJK_RUN)) {
        const run = m[0];
        let segs = [run];
        for (const s of RECALL_STOP)
            if (s.length >= 2)
                segs = segs.flatMap((x) => (x.includes(s) ? x.split(s) : [x])).filter(Boolean);
        for (const seg of segs) {
            add(seg);
            if (seg.length >= 6)
                for (let i = 0; i + 3 <= seg.length; i++)
                    add(seg.slice(i, i + 3));
        }
    }
    return out;
}
const TAG_WEIGHT = { 路径: 3, 原则: 2 };
/** 词法召回：AGENT.md（[原则]/[路径]/画像行）+ MEMORY/USER 索引行，按 token 命中 × 标签权重排序（路径 > 原则 > 其余） */
export function recallIndex(root, query, topK = 3, scope = 'all') {
    const tokens = extractRecallTokens(query);
    const rows = [];
    if (!tokens.length)
        return { rows, tokens };
    const files = scope === 'all' ? ['AGENT.md', 'MEMORY.md', 'USER.md'] : ['AGENT.md'];
    for (const file of files) {
        let raw = '';
        try {
            raw = readFileSync(join(root, file), 'utf8');
        }
        catch {
            continue;
        }
        for (const l of raw.split(/\r?\n/)) {
            const line = l.trim();
            const tagM = line.match(/^\[([^\] ]+)\]/);
            if (!tagM || !/→\s*notes\//.test(line))
                continue;
            let score = 0;
            for (const tk of tokens)
                if (line.includes(tk))
                    score++;
            if (!score)
                continue;
            score *= (TAG_WEIGHT[tagM[1]] || 1);
            const ptrM = line.match(/→\s*(notes\/[A-Za-z0-9_-]+\.md)/);
            rows.push({ file, tag: tagM[1], line, score, pointer: ptrM ? ptrM[1] : '' });
        }
    }
    rows.sort((a, b) => (b.score - a.score) || a.file.localeCompare(b.file));
    return { rows: rows.slice(0, topK), tokens };
}
/**
 * S5 近似召回（零命中兜底）：全文命中（score≥1）为空的降级分析。
 * 词法近似的本质限制：零全文命中 = 无任何 token 命中任何行，逐行部分匹配（recallApprox 原设计）必然同为空——
 * 真价值是给「库内主题地图」：列 notes/ 各文件小节（按关键词/语义标注），让 agent 知道库里有哪类话题可换问法，
 * 并给出建议检索词（查询中属库内已知领域的 token，若有）。只读。
 */
export function recallApprox(root, query, scope = 'all') {
    const tokens = extractRecallTokens(query);
    const suggest = [];
    if (!tokens.length)
        return { near: [], suggest };
    // 建议检索词：查询 token 中在任一索引行出现过的（说明该领域库里有，只是措辞/组合没对上）
    const files = scope === 'all' ? ['AGENT.md', 'MEMORY.md', 'USER.md'] : ['AGENT.md'];
    const seen = new Set();
    for (const file of files) {
        let raw = '';
        try {
            raw = readFileSync(join(root, file), 'utf8');
        }
        catch {
            continue;
        }
        for (const tk of tokens)
            if (raw.includes(tk))
                seen.add(tk);
    }
    for (const tk of tokens)
        if (seen.has(tk))
            suggest.push(tk);
    // 主题地图：notes/ 各文件小节（INDEX 外的详情文件），帮助换问法
    const near = [];
    try {
        const notesDir = join(root, 'notes');
        if (existsSync(notesDir)) {
            for (const fn of readdirSync(notesDir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md').sort()) {
                const body = readFileSync(join(notesDir, fn), 'utf8');
                for (const m of body.matchAll(/^##\s+(.+)$/gm)) {
                    const title = String(m[1]).replace(/\s*（20\d{2}.*）\s*$/, '').trim();
                    near.push({ file: 'notes/' + fn, tag: '', line: `notes/${fn} 有主题「${title}」`, score: 1, pointer: `notes/${fn}` });
                }
            }
        }
    }
    catch { /* 主题地图失败静默 */ }
    return { near: near.slice(0, 12), suggest: suggest.slice(0, 5) };
}
// —— 自测：单库解析 + 白名单门禁抽样 ——
export function selftestMatrix() {
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