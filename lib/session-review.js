// session-review.ts — **L2 会话级复盘**（S2S3 册一 · 2026-09-19）
//
// 定位（会审裁定 D1/册一）：L2 是 S2 的**新增子链**，视野 = **整个会话**（L1 全部产出 + 失败明细），
//   动作 = **产出会话级主线 + 校正提案**；但 **不直接改库**——
//   「L2 能改 L1」与 S2 的硬不变量「**只增不改历史**」冲突（S2 写路径只有 `memAppend`，重写能力唯一持有者是 S3）
//   ⇒ 形态取 **append-only 提案流**：本件只**写提案**，执行权留 S3 下一轮（见方案册 §3.1）。
//
// **依赖白名单（架构主审裁定 · 本件由 `check-session-review-scope` 机检）**：
//   允许：`distill-*`（取景/材料）· `section-ref`（指针三态）· `supply-ledger`（指纹）· `targets` · `node:*`
//   禁止：`treeops` / `forgetops` / `sectionops` / `deepsleep-*` / `panel-*`（**禁把重写者引进 S2**）
//   并且：**本件不得出现任何库内写入原语**（`atomicWriteFile` / `editFileUnderLock` / `writeFileSync` / `renameSync`）
//   —— 只许 `appendFileSync` 写自己的提案流与状态流。理由：一旦本件能改库，"执行权留 S3"就名存实亡。
//
// 幂等：键 = `(sid, reviewedSeq, opHash)`；`reviewedSeq` 与水位一样**只在真正产出后推进**，
//   并同批落 `formatVersion` + `fp` **双证**（格式迁移后 seq 重排 ⇒ 不符即整段作废重跑，与 `distill-watermark` 同款）。
//   ⚠ `reviewedSeq` **不并入** `distill-watermark.jsonl`（那条流是 sid 末行生效，L1 每段一写会冲掉本件的推进）。
//
// 三态审计（会审要求）：`not-triggered`（没到点）/ `skipped-by-threshold`（到了点但内容维不够）/ `reviewed`（真跑了）
//   —— 缺这三态时，"漏触发"与"没内容"在审计上**不可分辨**（本项目实测过的假绿形态）。
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fingerprintOf } from './supply-ledger.js';
import { readTailLines } from './file-stat-cache.js';
import { readLedgerVolumes } from './ledger-compact.js';
/** 触发阈值（会审 U4 裁定：静默维保留 30min；**内容维下调**——实测段中位仅 4 ⇒ 原 ≥8 条/≥1200 事件会大面积漏触发）。 */
export const REVIEW_DEFAULTS = { idleMs: 30 * 60 * 1000, minNewEntries: 3, minNewEvents: 600 };
export const sidShortOf = (sid) => String(sid ?? '').replace(/^session-/, '');
export const proposalPathOf = (bankRoot, sid) => join(bankRoot, 'audit', 'session-review', `proposals-${sidShortOf(sid)}.jsonl`);
export const statePathOf = (kRoot) => join(kRoot, 'audit', 'session-review-state.jsonl');
export const manifestPathOf = (kRoot, sid) => join(kRoot, 'audit', 'distill-manifest', `${sidShortOf(sid)}.jsonl`);
/** 提案指纹：`op|target|section|before|after` 的稳定指纹（复用 `supply-ledger.fingerprintOf`，不另造哈希）。 */
export function opHashOf(p) {
    return fingerprintOf([p?.op, p?.target ?? '', p?.section ?? '', p?.before ?? '', p?.after ?? ''].join('|'));
}
/** 真字节级尾读（**不整读**）：台账实测 6 MB 级，本件每 10min 要扫一遍 ⇒ 必须走 `readTailLines`
 *  （`file-stat-cache` 按 mtimeMs+size 失效的缓存 + 末尾 ≤256KB 窗口）。 */
const tailLines = (file, n) => {
    try {
        return readTailLines(file, n).map((l) => l.replace(/\s+$/, '')).filter(Boolean);
    }
    catch {
        return [];
    }
};
/** 读本会话的复盘状态（**末行生效**：本流按 sid 追加，读数取该 sid 最后一条）。 */
export function readReviewState(d, sid) {
    const rows = tailLines(statePathOf(d.kRoot), 500);
    for (let i = rows.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(rows[i]);
            if (o.sid === sid)
                return { reviewedSeq: Number(o.reviewedSeq || 0), formatVersion: o.formatVersion, fp: o.fp };
        }
        catch { /* 坏行跳过 */ }
    }
    return null;
}
/** 触发判定（三态可分辨）。
 *  ⚠ **阈值可调**（G16 · 2026-09-19）：运行期优先取 `d.thresholds`（由配置/schema 传入，
 *  注册表缺省见 `criteria.json#trigger.review*`）；`REVIEW_DEFAULTS` 只作**注册表缺席时**的兜底
 *  （保持"另有一份默认"≠"两份事实源"：本函数不做第二套解释，只是取不到就用常数）。 */
export function decideReview(d, i) {
    const th = { ...REVIEW_DEFAULTS, ...(d.thresholds || {}) };
    const idleOk = d.now() - Number(i.lastActivityMs || 0) >= th.idleMs;
    const due = idleOk || !!i.disposed;
    if (!due)
        return { state: 'not-triggered', reason: idleOk ? 'idle' : `空闲不足（<${Math.round(th.idleMs / 60000)}min）` };
    const contentOk = Number(i.newEntries || 0) >= th.minNewEntries || Number(i.newEvents || 0) >= th.minNewEvents;
    if (!contentOk)
        return { state: 'skipped-by-threshold', reason: `内容维不足（新增条目 ${i.newEntries} / 事件 ${i.newEvents}；现任阈值 ${th.minNewEntries} 条 或 ${th.minNewEvents} 事件）` };
    return { state: 'ready', reason: i.disposed ? 'disposed' : 'idle+content' };
}
/** 材料装配：**只读**（清单流 + 失败明细 + 骨架由调用方经 S2 侧提供，本件不读会话原文）。
 *
 * ⚠ **跨档读（G13 轮转失明 · 2026-09-20 修）**：失败明细原走 `tailLines(…/ledger.jsonl, 2000)` ——
 *   **尾读只覆盖主档**，而台账轮转后**旧卷里全是历史 `distill-run` 行**（实测：主档该 kind 56 行 /
 *   旧卷 823 行）⇒ L2 复盘拿到的"失败明细"**长期只覆盖最近一小段**，早先的失败**结构性看不见**。
 *   ⇒ 现改为 `readLedgerVolumes`（跨档、按时间序）+ 只对**本 sid** 的行取明细；
 *     行量由「末 N 行」改为「全档过滤」，因过滤条件已极窄（`kind==='distill-run' && sid===本会话`）。
 *   判据：`scripts/check-ledger-read.mjs` 源码面硬门。 */
export function buildMaterials(d, sid, skeleton = []) {
    const manifest = tailLines(manifestPathOf(d.kRoot, sid), 400);
    const failures = [];
    for (const l of readLedgerVolumes(join(d.kRoot, 'audit', 'ledger.jsonl'))) {
        try {
            const o = JSON.parse(l);
            if (o.kind !== 'distill-run' || o.sid !== sid)
                continue;
            const fi = Array.isArray(o.failedItems) ? o.failedItems : [];
            for (const f of fi)
                failures.push(`${String(f.k || '')} ${String(f.target || '')}§${String(f.section || '')} ${String(f.reason || '')}`.trim());
        }
        catch { /* 坏行跳过 */ }
    }
    const sk = skeleton.slice(0, 80);
    return { manifest, failures, skeleton: sk, counts: { manifest: manifest.length, failures: failures.length, skeleton: sk.length } };
}
/** 已存在的提案指纹（幂等判定用；只读末尾若干行）。 */
export function existingOpHashes(d, sid) {
    const s = new Set();
    for (const l of tailLines(proposalPathOf(d.bankRoot, sid), 500)) {
        try {
            const o = JSON.parse(l);
            if (o.opHash)
                s.add(String(o.opHash));
        }
        catch { /* 坏行跳过 */ }
    }
    return s;
}
/** 追加提案（**append-only**，幂等：同 `(sid, reviewedSeq, opHash)` 第二次即跳过）。 */
export function appendProposals(d, sid, reviewedSeq, proposals, extra = {}) {
    const seen = existingOpHashes(d, sid);
    const file = proposalPathOf(d.bankRoot, sid);
    let appended = 0, skipped = 0;
    for (const p of proposals) {
        const h = opHashOf(p);
        if (seen.has(h)) {
            skipped++;
            continue;
        }
        try {
            mkdirSync(dirname(file), { recursive: true });
            appendFileSync(file, JSON.stringify({ at: new Date(d.now()).toISOString(), sid, reviewedSeq, opHash: h, ...extra, ...p }) + '\n', 'utf8');
            seen.add(h);
            appended++;
        }
        catch (e) {
            d.log(`session-review: 提案落盘失败（跳过该条）：${String(e?.message || e).slice(0, 80)}`);
            skipped++;
        }
    }
    return { appended, skipped };
}
/** 推进状态（**只在真正产出后**调用；与水位同纪律）。 */
export function writeReviewState(d, sid, reviewedSeq, extra = {}) {
    try {
        mkdirSync(dirname(statePathOf(d.kRoot)), { recursive: true });
        appendFileSync(statePathOf(d.kRoot), JSON.stringify({ sid, reviewedSeq, at: new Date(d.now()).toISOString(), type: 'session-review-state', ...extra }) + '\n', 'utf8');
    }
    catch (e) {
        d.log(`session-review: 状态写失败（水位不前移，下轮重试）：${String(e?.message || e).slice(0, 80)}`);
    }
}
/**
 * 跑一次会话级复盘：判定 → 材料 → 提案落盘 → 状态推进 → 审计一行（**三态之一**）。
 * 「复盘」这一步（LLM）由调用方注入 `review`（材料进、提案出）——本件因此**可单测**，且不自己读会话原文。
 */
export async function runSessionReview(d, input, review) {
    const dec = decideReview(d, input);
    const prev = readReviewState(d, input.sid);
    // 本次覆盖到的水位（调用方 = S2 侧，知道本会话当前 lastSeq）；未给则记 0。
    const curSeq = Number(input.reviewedSeq ?? 0);
    const reviewedSeq = Number(prev?.reviewedSeq || 0);
    const base = { state: dec.state === 'ready' ? 'reviewed' : dec.state, reason: dec.reason, appended: 0, skipped: 0, counts: { manifest: 0, failures: 0, skeleton: 0, proposals: 0 }, reviewedSeq };
    // **已复盘过同一水位 ⇒ no-op**（防同一段被反复送 LLM：幂等的第二道门，第一道是 opHash 去重）
    if (curSeq > 0 && prev && curSeq <= reviewedSeq) {
        d.audit({ kind: 'session-review', sid: input.sid, state: 'reviewed', reason: `already-reviewed:${curSeq}`, reviewedSeq: curSeq, appended: 0, skipped: 0 });
        return { ...base, reason: 'already-reviewed', reviewedSeq: curSeq };
    }
    if (dec.state !== 'ready') {
        d.audit({ kind: 'session-review', sid: input.sid, state: dec.state, reason: dec.reason, reviewedSeq });
        return base;
    }
    const m = buildMaterials(d, input.sid, input.skeleton);
    base.counts.manifest = m.counts.manifest;
    base.counts.failures = m.counts.failures;
    base.counts.skeleton = m.counts.skeleton;
    let proposals = [];
    try {
        proposals = (await review({ manifest: m.manifest, failures: m.failures, skeleton: m.skeleton })) || [];
    }
    catch (e) {
        // 复盘失败 ⇒ **水位不前移**（下轮重试；与 L1 同款断点续传）
        d.audit({ kind: 'session-review', sid: input.sid, state: 'error', reason: `复盘失败：${String(e?.message || e).slice(0, 80)}`, reviewedSeq, ...m.counts });
        return { ...base, state: 'reviewed', reason: 'error', counts: { ...base.counts, proposals: 0 } };
    }
    const w = appendProposals(d, input.sid, curSeq, proposals, { formatVersion: input.fp, fp: input.fp });
    base.appended = w.appended;
    base.skipped = w.skipped;
    base.reviewedSeq = curSeq;
    base.counts.proposals = proposals.length;
    if (w.appended > 0)
        writeReviewState(d, input.sid, curSeq, { formatVersion: input.fp, fp: input.fp });
    d.audit({ kind: 'session-review', sid: input.sid, state: 'reviewed', reason: dec.reason, reviewedSeq: curSeq, appended: w.appended, skipped: w.skipped, ...m.counts, proposals: proposals.length });
    return base;
}
//# sourceMappingURL=session-review.js.map