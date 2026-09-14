/**
 * relation-ring.ts — 关系环（G2 · 2026-09-13）：谁是谁 / 谁欠谁 / **承诺状态机**
 *
 * 为什么单独成环（三轮讨论的结论）：人记的大量内容不是知识，是**社会位置**——
 *   「谁对我有期待、我欠谁、谁可信」。模型没有社会位置，这部分只能外置；
 *   而且它是**双向**的（对面也记得你）⇒ 本模块用 `direction` 把「我欠」与「欠我」分开记账，
 *   两侧的兑现率**分开统计**（合成一个数就丢掉了方向这个最有用的信息）。
 *
 * 与决策环的分工：决策环管「我拍了什么板、结果如何」（对内）；关系环管「我与谁之间的未结事项」（对外）。
 *   两者的共同点是**都要回收**：决策要回收后果、承诺要回收兑现 ⇒ 都有"待办队列"，
 *   都是**免"想不起来"**的防线（`openDecisions` / `openCommitments`）。
 *
 * 形态：纯函数（记录集进、记录集出）；环记录 `file=''`（无 md 投影，与决策环同规格）。
 */
import { fingerprint, makeRecord, stampRecord } from './record-store.js';
/** 记一条关系事实 */
export function assertRelation(records, r) {
    const id = r.id ?? `relation:${fingerprint(`${r.who}|${r.note}`)}`;
    const rec = stampRecord(makeRecord({
        id,
        kind: 'relation',
        file: '',
        subject: 'user',
        scope: 'global',
        text: r.text ?? `${r.who}：${r.note}`,
        source: r.evidence ?? '',
        meta: { who: r.who, ...(r.note ? { note: r.note } : {}), ...(typeof r.level === 'number' ? { level: String(r.level) } : {}), ...(r.cues ? { cues: r.cues } : {}) },
    }), r.at);
    const i = records.findIndex((x) => x.id === id);
    if (i < 0)
        return { records: [...records, rec], id };
    const next = records.slice();
    // 重提交不得静默丢字段（见 decision-ring#openDecision 的同一缺陷说明）：旧键保留、新键覆盖
    next[i] = { ...rec, meta: { ...(records[i].meta ?? {}), ...(rec.meta ?? {}) }, hits: records[i].hits + 1, lastHit: r.at, createdAt: records[i].createdAt || r.at };
    return { records: next, id };
}
/** 开一条承诺（status=pending，进入待兑现队列） */
export function openCommitment(records, c) {
    const id = c.id ?? `commitment:${fingerprint(`${c.who}|${c.what}|${c.direction}`)}`;
    const rec = stampRecord(makeRecord({
        id,
        kind: 'commitment',
        file: '',
        subject: 'user',
        scope: 'global',
        text: c.text ?? `[承诺] ${c.direction === 'owed-by-me' ? '我欠' : '欠我'} ${c.who}：${c.what}`,
        source: c.evidence ?? '',
        meta: { who: c.who, ...(c.what ? { what: c.what } : {}), direction: c.direction, status: 'pending', ...(c.due ? { due: c.due } : {}), ...(c.cues ? { cues: c.cues } : {}) },
    }), c.at);
    const i = records.findIndex((x) => x.id === id);
    if (i < 0)
        return { records: [...records, rec], id };
    const next = records.slice();
    next[i] = { ...rec, meta: { ...(records[i].meta ?? {}), ...(rec.meta ?? {}) }, hits: records[i].hits, lastHit: records[i].lastHit, createdAt: records[i].createdAt || c.at };
    return { records: next, id };
}
/**
 * **结清承诺**（本环的核心）：pending → kept | broken。
 * 幂等：已结清的承诺**拒绝重复结清**（重复即污染兑现率）。
 */
export function settleCommitment(records, id, s) {
    const idx = records.findIndex((r) => r.id === id && r.kind === 'commitment');
    if (idx < 0)
        return { records: records.slice(), ok: false, reason: `承诺不存在（${id}）` };
    const st = records[idx].meta?.status;
    if (st && st !== 'pending')
        return { records: records.slice(), ok: false, reason: `该承诺已结清（${st}，不重复结清）` };
    const next = records.slice();
    next[idx] = {
        ...next[idx],
        meta: { ...(next[idx].meta ?? {}), status: s.status, settledAt: s.at, ...(s.note ? { note: s.note } : {}) },
        updatedAt: s.at,
    };
    return { records: next, ok: true };
}
/** 待兑现队列（pending 承诺）——「想不起来兑现」的防线；可按 who 过滤 */
export function openCommitments(records, who) {
    return records.filter((r) => r.kind === 'commitment' && r.meta?.status === 'pending' && (!who || r.meta?.who === who));
}
/** 某主体的全部关系与承诺（双向视角：我欠与欠我都在） */
export function relationsOf(records, who) {
    return records.filter((r) => (r.kind === 'relation' || r.kind === 'commitment') && r.meta?.who === who);
}
export function relationCensus(records) {
    const rel = records.filter((r) => r.kind === 'relation');
    const com = records.filter((r) => r.kind === 'commitment');
    const byWho = {};
    for (const r of [...rel, ...com]) {
        const w = r.meta?.who;
        if (w)
            byWho[w] = (byWho[w] ?? 0) + 1;
    }
    return {
        relations: rel.length,
        commitments: com.length,
        pending: com.filter((r) => r.meta?.status === 'pending').length,
        kept: com.filter((r) => r.meta?.status === 'kept').length,
        broken: com.filter((r) => r.meta?.status === 'broken').length,
        entities: Object.keys(byWho).length,
        byWho,
    };
}
/**
 * 双向兑现率（KPI，**只从记录集推导**）：把「我欠」与「欠我」分开统计。
 * 合成单一比率会丢掉方向——方向信息正是判断"这段关系健不健康"的依据。
 */
export function trustOf(records, who) {
    const mine = records.filter((r) => r.kind === 'commitment' && r.meta?.who === who && r.meta?.direction === 'owed-by-me');
    const theirs = records.filter((r) => r.kind === 'commitment' && r.meta?.who === who && r.meta?.direction === 'owed-to-me');
    const cnt = (arr, s) => arr.filter((r) => r.meta?.status === s).length;
    const mineKept = cnt(mine, 'kept'), mineBroken = cnt(mine, 'broken');
    const theirsKept = cnt(theirs, 'kept'), theirsBroken = cnt(theirs, 'broken');
    const rate = (k, b) => (k + b ? k / (k + b) : 0);
    return { who, mineKept, mineBroken, theirsKept, theirsBroken, mineRate: rate(mineKept, mineBroken), theirsRate: rate(theirsKept, theirsBroken) };
}
//# sourceMappingURL=relation-ring.js.map