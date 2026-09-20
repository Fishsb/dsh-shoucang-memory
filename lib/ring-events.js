/**
 * ring-events.ts — 环事件流（G0「统一事件流账本」的环侧落地 · 2026-09-13）
 *
 * 为什么需要它（目标里的 G0 项 + 讨论结论）：
 *   · **事件流是不可变历史，store 是当前状态**。store 会被 `mirrorFile` 按文件整片重写；
 *     若不另存事件，环的历史（何时开裁决、何时回收、何时结清）就**只存在于最终状态里**，
 *     一旦状态被覆盖/迁移就无据可查。仓内既有同源纪律：DSH 内核即事件溯源。
 *   · 有事件流才谈得上**对账**：`replayEvents` 必须能**重建当前状态**（事件溯源的核心判据）。
 *     这条判据比"字段看着对"强得多——它同时约束记账端与重放端。
 *
 * 与既有台账的关系：`<knowledgeRoot>/audit/ledger.jsonl` 是**判据/写入**的统一台账（消费方已有
 *   `criteria-audit` / `memory-reconcile`）。本件把环事件落在**库内自有**路径
 *   `<库根>/.records/ring-events.jsonl`，**暂不并入**那条台账——避免让既有审计消费方遇到未知 type
 *   （先求不扰动，合并留作专项）。两者同构：append-only、一行一事件、可重放。
 *
 * 形态：**纯函数**（事件进、记录出），I/O 由 CLI 负责 ⇒ 可直接单测。
 */
import { openDecision, collectOutcome, recordValence } from './decision-ring.js';
import { assertRelation, openCommitment, settleCommitment } from './relation-ring.js';
import { recordCollision, markAccepted, landCollision } from './association-ring.js';
/** 事件日志文件名（落 `<库根>/.records/` 下） */
export const RING_EVENT_FILE = 'ring-events.jsonl';
export const RING_OPS = [
    'decision.open', 'decision.outcome', 'valence.record',
    'relation.assert', 'commitment.open', 'commitment.settle',
    'collision.record', 'collision.accept', 'collision.land',
];
export function makeEvent(seq, op, id, data, at) {
    return { seq, op, id, data, at };
}
/** 事件流 → JSONL（append-only 的落盘形态） */
export function serializeEvents(events) {
    return events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
}
export function parseEvents(text) {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim())
            continue;
        try {
            out.push(JSON.parse(line));
        }
        catch { /* 坏行跳过：解析失败不得让整个账本不可用 */ }
    }
    return out;
}
/**
 * **重放**：事件流 → 环记录集。用与写入侧**同一批纯函数**（不另写一套重建逻辑，
 * 否则"重放一致"只证明两套实现写了同样的 bug）。
 * 按 `seq` 升序；单条失败记进 `errors` 并继续（坏事件不该让整条历史不可用）。
 */
export function replayEvents(events) {
    const errors = [];
    let applied = 0;
    let recs = [];
    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    for (const e of sorted) {
        try {
            switch (e.op) {
                case 'decision.open':
                    recs = openDecision(recs, { id: e.id, text: e.data.text, predicted: e.data.predicted, rationale: e.data.rationale, alternatives: e.data.alternatives, evidence: e.data.evidence, cues: e.data.cues, at: e.at }).records;
                    break;
                case 'decision.outcome': {
                    const r = collectOutcome(recs, e.data.decisionId, { id: e.id, observed: e.data.observed, ...(e.data.hit === undefined ? {} : { hit: e.data.hit === '1' }), ...(e.data.valence === undefined ? {} : { valence: Number(e.data.valence) }), evidence: e.data.evidence, at: e.at });
                    if (!r.ok) {
                        errors.push(`${e.op} ${e.id}: ${r.reason}`);
                        break;
                    }
                    recs = r.records;
                    break;
                }
                case 'valence.record':
                    recs = recordValence(recs, { id: e.id, trigger: e.data.trigger, valence: Number(e.data.valence), evidence: e.data.evidence, cues: e.data.cues, at: e.at }).records;
                    break;
                case 'relation.assert':
                    recs = assertRelation(recs, { id: e.id, text: e.data.text, who: e.data.who, note: e.data.note, ...(e.data.level === undefined ? {} : { level: Number(e.data.level) }), evidence: e.data.evidence, cues: e.data.cues, at: e.at }).records;
                    break;
                case 'commitment.open':
                    recs = openCommitment(recs, { id: e.id, text: e.data.text, who: e.data.who, what: e.data.what, direction: e.data.direction, due: e.data.due, evidence: e.data.evidence, cues: e.data.cues, at: e.at }).records;
                    break;
                case 'commitment.settle': {
                    /* ⚠ **重放豁免证据门**（册零/册一 · 2026-09-20）：`settleCommitment` 现在要求 `evidence` 必填，
                     *   但**历史事件**的载荷里没有该字段（它是本轮才加的）—— 若不给豁免，全库既有 1022 条事件
                     *   将**再也重放不出来**（对账恒红，且"补写历史"等于改历史）。
                     *   `replay:true` 的语义 = **跳过证据门，且只写载荷里真有的键**（见 `SettlementInit.replay`）：
                     *     · 旧事件（无 evidence/settledBy）⇒ 重建出无这两个键的记录 = 与存量 store 逐字一致；
                     *     · 新事件（带 evidence）⇒ 照常重建出带证据的记录。
                     *   这样**新老各自对账都成立**，不需要改写任何历史。 */
                    const r = settleCommitment(recs, e.data.commitmentId, {
                        status: e.data.status,
                        evidence: e.data.evidence ?? '',
                        ...(e.data.settledBy ? { settledBy: e.data.settledBy } : {}),
                        replay: true,
                        note: e.data.note,
                        at: e.at,
                    });
                    if (!r.ok) {
                        errors.push(`${e.op} ${e.id}: ${r.reason}`);
                        break;
                    }
                    recs = r.records;
                    break;
                }
                case 'collision.record': {
                    const r = recordCollision(recs, { id: e.id, text: e.data.text, a: e.data.a, b: e.data.b, context: e.data.context, insight: e.data.insight, ...(e.data.accepted === undefined ? {} : { accepted: e.data.accepted === '1' }), evidence: e.data.evidence, at: e.at });
                    if (!r.ok) {
                        errors.push(`${e.op} ${e.id}: ${r.reason}`);
                        break;
                    }
                    recs = r.records;
                    break;
                }
                case 'collision.accept': {
                    const r = markAccepted(recs, e.data.collisionId, e.data.accepted === '1', e.at);
                    if (!r.ok) {
                        errors.push(`${e.op} ${e.id}: ${r.reason}`);
                        break;
                    }
                    recs = r.records;
                    break;
                }
                case 'collision.land': {
                    const r = landCollision(recs, e.data.collisionId, { landed: e.data.landed === '1', note: e.data.note, at: e.at });
                    if (!r.ok) {
                        errors.push(`${e.op} ${e.id}: ${r.reason}`);
                        break;
                    }
                    recs = r.records;
                    break;
                }
                default:
                    errors.push(`未知 op：${String(e.op)}`);
                    continue;
            }
            applied++;
        }
        catch (err) {
            errors.push(`${e.op} ${e.id}: ${String(err.message).slice(0, 120)}`);
        }
    }
    return { records: recs, errors, applied };
}
/**
 * **变更推导**：`prev → next` 的 store 差分 → 事件行（**CDC**，写时推导）。
 *
 * 诚实说明：这是"变更日志"而非"事件优先"（events-first）。之所以够用，是因为
 *   `reconcileRing` 会验证「重放这条日志必须能重建当前状态」——**推导错了对账就红**。
 *   载荷一律从记录的 `meta` 逐字取（环记录自带重放所需的全部字段），**不做正文解析**
 *   （按正文反解"承诺内容"这类做法会在文本格式变动时静默走偏）。
 * 未来若要改成 events-first，**日志格式不变**，只把写入路径换成"先写事件、状态由重放派生"。
 */
export function eventsFromDiff(prev, next, at, startSeq = 1, atOf) {
    const before = new Map(prev.map((r) => [r.id, r]));
    const out = [];
    let seq = startSeq;
    const push = (op, id, data, atOverride) => {
        const fallback = atOf ? atOf(next.find((r) => r.id === id)) : at;
        out.push(makeEvent(seq++, op, id, data, atOverride ?? fallback));
    };
    /** 状态迁移的**真实时刻**：优先 meta 专用字段（settledAt/landedAt），其次记录顶层 `updatedAt`，
     *  最后回落传入时间。⚠ `updatedAt` 在**记录顶层**、不在 meta 里（写成 `M(r).updatedAt` 会恒 undefined
     *  ⇒ 静默回落成统一时刻 —— 实测踩过）。 */
    const atOfTransition = (r, field) => M(r)[field] || r.updatedAt || at;
    const M = (r) => r.meta ?? {};
    for (const r of next) {
        const b = before.get(r.id);
        if (!b) {
            switch (r.kind) {
                case 'decision':
                    push('decision.open', r.id, { text: r.text, predicted: M(r).predicted ?? '', rationale: M(r).rationale ?? '', alternatives: M(r).alternatives ?? '', evidence: r.source, ...(M(r).cues ? { cues: M(r).cues } : {}) });
                    break;
                case 'outcome':
                    push('decision.outcome', r.id, { decisionId: M(r).decisionId ?? '', observed: r.text, ...(M(r).hit === undefined ? {} : { hit: M(r).hit }), ...(M(r).valence === undefined ? {} : { valence: M(r).valence }), evidence: r.source });
                    break;
                case 'valence':
                    push('valence.record', r.id, { trigger: M(r).trigger ?? '', valence: M(r).valence ?? '0', evidence: r.source, ...(M(r).cues ? { cues: M(r).cues } : {}) });
                    break;
                case 'relation':
                    push('relation.assert', r.id, { who: M(r).who ?? '', note: M(r).note ?? '', ...(M(r).level === undefined ? {} : { level: M(r).level }), evidence: r.source, text: r.text, ...(M(r).cues ? { cues: M(r).cues } : {}) });
                    break;
                case 'commitment':
                    push('commitment.open', r.id, { who: M(r).who ?? '', what: M(r).what ?? '', direction: M(r).direction ?? '', due: M(r).due ?? '', evidence: r.source, text: r.text, ...(M(r).cues ? { cues: M(r).cues } : {}) });
                    break;
                case 'association':
                    push('collision.record', r.id, { a: M(r).a ?? '', b: M(r).b ?? '', context: M(r).context ?? '', insight: M(r).insight ?? '', ...(M(r).accepted === undefined ? {} : { accepted: M(r).accepted }), evidence: r.source, text: r.text });
                    break;
                default:
                    break;
            }
            // **终态重建**（2026-09-13 实测暴露）：从"最终状态"回填事件时，记录已带终态
            // （承诺 kept/broken、碰撞已认可/已落地），只发创建事件会让重放停在初始态 ⇒ 对账必红。
            // 真库首次回填（无日志、记录已带终态）正是这一情形，故此处补发状态迁移事件。
            // 活路径（prev 已有该记录）不受影响——那时走下面的迁移分支，不会重复。
            if (r.kind === 'association') {
                if (M(r).accepted !== undefined)
                    push('collision.accept', r.id, { collisionId: r.id, accepted: M(r).accepted }, r.updatedAt || at);
                if (M(r).landed === '1' || M(r).landed === '0-')
                    push('collision.land', r.id, { collisionId: r.id, landed: M(r).landed === '1' ? '1' : '0', note: M(r).note ?? '' }, atOfTransition(r, 'landedAt'));
            }
            if (r.kind === 'commitment' && M(r).status && M(r).status !== 'pending') {
                push('commitment.settle', r.id, { commitmentId: r.id, status: M(r).status, note: M(r).note ?? '', ...(M(r).evidence ? { evidence: M(r).evidence } : {}), ...(M(r).settledBy ? { settledBy: M(r).settledBy } : {}) }, atOfTransition(r, 'settledAt'));
            }
            continue;
        }
        // 既有记录的状态迁移（顺序与写入侧一致：先认可、再结清/落地）
        if (r.kind === 'association' && M(b).accepted !== M(r).accepted && M(r).accepted !== undefined) {
            push('collision.accept', r.id, { collisionId: r.id, accepted: M(r).accepted }, r.updatedAt || at);
        }
        if (r.kind === 'association' && M(b).landed !== M(r).landed && (M(r).landed === '1' || M(r).landed === '0-')) {
            push('collision.land', r.id, { collisionId: r.id, landed: M(r).landed === '1' ? '1' : '0', note: M(r).note ?? '' }, atOfTransition(r, 'landedAt'));
        }
        if (r.kind === 'commitment' && M(b).status === 'pending' && M(r).status !== 'pending') {
            push('commitment.settle', r.id, { commitmentId: r.id, status: M(r).status ?? '', note: M(r).note ?? '', ...(M(r).evidence ? { evidence: M(r).evidence } : {}), ...(M(r).settledBy ? { settledBy: M(r).settledBy } : {}) }, atOfTransition(r, 'settledAt'));
        }
    }
    return out;
}
/** 环记录（`file=''` 且 kind 属环）——对账只比这一子集：索引行由 mirror 管，不归事件流 */
export function ringRecordsOf(records) {
    const RING_KINDS = new Set(['decision', 'outcome', 'valence', 'relation', 'commitment', 'association']);
    return records.filter((r) => RING_KINDS.has(r.kind));
}
/**
 * **对账**：store 里的环记录 ⟷ 事件流重放结果。
 * 判据：**事件流重放必须能重建当前状态**（多一条/少一条/内容不同都算不一致）。
 */
export function reconcileRing(records, events) {
    const store = ringRecordsOf(records);
    const { records: replayed, errors } = replayEvents(events);
    const a = new Map(store.map((r) => [r.id, r]));
    const b = new Map(replayed.map((r) => [r.id, r]));
    const missingInReplay = [...a.keys()].filter((k) => !b.has(k));
    const extraInReplay = [...b.keys()].filter((k) => !a.has(k));
    const differing = [...a.keys()].filter((k) => {
        const x = a.get(k), y = b.get(k);
        if (!y)
            return false;
        return JSON.stringify({ k: x.kind, t: x.text, m: x.meta }) !== JSON.stringify({ k: y.kind, t: y.text, m: y.meta });
    });
    return {
        ok: missingInReplay.length === 0 && extraInReplay.length === 0 && differing.length === 0 && errors.length === 0,
        storeCount: store.length,
        replayCount: replayed.length,
        missingInReplay, extraInReplay, differing, errors,
    };
}
//# sourceMappingURL=ring-events.js.map