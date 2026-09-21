// eval-ledger.ts — 评估通道**判定落账**（M2 · 2026-09-21 · ACT-283）
//
// ## 为什么需要独立一件
// 会审 edge 的 **E-02（归因塌缩）** 是本方案最重的技术发现：本仓 `vec.ts:240-260` 把六类失败
//   **全部塌缩成 `return null`**，归因只看配置位（`recall-diagnosis.ts:42`）⇒ 真机 `missReason`
//   分布里 **`embed-off` = 0**，「调了但失败」与「没调」**在账上同形**。
//   而本审查（册五）要求账能答**四问**：谁做的 / 置信度多少 / 有无回落 / **去向哪里**。
//   ⇒ 落账必须**分态**，且**形状固定**（否则又成"字段级约定"）。
//
// ## 为什么不新开 `.jsonl` 流
// 会审 impl 的 **B6** + `check-observability` 头注：观测流登记表**只许减不许增**，
//   新开流会被该门判 FAIL。⇒ 并入既有统一台账 `knowledgeRoot()/audit/ledger.jsonl`，
//   以 `type` 区分（与 `mcl.*` / `score.shadow` / `activation.shadow` 同法）。
//
// ## 零依赖 / 零 IO 边界
// 本件**只拼行**（纯函数）——`appendFileSync` 由调用方注入（同 `mcl.ts` 的 `hooks.audit` 形态），
//   故可独立断言、不碰盘。
//
// ⚠ **只落形态不落内容**（沿 `yield-rounds.jsonl` 的既有隐私决定，该决定已被
//   `check-journal-privacy.mjs:91-101` 机检钉死）：state 原文与题目原文**一律不入账**，
//   只落 `state_chars` + `state_sha8`（供"同一材料是否被发过"对账）+ 题类型名。
import { createHash } from 'node:crypto';
/** `state` 的 sha8（不可逆；只作对账，不泄内容） */
export const stateSha8Of = (state) => createHash('sha256').update(String(state || ''), 'utf8').digest('hex').slice(0, 8);
/** 由 host 字符串判定 loopback（**不含端口/协议**，故与 `isLoopbackUrl` 互补而非重复） */
export const isLoopbackHost = (host) => {
    const h = String(host || '').trim().toLowerCase();
    if (!h)
        return false;
    if (h === 'localhost' || h === '[::1]' || h === '::1')
        return true;
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    return m ? Number(m[1]) === 127 : false;
};
/** 从端点 URL 取 host（取不到 ⇒ 空串，**不抛**） */
export const hostOf = (url) => {
    try {
        return new URL(String(url || '').trim()).hostname.toLowerCase();
    }
    catch {
        return '';
    }
};
/** 由 state + 题表构造"形态"三件（**只算形态，绝不带内容**） */
export function shapeOf(state, qTypes) {
    return {
        stateChars: String(state || '').length,
        stateSha8: stateSha8Of(state),
        qCount: qTypes.length,
        qTypes: [...new Set(qTypes.map(String))].sort(),
    };
}
/** 从各题 confidence 取聚合（最小值，保守口径）；全无 ⇒ null */
export function confidenceMinOf(answers) {
    if (!answers)
        return null;
    const vals = Object.values(answers).map((a) => a.confidence).filter((v) => typeof v === 'number' && Number.isFinite(v));
    return vals.length ? Math.min(...vals) : null;
}
/**
 * 拼一条落账事件（**纯函数**）。返回的对象可直接交给 `envelopeEvent(o, 'eval.decision')`。
 * 语义纪律：`type` 用 `eval.decision`（与 `mcl.*` / `score.shadow` 同族命名法）。
 */
export function decisionEventOf(r) {
    return {
        type: 'eval.decision',
        source: r.source,
        tier: r.tier,
        outcome: r.outcome,
        why: String(r.why || '').slice(0, 120),
        modelId: String(r.modelId || '').slice(0, 120),
        destHost: String(r.destHost || '').slice(0, 120),
        destLoopback: !!r.destLoopback,
        stateChars: Math.max(0, Number(r.stateChars) || 0),
        stateSha8: String(r.stateSha8 || ''),
        qCount: Math.max(0, Number(r.qCount) || 0),
        qTypes: Array.isArray(r.qTypes) ? r.qTypes.slice(0, 8) : [],
        confidenceMin: (typeof r.confidenceMin === 'number' && Number.isFinite(r.confidenceMin)) ? r.confidenceMin : null,
        fellBack: !!r.fellBack,
        latencyMs: Math.max(0, Number(r.latencyMs) || 0),
        sid: String(r.sid || '').slice(0, 16),
        point: String(r.point || '').slice(0, 40),
    };
}
/** 从台账**行数组**折统计（纯函数；行解析失败即跳过，不抛）。
 *  `recentN > 0` 时附最近 N 条**明细**（M4；明细里同样**不含内容**——本件从不读 state 原文）。 */
export function statsOfLines(lines, recentN = 0) {
    const byOutcome = {};
    const bySource = {};
    const rows = [];
    let egressOk = 0, fellBack = 0, total = 0;
    for (const l of lines) {
        const s = String(l || '').trim();
        if (!s)
            continue;
        let o;
        try {
            o = JSON.parse(s);
        }
        catch {
            continue;
        }
        if (String(o.type || '') !== 'eval.decision')
            continue;
        total++;
        const oc = String(o.outcome || 'unknown');
        byOutcome[oc] = (byOutcome[oc] || 0) + 1;
        const src = String(o.source || 'unknown');
        bySource[src] = (bySource[src] || 0) + 1;
        if (oc === 'ok' && o.destLoopback === false)
            egressOk++;
        if (o.fellBack === true)
            fellBack++;
        if (recentN > 0) {
            rows.push({
                at: String(o.at || ''),
                source: src,
                tier: String(o.tier || ''),
                outcome: oc,
                why: String(o.why || '').slice(0, 60),
                modelId: String(o.modelId || ''),
                destHost: String(o.destHost || ''),
                destLoopback: o.destLoopback === true,
                qCount: Number(o.qCount) || 0,
                confidenceMin: typeof o.confidenceMin === 'number' ? o.confidenceMin : null,
                fellBack: o.fellBack === true,
                latencyMs: Number(o.latencyMs) || 0,
                point: String(o.point || ''),
            });
        }
    }
    // 取**最近** N 条（台账 append-only ⇒ 尾部即最新）
    const recent = recentN > 0 ? rows.slice(-recentN) : [];
    return { byOutcome, bySource, egressOk, fellBack, total, recent };
}
/* ══ 阈值（M2 册四）· **随档切换**，不共用一套 ════════════════════════════════
 * 判因（会审 edge 的 B5/E-16 + 官方文档实读）：**只有 TypeSafe 是 native**（原生校准概率），
 *   OpenAI/Anthropic/Google 走**适配器**，官方原文明确：
 *     「Boolean answers contain **prompted estimates** of P(true) … **These estimates are not
 *      guaranteed to be calibrated.**」「Choice and Score answers **do not include probability distributions**.」
 *   ⇒ **A 档（native）与 B 档（adapter）不得共用一套阈值**——B 档的 confidence 只能作**弱信号**。
 */
export const EVAL_THRESHOLDS = {
    /** native 档（TypeSafe）：可用校准概率 ⇒ 阈值可按本库样本校准 */
    native: { high: 0.9, low: 0.5 },
    /** adapter/本地档：**无真概率** ⇒ 阈值只能保守（宁可回落，不可误采信） */
    weak: { high: 0.95, low: 0.7 },
};
/** 该档是否提供**原生校准概率**（决定用哪套阈值） */
export const isCalibratedTier = (tier) => String(tier) === 'native';
/**
 * 按**档位能力**给判定分档（M2 册四核心）：
 *   · `native`（有校准概率）→ 用 `native` 阈值；
 *   · 其余（无概率）→ 用 `weak` 阈值；**且 confidence 缺失一律 `review`**（绝不"无置信即放行"）。
 * ⚠ fail-closed：非 `ok` 的 outcome **一律 `reject`**（调用方据此回落，**不得静默采信**）。
 */
export function evaluateGateOf(o) {
    if (o.outcome !== 'ok')
        return { gate: 'reject', why: `outcome:${o.outcome}` };
    const thr = isCalibratedTier(o.tier) ? EVAL_THRESHOLDS.native : EVAL_THRESHOLDS.weak;
    if (typeof o.confidence !== 'number' || !Number.isFinite(o.confidence)) {
        // 无置信度 ⇒ **不可放行**（本仓纪律：未判不得改变行为）
        return { gate: 'review', why: isCalibratedTier(o.tier) ? 'no-confidence' : 'no-confidence-uncalibrated' };
    }
    if (o.confidence >= thr.high)
        return { gate: 'accept', why: `conf>=${thr.high}` };
    if (o.confidence >= thr.low)
        return { gate: 'review', why: `conf>=${thr.low}` };
    return { gate: 'reject', why: `conf<${thr.low}` };
}
//# sourceMappingURL=eval-ledger.js.map