import { cosine } from './vec.js';
const anchorId = (prefix, v) => `${prefix}:${v}`;
/** 一条记录的"活跃"判定：只用**自身时态字段**（不依赖 fact-ring 的策略，保持本件零策略耦合）。 */
const isLiveRow = (r) => !r.validTo && r.lifecycle !== 'retired';
export function buildGraph(records) {
    const nodes = [];
    const edges = [];
    const anchors = new Map();
    const seen = new Set();
    const addAnchor = (prefix, value) => {
        const id = anchorId(prefix, value);
        if (!anchors.has(id))
            anchors.set(id, { id, kind: 'anchor', subject: '', text: value, live: true, anchor: true });
        return id;
    };
    const addEdge = (from, to, rel, note) => {
        if (from && to)
            edges.push(note ? { from, to, rel, note } : { from, to, rel });
    };
    for (const r of records) {
        if (!r.id || seen.has(r.id))
            continue; // 同 id 只入图一次（Record id 是内容指纹 ⇒ 天然去重）
        seen.add(r.id);
        const live = isLiveRow(r);
        const m = (r.meta || {});
        nodes.push({ id: r.id, kind: r.kind, subject: r.subject, text: r.text, live, anchor: false });
        if (r.pointer)
            addEdge(r.id, addAnchor('ptr', r.pointer), 'points-to');
        if (r.source)
            addEdge(r.id, addAnchor('src', r.source), 'provenance');
        if (r.kind === 'outcome') {
            const did = String(m.decisionId || '');
            if (did)
                addEdge(r.id, did, 'answers', String(m.hit || '')); // 后果回收：实测 → 决策
        }
        else if (r.kind === 'association') {
            const landed = String(m.landed || '') === '1';
            for (const k of ['a', 'b']) {
                const v = String(m[k] || '');
                if (v)
                    addEdge(r.id, addAnchor('sec', v), 'collision', landed ? 'landed' : 'open');
            }
        }
        else if (r.kind === 'commitment') {
            const who = String(m.who || r.subject || '');
            if (who)
                addEdge(r.id, addAnchor('party', who), 'commitment', `${String(m.direction || '')}/${String(m.status || '')}`);
        }
        else if (r.kind === 'relation') {
            const who = String(m.who || r.subject || '');
            if (who)
                addEdge(r.id, addAnchor('party', who), 'relation', String(m.level || ''));
        }
    }
    // 事实环的替代边：同 (kind, subject) 且一条已失效、一条活跃 ⇒ 失效 → 活跃（**时态谱系**）
    const groups = new Map();
    for (const r of records) {
        if (!r.id)
            continue;
        const key = `${r.kind}\u0000${r.subject}`;
        const arr = groups.get(key);
        if (arr)
            arr.push(r);
        else
            groups.set(key, [r]);
    }
    for (const [, arr] of groups) {
        const expired = arr.filter((r) => !isLiveRow(r));
        const live = arr.filter(isLiveRow);
        for (const e of expired)
            for (const l of live)
                if (e.id !== l.id)
                    addEdge(e.id, l.id, 'supersede', 'temporal');
    }
    const all = [...nodes, ...anchors.values()];
    const byRel = {};
    for (const e of edges)
        byRel[e.rel] = (byRel[e.rel] ?? 0) + 1;
    return {
        nodes: all,
        edges,
        stats: {
            nodes: all.length,
            edges: edges.length,
            anchors: anchors.size,
            live: nodes.filter((n) => n.live).length,
            expired: nodes.filter((n) => !n.live).length,
            byRel,
        },
    };
}
/** 邻域查询：某节点的出边/入边（"谁引用谁"两个方向都给）。 */
export function neighborsOf(g, id) {
    return { out: g.edges.filter((e) => e.from === id), in: g.edges.filter((e) => e.to === id) };
}
export function nearPairs(records, vectors, opts = {}) {
    const topK = Math.max(1, opts.topK ?? 5);
    const minSim = opts.minSim ?? 0.8;
    const maxN = Math.max(2, opts.maxN ?? 400);
    const use = [];
    records.forEach((r, i) => {
        const v = vectors[i];
        if (v && v.length && String(r.text || '').trim())
            use.push({ r, v, i });
    });
    const skipped = Math.max(0, use.length - maxN);
    const win = use.slice(Math.max(0, use.length - maxN));
    const out = [];
    const seen = new Set();
    for (let i = 0; i < win.length; i++) {
        const cand = [];
        for (let j = 0; j < win.length; j++) {
            if (i === j)
                continue;
            const s = cosine(win[i].v, win[j].v);
            if (s >= minSim)
                cand.push({ j, sim: s });
        }
        cand.sort((x, y) => y.sim - x.sim);
        for (const c of cand.slice(0, topK)) {
            const lo = Math.min(win[i].i, win[c.j].i);
            const hi = Math.max(win[i].i, win[c.j].i);
            const key = `${lo}|${hi}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const A = win[i].i < win[c.j].i ? win[i].r : win[c.j].r;
            const B = win[i].i < win[c.j].i ? win[c.j].r : win[i].r;
            out.push({ a: A, b: B, sim: c.sim, samePointer: !!A.pointer && A.pointer === B.pointer });
        }
    }
    return { pairs: out.sort((x, y) => y.sim - x.sim), considered: win.length, skipped };
}
export async function adjudicatePairs(pairs, judge) {
    const out = [];
    for (const p of pairs) {
        let v = null;
        try {
            v = await judge(p.a.text, p.b.text);
        }
        catch {
            v = null;
        }
        out.push({ ...p, verdict: v });
    }
    return out;
}
/** KPI：供门禁与面板消费的机器可读计数。 */ export function graphCensus(g) {
    const dangling = g.edges.filter((e) => e.rel === 'points-to' && !g.nodes.some((n) => n.id === e.to && n.anchor)).length;
    return {
        nodes: g.stats.nodes,
        edges: g.stats.edges,
        recordNodes: g.stats.nodes - g.stats.anchors,
        anchors: g.stats.anchors,
        live: g.stats.live,
        expired: g.stats.expired,
        answers: g.stats.byRel.answers ?? 0,
        collision: g.stats.byRel.collision ?? 0,
        commitment: g.stats.byRel.commitment ?? 0,
        relation: g.stats.byRel.relation ?? 0,
        pointsTo: g.stats.byRel['points-to'] ?? 0,
        provenance: g.stats.byRel.provenance ?? 0,
        supersede: g.stats.byRel.supersede ?? 0,
        danglingEvidence: dangling,
    };
}
/**
 * **跨文件逐字节同文**（单一实现 · 2026-09-13）：CLI `assertion-graph --dups` 与面板 `/arch/records` 共用，
 * 避免"同一口径两处实现"（仓内反复吃过的亏）。纯函数、零 IO、零依赖。
 *
 * 口径：按 `text` **精确**分组，**只列跨文件**组（同文件内重复多为设计/结构，如索引/详情同名标题）；
 *   空文本与纯分隔线（`---`/`===`/`***`/`###`）不计。
 * ⚠ **只报告不删**：记忆库内容属用户——"可写不等于有处置权"。
 */
export function exactCrossFileDups(records, limit = 50) {
    const byText = new Map();
    for (const r of records) {
        const t = String(r.text || '');
        if (!t.trim() || /^[-=_*#\s]+$/.test(t))
            continue;
        const arr = byText.get(t) || [];
        arr.push({ file: String(r.file || ''), order: Number(r.order || 0) });
        byText.set(t, arr);
    }
    return [...byText.entries()]
        .filter(([, v]) => v.length > 1 && new Set(v.map((x) => x.file)).size > 1)
        .map(([text, v]) => ({ count: v.length, text, files: v }))
        .sort((a, b) => b.count - a.count || b.text.length - a.text.length)
        .slice(0, limit);
}
//# sourceMappingURL=assertion-graph.js.map