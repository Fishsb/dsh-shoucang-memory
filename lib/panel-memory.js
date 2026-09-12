/**
 * @dsh-external/shoucang-panel / memory — 记忆库只读展示领域。
 * 端点：GET /memory/overview · GET /memory/sections
 * 依赖窄传：3 个（route / suite / logger）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dshHome, knowledgeRoot } from './targets.js';
import { vecStats } from './vec.js';
import { isLocalBase, sendJson, statMtime } from './panel-shared.js';
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
/**
 * 容量上限单一事实源（2026-09-10 修复：与写门同源）。
 * 优先级：① ~/.dsh/suite/scheduler.json 的容量门 capAgent/capUser/capMemory（= write_gate 的 env SHOUCANG_CAP_*，
 * 面板改容量门后 UI 立即联动）；② engine/target-registry.json 静态 capacity（旧源兼容）；③ 内建默认画像 3000 / 记忆 5000。
 */
const memoryCaps = (d, base) => {
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
        const s = d.suite.read();
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
const memOverviewOf = (d, base) => {
    const caps = memoryCaps(d, base);
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
function memoryOverviewRoute(d, _req, res) {
    const base = memoryHomeOf();
    if (!base)
        return sendJson(res, 200, { present: false, error: '未检测到记忆库技能仓（~/.dsh/skills/managing-memory）——记忆插件蒸馏事实源不在本机默认位' });
    try {
        const mem = memOverviewOf(d, base);
        const suiteBase = suiteHomeOf();
        const suite = suiteBase ? memOverviewOf(d, suiteBase) : null;
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
                const p = d.suite.read();
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
}
function memorySectionsRoute(d, req, res) {
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
}
export function registerMemoryRoutes(d) {
    d.route('/memory/overview', (req, res) => memoryOverviewRoute(d, req, res));
    d.route('/memory/sections', (req, res) => memorySectionsRoute(d, req, res));
}
//# sourceMappingURL=panel-memory.js.map