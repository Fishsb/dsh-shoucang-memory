import z from 'schemastery';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { homedir } from 'node:os';
import { dshHome, knowledgeRoot } from './targets.js';
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
    const idleState = { lastActiveAt: 0, lastDistillAt: 0, lastSettleAt: 0, running: false };
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
    let defaultProjectCache = null;
    const defaultProjectOf = () => {
        if (defaultProjectCache)
            return defaultProjectCache;
        const cands = [join(moduleDir, '../default-project.json'), join(moduleDir, 'default-project.json')];
        for (const file of cands) {
            try {
                defaultProjectCache = JSON.parse(readFileSync(file, 'utf8'));
                return defaultProjectCache;
            }
            catch { /* try next */ }
        }
        defaultProjectCache = null;
        return null;
    };
    const TEMPLATE = join(moduleDir, '../default-vault-template.tar.gz');
    /** 纯 Node tar.gz 解压（零外部依赖；防御路径穿越；仅处理文件/目录条目，GNU ustar 短路径） */
    const extractTgz = (buf, dest) => {
        const out = gunzipSync(buf);
        mkdirSync(dest, { recursive: true });
        let off = 0;
        while (off + 512 <= out.length) {
            const block = out.subarray(off, off + 512);
            const readStr = (s, e) => block.subarray(s, e).toString('utf8').replace(/\0[\s\S]*$/, '');
            const name = readStr(0, 100);
            if (!name)
                break;
            const size = parseInt(readStr(124, 136) || '0', 8) || 0;
            const type = String.fromCharCode(block[156]);
            const prefix = readStr(345, 500);
            const full = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '').split('\\').join('/');
            if (full.includes('../') || full.startsWith('/'))
                throw new Error(`tar 路径非法：${full}`);
            const dataStart = off + 512;
            const target = join(dest, full);
            if (type === '5')
                mkdirSync(target, { recursive: true });
            else if (type === '0' || type === '') {
                mkdirSync(dirname(target), { recursive: true });
                writeFileSync(target, out.subarray(dataStart, dataStart + size));
            }
            off = dataStart + Math.ceil(size / 512) * 512;
        }
    };
    const bootstrapDefaults = (rootPath) => {
        const out = { createdDirs: [], createdIndexes: [], skipped: [], template: false };
        mkdirSync(rootPath, { recursive: true });
        // 空根（全新库）：直接用默认知识库模板解压（含 _meta 管线/配置/wiki 规范/目录结构/18 份 _index.md）
        const fresh = !existsSync(join(rootPath, 'shoucang.config.yaml')) && !existsSync(join(rootPath, '记忆'));
        if (fresh && existsSync(TEMPLATE)) {
            try {
                extractTgz(readFileSync(TEMPLATE), rootPath);
                out.template = true;
                return out;
            }
            catch (e) {
                ctx.logger?.warn?.(`[shoucang] 模板解压失败，降级 JSON 骨架：${String(e)}`);
                // fallthrough 到 JSON 骨架
            }
        }
        const dp = defaultProjectOf();
        if (!dp)
            return out;
        const rels = Object.keys(dp.index_templates ?? {});
        const walk = (tree, prefix) => {
            for (const name of Object.keys(tree)) {
                const rel = prefix ? `${prefix}/${name}` : name;
                const dir = join(rootPath, rel);
                if (!existsSync(dir)) {
                    mkdirSync(dir, { recursive: true });
                    out.createdDirs.push(rel);
                }
                const idx = join(dir, '_index.md');
                if (!existsSync(idx)) {
                    try {
                        const tpl = dp.index_templates[rel] ?? '';
                        if (tpl)
                            writeFileSync(idx, tpl, 'utf8');
                    }
                    catch {
                        out.skipped.push(rel);
                    }
                    if (existsSync(idx))
                        out.createdIndexes.push(rel);
                }
                else {
                    out.skipped.push(rel);
                }
                const child = tree[name];
                walk(child, rel);
            }
        };
        walk(dp.structure ?? {}, '');
        return out;
    };
    /* ---------- R1 热记忆注入（2026-08-27）：画像+记忆 指针行，每轮注入 ---------- */
    const injectCache = { root: null, at: 0, text: '' };
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
    const buildHotMemoryText = () => {
        const now = Date.now();
        const memRoot = memoryRootOf();
        if (injectCache.root === memRoot && now - injectCache.at < 30000)
            return injectCache.text;
        injectCache.root = memRoot;
        injectCache.at = now;
        let level = 'smart';
        let hotMemoryOn = true;
        let personaMode = 'both';
        let maxTokens = 3000;
        let capAgent = 0;
        let capUser = 0;
        let capMemory = 0;
        const file = configFileOf();
        if (file && existsSync(file)) {
            try {
                const view = parseView(readFileSync(file, 'utf8'));
                level = view.injection_level ?? 'smart';
                hotMemoryOn = view.flags['injection.hot_memory'] !== false;
                personaMode = String(view.flags['injection.persona'] ?? 'both'); // v16：off|me|you|both 接通生效（me=AGENT 画像 / you=USER 画像）
                if (view.max_tokens != null)
                    maxTokens = view.max_tokens; // v16：总预算接通（原硬编码漂移键）
                capAgent = view.caps_agent ?? 0; // v16：板块容量上限（字符，0=不裁）
                capUser = view.caps_user ?? 0;
                capMemory = view.caps_memory ?? 0;
            }
            catch { /* 缺配置用默认 */ }
        }
        if (level === 'off' || !hotMemoryOn) {
            injectCache.text = '';
            return '';
        }
        // 指针式注入：agent 画像（含 [原则] 习得原则与 [路径] 任务路径）+ 用户画像 + 知识索引一行一条（[tag] 主题 · 概况 → notes/x.md §小节），Agent 按需 get_file 拉详情
        const readIdx = (name) => {
            try {
                return readFileSync(join(memRoot, name), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\[.+\]/.test(l));
            }
            catch {
                return [];
            }
        };
        // v16：板块容量上限裁切（逐行累加，不切半行；0=不裁）
        const capByChars = (src, cap) => {
            if (!cap || cap <= 0)
                return { lines: src, trimmed: false };
            const out = [];
            let used = 0;
            for (const l of src) {
                const w = l.length + 3; // '- ' 前缀 + 换行
                if (used + w > cap)
                    return { lines: out, trimmed: true };
                out.push(l);
                used += w;
            }
            return { lines: out, trimmed: false };
        };
        const rowCaps = { low: 2, medium: 4, high: 8, smart: 10 };
        const userRes = capByChars(personaMode === 'off' || personaMode === 'me' ? [] : readIdx('USER.md'), capUser);
        const agentRes = capByChars(personaMode === 'off' || personaMode === 'you' ? [] : readIdx('AGENT.md'), capAgent);
        const memRes = capByChars(readIdx('MEMORY.md').slice(0, rowCaps[level] ?? 10), capMemory);
        if (!userRes.lines.length && !agentRes.lines.length && !memRes.lines.length) {
            injectCache.text = '';
            return '';
        }
        const lines = [`[守藏·热记忆] 记忆库指针（${memRoot}；详情按指针 get_file 拉对应 notes §小节）：`];
        if (agentRes.lines.length) {
            lines.push('agent 画像（AGENT.md；含 [原则] 习得原则与 [路径] 任务路径——跨任务方向指引/脚本骨架，①③步优先读）：');
            for (const l of agentRes.lines)
                lines.push(`- ${l}`);
            if (agentRes.trimmed)
                lines.push('…（agent 画像超出注入上限已裁切）');
        }
        if (userRes.lines.length) {
            lines.push('用户画像（USER.md）：');
            for (const l of userRes.lines)
                lines.push(`- ${l}`);
            if (userRes.trimmed)
                lines.push('…（用户画像超出注入上限已裁切）');
        }
        if (memRes.lines.length) {
            lines.push(`知识索引（MEMORY.md，热取前 ${memRes.lines.length} 条）：`);
            for (const l of memRes.lines)
                lines.push(`- ${l}`);
            if (memRes.trimmed)
                lines.push('…（知识索引超出注入上限已裁切）');
        }
        const budget = Math.max(400, maxTokens * 2); // 中文粗估 ~2 字符/token（v16：max_tokens 接通，缺省 3000=3000 字符与旧硬编码一致）
        // 路线② 晨起摘要插入（预留其字节再裁切正文，保证 delta 不被预算吞掉；persona=off 不注入）
        const deltaText = readDawnDelta(personaMode);
        let text = lines.join('\n');
        if (deltaText) {
            const keep = Math.max(0, budget - deltaText.length);
            if (text.length > keep)
                text = text.slice(0, keep) + (text.length > keep ? '\n…（指针注入已按预算裁切）' : '');
            text = deltaText + (text ? '\n' + text : '');
        }
        else if (text.length > budget) {
            text = text.slice(0, budget) + '\n…（指针注入已按预算裁切）';
        }
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
            // v16：注入预算与板块容量上限（0 合法=不裁，显式 isNaN 检查防 falsy 丢失）
            if (p === 'shoucang.injection.max_tokens') {
                const n = parseInt(value, 10);
                if (!isNaN(n))
                    out.max_tokens = n;
            }
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
    // 按默认项目资料手动构建（body.root 可指定；缺省用当前激活根）——只补缺失目录/索引
    route('/root/bootstrap', async (req, res) => {
        const body = (await readBody(req).catch(() => ({})));
        const target = typeof body.root === 'string' && body.root.trim() ? resolve(body.root.trim()) : activeRootOf()?.path ?? '';
        if (!target)
            return sendJson(res, 400, { error: 'no root' });
        const boot = bootstrapDefaults(target);
        sendJson(res, 200, { root: target, ...boot, materialVersion: defaultProjectOf()?.version ?? null });
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
        if (!file)
            return sendJson(res, 200, { text: null, parsed: null, error: 'no-active-root' });
        try {
            const text = readFileSync(file, 'utf8');
            sendJson(res, 200, { text, parsed: parseView(text), file, mtime: statMtime(file) });
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
        const allowed = ['boards.persona', 'boards.memory', 'boards.wiki', 'injection.hot_memory', 'archive.enabled', 'lifecycle.enabled', 'scheduler.enabled', 'lifecycle.archive.apply_confirm', 'merge.enabled'];
        if (!allowed.includes(key))
            return sendJson(res, 400, { error: `key 不允许：${key}` });
        const file = configFileOf();
        if (!file)
            return sendJson(res, 400, { error: 'no-active-root' });
        // 面板用逻辑名（boards.wiki），实际 YAML 多一层 shoucang 根命名空间
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
            'injection.max_tokens': [],
            // v16：注入板块容量上限（字符，0=不裁）
            'injection.agent_max_chars': [],
            'injection.user_max_chars': [],
            'injection.memory_max_chars': [],
            'lifecycle.archive.min_confidence': [],
            'lifecycle.archive.age_days': [],
            'lifecycle.archive.mode': ['age', 'fixed'],
            'lifecycle.archive.fixed_time': [],
            'merge.fingerprint_threshold': [],
            'merge.complement_floor': [],
            'idle.sessions_dir': [],
            'archive.idle_review_ms': [],
            'archive.ttl_multiplier': [],
            'lifecycle.interval_hours': [],
            // 向量配置在模型「部署/导入」时自动写入，面板不允许手工改（2026-08-27 定稿；如需高级定制走配置原文 YAML）
        };
        // 数值范围校验（时间类）
        const RANGE = {
            'archive.idle_review_ms': [60000, 3600000], // 1–60 分钟（毫秒）
            'lifecycle.archive.age_days': [0.1, 30],
            'lifecycle.archive.min_confidence': [0, 100],
            'merge.fingerprint_threshold': [0.1, 1],
            'merge.complement_floor': [0.05, 0.9],
            'archive.ttl_multiplier': [0.5, 10],
            'lifecycle.interval_hours': [1, 168],
            'injection.max_tokens': [100, 8000],
            // v16：板块容量上限范围（0=不裁，上限留足写门容量的 6 倍余量）
            'injection.agent_max_chars': [0, 20000],
            'injection.user_max_chars': [0, 20000],
            'injection.memory_max_chars': [0, 20000],
            'embedding.dimension': [16, 8192], // 常见嵌入维度范围
        };
        if (!(key in allowed))
            return sendJson(res, 400, { error: `key 不允许：${key}` });
        if (!value && key !== 'idle.sessions_dir')
            return sendJson(res, 400, { error: 'value required' });
        if (allowed[key].length && !allowed[key].includes(value))
            return sendJson(res, 400, { error: `枚举值非法：${key} ∈ ${allowed[key].join('|')}` });
        if (key === 'lifecycle.archive.fixed_time') {
            if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value))
                return sendJson(res, 400, { error: 'fixed_time 须为 HH:MM（如 21:30）' });
            value = `"${value}"`; // YAML 时间对象防护：归档时刻保持字符串
        }
        if (RANGE[key] && !(Number(value) >= RANGE[key][0] && Number(value) <= RANGE[key][1])) {
            return sendJson(res, 400, { error: `数值越界：${key} ∈ [${RANGE[key][0]}, ${RANGE[key][1]}]` });
        }
        const file = configFileOf();
        if (!file)
            return sendJson(res, 400, { error: 'no-active-root' });
        const fileKey = 'shoucang.' + key;
        let next;
        try {
            next = setKey(readFileSync(file, 'utf8'), fileKey, value);
        }
        catch (e) {
            return sendJson(res, 500, { error: String(e) });
        }
        if (next === null)
            return sendJson(res, 500, { error: `未定位到配置行：${key}` });
        backupThenWrite(file, next);
        injectCache.at = 0; // 注入缓存作废：数值/枚举改动立即反映
        ctx.logger?.info?.(`[shoucang] panel set ${key}=${value}`);
        sendJson(res, 200, { ok: true, key, value, parsed: parseView(next) });
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
    /** 容量上限单一事实源 = engine/target-registry.json（读失败回退默认值；v16：PRINCIPLES 退役、AGENT 3000） */
    const memoryCaps = (base) => {
        const out = { 'MEMORY.md': 3000, 'USER.md': 2000, 'AGENT.md': 3000 };
        try {
            const reg = JSON.parse(readFileSync(join(base, 'engine', 'target-registry.json'), 'utf8'));
            const cap = reg?.targets?.memory?.capacity;
            if (cap)
                for (const k of Object.keys(cap))
                    out[k] = cap[k];
        }
        catch { /* 回退默认容量 */ }
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
            return { name: f.file, label: f.label, text, chars: charsOf(text), cap: caps[f.file] ?? 2000, lines: parseIndexLines(text) };
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
            sendJson(res, 200, {
                present: true,
                ...mem,
                // 蒸馏唯一权归守藏（ADR-0002 阶段3）：水位语义 = suite 活水位（记忆库根 watermark 已冻结为历史值）
                distill: suite ? suite.distill : mem.distill,
                queue: { undone },
                suite: suite ? { present: true, ...suite } : { present: false },
                distillStats: distillStatsOf(),
                growth: growthOf(),
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
            const sections = [];
            const lines = text.split(/\r?\n/);
            let cur = null;
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/^##\s+(.+)$/);
                if (m) {
                    if (cur)
                        sections.push({ title: cur.title, line: cur.line, body: cur.body.join('\n').trim() });
                    cur = { title: m[1].trim(), line: i + 1, body: [] };
                }
                else if (cur) {
                    cur.body.push(lines[i]);
                }
            }
            if (cur)
                sections.push({ title: cur.title, line: cur.line, body: cur.body.join('\n').trim() });
            sendJson(res, 200, { present: true, root: rootParam, rel, name: rel.split('/').pop() ?? '', text, sections });
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
    const DISTILL_CONFIG_KEYS = ['enableDistill', 'idleWakeMs', 'minTurnChars', 'distillPrescan', 'llmProvider', 'llmModel'];
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
    // R1 热记忆注入预览（排障/验证用，只读）
    route('/inject/preview', (_req, res) => {
        sendJson(res, 200, { text: buildHotMemoryText() });
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
        ctx.logger?.info?.('[shoucang] host RPC ready: roots/bootstrap/config/save/toggle/set/memory(overview|sections)/suite/deepsleep(status|trigger|config)/idle(status|consolidate)/vector(status|build)/model(list|pull|progress|import|deploy)/inject(preview|stats)');
        // 注册 systemPrompt 注入块（每轮渲染，指针缓存 30s）
        const sp = ctx.systemPrompt;
        if (sp && typeof sp.context === 'function') {
            disposers.push(sp.context({
                name: 'shoucang-hot-memory',
                order: 88, // mneme: user-settings=85 / memory=90 —— 守藏热记忆在其间
                text: () => { injectMeta.calls++; injectMeta.lastAt = Date.now(); idleState.lastActiveAt = Date.now(); return buildHotMemoryText(); },
            }));
            ctx.logger?.info?.('[shoucang] R1 热记忆注入挂点已注册 (systemPrompt.context: shoucang-hot-memory)');
        }
        else {
            ctx.logger?.warn?.('[shoucang] systemPrompt 能力不可用，R1 热记忆注入未注册');
        }
        // ── 空闲巩固轮（Letta-heartbeat 模式 · 2026-08-27）：蒸馏/合并/归档/结算 一体化 ──
        const PY = process.env.SHOUCANG_PY || 'python'; // 零硬编码红线：本机解释器经 env 指定
        const _metaOf = () => { const r = activeRootOf(); return r ? join(r.path, '_meta') : ''; };
        // 2d 配额代码化（落地方案）：idle 轮内 py 进程调用硬上限——防蒸馏/归档风暴失控（配合 _writeFacts 单轮落笔 15 上限）。
        // 仅 consolidateRound 会话内计配额；RPC（/model/* /vector/* 等）为交互路径不受限（修：此前全局计数使 RPC 也被拒）
        let pyRoundCalls = 0;
        let inConsolidate = false;
        const MAX_PY_PER_ROUND = 24;
        const _runPy = (args) => {
            if (inConsolidate) {
                if (++pyRoundCalls > MAX_PY_PER_ROUND) {
                    ctx.logger?.warn?.(`[shoucang] py 轮内配额超限(>${MAX_PY_PER_ROUND} 次)，本轮后续调用被拒`);
                    return JSON.stringify({ error: 'py-call-quota-exceeded', quota: MAX_PY_PER_ROUND });
                }
            }
            try {
                return execFileSync(PY, args, { encoding: 'utf8', timeout: 180000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
            }
            catch (e) {
                const ee = e;
                const err = typeof ee.stderr === 'string' ? ee.stderr : (ee.stderr || Buffer.from('')).toString() || ee.message || String(e);
                ctx.logger?.warn?.(`[shoucang][idle] py 失败: ${String(err).slice(0, 160)}`);
                return String(err);
            }
        };
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
        const _sessionsDir = (cfg) => {
            const c = String(cfg?.sessions_dir || '').trim();
            if (c)
                return c;
            const env = process.env.SHOUCANG_SESSIONS_DIR;
            if (env)
                return env;
            // 会话目录缺省探测走 dshHome()（DSH_HOME || ~/.dsh），与插件其余路径同一事实源（此前用 USERPROFILE 只在 Windows 成立）
            const probe = join(dshHome(), 'sessions');
            return existsSync(probe) ? probe : '';
        };
        const _latestSession = (dir) => {
            let best = '', bestMs = 0;
            const scan = (d, depth) => {
                let items = [];
                try {
                    items = readdirSync(d, { withFileTypes: true });
                }
                catch {
                    return;
                }
                for (const ent of items) {
                    if (ent.name.startsWith('.'))
                        continue;
                    const full = join(d, ent.name);
                    if (ent.isDirectory()) {
                        if (depth < 4)
                            scan(full, depth + 1);
                        continue;
                    }
                    try {
                        const st = statSync(full);
                        if (!st.isFile() || st.size < 64)
                            continue;
                        if (!/\.(jsonl|zstd|zst|json)$/i.test(ent.name))
                            continue;
                        if (/\.bak-/.test(ent.name))
                            continue;
                        if (st.mtimeMs > bestMs) {
                            bestMs = st.mtimeMs;
                            best = full;
                        }
                    }
                    catch { /* skip */ }
                }
            };
            scan(dir, 0);
            return best;
        };
        const _decodeBuf = (buf) => {
            if (buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd) {
                const parts = [];
                let i = 0;
                while (i + 4 <= buf.length) {
                    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) {
                        let j = i + 4;
                        while (j + 4 <= buf.length && !(buf[j] === 0x28 && buf[j + 1] === 0xb5 && buf[j + 2] === 0x2f && buf[j + 3] === 0xfd))
                            j++;
                        try {
                            parts.push(zstdDecompressSync(buf.subarray(i + 4, j)));
                        }
                        catch { /* frame skip */ }
                        i = j;
                    }
                    else
                        i++;
                }
                return Buffer.concat(parts).toString('utf8');
            }
            return buf.toString('utf8');
        };
        const _maxSeq = (text) => {
            let max = 0;
            const re = /"seq"\s*:\s*(\d+)/g;
            let m;
            while ((m = re.exec(text))) {
                const n = parseInt(m[1], 10);
                if (n > max)
                    max = n;
            }
            return max || text.split('\n').length;
        };
        const _registryRead = () => {
            const f = join(_metaOf(), '.distilled-sessions.json');
            if (!existsSync(f))
                return {};
            try {
                // 注册表实际形状：{ version, sessions: [{ id, cutoff, ... }]} —— 数组转映射（2026-08-27 修复：此前按对象属性查找永远 miss，增量蒸馏从不生效）
                const j = JSON.parse(readFileSync(f, 'utf8'));
                const out = {};
                for (const s of j.sessions || []) {
                    if (s && s.id)
                        out[s.id] = { cutoff: s.cutoff };
                }
                return out;
            }
            catch {
                return {};
            }
        };
        const _markDistilled = (sid, cutoff) => {
            const meta = _metaOf();
            if (!meta)
                return;
            _runPy([join(meta, 'explicit_facts_extractor.py'), '--mark-distilled', sid, '--cutoff', String(cutoff)]);
        };
        const _writeFacts = (facts) => {
            const meta = _metaOf();
            const root = activeRootOf();
            if (!meta || !root || !facts.length)
                return { written: 0, filtered: 0, capped: 0 };
            let written = 0, filtered = 0, capped = 0;
            const seenSlugs = new Set();
            const MAX_WRITES_PER_RUN = 15; // 单轮落笔上限（2026-08-27 风暴修复：101 条垃圾一次性入库的教训）
            for (const [i, f] of facts.entries()) {
                const txt = String(f.text || '').trim();
                if (!txt)
                    continue;
                // 写门前置质量门：与提取端 _is_garbage 同口径兜底（无 CJK 正文 / 工程残迹 / 结构碎片 / 多行 / 表格行 / 无句号收尾）
                const head = txt.slice(0, 80);
                if (!/[\u4e00-\u9fff]/.test(head) || /^\W{4,}/.test(txt.slice(0, 24)) || /\{\s*"/.test(head)
                    || /^[A-Za-z0-9_/:.\s-]*(GET|POST)\s+\//.test(txt)
                    || txt.includes('\n') || txt.trimStart().startsWith('|') || txt.includes(' | ') || txt.includes('`')
                    || !/[。！？]$/.test(txt)
                    || /不要记|别记|不用记|勿记|别写进记忆|无需记录|不必记录|别惦记/.test(txt)) {
                    filtered++;
                    continue;
                }
                if (written + 1 > MAX_WRITES_PER_RUN) {
                    capped++;
                    continue;
                }
                let slug = (txt.replace(/^[-*•\s·]+/, '').replace(/[\\/:*?"<>|{}()[\]·\s]/g, '-') || ('fact-' + i)).slice(0, 24);
                slug = slug.replace(/^-+/, '') || ('fact-' + i);
                // 批内去重：同名合并进同一条，不产生 -1/-2 序列文件
                if (seenSlugs.has(slug)) {
                    written += 0;
                    continue;
                }
                seenSlugs.add(slug);
                const tmp = join(tmpdir(), 'shoucang-fact-' + Date.now() + '-' + i + '.md'); // i 避免同毫秒碰撞（2026-08-27 修复：此前循环共用同名 tmp 内容互相污染）
                const md = '---\ntype: memory\nname: ' + slug + '\ntitle: "' + txt.slice(0, 20).replace(/"/g, '') + '"\nsubtype: ref\nstage: daily\nconfidence: 60\ncreated: ' + new Date().toISOString().slice(0, 10) + '\nupdated: ' + new Date().toISOString().slice(0, 10) + '\ndescription: 空闲巩固-蒸馏\n---\n\n' + txt + '\n';
                writeFileSync(tmp, md, 'utf8');
                const out = _runPy([join(meta, 'merge_check.py'), tmp, '--dir', '日记忆', '--apply']);
                if (out.includes('已写入') || out.includes('已合并')) {
                    written++;
                    continue;
                }
                // 写门未落笔且非重复合并 → 视为被拒（如 suspect 分支异常），计数观察
                if (!out.includes('decision'))
                    filtered++;
            }
            return { written, filtered, capped };
        };
        const consolidateRound = (force = false) => {
            const root = activeRootOf();
            if (!root)
                return { ok: false, error: 'no-active-root' };
            const got = _cfgOf();
            const res = { at: new Date().toISOString(), steps: {} };
            const rawIdle = got ? got.cfg.idle_review_ms : undefined;
            const idleMs = (rawIdle === undefined || rawIdle === null) ? 600000 : Number(rawIdle); // 0=禁用（falsy 修复）
            // 1b 心跳活动门（落地方案）：会话源最新文件 mtime 作为「用户活跃」旁证——R1 注入 off 时
            // lastActiveAt 不再随注入装配更新，但用户发消息会刷新会话 jsonl，据此不误触发心跳
            let sessionActiveMs = 0;
            const idleSessDir = got ? _sessionsDir(got.cfg) : '';
            if (idleSessDir) {
                const f = _latestSession(idleSessDir);
                if (f) {
                    try {
                        sessionActiveMs = statSync(f).mtimeMs;
                    }
                    catch { /* stat 失败忽略 */ }
                }
            }
            const activeSince = Math.max(idleState.lastActiveAt, sessionActiveMs);
            if (!force && idleMs > 0 && Date.now() - activeSince < idleMs) {
                res.skipped = 'not-idle-yet';
                return res;
            }
            if (idleState.running) {
                res.skipped = 'already-running';
                return res;
            }
            pyRoundCalls = 0; // 2d 配额：每轮开始归零
            inConsolidate = true; // 配额仅作用于 consolidate 会话内（RPC 交互路径不受限）
            idleState.running = true;
            try {
                const meta = _metaOf();
                const dir = _sessionsDir(got ? got.cfg : null);
                if (dir && meta) {
                    const file = _latestSession(dir);
                    if (!file) {
                        res.steps.distill = { note: 'sessions_dir 内无会话文件' };
                    }
                    else {
                        let text = '';
                        if (/\.zst(a|d)?$/i.test(file)) {
                            const dec = _runPy([join(meta, 'session_decode.py'), file, join(tmpdir(), 'shoucang-session-dec.jsonl')]);
                            text = readFileSync(join(tmpdir(), 'shoucang-session-dec.jsonl'), 'utf8');
                        }
                        else {
                            try {
                                text = _decodeBuf(readFileSync(file));
                            }
                            catch {
                                text = '';
                            }
                        }
                        // sid 带会话目录名（session-<uuid>）：同名 session.jsonl.zstd 导出互不污染 cutoff 边界
                        const _segs = file.split(/[\\/]/);
                        const _fname = _segs.pop() || 's';
                        const _folder = _segs.pop() || '';
                        const sid = 'idle-' + (_folder ? _folder.replace(/[^A-Za-z0-9._-]+/g, '-') + '-' : '') + _fname.replace(/\.(zst|zstd|jsonl|md|txt)$/i, '');
                        const tmp = join(tmpdir(), 'shoucang-session-' + Date.now() + '.jsonl');
                        writeFileSync(tmp, text, 'utf8');
                        const reg = _registryRead()[sid];
                        const args = [join(meta, 'explicit_facts_extractor.py'), tmp, '--session', sid];
                        if (reg && reg.cutoff != null)
                            args.push('--cutoff', String(reg.cutoff));
                        const out = _runPy(args);
                        let facts = [];
                        try {
                            const j = JSON.parse(out);
                            facts = Array.isArray(j.facts) ? j.facts : [];
                        }
                        catch { /* parse fail */ }
                        if (facts.length) {
                            const w = _writeFacts(facts);
                            _markDistilled(sid, _maxSeq(text));
                            res.steps.distill = { session: sid, facts: facts.length, written: w.written, filtered: w.filtered, capped: w.capped, attach: true };
                            idleState.lastDistillAt = Date.now();
                        }
                        else {
                            res.steps.distill = { session: sid, facts: 0, note: '无新事实或已蒸馏', raw: out.slice(-90) };
                        }
                        try {
                            unlinkSync(tmp);
                        }
                        catch { /* 残留无害 */ }
                    }
                }
                else {
                    res.steps.distill = { note: '无会话源（需配置 idle.sessions_dir）' };
                }
                const rawInterval = got ? got.cfg.interval_hours : undefined;
                const intervalH = (rawInterval === undefined || rawInterval === null) ? 24 : Number(rawInterval); // 0=禁用（falsy 修复）
                if (meta && intervalH > 0 && Date.now() - idleState.lastSettleAt >= intervalH * 3600000) {
                    const out = _runPy([join(meta, 'lifecycle_settle.py'), 'settle', '--apply']);
                    res.steps.settle = { ran: true, rawTail: out.slice(-100) };
                    idleState.lastSettleAt = Date.now();
                }
                else {
                    res.steps.settle = { ran: false };
                }
            }
            catch (e) {
                res.error = String(e).slice(0, 200);
            }
            finally {
                idleState.running = false;
                inConsolidate = false; // 配额会话结束
            }
            return res;
        };
        route('/idle/status', (_req, res) => {
            const got = _cfgOf();
            sendJson(res, 200, { ...idleState, now: Date.now(), idleMs: got ? got.cfg.idle_review_ms ?? 600000 : 600000, sessionsDir: _sessionsDir(got ? got.cfg : null) });
        });
        route('/idle/consolidate', async (_req, res) => {
            sendJson(res, 200, consolidateRound(true));
        });
        // ---- 向量检索（召回面）：配置体检 + 重建/迁移重嵌 ----
        const _runVector = (args) => {
            const meta = _metaOf();
            if (!meta)
                return { out: JSON.stringify({ error: 'no-active-root' }), raw: '' };
            const raw = _runPy([join(meta, 'vector_search.py'), ...args]);
            let out = '';
            try {
                out = raw.trim();
                JSON.parse(out);
            }
            catch (e) {
                out = raw.trim();
            }
            return { out, raw };
        };
        route('/vector/status', (_req, res) => {
            const r = _runVector(['check']);
            sendJson(res, 200, safeJson(r.out));
        });
        route('/vector/build', async (req, res) => {
            const body = await readBody(req).catch(() => ({}));
            const force = !!body.force;
            const r = _runVector(['build', ...(force ? ['--force'] : [])]);
            if (force)
                injectCache.at = 0; // 索引重建后注入无关，但保持缓存策略一致
            const js = safeJson(r.out);
            sendJson(res, 200, { ...js, force });
        });
        // ---- 向量模型一键下载/部署（2026-08-27 · 框架+可选下载） ----
        const _runModel = (args) => {
            const meta = _metaOf();
            if (!meta)
                return { out: JSON.stringify({ error: 'no-active-root' }), ok: false };
            const raw = _runPy([join(meta, 'model_manager.py'), ...args]);
            const j = safeJson(raw.trim() || '{}');
            return { out: raw.trim(), ok: !j.error };
        };
        route('/model/list', (_req, res) => {
            const r = _runModel(['list']);
            sendJson(res, 200, r.ok ? safeJson(r.out) : { error: r.out.slice(0, 400) });
        });
        route('/model/pull', async (req, res) => {
            const body = await readBody(req).catch(() => ({}));
            const id = String(body.id || '').trim();
            const repo = String(body.repo || '').trim();
            if (!id || !repo)
                return sendJson(res, 400, { error: '需要 id 与 repo' });
            const meta = _metaOf();
            if (!meta)
                return sendJson(res, 400, { error: 'no-active-root' });
            // 后台下载（模型数百 MB，同步会卡 RPC）：detached spawn + 前端轮询 /model/progress
            const py = PY;
            const child = spawn(py, [join(meta, 'model_manager.py'), 'pull', id, repo, '--dim', String(body.dim || 1024)], { detached: true, stdio: 'ignore', windowsHide: true });
            child.unref();
            sendJson(res, 200, { ok: true, started: true, id, repo, hint: '轮询 /model/progress' });
        });
        route('/model/progress', async (req, res) => {
            const body = await readBody(req).catch(() => ({}));
            const id = String(body.id || '').trim();
            if (!id)
                return sendJson(res, 400, { error: 'id required' });
            const r = _runModel(['progress', id]);
            sendJson(res, 200, safeJson(r.out));
        });
        route('/model/import', async (_req, res) => {
            // 打开本地文件夹选择器：复用插件生态的 ctx.directoryPicker.pick()（系统对话框）
            const picker = ctx.directoryPicker;
            if (!picker?.pick)
                return sendJson(res, 400, { error: 'directoryPicker 能力不可用（宿主未装配目录选择器）' });
            let dir = null;
            try {
                dir = await picker.pick();
            }
            catch (e) {
                return sendJson(res, 500, { error: '目录选择器失败: ' + String(e.message || e).slice(0, 160) });
            }
            if (!dir)
                return sendJson(res, 200, { ok: false, cancelled: true });
            const r = _runModel(['import', dir]);
            const j = safeJson(r.out);
            // 只登记不接管配置：用户点「部署并启用」时才自动写 embedding（单一职责）
            sendJson(res, 200, { ...j, picked: dir });
        });
        route('/model/deploy', async (req, res) => {
            const body = await readBody(req).catch(() => ({}));
            const id = String(body.id || '').trim();
            if (!id)
                return sendJson(res, 400, { error: 'id required' });
            const r = _runModel(['deploy', id, ...(body.port ? ['--port', String(body.port)] : []), ...(body.dim ? ['--dim', String(body.dim)] : [])]);
            const j = safeJson(r.out);
            if (!j.error) {
                // 一键生效：自动写 embedding 配置（setKey 定位既有行；写前备份）
                const file = configFileOf();
                if (file && j.port) {
                    let next = null;
                    try {
                        next = setKey(readFileSync(file, 'utf8'), 'shoucang.embedding.base_url', `http://127.0.0.1:${j.port}`);
                        if (next) {
                            next = setKey(next, 'shoucang.embedding.model', id);
                            if (next && j.dim)
                                next = setKey(next, 'shoucang.embedding.dimension', String(j.dim));
                        }
                    }
                    catch {
                        next = null;
                    }
                    if (next) {
                        backupThenWrite(file, next);
                        injectCache.at = 0;
                    }
                }
            }
            sendJson(res, 200, { ...j, configured: !j.error && !!j.port });
        });
        const hb = setInterval(() => { try {
            consolidateRound(false);
        }
        catch { /* 心跳异常不阻塞 */ } }, 60000);
        disposers.push(() => clearInterval(hb));
        return () => { for (const d of disposers)
            d(); };
    }, '@dsh-external/shoucang-panel: http rpc + hot memory injection');
}
//# sourceMappingURL=panel.js.map