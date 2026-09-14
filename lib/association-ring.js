/**
 * association-ring.ts — 联想环（G3 · 2026-09-13）：**碰撞记录** + 越界召回
 *
 * 为什么这样设计（三轮讨论的结论，逐条落在代码上）：
 *   ① **洞察是「关系」，不是「条目」**。在写入时提炼洞见是错位的范式：碰撞的分母是"未来某个问题"，
 *      写入时不可知。故本模块**只记"撞过哪两条 + 在什么语境 + 被认可吗 + 后来成了吗"**，
 *      **洞察本体不落库**（它可由模型在读时再生成；存下来只会污染库并挤占注入预算）。
 *   ② **免频率门**：洞察的定义就是只出现一次。既有判据（同主题 ≥3 条痕迹 / 同型 ≥2 次）会
 *      **结构性杀死**它（见 `rings.ts#FREQUENCY_FREE_RINGS`）。故本环成立判据是 **跨度门**（≥2 个不同 §），
 *      不是重现次数——与仓内既有 REM 相 `crossTopic` 硬门（`minSections: 2`）同口径，不另立一套。
 *   ③ **价态不可再生**：「当时被认可/被否」是历史事实，模型推不出来 ⇒ 进 `accepted` 字段，
 *      且**只有被认可的碰撞**才值得在未来作为种子复用。
 *   ④ **读侧需要独立通道**：相关性打分（α_rel）越强，越不可能发生越界碰撞（精度与惊喜在数学上对立）。
 *      故本模块提供 `serendipityPairs`——**不按相关性排序**，按「§ 跨度 + 冷度」挑候选对。
 *
 * 形态：纯函数（记录集进、结果出）；环记录 `file=''`（无 md 投影，与决策/关系环同规格）。
 */
import { fingerprint, makeRecord, stampRecord } from './record-store.js';
/** 锚点的 § 小节（无 § 时取整串）——跨度门与去重的口径 */
export function sectionOf(anchor) {
    const i = anchor.indexOf('§');
    return (i >= 0 ? anchor.slice(i + 1) : anchor).trim();
}
/**
 * 锚点是否**有地址**（带 `§` 小节）。
 * ⚠ 为什么必须要求：无 § 的锚点（画像行/裸正文）其 `sectionOf` 会退化成整串正文 ⇒
 *   任意两行都能判"不同 §"，**跨度门形同虚设**（2026-09-13 真库跑越界召回时实测暴露：
 *   候选里混进画像行，span 恒等于满分 2.999）。故：无地址的两行**不算碰撞、也不进候选池**。
 */
export function hasSection(anchor) {
    return String(anchor || '').includes('§') && sectionOf(anchor).length > 0;
}
/** 碰撞对的无序键（去重用） */
function pairKey(a, b) {
    return [a, b].sort().join(' ⨯ ');
}
/**
 * 记录的**规范锚点**：优先取指针（`notes/x.md §节`），无指针退回正文。
 * ⚠ 这是碰撞去重的口径来源 —— `recordCollision` 存下的 `pairKey` 与 `serendipityPairs` 的排除集
 *   必须用**同一把尺子**，否则"已撞过的对"会被反复推荐（本模块初版就踩过这个错位）。
 */
export function anchorOfRecord(r) {
    return (r.pointer || r.text || '').trim();
}
/**
 * 记一条碰撞。**跨度门（硬门）**：两锚点都必须非空、且 **§ 小节不同** —— 同一主题内的归纳
 * 是"压缩"不是"碰撞"（后者已由巩固域的 principles 通道覆盖）。
 */
export function recordCollision(records, c) {
    const a = String(c.a || '').trim();
    const b = String(c.b || '').trim();
    if (!a || !b)
        return { records: records.slice(), ok: false, reason: '锚点缺失（碰撞须有两条锚点）' };
    if (a === b)
        return { records: records.slice(), ok: false, reason: '两锚点相同（不是碰撞）' };
    if (!hasSection(a) || !hasSection(b))
        return { records: records.slice(), ok: false, reason: `锚点无 § 小节（无地址的两行不算碰撞：${!hasSection(a) ? a : b}）` };
    if (sectionOf(a) === sectionOf(b))
        return { records: records.slice(), ok: false, reason: `跨度不足：两锚点同属 §${sectionOf(a)}（同一主题内的归纳归 principles 通道）` };
    const key = pairKey(a, b);
    const id = c.id ?? `association:${fingerprint(key)}`;
    const rec = stampRecord(makeRecord({
        id,
        kind: 'association',
        file: '',
        subject: 'agent',
        scope: 'global',
        text: c.text ?? `[碰撞] ${a} ⨯ ${b}｜${c.context}${c.insight ? `｜${c.insight}` : ''}`,
        source: c.evidence ?? '',
        meta: {
            a, b, pairKey: key, context: c.context,
            ...(c.insight ? { insight: c.insight } : {}),
            ...(c.accepted === undefined ? {} : { accepted: c.accepted ? '1' : '0' }),
            landed: '0',
        },
    }), c.at);
    const i = records.findIndex((r) => r.id === id);
    if (i < 0)
        return { records: [...records, rec], ok: true, id };
    // 同一对再撞：累加 hits（重现 = 更稳固），并把新的认可状态并入
    const next = records.slice();
    const prev = records[i];
    next[i] = {
        ...prev,
        source: c.evidence || prev.source,
        meta: { ...(prev.meta ?? {}), ...(c.accepted === undefined ? {} : { accepted: c.accepted ? '1' : '0' }) },
        hits: prev.hits + 1,
        lastHit: c.at,
        updatedAt: c.at,
    };
    return { records: next, ok: true, id };
}
/**
 * 按**记录 id** 记一次碰撞（推荐入口）：锚点由 `anchorOfRecord` 推导，
 * 保证与 `serendipityPairs` 的排除集同尺子（否则已撞过的对会被反复推荐）。
 */
export function collideRecords(records, aId, bId, opts) {
    const a = records.find((r) => r.id === aId);
    const b = records.find((r) => r.id === bId);
    if (!a || !b)
        return { records: records.slice(), ok: false, reason: `锚点记录不存在（${!a ? aId : bId}）` };
    return recordCollision(records, { ...opts, a: anchorOfRecord(a), b: anchorOfRecord(b) });
}
/** 记/改认可状态（价态） */ export function markAccepted(records, id, accepted, at) {
    const i = records.findIndex((r) => r.id === id && r.kind === 'association');
    if (i < 0)
        return { records: records.slice(), ok: false, reason: `碰撞记录不存在（${id}）` };
    const next = records.slice();
    next[i] = { ...next[i], meta: { ...(next[i].meta ?? {}), accepted: accepted ? '1' : '0' }, updatedAt: at };
    return { records: next, ok: true };
}
/**
 * **落地回收**（本环的后果账）：那次碰撞后来真的用上了吗。
 * 幂等：已登记落地的**拒绝重复登记**（与决策环 `collectOutcome`、关系环 `settleCommitment` 同规格）。
 */
export function landCollision(records, id, l) {
    const i = records.findIndex((r) => r.id === id && r.kind === 'association');
    if (i < 0)
        return { records: records.slice(), ok: false, reason: `碰撞记录不存在（${id}）` };
    if (records[i].meta?.landed === '1' || records[i].meta?.landed === '0-') {
        return { records: records.slice(), ok: false, reason: '该碰撞已登记落地结论（不重复登记）' };
    }
    const next = records.slice();
    next[i] = {
        ...next[i],
        meta: { ...(next[i].meta ?? {}), landed: l.landed ? '1' : '0-', landedAt: l.at, ...(l.note ? { note: l.note } : {}) },
        updatedAt: l.at,
    };
    return { records: next, ok: true };
}
/** 待回收队列：尚未登记落地结论的碰撞（「想不起来回看」的防线） */
export function openCollisions(records) {
    const l = (r) => r.meta?.landed;
    return records.filter((r) => r.kind === 'association' && l(r) !== '1' && l(r) !== '0-');
}
export function associationCensus(records) {
    const as = records.filter((r) => r.kind === 'association');
    const acc = as.filter((r) => r.meta?.accepted === '1');
    const den = as.filter((r) => r.meta?.accepted === '0');
    const landed = as.filter((r) => r.meta?.landed === '1');
    return {
        collisions: as.length,
        accepted: acc.length,
        denied: den.length,
        unstated: as.length - acc.length - den.length,
        landed: landed.length,
        landedRate: acc.length ? landed.length / acc.length : 0,
        pending: openCollisions(records).length,
        reused: as.filter((r) => r.hits > 0).length,
    };
}
/**
 * **越界召回**（读侧独立通道）：不按相关性排序，按「§ 跨度 + 冷度」挑**候选碰撞对**。
 *
 * 为什么必须独立：注入打分是 `α_rel·relevance + …`，α_rel 越强越不可能发生越界碰撞——
 *   精度与惊喜在数学上是对立的，改 α 解决不了，只能另开一条通道（本函数据此不读任何 relevance 分）。
 * 确定性：给定 `seed` 结果稳定（可用于回归测试），不依赖随机数。
 */
export function serendipityPairs(records, opts = {}) {
    const seed = opts.seed ?? 'seed';
    const k = opts.k ?? 3;
    const perSection = opts.maxPerSection ?? 2;
    const nowMs = opts.now ? Date.parse(opts.now) : Date.now();
    // 候选池：**有 md 投影 + 有 § 地址**的行（真正可注入的知识行）——结构/空白/环记录/画像行不参与
    const pool = records.filter((r) => r.file !== '' && r.kind !== 'structure' && r.kind !== 'blank' && r.text.trim() && hasSection(anchorOfRecord(r)));
    const coldOf = (r) => {
        if (!r.lastHit)
            return 999;
        const d = (nowMs - Date.parse(r.lastHit)) / 86400000;
        return Number.isFinite(d) ? Math.max(0, d) : 999;
    };
    const ref = (r) => ({ id: r.id, text: r.text, section: sectionOf(anchorOfRecord(r)), file: r.file, cold: Math.round(coldOf(r)) });
    // 每 § 最多取 perSection 条（冷者优先）⇒ 防"同一个筐里自己撞自己"
    const bySection = new Map();
    for (const r of pool) {
        const s = sectionOf(anchorOfRecord(r));
        if (!bySection.has(s))
            bySection.set(s, []);
        bySection.get(s).push(r);
    }
    const picked = [];
    for (const arr of bySection.values()) {
        arr.sort((x, y) => coldOf(y) - coldOf(x) || (x.id < y.id ? -1 : 1));
        picked.push(...arr.slice(0, perSection));
    }
    // 已撞过的对不再推荐
    const seen = new Set(records.filter((r) => r.kind === 'association').map((r) => r.meta?.pairKey).filter((x) => !!x));
    const out = [];
    for (let i = 0; i < picked.length; i++) {
        for (let j = i + 1; j < picked.length; j++) {
            const ra = picked[i], rb = picked[j];
            if (sectionOf(anchorOfRecord(ra)) === sectionOf(anchorOfRecord(rb)))
                continue;
            if (seen.has(pairKey(anchorOfRecord(ra), anchorOfRecord(rb))))
                continue;
            const A = ref(ra), B = ref(rb);
            const span = (A.file !== B.file ? 2 : 0) + Math.min(1, (A.cold + B.cold) / 2000);
            out.push({ a: A, b: B, span: Number(span.toFixed(3)), why: `${A.file === B.file ? '同文件跨 §' : '跨文件跨 §'} · 冷度 ${A.cold}/${B.cold} 天` });
        }
    }
    // 排序：跨度大者优先；同分用 seed 的确定性哈希打散（不同 seed 得到不同但可复现的邻居）
    out.sort((x, y) => y.span - x.span || (fingerprint(seed + x.a.id + x.b.id) < fingerprint(seed + y.a.id + y.b.id) ? -1 : 1));
    return out.slice(0, k);
}
//# sourceMappingURL=association-ring.js.map