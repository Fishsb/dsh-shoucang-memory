import z from 'schemastery';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import { dshHome, knowledgeRoot, memoryLibRoot, recallIndex } from './targets.js';
import { vecStats, clearVecCache } from './vec.js';
import { deepSleepShare } from './deepsleep-share.js';
import { schedulerShare } from './scheduler-share.js';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';
export const name = '@dsh-external/shoucang-panel';
export const inject = ['webServer', 'systemPrompt', 'commands'];
export const Config = z.object({
    state_path: z.string().default('~/.dsh/storages/shoucang-panel.json'),
}).description('面板设置');
const CONFIG_FILE = 'shoucang.config.yaml';
function expandHome(p) {
    if (p === '~')
        return homedir();
    if (p.startsWith('~/') || p.startsWith('~\\'))
        return join(homedir(), p.slice(2));
    return p;
}
function sendJson(res, code, body) {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}
/** python 脚本 stdout 已 JSON 时原样透传，否则包成 { raw } 防吞。 */
function safeJson(s) {
    const t = s.trim();
    try {
        const j = JSON.parse(t);
        return (j && typeof j === 'object') ? j : { raw: t.slice(0, 600) };
    }
    catch {
        return { raw: t.slice(0, 600) };
    }
}
async function readBody(req) {
    const chunks = [];
    for await (const c of req)
        chunks.push(c);
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    }
    catch {
        return {};
    }
}
function statMtime(file) {
    try {
        return statSync(file).mtime.toISOString();
    }
    catch {
        return '';
    }
}
export function applyPanel(ctx, config) {
    const webServer = ctx.webServer;
    if (!webServer) {
        ctx.logger?.warn?.('[shoucang] webServer 服务不可用，面板 RPC 未挂载');
        return;
    }
    const statePath = expandHome(config.state_path);
    const loadState = () => {
        try {
            return JSON.parse(readFileSync(statePath, 'utf8'));
        }
        catch {
            return { roots: [], active: null };
        }
    };
    const saveState = (s) => {
        mkdirSync(dirname(statePath), { recursive: true });
        writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');
    };
    const disposers = [];
    /** 已注册路径（宿主按路径去重，重复注册会抛错并导致整个插件树加载失败）。 */
    const registeredPaths = new Set();
    /** 注册 exact 路由并纳入卸载清理（资源必须挂 effect——注入器踩坑记录）。 */
    const route = (sub, handler) => {
        const path = `/api/shoucang-panel${sub}`;
        if (registeredPaths.has(path)) {
            // 兜底：同一路径只允许注册一次（GET/POST 需在同一 handler 内按 method 分发），
            // 否则宿主抛 duplicate route → 插件树整体加载失败。此处告警降级而非让插件起不来。
            ctx.logger?.warn?.(`[shoucang] 路由重复注册已忽略：${path}（请合并到同一 handler 按 method 分发）`);
            return;
        }
        registeredPaths.add(path);
        disposers.push(webServer.register({ kind: 'exact', path, handler }));
    };
    const configFileOf = () => {
        const root = activeRootOf();
        return root ? join(root.path, CONFIG_FILE) : null;
    };
    const activeRootOf = () => {
        const s = loadState();
        return s.roots.find((r) => r.id === s.active) ?? null;
    };
    // ESM 宿主：模块目录用 import.meta.url 解析（__dirname 在 ESM 未定义）
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    /* ---------- 默认记忆库骨架（2026-09-11 重写：旧 wiki/Obsidian vault 模板退役） ----------
     * 判因（审查 B1）：旧实现把 pmg 时代的 default-vault-template.tar.gz（_meta/*.py 管线 + validate/ +
     *   wiki-* + _index.md）解压到新根，而**当前读写链**（memoryRootOf / targets.memoryLibRoot）只认单库化
     *   布局（MEMORY/USER/AGENT.md + notes/ + audit/ + pending/）⇒ 引导出来的库插件根本读不到。
     * 现语义：只建「单库骨架 + 随包脚本/引擎/规则档」，幂等（已存在一律不覆盖），零外部资产依赖。
     */
    /** 单库骨架常量：七类 notes（与 targets.BUILTIN.notes 同源）+ 三索引 + 白名单 */
    const LIB_NOTES = ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent'];
    const LIB_INDEX_FILES = [
        { file: 'MEMORY.md', head: '# MEMORY.md — 知识索引（守藏记忆库）\n\n> 索引行：`[tag] 主题 · 概况 → notes/x.md §小节`；容量门与白名单见同根 `whitelist.json`。\n' },
        { file: 'USER.md', head: '# USER.md — 用户画像（守藏记忆库）\n\n> 索引行 + 画像行（`- … ← 源: …`）；画像行全量注入，不参与召回命中统计。\n' },
        { file: 'AGENT.md', head: '# AGENT.md — 自我画像（守藏记忆库）\n\n> 索引行 + 画像行；含 `[原则]`/`[路径]`/`[边界]`（深睡归纳落点）。\n' },
    ];
    const writeIfAbsent = (p, body, created) => {
        try {
            if (existsSync(p))
                return;
            mkdirSync(dirname(p), { recursive: true });
            writeFileSync(p, body);
            created.push(p);
        }
        catch { /* 单文件失败不阻断（报告按实际创建数） */ }
    };
    const copyFileIfAbsent = (src, dst, created) => {
        try {
            if (!existsSync(src) || existsSync(dst))
                return;
            mkdirSync(dirname(dst), { recursive: true });
            writeFileSync(dst, readFileSync(src));
            created.push(dst);
        }
        catch { /* 源缺失/写入失败=跳过 */ }
    };
    const copyTreeIfAbsent = (srcDir, dstDir, created) => {
        try {
            if (!existsSync(srcDir))
                return;
            mkdirSync(dstDir, { recursive: true });
            for (const e of readdirSync(srcDir, { withFileTypes: true })) {
                const s = join(srcDir, e.name);
                const d = join(dstDir, e.name);
                if (e.isDirectory())
                    copyTreeIfAbsent(s, d, created);
                else
                    copyFileIfAbsent(s, d, created);
            }
        }
        catch { /* 目录不可读=跳过 */ }
    };
    /** 幂等建「单库骨架」：目录 + 三索引 + 七 notes + INDEX 注册表 + whitelist.json + 随包 scripts/engine/规则档 */
    const bootstrapDefaults = (rootPath) => {
        const out = { createdDirs: [], createdIndexes: [], skipped: [], template: true };
        mkdirSync(rootPath, { recursive: true });
        for (const d of ['notes', 'audit', 'audit/archive', 'pending']) {
            const p = join(rootPath, d);
            if (existsSync(p))
                continue;
            try {
                mkdirSync(p, { recursive: true });
                out.createdDirs.push(d);
            }
            catch {
                out.skipped.push(d);
            }
        }
        for (const { file, head } of LIB_INDEX_FILES) {
            if (existsSync(join(rootPath, file))) {
                out.skipped.push(file);
                continue;
            }
            writeIfAbsent(join(rootPath, file), head, out.createdIndexes);
        }
        for (const n of LIB_NOTES) {
            const rel = `notes/${n}.md`;
            if (existsSync(join(rootPath, rel))) {
                out.skipped.push(rel);
                continue;
            }
            writeIfAbsent(join(rootPath, rel), `# notes/${n}.md — ${n}\n\n## 起始\n- （新库占位小节：写入由 memory-append 追加，或按「父/子」路径自动分裂 ###）\n`, out.createdIndexes);
        }
        writeIfAbsent(join(rootPath, 'notes', 'INDEX.md'), '# notes/INDEX.md — 详情子文档注册表\n\n## 元数据表\n\n| 文件 | 状态 | 说明 | 更新 | 范围 |\n|---|---|---|---|---|\n', out.createdIndexes);
        writeIfAbsent(join(rootPath, 'whitelist.json'), JSON.stringify({
            version: 1, library: 'shoucang', routes: ['memory'],
            indexTargets: ['MEMORY.md', 'USER.md', 'AGENT.md'], notes: LIB_NOTES,
            updatedAt: new Date().toISOString().slice(0, 10),
        }, null, 2) + '\n', out.createdIndexes);
        // 随包脚本/引擎/规则档：蒸馏与深睡**直接以 <库根>/scripts/*.mjs 起子进程**，
        // 骨架不带脚本 = 记忆循环空转（这正是旧 vault 模板的坑），故一并复制（幂等，不覆盖已存在文件）。
        const skillDir = join(moduleDir, '..', 'skill');
        copyTreeIfAbsent(join(skillDir, 'scripts'), join(rootPath, 'scripts'), out.createdIndexes);
        copyTreeIfAbsent(join(skillDir, 'engine'), join(rootPath, 'engine'), out.createdIndexes);
        for (const f of ['SKILL.md', 'audit-protocol.md', 'human-execution-loop.md', 'memory-whitelist-spec.md', 'task-protocols.md', 'README.md']) {
            copyFileIfAbsent(join(skillDir, f), join(rootPath, f), out.createdIndexes);
        }
        return out;
    };
    /* ---------- R1 热记忆注入（2026-08-27）：画像+记忆 指针行，每轮注入 ---------- */
    // 缓存键含「任务文本」：相关性选行随任务变化，仅按 root 缓存会让同一会话内永不更新（2026-09-10 ACT-027）
    const injectCache = { key: null, at: 0, text: '' };
    const injectMeta = { calls: 0, lastAt: 0 }; // 提示词装配调用计数（实测新会话注入）
    // 路线② 晨起摘要读取：深睡 delta（suite/knowledge/delta.md，≤3 行，48h 有效；delta 永非事实源，过期即弃）
    const readDawnDelta = (personaMode) => {
        if (personaMode === 'off')
            return '';
        try {
            const f = join(knowledgeRoot(), 'delta.md');
            if (!existsSync(f))
                return '';
            const o = JSON.parse(readFileSync(f, 'utf8'));
            if (o.staleAt && Date.parse(o.staleAt) < Date.now())
                return '';
            const rows = Array.isArray(o.rows) ? o.rows.slice(0, 3).filter((r) => typeof r === 'string' && !!r.trim()) : [];
            if (!rows.length)
                return '';
            return ['🧠 最近成长（上次深睡归纳，带源指针可核验）：', ...rows.map((r) => `  ${r.trim()}`)].join('\n');
        }
        catch {
            return '';
        }
    };
    // 数据根：守藏自有记忆库（三索引体系，与蒸馏写入权威根一致）；MEMORY_ROOT 可覆盖
    const memoryRootOf = () => {
        const env = process.env.MEMORY_ROOT?.trim();
        return env || join(dshHome(), 'skills', 'managing-memory');
    };
    // ACT-027（2026-09-10）：知识索引行由「位置式前 N 行（永远最旧 10 条）」改为
    // 「任务相关性 top-k ∪ 新鲜度保证槽」——新知识因此能进横幅（此前压缩/新增对横幅零影响已实测）。
    // 画像行（AGENT/USER）保持不变（实测其取用 21/100 轮，是主力）；query 为空、召回无命中或配置关闭时回退位置式。
    const buildHotMemoryText = (query = '') => {
        const now = Date.now();
        const memRoot = memoryRootOf();
        const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const cacheKey = memRoot + '|' + q;
        if (injectCache.key === cacheKey && now - injectCache.at < 30000)
            return injectCache.text;
        injectCache.key = cacheKey;
        injectCache.at = now;
        let level = 'smart';
        let hotMemoryOn = true;
        let personaMode = 'both';
        // P1-2（2026-09-10）：注入配置作用域迁全局——优先读 ~/.dsh/suite/scheduler.json 的 injection 键，
        // 回落 root config YAML（旧配置兼容），都无 → 缺省。切 root 不再影响注入（与记忆/蒸馏同域）。
        // 注：板块上限（caps）2026-09-10 起为「记忆库容量门」（写门用），不再裁注入——注入总看完整画像+记忆
        const sched = (() => { try {
            return readSuiteConfig();
        }
        catch {
            return {};
        } })();
        const hasSchedInject = 'injectLevel' in sched || 'injectPersona' in sched || 'hotMemory' in sched;
        if (hasSchedInject) {
            if (typeof sched.injectLevel === 'string')
                level = sched.injectLevel;
            if (typeof sched.injectPersona === 'string')
                personaMode = sched.injectPersona;
            if (typeof sched.hotMemory === 'boolean')
                hotMemoryOn = sched.hotMemory;
        }
        else {
            // 回落：旧 root config YAML（2026-09-10 前唯一注入配置源；迁移后仅兼容读取）
            const file = configFileOf();
            if (file && existsSync(file)) {
                try {
                    const view = parseView(readFileSync(file, 'utf8'));
                    level = view.injection_level ?? 'smart';
                    hotMemoryOn = view.flags['injection.hot_memory'] !== false;
                    personaMode = String(view.flags['injection.persona'] ?? 'both'); // v16：off|me|you|both 接通生效（me=AGENT 画像 / you=USER 画像）
                }
                catch { /* 缺配置用默认 */ }
            }
        }
        if (level === 'off' || !hotMemoryOn) {
            injectCache.text = '';
            return '';
        }
        // 指针式注入：agent 画像（含 [原则] 习得原则与 [路径] 任务路径）+ 用户画像 + 知识索引一行一条（[tag] 主题 · 概况 → notes/x.md §小节），Agent 按需 get_file 拉详情
        // 2026-09-10 用户拍板：注入侧**不裁切**（任务执行时 agent 总看到完整双画像+记忆指针——裁切会漏记忆影响执行）；
        // 记忆库规模由容量门（写门 SHOUCANG_CAP_*，蒸馏扩增时强制）控制
        const readIdx = (name) => {
            try {
                return readFileSync(join(memRoot, name), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\[.+\]/.test(l));
            }
            catch {
                return [];
            }
        };
        const rowCaps = { low: 2, medium: 4, high: 8, smart: 10 };
        const userLines = personaMode === 'off' || personaMode === 'me' ? [] : readIdx('USER.md');
        const agentLines = personaMode === 'off' || personaMode === 'you' ? [] : readIdx('AGENT.md');
        // 知识索引行选行（ACT-027）：相关性 top-k（复用 recallIndex，单一实现）∪ 新鲜度保证槽（末尾 N 条）
        const cap = rowCaps[level] ?? 10;
        const allMem = readIdx('MEMORY.md');
        // v8（认知对照 P1「降权贯穿三通道」+「复习-强化」）注入侧的冷热感知 + 命中次权重。
        //   R6 审查项：**回退分支也要生效**——否则 `injectRelevance=false` 或空 query 时「降权贯穿三通道」实际只剩两通道。
        let actMap = new Map();
        try {
            for (const l of readFileSync(join(memRoot, 'audit', 'activity.jsonl'), 'utf8').split(/\r?\n/)) {
                if (!l.trim())
                    continue;
                try {
                    const o = JSON.parse(l);
                    const f = String(o.f || '').replace(/^notes\//, '');
                    const s = String(o.s || '').trim().toLowerCase();
                    if (f && s)
                        actMap.set(`${f}::${s}`, { cold: String(o.status) === 'cold' || !!o.retired, hits30: Number(o.hits30 || 0) });
                }
                catch { /* 坏行跳过 */ }
            }
        }
        catch { /* 无 activity.jsonl = 不感知（保持旧行为） */ }
        const rowWeight = (l) => {
            const fm = (l.match(/notes\/([A-Za-z0-9_-]+)\.md/) || [])[1] || '';
            const tail = l.split('→').pop() || '';
            let cold = false;
            let hits = 0;
            for (const m of tail.matchAll(/§([^/→]+)/g)) {
                const s = String(m[1]).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim().toLowerCase();
                const e = actMap.get(`${fm}::${s}`) || actMap.get(`${fm}.md::${s}`);
                if (!e)
                    continue;
                if (e.cold)
                    cold = true;
                hits = Math.max(hits, e.hits30);
            }
            return { cold, hits30: hits };
        };
        // 回退基线 = 位置式前 N 行，但**冷行稳定后置**（组内原序不变，故仍属"位置式"）
        let memLines = [...allMem]
            .sort((a, b) => (rowWeight(a).cold ? 1 : 0) - (rowWeight(b).cold ? 1 : 0))
            .slice(0, cap);
        const relOn = (() => { try {
            return readSuiteConfig().injectRelevance !== false;
        }
        catch {
            return true;
        } })();
        if (q && relOn && allMem.length) {
            const fresh = Math.max(0, Math.min(Number((() => { try {
                return readSuiteConfig().injectFreshSlots;
            }
            catch {
                return undefined;
            } })()) || 2, cap));
            const picked = [];
            try {
                const { rows } = recallIndex(memRoot, q, cap, 'all');
                for (const r of rows)
                    if (r.file === 'MEMORY.md' && !picked.includes(r.line))
                        picked.push(r.line);
            }
            catch { /* 召回异常=保持位置式回退 */ }
            for (const l of allMem.slice(Math.max(0, allMem.length - fresh)))
                if (!picked.includes(l))
                    picked.push(l);
            // 槽位不足时用**位置式基线**补齐：防「短指令（如"继续"）零命中」导致知识行从 cap 缩到 fresh 的信息损失。
            // 三者叠加 = 相关性 ∪ 新鲜度 ∪ 基线覆盖，任一维度都不牺牲。
            // v8 补位顺序（actMap/rowWeight 见上方回退分支）：cold 降末段、hits30 高者先占槽——**只改补位顺序**，不改前两档语义
            const rest = allMem.filter((l) => !picked.includes(l));
            rest.sort((a, b) => {
                const A = rowWeight(a);
                const B = rowWeight(b);
                if (A.cold !== B.cold)
                    return A.cold ? 1 : -1;
                return B.hits30 - A.hits30;
            });
            for (const l of rest) {
                if (picked.length >= cap)
                    break;
                picked.push(l);
            }
            if (picked.length)
                memLines = picked.slice(0, cap);
        }
        if (!userLines.length && !agentLines.length && !memLines.length) {
            injectCache.text = '';
            return '';
        }
        const lines = [`[守藏·热记忆] 记忆库指针（${memRoot}；详情按指针 get_file 拉对应 notes §小节）：`];
        if (agentLines.length) {
            lines.push('agent 画像（AGENT.md；含 [原则] 习得原则与 [路径] 任务路径——跨任务方向指引/脚本骨架，①③步优先读）：');
            for (const l of agentLines)
                lines.push(`- ${l}`);
        }
        if (userLines.length) {
            lines.push('用户画像（USER.md）：');
            for (const l of userLines)
                lines.push(`- ${l}`);
        }
        if (memLines.length) {
            lines.push(`知识索引（MEMORY.md，热取前 ${memLines.length} 条）：`);
            for (const l of memLines)
                lines.push(`- ${l}`);
        }
        // 2026-09-10 用户拍板：去掉总预算（max_tokens）裁切——注入内容=双画像+记忆指针（薄行），
        // 由各板块字符上限（caps）独立控制；delta 晨起摘要直接前置（内容极少，不需预算预留）
        const deltaText = readDawnDelta(personaMode);
        let text = lines.join('\n');
        if (deltaText)
            text = deltaText + '\n' + text;
        injectCache.text = text;
        return text;
    };
    const backupThenWrite = (file, text) => {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
        try {
            writeFileSync(`${file}.bak-${stamp}`, readFileSync(file));
        }
        catch { /* 首次写入前无备份 */ }
        writeFileSync(file, text, 'utf8');
    };
    /** 缩进栈解析：每行归一为带点路径（如 shoucang.boards.persona），栈深即嵌套层级。 */
    function scanPaths(text, visit) {
        const stack = [];
        for (const raw of text.split(/\r?\n/)) {
            if (!raw.trim() || /^\s*#/.test(raw))
                continue;
            const m = raw.match(/^(\s*)([\w-]+):(\s*)(.*)$/);
            if (!m)
                continue;
            const indent = m[1].length;
            const value = m[4].split('#')[0].trim();
            while (stack.length && stack[stack.length - 1].indent >= indent)
                stack.pop();
            stack.push({ indent, key: m[2] });
            visit(stack.map((s) => s.key), indent, value);
        }
    }
    const parseView = (text) => {
        const out = { boards: {}, flags: {} };
        scanPaths(text, (path, _indent, value) => {
            if (!value)
                return;
            if (/^shoucang\.boards\./.test(path.join('.')) && path.length === 3 && (value === 'true' || value === 'false')) {
                out.boards[path[2]] = value === 'true';
                return;
            }
            const p = path.join('.');
            if (/^shoucang\.(archive|lifecycle|scheduler)\.enabled$/.test(p) && (value === 'true' || value === 'false')) {
                out.flags[`${p.split('.')[1]}.enabled`] = value === 'true';
                return;
            }
            if (p === 'shoucang.injection.hot_memory' && (value === 'true' || value === 'false')) {
                out.flags['injection.hot_memory'] = value === 'true';
                return;
            }
            if (p === 'shoucang.lifecycle.archive.apply_confirm' && (value === 'true' || value === 'false'))
                out.flags['lifecycle.archive.apply_confirm'] = value === 'true';
            if (p === 'shoucang.merge.enabled' && (value === 'true' || value === 'false'))
                out.flags['merge.enabled'] = value === 'true';
            if (p === 'shoucang.merge.fingerprint_threshold')
                out.merge_fpr = parseFloat(value) || undefined;
            if (p === 'shoucang.idle.sessions_dir')
                out.sessions_dir = value.replace(/^['"]|['"]$/g, '');
            if (p === 'shoucang.lifecycle.interval_hours') {
                const n = parseFloat(value);
                if (!isNaN(n))
                    out.interval_hours = n;
            } // 0 合法=禁用结算（falsy 修复）
            if (p === 'shoucang.merge.complement_floor')
                out.merge_floor = parseFloat(value) || undefined;
            if (p === 'shoucang.injection.persona')
                out.flags['injection.persona'] = value.replace(/^['"]|['"]$/g, '');
            if (p === 'shoucang.injection.level')
                out.injection_level = value.replace(/^['"]|['"]$/g, '');
            // v16：板块容量上限（0 合法=不裁，显式 isNaN 检查防 falsy 丢失）；max_tokens 总预算已退役（2026-09-10）
            if (p === 'shoucang.injection.agent_max_chars') {
                const n = parseInt(value, 10);
                if (!isNaN(n))
                    out.caps_agent = n;
            }
            if (p === 'shoucang.injection.user_max_chars') {
                const n = parseInt(value, 10);
                if (!isNaN(n))
                    out.caps_user = n;
            }
            if (p === 'shoucang.injection.memory_max_chars') {
                const n = parseInt(value, 10);
                if (!isNaN(n))
                    out.caps_memory = n;
            }
            if (p === 'shoucang.archive.idle_review_ms') {
                const n = parseInt(value, 10);
                if (!isNaN(n))
                    out.idle_review_ms = n;
            } // 0 合法=禁用心跳（falsy 修复）
            if (p === 'shoucang.lifecycle.archive.age_days')
                out.age_days = parseFloat(value) || undefined;
            if (p === 'shoucang.lifecycle.archive.mode')
                out.archive_mode = value.replace(/^['"]|['"]$/g, '');
            if (p === 'shoucang.lifecycle.archive.fixed_time')
                out.fixed_time = value.replace(/^['"]|['"]$/g, '');
            // 向量检索配置（召回面 · 2026-08-27）：embedding 服务自定义
            if (p.startsWith('shoucang.embedding.')) {
                const k = p.slice('shoucang.embedding.'.length);
                out.embedding = out.embedding || {};
                if (k === 'dimension') {
                    const n = parseInt(value, 10);
                    if (!isNaN(n))
                        out.embedding.dimension = n;
                }
                else
                    out.embedding[k] = value.replace(/^['"]|['"]$/g, '');
            }
        });
        return out;
    };
    /** 在原文中翻转任意 `a.b.c=true|false` 布尔行（缩进栈定位，注释保留）。 */
    function flipBool(text, dottedKey) {
        const lines = text.split(/\r?\n/);
        const stack = [];
        for (let i = 0; i < lines.length; i++) {
            const head = lines[i].match(/^(\s*)([\w-]+):(\s*)(.*)$/);
            if (!head)
                continue;
            const indent = head[1].length;
            const value = head[4].split('#')[0].trim();
            while (stack.length && stack[stack.length - 1].indent >= indent)
                stack.pop();
            stack.push({ indent, key: head[2] });
            if (stack.map((s) => s.key).join('.') !== dottedKey || value === '')
                continue;
            const vm = lines[i].match(/^(\s*)([\w-]+):(\s*)(true|false)(\s*(?:#.*)?)$/);
            if (!vm)
                return null;
            lines[i] = `${vm[1]}${vm[2]}:${vm[3]}${vm[4] === 'true' ? 'false' : 'true'}${vm[5]}`;
            return lines.join('\n');
        }
        return null;
    }
    /** 设置标量（枚举/数值/布尔）：YAML 栈定位 dottedKey 行，替换值、保留注释与缩进 */
    function setKey(text, dottedKey, rawValue) {
        const lines = text.split(/\r?\n/);
        const stack = [];
        for (let i = 0; i < lines.length; i++) {
            const head = lines[i].match(/^(\s*)([\w-]+):(\s*)(.*)$/);
            if (!head)
                continue;
            const indent = head[1].length;
            while (stack.length && stack[stack.length - 1].indent >= indent)
                stack.pop();
            stack.push({ indent, key: head[2] });
            if (stack.map((s) => s.key).join('.') !== dottedKey)
                continue;
            const tail = lines[i].match(/^(\s*)([\w-]+):(\s*)(.*?)(\s*#.*)?$/);
            if (!tail)
                return null;
            const comment = tail[5] ?? '';
            lines[i] = `${tail[1]}${tail[2]}:${tail[3]}${rawValue}${comment}`;
            return lines.join('\n');
        }
        return null;
    }
    // ---- RPC ----
    route('/roots', (_req, res) => {
        const s = loadState();
        sendJson(res, 200, { roots: s.roots, active: s.active });
    });
    route('/get_root', (_req, res) => {
        const s = loadState();
        sendJson(res, 200, { active: s.roots.find((r) => r.id === s.active) ?? null });
    });
    // 按**单库骨架**手动构建（body.root 可指定；缺省用当前激活根）——幂等，只补缺失目录/索引/脚本
    route('/root/bootstrap', async (req, res) => {
        const body = (await readBody(req).catch(() => ({})));
        const target = typeof body.root === 'string' && body.root.trim() ? resolve(body.root.trim()) : activeRootOf()?.path ?? '';
        if (!target)
            return sendJson(res, 400, { error: 'no root' });
        const boot = bootstrapDefaults(target);
        sendJson(res, 200, { root: target, ...boot, skeleton: boot.template });
    });
    route('/set_root', async (req, res) => {
        const body = await readBody(req);
        const p = typeof body.path === 'string' ? body.path.trim() : '';
        if (!p)
            return sendJson(res, 400, { error: 'path required' });
        const abs = isAbsolute(p) ? resolve(p) : resolve(p);
        const file = join(abs, CONFIG_FILE);
        if (!existsSync(file))
            return sendJson(res, 400, { error: `未找到 ${CONFIG_FILE}：${abs}` });
        const s = loadState();
        let entry = s.roots.find((r) => r.path === abs);
        if (!entry) {
            entry = {
                id: `root-${Date.now()}`,
                name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : abs.split(/[\\/]/).pop() || abs,
                path: abs,
            };
            s.roots.push(entry);
        }
        s.active = entry.id;
        saveState(s);
        ctx.logger?.info?.(`[shoucang] panel root activated: ${abs}`);
        // 切换根目录默认构建：按默认项目资料补缺目录/索引（幂等，不覆盖既有 _index.md）
        try {
            const boot = bootstrapDefaults(abs);
            if (boot.createdDirs.length || boot.createdIndexes.length) {
                ctx.logger?.info?.(`[shoucang] bootstrap ${abs}: +${boot.createdDirs.length} dirs +${boot.createdIndexes.length} indexes`);
            }
        }
        catch (e) {
            ctx.logger?.warn?.(`[shoucang] bootstrap failed: ${String(e)}`);
        }
        sendJson(res, 200, { ok: true, active: entry });
    });
    route('/config', (_req, res) => {
        const file = configFileOf();
        const sched = readSuiteConfig();
        // 2026-09-10（修正）：上限 vs 实际量——上限是稳定配置（用户设的边界）；未配时默认=容量门硬边界
        // （画像 AGENT/USER 3000、记忆 MEMORY 5000（2026-09-11 用户拍板默认）：写门强制内容不可超，故默认=容量门=允许全量且 UI 数字稳定）；
        // actual = 当前实际量（动态参考，随内容成长变化，仅展示不参与配置）
        const CAP_GATES = { 'AGENT.md': 3000, 'USER.md': 3000, 'MEMORY.md': 5000 };
        const fileChars = (name) => {
            try {
                const base = join(dshHome(), 'skills', 'managing-memory');
                const t = readFileSync(join(base, name), 'utf8');
                return t.replace(/\s+/g, '').length;
            }
            catch {
                return 0;
            }
        };
        const globalCfg = {
            persona: String(sched.injectPersona ?? 'both'),
            level: String(sched.injectLevel ?? 'smart'),
            hot_memory: sched.hotMemory !== false,
            // 容量门（记忆库扩增/写门用；新键 capAgent 优先，回落旧 injectAgentMaxChars）
            cap_agent: typeof sched.capAgent === 'number' ? sched.capAgent : (typeof sched.injectAgentMaxChars === 'number' ? sched.injectAgentMaxChars : CAP_GATES['AGENT.md']),
            cap_user: typeof sched.capUser === 'number' ? sched.capUser : (typeof sched.injectUserMaxChars === 'number' ? sched.injectUserMaxChars : CAP_GATES['USER.md']),
            cap_memory: typeof sched.capMemory === 'number' ? sched.capMemory : (typeof sched.injectMemoryMaxChars === 'number' ? sched.injectMemoryMaxChars : CAP_GATES['MEMORY.md']),
            actual: { agent: fileChars('AGENT.md'), user: fileChars('USER.md'), memory: fileChars('MEMORY.md') },
            // v7 活性/遗忘/加深校准阈值（2026-09-10：/config 返回供 UI 渲染；缺省同 scheduler zod 默认 14/44/90/5/35）
            activityWarmDays: typeof sched.activityWarmDays === 'number' ? sched.activityWarmDays : 14,
            activityColdDays: typeof sched.activityColdDays === 'number' ? sched.activityColdDays : 44,
            activityArchiveDays: typeof sched.activityArchiveDays === 'number' ? sched.activityArchiveDays : 90,
            activityHotHits: typeof sched.activityHotHits === 'number' ? sched.activityHotHits : 5,
            recallColdFactorPercent: typeof sched.recallColdFactorPercent === 'number' ? sched.recallColdFactorPercent : 35,
        };
        // P2：无 root 也能调注入（全局 scheduler.json）——root 仅管理 boards 显示与旧 YAML；返回 global 供 UI 渲染
        if (!file)
            return sendJson(res, 200, { text: null, parsed: null, error: 'no-active-root', global: globalCfg });
        try {
            const text = readFileSync(file, 'utf8');
            // P1-2：注入配置全局值（scheduler.json）随 /config 返回——UI 渲染用全局（root YAML 的 injection 段已退役）
            sendJson(res, 200, {
                text, parsed: parseView(text), file, mtime: statMtime(file),
                global: globalCfg,
            });
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    route('/save', async (req, res) => {
        const body = await readBody(req);
        if (typeof body.text !== 'string')
            return sendJson(res, 400, { error: 'text required' });
        const file = configFileOf();
        if (!file)
            return sendJson(res, 400, { error: 'no-active-root' });
        try {
            backupThenWrite(file, body.text);
            ctx.logger?.info?.(`[shoucang] panel saved ${file}`);
            sendJson(res, 200, { ok: true, parsed: parseView(body.text) });
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    route('/toggle', async (req, res) => {
        const body = await readBody(req);
        const key = typeof body.key === 'string' ? body.key : '';
        const allowed = ['boards.memory', 'injection.hot_memory']; // 2026-09-10 收敛：archive/lifecycle/merge/scheduler 组为旧 Python 链路遗留，无消费端，已从面板移除
        if (!allowed.includes(key))
            return sendJson(res, 400, { error: `key 不允许：${key}` });
        if (key === 'injection.hot_memory') {
            // P1-2：hot_memory 注入总闸迁全局 scheduler.json（与注入配置同域）
            const cur = readSuiteConfig().hotMemory !== false; // 缺省 true
            writeSuiteConfig({ ...readSuiteConfig(), hotMemory: !cur });
            injectCache.at = 0;
            ctx.logger?.info?.(`[shoucang] panel toggled hotMemory=${!cur}（全局）`);
            return sendJson(res, 200, { ok: true, key, global: 'hotMemory', value: !cur });
        }
        // boards.memory：板块显示开关，保留 root config YAML
        const file = configFileOf();
        if (!file)
            return sendJson(res, 400, { error: 'no-active-root' });
        const fileKey = 'shoucang.' + key;
        let next;
        try {
            next = flipBool(readFileSync(file, 'utf8'), fileKey);
        }
        catch (e) {
            return sendJson(res, 500, { error: String(e) });
        }
        if (next === null)
            return sendJson(res, 500, { error: `未定位到布尔行：${key}` });
        backupThenWrite(file, next);
        injectCache.at = 0; // 注入缓存作废：toggle 立即反映到下一轮注入/预览
        ctx.logger?.info?.(`[shoucang] panel toggled ${key}`);
        sendJson(res, 200, { ok: true, parsed: parseView(next) });
    });
    // 设置标量值（枚举/数值/布尔）：{key, value}；key 白名单 + 枚举校验；写前备份
    route('/set', async (req, res) => {
        const body = await readBody(req);
        const key = typeof body.key === 'string' ? body.key : '';
        let value = typeof body.value === 'string' ? body.value.trim() : '';
        const allowed = {
            'injection.level': ['off', 'low', 'medium', 'high', 'smart'],
            'injection.persona': ['off', 'me', 'you', 'both'],
            // v16：注入板块容量上限（字符，0=不裁）；max_tokens 总预算已退役（2026-09-10）
            'injection.agent_max_chars': [],
            'injection.user_max_chars': [],
            'injection.memory_max_chars': [],
            // 2026-09-10：记忆库容量门（写门用，控制蒸馏/扩增规模）
            'injection.cap_agent': [],
            'injection.cap_user': [],
            'injection.cap_memory': [],
            // 2026-09-10 收敛：archive/lifecycle/merge 组键消费端为旧 Python 链路（_meta/*.py 已不随包分发），
            // 无真消费——保留只会误导用户。已从白名单移除（真蒸馏/归档走 scheduler.json 通道）。
            'embedding.dimension': [],
            // 2026-09-10：v7 活性/遗忘/加深校准阈值（数值类；scheduler zod 属性名同键，值=天/命中次数/百分比）
            'activityWarmDays': [],
            'activityColdDays': [],
            'activityArchiveDays': [],
            'activityHotHits': [],
            'recallColdFactorPercent': [],
        };
        // 数值范围校验（2026-09-10 收敛：仅注入组 + embedding.dimension；archive/lifecycle/merge 死键已随白名单移除）
        const RANGE = {
            // v16：板块容量上限范围（0=不裁，上限留足写门容量的 6 倍余量）
            'injection.agent_max_chars': [0, 20000],
            'injection.user_max_chars': [0, 20000],
            'injection.memory_max_chars': [0, 20000],
            'injection.cap_agent': [100, 30000],
            'injection.cap_user': [100, 30000],
            'injection.cap_memory': [100, 30000],
            'embedding.dimension': [16, 8192], // 常见嵌入维度范围
            // v7 活性/遗忘/加深校准阈值范围（同 scheduler zod min/max）
            'activityWarmDays': [1, 120], // active→warm 无命中天数
            'activityColdDays': [2, 365], // warm→cold 无命中天数
            'activityArchiveDays': [30, 730], // cold 且最近命中超此天数 → 遗忘候选
            'activityHotHits': [1, 50], // 近 30 天命中 ≥ 此值 → 加深候选 B
            'recallColdFactorPercent': [5, 95], // 召回降权系数（%）
        };
        if (!(key in allowed))
            return sendJson(res, 400, { error: `key 不允许：${key}` });
        if (!value)
            return sendJson(res, 400, { error: 'value required' });
        if (allowed[key].length && !allowed[key].includes(value))
            return sendJson(res, 400, { error: `枚举值非法：${key} ∈ ${allowed[key].join('|')}` });
        if (RANGE[key] && !(Number(value) >= RANGE[key][0] && Number(value) <= RANGE[key][1])) {
            return sendJson(res, 400, { error: `数值越界：${key} ∈ [${RANGE[key][0]}, ${RANGE[key][1]}]` });
        }
        // P1-2：注入配置落盘全局 scheduler.json（键映射 injection.* → inject*）；不再写 root config YAML
        const SCHED_KEY = {
            'injection.level': 'injectLevel',
            'injection.persona': 'injectPersona',
            'injection.agent_max_chars': 'injectAgentMaxChars',
            'injection.user_max_chars': 'injectUserMaxChars',
            'injection.memory_max_chars': 'injectMemoryMaxChars',
            // 2026-09-10：记忆库容量门（写门 SHOUCANG_CAP_* 源）
            'injection.cap_agent': 'capAgent',
            'injection.cap_user': 'capUser',
            'injection.cap_memory': 'capMemory',
            // v7 活性/遗忘/加深校准阈值：键名与 scheduler zod 属性名一致（数值 Number 化写入 scheduler.json 顶层）
            'activityWarmDays': 'activityWarmDays',
            'activityColdDays': 'activityColdDays',
            'activityArchiveDays': 'activityArchiveDays',
            'activityHotHits': 'activityHotHits',
            'recallColdFactorPercent': 'recallColdFactorPercent',
        };
        const schedKey = SCHED_KEY[key];
        if (!schedKey)
            return sendJson(res, 400, { error: `key 无全局映射：${key}` });
        const merged = { ...readSuiteConfig(), [schedKey]: key.startsWith('injection.level') || key.startsWith('injection.persona') ? value : (Number(value) || 0) };
        writeSuiteConfig(merged);
        injectCache.at = 0; // 注入缓存作废：改动立即反映到下一轮注入
        ctx.logger?.info?.(`[shoucang] panel set ${key}=${value}（全局 scheduler.json ${schedKey}）`);
        sendJson(res, 200, { ok: true, key, value, global: schedKey });
    });
    const memoryHomeOf = () => {
        const base = join(dshHome(), 'skills', 'managing-memory');
        return existsSync(base) ? base : null;
    };
    /* 守藏本地知识区（ADR-0002 阶段3 单飞切换后 = 蒸馏事实源宿主）：
     * $DSH_HOME/suite/knowledge —— 三索引 + notes 七类 + pending + audit，与记忆库同构。
     * 阶段4 UI 同步：panel 记忆视图双根（suite ∪ memory lib）+ 蒸馏统计卡（distill-audit.jsonl）。 */
    const suiteHomeOf = () => {
        const base = join(dshHome(), 'suite', 'knowledge');
        return existsSync(base) ? base : null;
    };
    /** 蒸馏统计卡聚合（suite/knowledge/audit/distill-audit.jsonl；全量汇总 + 尾部明细）。 */
    const distillStatsOf = () => {
        const base = suiteHomeOf();
        if (!base)
            return null;
        const full = join(base, 'audit', 'distill-audit.jsonl');
        let rows = [];
        try {
            rows = readFileSync(full, 'utf8').split('\n').filter(Boolean).map((l) => { try {
                return JSON.parse(l);
            }
            catch {
                return null;
            } }).filter((x) => !!x);
        }
        catch {
            rows = [];
        }
        const num = (v) => (typeof v === 'number' ? v : 0);
        const byRoute = {};
        // 近 7 日按日聚合（sparkline 趋势数据源；含空日补齐，前端画平线即"无活动"）
        const dayMap = new Map();
        const dayKey = (iso) => String(iso || '').slice(0, 10);
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
            dayMap.set(d, { runs: 0, added: 0 });
        }
        let runs = 0, added = 0, rejected = 0, failed = 0, gateRejects = 0, writeFails = 0;
        let last = null;
        for (const r of rows) {
            last = r;
            if (r.kind === 'gate-reject') {
                gateRejects++;
                continue;
            }
            if (r.kind === 'write-fail') {
                writeFails++;
                failed++;
                continue;
            }
            if (r.kind === 'distill-run') {
                runs++;
                added += num(r.added);
                rejected += num(r.rejected);
                failed += num(r.failed);
                const route = String(r.route || 'unknown');
                byRoute[route] = (byRoute[route] || 0) + 1;
                const k = dayKey(r.at);
                if (dayMap.has(k)) {
                    const e = dayMap.get(k);
                    e.runs++;
                    e.added += num(r.added);
                }
            }
        }
        const byDay = Array.from(dayMap.entries()).map(([day, v]) => ({ day, ...v }));
        return { runs, added, rejected, failed, gateRejects, writeFails, byRoute, byDay, last, recent: rows.slice(-5) };
    };
    const MEM_INDEX_FILES = [
        { file: 'MEMORY.md', label: '知识索引 MEMORY' },
        { file: 'USER.md', label: '用户画像 USER' },
        { file: 'AGENT.md', label: 'Agent 画像 AGENT（含 [原则] 习得原则与 [路径] 任务路径）' },
    ];
    const NOTE_RELS = ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent', 'INDEX'];
    /* ── 本机向量端点判定（2026-09-11：不再写死 9915）─────────────────────────
     * 背景：原实现把「本机嵌入服务」硬编码为 `:9915`（自建 bge-m3 桥，曾由 nssm 托管）；
     * nssm 卸载 + 桥的 ONNX 模型资产被清后，本机改由 Ollama（11434，OpenAI 兼容）承载。
     * 判定改为「任意 127.0.0.1/localhost 基址 = 本机」，探测顺序：/health（自建桥）→ <base>/models（OpenAI 兼容：Ollama/LM Studio）→ /api/tags（Ollama 原生）。
     * 同步探测（execFileSync 子进程）：/vector/status2 是同步 handler，且清 NODE_OPTIONS 防 inspector 残留干扰。
     */
    const isLocalBase = (baseUrl) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(String(baseUrl || '').trim());
    const probeLocalEmbed = (baseUrl) => {
        const base = String(baseUrl || '').trim().replace(/\/+$/, '');
        let origin = base;
        try {
            origin = new URL(base).origin;
        }
        catch {
            return { ok: false, provider: 'unreachable' };
        }
        const urls = [base + '/health', base + '/models', origin + '/api/tags'];
        const probe = `(async()=>{for(const x of ${JSON.stringify(urls)}){try{const r=await fetch(x,{signal:AbortSignal.timeout(2500)});if(r.ok){console.log(JSON.stringify({ok:true,url:x,body:(await r.text()).slice(0,200)}));return}}catch(e){}}console.log(JSON.stringify({ok:false}))})()`;
        try {
            const env2 = { ...process.env, NODE_OPTIONS: '' };
            const r = execFileSync('node', ['-e', probe], { encoding: 'utf8', timeout: 12000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: env2 });
            const j = JSON.parse(String(r).trim());
            if (!j.ok)
                return { ok: false, provider: 'unreachable' };
            const hit = String(j.url || '');
            // ① 自建桥 /health 自带 provider（如 DmlExecutionProvider）；②/③ 本机 OpenAI 兼容（Ollama /v1/models、LM Studio）或 Ollama 原生 → gpu-ready（=「本机就绪」，沿用 UI 既有词表）
            if (hit.endsWith('/health')) {
                try {
                    return { ok: true, provider: JSON.parse(String(j.body)).provider || 'local' };
                }
                catch {
                    return { ok: true, provider: 'local' };
                }
            }
            return { ok: true, provider: 'gpu-ready' };
        }
        catch {
            return { ok: false, provider: 'unreachable' };
        }
    };
    /**
     * 容量上限单一事实源（2026-09-10 修复：与写门同源）。
     * 优先级：① ~/.dsh/suite/scheduler.json 的容量门 capAgent/capUser/capMemory（= write_gate 的 env SHOUCANG_CAP_*，
     * 面板改容量门后 UI 立即联动）；② engine/target-registry.json 静态 capacity（旧源兼容）；③ 内建默认画像 3000 / 记忆 5000。
     */
    const memoryCaps = (base) => {
        const out = { 'MEMORY.md': 5000, 'USER.md': 3000, 'AGENT.md': 3000 };
        // ② 旧源：target-registry 静态容量
        try {
            const reg = JSON.parse(readFileSync(join(base, 'engine', 'target-registry.json'), 'utf8'));
            const cap = reg?.targets?.memory?.capacity;
            if (cap)
                for (const k of Object.keys(cap))
                    out[k] = cap[k];
        }
        catch { /* 回退默认容量 */ }
        // ① 权威：容量门配置（与 write_gate env 同源）——覆盖静态值，保证 UI 与写门一致
        try {
            const s = readSuiteConfig();
            if (typeof s.capMemory === 'number' && s.capMemory > 0)
                out['MEMORY.md'] = s.capMemory;
            if (typeof s.capUser === 'number' && s.capUser > 0)
                out['USER.md'] = s.capUser;
            if (typeof s.capAgent === 'number' && s.capAgent > 0)
                out['AGENT.md'] = s.capAgent;
        }
        catch { /* 配置不可读=用静态值 */ }
        return out;
    };
    /** 索引行：`[标签] 主题 · 概况 → notes/x.md §小节` */
    const parseIndexLines = (text) => {
        const out = [];
        for (const raw of text.split(/\r?\n/)) {
            const m = raw.match(/^\[([^\]]+)\]\s+(.+?)\s*→\s*(.+)$/);
            if (!m)
                continue;
            out.push({ tag: m[1].trim(), subject: m[2].trim(), pointer: m[3].trim(), raw });
        }
        return out;
    };
    const charsOf = (text) => text.replace(/\s+/g, '').length;
    const readIndexFile = (base, f, caps) => {
        try {
            const text = readFileSync(join(base, f.file), 'utf8');
            return { name: f.file, label: f.label, text, chars: charsOf(text), cap: caps[f.file] ?? 3000, lines: parseIndexLines(text) };
        }
        catch {
            return null;
        }
    };
    /** notes 文件小节清单（标题+起始行；不含正文，正文走 /memory/sections） */
    const notesSectionIndex = (base) => {
        const out = [];
        for (const w of NOTE_RELS) {
            const full = join(base, 'notes', w + '.md');
            if (!existsSync(full))
                continue;
            const text = readFileSync(full, 'utf8');
            const sections = [];
            text.split(/\r?\n/).forEach((l, i) => { const m = l.match(/^##\s+(.+)$/); if (m)
                sections.push({ title: m[1].trim(), line: i + 1 }); });
            out.push({ rel: 'notes/' + w + '.md', name: w + '.md', sections });
        }
        return out;
    };
    const readJsonlTail = (full, n) => {
        try {
            return readFileSync(full, 'utf8').split('\n').filter(Boolean).slice(-n).map((l) => { try {
                return JSON.parse(l);
            }
            catch {
                return null;
            } }).filter((x) => !!x);
        }
        catch {
            return [];
        }
    };
    // 记忆库总览（一次取回：索引+容量+pending+蒸馏水位+notes 小节索引；全部只读）
    // 阶段4：双根同构读取（memory lib + suite/knowledge）+ 蒸馏统计卡聚合。
    // 路线③ 月度成长聚合（纯读、零定时器）：审计按月汇总 + AGENT 画像现状快照（「人格在长」可见物 + 一致性度量载体）
    const growthOf = (monthStr) => {
        const now = new Date();
        const month = monthStr || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const out = { month };
        let sleepPass = 0, principleAdded = 0, principleReplaced = 0, sleepSkipped = 0, profilesAdded = 0, sleepErr = 0;
        let runs = 0, okRuns = 0, badRuns = 0, distSkip = 0;
        const recentDeep = [];
        try {
            for (const l of readFileSync(join(knowledgeRoot(), 'audit', 'distill-audit.jsonl'), 'utf8').split('\n')) {
                if (!l.trim())
                    continue;
                try {
                    const o = JSON.parse(l);
                    if (!String(o.at || '').startsWith(month))
                        continue;
                    const kind = o.kind;
                    if (kind === 'deep-sleep') {
                        if (typeof o.stop === 'string') {
                            sleepPass++;
                            principleAdded += Number(o.added) || 0;
                            principleReplaced += Number(o.replaced) || 0;
                            sleepSkipped += Number(o.skipped) || 0;
                            profilesAdded += Number(o.profiles) || 0;
                            if ((o.added || o.replaced || o.profiles))
                                recentDeep.push({ at: o.at, added: o.added, replaced: o.replaced, profiles: o.profiles, gate: o.gate });
                        }
                        else
                            sleepErr++;
                    }
                    else if (kind === 'distill-run' && typeof o.stop === 'string') {
                        runs++;
                        if (o.stop === 'completed')
                            okRuns++;
                        else
                            badRuns++;
                    }
                    else if (kind === 'distill-skip')
                        distSkip++;
                }
                catch { /* 坏行跳过 */ }
            }
        }
        catch { /* 无审计=新装 */ }
        let tagRows = 0, principleRows = 0, pathRows = 0, agentChars = 0;
        const base = memoryHomeOf();
        if (base) {
            try {
                const txt = readFileSync(join(base, 'AGENT.md'), 'utf8');
                agentChars = txt.replace(/\s/g, '').length;
                for (const l of txt.split(/\r?\n/)) {
                    const m = l.match(/^\[([^\] ]+)\]/);
                    if (m) {
                        tagRows++;
                        if (m[1] === '原则')
                            principleRows++;
                        if (m[1] === '路径')
                            pathRows++;
                    }
                }
            }
            catch { /* */ }
        }
        return {
            month,
            sleep: { passes: sleepPass, principleAdded, replaced: principleReplaced, skipped: sleepSkipped, profilesAdded, errors: sleepErr },
            distill: { runs, ok: okRuns, bad: badRuns, skips: distSkip },
            now: { agentChars, tagRows, principleRows, pathRows },
            recentDeep: recentDeep.slice(-5),
        };
    };
    const memOverviewOf = (base) => {
        const caps = memoryCaps(base);
        const indexes = MEM_INDEX_FILES.map((f) => readIndexFile(base, f, caps)).filter(Boolean);
        let pendingCount = 0;
        let pendingMeta = {};
        const pendingRecent = [];
        try {
            const pendDir = join(base, 'pending');
            const nowMs = Date.now();
            const names = readdirSync(pendDir, { withFileTypes: true })
                .filter((e) => e.isFile() && e.name.endsWith('.md'))
                .map((e) => e.name)
                .sort((a, b) => statMtime(join(pendDir, b)).localeCompare(statMtime(join(pendDir, a))));
            pendingCount = names.length;
            // 24h 内新增数（趋势语境：候选正在被消化=减少，新增快于消化=增长）
            let last24h = 0;
            for (const n of names) {
                try {
                    if (nowMs - new Date(statMtime(join(pendDir, n))).getTime() < 86400000)
                        last24h++;
                }
                catch { /* 跳过 */ }
            }
            for (const n of names.slice(0, 8))
                pendingRecent.push({ name: n, mtime: statMtime(join(pendDir, n)) });
            pendingMeta = { last24h };
        }
        catch { /* pending 缺失 */ }
        const watermark = readJsonlTail(join(base, 'audit', 'distill-watermark.jsonl'), 5);
        return {
            root: base,
            indexes,
            pending: { count: pendingCount, ...pendingMeta, recent: pendingRecent },
            distill: { recent: watermark, last: watermark[watermark.length - 1] ?? null },
            notes: notesSectionIndex(base),
        };
    };
    route('/memory/overview', (_req, res) => {
        const base = memoryHomeOf();
        if (!base)
            return sendJson(res, 200, { present: false, error: '未检测到记忆库技能仓（~/.dsh/skills/managing-memory）——记忆插件蒸馏事实源不在本机默认位' });
        try {
            const mem = memOverviewOf(base);
            const suiteBase = suiteHomeOf();
            const suite = suiteBase ? memOverviewOf(suiteBase) : null;
            const undone = (() => {
                try {
                    return readFileSync(join(base, 'audit', 'archive-progress.jsonl'), 'utf8').split('\n')
                        .filter((l) => { try {
                        return l.trim() && JSON.parse(l).done === false;
                    }
                    catch {
                        return false;
                    } })
                        .length;
                }
                catch {
                    return 0;
                }
            })();
            // U3：delta（晨起摘要，结构版）——读 suite/knowledge/delta.md
            const delta = (() => {
                try {
                    const f = join(knowledgeRoot(), 'delta.md');
                    if (!existsSync(f))
                        return { present: false };
                    const o = JSON.parse(readFileSync(f, 'utf8'));
                    return { present: true, staleAt: o.staleAt, rows: (o.rows || []).slice(0, 3), injections: o.injections || 0 };
                }
                catch {
                    return { present: false };
                }
            })();
            // U3：向量简态（复用 status2 同源计算；供记忆板块 §7 展示，省一次轮询）
            const vectorMini = (() => {
                try {
                    const p = readSuiteConfig();
                    const enabled = p.embedEnabled === false ? false : true;
                    const baseUrl = String(p.embedBaseUrl || 'http://127.0.0.1:11434/v1');
                    let provider = enabled ? 'cloud' : 'off';
                    let cacheLines = 0;
                    try {
                        const f = join(knowledgeRoot(), '.vector-cache.jsonl');
                        if (existsSync(f))
                            cacheLines = readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length;
                    }
                    catch { /* */ }
                    if (enabled && isLocalBase(baseUrl))
                        provider = vecStats.queries ? (vecStats.lastMode === 'fusion' ? 'fusion' : 'lexical') : 'gpu-ready';
                    return { enabled, provider, cacheLines };
                }
                catch {
                    return { enabled: false, provider: 'off', cacheLines: 0 };
                }
            })();
            // U3：周 diff（成长增量）——从 distill-audit 聚合近 7 天 [原则]/[路径] 落点（episodes + audit）
            const weekDiff = (() => {
                const added = [], removed = [];
                let deepAdded = 0;
                try {
                    const since = Date.now() - 7 * 86400e3;
                    const f = join(knowledgeRoot(), 'audit', 'distill-audit.jsonl');
                    if (existsSync(f)) {
                        for (const l of readFileSync(f, 'utf8').split('\n')) {
                            if (!l.trim())
                                continue;
                            try {
                                const o = JSON.parse(l);
                                if (o.at && Date.parse(o.at) >= since) {
                                    if (o.kind === 'deep-sleep' && o.added)
                                        deepAdded += Number(o.added) || 0;
                                }
                            }
                            catch { /* 坏行 */ }
                        }
                    }
                }
                catch { /* 无审计 */ }
                return { added, removed, deepAdded };
            })();
            sendJson(res, 200, {
                present: true,
                ...mem,
                // 蒸馏唯一权归守藏（ADR-0002 阶段3）：水位语义 = suite 活水位（记忆库根 watermark 已冻结为历史值）
                distill: suite ? suite.distill : mem.distill,
                queue: { undone },
                suite: suite ? { present: true, ...suite } : { present: false },
                distillStats: distillStatsOf(),
                growth: growthOf(),
                delta,
                vector: vectorMini,
                weekDiff,
                now: new Date().toISOString(),
            });
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    // notes 小节正文（按 ## 切片；白名单 rel；只读）
    route('/memory/sections', (req, res) => {
        let rootParam = '';
        let rel = '';
        try {
            const sp = new URL(req.url ?? '/', 'http://dsh.local').searchParams;
            rel = sp.get('rel') ?? '';
            rootParam = sp.get('root') ?? 'memory';
        }
        catch { /* noop */ }
        // 阶段4 双根：root=suite → 守藏本地知识区；root=memory（缺省）→ 记忆库
        const base = rootParam === 'suite' ? suiteHomeOf() : memoryHomeOf();
        if (!base)
            return sendJson(res, 200, { present: false, error: rootParam === 'suite' ? '未检测到守藏本地知识区（~/.dsh/suite/knowledge）' : '未检测到记忆库技能仓' });
        if (!new RegExp(`^notes/(${NOTE_RELS.join('|')})\\.md$`).test(rel))
            return sendJson(res, 400, { error: 'bad rel' });
        const abs = join(base, rel);
        if (!existsSync(abs))
            return sendJson(res, 404, { error: 'note not found' });
        try {
            const text = readFileSync(abs, 'utf8');
            const lines = text.split(/\r?\n/);
            const sections = [];
            const stack = [];
            const heading = (l) => {
                const m = l.match(/^(#{1,6})\s+(.+)$/);
                return m ? { level: m[1].length, title: m[2].trim() } : null;
            };
            const flush = () => {
                while (stack.length) {
                    const top = stack.pop();
                    top.node.body = top.body.join('\n').trim();
                    if (stack.length)
                        stack[stack.length - 1].node.children.push(top.node);
                    else
                        sections.push(top.node);
                }
            };
            for (let i = 0; i < lines.length; i++) {
                const h = heading(lines[i]);
                if (h && h.level >= 2) { // 记忆小节从 ## 起（# 是文件标题）
                    // 弹栈到父层级（level-1 的标题）
                    while (stack.length && stack[stack.length - 1].node.titleLevel >= h.level) {
                        const top = stack.pop();
                        top.node.body = top.body.join('\n').trim();
                        if (stack.length)
                            stack[stack.length - 1].node.children.push(top.node);
                        else
                            sections.push(top.node);
                    }
                    const node = { title: h.title, titleLevel: h.level, line: i + 1, body: '', children: [] };
                    stack.push({ node, body: [] });
                }
                else if (stack.length) {
                    stack[stack.length - 1].body.push(lines[i]);
                }
            }
            flush();
            // U3：反链聚合（Logseq/思源借鉴）——扫三索引 + notes 全文，找指向「本文件 §小节」的引用行
            const backrefs = [];
            try {
                const relStem = rel.replace(/^notes\//, '').replace(/\.md$/, '');
                const scanFiles = ['MEMORY.md', 'USER.md', 'AGENT.md', ...NOTE_RELS.filter((w) => w !== 'INDEX').map((w) => `notes/${w}.md`)];
                const sectionTitles = new Set(sections.map((s) => s.title.replace(/\s*（20\d{2}.*）\s*$/, '').trim()));
                for (const sf of scanFiles) {
                    const sfAbs = join(base, sf);
                    if (!existsSync(sfAbs) || sfAbs === abs)
                        continue;
                    const raw = readFileSync(sfAbs, 'utf8');
                    for (const l of raw.split(/\r?\n/)) {
                        const t = l.trim();
                        if (!/notes\/[A-Za-z0-9_-]+\.md\s*§/.test(t))
                            continue;
                        // 指向本文件？
                        if (!t.includes(`notes/${relStem}.md`) && !t.includes(relStem + '.md'))
                            continue;
                        const cited = (t.match(/notes\/[A-Za-z0-9_-]+\.md\s*§(.+)$/) || [])[1] || '';
                        const hits = cited.split('/').some((s) => { const kw = s.replace(/^§/, '').trim(); if (!kw)
                            return false; const tl = kw; return [...sectionTitles].some((st) => st === tl || st.includes(tl) || tl.includes(st)); });
                        if (hits || !cited)
                            backrefs.push({ from: sf.replace(/\.md$/, ''), line: t.slice(0, 120) });
                    }
                }
            }
            catch { /* 反链扫描失败不阻塞正文 */ }
            sendJson(res, 200, { present: true, root: rootParam, rel, name: rel.split('/').pop() ?? '', text, sections, backrefs: backrefs.slice(0, 20) });
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    /* ---------- 插件集合视图（suite 装配状态，只读；算法单一实现=targets.suiteAssemblyMatrix，
     * 经 schedulerShare 惰性桥接读取——panel 不再有本地成员表/扫描副本（2026-09-09 审查修复：
     * 此前本地硬编码 memory+governance 两成员，governance 已随 pmg 移除，属假数据漂移）） ---------- */
    // 插件集合装配状态（只读；client「插件集合」视图数据源）
    route('/suite', (_req, res) => {
        try {
            const api = schedulerShare.api;
            if (!api)
                return sendJson(res, 200, { members: [], summary: '调度器未就绪（suite 矩阵经 scheduler-share 桥接；空成员=如实空态）' });
            sendJson(res, 200, api.suiteScan());
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    // ── v9 认知可视化（2026-09-11）：**单端点**服务「睡眠」与「记忆」两视图 ——
    //    ① 深睡历次回执（audit kind=deep-sleep：产出条数 / 树操作 / forgetOps 归档 / stop 原因）
    //    ② 下轮材料预估（activity 当日产出的遗忘候选 / 加深候选 / 互抑候选）
    //    ③ 记忆冷热分布 + 覆盖率（activity.jsonl 跟踪数 ÷ 三主档索引行数）
    //    ④ 超 R 节清单（§8.1 口径：## 按子树、### 按自身，R=1000）
    //    ⑤ 归档区（forgetOps 产物 notes/archive/）
    //    全部只读派生、无写入；缺文件一律如实空态（不编造）。
    route('/cognition/report', (_req, res) => {
        try {
            const root = memoryLibRoot();
            const auditDir = join(root, 'audit');
            const d0 = new Date();
            const p2 = (n) => String(n).padStart(2, '0');
            const dk = `${d0.getFullYear()}-${p2(d0.getMonth() + 1)}-${p2(d0.getDate())}`;
            const sleeps = [];
            try {
                const f = join(knowledgeRoot(), 'audit', 'distill-audit.jsonl');
                if (existsSync(f)) {
                    for (const l of readFileSync(f, 'utf8').split('\n')) {
                        if (!l.trim() || !l.includes('deep-sleep'))
                            continue;
                        try {
                            const o = JSON.parse(l);
                            if (o.kind !== 'deep-sleep')
                                continue;
                            sleeps.push({
                                at: o.at || o.ts || o.time || null, stop: o.stop || null, gate: o.gate || null,
                                added: Number(o.added || 0), replaced: Number(o.replaced || 0), skipped: Number(o.skipped || 0),
                                profiles: Number(o.profiles || 0), pointers: Number(o.pointers || 0), tree: Number(o.tree || 0),
                                forgetArchived: Number(o.forgetArchived || 0), forgetKept: Number(o.forgetKept || 0),
                            });
                        }
                        catch { /* 坏行跳过 */ }
                    }
                }
            }
            catch { /* 无审计文件 = 空态 */ }
            const numFrom = (p) => { try {
                const m = readFileSync(p, 'utf8').match(/共 (\d+) 条/);
                return m ? Number(m[1]) : 0;
            }
            catch {
                return 0;
            } };
            const rowsIn = (p) => { try {
                return Math.max(0, readFileSync(p, 'utf8').split('\n').filter((x) => x.startsWith('|')).length - 2);
            }
            catch {
                return 0;
            } };
            const act = [];
            try {
                for (const l of readFileSync(join(auditDir, 'activity.jsonl'), 'utf8').split('\n')) {
                    if (!l.trim())
                        continue;
                    try {
                        act.push(JSON.parse(l));
                    }
                    catch { /* 坏行跳过 */ }
                }
            }
            catch { /* 空态 */ }
            const byStatus = { active: 0, warm: 0, cold: 0, retired: 0 };
            for (const r of act) {
                const k = r.retired ? 'retired' : String(r.status || 'cold');
                if (byStatus[k] !== undefined)
                    byStatus[k]++;
            }
            let idxRows = 0;
            for (const n of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
                try {
                    idxRows += readFileSync(join(root, n), 'utf8').split('\n').filter((l) => /^\s*\[/.test(l)).length;
                }
                catch { /* 缺件跳过 */ }
            }
            const R = 1000;
            const overR = [];
            try {
                const own = (b) => b.split('\n').slice(1).join('\n').replace(/\s/g, '').length;
                for (const nf of readdirSync(join(root, 'notes'))) {
                    if (!/\.md$/i.test(nf) || /^INDEX/i.test(nf))
                        continue;
                    const raw = readFileSync(join(root, 'notes', nf), 'utf8');
                    const short = nf.replace(/\.md$/, '');
                    const title = (b) => b.split('\n')[0].replace(/^#+\s*/, '').replace(/（[^）]*）\s*$/, '').trim();
                    for (const b of raw.split(/^(?=## )/m).filter((x) => /^## /.test(x))) {
                        const s = own(b);
                        if (s > R)
                            overR.push({ lvl: 2, name: `${short} §${title(b)}`, chars: s });
                    }
                    for (const b of raw.split(/^(?=#{2,3} )/m).filter((x) => /^### /.test(x))) {
                        const s = own(b);
                        if (s > R)
                            overR.push({ lvl: 3, name: `${short} §${title(b)}`, chars: s });
                    }
                }
            }
            catch { /* 空态 */ }
            let archive = [];
            try {
                const ad = join(root, 'notes', 'archive');
                if (existsSync(ad)) {
                    archive = readdirSync(ad).filter((f) => /\.md$/i.test(f)).map((f) => ({ file: f, chars: readFileSync(join(ad, f), 'utf8').replace(/\s/g, '').length }));
                }
            }
            catch { /* 空态 */ }
            sendJson(res, 200, {
                ok: true, day: dk,
                sleeps: sleeps.slice(-20),
                materials: {
                    forget: numFrom(join(auditDir, `activity-candidates-${dk}.md`)),
                    hot: numFrom(join(auditDir, `activity-hot-${dk}.md`)),
                    interference: rowsIn(join(auditDir, `activity-interference-${dk}.md`)),
                },
                activity: { byStatus, tracked: act.length, idxRows, coverage: idxRows ? Math.round(act.length / idxRows * 100) : 0 },
                overR: overR.sort((a, b) => b.chars - a.chars),
                archive,
            });
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    // LLM 模型清单（2026-09-10：直接用 Harness 模型体系——蒸馏/深睡模型下拉数据源，经 scheduler-share 桥）
    route('/llm/models', async (_req, res) => {
        try {
            const api = schedulerShare.api;
            if (!api || typeof api.llmModels !== 'function')
                return sendJson(res, 200, { models: [], note: '调度器未就绪（llmModels 桥不可用）' });
            const models = await api.llmModels();
            sendJson(res, 200, { models });
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    /* ---------- 深度睡眠状态机（T1/T2 面板视图数据源；跨插件经 deepSleepShare 惰性桥接） ----------
     * scheduler.registerDistill 在启动期把 { getStatus, runNow, getConfig } 挂到 deepSleepShare.api；
     * 此处请求时读取（此时 scheduler 必然已就绪）。蒸馏器未启用/未就绪 → 返回未激活态，不报错。 */
    // 自持配置通道（与 scheduler.applySuiteConfigFile 同源）：~/.dsh/suite/scheduler.json
    const suiteConfigPath = () => join(dshHome(), 'suite', 'scheduler.json');
    const readSuiteConfig = () => {
        try {
            const f = suiteConfigPath();
            if (!existsSync(f))
                return {};
            const raw = JSON.parse(readFileSync(f, 'utf8'));
            return raw && typeof raw === 'object' ? raw : {};
        }
        catch {
            return {};
        }
    };
    // 原子写（同目录 tmp + renameSync）+ 备份先行，零硬编码路径
    const writeSuiteConfig = (obj) => {
        const f = suiteConfigPath();
        mkdirSync(dirname(f), { recursive: true });
        if (existsSync(f)) {
            const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
            try {
                writeFileSync(`${f}.bak-${stamp}`, readFileSync(f));
            }
            catch { /* 首次无备份 */ }
        }
        const tmp = join(tmpdir(), 'shoucang-suite-cfg-' + Date.now() + '.json');
        writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
        renameSync(tmp, f);
    };
    /** 深度睡眠配置键校验（与 scheduler.Config 同约束）；返回错误串或 null */
    const validateDeepSleepConfig = (c) => {
        if ('enableDeepSleep' in c && typeof c.enableDeepSleep !== 'boolean')
            return 'enableDeepSleep 须为布尔';
        if ('deepSleepProbe' in c && typeof c.deepSleepProbe !== 'boolean')
            return 'deepSleepProbe 须为布尔';
        if ('deepSleepIdleMs' in c) {
            const n = Number(c.deepSleepIdleMs);
            if (!Number.isFinite(n) || n < 600000)
                return 'deepSleepIdleMs 须 ≥ 600000（10 分钟）';
        }
        if ('deepSleepProbeAfterMs' in c) {
            const n = Number(c.deepSleepProbeAfterMs);
            if (!Number.isFinite(n) || n < 600000)
                return 'deepSleepProbeAfterMs 须 ≥ 600000（10 分钟）';
        }
        if ('deepSleepProbeWindowMs' in c) {
            const n = Number(c.deepSleepProbeWindowMs);
            if (!Number.isFinite(n) || n < 5000)
                return 'deepSleepProbeWindowMs 须 ≥ 5000（5 秒）';
        }
        return null;
    };
    /** 蒸馏节流组键（键名同 scheduler.Config；UI 通道写入 ~/.dsh/suite/scheduler.json，重载生效） */
    const DISTILL_CONFIG_KEYS = ['enableDistill', 'idleWakeMs', 'minTurnChars', 'distillPrescan', 'llmProvider', 'llmModel', 'distillProvider', 'distillModel', 'sleepProvider', 'sleepModel'];
    /** 蒸馏节流组配置键校验（与 scheduler.Config 同约束）；返回错误串或 null */
    const validateDistillConfig = (c) => {
        if ('enableDistill' in c && typeof c.enableDistill !== 'boolean')
            return 'enableDistill 须为布尔';
        if ('distillPrescan' in c && typeof c.distillPrescan !== 'boolean')
            return 'distillPrescan 须为布尔';
        if ('idleWakeMs' in c) {
            const n = Number(c.idleWakeMs);
            if (!Number.isFinite(n) || n < 60000)
                return 'idleWakeMs 须 ≥ 60000（1 分钟）';
        }
        if ('minTurnChars' in c) {
            const n = Number(c.minTurnChars);
            if (!Number.isFinite(n) || n < 0)
                return 'minTurnChars 须 ≥ 0';
        }
        if ('llmProvider' in c && typeof c.llmProvider !== 'string')
            return 'llmProvider 须为字符串';
        if ('llmModel' in c && typeof c.llmModel !== 'string')
            return 'llmModel 须为字符串';
        if ('distillProvider' in c && typeof c.distillProvider !== 'string')
            return 'distillProvider 须为字符串';
        if ('distillModel' in c && typeof c.distillModel !== 'string')
            return 'distillModel 须为字符串';
        if ('sleepProvider' in c && typeof c.sleepProvider !== 'string')
            return 'sleepProvider 须为字符串';
        if ('sleepModel' in c && typeof c.sleepModel !== 'string')
            return 'sleepModel 须为字符串';
        return null;
    };
    // GET /deepsleep：状态机快照（T1 状态机 + T2 计时展示）
    route('/deepsleep', (_req, res) => {
        try {
            if (!deepSleepShare.api)
                return sendJson(res, 200, { active: false, reason: 'distill-not-ready' });
            sendJson(res, 200, { active: true, ...deepSleepShare.api.getDeepSleepStatus() });
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    // POST /deepsleep/trigger：手动触发一次深度睡眠归纳（T2「立即归纳一次」）
    route('/deepsleep/trigger', async (_req, res) => {
        try {
            if (!deepSleepShare.api)
                return sendJson(res, 400, { ok: false, error: 'distill-not-ready' });
            const r = await deepSleepShare.api.runDeepSleepNow();
            sendJson(res, r.ok ? 200 : 409, r);
        }
        catch (e) {
            sendJson(res, 500, { ok: false, error: String(e) });
        }
    });
    // POST /distill/run：手动触发一轮蒸馏（2026-09-10：pending 回流闭环——遍历根会话蒸馏携带候选）
    route('/distill/run', async (_req, res) => {
        try {
            if (!deepSleepShare.api || typeof deepSleepShare.api.runDistillNow !== 'function')
                return sendJson(res, 400, { ok: false, error: 'distill-not-ready' });
            const r = await deepSleepShare.api.runDistillNow();
            sendJson(res, r.ok ? 200 : 409, r);
        }
        catch (e) {
            sendJson(res, 500, { ok: false, error: String(e) });
        }
    });
    // /deepsleep/config：GET 读取运行中配置（T2「可调」展示源）／POST 校验并写入自持配置文件
    // 注意：宿主按路径去重，GET 与 POST 必须合并为同一 handler 按 method 分发（拆分注册会导致插件树加载失败）。
    route('/deepsleep/config', async (req, res) => {
        try {
            if (req.method === 'POST') {
                const body = (await readBody(req).catch(() => ({})));
                const patch = {};
                for (const k of ['enableDeepSleep', 'deepSleepProbe', 'deepSleepIdleMs', 'deepSleepProbeAfterMs', 'deepSleepProbeWindowMs']) {
                    if (k in body)
                        patch[k] = body[k];
                }
                if (!Object.keys(patch).length)
                    return sendJson(res, 400, { error: 'no-deep-sleep-keys' });
                const err = validateDeepSleepConfig(patch);
                if (err)
                    return sendJson(res, 400, { error: err });
                const merged = { ...readSuiteConfig(), ...patch };
                writeSuiteConfig(merged);
                ctx.logger?.info?.(`[shoucang] deep-sleep config updated: ${Object.keys(patch).join(',')}`);
                return sendJson(res, 200, { ok: true, merged });
            }
            if (deepSleepShare.api)
                return sendJson(res, 200, { active: true, running: deepSleepShare.api.getConfig(), persisted: readSuiteConfig() });
            // 未就绪：退化为读取自持配置文件（至少给出现有持久值）
            sendJson(res, 200, { active: false, running: null, persisted: readSuiteConfig() });
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    // /distill/config：蒸馏节流组持久通道（GET 展示运行时值+持久值／POST 校验写入 ~/.dsh/suite/scheduler.json）
    // 背景：这几个键有 schemastery Config 但不持久（注入插件不进 loader 配置持久化），此前只能手写 JSON。
    // 同 /deepsleep/config：GET 与 POST 必须合并为同一 handler 按 method 分发（拆分注册会拖垮整个插件树）。
    // 注意：写入的是自持配置文件，scheduler 启动时才覆盖 config 缺省 → **改动需重载生效**（UI 已明示）。
    route('/distill/config', async (req, res) => {
        try {
            if (req.method === 'POST') {
                const body = (await readBody(req).catch(() => ({})));
                const patch = {};
                for (const k of DISTILL_CONFIG_KEYS)
                    if (k in body)
                        patch[k] = body[k];
                if (!Object.keys(patch).length)
                    return sendJson(res, 400, { error: 'no-distill-keys' });
                const err = validateDistillConfig(patch);
                if (err)
                    return sendJson(res, 400, { error: err });
                const merged = { ...readSuiteConfig(), ...patch };
                writeSuiteConfig(merged);
                ctx.logger?.info?.(`[shoucang] distill config updated: ${Object.keys(patch).join(',')}（重载后生效）`);
                return sendJson(res, 200, { ok: true, merged, reloadRequired: true });
            }
            const running = schedulerShare.api ? schedulerShare.api.distillConfig() : null;
            sendJson(res, 200, { active: !!schedulerShare.api, running, persisted: readSuiteConfig() });
        }
        catch (e) {
            sendJson(res, 500, { error: String(e) });
        }
    });
    // R1 热记忆注入预览（排障/验证用，只读）；`?q=<任务文本>` 可验证相关性选行（ACT-027）
    route('/inject/preview', (req, res) => {
        let q = '';
        try {
            q = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('q') ?? '';
        }
        catch {
            q = '';
        }
        sendJson(res, 200, { text: buildHotMemoryText(q), q });
    });
    // 注入装配统计：每轮提示词渲染调用 +1（验证新会话/每轮注入）
    route('/inject/stats', (_req, res) => {
        sendJson(res, 200, { calls: injectMeta.calls, lastAt: injectMeta.lastAt ? new Date(injectMeta.lastAt).toISOString() : null, root: activeRootOf()?.path ?? null });
    });
    /* ---------- /scnote 命令：任务执行并整理为笔记文档（2026-08-27） ---------- */
    const scnoteReply = (raw) => {
        const task = (raw || '').trim();
        if (!task || task.startsWith('help') || task === '?') {
            return { kind: 'error', text: '用法：/scnote <任务描述>\n示例：/scnote 调研 DeepSeek V4 能力边界\n调用后本回合以“笔记化”方式执行任务，结束前把执行过程整理为 笔记/ 文档。' };
        }
        return {
            kind: 'success',
            text: [
                '【守藏·笔记化任务】已进入笔记化执行模式。',
                '',
                `任务：${task}`,
                '',
                '执行要求：',
                '0. 合规红线：本任务所有写入必须遵循目标目录 `_index.md` 的「目录文件规范」段——它是该目录的格式权威（frontmatter/命名/正文/维护）；**先读取目标目录 `_index.md` 再执行**；',
                '1. 执行任务（网络检索类优先 web_search/advanced_search + read_page 读原文并注明来源）；',
                '2. 任务完成后，把本次执行过程整理为一篇笔记文档（按 笔记/_index.md 与目标目录 _index.md 的规范）：',
                '   - 落位：笔记/<域>/（冷层·蒸馏来源；不符现有域 → **扩展目录类型须先网络检索**（web_search/read_page）补全新子目录 _index.md 的「目录文件规范」块，复用归档检索扩容方式 `index_rules.py --ensure-researched 笔记 <域> --summary <检索结论>`，然后建目录+登记父 `笔记/_index.md`（备份先行、幂等）；**禁止不检索直接扩展**）',
                '   - 文件：type: note；name 主-宾-谓 kebab-case；frontmatter 必含 type/name/title/tags/source/created/updated/description（与目标 _index.md 规范一致）',
                '   - 正文：自己的话提炼、单主题、来源归因（列出本次检索到的链接）、≥150 字；必做双链 [[wiki-link]]（与相关记忆/画像条目互链）',
                '   - 维护：目录指针表由写门自动投影（落库后 `_meta/gen_pointer_tables.py` 重建目标目录 _index 索引区），**无需手工登记指针行**；',
                '   - **合并写门（合并去重设计-v1）**：落库前先运行 `python _meta/merge_check.py <落库文件> --dir <目标目录> --apply` —— 重复→并入既有条目（不新建）、改版/矛盾→时序 supersede（旧条目标记不删）、无命中→正常新建；落库后写门自动投影指针（无需再登记）',
                '3. 完成后回复：笔记相对路径 + 一句摘要 + 来源链接数。',
            ].join('\n'),
        };
    };
    const cmds = ctx.commands;
    if (cmds && typeof cmds.register === 'function') {
        cmds.register({
            name: 'scnote',
            description: '以“笔记化”方式执行任务，并把执行过程整理为 笔记/ 文档（典型：网络检索/调研）',
            input: { hint: '<任务描述，如：调研 XXX>', images: false },
            handler: (invocation) => scnoteReply(invocation?.rawInput ?? ''),
        });
        ctx.logger?.info?.('[shoucang] /scnote 命令已注册');
    }
    else {
        ctx.logger?.warn?.('[shoucang] commands 能力不可用，/scnote 未注册');
    }
    ctx.effect(() => {
        ctx.logger?.info?.('[shoucang] host RPC ready: roots(roots|get_root|set_root|bootstrap)/config(save|toggle|set)/memory(overview|sections|section-edit|edit|remove|approve)/suite/cognition-report/deepsleep(status|trigger|config)/distill(run|config)/vector(status2|cache-clear)/embed(config|test)/llm-models/inject(preview|stats)');
        // 注册 systemPrompt 注入块（每轮渲染，指针缓存 30s）
        const sp = ctx.systemPrompt;
        if (sp && typeof sp.context === 'function') {
            // 任务文本：`dsh-system-prompt:346` 会把 assembly context 传给 text 回调，其中含 `context.agent.session`；
            // 取最近一条 user/message 作相关性 query。取不到即空串 ⇒ 选行回退位置式，不影响可用性（ACT-027）。
            const taskTextOf = (context) => {
                try {
                    const evs = context
                        ?.agent?.session?.snapshotEvents?.();
                    if (!Array.isArray(evs))
                        return '';
                    for (let i = evs.length - 1; i >= 0; i--) {
                        const e = evs[i];
                        if (e?.type !== 'user/message')
                            continue;
                        const txt = (e.data?.content || []).map((b) => (typeof b?.text === 'string' ? b.text : '')).join(' ').trim();
                        if (txt)
                            return txt.slice(0, 300);
                    }
                }
                catch { /* 取不到=空 query */ }
                return '';
            };
            disposers.push(sp.context({
                name: 'shoucang-hot-memory',
                order: 88, // mneme: user-settings=85 / memory=90 —— 守藏热记忆在其间
                text: (context) => { injectMeta.calls++; injectMeta.lastAt = Date.now(); return buildHotMemoryText(taskTextOf(context)); },
            }));
            ctx.logger?.info?.('[shoucang] R1 热记忆注入挂点已注册 (systemPrompt.context: shoucang-hot-memory)');
        }
        else {
            ctx.logger?.warn?.('[shoucang] systemPrompt 能力不可用，R1 热记忆注入未注册');
        }
        // ── 空闲巩固轮（Letta-heartbeat 模式 · 2026-08-27）：蒸馏/合并/归档/结算 一体化 ──
        const _cfgOf = () => {
            const f = configFileOf();
            if (!f || !existsSync(f))
                return null;
            try {
                return { cfg: parseView(readFileSync(f, 'utf8')), file: f };
            }
            catch {
                return null;
            }
        };
        route('/vector/status2', (_req, res) => {
            try {
                const p = readSuiteConfig();
                // 缺省语义对齐 scheduler.Config：embedEnabled 缺省 true、本地 bge-m3（无键=缺省开）
                const enabled = p.embedEnabled === false ? false : true;
                const baseUrl = String(p.embedBaseUrl || 'http://127.0.0.1:11434/v1');
                const model = String(p.embedModel || 'bge-m3');
                const apiKeyEnv = String(p.embedApiKeyEnv || 'EMBED_API_KEY');
                const running = { enabled, baseUrl, model, apiKeyEnv };
                // 探测本机服务 → provider 标签（子进程清 NODE_OPTIONS 防 inspector 残留干扰）
                let provider = 'off', localOk = false;
                const local = isLocalBase(baseUrl);
                if (enabled && local) {
                    const p2 = probeLocalEmbed(baseUrl);
                    provider = p2.provider;
                    localOk = p2.ok;
                }
                else if (enabled)
                    provider = 'cloud';
                // 缓存统计
                let cacheLines = 0, cacheKB = 0;
                try {
                    const f = join(knowledgeRoot(), '.vector-cache.jsonl');
                    if (existsSync(f)) {
                        const st = statSync(f);
                        cacheKB = Math.round(st.size / 1024);
                        cacheLines = readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length;
                    }
                }
                catch { /* 无缓存 */ }
                const stats = { queries: vecStats.queries, lastMode: vecStats.lastMode, lastMs: vecStats.lastMs, lastAt: vecStats.lastAt, lastQuery: vecStats.lastQuery, lastHit: vecStats.lastHit };
                sendJson(res, 200, { ok: true, running, persisted: p, provider, localOk, cache: { lines: cacheLines, kb: cacheKB }, stats });
            }
            catch (e) {
                sendJson(res, 500, { error: String(e) });
            }
        });
        // U1：/embed/config —— 向量 provider 持久通道（GET 展示 persisted ／ POST 校验写入 scheduler.json）
        // 同 /deepsleep/config：GET 与 POST 合并同一 handler 按 method 分发（宿主按路径去重，拆分注册会拖垮插件树）。
        const EMBED_CONFIG_KEYS = ['embedEnabled', 'embedBaseUrl', 'embedModel', 'embedApiKeyEnv'];
        const validateEmbedConfig = (patch) => {
            if ('embedEnabled' in patch && typeof patch.embedEnabled !== 'boolean')
                return 'embedEnabled must be boolean';
            if ('embedBaseUrl' in patch && typeof patch.embedBaseUrl !== 'string')
                return 'embedBaseUrl must be string';
            if ('embedModel' in patch && typeof patch.embedModel !== 'string')
                return 'embedModel must be string';
            if ('embedApiKeyEnv' in patch && typeof patch.embedApiKeyEnv !== 'string')
                return 'embedApiKeyEnv must be string';
            return null;
        };
        route('/embed/config', async (req, res) => {
            try {
                if (req.method === 'POST') {
                    const body = (await readBody(req).catch(() => ({})));
                    const patch = {};
                    for (const k of EMBED_CONFIG_KEYS)
                        if (k in body)
                            patch[k] = body[k];
                    if (!Object.keys(patch).length)
                        return sendJson(res, 400, { error: 'no-embed-keys' });
                    const err = validateEmbedConfig(patch);
                    if (err)
                        return sendJson(res, 400, { error: err });
                    const merged = { ...readSuiteConfig(), ...patch };
                    writeSuiteConfig(merged);
                    ctx.logger?.info?.(`[shoucang] embed config updated: ${Object.keys(patch).join(',')}（重载后生效）`);
                    return sendJson(res, 200, { ok: true, merged, reloadRequired: true });
                }
                sendJson(res, 200, { persisted: readSuiteConfig() });
            }
            catch (e) {
                sendJson(res, 500, { error: String(e) });
            }
        });
        // M1（2026-09-10 蓝图，照抄 AnythingLLM customModels.js 枚举骨架）：
        // /embed/test —— 探测 baseUrl 并枚举可用嵌入模型。OpenAI 兼容 GET {base}/v1/models；
        // 不可枚举服务（如守藏 bge 仅 /v1/embeddings）降级探测 /health → 标 fixed 提示固定模型。
        // 永不 throw、失败降级 {models:[], error}；验活=枚举非空或 /health 通；协议纯 fetch 零依赖。
        route('/embed/test', async (req, res) => {
            try {
                const body = (await readBody(req).catch(() => ({})));
                const raw = String(body.baseUrl || '').trim().replace(/\/+$/, '');
                if (!raw)
                    return sendJson(res, 400, { error: 'baseUrl required' });
                let parsed;
                try {
                    parsed = new URL(raw);
                }
                catch {
                    return sendJson(res, 200, { models: [], error: 'URL 无效（需含 http:// 或 https://）' });
                }
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
                    return sendJson(res, 200, { models: [], error: '仅支持 http/https' });
                // 宿主进程全局 fetch 被 DSH patch（实测 11434 经 fetch 不通、node:http 通）——
                // /embed/test 用 node:http/https 模块直连（不依赖 fetch），规避宿主 fetch 层限制。
                const key = String(body.apiKey || '').trim();
                const t0 = Date.now();
                const fin = (models, error, extra = {}) => sendJson(res, 200, { baseUrl: raw, models, error, latencyMs: Date.now() - t0, ...extra });
                const httpGet = async (url, withAuth) => {
                    let target;
                    try {
                        target = new URL(url);
                    }
                    catch {
                        return { status: 0, body: 'bad url' };
                    }
                    const lib = target.protocol === 'https:' ? 'https' : 'http';
                    const mod = await import(lib);
                    return new Promise((resolve) => {
                        const headers = {};
                        if (withAuth && key)
                            headers.Authorization = `Bearer ${key}`;
                        const req = mod.get(target, { headers, timeout: 6000 }, (res) => {
                            let d = '';
                            res.on('data', (c) => { d += c.toString(); });
                            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: d.slice(0, 200000) }));
                        });
                        req.on('error', () => resolve({ status: 0, body: 'network error' }));
                        req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
                    });
                };
                // ① OpenAI 兼容枚举（GET {base}/models；base 已含 /v1 时不再重复拼接——2026-09-11 修：原实现恒拼 `raw + '/v1/models'`，
                //    而 UI 预设与 vec.ts 用的 baseUrl 形如 `http://127.0.0.1:11434/v1` ⇒ 实际请求 `/v1/v1/models` 恒 404，Ollama 枚举静默失效）
                const modelsUrl = /\/v1$/.test(raw) ? raw + '/models' : raw + '/v1/models';
                try {
                    const r = await httpGet(modelsUrl, true);
                    if (r.status >= 200 && r.status < 300) {
                        let j = {};
                        try {
                            j = JSON.parse(r.body);
                        }
                        catch { /* 非 JSON */ }
                        const models = (j.data || []).map((m) => ({ id: m.id, name: m.id }));
                        if (models.length)
                            return fin(models, null, { mode: 'openai-compatible' });
                        return fin(models, null, { mode: 'openai-compatible', empty: true });
                    }
                    if (r.status !== 404 && r.status !== 0)
                        return fin([], `服务不可达（HTTP ${r.status}）`, { mode: 'openai-compatible' });
                }
                catch { /* 404/网络错 → health 降级 */ }
                // ② 无 /v1/models → 降级 /health（bge 类自建服务）
                try {
                    const r = await httpGet(raw.replace(/\/v1$/, '') + '/health', false);
                    if (r.status >= 200 && r.status < 300) {
                        let j = {};
                        try {
                            j = JSON.parse(r.body);
                        }
                        catch { /* */ }
                        return fin([], null, { mode: 'health-fixed', fixedModel: j.model || 'bge-m3', dims: j.dims, hint: '服务在但无 /models——用固定模型 ' + (j.model || 'bge-m3') });
                    }
                    return fin([], '服务不可达（/v1/models 与 /health 均无响应）', { mode: 'health' });
                }
                catch {
                    return fin([], '服务不可达（网络错误）', { mode: 'none' });
                }
            }
            catch (e) {
                sendJson(res, 500, { error: String(e) });
            }
        });
        // P0（2026-09-10 审查）：清向量缓存——换 embedding 模型后旧向量必须失效，否则新旧混用语义失真。
        // 清磁盘 .vector-cache.jsonl + 内存；下次召回按新模型惰性重嵌（vec.ts model 指纹已保证不误用旧向量）。
        route('/vector/cache/clear', (_req, res) => {
            try {
                const r = clearVecCache();
                injectCache.at = 0; // 缓存清理后召回将重建，注入无关但保持缓存策略一致
                sendJson(res, 200, r);
            }
            catch (e) {
                sendJson(res, 500, { error: String(e) });
            }
        });
        // U2（2026-09-09，ui-impl-plan）：记忆写端点（编辑/删除/批准）——全部走既有门禁：
        //   edit/remove → 临时文件整改 → memory_write_gate（exit 0 才 rename；失败回滚不落盘）
        //   approve → 候选移 .processed（确认有价值，内容由蒸馏正常入册；候选无结构化小节不强行归纳）
        // 安全网：file 白名单 + 前端 confirm（remove）+ write_gate 备份。用户显式触发，非热路径。
        const NOTE_WRITE_RELS = ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent']; // 7 件（INDEX 禁写）
        const isWritable = (file) => {
            if (file === 'MEMORY.md' || file === 'USER.md' || file === 'AGENT.md')
                return true;
            return NOTE_WRITE_RELS.includes(String(file).replace(/^notes[\\/]/, '').replace(/\.md$/, ''));
        };
        /** 写门前置（2026-09-11 修复：原 execFileSync 在慢门禁下阻塞宿主事件循环最长 30s → 改异步 execFile） */
        const gateWrite = (target, tmpPath) => new Promise((done) => {
            const gate = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs');
            if (!existsSync(gate))
                return done({ ok: false, reason: 'write_gate 未就位' });
            execFile('node', [gate, target, tmpPath], { encoding: 'utf8', timeout: 30000, windowsHide: true, env: { ...process.env, MEMORY_ROOT: memoryLibRoot() } }, (err, stdout, stderr) => {
                if (!err)
                    return done({ ok: true, out: String(stdout) });
                const code = err.code;
                done({ ok: false, reason: `gate exit=${code ?? '?'}`, out: String(stderr || err.message || '') });
            });
        });
        const readMemFile = (file) => {
            const abs = join(memoryLibRoot(), file);
            try {
                return { text: readFileSync(abs, 'utf8'), abs };
            }
            catch {
                return { text: null, abs };
            }
        };
        const writeMemViaGate = async (file, nextText) => {
            const abs = join(memoryLibRoot(), file);
            const tmp = abs + '.ui-tmp';
            try {
                writeFileSync(tmp, nextText, 'utf8');
            }
            catch (e) {
                return { ok: false, reason: 'tmp write fail: ' + String(e.message).slice(0, 80) };
            }
            const g = await gateWrite(file, tmp);
            if (g.ok) {
                try {
                    renameSync(tmp, abs);
                    return { ok: true, out: g.out || '' };
                }
                catch (e) {
                    return { ok: false, reason: 'rename fail: ' + String(e.message).slice(0, 80) };
                }
            }
            try {
                unlinkSync(tmp);
            }
            catch { /* 清理失败无害 */ }
            return g;
        };
        // notes 小节正文编辑（2026-09-10 修复：前端 /memory/section-edit 此前**无对应路由** → 「✎编辑此小节」必 404）。
        // 语义：按标题层级定位小节，只替换其正文（保留标题行与其他小节），走 write_gate 门禁 + 备份落盘；索引指针不动。
        route('/memory/section-edit', async (req, res) => {
            try {
                const body = (await readBody(req).catch(() => ({})));
                const rel = String(body.rel || '').trim().replace(/\\/g, '/');
                const section = String(body.section || '').trim();
                const newBody = String(body.newBody || '').trim();
                if (!isWritable(rel))
                    return sendJson(res, 400, { error: 'rel not writable: ' + rel });
                if (!section)
                    return sendJson(res, 400, { error: 'section required' });
                if (!newBody)
                    return sendJson(res, 400, { error: 'newBody required' });
                const { text } = readMemFile(rel);
                if (text == null)
                    return sendJson(res, 404, { error: 'file not found: ' + rel });
                const lines = text.split(/\r?\n/);
                const normTitle = (s) => s.replace(/^#+\s*/, '').replace(/\s+/g, '');
                const headIdx = lines.findIndex((l) => /^#{2,4}\s+/.test(l) && normTitle(l) === normTitle(section));
                if (headIdx < 0)
                    return sendJson(res, 404, { error: 'section not found: ' + section });
                const level = (lines[headIdx].match(/^#+/) || ['##'])[0].length;
                let endIdx = lines.length;
                for (let i = headIdx + 1; i < lines.length; i++) {
                    const m = lines[i].match(/^(#{1,6})\s+/);
                    if (m && m[1].length <= level) {
                        endIdx = i;
                        break;
                    }
                }
                const out = [...lines.slice(0, headIdx), lines[headIdx], '', ...newBody.split(/\r?\n/), '', ...lines.slice(endIdx)];
                // 折叠连续空行（正文块前后各留一空行即可）
                const folded = [];
                for (const l of out) {
                    if (l.trim() === '' && folded.length && folded[folded.length - 1].trim() === '')
                        continue;
                    folded.push(l);
                }
                const r = await writeMemViaGate(rel, folded.join('\n'));
                if (!r.ok)
                    return sendJson(res, 400, { error: r.reason, detail: (r.out || '').slice(0, 300) });
                injectCache.at = 0;
                return sendJson(res, 200, { ok: true });
            }
            catch (e) {
                sendJson(res, 500, { error: String(e) });
            }
        });
        route('/memory/edit', async (req, res) => {
            try {
                const body = (await readBody(req).catch(() => ({})));
                const file = String(body.file || '').trim();
                const oldLine = String(body.line || '').trim();
                const newText = String(body.newText || '').trim();
                if (!isWritable(file))
                    return sendJson(res, 400, { error: 'file not writable: ' + file });
                if (!oldLine)
                    return sendJson(res, 400, { error: 'line required' });
                const { text } = readMemFile(file);
                if (text == null)
                    return sendJson(res, 404, { error: 'file not found' });
                const lines = text.split(/\r?\n/);
                const normOld = oldLine.replace(/\s+/g, '');
                const idx = lines.findIndex((l) => l.trim() === oldLine || l.replace(/\s+/g, '') === normOld);
                if (idx < 0)
                    return sendJson(res, 404, { error: 'line not found (可能已被修改，请刷新)' });
                lines[idx] = newText || oldLine;
                const r = await writeMemViaGate(file, lines.join('\n'));
                if (!r.ok)
                    return sendJson(res, 400, { error: r.reason, detail: (r.out || '').slice(0, 300) });
                injectCache.at = 0;
                return sendJson(res, 200, { ok: true });
            }
            catch (e) {
                sendJson(res, 500, { error: String(e) });
            }
        });
        route('/memory/remove', async (req, res) => {
            try {
                const body = (await readBody(req).catch(() => ({})));
                const file = String(body.file || '').trim();
                const oldLine = String(body.line || '').trim();
                if (!isWritable(file))
                    return sendJson(res, 400, { error: 'file not writable' });
                if (!oldLine)
                    return sendJson(res, 400, { error: 'line required' });
                const { text } = readMemFile(file);
                if (text == null)
                    return sendJson(res, 404, { error: 'file not found' });
                const lines = text.split(/\r?\n/);
                const before = lines.length;
                const kept = lines.filter((l) => l.trim() !== oldLine);
                if (kept.length === before)
                    return sendJson(res, 404, { error: 'line not found' });
                const r = await writeMemViaGate(file, kept.join('\n'));
                if (!r.ok)
                    return sendJson(res, 400, { error: r.reason, detail: (r.out || '').slice(0, 300) });
                injectCache.at = 0;
                return sendJson(res, 200, { ok: true });
            }
            catch (e) {
                sendJson(res, 500, { error: String(e) });
            }
        });
        route('/memory/approve', async (req, res) => {
            try {
                const body = (await readBody(req).catch(() => ({})));
                const pf = String(body.pendingFile || '').trim().replace(/^.*[\\/]/, '');
                if (!/^[\w\u4e00-\u9fa5-]+\.md$/.test(pf))
                    return sendJson(res, 400, { error: 'bad pending file' });
                // 双区支持：优先 flow-candidates（待转正候选），其次根 pending
                const pendRoot = join(knowledgeRoot(), 'pending');
                let src = join(pendRoot, 'flow-candidates', pf);
                let zone = 'flow-candidates';
                if (!existsSync(src)) {
                    src = join(pendRoot, pf);
                    zone = 'pending';
                }
                if (!existsSync(src))
                    return sendJson(res, 404, { error: 'candidate not found' });
                // approved 移区（与蒸馏成功处理一致：.processed 子目录，蒸馏采集不递归不回流）
                const procDir = zone === 'flow-candidates' ? join(pendRoot, 'flow-candidates', '.processed') : join(pendRoot, '.processed');
                try {
                    mkdirSync(procDir, { recursive: true });
                    renameSync(src, join(procDir, pf));
                }
                catch (e) {
                    return sendJson(res, 500, { error: 'move fail: ' + String(e.message).slice(0, 100) });
                }
                return sendJson(res, 200, { ok: true, moved: zone + '/.processed/' + pf });
            }
            catch (e) {
                sendJson(res, 500, { error: String(e) });
            }
        });
        // 2026-09-10 审查 P1：60s 空闲巩固轮心跳已移除——consolidateRound 调用的 _meta/*.py（explicit_facts_extractor/
        // lifecycle_settle/session_decode）为 v15 单库化前遗留，不随包分发（新装用户 meta 恒空→每轮静默空转）。
        // 真蒸馏由 distill.ts armIdleTimer（turn 结束 idleWakeMs 后）+ scheduler.ts 独立驱动，无需此心跳。
        return () => { for (const d of disposers)
            d(); };
    }, '@dsh-external/shoucang-panel: http rpc + hot memory injection');
}
//# sourceMappingURL=panel.js.map