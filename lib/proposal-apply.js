// proposal-apply.ts — **S3 侧执行 L2 校正提案**（S2S3 册二 · 关闭 G3 的执行面）
//
// 由来：册一的 L2 会话级复盘**只产提案**（`<bank>/audit/session-review/proposals-<sid>.jsonl`，
//   append-only、执行权留 S3 —— 见 `session-review.ts` 抬头）；本件是那条流的**唯一消费者**。
//
// 分工与不变量：
//   · **执行权只在 S3**（本件由 `deepsleep-run` 调用），L2 侧永不改库 ⇒ 不撞 S2「只增不改历史」；
//   · 写路径**只用唯一写入原语**（`section-rewrite#editFileUnderLock`：库锁 + 唯一 tmp + 原子 rename + 写后回读）；
//   · **先留档再改**（`rollback/<opHash>.json` 存被改行原文）⇒ 「可还原」不是口头的；
//   · **幂等**：`(sid, opHash)` 记进 `applied.jsonl`，复跑即 no-op（G3 的第三半）；
//   · **fail-closed 默认关闭**：只有显式 `SHOUCANG_PROPOSAL_APPLY=1` 才执行 —— 与 release 同族理由：
//     执行面一旦默认开，就在生产上**改写用户库**；本项目的规矩是"接线上线、启用须显式"。
//
// 支持范围（**如实划定，不假装全支持**）：
//   · `revise` —— **逐字行级校正**：`before` 必须在目标文件里**逐字命中**（同 `distill-write` 的 replace 语义），
//      命中 ⇒ 用 `after` 替换该行；未命中 ⇒ 跳过并记「陈旧提案」。**不做模糊匹配**（模糊匹配 = 误改风险）。
//   · `settle` —— **承诺结算**（册二 · 2026-09-20 · `docs/promise-settlement-plan.md` §5）：
//      `before` 必须在**承诺记录**里逐字命中其 `text`（与 revise **同一套逐字语义**，不为承诺另立规则）；
//      命中唯一 ⇒ 走 `relation-ring#settleCommitment`（**证据门在册一，执行面不重复实现**）+ 同批落环事件。
//      **只结不建**：提案试图新增/删除承诺 ⇒ 拒。
//   · `merge` / `demote` —— **显式不执行**（需要成对取证与结构担保，属后续批次）；跳过时**逐条留理由**，绝不静默。
//   · `mainline` —— 不是库写入（会话主线），记 `not-a-write` 跳过。
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { editFileUnderLock, atomicWriteFile } from './section-rewrite.js';
import { loadStore, saveStoreRecords, recordStorePath, RECORD_DIR } from './record-shadow.js';
import { settleCommitment } from './relation-ring.js';
import { eventsFromDiff, parseEvents, serializeEvents, RING_EVENT_FILE } from './ring-events.js';
export const proposalDirOf = (bankRoot) => join(String(bankRoot), 'audit', 'session-review');
/** 已执行账（幂等键来源；只增不改）。 */
export const appliedLedgerOf = (bankRoot) => join(proposalDirOf(bankRoot), 'applied.jsonl');
/** 回滚留档目录（每 op 一份 JSON，含被改行原文）。 */
export const rollbackDirOf = (bankRoot) => join(proposalDirOf(bankRoot), 'rollback');
const readLines = (p) => {
    try {
        return readFileSync(p, 'utf8').split(/\r?\n/);
    }
    catch {
        return [];
    }
};
const jsonRows = (p) => {
    const out = [];
    for (const l of readLines(p)) {
        if (!l.trim())
            continue;
        try {
            out.push(JSON.parse(l));
        }
        catch { /* 坏行跳过 */ }
    }
    return out;
};
/** 已执行的 `opHash` 集合（幂等判据的**唯一**来源）。 */
export function appliedHashes(bankRoot) {
    const s = new Set();
    for (const r of jsonRows(appliedLedgerOf(bankRoot))) {
        const h = String(r.opHash || '');
        if (h)
            s.add(h);
    }
    return s;
}
/** 待执行提案（全部 `proposals-<sid>.jsonl` 减已执行）。 */
export function readPendingProposals(bankRoot) {
    const dir = proposalDirOf(bankRoot);
    if (!existsSync(dir))
        return [];
    const done = appliedHashes(bankRoot);
    const out = [];
    for (const f of readdirSync(dir)) {
        if (!/^proposals-.*\.jsonl$/.test(f))
            continue;
        for (const r of jsonRows(join(dir, f))) {
            const p = r;
            if (!p || !p.opHash || done.has(p.opHash))
                continue;
            out.push(p);
        }
    }
    return out;
}
/** 目标路径必须在库根内（**路径穿越防线**：`../` 与绝对路径一律拒）。 */
export function insideBank(bankRoot, rel) {
    const root = resolve(String(bankRoot));
    const p = resolve(root, String(rel || ''));
    if (p !== root && !p.startsWith(root + sep))
        return null;
    return p;
}
/**
 * 执行一批 L2 提案。**fail-closed**：`enabled !== true` ⇒ 零写入、零留档、零账行。
 * `maxPerRun`（缺省 3）与 release 同口径：单轮上限，超出留待下轮。
 */
export function applySessionProposals(d, proposals = readPendingProposals(d.bankRoot)) {
    const reasons = [];
    const verdicts = [];
    if (!d.enabled) {
        return { ran: false, applied: 0, skipped: proposals.length, reasons: ['提案执行**默认关闭**（设 SHOUCANG_PROPOSAL_APPLY=1 才执行）⇒ 本轮零写入'], verdicts: proposals.map((p) => ({ opHash: p.opHash, op: p.op, verdict: 'skipped', reason: 'disabled' })) };
    }
    const max = Math.max(1, Number(d.maxPerRun) || 3);
    let applied = 0, skipped = 0;
    /* 册二：`settle` 是**记录层**写入（store + 事件流），不是文件写入 ⇒ 与 revise 分批处理。
     *   为什么要攒批：多条结算在同一次 load/save 内完成（与 `ring-commit` 同一配方），
     *   避免"逐条读改写"造成的中间态与重复 I/O。 */
    const settles = [];
    for (const p of proposals.slice(0, max)) {
        const op = String(p.op || '');
        if (op === 'settle') {
            settles.push(p);
            continue;
        }
        if (op !== 'revise') {
            /* 未实现 / 非写入：**逐条留理由**（"没做"必须可见 —— 沉默的跳过等于假绿）。 */
            const why = op === 'mainline' ? 'mainline 不是库写入（会话主线，由 L2 侧审计承载）' : `${op} 尚未实现（需成对取证与结构担保，属后续批次）`;
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)} ${op}：${why}`);
            verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: why });
            continue;
        }
        const rel = String(p.target || '');
        const abs = insideBank(d.bankRoot, rel);
        if (!abs) {
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)}：目标路径越出库根（拒执行）：${rel}`);
            verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: 'path-outside-bank' });
            continue;
        }
        if (!existsSync(abs)) {
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)}：目标文件不存在：${rel}`);
            verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: 'no-such-file' });
            continue;
        }
        const before = String(p.before || '').trim();
        const after = String(p.after || '').trim();
        if (!before || !after) {
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)}：revise 缺 before/after（拒执行）`);
            verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: 'missing-before-after' });
            continue;
        }
        /* **陈旧提案**：`before` 必须逐字命中**当下**内容 —— 命中行才替换（不做模糊匹配）。 */
        const linesNow = readLines(abs);
        const hit = linesNow.filter((l) => l.trim() === before).length;
        if (hit !== 1) {
            skipped++;
            const why = hit === 0 ? '陈旧提案：before 在当下文件中逐字未命中（库已变）' : `歧义：before 命中 ${hit} 处（需唯一）`;
            reasons.push(`${p.opHash.slice(0, 8)}：${why}`);
            verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: why });
            continue;
        }
        /* **先留档再改**：回滚文件写失败 ⇒ 不改（可还原优先于"改成功"）。 */
        try {
            const rb = join(rollbackDirOf(d.bankRoot), `${String(p.opHash).replace(/[^\w.-]/g, '_')}.json`);
            mkdirSync(dirname(rb), { recursive: true });
            appendFileSync(rb, JSON.stringify({ at: new Date().toISOString(), sid: p.sid, opHash: p.opHash, file: rel, before, why: p.why || '' }) + '\n', 'utf8');
        }
        catch (e) {
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)}：留档失败 ⇒ 拒改（${String(e?.message || e).slice(0, 60)}）`);
            verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: 'rollback-write-failed' });
            continue;
        }
        const w = editFileUnderLock(d.bankRoot, abs, (lines) => {
            const i = lines.findIndex((l) => l.trim() === before);
            if (i < 0)
                return null;
            const indent = (lines[i].match(/^\s*/) || [''])[0];
            const next = lines.slice();
            next[i] = indent + after;
            return next;
        }, { note: `l2-proposal ${String(p.opHash).slice(0, 8)}` });
        if (!w.ok || !w.changed) {
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)}：写入未生效（${w.error || 'no-change'}${w.refused ? ' · 库锁被占用' : ''}）`);
            verdicts.push({ opHash: p.opHash, op, verdict: 'skipped', reason: w.refused ? 'lock-refused' : 'write-failed' });
            continue;
        }
        try {
            appendFileSync(appliedLedgerOf(d.bankRoot), JSON.stringify({ at: new Date().toISOString(), sid: p.sid, opHash: p.opHash, op, file: rel, section: p.section || '' }) + '\n', 'utf8');
        }
        catch { /* 账行失败不回滚已成功的改写（下一次同 opHash 会重复执行一次 —— 记在 reasons 里，不静默） */
            reasons.push(`${p.opHash.slice(0, 8)}：⚠ 应用账落盘失败（幂等键未记，可能重复执行）`);
        }
        applied++;
        verdicts.push({ opHash: p.opHash, op, verdict: 'applied', reason: 'revise（逐字命中 ⇒ 已改 + 已留档）' });
        d.log(`proposal-apply: ${rel} 已按 L2 提案校正（${p.opHash.slice(0, 8)}）`);
    }
    /* ── 册二：**结算批次**（记录层）──────────────────────────────────────────────
     *   配方与 `ring-commit` **逐字一致**：改纯函数 → 先事件流（不可变历史）→ 后 store（当前状态）。
     *   证据门**不在本层**（册一已在 `settleCommitment` 内，单一实现）——本层只做
     *   目标定位（逐字唯一）+ 留档 + 幂等账。
     *   ⚠ 实现落**模块级** `runSettleBatch`：本函数受函数跨度棘轮（400 行债权基线 0）约束；
     *     与 `runSupersedeChannel` 同一处置（就地内联会破线）。 */
    if (settles.length) {
        const s = runSettleBatch(d, settles);
        applied += s.applied;
        skipped += s.skipped;
        reasons.push(...s.reasons);
        verdicts.push(...s.verdicts);
    }
    return { ran: true, applied, skipped, reasons, verdicts };
}
/**
 * **承诺结算批次**（册二 · 2026-09-20）——记录层写入的**唯一落点**。
 *
 * 四道门（与 revise 同规格，**判据不重复实现在本层**）：
 *   ① **库须已建**（`loadStore` 对缺失 root 不报错，而 `saveStoreRecords` 会把目录建出来
 *      ⇒ 若 root 指错，会**凭空造出一个游离事实源**；同 `ring-commit` 的拒绝口径）；
 *   ② **逐字唯一命中**（`before` == 承诺 `text`；0 命中 ⇒ 陈旧，多命中 ⇒ 歧义，均拒，不猜）；
 *   ③ **先留档再改**（`settle-rollback.jsonl` 含被改承诺原文；留档失败 ⇒ **整批拒改**）；
 *   ④ **只结不建 + 不扩状态枚举**（`after` 只接受 `kept|broken`）。
 * 证据门在册一（`settleCommitment`）——本层遇到拒绝时**如实转述理由**，不自行判断"算不算有证据"。
 */
function runSettleBatch(d, settles) {
    const reasons = [];
    const verdicts = [];
    let applied = 0, skipped = 0;
    const storePath = recordStorePath(d.bankRoot);
    const rejectAll = (why, reason) => {
        for (const p of settles) {
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)}：${why}`);
            verdicts.push({ opHash: p.opHash, op: 'settle', verdict: 'skipped', reason });
        }
        return { applied, skipped, reasons, verdicts };
    };
    if (!existsSync(storePath))
        return rejectAll(`影子库未建（${RECORD_DIR}/ 不存在）⇒ 结算拒执行`, 'no-store');
    const cur = loadStore(d.bankRoot);
    if (cur.error)
        return rejectAll(`影子库不可用（${cur.error}）⇒ 结算拒执行`, 'store-unreadable');
    let records = cur.records;
    const before = cur.records;
    const archiveRows = [];
    for (const p of settles) {
        const match = String(p.before || '').trim();
        const status = String(p.after || '').trim();
        if (status !== 'kept' && status !== 'broken') {
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)}：settle 的 after 只能是 kept|broken（**不扩状态枚举**）：收到 ${JSON.stringify(status).slice(0, 20)}`);
            verdicts.push({ opHash: p.opHash, op: 'settle', verdict: 'skipped', reason: 'bad-status' });
            continue;
        }
        if (!match) {
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)}：settle 缺 before（目标承诺原文）⇒ 拒`);
            verdicts.push({ opHash: p.opHash, op: 'settle', verdict: 'skipped', reason: 'missing-before' });
            continue;
        }
        /* **逐字唯一命中**：与 revise 同一套语义（不做模糊匹配）。多命中 ⇒ 歧义拒；0 命中 ⇒ 陈旧拒。 */
        const hits = records.filter((r) => r.kind === 'commitment' && String(r.text).trim() === match);
        if (hits.length !== 1) {
            skipped++;
            const why = hits.length === 0 ? '陈旧提案：承诺原文在当下库中逐字未命中（库已变）' : `歧义：承诺原文命中 ${hits.length} 条（需唯一）`;
            reasons.push(`${p.opHash.slice(0, 8)}：${why}`);
            verdicts.push({ opHash: p.opHash, op: 'settle', verdict: 'skipped', reason: hits.length === 0 ? 'stale' : 'ambiguous' });
            continue;
        }
        const target = hits[0];
        const r = settleCommitment(records, target.id, {
            status: status,
            evidence: String(p.evidence || ''),
            settledBy: p.settledBy ?? 'agent-proposal',
            note: p.why || '',
            at: new Date().toISOString(),
        });
        if (!r.ok) {
            // 册一的证据门在此生效（**本层不重复实现判据**，只如实转述理由）
            skipped++;
            reasons.push(`${p.opHash.slice(0, 8)}：${r.reason}`);
            verdicts.push({ opHash: p.opHash, op: 'settle', verdict: 'skipped', reason: 'settle-refused' });
            continue;
        }
        archiveRows.push(JSON.stringify({ at: new Date().toISOString(), opHash: p.opHash, sid: p.sid, id: target.id, status, evidence: p.evidence || '', before: target.text }));
        records = r.records;
        applied++;
        verdicts.push({ opHash: p.opHash, op: 'settle', verdict: 'applied', reason: `承诺结算为 ${status}（逐字唯一命中 + 册一证据门通过）` });
    }
    if (!archiveRows.length)
        return { applied, skipped, reasons, verdicts };
    // ③ **先留档再改**：留档失败 ⇒ 整批拒改（可还原优先于"改成功"）
    try {
        const rb = join(rollbackDirOf(d.bankRoot), 'settle-rollback.jsonl');
        mkdirSync(dirname(rb), { recursive: true });
        appendFileSync(rb, archiveRows.join('\n') + '\n', 'utf8');
    }
    catch (e) {
        for (const v of verdicts.filter((x) => x.op === 'settle' && x.verdict === 'applied')) {
            v.verdict = 'skipped';
            v.reason = 'rollback-write-failed';
        }
        applied -= archiveRows.length;
        skipped += archiveRows.length;
        reasons.push(`结算留档失败 ⇒ 整批拒改（未写库）：${String(e?.message || e).slice(0, 80)}`);
        return { applied, skipped, reasons, verdicts };
    }
    // ④ 先事件流（不可变历史）后 store（当前状态）——顺序与 CLI / ring-commit 一致
    const evPath = join(d.bankRoot, RECORD_DIR, RING_EVENT_FILE);
    const prev = existsSync(evPath) ? parseEvents(readFileSync(evPath, 'utf8')) : [];
    const evs = eventsFromDiff(before, records, new Date().toISOString(), prev.length + 1);
    if (evs.length) {
        mkdirSync(join(d.bankRoot, RECORD_DIR), { recursive: true });
        // **原子写**（复用唯一写入原语；事件流是不可变历史，半写即脏账 ⇒ 不用裸 writeFileSync）
        const w = atomicWriteFile(evPath, serializeEvents(prev.concat(evs)));
        if (!w.ok) {
            for (const v of verdicts.filter((x) => x.op === 'settle' && x.verdict === 'applied')) {
                v.verdict = 'skipped';
                v.reason = 'event-write-failed';
            }
            applied -= archiveRows.length;
            skipped += archiveRows.length;
            reasons.push(`事件流写入失败 ⇒ 整批拒改（未写库）：${w.error || ''}`);
            return { applied, skipped, reasons, verdicts };
        }
    }
    saveStoreRecords(d.bankRoot, records);
    for (const p of settles) {
        const v = verdicts.find((x) => x.opHash === p.opHash && x.op === 'settle');
        if (v?.verdict !== 'applied')
            continue;
        try {
            appendFileSync(appliedLedgerOf(d.bankRoot), JSON.stringify({ at: new Date().toISOString(), sid: p.sid, opHash: p.opHash, op: 'settle' }) + '\n', 'utf8');
        }
        catch {
            reasons.push(`${p.opHash.slice(0, 8)}：⚠ 应用账落盘失败（幂等键未记，可能重复执行）`);
        }
    }
    return { applied, skipped, reasons, verdicts };
}
//# sourceMappingURL=proposal-apply.js.map