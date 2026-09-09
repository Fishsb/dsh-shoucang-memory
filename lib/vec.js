/**
 * vec.ts — 读侧向量档（2026-09-09 缺省启用：本地 bge-m3 零 token）。
 *
 * 原则（2026-09-09 拍板）：
 *  - 向量 = 派生缓存，不是事实源：行文本是权威，向量可随时删除重建（行 hash 失效即重嵌）。
 *  - 写入即增量：按「行 hash」惰性补齐（recall 时只嵌缺失/变更行），不挂写入事件。
 *  - 双模式可配 + 本地缺省：embedBaseUrl 缺省本地 bge-m3 桥（免 key）；换云端设 baseUrl/model/apiKeyEnv。
 *  - 词法打底空时仍走向量（全量索引薄行池）——语义相似但措辞不同是融合召回的真正价值场景。
 *  - 融合参照 M7 benchmark：dense 0.7 + lexical 0.3（min-max 归一后加权），dense 主、lexical 稳。
 *  - 零硬编码路径；缓存落 <knowledgeRoot>/.vector-cache.jsonl；provider 不可用自动降级词法，闭环不中断。
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { knowledgeRoot, recallIndex } from './targets.js';
const CACHE_FILE = () => join(knowledgeRoot(), '.vector-cache.jsonl');
/** in-memory 行向量缓存（file+line → hash+vec）；进程内热用，首次读盘 */
const memCache = new Map();
export function cosine(a, b) {
    if (!a.length || a.length !== b.length)
        return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (!na || !nb)
        return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
const lineHash = (s) => {
    let h = 0;
    for (const c of s)
        h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
};
function loadCache() {
    if (memCache.size)
        return;
    try {
        const f = CACHE_FILE();
        if (!existsSync(f))
            return;
        for (const l of readFileSync(f, 'utf8').split('\n')) {
            if (!l.trim())
                continue;
            try {
                const o = JSON.parse(l);
                memCache.set(o.file + '\u0000' + o.hash, o);
            }
            catch { /* 坏行跳过 */ }
        }
    }
    catch { /* 无缓存 */ }
}
function saveLine(file, line, hash, vec) {
    try {
        const f = CACHE_FILE();
        mkdirSync(dirname(f), { recursive: true });
        appendFileSync(f, JSON.stringify({ file, line, hash, vec }) + '\n', 'utf8');
        memCache.set(file + '\u0000' + hash, { file, line, hash, vec });
    }
    catch { /* 写缓存失败=下次重嵌，无害 */ }
}
async function embedTexts(cfg, texts) {
    if (!cfg.enabled || !cfg.baseUrl || !cfg.model)
        return null;
    try {
        const key = process.env[cfg.apiKeyEnv] || process.env.EMBED_API_KEY;
        const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(cfg.baseUrl);
        // 本地无鉴权端点（默认 bge-m3 桥）免 key；云端须有 key——无 key 且非本地 → 词法降级
        if (!key && !isLocal)
            return null;
        const url = cfg.baseUrl.replace(/\/+$/, '') + '/embeddings';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
            body: JSON.stringify({ model: cfg.model, input: texts }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok)
            return null;
        const j = (await res.json());
        if (!Array.isArray(j.data) || !j.data.length)
            return null;
        return j.data.map((d) => d.embedding || []);
    }
    catch {
        return null;
    } // 网络/超时/格式 → 词法降级，闭环不中断
}
/**
 * 读侧召回（向量档就绪时）：词法 topK 打底 → 行向量惰性补齐 → dense topK 候选 → 0.7dense ⊕ 0.3lex 融合重排。
 * 返回行附带 fused/dense；向量不可用（未配置/失败/缓存空且无 key）时 = 纯词法结果（dense=undefined）。
 * 2026-09-09（向量默认启用）：词法打底为空时**不再直接返回**——若向量开，对全部索引行做向量检索
 * （语义相似但措辞不同是融合召回的真正价值场景，如「任务怎么不踩坑」vs 索引行「结果验证重实证」）；
 * 词法候选与全量行集合并后统一向量化（缓存命中免重复嵌入）。索引行数受容量红线约束（数十行级），
 * 一次全量补齐预算可控，非「全部 notes 正文」——仍是薄行。
 */
export async function recallRanked(root, query, topK, scope, cfg) {
    const { rows, tokens } = recallIndex(root, query, Math.max(topK, 8), scope); // 打底多取，供融合裁剪
    if (!cfg.enabled)
        return { rows: rows.slice(0, topK), tokens, mode: 'lexical' };
    try {
        loadCache();
        // 词法打底空 → 全量索引行（薄行，数十行级）作为向量检索池；词法非空 → 用词法候选池
        let pool = rows;
        if (!pool.length) {
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
                    const ptrM = line.match(/→\s*(notes\/[A-Za-z0-9_-]+\.md)/);
                    pool.push({ file, tag: tagM[1], line, score: 0, pointer: ptrM ? ptrM[1] : '' });
                }
            }
        }
        const need = [];
        const vecRows = [];
        for (const r of pool) {
            const h = lineHash(r.line);
            const hit = memCache.get(r.file + '\u0000' + h);
            if (hit)
                vecRows.push({ row: r, vec: hit.vec });
            else
                need.push(r);
        }
        if (need.length) {
            const batch = need.slice(0, 48); // 全量池兜底时一次最多补齐 48 行（薄行预算可控；缓存后免重复）
            const vecs = await embedTexts(cfg, batch.map((r) => r.line.slice(0, 512)));
            if (vecs && vecs.length === batch.length) {
                for (let i = 0; i < batch.length; i++) {
                    const v = vecs[i];
                    if (v && v.length) {
                        saveLine(batch[i].file, batch[i].line, lineHash(batch[i].line), v);
                        vecRows.push({ row: batch[i], vec: v });
                    }
                }
            }
        }
        if (!vecRows.length)
            return { rows: rows.slice(0, topK), tokens, mode: 'lexical' }; // 向量不可用 → 词法
        const qv = await embedTexts(cfg, [query.slice(0, 512)]);
        if (!qv || !qv[0] || !qv[0].length)
            return { rows: rows.slice(0, topK), tokens, mode: 'lexical' };
        const dense = vecRows.map((x) => ({ row: x.row, sim: cosine(qv[0], x.vec) })).sort((a, b) => b.sim - a.sim).slice(0, topK);
        const lexMax = Math.max(1, ...dense.map((d) => d.row.score));
        const denseMin = Math.min(...dense.map((d) => d.sim));
        const denseMax = Math.max(...dense.map((d) => d.sim));
        const span = Math.max(1e-9, denseMax - denseMin);
        const fused = dense
            .map((d) => ({ ...d, fused: 0.7 * (d.sim - denseMin) / span + 0.3 * (d.row.score / lexMax) }))
            .sort((a, b) => b.fused - a.fused)
            .slice(0, topK);
        const out = fused.map((f) => ({ ...f.row, score: Math.round(f.fused * 100) }));
        return { rows: out, tokens, mode: 'fusion' };
    }
    catch {
        return { rows: rows.slice(0, topK), tokens, mode: 'lexical' };
    }
}
//# sourceMappingURL=vec.js.map