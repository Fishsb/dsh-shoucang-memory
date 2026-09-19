/**
 * @dsh-external/shoucang-panel / inject — 注入与写回领域（热记忆注入挂点 + 向量 + 记忆写端点）。
 * 端点：GET /inject/preview · /inject/stats · /vector/status2 · /vector/cache/clear ·
 *      GET+POST /embed/config · POST /embed/test ·
 *      POST /memory/section-edit · /memory/edit · /memory/remove · /memory/approve
 *      + /scnote 命令 + systemPrompt 注入挂点（须挂 ctx.effect）
 * 依赖窄传：7 个；ctx 另传（只有 effect/systemPrompt 挂点需要宿主上下文）。
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { knowledgeRoot, memoryLibRoot, isRealUserEvent } from './targets.js';
import { acquireBankLock, releaseBankLock } from './bank-lock.js';
import { gatedWriteFile } from './section-rewrite.js';
import { clearVecCache, vecStats } from './vec.js';
import { contractFor } from './panel-contract.js';
// S-P4e（2026-09-16）注入侧跨形态消重（薄引用缝：异步预热 + 同步逐字过滤）
import { warmInjectDedup, filterInjectedText, dedupState } from './crossform-dedup.js';
// S-P5（2026-09-17 圆桌会议）：注入边界 `{{` 防护**单一实现**（宿主 interpolate 三处 throw）。
//   本处与 `mcl.ts` 两处注入出口共用同一实现——两处各写一份即漂移源头。
//   ⚠ 只在**真注入出口**加，`/inject/preview` 保持原文（观测面 ≠ 真注入面，混同即假绿）。
import { guardContextText } from './inject-guard.js';
import { injectCacheReason } from './dynamic-select.js';
import { preheatWarmRecall } from './relevance-supply.js';
import { layerOfReason, libStampOf } from './supply-stamp.js';
import { isLocalBase, parseView, probeLocalEmbed, readBody, sendJson } from './panel-shared.js';
import { fileReadStats, nonEmptyLineCount, statSize } from './file-stat-cache.js';
// ── 空闲巩固轮（Letta-heartbeat 模式 · 2026-08-27）：蒸馏/合并/归档/结算 一体化 ──
const _cfgOf = (d) => {
    const f = d.root.configFileOf();
    if (!f || !existsSync(f))
        return null;
    try {
        return { cfg: parseView(readFileSync(f, 'utf8')), file: f };
    }
    catch {
        return null;
    }
};
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
// U2（2026-09-09，ui-impl-plan）：记忆写端点（编辑/删除/批准）——全部走既有门禁：
//   edit/remove → 临时文件整改 → memory_write_gate（exit 0 才 rename；失败回滚不落盘）
//   approve → 候选移 .processed（确认有价值，内容由蒸馏正常入册；候选无结构化小节不强行归纳）
// 安全网：file 白名单 + 前端 confirm（remove）+ write_gate 备份。用户显式触发，非热路径。
const NOTE_WRITE_RELS = ['env', 'tools', 'flows', 'lessons', 'release', 'user', 'agent'];
// 7 件（INDEX 禁写）
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
/** v2（ADR-122）：面板写入后的库 git 快照（best-effort；不动写门语义，失败静默） */
const snapshotBank = (d) => {
    try {
        const script = join(memoryLibRoot(), 'scripts', 'bank-git.mjs');
        if (!existsSync(script))
            return;
        execFile('node', [script, '--message', `memory: panel-write @ ${new Date().toISOString().slice(0, 19)}`], { env: { ...process.env, MEMORY_ROOT: memoryLibRoot() }, windowsHide: true, timeout: 20000 }, (err) => {
            /* 2026-09-17 修（D-Silent）：原为空回调 ⇒ 快照失败**零痕迹**，使用者会以为面板写入已入库。
             *   语义不变（仍 best-effort、仍不抛），但失败不再沉默。 */
            if (!err)
                return;
            try {
                d?.logger.warn?.('[shoucang] bank 快照失败（面板写入未入记忆库 git）：' + String(err.message || err).slice(0, 160));
            }
            catch { /* */ }
        });
    }
    catch (e) {
        try {
            d?.logger.warn?.('[shoucang] bank 快照启动失败：' + String(e?.message || e).slice(0, 160));
        }
        catch { /* */ }
    }
};
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
    const root = memoryLibRoot();
    const abs = join(root, file);
    // S2S3 册零（2026-09-19）：① 原 tmp 名固定（`.ui-tmp`）⇒ 同文件并发面板写互踩；② 无锁。
    //   现取**库锁**（与蒸馏/深睡同一把）并用**唯一 tmp 名**的带门禁原语。
    const h = acquireBankLock(root, { note: 'panel-write' });
    if (!h)
        return { ok: false, reason: '库锁被占用（拒写，防并发覆盖）' };
    try {
        const w = await gatedWriteFile(abs, nextText, async (tmp) => {
            const g = await gateWrite(file, tmp);
            return { ok: g.ok, out: g.out, raw: g.reason };
        });
        return w.ok ? { ok: true, out: '' } : { ok: false, reason: w.error, out: w.gate };
    }
    finally {
        releaseBankLock(h);
    }
};
/**
 * **有效嵌入配置**（落盘 ∪ 缺省）——**单一实现**，`/vector/status2` 与 `/embed/config` 共用。
 *
 * 缺省语义对齐 `scheduler.Config`：enabled=true · baseUrl=本地 Ollama · model=bge-m3 · apiKeyEnv=EMBED_API_KEY。
 * ⚠ 实测缺陷（2026-09-14）：此前**两处各写一份**缺省，且 `/embed/config` 只返回 `persisted`（scheduler.json 中
 *   **显式写过**的键）⇒ 面板嵌入卡把"生效中的缺省"显示成**未配置**，把人引去填一个本来就有值的项。
 *   收敛成这一份后，UI 报的是**有效值**，并可用 `isDefault` 如实标注"缺省"。
 */
const effectiveEmbed = (p) => ({
    enabled: p.embedEnabled !== false,
    baseUrl: String(p.embedBaseUrl || 'http://127.0.0.1:11434/v1'),
    model: String(p.embedModel || 'bge-m3'),
    apiKeyEnv: String(p.embedApiKeyEnv || 'EMBED_API_KEY'),
});
async function vectorStatus2Route(d, _req, res) {
    try {
        const p = d.suite.read();
        const running = effectiveEmbed(p); // 缺省语义见上方单一实现
        // 探测本机服务 → provider 标签（子进程清 NODE_OPTIONS 防 inspector 残留干扰）
        let provider = 'off', localOk = false;
        const local = isLocalBase(running.baseUrl);
        if (running.enabled && local) {
            const p2 = await probeLocalEmbed(running.baseUrl); // D-I4：原同步探测阻塞宿主 12s；改异步后不阻塞（契约不变：仍是同一次请求内返回）
            provider = p2.provider;
            localOk = p2.ok;
        }
        else if (running.enabled)
            provider = 'cloud';
        /* 缓存统计 —— 2026-09-17（D-I5）：原为**每次请求全量同步读** ~10MB（`readFileSync().split().filter().length`）
         *   只为取一个行数，而前端 `panes-toggles.js:435` **每 30s** 轮询一次 ⇒ 走 (mtimeMs,size) 失效的缓存，
         *   文件未变时零重读；尺寸同样走缓存的 stat。 */
        let cacheLines = 0, cacheKB = 0;
        try {
            const f = join(knowledgeRoot(), '.vector-cache.jsonl');
            if (existsSync(f)) {
                cacheKB = Math.round(Math.max(0, statSize(f)) / 1024);
                cacheLines = Math.max(0, nonEmptyLineCount(f));
            }
        }
        catch { /* 无缓存 */ }
        const stats = { queries: vecStats.queries, lastMode: vecStats.lastMode, lastMs: vecStats.lastMs, lastAt: vecStats.lastAt, lastQuery: vecStats.lastQuery, lastHit: vecStats.lastHit };
        sendJson(res, 200, { ok: true, running, persisted: p, provider, localOk, cache: { lines: cacheLines, kb: cacheKB }, stats, readStats: { ...fileReadStats } });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
async function embedConfigRoute(d, req, res) {
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
            const merged = { ...d.suite.read(), ...patch };
            d.suite.write(merged);
            d.logger.info?.(`[shoucang] embed config updated: ${Object.keys(patch).join(',')}（重载后生效）`);
            return sendJson(res, 200, { ok: true, merged, reloadRequired: true });
        }
        // GET：同时给 **persisted**（落盘）与 **effective**（落盘∪缺省）+ 每键是否走缺省。
        //   实测缺陷：此前只给 persisted ⇒ 默认值（本地 Ollama）被 UI 当成"未配置"（且客户端读的键还是错的）。
        const p = d.suite.read();
        sendJson(res, 200, {
            persisted: p,
            effective: effectiveEmbed(p),
            isDefault: {
                embedEnabled: !('embedEnabled' in p),
                embedBaseUrl: !p.embedBaseUrl,
                embedModel: !p.embedModel,
                embedApiKeyEnv: !p.embedApiKeyEnv,
            },
        });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
async function embedTestRoute(d, req, res) {
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
}
function vectorCacheClearRoute(d, _req, res) {
    try {
        const r = clearVecCache();
        d.hot.invalidate(); // 缓存清理后召回将重建，注入无关但保持缓存策略一致
        sendJson(res, 200, r);
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
async function memorySectionEditRoute(d, req, res) {
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
        d.hot.invalidate();
        snapshotBank(d); // v2：库 git 快照（面板写后；best-effort；失败可见化 D-Silent）
        return sendJson(res, 200, { ok: true });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
async function memoryEditRoute(d, req, res) {
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
        d.hot.invalidate();
        snapshotBank(d); // v2：库 git 快照（面板写后；best-effort；失败可见化 D-Silent）
        return sendJson(res, 200, { ok: true });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
async function memoryRemoveRoute(d, req, res) {
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
        d.hot.invalidate();
        snapshotBank(d); // v2：库 git 快照（面板写后；best-effort；失败可见化 D-Silent）
        return sendJson(res, 200, { ok: true });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
/* 册一（2026-09-19）：候选处置**双根 + 动作语义分离**。
 *
 * 判因（实测，两处真缺陷）：
 *  ① **读写两侧各绑不同根**：读侧 `panel-memory.ts#memOverviewOf(base)` 读的是 memory 库根
 *     （`memoryLibRoot()`），而本端点原只读 `knowledgeRoot()/pending` ⇒ UI 显示「候选 0 条」
 *     而真候选 9 条躺在 suite 根，**点不到也批不动**（根因 C2）。
 *  ② **批准与忽略调同一端点同一参数**：原实现只认 `pendingFile`，一律 `renameSync` 到
 *     `.processed/` ⇒ 两个语义相反的按钮**效果完全相同**，唯一区别是前端那句文案。
 *     这是「看得见的操作是假的」——比「看不到」更严重。
 *
 * 现语义：`pendingFile` + 可选 `root`（memory|suite|flow-candidates，缺省按 flow-candidates →
 *   suite → memory 顺序探测，向后兼容旧调用）+ 可选 `action`（approve 缺省 | ignore）。
 *   · approve ⇒ 移入该区 `.processed/`（= 内容由蒸馏正常入册）
 *   · ignore  ⇒ 移入该区 `.ignored/`（= 明确丢弃，不入册）
 *   ⚠ 两区物理分离，**效果可区分且可审计**（原先两者混在同一 `.processed/`，事后无法分辨）。
 */
const PENDING_ZONES = [
    { zone: 'flow-candidates', dir: join(knowledgeRoot(), 'pending', 'flow-candidates') },
    { zone: 'suite', dir: join(knowledgeRoot(), 'pending') },
    { zone: 'memory', dir: join(memoryLibRoot(), 'pending') },
];
async function memoryApproveRoute(d, req, res) {
    try {
        const body = (await readBody(req).catch(() => ({})));
        const pf = String(body.pendingFile || '').trim().replace(/^.*[\\/]/, '');
        if (!/^[\w\u4e00-\u9fa5-]+\.md$/.test(pf))
            return sendJson(res, 400, { error: 'bad pending file' });
        const action = body.action === 'ignore' ? 'ignore' : 'approve';
        const wantRoot = String(body.root || '').trim();
        // 显式 root ⇒ 只查该区（不静默回退，避免"批准了另一个根"的静默错位）
        const zones = wantRoot ? PENDING_ZONES.filter((z) => z.zone === wantRoot) : PENDING_ZONES;
        if (!zones.length)
            return sendJson(res, 400, { error: 'bad root（允许：memory | suite | flow-candidates）' });
        let hit = null;
        for (const z of zones) {
            const src = join(z.dir, pf);
            if (existsSync(src)) {
                hit = { zone: z.zone, dir: z.dir, src };
                break;
            }
        }
        // 向后兼容：旧调用不带 root 时，若根 pending 命中过即按 suite 语义处理（该区 dir 即根）
        if (!hit)
            return sendJson(res, 404, { error: 'candidate not found', searched: zones.map((z) => z.zone) });
        const sub = action === 'ignore' ? '.ignored' : '.processed';
        const destDir = join(hit.dir, sub);
        try {
            mkdirSync(destDir, { recursive: true });
            // 同名冲突可见化：忽略区与处理区可能已有同名（重复处置）⇒ 追加时间戳，不静默覆盖
            let dest = join(destDir, pf);
            if (existsSync(dest))
                dest = join(destDir, pf.replace(/\.md$/, '') + '-' + Date.now() + '.md');
            renameSync(hit.src, dest);
        }
        catch (e) {
            return sendJson(res, 500, { error: 'move fail: ' + String(e.message).slice(0, 100) });
        }
        return sendJson(res, 200, { ok: true, action, root: hit.zone, moved: `${hit.zone}/${sub}/${pf}` });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
function registerVectorRoutes(d) {
    d.route('/vector/status2', async (req, res) => vectorStatus2Route(d, req, res));
    d.route('/embed/config', async (req, res) => embedConfigRoute(d, req, res), contractFor('/embed/config'));
    d.route('/embed/test', async (req, res) => embedTestRoute(d, req, res), contractFor('/embed/test'));
    d.route('/vector/cache/clear', (req, res) => vectorCacheClearRoute(d, req, res), contractFor('/vector/cache/clear'));
}
function registerMemoryWriteRoutes(d) {
    d.route('/memory/section-edit', async (req, res) => memorySectionEditRoute(d, req, res), contractFor('/memory/section-edit'));
    d.route('/memory/edit', async (req, res) => memoryEditRoute(d, req, res), contractFor('/memory/edit'));
    d.route('/memory/remove', async (req, res) => memoryRemoveRoute(d, req, res), contractFor('/memory/remove'));
    d.route('/memory/approve', async (req, res) => memoryApproveRoute(d, req, res), contractFor('/memory/approve'));
}
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
/* IR1 册一（2026-09-18）：**注入侧相关性预热**。注入回调是**同步**的 ⇒ 桥（`warm-recall.json`）是它唯一的
 *   向量通路；而旧实现里桥只由 `mcl.ts` 在 **MCL 慢通道判定的回合**写 ⇒ 多数回合无桥、动态面退位置式基线。
 *   本函数把预热的**唯一入口**收在一处（预览端点与 `agent/pre-step` 都调它），embed 配置与 `/embed/config`
 *   同源（`effectiveEmbed`）⇒ 三处不会各写一份缺省。失败一律**不阻断**（注入面自行记账降级原因）。 */
const preheatFor = async (d, q) => {
    const query = String(q || '').trim();
    if (!query)
        return 'no-query';
    try {
        const p = d.suite.read();
        const r = await preheatWarmRecall({ q: query, root: memoryLibRoot(), embed: effectiveEmbed(p) });
        return r.ok ? 'warmed' : r.reason;
    }
    catch {
        return 'error'; /* 预热失败 ⇒ 注入面走词法/位置式并记账（A3） */
    }
};
async function injectPreviewRoute(d, req, res) {
    let q = '';
    try {
        q = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('q') ?? '';
    }
    catch {
        q = '';
    }
    /* IR1 册一：预览端点与真注入面**读同一座桥** ⇒ 此处按需预热，A1/A2/A4 才可**可重复测量**
     *   （否则预览只能看到"桥恰好装了别的会话 query"的偶然结果）。预热失败不改变响应形状。 */
    await preheatFor(d, q);
    // P0a：预览顺带回带影子记账 —— 这是 B5「每步真实字符数」的实测出口（此前只有测算值无实测对照）
    sendJson(res, 200, { text: d.hot.build(q), q, supplyUsage: d.hot.supplyUsage() });
}
function injectStatsRoute(d, _req, res) {
    /* 2026-09-16：暴露**注入缓存**读数（用户指令「新会话一次 + 压缩后一次」的可验证面）——
     *   `rebuilt` = 重建次数（应为「新会话 + 压缩 + 库变」的合计）· `reused` = 逐字复用次数（应随步数增长）
     *   · `lastReason` ∈ {new, session-changed, compacted, lib-changed} ⇒ 一眼看出为何重建。 */
    const m = d.injectMeta;
    const bySid = m.bySid ? [...m.bySid.values()].sort((a, b) => b.at - a.at).slice(0, 8) : [];
    const preSteps = d.injectMeta.preSteps || [];
    sendJson(res, 200, { calls: d.injectMeta.calls, lastAt: d.injectMeta.lastAt ? new Date(d.injectMeta.lastAt).toISOString() : null, root: d.root.activeRootOf()?.path ?? null, supplyUsage: d.hot.supplyUsage(), cache: { rebuilt: m.rebuilt || 0, reused: m.reused || 0, lastReason: m.lastReason || null, lastQ: m.lastQ || null, bySid,
            // IR1 册四（D2）：**层归因**（`session` / `context` / `query` / `event` / `ttl`）—— 只报最外层 reason
            //   时，"压缩重建"与"上游落盘重建"在读数上**不可分辨**（G4 要的正是这个分辨力）。
            byLayer: m.byLayer || {} },
        // IR1 册五 E5（2026-09-18）：**跨形态消重的读数**（预热状态 + 跳过条数 + 原因）—— 没有它，
        //   "消重接在配额之前"这件事在运行态**不可见**（旧实现只能在离线探针里看）。
        dedup: (() => { try {
            const s = dedupState();
            return { note: s.note, skip: s.skip.length, warmedAt: s.warmedAt || null, reasons: s.reasons.length };
        }
        catch {
            return null;
        } })(),
        // P2（2026-09-18）**通道健康位**：`mounted`=section 是否挂上 · `calls/lastLen`=每步真实求值读数 ·
        //   `lastErr`=被 catch 吞掉的失败（含"空串"）。有它才能区分「生效」与「静默失效」（edge E3+E8）。
        stableChannel: d.injectMeta.stableHealth ?? null });
}
/** systemPrompt 注入挂点（每轮渲染，指针缓存 30s）；systemPrompt 不可用时降级告警。 */
function mountHotMemoryInjection(ctx, d) {
    // 注册 systemPrompt 注入块（每轮渲染，指针缓存 30s）
    const sp = ctx.systemPrompt;
    if (sp && typeof sp.context === 'function') {
        // 任务文本：`dsh-system-prompt:346` 会把 assembly context 传给 text 回调，其中含 `context.agent.session`；
        // 取最近一条 user/message 作相关性 query。
        // ⚠ 2026-09-11 更正一条**已失效**的注释：原文写「取不到即空串 ⇒ 选行回退位置式，不影响可用性」——
        //   该假设成立于「位置式池 = MEMORY.md 全量行」的年代。缺陷1 修复后位置式池本身就是分层过滤后的
        //   `allMem`（只含 P/always），真实库 MEMORY.md 48 条索引行**全为 E 层 gated** ⇒ allMem 为空
        //   ⇒ **回退 = 回退到空**，不再是安全网。gated 载体要靠相关性通道按需取回（见上方 340 行守卫的更正），
        //   空 query 时本就应当不铺 gated——这是设计原意，不是可用性损失。
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
                    // P0 修（2026-09-13，口径统一）：**只认真实用户消息**。DSH 会把宿主注入块（运行态快照 / MCL 慢通道材料 /
                    //   后台回执）也作为 `user/message` 下发，本处原缺来源校验 ⇒ 注入物会被当成 query 去召回自己
                    //   （实测旁证：两个不同问题召回出同一批 6 行）。判别口径与 `mcl.ts` 的 `captureFromEvent`、
                    //   `distill-activation.ts` 的 ACT-024 结构性去污染**一致**（`data.source.kind`）。
                    if (!isRealUserEvent(e))
                        continue; // #4（2026-09-13）：判据收敛为 targets.isRealUserEvent 单一实现
                    const txt = (e.data?.content || []).map((b) => (typeof b?.text === 'string' ? b.text : '')).join(' ').trim();
                    if (txt)
                        return txt.slice(0, 300);
                }
            }
            catch { /* 取不到=空 query */ }
            return '';
        };
        // S-P4e（2026-09-16）**注入侧跨形态消重**：预热一次（fire-and-forget，不阻塞注入；失败不抛；
        //   内部 `warming` 闸保证幂等）。接线点刻意选在**未冻结的调用方**——`panel-shared` 受大模块冻结棘轮约束。
        void warmInjectDedup(memoryLibRoot());
        /* 注入缓存（2026-09-16 **用户指令**）：**新会话注入一次 + 每次上下文压缩后再注入一次**，其余轮次**逐字复用**。
         *   判因（实测）：旧实现每轮重建 —— `/inject/stats calls=535`，而主会话仅 34 步 ⇒ 34 次重建（读盘+选行+消重）。
         *   **失效条件四条，全部可观测**：
         *     ① 无记忆 ⇒ 新会话（或插件热重载后首次）；
         *     ② `sessionId` 变化 ⇒ 换了会话；
         *     ③ **事件条数回落 / 首 seq 前跳** ⇒ 历史被**压缩**重写（宿主 `SessionStartSource` 含 `'compact'`）；
         *     ④ **记忆库戳变化**（三索引 size+mtimeMs，节流 5s）⇒ 睡眠/蒸馏刚写了库。
         *   ⚠ **技术真相（必须留痕，勿误传）**：system prompt 的内容**每步仍会发给模型**（API 语义无法"只发一次"）；
         *     本缓存省的是「**每轮重建**」并保证文本**逐字稳定**（⇒ 提供商 prompt 缓存可命中），**不等于省 token**。
         *     要真正做到"只发一次"须改走**会话消息**通道（`agent/pre-step` 可追加消息），风险与前提见 `docs/OPEN-ITEMS.md`。 */
        const injectMemo = new WeakMap();
        const meta = d.injectMeta;
        const perSid = new Map();
        meta.bySid = perSid;
        const qHashOf = (s) => {
            let h = 5381;
            for (let i = 0; i < s.length; i++)
                h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
            return h.toString(16).padStart(8, '0');
        };
        const bump = (key, q, reason) => {
            const cur = perSid.get(key) || { sid: key, qLen: q.length, qHash: qHashOf(q), reason: '', rebuilt: 0, reused: 0, at: 0 };
            cur.qLen = q.length;
            cur.qHash = qHashOf(q);
            if (reason) {
                cur.reason = reason;
                cur.rebuilt++;
            }
            else
                cur.reused++;
            cur.at = Date.now();
            perSid.set(key, cur);
            if (perSid.size > 12) {
                const oldest = [...perSid.values()].sort((a, b) => a.at - b.at)[0];
                if (oldest)
                    perSid.delete(oldest.sid);
            }
        };
        /* ★IR1 册四（2026-09-18）：**上游戳改成单一实现**（`supply-stamp#libStampOf` = 库戳 ∪ 介质戳）。
         *   旧实现只签**三索引**（`size:mtimeMs`），而 `activity.jsonl` / `sleep-reports.jsonl` 两条介质**不在外层判据里**
         *   ⇒ 运行时"改了介质却不重建"（内层 30s TTL 之外看不见）。现两级都进判据，读数按层归因。 */
        const stampNow = () => { const s = libStampOf(); return { lib: s.lib, media: s.media }; };
        let libStamp = { lib: '', media: '' };
        let libAt = 0;
        const libNow = () => {
            const t = Date.now();
            if (t - libAt < 5000)
                return libStamp; // 与 `supply-stamp` 内部节流同档（双保险：此处零 statSync）
            libAt = t;
            try {
                libStamp = stampNow();
            }
            catch { /* 库不可读 ⇒ 沿用旧戳（失败开放） */ }
            return libStamp;
        };
        /** **层归因**（G4）：各层各重建过多少次 —— `/inject/stats.cache.byLayer` 的读数源 */
        const byLayer = {};
        meta.byLayer = byLayer;
        /* ★2026-09-18（按域路由 P1）**恒定面单独挂 section** —— 落 surface 节点 0 ⇒ 压缩豁免。
         *
         * 判因（实测）：守藏原注入走 `systemPrompt.context` ⇒ 落 `user/message`（**可压区**，实测节点索引 3）；
         *   而 `systemPrompt.section` ⇒ 落 **节点 0**（`compaction-basic/lib/index.js:393-398` 证明节点 0
         *   是 system/message 时 firstIdx 从 1 起 ⇒ 物理豁免）。
         * 为什么只搬恒定面：恒定面（双画像索引行 + P 层画像行 + 三层判据常驻块）与 query **无关**
         *   （`readCarrier` 全文无 q 引用，实测）⇒ 会话内恒定 ⇒ `agent-loop:276` 判 head.text === rendered ⇒ **零写入**，
         *   节点 0 稳定；动态面依赖 query，内容变化在 in-history 模式下会走 `:280` **append（落可压区）** ⇒ 不可搬。
         * ⚠ 出口必须转义 `{{`：`dsh-system-prompt:155-167` 遇未注册变量**硬抛错、会话不可恢复**（复用 guardContextText）。
         * ⚠ **必须以接收者形式调用**（`sp.section(...)`）：该方法是类方法，内部用 `this.layers`/`this.ctx`
         *   （`dsh-system-prompt:238-240`）；先解构成 `const f = sp.section` 再调会丢 this ⇒
         *   `Cannot read properties of undefined (reading 'layers')`（实测踩过，由健康位 `mountErr` 暴露）。
         * 幂等：与 context 通道**同一份 cache.sd** ⇒ 无第二套状态；`buildStable()` 零副作用（不重跑 build）。 */
        const spS = sp;
        /** section 挂成功 ⇒ context 通道必须剔除 stable（否则同一内容两处注入）。挂失败 ⇒ 回落完整形态（零回归）。 */
        let stableMounted = false;
        /** P2（2026-09-18）**通道健康位**：section 侧每次求值的实测读数（暴露到 `/inject/stats`）。
         *  判因（edge 审查 E3+E8）：注入通道整体失效时**两层 catch 全吞** ⇒ 落回旧形态而"看起来正常"
         *  ⇒ 没有健康位就分不清「section 生效」与「section 静默失效」。 */
        const health = { mounted: false, hasSection: false, mountErr: '', calls: 0, lastLen: -1, lastErr: '', at: 0 };
        d.injectMeta.stableHealth = health;
        health.hasSection = typeof spS.section === 'function';
        if (typeof spS.section === 'function') {
            try {
                d.disposers.push(spS.section({
                    name: 'shoucang-hot-memory-stable',
                    order: 88, // 与 context 通道同序（宿主按 order 升序；两条通道各自排序，互不干扰）
                    text: () => {
                        health.calls++;
                        health.at = Date.now();
                        try {
                            const s = d.hot.buildStable();
                            health.lastLen = s.length;
                            if (!s)
                                health.lastErr = health.lastErr || '(空串：cache.sd 未生成或恒定面为空)';
                            return guardContextText(s);
                        }
                        catch (e) {
                            health.lastErr = String(e?.message || e).slice(0, 200);
                            return '';
                        }
                    },
                }));
                stableMounted = true;
                health.mounted = true;
                d.logger.info?.('[shoucang] 恒定面 section 已挂（节点 0 · 压缩豁免）');
            }
            catch (e) {
                health.mountErr = String(e?.message || e).slice(0, 300);
                d.logger.warn?.('[shoucang] 恒定面 section 挂载失败（回落 context 单通道）：' + health.mountErr);
            }
        }
        else {
            health.mountErr = '(sp.section 不是函数：宿主版本或 scoped ctx 差异)';
            d.logger.warn?.('[shoucang] systemPrompt.section 不可用 ⇒ 恒定面仍随 context 注入（无压缩豁免）');
        }
        d.disposers.push(sp.context({
            name: 'shoucang-hot-memory',
            order: 88, // mneme: user-settings=85 / memory=90 —— 守藏热记忆在其间
            // 注入前按"已被粗粒度行涵盖"的细粒度行做**逐字**过滤。
            //   **失败开放**：预热未完成/向量不可用 ⇒ skip 空 ⇒ 注入面**逐字节回基线**
            //   （消重是优化，绝不能因向量不可用而少注入内容）。
            text: (context) => {
                meta.calls++;
                meta.lastAt = Date.now();
                const holder = context?.agent;
                const evs = context?.agent?.session?.snapshotEvents?.();
                const arr = Array.isArray(evs) ? evs : [];
                const sid = String(context?.agent?.session?.id ?? '');
                const firstSeq = Number(arr[0]?.seq ?? -1);
                const lib = libNow(); // IR1 册四：`{lib, media}` 两级上游戳（单一实现 `supply-stamp#libStampOf`）
                const q = taskTextOf(context);
                /* 只记**指纹**（长度 + djb2 哈希），不回抄用户正文 —— 见上方 `perSid` 抬头。 */
                meta.lastQ = q ? `${q.length}:${qHashOf(q)}` : '(空)';
                const sidKey = sid ? sid.slice(-8) : '(anon)';
                const hit = holder ? injectMemo.get(holder) : undefined;
                const reason = injectCacheReason(hit, { sid, evLen: arr.length, firstSeq, lib: lib.lib, media: lib.media, q });
                if (hit && !reason) {
                    meta.reused = (meta.reused || 0) + 1;
                    bump(sidKey, q, '');
                    return hit.text;
                }
                const text = guardContextText(filterInjectedText(stableMounted ? d.hot.buildDynamic(q) : d.hot.build(q), dedupState().skip));
                if (holder)
                    injectMemo.set(holder, { text, sid, evLen: arr.length, firstSeq, lib: lib.lib, media: lib.media, q });
                meta.rebuilt = (meta.rebuilt || 0) + 1;
                meta.lastReason = reason || 'new';
                // IR1 册四（D2）**层归因计数**：`/inject/stats.cache.byLayer` —— 分清"压缩重建"与"上游落盘重建"
                byLayer[layerOfReason(reason || 'new')] = (byLayer[layerOfReason(reason || 'new')] || 0) + 1;
                bump(sidKey, q, reason || 'new');
                return text;
            },
        }));
        const preSteps = [];
        d.injectMeta.preSteps = preSteps;
        const hook = ctx;
        if (typeof hook.on === 'function') {
            try {
                d.disposers.push(hook.on('agent/pre-step', async (payload, next) => {
                    try {
                        const p = payload;
                        const msgs = Array.isArray(p?.messages) ? p.messages : [];
                        const seqs = msgs.map((m) => Number(m?.seq ?? -1)).filter((n) => n >= 0);
                        const firstSeq = seqs.length ? Math.min(...seqs) : -1;
                        const lastSeq = seqs.length ? Math.max(...seqs) : -1;
                        const prev = preSteps.filter((x) => x.sid === String(p?.agent?.session?.id ?? '')).slice(-1)[0];
                        /* IR1 册一（2026-09-18）**预热挂点**：注入回调是同步的 ⇒ 桥是它唯一的向量通路。
                         *   此处与注入面用**同一个 `taskTextOf`** 取任务文本 ⇒ 桥的键与读侧必然同键（不是"多半能对上"）。
                         *   桥已新鲜 ⇒ `skip-fresh`（零嵌入开销、不阻塞该步）；失败/超时 ⇒ 注入面转词法并**记账**。 */
                        const warm = await preheatFor(d, taskTextOf(payload));
                        preSteps.push({
                            sid: String(p?.agent?.session?.id ?? '').slice(-8),
                            step: Number(p?.step ?? -1),
                            n: msgs.length,
                            firstSeq,
                            lastSeq,
                            delta: prev ? msgs.length - prev.n : 0,
                            // 宿主是否已把 runtime context 作为消息塞进来（判"追加消息"这条路是否已被宿主自己走通）
                            hasCtx: msgs.some((m) => {
                                const c = m.content;
                                const t = Array.isArray(c) ? c.map((b) => String(b?.text ?? '')).join('') : '';
                                return t.includes('Current runtime context') || t.includes('【认知环');
                            }),
                            isFirst: !prev,
                            warm,
                            at: Date.now(),
                        });
                        if (preSteps.length > 60)
                            preSteps.splice(0, preSteps.length - 60);
                    }
                    catch { /* 观测失败绝不影响这一步 */ }
                    return await next();
                }));
                d.logger.info?.('[shoucang] pre-step 只读观测已挂（不改行为）');
            }
            catch (e) {
                d.logger.warn?.('[shoucang] pre-step 观测挂载失败：' + String(e?.message || e));
            }
        }
    }
    else {
        d.logger.warn?.('[shoucang] systemPrompt 能力不可用，R1 热记忆注入未注册');
    }
}
/** effect 体内装配：注入挂点 + 向量路由 + 记忆写路由；返回卸载器。 */
function mountInjectEffect(ctx, d) {
    d.logger.info?.('[shoucang] host RPC ready: roots(roots|get_root|set_root|bootstrap)/config(save|toggle|set)/memory(overview|sections|section-edit|edit|remove|approve)/suite/mcl-status/criteria/cognition-report/deepsleep(status|trigger|config)/distill(run|config)/vector(status2|cache-clear)/embed(config|test)/llm-models/inject(preview|stats)');
    mountHotMemoryInjection(ctx, d);
    registerVectorRoutes(d);
    registerMemoryWriteRoutes(d);
    return () => { for (const dispose of d.disposers)
        dispose(); };
}
export function registerInject(ctx, d) {
    d.route('/inject/preview', (req, res) => injectPreviewRoute(d, req, res));
    d.route('/inject/stats', (req, res) => injectStatsRoute(d, req, res));
    registerScnoteCommand(ctx, d);
    ctx.effect(() => mountInjectEffect(ctx, d), '@dsh-external/shoucang-panel: http rpc + hot memory injection');
}
/** /scnote 命令注册（commands 能力不可用时降级告警，不抛）。 */
function registerScnoteCommand(ctx, d) {
    const cmds = ctx.commands;
    if (cmds && typeof cmds.register === 'function') {
        cmds.register({
            name: 'scnote',
            description: '以“笔记化”方式执行任务，并把执行过程整理为 笔记/ 文档（典型：网络检索/调研）',
            input: { hint: '<任务描述，如：调研 XXX>', images: false },
            handler: (invocation) => scnoteReply(invocation?.rawInput ?? ''),
        });
        d.logger.info?.('[shoucang] /scnote 命令已注册');
    }
    else {
        d.logger.warn?.('[shoucang] commands 能力不可用，/scnote 未注册');
    }
}
//# sourceMappingURL=panel-inject.js.map