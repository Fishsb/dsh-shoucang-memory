/** 时间戳是否可解析（不可解析一律**按失效处理**：真相上宁可保守，不拿坏标记当好标记） */
function parseable(iso) {
    return !iso || Number.isFinite(Date.parse(iso));
}
/** 该断言在 `at` 时刻是否**成立**（空 validTo = 未失效；坏时间戳 = 失效，fail-closed） */
export function isLive(r, at) {
    if (!r.validTo)
        return true;
    if (!parseable(r.validTo))
        return false;
    return Date.parse(r.validTo) > Date.parse(at);
}
/** 标记失效（**幂等**：已失效者拒绝重复标记——重复会让"何时失效"被后来者覆盖） */
export function supersede(records, id, s) {
    const i = records.findIndex((r) => r.id === id);
    if (i < 0)
        return { records: records.slice(), ok: false, reason: `记录不存在（${id}）` };
    const cur = records[i];
    if (cur.validTo)
        return { records: records.slice(), ok: false, reason: `已失效（${cur.validTo}），不重复标记` };
    const next = records.slice();
    next[i] = {
        ...cur,
        validTo: s.at,
        meta: { ...(cur.meta ?? {}), ...(s.note ? { staleNote: s.note } : {}), ...(s.by ? { supersededBy: s.by } : {}) },
        updatedAt: s.at,
    };
    return { records: next, ok: true };
}
/** 恢复有效（撤销误标；幂等：本就有效者拒绝） */
export function revive(records, id, at) {
    const i = records.findIndex((r) => r.id === id);
    if (i < 0)
        return { records: records.slice(), ok: false, reason: `记录不存在（${id}）` };
    if (!records[i].validTo)
        return { records: records.slice(), ok: false, reason: '本就有效，无需恢复' };
    const next = records.slice();
    const { validTo: _drop, ...rest } = next[i];
    next[i] = { ...rest, validTo: undefined, updatedAt: at };
    return { records: next, ok: true };
}
export function liveRecords(records, at) {
    return records.filter((r) => isLive(r, at));
}
export function expiredRecords(records, at) {
    return records.filter((r) => !isLive(r, at));
}
/**
 * 事实环 KPI（**只从记录集推导**）。
 * 说明：本件只做**时间维**的失效；「前提是否仍成立」的**求值**需要一门前提语言，
 * 属独立课题（仓内现有 `premise` 判据是**写入时**判定），不在此处冒充。
 */
export function factCensus(records, at) {
    let live = 0, expired = 0, withPremise = 0, unparseable = 0;
    for (const r of records) {
        if (isLive(r, at))
            live++;
        else
            expired++;
        if (r.meta?.premise)
            withPremise++;
        if (r.validTo && !parseable(r.validTo))
            unparseable++;
    }
    return { total: records.length, live, expired, withPremise, unparseable };
}
/** 记录的前提（写出则返回，未写返回空串） */
export function premiseOf(r) {
    return r.meta?.premise ?? '';
}
/** 已失效清单（人读用：谁因何失效、被谁取代） */
export function staleReport(records) {
    return records
        .filter((r) => !isLive(r, '9999-01-01T00:00:00.000Z'))
        .map((r) => ({ id: r.id, text: r.text, validTo: r.validTo ?? '', why: r.meta?.staleNote ?? '', by: r.meta?.supersededBy ?? '' }));
}
//# sourceMappingURL=fact-ring.js.map