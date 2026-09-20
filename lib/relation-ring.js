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
import { dueSoon } from './due-window.js';
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
 *
 * 册一（2026-09-20）**结必有证**：空/空白 `evidence` 一律拒绝（`{ok:false}`），且证据与执行者
 *   写进 `meta.evidence` / `meta.settledBy`（**只增字段**，不动既有 `note`）。
 *   判因：`kept/broken` 是 `trustOf` 的唯一分子/分母来源 ⇒ 若不在这里堵，"兑现率虚高"
 *   就只能靠人自觉——而本仓的纪律是**判据可机检**。
 *
 * ⚠ **事件重放的豁免**（关键，不改历史）：见 `SettlementInit.replay` 的详细说明——
 *   `replay:true` ⇒ 跳过证据门，且**只写载荷里真有的键**（缺字段的旧事件重建出缺字段的记录，
 *   与存量 store 逐字一致；带字段的新事件照常重建）。
 *   「这条结清有没有证据」的判法因此是：**`meta.evidence` 存在 ⇒ 新式（有证据）；缺失 ⇒ 存量无据**。
 *   `trustOf` 的 `evidenceMissing` 正是这么算的（册四）——不需要凭空补字段也能如实显示。
 */
export function settleCommitment(records, id, s) {
    const idx = records.findIndex((r) => r.id === id && r.kind === 'commitment');
    if (idx < 0)
        return { records: records.slice(), ok: false, reason: `承诺不存在（${id}）` };
    const st = records[idx].meta?.status;
    if (st && st !== 'pending')
        return { records: records.slice(), ok: false, reason: `该承诺已结清（${st}，不重复结清）` };
    const isReplay = s.replay === true;
    const evidence = String(s.evidence ?? '').trim();
    if (!isReplay && !evidence) {
        return { records: records.slice(), ok: false, reason: '结算必须带证据（`evidence` 为空）——「结必有证」是防止兑现率虚高的唯一闸' };
    }
    const next = records.slice();
    next[idx] = {
        ...next[idx],
        meta: {
            ...(next[idx].meta ?? {}),
            status: s.status,
            settledAt: s.at,
            // 重放=纯重建 ⇒ 只写载荷里真有的键（不补写新键，见上「对账不变式」）
            // 活路径 ⇒ 证据与执行者**如实落盘**（`settledBy` 缺省不写，保持"只增字段"的最小形态）
            ...(isReplay
                ? { ...(evidence ? { evidence } : {}), ...(s.settledBy ? { settledBy: s.settledBy } : {}) }
                : { evidence, ...(s.settledBy ? { settledBy: s.settledBy } : {}) }),
            ...(s.note ? { note: s.note } : {}),
        },
        updatedAt: s.at,
    };
    return { records: next, ok: true };
}
/** 待兑现队列（pending 承诺）——「想不起来兑现」的防线；可按 who 过滤 */
export function openCommitments(records, who) {
    return records.filter((r) => r.kind === 'commitment' && r.meta?.status === 'pending' && (!who || r.meta?.who === who));
}
/**
 * **待裁决队列**（册三 · 2026-09-20 · `docs/promise-settlement-plan.md` §6）：
 * `due` 已逾期（复用 `dueSoon` 的 **7 天窗**，口径唯一）**且仍 pending** 的承诺。
 *
 * **明确不做**：**不自动判 `broken`**。理由（方案档原文）：逾期只证明"时间到了"，
 *   不证明"没做"——自动 broken 会把"其实已交付、只是没回写"的条目判成不兑现，
 *   **直接污染 `trustOf`**（与册一"结必有证"直接冲突）。
 *   ⇒ 本函数是**纯读**（零写入、不改状态），产出交人工/面板裁决。
 *
 * `overdue` 字段（**只增**）：`true` = 已过期，`false` = 7 天内到期（"临近"，同 `dueSoon` 语义）。
 * 排序：**过期在前**（最该被看见）→ 其次按 `due` 升序（越早到期越急）→ 无 `due`/坏时间戳不入选。
 */
export function overdueCommitments(records, at) {
    const out = [];
    for (const r of records) {
        if (r.kind !== 'commitment' || r.meta?.status !== 'pending')
            continue;
        const due = String(r.meta?.due ?? '').trim();
        if (!due)
            continue;
        if (!dueSoon(r.meta, at))
            continue;
        const t = Date.parse(due);
        // 坏时间戳已被 dueSoon 挡掉（返回 false）⇒ 此处 t 必可解析
        out.push({ record: r, overdue: Number.isFinite(t) ? t < Date.parse(at) : false, due });
    }
    return out.sort((a, b) => {
        if (a.overdue !== b.overdue)
            return a.overdue ? -1 : 1;
        return (Date.parse(a.due) || 0) - (Date.parse(b.due) || 0);
    });
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
 *
 * ⚠ **分母口径写死且不许漂移**（册四）：`rate = kept/(kept+broken)`，**pending 不进分母**。
 *   本件只**加字段**，不做算术改动（`test-relation-ring` 的既有断言逐字比对）。
 * `overdueAt` 为**可选**入参：给了才算逾期字段（缺省 0 ⇒ 与旧行为逐字等价，调用方零迁移）。
 */
export function trustOf(records, who, overdueAt) {
    const mine = records.filter((r) => r.kind === 'commitment' && r.meta?.who === who && r.meta?.direction === 'owed-by-me');
    const theirs = records.filter((r) => r.kind === 'commitment' && r.meta?.who === who && r.meta?.direction === 'owed-to-me');
    const cnt = (arr, s) => arr.filter((r) => r.meta?.status === s).length;
    const mineKept = cnt(mine, 'kept'), mineBroken = cnt(mine, 'broken');
    const theirsKept = cnt(theirs, 'kept'), theirsBroken = cnt(theirs, 'broken');
    const rate = (k, b) => (k + b ? k / (k + b) : 0);
    /* 逾期判据**复用唯一实现** `dueSoon`（7 天窗，`ring-supply` 内）——不在本件另写一个数。
     * ⚠ 逾期 ≠ broken（册三红线）：这里只**计数**，绝不改状态。 */
    const overdue = (arr) => overdueAt ? arr.filter((r) => r.meta?.status === 'pending' && dueSoon(r.meta, overdueAt)).length : 0;
    const pend = (arr) => cnt(arr, 'pending');
    const noEv = (arr) => arr.filter((r) => (r.meta?.status === 'kept' || r.meta?.status === 'broken') && !String(r.meta?.evidence ?? '').trim()).length;
    return {
        who,
        mineKept, mineBroken, theirsKept, theirsBroken,
        mineRate: rate(mineKept, mineBroken), theirsRate: rate(theirsKept, theirsBroken),
        minePending: pend(mine), theirsPending: pend(theirs),
        mineOverdue: overdue(mine), theirsOverdue: overdue(theirs),
        mineEvidenceMissing: noEv(mine), theirsEvidenceMissing: noEv(theirs),
    };
}
//# sourceMappingURL=relation-ring.js.map